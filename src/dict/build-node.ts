/// <reference types="node" />
/**
 * Node-only half of the dictionary build: stream a JSON-Lines file through the pure builder (the real kaikki
 * extract is ~50 MB; it is never read whole) and write `<outDir>/<lang>/manifest.json` + shards.
 * Records where the data came from (file name, sha256, line count and whatever the caller states about it).
 * Not imported by the browser bundle.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { DictionaryInfo, LanguageCode } from '../core';
import { createAdapterRegistry } from '../adapters';
import { createDictionaryBuilder, type BuildOutput } from './build';

export interface BuildFileOptions {
  input: string;
  lang: LanguageCode;
  outDir: string;
  /** YYYY-MM-DD; the only clock the build uses. */
  date: string;
  normalize?: (surface: string) => string;
  /** What the caller knows about the file; the file name, sha256 and line count are computed here. */
  source?: { url?: string; lastModified?: string; retrievedAt?: string };
}

export interface BuildFileResult extends BuildOutput {
  /** Directory the files were written to (`<outDir>/<lang>`). */
  dir: string;
}

/** Remove what an earlier build left in `dir` (manifest and shards only), so a stale shard never outlives a rebuild. */
function clearPreviousBuild(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) if (name === 'manifest.json' || /^s-[0-9a-f]{2}\.json$/.test(name)) fs.rmSync(path.join(dir, name));
}

/** sha256 of the file's bytes, streamed. */
export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => hash.update(c)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}

export async function buildDictionaryFile(opts: BuildFileOptions): Promise<BuildFileResult> {
  const adapter = opts.normalize ? undefined : createAdapterRegistry().get(opts.lang);
  const normalize = opts.normalize ?? ((s: string) => adapter!.normalize(s));
  const builder = createDictionaryBuilder({ lang: opts.lang, normalize });
  let lines = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(opts.input, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) { lines++; builder.addLine(line); }
  const source: NonNullable<DictionaryInfo['source']> = {
    ...(opts.source?.url ? { url: opts.source.url } : {}),
    file: path.basename(opts.input),
    ...(opts.source?.lastModified ? { lastModified: opts.source.lastModified } : {}),
    sha256: await sha256File(opts.input),
    ...(opts.source?.retrievedAt ? { retrievedAt: opts.source.retrievedAt } : {}),
    lines,
  };
  const out = builder.finish(opts.date, source);
  if (out.stats.entries === 0) throw new Error('no usable entries in the input (nothing written)');
  const dir = path.join(opts.outDir, opts.lang);
  fs.mkdirSync(dir, { recursive: true });
  clearPreviousBuild(dir);
  for (const [name, text] of out.files) fs.writeFileSync(path.join(dir, name), text, 'utf8');
  return { ...out, dir };
}
