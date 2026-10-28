/**
 * The model behind the GoReview home: the current deck (always ready), the saved decks, and the vocabulary list with
 * its two orders. No DOM, so a test reads it directly.
 *
 * The current deck is what a session would ask. It is planned exactly as the session always was (`engine.plan`, the
 * spaced-repetition scheduler's due and new items). When that yields nothing, the deck is filled so the learner is never
 * met with an empty home: first from the intake outcomes marked "test later", then from the learner's weakest known
 * units (the Repository's candidates and the deck, by knowledge level: new, seen, recognized first). The reasons stay
 * available on the details page; the home says only "N cards".
 *
 * Saved decks are kept in the application area under `gopractice:decks:<learner>:<language>` as
 * `{ v: 1, decks: SavedDeck[], holdOut: string[] }`; a missing or damaged record reads as "no saved decks".
 */
import { KNOWLEDGE_LEVELS, type KnowledgeLevel, type UnitKnowledge } from '../repository-contract/src';
import type { AssessmentDimension, DeckItem, ExerciseFamily, IntakeOutcome, PlannedItem, ReviewResult, SessionPlan } from '../goreview/src/types';
import type { AppContext } from './context';
import { unitLabel } from './format';
import { clampDeckSize } from './state';
import { classDeckFor, classLanguageOf, isClassUnit } from './classEssentials';
import { readSnapshot, writeSnapshot, MAX_SNAPSHOT_WORDS } from './snapshot';
import { observedReviewSeconds, type ReviewModel } from './workspace';

// ───────────────────────────── the current deck ─────────────────────────────

/** One card of a deck as a snapshot can hold it: enough to ask it again later. */
export interface DeckEntry {
  itemId: string;
  unitId: string;
  unitKind: string;
  label: string;
  dimension: AssessmentDimension;
  family: ExerciseFamily;
}

export interface CurrentDeck {
  plan: SessionPlan;
  entries: DeckEntry[];
  /** True when the scheduler had nothing to ask and the deck was filled from test-later and the weakest known units. */
  filled: boolean;
  /** Whether the Repository holds any vocabulary at all (candidates, deck cards or knowledge rows). */
  hasVocabulary: boolean;
}

/** What a deck wants asked: a unit along one dimension, with the intake outcome that proposed it when there is one. */
export interface Wanted { unitId: string; unitKind: string; dimension: AssessmentDimension; family: ExerciseFamily; outcome?: IntakeOutcome }

const rankOf = (level: KnowledgeLevel | undefined): number => (level ? Math.max(0, KNOWLEDGE_LEVELS.indexOf(level)) : 0);
const isAudio = (family: ExerciseFamily): boolean => family === 'audio-to-meaning' || family === 'audio-transcription';
const GRAMMAR: ReadonlySet<ExerciseFamily> = new Set<ExerciseFamily>(['morphological-identification', 'grammar-application']);

/** How many cards the current deck holds: the learner's "cards per deck" (5 to 60). */
export function fillSize(model: Pick<ReviewModel, 'prefs'>): number {
  return clampDeckSize(model.prefs.cardsPerDeck);
}

const entryOf = (p: PlannedItem): DeckEntry => ({
  itemId: p.item.itemId, unitId: p.item.unitId, unitKind: p.item.unitKind, label: unitLabel(p.item.unitId), dimension: p.item.dimension, family: p.item.family,
});

/** The deck as the scheduler plans it today, with the units of `holdOut` left out (the deck that was just saved). */
function scheduledPlan(ctx: AppContext, model: ReviewModel, holdOut: ReadonlySet<string>): SessionPlan {
  return ctx.engine.plan({
    deck: model.deck.filter((i) => !holdOut.has(i.unitId) && !isClassUnit(i.unitId)),
    intake: model.outcomes.filter((o) => model.choices[o.unitId] !== 'later' && !holdOut.has(o.unitId)),
    // the deck is sized by cards, not minutes: flexible time, so the planner's budget never cuts it short of the size
    prefs: { ...model.prefs, sessionMinutes: 0 }, audio: model.audio, now: model.now, knowledge: model.knowledge, readingSignals: model.events,
    schedulerProfile: model.schedulerProfile, observedReviewSeconds: observedReviewSeconds(model.events),
  });
}

/**
 * Turns an ordered list of wanted cards into a session plan. A card the deck already holds is asked as it stands; a new
 * one goes through the planner as a deliberate selection (so the new-item limit and the level gates of the automatic plan
 * do not drop it), after the exercise engine has said it can be built. The result keeps the order of `wanted`.
 */
