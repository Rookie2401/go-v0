/**
 * The Russian gold check, in three parts.
 *
 *  1. The harness (scripts/ru-eval-ud.mts): the CoNLL-U reader, the offset alignment and every scoring rule, on tiny hand-made inputs.
 *     These always run: the figures in docs/russian/EVAL.md mean nothing until they pass.
 *  2. The fixture (test/fixtures/russian/gold-sentences.json): real sentences of UD Russian-PUD and GSD-dev with their gold tokens. Its
 *     shape is checked, every category the brief names has a sentence, and each hand-picked expectation below is checked AGAINST THE GOLD
 *     itself, so a wrong expectation cannot hide.
 *  3. The analyser: floors for the whole fixture and the hand-picked (sentence, token) cases, one reported test per case. These are
 *     skipped when there is no analyser module or no index on disk, so the suite stays green on a machine without the generated data.
 *
 * The treebanks are CC BY-SA and used only to measure; the fixture file carries the licence note.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate } from '../../src/core';
import { installRussianIndex, resetRussianIndexes, type RussianFormIndex } from '../../src/adapters/russian/index-store';
import { createRussianShardLoader, type RussianShardLoader } from '../../src/adapters/russian/shards';
import { ruKey, ruTokenize, yoFold } from '../../src/adapters/russian/text';
import {
  alignGold, compareFeatures, Counter, diskShardSource, exclusionOf, importRussian, featureAccepted, featureTargets, lemmaEqual, loadAnalyser, matchTokens,
  parseConllu, scoreToken, Tally, uposMatch, type AnalysedLike, type GoldSentence, type GoldWord, type SentenceAnalyser,
} from '../../scripts/ru-eval-ud.mts';

// ───────────────────────────── 1. the harness ─────────────────────────────

const CONLLU = [
  '# sent_id = t1',
  '# text = «Кто-то пришёл», — сказал он.',
  '1\t«\t«\tPUNCT\t``\t_\t3\tpunct\t_\tSpaceAfter=No',
  '2\tКто-то\tкто-то\tPRON\tP\tAnimacy=Anim|Case=Nom|Gender=Masc|Number=Sing\t3\tnsubj\t_\t_',
  '3\tпришёл\tприйти\tVERB\tV\tAspect=Perf|Gender=Masc|Mood=Ind|Number=Sing|Tense=Past|VerbForm=Fin|Voice=Act\t0\troot\t_\tSpaceAfter=No',
  '4\t»\t»\tPUNCT\t\'\t_\t3\tpunct\t_\tSpaceAfter=No',
  '5\t,\t,\tPUNCT\t,\t_\t3\tpunct\t_\t_',
  '6\t—\t—\tPUNCT\t-\t_\t7\tpunct\t_\t_',
  '7\tсказал\tсказать\tVERB\tV\tAspect=Perf|Gender=Masc|Mood=Ind|Number=Sing|Tense=Past|VerbForm=Fin|Voice=Act\t3\tparataxis\t_\t_',
  '8\tон\tон\tPRON\tP\tCase=Nom|Gender=Masc|Number=Sing|Person=3\t7\tnsubj\t_\tSpaceAfter=No',
  '9\t.\t.\tPUNCT\t.\t_\t3\tpunct\t_\t_',
  '',
].join('\n');

describe('harness: CoNLL-U reader and alignment', () => {
  const s = parseConllu(CONLLU, 'unit')[0];

  it('reads the sentence id, the text, the lemmas and the features', () => {
    expect(s.id).toBe('t1');
    expect(s.text).toBe('«Кто-то пришёл», — сказал он.');
    expect(s.lines).toHaveLength(9);
    const w = s.lines[2] as GoldWord;
    expect(w.form).toBe('пришёл');
    expect(w.lemma).toBe('прийти');
    expect(w.upos).toBe('VERB');
    expect(w.feats).toMatchObject({ Aspect: 'Perf', Tense: 'Past', VerbForm: 'Fin' });
    expect(w.spaceAfter).toBe(false);
    expect((s.lines[1] as GoldWord).spaceAfter).toBe(true);
    expect((s.lines[0] as GoldWord).feats).toEqual({});
  });

  it('puts every gold token at its character offsets, honouring SpaceAfter=No quotes', () => {
    const info = alignGold(s);
    expect(info).toEqual({ notFound: 0, drift: 0 });
    for (const l of s.lines) expect(s.text.slice(l.start, l.end)).toBe(l.form);
    expect((s.lines[0] as GoldWord).start).toBe(0);
    expect((s.lines[1] as GoldWord).start).toBe(1);
  });

  it('matches the hyphenated word one to one with our tokenizer, and the words around it', () => {
    alignGold(s);
    const words = ruTokenize(s.text).filter((t) => t.isWord);
    for (const l of s.lines) {
      const g = l as GoldWord;
      if (g.upos === 'PUNCT') continue;
      const m = matchTokens(g, words);
      expect('token' in m).toBe(true);
      if ('token' in m) expect(m.token.surface).toBe(g.form);
    }
    expect(words.map((t) => t.surface)).toContain('Кто-то');
  });

  it('says why a token does not align: we merged what the gold splits (по - латыни)', () => {
    const gold = parseConllu([
      '# sent_id = t2', '# text = Текст написан по-латыни.',
      '1\tТекст\tтекст\tNOUN\tN\t_\t2\tnsubj\t_\t_',
      '2\tнаписан\tнаписать\tVERB\tV\t_\t0\troot\t_\t_',
      '3\tпо\tпо\tADP\tA\t_\t5\tcase\t_\tSpaceAfter=No',
      '4\t-\t-\tPUNCT\tP\t_\t5\tpunct\t_\tSpaceAfter=No',
      '5\tлатыни\tлатыни\tNOUN\tN\t_\t2\tobl\t_\tSpaceAfter=No',
      '6\t.\t.\tPUNCT\tP\t_\t2\tpunct\t_\t_', '',
    ].join('\n'), 'unit')[0];
    alignGold(gold);
    const words = ruTokenize(gold.text).filter((t) => t.isWord);
    expect(matchTokens(gold.lines[2] as GoldWord, words)).toEqual({ cause: 'we-merged' });
    expect(matchTokens(gold.lines[4] as GoldWord, words)).toEqual({ cause: 'we-merged' });
    expect('token' in matchTokens(gold.lines[0] as GoldWord, words)).toBe(true);
  });

  it('says why a token does not align: we split what the gold keeps whole, no token of ours, a partial overlap, gold form not in the text', () => {
    const word = (start: number, end: number): { start: number; end: number } => ({ start, end });
    const t = (surface: string, start: number): ReturnType<typeof ruTokenize>[number] => ({ surface, start, end: start + surface.length, isWord: true, normalized: surface });
    expect(matchTokens(word(0, 6), [t('ab', 0), t('cd', 2), t('ef', 4)])).toEqual({ cause: 'we-split' });
    expect(matchTokens(word(10, 14), [t('ab', 0)])).toEqual({ cause: 'no-token' });
    expect(matchTokens(word(0, 4), [t('abcdef', 0)])).toEqual({ cause: 'we-merged' });
    expect(matchTokens(word(2, 6), [t('abcd', 0), t('ef', 4)])).toEqual({ cause: 'partial-overlap' });
    expect(matchTokens(word(2, 6), [t('xxxx', 4)])).toEqual({ cause: 'partial-overlap' });
    expect(matchTokens({ start: -1, end: -1 }, [])).toEqual({ cause: 'gold-not-in-text' });
  });

  it('skips a multiword range\'s members, places the range, and counts a form missing from the text', () => {
    const g = parseConllu([
      '# sent_id = t3', '# text = Дай мне вещь',
      '1\tДай\tдать\tVERB\tV\t_\t0\troot\t_\t_',
      '2-3\tмне\t_\t_\t_\t_\t_\t_\t_\t_',
      '2\tм\tя\tPRON\tP\t_\t1\tiobj\t_\t_',
      '3\tне\tя\tPRON\tP\t_\t1\tiobj\t_\t_',
      '3.1\tпусто\tпусто\tX\tX\t_\t_\t_\t_\t_',
      '4\tвещь\tвещь\tNOUN\tN\t_\t1\tobj\t_\t_',
      '5\tотсутствует\tотсутствовать\tVERB\tV\t_\t1\tconj\t_\t_', '',
    ].join('\n'), 'unit')[0];
    expect(g.emptyNodes).toBe(1);
    expect(g.lines.filter((l) => l.kind === 'word' && l.inRange)).toHaveLength(2);
    const info = alignGold(g);
    expect(info.notFound).toBe(1);
    const range = g.lines.find((l) => l.kind === 'range');
    expect(range && g.text.slice(range.start, range.end)).toBe('мне');
    const last = g.lines[g.lines.length - 1] as GoldWord;
    expect(last.start).toBe(-1);
    const noun = g.lines.find((l) => l.kind === 'word' && l.form === 'вещь') as GoldWord;
    expect(g.text.slice(noun.start, noun.end)).toBe('вещь');
  });

  it('a form found only after text the spacing did not explain is counted as drift', () => {
    const g: GoldSentence = {
      treebank: 'unit', id: 'd', text: 'а  б', emptyNodes: 0,
      lines: [
        { kind: 'word', id: '1', form: 'а', lemma: 'а', upos: 'CCONJ', feats: {}, spaceAfter: false, inRange: false, start: -1, end: -1 },
        { kind: 'word', id: '2', form: 'б', lemma: 'б', upos: 'CCONJ', feats: {}, spaceAfter: true, inRange: false, start: -1, end: -1 },
      ],
    };
    // the gold says no space after "а", the text has two: "б" is found by searching on
    expect(alignGold(g)).toEqual({ notFound: 0, drift: 1 });
    expect((g.lines[1] as GoldWord).start).toBe(3);
  });
});

describe('harness: which gold tokens are scored', () => {
  it('leaves out PUNCT, SYM, X, numerals in digits and anything with no Cyrillic letter', () => {
    expect(exclusionOf({ form: '.', upos: 'PUNCT' })).toBe('upos');
    expect(exclusionOf({ form: '%', upos: 'SYM' })).toBe('upos');
    expect(exclusionOf({ form: 'iPhone', upos: 'X' })).toBe('upos');
    expect(exclusionOf({ form: '2015', upos: 'NUM' })).toBe('digits');
    expect(exclusionOf({ form: 'Obama', upos: 'PROPN' })).toBe('no-cyrillic');
    expect(exclusionOf({ form: 'пять', upos: 'NUM' })).toBeNull();
    expect(exclusionOf({ form: 'кто-то', upos: 'PRON' })).toBeNull();
  });
});

describe('harness: scoring rules', () => {
  it('lemma: strict needs the same ё, lenient reads ё as е, case does not matter', () => {
    expect(lemmaEqual('ещё', 'еще', false)).toBe(true);
    expect(lemmaEqual('ещё', 'еще', true)).toBe(false);
    expect(lemmaEqual('её', 'ее', true)).toBe(false);
    expect(lemmaEqual('Россия', 'россия', true)).toBe(true);
    expect(lemmaEqual('кни́га', 'книга', true)).toBe(true); // the key drops the stress mark
    expect(lemmaEqual(undefined, 'книга', false)).toBe(false);
    expect(lemmaEqual('', 'книга', false)).toBe(false);
  });

  it('part of speech: AUX is VERB, CCONJ is CONJ; SCONJ may be CONJ and DET may be PRON only in the lenient reading', () => {
    expect(uposMatch('VERB', 'AUX', true)).toBe(true);
    expect(uposMatch('AUX', 'VERB', true)).toBe(true);
    expect(uposMatch('CONJ', 'CCONJ', true)).toBe(true);
    expect(uposMatch('CONJ', 'SCONJ', false)).toBe(true);
    expect(uposMatch('SCONJ', 'SCONJ', false)).toBe(true);
    expect(uposMatch('CONJ', 'SCONJ', true)).toBe(false);
    expect(uposMatch('PRON', 'DET', false)).toBe(true);
    expect(uposMatch('DET', 'DET', true)).toBe(true);
    expect(uposMatch('PRON', 'DET', true)).toBe(false);
    expect(uposMatch('NOUN', 'PROPN', false)).toBe(false); // PROPN against NOUN is an error
    expect(uposMatch(undefined, 'NOUN', false)).toBe(false);
  });

  it('features: UD Loc is our Prep or Loc, Par is Par or Gen, Degree=Pos and values outside the pack\'s vocabulary are left out', () => {
    expect(featureAccepted('Case', 'Loc')).toEqual(['Prep', 'Loc']);
    expect(featureAccepted('Case', 'Par')).toEqual(['Par', 'Gen']);
    expect(featureAccepted('Case', 'Gen')).toEqual(['Gen']);
    const t = featureTargets({ Case: 'Loc', Degree: 'Pos', Voice: 'Mid', Number: 'Ptan', Animacy: 'Inan', Polarity: 'Neg', Variant: 'Short', VerbForm: 'Conv' });
    expect(t.map((x) => x.key)).toEqual(['Case', 'Animacy', 'VerbForm', 'Variant']);
  });

  it('features: lenient takes a union that contains the gold value and forgives an absent key; strict does not', () => {
    const gold = { Case: 'Acc', Number: 'Sing', Gender: 'Masc' };
    const union = compareFeatures(gold, { Case: 'Acc,Nom', Number: 'Sing' });
    expect(union.find((f) => f.key === 'Case')).toMatchObject({ defined: true, okLenient: true, okStrict: false });
    expect(union.find((f) => f.key === 'Number')).toMatchObject({ okLenient: true, okStrict: true });
    expect(union.find((f) => f.key === 'Gender')).toMatchObject({ defined: false, okLenient: true, okStrict: false });
    const wrong = compareFeatures(gold, { Case: 'Gen', Number: 'Plur', Gender: 'Masc' });
    expect(wrong.map((f) => f.okLenient)).toEqual([false, false, true]);
    // Loc (UD) against our Prep, and Par against Gen
    expect(compareFeatures({ Case: 'Loc' }, { Case: 'Prep' })[0]).toMatchObject({ okLenient: true, okStrict: true });
    expect(compareFeatures({ Case: 'Par' }, { Case: 'Gen' })[0]).toMatchObject({ okLenient: true, okStrict: true });
    expect(compareFeatures({ Case: 'Loc' }, { Case: 'Acc,Nom' })[0].okLenient).toBe(false);
    expect(compareFeatures({ VerbForm: 'Conv' }, { VerbForm: 'Conv' })[0].okStrict).toBe(true);
    expect(compareFeatures({ Variant: 'Short' }, { Variant: 'Short' })[0].okStrict).toBe(true);
  });

  const cand = (lemma: string, pos: AnalysisCandidate['pos'], morph: Record<string, string> = {}, extra: Partial<AnalysisCandidate> = {}): AnalysisCandidate => ({ lemma, pos, morph, confidence: 0.9, ...extra });
  const gold = { lemma: 'стол', upos: 'NOUN', feats: { Case: 'Nom', Number: 'Sing', Gender: 'Masc', Animacy: 'Inan' } };

  it('a token with only unconfirmed readings is not covered and scores nothing', () => {
    const s = scoreToken(gold, [cand('стол', 'NOUN', { Case: 'Nom' }, { unconfirmed: true })]);
    expect(s.covered).toBe(false);
    expect(s.readings).toBe(0);
    expect(s.lemma1).toBe(false);
    expect(s.lemmaAny).toBe(false);
    expect(s.featComparable).toBe(false);
    expect(scoreToken(gold, []).covered).toBe(false);
  });

  it('@1 looks at the first confirmed reading, @any at all of them; unconfirmed readings are set aside', () => {
    const s = scoreToken(gold, [
      cand('стола', 'NOUN', {}, { unconfirmed: true }),
      cand('столь', 'ADV'),
      cand('стол', 'NOUN', { Case: 'Nom,Acc', Number: 'Sing', Gender: 'Masc', Animacy: 'Inan' }),
    ]);
    expect(s.covered).toBe(true);
    expect(s.readings).toBe(2);
    expect(s.multiLemma).toBe(true);
    expect(s.firstLemma).toBe('столь');
    expect(s.lemma1).toBe(false);
    expect(s.lemmaAny).toBe(true);
    expect(s.pos1).toBe(false);
    expect(s.posAny).toBe(true);
  });

  it('features@1 are judged on the first confirmed reading, lenient and strict', () => {
    const first = scoreToken(gold, [cand('стол', 'NOUN', { Case: 'Nom,Acc', Number: 'Sing', Gender: 'Masc', Animacy: 'Inan' })]);
    expect(first.lemma1).toBe(true);
    expect(first.featComparable).toBe(true);
    expect(first.feat1Lenient).toBe(true);
    expect(first.feat1Strict).toBe(false); // Case is a union
    const exact = scoreToken(gold, [cand('стол', 'NOUN', { Case: 'Nom', Number: 'Sing', Gender: 'Masc', Animacy: 'Inan' })]);
    expect(exact.feat1Strict).toBe(true);
    const bad = scoreToken(gold, [cand('стол', 'NOUN', { Case: 'Gen', Number: 'Sing' })]);
    expect(bad.feat1Lenient).toBe(false);
  });

  it('a lemma that differs only by ё is right leniently and wrong strictly', () => {
    const s = scoreToken({ lemma: 'еще', upos: 'ADV', feats: {} }, [cand('ещё', 'ADV')]);
    expect(s.lemma1).toBe(true);
    expect(s.lemma1Strict).toBe(false);
    expect(s.lemmaAnyStrict).toBe(false);
  });

  it('gold AUX against our VERB, and our AUX against gold VERB, both count', () => {
    expect(scoreToken({ lemma: 'быть', upos: 'AUX', feats: {} }, [cand('быть', 'VERB')]).pos1Strict).toBe(true);
    expect(scoreToken({ lemma: 'мочь', upos: 'VERB', feats: {} }, [cand('мочь', 'AUX')]).pos1Strict).toBe(true);
  });

  it('the tally counts per feature and over tokens; the counter ranks and keeps the first example', () => {
    const t = new Tally();
    t.add(scoreToken(gold, [cand('стол', 'NOUN', { Case: 'Nom', Number: 'Sing' })]));
    t.add(scoreToken(gold, [cand('стол', 'NOUN', { Case: 'Gen' })]));
    t.add(scoreToken(gold, []));
    expect(t.n).toBe(3);
    expect(t.covered).toBe(2);
    expect(t.lemma1).toBe(2);
    expect(t.featTokens).toBe(2);
    expect(t.feat1Lenient).toBe(1);
    expect(t.perFeature.Case).toEqual({ gold: 2, defined: 2, okLenient: 1, okStrict: 1 });
    expect(t.perFeature.Number).toEqual({ gold: 2, defined: 1, okLenient: 1, okStrict: 1 });
    expect(t.perFeature.Gender).toEqual({ gold: 2, defined: 0, okLenient: 0, okStrict: 0 });
    const c = new Counter();
    c.add('b', 'ex1'); c.add('a', 'ex2'); c.add('a', 'ex3'); c.add('c', 'ex4');
    expect(c.top(2).map((r) => [r.key, r.n, r.ex])).toEqual([['a', 2, 'ex2'], ['b', 1, 'ex1']]);
  });
});

// ───────────────────────────── 2. the fixture ─────────────────────────────

interface FixtureToken { form: string; lemma: string; upos: string; feats: string; noSpace?: boolean }
interface FixtureSentence { treebank: string; sent_id: string; text: string; tags: string[]; tokens: FixtureToken[] }
interface Fixture { licence: string; sentences: FixtureSentence[] }
const fixture = JSON.parse(fs.readFileSync('test/fixtures/russian/gold-sentences.json', 'utf8')) as Fixture;
const keyOf = (s: FixtureSentence): string => `${s.treebank}:${s.sent_id}`;
const byKey = new Map(fixture.sentences.map((s) => [keyOf(s), s]));

function toGold(s: FixtureSentence): GoldSentence {
  const feats = (f: string): Record<string, string> => Object.fromEntries(f === '_' ? [] : f.split('|').map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));
  const g: GoldSentence = {
    treebank: s.treebank, id: s.sent_id, text: s.text, emptyNodes: 0,
    lines: s.tokens.map((t, i) => ({ kind: 'word', id: String(i + 1), form: t.form, lemma: t.lemma, upos: t.upos, feats: feats(t.feats), spaceAfter: !t.noSpace, inRange: false, start: -1, end: -1 })),
  };
  alignGold(g);
  return g;
}

/** The categories the owner's brief names; every one needs a sentence in the fixture. */
const REQUIRED_TAGS = [
  'case-nom-sg', 'case-gen-sg', 'case-dat-sg', 'case-acc-sg', 'case-ins-sg', 'case-prep-sg',
  'case-nom-pl', 'case-gen-pl', 'case-dat-pl', 'case-acc-pl', 'case-ins-pl', 'case-prep-pl',
  'acc-animate', 'acc-inanimate', 'gender-masc', 'gender-fem', 'gender-neut', 'adj-agreement', 'adj-short', 'comparative', 'superlative',
  'pron-personal', 'pron-possessive', 'pron-demonstrative', 'pron-reflexive', 'pron-relative', 'pron-negative', 'numeral-noun',
  'verb-present', 'verb-past-gender', 'verb-future-perfective', 'verb-imperative', 'verb-reflexive', 'participle', 'adverbial-participle',
  'aspect-pair', 'motion-verb', 'motion-prefixed', 'yo-as-e', 'hyphenated',
];

