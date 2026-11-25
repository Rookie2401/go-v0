/**
 * Checks on learner French (src/adapters/french/production.ts), through the real adapter. Machine-drafted rules: each check has a
 * positive case, with its suggestion applied to the sentence, and negative cases that must stay silent. An empty result means
 * "nothing found", not "correct".
 */
import { describe, expect, it } from 'vitest';
import type { ErrorCandidate } from '../../src/core';
import { frAdapter } from '../../src/adapters/fr';

function check(sentence: string): ErrorCandidate[] {
  const tokens = frAdapter.tokenize(sentence);
  const analyses = frAdapter.analyze(tokens);
  return frAdapter.checkProduction?.(tokens, analyses, sentence) ?? [];
}

/** The sentence with every suggestion applied, right to left. */
function fixed(sentence: string): string {
  const sugs = check(sentence).flatMap((e) => (e.suggestion ? [e.suggestion] : [])).sort((a, b) => b.start - a.start);
  let s = sentence;
  for (const g of sugs) s = s.slice(0, g.start) + g.replacement + s.slice(g.end);
  return s;
}

describe('a missing elision', () => {
  it.each([
    ['Le homme dort.', 'L\'homme dort.'],
    ['Je ai faim.', 'J\'ai faim.'],
    ['Il a besoin de un livre.', 'Il a besoin d\'un livre.'],
    ['Je pense que il vient.', 'Je pense qu\'il vient.'],
    ['Si il vient, je reste.', 'S\'il vient, je reste.'],
    ['Il ne a pas faim.', 'Il n\'a pas faim.'],
    ['Ce est bien.', 'C\'est bien.'],
    ['La amie de Paul.', 'L\'amie de Paul.'],
    ['Je me appelle Paul.', 'Je m\'appelle Paul.'],
    ['Il va jusque à la mer.', 'Il va jusqu\'à la mer.'],
  ])('%s → %s', (sentence, expected) => {
    const found = check(sentence);
    expect(found.some((e) => e.category === 'spelling'), sentence).toBe(true);
    expect(fixed(sentence)).toBe(expected);
  });
  it('is silent before an h aspiré, onze, oui, yaourt and before a consonant', () => {
    for (const s of ['Le héros dort.', 'Le onze est là.', 'Il a dit le oui.', 'Le yaourt est bon.', 'Le haricot est vert.', 'Le garçon dort.', 'Je mange.', 'Il parle de Paris.', 'Le huit est un chiffre.']) {
      expect(check(s).filter((e) => e.category === 'spelling'), s).toEqual([]);
    }
  });
  it('is silent when the elision is already written, and for a hyphen clitic (donne-le à Paul)', () => {
    for (const s of ['L\'homme dort.', 'J\'ai faim.', 'Donne-le à Paul.', 'Qu\'il vienne.', 'Elle l\'a vu.']) {
      expect(check(s).filter((e) => e.category === 'spelling'), s).toEqual([]);
    }
  });
  it('si before elle is not elided', () => {
    expect(check('Si elle vient, je reste.')).toEqual([]);
  });
  it('the message names the shortened form and the confidence is high but not certain', () => {
    const e = check('Le homme dort.')[0]!;
    expect(e.message).toMatch(/L'homme/);
    expect(e.confidence).toBeLessThan(1);
    expect(e.affectsMeaning).toBe(false);
  });
});

describe('a missing contraction', () => {
  it.each([
    ['Il parle à le garçon.', 'Il parle au garçon.'],
    ['Il parle à les enfants.', 'Il parle aux enfants.'],
    ['Le livre de le garçon.', 'Le livre du garçon.'],
    ['La maison de les enfants.', 'La maison des enfants.'],
  ])('%s → %s', (sentence, expected) => {
    expect(check(sentence).some((e) => e.category === 'morphology'), sentence).toBe(true);
    expect(fixed(sentence)).toBe(expected);
  });
  it('is silent where the article is really a pronoun before an infinitive, or l\' is right', () => {
    for (const s of ['Il a décidé de le faire.', 'Il commence à le voir.', 'Il parle à l\'école.', 'Il parle au garçon.', 'Le livre du garçon.']) {
      expect(check(s).filter((e) => e.category === 'morphology'), s).toEqual([]);
    }
  });
  it('à le école is left to the elision check (l\' is the right form)', () => {
    const found = check('Il va à le école.');
    expect(found.some((e) => e.category === 'morphology')).toBe(false);
    expect(found.some((e) => e.category === 'spelling')).toBe(true);
  });
});

describe('an article against its noun', () => {
  it.each([
    ['Le maison est grande.', 'La maison est grande.'],
    ['Un table est là.', 'Une table est là.'],
    ['Ce homme dort.', 'Cet homme dort.'],
    ['Cet garçon dort.', 'Ce garçon dort.'],
    ['Ma amie dort.', 'Mon amie dort.'],
    ['Mon table est là.', 'Ma table est là.'],
    ['Cet maison est belle.', 'Cette maison est belle.'],
  ])('%s → %s', (sentence, expected) => {
    expect(check(sentence).some((e) => e.category === 'agreement'), sentence).toBe(true);
    expect(fixed(sentence)).toBe(expected);
  });
  it('is silent for correct pairs, including the vowel cases', () => {
    for (const s of ['La maison est grande.', 'Une table est là.', 'Cet homme dort.', 'Ce garçon dort.', 'Mon amie dort.', 'Ma table est là.', 'Cette maison est belle.', 'Le garçon dort.', 'Mon ami dort.']) {
      expect(check(s).filter((e) => e.category === 'agreement'), s).toEqual([]);
    }
  });
  it('a word that is also a verb or an adjective is not judged (il le porte)', () => {
    expect(check('Il le porte.')).toEqual([]);
  });
  it('a mismatch of number is reported without a suggestion (the rules cannot tell which word was meant)', () => {
    const found = check('Les maison est grande.').filter((e) => e.category === 'agreement');
    expect(found.length).toBe(1);
    expect(found[0]!.suggestion).toBeUndefined();
    expect(found[0]!.message).toMatch(/number/);
  });
  it('a noun the word list gives with two genders is not judged', () => {
    expect(check('Le livre est ici. La livre est ici.').filter((e) => e.category === 'agreement')).toEqual([]);
  });
});

describe('a subject pronoun against its verb', () => {
  it.each([
    ['Je es content.', 'Je suis content.'],
    ['Tu a faim.', 'Tu as faim.'],
    ['Nous mange du pain.', 'Nous mangeons du pain.'],
    ['Je a faim.', 'J\'ai faim.'],
  ])('%s → %s', (sentence, expected) => {
    expect(check(sentence).some((e) => e.category === 'conjugation'), sentence).toBe(true);
    expect(fixed(sentence)).toBe(expected);
  });
  it('a mismatch without a safe form is reported without a suggestion', () => {
    const found = check('Ils mange du pain.').filter((e) => e.category === 'conjugation');
    expect(found.length).toBe(1);
  });
  it('is silent for correct pairs, for an object nous / vous, and for an inverted pronoun', () => {
    for (const s of ['Je suis content.', 'Tu as faim.', 'Nous mangeons du pain.', 'Il vous parle.', 'Elle nous voit.', 'Ils mangent.', 'Vous avez raison.', 'Que veux-tu ?', 'Je ne sais pas.']) {
      expect(check(s).filter((e) => e.category === 'conjugation'), s).toEqual([]);
    }
  });
});

describe('être verbs conjugated with avoir', () => {
  it('j\'ai allé → je suis allé', () => {
    const sentence = 'J\'ai allé à Paris.';
    expect(check(sentence).some((e) => e.category === 'conjugation')).toBe(true);
    expect(fixed(sentence)).toBe('Je suis allé à Paris.');
  });
  it.each([
    ['Il a arrivé hier.', 'Il est arrivé hier.'],
    ['Tu as venu ici.', 'Tu es venu ici.'],
    ['Elle n\'a pas parti.', 'Elle n\'est pas parti.'],
  ])('%s → %s', (sentence, expected) => {
    expect(check(sentence).some((e) => e.category === 'conjugation'), sentence).toBe(true);
    expect(fixed(sentence)).toBe(expected);
  });
  it('is silent for the right auxiliary and for verbs that take avoir or both', () => {
    for (const s of ['Je suis allé à Paris.', 'Il est arrivé hier.', 'J\'ai mangé du pain.', 'Elle a sorti le chien.', 'Il a monté l\'escalier.', 'Nous avons vu le chat.']) {
      expect(check(s).filter((e) => e.category === 'conjugation'), s).toEqual([]);
    }
  });
});

describe('what is deliberately not flagged, and the shape of a result', () => {
  it('ne without a second negative element is left alone (literary French has it)', () => {
    expect(check('Je ne sais.')).toEqual([]);
    expect(check('Il ne dort.')).toEqual([]);
  });
  it('an ordinary correct paragraph gives nothing', () => {
    const s = 'Le petit garçon est allé à l\'école. Il a mangé du pain et il a bu de l\'eau. Nous avons vu un chat dans la maison de mon ami.';
    expect(check(s)).toEqual([]);
  });
  it('every result has indexes in range, a short message, an honest confidence and offsets that slice the sentence', () => {
    const sentence = 'Le homme a allé à le école et je es content.';
    const tokens = frAdapter.tokenize(sentence);
    const found = check(sentence);
    expect(found.length).toBeGreaterThan(2);
    for (const e of found) {
      expect(e.tokenIndexes.length).toBeGreaterThan(0);
      for (const i of e.tokenIndexes) expect(tokens[i]?.isWord).toBe(true);
      expect(e.message.length).toBeGreaterThan(10);
      expect(e.message.length).toBeLessThan(220);
      expect(e.confidence).toBeGreaterThan(0.5);
      expect(e.confidence).toBeLessThan(1);
      expect(e.affectsMeaning).toBe(false);
      if (e.suggestion) {
        expect(e.suggestion.start).toBeGreaterThanOrEqual(0);
        expect(e.suggestion.end).toBeLessThanOrEqual(sentence.length);
        expect(e.suggestion.start).toBeLessThanOrEqual(e.suggestion.end);
      }
    }
  });
  it('a capital is kept in the suggestion (Le homme → L\'homme)', () => {
    expect(fixed('Le homme dort.').startsWith('L\'homme')).toBe(true);
    expect(fixed('Je es là.').startsWith('Je suis')).toBe(true);
  });
  it('an empty sentence gives nothing', () => {
    expect(check('')).toEqual([]);
    expect(check('… !')).toEqual([]);
  });
});
