/**
 * How the Hindi adapter (package H3) wires the word list, the morphology engine, the detectors and the script modules
 * together. These tests hold with the sibling modules as they are when they run - stubs that return nothing, or real - so
 * they assert properties and the behaviour of listed words, never counts of phrases, constructions or rule readings.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../src/core';
import { HI_SOURCE_IDS, hiAdapter, hiLexicon } from '../../src/adapters/hi';
import { hindiSpellingVariants } from '../../src/adapters/hindi/script';
import { decodeHindi } from '../../src/adapters/hindi/pronunciation';
import { transliterateHindi } from '../../src/adapters/hindi/translit';
import { loadBundledCorpus } from '../../src/ingest';
import { run } from './helpers';

const ANALYZER = `adapter-hi@${hiAdapter.version}`;
const readings = (text: string, nth = 0): AnalysisCandidate[] => run('hi', text).analyses.filter((a) => a.token.isWord)[nth].candidates;
const sentencesOf = (d: ReturnType<typeof loadBundledCorpus>[number]): string[] =>
  d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.map((x) => x.text) : [p.text])));
const hiDocs = () => loadBundledCorpus().filter((d) => d.lang === 'hi');

describe('identity', () => {
  it('the adapter is version 5 and its analyses name themselves', () => {
    expect(hiAdapter.version).toBe('5');
    expect(run('hi', 'घर').analyses[0].analyzer).toBe('adapter-hi@5');
    expect(ANALYZER).toBe('adapter-hi@5');
  });

  it('normalize is NFC and nothing else: the nukta stays, case and marks are not folded', () => {
    const jaraNukta = String.fromCodePoint(0x091c, 0x093c, 0x0930, 0x093e); // ज + nukta + रा
    const jara = String.fromCodePoint(0x091c, 0x0930, 0x093e);
    expect(hiAdapter.normalize(jaraNukta)).toBe(jaraNukta);
    expect(hiAdapter.normalize(jaraNukta)).not.toBe(jara);
    expect(hiAdapter.normalize(String.fromCodePoint(0x095b, 0x0930, 0x093e))).toBe(jaraNukta); // the precomposed ज़ becomes ज + nukta
    expect(hiAdapter.normalize('हिंदी')).not.toBe(hiAdapter.normalize('हिन्दी'));
    expect(hiAdapter.normalize(' घर ')).toBe(' घर ');
    expect(hiAdapter.normalize('AbC')).toBe('AbC');
  });

  it('tokenize keeps the nukta, so ज़रा and जरा are two different forms', () => {
    const a = hiAdapter.tokenize('ज़रा')[0];
    const b = hiAdapter.tokenize('जरा')[0];
    expect(a.normalized).not.toBe(b.normalized);
    expect(a.normalized.length).toBe(b.normalized.length + 1);
    expect(a.surface).toBe('ज़रा');
  });

  it('sources are declared, machine-drafted, and every candidate points at one of them', () => {
    const src = hiAdapter.sources!;
    expect(Object.keys(src).sort()).toEqual(Object.values(HI_SOURCE_IDS).sort());
    for (const s of Object.values(src)) expect(s.reviewStatus).toBe('machine-drafted');
    expect(src[HI_SOURCE_IDS.hand].origin).toBe('hand');
    expect(src[HI_SOURCE_IDS.rules].origin).toBe('rule');
    for (const d of hiDocs()) for (const t of sentencesOf(d).slice(0, 6)) {
      for (const a of run('hi', t).analyses) for (const c of a.candidates) {
        expect(c.origin === 'hand' || c.origin === 'rule', `${c.lemma}: ${c.origin}`).toBe(true);
        expect(src[c.sourceId!], `${c.lemma}: ${c.sourceId}`).toBeDefined();
        expect(src[c.sourceId!].origin).toBe(c.origin);
      }
    }
  });

  it('the hooks of a script that needs decoding are wired, and the dictionary-only hooks are not (no Hindi dictionary is installed)', () => {
    for (const k of ['decode', 'decodeWithPronunciation', 'orthFeatures', 'describeOrthFeature', 'describeMorph', 'refine', 'searchNormalize'] as const) {
      expect(typeof hiAdapter[k], k).toBe('function');
    }
    expect(hiAdapter.morphFromTags).toBeUndefined();
    expect(hiAdapter.varietiesFromTags).toBeUndefined();
    expect(Object.keys(hiAdapter.varieties!).sort()).toEqual(['awa', 'bra', 'hi-sant']);
    expect(Array.isArray(hiAdapter.decode!('घर'))).toBe(true);
    expect(typeof hiAdapter.describeMorph!({ Gender: 'Masc', Number: 'Sing' }, 'NOUN')).toBe('string');
    expect(typeof hiAdapter.describeOrthFeature!('letter:क')).toBe('string');
    expect(typeof hiAdapter.searchNormalize('घर')).toBe('string');
  });

  it('support is honest: seed-only lemmatization, nothing dependable beyond tokenization, plain limitations', () => {
    const s = hiAdapter.support;
    expect(s.lemmatization).toBe('seed-only');
    for (const k of ['sentenceSegmentation', 'morphology', 'phraseDetection', 'productionChecks'] as const) expect(s[k], k).not.toBe('dependable');
    const text = s.limitations.join(' ');
    expect(text).toMatch(/machine-drafted/);
    expect(text).toMatch(/not been checked by a native speaker/);
    expect(text).toMatch(/inferred/);
    expect(text).toMatch(/Pronunciation/);
    expect(text).toMatch(/measured/);
    expect(s.limitations.length).toBeGreaterThanOrEqual(5);
  });
});

describe('the layers of one form: hand list → rules → spelling variants → nothing', () => {
  it('a listed form gets hand readings: origin hand, the hand source, a gloss, and a confidence that is not a guess', () => {
    for (const w of ['पाप', 'किताब', 'छोटा', 'करता', 'मैंने', 'को', 'नहीं', 'ज़रूरत', 'प्रभु', 'लड़की']) {
      const c = readings(w);
      const hand = c.filter((x) => x.origin === 'hand');
      expect(hand.length, w).toBeGreaterThan(0);
      for (const h of hand) {
        expect(h.sourceId).toBe(HI_SOURCE_IDS.hand);
        expect(h.gloss, w).toBeTruthy();
        expect(h.unconfirmed).toBeUndefined();
        expect(h.confidence).toBeGreaterThan(0.5);
      }
      expect(c[0].origin, `${w}: the word list is the first reading`).toBe('hand');
    }
  });

  it('every reading says what it is: a rule reading names its rule and whether its lemma is in the word list', () => {
    const forms = ['पापों', 'किताबें', 'लड़कों', 'बच्चे', 'समझते', 'छोटी', 'उसकी', 'पढ़ाया', 'दिखाई', 'ज़रूरतें', 'कपड़ों', 'स्कूलों'];
    for (const w of forms) for (const c of readings(w)) {
      if (c.origin === 'rule') {
        expect(c.sourceId).toBe(HI_SOURCE_IDS.rules);
        expect(c.notes?.source).toBe('rule');
        expect(typeof c.notes?.rule).toBe('string');
        expect(['in the word list', 'inferred by the rules']).toContain(c.notes?.lemmaStatus);
        const listed = !!hiLexicon.find(c.lemma!, c.pos);
        if (c.notes?.lemmaStatus === 'in the word list') {
          expect(listed, `${w}: ${c.lemma}`).toBe(true);
          expect(c.unconfirmed).toBeUndefined();
          expect(c.gloss).toBeTruthy();
        } else {
          expect(listed, `${w}: ${c.lemma} must not be in the list`).toBe(false);
          expect(c.unconfirmed, `${w}: ${c.lemma}`).toBe(true);
          expect(c.confidence).toBeLessThanOrEqual(0.6);
          expect(c.gloss).toBeUndefined();
        }
      }
    }
  });

  it('a word outside the list gets either rule readings flagged unconfirmed (0.6 at most, no gloss) or an empty list - never a confident guess', () => {
    const outside = ['लैपटॉप', 'ज़ेबरा', 'त्रिभुज', 'मेंढकियाँ', 'ब्लॉगरों', 'फ़ुटबॉलर', 'खर्राटेबाज़', 'xyzzy'];
    for (const w of outside) {
      const c = readings(w);
      for (const x of c) {
        expect(x.unconfirmed, `${w}: ${x.lemma}`).toBe(true);
        expect(x.confidence).toBeLessThanOrEqual(0.6);
        expect(x.gloss, w).toBeUndefined();
        expect(x.origin).toBe('rule');
        expect(x.notes?.lemmaStatus).toBe('inferred by the rules');
        expect(hiLexicon.find(x.lemma!, x.pos), `${w}: ${x.lemma}`).toBeUndefined();
      }
    }
  });

  it('no guessed lemma stands beside a word the list knows: a form with a vouched reading has no unconfirmed one', () => {
    const forms = new Set<string>(['की', 'पर', 'खाना', 'सोना', 'आम', 'दो', 'लिए', 'हो', 'सजा', 'सज़ा', 'राज', 'राज़', 'बस', 'कल', 'तेल', 'मेज़']);
    for (const d of hiDocs()) for (const t of sentencesOf(d).slice(0, 40)) for (const a of run('hi', t).analyses) if (a.token.isWord) forms.add(a.token.normalized);
    expect(forms.size).toBeGreaterThan(100);
    for (const f of forms) {
      const c = readings(f);
      const vouched = c.some((x) => x.origin === 'hand' || x.notes?.lemmaStatus === 'in the word list');
      if (vouched) expect(c.some((x) => x.unconfirmed), f).toBe(false);
    }
  });

  it('readings of a homograph are all kept: की is the genitive and the perfective of करना', () => {
    const c = readings('की');
    expect(c.map((x) => x.lemma)).toEqual(expect.arrayContaining(['का', 'करना']));
    expect(c.length).toBeGreaterThanOrEqual(2);
    const pos = readings('पर').map((x) => x.pos);
    expect(pos).toEqual(expect.arrayContaining(['ADP', 'CONJ']));
  });

  it('a fused pronoun form (उसने, मुझसे) is one word whose parts, if given, tile it exactly', () => {
    for (const w of ['उसने', 'मुझसे', 'इन्होंने', 'उनको']) {
      const r = run('hi', w);
      expect(r.tokens.filter((t) => t.isWord).length).toBe(1);
      for (const c of r.analyses[0].candidates) {
        if (!c.parts?.length) continue;
        for (const p of c.parts) expect(w.slice(p.start, p.end), `${w}: ${p.text}`).toBe(p.text);
        expect(c.parts.map((p) => p.text).join('')).toBe(w);
      }
    }
  });

  it('analysis is a pure function of the form: the same twice, and a caller changing a result changes nothing', () => {
    const a = readings('समझते');
    const b = readings('समझते');
    expect(b).toEqual(a);
    a[0].morph.Gender = 'changed';
    a[0].notes = { x: 'y' };
    a.push({ morph: {}, confidence: 1 });
    expect(readings('समझते')).toEqual(b);
  });
});

describe('spelling variants: found through the variant, said so, the text never altered', () => {
  const PAIRS: Array<[written: string, listed: string]> = [
    ['जरा', 'ज़रा'], ['जिंदगी', 'ज़िंदगी'], ['जरूरत', 'ज़रूरत'], ['हिन्दी', 'हिंदी'], ['किताब', 'किताब'], ['गयी', 'गई'], ['चाहिये', 'चाहिए'], ['फौज', 'फ़ौज'],
  ];
  for (const [written, listed] of PAIRS) {
    it(`${written} → ${listed}`, () => {
      const r = run('hi', written);
      expect(r.tokens.map((t) => t.surface)).toEqual([written]); // the token is exactly what was written
      expect(r.tokens[0].normalized).toBe(written.normalize('NFC'));
      const c = r.analyses[0].candidates;
      // linked: the script module relates them, or the word list does (the two spellings differ only by the nukta)
      const linked = written === listed || hindiSpellingVariants(written).map((v) => v.normalize('NFC')).includes(listed.normalize('NFC')) || skeletonOf(written) === skeletonOf(listed);
      const viaVariant = c.filter((x) => x.notes?.variantOf !== undefined);
      if (written === listed) {
        expect(c.length).toBeGreaterThan(0);
        expect(viaVariant).toEqual([]);
      } else if (linked && hiLexicon.lookup(listed.normalize('NFC')).length && !hiLexicon.lookup(written.normalize('NFC')).length) {
        // the variant spelling resolves to the listed word (the rules may read it themselves, as they do for the second of these pairs): whatever is reached
        // through the variant says which spelling it was found under
        expect(c.length, `${written} should resolve through ${listed}`).toBeGreaterThan(0);
        for (const x of viaVariant) {
          expect(x.notes?.variantOf).toBe(listed.normalize('NFC'));
          expect(x.confidence).toBeLessThanOrEqual(0.8);
        }
        for (const x of c) expect(x.lemma).toBeDefined();
      } else {
        // no variant link is known (the script module is not installed, or knows no such variant): no reading claims one
        expect(viaVariant).toEqual([]);
      }
    });
  }

  it('nothing links a word to a different word: सज़ा (punishment) and सजा, राज (rule) and राज़ (secret) stay apart', () => {
    const lemmas = (w: string) => new Set(readings(w).map((x) => x.lemma));
    // each resolves on its own spelling, to its own lemma(s), with no variant claim
    for (const w of ['सज़ा', 'सजा', 'राज', 'राज़']) {
      expect(readings(w).length, w).toBeGreaterThan(0);
      for (const c of readings(w)) expect(c.notes?.variantOf, w).toBeUndefined();
    }
    expect(lemmas('सज़ा').has('सज़ा')).toBe(true);
    expect(lemmas('सजा').has('सज़ा')).toBe(false);
    expect(lemmas('राज').has('राज')).toBe(true);
    expect(lemmas('राज').has('राज़')).toBe(false);
    expect(lemmas('राज़').has('राज़')).toBe(true);
    expect(hiAdapter.relate('सज़ा', 'सजा')).toBe('none');
    expect(hiAdapter.relate('राज', 'राज़')).toBe('none');
    expect(hiAdapter.relate('ज़रूरत', 'आवश्यकता')).toBe('none');
  });

  it('relate: the same text is "same"; forms of one lemma are inflections; other words are not related', () => {
    expect(hiAdapter.relate('पाप', 'पाप')).toBe('same');
    expect(hiAdapter.relate('पाप', 'पापों')).toBe('inflection');
    expect(hiAdapter.relate('समझता', 'समझने')).toBe('inflection');
    expect(hiAdapter.relate('किया', 'करता')).toBe('inflection');
    expect(hiAdapter.relate('मैंने', 'मुझे')).toBe('inflection');
    expect(hiAdapter.relate('पाप', 'दिल')).toBe('none');
    expect(hiAdapter.relate('xyzzy', 'घर')).toBe('none');
  });
});

describe('refine: the same ordering again after a dictionary changed some tokens', () => {
  it('refine equals analyze on every sentence of the bundled Hindi documents', () => {
    const docs = hiDocs();
    expect(docs.length).toBeGreaterThanOrEqual(3);
    let n = 0;
    for (const d of docs) for (const text of sentencesOf(d)) {
      const tokens = hiAdapter.tokenize(text);
      const analyzed = hiAdapter.analyze(tokens);
      const refined = hiAdapter.refine!(tokens, analyzed, new Set([ANALYZER]));
      expect(refined, `${d.id}: ${text}`).toEqual(analyzed);
      n++;
    }
    expect(n).toBeGreaterThan(50);
  });

  it('refine starts again from the context-free readings for its own tokens, and takes other tokens as given', () => {
    const text = 'ठीक हूँ, पर मैं एक बात नहीं समझती।';
    const tokens = hiAdapter.tokenize(text);
    const analyzed = hiAdapter.analyze(tokens);
    // a token whose readings were put in a bad order by an earlier pass: refine puts it back
    const scrambled: AnalyzedToken[] = analyzed.map((a, i) => (tokens[i].normalized === 'पर' ? { ...a, candidates: [...a.candidates].reverse() } : a));
    expect(hiAdapter.refine!(tokens, scrambled, new Set([ANALYZER]))).toEqual(analyzed);
    // another analyzer's token (a dictionary's) is left exactly alone, and the neighbours read it as it is
    const dict: AnalyzedToken[] = analyzed.map((a, i) => (i === 0 ? { ...a, analyzer: 'dict-hi@x', candidates: [{ lemma: 'ठीक', pos: 'ADJ', morph: {}, confidence: 0.9, origin: 'dictionary', sourceId: 'dict-hi@x' }] } : a));
    const out = hiAdapter.refine!(tokens, dict, new Set([ANALYZER]));
    expect(out[0]).toBe(dict[0]);
    expect(out.length).toBe(dict.length);
    // a token that is not in `analyzers` is never touched, even if it is ours
    expect(hiAdapter.refine!(tokens, scrambled, new Set(['someone-else']))).toEqual(scrambled);
    // punctuation passes through untouched
    tokens.forEach((t, i) => { if (!t.isWord) expect(out[i]).toBe(dict[i]); });
  });

  it('पर is "on" after a noun and "but" after a comma; the reading chosen is first, the others are lowered', () => {
    const but = readings('ठीक हूँ, पर मैं', 2);
    expect(but[0].pos).toBe('CONJ');
    expect(but.find((c) => c.pos === 'ADP')!.confidence).toBeLessThanOrEqual(but[0].confidence);
    const on = readings('परमेश्वर पर विश्वास', 1);
    expect(on[0].pos).toBe('ADP');
  });
});

describe('offsets: every token and sentence slices the text exactly', () => {
  const TEXTS = [
    'उसने काम किया।',
    'मैं ठीक हूँ, पॉल, पर मैं एक बात नहीं समझती।',
    'क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा कि उसने दिया, ताकि वह नाश न हो॥',
    'रवि ने कहा, "मैं १२३ किताबें लाऊँगा।" फिर वह चला गया।',
    'उसके पास 3 सेब और २५ केले हैं। क्या आप आएँगे? हाँ!',
    '“यीशु ने कहा, ‘मैं मार्ग, सत्य और जीवन हूँ।’” यूहन्ना 14:6',
    'ज़रा देखो, ज़िंदगी कितनी सुंदर है… मगर कंप्यूटर?',
    'पहला पाठ।\nदूसरा पाठ॥\n',
  ];
  it('tokens: surface = text.slice(start, end), in order, without overlap', () => {
    for (const text of TEXTS) {
      const tokens: RawToken[] = hiAdapter.tokenize(text);
      let at = 0;
      for (const t of tokens) {
        expect(text.slice(t.start, t.end), text).toBe(t.surface);
        expect(t.start).toBeGreaterThanOrEqual(at);
        at = t.end;
        expect(t.normalized).toBe(t.surface.normalize('NFC'));
        if (t.isWord) expect(/^\p{M}/u.test(t.surface), `${t.surface} starts with a mark`).toBe(false);
      }
      // danda, double danda and the quotes are not words
      for (const t of tokens) if (/^[।॥"“”‘’…!?,.]$/u.test(t.surface)) expect(t.isWord).toBe(false);
      // numerals, Devanagari or Latin, are not words
      for (const t of tokens) if (/^\p{Nd}+$/u.test(t.surface)) expect(t.isWord).toBe(false);
    }
  });

  it('sentences: spans slice the text exactly and tokens inside them round-trip', () => {
    for (const text of TEXTS) {
      const spans = hiAdapter.segmentSentences(text);
      expect(spans.length).toBeGreaterThan(0);
      let at = 0;
      for (const s of spans) {
        expect(text.slice(s.start, s.end), text).toBe(s.text);
        expect(s.start).toBeGreaterThanOrEqual(at);
        at = s.end;
        for (const t of hiAdapter.tokenize(s.text)) expect(s.text.slice(t.start, t.end)).toBe(t.surface);
      }
      // nothing but whitespace is left outside the spans
      let rest = '';
      let pos = 0;
      for (const s of spans) { rest += text.slice(pos, s.start); pos = s.end; }
      rest += text.slice(pos);
      expect(rest.trim(), text).toBe('');
    }
  });

  it('analysis does not move or alter a token; candidate parts lie inside the token', () => {
    for (const text of TEXTS) {
      const tokens = hiAdapter.tokenize(text);
      const analyzed = hiAdapter.analyze(tokens);
      expect(analyzed.length).toBe(tokens.length);
      analyzed.forEach((a, i) => {
        expect(a.token).toBe(tokens[i]);
        if (!tokens[i].isWord) expect(a.candidates).toEqual([]);
        for (const c of a.candidates) {
          for (const p of c.parts ?? []) {
            expect(p.start).toBeGreaterThanOrEqual(0);
            expect(p.end).toBeLessThanOrEqual(tokens[i].surface.length);
            expect(tokens[i].surface.slice(p.start, p.end), `${tokens[i].surface}: ${p.text}`).toBe(p.text);
          }
        }
      });
    }
  });
});

describe('phrases, patterns, production: the modules first, the adapter\'s older rules only beside them', () => {
  it('the three course phrases are found, once each, with the tokens that carry them', () => {
    const find = (text: string, display: string) => {
      const r = run('hi', text);
      return hiAdapter.detectPhrases(r.tokens, r.analyses).filter((p) => p.pattern.join(' ') === display);
    };
    expect(find('जब मैं छोटा था, मेरे दिल में पाप था।', 'जब _ छोटा होना').length).toBe(1);
    expect(find('एक दिन मैं अपना पाप समझने लगा।', 'समझना लगना').length).toBe(1);
    expect(find('मैं परमेश्वर पर विश्वास नहीं करता था।', '_ पर विश्वास').length).toBe(1);
  });

  it('no phrase is reported twice, and every phrase points at real tokens', () => {
    for (const d of hiDocs()) for (const text of sentencesOf(d).slice(0, 25)) {
      const r = run('hi', text);
      const ph = hiAdapter.detectPhrases(r.tokens, r.analyses);
      const seen = new Set<string>();
      for (const p of ph) {
        const key = `${p.pattern.join(' ')}|${p.tokenIndexes.join(',')}`;
        expect(seen.has(key), `${text}: ${key} twice`).toBe(false);
        seen.add(key);
        expect(p.tokenIndexes.length).toBeGreaterThan(0);
        for (const i of p.tokenIndexes) expect(r.tokens[i], `${text}: ${i}`).toBeDefined(); // a unit may span a hyphen (साथ-साथ)
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
      }
      for (let i = 1; i < ph.length; i++) expect(ph[i].tokenIndexes[0]).toBeGreaterThanOrEqual(ph[i - 1].tokenIndexes[0]);
    }
  });

  it('patterns point at real tokens and carry a plain explanation', () => {
    for (const d of hiDocs()) for (const text of sentencesOf(d).slice(0, 25)) {
      const r = run('hi', text);
      for (const p of hiAdapter.detectPatterns(r.tokens, r.analyses)) {
        expect(p.key.length).toBeGreaterThan(0);
        expect(p.explanation.length).toBeGreaterThan(10);
        for (const i of p.tokenIndexes) expect(r.tokens[i], `${text}: ${p.key}`).toBeDefined();
      }
    }
  });

  it('checkProduction returns well-formed findings, and a correct simple sentence yields none', () => {
    for (const text of ['मैंने काम किया', 'मैं काम करता हूँ', 'छोटी बात', 'शांत दिल', 'परमेश्वर ने मेरा पाप क्षमा किया']) {
      const r = run('hi', text);
      const found = hiAdapter.checkProduction(r.tokens, r.analyses, text);
      for (const e of found) {
        expect(e.message.length).toBeGreaterThan(10);
        expect(e.confidence).toBeGreaterThan(0);
        for (const i of e.tokenIndexes) expect(r.tokens[i]).toBeDefined();
        if (e.suggestion) {
          expect(e.suggestion.start).toBeGreaterThanOrEqual(0);
          expect(e.suggestion.end).toBeLessThanOrEqual(text.length);
        }
      }
    }
    for (const ok of ['मैंने काम किया', 'मैं काम करता हूँ', 'छोटी बात']) {
      const r = run('hi', ok);
      expect(hiAdapter.checkProduction(r.tokens, r.analyses, ok), ok).toEqual([]);
    }
  });
});

describe('pronunciation', () => {
  it('gives plain notes for the signs a word carries, and a transliteration only when it is sure', () => {
    const r = run('hi', 'पाप हूँ ज़रा क्षमा');
    const words = r.tokens.filter((t) => t.isWord);
    const p = words.map((t, i) => hiAdapter.pronunciation(t, r.analyses.filter((a) => a.token.isWord)[i]));
    expect(p[0].notes!.join(' ')).toMatch(/schwa/);
    expect(p[1].notes!.join(' ')).toMatch(/nasalizes/);
    expect(p[2].notes!.join(' ')).toMatch(/nukta/);
    expect(p[3].notes!.join(' ')).toMatch(/halant/);
    for (const x of p) expect(x.transliteration === undefined || x.transliteration.length > 0).toBe(true);
  });
});

// ───────────────────────── fix batch 1 ─────────────────────────

const ENGINE = run('hi', 'लड़कों').analyses[0].candidates.length > 0;
const skeletonOf = (s: string) => s.normalize('NFC').split(String.fromCodePoint(0x093c)).join('');

describe('a word written with or without its nukta is reached through the list, never rewritten', () => {
  /** [text as written, the lemma the list holds it under] */
  const LACKS_THE_DOT: Array<[string, string]> = [
    ['जरूरत', 'ज़रूरत'], ['जमीन', 'ज़मीन'], ['फोन', 'फ़ोन'], ['फौज', 'फ़ौज'], ['कानून', 'क़ानून'], ['कीमत', 'क़ीमत'], ['खबर', 'ख़बर'], ['खून', 'ख़ून'], ['गरीब', 'ग़रीब'],
    ['गलती', 'ग़लती'], ['लडका', 'लड़का'], ['पढना', 'पढ़ना'], ['बडा', 'बड़ा'], ['ढूँढा', 'ढूँढ़ना'],
  ];
  /** the text has a dot the list does not */
  const HAS_A_DOT: Array<[string, string]> = [['क़िताब', 'किताब'], ['ग़ाँव', 'गाँव'], ['फ़ल', 'फल'], ['ड़र', 'डर'], ['ख़ाना', 'खाना']];

  for (const [direction, pairs] of [['the text lacks the dot', LACKS_THE_DOT], ['the text has a dot the list lacks', HAS_A_DOT]] as const) {
    it(`${direction}: ${pairs.length} pairs - the reading is the list's, says variantOf, and the token is as written`, () => {
      for (const [text, lemma] of pairs) {
        const r = run('hi', text);
        expect(r.tokens.map((t) => t.surface)).toEqual([text]); // the text is untouched
        expect(r.tokens[0].normalized).toBe(text.normalize('NFC'));
        const hit = r.analyses[0].candidates.filter((c) => c.lemma === lemma);
        expect(hit.length, `${text} should be read as ${lemma}: ${r.analyses[0].candidates.map((c) => c.lemma).join(' ')}`).toBeGreaterThan(0);
        for (const c of hit) {
          const v = c.notes?.variantOf as string | undefined;
          expect(v, `${text}: variantOf`).toBeDefined();
          expect(v).not.toBe(text.normalize('NFC'));
          expect(skeletonOf(v!), `${text}: the listed spelling differs only by the nukta`).toBe(skeletonOf(text));
          expect(c.confidence).toBeLessThanOrEqual(0.8);
          expect(c.lemma, 'the lemma is the list\'s spelling').toBe(lemma);
          expect(hiLexicon.find(c.lemma!), c.lemma).toBeDefined();
          expect(c.gloss).toBeTruthy();
        }
      }
    });
  }

  it('a form the rules derive is reached through the same index, and comes back under the list\'s lemma', () => {
    if (!ENGINE) return;
    for (const [text, lemma] of [['जरूरतें', 'ज़रूरत'], ['जमीनों', 'ज़मीन'], ['खरीदियेगा', 'ख़रीदना'], ['गलतियां', 'ग़लती'], ['खबरें', 'ख़बर'], ['गरीबों', 'ग़रीब']] as const) {
      const hit = run('hi', text).analyses[0].candidates.filter((c) => c.lemma === lemma);
      expect(hit.length, text).toBeGreaterThan(0);
      for (const c of hit) {
        expect(c.notes?.variantOf, text).toBeDefined();
        expect(c.unconfirmed, text).toBeUndefined();
        expect(c.gloss, text).toBeTruthy();
      }
      // no second, guessed lemma beside it
      for (const c of run('hi', text).analyses[0].candidates) expect(c.unconfirmed, `${text}: ${c.lemma}`).toBeUndefined();
    }
  });

  it('a spelling that differs by the anusvara as well as the nukta (ढूंढा for ढूँढ़ा) is reached too, through the script module and then the list', () => {
    if (hindiSpellingVariants('ढूंढा').length === 0) return; // the script module is a stub: nothing relates the anusvara
    const c = run('hi', 'ढूंढा').analyses[0].candidates.filter((x) => x.lemma === 'ढूँढ़ना');
    expect(c.length).toBeGreaterThan(0);
    for (const x of c) expect(x.notes?.variantOf).toBeDefined();
  });

  it('the learner\'s record of one word is not split: a text spelled either way has the same lemma as the listed spelling', () => {
    const lemmaOf = (w: string) => new Set(run('hi', w).analyses[0].candidates.map((c) => c.lemma));
    for (const [text, lemma] of [...LACKS_THE_DOT, ...HAS_A_DOT]) expect(lemmaOf(text).has(lemma), text).toBe(true);
    expect(hiAdapter.relate('जरूरत', 'ज़रूरत')).toBe('inflection');
    expect(hiAdapter.relate('कानून', 'क़ानून')).toBe('inflection');
    expect(hiAdapter.relate('क़िताब', 'किताब')).toBe('inflection');
  });

  it('two listed words that differ only by the nukta stay two words: each is read as itself, with no variant relation', () => {
    // राज (rule, reign) and राज़ (secret); सज़ा (punishment) and सजा (a form of the verbs सजना / सजाना)
    for (const [text, lemma, other] of [['राज', 'राज', 'राज़'], ['राज़', 'राज़', 'राज'], ['सज़ा', 'सज़ा', 'सजना'], ['सजा', 'सजना', 'सज़ा']] as const) {
      const c = run('hi', text).analyses[0].candidates;
      expect(c.map((x) => x.lemma), text).toContain(lemma);
      expect(c.map((x) => x.lemma), `${text} is not ${other}`).not.toContain(other);
      for (const x of c) expect(x.notes?.variantOf, text).toBeUndefined();
    }
    if (ENGINE) {
      for (const [text, lemma, other] of [['राजों', 'राज', 'राज़'], ['राज़ों', 'राज़', 'राज']] as const) {
        const c = run('hi', text).analyses[0].candidates;
        expect(c.length, text).toBeGreaterThan(0);
        expect(c.map((x) => x.lemma), text).toContain(lemma);
        expect(c.map((x) => x.lemma), `${text} is not ${other}`).not.toContain(other);
        for (const x of c) expect(x.notes?.variantOf, text).toBeUndefined();
      }
    }
    expect(hiAdapter.relate('राज', 'राज़')).toBe('none');
    expect(hiAdapter.relate('सज़ा', 'सजा')).toBe('none');
    // the text of each is its own identity: the nukta is never folded
    expect(hiAdapter.tokenize('राज')[0].normalized).not.toBe(hiAdapter.tokenize('राज़')[0].normalized);
  });

  it('a word the list cannot reach by any spelling is still unread or an unconfirmed guess, never a nukta guess', () => {
    for (const w of ['ज़ेबरा', 'फ़ुटबॉलर', 'लैपटॉप']) {
      for (const c of run('hi', w).analyses[0].candidates) {
        expect(c.unconfirmed, w).toBe(true);
        expect(c.notes?.variantOf, w).toBeUndefined();
      }
    }
  });
});

