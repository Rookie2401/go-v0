// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate } from '../../../src/core';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { koAnalyzeToken, koAnalyzeTokens, koClearAnalysisCache, koMoodFromPunctuation, koPredicateGloss } from '../../../src/adapters/korean/analyze';
import { describeKoMorph } from '../../../src/adapters/korean/describe';
import { koGenerate } from '../../../src/adapters/korean/conjugate';
import { ENDINGS, koEnding } from '../../../src/adapters/korean/endings';
import { koTokenize } from '../../../src/adapters/korean/text';
import { koStemKey } from '../../../src/adapters/korean/index-store';
import { FIXTURE_ROWS, installFixtureLexicon, uninstallFixtureLexicon } from './fixture-lexicon';

/** The card takes the reading with the highest confidence: confidences never rise down the list, and the first is strictly the highest. */
function assertOrder(w: string, cs: AnalysisCandidate[]): void {
  for (let i = 1; i < cs.length; i++) expect(cs[i].confidence, `${w}: reading ${i} above the one before`).toBeLessThanOrEqual(cs[i - 1].confidence);
  if (cs.length > 1) expect(cs[0].confidence, `${w}: first not strictly highest`).toBeGreaterThan(cs[1].confidence);
  for (const c of cs) {
    for (const v of ['VerbForm', 'Tense', 'Voice', 'Number', 'Mood']) expect(c.morph[v] ?? '', `${w}: ${v} is a list`).not.toMatch(/,/u);
    for (const p of c.parts ?? []) { expect(p.pos, `${w}: part ${p.text} has no pos`).toBeDefined(); expect(p.kind, `${w}: part ${p.text} has no kind`).toBeDefined(); }
  }
}
const an = (w: string, ctx?: { prevKey?: string; prevIsLatinOrDigit?: boolean }) => { const cs = koAnalyzeToken(w, ctx); assertOrder(w, cs); return cs; };
const first = (w: string) => an(w)[0];
const lemmas = (w: string) => an(w).map((c) => c.lemma);
const pl = (c: AnalysisCandidate) => (c.parts ?? []).map((p) => p.lemma);
const has = (w: string, lemma: string, pos?: string) => an(w).some((c) => c.lemma === lemma && (!pos || c.pos === pos));

beforeAll(() => installFixtureLexicon());
afterAll(() => uninstallFixtureLexicon());

describe('acceptance: nominals and particles', () => {
  it('학생은', () => { const c = first('학생은'); expect(c).toMatchObject({ lemma: '학생', pos: 'NOUN', gloss: 'student' }); expect(c.morph.Topic).toBe('Yes'); expect(pl(c)).toEqual(['학생', '은/는']); expect(c.confidence).toBe(0.92); });
  it('학생들이', () => { const c = first('학생들이'); expect(pl(c)).toEqual(['학생', '들', '이/가']); expect(c.morph).toMatchObject({ Number: 'Plur', Case: 'Nom' }); });
  it('학교에서', () => expect(pl(first('학교에서'))).toEqual(['학교', '에서']));
  it('친구에게만', () => expect(pl(first('친구에게만'))).toEqual(['친구', '에게', '만']));
  it('학교에서도', () => { const c = first('학교에서도'); expect(pl(c)).toEqual(['학교', '에서', '도']); expect(c.morph.Particle).toBe('at+also'); });
  it('집에서부터', () => expect(pl(first('집에서부터'))).toEqual(['집', '에서부터']));
  it('여기까지는', () => expect(pl(first('여기까지는'))).toEqual(['여기', '까지', '은/는']));
  it('책을: no Number at all', () => { const c = first('책을'); expect(c.morph.Number).toBeUndefined(); expect(c.morph.Case).toBe('Acc'); });
  it('학생이, 책이', () => { expect(pl(first('학생이'))).toEqual(['학생', '이/가']); expect(pl(first('책이'))).toEqual(['책', '이/가']); });
  it('학생입니다: the copula part', () => {
    const c = first('학생입니다');
    expect(c.lemma).toBe('학생');
    expect(pl(c)).toEqual(['학생', '이다', '-ㅂ니다/-습니다']);
    expect(c.parts![1].pos).toBe('AUX');
    expect(c.morph).toMatchObject({ VerbType: 'Cop', SpeechLevel: 'Hasipsio', Mood: 'Ind' });
  });
  it('의사예요, 의사다, 의사였다, 의사야', () => {
    for (const w of ['의사예요', '의사다', '의사였다']) { const c = first(w); expect(c.lemma, w).toBe('의사'); expect(pl(c)[1], w).toBe('이다'); }
    // 의사야 is also the vocative / 야 delimiter on 의사: the copula reading is one of them
    expect(an('의사야').some((c) => pl(c)[1] === '이다')).toBe(true);
    expect(first('의사였다').morph.Tense).toBe('Past');
  });
  it('fused pronouns: 내가, 이건, 제가, 난, 뭘', () => {
    const a = first('내가'); expect(a.lemma).toBe('나'); expect(pl(a)).toEqual(['나', '이/가']);
    const b = first('이건'); expect(b.lemma).toBe('이것'); expect(pl(b)).toEqual(['이것', '은/는']); expect(b.parts!.every((p) => p.morph?.Contracted === 'Yes')).toBe(true); expect(b.parts![1].morph?.Fused).toBe('Yes');
    const c = first('제가'); expect(c.lemma).toBe('저'); expect(c.gloss).toMatch(/\bI\b/u);
    expect(first('난').lemma).toBe('나');
    expect(first('뭘').lemma).toBe('무엇');
  });
  it('나도: 나 + 도 first', () => { const c = first('나도'); expect(c.lemma).toBe('나'); expect(pl(c)).toEqual(['나', '도']); expect(has('나도', '나다')).toBe(true); });
  it('수: bound noun', () => { const c = first('수'); expect(c.lemma).toBe('수'); expect(c.morph.NounType).toBe('Bound'); });
  it('a counter is CLF', () => { const c = first('년'); expect(c.pos).toBe('CLF'); expect(c.morph.NounType).toBe('Clf'); });
  it('선생님께서는, 문화적인: derivational suffixes', () => {
    expect(first('선생님께서는').lemma).toBe('선생님');
    const c = first('문화적인'); expect(pl(c)).toEqual(['문화', '적', '이다', '-(으)ㄴ']);
  });
  it('스마트폰을: unknown → unconfirmed, ≤ 0.45, no gloss, never a predicate', () => {
    const cs = an('스마트폰을');
    expect(cs[0]).toMatchObject({ lemma: '스마트폰', unconfirmed: true });
    expect(cs[0].confidence).toBeLessThanOrEqual(0.45);
    expect(cs[0].gloss).toBeUndefined();
    expect(pl(cs[0])).toEqual(['스마트폰', '을/를']);
    expect(cs.some((c) => c.pos === 'VERB')).toBe(false);
  });
  it('an unknown word alone stays a word, never a predicate', () => {
    for (const w of ['뷁뚫', '스마트폰했다']) expect(an(w).every((c) => c.unconfirmed && c.pos !== 'VERB' && c.confidence <= 0.45), w).toBe(true);
  });
});

