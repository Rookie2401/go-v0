/**
 * What the first reading of the Hindi ladder (data/ladder/hi, 101 units) found read wrongly or missing (adapter-hi@5): the honorific जी,
 * the name किरण, the noun सीख, पूरी, सोता, बिल, the participles बैठे / रखी, the words and spellings that had no reading. Each case is a
 * carrier sentence and the first reading of one word. Machine-drafted rules; not checked by a native speaker.
 */
import { describe, expect, it } from 'vitest';
import { best, run } from './helpers';

/** [sentence, the word, lemma/POS of its first reading] */
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

describe('जी after a name, a title or a kin term is the honorific', () => {
  check([
    ['गीता जी के घर', 'जी', 'जी/PART'], ['सुरेश जी के पास', 'जी', 'जी/PART'], ['डॉक्टर जी के पास', 'जी', 'जी/PART'], ['माँ जी के साथ', 'जी', 'जी/PART'],
    ['शर्मा जी की किताब', 'जी', 'जी/PART'], ['शर्मा जी से', 'जी', 'जी/PART'], ['शर्मा जी आ गए', 'जी', 'जी/PART'], ['पिता जी घर पर हैं', 'जी', 'जी/PART'],
    // the verb and the noun stay where they are
    ['लोग जी रहे हैं', 'जी', 'जीना/VERB'], ['मैं जी सकता हूँ', 'जी', 'जीना/VERB'], ['मेरा जी नहीं लगता', 'जी', 'जी/NOUN'], ['आप जी भर के खाइए', 'जी', 'जी/NOUN'],
  ]);
});

describe('words the ladder found missing', () => {
  const missing = ['आंटी', 'क्लिनिक', 'पैदल', 'सिम', 'कार्ड', 'गेस्ट', 'हाउस', 'हेरोदेस', 'नाटक', 'स्क्रीन', 'गरमी', 'मई', 'चरनी', 'दाईं', 'वालों', 'पीऊँगा', 'पीएँगे'];
  for (const w of missing) {
    it(`${w} has a reading the word list vouches for`, () => {
      const c = best(run('hi', `यह ${w} है`), w);
      expect(c, w).toBeDefined();
      expect(c.unconfirmed, w).toBeFalsy();
    });
  }
  it('गरमी is a spelling of गर्मी, दाईं a form of दायाँ, पीएँगे and पीऊँगा forms of पीना', () => {
    expect(best(run('hi', 'गरमी बहुत है'), 'गरमी').lemma).toBe('गर्मी');
    expect(best(run('hi', 'दाईं ओर'), 'दाईं').lemma).toBe('दायाँ');
    expect(best(run('hi', 'हम चाय पीएँगे'), 'पीएँगे').lemma).toBe('पीना');
    expect(best(run('hi', 'मैं चाय पीऊँगा'), 'पीऊँगा').lemma).toBe('पीना');
  });
  it('the months, the weekdays and the everyday words the drafters named are all read', () => {
    for (const w of ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार', 'रविवार',
      'सर', 'परीक्षा', 'कृपया', 'चिंता', 'मनाना', 'रसीद', 'पासपोर्ट', 'सरकारी', 'ग़लत', 'दर्ज़ी', 'जलाना', 'माचिस', 'सुई', 'पूजा', 'दुख', 'मुश्किल', 'वैसा', 'जड़', 'माथा', 'हे', 'मुड़ना', 'लिखना', 'आसान', 'याद', 'गाना']) {
      const c = best(run('hi', `वह ${w} है`), w);
      expect(c, w).toBeDefined();
      expect(c.unconfirmed, w).toBeFalsy();
    }
  });
});

