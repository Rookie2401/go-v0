/**
 * The unseen-text check (engine package R7; COURSE-AUDIT-2026-10-07 section 4.3 item 11): "am I at B2?" answered honestly.
 *
 * Every CHECK_EVERY finished texts (and at most once in CHECK_MIN_GAP_DAYS) the learner is OFFERED one text he has not seen, at the
 * edge of his reach, and R3's recall prompts (prompts.ts) at the end are the measure. The result is reported as readiness
 * ("Unseen text: 2 of 3 right, 91 % of words known at the start"), never as a level, a grade or a CEFR label, and it changes nothing
 * in his record: the event it leaves, `UnseenCheckRecorded`, is read by `stageReadiness` and the status line and is NOT handled by the
 * folder (it is never item evidence). Reading the text itself is ordinary reading: the reader counts the help he uses as it always does.
 *
 * What is here:
 *   dueForCheck(history)       pure: CHECK_EVERY finished texts since the last check, and 7 days since it.
 *   chooseUnseen(candidates)   pure: the rule for the text (below), deterministic given the candidates.
 *   pickUnseenText(...)        gathers the candidates through the whole-library step (rankWholeLibrary, `reach: true`: coverage by `reachOf`,
 *                              names left out, stale words counting half) and applies the rule. Writes nothing.
 *   startUnseenCheck(...)      picks, HOLDS THE TEXT OUT of recommendation for HELD_OUT_DAYS (heldout.ts) and keeps the pending check.
 *   recordUnseenCheck(...)     validates (readingAssessment.ts `recordUnseenReading`), emits `UnseenCheckRecorded`, clears the pending check.
 *   latestUnseenCheck(...)     the learner's last result (stageReadiness reads it as one report of comprehension).
 *   createUnseenCheckService   the same, bound to the app's store and bus for the UI (UnseenCheck.tsx).
 *
 * THE RULE for the text (CHECK_RULE): reach coverage from 0.88 to 0.95 inclusive; never read, and not from a work he has touched;
 * never Scripture; not a Stage 0 scene; at least 120 words; not testimony, a personal copy or a protected assessment text; authentic or
 * controlled alike. Among those, the one nearest the middle of the band wins, ties broken by a stable hash of the text id.
 */
import type { AdapterRegistry, AppStore, CatalogText, UnseenCheckRecorded, DomainEvent, EventBus, EvidencePolicy, LanguageCode, Text } from '../core';
import { UNSEEN_MIN_WORDS, recordUnseenReading, validateRuntimeUnseenText } from '../course/readingAssessment';
import type { UnseenReadingRecord, UnseenTextFacts } from '../course/readingAssessment';
import { isScripture, isStage0Text, learnerSnapshot, rankWholeLibrary } from './candidates';
import type { WholeLibraryDeps } from './candidates';
import { heldOutIds, holdOut } from './heldout';
import { READINESS, defaultPolicy } from './policy';
import { stableHash } from './prompts';
import type { Ctx } from './state';

export { HELD_OUT_DAYS } from './heldout';

/** A check is due after this many finished texts since the last one. */
export const CHECK_EVERY = 8;
/** ...and never sooner than this many days after the last one. */
export const CHECK_MIN_GAP_DAYS = 7;
/** The band of reach coverage (inclusive) a check text must fall in. */
export const CHECK_BAND = { min: 0.88, max: 0.95 } as const;
export const CHECK_RULE = { ...CHECK_BAND, minWords: UNSEEN_MIN_WORDS } as const;
const DAY_MS = 86_400_000;
/** How many ranked candidates are considered (the whole-library step shortlists 120 at most). */
const CONSIDERED = 120;

// ───────────────────────────── when a check is due ─────────────────────────────

export interface CheckHistory {
  /** ISO time to judge at. */
  now: string;
  /** Explicit completions of texts ("I have finished reading"), any number of them per text. */
  completions: ReadonlyArray<{ textId: string; at: string }>;
  /** Earlier checks: the text and the time of each result. A check's own text never counts as a finished text. */
  checks: ReadonlyArray<{ textId: string; at: string }>;
  /** A check that has been started and not yet answered: its text does not count either. */
  pendingTextId?: string;
}

/** Distinct finished texts since the last check (the texts of checks excluded). */
export function finishedSinceLastCheck(h: CheckHistory): number {
  const lastAt = h.checks.reduce<string | undefined>((m, c) => (m === undefined || c.at > m ? c.at : m), undefined);
  const own = new Set([...h.checks.map((c) => c.textId), ...(h.pendingTextId ? [h.pendingTextId] : [])]);
  const seen = new Set<string>();
  for (const c of h.completions) if (!own.has(c.textId) && (lastAt === undefined || c.at > lastAt)) seen.add(c.textId);
  return seen.size;
}

