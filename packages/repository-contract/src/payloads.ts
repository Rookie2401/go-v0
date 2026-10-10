/**
 * Layer B — the typed learning-event payloads (Prompt 3 §7) and their runtime validators. One validator per kind;
 * the envelope validator in index.ts calls `validatePayload`. Book content is untrusted input: payloads carry
 * surfaces of a few words at most, hashes for sentences, and never a passage.
 */
import type { ValidationIssue, ValidationLevel } from './units';
import { VALIDATION_LEVELS } from './units';
import { KNOWLEDGE_LEVELS } from './knowledge-levels';
import type { LevelMark } from './knowledge-levels';

export const MAX_SURFACE_CHARS = 120;
export const MAX_SURFACE_WORDS = 4;

/** How strong an observation is as evidence, as the producer declares it; the engine may lower it, never raise it. */
export const EVIDENCE_QUALITIES = ['none', 'weak', 'moderate', 'strong'] as const;
export type EvidenceQuality = (typeof EVIDENCE_QUALITIES)[number];

export type AssistanceKind = 'gloss' | 'translation' | 'morphology' | 'grammar' | 'hint' | 'example' | 'pronunciation' | 'transliteration' | 'correction';

/**
 * How the language of a selection was decided (contract v3). `override`: the learner chose it for this selection;
 * `book-metadata` / `document-metadata`: the book or the page declared it; `detection`: guessed from the text; `team-default`: the
 * enrolment's language, nothing else known; `undetermined`: nothing decided. A DETECTED language is not a user-confirmed one: the
 * engine weights evidence by `basis` (an override or a declaration outweighs a detection). Optional on v2 events.
 */
export const LANGUAGE_BASES = ['override', 'book-metadata', 'document-metadata', 'detection', 'team-default', 'undetermined'] as const;
export type LanguageBasis = (typeof LANGUAGE_BASES)[number];
export interface LanguageEvidence {
  languageId: string;
  varietyId?: string;
  basis: LanguageBasis;
  /** 0..1, the resolver's own number. */
  confidence: number;
  /** What the basis rested on, a few words (`html-lang`, `og:locale`, `url-locale`); never page text. */
  source?: string;
  /** True exactly when `basis` is `override`. */
  override: boolean;
}

/** Exposure only: the learner read or had on screen a sentence containing these units (no help requested). */
export interface EncounterPayload { surface?: string; tokenCount?: number; contextKind: 'sentence' | 'fragment' | 'none'; readerId?: string; language?: LanguageEvidence }
/** The learner selected a word or phrase and was shown a card. */
export interface LookupPayload {
  surface?: string; surfaceOmitted?: boolean; tokenCount: number;
  contextKind: 'sentence' | 'fragment' | 'none'; contextConfidence: number;
  readerId: string; direction?: string; provenance?: 'lexicon' | 'rule' | 'none'; unconfirmed?: boolean;
  helpShown: string[]; mode?: string; fragmentKey?: string;
  /** Contract v3: how the language was resolved. */
  language?: LanguageEvidence;
}

/** What a language pack's manifest says about itself (`level`) and what its validation actually reached (`validation`). */
export const PACK_LEVELS = ['installable', 'experimental', 'planned'] as const;
export type PackLevel = (typeof PACK_LEVELS)[number];
/**
 * A pack was installed on a device (contract v3). `level` and `validation` let the projection caveat evidence that rests on an
 * experimental or unreviewed analyser; both are optional on v2 events (and on a v3 producer that does not know), and an absent
 * `validation` reads as `unreviewed` (`packValidationOf`).
 */
export interface PackInstalledPayload {
  packId: string; packVersion: string; analyzerId?: string; analyzerVersion?: string; level?: PackLevel; validation?: ValidationLevel;
}
/** The validation a PackInstalled payload states, `unreviewed` when it states none (every v2 event). */
export const packValidationOf = (payload: { validation?: unknown }): ValidationLevel =>
  (VALIDATION_LEVELS as readonly string[]).includes(String(payload.validation)) ? (payload.validation as ValidationLevel) : 'unreviewed';
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
/**
 * Explicit vocabulary marks. A mark is one of the SIX knowledge levels (`new`, `seen`, `recognized`, `familiar`, `known`, `automatic`;
 * docs/ecosystem/KNOWLEDGE-LEVELS.md), or `saved` / `ignore` (bookmarks, not statements about knowledge).
 *
 * LEGACY marks stay valid and keep their meaning: the card's old three choices were stored as `learning` ("New to me"), `known`
 * ("I recognise it") and `productive` ("I can use it", projection@3). Stored events are immutable and are never rewritten; the projection
 * reads old and new marks through `LEGACY_MARK_LEVEL` / `levelOfMark` (`learning` = new, `productive` = known). `known` is both a legacy
 * word and a level word and an event cannot say which was meant: `levelOfMark` reads it as the level `known`, while the evidence a `known`
 * mark carries (a weak reading-recognition self-report) is exactly what it was before the six levels.
 */
