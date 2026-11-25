// @vitest-environment node
/**
 * The Korean "All forms" table (src/adapters/korean/paradigm.ts, tags.ts): the tables of one word of each conjugation class, the
 * descriptive verb with no command, the copulas, the existentials, the honorific lexeme, a numbered homonym and a balanced bare lemma,
 * nouns with and without a final consonant; every generated cell read back through the analyser (the consistency check between the
 * generator and the analyser, with the analyser's known gaps listed so a fix is noticed); the dictionary's own table mapped through
 * `featuresFromTableTags` and merged by the real `buildParadigm` (skipped when the dictionary is not built); the cells a reading occupies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GeneratedParadigm, Paradigm, PartOfSpeech } from '../../../src/core';
import { featureKey, paradigmSummary } from '../../../src/core/paradigm';
import { koAdapter } from '../../../src/adapters/ko';
import { koAnalyzeToken } from '../../../src/adapters/korean/analyze';
import { koBareLemma } from '../../../src/adapters/korean/index-store';
import { koFeaturesFromTableTags, koGlossIsPersonOrAnimal, koPredicateRows } from '../../../src/adapters/korean/paradigm';
import { koCellCompatible, koCellsFor, koMorphFromTags, koTableSlot, koFeaturesFromTableTagsPlain } from '../../../src/adapters/korean/tags';
import { createFullRecordSource } from '../../../src/dict/full';
import { buildParadigm, pickRecord, type LexicalRecord } from '../../../packages/golearn-extension/src/content/enrich';
import { installFixtureLexicon, uninstallFixtureLexicon } from './fixture-lexicon';

beforeAll(() => installFixtureLexicon());
afterAll(() => uninstallFixtureLexicon());

const para = (lemma: string, pos: PartOfSpeech): GeneratedParadigm => {
  const p = koAdapter.paradigm!(lemma, pos);
  if (!p) throw new Error(`no paradigm for ${lemma}`);
  return p;
};
/** The form of a slot in the plain or honorific column (the first form is the one shown). */
const form = (p: GeneratedParadigm, slot: string, hon = false): string | undefined => p.cells.find((c) => c.features.Slot === slot && c.features.Honorific === (hon ? 'Subj' : 'No'))?.form;
const forms = (p: GeneratedParadigm, slot: string, hon = false): string[] => p.cells.filter((c) => c.features.Slot === slot && c.features.Honorific === (hon ? 'Subj' : 'No')).map((c) => c.form);
/** A noun cell by slot and number (the noun table has no honorific column). */
const nform = (p: GeneratedParadigm, slot: string, number = 'Sing'): string | undefined => p.cells.find((c) => c.features.Slot === slot && c.features.Number === number)?.form;
const nforms = (p: GeneratedParadigm, slot: string): string[] => p.cells.filter((c) => c.features.Slot === slot && c.features.Number === 'Sing').map((c) => c.form);
const slots = (p: GeneratedParadigm): string[] => [...new Set(p.cells.map((c) => c.features.Slot))];

// ───────────────────────────── one verb of each conjugation class ─────────────────────────────

type Expect = { lemma: string; pos: PartOfSpeech; stems: [string, string, string]; polite: string; formal: string; plain: string; past: string; if: string; hon: string; adn: [string, string | undefined] };
const CLASSES: Expect[] = [
  { lemma: '먹다', pos: 'VERB', stems: ['먹', '먹으', '먹어'], polite: '먹어요', formal: '먹습니다', plain: '먹는다', past: '먹었어요', if: '먹으면', hon: '먹으세요', adn: ['먹는', '먹은'] }, // R, consonant stem
  { lemma: '가다', pos: 'VERB', stems: ['가', '가', '가'], polite: '가요', formal: '갑니다', plain: '간다', past: '갔어요', if: '가면', hon: '가세요', adn: ['가는', '간'] }, // R, vowel stem
  { lemma: '하다', pos: 'VERB', stems: ['하', '하', '해'], polite: '해요', formal: '합니다', plain: '한다', past: '했어요', if: '하면', hon: '하세요', adn: ['하는', '한'] }, // Ha
  { lemma: '듣다', pos: 'VERB', stems: ['듣', '들으', '들어'], polite: '들어요', formal: '듣습니다', plain: '듣는다', past: '들었어요', if: '들으면', hon: '들으세요', adn: ['듣는', '들은'] }, // D
  { lemma: '돕다', pos: 'VERB', stems: ['돕', '도우', '도와'], polite: '도와요', formal: '돕습니다', plain: '돕는다', past: '도왔어요', if: '도우면', hon: '도우세요', adn: ['돕는', '도운'] }, // B (와)
  { lemma: '춥다', pos: 'ADJ', stems: ['춥', '추우', '추워'], polite: '추워요', formal: '춥습니다', plain: '춥다', past: '추웠어요', if: '추우면', hon: '추우세요', adn: ['추운', undefined] }, // B (워), descriptive
  { lemma: '짓다', pos: 'VERB', stems: ['짓', '지으', '지어'], polite: '지어요', formal: '짓습니다', plain: '짓는다', past: '지었어요', if: '지으면', hon: '지으세요', adn: ['짓는', '지은'] }, // S
  { lemma: '파랗다', pos: 'ADJ', stems: ['파랗', '파라', '파래'], polite: '파래요', formal: '파랗습니다', plain: '파랗다', past: '파랬어요', if: '파라면', hon: '파라세요', adn: ['파란', undefined] }, // H
  { lemma: '그렇다', pos: 'ADJ', stems: ['그렇', '그러', '그래'], polite: '그래요', formal: '그렇습니다', plain: '그렇다', past: '그랬어요', if: '그러면', hon: '그러세요', adn: ['그런', undefined] }, // H, demonstrative
  { lemma: '모르다', pos: 'VERB', stems: ['모르', '모르', '몰라'], polite: '몰라요', formal: '모릅니다', plain: '모른다', past: '몰랐어요', if: '모르면', hon: '모르세요', adn: ['모르는', '모른'] }, // 르
  { lemma: '이르다²', pos: 'VERB', stems: ['이르', '이르', '이르러'], polite: '이르러요', formal: '이릅니다', plain: '이른다', past: '이르렀어요', if: '이르면', hon: '이르세요', adn: ['이르는', '이른'] }, // 러 (reach)
  { lemma: '푸다', pos: 'VERB', stems: ['푸', '푸', '퍼'], polite: '퍼요', formal: '풉니다', plain: '푼다', past: '펐어요', if: '푸면', hon: '푸세요', adn: ['푸는', '푼'] }, // 우
  { lemma: '쓰다', pos: 'VERB', stems: ['쓰', '쓰', '써'], polite: '써요', formal: '씁니다', plain: '쓴다', past: '썼어요', if: '쓰면', hon: '쓰세요', adn: ['쓰는', '쓴'] }, // ㅡ-stem
  { lemma: '살다', pos: 'VERB', stems: ['살', '살', '살아'], polite: '살아요', formal: '삽니다', plain: '산다', past: '살았어요', if: '살면', hon: '사세요', adn: ['사는', '산'] }, // ㄹ-stem
  { lemma: '예쁘다', pos: 'ADJ', stems: ['예쁘', '예쁘', '예뻐'], polite: '예뻐요', formal: '예쁩니다', plain: '예쁘다', past: '예뻤어요', if: '예쁘면', hon: '예쁘세요', adn: ['예쁜', undefined] }, // descriptive, ㅡ
];

