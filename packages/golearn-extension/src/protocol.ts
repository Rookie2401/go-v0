/**
 * The message protocol between the content script (the page side, untrusted surroundings) and the background worker
 * (the privileged side: it alone holds the Repository connection). Types and tiny validators only; no runtime
 * dependency, so the content bundle can import this without pulling the network code in.
 *
 * Rules:
 *  - a content script never receives a token, an email, a learner id or an enrolment id: replies are shaped for it;
 *  - everything that arrives from the page side is validated again in the background (a page can talk to a content
 *    script's world only through the DOM, but the background does not rely on that);
 *  - everything that arrives from a remote service is data: it is rendered as text and unit ids are matched against a pattern.
 */
import type { Dimension } from '../../repository-contract/src';

export type ExplanationDepth = 'label' | 'brief' | 'explanatory';
export const DEPTHS: readonly ExplanationDepth[] = ['label', 'brief', 'explanatory'];

/** The learner's privacy switches (golearn:settings). Defaults are all off. */
export interface PrivacySettings {
  /** Keep the sentence of a lookup as a separate consented row. NOT IMPLEMENTED in this phase: always false. */
  keepSnippets: boolean;
  /** Allow a remote speech provider to receive the word to be pronounced. */
  remoteSpeechConsent: boolean;
  /** Allow text to be processed by a service outside the device (none is called in this phase). */
  externalProcessingConsent: boolean;
  /** An explicit override of how much grammar explanation to show; absent = follow the Repository's preference. */
  explanationDepth?: ExplanationDepth;
}

export const DEFAULT_SETTINGS: PrivacySettings = { keepSnippets: false, remoteSpeechConsent: false, externalProcessingConsent: false };

export interface SyncView {
  pending: number;
  /** Events recorded while signed out (or before an enrolment): kept on this device, not yet attributable to an account. */
  localOnly: number;
  rejected: number;
  lastPushAt?: number;
  lastError?: string;
  online: boolean;
  needsSignIn: boolean;
}

/** What a content script may know about the extension's state. */
export interface PublicStatus {
  ok: true;
  connected: boolean;
  needsSignIn: boolean;
  languageId: string;
  languageName: string;
  /** The background found an installable language pack for `languageId`. */
  packAvailable: boolean;
  /** The languages the worker has a pack for that the reader may read with (installable or experimental; never a planned one). The resolver compares a sample only against these. */
  installedLanguages?: string[];
}

/** What an extension page (popup, setup page) may know in addition. Still no token and no learner id. */
export interface PageStatus extends PublicStatus {
  sync: SyncView;
  email?: string;
  baseUrl?: string;
  assetBase?: string;
  expiresAt?: string;
  hasEnrolment: boolean;
  settings: PrivacySettings;
}

export interface DimView { score: number; confidence: number; observations: number; positive: number; negative: number }
/** A knowledge row as the content script sees it: the seven dimensions, no learner id. */
export interface KnowledgeView { unitId: string; dimensions: Partial<Record<Dimension, DimView>>; lastSeenAt?: string }

export interface ProfileRequest { unitIds: string[]; languageId: string }
export interface ProfileReply {
  ok: boolean;
  /** Signed in to an account (not "a model is available": see `source`). */
  connected: boolean;
  /** Where the rows come from when they are not (only) the account's: `device` = this device's own Repository (no sign-in needed, or the account could not be reached). */
  source?: 'device';
  /** The rows are from the cache and the Repository could not be reached to refresh them. */
  stale?: boolean;
  rows: Record<string, KnowledgeView>;
  depth: ExplanationDepth;
  depthOrigin: 'settings' | 'explicit' | 'inferred' | 'default';
  error?: string;
}

export interface GlossRequest {
  lemma: string; pos?: string; languageId: string;
  /** The dictionary spellings of the lemma (normalised, with the analyser's variants), worked out where the analyser is loaded: the worker carries Albanian only. At most 8. */
  forms?: string[];
}
export interface GlossReply {
  ok: boolean;
  found: boolean;
  senses: string[];
  attribution?: string;
  reason?: 'no-pack' | 'no-asset-base' | 'offline' | 'not-found' | 'error';
  message?: string;
}

export interface ExplainRequest { languageId: string; pos?: string; features: Record<string, string>; constructionIds: string[] }
export interface FeatureExplanation { key: string; value: string; label: string; brief?: string; explanation?: string }
export interface ConstructionExplanation { id: string; title?: string; brief?: string; explanation?: string }
export interface ExplainReply { ok: boolean; features: FeatureExplanation[]; constructions: ConstructionExplanation[]; source: 'pack' | 'none' }

