// @vitest-environment node
/**
 * The word list is shared by every account, so one learner's correction must not change what another learner reads (the readiness audit of
 * 2026-11-03, S1: any account could replace any word's analysis for everyone). The real linguistic service over a real store, two accounts. The same
 * calls with `applyLearnerCorrections` (a Repository with one learner) are the control: they do change the row, so these assertions can see the hole.
 */
import { describe, expect, it } from 'vitest';
import type { FormAnalysis, LinguisticUnit } from '../../../packages/repository-contract/src';
import { createLinguisticService } from '../../../packages/repository-linguistics/src';
import { adaptLinguistics } from '../../../packages/repository-service/src/linguistics-adapter';
import { createMemoryStore } from '../../../packages/repository-store/src';
import { summariseCorrectionReports } from '../../../scripts/ops/lib.mts';
import { call, hardening, member } from './hardening';

const FORM = 'form:sq:librin';
const GOOD = 'lemma:sq:libër:NOUN';
const BAD = 'lemma:sq:vandal:NOUN';
const provenance = { source: 'parser', ref: 'test', confidence: 0.9 };

async function world(apply?: boolean) {
  const h = await hardening((now) => createMemoryStore({ now }));
  h.deps.linguistics = adaptLinguistics(createLinguisticService(h.store, { now: h.clock.now }));
  if (apply) h.deps.applyLearnerCorrections = true;
  const unit = (unitId: string, kind: LinguisticUnit['kind'], label: string): LinguisticUnit => ({
    unitId, kind, languageId: 'sq', label, packId: 'p', packVersion: '1', provenance, status: 'provisional', createdAt: h.clock.now(),
  });
  await h.store.putUnits([unit(FORM, 'form', 'librin'), unit(GOOD, 'lexeme', 'libër')]);
  const analysis: FormAnalysis = {
    analysisId: 'analysis:shared', formId: FORM, languageId: 'sq', candidates: [{ lexemeId: GOOD, confidence: 0.9, provenance }], chosen: 0,
    status: 'provisional', analyzerId: 'parser', packId: 'p', packVersion: '1', createdAt: h.clock.now(),
  };
  await h.store.putAnalyses([analysis]);
  await h.store.putRelations([{ fromId: FORM, relation: 'form-of', toId: GOOD, confidence: 0.9, provenance, status: 'provisional' }]);
  const shared = async () => ({
    units: await h.store.getUnits([FORM, GOOD, BAD]),
    analyses: await h.store.analysesOfForm(FORM),
    relations: await h.store.relationsOf(FORM, 'out'),
  });
  return { h, shared, a: await member(h, 'a@example.test'), b: await member(h, 'b@example.test') };
}

const unitRoute = `/units/${encodeURIComponent(FORM)}/corrections`;

