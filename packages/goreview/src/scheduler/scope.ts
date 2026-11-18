/**
 * Review scope: which varieties of a language one queue draws from (2026-11-17, docs/ecosystem/LANGUAGE-VARIETIES.md).
 *
 * Everything here is a pure function over the folded deck, the Repository's knowledge rows and its candidates. Nothing is filtered after a
 * deck has been assembled: `scopeReview` decides what the planner and intake are GIVEN, so a card outside the scope is never among the
 * things a queue can be built from. A language without learning varieties (contract ./varieties) passes through unchanged.
 *
 * One FSRS, one deck fold. A variety is kept apart by the card's identity alone (`itemIdFor(unitId, dimension, varietyId)`): two cards of one
 * word in two varieties are two items of the same fold, each with its own history and schedule.
 */
import {
  canonicalVarietyId, classifiedVarietiesOf, defaultScope, hasLearningVarieties, inScope, knowledgeInVariety, learningVarietiesOf, legacyVarietyOf,
  lexicalFamilyKey, normalizeScope, ownKnowledgeOf, parseCardId, transferEvidence, transferPriority,
} from '../../../repository-contract/src';
import type { ReviewCandidate, ReviewScope, TransferEvidence, UnitKnowledge } from '../../../repository-contract/src';
import type { DeckItem, ItemVariety, Scheduler } from '../types';

const at = (iso: string | undefined): number => (iso === undefined ? Number.NaN : Date.parse(iso));

/**
 * The variety a deck item belongs to.
 *   card       its id names the variety (every card created since varieties were recorded, for a word with classified evidence)
 *   legacy     a card with the old id shape, assigned from its stamp and from the varieties the word had classified evidence in when the
 *              card was created (`legacyVarietyOf`; the Repository's projection assigns the card's answers by the same rule)
 *   unsettled  a card with the old id shape that nothing assigns: it belongs to no variety and is never put in one by assumption
 * `knowledge` is the word's row; without it only the stamp can speak.
 */
export function varietyOfItem(item: DeckItem, knowledge?: UnitKnowledge): ItemVariety {
  if (!hasLearningVarieties(item.languageId)) return { basis: 'no-varieties' };
  const named = canonicalVarietyId(item.languageId, parseCardId(item.itemId)?.varietyId);
  if (named) return { varietyId: named, basis: 'card' };
  const added = at(item.addedAt);
  const before = knowledge && knowledge.languageId === item.languageId
    ? classifiedVarietiesOf(knowledge).filter((id) => { const first = at(ownKnowledgeOf(knowledge, id)?.firstAt); return Number.isFinite(first) && first <= added; })
    : [];
  const assigned = legacyVarietyOf(item.languageId, item.varietyId, before);
  return assigned ? { varietyId: assigned, basis: 'legacy' } : { basis: 'unsettled' };
}

/** Every item with its `variety` set (a copy; the fold's items are not changed). */
export function classifyDeck(deck: readonly DeckItem[], knowledge: readonly UnitKnowledge[]): DeckItem[] {
  const rows = new Map(knowledge.map((row) => [row.unitId, row]));
  return deck.map((item) => ({ ...item, variety: varietyOfItem(item, rows.get(item.unitId)) }));
}

/** The scope a queue is built for: the learner's own choice when valid, else ONE variety (`defaultScope`). undefined for a language without learning varieties. */
export function resolveScope(input: { languageId: string; chosen?: Partial<ReviewScope>; enrolmentVarietyId?: string; deck?: readonly DeckItem[]; knowledge?: readonly UnitKnowledge[] }): ReviewScope | undefined {
  if (!hasLearningVarieties(input.languageId)) return undefined;
  const chosen = input.chosen ? normalizeScope({ ...input.chosen, languageId: input.languageId }) : undefined;
  if (chosen && chosen.varietyIds.length) return chosen;
  return defaultScope(input.languageId, input.enrolmentVarietyId, studiedVarieties(input.languageId, input.deck ?? [], input.knowledge ?? []));
}

/** The varieties the learner has cards or classified evidence in, the most recently studied first. */
export function studiedVarieties(languageId: string, deck: readonly DeckItem[], knowledge: readonly UnitKnowledge[]): string[] {
  const last = new Map<string, number>();
  const note = (id: string | undefined, when: number): void => { if (id && (Number.isFinite(when) ? when : 0) >= (last.get(id) ?? -1)) last.set(id, Number.isFinite(when) ? when : 0); };
  for (const row of knowledge) if (row.languageId === languageId) for (const id of classifiedVarietiesOf(row)) note(id, at(ownKnowledgeOf(row, id)?.lastAt));
  const rows = new Map(knowledge.map((row) => [row.unitId, row]));
  for (const item of deck) if (item.languageId === languageId) note((item.variety ?? varietyOfItem(item, rows.get(item.unitId))).varietyId, at(item.history.at(-1)?.at ?? item.addedAt));
  return [...last].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([id]) => id);
}

