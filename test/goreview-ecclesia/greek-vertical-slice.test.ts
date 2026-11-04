/**
 * The Koine Greek vertical slice over John 1:1–18: a demo learner reads, looks words up, completes the passage; the reading
 * becomes review candidates; GoReview's intake and planner make a session; the real session runner grades answers with the
 * real exercise builders, records CardAdded + CardReviewed through the real evidence builder, and FSRS schedules the cards;
 * the events re-fold on another device to the same deck; the knowledge level and the FSRS state are read side by side; the
 * next passage is chosen by the (provisional) familiarity estimate. Every step runs on the shared engine; nothing is faked
 * except the clock and the random source.
 */
import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { validateEvent } from '../../packages/repository-contract/src';
import { createMemoryStore } from '../../packages/repository-store/src/memory';
import { createFsrsScheduler } from '../../packages/goreview/src/scheduler/fsrs';
import { summarize } from '../../packages/goreview/src/session/runner';
import { GREEK } from '../../packages/goreview-ecclesia/src/languages';
import { mapEncounters, recordEncounters } from '../../packages/goreview-ecclesia/src/encounters';
import { factsProviderFor, inMemoryLexicon } from '../../packages/goreview-ecclesia/src/facts';
import { cardSchedules, deckOf, knowledgeStandings, unitOverview } from '../../packages/goreview-ecclesia/src/profile';
import { nextBestPassage, passageFamiliarity } from '../../packages/goreview-ecclesia/src/familiarity';
import { composeSession, createEcclesiaRunner } from '../../packages/goreview-ecclesia/src/session';
import { contextsOf } from '../../packages/goreview-ecclesia/src/cards';
import { GREEK_FORMS, GREEK_LEXEMES, JOHN_1, JOHN_1_1_18, NT_FREQUENCY, lexemeOf, passage } from './fixtures/greek-john';

const identity = { learnerId: 'demo-learner', enrolmentId: 'enrol-grc-demo', deviceId: 'ipad' };
const T0 = Date.parse('2026-11-04T09:00:00.000Z');
const T = (m: number): string => new Date(T0 + m * 60_000).toISOString();
const scope = { learnerId: identity.learnerId, languageId: 'el' };
const LOGOS = lexemeOf('λόγος', 'NOUN'), ARCHE = lexemeOf('ἀρχή', 'NOUN'), SKOTIA = lexemeOf('σκοτία', 'NOUN');
const v1 = JOHN_1_1_18.verses[0]!, v5 = JOHN_1_1_18.verses[4]!;
const tok = (verse: number, lemma: string) => JOHN_1_1_18.verses[verse - 1]!.tokens.find((t) => t.lemma === lemma)!;

