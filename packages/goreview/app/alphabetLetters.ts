/**
 * The letters of the Alphabet saved deck for the languages written in the Latin, Greek and Hebrew scripts: one row a letter, in alphabet
 * order, [what the card shows, what its back says]. The back gives the letter's name in the language and then its usual sound, by an English
 * word where one is close. Thai and Hindi are in alphabetLetters.thhi.ts (written by a script from the reader's own spelling tables).
 *
 * WRITTEN BY HAND for this deck (2026-11-14) from the standard alphabets and letter names of each language; NOT reviewed by a native speaker,
 * a teacher, a Latinist, a Hellenist or a Hebraist, and the deck's own notes say so. The sound hints are approximations for an English
 * speaker, one usual value a letter, not a description of the language's sound system. Where two traditions differ and a learner will meet
 * both (Spain and Latin America; Church and classical Latin; Modern and ancient Greek) the back names both.
 *
 * Hebrew: the names and sounds are those of Modern Hebrew; a letter with two sounds says which mark decides. Biblical Aramaic: the names are
 * the ones the pack's tutorial uses (aleph, beth, …) and the back gives the conventional transliteration only: the names identify the
 * letters, they are not a recording of how Aramaic was spoken.
 */
import { FR_ALPHABET_ROWS } from '../../language-packs/src/tutorial/fr';
import { koAlphabetRows } from '../../language-packs/src/alphabet-sprint/letters-ko';

export type LetterRow = readonly [glyph: string, back: string];

const ES: readonly LetterRow[] = [
  ['A a', 'a: a as in father'], ['B b', 'be: b (softer between vowels)'],
  ['C c', 'ce: k before a, o, u; before e, i like s (Latin America) or th in thin (Spain)'], ['D d', 'de: d (softer between vowels, like th in this)'],
  ['E e', 'e: e as in bet'], ['F f', 'efe: f'], ['G g', 'ge: g as in go before a, o, u; before e, i a rough h, like j'], ['H h', 'hache: silent'],
  ['I i', 'i: ee as in see'], ['J j', 'jota: a rough h, as in loch'], ['K k', 'ka: k (in borrowed words)'], ['L l', 'ele: l'], ['M m', 'eme: m'],
  ['N n', 'ene: n'], ['Ñ ñ', 'eñe: ny as in canyon'], ['O o', 'o: o as in more'], ['P p', 'pe: p'], ['Q q', 'cu: k (always written qu, before e or i)'],
  ['R r', 'erre: a tapped r; trilled at the start of a word'], ['S s', 'ese: s'], ['T t', 'te: t'], ['U u', 'u: oo as in food (silent in gue, gui, que, qui)'],
  ['V v', 'uve: the same sound as b'], ['W w', 'uve doble: w or b (in borrowed words)'], ['X x', 'equis: ks (in México, like j)'],
  ['Y y', 'ye (also called i griega): y as in yes; the word y, “and”, is said ee'], ['Z z', 'zeta: s (Latin America) or th in thin (Spain)'],
  ['ch', 'che: ch as in church (two letters for one sound)'], ['ll', 'elle: y as in yes in most places (two letters for one sound)'],
  ['rr', 'erre doble: a trilled r, between vowels (two letters for one sound)'],
];

