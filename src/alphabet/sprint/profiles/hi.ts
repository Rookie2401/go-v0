/**
 * Hindi (Devanagari) for an English reader. Devanagari is an ABUGIDA: a consonant letter is a syllable (क is ka), a vowel sign
 * (matra) changes the vowel, a virama strips it, and the vowel a that is written nowhere is sometimes not said. So the Sprint teaches
 * consonants, signs and three RULES (the inherent a, the dropped a, the conjunct), not one-letter-one-sound.
 *
 * Unit keys are the Alphabet deck's own glyphs (alphabetLetters.thhi.ts HI_LETTERS): the vowel signs are keyed as the deck shows them,
 * on क (का for ◌ा), the marks too (कं कँ कः क्), so cards already practised carry over. Sounds come from the deck's rows (ISO 15919 and
 * IPA from the reader's own tables), with an English hint. MACHINE-DRAFTED: no Hindi teacher or native speaker has checked it.
 * Spoken values follow the pack's decoder (src/adapters/hindi/pronunciation.ts).
 */
import { aksharas, isDevanagariConsonant, isIndependentVowel } from '../../../adapters/hindi/script';
import { decodeHindi } from '../../../adapters/hindi/pronunciation';
import { PHRASES, WORDS } from '../words/hi';
import type { ScriptProfile, ScriptUnit } from '../types';

const U = (key: string, kind: ScriptUnit['kind'], display: string, sound: string, extra: Partial<ScriptUnit> = {}): ScriptUnit => ({ key, kind, display, sound, ...extra });

// [glyph, sound, difficulty]
const CONSONANTS: ReadonlyArray<readonly [string, string, (1 | 2 | 3)?]> = [
  ['क', 'k /k/ as in skip (ka)'], ['ख', 'kh /kʰ/ k with a puff of air'], ['ग', 'g /ɡ/ as in go'], ['घ', 'gh /ɡʱ/ g with a breath', 2], ['ङ', 'ṅ /ŋ/ ng as in sing; rare alone', 2],
  ['च', 'c /t͡ʃ/ ch as in chair'], ['छ', 'ch /t͡ʃʰ/ ch with a puff of air', 2], ['ज', 'j /d͡ʒ/ as in jar'], ['झ', 'jh /d͡ʒʱ/ j with a breath', 2], ['ञ', 'ñ /ɲ/ ny; rare alone', 2],
  ['ट', 'ṭ /ʈ/ t with the tongue curled back'], ['ठ', 'ṭh /ʈʰ/ ṭ with a puff of air', 2], ['ड', 'ḍ /ɖ/ d with the tongue curled back'], ['ढ', 'ḍh /ɖʱ/ ḍ with a breath', 2], ['ण', 'ṇ /ɳ/ n with the tongue curled back', 2],
  ['त', 't /t̪/ t with the tongue on the teeth'], ['थ', 'th /t̪ʰ/ t̪ with a puff of air'], ['द', 'd /d̪/ d with the tongue on the teeth'], ['ध', 'dh /d̪ʱ/ d̪ with a breath', 2], ['न', 'n /n/ as in no'],
  ['प', 'p /p/ as in spin'], ['फ', 'ph /pʰ/ p with a puff of air'], ['ब', 'b /b/ as in bat'], ['भ', 'bh /bʱ/ b with a breath', 2], ['म', 'm /m/ as in man'],
  ['य', 'y /j/ as in yes'], ['र', 'r /ɾ/ a quick tap, as the r in butter'], ['ल', 'l /l/ as in lamp'], ['व', 'v /ʋ/ between v and w'],
  ['श', 'ś /ʃ/ sh as in ship'], ['ष', 'ṣ /ʂ/ said like श (sh)', 2], ['स', 's /s/ as in sun'], ['ह', 'h /ɦ/ as in hat'],
];
const NUKTA_LETTERS: ReadonlyArray<readonly [string, string]> = [
  ['क़', 'q /q/ k from far back in the throat'], ['ख़', 'ḵẖ /x/ rough kh as in loch'], ['ग़', 'ġ /ɣ/ a gargled g'], ['ज़', 'z /z/ as in zoo'],
  ['ड़', 'ṛ /ɽ/ a flapped r, tongue tip curled'], ['ढ़', 'ṛh /ɽʱ/ ṛ with a breath'], ['फ़', 'f /f/ as in fan'],
];
// [independent vowel, sound, its sign]
const VOWELS: ReadonlyArray<readonly [string, string, string]> = [
  ['अ', 'a /ə/ as in about', ''], ['आ', 'ā /aː/ as in father', 'ा'], ['इ', 'i /ɪ/ as in sit', 'ि'], ['ई', 'ī /iː/ as in see', 'ी'], ['उ', 'u /ʊ/ as in put', 'ु'],
  ['ऊ', 'ū /uː/ as in food', 'ू'], ['ऋ', 'r̥ /rɪ/ said ri; mostly in Sanskrit words', 'ृ'], ['ए', 'e /eː/ as in say, pure', 'े'], ['ऐ', 'ai /ɛː/ as in cat, long', 'ै'],
  ['ओ', 'o /oː/ as in go, pure', 'ो'], ['औ', 'au /ɔː/ as in law', 'ौ'],
];
const CARRIER = 'क';
const CONJUNCTS: ReadonlyArray<readonly [string, string]> = [
  ['क्ष', 'kṣ /kʃ/ k + ṣ joined (often said ksh or chh)'], ['त्र', 'tr /t̪ɾ/ t + r joined'], ['ज्ञ', 'jñ /ɡj/ j + ñ joined (said gy)'], ['श्र', 'śr /ʃɾ/ ś + r joined'],
];

