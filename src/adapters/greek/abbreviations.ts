/**
 * Modern Greek abbreviations, as a closed, hand-written list (2026-11-13). The audit of that date read two Wikipedia articles and found that some of
 * the commonest written forms of Modern Greek prose had no reading at all: π.χ. (five times in one article) and the labels of an etymology (αρχ.).
 * No index holds an abbreviation: Wiktionary's tables list inflected words.
 *
 * What is here is what a reader of ordinary Modern Greek prose meets: the "for example / and so on / that is" family, the era and time-of-day marks,
 * titles, units and the labels an encyclopedia or a dictionary writes before a word of another language. Each entry gives the full words it stands
 * for and an English meaning. Nothing is guessed: a form that is not listed is not an abbreviation here.
 *
 * Keys are the token as the tokenizer makes it (text.ts): the inner full stops stay in the token and the last one is a token of its own, so
 * "π.χ." arrives as `π.χ` followed by `.`. An entry with `dot` is an abbreviation only when that full stop follows (αι. is "century"; αι alone is
 * nothing), because its letters could otherwise be anything. This file has no imports: the sentence splitter reads it too.
 */

export interface ElAbbreviation {
  /** As it is written in full, with its stops: the form shown as the word. */
  written: string;
  /** The Greek words it stands for. */
  expansion: string;
  /** English meaning. */
  gloss: string;
  pos: 'ADV' | 'NOUN' | 'ADJ' | 'VERB' | 'CONJ' | 'X';
  /** An abbreviation only when a full stop follows the token. */
  dot?: boolean;
  /** A title before a name (κ. Παπαδόπουλος): a sentence never ends at its full stop. */
  title?: boolean;
}

const A = (written: string, expansion: string, gloss: string, pos: ElAbbreviation['pos'], more: Partial<ElAbbreviation> = {}): ElAbbreviation => ({ written, expansion, gloss, pos, ...more });

/** By the lower-cased token. */
const BY_KEY: Readonly<Record<string, ElAbbreviation>> = {
  // for example, and so on, that is
  'π.χ': A('π.χ.', 'παραδείγματος χάριν', 'for example', 'ADV'),
  'λ.χ': A('λ.χ.', 'λόγου χάριν', 'for example', 'ADV'),
  'κ.λπ': A('κ.λπ.', 'και λοιπά', 'and so on (etc.)', 'X'),
  'κλπ': A('κλπ.', 'και λοιπά', 'and so on (etc.)', 'X'),
  'κ.τ.λ': A('κ.τ.λ.', 'και τα λοιπά', 'and so on (etc.)', 'X'),
  'κτλ': A('κτλ.', 'και τα λοιπά', 'and so on (etc.)', 'X'),
  'κ.ά': A('κ.ά.', 'και άλλα', 'and others', 'X'),
  'κ.ο.κ': A('κ.ο.κ.', 'και ούτω καθεξής', 'and so forth', 'X'),
  'δηλ': A('δηλ.', 'δηλαδή', 'that is, namely', 'CONJ', { dot: true }),
  'βλ': A('βλ.', 'βλέπε', 'see', 'VERB', { dot: true }),
  'πρβλ': A('πρβλ.', 'παράβαλε', 'compare (cf.)', 'VERB', { dot: true }),
  'ό.π': A('ό.π.', 'όπου παραπάνω', 'as cited above (op. cit.)', 'ADV'),
  'περ': A('περ.', 'περίπου', 'approximately', 'ADV', { dot: true }),
  'μτφ': A('μτφ.', 'μεταφορικά', 'figuratively', 'ADV', { dot: true }),
  // time of day, measures, counts
  'π.μ': A('π.μ.', 'προ μεσημβρίας', 'a.m. (before noon)', 'ADV'),
  'μ.μ': A('μ.μ.', 'μετά μεσημβρίαν', 'p.m. (after noon)', 'ADV'),
  'αι': A('αι.', 'αιώνας', 'century', 'NOUN', { dot: true }),
  'αρ': A('αρ.', 'αριθμός', 'number', 'NOUN', { dot: true }),
  'σελ': A('σελ.', 'σελίδα', 'page', 'NOUN', { dot: true }),
  'τ.μ': A('τ.μ.', 'τετραγωνικά μέτρα', 'square metres', 'NOUN'),
  'χλμ': A('χλμ.', 'χιλιόμετρα', 'kilometres', 'NOUN'),
  'χιλ': A('χιλ.', 'χιλιάδες', 'thousand', 'NOUN', { dot: true }),
  'εκατ': A('εκατ.', 'εκατομμύρια', 'million', 'NOUN', { dot: true }),
  'δισ': A('δισ.', 'δισεκατομμύρια', 'billion', 'NOUN', { dot: true }),
  // titles before a name
  'κ': A('κ.', 'κύριος', 'Mr', 'NOUN', { dot: true, title: true }),
  'κ.κ': A('κ.κ.', 'κύριοι', 'Messrs', 'NOUN', { title: true }),
  'δρ': A('Δρ.', 'δόκτωρ', 'Dr', 'NOUN', { dot: true, title: true }),
  'αγ': A('Αγ.', 'άγιος', 'Saint', 'ADJ', { dot: true, title: true }),
  // the labels of an etymology or an encyclopedia's first line
  'αρχ': A('αρχ.', 'αρχαία ελληνική', 'ancient; Ancient Greek (the label before an ancient word)', 'ADJ', { dot: true }),
  'αγγλ': A('αγγλ.', 'αγγλικά', 'English (the label before an English word)', 'NOUN', { dot: true }),
  'γαλλ': A('γαλλ.', 'γαλλικά', 'French (the label before a French word)', 'NOUN', { dot: true }),
  'γερμ': A('γερμ.', 'γερμανικά', 'German (the label before a German word)', 'NOUN', { dot: true }),
  'ιταλ': A('ιταλ.', 'ιταλικά', 'Italian (the label before an Italian word)', 'NOUN', { dot: true }),
  'λατ': A('λατ.', 'λατινικά', 'Latin (the label before a Latin word)', 'NOUN', { dot: true }),
  'τουρκ': A('τουρκ.', 'τουρκικά', 'Turkish (the label before a Turkish word)', 'NOUN', { dot: true }),
};

