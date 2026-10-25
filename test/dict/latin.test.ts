/**
 * Latin dictionary (kaikki.org Latin extract, Wiktionary, CC BY-SA 4.0): the shared spelling rules (src/dict/latin-normalize.ts),
 * the mapping of real kaikki lines (test/dict/fixtures/kaikki-la-sample.jsonl: amo, puella, rex, esse, sum, verbum, verbo, iustus,
 * Iesus, jam, eius; trimmed of descendants and link lists, otherwise as published) into schema-3 entries and full records, and
 * the spelling-variant entries the build adds. The streaming builder must give the in-memory builder's bytes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DictionaryEntry, LanguageCode } from '../../src/core';
import { buildDictionary, createFullRecordSource, entryFromKaikki, mapFullLine, parseManifest, parseShard } from '../../src/dict';
import { buildDictionaryFile } from '../../src/dict/build-node';
import { buildFullFile } from '../../src/dict/build-full';
import { latinAliases } from '../../src/dict/latin';
import { latinLookupKeys, latinNormalize, latinSkeleton, latinVariantKeys } from '../../src/dict/latin-normalize';
import { tmpDir } from './helpers';

const LA = 'la' as LanguageCode;
const FIXTURE = path.resolve('test/dict/fixtures/kaikki-la-sample.jsonl');
const lines = fs.readFileSync(FIXTURE, 'utf8').split('\n').filter(Boolean);
const parsed = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
const line = (word: string, pos: string, ety?: number) => parsed.find((o) => o.word === word && o.pos === pos && (ety === undefined || String(o.etymology_number) === String(ety)))!;

/** The whole fixture as built, read back through the real shard parser: form to entries. */
function dictionary(): Map<string, DictionaryEntry[]> {
  const out = buildDictionary(lines, { lang: LA, normalize: latinNormalize, date: '2026-10-17' });
  const manifest = parseManifest(JSON.parse(out.files.get('manifest.json')!), LA)!;
  const all = new Map<string, DictionaryEntry[]>();
  for (const [name, text] of out.files) {
    if (name === 'manifest.json') continue;
    for (const [form, entries] of parseShard(JSON.parse(text), LA, manifest)) all.set(form, [...(all.get(form) ?? []), ...entries]);
  }
  return all;
}

describe('latinNormalize: the key rule', () => {
  it('strips macrons, breves and other marks, folds case and the ae/oe ligatures, and keeps j, v, u, i', () => {
    expect(latinNormalize('amō')).toBe('amo');
    expect(latinNormalize('puellae')).toBe('puellae');
    expect(latinNormalize('verbō')).toBe('verbo');
    expect(latinNormalize('Iēsūs')).toBe('iesus');
    expect(latinNormalize('Jesus')).toBe('jesus');
    expect(latinNormalize('rēx')).toBe('rex');
    expect(latinNormalize('ĕgŏ')).toBe('ego');
    expect(latinNormalize('Æneās')).toBe('aeneas');
    expect(latinNormalize('cœlum')).toBe('coelum');
    expect(latinNormalize('ǣ')).toBe('ae');
    expect(latinNormalize('poëta')).toBe('poeta');
    expect(latinNormalize('ȳ')).toBe('y');
    expect(latinNormalize('ſcio')).toBe('scio');
    expect(latinNormalize('  Vox   audita ')).toBe('vox audita');
    expect(latinNormalize('verbum')).toBe('verbum'); // v stays: it is the key the source writes
  });
  it('is idempotent and agrees whether the input is composed or decomposed', () => {
    for (const w of ['amō', 'āmō', 'Æneās', 'cœlum', 'iūstus']) expect(latinNormalize(latinNormalize(w))).toBe(latinNormalize(w));
    expect(latinNormalize('āmō')).toBe(latinNormalize('amō'));
  });
});

