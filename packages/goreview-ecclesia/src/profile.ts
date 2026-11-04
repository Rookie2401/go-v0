/**
 * The learner's standing, on two scales that are never mixed:
 *   - the six knowledge levels (new, seen, recognized, familiar, known, automatic), computed by the Repository engine's
 *     projection from EVERY event of the unit (reading, help, marks, reviews) — what the learner knows;
 *   - the FSRS schedule of each card, folded by GoReview's deck fold from the review events — when a card returns.
 * A word can be `familiar` with no card at all (met and understood while reading), or have a due card while still `seen`
 * (a first review was failed). Readers show both; neither is derived from the other.
 */
import { DIMENSIONS, KNOWLEDGE_LEVELS } from '../../repository-contract/src';
import type { GoEvent, KnowledgeLevel, UnitKnowledge } from '../../repository-contract/src';
import { MODEL_VERSION } from '../../repository-engine/src/engine';
import { foldEvents } from '../../repository-engine/src/projection';
import { foldDeck } from '../../goreview/src/scheduler/deck';
import type { DeckFold } from '../../goreview/src/scheduler/deck';
import type { Scheduler } from '../../goreview/src/types';
import type { CardSchedule, EcclesiaLanguageProfile, PassageTokens, UnitOverview, UnitStanding } from './contract';
import { scopedEvents } from './encounters';
import { lexemeId } from './identity';

export const PROJECTION_MODEL = MODEL_VERSION;

export interface Scope { learnerId: string; languageId: string }

/** The Repository projection rows of a learner in a language (the engine's own fold, `projection@7`). */
export function knowledgeRows(events: readonly GoEvent[], scope: Scope): UnitKnowledge[] {
  return foldEvents(scopedEvents(events, scope), { modelVersion: PROJECTION_MODEL });
}

const lookupCounts = (events: readonly GoEvent[]): Map<string, number> => {
  const out = new Map<string, number>();
  for (const e of events) if (e.kind === 'SelectionLookedUp') for (const id of new Set(e.subject?.itemIds ?? [])) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
};

export function standingOf(row: UnitKnowledge, lookups = 0): UnitStanding {
  const rr = row.dimensions.readingRecognition;
  const ar = row.dimensions.assistedRecognition;
  return {
    unitId: row.unitId, level: row.level, encounters: row.encounters, retention: row.retention.estimate,
    readingRecognition: { score: rr.score, observations: rr.observations, positive: rr.positive, negative: rr.negative },
    assistedRecognition: { observations: ar.observations, positive: ar.positive, negative: ar.negative },
    lookups, ...(row.selfMark ? { selfMark: row.selfMark } : {}), ...(row.firstSeenAt ? { firstSeenAt: row.firstSeenAt } : {}), ...(row.lastSeenAt ? { lastSeenAt: row.lastSeenAt } : {}),
  };
}

/** Every unit the learner has any evidence about, by unit id. A unit with no row is `new` (`standingOrNew`). */
export function knowledgeStandings(events: readonly GoEvent[], scope: Scope): Map<string, UnitStanding> {
  const scoped = scopedEvents(events, scope);
  const lookups = lookupCounts(scoped);
  return new Map(foldEvents(scoped, { modelVersion: PROJECTION_MODEL }).map((r) => [r.unitId, standingOf(r, lookups.get(r.unitId) ?? 0)]));
}

export const standingOrNew = (standings: ReadonlyMap<string, UnitStanding>, unitId: string): UnitStanding =>
  standings.get(unitId) ?? {
    unitId, level: 'new', encounters: 0, retention: 0, readingRecognition: { score: 0.5, observations: 0, positive: 0, negative: 0 },
    assistedRecognition: { observations: 0, positive: 0, negative: 0 }, lookups: 0,
  };

export const levelOf = (standings: ReadonlyMap<string, UnitStanding>, unitId: string): KnowledgeLevel => standings.get(unitId)?.level ?? 'new';

/** How many units stand at each level (units with evidence only; the corpus's unmet words are not counted). */
export function levelDistribution(standings: ReadonlyMap<string, UnitStanding>): Record<KnowledgeLevel, number> {
  const out = Object.fromEntries(KNOWLEDGE_LEVELS.map((l) => [l, 0])) as Record<KnowledgeLevel, number>;
  for (const s of standings.values()) out[s.level] += 1;
  return out;
}

/** The deck (every card and its FSRS state) of a learner in a language at `now`: GoReview's own fold. */
export function deckOf(events: readonly GoEvent[], scheduler: Scheduler, scope: Scope & { now: string }): DeckFold {
  return foldDeck(scopedEvents(events, scope), scheduler, { learnerId: scope.learnerId, languageId: scope.languageId, now: scope.now });
}

export function cardSchedules(events: readonly GoEvent[], scheduler: Scheduler, scope: Scope & { now: string }): CardSchedule[] {
  return deckOf(events, scheduler, scope).items.map((item) => ({
    cardId: item.itemId, unitId: item.unitId, status: item.status, due: item.schedule.due, isDue: item.status === 'active' && scheduler.isDue(item.schedule, scope.now),
    retrievability: scheduler.retrievability(item.schedule, scope.now), phase: item.schedule.phase, reps: item.schedule.reps, lapses: item.schedule.lapses,
    ...(item.schedule.lastReview ? { lastReview: item.schedule.lastReview } : {}),
  }));
}

/** Both scales for one unit. */
export function unitOverview(unitId: string, standings: ReadonlyMap<string, UnitStanding>, schedules: readonly CardSchedule[]): UnitOverview {
  return { standing: standings.get(unitId), cards: schedules.filter((c) => c.unitId === unitId) };
}

/** The level of every lexeme of a passage, in reading order, distinct. */
export function passageStandings(profile: EcclesiaLanguageProfile, passage: PassageTokens, standings: ReadonlyMap<string, UnitStanding>): Array<{ lexemeId: string; lemma: string; level: KnowledgeLevel }> {
  const out = new Map<string, { lexemeId: string; lemma: string; level: KnowledgeLevel }>();
  for (const v of passage.verses) for (const t of v.tokens) {
    const id = lexemeId(profile, t.lemma, t.pos);
    if (!out.has(id)) out.set(id, { lexemeId: id, lemma: t.lemma, level: levelOf(standings, id) });
  }
  return [...out.values()];
}

/** The dimensions, re-exported so a reader can list them without a second import. */
export const KNOWLEDGE_DIMENSIONS = DIMENSIONS;
