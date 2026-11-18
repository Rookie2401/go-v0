/**
 * Modern Hebrew as a web page prints it (2026-11-13). The language audit read two Hebrew Wikipedia articles through the card and found
 * the commonest misses were not rare words but whole classes the Modern index lacked: prepositions with a pronoun suffix (שלהם),
 * the plural and construct forms Wiktionary gives only on an entry's headword line (פירות, נקודת), and no dictionary at all.
 *
 *   - the hand table of prepositions with pronoun suffixes (runs on the compiled core alone);
 *   - the dictionary's Hebrew aliases (a pure function over one Wiktionary line);
 *   - with the full indexes built locally: the headword-line forms, and a coverage floor on the opening of the Wikipedia article לחם
 *     (fixture, CC BY-SA 4.0, attribution in the file);
 *   - with the Hebrew dictionary built locally (public/dict/he): a pointed lemma and a printed plural both find their entry.
 *
 * The expectations are the audit's own reading of these words (an AI's, not a native speaker's).
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { heAdapter } from '../../src/adapters/he';
import { installHebrewIndex, resetHebrewIndexes, type HebrewFormIndex } from '../../src/adapters/hebrew/index-store';
import { PRONOMINAL_FORMS, pronominalGloss } from '../../src/adapters/hebrew/pronominal';
import { hebrewAliases, hebrewSpellingEntry } from '../../src/dict/hebrew';
import { createPackRuntime, PACKS } from '../../packages/language-packs/src';

const first = (sentence: string, word: string) => {
  const tokens = heAdapter.tokenize(sentence);
  const analyses = heAdapter.analyze(tokens);
  const i = tokens.findIndex((t) => t.surface === word);
  expect(i, `${word} is a token of the sentence`).toBeGreaterThanOrEqual(0);
  return analyses[i].candidates;
};

/** The hand table's reading of a word (with the compiled core alone a short sentence may read as Biblical, which puts a Tanakh reading first). */
const rule = (sentence: string, word: string) => first(sentence, word).find((c) => c.origin === 'rule');

describe('prepositions with a pronoun suffix (hand table)', () => {
  it('reads שלהם, לי, אותו, עליו as the preposition with its person, number and gender', () => {
    const shelahem = rule('הבית שלהם גדול.', 'שלהם');
    expect(shelahem).toMatchObject({ lemma: 'שֶׁל', pos: 'ADP', morph: { Person: '3', Number: 'Plur', Gender: 'Masc' }, gloss: 'their, theirs (m.)', origin: 'rule' });
    expect(rule('תן לי את הספר.', 'לי')).toMatchObject({ lemma: 'לְ', morph: { Person: '1', Number: 'Sing' }, gloss: 'to me' });
    expect(rule('ראיתי אותו אתמול.', 'אותו')).toMatchObject({ lemma: 'אֶת', morph: { Person: '3', Gender: 'Masc' }, gloss: 'him, it (object)' });
    expect(rule('דיברנו עליו הרבה.', 'עליו')).toMatchObject({ lemma: 'עַל', gloss: 'on him, it' });
  });

  it('keeps both readings of ממנו (from him / from us) and peels a leading ו or ש', () => {
    const mimenu = first('קיבלתי ממנו מכתב.', 'ממנו').filter((c) => c.origin === 'rule');
    expect(mimenu.map((c) => c.morph?.Person).sort()).toEqual(['1', '3']);
    const veshelo = rule('והבית ושלו.', 'ושלו');
    expect(veshelo).toMatchObject({ lemma: 'שֶׁל', gloss: 'and his, its' });
    expect(veshelo?.parts?.map((p) => p.text)).toEqual(['ו', 'שלו']);
  });

  it('leaves a pointed word the Tanakh index reads to that index', () => {
    // לוֹ in a pointed verse: the Open Scriptures reading stays first; the hand table is for unpointed text
    const c = first('וַיֹּאמֶר לוֹ', 'לוֹ');
    if (c.some((x) => x.origin === 'dictionary')) expect(c[0].origin).toBe('dictionary');
  });

  it('lists every person of fourteen prepositions, and the English says which', () => {
    expect(PRONOMINAL_FORMS.length).toBeGreaterThanOrEqual(14 * 9);
    expect(pronominalGloss({ english: 'with', kind: 'obj' }, 7)).toBe('with them (m.)');
    expect(pronominalGloss({ english: '', kind: 'poss' }, 0)).toBe('my, mine');
  });
});

