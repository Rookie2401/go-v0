/// <reference types="node" />
/**
 * npm run dict:build-forms -- [--langs de,es,hi,la,sq,th] [--src public/dict] [--out public/dict] [--buckets N]
 *
 * Builds the slim forms index (src/dict/forms.ts) from the built dictionary shards: for every entry key `form` the lemma
 * and part of speech it belongs to (the entry's form-of lemmas, else the entry itself), at most 6 rows per form.
 *
 * Then, when <src>/<lang>/full/ exists, the inflection tables of its records add the forms the entries lack (German
 * "Klassenkämpfen"): each single-word table form, normalized the way the dictionary keys are, points at [written lemma, pos],
 * after the rows the entries gave. A language without full/ keeps the entries-only index.
 *
 * Reads <src>/<lang>/manifest.json and every shard it names, ONE SHARD AT A TIME (a shard is parsed, its entries are added
 * to the accumulator, and it is dropped). Writes <out>/<lang>/forms/manifest.json and f-<hex>.json; the bucket count is
 * chosen per language so that no shard exceeds about 300 kB raw (override: --buckets). The previous forms/ directory is
 * replaced; the dictionary itself is never touched. The output lives under public/dict/, which is git-ignored.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createAdapterRegistry } from '../src/adapters';
import { LANGUAGES, type LanguageCode } from '../src/core';
import { parseManifest, parseShard } from '../src/dict/format';
import { parseFullManifest, parseFullShard } from '../src/dict/full-format';
import { parseFullShard2 } from '../src/dict/full2';
import { latinNormalize } from '../src/dict/latin-normalize';
import { FORMS_DIR, FORMS_MANIFEST, FORMS_SHARD_MAX_BYTES, FORMS_VERSION, createFormsBuilder, formsShardFile, isTableForm, type FormsManifest } from '../src/dict/forms';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined; };
const USAGE = 'usage: npm run dict:build-forms -- [--langs de,es,hi,la,sq,th] [--src public/dict] [--out public/dict] [--buckets N]';
if (args.includes('--help')) { console.log(USAGE); process.exit(0); }
const known = new Set(['langs', 'src', 'out', 'buckets', 'help']);
const bad = args.filter((a) => a.startsWith('--') && !known.has(a.slice(2)));
if (bad.length) { console.error(`unknown option ${bad[0]}\n${USAGE}`); process.exit(2); }

const src = opt('src') ?? 'public/dict';
const out = opt('out') ?? src;
const langs = (opt('langs')?.split(',').map((s) => s.trim()).filter(Boolean) ?? ['de', 'es', 'hi', 'la', 'sq', 'th']) as LanguageCode[];
const unknownLang = langs.find((l) => !(LANGUAGES as readonly string[]).includes(l));
if (unknownLang) { console.error(`unknown language ${unknownLang}\n${USAGE}`); process.exit(2); }
const fixedBuckets = opt('buckets') === undefined ? undefined : Number(opt('buckets'));
if (fixedBuckets !== undefined && (!Number.isInteger(fixedBuckets) || fixedBuckets < 1 || fixedBuckets > 4096)) { console.error(`--buckets must be an integer 1..4096\n${USAGE}`); process.exit(2); }

const mb = (n: number) => (n / 1e6).toFixed(1);
const kb = (n: number) => `${(n / 1e3).toFixed(0)} kB`;
let peakHeap = 0;
const sample = () => { peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed); };

function build(lang: LanguageCode): boolean {
  const t0 = Date.now();
  peakHeap = 0;
  const dir = path.join(src, lang);
  const mFile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(mFile)) { console.log(`forms ${lang}: no dictionary manifest at ${mFile}, skipped`); return true; }
  const dm = parseManifest(JSON.parse(fs.readFileSync(mFile, 'utf8')) as unknown, lang);
  if (!dm) { console.error(`forms ${lang}: ${mFile} is not a readable dictionary manifest`); return false; }

  const builder = createFormsBuilder();
  let entries = 0;
  for (const name of dm.shardFiles) {
    const shard = parseShard(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as unknown, lang, dm);
    for (const list of shard.values()) for (const e of list) { entries++; builder.add(e); }
    sample();
  }

  // the inflection tables of the full records
  let tableRecords = 0;
  const fullDir = path.join(src, lang, 'full');
  const fmFile = path.join(fullDir, 'manifest.json');
  const formsBefore = builder.size;
  if (fs.existsSync(fmFile)) {
    const fm = parseFullManifest(JSON.parse(fs.readFileSync(fmFile, 'utf8')) as unknown, lang);
    if (!fm) console.warn(`forms ${lang}: ${fmFile} is not a readable full manifest: inflection tables skipped`);
    else {
      // the same key rule the dictionary build used (src/dict/build-node.ts)
      const adapter = lang === ('la' as LanguageCode) ? undefined : createAdapterRegistry().get(lang);
      const normalize = lang === ('la' as LanguageCode) ? latinNormalize : (x: string) => adapter!.normalize(x);
      for (const name of fm.shardFiles) {
        let bytes: Buffer = fs.readFileSync(path.join(fullDir, name));
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = zlib.gunzipSync(bytes);
        const raw = JSON.parse(bytes.toString('utf8')) as unknown;
        const shard = fm.schema === 'full-2' ? parseFullShard2(raw, fm.strings ?? []) : parseFullShard(raw);
        for (const records of shard.values()) {
          for (const r of records) {
            if (!r.f?.length) continue;
            tableRecords++;
            for (const form of r.f) if (isTableForm(form)) builder.addTable(normalize(form.f), r.w, r.p ?? null);
          }
        }
        sample();
      }
    }
  } else console.log(`forms ${lang}: no full/ records, so no inflection tables`);
  const tableOnlyForms = builder.size - formsBefore;

  const { buckets, shards, forms, lemmas, fromTables, bytes: shardBytes, maxShardBytes } = builder.finish(fixedBuckets);
  const formsDir = path.join(out, lang, FORMS_DIR);
  fs.rmSync(formsDir, { recursive: true, force: true });
  fs.mkdirSync(formsDir, { recursive: true });
  const shardFiles: string[] = [];
  for (const b of [...shards.keys()].sort((x, y) => x - y)) {
    const name = formsShardFile(b, buckets);
    fs.writeFileSync(path.join(formsDir, name), shards.get(b)!);
    shardFiles.push(name);
  }
  const manifest: FormsManifest = { version: FORMS_VERSION, lang, buckets, forms, lemmas, fromTables, shardFiles, builtFrom: dm.id };
  const mText = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(formsDir, FORMS_MANIFEST), mText); // the manifest goes last: a reader that sees it finds its shards
  sample();
  console.log(
    `forms ${lang}: ${entries.toLocaleString('en-US')} dictionary entries, ${forms.toLocaleString('en-US')} forms, ${lemmas.toLocaleString('en-US')} lemmas, ${fromTables.toLocaleString('en-US')} table rows (${tableOnlyForms.toLocaleString('en-US')} new forms, ${tableRecords.toLocaleString('en-US')} records with tables), `
    + `${buckets} buckets (${shardFiles.length} shards, largest ${kb(maxShardBytes)}), ${mb(shardBytes + Buffer.byteLength(mText))} MB, `
    + `${((Date.now() - t0) / 1000).toFixed(1)} s, peak heap ${mb(peakHeap)} MB`,
  );
  if (maxShardBytes > FORMS_SHARD_MAX_BYTES) console.warn(`forms ${lang}: the largest shard is over ${kb(FORMS_SHARD_MAX_BYTES)}; use more buckets (--buckets)`);
  return true;
}

let ok = true;
for (const lang of langs) { if (!build(lang)) ok = false; }
process.exit(ok ? 0 : 1);
