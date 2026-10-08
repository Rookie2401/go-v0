/**
 * Stage 0 language configurations. Spanish, German and Albanian find their sound–spelling features by spelling patterns;
 * Hindi and Thai take them from their adapters' decoders (orth features: letters, mātrās, conjuncts, classes, tone rules).
 * Every sound explanation below is machine-drafted and awaits a teacher's or native speaker's review (TODO(review)).
 */
import type { LanguageCode } from '../../core';
import type { Stage0LanguageConfig, Stage0SpellingFeature } from './types';

export type { Stage0FadePolicy, Stage0LanguageConfig, Stage0SpellingFeature } from './types';

const LATIN_BANDS = { earlyScenes: 4, earlyMaxNew: 6, laterMaxNew: 8, laterMinCoverage: 0.6, exitMinCoverage: 0.95 };

/**
 * Sound-spelling features of Norwegian (Bokmål and Nynorsk spell alike here). The sounds are described for the East Norwegian
 * reference realisation, which is a reference and never a norm (docs/norway/SPEC.md section 6). Machine-draft, native review
 * pending (TODO(review)). The feature ids carry the language so that Bokmål and Nynorsk progress stay apart.
 */
const norwegianSpelling = (lang: 'nb' | 'nn'): Stage0SpellingFeature[] => [
  { id: `${lang}:kj`, label: 'kj, tj (and k before i, y, ø) — a soft hiss, like a whispered "hy" (kjære, tjue, kino)', pattern: /kj|tj|(?<!s)k(?=[iyø]|ei|øy)/ },
  { id: `${lang}:sj`, label: 'sj, skj (and sk before i, y, ø) — like sh (sjø, skjære, ski)', pattern: /sj|skj|sk(?=[iyø]|ei|øy)/ },
  { id: `${lang}:hj-hv`, label: 'hj, hv at the start — the h is silent (hjem, hva)', pattern: /^h[jv]/ },
  { id: `${lang}:silent-d`, label: 'd after n, l or r at the end of a word — silent (land, kald, jord)', pattern: /[nlr]dt?$/ },
  { id: `${lang}:ig`, label: '-ig, -lig at the end — said "-i", "-li" (riktig, vanlig)', pattern: /ig$/ },
  { id: `${lang}:o`, label: 'o — often an "oo" sound (bok, sko, god), sometimes "aw" (stor)', pattern: /o/ },
  { id: `${lang}:u`, label: 'u — a rounded sound with no English twin: say "ee" and round your lips (hus, ut)', pattern: /u/ },
  { id: `${lang}:y`, label: 'y — say "ee", round your lips (by, nytt; like German ü)', pattern: /y/ },
  { id: `${lang}:æ`, label: 'æ — like a in "cat" (være, ærlig)', pattern: /æ/ },
  { id: `${lang}:ø`, label: 'ø — say "e", round your lips (søster, før; like German ö)', pattern: /ø/ },
  { id: `${lang}:å`, label: 'å — like aw in "saw" (båt, gå)', pattern: /å/ },
  { id: `${lang}:rs`, label: 'rs, and r before t, d, n, l — the r joins the next sound (norsk, barn): in East Norwegian a curled tongue', pattern: /r[sdntl]/ },
  // length by letters: one consonant (or none) after the strong vowel = long, two or a doubled letter = short
  { id: `${lang}:vowel-length`, label: 'a vowel before one consonant — long (bil, være); before two — short (middag, mann)', pattern: /[aeiouyæøå](?:[^aeiouyæøå]{2}|[^aeiouyæøå](?:[aeiouyæøå]|$)|$)/ },
  // Bokmål only (added at the request of the Stage 0 package; machine-draft, native review pending)
  ...(lang === 'nb' ? [
    { id: 'nb:ei', label: 'ei, au, øy — diphthongs: ei as in "eye", au like "ow", øy like "uh-ee"', pattern: /ei|au|øy/ },
    { id: 'nb:eg', label: '-eg at the end — jeg, meg, deg sound like "yai, mai, dai"', pattern: /eg$/ },
    { id: 'nb:weak-e', label: 'unstressed endings -e, -er, -en, -et — a short, weak e', pattern: /[aeiouyæøå][^aeiouyæøå]+(?:e|er|en|et)$/ },
    { id: 'nb:gj', label: 'gj, and g before i or y — like y in "yes"', pattern: /gj|g(?=[iy])/ },
    { id: 'nb:det', label: 'det — the t is silent: "deh"', pattern: /^det$/ },
    { id: 'nb:lowercase', label: 'days and languages are written lowercase: søndag, norsk', pattern: /dag$|^norsk$/ },
  ] : []),
];

