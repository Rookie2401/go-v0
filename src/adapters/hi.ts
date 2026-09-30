/**
 * Hindi adapter. NFC identity only (no case folding); nukta/chandrabindu/matras/virama stay inside tokens
 * because Intl.Segmenter('hi') keeps combining marks in the word. NFC decomposes precomposed nukta letters
 * (U+095B…U+095F) — the canonical form is the decomposed one, so corpus text is stored NFC.
 * Confident: lexicon forms with gender/number/case (direct vs oblique), ने-marked pronouns, perfective vs
 * imperfective participles, compound verbs (कर दिया, हो गया), conjunct verbs (क्षमा करना).
 * Uncertain: पर is ADP or CONJ (decided by a preceding comma); vector-verb meaning; unknown words stay empty.
 */
import type { AnalysisCandidate, ErrorCandidate, LanguageAdapter, PatternCandidate, PronunciationSupport, RawToken, AdapterSupport } from '../core';
import {
  E, Lexicon, hasPos, lexiconAnalyze, makeWordTokenizer, matchPhraseRules, nfc, speechNormalizeGeneric,
  splitSentences, type PhraseRule,
} from './shared';

const LANG = 'hi' as const;
const VERSION = '1';
const ANALYZER = `adapter-${LANG}@${VERSION}`;

const normalize = (s: string) => nfc(s);

