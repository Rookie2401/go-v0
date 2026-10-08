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
import { COURSES, courseReads, createMemoryStore, type LanguageCode, type Work } from '../core';
import { createAdapterRegistry } from '../adapters';
import { createCourseCatalog } from '../course';
import { createFileLexiconSource } from '../dict/file';
import { loadBundledCorpus } from '../ingest';
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

/** Windows scanners can briefly hold a newly written directory open. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(from, to); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
}

/** The course catalogue's works of a language, by work id: what the build carries onto every text (streams, domains). */
export async function catalogueWorksOf(lang: LanguageCode): Promise<Map<string, Work>> {
  const store = createMemoryStore();
  const catalog = createCourseCatalog({ store });
  const out = new Map<string, Work>();
  for (const course of COURSES.filter((c) => courseReads(c, lang))) {
    await catalog.install(course.id);
    for (const w of await store.works.where('courseId', course.id)) out.set(w.id, w);
  }
  return out;
}

export async function buildLibraryFiles(opts: BuildFilesOptions): Promise<BuildFilesResult> {
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(opts.manifestFile, 'utf8')); }
  catch (e) { throw new LibraryBuildError(`cannot read the manifest ${opts.manifestFile}: ${e instanceof Error ? e.message : String(e)}`); }
  const manifest = parseBuildManifest(raw, opts.lang);

  const root = path.resolve(opts.inDir);
  const outputRoot = path.resolve(opts.outDir);
  const dir = path.join(outputRoot, opts.lang);
  const staging = path.join(outputRoot, `.${opts.lang}.building-${process.pid}`);
  const previous = path.join(outputRoot, `.${opts.lang}.previous-${process.pid}`);
  for (const target of [dir, staging, previous]) {
    const relative = path.relative(outputRoot, path.resolve(target));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new LibraryBuildError('library output must stay inside the selected output directory');
  }
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
    const works = await catalogueWorksOf(opts.lang);
    const dict = opts.dictDir ? createFileLexiconSource(opts.dictDir, opts.lang) : undefined;
    const result = await buildLibrary({
      lang: opts.lang, manifest, io, adapters: createAdapterRegistry(), date: opts.date, inspect: opts.inspect, progress: opts.progress,
      catalogue: (id) => works.get(id),
      lexicon: dict ? (l) => (l === opts.lang ? dict : undefined) : undefined,
      bundledTextIds: new Set(loadBundledCorpus().filter((d) => d.lang === opts.lang).map((d) => `text:${d.lang}:${d.id}`)),
    });
    fs.mkdirSync(opts.outDir, { recursive: true });
    const hadPrevious = fs.existsSync(dir);
    if (hadPrevious) await renameWithRetry(dir, previous);
    try { await renameWithRetry(staging, dir); }
    catch (error) {
      if (hadPrevious) await renameWithRetry(previous, dir);
      throw error;
    }
    if (hadPrevious) fs.rmSync(previous, { recursive: true, force: true });
    return { ...result, dir, files, bytes };
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw e;
  }
}
