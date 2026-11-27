// @vitest-environment jsdom
/**
 * A reading a language's review gate holds back shows on the card: a 'two-words' hold headlines BOTH words (the chosen one and up to three rivals,
 * "and N more" beyond), and every held kind says once, beside the level controls, that the word is not added to review and why. Keyed on the notes
 * (reviewGate, or reviewStatus + reviewKind; reviewReason, reviewRivals) only: no language test. A card whose reading is not held is as it was.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AnalyzedToken, LanguageAdapter, RawToken } from '../../src/core';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import { parseSelection, registerAnalyser } from '../../packages/golearn-extension/src/parser';
import { registerAllAnalysers } from '../support/analysers';
import { koAdapter } from '../../src/adapters/ko';
import { koClearAnalysisCache } from '../../src/adapters/korean/analyze';
import { uninstallKoreanLexicon } from '../../src/adapters/korean/index-store';
import { createKoreanShardLoader } from '../../src/adapters/korean/shards';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import { SHARDS_PRESENT, diskShardSource } from '../support/korean/lexicon';
import { setBody, stubLayout } from './dom';

const anchor = { rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' as const };
let restore: () => void; let ui: CardUI;
beforeEach(() => { restore = stubLayout(); setBody('<p>x</p>'); registerAllAnalysers(); ui = createCardUI({ doc: document, speech: null, onDismiss: () => undefined, makeUtterance: (text, voice) => ({ text, voice }) }); });
afterEach(() => { ui.destroy(); restore(); registerAllAnalysers(); });

const korean = (sentence: string, surface: string) => {
  const at = sentence.indexOf(surface);
  const card = parseSelection({ surface, languageId: 'ko', context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + surface.length } });
  ui.show(card, anchor);
  return { card, root: ui.root()! };
};
const rowsText = (root: ShadowRoot) => (root.querySelector('[data-row="two-words"]')?.textContent ?? '');
const hold = (root: ShadowRoot) => root.querySelector('[data-row="review-hold"]')?.textContent ?? '';

// the three sentences the auditor named. The notes the gate writes are now on these readings, so the test is STRICT: a missing hold fails it.
const THREE: Array<[string, string, [string, string]]> = [['피는 꽃이 예뻐요.', '피는', ['피', '피다']], ['어제 산 옷이에요.', '산', ['살다', '사다']], ['실을 바늘에 꿰었어요.', '실을', ['싣다', '실']]];
const publicFetch = (async (input: RequestInfo | URL) => {
  const file = path.join(path.resolve(__dirname, '../../public'), decodeURIComponent(new URL(String(input), 'http://assets.local/').pathname));
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
}) as typeof fetch;

function strictThree(where: string): void {
  describe(`Korean, through the real adapter, ${where}: the three sentences are held and say so`, () => {
    it.each(THREE)('%s (%s): the two-words block names both words, the hold line is there, no lemma is credited, GoReview admits no card', async (sentence, surface, words) => {
      const { card, root } = korean(sentence, surface);
      expect(card.reviewHold?.kind, 'the gate\'s reviewKind note is on the reading').toBe('two-words');
      const block = root.querySelector('[data-row="two-words"]');
      expect(block, 'the two-words block').not.toBeNull();
      expect(block!.textContent).toContain('The sentence does not decide which of these words this is:');
      expect(root.querySelectorAll('[data-row="two-words-item"]').length).toBeGreaterThanOrEqual(2);
      for (const w of words) expect(block!.textContent, w).toContain(w);
      expect(root.querySelector('.card')!.textContent).not.toMatch(/[⁰¹²³⁴-⁹]/);
      expect(hold(root)).toMatch(/^Not added to review: /);
      // the lookup credits the written form and no lemma
      expect(card.itemIds).toEqual([`form:ko:${surface}`]);
      expect(card.itemIds.some((id) => id.startsWith('lemma:'))).toBe(false);
      // GoReview: the form unit is refused (no Korean form card), and there is no lemma unit to admit
      const api = { unit: async () => ({ ok: false }) } as never;
      const facts = await packFactsFor({ fetch: publicFetch, baseUrl: 'http://assets.local/' })('ko', api)!.factsFor(`form:ko:${surface}`, 'ko');
      expect(facts === undefined || facts.status === 'requires-review', 'the form is not a card').toBe(true);
    });
  });
}

strictThree('with the compiled core alone');
describe.skipIf(!SHARDS_PRESENT)('with the stem lexicon\'s shards loaded', () => {
  beforeAll(async () => {
    const loader = await createKoreanShardLoader(diskShardSource, { base: 'lexicon/ko/standard' });
    await loader.ensure(THREE.flatMap(([sentence]) => koAdapter.tokenize(sentence).filter((t) => t.isWord).map((t) => t.normalized)));
    koClearAnalysisCache();
  });
  afterAll(() => { uninstallKoreanLexicon('kaikki-ko-lexicon'); koClearAnalysisCache(); });
  strictThree('with the shards');
});

describe('Korean, through the real adapter', () => {
  it('an undecided entry (눈이 예뻐요) and a plain sentence: no two-words block; nothing held on the plain one', () => {
    expect(korean('눈이 예뻐요.', '눈이').root.querySelector('[data-row="two-words"]')).toBeNull();
    const plain = korean('학생들이 학교에서 공부했습니다.', '학교에서');
    expect(plain.card.reviewHold).toBeUndefined();
    expect(plain.root.querySelector('[data-row="review-hold"]')).toBeNull();
    expect(plain.root.querySelector('[data-row="two-words"]')).toBeNull();
  });
});

type Rival = { lemma: string; gloss?: string; unconfirmed?: boolean };
/** A synthetic adapter that writes the gate's notes on the word "foo": the path is language-neutral. */
function synthetic(notes: Record<string, string | string[]>, rivals: Rival[]): LanguageAdapter {
  const tok = (s: string): RawToken[] => [...s.matchAll(/\S+/gu)].map((m) => ({ surface: m[0], start: m.index!, end: m.index! + m[0].length, isWord: true, normalized: m[0] }));
  return {
    lang: 'sq', name: 'Synthetic', script: 'Latn', version: '1',
    support: { tokenization: 'dependable', sentenceSegmentation: 'limited', lemmatization: 'seed-only', morphology: 'none', phraseDetection: 'none', productionChecks: 'none', limitations: [] },
    segmentSentences: (t: string) => [{ start: 0, end: t.length, text: t }], tokenize: tok, normalize: (s: string) => s, searchNormalize: (s: string) => s,
    analyze: (tokens: RawToken[]): AnalyzedToken[] => tokens.map((token) => ({ token, analyzer: 'adapter-sq@1', candidates: token.surface === 'foo' ? [
      { lemma: 'alpha', pos: 'NOUN', morph: {}, confidence: 0.84, gloss: 'first meaning', notes },
      ...rivals.map((r, i) => ({ lemma: r.lemma, pos: 'VERB' as const, morph: {}, confidence: 0.83 - i * 0.01, ...(r.gloss ? { gloss: r.gloss } : {}), ...(r.unconfirmed ? { unconfirmed: true } : {}) })),
    ] : [] })),
    detectPhrases: () => [], detectPatterns: () => [], pronunciation: () => ({}), speechNormalize: (t: string) => ({ speechText: t, transformations: [], normalizerVersion: 'x' }),
    display: { wordSeparator: ' ', showBoundariesOnHighlight: false }, checkProduction: () => [], relate: () => 'none',
  } as unknown as LanguageAdapter;
}
const open = (adapter: LanguageAdapter) => {
  registerAnalyser('sq', adapter);
  const sentence = 'bar foo baz'; const at = sentence.indexOf('foo');
  const card = parseSelection({ surface: 'foo', languageId: 'sq', context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + 3 } });
  ui.show(card, anchor);
  return { card, root: ui.root()! };
};

