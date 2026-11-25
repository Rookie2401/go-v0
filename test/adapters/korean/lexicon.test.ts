// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { koLexiconShardLetters, koStemKey, installKoreanLexicon, lookupKoreanStem, uninstallKoreanLexicon, installedKoreanLexicons, type KoLexEntry, type KoLexicon } from '../../../src/adapters/korean/index-store';
import {
  koBuildRows, koCompareRegistry, koSupplementEntries, koEntryGloss, koHomonymAliases, koIrregularClass, koNumberHomonyms, koRegularByShape, koSelectCore, koShortGloss, koSenseIsForm,
  type KoRaw, type KoRegistryRecord,
} from '../../../src/dict/korean';
import { koEntryLemma, koHomonymSetKey, koSharedPos } from '../../../src/adapters/korean/index-store';

const mk = (word: string, pos: string, over: Partial<KoRaw> = {}): KoRaw => ({
  no: 1, word, pos, hanjaForms: [], infinitives: [], hangeul: [], senses: [{ glosses: ['x'], tags: [], formOf: [], altOf: [] }], suffixed: [], counterCat: false, depCat: false, ...over,
});
const sense = (g: string, extra: Partial<KoRaw['senses'][number]> = {}): KoRaw['senses'][number] => ({ glosses: [g], tags: [], formOf: [], altOf: [], ...extra });

describe('conjugation class from the entry\'s own infinitive', () => {
  const cases: Array<[string, string, string | undefined]> = [
    ['듣', '들어', 'D'], ['춥', '추워', 'B'], ['돕', '도와', 'B'], ['짓', '지어', 'S'], ['낫', '나아', 'S'], ['하얗', '하얘', 'H'], ['그렇', '그래', 'H'],
    ['푸', '퍼', 'U'], ['모르', '몰라', 'Reu'], ['부르', '불러', 'Reu'], ['이르', '이르러', 'Reo'], ['푸르', '푸르러', 'Reo'], ['이르', '일러', 'Reu'],
    ['공부하', '공부해', 'Ha'], ['공부하', '공부하여', 'Ha'], ['하', '해', 'Ha'],
    // regular counter-examples: the shape alone would suggest an irregular class
    ['닫', '닫아', 'R'], ['잡', '잡아', 'R'], ['웃', '웃어', 'R'], ['좋', '좋아', 'R'], ['입', '입어', 'R'], ['묻', '물어', 'D'], ['묻', '묻어', 'R'],
    ['쓰', '써', 'R'], ['따르', '따라', 'R'], ['살', '살아', 'R'], ['가', '가', 'R'], ['보', '봐', 'R'], ['주', '줘', 'R'], ['마시', '마셔', 'R'], ['되', '돼', 'R'], ['바쁘', '바빠', 'R'],
  ];
  for (const [stem, inf, want] of cases) it(`${stem} + ${inf} -> ${want}`, () => expect(koIrregularClass(stem, inf)).toBe(want));
  it('leaves a form that fits nothing unclassified', () => expect(koIrregularClass('그러', '그래')).toBeUndefined());
  it('reads the class off the entry\'s forms, not the stem (걷다 walk D, 걷다 gather R)', () => {
    const { rows } = koBuildRows([
      mk('걷다', 'verb', { no: 1, etym: '1', infinitives: ['걸어'], senses: [sense('to walk')] }),
      mk('걷다', 'verb', { no: 2, etym: '2', infinitives: ['걷어'], senses: [sense('to gather')] }),
      mk('좋다', 'adj', { no: 3, infinitives: ['좋아'] }),
      mk('있다', 'verb', { no: 4 }),
    ]);
    expect(rows.map((r) => [r.lemma, r.tag, r.hom, r.irr])).toEqual([['걷다', 'VV', 1, 'D'], ['걷다', 'VV', 2, 'R'], ['좋다', 'VA', undefined, 'R'], ['있다', 'VV', undefined, 'R']]);
  });
});

describe('stem key and shard letters', () => {
  it('a predicate loses its 다, anything else is filed as written', () => {
    expect(koStemKey('먹다', 'VV')).toBe('먹');
    expect(koStemKey('예쁘다', 'VA')).toBe('예쁘');
    expect(koStemKey('다', 'NNG')).toBe('다');
    expect(koStemKey('학생', 'NNG')).toBe('학생');
    expect(koStemKey('나다', 'NNP')).toBe('나다');
  });
  it('shard letters follow the key: lead, vowel, final; Hanja by code-point block', () => {
    expect(koLexiconShardLetters('학교')).toBe('ㅎㅏㄱ');
    expect(koLexiconShardLetters('學')).toBe('H5b');
    expect(koLexiconShardLetters('abc')).toBe('');
  });
});

