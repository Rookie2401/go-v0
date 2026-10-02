/**
 * Spelling and pronunciation data for the Hindi script code (package H1).
 *
 * MACHINE-DRAFTED AND UNREVIEWED. Everything here was written from general knowledge of Hindi, not copied from a
 * source, and no native speaker has checked it. It is deliberately short: a list of words the schwa rules are known to
 * get wrong, a few known prefixes and suffixes that decide how sure the rules are, the word pairs of the ya-shruti
 * spelling variants, and the stems of words whose nukta is conventional (so that the spelling without it can be related
 * to the one with it). A reviewer should treat every entry as a claim to check, never as settled.
 *
 * In the nukta stems "%" stands for the nukta (U+093C) so that the file never depends on how an editor stores a
 * precomposed letter; it is replaced at load.
 */

const NK = '़';
const nk = (s: string): string => s.replace(/%/g, NK).normalize('NFC');

// ───────────────────────────── schwa exceptions ─────────────────────────────

/**
 * Words (very frequent or instructive) whose unwritten a the general rules get wrong or cannot decide.
 * `pronounced` lists the akṣara indexes (0-based, in the order `aksharas` gives them) whose unwritten a IS said; every
 * other unit with an unwritten a is not said. `reading` is for the reviewer only.
 */
export interface SchwaException { word: string; pronounced: number[]; reading: string }

export const SCHWA_EXCEPTIONS: readonly SchwaException[] = [
  { word: 'सुनहरा', pronounced: [1], reading: 'sunahrā' },
  { word: 'समझदार', pronounced: [0, 1], reading: 'samajhdār' },
  { word: 'मुसलमान', pronounced: [1], reading: 'musalmān' },
  { word: 'लोकसभा', pronounced: [2], reading: 'loksabhā' },
  { word: 'जनवरी', pronounced: [0, 2], reading: 'janvarī' },
  { word: 'दोपहर', pronounced: [1, 2], reading: 'dopahar' },
  { word: 'सहायता', pronounced: [0, 2], reading: 'sahāyatā' },
];

/** Known Sanskrit-derived prefixes, by the akṣaras they are written with (after them the rules are least reliable). */
export const KNOWN_PREFIXES: readonly string[] = ['अनु', 'उप', 'अधि', 'अभि', 'परि', 'प्रति'];

/**
 * Endings that are written as a whole akṣara or two at the end of a verb form and that start after the unwritten a
 * that is dropped: infinitive -ना / -ने, imperfective participle -ता / -ती / -ते, conjunctive -कर.
 * (Given as the text of the last one or two akṣaras.)
 */
export const VERB_SUFFIXES: readonly string[] = ['ना', 'ने', 'ता', 'ती', 'ते', 'कर'];

// ───────────────────────────── spelling variants ─────────────────────────────

/** Whole words with a y-glide spelling variant (गई ↔ गयी). Both directions are derived from these pairs. */
export const YA_WORD_PAIRS: readonly (readonly [string, string])[] = [
  ['गई', 'गयी'], ['नई', 'नयी'], ['हुई', 'हुयी'], ['आई', 'आयी'], ['सोई', 'सोयी'], ['रोई', 'रोयी'],
  ['धोई', 'धोयी'], ['खोई', 'खोयी'], ['बनाई', 'बनायी'], ['सुनाई', 'सुनायी'],
];

/**
 * Words (stems) written with a nukta in the usual spelling, in the five letters क ख ग ज फ where the spelling without
 * the nukta also circulates. "%" is the nukta. Inflected forms are reached by adding the endings in NUKTA_SUFFIXES.
 */
