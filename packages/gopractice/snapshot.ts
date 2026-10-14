/**
 * The offline snapshot: what GoReview keeps on the device, per learner and language, so the home, My vocab and Previous decks
 * render with no network (an iPhone on a train, a closed laptop at home).
 *
 * Most of GoReview is already local: the learner's events live in their own log (`u:<learner>:log:*`), the saved decks and the
 * preferences under their own keys, the profile and the last candidate list likewise. What the Repository answers and a phone
 * cannot reach offline is its VOCABULARY list and the INTAKE outcomes (which need pack facts), so without help the offline home
 * says "Read with GoLearn to build your first deck" and My vocab says it could not load. The snapshot holds exactly those, written
 * every time they were loaded successfully:
 *
 *   gopractice:snapshot:<learner>:<language>  { v: 1, savedAt, vocab?, model?: { outcomes, knowledge, savedAt }, decks?, prefs? }
 *
 * `decks` and `prefs` are copies of the records the app keeps under their own keys; they are used only to bring back a record that
 * is missing (a storage that lost one key), never to override a record that is there. A failed write (a full storage) is ignored.
 */
import type { UnitKnowledge } from '../repository-contract/src';
import type { IntakeOutcome, ReviewPreferences } from '../goreview/src/types';
import type { AppContext } from './context';
import { snapshotKey } from './state';

/** Most words kept: a phone's storage is small, and the list is a fallback, not the source. */
export const MAX_SNAPSHOT_WORDS = 6000;

export interface SnapshotVocabRow { unitId: string; label: string; level: string; encounters: number; lastSeenAt?: string; metAs?: string[]; kind?: string; unitIds?: string[] }

export interface ReviewSnapshot {
  v: 1;
  savedAt: string;
  vocab?: { savedAt: string; rows: SnapshotVocabRow[] };
  model?: { savedAt: string; outcomes: IntakeOutcome[]; knowledge: UnitKnowledge[] };
  decks?: unknown;
  prefs?: ReviewPreferences;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A damaged or foreign record reads as "no snapshot". */
export async function readSnapshot(ctx: AppContext, learnerId: string, languageId: string): Promise<ReviewSnapshot | undefined> {
  const key = snapshotKey(learnerId, languageId);
  try {
    const raw = (await ctx.deps.area.get(key))[key];
    if (!isObj(raw) || raw.v !== 1 || typeof raw.savedAt !== 'string') return undefined;
    const out: ReviewSnapshot = { v: 1, savedAt: raw.savedAt };
    if (isObj(raw.vocab) && Array.isArray(raw.vocab.rows) && typeof raw.vocab.savedAt === 'string') out.vocab = raw.vocab as unknown as NonNullable<ReviewSnapshot['vocab']>;
    if (isObj(raw.model) && Array.isArray(raw.model.outcomes) && typeof raw.model.savedAt === 'string') {
      out.model = { savedAt: raw.model.savedAt, outcomes: raw.model.outcomes as IntakeOutcome[], knowledge: Array.isArray(raw.model.knowledge) ? raw.model.knowledge as UnitKnowledge[] : [] };
    }
    if (raw.decks !== undefined) out.decks = raw.decks;
    if (isObj(raw.prefs)) out.prefs = raw.prefs as unknown as ReviewPreferences;
    return out;
  } catch { return undefined; }
}

/** What this page last wrote, per storage area: an unchanged snapshot is not written again. */
const memos = new WeakMap<object, Map<string, string>>();
const memoOf = (ctx: AppContext): Map<string, string> => { let m = memos.get(ctx.deps.area); if (!m) { m = new Map(); memos.set(ctx.deps.area, m); } return m; };

/** Merges `patch` into the snapshot and writes it (skipped when nothing changed since this page last wrote it). Never throws. */
export async function writeSnapshot(ctx: AppContext, learnerId: string, languageId: string, patch: Partial<Pick<ReviewSnapshot, 'vocab' | 'model'>>): Promise<void> {
  try {
    const key = snapshotKey(learnerId, languageId);
    const cur = (await readSnapshot(ctx, learnerId, languageId)) ?? { v: 1 as const, savedAt: '' };
    const decksKey = `gopractice:decks:${learnerId}:${languageId}`;
    const prefs = await ctx.state.getPrefs(learnerId, languageId);
    const decks = (await ctx.deps.area.get(decksKey))[decksKey];
    const next: ReviewSnapshot = { ...cur, ...patch, v: 1, savedAt: ctx.deps.now().toISOString(), prefs, ...(decks !== undefined ? { decks } : {}) };
    // the signature leaves the timestamps out: only a real change is worth a write
    const sig = JSON.stringify({ ...next, savedAt: 0, vocab: next.vocab && { ...next.vocab, savedAt: 0 }, model: next.model && { ...next.model, savedAt: 0 } });
    const memo = memoOf(ctx);
    if (memo.get(key) === sig && cur.savedAt) return;
    await ctx.deps.area.set({ [key]: next });
    memo.set(key, sig);
  } catch { /* a full or blocked storage: the app works without its snapshot */ }
}

/** Brings back a saved-decks record or preferences that the area lost but the snapshot still holds. Never replaces one that is there. */
export async function restoreMissing(ctx: AppContext, learnerId: string, languageId: string): Promise<void> {
  try {
    const snap = await readSnapshot(ctx, learnerId, languageId);
    if (!snap) return;
    const area = ctx.deps.area;
    const decksKey = `gopractice:decks:${learnerId}:${languageId}`;
    const prefsKey = `gopractice:prefs:${learnerId}:${languageId}`;
    const have = await area.get([decksKey, prefsKey]);
    const put: Record<string, unknown> = {};
    if (have[decksKey] === undefined && snap.decks !== undefined) put[decksKey] = snap.decks;
    if (have[prefsKey] === undefined && snap.prefs) put[prefsKey] = snap.prefs;
    if (Object.keys(put).length) await area.set(put);
  } catch { /* nothing to restore */ }
}
