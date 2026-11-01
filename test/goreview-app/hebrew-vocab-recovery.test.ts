// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoEvent, ReviewCandidate, UnitKnowledge } from '../../packages/repository-contract/src';
import type { VocabularyItem } from '../../packages/repository-service/src/api';
import { loadReviewModel } from '../../packages/goreview/app/workspace';
import { planCurrentDeck } from '../../packages/goreview/app/deckModel';
import { explainAdmissions } from '../../packages/goreview/app/admissionExplanation';
import { forgetPaintedHome } from '../../packages/goreview/app/screens/review';
import { CONTRACT_VERSION } from '../../packages/repository-contract/src';
import { FakeService, cardAdded, destroyRigs, ids, knowledgeRow, makeRig, reviewed, seed } from './helpers';

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

describe('workspace Hebrew recovery', () => {
  it('reads every raw missing-unit page and recovers a Current Deck card beside a due Review Deck card', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
    const rig = await makeRig({ service, signedIn: true });
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
  });

  it('keeps recovered words out of the Current Deck when recognition is disabled', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
    const rig = await makeRig({ service, signedIn: true });
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
    expect(current.entries).toHaveLength(0);
    expect(review.entries).toHaveLength(1);
    expect(explainAdmissions(model!, current)?.code).toBe('daily-allowance-used');
  });

  it('does not memoize a partial Hebrew recovery, so returning home retries it', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
    const rig = await makeRig({ service, signedIn: true });
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
  });
});
