/**
 * The Arabic script as typed data: the 28 letters in order with their names, sounds and four positional shapes (computed from the
 * joining rules), the sun and moon letters, the families of look-alike letters, the emphatic pairs, the extra spellings (hamza seats,
 * ة ى ٱ and the ligature لا) and the table of diacritics. Data for the GoReview alphabet deck and the Alphabet Sprint.
 *
 * MACHINE-DRAFTED, not reviewed by a native speaker or an Arabist. The sound hints are approximations for an English speaker, one
 * usual value of Modern Standard Arabic a letter, not a description of the sound system (regional speech differs: ج is g in Egypt,
 * ق is a glottal stop in Cairo and Damascus, ث and ذ are t and d or s and z in many cities). The transliteration of a letter is the
 * scheme of translit.ts; every example below is transliterated by that module in the tests, so the two cannot drift.
 *
 * SHAPES. Arabic letters join their neighbours; a letter has an isolated, an initial, a medial and a final shape. `shapes` is built
 * by `arShapes` from the letter's joining class and written with the tatweel (ـ, U+0640) as the stretch that stands for the
 * connection: «بـ ـبـ ـب». The tatweel is for DISPLAY only; it is not part of any word. A letter that joins on both sides is 'dual'.
 * Six letters of the alphabet (ا د ذ ر ز و) join the letter before them but never the letter after, so they have no initial and no
 * medial joined shape ('right'); the shapes written for them are isolated and final only, and the letter that follows them starts
 * afresh. ء joins on neither side ('none'). ى is written only at the end of a word ('final-only').
 */
import { SUN_LETTERS, FATHA, DAMMA, KASRA, FATHATAN, DAMMATAN, KASRATAN, SUKUN, SHADDA, DAGGER_ALIF } from './text';

export type ArJoin = 'dual' | 'right' | 'none' | 'final-only';

export interface ArShapes { isolated: string; initial?: string; medial?: string; final: string }

const TATWEEL = 'ـ';
/** Letters that join the letter before them only (never the one after), among the letters this module knows. */
const RIGHT_JOINING = new Set([...'ادذرزو', 'أ', 'إ', 'آ', 'ؤ', 'ة', 'ٱ']);

/** The joining class of a letter. */
export function arJoinOf(letter: string): ArJoin {
  if (letter === 'ء') return 'none';
  if (letter === 'ى') return 'final-only';
  if (letter === 'لا') return 'right';
  return RIGHT_JOINING.has(letter) ? 'right' : 'dual';
}

/** The four positional shapes of a letter, from its joining class (see the file comment). */
export function arShapes(letter: string): ArShapes {
  const join = arJoinOf(letter);
  if (join === 'none') return { isolated: letter, final: letter };
  if (join === 'dual') return { isolated: letter, initial: letter + TATWEEL, medial: TATWEEL + letter + TATWEEL, final: TATWEEL + letter };
  return { isolated: letter, final: TATWEEL + letter }; // 'right' and 'final-only'
}

/** A family of letters that differ only by their dots. */
export interface ArFamily { id: string; letters: string[] }

export const AR_FAMILIES: ArFamily[] = [
  { id: 'bat', letters: [...'بتثني'] },
  { id: 'jhkh', letters: [...'جحخ'] },
  { id: 'dh', letters: [...'دذ'] },
  { id: 'rz', letters: [...'رز'] },
  { id: 'sh', letters: [...'سش'] },
  { id: 'sd', letters: [...'صض'] },
  { id: 'tz', letters: [...'طظ'] },
  { id: 'ag', letters: [...'عغ'] },
  { id: 'fq', letters: [...'فق'] },
];

/** Plain letters and their emphatic partner: the emphatic is said with the back of the tongue raised. */
const EMPHATIC_OF: Readonly<Record<string, string>> = { س: 'ص', د: 'ض', ت: 'ط', ذ: 'ظ' };

export interface ArLetter {
  /** The letter (isolated shape). */
  letter: string;
  /** 1 … 28, alphabet order. */
  order: number;
  /** The letter's name, vowelled. */
  name: string;
  nameTranslit: string;
  /** The sound for an English speaker, at most about 90 characters. */
  sound: string;
  /** The letter in the scholarly transliteration (translit.ts). */
  translit: string;
  join: ArJoin;
  shapes: ArShapes;
  /** The dots: how the letter differs from its family. */
  dots: string;
  /** Sun letters assimilate the lām of the article; moon letters do not. */
  sun: boolean;
  /** The look-alike family, if the letter is in one. */
  family?: ArFamily;
  /** The other letters of the family (never the letter itself). */
  lookAlikes: string[];
  /** For an emphatic letter its plain partner, for a plain letter its emphatic one. */
  emphatic?: { role: 'plain' | 'emphatic'; partner: string };
  /** A common word that begins with the letter (vocalized), its transliteration and meaning. */
  example: { word: string; translit: string; gloss: string };
  note?: string;
}

