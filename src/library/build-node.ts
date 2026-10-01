/// <reference types="node" />
/**
 * Node-only half of the library build: read the manifest and the source files from disk, run the pure build
 * (src/library/build.ts), and write `<outDir>/<lang>/…`. The new library is written beside the old one and moved into
 * place only when the build succeeded, so a failed or fully refused build never damages an earlier good one.
 * Not imported by the browser bundle. No network access anywhere.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LanguageCode } from '../core';
import { createAdapterRegistry } from '../adapters';
import { createFileLexiconSource } from '../dict/file';
import { buildLibrary, parseBuildManifest, LibraryBuildError, type BuildIO, type BuildOptions, type BuildResult } from './build';

export interface BuildFilesOptions {
  lang: LanguageCode;
  manifestFile: string;
  /** Directory the manifest's `source.file` paths are relative to. */
  inDir: string;
  outDir: string;
  /** YYYY-MM-DD */
  date: string;
  /** A built dictionary directory (`<dir>/<lang>/manifest.json`) to analyse with. */
  dictDir?: string;
  inspect?: BuildOptions['inspect'];
  progress?: (message: string) => void;
}

export interface BuildFilesResult extends BuildResult {
  /** `<outDir>/<lang>` */
  dir: string;
  files: number;
  bytes: number;
}

export async function buildLibraryFiles(opts: BuildFilesOptions): Promise<BuildFilesResult> {
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(opts.manifestFile, 'utf8')); }
  catch (e) { throw new LibraryBuildError(`cannot read the manifest ${opts.manifestFile}: ${e instanceof Error ? e.message : String(e)}`); }
  const manifest = parseBuildManifest(raw, opts.lang);

  const root = path.resolve(opts.inDir);
  const dir = path.join(opts.outDir, opts.lang);
  const staging = path.join(opts.outDir, `.${opts.lang}.building-${process.pid}`);
  fs.rmSync(staging, { recursive: true, force: true });

  let files = 0, bytes = 0;
  const io: BuildIO = {
    async readSource(file) {
      const full = path.resolve(root, file);
      if (full !== root && !full.startsWith(root + path.sep)) return undefined; // never outside the input directory
      let buf: Buffer;
      try { buf = fs.readFileSync(full); } catch { return undefined; }
      return { text: buf.toString('utf8'), sha256: crypto.createHash('sha256').update(buf).digest('hex') };
    },
    write(relative, content) {
      const target = path.join(staging, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
      files++;
      bytes += Buffer.byteLength(content);
    },
  };

  try {
    const dict = opts.dictDir ? createFileLexiconSource(opts.dictDir, opts.lang) : undefined;
    const result = await buildLibrary({
      lang: opts.lang, manifest, io, adapters: createAdapterRegistry(), date: opts.date, inspect: opts.inspect, progress: opts.progress,
      lexicon: dict ? (l) => (l === opts.lang ? dict : undefined) : undefined,
    });
    fs.mkdirSync(opts.outDir, { recursive: true });
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(staging, dir);
    return { ...result, dir, files, bytes };
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw e;
  }
}
