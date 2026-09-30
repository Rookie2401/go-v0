/**
 * Thai adapter. Words come from Intl.Segmenter('th', word) — ICU dictionary segmentation, no spaces in the
 * text. Segmenter quirks are repaired in one place (THAI_COMPOUNDS): words the course treats as one unit
 * (นิรันดร์, พระบุตร, ตอนนี้ …) are re-joined when ICU splits them; offsets stay exact.
 * Confident: lexicon words, classifiers (CLF) and sentence-final particles (PART), ทรง before verbs.
 * Uncertain: anything the ICU dictionary splits differently than a learner would expect (unlisted compounds
 * come out as parts); sentence boundaries (Thai has no full stop — see segmentSentences); tone (only the
 * initial-consonant class is reported, never a tone guess).
 */
import type { AnalysisCandidate, ErrorCandidate, LanguageAdapter, PatternCandidate, PronunciationSupport, RawToken, Span, AdapterSupport } from '../core';
import {
  E, Lexicon, hasPos, lexiconAnalyze, makeWordTokenizer, matchPhraseRules, nfc, speechNormalizeGeneric, type PhraseRule,
} from './shared';

const LANG = 'th' as const;
const VERSION = '1';
const ANALYZER = `adapter-${LANG}@${VERSION}`;

const normalize = (s: string) => nfc(s).replace(/ํา/gu, 'ำ').replace(/[​﻿]/gu, '');

/** Words ICU splits but the course treats as one lexical unit. */
export const THAI_COMPOUNDS = ['นิรันดร์', 'พระบุตร', 'ตอนนี้', 'ทุกคน', 'วันหนึ่ง', 'หลอกลวง', 'สัตย์ซื่อ', 'ทั้งสิ้น'];

const UNIT = { unit: 'yes' };