describe('spelling variants', () => {
  it('latinVariantKeys: v as u, a consonantal i as j, both; none for a word with neither', () => {
    expect(latinVariantKeys('verbum')).toEqual(['uerbum']);
    expect(latinVariantKeys('eius')).toEqual(['ejus']);
    expect(latinVariantKeys('iustus')).toEqual(['justus']);
    expect(latinVariantKeys('iuvenis')).toEqual(['juvenis', 'iuuenis', 'juuenis']);
    expect(latinVariantKeys('iesus')).toEqual(['jesus']);
    expect(latinVariantKeys('adiuvo')).toContain('adjuvo');
    expect(latinVariantKeys('iniuria')).toContain('injuria');
    expect(latinVariantKeys('coniunx')).toContain('conjunx');
    expect(latinVariantKeys('puella')).toEqual([]);
    expect(latinVariantKeys('pius')).toEqual([]); // i after a consonant, before u: a vowel
    expect(latinVariantKeys('verbum')).not.toContain('verbum');
  });
  it('latinLookupKeys: the normalized surface first, then j read as i, then a consonantal u read as v', () => {
    expect(latinLookupKeys('Verbō')[0]).toBe('verbo');
    expect(latinLookupKeys('Jesus')).toEqual(['jesus', 'iesus']);
    expect(latinLookupKeys('Ejus')).toContain('eius');
    // an edition printing v for every u (VERBVM, VOLVNTAS, vt): the key with the vowels back as u and the consonants as v is offered too (2026-10-25)
    expect(latinLookupKeys('VERBVM')).toContain('verbum');
    expect(latinLookupKeys('VOLVNTAS')).toContain('voluntas');
    expect(latinLookupKeys('vt')).toContain('ut');
    expect(latinLookupKeys('VIVVS')).toContain('vivus');
    expect(latinLookupKeys('QVI')).toContain('qui');
    expect(latinLookupKeys('uerbum')).toContain('verbum');
    expect(latinLookupKeys('iuuenis')).toContain('iuvenis');
    expect(latinLookupKeys('uiuus')).toContain('vivus');
    expect(latinLookupKeys('quod')).toEqual(['quod']); // qu is not a consonantal u
    expect(latinLookupKeys('')).toEqual([]);
    expect(latinLookupKeys('verbum').length).toBeLessThanOrEqual(6);
  });
  it('latinSkeleton: one skeleton for every printing of a word', () => {
    expect(new Set(['verbum', 'uerbum', 'Verbum', 'vērbum'].map(latinSkeleton)).size).toBe(1);
    expect(new Set(['iustus', 'justus', 'iūstus'].map(latinSkeleton)).size).toBe(1);
    expect(latinSkeleton('Jesus')).toBe(latinSkeleton('Iēsūs'));
  });
  it('latinAliases: a headword is named as the lemma; an inflected form copies its relations; nothing for a source alt-of', () => {
    const head: DictionaryEntry = { form: 'verbum', lang: LA, glosses: ['word'], pos: 'NOUN' };
    expect(latinAliases(head)).toEqual([{ form: 'uerbum', lang: LA, glosses: [], pos: 'NOUN', formOf: [{ lemma: 'verbum', tags: ['alt-of', 'orthographic-variant'] }] }]);
    const form: DictionaryEntry = { form: 'verbo', lang: LA, glosses: [], pos: 'NOUN', formOf: [{ lemma: 'verbum', tags: ['ablative', 'singular'] }] };
    expect(latinAliases(form)).toEqual([{ form: 'uerbo', lang: LA, glosses: [], pos: 'NOUN', formOf: [{ lemma: 'verbum', tags: ['ablative', 'singular'] }] }]);
    expect(latinAliases({ form: 'jam', lang: LA, glosses: ['alternative form of iam'], altOf: ['iam'] })).toEqual([]);
    expect(latinAliases({ form: 'puella', lang: LA, glosses: ['girl'] })).toEqual([]);
  });
});

