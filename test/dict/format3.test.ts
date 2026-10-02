import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import type { DictionaryEntry, LanguageCode } from '../../src/core';
import {
  DICT_SCHEMA, DROP_FORM_PRONUNCIATIONS, MAX_GLOSSES, TARGET_SHARD_BYTES, bucketOf, buildDictionary, chooseBuckets, createFetchLexiconSource,
  deriveGlosses, expandEntry, infoOf, mapKaikkiLine, parseManifest, parseShard, shardName,
} from '../../src/dict';
import { mergeKey } from '../../src/dict/build';
import { buildDictionaryFile } from '../../src/dict/build-node';
import { createFileLexiconSource } from '../../src/dict/file';
import { DATE, FIXTURE, buildFixture, fakeFetch, tmpDir } from './helpers';

const ES_FIXTURE = path.resolve('test/dict/fixtures/kaikki-es-sample.jsonl');
const esNormalize = (s: string) => createAdapterRegistry().get('es').normalize(s);
const esLines = (): string[] => {
  const lines = fs.readFileSync(ES_FIXTURE, 'utf8').split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
};
const buildEs = (extra: { dropFormPronunciations?: boolean } = {}) => buildDictionary(esLines(), { lang: 'es', normalize: esNormalize, date: DATE, ...extra });

/**
 * A schema-2 dictionary written by the schema-2 writer (the code before schema 3) from the Thai and Spanish fixtures,
 * with what the schema-2 reader returned for every form. Frozen: generated once, never regenerated. If a test here
 * fails, the reader changed what it returns for an old dictionary; fix the reader, not this file.
 */
interface Frozen { files: Record<string, string>; expected: Record<string, DictionaryEntry[]> }
const FROZEN = JSON.parse(fs.readFileSync(path.resolve('test/dict/fixtures/schema2-frozen.json'), 'utf8')) as Record<'th' | 'es', Frozen>;

const root = tmpDir('go-dict-f3-');
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

/** Every entry of a build, by form, read the way a runtime reads it. */
function readAll(out: ReturnType<typeof buildEs>, lang: LanguageCode): Map<string, DictionaryEntry[]> {
  const all = new Map<string, DictionaryEntry[]>();
  for (const [name, text] of out.files) {
    if (name === 'manifest.json') continue;
    for (const [form, list] of parseShard(JSON.parse(text), lang, out.manifest)) all.set(form, list);
  }
  return all;
}

const stripPronunciation = (e: DictionaryEntry): DictionaryEntry => {
  const { pronunciations: _p, respelling: _r, ipa: _i, romanization: _t, ...rest } = e;
  return rest;
};
const isFormOnly = (e: DictionaryEntry) => !e.glosses.length && (e.formOf?.length ?? 0) > 0;
/**
 * A build of today keeps the source's spelling of a headword when normalization changed it (`written`): the one such
 * headword of the Spanish fixture is "Dios". The schema-2 fixture was written before that and has no such field.
 */
const WRITTEN: Record<string, string> = { dios: 'Dios' };
const asBuiltToday = (expected: Record<string, DictionaryEntry[]>): Record<string, DictionaryEntry[]> =>
  Object.fromEntries(Object.entries(expected).map(([form, list]) => [form, WRITTEN[form] ? list.map((e) => ({ ...e, written: WRITTEN[form] })) : list]));