describe('fixture: gold-sentences.json', () => {
  it('names the treebanks and the licence, and holds about sixty sentences from PUD and GSD dev', () => {
    expect(fixture.licence).toMatch(/CC BY-SA/);
    expect(fixture.licence).toMatch(/PUD/);
    expect(fixture.licence).toMatch(/GSD/);
    expect(fixture.sentences.length).toBeGreaterThanOrEqual(55);
    expect(fixture.sentences.length).toBeLessThanOrEqual(75);
    expect(new Set(fixture.sentences.map((s) => s.treebank))).toEqual(new Set(['PUD', 'GSD-dev']));
    expect(byKey.size).toBe(fixture.sentences.length); // no sentence twice
  });

  it('every sentence has its treebank, sent_id, text and gold tokens (form, lemma, UPOS, features)', () => {
    for (const s of fixture.sentences) {
      expect(s.sent_id, keyOf(s)).toMatch(/\S/);
      expect(s.text.length, keyOf(s)).toBeGreaterThan(5);
      expect(s.tokens.length, keyOf(s)).toBeGreaterThan(3);
      for (const t of s.tokens) {
        expect(t.form).toMatch(/\S/);
        expect(t.lemma).toMatch(/\S/);
        expect(t.upos).toMatch(/^[A-Z]+$/);
        expect(typeof t.feats).toBe('string');
      }
    }
  });

  it('the gold tokens line up with the text (offsets found, nothing drifting)', () => {
    for (const s of fixture.sentences) {
      const g = toGold(s);
      for (const l of g.lines) expect(l.start, `${keyOf(s)} «${l.form}»`).toBeGreaterThanOrEqual(0);
      expect(g.lines.map((l) => l.form).join(' ').replace(/ ([.,»?:;!])/g, '$1')).toBeTruthy();
    }
  });

  it.each(REQUIRED_TAGS)('covers the category %s', (tag) => {
    expect(fixture.sentences.some((s) => s.tags.includes(tag)), tag).toBe(true);
  });
});