export async function assemble(ctx: AppContext, model: ReviewModel, wanted: readonly Wanted[], size: number, opts: { unchecked?: boolean } = {}): Promise<SessionPlan> {
  const listeningOk = model.prefs.includeListening && model.audio.available;
  const holds = (w: Wanted): DeckItem | undefined =>
    [...model.deck, ...(model.classDeck ?? [])].find((i) => i.unitId === w.unitId && i.dimension === w.dimension && i.status !== 'dismissed' && i.status !== 'suspended');
  const direct = new Map<string, PlannedItem>();
  const fresh: IntakeOutcome[] = [];
  const order: string[] = [];
  const api = (await ctx.api()).api;
  // one batched read of the units the loop may ask about, instead of one request per word (2026-10-28: the home took seconds to come back)
  if (ctx.engine.primeFacts && !opts.unchecked) {
    const probe = [...new Set(wanted.filter((w) => !holds(w) && !(isAudio(w.family) && !listeningOk)).slice(0, (size + 4) * 3).map((w) => w.unitId))];
    if (probe.length) { try { await ctx.engine.primeFacts(model.identity.languageId, api, probe); } catch { /* factsFor still answers one by one */ } }
  }
  let tried = 0;
  for (const w of wanted) {
    if (order.length >= size + 4 || tried >= (size + 4) * 3) break;
    const key = `${w.unitId}|${w.dimension}`;
    if (order.includes(key)) continue;
    if (isAudio(w.family) && !listeningOk) continue;
    const held = holds(w);
    if (held) {
      if (isAudio(held.family) && !listeningOk) continue;
      direct.set(key, { item: held, family: held.family, why: ['extra practice: this word is not due yet'], estimatedSeconds: 25, isNew: held.history.length === 0 });
      order.push(key);
      continue;
    }
    tried += 1;
    if (ctx.engine.exerciseAvailable && !opts.unchecked) {
      try {
        if (!(await ctx.engine.exerciseAvailable({ unitId: w.unitId, unitKind: w.unitKind, languageId: model.identity.languageId, dimension: w.dimension, family: w.family, api, now: model.now }))) continue;
      } catch { continue; }
    }
    const base: IntakeOutcome = w.outcome ?? {
      unitId: w.unitId, decision: 'test-now', reasons: ['asked again from a saved deck'],
      candidate: { unitId: w.unitId, kind: w.unitKind, score: 0.5, reasons: [], targetDimension: 'readingRecognition', eligibility: { eligible: true, status: 'high-confidence', caveats: [] }, cost: 0.2 },
    };
    fresh.push({ ...base, decision: 'test-now', proposed: { dimension: w.dimension, family: w.family }, explicitlySelected: true });
    order.push(key);
  }
  // the planner builds the DeckItem of each new card (its schedule, reason and id); flexible time and no new-item cap so none is dropped
  const skeleton = ctx.engine.plan({
    deck: [], intake: fresh, prefs: { ...model.prefs, sessionMinutes: 0, maxNew: Math.max(1, fresh.length) }, audio: model.audio, now: model.now,
    knowledge: model.knowledge, readingSignals: model.events, schedulerProfile: model.schedulerProfile,
  });
  const built = new Map<string, PlannedItem>(skeleton.items.map((p) => [`${p.item.unitId}|${p.item.dimension}`, p]));
  const items = order.map((key) => direct.get(key) ?? built.get(key)).filter((p): p is PlannedItem => !!p).slice(0, size);
  return {
    ...skeleton, budgetMinutes: model.prefs.sessionMinutes, items, skipped: skeleton.skipped,
    dueCount: 0, newCount: items.filter((p) => p.isNew).length,
    listeningCount: items.filter((p) => isAudio(p.family)).length, grammarCount: items.filter((p) => GRAMMAR.has(p.family)).length,
  };
}