type Row = [letter: string, name: string, nameTranslit: string, sound: string, translit: string, dots: string, word: string, wordTr: string, gloss: string, note?: string];

const ROWS: Row[] = [
  ['ا', 'أَلِف', 'alif', 'a long ā as in father; also carries a hamza (see أ إ آ)', 'ā', 'none', 'أَسَد', 'asad', 'lion', 'Never joins the next letter. At the start of a word it is a seat for the vowel, not a sound of its own.'],
  ['ب', 'بَاء', 'bāʾ', 'b as in bat', 'b', 'one dot below', 'بَاب', 'bāb', 'door'],
  ['ت', 'تَاء', 'tāʾ', 't as in stop, without a puff of air', 't', 'two dots above', 'تَمْر', 'tamr', 'dates (the fruit)'],
  ['ث', 'ثَاء', 'thāʾ', 'th as in think', 'th', 'three dots above', 'ثَوْب', 'thawb', 'garment', 'Said s or t in some regional speech.'],
  ['ج', 'جِيم', 'jīm', 'j as in jam', 'j', 'one dot below', 'جَمَل', 'jamal', 'camel', 'Said g in Egypt and zh in the Levant and the Maghreb.'],
  ['ح', 'حَاء', 'ḥāʾ', 'a breathy, hissing h from deep in the throat', 'ḥ', 'none', 'حَلِيب', 'ḥalīb', 'milk', 'Not the ordinary h (ه) and not kh (خ).'],
  ['خ', 'خَاء', 'khāʾ', 'kh as in Scottish loch or German Bach', 'kh', 'one dot above', 'خُبْز', 'khubz', 'bread'],
  ['د', 'دَال', 'dāl', 'd as in dog', 'd', 'none', 'دَرْس', 'dars', 'lesson', 'Never joins the next letter.'],
  ['ذ', 'ذَال', 'dhāl', 'th as in this', 'dh', 'one dot above', 'ذَهَب', 'dhahab', 'gold', 'Never joins the next letter. Said z or d in some regional speech.'],
  ['ر', 'رَاء', 'rāʾ', 'a rolled or tapped r, with the tip of the tongue', 'r', 'none', 'رَجُل', 'rajul', 'man', 'Never joins the next letter.'],
  ['ز', 'زَاي', 'zāy', 'z as in zoo', 'z', 'one dot above', 'زَهْرَة', 'zahra', 'flower', 'Never joins the next letter.'],
  ['س', 'سِين', 'sīn', 's as in sun', 's', 'none', 'سَمَك', 'samak', 'fish'],
  ['ش', 'شِين', 'shīn', 'sh as in ship', 'sh', 'three dots above', 'شَمْس', 'shams', 'sun'],
  ['ص', 'صَاد', 'ṣād', 'a heavy (emphatic) s: s with the back of the tongue raised', 'ṣ', 'none', 'صَبَاح', 'ṣabāḥ', 'morning', 'The emphatic partner of س; it darkens the vowels next to it.'],
  ['ض', 'ضَاد', 'ḍād', 'a heavy (emphatic) d: d with the back of the tongue raised', 'ḍ', 'one dot above', 'ضَوْء', 'ḍawʾ', 'light', 'The emphatic partner of د; Arabic is called the language of the ḍād.'],
  ['ط', 'طَاء', 'ṭāʾ', 'a heavy (emphatic) t: t with the back of the tongue raised', 'ṭ', 'none', 'طَالِب', 'ṭālib', 'student', 'The emphatic partner of ت.'],
  ['ظ', 'ظَاء', 'ẓāʾ', 'a heavy (emphatic) dh: th as in this with the back of the tongue raised', 'ẓ', 'one dot above', 'ظَهْر', 'ẓahr', 'back; noon', 'The emphatic partner of ذ. Often said like ز in the Levant and Egypt.'],
  ['ع', 'عَيْن', 'ʿayn', 'a squeezed, voiced sound from the throat; no English equivalent', 'ʿ', 'none', 'عَيْن', 'ʿayn', 'eye; spring', 'Not a vowel and not the hamza (ء); the name of the letter is also the word for eye.'],
  ['غ', 'غَيْن', 'ghayn', 'a gargled r, like the French r in rouge', 'gh', 'one dot above', 'غُرْفَة', 'ghurfa', 'room'],
  ['ف', 'فَاء', 'fāʾ', 'f as in fish', 'f', 'one dot above', 'فِيل', 'fīl', 'elephant'],
  ['ق', 'قَاف', 'qāf', 'a k said far back in the throat, at the uvula', 'q', 'two dots above', 'قَمَر', 'qamar', 'moon', 'Not k (ك). Said g in the Gulf and Upper Egypt, and as a glottal stop in Cairo and Damascus.'],
  ['ك', 'كَاف', 'kāf', 'k as in skin', 'k', 'none', 'كِتَاب', 'kitāb', 'book', 'In a word the final and isolated shapes carry a small hamza-like stroke.'],
  ['ل', 'لَام', 'lām', 'l as in lamp', 'l', 'none', 'لَيْل', 'layl', 'night', 'The lām of the article assimilates to a sun letter.'],
  ['م', 'مِيم', 'mīm', 'm as in man', 'm', 'none', 'مَاء', 'māʾ', 'water'],
  ['ن', 'نُون', 'nūn', 'n as in no', 'n', 'one dot above', 'نُور', 'nūr', 'light'],
  ['ه', 'هَاء', 'hāʾ', 'h as in hat, lightly breathed', 'h', 'none', 'هَدِيَّة', 'hadiyya', 'gift', 'Not ح. Its shape changes more than any other letter (ه ـهـ ـه).'],
  ['و', 'وَاو', 'wāw', 'w as in water; as a long vowel ū as in food', 'w', 'none', 'وَلَد', 'walad', 'boy', 'Never joins the next letter. Also the vowel ū (after ḍamma) and the conjunction “and”.'],
  ['ي', 'يَاء', 'yāʾ', 'y as in yes; as a long vowel ī as in see', 'y', 'two dots below', 'يَد', 'yad', 'hand', 'Also the vowel ī (after kasra). Isolated and final shapes have the two dots below.'],
];

