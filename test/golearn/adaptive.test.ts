/**
 * The ADAPTIVE LADDER (R4, docs/audits/COURSE-AUDIT-2026-10-07.md 4.3 item 7): "Next on your path" used to be offered at 0.99
 * whatever happened on the previous unit. Now a unit reported below "most" (some / little), or read with help on more than 25 % of its
 * words, is offered once more (reread-before-next, 0.95) before the next unit; once reread, the unit before it; two such units in a row
 * also point at Stage 0's recall card. A clean unit changes nothing.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { LADDER_HELP_FRACTION } from '../../src/golearn/policy';
import { setLadderPathSource } from '../../src/golearn/recommend';
import type { LadderStep } from '../../src/golearn/recommend';
import { routeWorld, ladderUnit, U } from './routeWorld';
import type { RouteWorld } from './routeWorld';
import type { Degree } from './harness';

afterEach(() => setLadderPathSource(undefined));

const WORDS = ['sol', 'agua', 'casa', 'hijo']; // four one-word sentences: one word encounter per sentence

interface Unit extends LadderStep { }

async function ladder(w: RouteWorld, n = 3, o: { stage0?: boolean } = {}): Promise<Unit[]> {
  const units: Unit[] = [];
  for (let i = 1; i <= n; i++) {
    const textId = await ladderUnit(w, `unit-${i}`, WORDS);
    units.push({ unitId: `u${i}`, textId, title: `Unit ${i}`, stage: 'a1-1', published: true });
  }
  setLadderPathSource(async ({ completed }) => ({
    steps: units.filter((u) => !completed.has(u.textId)), finished: false,
    done: units.filter((u) => completed.has(u.textId)), ...(o.stage0 === false ? {} : { stage0Recall: true }),
  }));
  return units;
}

/** Reads one unit in a sitting of its own: every sentence viewed, `rescued` of them with English shown, a whole-text report, completed. */
async function readUnit(w: RouteWorld, textId: string, o: { session: string; report?: Degree; rescued?: number }) {
  const { h, lang } = w;
  await h.viewAll(U, lang, textId, WORDS.length, o.session);
  if (o.rescued) await h.rescue(U, lang, textId, Array.from({ length: o.rescued }, (_, i) => i), o.session);
  if (o.report) await h.report(U, lang, textId, [0, 1, 2, 3], { session: o.session, scope: 'text', degree: o.report });
  await h.complete(U, lang, textId, o.session);
}

const recs = (w: RouteWorld) => w.h.golearn.recommend(U, { limit: 12 });
const find = (rs: Awaited<ReturnType<typeof recs>>, id: string) => rs.find((r) => r.textId === id);

