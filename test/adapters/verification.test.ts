/**
 * Language verification points (PLAN2 A2 item 8): Thai, Hindi, German, Albanian, Spanish — plus the honest
 * `support` declaration and `analysisCoverage`.
 */
import { describe, expect, it } from 'vitest';
import { LANGUAGES, type AdapterSupport, type SupportLevel } from '../../src/core';
import { analysisCoverage } from '../../src/adapters';
import { segmentThaiSentences } from '../../src/adapters/th';
import { analyzeSpanishForm } from '../../src/adapters/spanish/morphology';
import { adapter, best, errors, patterns, run, words } from './helpers';

const LEVELS: SupportLevel[] = ['dependable', 'limited', 'seed-only', 'none'];

describe('AdapterSupport — honest, on every adapter', () => {
  it('every adapter declares all six levels and plain-language limitations', () => {
    for (const l of LANGUAGES) {
      const s: AdapterSupport = adapter(l).support;
      for (const k of ['tokenization', 'sentenceSegmentation', 'lemmatization', 'morphology', 'phraseDetection', 'productionChecks'] as const) {
        expect(LEVELS, `${l}.${k}`).toContain(s[k]);
      }
      expect(s.limitations.length, l).toBeGreaterThanOrEqual(3);
      for (const x of s.limitations) expect(x.length).toBeGreaterThan(20);
    }
  });

  it('lemmatization is seed-only everywhere, and every adapter says so in its limitations', () => {
    for (const l of LANGUAGES) {
      expect(adapter(l).support.lemmatization, l).toBe('seed-only');
      expect(adapter(l).support.limitations.join(' '), l).toMatch(/seed-only|seed corpus|bundled corpus/i);
      expect(adapter(l).support.productionChecks, l).not.toBe('dependable'); // a few rules are not a grammar checker
    }
  });

  it('nothing is claimed dependable beyond tokenization', () => {
    for (const l of LANGUAGES) {
      const s = adapter(l).support;
      for (const k of ['sentenceSegmentation', 'lemmatization', 'morphology', 'phraseDetection', 'productionChecks'] as const) expect(s[k], `${l}.${k}`).not.toBe('dependable');
    }
    expect(adapter('th').support.tokenization).toBe('limited');
    expect(adapter('th').support.limitations.join(' ')).toMatch(/newline/);
  });
});

describe('analysisCoverage(tokens, analyses)', () => {
  it('counts word tokens with a candidate; punctuation and numerals are not words; lists the unknown forms once', () => {
    const r = run('es', 'Dios ama zzyzx, zzyzx y 3 cosas.');
    const c = analysisCoverage(r.tokens, r.analyses);
    expect(c.words).toBe(6); // Dios ama Zzyzx Zzyzx y cosas
    expect(c.analysed).toBe(4);
    expect(c.coverage).toBeCloseTo(4 / 6);
    expect(c.unanalysed).toEqual(['zzyzx']);
  });
  it('an empty text is fully covered (nothing to analyse)', () => {
    expect(analysisCoverage([], [])).toEqual({ words: 0, analysed: 0, coverage: 1, unanalysed: [] });
  });
});

