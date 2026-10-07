/**
 * Whole-library candidate search: "of EVERYTHING this learner may open, which few texts deserve a close look?"
 *
 * Two steps, so that a library of tens of thousands of texts costs a few thousand cheap row tests and about a hundred profiles:
 *
 *  1. PREFILTER on catalogue-index features alone (words, stage, stream / domain / genre, era and variety, the Scripture flag,
 *     whether he has read it or its work, whether he read it lately). The catalogue is walked page by page (`CANDIDATES.pageSize`
 *     rows at a time through a `CatalogPager`: `Library.search` in the app, the posting-list search over the store here) and
 *     only bounded pools are kept, so memory is one page plus a few hundred rows, however large the library is. No profile is read.
 *     The shortlist (`CANDIDATES.shortlist`, 120) is assembled to be MIXED, deliberately:
 *       - Scripture takes at most `scriptureShare` of it (25 %) unless nothing else is left to fill it;
 *       - no one domain takes more than `domainShare` of it (40 %); the rest is dealt round-robin across domains;
 *       - a few places are reserved for the learner's stated interests, for works he has not touched, and for a handful of
 *         stable-hash "wildcards" the prefilter would never have favoured (so a text outside his shelf can still be found);
 *       - nothing is excluded for being "off his shelf": stage is a soft preference, never a gate.
 *  2. PERSONAL RANKING (`rankLibrary`, rank.ts) of the profiled shortlist: his actual known words, constructions, previous
 *     encounters and interests, plus the whole-library factors (useful unknown vocabulary, overdue vocabulary, variety of domain,
 *     listening availability).
 *
 * What may never appear (checked here, page by page, so excluded rows do not take shortlist places): testimony (a text of kind
 * `testimony` or in a testimony corpus), held-out assessment texts (`listeningAssessmentId`, `readingAssessmentId`, a curriculum
 * `assessment` role), and, outside preview mode, anything unpublished.
 *
 * EVIDENCE RULES (evidence@8, guarded by test/golearn/listeningAudit.test.ts): "read" means READ. It comes from reading events
 * (`SentenceViewed`, a reading `ComprehensionReported`, `TextCompleted`), never from any-modality encounters, so a text only
 * heard is not read. Listening availability is offered to the ranking only for a learner who has CREDITED listening encounters (synthetic
 * speech never makes one), and only for a text with a lawful reviewed HUMAN recording (`hasHumanReviewedRecording` + GoListen's
 * `audioEligible`), exactly as `recommend` requires.
 */
import type { CatalogText, LanguageCode, LibraryQuery, Text, TextProfile } from '../core';
import { searchCatalog } from '../library/postings';
import { cachedProfile } from '../library/store-index';
import { hasHumanReviewedRecording } from './eligibility';
import { CANDIDATES, REACH } from './policy';
import { domainOf, rankLibrary } from './rank';
import type { RankCandidateWhole, RankedTextWhole } from './rank';
import type { Ctx } from './state';
import { cmp } from './util';

/** One page of the catalogue: `Library.search` in the app (any `LibraryQuery`; `limit` at most 200). */
export type CatalogPager = (q: LibraryQuery) => Promise<{ total: number; items: CatalogText[] }>;
/** The profile of a catalogued text (`Library.profile` in the app); undefined ⇒ the text cannot be scored and is not offered. */
export type ProfileSource = (textId: string) => Promise<TextProfile | undefined>;

// ───────────────────────────── what the learner has done ─────────────────────────────

/** Everything the prefilter and the signals need to know about the learner, gathered once. READING facts only. */
export interface LearnerSnapshot {
  lang: LanguageCode;
  /** An explicit `TextCompleted`. */
  completed: ReadonlySet<string>;
  /** Any reading event (a view, a reading report) or a completion. */
  started: ReadonlySet<string>;
  /** Started texts, most recently touched first (distinct), at most `CANDIDATES.recentTexts`. */
  recent: readonly string[];
  /** Works (or, without one, texts) he has touched. */
  touchedWorks: ReadonlySet<string>;
  /** Stage id → order in the ladder (for this language's courses). */
  stageIndex: ReadonlyMap<string, number>;
  /** The highest stage among his last few texts; undefined when he has read nothing placed on a stage. */
  currentStage?: number;
  /** Domains of the last `CANDIDATES.lastDomains` texts, most recent first. */
  recentGroups: readonly string[];
  /** Lower-cased stated interests. */
  interests: ReadonlySet<string>;
  /** He has CREDITED listening encounters in this language (synthetic speech never creates one). */
  listens: boolean;
  /**
   * Scripture's share of the words of what he read lately (the last `REACH.recentTexts` texts or `REACH.recentWords` words);
   * undefined when he read fewer than `REACH.scriptureMinTexts` texts. Feeds the soft cap on Scripture in what is recommended.
   */
  scriptureShare?: number;
}