const ENTRIES = [
  // pronouns
  E('ฉัน', 'PRON', 'I (neutral/female)', undefined, { translit: 'chan' }),
  E('ผม', 'PRON', 'I (male)', undefined, { translit: 'phom' }),
  E('เรา', 'PRON', 'we; I', undefined, { translit: 'rao' }),
  E('คุณ', 'PRON', 'you (polite)', undefined, { translit: 'khun' }),
  E('พระองค์', 'PRON', 'he (royal/divine); God', undefined, { translit: 'phraong' }),
  E('อะไร', 'PRON', 'what', undefined, { translit: 'arai' }),
  E('ทุกคน', 'PRON', 'everyone', undefined, { translit: 'thukkhon' }),
  // verbs / auxiliaries
  E('เข้าใจ', 'VERB', 'to understand', undefined, { translit: 'khaochai' }),
  E('เชื่อ', 'VERB', 'to believe', undefined, { translit: 'chuea' }),
  E('เริ่ม', 'VERB', 'to begin', undefined, { translit: 'roem' }),
  E('ยก', 'VERB', 'to lift; to take away', undefined, { translit: 'yok' }),
  E('รัก', 'VERB', 'to love', undefined, { translit: 'rak' }),
  E('มี', 'VERB', 'to have; there is', undefined, { translit: 'mi' }),
  E('ไม่มี', 'VERB', 'to not have; there is no', undefined, { translit: 'maimi' }),
  E('พูด', 'VERB', 'to say, speak', undefined, { translit: 'phut' }),
  E('หลอกลวง', 'VERB', 'to deceive', undefined, { translit: 'lokluang' }),
  E('สารภาพ', 'VERB', 'to confess', undefined, { translit: 'saraphap' }),
  E('โปรด', 'VERB', 'to kindly grant (royal/formal)', undefined, { translit: 'prot' }),
  E('ชำระ', 'VERB', 'to cleanse', undefined, { translit: 'chamra' }),
  E('พ้น', 'VERB', 'to be free of', undefined, { translit: 'phon' }),
  E('ประทาน', 'VERB', 'to give (royal/divine)', undefined, { translit: 'prathan' }),
  E('พินาศ', 'VERB', 'to perish', undefined, { translit: 'phinat' }),
  E('ขอบคุณ', 'VERB', 'to thank', undefined, { translit: 'khopkhun' }),
  E('ให้', 'VERB', 'to give; to let', undefined, { translit: 'hai' }),
  E('ให้', 'ADP', 'for, to (benefactive)', undefined, { translit: 'hai' }),
  E('ทรง', 'AUX', '(royal/divine auxiliary before verbs)', undefined, { translit: 'song' }),
  E('จะ', 'AUX', 'will', undefined, { translit: 'cha' }),
  E('ได้', 'AUX', 'can; got to', undefined, { translit: 'dai' }),
  E('อยาก', 'AUX', 'to want to', undefined, { translit: 'yak' }),
  E('อยู่', 'AUX', 'to be located; (ongoing)', undefined, { translit: 'yu' }),
  // nouns
  E('พระเจ้า', 'PROPN', 'God', undefined, { translit: 'phrachao' }),
  E('บาป', 'NOUN', 'sin', undefined, { translit: 'bap' }),
  E('โทษ', 'NOUN', 'fault, blame, penalty', undefined, { translit: 'thot' }),
  E('หัวใจ', 'NOUN', 'heart', undefined, { translit: 'huachai' }),
  E('สันติสุข', 'NOUN', 'peace', undefined, { translit: 'santisuk' }),
  E('โลก', 'NOUN', 'world', undefined, { translit: 'lok' }),
  E('ชีวิต', 'NOUN', 'life', undefined, { translit: 'chiwit' }),
  E('พระบุตร', 'NOUN', 'the Son (royal/divine)', undefined, { translit: 'phrabut' }),
  E('เรื่อง', 'NOUN', 'matter, story', undefined, { translit: 'rueang', notes: UNIT }),
  E('เรื่อง', 'CLF', '(classifier for stories, matters)', undefined, { translit: 'rueang' }),
  E('อธรรม', 'NOUN', 'unrighteousness', undefined, { translit: 'athamma' }),
  E('ความ', 'NOUN', '(prefix forming abstract nouns)', undefined, { translit: 'khwam', notes: { nominalizer: 'yes' } }),
  E('วัน', 'NOUN', 'day', undefined, { translit: 'wan', notes: UNIT }),
  E('ครั้ง', 'NOUN', 'time, occasion', undefined, { translit: 'khrang', notes: UNIT }),
  E('ตอน', 'NOUN', 'time, when', undefined, { translit: 'ton' }),
  E('หนังสือ', 'NOUN', 'book', undefined, { translit: 'nangsue' }),
  E('บ้าน', 'NOUN', 'house, home', undefined, { translit: 'ban' }),
  E('เด็ก', 'NOUN', 'child; young', undefined, { translit: 'dek' }),
  E('คน', 'NOUN', 'person', undefined, { translit: 'khon' }),
  // classifiers
  E('คน', 'CLF', '(classifier for people)', undefined, { translit: 'khon' }),
  E('ตัว', 'CLF', '(classifier for animals, letters, clothes)', undefined, { translit: 'tua' }),
  E('ตัว', 'NOUN', 'body; self', undefined, { translit: 'tua' }),
  E('อัน', 'CLF', '(general classifier for small things)', undefined, { translit: 'an' }),
  E('เล่ม', 'CLF', '(classifier for books, knives)', undefined, { translit: 'lem' }),
  E('องค์', 'CLF', '(classifier for royalty, deity, monks)', undefined, { translit: 'ong' }),
  E('หลัง', 'CLF', '(classifier for houses)', undefined, { translit: 'lang' }),
  // numerals
  E('หนึ่ง', 'NUM', 'one', undefined, { translit: 'nueng' }),
  E('สอง', 'NUM', 'two', undefined, { translit: 'song' }),
  E('สาม', 'NUM', 'three', undefined, { translit: 'sam' }),
  E('สี่', 'NUM', 'four', undefined, { translit: 'si' }),
  E('ห้า', 'NUM', 'five', undefined, { translit: 'ha' }),
  // adjectives, adverbs, determiners
  E('สบาย', 'ADJ', 'comfortable, well', undefined, { translit: 'sabai' }),
  E('ดี', 'ADJ', 'good', undefined, { translit: 'di' }),
  E('จริง', 'ADJ', 'true, real', undefined, { translit: 'ching' }),
  E('สัตย์ซื่อ', 'ADJ', 'faithful', undefined, { translit: 'sattsue' }),
  E('ยุติธรรม', 'ADJ', 'just, fair', undefined, { translit: 'yuttitham' }),
  E('นิรันดร์', 'ADJ', 'eternal', undefined, { translit: 'niran' }),
  E('เดียว', 'ADJ', 'single, only', undefined, { translit: 'diao' }),
  E('ทั้งหมด', 'ADJ', 'all, entire', undefined, { translit: 'thangmot' }),
  E('ทั้งสิ้น', 'ADV', 'entirely, altogether', undefined, { translit: 'thangsin' }),
  E('ยัง', 'ADV', 'still, yet', undefined, { translit: 'yang' }),
  E('แล้ว', 'ADV', 'already', undefined, { translit: 'laeo' }),
  E('ด้วย', 'ADV', 'also, with', undefined, { translit: 'duai' }),
  E('ตอนนี้', 'ADV', 'now', undefined, { translit: 'tonni' }),
  E('วันหนึ่ง', 'ADV', 'one day', undefined, { translit: 'wan nueng' }),
  E('เอง', 'ADV', '-self', undefined, { translit: 'eng' }),
  E('ทำไม', 'ADV', 'why', undefined, { translit: 'thammai' }),
  E('ทุก', 'DET', 'every', undefined, { translit: 'thuk' }),
  E('นี้', 'DET', 'this', undefined, { translit: 'ni' }),
  E('นั้น', 'DET', 'that', undefined, { translit: 'nan' }),
  // particles
  E('ไม่', 'PART', 'not', undefined, { translit: 'mai', notes: { polarity: 'neg' } }),
  E('ก็', 'PART', '(so, also; linking particle)', undefined, { translit: 'ko' }),
  E('ครับ', 'PART', '(polite particle, male speaker)', undefined, { translit: 'khrap' }),
  E('ค่ะ', 'PART', '(polite particle, female speaker; statements)', undefined, { translit: 'kha' }),
  E('คะ', 'PART', '(polite particle, female speaker; questions)', undefined, { translit: 'kha' }),
  E('ไหม', 'PART', '(yes/no question particle)', undefined, { translit: 'mai' }),
  E('นะ', 'PART', '(softening particle)', undefined, { translit: 'na' }),
  E('สิ', 'PART', '(urging particle)', undefined, { translit: 'si' }),
  E('เหรอ', 'PART', '(tag question particle)', undefined, { translit: 'loe' }),
  // prepositions, conjunctions
  E('ของ', 'ADP', 'of', undefined, { translit: 'khong' }),
  E('ใน', 'ADP', 'in', undefined, { translit: 'nai' }),
  E('จาก', 'ADP', 'from', undefined, { translit: 'chak' }),
  E('และ', 'CONJ', 'and', undefined, { translit: 'lae' }),
  E('แต่', 'CONJ', 'but', undefined, { translit: 'tae' }),
  E('เพราะ', 'CONJ', 'because', undefined, { translit: 'phro' }),
  E('จน', 'CONJ', 'until; so much that', undefined, { translit: 'chon' }),
  E('ที่', 'SCONJ', 'that, who, which', undefined, { translit: 'thi' }),
  E('ว่า', 'SCONJ', 'that (complementizer)', undefined, { translit: 'wa' }),
  E('เพื่อ', 'SCONJ', 'in order to, for', undefined, { translit: 'phuea' }),
  E('ถ้า', 'SCONJ', 'if', undefined, { translit: 'tha' }),
  // interjections
  E('สวัสดี', 'INTJ', 'hello', undefined, { translit: 'sawatdi' }),
];
export const thLexicon = new Lexicon(ENTRIES, normalize);

