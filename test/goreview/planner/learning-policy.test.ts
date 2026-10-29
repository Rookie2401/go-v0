import { describe, expect, it } from 'vitest';
import type { GoEvent, ReviewCandidate, UnitKnowledge } from '../../../packages/repository-contract/src';
import { choosePractice as chooseWithDeck, type ChoosePracticeInput } from '../../../packages/goreview/src/planner/learning-policy';
import { deckItem, prefs, knowledge } from '../intake/fixtures';

const unitId = 'lemma:sq:punoj';
const candidate: ReviewCandidate = { unitId, kind: 'lexeme', score: .8, reasons: [], targetDimension: 'productiveRetrieval', eligibility: { eligible: true, status: 'verified', caveats: [] }, cost: .2 };
const event = (id: string, at: string, over: Partial<GoEvent> = {}): GoEvent => ({
  id, v: 3, learnerId: 'L1', enrolmentId: 'E1', languageId: 'sq', at,
  producer: { app: 'gopractice-review', version: 'test', deviceId: 'D1' }, kind: 'CardReviewed',
  subject: { cardId: 'card:written-recognition:' + unitId, itemIds: [unitId] },
  payload: { family: 'written-recognition', assessmentDimension: 'written-recognition', rating: 3, correct: true, hinted: false },
  evidence: { quality: 'moderate' }, ...over,
});
const k = (level: UnitKnowledge['level']): UnitKnowledge => ({ ...knowledge(unitId), level });
const choosePractice = (input: Omit<ChoosePracticeInput, 'deck' | 'now'> & { deck?: ChoosePracticeInput['deck']; now?: string }) => chooseWithDeck({ ...input, deck: input.deck ?? [], now: input.now ?? '2026-10-27T12:00:00Z' });

