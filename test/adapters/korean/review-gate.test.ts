// @vitest-environment node
/**
 * The review gate (src/core/review-gate.ts, its Korean side src/adapters/korean/review-gate.ts): the detached-particle rule and T-A' (another listed word counts
 * as a rival only if it is not rare by the pack's own count test), and that rule (c), the two-words hold, never reads a count.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyReviewGate, type GateCandidate } from '../../../src/core/review-gate';
import { koAdapter } from '../../../src/adapters/ko';
import { koLemmaCount } from '../../../src/adapters/korean/review-gate';
import { installKoreanLexicon, uninstallKoreanLexicon } from '../../../src/adapters/korean/index-store';
import { KO_CORE } from '../../../src/adapters/korean/generated/core';

beforeAll(() => { uninstallKoreanLexicon('kaikki-ko-lexicon'); installKoreanLexicon(KO_CORE); });
afterAll(() => uninstallKoreanLexicon('kaikki-ko-lexicon'));

const heldOf = (sentence: string, surface: string): { kind?: string; reason?: string; held: boolean } => {
  const tokens = koAdapter.tokenize(sentence);
  const an = koAdapter.analyze(tokens);
  const i = tokens.findIndex((t) => t.isWord && t.surface === surface);
  const c = an[i].candidates[0];
  return { held: c.notes?.reviewGate === 'yes', kind: c.notes?.reviewKind as string | undefined, reason: c.notes?.reviewReason as string | undefined };
};

describe('a detached particle: every reading is held when the whole form is a particle that follows a closing quote, a number or Latin letters with no space', () => {
  it.each([['‘선’의 뜻', '의'], ['"책"은 좋아요', '은'], ['UN의 회의', '의'], ['2025는 숫자', '는'], ['(책)을 읽어요', '을']])('%s (%s) is held as a particle', (sentence, surface) => {
    const h = heldOf(sentence, surface);
    expect(h.held).toBe(true);
    expect(h.kind).toBe('other-listed-word');
    expect(h.reason).toBe(`Standing directly after a quotation mark, a bracket or a number, this is most likely the particle ${surface}, not a word of its own.`);
  });
  it('every reading of the token is marked, not only the first', () => {
    const tokens = koAdapter.tokenize('‘선’의 뜻'); const an = koAdapter.analyze(tokens);
    const a = an[tokens.findIndex((t) => t.surface === '의')];
    expect(a.candidates.length).toBeGreaterThan(0);
    for (const c of a.candidates) expect(c.notes?.reviewGate, c.lemma).toBe('yes');
  });
  it('ONE space between the closing quote, bracket, number, % or > and the token is allowed (the treebank\'s own spacing), and the function reading is named', () => {
    for (const [sentence, surface, what] of [['‘선’ 의 뜻', '의', 'particle'], ["'책' 은 좋아요", '은', 'particle'], ['1 % 가 있다', '가', 'particle'], ['1.5 % 밖에 얻지 못했다', '밖에', 'particle'], ['6.8 % 씩 얻었다', '씩', 'suffix'],
      ['<대부> 라는 전설', '라는', 'copula with its ending'], ["'배우요' 라고 부른다", '라고', 'particle'], ["'고판본의 걸음마단계' 라 불리었다", '라', 'copula with its ending']] as const) {
      const h = heldOf(sentence, surface);
      expect(h.held, sentence).toBe(true);
      expect(h.kind).toBe('other-listed-word');
      expect(h.reason).toContain(what);
      expect(h.reason).toContain(surface);
    }
  });
  it('NOT held: a particle-spelled word that follows a WORD (이 책은 좋아요: 이 the determiner), or has two spaces, or follows an opening quote', () => {
    expect(heldOf('이 책은 좋아요', '이').held).toBe(false);
    expect(heldOf('그 사람의 이 책', '이').held).toBe(false);
    expect(heldOf('‘선’  의 뜻', '의').held).toBe(false);
  });
  it('known cost: a determiner 이 after a quoted word with one space is held too (‘선’ 이 책): the rule cannot tell it from the particle', () => {
    expect(heldOf('‘선’ 이 책', '이').held).toBe(true);
  });
  it('a particle attached to its host is no token of its own, and a word that merely begins with a particle form is not touched', () => {
    expect(heldOf('학생이 와요', '학생이').held).toBe(false);
    expect(heldOf('"책"은 좋아요', '좋아요').kind).not.toBe('other-listed-word');
  });
});

describe("T-A': another listed word is a rival only if it is not rare (the core option rivalCount)", () => {
  const cand = (lemma: string, confidence: number, gloss = 'x'): GateCandidate => ({ lemma, pos: 'NOUN', confidence, gloss });
  const base = { listed: () => true, band: 0.15, floor: 0.8, creditFloor: 0.5, otherListedWord: true, surface: 'x' };
  const counts: Record<string, number> = { chosen: 100, common: 40, quarter: 25, rare: 10, unseen: 0, tiny: 3 };
  const run = (rivalLemma: string, withCount = true) => {
    const cs = [cand('chosen', 0.92), cand(rivalLemma, 0.45)];
    applyReviewGate(cs, { ...base, ...(withCount ? { rivalCount: (c: GateCandidate) => counts[c.lemma!] ?? 0, rivalCommonAt: 30 } : {}) });
    return cs[0].notes;
  };
  it('a rival with a count of at least 30 holds; at least a quarter of the chosen headword holds', () => {
    expect(run('common')?.reviewKind).toBe('other-listed-word');
    expect(run('quarter')?.reviewKind).toBe('other-listed-word');
    expect(run('common')?.reviewRivals).toEqual(['common']);
  });
  it('a rare rival (under 30 and under a quarter) or an unseen one does not hold', () => {
    expect(run('rare')).toBeUndefined();
    expect(run('unseen')).toBeUndefined();
    expect(run('tiny')).toBeUndefined();
  });
  it('without a count function every other listed word holds (T-A, the neutral default)', () => {
    expect(run('rare', false)?.reviewKind).toBe('other-listed-word');
  });
  it('rule (c), the two-words hold, reads no count: a rival within the band holds even with a count of 9', () => {
    const cs = [cand('chosen', 0.84), cand('thread', 0.83)];
    applyReviewGate(cs, { ...base, rivalCount: (c: GateCandidate) => (c.lemma === 'thread' ? 9 : 100), rivalCommonAt: 30 });
    expect(cs[0].notes?.reviewKind).toBe('two-words');
    expect(cs[1].notes?.reviewKind).toBe('two-words');
  });
  it('the Korean count is the lexicon\'s n of the spelling (the count the sentence layer reads), 0 when unseen', () => {
    expect(koLemmaCount('하다')).toBeGreaterThan(1000);
    expect(koLemmaCount('가다')).toBeGreaterThan(100);
    expect(koLemmaCount('없는말')).toBe(0);
    expect(koLemmaCount(undefined)).toBe(0);
  });
  it('real Korean: 좋아요 (the noun "a like" is unseen) is no longer held by T-A; 실을 stays held as two-words (rule (c))', () => {
    expect(heldOf('저는 좋아요', '좋아요').held).toBe(false);
    const h = heldOf('실을 바늘에 꿰었어요.', '실을');
    expect(h.kind).toBe('two-words');
  });
});

describe('the meaning hold: an entry whose first meaning is unchecked or doubtful (the lexicon\'s multi flag) is held for CARDS only, the lemma still credited', () => {
  // real entries read from the lexicon at run time; the compiled core is installed above
  const entries = (): Array<{ lemma: string; multi?: true; glossOwn?: true; tag: string; set?: string }> => {
    const out: Array<{ lemma: string; multi?: true; glossOwn?: true; tag: string; set?: string }> = [];
    for (const k of Object.keys(KO_CORE.entries)) for (const e of KO_CORE.entries[k]) out.push(e);
    return out;
  };
  it('the core carries the flag, and an own-gloss entry never carries it', () => {
    const all = entries();
    expect(all.filter((e) => e.multi).length).toBeGreaterThan(100);
    expect(all.filter((e) => e.glossOwn && e.multi)).toEqual([]);
  });
  it('a multi-sense lemma read in a sentence is marked requires-review with kind meaning-unreviewed and NO reviewGate: it is still credited by the card, which says why it is not drilled', async () => {
    const { parseSelection } = await import('../../../packages/golearn-extension/src/parser');
    const { registerAllAnalysers } = await import('../../support/analysers');
    registerAllAnalysers();
    let found: { word: string; lemma: string } | undefined;
    for (const e of entries().filter((x) => x.multi && x.tag === 'NNG' && !x.set && x.lemma.length >= 2).slice(0, 600)) {
      const sentence = `저는 ${e.lemma}을 봤어요.`; const surface = `${e.lemma}을`;
      const at = sentence.indexOf(surface);
      const card = parseSelection({ surface, languageId: 'ko', context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + surface.length } });
      if (card.lemma === e.lemma && card.reviewHold?.kind === 'meaning-unreviewed') { found = { word: surface, lemma: e.lemma }; expect(card.itemIds).toEqual([`lemma:ko:${e.lemma}:NOUN`]); break; }
    }
    expect(found, 'a multi-sense noun is held for the card with its lemma still credited').toBeTruthy();
  }, 90_000);
  it('through the real GoReview facts path: a multi-sense lemma gets no card; a one-sense lemma and an own-gloss lemma do', async () => {
    const { packFactsFor } = await import('../../../packages/goreview/app/packFacts');
    const fs = await import('node:fs'); const path = await import('node:path');
    const files = (async (input: RequestInfo | URL) => {
      const file = path.join(path.resolve(__dirname, '../../../public'), decodeURIComponent(new URL(String(input), 'http://assets.local/').pathname));
      return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
    }) as typeof fetch;
    const facts = packFactsFor({ fetch: files, baseUrl: 'http://assets.local/' })('ko', { unit: async () => ({ ok: false }) } as never)!;
    const all = entries().filter((e) => e.tag === 'NNG' && !e.set && e.lemma.length >= 2);
    const statusOf = async (lemma: string) => (await facts.factsFor(`lemma:ko:${lemma}:NOUN`, 'ko'))?.status;
    // how many entries still carry the flag depends on the review files (the model review of the core cleared most of them), so the count is read, not assumed
    const flagged = all.filter((x) => x.multi).slice(0, 40);
    expect(flagged.length, 'some core noun still has an unchecked first meaning (if none does, this test must be rewritten on a shard entry)').toBeGreaterThan(5);
    let held = 0; for (const e of flagged) if ((await statusOf(e.lemma)) === 'requires-review') held++;
    expect(held, 'the flagged lemmas are refused').toBeGreaterThanOrEqual(Math.ceil(flagged.length * 0.9));
    const single = all.filter((x) => !x.multi && !x.glossOwn).slice(0, 40);
    let open = 0; for (const e of single) if ((await statusOf(e.lemma)) !== 'requires-review') open++;
    expect(open, 'the single-sense lemmas are not refused by this rule').toBeGreaterThan(20);
    const own = all.filter((x) => x.glossOwn).slice(0, 10);
    for (const e of own) expect(await statusOf(e.lemma), e.lemma).not.toBe('meaning-unreviewed');
  });
});
