/**
 * Companion languages in the library build (src/library/build-node.ts): a course that also reads a second language
 * (`Course.readsLangs`: the Norway course reads Nynorsk, `nn`) can carry that language's entries in the course language's
 * build manifest ("lang": "nn"). They are built with their own adapter into the SAME output directory under their own
 * prefix, every row and document says `nn`, and a manifest without such entries builds byte-for-byte as before.
 *
 * Fixture manifests only: no library is built from real sources here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildLibrary, LibraryBuildError } from '../../src/library/build';
import { buildLibraryFiles, companionLangsOf, companionPath, splitCompanionEntries } from '../../src/library/build-node';
import { parseManifest, parseShard } from '../../src/library/format';
import { registry, tmpDir } from './helpers';
import { COURSE, PD, cleanInspect, fixtureManifest, memoryIO, writeTree } from './fixtures';

const DATE = '2026-10-01';
const dirs: string[] = [];
const scratch = (prefix: string): string => { const d = tmpDir(prefix); dirs.push(d); return d; };
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

/** A machine-drafted course document in `lang`, written the way the ladder units are (a `documents` source). */
const doc = (lang: 'nb' | 'nn', id: string, title: string, text: string): string => JSON.stringify([{
  schemaVersion: 2, id, lang, title, contentType: 'story',
  corpus: { id: `ci-${lang}`, kind: 'comprehensible-input', title: 'CI' },
  source: { id: `src:${lang}:${id}`, title, attribution: 'Course text', provenance: 'drafted for the test; not reviewed', rights: 'owner-authored', authorship: 'generated' },
  review: { status: 'unreviewed' }, topics: [], editorialTags: ['machine-drafted'], prepTargets: [], generated: true,
  sections: [{ paragraphs: [{ text }] }],
}]);

const NB_TEXT = 'Jeg heter Sam. Jeg bor i Bergen. Jeg liker brød og kaffe.';
const NN_TEXT = 'Eg heiter Sam. Eg bur i Bergen. Eg likar brød og kaffi.';

const norwegianFiles = (): Record<string, string> => ({
  'nb/prove.json': doc('nb', 'bokmal-prove-ch01', 'Bokmål, prøve', NB_TEXT),
  'nn/prove.json': doc('nn', 'nynorsk-prove-ch01', 'Nynorsk, prøve', NN_TEXT),
});

const entry = (slug: string, file: string, over: Record<string, unknown> = {}) => ({
  slug, title: slug, courseId: 'norway-nb', stream: 'modern', rights: COURSE, generated: true, source: { file, kind: 'documents' }, ...over,
});

const manifestFile = (root: string, entries: unknown[], lang = 'nb'): string => {
  const file = path.join(root, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify({ schema: 1, lang, entries }), 'utf8');
  return file;
};

const readJson = (file: string): any => JSON.parse(fs.readFileSync(file, 'utf8'));