describe('homonym numbering', () => {
  it('uses the etymology number of each entry', () => {
    const n = koNumberHomonyms([{ lemma: '눈', tag: 'NNG', etym: '1' }, { lemma: '눈', tag: 'NNG', etym: '2' }, { lemma: '눈', tag: 'NNG', etym: '4' }, { lemma: '배', tag: 'NNG', etym: '1' }]);
    expect(n.hom).toEqual([1, 2, 4, undefined]);
    expect(n.byOrder.size).toBe(0);
  });
  it('ASSIGNS a number from 50 to an entry the source gives none, or whose number another entry of the set shares; the others keep the source number', () => {
    const a = koNumberHomonyms([{ lemma: '말', tag: 'XPN', etym: '3' }, { lemma: '말', tag: 'XPN' }]);
    expect(a.hom).toEqual([3, 50]);
    expect(a.assigned).toEqual([false, true]);
    expect(koNumberHomonyms([{ lemma: 'x', tag: 'NNG', etym: '2' }, { lemma: 'x', tag: 'NNG', etym: '2' }, { lemma: 'x', tag: 'NNG', etym: '4' }]).hom).toEqual([50, 51, 4]);
  });
  it('freezes an assigned number by fingerprint: a rebuild takes it from the registry, never from order, and a new entry takes the next free one', () => {
    const frozen = { find: (_k: string, fp: string) => (fp === 'B' ? 50 : fp === 'A' ? 51 : undefined), reserved: () => [50, 51] };
    const n = koNumberHomonyms([{ lemma: '땡', tag: 'NNG', fp: 'A' }, { lemma: '땡', tag: 'NNG', fp: 'B' }, { lemma: '땡', tag: 'NNG', fp: 'C' }], frozen);
    expect(n.hom).toEqual([51, 50, 52]);
  });
  it('a set is the spelling and the SHARED part of speech: 자 NNG and 자 NNB are both NOUN, one set; a counter is CLF, another', () => {
    expect(koNumberHomonyms([{ lemma: '자', tag: 'NNG', etym: '2' }, { lemma: '자', tag: 'NNB', etym: '5' }]).hom).toEqual([2, 5]);
    expect(koNumberHomonyms([{ lemma: '자', tag: 'NNG', etym: '2' }, { lemma: '자', tag: 'NNB', clf: true, etym: '5' }]).hom).toEqual([undefined, undefined]);
  });
  it('numbers two entries apart only within the same class; a different class is a different identity', () => {
    expect(koNumberHomonyms([{ lemma: '쓰다', tag: 'VV', etym: '1' }, { lemma: '쓰다', tag: 'VA', etym: '2' }]).hom).toEqual([undefined, undefined]);
  });
  it('merges entries of one spelling, shared part of speech and etymology number into ONE row, always: first tag, first Hanja, senses in file order', () => {
    const { rows, report } = koBuildRows([
      mk('수', 'noun', { no: 1, etym: '1', senses: [sense('way')] }),
      mk('수', 'noun', { no: 2, etym: '1', hanjaForms: ['手'], senses: [sense('move'), sense('hand')] }),
      mk('참', 'noun', { no: 3, etym: '2', senses: [sense('break')] }),
      mk('참', 'noun', { no: 4, etym: '2', senses: [sense('occasion')] }),
      mk('저', 'noun', { no: 5, etym: '1', senses: [sense('that')] }),
      mk('저', 'noun', { no: 6, etym: '2', senses: [sense('I')] }),
    ]);
    expect(rows.map((r) => [r.lemma, r.gloss, r.hom, r.hanja, r.senseCount])).toEqual([['수', 'way', undefined, '手', 3], ['참', 'break', undefined, undefined, 2], ['저', 'that', 1, undefined, 1], ['저', 'I', 2, undefined, 1]]);
    expect(report.mergedSameEtym.map((m) => m.lemma)).toEqual(['수', '참']);
    expect(rows[0].lines).toEqual([1, 2]);
  });
  it('assigns 50 up only to an entry the source gives no number, never replacing a number the source gives', () => {
    const { rows } = koBuildRows([
      mk('동', 'noun', { no: 1, etym: '2', senses: [sense('east')] }),
      mk('동', 'noun', { no: 2, hanjaForms: ['洞'], senses: [sense('district')] }),
    ]);
    expect(rows.map((r) => r.hom)).toEqual([2, 50]);
  });
  it('keeps the number when a sibling homonym is skipped as a form of another word', () => {
    const { rows } = koBuildRows([
      mk('눈', 'noun', { no: 1, etym: '1', senses: [sense('eye')] }), mk('눈', 'noun', { no: 2, etym: '3', senses: [sense('scale')] }),
      mk('눈', 'noun', { no: 3, etym: '2', senses: [sense('alternative form of 누', { formOf: ['누'] })] }),
    ]);
    expect(rows.map((r) => r.hom)).toEqual([1, 3]);
  });
  it('files a numbered entry also under its numbered headword in the dictionary', () => {
    const hom = new Map([[7, 2]]);
    expect(koHomonymAliases(hom, 7, { form: '눈', lang: 'ko' as never, glosses: ['snow'] }).map((e) => e.form)).toEqual(['눈²']);
    expect(koHomonymAliases(hom, 8, { form: '눈', lang: 'ko' as never, glosses: [] })).toEqual([]);
  });
});