describe('the table of one verb of each conjugation class', () => {
  for (const e of CLASSES) {
    it(`${e.lemma}: stems, the four levels, the past, -(으)면, the honorific and what it is before a noun`, () => {
      const p = para(e.lemma, e.pos);
      expect(p.kind).toBe('verb-conjugation');
      expect([form(p, 'stem:base'), form(p, 'stem:eu'), form(p, 'stem:aeo')]).toEqual(e.stems);
      expect(form(p, 'fin:Ind:Haeyo:Pres')).toBe(e.polite);
      expect(form(p, 'fin:Ind:Hasipsio:Pres')).toBe(e.formal);
      expect(form(p, 'fin:Ind:Haera:Pres')).toBe(e.plain);
      expect(form(p, 'fin:Ind:Haeyo:Past')).toBe(e.past);
      expect(form(p, 'conn:if')).toBe(e.if);
      expect(form(p, 'fin:Ind:Haeyo:Pres', true)).toBe(e.hon);
      expect(form(p, 'adn:pres')).toBe(e.adn[0]);
      expect(form(p, 'adn:past')).toBe(e.adn[1]);
      // the layout names every row the table has, and the irregular class in plain words
      expect(p.layout!.rows.values.map(([s]) => s).sort()).toEqual(slots(p).sort());
      expect(p.template).toBeTruthy();
      expect(p.notes.join(' ')).toMatch(/Regular|irregular|하다 verb/);
    });
  }

  it('names the irregular class in plain words', () => {
    expect(para('듣다', 'VERB').template).toBe('ㄷ-irregular');
    expect(para('돕다', 'VERB').template).toBe('ㅂ-irregular');
    expect(para('짓다', 'VERB').template).toBe('ㅅ-irregular');
    expect(para('파랗다', 'ADJ').template).toBe('ㅎ-irregular');
    expect(para('모르다', 'VERB').template).toBe('르-irregular');
    expect(para('이르다²', 'VERB').template).toBe('러-irregular');
    expect(para('푸다', 'VERB').template).toBe('우-irregular');
    expect(para('하다', 'VERB').template).toBe('하다 verb');
    expect(para('쓰다', 'VERB').template).toBe('regular (ㅡ-stem)');
    expect(para('살다', 'VERB').template).toBe('regular (ㄹ-stem)');
    expect(para('먹다', 'VERB').template).toBe('regular');
    expect(para('듣다', 'VERB').notes.join(' ')).toMatch(/final ㄷ becomes ㄹ before a vowel/);
  });

  it('an action verb has -는다, commands and suggestions; a descriptive verb has none of them, and no wrong form takes their place', () => {
    const v = para('먹다', 'VERB');
    expect(form(v, 'fin:Imp:Haera:Pres')).toBe('먹어라');
    expect(form(v, 'fin:Imp:Haeyo:Pres')).toBe('먹어요');
    expect(form(v, 'fin:Imp:Hasipsio:Pres', true)).toBe('먹으십시오');
    expect(form(v, 'fin:Prop:Haera:Pres')).toBe('먹자');
    expect(form(v, 'fin:Prop:Hasipsio:Pres')).toBe('먹읍시다');
    expect(form(v, 'fin:Int:Haera:Pres')).toBe('먹느냐');
    expect(form(v, 'adn:past')).toBe('먹은'); // an action verb: -(으)ㄴ is the past
    const a = para('예쁘다', 'ADJ');
    expect(a.cells.some((c) => c.features.Mood === 'Imp' || c.features.Mood === 'Prop')).toBe(false);
    expect(a.cells.map((c) => c.form)).not.toContain('예쁜다');
    expect(a.cells.map((c) => c.form)).not.toContain('예쁘는');
    expect(form(a, 'fin:Int:Haera:Pres')).toBe('예쁘냐');
    expect(form(a, 'adn:pres')).toBe('예쁜'); // a descriptive verb: -(으)ㄴ is the present state
    expect(form(a, 'adn:past')).toBeUndefined();
  });

  it('an honorific lexeme (계시다) has no further honorific column; 시 + 어요 gives 계세요', () => {
    const p = para('계시다', 'VERB');
    expect(form(p, 'fin:Ind:Haeyo:Pres')).toBe('계세요');
    expect(form(p, 'fin:Ind:Haera:Pres')).toBe('계신다');
    expect(p.cells.some((c) => c.features.Honorific === 'Subj')).toBe(false);
    expect(p.layout!.columns.values.map(([v]) => v)).toEqual(['No']);
    expect(p.notes.join(' ')).toMatch(/itself honorific/);
  });
});

describe('the existentials and the copulas', () => {
  it('있다 / 없다: descriptive in the plain present, with the 는-forms of a verb, and no command', () => {
    for (const lemma of ['있다', '없다']) {
      const p = para(lemma, 'ADJ');
      const stem = lemma.slice(0, -1);
      expect(form(p, 'fin:Ind:Haera:Pres')).toBe(lemma); // not 있는다
      expect(form(p, 'fin:Int:Haera:Pres')).toBe(`${stem}느냐`);
      expect(form(p, 'adn:pres')).toBe(`${stem}는`);
      expect(form(p, 'conn:background')).toBe(`${stem}는데`);
      expect(form(p, 'fin:Ind:Haeyo:Pres')).toBe(`${stem}어요`);
      expect(form(p, 'fin:Ind:Haeyo:Pres', true)).toBe(`${stem}으세요`);
      expect(form(p, 'adn:pres', true)).toBe(`${stem}으신`); // the honorific follows the descriptive table
      expect(p.cells.some((c) => c.features.Mood === 'Imp' || c.features.Mood === 'Prop')).toBe(lemma === '있다'); // only 있다 (stay) has commands
    }
    const stay = para('있다', 'ADJ');
    expect(forms(stay, 'fin:Imp:Haera:Pres')).toEqual(['있어라', '있거라']);
    expect(form(stay, 'fin:Prop:Haera:Pres')).toBe('있자');
    expect(form(stay, 'fin:Imp:Haeyo:Pres', true)).toBe('있으세요');
  });

  it('이다: the forms after a consonant-final noun, the vowel-final ones in the note', () => {
    const p = para('이다', 'AUX');
    expect(p.template).toBe('copula 이다');
    expect(form(p, 'fin:Ind:Haera:Pres')).toBe('이다');
    expect(form(p, 'fin:Ind:Haeyo:Pres')).toBe('이에요');
    expect(form(p, 'fin:Ind:Hasipsio:Pres')).toBe('입니다');
    expect(form(p, 'fin:Ind:Haeyo:Past')).toBe('이었어요');
    expect(form(p, 'conn:so')).toBe('이라서');
    expect(form(p, 'adn:pres')).toBe('인');
    expect(p.cells.find((c) => c.features.Slot === 'fin:Ind:Haeyo:Pres' && c.features.Honorific === 'No')!.note).toMatch(/예요/);
    expect(p.cells.find((c) => c.features.Slot === 'fin:Ind:Haera:Pres' && c.features.Honorific === 'No')!.note).toMatch(/after a vowel-final noun: 다/);
    expect(slots(p).some((s) => s.startsWith('stem:'))).toBe(false);
  });

  it('아니다', () => {
    const p = para('아니다', 'ADJ');
    expect(p.template).toBe('copula 아니다');
    expect(form(p, 'fin:Ind:Haera:Pres')).toBe('아니다');
    expect(form(p, 'fin:Ind:Hae:Pres')).toBe('아니야');
    expect(form(p, 'fin:Ind:Haeyo:Pres')).toBe('아니에요');
    expect(form(p, 'fin:Ind:Hasipsio:Pres')).toBe('아닙니다');
    expect(form(p, 'fin:Ind:Haeyo:Past')).toBe('아니었어요');
    expect(form(p, 'adn:pres')).toBe('아닌');
  });

  it('a noun with the copula: after a consonant (학생이다), after a vowel (의사다 / 의사이다)', () => {
    const c = para('학생', 'NOUN');
    expect(nform(c, 'cop:Haera:Pres')).toBe('학생이다');
    expect(nform(c, 'cop:Haeyo:Pres')).toBe('학생이에요');
    expect(nform(c, 'cop:Hasipsio:Pres')).toBe('학생입니다');
    expect(nform(c, 'cop:Haeyo:Past')).toBe('학생이었어요');
    const v = para('의사', 'NOUN');
    expect(nforms(v, 'cop:Haera:Pres')).toEqual(['의사다', '의사이다']);
    expect(nform(v, 'cop:Haeyo:Pres')).toBe('의사예요');
    expect(nforms(v, 'cop:Haeyo:Pres')).toContain('의사이에요');
    expect(nform(v, 'cop:Haeyo:Past')).toBe('의사였어요');
  });
});

