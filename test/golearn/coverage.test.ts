import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import {
  ES_GEN, ES_JOHN, ES_PREP, ES_STORY, buildSpanish, buildSpanishPrep, buildSpanishScripture,
} from './fixtures';

const U = 'u1';
const F = (w: string) => ids.form('es', w);

/** A text of `n` distinct one-token words w0…w(n-1), of which the first `k` are marked known. */
async function bandFixture(h: Harness, n: number, k: number, slug: string) {
  await buildFixtureText(h.store, {
    lang: 'es', slug, sentences: [{ tokens: Array.from({ length: n }, (_, i) => ({ surface: `w${slug}${i}` })) }],
  });
  for (let i = 0; i < k; i++) await h.mark(U, 'es', F(`w${slug}${i}`), 'known');
  return h.golearn.coverage(U, `text:es:${slug}`);
}

describe('coverage bands (≥0.95 comfortable, ≥0.88 productive-challenge, ≥0.75 difficult, else stretch)', () => {
  it.each([
    [20, 20, 'comfortable'],
    [20, 19, 'comfortable'], // 0.95 exactly
    [25, 23, 'productive-challenge'], // 0.92
    [25, 22, 'productive-challenge'], // 0.88 exactly
    [25, 21, 'difficult'], // 0.84
    [20, 15, 'difficult'], // 0.75 exactly
    [20, 14, 'stretch'], // 0.70
    [20, 0, 'stretch'],
  ] as const)('%i tokens, %i known → %s', async (n, k, band) => {
    const h = createHarness();
    const cov = await bandFixture(h, n, k, `b${n}k${k}`);
    expect(cov.band).toBe(band);
    expect(cov.wordTokens).toBe(n);
    expect(cov.knownLexicalCoverage).toBeCloseTo(k / n, 10);
    expect(cov.knownLexicalCoverage + cov.partialCoverage + cov.unseenCoverage).toBeCloseTo(1, 10);
  });
});

describe('coverage()', () => {
  it('a fresh learner has everything unseen; newItems are ranked by count', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    const cov = await h.golearn.coverage(U, ES_STORY);
    expect(cov.textId).toBe(ES_STORY);
    expect(cov.sentenceIds).toHaveLength(4);
    expect(cov.wordTokens).toBe(4 + 3 + 4 + 4);
    expect(cov.unseenCoverage).toBe(1);
    expect(cov.band).toBe('stretch');
    expect(cov.newItems[0].count).toBe(2); // yo / creo / en / dios each appear twice
    const counts = cov.newItems.map((n) => n.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(cov.newItems.every((n) => n.itemKind === 'form')).toBe(true);
    expect(cov.avgSentenceLength).toBeCloseTo(15 / 4, 10);
    expect(cov.knownPhraseCoverage).toBe(0);
    expect(cov.unfamiliarPatterns).toEqual([ids.pattern('es', 'present-tense')]);
    expect(cov.expectedDifficulty).toBeGreaterThan(0.5);
  });

  it('seen once is partial; three unassisted reads is known; known via lemma counts', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    await h.view(U, 'es', ES_STORY, 0, 's1');
    let cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.partialCoverage).toBe(1);
    expect(cov.knownLexicalCoverage).toBe(0);
    for (const s of ['s2', 's3']) await h.view(U, 'es', ES_STORY, 0, s);
    cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.knownLexicalCoverage).toBe(1);
    expect(cov.band).toBe('comfortable');
    expect(cov.knownPhraseCoverage).toBe(1);
    expect(cov.newItems).toEqual([]);
    expect(cov.unfamiliarPatterns).toEqual([]);
    // "cree" (John) was never read as a form, but its lemma is known
    const john = await h.golearn.coverage(U, ES_JOHN, [`${ES_JOHN}/s0`]);
    expect(john.knownLexicalCoverage).toBeCloseTo(2 / 6, 10);
  });

  it('assistance keeps words from counting as known: ten rescued reads are still only "recognized with help"', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    for (let i = 0; i < 10; i++) {
      await h.view(U, 'es', ES_STORY, 0, `s${i}`);
      await h.rescue(U, 'es', ES_STORY, [0], `s${i}`);
    }
    const st = (await h.golearn.getItemState(U, F('creo')))!;
    expect(st.reading.level).toBe('recognized_with_help');
    const cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.knownLexicalCoverage).toBe(0);
    expect(cov.partialCoverage).toBe(1);
  });

  it('manual marks floor / cap what counts as known', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.mark(U, 'es', F('creo'), 'known');
    let cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.knownLexicalCoverage).toBeCloseTo(1 / 4, 10);
    for (const s of ['s1', 's2', 's3', 's4']) await h.view(U, 'es', ES_STORY, 0, s);
    await h.mark(U, 'es', F('yo'), 'unknown'); // plenty of evidence, but the learner says no
    await h.mark(U, 'es', ids.lemma('es', 'yo', 'PRON'), 'unknown', 'lemma');
    cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.knownLexicalCoverage).toBeCloseTo(3 / 4, 10);
  });

  it('listening coverage tracks listening separately from reading', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    for (const s of ['s1', 's2', 's3']) await h.view(U, 'es', ES_STORY, 0, s);
    let cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.knownLexicalCoverage).toBe(1);
    expect(cov.listeningCoverage).toBe(0);
    for (const s of ['l1', 'l2', 'l3']) await h.listen(U, 'es', ES_STORY, [0], { session: s });
    cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.listeningCoverage).toBe(1);
  });

  it('throws for an unknown text', async () => {
    const h = createHarness();
    await expect(h.golearn.coverage(U, 'text:es:nope')).rejects.toThrow();
  });
});