describe('three states of a set', () => {
  const two = (a: Partial<KoRaw['senses'][number]>, b: Partial<KoRaw['senses'][number]> = {}, extra: Partial<KoRaw> = {}): KoRaw[] => [
    mk('저', 'pron', { no: 1, etym: '1', senses: [sense('that', a)], ...extra }),
    mk('저', 'pron', { no: 2, etym: '2', senses: [sense('I (humble)', b)] }),
  ];
  it('never takes the first etymology as main: an unreviewed set is balanced by default', () => {
    const { rows, report } = koBuildRows(two({}));
    expect(rows.map((r) => r.set)).toEqual(['balanced', 'balanced']);
    expect(report.sets[0]).toMatchObject({ state: 'balanced', by: 'default' });
  });
  it('the entry left when every other entry is only obsolete, archaic, rare, dated or dialectal is main (only-current)', () => {
    const { rows, report } = koBuildRows(two({ tags: ['obsolete'] }));
    expect(rows.map((r) => [r.hom, r.set])).toEqual([[1, 'other'], [2, 'main']]);
    expect(report.sets[0]).toMatchObject({ state: 'main', by: 'only-current', main: 2 });
    expect(koEntryLemma({ lemma: '저', hom: 2, set: 'main' })).toBe('저');
    expect(koEntryLemma({ lemma: '저', hom: 1, set: 'other' })).toBe('저¹');
  });
  it('a reviewed decision wins, and one that names a set or a number the build lacks fails with its line', () => {
    const raws = two({ tags: ['obsolete'] });
    expect(koBuildRows(raws, { decisions: { sets: [{ lemma: '저', pos: 'PRON', state: 'balanced' }] } }).report.sets[0]).toMatchObject({ state: 'balanced', by: 'decision' });
    expect(koBuildRows(raws, { decisions: { sets: [{ lemma: '저', pos: 'PRON', state: 'main', main: 1 }] } }).rows.map((r) => r.set)).toEqual(['main', 'other']);
    expect(() => koBuildRows(raws, { decisions: { sets: [{ lemma: '눈', pos: 'NOUN', state: 'balanced' }] } })).toThrow(/sets\[0\] \(눈 NOUN\)/);
    expect(() => koBuildRows(raws, { decisions: { sets: [{ lemma: '저', pos: 'PRON', state: 'main', main: 7 }] } })).toThrow(/numbered 7/);
  });
});

