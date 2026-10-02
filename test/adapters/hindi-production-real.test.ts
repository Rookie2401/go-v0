/**
 * The writing checks on the REAL adapter (word list + morphology engine + package H4's rules): correct sentences must give
 * nothing; the oblique before the genitive and before compound postpositions, and the agreement of a possessive with a noun whose
 * gender only the word list knows, are reported with a correction the rule can reproduce.
 */
import { describe, expect, it } from 'vitest';
import { hiAdapter } from '../../src/adapters/hi';

function check(sentence: string) {
  const s = sentence.normalize('NFC');
  const tokens = hiAdapter.tokenize(s);
  const analyses = hiAdapter.analyze(tokens);
  return { s, errs: hiAdapter.checkProduction(tokens, analyses, s) };
}
const fixed = (sentence: string): string => {
  const { s, errs } = check(sentence);
  let t = s;
  for (const e of errs.filter((x) => x.suggestion).sort((a, b) => (b.suggestion?.start ?? 0) - (a.suggestion?.start ?? 0))) t = t.slice(0, e.suggestion!.start) + e.suggestion!.replacement + t.slice(e.suggestion!.end);
  return t;
};

const CORRECT = [
  // possessives
  'मेरे पिता जी घर में हैं।', 'मेरे पिता जी आए हैं।', 'मेरी बहन का घर बड़ा है।', 'मेरा बड़ा भाई आया।', 'मेरी छोटी बहन आई।', 'मेरे अच्छे दोस्त आए।', 'मेरा घर बड़ा है।', 'मेरी किताब अच्छी है।',
  'उसका भाई स्कूल जाता है।', 'उसकी बहन स्कूल जाती है।', 'हमारा घर पास है।', 'हमारी भाषा हिंदी है।', 'तुम्हारा दोस्त आया।', 'तुम्हारी किताब कहाँ है?', 'अपना काम करो।', 'अपनी बात कहो।',
  'मेरे दोस्त का घर दूर है।', 'मेरी माँ का घर बड़ा है।', 'हे प्रभु, मेरी सुनो।', 'मेरे भाई, तुम आओ।', 'उनकी बहन आई।', 'इसका नाम क्या है?',
  // the genitive and the postpositions it opens
  'लड़के का घर बड़ा है।', 'लड़के की किताब मेज़ पर है।', 'बच्चों के लिए खाना लाओ।', 'लड़कियों की किताबें अच्छी हैं।', 'राम का भाई आया।', 'राम की बहन आई।',
  'मेरे पास किताब है।', 'उसके साथ खेलो।', 'लड़के के पास पैसे हैं।', 'कमरे के बाहर बैठो।', 'घर के अंदर आओ।', 'लड़के को किताब दो।', 'सबके लिए प्रार्थना करो।',
  'पिता का घर बड़ा है।', 'पिता के साथ जाओ।', 'राजा की बेटी आई।', 'बच्चे की माँ आई।', 'दोस्त की किताब मेरे पास है।', 'घर के लिए पैसे लाओ।', 'कमरे में कोई नहीं है।',
  // agreement of the verb and the helper
  'वह रोज़ पढ़ता है।', 'लड़कियाँ गाती हैं।', 'लड़कियाँ खेल रही हैं।', 'वह खेल रही है।', 'मैं जाता हूँ।', 'तुम जाते हो।', 'आप जाते हैं।', 'वे जाते हैं।', 'हम जाते हैं।',
  'उसने रोटी खाई।', 'मुझे जाना है।', 'मुझे भूख लगी है।', 'ताकि हम समझें।', 'शायद वह आए।', 'वह खा रहा है।',
];

describe('writing checks on the real adapter: correct sentences give nothing', () => {
  it.each(CORRECT)('%s', (s) => { expect(check(s).errs.map((e) => e.message)).toEqual([]); });
});

describe('the oblique before the genitive and before the postpositions it opens', () => {
  const ROWS: Array<[string, string]> = [
    ['लड़का का घर बड़ा है।', 'लड़के का घर बड़ा है।'],
    ['लड़का की किताब मेज़ पर है।', 'लड़के की किताब मेज़ पर है।'],
    ['लड़का के पास किताब है।', 'लड़के के पास किताब है।'],
    ['कमरा के बाहर बैठो।', 'कमरे के बाहर बैठो।'],
    ['घोड़ा के साथ जाओ।', 'घोड़े के साथ जाओ।'],
    ['लड़का को किताब दो।', 'लड़के को किताब दो।'],
    ['किताबें का नाम अच्छा है।', 'किताबों का नाम अच्छा है।'],
  ];
  it.each(ROWS)('%s', (wrong, right) => {
    const { errs } = check(wrong);
    expect(errs.some((e) => e.category === 'case'), wrong).toBe(true);
    expect(fixed(wrong)).toBe(right);
  });
});

describe('a possessive or का / के / की with a noun whose gender only the word list knows', () => {
  const REPORTED = ['मेरी भाई आया।', 'मेरी घर बड़ा है।', 'राम की भाई आया।', 'मेरा किताब अच्छी है।', 'मेरा बहन आई।', 'उसका भाषा सुंदर है।', 'राम का बहन आई।', 'हमारा बात सच है।'];
  it.each(REPORTED)('%s', (s) => {
    const { errs } = check(s);
    expect(errs.some((e) => e.category === 'agreement' && e.tokenIndexes.length === 2), s).toBe(true);
  });
  it('a feminine noun gets the feminine form as the correction', () => {
    expect(fixed('मेरा किताब अच्छी है।')).toBe('मेरी किताब अच्छी है।');
    expect(fixed('मेरा बहन आई।')).toBe('मेरी बहन आई।');
  });
  it('a masculine noun with no sure case gets a message and no correction (का or के)', () => {
    const { errs } = check('मेरी भाई आया।');
    expect(errs[0].suggestion).toBeUndefined();
    expect(errs[0].message).toContain('masculine');
  });
});
