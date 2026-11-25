// @vitest-environment node
/**
 * The sentence layer (src/adapters/korean/sentence.ts): every rule with a sentence it decides and one it must leave alone; the homonym rules'
 * fingerprints against the REAL lexicon (each must resolve to one entry whose gloss says what the rule means); order = confidence after
 * every reorder. Sentences are my own, ordinary Korean. The blocks that need words outside the compiled core install the built shards
 * (public/lexicon/ko/standard) and are skipped when they are not built.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken } from '../../../src/core';
import { koAdapter } from '../../../src/adapters/ko';
import { installKoreanLexicon, koEntryLemma, koSharedPos, koStemKey, lookupKoreanStem, uninstallKoreanLexicon, type KoLexicon } from '../../../src/adapters/korean/index-store';
import { KO_CORE } from '../../../src/adapters/korean/generated/core';
import { KO_HOMONYM_RULES, koOrderSentences, koStrictlyFalling } from '../../../src/adapters/korean/sentence';
import { koAnalyzeTokens } from '../../../src/adapters/korean/analyze';

const SHARDS = path.resolve(__dirname, '../../../public/lexicon/ko/standard');
const HAVE_SHARDS = fs.existsSync(path.join(SHARDS, 'manifest.json'));
const installShards = (): void => { for (const f of fs.readdirSync(SHARDS)) if (f.endsWith('.json.gz')) installKoreanLexicon(JSON.parse(gunzipSync(fs.readFileSync(path.join(SHARDS, f))).toString('utf8')) as KoLexicon); };

function readIn(sentence: string, surface: string) {
  const tokens = koAdapter.tokenize(sentence);
  const analyses = koAdapter.analyze(tokens);
  const i = analyses.findIndex((a) => a.token.isWord && a.token.surface === surface);
  if (i < 0) throw new Error(`${surface} is not a word of ${sentence}`);
  return { tokens, analyses, i, top: analyses[i].candidates[0] as AnalysisCandidate, all: analyses[i].candidates };
}
const orderProblems = (analyses: AnalyzedToken[]): string[] => {
  const out: string[] = [];
  for (const a of analyses) for (let k = 1; k < a.candidates.length; k++) if (!(a.candidates[k].confidence < a.candidates[k - 1].confidence)) out.push(`${a.token.surface} #${k}`);
  return out;
};
const ctx = (c: AnalysisCandidate): string => String(c.notes?.context ?? '');
const isPredicateTop = (c: AnalysisCandidate): boolean => ['VERB', 'ADJ'].includes(c.pos ?? '');

const CORE_SENTENCES = [
  '먹어 보세요.', '동생이 밥을 먹고 있어요.', '고기를 먹지 않아요.', '이것 좀 해 주세요.', '편지를 써 버렸어요.', '아이를 가게 했어요.',
  '저는 학생이 아닙니다.', '저는 의사가 돼요.', '밥을 먹어요?', '밥을 먹어요.', '안 가요.', '못 가요.', '숙제를 한 학생이 왔어요.', '사과 한 개를 샀어요.',
  '학생 세 명이 왔어요.', '3일에 만나요.', '믿는 자는 복이 있어요.', '자는 아이를 깨우지 마세요.', '하늘을 나는 새를 봤어요.', '감을 먹었어요.',
  '눈이 와요.', '눈을 감았어요.', '눈이 예뻐요.', '말을 했어요.', '말을 탔어요.', '차를 마셔요.', '차를 탔어요.', '저는 학생이에요.', '저 사람은 누구예요?',
  '갈 수 있어요.', '학생 수가 많아요.', '일이 많아요.', '편지를 썼어요.', '모자를 썼어요.', '돈을 썼어요.', '음악을 들어요.', '마음에 들어요.',
  '책이 있어요.', '책이 없어요.', '한국에 온 지 일 년이 됐어요.', '먹은 적이 있어요.',
];

describe('with the compiled core only', () => {
  beforeAll(() => { uninstallKoreanLexicon('kaikki-ko-lexicon'); installKoreanLexicon(KO_CORE); });

  it('keeps order = confidence over every token of every sentence here', () => {
    const bad: string[] = [];
    for (const s of CORE_SENTENCES) bad.push(...orderProblems(koAdapter.analyze(koAdapter.tokenize(s))).map((x) => `${s}: ${x}`));
    expect(bad).toEqual([]);
  });

  it('states the reason of every change of order in notes.context', () => {
    for (const s of CORE_SENTENCES) {
      const tokens = koAdapter.tokenize(s);
      const before = koAdapter.analyze(tokens); // the adapter's output
      const plain = koAnalyzeTokens(tokens).map((a) => a.candidates); // the token analysis alone, no sentence
      before.forEach((a, i) => {
        const c = a.candidates[0];
        if (!c || !plain[i][0]) return;
        const same = plain[i][0].lemma === c.lemma && plain[i][0].pos === c.pos && JSON.stringify(plain[i][0].notes?.koPos) === JSON.stringify(c.notes?.koPos) && plain[i][0].morph.VerbForm === c.morph.VerbForm;
        if (!same) expect(ctx(c), `${s}: ${a.token.surface}`).not.toBe('');
      });
    }
  });

  describe('auxiliary promotion after a connective form', () => {
    for (const [s, conn, aux, lemma] of [
      ['먹어 보세요.', '먹어', '보세요', '보다'], ['동생이 밥을 먹고 있어요.', '먹고', '있어요', '있다'], ['고기를 먹지 않아요.', '먹지', '않아요', '않다'],
      ['이것 좀 해 주세요.', '해', '주세요', '주다'], ['편지를 써 버렸어요.', '써', '버렸어요', '버리다'], ['아이를 가게 했어요.', '가게', '했어요', '하다'],
    ] as const) {
      it(`${conn} ${aux}: ${lemma} is the auxiliary, ${conn} the connective form`, () => {
        const a = readIn(s, aux).top;
        expect(a).toMatchObject({ lemma, pos: 'AUX' });
        expect(ctx(a)).toMatch(/auxiliary/);
        expect(readIn(s, conn).top.morph.VerbForm).toBe('Conn');
      });
    }
    it('보다 stays "to see" with no connective form before it, 있다 stays existential after a noun', () => {
      expect(readIn('영화를 봐요.', '봐요').top.pos).toBe('VERB');
      expect(readIn('책이 있어요.', '있어요').top).toMatchObject({ pos: 'ADJ', morph: { VerbType: 'Exist' } });
      expect(readIn('밥을 먹고 학교에 가요.', '가요').top.pos).toBe('VERB');
    });
  });

  it('marks 이/가 before 아니다 and 되다 as the complement particle (JKC), and only there', () => {
    for (const [s, w] of [['저는 학생이 아닙니다.', '학생이'], ['저는 의사가 돼요.', '의사가']] as const) {
      const t = readIn(s, w).top;
      expect(t.morph).toMatchObject({ Case: 'Nom', Complement: 'Yes' });
      expect(String(t.notes?.koPos)).toMatch(/JKC$/);
      expect(t.parts!.find((p) => p.lemma === '이/가')!.role).toMatch(/complement particle/);
    }
    expect(readIn('학생이 와요.', '학생이').top.morph.Complement).toBeUndefined();
  });

  it('takes the sentence type from a question mark only, as ONE value', () => {
    const q = readIn('밥을 먹어요?', '먹어요').top;
    expect(q.morph.Mood).toBe('Int');
    expect(readIn('밥을 먹어요.', '먹어요').top.morph.Mood).toBeUndefined();
    for (const s of CORE_SENTENCES) for (const a of koAdapter.analyze(koAdapter.tokenize(s))) for (const c of a.candidates) expect(c.morph.Mood ?? '', `${s} ${a.token.surface}`).not.toMatch(/,/);
  });

  describe('bare-token ambiguities (audit N6, N7)', () => {
    it('안 / 못 before a predicate: the negative adverb, the verb marked as negated', () => {
      const n = readIn('안 가요.', '안').top;
      expect(n).toMatchObject({ lemma: '안', pos: 'ADV' });
      expect(String(readIn('안 가요.', '가요').top.notes?.negation)).toMatch(/안/);
      expect(readIn('못 가요.', '못').top).toMatchObject({ lemma: '못', pos: 'ADV' });
      expect(readIn('공부 안 해요.', '안').top.pos).toBe('ADV');
    });
    it('한: "one" before a counter, 하다 + -(으)ㄴ after an object', () => {
      expect(readIn('사과 한 개를 샀어요.', '한').top).toMatchObject({ pos: 'NUM' });
      expect(readIn('숙제를 한 학생이 왔어요.', '한').top).toMatchObject({ lemma: '하다', pos: 'VERB', morph: { VerbForm: 'Adn' } });
    });
    it('자는: the bound noun "one who" after an adnominal, 자다 before a noun', () => {
      const p = readIn('믿는 자는 복이 있어요.', '자는').top;
      expect(p.gloss).toMatch(/person|one who/);
      expect(readIn('자는 아이를 깨우지 마세요.', '자는').top).toMatchObject({ lemma: '자다', morph: { VerbForm: 'Adn' } });
    });
    it('나는: 날다 + -는 after an object; 나 + 는 otherwise', () => {
      expect(readIn('하늘을 나는 새를 봤어요.', '나는').top.lemma).toBe('날다');
      expect(readIn('나는 학생이에요.', '나는').top).toMatchObject({ lemma: '나', pos: 'PRON' });
    });
    it('감을 before a predicate: the noun 감 with 을', () => {
      expect(readIn('감을 먹었어요.', '감을').top).toMatchObject({ pos: 'NOUN', morph: { Case: 'Acc' } });
    });
    it('파래요: the token analysis gives a 파랗다 reading (since the morphology package’s batch 2)', () => {
      expect(readIn('하늘이 파래요.', '파래요').all.some((c) => c.lemma === '파랗다' && c.pos === 'ADJ')).toBe(true);
    });
    // the token analysis ranks a contracted quotation (파다 + -(으)래요) below a plain finite reading of another listed predicate
    it('하늘이 파래요 → 파랗다 first', () => {
      expect(readIn('하늘이 파래요.', '파래요').top).toMatchObject({ lemma: '파랗다', pos: 'ADJ' });
    });
  });

  describe('counters after numerals', () => {
    it('세 명, 두 개: the counter first, the numeral its NUM reading, the kind of numeral named', () => {
      const r = readIn('학생 세 명이 왔어요.', '명이');
      expect(r.top.pos).toBe('CLF');
      const num = readIn('학생 세 명이 왔어요.', '세').top;
      expect(num.pos).toBe('NUM');
      expect(String(num.notes?.numeral)).toMatch(/native Korean/);
      expect(readIn('사과 두 개를 샀어요.', '개를').top.pos).toBe('CLF');
    });
    it('3일: after a number in digits 일 is "day"; 이 개 (this dog) is not read as "two items"', () => {
      expect(readIn('3일에 만나요.', '일에').top.gloss).toMatch(/\bday\b/);
      expect(readIn('이 개는 귀여워요.', '개는').top.pos).not.toBe('CLF');
    });
  });

  it('있다 and 없다 are one word each (VerbType=Exist), the auxiliary only when promoted (decision N14)', () => {
    const v = readIn('책이 없어요.', '없어요').top;
    expect(v).toMatchObject({ lemma: '없다', pos: 'ADJ', morph: { VerbType: 'Exist' } });
    expect(readIn('먹고 있어요.', '있어요').top.pos).toBe('AUX');
  });

  it('the negative copula 아니다 comes before the lexicon’s descriptive-verb row of the same word', () => {
    expect(readIn('학생이 아니에요.', '아니에요').top).toMatchObject({ lemma: '아니다', pos: 'AUX', morph: { VerbType: 'Cop', Polarity: 'Neg' } });
  });
});

describe('homonyms by a cue (balanced sets), core only', () => {
  beforeAll(() => { uninstallKoreanLexicon('kaikki-ko-lexicon'); installKoreanLexicon(KO_CORE); });
  for (const [s, w, gloss] of [
    ['눈이 와요.', '눈이', /snow/], ['눈을 감았어요.', '눈을', /\beye/], ['말을 했어요.', '말을', /speech/], ['말을 탔어요.', '말을', /horse/],
    ['차를 마셔요.', '차를', /tea/], ['차를 탔어요.', '차를', /car/], ['편지를 썼어요.', '썼어요', /write/], ['모자를 썼어요.', '썼어요', /wear/],
    ['돈을 썼어요.', '썼어요', /use|spend/], ['갈 수 있어요.', '수', /possibility|means/], ['학생 수가 많아요.', '수가', /number/],
    ['저는 학생이에요.', '저는', /\bI\b/], ['마음에 들어요.', '들어요', /enter/], ['먹은 적이 있어요.', '적이', /experience|time/],
  ] as const) {
    it(`${s} → ${w} ${gloss}`, () => {
      const t = readIn(s, w).top;
      expect(t.gloss).toMatch(gloss);
      expect(t.notes?.homonym).not.toBe('undecided');
      expect(ctx(t)).not.toBe('');
      // nothing else stays as likely: the undecided reading and the other homonyms were set aside
      const rest = readIn(s, w).all.slice(1);
      expect(rest.every((c) => c.confidence <= t.confidence - 0.15 || c.lemma === t.lemma)).toBe(true);
    });
  }
  it('no cue: the undecided reading stays first (눈이 예뻐요, 배가 커요, 말이 많아요)', () => {
    for (const [s, w] of [['눈이 예뻐요.', '눈이'], ['배가 커요.', '배가']] as const) {
      const t = readIn(s, w).top;
      expect(t.notes?.homonym, s).toBe('undecided');
    }
  });
  it('저 before a noun is the determiner "that"', () => {
    expect(readIn('저 사람은 누구예요?', '저').top.pos).toBe('DET');
  });
});

describe.skipIf(!HAVE_SHARDS)('with every shard installed', () => {
  beforeAll(() => { installKoreanLexicon(KO_CORE); installShards(); });
  afterAll(() => { uninstallKoreanLexicon('kaikki-ko-lexicon'); });

  it('every homonym rule resolves, over the real lexicon, to exactly one entry whose gloss says what the rule means', () => {
    const report: string[] = [];
    for (const r of KO_HOMONYM_RULES) {
      const tag = r.pos === 'VERB' ? 'VV' : r.pos === 'PRON' ? 'NP' : 'NNG';
      const rows = lookupKoreanStem(koStemKey(r.spelling, tag)).map((h) => h.entry).filter((e) => e.lemma === r.spelling && koSharedPos(e) === r.pos);
      const hits = [...new Set(rows.filter((e) => r.meaning.test(e.gloss ?? '')).map((e) => koEntryLemma(e)))];
      if (hits.length !== 1) report.push(`${r.spelling} ${r.says}: ${hits.length} entries (${hits.join(', ')})`);
    }
    expect(report).toEqual([]);
  });

  for (const [s, w, gloss] of [
    ['배가 고파요.', '배가', /belly|stomach/], ['배를 타고 섬에 갔어요.', '배를', /ship|boat/], ['배를 깎아 먹었어요.', '배를', /pear/],
    ['밤이 늦었어요.', '밤이', /night/], ['오늘 밤에 만나요.', '밤에', /night/], ['다리를 건너요.', '다리를', /bridge/], ['다리가 아파요.', '다리가', /leg/],
    ['다리를 다쳤어요.', '다리를', /leg/], ['차를 운전해요.', '차를', /car/], ['눈이 녹았어요.', '눈이', /snow/], ['눈이 아파요.', '눈이', /\beye/],
  ] as const) {
    it(`${s} → ${w} ${gloss}`, () => {
      const t = readIn(s, w).top;
      expect(t.gloss).toMatch(gloss);
      expect(ctx(t)).not.toBe('');
    });
  }
  describe('the audit’s card run (section U, items S1–S6)', () => {
    it('S1: a predicate before an auxiliary, and after an object (자고 있어서, 사고 싶은, 과일을 사고)', () => {
      expect(readIn('아이가 자고 있어서 조용해요.', '자고').top.lemma).toBe('자다');
      expect(readIn('책을 사고 싶은 사람', '사고').top.lemma).toBe('사다');
      expect(readIn('과일을 사고 집에 갔어요.', '사고').top.lemma).toBe('사다');
      expect(readIn('사고가 났어요.', '사고가').top.pos).toBe('NOUN');
    });
    for (const [s, w, lemma] of [
      ['그림을 걸었어요.', '걸었어요', '걸다'], ['길을 걸었어요.', '걸었어요', '걷다'], ['개가 사람을 물었어요.', '물었어요', '물다'],
      ['길을 물었어요.', '물었어요', '묻다'], ['과일을 삽니다.', '삽니다', '사다'], ['서울에 삽니다.', '삽니다', '살다'], ['집을 지어요.', '지어요', '짓다'],
    ] as const) {
      it(`S2: ${s} → ${lemma}`, () => expect(readIn(s, w).top.lemma?.replace(/[⁰¹²³⁴-⁹]+$/u, '')).toBe(lemma));
    }
    it('S3: 네 alone at the head of the sentence is "yes"; 네 + a noun is "your"', () => {
      expect(readIn('네, 알겠습니다.', '네').top.pos).toBe('INTJ');
      expect(readIn('네 책이 어디 있어?', '네').top.pos).toBe('PRON');
    });
    it('S4: 그 / 이 before a noun is the determiner', () => {
      expect(readIn('그 사람이 왔어요.', '그').top.pos).toBe('DET');
      expect(readIn('이 책을 읽었어요.', '이').top.pos).toBe('DET');
    });
    it('S5: -아/어 inside a sentence is the connective form, at the end the 해체 ending', () => {
      expect(readIn('돈이 있어 좋아요.', '있어').top.morph.VerbForm).toBe('Conn');
      expect(readIn('돈이 있어?', '있어').top.morph.VerbForm).toBe('Fin');
    });
    it('S6: -게 before 하다 / 되다 / 만들다 is the connective, not the 하게체 command', () => {
      expect(readIn('아이를 웃게 만들었어요.', '웃게').top.morph).toMatchObject({ VerbForm: 'Conn', Connective: 'adverbial' });
      expect(readIn('서울에 가게 됐어요.', '가게').top.morph).toMatchObject({ VerbForm: 'Conn', Connective: 'adverbial' });
    });
    describe('batch 4 (LL1): 한 after an object, by whether the object has another verb to belong to', () => {
      for (const [s, w] of [
        ['운동장을 한 바퀴 돌았어요.', '바퀴'], ['책을 한 권 샀어요.', '권'], ['사과를 한 개 먹었어요.', '개'], ['전화를 한 번 했어요.', '번'],
        ['물을 한 잔 마셨어요.', '잔'], ['편지를 한 장 썼어요.', '장'],
      ] as const) it(`${s}: 한 is "one"`, () => expect(readIn(s, '한').top.pos, readIn(s, w).top.pos).toBe('NUM'));
      // a counter keeps its particles: 한 before it is still "one" (batch-5 addendum)
      for (const [s, w] of [
        ['책을 한 권도 읽지 않았어요.', '권도'], ['사과를 한 개만 먹었어요.', '개만'], ['학생이 한 명도 없어요.', '명도'], ['물을 한 잔도 안 마셨어요.', '잔도'],
        ['책을 한 권을 샀어요.', '권을'], ['아이가 한 명이 왔어요.', '명이'], ['사과를 한 개씩 나눠 줬어요.', '개씩'], ['돈이 한 장밖에 없어요.', '장밖에'],
        ['고양이를 한 마리만 키워요.', '마리만'], ['전화를 한 번도 안 했어요.', '번도'], ['우유를 한 병씩 마셨어요.', '병씩'],
      ] as const) it(`${s}: 한 is "one" before the counter ${w}`, () => expect(readIn(s, '한').top.pos, readIn(s, w).top.pos).toBe('NUM'));
      for (const s of ['공부를 한 사람이 왔어요.', '일을 한 시간이 길어요.', '숙제를 한 학생이 있어요.', '공부를 한 사람', '요리를 한 사람이 누구예요?', '운동을 한 사람은 피곤해요.']) {
        it(`${s}: 한 is 하다 "that did"`, () => expect(readIn(s, '한').top).toMatchObject({ lemma: '하다', pos: 'VERB', morph: { VerbForm: 'Adn' } }));
      }
    });
    it('batch 4 (HH1): the last word of a sentence with no other predicate is the predicate when it can be one', () => {
      expect(isPredicateTop(readIn('불 켜!', '켜').top)).toBe(true);
      expect(isPredicateTop(readIn('여기 서!', '서').top)).toBe(true);
      expect(readIn('오늘 밤.', '밤').top.pos).toBe('NOUN');
    });
    it('batch 3: 한 before any counter reading is "one" (운동장을 한 바퀴), even after an object', () => {
      expect(readIn('운동장을 한 바퀴 돌았어요.', '한').top.pos).toBe('NUM');
      expect(readIn('운동장을 한 바퀴 돌았어요.', '바퀴').top.pos).toBe('CLF');
      expect(readIn('숙제를 한 학생이 왔어요.', '한').top.lemma).toBe('하다');
    });
    it('batch 3: after an adnominal, the bound noun (죄 지은 자를: "one who", 믿는 이는: "person")', () => {
      const j = readIn('죄 지은 자를 사하여 주소서.', '자를').top;
      expect(j.morph.NounType).toBe('Bound');
      expect(j.gloss).toMatch(/person|one who/);
      expect(readIn('믿는 이는 복이 있어요.', '이는').top.gloss).toMatch(/person/);
      expect(readIn('하얀 이가 보여요.', '이가').top.morph.NounType).not.toBe('Bound');
    });
    it('batch 3: 들러 is 들르다 not before a verb of motion, or after a place; left alone before one with no place', () => {
      expect(readIn('가게에 들러 빵을 샀어요.', '들러').top.lemma).toBe('들르다');
      expect(readIn('집에 들러 갈게요.', '들러').top.lemma).toBe('들르다');
      expect(String(readIn('진지를 들러 오세요.', '들러').top.notes?.context ?? '')).not.toMatch(/들르다/);
    });
    it('batch 3: 참고하고 / 계속하고 with an object before them are the predicates 참고하다 / 계속하다', () => {
      expect(readIn('자료를 참고하고 썼어요.', '참고하고').top).toMatchObject({ lemma: '참고하다', pos: 'VERB' });
      expect(readIn('일을 계속하고 있어요.', '계속하고').top).toMatchObject({ lemma: '계속하다', pos: 'VERB' });
    });
    it('S8: no raised homonym number in any reason a person reads', () => {
      for (const s of [...CORE_SENTENCES, '배가 고파요.', '다리를 건너요.']) for (const a of koAdapter.analyze(koAdapter.tokenize(s))) for (const c of a.candidates) expect(ctx(c), s).not.toMatch(/[⁰¹²³⁴-⁹]/u);
    });
  });

  it('order = confidence with the shards too', () => {
    const bad: string[] = [];
    for (const s of CORE_SENTENCES) bad.push(...orderProblems(koAdapter.analyze(koAdapter.tokenize(s))).map((x) => `${s}: ${x}`));
    expect(bad).toEqual([]);
  });
});

/** Batch 6 (audit WW), with the core only and with every shard. */
for (const state of ['core', 'shards'] as const) {
  describe.skipIf(state === 'shards' && !HAVE_SHARDS)(`batch 6 (audit WW), ${state}`, () => {
    beforeAll(() => { uninstallKoreanLexicon('kaikki-ko-lexicon'); installKoreanLexicon(KO_CORE); if (state === 'shards') installShards(); });
    afterAll(() => { uninstallKoreanLexicon('kaikki-ko-lexicon'); });
    const isPred = (c: AnalysisCandidate) => ['VERB', 'ADJ', 'AUX'].includes(c.pos ?? '');
    it('WW1: a modifier before the last word forbids the predicate reading', () => {
      for (const [s, w] of [['우리 나라.', '나라'], ['한국의 배.', '배'], ['온 배.', '배'], ['그 배.', '배'], ['높은 산.', '산'], ['새 차.', '차'], ['모든 사람.', '사람']] as const) expect(isPred(readIn(s, w).top), s).toBe(false);
    });
    it('WW1: the cues that stay (an object, a place, an adverb, a connective form, "!")', () => {
      // 켜다 is not in the compiled core (the core-only state reads 켜 as an unknown word): 불 켜! is checked with the shards only
      for (const [s, w] of [...(state === 'shards' ? [['불 켜!', '켜']] as const : []), ['여기 서!', '서'], ['밥 먹고 자!', '자'], ['문을 닫아.', '닫아'], ['빨리 와.', '와'], ['집에 가.', '가']] as const) expect(isPred(readIn(s, w).top), s).toBe(true);
    });
    it('WW2: bare one-syllable nouns in a noun slot stay nouns, in a verb slot verbs (24 sentences)', () => {
      const cases: Array<[string, string, boolean]> = [
        ['배 아파요.', '배', false], ['배 타고 갔어요.', '배', false], ['사과와 배를 샀어요.', '배를', false], ['차 한 잔 주세요.', '차', false], ['파 두 단 샀어요.', '파', false], ['배 고파요.', '배', false],
        ['차 마실래요?', '차', false], ['파 좀 사 와.', '파', false], ['배와 사과', '배와', false], ['서 있어요.', '서', true], ['일어서 봐요.', '일어서', true], ['땅을 파 봐요.', '파', true],
        ['줄을 서 주세요.', '서', true], ['공을 차 봐요.', '차', true], ['여기 서 봐.', '서', true], ['깊이 파.', '파', true], ['문 앞에 서!', '서', true], ['공 차!', '차', true],
        ['한국의 차', '차', false], ['내 배', '배', false], ['새 파', '파', false], ['그 차를 탔어요.', '차를', false], ['배가 커요.', '배가', false], ['차가 와요.', '차가', false],
      ];
      const wrong = cases.filter(([s, w, pred]) => isPred(readIn(s, w).top) !== pred).map(([s, w, pred]) => `${s} ${w}: wanted ${pred ? 'predicate' : 'noun'}`);
      console.log(`WW2 bare one-syllable words (${state}): ${cases.length - wrong.length} of ${cases.length} right${wrong.length ? `; wrong: ${wrong.join('; ')}` : ''}`);
      expect(wrong.length).toBeLessThanOrEqual(3);
    });
    it('WW3: 한 before a counter the gloss calls one (노래를 한 곡, 시를 한 편 …) is "one"', () => {
      for (const s of ['시를 한 편 썼어요.', '전화를 한 통 했어요.', '옷을 한 벌 샀어요.', '집을 한 채 지었어요.', '나무를 한 그루 심었어요.', '꽃을 한 송이 샀어요.', ...(state === 'shards' ? ['신발을 한 켤레 샀어요.'] : [])]) expect(readIn(s, '한').top.pos, s).toBe('NUM');
    });
    // WAITING on the lexicon: 곡 "piece (of music), counter for songs" (曲) has no row; the lexicon holds only 곡 "valley", so nothing says it counts
    it.fails('WW3: 노래를 한 곡 불렀어요 → 한 "one" (fails: the lexicon lacks the counter 곡)', () => {
      expect(readIn('노래를 한 곡 불렀어요.', '한').top.pos).toBe('NUM');
    });
    describe('YY (addendum): noun + particle stays; numerals before counters', () => {
      for (const [s, w, lemma] of [
        ['물을 마셔요.', '물을', '물'], ['남자는 커요.', '남자는', '남자'], ['차는 비싸요.', '차는', '차'], ['신을 신어요.', '신을', '신'], ['약을 먹었어요.', '약을', '약'],
        ['생일 선물을 샀어요.', '생일', '생일'], ['생일 축하해요.', '생일', '생일'],
      ] as const) {
        // the SENTENCE layer never puts a predicate or a copula reading above the noun the token layer offers; which is first at token
        // level is the morphology package's (it is making noun + particle first: until then the token order shows through unchanged)
        it(`${s}: the sentence layer does not promote a predicate over the noun ${lemma}`, () => {
          const r = readIn(s, w);
          const tokenTop = koAnalyzeTokens(r.tokens)[r.i].candidates[0];
          const noun = (c: AnalysisCandidate) => c.pos === 'NOUN' && (c.lemma ?? '').replace(/[⁰¹²³⁴-⁹]+$/u, '') === lemma && !c.morph.VerbType;
          if (noun(tokenTop)) expect(noun(r.top), `${s}: ${r.top.lemma} ${r.top.pos}`).toBe(true);
          else expect(`${r.top.lemma}|${r.top.pos}`).toBe(`${tokenTop.lemma}|${tokenTop.pos}`);
          expect(String(r.top.notes?.context ?? '')).toBe(String(tokenTop.notes?.context ?? ''));
        });
      }
      for (const [s, w, gloss] of [
        ['네 명이 왔어요.', '네', /four/], ['네 시예요.', '네', /four/], ['네 개 주세요.', '네', /four/], ['네 살이에요.', '네', /four/],
        ['세 명이 왔어요.', '세', /three/], ['두 개 주세요.', '두', /two/], ['열 명이 왔어요.', '열', /ten/], ['이 층에 있어요.', '이', /two/],
      ] as const) it(`${s}: ${w} is the numeral`, () => { const t = readIn(s, w).top; expect(['NUM', 'DET']).toContain(t.pos); expect(t.gloss ?? '').toMatch(gloss); });
      it('네 이름, 네 거야 stay "your"; 이 사람 stays the determiner "this"; 이 개는 is "this dog"', () => {
        expect(readIn('네 이름이 뭐야?', '네').top.pos).toBe('PRON');
        expect(readIn('이건 네 거야.', '네').top.pos).toBe('PRON');
        expect(readIn('이 사람이 왔어요.', '이').top.pos).toBe('DET');
        expect(readIn('이 개는 귀여워요.', '개는').top.pos).not.toBe('CLF');
      });
    });
    describe('XX1: fused forms against their look-alikes', () => {
      const fused = (c: AnalysisCandidate, pron: string, particle: string) => c.pos === 'PRON' && (c.lemma ?? '').replace(/[⁰¹²³⁴-⁹]+$/u, '') === pron && (c.morph.Particle ?? '').split('+').pop() === particle;
      const bound내 = (c: AnalysisCandidate) => c.morph.NounType === 'Bound' && /inside|within/u.test(c.gloss ?? '');
      for (const s of ['내 친구가 왔어요.', '이것은 내 가방이다.', '내 이름은 민수야.', '이것은 내 책이에요.', '이건 내 거야.', '내 동생은 학생이야.', '그건 내 잘못이야.', '내 생각은 달라요.']) {
        it(`${s}: 내 is 나 + 의 "my"`, () => expect(fused(readIn(s, '내').top, '나', 'of'), JSON.stringify(readIn(s, '내').top.lemma)).toBe(true));
      }
      for (const s of ['기간 내 신청하세요.', '건물 내 금연', '3일 내 답장 주세요.', '예산 내 지출', '학교 내 시설', '한 시간 내 도착해요.']) {
        it(`${s}: 내 is "within"`, () => expect(bound내(readIn(s, '내').top)).toBe(true));
      }
      for (const s of ['전 괜찮아요.', '전 학생이에요.', '전 그렇게 생각해요.', '전 밥을 먹었어요.', '전 아직 몰라요.', '전 정말 좋아요.']) {
        it(`${s}: 전 is 저 + 는`, () => expect(fused(readIn(s, '전').top, '저', 'topic')).toBe(true));
      }
      for (const s of ['십 년 전 일이에요.', '조금 전 왔어요.', '얼마 전 만났어요.', ...(state === 'shards' ? ['사흘 전 소식이에요.'] : []), '오래 전 이야기예요.', '식사 전 손을 씻어요.']) {
        it(`${s}: 전 is "before, ago"`, () => expect(readIn(s, '전').top.gloss ?? '').toMatch(/before|ago/));
      }
      for (const s of ['전 세계가 알아요.', '전 국민이 투표했어요.', ...(state === 'shards' ? ['전 직원이 모였어요.'] : []), '전 대통령이 왔어요.', '인쇄술은 전 유럽으로 퍼졌다.', '전 지역에 비가 와요.']) {
        it(`${s}: 전 is the determiner`, () => expect(readIn(s, '전').top.pos).toBe('DET'));
      }
      for (const s of ['네 명이 왔어요.', '네 시에 만나요.', '사과 네 개를 샀어요.', '고양이 네 마리가 있어요.', '책 네 권을 샀어요.', '커피 네 잔을 마셨어요.']) {
        it(`${s}: 네 is "four"`, () => expect(readIn(s, '네').top.gloss ?? '').toMatch(/four/));
      }
      for (const s of ['네 책이 어디 있어?', '네 이름이 뭐야?', '네 친구가 왔어.', '네 가방은 커.', '네 생각은 어때?', '네 말이 맞아.']) {
        it(`${s}: 네 is "your"`, () => expect(fused(readIn(s, '네').top, '너', 'of')).toBe(true));
      }
      for (const s of ['그 날 비가 왔어요.', '좋은 날 만나요.', '어느 날 친구가 왔어요.', '이 날 처음 봤어요.', '다른 날 와요.', '첫 날 늦었어요.']) {
        it(`${s}: 날 is "day"`, () => expect(readIn(s, '날').top.pos).toBe('NOUN'));
      }
      for (const s of ['날 사랑해요?', '날 봐.', '날 도와줘.', '날 기다려.', '날 믿어요.', '날 잊지 마.']) {
        it(`${s}: 날 is 나 + 를`, () => expect(fused(readIn(s, '날').top, '나', 'object')).toBe(true));
      }
      it('난 / 넌 at the head of a clause are 나 + 는 / 너 + 는 (token order); 제 before a number is left alone', () => {
        expect(fused(readIn('난 학생이야.', '난').top, '나', 'topic')).toBe(true);
        expect(fused(readIn('넌 누구야?', '넌').top, '너', 'topic')).toBe(true);
        expect(String(readIn('제 1 장', '제').top.notes?.context ?? '')).not.toMatch(/저 \+ 의|I \(polite\)/);
      });
    });
    it('WW4: 이 / 그 / 저 before an adnominal and its noun is the determiner', () => {
      for (const [s, w] of [['저 높은 산을 봐요.', '저'], ['그 작은 집에 살아요.', '그'], ['이 예쁜 꽃을 샀어요.', '이'], ['저 큰 나무가 있어요.', '저'], ['그 좋은 책을 읽었어요.', '그'], ['이 맛있는 음식을 먹어요.', '이']] as const) {
        expect(readIn(s, w).top.pos, s).toBe('DET');
      }
      expect(readIn('저는 학생이에요.', '저는').top.pos).toBe('PRON');
    });
  });
}

