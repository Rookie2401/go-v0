/**
 * Contract v9 in the measure: compounds, genitive, older spelling, nominalizations, passives, relative clauses, participial
 * modifiers and the verb bracket, all read from stored rows only. A feature the rows cannot support is ABSENT (never zero),
 * and a text without any of the new fields measures exactly as it did before: the literal values in the first block were taken
 * from the code BEFORE this change and must never be edited to make a later change pass.
 */
import { describe, expect, it } from 'vitest';
import { buildFixtureText, createMemoryStore, ids } from '../../src/core';
import type { AppStore, FixtureSentence, TokenAnalysis } from '../../src/core';
import { featuresOfStoredText, measureStoredText, profileOfStoredText } from '../../src/library';
import { BRACKET_PATTERN_KEYS } from '../../src/library/measure';
import { SPANISH_SPEC } from './helpers';

const patch = async (store: AppStore, tokenId: string, p: Partial<TokenAnalysis>) => {
  const row = (await store.analyses.where('tokenId', tokenId))[0];
  await store.analyses.put({ ...row, ...p });
};

describe('a text without any of the new fields measures exactly as before', () => {
  it('measureStoredText: the profile and the features, as literal values from the code before', async () => {
    const store = createMemoryStore();
    const text = await buildFixtureText(store, SPANISH_SPEC); // its pronoun "Yo" states Case: Nom, as Spanish pronouns do
    const m = await measureStoredText(store, text.id);
    expect(JSON.stringify(m)).toBe('{"profile":{"textId":"text:es:muestra","lang":"es","analyzers":[],"words":11,"forms":[["que",2],["ahora",1],["bueno",1],["creo",1],["dios",1],["dímelo",1],["es",1],["quiero",1],["vengas",1],["yo",1]],"lemmas":[["lemma:es:que:SCONJ",2],["lemma:es:Dios:PROPN",1],["lemma:es:bueno:ADJ",1],["lemma:es:creer:VERB",1],["lemma:es:decir:VERB",1],["lemma:es:querer:VERB",1],["lemma:es:ser:AUX",1],["lemma:es:venir:VERB",1],["lemma:es:yo:PRON",1]],"phrases":[["phrase:es:creo_que",1]],"patterns":[["pattern:es:subjunctive",1]],"features":{"words":11,"sentences":3,"uniqueForms":10,"meanSentenceWords":3.6667,"longSentenceShare":0,"subordinatorsPerSentence":0.6667,"subjunctiveShare":0.0909,"cliticShare":0,"phraseShare":0.1818,"properNounShare":0.0909,"unanalysedShare":0.0909}},"features":{"words":11,"sentences":3,"uniqueForms":10,"meanSentenceWords":3.6667,"longSentenceShare":0,"subordinatorsPerSentence":0.6667,"subjunctiveShare":0.0909,"cliticShare":0,"phraseShare":0.1818,"properNounShare":0.0909,"unanalysedShare":0.0909}}');
  });

  it('a stated Case that is not genitive adds no key: the features keep exactly their old keys, in their old order', async () => {
    const store = createMemoryStore();
    const text = await buildFixtureText(store, SPANISH_SPEC);
    const f = (await featuresOfStoredText(store, text.id))!;
    expect(f).not.toHaveProperty('genitiveShare');
    expect(Object.keys(f)).toEqual(['words', 'sentences', 'uniqueForms', 'meanSentenceWords', 'longSentenceShare', 'subordinatorsPerSentence', 'subjunctiveShare', 'cliticShare', 'phraseShare', 'properNounShare', 'unanalysedShare']);
  });
});

/**
 * "Die Lebensversicherung wurde vom Staat bezahlt ."  (6 words; a compound with a linking element; a passive, 2 words inside the bracket)
 * "Er hat gestern die Erfahrung gemacht ."            (6 words; a perfect, 3 words inside the bracket; a nominalization)
 * "Er sagt daß es geht ."                             (5 words; an older spelling; a relative clause and a participial modifier)
 */
const GERMAN: FixtureSentence[] = [
  { tokens: [
    { surface: 'Die', lemma: 'die', pos: 'DET', morph: { Case: 'Nom' } },
    { surface: 'Lebensversicherung', lemma: 'Lebensversicherung', pos: 'NOUN' },
    { surface: 'wurde', lemma: 'werden', pos: 'AUX' },
    { surface: 'vom', lemma: 'von', pos: 'ADP' },
    { surface: 'Staat', lemma: 'Staat', pos: 'NOUN', morph: { Case: 'Dat,Gen' } }, // not decided: not counted
    { surface: 'bezahlt', lemma: 'bezahlen', pos: 'VERB' },
    { surface: '.', isWord: false },
  ], patterns: [{ key: 'passive', tokenIndexes: [2, 5] }] },
  { tokens: [
    { surface: 'Er', lemma: 'er', pos: 'PRON' },
    { surface: 'hat', lemma: 'haben', pos: 'AUX' },
    { surface: 'gestern', lemma: 'gestern', pos: 'ADV' },
    { surface: 'die', lemma: 'die', pos: 'DET' },
    { surface: 'Erfahrung', lemma: 'Erfahrung', pos: 'NOUN', morph: { Case: 'Gen' } },
    { surface: 'gemacht', lemma: 'machen', pos: 'VERB' },
    { surface: '.', isWord: false },
  ], patterns: [{ key: 'sentence-bracket-perfect', tokenIndexes: [1, 5] }] },
  { tokens: [
    { surface: 'Er', lemma: 'er', pos: 'PRON' },
    { surface: 'sagt', lemma: 'sagen', pos: 'VERB' },
    { surface: 'daß', lemma: 'dass', pos: 'SCONJ' },
    { surface: 'es', lemma: 'es', pos: 'PRON' },
    { surface: 'geht', lemma: 'gehen', pos: 'VERB' },
    { surface: '.', isWord: false },
  ], patterns: [{ key: 'relative-clause', tokenIndexes: [2, 3] }, { key: 'participial-modifier', tokenIndexes: [3] }] },
];