describe('one account cannot change the shared word list', () => {
  it('the control: on a Repository with one learner, the same correction replaces the analysis', async () => {
    const { h, shared, a } = await world(true);
    const before = await shared();
    const r = await call(h, 'POST', '/corrections', { token: a.token, body: { formId: FORM, lexemeId: BAD, reason: 'no' } });
    expect(r.status).toBe(200);
    expect(r.body.result.analysis).toBeDefined();
    expect(await shared()).not.toEqual(before);
    expect((await h.store.getAnalysis('analysis:shared'))!.status).toBe('invalidated');
  });

  it('POST /corrections leaves every shared row as it was, for a named lexeme, features and a sentence', async () => {
    const { h, shared, a } = await world();
    const before = await shared();
    for (const body of [
      { formId: FORM, lexemeId: BAD, reason: 'replace it' },
      { formId: FORM, features: { Case: 'Nom' } },
      { formId: FORM, lexemeId: BAD, features: { Case: 'Nom' }, sentenceKey: 'ab12' },
    ]) {
      const r = await call(h, 'POST', '/corrections', { token: a.token, body });
      expect(r.status).toBe(200);
      expect(r.body.result).toBeUndefined();
    }
    expect(await shared()).toEqual(before);
    expect(before.units.map((u) => u.unitId)).not.toContain(BAD); // a client-chosen id is not created
  });

  it('POST /units/:id/corrections leaves the row as it was: no status moved, no text on a row every learner reads', async () => {
    const { h, shared, a } = await world();
    const before = await shared();
    for (const body of [{ reason: 'flag it for everyone' }, { reason: 'replace it', lexemeId: BAD }, { reason: 'wrong', from: GOOD, to: BAD }]) {
      const r = await call(h, 'POST', unitRoute, { token: a.token, body });
      expect(r.status).toBe(200);
      expect(r.body.statusChanged).toBe(false);
      expect(r.body.unit.status).toBe('provisional');
    }
    expect(await shared()).toEqual(before);
    expect(JSON.stringify(await shared())).not.toContain('flag it for everyone');
  });

  it('a hundred reports by one account fill nothing, and the second learner can still report', async () => {
    const { h, shared, a, b } = await world();
    const before = await shared();
    for (let i = 0; i < 100; i++) expect((await call(h, 'POST', unitRoute, { token: a.token, body: { reason: `report ${i}` } })).status).toBe(200);
    expect((await call(h, 'POST', unitRoute, { token: b.token, body: { reason: 'mine too' } })).status).toBe(200);
    expect(await shared()).toEqual(before);
  });

  it('the report stays with the learner who made it: in their log and export, not in the other learner\'s, and gone with their account', async () => {
    const { h, a, b } = await world();
    await call(h, 'POST', '/corrections', { token: a.token, body: { formId: FORM, lexemeId: BAD, reason: 'my reason' } });
    const mine = await h.store.list({ learnerId: a.learnerId, kinds: ['AnalysisCorrected'] });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ producer: { app: 'repository' }, payload: { formId: FORM, by: 'learner', correctedLexemeId: BAD, reason: 'my reason' } });
    expect((mine[0]!.payload as { analysisId?: string }).analysisId).toBeUndefined();
    expect(await h.store.list({ learnerId: b.learnerId, kinds: ['AnalysisCorrected'] })).toEqual([]);
    const exported = await call(h, 'GET', '/export', { token: a.token });
    expect(exported.status).toBe(200);
    expect(exported.text).toContain('my reason');
    expect((await call(h, 'GET', '/export', { token: b.token })).text).not.toContain('my reason');
    expect((await call(h, 'DELETE', '/me', { token: a.token, body: { confirmEmail: a.email } })).status).toBeLessThan(300);
    expect(await h.store.list({ learnerId: a.learnerId, kinds: ['AnalysisCorrected'] })).toEqual([]);
  });

  it('needs an enrolment in the word\'s language, so a report always has a log to live in', async () => {
    const { h, a } = await world();
    await h.store.putUnits([{ ...(await h.store.getUnits([FORM]))[0]!, unitId: 'form:de:haus', languageId: 'de', label: 'haus' }]);
    const r = await call(h, 'POST', `/units/${encodeURIComponent('form:de:haus')}/corrections`, { token: a.token, body: { reason: 'no' } });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('no-enrolment');
  });

  it('a reviewer\'s correction is the one that changes the word for everyone', async () => {
    const { h, shared } = await world();
    const before = await shared();
    await createLinguisticService(h.store, { now: h.clock.now }).correct(FORM, { by: 'reviewer', reviewerId: 'R', lexemeId: BAD }, h.clock.now());
    expect(await shared()).not.toEqual(before);
    const live = (await h.store.analysesOfForm(FORM)).filter((x) => x.status !== 'invalidated');
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ status: 'verified', analyzerId: 'correction:reviewer' });
  });
});

describe('what a reviewer reads', () => {
  const report = (learnerId: string, over: Record<string, unknown> = {}, at = '2026-11-01T00:00:00.000Z') => ({
    learnerId, event: { at, producer: { app: 'repository' }, payload: { formId: FORM, by: 'learner', correctedLexemeId: BAD, reason: 'wrong', ...over } },
  });

  it('groups by form and proposal, counts distinct learners, keeps the latest time and never names anyone', () => {
    const out = summariseCorrectionReports([
      report('secret-1'), report('secret-1', {}, '2026-11-02T00:00:00.000Z'), report('secret-2', { reason: 'wrong' }),
      report('secret-2', { correctedLexemeId: undefined, correctedFeatures: { Case: 'Nom' }, reason: undefined }),
    ]);
    expect(out[0]).toMatchObject({ formId: FORM, proposed: BAD, learners: 2, lastAt: '2026-11-02T00:00:00.000Z', reasons: ['wrong'] });
    expect(out[1]).toMatchObject({ proposed: 'Case=Nom', learners: 1, reasons: [] });
    expect(JSON.stringify(out)).not.toContain('secret');
  });

  it('the extension\'s own queued copy of a report does not count the learner twice', () => {
    const queued = report('secret-1');
    queued.event.producer.app = 'golearn-ext';
    expect(summariseCorrectionReports([report('secret-1'), queued])[0]!.learners).toBe(1);
  });
});
