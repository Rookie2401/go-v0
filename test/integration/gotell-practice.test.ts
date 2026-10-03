/**
 * GoTell practice on the REAL engines (adapters, importer, GoLearn): receptive input from reading feeds the scheduler;
 * a failed retrieval leaves receptive state exactly as it was; a success reaches GoLearn's writing dimension classified by
 * the help shown; and a productive gap raises — modestly — the value of a text that uses the word in context.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { Text } from '../../src/core';
import { importDocuments } from '../../src/ingest';
import { profileOfStoredText } from '../../src/library';
import { bundledDoc, liveSentences, makeApp, makeClock, reader, seedUser } from './harness';

const U = 'tell-es';
const BELIEVE = 'goal:t.believe-jesus';

describe('GoTell practice — integration with GoLearn (Spanish)', () => {
  const clock = makeClock();
  const app = makeApp({ clock });
  const practice = app.gotellAll.forUser(U).practice!;
  let dialogue: Text;
  let withGap = 0;
  let practised = 0;
  const items = async () => JSON.stringify((await app.store.learnerItems.all()).filter((r) => r.userId === U).sort((a, b) => (a.id < b.id ? -1 : 1)));

  beforeAll(async () => {
    await seedUser(app.store, U, 'honduras-es');
    await importDocuments(app.store, app.adapters, [bundledDoc('es', 'dialogue-01')]);
    dialogue = (await app.store.texts.get(ids.text('es', 'dialogue-01')))!;
    await reader(app, U, 'es', 'sit-1').view(dialogue, await liveSentences(app.store, dialogue.id));
    await app.golearn.settled();
  });

  it('reading is the input signal: the scheduler sees the words he has met for each idea', async () => {
    const c = (await practice.schedule(U, 'es')).find((x) => x.goal.id === BELIEVE)!;
    expect(c.selection.factors.find((f) => f.key === 'input')!.value).toBe(1); // "creo" and "Dios" were in the dialogue
    expect(c.state.level).toBe(0); // met is not said
  });

  it('a failed retrieval leaves every receptive row unchanged, and reports the gap', async () => {
    const before = await items();
    const t = (await practice.next(U, 'es', { goalId: BELIEVE }))!;
    const r = await practice.submit(U, t.taskId, 'Yo en Dios.');
    expect(r.attempt.outcome).not.toBe('success');
    expect(r.attempt.gapItemIds).toContain('form:es:creo');
    await app.golearn.settled();
    expect(await items()).toBe(before);
    await practice.close(U, t.taskId);
  });

  it('a productive gap raises the value of a text that uses the word in context — modestly, with its reason', async () => {
    const profile = (await profileOfStoredText(app.store, dialogue.id))!;
    const [ranked] = await app.golearn.rankLibrary(U, [{ profile }]);
    expect(ranked.profile.productiveItems).toContain('form:es:creo');
    expect(ranked.reasons.join(' ')).toMatch(/practising saying/);
    withGap = ranked.parts.reinforcement;
    practised = ranked.profile.productiveItems!.length;
  });

  it('an independent success reaches the writing dimension as independent production', async () => {
    clock.jumpMinutes(45);
    const t = (await practice.next(U, 'es', { goalId: BELIEVE }))!;
    const r = await practice.submit(U, t.taskId, 'Creo en Dios.');
    expect(r.attempt.levelAfter).toBe(4);
    await app.golearn.settled();
    const creo = await app.golearn.getItemState(U, 'form:es:creo');
    expect(creo!.writing.level).not.toBe('unseen');
    expect(creo!.reading.level).not.toBe('unseen'); // receptive untouched by productive evidence
    const prod = await app.bus.history({ userId: U, types: ['ProductionRecorded'] });
    expect(prod.every((e) => e.type === 'ProductionRecorded' && e.kind === 'independent')).toBe(true);
    // once said on his own, the gap is gone from ranking
    const profile = (await profileOfStoredText(app.store, dialogue.id))!;
    const [ranked] = await app.golearn.rankLibrary(U, [{ profile }]);
    expect(ranked.profile.productiveItems).toBeUndefined();
    // modest: each practised word is worth half a weak item (RANKING.productiveWeight / reinforcementFull)
    expect(withGap - ranked.parts.reinforcement).toBeCloseTo((0.5 * practised) / 8, 4);
  });
});