describe('acceptance: predicates', () => {
  it('먹었습니다', () => { const c = first('먹었습니다'); expect(c.lemma).toBe('먹다'); expect(c.morph).toMatchObject({ Tense: 'Past', SpeechLevel: 'Hasipsio', Mood: 'Ind', VerbForm: 'Fin' }); });
  it('읽으셨습니다: 셨 fused', () => {
    const c = first('읽으셨습니다');
    expect(c.morph).toMatchObject({ Honorific: 'Subj', Tense: 'Past', SpeechLevel: 'Hasipsio' });
    expect(pl(c)).toEqual(['읽다', '-(으)시-', '-았/었-', '-ㅂ니다/-습니다']);
    expect(c.parts![1].morph?.Fused).toBe('Yes');
    expect(c.parts![2].morph?.Fused).toBe('Yes');
    expect(c.parts!.map((p) => [p.start, p.end])).toEqual([[0, 1], [1, 3], [2, 3], [3, 6]]);
  });
  it('들어요 → 듣다 and 들다', () => { expect(has('들어요', '듣다')).toBe(true); expect(has('들어요', '들다')).toBe(true); });
  it('irregular classes', () => {
    expect(first('추워요').lemma).toBe('춥다');
    expect(first('추워요').morph.Irregular).toBe('B');
    expect(first('몰라요').lemma).toBe('모르다');
    expect(first('하얘요').lemma).toBe('하얗다');
    expect(first('지어요').lemma).toBe('짓다');
    expect(first('도와요').lemma).toBe('돕다');
    expect(first('그래요').lemma).toBe('그렇다');
    expect(first('누레요').lemma).toBe('누렇다');
    expect(first('퍼요').lemma).toBe('푸다');
    expect(first('푸르러요').lemma).toBe('푸르다');
    // 이르러: the 러-irregular infinitive is 이르다² (reach) alone; -(으)러 (purpose) fits both verbs and is the undecided reading
    expect(an('이르러').some((c) => c.lemma === '이르다²' && c.morph.Irregular === 'Reo')).toBe(true);
    expect(an('이르러').some((c) => c.lemma === '이르다³' && c.morph.Irregular === 'Reo')).toBe(false);
  });
  it('contractions: 돼요 / 되어요, 봐요 / 보아요, 줘요 / 주어요, 해요 / 하여요, 마셔요 / 마시어요', () => {
    expect(first('돼요')).toMatchObject({ lemma: '되다' }); expect(first('돼요').morph.Contracted).toBe('Yes');
    expect(first('되어요').lemma).toBe('되다'); expect(first('되어요').morph.Contracted).toBeUndefined();
    for (const [a, b, l] of [['봐요', '보아요', '보다'], ['줘요', '주어요', '주다'], ['해요', '하여요', '하다'], ['마셔요', '마시어요', '마시다']]) {
      expect(first(a).lemma, a).toBe(l); expect(first(b).lemma, b).toBe(l);
    }
  });
  it('좋습니다: ADJ, descriptive', () => { const c = first('좋습니다'); expect(c).toMatchObject({ lemma: '좋다', pos: 'ADJ' }); expect(c.morph).toMatchObject({ VerbType: 'Descriptive', SpeechLevel: 'Hasipsio' }); });
  it('공부했어요, 공부했습니다: 공부 + 하 + 였 + 습니다', () => {
    const a = first('공부했어요'); expect(a.lemma).toBe('공부하다'); expect(a.morph).toMatchObject({ Tense: 'Past', SpeechLevel: 'Haeyo' });
    const b = first('공부했습니다');
    expect(b.parts!.map((p) => p.text)).toEqual(['공부', '하', '-였-', '-습니다']);
    expect(pl(b)).toEqual(['공부', '하다', '-았/었-', '-ㅂ니다/-습니다']);
  });
  it('먹고, 싶어요, 있어요, 않았어요', () => {
    expect(first('먹고').morph).toMatchObject({ VerbForm: 'Conn', Connective: 'and' });
    expect(first('싶어요').lemma).toBe('싶다');
    expect(first('있어요')).toMatchObject({ lemma: '있다', pos: 'ADJ' });
    expect(first('있어요').morph.VerbType).toBe('Exist');
    expect(first('않았어요')).toMatchObject({ lemma: '않다' }); expect(first('않았어요').morph.Tense).toBe('Past');
  });
  it('있다 / 없다 are one lexical reading each; the AUX reading of 있다 follows', () => {
    const cs = an('있는');
    expect(cs.filter((c) => c.lemma === '있다' && c.pos !== 'AUX')).toHaveLength(1);
    expect(cs[0].morph).toMatchObject({ VerbType: 'Exist', VerbForm: 'Adn' });
    expect(cs.some((c) => c.pos === 'AUX')).toBe(true);
    expect(first('없는').lemma).toBe('없다');
  });
  it('갈 → 가다, prospective adnominal', () => { const c = first('갈'); expect(c.lemma).toBe('가다'); expect(c.morph).toMatchObject({ VerbForm: 'Adn', Aspect: 'Prosp' }); expect(c.parts![1].morph?.Aspect).toBe('Prosp'); });
  it('가지 → a reading 가다 + -지 and the noun', () => { expect(an('가지').some((c) => c.lemma === '가다' && pl(c)[1] === '-지')).toBe(true); expect(has('가지', '가지', 'NOUN')).toBe(true); });
  it('아닙니다, 닫아요, 잡아요, 웃어요, 좋아요', () => {
    expect(first('아닙니다')).toMatchObject({ lemma: '아니다' });
    expect(first('아닙니다').morph).toMatchObject({ VerbType: 'Cop', Polarity: 'Neg' });
    expect(lemmas('닫아요')).toEqual(['닫다']);
    expect(first('잡아요').lemma).toBe('잡다');
    expect(first('웃어요').lemma).toBe('웃다');
    expect(first('좋아요').lemma).toBe('좋다');
  });
  it('써요 → the undecided 쓰다 VERB first among the verb homonyms, the numbered verbs after it, 쓰다 ADJ its own reading', () => {
    const cs = an('써요');
    const verbs = cs.filter((c) => c.pos === 'VERB');
    expect(verbs[0]).toMatchObject({ lemma: '쓰다' });
    expect(verbs[0].notes?.homonym).toBe('undecided');
    expect(verbs.slice(1).map((c) => c.lemma)).toEqual(['쓰다¹', '쓰다²', '쓰다³']);
    expect(cs.some((c) => c.lemma === '쓰다' && c.pos === 'ADJ')).toBe(true);
    expect(cs[0].pos).toBe('VERB'); // the verb set is commoner than "bitter"
  });
  it('삽니다, 사는, 산 → 살다 and 사다; 살아요 → 살다; 사요 → 사다', () => {
    for (const w of ['삽니다', '사는', '산']) { expect(has(w, '살다'), w).toBe(true); expect(has(w, '사다'), w).toBe(true); }
    expect(lemmas('살아요')).toEqual(['살다']);
    expect(lemmas('사요')).toEqual(['사다']);
    const s = an('삽니다').find((c) => c.lemma === '살다')!; expect(s.parts![0].morph?.Fused).toBe('Yes'); expect(s.morph.Irregular).toBe('L');
  });
  it('먹- forms all → 먹다', () => { for (const w of ['먹으면', '먹는', '먹을', '먹으세요', '먹어요', '먹었다', '먹고']) expect(first(w).lemma, w).toBe('먹다'); });
  it('예쁜, 큰: adnominal present of a descriptive verb', () => {
    expect(first('예쁜')).toMatchObject({ lemma: '예쁘다', pos: 'ADJ' }); expect(first('예쁜').morph).toMatchObject({ VerbForm: 'Adn', Tense: 'Pres', VerbType: 'Descriptive' });
    expect(first('큰').lemma).toBe('크다');
    expect(first('먹은').morph.Tense).toBe('Past');
  });
  it('가겠습니다: Presumptive, no Tense', () => { const c = first('가겠습니다'); expect(c.morph.Modality).toBe('Presumptive'); expect(c.morph.Tense).toBeUndefined(); });
  it('먹었었다: Pqp', () => expect(first('먹었었다').morph).toMatchObject({ Tense: 'Past', Aspect: 'Pqp' }));
  it('literary endings', () => {
    for (const [w, e] of [['하나이다', '-나이다'], ['하옵소서', '-(으)소서'], ['하시니라', '-(으)니라']]) { const c = first(w); expect(c.lemma, w).toBe('하다'); expect(c.morph.SpeechLevel, w).toBe('Lit'); expect(c.notes?.ending, w).toBe(e); }
    const r = first('이르시되'); expect(r.morph.Register).toBe('Lit'); expect(r.morph.SpeechLevel).toBeUndefined(); // a literary connective says Register=Lit expect(r.notes?.ending).toBe('-(으)되'); expect((r.lemma ?? '').startsWith('이르다')).toBe(true);
  });
  it('하심이라: -(으)시- + -(으)ㅁ + copula + -(이)라', () => { const c = first('하심이라'); expect(c.lemma).toBe('하다'); expect(pl(c)).toEqual(['하다', '-(으)시-', '-(으)ㅁ', '이다', '-(이)라']); });
  it('간다고: indirect quotation', () => { const c = first('간다고'); expect(c.lemma).toBe('가다'); expect(c.morph.Quote).toBe('Ind'); expect(c.notes?.ending).toBe('-ㄴ다고/-는다고'); });
  it('하여, 되어, 물어요: no noun split above the verb', () => {
    expect(first('하여').lemma).toBe('하다');
    expect(first('되어').lemma).toBe('되다');
    expect(an('물어요').some((c) => c.pos === 'NOUN')).toBe(false);
  });
  it('honorific 시-verbs: 계세요, 주무세요, 계셨어요, 계십니다', () => {
    for (const w of ['계세요', '계셨어요', '계십니다', '계셔요']) expect(first(w).lemma, w).toBe('계시다');
    expect(first('주무세요').lemma).toBe('주무시다');
    expect(first('마셔요').lemma).toBe('마시다');
    expect(an('마세요').some((c) => c.lemma === '마시다')).toBe(false);
  });
  it('드렸습니다: the lexical verb first, the auxiliary after it', () => { const cs = an('드렸습니다'); expect(cs[0]).toMatchObject({ lemma: '드리다', pos: 'VERB' }); expect(cs.some((c) => c.pos === 'AUX')).toBe(true); });
  it('보다 at token level: the main verb first', () => expect(first('봐요').pos).toBe('VERB'));
  it('먹어야겠다', () => expect(first('먹어야겠다').morph.Modality).toBe('Necessitative'));
  it('noun + 되다 / 받다 / 하다 the lexicon does not list: the derived verb', () => {
    const a = first('체포되었다'); expect(a).toMatchObject({ lemma: '체포되다', pos: 'VERB' }); expect(a.morph).toMatchObject({ Voice: 'Pass', Tense: 'Past' }); expect(a.notes?.derived).toBe('체포 + 되다');
    expect(first('존경받는')).toMatchObject({ lemma: '존경받다' }); expect(first('존경받는').morph.Voice).toBe('Pass');
    expect(first('청소했어요').lemma).toBe('청소하다');
    expect(first('걱정했는데').lemma).toBe('걱정하다');
    expect(first('사용되었다').lemma).toBe('사용되다'); // the dictionary's own headword
  });
  it('-아/어지다 written as one word', () => {
    const cs = an('만들어졌다');
    expect(cs[0].lemma).toBe('만들어지다');
    expect(cs.some((c) => c.lemma === '만들다' && c.morph.Voice === 'Pass')).toBe(true);
  });
  it('the source gives no class: both analyses, neither above 0.80', () => {
    const cs = an('길어요');
    const g = cs.find((c) => c.lemma === '긷다')!;
    expect(g.confidence).toBeLessThanOrEqual(0.8);
    expect(String(g.notes?.remark)).toMatch(/no conjugation table/u);
    expect(first('긷고').confidence).toBeLessThanOrEqual(0.8);
  });
  it('Mood: none where the ending does not decide; notes.sentenceType says what it allows; the punctuation helper sets it', () => {
    const c = first('들어요');
    expect(c.morph.Mood).toBeUndefined();
    expect(c.notes?.sentenceType).toBe('statement, question, command or suggestion');
    const p = first('예뻐요'); expect(p.notes?.sentenceType).toBe('statement or question');
    expect(first('먹었어요').notes?.sentenceType).toBe('statement or question');
    const q = first('먹어요');
    expect(koMoodFromPunctuation(q, '?')).toBe('Int');
    expect(q.morph.Mood).toBe('Int');
    expect(first('먹습니까').morph.Mood).toBe('Int');
    expect(first('먹읍시다').morph.Mood).toBe('Prop');
  });
  it('nonstandard spacing: 먹을수있어요', () => {
    const c = first('먹을수있어요');
    expect(c.notes?.spacing).toBe('written without spaces');
    expect(c.confidence).toBeLessThanOrEqual(0.6);
    expect(pl(c)).toEqual(['먹다', '-(으)ㄹ', '수', '있다', '-아요/-어요']);
  });
  it('a particle-only token after a Latin or digit token', () => {
    const c = an('가', { prevIsLatinOrDigit: true })[0];
    expect(c).toMatchObject({ lemma: '이/가', pos: 'ADP' });
    expect(an('이에요', { prevIsLatinOrDigit: true })[0].lemma).toBe('이다');
  });
});

