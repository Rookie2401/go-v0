import { itemIdFor } from '../src/scheduler/deck';
/**
 * GoReview batches contain justified eligible work. Batch size is a maximum, never
 * a demand to fill. Saved/selected practice carries a typed explicit intent.
 */
import { KNOWLEDGE_LEVELS, type KnowledgeLevel } from '../../repository-contract/src';
import type { AssessmentDimension, DeckItem, ExerciseFamily, IntakeOutcome, PlannedItem, ReviewIntent, SessionPlan } from '../src/types';
import { reviewEligibility } from '../src/planner/eligibility';
import { admissionBudget } from '../src/planner/budget';
import { chooseMicrodeckTarget, microdeckMaximum } from '../src/planner/microdeck';
import { estimateSeconds, microdeckObservations } from '../src/planner/planner';
import { remediationBacklog, type RemediationCandidate } from '../src/planner/remediation';
import type { AppContext } from './context';
import { unitLabel } from './format';
import { recordSavedDeckChange, sharedSavedDecks } from './savedDeckSync';
import { classDeckFor, classLanguageOf, isClassUnit } from './classEssentials';
import { readSnapshot, writeSnapshot, MAX_SNAPSHOT_WORDS } from './snapshot';
import { observedReviewSeconds, type ReviewModel } from './workspace';

export interface DeckEntry {
  itemId: string; unitId: string; unitKind: string; label: string;
  dimension: AssessmentDimension; family: ExerciseFamily;
}
export interface CurrentDeck {
  plan: SessionPlan; entries: DeckEntry[]; filled: boolean; hasVocabulary: boolean;
  summary: { dueReviews: number; dueLearning: number; newAvailable: number; remediation: number; classRemediation: number; targetQuestions: number;
    questionsAvailable: number; batchQuestions: number; estimatedSeconds: number; workloadLimit: number; nextReturnAt?: string; nextReviewAt?: string };
  remediation: RemediationCandidate[];
}
export interface Wanted { unitId: string; unitKind: string; dimension: AssessmentDimension; family: ExerciseFamily; outcome?: IntakeOutcome }
const rankOf = (level: KnowledgeLevel | undefined): number => (level ? Math.max(0, KNOWLEDGE_LEVELS.indexOf(level)) : 0);
const isAudio = (family: ExerciseFamily): boolean => family === 'audio-to-meaning' || family === 'audio-transcription';
const GRAMMAR: ReadonlySet<ExerciseFamily> = new Set(['morphological-identification', 'grammar-application']);
export const fillSize = (model: Pick<ReviewModel, 'prefs'>): number => microdeckMaximum(model.prefs.cardsPerDeck);
const entryOf = (p: PlannedItem): DeckEntry => ({ itemId: p.item.itemId, unitId: p.item.unitId, unitKind: p.item.unitKind,
  label: unitLabel(p.item.unitId), dimension: p.item.dimension, family: p.family });
const effective = (item: DeckItem) => item.history.filter(h => !h.retracted && !h.scheduleExcluded && !h.conflict);
const knownItem = (model: ReviewModel, w: Pick<Wanted, 'unitId' | 'dimension'>) =>
  [...model.deck, ...(model.classDeck ?? [])].find(i => i.unitId === w.unitId && i.dimension === w.dimension);
