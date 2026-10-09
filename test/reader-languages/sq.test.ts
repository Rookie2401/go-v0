// @vitest-environment node
/**
 * Albanian through the reader's parser and the analyser's own sentence splitter. Every assertion is what adapter-sq@9 really
 * does; where it does not do what a learner would need, the test is an `it.fails` named "LIMIT: ..." with a comment saying
 * what is missing, so the limit is counted and cannot be forgotten (and the test turns red the day the analyser improves).
 */
import { describe, expect, it } from 'vitest';
import { sqAdapter } from '../../src/adapters/sq';
import { cardOf, mark, wordsOf } from './helpers';
import { parseSelection } from '../../packages/golearn-extension/src/parser';

const ids = (c: ReturnType<typeof cardOf>): string[] => c.constructions.map((k) => k.id);
const feats = (c: ReturnType<typeof cardOf>): Record<string, string> => Object.fromEntries(c.features.map((f) => [f.key, f.value]));

describe('Albanian: definite nouns carry "the" in their ending', () => {
  it('librin = the book, definite accusative singular, with the pack construction that explains the ending', () => {
    const c = cardOf('Fëmijët lexojnë «librin».', 'sq');
    expect(c).toMatchObject({ languageId: 'sq', lemma: 'libër', pos: 'NOUN', gloss: 'book', morphology: 'definite masculine accusative singular' });
    expect(feats(c)).toMatchObject({ Case: 'Acc', Definite: 'Def', Number: 'Sing', Gender: 'Masc' });
    expect(ids(c)).toEqual(expect.arrayContaining(['definite-noun-ending', 'definite-accusative-singular']));
    expect(c.itemIds).toContain('lemma:sq:libër:NOUN');
  });

  it('Libri = the book as the subject: definite nominative singular, and the other reading is kept, not hidden', () => {
    const c = cardOf('«Libri» është mbi tavolinë.', 'sq');
    expect(c).toMatchObject({ lemma: 'libër', morphology: 'definite masculine nominative singular' });
    expect(ids(c)).toContain('definite-nominative-singular');
    expect(c.alternatives.length).toBeGreaterThanOrEqual(1);
    expect(c.notes.join(' ')).toMatch(/other form reading possible/);
  });

  it('Fëmijët = the children: definite plural, nominative or accusative (the case stays a union)', () => {
    const c = cardOf('«Fëmijët» lexojnë librin.', 'sq');
    expect(c).toMatchObject({ lemma: 'fëmijë', pos: 'NOUN', gloss: 'child' });
    expect(feats(c)).toMatchObject({ Number: 'Plur', Definite: 'Def', Case: 'Nom,Acc' });
    expect(ids(c)).toContain('definite-plural');
  });
});