const NORWEGIAN_EXIT = { reading: { minCorrect: 0.8, maxLookups: 4 }, listening: { minCorrect: 0.7 }, writing: { minAccepted: 2 }, speaking: { minRecorded: 1, minSelfChecked: 1 } };

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
    exit: { reading: { minCorrect: 0.8, maxLookups: 4 }, listening: { minCorrect: 0.7 }, writing: { minAccepted: 2 }, speaking: { minRecorded: 1, minSelfChecked: 1 } },
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
        { id: 'de:au', label: 'au — like "ow" in "how" (Haus, auf)', pattern: /au/ },
        { id: 'de:s-z', label: 's before a vowel — a buzzing z (sie, sehr, Sonntag)', pattern: /(?<!s)s(?=[aeiouäöüy])/ },
        { id: 'de:j', label: 'j — like English y (ja)', pattern: /j/ },
        { id: 'de:sp-st', label: 'sp, st at the start — shp, sht', pattern: /^(sp|st)/ },
        // -ig is not devoiced to k: it is said like ich (König, richtig), so it gets its own feature below
        { id: 'de:final-devoicing', label: 'b, d, g at the end — said p, t, k (Hund = hunt)', pattern: /[bd]$|(?<!i)g$/ },
        { id: 'de:ig', label: '-ig at the end — said like ich, not like k (richtig, wenig)', pattern: /ig$/ },
        { id: 'de:long-vowel', label: 'a vowel before h, or doubled — long (sehr, Tee)', pattern: /[aeiouäöü]h|aa|ee|oo/ },
        // length by letters: one consonant (or none) after the strong vowel = long, two or a doubled letter = short
        { id: 'de:vowel-length', label: 'a vowel before one consonant — long (gut, sagen); before two — short (bitte, Wasser)', pattern: /[aeiouäöü](?:[^aeiouäöüy]{2}|[^aeiouäöüy](?:[aeiouäöüy]|$)|$)/ },
        { id: 'de:final-e', label: 'unstressed -e and -er at the end — a faint "uh" (bitte, Lehrer)', pattern: /[aeiouäöüy][^aeiouäöüy]+(?:e|er)$/ },
        { id: 'de:noun-capital', label: 'Every noun starts with a capital letter', pattern: /^[A-ZÄÖÜ]/, pos: 'NOUN', caseSensitive: true },
      ],
    },
    bands: LATIN_BANDS,
    exit: { reading: { minCorrect: 0.8, maxLookups: 4 }, listening: { minCorrect: 0.7 }, writing: { minAccepted: 2 }, speaking: { minRecorded: 1, minSelfChecked: 1 } },
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
    exit: { reading: { minCorrect: 0.8, maxLookups: 4 }, listening: { minCorrect: 0.7 }, writing: { minAccepted: 2 }, speaking: { minRecorded: 1, minSelfChecked: 1 } },
    intro: 'Albanian is spelled as it sounds, with a few letters of its own: you will read real Albanian at once.',
  },
  // machine-draft, native review pending. Bokmål is the course target; the Nynorsk config is the same spelling features under its own ids.
  nb: {
    lang: 'nb',
    name: 'Norwegian (Bokmål)',
    voiceLangs: ['nb-NO', 'nb', 'no-NO', 'no'],
    script: { kind: 'latin', features: 'spelling', spelling: norwegianSpelling('nb') },
    bands: LATIN_BANDS,
    exit: NORWEGIAN_EXIT,
    intro: 'Norwegian spelling follows a handful of patterns; you meet them in real sentences, not in a list.',
  },
  nn: {
    lang: 'nn',
    name: 'Norwegian (Nynorsk)',
    voiceLangs: ['nn-NO', 'nn'],
    script: { kind: 'latin', features: 'spelling', spelling: norwegianSpelling('nn') },
    bands: LATIN_BANDS,
    exit: NORWEGIAN_EXIT,
    intro: 'Nynorsk is spelled with the same patterns as Bokmål; you read it as the other written standard of Norwegian.',
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
    exit: { reading: { minCorrect: 0.8, maxLookups: 4 }, listening: { minCorrect: 0.7 }, writing: { minAccepted: 2 }, speaking: { minRecorded: 1, minSelfChecked: 1 }, decoding: { minCorrect: 0.8 } },
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
    exit: { reading: { minCorrect: 0.8, maxLookups: 4 }, listening: { minCorrect: 0.7 }, writing: { minAccepted: 2 }, speaking: { minRecorded: 1, minSelfChecked: 1 }, decoding: { minCorrect: 0.75 } },
    intro: 'Thai has its own letters, no spaces between words, and tones. You will learn them inside real Thai, step by step; romanization helps at first and then steps aside.',
  },
};

export function stage0Config(lang: LanguageCode): Stage0LanguageConfig {
  return STAGE0_LANGS[lang];
}
