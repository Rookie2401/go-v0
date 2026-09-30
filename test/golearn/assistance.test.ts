import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { createHarness } from './harness';
import { ES_STORY, buildSpanish } from './fixtures';

const U = 'u1';
const F = (w: string) => ids.form('es', w);
const LEMMA_CREER = ids.lemma('es', 'creer', 'VERB');
const PHRASE_CREO_EN = ids.phrase('es', ['creo', 'en', '_']);
const S0 = `${ES_STORY}/s0`;

async function encs(h: ReturnType<typeof createHarness>, itemId: string, userId = U) {
  return (await h.store.encounters.where('itemId', itemId)).filter((e) => e.userId === userId)
    .sort((a, b) => (a.sentenceId < b.sentenceId ? -1 : 1)).map((e) => ({ kind: e.evidenceKind, assistance: e.assistance, weight: e.weight }));
}

describe('help turns the existing encounter into an assisted one (and is never a penalty)', () => {
  it('a gloss after the view marks that word (and its lemma) assisted, never creates a second encounter', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    const before = await h.store.encounters.count();
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 1); // tap "creo" (token 1) for a gloss

    expect(await h.store.encounters.count()).toBe(before);
    expect(await encs(h, F('creo'))).toEqual([{ kind: 'assisted', assistance: 1, weight: 0 }]);
    expect(await encs(h, LEMMA_CREER)).toEqual([{ kind: 'assisted', assistance: 1, weight: 0 }]); // the lemma shares the help
    expect(await encs(h, F('dios'))).toEqual([{ kind: 'exposure', assistance: 0, weight: 0 }]); // other words are not touched
    const creo = await h.golearn.getItemState(U, F('creo'));
    expect(creo?.reading.evidence).toBe(0); // help is evidence of needing help, not of comprehension
    expect(creo?.reading.assisted).toBe(1);
    expect(creo?.reading.unassisted).toBe(0);
    expect(creo?.reading.exposures).toBe(0);
    expect(creo?.reading.level).toBe('encountered');
    const dios = await h.golearn.getItemState(U, F('dios'));
    expect(dios?.reading.exposures).toBe(1);
  });

  it('help that arrives before the view is applied when the view arrives', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 2);
    expect(await h.store.encounters.count()).toBe(0); // help alone is not an encounter
    await h.view(U, 'es', ES_STORY, 0);
    expect(await encs(h, F('creo'))).toEqual([{ kind: 'assisted', assistance: 2, weight: 0 }]);
    expect((await encs(h, F('yo')))[0].kind).toBe('exposure');
  });

  it('keeps the highest assistance level', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 3);
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 1);
    expect((await encs(h, F('creo')))[0].assistance).toBe(3);
  });

  it('help is scoped to its own session', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0, 's1');
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 3, 's2');
    expect(await encs(h, F('creo'))).toEqual([{ kind: 'exposure', assistance: 0, weight: 0 }]);
  });

  it('phrase help covers the phrase and its words; grammar help covers the pattern and its tokens', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    const occ = (await h.store.phraseOccurrences.where('sentenceId', S0))[0];
    await h.bus.emit({ type: 'PhraseHelpOpened', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'ph1', sentenceId: S0, phraseOccurrenceId: occ.id, phraseId: occ.phraseId } as never);
    for (const id of [PHRASE_CREO_EN, F('creo'), F('en')]) expect((await encs(h, id))[0]).toMatchObject({ kind: 'assisted', assistance: 2 });
    expect((await encs(h, F('yo')))[0].kind).toBe('exposure');

    await h.bus.emit({ type: 'GrammarHelpOpened', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'gh1', sentenceId: S0, patternId: ids.pattern('es', 'present-tense'), tokenIds: [`${S0}/t1`] } as never);
    expect((await encs(h, ids.pattern('es', 'present-tense')))[0]).toMatchObject({ kind: 'assisted', assistance: 3 });
    expect((await encs(h, F('creo')))[0].assistance).toBe(3);
  });

  it('sentence explanation affects the whole sentence at level 4', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    await h.bus.emit({ type: 'SentenceExplanationRevealed', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'se1', sentenceId: S0 } as never);
    for (const w of ['yo', 'creo', 'en', 'dios']) expect(await encs(h, F(w))).toEqual([{ kind: 'assisted', assistance: 4, weight: 0 }]);
  });

  it('help is durable: a fresh GoLearn over the same log (app restart) applies help that preceded the view', async () => {
    const h = createHarness({ attach: false });
    await buildSpanish(h.store);
    // the event is in the log, but this GoLearn process never folded it
    await h.bus.emit({ type: 'TokenHelpOpened', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'hx', sentenceId: S0, tokenId: `${S0}/t1`, itemId: F('creo'), level: 3 } as never);
    h.golearn.attach();
    await h.view(U, 'es', ES_STORY, 0);
    expect((await encs(h, F('creo')))[0]).toMatchObject({ kind: 'assisted', assistance: 3 });
  });
});

