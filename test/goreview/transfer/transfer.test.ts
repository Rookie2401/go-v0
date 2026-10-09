import { describe, expect, it } from 'vitest';
import { explainItem, reviewHistory } from '../../../packages/goreview/src/history/history';
import { helpAfterPasses, listeningVsReading, measuresFor, recognitionInPassages, usedInWriting } from '../../../packages/goreview/src/transfer/measures';
import type { GoEvent } from '../../../packages/repository-contract/src';
import { deckItem, ev } from '../intake/fixtures';

const U = 'form:sq:librin';
const V = 'form:sq:shtëpinë';
const day = (d: number, h = 10) => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`;

const review = (d: number, correct: boolean, over: Partial<GoEvent> = {}, payload: Record<string, unknown> = {}) =>
  ev('CardReviewed', { cardKind: 'recognition', grade: correct ? 'good' : 'again', correct, hinted: false, rating: correct ? 3 : 1, outcome: correct ? 'correct' : 'incorrect', family: 'written-recognition', ...payload },
    { at: day(d), subject: { cardId: `card:written-recognition:${U}`, itemIds: [U] }, ...over });
const listened = (d: number, correct: boolean, quality: 'none' | 'moderate' = 'moderate') =>
  ev('ListeningAssessed', { stimulus: 'word', voice: quality === 'none' ? 'synthetic' : 'recorded', answerShownBefore: false, correct, responseMode: 'choice', rating: correct ? 3 : 1, family: 'audio-to-meaning' },
    { at: day(d), subject: { cardId: `card:auditory-recognition:${U}`, itemIds: [U] }, evidence: { quality } });
const help = (d: number, h = 10, unit = U) => ev('AssistanceRequested', { assistance: 'gloss' }, { at: day(d, h), subject: { itemIds: [unit] } });
const understood = (d: number, helpUsed: boolean, unit = U) => ev('UnderstoodMarked', { scope: 'sentence', helpUsed }, { at: day(d), subject: { itemIds: [unit, 'form:sq:other'] } });
const produced = (d: number, assisted: boolean, usedCorrectly: boolean | 'unjudged', unit = U) =>
  ev('ProductionRecorded', { mode: 'free', assisted, assistance: assisted ? ['hint'] : [], usedCorrectly }, { at: day(d), subject: { itemIds: [unit] } });

describe('helpAfterPasses', () => {
  it('counts help requested after the third correct review, not before', () => {
    const events = [help(1), review(2, true), review(3, true), help(3, 12), review(4, true), help(5), help(6), review(7, false)];
    const m = helpAfterPasses(events, U);
    expect(m.value).toBe(2); // days 5 and 6; the third pass is day 4, so the help on days 1 and 3 came before it
    expect(m.basis.some((b) => b.startsWith('help:'))).toBe(true);
    expect(m.caveat.length).toBeGreaterThan(20);
  });

  it('is null (not zero) with fewer than three correct reviews, and says so', () => {
    const m = helpAfterPasses([review(1, true), review(2, true), review(3, false), help(4)], U);
    expect(m.value).toBeNull();
    expect(m.basis[0]).toContain('2 correct review(s)');
  });

  it('ignores other units and incorrect reviews', () => {
    const events = [review(1, true), review(2, true), review(3, false), help(5), help(5, 11, V)];
    expect(helpAfterPasses(events, U).value).toBeNull();
    expect(helpAfterPasses(events, V).value).toBeNull();
  });

  it('zero help after three passes is a real zero', () => {
    const m = helpAfterPasses([review(1, true), review(2, true), review(3, true)], U);
    expect(m.value).toBe(0);
  });

  it('deduplicates events delivered twice', () => {
    const h = help(6);
    const events = [review(1, true), review(2, true), review(3, true), h, h];
    expect(helpAfterPasses(events, U).value).toBe(1);
  });
});

describe('recognitionInPassages', () => {
  it('counts sentences containing the unit understood without help', () => {
    const m = recognitionInPassages([understood(1, false), understood(2, true), understood(3, false), understood(4, false, V)], U);
    expect(m.value).toBe(2);
    expect(m.basis[0]).toContain('3 sentence(s) marked understood, 1 of them with help');
    expect(m.caveat).toContain('Self-report');
  });

  it('ignores passage-scope marks', () => {
    const passage = ev('UnderstoodMarked', { scope: 'passage', helpUsed: false }, { subject: { itemIds: [U] } });
    expect(recognitionInPassages([passage], U).value).toBe(0);
  });
});

describe('listeningVsReading', () => {
  it('is the listening correct rate minus the reading correct rate, with practice-only audio excluded', () => {
    const events = [
      review(1, true), review(2, true), review(3, true), review(4, false),                // reading 3/4
      listened(1, true), listened(2, false), listened(3, false), listened(4, true),       // listening 2/4
      listened(5, true, 'none'), listened(6, true, 'none'),                               // synthetic practice: excluded
    ];
    const m = listeningVsReading(events, U);
    expect(m.value).toBe(-0.25);
    expect(m.basis[0]).toContain('2/4 correct (2 practice-only result(s) excluded)');
    expect(m.basis[1]).toContain('3/4');
  });

  it('is null until each side has three counted results', () => {
    const events = [review(1, true), review(2, true), review(3, true), listened(1, true), listened(2, true), listened(3, true, 'none')];
    const m = listeningVsReading(events, U);
    expect(m.value).toBeNull();
    expect(m.basis.join(' ')).toContain('at least 3');
  });
});

describe('usedInWriting', () => {
  it('counts only unassisted, correct productions of the unit', () => {
    const events = [produced(1, false, true), produced(2, true, true), produced(3, false, false), produced(4, false, 'unjudged'), produced(5, false, true), produced(6, false, true, V)];
    const m = usedInWriting(events, U);
    expect(m.value).toBe(2);
    expect(m.basis[0]).toContain('5 production(s)');
    expect(m.basis[0]).toContain('1 of those unjudged');
  });
});

describe('measures never claim', () => {
  it('every measure carries a basis and a caveat and names no conclusion', () => {
    const ms = measuresFor([review(1, true), listened(1, true), help(2), understood(1, false), produced(1, false, true)], U);
    expect(ms).toHaveLength(4);
    for (const m of ms) {
      expect(m.basis.length).toBeGreaterThan(0);
      expect(m.caveat.length).toBeGreaterThan(30);
      expect(`${m.measure} ${m.caveat}`.toLowerCase()).not.toMatch(/\b(mastered|mastery|proves|proved|has learned)\b/u);
      expect(m.value === null || typeof m.value === 'number').toBe(true);
    }
  });
});

describe('reviewHistory', () => {
  const events = [
    review(1, true), review(2, false, {}, { hinted: true }), review(3, true),
    listened(2, true),
    ev('AssessmentAnswered', { constructionId: 'morph:x', task: 'apply', correct: false, hinted: false, rating: null, outcome: 'invalid-question', family: 'grammar-application' }, { at: day(4), subject: { cardId: 'card:construction-understanding:morph:x', itemIds: ['morph:x'] } }),
    help(2),
  ];

  it('counts per item and per assessment dimension, never merging dimensions', () => {
    const h = reviewHistory(events);
    expect(h.totalReviews).toBe(5);
    const reading = h.items[`card:written-recognition:${U}`];
    expect(reading.reviews).toBe(3);
    const d = reading.byDimension['written-recognition']!;
    expect([d.reviews, d.correct, d.incorrect, d.assisted, d.again]).toEqual([3, 2, 1, 1, 1]);
    expect(d.last?.at).toBe(day(3));
    const listening = h.items[`card:auditory-recognition:${U}`].byDimension['auditory-recognition']!;
    expect([listening.reviews, listening.correct]).toEqual([1, 1]);
    const grammar = h.items['card:construction-understanding:morph:x'].byDimension['construction-understanding']!;
    expect([grammar.other, grammar.unscored]).toEqual([1, 1]); // an invalid question is not a pass or a fail
  });

  it('filters by item, unit and period', () => {
    expect(reviewHistory(events, { itemId: `card:auditory-recognition:${U}` }).totalReviews).toBe(1);
    expect(reviewHistory(events, { unitId: 'morph:x' }).totalReviews).toBe(1);
    expect(reviewHistory(events, { since: day(3) }).totalReviews).toBe(2);
    expect(reviewHistory(events, { languageId: 'xx' }).totalReviews).toBe(0);
  });

  it('counts a duplicated event once', () => {
    const r = review(1, true);
    expect(reviewHistory([r, r]).totalReviews).toBe(1);
  });

  it('explainItem says why the item exists, what was asked and what is next', () => {
    const item = deckItem({ reasons: ['looked up three times | explains:x'] });
    const text = explainItem(item, reviewHistory(events));
    expect(text).toContain('from your reading: looked up three times');
    expect(text).not.toContain('explains:x');
    expect(text).toContain('Reviewed 3 times');
    expect(text).toContain('written recognition: 2 correct, 1 incorrect, 1 with help');
    expect(text).toContain('Next due');
    expect(explainItem(deckItem({ status: 'suspended' }), undefined)).toContain('Not reviewed yet');
    expect(explainItem(deckItem({ status: 'suspended' }), undefined)).toContain('Currently suspended');
  });
});