/** The fallback order: test-later first, then the weakest known units by level (new, seen, recognized, …), the most met first among equals. */
function fillOrder(model: ReviewModel, holdOut: ReadonlySet<string>): Wanted[] {
  const known = new Map<string, UnitKnowledge>(model.knowledge.map((k) => [k.unitId, k]));
  const levelOf = (unitId: string, outcome?: IntakeOutcome): KnowledgeLevel | undefined => known.get(unitId)?.level ?? outcome?.knowledge?.level;
  const encountersOf = (unitId: string, outcome?: IntakeOutcome): number => known.get(unitId)?.encounters ?? outcome?.knowledge?.encounters ?? 0;
  const usable = (o: IntakeOutcome): o is IntakeOutcome & { proposed: NonNullable<IntakeOutcome['proposed']> } => !!o.proposed && o.decision !== 'already-covered';
  const wantedOf = (o: IntakeOutcome & { proposed: NonNullable<IntakeOutcome['proposed']> }): Wanted =>
    ({ unitId: o.unitId, unitKind: o.candidate.kind, dimension: o.proposed.dimension, family: o.proposed.family, outcome: o });
  const later = model.outcomes.filter(usable).filter((o) => o.decision === 'test-later');
  const laterIds = new Set(later.map((o) => o.unitId));
  type Ranked = { w: Wanted; rank: number; encounters: number };
  const rest: Ranked[] = [];
  for (const o of model.outcomes.filter(usable)) {
    if (laterIds.has(o.unitId)) continue;
    rest.push({ w: wantedOf(o), rank: rankOf(levelOf(o.unitId, o)), encounters: encountersOf(o.unitId, o) });
  }
  for (const item of model.deck) {
    if (item.status === 'dismissed' || item.status === 'suspended') continue;
    rest.push({ w: { unitId: item.unitId, unitKind: item.unitKind, dimension: item.dimension, family: item.family }, rank: rankOf(levelOf(item.unitId)), encounters: encountersOf(item.unitId) });
  }
  rest.sort((a, b) => a.rank - b.rank || b.encounters - a.encounters || (a.w.unitId < b.w.unitId ? -1 : a.w.unitId > b.w.unitId ? 1 : 0));
  const all = [...later.map(wantedOf), ...rest.map((r) => r.w)];
  const kept = all.filter((w) => !holdOut.has(w.unitId));
  return kept.length ? kept : all;
}

/** The one note the session shows when the deck was built from the learner's vocabulary instead of the review schedule. */
export const VOCAB_NOTE = 'Some cards come from your vocabulary, not from the review schedule: they fill the deck to its size.';

/** Words the learner has met, as cards to ask: least known first, then the most recently met, as written recognition (what a provisional analysis is allowed). */
function vocabularyOrder(rows: readonly VocabRow[], holdOut: ReadonlySet<string>): Wanted[] {
  const when = (r: VocabRow): number => { const t = r.lastSeenAt ? Date.parse(r.lastSeenAt) : NaN; return Number.isFinite(t) ? t : -Infinity; };
  const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  const ordered = [...rows].sort((a, b) => rankOf(a.level) - rankOf(b.level) || when(b) - when(a) || b.encounters - a.encounters || text(a.unitId, b.unitId));
  const all = ordered.map((r): Wanted => ({ unitId: r.unitId, unitKind: r.kind ?? 'lexeme', dimension: 'written-recognition', family: 'written-recognition' }));
  const kept = all.filter((w) => !holdOut.has(w.unitId));
  return kept.length ? kept : all;
}

export async function loadVocabSafe(ctx: AppContext, languageId: string): Promise<VocabRow[]> {
  try { return (await loadVocab(ctx, languageId)).rows; } catch { return []; }
}

/**
 * The deck the home offers now: the scheduled plan; when that yields nothing, the candidates (test-later first, then the weakest by level);
 * when those yield nothing too, the learner's own vocabulary (My vocab: least known first, then most recently met) as written-recognition
 * cards. Words the learner added by hand (My vocab, Add) come first and stay until the session begins or the deck is saved.
 * Never empty while My vocab holds a word. `vocab` is My vocab's merged entries when the caller already loaded them.
 */
export async function planCurrentDeck(ctx: AppContext, model: ReviewModel, holdOut: ReadonlySet<string> = new Set(), vocab?: readonly VocabRow[]): Promise<CurrentDeck> {
  const { learnerId, languageId } = model.identity;
  const size = fillSize(model);
  let plan = scheduledPlan(ctx, model, holdOut);
  if (!plan.items.length && holdOut.size) plan = scheduledPlan(ctx, model, new Set());
  // exactly the learner's deck size when there is enough material: the schedule first, then the candidates, then the vocabulary
  let items: PlannedItem[] = plan.items.slice(0, size);
  let filled = false;
  const have = (): Set<string> => new Set(items.map((p) => p.item.unitId));
  const take = (from: SessionPlan, mark?: (p: PlannedItem) => PlannedItem): void => {
    const taken = have();
    const extra = from.items.filter((p) => !taken.has(p.item.unitId)).slice(0, size - items.length).map((p) => (mark ? mark(p) : p));
    if (extra.length) { items = [...items, ...extra]; filled = true; plan = { ...from, items }; }
  };
  if (items.length < size) {
    const taken = have();
    const pool = fillOrder(model, holdOut).filter((w) => !taken.has(w.unitId));
    if (pool.length) take(await assemble(ctx, model, pool, size - items.length));
  }
  let rows = vocab;
  if (items.length < size) {
    rows = rows ?? await loadVocabSafe(ctx, languageId);
    if (rows.length) {
      const taken = have();
      const order = vocabularyOrder(rows, holdOut).filter((w) => !taken.has(w.unitId));
      if (order.length) {
        let fromVocab = await assemble(ctx, model, order, size - items.length);
        // the exercise engine may refuse every word it cannot build yet; with nothing else in the deck it is still offered, and the session says which cards it could not ask
        if (!fromVocab.items.length && !items.length) fromVocab = await assemble(ctx, model, order, size - items.length, { unchecked: true });
        take(fromVocab, (p) => ({ ...p, why: [VOCAB_NOTE, ...p.why] }));
      }
    }
  }
  plan = { ...plan, items };
  // the learner's own additions lead the deck, beyond its size when it is full
  const added = (await readStore(ctx, learnerId, languageId)).added;
  if (added.length) {
    const mine = await assemble(ctx, model, added, added.length);
    if (mine.items.length) {
      const taken = new Set(mine.items.map((p) => p.item.unitId));
      plan = { ...plan, items: [...mine.items, ...plan.items.filter((p) => !taken.has(p.item.unitId))] };
    }
  }
  const hasVocabulary = plan.items.length > 0 || model.outcomes.length > 0 || model.deck.length > 0 || model.knowledge.length > 0 || (rows?.length ?? 0) > 0;
  return { plan, entries: plan.items.map(entryOf), filled, hasVocabulary };
}

