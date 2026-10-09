// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { STATUS_RANK } from '../../../packages/repository-contract/src';
import type { LinguisticUnit } from '../../../packages/repository-contract/src';
import { createLinguisticService } from '../../../packages/repository-linguistics/src';
import { fakeStore } from './fakeStore';

const NOW = '2026-10-08T10:00:00.000Z';
const S = 'Fëmijët lexojnë librin.';
const make = () => {
  const store = fakeStore();
  return { store, svc: createLinguisticService(store, { now: () => NOW }) };
};

describe('resolveAndStore', () => {
  it('stores units, relations and the analysis', async () => {
    const { store, svc } = make();
    const r = await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    expect(store.units.has('form:sq:librin')).toBe(true);
    expect(store.units.has('lemma:sq:libër:NOUN')).toBe(true);
    expect(store.relations.length).toBe(r.relations.length);
    expect(store.analyses.has(r.analysis.analysisId)).toBe(true);
  });

  it('twice stores one copy of everything', async () => {
    const { store, svc } = make();
    await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    const before = { units: store.units.size, relations: store.relations.length, analyses: store.analyses.size, writes: { ...store.writes } };
    await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    expect(store.units.size).toBe(before.units);
    expect(store.relations.length).toBe(before.relations);
    expect(store.analyses.size).toBe(before.analyses);
    expect(store.writes).toEqual(before.writes); // nothing was even rewritten
  });

  it('never overwrites a stored unit with a lower status, and does raise a lower one', async () => {
    const { store, svc } = make();
    await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    const form = store.units.get('form:sq:librin')!;
    expect(form.status).toBe('provisional');

    store.units.set(form.unitId, { ...form, status: 'verified', label: 'kept' });
    await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    expect(store.units.get(form.unitId)).toMatchObject({ status: 'verified', label: 'kept' });

    store.units.set(form.unitId, { ...form, status: 'conflicted' });
    await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    expect(STATUS_RANK[store.units.get(form.unitId)!.status]).toBeGreaterThan(STATUS_RANK.conflicted);
  });

  it('does not resurrect an invalidated analysis', async () => {
    const { store, svc } = make();
    const r = await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    await svc.invalidate(r.analysis.analysisId, 'wrong');
    await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    expect(store.analyses.get(r.analysis.analysisId)!.status).toBe('invalidated');
  });

  it('does not touch a superseded unit', async () => {
    const { store, svc } = make();
    await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    const u = store.units.get('lemma:sq:libër:NOUN')!;
    store.units.set(u.unitId, { ...u, supersededBy: 'lemma:sq:libër:NOUN2', status: 'provisional' });
    await svc.resolveAndStore({ languageId: 'sq', surface: 'flas', sentence: 'Unë flas shqip.' });
    await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    expect(store.units.get(u.unitId)!.supersededBy).toBe('lemma:sq:libër:NOUN2');
  });

  it('works for a language without an adapter', async () => {
    const { store, svc } = make();
    const r = await svc.resolveAndStore({ languageId: 'th', surface: 'หนังสือ' });
    expect(r.coverage.known).toBe(false);
    expect(store.units.size).toBe(1);
  });
});

describe('lookup', () => {
  it('returns the unit, both directions of relations and the analyses', async () => {
    const { svc } = make();
    const r = await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    const form = await svc.lookup('form:sq:librin');
    expect(form.unit?.kind).toBe('form');
    expect(form.relations.out.some((x) => x.relation === 'form-of')).toBe(true);
    expect(form.analyses.map((a) => a.analysisId)).toEqual([r.analysis.analysisId]);

    const lex = await svc.lookup('lemma:sq:libër:NOUN');
    expect(lex.relations.in.map((x) => x.relation).sort()).toEqual(['form-of', 'sense-of']);
    expect(lex.analyses.map((a) => a.analysisId)).toEqual([r.analysis.analysisId]);

    const none = await svc.lookup('lemma:sq:nuk:NOUN');
    expect(none.unit).toBeUndefined();
    expect(none.analyses).toEqual([]);
  });
});

