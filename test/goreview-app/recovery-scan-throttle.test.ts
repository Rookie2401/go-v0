// @vitest-environment jsdom
/**
 * The GoReview home's recovery scan (a walk of every vocabulary page plus the whole knowledge) is costly for the service: about 100 MB for a learner
 * of 3,500 words. On 2026-11-12 an open home re-ran it on every live update and after every restart, and Render's 512 MB instance ran out of memory
 * after each walk, again and again. Now: one walk at a time; nothing asked within ten minutes of a complete walk; then one page, and the last walk is
 * reused while the vocabulary has not grown (for at most two hours); only complete walks are kept.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ReviewCandidate, UnitKnowledge } from '../../packages/repository-contract/src';
import type { VocabularyItem } from '../../packages/repository-service/src/api';
import { PRESS_WAIT_MS, RECOVERY_SCAN_MAX_AGE_MS, RECOVERY_SCAN_MIN_INTERVAL_MS, RECOVERY_SCAN_PRESS_MIN_MS, currentReviewModel, liveModelWithNewWords, loadReviewModel } from '../../packages/goreview/app/workspace';
import { forgetPaintedHome } from '../../packages/goreview/app/screens/review';
import { FakeService, destroyRigs, knowledgeRow, makeRig, reopen, until } from './helpers';

afterEach(() => { destroyRigs(); });

const ok = <T>(data: T) => ({ ok: true as const, status: 200, data });
const fail = { ok: false as const, status: 502, error: 'bad-gateway', message: 'the service is restarting', body: {} };
const unknownCandidate = (unitId: string): ReviewCandidate => ({
  unitId, kind: 'unknown', score: 0, reasons: [], targetDimension: 'readingRecognition',
  eligibility: { eligible: false, status: 'unknown', reason: 'unit is not in the linguistic store' }, cost: 0.2,
});
const vocabRow = (unitId: string): VocabularyItem => ({ knowledge: { ...knowledgeRow('L1', unitId, 'he', {}), analysisStatus: 'high-confidence' } as UnitKnowledge, surfaceForms: [unitId], sources: [] });
const ids = Array.from({ length: 250 }, (_, i) => `form:he:w${i}`);

/** A service whose vocabulary is `size` rows long, 100 a page; it counts what it is asked. `pageMs`: each page takes that long (real time). */
async function rigWith(size: () => number, opts: { failAfterFirstPage?: () => boolean; pageMs?: () => number } = {}) {
  const service = new FakeService();
  service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
  const rig = await makeRig({ service, signedIn: true });
  rig.app.ctx.engine.canRecoverCandidates = () => true;
  const recovered: number[] = []; // how many words without a catalogue unit each build handed to the recovery
  rig.app.ctx.engine.recoverCandidates = async (input: { unresolvedVocabulary: unknown[] }) => { recovered.push(input.unresolvedVocabulary.length); return { candidates: [], complete: true }; };
  const api = (await rig.app.ctx.api()).api;
  const calls = { pages: 0, knowledge: 0 }; // every vocabulary page, and every whole knowledge read
  const scan = { pages: 0 }; // the recovery scan's pages only (unsorted): the home's word count walks the list sorted by recency
  const pause = (): Promise<void> => new Promise((r) => setTimeout(r, opts.pageMs?.() ?? 0));
  Object.assign(api, {
    async candidates() { return ok({ candidates: [unknownCandidate(ids[0]!)] }); },
    async units(unitIds: string[]) { return ok({ units: {}, missing: unitIds }); },
    async knowledge(unitIds?: string[]) { if (!unitIds?.length) calls.knowledge++; return ok({ knowledge: (unitIds?.length ? unitIds : ids.slice(0, size())).map((id) => vocabRow(id).knowledge) }); }, // only a WHOLE read is counted: the home also asks for single words
    async vocabulary({ after, sort }: { after?: string; sort?: string }) {
      calls.pages++; if (!sort) scan.pages++;
      if (opts.pageMs) await pause();
      const from = after ? Number(after) : 0;
      if (from > 0 && opts.failAfterFirstPage?.()) return fail;
      const n = size();
      const items = ids.slice(from, Math.min(n, from + 100)).map(vocabRow);
      return ok({ items, ...(from + 100 < n ? { nextCursor: String(from + 100) } : {}), catalog: { total: n, counts: { new: n, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 } } });
    },
  });
  return { rig, calls, recovered, scan };
}
const later = (rig: Awaited<ReturnType<typeof makeRig>>, ms: number): void => rig.clock.set(new Date(rig.clock.now.getTime() + ms).toISOString());

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