describe('Thai: segmentation and sentence boundaries never add or need spaces', () => {
  const th = adapter('th');
  const strip = (s: string) => s.replace(/\s+/gu, '');

  it('tokenizes text written without any spaces, and a spaced clause pause changes no word', () => {
    const plain = 'ฉันไม่เข้าใจหัวใจของฉัน';
    const spaced = 'ฉันไม่เข้าใจ หัวใจของฉัน';
    const a = th.tokenize(plain).map((t) => t.surface);
    const b = th.tokenize(spaced).map((t) => t.surface);
    expect(a.length).toBeGreaterThan(4);
    expect(b).toEqual(a);
    for (const toks of [th.tokenize(plain), th.tokenize(spaced)]) for (const t of toks) expect(/\s/u.test(t.surface)).toBe(false);
  });

  it('token surfaces re-join to the text minus whitespace: nothing is added, nothing dropped but spaces', () => {
    for (const text of ['พระเจ้าทรงรักโลก', 'ตอนที่ฉันยังเด็ก ฉันไม่เข้าใจหัวใจของฉัน', 'สบายดีครับ แต่ผมไม่เข้าใจเรื่องหนึ่ง']) {
      const toks = th.tokenize(text);
      expect(toks.map((t) => t.surface).join('')).toBe(strip(text));
      for (const t of toks) expect(text.slice(t.start, t.end)).toBe(t.surface);
    }
  });

  it('sentence spans are exact slices; a newline or a double space separates sentences, a lone space does not', () => {
    const text = 'ฉันรักพระเจ้า\nผมเชื่อในพระเจ้า  ขอบคุณครับ';
    const spans = th.segmentSentences(text);
    expect(spans.map((s) => s.text)).toEqual(['ฉันรักพระเจ้า', 'ผมเชื่อในพระเจ้า', 'ขอบคุณครับ']);
    for (const s of spans) { expect(text.slice(s.start, s.end)).toBe(s.text); expect(s.text).toBe(s.text.trim()); }
    // a single space is a clause pause: one sentence
    expect(th.segmentSentences('ฉันรักพระเจ้า ตอนนี้ฉันสบายดี').map((s) => s.text)).toEqual(['ฉันรักพระเจ้า ตอนนี้ฉันสบายดี']);
    // …except straight after a sentence-final particle
    expect(th.segmentSentences('สบายดีครับ ขอบคุณ').map((s) => s.text)).toEqual(['สบายดีครับ', 'ขอบคุณ']);
    expect(segmentThaiSentences('ฯลฯ ก็ดี').length).toBe(1);
  });

  it('a sentence is never padded or modified by segmentation: concatenating spans with their original gaps reproduces the text', () => {
    const text = 'ผมเชื่อในพระเจ้า\nฉันรักพระเจ้า  ขอบคุณครับ';
    const spans = th.segmentSentences(text);
    let rebuilt = '';
    let cursor = 0;
    for (const s of spans) { rebuilt += text.slice(cursor, s.start) + s.text; cursor = s.end; }
    rebuilt += text.slice(cursor);
    expect(rebuilt).toBe(text);
  });
});