export interface ScopeExclusion { unitId: string; itemId?: string; reason: string; varietyIds: string[] }

export interface ScopedReview {
  /** undefined: the language has no learning varieties and everything below is the input unchanged. */
  scope?: ReviewScope;
  /** The cards a queue may hold: those of the scope's varieties (and the unsettled ones, when the scope includes them). */
  deck: DeckItem[];
  /** What counts as "already has a card" for a new proposal: `deck` plus every unsettled card, which covers its word in any scope. */
  coverage: DeckItem[];
  /** The candidates of the scope, each tagged with the variety whose task it is (untagged: nothing of the word is classified). */
  candidates: ReviewCandidate[];
  /** Every row read in the variety its word is being reviewed in. */
  knowledge: UnitKnowledge[];
  /** Cards and candidates left out, and why. */
  excluded: ScopeExclusion[];
  /** Per unit: what the learner knows of it in OTHER varieties (familiarity, never mastery). Only units with any. */
  transfer: Record<string, TransferEvidence[]>;
}

/**
 * The inputs of one queue. Cards: in scope by their variety. Candidates: a word with classified evidence in a scope variety is that
 * variety's task; a word classified only elsewhere is not a candidate; a word nothing classifies stays a candidate without a variety when
 * the scope includes the unsettled (its card keeps the old id shape). In a scope of several varieties a word eligible in more than one is
 * proposed for ONE of them per call: the one without a card yet, the most recently met first.
 */
export function scopeReview(input: { languageId: string; scope?: ReviewScope; deck: readonly DeckItem[]; candidates: readonly ReviewCandidate[]; knowledge: readonly UnitKnowledge[] }): ScopedReview {
  const { scope } = input;
  if (!scope || !hasLearningVarieties(input.languageId)) {
    return { deck: [...input.deck], coverage: [...input.deck], candidates: [...input.candidates], knowledge: [...input.knowledge], excluded: [], transfer: {} };
  }
  const rows = new Map(input.knowledge.map((row) => [row.unitId, row]));
  const classified = classifyDeck(input.deck, input.knowledge);
  const excluded: ScopeExclusion[] = [];
  const deck: DeckItem[] = [], coverage: DeckItem[] = [];
  for (const item of classified) {
    if (item.languageId !== input.languageId) { deck.push(item); coverage.push(item); continue; }
    const variety = item.variety!.varietyId;
    if (inScope(scope, variety)) { deck.push(item); coverage.push(item); continue; }
    if (variety === undefined) coverage.push(item);
    excluded.push({ unitId: item.unitId, itemId: item.itemId, varietyIds: variety ? [variety] : [],
      reason: variety ? `a ${variety} card; this queue reviews ${scope.varietyIds.join(', ')}` : 'its variety is not settled, and this queue leaves such cards out' });
  }

  const family = new Map<string, UnitKnowledge[]>();
  for (const row of input.knowledge) {
    const key = row.languageId === input.languageId ? lexicalFamilyKey(row.languageId, row.unitId) : undefined;
    if (key) (family.get(key) ?? family.set(key, []).get(key)!).push(row);
  }
  const transfer: Record<string, TransferEvidence[]> = {};
  const noteTransfer = (unitId: string, varietyId: string): void => {
    const key = lexicalFamilyKey(input.languageId, unitId);
    const found = transferEvidence(rows.get(unitId), varietyId, key ? family.get(key) ?? [] : []);
    if (found.length) transfer[unitId] = found;
  };

  const viewOf = new Map<string, string>();
  for (const item of deck) if (item.languageId === input.languageId && item.variety?.varietyId) viewOf.set(item.unitId, item.variety.varietyId);
  const hasCard = (unitId: string, varietyId: string): boolean => coverage.some((item) => item.unitId === unitId && item.status !== 'dismissed'
    && (item.variety?.varietyId === undefined || item.variety.varietyId === varietyId));

  const candidates: ReviewCandidate[] = [];
  for (const candidate of input.candidates) {
    const row = rows.get(candidate.unitId);
    const known = classifiedVarietiesOf(row);
    if (!known.length) {
      if (scope.includeUnsettled !== false) candidates.push(candidate.varietyId ? { ...candidate, varietyId: undefined } : candidate);
      else excluded.push({ unitId: candidate.unitId, varietyIds: [], reason: 'nothing settles which variety this word was met in, and this queue leaves such words out' });
      continue;
    }
    const eligible = scope.varietyIds.filter((id) => known.includes(id));
    if (!eligible.length) {
      excluded.push({ unitId: candidate.unitId, varietyIds: known, reason: `met in ${known.join(', ')} only; this queue reviews ${scope.varietyIds.join(', ')}` });
      continue;
    }
    const recent = (id: string): number => { const t = at(ownKnowledgeOf(row, id)?.lastAt); return Number.isFinite(t) ? t : 0; };
    const order = learningVarietiesOf(input.languageId).map((v) => v.id);
    const pick = [...eligible].sort((a, b) => Number(hasCard(candidate.unitId, a)) - Number(hasCard(candidate.unitId, b)) || recent(b) - recent(a) || order.indexOf(a) - order.indexOf(b))[0];
    candidates.push({ ...candidate, varietyId: pick });
    viewOf.set(candidate.unitId, pick); // the proposal's variety decides how the word's row is read in this call
    noteTransfer(candidate.unitId, pick);
  }
  for (const item of deck) if (item.variety?.varietyId && !transfer[item.unitId]) noteTransfer(item.unitId, item.variety.varietyId);

  const fallback = scope.varietyIds.length === 1 ? scope.varietyIds[0] : undefined;
  const knowledge = input.knowledge.map((row) => {
    if (row.languageId !== input.languageId) return row;
    const known = classifiedVarietiesOf(row);
    const variety = viewOf.get(row.unitId) ?? fallback ?? scope.varietyIds.find((id) => known.includes(id)) ?? scope.varietyIds[0];
    return knowledgeInVariety(row, variety).knowledge;
  });
  return { scope, deck, coverage, candidates, knowledge, excluded, transfer };
}

