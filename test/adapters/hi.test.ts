import { describe, expect, it } from 'vitest';
import { adapter, applySuggestion, best, errors, indexOf, patterns, phrases, run, words } from './helpers';
import { hiNumberToWords } from '../../src/adapters/hi';
import { transliterateHindi } from '../../src/adapters/hindi/translit';

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
    expect(hi.normalize(String.fromCodePoint(0x0958))).toBe(String.fromCodePoint(0x0915, 0x093c)); // the precomposed letter (U+0958) becomes क + nukta (U+0915 U+093C)
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
    // CHANGED: the phrase module writes a pattern in lemmas (करना देना); the adapter's own fallback rule writes कर देना.
    // Either is the compound verb; which one appears depends on whether the module is installed.
    const pats = (t: string) => phrases('hi', t).map((p) => p.pattern.join(' '));
    const either = (list: string[], a: string, b: string) => expect(list.includes(a) || list.includes(b), `${a} / ${b} in: ${list.join(' | ')}`).toBe(true);
    const first = pats('परमेश्वर ने मेरा पाप क्षमा कर दिया।');
    either(first, 'कर देना', 'करना देना');
    expect(first).toContain('क्षमा करना');
    either(pats('अब मैंने परमेश्वर पर विश्वास कर लिया है।'), 'कर लेना', 'करना लेना');
    either(pats('मेरा दिल शांत हो गया।'), 'हो जाना', 'होना जाना');
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
    // CHANGED: the construction module names the habitual past 'habitual-past'; the adapter's fallback names it 'past-imperfective'.
    const past = patterns('hi', 'मैं नहीं समझता था।').map((p) => p.key);
    expect(past.includes('past-imperfective') || past.includes('habitual-past'), past.join(' ')).toBe(true);
    // CHANGED: with the construction module installed the sentence gets the module's own patterns (genitive agreement,
    // oblique before a postposition …) instead of the fallback key 'postposition'; either way the postposition में is covered.
    const post = patterns('hi', 'मेरे दिल में पाप था।');
    expect(post.length).toBeGreaterThan(0);
    const toks = run('hi', 'मेरे दिल में पाप था।').tokens;
    const mein = toks.findIndex((t) => t.surface === 'में');
    expect(post.some((p) => p.key === 'postposition' || p.tokenIndexes.includes(mein)), post.map((p) => p.key).join(' ')).toBe(true);
  });

  it('segments on the danda with exact spans', () => {
    const t = 'मैं समझता हूँ। परमेश्वर क्षमा करता है। क्या आप समझते हैं?';
    const spans = hi.segmentSentences(t);
    expect(spans.map((s) => s.text)).toEqual(['मैं समझता हूँ।', 'परमेश्वर क्षमा करता है।', 'क्या आप समझते हैं?']);
    spans.forEach((s) => expect(t.slice(s.start, s.end)).toBe(s.text));
  });

  it('pronunciation: schwa-deletion and nasalization notes; a romanization only where the transliteration module is sure of it', () => {
    const r = run('hi', 'पाप हूँ');
    expect(hi.pronunciation(r.tokens[0], r.analyses[0]).notes?.join(' ')).toMatch(/schwa/);
    expect(hi.pronunciation(r.tokens[1], r.analyses[1]).notes?.join(' ')).toMatch(/nasalizes/);
    const d = run('hi', 'दिल');
    // CHANGED: the romanization comes from the transliteration module alone, and only when it is sure (the old hand table is gone);
    // with the module as a stub there is none
    const dilTr = transliterateHindi('दिल');
    expect(hi.pronunciation(d.tokens[0], d.analyses[0]).transliteration).toBe(dilTr.confidence >= 0.6 && dilTr.text ? dilTr.text : undefined);
    // CHANGED: a word outside the list gets either no reading or rule readings flagged unconfirmed, never a confident guess;
    // the transliteration module may now romanize it (by rule), or say nothing when it is not sure.
    const u = run('hi', 'कंप्यूटर');
    for (const c of u.analyses[0].candidates) {
      expect(c.unconfirmed, 'a guess is flagged').toBe(true);
      expect(c.confidence).toBeLessThanOrEqual(0.6);
      expect(c.gloss).toBeUndefined();
    }
    const tr = hi.pronunciation(u.tokens[0], u.analyses[0]).transliteration;
    expect(tr === undefined || typeof tr === 'string').toBe(true);
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
