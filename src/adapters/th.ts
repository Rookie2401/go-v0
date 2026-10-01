/**
 * Thai adapter. Words come from Intl.Segmenter('th', word) — ICU dictionary segmentation, no spaces in the
 * text. Segmenter quirks are repaired in one place (THAI_COMPOUNDS, thai/text.ts): words the course treats as one
 * unit (นิรันดร์, พระบุตร, ตอนนี้ …) are re-joined when ICU splits them; offsets stay exact.
 *
 * Layers: a hand lexicon (this file's seed list + thai/lexicon-core, function-words, classifiers — machine-drafted,
 * not native-reviewed), each word with a gloss and, for function words, a `role` and, outside ordinary Central Thai,
 * a `register`; phrase units (thai/phrases); constructions (thai/constructions); script decoding (thai/orthography:
 * syllables, class, vowel, tone and the rule that gave it). Long prose is divided into reading units by
 * thai/prose.ts.
 * Confident: lexicon words, classifiers (CLF), particles, listed phrases and constructions. Uncertain: anything the
 * ICU dictionary splits differently than a learner would expect; sentence boundaries (Thai has no full stop); tone
 * where the spelling is ambiguous (the decoder says so with a low confidence instead of guessing).
 */
import type {
  AdapterSupport, AnalysisCandidate, AnalyzedToken, ErrorCandidate, LanguageAdapter, PatternCandidate, PronunciationSupport,
  RawToken, SyllableAnalysis,
} from '../core';
import { decodeFor } from '../core';
import { E, Lexicon, hasPos, lexiconAnalyze, matchPhraseRules, speechNormalizeGeneric } from './shared';
import { annotationKey, mergeAnnotations } from './thai/entries';
import { CORE_ANNOTATIONS, CORE_ENTRIES } from './thai/lexicon-core';
import { FUNCTION_ANNOTATIONS, FUNCTION_ENTRIES } from './thai/function-words';
import { CLASSIFIER_ANNOTATIONS, CLASSIFIER_ENTRIES } from './thai/classifiers';
import { buildPhraseRules } from './thai/phrases';
import { detectThaiConstructions } from './thai/constructions';
import { segmentThaiProse } from './thai/prose';
import {
  SENTENCE_FINAL_PARTICLES, THAI_COMPOUNDS, normalizeThai, segmentThaiSentences, thaiTokenize,
} from './thai/text';
import {
  decodeThai, decodeThaiRespelling, describeThaiOrthFeature, thaiOrthFeatures, tonesFromIpa,
} from './thai/orthography';

const LANG = 'th' as const;
const VERSION = '2';
const ANALYZER = `adapter-${LANG}@${VERSION}`;

const normalize = normalizeThai;

export { THAI_COMPOUNDS, segmentThaiSentences };

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
  E('อธรรม', 'NOUN', 'unrighteousness'), // hand romanization dropped: it disagreed with the decoder
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
  E('สัตย์ซื่อ', 'ADJ', 'faithful'),
  E('ยุติธรรม', 'ADJ', 'just, fair'),
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
  E('เหรอ', 'PART', '(tag question particle)'),
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
/**
 * Order matters: when a surface is ambiguous the earlier entry is listed first. The seed list above keeps its
 * place so analyses of the bundled texts do not change; the later lists only add words and second readings.
 */
export const thLexicon = new Lexicon([...ENTRIES, ...CORE_ENTRIES, ...FUNCTION_ENTRIES, ...CLASSIFIER_ENTRIES], normalize);

/** Role / register / what-a-classifier-counts for lexicon entries, keyed lemma|pos (copied onto the candidates). */
const ANNOTATIONS = mergeAnnotations(CORE_ANNOTATIONS, FUNCTION_ANNOTATIONS, CLASSIFIER_ANNOTATIONS);