export interface ItemMarkPayload { mark: 'saved' | 'ignore' | LevelMark }
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
  PackInstalled: 'pack-installed',
  PrivacySettingChanged: 'profile',
  ConsentGiven: 'profile',
  ConsentWithdrawn: 'profile',
} as const;

/** Language-resolution evidence (`payload.language`): optional; when present, a closed basis, a confidence in 0..1 and `override === (basis === 'override')`. */
export function validateLanguageEvidence(l: unknown, path = 'payload.language'): ValidationIssue[] {
  if (l === undefined) return [];
  if (!l || typeof l !== 'object' || Array.isArray(l)) return [{ path, message: 'object' }];
  const x = l as Record<string, unknown>;
  const out: ValidationIssue[] = [];
  if (typeof x.languageId !== 'string' || !x.languageId.length || x.languageId.length > 200) out.push({ path: `${path}.languageId`, message: 'required string of at most 200 characters' });
  if (x.varietyId !== undefined && (typeof x.varietyId !== 'string' || x.varietyId.length > 200)) out.push({ path: `${path}.varietyId`, message: 'string of at most 200 characters' });
  if (!(LANGUAGE_BASES as readonly string[]).includes(String(x.basis))) out.push({ path: `${path}.basis`, message: `one of ${LANGUAGE_BASES.join(', ')}` });
  if (typeof x.confidence !== 'number' || !(x.confidence >= 0 && x.confidence <= 1)) out.push({ path: `${path}.confidence`, message: 'number within 0..1' });
  if (x.source !== undefined && (typeof x.source !== 'string' || x.source.length > 100)) out.push({ path: `${path}.source`, message: 'string of at most 100 characters' });
  if (typeof x.override !== 'boolean') out.push({ path: `${path}.override`, message: 'required boolean' });
  else if (x.override !== (x.basis === 'override')) out.push({ path: `${path}.override`, message: 'override must be true exactly when basis is "override"' });
  return out;
}

const languageOk = (p: Record<string, unknown>): ValidationIssue[] => validateLanguageEvidence(p.language);

const idField = (p: Record<string, unknown>, k: string, required: boolean): ValidationIssue[] => {
  const v = p[k];
  if (v === undefined) return required ? [{ path: `payload.${k}`, message: 'required string' }] : [];
  return typeof v === 'string' && v.length > 0 && v.length <= 200 ? [] : [{ path: `payload.${k}`, message: 'string of 1 to 200 characters' }];
};

/** PackInstalled: every field is checked when present; none is required, so a v2 event (`{ packId }` or less) stays valid. */
const packInstalledOk = (p: Record<string, unknown>): ValidationIssue[] => [
  ...idField(p, 'packId', false), ...idField(p, 'packVersion', false), ...idField(p, 'analyzerId', false), ...idField(p, 'analyzerVersion', false),
  ...(p.level === undefined || (PACK_LEVELS as readonly string[]).includes(String(p.level)) ? [] : [{ path: 'payload.level', message: `one of ${PACK_LEVELS.join(', ')}` }]),
  ...(p.validation === undefined || (VALIDATION_LEVELS as readonly string[]).includes(String(p.validation)) ? [] : [{ path: 'payload.validation', message: `one of ${VALIDATION_LEVELS.join(', ')}` }]),
];

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
/** Key names (compared in lower case with everything but letters removed) that mean "a passage lives here". */
const TEXT_KEYS: ReadonlySet<string> = new Set(['text', 'sentence', 'sentencetext', 'passage', 'content', 'body', 'versetext']);
/**
 * Keys that legitimately hold a few words of free text (a learner's correction reason, a goal's label, a typed answer, a
 * voice's name), each bounded by MAX_FREE_TEXT_CHARS. Every other string anywhere in a payload obeys the surface rule:
 * at most MAX_SURFACE_WORDS words.
 */
const FREE_TEXT_KEYS: ReadonlySet<string> = new Set(['reason', 'label', 'answer', 'expected', 'voiceid', 'message']);
export const MAX_FREE_TEXT_CHARS = 1000;
/** The longest a string without a free-text key may be, whatever its word count (identifiers, hashes, enum values). */
export const MAX_PLAIN_STRING_CHARS = 300;
/** Payloads and subjects are small records: anything nested deeper than this is refused (and never walked further). */
export const MAX_NESTING = 8;

