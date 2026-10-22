/// <reference types="node" />
/**
 * npm run el:shard-ancient -- [--in public/lexicon/el/ancient-index.json] [--out public/lexicon/el/ancient] [--limit 1500000] [--no-gzip]
 *
 * Cuts the Ancient Greek form index (123 MB of JSON, too large for a page to carry whole) into SHARDS a host loads on demand
 * (src/adapters/greek/shards.ts). A key goes to the shard of the longest listed prefix of its BARE letters (diacritics removed,
 * final sigma folded); prefixes start at one letter and are split into two and three letters while a shard's JSON would exceed
 * --limit bytes. Each shard is a complete GreekFormIndex of its keys: the lemma rows its forms refer to, the bare map entries
 * with the same letters, and the cross-period links of those lemmas; the manifest lists the prefixes, files and sizes. Shards
 * are gzip-compressed by default (about 11.8 MB in all against 123 MB plain; the loader inflates them with DecompressionStream).
 *
 * Writes <out>/manifest.json and <out>/<prefix>.json[.gz]; reports the shard sizes in docs/greek/ANCIENT-INDEX.md (appended section).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { GreekFormIndex } from '../src/adapters/greek/index-store';
import { shardLetters } from '../src/adapters/greek/shards';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt: Record<string, string> = {};
const flags = new Set<string>();
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) { if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) { opt[args[i].slice(2)] = args[i + 1]; i++; } else flags.add(args[i].slice(2)); } }
const IN = opt.in ?? 'public/lexicon/el/ancient-index.json';
const OUT = opt.out ?? 'public/lexicon/el/ancient';
const LIMIT = Number(opt.limit ?? 1_500_000);
const GZIP = !flags.has('no-gzip');
const MAX_LEN = 3;

console.log(`reading ${IN} …`);
const index = JSON.parse(fs.readFileSync(IN, 'utf8')) as GreekFormIndex;
const keys = Object.keys(index.forms);
console.log(`${keys.length.toLocaleString('en')} form keys, ${Object.keys(index.lemmas).length.toLocaleString('en')} lemmas`);

// the letters of every key, and the serialized weight of each key's rows (what a shard's size is made of)
const letters = new Map<string, string>();
const weight = new Map<string, number>();
for (const k of keys) { letters.set(k, shardLetters(k)); weight.set(k, k.length + 4 + JSON.stringify(index.forms[k]).length); }
for (const [b, list] of Object.entries(index.bare)) { const l = shardLetters(b); const w = b.length + 4 + JSON.stringify(list).length; const k = `\u0000bare:${b}`; letters.set(k, l); weight.set(k, w); }

// the prefixes: split while over the limit, down to MAX_LEN letters
const prefixes = new Set<string>();
function weightOf(prefix: string, depth: number): number {
  let total = 0;
  for (const [k, l] of letters) if (l.slice(0, depth) === prefix) total += weight.get(k)!;
  return total;
}
function split(prefix: string, depth: number): void {
  const w = weightOf(prefix, depth);
  if (w <= LIMIT || depth >= MAX_LEN) { prefixes.add(prefix); return; }
  const next = new Set<string>();
  for (const [, l] of letters) if (l.slice(0, depth) === prefix && l.length > depth) next.add(l.slice(0, depth + 1));
  prefixes.add(prefix); // keys whose letters end at this depth stay here
  for (const p of [...next].sort()) split(p, depth + 1);
}
const first = new Set<string>();
for (const [, l] of letters) first.add(l.slice(0, 1) || '_');
for (const p of [...first].sort()) { if (p === '_') prefixes.add('_'); else split(p, 1); }
prefixes.add('_');
const longest = Math.max(...[...prefixes].map((p) => p.length));
const prefixOf = (l: string): string => { for (let n = Math.min(longest, l.length); n >= 1; n--) { const p = l.slice(0, n); if (prefixes.has(p)) return p; } return '_'; };

// assign and write
const groups = new Map<string, { forms: Record<string, GreekFormIndex['forms'][string]>; bare: Record<string, string[]> }>();
for (const p of prefixes) groups.set(p, { forms: {}, bare: {} });
for (const k of keys) groups.get(prefixOf(letters.get(k)!))!.forms[k] = index.forms[k];
for (const [b, list] of Object.entries(index.bare)) groups.get(prefixOf(shardLetters(b)))!.bare[b] = list;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const manifest = { schema: 1 as const, id: index.id, codes: index.codes, period: index.period, source: index.source, built: index.built, shards: {} as Record<string, { file: string; bytes: number; keys: number }>, stats: { shards: 0, keys: keys.length, lemmas: Object.keys(index.lemmas).length, plainBytes: 0, bytes: 0 } };
let empty = 0;
for (const p of [...prefixes].sort()) {
  const g = groups.get(p)!;
  const formKeys = Object.keys(g.forms);
  if (!formKeys.length && !Object.keys(g.bare).length) { empty++; continue; }
  const lemmas: GreekFormIndex['lemmas'] = {};
  const links: Record<string, string[]> = {};
  for (const k of formKeys) for (const row of g.forms[k]) { const id = row[0]; if (!lemmas[id] && index.lemmas[id]) lemmas[id] = index.lemmas[id]; if (index.links?.[id] && !links[id]) links[id] = index.links[id]; }
  const shard: GreekFormIndex = { schema: 1, id: index.id, codes: index.codes, period: index.period, shard: p, source: index.source, built: index.built, lemmas, forms: g.forms, bare: g.bare, ...(Object.keys(links).length ? { links } : {}) };
  const plain = JSON.stringify(shard);
  const file = `${p === '_' ? '_' : p}.json${GZIP ? '.gz' : ''}`;
  const bytes = GZIP ? zlib.gzipSync(plain, { level: 9 }) : Buffer.from(plain);
  fs.writeFileSync(path.join(OUT, file), bytes);
  manifest.shards[p] = { file, bytes: bytes.length, keys: formKeys.length };
  manifest.stats.shards++; manifest.stats.plainBytes += plain.length; manifest.stats.bytes += bytes.length;
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
const sizes = Object.values(manifest.shards).map((s) => s.bytes).sort((a, b) => b - a);
console.log(`${manifest.stats.shards} shards (${empty} empty prefixes dropped), ${(manifest.stats.bytes / 1e6).toFixed(1)} MB ${GZIP ? 'gzipped' : 'plain'} (${(manifest.stats.plainBytes / 1e6).toFixed(1)} MB plain); largest ${(sizes[0] / 1e6).toFixed(2)} MB, median ${(sizes[Math.floor(sizes.length / 2)] / 1e6).toFixed(2)} MB; longest prefix ${longest}`);

const doc = `
## Shards (${new Date().toISOString().slice(0, 10)})

\`npm run el:shard-ancient\` cuts this index into ${manifest.stats.shards} shards under \`${OUT}/\` (git-ignored), ${(manifest.stats.bytes / 1e6).toFixed(1)} MB
${GZIP ? 'gzipped' : 'plain'} against ${(manifest.stats.plainBytes / 1e6).toFixed(1)} MB plain, largest ${(sizes[0] / 1e6).toFixed(2)} MB, prefixes of up to ${longest} bare letters (a key goes to the longest
listed prefix of its diacritic-free letters; '_' holds the keys with no Greek letter). A host loads the shards of the keys it is about to read
(src/adapters/greek/shards.ts: Biblia does so per chapter, keeping at most 48 shards in memory); a paradigm or the Variants tab shows what
the loaded shards hold and says so.
`;
const docPath = 'docs/greek/ANCIENT-INDEX.md';
if (fs.existsSync(docPath)) { const cur = fs.readFileSync(docPath, 'utf8').replace(/\n## Shards \([^\n]*\)[\s\S]*$/, ''); fs.writeFileSync(docPath, cur + doc); console.log(`appended the shard section to ${docPath}`); }