export async function learnerSnapshot(ctx: Ctx, userId: string, lang: LanguageCode, interests: readonly string[] = []): Promise<LearnerSnapshot> {
  const lastAt = new Map<string, string>();
  const note = (textId: string, at: string) => { const p = lastAt.get(textId); if (p === undefined || at > p) lastAt.set(textId, at); };
  const log = await ctx.userLog(userId); // the folder's in-memory index of his evidence events: no read of the event table
  for (const e of log.events) {
    if (e.lang !== lang) continue;
    if (e.type === 'SentenceViewed') note(e.textId, e.at);
    else if (e.type === 'ComprehensionReported' && e.modality === 'reading') note(e.textId, e.at);
  }
  const completed = new Set<string>();
  for (const e of await ctx.store.events.where('type', 'TextCompleted')) {
    if (e.userId === userId && e.lang === lang && e.type === 'TextCompleted') { completed.add(e.textId); note(e.textId, e.at); }
  }
  const recent = [...lastAt.entries()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : cmp(a[0], b[0]))).slice(0, CANDIDATES.recentTexts).map(([id]) => id);

  const stageIndex = new Map<string, number>();
  for (const s of await ctx.store.stages.where('lang', lang)) stageIndex.set(s.id, s.index);

  // his texts as the catalogue knows them (an opened text is indexed); the texts themselves give the work
  const rows = await ctx.store.catalog.getMany(recent);
  const touchedWorks = new Set<string>();
  const startedIds = [...lastAt.keys()];
  const texts: Array<Text | undefined> = await ctx.store.texts.getMany(startedIds);
  startedIds.forEach((id, i) => touchedWorks.add(texts[i]?.workId ?? id));
  let currentStage: number | undefined;
  recent.slice(0, 5).forEach((_, i) => {
    const sid = rows[i]?.stageId;
    const idx = sid !== undefined ? stageIndex.get(sid) : undefined;
    if (idx !== undefined && (currentStage === undefined || idx > currentStage)) currentStage = idx;
  });
  const recentGroups: string[] = [];
  rows.slice(0, CANDIDATES.lastDomains).forEach((r) => { const g = r ? domainOf(r) : undefined; if (g) recentGroups.push(g); });

  // Credited listening only: encounter rows exist for eligible (human, reviewed, observed) listening alone. Read only when this
  // version can recommend listening at all, since this is the one place that reads the encounter table.
  let listens = false;
  if (ctx.listening && ctx.audioEligible) {
    listens = (await ctx.store.encounters.where('userId', userId)).some((e) => e.lang === lang && e.modality === 'listening');
  }
  const scriptureShare = await recentScriptureShare(ctx, [...lastAt.entries()].sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : cmp(a[0], b[0]))).map(([id]) => id));
  return {
    lang, completed, started: new Set(lastAt.keys()), recent, touchedWorks, stageIndex,
    ...(currentStage !== undefined ? { currentStage } : {}), recentGroups,
    interests: new Set(interests.map((s) => s.toLowerCase())), listens,
    ...(scriptureShare !== undefined ? { scriptureShare } : {}),
  };
}

/** Scripture's share of the words of the texts he read lately (`recentIds`: most recent first); undefined with too few texts to say. */
async function recentScriptureShare(ctx: Ctx, recentIds: readonly string[]): Promise<number | undefined> {
  if (recentIds.length < REACH.scriptureMinTexts) return undefined;
  const ids = recentIds.slice(0, REACH.recentTexts);
  const rows = await ctx.store.catalog.getMany(ids);
  const texts = await ctx.store.texts.getMany(ids);
  let words = 0;
  let scripture = 0;
  let n = 0;
  for (let i = 0; i < ids.length && words < REACH.recentWords; i++) {
    const w = Math.max(1, rows[i]?.features.words ?? 200);
    const isScr = rows[i] ? isScripture(rows[i]!) : texts[i]?.kind === 'scripture';
    words += w;
    n += 1;
    if (isScr) scripture += w;
  }
  return n >= REACH.scriptureMinTexts && words > 0 ? scripture / words : undefined;
}

