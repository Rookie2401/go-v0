// @vitest-environment jsdom
/**
 * B3: one remediation projection. Ordinary cards and Class Essentials are computed together by effectiveRemediation(model);
 * the home counts, the remediation screen and planRemediation all read it, so no surface can disagree about what is listed,
 * counted or ready.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { FAMILY_DIMENSION, registry } from '../../packages/goreview/src';
import { itemIdFor } from '../../packages/goreview/src/scheduler/deck';
import { buildRemediationStudiedEvent } from '../../packages/goreview/src/planner/remediation';
import type { GoEvent } from '../../packages/repository-contract/src';
import { effectiveRemediation, planCurrentDeck, planRemediation } from '../../packages/goreview/app/deckModel';
import { loadReviewModel, type ReviewModel } from '../../packages/goreview/app/workspace';
import { destroyRigs, dueCard, ids, key, makeRig, reopen, seed, shownLabel, startWith, type as typeInto, until, type Rig } from './helpers';

afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
const CLASS_UNIT = (label: string): string => `class:sq:${label}`;
const failureId = (label: string): string => `rev-${label}-2026-09-01T10:00:00.000Z`;

/** A failed (rating 1) Class Essentials card: the ordinary fixture re-addressed to a class unit. */
function failedClassCard(label: string, phrase: string): GoEvent[] {
  const unitId = CLASS_UNIT(phrase);
  return dueCard(A, label, 'written-recognition').map((event) => ({ ...event,
    subject: { ...event.subject, itemIds: [unitId], cardId: itemIdFor(unitId, FAMILY_DIMENSION['written-recognition']) },
    payload: { ...event.payload, ...(event.kind === 'CardAdded' ? { unitId, unitKind: 'lexeme' } : {}) } }));
}
const classItemId = (phrase: string): string => itemIdFor(CLASS_UNIT(phrase), FAMILY_DIMENSION['written-recognition']);
const ordinaryItemId = (label: string): string => itemIdFor(`lemma:sq:${label}:NOUN`, FAMILY_DIMENSION['meaning-to-form']);

function studied(rig: Rig, itemId: string, label: string): GoEvent {
  return buildRemediationStudiedEvent({ learnerId: A.learnerId, enrolmentId: A.enrolmentId, languageId: A.languageId,
    itemId, failureEventId: failureId(label), at: rig.clock.now.toISOString(), deviceId: 'dev-old' });
}
const model = async (rig: Rig): Promise<ReviewModel> => (await loadReviewModel(rig.app.ctx))!;
const advance = (rig: Rig, minutes: number): void => rig.clock.set(new Date(rig.clock.now.getTime() + minutes * 60_000).toISOString());
const rowIds = (rig: Rig): string[] => rig.qa('#remediation-backlog [data-item-id]').map(row => row.dataset.itemId!).sort();