describe('granularity, glosses, contractions, counters, shape', () => {
  it('merges two etymologies that are one word (identical Hanja, or identical first glosses without Hanja); never two Hanja that differ', () => {
    const { rows, report } = koBuildRows([
      mk('6월', 'noun', { no: 1, hanjaForms: ['六月'], senses: [sense('June (South Korea)')] }),
      mk('6월', 'noun', { no: 2, hanjaForms: ['六月'], senses: [sense('June (North Korea)')] }),
      mk('길조', 'noun', { no: 3, etym: '1', hanjaForms: ['吉兆'], senses: [sense('a lucky sign')] }),
      mk('길조', 'noun', { no: 4, etym: '2', hanjaForms: ['吉鳥'], senses: [sense('a lucky bird')] }),
      mk('잠적', 'noun', { no: 5, etym: '1', senses: [sense('going into hiding')] }),
      mk('잠적', 'noun', { no: 6, etym: '2', senses: [sense('Going into hiding.')] }),
    ]);
    expect(rows.map((r) => [r.lemma, r.hom])).toEqual([['6월', undefined], ['길조', 1], ['길조', 2], ['잠적', undefined]]);
    expect(report.mergedSameWord).toHaveLength(2);
  });
  it('a cross-reference is never a gloss: See is skipped, synonym of X is resolved to X\'s gloss or left empty', () => {
    expect(koEntryGloss([sense('See the entry at 말-')])).toEqual({});
    expect(koEntryGloss([sense('synonym of 눈금 (nungeum)')])).toEqual({ xref: '눈금' });
    const { rows } = koBuildRows([
      mk('눈금', 'noun', { no: 1, senses: [sense('graduation mark')] }),
      mk('척도', 'noun', { no: 2, senses: [sense('synonym of 눈금 (nungeum)')] }),
      mk('저울', 'noun', { no: 3, senses: [sense('synonym of 없는말 (x)')] }),
      mk('말', 'prefix', { no: 4, senses: [sense('See the entry at 말-')] }),
    ]);
    expect(rows.map((r) => [r.lemma, r.gloss])).toEqual([['눈금', 'graduation mark'], ['척도', '= 눈금: graduation mark'], ['저울', undefined]]);
  });
  it('checks the reviewed gloss overrides: positions must exist, a line needs a sense unless own, own sets glossOwn, an unknown line fails', () => {
    const raws = [mk('위하다', 'verb', { no: 1, senses: [sense('to help'), sense('to say')] })];
    const o = (extra: object) => ({ overrides: { entries: [{ lemma: '위하다', pos: 'VERB', hom: 0, gloss: 'for the sake of', ...extra }] } });
    const ok = koBuildRows(raws, o({ senses: [1, 2] })).rows[0];
    expect(ok.gloss).toBe('for the sake of');
    expect(ok.glossOwn).toBeUndefined();
    expect(koBuildRows(raws, o({ own: true })).rows[0].glossOwn).toBe(true);
    expect(() => koBuildRows(raws, o({ senses: [3] }))).toThrow(/do not exist/);
    expect(() => koBuildRows(raws, o({}))).toThrow(/at least one sense/);
    expect(() => koBuildRows(raws, { overrides: { entries: [{ lemma: '없다', pos: 'ADJ', gloss: 'x', senses: [1] }] } })).toThrow(/names no entry/);
  });
  it('files a contraction of a headword with its class and gloss; a contraction of a word plus particle is listed, not filed', () => {
    const { rows, report } = koBuildRows([
      mk('무어', 'pron', { no: 1, senses: [sense('what')] }),
      mk('뭐', 'pron', { no: 2, senses: [{ glosses: ['contraction of 무어 (mueo): (interrogative) what'], tags: ['contraction', 'alt-of'], formOf: [], altOf: ['무어'] }] }),
      mk('전', 'pron', { no: 3, senses: [{ glosses: ['contraction of 저는 (jeoneun)'], tags: ['contraction', 'alt-of'], formOf: [], altOf: ['저는'] }] }),
    ]);
    expect(rows.map((r) => [r.lemma, r.tag, r.gloss])).toEqual([['무어', 'NP', 'what'], ['뭐', 'NP', 'what']]);
    expect(report.contractionFused).toEqual([{ word: '전', target: '저는' }]);
  });
  it('a counter is NNB with clf; a bound noun is NNB without; shape-regular predicates without a table get R', () => {
    const { rows } = koBuildRows([
      mk('개', 'counter', { no: 1 }),
      mk('것', 'noun', { no: 2, senses: [{ glosses: ['thing'], tags: ['dependent'], formOf: [], altOf: [] }] }),
      mk('가다', 'verb', { no: 3 }), mk('하다', 'verb', { no: 4 }), mk('듣다', 'verb', { no: 5 }),
    ]);
    expect(rows.map((r) => [r.tag, r.clf, r.irr])).toEqual([['NNB', true, undefined], ['NNB', undefined, undefined], ['VV', undefined, 'R'], ['VV', undefined, undefined], ['VV', undefined, undefined]]);
    expect(koRegularByShape('먹다')).toBe(true);
    expect(koRegularByShape('쓰다')).toBe(false);
    expect(koSharedPos({ tag: 'NNB', clf: true })).toBe('CLF');
    expect(koHomonymSetKey({ lemma: '자', tag: 'NNB' })).toBe(koHomonymSetKey({ lemma: '자', tag: 'NNG' }));
  });
});