// ───────────────────────────── what is never offered as reading ─────────────────────────────

/** A work's front matter or preface (the plaintext importer files it as chapter 0, "<book> — Front matter"). Scripture's chapter 0 is its starter selection, not front matter. */
const FRONT_TITLE = /(?:^|[—–-]\s*)(?:front matter|preface|foreword|prólogo|prologo|vorwort|préface|prefazione|prefácio)(?:\s*\([^)]*\))?\s*$/i;
export const isFrontMatterTitle = (title: string): boolean => FRONT_TITLE.test(title.trim());
export const isFrontMatterRow = (r: Pick<CatalogText, 'title' | 'chapter' | 'stream' | 'streams'>): boolean =>
  isFrontMatterTitle(r.title) || (r.chapter === 0 && !isScripture(r));
export const isFrontMatterText = (t: Pick<Text, 'title' | 'chapter' | 'kind'>): boolean =>
  isFrontMatterTitle(t.title) || /^front matter$/i.test(t.chapter?.title ?? '') || (t.chapter?.index === 0 && t.kind !== 'scripture');
/** Absorbed by the ladder (`editorialTags` carries `superseded-by-ladder`): it stays in the store, it is not offered. */
export const isSuperseded = (t: Pick<Text, 'editorialTags'>): boolean => (t.editorialTags ?? []).includes(REACH.supersededTag);
/** A Stage 0 scene (src/stage0/documents.ts): read on the Stage 0 path, never offered as library or ladder reading. */
export const isStage0Text = (t: Pick<Text, 'editorialTags'>): boolean => (t.editorialTags ?? []).includes('stage0');

// ───────────────────────────── the prefilter ─────────────────────────────

const RELIABLE = new Set(['verified-public-domain', 'verified-open-licence', 'course-authored', 'user-supplied']);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export const isScripture = (r: Pick<CatalogText, 'stream' | 'streams'>): boolean => r.stream === 'scripture' || (r.streams ?? []).includes('scripture');
/** The pool a row is dealt from: its first domain, else genre, else stream. */
const groupOf = (r: CatalogText): string => r.domains?.[0] ?? r.genre ?? r.stream;
/** An older stage of the language: a century up to the 18th, an ancient / medieval label, or a historical variety. Harder to read, not worse. */
function olderEra(r: CatalogText): boolean {
  if (r.variety && /-hist$/.test(r.variety)) return true;
  const era = r.era?.toLowerCase();
  if (!era) return false;
  const c = /(\d{1,2})(?:st|nd|rd|th)\s+century/.exec(era);
  if (c) return Number(c[1]) <= 18;
  return /ancient|medieval|classical|archaic|early modern|\bbc\b|\bbce\b/.test(era);
}

function stageFit(r: CatalogText, snap: LearnerSnapshot): number {
  const idx = r.stageId !== undefined ? snap.stageIndex.get(r.stageId) : undefined;
  if (idx === undefined || snap.currentStage === undefined) return CANDIDATES.stageUnknown;
  const d = idx - snap.currentStage;
  // above his stage is the harder miss; below it only means easy
  const away = d > 0 ? Math.max(0, d - CANDIDATES.stageNear) : Math.max(0, -d - CANDIDATES.stageNear) / 2;
  return clamp01(1 - away * CANDIDATES.stageStep);
}

function lengthFit(words: number): number {
  const { min, max } = CANDIDATES.lengthIdeal;
  if (words < min) return 0.4 + (0.6 * Math.max(0, words)) / min;
  if (words <= max) return 1;
  if (words >= CANDIDATES.lengthTooLong) return 0.2;
  return 1 - (0.8 * (words - max)) / (CANDIDATES.lengthTooLong - max);
}

const matchesInterest = (r: CatalogText, interests: ReadonlySet<string>): boolean =>
  interests.size > 0 && [r.stream, ...(r.streams ?? []), ...(r.domains ?? []), r.genre].some((x) => !!x && interests.has(x.toLowerCase()));

