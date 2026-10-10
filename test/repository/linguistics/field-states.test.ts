// @vitest-environment node
/**
 * Stage 7: field-level validation states. Each rule of `fieldStatesFor`, the status mappings (paradigm cell, etymology /
 * pronunciation, syntax), the wiring (resolve, store, lookup, correct, coverage), compatibility with rows written before Stage 7,
 * and the separation of the three stores (a correction never writes an event; a learner event never changes a field state).
 */
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_REVISION, CONTRACT_VERSION, FIELD_NAMES, FIELD_STATES, fieldStateOf, fieldsInState, invalidateFieldStates, mergeFieldStates, validateAnalysis, validateFieldStates, validateUnit,
} from '../../../packages/repository-contract/src';
import type { AnalysisCandidate, FieldStates, FormAnalysis, GoEvent, UnitProvenance } from '../../../packages/repository-contract/src';
import { createProjectionEngine } from '../../../packages/repository-engine/src';
import { createLinguisticService, fieldStatesFor, resolveSelection } from '../../../packages/repository-linguistics/src';
import type { FieldReading } from '../../../packages/repository-linguistics/src';
import { createMemoryStore } from '../../../packages/repository-store/src';
import { E, L, encounter, enrolment, lookup, ev, resetIds } from '../engine/helpers';
import { fakeStore } from './fakeStore';

const NOW = '2026-10-10T09:00:00.000Z';
const prov = (source: UnitProvenance['source'], confidence: number, over: Partial<UnitProvenance> = {}): UnitProvenance => ({ source, ref: `${source}@test`, confidence, ...over });
const reading = (lexemeId: string | undefined, confidence: number, source: UnitProvenance['source'] = 'hand-lexicon', over: Partial<FieldReading> = {}): FieldReading => ({
  ...(lexemeId ? { lexemeId } : {}), features: { Case: 'Nom' }, confidence, provenance: prov(source, confidence), ...over,
});
const states = (r: FieldReading[], extra: Partial<Parameters<typeof fieldStatesFor>[0]> = {}) => fieldStatesFor({ readings: r, now: NOW, ...extra });
const st = (fs: FieldStates, f: (typeof FIELD_NAMES)[number]): string => fs[f]!.state;

describe('the contract', () => {
  it('has the six states and the nine field names, and a row without fieldStates reads unknown', () => {
    expect([...FIELD_STATES]).toEqual(['verified', 'supported', 'provisional', 'conflicted', 'unknown', 'invalidated']);
    expect([...FIELD_NAMES]).toEqual(['lemma', 'pos', 'features', 'sense', 'paradigmCell', 'etymology', 'pronunciation', 'syntaxRelation', 'segmentation']);
    expect(fieldStateOf({}, 'lemma')).toBe('unknown');
    expect(fieldStateOf(undefined, 'etymology')).toBe('unknown');
  });

  it('keeps the event contract version and adds a row revision', () => {
    expect(CONTRACT_VERSION).toBe(3);
    expect(CONTRACT_REVISION).toBe('3.1');
  });

  it('validates field states and refuses unknown names and states; absent is valid', () => {
    expect(validateFieldStates(undefined)).toEqual([]);
    expect(validateFieldStates({ lemma: { state: 'supported', basis: 'b', sources: ['x'] } })).toEqual([]);
    expect(validateFieldStates({ colour: { state: 'supported', basis: 'b', sources: [] } })).toHaveLength(1);
    expect(validateFieldStates({ lemma: { state: 'great', basis: 'b', sources: [] } })).toHaveLength(1);
    expect(validateFieldStates({ lemma: { state: 'verified', basis: 'b', sources: [], at: 'yesterday' } })).toHaveLength(1);
    const a = { analysisId: 'a', formId: 'f', languageId: 'sq', candidates: [], status: 'provisional', analyzerId: 'x', packId: 'p', packVersion: '1', createdAt: NOW };
    expect(validateAnalysis(a)).toEqual([]);
    expect(validateAnalysis({ ...a, fieldStates: { lemma: { state: 'nope', basis: '', sources: [] } } }).length).toBeGreaterThan(0);
    const u = { unitId: 'form:sq:x', kind: 'form', languageId: 'sq', label: 'x', packId: 'p', packVersion: '1', createdAt: NOW, status: 'provisional', provenance: prov('rule', 0.5) };
    expect(validateUnit(u)).toEqual([]);
    expect(validateUnit({ ...u, fieldStates: { etymology: { state: 'x', basis: '', sources: [] } } }).length).toBeGreaterThan(0);
  });

  it('invalidateFieldStates withdraws stated fields, keeps the basis, and leaves unknown alone', () => {
    const fs = states([reading('lemma:sq:a:NOUN', 0.9)]);
    const inv = invalidateFieldStates(fs, 'wrong lemma', NOW)!;
    expect(st(inv, 'lemma')).toBe('invalidated');
    expect(inv.lemma!.basis).toMatch(/was supported/);
    expect(inv.lemma!.basis).toMatch(/wrong lemma/);
    expect(st(inv, 'syntaxRelation')).toBe('unknown');
    expect(invalidateFieldStates(undefined, 'r')).toBeUndefined();
    expect(fieldsInState(inv, 'invalidated')).toContain('lemma');
  });

  it('mergeFieldStates only raises, and invalidated is terminal', () => {
    const lo = states([reading('lemma:sq:a:NOUN', 0.5, 'rule')]);
    const hi = states([reading('lemma:sq:a:NOUN', 0.9)]);
    expect(st(mergeFieldStates(lo, hi)!, 'lemma')).toBe('supported');
    expect(st(mergeFieldStates(hi, lo)!, 'lemma')).toBe('supported');
    const inv = invalidateFieldStates(lo, 'r')!;
    expect(st(mergeFieldStates(inv, hi)!, 'lemma')).toBe('invalidated');
    expect(mergeFieldStates(undefined, hi)).toBe(hi);
  });
});