/** Due when CHECK_EVERY texts were finished since the last check and at least CHECK_MIN_GAP_DAYS have passed since it. Never due while one is pending. */
export function dueForCheck(h: CheckHistory): boolean {
  if (h.pendingTextId) return false;
  const now = Date.parse(h.now);
  if (Number.isNaN(now)) return false;
  const lastAt = h.checks.reduce<string | undefined>((m, c) => (m === undefined || c.at > m ? c.at : m), undefined);
  if (lastAt !== undefined && now - Date.parse(lastAt) < CHECK_MIN_GAP_DAYS * DAY_MS) return false;
  return finishedSinceLastCheck(h) >= CHECK_EVERY;
}

// ───────────────────────────── which text ─────────────────────────────

export interface UnseenCandidate {
  textId: string;
  title: string;
  workId?: string;
  stageId?: string;
  words: number;
  /** Reach coverage (names left out, stale words counting half), 0..1. */
  coverage: number;
  scripture: boolean;
  stage0?: boolean;
  /** Fails the runtime validators (readingAssessment.ts): testimony, a personal copy, a protected assessment text, too short. */
  ineligible?: boolean;
  /** He has read it, or a text of its work, or it is held out already. */
  seen: boolean;
}

const MID = (CHECK_BAND.min + CHECK_BAND.max) / 2;

/** The rule (see the header). Pure and deterministic: the same candidates give the same text, in whatever order they come. */
export function chooseUnseen(candidates: readonly UnseenCandidate[]): UnseenCandidate | undefined {
  return candidates
    .filter((c) => !c.scripture && !c.stage0 && !c.ineligible && !c.seen && c.words >= CHECK_RULE.minWords && c.coverage >= CHECK_BAND.min && c.coverage <= CHECK_BAND.max)
    .sort((a, b) => Math.abs(a.coverage - MID) - Math.abs(b.coverage - MID) || stableHash(`unseen|${a.textId}`) - stableHash(`unseen|${b.textId}`) || (a.textId < b.textId ? -1 : 1))[0];
}

/** The ranked candidates of the whole library for this learner, as check candidates. */
export async function unseenCandidates(ctx: Ctx, userId: string, lang: LanguageCode, deps: WholeLibraryDeps = {}): Promise<UnseenCandidate[]> {
  const snap = await learnerSnapshot(ctx, userId, lang);
  const held = await heldOutIds(ctx, userId, ctx.clock());
  const result = await rankWholeLibrary(ctx, userId, deps, { lang, reach: true, snapshot: snap, limit: CONSIDERED, size: CONSIDERED });
  const stored = await ctx.store.texts.getMany(result.picks.map((p) => p.row.id));
  const out: UnseenCandidate[] = [];
  result.picks.forEach((p, i) => {
    const row: CatalogText = p.row;
    const text: Text | undefined = stored[i];
    const coverage = p.ranked.reach?.coverage;
    if (coverage === undefined) return;
    const facts: UnseenTextFacts = {
      id: row.id, lang: row.lang, words: row.features.words, workId: row.workId ?? text?.workId,
      ...(text ? { kind: text.kind, personalCopy: text.personalCopy, editorialTags: text.editorialTags, readingAssessmentId: text.readingAssessmentId, listeningAssessmentId: text.listeningAssessmentId } : {}),
    };
    const seen = p.alreadyRead || snap.started.has(row.id) || snap.completed.has(row.id) || (row.workId !== undefined && snap.touchedWorks.has(row.workId)) || held.has(row.id);
    const invalid = validateRuntimeUnseenText({ userId, text: facts, encounteredTextIds: new Set(), heldOut: true }).length > 0;
    out.push({
      textId: row.id, title: row.title, workId: row.workId, stageId: row.stageId, words: row.features.words, coverage,
      scripture: isScripture(row) || text?.kind === 'scripture', stage0: text ? isStage0Text(text) : false, ineligible: invalid, seen,
    });
  });
  return out;
}

/** The text a check would use now, or undefined when nothing is at his reach. Writes nothing. */
export async function pickUnseenText(ctx: Ctx, userId: string, lang: LanguageCode, now: string, deps: WholeLibraryDeps = {}): Promise<UnseenCandidate | undefined> {
  return chooseUnseen(await unseenCandidates({ ...ctx, clock: () => now }, userId, lang, deps));
}

// ───────────────────────────── a check in progress, and its result ─────────────────────────────

