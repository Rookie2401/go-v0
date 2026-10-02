/**
 * Hindi sentence segmentation (package H4): danda and double danda, ? ! …, the Latin full stop, quotations and dialogue,
 * abbreviations and the abbreviation sign, list and verse numbers. Spans are trimmed slices that tile the text: everything
 * between two spans is whitespace, every other character belongs to exactly one span.
 */
import { describe, expect, it } from 'vitest';
import { segmentHindiSentences, HINDI_ABBREVIATIONS } from '../../src/adapters/hindi/sentences';

const split = (t: string): string[] => segmentHindiSentences(t).map((s) => s.text);

/** The tiling invariants every result keeps. */
function tiles(text: string): void {
  const spans = segmentHindiSentences(text);
  let last = 0;
  const covered = new Array<boolean>(text.length).fill(false);
  for (const s of spans) {
    expect(s.start).toBeGreaterThanOrEqual(last);
    expect(s.end).toBeGreaterThan(s.start);
    expect(text.slice(s.start, s.end)).toBe(s.text);
    expect(s.text).toBe(s.text.trim());
    expect(s.text.length).toBeGreaterThan(0);
    // what lies between the previous span and this one is whitespace
    expect(text.slice(last, s.start).trim()).toBe('');
    for (let k = s.start; k < s.end; k++) { expect(covered[k]).toBe(false); covered[k] = true; }
    last = s.end;
  }
  expect(text.slice(last).trim()).toBe('');
  // every non-whitespace character belongs to a span
  for (let k = 0; k < text.length; k++) if (!/\s/u.test(text[k])) expect(covered[k], `char ${k} of ${JSON.stringify(text)}`).toBe(true);
}

