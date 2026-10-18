/// <reference types="node" />
/**
 * Node-only: turn a built full-2 folder into its gzip-at-rest form (`f-xx.json.gz`, manifest `gzip: true`) or back into
 * plain JSON. The records, the `rev` and every other manifest field are unchanged (rev hashes the shard TEXT, so both forms
 * share it). Used by `npm run dict:publish -- --full-shards gzip` and by tests. full-1 folders have no such form.
 *
 * Why two forms: gzip at rest is what a host that serves bytes (GitHub Pages, a static bucket) should store: the German
 * set is ~139 MB plain and ~30 MB gzipped. A host that content-encodes by itself (Caddy with `precompressed`, see
 * infra/repository/Caddyfile.dict) can store the gzip and still answer the plain URL; a client that stores a shard as text
 * (the browser extension's shard cache) needs the plain URL, so the plain form is what the tree keeps under public/dict.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { FULL_SCHEMA_2, FULL_SHARD_FILE, fullManifestText, fullShardName, parseFullManifest, occupiedBuckets } from './full-format';
import type { LanguageCode } from '../core';

export interface RepackResult { files: number; bytesIn: number; bytesOut: number; gzip: boolean }

/** Write the full-2 folder `srcDir` (a `<lang>/full` folder) to `dstDir` stored gzipped or plain. Returns what it did; throws on a non-full-2 or damaged folder. */
export function repackFull(srcDir: string, dstDir: string, gzip: boolean, lang: LanguageCode): RepackResult {
  const manifestFile = path.join(srcDir, 'manifest.json');
  const raw = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as unknown;
  const m = parseFullManifest(raw, lang);
  if (!m) throw new Error(`${manifestFile} is not a usable full manifest for ${lang}`);
  if (m.schema !== FULL_SCHEMA_2 || !m.occupied) throw new Error(`${manifestFile} is ${m.schema}: only full-2 folders can be repacked`);
  fs.mkdirSync(dstDir, { recursive: true });
  for (const n of fs.readdirSync(dstDir)) if (n === 'manifest.json' || FULL_SHARD_FILE.test(n)) fs.rmSync(path.join(dstDir, n));
  let files = 0, bytesIn = 0, bytesOut = 0;
  for (const b of occupiedBuckets(m.occupied, m.buckets)) {
    const from = path.join(srcDir, fullShardName(b, m.buckets, m.gzip === true));
    const bytes = fs.readFileSync(from);
    const text = bytes[0] === 0x1f && bytes[1] === 0x8b ? zlib.gunzipSync(bytes) : bytes;
    const out = gzip ? zlib.gzipSync(text, { level: 9 }) : text;
    fs.writeFileSync(path.join(dstDir, fullShardName(b, m.buckets, gzip)), out);
    files++; bytesIn += bytes.length; bytesOut += out.length;
  }
  fs.writeFileSync(path.join(dstDir, 'manifest.json'), fullManifestText({ ...m, gzip }), 'utf8');
  return { files, bytesIn, bytesOut, gzip };
}