describe('a schema-2 dictionary written by the old writer still reads exactly as before', () => {
  for (const lang of ['th', 'es'] as const) {
    const frozen = FROZEN[lang];
    const dir = path.join(root, `frozen-${lang}`);
    fs.mkdirSync(path.join(dir, lang), { recursive: true });
    for (const [name, text] of Object.entries(frozen.files)) fs.writeFileSync(path.join(dir, lang, name), text, 'utf8');

    it(`${lang}: the fixture really is schema 2 (no label sets, relations carry their labels)`, () => {
      const m = JSON.parse(frozen.files['manifest.json']) as Record<string, unknown>;
      expect(m.schema).toBe(2);
      expect(m.labelSets).toBeUndefined();
      expect(Object.keys(frozen.expected).length).toBeGreaterThan(20);
      if (lang === 'es') expect(Object.values(frozen.files).some((t) => t.includes('"m":[{"l":'))).toBe(true);
    });

    it(`${lang}: parseManifest reads it, with no label sets`, () => {
      const m = parseManifest(JSON.parse(frozen.files['manifest.json']), lang)!;
      expect(m.schema).toBe(2);
      expect(m.labelSets).toEqual([]);
      expect(m.buckets).toBe(256);
      expect(infoOf(m)).toMatchObject({ lang, entries: expect.any(Number), hasFrequency: false });
    });

    it(`${lang}: parseShard gives the entries the old reader gave (with the manifest, and without one)`, () => {
      const m = parseManifest(JSON.parse(frozen.files['manifest.json']), lang)!;
      for (const withManifest of [true, false]) {
        const got: Record<string, DictionaryEntry[]> = {};
        for (const name of m.shardFiles) {
          for (const [form, list] of parseShard(JSON.parse(frozen.files[name]), lang, withManifest ? m : undefined)) got[form] = list;
        }
        expect(got).toEqual(frozen.expected);
      }
    });

    it(`${lang}: the file source answers every form with the old reader's entries`, async () => {
      const src = createFileLexiconSource(dir, lang);
      expect(await src.info()).toEqual(infoOf(parseManifest(JSON.parse(frozen.files['manifest.json']), lang)!));
      const forms = Object.keys(frozen.expected);
      const got = await src.lookup(forms);
      expect(Object.fromEntries(got)).toEqual(frozen.expected);
    });

    it(`${lang}: the fetch source reads it too`, async () => {
      const files = new Map(Object.entries(frozen.files).map(([n, t]) => [`/dict/${lang}/${n}`, t]));
      const src = createFetchLexiconSource(lang, { fetch: fakeFetch(files).fetch });
      const forms = Object.keys(frozen.expected);
      expect(Object.fromEntries(await src.lookup(forms))).toEqual(frozen.expected);
    });
  }
});

describe('schema 3 round trip', () => {
  it('Thai: every entry equals what the schema-2 build of the same lines gave, pronunciations included', () => {
    const out = buildFixture();
    expect(out.manifest.schema).toBe(DICT_SCHEMA);
    expect(DICT_SCHEMA).toBe(3);
    expect(Object.fromEntries(readAll(out, 'th'))).toEqual(FROZEN.th.expected);
    expect(out.stats.pronunciationsDropped).toBe(0);
    expect(out.stats.pronunciations).toBeGreaterThan(0);
  });

  it('Spanish: every entry equals the schema-2 one, except that an inflected form (no gloss of its own) has no pronunciation', () => {
    const out = buildEs();
    const got = readAll(out, 'es');
    expect(Object.keys(Object.fromEntries(got)).sort()).toEqual(Object.keys(FROZEN.es.expected).sort());
    let dropped = 0;
    for (const [form, list] of Object.entries(asBuiltToday(FROZEN.es.expected))) {
      const want = list.map((e) => {
        if (!isFormOnly(e)) return e;
        if (e.pronunciations?.length || e.ipa) dropped++;
        return stripPronunciation(e);
      });
      expect(got.get(form), form).toEqual(want);
    }
    expect(dropped).toBeGreaterThanOrEqual(1); // hablo is the fixture's inflected form with a source pronunciation (scale-es.test.ts drops thousands)
    expect(out.stats.pronunciationEntriesDropped).toBe(dropped);
    expect(out.stats.pronunciationsDropped).toBeGreaterThanOrEqual(dropped);
    // a headword keeps everything: lemmas, and a word that is a lemma and an inflected form at once
    expect(got.get('hablar')![0].ipa).toBe('/aˈblaɾ/');
    expect(got.get('niña')![0]).toMatchObject({ glosses: ['girl'], formOf: [{ lemma: 'niño' }] });
    expect(got.get('calle')![0].pronunciations).toHaveLength(2);
  });

  it('the pronunciation choice is one visible setting per language, and an option overrides it', () => {
    expect(DROP_FORM_PRONUNCIATIONS.es).toBe(true);
    expect(DROP_FORM_PRONUNCIATIONS.th).toBe(false);
    const keep = buildEs({ dropFormPronunciations: false });
    expect(keep.stats.pronunciationsDropped).toBe(0);
    expect(Object.fromEntries(readAll(keep, 'es'))).toEqual(asBuiltToday(FROZEN.es.expected)); // nothing dropped: exactly the schema-2 reading (plus the kept spelling)
    const dropTh = buildDictionary(fs.readFileSync(FIXTURE, 'utf8').split(/\r?\n/).filter(Boolean), {
      lang: 'th', normalize: (s) => createAdapterRegistry().get('th').normalize(s), date: DATE, dropFormPronunciations: true,
    });
    expect(dropTh.stats.pronunciationsDropped).toBe(0); // no Thai entry is only an inflected form, so there is nothing to drop
  });

  it('Thai keeps 256 buckets, and the shard target is about 100 kB', () => {
    expect(buildFixture().manifest.buckets).toBe(256);
    expect(TARGET_SHARD_BYTES).toBe(100_000);
    expect(chooseBuckets(256 * TARGET_SHARD_BYTES)).toBe(256);
    expect(chooseBuckets(256 * TARGET_SHARD_BYTES + 1)).toBe(512);
    expect(chooseBuckets(45_000_000)).toBe(512); // about the size of the whole Spanish dictionary: ~90 kB per shard
    expect(chooseBuckets(7_349_754)).toBe(256);
  });

  it('writes a form-only entry as the lemma and a label set number, and a headword without repeating its glosses', () => {
    const out = buildEs();
    const m = out.manifest;
    const all = new Map<string, unknown[]>();
    for (const [name, text] of out.files) if (name !== 'manifest.json') for (const [f, l] of Object.entries(JSON.parse(text) as Record<string, unknown[]>)) all.set(f, l);
    const hablo = all.get('hablo')![0] as Record<string, unknown>;
    expect(hablo).toEqual({ p: 'VERB', m: [['hablar', m.labelSets.findIndex((s) => s.join() === 'first-person,form-of,indicative,present,singular')]] });
    const hablar = all.get('hablar')![0] as Record<string, unknown>;
    expect(hablar.g).toBeUndefined(); // the senses say it
    expect(hablar.s).toEqual([{ g: 'to speak' }, { g: 'to talk', t: ['intransitive'] }]);
    for (const list of all.values()) for (const e of list as Array<Record<string, unknown>>) {
      expect(e.g, 'no empty g').not.toEqual([]);
      expect(Object.keys(e).length).toBeGreaterThan(0);
    }
  });
});