// ───────────────────────────── homonyms ─────────────────────────────

describe('homonyms', () => {
  it('a numbered lemma picks its own row and conjugation class: 묻다¹ (ask, ㄷ) against 묻다² (bury, regular)', () => {
    const ask = para('묻다¹', 'VERB');
    const bury = para('묻다²', 'VERB');
    expect(form(ask, 'stem:aeo')).toBe('물어');
    expect(form(ask, 'fin:Ind:Haeyo:Pres')).toBe('물어요');
    expect(ask.template).toBe('ㄷ-irregular');
    expect(form(bury, 'stem:aeo')).toBe('묻어');
    expect(form(bury, 'fin:Ind:Haeyo:Pres')).toBe('묻어요');
    expect(bury.template).toBe('regular');
    expect(ask.cells.some((c) => c.features.Entry !== undefined)).toBe(false);
  });

  it('a bare lemma whose candidates conjugate differently gives one table per class, labelled by meaning, never the first alone', () => {
    const p = para('묻다', 'VERB');
    const entries = [...new Set(p.cells.map((c) => c.features.Entry))];
    expect(new Set(entries)).toEqual(new Set(['묻다¹', '묻다²'])); // ² and ³ are both regular: one table serves both
    const askCell = p.cells.find((c) => c.features.Entry === '묻다¹' && c.features.Slot === 'fin:Ind:Haeyo:Pres' && c.features.Honorific === 'No');
    const buryCell = p.cells.find((c) => c.features.Entry === '묻다²' && c.features.Slot === 'fin:Ind:Haeyo:Pres' && c.features.Honorific === 'No');
    expect([askCell?.form, buryCell?.form]).toEqual(['물어요', '묻어요']);
    expect(p.template).toBeUndefined();
    expect(p.layout!.sections).toEqual(['Entry']);
    expect(p.layout!.labels!.Entry['묻다¹']).toMatch(/to ask/);
    expect(p.layout!.labels!.Entry['묻다²']).toMatch(/묻다² \/ 묻다³.*to bury/);
    expect(p.notes.join(' ')).toMatch(/names 3 entries that do not conjugate alike/);
  });

  it('a bare lemma whose candidates all conjugate alike gives one table and says so (쓰다 write / use / wear)', () => {
    const p = para('쓰다', 'VERB');
    expect(p.cells.some((c) => c.features.Entry !== undefined)).toBe(false);
    expect(p.notes.join(' ')).toMatch(/names 3 entries .* that conjugate identically/);
    expect(form(p, 'fin:Ind:Haeyo:Pres')).toBe('써요');
  });

  it('이르다 (reach 러 / tell 르): two tables, each with its own infinitive', () => {
    const p = para('이르다', 'VERB');
    const aeo = Object.fromEntries(p.cells.filter((c) => c.features.Slot === 'stem:aeo').map((c) => [c.features.Entry, c.form]));
    expect(aeo).toEqual({ '이르다²': '이르러', '이르다³': '일러' });
  });

  it('the main entry of a set keeps the bare lemma and only its own row (듣다 hear, ㄷ)', () => {
    const rows = koPredicateRows('듣다', 'VERB').rows;
    expect(rows.map((r) => r.shown)).toEqual(['듣다']);
    expect(form(para('듣다', 'VERB'), 'stem:aeo')).toBe('들어');
  });

  it('a noun with and without a final consonant; a balanced noun gives one table', () => {
    const c = para('학생', 'NOUN');
    const cells = Object.fromEntries(c.cells.filter((x) => x.features.Number === 'Sing' && x.features.Particle).map((x) => [x.features.Particle, x.form]));
    expect(cells).toMatchObject({ none: '학생', subject: '학생이', topic: '학생은', object: '학생을', of: '학생의', 'to-person': '학생에게', at: '학생에서', by: '학생으로', and: '학생과', also: '학생도', only: '학생만' });
    const v = para('의사', 'NOUN');
    const vcells = Object.fromEntries(v.cells.filter((x) => x.features.Number === 'Sing' && x.features.Particle).map((x) => [x.features.Particle, x.form]));
    expect(vcells).toMatchObject({ subject: '의사가', topic: '의사는', object: '의사를', by: '의사로', and: '의사와' });
    // a final ㄹ takes the vowel form of 로 (but the consonant form of 이/은/을)
    expect(nform(para('물', 'NOUN'), 'p:by')).toBe('물로');
    expect(nform(para('물', 'NOUN'), 'p:subject')).toBe('물이');
    expect(para('눈', 'NOUN').cells.some((x) => x.features.Entry !== undefined)).toBe(false);
    expect(c.layout!.columns.key).toBe('Number');
    expect(c.cells.filter((x) => x.features.Number === 'Plur').map((x) => x.form)).toContain('학생들이');
  });

  it('pronouns that change shape before a particle (나 + 가 = 내가), and the 저 that does not (저 "that" with 저 "I")', () => {
    expect(nforms(para('나', 'PRON'), 'p:subject')).toEqual(['내가']);
    expect(nform(para('나', 'PRON'), 'p:of')).toBe('내');
    expect(nform(para('누구', 'PRON'), 'p:subject')).toBe('누가');
    // 저 names "that" and "I" in the real lexicon: only the entry that is the pronoun takes the fused 제가
    expect(nforms(para('저', 'PRON'), 'p:subject')).toEqual(['제가']);
    expect(nforms(para('저¹', 'PRON'), 'p:subject')).toEqual(['저가']);
  });

  it('gives nothing for what it cannot conjugate or decline: a particle, an adverb, a root, a word the lexicon lacks, a bound allomorph', () => {
    expect(koAdapter.paradigm!('아주', 'ADV')).toBeUndefined();
    expect(koAdapter.paradigm!('그', 'DET')).toBeUndefined();
    expect(koAdapter.paradigm!('복잡', 'NOUN')).toBeUndefined();
    expect(koAdapter.paradigm!('가나다라', 'NOUN')).toBeUndefined();
    expect(koAdapter.paradigm!('가나다라하다', 'VERB')).toBeUndefined();
    expect(koAdapter.paradigm!('긷다', 'VERB')).toBeUndefined(); // the source gives no class and the shape allows an irregular one
    expect(koPredicateRows('긷다', 'VERB').refused.join(' ')).toMatch(/no conjugation class/);
  });
});

// ───────────────────────────── generator against analyser ─────────────────────────────

/**
 * Cells whose first form the analyser does not read back to the lemma, or reads with other features: each one a real gap of the
 * MORPHOLOGY package, not of the paradigm. Listed so that a fix there is noticed (the test fails when an entry stops failing).
 */
