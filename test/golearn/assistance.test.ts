import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { createHarness } from './harness';
import { ES_STORY, buildSpanish } from './fixtures';

const U = 'u1';
const F = (w: string) => ids.form('es', w);
const LEMMA_CREER = ids.lemma('es', 'creer', 'VERB');
const PHRASE_CREO_EN = ids.phrase('es', ['creo', 'en', '_']);
const S0 = `${ES_STORY}/s0`;

async function weights(h: ReturnType<typeof createHarness>, itemId: string, userId = U) {
  return (await h.store.encounters.where('itemId', itemId)).filter((e) => e.userId === userId).map((e) => e.weight);
}

describe('assistance re-weights the existing encounter', () => {
  it('a gloss after the view lowers that word only, and never creates a second encounter', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    const before = await h.store.encounters.count();
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 1); // tap "creo" (token 1) for a gloss

    expect(await h.store.encounters.count()).toBe(before);
    expect(await weights(h, F('creo'))).toEqual([0.85]);
    expect(await weights(h, LEMMA_CREER)).toEqual([0.85]); // the lemma of the tapped word shares the help
    expect(await weights(h, F('dios'))).toEqual([1]); // other words are not penalised
    const creo = await h.golearn.getItemState(U, F('creo'));
    expect(creo?.reading.evidence).toBe(0.85);
    expect(creo?.reading.assisted).toBe(1);
    expect(creo?.reading.unassisted).toBe(0);
    expect((await h.store.encounters.where('itemId', F('creo')))[0].assistance).toBe(1);
  });

  it('help that arrives before the view is applied when the view arrives', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 2);
    expect(await h.store.encounters.count()).toBe(0); // help alone is not an encounter
    await h.view(U, 'es', ES_STORY, 0);
    expect(await weights(h, F('creo'))).toEqual([0.65]);
    expect(await weights(h, F('yo'))).toEqual([1]);
  });

  it('keeps the highest assistance level and never raises a weight back up', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 3);
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 1);
    expect(await weights(h, F('creo'))).toEqual([0.45]);
  });

  it('help is scoped to its own session', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0, 's1');
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 3, 's2');
    expect(await weights(h, F('creo'))).toEqual([1]);
  });

  it('phrase help lowers the phrase and its words; grammar help lowers the pattern and its tokens', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    const occ = (await h.store.phraseOccurrences.where('sentenceId', S0))[0];
    await h.bus.emit({ type: 'PhraseHelpOpened', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'ph1', sentenceId: S0, phraseOccurrenceId: occ.id, phraseId: occ.phraseId } as never);
    expect(await weights(h, PHRASE_CREO_EN)).toEqual([0.65]);
    expect(await weights(h, F('creo'))).toEqual([0.65]);
    expect(await weights(h, F('en'))).toEqual([0.65]);
    expect(await weights(h, F('yo'))).toEqual([1]);

    await h.bus.emit({ type: 'GrammarHelpOpened', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'gh1', sentenceId: S0, patternId: ids.pattern('es', 'present-tense'), tokenIds: [`${S0}/t1`] } as never);
    expect(await weights(h, ids.pattern('es', 'present-tense'))).toEqual([0.45]);
    expect(await weights(h, F('creo'))).toEqual([0.45]);
  });

  it('sentence explanation affects the whole sentence at level 4', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    await h.bus.emit({ type: 'SentenceExplanationRevealed', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'se1', sentenceId: S0 } as never);
    for (const w of ['yo', 'creo', 'en', 'dios']) expect(await weights(h, F(w))).toEqual([0.3]);
  });
});

describe('DEMO 5 — English rescue is lower-weight evidence, never a failure', () => {
  it('rescue lowers the weight of the sentence but evidence still goes up and is never negative', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view('indep', 'es', ES_STORY, 0, 's1');
    await h.view('rescued', 'es', ES_STORY, 0, 's1');
    await h.rescue('rescued', 'es', ES_STORY, [0], 's1');

    const a = await h.golearn.getItemState('indep', F('creo'));
    const b = await h.golearn.getItemState('rescued', F('creo'));
    expect(b!.reading.evidence).toBe(0.15);
    expect(b!.reading.evidence).toBeGreaterThan(0); // still evidence
    expect(b!.reading.evidence).toBeLessThan(a!.reading.evidence); // but lower weight
    expect(b!.reading.level).toBe('encountered'); // never pushed below encountered, never "failed"
    expect(b!.reading.assisted).toBe(1);

    // repeated rescued reads across sessions only ever add evidence
    let last = b!.reading.evidence;
    for (const s of ['s2', 's3', 's4']) {
      await h.view('rescued', 'es', ES_STORY, 0, s);
      await h.rescue('rescued', 'es', ES_STORY, [0], s);
      const cur = (await h.golearn.getItemState('rescued', F('creo')))!.reading.evidence;
      expect(cur).toBeGreaterThanOrEqual(last);
      expect(cur).toBeGreaterThan(0);
      last = cur;
    }
    // ...and four rescued reads do not add up to "recognized" without any unassisted reading
    const rescuedFinal = (await h.golearn.getItemState('rescued', F('creo')))!;
    expect(rescuedFinal.reading.level).not.toBe('recognized');
    expect(rescuedFinal.reading.evidence).toBeCloseTo(0.6, 6);
    for (const e of await h.store.encounters.where('userId', 'rescued')) expect(e.weight).toBeGreaterThan(0);
  });

  it('rescue revealed before the view is honoured when the view arrives', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.rescue(U, 'es', ES_STORY, [0]);
    await h.view(U, 'es', ES_STORY, 0);
    for (const e of await h.store.encounters.where('userId', U)) expect(e.weight).toBe(0.15);
  });

  it('rescue on one sentence leaves other sentences alone', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    await h.view(U, 'es', ES_STORY, 2);
    await h.rescue(U, 'es', ES_STORY, [0]);
    const creo = (await h.store.encounters.where('itemId', F('creo'))).sort((a, b) => (a.sentenceId < b.sentenceId ? -1 : 1));
    expect(creo.map((e) => e.weight)).toEqual([0.15, 1]);
  });
});
