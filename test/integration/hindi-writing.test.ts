/**
 * The coordinator's own check of the Hindi writing checks (GoTell), on the real adapter, with sentences the package
 * that wrote the rules never saw. The first duty of a checker a learner trusts is silence on correct Hindi: a false
 * alarm teaches a mistake. Catching errors comes second, and what is not caught is stated as a known limit.
 *
 * The sentences are the coordinator's (an AI's) own and are not native-reviewed; a sentence a reviewer finds
 * unnatural should be replaced, not defended.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';

const hi = createAdapterRegistry().get('hi');
const check = (sentence: string) => {
  const tokens = hi.tokenize(sentence.normalize('NFC'));
  return hi.checkProduction(tokens, hi.analyze(tokens), sentence.normalize('NFC'));
};

/** Correct, ordinary sentences of the kind a testimony contains. None may produce a finding. */
const CORRECT = [
  'मेरा नाम रवि है।',
  'मैं भारत में रहता हूँ।',
  'मेरी माँ बहुत अच्छी हैं।',
  'हम हर रविवार को कलीसिया जाते हैं।',
  'मैंने बाइबल पढ़ी।',
  'उसने मुझे एक किताब दी।',
  'परमेश्वर ने मेरी प्रार्थना सुनी।',
  'यीशु ने मुझे बचाया।',
  'मुझे हिंदी सीखना अच्छा लगता है।',
  'मेरे दो भाई और एक बहन हैं।',
  'वह कल बाज़ार गई थी।',
  'लड़के मैदान में खेल रहे हैं।',
  'मुझे पानी चाहिए।',
  'क्या आप चाय पिएँगे?',
  'आप कहाँ से हैं?',
  'मैं कल दिल्ली जाऊँगा।',
  'बच्चों ने खाना खा लिया।',
  'मेरे पिता जी डॉक्टर हैं।',
  'यह मेरी छोटी बहन की किताब है।',
  'जब मैं छोटा था, तब मैं गाँव में रहता था।',
  'मैं उससे रोज़ बात करता हूँ।',
  'उन्होंने मेरी बहुत मदद की।',
  'मुझे डर लगता था, पर अब नहीं लगता।',
  'हमें एक दूसरे से प्रेम करना चाहिए।',
];

/** Sentences with one clear mistake of a kind the rules claim to see. */
const WRONG: Array<[string, RegExp]> = [
  ['मैं एक अच्छी लड़का हूँ।', /अच्छा/],
  ['यह मेरा किताब है।', /मेरी/],
  ['लड़का के पास किताब है।', /लड़के/],
  ['वह अच्छा लड़की है।', /अच्छी/],
  // reported with a message and deliberately no correction: the rule cannot tell मेरा from मेरे without the noun's case
  ['मेरी भाई स्कूल जाता है।', /masculine/],
];

/** Mistakes the rules are known NOT to see yet (docs/HINDI_COURSE.md, weaknesses). The test fails when one starts to be caught, so the document is updated. */
const KNOWN_MISSES = [
  'मैं किताब पढ़ा।', // the doer of a past transitive verb needs ने
];

describe('Hindi writing checks on the real adapter (coordinator\'s sentences)', () => {
  it.each(CORRECT)('says nothing about a correct sentence: %s', (sentence) => {
    const found = check(sentence);
    expect(found.map((f) => `${f.category ?? ''}: ${f.message ?? JSON.stringify(f)}`), sentence).toEqual([]);
  });

  it.each(WRONG)('reports the mistake in: %s', (sentence, suggestion) => {
    const found = check(sentence);
    expect(found.length, sentence).toBeGreaterThan(0);
    expect(JSON.stringify(found), sentence).toMatch(suggestion);
  });

  it.each(KNOWN_MISSES)('known limit, not yet reported: %s', (sentence) => {
    expect(check(sentence)).toEqual([]);
  });

  it('a finding never carries a correction for a word the word list does not vouch for', () => {
    for (const f of check('मैं एक अच्छी ज़्बक्ल हूँ।')) expect(JSON.stringify(f)).not.toMatch(/"suggestion":"[^"]*ज़्बक्ल/);
  });
});
