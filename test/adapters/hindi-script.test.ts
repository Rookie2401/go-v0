/**
 * Hindi script (package H1): akṣara segmentation, the search form and spelling variants. The examples are the
 * author's own, machine-drafted from general knowledge of Hindi; none has been checked by a native speaker.
 * "%" in a literal stands for the nukta (U+093C) so that no test depends on how an editor stores ज़.
 */
import { describe, expect, it } from 'vitest';
import { aksharas, hindiSearchForm, hindiSpellingVariants } from '../../src/adapters/hindi/script';

const nk = (s: string): string => s.replace(/%/g, '़');
const texts = (w: string): string[] => aksharas(w).map((a) => a.text);

const WORDS = [
  'कमल', 'घर', 'लड%ाई', 'आदमी', 'प्रार्थना', 'हिंदी', 'हिन्दी', 'संबंध', 'सम्बन्ध', 'अंडा',
  'नहीं', 'में', 'हैं', 'माँ', 'यहाँ', 'क्षमा', 'ज्ञान', 'त्रिशूल', 'श्रीमान', 'स्त्री', 'राष्ट्रीय', 'धर्म', 'कर्म', 'सूर्य',
  'विद्यालय', 'उज्ज्वल', 'पुनः', 'दुःख', 'ऋषि', 'कृपा', 'कॉलेज', 'डॉक्टर', 'ऑफ़िस', 'ऍप', 'सत्', 'क्', 'विद्वान्', 'महान्',
  'ज%रूरत', 'फ%ोन', 'क%ानून', 'ख%बर', 'ग%लत', 'लड%का', 'पढ%ना', 'अ‍ंक', 'क्‍ष', 'क्‌ष', 'र्‍य', '१२३', 'ab', 'कमल-घर',
  'ऽ', 'सुंदर', 'बच्चा', 'अच्छा', 'दिल्ली', 'प्रश्न', 'ईश्वर', 'पुस्तक', 'शब्द', 'मित्र', 'वाक्य', 'चाहिए', 'आए', 'जाएँगे',
  'भाई', 'दोस्त', 'किताब', 'खाना', 'पानी', 'मैं', 'तुम', 'आप', 'क्या', 'कैसे', 'कौन', 'ओर', 'और', 'ऐसा', 'अगर', '।', '॥',
].map(nk);

describe('aksharas: tiling', () => {
  it('the units tile the input exactly, for real words with every kind of cluster and sign', () => {
    for (const w of WORDS) {
      const us = aksharas(w);
      expect(us.map((a) => a.text).join(''), w).toBe(w);
      let at = 0;
      for (const a of us) {
        expect(a.start, w).toBe(at);
        expect(a.end, w).toBe(at + a.text.length);
        expect(w.slice(a.start, a.end)).toBe(a.text);
        at = a.end;
      }
      expect(at).toBe(w.length);
    }
  });

  it('is empty for the empty string and keeps offsets in UTF-16 code units for astral characters', () => {
    expect(aksharas('')).toEqual([]);
    const us = aksharas('क😀का');
    expect(us.map((a) => a.text)).toEqual(['क', '😀', 'का']);
    expect(us[2].start).toBe(3);
  });
});

