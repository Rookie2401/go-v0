// @vitest-environment node
/**
 * Hindi (experimental pack) through the reader's parser and the analyser's own sentence splitter. Every assertion is what
 * adapter-hi@6 really does; where it does not do what a learner would need, the test is an `it.fails` named "LIMIT: ..."
 * with a comment saying what is missing, so the limit is counted and cannot be forgotten. Selection snapping to grapheme
 * clusters belongs to the page adapters; here the tokens and the cards must keep every matra, nukta and virama.
 */
import { describe, expect, it } from 'vitest';
import { hiAdapter } from '../../src/adapters/hi';
import { cardOf, graphemeEdges, wordsOf } from './helpers';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { registerAllAnalysers } from '../support/analysers';

registerAllAnalysers(); // the parser carries Albanian; the other analysers are chunks the content script loads on demand

const ids = (c: ReturnType<typeof cardOf>): string[] => c.constructions.map((k) => k.id);
const feats = (c: ReturnType<typeof cardOf>): Record<string, string> => Object.fromEntries(c.features.map((f) => [f.key, f.value]));

describe('Hindi: grapheme clusters are never split', () => {
  const TEXT = 'विद्यार्थी पढ़ता हूँ मेज़ पर किताब। क्षमा श्री कृपया';

  it('every token starts and ends on a grapheme boundary (conjuncts with virama, nukta, chandrabindu, matras)', () => {
    const edges = graphemeEdges(TEXT);
    const toks = hiAdapter.tokenize(TEXT).filter((t) => t.isWord);
    expect(toks.map((t) => t.surface)).toEqual(['विद्यार्थी', 'पढ़ता', 'हूँ', 'मेज़', 'पर', 'किताब', 'क्षमा', 'श्री', 'कृपया']);
    for (const t of toks) {
      expect(edges.has(t.start), `start of ${t.surface}`).toBe(true);
      expect(edges.has(t.end), `end of ${t.surface}`).toBe(true);
      expect(TEXT.slice(t.start, t.end)).toBe(t.surface);
    }
  });

  it('a token keeps its virama (विद्यार्थी), nukta (पढ़ता, मेज़), chandrabindu (हूँ) and vowel signs', () => {
    const c = cardOf('«विद्यार्थी» स्कूल जाते हैं।', 'hi');
    expect(c.surface).toBe('विद्यार्थी');
    expect(c).toMatchObject({ lemma: 'विद्यार्थी', pos: 'NOUN', gloss: 'student' });
    expect(cardOf('मैं हर दिन किताब «पढ़ता» हूँ।', 'hi').surface).toBe('पढ़ता');
    expect(cardOf('मैं हर दिन किताब पढ़ता «हूँ»।', 'hi').surface).toBe('हूँ');
    expect(cardOf('«मेज़» पर एक किताब है।', 'hi').lemma).toBe('मेज़');
  });

  it('a nukta typed as the precomposed letter U+095D or as dha + nukta (U+0922 U+093C) gives the same card (NFC)', () => {
    const decomposed = parseSelection({ surface: 'पढ़ता', languageId: 'hi', context: { kind: 'none', confidence: 0 } });
    const precomposed = parseSelection({ surface: 'पढ़ता', languageId: 'hi', context: { kind: 'none', confidence: 0 } });
    expect(precomposed.surface).toBe(decomposed.surface);
    expect(precomposed.surface).toBe('पढ़ता');
    expect(decomposed.lemma).toBe('पढ़ना');
    expect(precomposed.lemma).toBe(decomposed.lemma);
  });

  it('selecting half a word (the first letters of किताब) reads the whole word and says so', () => {
    const c = cardOf('मैं हर दिन «कि»ताब पढ़ता हूँ।', 'hi');
    expect(c.lemma).toBe('किताब');
    expect(c.notes.join(' ')).toMatch(/The selection is part of the word "किताब"/);
  });

  it('the pronunciation note explains the unwritten a (schwa deletion), which the script hides', () => {
    expect(cardOf('मैं हर दिन किताब «पढ़ता» हूँ।', 'hi').pronunciation.join(' ')).toMatch(/schwa deletion/);
  });

  it('a Latin selection read as Hindi says it is not in Devanagari script', () => {
    const c = parseSelection({ surface: 'kitab', languageId: 'hi', context: { kind: 'none', confidence: 0 } });
    expect(c.notes.join(' ')).toMatch(/not in Devanagari script: the Hindi word list does not apply/);
  });
});

