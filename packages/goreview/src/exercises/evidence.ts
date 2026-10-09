/**
 * Evidence: how a graded result becomes a Repository event.
 *
 *   written-recognition, phrase-comprehension   CardReviewed  cardKind 'recognition'
 *   meaning-to-form                             CardReviewed  cardKind 'recall'
 *   sentence-completion                         CardReviewed  cardKind 'cloze'
 *   morphological-identification, grammar-application
 *                                               AssessmentAnswered { constructionId, task }   (interpret | choose-form)
 *       exception: the lemma-only question about a provisional rule-derived form is a CardReviewed 'recognition', never a
 *       grammar assessment: no construction is vouched for, so none may be credited.
 *   audio-to-meaning, audio-transcription       ListeningAssessed via GoListen's payload helper, with `answerShownBefore: false`
 *       ONLY when the written form was not shown before the response AND the audio really played. If it was shown, or the audio
 *       never played, the result is a CardReviewed 'recognition' with `answerShownBefore` set and no evidence: it is not listening.
 *
 * The event is still recorded when it carries no evidence (history): `evidence: { quality: 'none' }` for a challenged answer, a
 * synthetic or unreviewed voice, or a transcript that was shown. It is `null` when there is nothing to claim: the question was
 * invalid, the answer could not be graded or was ambiguous, or the audio failed.
 *
 * Nothing in a payload is text of a sentence: ids, labels the pack authored (option names), small numbers and flags.
 */
import { CONTRACT_VERSION } from '../../../repository-contract/src';
import type { EvidenceNote, GoEvent } from '../../../repository-contract/src';
import { assessmentEvidence, listeningAssessedPayload } from '../../../golisten/src/assessment';
import type { ScoringMetadata } from '../../../golisten/src/contracts';
import { ratingFor } from '../grading/grade';
import { FAMILY_DIMENSION } from '../types';
import type { Exercise, GradeOutcome, Grading, Rating, Response } from '../types';
import { AUDIO_FAMILIES, PROVISIONAL_EXCEPTION, fnv } from './shared';
import type { ReviewExercise } from './shared';

export const GOREVIEW_EVENT_VERSION = 'goreview@1';

export interface EvidenceResult { response: Response; grading: Grading; rating: Rating | null; scoring?: ScoringMetadata }
export interface EvidenceIdentity { learnerId: string; enrolmentId: string; deviceId: string; itemId: string }
export interface EvidenceExtra { latencyMs?: number; difficulty?: number }

type Quality = EvidenceNote['quality'];
const ORDER: Quality[] = ['none', 'weak', 'moderate', 'strong'];
const lower = (a: Quality, b: Quality): Quality => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);

type Grade = 'again' | 'hard' | 'good' | 'easy';
const GRADE_OF_RATING: Record<Rating, Grade> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

/** The grade label of an outcome, even when the result is challenged (so history keeps what was graded). */
function gradeLabel(grading: Grading, response: Response, rating: Rating | null): Grade {
  const r = rating ?? ratingFor(grading, { ...response, challenged: false, audioFailed: false });
  return r ? GRADE_OF_RATING[r] : grading.outcome === 'correct' ? 'good' : grading.outcome === 'partial' ? 'hard' : 'again';
}

const NO_CLAIM: readonly GradeOutcome[] = ['invalid-question', 'unable-to-grade', 'ambiguous'];

function responseKind(exercise: Exercise, response: Response): 'typed' | 'choice' | 'self' {
  if (exercise.responseMode === 'choice') return 'choice';
  if ((response.typed ?? '').trim()) return 'typed';
  if (response.choice) return 'choice';
  return 'self';
}