/** 0..1 from index features only. Exported for tests. */
export function prefilterScore(r: CatalogText, snap: LearnerSnapshot): number {
  const W = CANDIDATES.weights;
  const done = snap.completed.has(r.id);
  const workTouched = r.workId !== undefined && snap.touchedWorks.has(r.workId);
  const unread = done ? 0 : snap.started.has(r.id) ? 0.8 : workTouched ? 0.85 : 1;
  const notRecent = done && snap.recent.includes(r.id) ? 0 : 1;
  const quality = (r.published ? 0.7 : 0.3) + (RELIABLE.has(r.rights) ? 0.3 : 0.1);
  return clamp01(
    W.stage * stageFit(r, snap) + W.length * lengthFit(r.features.words) + W.unread * unread + W.interest * (matchesInterest(r, snap.interests) ? 1 : 0)
    + W.notRecent * notRecent + W.era * (olderEra(r) ? 0.4 : 1) + W.quality * quality,
  );
}

/** The `cap` best entries, kept sorted (score, then id); insertion is O(cap). */
class TopK<T extends { id: string; score: number }> {
  readonly items: T[] = [];
  constructor(private readonly cap: number) {}
  add(x: T): void {
    const better = (a: T, b: T) => a.score > b.score || (a.score === b.score && a.id < b.id);
    if (this.items.length >= this.cap && !better(x, this.items[this.items.length - 1])) return;
    let i = this.items.length;
    while (i > 0 && better(x, this.items[i - 1])) i -= 1;
    this.items.splice(i, 0, x);
    if (this.items.length > this.cap) this.items.pop();
  }
}

/** FNV-1a → 0..1, stable across runs and platforms. */
function unitHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h / 0x100000000;
}

export interface ShortlistStats {
  /** Catalogue rows walked (after the page-wise exclusions), pages read, and rows left out as unfit to offer. */
  seen: number; pages: number; excluded: number;
  shortlisted: number; scripture: number; groups: number;
}

export interface ShortlistOptions {
  lang: LanguageCode;
  /** Preview mode: unpublished texts may be offered. */
  includeUnpublished?: boolean;
  snapshot: LearnerSnapshot;
  size?: number;
  pageSize?: number;
  /** Rows that may not be offered whatever the catalogue says (e.g. the held-out set of a caller). */
  excludeIds?: ReadonlySet<string>;
  /** Decides, for a page of rows, which are fit to offer (the store check of `candidateFilter`). Default: all. */
  fit?: (rows: CatalogText[]) => Promise<CatalogText[]>;
}

interface Entry { id: string; score: number; row: CatalogText }

