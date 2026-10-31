/**
 * The UTC-day new-card allowance bounds introductions of GoLearn vocabulary. Class Essentials phrases (`class:<lang>:...`, the built-in
 * deck) are not vocabulary the learner met, so their first answers must not spend it (2026-10-29: a first Class Essentials session spent
 * the whole allowance and the home said "0 eligible new admissions" for the rest of the day).
 */
import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../../packages/repository-contract/src';
import { admissionBudget, NEW_ALLOWANCE_EXEMPT_UNIT_PREFIXES } from '../../../packages/goreview/src/planner/budget';

const NOW = '2026-10-08T10:00:00.000Z';
const creation = (unitId: string, at: string, intent: unknown = { kind: 'explicit', reason: 'saved-deck', requestedAt: at }): GoEvent => ({
  id: `create:${unitId}`, v: 3, learnerId: 'L', enrolmentId: 'E', languageId: 'sq', at, producer: { app: 'gopractice-review', version: 't', deviceId: 'D' },
  kind: 'CardAdded', subject: { cardId: `card:written-recognition:${unitId}`, itemIds: [unitId] },
  payload: { lifecycle: 'create', unitId, unitKind: 'phrase', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'learner', admission: { at, intent } }, evidence: { quality: 'none' },
});
const answer = (unitId: string, at: string): GoEvent => ({
  id: `answer:${unitId}`, v: 3, learnerId: 'L', enrolmentId: 'E', languageId: 'sq', at, producer: { app: 'gopractice-review', version: 't', deviceId: 'D' },
  kind: 'CardReviewed', subject: { cardId: `card:written-recognition:${unitId}`, itemIds: [unitId] },
  payload: { cardKind: 'recognition', grade: 'good', correct: true, hinted: false, rating: 3, outcome: 'correct' }, evidence: { quality: 'weak' },
});
const x = { learnerId: 'L', languageId: 'sq', now: NOW, maxNew: 5, dailyNewLimit: 5 };

describe('the daily allowance and Class Essentials', () => {
  it('twenty class phrases first answered today leave the whole allowance for vocabulary', () => {
    const events = Array.from({ length: 20 }, (_, i) => [creation(`class:sq:phrase-${i}`, '2026-10-08T09:00:00.000Z'), answer(`class:sq:phrase-${i}`, '2026-10-08T09:00:00.000Z')]).flat();
    expect(admissionBudget(events, x)).toEqual({ used: 0, remaining: 5 });
  });
  it('a saved deck of ordinary words still spends it, as the owner asked', () => {
    const events = Array.from({ length: 20 }, (_, i) => [creation(`lemma:sq:w${i}:NOUN`, '2026-10-08T09:00:00.000Z'), answer(`lemma:sq:w${i}:NOUN`, '2026-10-08T09:00:00.000Z')]).flat();
    expect(admissionBudget(events, x)).toEqual({ used: 20, remaining: 0 });
  });
  it('mixed: only the vocabulary counts', () => {
    const events = [creation('class:sq:hello', '2026-10-08T09:00:00.000Z'), answer('class:sq:hello', '2026-10-08T09:00:00.000Z'),
      creation('form:sq:libri', '2026-10-08T09:01:00.000Z', { kind: 'automatic' }), answer('form:sq:libri', '2026-10-08T09:01:00.000Z')];
    expect(admissionBudget(events, x)).toEqual({ used: 1, remaining: 4 });
    expect(NEW_ALLOWANCE_EXEMPT_UNIT_PREFIXES).toEqual(['class:']);
  });
});