describe('effectiveRemediation: one projection over ordinary and Class Essentials cards', () => {
  it('lists, counts and splits an ordinary and a class failure the same way on the model, the home and the remediation screen', async () => {
    const rig = await makeRig({ signedIn: true, builders: registry as never });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...failedClassCard('seedc', 'Faleminderit')]);
    const m = await model(rig);
    const r = effectiveRemediation(m);

    // (a) the ordinary failure
    expect(r.ordinary.map(c => c.itemId)).toEqual([ordinaryItemId('zog')]);
    expect(r.needsStudy.map(c => c.itemId)).toContain(ordinaryItemId('zog'));
    // (b) the class failure
    expect(r.class.map(c => c.itemId)).toEqual([classItemId('Faleminderit')]);
    expect(r.needsStudy.map(c => c.itemId)).toContain(classItemId('Faleminderit'));
    // (d) no double counting; the groups partition `all`, and the status groups partition it too
    expect(r.all).toHaveLength(2);
    expect(r.all.length).toBe(r.ordinary.length + r.class.length);
    expect(new Set(r.all.map(c => c.itemId)).size).toBe(r.all.length);
    expect(r.ordinary.some(c => r.class.includes(c))).toBe(false);
    expect(r.needsStudy.length + r.waiting.length + r.ready.length).toBe(r.all.length);
    expect(r.ready).toHaveLength(0);

    // the home summary comes from the same projection
    const current = await planCurrentDeck(rig.app.ctx, m);
    expect(current.summary.remediation).toBe(r.ordinary.length);
    expect(current.summary.classRemediation).toBe(r.class.length);
    expect(current.remediation.map(c => c.itemId)).toEqual(r.ordinary.map(c => c.itemId));
    await reopen(rig);
    expect(rig.q('#review-obligations').textContent).toContain('1 unresolved remediation');
    expect(rig.q('#open-remediation').textContent).toBe('Review remediation (1)');
    expect(rig.q('#open-class-remediation').textContent).toBe('Study Class Essentials remediation (1)');

    // the remediation screen lists exactly the projection, each row tagged with its source
    await rig.go('review/remediation');
    await until(() => !!rig.root.querySelector('#remediation-backlog'), 'the backlog');
    expect(rowIds(rig)).toEqual(r.all.map(c => c.itemId).sort());
    expect(rig.q(`#remediation-backlog [data-item-id="${classItemId('Faleminderit')}"]`).dataset.source).toBe('class-essentials');
    expect(rig.q(`#remediation-backlog [data-item-id="${ordinaryItemId('zog')}"]`).dataset.source).toBe('vocabulary');
  });

  it('plans a ready Class Essentials reassessment after the study marker and the ten-minute delay, and never before', async () => {
    const rig = await makeRig({ signedIn: true, builders: registry as never });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...failedClassCard('seedc', 'Faleminderit')]);
    await seed(rig, [studied(rig, classItemId('Faleminderit'), 'seedc')]); // a marker only: it records no answer or rating

    // studied but inside the delay: waiting, not ready, and not plannable
    advance(rig, 5);
    let m = await model(rig);
    let r = effectiveRemediation(m);
    expect(r.waiting.map(c => c.itemId)).toEqual([classItemId('Faleminderit')]);
    expect(r.ready).toHaveLength(0);
    expect(r.class).toHaveLength(1); // a study marker is not a verified repair: the failure is still unresolved
    expect(r.needsStudy.map(c => c.itemId)).toEqual([ordinaryItemId('zog')]);
    expect((await planRemediation(rig.app.ctx, m)).items).toHaveLength(0);

    // (c) after the delay the class card is ready and planRemediation returns it with no candidates passed in
    advance(rig, 6);
    m = await model(rig);
    r = effectiveRemediation(m);
    expect(r.ready.map(c => c.itemId)).toEqual([classItemId('Faleminderit')]);
    expect(r.waiting).toHaveLength(0);
    const plan = await planRemediation(rig.app.ctx, m);
    expect(plan.items.map(p => p.item.itemId)).toEqual([classItemId('Faleminderit')]);
    expect(plan.items[0].queue).toBe('remediation');
    expect(plan.intent).toMatchObject({ kind: 'explicit', reason: 'reassessment' });
    // the same plan comes from the candidates the screen passes (its row's candidate only)
    const viaScreen = await planRemediation(rig.app.ctx, m, r.all.filter(c => c.itemId === classItemId('Faleminderit')));
    expect(viaScreen.items.map(p => p.item.itemId)).toEqual([classItemId('Faleminderit')]);
    // the unstudied ordinary card is listed but not plannable
    expect(plan.items.some(p => p.item.itemId === ordinaryItemId('zog'))).toBe(false);

    // the counts still come from the one projection, and still do not double count
    const current = await planCurrentDeck(rig.app.ctx, m);
    expect(current.summary.classRemediation).toBe(1);
    expect(current.summary.remediation).toBe(1);
    expect(r.all.length).toBe(r.ordinary.length + r.class.length);

    // the screen offers the begin button for the ready class card only
    await rig.go('review/remediation');
    await until(() => !!rig.root.querySelector('#remediation-backlog'), 'the backlog');
    expect(rowIds(rig)).toEqual([classItemId('Faleminderit'), ordinaryItemId('zog')].sort());
    const begins = rig.qa<HTMLButtonElement>('#remediation-backlog [data-action="begin-reassessment"]');
    expect(begins).toHaveLength(1);
    expect(begins[0].closest('[data-item-id]')!.getAttribute('data-item-id')).toBe(classItemId('Faleminderit'));
    begins[0].click();
    await until(() => rig.app.current() === 'review/session', 'the reassessment session');
    expect(rig.app.ctx.run.active?.plan.items.map(p => p.item.itemId)).toEqual([classItemId('Faleminderit')]);
  });

  it('plans a ready ORDINARY reassessment through the same default projection', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    await seed(rig, [studied(rig, ordinaryItemId('zog'), 'zog')]);
    advance(rig, 11);
    const m = await model(rig);
    const r = effectiveRemediation(m);
    expect(r.class).toHaveLength(0);
    expect(r.ordinary).toHaveLength(2);
    expect(r.ready.map(c => c.itemId)).toEqual([ordinaryItemId('zog')]);
    expect(r.needsStudy.map(c => c.itemId)).toEqual([ordinaryItemId('mace')]);
    expect((await planRemediation(rig.app.ctx, m)).items.map(p => p.item.itemId)).toEqual([ordinaryItemId('zog')]);
  });

  it('(e) excludes an invalidated card everywhere: projection, counts, screen backlog and planning', async () => {
    const rig = await makeRig({ signedIn: true, builders: registry as never });
    const failure = dueCard(A, 'zog', 'meaning-to-form');
    await seed(rig, [...failure, ...dueCard(A, 'mace', 'meaning-to-form'), ...failedClassCard('seedc', 'Faleminderit')]);
    await seed(rig, [studied(rig, classItemId('Faleminderit'), 'seedc')]);
    advance(rig, 11);
    expect(effectiveRemediation(await model(rig)).all).toHaveLength(3);

    const invalidate = (cardId: string, itemIds: string[], id: string): GoEvent => ({ id, v: failure[1].v, learnerId: A.learnerId, enrolmentId: A.enrolmentId,
      languageId: A.languageId, at: rig.clock.now.toISOString(), producer: failure[1].producer, kind: 'ReviewItemInvalidated',
      subject: { cardId, itemIds }, payload: { reason: 'analysis-invalidated', cardId }, evidence: { quality: 'none' } });
    advance(rig, 1);
    await seed(rig, [invalidate(ordinaryItemId('zog'), ['lemma:sq:zog:NOUN'], 'inv-zog'), invalidate(classItemId('Faleminderit'), [CLASS_UNIT('Faleminderit')], 'inv-class')]);
    advance(rig, 1);

    const m = await model(rig);
    expect([...m.deck, ...(m.classDeck ?? [])].filter(i => i.invalidatedAt)).toHaveLength(2);
    const r = effectiveRemediation(m);
    expect(r.all.map(c => c.itemId)).toEqual([ordinaryItemId('mace')]);
    expect(r.class).toHaveLength(0);
    expect(r.ready).toHaveLength(0);
    // an invalidated, ready card is not plannable even when a caller hands its stale candidate straight in
    const stale = { itemId: classItemId('Faleminderit'), unitId: CLASS_UNIT('Faleminderit'), failureEventId: failureId('seedc'), failures: 1, repairRequired: false,
      reasons: ['failed-retrieval' as const], ready: true, needsStudy: false };
    expect((await planRemediation(rig.app.ctx, m, [stale])).items).toHaveLength(0);
    expect((await planRemediation(rig.app.ctx, m)).items).toHaveLength(0);
    const current = await planCurrentDeck(rig.app.ctx, m);
    expect(current.summary.remediation).toBe(1);
    expect(current.summary.classRemediation).toBe(0);

    await rig.go('review/remediation');
    await until(() => !!rig.root.querySelector('#facts-repair-backlog'), 'the facts repair queue');
    expect(rowIds(rig)).toEqual([ordinaryItemId('mace')]);
    expect(rig.qa('#facts-repair-backlog [data-item-id]').map(row => row.getAttribute('data-item-id')!).sort()).toEqual([classItemId('Faleminderit'), ordinaryItemId('zog')].sort());
  });
});

