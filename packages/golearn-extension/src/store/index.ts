/**
 * Encounter store. Rows are `GoEvent`s of the Repository contract, validated by `validateEvent` before they are
 * written; nothing else is written. A row identifies a context (a hash) and a source (page title and URL path); it never
 * contains the sentence or the page. Prototype storage: one chrome.storage.local key per row.
 */
import { CONTRACT_VERSION, validateEvent, type GoEvent, type KnowledgeLevel, type ValidationIssue } from '../../../repository-contract/src';
import type { CardModel } from '../parser/cardModel';
import type { EventLanguage, LanguageResolution } from '../contract/language';
import type { SourceReference, SourceRestrictions } from '../contract/readerAdapter';
import { fnv1a64, wordCount } from '../text';
import type { StorageArea } from '../platform';

export const EVENT_KEY_PREFIX = 'golearn:event:';
export const DEVICE_KEY = 'golearn:deviceId';
/** A selection longer than this many words is a passage, not an item: its text is not stored even as a surface. */
export const MAX_STORED_SURFACE_WORDS = 4;

export interface WriteResult { ok: boolean; id?: string; duplicate?: boolean; issues?: ValidationIssue[]; error?: string }

export interface EncounterStore {
  append(event: GoEvent): Promise<WriteResult>;
  list(): Promise<GoEvent[]>;
  count(): Promise<number>;
  /** The rows as pretty JSON, for the learner to read or copy. */
  exportRows(): Promise<string>;
  clear(): Promise<number>;
}