describe('which entries are a companion language\'s', () => {
  it('the Norway course reads Nynorsk; the other courses read only their own language', () => {
    expect(companionLangsOf('nb')).toEqual(['nn']);
    for (const l of ['es', 'de', 'hi', 'th', 'sq'] as const) expect(companionLangsOf(l), l).toEqual([]);
    expect(companionLangsOf('nn')).toEqual([]); // a build for nn itself has no companion
  });

  it('splits the entries of the build language from those of a companion, in order, and refuses any other language', () => {
    const raw = { schema: 1, lang: 'nb', _comment: 'kept', entries: [entry('a', 'a.json'), entry('b', 'b.json', { lang: 'nn' }), entry('c', 'c.json', { lang: 'nb' }), entry('d', 'd.json', { lang: 'nn' })] };
    const { main, companions } = splitCompanionEntries(raw, 'nb');
    expect((main as typeof raw).entries.map((e) => e.slug)).toEqual(['a', 'c']);
    expect((main as typeof raw)._comment).toBe('kept');
    expect([...companions.keys()]).toEqual(['nn']);
    expect((companions.get('nn') as typeof raw.entries).map((e) => e.slug)).toEqual(['b', 'd']);
    expect(() => splitCompanionEntries({ ...raw, entries: [entry('x', 'x.json', { lang: 'de' })] }, 'nb')).toThrow(/"x".*"de".*neither "nb" nor a companion/);
    expect(() => splitCompanionEntries({ schema: 1, lang: 'es', entries: [entry('x', 'x.json', { lang: 'nn' })] }, 'es')).toThrow(LibraryBuildError);
  });

  it('a manifest with no companion entries comes back as the very same object (nothing is rebuilt around it)', () => {
    const raw = { schema: 1, lang: 'es', entries: [entry('a', 'a.json'), entry('b', 'b.json', { lang: 'es' })] };
    const { main, companions } = splitCompanionEntries(raw, 'es');
    expect(main).toBe(raw);
    expect(companions.size).toBe(0);
    expect(splitCompanionEntries(null, 'nb').main).toBeNull(); // malformed manifests are parseBuildManifest's to refuse
  });

  it('the output path of a companion file carries the language as a file-name prefix', () => {
    expect(companionPath('nn', 'index/heritage-0000.json')).toBe('index/nn-heritage-0000.json');
    expect(companionPath('nn', 't/4f/prove-ch01.json')).toBe('t/4f/nn-prove-ch01.json');
    expect(companionPath('nn', 'p/0a/prove-ch01.json')).toBe('p/0a/nn-prove-ch01.json');
    expect(companionPath('nn', 'provenance.json')).toBe('provenance.json');
  });
});

