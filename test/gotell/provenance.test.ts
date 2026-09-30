/**
 * Production provenance (evidence policy v2, rule 6): the matrix.
 *   - checking (submitDraft) records nothing
 *   - evidence for an (item, sentenceHash) pair is recorded once, ever - across revisions, re-saves and re-checks
 *   - independent only when the learner's own wording had the item before any suggestion for that sentence was shown
 *   - accepted => assisted; edited after a suggestion => assisted; typed after a suggestion showed it => copied;
 *     changed by the learner without the suggested wording => self-repaired
 */
import { describe, expect, it } from 'vitest';
import { hash, ids } from '../../src/core';
import type { IndependentProductionDetected, ProductionRecorded } from '../../src/core';
import { makeWorld } from './fakes';
import type { World } from './fakes';
import { esAdapter, esStoryA } from './fixtures';

const produced = async (w: World, userId = 'A') => (await w.bus.history({ userId, types: ['ProductionRecorded'] })) as ProductionRecorded[];
const kindOf = (evs: ProductionRecorded[], itemId: string) => evs.filter((e) => e.itemId === itemId).map((e) => e.kind);

async function setup() {
  const w = await makeWorld([esAdapter()]);
  await esStoryA(w, 'A');
  const t = await w.gotell.getOrCreateTestimony('A', 'es');
  return { w, t };
}

describe('checking records nothing', () => {
  it('submitDraft (and every re-check) produces no ProductionRecorded / IndependentProductionDetected', async () => {
    const { w, t } = await setup();
    for (let i = 0; i < 3; i++) await w.gotell.submitDraft(t.id, 'Yo no sé. El casa.');
    expect(await produced(w)).toEqual([]);
    expect(await w.bus.history({ userId: 'A', types: ['IndependentProductionDetected'] })).toEqual([]);
    expect((await w.store.revisions.count())).toBe(0);
  });

  it('a re-check neither duplicates the "shown" event nor moves the moment the suggestion was first shown', async () => {
    const { w, t } = await setup();
    const first = await w.gotell.submitDraft(t.id, 'El casa.');
    const shownAt = (await w.store.suggestions.get(first.suggestions[0].id))!.createdAt;
    await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.submitDraft(t.id, 'El casa.');
    expect((await w.store.suggestions.get(first.suggestions[0].id))!.createdAt).toBe(shownAt);
    expect(await w.bus.history({ userId: 'A', types: ['GoTellSuggestionShown'] })).toHaveLength(1);
  });
});

describe('the matrix', () => {
  it('independent: no suggestion was ever shown for the sentence', async () => {
    const { w, t } = await setup();
    await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    const evs = await produced(w);
    expect(evs.length).toBeGreaterThan(0);
    expect(new Set(evs.map((e) => e.kind))).toEqual(new Set(['independent']));
    expect(evs.every((e) => e.modality === 'writing' && e.sentenceHash === hash('Yo no sé.') && e.sentenceText === 'Yo no sé.')).toBe(true);
  });

  it('independent only for wording he had BEFORE the suggestion; assisted for the accepted part', async () => {
    const { w, t } = await setup();
    const a = await w.gotell.submitDraft(t.id, 'El casa grande.');
    await w.gotell.acceptSuggestion(a.suggestions[0].id);
    await w.gotell.acceptRevision(t.id, 'la casa grande.');
    const evs = await produced(w);
    expect(kindOf(evs, ids.form('es', 'la'))).toEqual(['assisted']);
    expect(kindOf(evs, ids.form('es', 'casa'))).toEqual(['independent']);
    expect(kindOf(evs, ids.form('es', 'grande'))).toEqual(['independent']); // it was in his draft when the suggestion was shown
  });

  it('typed after the suggestion showed it (not accepted) => copied', async () => {
    const { w, t } = await setup();
    await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.acceptRevision(t.id, 'la casa.');
    expect(kindOf(await produced(w), ids.form('es', 'la'))).toEqual(['copied']);
  });

  it('changed by the learner without the suggested wording => self-repaired', async () => {
    const { w, t } = await setup();
    await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.acceptRevision(t.id, 'una casa.');
    const evs = await produced(w);
    expect(kindOf(evs, ids.form('es', 'una'))).toEqual(['self-repaired']);
    expect(kindOf(evs, ids.form('es', 'casa'))).toEqual(['independent']);
  });

  it('edited after the suggestion => assisted for what came from it, self-repaired for what he added', async () => {
    const { w, t } = await setup();
    const a = await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.editSuggestion(a.suggestions[0].id, 'la casa grande.');
    await w.gotell.acceptRevision(t.id, 'la casa grande.');
    const evs = await produced(w);
    expect(kindOf(evs, ids.form('es', 'la'))).toEqual(['assisted']);
    expect(kindOf(evs, ids.form('es', 'grande'))).toEqual(['self-repaired']);
  });

  it('a word added to the sentence AFTER a suggestion was shown is not "independent", even if no suggestion offered it', async () => {
    const { w, t } = await setup();
    await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.acceptRevision(t.id, 'la casa grande.');
    const evs = await produced(w);
    expect(kindOf(evs, ids.form('es', 'la'))).toEqual(['copied']);
    expect(kindOf(evs, ids.form('es', 'grande'))).toEqual(['self-repaired']);
    expect(kindOf(evs, ids.form('es', 'casa'))).toEqual(['independent']);
  });

  it('the earliest suggestion for the sentence sets "his own wording", even after later re-checks of an edited draft', async () => {
    const { w, t } = await setup();
    await w.gotell.submitDraft(t.id, 'El casa.'); // shown for "El casa."
    const second = await w.gotell.submitDraft(t.id, 'El casa grande.'); // he added "grande" after seeing it
    await w.gotell.acceptSuggestion(second.suggestions[0].id);
    await w.gotell.acceptRevision(t.id, 'la casa grande.');
    const evs = await produced(w);
    expect(kindOf(evs, ids.form('es', 'grande'))).toEqual(['self-repaired']);
    expect(kindOf(evs, ids.form('es', 'la'))).toEqual(['assisted']);
    expect(kindOf(evs, ids.form('es', 'casa'))).toEqual(['independent']);
  });

  it('a rejected suggestion and an uncorrected error record nothing for the erroneous span', async () => {
    const { w, t } = await setup();
    const a = await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.rejectSuggestion(a.suggestions[0].id);
    await w.gotell.acceptRevision(t.id, 'El casa.');
    expect(await produced(w)).toEqual([]);
  });

  it('every record carries the sentence hash, and evidence is per (item, sentence): the same word in another sentence counts again', async () => {
    const { w, t } = await setup();
    await w.gotell.acceptRevision(t.id, 'Yo no sé. Yo no sé mucho.');
    const evs = await produced(w);
    expect(evs.every((e) => e.sentenceHash === hash(e.sentenceText))).toBe(true);
    expect(evs.filter((e) => e.itemId === ids.form('es', 'yo')).map((e) => e.sentenceHash).sort()).toEqual([hash('Yo no sé.'), hash('Yo no sé mucho.')].sort());
  });
});