export interface RecordReply { ok: boolean; duplicate?: boolean; attributed?: 'account' | 'local'; error?: string }

export interface CorrectRequest { formId: string; languageId: string; lexemeId?: string; features?: Record<string, string>; reason?: string; sentenceKey?: string }
export interface CorrectReply { ok: boolean; posted: boolean; reason?: 'not-connected' | 'needs-sign-in' | 'refused' | 'offline'; message?: string }

export interface PronounceInfoRequest { languageId: string }
export interface PronounceInfoReply {
  ok: boolean;
  /** The device can play something for this language (the content script decides with its own speech provider). */
  deviceVoice: 'maybe' | 'no';
  /** The learner has consented to a remote speech provider. */
  remoteConsent: boolean;
  /** Recorded or remote audio the background can supply after consent, as a short description; empty when none. */
  sources: string[];
  note: string;
}

export interface SettingsRequest { op: 'get' | 'set'; patch?: Partial<PrivacySettings> }
export interface SettingsReply {
  ok: boolean;
  settings: PrivacySettings;
  notes?: string[];
  /** Switches that exist but cannot be turned on in this version, with the reason to show beside them. */
  unavailable?: Partial<Record<keyof PrivacySettings, string>>;
  error?: string;
}

export const SETTINGS_UNAVAILABLE: SettingsReply['unavailable'] = { keepSnippets: 'Keeping sentences is not implemented in this version: nothing in the extension can store a sentence, so this stays off.' };

// ───────────────────────────── validators ─────────────────────────────

/** A unit id: `kind:rest`; spaces allowed (`lemma:sq:i bukur:ADJ`), but no tab, line break, control character, comma, query or fragment character. */
export const UNIT_ID_PATTERN = /^(?:lemma|form|sense|morph|phrase|syntax|phon|pron|orth|link):[^\t\n\r,?#&%\u0000-\u001f]{1,180}$/u;
export const isUnitId = (v: unknown): v is string => typeof v === 'string' && v.length <= 200 && UNIT_ID_PATTERN.test(v);

export const LANGUAGE_ID_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
export const isLanguageId = (v: unknown): v is string => typeof v === 'string' && v.length <= 20 && LANGUAGE_ID_PATTERN.test(v);

export const isDepth = (v: unknown): v is ExplanationDepth => typeof v === 'string' && (DEPTHS as readonly string[]).includes(v);

/** A plain object with string values only, bounded (feature structures). */
export function stringRecord(v: unknown, maxEntries = 24, maxLen = 80): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length > maxEntries) return undefined;
  for (const [k, x] of entries) {
    if (typeof x !== 'string' || x.length > maxLen || k.length > maxLen) return undefined;
    out[k] = x;
  }
  return out;
}

// ───────────────────────────── GoLearn Active ─────────────────────────────

/** The learner's two switches for GoLearn Active (golearn:active). Off by default; Speak on click defaults to on once Active is on. */
export interface ActiveSettings { active: boolean; speakOnClick: boolean }
export const DEFAULT_ACTIVE: ActiveSettings = { active: false, speakOnClick: true };
/** The optional host permission Active needs (manifest `optional_host_permissions`); nothing is granted until the learner says yes to the browser's prompt. */
export const ACTIVE_ORIGINS: readonly string[] = ['https://*/*', 'http://*/*'];

export interface ActiveRequest { op: 'get' | 'set'; patch?: Partial<ActiveSettings> }
export interface ActiveReply {
  ok: boolean;
  settings: ActiveSettings;
  /** The browser has granted the host permission. */
  granted: boolean;
  /** The dynamic content script is registered (Active is really on for pages opened from now on). */
  registered: boolean;
  /** How many refusing readers the registration excludes. */
  excluded: number;
  error?: 'permission' | 'unsupported' | 'register-failed' | 'forbidden' | 'storage';
  message?: string;
}

/** Background -> content: start (or update) Active on this page. */
export interface ActivateMessage { type: 'golearn:activate'; speak: boolean }

/** Text from a remote or page source: a string, bounded, control characters removed. Rendering is always as text. */
export function cleanText(v: unknown, max = 400): string | undefined {
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  return s ? s.slice(0, max) : undefined;
}

// ───────────────────────────── language names ─────────────────────────────

