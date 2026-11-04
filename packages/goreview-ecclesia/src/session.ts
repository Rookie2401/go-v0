/**
 * Session composition: reading → review → reading, over GoReview's own intake, planner and runner (nothing is re-implemented).
 *
 *   readingCandidates   what the learner's READING proposes for review: looked-up, helped, marked, repeatedly met or weakly
 *                       recognised lexemes without a recognition card yet. Each candidate explains itself (`reasons`).
 *   composeSession      folds the deck (FSRS) and the knowledge rows (levels), lets GoReview's intake gate the candidates by
 *                       level (New never enters automatically; Seen needs repeated encounter, help or relevance), and plans with
 *                       GoReview's planner: due learning → due reviews → new admissions, workload-bounded, nothing dropped
 *                       silently. Listening is off: there is no reviewed voice for an ancient language, so nothing pretends.
 *   preferReadingContext within each planner queue, cards from the passage just read come first; nothing is added, removed
 *                       or reordered across queues, so a due card is never trapped behind context.
 *   createEcclesiaRunner GoReview's session runner with Ecclesia's facts and identity; it grades, records (CardReviewed and,
 *                       for a new card, CardAdded in the same batch) and persists. Review events are never built by hand.
 */
import type { GoEvent, KnowledgeLevel, ReviewCandidate, UnitKnowledge } from '../../repository-contract/src';
import { KNOWLEDGE_LEVEL_RANK } from '../../repository-contract/src';
import { createFsrsScheduler } from '../../goreview/src/scheduler/fsrs';
import { foldDeckItems } from '../../goreview/src/scheduler/deck';
import { decideIntake } from '../../goreview/src/intake/intake';
import { planSession } from '../../goreview/src/planner/planner';
import { registry } from '../../goreview/src/exercises/registry';
import { createSessionRunner } from '../../goreview/src/session/runner';
import type { RunnerDeps, SessionRunner } from '../../goreview/src/session/runner';
import { createMemoryArea } from '../../repository-sync/src/area';
import type { KeyValueArea } from '../../repository-sync/src/area';
import type { AudioAvailability, DeckItem, IntakeOutcome, PlannedItem, ReviewIntent, ReviewPreferences, Scheduler, SessionPlan } from '../../goreview/src/types';
import type { ComposedSession, EcclesiaLanguageProfile, PassageTokens, ReaderIdentity } from './contract';
import { scopedEvents } from './encounters';
import type { EcclesiaFactsProvider } from './facts';
import { lexemeId } from './identity';
import { knowledgeRows } from './profile';

/** No voice is reviewed for Biblical Hebrew, Aramaic, Koine or Latin: listening is unavailable, and said so. */
export const NO_AUDIO: AudioAvailability = { available: false, eligibleForEvidence: false, reason: 'no reviewed voice for an ancient language' };

export function ecclesiaPreferences(profile: EcclesiaLanguageProfile, over: Partial<ReviewPreferences> = {}): ReviewPreferences {
  const r = profile.review;
  return {
    languageId: profile.repository.languageId, ...(profile.repository.varietyId ? { varietyId: profile.repository.varietyId } : {}),
    sessionMinutes: r.sessionMinutes ?? 10, maxNew: r.maxNew ?? 4, newItemsSet: true, dailyNewLimit: (r.maxNew ?? 4) * 3,
    desiredRetention: r.desiredRetention ?? 0.9, includeListening: false, listeningOff: true, grammarShare: r.grammarShare ?? 0.25,
    prioritizeSaved: true, cardsPerDeck: r.cardsPerDeck ?? 12,
    ...over,
  };
}

// ───────────────────────────── reading candidates ─────────────────────────────

export const READING_CANDIDATE_RULES = {
  lookedUp: { weight: 0.2, repeatedBonus: 0.1 },
  helpRequested: { weight: 0.2 },
  repeatedEncounter: { weight: 0.15, minimum: 2 },
  markedForLearning: { weight: 0.3, levels: ['new', 'seen', 'recognized'] as readonly KnowledgeLevel[] },
  weakButSeen: { weight: 0.2, readingBelow: 0.5 },
  inReadingContext: { weight: 0.15 },
  /** Units at or above this level are not proposed from reading (a review card may still exist and return on its schedule). */
  skipFrom: 'known' as KnowledgeLevel,
} as const;

export interface ReadingCandidateInput {
  profile: EcclesiaLanguageProfile;
  events: readonly GoEvent[];
  rows: readonly UnitKnowledge[];
  deck: readonly DeckItem[];
  /** The passage just read, when there is one: its lexemes gain `inReadingContext`. */
  context?: PassageTokens;
  /** Propose forms too (default: lexemes only — a card asks the meaning of the word, whatever its inflection). */
  includeForms?: boolean;
  limit?: number;
}

const lexemeOf = (id: string): boolean => id.startsWith('lemma:');
const formOf = (id: string): boolean => id.startsWith('form:');