describe('label sets', () => {
  const countsOf = (lines: string[]) => {
    const counts = new Map<string, number>();
    for (const l of lines) {
      let json: unknown;
      try { json = JSON.parse(l); } catch { continue; }
      for (const f of mapKaikkiLine(json, esNormalize, 'es').entry?.formOf ?? []) if (f.tags.length) counts.set(JSON.stringify(f.tags), (counts.get(JSON.stringify(f.tags)) ?? 0) + 1);
    }
    return counts;
  };

  it('are the distinct label lists, most frequent first, then by code unit, and the same whatever the order of the input', () => {
    const lines = esLines();
    const counts = countsOf(lines);
    const want = [...counts].sort(([ka, a], [kb, b]) => b - a || (ka < kb ? -1 : ka > kb ? 1 : 0)).map(([k]) => JSON.parse(k) as string[]);
    const fwd = buildEs();
    expect(fwd.manifest.labelSets).toEqual(want);
    expect(want.length).toBeGreaterThan(5);
    expect(fwd.stats.labelSets).toBe(want.length);
    const rev = buildDictionary([...lines].reverse(), { lang: 'es', normalize: esNormalize, date: DATE });
    expect(rev.manifest.labelSets).toEqual(want);
    expect(buildEs().files.get('manifest.json')).toBe(fwd.files.get('manifest.json')); // deterministic
  });

  it('keep each list in the source order (it is not always alphabetical), so a relation reads back exactly', () => {
    const line = JSON.stringify({
      word: 'x', pos: 'noun', lang_code: 'es',
      senses: [{ glosses: ['form of y'], tags: ['form-of'], raw_tags: ['as a superlative', 'rare'], form_of: [{ word: 'y' }] }],
    });
    const out = buildDictionary([line], { lang: 'es', normalize: (s) => s, date: DATE });
    expect(out.manifest.labelSets).toEqual([['form-of', 'as a superlative', 'rare']]);
    expect(readAll(out, 'es').get('x')![0].formOf).toEqual([{ lemma: 'y', tags: ['form-of', 'as a superlative', 'rare'] }]);
  });

  it('are in the manifest file, one list per line, and an old reader-proof shape (plain arrays of strings)', () => {
    const text = buildEs().files.get('manifest.json')!;
    expect(text).toMatch(/\n {2}"labelSets": \[\n {4}\["[^\]]+\],?\n/);
    const m = JSON.parse(text) as { labelSets: unknown };
    expect(Array.isArray(m.labelSets) && (m.labelSets as unknown[]).every((s) => Array.isArray(s) && s.every((t) => typeof t === 'string'))).toBe(true);
    expect(JSON.parse(buildFixture().files.get('manifest.json')!).labelSets).toEqual([]); // Thai: none
  });
});

describe('glosses derived from the senses', () => {
  it('deriveGlosses follows the source mapper: first part of each sense, label heads joined, no repeats, capped, variants last', () => {
    expect(deriveGlosses([{ gloss: 'a' }, { gloss: 'b — narrower' }, { gloss: 'a' }])).toEqual(['a', 'b']);
    expect(deriveGlosses([{ gloss: 'Lao: — the language of Laos' }])).toEqual(['Lao: the language of Laos']);
    expect(deriveGlosses(Array.from({ length: 9 }, (_, i) => ({ gloss: `g${i}` })))).toHaveLength(MAX_GLOSSES);
    expect(deriveGlosses([{ gloss: 'spelling of x', tags: ['alt-of'] }, { gloss: 'real' }])).toEqual(['real']);
    expect(deriveGlosses([{ gloss: 'only variant', tags: ['Form-Of'] }])).toEqual(['only variant']);
    expect(deriveGlosses([])).toEqual([]);
  });

  it('what the reader derives equals the glosses the old writer stored (g), entry by entry, in both fixtures', () => {
    for (const [lang, out] of [['th', buildFixture()], ['es', buildEs()]] as const) {
      const got = readAll(out, lang);
      for (const [form, list] of Object.entries(FROZEN[lang].expected)) {
        list.forEach((e, i) => expect(got.get(form)![i].glosses, `${lang} ${form}`).toEqual(e.glosses));
      }
    }
  });

  it('the shards leave g out where the senses say the same, and write it where they do not', () => {
    const out = buildFixture();
    let left = 0, kept = 0;
    for (const [name, text] of out.files) {
      if (name === 'manifest.json') continue;
      for (const list of Object.values(JSON.parse(text) as Record<string, Array<Record<string, unknown>>>)) {
        for (const e of list) {
          if (e.g === undefined) left++;
          else {
            kept++;
            // written only because deriving it from the senses would give something else
            const senses = ((e.s as Array<{ g: string; t?: string[] }> | undefined) ?? []).map((s) => ({ gloss: s.g, ...(s.t ? { tags: s.t } : {}) }));
            expect(deriveGlosses(senses)).not.toEqual(e.g);
          }
        }
      }
    }
    expect(left).toBeGreaterThan(10);
    expect(kept).toBe(0); // in the fixture the senses always say it
  });

  it('writes g when merging made the glosses differ from what the senses say, and reads it back exactly', () => {
    // one line only has a spelling-variant sense, the other a real one: the merged glosses keep both, the derived ones only the real
    const lines = [
      JSON.stringify({ word: 'q', pos: 'noun', lang_code: 'th', senses: [{ glosses: ['spelling of x'], tags: ['alt-of'], alt_of: [{ word: 'x' }] }] }),
      JSON.stringify({ word: 'q', pos: 'noun', lang_code: 'th', senses: [{ glosses: ['real meaning'] }] }),
    ];
    const out = buildDictionary(lines, { lang: 'th', normalize: (s) => s, date: DATE });
    const shard = JSON.parse([...out.files].find(([n]) => n !== 'manifest.json')![1]) as Record<string, Array<Record<string, unknown>>>;
    expect(shard.q[0].g).toEqual(['spelling of x', 'real meaning']);
    expect(readAll(out, 'th').get('q')![0].glosses).toEqual(['spelling of x', 'real meaning']);
  });

  it('a schema-3 entry with senses and no g reads its glosses from the senses; a schema-2 shard (no label sets given) never derives', () => {
    const raw = { p: 'NOUN', s: [{ g: 'one' }, { g: 'two — more' }] };
    expect(expandEntry('f', 'es', raw, [])?.glosses).toEqual(['one', 'two']);
    expect(expandEntry('f', 'es', raw)).toBeUndefined(); // schema 2 always had g; without it there is nothing usable
    expect(expandEntry('f', 'es', { g: ['kept'], s: [{ g: 'different' }] }, [])?.glosses).toEqual(['kept']);
  });
});

describe('the reader does not trust a schema-3 shard or manifest', () => {
  const sets = [['a'], ['b', 'c']];
  it('a relation with a bad label set number is dropped, one without a number has no labels, an entry with nothing usable goes', () => {
    const e = expandEntry('f', 'es', { p: 'VERB', m: [['x', 1], ['y'], ['z', 2], ['w', -1], ['v', 0.5], ['u', '0'], [], 'junk', [' ', 0]] }, sets)!;
    expect(e.formOf).toEqual([{ lemma: 'x', tags: ['b', 'c'] }, { lemma: 'y', tags: [] }]);
    expect(expandEntry('f', 'es', { p: 'VERB', m: [['z', 9]] }, sets)).toBeUndefined();
    expect(expandEntry('f', 'es', { p: 'VERB' }, sets)).toBeUndefined();
  });

  it('entries do not share their tag arrays with the manifest (changing one result cannot change another)', () => {
    const a = expandEntry('f', 'es', { m: [['x', 0]] }, sets)!;
    a.formOf![0].tags.push('tampered');
    expect(expandEntry('f', 'es', { m: [['x', 0]] }, sets)!.formOf![0].tags).toEqual(['a']);
    expect(sets[0]).toEqual(['a']);
  });

  it('a manifest with malformed label sets reads as not installed; schema 3 without them reads as having none; schema 2 ignores them', () => {
    const good = JSON.parse(buildEs().files.get('manifest.json')!) as Record<string, unknown>;
    expect(parseManifest(good, 'es')?.labelSets.length).toBeGreaterThan(5);
    for (const bad of ['x', [['a'], 'b'], [[]], [[1]], [['']], [null]]) expect(parseManifest({ ...good, labelSets: bad }, 'es'), JSON.stringify(bad)).toBeUndefined();
    const { labelSets: _l, ...without } = good;
    expect(parseManifest(without, 'es')?.labelSets).toEqual([]);
    expect(parseManifest({ ...good, schema: 2, labelSets: 'junk' }, 'es')?.labelSets).toEqual([]);
    expect(parseManifest({ ...good, schema: 4 }, 'es')).toBeUndefined();
    expect(parseManifest({ ...good, schema: '3' }, 'es')).toBeUndefined();
  });
});

describe('the source\'s spelling of a headword (written)', () => {
  const es = (s: string) => s.toLowerCase();
  const line = (word: string, pos: string, gloss: string, extra: Record<string, unknown> = {}) => JSON.stringify({ word, pos, lang_code: 'es', senses: [{ glosses: [gloss] }], ...extra });

  it('is stored under one key, first, only when it is not the form; the shard key stays the normalized form', () => {
    const out = buildDictionary([line('PA', 'noun', 'blood pressure'), line('pa', 'prep', 'towards')], { lang: 'es', normalize: es, date: DATE });
    const shard = JSON.parse([...out.files].find(([n]) => n !== 'manifest.json')![1]) as Record<string, Array<Record<string, unknown>>>;
    expect(Object.keys(shard)).toEqual(['pa']);
    expect(shard.pa).toEqual([{ w: 'PA', p: 'NOUN', s: [{ g: 'blood pressure' }] }, { p: 'ADP', s: [{ g: 'towards' }] }]);
    expect(Object.keys(shard.pa[0])[0]).toBe('w');
    expect(out.manifest.schema).toBe(3); // the schema did not change
  });

  it('reads back exactly; a shard built before it was kept has no such key and reads as it always did', () => {
    const out = buildDictionary([line('PA', 'noun', 'blood pressure'), line('pa', 'prep', 'towards'), line('Rosa', 'name', 'a female given name')], { lang: 'es', normalize: es, date: DATE });
    const all = readAll(out, 'es');
    expect(all.get('pa')!.map((e) => [e.form, e.written, e.pos])).toEqual([['pa', 'PA', 'NOUN'], ['pa', undefined, 'ADP']]);
    expect(all.get('rosa')![0]).toEqual({ form: 'rosa', written: 'Rosa', lang: 'es', pos: 'PROPN', glosses: ['a female given name'], senses: [{ gloss: 'a female given name' }] });
    // an older schema-3 entry, and a schema-2 one: no key, no field
    expect(expandEntry('pa', 'es', { p: 'NOUN', s: [{ g: 'blood pressure' }] }, [])).toEqual({ form: 'pa', lang: 'es', pos: 'NOUN', glosses: ['blood pressure'], senses: [{ gloss: 'blood pressure' }] });
    expect('written' in expandEntry('pa', 'es', { p: 'NOUN', g: ['blood pressure'] })!).toBe(false);
    // untrusted: anything but a spelling that differs from the form is dropped
    for (const w of ['pa', '', ' ', 5, null, ['PA'], {}]) expect('written' in expandEntry('pa', 'es', { w, g: ['x'] }, [])!, JSON.stringify(w)).toBe(false);
    expect(expandEntry('pa', 'es', { w: 'PA', g: ['x'] })!.written).toBe('PA'); // read from a schema-2 shard too, should one ever carry it
  });

  it('entries that differ only in the source\'s spelling do not merge; the same spelling still does', () => {
    const lines = [
      line('PA', 'noun', 'blood pressure'), line('pa', 'noun', 'dad'), line('Pa', 'noun', 'a name'), line('PA', 'noun', 'public address'),
      line('pa', 'noun', 'father'),
    ];
    const out = buildDictionary(lines, { lang: 'es', normalize: es, date: DATE });
    expect(readAll(out, 'es').get('pa')!.map((e) => [e.written, e.glosses])).toEqual([
      ['PA', ['blood pressure', 'public address']], [undefined, ['dad', 'father']], ['Pa', ['a name']],
    ]);
    expect(out.stats.entries).toBe(3);
    expect(mergeKey({ form: 'pa', lang: 'es', glosses: [], written: 'PA' })).not.toBe(mergeKey({ form: 'pa', lang: 'es', glosses: [] }));
    // an inflected form that loses its pronunciation (Spanish) is merged again afterwards: still never across spellings
    const forms = [
      line('Rosas', 'noun', 'plural of Rosa', { senses: [{ glosses: ['plural of Rosa'], tags: ['form-of', 'plural'], form_of: [{ word: 'Rosa' }] }], sounds: [{ ipa: '/a/' }] }),
      line('rosas', 'noun', 'plural of rosa', { senses: [{ glosses: ['plural of rosa'], tags: ['form-of', 'plural'], form_of: [{ word: 'rosa' }] }], sounds: [{ ipa: '/b/' }] }),
    ];
    const built = readAll(buildDictionary(forms, { lang: 'es', normalize: es, date: DATE }), 'es').get('rosas')!;
    expect(built.map((e) => [e.written, e.ipa])).toEqual([['Rosas', undefined], [undefined, undefined]]);
  });

  it('the streaming writer keeps it too, byte for byte like the in-memory builder', async () => {
    const input = path.join(root, 'written.jsonl');
    const lines = [line('PA', 'noun', 'blood pressure'), line('pa', 'prep', 'towards'), line('Rosa', 'name', 'a name'), line('rosa', 'noun', 'rose')];
    fs.writeFileSync(input, lines.join('\n') + '\n', 'utf8');
    const outDir = path.join(root, 'stream-written');
    const r = await buildDictionaryFile({ input, lang: 'es', outDir, date: DATE });
    const mem = buildDictionary(lines, { lang: 'es', normalize: esNormalize, date: DATE });
    for (const [name, text] of mem.files) if (name !== 'manifest.json') expect(fs.readFileSync(path.join(outDir, 'es', name), 'utf8'), name).toBe(text); // (the file build's manifest also names its source file)
    expect(r.stats).toEqual(mem.stats);
    const got = await createFileLexiconSource(outDir, 'es').lookup(['pa', 'rosa']);
    expect(got.get('pa')!.map((e) => e.written)).toEqual(['PA', undefined]);
    expect(got.get('rosa')!.map((e) => e.written)).toEqual(['Rosa', undefined]);
  });
});

describe('the streaming writer produces schema 3 too', () => {
  it('writes the same label sets, shards and statistics as the in-memory builder', async () => {
    const outDir = path.join(root, 'stream-es');
    const r = await buildDictionaryFile({ input: ES_FIXTURE, lang: 'es', outDir, date: DATE });
    const mem = buildEs();
    expect(r.manifest.schema).toBe(3);
    expect(r.manifest.labelSets).toEqual(mem.manifest.labelSets);
    expect(r.stats).toEqual(mem.stats);
    const src = createFileLexiconSource(outDir, 'es');
    const forms = [...readAll(mem, 'es').keys()];
    expect(Object.fromEntries(await src.lookup(forms))).toEqual(Object.fromEntries(readAll(mem, 'es')));
    // one shard named by its bucket
    for (const f of r.manifest.shardFiles) expect(f).toBe(shardName(bucketOf(Object.keys(JSON.parse(fs.readFileSync(path.join(outDir, 'es', f), 'utf8')) as object)[0], r.manifest.buckets), r.manifest.buckets));
  });
});
