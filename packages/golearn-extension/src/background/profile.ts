/**
 * The learner model as the reader sees it. `knowledgeFor(unitIds)` asks the Repository (`GET /knowledge?unitIds=`) and
 * caches each unit's row, found or not, in `chrome.storage.session` (cleared when the browser closes; a content script
 * cannot read it) with a 10-minute lifetime. After each successful sync the cached units are re-fetched, so what
 * GoPractice changed reaches the reader on the next lookup. Rows are shaped for the content script: the seven
 * dimensions, never a learner id.
 */
import type { Dimension, UnitKnowledge } from '../../../repository-contract/src';
import type { StorageArea } from '../platform';
import { isDepth, isLanguageId, isUnitId, type DimView, type ExplanationDepth, type KnowledgeView, type PrivacySettings, type ProfileReply } from '../protocol';
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
    if (!a) return cached && isDepth(cached.depth) ? { depth: cached.depth, origin: cached.origin, stale: true } : { depth: 'brief', origin: 'default' };
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
    return cached && isDepth(cached.depth) ? { depth: cached.depth, origin: cached.origin, stale: true } : { depth: 'brief', origin: 'default' };
  }

  async function knowledgeFor(unitIds: unknown, languageId: string): Promise<ProfileReply> {
    // A request that names more than four words comes from a long selection: it asks for lemma ids only, never the page's raw words (./wordids).
    const ids = limitWordIds([...new Set(Array.isArray(unitIds) ? unitIds.filter(isUnitId) : [])]).ids.slice(0, MAX_IDS_PER_REQUEST);
    const st = await opts.session.status();
    const d = await depthFor(languageId);
    const base = { depth: d.depth, depthOrigin: d.origin } as const;
    if (!st.connected) return { ok: true, connected: false, rows: {}, ...base };
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
    if (!a) return { ok: true, connected: true, stale: true, rows: { ...out, ...staleRows }, error: 'needs-sign-in', ...base };
    try {
      const got = await fetchRows(a.api, missing);
      if (!got.ok) return { ok: true, connected: true, stale: true, rows: { ...out, ...staleRows }, error: got.status === 401 ? 'needs-sign-in' : got.error, ...base };
      await remember(missing, got.rows);
      for (const id of missing) { const r = got.rows.get(id); if (r) out[id] = r; }
      return { ok: true, connected: true, rows: out, ...base };
    } catch {
      return { ok: true, connected: true, stale: true, rows: { ...out, ...staleRows }, error: 'offline', ...base };
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