describe('once per (item, sentenceHash), ever', () => {
  it('re-saving the identical text adds no version and no evidence', async () => {
    const { w, t } = await setup();
    await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    const n = (await produced(w)).length;
    await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    expect((await produced(w)).length).toBe(n);
    expect(await w.gotell.listRevisions(t.id)).toHaveLength(1);
  });

  it('the same sentence in a later revision records no new evidence', async () => {
    const { w, t } = await setup();
    await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    const afterFirst = await produced(w);
    await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa.');
    const afterSecond = await produced(w);
    expect(kindOf(afterSecond, ids.form('es', 'yo'))).toHaveLength(1);
    const forFirstSentence = (evs: ProductionRecorded[]) => evs.filter((e) => e.sentenceHash === hash('Yo no sé.')).length;
    expect(forFirstSentence(afterSecond)).toBe(forFirstSentence(afterFirst));
    expect(afterSecond.length).toBeGreaterThan(afterFirst.length); // "La casa." is new
  });

  it('going back to an earlier text (a third revision) records nothing new and announces no independent production', async () => {
    const { w, t } = await setup();
    await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    await w.gotell.acceptRevision(t.id, 'La casa.');
    const before = (await produced(w)).length;
    const indBefore = (await w.bus.history({ userId: 'A', types: ['IndependentProductionDetected'] })).length;
    const r3 = await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    expect(r3.number).toBe(3);
    expect((await produced(w)).length).toBe(before);
    const ind = (await w.bus.history({ userId: 'A', types: ['IndependentProductionDetected'] })) as IndependentProductionDetected[];
    expect(ind).toHaveLength(indBefore); // nothing was newly independent in revision 3
  });

  it('a sentence first credited as assisted is not credited again when it reappears, even if typed fresh', async () => {
    const { w, t } = await setup();
    const a = await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.acceptSuggestion(a.suggestions[0].id);
    await w.gotell.acceptRevision(t.id, 'la casa.');
    const n = (await produced(w)).length;
    await w.gotell.acceptRevision(t.id, 'la casa. Yo no sé.');
    await w.gotell.acceptRevision(t.id, 'la casa.');
    const evs = await produced(w);
    expect(kindOf(evs, ids.form('es', 'la'))).toEqual(['assisted']);
    expect(evs.filter((e) => e.sentenceHash === hash('la casa.')).length).toBe(n);
  });

  it('re-checking between saves changes nothing about what is credited', async () => {
    const { w, t } = await setup();
    await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.acceptRevision(t.id, 'una casa.');
    const evs = await produced(w);
    await w.gotell.submitDraft(t.id, 'una casa.');
    await w.gotell.acceptRevision(t.id, 'una casa. La casa.');
    const after = await produced(w);
    expect(kindOf(after, ids.form('es', 'una'))).toEqual(kindOf(evs, ids.form('es', 'una')));
  });
});
