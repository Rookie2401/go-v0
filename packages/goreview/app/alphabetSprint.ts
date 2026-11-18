/**
 * Alphabet Sprint in GoReview: the built-in Alphabet saved deck, made dynamic (docs/goreview-app/ALPHABET-SPRINT.md). Opening the
 * deck no longer walks the letters in alphabet order: it asks what is due, then a few new units chosen for the words they unlock,
 * each followed at once by a real word to decode, a contrast where the learner mixes two units up, a short phrase, and new words
 * from known letters (src/alphabet/sprint/plan.ts).
 *
 * Everything runs on GoReview's own machinery. A Sprint card is a `class:` unit (src/alphabet/sprint/ids.ts) asked as an ordinary
 * flashcard (written-recognition), graded with Again/Hard/Good/Easy, recorded as a CardReviewed event through the device queue to the
 * Repository, and scheduled by the same FSRS fold as every other card (model.classDeck). The learner's script knowledge is read back
 * from those cards (src/alphabet/sprint/knowledge.ts); nothing is kept anywhere else, so another device that pulls the events has the
 * same knowledge. Being `class:` units, Sprint cards never enter the ordinary queue, My vocab, the candidates or any vocabulary figure.
 */
import type { SessionPlan, UnitFacts } from '../src/types';
import type { LinguisticUnit } from '../../repository-contract/src';
import type { AppContext } from './context';
import type { ReviewModel } from './workspace';
import { assemble, type Wanted } from './deckModel';
import { isSprintUnitId, parseSprintUnitId } from '../../../src/alphabet/sprint/ids';
import { scriptKnowledge, type SprintCardState, type UnitKnowledge } from '../../../src/alphabet/sprint/knowledge';
import { planSprint, sprintCardFor, sprintProgress, type SprintProgress } from '../../../src/alphabet/sprint/plan';
import { loadSprintProfiles, profileForVariety } from '../../../src/alphabet/sprint/profiles';
import type { ScriptProfile } from '../../../src/alphabet/sprint/types';

export { isSprintUnitId };

/** The Sprint cards of a language as the folded deck holds them. */
export function sprintCardStates(model: Pick<ReviewModel, 'classDeck'>, languageId: string): SprintCardState[] {
  return (model.classDeck ?? []).filter((i) => isSprintUnitId(i.unitId) && parseSprintUnitId(i.unitId)?.languageId === languageId && !i.invalidatedAt)
    .map((i) => ({ unitId: i.unitId, status: i.status, due: i.schedule.due, stability: i.schedule.stability, lapses: i.schedule.lapses, phase: i.schedule.phase,
      history: i.history.map((e) => ({ at: e.at, rating: e.rating, ...(e.retracted ? { retracted: true } : {}) })) }));
}

/** The profile for a learner's language and variety, and the knowledge in it (a unit known in another tradition counts as seen here). */
export async function sprintState(model: Pick<ReviewModel, 'classDeck' | 'identity'>, languageId: string, varietyId?: string): Promise<{ profile: ScriptProfile; knowledge: Map<string, UnitKnowledge>; cards: SprintCardState[] } | undefined> {
  const profiles = await loadSprintProfiles(languageId);
  const profile = profileForVariety(profiles, varietyId);
  if (!profile) return undefined;
  const cards = sprintCardStates(model, profile.languageId);
  const others = profiles.filter((p) => p !== profile);
  const other = others.length ? mergeKnowledge(others.map((p) => scriptKnowledge(p, cards))) : undefined;
  return { profile, knowledge: scriptKnowledge(profile, cards, other), cards };
}

function mergeKnowledge(maps: ReadonlyArray<Map<string, UnitKnowledge>>): Map<string, UnitKnowledge> {
  const out = new Map<string, UnitKnowledge>();
  const rank = { new: 0, seen: 1, recognized: 2, familiar: 3, known: 4, automatic: 5 } as const;
  for (const m of maps) for (const [k, v] of m) { const cur = out.get(k); if (!cur || rank[v.level] > rank[cur.level]) out.set(k, v); }
  return out;
}

/** Page statistics the extension left for this language (unit occurrences on the learner's last pages); undefined when there are none. */
export type PageCountsSource = (languageId: string) => Promise<ReadonlyMap<string, number> | undefined>;