describe('homonyms (three states)', () => {
  it('눈이: undecided first, then 눈¹ and 눈²', () => {
    const cs = an('눈이');
    expect(cs[0]).toMatchObject({ lemma: '눈', gloss: 'eye / snow' });
    expect(cs[0].notes?.homonym).toBe('undecided');
    expect(cs[0].notes?.homonyms).toBe('눈¹ eye | 눈² snow');
    expect(cs.slice(1).map((c) => c.lemma)).toEqual(['눈¹', '눈²']);
    expect(cs[0].confidence).toBeGreaterThan(cs[1].confidence);
  });
  it('the undecided reading is ranked as one word: 배가 is 배 at the band of any noun', () => { expect(first('배가').confidence).toBe(first('책이').confidence); });
  it('물어요 → 묻다¹ (ask) and 물다 (bite); the form excludes bury and stick', () => {
    const ls = lemmas('물어요');
    expect(ls).toContain('묻다¹'); expect(ls).toContain('물다');
    expect(ls).not.toContain('묻다²'); expect(ls).not.toContain('묻다³'); expect(ls).not.toContain('묻다');
    expect(an('물었어요').map((c) => c.lemma)).toEqual(expect.arrayContaining(['묻다¹', '물다']));
  });
  it('묻어요 → undecided between bury and stick only', () => {
    const cs = an('묻어요');
    expect(cs[0]).toMatchObject({ lemma: '묻다' }); expect(cs[0].notes?.homonym).toBe('undecided');
    expect(cs[0].notes?.homonyms).toBe('묻다² to bury | 묻다³ to stick, get on (of dirt)');
    expect(cs.map((c) => c.lemma)).not.toContain('묻다¹');
  });
  it('묻고 → undecided among all three', () => {
    const cs = an('묻고');
    expect(cs[0].lemma).toBe('묻다'); expect(cs[0].notes?.homonym).toBe('undecided');
    expect(cs.slice(1).map((c) => c.lemma)).toEqual(['묻다¹', '묻다²', '묻다³']);
  });
  it('걷다: 걸어요 → walk only, 걷어요 → gather only, 걷고 → undecided', () => {
    expect(lemmas('걸어요')).toEqual(['걷다¹']);
    expect(lemmas('걷어요')).toEqual(['걷다²']);
    expect(first('걷고').notes?.homonym).toBe('undecided');
  });
  it('a main set: 시간 is the bare lemma at full band, the others only named', () => {
    const cs = an('시간이');
    expect(cs[0]).toMatchObject({ lemma: '시간', gloss: 'time', confidence: 0.92 });
    expect(cs[0].notes?.otherEntries).toBe('시간² 屍姦; 시간³ 時刊');
    expect(cs.some((c) => (c.lemma ?? '').startsWith('시간²'))).toBe(false);
  });
  it('an "other" entry is a reading when only it licenses the form: 듣어요 → 듣다² (drip)', () => {
    expect(first('듣어요')).toMatchObject({ lemma: '듣다²', confidence: 0.92 });
    expect(first('듣고').lemma).toBe('듣다');
  });
  it('glossOwn passes through', () => expect(first('이에요', ).notes?.glossOwn ?? first('아닙니다').notes?.glossOwn).toBe('yes'));
});

