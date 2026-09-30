import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import type { Text } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import {
  ES_GEN, ES_JOHN, ES_PREP, ES_STORY, buildSpanish, buildSpanishPrep, buildSpanishScripture,
} from './fixtures';

const U = 'u1';
const F = (w: string) => ids.form('es', w);
const LEMMA = (w: string, pos: 'VERB' | 'NOUN' | 'PROPN' = 'VERB') => ids.lemma('es', w, pos);

/** A text of `n` distinct one-token words w0…w(n-1), of which the first `k` are marked known. */
async function bandFixture(h: Harness, n: number, k: number, slug: string) {
  await buildFixtureText(h.store, {
    lang: 'es', slug, sentences: [{ tokens: Array.from({ length: n }, (_, i) => ({ surface: `w${slug}${i}` })) }],
  });
  for (let i = 0; i < k; i++) await h.mark(U, 'es', F(`w${slug}${i}`), 'known');
  return h.golearn.coverage(U, `text:es:${slug}`);
}

/** Retire sentence `oldIndex` of a fixture text and add a replacement under a new stable key (as a re-import would). */
async function replaceSentence(h: Harness, textId: string, oldIndex: number, newKey: string, surfaces: string[]) {
  const oldId = ids.sentence(textId, oldIndex);
  const old = (await h.store.sentences.get(oldId))!;
  await h.store.sentences.put({ ...old, retiredInVersion: 2 });
  const newId = ids.sentence(textId, newKey);
  const text = surfaces.join(' ');
  await h.store.sentences.put({ ...old, id: newId, key: newKey, versionAdded: 2, retiredInVersion: undefined, text, normalizedText: text.toLowerCase() });
  let cursor = 0;
  for (const [i, surface] of surfaces.entries()) {
    const normalized = surface.toLowerCase();
    await h.store.tokens.put({ id: ids.token(newId, i), sentenceId: newId, textId, lang: 'es', index: i, surface, start: cursor, end: cursor + surface.length, normalized, formId: ids.form('es', normalized), isWord: true });
    cursor += surface.length + 1;
  }
  return newId;
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
    expect(cov.estimatedFamiliarCoverage).toBe(0);
    expect(cov.knownLexicalCoverage + cov.estimatedFamiliarCoverage + cov.partialCoverage + cov.unseenCoverage).toBeCloseTo(1, 10);
  });
});

