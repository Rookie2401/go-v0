/**
 * Deck-gate follow-up (part 2): readings the German analyser gave with confidence and that were wrong for the sentence.
 * Written from the grammar of German, not from the output: each rule has the audit's shape, other sentences of the shape that
 * are not from the audit, and a counter-example the rule must leave alone. The sentences are the coordinator's (an AI model,
 * not a native speaker): a native speaker should check them.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate } from '../../src/core';
import { deAdapter as de } from '../../src/adapters/de';

const read = (text: string, surface: string, nth = 0): AnalysisCandidate[] => {
  const tokens = de.tokenize(text);
  const analysed = de.analyze(tokens);
  let seen = 0;
  for (let i = 0; i < tokens.length; i++) if (tokens[i].surface === surface && seen++ === nth) return analysed[i].candidates;
  throw new Error(`no "${surface}" in "${text}"`);
};
const best = (text: string, surface: string, nth = 0): AnalysisCandidate => read(text, surface, nth)[0];
const id = (c: AnalysisCandidate): string => `${c.lemma}/${c.pos}`;
/** The headwords within 0.15 of the best reading (what the review gate calls rivals), by lemma and class. */
const level = (text: string, surface: string): string[] => {
  const cs = read(text, surface);
  return [...new Set(cs.filter((c) => !c.unconfirmed && c.confidence >= cs[0].confidence - 0.15).map(id))];
};

describe('a separable verb whose prefix ends the clause, when the word list has the verb', () => {
  it.each([
    ['Der Zug fährt um acht Uhr ab.', 'fährt', 'abfahren'],
    ['Wann geht der Bus ab?', 'geht', 'abgehen'],
    ['Die Ministerin kündigte eine Reform an.', 'kündigte', 'ankündigen'],
    ['Die Polizei teilte das Ergebnis mit.', 'teilte', 'mitteilen'],
  ])('%s: %s is %s, and its prefix is not the preposition', (text, form, lemma) => {
    expect(best(text, form).lemma).toBe(lemma);
    const prefix = text.split(/\s+/).pop()!.replace(/[.?!]/g, '');
    expect(best(text, prefix).lemma).toBe(lemma);
  });
  it('a verb with no prefix at the end of its clause is left alone', () => {
    expect(id(best('Er kündigte seine Wohnung.', 'kündigte'))).toBe('kündigen/VERB');
    expect(id(best('Sie teilte den Kuchen mit ihrer Schwester.', 'teilte'))).toBe('teilen/VERB');
  });
});

describe('a noun the word list lacked', () => {
  it('Verfahren is the noun after an article, and is a listed word', () => {
    const c = best('Das Verfahren dauert lange.', 'Verfahren');
    expect(id(c)).toBe('Verfahren/NOUN');
    expect(c.unconfirmed).toBeFalsy();
  });
  it('link is the adjective in a phrase with its noun', () => {
    for (const text of ['Das Rathaus steht auf der linken Seite.', 'Er hat sich den linken Arm gebrochen.', 'Die linke Hand tut weh.']) {
      const surface = text.match(/\b(linke[nr]?)\b/)![1];
      const c = best(text, surface);
      expect(id(c), text).toBe('link/ADJ');
      expect(c.unconfirmed, text).toBeFalsy();
    }
  });
});

describe('bitte and the other function words that are also a verb form', () => {
  it.each([
    ['Das macht vier Euro, bitte schön.', 'bitte'],
    ['Bitte setzen Sie sich.', 'Bitte'],
    ['Das macht zwei Euro, bitte sehr.', 'bitte'],
  ])('%s: bitte is the word "please" (interjection or adverb: one word), never the verb bitten', (text, surface) => {
    expect(best(text, surface).lemma).toBe('bitte');
    expect(level(text, surface).every((x) => x.startsWith('bitte/'))).toBe(true);
  });
  it('mehr and gleich keep the readings they had (no new rival is made the winner)', () => {
    expect(id(best('Mehr Licht!', 'Mehr'))).toBe('mehr/ADV');
    expect(level('Sie sind frei und gleich an Würde geboren.', 'gleich')).not.toContain('gleichen/VERB');
  });
  it('the verb stays where a pronoun is its object', () => {
    expect(id(best('Ich bitte dich um Hilfe.', 'bitte'))).toBe('bitten/VERB');
    expect(id(best('Bitte mich nicht darum!', 'Bitte'))).toBe('bitten/VERB');
  });
});

describe('lieber before a bare noun', () => {
  it.each([
    ['Kaffee oder lieber Tee?', 'lieber'],
    ['Ich nehme Brot und lieber Käse.', 'lieber'],
  ])('%s: the sentence does not say, so "rather" and "dear" are level and neither is alone a reading', (text, surface) => {
    expect(level(text, surface)).toEqual(expect.arrayContaining(['lieber/ADV', 'lieb/ADJ']));
  });
  it.each([
    ['Ich trinke lieber Tee als Kaffee.', 'lieber'],
    ['Wir essen lieber Brot.', 'lieber'],
  ])('%s: after a verb it is the adverb alone', (text, surface) => {
    expect(id(best(text, surface))).toBe('lieber/ADV');
    expect(level(text, surface)).toEqual(['lieber/ADV']);
  });
  it('after a determiner, and as the salutation, it is the adjective', () => {
    expect(id(best('Mein lieber Freund, komm bald.', 'lieber'))).toBe('lieb/ADJ');
    expect(id(best('Lieber Paul, vielen Dank.', 'Lieber'))).toBe('lieb/ADJ');
    expect(level('Mein lieber Freund, komm bald.', 'lieber')).toEqual(['lieb/ADJ']);
  });
});

describe('what was already right stays right', () => {
  it('Dank is the noun, Morgen after heute is the noun, dank before a genitive is the preposition', () => {
    expect(id(best('Vielen Dank für Ihre Hilfe!', 'Dank'))).toBe('Dank/NOUN');
    expect(id(best('Der Unfall geschah heute Morgen kurz nach acht Uhr.', 'Morgen'))).toBe('Morgen/NOUN');
    expect(id(best('Gestern Morgen habe ich früh gefrühstückt.', 'Morgen'))).toBe('Morgen/NOUN');
    expect(id(best('Ich komme morgen nach Hause.', 'morgen'))).toBe('morgen/ADV');
  });
  it('the separated prefix of anziehen and anrufen is not the preposition an', () => {
    expect(id(best('Nach dem Frühstück zog ich meine Stiefel an.', 'zog'))).toBe('anziehen/VERB');
    expect(id(best('Gestern rief mich meine Tante an.', 'rief'))).toBe('anrufen/VERB');
    expect(id(best('Ich zog an dem Seil.', 'zog'))).toBe('ziehen/VERB');
  });
});