describe('fieldStatesFor: verified', () => {
  it('a named reviewer verifies what the reading states and nothing else', () => {
    const r = reading('lemma:sq:libër:NOUN', 0.95, 'reviewer', { provenance: prov('reviewer', 0.95, { validatedBy: 'ana.k' }) });
    const fs = states([r], { reviewer: { id: 'ana.k' } });
    for (const f of ['lemma', 'pos', 'features'] as const) expect(st(fs, f)).toBe('verified');
    expect(fs.lemma!.sources).toContain('reviewer:ana.k');
    expect(fs.lemma!.basis).toMatch(/ana\.k/);
    expect(st(fs, 'sense')).toBe('unknown'); // the reading names no sense
    expect(st(fs, 'etymology')).toBe('unknown');
    expect(st(fs, 'syntaxRelation')).toBe('unknown');
  });

  it('a reading whose provenance is a reviewer is a reviewer correction even without an explicit verdict', () => {
    const r = reading('lemma:sq:libër:NOUN', 0.95, 'reviewer', { provenance: prov('reviewer', 0.95, { validatedBy: 'ana.k' }) });
    expect(st(states([r]), 'lemma')).toBe('verified');
  });

  it('a native-reviewed source verifies; confidence alone never does', () => {
    expect(st(states([reading('lemma:sq:a:NOUN', 0.9, 'hand-lexicon', { nativeReviewed: true })]), 'lemma')).toBe('verified');
    for (const source of ['hand-lexicon', 'dictionary', 'rule', 'parser', 'import'] as const) {
      const fs = states([reading('lemma:sq:a:NOUN', 1, source)]);
      for (const f of ['lemma', 'pos', 'features'] as const) expect(st(fs, f), `${source} ${f}`).not.toBe('verified');
    }
  });

  it('a learner correction is provisional, never verified', () => {
    const r = reading('lemma:sq:a:NOUN', 0.6, 'learner');
    const fs = states([r]);
    expect(st(fs, 'lemma')).toBe('provisional');
    expect(fs.lemma!.sources).toEqual(['learner']);
  });

  it('a reviewer can verify an externally fed field they list, when something states it', () => {
    const r = reading('lemma:sq:a:NOUN', 0.9);
    const fs = states([r], { reviewer: { id: 'ana.k', fields: ['lemma', 'etymology', 'pronunciation'] }, etymology: { status: 'supported-by-source', source: 'wiktionary' } });
    expect(st(fs, 'lemma')).toBe('verified');
    expect(st(fs, 'pos')).not.toBe('verified'); // not listed
    expect(st(fs, 'etymology')).toBe('verified');
    expect(st(fs, 'pronunciation')).toBe('unknown'); // nothing states it: nothing to verify
  });
});