const SQ: readonly LetterRow[] = [
  ['A a', 'a: a as in father'], ['B b', 'bë: b'], ['C c', 'cë: ts as in cats'], ['Ç ç', 'çë: ch as in church'], ['D d', 'dë: d'], ['Dh dh', 'dhë: th as in this'],
  ['E e', 'e: e as in bet'], ['Ë ë', 'ë: the a of about (often silent at the end of a word)'], ['F f', 'fë: f'], ['G g', 'gë: g as in go'],
  ['Gj gj', 'gjë: a soft dy sound, close to the j of jeep'], ['H h', 'hë: h'], ['I i', 'i: ee as in see'], ['J j', 'jë: y as in yes'], ['K k', 'kë: k'],
  ['L l', 'lë: a light l, as in leaf'], ['Ll ll', 'llë: a dark l, as in full'], ['M m', 'më: m'], ['N n', 'në: n'], ['Nj nj', 'një: ny as in canyon'],
  ['O o', 'o: o as in more'], ['P p', 'pë: p'], ['Q q', 'që: a soft ty sound, close to the ch of cheese'], ['R r', 'rë: a tapped r'], ['Rr rr', 'rrë: a trilled r'],
  ['S s', 'së: s'], ['Sh sh', 'shë: sh as in ship'], ['T t', 'të: t'], ['Th th', 'thë: th as in thin'], ['U u', 'u: oo as in food'], ['V v', 'vë: v'],
  ['X x', 'xë: dz as in adze'], ['Xh xh', 'xhë: j as in jam'], ['Y y', 'y: like the French u or the German ü'], ['Z z', 'zë: z'], ['Zh zh', 'zhë: the s of measure'],
];

const DE: readonly LetterRow[] = [
  ['A a', 'A: a as in father'], ['B b', 'Be: b (p at the end of a word)'], ['C c', 'Ce: k, or ts before e and i; mostly found in ch, ck and sch'],
  ['D d', 'De: d (t at the end of a word)'], ['E e', 'E: e as in bet; when long, like the a of gate without the glide'], ['F f', 'Ef: f'],
  ['G g', 'Ge: g as in go (k at the end of a word)'], ['H h', 'Ha: h; silent after a vowel, which it makes long'], ['I i', 'I: ee as in see when long, i as in sit when short'],
  ['J j', 'Jot: y as in yes'], ['K k', 'Ka: k'], ['L l', 'El: l'], ['M m', 'Em: m'], ['N n', 'En: n'], ['O o', 'O: o as in more'], ['P p', 'Pe: p'],
  ['Q q', 'Qu: always written qu, said kv'], ['R r', 'Er: an r made in the throat (or rolled); after a vowel at the end of a syllable close to a'],
  ['S s', 'Es: z before a vowel; s at the end of a word; sh in sp- and st- at the start'], ['T t', 'Te: t'], ['U u', 'U: oo as in food'],
  ['V v', 'Vau: f (v in borrowed words)'], ['W w', 'We: v as in very'], ['X x', 'Ix: ks'], ['Y y', 'Ypsilon: like ü (y as in yes in borrowed words)'],
  ['Z z', 'Zett: ts as in cats'], ['Ä ä', 'A-Umlaut: e as in bet'], ['Ö ö', 'O-Umlaut: say e with rounded lips, like the vowel of French peu'],
  ['Ü ü', 'U-Umlaut: say ee with rounded lips, like the French u'], ['ß', 'Eszett (scharfes S): s as in kiss'],
];

/** Bokmål and Nynorsk share one alphabet and its letter names. */
const NO: readonly LetterRow[] = [
  ['A a', 'a: a as in father'], ['B b', 'be: b'], ['C c', 'se: s before e, i and y, otherwise k (in borrowed words)'],
  ['D d', 'de: d (often silent at the end of a word and in nd, ld)'], ['E e', 'e: e as in bet; when long, like the a of gate without the glide'], ['F f', 'eff: f'],
  ['G g', 'ge: g as in go; like y in yes before i, y, ei and øy'], ['H h', 'hå: h (silent before j and v)'], ['I i', 'i: ee as in see'], ['J j', 'je (also jodd): y as in yes'],
  ['K k', 'kå: k; before i, y, ei and øy a soft sound like the h of huge'], ['L l', 'ell: l'], ['M m', 'em: m'], ['N n', 'enn: n'],
  ['O o', 'o: usually oo as in food, sometimes o as in more'], ['P p', 'pe: p'], ['Q q', 'ku: k (in borrowed words and names)'],
  ['R r', 'ærr: a tapped or rolled r (made in the throat in the south and west)'], ['S s', 'ess: s (never z)'], ['T t', 'te: t (silent in det and in the neuter ending -et)'],
  ['U u', 'u: a tight u, between oo and the French u'], ['V v', 've: v'], ['W w', 'dobbelt-ve: v (in borrowed words and names)'], ['X x', 'eks: ks (in borrowed words)'],
  ['Y y', 'y: ee with rounded lips, close to the French u'], ['Z z', 'sett: s (in borrowed words)'], ['Æ æ', 'æ: a as in cat'],
  ['Ø ø', 'ø: like the vowel of French peu, close to the i of bird'], ['Å å', 'å: o as in more'],
];