/**
 * The session the Alphabet deck asks now. The plan's cards keep their order (due first, then each new unit and its first word …);
 * `assemble` applies GoReview's ordinary gates (eligibility, deck size, session time) and builds every card through the real exercise
 * engine. Fewer cards than the deck size when that is all there is: never filler.
 */
export async function planAlphabetSprint(ctx: AppContext, model: ReviewModel, opts: { pageCounts?: PageCountsSource } = {}): Promise<SessionPlan & { progress?: SprintProgress }> {
  const languageId = model.identity.languageId;
  const state = await sprintState(model, languageId, model.identity.varietyId);
  if (!state) return assemble(ctx, model, [], 0, { intent: { kind: 'explicit', reason: 'saved-deck', requestedAt: model.now }, origin: 'saved-deck' });
  const pageCounts = await opts.pageCounts?.(state.profile.languageId).catch(() => undefined);
  const size = Math.max(1, model.prefs.cardsPerDeck ?? 10);
  const plan = planSprint({ profile: state.profile, knowledge: state.knowledge, cards: state.cards, now: model.now, size, ...(pageCounts ? { pageCounts } : {}) });
  const wanted: Wanted[] = plan.cards.map((c) => ({ unitId: c.unitId, unitKind: 'lexeme', dimension: 'written-recognition', family: 'written-recognition' }));
  const session = await assemble(ctx, model, wanted, wanted.length, { intent: { kind: 'explicit', reason: 'saved-deck', requestedAt: model.now }, origin: 'saved-deck' });
  return { ...session, progress: plan.progress };
}

/**
 * Script readiness on the learner's own pages: the share of the letter occurrences counted there that the learner can already read
 * (ready units, knowledge.ts). A separate figure from the vocabulary "words known": it says nothing about meaning. Undefined with no counts.
 */
export function pageLetterCoverage(knowledge: ReadonlyMap<string, UnitKnowledge>, pageCounts: ReadonlyMap<string, number> | undefined): number | undefined {
  if (!pageCounts || !pageCounts.size) return undefined;
  let total = 0, ready = 0;
  for (const [key, n] of pageCounts) {
    total += n;
    const k = knowledge.get(key);
    if (k && k.level !== 'new' && k.level !== 'seen') ready += n;
  }
  return total > 0 ? ready / total : undefined;
}

/** The learner's Sprint progress in their language (for the deck tile). */
export async function alphabetProgress(model: Pick<ReviewModel, 'classDeck' | 'identity'>, pageCounts?: ReadonlyMap<string, number>): Promise<(SprintProgress & { pageCoverage?: number }) | undefined> {
  const state = await sprintState(model, model.identity.languageId, model.identity.varietyId);
  if (!state) return undefined;
  const coverage = pageLetterCoverage(state.knowledge, pageCounts);
  return { ...sprintProgress(state.profile, state.knowledge, state.cards, pageCounts), ...(coverage !== undefined ? { pageCoverage: coverage } : {}) };
}

/**
 * What the exercise engine is told about a Sprint card: the front as the "word" and the back as its one meaning. The back is decoding
 * help (sound, pronunciation, a meaning) from the profile; it is not a vocabulary gloss and nothing is recorded as vocabulary.
 * Undefined when no profile has the card (a word dropped from a later list stays saved and is simply not asked).
 */
export async function sprintFacts(unitId: string, languageId: string): Promise<UnitFacts | undefined> {
  const id = parseSprintUnitId(unitId);
  if (!id) return undefined;
  const profiles = await loadSprintProfiles(id.languageId || languageId);
  const card = profiles.map((p) => sprintCardFor(p, unitId)).find(Boolean);
  if (!card) return undefined;
  const unit: LinguisticUnit = {
    unitId, kind: 'lexeme', languageId: id.languageId, label: card.front, packId: 'alphabet-sprint', packVersion: '1',
    provenance: { source: 'hand-lexicon', ref: 'alphabet-sprint@1', confidence: 0.9, origin: 'pack-lexicon', validation: 'unreviewed' },
    status: 'provisional', createdAt: '2026-11-17T00:00:00.000Z',
  } as LinguisticUnit;
  return {
    unit, relations: [], analyses: [], status: 'provisional', lemma: card.front, glosses: [card.back], constructionIds: [], featureExplanations: {},
    siblingForms: [], exampleSentences: [], pronunciationNotes: [], lexiconGlossCount: 1,
  } as UnitFacts;
}