describe('fieldStatesFor: supported, provisional, unknown', () => {
  it('supported: the hand lexicon or a dictionary states it at >= 0.85 and no competing reading disagrees', () => {
    for (const source of ['hand-lexicon', 'dictionary'] as const) {
      const fs = states([reading('lemma:sq:a:NOUN', 0.9, source), reading('lemma:sq:b:NOUN', 0.5, 'rule')]);
      expect(st(fs, 'lemma'), source).toBe('supported');
      expect(st(fs, 'pos')).toBe('supported');
      expect(st(fs, 'features')).toBe('supported');
    }
  });

  it('a lexicon reading below 0.85 is provisional', () => {
    expect(st(states([reading('lemma:sq:a:NOUN', 0.7)]), 'lemma')).toBe('provisional');
  });

  it('provisional: only the rules state it (rule, parser, an unconfirmed guess)', () => {
    expect(st(states([reading('lemma:sq:a:NOUN', 0.9, 'rule')]), 'lemma')).toBe('provisional');
    expect(st(states([reading('lemma:sq:a:NOUN', 0.9, 'parser')]), 'features')).toBe('provisional');
    const guess = states([reading('lemma:sq:a:NOUN', 0.95, 'hand-lexicon', { unconfirmed: true })]);
    expect(st(guess, 'lemma')).toBe('provisional');
    expect(guess.lemma!.basis).toMatch(/guess/);
  });

  it('unknown: nothing states it', () => {
    const none = states([]);
    for (const f of FIELD_NAMES) expect(st(none, f), f).toBe('unknown');
    const bare = states([{ confidence: 0.1, provenance: prov('parser', 0.1) }]);
    for (const f of ['lemma', 'pos', 'features', 'sense'] as const) expect(st(bare, f)).toBe('unknown');
    // a reading with no features leaves features unknown, the lemma may still be stated
    const noFeatures = states([{ lexemeId: 'lemma:sq:a:ADV', confidence: 0.9, provenance: prov('hand-lexicon', 0.9) }]);
    expect(st(noFeatures, 'features')).toBe('unknown');
    expect(st(noFeatures, 'lemma')).toBe('supported');
  });

  it('never returns invalidated (only invalidate / correct do)', () => {
    const fs = states([reading('lemma:sq:a:NOUN', 0.9), reading('lemma:sq:b:VERB', 0.9)]);
    for (const f of FIELD_NAMES) expect(st(fs, f)).not.toBe('invalidated');
  });
});

describe('fieldStatesFor: conflicted (the split of statusFor)', () => {
  it('different lemmas within 0.15: lemma, sense (and pos when it differs) are conflicted, features at best provisional', () => {
    const fs = states([
      { ...reading('lemma:sq:jetë:NOUN', 0.9), senseId: 'sense:sq:jetë:NOUN:1' },
      { ...reading('lemma:sq:jam:VERB', 0.85, 'rule'), features: { Mood: 'Sub' } },
    ]);
    expect(st(fs, 'lemma')).toBe('conflicted');
    expect(st(fs, 'pos')).toBe('conflicted');
    expect(st(fs, 'sense')).toBe('conflicted');
    expect(fs.lemma!.basis).toMatch(/jetë, jam/);
    expect(['provisional', 'conflicted']).toContain(st(fs, 'features'));
  });

  it('readings that differ ONLY in features: features conflicted, lemma and pos not', () => {
    const fs = states([
      { ...reading('lemma:sq:libër:NOUN', 0.9), features: { Case: 'Nom', Number: 'Sing' } },
      { ...reading('lemma:sq:libër:NOUN', 0.9), features: { Case: 'Acc', Number: 'Sing' } },
    ]);
    expect(st(fs, 'features')).toBe('conflicted');
    expect(st(fs, 'lemma')).toBe('supported');
    expect(st(fs, 'pos')).toBe('supported');
  });

  it('same lemma, different part of speech tags are impossible by id; different POS with different lemma: pos conflicted', () => {
    const fs = states([reading('lemma:sq:a:NOUN', 0.8), reading('lemma:sq:a:VERB', 0.8)]);
    expect(st(fs, 'lemma')).toBe('conflicted');
    expect(st(fs, 'pos')).toBe('conflicted');
  });

  it('a rival further than 0.15 away is not a conflict', () => {
    const fs = states([reading('lemma:sq:a:NOUN', 0.9), reading('lemma:sq:b:VERB', 0.7, 'rule')]);
    expect(st(fs, 'lemma')).toBe('supported');
  });

  it('agrees with statusFor: the analysis is conflicted exactly when some of lemma / pos / features is', () => {
    for (const w of ['jetë', 'flas', 'librin', 'zzzqx', 'kafe']) {
      const r = resolveSelection({ languageId: 'sq', surface: w, now: NOW });
      const fs = r.analysis.fieldStates!;
      const anyConflict = (['lemma', 'pos', 'features'] as const).some((f) => fs[f]!.state === 'conflicted');
      expect(r.analysis.status === 'conflicted', w).toBe(anyConflict);
      if (r.analysis.status === 'high-confidence') expect(fs.lemma!.state, w).toBe('supported');
    }
  });
});

