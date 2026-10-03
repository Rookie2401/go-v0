/**
 * The Thai deck of the alphabet trainer: 44 consonants in the traditional order, then the vowels as patterns, then the four tone
 * marks.
 *
 * WHERE THE DATA COMES FROM. Whatever the reader's spelling engine knows is read FROM that engine, so the trainer and the reader
 * cannot disagree (src/adapters/thai/orthography.ts, via its public `decodeThai`, which gives the consonant class, the sound as
 * an initial and as a final, the vowel's length, IPA and Royal Institute spelling, and the tone a mark gives in each class). The
 * engine's tables are private to it, so each is asked by reading a tiny written syllable (ก + า for a consonant as an initial, กา +
 * the consonant for it as a final, the vowel written on ก, a mark on ก ข ค), and the test (test/alphabet/decks.test.ts) checks the
 * answers against the traditional classes.
 *
 * MACHINE-DRAFTED, not checked by a native speaker or a teacher: the letters' names (the words that go with them, "ก ไก่" = ko kai,
 * chicken), their meanings, the order of the vowels, the notes (which letters are obsolete or rare, what ห อ ย ว also do, how a
 * vowel is spelled when something follows it) and the names of the tone marks. The least certain: the names and meanings of ฎ ฏ ฑ ฒ
 * ฬ ษ ฌ, and the Royal Institute spelling of the names (romanised without tone marks).
 */
import { decodeThai } from '../adapters/thai/orthography';
import type { AlphabetCard, DetailLine } from './decks';

export const THAI_NOTE = 'Machine-drafted from the reader’s spelling rules and standard references; not yet checked by a Thai teacher or native speaker.';

const TONE_SUFFIX = /[˥˦˧˨˩]+$/;

/** The one syllable the reader's engine finds in a short written word (undefined when it finds none or more than one). */
function probe(word: string) {
  const syllables = decodeThai(word);
  return syllables.length === 1 ? syllables[0] : undefined;
}

// ───────────────────────────── consonants ─────────────────────────────

/** letter, its name in Thai, the name romanised (Royal Institute, no tone marks), what the name means. */
const CONSONANT_NAMES: ReadonlyArray<readonly [string, string, string, string]> = [
  ['ก', 'ไก่', 'ko kai', 'chicken'],
  ['ข', 'ไข่', 'kho khai', 'egg'],
  ['ฃ', 'ขวด', 'kho khuat', 'bottle'],
  ['ค', 'ควาย', 'kho khwai', 'water buffalo'],
  ['ฅ', 'คน', 'kho khon', 'person'],
  ['ฆ', 'ระฆัง', 'kho rakhang', 'bell'],
  ['ง', 'งู', 'ngo ngu', 'snake'],
  ['จ', 'จาน', 'cho chan', 'plate'],
  ['ฉ', 'ฉิ่ง', 'cho ching', 'small cymbals'],
  ['ช', 'ช้าง', 'cho chang', 'elephant'],
  ['ซ', 'โซ่', 'so so', 'chain'],
  ['ฌ', 'เฌอ', 'cho choe', 'tree'],
  ['ญ', 'หญิง', 'yo ying', 'woman'],
  ['ฎ', 'ชฎา', 'do chada', 'a dancer’s crown'],
  ['ฏ', 'ปฏัก', 'to patak', 'goad'],
  ['ฐ', 'ฐาน', 'tho than', 'pedestal, base'],
  ['ฑ', 'มณโฑ', 'tho montho', 'Montho, a figure from the Ramakien'],
  ['ฒ', 'ผู้เฒ่า', 'tho phu thao', 'elder'],
  ['ณ', 'เณร', 'no nen', 'novice monk'],
  ['ด', 'เด็ก', 'do dek', 'child'],
  ['ต', 'เต่า', 'to tao', 'turtle'],
  ['ถ', 'ถุง', 'tho thung', 'bag'],
  ['ท', 'ทหาร', 'tho thahan', 'soldier'],
  ['ธ', 'ธง', 'tho thong', 'flag'],
  ['น', 'หนู', 'no nu', 'mouse'],
  ['บ', 'ใบไม้', 'bo baimai', 'leaf'],
  ['ป', 'ปลา', 'po pla', 'fish'],
  ['ผ', 'ผึ้ง', 'pho phueng', 'bee'],
  ['ฝ', 'ฝา', 'fo fa', 'lid'],
  ['พ', 'พาน', 'pho phan', 'footed tray'],
  ['ฟ', 'ฟัน', 'fo fan', 'tooth'],
  ['ภ', 'สำเภา', 'pho samphao', 'sailing ship (a junk)'],
  ['ม', 'ม้า', 'mo ma', 'horse'],
  ['ย', 'ยักษ์', 'yo yak', 'giant, ogre'],
  ['ร', 'เรือ', 'ro ruea', 'boat'],
  ['ล', 'ลิง', 'lo ling', 'monkey'],
  ['ว', 'แหวน', 'wo waen', 'ring'],
  ['ศ', 'ศาลา', 'so sala', 'open pavilion'],
  ['ษ', 'ฤๅษี', 'so ruesi', 'hermit'],
  ['ส', 'เสือ', 'so suea', 'tiger'],
  ['ห', 'หีบ', 'ho hip', 'chest, box'],
  ['ฬ', 'จุฬา', 'lo chula', 'a star-shaped kite'],
  ['อ', 'อ่าง', 'o ang', 'basin'],
  ['ฮ', 'นกฮูก', 'ho nokhuk', 'owl'],
];

