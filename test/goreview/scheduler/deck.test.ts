import { describe, expect, it } from 'vitest';
import { validateEvent } from '../../../packages/repository-contract/src';
import type { GoEvent } from '../../../packages/repository-contract/src';
import { assertValidEvent, buildCardAdded, buildCardRemoved, createFsrsScheduler, foldDeck, foldDeckItems, itemIdFor } from '../../../packages/goreview/src/scheduler';
import { added, at, DAY, ENROL, LEARNER, reviewed, shuffled, T0 } from './helpers';

const sched = createFsrsScheduler();
const NOW = at(400 * DAY);
const ID = itemIdFor('lex:logos', 'written-recognition');
const removed = (itemId: string, when: string, reason: 'dismissed' | 'suspended' | 'snoozed', until?: string, deviceId = 'dev-A'): GoEvent =>
  buildCardRemoved({ learnerId: LEARNER, enrolmentId: ENROL, languageId: 'grc', at: when, deviceId, itemId, reason, ...(until ? { until } : {}) });

describe('itemIdFor and the event builders', () => {
  it('itemIdFor is card:<dimension>:<unitId>', () => {
    expect(itemIdFor('lex:logos', 'auditory-recognition')).toBe('card:auditory-recognition:lex:logos');
  });
  it('every built event passes validateEvent, from the right producer, with the documented dedupeKey', () => {
    const evs = [
      added('lex:logos', T0, { reason: 'saved by the learner', addedBy: 'learner' }),
      added('lex:logos', T0, { dimension: 'auditory-recognition', family: 'audio-to-meaning', deviceId: 'dev-B' }),
      removed(ID, at(DAY), 'dismissed'),
      removed(ID, at(DAY), 'suspended'),
      removed(ID, at(DAY), 'snoozed', at(7 * DAY)),
      buildCardAdded({ learnerId: LEARNER, enrolmentId: ENROL, languageId: 'grc', varietyId: 'koine', at: T0, deviceId: 'd', unitId: 'u', unitKind: 'construction', dimension: 'construction-understanding', family: 'grammar-application', addedBy: 'intake', id: 'custom-id', producerVersion: '9.9.9' }),
    ];
    for (const e of evs) {
      expect(validateEvent(e)).toEqual([]);
      expect(e.producer.app).toBe('gopractice-review');
      expect(() => assertValidEvent(e)).not.toThrow();
    }
    expect(evs[0]!.dedupeKey).toBe(`card:${ID}:CardAdded:${T0}`);
    expect(evs[2]!.dedupeKey).toBe(`card:${ID}:CardRemoved:${at(DAY)}`);
    expect(evs[0]!.subject).toEqual({ cardId: ID, itemIds: ['lex:logos'] });
    expect(evs[0]!.payload).toEqual({ unitId: 'lex:logos', unitKind: 'lexeme', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'learner', reason: 'saved by the learner' });
    expect(evs[4]!.payload).toEqual({ reason: 'snoozed', until: at(7 * DAY) });
    expect(evs[5]).toMatchObject({ id: 'custom-id', varietyId: 'koine', producer: { version: '9.9.9' } });
  });
  it('ids differ between devices for the same item and instant (so both survive), and a snooze must name its end', () => {
    expect(added('u', T0, { deviceId: 'a' }).id).not.toBe(added('u', T0, { deviceId: 'b' }).id);
    expect(() => buildCardRemoved({ learnerId: LEARNER, enrolmentId: ENROL, languageId: 'grc', at: T0, deviceId: 'd', itemId: ID, reason: 'snoozed' })).toThrow(/until/);
    expect(() => buildCardRemoved({ learnerId: LEARNER, enrolmentId: ENROL, languageId: 'grc', at: T0, deviceId: 'd', itemId: ID, reason: 'dismissed', until: T0 })).toThrow(/snooze/);
  });
  it('assertValidEvent reports what validateEvent refuses', () => {
    const bad = { ...added('u', T0), at: 'yesterday' } as GoEvent;
    expect(() => assertValidEvent(bad)).toThrow(/at/);
  });
});

