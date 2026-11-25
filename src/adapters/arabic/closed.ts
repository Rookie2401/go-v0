/**
 * The closed classes of Arabic, written by hand for this adapter: the particles, pronouns, demonstratives, relatives, interrogatives and
 * prepositions (with the spellings their pronoun suffixes give) that the Wiktionary tables lack or under-describe.
 *
 * MACHINE-DRAFTED. Not reviewed by a native speaker or an Arabist. Every entry says a fact of the grammar (what the word is, what it
 * governs, which person and number a pronoun is) and gives a plain gloss of the word's function; none of it is a dictionary meaning.
 * Lemmas are cited the way the Wiktionary heads write them (vocalized, citation form: هٰذَا, ذٰلِكَ). The analyser adds an entry only
 * when the index holds no reading of the same lemma and part of speech for the key (the index wins whenever it has the word).
 *
 *   AR_CLOSED       key → whole-word readings (the written word as one unit)
 *   AR_PRIORS       key → the dominant reading of a closed-class homograph ("hand priors": مِنْ over مَنْ), used when no reviewed identity says otherwise
 *   AR_DIALECT_*    not here: the closed list of dialect markers belongs to the sentence package
 */
import type { PartOfSpeech } from '../../core';
import { arKey, arLoose } from './text';

export interface ArClosedEntry {
  /** The word as written, with its vowels (what the printed vowels are compared with). */
  form: string;
  /** The lemma the dictionary files it under (vocalized head). */
  lemma: string;
  pos: PartOfSpeech;
  morph: Record<string, string>;
  /** The function in plain words ("and", "in, within (+ genitive)"). */
  gloss: string;
  /** What it governs, in words: 'genitive', 'subjunctive', 'jussive', 'accusative subject', 'accusative'. */
  governs?: string;
  /** What kind of word it is ("negation", "future marker", "conditional", "pronoun suffix"…). */
  role?: string;
  /** A preposition (or particle) with a pronoun suffix: the suffix's letters; the rest of the key is the base. */
  suffix?: string;
  /** A fused particle: the words it is made of ("مِنْ + مَا"). */
  fusedOf?: string;
}

export const AR_CLOSED: Record<string, ArClosedEntry[]> = {};

function put(form: string, pos: PartOfSpeech, gloss: string, more: Partial<ArClosedEntry> = {}): void {
  const e: ArClosedEntry = { form, lemma: more.lemma ?? form, pos, morph: {}, gloss, ...more };
  (AR_CLOSED[arKey(form)] ??= []).push(e);
}
const m = (Person: string, Number: string, Gender?: string): Record<string, string> => ({ Person, Number, ...(Gender ? { Gender } : {}) });

// ───────────────────────────── pronouns ─────────────────────────────
const PRON_ROLE = 'independent pronoun';
put('أَنَا', 'PRON', 'I', { morph: m('1', 'Sing'), role: PRON_ROLE });
put('نَحْنُ', 'PRON', 'we', { morph: m('1', 'Plur'), role: PRON_ROLE });
put('أَنْتَ', 'PRON', 'you (m. sg.)', { morph: m('2', 'Sing', 'Masc'), role: PRON_ROLE });
put('أَنْتِ', 'PRON', 'you (f. sg.)', { morph: m('2', 'Sing', 'Fem'), role: PRON_ROLE });
put('أَنْتُمَا', 'PRON', 'you two', { morph: m('2', 'Dual'), role: PRON_ROLE });
put('أَنْتُمْ', 'PRON', 'you (m. pl.)', { morph: m('2', 'Plur', 'Masc'), role: PRON_ROLE });
put('أَنْتُنَّ', 'PRON', 'you (f. pl.)', { morph: m('2', 'Plur', 'Fem'), role: PRON_ROLE });
put('هُوَ', 'PRON', 'he, it', { morph: m('3', 'Sing', 'Masc'), role: PRON_ROLE });
put('هِيَ', 'PRON', 'she, it', { morph: m('3', 'Sing', 'Fem'), role: PRON_ROLE });
put('هُمَا', 'PRON', 'they two', { morph: m('3', 'Dual'), role: PRON_ROLE });
put('هُمْ', 'PRON', 'they (m.)', { morph: m('3', 'Plur', 'Masc'), role: PRON_ROLE });
put('هُنَّ', 'PRON', 'they (f.)', { morph: m('3', 'Plur', 'Fem'), role: PRON_ROLE });

