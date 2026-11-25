// @vitest-environment node
/**
 * Grammar constructions (src/adapters/korean/constructions.ts) over the analysed readings: every id PLAN lists, each with a sentence of my
 * own in which it is found (with the tokens it joins), the ordinary-verb sentences in which the auxiliary patterns must NOT be found, the
 * fixed phrases (phrases.ts), and the ids against the pack's grammar copy. Words outside the compiled core need the built shards.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { koAdapter } from '../../../src/adapters/ko';
import { installKoreanLexicon, uninstallKoreanLexicon, type KoLexicon } from '../../../src/adapters/korean/index-store';
import { KO_CORE } from '../../../src/adapters/korean/generated/core';
import { KO_CONSTRUCTIONS, koDetectConstructions } from '../../../src/adapters/korean/constructions';
import { KO_GRAMMAR_CONSTRUCTIONS } from '../../../packages/language-packs/src/packs/ko-grammar';

const SHARDS = path.resolve(__dirname, '../../../public/lexicon/ko/standard');
const HAVE_SHARDS = fs.existsSync(path.join(SHARDS, 'manifest.json'));

const run = (s: string) => { const t = koAdapter.tokenize(s); const a = koAdapter.analyze(t); return { t, a, hits: koDetectConstructions(t, a), patterns: koAdapter.detectPatterns(t, a), phrases: koAdapter.detectPhrases(t, a) }; };
const words = (s: string, idx: number[]) => { const t = koAdapter.tokenize(s); return idx.map((i) => t[i].surface); };

/** [id, sentence, the words the occurrence spans]. */
const CASES: Array<[string, string, string[]]> = [
  ['ko-progressive', '동생이 밥을 먹고 있어요.', ['먹고', '있어요']],
  ['ko-resultative', '의자에 앉아 있어요.', ['앉아', '있어요']],
  ['ko-want', '밥을 먹고 싶어요.', ['먹고', '싶어요']],
  ['ko-must', '내일 가야 해요.', ['가야', '해요']],
  ['ko-can', '내일 갈 수 있어요.', ['갈', '수', '있어요']],
  ['ko-cannot', '오늘은 갈 수 없어요.', ['갈', '수', '없어요']],
  ['ko-neg-long', '어제 가지 않았어요.', ['가지', '않았어요']],
  ['ko-neg-unable', '어제 가지 못했어요.', ['가지', '못했어요']],
  ['ko-try', '이것을 먹어 보세요.', ['먹어', '보세요']],
  ['ko-completive', '편지를 써 버렸어요.', ['써', '버렸어요']],
  ['ko-benefactive', '책을 읽어 주세요.', ['읽어', '주세요']],
  ['ko-become', '서울에 가게 됐어요.', ['가게', '됐어요']],
  ['ko-decide', '내일 가기로 했어요.', ['가기로', '했어요']],
  ['ko-experience', '김치를 먹은 적이 있어요.', ['먹은', '적이', '있어요']],
  ['ko-seem', '비가 올 것 같아요.', ['올', '것', '같아요']],
  ['ko-because', '비가 오기 때문에 집에 있어요.', ['오기', '때문에']],
  ['ko-if', '비가 오면 집에 있어요.', ['오면']],
  ['ko-but', '비싸지만 좋아요.', ['비싸지만']],
  ['ko-background', '비가 오는데 우산이 없어요.', ['오는데']],
  ['ko-intend', '책을 사려고 왔어요.', ['사려고']],
  ['ko-neg-short', '저는 안 가요.', ['안', '가요']],
  ['ko-neg-copula', '저는 학생이 아니에요.', ['학생이', '아니에요']],
  ['ko-exist', '방에 책이 있어요.', ['책이', '있어요']],
  ['ko-passive-jida', '집이 만들어졌어요.', ['만들어졌어요']],
  ['ko-quote', '비가 온다고 해요.', ['온다고', '해요']],
  ['ko-since', '한국에 온 지 일 년이 됐어요.', ['온', '지']],
  ['ko-while', '아이가 자는 동안 책을 읽었어요.', ['자는', '동안']],
  ['ko-after', '밥을 먹은 후에 나갔어요.', ['먹은', '후에']],
  ['ko-before', '밥을 먹기 전에 손을 씻어요.', ['먹기', '전에']],
  ['ko-in-order', '건강을 위해 운동해요. 살기 위해서 먹어요.', ['살기', '위해서']],
  ['ko-causative-ge', '아이를 웃게 만들었어요.', ['웃게', '만들었어요']],
];
/** Need words outside the core (the light-verb nouns). */
const SHARD_CASES: Array<[string, string, string[]]> = [
  ['ko-passive-light', '그 문제가 해결되었어요.', ['해결되었어요']],
  ['ko-causative-light', '아이를 공부시켰어요.', ['공부시켰어요']],
];

