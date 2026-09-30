import { describe, expect, it } from 'vitest';
import { hash, ids } from '../../src/core';
import type { EnsureAudioResult, IndependentProductionDetected, ProductionRecorded } from '../../src/core';
import { testimonySlug } from '../../src/gotell';
import { makeWorld } from './fakes';
import type { World } from './fakes';
import { esAdapter, esStoryA } from './fixtures';

const produced = async (w: World, userId: string) =>
  (await w.bus.history({ userId, types: ['ProductionRecorded'] })) as ProductionRecorded[];
const byItem = (evs: ProductionRecorded[], itemId: string) => evs.filter((e) => e.itemId === itemId);

async function setup(extra: Parameters<typeof makeWorld>[1] = {}) {
  const w = await makeWorld([esAdapter()], extra);
  await esStoryA(w, 'A');
  const t = await w.gotell.getOrCreateTestimony('A', 'es');
  return { w, t };
}

describe('acceptRevision: classification and events', () => {
  it('learner-typed sentence with no suggestion => independent (form + lemma), plus IndependentProductionDetected', async () => {
    const { w, t } = await setup();
    const rev = await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    const evs = await produced(w, 'A');
    expect(evs.length).toBeGreaterThan(0);
    expect(evs.every((e) => e.kind === 'independent' && e.modality === 'writing' && e.revisionId === rev.id)).toBe(true);
    expect(evs.map((e) => e.itemId)).toEqual(expect.arrayContaining([ids.form('es', 'yo'), ids.lemma('es', 'yo', 'PRON'), ids.form('es', 'no'), ids.form('es', 'sé')]));
    expect(evs.every((e) => e.sentenceText === 'Yo no sé.')).toBe(true);
    const ind = (await w.bus.history({ userId: 'A', types: ['IndependentProductionDetected'] })) as IndependentProductionDetected[];
    expect(ind).toHaveLength(1);
    expect(ind[0].revisionId).toBe(rev.id);
    expect(ind[0].itemIds).toEqual(expect.arrayContaining([ids.form('es', 'sé')]));
    expect((await w.bus.history({ userId: 'A', types: ['TestimonyRevisionAccepted'] }))).toHaveLength(1);
  });

  it('accepted suggestion => assisted for the introduced item (with suggestionId), independent for the learner\'s own', async () => {
    const { w, t } = await setup();
    const a = await w.gotell.submitDraft(t.id, 'El casa.');
    const s = a.suggestions[0];
    await w.gotell.acceptSuggestion(s.id);
    const rev = await w.gotell.acceptRevision(t.id, s.suggested);
    const evs = await produced(w, 'A');
    const la = byItem(evs, ids.form('es', 'la'));
    expect(la).toHaveLength(1);
    expect(la[0].kind).toBe('assisted');
    expect(la[0].suggestionId).toBe(s.id);
    expect(byItem(evs, ids.form('es', 'casa'))[0].kind).toBe('independent');
    expect(rev.acceptedSuggestionIds).toEqual([s.id]);
    const ind = (await w.bus.history({ userId: 'A', types: ['IndependentProductionDetected'] })) as IndependentProductionDetected[];
    expect(ind[0].itemIds).toContain(ids.form('es', 'casa'));
    expect(ind[0].itemIds).not.toContain(ids.form('es', 'la'));
    const accepted = (await w.bus.history({ userId: 'A', types: ['GoTellSuggestionAccepted'] }));
    expect(accepted).toHaveLength(1);
    expect((await w.store.suggestions.get(s.id))!.status).toBe('accepted');
  });

  it('the learner fixes it himself with his own wording => self-repaired', async () => {
    const { w, t } = await setup();
    await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.acceptRevision(t.id, 'una casa.');
    const evs = await produced(w, 'A');
    expect(byItem(evs, ids.form('es', 'una'))[0].kind).toBe('self-repaired');
    expect(byItem(evs, ids.form('es', 'casa'))[0].kind).toBe('independent');
  });

  it('typing the suggested word himself after seeing it => copied (not independent)', async () => {
    const { w, t } = await setup();
    const a = await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.acceptRevision(t.id, 'la casa.');
    const la = byItem(await produced(w, 'A'), ids.form('es', 'la'));
    expect(la[0].kind).toBe('copied');
    expect(la[0].suggestionId).toBe(a.suggestions[0].id);
  });

  it('edited suggestion: parts from the suggestion are assisted, the learner\'s additions are self-repaired', async () => {
    const { w, t } = await setup();
    const a = await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.editSuggestion(a.suggestions[0].id, 'la casa grande.');
    const rev = await w.gotell.acceptRevision(t.id, 'la casa grande.');
    const evs = await produced(w, 'A');
    expect(byItem(evs, ids.form('es', 'la'))[0].kind).toBe('assisted');
    expect(byItem(evs, ids.form('es', 'grande'))[0].kind).toBe('self-repaired');
    expect(byItem(evs, ids.form('es', 'casa'))[0].kind).toBe('independent');
    expect(rev.acceptedSuggestionIds).toEqual([a.suggestions[0].id]);
    expect((await w.store.suggestions.get(a.suggestions[0].id))!.status).toBe('edited');
    expect(await w.bus.history({ userId: 'A', types: ['GoTellSuggestionEdited'] })).toHaveLength(1);
  });

  it('rejected suggestion and an uncorrected error record no evidence for the erroneous span', async () => {
    const { w, t } = await setup();
    const a = await w.gotell.submitDraft(t.id, 'El casa.');
    await w.gotell.rejectSuggestion(a.suggestions[0].id);
    await w.gotell.acceptRevision(t.id, 'El casa.');
    const evs = await produced(w, 'A');
    expect(evs).toEqual([]);
    expect(await w.bus.history({ userId: 'A', types: ['IndependentProductionDetected'] })).toEqual([]);
    expect(await w.bus.history({ userId: 'A', types: ['GoTellSuggestionRejected'] })).toHaveLength(1);
  });

  it('the same sentence saved again does not double-count evidence', async () => {
    const { w, t } = await setup();
    await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    const before = (await produced(w, 'A')).length;
    await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa.');
    const evs = await produced(w, 'A');
    expect(byItem(evs, ids.form('es', 'yo'))).toHaveLength(1);
    expect(evs.length).toBeGreaterThan(before);
  });

  it('classification only ever writes the writing modality and never touches suggestion-free items as assisted', async () => {
    const { w, t } = await setup();
    await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa.');
    expect((await produced(w, 'A')).every((e) => e.modality === 'writing' && e.kind === 'independent')).toBe(true);
  });
});