function eligibility(model: ReviewModel, w: Wanted, intent: ReviewIntent, remainingNew: number) {
  return reviewEligibility({ item: knownItem(model, w), itemId:itemIdFor(w.unitId,w.dimension), unitId: w.unitId, knowledge: model.knowledge.find(k => k.unitId === w.unitId),
    events: model.events, now: model.now, intent, remainingNew,
    factsInvalidated: ['needs-validation', 'too-uncertain'].includes(w.outcome?.decision ?? '') });
}
const budgetFor = (model: ReviewModel) => admissionBudget(model.events, {
  learnerId: model.identity.learnerId, languageId: model.identity.languageId, now: model.now,
  maxNew: model.prefs.maxNew, dailyNewLimit: model.prefs.dailyNewLimit ?? model.prefs.maxNew,
});
function scheduledPlan(ctx: AppContext, model: ReviewModel, holdOut: ReadonlySet<string>): SessionPlan {
  return ctx.engine.plan({ deck: model.deck.filter(i => !isClassUnit(i.unitId)
      // A saved collection may hold a unit out of fresh admission, but it cannot
      // erase an existing scheduled obligation from the primary automatic plan.
      && (!holdOut.has(i.unitId) || Date.parse(i.schedule.due) <= Date.parse(model.now))),
    intake: model.outcomes.filter(o => model.choices[o.unitId] !== 'later' && !holdOut.has(o.unitId)),
    prefs: model.prefs, audio: model.audio, now: model.now, knowledge: model.knowledge, readingSignals: model.events,
    schedulerProfile: model.schedulerProfile, observedReviewSeconds: observedReviewSeconds(model.events), intent: { kind: 'automatic' } });
}
/** All callers, including explicit saved decks, use the same hard control gates. */
export async function assemble(ctx: AppContext, model: ReviewModel, wanted: readonly Wanted[], size: number,
  opts: { unchecked?: boolean; intent?: ReviewIntent; origin?: PlannedItem['origin'] } = {}): Promise<SessionPlan> {
  const intent: ReviewIntent = opts.intent ?? { kind: 'automatic' };
  const explicit = intent.kind === 'explicit';
  const target = chooseMicrodeckTarget({ configuredMaximum: model.prefs.cardsPerDeck,
    observations: microdeckObservations(model.events, model.identity.languageId, model.now),
    cognitiveCost: model.outcomes.filter(o=>o.decision==='test-now').reduce((sum,o)=>sum+(Number.isFinite(o.candidate.cost)?o.candidate.cost:0),0)
      / Math.max(1,model.outcomes.filter(o=>o.decision==='test-now').length) });
  const requestedLimit = Number.isFinite(size) ? Math.max(0, Math.min(Math.floor(size), fillSize(model), target.targetQuestions)) : 0;
  const listeningOk = model.prefs.includeListening && model.audio.available;
  const holds = (w: Wanted): DeckItem | undefined =>
    [...model.deck, ...(model.classDeck ?? [])].find((i) => i.unitId === w.unitId && i.dimension === w.dimension && i.status !== 'dismissed' && i.status !== 'suspended');
  const direct = new Map<string, PlannedItem>();
  const fresh: IntakeOutcome[] = [];
  const order: string[] = [];
  const api = (await ctx.api()).api;
  // Prime the facts cache in one request for the likely candidates; factsFor remains
  // the fallback when a batch read is unavailable.
  if (ctx.engine.primeFacts && !opts.unchecked) {
    const probe = [...new Set(wanted.filter((w) => !holds(w) && !(isAudio(w.family) && !listeningOk)).slice(0, (size + 4) * 3).map((w) => w.unitId))];
    if (probe.length) { try { await ctx.engine.primeFacts(model.identity.languageId, api, probe); } catch { /* factsFor still answers one by one */ } }
  }
  let remainingNew = Math.min(model.prefs.maxNew, budgetFor(model).remaining);
  for (const w of wanted) {
    if (order.length >= requestedLimit) break;
    const key = w.unitId + '|' + w.dimension;
    if (order.includes(key) || isAudio(w.family) && !listeningOk || !eligibility(model, w, intent, remainingNew).eligible) continue;
    const held = knownItem(model, w);
    if (held) {
      direct.set(key, { item: held, family: held.family, why: [explicit ? 'Optional independent practice at the actual review time.' : 'Eligible scheduled work.'],
        estimatedSeconds: observedReviewSeconds(model.events)[held.itemId] ?? estimateSeconds(held.family,held.schedule.phase),
        isNew: effective(held).length === 0, schedulingCardExists: true, admissionKnowledge:model.knowledge.find(k=>k.unitId===held.unitId), origin: opts.origin ?? 'scheduled', intent });
      if (!explicit && effective(held).length === 0) remainingNew--;
    } else {
      // No unchecked fallback: an unbuildable or invalid exercise is never demand.
      if (!ctx.engine.exerciseAvailable || !(await ctx.engine.exerciseAvailable({ unitId: w.unitId, unitKind: w.unitKind,
        languageId: model.identity.languageId, dimension: w.dimension, family: w.family, api, now: model.now }).catch(() => false))) continue;
      const base: IntakeOutcome = w.outcome ?? { unitId: w.unitId, decision: 'test-now', reasons: ['Explicit vocabulary practice.'],
        candidate: { unitId: w.unitId, kind: w.unitKind, score: .5, reasons: [], targetDimension: 'readingRecognition',
          eligibility: { eligible: true, status: 'high-confidence', caveats: [] }, cost: .2 } };
      fresh.push({ ...base, decision: 'test-now', proposed: { dimension: w.dimension, family: w.family }, explicitlySelected: explicit, intent });
      if (!explicit) remainingNew--;
    }
    order.push(key);
  }
  const skeleton = ctx.engine.plan({ deck: [], intake: fresh, prefs: { ...model.prefs, sessionMinutes: 0,
      ...(explicit ? { maxNew: Math.max(1, fresh.length) } : {}) }, audio: model.audio, now: model.now, knowledge: model.knowledge,
    readingSignals: model.events, schedulerProfile: model.schedulerProfile, intent });
  const built = new Map(skeleton.items.map(p => [p.item.unitId + '|' + p.item.dimension,
    { ...p, schedulingCardExists: false, origin: opts.origin ?? 'explicit', intent }]));
  const timeLimit = model.prefs.sessionMinutes === 0 ? Infinity : Math.max(0,model.prefs.sessionMinutes * 60);
  const selected: PlannedItem[] = [], skipped = [...skeleton.skipped]; let usedSeconds=0;
  for (const key of order) {
    const planned = direct.get(key) ?? built.get(key);
    if (!planned) continue;
    if (usedSeconds + planned.estimatedSeconds > timeLimit) { skipped.push({ itemId:planned.item.itemId, why:'over workload limit; remains in the saved or selected collection' }); continue; }
    usedSeconds += planned.estimatedSeconds;
    const repeated = !planned.isNew;
    selected.push({ ...planned, ...(repeated ? { overlap:'explicit' as const, presentationReason:'explicit-repeat' } : {}) });
  }
  const items = selected;
  const workloadLimit = Number.isFinite(timeLimit) ? timeLimit : 0;
  return { ...skeleton, items, skipped, questionLimit: items.length, intent,
    batch: { targetQuestions: requestedLimit, workloadLimit, estimatedSeconds:usedSeconds, reasons: [...target.reasons, 'Explicit practice is capped by the requested collection, configured maximum, and available session time.'] },
    initialQuestionCount: items.length,
    dueCount: items.filter(p => effective(p.item).length && Date.parse(p.item.schedule.due) <= Date.parse(model.now)).length,
    newCount: items.filter(p => p.isNew).length, listeningCount: items.filter(p => isAudio(p.family)).length,
    grammarCount: items.filter(p => GRAMMAR.has(p.family)).length };
}
export const VOCAB_NOTE = 'Optional vocabulary practice uses actual review times and does not create a due obligation just to fill a batch.';
export async function loadVocabSafe(ctx: AppContext, languageId: string): Promise<VocabRow[]> {
  try { return (await loadVocab(ctx, languageId)).rows; } catch { return []; }
}
/** Only justified scheduler/intake work is offered. Catalog membership never fills a batch. */
export async function planCurrentDeck(ctx: AppContext, model: ReviewModel, holdOut: ReadonlySet<string> = new Set(), vocab?: readonly VocabRow[]): Promise<CurrentDeck> {
  const planned = scheduledPlan(ctx, model, holdOut);
  const items = (model.schedulerIssue ? [] : planned.items).map(p => ({ ...p, schedulingCardExists: !!knownItem(model, p.item),
    origin: knownItem(model, p.item) ? 'scheduled' as const : 'intake' as const, intent: { kind: 'automatic' as const } }));
  const remediation = remediationBacklog(model.deck.filter(item => !item.invalidatedAt), model.events, model.now);
  const classRemediation = remediationBacklog((model.classDeck ?? []).filter(item => !item.invalidatedAt), model.events, model.now);
  const plan: SessionPlan = { ...planned, items, initialQuestionCount:items.length,
    availableWork: model.schedulerIssue ? { questions:0,newQuestions:0 } : planned.availableWork ?? { questions:items.length,newQuestions:items.filter(p=>p.isNew).length },
    batch: { ...(planned.batch ?? { targetQuestions: fillSize(model), workloadLimit:model.prefs.sessionMinutes===0?0:model.prefs.sessionMinutes*60, estimatedSeconds:0, reasons:[] }),
      estimatedSeconds:items.reduce((sum,p)=>sum+p.estimatedSeconds,0) },
    ...(model.schedulerIssue ? { questionLimit:0 } : {}) };
  const targetQuestions = plan.batch?.targetQuestions ?? fillSize(model);
  const workloadLimit = plan.batch?.workloadLimit ?? (model.prefs.sessionMinutes===0?0:model.prefs.sessionMinutes*60);
  const estimatedSeconds = plan.batch?.estimatedSeconds ?? items.reduce((sum,p)=>sum+p.estimatedSeconds,0);
  const summary: CurrentDeck['summary'] = { dueReviews: 0, dueLearning: 0, newAvailable:plan.availableWork?.newQuestions ?? items.filter(p => p.isNew).length,
    remediation: remediation.length, classRemediation: classRemediation.length, targetQuestions, questionsAvailable:plan.availableWork?.questions ?? items.length, batchQuestions:items.length, estimatedSeconds, workloadLimit };
  for (const item of model.deck) {
    const w = { unitId: item.unitId, unitKind: item.unitKind, dimension: item.dimension, family: item.family };
    if (!effective(item).length || isClassUnit(item.unitId)) continue;
    const due = Date.parse(item.schedule.due) <= Date.parse(model.now);
    if (due && eligibility(model, w, { kind: 'automatic' }, 0).eligible) {
      if (item.schedule.phase === 'learning' || item.schedule.phase === 'relearning') summary.dueLearning++;
      else summary.dueReviews++;
    } else if (!due && item.status === 'active' && !item.invalidatedAt && !item.suspendedReason) {
      const dueAt = Date.parse(item.schedule.due);
      const canBecomeDue = Number.isFinite(dueAt) && reviewEligibility({ item, itemId:item.itemId, unitId:item.unitId, knowledge:model.knowledge.find(k=>k.unitId===item.unitId),
        events:model.events, now:item.schedule.due, intent:{ kind:'explicit', reason:'early-review', requestedAt:model.now }, remainingNew:0 }).eligible;
      if (canBecomeDue && (item.schedule.phase==='learning' || item.schedule.phase==='relearning')
        && (!summary.nextReturnAt || dueAt < Date.parse(summary.nextReturnAt))) summary.nextReturnAt = item.schedule.due;
      else if (canBecomeDue && item.schedule.phase==='review'
        && (!summary.nextReviewAt || dueAt < Date.parse(summary.nextReviewAt))) summary.nextReviewAt = item.schedule.due;
    }
  }
  Object.assign(plan, { intent: { kind: 'automatic' as const },
    dueCount: items.filter(p => !p.isNew && Date.parse(p.item.schedule.due) <= Date.parse(model.now)).length,
    newCount: items.filter(p => p.isNew).length });
  return { plan, entries: items.map(entryOf), filled: false, summary, remediation,
    hasVocabulary: !!(items.length || model.outcomes.length || model.deck.length || model.knowledge.length || vocab?.length) };
}

