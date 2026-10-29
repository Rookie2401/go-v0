// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { destroyRigs, dueCard, FAKE_BUILDERS, fakeFacts, ids, key, makeRig, seed, shownLabel, startWith, type, until, type Rig } from './helpers';

afterEach(() => destroyRigs());
const originalFactsFor = fakeFacts.factsFor;
afterEach(() => { fakeFacts.factsFor = originalFactsFor; });

const A = ids('L1', 'sq');
const answerTyped = (rig: Rig, text: string): void => {
  const input = rig.q<HTMLInputElement>('#answer-input');
  type(input, text);
  key('Enter', input);
};
async function playOut(rig: Rig, wrong: readonly string[] = []): Promise<void> {
  for (let i = 0; i < 20 && !rig.root.querySelector('#summary'); i++) {
    await until(() => !!rig.root.querySelector('#session .exercise') || !!rig.root.querySelector('#summary'), 'a card or the summary');
    if (rig.root.querySelector('#summary')) break;
    answerTyped(rig, wrong.includes(shownLabel(rig)) ? 'xxxxxx' : shownLabel(rig));
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    rig.q('#next').click();
  }
  await until(() => !!rig.root.querySelector('#summary'), 'the summary');
}

describe('Repository-backed remediation', () => {
  it('persists a study marker without review credit and starts only a delayed typed reassessment after reload', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    const itemId = rig.app.ctx.run.active!.plan.items[0].item.itemId;
    await playOut(rig, ['zog', 'mace']);

    expect(rig.q('#summary-next').textContent).toContain('Next scheduled session');
    expect(rig.q('#optional-repeat-note').textContent).toContain('does not represent a new due session');
    expect(rig.q<HTMLButtonElement>('#begin-remediation').disabled).toBe(true);
    rig.q('#open-remediation').click();
    await until(() => !!rig.root.querySelector('#remediation-backlog'), 'the persistent remediation backlog');
    const remediationRow = rig.root.querySelector(`[data-item-id="${itemId}"]`)!;
    expect(remediationRow.textContent).toContain('Meaning:');
    expect(remediationRow.textContent).toContain('Productive recall difficulty');
    expect(remediationRow.textContent).toContain('These labels describe the recorded question type and result');
    expect(remediationRow.textContent).not.toMatch(/confusion|confused/i);
    expect(rig.root.querySelectorAll('#remediation-backlog [data-item-id]')).toHaveLength(2);

    const before = await rig.app.ctx.events(A.languageId);
    const reviewCount = before.filter(e => ['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed'].includes(e.kind)).length;
    const scheduleBefore = (await (await import('../../packages/goreview/app/workspace')).loadReviewModel(rig.app.ctx))!.deck.find(x => x.itemId === itemId)!.schedule;
    rig.q<HTMLButtonElement>('[data-action="mark-studied"]').click();
    await until(async () => (await rig.app.ctx.events(A.languageId)).some(e => e.kind === 'PreferenceChanged' && e.payload.key === 'goreview.remediation'), 'the Repository study marker');
    const afterStudy = await rig.app.ctx.events(A.languageId);
    expect(afterStudy.filter(e => ['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed'].includes(e.kind))).toHaveLength(reviewCount);
    expect((await (await import('../../packages/goreview/app/workspace')).loadReviewModel(rig.app.ctx))!.deck.find(x => x.itemId === itemId)!.schedule).toEqual(scheduleBefore);
    expect(afterStudy.some(e => e.kind === 'PreferenceChanged' && e.payload.key === 'goreview.remediation' && e.subject.cardId === itemId)).toBe(true);
    expect(rig.root.textContent).toContain('Reassessment becomes available at');

    rig.clock.set(new Date(rig.clock.now.getTime() + 11 * 60_000).toISOString());
    await rig.go('review');
    await rig.go('review/remediation'); // reload the projection from Repository events
    await until(() => !!rig.root.querySelector('[data-action="begin-reassessment"]'), 'delayed reassessment');
    expect(rig.root.querySelectorAll('#remediation-backlog [data-item-id]')).toHaveLength(2); // unselected work carries across the batch and route reload
    rig.q<HTMLButtonElement>('[data-action="begin-reassessment"]').click();
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the reassessment prompt');
    expect(rig.app.ctx.run.active?.plan.intent).toEqual(expect.objectContaining({ kind: 'explicit', reason: 'reassessment' }));
    expect(rig.app.ctx.run.active?.plan.items.map(p => p.item.itemId)).toContain(itemId);
    expect(rig.app.ctx.run.active?.plan.items[0].queue).toBe('remediation');
  });

  it('keeps every unresolved item visible while only one studied item is ready for the limited follow-up', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form'), ...dueCard(A, 'qen', 'meaning-to-form')]);
    await playOut(rig, ['zog', 'mace', 'qen']);
    rig.q('#open-remediation').click();
    await until(() => rig.root.querySelectorAll('#remediation-backlog [data-item-id]').length === 3, 'all unresolved items');
    const rows = rig.qa<HTMLElement>('#remediation-backlog [data-item-id]');
    const chosen = rows[0].dataset.itemId!;
    rows[0].querySelector<HTMLButtonElement>('[data-action="mark-studied"]')!.click();
    await until(async () => (await rig.app.ctx.events(A.languageId)).some(e => e.kind === 'PreferenceChanged' && e.payload.key === 'goreview.remediation'), 'the study marker');
    rig.clock.set(new Date(rig.clock.now.getTime() + 11 * 60_000).toISOString());
    await rig.go('review');
    await rig.go('review/remediation');
    await until(() => rig.root.querySelectorAll('#remediation-backlog [data-item-id]').length === 3, 'the complete backlog after reload');
    expect(rig.root.querySelectorAll('#remediation-backlog [data-action="begin-reassessment"]')).toHaveLength(1);
    rig.q<HTMLButtonElement>('[data-action="begin-reassessment"]').click();
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the limited reassessment');
    expect(rig.app.ctx.run.active?.plan.items.map(p => p.item.itemId)).toEqual([chosen]);
  });

  it('keeps challenged invalidations in facts repair and refreshes changed facts before repair', async () => {
    const builders = FAKE_BUILDERS.map(builder => builder.family === 'meaning-to-form' ? { ...builder,
      build: async (...args: Parameters<typeof builder.build>) => {
        const exercise = await builder.build(...args);
        return 'unavailable' in exercise ? exercise : { ...exercise, target: { ...exercise.target, unitKind: args[0].unitKind },
          prompt: { ...exercise.prompt, meaning: args[1].glosses[0] } };
      },
    } : builder);
    const rig = await makeRig({ signedIn: true, builders });
    const cardEvents = dueCard(A, 'zog', 'meaning-to-form');
    cardEvents[0].payload.unitKind = 'lexeme'; // real Repository kind required by verified repair validation
    await startWith(rig, cardEvents);
    const run = rig.app.ctx.run.active!;
    const result = await run.driver.answer({ typed: 'zog', hinted: false, assistance: [] });
    rig.clock.set(new Date(rig.clock.now.getTime() + 60_000).toISOString());
    const review = result.evidence!;
    const at = rig.clock.now.toISOString();
    const withdrawal: GoEvent = { ...review, id: 'challenged-review', dedupeKey: 'challenged-review', at, correctionOf: review.id,
      payload: { ...review.payload, rating: null, challenged: true, challengeReason: 'wrong key', expectedPreviousReviewId: review.id },
      evidence: { quality: 'none' } };
    const invalidation: GoEvent = { id: 'facts-invalidation', v: review.v, learnerId: review.learnerId, enrolmentId: review.enrolmentId,
      languageId: review.languageId, ...(review.varietyId ? { varietyId: review.varietyId } : {}), at, producer: review.producer,
      kind: 'ReviewItemInvalidated', subject: { cardId: review.subject.cardId, itemIds: review.subject.itemIds },
      payload: { reason: 'analysis-invalidated', cardId: review.subject.cardId, reviewEventId: review.id }, evidence: { quality: 'none' } };
    await seed(rig, [withdrawal, invalidation]);
    expect((await rig.app.ctx.events(A.languageId)).some(e => e.kind === 'ReviewItemInvalidated')).toBe(true);
    const folded = (await (await import('../../packages/goreview/app/workspace')).loadReviewModel(rig.app.ctx))!;
    expect(folded.deck[0]).toMatchObject({ invalidatedAt: at, invalidatedBy: 'facts-invalidation' });

    let factsCalls = 0;
    fakeFacts.factsFor = async (unitId, languageId) => {
      factsCalls++;
      const facts = await originalFactsFor(unitId, languageId);
      if (!facts) return undefined;
      if (factsCalls === 1) return facts; // stale, not verified material on the initial paint
      return { ...facts, unit: { ...facts.unit, kind: 'lexeme', label: 'zog', packId: 'repair-fixture', packVersion: '1',
        provenance: { source: 'reviewer', ref: 'repair-fixture', confidence: 1, validatedBy: 'test', validatedAt: at }, status: 'verified' },
        status: 'verified', glosses: ['a changed verified meaning'] };
    };
    await rig.go('review/remediation');
    await until(() => !!rig.root.querySelector('#facts-repair-backlog'), 'the separate facts repair queue');
    expect(rig.root.querySelectorAll('#remediation-backlog [data-item-id]')).toHaveLength(0);
    const repair = rig.q<HTMLButtonElement>('[data-action="repair-invalidated"]');
    expect(repair.disabled).toBe(false);
    rig.clock.set(new Date(rig.clock.now.getTime() + 60_000).toISOString());
    expect(Date.parse((await rig.app.ctx.eventContext())!.now)).toBeGreaterThan(Date.parse(at));
    const fresh = (await (await import('../../packages/goreview/app/workspace')).loadReviewModel(rig.app.ctx))!;
    expect(Date.parse(fresh.now)).toBeGreaterThan(Date.parse(at));
    expect(fresh.deck[0]).toMatchObject({ itemId: review.subject.cardId, invalidatedBy: 'facts-invalidation' });
    expect(fresh.events.find(e => e.id === fresh.deck[0].invalidatedBy)).toMatchObject({ learnerId: review.learnerId, enrolmentId: review.enrolmentId, languageId: review.languageId, subject: { cardId: review.subject.cardId } });
    expect((await rig.app.ctx.identity())).toMatchObject({ learnerId: review.learnerId, enrolmentId: review.enrolmentId, languageId: review.languageId });
    expect(fresh.deck[0].invalidatedAt).toBe(at);
    repair.click();
    await until(() => !!rig.root.querySelector('#remediation .status')?.getAttribute('data-kind'), 'the repair result');
    expect(rig.q('#remediation .status').textContent).toContain('Saved');
    expect((await rig.app.ctx.events(A.languageId)).some(e => e.kind === 'CardAdded' && e.payload.lifecycle === 'facts-repaired')).toBe(true);
    expect(factsCalls).toBeGreaterThan(1);
  });
});