/** Puts a word into the current deck by the learner's own choice: it leads the deck until the session begins or the deck is saved. */
export function addToDeck(ctx: AppContext, id: { learnerId: string; languageId: string }, word: Pick<Wanted, 'unitId' | 'unitKind' | 'dimension' | 'family'>): Promise<void> {
  return serial(async () => {
    const store = await readStore(ctx, id.learnerId, id.languageId);
    if (store.added.some((w) => w.unitId === word.unitId)) return;
    store.added = [...store.added, { unitId: word.unitId, unitKind: word.unitKind, dimension: word.dimension, family: word.family }].slice(-50);
    await writeStore(ctx, id.learnerId, id.languageId, store);
  });
}
export function removeFromAdded(ctx: AppContext, id: { learnerId: string; languageId: string }, unitId: string): Promise<void> {
  return serial(async () => {
    const store = await readStore(ctx, id.learnerId, id.languageId);
    store.added = store.added.filter((w) => w.unitId !== unitId);
    await writeStore(ctx, id.learnerId, id.languageId, store);
  });
}

/** Deck entries asked again, as a plan (cards the deck still holds as they stand; the rest as new), in the entries' order. */
export function planFromEntries(ctx: AppContext, model: ReviewModel, entries: readonly DeckEntry[], size = Math.max(1, entries.length)): Promise<SessionPlan> {
  const wanted: Wanted[] = entries.map((e) => {
    const outcome = model.outcomes.find((o) => o.unitId === e.unitId && o.proposed?.dimension === e.dimension);
    return { unitId: e.unitId, unitKind: e.unitKind, dimension: e.dimension, family: e.family, ...(outcome ? { outcome } : {}) };
  });
  return assemble(ctx, model, wanted, size);
}

/** A saved deck's cards asked again, as a plan. */
export const planFromSaved = (ctx: AppContext, model: ReviewModel, deck: SavedDeck): Promise<SessionPlan> => planFromEntries(ctx, model, deck.items);

// ───────────────────────────── after a session: repeat, or a new deck from the weak words ─────────────────────────────

/** What a finished session leaves behind that the next deck is built from. */
export interface FinishedRun {
  plan: SessionPlan;
  results: readonly ReviewResult[];
  /** Item ids the learner skipped (nothing was written for them). */
  skipped: readonly string[];
  /** Items the learner set aside (snoozed, suspended, dismissed): never asked again by the next deck. */
  controls: ReadonlyArray<{ itemId: string }>;
}

/** The cards of a finished session, in the order they were planned, as entries a new plan can be built from. */
export const entriesOf = (plan: SessionPlan): DeckEntry[] => plan.items.map(entryOf);

/** How a card counted as weak, from the weakest down: the order the next deck takes them in. */
export type Weakness = 'incorrect' | 'skipped' | 'partial' | 'hard' | 'unjudged';
export interface WeakEntry extends DeckEntry { weakness: Weakness }
const WEAKNESS_RANK: Readonly<Record<Weakness, number>> = { incorrect: 0, skipped: 1, partial: 2, hard: 3, unjudged: 4 };

/**
 * The weak words of a finished session: cards answered "not quite" (incorrect) or "partly" (partial), rated Again or Hard, skipped, or
 * not judged (ambiguous, failed audio); a card answered correctly is not weak, and one set aside is left out. Weakest first, then the
 * session's order; a card asked twice counts by its worst answer.
 */