describe('same spelling, noun or predicate: both kinds of reading', () => {
  const both: Array<[string, string, string]> = [
    ['가지', '가지', '가다'], ['가게', '가게', '가다'], ['감', '감', '가다'], ['자', '자', '자다'], ['잘', '잘', '자다'], ['한', '한', '하다'], ['안', '안', '알다'], ['나는', '나', '날다'],
  ];
  it.each(both)('%s → %s and %s', (w, a, b) => { expect(has(w, a), a).toBe(true); expect(has(w, b), b).toBe(true); });
  it('일, 이: every class', () => {
    expect(an('일').map((c) => c.pos)).toEqual(expect.arrayContaining(['NOUN', 'NUM']));
    expect(an('이').map((c) => c.pos)).toEqual(expect.arrayContaining(['DET', 'PRON', 'NUM', 'NOUN', 'ADP']));
  });
  it('a closed-class word alone comes before a predicate form: 안 "not", 한 "one"', () => {
    expect(first('안')).toMatchObject({ lemma: '안', pos: 'ADV' });
    expect(first('한')).toMatchObject({ lemma: '한', pos: 'DET' });
  });
  it('낫다 / 나다: 나았어요 → 낫다 only; 났어요 → 나다 (and its AUX)', () => {
    expect(an('나았어요').filter((c) => c.pos === 'VERB').map((c) => c.lemma)).toEqual(['낫다']);
    expect(an('났어요').filter((c) => c.pos === 'VERB').map((c) => c.lemma)).toEqual(['나다']);
  });
  it('듣다 / 들다: 듣고 → 듣다; 들고 → 들다; 들은 → 듣다 (들다 gives 든) and the noun 들 + 은', () => {
    expect(lemmas('듣고')).toEqual(['듣다']);
    expect(lemmas('들고')).toEqual(['들다']);
    expect(has('들은', '듣다')).toBe(true); expect(has('들은', '들다')).toBe(false);
    expect(has('든', '들다')).toBe(true);
  });
  // fix batch 7 (FF2): noun + (이)시 + ending is the honorific copula with its 이 dropped; with 누이다 absent, 누이시며 is 누이 + 이 + -시- + -며
  it('누이시며 (누이다 not in the lexicon): the honorific copula, never the bound 누', () => { const c = first('누이시며'); expect(c.lemma).toBe('누이'); expect(pl(c)).toEqual(['누이', '이다', '-(으)시-', '-(으)며']); });
});

describe('Hanja on the page', () => {
  it('學校에서, 韓國語를, 大韓民國의', () => {
    const a = first('學校에서'); expect(a).toMatchObject({ lemma: '학교', gloss: 'school' }); expect(a.notes?.hanja).toBe('學校'); expect(pl(a)).toEqual(['학교', '에서']);
    const b = first('韓國語를'); expect(b.lemma).toBe('한국어'); expect(pl(b)).toEqual(['한국어', '을/를']); expect(b.confidence).toBe(0.92);
    expect(first('大韓民國의').lemma).toBe('대한민국');
    expect(first('學生은').confidence).toBe(0.92); // 학생 ends in a consonant: 은 agrees
  });
});

describe('spans index the original string', () => {
  it('NFD input', () => {
    const w = '먹었습니다'.normalize('NFD');
    const c = first(w);
    expect(c.lemma).toBe('먹다');
    const spans = c.parts!.map((p) => w.slice(p.start, p.end).normalize('NFC'));
    expect(spans).toEqual(['먹', '었', '습니다']);
    expect(c.parts![2].end).toBe(w.length);
  });
  it('a zero-width space inside the word', () => {
    const w = '먹었​습니다';
    const c = first(w);
    expect(c.lemma).toBe('먹다');
    expect(c.parts!.map((p) => w.slice(p.start, p.end))).toEqual(['먹', '었', '습니다']);
  });
});

describe('order = confidence, over hundreds of generated forms', () => {
  it('every predicate of the fixture × common chains analyses back to its lemma', () => {
    const chains = [['haeyo'], ['p-past', 'hasipsio-decl'], ['p-hon', 'haeyo'], ['if'], ['adn-n'], ['adn-l'], ['and'], ['p-past', 'haeyo'], ['nmlz-gi'], ['p-fut', 'decl-da'], ['hasipsio-q']];
    let n = 0;
    const misses: string[] = [];
    for (const [lemma, tag, irr] of FIXTURE_ROWS) {
      if (!['VV', 'VA'].includes(tag) || !irr) continue;
      const stem = koStemKey(lemma, tag);
      for (const ch of chains) {
        const es = ch.map(koEnding);
        if (!es.every((e) => e.pred.includes(tag === 'VA' ? 'A' : 'V') || e.pred.includes('P') || e.tag === 'EP')) continue;
        for (const form of koGenerate(stem, irr as never, es)) {
          n++;
          const cs = an(form);
          if (!cs.some((c) => (c.lemma ?? '').replace(/[⁰-⁹¹²³]+$/u, '') === lemma)) misses.push(`${form} (${lemma})`);
        }
      }
    }
    expect(n).toBeGreaterThan(400);
    expect(misses).toEqual([]);
  });
});

describe('lexicons installed twice', () => {
  it('the analysis is identical with the fixture under two ids', async () => {
    const words = ['학생은', '먹었습니다', '들어요', '눈이', '써요', '삽니다', '공부했어요', '시간이', '學校에서', '나도'];
    const once = words.map((w) => JSON.stringify(koAnalyzeToken(w)));
    const { installFixtureLexicon: inst, uninstallFixtureLexicon: un } = await import('./fixture-lexicon');
    inst('ko-test-fixture-2');
    try { expect(words.map((w) => JSON.stringify(koAnalyzeToken(w)))).toEqual(once); } finally { un('ko-test-fixture-2'); }
  });
});

describe('koAnalyzeTokens and describeKoMorph', () => {
  it('KBS가: the particle token after a Latin token', () => {
    const toks = koAnalyzeTokens(koTokenize('KBS가 좋아요'));
    const ga = toks.find((t) => t.token.surface === '가')!;
    expect(ga.candidates[0].lemma).toBe('이/가');
    expect(ga.analyzer).toBe('adapter-ko@1');
    expect(toks.find((t) => t.token.surface === '좋아요')!.candidates[0].syllables?.length).toBe(3);
  });
  it('plain words', () => {
    expect(describeKoMorph(first('먹었습니다').morph, 'VERB')).toBe('past, formal polite (하십시오체), statement');
    expect(describeKoMorph(first('학생은').morph, 'NOUN')).toBe('topic particle');
    expect(describeKoMorph(first('예뻐요').morph, 'ADJ')).toBe('descriptive verb, informal polite (해요체)');
    expect(describeKoMorph(first('예쁜').morph, 'ADJ')).toBe('descriptive verb, present, before a noun');
  });
  it('every ending in the inventory has a citation form, a tag and a role', () => {
    for (const e of ENDINGS) { expect(e.cite, e.id).toMatch(/^-/u); expect(e.role, e.id).toBeTruthy(); }
  });
});