// ───────────────────────────── demonstratives ─────────────────────────────
const DEM = 'demonstrative';
put('هٰذَا', 'PRON', 'this (m. sg.)', { morph: { Number: 'Sing', Gender: 'Masc' }, role: DEM });
put('هٰذِهِ', 'PRON', 'this (f. sg.)', { lemma: 'هٰذَا', morph: { Number: 'Sing', Gender: 'Fem' }, role: DEM });
put('هٰذَانِ', 'PRON', 'these two (m., nominative)', { lemma: 'هٰذَا', morph: { Number: 'Dual', Gender: 'Masc', Case: 'Nom' }, role: DEM });
put('هٰذَيْنِ', 'PRON', 'these two (m., accusative or genitive)', { lemma: 'هٰذَا', morph: { Number: 'Dual', Gender: 'Masc', Case: 'Acc,Gen' }, role: DEM });
put('هَاتَانِ', 'PRON', 'these two (f., nominative)', { lemma: 'هٰذَا', morph: { Number: 'Dual', Gender: 'Fem', Case: 'Nom' }, role: DEM });
put('هَاتَيْنِ', 'PRON', 'these two (f., accusative or genitive)', { lemma: 'هٰذَا', morph: { Number: 'Dual', Gender: 'Fem', Case: 'Acc,Gen' }, role: DEM });
put('هٰؤُلَاءِ', 'PRON', 'these (people)', { lemma: 'هٰذَا', morph: { Number: 'Plur' }, role: DEM });
put('ذٰلِكَ', 'PRON', 'that (m. sg.)', { morph: { Number: 'Sing', Gender: 'Masc' }, role: DEM });
put('تِلْكَ', 'PRON', 'that (f. sg.)', { lemma: 'ذٰلِكَ', morph: { Number: 'Sing', Gender: 'Fem' }, role: DEM });
put('أُولٰئِكَ', 'PRON', 'those (people)', { lemma: 'ذٰلِكَ', morph: { Number: 'Plur' }, role: DEM });
put('ذٰاكَ', 'PRON', 'that (m. sg., more remote)', { lemma: 'ذٰلِكَ', morph: { Number: 'Sing', Gender: 'Masc' }, role: DEM });
put('ذٰلِكُمْ', 'PRON', 'that (to you pl.)', { lemma: 'ذٰلِكَ', morph: { Number: 'Sing', Gender: 'Masc' }, role: DEM });

// ───────────────────────────── relatives and interrogatives ─────────────────────────────
const REL = 'relative pronoun';
const rel = (f: string, g: string, mm: Record<string, string>): void => put(f, 'PRON', g, { lemma: 'الَّذِي', morph: mm, role: REL });
rel('الَّذِي', 'who, which, that (m. sg.)', { Number: 'Sing', Gender: 'Masc' });
rel('الَّتِي', 'who, which, that (f. sg.)', { Number: 'Sing', Gender: 'Fem' });
rel('اللَّذَانِ', 'who, which (m. dual, nominative)', { Number: 'Dual', Gender: 'Masc', Case: 'Nom' });
rel('اللَّذَيْنِ', 'who, which (m. dual, accusative or genitive)', { Number: 'Dual', Gender: 'Masc', Case: 'Acc,Gen' });
rel('اللَّتَانِ', 'who, which (f. dual, nominative)', { Number: 'Dual', Gender: 'Fem', Case: 'Nom' });
rel('اللَّتَيْنِ', 'who, which (f. dual, accusative or genitive)', { Number: 'Dual', Gender: 'Fem', Case: 'Acc,Gen' });
rel('الَّذِينَ', 'who, which (m. pl.)', { Number: 'Plur', Gender: 'Masc' });
rel('اللَّاتِي', 'who, which (f. pl.)', { Number: 'Plur', Gender: 'Fem' });
rel('اللَّائِي', 'who, which (f. pl.)', { Number: 'Plur', Gender: 'Fem' });
rel('اللَّوَاتِي', 'who, which (f. pl.)', { Number: 'Plur', Gender: 'Fem' });
put('مَنْ', 'PRON', 'who? whoever', { role: 'interrogative and relative pronoun' });
put('مَا', 'PRON', 'what? that which', { role: 'interrogative and relative pronoun' });
put('مَاذَا', 'PRON', 'what?', { role: 'interrogative' });
put('لِمَاذَا', 'ADV', 'why?', { role: 'interrogative' });
put('لِمَ', 'ADV', 'why?', { role: 'interrogative' });
put('كَيْفَ', 'ADV', 'how?', { role: 'interrogative' });
put('أَيْنَ', 'ADV', 'where?', { role: 'interrogative' });
put('مَتَى', 'ADV', 'when?', { role: 'interrogative' });
put('كَمْ', 'ADV', 'how many? how much?', { role: 'interrogative', governs: 'accusative (a singular noun)' });
put('هَلْ', 'PART', 'question particle (yes/no)', { role: 'interrogative particle' });
put('أَيُّ', 'PRON', 'which? any', { lemma: 'أَيّ', role: 'interrogative', governs: 'genitive' });