/** The evidence note: the producer's own statement; the engine may lower it and never raises it. */
function noteFor(exercise: ReviewExercise, result: EvidenceResult, kind: 'typed' | 'choice' | 'self', hinted: boolean): EvidenceNote {
  const { response, grading } = result;
  const assisted = hinted;
  if (response.challenged === true) return { quality: 'none', assisted };
  let quality: Quality = kind === 'typed' ? 'moderate' : 'weak';
  if (hinted) quality = lower(quality, 'weak');
  if (exercise.eligibility.eligible && exercise.eligibility.status === 'provisional') quality = lower(quality, 'weak');
  const sourceReliability = kind === 'self' ? 0.6 : Math.max(0, Math.min(1, grading.confidence));
  return { quality, assisted, sourceReliability };
}

function buildEvidence(
  exercise: Exercise, result: EvidenceResult, identity: EvidenceIdentity, now: string, extra: EvidenceExtra = {},
): GoEvent | null {
  const e = exercise as ReviewExercise;
  const { response, grading, rating } = result;
  if (response.audioFailed === true) return null;
  if (NO_CLAIM.includes(grading.outcome)) return null;

  const correct = grading.outcome === 'correct';
  const hinted = response.hinted === true;
  const kind = responseKind(e, response);
  const dimension = FAMILY_DIMENSION[e.family];
  const unitId = e.target.unitId;
  const dedupeKey = `review:${identity.itemId}:${e.exerciseId}:${now}`;
  const common = {
    id: `ev:goreview:${fnv(dedupeKey)}${fnv(`${identity.learnerId}|${identity.deviceId}|${dedupeKey}`)}`,
    v: CONTRACT_VERSION,
    learnerId: identity.learnerId,
    enrolmentId: identity.enrolmentId,
    languageId: e.target.languageId,
    ...(e.target.varietyId ? { varietyId: e.target.varietyId } : {}),
    at: now,
    producer: { app: 'gopractice-review' as const, version: GOREVIEW_EVENT_VERSION, deviceId: identity.deviceId, surface: e.family },
    dedupeKey,
  };
  const shared = {
    outcome: grading.outcome, family: e.family, exerciseId: e.exerciseId, assessmentDimension: dimension,
    ...(rating !== null ? { rating } : {}),
  };
  const timing = { ...(extra.latencyMs !== undefined ? { latencyMs: extra.latencyMs } : {}), ...(extra.difficulty !== undefined ? { difficulty: extra.difficulty } : {}) };
  const grade = gradeLabel(grading, response, rating);

  // ───── audio ─────
  if (AUDIO_FAMILIES.includes(e.family)) {
    const stimulus = e.prompt.audio;
    const base: ScoringMetadata = result.scoring ?? {
      voice: stimulus?.voice.synthetic === false ? 'recorded' : 'synthetic',
      hinted: (response.replays ?? 0) > (stimulus?.replaysAllowed ?? 0),
      replays: response.replays ?? 0,
      eligibleForEvidence: stimulus ? stimulus.validity.eligibleForEvidence && !stimulus.voice.synthetic : false,
    };
    // the stimulus's own validity can only lower what the scoring metadata claims
    const meta: ScoringMetadata = {
      voice: base.voice === 'synthetic' || stimulus?.voice.synthetic === true ? 'synthetic' : 'recorded',
      hinted: base.hinted || hinted,
      replays: base.replays,
      eligibleForEvidence: base.eligibleForEvidence && (stimulus ? stimulus.validity.eligibleForEvidence : true),
    };
    const shown = response.transcriptShownBefore === true;
    const played = response.audioPlayed !== false;
    if (!shown && played) {
      const responseMode = kind === 'typed' ? 'typed' : kind === 'choice' ? 'choice' : 'self-report';
      const payload = { ...listeningAssessedPayload({ kind: stimulus?.kind ?? 'word' }, meta, { correct, responseMode, ...timing }), ...shared };
      let note = assessmentEvidence(meta);
      if (response.challenged === true) note = { quality: 'none', assisted: meta.hinted };
      else if (e.eligibility.eligible && e.eligibility.status === 'provisional') note = { ...note, quality: lower(note.quality, 'weak') };
      note = { ...note, sourceReliability: kind === 'self' ? 0.6 : Math.max(0, Math.min(1, grading.confidence)) };
      return { ...common, kind: 'ListeningAssessed', subject: { cardId: identity.itemId, itemIds: [unitId] }, payload, evidence: note };
    }
    // not audio-only (the written form was shown, or nothing was heard): a reading review that claims nothing
    const payload = {
      cardKind: 'recognition' as const, grade, correct, hinted, answerShownBefore: shown, ...timing, ...shared,
      audioOnly: false, ...(shown ? { transcriptShownBefore: true } : {}), ...(played ? {} : { audioPlayed: false }),
    };
    return { ...common, kind: 'CardReviewed', subject: { cardId: identity.itemId, itemIds: [unitId] }, payload, evidence: { quality: 'none', assisted: hinted || shown } };
  }

  const note = noteFor(e, result, kind, hinted);

  // ───── grammar ─────
  const lemmaOnly = e.builtFrom?.facts?.includes(PROVISIONAL_EXCEPTION) === true;
  if ((e.family === 'morphological-identification' || e.family === 'grammar-application') && !lemmaOnly && e.constructionId) {
    const task = e.family === 'grammar-application' ? 'choose-form' : 'interpret';
    const feature = e.variant !== 'lemma';
    const payload = {
      constructionId: e.constructionId, task, correct, hinted, ...timing, ...shared,
      ...(feature && kind === 'choice' && response.choice ? { answer: response.choice, expected: e.answerKey.accepted[0] } : {}),
    };
    const itemIds = [...new Set([unitId, e.constructionId])];
    return { ...common, kind: 'AssessmentAnswered', subject: { cardId: identity.itemId, itemIds }, payload, evidence: note };
  }

  // ───── written ─────
  const cardKind = e.family === 'meaning-to-form' ? 'recall' : e.family === 'sentence-completion' ? 'cloze' : 'recognition';
  const payload = { cardKind, grade, correct, hinted, answerShownBefore: false, ...timing, ...shared };
  return { ...common, kind: 'CardReviewed', subject: { cardId: identity.itemId, itemIds: [unitId] }, payload, evidence: note };
}