// The hand-picked cases: each (sentence, token) was read in the gold and judged right. `feats` are in the pack's convention
// (Prep where UD writes Loc). `anyReading`: the token's case is ambiguous without a parser (Nom and Acc of an inanimate noun),
// (or the lemma is filed under several headings: этот, её), so it is enough that some reading of the lemma carries the features.
// Features the lexicon's tables do not carry for a form (Person and Number of an oblique pronoun) are not asserted.
// `gap`: a known miss of the analyser, named in words. The case is run with `it.fails`: green while the miss stands, red the day it is
// fixed, which is the cue to delete the `gap` field.
interface GoldCase { sent: string; form: string; lemma: string; feats?: Record<string, string>; anyReading?: boolean; gap?: string }
const CASES: GoldCase[] = [
  { sent: 'PUD:n02043008', form: 'чемпион', lemma: 'чемпион', feats: { Case: 'Nom', Gender: 'Masc', Animacy: 'Anim', Number: 'Sing' } },
  { sent: 'PUD:n02043008', form: 'еще', lemma: 'ещё' },
  { sent: 'PUD:w01071036', form: 'фактах', lemma: 'факт', feats: { Case: 'Prep', Number: 'Plur' } },
  { sent: 'GSD-dev:dev-s476', form: 'вступило', lemma: 'вступить', feats: { Tense: 'Past', Gender: 'Neut', Aspect: 'Perf' } },
  { sent: 'GSD-dev:dev-s31', form: 'тетей', lemma: 'тётя', feats: { Case: 'Ins', Number: 'Sing' }, anyReading: true },
  { sent: 'PUD:n02033063', form: 'головой', lemma: 'голова', feats: { Case: 'Ins', Number: 'Sing' } },
  { sent: 'GSD-dev:dev-s138', form: 'создана', lemma: 'создать', feats: { VerbForm: 'Part', Voice: 'Pass', Variant: 'Short', Gender: 'Fem' } },
  { sent: 'PUD:n01020004', form: 'блогеры', lemma: 'блогер', feats: { Case: 'Nom', Number: 'Plur', Animacy: 'Anim' } },
  { sent: 'PUD:n01020004', form: 'самолеты', lemma: 'самолёт', feats: { Case: 'Acc', Number: 'Plur' }, anyReading: true },
  { sent: 'PUD:n01057036', form: 'вопросов', lemma: 'вопрос', feats: { Case: 'Gen', Number: 'Plur', Gender: 'Masc' } },
  { sent: 'GSD-dev:dev-s89', form: 'годам', lemma: 'год', feats: { Case: 'Dat', Number: 'Plur' } },
  { sent: 'GSD-dev:dev-s89', form: 'себя', lemma: 'себя', feats: { Case: 'Acc' } },
  { sent: 'PUD:w01080129', form: 'врагов', lemma: 'враг', feats: { Case: 'Acc', Number: 'Plur' } },
  { sent: 'PUD:w01080129', form: 'пошел', lemma: 'пойти', feats: { Tense: 'Past', Gender: 'Masc', Aspect: 'Perf' } },
  { sent: 'GSD-dev:dev-s150', form: 'питомца', lemma: 'питомец', feats: { Case: 'Acc', Animacy: 'Anim', Gender: 'Masc', Number: 'Sing' } },
  { sent: 'GSD-dev:dev-s117', form: 'парами', lemma: 'пара', feats: { Case: 'Ins', Number: 'Plur' } },
  { sent: 'PUD:n01144041', form: 'ботинках', lemma: 'ботинок', feats: { Case: 'Prep', Number: 'Plur' } },
  { sent: 'PUD:n01129006', form: 'мишенью', lemma: 'мишень', feats: { Case: 'Ins', Gender: 'Fem' } },
  { sent: 'PUD:n01018024', form: 'похоже', lemma: 'похожий', feats: { Variant: 'Short', Gender: 'Neut' }, anyReading: true }, // also the adverb похоже («it seems»), which running text has more often
  { sent: 'PUD:n01027049', form: 'выше', lemma: 'высокий', feats: { Degree: 'Cmp' } },
  { sent: 'GSD-dev:dev-s194', form: 'сделан', lemma: 'сделать', feats: { VerbForm: 'Part', Voice: 'Pass', Variant: 'Short', Gender: 'Masc' } },
  { sent: 'PUD:w01115026', form: 'вернулся', lemma: 'вернуться', feats: { Tense: 'Past', Gender: 'Masc', Aspect: 'Perf' } },
  { sent: 'PUD:n02048002', form: 'ругаетесь', lemma: 'ругаться', feats: { Tense: 'Pres', Person: '2', Number: 'Plur', Aspect: 'Imp' } },
  { sent: 'PUD:w02005027', form: 'Этот', lemma: 'этот', feats: { Case: 'Nom', Gender: 'Masc', Number: 'Sing' }, anyReading: true },
  { sent: 'PUD:w01033022', form: 'которая', lemma: 'который', feats: { Case: 'Nom', Gender: 'Fem', Number: 'Sing' } },
  { sent: 'PUD:n02022015', form: 'Никто', lemma: 'никто', feats: { Case: 'Nom' } },
  { sent: 'PUD:n02022015', form: 'драматурга', lemma: 'драматург', feats: { Case: 'Gen', Number: 'Sing', Animacy: 'Anim' } },
  { sent: 'PUD:w01141137', form: 'сетах', lemma: 'сет', feats: { Case: 'Prep', Number: 'Plur' } },
  { sent: 'GSD-dev:dev-s58', form: 'Провёл', lemma: 'провести', feats: { Tense: 'Past', Gender: 'Masc', Aspect: 'Perf' } },
  { sent: 'GSD-dev:dev-s58', form: 'года', lemma: 'год', feats: { Case: 'Gen', Number: 'Sing' }, anyReading: true },
  { sent: 'GSD-dev:dev-s197', form: 'ехать', lemma: 'ехать', feats: { VerbForm: 'Inf', Aspect: 'Imp' } },
  { sent: 'PUD:n01092008', form: 'скажем', lemma: 'сказать', feats: { Tense: 'Fut', Person: '1', Number: 'Plur', Aspect: 'Perf' } },
  { sent: 'PUD:n01092008', form: 'Давайте', lemma: 'давать', feats: { Mood: 'Imp', Number: 'Plur' } },
  { sent: 'PUD:n01138026', form: 'смотрите', lemma: 'смотреть', feats: { Mood: 'Imp', Number: 'Plur', Person: '2' } },
  { sent: 'PUD:n01138026', form: 'Говорящие', lemma: 'говорить', feats: { VerbForm: 'Part', Voice: 'Act', Tense: 'Pres', Number: 'Plur' } },
  { sent: 'PUD:n02041014', form: 'прекращено', lemma: 'прекратить', feats: { VerbForm: 'Part', Voice: 'Pass', Variant: 'Short', Gender: 'Neut' } },
  { sent: 'PUD:n01029007', form: 'Будучи', lemma: 'быть', feats: { VerbForm: 'Conv' } },
  { sent: 'GSD-dev:dev-s575', form: 'Начиная', lemma: 'начинать', feats: { VerbForm: 'Conv', Aspect: 'Imp' } },
  { sent: 'GSD-dev:dev-s275', form: 'вошёл', lemma: 'войти', feats: { Tense: 'Past', Gender: 'Masc', Aspect: 'Perf' } },
  { sent: 'PUD:n01003013', form: 'дресс-код', lemma: 'дресс-код', feats: { Case: 'Nom', Gender: 'Masc' }, gap: 'a hyphenated compound the index does not hold whole and whose parts are not words (no confirmed reading)' },
  { sent: 'GSD-dev:dev-s36', form: 'чаще', lemma: 'часто', feats: { Degree: 'Cmp' } },
  { sent: 'GSD-dev:dev-s371', form: 'всё', lemma: 'весь', feats: { Case: 'Acc', Gender: 'Neut', Number: 'Sing' } },
  { sent: 'PUD:n01148035', form: 'все', lemma: 'весь', feats: { Case: 'Nom', Number: 'Plur' } },
  { sent: 'PUD:n01065073', form: 'её', lemma: 'её', anyReading: true },
  { sent: 'PUD:n01065073', form: 'ней', lemma: 'она', feats: { Case: 'Prep' } },
  { sent: 'PUD:n01065073', form: 'людьми', lemma: 'человек', feats: { Case: 'Ins', Number: 'Plur' } },
  { sent: 'PUD:n05007006', form: 'нас', lemma: 'мы', feats: { Case: 'Acc' } },
  { sent: 'PUD:n05007006', form: 'ждущих', lemma: 'ждать', feats: { VerbForm: 'Part', Voice: 'Act', Tense: 'Pres', Number: 'Plur' } },
  { sent: 'GSD-dev:dev-s190', form: 'платящие', lemma: 'платить', feats: { VerbForm: 'Part', Voice: 'Act', Tense: 'Pres', Number: 'Plur' } },
  { sent: 'PUD:n05006002', form: 'хороши', lemma: 'хороший', feats: { Variant: 'Short', Number: 'Plur' } },
  { sent: 'PUD:n01062035', form: 'вещей', lemma: 'вещь', feats: { Case: 'Gen', Number: 'Plur' } },
  { sent: 'GSD-dev:dev-s130', form: 'берёт', lemma: 'брать', feats: { Tense: 'Pres', Person: '3', Number: 'Sing', Aspect: 'Imp' } },
  { sent: 'PUD:n01077018', form: 'Мне', lemma: 'я', feats: { Case: 'Dat' } },
  { sent: 'GSD-dev:dev-s4', form: 'пойти', lemma: 'пойти', feats: { VerbForm: 'Inf', Aspect: 'Perf' } },
  { sent: 'PUD:w01144031', form: 'идти', lemma: 'идти', feats: { VerbForm: 'Inf', Aspect: 'Imp' } },
  { sent: 'PUD:w02015084', form: 'пришёл', lemma: 'прийти', feats: { Tense: 'Past', Gender: 'Masc', Aspect: 'Perf' } },
];

