import { describe, expect, it } from 'vitest';
import { buildFixtureText, createMemoryStore, ids } from '../../src/core';
import { createLibrary, featuresOfStoredText, profileOfStoredText } from '../../src/library';
import { registry, addAnalysis, spanishStore, clock } from './helpers';

const tok = (textId: string, s: number, t: number) => ids.token(ids.sentence(textId, s), t);

describe('features of a stored text', () => {
  it('measures every feature from the stored analyses', async () => {
    const { store, text } = await spanishStore();
    // a pronoun clitic and a tagged variety, both written as extra analyses
    await addAnalysis(store, tok(text.id, 2, 0), { parts: [{ text: 'Dí', start: 0, end: 2, lemma: 'decir', pos: 'VERB' }, { text: 'me', start: 2, end: 4, pos: 'PRON', role: 'indirect object pronoun' }], confidence: 1, provenance: 'human' });
    await addAnalysis(store, tok(text.id, 1, 2), { varieties: ['es-ES'], confidence: 1, provenance: 'human' });
    const f = (await featuresOfStoredText(store, text.id))!;
    expect(f.words).toBe(11);
    expect(f.sentences).toBe(3);
    expect(f.uniqueForms).toBe(10); // "que" twice
    expect(f.meanSentenceWords).toBeCloseTo(11 / 3, 3);
    expect(f.longSentenceShare).toBe(0);
    expect(f.subordinatorsPerSentence).toBeCloseTo(2 / 3, 3); // que, que
    expect(f.subjunctiveShare).toBeCloseTo(1 / 11, 3); // vengas
    expect(f.cliticShare).toBeCloseTo(1 / 11, 3); // the word with an attached pronoun
    expect(f.phraseShare).toBeCloseTo(2 / 11, 3); // "creo que"
    expect(f.properNounShare).toBeCloseTo(1 / 11, 3); // Dios
    expect(f.unanalysedShare).toBeCloseTo(1 / 11, 3); // ahora
    expect(f.varietyShare).toEqual({ 'es-ES': expect.closeTo(1 / 11, 3) });
  });

  it('counts only live sentences: a retired sentence is history', async () => {
    const { store, text } = await spanishStore();
    const before = (await featuresOfStoredText(store, text.id))!;
    const s = (await store.sentences.get(ids.sentence(text.id, 1)))!;
    await store.sentences.put({ ...s, retiredInVersion: 2 });
    const after = (await featuresOfStoredText(store, text.id))!;
    expect(after.sentences).toBe(before.sentences - 1);
    expect(after.words).toBe(before.words - 3);
    expect(after.subjunctiveShare).toBeCloseTo(0, 5); // vengas went with it
    const p = (await profileOfStoredText(store, text.id))!;
    expect(p.forms.find(([f]) => f === 'vengas')).toBeUndefined();
    expect(p.patterns).toEqual([]); // the pattern occurrence belonged to the retired sentence
  });

  it('leaves a feature the analysis cannot measure out, instead of writing zero', async () => {
    const store = createMemoryStore();
    const text = await buildFixtureText(store, { lang: 'es', slug: 'sin-analisis', sentences: [{ tokens: [{ surface: 'Hola' }, { surface: 'mundo' }, { surface: '.', isWord: false }] }] });
    const f = (await featuresOfStoredText(store, text.id))!;
    expect(f).toMatchObject({ words: 2, sentences: 1, uniqueForms: 2, unanalysedShare: 1, longSentenceShare: 0 });
    for (const absent of ['subordinatorsPerSentence', 'subjunctiveShare', 'cliticShare', 'phraseShare', 'properNounShare', 'varietyShare']) {
      expect(f, absent).not.toHaveProperty(absent);
    }
  });

  it('does not assert a subjunctive from an ambiguous mood, and ignores a text with no mood at all', async () => {
    const store = createMemoryStore();
    const text = await buildFixtureText(store, { lang: 'es', slug: 'ambiguo', sentences: [{ tokens: [
      { surface: 'hable', lemma: 'hablar', pos: 'VERB', morph: { Mood: 'Ind,Sub' } }, { surface: 'casa', lemma: 'casa', pos: 'NOUN' },
    ] }] });
    expect((await featuresOfStoredText(store, text.id))!.subjunctiveShare).toBe(0); // measurable (a mood is stated) but nothing certain
    const t2 = await buildFixtureText(store, { lang: 'es', slug: 'sin-modo', sentences: [{ tokens: [{ surface: 'casa', lemma: 'casa', pos: 'NOUN' }] }] });
    expect((await featuresOfStoredText(store, t2.id))).not.toHaveProperty('subjunctiveShare');
  });

  it('counts a long sentence (more than 30 words)', async () => {
    const store = createMemoryStore();
    const long = Array.from({ length: 31 }, (_, i) => ({ surface: `palabra${i}`, lemma: `palabra${i}`, pos: 'NOUN' as const }));
    const text = await buildFixtureText(store, { lang: 'es', slug: 'larga', sentences: [{ tokens: long }, { tokens: [{ surface: 'corta', lemma: 'corto', pos: 'ADJ' }] }] });
    const f = (await featuresOfStoredText(store, text.id))!;
    expect(f.longSentenceShare).toBe(0.5);
    expect(f.meanSentenceWords).toBe(16);
  });

  it('measures Thai the same way (segmented tokens, no spaces)', async () => {
    const store = createMemoryStore();
    const toks = ['ฉัน', 'ไป', 'ตลาด'].map((surface) => ({ surface, lemma: surface, pos: 'NOUN' as const }));
    const text = await buildFixtureText(store, { lang: 'th', slug: 'th-muestra', sentences: [{ tokens: toks }, { tokens: toks.slice(0, 2) }] });
    const f = (await featuresOfStoredText(store, text.id))!;
    expect(f).toMatchObject({ words: 5, sentences: 2, uniqueForms: 3, unanalysedShare: 0 });
    expect(f).not.toHaveProperty('subjunctiveShare');
    const p = (await profileOfStoredText(store, text.id))!;
    expect(p.forms[0][1]).toBe(2);
  });

  it('returns undefined for a text that is not stored', async () => {
    const store = createMemoryStore();
    expect(await featuresOfStoredText(store, 'text:es:nada')).toBeUndefined();
    expect(await profileOfStoredText(store, 'text:es:nada')).toBeUndefined();
  });
});

