// @vitest-environment node
/**
 * Period-aware facts (docs/PLAN14.md §5): with a target PERIOD variety the facts provider reads the pack's sentences in that period and puts
 * example sentences of that period first, falling back to the others rather than inventing any; without one, or for a language without
 * period varieties, nothing changes. Also the loose answer folds for Hebrew points and Greek accents.
 */
import { describe, expect, it } from 'vitest';
import { createFactsProvider, type FactsAdapter } from '../../packages/goreview/src/facts/provider';
import { foldGreek, foldHebrew, normalizeAnswer } from '../../packages/goreview/src/grading/normalize';
import type { PackManifest } from '../../packages/language-packs/src/manifest';
import { hebrewManifest } from '../../packages/language-packs/src/packs/he';
import { heAdapter } from '../../src/adapters/he';
import type { AnalyzedToken, RawToken } from '../../src/core';

/** A two-period toy adapter: words ending in -a are "old", words ending in -o are "new"; `opts.varietyId` is recorded. */
function toyAdapter(): FactsAdapter & { calls: Array<string | undefined> } {
  const calls: Array<string | undefined> = [];
  const tokenize = (s: string): RawToken[] => {
    const out: RawToken[] = [];
    for (const m of s.matchAll(/\p{L}+/gu)) out.push({ surface: m[0], start: m.index!, end: m.index! + m[0].length, isWord: true, normalized: m[0].toLowerCase() });
    return out;
  };
  return {
    calls,
    tokenize,
    normalize: (s) => s.toLowerCase(),
    varieties: { old: { kind: 'period', label: 'Old' }, new: { kind: 'period', label: 'New' } },
    analyze: (tokens, opts): AnalyzedToken[] => {
      calls.push(opts?.varietyId);
      return tokens.map((t) => ({
        token: t, analyzer: 'toy@1',
        candidates: [{ lemma: t.normalized.replace(/[ao]$/, ''), pos: 'NOUN', morph: { Number: 'Sing' }, confidence: 0.9, gloss: 'thing', varieties: [t.normalized.endsWith('a') ? 'old' : 'new'] }],
      }));
    },
  };
}
const manifestWith = (sentences: string[]): PackManifest => ({
  ...hebrewManifest(), languageId: 'toy', packId: 'pack:toy',
  validation: sentences.map((s, i) => ({ id: `v${i}`, surface: s.split(' ')[0], sentence: s, expect: {} })),
  grammar: { features: [], constructions: [] },
} as unknown as PackManifest);
const deps = (adapter: FactsAdapter, manifest: PackManifest, varietyId?: string) => ({
  unit: async () => undefined, pack: { manifest, runtime: { gloss: async () => undefined } }, adapter, tutorial: null, ...(varietyId ? { varietyId } : {}),
});

describe('period-aware facts', () => {
  const sentences = ['kota runs', 'koto walks', 'kota sleeps'];
  it('without a target variety the examples come in pack order and the adapter is asked without a variety', async () => {
    const a = toyAdapter();
    const f = await createFactsProvider(deps(a, manifestWith(sentences))).factsFor('lemma:toy:kot:NOUN', 'toy');
    expect(f?.exampleSentences.map((e) => e.text)).toEqual(['kota runs', 'koto walks', 'kota sleeps']);
    expect(a.calls.every((c) => c === undefined)).toBe(true);
  });
  it('with the target period "new" the sentence of that period comes first and the adapter was asked with it; the others follow (never none)', async () => {
    const a = toyAdapter();
    const f = await createFactsProvider(deps(a, manifestWith(sentences), 'new')).factsFor('lemma:toy:kot:NOUN', 'toy', 'new');
    expect(f?.exampleSentences.map((e) => e.text)).toEqual(['koto walks', 'kota runs', 'kota sleeps']);
    // the three pack sentences were read with the target period (the provider also reads single forms on their own, without one)
    expect(a.calls.filter((c) => c === 'new').length).toBeGreaterThanOrEqual(3);
  });
  it('a variety the adapter does not know as a period changes nothing', async () => {
    const a = toyAdapter();
    const f = await createFactsProvider(deps(a, manifestWith(sentences), 'toy-XX')).factsFor('lemma:toy:kot:NOUN', 'toy', 'toy-XX');
    expect(f?.exampleSentences.map((e) => e.text)).toEqual(['kota runs', 'koto walks', 'kota sleeps']);
  });
  it('the real Hebrew pack: facts for אָמַר exist in the Biblical period from the compiled core, and asking for Modern still yields them (fallback, nothing invented)', async () => {
    const m = hebrewManifest();
    const bib = await createFactsProvider(deps(heAdapter, m, 'he-bib')).factsFor('lemma:he:אָמַר:VERB', 'he', 'he-bib');
    expect(bib?.exampleSentences.length).toBeGreaterThan(0);
    const mod = await createFactsProvider(deps(heAdapter, m, 'he-mod')).factsFor('lemma:he:אָמַר:VERB', 'he', 'he-mod');
    expect(mod?.exampleSentences.map((e) => e.text)).toEqual(bib?.exampleSentences.map((e) => e.text));
  });
});

describe('loose answer folds', () => {
  it('Hebrew: an unpointed answer meets a pointed key only in loose mode', () => {
    expect(normalizeAnswer('שָׁלוֹם')).toBe('שָׁלוֹם');
    expect(normalizeAnswer('שָׁלוֹם', 'loose')).toBe('שלום');
    expect(foldHebrew('shalom')).toBe('shalom');
  });
  it('Greek: a monotonic or unaccented answer meets a polytonic key only in loose mode; final sigma stays', () => {
    expect(normalizeAnswer('ἀρχῇ')).toBe('ἀρχῇ');
    expect(normalizeAnswer('ἀρχῇ', 'loose')).toBe('αρχη');
    expect(normalizeAnswer('λόγος', 'loose')).toBe('λογος');
    expect(foldGreek('logos')).toBe('logos');
  });
  it('Devanagari and Thai marks are still never stripped', () => {
    expect(normalizeAnswer('हिन्दी', 'loose')).toBe('हिन्दी');
    expect(normalizeAnswer('สวัสดี', 'loose')).toBe('สวัสดี');
  });
});