export const wordCount = (s: string): number => s.trim().split(/\s+/u).filter(Boolean).length;
const keyForm = (k: string): string => k.toLowerCase().replace(/[^a-z]/gu, '');

/**
 * The text guard. Walks `value` (objects and arrays, to MAX_NESTING levels) and reports: a text-like key at ANY depth; a
 * string of more than MAX_SURFACE_WORDS words (or MAX_PLAIN_STRING_CHARS characters) under a key that is not a free-text
 * key; a free-text string over MAX_FREE_TEXT_CHARS; nesting deeper than MAX_NESTING (never walked further, so a hostile
 * structure costs a bounded walk). `base` is the path prefix (`payload`, `subject`); `freeKeys` adds key names that may
 * hold prose-free identifiers or a few words in that record (the subject's unit ids, source title and locator); the caller bounds
 * the length of those.
 */
export function scanForText(value: unknown, base: string, freeKeys: readonly string[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const free = new Set([...FREE_TEXT_KEYS, ...freeKeys.map(keyForm)]);
  const exempt = new Set(freeKeys.map(keyForm)); // named by the caller, who bounds their length itself
  const walk = (v: unknown, path: string, key: string | undefined, depth: number): void => {
    if (issues.length >= 20) return;
    if (typeof v === 'string') {
      if (key !== undefined && free.has(keyForm(key))) {
        if (v.length > MAX_FREE_TEXT_CHARS && !exempt.has(keyForm(key))) issues.push({ path, message: `at most ${MAX_FREE_TEXT_CHARS} characters` });
      } else if (v.length > MAX_PLAIN_STRING_CHARS || wordCount(v) > MAX_SURFACE_WORDS) {
        issues.push({ path, message: `a string here is at most ${MAX_SURFACE_WORDS} words; passages are never stored` });
      }
      return;
    }
    if (v === null || typeof v !== 'object') return;
    if (depth > MAX_NESTING) { issues.push({ path, message: `nested more than ${MAX_NESTING} levels deep` }); return; }
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length && i < 500; i++) walk(v[i], `${path}[${i}]`, key, depth + 1);
      return;
    }
    for (const k of Object.keys(v)) {
      if (TEXT_KEYS.has(keyForm(k))) { issues.push({ path: `${path}.${k}`, message: 'event payloads never carry text; use a hash or a document reference' }); continue; }
      walk((v as Record<string, unknown>)[k], `${path}.${k}`, k, depth + 1);
    }
  };
  walk(value, base, undefined, 0);
  return issues;
}

/** One issue per path: the first one reported wins (the text guard runs before the per-kind checks). */
export const uniqueByPath = (issues: ValidationIssue[]): ValidationIssue[] => {
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.path) ? false : (seen.add(i.path), true)));
};

/** Every mark an ItemMarked may carry: the six levels, the legacy words `learning` and `productive` (`known` is a level too), and the bookmarks. */
export const ITEM_MARKS: readonly string[] = ['saved', 'ignore', ...KNOWLEDGE_LEVELS, 'learning', 'productive'];

const CHECKS: Record<string, Check> = {
  encounter: (p) => [...oneOf(p, 'contextKind', ['sentence', 'fragment', 'none']), ...surfaceOk(p), ...languageOk(p)],
  lookup: (p) => [...need(p, 'tokenCount', 'number'), ...oneOf(p, 'contextKind', ['sentence', 'fragment', 'none']), ...need(p, 'contextConfidence', 'number'), ...need(p, 'readerId', 'string'), ...(Array.isArray(p.helpShown) ? [] : [{ path: 'payload.helpShown', message: 'array of layer names' }]), ...surfaceOk(p), ...languageOk(p)],
  'lookup-layer': (p) => (Array.isArray(p.layers) ? [] : [{ path: 'payload.layers', message: 'array of layer names' }]),
  assistance: (p) => need(p, 'assistance', 'string'),
  playback: (p) => oneOf(p, 'voice', ['synthetic', 'recorded']),
  understood: (p) => [...oneOf(p, 'scope', ['sentence', 'passage']), ...need(p, 'helpUsed', 'boolean')],
  'item-mark': (p) => oneOf(p, 'mark', ITEM_MARKS),
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
  'pack-installed': packInstalledOk,
};

export function validatePayload(kind: string, payload: unknown): ValidationIssue[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [{ path: 'payload', message: 'required object' }];
  const p = payload as Record<string, unknown>;
  const shape = (PAYLOAD_KINDS as Record<string, string>)[kind];
  if (!shape) return [{ path: 'kind', message: 'unknown event kind' }];
  return uniqueByPath([...scanForText(p, 'payload'), ...CHECKS[shape](p)]);
}
