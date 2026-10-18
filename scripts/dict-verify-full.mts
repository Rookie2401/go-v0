/// <reference types="node" />
/**
 * npm run dict:verify-full -- <lang> [--old <root>] [--new <root>] [--lemma <word>]
 *
 * Does a rebuilt full-record dictionary (typically schema full-2) carry EXACTLY the same records as the one it replaces
 * (typically full-1)? Reads every shard of both (`<root>/<lang>/full/`, either schema, gzipped or not), compares every
 * lemma key and every record, checks that every key sits in the bucket its hash says, and prints the before/after table:
 * records, bytes (shard text), bytes on disk, the largest shard, and the cold-fetch bytes of a typical lemma (the manifest
 * plus the one shard its lookup needs, as stored and as it travels gzipped). Exit 1 on any difference.
 *
 * Both sides stream one hash partition at a time (old and new bucket counts are multiples of 256 of the same hash, so
 * bucket mod min(buckets) is a partition both agree on): memory stays small even for the German set.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { bucketOf, fullShardName, parseFullManifest, parseFullShard, parseFullShard2, FULL_SCHEMA_2, type FullManifest, type FullRecord } from '../src/dict';
import { LANGUAGES, type LanguageCode } from '../src/core';

const args = process.argv.slice(2).filter((a) => a !== '--');
const lang = args[0] as LanguageCode;
const opt = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
if (!lang || !(LANGUAGES as readonly string[]).includes(lang)) { console.error('usage: npm run dict:verify-full -- <lang> [--old <root, default public/dict>] [--new <root>] [--lemma <word>]'); process.exit(2); }
const oldRoot = opt('old') ?? 'public/dict';
const newRoot = opt('new') ?? 'data/dictionaries/next';

interface Side { root: string; dir: string; manifest: FullManifest; manifestBytes: number; files: number; diskBytes: number; largestDisk: number; textBytes: number; largestText: number }

function sideOf(root: string): Side {
  const dir = path.join(root, lang, 'full');
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) { console.error(`no full manifest at ${file}`); process.exit(2); }
  const text = fs.readFileSync(file, 'utf8');
  const manifest = parseFullManifest(JSON.parse(text), lang);
  if (!manifest) { console.error(`${file} is not a usable full manifest for ${lang}`); process.exit(2); }
  return { root, dir, manifest, manifestBytes: Buffer.byteLength(text), files: 0, diskBytes: 0, largestDisk: 0, textBytes: 0, largestText: 0 };
}

/** The text of a shard file: gunzipped when it is gzip. */
function readText(side: Side, name: string): string {
  const bytes = fs.readFileSync(path.join(side.dir, name));
  const text = bytes[0] === 0x1f && bytes[1] === 0x8b ? zlib.gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
  side.files++;
  side.diskBytes += bytes.length;
  side.largestDisk = Math.max(side.largestDisk, bytes.length);
  const t = Buffer.byteLength(text);
  side.textBytes += t;
  side.largestText = Math.max(side.largestText, t);
  return text;
}
function loadShard(side: Side, bucket: number): Map<string, FullRecord[]> {
  const m = side.manifest;
  const name = fullShardName(bucket, m.buckets, m.gzip === true);
  if (!fs.existsSync(path.join(side.dir, name))) return new Map();
  const raw = JSON.parse(readText(side, name)) as unknown;
  return m.schema === FULL_SCHEMA_2 ? parseFullShard2(raw, m.strings ?? []) : parseFullShard(raw);
}

const a = sideOf(oldRoot);
const b = sideOf(newRoot);
const g = Math.min(a.manifest.buckets, b.manifest.buckets);
let keysA = 0, keysB = 0, recordsA = 0, recordsB = 0, differing = 0, misplaced = 0, onlyA = 0, onlyB = 0;
const examples: string[] = [];
const bucketsOf = (m: FullManifest, p: number): number[] => { const out: number[] = []; for (let x = p; x < m.buckets; x += g) out.push(x); return out; };

for (let p = 0; p < g; p++) {
  const left = new Map<string, FullRecord[]>();
  const right = new Map<string, FullRecord[]>();
  for (const x of bucketsOf(a.manifest, p)) for (const [k, v] of loadShard(a, x)) { left.set(k, v); if (bucketOf(k, a.manifest.buckets) !== x) misplaced++; }
  for (const x of bucketsOf(b.manifest, p)) for (const [k, v] of loadShard(b, x)) { right.set(k, v); if (bucketOf(k, b.manifest.buckets) !== x) misplaced++; }
  keysA += left.size; keysB += right.size;
  for (const [k, v] of left) {
    recordsA += v.length;
    const w = right.get(k);
    if (!w) { onlyA++; if (examples.length < 5) examples.push(`missing in new: ${k}`); continue; }
    if (JSON.stringify(v) !== JSON.stringify(w)) { differing++; if (examples.length < 5) examples.push(`differs: ${k}`); }
  }
  for (const [k, w] of right) { recordsB += w.length; if (!left.has(k)) { onlyB++; if (examples.length < 5) examples.push(`only in new: ${k}`); } }
}