export function weakEntries(run: FinishedRun): WeakEntry[] {
  const aside = new Set(run.controls.map((c) => c.itemId));
  const byItem = new Map<string, Weakness>();
  const worse = (itemId: string, w: Weakness): void => { const have = byItem.get(itemId); if (have === undefined || WEAKNESS_RANK[w] < WEAKNESS_RANK[have]) byItem.set(itemId, w); };
  for (const r of run.results) {
    const o = r.grading.outcome;
    if (o === 'incorrect' || r.rating === 1) worse(r.itemId, 'incorrect');
    else if (o === 'partial' || r.rating === 2) worse(r.itemId, r.rating === 2 && o === 'correct' ? 'hard' : 'partial');
    else if (o !== 'correct') worse(r.itemId, 'unjudged');
  }
  for (const id of run.skipped) worse(id, 'skipped');
  return run.plan.items
    .filter((p) => byItem.has(p.item.itemId) && !aside.has(p.item.itemId))
    .map((p) => ({ ...entryOf(p), weakness: byItem.get(p.item.itemId)! }))
    .sort((a, b) => WEAKNESS_RANK[a.weakness] - WEAKNESS_RANK[b.weakness]);
}

/** The share of a follow-up deck given to the previous deck's weak words; the rest is what is due or new next. */
export const WEAK_SHARE = 0.5;

export interface FollowUpDeck {
  plan: SessionPlan;
  /** How many of the weak words the deck asks (weakest first), and how many fresh cards fill the rest. */
  weakTaken: number;
  fresh: number;
  /** The weak words that did not fit the share, or that could not be asked. */
  weakLeft: number;
}

/**
 * A new deck after a session: half of it (WEAK_SHARE of the learner's cards-per-deck, rounded up) is the previous deck's weak words,
 * weakest first; the rest is what the home would offer next, with the previous deck's cards left out. Fewer weak words than the share
 * leaves more room for fresh cards; no fresh card leaves a deck of weak words alone; no weak word at all gives no deck (the caller
 * says so, and the home's current deck is the thing to begin instead).
 */
export async function planFollowUp(ctx: AppContext, model: ReviewModel, run: FinishedRun): Promise<FollowUpDeck | undefined> {
  const weak = weakEntries(run);
  if (!weak.length) return undefined;
  const size = fillSize(model);
  const share = Math.min(weak.length, Math.max(1, Math.ceil(size * WEAK_SHARE)));
  const weakPlan = await planFromEntries(ctx, model, weak.slice(0, share), share);
  const taken = new Set(weakPlan.items.map((p) => p.item.unitId));
  const previous = new Set(run.plan.items.map((p) => p.item.unitId));
  let items: PlannedItem[] = weakPlan.items;
  let fresh = 0;
  if (items.length < size) {
    const next = await planCurrentDeck(ctx, model, previous);
    const extra = next.plan.items.filter((p) => !taken.has(p.item.unitId) && !previous.has(p.item.unitId)).slice(0, size - items.length);
    fresh = extra.length;
    items = [...items, ...extra];
  }
  if (!items.length) return undefined;
  const plan: SessionPlan = {
    ...weakPlan, items, dueCount: 0, newCount: items.filter((p) => p.isNew).length,
    listeningCount: items.filter((p) => isAudio(p.family)).length, grammarCount: items.filter((p) => GRAMMAR.has(p.family)).length,
  };
  return { plan, weakTaken: weakPlan.items.length, fresh, weakLeft: weak.length - weakPlan.items.length };
}

// ───────────────────────────── saved decks ─────────────────────────────

export interface SavedDeck {
  id: string;
  savedAt: string;
  languageId: string;
  varietyId?: string;
  items: DeckEntry[];
  /** A built-in deck (Class Essentials) has a name, a description and notes of its own; a deck the learner saved has none. */
  name?: string;
  description?: string;
  notes?: string;
  builtin?: 'class-essentials';
}

type AddedWord = Pick<Wanted, 'unitId' | 'unitKind' | 'dimension' | 'family'>;
interface DeckStore { v: 1; decks: SavedDeck[]; holdOut: string[]; added: AddedWord[]; /** Built-in decks the learner removed (they stay removed until restored). */ dismissed: string[] }