const NUKTA_STEMS_RAW: readonly string[] = [
  'ज%रूरत', 'ज%रूर', 'ज%मीन', 'ज%िंदगी', 'ज%िन्दगी', 'ज%्यादा', 'ज%बान', 'ज%माना', 'ज%ोर', 'ज%रा', 'ज%हर', 'ज%ख्म',
  'ज%िम्मेदार', 'ज%िम्मेदारी', 'ज%बरदस्त', 'ज%ुल्म', 'ज%िक्र', 'ज%ुबान', 'ज%ायका', 'ज%ीरो', 'ज%ाहिर', 'ज%ाती',
  'बाज%ार', 'आवाज%', 'इंतज%ार', 'मज%ा', 'मज%ाक', 'मज%दूर', 'रोज%', 'रोज%ाना', 'कागज%', 'तेज%', 'नाराज%', 'राज%',
  'अंदाज%', 'अंदाज%ा', 'दरवाज%ा', 'ताज%ा', 'आज%ाद', 'अज%ीज%', 'हज%ार', 'सब्ज%ी', 'वज%न', 'वज%ह', 'ज%िला',
  'हाज%िर', 'इज%्ज%त', 'इजाज%त', 'इंतज%ाम', 'राज%ी', 'ग%ज%ल', 'ग%लत', 'ग%म', 'ग%रीब', 'ग%ुस्सा', 'ग%ुलाम', 'ग%ायब',
  'ग%ैर', 'ग%नीमत', 'बाग%', 'दिमाग%', 'चिराग%', 'दाग%', 'सुराग%', 'पैग%ाम', 'बग%ैर',
  'ख%बर', 'ख%ास', 'ख%ुश', 'ख%ुशी', 'ख%ुदा', 'ख%राब', 'ख%त', 'ख%तरा', 'ख%ाली', 'ख%ून', 'ख%रीद', 'ख%्याल',
  'ख%्वाब', 'ख%ुद', 'ख%ूब', 'ख%ामोश', 'ख%त्म', 'ख%ुशबू', 'ख%ज%ाना', 'ख%ुराक', 'ख%ैर', 'ख%ातिर', 'ख%तरनाक',
  'ख%ामोशी', 'ख%िलाफ%', 'आख%िर', 'आख%री', 'अख%बार', 'दरख%्त', 'सख%्त', 'ज%ख%्म',
  'क%ानून', 'क%रीब', 'क%ीमत', 'क%ाबिल', 'क%सम', 'क%ब्र', 'क%िला', 'क%लम', 'क%ुदरत', 'क%ैद', 'क%बूल', 'क%ुरान',
  'क%त्ल', 'क%िस्मत', 'क%िस्सा', 'क%ीमती', 'क%दम', 'क%ामयाब', 'ताक%त', 'वक%ील', 'मुलाक%ात', 'इश्क%', 'तरीक%ा',
  'हक%', 'हक%ीक%त', 'नक%्शा', 'वक%्त',
  'फ%ोन', 'फ%िल्म', 'फ%ायदा', 'फ%र्क', 'फ%ैसला', 'फ%ौज', 'फ%ौरन', 'फ%कीर', 'फ%ज%ूल', 'फ%रवरी', 'फ%ैशन',
  'फ%ाइल', 'फ%ोटो', 'फ%ीस', 'फ%ीता', 'फ%ुर्सत', 'फ%ासला', 'फ%ीसदी', 'फ%ेल', 'फ%िक्र', 'फ%तह', 'फ%रमाइश',
  'हफ%्ता', 'लफ%्ज%', 'सफ%र', 'सिर्फ%', 'तारीफ%', 'तकलीफ%', 'माफ%', 'साफ%', 'इंसाफ%', 'तरफ%', 'दफ%्तर',
  'अफ%सर', 'अफ%वाह', 'अल्फ%ाज%', 'मुआफ%',
];

/** nukta stems as stored: NFC (the nukta decomposed), unique. */
export const NUKTA_STEMS: readonly string[] = [...new Set(NUKTA_STEMS_RAW.map(nk))];

/** Endings that can follow a nukta stem when the stem ends in a consonant letter (longest first). */
export const NUKTA_SUFFIXES: readonly string[] = [
  'ियाँ', 'ियां', 'ाना', 'ाने', 'ाई', 'ें', 'ों', 'ीं', 'ाँ', 'ां', 'ता', 'ती', 'ते', 'ना', 'ने', 'ा', 'ी', 'े', '',
];
