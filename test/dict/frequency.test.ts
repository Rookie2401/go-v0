/**
 * R9: corpus frequency as a SIDECAR of the dictionary (`<dict>/<lang>/frequency.json`): the file's format, the lookup through the
 * file / fetch / memory sources, and the manifest's `hasFrequency` (true exactly while the sidecar is there, also after a rebuild).
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createFetchLexiconSource, createMemoryLexiconSource, frequencyTableOf, parseFrequency, parseFrequencyText } from '../../src/dict';
import { createFileLexiconSource } from '../../src/dict/file';
import { buildDictionaryFile } from '../../src/dict/build-node';
import { buildFrequencyFile, frequencyText, patchManifestFrequency, repatchManifestFrequency, writeFrequencySidecar } from '../../src/dict/frequency-node';
import { parseManifest } from '../../src/dict/format';
import { DATE, FIXTURE, fakeFetch, tmpDir } from './helpers';

const root = tmpDir('go-freq-');
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

const counts = new Map<string, number>([['casa', 50], ['Casa', 30], ['sol', 12], ['luna', 3], ['raro', 2], ['agua', 80]]);
const sources = [{ id: 'library-es@x', kind: 'library' as const, texts: 2, words: 900_000 }];
const file = () => buildFrequencyFile({ lang: 'es', date: '2026-10-07', counts, words: 1_000_000, sources });

describe('the sidecar format', () => {
  it('lists lemmas met at least 3 times, per million words, most frequent first (rank = position), case merged', () => {
    const f = file();
    expect(f).toMatchObject({ schema: 1, lang: 'es', builtAt: '2026-10-07', minCount: 3, words: 1_000_000, sources });
    expect(f.lemmas).toEqual([['agua', 80], ['casa', 80], ['sol', 12], ['luna', 3]]); // 'raro' (2) is below the floor; casa + Casa = 80; ties by code unit
  });

  it('refuses to write a file for no words', () => {
    expect(() => buildFrequencyFile({ lang: 'es', date: 'd', counts, words: 0, sources })).toThrow(/no words/);
  });

  it('round-trips through its text, one lemma per line', () => {
    const text = frequencyText(file());
    expect(text.trim().split('\n').length).toBe(2 + 4); // the head line, four lemmas, the closing line
    const t = parseFrequencyText(text, 'es')!;
    expect(t.size).toBe(4);
    expect(t.words).toBe(1_000_000);
    expect(t.sources).toEqual(sources);
    expect(t.get('agua')).toEqual({ perMillion: 80, rank: 1 });
    expect(t.get('luna')).toEqual({ perMillion: 3, rank: 4 });
  });

  it('looks lemmas up the way the library keys them (NFC, lower-cased) and says nothing for a rare or unknown one', () => {
    const t = parseFrequencyText(frequencyText(file()), 'es')!;
    expect(t.get('CASA')?.perMillion).toBe(80);
    expect(t.get('raro')).toBeUndefined();
    expect(t.get('nada')).toBeUndefined();
    const nfd = frequencyTableOf('es', [['caña', 5]]);
    expect(nfd.get('caña')?.perMillion).toBe(5); // decomposed n + combining tilde finds the composed lemma
  });

  it('is not trusted when it is the wrong language, schema or shape', () => {
    const f = file();
    expect(parseFrequency(f, 'de')).toBeUndefined();
    expect(parseFrequency({ ...f, schema: 2 }, 'es')).toBeUndefined();
    expect(parseFrequency({ ...f, words: 0 }, 'es')).toBeUndefined();
    expect(parseFrequency({ ...f, lemmas: [['a', 1], ['b', 'x']] }, 'es')).toBeUndefined();
    expect(parseFrequency({ ...f, lemmas: [['', 1]] }, 'es')).toBeUndefined();
    expect(parseFrequencyText('{not json', 'es')).toBeUndefined();
    expect(parseFrequencyText(undefined, 'es')).toBeUndefined();
  });
});

describe('the manifest follows the sidecar', () => {
  const build = async (name: string) => {
    const outDir = path.join(root, name);
    await buildDictionaryFile({ input: FIXTURE, lang: 'th', outDir, date: DATE });
    return outDir;
  };
  const thFile = () => buildFrequencyFile({ lang: 'th', date: DATE, counts: new Map([['ไป', 40], ['มา', 10]]), words: 1000, sources });
  const manifestOf = (dir: string) => parseManifest(JSON.parse(fs.readFileSync(path.join(dir, 'th', 'manifest.json'), 'utf8')), 'th')!;

  it('a built dictionary says hasFrequency false; writing the sidecar sets it true and changes nothing else', async () => {
    const dir = await build('flag');
    const before = manifestOf(dir);
    expect(before.hasFrequency).toBe(false);
    const w = writeFrequencySidecar(dir, thFile());
    expect(w.manifestPatched).toBe(true);
    const after = manifestOf(dir);
    expect(after.hasFrequency).toBe(true);
    expect({ ...after, hasFrequency: false }).toEqual(before);
    expect(fs.existsSync(path.join(dir, 'th', 'frequency.json'))).toBe(true);
  });

  it('survives a rebuild of the dictionary (the builder writes false; the repatch sets it true again)', async () => {
    const dir = await build('rebuild');
    writeFrequencySidecar(dir, thFile());
    await buildDictionaryFile({ input: FIXTURE, lang: 'th', outDir: dir, date: DATE });
    expect(fs.existsSync(path.join(dir, 'th', 'frequency.json'))).toBe(true); // the builder only clears manifest and shards
    expect(manifestOf(dir).hasFrequency).toBe(false);
    expect(repatchManifestFrequency(path.join(dir, 'th'))).toBe(true);
    expect(manifestOf(dir).hasFrequency).toBe(true);
    fs.rmSync(path.join(dir, 'th', 'frequency.json'));
    expect(repatchManifestFrequency(path.join(dir, 'th'))).toBe(false); // no sidecar: nothing to say
    expect(patchManifestFrequency(path.join(dir, 'th'), false)).toBe(true);
    expect(manifestOf(dir).hasFrequency).toBe(false);
  });

  it('a language without a dictionary gets the sidecar alone, and it is still readable', () => {
    const dir = path.join(root, 'alone');
    const nb = buildFrequencyFile({ lang: 'nb', date: DATE, counts: new Map([['være', 30]]), words: 1000, sources });
    const w = writeFrequencySidecar(dir, nb);
    expect(w.manifestPatched).toBe(false);
    expect(fs.existsSync(path.join(dir, 'nb', 'manifest.json'))).toBe(false);
  });
});

describe('the lexicon sources expose frequency(lemma)', () => {
  it('file source: reads frequency.json when the manifest says hasFrequency', async () => {
    const dir = path.join(root, 'file');
    await buildDictionaryFile({ input: FIXTURE, lang: 'th', outDir: dir, date: DATE });
    const src = createFileLexiconSource(dir, 'th');
    expect((await src.info())?.hasFrequency).toBe(false);
    expect(await src.frequency!('ไป')).toBeUndefined(); // no sidecar yet
    writeFrequencySidecar(dir, buildFrequencyFile({ lang: 'th', date: DATE, counts: new Map([['ไป', 40], ['มา', 10]]), words: 1000, sources }));
    const fresh = createFileLexiconSource(dir, 'th');
    expect((await fresh.info())?.hasFrequency).toBe(true);
    expect(await fresh.frequency!('ไป')).toEqual({ perMillion: 40000, rank: 1 });
    expect(await fresh.frequency!('มา')).toEqual({ perMillion: 10000, rank: 2 });
    expect(await fresh.frequency!('ไม่มี')).toBeUndefined();
    const tbl = (await fresh.frequencyTable!())!;
    expect(tbl.size).toBe(2);
    expect(tbl.get('ไป')).toEqual({ perMillion: 40000, rank: 1 });
    expect(await createFileLexiconSource(path.join(root, 'nowhere'), 'th').frequencyTable!()).toBeUndefined();
  });

  it('file source with no dictionary at all (nb): the sidecar alone is read', async () => {
    const dir = path.join(root, 'file-alone');
    writeFrequencySidecar(dir, buildFrequencyFile({ lang: 'nb', date: DATE, counts: new Map([['være', 30]]), words: 1000, sources }));
    const src = createFileLexiconSource(dir, 'nb');
    expect(await src.info()).toBeUndefined();
    expect(await src.frequency!('være')).toEqual({ perMillion: 30000, rank: 1 });
  });

  it('fetch source: one request for the sidecar, none when the manifest says there is no frequency, none repeated', async () => {
    const dir = path.join(root, 'fetch');
    await buildDictionaryFile({ input: FIXTURE, lang: 'th', outDir: dir, date: DATE });
    const manifest = fs.readFileSync(path.join(dir, 'th', 'manifest.json'), 'utf8');
    const none = fakeFetch(new Map([['/dict/th/manifest.json', manifest]]));
    const a = createFetchLexiconSource('th', { fetch: none.fetch });
    expect(await a.frequency!('ไป')).toBeUndefined();
    expect(none.log).toEqual(['/dict/th/manifest.json']); // hasFrequency false: frequency.json is not asked for

    writeFrequencySidecar(dir, buildFrequencyFile({ lang: 'th', date: DATE, counts: new Map([['ไป', 40]]), words: 1000, sources }));
    const files = new Map([
      ['/dict/th/manifest.json', fs.readFileSync(path.join(dir, 'th', 'manifest.json'), 'utf8')],
      ['/dict/th/frequency.json', fs.readFileSync(path.join(dir, 'th', 'frequency.json'), 'utf8')],
    ]);
    const some = fakeFetch(files);
    const b = createFetchLexiconSource('th', { fetch: some.fetch });
    expect(await b.frequency!('ไป')).toEqual({ perMillion: 40000, rank: 1 });
    expect(await b.frequency!('ไป')).toBeDefined();
    expect(some.log.filter((u) => u.endsWith('frequency.json')).length).toBe(1);

    const broken = fakeFetch(new Map([...files, ['/dict/th/frequency.json', '{broken']]));
    expect(await createFetchLexiconSource('th', { fetch: broken.fetch }).frequency!('ไป')).toBeUndefined(); // an unusable file is no frequency, not an error
  });

  it('memory source: a table makes hasFrequency true and answers; without one there is no method', async () => {
    const withIt = createMemoryLexiconSource('es', [], undefined, frequencyTableOf('es', [['casa', 5], ['sol', 9]]));
    expect((await withIt.info())?.hasFrequency).toBe(true);
    expect(await withIt.frequency!('sol')).toEqual({ perMillion: 9, rank: 1 });
    const without = createMemoryLexiconSource('es', []);
    expect((await without.info())?.hasFrequency).toBe(false);
    expect(without.frequency).toBeUndefined();
  });
});
