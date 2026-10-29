// @vitest-environment jsdom
/**
 * Knowledge-loading completeness (B1). loadReviewModel asks the Repository for the knowledge of every candidate and deck unit in
 * batches of KNOWLEDGE_BATCH. A batch that fails (a non-ok answer, a thrown network error) used to be dropped silently, so its
 * units had no row and were read as New: "zero eligible new admissions" with no explanation. Now the load says what it could not
 * resolve (knowledgeStatus), fills the gap from the last complete snapshot where it can, withholds the rest from AUTOMATIC
 * admission with a stable code (withheld), and never replaces the last complete snapshot with a partial load.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ApiResult } from '../../packages/repository-service/src/api';
import { planCurrentDeck } from '../../packages/goreview/app/deckModel';
import { readSnapshot } from '../../packages/goreview/app/snapshot';
import { KNOWLEDGE_BATCH, loadReviewModel, type ReviewModel } from '../../packages/goreview/app/workspace';
import { candidate, defaultService, destroyRigs, dueCard, ids, knowledgeRow, makeRig, seed, unitOf, type FakeService, type Rig } from './helpers';

afterEach(() => destroyRigs());

const T1 = '2026-10-08T10:05:00.000Z';
const T2 = '2026-10-08T10:10:00.000Z';
const T3 = '2026-10-08T10:15:00.000Z';

type Answer = 'ok' | number | 'throw';
/** What the next knowledge batches get, decided per batch from the unit ids it asks for. */
const behaviour: { of: (ids: string[]) => Answer } = { of: () => 'ok' };

/** Two groups of candidates: `first` (high scores, the first batch) and `rest` (lower scores, the second batch). Batch size is the real constant. */
const FIRST = Array.from({ length: KNOWLEDGE_BATCH }, (_, i) => `a${String(i).padStart(3, '0')}`);
const REST = Array.from({ length: 50 }, (_, i) => `b${String(i).padStart(3, '0')}`);
const unitsOf = (labels: string[]): string[] => labels.map((l) => unitOf(l));

async function setup(opts: { withDueCard?: boolean } = {}): Promise<Rig> {
  const service: FakeService = defaultService();
  const original = service.api.bind(service);
  service.api = (token?: string) => {
    const api = original(token);
    const knowledge = api.knowledge.bind(api);
    api.knowledge = (async (unitIds?: string[]) => {
      const answer = behaviour.of(unitIds ?? []);
      if (answer === 'throw') throw new Error('network down');
      if (answer !== 'ok') return { ok: false, status: answer, error: 'error', message: 'bad gateway', body: {} } satisfies ApiResult<never>;
      return knowledge(unitIds);
    }) as typeof api.knowledge;
    return api;
  };
  behaviour.of = () => 'ok';
  const rig = await makeRig({ service, signedIn: true });
  const candidates = [
    ...FIRST.map((l, i) => candidate(l, 0.9 - i * 0.001)),
    ...REST.map((l, i) => candidate(l, 0.3 - i * 0.001)),
  ];
  service.candidates.set('L1-e1', candidates);
  service.knowledge.set('L1', candidates.map((c) => ({ ...knowledgeRow('L1', c.unitId, 'sq', {}), level: 'recognized' as const })));
  await rig.app.ctx.state.setPrefs('L1', { languageId: 'sq', maxNew: 5, sessionMinutes: 10, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true });
  if (opts.withDueCard) await seed(rig, dueCard(ids('L1', 'sq'), 'zog', 'meaning-to-form'));
  return rig;
}

const loadAt = async (rig: Rig, at: string): Promise<ReviewModel> => {
  rig.clock.set(at);
  const model = await loadReviewModel(rig.app.ctx);
  if (!model) throw new Error('no model');
  return model;
};
const snapshotModel = async (rig: Rig) => (await readSnapshot(rig.app.ctx, 'L1', 'sq'))?.model;
/** The batch that carries the FIRST group's unit ids (candidates come first, in service order). */
const failFirstBatch = (answer: Answer) => (unitIds: string[]): Answer => (unitIds.includes(unitOf(FIRST[0])) ? answer : 'ok');
const admitted = (model: ReviewModel): string[] => model.outcomes.filter((o) => o.decision === 'test-now').map((o) => o.unitId);