describe('fix batch 2', () => {
  it('a whole conjunctive adverb outranks its etymology, as CONJ, whatever the lexicon class', () => {
    for (const w of ['그래서', '그러나', '그리고', '하지만', '그런데', '그러면', '그럼', '그러니까', '그래도', '따라서']) {
      const cs = an(w);
      expect(cs[0], w).toMatchObject({ lemma: w, pos: 'CONJ' });
      expect(cs.filter((c) => c.lemma === w).length, w).toBe(1); // the lexicon's MAG row is suppressed
    }
    expect(an('그래서').some((c) => c.lemma === '그렇다')).toBe(true); // kept below
  });
  it('a common licensed predicate outranks a one-syllable noun + particle: 도와 → 돕다', () => { expect(first('도와').lemma).toBe('돕다'); expect(has('도와', '도')).toBe(true); });
  it('a listed noun outranks a nominalised predicate: 봄에 → 봄, 삶을 → 삶', () => { expect(first('봄에').lemma).toBe('봄'); expect(first('삶을').lemma).toBe('삶'); expect(has('봄에', '보다')).toBe(true); });
  it('미세요 → 밀다 + -세요 above the noun + 요', () => { expect(first('미세요').lemma).toBe('밀다'); expect(has('미세요', '미세')).toBe(true); });
  it('a 하다-verb the lexicon holds outranks noun + 하고: 계속하고', () => { expect(first('계속하고').lemma).toBe('계속하다'); expect(an('계속하고').some((c) => c.parts?.[1]?.lemma === '하고')).toBe(true); });
  it('파래요 → 파랗다', () => expect(first('파래요').lemma).toBe('파랗다'));
  it('an unlisted compound keeps its head and its particle', () => {
    const c = first('예산안을');
    expect(c).toMatchObject({ lemma: '예산안', pos: 'NOUN', unconfirmed: true });
    expect(c.notes?.compound).toBe('예산 + 안');
    expect(pl(c)).toEqual(['예산', '안', '을/를']);
    expect(c.morph.Case).toBe('Acc');
    expect(c.gloss).toBeUndefined();
    expect(String(c.notes?.glosses)).toMatch(/budget/u);
    const d = first('상승률이'); expect(d.lemma).toBe('상승률'); expect(pl(d)).toEqual(['상승', '률', '이/가']);
  });
  it('noun + a Sino-Korean suffix is a derived word: 형제애의', () => { const c = first('형제애의'); expect(c.lemma).toBe('형제애'); expect(c.notes?.derived).toBe('형제 + 애'); expect(pl(c).at(-1)).toBe('의'); });
  it('numerals compose: 사만 40000, 구천 9000, 스물다섯 25; "only four" kept second', () => {
    const a = an('사만');
    expect(a[0]).toMatchObject({ lemma: '사만', pos: 'NUM' }); expect(a[0].notes?.value).toBe('40000');
    expect(first('구천').notes?.value).toBe('9000');
    expect(first('스물다섯').notes?.value).toBe('25');
    expect(first('삼십오만').notes?.value).toBe('350000');
  });
  it('여기서, 거기서, 어디서: 에서 shortened to 서', () => {
    for (const w of ['여기서', '거기서']) { const c = first(w); expect(pl(c), w).toEqual([w.slice(0, 2), '에서']); expect(c.confidence).toBeGreaterThan(0.8); }
    expect(an('친구서').every((c) => c.parts?.[1]?.lemma !== '에서')).toBe(true);
  });
  it('아니하다: main verb and auxiliary', () => { const cs = an('아니하시고'); expect(cs[0]).toMatchObject({ lemma: '아니하다', pos: 'VERB' }); expect(cs.some((c) => c.lemma === '아니하다' && c.pos === 'AUX')).toBe(true); });
  it('missing forms: 들러, 하려, 거룩히, 시쯤, 간다며, 이루어지이다, 먹었더라면, 임하옵시며', () => {
    expect(has('들러', '들르다')).toBe(true);
    expect(first('하려').morph.Connective).toBe('intend');
    const g = first('거룩히'); expect(g).toMatchObject({ lemma: '거룩히', pos: 'ADV' }); expect(g.notes?.derived).toBe('거룩하다 + -히');
    const s = first('시쯤'); expect(pl(s)).toEqual(['시', '쯤']); expect(s.lemma?.startsWith('시')).toBe(true);
    expect(first('간다며').morph.Quote).toBe('Ind');
    const y = first('이루어지이다'); expect(y.lemma).toBe('이루다'); expect(y.morph.SpeechLevel).toBe('Lit');
    expect(first('먹었더라면').lemma).toBe('먹다');
    const h = first('임하옵시며'); expect(h.lemma).toBe('임하다'); expect(h.morph.Honorific).toBe('Subj'); expect(h.morph.Register).toBe('Lit');
  });
  it('derived adverbs in -이: 같이 (listed) first, 높이 derived', () => { expect(first('같이')).toMatchObject({ lemma: '같이', pos: 'ADV' }); expect(first('높이')).toMatchObject({ lemma: '높이', pos: 'ADV' }); expect(first('높이').notes?.derived).toBe('높다 + -이'); });
  it('계신: present, an existential', () => expect(first('계신').morph.Tense).toBe('Pres'));
  it('아니다 is one closed item', () => { const cs = an('아닙니다'); expect(cs.filter((c) => c.lemma === '아니다')).toHaveLength(1); expect(cs[0]).toMatchObject({ pos: 'AUX' }); expect(first('아니라').lemma).toBe('아니다'); });
  it('a derived verb says what it is built from', () => expect(first('체포되었다').gloss).toBe('arrest (+ 되다: passive)'));
  it('a root is never a word by itself: 복잡하다 is the derived adjective', () => {
    const c = first('복잡한'); expect(c).toMatchObject({ lemma: '복잡하다', pos: 'ADJ' }); expect(c.morph.VerbType).toBe('Descriptive'); expect(c.morph.Tense).toBe('Pres');
    expect(an('복잡').every((x) => x.unconfirmed)).toBe(true);
  });
  it('unspaced words are read as whole words or not at all', () => {
    const c = first('나는학교에갔다');
    expect(c.notes?.spacing).toBe('written without spaces');
    expect(c.notes?.pieces).toBe('나 + 학교 + 가다');
    const last = c.parts!.at(-1)!; expect(last.end).toBe('나는학교에갔다'.length);
  });
  it('a bound contraction (누) never takes the copula', () => expect(an('누이시며').every((c) => c.lemma !== '누')).toBe(true));
  it('an auxiliary written together with its verb: 해주는', () => { const c = an('해주는').find((x) => x.lemma === '하다'); expect(c).toBeDefined(); expect(pl(c!)).toContain('주다'); });
});