describe('the dictionary’s Hebrew aliases (src/dict/hebrew.ts)', () => {
  const pri = JSON.stringify({ word: 'פרי', pos: 'noun', lang_code: 'he', forms: [
    { form: 'קְטִי', tags: ['class'] }, { form: 'פְּרִי', tags: ['canonical', 'masculine'] }, { form: 'pri', tags: ['romanization'] },
    { form: 'פירות', tags: ['indefinite', 'plural'] }, { form: 'פְּרִי־', tags: ['construct', 'singular'] },
    { form: 'פירותיו', tags: ['possessive'], source: 'declension' },
  ] });
  it('files the entry under its pointed spelling and its headword-line forms, with no gloss of their own', () => {
    const entry = { form: 'פרי', lang: 'he' as const, glosses: ['fruit'], pos: 'NOUN' as const };
    const aliases = hebrewAliases(pri, entry, heAdapter.normalize);
    expect(aliases.map((a) => a.form).sort()).toEqual([heAdapter.normalize('פְּרִי'), 'פירות'].sort());
    for (const a of aliases) { expect(a.glosses).toEqual([]); expect(a.formOf?.[0].lemma).toBe('פרי'); }
    expect(aliases.find((a) => a.form === 'פירות')?.formOf?.[0].tags).toEqual(['indefinite', 'plural']);
    // the class pattern, the romanization, a table cell and the construct that equals the pointed headword are not aliases
    expect(aliases.some((a) => a.form === 'pri' || a.form.includes('קְטִי') || a.form === 'פירותיו')).toBe(false);
  });
  it('leaves the pointed spelling to the real entry, not to a “defective spelling of” entry that shares it', () => {
    const nqdh = JSON.stringify({ word: 'נקדה', pos: 'noun', forms: [{ form: 'נְקֻדָּה', tags: ['canonical', 'feminine'] }] });
    expect(hebrewAliases(nqdh, { form: 'נקדה', lang: 'he', glosses: ['defective spelling of נקודה.'] }, heAdapter.normalize)).toEqual([]);
  });
  it('turns a spelling-only entry into a link to the entry it names', () => {
    const e = hebrewSpellingEntry({ form: 'נקדה', lang: 'he', glosses: ['defective spelling of נקודה.'], pos: 'NOUN' }, heAdapter.normalize);
    expect(e).toMatchObject({ form: 'נקדה', glosses: [], formOf: [{ lemma: 'נקודה', tags: ['alt-of', 'defective-spelling'] }] });
    expect(hebrewSpellingEntry({ form: 'לחם', lang: 'he', glosses: ['bread'] }, heAdapter.normalize)).toBeUndefined();
  });
  it('gives nothing for a form-of entry or an unreadable line', () => {
    expect(hebrewAliases('{', { form: 'x', lang: 'he', glosses: ['x'] }, heAdapter.normalize)).toEqual([]);
    expect(hebrewAliases(pri, { form: 'פרי', lang: 'he', glosses: [], formOf: [{ lemma: 'y', tags: [] }] }, heAdapter.normalize)).toEqual([]);
  });
});

const FULL_BIB = 'public/lexicon/he/biblical-index.json';
const FULL_MOD = 'public/lexicon/he/modern-index.json';
const hasFull = fs.existsSync(FULL_BIB) && fs.existsSync(FULL_MOD);
const modernHasHeadForms = hasFull && ((JSON.parse(fs.readFileSync(FULL_MOD, 'utf8')) as HebrewFormIndex).stats?.headRows ?? 0) > 0;