describe('Hindi: postpositions follow the noun', () => {
  it('में (in) is a postposition after घर, and the card names the construction', () => {
    const c = cardOf('यह लड़का घर «में» है।', 'hi');
    expect(c).toMatchObject({ lemma: 'में', pos: 'ADP', gloss: 'in, inside; among', provenance: 'lexicon' });
    expect(ids(c)).toContain('postposition-after-noun');
  });

  it('the noun in front of a postposition is flagged: घर is covered by the same construction', () => {
    const c = cardOf('यह लड़का «घर» में है।', 'hi');
    expect(c).toMatchObject({ lemma: 'घर', pos: 'NOUN' });
    expect(ids(c)).toContain('postposition-after-noun');
  });

  it('ने marks the doer of a perfective verb: Case=Erg, with the ergative construction', () => {
    const c = cardOf('लड़की «ने» रोटी खाई।', 'hi');
    expect(c).toMatchObject({ lemma: 'ने', pos: 'ADP', morphology: 'ergative (ने)' });
    expect(feats(c)).toMatchObject({ Case: 'Erg' });
    expect(ids(c)).toEqual(expect.arrayContaining(['ergative-ne', 'postposition-after-noun']));
  });

  it('a noun before a postposition takes the oblique form: लड़कों is the oblique plural of लड़का (a rule reading, not a word-list hit)', () => {
    const c = cardOf('«लड़कों» ने खेल खेला।', 'hi');
    expect(c).toMatchObject({ lemma: 'लड़का', provenance: 'rule', morphology: 'masculine, oblique plural' });
    expect(feats(c)).toMatchObject({ Case: 'Obl', Number: 'Plur', Gender: 'Masc' });
    expect(ids(c)).toContain('oblique-before-postposition');
  });

  it('a compound postposition is a phrase frame: के साथ ("with")', () => {
    const c = cardOf('मैं आपके «साथ» जा रहा हूँ।', 'hi');
    expect(c).toMatchObject({ lemma: 'साथ', pos: 'ADP' });
    expect(c.phrases).toEqual([expect.objectContaining({ display: 'के साथ', kind: 'frame' })]);
  });

  it('the possessive agrees with the thing possessed: उसकी before the feminine बहन', () => {
    const c = cardOf('«उसकी» बहन बहुत सुंदर है।', 'hi');
    expect(c).toMatchObject({ lemma: 'उसका', pos: 'DET' });
    expect(ids(c)).toContain('genitive-agreement');
    expect(c.syntaxNotes.join(' ')).toMatch(/उस: from वह, oblique stem/);
  });
});

describe('Hindi: compound verbs and verb groups', () => {
  it('खा लिया: the pair is a phrase unit (खा लेना), and the card for the light verb names the compound-verb construction', () => {
    const c = cardOf('उसने खाना खा «लिया»।', 'hi');
    expect(c).toMatchObject({ lemma: 'लेना', pos: 'VERB' });
    expect(ids(c)).toEqual(expect.arrayContaining(['compound-verb', 'perfective-past']));
    expect(c.phrases.map((p) => p.display)).toContain('खा लेना');
  });

  it('selecting both words of the compound verb takes the phrase entry as the card', () => {
    const c = cardOf('उसने खाना «खा लिया»।', 'hi');
    expect(c).toMatchObject({ lemma: 'खा लेना', tokenCount: 2, provenance: 'lexicon' });
    expect(c.notes.join(' ')).toMatch(/Matches the phrase entry "खा लेना" \(construction\)/);
  });

  it('the first verb of the pair is the stem खा (खाना, "to eat") when it is selected by its offsets', () => {
    const c = cardOf('उसने खाना «खा» लिया।', 'hi');
    expect(c).toMatchObject({ lemma: 'खाना', pos: 'VERB' });
    expect(c.morphology).toMatch(/stem/);
  });

  it('the habitual present: पढ़ता हूँ is an imperfective participle plus the present of होना', () => {
    const p = cardOf('मैं हर दिन किताब «पढ़ता» हूँ।', 'hi');
    expect(p).toMatchObject({ lemma: 'पढ़ना', morphology: 'masculine singular, imperfective participle' });
    expect(ids(p)).toContain('habitual-present');
    expect(cardOf('मैं हर दिन किताब पढ़ता «हूँ»।', 'hi')).toMatchObject({ lemma: 'होना', pos: 'AUX' });
  });

  it('the progressive: जा रहा हूँ is an auxiliary chain', () => {
    expect(ids(cardOf('मैं आपके साथ «जा» रहा हूँ।', 'hi'))).toEqual(expect.arrayContaining(['auxiliary-chain', 'progressive']));
  });
});