describe('invalidate', () => {
  it('returns the ids the candidates pointed at and leaves the row', async () => {
    const { store, svc } = make();
    const r = await svc.resolveAndStore({ languageId: 'sq', surface: 'jetë' });
    const res = await svc.invalidate(r.analysis.analysisId, 'reviewer says no');
    expect(res.affectedUnitIds).toContain('lemma:sq:jetë:NOUN');
    expect(res.affectedUnitIds).toContain('lemma:sq:jam:VERB');
    expect(res.affectedUnitIds.some((i) => i.startsWith('morph:sq:'))).toBe(true);
    expect(new Set(res.affectedUnitIds).size).toBe(res.affectedUnitIds.length);
    const row = store.analyses.get(r.analysis.analysisId)!;
    expect(row.status).toBe('invalidated');
    expect(row.reason).toBe('reviewer says no');
    expect(row.candidates).toHaveLength(r.analysis.candidates.length);
    expect(store.units.has('lemma:sq:jam:VERB')).toBe(true); // units are not removed
  });

  it('stores a replacement and links it', async () => {
    const { store, svc } = make();
    const r = await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    const replacement = { ...r.analysis, analysisId: 'analysis:replacement', status: 'verified' as const };
    await svc.invalidate(r.analysis.analysisId, 'better reading', replacement);
    expect(store.analyses.get('analysis:replacement')).toBeDefined();
    expect(store.analyses.get(r.analysis.analysisId)!.supersededBy).toBe('analysis:replacement');
  });

  it('an unknown analysis affects nothing', async () => {
    const { svc } = make();
    expect(await svc.invalidate('analysis:nope', 'x')).toEqual({ affectedUnitIds: [] });
  });
});

describe('correct', () => {
  it('a reviewer correction is verified, single-candidate, and invalidates the old analyses with a reason', async () => {
    const { store, svc } = make();
    const r = await svc.resolveAndStore({ languageId: 'sq', surface: 'jetë' });
    const out = await svc.correct('form:sq:jetë', { lexemeId: 'lemma:sq:jam:VERB', features: { Mood: 'Ind', Tense: 'Pres' }, by: 'reviewer', reason: 'it is the verb here' }, '2026-10-09T09:00:00.000Z');
    expect(out.analysis.status).toBe('verified');
    expect(out.analysis.candidates).toHaveLength(1);
    expect(out.analysis.chosen).toBe(0);
    expect(out.analysis.candidates[0]).toMatchObject({ lexemeId: 'lemma:sq:jam:VERB', confidence: 0.95, provenance: { source: 'reviewer' } });
    expect(out.analysis.candidates[0].constructionIds).toEqual(['morph:sq:VERB:Mood=Ind|Tense=Pres']);
    expect(out.invalidated.map((a) => a.analysisId)).toEqual([r.analysis.analysisId]);
    const old = store.analyses.get(r.analysis.analysisId)!;
    expect(old.status).toBe('invalidated');
    expect(old.reason).toMatch(/reviewer.*it is the verb here/);
    expect(old.supersededBy).toBe(out.analysis.analysisId);
    expect(store.analyses.get(out.analysis.analysisId)!.status).toBe('verified');
    // the construction it names exists; the existing lexeme is untouched
    expect(store.units.get('morph:sq:VERB:Mood=Ind|Tense=Pres')?.kind).toBe('morph-construction');
    expect(store.units.get('lemma:sq:jam:VERB')!.provenance.source).not.toBe('reviewer');
  });

  it('a learner correction is provisional at 0.6', async () => {
    const { svc } = make();
    await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    const out = await svc.correct('form:sq:librin', { features: { Case: 'Nom' }, by: 'learner' });
    expect(out.analysis.status).toBe('provisional');
    expect(out.analysis.candidates[0]).toMatchObject({ confidence: 0.6, provenance: { source: 'learner' } });
    expect(out.invalidated).toHaveLength(1);
  });

  it('a sentence-scoped correction leaves other sentences alone', async () => {
    const { store, svc } = make();
    const a = await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    const b = await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: 'Unë lexoj librin.' });
    expect(a.analysis.analysisId).not.toBe(b.analysis.analysisId);
    const out = await svc.correct('form:sq:librin', { lexemeId: 'lemma:sq:libër:NOUN', by: 'reviewer', sentenceKey: a.analysis.sentenceKey }, NOW);
    expect(out.invalidated.map((x) => x.analysisId)).toEqual([a.analysis.analysisId]);
    expect(store.analyses.get(b.analysis.analysisId)!.status).not.toBe('invalidated');
  });

  it('refuses an empty correction', async () => {
    const { svc } = make();
    await expect(svc.correct('form:sq:librin', { by: 'learner' })).rejects.toThrow(RangeError);
  });
});