const countsSame = JSON.stringify(a.manifest.counts) === JSON.stringify(b.manifest.counts);
const ok = !differing && !onlyA && !onlyB && !misplaced && countsSame && recordsA === recordsB && recordsA === a.manifest.counts.records;

// cold fetch of a typical lemma: --lemma, else the middle key of the old dictionary's median-sized shard (the same lemma on both sides)
function medianLemma(side: Side): string {
  const sizes = side.manifest.shardFiles.map((n) => ({ n, s: fs.statSync(path.join(side.dir, n)).size })).sort((x, y) => x.s - y.s);
  const name = sizes[Math.floor(sizes.length / 2)].n;
  const raw = JSON.parse(readText({ ...side }, name)) as unknown;
  const m = side.manifest.schema === FULL_SCHEMA_2 ? parseFullShard2(raw, side.manifest.strings ?? []) : parseFullShard(raw);
  const keys = [...m.keys()].sort();
  return keys[Math.floor(keys.length / 2)];
}
function coldFetch(side: Side, lemma: string): { shard: string; text: number; disk: number; wire: number; manifestWire: number } {
  const m = side.manifest;
  const name = fullShardName(bucketOf(lemma, m.buckets), m.buckets, m.gzip === true);
  const bytes = fs.readFileSync(path.join(side.dir, name));
  const gz = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const textLen = gz ? zlib.gunzipSync(bytes).length : bytes.length;
  const wire = gz ? bytes.length : zlib.gzipSync(bytes).length; // a host that content-encodes sends the gzip either way
  const manifestText = fs.readFileSync(path.join(side.dir, 'manifest.json'));
  return { shard: name, text: textLen, disk: bytes.length, wire, manifestWire: zlib.gzipSync(manifestText).length };
}
const lemma = opt('lemma') ?? medianLemma(a);
const ca = coldFetch(a, lemma);
const cb = coldFetch(b, lemma);

const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
const kb = (n: number) => `${(n / 1e3).toFixed(1)} KB`;
console.log(`dict:verify-full - ${lang}: ${a.manifest.schema} (${a.root}) -> ${b.manifest.schema} (${b.root})`);
console.log(`  lemma keys:      ${keysA} -> ${keysB}; records ${recordsA} -> ${recordsB} (manifest says ${a.manifest.counts.records} / ${b.manifest.counts.records})`);
console.log(`  differing keys:  ${differing}; only old ${onlyA}; only new ${onlyB}; keys in the wrong bucket ${misplaced}; manifest counts ${countsSame ? 'equal' : 'DIFFER'}`);
console.log(`  shards:          ${a.files} -> ${b.files} files (${a.manifest.buckets} -> ${b.manifest.buckets} buckets)`);
console.log(`  bytes raw:       ${mb(a.textBytes)} -> ${mb(b.textBytes)} (${(100 * (1 - b.textBytes / a.textBytes)).toFixed(1)}% smaller)`);
console.log(`  bytes on disk:   ${mb(a.diskBytes)} -> ${mb(b.diskBytes)} (${(100 * (1 - b.diskBytes / a.diskBytes)).toFixed(1)}% smaller)`);
console.log(`  largest shard:   ${kb(a.largestText)} raw / ${kb(a.largestDisk)} disk -> ${kb(b.largestText)} raw / ${kb(b.largestDisk)} disk`);
console.log(`  manifest:        ${kb(a.manifestBytes)} -> ${kb(b.manifestBytes)}`);
console.log(`  cold fetch ("${lemma}"): manifest + ${ca.shard}: ${kb(ca.manifestWire + ca.wire)} gzipped on the wire (${kb(a.manifestBytes + ca.disk)} stored) -> manifest + ${cb.shard}: ${kb(cb.manifestWire + cb.wire)} on the wire (${kb(b.manifestBytes + cb.disk)} stored)`);
if (examples.length) console.log(`  e.g. ${examples.join('; ')}`);
console.log(ok ? '  RESULT: identical records' : '  RESULT: DIFFERENT - do not replace');
process.exit(ok ? 0 : 1);
