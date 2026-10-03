/**
 * The Hindi (Devanagari) deck of the alphabet trainer, in the order it is taught: the independent vowels, the 33 core consonants
 * by row of the varṇamālā, the vowel signs (mātrāeṃ), the four marks (anusvāra, candrabindu, visarga, virāma), the conjuncts and
 * the nukta letters.
 *
 * WHERE THE DATA COMES FROM. From the reader's own tables (src/adapters/hindi/orth-tables.ts): the ISO 15919 transliteration of
 * every consonant, nukta letter, independent vowel and vowel sign (`CONSONANT_ISO`, `NUKTA_ISO`, `INDEPENDENT_VOWELS`,
 * `VOWEL_SIGNS`), the length of each vowel, the notes on the nukta letters (`NUKTA_NOTE`), and the nasal an anusvāra stands for
 * before each row (`classNasal`), so the trainer and the reader agree. The repository has no IPA for single letters, so the IPA is
 * drafted here.
 *
 * MACHINE-DRAFTED, not checked by a native speaker or a teacher: the IPA of every letter (standard modern Hindi values, one per
 * letter), the names and descriptions of the rows, the voicing and aspiration, the order of the vowel signs and marks, and the
 * notes. The least certain: ष (ṣ, written as the retroflex but said like श in Hindi), क्ष and ज्ञ (their spoken value varies:
 * kʃ or kʂ, ɡj or d͡ʒɲ), the r (a tap in most speech, a trill in some), the vowel ऋ (said ri) and the visarga (a faint ɦ).
 */
import { CONSONANT_ISO, INDEPENDENT_VOWELS, NUKTA_ISO, NUKTA_NOTE, VOWEL_SIGNS, classNasal } from '../adapters/hindi/orth-tables';
import type { AlphabetCard, DetailLine } from './decks';

export const HINDI_NOTE = 'Machine-drafted from the reader’s transliteration tables and standard references; not yet checked by a Hindi teacher or native speaker.';

const VIRAMA = '्';
const NUKTA = '़';
const ANUSVARA = 'ं';
const CANDRABINDU = 'ँ';
const VISARGA = 'ः';
const CARRIER = 'क';

const iso = (letter: string): string => CONSONANT_ISO[letter] ?? letter;

// ───────────────────────────── independent vowels ─────────────────────────────

/** independent vowel, its IPA. */
const VOWEL_IPA: ReadonlyArray<readonly [string, string]> = [
  ['अ', 'ə'], ['आ', 'aː'], ['इ', 'ɪ'], ['ई', 'iː'], ['उ', 'ʊ'], ['ऊ', 'uː'], ['ऋ', 'rɪ'], ['ए', 'eː'], ['ऐ', 'ɛː'], ['ओ', 'oː'], ['औ', 'ɔː'],
];
const SIGN_OF: Readonly<Record<string, string>> = {
  'आ': 'ा', 'इ': 'ि', 'ई': 'ी', 'उ': 'ु', 'ऊ': 'ू', 'ऋ': 'ृ', 'ए': 'े', 'ऐ': 'ै', 'ओ': 'ो', 'औ': 'ौ',
};

function vowelCard(letter: string, ipa: string): AlphabetCard {
  const info = INDEPENDENT_VOWELS[letter];
  const sign = SIGN_OF[letter];
  const details: DetailLine[] = [
    { label: 'Length', value: info.length },
    sign
      ? { label: 'With a consonant', value: `with a consonant it is written as the sign ${sign}`, script: `${CARRIER}${sign}` }
      : { label: 'With a consonant', value: 'it has no sign: every consonant already carries it (the inherent a)' },
  ];
  if (letter === 'ऋ') details.push({ label: 'Note', value: 'a vowel from Sanskrit; in Hindi it is said ri.' });
  if (letter === 'ए' || letter === 'ओ') details.push({ label: 'Note', value: 'always long in Hindi, a pure vowel (no glide).' });
  return { id: `hi:vowel:${letter}`, glyph: letter, kind: 'vowel', answer: `${info.iso} /${ipa}/`, details };
}