const OBSOLETE = new Set(['ฃ', 'ฅ']);
/** Letters used almost only in words from Pali and Sanskrit. */
const INDIC = new Set(['ฆ', 'ฌ', 'ฎ', 'ฏ', 'ฐ', 'ฑ', 'ฒ', 'ณ', 'ษ', 'ฬ']);

const CLASS_TEXT = { mid: 'mid class', high: 'high class', low: 'low class' } as const;

function consonantCard(letter: string, nameThai: string, nameRoman: string, meaning: string): AlphabetCard {
  const asInitial = probe(`${letter}า`); // the letter before ◌า: mid, high or low class, and the initial sound
  const initialIpa = asInitial?.ipa ? asInitial.ipa.slice(0, Math.max(0, asInitial.ipa.indexOf('aː'))) : '';
  const initialRom = asInitial?.romanization ? asInitial.romanization.slice(0, -1) : '';
  const asFinal = probe(`กา${letter}`); // the letter closing กา: its final sound, if it has one
  const finalIpa = asFinal?.finalSound && asFinal.ipa ? asFinal.ipa.slice('kaː'.length).replace(TONE_SUFFIX, '') : '';
  const finalRom = asFinal?.finalSound && asFinal.romanization ? asFinal.romanization.slice(2) : '';

  const silent = initialRom === '';
  const answer = silent ? `– /${initialIpa}/ (no consonant sound)` : `${initialRom} /${initialIpa}/`;
  const details: DetailLine[] = [
    { label: 'Name', value: `${nameRoman}, “${meaning}”`, script: nameThai },
    { label: 'Class', value: asInitial?.initialClass ? CLASS_TEXT[asInitial.initialClass] : '' },
    { label: 'As an initial', value: silent ? `no consonant sound: it carries the vowel (glottal stop /${initialIpa}/)` : `${initialRom} /${initialIpa}/` },
    { label: 'As a final', value: finalRom ? `${finalRom} /${finalIpa}/` : 'not used as a final consonant' },
  ];
  if (OBSOLETE.has(letter)) details.push({ label: 'Note', value: 'obsolete: no longer used in writing, though it keeps its place in the alphabet (it is read like ' + (letter === 'ฃ' ? 'ข' : 'ค') + ').' });
  else if (INDIC.has(letter)) details.push({ label: 'Note', value: 'mostly found in words from Pali and Sanskrit.' });
  else if (letter === 'ห') details.push({ label: 'Note', value: 'also written silently before a low-class sonorant (ง ญ น ม ย ร ล ว) to raise its class, as in หมา.' });
  else if (letter === 'อ') details.push({ label: 'Note', value: 'also a vowel (◌อ); and it holds the place of a consonant before a vowel that starts a word.' });
  else if (letter === 'ย' || letter === 'ว') details.push({ label: 'Note', value: 'also part of vowels (เ◌ีย, ◌ัว) and ends syllables as a glide.' });
  return { id: `th:consonant:${letter}`, glyph: letter, kind: 'consonant', answer, details };
}

// ───────────────────────────── vowels ─────────────────────────────

interface VowelSpec {
  /** The vowel as written; ◌ marks where the consonant goes. */
  pattern: string;
  /** A syllable written with it on ก, read by the engine. */
  example: string;
  /** The vowel is only ever written with a final consonant after it. */
  closedOnly?: boolean;
  note?: string;
}