const caseName = (c: GoldCase): string => `${c.sent} «${c.form}» → ${c.lemma}${c.feats ? ` ${Object.entries(c.feats).map(([k, v]) => `${k}=${v}`).join(' ')}` : ''}`;
const goldTokenOf = (c: GoldCase): GoldWord | undefined => {
  const s = byKey.get(c.sent);
  return s && (toGold(s).lines.find((l) => l.kind === 'word' && l.form === c.form) as GoldWord | undefined);
};

describe('fixture: the hand-picked cases agree with the gold they were read from', () => {
  it('there are about fifty, over many sentences, and every sentence and token exists', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CASES.map((c) => c.sent)).size).toBeGreaterThanOrEqual(30);
    for (const c of CASES) expect(goldTokenOf(c), caseName(c)).toBeDefined();
  });

  it.each(CASES.map((c) => [caseName(c), c] as const))('gold agrees: %s', (_name, c) => {
    const g = goldTokenOf(c) as GoldWord;
    expect(yoFold(ruKey(g.lemma)), 'gold lemma').toBe(yoFold(ruKey(c.lemma)));
    for (const [k, v] of Object.entries(c.feats ?? {})) {
      const goldValue = g.feats[k];
      expect(goldValue, `gold has ${k}`).toBeDefined();
      const accepted = goldValue.split(',').flatMap((x) => featureAccepted(k, x));
      expect(accepted, `${k}=${v} against gold ${goldValue}`).toContain(v);
    }
  });
});

