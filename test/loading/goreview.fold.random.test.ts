// @vitest-environment jsdom
/**
 * The per-answer fold (engine.ts `sharedFold`) against the whole-log fold, on logs nobody scripted: seeded random sessions that mix everything a
 * log can hold, including what the scripted golden (goreview.fold.test.ts) has none of: review corrections (valid, and ones that name another
 * card), card invalidations (pointing at their own card's review, at ANOTHER card's review, at an event that arrives later, at nothing),
 * same-instant causal chains, duplicate deliveries, older events arriving in the middle, a second learner. At every step the shared fold must
 * deep-equal a fresh whole-log fold of the same log, or throw when it throws. The run also proves the shortcut was really taken on most steps.
 */
import { afterEach, expect, it, vi } from 'vitest';

const counted = vi.hoisted(() => ({ events: 0 }));
vi.mock('../../packages/goreview/src/scheduler/deck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/goreview/src/scheduler/deck')>();
  return { ...actual, foldDeckItems: (...a: Parameters<typeof actual.foldDeckItems>) => { counted.events += a[0].length; return actual.foldDeckItems(...a); } };
});

import { CONTRACT_VERSION, type GoEvent } from '../../packages/repository-contract/src';
import { buildCardRemoved } from '../../packages/goreview/src/scheduler/deck';
import { cardAdded, destroyRigs, ids, makeRig, reviewed, unitOf } from '../goreview-app/helpers';

afterEach(() => destroyRigs());

