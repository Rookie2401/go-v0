/**
 * The German adapter's internal contract: what the lexicon holds, what the word-form engine returns, and what the
 * sentence layer makes of it. Written by the coordinator; packages build against it and do not change it (ask).
 *
 * German differs from Spanish in three ways that shape these types:
 *  1. A form states its case, gender and number only as a SET of possibilities ("guten" has more than twenty). A
 *     reading therefore carries `cells` — every possibility — and the sentence layer narrows them by agreement inside
 *     the noun phrase and by what a preposition governs. What cannot be narrowed stays a union ("Case: 'Nom,Acc'"):
 *     it is never guessed.
 *  2. A written word is not always a lexical word: "steht … auf" is aufstehen (two words, one unit), "im" is in + dem
 *     (one word, two units), "Lebensversicherung" is one word with parts. Units go in `AnalysisCandidate.unit`, parts
 *     in `AnalysisCandidate.parts` with a `kind` (see WordPart in src/core/model.ts).
 *  3. Inflection cannot be derived from the lemma alone: a noun's gender, genitive and plural, and a strong verb's
 *     principal parts, are facts of the word. They live in the lexicon rows; the engine applies them.
 *
 * Everything here is Standard German of Germany (de-DE), modern spelling (after 1996/2006). Older spelling is related
 * to it in the analysis layer (historical.ts, `AnalysisCandidate.orthography`), never by changing the text.
 */
import type { PartOfSpeech, RegisterTag, WordPart } from '../../core';

export type DeGender = 'm' | 'f' | 'n';
export type DeCase = 'N' | 'A' | 'D' | 'G';

/**
 * One possibility of case, gender and number for an inflected nominal form. Plural has no gender in German, so the
 * "gender" slot is 'p' for plural. `decl` is set on adjective forms only: the declension the ending belongs to
 * ('st' strong: no article, guter Wein; 'wk' weak: after der/die/das, der gute Wein; 'mx' mixed: after ein/kein/mein,
 * ein guter Wein). The same ending usually belongs to several.
 */
export interface DeCell { c: DeCase; g: DeGender | 'p'; decl?: 'st' | 'wk' | 'mx' }

/**
 * A noun as the lexicon lists it. Row format (lexicon-nouns.ts and lexicon-course.ts):
 *
 *   Mann/m, -es, ¨-er = man; husband
 *   Frau/f, -, -en = woman; wife; Mrs
 *   Kind/n, -es, -er = child
 *   Student/m, -en, -en = student (male) [weak]
 *   Herz/n, -ens, -en = heart | dat sg: Herzen
 *   Milch/f, -, 0 = milk
 *   Eltern/pl = parents
 *   Deutsche/adj = German (person) [adjectival]
 *
 * After the lemma and gender: the genitive singular ending ("-es", "-s", "-", "-en", "-ns", or a whole form), then
 * the nominative plural ("-e", "¨-e", "-er", "¨-er", "-n", "-en", "-s", "-" = same as the singular, "¨-" = umlaut
 * only, "0" = no plural, or a whole form). "¨" means the stem vowel takes an umlaut (a → ä, o → ö, u → ü, au → äu).
 * Tags in brackets: [weak] (n-declension), [adjectival] (declined like an adjective), varieties and registers.
 * After a bar: explicit irregular forms, "case number: form" separated by semicolons.
 */
export interface DeNoun {
  /** With its capital letter: "Mann". */
  lemma: string;
  /** 'pl' = plural only (Eltern, Leute). */
  gender: DeGender | 'pl';
  /** Whole genitive singular form ("Mannes"); absent for plural-only nouns. */
  genSg?: string;
  /** Whole nominative plural form ("Männer"); undefined = no plural in use. */
  plural?: string;
  /** n-declension: -(e)n in every case but the nominative singular (Student, Junge, Herr, Name). */
  weak?: boolean;
  /** Declined like an adjective (der Deutsche, ein Deutscher, die Deutschen). */
  adjectival?: boolean;
  /** Irregular case forms the endings do not give, keyed "D sg", "A sg", "G sg", "D pl". */
  irregular?: Record<string, string>;
  gloss: string;
  varieties?: string[];
  register?: RegisterTag[];
}

