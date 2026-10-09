// @vitest-environment node
/** The eligibility gates by validation level (projection@2): status and validation decide together; confidence never raises a status. */
import { describe, expect, it } from 'vitest';
import { ANALYSIS_STATUSES, DIMENSIONS, STATUS_RANK } from '../../../packages/repository-contract/src';
import type { AnalysisStatus, Dimension, FormAnalysis, LinguisticUnit, UnitProvenance, ValidationLevel } from '../../../packages/repository-contract/src';
import { RECOGNITION_DIMENSIONS, STATUS_ORDER, VALIDATION_ORDER, affectedByCorrection, affectedByInvalidation, eligibilityFor, validationFor } from '../../../packages/repository-engine/src';
import { analysis, unit } from './helpers';

const FORM = 'form:sq:librin';
const JUDGED: Dimension[] = DIMENSIONS.filter((d) => d !== 'exposure');
const NON_RECOGNITION = JUDGED.filter((d) => !RECOGNITION_DIMENSIONS.includes(d));
const prov = (validation: ValidationLevel | undefined, confidence = 0.9): UnitProvenance => ({ source: 'dictionary', ref: 'test', confidence, ...(validation ? { validation } : {}) });
const u = (status: AnalysisStatus, validation: ValidationLevel | undefined, confidence = 0.9): LinguisticUnit => unit(FORM, 'form', status as AnalysisStatus, { provenance: prov(validation, confidence) });
const a = (status: AnalysisStatus, validation: ValidationLevel | undefined, confidence = 0.9): FormAnalysis =>
  analysis(FORM, status as AnalysisStatus, { candidates: [{ confidence, provenance: prov(validation, confidence) }], chosen: 0 });
const ok = (e: ReturnType<typeof eligibilityFor>): e is Extract<typeof e, { eligible: true }> => e.eligible;

describe('status rank order', () => {
  it('verified > high-confidence > provisional > requires-review > conflicted > invalidated', () => {
    const order = Object.entries(STATUS_ORDER).sort((x, y) => y[1] - x[1]).map(([s]) => s);
    expect(order).toEqual(['verified', 'high-confidence', 'provisional', 'requires-review', 'conflicted', 'invalidated']);
  });
  it('agrees with the contract on every status the contract knows', () => {
    for (const x of ANALYSIS_STATUSES) for (const y of ANALYSIS_STATUSES) {
      expect(Math.sign(STATUS_ORDER[x] - STATUS_ORDER[y]), `${x} vs ${y}`).toBe(Math.sign(STATUS_RANK[x] - STATUS_RANK[y]));
    }
  });
});

describe('production-validated: the status decides', () => {
  it.each([['production-validated']] as const)('%s + verified / high-confidence is eligible for every dimension', (v) => {
    for (const status of ['verified', 'high-confidence'] as const) {
      for (const d of JUDGED) {
        const e = eligibilityFor(u(status, v), [a(status, v)], d);
        expect(e, `${status} ${d}`).toEqual({ eligible: true, status, caveats: [] });
      }
    }
  });
  it('provisional is eligible for recognition only, with the caveat', () => {
    for (const d of RECOGNITION_DIMENSIONS) expect(eligibilityFor(u('provisional', 'production-validated'), [], d)).toEqual({ eligible: true, status: 'provisional', caveats: ['provisional analysis; shown with caveats'] });
    for (const d of NON_RECOGNITION) expect(eligibilityFor(u('provisional', 'production-validated'), [], d)).toMatchObject({ eligible: false, status: 'provisional', reason: expect.stringContaining(d) });
  });
});

describe.each([['experimental'], ['seed-only'], ['unreviewed']] as const)('%s: provisional at best, whatever the status or confidence', (validation) => {
  it('a verified, 0.99-confidence unit stays provisional: recognition dimensions only, with caveats, never `verified`', () => {
    for (const d of RECOGNITION_DIMENSIONS) {
      const e = eligibilityFor(u('verified', validation, 0.99), [a('verified', validation, 0.99)], d);
      expect(ok(e)).toBe(true);
      expect(e).toMatchObject({ eligible: true, status: 'provisional' });
      if (ok(e)) {
        expect(e.caveats).toContain('provisional analysis; shown with caveats');
        expect(e.caveats.join(' ')).toContain(validation);
      }
    }
  });
  it('never eligible for a grammatical, productive, contextual or phrase item, and the reason says why', () => {
    for (const status of ['verified', 'high-confidence', 'provisional'] as const) {
      for (const d of NON_RECOGNITION) {
        const e = eligibilityFor(u(status, validation, 0.99), [a(status, validation, 0.99)], d);
        expect(e, `${status} ${d}`).toMatchObject({ eligible: false, status: 'provisional' });
        if (!e.eligible) expect(e.reason).toMatch(new RegExp(`${validation}.*${d}`));
      }
    }
    expect(NON_RECOGNITION).toEqual(expect.arrayContaining(['grammaticalUnderstanding', 'productiveRetrieval', 'contextualProduction', 'phraseComprehension']));
  });
  it('confidence alone never raises a status: 0.99 and 0.1 read the same', () => {
    const hi = eligibilityFor(u('high-confidence', validation, 0.99), [a('high-confidence', validation, 0.99)], 'readingRecognition');
    const lo = eligibilityFor(u('high-confidence', validation, 0.1), [a('high-confidence', validation, 0.1)], 'readingRecognition');
    expect(hi).toEqual(lo);
    expect(hi).toMatchObject({ eligible: true, status: 'provisional' });
  });
});