describe('foldDeck: creating items and scheduling', () => {
  it('CardAdded creates an active, new item with the event as its provenance', () => {
    const { items, unscored, ignored } = foldDeck([added('lex:logos', T0, { reason: 'met four times' })], sched, { now: NOW });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ itemId: ID, unitId: 'lex:logos', unitKind: 'lexeme', languageId: 'grc', dimension: 'written-recognition', family: 'written-recognition', addedAt: T0, addedBy: 'intake', reasons: ['met four times'], status: 'active', history: [] });
    expect(items[0]!.schedule).toEqual(sched.newState(T0));
    expect(unscored).toEqual({});
    expect(ignored).toEqual([]);
  });

  it('reviews advance the schedule exactly as the scheduler does, and append history in order', () => {
    const evs = [added('lex:logos', T0)];
    let st = sched.newState(T0);
    let when = T0;
    const ratings = [3, 3, 2, 1, 3] as const;
    const kinds = ['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed', 'CardReviewed', 'CardReviewed'] as const;
    ratings.forEach((r, i) => {
      when = at(i === 0 ? 0 : 1 * DAY * i + 10 * 60_000, T0);
      st = sched.review(st, r, when);
      evs.push(reviewed(ID, when, r, { kind: kinds[i]!, extra: i === 3 ? { correct: false } : {} }));
    });
    const item = foldDeck(evs, sched, { now: NOW }).items[0]!;
    expect(item.schedule).toEqual(st);
    expect(item.history.map((h) => h.rating)).toEqual([3, 3, 2, 1, 3]);
    expect(item.history.map((h) => h.at)).toEqual(evs.slice(1).map((e) => e.at));
    expect(item.history[0]).toMatchObject({ deviceId: 'dev-A', elapsedDays: 0, family: 'written-recognition', outcome: 'correct' });
    expect(item.history[3]!.outcome).toBe('incorrect');
    expect(item.history[1]!.elapsedDays).toBe(1); // a day and ten minutes after the first review
    expect(item.history.map((h) => h.elapsedDays)).toEqual([0, 1, 1, 1, 1]);
  });

  it('does not schedule legacy-shaped forged invalid, assisted or no-claim grades', () => {
    const cases = [
      reviewed(ID, at(1000), 3, { extra: { outcome: 'invalid-question' } }),
      reviewed(ID, at(2000), 3, { extra: { hinted: true } }),
      { ...reviewed(ID, at(3000), 3), evidence: { quality: 'none' as const } },
      reviewed(ID, at(4000), 3, { extra: { challenged: true } }),
      reviewed(ID, at(5000), 3, { extra: { retrievalAttempted: false } }),
    ];
    const fold = foldDeck([added('lex:logos', T0), ...cases], sched, { now: NOW });
    expect(fold.items[0]!.schedule.reps).toBe(0);
    expect(fold.items[0]!.history).toEqual([]);
    expect(fold.unscored[ID]).toBe(5);
  });

  it('takes outcome, exerciseId and family from the payload when they are valid, and falls back otherwise', () => {
    const evs = [
      added('lex:logos', T0),
      reviewed(ID, at(1000), 3, { extra: { outcome: 'partial', exerciseId: 'ex-9', family: 'meaning-to-form' } }),
      reviewed(ID, at(2000), 3, { extra: { outcome: 'banana', family: 'nonsense' } }),
    ];
    const h = foldDeck(evs, sched, { now: NOW }).items[0]!.history;
    expect(h[0]).toMatchObject({ outcome: 'partial', exerciseId: 'ex-9', family: 'meaning-to-form' });
    expect(h[1]).toMatchObject({ outcome: 'correct', family: 'written-recognition' });
    expect(h[1]!.exerciseId).toBe(evs[2]!.id);
  });

  it('results without a rating change nothing: they are only counted', () => {
    const base = [added('lex:logos', T0), reviewed(ID, at(60_000), 3)];
    const unscored = [
      ...base,
      reviewed(ID, at(2 * 60_000), null),
      reviewed(ID, at(3 * 60_000), undefined, { kind: 'ListeningAssessed' }),
      reviewed(ID, at(4 * 60_000), 7 as never),
      reviewed(ID, at(5 * 60_000), null, { kind: 'AssessmentAnswered' }),
    ];
    const a = foldDeck(base, sched, { now: NOW });
    const b = foldDeck(unscored, sched, { now: NOW });
    expect(b.items).toEqual(a.items);
    expect(b.items[0]!.history).toHaveLength(1);
    expect(a.unscored).toEqual({});
    expect(b.unscored).toEqual({ [ID]: 4 });
  });

  it('two devices reviewing the same item offline both appear in the history, in `at` order, without overwriting', () => {
    const evs = [
      added('lex:logos', T0),
      reviewed(ID, at(10 * 60_000), 3, { deviceId: 'phone' }),
      reviewed(ID, at(3 * DAY), 3, { deviceId: 'laptop' }),
      reviewed(ID, at(3 * DAY + 5 * 60_000), 2, { deviceId: 'phone' }),
      reviewed(ID, at(3 * DAY + 1000), 3, { deviceId: 'laptop' }),
    ];
    const item = foldDeck(evs, sched, { now: NOW }).items[0]!;
    expect(item.history.map((h) => h.deviceId)).toEqual(['phone', 'laptop', 'laptop', 'phone']);
    expect(item.history.map((h) => h.at)).toEqual([...item.history.map((h) => h.at)].sort());
    expect(item.schedule.reps).toBe(4);
  });

  it('a review 30 days after its due date is folded like any other (late success, no special-casing)', () => {
    const first = at(0);
    const second = sched.review(sched.review(sched.newState(T0), 3, first), 3, at(10 * 60_000));
    const late = at(Date.parse(second.due) - Date.parse(T0) + 30 * DAY);
    const evs = [added('lex:logos', T0), reviewed(ID, first, 3), reviewed(ID, at(10 * 60_000), 3), reviewed(ID, late, 3)];
    const item = foldDeck(evs, sched, { now: at(500 * DAY) }).items[0]!;
    expect(item.schedule).toEqual(sched.review(second, 3, late));
    expect(item.history[2]!.elapsedDays).toBeGreaterThanOrEqual(30);
  });

  it('reviews of items that were never added, or that precede their CardAdded in event time, are reported, not guessed', () => {
    const evs = [reviewed('card:written-recognition:ghost', at(1000), 3), reviewed(ID, at(-1000), 3), added('lex:logos', T0)];
    const fold = foldDeck(evs, sched, { now: NOW });
    expect(fold.items).toHaveLength(1);
    expect(fold.items[0]!.history).toEqual([]);
    expect(fold.ignored.map((x) => x.reason)).toEqual([expect.stringMatching(/not been added/), expect.stringMatching(/not been added/)]);
  });

  it('malformed CardAdded payloads and timestamps are ignored with a reason', () => {
    const bad1 = { ...added('u1', T0), payload: { unitId: 'u1', unitKind: 'lexeme', dimension: 'telepathy', family: 'written-recognition', addedBy: 'intake' } } as GoEvent;
    const bad2 = { ...added('u2', T0), subject: {} } as GoEvent;
    const bad3 = { ...added('u3', T0), at: 'whenever' } as GoEvent;
    const fold = foldDeck([bad1, bad2, bad3, added('u4', T0)], sched, { now: NOW });
    expect(fold.items.map((i) => i.unitId)).toEqual(['u4']);
    expect(fold.ignored).toHaveLength(3);
  });

  it('an event delivered twice (same id) counts once', () => {
    const r = reviewed(ID, at(1000), 3);
    const item = foldDeck([added('lex:logos', T0), r, { ...r }], sched, { now: NOW }).items[0]!;
    expect(item.history).toHaveLength(1);
    expect(item.schedule.reps).toBe(1);
  });
});