// ───────────────────────────── prepositions ─────────────────────────────
const PREP = (f: string, gloss: string, more: Partial<ArClosedEntry> = {}): void => put(f, 'ADP', gloss, { governs: 'genitive', role: 'preposition', ...more });
PREP('فِي', 'in, within'); PREP('مِنْ', 'from, of, some of'); PREP('إِلَى', 'to, towards, until'); PREP('عَلَى', 'on, over, against');
PREP('عَنْ', 'from, about, away from'); PREP('حَتَّى', 'until, even', { governs: 'genitive (or subjunctive as a conjunction)' });
PREP('مُنْذُ', 'since, for (a period)'); PREP('مُذْ', 'since');
PREP('خَلَا', 'except'); PREP('عَدَا', 'except');
// the nouns that work as prepositions: accusative in form, governing a genitive
const ADVP = (f: string, gloss: string): void => put(f, 'ADP', gloss, { governs: 'genitive', role: 'preposition (a noun in the accusative governing a genitive)' });
ADVP('مَعَ', 'with, together with'); ADVP('عِنْدَ', 'at, with, at the place of'); ADVP('لَدَى', 'at, with'); ADVP('بَيْنَ', 'between, among');
ADVP('قَبْلَ', 'before'); ADVP('بَعْدَ', 'after'); ADVP('فَوْقَ', 'above, over'); ADVP('تَحْتَ', 'under, below'); ADVP('أَمَامَ', 'in front of');
ADVP('خَلْفَ', 'behind'); ADVP('حَوْلَ', 'around, about'); ADVP('دُونَ', 'without, below'); ADVP('ضِدَّ', 'against'); ADVP('نَحْوَ', 'towards, about');
ADVP('خِلَالَ', 'during, through'); ADVP('عِنْدَمَا', 'when'); ADVP('لَدُنْ', 'from, from the side of');

/**
 * The prepositions with their pronoun suffixes whose SPELLING changes (so a cut of the suffix does not reproduce them) or whose base
 * is one letter (بِـ لِـ). The twelve forms of a row follow the slots ي, نا, ك (m.), ك (f.), كما, كم, كن, ه, ها, هما, هم, هن.
 */