const ANALYSER_GAPS: readonly string[] = []; // none left: the copula alone (이야, 이셔, 이니, 아니셔) reads back since the morphology package's fourth round

function readBack(lemma: string, p: GeneratedParadigm, host = ''): string[] {
  const bad: string[] = [];
  for (const c of p.cells) {
    if (c.features.Slot === 'stem:base' || c.features.Slot === 'stem:eu') continue; // the bare stem is not a word
    const first = p.cells.find((x) => featureKey(x.features) === featureKey(c.features))!;
    if (first !== c) continue; // the first form of each cell is the one shown; variants are checked below
    const readings = koAnalyzeToken(host + c.form).filter((r) => r.lemma && koBareLemma(r.lemma) === koBareLemma(host ? host : lemma));
    const key = `${lemma}|${c.features.Slot}${c.features.Honorific === 'Subj' ? ' hon' : ''}`;
    const ok = c.features.Slot === 'stem:aeo' ? readings.length > 0 : readings.some((r) => koCellCompatible(c.features, r.morph)); // the infinitive is a word but not a reading of one cell
    if (!ok) bad.push(`${key} :: ${host}${c.form}: ${readings.length ? `features ${JSON.stringify(readings.map((r) => r.morph))}` : 'no reading with the lemma'}`);
  }
  return bad;
}

describe('every generated cell analyses back to its lemma with compatible features', () => {
  const WORDS: Array<[string, PartOfSpeech]> = [...CLASSES.map((c) => [c.lemma, c.pos] as [string, PartOfSpeech]), ['있다', 'ADJ'], ['없다', 'ADJ'], ['계시다', 'VERB'], ['마시다', 'VERB'], ['공부하다', 'VERB'], ['좋다', 'ADJ'], ['맛있다', 'ADJ'], ['오다', 'VERB'], ['보다', 'VERB'], ['주다', 'VERB'], ['되다', 'VERB'], ['걷다', 'VERB'], ['묻다¹', 'VERB'], ['묻다²', 'VERB'], ['빠르다', 'ADJ'], ['어떻다', 'ADJ'], ['만들다', 'VERB'], ['알다', 'VERB'], ['낫다', 'VERB'], ['아름답다', 'ADJ'], ['크다', 'ADJ']];
  it('every verb and adjective', () => {
    const bad: string[] = [];
    for (const [lemma, pos] of WORDS) bad.push(...readBack(lemma, para(lemma, pos)));
    expect(bad).toEqual([]);
  });

  it('the two copulas stand alone: all but the listed analyser gaps read back (and the list is exactly the gaps)', () => {
    const bad = [...readBack('이다', para('이다', 'AUX')), ...readBack('아니다', para('아니다', 'ADJ'))];
    expect(bad.map((b) => b.split(' :: ')[0]).sort()).toEqual([...ANALYSER_GAPS].sort());
  });

  it('every noun, pronoun and numeral cell (the particles and the copula), through the analyser', () => {
    const bad: string[] = [];
    for (const [lemma, pos] of [['학생', 'NOUN'], ['의사', 'NOUN'], ['물', 'NOUN'], ['눈', 'NOUN'], ['나', 'PRON'], ['너', 'PRON'], ['저', 'PRON'], ['누구', 'PRON'], ['하나', 'NUM'], ['서울', 'PROPN'], ['한국어', 'NOUN']] as Array<[string, PartOfSpeech]>) {
      bad.push(...readBack(lemma, para(lemma, pos)));
    }
    expect(bad).toEqual([]);
  });

  it('the copulas after a noun: 이다 and 아니다 forms read back to the noun with the copula', () => {
    const bad: string[] = [];
    const p = para('이다', 'AUX');
    for (const c of p.cells) {
      if (c.features.Honorific === 'Subj' || !['fin', 'adn'].includes(c.features.Slot.split(':')[0])) continue;
      const surface = `학생${c.form}`;
      const r = koAnalyzeToken(surface).filter((x) => x.lemma === '학생' && x.morph.VerbType === 'Cop');
      if (!r.length) bad.push(surface);
    }
    expect(bad).toEqual([]);
  });

  it('the variant forms of a cell (하여요, 계셔요) also read back to the lemma, except the ones listed', () => {
    const missing: string[] = [];
    for (const [lemma, pos] of [['하다', 'VERB'], ['먹다', 'VERB'], ['계시다', 'VERB'], ['가다', 'VERB'], ['오다', 'VERB']] as Array<[string, PartOfSpeech]>) {
      const p = para(lemma, pos);
      for (const c of p.cells) {
        if (c.features.Slot.startsWith('stem:')) continue;
        if (!koAnalyzeToken(c.form).some((r) => r.lemma && koBareLemma(r.lemma) === lemma)) missing.push(`${lemma} ${c.features.Slot} ${c.form}`);
      }
    }
    // uncontracted 시 + 어 (먹으시어요) and the like are generated as variants and are read by the analyser too; nothing may be missing
    expect(missing).toEqual([]);
  });
});

// ───────────────────────────── the dictionary's tags ─────────────────────────────