const familyOf = (l: string): ArFamily | undefined => AR_FAMILIES.find((f) => f.letters.includes(l));

function build(r: Row, i: number): ArLetter {
  const [letter, name, nameTranslit, sound, translit, dots, word, wordTr, gloss, note] = r;
  const family = familyOf(letter);
  const partnerOf = Object.entries(EMPHATIC_OF).find(([, e]) => e === letter)?.[0];
  const emphatic = EMPHATIC_OF[letter] ? { role: 'plain' as const, partner: EMPHATIC_OF[letter] } : partnerOf ? { role: 'emphatic' as const, partner: partnerOf } : undefined;
  return {
    letter, order: i + 1, name, nameTranslit, sound, translit, join: arJoinOf(letter), shapes: arShapes(letter), dots,
    sun: SUN_LETTERS.has(letter), ...(family ? { family } : {}), lookAlikes: family ? family.letters.filter((x) => x !== letter) : [],
    ...(emphatic ? { emphatic } : {}), example: { word, translit: wordTr, gloss }, ...(note ? { note } : {}),
  };
}

/** The 28 letters, in alphabet order. */
export const AR_ALPHABET: ArLetter[] = ROWS.map(build);

/** An extra spelling that is not one of the 28 letters. */
export interface ArExtra {
  letter: string;
  name: string;
  nameTranslit: string;
  join: ArJoin;
  shapes: ArShapes;
  /** What it stands for, in the transliteration. */
  translit: string;
  /** What it is and how to read it. */
  role: string;
  example: { word: string; translit: string; gloss: string };
}

const X = (letter: string, name: string, nameTranslit: string, translit: string, role: string, word: string, wordTr: string, gloss: string, shapes?: ArShapes): ArExtra => ({
  letter, name, nameTranslit, join: arJoinOf(letter), shapes: shapes ?? arShapes(letter), translit, role, example: { word, translit: wordTr, gloss },
});