export const decksKey = (learnerId: string, languageId: string): string => `gopractice:decks:${learnerId}:${languageId}`;
const MAX_SAVED = 60;

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
function cleanEntry(v: unknown): DeckEntry | undefined {
  const e = v as Partial<DeckEntry> | null;
  return e && typeof e === 'object' && str(e.itemId) && str(e.unitId) && str(e.unitKind) && str(e.dimension) && str(e.family)
    ? { itemId: e.itemId, unitId: e.unitId, unitKind: e.unitKind, label: str(e.label) ? e.label : unitLabel(e.unitId), dimension: e.dimension as AssessmentDimension, family: e.family as ExerciseFamily }
    : undefined;
}
function cleanStore(raw: unknown): DeckStore {
  const r = raw as Partial<DeckStore> | undefined;
  if (!r || typeof r !== 'object' || r.v !== 1 || !Array.isArray(r.decks)) return { v: 1, decks: [], holdOut: [], added: [], dismissed: [] };
  const decks: SavedDeck[] = [];
  for (const d of r.decks as Array<Partial<SavedDeck>>) {
    if (!d || !str(d.id) || !str(d.savedAt) || !str(d.languageId) || !Array.isArray(d.items)) continue;
    const items = d.items.map(cleanEntry).filter((x): x is DeckEntry => !!x);
    if (items.length) decks.push({ id: d.id, savedAt: d.savedAt, languageId: d.languageId, ...(str(d.varietyId) ? { varietyId: d.varietyId } : {}), items,
      ...(str(d.name) ? { name: d.name } : {}), ...(str(d.description) ? { description: d.description } : {}), ...(str(d.notes) ? { notes: d.notes } : {}), ...(d.builtin === 'class-essentials' ? { builtin: d.builtin } : {}) });
  }
  const added = (Array.isArray(r.added) ? r.added : []).filter((w): w is AddedWord => !!w && str((w as AddedWord).unitId) && str((w as AddedWord).unitKind) && str((w as AddedWord).dimension) && str((w as AddedWord).family));
  return { v: 1, decks, holdOut: Array.isArray(r.holdOut) ? r.holdOut.filter(str) : [], added, dismissed: Array.isArray(r.dismissed) ? r.dismissed.filter(str) : [] };
}

/** The words the learner added to the current deck by hand (My vocab, Add): the home's key reads them. */
export async function addedWords(ctx: AppContext, learnerId: string, languageId: string): Promise<Array<{ unitId: string }>> {
  return (await readStore(ctx, learnerId, languageId)).added;
}

async function readStore(ctx: AppContext, learnerId: string, languageId: string): Promise<DeckStore> {
  const key = decksKey(learnerId, languageId);
  try { return cleanStore((await ctx.deps.area.get(key))[key]); } catch { return cleanStore(undefined); }
}
const writeStore = (ctx: AppContext, learnerId: string, languageId: string, store: DeckStore): Promise<void> =>
  ctx.deps.area.set({ [decksKey(learnerId, languageId)]: store });

/** Saved decks and writes are serialised, so two quick taps cannot overwrite each other. */
let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const run = chain.then(fn, fn); chain = run.catch(() => undefined); return run; };

/**
 * The saved decks of one language, newest first. Class Essentials is seeded here on the first visit, with the stable id `class-essentials:<lang>`:
 * a second call finds it and adds nothing, and a deck the learner removed stays removed until it is restored.
 */
export async function listSavedDecks(ctx: AppContext, learnerId: string, languageId: string, varietyId?: string): Promise<SavedDeck[]> {
  const first = await readStore(ctx, learnerId, languageId);
  if (!classLanguageOf(languageId)) return first.decks;
  return serial(async () => {
    const store = await readStore(ctx, learnerId, languageId);
    const seed = classDeckFor(languageId, varietyId, ctx.deps.now().toISOString());
    if (seed && !store.dismissed.includes(seed.id) && !store.decks.some((d) => d.id === seed.id)) {
      store.decks = [seed, ...store.decks];
      await writeStore(ctx, learnerId, languageId, store);
    }
    return store.decks;
  });
}
/** Whether Class Essentials was removed, so Saved decks can offer to restore it. */
export async function classEssentialsRemoved(ctx: AppContext, learnerId: string, languageId: string): Promise<boolean> {
  const id = classDeckFor(languageId, undefined, '')?.id;
  return !!id && (await readStore(ctx, learnerId, languageId)).dismissed.includes(id);
}
export function restoreClassEssentials(ctx: AppContext, learnerId: string, languageId: string): Promise<void> {
  return serial(async () => {
    const store = await readStore(ctx, learnerId, languageId);
    const id = classDeckFor(languageId, undefined, '')?.id;
    if (!id) return;
    store.dismissed = store.dismissed.filter((d) => d !== id);
    await writeStore(ctx, learnerId, languageId, store);
  });
}
export async function holdOutOf(ctx: AppContext, learnerId: string, languageId: string): Promise<Set<string>> {
  return new Set((await readStore(ctx, learnerId, languageId)).holdOut);
}