describe.skipIf(!modernHasHeadForms)('with the full indexes installed (built locally, with headword-line forms)', () => {
  beforeAll(() => {
    installHebrewIndex(JSON.parse(fs.readFileSync(FULL_BIB, 'utf8')) as HebrewFormIndex);
    installHebrewIndex(JSON.parse(fs.readFileSync(FULL_MOD, 'utf8')) as HebrewFormIndex);
  });
  afterAll(() => { resetHebrewIndexes(); });

  it('reads a Modern sentence as Modern, so the hand table’s reading of שלהם and לי comes first', () => {
    expect(first('הבית שלהם גדול.', 'שלהם')[0]).toMatchObject({ lemma: 'שֶׁל', origin: 'rule' });
    expect(first('תן לי את הספר.', 'לי')[0]).toMatchObject({ lemma: 'לְ', gloss: 'to me' });
  });

  it('reads the plural and construct forms Wiktionary gives only on the headword line', () => {
    expect(first('מיץ פירות טרי.', 'פירות').map((c) => c.lemma)).toContain('פְּרִי');
    expect(first('נקודת הרתיחה של המים.', 'נקודת').map((c) => c.lemma)).toContain('נְקֻדָּה');
  });

  it('gives a reading to at least 88 % of the words of the opening of the Wikipedia article לחם (87.2 % of two whole articles; 80.9 % before)', () => {
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/he-wikipedia-lechem.json'), 'utf8')) as { paragraphs: string[] };
    let words = 0; let read = 0; const missed: string[] = [];
    for (const para of fx.paragraphs) for (const span of heAdapter.segmentSentences(para)) {
      const tokens = heAdapter.tokenize(para.slice(span.start, span.end));
      const analyses = heAdapter.analyze(tokens);
      tokens.forEach((t, i) => {
        if (!t.isWord || !/[א-ת]/u.test(t.surface)) return;
        words++;
        if (analyses[i].candidates.length) read++; else missed.push(t.surface);
      });
    }
    expect(words).toBeGreaterThan(250);
    expect(read / words, `missed: ${missed.join(' ')}`).toBeGreaterThanOrEqual(0.88);
  });
});

const DICT = 'public/dict/he/manifest.json';
describe.skipIf(!fs.existsSync(DICT))('with the Hebrew dictionary built locally (public/dict/he)', () => {
  const fileFetch = (async (input: RequestInfo | URL) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const p = path.resolve('public', u.replace(/^[a-z]+:\/\/[^/]+\//i, '').replace(/^\/+/, ''));
    return fs.existsSync(p) ? new Response(fs.readFileSync(p), { status: 200 }) : new Response('not found', { status: 404 });
  }) as typeof fetch;
  const rt = createPackRuntime(PACKS.he, { fetch: fileFetch, baseUrl: '/' });
  const forms = (lemma: string) => [...new Set([heAdapter.normalize(lemma), ...(heAdapter.lemmaVariants?.(lemma) ?? []).map(heAdapter.normalize)])];

  it('the pack declares the dictionary that was built', () => {
    const m = JSON.parse(fs.readFileSync(DICT, 'utf8')) as { id: string; entries: number };
    expect(PACKS.he.lexical.dictionary).toMatchObject({ id: m.id, entries: m.entries });
  });
  it('a pointed lemma (as the card gives it) and a printed plural both find the entry', async () => {
    expect((await rt.gloss('לֶחֶם', 'NOUN', forms('לֶחֶם')))?.senses.map((s) => s.gloss)).toContain('bread');
    expect((await rt.gloss('נְקֻדָּה', 'NOUN', forms('נְקֻדָּה')))?.senses.map((s) => s.gloss)).toContain('point');
    expect((await rt.gloss('פירות', undefined, ['פירות']))?.senses.some((s) => /fruit/.test(s.gloss))).toBe(true);
  });
});
