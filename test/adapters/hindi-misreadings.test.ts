/**
 * Readings the deck audit found confidently wrong (2026-11): a name against a common noun (गौरव), जी हाँ, छाया रहा, X मना है.
 * Machine-drafted rules, not checked by a native speaker. A reading is "decided" when the first candidate leads the second by more than 0.15.
 */
import { describe, expect, it } from 'vitest';
import { best, indexOf, run } from './helpers';

type Case = readonly [string, string, string];
const check = (cases: readonly Case[]) => {
  for (const [text, word, want] of cases) {
    it(`${text}: ${word} is ${want}`, () => {
      const c = best(run('hi', text), word);
      expect(c, `no reading of ${word}`).toBeDefined();
      expect(`${c.lemma}/${c.pos}`).toBe(want);
    });
  }
};
const margin = (text: string, word: string): number => {
  const r = run('hi', text);
  const cs = r.analyses[indexOf(r, word)].candidates;
  return cs[0].confidence - (cs[1]?.confidence ?? 0);
};

describe('a name that is also a common noun (गौरव)', () => {
  check([
    ['सभी मनुष्यों को गौरव और अधिकारों के मामले में समानता प्राप्त है।', 'गौरव', 'गौरव/NOUN'],
    ['देश का गौरव बढ़ा।', 'गौरव', 'गौरव/NOUN'],
    ['उसे अपने काम पर गौरव है।', 'गौरव', 'गौरव/NOUN'],
    ['सम्मान और गौरव की बात है।', 'गौरव', 'गौरव/NOUN'],
    ['गौरव ने खाना खाया।', 'गौरव', 'गौरव/PROPN'],
    ['श्री गौरव घर आए।', 'गौरव', 'गौरव/PROPN'],
    ['गौरव जी आए हैं।', 'गौरव', 'गौरव/PROPN'],
  ]);
  it('with nothing to decide it the two readings are undecided', () => {
    expect(margin('वह गौरव है।', 'गौरव')).toBeLessThanOrEqual(0.15);
  });
  it('a name that is not a common noun is left alone', () => {
    expect(best(run('hi', 'मोना ने खाना खाया।'), 'मोना').pos).toBe('PROPN');
  });
});

describe('जी before हाँ / नहीं is the answer, not जीना', () => {
  check([
    ['जी हाँ, मैं आता हूँ।', 'जी', 'जी/INTJ'],
    ['जी नहीं, मुझे नहीं पता।', 'जी', 'जी/INTJ'],
    ['जी बिल्कुल, आइए।', 'जी', 'जी/INTJ'],
    // the verb stays where a verb of जीना follows
    ['लोग जी रहे हैं।', 'जी', 'जीना/VERB'],
    ['मैं जी सकता हूँ।', 'जी', 'जीना/VERB'],
  ]);
});

describe('a perfective participle before रहा is the verb (छाया रहा)', () => {
  check([
    ['सुबह घना कोहरा छाया रहा।', 'छाया', 'छाना/VERB'],
    ['आसमान में बादल छाए रहे।', 'छाए', 'छाना/VERB'],
    ['शहर पर उदासी छाई रही।', 'छाई', 'छाना/VERB'],
    // the noun stays after a genitive or a determiner
    ['पेड़ की छाया में बैठो।', 'छाया', 'छाया/NOUN'],
    ['उस छाया में ठंडक है।', 'छाया', 'छाया/NOUN'],
  ]);
});

describe('X मना है is the adjective "forbidden", not मनाना', () => {
  check([
    ['यहाँ फोटो खींचना मना है।', 'मना', 'मना/ADJ'],
    ['अंदर जाना मना था।', 'मना', 'मना/ADJ'],
    ['डॉक्टर ने उसे चीनी खाने से मना किया।', 'मना', 'मना/ADJ'],
    // the verb stays before a vector verb
    ['उसे मना लो।', 'मना', 'मनाना/VERB'],
    ['मैंने उसे मना दिया।', 'मना', 'मनाना/VERB'],
  ]);
});

describe('a listed noun that is also a verb form stays the noun (छाता "umbrella")', () => {
  const lead = (text: string, word: string): number => margin(text, word);
  check([
    ['छाता', 'छाता', 'छाता/NOUN'],
    ['उस दिन मैं अपना छाता घर पर ही भूल गया था।', 'छाता', 'छाता/NOUN'],
    ['उसका छाता टूट गया।', 'छाता', 'छाता/NOUN'],
    ['बादल छाता रहा।', 'छाता', 'छाना/VERB'],
    ['छाया', 'छाया', 'छाया/NOUN'],
  ]);
  it('छाता alone and in a sentence leads the verb by at least 0.2', () => {
    expect(lead('छाता', 'छाता')).toBeGreaterThanOrEqual(0.2);
    expect(lead('उस दिन मैं अपना छाता घर पर ही भूल गया था।', 'छाता')).toBeGreaterThanOrEqual(0.2);
  });
});

describe('a noun citation form before an auxiliary is the participle (धोती हूँ)', () => {
  check([
    ['उठकर मैं हाथ-मुँह धोती हूँ और थोड़ी देर टहलने जाती हूँ।', 'धोती', 'धोना/VERB'],
    ['वह कपड़े धोती है।', 'धोती', 'धोना/VERB'],
    ['उसने नई धोती पहनी।', 'धोती', 'धोती/NOUN'],
    ['अपना छाता घर पर भूल गया।', 'छाता', 'छाता/NOUN'],
  ]);
});
