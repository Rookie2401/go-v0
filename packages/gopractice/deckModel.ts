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
import type { AssessmentDimension, DeckItem, ExerciseFamily, IntakeOutcome, PlannedItem, SessionPlan } from '../goreview/src/types';
import type { AppContext } from './context';
import { unitLabel } from './format';
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

/** How many cards a filled deck holds: about two a minute of the session length, 10 when the length is flexible. */
export function fillSize(model: Pick<ReviewModel, 'prefs'>): number {
  const minutes = model.prefs.sessionMinutes;
  return minutes === 0 ? 10 : Math.min(30, Math.max(5, Math.round(minutes * 2)));
}

const entryOf = (p: PlannedItem): DeckEntry => ({
  itemId: p.item.itemId, unitId: p.item.unitId, unitKind: p.item.unitKind, label: unitLabel(p.item.unitId), dimension: p.item.dimension, family: p.item.family,
});

/** The deck as the scheduler plans it today, with the units of `holdOut` left out (the deck that was just saved). */
function scheduledPlan(ctx: AppContext, model: ReviewModel, holdOut: ReadonlySet<string>): SessionPlan {
  return ctx.engine.plan({
    deck: model.deck.filter((i) => !holdOut.has(i.unitId)),
    intake: model.outcomes.filter((o) => model.choices[o.unitId] !== 'later' && !holdOut.has(o.unitId)),
    prefs: model.prefs, audio: model.audio, now: model.now, knowledge: model.knowledge, readingSignals: model.events,
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
    model.deck.find((i) => i.unitId === w.unitId && i.dimension === w.dimension && i.status !== 'dismissed' && i.status !== 'suspended');
  const direct = new Map<string, PlannedItem>();
  const fresh: IntakeOutcome[] = [];
  const order: string[] = [];
  const api = (await ctx.api()).api;
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
export const VOCAB_NOTE = 'These cards come from your vocabulary, not from the review schedule: nothing was due and nothing was proposed.';

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
  let filled = false;
  if (!plan.items.length) {
    const pool = fillOrder(model, holdOut);
    if (pool.length) { plan = await assemble(ctx, model, pool, size); filled = plan.items.length > 0; }
  }
  let rows = vocab;
  if (!plan.items.length) {
    rows = rows ?? await loadVocabSafe(ctx, languageId);
    if (rows.length) {
      const order = vocabularyOrder(rows, holdOut);
      // the exercise engine may refuse every word it cannot build yet; the deck is still offered, and the session says which cards it could not ask
      let fromVocab = await assemble(ctx, model, order, size);
      if (!fromVocab.items.length) fromVocab = await assemble(ctx, model, order, size, { unchecked: true });
      plan = { ...fromVocab, items: fromVocab.items.map((p) => ({ ...p, why: [VOCAB_NOTE, ...p.why] })) };
      filled = plan.items.length > 0;
    }
  }
  // the learner's own additions lead the deck
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

/** A saved deck's cards asked again, as a plan (cards the deck still holds as they stand; the rest as new). */
export function planFromSaved(ctx: AppContext, model: ReviewModel, deck: SavedDeck): Promise<SessionPlan> {
  const wanted: Wanted[] = deck.items.map((e) => ({
    unitId: e.unitId, unitKind: e.unitKind, dimension: e.dimension, family: e.family,
    ...(model.outcomes.find((o) => o.unitId === e.unitId && o.proposed?.dimension === e.dimension) ? { outcome: model.outcomes.find((o) => o.unitId === e.unitId && o.proposed?.dimension === e.dimension) } : {}),
  }));
  return assemble(ctx, model, wanted, Math.max(1, deck.items.length));
}

// ───────────────────────────── saved decks ─────────────────────────────

export interface SavedDeck {
  id: string;
  savedAt: string;
  languageId: string;
  varietyId?: string;
  items: DeckEntry[];
}

type AddedWord = Pick<Wanted, 'unitId' | 'unitKind' | 'dimension' | 'family'>;
interface DeckStore { v: 1; decks: SavedDeck[]; holdOut: string[]; added: AddedWord[] }

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
  if (!r || typeof r !== 'object' || r.v !== 1 || !Array.isArray(r.decks)) return { v: 1, decks: [], holdOut: [], added: [] };
  const decks: SavedDeck[] = [];
  for (const d of r.decks as Array<Partial<SavedDeck>>) {
    if (!d || !str(d.id) || !str(d.savedAt) || !str(d.languageId) || !Array.isArray(d.items)) continue;
    const items = d.items.map(cleanEntry).filter((x): x is DeckEntry => !!x);
    if (items.length) decks.push({ id: d.id, savedAt: d.savedAt, languageId: d.languageId, ...(str(d.varietyId) ? { varietyId: d.varietyId } : {}), items });
  }
  const added = (Array.isArray(r.added) ? r.added : []).filter((w): w is AddedWord => !!w && str((w as AddedWord).unitId) && str((w as AddedWord).unitKind) && str((w as AddedWord).dimension) && str((w as AddedWord).family));
  return { v: 1, decks, holdOut: Array.isArray(r.holdOut) ? r.holdOut.filter(str) : [], added };
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

export async function listSavedDecks(ctx: AppContext, learnerId: string, languageId: string): Promise<SavedDeck[]> {
  return (await readStore(ctx, learnerId, languageId)).decks;
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
    store.decks = store.decks.filter((d) => d.id !== deckId);
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
export async function loadVocab(ctx: AppContext, languageId: string): Promise<{ rows: VocabRow[]; total: number }> {
  const { api } = await ctx.api();
  const records: VocabRecord[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_VOCAB_PAGES; page++) {
    const r = await api.vocabulary({ languageId, sort: 'recent', limit: 100, ...(after ? { after } : {}) });
    if (!r.ok) throw new Error(r.message || `The Repository answered ${r.status}.`);
    for (const item of r.data.items) {
      const k = item.knowledge;
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
  for (let at = 0; at < forms.length && typeof api.units === 'function'; at += UNITS_PER_BATCH) {
    const chunk = forms.slice(at, at + UNITS_PER_BATCH);
    try {
      const u = await api.units(chunk.map((f) => f.unitId));
      if (!u.ok) break;
      for (const f of chunk) {
        const rel = u.data.units[f.unitId]?.relations.find((x) => x.relation === 'form-of' && x.fromId === f.unitId);
        if (rel && present.has(rel.toId)) f.lemmaId = rel.toId;
      }
    } catch { break; }
  }
  const rows = mergeVocab(records);
  return { rows, total: rows.length };
}

/** How many words the learner has met: the merged entries of My vocab. */
export const vocabCount = (rows: readonly VocabRow[]): number => rows.length;
