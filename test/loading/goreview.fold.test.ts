// @vitest-environment jsdom
/**
 * One answered card must not refold the whole log (docs/ecosystem/LOADING-ARCHITECTURE-2026-11-10.md, rule 2).
 * The golden is the folded deck after each scripted step, recorded on the code before the fold was made incremental.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const counted = vi.hoisted(() => ({ calls: 0, events: 0 }));
vi.mock('../../packages/goreview/src/scheduler/deck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/goreview/src/scheduler/deck')>();
  return { ...actual, foldDeckItems: (...a: Parameters<typeof actual.foldDeckItems>) => { counted.calls += 1; counted.events += a[0].length; return actual.foldDeckItems(...a); } };
});

import { destroyRigs, makeRig } from '../goreview-app/helpers';
import { buildScript } from './goreview.fold.script';

afterEach(() => destroyRigs());
const GOLDEN = path.join(__dirname, 'goreview.fold.golden.json');
const digest = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex');

async function engineAndPrefs() {
  const rig = await makeRig({ signedIn: true });
  return { engine: rig.app.ctx.engine, prefs: await rig.app.ctx.state.getPrefs('L1', 'sq') };
}

it('folds the scripted session to the recorded deck at every step, and equals a fresh full fold at every step', async () => {
  const { engine, prefs } = await engineAndPrefs();
  const steps = buildScript();
  const got = steps.map((s) => {
    const shared = engine.foldDeckShared!(s.log, 'sq', prefs, s.at);
    expect(shared, s.name).toEqual(engine.foldDeck(s.log, 'sq', prefs, s.at));
    return { step: s.name, items: shared.length, digest: digest(shared) };
  });
  if (!fs.existsSync(GOLDEN) || process.env.UPDATE_FOLD_GOLDEN === '1') fs.writeFileSync(GOLDEN, JSON.stringify(got, null, 1) + '\n');
  expect(got).toEqual(JSON.parse(fs.readFileSync(GOLDEN, 'utf8')));
}, 120_000);

it('does not fold more events per answer when the history quadruples', async () => {
  const { engine, prefs } = await engineAndPrefs();
  // answers after the history is known: the events passed through the fold for the NEXT answer, small history and four times the history
  const perAnswer = (cards: number, lookups: number): number[] => {
    const steps = buildScript(cards, lookups);
    const answers = steps.filter((s) => ['an answer', 'another answer', 'a wrong answer (a lapse)', 'the lapsed card answered right', 'an easy answer', 'a hard answer'].includes(s.name));
    let prevName = '';
    const out: number[] = [];
    // read the deck the way a session does: once per step in order, the previous step's log already folded
    for (const s of steps) {
      counted.calls = 0; counted.events = 0;
      engine.foldDeckShared!(s.log, 'sq', prefs, s.at);
      if (answers.includes(s) && prevName) out.push(counted.events);
      prevName = s.name;
    }
    return out;
  };
  const small = perAnswer(40, 300), large = perAnswer(160, 1200);
  // a cold first read is a full fold (the first step); every later answer folds one card's events, whatever the history's size
  expect(Math.max(...large)).toBeLessThanOrEqual(Math.max(...small));
  expect(Math.max(...large)).toBeLessThan(40);
}, 120_000);