const ENTRIES = [
  // verbs — lemma = infinitive
  E('होना', 'AUX', 'to be', ['होना:inf', 'हूँ:1s pres', 'है:3s pres', 'हैं:3p pres', 'हैं:2p pres', 'था:m sg past', 'थी:f sg past', 'हो:3s subj', 'हो:VerbForm=Stem']),
  E('करना', 'VERB', 'to do, to make', ['करना:inf', 'कर:VerbForm=Conv', 'करता:m sg ipfv', 'करते:m pl ipfv', 'करती:f sg ipfv', 'किया:m sg pfv', 'करे:3s subj', 'करने:inf obl']),
  E('देना', 'VERB', 'to give', ['देना:inf', 'दे:VerbForm=Stem', 'दे:3s subj', 'दिया:m sg pfv', 'देते:m pl ipfv']),
  E('लेना', 'VERB', 'to take', ['लेना:inf', 'लिया:m sg pfv', 'लें:1p subj', 'लें:3p subj']),
  E('जाना', 'VERB', 'to go', ['जाना:inf', 'गया:m sg pfv', 'गई:f sg pfv']),
  E('समझना', 'VERB', 'to understand', ['समझना:inf', 'समझ:VerbForm=Stem', 'समझता:m sg ipfv', 'समझते:m pl ipfv', 'समझती:f sg ipfv', 'समझतीं:f pl ipfv', 'समझने:inf obl']),
  E('लगना', 'VERB', 'to begin (after an oblique infinitive); to seem', ['लगना:inf', 'लगा:m sg pfv', 'लगी:f sg pfv']),
  E('चाहना', 'VERB', 'to want', ['चाहना:inf', 'चाहता:m sg ipfv', 'चाहती:f sg ipfv']),
  E('रखना', 'VERB', 'to keep, to put', ['रखना:inf', 'रखा:m sg pfv']),
  E('पाना', 'VERB', 'to get, to obtain', ['पाना:inf', 'पाए:3s subj']),
  E('कहना', 'VERB', 'to say', ['कहना:inf', 'कहें:1p subj']),
  E('मानना', 'VERB', 'to accept; to confess', ['मानना:inf', 'मान:VerbForm=Stem']),
  // nouns
  E('दिल', 'NOUN', 'heart', ['दिल:m sg'], { translit: 'dil' }),
  E('पाप', 'NOUN', 'sin', ['पाप:m sg', 'पापों:m pl obl']),
  E('परमेश्वर', 'PROPN', 'God', ['परमेश्वर:m sg']),
  E('दिन', 'NOUN', 'day', ['दिन:m sg'], { translit: 'din' }),
  E('दुनिया', 'NOUN', 'world', ['दुनिया:f sg'], { translit: 'duniyā' }),
  E('शांति', 'NOUN', 'peace', ['शांति:f sg'], { translit: 'śānti' }),
  E('प्रेम', 'NOUN', 'love', ['प्रेम:m sg'], { translit: 'prem' }),
  E('जगत', 'NOUN', 'world (formal)', ['जगत:m sg']),
  E('पुत्र', 'NOUN', 'son', ['पुत्र:m sg']),
  E('जीवन', 'NOUN', 'life', ['जीवन:m sg']),
  E('सत्य', 'NOUN', 'truth', ['सत्य:m sg']),
  E('अधर्म', 'NOUN', 'unrighteousness', ['अधर्म:m sg']),
  E('धोखा', 'NOUN', 'deception', ['धोखा:m sg']),
  E('बात', 'NOUN', 'matter, thing', ['बात:f sg']),
  E('नाश', 'NOUN', 'destruction', ['नाश:m sg']),
  E('क्षमा', 'NOUN', 'forgiveness', ['क्षमा:f sg'], { translit: 'kṣamā' }),
  E('विश्वास', 'NOUN', 'faith, trust', ['विश्वास:m sg'], { translit: 'viśvās' }),
  E('किताब', 'NOUN', 'book', ['किताब:f sg', 'किताबें:f pl']),
  E('घर', 'NOUN', 'house, home', ['घर:m sg']),
  E('अनीता', 'PROPN', 'Anita (name)'), E('पॉल', 'PROPN', 'Paul (name)'),
  // pronouns, determiners
  E('मैं', 'PRON', 'I', ['मैं:1s nom prs', 'मैंने:1s prs Case=Erg', 'मुझे:1s prs Case=Acc,Dat']),
  E('हम', 'PRON', 'we', ['हम:1p nom prs', 'हमें:1p prs Case=Acc,Dat']),
  E('आप', 'PRON', 'you (polite)', ['आप:2p prs']),
  E('वह', 'PRON', 'he, she, that', ['वह:3s dem nom', 'उस:3s dem obl', 'उसने:3s dem Case=Erg']),
  E('कोई', 'PRON', 'someone, anyone'),
  E('कुछ', 'PRON', 'something, any'),
  E('सब', 'PRON', 'all, everyone', ['सब', 'सबको:Case=Dat']),
  E('जो', 'PRON', 'who, which', ['जो:rel']),
  E('क्या', 'PRON', 'what', ['क्या:int']),
  E('क्यों', 'ADV', 'why', ['क्यों:int']),
  E('कैसा', 'ADJ', 'how, what kind', ['कैसा:m sg int', 'कैसी:f sg int', 'कैसे:m pl int']),
  E('मेरा', 'DET', 'my', ['मेरा:m sg poss', 'मेरे:m pl poss', 'मेरे:m sg obl poss', 'मेरी:f sg poss']),
  E('हमारा', 'DET', 'our', ['हमारा:m sg poss', 'हमारे:m pl poss', 'हमारे:m sg obl poss', 'हमारी:f sg poss']),
  E('अपना', 'DET', 'own (reflexive possessive)', ['अपना:m sg poss', 'अपने:m pl poss', 'अपने:m sg obl poss', 'अपनी:f sg poss']),
  E('एक', 'NUM', 'one, a'),
  // adjectives
  E('छोटा', 'ADJ', 'small, young', ['छोटा:m sg dir', 'छोटे:m pl dir', 'छोटे:m sg obl', 'छोटी:f sg', 'छोटी:f pl']),
  E('अच्छा', 'ADJ', 'good', ['अच्छा:m sg dir', 'अच्छे:m pl dir', 'अच्छे:m sg obl', 'अच्छी:f sg', 'अच्छी:f pl']),
  E('पूरा', 'ADJ', 'whole, full', ['पूरा:m sg dir', 'पूरे:m sg obl', 'पूरे:m pl']),
  E('ऐसा', 'ADJ', 'such, so', ['ऐसा:m sg']),
  E('ठीक', 'ADJ', 'fine, right'),
  E('शांत', 'ADJ', 'calm, quiet'),
  E('अनन्त', 'ADJ', 'eternal'),
  E('एकलौता', 'ADJ', 'only (begotten)', ['एकलौता:m sg']),
  E('शुद्ध', 'ADJ', 'pure, clean'),
  E('विश्वासयोग्य', 'ADJ', 'faithful, trustworthy'),
  E('धर्मी', 'ADJ', 'righteous'),
  // postpositions
  E('का', 'ADP', 'of (genitive)', ['का', 'के', 'की']),
  E('को', 'ADP', 'to (dative / accusative marker)', ['को'], { translit: 'ko' }),
  E('में', 'ADP', 'in', ['में'], { translit: 'meṁ' }),
  E('से', 'ADP', 'from, with, by', ['से'], { translit: 'se' }),
  E('ने', 'ADP', '(ergative marker with perfective verbs)', ['ने:Case=Erg'], { translit: 'ne' }),
  E('पर', 'ADP', 'on, at; in (believe in)', ['पर'], { translit: 'par' }),
  E('पर', 'CONJ', 'but', ['पर']),
  E('तक', 'ADP', 'until, up to'),
  // adverbs, particles
  E('नहीं', 'ADV', 'not', ['नहीं:neg'], { translit: 'nahīṁ' }),
  E('न', 'PART', 'not', ['न:neg']),
  E('अब', 'ADV', 'now', ['अब'], { translit: 'ab' }),
  E('भी', 'ADV', 'also', ['भी'], { translit: 'bhī' }),
  E('तो', 'PART', 'then, indeed'),
  // conjunctions
  E('और', 'CONJ', 'and'),
  E('कि', 'SCONJ', 'that'),
  E('क्योंकि', 'SCONJ', 'because, for'),
  E('ताकि', 'SCONJ', 'so that'),
  E('यदि', 'SCONJ', 'if'),
  E('परन्तु', 'CONJ', 'but'),
  E('जब', 'SCONJ', 'when', ['जब'], { translit: 'jab' }),
  // interjections
  E('नमस्ते', 'INTJ', 'hello'), E('हाँ', 'INTJ', 'yes'), E('धन्यवाद', 'INTJ', 'thank you'),
];
export const hiLexicon = new Lexicon(ENTRIES, normalize);