/** अं and अः: the vowel a with a nasal sign or a visarga, listed with the vowels in the traditional chart. */
function vowelWithSignCard(sign: string, isoText: string, ipa: string, what: string): AlphabetCard {
  const glyph = 'अ' + sign;
  return {
    id: `hi:vowel:${glyph}`, glyph, kind: 'vowel', answer: `${isoText} /${ipa}/`,
    details: [
      { label: 'Made of', value: `अ and the ${what} sign`, script: `◌${sign}` },
      { label: 'Note', value: 'the last two entries of the traditional vowel chart; the signs are also written on consonants (कं, कः).' },
    ],
  };
}

// ───────────────────────────── consonants ─────────────────────────────

interface Row { name: string; place: string; letters: string; ipa: readonly string[] }

const ROWS: readonly Row[] = [
  { name: 'ka-varga', place: 'velar (kaṇṭhya): the back of the tongue against the soft palate', letters: 'कखगघङ', ipa: ['k', 'kʰ', 'ɡ', 'ɡʱ', 'ŋ'] },
  { name: 'ca-varga', place: 'palatal (tālavya): the blade of the tongue against the hard palate', letters: 'चछजझञ', ipa: ['t͡ʃ', 't͡ʃʰ', 'd͡ʒ', 'd͡ʒʱ', 'ɲ'] },
  { name: 'ṭa-varga', place: 'retroflex (mūrdhanya): the tongue tip curled back', letters: 'टठडढण', ipa: ['ʈ', 'ʈʰ', 'ɖ', 'ɖʱ', 'ɳ'] },
  { name: 'ta-varga', place: 'dental (dantya): the tongue tip against the upper teeth', letters: 'तथदधन', ipa: ['t̪', 't̪ʰ', 'd̪', 'd̪ʱ', 'n'] },
  { name: 'pa-varga', place: 'labial (oṣṭhya): the lips', letters: 'पफबभम', ipa: ['p', 'pʰ', 'b', 'bʱ', 'm'] },
];

const POSITION: ReadonlyArray<readonly [string, string]> = [
  ['voiceless', 'unaspirated'], ['voiceless', 'aspirated (with a puff of breath)'], ['voiced', 'unaspirated'], ['voiced', 'aspirated (with a puff of breath)'], ['voiced', 'nasal'],
];

/** The consonants after the five rows: place, voicing and manner, and IPA. */
const OTHERS: ReadonlyArray<{ letter: string; ipa: string; place: string; voicing: string; manner: string }> = [
  { letter: 'य', ipa: 'j', place: 'palatal', voicing: 'voiced', manner: 'semivowel (like English y)' },
  { letter: 'र', ipa: 'ɾ', place: 'dental-alveolar', voicing: 'voiced', manner: 'a tap of the tongue tip (a trill in some speech)' },
  { letter: 'ल', ipa: 'l', place: 'dental-alveolar', voicing: 'voiced', manner: 'lateral (like English l)' },
  { letter: 'व', ipa: 'ʋ', place: 'labio-dental', voicing: 'voiced', manner: 'semivowel between English v and w' },
  { letter: 'श', ipa: 'ʃ', place: 'palatal', voicing: 'voiceless', manner: 'sibilant (like English sh)' },
  { letter: 'ष', ipa: 'ʂ', place: 'retroflex', voicing: 'voiceless', manner: 'sibilant: written as the retroflex, but in Hindi said much like श' },
  { letter: 'स', ipa: 's', place: 'dental', voicing: 'voiceless', manner: 'sibilant (like English s)' },
  { letter: 'ह', ipa: 'ɦ', place: 'glottal', voicing: 'voiced', manner: 'a breathy h' },
];