async function germanStore() {
  const store = createMemoryStore();
  const text = await buildFixtureText(store, { lang: 'de', slug: 'merkmale', sentences: GERMAN });
  const tok = (s: number, t: number) => ids.token(ids.sentence(text.id, s), t);
  await patch(store, tok(0, 1), { parts: [
    { text: 'Leben', start: 0, end: 5, lemma: 'Leben', pos: 'NOUN', kind: 'component' },
    { text: 's', start: 5, end: 6, kind: 'link' },
    { text: 'Versicherung', start: 6, end: 18, lemma: 'Versicherung', pos: 'NOUN', kind: 'head' },
  ] });
  await patch(store, tok(1, 4), { notes: { nominalization: 'erfahren' } });
  await patch(store, tok(2, 2), { orthography: { modern: 'dass', period: 'de-1901', confidence: 0.95 } });
  return { store, text, tok };
}

describe('each new feature, present', () => {
  it('measures them all from the stored rows', async () => {
    const { store, text } = await germanStore();
    const f = (await featuresOfStoredText(store, text.id))!;
    expect(f.words).toBe(17);
    expect(f.compoundShare).toBeCloseTo(1 / 17, 4); // Lebensversicherung
    expect(f.genitiveShare).toBeCloseTo(1 / 17, 4); // Erfahrung (Gen); "Dat,Gen" states uncertainty and is not asserted
    expect(f.historicalSpellingShare).toBeCloseTo(1 / 17, 4); // daß
    expect(f.nominalizationShare).toBeCloseTo(1 / 17, 4); // Erfahrung
    expect(f.passivePerSentence).toBeCloseTo(1 / 3, 4);
    expect(f.relativePerSentence).toBeCloseTo(1 / 3, 4);
    expect(f.participialPerSentence).toBeCloseTo(1 / 3, 4);
    expect(f.bracketDistance).toBe(2.5); // the passive (2 words inside) and the perfect (3 inside); the relative clause and the participle are not brackets
  });

  it('profile.compounds: the whole, its component and head lemmas (a link is no component), and how often it occurs', async () => {
    const { store, text } = await germanStore();
    const p = (await profileOfStoredText(store, text.id))!;
    expect(p.compounds).toEqual([[ids.lemma('de', 'Lebensversicherung', 'NOUN'), [ids.lemma('de', 'Leben', 'NOUN'), ids.lemma('de', 'Versicherung', 'NOUN')], 1]]);
    expect(p.features.compoundShare).toBeCloseTo(1 / 17, 4);
  });

  it('a compound that occurs twice is one entry with its count; one whose parts state no lemma is kept with no components', async () => {
    const { store, text, tok } = await germanStore();
    // the same compound again, in the second sentence (token 3 "die" stands in for a second occurrence)
    const first = (await store.analyses.where('tokenId', tok(0, 1)))[0];
    const again = (await store.analyses.where('tokenId', tok(1, 3)))[0];
    await store.analyses.put({ ...again, lemmaId: first.lemmaId, parts: first.parts });
    const bare = (await store.analyses.where('tokenId', tok(2, 1)))[0];
    await store.analyses.put({ ...bare, parts: [{ text: 'sa', start: 0, end: 2, kind: 'component' }, { text: 'gt', start: 2, end: 4, kind: 'head' }] });
    const p = (await profileOfStoredText(store, text.id))!;
    expect(p.compounds).toEqual([
      [ids.lemma('de', 'Lebensversicherung', 'NOUN'), [ids.lemma('de', 'Leben', 'NOUN'), ids.lemma('de', 'Versicherung', 'NOUN')], 2],
      [ids.lemma('de', 'sagen', 'VERB'), [], 1],
    ]);
  });

  it('every passive key counts as a passive, and a passive is also a bracket; the list of brackets is the agreed one', async () => {
    expect([...BRACKET_PATTERN_KEYS].sort()).toEqual(['future', 'konjunktiv-2-wuerde', 'modal-infinitive', 'passive', 'passive-past', 'pluperfect', 'sentence-bracket-perfect', 'separable-prefix-verb', 'um-zu']);
    const store = createMemoryStore();
    const text = await buildFixtureText(store, { lang: 'de', slug: 'passive', sentences: [
      { tokens: [{ surface: 'a', lemma: 'a' }, { surface: 'b', lemma: 'b' }, { surface: 'c', lemma: 'c' }], patterns: [{ key: 'passive-past', tokenIndexes: [0, 2] }] },
      { tokens: [{ surface: 'd', lemma: 'd' }, { surface: 'e', lemma: 'e' }], patterns: [{ key: 'passive', tokenIndexes: [1, 0] }] }, // the order of the two ends does not matter
    ] });
    const f = (await featuresOfStoredText(store, text.id))!;
    expect(f.passivePerSentence).toBe(1); // 2 passives, 2 sentences
    expect(f.bracketDistance).toBe(0.5); // 1 word inside the first, 0 inside the second
  });

  it('a retired sentence is history: its patterns do not count', async () => {
    const { store, text } = await germanStore();
    const s = (await store.sentences.get(ids.sentence(text.id, 0)))!;
    await store.sentences.put({ ...s, retiredInVersion: 2 });
    const f = (await featuresOfStoredText(store, text.id))!;
    expect(f).not.toHaveProperty('passivePerSentence');
    expect(f).not.toHaveProperty('compoundShare');
    expect(f.bracketDistance).toBe(3);
    expect(f.relativePerSentence).toBeCloseTo(1 / 2, 4);
  });

  it('the new fields do not disturb the old ones', async () => {
    const { store, text } = await germanStore();
    const f = (await featuresOfStoredText(store, text.id))!;
    expect(f.sentences).toBe(3);
    expect(f.uniqueForms).toBe(15); // er twice, die twice (Die / die)
    expect(f.unanalysedShare).toBe(0);
  });
});