describe('a word the ladder found read wrongly', () => {
  check([
    // किरण: the name, unless a genitive, an adjective or a number stands before it
    ['किरण ने कहा', 'किरण', 'किरण/PROPN'], ['किरण जी', 'किरण', 'किरण/PROPN'], ['मेरी दोस्त किरण आई', 'किरण', 'किरण/PROPN'], ['आशा की किरण', 'किरण', 'किरण/NOUN'], ['पहली किरण आई', 'किरण', 'किरण/NOUN'],
    // सीख: the noun before देना / मिलना, the verb otherwise
    ['उसने मुझे सीख दी', 'सीख', 'सीख/NOUN'], ['मुझे सीख मिली', 'सीख', 'सीख/NOUN'], ['बच्चे सीख रहे हैं', 'सीख', 'सीखना/VERB'],
    // मोड़ आता है
    ['यहाँ मोड़ आता है', 'मोड़', 'मोड़/NOUN'],
    // पूरी: whole, unless food is near
    ['पूरी बात', 'पूरी', 'पूरा/ADJ'], ['पूरी तरह', 'पूरी', 'पूरा/ADJ'], ['पूरी रात जागा', 'पूरी', 'पूरा/ADJ'], ['पूरी हो गई', 'पूरी', 'पूरा/ADJ'],
    ['आलू पूरी खाओ', 'पूरी', 'पूरी/NOUN'], ['पूरी और सब्ज़ी खाओ', 'पूरी', 'पूरी/NOUN'], ['दो पूरी दो', 'पूरी', 'पूरी/NOUN'],
    // सोता: the verb before होना, the noun after a genitive
    ['वह सोता है', 'सोता', 'सोना/VERB'], ['वह सोता था', 'सोता', 'सोना/VERB'], ['वह कुर्सी के नीचे सोता है', 'सोता', 'सोना/VERB'], ['वह सोता नहीं है', 'सोता', 'सोना/VERB'], ['पानी का सोता', 'सोता', 'सोता/NOUN'],
    // the perfective participle before होना
    ['वे बैठे हैं', 'बैठे', 'बैठना/VERB'], ['वह बैठी थी', 'बैठी', 'बैठना/VERB'], ['किताबें रखी हैं', 'रखी', 'रखना/VERB'], ['किताबें रखे हैं', 'रखे', 'रखना/VERB'], ['मोती दरवाज़े पर बैठा रहा', 'बैठा', 'बैठना/VERB'],
    // an oblique adjective is the adjective (not a separate adverb): one word for the learner
    ['अकेले घर', 'अकेले', 'अकेला/ADJ'], ['सीधे जाओ', 'सीधे', 'सीधा/ADJ'], ['हम दाएँ जाएँगे', 'दाएँ', 'दायाँ/ADJ'], ['बाएँ मुड़ो', 'बाएँ', 'बायाँ/ADJ'], ['हाथ बँधे हैं', 'बँधे', 'बँधना/VERB'],
    ['पिछले साल', 'पिछले', 'पिछला/ADJ'], ['सैकड़ों लोग', 'सैकड़ों', 'सैकड़ा/NOUN'], ['वह थकी है', 'थकी', 'थका/ADJ'],
  ]);
  it('बिल is the burrow after an animal and the bill otherwise', () => {
    expect(best(run('hi', 'चूहे का बिल'), 'बिल').gloss).toMatch(/burrow/);
    expect(best(run('hi', 'साँप का बिल है'), 'बिल').gloss).toMatch(/burrow/);
    expect(best(run('hi', 'बिजली का बिल आया'), 'बिल').gloss).toMatch(/bill/);
    expect(best(run('hi', 'बिल दो'), 'बिल').gloss).toMatch(/bill/);
  });
  it('वालों is the oblique plural of वाला, and X + वाला written as one word keeps both parts', () => {
    expect(best(run('hi', 'काम करने वालों को'), 'वालों').lemma).toBe('वाला');
    const c = best(run('hi', 'सब्ज़ीवाला आया'), 'सब्ज़ीवाला');
    expect(c.parts?.map((p) => p.text)).toEqual(['सब्ज़ी', 'वाला']);
  });
  it('nothing is removed: the other reading stays on the list, below the chosen one', () => {
    const r = run('hi', 'पूरी तरह');
    const cs = r.analyses[0].candidates;
    expect(cs.some((c) => c.lemma === 'पूरी' && c.pos === 'NOUN')).toBe(true);
    expect(cs[0].notes?.context).toBeTruthy();
  });
});
