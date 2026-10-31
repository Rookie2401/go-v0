// @vitest-environment node
/**
 * END TO END: does a unit that the Repository now draws on repeated encounters ALONE (`repeatedEncounters`, candidates.ts
 * `signalled`) actually reach a GoReview deck?  Real pieces, no mocks of the rules: the projection engine folds three bare
 * EncounterRecorded events into a Seen knowledge row, `rankCandidates` draws it, `gatherCandidates` + `decideIntake` judge it
 * (with pack facts), and `planSession` admits (or refuses) it.  Each step asserts what the code DOES; see the comments for why.
 */
import { describe, expect, it } from 'vitest';
import type { GoEvent, ReviewCandidate, UnitKnowledge } from '../../../packages/repository-contract/src';
import { createProjectionEngine, rankCandidates } from '../../../packages/repository-engine/src';
import { gatherCandidates } from '../../../packages/goreview/src/intake/fetch';
import { planSession } from '../../../packages/goreview/src/planner/planner';
import type { IntakeOutcome } from '../../../packages/goreview/src/types';
import { FakeStore } from '../../repository/engine/fakeStore';
import { E, L, NOW, encounter, enrolment, resetIds, unit } from '../../repository/engine/helpers';
import { audioOk, facts, fakeScheduler, prefs } from '../intake/fixtures';

const U = 'form:sq:meet';
const bare = (): GoEvent[] => [0, 1, 2].map((i) => encounter([U], { at: `2026-10-06T1${i}:00:00.000Z` }));

async function world() {
  resetIds();
  const store = new FakeStore();
  store.enrolments.push(enrolment());
  store.units.set(U, unit(U, 'form', 'verified'));
  await store.append(L, bare());
  const engine = createProjectionEngine({ store, now: () => NOW });
  const row = (await engine.knowledge(L)).find((r) => r.unitId === U)!;
  return { store, engine, row };
}

/** `rankCandidates` fed the way the engine feeds it, for a world with one row and no card, rank, mark, lookup or leverage. */
const rank = (row: UnitKnowledge): ReviewCandidate[] => rankCandidates({
  rows: [row], units: new Map([[U, unit(U, 'form', 'verified')]]), analyses: new Map(), realizedBy: new Map(), cards: new Map(),
  goals: enrolment().goals, now: NOW, limit: 20,
});

describe('a unit drawn only by repeated encounters: Repository -> intake -> planner', () => {
  it('1. the Repository draws it: Seen, 3 encounters, no negative exposure, no judged evidence, reason repeatedEncounters', async () => {
    const { row } = await world();
    expect(row).toMatchObject({ level: 'seen', encounters: 3 });
    expect(row.dimensions.exposure.negative).toBe(0);
    expect(row.selfMark).toBeUndefined();
    expect(Object.entries(row.dimensions).filter(([d]) => d !== 'exposure').every(([, e]) => e.negative === 0 && e.positive === 0)).toBe(true);

    const [c, ...rest] = rank(row);
    expect(rest).toEqual([]);
    expect(c.unitId).toBe(U);
    expect(c.reasons.map((r) => r.rule)).toContain('repeatedEncounters');
    expect(c.reasons.find((r) => r.rule === 'repeatedEncounters')).toMatchObject({ weight: 0.1 });
    expect(c.eligibility.eligible).toBe(true);
  });

  it('2+3. intake decision and planner outcome for that candidate', async () => {
    const { row } = await world();
    const [candidate] = rank(row);
    const preferences = prefs({ maxNew: 3, dailyNewLimit: 3 });
    const outcomes: IntakeOutcome[] = await gatherCandidates({
      api: { candidates: async () => [candidate], knowledge: async (ids) => [row].filter((k) => ids.includes(k.unitId)) },
      facts: { factsFor: async (id) => facts(id) }, audio: async () => audioOk, deck: [], saved: new Set(), preferences, now: NOW, enrolmentId: E,
      readingSignals: bare(),
    });
    expect(outcomes).toHaveLength(1);
    const [outcome] = outcomes;
    // Score 0.30 = recentEncounter + repeatedEncounters. Intake's own rule 10 puts that between 0.15 and 0.5, i.e. test-later; but
    // gatherCandidates then ranks the encountered set comparatively (rankComparativePriority, limit 5 by default): with nothing else
    // competing it is rank 1 of 1 and is promoted to test-now. Level Seen passes because encounters > 0 (seenEligibility).
    expect(candidate.score).toBeCloseTo(0.3);
    expect(outcome.decision).toBe('test-now');
    expect(outcome.proposed).toEqual({ dimension: 'written-recognition', family: 'written-recognition' });
    expect(outcome.reasons).toEqual(expect.arrayContaining([expect.stringContaining('score 0.30 is between 0.15 and 0.5'), expect.stringContaining('comparative rank 1 of 1')]));

    // The planner admits it as a NEW card: empty deck, 3 new cards allowed, nothing else competing, no exclusion of any kind.
    const plan = planSession({ deck: [], intake: outcomes, preferences, audio: audioOk, scheduler: fakeScheduler, now: NOW, random: () => 0.5,
      knowledge: [row], readingSignals: bare(), learnerId: L });
    expect(plan.skipped).toEqual([]);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ isNew: true, queue: 'new', origin: 'intake', family: 'written-recognition' });
    expect(plan.items[0].item).toMatchObject({ unitId: U, dimension: 'written-recognition', status: 'active', history: [] });
    expect(plan.newCount).toBe(1);
  });
});