describe('aksharas: units', () => {
  it('प्रार्थना is प्रा · र्थ · ना', () => {
    const us = aksharas('प्रार्थना');
    expect(us.map((a) => a.text)).toEqual(['प्रा', 'र्थ', 'ना']);
    expect(us[0].consonants).toEqual(['प', 'र']);
    expect(us[0].vowel).toBe('◌ा');
    expect(us[0].signs).toContain('rakar');
    expect(us[1].consonants).toEqual(['र', 'थ']);
    expect(us[1].vowel).toBeUndefined();
    expect(us[1].signs).toContain('reph');
    expect(us[2].consonants).toEqual(['न']);
  });

  it('a plain consonant has no vowel written and a vowel sign is given with ◌', () => {
    const [ka, ki, kee, ke] = ['क', 'कि', 'की', 'के'].map((w) => aksharas(w)[0]);
    expect(ka.vowel).toBeUndefined();
    expect(ki.vowel).toBe('◌ि');
    expect(kee.vowel).toBe('◌ी');
    expect(ke.vowel).toBe('◌े');
    expect(ka.signs).toEqual([]);
    expect(ka.dead).toBe(false);
  });

  it('an independent vowel is a unit with no consonant; its nasal sign stays with it', () => {
    const us = aksharas('अंक');
    expect(texts('अंक')).toEqual(['अं', 'क']);
    expect(us[0].consonants).toEqual([]);
    expect(us[0].vowel).toBe('अ');
    expect(us[0].signs).toEqual(['anusvara']);
    expect(aksharas('आँख').map((a) => a.text)).toEqual(['आँ', 'ख']);
    expect(aksharas('आँख')[0].signs).toEqual(['chandrabindu']);
  });

  it('keeps conjuncts together, a conjunct of three is one unit', () => {
    expect(texts('क्षमा')).toEqual(['क्ष', 'मा']);
    expect(texts('स्त्री')).toEqual(['स्त्री']);
    expect(aksharas('स्त्री')[0].consonants).toEqual(['स', 'त', 'र']);
    expect(texts('उज्ज्वल')).toEqual(['उ', 'ज्ज्व', 'ल']);
    expect(texts('ज्ञान')).toEqual(['ज्ञा', 'न']);
    expect(aksharas('ज्ञान')[0].consonants).toEqual(['ज', 'ञ']);
  });

  it('reph is a र at the start of a cluster and rakar a र after a consonant', () => {
    const dharm = aksharas('धर्म');
    expect(dharm.map((a) => a.text)).toEqual(['ध', 'र्म']);
    expect(dharm[1].signs).toContain('reph');
    expect(dharm[1].signs).not.toContain('rakar');
    const priya = aksharas('प्रिय');
    expect(priya.map((a) => a.text)).toEqual(['प्रि', 'य']);
    expect(priya[0].signs).toContain('rakar');
    expect(priya[0].signs).not.toContain('reph');
    expect(aksharas('श्री')[0].signs).toContain('rakar');
    expect(aksharas('सूर्य')[1].signs).toContain('reph');
  });

  it('a consonant with a virama at the end of a word is a dead unit', () => {
    const sat = aksharas('सत्');
    expect(sat.map((a) => a.text)).toEqual(['स', 'त्']);
    expect(sat[1].dead).toBe(true);
    expect(sat[1].signs).toContain('virama');
    expect(sat[0].dead).toBe(false);
    expect(aksharas('विद्वान्').at(-1)?.dead).toBe(true);
    expect(aksharas('क्')[0].dead).toBe(true);
  });

  it('a virama before something that is not a consonant also leaves a dead unit', () => {
    const us = aksharas('क्ab');
    expect(us.map((a) => a.text)).toEqual(['क्', 'a', 'b']);
    expect(us[0].dead).toBe(true);
    expect(aksharas('क् का').map((a) => a.text)).toEqual(['क्', ' ', 'का']);
  });

  it('keeps the nukta: the unit has it, the consonant carries it, ज़ is not ज', () => {
    const z = aksharas(nk('ज%रूरत'));
    expect(z.map((a) => a.text)).toEqual([nk('ज%'), 'रू', 'र', 'त']);
    expect(z[0].consonants).toEqual([nk('ज%')]);
    expect(z[0].signs).toEqual(['nukta']);
    const j = aksharas('जरूरत');
    expect(j[0].consonants).toEqual(['ज']);
    expect(j[0].signs).toEqual([]);
    expect(z[0].text).not.toBe(j[0].text);
    expect(texts(nk('ज%रूरत')).join('')).not.toBe(texts('जरूरत').join(''));
  });

  it('accepts the precomposed nukta letters (U+0958–095F) and reads them as base + nukta', () => {
    for (const [pre, base] of [['क़', 'क'], ['ख़', 'ख'], ['ग़', 'ग'], ['ज़', 'ज'], ['फ़', 'फ'], ['ड़', 'ड'], ['ढ़', 'ढ']]) {
      const [a] = aksharas(pre + 'ा');
      expect(a.consonants, pre).toEqual([base + '़']);
      expect(a.signs, pre).toContain('nukta');
      expect(a.text).toBe(pre + 'ा');
    }
  });

  it('keeps ड़ and ढ़ as nukta letters of their own', () => {
    const [a] = aksharas(nk('ड%ा'));
    expect(a.consonants).toEqual([nk('ड%')]);
    expect(a.signs).toEqual(['nukta']);
    expect(texts(nk('पढ%ना'))).toEqual(['प', nk('ढ%'), 'ना']);
  });

  it('keeps zero-width joiners and non-joiners inside the unit that carries them', () => {
    const zwj = aksharas('क्‍ष');
    expect(zwj).toHaveLength(1);
    expect(zwj[0].consonants).toEqual(['क', 'ष']);
    const zwnj = aksharas('क्‌ष');
    expect(zwnj).toHaveLength(1);
    expect(zwnj[0].text).toBe('क्‌ष');
    const word = aksharas('र्‍य');
    expect(word.map((a) => a.text).join('')).toBe('र्‍य');
    expect(aksharas('‍')).toHaveLength(1);
  });

  it('knows the candra vowels', () => {
    expect(aksharas('कॉलेज').map((a) => a.text)).toEqual(['कॉ', 'ले', 'ज']);
    expect(aksharas('कॉ')[0].vowel).toBe('◌ॉ');
    expect(aksharas('ऑफ')[0].vowel).toBe('ऑ');
    expect(aksharas('ऑफ')[0].consonants).toEqual([]);
    expect(aksharas('ऍप')[0].vowel).toBe('ऍ');
    expect(aksharas('कॅ')[0].vowel).toBe('◌ॅ');
  });

  it('visarga, avagraha, digits, danda and Latin letters', () => {
    expect(aksharas('पुनः').map((a) => a.text)).toEqual(['पु', 'नः']);
    expect(aksharas('पुनः')[1].signs).toEqual(['visarga']);
    expect(aksharas('ऽ')[0].signs).toEqual(['avagraha']);
    expect(texts('१२३')).toEqual(['१', '२', '३']);
    expect(texts('ab')).toEqual(['a', 'b']);
    expect(texts('घर।')).toEqual(['घ', 'र', '।']);
    expect(aksharas('a')[0].consonants).toEqual([]);
    expect(aksharas('a')[0].vowel).toBeUndefined();
  });

  it('ऋ and ृ, ए ऐ ओ औ and their signs', () => {
    expect(texts('कृपा')).toEqual(['कृ', 'पा']);
    expect(aksharas('कृपा')[0].vowel).toBe('◌ृ');
    expect(aksharas('ऋषि')[0].vowel).toBe('ऋ');
    expect(['कै', 'कौ', 'को', 'के'].map((w) => aksharas(w)[0].vowel)).toEqual(['◌ै', '◌ौ', '◌ो', '◌े']);
  });

  it('a hundred-word run stays fast and linear', () => {
    const big = 'प्रार्थना'.repeat(5000);
    const t0 = Date.now();
    expect(aksharas(big)).toHaveLength(15000);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('hindiSearchForm', () => {
  it('folds anusvara and the homorganic nasal conjunct together', () => {
    expect(hindiSearchForm('हिन्दी')).toBe(hindiSearchForm('हिंदी'));
    expect(hindiSearchForm('सम्बन्ध')).toBe(hindiSearchForm('संबंध'));
    expect(hindiSearchForm('अण्डा')).toBe(hindiSearchForm('अंडा'));
    expect(hindiSearchForm('गङ्गा')).toBe(hindiSearchForm('गंगा'));
    expect(hindiSearchForm('पञ्च')).toBe(hindiSearchForm('पंच'));
    expect(hindiSearchForm('हिन्दी')).toBe('हिंदी');
  });

  it('folds chandrabindu to anusvara and drops zero-width joiners and the nukta', () => {
    expect(hindiSearchForm('माँ')).toBe('मां');
    expect(hindiSearchForm('हूँ')).toBe(hindiSearchForm('हूं'));
    expect(hindiSearchForm(nk('ज%रूरत'))).toBe('जरूरत');
    expect(hindiSearchForm(nk('ड%का'))).toBe('डका');
    expect(hindiSearchForm('क्‍ष')).toBe('क्ष');
    expect(hindiSearchForm('क्‌ष')).toBe('क्ष');
  });

  it('does not fold a nasal conjunct that is not homorganic, nor ordinary words', () => {
    expect(hindiSearchForm('अन्य')).toBe('अन्य');
    expect(hindiSearchForm('जन्म')).toBe('जन्म');
    expect(hindiSearchForm('कमल')).toBe('कमल');
    expect(hindiSearchForm('कन्नड़')).toBe(hindiSearchForm('कन्नड़'));
    expect(hindiSearchForm('')).toBe('');
  });

  it('is idempotent', () => {
    for (const w of WORDS) expect(hindiSearchForm(hindiSearchForm(w)), w).toBe(hindiSearchForm(w));
  });

  it('is not the form\'s identity: the form itself keeps its nukta and its conjunct', () => {
    expect(hindiSearchForm(nk('ज%रूरत'))).not.toBe(nk('ज%रूरत'));
    expect(hindiSearchForm('हिन्दी')).not.toBe('हिन्दी');
  });
});

describe('hindiSpellingVariants', () => {
  it('anusvara and the homorganic nasal conjunct', () => {
    expect(hindiSpellingVariants('हिंदी')).toEqual(['हिन्दी']);
    expect(hindiSpellingVariants('हिन्दी')).toEqual(['हिंदी']);
    expect(hindiSpellingVariants('अंडा')).toEqual(['अण्डा']);
    expect(hindiSpellingVariants('गंगा')).toContain('गङ्गा');
    expect(hindiSpellingVariants('पंच')).toContain('पञ्च');
    expect(hindiSpellingVariants('संबंध').sort()).toEqual(['संबन्ध', 'सम्बंध', 'सम्बन्ध'].sort());
    expect(hindiSpellingVariants('सम्बन्ध')).toContain('संबंध');
  });

  it('never turns anusvara into a nasal conjunct before य र ल व श ष स ह', () => {
    for (const w of ['संयम', 'संरचना', 'संलग्न', 'संवाद', 'वंश', 'संसार', 'सिंह', 'संहार']) expect(hindiSpellingVariants(w), w).toEqual([]);
  });

  it('ँ and ं: where a vowel sign above the line leaves no room, ं stays', () => {
    for (const w of ['हैं', 'में', 'नहीं', 'वहीं', 'सिंह', 'मैं']) expect(hindiSpellingVariants(w), w).toEqual([]);
  });

  it('ँ and ं: forms written with ँ have the ं spelling, and back where there is room', () => {
    expect(hindiSpellingVariants('हूँ')).toEqual(['हूं']);
    expect(hindiSpellingVariants('हूं')).toEqual(['हूँ']);
    expect(hindiSpellingVariants('माँ')).toEqual(['मां']);
    expect(hindiSpellingVariants('यहाँ')).toEqual(['यहां']);
    expect(hindiSpellingVariants('यहां')).toEqual(['यहाँ']);
    expect(hindiSpellingVariants(nk('लड%कियाँ'))).toEqual([nk('लड%कियां')]);
    expect(hindiSpellingVariants('आँख')).toContain('आंख');
    expect(hindiSpellingVariants('मुँह')).toContain('मुंह');
  });

  it('हंस (swan) and हँस (laugh) are different words and are not related', () => {
    expect(hindiSpellingVariants('हंस')).toEqual([]);
    expect(hindiSpellingVariants('हँस')).toEqual([]);
  });

  it('the y-glide of verb forms and a few words', () => {
    expect(hindiSpellingVariants('गई')).toEqual(['गयी']);
    expect(hindiSpellingVariants('गयी')).toEqual(['गई']);
    expect(hindiSpellingVariants('नई')).toEqual(['नयी']);
    expect(hindiSpellingVariants('हुई')).toEqual(['हुयी']);
    expect(hindiSpellingVariants('गए')).toEqual(['गये']);
    expect(hindiSpellingVariants('आए')).toEqual(['आये']);
    expect(hindiSpellingVariants('आये')).toEqual(['आए']);
    expect(hindiSpellingVariants('चाहिए')).toEqual(['चाहिये']);
    expect(hindiSpellingVariants('लिए')).toEqual(['लिये']);
    expect(hindiSpellingVariants('दिए')).toEqual(['दिये']);
    expect(hindiSpellingVariants('नए')).toEqual(['नये']);
    expect(hindiSpellingVariants('आएगा')).toEqual(['आयेगा']);
    expect(hindiSpellingVariants('दाएँ')).toContain('दायें');
  });

  it('the y-glide never touches nouns that merely end like a verb, nor the word ये', () => {
    for (const w of ['भाई', 'मिठाई', 'लड़ाई', 'पढ़ाई', 'सफ़ाई', 'ये', 'एक', 'प्रत्येक', 'ऐसा', 'सुई', 'खाई']) expect(hindiSpellingVariants(w), w).toEqual([]);
  });

  it('a nukta dropped from the five letters where both spellings circulate, and added back on listed words', () => {
    expect(hindiSpellingVariants(nk('ज%रूरत'))).toEqual(['जरूरत']);
    expect(hindiSpellingVariants('जरूरत')).toEqual([nk('ज%रूरत')]);
    expect(hindiSpellingVariants(nk('फ%ोन'))).toEqual(['फोन']);
    expect(hindiSpellingVariants('फोन')).toEqual([nk('फ%ोन')]);
    expect(hindiSpellingVariants(nk('क%ानून'))).toContain('कानून');
    expect(hindiSpellingVariants(nk('ख%बर'))).toContain('खबर');
    expect(hindiSpellingVariants(nk('ग%लत'))).toContain('गलत');
    expect(hindiSpellingVariants(nk('ज%रूरतें'))).toContain('जरूरतें');
    expect(hindiSpellingVariants('जरूरतें')).toContain(nk('ज%रूरतें'));
  });

  it('never relates ड़ ढ़ to ड ढ, and never adds a nukta to an ordinary word', () => {
    expect(hindiSpellingVariants(nk('लड%का'))).toEqual([]);
    expect(hindiSpellingVariants('लडका')).toEqual([]);
    expect(hindiSpellingVariants(nk('पढ%ना'))).toEqual([]);
    expect(hindiSpellingVariants('फल')).toEqual([]);
    expect(hindiSpellingVariants('फूल')).toEqual([]);
    expect(hindiSpellingVariants('फिर')).toEqual([]);
    expect(hindiSpellingVariants('कमल')).toEqual([]);
    expect(hindiSpellingVariants('गमला')).toEqual([]);
    expect(hindiSpellingVariants('जल')).toEqual([]);
  });

  it('combines independent families on one word', () => {
    const v = hindiSpellingVariants(nk('ज%िंदगी'));
    expect(v).toContain(nk('ज%िन्दगी'));
    expect(v).toContain('जिंदगी');
    expect(v).toContain('जिन्दगी');
  });

  it('is empty for words with no variant, for non-Devanagari text and for the empty string', () => {
    for (const w of ['घर', 'कमल', 'किताब', 'पानी', 'abc', '', '१२३', 'आदमी']) expect(hindiSpellingVariants(w), w).toEqual([]);
  });

  it('is symmetric and never includes the form itself', () => {
    const more = ['हिंदी', 'हिन्दी', 'संबंध', 'सम्बन्ध', 'अंडा', 'हूँ', 'हूं', 'माँ', 'मां', 'यहाँ', 'यहां', 'गई', 'गयी', 'नई', 'आए', 'आये', 'चाहिए', 'चाहिये', 'लिए', 'जाएँगे',
      'जायेंगे', 'आएंगे', 'दाएँ', 'आँख', 'आंख', 'मुँह', 'गंगा', 'गङ्गा', 'पंच', 'चिंता', 'चिन्ता', 'सम्पर्क', 'संपर्क', 'कम्पनी', 'कंपनी', 'काँच', 'कांच', 'हँस', 'हंस',
      nk('ज%िंदगी'), nk('ज%रूरत'), 'जरूरत', nk('ग%ज%ल'), 'गजल', nk('फ%ायदा'), 'फायदा', nk('ख%ुशी'), 'खुशी', nk('क%ीमत'), nk('सब्ज%ी'), nk('बाज%ार'), 'बाजार', nk('इंतज%ार'), 'इंतजार', ...WORDS];
    for (const a of more) {
      const f = a.normalize('NFC');
      const vs = hindiSpellingVariants(f);
      expect(vs, a).not.toContain(f);
      expect(new Set(vs).size, a).toBe(vs.length);
      for (const b of vs) {
        expect(b, `${a} -> ${b}`).toBe(b.normalize('NFC'));
        expect(hindiSpellingVariants(b), `${b} should relate back to ${a}`).toContain(f);
      }
    }
  });

  it('puts the single-change variants before the many-change ones', () => {
    const v = hindiSpellingVariants('संबंध');
    expect(v[v.length - 1]).toBe('सम्बन्ध');
  });
});
