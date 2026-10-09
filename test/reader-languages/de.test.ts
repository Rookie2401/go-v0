// @vitest-environment node
/**
 * German (experimental pack) through the reader's parser and the analyser's own sentence splitter. Every assertion is what
 * adapter-de@9 really does; where it does not do what a learner would need, the test is an `it.fails` named "LIMIT: ..."
 * with a comment saying what is missing, so the limit is counted and cannot be forgotten.
 */
import { describe, expect, it } from 'vitest';
import { deAdapter } from '../../src/adapters/de';
import { cardOf, wordsOf } from './helpers';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { registerAllAnalysers } from '../support/analysers';

registerAllAnalysers(); // the parser carries Albanian; the other analysers are chunks the content script loads on demand

const ids = (c: ReturnType<typeof cardOf>): string[] => c.constructions.map((k) => k.id);
const feats = (c: ReturnType<typeof cardOf>): Record<string, string> => Object.fromEntries(c.features.map((f) => [f.key, f.value]));

describe('German: compounds are ONE token and their parts are reported', () => {
  it('Wohnzimmer is one word; the card gives its lemma and gloss and names both parts', () => {
    expect(wordsOf(deAdapter, 'Das Wohnzimmer ist groß.')).toEqual(['Das', 'Wohnzimmer', 'ist', 'groß']);
    const c = cardOf('Das «Wohnzimmer» ist groß.', 'de');
    expect(c).toMatchObject({ languageId: 'de', lemma: 'Wohnzimmer', pos: 'NOUN', gloss: 'living room', tokenCount: 1, unconfirmed: false });
    expect(c.syntaxNotes).toEqual(['Wohn: from wohnen, first part (verb stem)', 'zimmer: from Zimmer, head: decides the gender and the kind of thing']);
    expect(feats(c)).toMatchObject({ Gender: 'Neut', Case: 'Nom' });
  });

  it('Bahnhof (Bahn + Hof): the head decides the gender, and the case comes from the article in front', () => {
    const c = cardOf('Der «Bahnhof» ist weit von der Schule.', 'de');
    expect(c).toMatchObject({ lemma: 'Bahnhof', gloss: 'railway station' });
    expect(feats(c)).toMatchObject({ Gender: 'Masc', Case: 'Nom' });
    expect(c.syntaxNotes.join(' ')).toMatch(/hof: from Hof, head/);
  });

  it('a compound the word list does not hold is split into known words, marked UNCONFIRMED, given no gloss and not credited as a lemma', () => {
    const c = cardOf('Sie hat eine «Krankenhausrechnung» bekommen.', 'de');
    expect(wordsOf(deAdapter, 'Sie hat eine Krankenhausrechnung bekommen.')).toContain('Krankenhausrechnung');
    expect(c).toMatchObject({ lemma: 'Krankenhausrechnung', unconfirmed: true, confidence: 0.55, provenance: 'rule' });
    expect(c.gloss).toBeUndefined();
    expect(c.syntaxNotes.join(' ')).toMatch(/Krankenhaus: first part/);
    expect(c.notes.join(' ')).toMatch(/Not in the word list/);
    expect(c.itemIds).toEqual(['form:de:krankenhausrechnung']);
  });
});

describe('German: separable verbs span the sentence', () => {
  it('Er steht früh «auf»: the stranded prefix is read as part of aufstehen, not as the preposition auf', () => {
    const c = cardOf('Er steht früh «auf».', 'de');
    expect(c.lemma).toBe('aufstehen');
    expect(c.gloss).toBe('to get up; to stand up');
    expect(c.gloss).not.toMatch(/on; onto/);
    expect(ids(c)).toContain('separable-prefix-verb');
    expect(c.syntaxNotes).toContain('Part of the unit “aufstehen” (separable prefix).');
    expect(c.itemIds).not.toContain('lemma:de:auf:ADP');
  });

  it('the finite verb steht carries the same unit from the other side (head)', () => {
    const c = cardOf('Er «steht» früh auf.', 'de');
    expect(c).toMatchObject({ lemma: 'aufstehen', pos: 'VERB' });
    expect(feats(c)).toMatchObject({ Person: '3', Number: 'Sing', Tense: 'Pres', VerbForm: 'Fin' });
    expect(c.syntaxNotes).toContain('Part of the unit “aufstehen” (head).');
  });

  it('a prefix verb with a pronoun and an adverb in between: rufe … an is anrufen', () => {
    const c = cardOf('Ich rufe dich morgen «an».', 'de');
    expect(c).toMatchObject({ lemma: 'anrufen', gloss: 'to call; to telephone' });
    expect(ids(c)).toContain('separable-prefix-verb');
  });

  it('the same word in its other job stays a preposition: auf dem Stuhl is the preposition auf, with no separable construction', () => {
    const c = cardOf('Er sitzt «auf» dem Stuhl.', 'de');
    expect(c).toMatchObject({ lemma: 'auf', pos: 'ADP', provenance: 'lexicon' });
    expect(ids(c)).not.toContain('separable-prefix-verb');
    expect(ids(c)).toContain('two-way-preposition');
  });

  it('a verb the list holds as separable is recognised beyond the examples: macht … zu is zumachen', () => {
    expect(cardOf('Sie macht die Tür «zu».', 'de').lemma).toBe('zumachen');
  });

  // LIMIT: the card still carries the part of speech of the stranded prefix, ADP (the Universal Dependencies tag of a
  // separable particle), which a learner reads as "preposition"; the parser does not relabel it, and the unit note is the
  // only place that says "separable prefix".
  it.fails('LIMIT: the card for the stranded prefix does not label it ADP', () => {
    expect(cardOf('Er steht früh «auf».', 'de').pos).not.toBe('ADP');
  });
});

