/// <reference types="node" />
/**
 * Node-only half of the library build: read the manifest and the source files from disk, run the pure build
 * (src/library/build.ts), and write `<outDir>/<lang>/…`. The new library is written beside the old one and moved into
 * place only when the build succeeded, so a failed or fully refused build never damages an earlier good one.
 * Not imported by the browser bundle. No network access anywhere.
 *
 * COMPANION LANGUAGES. A course may read a second written language (`Course.readsLangs`: the Norway course reads Nynorsk, `nn`,
 * beside Bokmål, `nb`). The build manifest of the course language may then carry entries whose own `lang` is the companion
 * ("lang": "nn"). They are built with the companion's adapter into the SAME output directory, under their own language
 * prefix, and every row and document says `nn`:
 *   index/nn-<stream>-<nnnn>.json   the companion's index shards (rows with lang "nn")
 *   t/<hh>/nn-<name>.json, p/<hh>/nn-<name>.json   its documents and profiles (the rows' documentPath / profilePath say so)
 * The manifest.json of the course language keeps its own shards, counts and id exactly (so nothing that reads it for the course
 * language changes) and gains `companions`: one record per companion language with its own id, counts, shards and digest; the
 * manifest digest then also covers them. A manifest without companion entries gives byte-for-byte the output it always gave.
 * An entry whose `lang` is neither the build language nor one of its companions stops the build.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { COURSES, courseForLang, courseReads, createMemoryStore, hash, type LanguageCode, type Work } from '../core';
import { createAdapterRegistry } from '../adapters';
import { createCourseCatalog } from '../course';
import { createFileLexiconSource } from '../dict/file';
import { loadBundledCorpus } from '../ingest';
import { buildLibrary, parseBuildManifest, rightsRefusals, LibraryBuildError, type BuildEntry, type BuildIO, type BuildOptions, type BuildResult, type BuiltWork, type Refusal } from './build';
import { manifestPath, provenancePath, type LibraryManifest, type LibraryShardInfo } from './format';

/** The companion languages a build for `lang` may carry: the languages the course of `lang` also reads (none for most courses). */
export function companionLangsOf(lang: LanguageCode): LanguageCode[] {
  const course = courseForLang(lang);
  return course && course.lang === lang ? (course.readsLangs ?? []).filter((l) => l !== lang) : [];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Splits the raw build manifest of `lang`: the entries of the build language (an entry without `lang` is one of them) and, per
 * companion language, the entries whose `lang` names it. A manifest without such entries comes back as it is (same object).
 * An entry for any other language throws a LibraryBuildError naming it. Malformed manifests are left to parseBuildManifest.
 */
export function splitCompanionEntries(raw: unknown, lang: LanguageCode): { main: unknown; companions: Map<LanguageCode, unknown[]> } {
  const companions = new Map<LanguageCode, unknown[]>();
  if (!isRecord(raw) || !Array.isArray(raw.entries)) return { main: raw, companions };
  const allowed = companionLangsOf(lang);
  const own: unknown[] = [];
  raw.entries.forEach((e, i) => {
    const entryLang = isRecord(e) ? e.lang : undefined;
    if (entryLang === undefined || entryLang === lang) { own.push(e); return; }
    if (typeof entryLang === 'string' && (allowed as readonly string[]).includes(entryLang)) {
      const list = companions.get(entryLang as LanguageCode) ?? [];
      list.push(e);
      companions.set(entryLang as LanguageCode, list);
      return;
    }
    const slug = isRecord(e) && typeof e.slug === 'string' ? e.slug : String(i);
    throw new LibraryBuildError(`entries[${i}] ("${slug}") is for language "${String(entryLang)}", which is neither "${lang}" nor a companion language of its course${allowed.length ? ` (${allowed.join(', ')})` : ''}`);
  });
  return { main: companions.size ? { ...raw, entries: own } : raw, companions };
}

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

/** What the build of one companion language produced (its entries were in the course language's manifest). */
export interface CompanionBuild {
  lang: LanguageCode;
  /** The companion's own manifest (id "library-nn@date", its shards under the prefixed names); undefined when none of its entries could be built. */
  manifest?: LibraryManifest;
  built: BuiltWork[];
  refused: Refusal[];
}

export interface BuildFilesResult extends BuildResult {
  /** `<outDir>/<lang>` */
  dir: string;
  files: number;
  bytes: number;
  /** One record per companion language that had entries in the manifest (none for most courses). Their built and refused entries are also listed in `built` / `refused` with the slug prefixed "nn:". */
  companions: CompanionBuild[];
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

/** A companion's output path: its index shards, documents and profiles carry the language as a file-name prefix. */
export function companionPath(lang: LanguageCode, relative: string): string {
  if (relative.startsWith('index/')) return `index/${lang}-${relative.slice('index/'.length)}`;
  return relative.replace(/^([tp])\/([0-9a-f]{2})\/(.+)$/, `$1/$2/${lang}-$3`);
}

export async function buildLibraryFiles(opts: BuildFilesOptions): Promise<BuildFilesResult> {
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(opts.manifestFile, 'utf8')); }
  catch (e) { throw new LibraryBuildError(`cannot read the manifest ${opts.manifestFile}: ${e instanceof Error ? e.message : String(e)}`); }
  const split = splitCompanionEntries(raw, opts.lang);
  const manifest = parseBuildManifest(split.main, opts.lang);
  const companionManifests = [...split.companions].map(([lang, entries]) => ({
    lang, manifest: parseBuildManifest({ schema: (raw as { schema?: unknown }).schema, lang, entries }, lang),
  }));

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
  const writeStaged = (relative: string, content: string): void => {
    const target = path.join(staging, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
    files++;
    bytes += Buffer.byteLength(content);
  };
  const readSource: BuildIO['readSource'] = async (file) => {
    const full = path.resolve(root, file);
    if (full !== root && !full.startsWith(root + path.sep)) return undefined; // never outside the input directory
    let buf: Buffer;
    try { buf = fs.readFileSync(full); } catch { return undefined; }
    return { text: buf.toString('utf8'), sha256: crypto.createHash('sha256').update(buf).digest('hex') };
  };
  const io: BuildIO = { readSource, write: writeStaged };
  const adapters = createAdapterRegistry();

  try {
    const works = await catalogueWorksOf(opts.lang);
    const dict = opts.dictDir ? createFileLexiconSource(opts.dictDir, opts.lang) : undefined;
    const result = await buildLibrary({
      lang: opts.lang, manifest, io, adapters, date: opts.date, inspect: opts.inspect, progress: opts.progress,
      catalogue: (id) => works.get(id),
      lexicon: dict ? (l) => (l === opts.lang ? dict : undefined) : undefined,
      bundledTextIds: new Set(loadBundledCorpus().filter((d) => d.lang === opts.lang).map((d) => `text:${d.lang}:${d.id}`)),
    });

    // companion languages: built into the same staging directory under their own prefix, after the course language
    const companions: CompanionBuild[] = [];
    const companionRecords: Array<Record<string, unknown>> = [];
    const companionProvenance: Array<Record<string, unknown>> = [];
    for (const { lang, manifest: cm } of companionManifests) {
      const captured: { manifest?: LibraryManifest; provenance?: unknown } = {};
      const cio: BuildIO = {
        readSource,
        write(relative, content) {
          if (relative === manifestPath) { captured.manifest = JSON.parse(content) as LibraryManifest; return; }
          if (relative === provenancePath) { captured.provenance = JSON.parse(content); return; }
          if (relative.startsWith('index/')) {
            const shard = JSON.parse(content) as { rows?: Array<Record<string, unknown>> };
            for (const row of shard.rows ?? []) {
              if (typeof row.documentPath === 'string') row.documentPath = companionPath(lang, row.documentPath);
              if (typeof row.profilePath === 'string') row.profilePath = companionPath(lang, row.profilePath);
            }
            writeStaged(companionPath(lang, relative), JSON.stringify(shard));
            return;
          }
          writeStaged(companionPath(lang, relative), content);
        },
      };
      let built: BuiltWork[] = [];
      let refused: Refusal[] = [];
      try {
        const cworks = await catalogueWorksOf(lang);
        const cdict = opts.dictDir && fs.existsSync(path.join(opts.dictDir, lang, 'manifest.json')) ? createFileLexiconSource(opts.dictDir, lang) : undefined;
        const r = await buildLibrary({
          lang, manifest: cm, io: cio, adapters, date: opts.date, inspect: opts.inspect, progress: opts.progress,
          catalogue: (id) => cworks.get(id),
          lexicon: cdict ? (l) => (l === lang ? cdict : undefined) : undefined,
          bundledTextIds: new Set(loadBundledCorpus().filter((d) => d.lang === lang).map((d) => `text:${d.lang}:${d.id}`)),
        });
        built = r.built;
        refused = r.refused;
      } catch (e) {
        // "nothing was built": every companion entry was refused. The course language's build goes on without them.
        if (!(e instanceof LibraryBuildError)) throw e;
        refused = cm.entries.map((en: BuildEntry) => {
          const why = rightsRefusals(en);
          return { slug: en.slug, title: en.title, reasons: why.length ? why : [e.message.split('\n')[0]] };
        });
      }
      const cman = captured.manifest
        ? { ...captured.manifest, shards: captured.manifest.shards.map((sh): LibraryShardInfo => ({ ...sh, file: companionPath(lang, sh.file) })) }
        : undefined;
      companions.push({ lang, manifest: cman, built, refused });
      if (cman) {
        companionRecords.push({ lang, id: cman.id, texts: cman.texts, works: cman.works, words: cman.words, digest: cman.digest, shards: cman.shards });
        companionProvenance.push({ lang, ...(isRecord(captured.provenance) ? captured.provenance : {}) });
      }
    }
    if (companionRecords.length) {
      // the course language's manifest and provenance keep everything they had; the companions are added, and the digest covers them
      const mainManifestFile = path.join(staging, manifestPath);
      const main = JSON.parse(fs.readFileSync(mainManifestFile, 'utf8')) as LibraryManifest & { companions?: unknown };
      main.digest = hash(companionRecords.reduce((d, c) => hash(d + String(c.digest)), main.digest));
      main.companions = companionRecords;
      fs.writeFileSync(mainManifestFile, JSON.stringify(main), 'utf8');
      result.manifest.digest = main.digest;
      const provenanceFile = path.join(staging, provenancePath);
      const prov = JSON.parse(fs.readFileSync(provenanceFile, 'utf8')) as Record<string, unknown>;
      prov.companions = companionProvenance;
      fs.writeFileSync(provenanceFile, JSON.stringify(prov), 'utf8');
    }

    fs.mkdirSync(opts.outDir, { recursive: true });
    const hadPrevious = fs.existsSync(dir);
    if (hadPrevious) await renameWithRetry(dir, previous);
    try { await renameWithRetry(staging, dir); }
    catch (error) {
      if (hadPrevious) await renameWithRetry(previous, dir);
      throw error;
    }
    if (hadPrevious) fs.rmSync(previous, { recursive: true, force: true });
    const tag = <T extends { slug: string }>(lang: LanguageCode, x: T): T => ({ ...x, slug: `${lang}:${x.slug}` });
    return {
      ...result,
      built: [...result.built, ...companions.flatMap((c) => c.built.map((b) => tag(c.lang, b)))],
      refused: [...result.refused, ...companions.flatMap((c) => c.refused.map((r) => tag(c.lang, r)))],
      dir, files, bytes, companions,
    };
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw e;
  }
}