const DEMONSTRATIVES = new Set(['นี้', 'นั้น', 'โน้น']);
const DIGITS = /^[\d๐-๙]+$/u;

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
  if (w === 'ถูก') {
    // passive marker before a verb (optionally after the doer), otherwise "cheap; correct"
    const passive = base[i + 1]?.some((c) => c.pos === 'VERB') || (base[i + 1]?.some((c) => c.pos === 'NOUN' || c.pos === 'PRON') && base[i + 2]?.some((c) => c.pos === 'VERB'));
    return passive ? pick('AUX', 0.75) : pick('ADJ', 0.7);
  }
  // a word that is both a classifier and something else (ใบ leaf, ห้อง room, หลัง after …)
  const nonClf = cands.find((c) => c.pos !== 'CLF');
  if (nonClf && cands.some((c) => c.pos === 'CLF') && w !== 'เรื่อง') { // เรื่อง keeps its seed analysis
    const afterNumber = prev?.pos === 'NUM' || DIGITS.test(tokens[i - 1]?.surface ?? '');
    if (afterNumber) return pick('CLF', 0.85);
    if (prev?.pos === 'NOUN' && DEMONSTRATIVES.has(tokens[i + 1]?.normalized ?? '')) return pick('CLF', 0.75);
    return pick(nonClf.pos as string, 0.6);
  }
  return cands;
}

/** Copy role, register and the classifier's "counts" from the annotation table onto the candidates. */
function annotate(a: AnalyzedToken): AnalyzedToken {
  if (!a.candidates.length) return a;
  const candidates = a.candidates.map((c) => {
    const ann = c.lemma && c.pos ? ANNOTATIONS.get(annotationKey(c.lemma, c.pos)) : undefined;
    if (!ann) return c;
    const next: AnalysisCandidate = { ...c };
    if (ann.role) next.role = ann.role;
    if (ann.register) next.register = [...ann.register];
    if (ann.counts) next.notes = { ...(c.notes ?? {}), counts: ann.counts };
    return next;
  });
  return { ...a, candidates };
}

const PHRASES = buildPhraseRules(thaiTokenize);

const PARTICLES: readonly string[] = SENTENCE_FINAL_PARTICLES;
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

const SUPPORT: AdapterSupport = {
  tokenization: 'limited', // ICU dictionary segmentation plus a short course compound list: an unlisted compound can split differently from a learner's expectation; not measured on real prose yet
  sentenceSegmentation: 'limited', // Thai has no full stop: breaks need a newline, two spaces, ฯ, a final particle plus a space, or terminal punctuation; spans of more than 28 words are divided at clause spaces by rule
  lemmatization: 'seed-only', // a hand lexicon (about 600 entries: the bundled texts, common content words, function words, classifiers); machine-drafted, not native-reviewed; other words are left unanalysed (a dictionary can be installed)
  morphology: 'seed-only', // Thai has no inflection; part of speech, classifiers, particles, roles and register tags are recorded for lexicon words only
  phraseDetection: 'seed-only', // listed phrase units only (about 60); nothing is discovered
  productionChecks: 'limited',
  limitations: [
    'Thai sentence breaks need a newline (or two spaces) between sentences; a single space is treated as a clause pause and never splits, except inside a unit of more than 28 words.',
    'Canonical text is never given spaces: segmentation reads the text as written and adds none.',
    'Word segmentation uses the ICU dictionary plus a short list of course compounds; other compounds may come out as parts. It has not been measured on running prose.',
    'Tone comes from the spelling rules (consonant class, vowel length, final, tone mark) and, when a dictionary is installed, from its pronunciation. A spelling the rules cannot settle is reported with low confidence and no tone, never a guess.',
    'Lemmatization is seed-only: the built-in word list is a machine-drafted seed (about 600 entries: content words, function words and classifiers) that has not been checked by a native speaker, and words outside it show as not analysed.',
    'Constructions and phrase units are listed patterns, found only where the neighbouring words are in the word list; they are not a grammar check.',
    'Regional words (Isan, northern, southern), slang and royal vocabulary are tagged where known; only a handful of each is listed.',
    'Production checks: missing classifier after a number, polite-particle order — only for lexicon words.',
  ],
};

const decodeTh = (surface: string): SyllableAnalysis[] => decodeThai(normalize(surface));