describe('German: case, gender and agreement', () => {
  it('the article decides the case it can: dem is dative, den is accusative, both masculine singular, from the word list', () => {
    const dem = cardOf('Die Frau gibt «dem» Mann das Buch.', 'de');
    expect(dem).toMatchObject({ lemma: 'der', pos: 'DET', provenance: 'lexicon', morphology: 'definite article, masculine dative singular' });
    expect(feats(dem)).toMatchObject({ Case: 'Dat', Gender: 'Masc', Number: 'Sing' });
    const den = cardOf('Ich sehe «den» Mann.', 'de');
    expect(feats(den)).toMatchObject({ Case: 'Acc', Gender: 'Masc' });
  });

  it('the noun takes the case of the article in front: Mann after dem is dative, Hund after den is accusative', () => {
    expect(feats(cardOf('Die Frau gibt dem «Mann» das Buch.', 'de'))).toMatchObject({ Case: 'Dat', Gender: 'Masc' });
    expect(feats(cardOf('Er sieht den «Hund».', 'de'))).toMatchObject({ Case: 'Acc', Gender: 'Masc' });
  });

  it('the two-way preposition decides: in die Stadt is accusative (movement), in der Stadt is dative (place)', () => {
    const acc = cardOf('Wir gehen in die «Stadt».', 'de');
    expect(feats(acc)).toMatchObject({ Case: 'Acc', Gender: 'Fem' });
    const dieAcc = cardOf('Wir gehen in «die» Stadt.', 'de');
    expect(ids(dieAcc)).toContain('two-way-preposition');
    expect(feats(dieAcc).Case).toBe('Acc');
    const derDat = cardOf('Wir sind in «der» Stadt.', 'de');
    expect(feats(derDat).Case).toBe('Dat');
  });

  it('what a neighbour does not decide stays a UNION, never a guess: Buch and Haus are nominative OR accusative', () => {
    expect(feats(cardOf('Ich habe ein «Haus».', 'de')).Case).toBe('Nom,Acc');
    expect(cardOf('Ich lese das «Buch».', 'de').morphology).toBe('neuter nominative or accusative singular');
  });

  it('contractions are taken apart: im = in + dem', () => {
    const c = cardOf('Die Kinder spielen «im» Garten.', 'de');
    expect(c).toMatchObject({ lemma: 'in', pos: 'ADP', gloss: 'in the' });
    expect(c.syntaxNotes).toEqual(['in: ADP', 'dem: from der, DET']);
  });

  it('a participle in the sentence bracket is tied to its auxiliary', () => {
    const c = cardOf('Ich habe das Buch «gelesen».', 'de');
    expect(c).toMatchObject({ lemma: 'lesen', morphology: 'past participle' });
    expect(ids(c)).toContain('sentence-bracket-perfect');
  });

  it('ß and umlauts are kept: Straße, Mädchen', () => {
    expect(cardOf('Die «Straße» ist groß.', 'de')).toMatchObject({ surface: 'Straße', lemma: 'Straße', gloss: 'street; road' });
    const m = parseSelection({ surface: 'Mädchen', languageId: 'de', context: { kind: 'none', confidence: 0 } });
    expect(m.surface).toBe('Mädchen');
    expect(m.lemma).toBe('Mädchen');
  });

  // LIMIT: the analyser has no parser. In "Die Frau sieht die Tochter" nothing in the sentence marks which noun is the
  // subject (word order is not used), so BOTH nouns stay nominative-or-accusative; a learner asking "who sees whom?" is not
  // answered.
  it.fails('LIMIT: in Die Frau sieht die Tochter the subject Frau is read as nominative', () => {
    expect(feats(cardOf('Die «Frau» sieht die Tochter.', 'de')).Case).toBe('Nom');
  });

  // LIMIT: Mädchen is neuter singular here, but the analyser also keeps a plural reading (0.4) beside it, because the
  // singular verb trinkt is not used to narrow the noun's number.
  it.fails('LIMIT: Mädchen before the singular verb trinkt has a single reading', () => {
    expect(cardOf('Das «Mädchen» trinkt Milch.', 'de').alternatives).toHaveLength(0);
  });
});

describe('German: sentence segmentation (adapter.segmentSentences)', () => {
  it('an ordinal dot (3. Mai) does not end a sentence; real full stops do', () => {
    const parts = deAdapter.segmentSentences('Am 3. Mai kam er an. Er blieb zwei Tage.').map((s) => s.text.trim());
    expect(parts).toEqual(['Am 3. Mai kam er an.', 'Er blieb zwei Tage.']);
  });

  it('a listed abbreviation (z. B.) stays inside its sentence', () => {
    expect(deAdapter.segmentSentences('Er mag Obst, z. B. Äpfel. Sie mag Brot.').map((s) => s.text.trim())).toEqual(['Er mag Obst, z. B. Äpfel.', 'Sie mag Brot.']);
  });

  it('every span is an exact slice of the text', () => {
    const text = 'Ich lese.  Du schreibst!\nWir singen?';
    for (const s of deAdapter.segmentSentences(text)) expect(text.slice(s.start, s.end)).toBe(s.text);
  });
});