describe('the confidence helpers', () => {
  it('koStrictlyFalling only lowers, and leaves a strictly falling list', () => {
    const cs = [0.8, 0.8, 0.9, 0.2].map((confidence) => ({ morph: {}, confidence }));
    koStrictlyFalling(cs);
    expect(cs.map((c) => c.confidence)).toEqual([0.8, 0.79, 0.78, 0.2]);
  });
  it('a list that is not the adapter’s own (refine) is reordered and lowered, never raised or marked', () => {
    const tokens = koAdapter.tokenize('저는 학생이 아닙니다.');
    const base = koAnalyzeTokens(tokens).map((a) => a.candidates);
    const out = koOrderSentences(tokens, base, new Set([1, 2]));
    expect(out[1][0].morph.Complement).toBeUndefined();
    for (const k of [1, 2]) {
      const before = new Map(base[k].map((c) => [`${c.lemma}|${c.pos}|${String(c.notes?.koPos)}|${JSON.stringify(c.morph)}`, c.confidence]));
      for (const c of out[k]) expect(c.confidence).toBeLessThanOrEqual(before.get(`${c.lemma}|${c.pos}|${String(c.notes?.koPos)}|${JSON.stringify(c.morph)}`) ?? 0);
    }
    // the adapter's own tokens are marked as usual
    expect(koOrderSentences(tokens, base)[1][0].morph.Complement).toBe('Yes');
  });
});