function contextual(i: number, tokens: RawToken[], base: AnalysisCandidate[][]): AnalysisCandidate[] {
  const cands = base[i];
  if (tokens[i].normalized === 'पर' && cands.length > 1) {
    const conj = tokens[i - 1]?.surface === ',';
    const idx = cands.findIndex((c) => c.pos === (conj ? 'CONJ' : 'ADP'));
    if (idx >= 0) return [{ ...cands[idx], confidence: 0.75 }, ...cands.filter((_, k) => k !== idx).map((c) => ({ ...c, confidence: 0.25 }))];
  }
  return cands;
}

const NOMINAL = ['NOUN', 'PROPN', 'PRON'] as const;

const PHRASES: PhraseRule[] = [
  { pattern: ['जब', '_', 'छोटा', 'होना'], display: 'जब मैं छोटा था', gloss: 'when I was young', kind: 'formula',
    variants: [['जब', { slot: true, pos: ['PRON'] }, 'छोटा', 'होना']] },
  { pattern: ['समझना', 'लगना'], display: 'समझने लगा', gloss: 'began to understand', kind: 'construction',
    variants: [['समझना', 'लगना']] },
  { pattern: ['_', 'पर', 'विश्वास'], display: '… पर विश्वास (करना)', gloss: 'to believe in, to put faith in', kind: 'frame',
    variants: [[{ slot: true, pos: [...NOMINAL] }, 'पर', 'विश्वास']] },
  { pattern: ['कर', 'देना'], display: 'कर दिया', gloss: 'compound verb: did (completely / for someone)', kind: 'construction', variants: [['कर', 'देना']] },
  { pattern: ['कर', 'लेना'], display: 'कर लिया', gloss: 'compound verb: did (for oneself / done)', kind: 'construction', variants: [['कर', 'लेना']] },
  { pattern: ['हो', 'जाना'], display: 'हो गया', gloss: 'compound verb: became, has become', kind: 'construction', variants: [['हो', 'जाना']] },
  { pattern: ['क्षमा', 'करना'], display: 'क्षमा करना', gloss: 'to forgive', kind: 'collocation', variants: [['क्षमा', { gap: 1, only: ['ADV', 'PART'] }, 'करना']] },
  { pattern: ['प्रेम', 'करना'], display: 'प्रेम करना', gloss: 'to love', kind: 'collocation', variants: [['प्रेम', { gap: 1, only: ['ADV', 'PART'] }, 'करना']] },
  { pattern: ['विश्वास', 'करना'], display: 'विश्वास करना', gloss: 'to believe, to have faith', kind: 'collocation', variants: [['विश्वास', { gap: 1, only: ['ADV', 'PART'] }, 'करना']] },
];