/** Due-only Class Essentials practice. Unreviewed seeded cards are never admitted as new work here. */
export async function planClassEssentialsDue(ctx: AppContext, model: ReviewModel): Promise<SessionPlan> {
  const deck = (model.classDeck ?? []).filter(item => effective(item).length > 0
    && item.status === 'active' && !item.invalidatedAt && !item.suspendedReason
    && Date.parse(item.schedule.due) <= Date.parse(model.now));
  const plan = ctx.engine.plan({ deck, intake: [], prefs: model.prefs, audio: model.audio, now: model.now,
    knowledge: model.knowledge, readingSignals: model.events, schedulerProfile: model.schedulerProfile,
    observedReviewSeconds: observedReviewSeconds(model.events), intent: { kind: 'automatic' } });
  return { ...plan, dueCount: plan.items.length, newCount: 0 };
}
export async function selectedPracticeUnits(ctx: AppContext, learnerId: string, languageId: string): Promise<string[]> {
  return (await readStore(ctx, learnerId, languageId)).added.map(w => w.unitId);
}
export async function planSelectedPractice(ctx: AppContext, model: ReviewModel): Promise<SessionPlan> {
  const added = (await readStore(ctx, model.identity.learnerId, model.identity.languageId)).added;
  return assemble(ctx, model, added, added.length, { intent: { kind: 'explicit', reason: 'selected-vocabulary', requestedAt: model.now }, origin: 'vocabulary' });
}

