/**
 * Layer B — the typed learning-event payloads (Prompt 3 §7) and their runtime validators. One validator per kind;
 * the envelope validator in index.ts calls `validatePayload`. Book content is untrusted input: payloads carry
 * surfaces of a few words at most, hashes for sentences, and never a passage.
 */
import type { ValidationIssue } from './units';

export const MAX_SURFACE_CHARS = 120;
export const MAX_SURFACE_WORDS = 4;

/** How strong an observation is as evidence, as the producer declares it; the engine may lower it, never raise it. */
export const EVIDENCE_QUALITIES = ['none', 'weak', 'moderate', 'strong'] as const;
export type EvidenceQuality = (typeof EVIDENCE_QUALITIES)[number];

export type AssistanceKind = 'gloss' | 'translation' | 'morphology' | 'grammar' | 'hint' | 'example' | 'pronunciation' | 'transliteration' | 'correction';

/** Exposure only: the learner read or had on screen a sentence containing these units (no help requested). */
export interface EncounterPayload { surface?: string; tokenCount?: number; contextKind: 'sentence' | 'fragment' | 'none'; readerId?: string }
/** The learner selected a word or phrase and was shown a card. */
export interface LookupPayload {
  surface?: string; surfaceOmitted?: boolean; tokenCount: number;
  contextKind: 'sentence' | 'fragment' | 'none'; contextConfidence: number;
  readerId: string; direction?: string; provenance?: 'lexicon' | 'rule' | 'none'; unconfirmed?: boolean;
  helpShown: string[]; mode?: string; fragmentKey?: string;
}
/** The learner asked for a deeper layer (explanation, example, grammar) after the card. */
export interface AssistancePayload { assistance: AssistanceKind; layer?: string; depth?: 'label' | 'brief' | 'explanatory' }
/** Audio playback: exposure to sound; never recognition. */
export interface PlaybackPayload { voice: 'synthetic' | 'recorded'; voiceId?: string; durationMs?: number; repeated?: boolean }
/** A listening assessment: audio first, answer judged, orthographic answer not shown before the response. */
export interface ListeningAssessmentPayload {
  stimulus: 'word' | 'sentence'; voice: 'synthetic' | 'recorded'; answerShownBefore: false; correct: boolean;
  responseMode: 'choice' | 'typed' | 'spoken' | 'self-report'; difficulty?: number; latencyMs?: number; hinted?: boolean;
}
/** A written review attempt (GoReview card). */
export interface WrittenReviewPayload {
  cardKind: 'recognition' | 'recall' | 'cloze'; grade: 'again' | 'hard' | 'good' | 'easy'; correct: boolean;
  hinted: boolean; answerShownBefore?: boolean; latencyMs?: number; difficulty?: number;
}
/** A grammar / construction assessment. */
export interface GrammarAssessmentPayload {
  constructionId: string; task: 'interpret' | 'apply' | 'choose-form' | 'explain'; correct: boolean;
  hinted: boolean; difficulty?: number; answer?: string; expected?: string;
}
/** A writing observation: `assisted: false` only when no correction, suggestion, translation or hint was used for this sentence. */
export interface WritingObservationPayload {
  mode: 'free' | 'guided' | 'retrieval';
  assisted: boolean;
  assistance: AssistanceKind[];
  /** Units the learner used; judged by the analyser (`provisional`) or a reviewer. */
  usedCorrectly: boolean | 'unjudged';
  /** Reference to the private document (never its text). */
  draftId?: string;
  sentenceKey?: string;
  wordCount?: number;
}
/** The learner (or a reviewer) corrects an analysis: a new analysis supersedes, the old one is invalidated. */
export interface UserCorrectionPayload {
  analysisId?: string; formId: string; correctedLexemeId?: string; correctedFeatures?: Record<string, string>;
  reason?: string; by: 'learner' | 'reviewer';
}
/** A review item is withdrawn because its analysis was invalidated or the learner removed it. */
export interface ReviewInvalidationPayload { reason: 'analysis-invalidated' | 'learner-removed' | 'pack-superseded'; analysisId?: string; cardId?: string }
/** An explicit preference change (§9). */
export interface PreferenceChangePayload { key: string; value: unknown; origin: 'explicit' }
/** Explicit vocabulary save / known / still-learning marks. */
export interface ItemMarkPayload { mark: 'saved' | 'known' | 'learning' | 'ignore' }
/** The learner says they understood a sentence or passage (self-report; discounted by help used). */
export interface UnderstoodPayload { scope: 'sentence' | 'passage'; helpUsed: boolean; tokenCount?: number }

export const PAYLOAD_KINDS = {
  EncounterRecorded: 'encounter',
  SelectionLookedUp: 'lookup',
  AnalysisShown: 'lookup-layer',
  AssistanceRequested: 'assistance',
  PronunciationPlayed: 'playback',
  UnderstoodMarked: 'understood',
  ItemMarked: 'item-mark',
  ListeningCompleted: 'playback',
  ListeningAssessed: 'listening-assessment',
  CardReviewed: 'written-review',
  CardAdded: 'card',
  CardRemoved: 'card',
  AssessmentAnswered: 'grammar-assessment',
  DraftSaved: 'draft',
  SentenceSubmitted: 'draft',
  CorrectionAccepted: 'correction-response',
  CorrectionRejected: 'correction-response',
  ProductionRecorded: 'writing-observation',
  AnalysisCorrected: 'user-correction',
  ReviewItemInvalidated: 'review-invalidation',
  PreferenceChanged: 'preference-change',
  EnrolmentChanged: 'profile',
  PackInstalled: 'profile',
  PrivacySettingChanged: 'profile',
  ConsentGiven: 'profile',
  ConsentWithdrawn: 'profile',
} as const;