describe('the dictionary table tags', () => {
  it('maps every tag set of the verb and adjective tables to a slot (the kaikki sets measured over 5,210 records)', () => {
    const cases: Array<[string, string]> = [
      ['indicative informal non-past polite', 'fin:Ind:Haeyo:Pres'], ['informal interrogative non-past polite', 'fin:Int:Haeyo:Pres'],
      ['formal indicative non-past', 'fin:Ind:Haera:Pres'], ['indicative informal non-past', 'fin:Ind:Hae:Pres'], ['formal indicative non-past polite', 'fin:Ind:Hasipsio:Pres'],
      ['formal indicative past', 'fin:Ind:Haera:Past'], ['indicative informal past polite', 'fin:Ind:Haeyo:Past'], ['formal indicative past polite', 'fin:Ind:Hasipsio:Past'],
      ['formal interrogative non-past', 'fin:Int:Haera:Pres'], ['formal interrogative past polite', 'fin:Int:Hasipsio:Past'],
      ['assertive formal', 'fin:Ind:Haera:Fut'], ['assertive informal', 'fin:Ind:Hae:Fut'], ['assertive informal polite', 'fin:Ind:Haeyo:Fut'], ['assertive formal polite', 'fin:Ind:Hasipsio:Fut'],
      ['formal imperative', 'fin:Imp:Haera:Pres'], ['imperative informal', 'fin:Imp:Hae:Pres'], ['imperative informal polite', 'fin:Imp:Haeyo:Pres'], ['formal imperative polite', 'fin:Imp:Hasipsio:Pres'],
      ['formal hortative', 'fin:Prop:Haera:Pres'], ['hortative informal', 'fin:Prop:Hae:Pres'], ['hortative informal polite', 'fin:Prop:Haeyo:Pres'], ['formal hortative polite', 'fin:Prop:Hasipsio:Pres'],
      ['causative informal', 'conn:so'], ['causative formal', 'conn:inf'], ['causative informal polite', 'conn:since'], ['causative formal polite', 'conn:because'],
      ['conditional formal', 'conn:if'], ['conditional informal', 'conn:only-if'], ['conjunctive formal', 'conn:and'], ['formal motive-form', 'conn:intend'],
      ['contrastive formal', 'conn:but'], ['contrastive informal', 'conn:background'], ['contrastive informal polite', 'conn:and-then'],
      ['determiner formal past', 'adn:past'], ['determiner formal present', 'adn:pres'], ['determiner formal future', 'adn:prosp'], ['determiner informal present', 'adn:pres'], ['determiner future informal', 'adn:prosp'],
      ['formal noun-from-verb', 'nmlz:m'], ['informal noun-from-verb', 'nmlz:gi'], ['formal noun-from-verb past', 'nmlz:m:past'], ['informal noun-from-verb past', 'nmlz:gi:past'],
      ['infinitive', 'stem:aeo'], ['sequential', 'conn:since'],
    ];
    for (const [tags, slot] of cases) expect(koTableSlot(tags.split(' ')), tags).toBe(slot);
  });

  it('maps no cell for the rows that are not cells: the class, a Hanja, a variant spelling, a bare mood, an unfilled template', () => {
    for (const tags of ['class', 'hanja', 'alternative', 'Early Modern alternative', 'Gyeongsang alternative dialectal', 'canonical', 'indicative', 'connective', 'connective honorific', 'noun-from-verb', 'imperative', 'determiner', 'informal polite', 'determiner informal polite']) {
      expect(koTableSlot(tags.split(' ')), tags).toBeUndefined();
    }
    expect(koFeaturesFromTableTagsPlain(['formal', 'indicative', 'non-past'], '{{{stem1}}}다 ({{{stem1_r}}}da)')).toBeUndefined();
    expect(koFeaturesFromTableTagsPlain(['informal', 'polite', 'indicative', 'non-past'], 'past: 어요')).toBeUndefined();
    expect(koFeaturesFromTableTagsPlain(['informal', 'polite', 'indicative', 'non-past'], '못 본 체해요')).toEqual({ VerbForm: 'Fin', Mood: 'Ind', SpeechLevel: 'Haeyo', Tense: 'Pres', Slot: 'fin:Ind:Haeyo:Pres', Honorific: 'No' });
  });

  it('a row of the honorific block lands in the honorific cell, one of the plain block in the plain cell, by the lemma just generated', () => {
    para('먹다', 'VERB');
    const map = (tags: string, f: string) => koFeaturesFromTableTags(tags.split(' '), 'VERB', f);
    expect(map('indicative informal non-past polite', '먹어요')!.Honorific).toBe('No');
    expect(map('indicative informal non-past polite', '먹으세요')!.Honorific).toBe('Subj');
    expect(map('indicative informal non-past polite', '먹으셔요')!.Honorific).toBe('Subj');
    expect(map('formal indicative non-past', '먹는다')!.Honorific).toBe('No');
    expect(map('formal indicative non-past', '먹으신다')!.Honorific).toBe('Subj');
    // the dictionary lists 먹으십시다 under the plain "formal hortative polite"; it is the honorific suggestion, and the plain 먹읍시다 stays free
    expect(map('formal hortative polite', '먹으십시다')).toMatchObject({ Slot: 'fin:Prop:Hasipsio:Pres', Honorific: 'Subj' });
    expect(map('formal hortative polite', '먹읍시다')).toMatchObject({ Slot: 'fin:Prop:Hasipsio:Pres', Honorific: 'No' });
    // a form nothing generated spells goes by its shape: a disagreement shows on the cell it belongs to
    expect(map('formal indicative non-past', '먹으시는다')!.Honorific).toBe('Subj');
    expect(map('formal indicative non-past', '먹눈다')!.Honorific).toBe('No');
    // without the generated half (the lemma could not be generated) the plain cell
    expect(koAdapter.paradigm!('긷다', 'VERB')).toBeUndefined();
    expect(map('formal indicative non-past', '긷는다')!.Honorific).toBe('No');
  });

  it('in a bare lemma of several classes a dictionary row goes to the entry whose forms it spells', () => {
    para('묻다', 'VERB');
    expect(koFeaturesFromTableTags('indicative informal non-past polite'.split(' '), 'VERB', '물어요')).toMatchObject({ Entry: '묻다¹', Honorific: 'No' });
    expect(koFeaturesFromTableTags('indicative informal non-past polite'.split(' '), 'VERB', '묻어요')).toMatchObject({ Entry: '묻다²', Honorific: 'No' });
    para('먹다', 'VERB');
    expect(koFeaturesFromTableTags('indicative informal non-past polite'.split(' '), 'VERB', '먹어요')!.Entry).toBeUndefined();
  });

  it('morphFromTags reads a form-of entry\'s labels: the adnominal, the infinitive, the polite statement; ignores dialect and Hanja', () => {
    expect(koMorphFromTags(['determiner', 'form-of', 'past'])).toEqual({ VerbForm: 'Adn', Tense: 'Past' });
    expect(koMorphFromTags(['adnominal', 'form-of', 'future'])).toEqual({ VerbForm: 'Adn', Aspect: 'Prosp' });
    expect(koMorphFromTags(['form-of', 'infinitive'])).toEqual({ VerbForm: 'Conn', Connective: 'inf' });
    expect(koMorphFromTags(['form-of', 'indicative', 'informal', 'polite', 'present'])).toEqual({ VerbForm: 'Fin', Mood: 'Ind', SpeechLevel: 'Haeyo', Tense: 'Pres' });
    expect(koMorphFromTags(['form-of', 'imperative', 'informal', 'polite'])).toEqual({ VerbForm: 'Fin', Mood: 'Imp', SpeechLevel: 'Haeyo' });
    expect(koMorphFromTags(['form-of', 'noun-from-verb'])).toEqual({ VerbForm: 'Nmlz' });
    expect(koMorphFromTags(['causative', 'form-of', 'transitive'])).toEqual({ Voice: 'Caus' });
    expect(koMorphFromTags(['Gyeongsang', 'dialectal', 'form-of'])).toEqual({});
    expect(koMorphFromTags(['form-of', 'hanja'])).toEqual({});
  });
});

// ───────────────────────────── the cells a reading occupies ─────────────────────────────

