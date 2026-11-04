import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import type { PlannedItem, SessionPlan } from '../../packages/goreview/src/types';
import { GREEK } from '../../packages/goreview-ecclesia/src/languages';
import { mapEncounters } from '../../packages/goreview-ecclesia/src/encounters';
import { knowledgeRows, knowledgeStandings, levelDistribution } from '../../packages/goreview-ecclesia/src/profile';
import { NO_AUDIO, composeSession, ecclesiaPreferences, preferReadingContext, readingCandidates } from '../../packages/goreview-ecclesia/src/session';
import { JOHN_1, JOHN_1_1_18, lexemeOf, passage } from './fixtures/greek-john';
import { dueItem } from '../goreview/intake/fixtures';

const identity = { learnerId: 'L', enrolmentId: 'E', deviceId: 'D' };
const T = (m: number): string => new Date(Date.parse('2026-11-04T09:00:00.000Z') + m * 60_000).toISOString();
const v1 = JOHN_1_1_18.verses[0]!;
const logos = v1.tokens[4]!, arche = v1.tokens[1]!;
const LOGOS = lexemeOf('λόγος', 'NOUN'), ARCHE = lexemeOf('ἀρχή', 'NOUN'), THEOS = lexemeOf('θεός', 'NOUN');

/** A reading of John 1:1–5: everything viewed, λόγος looked up twice with its gloss, ἀρχή looked up once, the passage completed without help. */
function reading(): GoEvent[] {
  return mapEncounters([
    { kind: 'passage-viewed', encounterId: 'r:1', at: T(0), passage: JOHN_1, verses: passage(1, 5).verses },
    { kind: 'word-selected', encounterId: 'r:2', at: T(1), passage: JOHN_1, verse: 1, token: logos },
    { kind: 'definition-revealed', encounterId: 'r:3', at: T(1), passage: JOHN_1, verse: 1, token: logos },
    { kind: 'word-selected', encounterId: 'r:4', at: T(2), passage: JOHN_1, verse: 1, token: arche },
    { kind: 'word-selected', encounterId: 'r:5', at: T(3), passage: JOHN_1, verse: 14, token: JOHN_1_1_18.verses[13]!.tokens.find((t) => t.lemma === 'λόγος')! },
    { kind: 'passage-completed', encounterId: 'r:6', at: T(5), passage: JOHN_1, verses: passage(1, 5).verses, helpUsed: false },
  ], { profile: GREEK, identity }).flatMap((m) => m.events);
}

describe('preferences', () => {
  it('turn listening off (no reviewed voice), set the variety and keep the profile defaults unless overridden', () => {
    const p = ecclesiaPreferences(GREEK, { sessionMinutes: 5 });
    expect(p).toMatchObject({ languageId: 'el', varietyId: 'el-koi', includeListening: false, listeningOff: true, sessionMinutes: 5, maxNew: 4, cardsPerDeck: 12, prioritizeSaved: true });
    expect(NO_AUDIO.available).toBe(false);
  });
});

describe('knowledge profile from reading', () => {
  it('reading alone moves words from new to seen, and an unhelped completion makes them recognized; nothing reaches known', () => {
    const standings = knowledgeStandings(reading(), { learnerId: 'L', languageId: 'el' });
    expect(standings.get(LOGOS)!.lookups).toBe(2);
    expect(standings.get(LOGOS)!.level).toBe('recognized');
    expect(standings.get(ARCHE)!.level).toBe('recognized');
    expect(standings.get(lexemeOf('σκοτία', 'NOUN'))!.level).toBe('recognized'); // seen in verse 5 and in the completed passage
    expect(standings.has(lexemeOf('μονογενής', 'ADJ'))).toBe(false); // verse 14 was not viewed
    const dist = levelDistribution(standings);
    expect(dist.known).toBe(0); expect(dist.automatic).toBe(0); expect(dist.new).toBe(0);
    expect(dist.recognized).toBeGreaterThan(0);
  });
  it('a viewed passage without completion leaves words at seen', () => {
    const events = mapEncounters([{ kind: 'passage-viewed', encounterId: 'x', at: T(0), passage: JOHN_1, verses: passage(1, 1).verses }], { profile: GREEK, identity }).flatMap((m) => m.events);
    const standings = knowledgeStandings(events, { learnerId: 'L', languageId: 'el' });
    expect([...standings.values()].every((s) => s.level === 'seen')).toBe(true);
  });
});