describe('building a course language and its companion into one directory', () => {
  it('writes the Nynorsk texts under their own prefix, with every row and document saying nn', async () => {
    const inDir = scratch('companion-in-');
    const outDir = scratch('companion-out-');
    writeTree(inDir, norwegianFiles());
    const mf = manifestFile(inDir, [entry('bokmal-prove', 'nb/prove.json'), entry('nynorsk-prove', 'nn/prove.json', { lang: 'nn', stream: 'nynorsk', streams: ['nynorsk'] })]);
    const r = await buildLibraryFiles({ lang: 'nb', manifestFile: mf, inDir, outDir, date: DATE, inspect: cleanInspect });

    expect(r.built.map((b) => b.slug)).toEqual(['bokmal-prove', 'nn:nynorsk-prove']);
    expect(r.refused).toEqual([]);
    expect(r.companions.map((c) => c.lang)).toEqual(['nn']);
    expect(r.companions[0].manifest?.id).toBe(`library-nn@${DATE}`);

    // the course language's manifest keeps its own shards and counts, and gains the companion record
    const root = path.join(outDir, 'nb');
    const manifest = readJson(path.join(root, 'manifest.json'));
    expect(manifest.lang).toBe('nb');
    expect(manifest.id).toBe(`library-nb@${DATE}`);
    expect(manifest.texts).toBe(1);
    expect(manifest.works).toBe(1);
    expect(manifest.shards.every((s: { file: string }) => !s.file.includes('nn-'))).toBe(true);
    expect(parseManifest(manifest, 'nb')).toBeDefined(); // the runtime's own parser still accepts it
    expect(manifest.companions).toHaveLength(1);
    const nn = manifest.companions[0];
    expect(nn).toMatchObject({ lang: 'nn', id: `library-nn@${DATE}`, texts: 1, works: 1 });
    expect(nn.shards.every((s: { file: string }) => s.file.startsWith('index/nn-'))).toBe(true);
    expect(manifest.digest).not.toBe(r.companions[0].manifest?.digest);

    // every row of every shard says the language of its own text id; documents and profiles exist where the rows say
    const rowsOf = (file: string, lang: 'nb' | 'nn') => parseShard(readJson(path.join(root, file)), lang);
    const nbRows = manifest.shards.flatMap((s: { file: string }) => rowsOf(s.file, 'nb'));
    const nnRows = nn.shards.flatMap((s: { file: string }) => rowsOf(s.file, 'nn'));
    expect(nbRows.map((x: { id: string }) => x.id)).toEqual(['text:nb:bokmal-prove-ch01']);
    expect(nnRows.map((x: { id: string }) => x.id)).toEqual(['text:nn:nynorsk-prove-ch01']);
    for (const shard of [...manifest.shards, ...nn.shards]) {
      for (const row of readJson(path.join(root, shard.file)).rows as Array<{ id: string; lang: string; documentPath: string; profilePath: string }>) {
        expect(row.lang, row.id).toBe(/^text:([a-z]+):/.exec(row.id)![1]);
        expect(fs.existsSync(path.join(root, row.documentPath)), row.documentPath).toBe(true);
        expect(fs.existsSync(path.join(root, row.profilePath)), row.profilePath).toBe(true);
        if (row.lang === 'nn') expect(path.basename(row.documentPath)).toMatch(/^nn-/);
        else expect(path.basename(row.documentPath)).not.toMatch(/^nn-/);
      }
    }
    const nnDoc = readJson(path.join(root, nnRows[0].documentPath));
    expect(nnDoc.lang).toBe('nn');
    expect(readJson(path.join(root, nnRows[0].profilePath)).textId).toBe('text:nn:nynorsk-prove-ch01');
    expect(readJson(path.join(root, nbRows[0].documentPath)).lang).toBe('nb');

    // provenance keeps the course language's works and records the companion's
    const provenance = readJson(path.join(root, 'provenance.json'));
    expect(provenance.lang).toBe('nb');
    expect(provenance.works.map((w: { slug: string }) => w.slug)).toEqual(['bokmal-prove']);
    expect(provenance.companions).toHaveLength(1);
    expect(provenance.companions[0].lang).toBe('nn');
    expect(provenance.companions[0].works.map((w: { slug: string }) => w.slug)).toEqual(['nynorsk-prove']);
    // nothing of the companion is written into a directory of its own
    expect(fs.existsSync(path.join(outDir, 'nn'))).toBe(false);
  });

  it('a companion entry whose rights are not verified is refused by name; the course language still builds', async () => {
    const inDir = scratch('companion-in-');
    const outDir = scratch('companion-out-');
    writeTree(inDir, norwegianFiles());
    const unverified = { ...PD, state: 'rights-unverified', verified: false, canBundle: false };
    const mf = manifestFile(inDir, [entry('bokmal-prove', 'nb/prove.json'), entry('nynorsk-lead', 'nn/prove.json', { lang: 'nn', rights: unverified })]);
    const r = await buildLibraryFiles({ lang: 'nb', manifestFile: mf, inDir, outDir, date: DATE, inspect: cleanInspect });
    expect(r.built.map((b) => b.slug)).toEqual(['bokmal-prove']);
    expect(r.refused).toHaveLength(1);
    expect(r.refused[0].slug).toBe('nn:nynorsk-lead');
    expect(r.refused[0].reasons.join(' ')).toMatch(/"rights-unverified"/);
    expect(r.companions[0].manifest).toBeUndefined();
    const manifest = readJson(path.join(outDir, 'nb', 'manifest.json'));
    expect(manifest.companions).toBeUndefined(); // nothing of the companion was built, so nothing is claimed
    expect(fs.readdirSync(path.join(outDir, 'nb', 'index')).every((f) => !f.startsWith('nn-'))).toBe(true);
  });

  it('a build with only companion entries built stops: the course language has nothing, and nothing is written', async () => {
    const inDir = scratch('companion-in-');
    const outDir = scratch('companion-out-');
    writeTree(inDir, norwegianFiles());
    const unverified = { ...PD, state: 'rights-unverified', verified: false };
    const mf = manifestFile(inDir, [entry('bokmal-lead', 'nb/prove.json', { rights: unverified }), entry('nynorsk-prove', 'nn/prove.json', { lang: 'nn' })]);
    await expect(buildLibraryFiles({ lang: 'nb', manifestFile: mf, inDir, outDir, date: DATE, inspect: cleanInspect })).rejects.toThrow(/nothing was built/);
    expect(fs.existsSync(path.join(outDir, 'nb'))).toBe(false);
  });

  it('an entry for a language the course does not read stops the build before anything is written', async () => {
    const inDir = scratch('companion-in-');
    const outDir = scratch('companion-out-');
    writeTree(inDir, norwegianFiles());
    const mf = manifestFile(inDir, [entry('bokmal-prove', 'nb/prove.json'), entry('tysk', 'nb/prove.json', { lang: 'de' })]);
    await expect(buildLibraryFiles({ lang: 'nb', manifestFile: mf, inDir, outDir, date: DATE, inspect: cleanInspect })).rejects.toThrow(/neither "nb" nor a companion/);
    expect(fs.existsSync(outDir) ? fs.readdirSync(outDir) : []).toEqual([]);
  });

  it('a rebuild of the same inputs and date is byte-identical, companion included', async () => {
    const inDir = scratch('companion-in-');
    writeTree(inDir, norwegianFiles());
    const mf = manifestFile(inDir, [entry('bokmal-prove', 'nb/prove.json'), entry('nynorsk-prove', 'nn/prove.json', { lang: 'nn' })]);
    const a = scratch('companion-out-');
    const b = scratch('companion-out-');
    await buildLibraryFiles({ lang: 'nb', manifestFile: mf, inDir, outDir: a, date: DATE, inspect: cleanInspect });
    await buildLibraryFiles({ lang: 'nb', manifestFile: mf, inDir, outDir: b, date: DATE, inspect: cleanInspect });
    const list = (root: string): string[] => fs.readdirSync(root, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(root, f)).isFile()).sort();
    expect(list(path.join(a, 'nb'))).toEqual(list(path.join(b, 'nb')));
    for (const f of list(path.join(a, 'nb'))) expect(fs.readFileSync(path.join(a, 'nb', f), 'utf8'), f).toBe(fs.readFileSync(path.join(b, 'nb', f), 'utf8'));
  });
});

