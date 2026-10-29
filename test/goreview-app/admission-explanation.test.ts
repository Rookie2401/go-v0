/** The home's one-line answer to "why 0 eligible new admissions" (2026-10-29). */
import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { explainAdmissions } from '../../packages/goreview/app/admissionExplanation';
import type { ReviewModel } from '../../packages/goreview/app/workspace';
import type { IntakeOutcome } from '../../packages/goreview/src/types';
import { candidate as candidateOf, ids } from './helpers';

const A = ids('L1', 'sq');
const NOW = '2026-10-08T10:00:00.000Z';
const outcome = (unitId: string, decision: IntakeOutcome['decision']): IntakeOutcome => ({ unitId, decision, reasons: ['test'], candidate: candidateOf(unitId.split(':')[2] ?? 'x', 0.6, { unitId }), ...(decision === 'test-now' ? { proposed: { dimension: 'written-recognition', family: 'written-recognition' } } : {}) });
const creation = (unitId: string, at: string): GoEvent => ({
  id: `create:${unitId}`, v: 3, learnerId: A.learnerId, enrolmentId: A.enrolmentId, languageId: 'sq', at, producer: { app: 'gopractice-review', version: 't', deviceId: 'D' },
  kind: 'CardAdded', subject: { cardId: `card:written-recognition:${unitId}`, itemIds: [unitId] },
  payload: { lifecycle: 'create', unitId, unitKind: 'lemma', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'intake', admission: { at, intent: { kind: 'automatic' } } }, evidence: { quality: 'none' },
});
function model(over: Partial<ReviewModel> = {}): ReviewModel {
  return {
    identity: { learnerId: A.learnerId, enrolmentId: A.enrolmentId, languageId: 'sq' } as ReviewModel['identity'],
    prefs: { languageId: 'sq', sessionMinutes: 10, maxNew: 5, dailyNewLimit: 5, desiredRetention: 0.9, includeListening: true, grammarShare: 0.2, prioritizeSaved: true, cardsPerDeck: 20 },
    events: [], deck: [], classDeck: [], counts: { due: 0, learning: 0, fresh: 0, suspended: 0, snoozed: 0, dismissed: 0, total: 0 },
    audio: { available: true, eligibleForEvidence: false, reason: 'device voice' }, outcomes: [], knowledge: [], dismissed: [], choices: {}, saved: new Set(),
    candidateSource: 'live', knowledgeStatus: { source: 'live', requested: 0, resolved: 0, missing: [], fetchedAt: NOW }, withheld: [],
    now: NOW, algorithm: 'fsrs', parametersVersion: 'x', ...over,
  } as ReviewModel;
}
const deck = (newAvailable: number, skipped: Array<{ itemId: string; why: string; code?: string }> = []) => ({ summary: { newAvailable } as never, plan: { skipped } } as unknown as Parameters<typeof explainAdmissions>[1]);

describe('why no new words', () => {
  it('says nothing when new words are on offer', () => {
    expect(explainAdmissions(model(), deck(2))).toBeUndefined();
  });
  it('knowledge that could not be loaded comes first', () => {
    const m = model({ withheld: [{ unitId: 'lemma:sq:a:NOUN', code: 'knowledge-unresolved', detail: '' }, { unitId: 'lemma:sq:b:NOUN', code: 'knowledge-unresolved', detail: '' }], knowledgeStatus: { source: 'partial', requested: 10, resolved: 8, missing: ['lemma:sq:a:NOUN', 'lemma:sq:b:NOUN'], fetchedAt: NOW } });
    const why = explainAdmissions(m, deck(0))!;
    expect(why.code).toBe('knowledge-unresolved');
    expect(why.text).toContain('2 words could not be loaded');
  });
  it('the daily allowance, used by today\'s introductions', () => {
    const events = [1, 2, 3, 4, 5].map((i) => creation(`lemma:sq:w${i}:NOUN`, '2026-10-08T08:00:00.000Z'));
    const why = explainAdmissions(model({ events, outcomes: [outcome('lemma:sq:z:NOUN', 'test-now')] }), deck(0))!;
    expect(why.code).toBe('daily-allowance-used');
    expect(why.text).toContain('5 words were introduced');
    expect(why.text).toContain('allowance is 5');
  });
  it('new words switched off', () => {
    expect(explainAdmissions(model({ prefs: { ...model().prefs, maxNew: 0 } }), deck(0))?.code).toBe('new-words-off');
  });
  it('no candidates at all: offline without a copy, or nothing proposed', () => {
    expect(explainAdmissions(model({ candidateSource: 'none' }), deck(0))?.text).toContain('could not be reached');
    expect(explainAdmissions(model(), deck(0))?.text).toContain('read with GoLearn');
  });
  it('candidates that intake could not turn into questions, counted by decision', () => {
    const outcomes = [outcome('lemma:sq:a:NOUN', 'needs-validation'), outcome('lemma:sq:b:NOUN', 'too-uncertain'), outcome('lemma:sq:c:NOUN', 'test-later'), outcome('lemma:sq:d:NOUN', 'already-covered')];
    const why = explainAdmissions(model({ outcomes }), deck(0))!;
    expect(why.code).toBe('candidates-not-testable');
    expect(why.text).toContain('2 words have no verified facts');
    expect(why.text).toContain('1 word waits');
    expect(why.text).toContain('1 word is already in your deck');
  });
  it('eligible words that wait for the next batch, and words the planner refused', () => {
    const outcomes = [outcome('lemma:sq:a:NOUN', 'test-now'), outcome('lemma:sq:b:NOUN', 'test-now')];
    expect(explainAdmissions(model({ outcomes }), deck(0, [{ itemId: 'x', why: 'full', code: 'beyond-micro-deck' }]))?.code).toBe('eligible-waiting');
    const refused = explainAdmissions(model({ outcomes }), deck(0, [{ itemId: 'x', why: 'new', code: 'knowledge-beyond-new-required' }, { itemId: 'y', why: 'seen', code: 'seen-evidence-insufficient' }]))!;
    expect(refused.code).toBe('none-eligible');
    expect(refused.text).toContain('1 word was never met in a text');
    expect(refused.text).toContain('1 word needs a second encounter');
  });
});