describe('cellsFor: the cells a selected reading occupies', () => {
  const paradigmOf = (lemma: string, pos: PartOfSpeech): Pick<Paradigm, 'cells' | 'kind' | 'pos'> => {
    const g = para(lemma, pos);
    return { cells: g.cells.map((c) => ({ form: c.form, features: c.features, sources: ['generated'], status: 'generated' })), kind: g.kind, pos };
  };

  it('the open 해요체 names every mood at once (먹어요), the past names two (먹었어요), a closed form names one (먹습니다)', () => {
    const p = paradigmOf('먹다', 'VERB');
    const slotsOf = (cells: ReturnType<typeof koCellsFor>) => cells.map((c) => c.features.Slot).sort();
    expect(slotsOf(koCellsFor(p, { SpeechLevel: 'Haeyo', VerbForm: 'Fin' }, '먹어요'))).toEqual(['fin:Imp:Haeyo:Pres', 'fin:Ind:Haeyo:Pres', 'fin:Int:Haeyo:Pres', 'fin:Prop:Haeyo:Pres']);
    expect(slotsOf(koCellsFor(p, { SpeechLevel: 'Haeyo', Tense: 'Past', VerbForm: 'Fin' }, '먹었어요'))).toEqual(['fin:Ind:Haeyo:Past', 'fin:Int:Haeyo:Past']);
    expect(slotsOf(koCellsFor(p, { Mood: 'Ind', SpeechLevel: 'Hasipsio', VerbForm: 'Fin' }, '먹습니다'))).toEqual(['fin:Ind:Hasipsio:Pres']);
    expect(slotsOf(koCellsFor(p, { Mood: 'Ind', SpeechLevel: 'Haera', VerbForm: 'Fin' }, '먹는다'))).toEqual(['fin:Ind:Haera:Pres']);
  });

  it('the honorific, the -겠- and the connective cells are told apart; 먹어 is both the informal ending and the infinitive', () => {
    const p = paradigmOf('먹다', 'VERB');
    expect(koCellsFor(p, { Honorific: 'Subj', SpeechLevel: 'Haeyo', VerbForm: 'Fin' }, '먹으세요').every((c) => c.features.Honorific === 'Subj')).toBe(true);
    expect(koCellsFor(p, { Modality: 'Presumptive', SpeechLevel: 'Haeyo', VerbForm: 'Fin' }, '먹겠어요').map((c) => c.features.Slot).sort()).toEqual(['fin:Ind:Haeyo:Fut']);
    expect(koCellsFor(p, { Connective: 'if', VerbForm: 'Conn' }, '먹으면').map((c) => c.features.Slot)).toEqual(['conn:if']);
    const both = koCellsFor(p, { SpeechLevel: 'Hae', VerbForm: 'Fin' }, '먹어').map((c) => c.features.Slot);
    expect(both).toContain('fin:Ind:Hae:Pres');
    expect(koCellsFor(p, { Connective: 'inf', VerbForm: 'Conn' }, '먹어').map((c) => c.features.Slot)).toEqual(['conn:inf']);
    expect(koCellsFor(p, { Tense: 'Pres', VerbForm: 'Adn' }, '먹는').map((c) => c.features.Slot)).toEqual(['adn:pres']);
    expect(koCellsFor(p, { Aspect: 'Prosp', VerbForm: 'Adn' }, '먹을').map((c) => c.features.Slot)).toEqual(['adn:prosp']);
  });

  it('a noun with a particle names its cell; 들 names the plural column; the analyser\'s union values and unknown features do not break it', () => {
    const p = paradigmOf('학생', 'NOUN');
    expect(koCellsFor(p, { Case: 'Nom', Particle: 'subject' }, '학생이').map((c) => c.form)).toEqual(['학생이']);
    expect(koCellsFor(p, { Case: 'Nom', Particle: 'plural+subject', Number: 'Plur' }, '학생들이').map((c) => c.form)).toEqual(['학생들이']);
    expect(koCellsFor(p, { Particle: 'topic', Topic: 'Yes' }, '학생은').map((c) => c.form)).toEqual(['학생은']);
    expect(koCellsFor(p, { VerbType: 'Cop', SpeechLevel: 'Haeyo', VerbForm: 'Fin', Polarity: 'Pos' }, '학생이에요').map((c) => c.form)).toEqual(['학생이에요']);
    expect(koCellsFor(p, { Mood: 'Ind,Int', Frobnicate: 'x' }, '학생도').map((c) => c.form)).toEqual(['학생도']); // the form decides when the features name nothing
  });

  it('without a surface, the features alone; without either, nothing', () => {
    const p = paradigmOf('먹다', 'VERB');
    expect(koCellsFor(p, { Connective: 'but', VerbForm: 'Conn' }).map((c) => c.features.Slot)).toEqual(['conn:but']);
    expect(koCellsFor(p, {})).toEqual([]);
  });

  it('is the adapter\'s member', () => {
    const p = paradigmOf('먹다', 'VERB');
    expect(koAdapter.cellsFor!(p, { Connective: 'if', VerbForm: 'Conn' }, '먹으면').length).toBe(1);
  });
});

// ───────────────────────────── the dictionary's own table, through the real buildParadigm ─────────────────────────────

const DICT = path.resolve(__dirname, '../../../public/dict');
const HAVE_DICT = fs.existsSync(path.join(DICT, 'ko/full/manifest.json'));
const dictFetch = (async (url: string) => {
  const rel = decodeURIComponent(String(url).replace(/^\/dict/, '').replace(/\?.*$/, ''));
  try { return new Response(fs.readFileSync(path.join(DICT, rel)), { status: 200 }); } catch { return new Response('', { status: 404 }); }
}) as unknown as typeof fetch;

describe.skipIf(!HAVE_DICT)('the generated cells against the dictionary\'s table (the real buildParadigm)', () => {
  const source = createFullRecordSource('ko' as never, { fetch: dictFetch, baseUrl: '/dict' });
  const merged = async (lemma: string, pos: PartOfSpeech, recordKey = lemma, recordPos: string = pos): Promise<Paradigm> => {
    const records = (await source.lookup(recordKey)) as unknown as LexicalRecord[];
    const p = buildParadigm(koAdapter, 'ko', lemma, pos, pickRecord(records, recordPos));
    if (!p) throw new Error(`no paradigm for ${lemma}`);
    return p;
  };
  const conflicts = (p: Paradigm): string[] => p.cells.filter((c) => c.status === 'conflicted').map((c) => `${c.features.Slot}${c.features.Honorific === 'Subj' ? ' hon' : ''}: dictionary ${c.form}, rules ${(c.alternatives ?? []).join(' / ')}`);

  it('먹다: the table aligns cell by cell with no disagreement; the cells only one side has are the stems, the retrospective and the honorific ones the dictionary lacks', async () => {
    const p = await merged('먹다', 'VERB');
    const s = paradigmSummary(p);
    expect(conflicts(p)).toEqual([]);
    expect(s.verified).toBe(47); // the dictionary's 49 rows: the class row is no cell and the sequential row is the same cell as 먹으니 (-(으)니)
    expect(s.conflicted).toBe(0);
    expect(s.supported).toBe(0); // everything the dictionary has, the rules have too
    // 먹다's record holds only the plain block: the honorific cells are the rules' alone, except the suggestion the plain block spells 먹으십시다
    expect(p.cells.filter((c) => c.features.Honorific === 'Subj' && c.status !== 'generated').map((c) => c.form)).toEqual(['먹으십시다']);
    // rules only, plain column: the two stem shapes the table never lists, -던, and the 먹읍시다 / 먹읍시오 the table writes as 먹으십시다 / 먹으십시오 (honorific)
    const only = new Set(p.cells.filter((c) => c.status === 'generated' && c.features.Honorific === 'No').map((c) => c.features.Slot));
    expect([...only].sort()).toEqual(['adn:retro', 'fin:Prop:Hasipsio:Pres', 'stem:base', 'stem:eu']);
    expect(p.cells.find((c) => c.features.Slot === 'fin:Ind:Haeyo:Pres' && c.features.Honorific === 'No')).toMatchObject({ form: '먹어요', status: 'verified' });
    expect(p.cells.find((c) => c.features.Slot === 'stem:aeo')).toMatchObject({ form: '먹어', status: 'verified' });
  });

  it('묻다¹ (the entry the card names): its own 93-cell table, plain and honorific blocks, aligned with no disagreement', async () => {
    const p = await merged('묻다¹', 'VERB');
    expect(conflicts(p)).toEqual([]);
    const hon = p.cells.filter((c) => c.features.Honorific === 'Subj' && c.status === 'verified').length;
    expect(hon).toBeGreaterThanOrEqual(40);
    expect(p.cells.find((c) => c.features.Slot === 'fin:Ind:Haeyo:Pres' && c.features.Honorific === 'Subj')).toMatchObject({ form: '물으세요', status: 'verified' });
    expect(p.cells.find((c) => c.features.Slot === 'fin:Prop:Hasipsio:Pres' && c.features.Honorific === 'Subj')).toMatchObject({ form: '물으십시다', status: 'verified' });
    expect(p.cells.find((c) => c.features.Slot === 'stem:aeo')).toMatchObject({ form: '물어', status: 'verified' });
    expect(p.template).toBe('ㄷ-irregular');
  });

  it('예쁘다 (ADJ) and 가다 and 듣다 and 춥다: no disagreement', async () => {
    for (const [lemma, pos] of [['예쁘다', 'ADJ'], ['가다', 'VERB'], ['듣다', 'VERB'], ['춥다', 'ADJ'], ['하다', 'VERB']] as Array<[string, PartOfSpeech]>) {
      const p = await merged(lemma, pos);
      expect(conflicts(p), lemma).toEqual([]);
      expect(paradigmSummary(p).verified, lemma).toBeGreaterThan(40);
    }
  });

  it('a real disagreement shows as a conflict on its own cell, both forms kept: 있다 as a verb (있는다), the copula\'s mechanical table', async () => {
    const p = await merged('있다', 'ADJ', '있다', 'VERB'); // the dictionary's VERB table of 있다 (있는다) against the existential's rules (있다)
    const cell = p.cells.find((c) => c.features.Slot === 'fin:Ind:Haera:Pres' && c.features.Honorific === 'No');
    expect(cell?.status).toBe('conflicted');
    expect(cell?.form).toBe('있는다');
    expect(cell?.alternatives).toContain('있다');
    const q = await merged('이다', 'AUX', '이다', 'VERB'); // pickRecord(…, 'AUX') would take the particle's record, which has no table
    const bad = conflicts(q);
    expect(bad.some((x) => x.startsWith('fin:Ind:Haera:Pres:') || x.startsWith('fin:Ind:Haera:Pres'))).toBe(true); // 인다 (the verb template) against 이다
  });

  it('a bare balanced lemma: the dictionary\'s first record lands on the entry whose forms it spells, never on the other', async () => {
    const records = (await source.lookup('묻다')) as unknown as LexicalRecord[];
    const p = buildParadigm(koAdapter, 'ko', '묻다', 'VERB', pickRecord(records, 'VERB'))!;
    const dict = p.cells.filter((c) => c.sources.includes('wiktionary'));
    expect(dict.length).toBeGreaterThan(40);
    // whichever record the shared pickRecord takes first, none of its cells is a disagreement with the entry it was attributed to
    expect(new Set(dict.map((c) => c.features.Entry)).size).toBe(1);
  });
});