describe('schema-3 entries from real kaikki lines', () => {
  it('amo: key without the macron, VERB, the first gloss, the Classical reading as the short IPA, both readings kept with their tags', () => {
    const [e] = entryFromKaikki(line('amo', 'verb', 1), latinNormalize, LA);
    expect(e).toMatchObject({ form: 'amo', lang: 'la', pos: 'VERB', glosses: expect.arrayContaining(['to love']) });
    expect(e.ipa).toBe('[ˈa.moː]');
    expect(e.pronunciations).toHaveLength(2);
    expect(e.pronunciations![0]).toMatchObject({ ipa: '[ˈa.moː]', tags: ['Classical-Latin'] });
    expect(e.pronunciations![1]).toMatchObject({ ipa: '[ˈaː.mo]', tags: ['modern Italianate Ecclesiastical'] });
    expect(e.etymology).toBe(1);
  });
  it('puella, rex, verbum, iustus, Iesus: parts of speech and glosses', () => {
    expect(entryFromKaikki(line('puella', 'noun'), latinNormalize, LA)[0]).toMatchObject({ form: 'puella', pos: 'NOUN', glosses: expect.arrayContaining(['girl, lass, maiden (female child)', 'female slave']) });
    expect(entryFromKaikki(line('rex', 'noun'), latinNormalize, LA)[0]).toMatchObject({ form: 'rex', pos: 'NOUN', glosses: expect.arrayContaining(['king, ruler']) });
    expect(entryFromKaikki(line('verbum', 'noun'), latinNormalize, LA)[0]).toMatchObject({ form: 'verbum', pos: 'NOUN', glosses: expect.arrayContaining(['word']) });
    expect(entryFromKaikki(line('iustus', 'adj'), latinNormalize, LA)[0]).toMatchObject({ form: 'iustus', pos: 'ADJ', glosses: expect.arrayContaining(['just, righteous']) });
    expect(entryFromKaikki(line('Iesus', 'name'), latinNormalize, LA)[0]).toMatchObject({ form: 'iesus', written: 'Iesus', pos: 'PROPN' });
  });
  it('esse (present active infinitive of sum) is a form of sum, with no gloss of its own; verbo is the dative/ablative singular of verbum', () => {
    const esse = entryFromKaikki(line('esse', 'verb', 1), latinNormalize, LA)[0];
    expect(esse.glosses).toEqual([]);
    expect(esse.formOf).toEqual([{ lemma: 'sum', tags: ['active', 'form-of', 'infinitive', 'present'] }]);
    const verbo = entryFromKaikki(line('verbo', 'noun'), latinNormalize, LA)[0];
    expect(verbo.formOf).toEqual([{ lemma: 'verbum', tags: expect.arrayContaining(['ablative', 'singular']) }]);
    expect(verbo.glosses).toEqual([]);
  });
  it('the Wiktionary heading words map to the parser vocabulary', () => {
    const pos = (heading: string) => entryFromKaikki({ word: 'x', lang_code: 'la', pos: heading, senses: [{ glosses: ['g'] }] }, latinNormalize, LA)[0];
    const want: Record<string, string> = {
      noun: 'NOUN', verb: 'VERB', adj: 'ADJ', adv: 'ADV', pron: 'PRON', det: 'DET', prep: 'ADP', postp: 'ADP', conj: 'CONJ',
      num: 'NUM', intj: 'INTJ', name: 'PROPN', particle: 'PART', article: 'DET',
    };
    for (const [heading, expected] of Object.entries(want)) expect(pos(heading).pos, heading).toBe(expected);
    expect(pos('suffix')).toMatchObject({ pos: 'X', role: 'suffix' });
    expect(pos('phrase')).toMatchObject({ pos: 'X', role: 'phrase' });
    expect(entryFromKaikki({ word: 'x', lang_code: 'en', pos: 'noun', senses: [{ glosses: ['g'] }] }, latinNormalize, LA)).toEqual([]);
  });
});

describe('the built dictionary', () => {
  const dict = dictionary();
  it('every key is macron-free and already normalized', () => {
    for (const key of dict.keys()) expect(latinNormalize(key), key).toBe(key);
    expect(dict.has('amo')).toBe(true);
    expect(dict.has('amō')).toBe(false);
  });
  it('macron-free and variant spellings find the headword: uerbum, uerbo, justus, jesus', () => {
    expect(dict.get('uerbum')![0]).toMatchObject({ glosses: [], pos: 'NOUN', formOf: [{ lemma: 'verbum', tags: ['alt-of', 'orthographic-variant'] }] });
    expect(dict.get('uerbo')![0].formOf).toEqual([{ lemma: 'verbum', tags: expect.arrayContaining(['ablative', 'singular']) }]); // an inflected form copies its relations
    expect(dict.get('justus')![0].formOf).toEqual([{ lemma: 'iustus', tags: ['alt-of', 'orthographic-variant'] }]);
    expect(dict.get('jesus')![0].formOf![0].lemma).toBe('iesus');
    expect(dict.get('verbo')![0].formOf![0].lemma).toBe('verbum');
    expect(dict.get('verbum')!.some((e) => e.glosses.includes('word'))).toBe(true);
  });
  it('the source\'s own alt-of entry (jam for iam) is kept as it is', () => {
    expect(dict.get('jam')!.some((e) => e.altOf?.includes('iam'))).toBe(true);
  });
  it('the streaming builder writes the in-memory builder\'s bytes, spelling variants included', async () => {
    const mem = buildDictionary(lines, { lang: LA, normalize: latinNormalize, date: '2026-10-17', source: { file: 'kaikki-la-sample.jsonl', lines: lines.length } });
    const root = tmpDir('go-la-');
    const r = await buildDictionaryFile({ input: FIXTURE, lang: LA, outDir: root, date: '2026-10-17' });
    expect(r.stats.aliases).toBe(mem.stats.aliases);
    expect(r.stats.aliases).toBeGreaterThan(0);
    for (const [name, text] of mem.files) {
      if (name === 'manifest.json') continue;
      expect(fs.readFileSync(path.join(r.dir, name), 'utf8'), name).toBe(text);
    }
    expect(r.manifest).toMatchObject({ schema: 3, lang: 'la', id: 'kaikki-la@2026-10-17', licence: expect.stringContaining('CC BY-SA 4.0') });
  });
});