describe('a synthetic, non-Korean candidate carrying the gate\'s notes', () => {
  it('two-words: both words, each with its own class and meaning, no single answer, and the hold line', () => {
    const { card, root } = open(synthetic({ reviewStatus: 'requires-review', reviewReason: 'The form can be read as two different words and the sentence does not settle which.', reviewGate: 'yes', reviewKind: 'two-words', reviewRivals: ['beta'] }, [{ lemma: 'beta', gloss: 'second meaning' }]));
    expect(card.reviewHold).toEqual({ kind: 'two-words', reason: expect.stringContaining('two different words'), rivals: [{ lemma: 'beta', pos: 'VERB', gloss: 'second meaning' }] });
    const t = rowsText(root);
    expect(t).toContain('does not decide');
    for (const s of ['alpha', 'first meaning', 'beta', 'second meaning']) expect(t).toContain(s);
    expect(root.querySelector('.meaning')).toBeNull();
    expect(hold(root)).toBe('Not added to review: The form can be read as two different words and the sentence does not settle which.');
  });

  it('an unconfirmed rival has no meaning; beyond the chosen word and three rivals the card says "and N more"', () => {
    const rivals: Rival[] = ['b1', 'b2', 'b3', 'b4', 'b5'].map((lemma, i) => ({ lemma, ...(i ? { gloss: `m${i}` } : {}), unconfirmed: i === 0 }));
    const { root } = open(synthetic({ reviewStatus: 'requires-review', reviewReason: 'why', reviewGate: 'yes', reviewKind: 'two-words', reviewRivals: rivals.map((r) => r.lemma) }, rivals));
    expect(root.querySelectorAll('[data-row="two-words-item"]').length).toBe(4);
    expect(rowsText(root)).toContain('no meaning in the word list');
    expect(root.querySelector('[data-row="two-words-more"]')?.textContent).toBe('and 2 more');
  });

  it('every other kind, and an unknown kind, shows the plain line and nothing else; the headline stays', () => {
    for (const kind of ['unlisted', 'no-meaning', 'undecided-entry', 'low-confidence', 'known-limit', 'other-listed-word', 'unwritten-copula', 'meaning-unreviewed', 'other-variety', 'a-kind-from-the-future']) {
      const { root } = open(synthetic({ reviewStatus: 'requires-review', reviewReason: `reason for ${kind}`, reviewGate: 'yes', reviewKind: kind }, []));
      expect(hold(root), kind).toBe(`Not added to review: reason for ${kind}`);
      expect(root.querySelector('[data-row="two-words"]'), kind).toBeNull();
      expect(root.querySelector('.meaning'), kind).not.toBeNull();
    }
  });

  it('requires-review WITH a kind and no gate (a lemma still credited) shows the line; WITHOUT a kind (Biblical Aramaic) shows nothing new', () => {
    const withKind = open(synthetic({ reviewStatus: 'requires-review', reviewReason: 'unreviewed meaning', reviewKind: 'meaning-unreviewed' }, []));
    expect(hold(withKind.root)).toBe('Not added to review: unreviewed meaning');
    const noKind = open(synthetic({ reviewStatus: 'requires-review', reviewReason: 'an Aramaic reading to be reviewed' }, []));
    expect(noKind.card.reviewHold).toBeUndefined();
    expect(noKind.root.querySelector('[data-row="review-hold"]')).toBeNull();
  });

  it('a right-to-left headword takes its own direction beside an English gloss, and long words wrap rather than clip', () => {
    const long = 'a very long first meaning that goes on and on beyond the width of a narrow popup, to be wrapped and never clipped';
    const { root } = open(synthetic({ reviewStatus: 'requires-review', reviewReason: 'r', reviewGate: 'yes', reviewKind: 'two-words', reviewRivals: ['علم'] }, [{ lemma: 'علم', gloss: long }]));
    expect([...root.querySelectorAll('[data-row="two-words-item"] .lv')].map((e) => e.getAttribute('dir'))).toEqual(['auto', 'auto']);
    const css = root.querySelector('style')!.textContent!;
    expect(css).toContain('.twoWords, .holdNote { overflow-wrap: anywhere; max-width: 100%; }');
    expect(css).toContain('.twoWord { display: flex; flex-wrap: wrap;');
  });
});
