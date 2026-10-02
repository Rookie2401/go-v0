/**
 * Hindi transliteration (package H1), ISO 15919 of the word as said. The examples are the author's own,
 * machine-drafted from general knowledge of Hindi; none has been checked by a native speaker.
 * "%" in a literal stands for the nukta (U+093C).
 */
import { describe, expect, it } from 'vitest';
import { transliterateHindi } from '../../src/adapters/hindi/translit';
import { decodeHindi } from '../../src/adapters/hindi/pronunciation';

const nk = (s: string): string => s.replace(/%/g, '़');
const t = (w: string): string => transliterateHindi(nk(w)).text;

describe('transliterateHindi: the word as said', () => {
  const PLAIN: Array<[string, string]> = [
    ['कमल', 'kamal'], ['घर', 'ghar'], ['किताब', 'kitāb'], ['पानी', 'pānī'], ['खाना', 'khānā'], ['सीता', 'sītā'], ['बहुत', 'bahut'],
    ['दुनिया', 'duniyā'], ['कैसे', 'kaise'], ['सब', 'sab'], ['जब', 'jab'], ['नाम', 'nām'], ['और', 'aur'], ['ओर', 'or'], ['ऐसा', 'aisā'],
    ['बच्चा', 'baccā'], ['अच्छा', 'acchā'], ['दिल्ली', 'dillī'], ['उत्तम', 'uttam'], ['विष्णु', 'viṣṇu'], ['क्षमा', 'kṣamā'],
    ['श्री', 'śrī'], ['प्रेम', 'prem'],
  ];
  it.each(PLAIN)('%s -> %s', (w, r) => { expect(t(w)).toBe(r); });

  const DROPPED: Array<[string, string]> = [
    ['लड%का', 'laṛkā'], ['करना', 'karnā'], ['समझना', 'samajhnā'], ['आदमी', 'ādmī'], ['सड%क', 'saṛak'], ['समझता', 'samajhtā'],
    ['कहलाना', 'kahlānā'], ['प्रार्थना', 'prārthnā'], ['सरकार', 'sarkār'], ['कमरा', 'kamrā'], ['मतलब', 'matlab'], ['भगवान', 'bhagvān'],
    ['पढ%ना', 'paṛhnā'], ['धर्म', 'dharm'], ['शब्द', 'śabd'], ['सत्', 'sat'],
  ];
  it.each(DROPPED)('%s -> %s (the a that is not said is not written)', (w, r) => { expect(t(w)).toBe(r); });

  const NASALS: Array<[string, string]> = [
    ['हिंदी', 'hindī'], ['संबंध', 'sambandh'], ['अंक', 'aṅk'], ['पंच', 'pañc'], ['अंडा', 'aṇḍā'], ['नहीं', 'nahīṁ'], ['में', 'meṁ'],
    ['हैं', 'haiṁ'], ['माँ', 'māṁ'], ['यहाँ', 'yahāṁ'], ['सिंह', 'siṁh'], ['संस्कृत', 'saṁskr̥t'], ['पुनः', 'punaḥ'],
  ];
  it.each(NASALS)('%s -> %s', (w, r) => { expect(t(w)).toBe(r); });

  const BORROWED: Array<[string, string]> = [
    ['क%ानून', 'qānūn'], ['ख%बर', 'ḵẖabar'], ['ग%लत', 'ġalat'], ['ज%रूरत', 'zarūrat'], ['फ%ोन', 'fon'], ['ज्ञान', 'jñān'],
    ['ऋषि', 'r̥ṣi'], ['कॉलेज', 'kôlej'], ['बड%ा', 'baṛā'],
  ];
  it.each(BORROWED)('%s -> %s', (w, r) => { expect(t(w)).toBe(r); });

  it('digits are read as digits', () => {
    expect(t('१२३')).toBe('123');
  });
});

describe('transliterateHindi: confidence', () => {
  it('is the lowest unit confidence, high for plain words', () => {
    for (const w of ['कमल', 'घर', 'करना', 'समझता', 'हिंदी', 'सीता', 'बहुत']) {
      const r = transliterateHindi(w);
      const min = Math.min(...decodeHindi(w).map((u) => u.confidence));
      expect(r.confidence, w).toBe(min);
      expect(r.confidence, w).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('an uncertain a is written and the confidence falls below 0.6, so the adapter would not offer it', () => {
    for (const [w, r] of [['अनुमति', 'anumati'], ['उपयोग', 'upayog'], ['मित्र', 'mitra'], ['सत्य', 'satya'], ['वाक्य', 'vākya'], ['उपहार', 'upahār'], ['राष्ट्र', 'rāṣṭra']] as const) {
      const out = transliterateHindi(w);
      expect(out.text, w).toBe(r);
      expect(out.confidence, w).toBeLessThan(0.6);
    }
  });

  it('a dropped a at a final conjunct is written without it, with a lower confidence than a plain ending', () => {
    expect(transliterateHindi('धर्म').confidence).toBeLessThan(transliterateHindi('कमल').confidence);
    expect(transliterateHindi('धर्म').confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('empty for text that cannot be read: empty string, Latin letters, a mix', () => {
    expect(transliterateHindi('')).toEqual({ text: '', confidence: 0 });
    expect(transliterateHindi('abc')).toEqual({ text: '', confidence: 0 });
    expect(transliterateHindi('कa')).toEqual({ text: '', confidence: 0 });
    expect(transliterateHindi('कमल!')).toEqual({ text: '', confidence: 0 });
  });

  it('follows the exception list: the word as listed, not as the rules would say', () => {
    expect(transliterateHindi('मुसलमान').text).toBe('musalmān');
    expect(transliterateHindi('दोपहर').text).toBe('dopahar');
  });

  it('is deterministic and does not change its input', () => {
    const w = 'प्रार्थना';
    expect(transliterateHindi(w)).toEqual(transliterateHindi(w));
    expect(w).toBe('प्रार्थना');
  });
});
