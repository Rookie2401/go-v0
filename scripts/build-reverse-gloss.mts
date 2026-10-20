/// <reference types="node" />
/**
 * npm run dict:build-reverse -- [--langs de,es,hi,sq,th] [--src public/dict] [--out public/dict]
 *
 * Builds the English -> target-language reverse index (src/dict/reverse.ts) from the built dictionary shards: for every
 * lemma entry (inflected forms, which carry a form-of relation, are left out) the English heads of its first three glosses
 * point back at the lemma. Frequency ranks come from the entry, else from the frequency sidecar (frequency.json).
 *
 * Reads <src>/<lang>/manifest.json and every shard it names, ONE SHARD AT A TIME (a shard is parsed, its entries are added
 * to the accumulator, and it is dropped); the accumulator keeps at most a few dozen candidates per head, so memory stays
 * far below the size of the dictionary. Writes <out>/<lang>/reverse/manifest.json and r-<hex>.json (64 buckets for
 * de and es, 16 for the others). The previous reverse/ directory is replaced; the dictionary itself is never touched.
 * The output lives under public/dict/, which is git-ignored, like the dictionary shards it is derived from.
 */
import fs from 'node:fs';
import path from 'node:path';
import { LANGUAGES, type LanguageCode } from '../src/core';
import { parseManifest, parseShard } from '../src/dict/format';
import { FREQUENCY_FILE, parseFrequencyText } from '../src/dict/frequency';
import { REVERSE_DIR, REVERSE_MANIFEST, REVERSE_VERSION, createReverseBuilder, reverseShardName, type ReverseManifest } from '../src/dict/reverse';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined; };
const USAGE = 'usage: npm run dict:build-reverse -- [--langs de,es,hi,sq,th] [--src public/dict] [--out public/dict]';
if (args.includes('--help')) { console.log(USAGE); process.exit(0); }
const known = new Set(['langs', 'src', 'out', 'help']);
const bad = args.filter((a) => a.startsWith('--') && !known.has(a.slice(2)));
if (bad.length) { console.error(`unknown option ${bad[0]}\n${USAGE}`); process.exit(2); }

const src = opt('src') ?? 'public/dict';
const out = opt('out') ?? src;
const langs = (opt('langs')?.split(',').map((s) => s.trim()).filter(Boolean) ?? ['de', 'es', 'hi', 'sq', 'th']) as LanguageCode[];
const unknownLang = langs.find((l) => !(LANGUAGES as readonly string[]).includes(l));
if (unknownLang) { console.error(`unknown language ${unknownLang}\n${USAGE}`); process.exit(2); }

const mb = (n: number) => (n / 1e6).toFixed(1);
let peakHeap = 0;
const sample = () => { peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed); };

function build(lang: LanguageCode): boolean {
  const t0 = Date.now();
  const dir = path.join(src, lang);
  const mFile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(mFile)) { console.log(`reverse ${lang}: no dictionary manifest at ${mFile}, skipped`); return true; }
  const dm = parseManifest(JSON.parse(fs.readFileSync(mFile, 'utf8')) as unknown, lang);
  if (!dm) { console.error(`reverse ${lang}: ${mFile} is not a readable dictionary manifest`); return false; }
  const freqFile = path.join(dir, FREQUENCY_FILE);
  const freq = fs.existsSync(freqFile) ? parseFrequencyText(fs.readFileSync(freqFile, 'utf8'), lang) : undefined;

  const builder = createReverseBuilder();
  let entries = 0, inflected = 0, indexed = 0, withRank = 0;
  for (const name of dm.shardFiles) {
    const shard = parseShard(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as unknown, lang, dm);
    for (const list of shard.values()) {
      // A frequency rank belongs to a lemma SPELLING, parts of speech merged: "ese" (rank 61) is the demonstrative, not the
      // interjection "hello". The rank therefore goes only to the entries of the part of speech listed first (the source
      // lists the main reading first); the others are ranked as unknown.
      const firstPos = list.find((e) => !e.formOf?.length && e.glosses.length)?.pos;
      for (const e of list) {
        entries++;
        if (e.formOf?.length) { inflected++; continue; }
        if (!e.glosses.length) continue;
        const rank = e.frequencyRank ?? (e.pos === firstPos ? freq?.get(e.written ?? e.form)?.rank ?? null : null);
        if (builder.add(e, rank) > 0) { indexed++; if (rank !== null) withRank++; }
      }
    }
    sample();
  }

  const buckets = lang === 'de' || lang === 'es' ? 64 : 16;
  const { shards, heads } = builder.finish(buckets);
  const reverseDir = path.join(out, lang, REVERSE_DIR);
  fs.rmSync(reverseDir, { recursive: true, force: true });
  fs.mkdirSync(reverseDir, { recursive: true });
  let bytes = 0;
  const shardFiles: string[] = [];
  for (const b of [...shards.keys()].sort((x, y) => x - y)) {
    const name = reverseShardName(b, buckets);
    const text = JSON.stringify(shards.get(b));
    fs.writeFileSync(path.join(reverseDir, name), text);
    bytes += Buffer.byteLength(text);
    shardFiles.push(name);
  }
  const manifest: ReverseManifest = { version: REVERSE_VERSION, lang, buckets, heads, shardFiles, builtFrom: dm.id };
  const mText = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(reverseDir, REVERSE_MANIFEST), mText); // the manifest goes last: a reader that sees it finds its shards
  bytes += Buffer.byteLength(mText);
  sample();
  console.log(
    `reverse ${lang}: ${entries.toLocaleString('en-US')} dictionary entries (${inflected.toLocaleString('en-US')} inflected, skipped), `
    + `${indexed.toLocaleString('en-US')} lemmas indexed (${withRank.toLocaleString('en-US')} with a rank), ${heads.toLocaleString('en-US')} heads, `
    + `${shardFiles.length} shards, ${mb(bytes)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} s, peak heap ${mb(peakHeap)} MB`,
  );
  return true;
}

let ok = true;
for (const lang of langs) { if (!build(lang)) ok = false; }
process.exit(ok ? 0 : 1);