/**
 * A verb as the lexicon lists it. Row format (lexicon-verbs.ts and lexicon-course.ts):
 *
 *   machen = to make; to do
 *   arbeiten = to work
 *   fahren = to drive; to go (by vehicle) | fährt, fuhr, gefahren, sein
 *   bringen = to bring | bringt, brachte, gebracht [mixed]
 *   auf|stehen = to get up; to stand up | steht, stand, gestanden, sein
 *   an|rufen = to call (by telephone) | ruft, rief, gerufen
 *   verstehen = to understand | versteht, verstand, verstanden
 *   sich freuen = to be glad [reflexive]
 *   um|fahren = to knock down (driving) | fährt, fuhr, gefahren      (separable: Er fährt das Kind um.)
 *   umfahren = to drive around | umfährt, umfuhr, umfahren           (inseparable: Er umfährt die Baustelle.)
 *
 * A bar "|" inside the lemma marks a SEPARABLE prefix. After the gloss and a bar: the principal parts of the verb as
 * written in the row's own lemma form but WITHOUT a separable prefix — third person singular present, first/third
 * singular preterite, past participle — and optionally the perfect auxiliary (default haben; "sein"; "haben/sein").
 * A weak verb with no vowel change lists no parts. Tags: [mixed], [reflexive], [dat] (takes a dative object),
 * varieties, registers. The truly irregular verbs (sein, haben, werden, the modal verbs, wissen, tun) have their
 * whole paradigm in the engine and are listed here only for their gloss.
 */
export interface DeVerb {
  /** As a dictionary lists it: "aufstehen", "verstehen", "umfahren". */
  lemma: string;
  cls: 'weak' | 'strong' | 'mixed' | 'irregular';
  /** Principal parts of the verb WITHOUT its separable prefix (steht, stand, gestanden for aufstehen). */
  pres3?: string;
  pret?: string;
  part?: string;
  aux: 'haben' | 'sein' | 'haben/sein';
  /** The separable prefix ("auf"); absent = the verb never splits. */
  prefix?: string;
  /** The verb without its separable prefix ("stehen"), when `prefix` is set. */
  base?: string;
  reflexive?: boolean;
  /** Plain note of what it governs, when the row says so ("dat"). */
  governs?: string;
  gloss: string;
  varieties?: string[];
  register?: RegisterTag[];
}

/**
 * An adjective as the lexicon lists it. Row format (lexicon-modifiers.ts):
 *
 *   klein = small
 *   gut = good | besser, best
 *   alt = old | älter, ältest
 *   teuer = expensive | teurer, teuerst [stem: teur]
 *   rosa = pink [indeclinable]
 *
 * After a bar: comparative, then the superlative stem (without "am" and without an ending). Regular comparison
 * (-er, -st / -est) lists nothing. [stem: x] gives the stem the endings attach to when it differs (dunkel → dunkl-).
 */
export interface DeAdjective {
  lemma: string;
  comparative?: string;
  superlative?: string;
  /** The stem inflectional endings attach to, when not the lemma itself (teur-, dunkl-, hoh-). */
  stem?: string;
  indeclinable?: boolean;
  gloss: string;
  varieties?: string[];
  register?: RegisterTag[];
}

/** A word of a closed class with every form listed (articles, pronouns, determiners, numerals that inflect). */
export interface DeClosedForm {
  form: string;
  lemma: string;
  pos: PartOfSpeech;
  gloss: string;
  /** For inflecting forms: every possibility. */
  cells?: DeCell[];
  /** Other features (PronType, Person, Definite, Poss …). */
  morph?: Record<string, string>;
  /** What the word does, when a gloss is not enough: the modal particles (doch, mal, ja, eben, halt, wohl, schon). */
  role?: string;
  /**
   * For determiners: which adjective declension follows ('wk' after der / dieser / jeder; 'mx' after ein / kein / mein).
   * A form without an ending of its own (ein, kein, mein in the nominative masculine and neuter) lets the adjective
   * show the strong ending: that is what "mixed" means, and the sentence layer handles it.
   */
  governsDecl?: 'wk' | 'mx';
}

/** A preposition and the case(s) it governs. Two-way prepositions (in, an, auf …) list ['A', 'D']. */
export interface DePreposition { form: string; cases: DeCase[]; gloss: string }

/** A preposition written together with an article: im = in + dem. */
export interface DeContraction { form: string; preposition: string; article: string; cell: DeCell; gloss: string }

/**
 * How a prefix behaves. 'separable' always splits off (ab, an, auf, aus, ein, mit, nach, vor, zu, zurück, weg …);
 * 'inseparable' never does (be, emp, ent, er, ge, miss, ver, zer); 'dual' depends on the verb and its meaning
 * (durch, über, um, unter, wider, wieder, hinter): for those ONLY the lexicon says which verb is which, and a verb
 * the lexicon does not hold is never split by guess.
 */
export type DePrefixKind = 'separable' | 'inseparable' | 'dual';

/** What the sentence layer and the engine may ask of the lexicon. All lookups take the adapter-normalized (lower-case NFC) form. */
export interface DeLexiconView {
  /** Nouns whose lemma is this (usually one; Band m/n/f are three). */
  nouns(lemma: string): DeNoun[];
  verb(lemma: string): DeVerb[];
  adjective(lemma: string): DeAdjective | undefined;
  /** Closed-class readings of a written form. */
  closed(form: string): DeClosedForm[];
  /** Uninflected words (adverbs, conjunctions, interjections, particles, prepositions) by form. */
  plain(form: string): Array<{ lemma: string; pos: PartOfSpeech; gloss: string; role?: string; register?: RegisterTag[]; varieties?: string[] }>;
  preposition(form: string): DePreposition | undefined;
  contraction(form: string): DeContraction | undefined;
  prefixKind(prefix: string): DePrefixKind | undefined;
  /** Every separable verb of the lexicon whose base is this verb lemma ("stehen" → aufstehen, verstehen is NOT one). */
  separableVerbsOf(base: string): DeVerb[];
  /** Iteration, for building reverse indexes once. */
  allNouns(): readonly DeNoun[];
  allVerbs(): readonly DeVerb[];
  allAdjectives(): readonly DeAdjective[];
}

