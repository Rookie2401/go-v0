// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoEvent, ReviewCandidate, UnitKnowledge } from '../../packages/repository-contract/src';
import type { VocabularyItem } from '../../packages/repository-service/src/api';
import { loadReviewModel } from '../../packages/goreview/app/workspace';
import { planCurrentDeck } from '../../packages/goreview/app/deckModel';
import { explainAdmissions } from '../../packages/goreview/app/admissionExplanation';
import { forgetPaintedHome } from '../../packages/goreview/app/screens/review';
import { CONTRACT_VERSION } from '../../packages/repository-contract/src';
import { candidatesKey, snapshotKey } from '../../packages/goreview/app/state';
import { FakeService, cardAdded, destroyRigs, ids, knowledgeRow, makeRig, reviewed, seed, until } from './helpers';

afterEach(() => { destroyRigs(); });

const ok = <T>(data: T) => ({ ok: true as const, status: 200, data });
const targetId = 'form:he:בָּרָא';
const unknownCandidate: ReviewCandidate = {
  unitId: targetId, kind: 'unknown', score: 0, reasons: [], targetDimension: 'readingRecognition',
  eligibility: { eligible: false, status: 'unknown', reason: 'unit is not in the linguistic store' }, cost: 0.2,
};
const recoveredCandidate: ReviewCandidate = {
  unitId: targetId, kind: 'form', score: 0.8, reasons: [{ rule: 'recentEncounter', weight: 0.15 }], targetDimension: 'readingRecognition',
  eligibility: { eligible: true, status: 'high-confidence', caveats: [] }, cost: 0.2,
};

const vocabRow = (unitId: string, languageId = 'he'): VocabularyItem => {
  const row = { ...knowledgeRow('L1', unitId, languageId, {}), analysisStatus: 'high-confidence' as const };
  return { knowledge: row as UnitKnowledge, surfaceForms: [unitId === targetId ? 'בָּרָא' : unitId], sources: [] };
};

const clearReviewCopies = async (rig: Awaited<ReturnType<typeof makeRig>>): Promise<void> => {
  const identity = (await rig.app.ctx.identity())!;
  const keys = [snapshotKey(identity.learnerId, identity.languageId), ...(await rig.area.list(candidatesKey(identity.learnerId, identity.enrolmentId)))];
  await rig.area.remove(keys);
};

