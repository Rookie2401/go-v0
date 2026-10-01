/// <reference types="node" />
/**
 * Node-only half of the dictionary build: stream a JSON-Lines file through the pure builder (the real kaikki
 * extract is ~50 MB; it is never read whole) and write `<outDir>/<lang>/manifest.json` + shards.
 * Not imported by the browser bundle.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { LanguageCode } from '../core';
import { createAdapterRegistry } from '../adapters';
import { createDictionaryBuilder, type BuildOutput } from './build';

export interface BuildFileOptions {
  input: string;
  lang: LanguageCode;
  outDir: string;
  /** YYYY-MM-DD; the only clock the build uses. */
  date: string;
  normalize?: (surface: string) => string;
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

export async function buildDictionaryFile(opts: BuildFileOptions): Promise<BuildFileResult> {
  const adapter = opts.normalize ? undefined : createAdapterRegistry().get(opts.lang);
  const normalize = opts.normalize ?? ((s: string) => adapter!.normalize(s));
  const builder = createDictionaryBuilder({ lang: opts.lang, normalize });
  const rl = readline.createInterface({ input: fs.createReadStream(opts.input, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) builder.addLine(line);
  const out = builder.finish(opts.date);
  if (out.stats.entries === 0) throw new Error('no usable entries in the input (nothing written)');
  const dir = path.join(opts.outDir, opts.lang);
  fs.mkdirSync(dir, { recursive: true });
  clearPreviousBuild(dir);
  for (const [name, text] of out.files) fs.writeFileSync(path.join(dir, name), text, 'utf8');
  return { ...out, dir };
}