function consonantCard(letter: string, ipa: string, place: string, voicing: string, manner: string, rowName?: string): AlphabetCard {
  const details: DetailLine[] = [];
  if (rowName) details.push({ label: 'Row', value: `${rowName} — ${place}` });
  else details.push({ label: 'Place', value: place });
  details.push({ label: 'Voicing', value: voicing }, { label: rowName ? 'Aspiration' : 'Manner', value: manner });
  details.push({ label: 'Written alone', value: `it is read with the inherent a: ${iso(letter)}a, not ${iso(letter)} (the a is dropped at the end of most words)`, script: letter });
  const nasal = classNasal(letter);
  if (nasal) details.push({ label: 'Anusvāra before it', value: `an anusvāra (ं) written before this letter is said ${nasal}` });
  if (letter === 'ङ' || letter === 'ञ') details.push({ label: 'Note', value: 'a nasal that occurs only before its own row; in writing it is usually replaced by the anusvāra (ं).' });
  if (letter === 'ण') details.push({ label: 'Note', value: 'a retroflex nasal from Sanskrit; in Hindi often said much like n.' });
  return { id: `hi:consonant:${letter}`, glyph: letter, kind: 'consonant', answer: `${iso(letter)} /${ipa}/`, details };
}

const CONSONANT_CARDS: AlphabetCard[] = [
  ...ROWS.flatMap((row) => [...row.letters].map((letter, i) =>
    consonantCard(letter, row.ipa[i], row.place, POSITION[i][0], POSITION[i][1], row.name))),
  ...OTHERS.map((o) => consonantCard(o.letter, o.ipa, o.place, o.voicing, o.manner)),
];

// ───────────────────────────── vowel signs ─────────────────────────────

const SIGN_ORDER = ['ा', 'ि', 'ी', 'ु', 'ू', 'ृ', 'े', 'ै', 'ो', 'ौ'];
const SIGN_IPA: Readonly<Record<string, string>> = { 'ा': 'aː', 'ि': 'ɪ', 'ी': 'iː', 'ु': 'ʊ', 'ू': 'uː', 'ृ': 'rɪ', 'े': 'eː', 'ै': 'ɛː', 'ो': 'oː', 'ौ': 'ɔː' };

function signCard(sign: string): AlphabetCard {
  const info = VOWEL_SIGNS[sign];
  const glyph = CARRIER + sign;
  const independent = Object.entries(SIGN_OF).find(([, s]) => s === sign)?.[0];
  const ipa = SIGN_IPA[sign];
  const details: DetailLine[] = [
    { label: 'The sign', value: 'the vowel sign (mātrā) on its own', script: `◌${sign}` },
    { label: 'Vowel', value: `${info.iso} /${ipa}/, ${info.length}${independent ? ': the same vowel written alone' : ''}`, script: independent },
  ];
  if (sign === 'ि') details.push({ label: 'Note', value: 'written before the consonant but said after it: कि is k + i.' });
  if (sign === 'े' || sign === 'ै' || sign === 'ो' || sign === 'ौ') details.push({ label: 'Note', value: 'a mark above (े ै) or after the consonant (ो ौ) that stands for a long vowel.' });
  return {
    id: `hi:vowel-sign:${sign}`, glyph, kind: 'vowel-sign', answer: `k${info.iso} /k${ipa}/`,
    carrier: `the sign is shown on ${CARRIER}`, details,
  };
}

// ───────────────────────────── marks ─────────────────────────────

const ROW_SAMPLES = ['क', 'च', 'ट', 'त', 'प'];

function markCards(): AlphabetCard[] {
  const nasalRows = ROW_SAMPLES.map((c) => `before ${c} ${classNasal(c)}`).join(', ');
  return [
    {
      id: `hi:mark:${ANUSVARA}`, glyph: CARRIER + ANUSVARA, kind: 'mark', answer: 'anusvāra ṃ: a nasal after the vowel', prompt: 'What does it do?',
      carrier: `the sign is shown on ${CARRIER}`,
      details: [
        { label: 'Name', value: 'anusvāra (the dot above), ISO ṃ' },
        { label: 'Sound', value: `nasalises the vowel, or stands for the nasal of the next letter’s row: ${nasalRows}` },
      ],
    },
    {
      id: `hi:mark:${CANDRABINDU}`, glyph: CARRIER + CANDRABINDU, kind: 'mark', answer: 'candrabindu m̐: a nasalised vowel', prompt: 'What does it do?',
      carrier: `the sign is shown on ${CARRIER}`,
      details: [
        { label: 'Name', value: 'candrabindu (the moon and dot), ISO m̐' },
        { label: 'Sound', value: 'a nasalised vowel, as in the French “on”; it is used when the vowel has no letter above to take the anusvāra dot (हँसना).' },
      ],
    },
    {
      id: `hi:mark:${VISARGA}`, glyph: CARRIER + VISARGA, kind: 'mark', answer: 'visarga ḥ: a breathy h after the vowel', prompt: 'What does it do?',
      carrier: `the sign is shown on ${CARRIER}`,
      details: [
        { label: 'Name', value: 'visarga (the two dots), ISO ḥ' },
        { label: 'Sound', value: 'a faint h /ɦ/ after the vowel; found mostly in words from Sanskrit (दुःख).' },
      ],
    },
    {
      id: `hi:mark:${VIRAMA}`, glyph: CARRIER + VIRAMA, kind: 'mark', answer: 'virāma: no vowel, the consonant stands bare', prompt: 'What does it do?',
      carrier: `the sign is shown on ${CARRIER}`,
      details: [
        { label: 'Name', value: 'virāma or halant (the foot mark)' },
        { label: 'Sound', value: 'takes away the inherent a: क् is k, not ka. It joins a consonant to the next one in a conjunct (क्ष, त्र).' },
      ],
    },
  ];
}