/** Step 1: walk the whole catalogue of the language, a page at a time, and keep a mixed, bounded shortlist. */
export async function shortlist(pager: CatalogPager, opts: ShortlistOptions): Promise<{ items: CatalogText[]; stats: ShortlistStats }> {
  const size = Math.max(1, opts.size ?? CANDIDATES.shortlist);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? CANDIDATES.pageSize));
  const snap = opts.snapshot;
  const preview = opts.includeUnpublished ?? false;
  const scriptureCap = Math.floor(size * CANDIDATES.scriptureShare);
  const domainCap = Math.max(1, Math.ceil(size * CANDIDATES.domainShare));

  const groups = new Map<string, TopK<Entry>>();
  const scripture = new TopK<Entry>(size);
  const interest = new TopK<Entry>(CANDIDATES.minInterest);
  const fresh = new TopK<Entry>(CANDIDATES.minUnreadWorks);
  const wild = new TopK<Entry>(CANDIDATES.wildcards);
  const salt = String(snap.completed.size);
  const stats: ShortlistStats = { seen: 0, pages: 0, excluded: 0, shortlisted: 0, scripture: 0, groups: 0 };

  for (let offset = 0, guard = 0; guard < 100_000; guard++) {
    const page = await pager({ lang: opts.lang, publishedOnly: !preview, offset, limit: pageSize });
    if (page.items.length === 0) break;
    stats.pages += 1;
    const fitRows = opts.fit ? await opts.fit(page.items) : page.items;
    stats.excluded += page.items.length - fitRows.length;
    for (const row of fitRows) {
      if (row.lang !== opts.lang || (!preview && !row.published) || opts.excludeIds?.has(row.id) || isFrontMatterRow(row)) { stats.excluded += 1; continue; }
      stats.seen += 1;
      // a text he has COMPLETED is seen but takes no place: rereads are offered from the store by recommend(), never from here — and in
      // preview the ladder's own units are catalogue rows too, so a long ladder once read filled the whole shortlist with read texts
      if (snap.completed.has(row.id)) continue;
      const entry: Entry = { id: row.id, score: prefilterScore(row, snap), row };
      const liked = matchesInterest(row, snap.interests);
      if (liked) interest.add(entry);
      if (isScripture(row)) { scripture.add(entry); }
      else {
        const key = groupOf(row);
        let g = groups.get(key);
        if (!g) {
          const slot = groups.size >= CANDIDATES.maxGroups ? 'other' : key;
          g = groups.get(slot) ?? groups.set(slot, new TopK<Entry>(domainCap)).get(slot)!;
        }
        g.add(entry);
        if (!snap.completed.has(row.id) && !(row.workId !== undefined && snap.touchedWorks.has(row.workId))) fresh.add(entry);
        wild.add({ id: row.id, score: 1 - unitHash(`${row.id}|${salt}`), row });
      }
    }
    offset += page.items.length;
    if (offset >= page.total) break;
  }

  // ── assemble ──
  const picked = new Map<string, CatalogText>();
  let scr = 0;
  const take = (e: Entry | undefined, relaxed = false): void => {
    if (!e || picked.size >= size || picked.has(e.id)) return;
    const sc = isScripture(e.row);
    if (sc && !relaxed && scr >= scriptureCap) return;
    picked.set(e.id, e.row);
    if (sc) scr += 1;
  };
  for (const e of interest.items) take(e);
  for (const e of fresh.items) take(e);
  for (const e of wild.items) take(e);
  const lists = [...groups.entries()].sort((a, b) => (b[1].items[0]?.score ?? 0) - (a[1].items[0]?.score ?? 0) || cmp(a[0], b[0])).map(([, g]) => g.items);
  lists.push(scripture.items);
  for (let k = 0; picked.size < size; k++) {
    let any = false;
    for (const list of lists) { if (list[k]) { any = true; take(list[k]); } }
    if (!any) break;
  }
  // nothing else is left to fill the shortlist: Scripture may fill what remains rather than leave the learner with fewer to choose from
  for (const e of scripture.items) take(e, true);

  stats.shortlisted = picked.size;
  stats.scripture = scr;
  stats.groups = groups.size;
  return { items: [...picked.values()].sort((a, b) => cmp(a.id, b.id)), stats };
}

/**
 * Which rows of a page may be offered at all, from the store: testimony, held-out assessment texts and anything in a private
 * (testimony) corpus never. A row whose text is not imported has no such flags and stays.
 */
export async function candidateFilter(ctx: Ctx): Promise<(rows: CatalogText[]) => Promise<CatalogText[]>> {
  const privateCorpusIds = new Set((await ctx.store.corpora.where('kind', 'testimony')).map((c) => c.id));
  return async (rows) => {
    const stored = await ctx.store.texts.getMany(rows.map((r) => r.id));
    return rows.filter((_, i) => {
      const t = stored[i];
      return !t || (t.kind !== 'testimony' && !privateCorpusIds.has(t.corpusId) && !isHeldOut(t) && !isSuperseded(t) && !isStage0Text(t) && !isFrontMatterText(t));
    });
  };
}

/**
 * A held-out (protected) assessment text. `readingAssessmentId` and `curriculum.role` are set by the curriculum work when present;
 * they are read through a local structural type, so this file does not depend on those fields being declared on `Text`.
 */
type MaybeHeldOut = { listeningAssessmentId?: unknown; readingAssessmentId?: unknown; curriculum?: { role?: string } };
function isHeldOut(t: Text): boolean {
  const x = t as unknown as MaybeHeldOut;
  return typeof x.listeningAssessmentId === 'string' || typeof x.readingAssessmentId === 'string' || x.curriculum?.role === 'assessment';
}

// ───────────────────────────── the whole pipeline ─────────────────────────────

export interface WholeLibraryDeps {
  /** Default: the posting-list search over this store's `catalog` table. */
  pager?: CatalogPager;
  /** Default: the profile cached in the store for an imported text (nothing is measured). */
  profileOf?: ProfileSource;
}

export interface WholeLibraryOptions {
  lang?: LanguageCode;
  interests?: string[];
  includeUnpublished?: boolean;
  limit?: number;
  size?: number;
  challenge?: 'easy' | 'steady' | 'stretch';
  targetVariety?: string;
  /** A snapshot already taken by the caller (it must be for the same learner and language). */
  snapshot?: LearnerSnapshot;
  /**
   * RECOMMENDING (what `recommend` asks for; default off, so a plain ranking is exactly what it was): coverage with names left out, the
   * yield term, the floor of what is in reach and the soft cap on Scripture in what he reads (rank.ts `RankOptionsWhole.reach`).
   */
  reach?: boolean;
}

