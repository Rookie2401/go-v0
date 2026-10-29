/**
 * Why the home offers no new words (2026-10-29). The kicker says "0 eligible new admissions"; this says why, in one or two sentences a
 * learner can act on, from the same state the planner used: the knowledge load, the day's allowance, the candidates and their intake
 * decisions, and the plan's exclusion codes. It explains; it never changes what is admitted. Counts of units only, no words.
 */
import { admissionBudget } from '../src/planner/budget';
import type { ExclusionCode, SessionPlan } from '../src/types';
import type { CurrentDeck } from './deckModel';
import type { ReviewModel } from './workspace';

export interface AdmissionExplanation {
  /** Stable code of the leading reason. */
  code: 'new-words-available' | 'knowledge-unresolved' | 'daily-allowance-used' | 'new-words-off' | 'no-candidates' | 'candidates-not-testable' | 'eligible-waiting' | 'none-eligible';
  text: string;
}

const n = (count: number, one: string, many = one + 's'): string => `${count} ${count === 1 ? one : many}`;

/** The explanation for the home; `undefined` when new words are on offer (nothing to explain). */
export function explainAdmissions(model: ReviewModel, deck: Pick<CurrentDeck, 'summary'> & { plan: Pick<SessionPlan, 'skipped'> }): AdmissionExplanation | undefined {
  if (deck.summary.newAvailable > 0) return undefined;
  const withheld = model.withheld?.length ?? 0;
  const status = model.knowledgeStatus;
  if (withheld > 0 || (status && (status.source === 'unavailable' || status.source === 'partial') && status.missing.length)) {
    const count = withheld || status!.missing.length;
    return { code: 'knowledge-unresolved', text: `No new words yet: knowledge for ${n(count, 'word')} could not be loaded from the Repository, so ${count === 1 ? 'it is' : 'they are'} not treated as new. ${count === 1 ? 'It' : 'They'} will be considered once the service answers.` };
  }
  if (model.prefs.maxNew <= 0 || (model.prefs.dailyNewLimit ?? model.prefs.maxNew) <= 0) {
    return { code: 'new-words-off', text: 'No new words: the new-words setting is 0. Raise "New items per session" in Settings to introduce vocabulary.' };
  }
  const budget = admissionBudget(model.events, { learnerId: model.identity.learnerId, languageId: model.identity.languageId, now: model.now, maxNew: model.prefs.maxNew, dailyNewLimit: model.prefs.dailyNewLimit ?? model.prefs.maxNew });
  if (budget.remaining <= 0) {
    const limit = model.prefs.dailyNewLimit ?? model.prefs.maxNew;
    return { code: 'daily-allowance-used', text: `No more new words today: ${n(budget.used, 'word was', 'words were')} introduced since 00:00 UTC and the daily allowance is ${limit}. Due reviews continue; the allowance resets at 00:00 UTC.` };
  }
  if (!model.outcomes.length) {
    return model.candidateSource === 'none'
      ? { code: 'no-candidates', text: 'No new words: the Repository could not be reached for candidates, and this device holds no earlier list. Due reviews continue offline.' }
      : { code: 'no-candidates', text: 'No new words proposed: read with GoLearn to meet vocabulary; words you look up or meet become candidates here.' };
  }
  const byDecision = new Map<string, number>();
  for (const o of model.outcomes) byDecision.set(o.decision, (byDecision.get(o.decision) ?? 0) + 1);
  const testNow = byDecision.get('test-now') ?? 0;
  if (!testNow) {
    const parts: string[] = [];
    const facts = (byDecision.get('needs-validation') ?? 0) + (byDecision.get('too-uncertain') ?? 0);
    if (facts) parts.push(`${n(facts, 'word has', 'words have')} no verified facts yet (nothing is asked from an unverified analysis)`);
    const later = byDecision.get('test-later') ?? 0;
    if (later) parts.push(`${n(later, 'word waits', 'words wait')} for suitable audio or a better moment`);
    const covered = (byDecision.get('already-covered') ?? 0) + (byDecision.get('redundant') ?? 0);
    if (covered) parts.push(`${n(covered, 'word is', 'words are')} already in your deck or covered by it`);
    const low = byDecision.get('low-priority') ?? 0;
    if (low) parts.push(`${n(low, 'word is', 'words are')} low priority for now`);
    return { code: 'candidates-not-testable', text: `No new words from the ${n(model.outcomes.length, 'candidate')}: ${parts.join('; ') || 'none passed intake'}.` };
  }
  const codes = new Map<ExclusionCode | 'none', number>();
  for (const s of deck.plan.skipped) codes.set(s.code ?? 'none', (codes.get(s.code ?? 'none') ?? 0) + 1);
  const waiting = (codes.get('beyond-micro-deck') ?? 0) + (codes.get('over-time-budget') ?? 0) + (codes.get('same-unit-in-batch') ?? 0) + (codes.get('new-budget-exhausted') ?? 0);
  if (waiting) return { code: 'eligible-waiting', text: `${n(testNow, 'word is', 'words are')} eligible but this batch is full (${n(waiting, 'card')} wait for the next one or for session time). Finish the batch, or raise Cards per deck.` };
  const beyondNew = codes.get('knowledge-beyond-new-required') ?? 0, seen = codes.get('seen-evidence-insufficient') ?? 0, audio = codes.get('listening-audio-unavailable') ?? 0;
  const parts: string[] = [];
  if (beyondNew) parts.push(`${n(beyondNew, 'word was', 'words were')} never met in a text (GoReview does not teach New words; GoLearn does)`);
  if (seen) parts.push(`${n(seen, 'word needs', 'words need')} a second encounter before practice`);
  if (audio) parts.push(`${n(audio, 'listening card has', 'listening cards have')} no usable audio`);
  return { code: 'none-eligible', text: `No new words this batch: ${parts.join('; ') || `none of the ${n(testNow, 'proposed word')} passed the planner's checks`}.` };
}