describe('foldDeck: determinism', () => {
  const evs: GoEvent[] = (() => {
    const out: GoEvent[] = [added('lex:logos', T0), added('lex:logos', T0, { dimension: 'auditory-recognition', family: 'audio-to-meaning', deviceId: 'dev-B' }), added('lex:anthropos', at(1000), { addedBy: 'learner', reason: 'saved' })];
    const idA = itemIdFor('lex:logos', 'written-recognition');
    const idB = itemIdFor('lex:logos', 'auditory-recognition');
    const idC = itemIdFor('lex:anthropos', 'written-recognition');
    for (let d = 0; d < 40; d++) {
      out.push(reviewed(idA, at(d * DAY + 60_000), ((d % 4) + 1) as 1 | 2 | 3 | 4, { deviceId: d % 2 ? 'phone' : 'laptop' }));
      if (d % 3 === 0) out.push(reviewed(idB, at(d * DAY + 120_000), 3, { kind: 'ListeningAssessed', deviceId: 'phone' }));
      if (d % 5 === 0) out.push(reviewed(idC, at(d * DAY + 180_000), null));
    }
    out.push(removed(idC, at(30 * DAY), 'snoozed', at(60 * DAY)), removed(idB, at(35 * DAY), 'suspended'), added('lex:logos', at(38 * DAY), { dimension: 'auditory-recognition', family: 'audio-to-meaning', reason: 'again' }));
    // Same instant on two devices: the id breaks the tie.
    out.push(reviewed(idA, at(50 * DAY), 3, { deviceId: 'phone' }), reviewed(idA, at(50 * DAY), 2, { deviceId: 'laptop' }));
    return out;
  })();

  it('the same event multiset in any order gives an identical deck', () => {
    const reference = foldDeck(evs, sched, { now: NOW });
    for (let seed = 1; seed <= 25; seed++) {
      const other = foldDeck(shuffled(evs, seed), createFsrsScheduler(), { now: NOW });
      expect(other).toEqual(reference);
    }
    expect(reference.items).toHaveLength(3);
  });

  it('does not mutate its input', () => {
    const copy = JSON.stringify(evs);
    foldDeck(evs, sched, { now: NOW });
    expect(JSON.stringify(evs)).toBe(copy);
  });

  it('the later device clock wins ties by event id, the same on every device', () => {
    const idA = itemIdFor('lex:logos', 'written-recognition');
    const hist = foldDeck(evs, sched, { now: NOW }).items.find((i) => i.itemId === idA)!.history.filter((h) => h.at === at(50 * DAY));
    expect(hist).toHaveLength(2);
    expect(hist.map((h) => h.deviceId).sort()).toEqual(['laptop', 'phone']);
  });
});

