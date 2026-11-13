/**
 * Contextual flashcards. A card is GoReview's deck item: one unit along one assessment dimension, with the deterministic id
 * `card:<dimension>:<unitId>`. "Contextual" means the card carries WHERE the word was met (a Scripture reference, the verse's
 * context key, the token's position) so the reader can show the verse from its own corpus beside the exercise — the event log
 * and the exercise facts hold no passage. The same word met in two passages is ONE card with two contexts (`contextsOf`).
 *
 * The CardAdded event is built with GoReview's own builder (`buildCardAdded`), so the deck fold reads it like any other card;
 * normally the session runner writes it in the same batch as the first answer. `cardAddedEvent` is for a reader that lets a
 * learner add a word to the deck by hand (`addedBy: 'learner'`).
 */
import type { GoEvent } from '../../repository-contract/src';
import { buildCardAdded } from '../../goreview/src/scheduler/deck';
import { FAMILY_DIMENSION } from '../../goreview/src/types';
import type { AssessmentDimension, ExerciseFamily } from '../../goreview/src/types';
import type { CardContext, ContextualCard, EcclesiaLanguageProfile, EcclesiaToken, PassageRef, PassageTokens, ReaderIdentity } from './contract';
import { cardIdFor, parseWorkLocator, passageKey, sourceRefOf, unitIdsOf, verseKey } from './identity';

export interface CardOptions {
  /** Test the lexeme (default: "what does λόγος mean?") or the printed form ("what does λόγον mean?"). */
  target?: 'lexeme' | 'form';
  family?: ExerciseFamily;
}

export const DEFAULT_CARD_FAMILY: ExerciseFamily = 'written-recognition';

export function cardContext(profile: EcclesiaLanguageProfile, ref: PassageRef, verse: number, tokenIndex: number): CardContext {
  return { ref, verse, tokenIndex, sentenceKey: verseKey(ref, verse), sourceRef: sourceRefOf(profile, ref, verse) };
}

/** The card for a token met at a place. Deterministic: the id depends on the unit and the family's dimension only. */
export function contextualCard(profile: EcclesiaLanguageProfile, token: EcclesiaToken, where: { ref: PassageRef; verse: number }, opts: CardOptions = {}): ContextualCard {
  const ids = unitIdsOf(profile, token);
  const target = opts.target ?? 'lexeme';
  const family = opts.family ?? DEFAULT_CARD_FAMILY;
  const dimension: AssessmentDimension = FAMILY_DIMENSION[family];
  const unitId = target === 'form' ? ids.form : ids.lexeme;
  return { cardId: cardIdFor(unitId, dimension), unitId, unitKind: target, language: profile.id, dimension, family, context: cardContext(profile, where.ref, where.verse, token.index) };
}

/** One card per distinct unit of a passage, in reading order (the first occurrence gives the context). */
export function cardsForPassage(profile: EcclesiaLanguageProfile, passage: PassageTokens, opts: CardOptions = {}): ContextualCard[] {
  const out = new Map<string, ContextualCard>();
  for (const v of passage.verses) for (const t of v.tokens) {
    const card = contextualCard(profile, t, { ref: passage.ref, verse: v.verse }, opts);
    if (!out.has(card.cardId)) out.set(card.cardId, card);
  }
  return [...out.values()];
}

/** A learner-added card (a hand-picked word). `at` is the instant of the choice; the id is deterministic in card, instant and device. */
export function cardAddedEvent(profile: EcclesiaLanguageProfile, card: ContextualCard, identity: ReaderIdentity, at: string, addedBy: 'learner' | 'intake' = 'learner'): GoEvent {
  return buildCardAdded({
    learnerId: identity.learnerId, enrolmentId: identity.enrolmentId, languageId: profile.repository.languageId,
    ...(profile.repository.varietyId ? { varietyId: profile.repository.varietyId } : {}),
    at, deviceId: identity.deviceId, unitId: card.unitId, unitKind: card.unitKind, dimension: card.dimension, family: card.family, addedBy,
    reason: `met in ${passageKey(card.context.ref)} verse ${card.context.verse}`, itemId: card.cardId,
  });
}

/** A place a unit was met: a verse of Scripture (`book`) or of another work (`work`). */
export interface UnitOccurrence { book?: string; work?: string; chapter: number; verse: number; firstAt: string; lastAt: string; kinds: Record<string, number> }

const stemOf = (p: { book?: string; work?: string }): string => p.book ?? `w:${p.work}`;

/** Every place the learner met a unit, from the reading events: verses of Scripture (any reader that writes typed Scripture references counts) and passages of other works recorded through this package. */
export function contextsOf(unitId: string, events: readonly GoEvent[]): UnitOccurrence[] {
  const out = new Map<string, UnitOccurrence>();
  for (const e of events) {
    const ref = e.subject?.sourceRef;
    if (!ref || !e.subject?.itemIds?.includes(unitId)) continue;
    const place = ref.kind === 'scripture' ? (ref.verse === undefined ? undefined : { book: ref.book, chapter: ref.chapter, verse: ref.verse }) : parseWorkLocator(ref.locator);
    if (!place) continue;
    const k = `${stemOf(place)}.${place.chapter}.${place.verse}`;
    const row: UnitOccurrence = out.get(k) ?? { ...place, firstAt: e.at, lastAt: e.at, kinds: {} };
    if (Date.parse(e.at) < Date.parse(row.firstAt)) row.firstAt = e.at;
    if (Date.parse(e.at) > Date.parse(row.lastAt)) row.lastAt = e.at;
    row.kinds[e.kind] = (row.kinds[e.kind] ?? 0) + 1;
    out.set(k, row);
  }
  return [...out.values()].sort((a, b) => stemOf(a).localeCompare(stemOf(b)) || a.chapter - b.chapter || a.verse - b.verse);
}