describe('Hindi: grapheme integrity, combining marks, danda and double danda', () => {
  const hi = adapter('hi');
  const seg = new Intl.Segmenter('hi', { granularity: 'grapheme' });
  const boundaries = (text: string) => new Set([...[...seg.segment(text)].map((x) => x.index), text.length]);
  const SAMPLES = [
    'क़ुरबानी ज़िंदगी फ़िर ख़ुदा', // nukta letters (precomposed U+0958… are NFC-decomposed; both spellings)
    'मैं ठीक हूँ, आँख में पाँच बातें।', // chandrabindu, anusvara
    'क्षमा विश्वास श्रीमान ज्ञान द्वार प्रेम', // conjuncts
    'परमेश्वर ने जगत से ऐसा प्रेम रखा कि उसने अपना एकलौता पुत्र दे दिया।',
    'यदि हम कहें, कि हम में कुछ पाप नहीं, तो अपने आप को धोखा देते हैं॥',
    'क्‌ष क्‍ष', // halant + ZWNJ / ZWJ
  ];

  it('no token and no sentence span starts or ends inside a grapheme cluster (samples and every bundled Hindi text)', () => {
    const texts = [...SAMPLES];
    const corpus = import.meta.glob('../../data/corpus/hi/*.json', { eager: true, import: 'default' }) as Record<string, { sections: Array<{ paragraphs: Array<{ sentences?: Array<{ text: string }> }> }> }>;
    for (const d of Object.values(corpus)) for (const s of d.sections) for (const p of s.paragraphs) for (const x of p.sentences ?? []) texts.push(x.text);
    expect(texts.length).toBeGreaterThan(20);
    for (const text of texts) {
      const b = boundaries(text);
      for (const t of hi.tokenize(text)) {
        expect(b.has(t.start), `${text} token ${t.surface} start`).toBe(true);
        expect(b.has(t.end), `${text} token ${t.surface} end`).toBe(true);
        expect(text.slice(t.start, t.end)).toBe(t.surface);
      }
      for (const sp of hi.segmentSentences(text)) {
        expect(b.has(sp.start), `${text} span start`).toBe(true);
        expect(b.has(sp.end), `${text} span end`).toBe(true);
      }
    }
  });

  it('nukta, chandrabindu, matras and virama stay inside the word token', () => {
    expect(words(run('hi', 'मैं ठीक हूँ')).includes('हूँ')).toBe(true);
    const r = run('hi', 'क्षमा और विश्वास');
    expect(words(r)).toEqual(['क्षमा', 'और', 'विश्वास']);
    const nukta = 'ज़िंदगी'; // ज + nukta (NFC stores ज + U+093C)
    expect(words(run('hi', nukta))).toEqual([nukta.normalize('NFC')]);
  });

  it('danda । and double danda ॥ end a sentence, stay attached to it and are not words', () => {
    const text = 'यदि हम कहें। वह नहीं आया॥ फिर वह गया।';
    const spans = hi.segmentSentences(text);
    expect(spans.map((s) => s.text)).toEqual(['यदि हम कहें।', 'वह नहीं आया॥', 'फिर वह गया।']);
    for (const s of spans) expect(text.slice(s.start, s.end)).toBe(s.text);
    for (const s of spans) {
      const toks = hi.tokenize(s.text);
      const last = toks[toks.length - 1];
      expect(['।', '॥']).toContain(last.surface);
      expect(last.isWord).toBe(false);
    }
    // a verse-end double danda followed by a line break
    expect(hi.segmentSentences('परमेश्वर प्रेम है॥\nवह पाप क्षमा करता है।').map((s) => s.text)).toEqual(['परमेश्वर प्रेम है॥', 'वह पाप क्षमा करता है।']);
  });

  it('spans of author analysis must respect graphemes (the validator uses the same segmenter)', () => {
    const text = 'वह नहीं है।';
    const b = boundaries(text);
    const nahin = hi.tokenize(text).find((t) => t.surface === 'नहीं')!;
    expect(b.has(nahin.start) && b.has(nahin.end)).toBe(true);
    expect(b.has(nahin.start + 2)).toBe(false); // न | ह ी ं — cutting after ह splits the cluster
  });
});

describe('German: inflection and separable constructions', () => {
  const de = adapter('de');

  it('relate(): inflected forms share a lemma, umlaut plurals too; compounds relate to their parts', () => {
    expect(de.relate('Sünde', 'Sünden')).toBe('inflection');
    expect(de.relate('Herz', 'Herzen')).toBe('inflection');
    expect(de.relate('Haus', 'Häuser')).toBe('inflection');
    expect(de.relate('glaube', 'glauben')).toBe('inflection');
    expect(de.relate('fing', 'anfangen')).toBe('inflection');
    expect(de.relate('vergibt', 'vergab')).toBe('inflection');
    expect(de.relate('Gotteshaus', 'Haus')).toBe('component');
    expect(de.relate('Sünde', 'Herz')).toBe('none');
    expect(de.relate('SÜNDE', 'sünde')).toBe('same'); // identity is case-folded, umlauts kept
    expect(de.relate('Sunde', 'Sünde')).toBe('none'); // ü ≠ u
  });

  it('inflected forms carry case and number (ambiguous article forms report a union, not a guess)', () => {
    const r = run('de', 'Gott hat die Sünden vergeben.');
    expect(best(r, 'Sünden').lemma).toBe('Sünde');
    expect(best(r, 'Sünden').morph.Number).toBe('Plur');
    expect(best(r, 'die').morph.Case).toBe('Nom,Acc'); // a union is written in the order Nom, Acc, Dat, Gen (docs/PLAN11.md)
    expect(best(run('de', 'mit ganzem Herzen'), 'Herzen').lemma).toBe('Herz');
  });

  it('finds the separable prefix across the sentence: fing … an, fängt … an, anzufangen, angefangen', () => {
    const r1 = run('de', 'Ich fing an, es zu verstehen.');
    expect(best(r1, 'fing').lemma).toBe('anfangen');
    expect(best(r1, 'an').lemma).toBe('anfangen');
    expect(best(r1, 'an').notes).toMatchObject({ separable: 'an' });
    expect(patterns('de', 'Ich fing an, es zu verstehen.').map((p) => p.key)).toContain('separable-prefix-verb');
    const r2 = run('de', 'Er fängt heute an.');
    expect(best(r2, 'an').lemma).toBe('anfangen');
    expect(best(run('de', 'anzufangen'), 'anzufangen').lemma).toBe('anfangen');
    expect(best(run('de', 'Er hat angefangen.'), 'angefangen').lemma).toBe('anfangen');
  });

  it('"an" is a plain preposition when no separable verb precedes it', () => {
    const r = run('de', 'Ich glaube an Gott.');
    expect(best(r, 'an').pos).toBe('ADP');
    expect(best(r, 'an').lemma).toBe('an');
    expect(patterns('de', 'Ich glaube an Gott.').map((p) => p.key)).not.toContain('separable-prefix-verb');
  });
});