const SLOTS: Array<{ text: string; morph: Record<string, string> }> = [
  { text: 'ي', morph: m('1', 'Sing') }, { text: 'نا', morph: m('1', 'Plur') },
  { text: 'ك', morph: m('2', 'Sing', 'Masc') }, { text: 'ك', morph: m('2', 'Sing', 'Fem') },
  { text: 'كما', morph: m('2', 'Dual') }, { text: 'كم', morph: m('2', 'Plur', 'Masc') }, { text: 'كن', morph: m('2', 'Plur', 'Fem') },
  { text: 'ه', morph: m('3', 'Sing', 'Masc') }, { text: 'ها', morph: m('3', 'Sing', 'Fem') },
  { text: 'هما', morph: m('3', 'Dual') }, { text: 'هم', morph: m('3', 'Plur', 'Masc') }, { text: 'هن', morph: m('3', 'Plur', 'Fem') },
];
const WITH_SUFFIX: Array<[lemma: string, gloss: string, forms: string]> = [
  ['بِ', 'in, with, by', 'بِي بِنَا بِكَ بِكِ بِكُمَا بِكُمْ بِكُنَّ بِهِ بِهَا بِهِمَا بِهِمْ بِهِنَّ'],
  ['لِ', 'to, for', 'لِي لَنَا لَكَ لَكِ لَكُمَا لَكُمْ لَكُنَّ لَهُ لَهَا لَهُمَا لَهُمْ لَهُنَّ'],
  ['فِي', 'in, within', 'فِيَّ فِينَا فِيكَ فِيكِ فِيكُمَا فِيكُمْ فِيكُنَّ فِيهِ فِيهَا فِيهِمَا فِيهِمْ فِيهِنَّ'],
  ['مِنْ', 'from, of', 'مِنِّي مِنَّا مِنْكَ مِنْكِ مِنْكُمَا مِنْكُمْ مِنْكُنَّ مِنْهُ مِنْهَا مِنْهُمَا مِنْهُمْ مِنْهُنَّ'],
  ['عَنْ', 'from, about', 'عَنِّي عَنَّا عَنْكَ عَنْكِ عَنْكُمَا عَنْكُمْ عَنْكُنَّ عَنْهُ عَنْهَا عَنْهُمَا عَنْهُمْ عَنْهُنَّ'],
  ['عَلَى', 'on, over', 'عَلَيَّ عَلَيْنَا عَلَيْكَ عَلَيْكِ عَلَيْكُمَا عَلَيْكُمْ عَلَيْكُنَّ عَلَيْهِ عَلَيْهَا عَلَيْهِمَا عَلَيْهِمْ عَلَيْهِنَّ'],
  ['إِلَى', 'to, towards', 'إِلَيَّ إِلَيْنَا إِلَيْكَ إِلَيْكِ إِلَيْكُمَا إِلَيْكُمْ إِلَيْكُنَّ إِلَيْهِ إِلَيْهَا إِلَيْهِمَا إِلَيْهِمْ إِلَيْهِنَّ'],
  ['لَدَى', 'at, with', 'لَدَيَّ لَدَيْنَا لَدَيْكَ لَدَيْكِ لَدَيْكُمَا لَدَيْكُمْ لَدَيْكُنَّ لَدَيْهِ لَدَيْهَا لَدَيْهِمَا لَدَيْهِمْ لَدَيْهِنَّ'],
  ['مَعَ', 'with', 'مَعِي مَعَنَا مَعَكَ مَعَكِ مَعَكُمَا مَعَكُمْ مَعَكُنَّ مَعَهُ مَعَهَا مَعَهُمَا مَعَهُمْ مَعَهُنَّ'],
  ['عِنْدَ', 'at, with', 'عِنْدِي عِنْدَنَا عِنْدَكَ عِنْدَكِ عِنْدَكُمَا عِنْدَكُمْ عِنْدَكُنَّ عِنْدَهُ عِنْدَهَا عِنْدَهُمَا عِنْدَهُمْ عِنْدَهُنَّ'],
];
for (const [lemma, gloss, forms] of WITH_SUFFIX) {
  forms.split(' ').forEach((form, i) => {
    const slot = SLOTS[i];
    put(form, 'ADP', `${gloss} + pronoun`, { lemma, morph: slot.morph, suffix: slot.text, governs: 'genitive', role: 'preposition with a pronoun suffix' });
  });
}