/** As the Clementine Vulgate prints it (i and j, u and v as separate letters), with the Church sound first: the pack follows both. */
const LA: readonly LetterRow[] = [
  ['A a', 'a: a as in father'], ['B b', 'be: b'], ['C c', 'ce: k; in Church Latin ch as in church before e, i, ae and oe (classical: always k)'], ['D d', 'de: d'],
  ['E e', 'e: e as in bet'], ['F f', 'ef: f'], ['G g', 'ge: g as in go; in Church Latin like the g of gem before e, i, ae and oe (classical: always as in go)'],
  ['H h', 'ha: a light h (in Church Latin often silent)'], ['I i', 'i: ee as in see'], ['J j', 'consonant i: y as in yes (the Romans wrote it i)'], ['K k', 'ka: k (rare: Kalendae)'],
  ['L l', 'el: l'], ['M m', 'em: m'], ['N n', 'en: n'], ['O o', 'o: o as in more'], ['P p', 'pe: p'], ['Q q', 'qu: always written qu, said kw'], ['R r', 'er: a rolled r'],
  ['S s', 'es: s as in sit'], ['T t', 'te: t; in Church Latin ti before a vowel is said tsi (gratia)'], ['U u', 'u: oo as in food'],
  ['V v', 'consonant u: v in Church Latin (classical: w; the Romans wrote it u)'], ['X x', 'ix: ks'],
  ['Y y', 'y Graeca, “Greek y”: ee in Church Latin (classical: like the French u); in Greek words'], ['Z z', 'zeta: dz in Church Latin (classical: z); in Greek words'],
];

/** The Modern Greek names; the sound of Modern Greek first, and the classroom value for ancient Greek where it differs. */
const EL: readonly LetterRow[] = [
  ['Α α', 'alpha (άλφα): a as in father'], ['Β β', 'beta (βήτα): v in Modern Greek; b in the classroom pronunciation of ancient Greek'],
  ['Γ γ', 'gamma (γάμα): a soft gh, and y before e and i sounds, in Modern Greek; g as in go for ancient Greek'], ['Δ δ', 'delta (δέλτα): th as in this in Modern Greek; d for ancient Greek'],
  ['Ε ε', 'epsilon (έψιλον): e as in bet'], ['Ζ ζ', 'zeta (ζήτα): z'], ['Η η', 'eta (ήτα): ee as in see in Modern Greek; a long e, as in they, for ancient Greek'],
  ['Θ θ', 'theta (θήτα): th as in thin'], ['Ι ι', 'iota (ιώτα): ee as in see'], ['Κ κ', 'kappa (κάπα): k'], ['Λ λ', 'lambda (λάμδα): l'], ['Μ μ', 'mu (μι): m'], ['Ν ν', 'nu (νι): n'],
  ['Ξ ξ', 'xi (ξι): ks'], ['Ο ο', 'omicron (όμικρον): o as in more'], ['Π π', 'pi (πι): p'], ['Ρ ρ', 'rho (ρο): a tapped or rolled r'],
  ['Σ σ ς', 'sigma (σίγμα): s; written ς at the end of a word'], ['Τ τ', 'tau (ταυ): t'], ['Υ υ', 'upsilon (ύψιλον): ee as in see in Modern Greek; like the French u for ancient Greek'],
  ['Φ φ', 'phi (φι): f'], ['Χ χ', 'chi (χι): a rough h, as in loch'], ['Ψ ψ', 'psi (ψι): ps'], ['Ω ω', 'omega (ωμέγα): o as in more (a long o for ancient Greek)'],
];