/** Moves the deck to the saved list; its units are held out of the next deck so a fresh one is planned. */
export function saveDeck(ctx: AppContext, id: { learnerId: string; languageId: string; varietyId?: string }, entries: readonly DeckEntry[]): Promise<SavedDeck | undefined> {
  return serial(async () => {
    if (!entries.length) return undefined;
    const store = await readStore(ctx, id.learnerId, id.languageId);
    const saved: SavedDeck = { id: ctx.deps.newId(), savedAt: ctx.deps.now().toISOString(), languageId: id.languageId, ...(id.varietyId ? { varietyId: id.varietyId } : {}), items: entries.map((e) => ({ ...e })) };
    store.decks = [saved, ...store.decks].slice(0, MAX_SAVED);
    store.holdOut = [...new Set(entries.map((e) => e.unitId))];
    store.added = [];
    await writeStore(ctx, id.learnerId, id.languageId, store);
    return saved;
  });
}
export function removeSavedDeck(ctx: AppContext, learnerId: string, languageId: string, deckId: string): Promise<void> {
  return serial(async () => {
    const store = await readStore(ctx, learnerId, languageId);
    const gone = store.decks.find((d) => d.id === deckId);
    store.decks = store.decks.filter((d) => d.id !== deckId);
    if (gone?.builtin && !store.dismissed.includes(gone.id)) store.dismissed = [...store.dismissed, gone.id];
    await writeStore(ctx, learnerId, languageId, store);
  });
}
/** Once a session has begun the held-out units may come back in later decks, and the words added by hand have been asked. */
export function releaseHoldOut(ctx: AppContext, learnerId: string, languageId: string): Promise<void> {
  return serial(async () => {
    const store = await readStore(ctx, learnerId, languageId);
    if (!store.holdOut.length && !store.added.length) return;
    store.holdOut = [];
    store.added = [];
    await writeStore(ctx, learnerId, languageId, store);
  });
}

// ───────────────────────────── my vocab ─────────────────────────────

export type VocabSort = 'least' | 'recent';

/** One line of My vocab: a word, once, however many Repository records (its lemma, its forms) stand behind it. */
export interface VocabRow {
  unitId: string;
  label: string;
  level: KnowledgeLevel;
  encounters: number;
  /** When the word was last tapped or met (ISO). */
  lastSeenAt?: string;
  /** The surface forms it was met as, when they differ from the word itself. */
  metAs?: string[];
  /** The kind of the displayed unit (lexeme, form, ...) and every record folded into this entry. */
  kind?: string;
  unitIds?: string[];
}

/** A Repository record as listed, before records of the same word are folded together. */
export interface VocabRecord extends VocabRow {
  kind: string;
  /** The lemma unit this record is a form of, when the Repository says so. */
  lemmaId?: string;
  forms: string[];
}

const normWord = (s: string): string => s.normalize('NFC').toLowerCase();

/**
 * One entry per word. A form record whose lemma record is in the list folds into the lemma's entry; two records with the same
 * word fold too (a form spelled like its lemma, whatever the Repository says). The lemma is the displayed word; the level is the
 * higher of the records', the encounters the larger, the last-seen the later; forms met under another spelling are listed in `metAs`.
 */
export function mergeVocab(records: readonly VocabRecord[]): VocabRow[] {
  const byId = new Map(records.map((r) => [r.unitId, r] as const));
  const parent = new Map<string, string>(records.map((r) => [r.unitId, r.unitId] as const));
  const find = (id: string): string => { let x = id; while (parent.get(x) !== x) x = parent.get(x)!; return x; };
  const join = (a: string, b: string): void => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const firstOfWord = new Map<string, string>();
  for (const r of records) {
    if (r.lemmaId && r.lemmaId !== r.unitId && byId.has(r.lemmaId)) join(r.lemmaId, r.unitId);
    const w = normWord(r.label);
    const seen = firstOfWord.get(w);
    if (seen) join(seen, r.unitId); else firstOfWord.set(w, r.unitId);
  }
  const groups = new Map<string, VocabRecord[]>();
  for (const r of records) { const k = find(r.unitId); groups.set(k, [...(groups.get(k) ?? []), r]); }
  const out: VocabRow[] = [];
  for (const members of groups.values()) {
    const isLemma = (r: VocabRecord): boolean => r.kind !== 'form' && members.some((m) => m.lemmaId === r.unitId) ;
    const shown = members.find(isLemma) ?? members.find((r) => r.kind !== 'form') ?? [...members].sort((a, b) => b.encounters - a.encounters)[0];
    const level = members.reduce<KnowledgeLevel>((best, r) => (rankOf(r.level) > rankOf(best) ? r.level : best), shown.level);
    const lastSeen = members.map((r) => r.lastSeenAt).filter((t): t is string => !!t).sort().at(-1);
    const met = [...new Set(members.flatMap((r) => [...r.forms, ...(r.kind === 'form' ? [r.label] : [])]).filter((f) => f && normWord(f) !== normWord(shown.label)))].slice(0, 3);
    out.push({
      unitId: shown.unitId, label: shown.label, kind: shown.kind, unitIds: members.map((m) => m.unitId), level, encounters: Math.max(...members.map((r) => r.encounters)),
      ...(lastSeen ? { lastSeenAt: lastSeen } : {}), ...(met.length ? { metAs: met } : {}),
    });
  }
  return out;
}

