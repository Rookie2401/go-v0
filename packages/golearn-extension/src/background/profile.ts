/**
 * The learner model as the reader sees it. `knowledgeFor(unitIds)` asks the Repository (`GET /knowledge?unitIds=`) and
 * caches each unit's row, found or not, in `chrome.storage.session` (cleared when the browser closes; a content script
 * cannot read it) with a 10-minute lifetime. After each successful sync the cached units are re-fetched, so what
 * GoPractice changed reaches the reader on the next lookup. Rows are shaped for the content script: the seven
 * dimensions, never a learner id.
 *
 * With no account (no session) the rows come from the device's own Repository (`local`), and the reply says so (`source: 'device'`, `connected: false`).
 * With an account, the service answers as before; when it cannot be reached (offline, signed out, refused) the units the cache does not hold are read from the
 * device's Repository instead, so the card still has its learner-model lines.
 */
import type { Dimension, UnitKnowledge } from '../../../repository-contract/src';
import type { StorageArea } from '../platform';
import { isDepth, isLanguageId, isUnitId, type DimView, type ExplanationDepth, type KnowledgeView, type PrivacySettings, type ProfileReply } from '../protocol';
import type { LocalKnowledge } from './localRepo';
import type { SessionManager } from './session';
import { limitWordIds } from './wordids';

export const KNOWLEDGE_PREFIX = 'golearn:know:';
export const KNOWLEDGE_INDEX = 'golearn:know-index';
export const PREFS_PREFIX = 'golearn:prefs:';
export const PROFILE_TTL_MS = 10 * 60_000;
const MAX_IDS_PER_REQUEST = 60;
const MAX_INDEX = 200;
const FETCH_CHUNK = 100;

interface CachedRow { at: number; row: KnowledgeView | null }
interface CachedPrefs { at: number; depth: ExplanationDepth; origin: 'explicit' | 'inferred' | 'default' }

export interface ProfileServiceOptions {
  /** `chrome.storage.session` when it exists, else `chrome.storage.local` (the TTL applies either way). */
  area: StorageArea;
  session: SessionManager;
  settings: () => Promise<PrivacySettings>;
  now?: () => number;
  ttlMs?: number;
  /** The device's own Repository (absent: the card's model lines need an account, as before). */
  local?: LocalKnowledge;
}

/** UnitKnowledge -> the compact row a content script may hold. */
export function compactKnowledge(k: UnitKnowledge): KnowledgeView {
  const dims: Partial<Record<Dimension, DimView>> = {};
  for (const [name, d] of Object.entries(k.dimensions ?? {})) {
    if (!d || typeof d !== 'object') continue;
    const e = d as unknown as Record<string, unknown>;
    const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    dims[name as Dimension] = { score: n(e.score), confidence: n(e.confidence), observations: n(e.observations), positive: n(e.positive), negative: n(e.negative) };
  }
  return { unitId: k.unitId, dimensions: dims, ...(typeof k.lastSeenAt === 'string' ? { lastSeenAt: k.lastSeenAt } : {}) };
}