const UNITS: ScriptUnit[] = [
  U('rule-inherent-a', 'rule', 'कमल', 'a consonant with no vowel sign carries a short a: क is ka, म is ma', { difficulty: 1, example: { form: 'कमल', gloss: 'lotus' } }),
  U('rule-schwa', 'rule', 'लड़का', 'that written-nowhere a is often NOT said: at the end of a word and between syllables (लड़का is laṛkā, not laṛakā)', { difficulty: 3 }),
  U('rule-conjunct', 'rule', 'स्कूल', 'two consonants joined with no vowel between them, the first one shortened or fused (स् + कू = स्कू)', { difficulty: 2 }),
  ...VOWELS.map(([g, s]) => U(g, 'letter', g, s, { difficulty: g === 'अ' || g === 'आ' ? 1 : 2 })),
  ...CONSONANTS.map(([g, s, d]) => U(g, 'letter', g, s, d ? { difficulty: d } : {})),
  ...VOWELS.filter(([, , sign]) => sign).map(([g, s, sign]) => U(CARRIER + sign, 'vowel-sign', '◌' + sign, `the vowel sign for ${g}, shown on क (${CARRIER}${sign}): ${s}`, { difficulty: 2 })),
  U('कं', 'mark', 'ं', 'anusvāra ṃ: a nasal n/m after the vowel (हिंदी)', { difficulty: 2 }),
  U('कँ', 'mark', 'ँ', 'candrabindu m̐: the vowel is nasalised (हूँ)', { difficulty: 2 }),
  U('कः', 'mark', 'ः', 'visarga ḥ: a faint breath h after the vowel (rare)', { difficulty: 2 }),
  U('क्', 'mark', '्', 'virāma: no vowel, the consonant stands bare (the final त् of अर्थात्)', { difficulty: 2 }),
  ...NUKTA_LETTERS.map(([g, s]) => U(g, 'letter', g, s, { difficulty: 2 })),
  ...CONJUNCTS.map(([g, s]) => U(g, 'cluster', g, s, { difficulty: 2 })),
];

const SIGN_KEY: Record<string, string> = Object.fromEntries(VOWELS.filter(([, , s]) => s).map(([, , s]) => ['◌' + s, CARRIER + s]));
const LETTER_KEYS = new Set<string>([...CONSONANTS.map(([g]) => g), ...NUKTA_LETTERS.map(([g]) => g)]);
const VOWEL_KEYS = new Set<string>(VOWELS.map(([g]) => g));
const CONJUNCT_KEYS = new Set<string>(CONJUNCTS.map(([g]) => g));
const SIGN_MARK: Record<string, string> = { anusvara: 'कं', chandrabindu: 'कँ', visarga: 'कः' };
const HANDLED_SIGNS = new Set(['nukta', 'reph', 'rakar', 'virama', 'anusvara', 'chandrabindu', 'visarga']);

