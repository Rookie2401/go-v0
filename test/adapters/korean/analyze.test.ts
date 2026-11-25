// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate } from '../../../src/core';
import { koAnalyzeToken, koAnalyzeTokens, koMoodFromPunctuation } from '../../../src/adapters/korean/analyze';
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
    const r = first('이르시되'); expect(r.morph.SpeechLevel).toBe('Lit'); expect(r.notes?.ending).toBe('-(으)되'); expect((r.lemma ?? '').startsWith('이르다')).toBe(true);
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
  it('누이시며 (누이다 not in the lexicon): no confident reading', () => expect(first('누이시며').confidence).toBeLessThanOrEqual(0.45));
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