describe('scriptureReadiness()', () => {
  async function setup() {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    await buildSpanishPrep(h.store); // story-02: amo / ama / mundo …
    for (const s of ['s1', 's2', 's3']) for (let i = 0; i < 4; i++) await h.view(U, 'es', ES_STORY, i, s);
    return h;
  }

  it('lists familiar items, unfamiliar forms and ranked prerequisites', async () => {
    const h = await setup();
    const r = await h.golearn.scriptureReadiness(U, ES_JOHN);
    expect(r.textId).toBe(ES_JOHN);
    expect(r.sentenceIds).toHaveLength(2);
    expect(r.coverage.wordTokens).toBe(6 + 4);
    // known: cree (lemma), en, Dios
    expect(r.familiarItems.map((f) => f.itemId).sort()).toEqual([F('cree'), F('dios'), F('en')].sort());
    expect(r.familiarItems.find((f) => f.itemId === F('cree'))?.readingLevel).toBe('rapid'); // via its lemma (9 unassisted encounters)
    const unfamiliar = r.unfamiliarForms.map((u) => u.surface);
    for (const w of ['Todo', 'aquel', 'que', 'él', 'amó', 'al', 'mundo']) expect(unfamiliar).toContain(w);
    expect(unfamiliar).not.toContain('cree');
    expect(r.unfamiliarForms.find((u) => u.surface === 'amó')).toMatchObject({ lemmaId: ids.lemma('es', 'amar', 'VERB'), lemmaKnown: false, count: 1 });

    // prerequisites: best first, gains positive and sorted, lemma items preferred
    expect(r.prerequisites.length).toBeGreaterThanOrEqual(7);
    const gains = r.prerequisites.map((p) => p.gain);
    expect([...gains].sort((a, b) => b - a)).toEqual(gains);
    expect(gains.every((g) => g > 0)).toBe(true);
    expect(r.prerequisites.find((p) => p.itemId === ids.lemma('es', 'amar', 'VERB'))).toMatchObject({ itemKind: 'lemma', surface: 'amar', gain: 1 });
    expect(r.prerequisites.some((p) => p.itemId === F('dios'))).toBe(false); // already known

    // the passage's own phrase "cree en …" is not known yet
    expect(r.knownPhrases).toEqual([]);
    expect(r.difficultPatterns).toEqual([]);
  });

  it('prerequisite gain falls as the learner acquires the item', async () => {
    const h = await setup();
    const gainOf = async () => (await h.golearn.scriptureReadiness(U, ES_JOHN)).prerequisites.find((p) => p.itemId === ids.lemma('es', 'amar', 'VERB'))!.gain;
    const g0 = await gainOf();
    await h.view(U, 'es', ES_PREP, 0, 'p1'); // "Yo amo el mundo" — once
    const g1 = await gainOf();
    expect(g1).toBeLessThan(g0);
    expect(g1).toBeGreaterThan(0);
  });

  it('ranks existing non-scripture texts by the prerequisites they contain; generated ones are allowed but flagged', async () => {
    const h = await setup();
    await buildSpanishPrep(h.store, true, 'prep-generated'); // same vocabulary, but machine-generated
    const r = await h.golearn.scriptureReadiness(U, ES_JOHN);
    const ids2 = r.preparatoryTexts.map((t) => t.textId);
    expect(ids2).toContain(ES_PREP);
    expect(ids2).toContain(ES_GEN);
    expect(ids2).not.toContain(ES_JOHN); // never the target itself…
    expect(ids2).not.toContain(ES_STORY); // …nor a text containing no prerequisite
    const real = r.preparatoryTexts.find((t) => t.textId === ES_PREP)!;
    const gen = r.preparatoryTexts.find((t) => t.textId === ES_GEN) as unknown as { generated: boolean; covers: string[] };
    expect((real as unknown as { generated: boolean }).generated).toBe(false);
    expect(gen.generated).toBe(true);
    expect(real.covers).toContain(ids.lemma('es', 'amar', 'VERB'));
    expect(real.covers).toContain(ids.lemma('es', 'mundo', 'NOUN'));
    expect(ids2.indexOf(ES_PREP)).toBeLessThan(ids2.indexOf(ES_GEN)); // a real text wins a tie
    expect(['comfortable', 'productive-challenge', 'difficult', 'stretch']).toContain(real.band);
  });

  it('respects a sentence subset', async () => {
    const h = await setup();
    const r = await h.golearn.scriptureReadiness(U, ES_JOHN, [`${ES_JOHN}/s1`]);
    expect(r.sentenceIds).toEqual([`${ES_JOHN}/s1`]);
    expect(r.unfamiliarForms.map((u) => u.surface)).not.toContain('Todo');
  });
});
