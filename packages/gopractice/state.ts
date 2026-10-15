/**
 * Storage of the GoPractice application: everything lives in the application origin's own storage (localStorage in the
 * browser, a Map in tests) behind the sync package's `KeyValueArea`. Nothing is shared with GoLearn or its extension.
 *
 * Keys (the bearer token is written in `gopractice:session` and nowhere else):
 *   gopractice:session            { token, learnerId, email, expiresAt }
 *   gopractice:service            { baseUrl }                      the Repository service address the learner chose
 *   gopractice:settings           { remoteSpeechConsent }          device switches
 *   gopractice:deviceId           the random id of this device (created once)
 *   gopractice:profile            { fetchedAt, email, learnerId, enrolments[] }   cached enrolments; cleared at every account switch
 *   gopractice:active             { learnerId, enrolmentId }       the one active language
 *   gopractice:prefs:<learner>:<language>     ReviewPreferences
 *   gopractice:choices:<learner>  { <unitId>: 'later' }            "test later" notes on candidates (device-local)
 *   gopractice:candidates:<learner>:<enrolment>   the last candidate list the service sent (offline display)
 *   gopractice:snapshot:<learner>:<language>      the last review model inputs, merged vocab, decks record and prefs (./snapshot.ts): what renders offline
 *   u:<learnerId>:…               ONE LEARNER'S DATA, kept apart by prefix: queue:*, rejected:*, quarantine:*, sync:*, and the
 *                                 local event log (log:ev:*, log:id:*, log:dk:*, log:head). Another account never reads it.
 */
import type { Enrolment, EventLog, EventFilter, AppendOutcome, GoEvent, StoredEvent } from '../repository-contract/src';
import { validateEvent } from '../repository-contract/src';
import { createLock, type KeyValueArea } from '../repository-sync/src';
import type { ReviewPreferences } from '../goreview/src/types';

export const KEYS = {
  session: 'gopractice:session',
  service: 'gopractice:service',
  settings: 'gopractice:settings',
  device: 'gopractice:deviceId',
  profile: 'gopractice:profile',
  active: 'gopractice:active',
} as const;
export const prefsKey = (learnerId: string, languageId: string): string => `gopractice:prefs:${learnerId}:${languageId}`;
export const choicesKey = (learnerId: string): string => `gopractice:choices:${learnerId}`;
export const candidatesKey = (learnerId: string, enrolmentId: string): string => `gopractice:candidates:${learnerId}:${enrolmentId}`;
export const snapshotKey = (learnerId: string, languageId: string): string => `gopractice:snapshot:${learnerId}:${languageId}`;
export const learnerPrefix = (learnerId: string): string => `u:${learnerId}:`;

export interface Session { token: string; learnerId: string; email: string; expiresAt: string; /** Origin that issued the token; prevents sending it to another configured service. */ serviceUrl?: string }
export interface Settings { remoteSpeechConsent: boolean }
export const DEFAULT_SETTINGS: Settings = { remoteSpeechConsent: false };
export interface Profile { fetchedAt: string; email: string; learnerId: string; enrolments: Enrolment[] }
export interface ActiveLanguage { learnerId: string; enrolmentId: string }
export type CandidateChoice = 'later';

export const MIN_CARDS_PER_DECK = 5;
export const MAX_CARDS_PER_DECK = 60;
export const DEFAULT_CARDS_PER_DECK = 10;
/** The deck size as a whole number from 5 to 60 (nonsense reads as the default). */
export const clampDeckSize = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_CARDS_PER_DECK, Math.max(MIN_CARDS_PER_DECK, Math.round(v))) : DEFAULT_CARDS_PER_DECK);
/** The nearest card count for an earlier "session length" preference: about two cards a minute; flexible time reads as the default. */
export const cardsFromMinutes = (minutes: number): number => (minutes === 0 ? DEFAULT_CARDS_PER_DECK : clampDeckSize(minutes * 2));

export const DEFAULT_PREFERENCES = (languageId: string): ReviewPreferences => ({
  languageId, sessionMinutes: 10, maxNew: 5, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true, cardsPerDeck: DEFAULT_CARDS_PER_DECK,
});

// ───────────────────────────── key-value areas ─────────────────────────────

/** A KeyValueArea over localStorage (values as JSON). */
export function createWebKeyValueArea(storage: Storage): KeyValueArea {
  const all = (): string[] => { const out: string[] = []; for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k !== null) out.push(k); } return out; };
  const parse = (raw: string | null): unknown => { if (raw === null) return undefined; try { return JSON.parse(raw); } catch { return undefined; } };
  return {
    async get(keys) {
      const list = keys == null ? all() : Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) { const v = parse(storage.getItem(k)); if (v !== undefined) out[k] = v; }
      return out;
    },
    async set(items) { for (const [k, v] of Object.entries(items)) storage.setItem(k, JSON.stringify(v)); },
    async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) storage.removeItem(k); },
    async list(prefix) { return all().filter((k) => k.startsWith(prefix)).sort(); },
  };
}