export interface PendingCheck {
  textId: string;
  title: string;
  lang: LanguageCode;
  coverageAtPick: number;
  words: number;
  pickedAt: string;
  heldUntil: string;
  stageId?: string;
}
const pendingId = (userId: string, lang: LanguageCode) => `unseen-check:${encodeURIComponent(userId)}:${lang}`;

export async function pendingCheck(ctx: Pick<Ctx, 'store'>, userId: string, lang: LanguageCode, now: string): Promise<PendingCheck | undefined> {
  const row = await ctx.store.meta.get(pendingId(userId, lang));
  if (!row) return undefined;
  try {
    const p = JSON.parse(row.value) as PendingCheck;
    return Date.parse(p.heldUntil) > Date.parse(now) ? p : undefined; // a check left for the whole hold-out is let go
  } catch { return undefined; }
}

/** Picks a text, holds it out of recommendation for HELD_OUT_DAYS and keeps it as the pending check. Returns the existing pending check if there is one. */
export async function startUnseenCheck(ctx: Ctx, userId: string, lang: LanguageCode, now: string, deps: WholeLibraryDeps = {}, stageId?: string): Promise<PendingCheck | undefined> {
  const existing = await pendingCheck(ctx, userId, lang, now);
  if (existing) return existing;
  const pick = await pickUnseenText(ctx, userId, lang, now, deps);
  if (!pick) return undefined;
  const heldUntil = await holdOut(ctx, userId, pick.textId, now);
  const p: PendingCheck = { textId: pick.textId, title: pick.title, lang, coverageAtPick: pick.coverage, words: pick.words, pickedAt: now, heldUntil, ...(stageId ? { stageId } : {}) };
  await ctx.store.meta.put({ id: pendingId(userId, lang), value: JSON.stringify(p), updatedAt: now });
  return p;
}

/** Lets a pending check go without a result (the text stays held out). */
export async function abandonUnseenCheck(ctx: Pick<Ctx, 'store'>, userId: string, lang: LanguageCode, now: string): Promise<void> {
  await ctx.store.meta.delete(pendingId(userId, lang));
  void now;
}

export interface UnseenCheckResult {
  textId: string;
  promptsRight: number;
  promptsTotal: number;
  coverageAtPick: number;
  at: string;
  stageId?: string;
}

/** "Unseen text: 2 of 3 right, 91 % of words known at the start". Reading data, never a level. */
export function checkResultLine(r: Pick<UnseenCheckResult, 'promptsRight' | 'promptsTotal' | 'coverageAtPick'>): string {
  return `Unseen text: ${r.promptsRight} of ${r.promptsTotal} right, ${Math.round(r.coverageAtPick * 100)} % of words known at the start`;
}

/**
 * The report a check stands for in `stageReadiness` (reported-comprehension): 'most' when the share right reaches the share the signal asks of
 * a learner's reports, otherwise 'some' from one half, else 'little'. These are the degrees of the four-button report, not levels of anything.
 */
export function reportedByCheck(r: Pick<UnseenCheckResult, 'promptsRight' | 'promptsTotal'>): 'most' | 'some' | 'little' {
  const share = r.promptsTotal > 0 ? r.promptsRight / r.promptsTotal : 0;
  return share >= READINESS.reportedComprehension.share ? 'most' : share >= 0.5 ? 'some' : 'little';
}

/** Records the result as an `UnseenCheckRecorded` event and ends the pending check. Throws when the numbers or the text do not qualify. */
export async function recordUnseenCheck(
  ctx: Pick<Ctx, 'store' | 'bus'>, userId: string, pending: PendingCheck, promptsRight: number, promptsTotal: number, now: string,
): Promise<{ result: UnseenCheckResult; record: UnseenReadingRecord }> {
  const record = recordUnseenReading(
    { userId, text: { id: pending.textId, lang: pending.lang, words: pending.words }, encounteredTextIds: new Set(), heldOut: true },
    { promptsRight, promptsTotal, coverageAtPick: pending.coverageAtPick }, now,
  );
  await ctx.bus.emit<UnseenCheckRecorded>({
    type: 'UnseenCheckRecorded', userId, lang: pending.lang, surface: 'home', session: `unseen-check:${pending.pickedAt}`,
    dedupeKey: `unseencheck:${userId}:${pending.textId}:${pending.pickedAt}`, at: now,
    textId: pending.textId, promptsRight, promptsTotal, coverageAtPick: pending.coverageAtPick, ...(pending.stageId ? { stageId: pending.stageId } : {}),
  });
  await ctx.store.meta.delete(pendingId(userId, pending.lang));
  return { result: { textId: pending.textId, promptsRight, promptsTotal, coverageAtPick: pending.coverageAtPick, at: now, ...(pending.stageId ? { stageId: pending.stageId } : {}) }, record };
}