describe('DEMO 5 — English rescue is help, never a failure', () => {
  it('a rescued sentence never counts as understood, even when "all" is then reported; nothing goes negative', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.understood('indep', 'es', ES_STORY, [0], 's1');
    await h.view('rescued', 'es', ES_STORY, 0, 's1');
    await h.rescue('rescued', 'es', ES_STORY, [0], 's1');
    await h.report('rescued', 'es', ES_STORY, [0], { session: 's1' });

    const a = await h.golearn.getItemState('indep', F('creo'));
    const b = await h.golearn.getItemState('rescued', F('creo'));
    expect(a!.reading.evidence).toBe(1); // demonstrated
    expect(b!.reading.evidence).toBe(0); // help wins over the report
    expect(b!.reading.assisted).toBe(1);
    expect(b!.reading.level).toBe('encountered'); // never below encountered, never "failed"

    // repeated rescued reads across sessions only ever add help encounters; they never become "recognized"
    for (const s of ['s2', 's3', 's4']) {
      await h.view('rescued', 'es', ES_STORY, 0, s);
      await h.rescue('rescued', 'es', ES_STORY, [0], s);
      await h.report('rescued', 'es', ES_STORY, [0], { session: s });
    }
    const rescuedFinal = (await h.golearn.getItemState('rescued', F('creo')))!;
    expect(rescuedFinal.reading.level).toBe('recognized_with_help');
    expect(rescuedFinal.reading.assisted).toBe(4);
    expect(rescuedFinal.reading.evidence).toBe(0);
    for (const e of await h.store.encounters.where('userId', 'rescued')) expect(e.weight).toBeGreaterThanOrEqual(0);
  });

  it('a gloss on one word leaves the other words of the sentence demonstrable', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 1);
    await h.report(U, 'es', ES_STORY, [0]);
    expect((await encs(h, F('creo')))[0].kind).toBe('assisted');
    expect((await encs(h, F('dios')))[0].kind).toBe('demonstrated');
    expect((await encs(h, F('yo')))[0].kind).toBe('demonstrated');
  });

  it('rescue revealed before the view is honoured when the view arrives', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.rescue(U, 'es', ES_STORY, [0]);
    await h.view(U, 'es', ES_STORY, 0);
    const rows = await h.store.encounters.where('userId', U);
    expect(rows.length).toBeGreaterThan(0);
    for (const e of rows) expect(e).toMatchObject({ evidenceKind: 'assisted', assistance: 5, weight: 0 });
  });

  it('rescue on one sentence leaves other sentences alone', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    await h.view(U, 'es', ES_STORY, 2);
    await h.rescue(U, 'es', ES_STORY, [0]);
    expect((await encs(h, F('creo'))).map((e) => e.kind)).toEqual(['assisted', 'exposure']);
  });
});