/** Written with a capital that the key loses: π.Χ. is "before Christ", π.χ. "for example". By the token as written. */
const BY_SURFACE: Readonly<Record<string, ElAbbreviation>> = {
  'π.Χ': A('π.Χ.', 'προ Χριστού', 'BC (before Christ)', 'ADV'),
  'μ.Χ': A('μ.Χ.', 'μετά Χριστόν', 'AD (after Christ)', 'ADV'),
  // names written as their initials, in capitals (without them the letters read as a diagram label)
  'ΗΠΑ': A('ΗΠΑ', 'Ηνωμένες Πολιτείες Αμερικής', 'the United States of America', 'NOUN'),
  'ΕΕ': A('ΕΕ', 'Ευρωπαϊκή Ένωση', 'the European Union', 'NOUN'),
  'ΟΗΕ': A('ΟΗΕ', 'Οργανισμός Ηνωμένων Εθνών', 'the United Nations', 'NOUN'),
  'ΕΣΣΔ': A('ΕΣΣΔ', 'Ένωση Σοβιετικών Σοσιαλιστικών Δημοκρατιών', 'the Soviet Union (USSR)', 'NOUN'),
};

/**
 * The abbreviation a token is, if any. `surface` is the token as written, `key` its lower-cased form, `dotFollows` whether a full stop comes
 * straight after it.
 */
export function elAbbreviation(surface: string, key: string, dotFollows: boolean): ElAbbreviation | undefined {
  const s = surface.normalize('NFC');
  if (Object.prototype.hasOwnProperty.call(BY_SURFACE, s)) return BY_SURFACE[s];
  // μ.χ in small letters is not a Greek abbreviation; π.χ in small letters is "for example" (the capital form was taken above)
  if (!Object.prototype.hasOwnProperty.call(BY_KEY, key)) return undefined;
  const entry = BY_KEY[key];
  return entry.dot && !dotFollows ? undefined : entry;
}

/** The whole run of letters and inner stops that ends just before `at`: the candidate abbreviation before a full stop ('' when there is none). */
function wordBefore(text: string, at: number): string {
  let start = at;
  while (start > 0 && at - start < 12 && /[\p{L}\p{M}.]/u.test(text[start - 1])) start--;
  if (start > 0 && /[\p{L}\p{M}.]/u.test(text[start - 1])) return ''; // longer than any abbreviation: an ordinary word
  const run = text.slice(start, at).replace(/^\.+/, '');
  return /^\p{L}/u.test(run) ? run : '';
}

/**
 * Whether the full stop at `at` belongs to an abbreviation and does NOT end the sentence: a title's never does; another abbreviation's does not
 * when the text goes on in small letters, a digit or a bracket's end (π.χ. μήλα · 5ος αι. π.Χ. · αρχ. ἄρτος). Before a capital, or at the end
 * of the text, the stop also ends the sentence (… κ.λπ. Το ψωμί …).
 */
export function elAbbreviationStop(text: string, at: number): boolean {
  const before = wordBefore(text, at);
  if (!before) return false;
  const entry = elAbbreviation(before, before.normalize('NFC').toLowerCase(), true);
  if (!entry) return false;
  if (entry.title) return true;
  let j = at + 1;
  while (j < text.length && /[ \t ]/.test(text[j])) j++;
  if (j >= text.length) return false;
  const next = text[j];
  if (/\p{Lu}/u.test(next)) return false;
  return /[\p{Ll}\p{N}),\]»]/u.test(next);
}
