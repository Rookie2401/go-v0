/** itemHistory — the learner's whole history with one item, in plain lines for the word sheet. */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { COURSE, buildChapter, stageRow, t, workRow } from './courseFixtures';

const U = 'u1';
const F = (w: string) => ids.form('es', w);
const ch7 = ids.text('es', 'ch7');
const ch8 = ids.text('es', 'ch8');
const loose = ids.text('es', 'loose');

async function setup(): Promise<Harness> {
  const h = createHarness();
  await h.store.stages.put(stageRow(1, 'g1'));
  await h.store.works.put({ ...workRow('w1', 'g1'), title: 'El libro de Ana' });
  const sentences = (n: number) => Array.from({ length: n }, () => ({ tokens: [t('sol', 'sol', 'NOUN'), t('luna', 'luna', 'NOUN')] }));
  await buildChapter(h.store, { slug: 'ch7', work: 'w1', chapter: 7, title: 'El libro de Ana — Capítulo 7', sentences: sentences(6) });
  await buildChapter(h.store, { slug: 'ch8', work: 'w1', chapter: 8, sentences: sentences(3) });
  await buildChapter(h.store, { slug: 'loose', title: 'Un cuento suelto', sentences: sentences(2) });
  return h;
}

describe('itemHistory', () => {
  it('an item never met says so, and still gives the fixed lines', async () => {
    const h = await setup();
    const hist = await h.golearn.itemHistory(U, F('sol'));
    expect(hist).toMatchObject({ itemId: F('sol'), itemKind: 'form', encounterCount: 0, byText: [], pronunciation: 'not measured' });
    expect(hist.first).toBeUndefined();
    expect(hist.lines).toEqual([
      'You have not met this yet.',
      'Reading: not met in reading yet.',
      'Listening: not heard in real speech yet.',
      'Not used in your own writing yet.',
      'Pronunciation: not measured.',
    ]);
  });

  it('names the first meeting by book and chapter, counts texts, and reports the help-free run', async () => {
    const h = await setup();
    await h.view(U, 'es', ch7, 0, 's1'); // first met: chapter 7
    await h.help(U, 'es', ch7, 0, 0, F('sol'), 1, 's1');
    await h.view(U, 'es', ch7, 1, 's1');
    await h.view(U, 'es', ch7, 2, 's1');
    await h.view(U, 'es', ch8, 0, 's2');
    await h.view(U, 'es', loose, 0, 's3');
    const hist = await h.golearn.itemHistory(U, F('sol'));
    expect(hist.encounterCount).toBe(5);
    expect(hist.first).toMatchObject({ textId: ch7, textTitle: 'El libro de Ana — Capítulo 7', workId: ids.work(COURSE, 'w1'), chapter: 7, sentenceId: `${ch7}/s0` });
    expect(hist.byText).toEqual([
      { textId: ch7, textTitle: 'El libro de Ana — Capítulo 7', workId: ids.work(COURSE, 'w1'), count: 3 },
      { textId: ch8, textTitle: 'ch8', workId: ids.work(COURSE, 'w1'), count: 1 },
      { textId: loose, textTitle: 'Un cuento suelto', count: 1 },
    ]);
    expect(hist.lines.slice(0, 3)).toEqual([
      'You first met this in El libro de Ana, chapter 7.',
      'Met 5 times in 3 texts, the last 4 without help.',
      'Reading: likely familiar (an estimate).', // four help-free meetings in three sittings
    ]);
  });

  it('a text outside any work is named by its own title', async () => {
    const h = await setup();
    await h.view(U, 'es', loose, 0);
    expect((await h.golearn.itemHistory(U, F('sol'))).lines[0]).toBe('You first met this in Un cuento suelto.');
  });

  it('reading is labelled from the evidence: with help, likely familiar (an estimate), shown understood', async () => {
    const h = await setup();
    await h.view(U, 'es', ch7, 0, 's1');
    await h.help(U, 'es', ch7, 0, 0, F('sol'), 1, 's1');
    await h.view(U, 'es', ch7, 1, 's1');
    await h.help(U, 'es', ch7, 1, 0, F('sol'), 1, 's1');
    expect((await h.golearn.itemHistory(U, F('sol'))).reading).toBe('met with help');

    const e = await setup();
    for (const s of ['s1', 's2', 's3', 's4']) await e.view(U, 'es', ch7, Number(s[1]) - 1, s); // four help-free meetings in four sittings
    const est = await e.golearn.itemHistory(U, F('sol'));
    expect(est.reading).toBe('likely familiar (an estimate)');
    expect(est.lines).toContain('Reading: likely familiar (an estimate).');

    const d = await setup();
    await d.understood(U, 'es', ch7, [0, 1]);
    expect((await d.golearn.itemHistory(U, F('sol'))).reading).toBe('shown understood (you reported understanding it without help)');
  });

  it('listening and production come from their own evidence', async () => {
    const h = await setup();
    await h.view(U, 'es', ch7, 0);
    await h.listen(U, 'es', ch7, [0, 1]);
    await h.produce(U, 'es', F('sol'), 'independent');
    await h.produce(U, 'es', F('sol'), 'assisted');
    const hist = await h.golearn.itemHistory(U, F('sol'));
    expect(hist.listening).toBe('heard in real speech, not yet shown understood');
    expect(hist.production).toBe('used in your own writing twice (1 on your own, 1 with help)');
    expect(hist.lines).toContain('Listening: heard in real speech, not yet shown understood.');
    expect(hist.lines).toContain('Used in your own writing twice (1 on your own, 1 with help).');
    expect(hist.lines[hist.lines.length - 1]).toBe('Pronunciation: not measured.');
    expect(hist.encounterCount).toBe(3); // one reading + two heard sentences; productions are not "met"
    // fixture audio is not real speech
    const f = await setup();
    await f.listen(U, 'es', ch7, [0], { speech: false });
    expect((await f.golearn.itemHistory(U, F('sol'))).listening).toBe('not heard in real speech yet');
  });

  it('an explicit mark is reported on its own line and never folded into the reading label', async () => {
    const h = await setup();
    await h.view(U, 'es', ch7, 0);
    await h.mark(U, 'es', F('sol'), 'known');
    const hist = await h.golearn.itemHistory(U, F('sol'));
    expect(hist.reading).toBe('met, not yet shown understood');
    expect(hist.lines).toContain('You marked it known.');
  });

  it('works for lemmas, phrases and patterns, and rejects an id of no known shape', async () => {
    const h = await setup();
    await h.view(U, 'es', ch7, 0);
    const lemma = await h.golearn.itemHistory(U, ids.lemma('es', 'sol', 'NOUN'));
    expect(lemma).toMatchObject({ itemKind: 'lemma', encounterCount: 1 });
    await expect(h.golearn.itemHistory(U, 'nonsense')).rejects.toThrow(/unknown item id/);
  });

  it('is private to the learner and does not write', async () => {
    const h = await setup();
    await h.view('someone-else', 'es', ch7, 0);
    const before = (await h.store.encounters.all()).length;
    expect((await h.golearn.itemHistory(U, F('sol'))).encounterCount).toBe(0);
    expect((await h.store.encounters.all()).length).toBe(before);
  });
});
