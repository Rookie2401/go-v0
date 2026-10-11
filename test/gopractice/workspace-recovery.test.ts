// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { endSavedSession, recoverableSessions, resumeSession } from '../../packages/gopractice/workspace';
import { destroyRigs, makeRig, ids, reviewed, seed, T0 } from './helpers';
import type { SessionState } from '../../packages/goreview/src/types';

afterEach(destroyRigs);

describe('learner-scoped interruption recovery', () => {
  it('lists only active sessions in the selected language and never another learner storage', async () => {
    const rig = await makeRig({ signedIn: true });
    const ctx = rig.app.ctx;
    const data = (await ctx.data())!;
    const identity = (await ctx.identity())!;
    const saved = (id: string, languageId: string, status: SessionState['status'] = 'in-progress') => ({
      sessionId: id, startedAt: '2026-10-10T10:00:00.000Z', index: 0, results: [], deviceId: 'test', status,
      plan: { planId: id, createdAt: '2026-10-10T10:00:00.000Z', languageId, budgetMinutes: 10, items: [], skipped: [], dueCount: 0, newCount: 0, listeningCount: 0, grammarCount: 0 },
    });
    await data.area.set({
      'goreview:session:wanted': saved('wanted', identity.languageId),
      'goreview:session:other-language': saved('other-language', 'th'),
      'goreview:session:finished': saved('finished', identity.languageId, 'finished'),
    });
    await rig.area.set({ 'u:another-learner:goreview:session:private': saved('private', identity.languageId) });
    expect((await recoverableSessions(ctx)).map((s) => s.sessionId)).toEqual(['wanted']);
    const resumed = await resumeSession(ctx, 'wanted');
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.run.driver.state().sessionId).toBe('wanted');
    expect(await endSavedSession(ctx, 'wanted')).toBe(true);
    expect(await recoverableSessions(ctx)).toEqual([]);
    expect((await ctx.events()).filter((e) => e.kind === 'CardReviewed')).toEqual([]);
  });

  it('reports missing sessions without creating or grading a card', async () => {
    const rig = await makeRig({ signedIn: true });
    expect((await resumeSession(rig.app.ctx, 'missing')).ok).toBe(false);
    expect(await endSavedSession(rig.app.ctx, 'missing')).toBe(false);
    expect(await rig.app.ctx.events()).toEqual([]);
  });

  it('keeps a refused synchronized grade in history without applying it to the effective memory model', async () => {
    const rig = await makeRig({ signedIn: true });
    const event = reviewed(ids('L1', 'sq'), 'zog', 'written-recognition', 3, T0);
    await seed(rig, [event]);
    const data = (await rig.app.ctx.data())!;
    await data.queue.enqueue(event);
    await data.queue.reject(event.id, [{ path: 'payload.expectedPreviousReviewId', message: 'review conflict' }]);
    expect((await rig.app.ctx.events()).some((e) => e.id === event.id)).toBe(false);
    expect(await data.log.get(data.learnerId, event.id)).toBeDefined();
    expect((await data.queue.rejected()).map((r) => r.event.id)).toContain(event.id);
  });
});
