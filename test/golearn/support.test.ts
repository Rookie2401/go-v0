import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { TokenAnalysis } from '../../src/core';
import { createHarness } from './harness';
import { ES_JOHN, ES_STORY, buildSpanish, buildSpanishScripture } from './fixtures';

const U = 'u1';
const S0 = `${ES_STORY}/s0`;
const CREO = `${S0}/t1`;

describe('tokenSupport returns only what the level needs', () => {
  it('level 0: the token alone; level 1: gloss only', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    const l0 = await h.golearn.tokenSupport(U, CREO, 0);
    expect(l0.token.surface).toBe('creo');
    expect(l0.gloss).toBeUndefined();
    const l1 = await h.golearn.tokenSupport(U, CREO, 1);
    expect(l1.gloss).toBe('believe');
    expect(l1.analysis).toBeUndefined();
    expect(l1.lemma).toBeUndefined();
    expect(l1.morphologyLine).toBeUndefined();
    expect(l1.phrases).toEqual([]);
    expect(l1.priorEncounters).toEqual([]);
    expect(l1.knownExamples).toEqual([]);
  });

  it('level 2 adds phrases; level 3+ adds analysis, lemma, morphology line, prior encounters, examples', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    await h.view(U, 'es', ES_JOHN, 0, 's1', 'scripture'); // earlier meeting of the lemma, in scripture
    await h.view(U, 'es', ES_STORY, 0, 's2');

    const l2 = await h.golearn.tokenSupport(U, CREO, 2);
    expect(l2.phrases).toHaveLength(1);
    expect(l2.phrases[0].phrase.display).toBe('creo en …');
    expect(l2.phrases[0].occurrence.tokenIds).toContain(CREO);
    expect(l2.analysis).toBeUndefined();
    expect(l2.morphologyLine).toBeUndefined();

    const l3 = await h.golearn.tokenSupport(U, CREO, 3);
    expect(l3.analysis?.lemmaId).toBe(ids.lemma('es', 'creer', 'VERB'));
    expect(l3.lemma?.lemma).toBe('creer');
    expect(l3.morphologyLine).toBe('verb · 1sg · pres');
    expect(l3.patterns.map((p) => p.key)).toEqual(['present-tense']);
    // the lemma was also met in John 3 — but not in this sentence
    expect(l3.priorEncounters.every((e) => e.sentenceId !== S0)).toBe(true);
    expect(l3.priorEncounters.map((e) => e.sentenceId)).toContain(`${ES_JOHN}/s0`);
    expect(l3.knownExamples).toEqual([`${ES_JOHN}/s0`]);
    expect(l3.uncertain).toBe(false);

    const l5 = await h.golearn.tokenSupport(U, CREO, 5);
    expect(l5.analysis).toBeDefined();
  });

  it('flags uncertain analyses instead of guessing: low confidence, alternatives, or no analysis', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    const token = `${ES_STORY}/s1/t1`; // corazón
    const a = (await h.store.analyses.where('tokenId', token))[0];
    await h.store.analyses.put({ ...a, confidence: 0.4 });
    expect((await h.golearn.tokenSupport(U, token, 1)).uncertain).toBe(true);
    await h.store.analyses.put({ ...a, confidence: 0.9, alternatives: [{ morph: {}, confidence: 0.3 }] });
    expect((await h.golearn.tokenSupport(U, token, 3)).uncertain).toBe(true);
    await h.store.analyses.put({ ...a, confidence: 0.9, alternatives: undefined });
    expect((await h.golearn.tokenSupport(U, token, 3)).uncertain).toBe(false);
    await h.store.analyses.delete(a.id);
    const none = await h.golearn.tokenSupport(U, token, 1);
    expect(none.uncertain).toBe(true);
    expect(none.gloss).toBeUndefined();
  });

  it('a low-confidence lemma link is not credited as lemma knowledge', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    const token = `${ES_STORY}/s1/t1`;
    const a = (await h.store.analyses.where('tokenId', token))[0];
    await h.store.analyses.put({ ...a, confidence: 0.3, provenance: 'machine' });
    await h.view(U, 'es', ES_STORY, 1);
    expect(await h.golearn.getItemState(U, a.lemmaId!)).toBeUndefined();
    expect((await h.golearn.getItemState(U, ids.form('es', 'corazón')))?.encounterCount).toBe(1); // the form is still met
  });

  it('throws on an unknown token', async () => {
    const h = createHarness();
    await expect(h.golearn.tokenSupport(U, 'nope/s0/t0', 1)).rejects.toThrow();
  });
});