describe('fieldStatesFor: mappings of the other statuses', () => {
  const lex = reading('lemma:sq:a:NOUN', 0.9);

  it('ParadigmCell.status: generated is provisional, supported is supported, verified (two machine sources agree) is supported, conflicted is conflicted', () => {
    const one = (status: 'verified' | 'supported' | 'generated' | 'conflicted', reviewerId?: string) => st(states([lex], { paradigmCells: [{ status, ...(reviewerId ? { reviewerId } : {}) }] }), 'paradigmCell');
    expect(one('generated')).toBe('provisional');
    expect(one('supported')).toBe('supported');
    expect(one('verified')).toBe('supported');
    expect(one('verified', 'ana.k')).toBe('verified');
    expect(one('conflicted')).toBe('conflicted');
    expect(st(states([lex]), 'paradigmCell')).toBe('unknown');
  });

  it('several cells take the weakest', () => {
    const fs = states([lex], { paradigmCells: [{ status: 'supported' }, { status: 'generated' }] });
    expect(st(fs, 'paradigmCell')).toBe('provisional');
    expect(st(states([lex], { paradigmCells: [{ status: 'supported' }, { status: 'conflicted' }] }), 'paradigmCell')).toBe('conflicted');
  });

  it('enrich FieldStatus: supported-by-source, provisional, conflicted, unknown; verified needs a reviewer or a native-reviewed source', () => {
    const e = (status: 'verified' | 'supported-by-source' | 'provisional' | 'conflicted' | 'unknown', more: object = {}) => st(states([lex], { etymology: { status, ...more } }), 'etymology');
    expect(e('supported-by-source')).toBe('supported');
    expect(e('provisional')).toBe('provisional');
    expect(e('conflicted')).toBe('conflicted');
    expect(e('unknown')).toBe('unknown');
    expect(e('verified')).toBe('supported');
    expect(e('verified', { reviewerId: 'ana.k' })).toBe('verified');
    expect(e('verified', { nativeReviewed: true })).toBe('verified');
    expect(st(states([lex], { pronunciation: { status: 'supported-by-source' } }), 'pronunciation')).toBe('supported');
    expect(st(states([lex]), 'etymology')).toBe('unknown');
  });

  it('SyntaxRelation.status: generated is provisional, conflicted is conflicted, none is unknown', () => {
    expect(st(states([lex], { syntax: { status: 'generated' } }), 'syntaxRelation')).toBe('provisional');
    expect(st(states([lex], { syntax: { status: 'conflicted' } }), 'syntaxRelation')).toBe('conflicted');
    expect(st(states([lex], { syntax: [{ status: 'generated' }, { status: 'conflicted' }] }), 'syntaxRelation')).toBe('conflicted');
    expect(st(states([lex]), 'syntaxRelation')).toBe('unknown');
  });

  it('segmentation: rule is provisional, dictionary supported, a close alternative conflicted', () => {
    expect(st(states([lex], { segmentation: { origin: 'rule' } }), 'segmentation')).toBe('provisional');
    expect(st(states([lex], { segmentation: { origin: 'dictionary' } }), 'segmentation')).toBe('supported');
    expect(st(states([lex], { segmentation: { origin: 'dictionary', confidence: 0.6, alternativeConfidences: [0.5] } }), 'segmentation')).toBe('conflicted');
    expect(st(states([lex], { segmentation: { origin: 'rule', confidence: 0.9, alternativeConfidences: [0.5] } }), 'segmentation')).toBe('provisional');
  });
});