export function createProfileService(opts: ProfileServiceOptions) {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? PROFILE_TTL_MS;
  const { area } = opts;

  async function remember(ids: string[], rows: Map<string, KnowledgeView | null>): Promise<void> {
    const at = now();
    const items: Record<string, unknown> = {};
    for (const id of ids) items[KNOWLEDGE_PREFIX + id] = { at, row: rows.get(id) ?? null } satisfies CachedRow;
    // a damaged index (anything but a list of strings) is ignored and rebuilt from this call (audit O-04); the rows the service answered are kept
    const stored = (await area.get(KNOWLEDGE_INDEX))[KNOWLEDGE_INDEX];
    const prev = Array.isArray(stored) ? stored.filter((x): x is string => typeof x === 'string') : [];
    items[KNOWLEDGE_INDEX] = [...ids, ...prev.filter((p) => !ids.includes(p))].slice(0, MAX_INDEX);
    await area.set(items);
  }

  async function fetchRows(api: NonNullable<Awaited<ReturnType<SessionManager['authenticated']>>>['api'], ids: string[]): Promise<{ ok: true; rows: Map<string, KnowledgeView | null> } | { ok: false; status: number; error: string }> {
    const rows = new Map<string, KnowledgeView | null>(ids.map((i) => [i, null]));
    for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
      const r = await api.knowledge(ids.slice(i, i + FETCH_CHUNK));
      if (!r.ok) return { ok: false, status: r.status, error: r.error };
      for (const k of r.data.knowledge ?? []) if (k && isUnitId(k.unitId)) rows.set(k.unitId, compactKnowledge(k));
    }
    return { ok: true, rows };
  }

  /** The effective explanation depth: the learner's explicit override in settings, else the Repository's preference, else 'brief'. */
  async function depthFor(languageId: string): Promise<{ depth: ExplanationDepth; origin: ProfileReply['depthOrigin']; stale?: boolean }> {
    const s = await opts.settings();
    if (s.explanationDepth && isDepth(s.explanationDepth)) return { depth: s.explanationDepth, origin: 'settings' };
    if (!isLanguageId(languageId)) return { depth: 'brief', origin: 'default' };
    const key = PREFS_PREFIX + languageId;
    const cached = (await area.get(key))[key] as CachedPrefs | undefined;
    if (cached && now() - cached.at < ttl && isDepth(cached.depth)) return { depth: cached.depth, origin: cached.origin };
    const a = await opts.session.authenticated();
    if (!a) {
      const mine = await localDepth(languageId);
      if (mine) return mine;
      return cached && isDepth(cached.depth) ? { depth: cached.depth, origin: cached.origin, stale: true } : { depth: 'brief', origin: 'default' };
    }
    try {
      const r = await a.api.preferences(languageId);
      if (r.ok) {
        const p = r.data.preferences?.explanationDepth;
        if (p && isDepth(p.value)) {
          const origin = p.origin === 'explicit' || p.origin === 'inferred' ? p.origin : 'default';
          await area.set({ [key]: { at: now(), depth: p.value, origin } satisfies CachedPrefs });
          return { depth: p.value, origin };
        }
      }
    } catch { /* fall through to the cached or default value */ }
    if (cached && isDepth(cached.depth)) return { depth: cached.depth, origin: cached.origin, stale: true };
    return (await localDepth(languageId)) ?? { depth: 'brief', origin: 'default' };
  }

  /** The explanation depth the device's own Repository infers (or the learner set) for a language. */
  async function localDepth(languageId: string): Promise<{ depth: ExplanationDepth; origin: ProfileReply['depthOrigin'] } | undefined> {
    const p = (await opts.local?.preferences(languageId))?.explanationDepth;
    if (!p || !isDepth(p.value)) return undefined;
    return { depth: p.value, origin: p.origin === 'explicit' || p.origin === 'inferred' ? p.origin : 'default' };
  }

  /** The compact rows of the device's own Repository for these units; undefined when there is none. */
  async function deviceRows(ids: string[]): Promise<Record<string, KnowledgeView> | undefined> {
    if (!opts.local) return undefined;
    const k = await opts.local.knowledge(ids);
    if (!k) return undefined;
    const out: Record<string, KnowledgeView> = {};
    for (const row of k) if (row && isUnitId(row.unitId)) out[row.unitId] = compactKnowledge(row);
    return out;
  }

  /** The service could not answer: what the cache holds, and for the units it does not hold, what this device knows. */
  async function unreached(ids: string[], held: Record<string, KnowledgeView>, error: string, base: { depth: ExplanationDepth; depthOrigin: ProfileReply['depthOrigin'] }): Promise<ProfileReply> {
    const missing = ids.filter((i) => !held[i]);
    const mine = missing.length ? await deviceRows(missing) : undefined;
    const rows = { ...(mine ?? {}), ...held };
    return { ok: true, connected: true, stale: true, rows, error, ...(mine && Object.keys(mine).length ? { source: 'device' as const } : {}), ...base };
  }

  /**
   * `how.deviceOnly` (GoLearn Active's scan): the words on the learner's screen, asked by the learner's own switch. They are not trimmed
   * like a long selection (the scan is exactly a reading of the page, by design) and they are answered from the device's own Repository
   * only: the service is never asked, so no word of the page leaves the device. The account's history is in the device Repository too
   * (pulled at sign-in and after each sync).
   */
  async function knowledgeFor(unitIds: unknown, languageId: string, how: { deviceOnly?: boolean } = {}): Promise<ProfileReply> {
    const valid = [...new Set(Array.isArray(unitIds) ? unitIds.filter(isUnitId) : [])];
    // A request that names more than four words comes from a long selection: it asks for lemma ids only, never the page's raw words (./wordids).
    const ids = (how.deviceOnly ? valid : limitWordIds(valid).ids).slice(0, MAX_IDS_PER_REQUEST);
    const st = await opts.session.status();
    const d = await depthFor(languageId);
    const base = { depth: d.depth, depthOrigin: d.origin } as const;
    if (how.deviceOnly) {
      const rows = await deviceRows(ids);
      return { ok: true, connected: st.connected, source: 'device', rows: rows ?? {}, ...(rows ? {} : { error: 'device-unavailable' }), ...base };
    }
    if (!st.connected) {
      const rows = await deviceRows(ids);
      return rows ? { ok: true, connected: false, source: 'device', rows, ...base } : { ok: true, connected: false, rows: {}, ...base };
    }
    const keys = ids.map((i) => KNOWLEDGE_PREFIX + i);
    const cache = keys.length ? await area.get(keys) : {};
    const out: Record<string, KnowledgeView> = {};
    const missing: string[] = [];
    const staleRows: Record<string, KnowledgeView> = {};
    for (const id of ids) {
      const c = cache[KNOWLEDGE_PREFIX + id] as CachedRow | undefined;
      if (c && now() - c.at < ttl) { if (c.row) out[id] = c.row; }
      else { missing.push(id); if (c?.row) staleRows[id] = c.row; }
    }
    if (!missing.length) return { ok: true, connected: true, rows: out, ...base };
    const a = await opts.session.authenticated();
    if (!a) return unreached(ids, { ...out, ...staleRows }, 'needs-sign-in', base);
    try {
      const got = await fetchRows(a.api, missing);
      if (!got.ok) return unreached(ids, { ...out, ...staleRows }, got.status === 401 ? 'needs-sign-in' : got.error, base);
      await remember(missing, got.rows);
      for (const id of missing) { const r = got.rows.get(id); if (r) out[id] = r; }
      return { ok: true, connected: true, rows: out, ...base };
    } catch {
      return unreached(ids, { ...out, ...staleRows }, 'offline', base);
    }
  }

  /** After a successful sync: re-fetch every cached unit (the Repository has folded the new events) and drop the preference cache. */
  async function refreshAfterSync(): Promise<number> {
    const a = await opts.session.authenticated();
    if (!a) return 0;
    const index = (await area.get(KNOWLEDGE_INDEX))[KNOWLEDGE_INDEX];
    const ids = Array.isArray(index) ? index.filter((x): x is string => typeof x === 'string' && isUnitId(x)) : [];
    const all = await area.get(null);
    const prefKeys = Object.keys(all).filter((k) => k.startsWith(PREFS_PREFIX));
    if (prefKeys.length) await area.remove(prefKeys);
    if (!ids.length) return 0;
    const got = await fetchRows(a.api, ids);
    if (!got.ok) return 0;
    await remember(ids, got.rows);
    return ids.length;
  }

  /** Forget everything cached (sign-out, delete). */
  async function clear(): Promise<void> {
    const all = await area.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(KNOWLEDGE_PREFIX) || k === KNOWLEDGE_INDEX || k.startsWith(PREFS_PREFIX));
    if (keys.length) await area.remove(keys);
  }

  return { knowledgeFor, depthFor, refreshAfterSync, clear };
}

export type ProfileService = ReturnType<typeof createProfileService>;
