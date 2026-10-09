/**
 * Encounter store. Rows are `GoEvent`s of the Repository contract, validated by `validateEvent` before they are
 * written; nothing else is written. A row identifies a context (a hash) and a source (page title and URL path); it never
 * contains the sentence or the page. Prototype storage: one chrome.storage.local key per row.
 */
import { CONTRACT_VERSION, validateEvent, type GoEvent, type ValidationIssue } from '../../../repository-contract/src';
import type { CardModel } from '../parser/cardModel';
import type { SourceReference } from '../contract/readerAdapter';
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

export interface Identity { learnerId: string; enrolmentId: string; deviceId: string }
export interface BuildContext {
  card: CardModel;
  source?: SourceReference;
  readerId: string;
  identity: Identity;
  version: string;
  sessionId: string;
  now: Date;
  /** Only the reader that produced the selection can say; 'ltr'/'rtl' as recorded by the adapter. */
  direction?: string;
}

let counter = 0;
const randomPart = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
};
export const newEventId = (now: Date): string => `ev:${now.getTime().toString(36)}:${(counter++).toString(36)}:${randomPart()}`;

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
  if (b.source) subject.sourceRef = { kind: b.source.kind, title: b.source.title?.slice(0, 120), locator: b.source.locator };
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