// the dotted forms are built from code points, so no pointed Hebrew is typed here by hand
const DAGESH = 'ּ', SHIN_DOT = 'ׁ', SIN_DOT = 'ׂ';
const HE: readonly LetterRow[] = [
  ['א', 'alef: silent; it carries a vowel'], ['ב', `bet: b with a dot inside (ב${DAGESH}), v without it`], ['ג', 'gimel: g as in go'], ['ד', 'dalet: d'],
  ['ה', 'he: h (silent at the end of most words)'], ['ו', 'vav: v; it also stands for the vowels o and u'], ['ז', 'zayin: z'], ['ח', 'chet: a rough h from the throat, as in loch'],
  ['ט', 'tet: t'], ['י', 'yod: y as in yes; it also stands for the vowels i and e'], ['כ', `kaf: k with a dot inside (כ${DAGESH}), a rough kh without it`],
  ['ך', 'final kaf: the shape of kaf at the end of a word, said kh'], ['ל', 'lamed: l'], ['מ', 'mem: m'], ['ם', 'final mem: the shape of mem at the end of a word'],
  ['נ', 'nun: n'], ['ן', 'final nun: the shape of nun at the end of a word'], ['ס', 'samekh: s'], ['ע', 'ayin: a throat sound, silent in most modern speech; it carries a vowel'],
  ['פ', `pe: p with a dot inside (פ${DAGESH}), f without it`], ['ף', 'final pe: the shape of pe at the end of a word, said f'], ['צ', 'tsadi: ts as in cats'],
  ['ץ', 'final tsadi: the shape of tsadi at the end of a word'], ['ק', 'qof: k'], ['ר', 'resh: r (made in the throat in modern speech)'],
  ['ש', `shin: sh with the dot on the right (ש${SHIN_DOT}); s with the dot on the left (ש${SIN_DOT}, called sin)`], ['ת', 'tav: t'],
];

const ARC: readonly LetterRow[] = [
  ['א', 'aleph: transliterated ʾ'], ['ב', 'beth: transliterated b'], ['ג', 'gimel: transliterated g'], ['ד', 'daleth: transliterated d'], ['ה', 'he: transliterated h'],
  ['ו', 'waw: transliterated w'], ['ז', 'zayin: transliterated z'], ['ח', 'heth: transliterated ḥ'], ['ט', 'teth: transliterated ṭ'], ['י', 'yod: transliterated y'],
  ['כ', 'kaph: transliterated k'], ['ך', 'final kaph: the shape of kaph at the end of a word'], ['ל', 'lamedh: transliterated l'], ['מ', 'mem: transliterated m'],
  ['ם', 'final mem: the shape of mem at the end of a word'], ['נ', 'nun: transliterated n'], ['ן', 'final nun: the shape of nun at the end of a word'],
  ['ס', 'samekh: transliterated s'], ['ע', 'ayin: transliterated ʿ'], ['פ', 'pe: transliterated p'], ['ף', 'final pe: the shape of pe at the end of a word'],
  ['צ', 'tsadhe: transliterated ṣ'], ['ץ', 'final tsadhe: the shape of tsadhe at the end of a word'], ['ק', 'qoph: transliterated q'], ['ר', 'resh: transliterated r'],
  ['ש', `shin or sin: transliterated š with the point on the right (ש${SHIN_DOT}), ś with the point on the left (ש${SIN_DOT})`], ['ת', 'taw: transliterated t'],
];

/**
 * Korean: the 40 letters of Hangul (19 consonants, 21 vowels) in the order of the Alphabet Sprint's seven stages, with each letter's name, an English
 * sound hint and Revised Romanization as an aid. NOT typed here: the single source is alphabet-sprint/letters-ko.ts, which derives everything it
 * can from the Korean adapter. Written for this deck, not reviewed by a native speaker.
 */
const KO: readonly LetterRow[] = koAlphabetRows();

