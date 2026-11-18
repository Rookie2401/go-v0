/**
 * Script knowledge from the learner's own card history: what the learner has DEMONSTRATED about each script unit, on the six levels,
 * with script meanings (not vocabulary meanings):
 *
 *   new         no card and no evidence.
 *   seen        introduced (a card exists) or answered, but never recognised.
 *   recognized  recognised at least once: one direct right answer, or two word decodings that needed it.
 *   familiar    reliable in familiar cards: two direct right answers, the last answer not a miss.
 *   known       recognised and APPLIED: three direct right answers on two different days, at least one real word decoded with it,
 *               the last answer not a miss.
 *   automatic   durable: known, four direct right answers on three days, and the scheduler's stability at three weeks or more.
 *
 * Evidence is never assumed: a page containing a letter, a hint opened, or a card merely shown is no evidence. A word decoded right
 * is evidence for each unit it needs, worth half a direct answer and counted once per review whatever the number of times the unit
 * occurs in the word; a word missed is no evidence against any one unit (which one failed is unknown). A unit the profile marks
 * `familiar` (most of a–z for an English reader) counts as known without evidence and says so (`basis: 'familiar-shape'`).
 *
 * Nothing here writes vocabulary knowledge: the inputs are Sprint cards only (ids.ts), and the output is keyed by unit key.
 */
import { parseSprintUnitId } from './ids';
import type { ScriptLevel, ScriptProfile } from './types';

/** The part of a folded GoReview card the Sprint reads (packages/goreview/src/types.ts DeckItem). */
export interface SprintCardState {
  unitId: string;
  status: 'active' | 'snoozed' | 'suspended' | 'dismissed';
  due: string;
  stability: number;
  lapses: number;
  phase: string;
  history: ReadonlyArray<{ at: string; rating: number; retracted?: boolean }>;
}

export interface UnitKnowledge {
  level: ScriptLevel;
  /** Direct right answers on the unit's own card (rating 2 Hard and up). */
  direct: number;
  /** Words (and phrases) decoded right that needed the unit. */
  applied: number;
  /** Distinct days with a right answer that used the unit. */
  days: number;
  /** The last direct answer was a miss (Again). */
  lastMissed: boolean;
  lapses: number;
  basis: 'evidence' | 'familiar-shape' | 'none' | 'other-tradition';
}

export const LEVEL_RANK: Readonly<Record<ScriptLevel, number>> = { new: 0, seen: 1, recognized: 2, familiar: 3, known: 4, automatic: 5 };
export const atLeast = (k: UnitKnowledge | undefined, level: ScriptLevel): boolean => !!k && LEVEL_RANK[k.level] >= LEVEL_RANK[level];

/** A unit counts towards decoding from `recognized` on (or by a familiar shape). */
export const READY: ScriptLevel = 'recognized';

const STABLE_DAYS = 21;
const day = (iso: string): string => iso.slice(0, 10);
const answered = (h: SprintCardState['history']) => h.filter((e) => !e.retracted && e.rating >= 1 && e.rating <= 4);

/**
 * The knowledge of every unit of a profile from the Sprint cards of its language and tradition. `otherTradition` (optional): the
 * same language's knowledge in another tradition; a unit familiar there is at least `seen` here (the shape is known, the sound value
 * of this tradition is not), and is never more than that until it is answered here.
 */
export function scriptKnowledge(profile: ScriptProfile, cards: readonly SprintCardState[], otherTradition?: ReadonlyMap<string, UnitKnowledge>): Map<string, UnitKnowledge> {
  const tradition = profile.tradition?.id;
  const mine = cards.filter((c) => {
    const p = parseSprintUnitId(c.unitId);
    return !!p && p.languageId === profile.languageId && (p.tradition ?? undefined) === (defaultTradition(profile) ? undefined : tradition);
  });
  const out = new Map<string, UnitKnowledge>();
  const blank = (): UnitKnowledge => ({ level: 'new', direct: 0, applied: 0, days: 0, lastMissed: false, lapses: 0, basis: 'none' });
  const dayset = new Map<string, Set<string>>();
  const introduced = new Set<string>();
  const stability = new Map<string, number>();
  for (const u of profile.units) out.set(u.key, blank());

  for (const c of mine) {
    const p = parseSprintUnitId(c.unitId)!;
    const h = answered(c.history);
    if (p.kind === 'character' || p.kind === 'rule') {
      const k = out.get(p.key);
      if (!k) continue;
      introduced.add(p.key);
      k.direct = h.filter((e) => e.rating >= 2).length;
      k.lastMissed = h.length > 0 && h[h.length - 1].rating === 1;
      k.lapses = c.lapses;
      stability.set(p.key, c.stability);
      const days = dayset.get(p.key) ?? new Set<string>();
      for (const e of h) if (e.rating >= 2) days.add(day(e.at));
      dayset.set(p.key, days);
    } else if (p.kind === 'word' || p.kind === 'phrase') {
      const deps = profile.dependencies(p.key);
      if (!deps) continue;
      for (const e of h) {
        if (e.rating < 2) continue;
        for (const key of new Set(deps)) {
          const k = out.get(key);
          if (!k) continue;
          k.applied += 1;
          const days = dayset.get(key) ?? new Set<string>();
          days.add(day(e.at));
          dayset.set(key, days);
        }
      }
    }
  }

  for (const u of profile.units) {
    const k = out.get(u.key)!;
    k.days = dayset.get(u.key)?.size ?? 0;
    if (u.familiar && k.direct === 0) { k.level = 'known'; k.basis = 'familiar-shape'; continue; }
    const score = k.direct + 0.5 * k.applied;
    const stable = (stability.get(u.key) ?? 0) >= STABLE_DAYS;
    let level: ScriptLevel = 'new';
    if (introduced.has(u.key) || score > 0) level = 'seen';
    if (k.direct >= 1 || k.applied >= 2) level = 'recognized';
    if (k.direct >= 2 && !k.lastMissed) level = 'familiar';
    if (k.direct >= 3 && k.days >= 2 && k.applied >= 1 && !k.lastMissed) level = 'known';
    if (level === 'known' && k.direct >= 4 && k.days >= 3 && stable) level = 'automatic';
    if (k.lastMissed && LEVEL_RANK[level] > LEVEL_RANK.recognized) level = 'recognized';
    k.level = level;
    k.basis = level === 'new' ? 'none' : 'evidence';
    const other = otherTradition?.get(u.key);
    if (level === 'new' && other && atLeast(other, 'familiar') && other.basis === 'evidence') { k.level = 'seen'; k.basis = 'other-tradition'; }
  }
  return out;
}

/** The default tradition of a profile has no `~tradition` in its ids (ids.ts). */
export const defaultTradition = (profile: ScriptProfile): boolean => !profile.tradition || profile.tradition.id === 'default';

/** The units ready for decoding (recognised or familiar-shaped). */
export function readyUnits(knowledge: ReadonlyMap<string, UnitKnowledge>): Set<string> {
  return new Set([...knowledge].filter(([, k]) => atLeast(k, READY)).map(([key]) => key));
}