function contextual(i: number, tokens: RawToken[], base: AnalysisCandidate[][]): AnalysisCandidate[] {
  const cands = base[i];
  if (cands.length < 2) return cands;
  const w = tokens[i].normalized;
  const pick = (pos: string, conf: number): AnalysisCandidate[] => {
    const idx = cands.findIndex((c) => c.pos === pos);
    if (idx < 0) return cands;
    return [{ ...cands[idx], confidence: conf }, ...cands.filter((_, k) => k !== idx).map((c) => ({ ...c, confidence: Math.min(c.confidence, 0.3) }))];
  };
  const prev = base[i - 1]?.[0];
  if (w === 'ตัว') return base[i + 1]?.some((c) => c.pos === 'PRON') ? pick('NOUN', 0.7) : prev?.pos === 'NUM' ? pick('CLF', 0.85) : cands;
  if (w === 'คน') return prev?.pos === 'NUM' || prev?.pos === 'DET' ? pick('CLF', 0.85) : pick('NOUN', 0.7);
  if (w === 'ให้') return prev?.pos === 'NOUN' || prev?.pos === 'PRON' || prev?.pos === 'VERB' ? pick('ADP', 0.6) : cands;
  return cands;
}

const PHRASES: PhraseRule[] = [
  { pattern: ['ตอน', 'เด็ก'], display: 'ตอน…เด็ก', gloss: 'when (I was) young', kind: 'formula',
    variants: [['ตอน', { gap: 3, only: ['SCONJ', 'PRON', 'ADV', 'PART'] }, 'เด็ก']] },
  { pattern: ['เริ่ม', 'เข้าใจ'], display: 'เริ่มเข้าใจ', gloss: 'begin to understand', kind: 'construction',
    variants: [['เริ่ม', 'เข้าใจ']] },
  { pattern: ['เชื่อ', 'ใน', '_'], display: 'เชื่อใน…', gloss: 'to believe in', kind: 'frame',
    variants: [['เชื่อ', 'ใน', { slot: true }]] },
  { pattern: ['ยก', 'โทษ'], display: 'ยกโทษ', gloss: 'to forgive', kind: 'collocation', variants: [['ยก', 'โทษ']] },
  { pattern: ['ยก', 'บาป'], display: 'ยกบาป', gloss: 'to forgive sins (take sin away)', kind: 'collocation', variants: [['ยก', 'บาป']] },
];