describe('revision history', () => {
  it('revisions are immutable, numbered, linked; identical re-save is a no-op', async () => {
    const { w, t } = await setup();
    const r1 = await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    const snapshot = structuredClone(r1);
    const r2 = await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa.');
    expect([r1.number, r2.number]).toEqual([1, 2]);
    expect(r1.id).toBe(ids.revision(t.id, 1));
    expect(r2.parentRevisionId).toBe(r1.id);
    expect(r1.parentRevisionId).toBeUndefined();

    const list = await w.gotell.listRevisions(t.id);
    expect(list.map((r) => r.id)).toEqual([r1.id, r2.id]);
    expect(list[0]).toEqual(snapshot); // revision 1 never overwritten
    expect(list[1].sentences.map((s) => s.textHash)).toEqual(['Yo no sé.', 'La casa.'].map((x) => hash(x)));
    expect(list[1].sentences.map((s) => s.index)).toEqual([0, 1]);
    expect((await w.store.testimonies.get(t.id))!.currentRevisionId).toBe(r2.id);

    // mutating a returned object cannot change history
    (r1 as { fullText: string }).fullText = 'tampered';
    expect((await w.gotell.listRevisions(t.id))[0].fullText).toBe('Yo no sé.');

    const again = await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa.');
    expect(again.id).toBe(r2.id);
    expect(await w.gotell.listRevisions(t.id)).toHaveLength(2);
    expect(await w.bus.history({ userId: 'A', types: ['TestimonyRevisionAccepted'] })).toHaveLength(2);
  });

  it('going back to an older text creates a new revision (history only grows)', async () => {
    const { w, t } = await setup();
    await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    await w.gotell.acceptRevision(t.id, 'La casa.');
    const r3 = await w.gotell.acceptRevision(t.id, 'Yo no sé.');
    expect(r3.number).toBe(3);
    expect(await w.gotell.listRevisions(t.id)).toHaveLength(3);
  });

  it('sentences carry an optional semantic section tag (metadata)', async () => {
    const { w, t } = await setup();
    const r = await w.gotell.acceptRevision(t.id, 'Me arrepentí. La casa.');
    expect(r.sentences[0].section).toBe('repentance');
    expect(r.sentences[0].sectionConfidence).toBeGreaterThan(0);
    expect(r.sentences[1].section).toBeUndefined();
  });
});

describe('diffRevisions', () => {
  it('reports same / changed / added / removed at sentence level', async () => {
    const { w, t } = await setup();
    const r1 = await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa.');
    const r2 = await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa grande. Cuando yo era joven.');
    expect(await w.gotell.diffRevisions(r1.id, r2.id)).toEqual([
      { kind: 'same', a: 'Yo no sé.', b: 'Yo no sé.' },
      { kind: 'changed', a: 'La casa.', b: 'La casa grande.' },
      { kind: 'added', b: 'Cuando yo era joven.' },
    ]);
    expect(await w.gotell.diffRevisions(r2.id, r1.id)).toEqual([
      { kind: 'same', a: 'Yo no sé.', b: 'Yo no sé.' },
      { kind: 'changed', a: 'La casa grande.', b: 'La casa.' },
      { kind: 'removed', a: 'Cuando yo era joven.' },
    ]);
    expect((await w.gotell.diffRevisions(r1.id, r1.id)).every((d) => d.kind === 'same')).toBe(true);
  });
});

describe('GoListen hook', () => {
  it('calls ensureAudio(revision.textId, { runNow: false }) once per new revision and survives failures', async () => {
    const calls: Array<[string, unknown]> = [];
    let fail = false;
    const golisten = {
      async ensureAudio(textId: string, opts?: unknown) {
        calls.push([textId, opts]);
        if (fail) throw new Error('tts down');
        return {} as EnsureAudioResult;
      },
    };
    const { w, t } = await setup({ golisten });
    const rev = await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa.');
    expect(rev.textId).toBe(ids.text('es', testimonySlug('A', 1)));
    expect(calls).toEqual([[rev.textId, { runNow: false }]]);
    fail = true;
    const rev2 = await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa grande.');
    expect(rev2.textId).toBeDefined();
    expect(await w.gotell.listRevisions(t.id)).toHaveLength(2); // stored even though audio failed
    await w.gotell.acceptRevision(t.id, 'Yo no sé. La casa grande.'); // identical -> no new audio call
    expect(calls).toHaveLength(2);
  });
});
