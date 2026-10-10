// @vitest-environment node
/**
 * Stage 7: which linguistic fields may be put to a human reviewer. The rules (invalidated, verified / supported / unknown never,
 * unreviewable never, 2 encounters for provisional and 1 for conflicted, priority = conflicts x encounters), the queue order,
 * the reviewer's view that never upgrades a state, and a decision becoming a correction by a named reviewer.
 */
import { describe, expect, it } from 'vitest';
import type { FieldName, FieldState, FieldStates, FormAnalysis, LinguisticUnit } from '../../../packages/repository-contract/src';
import {
  MIN_ENCOUNTERS, reviewEligibility, reviewerCorrection, reviewerView, subjectsOfFacts, validationQueue,
} from '../../../packages/goreview/src';
import type { UnitFacts } from '../../../packages/goreview/src';

const NOW = '2026-10-10T09:00:00.000Z';
const fs = (o: Partial<Record<FieldName, FieldState>>): FieldStates =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { state: v, basis: `basis of ${k}`, sources: [`src:${k}`], at: NOW }])) as FieldStates;
const analysis = (id: string, o: Partial<Record<FieldName, FieldState>>, over: Partial<FormAnalysis> = {}): FormAnalysis => ({
  analysisId: id, formId: 'form:sq:librin', languageId: 'sq', candidates: [], status: 'provisional', analyzerId: 'x', packId: 'pack:sq', packVersion: '9', createdAt: NOW,
  fieldStates: fs(o), ...over,
});

describe('reviewEligibility', () => {
  it('a conflicted field is eligible from ONE encounter', () => {
    const r = reviewEligibility(analysis('a1', { lemma: 'conflicted', pos: 'supported' }), { encounters: 1 });
    expect(r).toMatchObject({ eligible: true, fields: ['lemma'], priority: 1 });
    expect(r.reason).toMatch(/lemma conflicted/);
  });

  it('a provisional field needs two encounters in different sentences', () => {
    expect(MIN_ENCOUNTERS).toEqual({ conflicted: 1, provisional: 2 });
    const one = reviewEligibility(analysis('a', { features: 'provisional' }), { encounters: 1 });
    expect(one).toMatchObject({ eligible: false, fields: [], priority: 0 });
    expect(one.reason).toMatch(/too few encounters/);
    const two = reviewEligibility(analysis('a', { features: 'provisional' }), { encounters: 2 });
    expect(two).toMatchObject({ eligible: true, fields: ['features'] });
  });

  it('only the fields that meet their own threshold are listed', () => {
    const r = reviewEligibility(analysis('a', { lemma: 'conflicted', features: 'provisional' }), { encounters: 1 });
    expect(r.fields).toEqual(['lemma']);
    expect(reviewEligibility(analysis('a', { lemma: 'conflicted', features: 'provisional' }), { encounters: 3 }).fields).toEqual(['lemma', 'features']);
  });

  it('never: verified, supported, unknown and invalidated fields', () => {
    for (const state of ['verified', 'supported', 'unknown', 'invalidated'] as const) {
      const r = reviewEligibility(analysis('a', { lemma: state, pos: state }), { encounters: 50 });
      expect(r, state).toMatchObject({ eligible: false, fields: [] });
    }
  });

  it('never an invalidated or superseded analysis or unit, whatever its fields say', () => {
    expect(reviewEligibility(analysis('a', { lemma: 'conflicted' }, { status: 'invalidated' }), { encounters: 9 })).toMatchObject({ eligible: false, reason: expect.stringMatching(/invalidated/) });
    expect(reviewEligibility(analysis('a', { lemma: 'conflicted' }, { supersededBy: 'analysis:b' }), { encounters: 9 }).eligible).toBe(false);
    const unit: LinguisticUnit = {
      unitId: 'lemma:sq:a:NOUN', kind: 'lexeme', languageId: 'sq', label: 'a', packId: 'p', packVersion: '1', createdAt: NOW, status: 'provisional',
      provenance: { source: 'rule', ref: 'r', confidence: 0.5 }, supersededBy: 'lemma:sq:b:NOUN', fieldStates: fs({ etymology: 'conflicted' }),
    };
    expect(reviewEligibility(unit, { encounters: 9 }).eligible).toBe(false);
    expect(reviewEligibility({ ...unit, supersededBy: undefined }, { encounters: 9 })).toMatchObject({ eligible: true, fields: ['etymology'] });
  });

  it('never a field the pack marks unreviewable', () => {
    const r = reviewEligibility({ ...analysis('a', { etymology: 'conflicted', lemma: 'conflicted' }), unreviewableFields: ['etymology'] }, { encounters: 3 });
    expect(r.fields).toEqual(['lemma']);
    expect(r.reason).toMatch(/not reviewable: etymology/);
    const only = reviewEligibility({ ...analysis('a', { etymology: 'conflicted' }), unreviewableFields: ['etymology'] }, { encounters: 3 });
    expect(only).toMatchObject({ eligible: false, fields: [] });
    expect(only.reason).toMatch(/unreviewable/);
  });

  it('an item without field states is not eligible and says the intake rules decide it', () => {
    const legacy = analysis('a', {}, { fieldStates: undefined });
    expect(reviewEligibility(legacy, { encounters: 10 })).toMatchObject({ eligible: false, fields: [], priority: 0, reason: expect.stringMatching(/intake rules/) });
  });

  it('priority = conflicts x encounters; conflicts default to the conflicted fields found', () => {
    const a = analysis('a', { lemma: 'conflicted', pos: 'conflicted', features: 'provisional' });
    expect(reviewEligibility(a, { encounters: 3 }).priority).toBe(2 * 3);
    expect(reviewEligibility(a, { encounters: 3, conflicts: 5 }).priority).toBe(15);
    expect(reviewEligibility(analysis('p', { features: 'provisional' }), { encounters: 4 }).priority).toBe(0);
  });
});