/** Least known first (level, then fewest encounters), or the most recently encountered first. Ties fall back to the word, so the order is stable. */
export function sortVocab<T extends VocabRow>(rows: readonly T[], sort: VocabSort): T[] {
  const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  const when = (r: VocabRow): number => { const t = r.lastSeenAt ? Date.parse(r.lastSeenAt) : NaN; return Number.isFinite(t) ? t : -Infinity; };
  return [...rows].sort(sort === 'recent'
    ? (a, b) => when(b) - when(a) || text(a.label, b.label) || text(a.unitId, b.unitId)
    : (a, b) => rankOf(a.level) - rankOf(b.level) || a.encounters - b.encounters || text(a.label, b.label) || text(a.unitId, b.unitId));
}

const MAX_VOCAB_PAGES = 60;
const UNITS_PER_BATCH = 50;

/**
 * Every word the learner has met in the language: the Repository's vocabulary records (its knowledge rows), with each form's lemma
 * looked up, folded to one entry per word. Without the lemma lookup (it fails, or the Repository cannot answer) forms that are spelled
 * like their lemma still fold, and the rest stay their own entries.
 */
export async function loadVocab(ctx: AppContext, languageId: string): Promise<{ rows: VocabRow[]; total: number; /** Set when the Repository could not answer and the rows are the device's snapshot: when it was taken (ISO). */ stale?: string }> {
  try {
    const fresh = await loadVocabLive(ctx, languageId);
    const who = await ctx.identity().catch(() => undefined);
    if (who && who.languageId === languageId) await writeSnapshot(ctx, who.learnerId, languageId, { vocab: { savedAt: ctx.deps.now().toISOString(), rows: fresh.rows.slice(0, MAX_SNAPSHOT_WORDS) } });
    return fresh;
  } catch (e) {
    // offline (or the service is down): the words this device last saw, said to be so
    const who = await ctx.identity().catch(() => undefined);
    const snap = who ? await readSnapshot(ctx, who.learnerId, languageId) : undefined;
    if (snap?.vocab && who?.languageId === languageId) return { rows: snap.vocab.rows as VocabRow[], total: snap.vocab.rows.length, stale: snap.vocab.savedAt };
    throw e;
  }
}

async function loadVocabLive(ctx: AppContext, languageId: string): Promise<{ rows: VocabRow[]; total: number }> {
  const { api } = await ctx.api();
  const records: VocabRecord[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_VOCAB_PAGES; page++) {
    const r = await api.vocabulary({ languageId, sort: 'recent', limit: 100, ...(after ? { after } : {}) });
    if (!r.ok) throw new Error(r.message || `The Repository answered ${r.status}.`);
    for (const item of r.data.items) {
      const k = item.knowledge;
      if (isClassUnit(k.unitId)) continue; // the Class Essentials cards are not vocabulary the learner met
      const last = k.lastSeenAt ?? item.lastEncounter;
      records.push({
        unitId: k.unitId, label: item.unit?.label || unitLabel(k.unitId), level: k.level, encounters: k.encounters, ...(last ? { lastSeenAt: last } : {}),
        kind: item.unit?.kind ?? k.unitId.split(':', 1)[0], forms: item.surfaceForms ?? [],
      });
    }
    after = r.data.nextCursor;
    if (!after) break;
  }
  const forms = records.filter((r) => r.kind === 'form');
  const present = new Set(records.map((r) => r.unitId));
  if (typeof api.units === 'function' && forms.length) {
    const chunks: VocabRecord[][] = [];
    for (let at = 0; at < forms.length; at += UNITS_PER_BATCH) chunks.push(forms.slice(at, at + UNITS_PER_BATCH));
    // the batches are independent of one another: all at once, not one after the other (a batch that fails leaves its forms without a lemma)
    const answers = await Promise.all(chunks.map(async (chunk) => { try { const u = await api.units(chunk.map((f) => f.unitId)); return u.ok ? u.data.units : undefined; } catch { return undefined; } }));
    answers.forEach((units, i) => {
      if (!units) return;
      for (const f of chunks[i]) {
        const rel = units[f.unitId]?.relations.find((x) => x.relation === 'form-of' && x.fromId === f.unitId);
        if (rel && present.has(rel.toId)) f.lemmaId = rel.toId;
      }
    });
  }
  const rows = mergeVocab(records);
  return { rows, total: rows.length };
}

/** How many words the learner has met: the merged entries of My vocab. */
export const vocabCount = (rows: readonly VocabRow[]): number => rows.length;