describe('resolveSelection and the service', () => {
  const S = 'Fëmijët lexojnë librin.';
  const make = () => { const store = fakeStore(); return { store, svc: createLinguisticService(store, { now: () => NOW }) }; };

  it('resolveSelection returns fieldStates on the analysis (the contextual fields) and the shared ones on the units', () => {
    const r = resolveSelection({ languageId: 'sq', surface: 'flas', sentence: 'Unë flas shqip.', now: NOW });
    expect(Object.keys(r.analysis.fieldStates!).sort()).toEqual(['lemma', 'paradigmCell', 'pos', 'features', 'segmentation', 'sense', 'syntaxRelation'].sort());
    expect(r.analysis.fieldStates!.lemma!.state).toBe('supported');
    expect(r.analysis.fieldStates!.etymology).toBeUndefined(); // shared fact: on the unit, not the analysis
    const sense = r.units.find((u) => u.kind === 'sense')!;
    expect(sense.fieldStates!.sense!.state).toBe('supported');
    // the adapter's pronunciation rules state the form's pronunciation: provisional
    const jetë = resolveSelection({ languageId: 'sq', surface: 'jetë', now: NOW });
    expect(jetë.units.find((u) => u.unitId === 'form:sq:jetë')!.fieldStates!.pronunciation!.state).toBe('provisional');
    expect(jetë.analysis.fieldStates!.lemma!.state).toBe('conflicted');
  });

  it('a form with no analyzer is all unknown', () => {
    const r = resolveSelection({ languageId: 'xx', surface: 'bla', now: NOW });
    for (const f of Object.values(r.analysis.fieldStates!)) expect(f.state).toBe('unknown');
  });

  it('caller field evidence (paradigm cell, etymology, syntax) is carried into the states', () => {
    const r = resolveSelection({
      languageId: 'sq', surface: 'librin', sentence: S, now: NOW,
      fieldEvidence: { paradigmCells: [{ status: 'verified' }], etymology: { status: 'supported-by-source', source: 'wiktionary' }, syntax: { status: 'generated' } },
    });
    expect(r.analysis.fieldStates!.paradigmCell!.state).toBe('supported');
    expect(r.analysis.fieldStates!.syntaxRelation!.state).toBe('provisional');
    expect(r.units.find((u) => u.unitId === 'form:sq:librin')!.fieldStates!.etymology!.state).toBe('supported');
  });

  it('resolveAndStore stores them, lookup returns them, a second pass rewrites nothing', async () => {
    const { store, svc } = make();
    const r = await svc.resolveAndStore({ languageId: 'sq', surface: 'flas', sentence: 'Unë flas shqip.' });
    expect(store.analyses.get(r.analysis.analysisId)!.fieldStates).toEqual(r.analysis.fieldStates);
    const sense = store.units.get('sense:sq:flas:VERB:1')!;
    expect(sense.fieldStates!.sense!.state).toBe('supported');
    const found = await svc.lookup('form:sq:flas');
    expect(found.analyses[0].fieldStates!.lemma!.state).toBe('supported');
    expect((await svc.lookup('sense:sq:flas:VERB:1')).unit!.fieldStates!.sense!.state).toBe('supported');
    const writes = { ...store.writes };
    await svc.resolveAndStore({ languageId: 'sq', surface: 'flas', sentence: 'Unë flas shqip.' });
    expect(store.writes).toEqual(writes);
  });

  it('a shared field only gets better when the unit is met again (monotone), never worse', async () => {
    const { store, svc } = make();
    await svc.resolveAndStore({ languageId: 'sq', surface: 'jetë' });
    const form = store.units.get('form:sq:jetë')!;
    // a later, better statement of the same field (e.g. the dictionary now states the pronunciation)
    store.units.set(form.unitId, { ...form, fieldStates: { ...form.fieldStates, pronunciation: { state: 'supported', basis: 'dictionary IPA', sources: ['wiktionary'], at: NOW } } });
    await svc.resolveAndStore({ languageId: 'sq', surface: 'jetë' });
    expect(store.units.get(form.unitId)!.fieldStates!.pronunciation!.state).toBe('supported');
  });

  it('rows written before Stage 7 have no fieldStates, read unknown, and gain them once on the next resolve', async () => {
    const { store, svc } = make();
    const r = await svc.resolveAndStore({ languageId: 'sq', surface: 'flas', sentence: 'Unë flas shqip.' });
    const legacy = { ...store.analyses.get(r.analysis.analysisId)! };
    delete legacy.fieldStates;
    store.analyses.set(legacy.analysisId, legacy);
    expect(fieldStateOf(store.analyses.get(legacy.analysisId), 'lemma')).toBe('unknown');
    await svc.resolveAndStore({ languageId: 'sq', surface: 'flas', sentence: 'Unë flas shqip.' });
    expect(fieldStateOf(store.analyses.get(legacy.analysisId), 'lemma')).toBe('supported');
  });

  it('a reviewer correction verifies the corrected fields, invalidates the superseded analysis fields, and keeps its row', async () => {
    const { store, svc } = make();
    const r = await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    const res = await svc.correct('form:sq:librin', { lexemeId: 'lemma:sq:libër:NOUN', features: { Case: 'Acc', Definite: 'Def' }, by: 'reviewer', reviewerId: 'ana.k', reason: 'checked' }, NOW);
    const fs = res.analysis.fieldStates!;
    expect(fs.lemma!.state).toBe('verified');
    expect(fs.pos!.state).toBe('verified');
    expect(fs.features!.state).toBe('verified');
    expect(fs.lemma!.sources).toContain('reviewer:ana.k');
    expect(fs.sense!.state).toBe('unknown');
    expect(store.analyses.get(res.analysis.analysisId)!.fieldStates!.lemma!.state).toBe('verified');
    // the superseded analysis: row kept, stated fields invalidated
    const old = store.analyses.get(r.analysis.analysisId)!;
    expect(old.status).toBe('invalidated');
    expect(old.candidates).toHaveLength(r.analysis.candidates.length);
    expect(res.invalidated[0].fieldStates!.lemma!.state).toBe('invalidated');
    // lookup shows the invalidated fields even over a store that predates the rule (this fake only sets the status)
    const looked = (await svc.lookup('form:sq:librin')).analyses.find((a) => a.analysisId === old.analysisId)!;
    expect(looked.fieldStates!.lemma!.state).toBe('invalidated');
    expect(looked.fieldStates!.lemma!.basis).toMatch(/was provisional/);
  });

  it('a learner correction is provisional', async () => {
    const { svc } = make();
    await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    const res = await svc.correct('form:sq:librin', { lexemeId: 'lemma:sq:libër:NOUN', by: 'learner' }, NOW);
    expect(res.analysis.fieldStates!.lemma!.state).toBe('provisional');
    expect(res.analysis.fieldStates!.pos!.state).toBe('provisional');
    expect(res.analysis.fieldStates!.features!.state).toBe('unknown');
  });

  it('a legacy analysis without states is given them (derived) before it is invalidated, so its fields read invalidated', async () => {
    const { store, svc } = make();
    const legacy: FormAnalysis = {
      analysisId: 'analysis:legacy', formId: 'form:sq:librin', languageId: 'sq', status: 'provisional', analyzerId: 'x', packId: 'pack:sq', packVersion: '9', createdAt: NOW,
      candidates: [{ lexemeId: 'lemma:sq:libra:NOUN', features: { Case: 'Nom' }, confidence: 0.7, provenance: prov('rule', 0.7) }], chosen: 0,
    };
    store.analyses.set(legacy.analysisId, legacy);
    const res = await svc.correct('form:sq:librin', { lexemeId: 'lemma:sq:libër:NOUN', by: 'reviewer', reviewerId: 'ana.k' }, NOW);
    expect(res.invalidated[0].fieldStates!.lemma!.state).toBe('invalidated');
    expect(res.invalidated[0].fieldStates!.lemma!.basis).toMatch(/was provisional/);
  });

  it('the real memory store invalidates the stored fields itself', async () => {
    const store = createMemoryStore({ now: () => NOW });
    const svc = createLinguisticService(store, { now: () => NOW });
    const r = await svc.resolveAndStore({ languageId: 'sq', surface: 'flas', sentence: 'Unë flas shqip.' });
    await svc.invalidate(r.analysis.analysisId, 'pack withdrawn');
    const stored = (await store.getAnalysis(r.analysis.analysisId))!;
    expect(stored.status).toBe('invalidated');
    expect(stored.fieldStates!.lemma!.state).toBe('invalidated');
    // a re-resolution cannot resurrect it
    await svc.resolveAndStore({ languageId: 'sq', surface: 'flas', sentence: 'Unë flas shqip.' });
    expect((await store.getAnalysis(r.analysis.analysisId))!.fieldStates!.lemma!.state).toBe('invalidated');
  });

  it('coverageGaps keeps its notes and, on request, reports per field', async () => {
    const { svc } = make();
    await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    await svc.resolveAndStore({ languageId: 'sq', surface: 'jetë' });
    const plain = await svc.coverageGaps('sq', ['form:sq:jetë']);
    expect(plain).toEqual(['form:sq:jetë: status conflicted']);
    const byField = await svc.coverageGaps('sq', ['form:sq:jetë', 'form:sq:librin'], { byField: true });
    expect(byField).toContain('form:sq:jetë: reading field lemma is conflicted');
    expect(byField).toContain('form:sq:jetë: unit field pronunciation is provisional');
    expect(byField).toContain('form:sq:librin: reading field lemma is provisional');
    const structured = await svc.coverageGapsByField('sq', ['form:sq:jetë']);
    expect(structured.find((g) => g.field === 'lemma')).toMatchObject({ state: 'conflicted', where: 'analysis' });
    expect(structured.every((g) => g.state === 'provisional' || g.state === 'conflicted')).toBe(true);
  });
});

