/**
 * Stage 0 language configurations. Spanish, German and Albanian find their sound–spelling features by spelling patterns;
 * Hindi and Thai take them from their adapters' decoders (orth features: letters, mātrās, conjuncts, classes, tone rules).
 * Every sound explanation below is machine-drafted and awaits a teacher's or native speaker's review (TODO(review)).
 */
import type { LanguageCode } from '../../core';
import type { Stage0LanguageConfig } from './types';

export type { Stage0FadePolicy, Stage0LanguageConfig, Stage0SpellingFeature } from './types';

const LATIN_BANDS = { earlyScenes: 4, earlyMaxNew: 6, laterMaxNew: 8, laterMinCoverage: 0.6, exitMinCoverage: 0.95 };

export const STAGE0_LANGS: Record<LanguageCode, Stage0LanguageConfig> = {
  es: {
    lang: 'es',
    name: 'Spanish',
    voiceLangs: ['es-HN', 'es-MX', 'es-US', 'es-419', 'es-ES', 'es'],
    speakerForms: { question: 'When you talk about yourself in Spanish, which forms should Go teach you?', why: 'Some words change with the speaker: cansado (a man), cansada (a woman).' },
    script: {
      kind: 'latin',
      features: 'spelling',
      spelling: [
        { id: 'es:vowels', label: 'a e i o u — always the same five clear sounds', pattern: /[aeiouáéíóú]/ },
        { id: 'es:h', label: 'h — silent: hola is said "ola"', pattern: /h(?<!ch)/ },
        { id: 'es:ll', label: 'll — like y in "yes"', pattern: /ll/ },
        { id: 'es:ñ', label: 'ñ — like ny in "canyon"', pattern: /ñ/ },
        { id: 'es:j', label: 'j (and g before e, i) — a breathy h from the throat', pattern: /j|g(?=[eiéí])/ },
        { id: 'es:c-z', label: 'z, and c before e or i — like s in Honduras', pattern: /z|c(?=[eiéí])/ },
        { id: 'es:qu', label: 'qu — a plain k (que, quiero)', pattern: /qu/ },
        { id: 'es:r', label: 'r — one quick tap; rr and a first r are rolled', pattern: /r/ },
        { id: 'es:v-b', label: 'b and v — the same sound', pattern: /[bv]/ },
        { id: 'es:accent', label: 'á é í ó ú — the accent marks the strong syllable', pattern: /[áéíóú]/ },
      ],
    },
    bands: LATIN_BANDS,
    exit: { reading: { minCorrect: 0.8, maxLookups: 4 }, listening: { minCorrect: 0.7 }, writing: { minAccepted: 2 }, speaking: { minRecorded: 1 } },
    intro: 'Spanish is spelled almost as it sounds: you will read real sentences from the first minute.',
  },
  de: {
    lang: 'de',
    name: 'German',
    voiceLangs: ['de-DE', 'de-AT', 'de-CH', 'de'],
    script: {
      kind: 'latin',
      features: 'spelling',
      spelling: [
        { id: 'de:ä', label: 'ä — like e in "bed"', pattern: /ä/ },
        { id: 'de:ö', label: 'ö — say e, round your lips', pattern: /ö/ },
        { id: 'de:ü', label: 'ü — say i, round your lips', pattern: /ü/ },
        { id: 'de:ß', label: 'ß — a sharp s', pattern: /ß/ },
        { id: 'de:sch', label: 'sch — like sh', pattern: /sch/ },
        { id: 'de:ch', label: 'ch — a soft hiss after e, i (ich), from the back after a, o, u (acht)', pattern: /ch(?<!sch)/ },
        { id: 'de:ei', label: 'ei — like "eye"; ie — a long ee', pattern: /ei|ie/ },
        { id: 'de:eu', label: 'eu and äu — like "oy"', pattern: /eu|äu/ },
        { id: 'de:w-v', label: 'w — like English v; v — usually like f', pattern: /[wv]/ },
        { id: 'de:z', label: 'z — like ts', pattern: /z/ },
        { id: 'de:sp-st', label: 'sp, st at the start — shp, sht', pattern: /^(sp|st)/ },
        { id: 'de:final-devoicing', label: 'b, d, g at the end — said p, t, k (Hund = hunt)', pattern: /[bdg]$/ },
        { id: 'de:long-vowel', label: 'a vowel before h, or doubled — long (sehr, Tee)', pattern: /[aeiouäöü]h|aa|ee|oo/ },
        { id: 'de:noun-capital', label: 'Every noun starts with a capital letter', pattern: /^[A-ZÄÖÜ]/, pos: 'NOUN', caseSensitive: true },
      ],
    },
    bands: LATIN_BANDS,
    exit: { reading: { minCorrect: 0.8, maxLookups: 4 }, listening: { minCorrect: 0.7 }, writing: { minAccepted: 2 }, speaking: { minRecorded: 1 } },
    intro: 'German spelling is regular once you know a dozen patterns; you meet them in real sentences, not in a list.',
  },
  sq: {
    lang: 'sq',
    name: 'Albanian',
    voiceLangs: ['sq-AL', 'sq-XK', 'sq'],
    speakerForms: { question: 'When you talk about yourself in Albanian, which forms should Go teach you?', why: 'Some words change with the speaker: i lodhur (a man), e lodhur (a woman).' },
    script: {
      kind: 'latin',
      features: 'spelling',
      spelling: [
        { id: 'sq:ë', label: 'ë — a short, weak "uh"; often silent at the end of a word', pattern: /ë/ },
        { id: 'sq:ç', label: 'ç — like ch in "church"', pattern: /ç/ },
        { id: 'sq:dh', label: 'dh — like th in "this"', pattern: /dh/ },
        { id: 'sq:th', label: 'th — like th in "think"', pattern: /th/ },
        { id: 'sq:gj', label: 'gj — like a soft j (gjuha)', pattern: /gj/ },
        { id: 'sq:q', label: 'q — a soft ch, between ch and ky (qen)', pattern: /q/ },
        { id: 'sq:nj', label: 'nj — like ny in "canyon"', pattern: /nj/ },
        { id: 'sq:ll', label: 'll — a dark, heavy l', pattern: /ll/ },
        { id: 'sq:rr', label: 'rr — a rolled r; a single r is a tap', pattern: /rr/ },
        { id: 'sq:sh', label: 'sh — like sh', pattern: /sh/ },
        { id: 'sq:xh', label: 'xh — like j in "jam"', pattern: /xh/ },
        { id: 'sq:zh', label: 'zh — like s in "measure"', pattern: /zh/ },
        { id: 'sq:x', label: 'x — like dz', pattern: /x(?!h)/ },
        { id: 'sq:c', label: 'c — like ts', pattern: /c/ },
        { id: 'sq:j', label: 'j — like y in "yes"', pattern: /(?<![gn])j/ },
        { id: 'sq:y', label: 'y — say i, round your lips (like German ü)', pattern: /y/ },
      ],
    },
    bands: LATIN_BANDS,
    exit: { reading: { minCorrect: 0.8, maxLookups: 4 }, listening: { minCorrect: 0.7 }, writing: { minAccepted: 2 }, speaking: { minRecorded: 1 } },
    intro: 'Albanian is spelled as it sounds, with a few letters of its own: you will read real Albanian at once.',
  },
  hi: {
    lang: 'hi',
    name: 'Hindi',
    voiceLangs: ['hi-IN', 'hi'],
    speakerForms: { question: 'When you talk about yourself in Hindi, which forms should Go teach you?', why: 'Hindi verbs change with the speaker: मैं थका हूँ (a man), मैं थकी हूँ (a woman).' },
    script: {
      kind: 'devanagari',
      features: 'adapter',
      transliteration: { secureAfter: 2, retireAfterStep: 15 },
    },
    bands: { earlyScenes: 4, earlyMaxNew: 5, laterMaxNew: 7, laterMinCoverage: 0.6, exitMinCoverage: 0.95 },
    exit: { reading: { minCorrect: 0.8, maxLookups: 4 }, listening: { minCorrect: 0.7 }, writing: { minAccepted: 2 }, speaking: { minRecorded: 1 }, decoding: { minCorrect: 0.8 } },
    intro: 'You will learn the Devanagari letters inside real Hindi words, a few at a time. Romanization helps at first and then steps aside.',
  },
  th: {
    lang: 'th',
    name: 'Thai',
    voiceLangs: ['th-TH', 'th'],
    speakerForms: { question: 'When you speak Thai, which polite word should Go teach you?', why: 'Thai speakers end polite sentences with ครับ (men) or ค่ะ / คะ (women), and say ผม or ฉัน for "I".' },
    script: {
      kind: 'thai',
      features: 'adapter',
      transliteration: { secureAfter: 2, retireAfterStep: 21 },
      segmentation: { secureAfter: 3, retireAfterStep: 24 },
      tones: true,
    },
    bands: { earlyScenes: 5, earlyMaxNew: 5, laterMaxNew: 6, laterMinCoverage: 0.6, exitMinCoverage: 0.95 },
    exit: { reading: { minCorrect: 0.8, maxLookups: 4 }, listening: { minCorrect: 0.7 }, writing: { minAccepted: 2 }, speaking: { minRecorded: 1 }, decoding: { minCorrect: 0.75 } },
    intro: 'Thai has its own letters, no spaces between words, and tones. You will learn them inside real Thai, step by step; romanization helps at first and then steps aside.',
  },
};

export function stage0Config(lang: LanguageCode): Stage0LanguageConfig {
  return STAGE0_LANGS[lang];
}