const PARTICLES = ['ครับ', 'ค่ะ', 'คะ', 'นะ', 'จ้ะ', 'จ๊ะ', 'ฮะ', 'เหรอ', 'ล่ะ'];
const POLITE = new Set(['ครับ', 'ค่ะ', 'คะ']);

/** Thai consonant class of the first consonant (leading vowels เ แ โ ใ ไ skipped). Approximate: ห/อ leading letters are not analysed. */
export function thaiInitialClass(surface: string): 'mid' | 'high' | 'low' | undefined {
  for (const ch of surface) {
    if ('เแโใไ'.includes(ch)) continue;
    if (!/[ก-ฮ]/u.test(ch)) return undefined;
    if ('กจดตบปอฎฏ'.includes(ch)) return 'mid';
    if ('ขฃฉฐถผฝศษสห'.includes(ch)) return 'high';
    return 'low';
  }
  return undefined;
}

/**
 * Thai sentence breaks (heuristic, conservative — a wrong split is worse than a long sentence):
 * newline; . ? ! … followed by space/end; ฯ followed by space (not ฯลฯ); two or more spaces; or a single
 * space right after a sentence-final particle (ครับ ค่ะ คะ นะ …). A lone space elsewhere is a clause pause
 * and does NOT split.
 */
export function segmentThaiSentences(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;
  const push = (a: number, b: number) => {
    while (a < b && /\s/u.test(text[a])) a++;
    while (b > a && /\s/u.test(text[b - 1])) b--;
    if (b > a) spans.push({ start: a, end: b, text: text.slice(a, b) });
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') {
      let j = i;
      while (j < text.length && (text[j] === '\n' || text[j] === '\r')) j++;
      push(start, i); start = j; i = j; continue;
    }
    if ('.?!…'.includes(ch)) {
      let j = i;
      while (j < text.length && '.?!…'.includes(text[j])) j++;
      let k = j;
      while (k < text.length && '"\'”’)»'.includes(text[k])) k++;
      if (k >= text.length || /\s/u.test(text[k])) { push(start, k); start = k; }
      i = k; continue;
    }
    if (ch === 'ฯ') {
      if (text.startsWith('ฯลฯ', i)) { i += 3; continue; }
      if (i + 1 >= text.length || /\s/u.test(text[i + 1])) { push(start, i + 1); start = i + 1; }
      i++; continue;
    }
    if (ch === ' ' || ch === ' ' || ch === '\t') {
      let j = i;
      while (j < text.length && (text[j] === ' ' || text[j] === ' ' || text[j] === '\t')) j++;
      const before = text.slice(start, i);
      if (j - i >= 2 || PARTICLES.some((p) => before.endsWith(p))) { push(start, i); start = j; }
      i = j; continue;
    }
    i++;
  }
  push(start, text.length);
  return spans;
}