/**
 * The dictionary's phonemic respelling is the better guide where the spelling is irregular; with IPA alone, the
 * tone letters decide the tone (and a disagreement with the spelling rule is flagged and capped at 0.7).
 */
function decodeThWithPronunciation(surface: string, pron: { respelling?: string; ipa?: string }): SyllableAnalysis[] {
  const s = normalize(surface);
  if (pron.respelling) {
    const out = decodeThaiRespelling(s, pron.respelling, pron.ipa);
    if (out.length) return out;
  }
  const base = decodeThai(s);
  if (!pron.ipa || !base.length) return base;
  const tones = tonesFromIpa(pron.ipa);
  if (tones.length !== base.length) return base;
  return base.map((syl, k) => {
    const t = tones[k];
    if (!t || t === syl.tone) return syl;
    if (syl.tone === undefined) {
      return { ...syl, tone: t, rule: 'tone taken from the dictionary pronunciation', confidence: Math.max(syl.confidence, 0.75) };
    }
    return {
      ...syl, tone: t, irregular: true, confidence: Math.min(syl.confidence, 0.7),
      rule: `tone taken from the dictionary pronunciation (the spelling rule gives ${syl.tone})`,
    };
  });
}

const thDecoder = { decode: decodeTh, decodeWithPronunciation: decodeThWithPronunciation };

export const thAdapter: LanguageAdapter = {
  lang: LANG,
  name: 'Thai',
  script: 'Thai',
  version: VERSION,
  support: SUPPORT,

  segmentSentences: segmentThaiProse,
  tokenize: thaiTokenize,
  normalize,
  searchNormalize: (q) => normalize(q).trim(),

  analyze: (tokens) => lexiconAnalyze(tokens, thLexicon, ANALYZER, { contextual }).map(annotate),

  detectPhrases: (tokens, analyses) => matchPhraseRules(tokens, analyses, PHRASES, normalize),

  detectPatterns: (tokens, analyses): PatternCandidate[] => detectThaiConstructions(tokens, analyses, PARTICLES),

  decode: decodeTh,
  decodeWithPronunciation: decodeThWithPronunciation,
  orthFeatures: (syllables) => thaiOrthFeatures(syllables),
  describeOrthFeature: (feature) => describeThaiOrthFeature(feature),

  pronunciation(token, analysis): PronunciationSupport {
    const cand = analysis?.candidates[0];
    const lexTranslit = cand?.notes?.translit;
    const syl = decodeFor(thDecoder, token.surface, cand);
    // when the course romanization and the decoder disagree, one of them is wrong: say nothing about tone
    const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/gu, '');
    const contradicted = typeof lexTranslit === 'string' && syl.length > 0 && syl.every((s) => s.romanization)
      && squash(syl.map((s) => s.romanization).join('')) !== squash(lexTranslit);
    const sure = syl.length > 0 && syl.every((s) => s.confidence >= 0.6) && !contradicted;
    const cls = thaiInitialClass(token.surface);
    const notes: string[] = [];
    if (cls) notes.push(`Initial consonant class: ${cls} (tone also depends on vowel length, final consonant and tone mark).`);
    if (/[่-๋]/u.test(token.surface)) notes.push('Contains a tone mark; it changes the tone with the consonant class.');
    if (sure && syl.every((s) => s.tone)) {
      notes.push(`Tone by syllable: ${syl.map((s) => `${s.text} ${s.tone}`).join(', ')}.`);
    } else if (syl.length) {
      notes.push('The tone of this spelling is not certain; Go does not guess it.');
    }
    notes.push('Thai is tonal: five tones distinguish words.');
    // a romanization only from the lexicon or from the decoder when every syllable is certain — never invented
    const decoded = sure && syl.every((s) => s.confidence >= 0.85 && s.romanization) ? syl.map((s) => s.romanization).join('-') : undefined;
    const ipa = sure && syl.every((s) => s.ipa) ? syl.map((s) => s.ipa).join('.') : undefined;
    return { transliteration: typeof lexTranslit === 'string' ? lexTranslit : decoded, ipa, notes };
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