describe('the hand-written supplement', () => {
  const src = [
    mk('자', 'noun', { no: 1, etym: '2', senses: [sense('ruler, straightedge')] }),
    mk('가다', 'verb', { no: 2, infinitives: ['가'], senses: [sense('to go')] }),
  ];
  const sup = (entries: object[]) => ({ supplement: { entries: entries as never } });
  it('adds a word the source lacks (no hom), marked own, and joins a set with a hand-fixed number from 90', () => {
    const { rows, report } = koBuildRows(src, sup([
      { lemma: '파악', tag: 'NNG', gloss: 'grasp; understanding', hanja: '把握' },
      { lemma: '자', tag: 'NNB', hom: 91, gloss: 'person; one who', hanja: '者' },
      { lemma: '당연하다', tag: 'VA', irr: 'Ha', gloss: 'to be natural' },
    ]));
    const by = (l: string) => rows.find((r) => r.lemma === l && (l !== '자' || r.own))!;
    expect(by('파악')).toMatchObject({ own: true, glossOwn: true });
    expect(by('파악').hom).toBeUndefined();
    expect(by('파악').set).toBeUndefined();
    expect(by('자')).toMatchObject({ own: true, glossOwn: true, hom: 91, set: 'balanced' });
    expect(rows.find((r) => r.lemma === '자' && !r.own)).toMatchObject({ hom: 2, set: 'balanced' });
    expect(by('당연하다').irr).toBe('Ha');
    expect(report.supplement).toHaveLength(3);
  });
  it('takes part in the three states: a decision may name main 91', () => {
    const { rows } = koBuildRows(src, { ...sup([{ lemma: '자', tag: 'NNB', hom: 91, gloss: 'person', hanja: '者' }]), decisions: { sets: [{ lemma: '자', pos: 'NOUN', state: 'main', main: 91 }] } });
    expect(rows.filter((r) => r.lemma === '자').map((r) => [r.hom, r.set])).toEqual([[2, 'other'], [91, 'main']]);
  });
  const fails = (entry: object, re: RegExp) => expect(() => koBuildRows(src, sup([entry]))).toThrow(re);
  it('fails, naming the line, on an unknown tag, a predicate without irr, a duplicate of the source, a missing or low hom, a hom where none is allowed', () => {
    fails({ lemma: '파악', tag: 'XX', gloss: 'g' }, /entries\[0\] \(파악 XX\): unknown tag/);
    fails({ lemma: '당연하다', tag: 'VA', gloss: 'g' }, /needs irr/);
    fails({ lemma: '자', tag: 'NNG', gloss: 'ruler', hom: 95 }, /never shadows the source|hom of 90/);
    fails({ lemma: '자', tag: 'NNB', gloss: 'person' }, /needs a hand-fixed hom of 90 or more/);
    fails({ lemma: '자', tag: 'NNB', gloss: 'person', hom: 5 }, /needs a hand-fixed hom of 90 or more/);
    fails({ lemma: '파악', tag: 'NNG', gloss: 'grasp', hom: 90 }, /has no hom/);
    expect(() => koBuildRows(src, sup([{ lemma: '자', tag: 'NNB', gloss: 'a', hom: 91, hanja: '者' }, { lemma: '자', tag: 'NNB', gloss: 'b', hom: 91, hanja: '子' }]))).toThrow(/used twice/);
    expect(() => koBuildRows(src, sup([{ lemma: '파악', tag: 'NNG', gloss: 'a' }, { lemma: '파악', tag: 'NNG', gloss: 'b' }]))).toThrow(/another supplement line/);
  });
  it('shows the meaning in the dictionary under its headword and numbered headword, labelled as this product\'s wording', () => {
    const es = koSupplementEntries(sup([{ lemma: '자', tag: 'NNB', hom: 91, gloss: 'person', hanja: '者' }, { lemma: '파악', tag: 'NNG', gloss: 'grasp' }]) as never);
    expect(es.map((e) => e.form)).toEqual(['자', '자⁹¹', '파악']);
    expect(es[0].senses?.[0]).toEqual({ gloss: 'person', tags: ['own-wording'] });
  });
  it('is absent without harm', () => expect(koBuildRows(src, {}).rows).toHaveLength(2));
});

describe('gloss rule', () => {
  it('cuts at the first top-level comma or semicolon, strips a leading label, at most 80 characters', () => {
    expect(koShortGloss('to do; used to vaguely refer to almost any action')).toBe('to do');
    expect(koShortGloss('(of a person) kind, gentle')).toBe('kind');
    expect(koShortGloss('scale (on a ruler, gauge), unit')).toBe('scale (on a ruler, gauge)');
    expect(koShortGloss('passive of 듣다 (deutda, “to hear”):')).toBe('passive of 듣다 (deutda, “to hear”)');
    expect(koShortGloss('word '.repeat(30)).length).toBeLessThanOrEqual(81);
  });
  it('takes the first sense that is not a form of, its most specific gloss', () => {
    const senses = [
      sense('passive of 듣다 (deutda)', { tags: ['form-of', 'passive'], formOf: ['듣다'] }),
      { glosses: ['passive of 듣다 (deutda):', 'to be heard'], tags: [], formOf: [], altOf: [] },
    ];
    expect(koEntryGloss(senses)).toEqual({ gloss: 'to be heard' });
    expect(koSenseIsForm(sense('North Korean form of 원'))).toBe(true);
    expect(koSenseIsForm(sense('alternative spelling of PC방'))).toBe(true);
    expect(koSenseIsForm(sense('school'))).toBe(false);
  });
});

describe('voice', () => {
  it('reads passive and causative from the entry\'s own first sense and from a verb set (arg 2 causative, arg 3 passive)', () => {
    const { rows } = koBuildRows([
      mk('먹다', 'verb', { no: 1, verbSet: ['먹다', '먹이다', '먹히다'] }),
      mk('먹이다', 'verb', { no: 2 }),
      mk('먹히다', 'verb', { no: 3 }),
      mk('들리다', 'verb', { no: 4, etym: '1', senses: [sense('passive of 듣다 (deutda)', { tags: ['form-of'], formOf: ['듣다'] }), sense('to be heard')] }),
      mk('들리다', 'verb', { no: 5, etym: '3', senses: [sense('to be haunted')] }),
    ]);
    const by = (l: string, h?: number) => rows.find((r) => r.lemma === l && r.hom === h)!;
    expect(by('먹이다')).toMatchObject({ voice: 'Caus', base: '먹다' });
    expect(by('먹히다')).toMatchObject({ voice: 'Pass', base: '먹다' });
    expect(by('들리다', 1)).toMatchObject({ voice: 'Pass', base: '듣다', gloss: 'to be heard' });
    expect(by('들리다', 3).voice).toBeUndefined();
  });
});

