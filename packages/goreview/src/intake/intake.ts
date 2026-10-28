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
 *   9. candidate.score < 0.15 → low-priority (comparative priority; the proposal remains eligible after the hard gates).
 *  10. candidate.score ≥ 0.5 → test-now; otherwise → test-later.
 *
 * REVIEW FOLLOWS THE LEVEL (projection@4, docs/ecosystem/KNOWLEDGE-LEVELS.md). The Repository draws candidates by the unit's knowledge level (new / seen /
 * recognized / familiar → recognition practice, known → retrieval, automatic → only when retention decayed or a mark was contradicted); intake adds
 * nothing the learner has to ask for. Every test-now / test-later outcome carries the level in its reasons ('level Known: …'), and a candidate whose
 * unit is Automatic with no decay or contradiction among its reasons is already-covered (rule 5b: a stale cached candidate must not re-test it).
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
import { KNOWLEDGE_LEVEL_WORDS } from '../../../repository-contract/src';
import type { Dimension, KnowledgeLevel, ReviewCandidate, UnitKnowledge } from '../../../repository-contract/src';
import { FAMILY_DIMENSION, REPOSITORY_DIMENSION } from '../types';
import type { AssessmentDimension, DeckItem, ExerciseFamily, IntakeDecision, IntakeInput, IntakeOutcome } from '../types';
import { eligibleByKnowability, hasConfirmedAutomaticFailure, seenEligibility } from '../planner/priority-policy';

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
export function proposeFor(candidate: Pick<ReviewCandidate, 'kind' | 'targetDimension'>, secondaryPractice = false): { dimension: AssessmentDimension; family: ExerciseFamily } {
  if (!secondaryPractice) {
    const family: ExerciseFamily = candidate.kind === 'multiword' ? 'phrase-comprehension' : 'written-recognition';
    return { dimension: FAMILY_DIMENSION[family], family };
  }
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

/** What the level means for the next question (shown in the reasons, so GoReview says why a unit is asked as it is). */
const LEVEL_ASK: Record<KnowledgeLevel, string> = {
  new: 'not understood yet, so a recognition question',
  seen: 'met but not shown to be understood, so a recognition question',
  recognized: 'understood once or with help, so reading it unaided is the next step',
  familiar: 'recognised repeatedly, so reliable recognition is the next step',
  known: 'recognised reliably, so retrieving it is the next step',
  automatic: 'produced without help; asked again only because retention decayed or a mark was contradicted',
};
/** `level Known: …` for a knowledge row that carries a level (projection@4); nothing for a row that does not. */
const levelNote = (k?: UnitKnowledge): string[] => (k?.level ? [`level ${KNOWLEDGE_LEVEL_WORDS[k.level].title}: ${LEVEL_ASK[k.level]}`] : []);

function decide(
  candidate: ReviewCandidate, decision: IntakeDecision, reasons: string[],
  proposed?: { dimension: AssessmentDimension; family: ExerciseFamily },
): IntakeOutcome {
  return { unitId: candidate.unitId, decision, reasons, ...(proposed ? { proposed } : {}), candidate };
}

const sameDimension = (item: DeckItem, d: Dimension): boolean => REPOSITORY_DIMENSION[item.dimension] === d;

export function decideIntake(input: IntakeInput): IntakeOutcome {
  const { candidate, knowledge, facts, existing, audio, saved, preferences } = input;
  const makeDecision = (...args: Parameters<typeof decide>): IntakeOutcome => ({ ...decide(...args), ...(knowledge ? { knowledge } : {}), ...(saved.has(candidate.unitId) ? { explicitlySelected: true } : {}) });
  const d = candidate.targetDimension;
  const proposed = proposeFor(candidate, input.secondaryPractice === true);
  const proposedRepositoryDimension = REPOSITORY_DIMENSION[proposed.dimension];
  const caveats: string[] = [];

  // Stages govern whether a card may be proposed; candidate score and FSRS due state do not override this gate.
  if (knowledge?.level === 'new') {
    const explicitRecognition = saved.has(candidate.unitId) && !input.secondaryPractice && isRecognitionDimension(d);
    if (!explicitRecognition) return makeDecision(candidate, 'low-priority', ['level New: automatic review excludes items not yet understood']);
    caveats.push('level New: learner explicitly requested a written recognition practice item');
  }
  if (knowledge?.level === 'seen') {
    const assistanceRequests = input.assistanceRequests ?? (input.readingSignals ?? []).filter((e) => e.kind === 'AssistanceRequested' && e.subject?.itemIds?.includes(candidate.unitId)).length;
    const recent = (input.readingSignals ?? []).filter((e) => e.subject?.itemIds?.includes(candidate.unitId) &&
      ['EncounterRecorded', 'SelectionLookedUp', 'AnalysisShown'].includes(e.kind) &&
      Number.isFinite(Date.parse(e.at)) && Date.parse(input.now) >= Date.parse(e.at) && Date.parse(input.now) - Date.parse(e.at) <= 30 * 86_400_000).length >= 2;
    const explicitRequest = saved.has(candidate.unitId);
    if (!seenEligibility({ knowledge, assistanceRequests, explicitRequest, readingRelevance: recent ? 1 : 0 })) {
      return makeDecision(candidate, 'low-priority', ['level Seen: no qualifying repeated encounter, repeated assistance, current reading relevance, or explicit request for practice']);
    }
    if (!explicitRequest && assistanceRequests < 2 && !recent && (knowledge?.encounters ?? 0) > 0) {
      caveats.push('level Seen: encountered, so eligible for recognition; repeated encounters or assistance would raise its comparative priority');
    }
  }
  if (knowledge?.level === 'automatic' && !eligibleByKnowability({
    level: 'automatic', explicitRequest: saved.has(candidate.unitId),
    automaticFailure: hasConfirmedAutomaticFailure(input.readingSignals ?? [], candidate.unitId),
  })) {
    return makeDecision(candidate, 'already-covered', ['level Automatic: ordinary review is suppressed until an explicit request or confirmed unassisted retrieval failure']);
  }

  // 1 ── eligibility ─────────────────────────────────────────────────────────────────────────────────────────────
  const el = candidate.eligibility;
  if (!el.eligible) {
    if (el.status === 'provisional' && isRecognitionDimension(d)) {
      caveats.push(`caveat: the analysis is provisional (${el.reason}); allowed because the target (${d}) is recognition only`);
    } else {
      return makeDecision(candidate, 'needs-validation', [`not eligible for assessment: ${el.reason}`, `analysis status: ${el.status}`]);
    }
  } else {
    for (const c of el.caveats.slice(0, 3)) caveats.push(`caveat: ${c}`);
  }

  // 2 ── the pack's own facts disagree with the candidate ────────────────────────────────────────────────────────
  if (facts && (facts.status === 'conflicted' || facts.status === 'invalidated')) {
    return makeDecision(candidate, 'too-uncertain', [`the pack facts for this unit are ${facts.status}; nothing sound can be asked yet`]);
  }
  // The unit row's status is never lowered by the store (a unit can only be superseded), so an invalidated ANALYSIS is
  // visible only in `facts.analyses`: a candidate computed before a reviewer withdrew every analysis is refused here.
  if (facts && facts.analyses.length > 0 && facts.analyses.every((a) => a.status === 'invalidated')) {
    return makeDecision(candidate, 'needs-validation', ['every analysis of this unit has been invalidated; it is not asked until a reviewer supplies a verified one']);
  }

  // 3 ── same unit, same dimension already in the deck ───────────────────────────────────────────────────────────
  const mine = existing.filter((i) => i.unitId === candidate.unitId && sameDimension(i, proposedRepositoryDimension));
  const live = mine.find((i) => i.status === 'active' || i.status === 'snoozed');
  if (live) return makeDecision(candidate, 'already-covered', [`already in the deck as ${live.family} (${live.status})`]);
  const suspended = mine.find((i) => i.status === 'suspended');
  if (suspended) {
    return makeDecision(candidate, 'already-covered', [suspended.suspendedReason
      ? `in the deck but suspended (${suspended.family}): ${suspended.suspendedReason}; it stays out until the pack is fixed`
      : `in the deck but suspended by the learner (${suspended.family}); resume it instead of adding another`]);
  }
  if (mine.some((i) => i.status === 'dismissed')) {
    return makeDecision(candidate, 'low-priority', ['the learner removed this item from the deck; it is not proposed again unprompted']);
  }

  // 4 ── a construction already in the deck explains this unit ───────────────────────────────────────────────────
  const tag = explainsReason(candidate.unitId);
  const explainer = existing.find((i) => (i.status === 'active' || i.status === 'snoozed') && reasonTokens(i.reasons).includes(tag));
  if (explainer) {
    return makeDecision(candidate, 'redundant', [`the deck already tests ${explainer.unitId}, which explains this unit; testing the cause first avoids a card per symptom`]);
  }

  // 5 ── already well established ────────────────────────────────────────────────────────────────────────────────
  const est = knowledge?.dimensions[d];
  if (est && est.confidence >= WELL_ESTABLISHED.confidence && est.score >= WELL_ESTABLISHED.score) {
    return makeDecision(candidate, 'already-covered', [`well established: ${d} estimated ${pct(est.score)} with confidence ${pct(est.confidence)} from ${est.observations} observation(s)`]);
  }

  // 6 ── a provisional grammatical analysis is not a fact to test ────────────────────────────────────────────────
  if (el.eligible && el.status === 'provisional' && d === 'grammaticalUnderstanding') {
    return makeDecision(candidate, 'needs-validation', ['the grammatical analysis is provisional; a grammar question would test a guess']);
  }

  // 7 ── audio gating for a listening target ─────────────────────────────────────────────────────────────────────
  if (proposed.family === 'audio-to-meaning') {
    if (!preferences.includeListening) {
      return makeDecision(candidate, 'test-later', [...caveats, 'listening practice is switched off in the preferences', 'no written substitute: a reading question would credit reading, not listening'], proposed);
    }
    if (!audio.available) {
      return makeDecision(candidate, 'test-later', [...caveats, `no suitable audio: ${audio.reason}`, 'no written substitute: a reading question would credit reading, not listening'], proposed);
    }
    if (!audio.eligibleForEvidence) {
      return makeDecision(candidate, 'test-later', [...caveats, `no suitable audio: ${audio.reason}`, 'the available audio is practice only and cannot be listening evidence'], proposed);
    }
  }

  // 8 ── explicitly saved ────────────────────────────────────────────────────────────────────────────────────────
  if (saved.has(candidate.unitId) && (preferences.prioritizeSaved || knowledge?.level === 'new' && !input.secondaryPractice && isRecognitionDimension(d))) {
    return makeDecision(candidate, 'test-now', [...caveats, ...levelNote(knowledge), 'saved by the learner (prioritised)', `score ${candidate.score.toFixed(2)}`], proposed);
  }

  // 9 ── not worth a card ────────────────────────────────────────────────────────────────────────────────────────
  if (candidate.score < SCORE_LOW_PRIORITY) {
    return makeDecision(candidate, 'low-priority', [
      `comparative priority: raw score ${candidate.score.toFixed(2)} is considered against the other encountered words`,
    ], proposed);
  }

  // 10 ── score ──────────────────────────────────────────────────────────────────────────────────────────────────
  const top = [...candidate.reasons].sort((a, b) => b.weight - a.weight)[0];
  const why = top ? `${top.rule}${top.detail ? ` (${top.detail})` : ''}` : 'no stated reason';
  if (candidate.score >= SCORE_TEST_NOW) {
    return makeDecision(candidate, 'test-now', [...caveats, ...levelNote(knowledge), `score ${candidate.score.toFixed(2)} ≥ ${SCORE_TEST_NOW}`, `main reason: ${why}`], proposed);
  }
  return makeDecision(candidate, 'test-later', [...caveats, ...levelNote(knowledge), `score ${candidate.score.toFixed(2)} is between ${SCORE_LOW_PRIORITY} and ${SCORE_TEST_NOW}`, `main reason: ${why}`], proposed);
}

const HEADLINE: Record<IntakeDecision, string> = {
  'already-covered': 'Already covered',
  redundant: 'Not needed',
  'too-uncertain': 'Too uncertain',
  'needs-validation': 'Needs validation first',
  'low-priority': 'Low comparative priority',
  'test-now': 'Test now',
  'test-later': 'Test later',
};

/** One readable line for the UI: the headline, the proposed skill, and the reasons. */
export function explainIntake(outcome: IntakeOutcome): string {
  const skill = outcome.proposed ? ` as ${outcome.proposed.family}` : '';
  return `${HEADLINE[outcome.decision]}${skill}: ${outcome.reasons.join('; ')}.`;
}

/**
 * Candidates that pass intake's hard gates compete by score within the encountered set.
 * The order is stable across runs: equal scores are resolved by unit id. Low-priority is
 * retained as the persisted compatibility decision, while its proposal stays eligible.
 */
export function rankComparativePriority(outcomes: readonly IntakeOutcome[], options: { limit?: number; prioritizeSaved?: boolean } = {}): IntakeOutcome[] {
  const eligible = outcomes
    .filter((outcome) => !!outcome.proposed && (outcome.decision === 'test-now' || outcome.decision === 'test-later' || outcome.decision === 'low-priority'))
    .sort((a, b) => (options.prioritizeSaved ? Number(b.explicitlySelected === true) - Number(a.explicitlySelected === true) : 0) ||
      b.candidate.score - a.candidate.score || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
  const limit = Math.max(0, Math.floor(options.limit ?? 5));
  return eligible.map((outcome, index) => {
    const audioDeferred = outcome.decision === 'test-later' && outcome.reasons.some((reason) =>
      reason.includes('listening practice is switched off') || reason.includes('no suitable audio') || reason.includes('practice only'));
    const selected = index < limit && !audioDeferred;
    const decision: IntakeOutcome['decision'] = audioDeferred ? 'test-later' : selected ? 'test-now' : 'low-priority';
    const status = audioDeferred ? 'audio deferred' : selected ? 'selected for immediate practice' : 'comparatively lower priority';
    return {
      ...outcome,
      decision,
      reasons: [...outcome.reasons, `comparative rank ${index + 1} of ${eligible.length} encountered words (score ${outcome.candidate.score.toFixed(2)}; ${status})`],
    };
  });
}

/** Alias used by callers that treat the intake result as a ranked candidate list. */
export const rankIntakeOutcomes = rankComparativePriority;

/** Test/UI helper: the knowledge row's estimate for the candidate's target dimension. */
export const targetEstimate = (c: ReviewCandidate, k?: UnitKnowledge) => k?.dimensions[c.targetDimension];