describe('foldDeck: removal, snooze and re-add', () => {
  const base = (): GoEvent[] => [added('lex:logos', T0, { reason: 'first' }), reviewed(ID, at(60_000), 3)];

  it('dismissed and suspended set the status and keep the schedule and history', () => {
    for (const reason of ['dismissed', 'suspended'] as const) {
      const item = foldDeck([...base(), removed(ID, at(DAY), reason)], sched, { now: NOW }).items[0]!;
      expect(item.status).toBe(reason);
      expect(item.history).toHaveLength(1);
      expect(item.schedule.reps).toBe(1);
    }
  });

  it('a snooze holds until its end, then the item is active again', () => {
    const evs = [...base(), removed(ID, at(DAY), 'snoozed', at(10 * DAY))];
    const during = foldDeck(evs, sched, { now: at(5 * DAY) }).items[0]!;
    expect(during.status).toBe('snoozed');
    expect(during.snoozedUntil).toBe(at(10 * DAY));
    const exactly = foldDeck(evs, sched, { now: at(10 * DAY) }).items[0]!;
    expect(exactly.status).toBe('active');
    expect(exactly.snoozedUntil).toBeUndefined();
    expect(foldDeck(evs, sched, { now: at(11 * DAY) }).items[0]!.status).toBe('active');
  });

  it('a snooze with no valid end is ignored, not guessed', () => {
    const bad = { ...removed(ID, at(DAY), 'dismissed'), payload: { reason: 'snoozed' } } as GoEvent;
    const fold = foldDeck([...base(), bad], sched, { now: NOW });
    expect(fold.items[0]!.status).toBe('active');
    expect(fold.ignored).toHaveLength(1);
  });

  it('the latest of add/remove wins; re-adding re-activates and keeps schedule and history', () => {
    const evs = [...base(), removed(ID, at(DAY), 'dismissed'), added('lex:logos', at(2 * DAY), { reason: 'met again', addedBy: 'learner', family: 'meaning-to-form' })];
    const item = foldDeck(evs, sched, { now: NOW }).items[0]!;
    expect(item.status).toBe('active');
    expect(item.history).toHaveLength(1);
    expect(item.schedule.reps).toBe(1);
    expect(item.reasons).toEqual(['first', 'met again']);
    expect(item.addedAt).toBe(T0);
    expect(item.addedBy).toBe('intake');
    expect(item.family).toBe('meaning-to-form');
    // A later removal beats the earlier add.
    expect(foldDeck([...evs, removed(ID, at(3 * DAY), 'suspended')], sched, { now: NOW }).items[0]!.status).toBe('suspended');
    // Re-adding during a snooze ends it.
    const snoozed = [...base(), removed(ID, at(DAY), 'snoozed', at(300 * DAY)), added('lex:logos', at(2 * DAY))];
    const re = foldDeck(snoozed, sched, { now: at(3 * DAY) }).items[0]!;
    expect(re.status).toBe('active');
    expect(re.snoozedUntil).toBeUndefined();
  });

  it('a review that arrives from another device while the item is suspended still counts as history', () => {
    const evs = [...base(), removed(ID, at(DAY), 'suspended'), reviewed(ID, at(2 * DAY), 3, { deviceId: 'phone' })];
    const item = foldDeck(evs, sched, { now: NOW }).items[0]!;
    expect(item.status).toBe('suspended');
    expect(item.history).toHaveLength(2);
  });

  it('removing an unknown item is reported', () => {
    const fold = foldDeck([removed('card:written-recognition:nothing', T0, 'dismissed')], sched, { now: NOW });
    expect(fold.items).toEqual([]);
    expect(fold.ignored).toHaveLength(1);
  });
});