describe('core selection: a homonym set goes in whole or not at all', () => {
  const e = (lemma: string, tag: string, hom: number | undefined, n: number, gloss = 'a gloss that takes some room'): KoLexEntry => ({ lemma, tag: tag as KoLexEntry['tag'], ...(hom ? { hom } : {}), gloss, ...(n ? { n } : {}) });
  const all = [e('눈', 'NNG', 1, 100), e('눈', 'NNG', 2, 0), e('눈', 'NNG', 3, 0), e('책', 'NNG', undefined, 50), e('나', 'NP', undefined, 0), e('가', 'NNG', undefined, 0)];
  it('takes closed classes whole, then open sets by count; never part of a set', () => {
    for (const budget of [0, 200, 330, 400, 10_000]) {
      const { chosen } = koSelectCore(all, budget);
      const nun = chosen.filter((x) => x.lemma === '눈');
      expect(nun.length === 0 || nun.length === 3).toBe(true);
      if (nun.length) expect(nun.map((x) => x.hom).sort()).toEqual([1, 2, 3]);
      expect(chosen.some((x) => x.lemma === '나')).toBe(true); // closed class
      expect(chosen.some((x) => x.lemma === '가')).toBe(false); // never seen, open class
    }
    expect(koSelectCore(all, 10_000).chosen.map((x) => x.lemma)).toContain('책');
  });
});

describe('the homonym registry guard', () => {
  const r = (hom: number, gloss: string, extra: Partial<KoRegistryRecord> = {}): KoRegistryRecord => ({ lemma: '눈', tag: 'NNG', hom, gloss, ...extra });
  const old = [r(1, 'eye'), r(2, 'snow'), r(3, 'scale', { hanja: '嫩' })];
  it('passes an identical registry', () => expect(koCompareRegistry(old, old)).toEqual({ failures: [], warnings: [] }));
  it('(a) fails when a number\'s fingerprint changed (hanja, irr or voice)', () => {
    expect(koCompareRegistry(old, [r(1, 'eye'), r(2, 'snow'), r(3, 'scale', { hanja: '眼' })]).failures[0]).toMatch(/^\(a\)/);
    const v = [{ lemma: '묻다', tag: 'VV', hom: 1, gloss: 'ask', irr: 'D' }, { lemma: '묻다', tag: 'VV', hom: 2, gloss: 'bury', irr: 'R' }];
    expect(koCompareRegistry(v, [{ ...v[0], irr: 'R' }, v[1]]).failures[0]).toMatch(/^\(a\)/);
    expect(koCompareRegistry(v, [{ ...v[0], voice: 'Pass' }, v[1]]).failures[0]).toMatch(/^\(a\)/);
  });
  it('(b) fails when the numbers are the same but the glosses are permuted', () => {
    const f = koCompareRegistry(old, [r(1, 'snow'), r(2, 'eye'), r(3, 'scale', { hanja: '嫩' })]).failures;
    expect(f.some((x) => x.startsWith('(b)'))).toBe(true);
  });
  it('(c) fails when an old number disappeared while a new one appeared', () => {
    expect(koCompareRegistry(old, [r(1, 'eye'), r(2, 'snow'), r(4, 'scale', { hanja: '嫩' })]).failures.some((x) => x.startsWith('(c)'))).toBe(true);
  });
  it('only warns for a gloss that changed wording under the same fingerprint', () => {
    const res = koCompareRegistry(old, [r(1, 'eye (organ)'), r(2, 'snow'), r(3, 'scale', { hanja: '嫩' })]);
    expect(res.failures).toEqual([]);
    expect(res.warnings).toHaveLength(1);
  });
  it('(d) fails when the state of an entry changed, except a default settled by a decision', () => {
    const a = [{ lemma: '시간', tag: 'NNG', hom: 1, set: 'balanced', by: 'default', gloss: 'time' }, { lemma: '시간', tag: 'NNG', hom: 2, set: 'balanced', by: 'default', gloss: 'hour' }];
    const main = a.map((x, i) => ({ ...x, set: i === 0 ? 'main' : 'other' }));
    expect(koCompareRegistry(a, main.map((x) => ({ ...x, by: 'only-current' }))).failures.some((x) => x.startsWith('(d)'))).toBe(true);
    expect(koCompareRegistry(a, main.map((x) => ({ ...x, by: 'decision' }))).failures).toEqual([]);
    const auto = a.map((x, i) => ({ ...x, set: i === 0 ? 'main' : 'other', by: 'only-current' }));
    expect(koCompareRegistry(auto, a.map((x) => ({ ...x, set: 'balanced', by: 'decision' }))).failures).toEqual([]);
    expect(koCompareRegistry(auto.map((x) => ({ ...x, by: 'decision' })), a.map((x) => ({ ...x, set: 'balanced', by: 'decision' }))).failures.some((x) => x.startsWith('(d)'))).toBe(true);
  });
  it('a set that gained a member is not a failure', () => expect(koCompareRegistry(old, [...old, r(4, 'bud')]).failures).toEqual([]));
});