describe('Albanian: ë and ç are preserved in forms; inflected forms are related', () => {
  const sq = adapter('sq');

  it('normalization keeps ë/ç (and composes decomposed input); the plain-letter spelling is a different form', () => {
    expect(sq.normalize('RRËFEJ')).toBe('rrëfej');
    expect(sq.normalize('ÇFARË')).toBe('çfarë');
    expect(sq.normalize('ë')).toBe('ë');
    expect(sq.normalize('çdo')).toBe('çdo');
    expect(sq.normalize('zemër')).not.toBe(sq.normalize('zemer'));
    // search is forgiving, identity is not
    expect(sq.searchNormalize('zemër')).toBe(sq.searchNormalize('zemer'));
  });

  it('token surfaces and forms keep the diacritics; the undiacritized spelling is not the word itself: it is related to it, and says so', () => {
    const r = run('sq', 'Çfarë? Zemrën time, mëkatin.');
    expect(r.tokens.filter((t) => t.isWord).map((t) => t.normalized)).toEqual(['çfarë', 'zemrën', 'time', 'mëkatin']);
    expect(best(r, 'Zemrën').lemma).toBe('zemër');
    // typed without ë: the token keeps its form; the reading names the properly spelled word and is less certain
    for (const [typed, standard, lemma] of [['zemren', 'zemrën', 'zemër'], ['mekatin', 'mëkatin', 'mëkat']] as const) {
      const a = run('sq', typed).analyses[0];
      expect(a.token.normalized).toBe(typed);
      expect(a.candidates.length).toBeGreaterThan(0);
      for (const c of a.candidates) {
        expect(c.lemma).toBe(lemma);
        expect(c.orthography).toMatchObject({ modern: standard, period: 'sq-ascii' });
        expect(c.confidence).toBeLessThanOrEqual(0.7);
      }
    }
  });

  it('relate(): definite/indefinite and case forms of one noun are inflections; ë is not dropped', () => {
    expect(sq.relate('mëkat', 'mëkatin')).toBe('inflection');
    expect(sq.relate('zemër', 'zemrën')).toBe('inflection');
    expect(sq.relate('zemra', 'zemrën')).toBe('inflection');
    expect(sq.relate('Perëndia', 'Perëndinë')).toBe('inflection');
    expect(sq.relate('mëkat', 'zemër')).toBe('none');
    expect(sq.relate('mëkat', 'mekat')).toBe('none');
  });
});