// ───────────────────────────── conjuncts and nukta letters ─────────────────────────────

const CONJUNCTS: ReadonlyArray<{ first: string; second: string; ipa: string; note: string }> = [
  { first: 'क', second: 'ष', ipa: 'kʃ', note: 'said ksh in Hindi (kʃ, in some speech kʂ); in some Hindi words it is said chh.' },
  { first: 'त', second: 'र', ipa: 't̪ɾ', note: 'the र is written as a small stroke on the first letter’s stem.' },
  { first: 'ज', second: 'ञ', ipa: 'ɡj', note: 'said gya in Hindi (ɡj); in Sanskrit it is jña.' },
  { first: 'श', second: 'र', ipa: 'ʃɾ', note: 'the र is written as a small stroke on the first letter’s stem.' },
];

function conjunctCard(first: string, second: string, ipa: string, note: string): AlphabetCard {
  const glyph = first + VIRAMA + second;
  return {
    id: `hi:conjunct:${glyph}`, glyph, kind: 'conjunct', answer: `${iso(first)}${iso(second)} /${ipa}/`,
    details: [
      { label: 'Made of', value: `${first} + virāma (्) + ${second}: the first consonant has no vowel and joins the second` },
      { label: 'Letters', value: `${iso(first)} + ${iso(second)}` },
      { label: 'Note', value: note },
    ],
  };
}

/** nukta letter, its IPA. */
const NUKTA_LETTERS: ReadonlyArray<readonly [string, string]> = [
  ['क', 'q'], ['ख', 'x'], ['ग', 'ɣ'], ['ज', 'z'], ['ड', 'ɽ'], ['ढ', 'ɽʱ'], ['फ', 'f'],
];

function nuktaCard(base: string, ipa: string): AlphabetCard {
  const glyph = base + NUKTA;
  const sound = NUKTA_ISO[glyph] ?? iso(base);
  const details: DetailLine[] = [
    { label: 'Made of', value: `${base} (${iso(base)}) with a dot below, the nukta (़)` },
  ];
  if (NUKTA_NOTE[glyph]) details.push({ label: 'Sound', value: NUKTA_NOTE[glyph] });
  details.push({ label: 'Note', value: 'the dot marks a sound that Hindi borrowed or splits off; in everyday writing it is often left out.' });
  return { id: `hi:nukta:${glyph}`, glyph, kind: 'nukta', answer: `${sound} /${ipa}/`, details };
}

export const HINDI_CARDS: AlphabetCard[] = [
  ...VOWEL_IPA.map(([letter, ipa]) => vowelCard(letter, ipa)),
  vowelWithSignCard(ANUSVARA, 'aṃ', 'ə̃', 'anusvāra'),
  vowelWithSignCard(VISARGA, 'aḥ', 'əɦ', 'visarga'),
  ...CONSONANT_CARDS,
  ...SIGN_ORDER.map(signCard),
  ...markCards(),
  ...CONJUNCTS.map((c) => conjunctCard(c.first, c.second, c.ipa, c.note)),
  ...NUKTA_LETTERS.map(([base, ipa]) => nuktaCard(base, ipa)),
];
