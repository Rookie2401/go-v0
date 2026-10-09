/**
 * TRANSFER MEASURES — research measures computed from the event log. They are descriptions of what was recorded, not
 * claims about what the learner knows or whether learning "transferred". Each returns { measure, value, basis, caveat }:
 * `value` is a plain count or difference (null when there is too little to say anything), `basis` lists the event ids and
 * counts it rests on so every number can be traced, and `caveat` says what the number cannot show.
 */
import type { GoEvent } from '../../../repository-contract/src';
import { REVIEW_KINDS } from '../history/history';

export interface Measure {
  measure: string;
  value: number | null;
  basis: string[];
  caveat: string;
}

/** Minimum observations per side before a comparison reports a value. */
export const MIN_PER_SIDE = 3;
export const PASSES_BEFORE_HELP = 3;

const ids = (e: GoEvent): string[] => [...(e.subject?.itemIds ?? []), ...(typeof (e.payload as Record<string, unknown>)?.unitId === 'string' ? [(e.payload as Record<string, unknown>).unitId as string] : [])];
const about = (e: GoEvent, unitId: string): boolean => ids(e).includes(unitId);
const byTime = (a: GoEvent, b: GoEvent): number => Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const dedupe = (events: readonly GoEvent[]): GoEvent[] => {
  const seen = new Set<string>();
  return [...events].sort(byTime).filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
};

export function isCorrectReview(e: GoEvent): boolean {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  if (p.outcome === 'correct') return true;
  if (p.outcome !== undefined) return false;
  return p.correct === true;
}

const isWrittenReview = (e: GoEvent): boolean => e.kind === 'CardReviewed' || e.kind === 'AssessmentAnswered';

/** AssistanceRequested for a unit after the learner had answered it correctly at least three times in review. */
export function helpAfterPasses(events: readonly GoEvent[], unitId: string): Measure {
  const all = dedupe(events);
  const passes = all.filter((e) => REVIEW_KINDS.includes(e.kind) && about(e, unitId) && isCorrectReview(e));
  const measure = 'help requested after repeated correct reviews';
  const caveat = 'Help can be asked for out of curiosity, in a different context or for a different sense of the word; a count says that help was requested, not that the earlier passes were lucky.';
  if (passes.length < PASSES_BEFORE_HELP) {
    return { measure, value: null, basis: [`${passes.length} correct review(s) of ${unitId}; at least ${PASSES_BEFORE_HELP} are needed`], caveat };
  }
  const threshold = passes[PASSES_BEFORE_HELP - 1];
  const help = all.filter((e) => e.kind === 'AssistanceRequested' && about(e, unitId) && byTime(e, threshold) > 0);
  return {
    measure, value: help.length,
    basis: [`passes: ${passes.slice(0, PASSES_BEFORE_HELP).map((e) => e.id).join(', ')}`, ...help.map((e) => `help: ${e.id} at ${e.at}`)],
    caveat,
  };
}

/** Sentences containing the unit that the learner marked understood without having used help. */
export function recognitionInPassages(events: readonly GoEvent[], unitId: string): Measure {
  const all = dedupe(events).filter((e) => e.kind === 'UnderstoodMarked' && about(e, unitId));
  const sentences = all.filter((e) => (e.payload as Record<string, unknown>).scope === 'sentence');
  const unhelped = sentences.filter((e) => (e.payload as Record<string, unknown>).helpUsed === false);
  const helped = sentences.length - unhelped.length;
  return {
    measure: 'sentences containing the unit marked understood without help',
    value: unhelped.length,
    basis: [`${sentences.length} sentence(s) marked understood, ${helped} of them with help`, ...unhelped.map((e) => `unhelped: ${e.id} at ${e.at}`)],
    caveat: 'Self-report: understanding is the learner\'s own judgement, and a sentence can be understood from its other words; the mark does not isolate this unit.',
  };
}

/** Correct rate in assessed listening minus correct rate in written review, for one unit. */
export function listeningVsReading(events: readonly GoEvent[], unitId: string): Measure {
  const all = dedupe(events).filter((e) => about(e, unitId));
  const heard = all.filter((e) => e.kind === 'ListeningAssessed');
  const counted = heard.filter((e) => e.evidence?.quality !== 'none');
  const practice = heard.length - counted.length;
  const read = all.filter(isWrittenReview).filter((e) => e.evidence?.quality !== 'none');
  const rate = (xs: GoEvent[], f: (e: GoEvent) => boolean): number => xs.filter(f).length / xs.length;
  const lc = counted.filter((e) => (e.payload as Record<string, unknown>).correct === true).length;
  const rc = read.filter(isCorrectReview).length;
  const basis = [`listening: ${lc}/${counted.length} correct (${practice} practice-only result(s) excluded)`, `reading: ${rc}/${read.length} correct`];
  const caveat = 'A difference in rates from a handful of items is not a difference in ability: the listening and reading questions differ in format and difficulty, and synthetic-voice practice is excluded because it is not evidence.';
  if (counted.length < MIN_PER_SIDE || read.length < MIN_PER_SIDE) {
    return { measure: 'listening minus reading correct rate', value: null, basis: [...basis, `at least ${MIN_PER_SIDE} counted results per side are needed`], caveat };
  }
  return {
    measure: 'listening minus reading correct rate',
    value: Math.round((rate(counted, (e) => (e.payload as Record<string, unknown>).correct === true) - rate(read, isCorrectReview)) * 1000) / 1000,
    basis, caveat,
  };
}

/** Times the unit was used correctly in the learner's own writing without any assistance. */
export function usedInWriting(events: readonly GoEvent[], unitId: string): Measure {
  const prods = dedupe(events).filter((e) => e.kind === 'ProductionRecorded' && about(e, unitId));
  const unassisted = prods.filter((e) => (e.payload as Record<string, unknown>).assisted === false);
  const right = unassisted.filter((e) => (e.payload as Record<string, unknown>).usedCorrectly === true);
  const unjudged = unassisted.filter((e) => (e.payload as Record<string, unknown>).usedCorrectly === 'unjudged').length;
  return {
    measure: 'unassisted correct use in writing',
    value: right.length,
    basis: [`${prods.length} production(s) of the unit, ${unassisted.length} unassisted, ${unjudged} of those unjudged`, ...right.map((e) => `correct: ${e.id} at ${e.at}`)],
    caveat: 'Correctness is judged by an analyser or reviewer and may be provisional; a correct use may be a memorised phrase rather than productive control.',
  };
}

export const ALL_MEASURES = { helpAfterPasses, recognitionInPassages, listeningVsReading, usedInWriting } as const;

/** Every measure for one unit, in one call (for a research view). */
export function measuresFor(events: readonly GoEvent[], unitId: string): Measure[] {
  return Object.values(ALL_MEASURES).map((f) => f(events, unitId));
}