describe('the reviewer is never shown a field as better than it is', () => {
  it('shows exactly the stored state, basis and sources', () => {
    const a = analysis('a', { lemma: 'conflicted', features: 'provisional', pos: 'verified' });
    const r = reviewEligibility(a, { encounters: 2 });
    const view = reviewerView(a, r);
    expect(view.map((v) => v.field)).toEqual(['lemma', 'features']);
    expect(view.map((v) => v.state)).toEqual(['conflicted', 'provisional']);
    expect(view[0]).toEqual({ field: 'lemma', state: 'conflicted', basis: 'basis of lemma', sources: ['src:lemma'] });
    expect(view.some((v) => v.state === 'verified')).toBe(false);
  });

  it('a reviewer decision becomes a correction by a NAMED reviewer', () => {
    const req = reviewerCorrection('form:sq:librin', { reviewerId: ' ana.k ', lexemeId: 'lemma:sq:libër:NOUN', reason: 'checked in the grammar' });
    expect(req).toEqual({ formId: 'form:sq:librin', correction: { by: 'reviewer', reviewerId: 'ana.k', lexemeId: 'lemma:sq:libër:NOUN', reason: 'checked in the grammar' } });
    expect(() => reviewerCorrection('f', { reviewerId: '  ', lexemeId: 'lemma:sq:a:NOUN' })).toThrow(/name/);
    expect(() => reviewerCorrection('f', { reviewerId: 'ana.k' })).toThrow(/lemma or features/);
  });
});

describe('validationQueue', () => {
  it('sorts by priority, then encounters, then id, and explains every skip', () => {
    const items = [
      { subject: analysis('analysis:low', { lemma: 'conflicted' }), evidence: { encounters: 1 } },
      { subject: analysis('analysis:high', { lemma: 'conflicted', pos: 'conflicted' }), evidence: { encounters: 4 } },
      { subject: analysis('analysis:mid', { lemma: 'conflicted' }), evidence: { encounters: 3 } },
      { subject: analysis('analysis:prov-b', { features: 'provisional' }), evidence: { encounters: 2 } },
      { subject: analysis('analysis:prov-a', { features: 'provisional' }), evidence: { encounters: 2 } },
      { subject: analysis('analysis:few', { features: 'provisional' }), evidence: { encounters: 1 } },
      { subject: analysis('analysis:solid', { lemma: 'verified' }), evidence: { encounters: 9 } },
      { subject: analysis('analysis:old', { lemma: 'conflicted' }, { status: 'invalidated' }), evidence: { encounters: 9 } },
      { subject: analysis('analysis:legacy', {}, { fieldStates: undefined }), evidence: { encounters: 9 } },
    ];
    const q = validationQueue(items);
    expect(q.queue.map((e) => e.id)).toEqual(['analysis:high', 'analysis:mid', 'analysis:low', 'analysis:prov-a', 'analysis:prov-b']);
    expect(q.queue[0]).toMatchObject({ priority: 8, fields: ['lemma', 'pos'], encounters: 4 });
    expect(q.skipped.map((s) => s.id).sort()).toEqual(['analysis:few', 'analysis:old', 'analysis:solid']);
    expect(q.skipped.every((s) => s.reason.length > 0)).toBe(true);
    expect(q.legacy).toEqual(['analysis:legacy']); // never dropped silently: the intake rules keep deciding it
  });

  it('takes the unit and live analyses of a UnitFacts', () => {
    const unit: LinguisticUnit = {
      unitId: 'form:sq:librin', kind: 'form', languageId: 'sq', label: 'librin', packId: 'p', packVersion: '1', createdAt: NOW, status: 'provisional',
      provenance: { source: 'rule', ref: 'r', confidence: 0.5 }, fieldStates: fs({ pronunciation: 'provisional' }),
    };
    const facts = { unit, analyses: [analysis('live', { lemma: 'conflicted' }), analysis('dead', { lemma: 'conflicted' }, { status: 'invalidated' })] } as unknown as UnitFacts;
    expect(subjectsOfFacts(facts).map((s) => ('analysisId' in s ? s.analysisId : s.unitId))).toEqual(['form:sq:librin', 'live']);
  });
});