describe('foldDeck: language filter', () => {
  it('keeps only the requested language, and with no filter keeps all', () => {
    const evs = [
      added('lex:logos', T0, { languageId: 'grc' }),
      added('lex:agua', T0, { languageId: 'es' }),
      reviewed(itemIdFor('lex:agua', 'written-recognition'), at(1000), 3, { languageId: 'es' }),
      reviewed(ID, at(1000), 3, { languageId: 'grc' }),
    ];
    const grc = foldDeck(evs, sched, { languageId: 'grc', now: NOW });
    expect(grc.items.map((i) => i.unitId)).toEqual(['lex:logos']);
    expect(grc.items[0]!.history).toHaveLength(1);
    expect(grc.ignored).toEqual([]);
    const es = foldDeckItems(evs, sched, { languageId: 'es', now: NOW });
    expect(es.map((i) => i.languageId)).toEqual(['es']);
    expect(foldDeckItems(evs, sched, { now: NOW })).toHaveLength(2);
    expect(foldDeckItems(evs, sched, { languageId: 'th', now: NOW })).toEqual([]);
  });
});

describe('foldDeck: scheduler identity', () => {
  it('a different scheduler re-folds the same history into its own states (history is the source of truth)', () => {
    const evs = [added('lex:logos', T0), reviewed(ID, at(0), 3), reviewed(ID, at(10 * 60_000), 3), reviewed(ID, at(2 * DAY + 10 * 60_000), 3)];
    const a = foldDeck(evs, sched, { now: NOW }).items[0]!;
    const strict = createFsrsScheduler({ desiredRetention: 0.97 });
    const b = foldDeck(evs, strict, { now: NOW }).items[0]!;
    expect(b.history.map((h) => h.at)).toEqual(a.history.map((h) => h.at));
    expect(b.schedule.parametersVersion).toBe(strict.parametersVersion);
    expect(b.schedule.parametersVersion).not.toBe(a.schedule.parametersVersion);
    expect(Date.parse(b.schedule.due)).toBeLessThan(Date.parse(a.schedule.due));
  });
});

describe('foldDeck: append-only review corrections', () => {
  it('retains a retracted result in history but removes its scheduling contribution', () => {
    const original = { ...reviewed(ID, at(10 * DAY), 3), subject: { cardId: ID, itemIds: ['lex:logos'] } };
    const correction: GoEvent = {
      ...original, id: 'review-correction', at: at(10 * DAY + 1000), correctionOf: original.id,
      payload: { ...original.payload, rating: null, challenged: true }, evidence: { quality: 'none' },
    };
    const fold = foldDeck([added('lex:logos', T0), original, correction], sched, { now: NOW });
    const item = fold.items[0]!;
    expect(item.history).toMatchObject([{ eventId: original.id, rating: 3, retracted: true }]);
    expect(item.schedule).toEqual(sched.newState(T0));
    expect(fold.unscored[item.itemId]).toBeUndefined();
    expect(fold.ignored).toEqual([]);
  });

  it('does not let a mismatched or early correction retract an event', () => {
    const original = { ...reviewed(ID, at(10 * DAY), 3), subject: { cardId: ID, itemIds: ['lex:logos'] } };
    const mismatch: GoEvent = { ...original, id: 'wrong-target', at: at(10 * DAY + 1000), correctionOf: original.id, subject: { cardId: 'card:elsewhere' }, payload: { rating: null, challenged: true }, evidence: { quality: 'none' } };
    const early: GoEvent = { ...original, id: 'too-early', at: at(10 * DAY - 1), correctionOf: original.id, payload: { rating: null, challenged: true }, evidence: { quality: 'none' } };
    const fold = foldDeck([added('lex:logos', T0), original, mismatch, early], sched, { now: NOW });
    expect(fold.items[0]?.history[0]?.rating).toBe(3);
    expect(fold.items[0]?.history[0]?.retracted).not.toBe(true);
    expect(fold.items[0]?.schedule.reps).toBe(1);
    expect(fold.ignored).toHaveLength(2);
  });
});