describe('a course without companions builds exactly as before', () => {
  it('the files written for a manifest without companion entries are the pure build\'s own output, with no companions anywhere', async () => {
    const { manifest, files } = fixtureManifest();
    const inDir = scratch('companion-es-in-');
    const outDir = scratch('companion-es-out-');
    writeTree(inDir, files);
    const manifestPath = path.join(inDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');

    const r = await buildLibraryFiles({ lang: 'es', manifestFile: manifestPath, inDir, outDir, date: DATE, inspect: cleanInspect });
    expect(r.companions).toEqual([]);

    // the same build through the pure function with an in-memory IO
    const mem = memoryIO(files);
    const pure = await buildLibrary({ lang: 'es', manifest, io: mem.io, adapters: registry, date: DATE, inspect: cleanInspect });
    expect(r.built.map((b) => b.slug)).toEqual(pure.built.map((b) => b.slug));
    expect(r.refused.map((x) => x.slug)).toEqual(pure.refused.map((x) => x.slug));
    expect(r.manifest.digest).toBe(pure.manifest.digest);

    const root = path.join(outDir, 'es');
    const written = fs.readdirSync(root, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(root, f)).isFile()).map((f) => f.split(path.sep).join('/')).sort();
    expect(written).toEqual([...mem.out.keys()].sort());
    for (const f of written) {
      if (f === 'provenance.json') continue; // identical too, but its refusals carry the build's wording; compared below
      expect(fs.readFileSync(path.join(root, f), 'utf8'), f).toBe(mem.out.get(f));
    }
    expect(readJson(path.join(root, 'provenance.json'))).toEqual(JSON.parse(mem.out.get('provenance.json')!));
    expect(readJson(path.join(root, 'manifest.json')).companions).toBeUndefined();
    expect(JSON.stringify(parseManifest(readJson(path.join(root, 'manifest.json')), 'es'))).toBe(JSON.stringify(pure.manifest));
  }, 120_000);
});