/**
 * The single-object form the session runner's GradingPort uses (session/runner.ts EvidenceInput): the same mapping, with the
 * listening score of a stimulus that stayed audio-first standing in for scoring metadata.
 */
export interface EvidenceInputObject {
  exercise: Exercise;
  response: Response;
  grading: Grading;
  rating: Rating | null;
  item: { itemId: string };
  identity: { learnerId: string; enrolmentId: string; deviceId: string };
  at: string;
  scoring?: ScoringMetadata;
  listening?: { voice: 'synthetic' | 'recorded'; hinted: boolean; replays: number; eligibleForEvidence: boolean };
  extra?: EvidenceExtra;
}

export function evidenceFor(input: EvidenceInputObject): GoEvent | null;
export function evidenceFor(exercise: Exercise, result: EvidenceResult, identity: EvidenceIdentity, now: string, extra?: EvidenceExtra): GoEvent | null;
export function evidenceFor(a: Exercise | EvidenceInputObject, result?: EvidenceResult, identity?: EvidenceIdentity, now?: string, extra?: EvidenceExtra): GoEvent | null {
  if (result === undefined && 'item' in (a as EvidenceInputObject)) {
    const i = a as EvidenceInputObject;
    const l = i.listening;
    const scoring = i.scoring ?? (l ? { voice: l.voice, hinted: l.hinted, replays: l.replays, eligibleForEvidence: l.eligibleForEvidence } : undefined);
    return buildEvidence(i.exercise, { response: i.response, grading: i.grading, rating: i.rating, ...(scoring ? { scoring } : {}) }, { ...i.identity, itemId: i.item.itemId }, i.at, i.extra);
  }
  return buildEvidence(a as Exercise, result as EvidenceResult, identity as EvidenceIdentity, now as string, extra);
}