describe('evidence-based practice progression', () => {
  it('keeps New and Seen at recognition and can disable all selected goals', () => {
    expect(choosePractice({ candidate, knowledge: k('new'), preferences: prefs(), events: [] })?.dimension).toBe('written-recognition');
    expect(choosePractice({ candidate, knowledge: k('seen'), preferences: prefs(), events: [] })?.dimension).toBe('written-recognition');
    expect(choosePractice({ candidate, knowledge: k('seen'), preferences: prefs({ practiceGoals: [] }), events: [] })).toBeUndefined();
  });
  it('requires two independent, spaced recognition successes before Recognized production', () => {
    const one = event('a', '2026-10-01T10:00:00Z');
    const two = event('b', '2026-10-02T10:00:00Z');
    const choose = (events: GoEvent[]) => choosePractice({ candidate, knowledge: k('recognized'), preferences: prefs({ practiceGoals: ['recognition','retrieval'] }), events });
    expect(choose([one])?.dimension).toBe('written-recognition');
    expect(choose([one, event('close', '2026-10-01T11:00:00Z')])?.dimension).toBe('written-recognition');
    expect(choose([one, two])?.dimension).toBe('meaning-to-target-retrieval');
  });
  it('can progress a Familiar reading candidate into one opted-in listening objective after spaced independent proof', () => {
    const listeningCandidate = { ...candidate, targetDimension: 'readingRecognition' as const, objectiveDimension: 'listeningRecognition' as const };
    const spaced = [event('a', '2026-10-01T10:00:00Z'), event('b', '2026-10-02T10:00:00Z')];
    const choose = (events: GoEvent[]) => choosePractice({ candidate: listeningCandidate, knowledge: k('familiar'), preferences: prefs({ practiceGoals: ['listening'], includeListening: true }), events });
    expect(choose([spaced[0]])).toBeUndefined();
    expect(choose(spaced)).toEqual({ dimension: 'auditory-recognition', family: 'audio-to-meaning' });
    expect(choosePractice({ candidate: listeningCandidate, knowledge: k('familiar'), preferences: prefs({ practiceGoals: ['listening'], includeListening: false }), events: spaced })).toBeUndefined();
  });
  it('does not admit another objective when the candidate and review evidence are from another language', () => {
    const listeningCandidate = { ...candidate, targetDimension: 'readingRecognition' as const, objectiveDimension: 'listeningRecognition' as const };
    const spaced = [event('a', '2026-10-01T10:00:00Z', { languageId: 'es' }), event('b', '2026-10-02T10:00:00Z', { languageId: 'es' })];
    expect(choosePractice({ candidate: listeningCandidate, knowledge: k('familiar'), preferences: prefs({ practiceGoals: ['listening'] }), events: spaced })).toBeUndefined();
  });
  it('does not use hinted, shown, assisted, synthetic, or no-attempt reviews as progression evidence', () => {
    const a = event('a', '2026-10-01T10:00:00Z');
    const bad = [
      event('hint', '2026-10-02T10:00:00Z', { payload: { family: 'written-recognition', rating: 3, correct: true, hinted: true } }),
      event('shown', '2026-10-03T10:00:00Z', { payload: { family: 'written-recognition', rating: 3, correct: true, answerShownBefore: true } }),
      event('transcript', '2026-10-03T11:00:00Z', { payload: { family: 'written-recognition', rating: 3, correct: true, transcriptShownBefore: true } }),
      event('assist', '2026-10-04T10:00:00Z', { evidence: { quality: 'moderate', assisted: true } }),
      event('synthetic', '2026-10-05T10:00:00Z', { evidence: { quality: 'none' } }),
      event('noattempt', '2026-10-06T10:00:00Z', { payload: { family: 'written-recognition', rating: 3, correct: true, retrievalAttempted: false } }),
    ];
    expect(choosePractice({ candidate, knowledge: k('recognized'), preferences: prefs({ practiceGoals: ['retrieval'] }), events: [a, ...bad] })?.dimension).toBe('written-recognition');
  });
  it('removes corrected recognition from the evidence chain', () => {
    const a = event('a', '2026-10-01T10:00:00Z');
    const b = event('b', '2026-10-02T10:00:00Z');
    const correction = event('undo-b', '2026-10-02T11:00:00Z', {
      correctionOf: 'b', payload: { rating: null, challenged: true }, evidence: { quality: 'none' },
    });
    expect(choosePractice({ candidate, knowledge: k('recognized'), preferences: prefs({ practiceGoals: ['retrieval'] }), events: [a, b, correction] })?.dimension).toBe('written-recognition');
  });
  it('does not treat weak multiple-choice or partial-credit Hard as productive readiness', () => {
    const a = event('a', '2026-10-01T10:00:00Z', { evidence: { quality: 'weak' } });
    const b = event('b', '2026-10-02T10:00:00Z', { evidence: { quality: 'weak' } });
    const partial = event('partial', '2026-10-03T10:00:00Z', { payload: { family: 'written-recognition', rating: 2, correct: true, outcome: 'partial' } });
    expect(choosePractice({ candidate, knowledge: k('recognized'), preferences: prefs({ practiceGoals: ['retrieval'] }), events: [a,b,partial] })?.dimension).toBe('written-recognition');
  });
  it('excludes scheduler-conflicted branches supplied by the folded deck', () => {
    const a = event('a', '2026-10-01T10:00:00Z');
    const b = event('b', '2026-10-02T10:00:00Z');
    const item = deckItem({ unitId, history: [{ at: b.at, rating: 3, outcome: 'correct', deviceId: 'D1', exerciseId: 'b', family: 'written-recognition', elapsedDays: 1, eventId: b.id, scheduleExcluded: 'conflicting sibling', conflict: true }] });
    expect(choosePractice({ candidate, knowledge: k('recognized'), preferences: prefs({ practiceGoals: ['retrieval'] }), events: [a,b], deck: [item] })?.dimension).toBe('written-recognition');
  });
  it('does not treat equal-time evidence as delayed even when event ids order consistently', () => {
    const a = event('a', '2026-10-01T10:00:00Z');
    const b = event('b', '2026-10-01T10:00:00Z');
    expect(choosePractice({ candidate, knowledge: k('recognized'), preferences: prefs({ practiceGoals: ['retrieval'] }), events: [b,a] })?.dimension).toBe('written-recognition');
  });
  it('rejects string and future ratings from the progression evidence window', () => {
    const a = event('a', '2026-10-01T10:00:00Z');
    const stringRating = event('c', '2026-10-03T10:00:00Z', { payload: { family: 'written-recognition', rating: '4', correct: true } });
    const future = event('d', '2026-10-28T10:00:00Z');
    expect(choosePractice({ candidate, knowledge: k('recognized'), preferences: prefs({ practiceGoals: ['retrieval'] }), events: [a,stringRating,future], now: '2026-10-27T12:00:00Z' })?.dimension).toBe('written-recognition');
  });
  it('does not use recognition evidence from another language', () => {
    const a = event('a', '2026-10-01T10:00:00Z', { languageId: 'es' });
    const b = event('b', '2026-10-02T10:00:00Z', { languageId: 'es' });
    expect(choosePractice({ candidate, knowledge: k('recognized'), preferences: prefs({ practiceGoals: ['retrieval'] }), events: [a,b] })?.dimension).toBe('written-recognition');
  });
  it('does not multiply application and retrieval into unrelated dimensions', () => {
    const appCandidate = { ...candidate, targetDimension: 'contextualProduction' as const };
    const spaced = [event('a', '2026-10-01T10:00:00Z'), event('b', '2026-10-02T10:00:00Z')];
    expect(choosePractice({ candidate: appCandidate, knowledge: k('familiar'), preferences: prefs({ practiceGoals: ['application'] }), events: spaced })).toEqual({ dimension: 'productive-recall', family: 'sentence-completion' });
    expect(choosePractice({ candidate: appCandidate, knowledge: k('recognized'), preferences: prefs({ practiceGoals: ['application'] }), events: spaced })).toBeUndefined();
    expect(choosePractice({ candidate: appCandidate, knowledge: k('familiar'), preferences: prefs({ practiceGoals: ['application','retrieval'] }), events: spaced })).toEqual({ dimension: 'productive-recall', family: 'sentence-completion' });
    const grammarCandidate = { ...candidate, kind: 'form' as const, targetDimension: 'grammaticalUnderstanding' as const };
    expect(choosePractice({ candidate: grammarCandidate, knowledge: k('familiar'), preferences: prefs({ practiceGoals: ['application','retrieval'] }), events: spaced })).toEqual({ dimension: 'morphological-analysis', family: 'morphological-identification' });
  });
});
