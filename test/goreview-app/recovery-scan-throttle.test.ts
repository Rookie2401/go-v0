// @vitest-environment jsdom
/**
 * The GoReview home's recovery scan (a walk of every vocabulary page plus the whole knowledge) is costly for the service: about 100 MB for a learner
 * of 3,500 words. On 2026-11-12 an open home re-ran it on every live update and after every restart, and Render's 512 MB instance ran out of memory
 * after each walk, again and again. Now: one walk at a time; nothing asked within ten minutes of a complete walk; then one page, and the last walk is
 * reused while the vocabulary has not grown (for at most two hours); only complete walks are kept.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewCandidate, UnitKnowledge } from '../../packages/repository-contract/src';
import type { VocabularyItem } from '../../packages/repository-service/src/api';
import { RECOVERY_SCAN_MAX_AGE_MS, RECOVERY_SCAN_MIN_INTERVAL_MS, loadReviewModel } from '../../packages/goreview/app/workspace';
import { FakeService, destroyRigs, knowledgeRow, makeRig } from './helpers';

afterEach(() => { destroyRigs(); });

const ok = <T>(data: T) => ({ ok: true as const, status: 200, data });
const fail = { ok: false as const, status: 502, error: 'bad-gateway', message: 'the service is restarting', body: {} };
const unknownCandidate = (unitId: string): ReviewCandidate => ({
  unitId, kind: 'unknown', score: 0, reasons: [], targetDimension: 'readingRecognition',
  eligibility: { eligible: false, status: 'unknown', reason: 'unit is not in the linguistic store' }, cost: 0.2,
});
const vocabRow = (unitId: string): VocabularyItem => ({ knowledge: { ...knowledgeRow('L1', unitId, 'he', {}), analysisStatus: 'high-confidence' } as UnitKnowledge, surfaceForms: [unitId], sources: [] });
const ids = Array.from({ length: 250 }, (_, i) => `form:he:w${i}`);

/** A service whose vocabulary is `size` rows long, 100 a page; it counts what it is asked. */
async function rigWith(size: () => number, opts: { failAfterFirstPage?: () => boolean } = {}) {
  const service = new FakeService();
  service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
  const rig = await makeRig({ service, signedIn: true });
  rig.app.ctx.engine.canRecoverCandidates = () => true;
  rig.app.ctx.engine.recoverCandidates = async () => ({ candidates: [], complete: true });
  const api = (await rig.app.ctx.api()).api;
  const calls = { pages: 0, knowledge: 0 };
  Object.assign(api, {
    async candidates() { return ok({ candidates: [unknownCandidate(ids[0]!)] }); },
    async units(unitIds: string[]) { return ok({ units: {}, missing: unitIds }); },
    async knowledge(unitIds?: string[]) { if (!unitIds?.length) calls.knowledge++; return ok({ knowledge: (unitIds?.length ? unitIds : ids.slice(0, size())).map((id) => vocabRow(id).knowledge) }); }, // only a WHOLE read is counted: the home also asks for single words
    async vocabulary({ after }: { after?: string }) {
      calls.pages++;
      const from = after ? Number(after) : 0;
      if (from > 0 && opts.failAfterFirstPage?.()) return fail;
      const n = size();
      const items = ids.slice(from, Math.min(n, from + 100)).map(vocabRow);
      return ok({ items, ...(from + 100 < n ? { nextCursor: String(from + 100) } : {}), catalog: { total: n, counts: { new: n, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 } } });
    },
  });
  return { rig, calls };
}

describe('the home recovery scan, reused instead of re-walked', () => {
  it('a second home build inside ten minutes asks nothing: no page and no knowledge read', async () => {
    const { rig, calls } = await rigWith(() => 250);
    await loadReviewModel(rig.app.ctx);
    expect(calls).toEqual({ pages: 3, knowledge: 1 }); // the first build walks all three pages
    rig.clock.set(new Date(rig.clock.now.getTime() + RECOVERY_SCAN_MIN_INTERVAL_MS - 1000).toISOString());
    await loadReviewModel(rig.app.ctx);
    await loadReviewModel(rig.app.ctx);
    expect(calls).toEqual({ pages: 3, knowledge: 1 });
  });

  it('after ten minutes one page is asked; the same size reuses the last walk, a grown vocabulary walks again', async () => {
    let size = 250;
    const { rig, calls } = await rigWith(() => size);
    await loadReviewModel(rig.app.ctx);
    rig.clock.set(new Date(rig.clock.now.getTime() + RECOVERY_SCAN_MIN_INTERVAL_MS + 1000).toISOString());
    await loadReviewModel(rig.app.ctx);
    expect(calls).toEqual({ pages: 4, knowledge: 1 }); // one page, then the last walk
    size = 240; // the learner's vocabulary changed size (here it shrank: any change counts)
    rig.clock.set(new Date(rig.clock.now.getTime() + RECOVERY_SCAN_MIN_INTERVAL_MS + 1000).toISOString());
    await loadReviewModel(rig.app.ctx);
    expect(calls).toEqual({ pages: 7, knowledge: 2 }); // a full walk again
  });

  it('a walk older than two hours is repeated even if the vocabulary did not grow', async () => {
    const { rig, calls } = await rigWith(() => 250);
    await loadReviewModel(rig.app.ctx);
    rig.clock.set(new Date(rig.clock.now.getTime() + RECOVERY_SCAN_MAX_AGE_MS + 1000).toISOString());
    await loadReviewModel(rig.app.ctx);
    expect(calls).toEqual({ pages: 6, knowledge: 2 });
  });

  it('two homes built at once share one walk', async () => {
    const { rig, calls } = await rigWith(() => 250);
    await Promise.all([loadReviewModel(rig.app.ctx), loadReviewModel(rig.app.ctx), loadReviewModel(rig.app.ctx)]);
    expect(calls).toEqual({ pages: 3, knowledge: 1 });
  });

  it('a walk that failed part-way (a restarting service) is not kept: the next build walks again at once', async () => {
    let failing = true;
    const { rig, calls } = await rigWith(() => 250, { failAfterFirstPage: () => failing });
    const partial = await loadReviewModel(rig.app.ctx);
    expect(partial?.candidateRecoveryIncomplete ?? true).toBe(true);
    expect(calls.pages).toBe(2); // the first page, then the failing second
    // the home's own retry of a partial result runs once and stops (measured over three seconds): no loop against a restarting service
    await new Promise((r) => setTimeout(r, 1000));
    expect(calls.pages).toBe(4);
    await new Promise((r) => setTimeout(r, 1000));
    expect(calls.pages).toBe(4);
    failing = false;
    await loadReviewModel(rig.app.ctx);
    expect(calls.pages).toBe(7); // no ten-minute wait after a failure: a full walk
    await loadReviewModel(rig.app.ctx);
    expect(calls.pages).toBe(7); // and that complete walk is now reused
  });
});