// ───────────────────────────── the real built lexicon ─────────────────────────────

const SHARDS = path.resolve('public/lexicon/ko/standard');
const DICT = path.resolve('public/dict/ko/manifest.json');
const built = fs.existsSync(path.join(SHARDS, 'manifest.json'));
const shardLexicons: KoLexicon[] = [];
const byKey = new Map<string, KoLexEntry[]>();
let KO_CORE_REAL: KoLexicon;

const find = (lemma: string, tag?: string): KoLexEntry[] => (byKey.get(koStemKey(lemma, tag ?? 'NNG')) ?? []).filter((x) => x.lemma === lemma && (!tag || x.tag === tag));
const findPred = (lemma: string): KoLexEntry[] => (byKey.get(lemma.slice(0, -1)) ?? []).filter((x) => x.lemma === lemma);

describe.skipIf(!built)('the real lexicon', () => {
  beforeAll(async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(SHARDS, 'manifest.json'), 'utf8')) as { shards: Record<string, { file: string }> };
    for (const s of Object.values(manifest.shards)) {
      const lex = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(SHARDS, s.file))).toString('utf8')) as KoLexicon;
      shardLexicons.push(lex);
      for (const [k, v] of Object.entries(lex.entries)) byKey.set(k, v);
    }
    KO_CORE_REAL = (await import('../../../src/adapters/korean/generated/core')).KO_CORE;
  });

  it('classifies the conjugation of known verbs from their own tables', () => {
    expect(findPred('듣다').map((x) => x.irr)).toContain('D');
    expect(findPred('춥다')[0].irr).toBe('B');
    expect(findPred('짓다')[0].irr).toBe('S');
    expect(findPred('모르다')[0].irr).toBe('Reu');
    expect(findPred('하얗다')[0].irr).toBe('H');
    expect(findPred('이르다').map((x) => x.irr)).toContain('Reo');
    expect(findPred('공부하다')[0].irr).toBe('Ha');
    for (const w of ['잡다', '웃다', '좋다']) expect(findPred(w)[0].irr, w).toBe('R');
    expect(findPred('닫다').map((x) => x.irr)).toContain('R');
  });

  it('numbers homonyms by the source\'s etymology number, with their own glosses', () => {
    const nun = find('눈', 'NNG');
    expect(nun.length).toBeGreaterThanOrEqual(2);
    expect(new Set(nun.map((x) => x.hom)).size).toBe(nun.length);
    expect(new Set(nun.map((x) => x.gloss)).size).toBe(nun.length);
    expect(nun.every((x) => x.hom !== undefined)).toBe(true);
  });

  it('has the verbs spelled alike with different conjugation classes (묻다 ask D / bury R)', () => {
    const m = findPred('묻다').filter((x) => x.tag === 'VV');
    expect(m.length).toBeGreaterThanOrEqual(2);
    expect(new Set(m.map((x) => x.irr)).size).toBeGreaterThanOrEqual(2);
  });

  it('keeps the Hanja and the source\'s pronunciation of 학교, and files it under its Hanja key', () => {
    const h = find('학교', 'NNG')[0];
    expect(h.hanja).toBe('學校');
    expect(h.pron).toBe('학꾜');
    expect(byKey.get('學校')?.some((x) => x.lemma === '학교')).toBe(true);
  });

  it('never gives two entries of different etymologies the same lemma string and shared part of speech', () => {
    const seen = new Map<string, string>();
    for (const [key, rows] of byKey) for (const e of rows) {
      if (koStemKey(e.lemma, e.tag) !== key) continue;
      const id = `${koEntryLemma(e)}\u0000${koSharedPos(e) ?? e.tag}`;
      expect(seen.has(id), id).toBe(false);
      seen.set(id, e.lemma);
    }
    expect(seen.size).toBeGreaterThan(30000);
  });

  it.skipIf(!fs.existsSync('docs/korean/lexicon-supplement.json'))('carries the supplement rows as own, with their hand-fixed numbers, and assigned numbers from 50', () => {
    const own = [...byKey.values()].flat().filter((e) => e.own);
    expect(own.length).toBeGreaterThan(50);
    expect(own.every((e) => e.glossOwn === true && !!e.gloss)).toBe(true);
    expect(own.filter((e) => e.hom !== undefined).every((e) => e.hom! >= 90)).toBe(true);
    const ja = find('자', 'NNB').find((e) => e.own);
    expect(ja).toMatchObject({ hom: 91, hanja: '者' });
    const dong = find('동', 'NNG').filter((e) => e.hanja === '洞');
    expect(dong[0].hom).toBeGreaterThanOrEqual(50);
    expect(dong[0].hom).toBeLessThan(90);
  });

  it('gives a numbered entry its state, and a counter its clf', () => {
    for (const rows of byKey.values()) for (const e of rows) expect(e.hom !== undefined, `${e.lemma} ${e.tag}`).toBe(e.set !== undefined);
    expect(find('개', 'NNB').some((e) => e.clf)).toBe(true);
  });

  it('puts every field of a word in the core as it is in the shards', () => {
    for (const [key, rows] of Object.entries(KO_CORE_REAL.entries)) for (const c of rows) {
      const s = (byKey.get(key) ?? []).find((x) => x.lemma === c.lemma && x.tag === c.tag && x.hom === c.hom && !!x.clf === !!c.clf);
      expect(s, `${key}: ${c.lemma} ${c.tag} ${c.hom}`).toBeDefined();
      expect(c, `${key}: ${c.lemma}`).toEqual(s);
    }
  });

  it('puts the same number, conjugation class and voice on a word in the core and in the shards', () => {
    expect(Object.keys(KO_CORE_REAL.entries).length).toBeGreaterThan(1000);
    for (const [key, rows] of Object.entries(KO_CORE_REAL.entries)) {
      const full = byKey.get(key) ?? [];
      for (const c of rows) {
        const s = full.find((x) => x.lemma === c.lemma && x.tag === c.tag && x.hom === c.hom);
        expect(s, `${key}: ${c.lemma} ${c.tag} ${c.hom}`).toBeDefined();
        expect([s!.irr, s!.voice]).toEqual([c.irr, c.voice]);
      }
    }
    const nunCore = (KO_CORE_REAL.entries['눈'] ?? []).filter((x) => x.lemma === '눈' && x.tag === 'NNG');
    expect(nunCore.map((x) => x.hom).sort()).toEqual(find('눈', 'NNG').map((x) => x.hom).sort());
  });

  it('holds every member of a homonym set of the core, or none', () => {
    const sets = new Map<string, number>();
    for (const [key, rows] of Object.entries(KO_CORE_REAL.entries)) for (const e of rows) if (koStemKey(e.lemma, e.tag) === key) sets.set(`${e.lemma} ${e.tag}`, (sets.get(`${e.lemma} ${e.tag}`) ?? 0) + 1);
    for (const [k, n] of sets) {
      const [lemma, tag] = k.split('\u0000');
      const full = (byKey.get(koStemKey(lemma, tag)) ?? []).filter((x) => x.lemma === lemma && x.tag === tag).length;
      expect(n, k).toBe(full);
    }
  });

  it('compiled core contains the commonest words', () => {
    const has = (lemma: string, tag: string): boolean => (KO_CORE_REAL.entries[koStemKey(lemma, tag)] ?? []).some((x) => x.lemma === lemma);
    for (const [l, t] of [['하다', 'VV'], ['있다', 'VV'], ['있다', 'VA'], ['없다', 'VA'], ['되다', 'VV'], ['사람', 'NNG'], ['것', 'NNB']] as const) {
      const ok = has(l, t) || has(l, 'VV') || has(l, 'VA') || has(l, 'NNG');
      expect(ok, `${l} ${t}`).toBe(true);
    }
  });

  it('answers a lookup once per (lemma, tag, hom) with the core AND the shards installed', () => {
    for (const id of installedKoreanLexicons()) uninstallKoreanLexicon(id.split('#')[0]);
    installKoreanLexicon(KO_CORE_REAL);
    for (const lex of shardLexicons) installKoreanLexicon(lex);
    for (const key of Object.keys(KO_CORE_REAL.entries)) {
      const hits = lookupKoreanStem(key);
      const ids = hits.map((h) => JSON.stringify([h.entry.lemma, h.entry.tag, !!h.entry.clf, h.entry.hom ?? 0]));
      expect(new Set(ids).size, key).toBe(ids.length);
    }
    for (const id of installedKoreanLexicons()) uninstallKoreanLexicon(id.split('#')[0]);
  });
});

describe.skipIf(!fs.existsSync(DICT))('the real dictionary', () => {
  it('answers 눈² with one entry and 눈 with all of them', () => {
    const dir = path.dirname(DICT);
    const read = (form: string): number => {
      let n = 0;
      for (const f of fs.readdirSync(dir)) if (/^s-.*\.json$/.test(f)) { const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Record<string, unknown[]>; n += (j[form] ?? []).length; }
      return n;
    };
    expect(read('눈²')).toBe(1);
    expect(read('눈')).toBeGreaterThanOrEqual(4);
  });
});

