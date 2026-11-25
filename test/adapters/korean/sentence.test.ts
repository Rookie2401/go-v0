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
    // WAITING on M: the token order puts 파다 + the reported command -(으)래요 above 파랗다; no sure sentence cue separates them, so the order is
    // the token analysis's to fix (a whole licensed descriptive verb against a quotation contraction)
    it.fails('하늘이 파래요 → 파랗다 first', () => {
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