describe('also: spellings written on a row are variants of one lemma', () => {
  it('the Bible\'s spelling of "prophet", of "sad" and "sorrow", of "hover" and of "fruitful" are read as the one listed lemma', () => {
    const CASES: Array<[string, string]> = [['भविष्यद्वक्ता', 'भविष्यवक्ता'], ['दुःखी', 'दुखी'], ['दुःख', 'दुख'], ['फलदाई', 'फलदायी'], ['सुखदाई', 'सुखदायी'], ['मण्डराता', 'मँडराना'], ['महत्वपूर्ण', 'महत्त्वपूर्ण'], ['कमरबन्द', 'कमरबंद']];
    for (const [text, lemma] of CASES) {
      const c = run('hi', text).analyses[0].candidates.filter((x) => x.lemma === lemma);
      expect(c.length, `${text} → ${lemma}`).toBeGreaterThan(0);
      for (const x of c) expect(x.notes?.variantOf, text).toBeDefined();
      expect(hiLexicon.find(text), `${text} is not a lemma of its own`).toBeUndefined();
    }
    if (ENGINE) {
      const c = run('hi', 'भविष्यद्वक्ताओं').analyses[0].candidates;
      expect(c.map((x) => x.lemma)).toContain('भविष्यवक्ता');
      expect(c.every((x) => x.unconfirmed === undefined)).toBe(true);
    }
    expect(hiAdapter.relate('भविष्यद्वक्ता', 'भविष्यवक्ता')).toBe('inflection');
  });
});