describe('coverage()', () => {
  it('a fresh learner has everything unseen; newItems are ranked by count; an explanation accompanies the numbers', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    const cov = await h.golearn.coverage(U, ES_STORY);
    expect(cov.textId).toBe(ES_STORY);
    expect(cov.sentenceIds).toHaveLength(4);
    expect(cov.wordTokens).toBe(4 + 3 + 4 + 4);
    expect(cov.unseenCoverage).toBe(1);
    expect(cov.estimatedFamiliarCoverage).toBe(0);
    expect(cov.band).toBe('stretch');
    expect(cov.newItems[0].count).toBe(2); // yo / creo / en / dios each appear twice
    const counts = cov.newItems.map((n) => n.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(cov.newItems.every((n) => n.itemKind === 'form')).toBe(true);
    expect(cov.avgSentenceLength).toBeCloseTo(15 / 4, 10);
    expect(cov.knownPhraseCoverage).toBe(0);
    expect(cov.unfamiliarPatterns).toEqual([ids.pattern('es', 'present-tense')]);
    expect(cov.expectedDifficulty).toBeGreaterThan(0.5);
    // one sentence, saying what the numbers are based on
    expect(cov.explanation.match(/\.(\s|$)/g)).toHaveLength(1);
    expect(cov.explanation).toMatch(/never counted as understanding/);
    expect(cov.explanation).toMatch(/100 % are new/);
  });

  it('exposure is never understanding: met once or many times, words are partial — until an estimate, then only a separate estimate', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    const s0 = [`${ES_STORY}/s0`];
    await h.view(U, 'es', ES_STORY, 0, 's1');
    let cov = await h.golearn.coverage(U, ES_STORY, s0);
    expect(cov.partialCoverage).toBe(1);
    expect(cov.knownLexicalCoverage).toBe(0);
    for (const s of ['s2', 's3']) await h.view(U, 'es', ES_STORY, 0, s);
    cov = await h.golearn.coverage(U, ES_STORY, s0);
    expect(cov.knownLexicalCoverage).toBe(0); // three sessions: not known
    expect(cov.estimatedFamiliarCoverage).toBe(0); // and not yet estimated (needs 4)
    expect(cov.partialCoverage).toBe(1);
    await h.view(U, 'es', ES_STORY, 0, 's4');
    cov = await h.golearn.coverage(U, ES_STORY, s0);
    expect(cov.knownLexicalCoverage).toBe(0); // still nothing was shown understood…
    expect(cov.estimatedFamiliarCoverage).toBe(1); // …but the words are likely familiar, reported separately
    expect(cov.partialCoverage).toBe(0);
    expect(cov.band).toBe('comfortable'); // the band uses demonstrated + estimated
    expect(cov.explanation).toMatch(/100 % are likely familiar/);
    expect(cov.explanation).toMatch(/band uses the first two together/);
  });

  it('shown understood in two sessions is known; known via lemma counts; phrases and patterns follow', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    await h.understood(U, 'es', ES_STORY, [0], 's1');
    let cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.knownLexicalCoverage).toBe(0); // one demonstration is not yet "recognized"
    expect(cov.partialCoverage).toBe(1);
    await h.understood(U, 'es', ES_STORY, [0], 's2');
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
      await h.report(U, 'es', ES_STORY, [0], { session: `s${i}` });
    }
    const st = (await h.golearn.getItemState(U, F('creo')))!;
    expect(st.reading.level).toBe('recognized_with_help');
    expect(st.reading.estimatedFamiliar).toBe(false); // help in the last encounters: no estimate either
    const cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.knownLexicalCoverage).toBe(0);
    expect(cov.estimatedFamiliarCoverage).toBe(0);
    expect(cov.partialCoverage).toBe(1);
  });

  it('manual marks floor / cap what counts as known', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.mark(U, 'es', F('creo'), 'known');
    let cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.knownLexicalCoverage).toBeCloseTo(1 / 4, 10);
    for (const s of ['s1', 's2', 's3', 's4']) await h.understood(U, 'es', ES_STORY, [0], s);
    await h.mark(U, 'es', F('yo'), 'unknown'); // plenty of evidence, but the learner says no
    await h.mark(U, 'es', ids.lemma('es', 'yo', 'PRON'), 'unknown', 'lemma');
    cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.knownLexicalCoverage).toBeCloseTo(3 / 4, 10);
  });

  it('listening coverage tracks listening separately from reading, and only real speech shown understood counts', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    for (const s of ['s1', 's2', 's3']) await h.understood(U, 'es', ES_STORY, [0], s);
    let cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.knownLexicalCoverage).toBe(1);
    expect(cov.listeningCoverage).toBe(0);
    for (const s of ['l1', 'l2', 'l3']) await h.listen(U, 'es', ES_STORY, [0], { session: s }); // heard only
    cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.listeningCoverage).toBe(0);
    for (const s of ['l1', 'l2', 'l3']) await h.report(U, 'es', ES_STORY, [0], { session: s, modality: 'listening' });
    cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.listeningCoverage).toBe(1);
  });

  it('reads sentence order from Sentence.index and skips retired sentences (their encounters stay valid history)', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 1, 's1'); // "El corazón cree." — about to be edited
    const before = await h.golearn.coverage(U, ES_STORY);
    const newId = await replaceSentence(h, ES_STORY, 1, 'zz-edited', ['El', 'corazón', 'creía']);
    const after = await h.golearn.coverage(U, ES_STORY);
    // ids sort s0 < s2 < s3 < szz-edited, reading order is by index: s0, (edited), s2, s3
    expect(after.sentenceIds).toEqual([`${ES_STORY}/s0`, newId, `${ES_STORY}/s2`, `${ES_STORY}/s3`]);
    expect(after.sentenceIds).not.toContain(`${ES_STORY}/s1`);
    expect(after.wordTokens).toBe(before.wordTokens - 3 + 3); // retired words out, replacement words in
    // the old encounter is still history, and a rebuild keeps it
    expect((await h.golearn.getItemState(U, F('corazón')))?.encounterCount).toBe(1);
    await h.golearn.rebuild(U);
    expect((await h.golearn.getItemState(U, F('corazón')))?.encounterCount).toBe(1);
    // a view of the retired sentence is still folded, but the retired sentence never enters coverage
    expect((await h.golearn.readingProgress(U, ES_STORY)).sentencesTotal).toBe(4);
    const subset = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s1`]);
    expect(subset.sentenceIds).toEqual([]);
  });

  it('throws for an unknown text', async () => {
    const h = createHarness();
    await expect(h.golearn.coverage(U, 'text:es:nope')).rejects.toThrow();
  });
});

async function setupReadiness() {
  const h = createHarness();
  await buildSpanish(h.store);
  await buildSpanishScripture(h.store);
  await buildSpanishPrep(h.store); // story-02: amo / ama / mundo …
  for (const s of ['s1', 's2', 's3']) await h.understood(U, 'es', ES_STORY, [0, 1, 2, 3], s);
  return h;
}

describe('scriptureReadiness()', () => {
  it('lists familiar items, unfamiliar forms and ranked prerequisites (only what was shown understood is familiar)', async () => {
    const h = await setupReadiness();
    const r = await h.golearn.scriptureReadiness(U, ES_JOHN);
    expect(r.textId).toBe(ES_JOHN);
    expect(r.sentenceIds).toHaveLength(2);
    expect(r.coverage.wordTokens).toBe(6 + 4);
    // known: cree (lemma), en, Dios
    expect(r.familiarItems.map((f) => f.itemId).sort()).toEqual([F('cree'), F('dios'), F('en')].sort());
    expect(r.familiarItems.find((f) => f.itemId === F('cree'))?.readingLevel).toBe('rapid'); // via its lemma (9 demonstrated units)
    const unfamiliar = r.unfamiliarForms.map((u) => u.surface);
    for (const w of ['Todo', 'aquel', 'que', 'él', 'amó', 'al', 'mundo']) expect(unfamiliar).toContain(w);
    expect(unfamiliar).not.toContain('cree');
    expect(r.unfamiliarForms.find((u) => u.surface === 'amó')).toMatchObject({ lemmaId: LEMMA('amar'), lemmaKnown: false, count: 1 });

    // prerequisites: best first, gains positive and sorted, lemma items preferred
    expect(r.prerequisites.length).toBeGreaterThanOrEqual(7);
    const gains = r.prerequisites.map((p) => p.gain);
    expect([...gains].sort((a, b) => b - a)).toEqual(gains);
    expect(gains.every((g) => g > 0)).toBe(true);
    expect(r.prerequisites.find((p) => p.itemId === LEMMA('amar'))).toMatchObject({ itemKind: 'lemma', surface: 'amar', gain: 1 });
    expect(r.prerequisites.some((p) => p.itemId === F('dios'))).toBe(false); // already known

    // the passage's own phrase "cree en …" is not known yet
    expect(r.knownPhrases).toEqual([]);
    expect(r.difficultPatterns).toEqual([]);
  });

  it('gaps are the passage\'s CONTENT words not yet demonstrated, with an honest status', async () => {
    const h = await setupReadiness();
    await h.view(U, 'es', ES_PREP, 0, 'p1'); // met "amo" / "mundo": exposed, not understood
    await h.view(U, 'es', ES_PREP, 1, 'p1');
    await h.help(U, 'es', ES_PREP, 1, 3, F('mundo'), 1, 'p1'); // needed a gloss for "mundo"
    const r = await h.golearn.scriptureReadiness(U, ES_JOHN);
    const gap = (id: string) => r.gaps.find((g) => g.itemId === id);
    expect(gap(LEMMA('amar'))).toMatchObject({ itemKind: 'lemma', surface: 'amar', count: 1, status: 'exposed' });
    expect(gap(LEMMA('mundo', 'NOUN'))).toMatchObject({ status: 'needed-help' });
    expect(gap(LEMMA('amar'))).toBeDefined();
    // function words (determiners, prepositions, pronouns, conjunctions) are not "meaningful gaps"
    const surfaces = r.gaps.map((g) => g.surface);
    for (const fn of ['todo', 'aquel', 'que', 'el', 'al', 'en']) expect(surfaces).not.toContain(fn);
    // demonstrated items are not gaps
    expect(r.gaps.some((g) => g.itemId === LEMMA('creer') || g.itemId === F('dios') || g.itemId === LEMMA('Dios', 'PROPN'))).toBe(false);
    const unseen = r.gaps.filter((g) => g.status === 'unseen');
    expect(unseen.length).toBe(0); // every remaining content word was at least met
  });

  it('unseen content words are gaps with status "unseen"; an estimate is "exposed", not demonstrated', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    const r0 = await h.golearn.scriptureReadiness(U, ES_JOHN);
    expect(r0.gaps.every((g) => g.status === 'unseen')).toBe(true);
    expect(r0.gaps.map((g) => g.itemId)).toContain(LEMMA('creer'));
    for (const s of ['s1', 's2', 's3', 's4']) await h.view(U, 'es', ES_STORY, 0, s); // estimated familiar, never shown understood
    const r1 = await h.golearn.scriptureReadiness(U, ES_JOHN);
    expect(r1.gaps.find((g) => g.itemId === LEMMA('creer'))).toMatchObject({ status: 'exposed' });
    expect(r1.coverage.knownLexicalCoverage).toBe(0);
    expect(r1.coverage.estimatedFamiliarCoverage).toBeGreaterThan(0);
  });

  it('prerequisite gain falls as the learner demonstrates the item (and less so for a mere estimate)', async () => {
    const h = await setupReadiness();
    const gainOf = async () => (await h.golearn.scriptureReadiness(U, ES_JOHN)).prerequisites.find((p) => p.itemId === LEMMA('amar'))!.gain;
    const g0 = await gainOf();
    await h.view(U, 'es', ES_PREP, 0, 'p1'); // met once: exposure does not reduce the gain
    expect(await gainOf()).toBe(g0);
    await h.report(U, 'es', ES_PREP, [0], { session: 'p1' }); // "Yo amo el mundo" — understood once
    const g1 = await gainOf();
    expect(g1).toBeLessThan(g0);
    expect(g1).toBeGreaterThan(0);
  });

  it('preparatory texts must actually contain gap items; ranked by gaps covered; generated ones allowed but flagged', async () => {
    const h = await setupReadiness();
    await buildSpanishPrep(h.store, true, 'prep-generated'); // same vocabulary, but machine-generated
    const r = await h.golearn.scriptureReadiness(U, ES_JOHN);
    const ids2 = r.preparatoryTexts.map((t) => t.textId);
    expect(ids2).toContain(ES_PREP);
    expect(ids2).toContain(ES_GEN);
    expect(ids2).not.toContain(ES_JOHN); // never the target itself…
    expect(ids2).not.toContain(ES_STORY); // …nor a text containing no gap
    const real = r.preparatoryTexts.find((t) => t.textId === ES_PREP)!;
    const gen = r.preparatoryTexts.find((t) => t.textId === ES_GEN)!;
    expect(real.generated).toBe(false);
    expect(gen.generated).toBe(true);
    expect(real.covers).toContain(LEMMA('amar'));
    expect(real.covers).toContain(LEMMA('mundo', 'NOUN'));
    expect(ids2.indexOf(ES_PREP)).toBeLessThan(ids2.indexOf(ES_GEN)); // a real text wins a tie
    expect(['comfortable', 'productive-challenge', 'difficult', 'stretch']).toContain(real.band);
    const gapIds = new Set(r.gaps.map((g) => g.itemId));
    for (const t of r.preparatoryTexts) expect(t.covers.every((c) => gapIds.has(c))).toBe(true); // covers are gaps, nothing else
    expect(r.corpusCanPrepare).toBe(true);
  });

  it('a text whose only overlap is already-demonstrated words is not preparatory', async () => {
    const h = await setupReadiness();
    await buildFixtureText(h.store, { lang: 'es', slug: 'story-known', sentences: [{ tokens: [{ surface: 'Dios', lemma: 'Dios', pos: 'PROPN' }, { surface: 'cree', lemma: 'creer', pos: 'VERB' }, { surface: 'en', lemma: 'en', pos: 'ADP' }] }] });
    const r = await h.golearn.scriptureReadiness(U, ES_JOHN);
    expect(r.preparatoryTexts.map((t) => t.textId)).not.toContain('text:es:story-known');
  });

  it('corpusCanPrepare is false, with a limitation naming the uncovered gaps, when no available text addresses them', async () => {
    const h = createHarness();
    await buildSpanish(h.store); // no text contains amó / mundo
    await buildSpanishScripture(h.store);
    const r = await h.golearn.scriptureReadiness(U, ES_JOHN);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.preparatoryTexts.map((t) => t.textId)).not.toContain(ES_JOHN);
    // story-01 covers creer / Dios, so it can prepare some gaps; "mundo" and "amar" remain uncovered
    expect(r.limitation).toMatch(/No published text in the library contains: .*(amar|mundo)/);
    const h2 = createHarness();
    await buildSpanishScripture(h2.store);
    const none = await h2.golearn.scriptureReadiness(U, ES_JOHN);
    expect(none.corpusCanPrepare).toBe(false);
    expect(none.preparatoryTexts).toEqual([]);
    expect(none.limitation).toContain('No published text in the library contains');
    for (const g of none.gaps) expect(none.limitation).toContain(g.surface);
  });

  it('unpublished preparatory texts are excluded (and named as waiting) unless includeUnpublished', async () => {
    const h = createHarness();
    await buildSpanishScripture(h.store);
    await buildSpanishPrep(h.store);
    await h.store.texts.put({ ...(await h.store.texts.get(ES_PREP))!, published: false, unpublishedReasons: ['needs native review'] } as Text);
    const gated = await h.golearn.scriptureReadiness(U, ES_JOHN);
    expect(gated.preparatoryTexts.map((t) => t.textId)).not.toContain(ES_PREP);
    expect(gated.corpusCanPrepare).toBe(false);
    expect(gated.limitation).toMatch(/1 unpublished text\(s\) do, and are waiting for review/);
    const preview = await h.golearn.scriptureReadiness(U, ES_JOHN, undefined, { includeUnpublished: true });
    expect(preview.preparatoryTexts.map((t) => t.textId)).toContain(ES_PREP);
    expect(preview.corpusCanPrepare).toBe(true);
  });

  it('respects a sentence subset', async () => {
    const h = await setupReadiness();
    const r = await h.golearn.scriptureReadiness(U, ES_JOHN, [`${ES_JOHN}/s1`]);
    expect(r.sentenceIds).toEqual([`${ES_JOHN}/s1`]);
    expect(r.unfamiliarForms.map((u) => u.surface)).not.toContain('Todo');
  });

  it('a retired sentence of the passage is not part of its gaps, and a retired sentence of a prep text does not make it preparatory', async () => {
    const h = await setupReadiness();
    await replaceSentence(h, ES_JOHN, 1, 'zz-new', ['Dios', 'cree']); // the "amó el mundo" verse is edited away
    const r = await h.golearn.scriptureReadiness(U, ES_JOHN);
    expect(r.gaps.map((g) => g.itemId)).not.toContain(LEMMA('amar'));
    const h2 = await setupReadiness();
    await replaceSentence(h2, ES_PREP, 0, 'zz-a', ['nada']);
    await replaceSentence(h2, ES_PREP, 1, 'zz-b', ['nada']);
    const r2 = await h2.golearn.scriptureReadiness(U, ES_JOHN);
    expect(r2.preparatoryTexts.map((t) => t.textId)).not.toContain(ES_PREP);
  });
});

describe('retired sentences: their tokens stay in the store as history but never count', () => {
  it('coverage, readingProgress and the recommendation scorer use live sentences only', async () => {
    const h = createHarness();
    await h.seed(U, 'honduras-es');
    const mk = (slug: string, sentences: string[][]) => buildFixtureText(h.store, {
      lang: 'es', slug, sentences: sentences.map((ws) => ({ tokens: ws.map((w) => ({ surface: w, lemma: w, pos: 'NOUN' as const })) })),
    });
    await mk('base', [['aa', 'bb'], ['cc']]);
    await mk('target', [['aa', 'bb'], ['zz1', 'zz2', 'zz3']]); // s1 is about to be retired
    await mk('later', [['cc'], ['aa']]);
    for (const s of ['s1', 's2']) await h.understood(U, 'es', 'text:es:base', [0, 1], s);
    await h.complete(U, 'es', 'text:es:base', 's2');
    const target = 'text:es:target';
    await h.view(U, 'es', target, 1, 'old'); // read before the edit
    const replacement = await replaceSentence(h, target, 1, 'edited', ['aa']);
    // the retired sentence's tokens are still stored
    expect((await h.store.tokens.where('textId', target)).some((t) => t.surface === 'zz1')).toBe(true);

    const cov = await h.golearn.coverage(U, target);
    expect(cov.sentenceIds).toEqual([`${target}/s0`, replacement]);
    expect(cov.wordTokens).toBe(3); // aa bb aa — not the three "zz" words
    expect(cov.knownLexicalCoverage).toBe(1);
    expect(cov.band).toBe('comfortable');
    expect(cov.newItems).toEqual([]);

    const r = await h.golearn.scriptureReadiness(U, target);
    expect(r.sentenceIds).toEqual(cov.sentenceIds);
    expect(r.gaps).toEqual([]);
    expect(r.unfamiliarForms).toEqual([]);

    // viewing only the retired sentence is not progress; the live ones are what count
    let p = await h.golearn.readingProgress(U, target);
    expect(p).toMatchObject({ sentencesTotal: 2, sentencesViewed: 0 });
    expect(p.completedAt).toBeUndefined();
    await h.view(U, 'es', target, 0, 'new');
    await h.view(U, 'es', target, 0, 'new2'); // a second view of s0 changes nothing
    p = await h.golearn.readingProgress(U, target);
    expect(p).toMatchObject({ sentencesTotal: 2, sentencesViewed: 1 });

    // the scorer sees a comfortable, in-progress text — the retired "zz" words do not make it a stretch
    const recs = await h.golearn.recommend(U, { limit: 10 });
    const rec = recs.find((x) => x.textId === target)!;
    expect(rec).toMatchObject({ reason: 'next-input', band: 'comfortable' });
    expect(rec.explanation).toContain('1 of 2');
    expect(recs.find((x) => x.textId === 'text:es:later')).toMatchObject({ band: 'comfortable' });
  });
});