describe('migrate', () => {
  it('certain at >= 0.9, uncertain below; marks superseded and never deletes', async () => {
    const { store, svc } = make();
    const unit = (id: string): LinguisticUnit => ({
      unitId: id, kind: 'lexeme', languageId: 'sq', label: id, packId: 'pack:sq', packVersion: '9',
      provenance: { source: 'hand-lexicon', ref: 'x', confidence: 0.9 }, status: 'provisional', createdAt: NOW,
    });
    await store.putUnits([unit('lemma:sq:a:NOUN'), unit('lemma:sq:b:NOUN'), unit('lemma:sq:c:NOUN')]);
    const res = await svc.migrate('9', '10', [
      { oldId: 'lemma:sq:a:NOUN', newId: 'lemma:sq:a:PROPN', reason: 'pos fixed', confidence: 0.9 },
      { oldId: 'lemma:sq:b:NOUN', newId: 'lemma:sq:b2:NOUN', reason: 'lemma respelled', confidence: 0.89 },
      { oldId: 'lemma:sq:c:NOUN', reason: 'retired', confidence: 1 },
      { oldId: 'lemma:sq:ghost:NOUN', newId: 'lemma:sq:ghost2:NOUN', reason: 'never stored', confidence: 0.95 },
    ]);
    const byOld = Object.fromEntries(store.aliases.map((a) => [a.oldId, a]));
    expect(byOld['lemma:sq:a:NOUN']).toMatchObject({ newId: 'lemma:sq:a:PROPN', mapping: 'certain', packVersion: '10', confidence: 0.9 });
    expect(byOld['lemma:sq:b:NOUN'].mapping).toBe('uncertain');
    expect(byOld['lemma:sq:a:NOUN'].reason).toMatch(/pos fixed/);
    expect(byOld['lemma:sq:c:NOUN']).toBeUndefined();
    expect(res.unmapped).toEqual(['lemma:sq:c:NOUN']);
    expect(res.superseded.sort()).toEqual(['lemma:sq:a:NOUN', 'lemma:sq:b:NOUN']);
    expect(store.units.get('lemma:sq:a:NOUN')!.supersededBy).toBe('lemma:sq:a:PROPN');
    expect(store.units.get('lemma:sq:c:NOUN')!.supersededBy).toBeUndefined();
    expect(store.units.size).toBe(3); // nothing deleted, nothing invented
    expect(await store.aliasesFor(['lemma:sq:a:NOUN'])).toHaveLength(1);
  });
});

describe('coverageGaps', () => {
  it('reports missing, provisional and conflicted units, and nothing for solid ones', async () => {
    const { store, svc } = make();
    await svc.resolveAndStore({ languageId: 'sq', surface: 'flas', sentence: 'Unë flas shqip.' });
    await svc.resolveAndStore({ languageId: 'sq', surface: 'jetë' });
    const solid = store.units.get('lemma:sq:flas:VERB')!;
    expect(solid.status).toBe('high-confidence');
    const gaps = await svc.coverageGaps('sq', ['lemma:sq:flas:VERB', 'lemma:sq:zzz:NOUN', 'form:sq:jetë', 'lemma:sq:flas:VERB']);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toMatch(/^lemma:sq:zzz:NOUN: no stored/);
    expect(gaps[1]).toBe('form:sq:jetë: status conflicted');
    expect(await svc.coverageGaps('sq', [])).toEqual([]);
    store.units.set(solid.unitId, { ...solid, status: 'provisional' });
    expect(await svc.coverageGaps('sq', [solid.unitId])).toEqual(['lemma:sq:flas:VERB: status provisional']);
  });
});