// RU-LETTERS-START (generated by scripts/ru-alphabet-deck.mts; do not edit by hand)
/**
 * Russian: the 33 letters of the Cyrillic alphabet as Russian uses it, in alphabet order: the Russian analyser's own letter table
 * (src/adapters/russian/alphabet.ts). Written for this deck, not reviewed by a native speaker.
 */
const RU: readonly LetterRow[] = [
  ['А а', 'а: a as in father. Same as Latin A. Said fully only when stressed; weaker otherwise.'],
  ['Б б', 'бэ: b as in bat. Not Latin B (that is В): Б has a flat bar on top.'],
  ['В в', 'вэ: v as in van. Looks like Latin B, sounds like v.'],
  ['Г г', 'гэ: g as in go. A hard g. In the endings -ого and -его it says v (его).'],
  ['Д д', 'дэ: d as in dog. Looks like a little house with feet. At the end of a word it says t (год).'],
  ['Е е', 'е: ye as in yes; after a consonant it softens it and says e. Looks like Latin E but starts with a y-sound: ель is said yel.'],
  ['Ё ё', 'ё: yo as in yore; after a consonant it softens it and says o. E with two dots. Always stressed; many texts print it as е without the dots.'],
  ['Ж ж', 'жэ: zh as the s in measure. Looks like a beetle with six legs. Always hard.'],
  ['З з', 'зэ: z as in zoo. Looks like the digit 3 and says z.'],
  ['И и', 'и: ee as in see. Looks like a backwards N and says ee.'],
  ['Й й', 'и краткое: y as in boy: a short, quick y-sound. И with a little hat. It is a consonant and joins vowels: май, мой.'],
  ['К к', 'ка: k as in skin. Same as Latin K.'],
  ['Л л', 'эль: l as in lamp. A roof shape, like Greek Λ.'],
  ['М м', 'эм: m as in man. Same as Latin M.'],
  ['Н н', 'эн: n as in no. Looks like Latin H, sounds like n.'],
  ['О о', 'о: o as in more when stressed; unstressed it sounds like a. Same as Latin O. Watch out: unstressed о sounds like a, as in молоко.'],
  ['П п', 'пэ: p as in spin. A gate shape, like Greek Π. Says p, not n.'],
  ['Р р', 'эр: r, rolled with the tip of the tongue. Looks like Latin P, sounds like a rolled r.'],
  ['С с', 'эс: s as in sun. Looks like Latin C, but always says s.'],
  ['Т т', 'тэ: t as in stop. Same as Latin T.'],
  ['У у', 'у: oo as in food. Looks like Latin Y, sounds like oo.'],
  ['Ф ф', 'эф: f as in fan. A circle on a stem. Most often seen in borrowed words.'],
  ['Х х', 'ха: kh, like ch in Scottish loch. Looks like Latin X, sounds like a breathy kh.'],
  ['Ц ц', 'цэ: ts as in cats. A U-shape with a small tail. Always ts, and always hard.'],
  ['Ч ч', 'чэ: ch as in chat; always soft. A cup on a stem.'],
  ['Ш ш', 'ша: sh as in shut; always hard. Three legs, like a comb.'],
  ['Щ щ', 'ща: a long, soft sh, like the sh-ch in fresh cheese. Ш with a tail. Always soft.'],
  ['Ъ ъ', 'твёрдый знак: no sound of its own: the hard sign. Rare. Keeps a consonant hard before е ё ю я.'],
  ['Ы ы', 'ы: a back-of-the-mouth i with no English match (try ih). It never starts a word. Say it after a hard consonant: мы, рыба.'],
  ['Ь ь', 'мягкий знак: no sound of its own: the soft sign. Makes the consonant before it soft: день, мать.'],
  ['Э э', 'э: e as in bet. A backwards e: the "hard" e. Starts words, often borrowed ones: это, экран.'],
  ['Ю ю', 'ю: yoo as in you; after a consonant it softens it and says oo. Begins with a y-sound, or softens the consonant before it: люблю.'],
  ['Я я', 'я: ya as in yacht; after a consonant it softens it and says a. Looks like a backwards R, sounds like ya.'],
];
// RU-LETTERS-END