function adjectiveForm(lemma: string, gender: string, number: string): string | undefined {
  const entry = hiLexicon.find(lemma, 'ADJ');
  if (!entry) return undefined;
  const pick = entry.forms.filter((f) => f.morph.Gender === gender && f.morph.Number === number);
  return (pick.find((f) => f.morph.Case !== 'Obl') ?? pick[0])?.form;
}

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable', // Intl.Segmenter('hi'); matras, nukta, chandrabindu and virama stay inside tokens (grapheme-checked in tests)
  sentenceSegmentation: 'limited', // danda, double danda and Latin terminators; no abbreviation handling
  lemmatization: 'seed-only', // the lexicon covers the seed corpus only; other words are left unanalysed
  morphology: 'seed-only', // gender/number/case and aspect for listed forms; oblique forms only where listed
  phraseDetection: 'seed-only', // compound verbs, conjunct verbs and three course phrases
  productionChecks: 'limited',
  limitations: [
    'Lemmatization is seed-only: the lexicon covers the bundled corpus, so supplied texts will have unanalysed words.',
    'पर is ADP or CONJ, decided only by a preceding comma.',
    'Vector-verb meaning is not interpreted; only listed compound verbs are detected.',
    'Number words are spoken for 0-20 only; larger numbers stay as digits in speech text.',
    'Production checks: ने with an imperfective verb, adjective–noun gender agreement — only for lexicon words.',
  ],
};

