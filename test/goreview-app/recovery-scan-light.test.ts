// @vitest-environment jsdom
/**
 * The GoReview home's recovery scan asks the service for the light listing of rows with no catalogue unit (2026-11-13): it reads nothing else of a
 * vocabulary row, and a full page made the service read up to 25 events for each of its 100 rows. A service older than that ignores the two
 * parameters and answers in full, so the scan must reach the same rows either way.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { LinguisticUnit, ReviewCandidate, UnitKnowledge } from '../../packages/repository-contract/src';
import type { VocabularyItem, VocabularyQuery } from '../../packages/repository-service/src/api';
import { loadReviewModel } from '../../packages/goreview/app/workspace';
import { FakeService, destroyRigs, knowledgeRow, makeRig } from './helpers';

afterEach(() => { destroyRigs(); });

const ok = <T>(data: T) => ({ ok: true as const, status: 200, data });
const unknownCandidate = (unitId: string): ReviewCandidate => ({
  unitId, kind: 'unknown', score: 0, reasons: [], targetDimension: 'readingRecognition',
  eligibility: { eligible: false, status: 'unknown', reason: 'unit is not in the linguistic store' }, cost: 0.2,
});
const ids = Array.from({ length: 230 }, (_, i) => `form:he:w${String(i).padStart(3, '0')}`);
const catalogued = (i: number): boolean => i % 4 !== 1; // 57 of the 230 have no catalogue unit
const row = (i: number, full: boolean): VocabularyItem => ({
  knowledge: { ...knowledgeRow('L1', ids[i]!, 'he', {}), analysisStatus: 'high-confidence' } as UnitKnowledge,
  ...(catalogued(i) ? { unit: { unitId: ids[i]!, languageId: 'he', label: `w${i}`, kind: 'form' } as LinguisticUnit } : {}),
  surfaceForms: full ? [`w${i}`, `x${i}`] : catalogued(i) ? [`w${i}`] : [], sources: full ? [{ kind: 'demo', title: 'Reader' }] : [],
});

async function scanAgainst(honoursLight: boolean) {
  const service = new FakeService();
  service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
  const rig = await makeRig({ service, signedIn: true });
  const asked: VocabularyQuery[] = [];
  let recovered: string[] | undefined;
  rig.app.ctx.engine.canRecoverCandidates = () => true;
  rig.app.ctx.engine.recoverCandidates = async (request) => { recovered = request.unresolvedVocabulary.map((item) => item.knowledge.unitId); return { candidates: [], complete: true }; };
  const api = (await rig.app.ctx.api()).api;
  const catalog = { total: ids.length, counts: { new: ids.length, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 } };
  Object.assign(api, {
    async candidates() { return ok({ candidates: [unknownCandidate(ids[1]!)] }); },
    async units(unitIds: string[]) { return ok({ units: {}, missing: unitIds }); },
    async knowledge(unitIds?: string[]) { return ok({ knowledge: (unitIds?.length ? unitIds : ids).map((id) => row(ids.indexOf(id), false).knowledge) }); },
    async vocabulary(query: VocabularyQuery) {
      asked.push(query);
      const from = query.after ? Number(query.after) : 0;
      if (honoursLight && query.detail === 'light') {
        // the service of 2026-11-13: only the rows asked for, without their detail; a whole vocabulary of this size is one response
        const all = ids.map((_, i) => i).filter((i) => query.catalogued === undefined || catalogued(i) === query.catalogued);
        const items = all.slice(from, from + 100).map((i) => row(i, false));
        return ok({ items, catalog, detail: 'light' as const, ...(from + 100 < all.length ? { nextCursor: String(from + 100) } : {}) });
      }
      // an older service: every row in full, 100 a page, the two parameters ignored
      const items = ids.slice(from, from + 100).map((_, k) => row(from + k, true));
      return ok({ items, catalog, ...(from + 100 < ids.length ? { nextCursor: String(from + 100) } : {}) });
    },
  });
  await loadReviewModel(rig.app.ctx);
  return { asked, recovered };
}

describe('the home recovery scan asks for the light listing', () => {
  const expected = ids.filter((_, i) => !catalogued(i));

  it('every page it asks for is light and limited to the rows with no catalogue unit, and one response answers a whole vocabulary', async () => {
    const { asked, recovered } = await scanAgainst(true);
    expect(asked.length).toBe(1);
    expect(asked.every((q) => q.detail === 'light' && q.catalogued === false && q.sort === undefined && q.languageId === 'he')).toBe(true);
    expect(recovered).toEqual(expected);
  });

  it('reaches the same rows on a service that ignores the parameters and answers in full', async () => {
    const { asked, recovered } = await scanAgainst(false);
    expect(asked.length).toBe(3); // the old walk: every page
    expect(recovered).toEqual(expected);
  });
});