describe('knowledge loading: every batch answers', () => {
  it('(a) is live: nothing is missing, the status counts every requested unit, and the snapshot is written', async () => {
    const rig = await setup();
    const model = await loadAt(rig, T1);
    expect(model.candidateSource).toBe('live');
    expect(model.knowledgeStatus).toMatchObject({ source: 'live', requested: FIRST.length + REST.length, resolved: FIRST.length + REST.length, missing: [], fetchedAt: T1 });
    expect(model.withheld).toEqual([]);
    expect(model.candidateNote).toBeUndefined();
    expect(admitted(model).length).toBe(5);
    const snap = await snapshotModel(rig);
    expect(snap?.savedAt).toBe(T1);
    expect(snap?.knowledge.length).toBe(FIRST.length + REST.length);
  });
});

describe('knowledge loading: a batch fails', () => {
  it('(b) a non-ok answer: partial, the failed units are withheld with a stable code, the others stay eligible, the previous snapshot is kept', async () => {
    const rig = await setup();
    // an earlier complete load whose snapshot has NO row for the first group (the service did not know them then)
    const original = rig.service.knowledge.get('L1')!;
    rig.service.knowledge.set('L1', original.filter((k) => !unitsOf(FIRST).includes(k.unitId)));
    await loadAt(rig, T1);
    const before = await snapshotModel(rig);
    expect(before?.savedAt).toBe(T1);
    rig.service.knowledge.set('L1', original);

    behaviour.of = failFirstBatch(502);
    const model = await loadAt(rig, T2);
    expect(model.candidateSource).toBe('live');
    expect(model.knowledgeStatus.source).toBe('partial');
    expect(model.knowledgeStatus.requested).toBe(FIRST.length + REST.length);
    expect(model.knowledgeStatus.missing.sort()).toEqual(unitsOf(FIRST).sort());
    expect(model.knowledgeStatus.resolved).toBe(REST.length);
    expect(model.knowledgeStatus.fetchedAt).toBe(T2);
    // withheld: stable code, an explanation, and not one of them is admitted or even proposed
    expect(model.withheld.map((w) => w.unitId).sort()).toEqual(unitsOf(FIRST).sort());
    expect(new Set(model.withheld.map((w) => w.code))).toEqual(new Set(['knowledge-unresolved']));
    expect(model.withheld.every((w) => w.detail.length > 10)).toBe(true);
    expect(model.outcomes.some((o) => unitsOf(FIRST).includes(o.unitId))).toBe(false);
    // the other candidates are still eligible
    const adm = admitted(model);
    expect(adm.length).toBe(5);
    expect(adm.every((u) => unitsOf(REST).includes(u))).toBe(true);
    const deck = await planCurrentDeck(rig.app.ctx, model);
    expect(deck.plan.items.length).toBeGreaterThan(0);
    expect(deck.plan.items.every((p) => unitsOf(REST).includes(p.item.unitId))).toBe(true);
    // the note says how many and why
    expect(model.candidateNote).toContain(`Knowledge for ${FIRST.length} words could not be loaded`);
    expect(model.candidateNote).toContain('502');
    expect(model.candidateNote).toContain(`${FIRST.length} new admissions are withheld`);
    expect(model.knowledgeStatus.note).toBe(model.candidateNote);
    // the last complete snapshot stays as it was
    const after = await snapshotModel(rig);
    expect(after?.savedAt).toBe(T1);
    expect(after?.knowledge.length).toBe(before!.knowledge.length);
  });

  it('(c) a batch that throws (network) is treated the same: no abort, partial, withheld', async () => {
    const rig = await setup();
    await loadAt(rig, T1);
    const before = await snapshotModel(rig);
    // forget the snapshot's rows for the first group so the gap cannot be filled
    const area = rig.deps.area;
    const key = 'gopractice:snapshot:L1:sq';
    const raw = (await area.get(key))[key] as { model: { knowledge: Array<{ unitId: string }> } };
    raw.model.knowledge = raw.model.knowledge.filter((k) => !unitsOf(FIRST).includes(k.unitId));
    await area.set({ [key]: raw });

    behaviour.of = failFirstBatch('throw');
    const model = await loadAt(rig, T2);
    expect(model.candidateSource).toBe('live');
    expect(model.knowledgeStatus.source).toBe('partial');
    expect(model.knowledgeStatus.missing.length).toBe(FIRST.length);
    expect(model.withheld.length).toBe(FIRST.length);
    expect(model.withheld.every((w) => w.code === 'knowledge-unresolved')).toBe(true);
    expect(admitted(model).every((u) => unitsOf(REST).includes(u))).toBe(true);
    expect(admitted(model).length).toBe(5);
    expect(model.candidateNote).toContain('network down');
    expect(model.candidateNote).toContain('withheld');
    expect((await snapshotModel(rig))?.savedAt).toBe(before?.savedAt); // not overwritten by the partial load
  });

  it('(d) with a previous snapshot holding the missing rows: they are used (partial, the snapshot time) and nothing is withheld', async () => {
    const rig = await setup();
    await loadAt(rig, T1);
    behaviour.of = failFirstBatch(502);
    const model = await loadAt(rig, T2);
    expect(model.knowledgeStatus.source).toBe('partial');
    expect(model.knowledgeStatus.missing).toEqual([]);
    expect(model.knowledgeStatus.resolved).toBe(FIRST.length + REST.length);
    expect(model.knowledgeStatus.fetchedAt).toBe(T1);
    expect(model.withheld).toEqual([]);
    expect(model.knowledge.length).toBe(FIRST.length + REST.length);
    // the high-scored candidates of the failed batch are admitted from the earlier knowledge
    expect(admitted(model).every((u) => unitsOf(FIRST).includes(u))).toBe(true);
    expect(admitted(model).length).toBe(5);
    expect(model.candidateNote).toContain('could not be refreshed');
    expect(model.candidateNote).toContain('502');
    expect((await snapshotModel(rig))?.savedAt).toBe(T1); // a partial load never replaces it
  });

  it('(e) after the service comes back, a full load resolves everything, nothing is withheld and the snapshot is updated', async () => {
    const rig = await setup();
    // an earlier complete load that did not know the first group, so the partial load below cannot fill it
    const original = rig.service.knowledge.get('L1')!;
    rig.service.knowledge.set('L1', original.filter((k) => !unitsOf(FIRST).includes(k.unitId)));
    await loadAt(rig, T1);
    rig.service.knowledge.set('L1', original);

    behaviour.of = failFirstBatch(503);
    const partial = await loadAt(rig, T2);
    expect(partial.knowledgeStatus.source).toBe('partial');
    expect(partial.withheld.length).toBe(FIRST.length);
    expect((await snapshotModel(rig))?.savedAt).toBe(T1);

    behaviour.of = () => 'ok';
    const full = await loadAt(rig, T3);
    expect(full.knowledgeStatus).toMatchObject({ source: 'live', missing: [], fetchedAt: T3 });
    expect(full.knowledgeStatus.resolved).toBe(full.knowledgeStatus.requested);
    expect(full.withheld).toEqual([]);
    expect(full.candidateNote).toBeUndefined();
    expect(admitted(full).every((u) => unitsOf(FIRST).includes(u))).toBe(true); // the high scores are back in play
    const snap = await snapshotModel(rig);
    expect(snap?.savedAt).toBe(T3);
    expect(snap?.knowledge.length).toBe(FIRST.length + REST.length);
  });

  it('(f) due deck cards still plan while knowledge is partial: they need no knowledge row', async () => {
    const rig = await setup({ withDueCard: true });
    // the deck unit rides in the LAST batch (after the candidates): fail that one
    const zog = unitOf('zog');
    behaviour.of = (unitIds) => (unitIds.includes(zog) ? 502 : 'ok');
    const model = await loadAt(rig, T1);
    expect(model.knowledgeStatus.source).toBe('partial');
    expect(model.knowledgeStatus.missing).toContain(zog);
    expect(model.withheld.some((w) => w.unitId === zog)).toBe(false); // a scheduled card is not an admission
    expect(model.withheld.length).toBe(REST.length); // the candidates that rode in that batch
    const deck = await planCurrentDeck(rig.app.ctx, model);
    const due = deck.plan.items.filter((p) => p.item.unitId === zog);
    expect(due.length).toBe(1);
    expect(due[0].isNew).toBe(false);
    expect(deck.plan.items.some((p) => unitsOf(REST).includes(p.item.unitId))).toBe(false); // withheld ones are not introduced
  });

  it('every batch failing is reported as unavailable, with every candidate withheld, never as a quiet empty list', async () => {
    const rig = await setup();
    behaviour.of = () => 'throw';
    const model = await loadAt(rig, T1);
    expect(model.knowledgeStatus.source).toBe('unavailable');
    expect(model.knowledgeStatus.resolved).toBe(0);
    expect(model.knowledgeStatus.missing.length).toBe(FIRST.length + REST.length);
    expect(model.withheld.length).toBe(FIRST.length + REST.length);
    expect(model.candidateNote).toContain('withheld');
    expect(model.outcomes).toEqual([]);
  });
});