describe('fix batch 2: the sentence package and the feature vocabulary', () => {
  it('a descriptive verb reads as a predicate: "to be cold"', () => {
    expect(first('추워요').gloss).toBe('to be cold');
    expect(first('예뻐요').gloss).toBe('to be pretty');
    expect(first('커요').gloss).toBe('to be big');
    expect(first('먹어요').gloss).toBe('to eat');
  });
  it('the full stop decides no sentence type; only the question mark does', () => {
    const c = first('가세요'); expect(koMoodFromPunctuation(c, '.')).toBeUndefined(); expect(c.morph.Mood).toBeUndefined();
    expect(koMoodFromPunctuation(first('가세요'), '?')).toBe('Int');
  });
  it('the adverbial -게 above the 하게체 command; 마 is 말다', () => {
    expect(first('먹게').morph.Connective).toBe('adverbial');
    expect(an('마').some((c) => c.lemma === '말다')).toBe(true);
  });
  it('vocabulary: Quote without Connective=quote, Focus=UpTo / From, -던 retrospective, literary connectives Register=Lit', () => {
    const q = first('간다고'); expect(q.morph.Quote).toBe('Ind'); expect(q.morph.Connective).toBeUndefined();
    expect(first('여기까지는').morph.Focus).toBe('UpTo');
    expect(first('학교부터').morph.Focus).toBe('From');
    expect(first('먹던').morph).toMatchObject({ Tense: 'Past', Modality: 'Retrospective' }); expect(first('먹던').morph.Aspect).toBeUndefined();
    expect(first('하시되').morph).toMatchObject({ Register: 'Lit', Connective: 'saying' });
  });
});

describe('fix batch 3, on the real compiled core', () => {
  beforeAll(async () => {
    const { KO_CORE } = await import('../../../src/adapters/korean/generated/core');
    const { installKoreanLexicon } = await import('../../../src/adapters/korean/index-store');
    uninstallFixtureLexicon();
    installKoreanLexicon(KO_CORE);
    koClearAnalysisCache();
  });
  afterAll(async () => {
    const { uninstallKoreanLexicon } = await import('../../../src/adapters/korean/index-store');
    uninstallKoreanLexicon('ko-core');
    installFixtureLexicon();
  });
  it('no reading of any VA row of the core has a doubled "to be to"', async () => {
    const { KO_CORE } = await import('../../../src/adapters/korean/generated/core');
    const bad: string[] = [];
    for (const rows of Object.values(KO_CORE.entries)) for (const e of rows) {
      if (e.tag !== 'VA') continue;
      const g = koPredicateGloss(e);
      if (g && /^to be to /iu.test(g)) bad.push(`${e.lemma}: ${g}`);
    }
    expect(bad).toEqual([]);
    expect(koPredicateGloss({ tag: 'VA', gloss: 'cold; chilly' })).toBe('to be cold; chilly');
    expect(koPredicateGloss({ tag: 'VA', gloss: 'cold', glossOwn: true })).toBe('cold');
  });
  it('파래요 → 파랗다 above the contracted quotation of 파다', () => { const cs = an('파래요'); expect(cs[0].lemma).toBe('파랗다'); expect(cs.some((c) => c.lemma === '파다')).toBe(true); });
  it('bound rows are no reading of their own: 네가 → 너 only; bare 제 → 저 + 의 first', () => {
    expect(an('네가').map((c) => c.lemma)).toEqual(['너']);
    expect(an('내가').every((c) => c.lemma !== '내가')).toBe(true);
    expect((first('제').lemma ?? '').replace(/[⁰-⁹¹²³]+$/u, '')).toBe('저'); // the core numbers its 저 entries
    expect(first('제').notes?.fused).toBe('제 = 저 + 의');
  });
  it('a greeting that is a polite form: the predicate first, the greeting second', () => {
    for (const [w, l] of [['감사합니다', '감사하다'], ['안녕하세요', '안녕하다'], ['고맙습니다', '고맙다']]) {
      const cs = an(w);
      expect(cs[0].lemma, w).toBe(l);
      const g = cs.find((c) => c.pos === 'INTJ');
      expect(g?.notes?.phrase, w).toBe('fixed greeting');
    }
    expect(first('그래서').pos).toBe('CONJ');
  });
  it('below a closed-table first reading, silly readings start at 0.70', () => {
    for (const w of ['하지만', '그러나']) {
      const cs = an(w);
      expect(cs[0].pos, w).toBe('CONJ');
      for (const c of cs.slice(1)) if (c.morph.SpeechLevel === 'Hage' || c.morph.SpeechLevel === 'Hao' || (c.parts ?? []).some((p) => p.lemma === '이다' && p.start === p.end)) expect(c.confidence, `${w} ${c.lemma}`).toBeLessThanOrEqual(0.7);
    }
  });
});

describe('fix batch 3 addendum, on the real core', () => {
  beforeAll(async () => {
    const { KO_CORE } = await import('../../../src/adapters/korean/generated/core');
    const { installKoreanLexicon } = await import('../../../src/adapters/korean/index-store');
    uninstallFixtureLexicon();
    installKoreanLexicon(KO_CORE);
    koClearAnalysisCache();
  });
  afterAll(async () => {
    const { uninstallKoreanLexicon } = await import('../../../src/adapters/korean/index-store');
    uninstallKoreanLexicon('ko-core');
    installFixtureLexicon();
  });
  it('a dropped copula and an infinitive + case particle do not beat a plain verb form or a noun: 오기, 해가', () => {
    expect(first('오기').lemma).toBe('오다');
    expect(first('해가').pos).not.toBe('VERB');
    expect(first('하심이라')).toMatchObject({ lemma: '하다' });
    expect(first('하심이라').morph.Connective ?? 'none').not.toBe('not-but');
  });
  it('an unlisted name + particle is the unconfirmed whole stem + the particle, never a listed one-syllable word + the rest', () => {
    for (const w of ['김민수는', '박지성이', '최영희를', '강동원에게', '정우성은']) {
      const c = first(w);
      expect(c.unconfirmed, w).toBe(true);
      expect([...(c.lemma ?? '')].length, w).toBeGreaterThanOrEqual(2);
      expect(c.parts?.at(-1)?.pos, w).toBe('ADP');
    }
  });
  it('a common noun above a rare adverb of the same spelling: 죄', () => expect(first('죄').pos).toBe('NOUN'));
});

const SHARD_DIR = path.resolve('public/lexicon/ko/standard');
describe.skipIf(!fs.existsSync(path.join(SHARD_DIR, 'manifest.json')))('listed compound verbs, over the core and every shard', () => {
  let installed: string[] = [];
  beforeAll(async () => {
    const { KO_CORE } = await import('../../../src/adapters/korean/generated/core');
    const { installKoreanLexicon } = await import('../../../src/adapters/korean/index-store');
    uninstallFixtureLexicon();
    installKoreanLexicon(KO_CORE);
    for (const f of fs.readdirSync(SHARD_DIR)) if (f.endsWith('.json.gz')) { const x = JSON.parse(gunzipSync(fs.readFileSync(path.join(SHARD_DIR, f))).toString('utf8')); installKoreanLexicon(x); installed.push(x.id); }
    koClearAnalysisCache();
  });
  afterAll(async () => {
    const { uninstallKoreanLexicon } = await import('../../../src/adapters/korean/index-store');
    uninstallKoreanLexicon('ko-core'); for (const id of new Set(installed)) uninstallKoreanLexicon(id);
    installFixtureLexicon();
  });
  it('a listed verb + -아/어 + another listed verb reads back to the WHOLE lemma first, citation and -았/었습니다 forms', async () => {
    const { lookupKoreanStem } = await import('../../../src/adapters/korean/index-store');
    const seen = new Set<string>();
    const misses: string[] = [];
    let n = 0;
    const all = new Map<string, { lemma: string; irr?: string }>();
    const { KO_CORE } = await import('../../../src/adapters/korean/generated/core');
    for (const f of [null, ...fs.readdirSync(SHARD_DIR).filter((x) => x.endsWith('.json.gz'))]) {
      const lex = f ? JSON.parse(gunzipSync(fs.readFileSync(path.join(SHARD_DIR, f))).toString('utf8')) : KO_CORE;
      for (const rows of Object.values(lex.entries) as Array<Array<{ lemma: string; tag: string; irr?: string }>>) for (const e of rows) if (e.tag === 'VV' && e.irr) all.set(e.lemma, e);
    }
    const isVerbStem = (s: string) => lookupKoreanStem(s).some((h) => h.entry.tag === 'VV' || h.entry.tag === 'VX');
    for (const e of all.values()) {
      const stem = e.lemma.slice(0, -1);
      const chars = [...stem];
      let compound = false;
      for (let i = 1; i < chars.length && !compound; i++) {
        const left = chars.slice(0, i).join(''), right = chars.slice(i).join('');
        if (!isVerbStem(right)) continue;
        // the left part must be the -아/어 form of a listed verb
        if (koAnalyzeToken(left).some((c) => c.pos === 'VERB' && c.parts?.some((p) => p.lemma === '-아/-어'))) compound = true;
      }
      if (!compound || seen.has(e.lemma)) continue;
      seen.add(e.lemma);
      n++;
      const forms = [e.lemma, ...koGenerate(stem, e.irr as never, [koEnding('p-past'), koEnding('hasipsio-decl')])];
      for (const f of forms) { const c = koAnalyzeToken(f)[0]; if (c?.lemma !== e.lemma) misses.push(`${f} → ${c?.lemma}`); }
    }
    console.log(`listed compound verbs checked: ${n}; forms not read back to the whole lemma first: ${misses.length}${misses.length ? ' e.g. ' + misses.slice(0, 8).join(', ') : ''}`);
    expect(n).toBeGreaterThan(50);
    expect(misses.length / (2 * n)).toBeLessThan(0.02);
  }, 300000);
});

