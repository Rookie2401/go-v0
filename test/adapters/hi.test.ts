import { describe, expect, it } from 'vitest';
import { adapter, applySuggestion, best, errors, indexOf, patterns, phrases, run, words } from './helpers';
import { hiNumberToWords } from '../../src/adapters/hi';

const hi = adapter('hi');

describe('Hindi adapter', () => {
  it('keeps combining marks inside tokens: किया is one token; so are हूँ, क्षमा, विश्वासयोग्य', () => {
    const r = run('hi', 'उसने काम किया।');
    expect(words(r)).toEqual(['उसने', 'काम', 'किया']);
    expect(r.tokens.find((t) => t.surface === 'किया')).toBeTruthy();
    expect(words(run('hi', 'मैं ठीक हूँ।'))).toEqual(['मैं', 'ठीक', 'हूँ']);
    expect(words(run('hi', 'क्षमा और विश्वासयोग्य'))).toEqual(['क्षमा', 'और', 'विश्वासयोग्य']);
  });

  it('no word token ever starts with a combining mark, and the danda is punctuation', () => {
    for (const text of ['क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा।', 'परन्तु अनन्त जीवन पाए।', 'मैं पूरे दिल से परमेश्वर पर विश्वास करता हूँ।']) {
      const r = run('hi', text);
      r.tokens.filter((t) => t.isWord).forEach((t) => expect(/^\p{M}/u.test(t.surface)).toBe(false));
      const danda = r.tokens[r.tokens.length - 1];
      expect(danda.surface).toBe('।');
      expect(danda.isWord).toBe(false);
    }
  });

  it('NFC identity keeps nukta letters decomposed (canonical form) and is not case-folded', () => {
    expect(hi.normalize('क़')).toBe('क़'); // क़ precomposed → क + nukta
    expect(hi.normalize('पाप')).toBe('पाप');
  });

  it('tags postpositions ADP, the ergative ने and oblique forms', () => {
    const r = run('hi', 'परमेश्वर ने पापों को क्षमा किया।');
    expect(best(r, 'ने').pos).toBe('ADP');
    expect(best(r, 'ने').morph).toMatchObject({ Case: 'Erg' });
    expect(best(r, 'को').pos).toBe('ADP');
    expect(best(r, 'पापों').morph).toMatchObject({ Case: 'Obl', Number: 'Plur' });
    expect(best(run('hi', 'मैंने'), 'मैंने').morph).toMatchObject({ Case: 'Erg', Person: '1' });
    expect(best(run('hi', 'मेरे दिल में'), 'मेरे').morph.Case).toBe('Obl'); // oblique before the postposition में
  });

  it('पर is ADP before a noun-phrase and CONJ after a comma', () => {
    expect(best(run('hi', 'परमेश्वर पर विश्वास'), 'पर').pos).toBe('ADP');
    expect(best(run('hi', 'ठीक हूँ, पर बात'), 'पर').pos).toBe('CONJ');
  });

  it('detects compound verbs as phrases (कर दिया, कर लिया, हो गया)', () => {
    const pats = (t: string) => phrases('hi', t).map((p) => p.pattern.join(' '));
    expect(pats('परमेश्वर ने मेरा पाप क्षमा कर दिया।')).toEqual(expect.arrayContaining(['कर देना', 'क्षमा करना']));
    expect(pats('अब मैंने परमेश्वर पर विश्वास कर लिया है।')).toContain('कर लेना');
    expect(pats('मेरा दिल शांत हो गया।')).toContain('हो जाना');
  });

  it('detects "when I was young", "began to understand", "believe in" (story and Bible wording)', () => {
    const pats = (t: string) => phrases('hi', t).map((p) => p.pattern.join(' '));
    expect(pats('जब मैं छोटा था, मेरे दिल में पाप था।')).toContain('जब _ छोटा होना');
    expect(pats('एक दिन मैं अपना पाप समझने लगा।')).toContain('समझना लगना');
    expect(pats('मैं परमेश्वर पर विश्वास नहीं करता था।')).toContain('_ पर विश्वास');
    expect(pats('ताकि जो कोई उस पर विश्वास करे वह नाश न हो')).toContain('_ पर विश्वास');
  });

  it('detects ergative ने, -ता था and postposition patterns', () => {
    expect(patterns('hi', 'परमेश्वर ने मेरा पाप क्षमा किया।').map((p) => p.key)).toContain('ergative-ne');
    expect(patterns('hi', 'मैं नहीं समझता था।').map((p) => p.key)).toContain('past-imperfective');
    expect(patterns('hi', 'मेरे दिल में पाप था।').map((p) => p.key)).toContain('postposition');
  });

  it('segments on the danda with exact spans', () => {
    const t = 'मैं समझता हूँ। परमेश्वर क्षमा करता है। क्या आप समझते हैं?';
    const spans = hi.segmentSentences(t);
    expect(spans.map((s) => s.text)).toEqual(['मैं समझता हूँ।', 'परमेश्वर क्षमा करता है।', 'क्या आप समझते हैं?']);
    spans.forEach((s) => expect(t.slice(s.start, s.end)).toBe(s.text));
  });

  it('pronunciation: schwa-deletion and nasalization notes; romanization only from the lexicon', () => {
    const r = run('hi', 'पाप हूँ');
    expect(hi.pronunciation(r.tokens[0], r.analyses[0]).notes?.join(' ')).toMatch(/schwa/);
    expect(hi.pronunciation(r.tokens[1], r.analyses[1]).notes?.join(' ')).toMatch(/nasalizes/);
    const d = run('hi', 'दिल');
    expect(hi.pronunciation(d.tokens[0], d.analyses[0]).transliteration).toBe('dil');
    const u = run('hi', 'कंप्यूटर');
    expect(u.analyses[0].candidates).toEqual([]);
    expect(hi.pronunciation(u.tokens[0], u.analyses[0]).transliteration).toBeUndefined();
  });

  it('relate: forms of one lemma are inflections', () => {
    expect(hi.relate('समझता', 'समझने')).toBe('inflection');
    expect(hi.relate('पाप', 'पापों')).toBe('inflection');
    expect(hi.relate('पाप', 'दिल')).toBe('none');
  });

  describe('checkProduction', () => {
    it('flags ने with an imperfective verb (no suggestion: conservative)', () => {
      const e = errors('hi', 'मैंने काम करता');
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('postposition');
      expect(e[0].suggestion).toBeUndefined();
      expect(errors('hi', 'मैंने काम किया')).toEqual([]);
      expect(errors('hi', 'मैंने परमेश्वर पर विश्वास कर लिया है')).toEqual([]);
      expect(errors('hi', 'मैं काम करता हूँ')).toEqual([]);
    });
    it('flags adjective–noun gender disagreement and suggests the agreeing form', () => {
      const e = errors('hi', 'छोटा बात');
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('agreement');
      expect(applySuggestion('छोटा बात', e[0].suggestion!)).toBe('छोटी बात');
      expect(errors('hi', 'छोटी बात')).toEqual([]);
      expect(errors('hi', 'छोटा घर')).toEqual([]);
      expect(errors('hi', 'शांत दिल')).toEqual([]); // invariable adjective
    });
  });

  describe('speechNormalize', () => {
    it('converts Devanagari digits and expands small numbers; larger ones are left and recorded', () => {
      const r = hi.speechNormalize('मेरे पास ३ किताबें [16] और २५ घर हैं।', { isScripture: true });
      expect(r.speechText).toBe('मेरे पास तीन किताबें और 25 घर हैं।');
      expect(r.transformations.map((t) => t.description).join('|')).toMatch(/left unexpanded.*25/);
      expect(r.normalizerVersion).toBe('speech-hi@1');
      expect(/[A-Za-z]/.test(r.speechText)).toBe(false); // never transliterates
    });
    it('number words 0–20 only', () => {
      expect(hiNumberToWords(0)).toBe('शून्य');
      expect(hiNumberToWords(20)).toBe('बीस');
      expect(hiNumberToWords(21)).toBeNull();
    });
  });

  it('indexOf helper sanity', () => {
    expect(indexOf(run('hi', 'मैं दिल'), 'दिल')).toBe(1);
  });
});