/** The card a word added by hand should be asked as: a multiword unit (a phrase: unit id `phrase:...` or kind multiword/phrase) can only be built as phrase-comprehension; every other unit as written-recognition. */
export function addedCardFor(unitId: string, unitKind: string | undefined): Pick<Wanted, 'dimension' | 'family'> {
  const phrase = unitKind === 'multiword' || unitKind === 'phrase' || unitId.startsWith('phrase:');
  return phrase ? { dimension: 'phrase-comprehension', family: 'phrase-comprehension' } : { dimension: 'written-recognition', family: 'written-recognition' };
}

/** Puts a word into the current deck by the learner's own choice: it leads the deck until the session begins or the deck is saved. */
export function addToDeck(ctx: AppContext, id: { learnerId: string; languageId: string }, word: Pick<Wanted, 'unitId' | 'unitKind' | 'dimension' | 'family'>): Promise<void> {
  return serial(async () => {
    const store = await readStore(ctx, id.learnerId, id.languageId);
    store.added = [...store.added.filter((w) => w.unitId !== word.unitId), { unitId: word.unitId, unitKind: word.unitKind, dimension: word.dimension, family: word.family }].slice(-50);
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
  return assemble(ctx, model, wanted, size, { intent: { kind: 'explicit', reason: 'saved-deck', requestedAt: model.now }, origin: 'saved-deck' });
}

/** A saved deck's cards asked again, as a plan. */
export const planFromSaved = (ctx: AppContext, model: ReviewModel, deck: SavedDeck): Promise<SessionPlan> => planFromEntries(ctx, model, deck.items);

/** Optional delayed retrieval over persisted remediation candidates; it does not alter the scheduled queue. */
export async function planRemediation(ctx: AppContext, model: ReviewModel, candidates = remediationBacklog([...model.deck, ...(model.classDeck ?? [])].filter(item => !item.invalidatedAt), model.events, model.now)): Promise<SessionPlan> {
  const ready = new Set(candidates.filter(candidate => candidate.ready).map(candidate => candidate.itemId));
  const entries = [...model.deck, ...(model.classDeck ?? [])].filter(item => ready.has(item.itemId)).map(item => ({
    itemId: item.itemId, unitId: item.unitId, unitKind: item.unitKind, label: unitLabel(item.unitId), dimension: item.dimension, family: item.family,
  }));
  const plan = await assemble(ctx, model, entries, fillSize(model), {
    intent: { kind: 'explicit', reason: 'reassessment', requestedAt: model.now }, origin: 'remediation',
  });
  return { ...plan, items: plan.items.map(item => ({ ...item, queue: 'remediation', overlap:'remediation', presentationReason:'remediation-reassessment' })) };
}

// ───────────────────────────── after a session ─────────────────────────────

/** The cards of a finished session, in the order they were planned. */
export const entriesOf = (plan: SessionPlan): DeckEntry[] => plan.items.map(entryOf);

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
  if (!classLanguageOf(languageId)) return sharedSavedDecks(ctx, learnerId, languageId, first.decks);
  return serial(async () => {
    const store = await readStore(ctx, learnerId, languageId);
    const seed = classDeckFor(languageId, varietyId, ctx.deps.now().toISOString());
    if (seed && !store.dismissed.includes(seed.id) && !store.decks.some((d) => d.id === seed.id)) {
      store.decks = [seed, ...store.decks];
      await writeStore(ctx, learnerId, languageId, store);
    }
    return sharedSavedDecks(ctx, learnerId, languageId, store.decks);
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
    await recordSavedDeckChange(ctx, 'save', saved);
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
    const gone = (await sharedSavedDecks(ctx, learnerId, languageId, store.decks)).find((d) => d.id === deckId);
    if (gone && !gone.builtin) await recordSavedDeckChange(ctx, 'remove', gone);
    store.decks = store.decks.filter((d) => d.id !== deckId);
    if (gone?.builtin && !store.dismissed.includes(gone.id)) store.dismissed = [...store.dismissed, gone.id];
    await writeStore(ctx, learnerId, languageId, store);
  });
}
/** Once a session has begun the held-out units may come back in later decks, and the words added by hand have been asked. */
export function releaseHoldOut(ctx: AppContext, learnerId: string, languageId: string, opts: { preserveAdded?: boolean } = {}): Promise<void> {
  return serial(async () => {
    const store = await readStore(ctx, learnerId, languageId);
    if (!store.holdOut.length && !store.added.length) return;
    store.holdOut = [];
    if (!opts.preserveAdded) store.added = [];
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