describe('fix batch 4: 말다 and the copulas after a noun', () => {
  it('말다: 마 only bare and before -라 / -요; never 맜', () => {
    expect(koGenerate('말', 'R', [koEnding('p-past'), koEnding('decl-da')])).toEqual(['말았다']);
    expect(koGenerate('말', 'R', [koEnding('hae')]).sort()).toEqual(['마', '말아']);
    expect(koGenerate('말', 'R', [koEnding('haeyo')]).sort()).toEqual(['마요', '말아요']);
    expect(koGenerate('말', 'R', [koEnding('imp-ara')]).sort()).toEqual(['마라', '말아라']);
  });
  it('the copula after a noun: 이야, 이셔, 이세요, 이니, 이에요 / 예요, 이었 / 였', () => {
    const cop = (w: string, noun: string) => an(w).some((c) => c.lemma === noun && (c.parts ?? []).some((p) => p.lemma === '이다'));
    for (const w of ['학생이야', '학생이셔', '학생이세요', '학생이니', '의사니', '학생이에요', '의사예요', '학생이었어요', '의사였어요']) expect(cop(w, w.startsWith('학생') ? '학생' : '의사'), w).toBe(true);
    expect(an('학생이니').some((c) => c.morph.Connective === 'since')).toBe(true);
    expect(an('학생이니').some((c) => c.morph.Mood === 'Int')).toBe(true);
    expect(first('학생이셔').morph).toMatchObject({ Honorific: 'Subj', SpeechLevel: 'Hae' });
  });
  it('the honorific adnominal of the copula is present: 학생이신', () => expect(first('학생이신').morph).toMatchObject({ Tense: 'Pres', Honorific: 'Subj', VerbForm: 'Adn' }));
  it('아니다: 아니셔, 아녜요, 아니에요; 아니예요 read with the standard spelling noted', () => {
    expect(first('아니셔')).toMatchObject({ lemma: '아니다' });
    expect(first('아녜요').lemma).toBe('아니다');
    expect(first('아니에요').lemma).toBe('아니다');
    const m = an('아니예요').find((c) => c.lemma === '아니다')!;
    expect(m.notes?.spelling).toBe('standard: 아니에요');
    expect(m.confidence).toBeLessThanOrEqual(0.6);
  });
  it('the copula standing alone keeps its readings below the many words spelled 이', () => {
    for (const w of ['이니', '이야', '이셔']) expect(an(w).some((c) => c.lemma === '이다'), w).toBe(true);
  });
});

describe.skipIf(!fs.existsSync(path.join(SHARD_DIR, 'manifest.json')))('fix batch 5: the confidence does not depend on what has loaded', () => {
  const WORDS = ['저는', '와요', '學校에서', '학생이', '먹었습니다', '친구에게', '좋아요', '사람들이', '공부했어요', '읽으셨습니다'];
  const ids: string[] = [];
  let coreOnly: string[] = [];
  beforeAll(async () => {
    const { KO_CORE } = await import('../../../src/adapters/korean/generated/core');
    const { installKoreanLexicon } = await import('../../../src/adapters/korean/index-store');
    uninstallFixtureLexicon();
    installKoreanLexicon(KO_CORE);
    koClearAnalysisCache();
    coreOnly = WORDS.map((w) => { const c = koAnalyzeToken(w)[0]; return `${c.lemma}/${c.pos} ${c.confidence}`; });
    for (const f of fs.readdirSync(SHARD_DIR)) if (f.endsWith('.json.gz')) { const x = JSON.parse(gunzipSync(fs.readFileSync(path.join(SHARD_DIR, f))).toString('utf8')); installKoreanLexicon(x); ids.push(x.id); }
    koClearAnalysisCache();
  });
  afterAll(async () => {
    const { uninstallKoreanLexicon } = await import('../../../src/adapters/korean/index-store');
    uninstallKoreanLexicon('ko-core'); for (const id of new Set(ids)) uninstallKoreanLexicon(id);
    installFixtureLexicon();
  });
  it('first reading, class and confidence identical core-only and with every shard; unseen rivals marked rare at 0.60 or below', () => {
    expect(WORDS.map((w) => { const c = koAnalyzeToken(w)[0]; return `${c.lemma}/${c.pos} ${c.confidence}`; })).toEqual(coreOnly);
    for (const c of koAnalyzeToken('學校에서').slice(1)) if (c.notes?.rare) expect(c.confidence).toBeLessThanOrEqual(0.6);
    expect(koAnalyzeToken('學校에서')[0]).toMatchObject({ lemma: '학교', confidence: 0.92 });
  });
});

/** Run a block of assertions with the compiled core alone, then with the core and every shard installed (what a reader has). */
function underBothStates(title: string, body: () => void): void {
  describe(title, () => {
    const ids: string[] = [];
    beforeAll(async () => {
      const { KO_CORE } = await import('../../../src/adapters/korean/generated/core');
      const { installKoreanLexicon } = await import('../../../src/adapters/korean/index-store');
      uninstallFixtureLexicon();
      installKoreanLexicon(KO_CORE);
      koClearAnalysisCache();
    });
    afterAll(async () => {
      const { uninstallKoreanLexicon } = await import('../../../src/adapters/korean/index-store');
      uninstallKoreanLexicon('ko-core'); for (const id of new Set(ids)) uninstallKoreanLexicon(id);
      installFixtureLexicon();
    });
    it('with the compiled core alone', () => body());
    it.skipIf(!fs.existsSync(path.join(SHARD_DIR, 'manifest.json')))('with the core and every shard', async () => {
      const { installKoreanLexicon } = await import('../../../src/adapters/korean/index-store');
      for (const f of fs.readdirSync(SHARD_DIR)) if (f.endsWith('.json.gz')) { const x = JSON.parse(gunzipSync(fs.readFileSync(path.join(SHARD_DIR, f))).toString('utf8')); installKoreanLexicon(x); ids.push(x.id); }
      koClearAnalysisCache();
      body();
    }, 120000);
  });
}