// ───────────────────────────── 3. the analyser ─────────────────────────────

const has = (name: string): boolean => fs.existsSync(`src/adapters/russian/${name}.ts`);
// RU_GOLD_MODULE=<file> points the test at another analyser module (a stub, a branch) without touching src
const OTHER_MODULE = process.env.RU_GOLD_MODULE;
const analyserAvailable = has('sentence') || has('analyze') || !!OTHER_MODULE;
const coreAvailable = has('generated/core');
const shardsAvailable = fs.existsSync('public/lexicon/ru/standard/manifest.json');
const runnable = analyserAvailable && (coreAvailable || shardsAvailable);

// Floors for the fixture as a whole: the measured value of the context-free word analyser (ruWordCandidates, 2026-11-17: 503 aligned gold
// words; coverage 95.4 %, lemma@1 89.9 %, lemma@any 94.6 %, UPOS@1 87.5 %, UPOS@any 92.0 %, features@1 lenient 91.1 %) minus about 2.5 points.
// TODO(lead): when ruAnalyze (sentence.ts) lands, run the "measured" test below, which prints the figures, and raise the floors to the new
// measured values minus a small margin.
const FLOORS = { coverage: 0.93, lemma1: 0.87, lemmaAny: 0.92, pos1: 0.85, posAny: 0.9, features1: 0.88 };