describe('pronunciation(): a romanization only where the transliteration module is sure, and the unwritten a is stated', () => {
  const words = (() => {
    const out = new Set<string>();
    for (const d of loadBundledCorpus().filter((x) => x.lang === 'hi' && /^(s0|story|dialogue)/u.test(x.id))) {
      for (const s of d.sections) for (const p of s.paragraphs) {
        for (const x of 'sentences' in p ? p.sentences : [{ text: p.text }]) for (const t of hiAdapter.tokenize(x.text)) if (t.isWord) out.add(t.normalized);
      }
    }
    return [...out].slice(0, 700);
  })();
  it(`${words.length} words: transliteration is the module's text when it is at least 0.6 sure, and absent otherwise`, () => {
    expect(words.length).toBeGreaterThan(300);
    let sure = 0, unsure = 0;
    for (const w of words) {
      const tok = hiAdapter.tokenize(w)[0];
      const tr = transliterateHindi(w);
      const p = hiAdapter.pronunciation(tok, undefined);
      if (tr.text !== '' && tr.confidence >= 0.6) {
        sure++;
        expect(p.transliteration, w).toBe(tr.text);
      } else {
        unsure++;
        expect(p.transliteration, `${w} (module confidence ${tr.confidence})`).toBeUndefined();
      }
      expect(Array.isArray(p.notes), w).toBe(true);
    }
    // with the module installed most words are sure; as a stub none is, and none is invented
    if (ENGINE) expect(sure).toBeGreaterThan(unsure);
  });
  it('notes carry the statement about the unwritten a for every word that has one, and the plain notes for the signs', () => {
    for (const w of words) {
      const tok = hiAdapter.tokenize(w)[0];
      const p = hiAdapter.pronunciation(tok, undefined);
      const units = decodeHindi(w);
      const text = (p.notes ?? []).join(' ');
      if (units.some((u) => u.inherentVowel !== undefined)) expect(text, w).toMatch(/unwritten "a"/);
      else if (units.length === 0 && /[क-ह]$/u.test(w)) expect(text, w).toMatch(/inherent "a"/);
      if (/[ँं]/u.test(w)) expect(text, w).toMatch(/nasalizes/);
      if (w.includes(String.fromCodePoint(0x093c))) expect(text, w).toMatch(/nukta/);
    }
  });
});