// ───────────────────────────── fix batch 1: the cells a form lights, pronouns, persons, honorific verbs ─────────────────────────────

describe('GG1: an ending that is not a row of the table lights no wrong cell', () => {
  const cellsOf = (lemma: string, pos: PartOfSpeech) => para(lemma, pos).cells.map((c) => ({ form: c.form, features: c.features, sources: ['generated' as const], status: 'generated' as const }));
  const lit = (lemma: string, pos: PartOfSpeech, surface: string): string[] => {
    const cells = cellsOf(lemma, pos);
    const reading = koAnalyzeToken(surface).find((r) => r.lemma && koBareLemma(r.lemma) === lemma) ?? koAnalyzeToken(surface)[0];
    return koCellsFor({ cells }, reading?.morph ?? {}, surface).map((c) => c.features.Slot);
  };
  const OFF_TABLE = ['먹지', '먹자마자', '먹으러', '먹었더니', '먹으려면', '먹으면서', '먹었네요', '먹는군요', '먹을게요', '먹을까요', '먹지요', '먹거라', '먹고서', '먹다가', '먹도록', '먹거나', '먹든지', '먹으므로', '먹는다고', '먹는대요', '먹잖아요', '먹거든요', '먹을수록', '먹었던', '먹을지', '먹는지', '먹었는데', '먹었으면', '먹었지만', '먹었으니까', '먹었고', '먹어도', '먹어야겠다', '먹는구나', '먹나요', '먹네', '먹을래', '먹는다면', '먹다니', '먹으려는'];
  it('forty common endings that are not rows light at most one cell', () => {
    expect(OFF_TABLE.length).toBeGreaterThanOrEqual(40);
    const bad = OFF_TABLE.map((w) => [w, lit('먹다', 'VERB', w)] as const).filter(([, l]) => l.length > 1);
    expect(bad).toEqual([]);
    for (const w of ['먹었더니', '먹지요', '먹을게요', '먹자마자']) expect(lit('먹다', 'VERB', w), w).toEqual([]);
  });
  it('a form that is a row still lights its row(s)', () => {
    expect(lit('먹다', 'VERB', '먹으면')).toEqual(['conn:if']);
    expect(lit('먹다', 'VERB', '먹었어요').sort()).toEqual(['fin:Ind:Haeyo:Past', 'fin:Int:Haeyo:Past']);
  });
  it('the shared selectedCellKeys: Korean says none for an empty list; another language keeps the loose fallback', async () => {
    const { selectedCellKeys } = await import('../../../packages/golearn-extension/src/content/enrich');
    const { cellsForSelection } = await import('../../../src/core/paradigm');
    const cells = cellsOf('먹다', 'VERB');
    const pk = { languageId: 'ko', lemma: '먹다', pos: 'VERB' as const, kind: 'verb-conjugation' as const, cells, notes: [], sources: [], status: 'generated' as const };
    const feats = { VerbForm: 'Conn', Connective: 'and-then' };
    expect(selectedCellKeys(koAdapter, pk, feats, '먹었더니')).toEqual([]);
    expect(cellsForSelection(pk, feats, '먹었더니').length).toBeGreaterThan(0); // what every other language still gets
    const other = { lang: 'xx', cellsFor: () => [] } as never;
    expect(selectedCellKeys(other, pk, { VerbForm: 'Conn' }, '먹고').length).toBeGreaterThan(0);
  });
});

describe('GG3, GG4: nominal tables', () => {
  const all = (p: GeneratedParadigm) => p.cells.map((c) => c.form);
  it('no pronoun table holds 나들 / 너들 / 저들 / 누구들 / 나가 / 저가 / 너가 / 누구가; no plural column for a pronoun, name or numeral', () => {
    for (const [w, pos] of [['나', 'PRON'], ['너', 'PRON'], ['저', 'PRON'], ['누구', 'PRON'], ['서울', 'PROPN'], ['하나', 'NUM']] as Array<[string, PartOfSpeech]>) {
      const p = para(w, pos);
      const f = all(p);
      for (const bad of ['나들', '너들', '저들', '누구들', '나가', '저가', '너가', '누구가', '서울들', '하나들']) expect(f, `${w}: ${bad}`).not.toContain(bad);
      expect(f.some((x) => x.includes('들'))).toBe(false);
      expect(p.layout!.columns.values.map(([v]) => v)).toEqual(['Sing']);
    }
    expect(nforms(para('나', 'PRON'), 'p:subject')).toEqual(['내가']);
    expect(nforms(para('저', 'PRON'), 'p:subject')).toEqual(['제가']);
    expect(nforms(para('너', 'PRON'), 'p:subject')).toEqual(['네가']);
    expect(nforms(para('누구', 'PRON'), 'p:subject')).toEqual(['누가']);
    expect(para('학생', 'NOUN').cells.map((c) => c.form)).toContain('학생들이');
  });
  it('a person takes 에게 / 한테 / 께: the noun has both 에 and 에게, the pronoun for a person only the person rows', () => {
    const n = para('학생', 'NOUN');
    expect(slots(n)).not.toContain('p:to'); // a student is a person: 학생에게, not 학생에
    expect(nform(para('책', 'NOUN'), 'p:to')).toBe('책에');
    expect(nform(n, 'p:to-person')).toBe('학생에게');
    expect(nform(n, 'p:to-person-hante')).toBe('학생한테');
    expect(slots(n)).not.toContain('p:to-person-hon');
    expect(nform(para('선생님', 'NOUN'), 'p:to-person-hon')).toBe('선생님께');
    expect([nform(n, 'p:until'), nform(n, 'p:from'), nform(n, 'p:than'), nform(n, 'p:like')]).toEqual(['학생까지', '학생부터', '학생보다', '학생처럼']);
    const i = para('나', 'PRON');
    expect(slots(i)).not.toContain('p:to');
    expect(nform(i, 'p:to-person')).toBe('나에게');
    expect(slots(i)).not.toContain('p:to-person-hon');
    expect(slots(para('누구', 'PRON'))).not.toContain('p:to-person-hon'); // 께 is never for a pronoun
  });
  it('the particle in the word is its row: 학생에게 lights 에게, 서울까지 lights 까지, a chain that is not a row (서울에서는) lights none, never the word itself', () => {
    const lit = (lemma: string, pos: PartOfSpeech, surface: string) => {
      const cells = para(lemma, pos).cells.map((c) => ({ form: c.form, features: c.features, sources: ['generated' as const], status: 'generated' as const }));
      const r = koAnalyzeToken(surface).find((x) => x.lemma && koBareLemma(x.lemma) === lemma);
      return koCellsFor({ cells }, r?.morph ?? {}, surface).map((c) => c.features.Slot);
    };
    expect(lit('학생', 'NOUN', '학생에게')).toEqual(['p:to-person']);
    expect(lit('서울', 'PROPN', '서울까지')).toEqual(['p:until']);
    expect(lit('서울', 'PROPN', '서울에서는')).toEqual([]);
    expect(lit('나', 'PRON', '나에게')).toEqual(['p:to-person']);
    expect(lit('학생', 'NOUN', '학생')).toEqual(['p:none']);
  });
});

