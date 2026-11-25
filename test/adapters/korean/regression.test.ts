// @vitest-environment node
/**
 * The owner's linguistic regression table (brief XXI), EVERY row in the table's order, each named by the row's own wording, read through
 * the real adapter (`koAdapter`: tokenise, token analysis, sentence layer, constructions) with the compiled core only, as a host with no
 * assets reads. Ambiguous forms are read inside an ordinary sentence of my own writing. Then the brief's list of further areas: those this
 * package can test are tested; the ones that belong to other packages (synchronisation, FSRS, offline storage) are `it.todo` with the reason.
 * A row the pack cannot yet satisfy would be `it.fails` / `it.todo` with its reason, never dropped or weakened.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate } from '../../../src/core';
import { koAdapter } from '../../../src/adapters/ko';
import { installKoreanLexicon, uninstallKoreanLexicon } from '../../../src/adapters/korean/index-store';
import { KO_CORE } from '../../../src/adapters/korean/generated/core';

beforeAll(() => { uninstallKoreanLexicon('kaikki-ko-lexicon'); installKoreanLexicon(KO_CORE); });

function readIn(sentence: string, surface: string) {
  const tokens = koAdapter.tokenize(sentence);
  const analyses = koAdapter.analyze(tokens);
  const i = analyses.findIndex((a) => a.token.isWord && a.token.surface === surface);
  if (i < 0) throw new Error(`${surface} is not a word of ${sentence}`);
  return { tokens, analyses, i, top: analyses[i].candidates[0] as AnalysisCandidate };
}
const lemmas = (c: AnalysisCandidate): string[] => (c.parts ?? []).map((p) => p.lemma ?? p.text);
const patternsOf = (sentence: string) => { const t = koAdapter.tokenize(sentence); return koAdapter.detectPatterns(t, koAdapter.analyze(t)).map((p) => p.key); };

describe('brief XXI: the regression table', () => {
  it('학생은 | 학생 + topic particle', () => {
    const { top } = readIn('학생은 책을 읽어요.', '학생은');
    expect(top).toMatchObject({ lemma: '학생', pos: 'NOUN' });
    expect(top.morph).toMatchObject({ Topic: 'Yes', Particle: 'topic' });
    expect(lemmas(top)).toEqual(['학생', '은/는']);
    expect(top.parts![1].role).toMatch(/topic particle/);
  });

  it('학생들이 | 학생 + plural marker + subject particle', () => {
    const { top } = readIn('학생들이 학교에서 공부했습니다.', '학생들이');
    expect(top).toMatchObject({ lemma: '학생', pos: 'NOUN' });
    expect(top.morph).toMatchObject({ Number: 'Plur', Case: 'Nom', Particle: 'plural+subject' });
    expect(lemmas(top)).toEqual(['학생', '들', '이/가']);
  });

  it('학교에서 | 학교 + action-location particle', () => {
    const { top } = readIn('학생들이 학교에서 공부했습니다.', '학교에서');
    expect(top).toMatchObject({ lemma: '학교', pos: 'NOUN' });
    expect(top.morph).toMatchObject({ Case: 'Loc', Particle: 'at' });
    expect(lemmas(top)).toEqual(['학교', '에서']);
    expect(top.parts![1].role).toMatch(/where something happens/);
  });

  it('친구에게만 | 친구 + recipient particle + restriction particle', () => {
    const { top } = readIn('학교에서 친구에게만 말했어요.', '친구에게만');
    expect(top).toMatchObject({ lemma: '친구', pos: 'NOUN' });
    expect(top.morph).toMatchObject({ Case: 'Dat', Focus: 'Only', Particle: 'to-person+only' });
    expect(lemmas(top)).toEqual(['친구', '에게', '만']);
  });

  it('먹었습니다 | 먹다 + past + formal polite', () => {
    const { top } = readIn('저는 밥을 먹었습니다.', '먹었습니다');
    expect(top).toMatchObject({ lemma: '먹다', pos: 'VERB' });
    expect(top.morph).toMatchObject({ Tense: 'Past', SpeechLevel: 'Hasipsio', Mood: 'Ind', VerbForm: 'Fin' });
    expect(lemmas(top)).toEqual(['먹다', '-았/었-', '-ㅂ니다/-습니다']);
  });

  it('읽으셨습니다 | 읽다 + honorific + past + formal polite', () => {
    const { top } = readIn('선생님이 책을 읽으셨습니다.', '읽으셨습니다');
    expect(top).toMatchObject({ lemma: '읽다', pos: 'VERB' });
    expect(top.morph).toMatchObject({ Honorific: 'Subj', Tense: 'Past', SpeechLevel: 'Hasipsio', Mood: 'Ind' });
    expect(lemmas(top)).toEqual(['읽다', '-(으)시-', '-았/었-', '-ㅂ니다/-습니다']);
    // the subject honorific and the speech level are two features, never one
    expect(top.morph.Honorific).not.toBe(top.morph.SpeechLevel);
  });

  it('들어요 | 듣다 in an appropriate listening context', () => {
    const { top } = readIn('저는 음악을 들어요.', '들어요');
    expect(top).toMatchObject({ lemma: '듣다', pos: 'VERB' });
    expect(top.morph).toMatchObject({ Irregular: 'D', SpeechLevel: 'Haeyo' });
    expect(String(top.notes?.context)).toMatch(/음악을/);
    // without a listening cue the look-alike 들다 is not set aside
    const bare = readIn('가방을 들어요.', '들어요').top;
    expect(bare.lemma).not.toBe('듣다');
  });

  it('추워요 | 춥다', () => {
    const { top } = readIn('날씨가 추워요.', '추워요');
    expect(top).toMatchObject({ lemma: '춥다', pos: 'ADJ' });
    expect(top.morph).toMatchObject({ VerbType: 'Descriptive', Irregular: 'B', SpeechLevel: 'Haeyo' });
  });

  it('몰라요 | 모르다', () => {
    const { top } = readIn('저는 길을 몰라요.', '몰라요');
    expect(top).toMatchObject({ lemma: '모르다', pos: 'VERB' });
    expect(top.morph).toMatchObject({ Irregular: 'Reu' });
  });

  it('하얘요 | 하얗다', () => {
    const { top } = readIn('옷이 하얘요.', '하얘요');
    expect(top).toMatchObject({ lemma: '하얗다', pos: 'ADJ' });
    expect(top.morph).toMatchObject({ Irregular: 'H', VerbType: 'Descriptive' });
  });

  it('돼요 | 되다', () => {
    const { top } = readIn('저는 의사가 돼요.', '돼요');
    expect(top).toMatchObject({ lemma: '되다', pos: 'VERB' });
    expect(top.morph).toMatchObject({ Contracted: 'Yes', SpeechLevel: 'Haeyo' });
  });

  it('좋습니다 | 좋다 + formal polite', () => {
    const { top } = readIn('이 책은 좋습니다.', '좋습니다');
    expect(top).toMatchObject({ lemma: '좋다', pos: 'ADJ' });
    expect(top.morph).toMatchObject({ SpeechLevel: 'Hasipsio', VerbType: 'Descriptive', Mood: 'Ind' });
    expect(top.morph.Irregular).toBeUndefined(); // 좋다 is regular (좋아요), whatever its final ㅎ suggests
  });

  it('공부했어요 | 공부하다 + past + informal polite', () => {
    const { top } = readIn('어제 공부했어요.', '공부했어요');
    expect(top).toMatchObject({ lemma: '공부하다', pos: 'VERB' });
    expect(top.morph).toMatchObject({ Tense: 'Past', SpeechLevel: 'Haeyo' });
    expect(lemmas(top).slice(0, 2)).toEqual(['공부', '하다']);
  });

  it('먹고 싶어요 | 먹다 + desire construction', () => {
    const s = '밥을 먹고 싶어요.';
    expect(readIn(s, '먹고').top).toMatchObject({ lemma: '먹다', pos: 'VERB', morph: { VerbForm: 'Conn', Connective: 'and' } });
    expect(readIn(s, '싶어요').top).toMatchObject({ lemma: '싶다', pos: 'AUX' });
    expect(patternsOf(s)).toContain('ko-want');
  });

  it('먹고 있어요 | 먹다 + progressive construction', () => {
    const s = '동생이 밥을 먹고 있어요.';
    expect(readIn(s, '먹고').top).toMatchObject({ lemma: '먹다', pos: 'VERB', morph: { VerbForm: 'Conn' } });
    const aux = readIn(s, '있어요').top;
    expect(aux).toMatchObject({ lemma: '있다', pos: 'AUX' });
    expect(String(aux.notes?.context)).toMatch(/auxiliary/);
    expect(patternsOf(s)).toContain('ko-progressive');
  });

  it('갈 수 있어요 | 가다 + ability or possibility', () => {
    const s = '내일 갈 수 있어요.';
    expect(readIn(s, '갈').top).toMatchObject({ lemma: '가다', pos: 'VERB', morph: { VerbForm: 'Adn', Aspect: 'Prosp' } });
    expect(readIn(s, '수').top.gloss).toMatch(/possibility|means/);
    expect(patternsOf(s)).toContain('ko-can');
  });

  it('가지 않았어요 | 가다 + negative construction + past', () => {
    const s = '어제 학교에 가지 않았어요.';
    expect(readIn(s, '가지').top).toMatchObject({ lemma: '가다', pos: 'VERB', morph: { VerbForm: 'Conn', Connective: 'neg' } });
    const neg = readIn(s, '않았어요').top;
    expect(neg).toMatchObject({ lemma: '않다', pos: 'AUX', morph: { Tense: 'Past' } });
    expect(String(neg.notes?.negation)).toMatch(/-지 않다/);
    expect(patternsOf(s)).toContain('ko-neg-long');
  });

  it('학생입니다 | 학생 + affirmative copula + formal polite', () => {
    const { top } = readIn('저는 학생입니다.', '학생입니다');
    expect(top).toMatchObject({ lemma: '학생', pos: 'NOUN' });
    expect(top.morph).toMatchObject({ VerbType: 'Cop', Polarity: 'Pos', SpeechLevel: 'Hasipsio' });
    expect(lemmas(top)).toEqual(['학생', '이다', '-ㅂ니다/-습니다']);
  });

  it('학생이 아닙니다 | 학생 + complement particle + negative copula', () => {
    const s = '저는 학생이 아닙니다.';
    const n = readIn(s, '학생이').top;
    expect(n).toMatchObject({ lemma: '학생', pos: 'NOUN', morph: { Case: 'Nom', Complement: 'Yes' } });
    expect(String(n.notes?.koPos)).toBe('NNG+JKC');
    expect(n.parts![1].role).toMatch(/complement particle/);
    const v = readIn(s, '아닙니다').top;
    expect(v).toMatchObject({ lemma: '아니다', pos: 'AUX', morph: { VerbType: 'Cop', Polarity: 'Neg', SpeechLevel: 'Hasipsio' } });
    expect(patternsOf(s)).toContain('ko-neg-copula');
  });

  it('책이 있어요 | 책 + existential predicate', () => {
    const s = '방에 책이 있어요.';
    expect(readIn(s, '책이').top).toMatchObject({ lemma: '책', pos: 'NOUN', morph: { Case: 'Nom' } });
    const v = readIn(s, '있어요').top;
    expect(v).toMatchObject({ lemma: '있다', pos: 'ADJ', morph: { VerbType: 'Exist' } });
    expect(patternsOf(s)).toContain('ko-exist');
    expect(patternsOf(s)).not.toContain('ko-progressive');
  });
});

describe('brief XXI: the further areas', () => {
  it('homonyms: a cue decides (눈이 와요: snow), no cue leaves the reading undecided (눈이 예뻐요)', () => {
    expect(readIn('눈이 와요.', '눈이').top.gloss).toMatch(/snow/);
    const u = readIn('눈이 예뻐요.', '눈이').top;
    expect(u.lemma).toBe('눈');
    expect(u.notes?.homonym).toBe('undecided');
  });
  it('irregular against regular conjugation: 닫아요 잡아요 웃어요 좋아요 are regular', () => {
    for (const [w, l] of [['닫아요', '닫다'], ['잡아요', '잡다'], ['웃어요', '웃다'], ['좋아요', '좋다']] as const) {
      const t = readIn(`${w}.`, w).top;
      expect(t.lemma, w).toBe(l);
      expect(t.morph.Irregular, w).toBeUndefined();
    }
  });
  it('stacked particles: 학교에서도 친구에게만 집에서부터 여기까지는', () => {
    expect(readIn('학교에서도 공부해요.', '학교에서도').top.morph.Particle).toBe('at+also');
    expect(readIn('집에서부터 걸었어요.', '집에서부터').top.lemma).toBe('집');
    expect(readIn('여기까지는 괜찮아요.', '여기까지는').top.morph.Particle).toBe('until+topic');
  });
  it('unspecified against overtly marked number: 학생이 has no Number at all, 학생들이 Number=Plur', () => {
    expect(readIn('학생이 와요.', '학생이').top.morph.Number).toBeUndefined();
    expect(readIn('학생들이 와요.', '학생들이').top.morph.Number).toBe('Plur');
  });
  it('mixed Hanja and Hangul: 學校에서 reaches 학교 through the dictionary’s Hanja, the text kept', () => {
    const { top, tokens, i } = readIn('學校에서 공부해요.', '學校에서');
    expect(top.lemma).toBe('학교');
    expect(tokens[i].surface).toBe('學校에서');
  });
  it('canonically decomposed Unicode reads as the composed text, with offsets into the decomposed one', () => {
    const nfd = '학생들이 공부했어요.'.normalize('NFD');
    const tokens = koAdapter.tokenize(nfd);
    const an = koAdapter.analyze(tokens);
    expect(an[0].candidates[0].lemma).toBe('학생');
    expect(nfd.slice(tokens[0].start, tokens[0].end)).toBe(tokens[0].surface);
  });
  it('contractions: 봐요 줘요 돼요 해요 마셔요 have the lemma of the full form', () => {
    for (const [w, l] of [['봐요', '보다'], ['줘요', '주다'], ['돼요', '되다'], ['해요', '하다'], ['마셔요', '마시다']] as const) expect(readIn(`물을 ${w}.`, w).top.lemma, w).toBe(l);
  });
  it('fused syllable boundaries: 갔 is 가 + 았, both parts over the one syllable, marked Fused', () => {
    const t = readIn('학교에 갔어요.', '갔어요').top;
    expect(t.parts![0]).toMatchObject({ start: 0, end: 1 });
    expect(t.parts![1]).toMatchObject({ start: 0, end: 1, morph: { Fused: 'Yes' } });
  });
  it('nonstandard spacing: 먹을수있어요 still reads 먹다 and the construction', () => {
    const t = readIn('먹을수있어요.', '먹을수있어요').top;
    expect(t.lemma).toBe('먹다');
    expect(t.confidence).toBeLessThanOrEqual(0.6);
  });
  it('punctuation: a question mark makes an open 해요체 form a question; a full stop decides nothing', () => {
    expect(readIn('밥을 먹어요?', '먹어요').top.morph.Mood).toBe('Int');
    expect(readIn('밥을 먹어요.', '먹어요').top.morph.Mood).toBeUndefined();
  });
  it('unknown vocabulary is unconfirmed, explains its particle, and is not a predicate', () => {
    const t = readIn('뷁뷁이 왔어요.', '뷁뷁이').top;
    expect(t.unconfirmed).toBe(true);
    expect(['VERB', 'ADJ', 'AUX']).not.toContain(t.pos);
  });
  it('proper nouns: 서울에서 is the name 서울 (PROPN)', () => {
    expect(readIn('서울에서 왔어요.', '서울에서').top).toMatchObject({ lemma: '서울', pos: 'PROPN' });
  });
  it('literary and biblical expressions are named literary, never given a conversational reading', () => {
    const t = readIn('하나님이 세상을 사랑하시니라.', '사랑하시니라').top;
    expect(t.lemma).toBe('사랑하다');
    expect(t.morph.SpeechLevel).toBe('Lit');
  });
  it('dynamic webpage content: the same text analysed twice gives the same readings', () => {
    const s = '학생들이 학교에서 공부했습니다.';
    const a = koAdapter.analyze(koAdapter.tokenize(s));
    const b = koAdapter.analyze(koAdapter.tokenize(s));
    expect(b).toEqual(a);
  });
  it('DOM offset integrity: every token slices the text it came from', () => {
    const s = '  KBS가 2024년에는 學校에서​공부했어요?  ';
    for (const t of koAdapter.tokenize(s)) expect(s.slice(t.start, t.end)).toBe(t.surface);
  });
  it.todo('account synchronisation: the Repository and service packages own it (test/repository-*, packages/repository-*), not the analyser');
  it.todo('offline operation: the extension host and its asset cache own it; the analyser itself needs no network (the compiled core is installed on import)');
  it.todo('FSRS scheduling: GoReview owns it (packages/goreview); the analyser only gives the lemma and grammar unit ids it schedules');
});