export const AR_EXTRAS: ArExtra[] = [
  X('ء', 'هَمْزَة', 'hamza', 'ʾ', 'The glottal stop, the catch in the throat in “uh-oh”. It sits on its own at the end of a word or after a long vowel; elsewhere it sits on a seat (أ إ ؤ ئ).', 'مَاء', 'māʾ', 'water'),
  X('أ', 'أَلِف بِهَمْزَة فَوْق', 'alif with hamza above', 'ʾ', 'Hamza on an alif: at the start of a word before fatḥa or ḍamma, or inside a word after a fatḥa or a sukūn. Not written at the start of a word in this transliteration.', 'أَنَا', 'anā', 'I'),
  X('إ', 'أَلِف بِهَمْزَة تَحْت', 'alif with hamza below', 'ʾ', 'Hamza under an alif: always with a kasra, at the start of a word.', 'إِلَى', 'ilā', 'to'),
  X('آ', 'أَلِف مَدَّة', 'alif madda', 'ʾā', 'A hamza followed by a long ā, written as one letter with a wavy mark above. At the start of a word it is ā.', 'آمَنَ', 'āmana', 'he believed'),
  X('ؤ', 'هَمْزَة عَلَى وَاو', 'hamza on wāw', 'ʾ', 'Hamza on a seat shaped like wāw, after a ḍamma or before a ḍamma. Never joins the next letter.', 'سُؤَال', 'suʾāl', 'question'),
  X('ئ', 'هَمْزَة عَلَى يَاء', 'hamza on yāʾ', 'ʾ', 'Hamza on a seat shaped like yāʾ (without its dots), after a kasra or before a kasra.', 'قَارِئ', 'qāriʾ', 'reader'),
  X('ة', 'تَاء مَرْبُوطَة', 'tāʾ marbūṭa', 't / a', 'The “tied t” at the end of a word, mostly in feminine nouns: it is t when an ending or a pronoun follows (madrasatu) and is not said as t in pause (madrasa).', 'مَدْرَسَة', 'madrasa', 'school'),
  X('ى', 'أَلِف مَقْصُورَة', 'alif maqṣūra', 'ā', 'A long ā written like a yāʾ without dots, only at the end of a word, after a fatḥa.', 'عَلَى', 'ʿalā', 'on'),
  X('ٱ', 'أَلِف وَصْل', 'alif waṣla', 'a / i / u', 'The alif of the article and of some verb forms: said at the start of speech and dropped after another word (hamzat al-waṣl). Mostly printed as a plain alif.', 'اِسْم', 'ism', 'name'),
  X('لا', 'لَام أَلِف', 'lām-alif', 'lā', 'The ligature of lām and alif: the two letters are never written separately side by side, but as one joined shape. It is the word “no” and the spelling of any lām followed by alif.', 'لَا', 'lā', 'no', { isolated: 'لا', final: `${TATWEEL}لا` }),
];

/** A mark placed on a letter. The mark itself is written after a tatweel in `display` so that it can be seen alone. */
export interface ArDiacritic {
  mark: string;
  /** The mark on a tatweel, for display only. */
  display: string;
  name: string;
  nameTranslit: string;
  /** What it stands for in the transliteration. */
  translit: string;
  /** What it does. */
  function: string;
  example: { word: string; translit: string; gloss: string };
}

const D = (mark: string, name: string, nameTranslit: string, translit: string, fn: string, word: string, wordTr: string, gloss: string): ArDiacritic => ({
  mark, display: TATWEEL + mark, name, nameTranslit, translit, function: fn, example: { word, translit: wordTr, gloss },
});

export const AR_DIACRITICS: ArDiacritic[] = [
  D(FATHA, 'فَتْحَة', 'fatḥa', 'a', 'A short a after the letter it stands on. With an alif after it, a long ā.', 'كَتَبَ', 'kataba', 'he wrote'),
  D(DAMMA, 'ضَمَّة', 'ḍamma', 'u', 'A short u. With a wāw after it, a long ū.', 'كُتُب', 'kutub', 'books'),
  D(KASRA, 'كَسْرَة', 'kasra', 'i', 'A short i, written under the letter. With a yāʾ after it, a long ī.', 'كِتَاب', 'kitāb', 'book'),
  D(FATHATAN, 'تَنْوِين فَتْح', 'fatḥatān (tanwīn)', 'an', 'The ending -an of an indefinite noun, usually the accusative; usually written with an alif after it (ـًا).', 'كِتَابًا', 'kitāban', 'a book (accusative)'),
  D(DAMMATAN, 'تَنْوِين ضَمّ', 'ḍammatān (tanwīn)', 'un', 'The ending -un of an indefinite noun in the nominative.', 'كِتَابٌ', 'kitābun', 'a book'),
  D(KASRATAN, 'تَنْوِين كَسْر', 'kasratān (tanwīn)', 'in', 'The ending -in of an indefinite noun in the genitive.', 'كِتَابٍ', 'kitābin', 'of a book'),
  D(SUKUN, 'سُكُون', 'sukūn', '', 'No vowel after the letter: it closes a syllable.', 'مَكْتَب', 'maktab', 'office; desk'),
  D(SHADDA, 'شَدَّة', 'shadda (tashdīd)', 'doubled letter', 'The letter is doubled: said twice, held a little longer. It is written above, with the short vowel next to it.', 'عَلَّمَ', 'ʿallama', 'he taught'),
  D(DAGGER_ALIF, 'أَلِف خَنْجَرِيَّة', 'dagger alif', 'ā', 'A small alif written above a letter: a long ā that the usual spelling leaves out, in a few very common words and in the Quran.', 'هَٰذَا', 'hādhā', 'this'),
  D('ٓ', 'مَدَّة', 'madda', 'ʾā', 'The wavy mark above an alif (آ): a hamza and a long ā together.', 'قُرْآن', 'qurʾān', 'Quran; recitation'),
];