describe('the adaptive ladder', () => {
  it('a unit read cleanly changes nothing: the next unit leads at 0.99', async () => {
    const w = await routeWorld('es');
    const [u1, u2] = await ladder(w);
    await readUnit(w, u1.textId, { session: 's1', report: 'all' });
    const rs = await recs(w);
    expect(rs[0]).toMatchObject({ reason: 'next-input', textId: u2.textId, score: 0.99 });
    expect(rs.some((r) => r.reason === 'reread-before-next' || r.reason === 'stage0-recall')).toBe(false);
  });

  it('a report of "little" or "some" offers that unit once more, at 0.95, before the next unit (which drops to 0.94)', async () => {
    for (const degree of ['little', 'some'] as const) {
      const w = await routeWorld('es');
      const [u1, u2] = await ladder(w);
      await readUnit(w, u1.textId, { session: 's1', report: degree });
      const rs = await recs(w);
      expect(rs[0]).toMatchObject({ reason: 'reread-before-next', textId: u1.textId, score: 0.95 });
      expect(rs[0].explanation).toMatch(/You found the last unit hard/);
      expect(rs[0].explanation).toContain(`understood ${degree} of it`);
      expect(rs[0].explanation).toContain('read "Unit 1" once more before moving on');
      expect(rs[1]).toMatchObject({ reason: 'next-input', textId: u2.textId, score: 0.94 });
      expect(rs.filter((r) => r.textId === u1.textId)).toHaveLength(1); // the ordinary reread is replaced, not doubled
    }
  });

  it('"most" is not below "most": no change', async () => {
    const w = await routeWorld('es');
    const [u1, u2] = await ladder(w);
    await readUnit(w, u1.textId, { session: 's1', report: 'most' });
    const rs = await recs(w);
    expect(rs[0]).toMatchObject({ reason: 'next-input', textId: u2.textId, score: 0.99 });
    expect(find(rs, u1.textId)?.reason).not.toBe('reread-before-next');
  });

  it('help on more than 25 % of the unit\'s words does the same, even with no report; exactly 25 % does not', async () => {
    expect(LADDER_HELP_FRACTION).toBe(0.25);
    const heavy = await routeWorld('es');
    const [h1, h2] = await ladder(heavy);
    await readUnit(heavy, h1.textId, { session: 's1', rescued: 2 }); // 2 of 4 words
    let rs = await recs(heavy);
    expect(rs[0]).toMatchObject({ reason: 'reread-before-next', textId: h1.textId, score: 0.95 });
    expect(rs[0].explanation).toContain('help covered 50 % of its words');
    expect(find(rs, h2.textId)!.score).toBe(0.94);

    const edge = await routeWorld('es');
    const [e1, e2] = await ladder(edge);
    await readUnit(edge, e1.textId, { session: 's1', rescued: 1 }); // 1 of 4 = 25 %: not more than 25 %
    rs = await recs(edge);
    expect(rs[0]).toMatchObject({ reason: 'next-input', textId: e2.textId, score: 0.99 });
  });

  it('a unit that was reread and went well is no longer held: the next unit leads again', async () => {
    const w = await routeWorld('es');
    const [u1, u2] = await ladder(w);
    await readUnit(w, u1.textId, { session: 's1', report: 'little' });
    expect((await recs(w))[0].reason).toBe('reread-before-next');
    await readUnit(w, u1.textId, { session: 's2', report: 'all' }); // read again, all understood
    const rs = await recs(w);
    expect(rs[0]).toMatchObject({ reason: 'next-input', textId: u2.textId, score: 0.99 });
  });

  it('a unit already reread once and still hard sends the learner to the previous unit, once; then the path goes on', async () => {
    const w = await routeWorld('es');
    const [u1, u2, u3] = await ladder(w);
    await readUnit(w, u1.textId, { session: 's1', report: 'all' });
    await readUnit(w, u2.textId, { session: 's2', report: 'little' });
    expect((await recs(w))[0]).toMatchObject({ reason: 'reread-before-next', textId: u2.textId }); // first: this unit again
    await readUnit(w, u2.textId, { session: 's3', report: 'little' }); // reread once, still hard
    let rs = await recs(w);
    expect(rs[0]).toMatchObject({ reason: 'reread-before-next', textId: u1.textId, score: 0.95 });
    expect(rs[0].explanation).toMatch(/unit before it, "Unit 1"/);
    expect(find(rs, u3.textId)!.score).toBe(0.94);
    // the previous unit has now been read again: no loop - the path goes on
    await readUnit(w, u1.textId, { session: 's4', report: 'all' });
    rs = await recs(w);
    expect(rs[0]).toMatchObject({ reason: 'next-input', textId: u3.textId, score: 0.99 });
  });

  it('two such units in a row also offer Stage 0\'s recall card (no text; its home), with a note saying why', async () => {
    const w = await routeWorld('es');
    const [u1, u2] = await ladder(w);
    await readUnit(w, u1.textId, { session: 's1', report: 'some' });
    await readUnit(w, u2.textId, { session: 's2', rescued: 3 });
    const rs = await recs(w);
    const recall = rs.find((r) => r.reason === 'stage0-recall')!;
    expect(recall).toMatchObject({ score: 0.945, reinforces: [] });
    expect(recall.textId).toBeUndefined();
    expect(recall.explanation).toMatch(/last two units were hard in a row.*recall card in Stage 0/);
    expect(rs[0]).toMatchObject({ reason: 'reread-before-next', textId: u2.textId });
    expect(rs.indexOf(recall)).toBe(1); // after the reread, before the next unit
    expect(rs[2]).toMatchObject({ reason: 'next-input', score: 0.94 });
  });

  it('one hard unit alone, or a language without Stage 0, offers no recall card', async () => {
    const one = await routeWorld('es');
    const [a1, a2] = await ladder(one);
    await readUnit(one, a1.textId, { session: 's1', report: 'all' });
    await readUnit(one, a2.textId, { session: 's2', report: 'little' });
    expect((await recs(one)).some((r) => r.reason === 'stage0-recall')).toBe(false);

    const none = await routeWorld('de');
    const [b1, b2] = await ladder(none, 3, { stage0: false });
    await readUnit(none, b1.textId, { session: 's1', report: 'little' });
    await readUnit(none, b2.textId, { session: 's2', report: 'little' });
    const rs = await recs(none);
    expect(rs.some((r) => r.reason === 'stage0-recall')).toBe(false);
    expect(rs[0].reason).toBe('reread-before-next'); // German: the reread rule works the same
  });

  it('a ladder source that does not say what is done is not adaptive: the old behaviour', async () => {
    const w = await routeWorld('es');
    const [u1, u2] = await ladder(w);
    setLadderPathSource(async ({ completed }) => ({ steps: [u1, u2].filter((u) => !completed.has(u.textId)), finished: false }));
    await readUnit(w, u1.textId, { session: 's1', report: 'little' });
    const rs = await recs(w);
    expect(rs[0]).toMatchObject({ reason: 'next-input', textId: u2.textId, score: 0.99 });
  });
});