const isCheck = (e: DomainEvent): e is UnseenCheckRecorded => e.type === 'UnseenCheckRecorded';

/** Every result of this learner in this language, oldest first. */
export async function unseenChecks(ctx: Pick<Ctx, 'store'>, userId: string, lang: LanguageCode): Promise<UnseenCheckResult[]> {
  const rows = (await ctx.store.events.where('type', 'UnseenCheckRecorded')).filter(isCheck).filter((e) => e.userId === userId && e.lang === lang);
  return rows
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1))
    .map((e) => ({ textId: e.textId, promptsRight: e.promptsRight, promptsTotal: e.promptsTotal, coverageAtPick: e.coverageAtPick, at: e.at, ...(e.stageId ? { stageId: e.stageId } : {}) }));
}
export async function latestUnseenCheck(ctx: Pick<Ctx, 'store'>, userId: string, lang: LanguageCode): Promise<UnseenCheckResult | undefined> {
  const all = await unseenChecks(ctx, userId, lang);
  return all[all.length - 1];
}

/** What `dueForCheck` needs, from the store. */
export async function loadCheckHistory(ctx: Pick<Ctx, 'store'>, userId: string, lang: LanguageCode, now: string): Promise<CheckHistory> {
  const completions = (await ctx.store.events.where('type', 'TextCompleted'))
    .filter((e) => e.type === 'TextCompleted' && e.userId === userId && e.lang === lang)
    .map((e) => ({ textId: (e as Extract<DomainEvent, { type: 'TextCompleted' }>).textId, at: e.at }));
  const checks = (await unseenChecks(ctx, userId, lang)).map((c) => ({ textId: c.textId, at: c.at }));
  const pending = await pendingCheck(ctx, userId, lang, now);
  return { now, completions, checks, ...(pending ? { pendingTextId: pending.textId } : {}) };
}

// ───────────────────────────── the service the UI uses ─────────────────────────────

export interface UnseenCheckStatus {
  due: boolean;
  pending?: PendingCheck;
  last?: UnseenCheckResult;
}
export interface UnseenCheckService {
  status(userId: string, lang: LanguageCode): Promise<UnseenCheckStatus>;
  /** Picks and holds out a text. Undefined when nothing is at his reach. */
  start(userId: string, lang: LanguageCode, stageId?: string): Promise<PendingCheck | undefined>;
  record(userId: string, pending: PendingCheck, promptsRight: number, promptsTotal: number): Promise<UnseenCheckResult>;
  abandon(userId: string, lang: LanguageCode): Promise<void>;
}

export interface UnseenCheckServiceDeps {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  policy?: EvidencePolicy;
  clock?: () => string;
  /** Wait for the fold before reading (GoLearn's `settled`). */
  settled?: () => Promise<void>;
  library?: WholeLibraryDeps;
}

/** The check bound to a store and a bus. Its engine context reads the event log directly (a check is rare; nothing here needs the folder's index). */
export function createUnseenCheckService(deps: UnseenCheckServiceDeps): UnseenCheckService {
  const clock = deps.clock ?? (() => new Date().toISOString());
  const ctx: Ctx = {
    store: deps.store, bus: deps.bus, adapters: deps.adapters, policy: deps.policy ?? defaultPolicy, clock, listening: false,
    userLog: async (userId) => ({ events: await deps.bus.history({ userId }), sittings: { get: () => undefined }, byText: new Map() }),
  };
  const settle = async () => { try { await deps.settled?.(); } catch { /* reading waits for the fold; not waiting is only less current */ } };
  return {
    async status(userId, lang) {
      await settle();
      const now = clock();
      const [history, pending, last] = await Promise.all([loadCheckHistory(ctx, userId, lang, now), pendingCheck(ctx, userId, lang, now), latestUnseenCheck(ctx, userId, lang)]);
      return { due: dueForCheck(history), ...(pending ? { pending } : {}), ...(last ? { last } : {}) };
    },
    async start(userId, lang, stageId) {
      await settle();
      return startUnseenCheck(ctx, userId, lang, clock(), deps.library, stageId);
    },
    async record(userId, pending, promptsRight, promptsTotal) {
      await settle();
      return (await recordUnseenCheck(ctx, userId, pending, promptsRight, promptsTotal, clock())).result;
    },
    abandon: (userId, lang) => abandonUnseenCheck(ctx, userId, lang, clock()),
  };
}