/** The same area with every key under `prefix`: one learner's rows cannot be read through another learner's area. */
export function createScopedArea(base: KeyValueArea, prefix: string): KeyValueArea {
  return {
    async get(keys) {
      if (keys == null) {
        const own = await base.list(prefix);
        const rows = own.length ? await base.get(own) : {};
        return Object.fromEntries(Object.entries(rows).map(([k, v]) => [k.slice(prefix.length), v]));
      }
      const list = Array.isArray(keys) ? keys : [keys];
      const rows = await base.get(list.map((k) => prefix + k));
      return Object.fromEntries(list.filter((k) => rows[prefix + k] !== undefined).map((k) => [k, rows[prefix + k]]));
    },
    set: (items) => base.set(Object.fromEntries(Object.entries(items).map(([k, v]) => [prefix + k, v]))),
    remove: (keys) => base.remove((Array.isArray(keys) ? keys : [keys]).map((k) => prefix + k)),
    async list(p) { return (await base.list(prefix + p)).map((k) => k.slice(prefix.length)); },
  };
}

/** Removes every row of the area that starts with one of the prefixes; returns how many. */
export async function removeByPrefix(area: KeyValueArea, prefixes: string[]): Promise<number> {
  let n = 0;
  for (const p of prefixes) {
    const keys = await area.list(p);
    if (keys.length) { await area.remove(keys); n += keys.length; }
  }
  return n;
}

// ───────────────────────────── the local event log ─────────────────────────────

const pad = (n: number): string => String(n).padStart(10, '0');

/**
 * The device's copy of the learner's events (own and pulled), as an `EventLog` over a KeyValueArea. Events keep their
 * ids; `seq` here is the local arrival order (the server's seq is the sync cursor's business, not the log's). Append is
 * idempotent on `id` and on `dedupeKey`. The area should already be scoped to one learner.
 */
export function createLocalEventLog(area: KeyValueArea, opts: { now?: () => string } = {}): EventLog {
  const now = opts.now ?? (() => new Date().toISOString());
  const lock = createLock();
  const evKey = (l: string, seq: number): string => `log:ev:${l}:${pad(seq)}`;
  const idKey = (l: string, id: string): string => `log:id:${l}:${id}`;
  const dkKey = (l: string, dk: string): string => `log:dk:${l}:${dk}`;
  const headKey = (l: string): string => `log:head:${l}`;
  const readHead = async (l: string): Promise<number> => ((await area.get(headKey(l)))[headKey(l)] as number | undefined) ?? 0;

  return {
    append: (learnerId, events) => lock.run(async (): Promise<AppendOutcome[]> => {
      const out: AppendOutcome[] = [];
      let head = await readHead(learnerId);
      // Pulls can contain hundreds of rows. On native storage every area operation crosses the
      // Capacitor bridge, and each set atomically rewrites the backing JSON file. Read all
      // id/dedupe indexes once, then commit accepted events and the new head in one bulk set.
      const lookupKeys = events.flatMap((e) => {
        const keys = [idKey(learnerId, String((e as { id?: unknown })?.id ?? ''))];
        if (typeof e?.dedupeKey === 'string' && e.dedupeKey) keys.push(dkKey(learnerId, e.dedupeKey));
        return keys;
      });
      const existing = lookupKeys.length ? await area.get(lookupKeys) : {};
      const seenIds = new Map<string, unknown>();
      const seenDedupe = new Map<string, string>();
      for (const e of events) {
        const id = String((e as { id?: unknown })?.id ?? '');
        const seq = existing[idKey(learnerId, id)];
        if (seq !== undefined) seenIds.set(id, seq);
        if (typeof e?.dedupeKey === 'string' && e.dedupeKey) {
          const other = existing[dkKey(learnerId, e.dedupeKey)];
          if (typeof other === 'string') seenDedupe.set(e.dedupeKey, other);
        }
      }
      const writes: Record<string, unknown> = {};
      for (const e of events) {
        const issues = validateEvent(e);
        if (issues.length) { out.push({ id: String((e as { id?: unknown })?.id ?? ''), stored: false, issues }); continue; }
        if (e.learnerId !== learnerId) { out.push({ id: e.id, stored: false, issues: [{ path: 'learnerId', message: 'the event belongs to another learner' }] }); continue; }
        if (seenIds.has(e.id)) { out.push({ id: e.id, stored: false, duplicateOf: e.id }); continue; }
        if (e.dedupeKey) {
          const other = seenDedupe.get(e.dedupeKey);
          if (other) { out.push({ id: e.id, stored: false, duplicateOf: other }); continue; }
        }
        head += 1;
        const stored: StoredEvent = { ...e, seq: head, recordedAt: e.recordedAt ?? now() };
        writes[evKey(learnerId, head)] = stored;
        writes[idKey(learnerId, e.id)] = head;
        seenIds.set(e.id, head);
        if (e.dedupeKey) {
          writes[dkKey(learnerId, e.dedupeKey)] = e.id;
          seenDedupe.set(e.dedupeKey, e.id);
        }
        out.push({ id: e.id, stored: true });
      }
      if (Object.keys(writes).length) {
        writes[headKey(learnerId)] = head;
        await area.set(writes);
      }
      return out;
    }),
    list: (filter: EventFilter) => lock.run(async () => {
      const keys = await area.list(`log:ev:${filter.learnerId}:`);
      const rows = keys.length ? await area.get(keys) : {};
      let events = keys.map((k) => rows[k] as StoredEvent).filter(Boolean);
      if (filter.afterSeq !== undefined) events = events.filter((e) => e.seq > (filter.afterSeq as number));
      if (filter.languageId) events = events.filter((e) => e.languageId === filter.languageId);
      if (filter.kinds?.length) events = events.filter((e) => (filter.kinds as string[]).includes(e.kind));
      if (filter.unitId) events = events.filter((e) => e.subject.itemIds?.includes(filter.unitId as string));
      if (filter.since) events = events.filter((e) => e.at >= (filter.since as string));
      return filter.limit ? events.slice(0, filter.limit) : events;
    }),
    get: (learnerId, id) => lock.run(async () => {
      const seq = (await area.get(idKey(learnerId, id)))[idKey(learnerId, id)] as number | undefined;
      if (seq === undefined) return undefined;
      return (await area.get(evKey(learnerId, seq)))[evKey(learnerId, seq)] as StoredEvent | undefined;
    }),
    head: (learnerId) => lock.run(() => readHead(learnerId)),
  };
}