const VOWELS: readonly VowelSpec[] = [
  { pattern: '◌ะ', example: 'กะ', note: 'sara a. A short vowel with no consonant after it.' },
  { pattern: '◌า', example: 'กา', note: 'sara aa.' },
  { pattern: '◌ั', example: 'กัน', closedOnly: true, note: 'mai han-akat: the same short a as ◌ะ, but only when a final consonant follows (กัน).' },
  { pattern: '◌ิ', example: 'กิ', note: 'sara i.' },
  { pattern: '◌ี', example: 'กี', note: 'sara ii.' },
  { pattern: '◌ึ', example: 'กึ', note: 'sara ue (short).' },
  { pattern: '◌ื', example: 'กื', note: 'sara uee: written ◌ื before a final consonant, and ◌ือ when nothing follows.' },
  { pattern: '◌ุ', example: 'กุ', note: 'sara u.' },
  { pattern: '◌ู', example: 'กู', note: 'sara uu.' },
  { pattern: 'เ◌ะ', example: 'เกะ', note: 'sara e (short).' },
  { pattern: 'เ◌', example: 'เก', note: 'sara ee: the เ is written first but said after the consonant.' },
  { pattern: 'แ◌ะ', example: 'แกะ', note: 'sara ae (short).' },
  { pattern: 'แ◌', example: 'แก', note: 'sara aae.' },
  { pattern: 'โ◌ะ', example: 'โกะ', note: 'sara o (short).' },
  { pattern: 'โ◌', example: 'โก', note: 'sara oo.' },
  { pattern: 'เ◌าะ', example: 'เกาะ', note: 'sara aw (short).' },
  { pattern: '◌อ', example: 'กอ', note: 'sara aw (long).' },
  { pattern: 'เ◌อะ', example: 'เกอะ', note: 'sara oe (short).' },
  { pattern: 'เ◌อ', example: 'เกอ', note: 'sara oe (long).' },
  { pattern: 'เ◌ียะ', example: 'เกียะ', note: 'sara ia (short).' },
  { pattern: 'เ◌ีย', example: 'เกีย', note: 'sara ia (long).' },
  { pattern: 'เ◌ือะ', example: 'เกือะ', note: 'sara uea (short).' },
  { pattern: 'เ◌ือ', example: 'เกือ', note: 'sara uea (long).' },
  { pattern: '◌ัวะ', example: 'กัวะ', note: 'sara ua (short).' },
  { pattern: '◌ัว', example: 'กัว', note: 'sara ua (long).' },
  { pattern: '◌ำ', example: 'กำ', note: 'sara am: the vowel a followed by the sound m.' },
  { pattern: 'ใ◌', example: 'ใก', note: 'mai muan: said ai; used in about twenty words (ใหม่, ใจ, ใน …).' },
  { pattern: 'ไ◌', example: 'ไก', note: 'mai malai: said ai; the common way of writing it.' },
  { pattern: 'เ◌า', example: 'เกา', note: 'said ao.' },
];

function vowelCard(v: VowelSpec): AlphabetCard {
  const s = probe(v.example);
  let rom = '';
  let ipa = '';
  if (s?.ipa && s.romanization) {
    const core = s.ipa.replace(TONE_SUFFIX, '').slice(1); // drop the initial k
    // a written final consonant (the ◌ั example ends in น) is not part of the vowel
    ipa = s.final ? core.slice(0, -1) : core;
    rom = s.final ? (s.vowelSound ?? '') : s.romanization.slice(1);
  }
  const length = s?.vowelLength ?? 'short';
  const lengthText = v.closedOnly ? `${length}, with a final consonant` : length;
  const written = v.pattern.replace('◌', 'ก');
  const details: DetailLine[] = [
    { label: 'Written', value: `the pattern ${v.pattern}: the consonant goes where ◌ is (here it is ก)`, script: written },
    { label: 'Sound', value: `${rom} /${ipa}/` },
    { label: 'Length', value: length },
  ];
  if (v.note) details.push({ label: 'Note', value: v.note });
  return {
    id: `th:vowel:${v.pattern}`, glyph: v.pattern, kind: 'vowel', answer: `${rom} /${ipa}/ (${lengthText})`,
    carrier: '◌ stands for the consonant', details,
  };
}

// ───────────────────────────── tone marks ─────────────────────────────

const TONE_MARKS: ReadonlyArray<readonly [string, string, string]> = [
  ['่', 'ไม้เอก', 'mai ek'],
  ['้', 'ไม้โท', 'mai tho'],
  ['๊', 'ไม้ตรี', 'mai tri'],
  ['๋', 'ไม้จัตวา', 'mai chattawa'],
];

/** The tone the engine gives a mark after a mid (ก), high (ข) and low (ค) class consonant. */
function toneByClass(mark: string): DetailLine[] {
  const classes: ReadonlyArray<readonly [string, string]> = [['ก', 'mid'], ['ข', 'high'], ['ค', 'low']];
  return classes.map(([c, cls]) => {
    const written = `${c}${mark}า`;
    const tone = probe(written)?.tone;
    return { label: `After a ${cls}-class consonant`, value: tone ? `${tone} tone` : 'not used', script: written };
  });
}

function toneCard(mark: string, nameThai: string, nameRoman: string): AlphabetCard {
  return {
    id: `th:tone-mark:${mark}`, glyph: `◌${mark}`, kind: 'tone-mark', answer: nameRoman, prompt: 'What is this mark called?',
    carrier: '◌ stands for the consonant it sits over',
    details: [
      { label: 'Name', value: nameRoman, script: nameThai },
      ...toneByClass(mark),
      { label: 'Note', value: 'a tone mark changes the tone the consonant’s class and the ending would give; with no mark the tone comes from the class, the vowel length and the ending.' },
    ],
  };
}

export const THAI_CARDS: AlphabetCard[] = [
  ...CONSONANT_NAMES.map(([letter, nameThai, nameRoman, meaning]) => consonantCard(letter, nameThai, nameRoman, meaning)),
  ...VOWELS.map(vowelCard),
  ...TONE_MARKS.map(([mark, nameThai, nameRoman]) => toneCard(mark, nameThai, nameRoman)),
];
