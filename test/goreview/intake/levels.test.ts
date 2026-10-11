// @vitest-environment node
/**
 * Review follows the knowledge level (projection@4): intake names the level in its reasons and leaves an Automatic unit alone unless retention
 * decayed or a mark was contradicted; the human reviewer's queue takes encounters and levels from the Repository's rows and has no way to be asked.
 */
import { describe, expect, it } from 'vitest';
import { decideIntake } from '../../../packages/goreview/src/intake/intake';
import { reviewEligibility, reviewEvidenceOf, validationQueue } from '../../../packages/goreview/src';
import type { FieldStates, FormAnalysis, KnowledgeLevel } from '../../../packages/repository-contract/src';
import { KNOWLEDGE_LEVELS } from '../../../packages/repository-contract/src';
import { candidate, intakeInput, knowledge } from './fixtures';

const at = (level: KnowledgeLevel) => ({ ...knowledge('form:sq:librin'), level });

describe('intake: the level is in the reasons', () => {
  it.each(KNOWLEDGE_LEVELS.filter((l) => l !== 'automatic'))('a %s unit follows the conservative progression gate', (level) => {
    const o = decideIntake(intakeInput({ knowledge: at(level) }));
    if (level === 'new' || level === 'seen') {
      expect(o.decision).toBe('low-priority');
      expect(o.reasons[0]).toContain(`level ${level === 'new' ? 'New' : 'Seen'}`);
      return;
    }
    expect(['test-now', 'test-later']).toContain(o.decision);
    expect(o.reasons.some((r) => r.startsWith('level ') && r.toLowerCase().startsWith(`level ${level}`))).toBe(true);
  });

  it('a row with no level (an older projection) adds no level line and changes nothing else', () => {
    const { level: _l, ...old } = at('seen');
    const o = decideIntake(intakeInput({ knowledge: old as never }));
    expect(o.reasons.some((r) => r.startsWith('level '))).toBe(false);
    expect(o.decision).toBe('test-now');
  });

  it('Automatic with nothing questioning it is already-covered (a stale cached candidate must not re-test it)', () => {
    const o = decideIntake(intakeInput({ knowledge: at('automatic') }));
    expect(o.decision).toBe('already-covered');
    expect(o.reasons[0]).toContain('level Automatic');
  });

  it('candidate labels alone do not count as confirmed unassisted retrieval failure', () => {
    for (const rule of ['retentionDecayed', 'selfMarkContradicted']) {
      const c = candidate({ reasons: [{ rule, weight: rule === 'retentionDecayed' ? 0.15 : 0 }, { rule: 'repeatedLookups', weight: 0.6 }] });
      const o = decideIntake(intakeInput({ candidate: c, knowledge: at('automatic') }));
      expect(o.decision, rule).toBe('already-covered');
    }
  });
});

describe('the human reviewer\'s queue follows progression, never a request', () => {
  const NOWISO = '2026-10-10T09:00:00.000Z';
  const states = { lemma: { state: 'conflicted', basis: 'two analyses disagree', sources: ['a', 'b'], at: NOWISO } } as unknown as FieldStates;
  const analysis = (id: string): FormAnalysis => ({
    analysisId: id, formId: 'form:sq:librin', languageId: 'sq', candidates: [], status: 'provisional', analyzerId: 'x', packId: 'pack:sq', packVersion: '9', createdAt: NOWISO, fieldStates: states,
  });

  it('evidence is built from a knowledge row: its encounters and its level', () => {
    expect(reviewEvidenceOf({ encounters: 3, level: 'familiar' })).toEqual({ encounters: 3, level: 'familiar' });
    expect(reviewEvidenceOf({ encounters: 3, level: 'familiar' }, { sentences: 2, conflicts: 4 })).toEqual({ encounters: 2, level: 'familiar', conflicts: 4 });
  });

  it('a unit at level new is never review material; any level beyond it is, once the field rules are met', () => {
    expect(reviewEligibility(analysis('a'), { encounters: 5, level: 'new' })).toMatchObject({ eligible: false });
    expect(reviewEligibility(analysis('a'), { encounters: 5, level: 'new' }).reason).toContain('level New');
    for (const l of KNOWLEDGE_LEVELS.filter((x) => x !== 'new')) expect(reviewEligibility(analysis('a'), { encounters: 1, level: l }), l).toMatchObject({ eligible: true, priority: 1 });
    expect(reviewEligibility(analysis('a'), { encounters: 1 })).toMatchObject({ eligible: true }); // unstated level: not checked, as before
  });

  it('the queue takes its evidence from rows; there is no input for a learner\'s request', () => {
    const q = validationQueue([
      { subject: analysis('met'), evidence: reviewEvidenceOf({ encounters: 2, level: 'seen' }) },
      { subject: analysis('unmet'), evidence: reviewEvidenceOf({ encounters: 2, level: 'new' }) },
    ]);
    expect(q.queue.map((e) => e.id)).toEqual(['met']);
    expect(q.skipped.map((s) => s.id)).toEqual(['unmet']);
    expect(Object.keys(reviewEvidenceOf({ encounters: 1, level: 'seen' })).sort()).toEqual(['encounters', 'level']);
  });
});
