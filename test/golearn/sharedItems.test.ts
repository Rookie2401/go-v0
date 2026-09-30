import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { createHarness } from './harness';
import { ES_JOHN, ES_STORY, HI_STORY, TH_BIBLE, TH_STORY, buildHindi, buildSpanish, buildSpanishScripture, buildThai } from './fixtures';

const U = 'u1';
const F = (l: 'es' | 'th' | 'hi', w: string) => ids.form(l, w);
const LEMMA_CREER = ids.lemma('es', 'creer', 'VERB');

describe('DEMO 1 — one lemma, one LearnerItemState, across story and scripture', () => {
  it('story "creo" + scripture "cree" feed a single lemma state with both textIds', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    await h.understood(U, 'es', ES_STORY, [0], 's1'); // "Yo creo en Dios."
    await h.understood(U, 'es', ES_JOHN, [0], 's2', 'scripture'); // "Todo aquel que cree en él"

    const rows = (await h.store.learnerItems.where('itemId', LEMMA_CREER)).filter((r) => r.userId === U);
    expect(rows).toHaveLength(1); // exactly one LearnerItemState for the lemma
    const lemma = rows[0];
    expect(lemma.itemKind).toBe('lemma');
    expect(lemma.textIds.sort()).toEqual([ES_JOHN, ES_STORY].sort());
    expect(lemma.encounterCount).toBe(2);
    expect(lemma.reading.evidence).toBe(2); // two demonstrated encounters, one in each text
    expect(lemma.reading.level).toBe('recognized'); // two distinct sentences

    // the two surface forms are distinct items, each from its own text
    const creo = (await h.golearn.getItemState(U, F('es', 'creo')))!;
    const cree = (await h.golearn.getItemState(U, F('es', 'cree')))!;
    expect(creo.textIds).toEqual([ES_STORY]);
    expect(cree.textIds).toEqual([ES_JOHN]);

    // shared *form* across both texts ("en", "dios"): one state, both texts
    const en = (await h.golearn.getItemState(U, F('es', 'en')))!;
    expect(en.textIds.sort()).toEqual([ES_JOHN, ES_STORY].sort());
    // the encounters themselves are distinct (different sentences)
    const encs = (await h.store.encounters.where('itemId', LEMMA_CREER)).filter((e) => e.userId === U);
    expect(new Set(encs.map((e) => e.sentenceId)).size).toBe(2);
    expect(encs.map((e) => e.surface).sort()).toEqual(['corpus', 'scripture']);
  });

  it('knowing the lemma from the story makes the scripture form count as known in coverage', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    for (const s of ['s1', 's2', 's3']) await h.understood(U, 'es', ES_STORY, [0], s);
    const cov = await h.golearn.coverage(U, ES_JOHN, [`${ES_JOHN}/s0`]);
    // tokens: todo aquel que cree en él → "cree" known through its lemma, "en" known as a form; others unseen
    expect(cov.wordTokens).toBe(6);
    expect(cov.knownLexicalCoverage).toBeCloseTo(2 / 6, 6);
    const support = await h.golearn.sentenceSupport(U, `${ES_JOHN}/s0`);
    expect(support.highlight[`${ES_JOHN}/s0/t3`]).toBe('known'); // cree
    expect(support.highlight[`${ES_JOHN}/s0/t0`]).toBe('unseen'); // todo
  });
});

describe('DEMO 4 — Thai without whitespace', () => {
  it('counts tokens from the stored segmentation, never from whitespace', async () => {
    const h = createHarness();
    await buildThai(h.store);
    const sentence = (await h.store.sentences.get(`${TH_STORY}/s0`))!;
    expect(/\s/.test(sentence.text)).toBe(false); // the text has no spaces
    expect(sentence.text).toBe('พระเจ้าทรงรักโลก');
    const tokens = await h.store.tokens.where('sentenceId', sentence.id);
    expect(tokens.length).toBeGreaterThanOrEqual(4);

    // the test adapter throws on th tokenization — GoLearn must never try
    expect(() => h.adapters.get('th').tokenize(sentence.text)).toThrow();

    await h.view(U, 'th', TH_STORY, 0);
    for (const tok of tokens) {
      const st = await h.golearn.getItemState(U, tok.formId);
      expect(st?.encounterCount).toBe(1);
      expect(st?.textIds).toEqual([TH_STORY]);
    }
    const lemma = await h.golearn.getItemState(U, ids.lemma('th', 'รัก', 'VERB'));
    expect(lemma?.reading.level).toBe('encountered');
  });

  it('shares forms/lemmas between a Thai story and the Thai Bible text; queryItem normalizes via the adapter', async () => {
    const h = createHarness();
    await buildThai(h.store);
    await h.view(U, 'th', TH_STORY, 0, 's1');
    await h.view(U, 'th', TH_BIBLE, 0, 's2', 'scripture');
    const rak = (await h.store.learnerItems.where('itemId', ids.lemma('th', 'รัก', 'VERB'))).filter((r) => r.userId === U);
    expect(rak).toHaveLength(1);
    expect(rak[0].textIds.sort()).toEqual([TH_BIBLE, TH_STORY].sort());

    const k = await h.golearn.queryItem(U, { surface: 'รัก', lang: 'th' });
    expect(k.itemId).toBe(F('th', 'รัก'));
    expect(k.exactFormSeen).toBe(true);
    expect(k.encounterCount).toBe(2);
  });

  it('coverage over unspaced text uses stored tokens', async () => {
    const h = createHarness();
    await buildThai(h.store);
    const cov = await h.golearn.coverage(U, TH_STORY);
    expect(cov.wordTokens).toBe(7);
    expect(cov.unseenCoverage).toBe(1);
    for (const s of ['a', 'b', 'c']) await h.understood(U, 'th', TH_STORY, [0, 1], s);
    const after = await h.golearn.coverage(U, TH_STORY);
    expect(after.knownLexicalCoverage).toBe(1);
    expect(after.band).toBe('comfortable');
  });
});

describe('Hindi (combining marks stay inside tokens)', () => {
  it('keeps हूँ and परमेश्वर as single forms and shares them across sentences', async () => {
    const h = createHarness();
    await buildHindi(h.store);
    const hoon = 'हूँ';
    expect(h.adapters.get('hi').normalize(hoon)).toBe(hoon.normalize('NFC')); // no case folding / mark stripping
    await h.view(U, 'hi', HI_STORY, 0, 's1');
    await h.view(U, 'hi', HI_STORY, 1, 's1');
    const st = (await h.golearn.getItemState(U, F('hi', hoon)))!;
    expect(st.encounterCount).toBe(1);
    const god = (await h.golearn.getItemState(U, F('hi', 'परमेश्वर')))!;
    expect(god.encounterCount).toBe(2); // two sentences, one session → two encounters of one form item
    const aux = (await h.golearn.getItemState(U, ids.lemma('hi', 'होना', 'AUX')))!;
    expect(aux.encounterCount).toBe(2); // हूँ and है share the lemma
    const k = await h.golearn.queryItem(U, { surface: hoon, lang: 'hi' });
    expect(k.exactFormSeen).toBe(true);
  });
});