// ───────────────────────────── conjunctions, negations and the particles of the verb ─────────────────────────────
put('وَ', 'CONJ', 'and', { role: 'conjunction' });
put('فَ', 'CONJ', 'so, then, and so', { role: 'conjunction' });
put('ثُمَّ', 'CONJ', 'then, afterwards', { role: 'conjunction' });
put('أَوْ', 'CONJ', 'or', { role: 'conjunction' });
put('أَمْ', 'CONJ', 'or (in a question)', { role: 'conjunction' });
put('بَلْ', 'CONJ', 'but rather, on the contrary', { role: 'conjunction' });
put('لٰكِنْ', 'CONJ', 'but', { role: 'conjunction' });
put('لَا', 'PART', 'no, not; do not (+ jussive)', { role: 'negation', governs: 'jussive when it forbids' });
put('مَا', 'PART', 'not (negates a verb or a sentence)', { role: 'negation' });
put('لَمْ', 'PART', 'did not (+ jussive)', { role: 'negation of the perfect', governs: 'jussive' });
put('لَمَّا', 'PART', 'when; not yet (+ jussive)', { role: 'conjunction or negation', governs: 'jussive (as a negation)' });
put('لَنْ', 'PART', 'will not (+ subjunctive)', { role: 'negation of the future', governs: 'subjunctive' });
put('لَيْسَ', 'VERB', 'is not, are not', { morph: { VerbForm: 'Fin', Aspect: 'Perf', Mood: 'Ind', Voice: 'Act', Person: '3', Number: 'Sing', Gender: 'Masc' }, role: 'negative copula' });
put('أَنْ', 'SCONJ', 'that (+ subjunctive)', { role: 'subordinator', governs: 'subjunctive' });
put('كَيْ', 'SCONJ', 'so that, in order to (+ subjunctive)', { role: 'subordinator', governs: 'subjunctive' });
put('لِكَيْ', 'SCONJ', 'so that, in order to (+ subjunctive)', { role: 'subordinator', governs: 'subjunctive' });
put('إِذَنْ', 'ADV', 'then, in that case', { role: 'adverb', governs: 'subjunctive' });
put('إِنَّ', 'PART', 'indeed, truly (inna: its subject is accusative)', { role: 'particle of emphasis', governs: 'accusative subject' });
put('أَنَّ', 'SCONJ', 'that (anna: its subject is accusative)', { role: 'subordinator', governs: 'accusative subject' });
put('لِأَنَّ', 'SCONJ', 'because (+ accusative subject)', { role: 'subordinator', governs: 'accusative subject' });
put('كَأَنَّ', 'PART', 'as if (+ accusative subject)', { role: 'particle', governs: 'accusative subject' });
put('لٰكِنَّ', 'CONJ', 'but (+ accusative subject)', { role: 'conjunction', governs: 'accusative subject' });
put('لَيْتَ', 'PART', 'if only (+ accusative subject)', { role: 'particle', governs: 'accusative subject' });
put('لَعَلَّ', 'PART', 'perhaps, may (+ accusative subject)', { role: 'particle', governs: 'accusative subject' });
put('قَدْ', 'PART', 'already, indeed (+ perfect); perhaps (+ imperfect)', { role: 'particle of the verb' });
put('سَوْفَ', 'PART', 'will (puts an imperfect verb in the future)', { role: 'future particle' });
put('إِنْ', 'SCONJ', 'if (+ jussive)', { role: 'conditional', governs: 'jussive' });
put('إِذَا', 'SCONJ', 'if, when', { role: 'conditional' });
put('لَوْ', 'SCONJ', 'if (contrary to fact)', { role: 'conditional' });
put('لَوْلَا', 'SCONJ', 'if it were not for', { role: 'conditional' });
put('إِذْ', 'ADV', 'when, since', { role: 'adverb of time' });
put('حَيْثُ', 'ADV', 'where', { role: 'adverb of place' });
put('كَمَا', 'SCONJ', 'as, just as', { role: 'subordinator' });
put('كُلَّمَا', 'SCONJ', 'whenever', { role: 'subordinator' });
put('بَيْنَمَا', 'SCONJ', 'while, whereas', { role: 'subordinator' });
put('إِلَّا', 'PART', 'except, but', { role: 'exception' });
put('نَعَمْ', 'INTJ', 'yes', { role: 'particle of answer' });
put('بَلَى', 'INTJ', 'yes (answering a negative question)', { role: 'particle of answer' });
put('كَلَّا', 'INTJ', 'no, never', { role: 'particle of answer' });
put('يَا', 'PART', 'O (calls a person)', { role: 'vocative particle' });
put('اللّٰه', 'PROPN', 'God', { role: 'the name of God (lām-prefixed and oath forms: لله, بالله, والله)' });
put('تَاللّٰهِ', 'PROPN', 'by God (oath)', { lemma: 'اللّٰه', fusedOf: 'تَـ + اللّٰه', role: 'oath' });
put('أَيْ', 'PART', 'that is, namely', { role: 'explanatory particle' });
put('أَيْضًا', 'ADV', 'also, too', { role: 'adverb' });
put('جِدًّا', 'ADV', 'very', { role: 'adverb' });
put('فَقَطْ', 'ADV', 'only', { role: 'adverb' });
put('الْآنَ', 'ADV', 'now', { role: 'adverb of time' });