describe('each new feature, absent when the rows cannot support it', () => {
  it('a text with nothing of the kind has none of them', async () => {
    const store = createMemoryStore();
    const text = await buildFixtureText(store, { lang: 'de', slug: 'schlicht', sentences: [{ tokens: [
      { surface: 'Er', lemma: 'er', pos: 'PRON' }, { surface: 'geht', lemma: 'gehen', pos: 'VERB' }, { surface: 'heim', lemma: 'heim', pos: 'ADV' },
    ], patterns: [{ key: 'present-tense', tokenIndexes: [1] }] }] });
    const f = (await featuresOfStoredText(store, text.id))!;
    for (const k of ['compoundShare', 'genitiveShare', 'historicalSpellingShare', 'nominalizationShare', 'passivePerSentence', 'relativePerSentence', 'participialPerSentence', 'bracketDistance']) {
      expect(f, k).not.toHaveProperty(k);
    }
    expect((await profileOfStoredText(store, text.id))).not.toHaveProperty('compounds');
  });

  it('the genitive is reported only above zero: a case stated without a genitive says nothing about it', async () => {
    const store = createMemoryStore();
    const text = await buildFixtureText(store, { lang: 'de', slug: 'fall', sentences: [{ tokens: [
      { surface: 'der', lemma: 'der', pos: 'DET', morph: { Case: 'Nom' } }, { surface: 'Hund', lemma: 'Hund', pos: 'NOUN', morph: { Case: 'Nom,Gen' } },
    ] }] });
    expect(await featuresOfStoredText(store, text.id)).not.toHaveProperty('genitiveShare');
  });

  it('parts with no kind (a Spanish verb with attached pronouns) are not a compound', async () => {
    const store = createMemoryStore();
    const text = await buildFixtureText(store, { lang: 'es', slug: 'clitico', sentences: [{ tokens: [{ surface: 'decírselo', lemma: 'decir', pos: 'VERB' }] }] });
    await patch(store, ids.token(ids.sentence(text.id, 0), 0), { parts: [
      { text: 'decir', start: 0, end: 5 }, { text: 'se', start: 5, end: 7, role: 'indirect object pronoun' }, { text: 'lo', start: 7, end: 9, kind: 'clitic' },
    ] });
    const f = (await featuresOfStoredText(store, text.id))!;
    expect(f).not.toHaveProperty('compoundShare');
    expect((await profileOfStoredText(store, text.id))).not.toHaveProperty('compounds');
  });

  it('a note with nothing in it is no nominalization; a bracket construction with one token has no distance', async () => {
    const store = createMemoryStore();
    const text = await buildFixtureText(store, { lang: 'de', slug: 'leer', sentences: [{ tokens: [{ surface: 'hat', lemma: 'haben', pos: 'AUX' }, { surface: 'Dank', lemma: 'Dank', pos: 'NOUN' }], patterns: [{ key: 'future', tokenIndexes: [0] }] }] });
    await patch(store, ids.token(ids.sentence(text.id, 0), 1), { notes: { nominalization: '' } });
    const f = (await featuresOfStoredText(store, text.id))!;
    expect(f).not.toHaveProperty('nominalizationShare');
    expect(f).not.toHaveProperty('bracketDistance');
  });
});