describe('full records from real kaikki lines', () => {
  it('verbum: the declension table keeps verbō (ablative singular, source declension), which normalizes to verbo', () => {
    const { key, record } = mapFullLine(line('verbum', 'noun'), latinNormalize, LA);
    expect(key).toBe('verbum');
    expect(record).toMatchObject({ w: 'verbum', p: 'NOUN' });
    const abl = record!.f!.find((f) => f.f === 'verbō' && f.t.includes('ablative') && f.t.includes('singular'));
    expect(abl).toMatchObject({ f: 'verbō', t: ['ablative', 'singular'], s: 'declension' });
    expect(latinNormalize(abl!.f)).toBe('verbo');
    expect(record!.f!.length).toBeGreaterThanOrEqual(12);
    expect(record!.tpl).toContain('la-ndecl');
    expect(record!.f!.some((f) => f.t.includes('table-tags') || f.t.includes('inflection-template'))).toBe(false);
  });
  it('verbum: the etymology keeps its templates (Proto-Italic, Proto-Indo-European, cognates) and the IPA keeps Classical and Ecclesiastical', () => {
    const { record } = mapFullLine(line('verbum', 'noun'), latinNormalize, LA);
    expect(record!.ety!.text).toMatch(/^From Proto-Italic \*werðom/);
    expect(record!.ety!.tpl).toEqual(expect.arrayContaining([{ k: 'inh', lang: 'itc-pro', form: '*werðom' }, { k: 'inh', lang: 'ine-pro', form: '*werdʰom', gloss: 'word' }]));
    expect(record!.ipa).toEqual([{ i: '[ˈwɛr.bũː]', t: ['Classical-Latin'] }, { i: '[ˈvɛr.bum]', t: ['modern Italianate Ecclesiastical'] }]);
  });
  it('amo: a conjugation table with the tense/mood/person tags and the supine and the infinitive among the principal parts', () => {
    const { record } = mapFullLine(line('amo', 'verb', 1), latinNormalize, LA);
    const f = record!.f!;
    expect(f.find((x) => x.f === 'amāvī' && x.t.includes('perfect') && x.t.includes('first-person') && x.s === 'conjugation')).toBeTruthy();
    expect(f.some((x) => x.t.includes('subjunctive'))).toBe(true);
    expect(f.some((x) => x.t.includes('participle'))).toBe(true);
    expect(f.some((x) => x.t.includes('gerund'))).toBe(true);
    expect(f.some((x) => x.t.includes('supine'))).toBe(true);
    expect(f.some((x) => x.f === 'amō' && x.t.includes('canonical'))).toBe(true);
    expect(f.length).toBeLessThanOrEqual(400);
  });
  it('an inflected-form line (esse) has no full record of its own', () => {
    expect(mapFullLine(line('esse', 'verb', 1), latinNormalize, LA)).toEqual({ skipped: 'no-senses' });
  });
  it('builds full shards and reads verbum back through the file-served source', async () => {
    const dir = tmpDir('go-la-full-');
    const out = path.join(dir, 'out');
    const r = await buildFullFile({ input: FIXTURE, lang: LA, outDir: out, date: '2026-10-17', source: { url: 'https://kaikki.org/dictionary/Latin/kaikki.org-dictionary-Latin.jsonl' } });
    expect(r.manifest).toMatchObject({ lang: 'la', source: { licence: 'CC BY-SA 4.0', attribution: 'Wiktionary, via kaikki.org — CC BY-SA 4.0' } });
    expect(r.manifest.counts.records).toBeGreaterThanOrEqual(8);
    const fetchFile = (async (input: RequestInfo | URL) => {
      const p = path.join(out, String(input).replace(/^https:\/\/dict\.test\//, '').split('?')[0]);
      return fs.existsSync(p) ? new Response(fs.readFileSync(p), { status: 200 }) : new Response('nope', { status: 404 });
    }) as typeof fetch;
    const src = createFullRecordSource(LA, { baseUrl: 'https://dict.test/', fetch: fetchFile });
    const [rec] = await src.lookup('verbum');
    expect(rec.f!.find((f) => f.f === 'verbō' && f.t.includes('ablative'))).toMatchObject({ t: ['ablative', 'singular'], s: 'declension' });
    expect(latinNormalize('verbō')).toBe('verbo');
    expect((await src.lookup('amo', 'VERB'))[0].p).toBe('VERB');
  });
});