const SUPPORT: AdapterSupport = {
  tokenization: 'limited', // ICU dictionary segmentation: an unlisted compound can split differently from a learner's expectation
  sentenceSegmentation: 'limited', // Thai has no full stop: breaks need a newline, two spaces, ฯ, a final particle plus a space, or terminal punctuation
  lemmatization: 'seed-only', // the lexicon covers the seed corpus only; other words are left unanalysed
  morphology: 'seed-only', // Thai has no inflection; only part of speech, classifiers and particles are recorded
  phraseDetection: 'seed-only',
  productionChecks: 'limited',
  limitations: [
    'Thai sentence breaks need a newline (or two spaces) between sentences; a single space is treated as a clause pause and never splits.',
    'Canonical text is never given spaces: segmentation reads the text as written and adds none.',
    'Word segmentation uses the ICU dictionary plus a short list of course compounds; other compounds may come out as parts.',
    'Tone is not guessed: only the initial consonant class is reported.',
    'Lemmatization is seed-only: the lexicon covers the bundled corpus, so supplied texts will have unanalysed words.',
    'Production checks: missing classifier after a number, polite-particle order — only for lexicon words.',
  ],
};

export const thAdapter: LanguageAdapter = {
  lang: LANG,
  name: 'Thai',
  script: 'Thai',
  version: VERSION,
  support: SUPPORT,

  segmentSentences: segmentThaiSentences,
  tokenize: makeWordTokenizer({ locale: 'th', normalize, compounds: THAI_COMPOUNDS }),
  normalize,
  searchNormalize: (q) => normalize(q).trim(),

  analyze: (tokens) => lexiconAnalyze(tokens, thLexicon, ANALYZER, { contextual }),

  detectPhrases: (tokens, analyses) => matchPhraseRules(tokens, analyses, PHRASES, normalize),

  detectPatterns(tokens, analyses): PatternCandidate[] {
    const out: PatternCandidate[] = [];
    const lastWord = (() => { for (let k = tokens.length - 1; k >= 0; k--) if (tokens[k].isWord) return k; return -1; })();
    analyses.forEach((a, i) => {
      const c = a.candidates[0];
      if (!c) return;
      const w = tokens[i].normalized;
      if (w === 'ทรง' && hasPos(analyses[i + 1], 'VERB')) {
        out.push({ key: 'royal-verb', title: 'ทรง + verb (royal/divine register)', confidence: 0.85, tokenIndexes: [i, i + 1],
          explanation: 'ทรง goes before a verb when the doer is God or royalty: พระเจ้าทรงรักโลก "God loves the world".' });
      }
      if (w === 'ไม่' && i + 1 < tokens.length && hasPos(analyses[i + 1], 'VERB', 'AUX', 'ADJ')) {
        out.push({ key: 'negation-mai', title: 'ไม่ + verb/adjective', confidence: 0.85, tokenIndexes: [i, i + 1],
          explanation: 'ไม่ goes directly before the word it negates: ไม่เข้าใจ "do not understand".' });
      }
      if (c.pos === 'CLF' && ((i > 0 && analyses[i - 1]?.candidates[0]?.pos === 'NUM') || tokens[i + 1]?.normalized === 'เดียว' || (i > 0 && hasPos(analyses[i - 1], 'NUM')))) {
        out.push({ key: 'classifier-phrase', title: 'Number + classifier', confidence: Math.min(0.8, c.confidence), tokenIndexes: [i > 0 && hasPos(analyses[i - 1], 'NUM') ? i - 1 : i, i],
          explanation: 'Counting uses noun + number + classifier: หนังสือสองเล่ม "two books"; องค์เดียว "one (divine) person".' });
      }
      if (i === lastWord && c.pos === 'PART' && PARTICLES.includes(w)) {
        out.push({ key: 'final-particle', title: 'Sentence-final particle', confidence: c.confidence, tokenIndexes: [i],
          explanation: 'ครับ / ค่ะ / คะ / นะ / ไหม close a sentence: they add politeness or mark a question.' });
      }
      if (w === 'ความ' && i + 1 < tokens.length && tokens[i + 1].isWord) {
        out.push({ key: 'nominalizer-khwam', title: 'ความ + word (abstract noun)', confidence: 0.7, tokenIndexes: [i, i + 1],
          explanation: 'ความ turns a verb or adjective into an abstract noun: ความจริง "truth" (from จริง "true").' });
      }
    });
    return out;
  },

  pronunciation(token, analysis): PronunciationSupport {
    const translit = analysis?.candidates[0]?.notes?.translit;
    const cls = thaiInitialClass(token.surface);
    const notes: string[] = [];
    if (cls) notes.push(`Initial consonant class: ${cls} (tone also depends on vowel length, final consonant and tone mark).`);
    if (/[่-๋]/u.test(token.surface)) notes.push('Contains a tone mark; it changes the tone with the consonant class.');
    notes.push('Thai is tonal: five tones distinguish words.');
    return { transliteration: typeof translit === 'string' ? translit : undefined, notes };
  },

  speechNormalize: (text) =>
    speechNormalizeGeneric(text, {
      tool: `speech-${LANG}@1`,
      numberToWords: thNumberToWords,
      nativeDigits: '๐๑๒๓๔๕๖๗๘๙',
      percentWord: 'เปอร์เซ็นต์',
      abbreviations: [{ pattern: /ฯลฯ/gu, replacement: 'และอื่น ๆ', label: 'ฯลฯ' }],
    }),

  display: { wordSeparator: '', showBoundariesOnHighlight: true, fontFamily: '"Noto Sans Thai", "Leelawadee UI", system-ui, sans-serif', lineHeight: 2 },

  checkProduction(tokens, analyses, _sentence): ErrorCandidate[] {
    const out: ErrorCandidate[] = [];
    const selfUnit = (a: { candidates: AnalysisCandidate[] } | undefined) =>
      !!a && a.candidates.some((c) => c.pos === 'CLF' || c.notes?.unit === 'yes');

    analyses.forEach((a, i) => {
      const c = a.candidates[0];
      if (!c || !tokens[i].isWord) return;

      // number without a classifier
      if (hasPos(a, 'NUM') && c.pos === 'NUM') {
        const prev = analyses[i - 1];
        const next = analyses[i + 1];
        const prevNoun = prev?.candidates[0]?.pos === 'NOUN' && !selfUnit(prev);
        if (prevNoun && !hasPos(next, 'CLF')) {
          out.push({
            category: 'classifier', tokenIndexes: [i - 1, i], confidence: 0.7, affectsMeaning: false,
            message: `A counted noun needs a classifier after the number: ${tokens[i - 1].surface}${tokens[i].surface} + classifier (e.g. เล่ม, ตัว, คน).`,
          });
        } else if (!prevNoun && next?.candidates[0]?.pos === 'NOUN' && !selfUnit(next)) {
          out.push({
            category: 'classifier', tokenIndexes: [i, i + 1], confidence: 0.6, affectsMeaning: false,
            message: 'Thai counts as noun + number + classifier: the number comes after the noun, e.g. หนังสือสองเล่ม.',
          });
        }
      }

      // polite particle must be last: ครับ/ค่ะ/คะ then another particle
      if (POLITE.has(tokens[i].normalized) && tokens[i + 1]?.isWord && hasPos(analyses[i + 1], 'PART') && !POLITE.has(tokens[i + 1].normalized)) {
        out.push({
          category: 'particle', tokenIndexes: [i, i + 1], confidence: 0.55, affectsMeaning: false,
          message: 'The polite particle (ครับ / ค่ะ / คะ) comes last: นะครับ, not ครับนะ.',
          suggestion: { start: tokens[i].start, end: tokens[i + 1].end, replacement: tokens[i + 1].surface + tokens[i].surface },
        });
      }
    });
    return out;
  },

  relate(a, b) {
    const na = normalize(a), nb = normalize(b);
    if (na === nb) return 'same';
    const [long, short] = na.length >= nb.length ? [na, nb] : [nb, na];
    if (short.length >= 2 && long.includes(short) && thLexicon.has(short) && (thLexicon.has(long) || THAI_COMPOUNDS.includes(long))) return 'component';
    return 'none';
  },
};

// ── numbers 0–999 999 ──
const DIGIT = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

export function thNumberToWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999999) return null;
  if (n === 0) return DIGIT[0];
  const digits = String(n).split('').map(Number);
  let out = '';
  digits.forEach((d, idx) => {
    const p = digits.length - 1 - idx;
    if (d === 0) return;
    if (p === 0) out += d === 1 && n > 10 ? 'เอ็ด' : DIGIT[d];
    else if (p === 1) out += d === 1 ? 'สิบ' : d === 2 ? 'ยี่สิบ' : DIGIT[d] + 'สิบ';
    else out += DIGIT[d] + PLACE[p];
  });
  return out;
}
