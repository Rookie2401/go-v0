// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { planCurrentDeck } from '../../packages/goreview/app/deckModel';
import { loadReviewModel } from '../../packages/goreview/app/workspace';
import { destroyRigs, candidate, defaultService, knowledgeRow, makeRig, queued, reopen, type Rig, FAKE_BUILDERS } from './helpers';

afterEach(() => destroyRigs());

async function setup(labels: Array<[string, number]>, maxNew = 2, builders = FAKE_BUILDERS): Promise<Rig> {
  const service = defaultService();
  const rig = await makeRig({ service, signedIn: true, builders });
  const id = { learnerId: 'L1', enrolmentId: 'L1-e1', languageId: 'sq' };
  const candidates = labels.map(([label, score]) => candidate(label, score));
  service.candidates.set(id.enrolmentId, candidates);
  service.knowledge.set(id.learnerId, candidates.map((c) => ({ ...knowledgeRow(id.learnerId, c.unitId, id.languageId, {}), level: 'recognized' })));
  await rig.app.ctx.state.setPrefs(id.learnerId, { languageId: 'sq', maxNew, sessionMinutes: 10, desiredRetention: .9, includeListening: false, grammarShare: .2, prioritizeSaved: true });
  return rig;
}

describe('GoReview automatic deck admission', () => {
  it('proposes the highest scored buildable items without creating cards and stays idempotent across reloads', async () => {
    const rig = await setup([['low', .01], ['high', .12], ['middle', .08]], 2);
    // Every raw score is below the old absolute cutoff. Concurrent workspace loads
    // still select the strongest two and create no scheduling progress.
    const [first] = await Promise.all([loadReviewModel(rig.app.ctx), loadReviewModel(rig.app.ctx)]);
    expect((await planCurrentDeck(rig.app.ctx,first!)).entries.map(x=>x.unitId)).toEqual(['lemma:sq:high:NOUN', 'lemma:sq:middle:NOUN']);
    const n = 0; expect(await queued(rig)).toEqual([]);
    await reopen(rig);
    await loadReviewModel(rig.app.ctx);
    expect((await queued(rig)).filter((e) => e.kind === 'CardAdded')).toHaveLength(n);
  });

  it('continues down the score order when the top candidate cannot build', async () => {
    const builders = FAKE_BUILDERS.map((b) => b.family === 'written-recognition' ? { ...b, canBuild: (target: { unitId: string }) => !target.unitId.includes(':broken:') } : b);
    const rig = await setup([['broken', .99], ['usable', .4]], 1, builders);
    const model = await loadReviewModel(rig.app.ctx);
    expect((await planCurrentDeck(rig.app.ctx,model!)).entries.some((x) => x.unitId.includes(':usable:'))).toBe(true);
    expect(model?.deck.some((x) => x.unitId.includes(':broken:'))).toBe(false);
    expect(model?.outcomes.find((x) => x.unitId.includes(':broken:'))).toMatchObject({ decision: 'needs-validation', proposed: undefined });
    expect(model?.candidateNote).toContain('1 word waiting for a usable exercise');
  });

  it('retries the same evidence snapshot when admission preferences or buildability change', async () => {
    const rig = await setup([['same', .8]], 0);
    expect((await planCurrentDeck(rig.app.ctx,(await loadReviewModel(rig.app.ctx))!)).entries.some((x) => x.unitId.includes(':same:'))).toBe(false);
    await rig.app.ctx.state.setPrefs('L1', { languageId: 'sq', maxNew: 1, sessionMinutes: 10, desiredRetention: .9, includeListening: false, grammarShare: .2, prioritizeSaved: true });
    expect((await planCurrentDeck(rig.app.ctx,(await loadReviewModel(rig.app.ctx))!)).entries.some((x) => x.unitId.includes(':same:'))).toBe(true);

    let repaired = false;
    const builders = FAKE_BUILDERS.map((b) => b.family === 'written-recognition' ? { ...b, canBuild: (target: { unitId: string }) => repaired || !target.unitId.includes(':repair:') } : b);
    const repairRig = await setup([['repair', .9]], 1, builders);
    expect((await planCurrentDeck(repairRig.app.ctx,(await loadReviewModel(repairRig.app.ctx))!)).entries.some((x) => x.unitId.includes(':repair:'))).toBe(false);
    repaired = true;
    expect((await planCurrentDeck(repairRig.app.ctx,(await loadReviewModel(repairRig.app.ctx))!)).entries.some((x) => x.unitId.includes(':repair:'))).toBe(true);
  });
});