describe('Albanian: case is read from the ending and from what the neighbours decide', () => {
  it('a genitive: llambës after the linking article e (the pattern covers the selected word)', () => {
    const c = cardOf('Zhurma e «llambës» ishte e madhe.', 'sq');
    expect(c).toMatchObject({ lemma: 'llambë', morphology: 'definite feminine genitive singular' });
    expect(feats(c)).toMatchObject({ Case: 'Gen', Definite: 'Def' });
    expect(ids(c)).toContain('genitive-linking-article');
  });

  it('an accusative indefinite after në: shkollë is read as accusative, high-confidence, from the word list', () => {
    const c = cardOf('Ana shkon në «shkollë».', 'sq');
    expect(c).toMatchObject({ lemma: 'shkollë', pos: 'NOUN', provenance: 'lexicon', morphology: 'indefinite feminine accusative singular' });
    expect(feats(c)).toMatchObject({ Case: 'Acc', Definite: 'Ind' });
    expect(c.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('the linking article with an adjective: e bukur is one unit, and the card says so', () => {
    const c = cardOf('Shkolla është «e» bukur.', 'sq');
    expect(c.lemma).toBe('i bukur');
    expect(c.syntaxNotes.join(' ')).toMatch(/Part of the unit “i bukur”/);
    expect(ids(c)).toContain('linking-article-adjective');
  });
});

describe('Albanian: digraphs and ë / ç never split a word', () => {
  const DIGRAPHS = 'dhëmb gjuhë llambë njeri rrugë shkollë thotë xhaketë zhurmë';

  it('the tokenizer keeps dh gj ll nj rr sh th xh zh inside nine whole words', () => {
    expect(wordsOf(sqAdapter, DIGRAPHS)).toEqual(DIGRAPHS.split(' '));
  });

  it.each([
    ['dhëmb', 'dhëmb'], ['gjuhë', 'gjuhë'], ['llambë', 'llambë'], ['njeri', 'njeri'], ['rrugë', 'rrugë'], ['shkollë', 'shkollë'], ['xhaketë', 'xhaketë'], ['zhurmë', 'zhurmë'],
  ])('%s is looked up as the whole word and found in the word list', (surface, lemma) => {
    const c = cardOf(`Ky është një fjalor: «${surface}», dhe tjetri.`, 'sq');
    expect(c.surface).toBe(surface);
    expect(c.tokenCount).toBe(1);
    expect(c.lemma).toBe(lemma);
    expect(c.provenance).toBe('lexicon');
  });

  it('thotë (th) is read as a form of the verb them, from the rules', () => {
    const c = cardOf('Ai «thotë» një fjalë të bukur.', 'sq');
    expect(c).toMatchObject({ lemma: 'them', pos: 'VERB', gloss: 'to say', provenance: 'rule' });
  });

  it('selecting only the digraph "sh" inside shkollë reads the whole word and says the selection was part of it', () => {
    const c = cardOf('Ana shkon në «sh»kollë.', 'sq');
    expect(c.surface).toBe('sh');
    expect(c.lemma).toBe('shkollë');
    expect(c.notes.join(' ')).toMatch(/The selection is part of the word "shkollë"/);
  });

  it('a decomposed ë (e + combining diaeresis) is composed before the lookup and gives the same card', () => {
    const composed = cardOf('Ana shkon në «shkollë».', 'sq');
    const decomposed = parseSelection({ surface: 'shkollë', languageId: 'sq', context: { kind: 'none', confidence: 0 } });
    expect(decomposed.surface).toBe('shkollë');
    expect(decomposed.lemma).toBe(composed.lemma);
  });

  it('an apostrophe form (s’jam) is one token', () => {
    expect(wordsOf(sqAdapter, 'Unë s\'jam këtu.')).toEqual(['Unë', 's\'jam', 'këtu']);
  });
});

describe('Albanian: clitics (e, i, u, ma, ia …)', () => {
  it('ma is taken apart into m (to me) + a (it), and the card names both parts', () => {
    const c = cardOf('Nëna «ma» dha librin.', 'sq');
    expect(c).toMatchObject({ lemma: 'unë', pos: 'PRON' });
    expect(c.syntaxNotes).toEqual(['m: from unë, to me (indirect object pronoun)', 'a: from ai, it / him / her (direct object pronoun)']);
    expect(ids(c)).toEqual(expect.arrayContaining(['clitic-cluster', 'clitic-doubling']));
  });

  it('ia is taken apart into i (to him / her) + a (it)', () => {
    const c = cardOf('Unë «ia» dhashë librin.', 'sq');
    expect(c.lemma).toBe('ai');
    expect(c.syntaxNotes.join(' ')).toMatch(/i: from ai, to him \/ to her/);
    expect(c.syntaxNotes.join(' ')).toMatch(/a: from ai, it \/ him \/ her/);
  });

  it('e before a verb is read as the object pronoun but the determiner and the conjunction readings are kept (never presented as certain)', () => {
    const c = cardOf('Unë «e» lexoj librin.', 'sq');
    expect(c).toMatchObject({ lemma: 'ai', pos: 'PRON' });
    expect(feats(c)).toMatchObject({ Clitic: 'Yes', Case: 'Acc' });
    expect(c.alternatives.map((a) => a.pos).sort()).toEqual(['CONJ', 'DET']);
    expect(c.confidence).toBeLessThan(0.85);
    expect(ids(c)).toContain('object-pronoun-before-verb');
  });

  it('u before a verb is the non-active particle, with its construction', () => {
    const c = cardOf('Ata «u» larguan.', 'sq');
    expect(c).toMatchObject({ lemma: 'u', pos: 'PART', gloss: 'non-active particle' });
    expect(ids(c)).toContain('non-active-u');
  });

  it('i keeps every reading (clitic dative, clitic accusative plural, article): the reading shown is the highest, the rest are listed', () => {
    const c = cardOf('Ai «i» dha librin.', 'sq');
    expect(c.alternatives.length).toBe(2);
    expect(c.notes.join(' ')).toMatch(/2 other readings possible/);
  });
});

describe('Albanian: sentence segmentation (adapter.segmentSentences)', () => {
  it('splits on full stops and keeps a listed abbreviation (p.e.) inside its sentence', () => {
    expect(sqAdapter.segmentSentences('Ana lexon. Luan pi çaj. Nëna shkon në shkollë.').map((s) => s.text.trim())).toEqual(['Ana lexon.', 'Luan pi çaj.', 'Nëna shkon në shkollë.']);
    expect(sqAdapter.segmentSentences('Ai ka tre libra, p.e. një dhe dy. Pastaj shkon.').map((s) => s.text.trim())).toEqual(['Ai ka tre libra, p.e. një dhe dy.', 'Pastaj shkon.']);
  });

  it('every span is an exact slice of the text', () => {
    const text = 'Ana lexon.  Luan pi çaj!\nNëna shkon?';
    for (const s of sqAdapter.segmentSentences(text)) expect(text.slice(s.start, s.end)).toBe(s.text);
  });
});

describe('Albanian: what the analyser does not do (LIMITs, counted)', () => {
  // LIMIT: the word list has no Albanian adjective in the feminine definite form shqipe ("gjuha shqipe"), and the rules do not
  // guess adjectives from their ending, so a learner selecting it gets "unknown to this pack".
  it.fails('LIMIT: shqipe (gjuha shqipe) gets a reading', () => {
    const c = cardOf('Gjuha «shqipe» është e bukur.', 'sq');
    expect(c.lemma).toBeDefined();
  });

  // LIMIT: "Nëna pi çajin" has a singular verb, but the analyser keeps the plural indefinite reading of nëna beside the
  // definite singular one (both 0.85): agreement between subject and verb does not narrow it.
  it.fails('LIMIT: Nëna is resolved to the singular by the singular verb pi', () => {
    const c = cardOf('«Nëna» pi çajin.', 'sq');
    expect(c.alternatives).toHaveLength(0);
  });

  // LIMIT: dhe is the conjunction "and" in practice, but the verb reading (a form of jap) ties with it at 0.6, so the card
  // shows the conjunction with the verb as an equal alternative.
  it.fails('LIMIT: dhe between two clauses is only the conjunction', () => {
    const c = cardOf('Ana shkon në shkollë «dhe» ha çaj.', 'sq');
    expect(c.alternatives).toHaveLength(0);
  });

  it('what the analyser DOES say about those words is stated, not hidden: the competing readings are on the card', () => {
    expect(cardOf('«Nëna» pi çajin.', 'sq').alternatives.length).toBeGreaterThan(0);
    expect(cardOf('Ana shkon në shkollë «dhe» ha çaj.', 'sq').alternatives.map((a) => a.pos)).toContain('VERB');
    expect(cardOf('Gjuha «shqipe» është e bukur.', 'sq').notes.join(' ')).toMatch(/unknown to this pack/);
  });

  it('the markers are consistent (the helper finds the selection where the sentence says)', () => {
    const m = mark('Ana shkon në «shkollë».');
    expect(m.sentence.slice(m.start, m.end)).toBe('shkollë');
  });
});