// AR-LETTERS-START (generated by scripts/ar-alphabet-deck.mts; do not edit by hand)
/**
 * Arabic: the 28 letters in alphabet order: the Arabic analyser's own letter table (src/adapters/arabic/alphabet.ts), the card's key the bare letter.
 * Written for this deck, not reviewed by a native speaker or an Arabist; the sounds are approximations for an English speaker.
 */
const AR: readonly LetterRow[] = [
  ['ا', 'أَلِف (alif): a long ā as in father; also carries a hamza (see أ إ آ) · transliterated ā'],
  ['ب', 'بَاء (bāʾ): b as in bat · transliterated b · one dot below'],
  ['ت', 'تَاء (tāʾ): t as in stop, without a puff of air · transliterated t · two dots above'],
  ['ث', 'ثَاء (thāʾ): th as in think · transliterated th · three dots above'],
  ['ج', 'جِيم (jīm): j as in jam · transliterated j · one dot below'],
  ['ح', 'حَاء (ḥāʾ): a breathy, hissing h from deep in the throat · transliterated ḥ'],
  ['خ', 'خَاء (khāʾ): kh as in Scottish loch or German Bach · transliterated kh · one dot above'],
  ['د', 'دَال (dāl): d as in dog · transliterated d'],
  ['ذ', 'ذَال (dhāl): th as in this · transliterated dh · one dot above'],
  ['ر', 'رَاء (rāʾ): a rolled or tapped r, with the tip of the tongue · transliterated r'],
  ['ز', 'زَاي (zāy): z as in zoo · transliterated z · one dot above'],
  ['س', 'سِين (sīn): s as in sun · transliterated s'],
  ['ش', 'شِين (shīn): sh as in ship · transliterated sh · three dots above'],
  ['ص', 'صَاد (ṣād): a heavy (emphatic) s: s with the back of the tongue raised · transliterated ṣ'],
  ['ض', 'ضَاد (ḍād): a heavy (emphatic) d: d with the back of the tongue raised · transliterated ḍ · one dot above'],
  ['ط', 'طَاء (ṭāʾ): a heavy (emphatic) t: t with the back of the tongue raised · transliterated ṭ'],
  ['ظ', 'ظَاء (ẓāʾ): a heavy (emphatic) dh: th as in this with the back of the tongue raised · transliterated ẓ · one dot above'],
  ['ع', 'عَيْن (ʿayn): a squeezed, voiced sound from the throat; no English equivalent · transliterated ʿ'],
  ['غ', 'غَيْن (ghayn): a gargled r, like the French r in rouge · transliterated gh · one dot above'],
  ['ف', 'فَاء (fāʾ): f as in fish · transliterated f · one dot above'],
  ['ق', 'قَاف (qāf): a k said far back in the throat, at the uvula · transliterated q · two dots above'],
  ['ك', 'كَاف (kāf): k as in skin · transliterated k'],
  ['ل', 'لَام (lām): l as in lamp · transliterated l'],
  ['م', 'مِيم (mīm): m as in man · transliterated m'],
  ['ن', 'نُون (nūn): n as in no · transliterated n · one dot above'],
  ['ه', 'هَاء (hāʾ): h as in hat, lightly breathed · transliterated h'],
  ['و', 'وَاو (wāw): w as in water; as a long vowel ū as in food · transliterated w'],
  ['ي', 'يَاء (yāʾ): y as in yes; as a long vowel ī as in see · transliterated y · two dots below'],
];
// AR-LETTERS-END

/** By language id. */
export const HAND_LETTERS: Readonly<Record<string, readonly LetterRow[]>> = { es: ES, sq: SQ, de: DE, nb: NO, nn: NO, la: LA, el: EL, he: HE, arc: ARC, ru: RU, fr: FR_ALPHABET_ROWS, ko: KO, ar: AR };