describe('a row with no validation stated is a v2 row and reads as unreviewed (see the contract provenanceOf)', () => {
  it('verified + no validation: recognition only, capped at provisional', () => {
    expect(eligibilityFor(u('verified', undefined), [a('verified', undefined)], 'readingRecognition')).toMatchObject({ eligible: true, status: 'provisional' });
    expect(eligibilityFor(u('verified', undefined), [a('verified', undefined)], 'grammaticalUnderstanding')).toMatchObject({ eligible: false, status: 'provisional' });
    expect(validationFor(u('verified', undefined), [a('verified', undefined)])).toBe('unreviewed');
  });
  it('an analysis states its validation on its own provenance, which can lower the unit validation', () => {
    const an: FormAnalysis = { ...a('verified', 'production-validated'), provenance: prov('seed-only') };
    expect(validationFor(u('verified', 'production-validated'), [an])).toBe('seed-only');
  });
});

describe('the lowest validation of the unit and its best live analysis decides', () => {
  it('a production-validated unit with an experimental analysis is capped; and the other way round', () => {
    expect(eligibilityFor(u('verified', 'production-validated'), [a('verified', 'experimental')], 'grammaticalUnderstanding')).toMatchObject({ eligible: false, status: 'provisional' });
    expect(eligibilityFor(u('verified', 'experimental'), [a('verified', 'production-validated')], 'grammaticalUnderstanding')).toMatchObject({ eligible: false, status: 'provisional' });
    expect(eligibilityFor(u('verified', 'production-validated'), [a('verified', 'production-validated')], 'grammaticalUnderstanding')).toMatchObject({ eligible: true, status: 'verified' });
  });
  it('an unrecognised validation string reads as unreviewed (capped), not as validated', () => {
    const e = eligibilityFor(u('verified', 'from-the-future' as ValidationLevel), [], 'grammaticalUnderstanding');
    expect(e).toMatchObject({ eligible: false, status: 'provisional' });
  });
  it('the validation order runs from unsupported to production-validated', () => {
    expect([...VALIDATION_ORDER]).toEqual(['unsupported', 'incomplete', 'unreviewed', 'seed-only', 'experimental', 'production-validated']);
  });
});

describe.each([['incomplete'], ['unsupported']] as const)('%s: not eligible, requires review', (validation) => {
  it('for every dimension, with a reason that says a person must review it', () => {
    for (const d of [...JUDGED, 'exposure'] as Dimension[]) {
      const e = eligibilityFor(u('verified', validation, 0.99), [a('verified', validation, 0.99)], d);
      expect(e).toMatchObject({ eligible: false, status: 'requires-review' });
      if (!e.eligible) expect(e.reason).toMatch(new RegExp(`${validation}.*review`));
    }
  });
});

describe('requires-review, conflicted, invalidated and superseded are first-class refusals', () => {
  it.each([['requires-review', /requires review/], ['conflicted', /conflicted/], ['invalidated', /invalidated/]] as const)('%s units are not eligible', (status, reason) => {
    const e = eligibilityFor(u(status, 'production-validated'), [], 'readingRecognition');
    expect(e).toMatchObject({ eligible: false, status });
    if (!e.eligible) expect(e.reason).toMatch(reason);
  });
  it('a best live analysis at requires-review lowers the unit to it', () => {
    expect(eligibilityFor(u('verified', 'production-validated'), [a('requires-review', 'production-validated')], 'readingRecognition')).toMatchObject({ eligible: false, status: 'requires-review' });
  });
  it('requires-review ranks below provisional: a provisional live analysis beats a requires-review one', () => {
    const e = eligibilityFor(u('verified', 'production-validated'), [a('requires-review', 'production-validated'), { ...a('provisional', 'production-validated'), analysisId: 'other' }], 'readingRecognition');
    expect(e).toMatchObject({ eligible: true, status: 'provisional' });
  });
  it('a unit superseded by a corrected one reads invalidated with the successor named', () => {
    const e = eligibilityFor(unit('lemma:sq:old:NOUN', 'lexeme', 'verified', { supersededBy: 'lemma:sq:new:NOUN' }), [], 'readingRecognition');
    expect(e).toEqual({ eligible: false, status: 'invalidated', reason: 'superseded by lemma:sq:new:NOUN' });
  });
});

describe('affectedByCorrection', () => {
  it('names everything the superseded analyses or the corrected one pointed at, and what to withdraw', () => {
    const cand = (lexemeId: string, constructionIds: string[] = []) => ({ lexemeId, constructionIds, confidence: 0.5, provenance: prov(undefined) });
    const old = analysis(FORM, 'invalidated', { candidates: [cand('lemma:sq:a:NOUN', ['morph:sq:NOUN:X'])] });
    const next = analysis(FORM, 'verified', { analysisId: 'an:next', candidates: [cand('lemma:sq:b:NOUN', ['morph:sq:NOUN:X'])] });
    expect(affectedByCorrection([old], next)).toEqual({ affected: ['lemma:sq:a:NOUN', 'lemma:sq:b:NOUN', 'morph:sq:NOUN:X'], withdraw: ['lemma:sq:a:NOUN'] });
    expect(affectedByInvalidation(old)).toEqual(['lemma:sq:a:NOUN', 'morph:sq:NOUN:X']);
  });
});
