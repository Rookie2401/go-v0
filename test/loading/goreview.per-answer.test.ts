// @vitest-environment jsdom
/**
 * Answering a card must not cost more as the learner's history grows (docs/ecosystem/LOADING-ARCHITECTURE-2026-11-10.md, rule 2).
 * While a session runs, the guard and the runner used to re-read and refold the whole event log about ten times per card.
 * This measures one session on a real-sized history (1,500 lookups, 200 cards with 4 reviews each) by wrapping the whole-log readers.
 */
import { afterEach, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => {
  const rows: Record<string, { n: number; ms: number }> = {};
  const wrap = <F extends (...a: never[]) => unknown>(name: string, fn: F): F => ((...a: never[]) => {
    const t = performance.now();
    try { return fn(...a); } finally { const r = (rows[name] ??= { n: 0, ms: 0 }); r.n += 1; r.ms += performance.now() - t; }
  }) as F;
  return { rows, wrap, reset: () => { for (const k of Object.keys(rows)) delete rows[k]; } };
});
vi.mock('../../packages/goreview/src/scheduler/deck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/goreview/src/scheduler/deck')>();
  return { ...actual, foldDeckItems: probe.wrap('foldDeck', actual.foldDeckItems) };
});
vi.mock('../../packages/goreview/src/planner/budget', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/goreview/src/planner/budget')>();
  return { ...actual, admissionBudget: probe.wrap('admissionBudget', actual.admissionBudget) };
});
vi.mock('../../packages/goreview/src/planner/eligibility', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/goreview/src/planner/eligibility')>();
  return {
    ...actual,
    createReviewEligibilityContext: probe.wrap('contextBuild', actual.createReviewEligibilityContext),
    reviewEligibility: (x: Parameters<typeof actual.reviewEligibility>[0]) => probe.wrap(x.context ? 'eligibilityWithContext' : 'eligibilityNoContext', actual.reviewEligibility)(x),
  };
});

import { CONTRACT_VERSION, type GoEvent } from '../../packages/repository-contract/src';
import { buildCardRemoved } from '../../packages/goreview/src/scheduler/deck';
import { cardAdded, destroyRigs, ids, key, makeRig, reviewed, seed, settleRefresh, type, unitOf, until, type Rig } from '../goreview-app/helpers';

afterEach(() => destroyRigs());

const A = ids('L1', 'sq');
const DAY = 86_400_000;

/** 1,500 lookups over 300 words, and 200 cards with 4 reviews each (a few of them failed last, so the Current Deck has work). */
function history(): GoEvent[] {
  const out: GoEvent[] = [];
  const base = Date.parse('2026-08-01T09:00:00.000Z');
  for (let i = 0; i < 1500; i++) {
    out.push({
      id: `lookup-${i}`, v: CONTRACT_VERSION, learnerId: 'L1', enrolmentId: A.enrolmentId, languageId: 'sq', at: new Date(base + i * 3_000_000).toISOString(),
      producer: { app: 'golearn-ext', version: 'test', deviceId: 'dev-old' }, kind: 'SelectionLookedUp',
      subject: { itemIds: [unitOf(`look${i % 300}`)] }, payload: { surface: `look${i % 300}`, tokenCount: 1, contextKind: 'none', contextConfidence: 0, readerId: 'test', helpShown: [] }, dedupeKey: `lookup-${i}`,
    });
  }
  for (let c = 0; c < 200; c++) {
    const label = `card${c}`;
    out.push(cardAdded(A, label, 'meaning-to-form', new Date(Date.parse('2026-08-10T09:00:00.000Z') + c * 60_000).toISOString()));
    for (let r = 0; r < 4; r++) {
      const failedLast = c < 12 && r === 3;
      out.push(reviewed(A, label, 'meaning-to-form', failedLast ? 1 : 3, new Date(Date.parse('2026-08-15T10:00:00.000Z') + r * 6 * DAY + c * 60_000).toISOString()));
    }
  }
  return out;
}

const present = (rig: Rig): string | undefined => rig.root.querySelector('#session .exercise')?.getAttribute('data-item') ?? undefined;