export const hiAdapter: LanguageAdapter = {
  lang: LANG,
  name: 'Hindi',
  script: 'Deva',
  version: VERSION,
  support: SUPPORT,

  segmentSentences: (text) => splitSentences(text, { terminators: '।॥.!?…', abbreviations: [] }),
  tokenize: makeWordTokenizer({ locale: 'hi', normalize }),
  normalize,
  searchNormalize: (q) => nfc(q).replace(/[‌‍]/gu, '').trim(),

  analyze: (tokens) => lexiconAnalyze(tokens, hiLexicon, ANALYZER, { contextual }),

  detectPhrases: (tokens, analyses) => matchPhraseRules(tokens, analyses, PHRASES, normalize),

  detectPatterns(tokens, analyses): PatternCandidate[] {
    const out: PatternCandidate[] = [];
    analyses.forEach((a, i) => {
      const c = a.candidates[0];
      if (!c) return;
      // ergative: ने / -ने pronoun … perfective verb
      if (tokens[i].normalized === 'ने' || c.morph.Case === 'Erg') {
        for (let k = i + 1; k < Math.min(tokens.length, i + 6) && tokens[k].isWord; k++) {
          const v = analyses[k]?.candidates[0];
          if (v?.pos === 'VERB' && v.morph.Aspect === 'Perf') {
            out.push({ key: 'ergative-ne', title: 'Ergative ने + perfective', confidence: Math.min(c.confidence, v.confidence), tokenIndexes: [i, k],
              explanation: 'In the perfective past the doer is marked with ने, and the verb agrees with the object, not the doer.' });
            break;
          }
        }
      }
      // -ता था
      if (c.pos === 'VERB' && c.morph.Aspect === 'Imp' && analyses[i + 1]?.candidates[0]?.lemma === 'होना' && analyses[i + 1]?.candidates[0]?.morph.Tense === 'Past') {
        out.push({ key: 'past-imperfective', title: 'Past imperfective (-ता था)', confidence: c.confidence, tokenIndexes: [i, i + 1],
          explanation: 'Verb + -ता/-ती/-ते + था/थी/थे describes a habit or ongoing state in the past: "मैं नहीं समझता था".' });
      }
      // postposition after a noun / pronoun
      if (c.pos === 'ADP' && tokens[i].normalized !== 'ने' && i > 0 && hasPos(analyses[i - 1], 'NOUN', 'PROPN', 'PRON')) {
        out.push({ key: 'postposition', title: 'Postposition after the noun', confidence: Math.min(0.8, c.confidence), tokenIndexes: [i - 1, i],
          explanation: 'Hindi puts the little word after the noun: दिल में "in the heart", परमेश्वर पर "on God".' });
      }
    });
    return out;
  },

  pronunciation(token, analysis): PronunciationSupport {
    const s = token.normalized;
    const notes: string[] = [];
    const translit = analysis?.candidates[0]?.notes?.translit;
    if (/[क-ह]$/u.test(s)) notes.push('Word-final inherent "a" is normally not pronounced (schwa deletion): पाप is "pāp".');
    if (/[ँं]/u.test(s)) notes.push('ँ / ं nasalizes the vowel.');
    if (/़/u.test(s)) notes.push('The dot under a letter (nukta) marks a borrowed sound (क़ ख़ ग़ ज़ फ़).');
    if (/्/u.test(s)) notes.push('A halant (्) joins consonants into a conjunct with no vowel between them.');
    return { transliteration: typeof translit === 'string' ? translit : undefined, notes };
  },

  speechNormalize: (text) =>
    speechNormalizeGeneric(text, {
      tool: `speech-${LANG}@1`,
      numberToWords: hiNumberToWords,
      nativeDigits: '०१२३४५६७८९',
      percentWord: 'प्रतिशत',
    }),

  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: '"Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif', lineHeight: 1.9 },

  checkProduction(tokens, analyses, _sentence): ErrorCandidate[] {
    const out: ErrorCandidate[] = [];
    analyses.forEach((a, i) => {
      const c = a.candidates[0];
      if (!c || !tokens[i].isWord) return;

      // ने needs a perfective verb
      if (tokens[i].normalized === 'ने' || c.morph.Case === 'Erg') {
        for (let k = i + 1; k < Math.min(tokens.length, i + 6) && tokens[k].isWord; k++) {
          const v = analyses[k]?.candidates[0];
          if (!v || v.pos !== 'VERB' || v.morph.VerbForm === 'Conv' || v.morph.VerbForm === 'Stem') continue;
          if (v.morph.Aspect === 'Imp') {
            out.push({
              category: 'postposition', tokenIndexes: [i, k], confidence: 0.65, affectsMeaning: false,
              message: 'ने goes with a perfective verb (e.g. किया, लिया); this verb is imperfective (-ता/-ती).',
            });
          }
          break;
        }
      }

      // adjective–noun gender agreement (inflecting adjectives only)
      const n = analyses[i + 1]?.candidates[0];
      if (c.pos === 'ADJ' && c.morph.Gender && n?.pos === 'NOUN' && n.morph.Gender && !c.morph.Gender.includes(',') && c.morph.Gender !== n.morph.Gender && tokens[i + 1].isWord) {
        const fix = c.lemma && n.morph.Number ? adjectiveForm(c.lemma, n.morph.Gender, n.morph.Number) : undefined;
        out.push({
          category: 'agreement', tokenIndexes: [i, i + 1], confidence: fix ? 0.8 : 0.6, affectsMeaning: false,
          message: `The adjective agrees with the noun: ${tokens[i + 1].surface} is ${n.morph.Gender === 'Fem' ? 'feminine' : 'masculine'}.`,
          suggestion: fix ? { start: tokens[i].start, end: tokens[i].end, replacement: fix } : undefined,
        });
      }
    });
    return out;
  },

  relate(a, b) {
    const na = normalize(a), nb = normalize(b);
    if (na === nb) return 'same';
    const lb = new Set(hiLexicon.lemmasOf(nb));
    return hiLexicon.lemmasOf(na).some((l) => lb.has(l)) ? 'inflection' : 'none';
  },
};

const HI_UNITS = ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस', 'बीस'];
/** Hindi numerals 11–99 are irregular; only 0–20 are supported, larger numbers are left as digits (recorded). */
export function hiNumberToWords(n: number): string | null {
  return Number.isInteger(n) && n >= 0 && n <= 20 ? nfc(HI_UNITS[n]) : null;
}
