// Russian text helpers and the form-index store (src/adapters/russian/{text,index-store}.ts): the contract every other Russian module
// and the build scripts stand on. Stressed spellings are built with the combining acute written as an escape, never typed.
import { afterEach, describe, expect, it } from 'vitest';
import {
  hasYo, hyphenParts, impliedStress, isCyrillicWord, packStress, ruKey, ruSearchNormalize, ruSegmentSentences, ruShardLetters, ruTokenize,
  stressPositions, unpackStress, vowelCount, withStress, yoFold,
} from '../../src/adapters/russian/text';
import { installRussianIndex, lemmaOfId, lookupRussianForm, lookupRussianLemma, resetRussianIndexes, type RussianFormIndex } from '../../src/adapters/russian/index-store';

const A = '́';
const G = '̀';

describe('ruKey: the identity of a written form', () => {
  it('lower-cases, removes stress marks and soft hyphens, and keeps ё and й', () => {
    expect(ruKey(`Кни${A}гу`)).toBe('книгу');
    expect(ruKey(`ЧИТА${A}ТЬ`)).toBe('читать');
    expect(ruKey(`се${G}веро-за${A}падный`)).toBe('северо-западный');
    expect(ruKey('кни­га')).toBe('книга');
    expect(ruKey('Всё')).toBe('всё');
    expect(ruKey('мой')).toBe('мой');
  });
  it('recomposes й and ё written with combining marks, and still drops the acute beside them', () => {
    expect(ruKey('й')).toBe('й');
    expect(ruKey('ё')).toBe('ё');
    expect(ruKey(`мо${A}й`)).toBe('мой');
  });
  it('equals NFC + lower case on text without stress marks (what the pack runtime uses without the analyser)', () => {
    for (const w of ['Москва', 'ёлка', 'Из-за', 'объём', 'ЧЕЛОВЕК', 'по-русски']) expect(ruKey(w)).toBe(w.normalize('NFC').toLowerCase());
  });
  it('yoFold is the е-spelling, and search folds it', () => {
    expect(yoFold('всё')).toBe('все');
    expect(hasYo('Ёж')).toBe(true);
    expect(ruSearchNormalize(` Ё${A}лка `)).toBe('елка');
    expect(ruShardLetters('Кое-что')).toBe('коечто');
    expect(ruShardLetters('всё')).toBe('все');
  });
});

describe('stress', () => {
  it('reads the stressed vowel off a dictionary spelling, as a position in the key', () => {
    expect(stressPositions(`кни${A}гу`)).toEqual([2]);
    expect(stressPositions(`рука${A}`)).toEqual([3]);
    expect(stressPositions(`ру${A}ку`)).toEqual([1]);
    expect(stressPositions(`за${A}мок`)).toEqual([1]);
    expect(stressPositions(`замо${A}к`)).toEqual([3]);
    expect(stressPositions('книгу')).toEqual([]);
  });
  it('ignores a grave (secondary stress) and keeps two primaries of a hyphenated word', () => {
    expect(stressPositions(`се${G}веро-за${A}падный`)).toEqual([8]);
    expect(stressPositions(`ко${A}е-кто${A}`)).toEqual([1, 6]);
  });
  it('writes the mark back for display, never on ё', () => {
    expect(withStress('книгу', [2])).toBe(`кни${A}гу`);
    expect(withStress('книгу', [3])).toBe('книгу'); // a position that is not a vowel marks nothing
    expect(withStress('шёл', [1])).toBe('шёл');
    expect(withStress('книгу', [])).toBe('книгу');
    for (const w of [`прочита${A}ла`, `здра${A}вствуйте`, `ру${A}ку`]) expect(withStress(ruKey(w), stressPositions(w))).toBe(w);
  });
  it('knows what a spelling implies without a mark: ё, or the only vowel', () => {
    expect(impliedStress('шёл')).toEqual([1]);
    expect(impliedStress('ёлка')).toEqual([0]);
    expect(impliedStress('дом')).toEqual([1]);
    expect(impliedStress('книга')).toEqual([]);
    expect(impliedStress('в')).toEqual([]);
    expect(vowelCount('здравствуйте')).toBe(3);
  });
  it('packs positions compactly and unpacks them', () => {
    expect(packStress([])).toBeUndefined();
    expect(packStress([3])).toBe(3);
    expect(packStress([1, 6])).toBe('1,6');
    for (const p of [[], [3], [1, 6]]) expect(unpackStress(packStress(p))).toEqual(p);
  });
});