describe('Koine Greek vertical slice — John 1:1–18', () => {
  it('reading → review → reading, end to end on the shared engine', async () => {
    // ── the Repository (in memory) and the reader's sink into it ──
    const store = createMemoryStore();
    const committed = async (): Promise<GoEvent[]> => (await store.list({ learnerId: identity.learnerId, limit: 10_000 })).map((s) => s as GoEvent);
    const sink = { record: async (events: GoEvent[]) => { const out = await store.append(identity.learnerId, events); for (const o of out) if (!o.stored && !o.duplicateOf) throw new Error(`refused ${o.id}: ${JSON.stringify(o.issues)}`); } };
    const facts = factsProviderFor(GREEK, inMemoryLexicon(GREEK_LEXEMES, GREEK_FORMS));
    const scheduler = createFsrsScheduler();

    // ── 1. the demo learner reads John 1:1–5 ──
    const mapped = await recordEncounters([
      { kind: 'passage-viewed', encounterId: 'read1:view', at: T(0), passage: JOHN_1, verses: passage(1, 5).verses },
      { kind: 'word-selected', encounterId: 'read1:sel-logos', at: T(1), passage: JOHN_1, verse: 1, token: v1.tokens[4]! },
      { kind: 'definition-revealed', encounterId: 'read1:def-logos', at: T(1), passage: JOHN_1, verse: 1, token: v1.tokens[4]! },
      { kind: 'word-selected', encounterId: 'read1:sel-arche', at: T(2), passage: JOHN_1, verse: 1, token: v1.tokens[1]! },
      { kind: 'morphology-revealed', encounterId: 'read1:morph-arche', at: T(2), passage: JOHN_1, verse: 1, token: v1.tokens[1]! },
      { kind: 'word-selected', encounterId: 'read1:sel-skotia', at: T(3), passage: JOHN_1, verse: 5, token: tok(5, 'σκοτία') },
      { kind: 'definition-revealed', encounterId: 'read1:def-skotia', at: T(3), passage: JOHN_1, verse: 5, token: tok(5, 'σκοτία') },
      { kind: 'translation-revealed', encounterId: 'read1:tr-5', at: T(4), passage: JOHN_1, verse: 5, tokens: v5.tokens },
      { kind: 'passage-completed', encounterId: 'read1:done', at: T(6), passage: JOHN_1, verses: passage(1, 5).verses, helpUsed: true },
    ], { profile: GREEK, identity }, sink);
    expect(mapped.flatMap((m) => m.events).length).toBe(5 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 5);
    let events = await committed();
    for (const e of events) expect(validateEvent(e), e.id).toEqual([]);
    expect(JSON.stringify(events)).not.toMatch(/Ἐν ἀρχῇ ἦν ὁ λόγος/u); // no passage text anywhere

    // ── 2. the knowledge profile after reading: levels, not schedules ──
    let standings = knowledgeStandings(events, scope);
    expect(standings.get(LOGOS)).toMatchObject({ level: 'recognized', lookups: 1 }); // understood with help
    expect(standings.get(ARCHE)!.level).toBe('recognized');
    expect(standings.get(lexemeOf('ἄνθρωπος', 'NOUN'))!.level).toBe('recognized'); // in the completed passage, with help
    expect(cardSchedules(events, scheduler, { ...scope, now: T(10) })).toEqual([]); // no card yet

    // ── 3. reading → review: compose a session ──
    const session = composeSession({ profile: GREEK, identity, events, now: T(10), readingContext: passage(1, 5), random: () => 0.3 });
    expect(session.admitted).toEqual(expect.arrayContaining([LOGOS, ARCHE, SKOTIA]));
    expect(session.plan.items.length).toBeGreaterThanOrEqual(3);
    expect(session.plan.items.every((p) => p.isNew && p.family === 'written-recognition')).toBe(true);
    expect(session.plan.listeningCount).toBe(0);

    // ── 4. the session: real builders, real grading, real evidence, FSRS ──
    let clock = T0 + 11 * 60_000;
    const now = (): string => { clock += 15_000; return new Date(clock).toISOString(); };
    const runner = createEcclesiaRunner({ profile: GREEK, identity, plan: session.plan, preferences: session.preferences, facts, scheduler, record: sink.record, committedEvents: committed, now, random: () => 0.3 });
    const answered: Array<{ unitId: string; correct: boolean }> = [];
    const answeredAt = new Map<string, string>();
    // the first planned card is answered wrong on purpose, to see FSRS schedule its return before the others
    const MISSED = session.plan.items[0]!.item.unitId;
    expect(session.plan.items.length).toBeGreaterThanOrEqual(2);
    let wrongOnce = false;
    for (let guard = 0; guard < 20; guard++) {
      const cur = await runner.current();
      if (!cur) break;
      const ex = cur.exercise;
      expect(ex.validation.ok).toBe(true);
      expect(ex.target.languageId).toBe('el');
      expect(ex.target.varietyId).toBe('el-koi');
      const miss = !wrongOnce && cur.planned.item.unitId === MISSED;
      const choice = miss ? (ex.prompt.options ?? []).find((o) => !ex.answerKey.accepted.includes(o)) ?? 'nonsense' : ex.answerKey.accepted[0]!;
      const result = await runner.answer({ hinted: false, assistance: [], choice, typed: choice, reviewSeconds: 4 });
      if (miss) wrongOnce = true;
      answered.push({ unitId: cur.planned.item.unitId, correct: result.grading.outcome === 'correct' });
      answeredAt.set(cur.planned.item.unitId, result.at);
      expect(result.evidence).not.toBeNull();
      expect(result.evidence!.kind).toBe('CardReviewed');
      expect(result.evidence!.producer.app).toBe('gopractice-review');
      if (miss) expect(result.rating).toBe(1); else expect(result.rating).toBeGreaterThanOrEqual(2);
    }
    const summary = summarize(runner.state(), runner.skips());
    expect(summary.answered).toBe(answered.length);
    expect(summary.answered).toBeGreaterThanOrEqual(3);
    expect(summary.unbuildable).toBe(0);
    expect(answered.some((a) => a.unitId === MISSED && !a.correct)).toBe(true);
    expect(answered.filter((a) => a.correct).length).toBeGreaterThanOrEqual(1);
    const HIT = answered.find((a) => a.correct)!.unitId;
    await runner.finish();

    // ── 5. the event log now holds CardAdded + CardReviewed per answered card; everything validates ──
    events = await committed();
    for (const e of events) expect(validateEvent(e), e.id).toEqual([]);
    const added = events.filter((e) => e.kind === 'CardAdded');
    const reviewed = events.filter((e) => e.kind === 'CardReviewed');
    expect(added.map((e) => e.subject.cardId).sort()).toEqual([...new Set(answered.map((a) => `card:written-recognition:${a.unitId}`))].sort());
    expect(reviewed.length).toBe(answered.length);
    expect(reviewed.every((e) => (e.payload as { schedulerProfile?: unknown }).schedulerProfile !== undefined)).toBe(true);

    // ── 6. FSRS and the levels, side by side, and the same deck on another device ──
    const at = T(30);
    const schedules = cardSchedules(events, scheduler, { ...scope, now: at });
    expect(schedules.length).toBe(added.length);
    const missedCard = schedules.find((c) => c.unitId === MISSED)!;
    const hitCard = schedules.find((c) => c.unitId === HIT)!;
    expect(missedCard.reps).toBeGreaterThan(0);
    expect(missedCard.phase).toBe('learning'); // failed (then possibly re-asked as a learning return within the session): still in the learning steps
    const missedHistory = deckOf(events, scheduler, { ...scope, now: at }).items.find((i) => i.unitId === MISSED)!.history;
    expect(missedHistory[0]!.rating).toBe(1); // the miss is the first entry of its history
    expect(missedHistory.length).toBe(answered.filter((a) => a.unitId === MISSED).length); // every answer, and only the answers, scheduled it
    expect(hitCard.retrievability).toBeGreaterThan(0.5);
    expect(Date.parse(hitCard.due)).toBeGreaterThan(Date.parse(answeredAt.get(HIT)!)); // a hit returns later, not now
    standings = knowledgeStandings(events, scope);
    const overview = unitOverview(MISSED, standings, schedules);
    expect(overview.standing!.level).toBe('recognized'); // one miss does not undo the level; the level is not the schedule
    expect(overview.cards[0]!.cardId).toBe(missedCard.cardId);
    const shuffled = [...events].reverse();
    expect(cardSchedules(shuffled, scheduler, { ...scope, now: at })).toEqual(schedules);

    // ── 7. the contexts of a card are the places the word was met ──
    expect(contextsOf(LOGOS, events).map((c) => c.verse)).toEqual([1]); // met in 1:1 (verse 14 was not read yet); review events carry no place

    // ── 8. review → reading: the next passage by familiarity (provisional), with the review knowledge counted ──
    const candidates = [passage(6, 8), passage(9, 13), passage(14, 18), passage(1, 5)];
    // After one reading and one session nothing stands at `familiar` yet (that needs repeated unaided recognition), so the default
    // policy honestly says 0 % everywhere; a reader early in a learner's life lowers the floor to `recognized` to see the reading count.
    const strict = candidates.map((p) => passageFamiliarity({ profile: GREEK, passage: p, standings, frequency: NT_FREQUENCY }));
    for (const f of strict) { expect(f.provisional).toBe(true); expect(f.tokens).toBeGreaterThan(0); expect(f.familiarity).toBe(0); }
    expect(strict[3]!.reliability).toBeGreaterThan(strict[2]!.reliability); // but the read passage rests on far more evidence
    const policy = { knownFrom: 'recognized' as const };
    const estimates = candidates.map((p) => passageFamiliarity({ profile: GREEK, passage: p, standings, frequency: NT_FREQUENCY, policy }));
    const reread = estimates[3]!;
    expect(reread.familiarity).toBeGreaterThan(estimates[2]!.familiarity); // what was read is more familiar than what was not
    expect(reread.familiarity).toBe(1); // every word of a completed passage was (assisted-)recognised
    const best = nextBestPassage({ profile: GREEK, passages: candidates, standings, frequency: NT_FREQUENCY, policy })!;
    expect(best.rank).toBe(1);
    expect(best.reasons.length).toBe(4);
    expect(best.familiarity.distanceFromBand).toBe(Math.min(...estimates.map((f) => f.distanceFromBand))); // the nearest to the band wins
    const unread = estimates.filter((f) => f.ref !== reread.ref);
    expect(unread.every((f) => f.unknownLexemes[0]!.frequencyRank !== undefined)).toBe(true); // what to pre-teach first, commonest first

    // ── 9. a second reading of the chosen passage is recorded idempotently ──
    const again = mapEncounters([{ kind: 'passage-viewed', encounterId: 'read2:view', at: T(40), passage: best.familiarity.ref, verses: candidates.find((c) => c.ref === best.familiarity.ref)!.verses }], { profile: GREEK, identity });
    await sink.record(again.flatMap((m) => m.events));
    await sink.record(again.flatMap((m) => m.events)); // the sync retries
    const final = await committed();
    expect(final.length).toBe(events.length + again.flatMap((m) => m.events).length);
  }, 30_000);
});