describe('"New deck" walks afresh, so the words met since count (the owner, 2026-11-12)', () => {
  it('a word added inside the ten minutes is missed by a plain refresh and found by New deck', async () => {
    let size = 240;
    const { rig, calls, recovered, scan } = await rigWith(() => size);
    await loadReviewModel(rig.app.ctx);
    expect(recovered.at(-1)).toBe(240);
    size = 241; // the learner meets a new word in GoLearn
    later(rig, 2 * 60_000);
    await loadReviewModel(rig.app.ctx);
    expect(recovered.at(-1)).toBe(240); // the reused walk does not know it yet
    expect({ scan: scan.pages, knowledge: calls.knowledge }).toEqual({ scan: 3, knowledge: 1 });
    const live = await liveModelWithNewWords(rig.app.ctx, 5_000);
    expect(live).toBeDefined();
    expect({ scan: scan.pages, knowledge: calls.knowledge, recovered }).toEqual({ scan: 6, knowledge: 2, recovered: [240, 240, 241] }); // a full walk, though only two minutes have passed
  });

  it('pressing New deck again within a minute does not walk again; after a minute it does', async () => {
    const { rig, calls, scan } = await rigWith(() => 250);
    const seen = (): unknown => ({ scan: scan.pages, knowledge: calls.knowledge });
    await loadReviewModel(rig.app.ctx);
    later(rig, 5 * 60_000);
    await liveModelWithNewWords(rig.app.ctx, 5_000);
    expect(seen()).toEqual({ scan: 6, knowledge: 2 });
    later(rig, RECOVERY_SCAN_PRESS_MIN_MS - 5_000);
    await liveModelWithNewWords(rig.app.ctx, 5_000);
    await liveModelWithNewWords(rig.app.ctx, 5_000);
    expect(seen()).toEqual({ scan: 6, knowledge: 2 }); // the walk is under a minute old: reused
    later(rig, 10_000);
    await liveModelWithNewWords(rig.app.ctx, 5_000);
    expect(seen()).toEqual({ scan: 9, knowledge: 3 });
    later(rig, 60_000);
    await loadReviewModel(rig.app.ctx); // an ordinary refresh after the press keeps the ten-minute reuse
    expect(seen()).toEqual({ scan: 9, knowledge: 3 });
  });

  it('the press waits at most PRESS_WAIT_MS for a slow walk, and the home keeps painting from the device meanwhile', async () => {
    let slow = 0;
    const { rig, calls, scan } = await rigWith(() => 250, { pageMs: () => slow });
    await loadReviewModel(rig.app.ctx); // a complete deck saved on this device
    later(rig, 2 * 60_000);
    slow = 1_000; // the service now takes a second a page: the walk takes three
    const t0 = performance.now();
    const live = await liveModelWithNewWords(rig.app.ctx);
    const pressed = performance.now() - t0;
    expect(live).toBeUndefined(); // too late for this press: it plans from the device's copy
    expect(pressed).toBeGreaterThanOrEqual(PRESS_WAIT_MS - 50);
    expect(pressed).toBeLessThan(PRESS_WAIT_MS + 400);
    const t1 = performance.now();
    const painted = await currentReviewModel(rig.app.ctx, { noRefresh: true }); // the home opening while the walk runs
    expect(painted).toBeDefined();
    expect(performance.now() - t1).toBeLessThan(250);
    for (const stop = Date.now() + 6_000; calls.knowledge < 2 && Date.now() < stop;) await new Promise((r) => setTimeout(r, 50));
    expect({ scan: scan.pages, knowledge: calls.knowledge }).toEqual({ scan: 6, knowledge: 2 }); // the walk finished in the background
  }, 15_000);

  it('the home\'s New deck button asks for the fresh walk', async () => {
    const { rig, calls, scan } = await rigWith(() => 250);
    forgetPaintedHome(rig.app.ctx); // the home was painted before this test's service was in place
    await reopen(rig);
    await until(() => calls.knowledge >= 1, 'the home\'s first walk');
    const before = { scan: scan.pages, knowledge: calls.knowledge };
    later(rig, 2 * 60_000);
    (rig.q('#start-new') as HTMLElement).click();
    await until(() => calls.knowledge === before.knowledge + 1, 'the press\'s walk');
    expect(scan.pages).toBe(before.scan + 3);
  });
});

describe('the home\'s word count does not walk the vocabulary on every live update (2026-11-12)', () => {
  it('a complete list saved under ten minutes ago gives the count; after ten minutes it is walked again', async () => {
    const { rig, calls, scan } = await rigWith(() => 250);
    const sorted = (): number => calls.pages - scan.pages;
    forgetPaintedHome(rig.app.ctx);
    await reopen(rig);
    await until(() => sorted() >= 3, 'the first count walk');
    expect(sorted()).toBe(3);
    await until(() => /250 words/.test(rig.q('#vocab-count').textContent ?? ''), 'the count');
    later(rig, 3 * 60_000);
    forgetPaintedHome(rig.app.ctx);
    await reopen(rig); // a repaint with a live model, three minutes on
    await until(() => /250 words/.test(rig.q('#vocab-count').textContent ?? ''), 'the count again');
    expect(sorted()).toBe(3); // no second walk: the saved list gave it
    later(rig, 10 * 60_000);
    forgetPaintedHome(rig.app.ctx);
    await reopen(rig);
    await until(() => sorted() >= 6, 'the walk after ten minutes');
    expect(sorted()).toBe(6);
  });
});
