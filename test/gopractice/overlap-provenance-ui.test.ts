// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { PlannedItem } from '../../packages/goreview/src/types';
import { beginSession, loadReviewModel } from '../../packages/gopractice/workspace';
import { planCurrentDeck } from '../../packages/gopractice/deckModel';
import { defaultService, destroyRigs, dueCard, ids, makeRig, seed, until } from './helpers';

afterEach(destroyRigs);

async function showOverlap(overlap: NonNullable<PlannedItem['overlap']>, presentationReason: string, expected: string): Promise<void> {
  const service = defaultService();
  const rig = await makeRig({ service, signedIn: true });
  const identity = ids('L1', 'sq');
  await seed(rig, dueCard(identity, 'zog', 'meaning-to-form'));
  let model = (await loadReviewModel(rig.app.ctx))!;
  rig.clock.set(new Date(Date.parse(model.deck[0].schedule.due) + 1000).toISOString());
  model = (await loadReviewModel(rig.app.ctx))!;
  const { plan } = await planCurrentDeck(rig.app.ctx, model);
  expect(plan.items.length).toBeGreaterThan(0);
  plan.items[0] = { ...plan.items[0], overlap, presentationReason };
  const result = await beginSession(rig.app.ctx, model, { plan });
  if (!result.ok) throw new Error(result.message);
  rig.app.ctx.run.active = result.run;
  await rig.go('review/session');
  expect(rig.q('#session-header [data-overlap]').getAttribute('data-overlap')).toBe(overlap);
  expect(rig.q('#session-header [data-overlap]').textContent).toContain(expected);
  rig.q('#finish-early').click();
  await until(() => !!rig.root.querySelector('#session-overlap-history'), 'the overlap record in the summary');
  expect(rig.q('#session-overlap-history').textContent).toContain(expected);
}

describe('repeat-presentation provenance in the session UI', () => {
  it('labels a due learning return as scheduled overlap', async () => {
    await showOverlap('scheduled', 'due-learning-return', 'A timed learning return became due.');
  });
  it('labels a delayed remediation item separately', async () => {
    await showOverlap('remediation', 'remediation-reassessment', 'You chose a delayed remediation reassessment.');
  });
  it('labels requested repeat practice as explicit overlap', async () => {
    await showOverlap('explicit', 'explicit-repeat', 'You chose to repeat this practice.');
  });
});