export function createStorageEncounterStore(area: StorageArea): EncounterStore {
  const rows = async (): Promise<Array<[string, GoEvent]>> => {
    const all = await area.get(null);
    return Object.entries(all).filter(([k]) => k.startsWith(EVENT_KEY_PREFIX)).map(([k, v]) => [k, v as GoEvent]);
  };
  return {
    async append(event) {
      const issues = validateEvent(event);
      if (issues.length) return { ok: false, issues };
      const key = EVENT_KEY_PREFIX + (event.dedupeKey ? fnv1a64(event.dedupeKey) : event.id);
      try {
        const existing = await area.get(key);
        if (existing[key] !== undefined) return { ok: true, id: (existing[key] as GoEvent).id, duplicate: true };
        await area.set({ [key]: event });
        return { ok: true, id: event.id };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async list() { return (await rows()).map(([, v]) => v).sort((a, b) => a.at.localeCompare(b.at)); },
    async count() { return (await rows()).length; },
    async exportRows() { return JSON.stringify(await this.list(), null, 2); },
    async clear() {
      const keys = (await rows()).map(([k]) => k);
      if (keys.length) await area.remove(keys);
      return keys.length;
    },
  };
}

/** A Map-backed storage area (tests, and a fallback when chrome.storage is unavailable). */
export function createMemoryStorageArea(): StorageArea & { dump(): Record<string, unknown> } {
  const m = new Map<string, unknown>();
  return {
    async get(keys) {
      if (keys == null) return Object.fromEntries(m);
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) if (m.has(k)) out[k] = structuredClone(m.get(k));
      return out;
    },
    async set(items) { for (const [k, v] of Object.entries(items)) m.set(k, structuredClone(v)); },
    async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
}

/** The in-memory store implementation for tests. */
export const createMemoryEncounterStore = (): EncounterStore => createStorageEncounterStore(createMemoryStorageArea());

// ───────────────────────────── building the event ─────────────────────────────

// ───────────────────────────── what an event says about the source and the language ─────────────────────────────

/**
 * A Scripture source reference as the event carries it (contract v3): METADATA about where in a translation the selection is,
 * never the verse text. `provider` is the registry id of the site; `url` is the passage address (path and passage query only).
 */
export interface ScriptureEventSource {
  kind: 'scripture';
  provider: 'biblegateway' | 'youversion' | 'other';
  translationId: string;
  languageId?: string;
  /** USFM book code. */
  book: string;
  chapter: number;
  verse?: number;
  verseEnd?: number;
  url?: string;
  confidence: number;
  restrictions?: SourceRestrictions;
}

/** A passage that reached GoLearn by a platform share or a clipboard import (golearn-share builds the same member; the equality test keeps them identical). */
export interface ShareEventSource {
  kind: 'share';
  mechanism: 'android-process-text' | 'android-send' | 'ios-share-extension' | 'ios-safari-extension' | 'web-share-target' | 'clipboard-import' | 'deep-link';
  sourceApp?: string;
  title?: string;
  locator?: string;
  restrictions?: SourceRestrictions;
}

/** What a builder needs of a source: an ordinary source reference, a Scripture one, or a share. */
export type StoredSourceRef = SourceReference | ScriptureEventSource | ShareEventSource;

const restrictionsOf = (r: SourceRestrictions | undefined): { restrictions: SourceRestrictions } | Record<string, never> =>
  r ? { restrictions: { textRetention: r.textRetention, remoteProcessing: r.remoteProcessing, audioRetention: r.audioRetention, export: r.export, sharing: r.sharing, reviewExamples: r.reviewExamples } } : {};

/** The `subject.sourceRef` an event carries. Fields are listed one by one: nothing else of the source object travels. */
export function sourceRefOf(s: StoredSourceRef): NonNullable<GoEvent['subject']['sourceRef']> {
  if (s.kind === 'scripture') {
    return {
      kind: 'scripture', provider: s.provider, translationId: s.translationId,
      ...(s.languageId ? { languageId: s.languageId } : {}),
      book: s.book, chapter: s.chapter,
      ...(s.verse !== undefined ? { verse: s.verse } : {}), ...(s.verseEnd !== undefined ? { verseEnd: s.verseEnd } : {}),
      ...(s.url ? { url: s.url } : {}), confidence: s.confidence, ...restrictionsOf(s.restrictions),
    } as unknown as NonNullable<GoEvent['subject']['sourceRef']>;
  }
  if (s.kind === 'share') {
    return {
      kind: 'share', mechanism: s.mechanism, ...(s.sourceApp ? { sourceApp: s.sourceApp } : {}),
      ...(s.title ? { title: s.title.slice(0, 120) } : {}), ...(s.locator ? { locator: s.locator } : {}), ...restrictionsOf(s.restrictions),
    } as NonNullable<GoEvent['subject']['sourceRef']>;
  }
  return {
    kind: s.kind, ...(s.title ? { title: s.title.slice(0, 120) } : {}), ...(s.locator ? { locator: s.locator } : {}), ...restrictionsOf(s.restrictions),
  } as NonNullable<GoEvent['subject']['sourceRef']>;
}

/** The part of the controller's `LanguageInfo` an event records. */
export interface LanguageEvidenceInfo {
  languageId?: string;
  varietyId?: string;
  basis: LanguageResolution['basis'];
  confidence: number;
  source?: string;
}

/**
 * `payload.language` of a SelectionLookedUp (contract v3), from the one resolution the controller made. `override` is true exactly
 * when the basis is `override`. An undetermined language never reaches an event (nothing is looked up), so it records nothing.
 */
export function languagePayload(info: LanguageEvidenceInfo | undefined, languageId: string): EventLanguage | undefined {
  if (!info || info.basis === 'undetermined') return undefined;
  return {
    languageId: info.languageId ?? languageId,
    ...(info.varietyId ? { varietyId: info.varietyId } : {}),
    basis: info.basis,
    confidence: info.confidence,
    ...(info.source ? { source: info.source } : {}),
    override: info.basis === 'override',
  };
}

export interface Identity { learnerId: string; enrolmentId: string; deviceId: string }
export interface BuildContext {
  card: CardModel;
  source?: StoredSourceRef;
  readerId: string;
  identity: Identity;
  version: string;
  sessionId: string;
  now: Date;
  /** Only the reader that produced the selection can say; 'ltr'/'rtl' as recorded by the adapter. */
  direction?: string;
  /** How the language of the lookup was decided (the controller's resolution); recorded as `payload.language`. */
  language?: LanguageEvidenceInfo;
}

/** An exposure produced by GoLearn Active after the learner has explicitly enabled page reading. */
export interface EncounterContext {
  languageId: string;
  itemIds: string[];
  readerId: string;
  identity: Identity;
  version: string;
  sessionId: string;
  now: Date;
  language?: LanguageEvidenceInfo;
  /** A reader other than the page-reading content script (Biblia): the surface the producer names (default 'active-reading'), the number of words the exposure covers (default 1) and the kind of context they were read in (default 'none'). */
  surface?: string;
  tokenCount?: number;
  contextKind?: 'sentence' | 'fragment' | 'none';
}

let counter = 0;
const randomPart = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
};
export const newEventId = (now: Date): string => `ev:${now.getTime().toString(36)}:${(counter++).toString(36)}:${randomPart()}`;

export function buildEncounterEvent(b: EncounterContext): GoEvent {
  const itemIds = [...new Set(b.itemIds)].slice(0, 100);
  const payload: Record<string, unknown> = { tokenCount: b.tokenCount ?? 1, contextKind: b.contextKind ?? 'none', readerId: b.readerId };
  const language = languagePayload(b.language, b.languageId);
  if (language) payload.language = language;
  // the contract caps a dedupe key at 300 characters; a long list of ids (a whole verse) is keyed by a hash of the list instead of the list
  let dedupeKey = `enc:${b.sessionId}:${itemIds.join(',')}`;
  if (dedupeKey.length > 300) dedupeKey = `enc:${b.sessionId}:${itemIds.length}:${hashOf(itemIds.join(','))}`;
  return {
    id: newEventId(b.now), v: CONTRACT_VERSION, learnerId: b.identity.learnerId, enrolmentId: b.identity.enrolmentId,
    languageId: b.languageId, at: b.now.toISOString(), producer: { app: 'golearn-ext', version: b.version, deviceId: b.identity.deviceId, surface: b.surface ?? 'active-reading' },
    kind: 'EncounterRecorded', subject: { itemIds }, payload,
    dedupeKey,
  };
}

/** A 53-bit string hash (cyrb53): enough to tell two lists of ids apart inside one session's dedupe keys. */
function hashOf(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Prototype identity: there is no account yet. Not a real learner id; it never leaves the device. */
export const LOCAL_IDENTITY = { learnerId: 'local-learner', enrolmentId: 'local-enrolment:sq' } as const;

export function buildSelectionEvent(b: BuildContext): GoEvent {
  const { card } = b;
  const ctx = card.context;
  const helpShown = ['surface'];
  if (card.lemma) helpShown.push('lemma');
  if (card.gloss) helpShown.push('gloss');
  if (card.morphology) helpShown.push('morphology');
  if (card.pronunciation.length) helpShown.push('pronunciation');
  if (card.phrases.length) helpShown.push('phrases');
  const short = wordCount(card.surface) <= MAX_STORED_SURFACE_WORDS;
  const subject: GoEvent['subject'] = { itemIds: card.itemIds };
  if (ctx.kind === 'sentence' && ctx.sentenceKey) subject.sentenceKey = ctx.sentenceKey;
  if (b.source) subject.sourceRef = sourceRefOf(b.source);
  const payload: Record<string, unknown> = {
    tokenCount: card.tokenCount,
    contextKind: ctx.kind,
    contextConfidence: ctx.confidence,
    readerId: b.readerId,
    direction: b.direction ?? ctx.direction ?? 'unknown',
    provenance: card.provenance,
    unconfirmed: card.unconfirmed,
    helpShown,
    mode: 'word-list-only',
  };
  if (short) payload.surface = card.surface; else payload.surfaceOmitted = true; // a long selection is page text, not an item
  if (ctx.kind === 'fragment' && ctx.fragmentKey) payload.fragmentKey = ctx.fragmentKey;
  const language = languagePayload(b.language, card.languageId);
  if (language) payload.language = language;
  const itemKey = card.itemIds.join(',');
  return {
    id: newEventId(b.now),
    v: CONTRACT_VERSION,
    learnerId: b.identity.learnerId,
    enrolmentId: b.identity.enrolmentId,
    languageId: card.languageId,
    at: b.now.toISOString(),
    producer: { app: 'golearn-ext', version: b.version, deviceId: b.identity.deviceId },
    kind: 'SelectionLookedUp',
    subject,
    payload,
    dedupeKey: `sel:${b.sessionId}:${itemKey}:${ctx.sentenceKey ?? ctx.fragmentKey ?? 'none'}`,
    provenance: { packId: card.packId, analyzerId: card.analyzerId, confidence: card.confidence },
  };
}

// ───────────────────────────── the other events of a card ─────────────────────────────

/** What every follow-up event of a card needs: the lookup context plus the id of the selection event it belongs to. */
export interface InteractionContext extends BuildContext { selectionEventId?: string }

function followUp<K extends GoEvent['kind']>(b: InteractionContext, kind: K, payload: Record<string, unknown>, dedupe?: string, extra: Partial<GoEvent> = {}): GoEvent {
  const { card } = b;
  const ctx = card.context;
  const subject: GoEvent['subject'] = { itemIds: card.itemIds };
  if (ctx.kind === 'sentence' && ctx.sentenceKey) subject.sentenceKey = ctx.sentenceKey;
  if (b.source) subject.sourceRef = sourceRefOf(b.source);
  return {
    id: newEventId(b.now), v: CONTRACT_VERSION,
    learnerId: b.identity.learnerId, enrolmentId: b.identity.enrolmentId, languageId: card.languageId, at: b.now.toISOString(),
    producer: { app: 'golearn-ext', version: b.version, deviceId: b.identity.deviceId, surface: 'reading-card' },
    kind, subject, payload,
    ...(dedupe ? { dedupeKey: dedupe } : {}),
    provenance: { packId: card.packId, analyzerId: card.analyzerId, confidence: card.confidence },
    ...extra,
  };
}

const contextKey = (card: CardModel): string => card.context.sentenceKey ?? card.context.fragmentKey ?? 'none';
const itemKey = (card: CardModel): string => card.itemIds.join(',');

/** Layer 1 was shown: the layers that were on the card when it opened. */
export function buildAnalysisShownEvent(b: InteractionContext, layers: string[]): GoEvent {
  return followUp(b, 'AnalysisShown', { layers }, `shown:${b.sessionId}:${itemKey(b.card)}:${contextKey(b.card)}`);
}

export type ExpandedLayer = 'morphology' | 'phrase-syntax' | 'grammar' | 'sentence' | 'forms' | 'meaning' | 'origin' | 'structure' | 'sound' | 'variants';

/** The assistance each layer stands for. Layer 2 explains the form (morphology), layer 3 shows the word in its phrases and relations (example), layer 4 explains the grammar, layer 5 is the English rescue (translation). */
export const LAYER_ASSISTANCE: Record<ExpandedLayer, 'morphology' | 'example' | 'grammar' | 'translation' | 'gloss' | 'hint' | 'pronunciation'> = {
  morphology: 'morphology', 'phrase-syntax': 'example', grammar: 'grammar', sentence: 'translation',
  // the deeper sections (Linguistic Engine V2): the paradigm is morphology help, every sense is gloss help, the origin and the word structure are hints, the sound is pronunciation help
  forms: 'morphology', meaning: 'gloss', origin: 'hint', structure: 'hint', sound: 'pronunciation',
  // the word across the periods of a language (Hebrew, Greek): a hint about the word's history, like its origin
  variants: 'hint',
};

/** The learner opened a deeper layer. A second opening of the same layer on the same card is the same event (same dedupe key). */
export function buildAssistanceEvent(b: InteractionContext, layer: ExpandedLayer, depth?: 'label' | 'brief' | 'explanatory'): GoEvent {
  const assistance = LAYER_ASSISTANCE[layer];
  const payload: Record<string, unknown> = { assistance, layer, ...(layer === 'grammar' && depth ? { depth } : {}) };
  return followUp(b, 'AssistanceRequested', payload, `assist:${b.sessionId}:${assistance}:${layer}:${itemKey(b.card)}:${contextKey(b.card)}`);
}

/** A pronunciation was played: exposure to sound, never recognition. Every play is its own event. */
export function buildPronunciationEvent(b: InteractionContext, p: { voice: 'synthetic' | 'recorded'; voiceId?: string; repeated: boolean }): GoEvent {
  return followUp(b, 'PronunciationPlayed', { voice: p.voice, ...(p.voiceId ? { voiceId: p.voiceId } : {}), repeated: p.repeated }, undefined, { evidence: { quality: 'none', assisted: false } });
}

/**
 * The learner's own word on how well they know it: one of the six knowledge levels (new, seen, recognized, familiar, known, automatic),
 * sent as the `mark` of an `ItemMarked` event. A new mark replaces the last (its own event; the engine keeps the latest).
 * There is no "Review this" mark any more: review is a natural progression of the knowledge level, decided in the Repository.
 */
export function buildMarkEvent(b: InteractionContext, mark: KnowledgeLevel): GoEvent {
  return followUp(b, 'ItemMarked', { mark }, `mark:${b.sessionId}:${mark}:${itemKey(b.card)}:${b.now.getTime().toString(36)}`);
}

/** "This analysis is wrong": the correction references the selection event it corrects. The lemma id is a proposal. */
export function buildCorrectionEvent(b: InteractionContext, c: { formId: string; correctedLexemeId?: string; reason?: string }): GoEvent {
  const payload: Record<string, unknown> = { formId: c.formId, by: 'learner', ...(c.correctedLexemeId ? { correctedLexemeId: c.correctedLexemeId } : {}), ...(c.reason ? { reason: c.reason } : {}) };
  return followUp(b, 'AnalysisCorrected', payload, undefined, b.selectionEventId ? { correctionOf: b.selectionEventId } : {});
}

/** A lookup in a language the reader has no analyser or pack for: only the lookup is recorded, with the surface when it is short. */
export function buildNoPackEvent(b: { surface: string; languageId: string; readerId: string; identity: Identity; version: string; sessionId: string; now: Date; source?: StoredSourceRef; direction?: string; reason: 'no-pack' | 'no-analyser'; language?: LanguageEvidenceInfo }): GoEvent {
  const surface = b.surface.normalize('NFC').trim();
  const short = wordCount(surface) <= MAX_STORED_SURFACE_WORDS && surface.length > 0;
  const subject: GoEvent['subject'] = { itemIds: short ? [`form:${b.languageId}:${surface.toLowerCase()}`] : [] };
  if (b.source) subject.sourceRef = sourceRefOf(b.source);
  const payload: Record<string, unknown> = {
    tokenCount: 0, contextKind: 'none', contextConfidence: 0, readerId: b.readerId, direction: b.direction ?? 'unknown',
    helpShown: ['surface'], mode: b.reason,
  };
  if (short) payload.surface = surface; else payload.surfaceOmitted = true;
  const language = languagePayload(b.language, b.languageId);
  if (language) payload.language = language;
  return {
    id: newEventId(b.now), v: CONTRACT_VERSION, learnerId: b.identity.learnerId, enrolmentId: b.identity.enrolmentId, languageId: b.languageId, at: b.now.toISOString(),
    producer: { app: 'golearn-ext', version: b.version, deviceId: b.identity.deviceId },
    kind: 'SelectionLookedUp', subject, payload,
    dedupeKey: `sel:${b.sessionId}:${b.reason}:${surface.toLowerCase()}`,
  };
}

/** The placeholder identity a content script puts in its events; the background replaces it with the session's (or a local pseudonym). */
export const PENDING_IDENTITY: Identity = { learnerId: 'pending', enrolmentId: 'pending', deviceId: 'pending' };

/** The device id: random, created once, kept in storage. Falls back to a session-only id when storage fails. */
export async function getDeviceId(area: StorageArea): Promise<string> {
  try {
    const got = await area.get(DEVICE_KEY);
    if (typeof got[DEVICE_KEY] === 'string') return got[DEVICE_KEY] as string;
    const id = `dev-${randomPart()}${randomPart()}`;
    await area.set({ [DEVICE_KEY]: id });
    return id;
  } catch {
    return `dev-session-${randomPart()}`;
  }
}