// fused particles: written as one word, not cut
const FUSED = (f: string, gloss: string, of: string, more: Partial<ArClosedEntry> = {}): void => put(f, 'PART', gloss, { fusedOf: of, role: 'fused particles', ...more });
FUSED('مِمَّا', 'from what, than what', 'مِنْ + مَا'); FUSED('عَمَّا', 'about what, from what', 'عَنْ + مَا'); FUSED('فِيمَا', 'in what; while', 'فِي + مَا');
FUSED('إِلَامَ', 'to what? until when?', 'إِلَى + مَا'); FUSED('أَلَّا', 'that not (+ subjunctive)', 'أَنْ + لَا', { governs: 'subjunctive' });
FUSED('أَلَا', 'beware! indeed (opens a sentence)', 'أَ + لَا'); FUSED('لِئَلَّا', 'so that not (+ subjunctive)', 'لِ + أَنْ + لَا', { governs: 'subjunctive' });
FUSED('كَيْلَا', 'so that not (+ subjunctive)', 'كَيْ + لَا', { governs: 'subjunctive' }); FUSED('إِنَّمَا', 'only, but; indeed', 'إِنَّ + مَا');
FUSED('أَمَّا', 'as for', 'أَمْ + مَا'); FUSED('لِمَّا', 'when', 'لِ + مَا');
// ـئذ: the written word ends in the demonstrative-like suffix -ئِذٍ ("at that time")
put('حِينَئِذٍ', 'ADV', 'at that time, then', { role: 'adverb of time' });
put('يَوْمَئِذٍ', 'ADV', 'on that day', { role: 'adverb of time' });
put('سَاعَتَئِذٍ', 'ADV', 'at that hour', { role: 'adverb of time' });
// the vocative يا written onto the next word (Quranic يٰٓأَيُّهَا, plain يأيها): one unit "O (you who)"
put('يَاأَيُّهَا', 'PART', 'O (you who …)', { fusedOf: 'يَا + أَيُّهَا', role: 'vocative' });
AR_CLOSED[arKey('يَأَيُّهَا')] = AR_CLOSED[arKey('يَاأَيُّهَا')];

export const arClosedFor = (key: string): readonly ArClosedEntry[] => AR_CLOSED[key] ?? [];

let LOOSE: Map<string, string[]> | undefined;
/** The entries whose key differs from `key` only by the loose fold (hamza seat, ى / ي, ة / ه): the readings of a loosely spelled closed-class word (الى for إلى). */
export function arClosedLooseFor(key: string): readonly ArClosedEntry[] {
  if (!LOOSE) {
    LOOSE = new Map();
    for (const k of Object.keys(AR_CLOSED)) { const l = arLoose(k); const x = LOOSE.get(l); if (x) x.push(k); else LOOSE.set(l, [k]); }
  }
  return (LOOSE.get(arLoose(key)) ?? []).filter((k) => k !== key).flatMap((k) => AR_CLOSED[k]);
}

// ───────────────────────────── hand priors ─────────────────────────────

/** A dominant reading: the lemma's key (arKey of its head) and the parts of speech it may have. */
export interface ArPrior { lemma: string; pos: readonly string[] }

/**
 * The reading that is the word's main one when a closed-class form is also something else (مِنْ "from" against مَنْ "who", مَنَّ "to
 * favour", أَخَذَ …). A hand prior: running Arabic text is overwhelmingly these. It lifts the reading to 0.70 (notes.identity = 'main');
 * the other readings stay in the list.
 */
export const AR_PRIORS: Readonly<Record<string, ArPrior>> = {
  من: { lemma: 'مِنْ', pos: ['ADP'] }, في: { lemma: 'فِي', pos: ['ADP'] }, على: { lemma: 'عَلَى', pos: ['ADP'] }, عن: { lemma: 'عَنْ', pos: ['ADP'] },
  إلى: { lemma: 'إِلَى', pos: ['ADP'] }, لا: { lemma: 'لَا', pos: ['PART'] }, لم: { lemma: 'لَمْ', pos: ['PART'] }, لن: { lemma: 'لَنْ', pos: ['PART', 'ADV'] },
  قد: { lemma: 'قَدْ', pos: ['PART'] }, هو: { lemma: 'هُوَ', pos: ['PRON'] }, هي: { lemma: 'هِيَ', pos: ['PRON'] }, هل: { lemma: 'هَلْ', pos: ['PART'] },
  ثم: { lemma: 'ثُمَّ', pos: ['CONJ'] }, أو: { lemma: 'أَوْ', pos: ['CONJ'] }, بل: { lemma: 'بَلْ', pos: ['CONJ'] }, و: { lemma: 'وَ', pos: ['CONJ'] },
  ف: { lemma: 'فَ', pos: ['CONJ'] }, هذا: { lemma: 'هٰذَا', pos: ['PRON'] }, ذلك: { lemma: 'ذٰلِكَ', pos: ['PRON'] }, الذي: { lemma: 'الَّذِي', pos: ['PRON'] },
  التي: { lemma: 'الَّتِي', pos: ['PRON'] }, الذين: { lemma: 'الَّذِي', pos: ['PRON'] }, مع: { lemma: 'مَعَ', pos: ['ADP'] }, عند: { lemma: 'عِنْدَ', pos: ['ADP'] },
  نحن: { lemma: 'نَحْنُ', pos: ['PRON'] }, أنا: { lemma: 'أَنَا', pos: ['PRON'] },
};