describe('workspace Hebrew recovery', () => {
  it('reads every raw missing-unit page and recovers a Current Deck card beside a due Review Deck card', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
    const rig = await makeRig({ service, signedIn: true });
    rig.app.ctx.engine.canRecoverCandidates = () => true;
    await clearReviewCopies(rig);
    const api = (await rig.app.ctx.api()).api;
    const allRows = Array.from({ length: 100 }, (_, i) => vocabRow(`form:he:א${i}`));
    allRows.push(vocabRow(targetId)); // beyond the first response page
    const allKnowledge = allRows.map((item) => item.knowledge);
    allKnowledge.push(vocabRow('form:fr:étranger', 'fr').knowledge);
    const pages: Array<{ items: VocabularyItem[]; nextCursor?: string }> = [
      { items: allRows.slice(0, 100), nextCursor: 'page-2' },
      { items: [allRows[100]!] },
    ];
    const vocabulary = vi.fn(async (query: { after?: string; unresolved?: boolean }) => {
      expect(query.unresolved).toBeUndefined();
      return ok(pages[query.after ? 1 : 0]!);
    });
    Object.assign(api, {
      async candidates() { return ok({ candidates: [unknownCandidate] }); },
      async knowledge(unitIds?: string[]) { return ok({ knowledge: unitIds ? allKnowledge.filter((row) => unitIds.includes(row.unitId)) : allKnowledge }); },
      vocabulary,
      async units(unitIds: string[]) { return ok({ units: {}, missing: unitIds }); },
    });
    rig.app.ctx.engine.exerciseReadiness = async () => ({ available: true });

    const recovery = vi.fn(async (request: Parameters<NonNullable<typeof rig.app.ctx.engine.recoverCandidates>>[0]) => {
      expect(request.unresolvedVocabulary).toHaveLength(101);
      expect(request.unresolvedVocabulary.some((item) => item.knowledge.unitId === targetId)).toBe(true);
      expect(request.knowledge.some((row) => row.unitId === targetId && row.languageId === 'he')).toBe(true);
      expect(request.knowledge.some((row) => row.languageId === 'fr')).toBe(false);
      expect(request.existingCandidates[0]?.eligibility.status).toBe('unknown');
      return { candidates: [recoveredCandidate], complete: true };
    });
    rig.app.ctx.engine.recoverCandidates = recovery;

    const who = await rig.app.ctx.identity();
    expect(who?.languageId).toBe('he');
    await seed(rig, [
      cardAdded(ids('L1', 'he'), 'due-review', 'written-recognition', '2026-09-01T09:00:00.000Z'),
      reviewed(ids('L1', 'he'), 'due-review', 'written-recognition', 4, '2026-09-01T10:00:00.000Z'),
      {
        id: 'he-lookup-event-only', v: CONTRACT_VERSION, learnerId: 'L1', enrolmentId: who!.enrolmentId, languageId: 'he', at: '2026-10-08T09:00:00.000Z',
        producer: { app: 'golearn-ext', version: 'test', deviceId: 'dev-old' }, kind: 'SelectionLookedUp',
        subject: { itemIds: [targetId] }, payload: { surface: 'בָּרָא', tokenCount: 1, contextKind: 'none', contextConfidence: 0, readerId: 'test', helpShown: [] }, dedupeKey: 'he-event-only-lookup',
      } satisfies GoEvent,
    ]);

    const model = await loadReviewModel(rig.app.ctx);
    expect(model).toBeDefined();
    expect(vocabulary).toHaveBeenCalledTimes(2);
    expect(recovery).toHaveBeenCalledTimes(1);
    expect(model!.knowledge.some((row) => row.unitId === targetId && row.languageId === 'he')).toBe(true);
    expect(model!.knowledge.some((row) => row.languageId === 'fr')).toBe(false);
    expect(model!.outcomes.find((outcome) => outcome.unitId === targetId)?.decision).toBe('test-now');
    const current = await planCurrentDeck(rig.app.ctx, model!, new Set(), undefined, 'current');
    const review = await planCurrentDeck(rig.app.ctx, model!, new Set(), undefined, 'review');
    expect(current.entries.some((entry) => entry.unitId === targetId)).toBe(true);
    expect(review.entries).toHaveLength(1);

    const snapKey = `gopractice:snapshot:L1:he`;
    const completeBefore = (await rig.area.get(snapKey))[snapKey] as { model?: { savedAt: string; candidates: ReviewCandidate[] } };
    Object.assign(api, {
      async candidates() { return ok({ candidates: [unknownCandidate] }); },
      async vocabulary({ after }: { after?: string }) {
        return after ? { ok: false as const, status: 503, error: 'offline', message: 'offline', body: {} }
          : ok({ items: [vocabRow(targetId)], nextCursor: 'recovery-page-2' });
      },
    });
    const partialRecovery = await loadReviewModel(rig.app.ctx);
    const completeAfter = (await rig.area.get(snapKey))[snapKey] as { model?: { savedAt: string; candidates: ReviewCandidate[] } };
    expect(partialRecovery?.candidateSource).toBe('cached');
    expect(partialRecovery?.knowledgeStatus.source).toBe('partial');
    expect(partialRecovery?.candidates?.some(candidate => candidate.unitId === targetId && candidate.eligibility.status === 'high-confidence')).toBe(true);
    expect(partialRecovery?.outcomes.find(outcome => outcome.unitId === targetId)?.decision).toBe('test-now');
    expect(completeAfter.model?.savedAt).toBe(completeBefore.model?.savedAt);
    expect(completeAfter.model?.candidates).toHaveLength(completeBefore.model!.candidates.length);
    await rig.go('settings');
    await rig.go('review');
    expect(rig.root.querySelector('#candidate-freshness')?.textContent).toContain('Using saved word data from');

    // A later conditional-read failure (for example, an IAB's repeated 304) uses
    // the complete enriched snapshot, not the earlier capped service page.
    Object.assign(api, { async candidates() { throw new TypeError('failed to construct Response with a null body status'); } });
    const offline = await loadReviewModel(rig.app.ctx);
    expect(offline?.candidateSource).toBe('cached');
    expect(offline?.candidates?.some((candidate) => candidate.unitId === targetId && candidate.eligibility.status === 'high-confidence')).toBe(true);
    expect(offline?.outcomes.find((outcome) => outcome.unitId === targetId)?.decision).toBe('test-now');
    expect(offline?.deck).toHaveLength(model!.deck.length);
    const staleIntake = vi.spyOn(rig.app.ctx.engine, 'intake').mockResolvedValue([{
      ...model!.outcomes.find(outcome => outcome.unitId === targetId)!, decision: 'needs-validation', proposed: undefined,
    }]);
    rig.app.ctx.engine.exerciseReadiness = vi.fn(async () => ({ available: false, retryable: false, reason: 'analysis invalidated; repair required' }));
    const blocked = await loadReviewModel(rig.app.ctx);
    expect(staleIntake).not.toHaveBeenCalled();
    expect(blocked?.candidates?.some(candidate => candidate.unitId === targetId)).toBe(true);
    expect(blocked?.outcomes.find(outcome => outcome.unitId === targetId)).toMatchObject({ decision: 'needs-validation', proposed: undefined });
    await rig.app.ctx.state.updatePrefs('L1', 'he', { practiceGoals: [] });
    const changedGoals = await loadReviewModel(rig.app.ctx);
    expect(changedGoals?.candidates?.some((candidate) => candidate.unitId === targetId)).toBe(false);
    expect(changedGoals?.outcomes.some((outcome) => outcome.unitId === targetId)).toBe(false);
  });

  it('keeps recovered words out of the Current Deck when recognition is disabled', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
    const rig = await makeRig({ service, signedIn: true });
    await clearReviewCopies(rig);
    rig.app.ctx.engine.canRecoverCandidates = () => true;
    const api = (await rig.app.ctx.api()).api;
    const row = vocabRow(targetId).knowledge;
    Object.assign(api, {
      async candidates() { return ok({ candidates: [unknownCandidate] }); },
      async knowledge() { return ok({ knowledge: [row] }); },
      async vocabulary() { return ok({ items: [vocabRow(targetId)] }); },
      async units(unitIds: string[]) { return ok({ units: {}, missing: unitIds }); },
    });
    rig.app.ctx.engine.recoverCandidates = async () => ({ candidates: [recoveredCandidate], complete: true });
    await rig.app.ctx.state.updatePrefs('L1', 'he', { practiceGoals: [] });
    const who = await rig.app.ctx.identity();
    await seed(rig, [{
      id: 'he-lookup-disabled-goal', v: CONTRACT_VERSION, learnerId: 'L1', enrolmentId: who!.enrolmentId, languageId: 'he', at: '2026-10-08T09:00:00.000Z',
      producer: { app: 'golearn-ext', version: 'test', deviceId: 'dev-old' }, kind: 'SelectionLookedUp',
      subject: { itemIds: [targetId] }, payload: { surface: 'בָּרָא', tokenCount: 1, contextKind: 'none', contextConfidence: 0, readerId: 'test', helpShown: [] }, dedupeKey: 'he-event-only-disabled-goal',
    } satisfies GoEvent]);
    const model = await loadReviewModel(rig.app.ctx);
    expect(model?.outcomes.find((outcome) => outcome.unitId === targetId)?.decision).toBe('low-priority');
    const current = await planCurrentDeck(rig.app.ctx, model!, new Set(), undefined, 'current');
    expect(current.entries.some((entry) => entry.unitId === targetId)).toBe(false);
  });

  it('honors a daily new-item allowance already spent today while keeping the due review', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
    const rig = await makeRig({ service, signedIn: true });
    await clearReviewCopies(rig);
    rig.app.ctx.engine.canRecoverCandidates = () => true;
    const api = (await rig.app.ctx.api()).api;
    const row = vocabRow(targetId).knowledge;
    Object.assign(api, {
      async candidates() { return ok({ candidates: [unknownCandidate] }); },
      async knowledge() { return ok({ knowledge: [row] }); },
      async vocabulary() { return ok({ items: [vocabRow(targetId)] }); },
      async units(unitIds: string[]) { return ok({ units: {}, missing: unitIds }); },
    });
    rig.app.ctx.engine.recoverCandidates = async () => ({ candidates: [recoveredCandidate], complete: true });
    await rig.app.ctx.state.updatePrefs('L1', 'he', { maxNew: 1, dailyNewLimit: 1 });
    const who = await rig.app.ctx.identity();
    await seed(rig, [
      cardAdded(ids('L1', 'he'), 'due-review', 'written-recognition', '2026-09-01T09:00:00.000Z'),
      reviewed(ids('L1', 'he'), 'due-review', 'written-recognition', 4, '2026-09-01T10:00:00.000Z'),
      cardAdded(ids('L1', 'he'), 'introduced-today', 'written-recognition', '2026-10-08T09:00:00.000Z'),
      reviewed(ids('L1', 'he'), 'introduced-today', 'written-recognition', 4, '2026-10-08T09:30:00.000Z'),
      {
        id: 'he-lookup-daily-budget', v: CONTRACT_VERSION, learnerId: 'L1', enrolmentId: who!.enrolmentId, languageId: 'he', at: '2026-10-08T09:15:00.000Z',
        producer: { app: 'golearn-ext', version: 'test', deviceId: 'dev-old' }, kind: 'SelectionLookedUp',
        subject: { itemIds: [targetId] }, payload: { surface: 'בָּרָא', tokenCount: 1, contextKind: 'none', contextConfidence: 0, readerId: 'test', helpShown: [] }, dedupeKey: 'he-event-only-daily-budget',
      } satisfies GoEvent,
    ]);
    const model = await loadReviewModel(rig.app.ctx);
    const current = await planCurrentDeck(rig.app.ctx, model!, new Set(), undefined, 'current');
    const review = await planCurrentDeck(rig.app.ctx, model!, new Set(), undefined, 'review');
    // no new admission: the Current Deck holds only deck fill (the not-due card introduced today, borrowed as early practice; 2026-11-03)
    expect(current.plan.items.filter(p => p.presentationReason !== 'deck-fill')).toHaveLength(0);
    expect(current.plan.items.every(p => p.presentationReason === 'deck-fill' && !p.isNew)).toBe(true);
    // the Review Deck keeps its one due review as an obligation; the not-due card introduced today completes it as deck fill
    expect(review.plan.items.filter(p => p.presentationReason !== 'deck-fill').map(p => p.item.unitId)).toHaveLength(1);
    expect(review.plan.items.filter(p => p.presentationReason === 'deck-fill')).toHaveLength(1);
    expect(explainAdmissions(model!, current)?.code).toBe('daily-allowance-used');
  });

  it('does not memoize a partial Hebrew recovery, so returning home retries it', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
    const rig = await makeRig({ service, signedIn: true });
    await clearReviewCopies(rig);
    rig.app.ctx.engine.canRecoverCandidates = () => true;
    const api = (await rig.app.ctx.api()).api;
    const row = vocabRow(targetId).knowledge;
    const candidates = vi.fn(async () => ok({ candidates: [unknownCandidate] }));
    Object.assign(api, {
      candidates,
      async knowledge() { return ok({ knowledge: [row] }); },
      async vocabulary() { return ok({ items: [vocabRow(targetId)] }); },
      async units(unitIds: string[]) { return ok({ units: {}, missing: unitIds }); },
    });
    rig.app.ctx.engine.recoverCandidates = async () => ({ candidates: [], complete: false, note: 'Hebrew facts are still loading.' });
    forgetPaintedHome(rig.app.ctx);

    await rig.go('settings');
    await rig.go('review');
    expect(candidates).toHaveBeenCalledTimes(1);
    await rig.go('settings');
    await rig.go('review');
    expect(candidates).toHaveBeenCalledTimes(2);
    const identity = await rig.app.ctx.identity();
    const snap = (await rig.area.get(`gopractice:snapshot:${identity!.learnerId}:${identity!.languageId}`))[`gopractice:snapshot:${identity!.learnerId}:${identity!.languageId}`] as { model?: unknown } | undefined;
    expect(snap?.model).toBeUndefined();
  });

  it.each(['page-error', 'repeated-cursor'] as const)('discards all candidate pages on %s', async (failure) => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
    const rig = await makeRig({ service, signedIn: true });
    await clearReviewCopies(rig);
    const api = (await rig.app.ctx.api()).api;
    let page = 0;
    Object.assign(api, {
      async candidates() {
        page += 1;
        if (page === 1) return ok({ candidates: [unknownCandidate], nextCursor: 'p2' });
        return failure === 'page-error'
          ? { ok: false as const, status: 503, error: 'offline', message: 'offline', body: {} }
          : ok({ candidates: [unknownCandidate], nextCursor: 'p2' });
      },
    });
    const intake = vi.spyOn(rig.app.ctx.engine, 'intake');
    const model = await loadReviewModel(rig.app.ctx);
    expect(model?.candidateSource).toBe('none');
    expect(model?.candidates).toEqual([]);
    expect(model?.outcomes).toEqual([]);
    expect(intake).not.toHaveBeenCalled();
  });

  it('uses the shared reading-aware order and fills past a candidate whose current builder refuses', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
    const rig = await makeRig({ service, signedIn: true });
    rig.app.ctx.engine.canRecoverCandidates = () => true;
    const api = (await rig.app.ctx.api()).api;
    await rig.app.ctx.state.updatePrefs('L1', 'he', { maxNew: 1, dailyNewLimit: 10 });
    const who = (await rig.app.ctx.identity())!;
    const now = rig.app.ctx.deps.now();
    const relevantId = 'form:he:relevant-lower-score';
    const rawWinnerId = 'form:he:raw-higher-score';
    const candidates: ReviewCandidate[] = [
      { ...recoveredCandidate, unitId: rawWinnerId, score: 0.9 },
      { ...recoveredCandidate, unitId: relevantId, score: 0.6 },
    ];
    const knowledge = [relevantId, rawWinnerId].map(unitId => ({ ...knowledgeRow('L1', unitId, 'he', {}), encounters: 3,
      lastSeenAt: new Date(now.getTime() - 60_000).toISOString() }));
    Object.assign(api, {
      async candidates() { return ok({ candidates }); },
      async knowledge(unitIds?: string[]) { return ok({ knowledge: unitIds ? knowledge.filter(row => unitIds.includes(row.unitId)) : knowledge }); },
      async vocabulary() { return ok({ items: [] }); },
    });
    rig.app.ctx.engine.recoverCandidates = async () => ({ candidates: [], complete: true });
    const outcomes = candidates.map(candidate => ({ unitId: candidate.unitId, candidate, knowledge: knowledge.find(row => row.unitId === candidate.unitId), decision: 'test-now' as const, reasons: [],
      proposed: { dimension: 'written-recognition' as const, family: 'written-recognition' as const },
    }));
    rig.app.ctx.engine.intake = vi.fn(async () => outcomes);
    const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
    const signals = [0, 1, 2].map((n): GoEvent => ({
      id: `relevance-${n}`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'he', at: at(n + 2),
      producer: { app: 'golearn-ext', version: 'test', deviceId: 'dev-old' }, kind: 'SelectionLookedUp',
      subject: { itemIds: [relevantId], sentenceKey: `sentence-${n}`, sourceRef: { kind: 'web', locator: 'reader:test' } },
      payload: { surface: 'test', tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'test', helpShown: [] }, dedupeKey: `relevance-${n}`,
    }));
    await seed(rig, signals);
    const built: string[] = [];
    rig.app.ctx.engine.exerciseReadiness = vi.fn(async request => {
      built.push(request.unitId);
      return request.unitId === relevantId ? { available: false, reason: 'no reliable answer' } : { available: true };
    });
    const model = await loadReviewModel(rig.app.ctx);
    expect(built).toEqual([relevantId, rawWinnerId]);
    expect(model?.outcomes.find(outcome => outcome.unitId === rawWinnerId)?.decision).toBe('test-now');
    expect(model?.outcomes.find(outcome => outcome.unitId === relevantId)).toMatchObject({ decision: 'needs-validation', proposed: undefined });
    built.length = 0;
    rig.app.ctx.engine.exerciseReadiness = vi.fn(async request => { built.push(request.unitId); return { available: true }; });
    const readyModel = await loadReviewModel(rig.app.ctx);
    expect(built).toEqual([relevantId]);
    expect(readyModel?.outcomes.find(outcome => outcome.unitId === relevantId)?.decision).toBe('test-now');
    expect(readyModel?.outcomes.find(outcome => outcome.unitId === rawWinnerId)?.decision).toBe('test-later');
  });

  it('keeps the last good prepared snapshot across transient readiness failure but persists a definitive veto', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
    const rig = await makeRig({ service, signedIn: true });
    rig.app.ctx.engine.canRecoverCandidates = () => true;
    const api = (await rig.app.ctx.api()).api;
    const row = vocabRow(targetId).knowledge;
    Object.assign(api, {
      async candidates() { return ok({ candidates: [recoveredCandidate] }); },
      async knowledge(unitIds?: string[]) { return ok({ knowledge: unitIds ? [row].filter(k => unitIds.includes(k.unitId)) : [row] }); },
      async vocabulary() { return ok({ items: [vocabRow(targetId)] }); },
    });
    rig.app.ctx.engine.recoverCandidates = async () => ({ candidates: [recoveredCandidate], complete: true });
    rig.app.ctx.engine.intake = async () => [{ unitId: targetId, candidate: recoveredCandidate, knowledge: row, decision: 'test-now', reasons: [],
      proposed: { dimension: 'written-recognition', family: 'written-recognition' } }];
    rig.app.ctx.engine.exerciseReadiness = async () => ({ available: true });
    await loadReviewModel(rig.app.ctx);

    const key = 'gopractice:snapshot:L1:he';
    // the open home counts the words in the background once the model lands (2026-11-10: it no longer waits for it); let that write finish first
    await until(async () => !!((await rig.area.get(key))[key] as { vocab?: unknown } | undefined)?.vocab, 'the vocabulary copy of the open home');
    const saved = (await rig.area.get(key))[key];
    const cacheKey = (await rig.area.list('gopractice:candidates:L1:L1-e1:'))[0]!;
    const cachedCandidates = (await rig.area.get(cacheKey))[cacheKey];
    rig.app.ctx.engine.exerciseReadiness = async () => { throw new Error('temporary provider failure'); };
    const transient = await loadReviewModel(rig.app.ctx);
    expect(transient?.candidateReadinessIncomplete).toBe(true);
    expect(transient?.outcomes.find(outcome => outcome.unitId === targetId)?.decision).toBe('needs-validation');
    expect((await rig.area.get(key))[key]).toEqual(saved);
    expect((await rig.area.get(cacheKey))[cacheKey]).toEqual(cachedCandidates);

    rig.app.ctx.engine.exerciseReadiness = async () => ({ available: false, retryable: true, reason: 'temporary dictionary lookup failure' });
    const retryable = await loadReviewModel(rig.app.ctx);
    expect(retryable?.candidateReadinessIncomplete).toBe(true);
    expect((await rig.area.get(key))[key]).toEqual(saved);
    expect((await rig.area.get(cacheKey))[cacheKey]).toEqual(cachedCandidates);

    rig.app.ctx.engine.exerciseReadiness = async () => ({ available: false, retryable: false, reason: 'source reading invalidated' });
    const definitive = await loadReviewModel(rig.app.ctx);
    expect(definitive?.candidateReadinessIncomplete).toBeFalsy();
    expect(definitive?.outcomes.find(outcome => outcome.unitId === targetId)).toMatchObject({ decision: 'needs-validation', proposed: undefined });
    const durable = (await rig.area.get(key))[key] as { model?: { outcomes: Array<{ unitId: string; decision: string }> } };
    expect(durable.model?.outcomes.find(outcome => outcome.unitId === targetId)?.decision).toBe('needs-validation');

    Object.assign(api, { async candidates() { throw new Error('offline'); } });
    const offline = await loadReviewModel(rig.app.ctx);
    expect(offline?.candidateSource).toBe('cached');
    expect(offline?.outcomes.find(outcome => outcome.unitId === targetId)?.decision).toBe('needs-validation');
  });
});