export type { GoEvent };

// ───────────────────────────── typed state ─────────────────────────────

const str = (v: unknown): v is string => typeof v === 'string';

export interface StateStore {
  readonly area: KeyValueArea;
  getSession(): Promise<Session | undefined>;
  setSession(s: Session): Promise<void>;
  clearSession(): Promise<void>;
  getService(): Promise<{ baseUrl: string } | undefined>;
  setService(baseUrl: string | undefined): Promise<void>;
  getSettings(): Promise<Settings>;
  patchSettings(p: Partial<Settings>): Promise<Settings>;
  getProfile(): Promise<Profile | undefined>;
  setProfile(p: Profile): Promise<void>;
  clearProfile(): Promise<void>;
  getActive(learnerId: string): Promise<string | undefined>;
  setActive(learnerId: string, enrolmentId: string): Promise<void>;
  getPrefs(learnerId: string, languageId: string): Promise<ReviewPreferences>;
  setPrefs(learnerId: string, prefs: ReviewPreferences): Promise<ReviewPreferences>;
  /** Changes some of the preferences as one read-and-write, so two controls changing different ones at once cannot overwrite each other. */
  updatePrefs(learnerId: string, languageId: string, patch: Partial<ReviewPreferences>): Promise<ReviewPreferences>;
  getChoices(learnerId: string): Promise<Record<string, CandidateChoice>>;
  setChoice(learnerId: string, unitId: string, choice: CandidateChoice | undefined): Promise<void>;
  /** Everything an account switch must forget: the profile, the active language and the cached candidate lists of that learner. */
  clearCaches(learnerId?: string): Promise<number>;
}