interface FixtureRun { tally: Tally; analysed: Map<string, Map<number, AnalysedLike>>; analyser: string }
let run: FixtureRun | undefined;
let loader: RussianShardLoader | undefined;

describe.skipIf(!runnable)('analyser on the gold fixture', () => {
  beforeAll(async () => {
    const analyser: { name: string; run: SentenceAnalyser } = await loadAnalyser('auto', OTHER_MODULE);
    resetRussianIndexes();
    if (coreAvailable) {
      const core = (await importRussian('generated/core')).RU_CORE as RussianFormIndex;
      installRussianIndex(core);
    }
    if (shardsAvailable) loader = await createRussianShardLoader(diskShardSource, { base: 'public/lexicon/ru/standard', maxLoaded: 64 });
    const tally = new Tally();
    const analysed = new Map<string, Map<number, AnalysedLike>>();
    for (const s of fixture.sentences) {
      const g = toGold(s);
      const tokens = ruTokenize(s.text);
      if (loader) await loader.ensure(tokens.filter((t) => t.isWord).map((t) => t.normalized));
      const result = await analyser.run(tokens);
      const byStart = new Map(result.map((a) => [a.token.start, a] as const));
      analysed.set(keyOf(s), byStart);
      const words = tokens.filter((t) => t.isWord);
      for (const l of g.lines) {
        if (l.kind !== 'word' || exclusionOf(l)) continue;
        const m = matchTokens(l, words);
        if (!('token' in m)) continue;
        tally.add(scoreToken(l, byStart.get(m.token.start)?.candidates ?? []));
      }
    }
    run = { tally, analysed, analyser: analyser.name };
  }, 120_000);

  afterAll(() => { resetRussianIndexes(); });

  const rate = (a: number, b: number): number => (b === 0 ? 0 : a / b);

  it('measured: the fixture\'s figures (copy them into FLOORS minus a small margin)', () => {
    const t = (run as FixtureRun).tally;
    const figures = {
      scored: t.n, coverage: rate(t.covered, t.n), lemma1: rate(t.lemma1, t.n), lemmaAny: rate(t.lemmaAny, t.n),
      pos1: rate(t.pos1, t.n), posAny: rate(t.posAny, t.n), features1: rate(t.feat1Lenient, t.featTokens),
    };
    console.log(`russian-gold fixture (${(run as FixtureRun).analyser}):`, JSON.stringify(figures));
    expect(t.n).toBeGreaterThan(300);
  });

  it('coverage is at least the floor', () => { const t = (run as FixtureRun).tally; expect(rate(t.covered, t.n)).toBeGreaterThanOrEqual(FLOORS.coverage); });
  it('lemma@1 is at least the floor', () => { const t = (run as FixtureRun).tally; expect(rate(t.lemma1, t.n)).toBeGreaterThanOrEqual(FLOORS.lemma1); });
  it('lemma@any is at least the floor', () => { const t = (run as FixtureRun).tally; expect(rate(t.lemmaAny, t.n)).toBeGreaterThanOrEqual(FLOORS.lemmaAny); });
  it('UPOS@1 is at least the floor', () => { const t = (run as FixtureRun).tally; expect(rate(t.pos1, t.n)).toBeGreaterThanOrEqual(FLOORS.pos1); });
  it('UPOS@any is at least the floor', () => { const t = (run as FixtureRun).tally; expect(rate(t.posAny, t.n)).toBeGreaterThanOrEqual(FLOORS.posAny); });
  it('features@1 (lenient) is at least the floor', () => { const t = (run as FixtureRun).tally; expect(rate(t.feat1Lenient, t.featTokens)).toBeGreaterThanOrEqual(FLOORS.features1); });

  const hasFeats = (c: AnalysisCandidate, feats: Record<string, string>): boolean =>
    Object.entries(feats).every(([k, v]) => (c.morph?.[k] ?? '').split(',').includes(v));

  for (const c of CASES) {
    (c.gap ? it.fails : it)(`reads ${caseName(c)}${c.gap ? ` [known gap: ${c.gap}]` : ''}`, () => {
      const s = byKey.get(c.sent) as FixtureSentence;
      const g = goldTokenOf(c) as GoldWord;
      const tokens = ruTokenize(s.text).filter((t) => t.isWord);
      const m = matchTokens(g, tokens);
      expect('token' in m, `our tokenizer gives «${c.form}» as one token`).toBe(true);
      if (!('token' in m)) return;
      const confirmed = ((run as FixtureRun).analysed.get(c.sent)?.get(m.token.start)?.candidates ?? []).filter((x) => !x.unconfirmed);
      expect(confirmed.length, 'a confirmed reading').toBeGreaterThan(0);
      const show = confirmed.map((x) => `${x.lemma} ${x.pos} ${JSON.stringify(x.morph)}`).join(' | ');
      if (c.anyReading) {
        expect(confirmed.some((x) => lemmaEqual(x.lemma, c.lemma, false) && hasFeats(x, c.feats ?? {})), `some reading of ${c.lemma} with the features: ${show}`).toBe(true);
      } else {
        expect(lemmaEqual(confirmed[0].lemma, c.lemma, false), `first lemma: ${show}`).toBe(true);
        expect(hasFeats(confirmed[0], c.feats ?? {}), `first reading's features: ${show}`).toBe(true);
      }
    });
  }
});