/** The units a Hindi word needs; undefined when anything in it is outside the profile (loan sign ॉ, avagraha, other scripts, digits). */
function dependencies(form: string): readonly string[] | undefined {
  const text = form.normalize('NFC');
  const keys: string[] = [];
  const add = (k: string): void => { if (!keys.includes(k)) keys.push(k); };
  for (const a of aksharas(text)) {
    if (a.consonants.length === 0 && !a.vowel) {
      if (/^[\p{P}\p{S}\p{Z}\p{Cf}\p{Cc}]+$/u.test(a.text)) continue; // danda, spaces, joiners
      return undefined; // Latin, digits, ॐ, stress marks …
    }
    for (const s of a.signs) if (!HANDLED_SIGNS.has(s)) return undefined;
    if (a.consonants.length === 0) { // an independent vowel
      if (!a.vowel || !isIndependentVowel(a.vowel) || !VOWEL_KEYS.has(a.vowel)) return undefined;
      add(a.vowel);
    } else {
      const used = new Array(a.consonants.length).fill(false) as boolean[];
      for (let i = 0; i + 1 < a.consonants.length; i++) {
        const pair = `${a.consonants[i]}्${a.consonants[i + 1]}`;
        if (CONJUNCT_KEYS.has(pair) && !used[i] && !used[i + 1]) { add(pair); used[i] = used[i + 1] = true; }
      }
      for (let i = 0; i < a.consonants.length; i++) {
        const c = a.consonants[i];
        if (!isDevanagariConsonant(c[0]) || !LETTER_KEYS.has(c)) return undefined;
        if (!used[i]) add(c);
      }
      if (a.consonants.length >= 2) add('rule-conjunct');
      if (a.dead) add('क्');
      else if (a.vowel) { const k = SIGN_KEY[a.vowel]; if (!k) return undefined; add(k); } // the sign card is SHOWN on क; reading a sign does not need क
      else add('rule-inherent-a');
    }
    for (const [sign, key] of Object.entries(SIGN_MARK)) if (a.signs.includes(sign)) add(key);
  }
  if (keys.length === 0) return undefined;
  // the a that is not said: ask the pack's own decoder
  if (decodeHindi(text).some((u) => u.inherentVowel === 'dropped' && !aksharas(u.text).every((x) => x.dead))) add('rule-schwa');
  return keys;
}

export const HI_PROFILE: ScriptProfile = {
  languageId: 'hi', scriptId: 'Deva', firstBatch: 4, laterBatch: 3,
  units: UNITS, words: WORDS, phrases: PHRASES,
  confusions: [
    { a: 'ब', b: 'व', tell: 'ब is b, lips pressed together; व is v/w, teeth against the lip' },
    { a: 'घ', b: 'ध', tell: 'घ is gh, from the back of the mouth; ध is dh, tongue on the teeth' },
    { a: 'भ', b: 'म', tell: 'भ is bh with a breath; म is plain m with the lips closed' },
    { a: 'प', b: 'ष', tell: 'प is p; ष is sh (ṣ): one is a stop, the other a hiss' },
    { a: 'ड', b: 'ङ', tell: 'ड is ḍ, a stop; ङ is ng, a nasal that hardly starts a word' },
    { a: 'ट', b: 'ठ', tell: 'ट is plain ṭ; ठ is ṭh with a puff of air' },
    { a: 'थ', b: 'य', tell: 'थ is th, a stop with a puff of air; य is y, a glide' },
    { a: 'कि', b: 'की', tell: 'ि is short i and is written BEFORE the letter; ी is long ī and is written after it' },
    { a: 'कु', b: 'कू', tell: 'ु is short u; ू is long ū' },
    { a: 'के', b: 'कै', tell: 'े is e as in say; ै is ai as in cat' },
    { a: 'को', b: 'कौ', tell: 'ो is o as in go; ौ is au as in law' },
    { a: 'ज', b: 'ज़', tell: 'with the dot under it, ज़ is z; without it, ज is j' },
  ],
  dependencies,
  notes: "Machine-drafted from the pack's own tables and decoder; not checked by a Hindi teacher or native speaker. Devanagari is taught as syllables, not single sounds: a consonant carries a, a sign replaces it, and the a that is written nowhere is sometimes not said (the decoder's verdict, not a teacher's). The loan sign ॉ (डॉक्टर), the avagraha and Devanagari digits are not modelled, so words with them are never offered. Starter words are lemmas from the pack's lexicons (many from religious texts, because the pack's frequency list is weighted that way); the tutorial has no translated sentences, so there are no phrases.",
};