interface CardRun { index: number; presented: string; folds: number; contextBuilds: number; eventReads: number; admissionBudgets: number; eligibilityNoContext: number; wallMs: number; foldMs: number; budgetMs: number; eligibilityMs: number; contextMs: number }

async function runSession(rig: Rig, cardsToAnswer: number, beforeNext?: (answered: number) => Promise<void>): Promise<{ runs: CardRun[]; presented: string[]; written: Array<Omit<GoEvent, 'id'>> }> {
  const ctx = rig.app.ctx;
  const realEvents = ctx.events.bind(ctx);
  (ctx as { events: typeof ctx.events }).events = probe.wrap('eventReads', realEvents) as typeof ctx.events;
  const before = (await realEvents('sq')).length;
  rig.q('#start-session').click();
  await until(() => !!present(rig), 'the first exercise', 400);
  const runs: CardRun[] = [], presented: string[] = [];
  for (let i = 0; i < cardsToAnswer; i++) {
    const shown = present(rig)!;
    presented.push(shown);
    const input = rig.root.querySelector<HTMLInputElement>('#answer-input');
    if (input) { type(input, shown.split(':')[4]); key('Enter', input); } else rig.qa('.choice')[0]!.click();
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback', 400);
    if (beforeNext) await beforeNext(i);
    probe.reset();
    const t0 = performance.now();
    rig.q('#next').click();
    await until(() => (present(rig) !== undefined && present(rig) !== shown) || !!rig.root.querySelector('#summary'), 'the next card', 400);
    const wallMs = performance.now() - t0;
    const r = probe.rows;
    runs.push({ index: i, presented: shown, folds: r.foldDeck?.n ?? 0, contextBuilds: r.contextBuild?.n ?? 0, eventReads: r.eventReads?.n ?? 0, admissionBudgets: r.admissionBudget?.n ?? 0,
      eligibilityNoContext: r.eligibilityNoContext?.n ?? 0, wallMs: Math.round(wallMs), foldMs: Math.round(r.foldDeck?.ms ?? 0), budgetMs: Math.round(r.admissionBudget?.ms ?? 0),
      eligibilityMs: Math.round((r.eligibilityNoContext?.ms ?? 0) + (r.eligibilityWithContext?.ms ?? 0)), contextMs: Math.round(r.contextBuild?.ms ?? 0) });
    if (rig.root.querySelector('#summary')) break;
  }
  const log = await realEvents('sq');
  const written = log.slice(before).map(({ id: _id, ...rest }) => rest);
  return { runs, presented, written };
}

async function seededRig(): Promise<Rig> {
  const rig = await makeRig({ signedIn: true });
  await seed(rig, history());
  await rig.go('settings'); await rig.go('review');
  await until(() => !!rig.root.querySelector('#current-deck'), 'the current deck', 400);
  await settleRefresh(rig);
  return rig;
}

const cardId = (n: number): string => `card:meaning-to-target-retrieval:lemma:sq:card${n}:NOUN`;
/** Recorded from the code as it was before the session shared one view of the log per event head (2026-11-10). */
const EXPECTED_PRESENTED = [0, 1, 2, 3, 4].map(cardId);
const EXPECTED_WRITTEN_DIGEST = '5552da18fc1bf01d08b27356ad228b45a478f64f880d74aa36a07aa09d888a1e';
const digest = async (written: unknown): Promise<string> => (await import('node:crypto')).createHash('sha256').update(JSON.stringify(written)).digest('hex');

it('answers each card with at most 2 whole-log folds and 2 eligibility-context builds, and presents and writes exactly what it did before', async () => {
  const rig = await seededRig();
  const { runs, presented, written } = await runSession(rig, 5);
  for (const r of runs) console.log(JSON.stringify(r));
  expect(presented).toEqual(EXPECTED_PRESENTED);
  expect(written.map((e) => [e.kind, e.subject.cardId, e.payload.rating])).toEqual(EXPECTED_PRESENTED.map((id) => ['CardReviewed', id, 3]));
  expect(await digest(written)).toBe(EXPECTED_WRITTEN_DIGEST);
  expect(runs).toHaveLength(5);
  for (const r of runs) {
    expect(r.folds, `folds for answered card ${r.index}`).toBeLessThanOrEqual(2);
    expect(r.contextBuilds, `context builds for answered card ${r.index}`).toBeLessThanOrEqual(2);
  }
}, 300_000);