describe('ruTokenize', () => {
  const words = (s: string): string[] => ruTokenize(s).filter((t) => t.isWord).map((t) => t.surface);
  it('slices the text exactly and keeps a stressed word whole', () => {
    const text = `Она${A} прочита${A}ла кни${A}гу.`;
    const toks = ruTokenize(text);
    for (const t of toks) expect(text.slice(t.start, t.end)).toBe(t.surface);
    expect(toks.filter((t) => t.isWord).map((t) => t.normalized)).toEqual(['она', 'прочитала', 'книгу']);
  });
  it('joins a hyphenated word into one token, and leaves a spaced dash as punctuation', () => {
    expect(words('Кто-то пришёл из-за дождя.')).toEqual(['Кто-то', 'пришёл', 'из-за', 'дождя']);
    expect(words('Он говорит по-русски, кое-что знает.')).toEqual(['Он', 'говорит', 'по-русски', 'кое-что', 'знает']);
    expect(words('Москва — столица, а Тверь - город.')).toEqual(['Москва', 'столица', 'а', 'Тверь', 'город']);
    expect(words('какого-нибудь человека')).toEqual(['какого-нибудь', 'человека']);
    const t = ruTokenize('из-за')[0];
    expect([t.start, t.end, t.normalized]).toEqual([0, 5, 'из-за']);
    expect(hyphenParts('кто-то')).toEqual(['кто', 'то']);
    expect(hyphenParts('книга')).toEqual(['книга']);
  });
  it('keeps Latin words and numbers as tokens of their own', () => {
    const toks = ruTokenize('В 2024 году Windows обновили.');
    expect(toks.filter((t) => t.isWord).map((t) => t.surface)).toEqual(['В', 'году', 'Windows', 'обновили']);
    expect(isCyrillicWord('Windows')).toBe(false);
    expect(isCyrillicWord(`кни${A}гу`)).toBe(true);
    expect(isCyrillicWord('из-за')).toBe(true);
  });
});

describe('ruSegmentSentences', () => {
  it('splits at . ! ? … and not at a listed abbreviation', () => {
    const s = (t: string): string[] => ruSegmentSentences(t).map((x) => x.text);
    expect(s('Привет! Как дела? Хорошо.')).toEqual(['Привет!', 'Как дела?', 'Хорошо.']);
    expect(s('Он жил в г. Москве. Потом уехал.')).toEqual(['Он жил в г. Москве.', 'Потом уехал.']);
    expect(s('Это стоит 5 тыс. руб. в месяц.').length).toBe(1);
    expect(s('Первая строка\nВторая строка').length).toBe(2);
  });
});

describe('the form-index store', () => {
  afterEach(() => resetRussianIndexes());
  const index: RussianFormIndex = {
    schema: 1, id: 'test-index', source: { label: 'test', licence: 'none', url: '' }, built: '2026-11-17',
    codes: ['accusative|singular', 'nominative|plural', 'nominative|neuter|singular', 'indicative|past|plural', 'genitive|singular'],
    lemmaIds: ['книга|NOUN', 'весь|DET', 'всё|PRON', 'стать|VERB', 'сталь|NOUN'],
    lemmas: {
      'книга|NOUN': [`кни${A}га`, 'book', 'NOUN', 'Animacy=Inan|Gender=Fem', 120],
      'весь|DET': ['весь', 'all, whole', 'DET', '', 900],
      'всё|PRON': ['всё', 'everything', 'PRON', '', 300],
      'стать|VERB': ['стать', 'to become', 'VERB', 'Aspect=Perf', 400, [`станови${A}ться`]],
      'сталь|NOUN': ['сталь', 'steel', 'NOUN', 'Animacy=Inan|Gender=Fem', 5],
    },
    forms: {
      книгу: [[0, 0, 2]],
      все: [[1, 1]],
      всё: [[1, 2], [2, 2]],
      стали: [[4, 4, 2], [3, 3, 2]],
    },
    yo: { все: ['всё'] },
  };
  it('gives the source’s reading of a form, with its stress', () => {
    installRussianIndex(index);
    const hits = lookupRussianForm('книгу');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ lemmaId: 'книга|NOUN', code: 'accusative|singular', stress: [2], viaYo: false });
    expect(hits[0].lemma[1]).toBe('book');
    expect(lemmaOfId('замок|NOUN|2')).toBe('замок');
    expect(lookupRussianLemma('стать|VERB')?.[5]).toEqual([`станови${A}ться`]);
  });
  it('gives the ё-forms of an е-spelling after the form as written, marked as restored', () => {
    installRussianIndex(index);
    const hits = lookupRussianForm('все');
    expect(hits.map((h) => [h.key, h.lemmaId, h.viaYo])).toEqual([['все', 'весь|DET', false], ['всё', 'весь|DET', true], ['всё', 'всё|PRON', true]]);
    expect(lookupRussianForm('всё').every((h) => !h.viaYo)).toBe(true);
  });
  it('keeps every reading of an ambiguous form, the commoner lemma first', () => {
    installRussianIndex(index);
    expect(lookupRussianForm('стали').map((h) => h.lemmaId)).toEqual(['стать|VERB', 'сталь|NOUN']);
  });
  it('lists a reading once when the core and a shard both hold it, and knows nothing after a reset', () => {
    installRussianIndex(index);
    installRussianIndex({ ...index, id: 'test-index-2' });
    expect(lookupRussianForm('книгу')).toHaveLength(1);
    resetRussianIndexes();
    expect(lookupRussianForm('книгу')).toEqual([]);
  });
});