describe('Hindi: sentence segmentation (adapter.segmentSentences)', () => {
  it('the danda (।) ends a sentence', () => {
    expect(hiAdapter.segmentSentences('मैं घर में हूँ। वह स्कूल जाता है।').map((s) => s.text.trim())).toEqual(['मैं घर में हूँ।', 'वह स्कूल जाता है।']);
  });

  it('a question mark and an exclamation mark end one too, and every span is an exact slice', () => {
    const text = 'तुम कहाँ हो? मैं यहाँ हूँ! ठीक है।';
    const spans = hiAdapter.segmentSentences(text);
    expect(spans).toHaveLength(3);
    for (const s of spans) expect(text.slice(s.start, s.end)).toBe(s.text);
  });
});

describe('Hindi: what the analyser does not decide (LIMITs, counted)', () => {
  // LIMIT: पर is "on" (a postposition) after a noun and "but" between clauses; in "मेज़ पर एक किताब है" the construction
  // postposition-after-noun covers it, yet the reading is a 0.55 ADP with a CONJ alternative: the construction is detected but
  // not used to settle the part of speech.
  it.fails('LIMIT: पर after मेज़ is settled as the postposition', () => {
    const c = cardOf('मेज़ «पर» एक किताब है।', 'hi');
    expect(c.alternatives).toHaveLength(0);
  });

  // LIMIT: गया is the perfective of जाना ("went") and also a city name (Gaya); even after the verb चला in "वह घर चला गया" the
  // two readings stay close (0.6 against 0.55).
  it.fails('LIMIT: गया after चला is settled as the verb जाना', () => {
    const c = cardOf('वह घर चला «गया»।', 'hi');
    expect(c.alternatives).toHaveLength(0);
  });

  // LIMIT: सुंदर has six readings (an adjective, and nouns/forms the rules also offer) and none is chosen by the
  // neighbours; a learner sees the highest and a note that others are possible.
  it.fails('LIMIT: सुंदर has a single reading', () => {
    expect(cardOf('उसकी बहन बहुत «सुंदर» है।', 'hi').alternatives).toHaveLength(0);
  });

  it('what the analyser does say about those words is on the card: the competing readings are listed', () => {
    expect(cardOf('मेज़ «पर» एक किताब है।', 'hi').alternatives.map((a) => a.pos)).toContain('CONJ');
    expect(cardOf('वह घर चला «गया»।', 'hi').alternatives.map((a) => a.pos)).toContain('PROPN');
    expect(cardOf('«विद्यार्थी» स्कूल जाते हैं।', 'hi').alternatives.map((a) => a.pos)).toContain('NOUN');
  });

  it('every Hindi card carries the experimental pack’s limits', () => {
    expect(cardOf('मैं हर दिन «किताब» पढ़ता हूँ।', 'hi').limits.join(' ')).toMatch(/The Hindi pack is experimental: lemmatisation is seed-only/);
  });

  it('the word helper sees the same words as the tokenizer', () => {
    expect(wordsOf(hiAdapter, 'मैं घर में हूँ।')).toEqual(['मैं', 'घर', 'में', 'हूँ']);
  });
});