type Check = (p: Record<string, unknown>) => ValidationIssue[];
const need = (p: Record<string, unknown>, k: string, t: 'string' | 'number' | 'boolean', path = 'payload'): ValidationIssue[] =>
  typeof p[k] === t ? [] : [{ path: `${path}.${k}`, message: `required ${t}` }];
const oneOf = (p: Record<string, unknown>, k: string, vals: readonly string[]): ValidationIssue[] =>
  vals.includes(String(p[k])) ? [] : [{ path: `payload.${k}`, message: `one of ${vals.join(', ')}` }];
const surfaceOk = (p: Record<string, unknown>): ValidationIssue[] => {
  const s = p.surface;
  if (s === undefined) return [];
  if (typeof s !== 'string') return [{ path: 'payload.surface', message: 'string' }];
  if (s.length > MAX_SURFACE_CHARS || s.trim().split(/\s+/u).length > MAX_SURFACE_WORDS) return [{ path: 'payload.surface', message: `a surface is at most ${MAX_SURFACE_WORDS} words; passages are never stored` }];
  return [];
};
const noText = (p: Record<string, unknown>): ValidationIssue[] =>
  ['text', 'sentence', 'sentenceText', 'passage', 'content', 'body'].filter((k) => k in p).map((k) => ({ path: `payload.${k}`, message: 'event payloads never carry text; use a hash or a document reference' }));

const CHECKS: Record<string, Check> = {
  encounter: (p) => [...oneOf(p, 'contextKind', ['sentence', 'fragment', 'none']), ...surfaceOk(p)],
  lookup: (p) => [...need(p, 'tokenCount', 'number'), ...oneOf(p, 'contextKind', ['sentence', 'fragment', 'none']), ...need(p, 'contextConfidence', 'number'), ...need(p, 'readerId', 'string'), ...(Array.isArray(p.helpShown) ? [] : [{ path: 'payload.helpShown', message: 'array of layer names' }]), ...surfaceOk(p)],
  'lookup-layer': (p) => (Array.isArray(p.layers) ? [] : [{ path: 'payload.layers', message: 'array of layer names' }]),
  assistance: (p) => need(p, 'assistance', 'string'),
  playback: (p) => oneOf(p, 'voice', ['synthetic', 'recorded']),
  understood: (p) => [...oneOf(p, 'scope', ['sentence', 'passage']), ...need(p, 'helpUsed', 'boolean')],
  'item-mark': (p) => oneOf(p, 'mark', ['saved', 'known', 'learning', 'ignore']),
  'listening-assessment': (p) => [
    ...oneOf(p, 'stimulus', ['word', 'sentence']), ...oneOf(p, 'voice', ['synthetic', 'recorded']), ...need(p, 'correct', 'boolean'),
    ...oneOf(p, 'responseMode', ['choice', 'typed', 'spoken', 'self-report']),
    ...(p.answerShownBefore === false ? [] : [{ path: 'payload.answerShownBefore', message: 'a listening assessment must state answerShownBefore: false; otherwise it is a reading review' }]),
  ],
  'written-review': (p) => [...oneOf(p, 'cardKind', ['recognition', 'recall', 'cloze']), ...oneOf(p, 'grade', ['again', 'hard', 'good', 'easy']), ...need(p, 'correct', 'boolean'), ...need(p, 'hinted', 'boolean')],
  card: () => [],
  'grammar-assessment': (p) => [...need(p, 'constructionId', 'string'), ...oneOf(p, 'task', ['interpret', 'apply', 'choose-form', 'explain']), ...need(p, 'correct', 'boolean'), ...need(p, 'hinted', 'boolean')],
  draft: (p) => need(p, 'draftId', 'string'),
  'correction-response': () => [],
  'writing-observation': (p) => [
    ...oneOf(p, 'mode', ['free', 'guided', 'retrieval']), ...need(p, 'assisted', 'boolean'),
    ...(Array.isArray(p.assistance) ? [] : [{ path: 'payload.assistance', message: 'array (empty when unassisted)' }]),
    ...(p.assisted === false && Array.isArray(p.assistance) && p.assistance.length ? [{ path: 'payload.assisted', message: 'assisted must be true when any assistance is listed' }] : []),
    ...(p.usedCorrectly === true || p.usedCorrectly === false || p.usedCorrectly === 'unjudged' ? [] : [{ path: 'payload.usedCorrectly', message: 'boolean or "unjudged"' }]),
  ],
  'user-correction': (p) => [...need(p, 'formId', 'string'), ...oneOf(p, 'by', ['learner', 'reviewer'])],
  'review-invalidation': (p) => oneOf(p, 'reason', ['analysis-invalidated', 'learner-removed', 'pack-superseded']),
  'preference-change': (p) => [...need(p, 'key', 'string'), ...(p.origin === 'explicit' ? [] : [{ path: 'payload.origin', message: 'a PreferenceChanged event is always explicit; inferred preferences are projections, not events' }])],
  profile: () => [],
};

export function validatePayload(kind: string, payload: unknown): ValidationIssue[] {
  if (!payload || typeof payload !== 'object') return [{ path: 'payload', message: 'required object' }];
  const p = payload as Record<string, unknown>;
  const shape = (PAYLOAD_KINDS as Record<string, string>)[kind];
  if (!shape) return [{ path: 'kind', message: 'unknown event kind' }];
  return [...noText(p), ...CHECKS[shape](p)];
}