/**
 * The variety a new card of this word belongs to under a scope: the first of the scope's varieties the word has classified evidence in.
 * undefined: no scope, or nothing of the word is classified there (the card then keeps the old id shape).
 */
export function taskVarietyOf(scope: ReviewScope | undefined, row: UnitKnowledge | undefined): string | undefined {
  if (!scope) return undefined;
  const known = classifiedVarietiesOf(row);
  return scope.varietyIds.find((id) => known.includes(id));
}

/** A short, stable text of a scope, for comparing a saved copy with the scope in force. '' for a language without learning varieties. */
export const scopeSignature = (scope: ReviewScope | undefined): string =>
  (scope ? `${scope.languageId}:${[...scope.varietyIds].sort().join('+')}${scope.includeUnsettled === false ? '' : '+unsettled'}` : '');

export interface VarietyCount {
  /** undefined: the cards whose variety is not settled. */
  varietyId?: string;
  /** Cards that can be scheduled (not dismissed). */
  eligible: number;
  /** Active cards whose time has come. */
  due: number;
  /** Active cards never yet answered. */
  new: number;
  suspended: number;
}

/**
 * Cards by variety, for every variety the deck holds (registry order, the unsettled last). The whole deck is counted, whatever scope is
 * in force, so a screen can show what each choice would hold. `deck` items need not be classified; `knowledge` settles the legacy ones.
 */
export function countByVariety(input: { languageId: string; deck: readonly DeckItem[]; knowledge?: readonly UnitKnowledge[]; scheduler: Pick<Scheduler, 'isDue'>; now: string }): VarietyCount[] {
  if (!hasLearningVarieties(input.languageId)) return [];
  const rows = new Map((input.knowledge ?? []).map((row) => [row.unitId, row]));
  const counts = new Map<string, VarietyCount>();
  for (const item of input.deck) {
    if (item.languageId !== input.languageId || item.status === 'dismissed') continue;
    const id = (item.variety ?? varietyOfItem(item, rows.get(item.unitId))).varietyId;
    const c = counts.get(id ?? '') ?? { ...(id ? { varietyId: id } : {}), eligible: 0, due: 0, new: 0, suspended: 0 };
    c.eligible += 1;
    if (item.status === 'suspended') c.suspended += 1;
    const answered = item.history.some((h) => !h.retracted && !h.scheduleExcluded && !h.conflict);
    if (item.status === 'active' && !answered) c.new += 1;
    else if (item.status === 'active' && input.scheduler.isDue(item.schedule, input.now)) c.due += 1;
    counts.set(id ?? '', c);
  }
  const order = [...learningVarietiesOf(input.languageId).map((v) => v.id), ''];
  return [...counts].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([, c]) => c);
}

/**
 * Among proposals of equal standing, the one the learner already knows in a related variety comes first: it is the cheapest to confirm and
 * the likeliest to mislead if left alone (a familiar word with another meaning). 2, 1 or 0 (`transferPriority`); weak evidence counts as none.
 * A tie-break for the order of introduction only: no schedule, level or review is ever written from it.
 */
export const introductionPriority = (transfer: Record<string, TransferEvidence[]> | undefined, unitId: string): 0 | 1 | 2 =>
  transferPriority(transfer?.[unitId] ?? []);