describe('Spanish: accents, inflection and historical Scripture forms', () => {
  const es = adapter('es');

  it('historical forms in the lexicon keep their accents and carry their tense/mood', () => {
    const r = run('es', 'Si dijéremos que nos engañamos á nosotros mismos');
    expect(best(r, 'dijéremos')).toMatchObject({ lemma: 'decir' });
    expect(best(r, 'dijéremos').morph).toMatchObject({ Mood: 'Sub', Tense: 'Fut', Person: '1', Number: 'Plur' });
    expect(best(r, 'engañamos').lemma).toBe('engañar');
    expect(best(r, 'á')).toMatchObject({ lemma: 'a', pos: 'ADP' });
    expect(es.relate('dijéremos', 'decir')).toBe('inflection');
    expect(es.relate('engañamos', 'engañar')).toBe('inflection');
    expect(es.relate('á', 'a')).toBe('inflection'); // the historical spelling is a separate form of the same lemma
  });

  // true once the morphology engine (spanish/morphology.ts) is real; while it is the stub nothing outside the word list is analysed
  const engineLive = analyzeSpanishForm('hablamos', { knownLemma: () => true }).length > 0;
  const cands = (w: string) => run('es', w).analyses[0].candidates;

  it('a correctly spelled form of a verb the word list holds is analysed by rule (older forms are tagged es-hist); with no engine nothing is guessed', () => {
    for (const [w, lemma] of [['pudiéremos', 'poder'], ['hiciéredes', 'hacer'], ['creyéremos', 'creer'], ['confesaremos', 'confesar']] as const) {
      if (!engineLive) { expect(cands(w), w).toEqual([]); continue; }
      const c = cands(w).find((x) => x.lemma === lemma);
      expect(c, w).toBeDefined();
      expect(c!.origin, w).toBe('rule');
      expect(c!.confidence, w).toBeGreaterThanOrEqual(0.5);
    }
    if (engineLive) {
      expect(cands('pudiéremos').find((x) => x.lemma === 'poder')).toMatchObject({ morph: expect.objectContaining({ Mood: 'Sub', Tense: 'Fut' }), varieties: expect.arrayContaining(['es-hist']) });
    }
  });

  it('a misspelling gets no confident analysis; a word whose lemma nobody vouches for gets at most a rule guess, never a word-list hit', () => {
    for (const w of ['dijeremos', 'entendia']) {
      for (const c of cands(w)) { expect(c.origin, w).toBe('rule'); expect(c.confidence, w).toBeLessThanOrEqual(0.6); }
    }
    for (const w of ['enganamos', 'perezcan']) {
      const c = cands(w);
      if (!engineLive) expect(c, w).toEqual([]);
      for (const x of c) {
        expect(x.origin, w).toBe('rule');
        expect(x.sourceId, w).toBe('adapter-es@12:rules');
        expect(x.confidence, w).toBeLessThanOrEqual(0.6);
        expect(x.gloss, w).toBeUndefined();
        expect(x.notes?.lemmaStatus, w).toBe('inferred by the rules');
      }
    }
    // an accentless look-alike of a listed form is a different, unknown form
    expect(es.normalize('dijéremos')).not.toBe(es.normalize('dijeremos'));
    expect(es.normalize('engañamos')).not.toBe(es.normalize('enganamos'));
  });

  it('modern inflection is analysed from the paradigm, including clitic infinitives; accents distinguish forms', () => {
    expect(best(run('es', 'Yo creo en Dios.'), 'creo').lemma).toBe('creer');
    expect(best(run('es', 'Él tiene paz.'), 'tiene').lemma).toBe('tener');
    expect(es.relate('creo', 'creer')).toBe('inflection');
    expect(es.relate('entendía', 'entendí')).toBe('inflection');
    for (const c of run('es', 'entendia').analyses[0].candidates) expect(c.confidence).toBeLessThanOrEqual(0.6); // the accent is identity: no confident reading
    expect(es.relate('Él', 'el')).toBe('none'); // él (pronoun) ≠ el (article): the accent is identity
  });

  it('a whole bundled-style Scripture verse: every historical form analysed or honestly left empty, none mis-analysed', () => {
    const r = run('es', 'Si confesamos nuestros pecados, él es fiel y justo para que nos perdone nuestros pecados, y nos limpie de toda maldad.');
    const an = r.analyses.filter((_, i) => r.tokens[i].isWord);
    expect(an.every((a) => a.candidates.length > 0)).toBe(true);
    expect(analysisCoverage(r.tokens, r.analyses).coverage).toBe(1);
  });
});