const A = ids('L1', 'sq');
const T = Date.parse('2026-10-01T09:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

interface World { log: GoEvent[]; t: number; n: number; reviews: GoEvent[]; cards: number[] }

/** `clean`: nothing that makes a log malformed (no event of another card pointed at, no duplicate delivery, no second learner). */
function step(w: World, r: () => number, clean: boolean): { special: boolean } {
  const pick = <X>(xs: X[]): X => xs[Math.floor(r() * xs.length)]!;
  const card = (): number => Math.floor(r() * 12);
  const label = (c: number): string => `rc${c}`;
  const cardIdOf = (c: number): string => reviewed(A, label(c), 'meaning-to-form', 3, iso(T)).subject!.cardId!;
  const tick = (): string => iso(r() < 0.15 ? w.t : (w.t += 60_000 + Math.floor(r() * 3) * 86_400_000));
  const uid = (p: string): string => `${p}-${++w.n}`;
  const roll = r();
  if (roll < 0.14) { const c = card(); w.cards.push(c); w.log.push({ ...cardAdded(A, label(c), 'meaning-to-form', tick()), id: uid('add') }); return { special: false }; }
  if (roll < 0.56) {
    const c = w.cards.length && r() < 0.9 ? pick(w.cards) : card();
    const mine = w.reviews.filter((e) => e.subject?.cardId === cardIdOf(c));
    const base = reviewed(A, label(c), 'meaning-to-form', pick([1, 2, 3, 3, 3, 4] as const), tick());
    // a causal predecessor: the card's own last review, an older one of its own (a stale chain), or, in a malformed log, a review of any card
    const parent = r() < 0.35 && mine.length ? { expectedPreviousReviewId: (r() < 0.8 ? mine[mine.length - 1]! : clean ? pick(mine) : pick(w.reviews)).id } : {};
    // most reviews carry a facts fingerprint: with one (and a withdrawal) an invalidation that points at the review reads differently than without
    const fingerprint = r() < 0.8 ? { assessmentFingerprint: 'sha256:' + Math.floor(r() * 1e9).toString(16).padStart(64, '0') } : {};
    const e: GoEvent = { ...base, id: uid('rev'), payload: { ...base.payload, ...parent, ...fingerprint } };
    w.reviews.push(e); w.log.push(e); return { special: false };
  }
  if (roll < 0.64 && w.cards.length) {
    const reason = pick(['dismissed', 'suspended', 'snoozed'] as const);
    w.log.push({ ...buildCardRemoved({ learnerId: 'L1', enrolmentId: A.enrolmentId, languageId: 'sq', deviceId: 'dev-x', at: tick(), itemId: cardIdOf(pick(w.cards)), reason, ...(reason === 'snoozed' ? { until: iso(w.t + Math.floor(r() * 4) * 86_400_000) } : {}) }), id: uid('rem') });
    return { special: false };
  }
  if (roll < 0.72 && w.reviews.length) {
    // a correction: mostly well-formed for its target, sometimes naming another card (which must have no effect)
    const target = pick(w.reviews);
    const wrongCard = !clean && r() < 0.25;
    w.log.push({ ...target, id: uid('corr'), at: iso(Date.parse(target.at) + 1000 + Math.floor(r() * 5000)), correctionOf: target.id,
      subject: wrongCard ? { ...target.subject!, cardId: cardIdOf(card()) } : target.subject,
      payload: { ...target.payload, rating: null, challenged: true }, evidence: { quality: 'none', assisted: false } } as GoEvent);
    return { special: false };
  }
  if (roll < 0.80 && w.cards.length) {
    // an invalidation: pointing at its own card's review, at another card's, at an id that may arrive later, or at nothing
    const c = pick(w.cards);
    const own = w.reviews.filter((e) => e.subject?.cardId === cardIdOf(c));
    const where = r();
    const reviewEventId = (clean ? where < 0.8 : where < 0.5) && own.length ? pick(own).id : clean ? undefined : where < 0.75 && w.reviews.length ? pick(w.reviews).id : where < 0.9 ? `rev-${w.n + 1 + Math.floor(r() * 3)}` : undefined;
    w.log.push({ id: uid('inv'), v: CONTRACT_VERSION, learnerId: 'L1', enrolmentId: A.enrolmentId, languageId: 'sq', at: tick(),
      producer: { app: 'gopractice-review', version: '0.1.0', deviceId: 'dev-old' }, kind: 'ReviewItemInvalidated',
      subject: { itemIds: [unitOf(label(c))], cardId: cardIdOf(c) }, payload: { ...(reviewEventId ? { reviewEventId } : {}), reason: 'analysis changed' }, evidence: { quality: 'none', assisted: false } } as GoEvent);
    return { special: false };
  }
  if (roll < 0.88) {
    const lang = r() < 0.5 ? 'sq' : 'de';
    w.log.push({ id: uid('look'), v: CONTRACT_VERSION, learnerId: 'L1', enrolmentId: A.enrolmentId, languageId: lang, at: tick(),
      producer: { app: 'golearn-ext', version: 'test', deviceId: 'dev-old' }, kind: 'SelectionLookedUp', subject: { itemIds: [unitOf('look', lang)] },
      payload: { surface: 'look', tokenCount: 1, contextKind: 'none', contextConfidence: 0, readerId: 'test', helpShown: [] }, dedupeKey: `look-${w.n}` } as GoEvent);
    return { special: false };
  }
  if (!clean && roll < 0.92 && w.log.length) { w.log.push(pick(w.log)); return { special: true }; }                                  // the same event delivered twice
  if (roll < 0.97 && w.log.length > 4) {                                                                                  // a sync brings an older event into the middle
    const base = reviewed(A, label(card()), 'meaning-to-form', 3, iso(T + Math.floor(r() * 5) * 86_400_000));
    const e: GoEvent = { ...base, id: uid('old') }; w.reviews.push(e);
    w.log.splice(1 + Math.floor(r() * (w.log.length - 2)), 0, e); return { special: true };
  }
  const other = reviewed(ids('L2', 'sq'), label(card()), 'meaning-to-form', 3, tick());                                   // a second learner's event (rare)
  if (!clean && r() < 0.2) { w.log.push({ ...other, id: uid('l2') }); return { special: true }; }
  return { special: false };
}

it('equals a fresh whole-log fold at every step of seeded random sessions (half of them well-formed, half malformed), and takes the shortcut on the well-formed ones', async () => {
  const rig = await makeRig({ signedIn: true });
  const engine = rig.app.ctx.engine;
  const prefs = await rig.app.ctx.state.getPrefs('L1', 'sq');
  let plain = 0, short = 0, steps = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const r = rng(seed * 7919);
    const w: World = { log: [], t: T, n: 0, reviews: [], cards: [] };
    // a seeded deck, so the first steps are not all "a review of a card never added"
    for (let c = 0; c < 6; c++) { w.cards.push(c); w.log.push({ ...cardAdded(A, `rc${c}`, 'meaning-to-form', iso(T + c * 1000)), id: `seed-add-${c}` }); }
    engine.foldDeckShared!([...w.log], 'sq', prefs, iso(w.t));
    for (let i = 0; i < 140; i++) {
      const { special } = step(w, r, seed % 2 === 0);
      const log = [...w.log];
      const at = iso(w.t + Math.floor(r() * 3) * 86_400_000);
      const outcome = (f: () => unknown): { ok: true; v: unknown } | { ok: false; e: string } => { try { return { ok: true, v: f() }; } catch (e) { return { ok: false, e: e instanceof Error ? e.message : String(e) }; } };
      const whole = outcome(() => engine.foldDeck(log, 'sq', prefs, at));
      counted.events = 0;
      const shared = outcome(() => engine.foldDeckShared!(log, 'sq', prefs, at));
      const folded = counted.events;
      expect(shared, `seed ${seed}, step ${i}, ${log.length} events, last ${log.at(-1)?.id}`).toEqual(whole);
      steps += 1;
      if (!special && log.length > 30) { plain += 1; if (folded < log.length) short += 1; }
    }
  }
  expect(steps).toBe(24 * 140);
  // the shortcut is what is under test: it must have been taken, often (a log that turned "unsafe" stays on whole folds, so not always)
  expect(plain).toBeGreaterThan(1000);
  expect(short).toBeGreaterThan(800);
}, 300_000);