describe('refine with `given`: a dictionary\'s readings beside ours are kept whatever the order', () => {
  const text = 'परमेश्वर पर विश्वास';
  const foreign: AnalysisCandidate = { lemma: 'परना', pos: 'VERB', morph: {}, confidence: 0.5, gloss: 'dictionary sense', origin: 'dictionary', sourceId: 'dict-hi@x' };
  const keyOf = (c: AnalysisCandidate) => `${c.lemma}|${c.pos}|${c.origin}`;
  it('a token in `given` keeps every reading it arrived with, in any order; the same token not in `given` is started again', () => {
    const tokens = hiAdapter.tokenize(text);
    const analyzed = hiAdapter.analyze(tokens);
    const i = tokens.findIndex((t) => t.surface === 'पर');
    const arrived = [...analyzed[i].candidates, foreign];
    for (const list of [arrived, [...arrived].reverse()]) {
      const withForeign: AnalyzedToken[] = analyzed.map((a, k) => (k === i ? { ...a, candidates: list } : a));
      const kept = hiAdapter.refine!(tokens, withForeign, new Set([ANALYZER]), new Set([i]));
      expect(kept[i].candidates.map(keyOf).sort(), 'every reading it arrived with').toEqual(list.map(keyOf).sort());
      expect(kept[i].candidates.some((c) => c.origin === 'dictionary')).toBe(true);
      // only an order, a lowered confidence and notes.context may differ
      for (const c of kept[i].candidates) {
        const was = list.find((x) => keyOf(x) === keyOf(c))!;
        expect(c.confidence).toBeLessThanOrEqual(was.confidence);
        expect(c.gloss).toBe(was.gloss);
        expect(c.morph).toEqual(was.morph);
      }
      // the other tokens are as they were
      kept.forEach((a, k) => { if (k !== i) expect(a).toEqual(analyzed[k]); });
      // not in `given`: the token starts again from the adapter's own readings and the foreign one is gone (as before)
      const restarted = hiAdapter.refine!(tokens, withForeign, new Set([ANALYZER]));
      expect(restarted[i].candidates).toEqual(analyzed[i].candidates);
      expect(restarted[i].candidates.some((c) => c.origin === 'dictionary')).toBe(false);
      const emptyGiven = hiAdapter.refine!(tokens, withForeign, new Set([ANALYZER]), new Set());
      expect(emptyGiven[i].candidates).toEqual(analyzed[i].candidates);
    }
  });
  it('a token of another analyzer is left alone, `given` or not', () => {
    const tokens = hiAdapter.tokenize(text);
    const analyzed = hiAdapter.analyze(tokens);
    const i = 2;
    const other: AnalyzedToken[] = analyzed.map((a, k) => (k === i ? { ...a, analyzer: 'dict-hi@x', candidates: [foreign] } : a));
    for (const given of [undefined, new Set([i]), new Set<number>()]) {
      const out = hiAdapter.refine!(tokens, other, new Set([ANALYZER]), given);
      expect(out[i]).toBe(other[i]);
    }
  });
});
