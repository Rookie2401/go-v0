// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReviewEngine } from '../../packages/goreview/app/engine';
import { withApiRequestTimeout } from '../../packages/goreview/app/main';
import type { RepositoryApi } from '../../packages/repository-service/src/api';
import type { FactsProvider } from '../../packages/goreview/src';
import { DEFAULT_PREFERENCES } from '../../packages/goreview/app/state';
import { candidate, knowledgeRow, defaultService, destroyRigs, fakeFacts, makeRig } from './helpers';

afterEach(() => destroyRigs());

describe('GoReview startup performance guards', () => {
  it('collapses concurrent local identity reads without caching direct Repository changes', async () => {
    const rig = await makeRig({ local: true });
    const identity = vi.spyOn(rig.local!, 'identity');
    identity.mockClear();

    await Promise.all(Array.from({ length: 5 }, () => rig.app.ctx.identity()));
    // The first pass opens the local data handle and computes the identity, with other callers joining it.
    expect(identity).toHaveBeenCalledTimes(2);

    await rig.app.ctx.identity();
    expect(identity).toHaveBeenCalledTimes(4); // local device data can change without a GoReview event
  });

  it('memoizes remote identity briefly and refreshes after the two-second window', async () => {
    const rig = await makeRig({ signedIn: true });
    const first = await rig.app.ctx.identity();
    const cached = await rig.app.ctx.identity();
    expect(cached).toBe(first);

    rig.clock.set(new Date(rig.clock.now.getTime() + 2_001).toISOString());
    const refreshed = await rig.app.ctx.identity();
    expect(refreshed).not.toBe(first);
  });

  it('does not cache an undefined identity when an account gains its first enrolment', async () => {
    const service = defaultService();
    service.addAccount('new@example.org', 'pw', 'L3', []);
    const rig = await makeRig({ service });
    await rig.signIn('new@example.org', 'pw');
    expect(await rig.app.ctx.identity()).toBeUndefined();

    service.addAccount('new@example.org', 'pw', 'L3', [{ languageId: 'sq' }]);
    await rig.app.ctx.refreshProfile();
    expect(await rig.app.ctx.identity()).toMatchObject({ learnerId: 'L3', languageId: 'sq' });
  });

  it('retries missing pack providers, then reuses a provider for the same API and language', async () => {
    const api = {} as RepositoryApi;
    let available = false;
    const factsFor = vi.fn((): FactsProvider | undefined => available ? { factsFor: async () => undefined } : undefined);
    const engine = createReviewEngine({ builders: [], evidenceFor: vi.fn() as never, ratingFor: vi.fn() as never, factsFor });

    await engine.factsFor?.('unit', 'sq', api);
    await engine.factsFor?.('unit', 'sq', api);
    expect(factsFor).toHaveBeenCalledTimes(2); // misses are never cached

    available = true;
    await engine.factsFor?.('unit', 'sq', api);
    await engine.factsFor?.('other', 'sq', api);
    expect(factsFor).toHaveBeenCalledTimes(3); // positive provider lookup is reused
  });

  it('uses one successful intake facts read for the first exercise check only', async () => {
    const api = {} as RepositoryApi;
    const factsFor = vi.fn(async () => fakeFacts.factsFor('lemma:sq:zog:NOUN', 'sq'));
    const engine = createReviewEngine({ builders: [], evidenceFor: vi.fn() as never, ratingFor: vi.fn() as never, factsFor: () => ({ factsFor }) });
    const c = candidate('zog', 0.8);
    const request = {
      api, candidates: [c], knowledge: [knowledgeRow('L1',c.unitId,'sq',{})], deck: [], saved: new Set<string>(), prefs: DEFAULT_PREFERENCES('sq'),
      audio: { available: false, eligibleForEvidence: false, reason: 'unavailable' }, now: '2026-10-14T12:00:00.000Z',
    };

    await engine.intake(request);
    expect(factsFor).toHaveBeenCalledTimes(1);
    const check = { api, unitId: c.unitId, unitKind: c.kind, languageId: 'sq', dimension: 'written-recognition' as const, family: 'written-recognition' as const, now: request.now };
    await engine.exerciseAvailable?.(check);
    expect(factsFor).toHaveBeenCalledTimes(1);
    await engine.exerciseAvailable?.(check);
    expect(factsFor).toHaveBeenCalledTimes(2); // consumed warm facts are never reused twice
  });

  it('does not reuse warm facts across target varieties', async () => {
    const api = {} as RepositoryApi;
    const varieties: Array<string | undefined> = [];
    const factsFor = vi.fn(async (_unitId: string, _languageId: string, varietyId?: string) => {
      varieties.push(varietyId);
      return fakeFacts.factsFor('lemma:sq:zog:NOUN', 'sq');
    });
    const engine = createReviewEngine({ builders: [], evidenceFor: vi.fn() as never, ratingFor: vi.fn() as never, factsFor: () => ({ factsFor }) });
    const c = candidate('zog', 0.8);
    const request = {
      api, candidates: [c], knowledge: [knowledgeRow('L1',c.unitId,'sq',{})], deck: [], saved: new Set<string>(),
      prefs: { ...DEFAULT_PREFERENCES('sq'), varietyId: 'he-bib' },
      audio: { available: false, eligibleForEvidence: false, reason: 'unavailable' }, now: '2026-10-14T12:00:00.000Z',
    };
    await engine.intake(request);
    const check = { api, unitId: c.unitId, unitKind: c.kind, languageId: 'sq', dimension: 'written-recognition' as const, family: 'written-recognition' as const, now: request.now };
    await engine.exerciseAvailable?.({ ...check, varietyId: 'he-bib' });
    expect(varieties).toEqual(['he-bib']);
    await engine.exerciseAvailable?.({ ...check, varietyId: 'he-mod' });
    expect(varieties).toEqual(['he-bib', 'he-mod']);
  });

  it('aborts a repository request that stalls past its deadline', async () => {
    let observedSignal: AbortSignal | undefined;
    const pendingFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }));
    }) as unknown as typeof fetch;
    const timedFetch = withApiRequestTimeout(pendingFetch, 5);

    await expect(timedFetch('https://repo.invalid/health')).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(observedSignal?.aborted).toBe(true);
  });
});
