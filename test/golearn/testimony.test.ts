import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import { createHarness } from './harness';
import { ES_JOHN, ES_PREP, ES_STORY, buildSpanish, buildSpanishPrep, buildSpanishScripture } from './fixtures';

const U = 'u1';
const TST = 'text:es:testimony-rev1';
const F = (w: string) => ids.form('es', w);

async function buildTestimony(h: ReturnType<typeof createHarness>) {
  await buildFixtureText(h.store, {
    lang: 'es', slug: 'testimony-rev1', kind: 'testimony', corpusId: 'testimony-es',
    sentences: [{ tokens: [
      { surface: 'Dios', lemma: 'Dios', pos: 'PROPN' }, { surface: 'perdona', lemma: 'perdonar', pos: 'VERB' },
      { surface: 'el', lemma: 'el', pos: 'DET' }, { surface: 'pecado', lemma: 'pecado', pos: 'NOUN' }, { surface: '.', isWord: false },
    ] }],
  });
}

describe('testimony texts', () => {
  it('reading and coverage work on the learner\'s own text; encounters use the testimony surface', async () => {
    const h = createHarness();
    await buildTestimony(h);
    await h.view(U, 'es', TST, 0);
    const encs = await h.store.encounters.where('userId', U);
    expect(encs.length).toBeGreaterThan(0);
    expect(encs.every((e) => e.surface === 'testimony' && e.modality === 'reading')).toBe(true);
    const cov = await h.golearn.coverage(U, TST);
    expect(cov.wordTokens).toBe(4);
    expect(cov.partialCoverage).toBe(1);
  });

  it('hearing his own sentence is listening evidence only — never writing or speaking', async () => {
    const h = createHarness();
    await buildTestimony(h);
    await h.listen(U, 'es', TST, [0], { session: 'l1' });
    const rows = await h.store.learnerItems.where('userId', U);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.listening.level).not.toBe('unseen');
      for (const d of [r.writing, r.speaking]) expect(d).toEqual({ level: 'unseen', confidence: 0, evidence: 0, exposures: 0, estimatedFamiliar: false, unassisted: 0, assisted: 0 });
    }
    for (const e of await h.store.encounters.where('userId', U)) {
      expect(e.modality).toBe('listening');
      expect(e.productionKind).toBeUndefined();
    }
    const k = await h.golearn.queryItem(U, { surface: 'pecado', lang: 'es' });
    expect(k.productionEvidence).toEqual({ independent: 0, selfRepaired: 0, assisted: 0, copied: 0 });
  });

  it('is never recommended as reading material, and never a preparatory text', async () => {
    const h = createHarness();
    await h.seed(U, 'honduras-es');
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    await buildSpanishPrep(h.store);
    await buildTestimony(h);
    for (const s of ['s1', 's2', 's3']) for (let i = 0; i < 4; i++) await h.view(U, 'es', ES_STORY, i, s);
    for (const s of ['t1', 't2', 't3']) await h.view(U, 'es', TST, 0, s); // fully known, unread-friendly: would be an easy story
    await h.store.testimonies.put({ id: 'tst1', userId: U, lang: 'es', title: 'Mi historia', createdAt: '2026-01-01T00:00:00.000Z', currentRevisionId: 'tst1/r1' });
    const recs = await h.golearn.recommend(U, { targetTextId: ES_JOHN, limit: 20 });
    expect(recs.some((r) => r.textId === TST)).toBe(false);
    expect(recs.find((r) => r.reason === 'rehearse-testimony')?.testimonyId).toBe('tst1');
    const r = await h.golearn.scriptureReadiness(U, ES_JOHN);
    expect(r.preparatoryTexts.map((t) => t.textId)).toContain(ES_PREP);
    expect(r.preparatoryTexts.map((t) => t.textId)).not.toContain(TST);
    expect(r.preparatoryTexts.every((t) => typeof t.generated === 'boolean')).toBe(true);
  });

  it('even a testimony that contains every prerequisite is excluded from preparatory texts', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    await buildFixtureText(h.store, {
      lang: 'es', slug: 'testimony-amo', kind: 'testimony', corpusId: 'testimony-es',
      sentences: [{ tokens: [{ surface: 'amo', lemma: 'amar', pos: 'VERB' }, { surface: 'mundo', lemma: 'mundo', pos: 'NOUN' }] }],
    });
    const r = await h.golearn.scriptureReadiness(U, ES_JOHN);
    expect(r.prerequisites.map((p) => p.itemId)).toContain(ids.lemma('es', 'amar', 'VERB'));
    expect(r.preparatoryTexts.map((t) => t.textId)).not.toContain('text:es:testimony-amo');
  });
});

describe('productionKind on production encounters', () => {
  it('is stored on the encounter and used to decode productionEvidence', async () => {
    const h = createHarness();
    await h.produce(U, 'es', F('creo'), 'self-repaired');
    await h.produce(U, 'es', F('creo'), 'assisted', { session: 'p2', revisionId: 'rev2' });
    const encs = (await h.store.encounters.where('itemId', F('creo'))).sort((a, b) => (a.at < b.at ? -1 : 1));
    expect(encs.map((e) => e.productionKind)).toEqual(['self-repaired', 'assisted']);
    expect(encs.map((e) => e.assistance)).toEqual([1, 3]); // still populated
    // productionKind wins over the assistance fallback
    await h.store.encounters.put({ ...encs[1], assistance: 0 });
    const k = await h.golearn.queryItem(U, { itemId: F('creo'), lang: 'es' });
    expect(k.productionEvidence).toEqual({ independent: 0, selfRepaired: 1, assisted: 1, copied: 0 });
  });
});