describe('the next-deck panel on the session summary', () => {
  // Fails until screens/session.ts nextDeckSection reads effectiveRemediation(model) instead of remediationBacklog(model.deck ...): it ignored Class Essentials.
  it('counts and enables a ready Class Essentials reassessment exactly as the projection does', async () => {
    const rig = await makeRig({ signedIn: true, builders: registry as never });
    await seed(rig, failedClassCard('seedc', 'Faleminderit'));
    await seed(rig, [studied(rig, classItemId('Faleminderit'), 'seedc')]);
    advance(rig, 11);
    await startWith(rig, dueCard(A, 'zog', 'meaning-to-form'));
    for (let i = 0; i < 20 && !rig.root.querySelector('#summary'); i++) {
      await until(() => !!rig.root.querySelector('#session .exercise') || !!rig.root.querySelector('#summary'), 'a card or the summary');
      if (rig.root.querySelector('#summary')) break;
      const input = rig.q<HTMLInputElement>('#answer-input');
      typeInto(input, shownLabel(rig));
      key('Enter', input);
      await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
      rig.q('#next').click();
    }
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    const r = effectiveRemediation(await model(rig));
    expect(r.ready.map(c => c.itemId)).toEqual([classItemId('Faleminderit')]);
    expect(r.class).toHaveLength(1);
    expect(rig.q('#next-remediation-note').textContent).toContain(`${r.needsStudy.length} need study, ${r.waiting.length} await their delayed return, and ${r.ready.length} are ready for reassessment`);
    expect(rig.q<HTMLButtonElement>('#begin-remediation').disabled).toBe(false);
  });
});