describe('constructions over the analysed readings (core only)', () => {
  beforeAll(() => { uninstallKoreanLexicon('kaikki-ko-lexicon'); installKoreanLexicon(KO_CORE); });
  for (const [id, s, span] of CASES) {
    it(`${id}: ${s}`, () => {
      const { hits, patterns } = run(s);
      const h = hits.find((x) => x.id === id);
      expect(h, JSON.stringify(hits.map((x) => x.id))).toBeDefined();
      expect(words(s, h!.tokenIndexes)).toEqual(span);
      expect(s.slice(h!.start, h!.end)).toBe(span.join(' '));
      expect(h!.joins.length).toBeGreaterThan(0);
      const p = patterns.find((x) => x.key === id)!;
      expect(p.explanation).toMatch(/Here: /);
      expect(p.confidence).toBeGreaterThan(0);
    });
  }
  it('the contracted quotation endings (-대, -래, -재, -냬) are quotations in one word', () => {
    for (const s of ['비가 온대요.', '학생이래요.', '같이 가재요.', '어디 가냬요.']) expect(run(s).hits.map((h) => h.id), s).toContain('ko-quote');
  });
  it('the other quotation endings before 하다 / 말하다 / 묻다: -냐고, -자고, -(이)라고', () => {
    for (const s of ['어디 가냐고 물었어요.', '같이 가자고 했어요.', '학생이라고 말했어요.']) expect(run(s).hits.map((h) => h.id), s).toContain('ko-quote');
  });
  it('보다, 주다, 있다 as ordinary verbs report no auxiliary pattern', () => {
    const aux = ['ko-try', 'ko-benefactive', 'ko-progressive', 'ko-resultative'];
    for (const s of ['영화를 봐요.', '친구에게 책을 줘요.', '책이 있어요.', '밥을 먹고 학교에 가요.']) expect(run(s).hits.map((h) => h.id).filter((x) => aux.includes(x)), s).toEqual([]);
  });
  it('every id is a key of the pack’s grammar copy, and every key of the copy is detected', () => {
    const keys = new Set(KO_GRAMMAR_CONSTRUCTIONS.map((c) => c.id));
    expect(KO_CONSTRUCTIONS.map((c) => c.id).filter((id) => !keys.has(id))).toEqual([]);
    const covered = new Set([...CASES, ...SHARD_CASES].map(([id]) => id));
    expect([...keys].filter((k) => !covered.has(k))).toEqual([]);
  });
  it('fixed phrases: the dictionary headword 그럼에도 불구하고 and the postposition frames', () => {
    expect(run('그럼에도 불구하고 갔어요.').phrases.map((p) => p.display)).toContain('그럼에도 불구하고');
    expect(run('한국 역사에 대해 이야기했어요.').phrases.map((p) => p.pattern.join(' '))).toContain('_에 대하다');
    expect(run('비로 인해 늦었어요.').phrases.map((p) => p.pattern.join(' '))).toContain('_(으)로 인하다');
    expect(run('비가 와요.').phrases).toEqual([]);
  });
});

describe.skipIf(!HAVE_SHARDS)('constructions that need the shards', () => {
  beforeAll(() => { installKoreanLexicon(KO_CORE); for (const f of fs.readdirSync(SHARDS)) if (f.endsWith('.json.gz')) installKoreanLexicon(JSON.parse(gunzipSync(fs.readFileSync(path.join(SHARDS, f))).toString('utf8')) as KoLexicon); });
  afterAll(() => uninstallKoreanLexicon('kaikki-ko-lexicon'));
  for (const [id, s, span] of SHARD_CASES) {
    it(`${id}: ${s}`, () => {
      const h = run(s).hits.find((x) => x.id === id);
      expect(h, JSON.stringify(run(s).hits.map((x) => x.id))).toBeDefined();
      expect(words(s, h!.tokenIndexes)).toEqual(span);
    });
  }
});