export interface WholeLibraryResult {
  picks: Array<{ ranked: RankedTextWhole; row: CatalogText; alreadyRead: boolean }>;
  stats: ShortlistStats & { profiled: number; unprofiled: number; listeningChecked: number };
}

const PROFILE_BATCH = 16;

/** The default pager: the posting-list search over this store's `catalog` table (paged, never the whole table). */
export const storePager = (ctx: Ctx): CatalogPager => (q) => searchCatalog(ctx.store, q, ctx.clock());

export async function rankWholeLibrary(ctx: Ctx, userId: string, deps: WholeLibraryDeps, opts: WholeLibraryOptions = {}): Promise<WholeLibraryResult> {
  const user = await ctx.store.users.get(userId);
  const course = user ? await ctx.store.courses.get(user.courseId) : undefined;
  const lang = opts.lang ?? course?.lang;
  const empty: WholeLibraryResult = { picks: [], stats: { seen: 0, pages: 0, excluded: 0, shortlisted: 0, scripture: 0, groups: 0, profiled: 0, unprofiled: 0, listeningChecked: 0 } };
  if (!lang) return empty;
  const interests = opts.interests ?? user?.interests ?? [];
  const snap = opts.snapshot ?? await learnerSnapshot(ctx, userId, lang, interests);
  const pager: CatalogPager = deps.pager ?? storePager(ctx);
  const profileOf: ProfileSource = deps.profileOf ?? (async (id) => { const t = await ctx.store.texts.get(id); return t ? cachedProfile(ctx.store, t) : undefined; });

  const { items, stats } = await shortlist(pager, {
    lang, snapshot: snap, includeUnpublished: opts.includeUnpublished ?? false, size: opts.size, fit: await candidateFilter(ctx),
  });
  if (items.length === 0) return { ...empty, stats: { ...empty.stats, ...stats } };

  const profiles: Array<TextProfile | undefined> = [];
  for (let i = 0; i < items.length; i += PROFILE_BATCH) {
    profiles.push(...await Promise.all(items.slice(i, i + PROFILE_BATCH).map((r) => profileOf(r.id).catch(() => undefined))));
  }
  const candidates: RankCandidateWhole[] = [];
  const rowOf = new Map<string, CatalogText>();
  items.forEach((r, i) => {
    const profile = profiles[i];
    if (!profile) return; // a text without a profile cannot be scored, so it is not suggested
    rowOf.set(r.id, r);
    candidates.push({
      profile, workId: r.workId, stream: r.stream, domains: r.domains, variety: r.variety, author: r.author, controlled: r.stream === 'acquisition',
      published: r.published, rights: r.rights, alreadyRead: snap.completed.has(r.id), scripture: isScripture(r),
    });
  });

  // listening availability: only for a learner whose listening has been credited, and only a lawful reviewed HUMAN recording
  let listenEligible: Set<string> | undefined;
  let checked = 0;
  if (snap.listens && ctx.listening && ctx.audioEligible) {
    listenEligible = new Set();
    for (let i = 0; i < candidates.length; i += PROFILE_BATCH) {
      const part = candidates.slice(i, i + PROFILE_BATCH).map((c) => c.profile.textId);
      checked += part.length;
      const ok = await Promise.all(part.map(async (id) => { try { return (await ctx.audioEligible!(id)) && (await hasHumanReviewedRecording(ctx, id)); } catch { return false; } }));
      part.forEach((id, j) => { if (ok[j]) listenEligible!.add(id); });
    }
  }

  const ranked = await rankLibrary(ctx, userId, candidates, {
    interests, targetVariety: opts.targetVariety ?? course?.variety?.target, challenge: opts.challenge, limit: opts.limit ?? 10,
    signals: { recentGroups: snap.recentGroups, ...(listenEligible ? { listenEligible } : {}) },
    ...(opts.reach ? { reach: { scriptureShare: snap.scriptureShare } } : {}),
  });
  return {
    picks: ranked.flatMap((r) => { const row = rowOf.get(r.textId); return row ? [{ ranked: r, row, alreadyRead: snap.completed.has(r.textId) }] : []; }),
    stats: { ...stats, profiled: candidates.length, unprofiled: items.length - candidates.length, listeningChecked: checked },
  };
}
