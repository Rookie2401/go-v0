/**
 * INTAKE — which Repository candidates become deck items, and why. Pure, ordered, explainable: the first rule that
 * applies decides, and every outcome carries the sentence of the rule that fired. Intake never schedules (that is the
 * scheduler) and never builds an exercise (that is the exercise registry); it only answers "is this worth testing, and
 * as which skill?".
 *
 * THE RULES, in order (the first that applies decides):
 *   1. not eligible (`candidate.eligibility.eligible === false`)         → needs-validation (the eligibility reason).
 *      Exception: a recognition dimension (exposure, assisted/reading/listening recognition) whose analysis is only
 *      `provisional` is allowed through WITH A CAVEAT: recognising a form needs only that the form is right, not that a
 *      grammatical analysis is.
 *   2. the pack facts (when supplied) say the analysis is conflicted or invalidated → too-uncertain.
 *   3. an item for the same unit AND the same Repository dimension is in the deck (active or snoozed) → already-covered.
 *      A suspended one is also covered ("resume it instead"); a dismissed one is low-priority ("the learner removed it").
 *   4. a deck item exists for a construction that EXPLAINS this unit → redundant. The convention: when a card is added
 *      for a candidate with `explains: [a, b]`, the deck item's `reasons` carry `explains:a`, `explains:b`
 *      (`explainsReasons(candidate)` writes them). Intake finds them in `IntakeInput.existing`.
 *   5. the Repository's estimate for the target dimension is well established (confidence ≥ 0.8 AND score ≥ 0.85)
 *      → already-covered ("well established").
 *   6. the analysis is `provisional` and the target is the grammatical dimension → needs-validation.
 *   7. a listening target the audio cannot honestly support (listening switched off, no audio, or audio that is only
 *      practice) → test-later with the reason ("no suitable audio"); the proposal is kept so it can be promoted later.
 *      A written exercise is NEVER substituted for a listening target: it would credit a different skill.
 *   8. the learner saved the unit and `prioritizeSaved` → test-now (placed before 9 so an explicit save is not lost to a
 *      low score).
 *   9. candidate.score < 0.15 → low-priority.
 *  10. candidate.score ≥ 0.5 → test-now; otherwise → test-later.
 *
 * `proposed` maps the Repository's target dimension to an assessment dimension and an exercise family:
 *   exposure / assistedRecognition / readingRecognition → written-recognition (phrase-comprehension for a multiword unit)
 *   productiveRetrieval        → meaning-to-form
 *   grammaticalUnderstanding   → morphological-identification for a form, grammar-application for a construction
 *   listeningRecognition       → audio-to-meaning
 *   contextualProduction       → sentence-completion
 * (an `exposure`/`assistedRecognition` target means "the learner has only met or been helped with it": the next honest
 * question is plain recognition.)
 */
import type { Dimension, ReviewCandidate, UnitKnowledge } from '../../../repository-contract/src';
import { FAMILY_DIMENSION, REPOSITORY_DIMENSION } from '../types';
import type { AssessmentDimension, DeckItem, ExerciseFamily, IntakeDecision, IntakeInput, IntakeOutcome } from '../types';

export const SCORE_TEST_NOW = 0.5;
export const SCORE_LOW_PRIORITY = 0.15;
export const WELL_ESTABLISHED = { confidence: 0.8, score: 0.85 } as const;

const RECOGNITION: ReadonlySet<Dimension> = new Set<Dimension>(['exposure', 'assistedRecognition', 'readingRecognition', 'listeningRecognition']);

/**
 * The token a deck item's reason carries for each unit its construction explains (see rule 4). The fold keeps ONE reason
 * string per `CardAdded`, so several tokens are joined with REASON_SEPARATOR; `reasonTokens` splits them again.
 */
export const REASON_SEPARATOR = ' | ';
export const explainsReason = (unitId: string): string => `explains:${unitId}`;
export const explainsReasons = (c: Pick<ReviewCandidate, 'explains'>): string[] => (c.explains ?? []).map(explainsReason);
/** The single `reason` for the `CardAdded` of a candidate: the intake sentence, then one `explains:<unitId>` token per unit it explains. */
export const cardReasonFor = (c: Pick<ReviewCandidate, 'explains'>, text: string): string => [text, ...explainsReasons(c)].join(REASON_SEPARATOR);
export const reasonTokens = (reasons: readonly string[]): string[] => reasons.flatMap((r) => r.split(REASON_SEPARATOR));