export const clampPrefs = (p: Partial<ReviewPreferences> & { languageId: string }): ReviewPreferences => {
  const d = DEFAULT_PREFERENCES(p.languageId);
  const num = (v: unknown, lo: number, hi: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  return {
    languageId: p.languageId,
    sessionMinutes: p.sessionMinutes === 0 ? 0 : Math.round(num(p.sessionMinutes, 1, 120, d.sessionMinutes)),
    maxNew: Math.round(num(p.maxNew, 0, 50, d.maxNew)),
    desiredRetention: num(p.desiredRetention, 0.7, 0.97, d.desiredRetention),
    includeListening: p.includeListening === true,
    grammarShare: num(p.grammarShare, 0, 1, d.grammarShare),
    prioritizeSaved: p.prioritizeSaved !== false,
    cardsPerDeck: clampDeckSize(p.cardsPerDeck ?? d.cardsPerDeck),
  };
};

export interface SecureSessionStore {
  get(): Promise<Session | undefined>;
  set(session: Session): Promise<void>;
  clear(): Promise<void>;
}

export function createStateStore(area: KeyValueArea, secureSession?: SecureSessionStore): StateStore {
  const read = async <T>(key: string): Promise<T | undefined> => {
    try { return (await area.get(key))[key] as T | undefined; } catch { return undefined; }
  };
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    area,
    async getSession() {
      if (secureSession) { try { return await secureSession.get(); } catch { return undefined; } }
      const v = await read<Record<string, unknown>>(KEYS.session);
      return v && str(v.token) && v.token && str(v.learnerId) && str(v.email) && str(v.expiresAt)
        ? { token: v.token, learnerId: v.learnerId, email: v.email, expiresAt: v.expiresAt, ...(str(v.serviceUrl) ? { serviceUrl: v.serviceUrl } : {}) }
        : undefined;
    },
    setSession: (s) => secureSession ? secureSession.set(s) : area.set({ [KEYS.session]: s }),
    clearSession: () => secureSession ? secureSession.clear() : area.remove(KEYS.session),
    async getService() { const v = await read<{ baseUrl?: unknown }>(KEYS.service); return v && str(v.baseUrl) ? { baseUrl: v.baseUrl } : undefined; },
    async setService(baseUrl) { if (baseUrl) await area.set({ [KEYS.service]: { baseUrl } }); else await area.remove(KEYS.service); },
    async getSettings() { const v = (await read<Record<string, unknown>>(KEYS.settings)) ?? {}; return { remoteSpeechConsent: v.remoteSpeechConsent === true }; },
    patchSettings: (p) => serial(async () => {
      const cur = (await read<Record<string, unknown>>(KEYS.settings)) ?? {};
      const next: Settings = { remoteSpeechConsent: (p.remoteSpeechConsent ?? cur.remoteSpeechConsent) === true };
      await area.set({ [KEYS.settings]: next });
      return next;
    }),
    async getProfile() { const v = await read<Profile>(KEYS.profile); return v && Array.isArray(v.enrolments) && str(v.learnerId) ? v : undefined; },
    setProfile: (p) => area.set({ [KEYS.profile]: p }),
    clearProfile: () => area.remove(KEYS.profile),
    async getActive(learnerId) { const v = await read<ActiveLanguage>(KEYS.active); return v && v.learnerId === learnerId && str(v.enrolmentId) ? v.enrolmentId : undefined; },
    setActive: (learnerId, enrolmentId) => area.set({ [KEYS.active]: { learnerId, enrolmentId } satisfies ActiveLanguage }),
    async getPrefs(learnerId, languageId) {
      const v = await read<Partial<ReviewPreferences>>(prefsKey(learnerId, languageId));
      // once: a record from before cards-per-deck keeps its meaning, as the nearest card count for the minutes it asked for
      if (v && typeof v === 'object' && v.cardsPerDeck === undefined && typeof v.sessionMinutes === 'number') {
        const migrated = clampPrefs({ ...v, languageId, cardsPerDeck: cardsFromMinutes(v.sessionMinutes) });
        try { await area.set({ [prefsKey(learnerId, languageId)]: migrated }); } catch { /* read again next time */ }
        return migrated;
      }
      return clampPrefs({ ...(v ?? {}), languageId });
    },
    updatePrefs: (learnerId, languageId, patch) => serial(async () => {
      const v = await read<Partial<ReviewPreferences>>(prefsKey(learnerId, languageId));
      const migrated = v && v.cardsPerDeck === undefined && typeof v.sessionMinutes === 'number' ? { cardsPerDeck: cardsFromMinutes(v.sessionMinutes) } : {};
      const next = clampPrefs({ ...(v ?? {}), ...migrated, ...patch, languageId });
      await area.set({ [prefsKey(learnerId, languageId)]: next });
      return next;
    }),
    async setPrefs(learnerId, prefs) {
      const next = clampPrefs(prefs);
      await area.set({ [prefsKey(learnerId, next.languageId)]: next });
      return next;
    },
    async getChoices(learnerId) {
      const v = await read<Record<string, unknown>>(choicesKey(learnerId));
      return Object.fromEntries(Object.entries(v ?? {}).filter(([, c]) => c === 'later')) as Record<string, CandidateChoice>;
    },
    setChoice: (learnerId, unitId, choice) => serial(async () => {
      const cur = { ...((await read<Record<string, CandidateChoice>>(choicesKey(learnerId))) ?? {}) };
      if (choice) cur[unitId] = choice; else delete cur[unitId];
      await area.set({ [choicesKey(learnerId)]: cur });
    }),
    async clearCaches(learnerId) {
      await area.remove([KEYS.profile, KEYS.active]);
      let n = 2;
      if (learnerId) n += await removeByPrefix(area, [`gopractice:candidates:${learnerId}:`, `gopractice:snapshot:${learnerId}:`]);
      else n += await removeByPrefix(area, ['gopractice:candidates:', 'gopractice:snapshot:']);
      return n;
    },
  };
}