it('sees an event appended behind the session back at the very next guard decision (a suspension and a dismissal)', async () => {
  const rig = await seededRig();
  const base = { v: CONTRACT_VERSION, learnerId: 'L1', enrolmentId: A.enrolmentId, languageId: 'sq', at: '2026-10-08T10:00:00.000Z' } as const;
  const behind = async (answered: number): Promise<void> => {
    if (answered !== 0) return;
    // as if a sync pulled them while card 0 was on screen: card 1 suspended (changes the fold), card 2's word dismissed (changes the marks)
    await seed(rig, [
      buildCardRemoved({ ...base, deviceId: 'dev-other', itemId: cardId(1), reason: 'suspended' }),
      { ...base, id: 'mark-card2', producer: { app: 'golearn-ext', version: 'test', deviceId: 'dev-other' }, kind: 'ItemMarked', subject: { itemIds: [unitOf('card2')] }, payload: { mark: 'ignore' }, dedupeKey: 'mark-card2' },
    ]);
    rig.app.ctx.notifyData();
  };
  const { presented, written } = await runSession(rig, 3, behind);
  expect(presented).toEqual([cardId(0), cardId(3), cardId(4)]);
  expect(written.filter((e) => e.kind === 'CardReviewed').map((e) => e.subject.cardId)).toEqual([cardId(0), cardId(3), cardId(4)]);
}, 300_000);

it('the shared fold equals a fresh fold at every instant, before and after a snooze ends, and serves nothing from an older log', async () => {
  const rig = await makeRig({ signedIn: true });
  const engine = rig.app.ctx.engine;
  const prefs = await rig.app.ctx.state.getPrefs('L1', 'sq');
  const base = { v: CONTRACT_VERSION, learnerId: 'L1', enrolmentId: A.enrolmentId, languageId: 'sq' } as const;
  const log: GoEvent[] = [
    ...history().filter((e) => e.kind !== 'SelectionLookedUp').slice(0, 40),
    buildCardRemoved({ ...base, at: '2026-10-01T10:00:00.000Z', deviceId: 'dev-x', itemId: cardId(1), reason: 'snoozed', until: '2026-10-10T10:00:00.000Z' }),
  ];
  for (const at of ['2026-10-05T00:00:00.000Z', '2026-10-10T09:59:59.999Z', '2026-10-10T10:00:00.000Z', '2026-10-20T00:00:00.000Z', '2026-10-05T00:00:00.000Z']) {
    expect(engine.foldDeckShared!(log, 'sq', prefs, at)).toEqual(engine.foldDeck(log, 'sq', prefs, at));
  }
  expect(engine.foldDeckShared!(log, 'sq', prefs, '2026-10-05T00:00:00.000Z').find((i) => i.itemId === cardId(1))?.status).toBe('snoozed');
  expect(engine.foldDeckShared!(log, 'sq', prefs, '2026-10-20T00:00:00.000Z').find((i) => i.itemId === cardId(1))?.status).toBe('active');
  // a longer log is a different head: it is folded again, not answered from the shorter one
  const longer = [...log, buildCardRemoved({ ...base, at: '2026-10-02T10:00:00.000Z', deviceId: 'dev-x', itemId: cardId(2), reason: 'suspended' })];
  const after = engine.foldDeckShared!(longer, 'sq', prefs, '2026-10-05T00:00:00.000Z');
  expect(after).toEqual(engine.foldDeck(longer, 'sq', prefs, '2026-10-05T00:00:00.000Z'));
  expect(after.find((i) => i.itemId === cardId(2))?.status).toBe('suspended');
  // a bad instant is refused as the plain fold refuses it
  expect(() => engine.foldDeckShared!(longer, 'sq', prefs, 'not a time')).toThrow();
});