describe('Spanish checkProduction additions (each its own ErrorCandidate with a replacement)', () => {
  const fix = (text: string) => errors('es', text).map((e) => ({
    category: e.category, replacement: e.suggestion?.replacement, applied: e.suggestion ? text.slice(0, e.suggestion.start) + e.suggestion.replacement + text.slice(e.suggestion.end) : undefined,
  }));

  it('yo + infinitive: "Yo creer" → "creo" when the verb is in the lexicon', () => {
    expect(fix('Yo creer en Dios.')).toEqual([{ category: 'conjugation', replacement: 'creo', applied: 'Yo creo en Dios.' }]);
    expect(fix('Yo no creer.')).toEqual([{ category: 'conjugation', replacement: 'creo', applied: 'Yo no creo.' }]);
    expect(fix('Yo ser fiel.')[0].replacement).toBe('soy');
    const e = errors('es', 'Yo creer en Dios.')[0];
    expect(e.tokenIndexes).toEqual([0, 1]);
    expect(e.confidence).toBeGreaterThan(0.7);
    // a lexicon infinitive with no first-person form known: flagged, no replacement, lower confidence
    const d = errors('es', 'Yo decir eso.');
    expect(d[0].suggestion).toBeUndefined();
    expect(d[0].confidence).toBeLessThan(0.7);
    // unknown verbs are not guessed at
    expect(errors('es', 'Yo comprar pan.')).toEqual([]);
  });

  it('yo tiene → tengo (third-person verb after yo)', () => {
    expect(fix('Yo tiene paz.')).toEqual([{ category: 'conjugation', replacement: 'tengo', applied: 'Yo tengo paz.' }]);
    expect(fix('Yo no tiene paz.')[0].applied).toBe('Yo no tengo paz.');
  });

  it('numeral above one + singular noun → plural: "cinco año" → "cinco años"', () => {
    expect(fix('Tengo cinco año.')).toEqual([{ category: 'agreement', replacement: 'años', applied: 'Tengo cinco años.' }]);
    expect(fix('Dos casa y tres libro.').map((x) => x.applied)).toEqual(['Dos casas y tres libro.', 'Dos casa y tres libros.']);
    expect(fix('Tengo 5 año.')[0].replacement).toBe('años');
    for (const ok of ['Tengo cinco años.', 'Tengo un año.', 'Tengo uno libro.', 'Tengo dos casas.', 'Cinco Dios.']) expect(errors('es', ok), ok).toEqual([]);
  });

  it('the acceptance sentence: each rule is its own candidate, all with replacements', () => {
    const text = 'Yo tiene cinco año.';
    const e = errors('es', text);
    expect(e).toHaveLength(2);
    expect(e.map((x) => x.suggestion!.replacement).sort()).toEqual(['años', 'tengo']);
    expect(new Set(e.map((x) => x.tokenIndexes.join(','))).size).toBe(2);
    // applying both (right to left) gives the corrected sentence
    const both = [...e].sort((a, b) => b.suggestion!.start - a.suggestion!.start).reduce((t, x) => t.slice(0, x.suggestion!.start) + x.suggestion!.replacement + t.slice(x.suggestion!.end), text);
    expect(both).toBe('Yo tengo cinco años.');
    expect(fix('Yo creer en Dios.')).toHaveLength(1);
  });

  it('stays silent on correct sentences', () => {
    for (const ok of ['Yo creo en Dios.', 'Yo tengo cinco años.', 'Yo no creo en ellos.', 'Dios ama al mundo.']) expect(errors('es', ok), ok).toEqual([]);
  });
});