/**
 * One context-free reading of a written form, from the engine. `cells` holds every case / gender / number possibility
 * of a nominal form; `morph` holds the same as Universal-Dependencies-style features with comma unions
 * ({ Case: 'Nom,Acc', Gender: 'Masc', Number: 'Sing' }) plus the verbal features (VerbForm, Mood, Tense, Person,
 * Number) and Degree. Feature values: Case Nom/Acc/Dat/Gen; Gender Masc/Fem/Neut; Number Sing/Plur; Mood Ind/Sub/Imp;
 * Tense Pres/Past; VerbForm Fin/Inf/Part (an infinitive with inserted zu, anzufangen, is 'Inf' with a 'marker'
 * part); participles are VerbForm 'Part' with Tense 'Past' (gegangen) or 'Pres' (gehend); Konjunktiv I is Mood 'Sub' Tense 'Pres', Konjunktiv II is Mood 'Sub' Tense
 * 'Past'; Degree Cmp/Sup; Decl Strong/Weak/Mixed on adjective forms (a comma union like the rest).
 */
export interface DeReading {
  lemma: string;
  pos: PartOfSpeech;
  morph: Record<string, string>;
  cells?: DeCell[];
  /** 0..1. A reading of a lexicon word by its listed forms or a regular rule is 0.8–0.9; a guess is 0.6 at most. */
  confidence: number;
  /** In plain words, how the reading was reached ("strong verb fahren, third person singular present"). */
  rule: string;
  /** False = the lemma is only inferred (not in the lexicon): the adapter marks the candidate `unconfirmed`. */
  lemmaKnown: boolean;
  gloss?: string;
  /** Parts inside the written word (see WordPart.kind): a separable prefix written on, the inserted zu or ge, compound components. */
  parts?: WordPart[];
  /** For a verb form: the separable prefix the lemma has and whether this form shows it attached ("aufsteht", "aufgestanden", "aufzustehen") or lacks it ("steht"). */
  prefix?: { text: string; attached: boolean };
  role?: string;
  register?: RegisterTag[];
  varieties?: string[];
}

/** Features of a cell set as a morph map with unions, in a fixed order (Nom, Acc, Dat, Gen; Masc, Fem, Neut; Sing, Plur). */
export function morphOfCells(cells: readonly DeCell[]): Record<string, string> {
  const CASE: Record<DeCase, string> = { N: 'Nom', A: 'Acc', D: 'Dat', G: 'Gen' };
  const GENDER: Record<DeGender, string> = { m: 'Masc', f: 'Fem', n: 'Neut' };
  const DECL = { st: 'Strong', wk: 'Weak', mx: 'Mixed' } as const;
  const pick = <T extends string>(order: readonly T[], has: (v: T) => boolean): T[] => order.filter(has);
  const cases = pick(['N', 'A', 'D', 'G'] as const, (c) => cells.some((x) => x.c === c)).map((c) => CASE[c]);
  const genders = pick(['m', 'f', 'n'] as const, (g) => cells.some((x) => x.g === g)).map((g) => GENDER[g]);
  const numbers = [cells.some((x) => x.g !== 'p') ? 'Sing' : '', cells.some((x) => x.g === 'p') ? 'Plur' : ''].filter(Boolean);
  const decls = pick(['st', 'wk', 'mx'] as const, (d) => cells.some((x) => x.decl === d)).map((d) => DECL[d]);
  const out: Record<string, string> = {};
  if (cases.length) out.Case = cases.join(',');
  if (genders.length) out.Gender = genders.join(',');
  if (numbers.length) out.Number = numbers.join(',');
  if (decls.length) out.Decl = decls.join(',');
  return out;
}

/** German umlaut of a stem's last umlautable vowel: Mann → Männ, Haus → Häus, Vogel → Vögel, Buch → Büch. */
export function umlaut(stem: string): string {
  const m = /(au|a|o|u|Au|A|O|U)(?!.*(?:au|a|o|u|Au|A|O|U|ä|ö|ü|Ä|Ö|Ü))/u.exec(stem);
  if (!m) return stem;
  const map: Record<string, string> = { au: 'äu', a: 'ä', o: 'ö', u: 'ü', Au: 'Äu', A: 'Ä', O: 'Ö', U: 'Ü' };
  return stem.slice(0, m.index) + map[m[1]] + stem.slice(m.index + m[1].length);
}