describe('GG7, GG2, GG6: honorific verbs, questions, 하다 without a class, the card note', () => {
  it('계시다 has no plain or informal command or suggestion, but 계세요 and 계십시오', () => {
    const p = para('계시다', 'VERB');
    expect(p.cells.some((c) => c.features.Slot === 'fin:Imp:Haera:Pres' || c.features.Slot === 'fin:Prop:Haera:Pres' || c.features.Slot === 'fin:Imp:Hae:Pres')).toBe(false);
    expect(p.cells.some((c) => c.form === '계시어라' || c.form === '계셔라')).toBe(false);
    expect(form(p, 'fin:Imp:Haeyo:Pres')).toBe('계세요');
    expect(form(p, 'fin:Imp:Hasipsio:Pres')).toBe('계십시오');
  });
  it('the plain question has -니 and -냐 beside -느냐, and no 먹으냐', () => {
    expect(forms(para('먹다', 'VERB'), 'fin:Int:Haera:Pres')).toEqual(['먹느냐', '먹니', '먹냐']);
    expect(forms(para('예쁘다', 'ADJ'), 'fin:Int:Haera:Pres')).toEqual(['예쁘냐', '예쁘니']);
    expect(para('먹다', 'VERB').cells.map((c) => c.form)).not.toContain('먹으냐');
  });
  it('a 하다 predicate with no class conjugates as 하다 (not 묵직하요)', () => {
    const p = koAdapter.paradigm!('묵직하다', 'ADJ');
    if (p) { expect(form(p, 'fin:Ind:Haeyo:Pres')).toBe('묵직해요'); expect(form(p, 'fin:Ind:Haeyo:Past')).toBe('묵직했어요'); }
  });
  it('the card note says what is true', () => {
    const notes = para('먹다', 'VERB').notes.join(' ');
    expect(notes).not.toMatch(/read back through the analyser/);
    expect(notes).toMatch(/a sample of words is checked in our tests/);
  });
});

describe('UU3: the person rows only for what is known to be a person or an animal', () => {
  const has = (lemma: string, pos: PartOfSpeech) => {
    const s = slots(para(lemma, pos));
    return Object.fromEntries(['to', 'to-person', 'to-person-hante', 'to-person-hon', 'at'].map((id) => [id, s.includes(`p:${id}`)]));
  };
  const rows = (e: boolean, g: boolean, h: boolean, k: boolean, at: boolean) => ({ to: e, 'to-person': g, 'to-person-hante': h, 'to-person-hon': k, at });
  it('what each word has: 에 / 에게 / 한테 / 께 / 에서', () => {
    expect(has('책', 'NOUN')).toEqual(rows(true, false, false, false, true));
    expect(has('서울', 'PROPN')).toEqual(rows(true, false, false, false, true));
    expect(has('나라', 'NOUN')).toEqual(rows(true, false, false, false, true));
    expect(has('개', 'NOUN')).toEqual(rows(false, true, true, false, true)); // an animal
    expect(has('학생', 'NOUN')).toEqual(rows(false, true, true, false, true));
    expect(has('어머니', 'NOUN')).toEqual(rows(false, true, true, false, true));
    expect(has('선생님', 'NOUN')).toEqual(rows(false, true, true, true, true)); // 님: honoured
    expect(has('나', 'PRON')).toEqual(rows(false, true, true, false, false));
    expect(has('너', 'PRON')).toEqual(rows(false, true, true, false, false));
    expect(has('누구', 'PRON')).toEqual(rows(false, true, true, false, false));
  });
  it('none of 책에게, 책께, 서울에게, 서울께, 너께, 누구께, 나에서, 학생에 appears', () => {
    const f = (l: string, p: PartOfSpeech) => para(l, p).cells.map((c) => c.form);
    expect(f('책', 'NOUN')).not.toEqual(expect.arrayContaining(['책에게']));
    for (const [l, p, bad] of [['책', 'NOUN', ['책에게', '책께', '책한테']], ['서울', 'PROPN', ['서울에게', '서울께', '서울한테']], ['너', 'PRON', ['너께', '너에서', '너에']], ['누구', 'PRON', ['누구께', '누구에서']], ['나', 'PRON', ['나에서', '나께']], ['학생', 'NOUN', ['학생에', '학생께']]] as Array<[string, PartOfSpeech, string[]]>) {
      for (const b of bad) expect(f(l, p), b).not.toContain(b);
    }
  });
  it('a person also has "from a person" (에게서 / 한테서); a thing does not', () => {
    expect(nform(para('학생', 'NOUN'), 'p:from-person')).toBe('학생에게서');
    expect(slots(para('책', 'NOUN'))).not.toContain('p:from-person');
  });
  it('the gloss test is the stated word list: the last word of the first clause', () => {
    expect(koGlossIsPersonOrAnimal('older sister')).toBe(true);
    expect(koGlossIsPersonOrAnimal('dog; (derogatory) a lowlife')).toBe(true);
    expect(koGlossIsPersonOrAnimal('book')).toBe(false);
    expect(koGlossIsPersonOrAnimal(undefined)).toBe(false);
  });
  it('a form whose particle has no row lights none (학생께 for a non-님 noun)', () => {
    const cells = para('학생', 'NOUN').cells.map((c) => ({ form: c.form, features: c.features, sources: ['generated' as const], status: 'generated' as const }));
    const r = koAnalyzeToken('학생께').find((x) => x.lemma && koBareLemma(x.lemma) === '학생');
    expect(koCellsFor({ cells }, r?.morph ?? {}, '학생께')).toEqual([]);
    // through the real adapter and the shared selection: an empty list is none for Korean
    return import('../../../packages/golearn-extension/src/content/enrich').then(({ selectedCellKeys }) => {
      const pk = { languageId: 'ko', lemma: '학생', pos: 'NOUN' as const, kind: 'noun-declension' as const, cells, notes: [], sources: [], status: 'generated' as const };
      expect(koAdapter.cellsForIsExact).toBe(true);
      expect(selectedCellKeys(koAdapter, pk, r?.morph ?? {}, '학생께')).toEqual([]);
    });
  });
});
