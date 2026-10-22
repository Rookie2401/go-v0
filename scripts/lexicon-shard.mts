/// <reference types="node" />
/**
 * npm run lexicon:shard -- [--set el/ancient|el/modern|he/biblical|he/modern|all] [--limit 4000000] [--no-gzip]
 *
 * Cuts a form index too large for a page to carry whole into SHARDS a host loads on demand (src/adapters/shared/shards.ts, with the
 * Greek and Hebrew wrappers). A key goes to the shard of the longest listed prefix of its LETTERS (Greek: bare letters, diacritics
 * removed, final sigma folded; Hebrew: consonants, final letters folded); prefixes start at one letter and are split into two and
 * three while a shard's JSON would exceed --limit bytes. Each shard is a complete index of its keys: the lemma rows its forms refer
 * to, the bare / consonantal map entries with the same letters, and (Greek) the cross-period links of those lemmas; the manifest
 * lists the prefixes, files and sizes. Shards are gzip-compressed by default (the loader inflates them with DecompressionStream).
 *
 * Sets (input → output folder, both under public/lexicon, git-ignored):
 *   el/ancient   el/ancient-index.json  → el/ancient/     el/modern   el/modern-index.json  → el/modern/
 *   he/biblical  he/biblical-index.json → he/biblical/    he/modern   he/modern-index.json  → he/modern/
 * Writes <out>/manifest.json and <out>/<prefix>.json[.gz]; appends a "Shards" section to the set's docs/<lang>/…-INDEX.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { GreekFormIndex } from '../src/adapters/greek/index-store';
import { shardLetters as greekLetters } from '../src/adapters/greek/shards';
import type { HebrewFormIndex } from '../src/adapters/hebrew/index-store';
import { hebrewShardLetters } from '../src/adapters/hebrew/shards';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
const flags = new Set<string>();
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) { if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) { opt[args[i].slice(2)] = args[i + 1]; i++; } else flags.add(args[i].slice(2)); } }
const LIMIT = Number(opt.limit ?? 4_000_000);
const GZIP = !flags.has('no-gzip');
const MAX_LEN = 3;

interface SetSpec { set: string; lang: 'el' | 'he'; input: string; out: string; doc: string }
const SETS: Record<string, SetSpec> = {
  'el/ancient': { set: 'el/ancient', lang: 'el', input: 'public/lexicon/el/ancient-index.json', out: 'public/lexicon/el/ancient', doc: 'docs/greek/ANCIENT-INDEX.md' },
  'el/modern': { set: 'el/modern', lang: 'el', input: 'public/lexicon/el/modern-index.json', out: 'public/lexicon/el/modern', doc: 'docs/greek/MODERN-INDEX.md' },
  'he/biblical': { set: 'he/biblical', lang: 'he', input: 'public/lexicon/he/biblical-index.json', out: 'public/lexicon/he/biblical', doc: 'docs/hebrew/BIBLICAL-INDEX.md' },
  'he/modern': { set: 'he/modern', lang: 'he', input: 'public/lexicon/he/modern-index.json', out: 'public/lexicon/he/modern', doc: 'docs/hebrew/MODERN-INDEX.md' },
};
const chosen = (opt.set ?? 'all') === 'all' ? Object.values(SETS) : [SETS[opt.set]];
if (chosen.some((s) => !s)) { console.error(`--set must be one of ${Object.keys(SETS).join(', ')} or all`); process.exit(1); }

function shardSet(spec: SetSpec): void {
  if (!fs.existsSync(spec.input)) { console.warn(`${spec.set}: ${spec.input} is not built; skipped`); return; }
  console.log(`${spec.set}: reading ${spec.input} …`);
  const index = JSON.parse(fs.readFileSync(spec.input, 'utf8')) as GreekFormIndex | HebrewFormIndex;
  const lettersOf = spec.lang === 'el' ? greekLetters : hebrewShardLetters;
  const sideMapName = spec.lang === 'el' ? 'bare' : 'consonantal';
  const sideMap = ((index as unknown as Record<string, Record<string, string[]>>)[sideMapName] ?? {});
  const keys = Object.keys(index.forms);
  console.log(`  ${keys.length.toLocaleString('en')} form keys, ${Object.keys(index.lemmas).length.toLocaleString('en')} lemmas, ${Object.keys(sideMap).length.toLocaleString('en')} ${sideMapName} entries`);

  // the letters of every key and the serialized weight of each key's rows (what a shard's size is made of)
  const letters = new Map<string, string>();
  const weight = new Map<string, number>();
  for (const k of keys) { letters.set(k, lettersOf(k)); weight.set(k, k.length + 4 + JSON.stringify((index.forms as Record<string, unknown>)[k]).length); }
  for (const [b, list] of Object.entries(sideMap)) { const k = `\u0000side:${b}`; letters.set(k, lettersOf(b)); weight.set(k, b.length + 4 + JSON.stringify(list).length); }

  // the prefixes: split while over the limit, down to MAX_LEN letters; a key's weight is counted under every prefix it would fall in
  const byDepth: Array<Map<string, number>> = [new Map(), new Map(), new Map(), new Map()];
  for (const [k, l] of letters) { const w = weight.get(k)!; for (let d = 1; d <= MAX_LEN; d++) { const p = l.slice(0, d) || '_'; byDepth[d].set(p, (byDepth[d].get(p) ?? 0) + w); if (l.length < d) break; } }
  const prefixes = new Set<string>(['_']);
  const split = (prefix: string, depth: number): void => {
    prefixes.add(prefix);
    if ((byDepth[depth].get(prefix) ?? 0) <= LIMIT || depth >= MAX_LEN) return;
    for (const p of [...byDepth[depth + 1].keys()].filter((p) => p.startsWith(prefix) && p.length === depth + 1).sort()) split(p, depth + 1);
  };
  for (const p of [...byDepth[1].keys()].filter((p) => p !== '_').sort()) split(p, 1);
  const longest = Math.max(...[...prefixes].map((p) => p.length));
  const prefixOf = (l: string): string => { for (let n = Math.min(longest, l.length); n >= 1; n--) { const p = l.slice(0, n); if (prefixes.has(p)) return p; } return '_'; };

  // assign and write
  const groups = new Map<string, { forms: Record<string, unknown>; side: Record<string, string[]> }>();
  for (const p of prefixes) groups.set(p, { forms: {}, side: {} });
  for (const k of keys) groups.get(prefixOf(letters.get(k)!))!.forms[k] = (index.forms as Record<string, unknown>)[k];
  for (const [b, list] of Object.entries(sideMap)) groups.get(prefixOf(lettersOf(b)))!.side[b] = list;

  fs.rmSync(spec.out, { recursive: true, force: true });
  fs.mkdirSync(spec.out, { recursive: true });
  const { lemmas: _l, forms: _f, stats: _s, ...head } = index as unknown as Record<string, unknown> & { lemmas: unknown; forms: unknown; stats?: unknown };
  delete (head as Record<string, unknown>)[sideMapName];
  delete (head as Record<string, unknown>).links;
  const manifest = { ...head, schema: 1 as const, shards: {} as Record<string, { file: string; bytes: number; keys: number }>, stats: { shards: 0, keys: keys.length, lemmas: Object.keys(index.lemmas).length, plainBytes: 0, bytes: 0 } };
  const links = (index as GreekFormIndex).links;
  let empty = 0;
  for (const p of [...prefixes].sort()) {
    const g = groups.get(p)!;
    const formKeys = Object.keys(g.forms);
    if (!formKeys.length && !Object.keys(g.side).length) { empty++; continue; }
    const lemmas: Record<string, unknown> = {};
    const shardLinks: Record<string, string[]> = {};
    for (const k of formKeys) for (const row of g.forms[k] as Array<[string, ...unknown[]]>) {
      const id = spec.lang === 'he' ? row[0].split('/').pop()!.replace(/\+$/, '') : row[0];
      if (!lemmas[id] && (index.lemmas as Record<string, unknown>)[id]) lemmas[id] = (index.lemmas as Record<string, unknown>)[id];
      if (links?.[id] && !shardLinks[id]) shardLinks[id] = links[id];
    }
    const shard = { ...head, shard: p, lemmas, forms: g.forms, [sideMapName]: g.side, ...(Object.keys(shardLinks).length ? { links: shardLinks } : {}) };
    const plain = JSON.stringify(shard);
    const file = `${p}.json${GZIP ? '.gz' : ''}`;
    const bytes = GZIP ? zlib.gzipSync(plain, { level: 9 }) : Buffer.from(plain);
    fs.writeFileSync(path.join(spec.out, file), bytes);
    manifest.shards[p] = { file, bytes: bytes.length, keys: formKeys.length };
    manifest.stats.shards++; manifest.stats.plainBytes += plain.length; manifest.stats.bytes += bytes.length;
  }
  fs.writeFileSync(path.join(spec.out, 'manifest.json'), JSON.stringify(manifest));
  const sizes = Object.values(manifest.shards).map((s) => s.bytes).sort((a, b) => b - a);
  const line = `${manifest.stats.shards} shards (${empty} empty prefixes dropped), ${(manifest.stats.bytes / 1e6).toFixed(1)} MB ${GZIP ? 'gzipped' : 'plain'} (${(manifest.stats.plainBytes / 1e6).toFixed(1)} MB plain); largest ${(sizes[0] / 1e6).toFixed(2)} MB, median ${(sizes[Math.floor(sizes.length / 2)] / 1e6).toFixed(2)} MB; longest prefix ${longest}`;
  console.log(`  ${line}`);
  if (fs.existsSync(spec.doc)) {
    const doc = `
## Shards (${new Date().toISOString().slice(0, 10)})

\`npm run lexicon:shard -- --set ${spec.set}\` cuts this index into ${manifest.stats.shards} shards under \`${spec.out}/\` (git-ignored), ${(manifest.stats.bytes / 1e6).toFixed(1)} MB
${GZIP ? 'gzipped' : 'plain'} against ${(manifest.stats.plainBytes / 1e6).toFixed(1)} MB plain, largest ${(sizes[0] / 1e6).toFixed(2)} MB, prefixes of up to ${longest} ${spec.lang === 'el' ? 'bare letters' : 'consonants'} (a key goes to
the longest listed prefix of its letters; '_' holds the keys with no letter of the script). A host loads the shards of the keys it is about to
read (src/adapters/shared/shards.ts; Biblia per chapter, the extension's content script before a lookup); a paradigm or the Variants tab
shows what the loaded shards hold and says so.
`;
    const cur = fs.readFileSync(spec.doc, 'utf8').replace(/\n## Shards \([^\n]*\)[\s\S]*$/, '');
    fs.writeFileSync(spec.doc, cur + doc);
  }
}

for (const spec of chosen) shardSet(spec);