describe('profile of a stored text', () => {
  it('lists forms, lemmas, phrases and patterns with counts, sorted by count then key', async () => {
    const { store, text } = await spanishStore();
    const p = (await profileOfStoredText(store, text.id))!;
    expect(p).toMatchObject({ textId: text.id, lang: 'es', words: 11, analyzers: [] });
    expect(p.forms[0]).toEqual(['que', 2]);
    expect(p.forms.slice(1).every(([, n]) => n === 1)).toBe(true);
    const keys = p.forms.slice(1).map(([f]) => f);
    expect(keys).toEqual([...keys].sort());
    expect(p.forms.reduce((n, [, c]) => n + c, 0)).toBe(11);
    expect(p.lemmas).toContainEqual([ids.lemma('es', 'que', 'SCONJ'), 2]);
    expect(p.lemmas.some(([id]) => id === ids.lemma('es', 'creer', 'VERB'))).toBe(true);
    expect(p.phrases).toEqual([[ids.phrase('es', ['creo', 'que']), 1]]);
    expect(p.patterns).toEqual([[ids.pattern('es', 'subjunctive'), 1]]);
    expect(p.features).toEqual((await featuresOfStoredText(store, text.id))!);
  });

  it('credits a lemma by the same rule GoLearn uses: a human row wins, a doubtful machine row credits nothing', async () => {
    const { store, text } = await spanishStore();
    const ahora = tok(text.id, 2, 1); // no analysis yet
    await addAnalysis(store, ahora, { lemmaId: ids.lemma('es', 'ahora', 'ADV'), pos: 'ADV', confidence: 0.3, provenance: 'machine' });
    let p = (await profileOfStoredText(store, text.id))!;
    expect(p.lemmas.some(([id]) => id.startsWith('lemma:es:ahora'))).toBe(false); // too doubtful to credit
    expect(p.features.unanalysedShare).toBe(0); // but it is no longer without analysis
    await addAnalysis(store, ahora, { lemmaId: ids.lemma('es', 'ahora', 'ADV'), pos: 'ADV', confidence: 0.2, provenance: 'human' }, `${ahora}:human`);
    p = (await profileOfStoredText(store, text.id))!;
    expect(p.lemmas).toContainEqual([ids.lemma('es', 'ahora', 'ADV'), 1]);
  });

  it('is cached by Library.profile and invalidated by a content version or analyzer change', async () => {
    const { store, text } = await spanishStore();
    let lookups = 0;
    const real = store.analyses.where.bind(store.analyses);
    store.analyses.where = (async (f: never, v: never) => { lookups++; return real(f, v); }) as never;
    const lib = createLibrary({ store, adapters: registry, clock });
    const first = (await lib.profile(text.id))!;
    expect(first.words).toBe(11);
    const cost = lookups;
    expect(cost).toBeGreaterThan(0);
    expect(await lib.profile(text.id)).toEqual(first);
    expect(lookups).toBe(cost); // from the cache
    await store.texts.put({ ...text, contentVersion: 2 });
    await lib.profile(text.id);
    expect(lookups).toBe(2 * cost); // recomputed for the new content version
    await lib.profile(text.id);
    expect(lookups).toBe(2 * cost);
    await store.texts.put({ ...text, contentVersion: 2, transformations: [{ at: 'x', tool: 'adapter-es@9', description: 'tokenized and analyzed' }] });
    const changed = (await lib.profile(text.id))!;
    expect(lookups).toBe(3 * cost); // recomputed for the new analyzer
    expect(changed.analyzers).toEqual(['adapter-es@9']);
  });

  it('has no profile for a text that is not in the store or the library', async () => {
    const lib = createLibrary({ store: createMemoryStore(), adapters: registry, fetch: (async () => new Response('', { status: 404 })) as typeof fetch });
    expect(await lib.profile('text:es:nada')).toBeUndefined();
    expect(await lib.entry('text:es:nada')).toBeUndefined();
  });
});