describe('reading candidates', () => {
  it('propose looked-up, helped and context words with explained reasons, lexemes only, deck-covered units excluded', () => {
    const events = reading();
    const rows = knowledgeRows(events, { learnerId: 'L', languageId: 'el' });
    const c = readingCandidates({ profile: GREEK, events, rows, deck: [], context: passage(1, 5) });
    expect(c.every((x) => x.unitId.startsWith('lemma:'))).toBe(true);
    const top = c[0]!;
    expect(top.unitId).toBe(LOGOS);
    expect(top.reasons.map((r) => r.rule)).toEqual(expect.arrayContaining(['looked-up', 'help-requested', 'repeated-encounter', 'in-reading-context']));
    expect(top.score).toBeGreaterThan(c.find((x) => x.unitId === ARCHE)!.score);
    expect(top.targetDimension).toBe('readingRecognition');
    expect(top.eligibility).toMatchObject({ eligible: true, status: 'high-confidence' });
    // a unit with an active recognition card is not proposed again
    const covered = readingCandidates({ profile: GREEK, events, rows, deck: [dueItem(LOGOS, 0.5)], context: passage(1, 5) });
    expect(covered.some((x) => x.unitId === LOGOS)).toBe(false);
    // deterministic order
    expect(readingCandidates({ profile: GREEK, events, rows, deck: [], context: passage(1, 5) }).map((x) => x.unitId)).toEqual(c.map((x) => x.unitId));
  });
  it('skips words already known unless the learner marked them for learning', () => {
    const theos = v1.tokens[13]!; // θεὸς
    expect(theos.lemma).toBe('θεός');
    const events = [...reading(), ...mapEncounters([{ kind: 'word-marked', encounterId: 'm1', at: T(6), passage: JOHN_1, verse: 1, token: theos, mark: 'known' }], { profile: GREEK, identity }).flatMap((m) => m.events)];
    const rows = knowledgeRows(events, { learnerId: 'L', languageId: 'el' });
    expect(rows.find((r) => r.unitId === THEOS)!.level).toBe('known');
    expect(readingCandidates({ profile: GREEK, events, rows, deck: [] }).some((x) => x.unitId === THEOS)).toBe(false);
    const relearn = [...events, ...mapEncounters([{ kind: 'word-marked', encounterId: 'm2', at: T(7), passage: JOHN_1, verse: 1, token: theos, mark: 'seen' }], { profile: GREEK, identity }).flatMap((m) => m.events)];
    const rows2 = knowledgeRows(relearn, { learnerId: 'L', languageId: 'el' });
    const c = readingCandidates({ profile: GREEK, events: relearn, rows: rows2, deck: [] }).find((x) => x.unitId === THEOS);
    expect(c?.reasons.some((r) => r.rule === 'marked-for-learning')).toBe(true);
  });
});

describe('composing a session', () => {
  it('turns a reading into a plan through GoReview’s intake and planner, explaining what was declined', () => {
    const s = composeSession({ profile: GREEK, identity, events: reading(), now: T(10), readingContext: passage(1, 5), random: () => 0.3 });
    expect(s.deck).toEqual([]);
    expect(s.plan.languageId).toBe('el');
    expect(s.plan.listeningCount).toBe(0);
    expect(s.admitted).toContain(LOGOS);
    expect(s.plan.items.length).toBeGreaterThan(0);
    expect(s.plan.items.length).toBeLessThanOrEqual(s.preferences.maxNew);
    expect(s.plan.items.every((p) => p.isNew)).toBe(true);
    expect(s.plan.items.map((p) => p.item.unitId)).toContain(LOGOS);
    for (const d of s.declined) expect(d.reasons.length).toBeGreaterThan(0);
    expect(s.fromReadingContext.length).toBe(s.plan.items.length); // every planned item came from the passage just read
  });
  it('a verse merely viewed once proposes nothing; words met in several verses are proposed but only as later work (level Seen)', () => {
    const once = mapEncounters([{ kind: 'passage-viewed', encounterId: 'x', at: T(0), passage: JOHN_1, verses: passage(1, 1).verses }], { profile: GREEK, identity }).flatMap((m) => m.events);
    const s1 = composeSession({ profile: GREEK, identity, events: once, now: T(10), random: () => 0.3 });
    expect(s1.plan.items).toEqual([]);
    expect(s1.admitted).toEqual([]);
    expect(s1.declined).toEqual([]);
    const several = mapEncounters([{ kind: 'passage-viewed', encounterId: 'y', at: T(0), passage: JOHN_1, verses: passage(6, 8).verses }], { profile: GREEK, identity }).flatMap((m) => m.events);
    const s2 = composeSession({ profile: GREEK, identity, events: several, now: T(10), random: () => 0.3 });
    expect(s2.plan.items).toEqual([]); // nothing is asked now: a repeated sighting alone earns no question in this session
    expect(s2.admitted.length + s2.declined.length).toBeGreaterThan(0);
  });
});

describe('preferring the reading context', () => {
  const planned = (unitId: string, queue: PlannedItem['queue'], isNew = false): PlannedItem => ({ item: dueItem(unitId, 0.5), family: 'written-recognition', why: [], estimatedSeconds: 10, isNew, queue });
  const plan: SessionPlan = {
    planId: 'plan:x', createdAt: T(0), languageId: 'el', budgetMinutes: 10, dueCount: 3, newCount: 2, listeningCount: 0, grammarCount: 0, skipped: [],
    items: [planned('u:due1', 'due'), planned(LOGOS, 'due'), planned('u:due3', 'due'), planned('u:new1', 'new', true), planned(ARCHE, 'new', true)],
  };
  it('moves context items to the front of their own queue and never across queues, keeping size and membership', () => {
    const { plan: p, fromReadingContext } = preferReadingContext(plan, new Set([LOGOS, ARCHE]));
    expect(p.items.map((x) => x.item.unitId)).toEqual([LOGOS, 'u:due1', 'u:due3', ARCHE, 'u:new1']);
    expect(fromReadingContext).toEqual([`card:written-recognition:${LOGOS}`, `card:written-recognition:${ARCHE}`]);
    expect(p.items.find((x) => x.item.unitId === LOGOS)!.why).toContain('met in the passage just read');
    expect(p.items).toHaveLength(plan.items.length);
    expect(plan.items.map((x) => x.item.unitId)).toEqual(['u:due1', LOGOS, 'u:due3', 'u:new1', ARCHE]); // the input is untouched
  });
  it('without context items the plan is unchanged', () => {
    expect(preferReadingContext(plan, new Set(['nothing'])).plan.items.map((x) => x.item.unitId)).toEqual(plan.items.map((x) => x.item.unitId));
  });
});