describe('the three stores stay apart', () => {
  const FORM = 'form:sq:librin';
  const S = 'Fëmijët lexojnë librin.';
  const snapshotRows = async (store: ReturnType<typeof createMemoryStore>) => {
    const units = await store.getUnits([FORM, 'lemma:sq:libër:NOUN', 'sense:sq:libër:NOUN:1']);
    const analyses = await store.analysesOfForm(FORM);
    return JSON.stringify({ units: units.map((u) => [u.unitId, u.status, u.fieldStates]), analyses: analyses.map((a) => [a.analysisId, a.status, a.fieldStates]) });
  };

  async function world() {
    resetIds();
    const store = createMemoryStore({ now: () => NOW });
    await store.putEnrolment(enrolment());
    const svc = createLinguisticService(store, { now: () => NOW });
    await svc.resolveAndStore({ languageId: 'sq', surface: 'librin', sentence: S });
    const at = (h: number) => ({ at: `2026-10-07T${String(h).padStart(2, '0')}:00:00.000Z` });
    await store.append(L, [encounter([FORM], at(8)), encounter([FORM], at(9)), lookup([FORM], at(10))]);
    return { store, svc, engine: createProjectionEngine({ store, now: () => NOW }) };
  }
  const eventLog = async (store: ReturnType<typeof createMemoryStore>) => JSON.stringify(await store.list({ learnerId: L, limit: 1000 }));

  it('a correction never writes an event, and the learner events stay byte for byte', async () => {
    const { store, svc, engine } = await world();
    await engine.project(L);
    const before = await eventLog(store);
    const head = await store.head(L);
    await svc.correct(FORM, { lexemeId: 'lemma:sq:libër:NOUN', by: 'reviewer', reviewerId: 'ana.k' }, NOW);
    await svc.correct(FORM, { lexemeId: 'lemma:sq:libër:NOUN', by: 'learner' }, NOW);
    expect(await eventLog(store)).toBe(before);
    expect(await store.head(L)).toBe(head);
  });

  it('learner events never change a field state (encounters, lookups, marks, projection)', async () => {
    const { store, engine } = await world();
    const before = await snapshotRows(store);
    const more: GoEvent[] = [
      encounter([FORM], { at: '2026-10-07T11:00:00.000Z' }), lookup([FORM], { at: '2026-10-07T11:01:00.000Z' }),
      ev('ItemMarked', [FORM], { mark: 'known' }, { at: '2026-10-07T11:02:00.000Z' }), ev('ItemMarked', ['lemma:sq:libër:NOUN'], { mark: 'productive' }, { at: '2026-10-07T11:03:00.000Z' }),
    ];
    await store.append(L, more);
    await engine.project(L);
    await engine.rebuild(L);
    expect(await snapshotRows(store)).toBe(before);
    expect(E).toBeTruthy();
  });
});

// type-level guard: the candidate shape the service builds stays assignable to a reading
const _typeCheck: AnalysisCandidate = { confidence: 1, provenance: prov('rule', 1) };
void _typeCheck;