export const isRecognitionDimension = (d: Dimension): boolean => RECOGNITION.has(d);

/** The family (and so the assessment dimension) a candidate is tested through. */
export function proposeFor(candidate: Pick<ReviewCandidate, 'kind' | 'targetDimension'>): { dimension: AssessmentDimension; family: ExerciseFamily } {
  let family: ExerciseFamily;
  switch (candidate.targetDimension) {
    case 'productiveRetrieval': family = 'meaning-to-form'; break;
    case 'grammaticalUnderstanding': family = candidate.kind === 'form' ? 'morphological-identification' : 'grammar-application'; break;
    case 'listeningRecognition': family = 'audio-to-meaning'; break;
    case 'contextualProduction': family = 'sentence-completion'; break;
    default: family = candidate.kind === 'multiword' ? 'phrase-comprehension' : 'written-recognition';
  }
  return { dimension: FAMILY_DIMENSION[family], family };
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

function decide(
  candidate: ReviewCandidate, decision: IntakeDecision, reasons: string[],
  proposed?: { dimension: AssessmentDimension; family: ExerciseFamily },
): IntakeOutcome {
  return { unitId: candidate.unitId, decision, reasons, ...(proposed ? { proposed } : {}), candidate };
}

const sameDimension = (item: DeckItem, d: Dimension): boolean => REPOSITORY_DIMENSION[item.dimension] === d;

export function decideIntake(input: IntakeInput): IntakeOutcome {
  const { candidate, knowledge, facts, existing, audio, saved, preferences } = input;
  const d = candidate.targetDimension;
  const caveats: string[] = [];

  // 1 ── eligibility ─────────────────────────────────────────────────────────────────────────────────────────────
  const el = candidate.eligibility;
  if (!el.eligible) {
    if (el.status === 'provisional' && isRecognitionDimension(d)) {
      caveats.push(`caveat: the analysis is provisional (${el.reason}); allowed because the target (${d}) is recognition only`);
    } else {
      return decide(candidate, 'needs-validation', [`not eligible for assessment: ${el.reason}`, `analysis status: ${el.status}`]);
    }
  } else {
    for (const c of el.caveats.slice(0, 3)) caveats.push(`caveat: ${c}`);
  }

  // 2 ── the pack's own facts disagree with the candidate ────────────────────────────────────────────────────────
  if (facts && (facts.status === 'conflicted' || facts.status === 'invalidated')) {
    return decide(candidate, 'too-uncertain', [`the pack facts for this unit are ${facts.status}; nothing sound can be asked yet`]);
  }
  // The unit row's status is never lowered by the store (a unit can only be superseded), so an invalidated ANALYSIS is
  // visible only in `facts.analyses`: a candidate computed before a reviewer withdrew every analysis is refused here.
  if (facts && facts.analyses.length > 0 && facts.analyses.every((a) => a.status === 'invalidated')) {
    return decide(candidate, 'needs-validation', ['every analysis of this unit has been invalidated; it is not asked until a reviewer supplies a verified one']);
  }

  // 3 ── same unit, same dimension already in the deck ───────────────────────────────────────────────────────────
  const mine = existing.filter((i) => i.unitId === candidate.unitId && sameDimension(i, d));
  const live = mine.find((i) => i.status === 'active' || i.status === 'snoozed');
  if (live) return decide(candidate, 'already-covered', [`already in the deck as ${live.family} (${live.status})`]);
  const suspended = mine.find((i) => i.status === 'suspended');
  if (suspended) {
    return decide(candidate, 'already-covered', [suspended.suspendedReason
      ? `in the deck but suspended (${suspended.family}): ${suspended.suspendedReason}; it stays out until the pack is fixed`
      : `in the deck but suspended by the learner (${suspended.family}); resume it instead of adding another`]);
  }
  if (mine.some((i) => i.status === 'dismissed')) {
    return decide(candidate, 'low-priority', ['the learner removed this item from the deck; it is not proposed again unprompted']);
  }

  // 4 ── a construction already in the deck explains this unit ───────────────────────────────────────────────────
  const tag = explainsReason(candidate.unitId);
  const explainer = existing.find((i) => (i.status === 'active' || i.status === 'snoozed') && reasonTokens(i.reasons).includes(tag));
  if (explainer) {
    return decide(candidate, 'redundant', [`the deck already tests ${explainer.unitId}, which explains this unit; testing the cause first avoids a card per symptom`]);
  }

  // 5 ── already well established ────────────────────────────────────────────────────────────────────────────────
  const est = knowledge?.dimensions[d];
  if (est && est.confidence >= WELL_ESTABLISHED.confidence && est.score >= WELL_ESTABLISHED.score) {
    return decide(candidate, 'already-covered', [`well established: ${d} estimated ${pct(est.score)} with confidence ${pct(est.confidence)} from ${est.observations} observation(s)`]);
  }

  // 6 ── a provisional grammatical analysis is not a fact to test ────────────────────────────────────────────────
  if (el.eligible && el.status === 'provisional' && d === 'grammaticalUnderstanding') {
    return decide(candidate, 'needs-validation', ['the grammatical analysis is provisional; a grammar question would test a guess']);
  }

  const proposed = proposeFor(candidate);

  // 7 ── audio gating for a listening target ─────────────────────────────────────────────────────────────────────
  if (proposed.family === 'audio-to-meaning') {
    if (!preferences.includeListening) {
      return decide(candidate, 'test-later', [...caveats, 'listening practice is switched off in the preferences', 'no written substitute: a reading question would credit reading, not listening'], proposed);
    }
    if (!audio.available) {
      return decide(candidate, 'test-later', [...caveats, `no suitable audio: ${audio.reason}`, 'no written substitute: a reading question would credit reading, not listening'], proposed);
    }
    if (!audio.eligibleForEvidence) {
      return decide(candidate, 'test-later', [...caveats, `no suitable audio: ${audio.reason}`, 'the available audio is practice only and cannot be listening evidence'], proposed);
    }
  }

  // 8 ── explicitly saved ────────────────────────────────────────────────────────────────────────────────────────
  if (preferences.prioritizeSaved && saved.has(candidate.unitId)) {
    return decide(candidate, 'test-now', [...caveats, 'saved by the learner (prioritised)', `score ${candidate.score.toFixed(2)}`], proposed);
  }

  // 9 ── not worth a card ────────────────────────────────────────────────────────────────────────────────────────
  if (candidate.score < SCORE_LOW_PRIORITY) {
    return decide(candidate, 'low-priority', [`score ${candidate.score.toFixed(2)} is below ${SCORE_LOW_PRIORITY}`]);
  }

  // 10 ── score ──────────────────────────────────────────────────────────────────────────────────────────────────
  const top = [...candidate.reasons].sort((a, b) => b.weight - a.weight)[0];
  const why = top ? `${top.rule}${top.detail ? ` (${top.detail})` : ''}` : 'no stated reason';
  if (candidate.score >= SCORE_TEST_NOW) {
    return decide(candidate, 'test-now', [...caveats, `score ${candidate.score.toFixed(2)} ≥ ${SCORE_TEST_NOW}`, `main reason: ${why}`], proposed);
  }
  return decide(candidate, 'test-later', [...caveats, `score ${candidate.score.toFixed(2)} is between ${SCORE_LOW_PRIORITY} and ${SCORE_TEST_NOW}`, `main reason: ${why}`], proposed);
}

const HEADLINE: Record<IntakeDecision, string> = {
  'already-covered': 'Already covered',
  redundant: 'Not needed',
  'too-uncertain': 'Too uncertain',
  'needs-validation': 'Needs validation first',
  'low-priority': 'Low priority',
  'test-now': 'Test now',
  'test-later': 'Test later',
};

/** One readable line for the UI: the headline, the proposed skill, and the reasons. */
export function explainIntake(outcome: IntakeOutcome): string {
  const skill = outcome.proposed ? ` as ${outcome.proposed.family}` : '';
  return `${HEADLINE[outcome.decision]}${skill}: ${outcome.reasons.join('; ')}.`;
}

/** Test/UI helper: the knowledge row's estimate for the candidate's target dimension. */
export const targetEstimate = (c: ReviewCandidate, k?: UnitKnowledge) => k?.dimensions[c.targetDimension];