describe('sentenceSupport', () => {
  it('returns tokens, learner highlights, and the English rescue only when asked', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    for (const s of ['s1', 's2', 's3']) await h.understood(U, 'es', ES_STORY, [0], s);
    await h.view(U, 'es', ES_STORY, 3, 's1'); // "Dios perdona el pecado." — seen once
    const plain = await h.golearn.sentenceSupport(U, `${ES_STORY}/s3`);
    expect(plain.rescue).toBeUndefined();
    expect(plain.explanation).toBeUndefined();
    expect(plain.sentence.text).toBe('Dios perdona el pecado.');
    expect(plain.tokens).toHaveLength(5);
    expect(plain.highlight[`${ES_STORY}/s3/t0`]).toBe('known'); // Dios — shown understood in three sessions
    expect(plain.highlight[`${ES_STORY}/s3/t1`]).toBe('partial'); // perdona — once
    expect(plain.highlight[`${ES_STORY}/s3/t4`]).toBeUndefined(); // punctuation is not highlighted

    const fresh = await h.golearn.sentenceSupport(U, `${ES_STORY}/s1`);
    expect(fresh.highlight[`${ES_STORY}/s1/t1`]).toBe('unseen'); // corazón

    const withRescue = await h.golearn.sentenceSupport(U, `${ES_STORY}/s3`, { withRescue: true });
    expect(withRescue.rescue?.english).toBe('God forgives the sin.');
    await expect(h.golearn.sentenceSupport(U, 'nope/s0')).rejects.toThrow();
  });
});

describe('resolveAnalysis / overrideAnalysis', () => {
  it('resolves human > lexicon > machine, then confidence', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    const token = CREO;
    const lex = (await h.store.analyses.where('tokenId', token))[0];
    const mk = (over: Partial<TokenAnalysis>): TokenAnalysis => ({ ...lex, ...over });
    await h.store.analyses.put(mk({ id: 'm1', provenance: 'machine', confidence: 0.99, lemmaId: 'lemma:es:m1' }));
    expect((await h.golearn.resolveAnalysis(token))?.id).toBe(lex.id); // lexicon beats a more confident machine row
    await h.store.analyses.put(mk({ id: 'l2', provenance: 'lexicon', confidence: 0.99, lemmaId: 'lemma:es:l2' }));
    expect((await h.golearn.resolveAnalysis(token))?.id).toBe('l2'); // higher confidence within the class
    await h.store.analyses.put(mk({ id: 'h1', provenance: 'human', confidence: 0.1, lemmaId: 'lemma:es:h1' }));
    expect((await h.golearn.resolveAnalysis(token))?.id).toBe('h1');
    expect(await h.golearn.resolveAnalysis('missing/s0/t0')).toBeUndefined();
  });

  it('override adds a superseding human row, keeps every prior row and every encounter', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    const encBefore = (await h.store.encounters.all()).map((e) => e.id).sort();
    const rowsBefore = await h.store.analyses.where('tokenId', CREO);
    const resolvedBefore = (await h.golearn.resolveAnalysis(CREO))!;

    const row = await h.golearn.overrideAnalysis(CREO, { lemmaId: ids.lemma('es', 'creer', 'AUX'), pos: 'AUX' }, 'cj');
    expect(row.provenance).toBe('human');
    expect(row.analyzer).toBe('human:cj');
    expect(row.supersedes).toBe(resolvedBefore.id);
    expect(row.confidence).toBe(1);
    expect(row.pos).toBe('AUX');
    expect(row.morph).toEqual(resolvedBefore.morph); // unpatched fields carry over

    const rowsAfter = await h.store.analyses.where('tokenId', CREO);
    expect(rowsAfter).toHaveLength(rowsBefore.length + 1);
    for (const r of rowsBefore) expect(rowsAfter.find((x) => x.id === r.id)).toEqual(r); // prior rows untouched
    expect((await h.golearn.resolveAnalysis(CREO))?.id).toBe(row.id);
    expect((await h.store.encounters.all()).map((e) => e.id).sort()).toEqual(encBefore); // nothing deleted
    expect((await h.store.lemmas.get(ids.lemma('es', 'creer', 'AUX')))?.lemma).toBe('creer'); // lemma row created

    // a second override supersedes the first
    const row2 = await h.golearn.overrideAnalysis(CREO, { morph: { Person: '1' } }, 'cj');
    expect(row2.id).not.toBe(row.id);
    expect(row2.supersedes).toBe(row.id);
    expect((await h.golearn.resolveAnalysis(CREO))?.id).toBe(row2.id);
    await expect(h.golearn.overrideAnalysis('nope/s0/t0', {}, 'cj')).rejects.toThrow();
  });

  it('new views use the override; rebuild applies it to history while keeping all form encounters', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0, 's1');
    const newLemma = ids.lemma('es', 'creer', 'AUX');
    await h.golearn.overrideAnalysis(CREO, { lemmaId: newLemma, pos: 'AUX' }, 'cj');
    expect(await h.golearn.getItemState(U, newLemma)).toBeUndefined(); // history not rewritten by the override itself
    await h.view(U, 'es', ES_STORY, 0, 's2');
    expect((await h.golearn.getItemState(U, newLemma))?.encounterCount).toBe(1);
    expect((await h.golearn.getItemState(U, ids.form('es', 'creo')))?.encounterCount).toBe(2);

    await h.golearn.rebuild(U);
    expect((await h.golearn.getItemState(U, newLemma))?.encounterCount).toBe(2);
    expect((await h.golearn.getItemState(U, ids.lemma('es', 'creer', 'VERB')))).toBeUndefined();
    expect((await h.golearn.getItemState(U, ids.form('es', 'creo')))?.encounterCount).toBe(2);
  });
});