/** What reading proposes for review, scored and explained; GoReview's intake then decides. */
export function readingCandidates(inp: ReadingCandidateInput): ReviewCandidate[] {
  const R = READING_CANDIDATE_RULES;
  const covered = new Set(inp.deck.filter((d) => d.status === 'active' && d.dimension === 'written-recognition').map((d) => d.unitId));
  const counts = { lookups: new Map<string, number>(), help: new Map<string, number>() };
  for (const e of inp.events) {
    const bucket = e.kind === 'SelectionLookedUp' ? counts.lookups : e.kind === 'AssistanceRequested' ? counts.help : undefined;
    if (!bucket) continue;
    for (const id of new Set(e.subject?.itemIds ?? [])) bucket.set(id, (bucket.get(id) ?? 0) + 1);
  }
  const contextIds = new Set<string>();
  if (inp.context) for (const v of inp.context.verses) for (const t of v.tokens) contextIds.add(lexemeId(inp.profile, t.lemma, t.pos));

  const out: ReviewCandidate[] = [];
  for (const row of inp.rows) {
    const id = row.unitId;
    if (!(lexemeOf(id) || (inp.includeForms && formOf(id)))) continue;
    if (covered.has(id)) continue;
    if (KNOWLEDGE_LEVEL_RANK[row.level] >= KNOWLEDGE_LEVEL_RANK[R.skipFrom] && !(row.selfMark && R.markedForLearning.levels.includes(row.selfMark.mark))) continue;
    const reasons: ReviewCandidate['reasons'] = [];
    const lookups = counts.lookups.get(id) ?? 0;
    if (lookups > 0) reasons.push({ rule: 'looked-up', weight: R.lookedUp.weight + (lookups > 1 ? R.lookedUp.repeatedBonus : 0), detail: `${lookups} lookup${lookups === 1 ? '' : 's'}` });
    const help = counts.help.get(id) ?? 0;
    if (help > 0) reasons.push({ rule: 'help-requested', weight: R.helpRequested.weight, detail: `${help} help request${help === 1 ? '' : 's'}` });
    if (row.encounters >= R.repeatedEncounter.minimum) reasons.push({ rule: 'repeated-encounter', weight: R.repeatedEncounter.weight, detail: `${row.encounters} encounters` });
    if (row.selfMark && R.markedForLearning.levels.includes(row.selfMark.mark)) reasons.push({ rule: 'marked-for-learning', weight: R.markedForLearning.weight, detail: `marked ${row.selfMark.mark}` });
    const rr = row.dimensions.readingRecognition;
    if (rr.observations > 0 && rr.score < R.weakButSeen.readingBelow) reasons.push({ rule: 'weak-but-seen', weight: R.weakButSeen.weight, detail: `reading recognition ${rr.score.toFixed(2)}` });
    if (contextIds.has(id)) reasons.push({ rule: 'in-reading-context', weight: R.inReadingContext.weight, detail: 'in the passage just read' });
    if (!reasons.length) continue;
    const score = Math.min(1, Math.round(reasons.reduce((s, r) => s + r.weight, 0) * 1000) / 1000);
    out.push({
      unitId: id, kind: lexemeOf(id) ? 'lexeme' : 'form', score, reasons, targetDimension: 'readingRecognition',
      eligibility: { eligible: true, status: row.analysisStatus ?? inp.profile.analysis.status, caveats: [] }, cost: 0.2,
    });
  }
  out.sort((a, b) => b.score - a.score || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
  return inp.limit !== undefined ? out.slice(0, inp.limit) : out;
}

// ───────────────────────────── composition ─────────────────────────────

export interface ComposeRequest {
  profile: EcclesiaLanguageProfile;
  identity: ReaderIdentity;
  /** The learner's event log (any learner, any language: it is scoped here). */
  events: readonly GoEvent[];
  now: string;
  scheduler?: Scheduler;
  preferences?: Partial<ReviewPreferences>;
  /** The passage just read: its cards are preferred within each queue and its lexemes gain a candidate reason. */
  readingContext?: PassageTokens;
  /** Candidates to use instead of `readingCandidates` (a reader with its own rules, or the Repository engine's). */
  candidates?: ReviewCandidate[];
  intent?: ReviewIntent;
  random?: () => number;
}

const savedUnits = (events: readonly GoEvent[]): Set<string> => {
  const latest = new Map<string, { at: string; saved: boolean }>();
  for (const e of events) {
    if (e.kind !== 'ItemMarked') continue;
    const mark = (e.payload as { mark?: string }).mark;
    if (mark !== 'saved' && mark !== 'ignore') continue;
    for (const id of e.subject?.itemIds ?? []) {
      const prev = latest.get(id);
      if (!prev || Date.parse(e.at) >= Date.parse(prev.at)) latest.set(id, { at: e.at, saved: mark === 'saved' });
    }
  }
  return new Set([...latest].filter(([, v]) => v.saved).map(([id]) => id));
};

export function composeSession(req: ComposeRequest): ComposedSession {
  const { profile, identity, now } = req;
  const scheduler = req.scheduler ?? createFsrsScheduler();
  const preferences = ecclesiaPreferences(profile, req.preferences);
  const scope = { learnerId: identity.learnerId, languageId: profile.repository.languageId };
  const events = scopedEvents(req.events, scope);
  const deck = foldDeckItems(events, scheduler, { ...scope, now });
  const rows = knowledgeRows(events, scope);
  const rowById = new Map(rows.map((r) => [r.unitId, r]));
  const saved = savedUnits(events);
  const candidates = req.candidates ?? readingCandidates({ profile, events, rows, deck, context: req.readingContext });
  const intake: IntakeOutcome[] = candidates.map((candidate) => decideIntake({
    candidate, knowledge: rowById.get(candidate.unitId), existing: deck, audio: NO_AUDIO, saved, preferences, now, readingSignals: events, ...(req.intent ? { intent: req.intent } : {}),
  }));
  let plan = planSession({ deck, intake, preferences, audio: NO_AUDIO, scheduler, now, learnerId: identity.learnerId, knowledge: rows, readingSignals: events, random: req.random ?? (() => 0.5), ...(req.intent ? { intent: req.intent } : {}) });
  let fromReadingContext: string[] = [];
  if (req.readingContext) {
    const ids = new Set<string>();
    for (const v of req.readingContext.verses) for (const t of v.tokens) ids.add(lexemeId(profile, t.lemma, t.pos));
    const preferred = preferReadingContext(plan, ids);
    plan = preferred.plan;
    fromReadingContext = preferred.fromReadingContext;
  }
  return {
    plan, preferences, deck,
    admitted: intake.filter((o) => o.decision === 'test-now' || o.decision === 'test-later').map((o) => o.unitId),
    declined: intake.filter((o) => o.decision !== 'test-now' && o.decision !== 'test-later').map((o) => ({ unitId: o.unitId, decision: o.decision, reasons: o.reasons })),
    fromReadingContext,
  };
}

const queueOf = (p: PlannedItem): string => p.queue ?? (p.isNew ? 'new' : 'due');

/** Within each planner queue, items from the reading context first; the plan's size, membership and queue order are unchanged. */
export function preferReadingContext(plan: SessionPlan, unitIds: ReadonlySet<string>): { plan: SessionPlan; fromReadingContext: string[] } {
  const items: PlannedItem[] = [];
  const fromReadingContext: string[] = [];
  let i = 0;
  while (i < plan.items.length) {
    const q = queueOf(plan.items[i]!);
    let j = i;
    while (j < plan.items.length && queueOf(plan.items[j]!) === q) j += 1;
    const run = plan.items.slice(i, j);
    const inContext = run.filter((p) => unitIds.has(p.item.unitId)).map((p) => ({ ...p, why: [...p.why, 'met in the passage just read'] }));
    const rest = run.filter((p) => !unitIds.has(p.item.unitId));
    for (const p of inContext) fromReadingContext.push(p.item.itemId);
    items.push(...inContext, ...rest);
    i = j;
  }
  return { plan: { ...plan, items }, fromReadingContext };
}

// ───────────────────────────── the runner ─────────────────────────────

export interface EcclesiaRunnerDeps {
  profile: EcclesiaLanguageProfile;
  identity: ReaderIdentity;
  plan: SessionPlan;
  preferences?: ReviewPreferences;
  facts: EcclesiaFactsProvider;
  scheduler?: Scheduler;
  /** The device queue or the Repository: must persist before it resolves (the runner advances only after it does). */
  record: (events: GoEvent[]) => Promise<void>;
  /** The committed events, so a recovered session re-asks what the log does not hold. */
  committedEvents?: () => Promise<GoEvent[]> | GoEvent[];
  /** Where in-progress sessions are saved; memory by default (a reader passes its storage). */
  persist?: KeyValueArea;
  now: () => string;
  random?: () => number;
  sessionId?: string;
}

/** GoReview's session runner, wired to Ecclesia. Answers are graded by GoReview, recorded as its events, scheduled by FSRS. */
export function createEcclesiaRunner(deps: EcclesiaRunnerDeps): SessionRunner {
  const runnerDeps: RunnerDeps = {
    plan: deps.plan, ...(deps.preferences ? { preferences: deps.preferences } : {}), builders: registry, facts: deps.facts,
    scheduler: deps.scheduler ?? createFsrsScheduler(), identity: deps.identity, record: deps.record, persist: deps.persist ?? createMemoryArea(),
    now: deps.now, random: deps.random ?? (() => 0.5), ...(deps.sessionId ? { sessionId: deps.sessionId } : {}),
    pool: () => deps.facts.pool(), ...(deps.committedEvents ? { committedEvents: deps.committedEvents } : {}),
  };
  return createSessionRunner(runnerDeps);
}