const CASES: Array<[string, string, string[]]> = [
  ['two sentences with the danda', 'वह घर गया। उसने खाना खाया।', ['वह घर गया।', 'उसने खाना खाया।']],
  ['? and !', 'क्या तुम आओगे? हाँ, मैं आऊँगा!', ['क्या तुम आओगे?', 'हाँ, मैं आऊँगा!']],
  ['verse numbers between double dandas', 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ॥ १ ॥ मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय ॥ २ ॥', ['धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ॥ १ ॥', 'मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय ॥ २ ॥']],
  ['verse numbers without spaces', 'सत्यमेव जयते ॥१॥ अहिंसा परमो धर्मः ॥२॥', ['सत्यमेव जयते ॥१॥', 'अहिंसा परमो धर्मः ॥२॥']],
  ['a danda with no space after it', 'वह आया।उसने कहा।', ['वह आया।', 'उसने कहा।']],
  ['a space before the danda', 'वह आया । उसने कहा ।', ['वह आया ।', 'उसने कहा ।']],
  ['quotation, danda inside, reporting clause', '"मैं कल आऊँगा।" उसने कहा।', ['"मैं कल आऊँगा।" उसने कहा।']],
  ['question in a quotation, reporting clause', '"क्या तुम आओगे?" उसने पूछा। वह चुप रहा।', ['"क्या तुम आओगे?" उसने पूछा।', 'वह चुप रहा।']],
  ['quotation followed by an action', '"चलो।" वह उठ गया।', ['"चलो।"', 'वह उठ गया।']],
  ['narration, then a quotation, then more narration', 'उसने कहा, "मैं आऊँगा।" फिर वह चला गया।', ['उसने कहा, "मैं आऊँगा।"', 'फिर वह चला गया।']],
  ['comma inside the quotation', '"मैं कल आऊँगा," उसने कहा।', ['"मैं कल आऊँगा," उसने कहा।']],
  ['curly quotes and a reporting clause', '“चलो!” माँ ने कहा। बच्चे चल पड़े।', ['“चलो!” माँ ने कहा।', 'बच्चे चल पड़े।']],
  ['two sentences inside one quotation', '"मैं आया। मैं गया।" उसने कहा।', ['"मैं आया।', 'मैं गया।" उसने कहा।']],
  ['exclamation in a quotation, then a reporting clause', '"भागो!" वह चिल्लाया। सब भागे।', ['"भागो!" वह चिल्लाया।', 'सब भागे।']],
  ['a quotation after a colon', 'माँ ने कहा: "आओ।" बच्चे आए।', ['माँ ने कहा: "आओ।"', 'बच्चे आए।']],
  ['a long clause after a quotation is a sentence of its own', '"नहीं।" वह सोचता हुआ कमरे से बाहर चला गया और किसी से कुछ नहीं कहा।', ['"नहीं।"', 'वह सोचता हुआ कमरे से बाहर चला गया और किसी से कुछ नहीं कहा।']],
  ['जवाब दिया reports speech', '"नहीं।" उसने जवाब दिया।', ['"नहीं।" उसने जवाब दिया।']],
  ['a new quotation after a quotation is a new sentence', '"आओ।" "नहीं।"', ['"आओ।"', '"नहीं।"']],
  ['dialogue with dashes', '— आप कैसे हैं? — उसने पूछा। — मैं ठीक हूँ।', ['— आप कैसे हैं? — उसने पूछा।', '— मैं ठीक हूँ।']],
  ['डॉ. is an abbreviation', 'डॉ. राम वहाँ थे। श्री मोहन आए।', ['डॉ. राम वहाँ थे।', 'श्री मोहन आए।']],
  ['प्रो. and पं.', 'प्रो. शर्मा ने पढ़ाया। पं. नेहरू आए।', ['प्रो. शर्मा ने पढ़ाया।', 'पं. नेहरू आए।']],
  ['कि.मी.', 'यह 5 कि.मी. दूर है। हम गए।', ['यह 5 कि.मी. दूर है।', 'हम गए।']],
  ['रु. and नं.', 'उसने 50 रु. दिए। मकान नं. 5 में रहता हूँ।', ['उसने 50 रु. दिए।', 'मकान नं. 5 में रहता हूँ।']],
  ['the abbreviation sign ॰', 'ई॰ सन् 1947 में देश आज़ाद हुआ। फिर क्या हुआ?', ['ई॰ सन् 1947 में देश आज़ाद हुआ।', 'फिर क्या हुआ?']],
  ['initials', 'ए. पी. जे. अब्दुल कलाम महान थे। वह वैज्ञानिक थे।', ['ए. पी. जे. अब्दुल कलाम महान थे।', 'वह वैज्ञानिक थे।']],
  ['an abbreviation in brackets', 'उसने (डॉ. राम ने) कहा। फिर चला गया।', ['उसने (डॉ. राम ने) कहा।', 'फिर चला गया।']],
  ['a Latin abbreviation', 'मैं Dr. Singh से मिला। वह गए।', ['मैं Dr. Singh से मिला।', 'वह गए।']],
  ['list numbers', '1. पहला कदम। 2. दूसरा कदम।', ['1. पहला कदम।', '2. दूसरा कदम।']],
  ['list numbers in Devanagari', '१. प्रभु मेरा चरवाहा है। २. मुझे कुछ घटी न होगी।', ['१. प्रभु मेरा चरवाहा है।', '२. मुझे कुछ घटी न होगी।']],
  ['a verse number opens the next sentence', 'आदि में परमेश्वर ने आकाश को बनाया। 2 और पृथ्वी बेडौल थी।', ['आदि में परमेश्वर ने आकाश को बनाया।', '2 और पृथ्वी बेडौल थी।']],
  ['the Latin full stop after a Hindi word', 'वह स्कूल गया. फिर घर आया.', ['वह स्कूल गया.', 'फिर घर आया.']],
  ['the Latin full stop after a consonant', 'यह मेरा राम. वह मेरा श्याम.', ['यह मेरा राम.', 'वह मेरा श्याम.']],
  ['decimals', 'यह 3.5 मीटर है। वह 10.30 बजे आया।', ['यह 3.5 मीटर है।', 'वह 10.30 बजे आया।']],
  ['an ellipsis ends a sentence', 'वह चुप रहा… फिर बोला।', ['वह चुप रहा…', 'फिर बोला।']],
  ['mixed stops', 'क्या हुआ? कुछ नहीं… बस ऐसे ही।', ['क्या हुआ?', 'कुछ नहीं…', 'बस ऐसे ही।']],
  ['runs of stops', 'क्या!? वह आ गया?!', ['क्या!?', 'वह आ गया?!']],
  ['the pipe as a danda', 'वह आया | उसने कहा |', ['वह आया |', 'उसने कहा |']],
  ['lines', 'पहली पंक्ति\nदूसरी पंक्ति।\n\nतीसरी।', ['पहली पंक्ति', 'दूसरी पंक्ति।', 'तीसरी।']],
  ['windows line ends', 'पहली।\r\nदूसरी।', ['पहली।', 'दूसरी।']],
  ['a closing bracket after the danda', 'वह आया (देर से।) फिर वह गया।', ['वह आया (देर से।)', 'फिर वह गया।']],
  ['quotation at the very end', 'श्रीमती गुप्ता आईं। उन्होंने कहा, "नमस्ते।"', ['श्रीमती गुप्ता आईं।', 'उन्होंने कहा, "नमस्ते।"']],
  ['Scripture-like', 'क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा कि उसने अपना एकलौता पुत्र दे दिया। ताकि जो कोई उस पर विश्वास करे वह नाश न हो।', ['क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा कि उसने अपना एकलौता पुत्र दे दिया।', 'ताकि जो कोई उस पर विश्वास करे वह नाश न हो।']],
  ['no terminator at all', 'बिना विराम का वाक्य', ['बिना विराम का वाक्य']],
  ['leading and trailing space', '  वह गया।   उसने कहा।  ', ['वह गया।', 'उसने कहा।']],
  ['a web address does not split', 'देखिए www.example.com पर। फिर बताइए।', ['देखिए www.example.com पर।', 'फिर बताइए।']],
  ['a Latin word in lower case after a stop goes on', 'वह ok. thanks कहकर चला गया।', ['वह ok. thanks कहकर चला गया।']],
  ['a quotation with ? and a reporting clause in the middle of a paragraph', 'वह आया। "कौन है?" उसने पूछा। कोई नहीं बोला।', ['वह आया।', '"कौन है?" उसने पूछा।', 'कोई नहीं बोला।']],
  ['feminine reporting verb', '"आओ!" वह बोली। हम गए।', ['"आओ!" वह बोली।', 'हम गए।']],
];

describe('Hindi sentence segmentation: cases', () => {
  it.each(CASES)('%s', (_n, text, expected) => {
    expect(split(text)).toEqual(expected);
    tiles(text);
  });
});

describe('Hindi sentence segmentation: tiling', () => {
  it('has at least thirty paragraphs checked for exact tiling', () => { expect(CASES.length).toBeGreaterThanOrEqual(30); });

  const PARAGRAPHS = [
    CASES.map((c) => c[1]).join(' '),
    CASES.map((c) => c[1]).join('\n'),
    CASES.map((c) => c[1]).join('\n\n  '),
    CASES.map((c) => `  ${c[1]}  `).join(''),
    '"वह आया।"\n"वह गया।"\n',
    '\n\n\nएक\n\n',
    'क',
    '।',
    '।।।',
    '. . .',
    '"',
    '( ) [ ]',
    '१.',
    '॥ १ ॥',
  ];
  it.each(PARAGRAPHS.map((p, k) => [k, p] as const))('paragraph %i', (_k, p) => { tiles(p); });

  it('empty and blank text give no sentences', () => {
    expect(split('')).toEqual([]);
    expect(split('   \n \t ')).toEqual([]);
  });

  it('joining all the cases still gives at least as many sentences as the cases hold', () => {
    const all = segmentHindiSentences(CASES.map((c) => c[1]).join('\n'));
    expect(all.length).toBe(CASES.reduce((n, c) => n + c[2].length, 0));
  });

  it('a long text is handled in linear time', () => {
    const text = Array.from({ length: 5000 }, () => 'वह घर गया। "चलो!" उसने कहा।').join(' ');
    const t0 = Date.now();
    const spans = segmentHindiSentences(text);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(spans).toHaveLength(10000);
  });

  it('is deterministic', () => {
    const t = CASES.map((c) => c[1]).join(' ');
    expect(segmentHindiSentences(t)).toEqual(segmentHindiSentences(t));
  });

  it('the abbreviation list has the abbreviations the brief names', () => {
    for (const a of ['डॉ.', 'प्रो.', 'पं.', 'ई.', 'कि.मी.', 'रु.', 'नं.']) expect(HINDI_ABBREVIATIONS).toContain(a);
  });
});