underBothStates('fix batch 7: names, the honorific copula, greetings, -러, bare -아/어 forms (core; core + shards)', () => {
  // an unlisted name + particle: the unconfirmed whole name, never a listed first syllable or a verb
  for (const w of ['박지성이', '한지민이', '김민수는', '최영희를', '정우성은', '강동원에게']) {
    const c = koAnalyzeToken(w)[0];
    expect(c.unconfirmed, w).toBe(true);
    expect(c.pos, w).not.toBe('VERB');
    expect([...(c.lemma ?? '')].length, w).toBeGreaterThanOrEqual(2);
  }
  // 부여받았다 is not 부여 "Buyeo" + an unexplained rest
  expect(koAnalyzeToken('부여받았다').every((c) => !(c.lemma === '부여' && c.pos === 'PROPN')), '부여받았다').toBe(true);
  // the honorific copula with its 이 dropped is a candidate, and no noun + suffix 시 reading leads
  for (const [w, n] of [['목자시니', '목자'], ['의사시다', '의사']] as const) {
    const cs = koAnalyzeToken(w);
    if (!cs.some((c) => c.lemma?.startsWith(n))) continue; // the noun is not in this lexicon state
    expect(cs.some((c) => (c.parts ?? []).some((p) => p.lemma === '이다') && c.morph.Honorific === 'Subj'), w).toBe(true);
    expect((cs[0].parts ?? []).some((p) => p.text === '시' && p.kind === 'suffix'), w).toBe(false);
  }
  // greetings: the predicate first
  for (const [w, l] of [['감사합니다', '감사하다'], ['안녕하세요', '안녕하다'], ['고맙습니다', '고맙다']] as const) expect(koAnalyzeToken(w)[0].lemma, w).toBe(l);
  // a one-syllable or rare noun never outranks a common verb's bare -아/어 form
  // (서: the counts make the noun 서 at least a quarter as common as 서다, so the noun stays first at token level: fix batch 9)
  for (const [w, l] of [['켜', '켜다'], ['퍼', '푸다'], ['건너', '건너다'], ['밀어', '밀다'], ['자라', '자라다']] as const) if (koAnalyzeToken(w).some((c) => c.lemma === l)) expect(koAnalyzeToken(w)[0].lemma, w).toBe(l);
  // 들러: 들르다 within the first two readings
  expect(koAnalyzeToken('들러').slice(0, 2).some((c) => c.lemma === '들르다')).toBe(true);
  // a final ending takes no case particle
  for (const c of koAnalyzeToken('친구에게만')) expect(String(c.notes?.koPos ?? '')).not.toMatch(/EF+JK/u);
  // creditable readings: never more than six
  for (const w of ['한', '이', '수', '달', '모든', '친구에게만', '눈이', '배를', '저는']) expect(koAnalyzeToken(w).filter((c) => c.confidence >= 0.5 && !c.unconfirmed).length, w).toBeLessThanOrEqual(6);
  // the listed compound verb of the optative
  if (koAnalyzeToken('이루어지다')[0].lemma === '이루어지다') expect(koAnalyzeToken('이루어지이다')[0].lemma).toBe('이루어지다');
});

describe.skipIf(!fs.existsSync(path.join(SHARD_DIR, 'manifest.json')))('fix batch 7: what is creditable, over ordinary sentences (core and shards, through the adapter)', () => {
  const ids: string[] = [];
  beforeAll(async () => {
    const { KO_CORE } = await import('../../../src/adapters/korean/generated/core');
    const { installKoreanLexicon } = await import('../../../src/adapters/korean/index-store');
    uninstallFixtureLexicon();
    installKoreanLexicon(KO_CORE);
    for (const f of fs.readdirSync(SHARD_DIR)) if (f.endsWith('.json.gz')) { const x = JSON.parse(gunzipSync(fs.readFileSync(path.join(SHARD_DIR, f))).toString('utf8')); installKoreanLexicon(x); ids.push(x.id); }
    koClearAnalysisCache();
  });
  afterAll(async () => {
    const { uninstallKoreanLexicon } = await import('../../../src/adapters/korean/index-store');
    uninstallKoreanLexicon('ko-core'); for (const id of new Set(ids)) uninstallKoreanLexicon(id);
    installFixtureLexicon();
  });
  it('no word has more than six creditable readings, and under 25 % of words have more than one (measured 23.2 %)', async () => {
    const { koAdapter } = await import('../../../src/adapters/ko');
    const { KO_VALIDATION } = await import('../../../packages/language-packs/src/packs/ko');
    const reg = fs.readFileSync(path.resolve('test/adapters/korean/regression.test.ts'), 'utf8');
    const sents = new Set<string>([...reg.matchAll(/'([^']*[가-힣][^']*[.?!])'/gu)].map((m) => m[1]));
    for (const v of KO_VALIDATION) if (v.sentence) sents.add(v.sentence);
    let words = 0, multi = 0;
    const over: string[] = [];
    for (const s of sents) for (const a of koAdapter.analyze(koAdapter.tokenize(s))) {
      if (!a.token.isWord || !/[가-힣]/u.test(a.token.surface)) continue;
      words++;
      const n = a.candidates.filter((c) => c.confidence >= 0.5 && !c.unconfirmed).length;
      if (n > 1) multi++;
      if (n > 6) over.push(`${a.token.surface}:${n}`);
    }
    expect(over).toEqual([]);
    expect(words).toBeGreaterThan(80);
    expect(multi / words).toBeLessThan(0.25);
  }, 120000);
});

underBothStates('fix batch 8: a name only where the unspaced reading would make it a verb (core; core + shards)', () => {
  // the whole name, unconfirmed: PROPN with the name note where an unspaced reading would have made it a verb, else the noun-like unknown stem
  for (const w of ['박지성이', '한지민이']) { const c = koAnalyzeToken(w)[0]; expect(c.unconfirmed, w).toBe(true); expect(c.lemma, w).toBe(w.slice(0, 3)); expect(['PROPN', 'NOUN'], w).toContain(c.pos); if (c.pos === 'PROPN') { expect(c.confidence, w).toBeLessThanOrEqual(0.4); expect(String(c.notes?.name)).toMatch(/shaped like a personal name/u); } }
  expect(koAnalyzeToken('김민수는')[0].pos).not.toBe('VERB');
  // unlisted compounds that begin with a surname syllable stay nouns
  for (const w of ['정부안을', '강변공원에', '김장철이', '정치개혁을', '한국학계는', '이사회비를']) { const c = koAnalyzeToken(w)[0]; expect(c.pos, w).toBe('NOUN'); expect(c.notes?.name, w).toBeUndefined(); }
  expect(koAnalyzeToken('주면서부터')[0].lemma).toBe('주다');
});

underBothStates('fix batch 9: bare one-syllable nouns against bare -아/어 forms, by the counts (core; core + shards)', () => {
  const first = (w: string) => koAnalyzeToken(w)[0];
  for (const w of ['배', '차', '파', '해', '비', '새', '재', '뼈', '벼', '떼']) {
    const cs = koAnalyzeToken(w);
    if (!cs.some((c) => c.pos === 'NOUN')) continue; // the noun is not in this lexicon state
    expect(['NOUN', 'DET'], w).toContain(first(w).pos); // 새 "new" (DET) is commoner still: never the verb
  }
  for (const [w, l] of [['꺼', '끄다'], ['켜', '켜다'], ['퍼', '푸다'], ['건너', '건너다'], ['밀어', '밀다'], ['신어', '신다']] as const) {
    if (!koAnalyzeToken(w).some((c) => c.lemma === l)) continue; // the verb is not in this lexicon state
    expect(first(w).lemma, w).toBe(l);
  }
  if (koAnalyzeToken('밤새').some((c) => c.pos === 'NOUN')) expect(first('밤새').pos).not.toBe('VERB');
});