const LANGUAGE_NAMES: Record<string, string> = {
  sq: 'Albanian', de: 'German', es: 'Spanish', hi: 'Hindi', th: 'Thai', nb: 'Norwegian (Bokmål)', nn: 'Norwegian (Nynorsk)',
};
/** A learner-facing name for a language id; the id itself when the name is not known. */
export const languageNameOf = (id: string): string => LANGUAGE_NAMES[id] ?? id;

// ───────────────────────────── the device-local Repository (no account) ─────────────────────────────

/** One enrolment of the device-local learner. `explicit` = the learner chose the language (setup page); otherwise the Repository made it to be able to record a lookup. */
export interface LocalEnrolmentView { enrolmentId: string; languageId: string; packId: string; packVersion: string; startedAt: string; endedAt?: string; explicit: boolean; active: boolean }

/**
 * What an extension page asks of the device-local Repository (`MSG.localRepo`; extension pages only, never a content script). Every reply has
 * `ok`; a refusal is `{ ok: false, error }`.
 *   status      counts, enrolments, storage, the last upload             -> LocalRepoStatus
 *   knowledge   the learner-model rows of some units (or all)            -> { ok, knowledge: UnitKnowledge[] }
 *   candidates  review candidates for a language's enrolment             -> { ok, candidates: ReviewCandidate[] }
 *   export      every event recorded on this device, with the enrolments -> { ok, format, events, enrolments }
 *   enrolments  the open enrolments                                       -> { ok, enrolments: LocalEnrolmentView[] }
 *   enrol       choose a language (idempotent per language); it becomes the active one -> { ok, enrolment }
 *   select      make an open enrolment the active one                    -> { ok, enrolment }
 *   end         end an enrolment (its events stay)                       -> { ok }
 *   identity    this device's local learner and device ids               -> { ok, learnerId, deviceId }
 *   upload      send the history to the signed-in account now, then pull -> { ok, upload?: { sent, duplicates, failed, waiting }, pulled?, skipped? }
 *               (`waiting`: events held back because the account has no open enrolment in their language; they go when it has one)
 *   rebuild     refold the knowledge projection from the events         -> { ok }
 *   clear       erase the device-local Repository (a new anonymous learner starts) -> { ok }
 *   api         call one method of the Repository API client (see LOCAL_API_METHODS) -> { ok, result: ApiResult }
 */
export type LocalRepoRequest =
  | { op: 'status' }
  | { op: 'knowledge'; unitIds?: string[]; languageId?: string }
  | { op: 'candidates'; languageId?: string; limit?: number }
  | { op: 'export' }
  | { op: 'enrolments' }
  | { op: 'enrol'; languageId: string; packId?: string; packVersion?: string; goals?: Array<{ kind: string; label?: string; priority?: number }>; varietyId?: string; scriptId?: string }
  | { op: 'select'; enrolmentId: string }
  | { op: 'end'; enrolmentId: string }
  | { op: 'identity' }
  | { op: 'upload' }
  | { op: 'rebuild' }
  | { op: 'clear' }
  | { op: 'api'; method: string; args?: unknown[] };

/** The methods of the Repository API client that `{ op: 'api' }` forwards. Accounts and sessions are not among them: there is no password on this device. */
export const LOCAL_API_METHODS: readonly string[] = [
  'health', 'me', 'listEnrolments', 'enrol', 'endEnrolment', 'packs', 'unit', 'units', 'lookup', 'correctUnit', 'correct', 'appendEvents', 'listEvents',
  'knowledge', 'candidates', 'preferences', 'submitReviews', 'submitWriting', 'listDocuments', 'getDocument', 'putDocument', 'deleteDocument', 'exportAll', 'putTombstone',
];

export interface LocalRepoStatus {
  ok: true;
  /** The Repository opened (false: storage was unreadable; nothing is being recorded on the device). */
  available: boolean;
  events: number;
  /** Events recorded here and not yet sent to an account. */
  pendingUpload: number;
  uploaded: number;
  /** Events received from the account (other devices). */
  fromAccount: number;
  enrolments: LocalEnrolmentView[];
  /** The active language: the selected open enrolment of an explicit choice; absent until the learner has chosen one. */
  languageId?: string;
  /** Characters of the rows kept in `chrome.storage.local` (a lower bound of the bytes; the browser allows about 10 MB for the whole extension). */
  storedChars: number;
  /** Writes the browser refused (storage full): the data is kept for this session only. */
  writeFailures: number;
  lastWriteError?: string;
  lastUpload?: { at: number; sent: number; duplicates: number; failed: number; waiting?: number; pulled: number; error?: string };
}
