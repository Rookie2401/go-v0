import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../src/core';
import { ids } from '../../src/core';
import { createHarness } from './harness';
import { ES_STORY, buildSpanish } from './fixtures';
import { buildFixtureText } from '../../src/core';

const U = 'u1';
const LEMMA_CREER = ids.lemma('es', 'creer', 'VERB');
const PHRASE_CREO_EN = ids.phrase('es', ['creo', 'en', '_']);

describe('SentenceViewed → encounters', () => {
  it('creates form, lemma, phrase and pattern encounters (and none for punctuation)', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);

    const encs = (await h.store.encounters.where('userId', U));
    const items = new Set(encs.map((e) => e.itemId));
    for (const f of ['yo', 'creo', 'en', 'dios']) expect(items).toContain(ids.form('es', f));
    expect(items).toContain(LEMMA_CREER);
    expect(items).toContain(ids.lemma('es', 'Dios', 'PROPN'));
    expect(items).toContain(PHRASE_CREO_EN);
    expect(items).toContain(ids.pattern('es', 'present-tense'));
    expect(items.has(ids.form('es', '.'))).toBe(false);

    const kinds = new Map(encs.map((e) => [e.itemId, e.itemKind]));
    expect(kinds.get(ids.form('es', 'creo'))).toBe('form');
    expect(kinds.get(LEMMA_CREER)).toBe('lemma');
    expect(kinds.get(PHRASE_CREO_EN)).toBe('phrase');
    expect(kinds.get(ids.pattern('es', 'present-tense'))).toBe('pattern');
    for (const e of encs) {
      expect(e.modality).toBe('reading');
      expect(e.surface).toBe('corpus');
      expect(e.assistance).toBe(0);
      expect(e.weight).toBe(1);
    }

    const creo = await h.golearn.getItemState(U, ids.form('es', 'creo'));
    expect(creo?.encounterCount).toBe(1);
    expect(creo?.reading.level).toBe('encountered');
    expect(creo?.reading.unassisted).toBe(1);
    expect(creo?.textIds).toEqual([ES_STORY]);
    expect(creo?.listening.level).toBe('unseen');
  });

  it('dedupes: a repeated word in one sentence is one encounter; same dedupeKey counts once', async () => {
    const h = createHarness();
    await buildFixtureText(h.store, {
      lang: 'es', slug: 'rep', sentences: [{ tokens: [
        { surface: 'Sí', lemma: 'sí', pos: 'INTJ' }, { surface: 'sí', lemma: 'sí', pos: 'INTJ' }, { surface: 'SÍ', lemma: 'sí', pos: 'INTJ' },
      ] }],
    });
    const first = await h.view(U, 'es', 'text:es:rep', 0);
    expect(first).not.toBeNull();
    const again = await h.view(U, 'es', 'text:es:rep', 0); // a rerender: same dedupeKey
    expect(again).toBeNull();
    const form = await h.golearn.getItemState(U, ids.form('es', 'sí'));
    expect(form?.encounterCount).toBe(1);
    expect(form?.reading.evidence).toBe(1);

    // even if the same event object is handed to handle() again, nothing changes
    const ev = (await h.bus.history({ userId: U, types: ['SentenceViewed'] }))[0];
    await h.golearn.handle(ev);
    await h.golearn.handle(ev);
    expect((await h.golearn.getItemState(U, ids.form('es', 'sí')))?.encounterCount).toBe(1);
    expect(await h.store.encounters.count()).toBe(2); // one form + one lemma
  });

  it('a new session is a new encounter; evidence accumulates and level climbs', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    for (const s of ['s1', 's2', 's3']) await h.view(U, 'es', ES_STORY, 0, s);
    const creo = await h.golearn.getItemState(U, ids.form('es', 'creo'));
    expect(creo?.encounterCount).toBe(3);
    expect(creo?.reading.evidence).toBe(3);
    expect(creo?.reading.level).toBe('recognized');
    const encs = (await h.store.encounters.where('itemId', ids.form('es', 'creo'))).sort((a, b) => (a.at < b.at ? -1 : 1));
    expect(encs.map((e) => e.priorLevel)).toEqual(['unseen', 'encountered', 'recognized_with_help']);
  });

  it('emits PhraseEncountered once per new phrase encounter and not for duplicates', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    await h.view(U, 'es', ES_STORY, 0);
    const pe = (await h.bus.history({ userId: U, types: ['PhraseEncountered'] })) as Extract<DomainEvent, { type: 'PhraseEncountered' }>[];
    expect(pe).toHaveLength(1);
    expect(pe[0].phraseId).toBe(PHRASE_CREO_EN);
    expect(pe[0].modality).toBe('reading');
    expect(pe[0].sentenceId).toBe(`${ES_STORY}/s0`);
    // GoLearn's own PhraseEncountered is not folded again
    expect((await h.golearn.getItemState(U, PHRASE_CREO_EN))?.encounterCount).toBe(1);
  });

  it('ignores events for unknown sentences and non-evidence events', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 99);
    await h.bus.emit({ type: 'AudioPlayed', userId: U, lang: 'es', surface: 'listen', session: 'l', dedupeKey: 'p1', textId: ES_STORY, segmentId: 'x', sentenceIds: [`${ES_STORY}/s0`], speed: 1, transcriptVisible: false } as never);
    await h.bus.emit({ type: 'FormSearched', userId: U, lang: 'es', surface: 'corpus', session: 's', dedupeKey: 'fs1', query: 'creo' } as never);
    expect(await h.store.encounters.count()).toBe(0);
    expect(await h.store.learnerItems.count()).toBe(0);
  });

  it('attach() is idempotent and unsubscribing stops folding', async () => {
    const h = createHarness({ attach: false });
    await buildSpanish(h.store);
    const off1 = h.golearn.attach();
    const off2 = h.golearn.attach();
    await h.view(U, 'es', ES_STORY, 0);
    expect((await h.golearn.getItemState(U, ids.form('es', 'creo')))?.encounterCount).toBe(1);
    off1(); off2();
    await h.view(U, 'es', ES_STORY, 1);
    expect(await h.golearn.getItemState(U, ids.form('es', 'corazón'))).toBeUndefined();
  });
});
