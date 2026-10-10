/**
 * The dictionary's inflection-table tags for one Norwegian form (Wiktionary via kaikki.org, Bokmål and Nynorsk:
 * "definite", "singular"; "past", "participle"; "comparative") -> the feature keys and values of THIS adapter's paradigm
 * cells (paradigm.ts), so that a table cell and a generated cell of the same form carry the same `featureKey` and can be
 * merged (`mergeParadigm`).
 *
 * There is NO Norwegian dictionary on disk yet (docs/norway/SPEC.md section 10 lists the download), so this mapper has not
 * seen a real kaikki row. The vocabulary below is the one Wiktionary's Norwegian templates use for Bokmål and Nynorsk
 * ("indefinite singular", "definite plural"; "present", "past", "past participle", "present participle", "imperative",
 * "passive"; "masculine", "feminine", "neuter"; "comparative", "indefinite superlative", "definite superlative"). When the
 * dictionary arrives, run `noTableTagsDetail(...).unknown` over its rows first: a label that is not listed is left out and
 * reported there, never guessed.
 *
 * What a row is, per part of speech (the cell shapes of paradigm.ts):
 *   noun       Definite x Number. A gender tag on a form row is ignored (the gender belongs to the word, not the cell); a
 *              genitive row is not placed (the -s genitive is not a cell of the table).
 *   adjective  Positive: indefinite singular masculine / feminine ('Fem,Masc' when a row names both or says common gender;
 *              'Masc' or 'Fem' alone otherwise), neuter, definite singular, plural. Degree: comparative; superlative,
 *              indefinite (a bare "superlative" is read as the indefinite one) and definite.
 *   verb       infinitive; present; past; perfect participle ("past participle", "perfect participle", "supine");
 *              imperative; present participle; the -s / -st passive (any row tagged "passive"). A participle used as an
 *              adjective (definite, plural, gender rows) is not a cell and maps to undefined.
 *   pronoun / determiner   Person, Number, Gender, Case (nominative -> Nom, accusative or objective -> Acc), Definite.
 *
 * A row that names no feature (only "canonical", "table-tags", an alternative spelling) maps to undefined. The tables are
 * template-generated and can be wrong; this module maps what a row SAYS and never corrects it.
 */
import type { PartOfSpeech } from '../../core';

export type NoTableRowSkip =
  | 'not-a-form' // only meta tags: the table header, the template name, the canonical form
  | 'error' // the dictionary's template flagged the cell itself
  | 'not-modelled' // a feature the paradigm has no cell for (genitive, an adjectival participle, a bare "definite" adjective)
  | 'wrong-table'; // a tag of another part of speech's table (a verb tag in a noun table, or the reverse)

export interface NoTableTagsDetail {
  features?: Record<string, string>;
  /** Tags that are neither mapped nor known to be ignorable. */
  unknown: string[];
  skipped?: NoTableRowSkip;
}

const META = new Set([
  'table-tags', 'inflection-template', 'canonical', 'alternative', 'colloquial', 'informal', 'dialectal', 'archaic', 'obsolete', 'dated', 'rare', 'literary',
  'poetic', 'regional', 'nonstandard', 'standard', 'Bokmål', 'Nynorsk', 'Riksmål', 'Dano-Norwegian', 'Høgnorsk', 'Landsmål', 'form-of', 'no-gloss',
  'positive', 'active', 'finite', 'singular-only', 'plural-only', 'uncountable', 'countable', 'clitic', 'proper-noun', 'noun-from-verb',
]);
const ERROR = new Set(['error-unrecognized-form']);

const GENDER: Record<string, string> = { masculine: 'Masc', feminine: 'Fem', neuter: 'Neut' };
const NUMBER: Record<string, string> = { singular: 'Sing', plural: 'Plur' };
const DEFINITE: Record<string, string> = { definite: 'Def', indefinite: 'Ind' };
const PERSON: Record<string, string> = { 'first-person': '1', 'second-person': '2', 'third-person': '3' };
const CASE: Record<string, string> = { nominative: 'Nom', accusative: 'Acc', objective: 'Acc', oblique: 'Acc' };
const DEGREE = new Set(['comparative', 'superlative']);
const VERBAL = new Set(['infinitive', 'present', 'past', 'preterite', 'participle', 'perfect', 'supine', 'imperative', 'passive', 'gerund', 'future', 'subjunctive', 'conditional']);
const OTHER_KNOWN = new Set(['common-gender', 'genitive', 'possessive', 'reflexive', 'indeclinable', 'bare']);

const norm = (t: string): string => t.normalize('NFC').trim().replace(/\s+/g, '-');
const lower = (t: string): string => t.toLowerCase();

/** Everything the mapper learned about one row: the features, what it did not understand, and why it placed nothing. */
export function noTableTagsDetail(tags: readonly string[], pos: PartOfSpeech): NoTableTagsDetail {
  const all = tags.map(norm).filter(Boolean);
  const l = all.map(lower);
  const has = (t: string): boolean => l.includes(t);
  const unknown: string[] = [];
  for (const t of all) {
    const k = lower(t);
    const known = META.has(t) || META.has(k) || ERROR.has(k) || k in GENDER || k in NUMBER || k in DEFINITE || k in PERSON || k in CASE || DEGREE.has(k) || VERBAL.has(k) || OTHER_KNOWN.has(k);
    if (!known) unknown.push(t);
  }
  if (l.some((t) => ERROR.has(t))) return { unknown, skipped: 'error' };

  const verbal = pos === 'VERB' || pos === 'AUX';
  const nominal = pos === 'NOUN' || pos === 'PROPN';
  const adjective = pos === 'ADJ';
  const closed = pos === 'PRON' || pos === 'DET';
  if (!verbal && !nominal && !adjective && !closed) return { unknown, skipped: 'not-modelled' };

  const verbTags = l.filter((t) => VERBAL.has(t));
  const numberValue = l.map((t) => NUMBER[t]).find(Boolean);
  const defValue = l.map((t) => DEFINITE[t]).find(Boolean);
  const genders = [...new Set(l.map((t) => GENDER[t]).filter(Boolean))];

  if (verbal) {
    if (has('genitive')) return { unknown, skipped: 'not-modelled' };
    // an adjectival participle (definite / plural / gender rows) is not a verb cell
    if (has('participle') && (numberValue || defValue || genders.length)) return { unknown, skipped: 'not-modelled' };
    if (has('passive')) return { features: { Voice: 'Pass' }, unknown };
    if (has('participle') && has('present')) return { features: { VerbForm: 'Part', Tense: 'Pres' }, unknown };
    if (has('participle') || has('supine') || (has('perfect') && !has('infinitive'))) return { features: { VerbForm: 'Part', Tense: 'Past' }, unknown };
    if (has('imperative')) return { features: { VerbForm: 'Fin', Mood: 'Imp' }, unknown };
    if (has('infinitive')) return { features: { VerbForm: 'Inf' }, unknown };
    if (has('present')) return { features: { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres' }, unknown };
    if (has('past') || has('preterite')) return { features: { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Past' }, unknown };
    // a noun-table tag in a verb table is the entry having the wrong part of speech
    if (numberValue || defValue) return { unknown, skipped: 'wrong-table' };
    return { unknown, skipped: verbTags.length ? 'not-modelled' : 'not-a-form' };
  }

  if (nominal) {
    if (has('genitive')) return { unknown, skipped: 'not-modelled' };
    if (verbTags.length) return { unknown, skipped: 'wrong-table' };
    if (!numberValue || !defValue) return { unknown, skipped: numberValue || defValue ? 'not-modelled' : 'not-a-form' };
    return { features: { Definite: defValue, Number: numberValue }, unknown };
  }

  if (adjective) {
    if (has('genitive')) return { unknown, skipped: 'not-modelled' };
    if (verbTags.length) return { unknown, skipped: 'wrong-table' };
    if (has('comparative')) return { features: { Degree: 'Cmp' }, unknown };
    if (has('superlative')) return { features: { Degree: 'Sup', Definite: defValue === 'Def' ? 'Def' : 'Ind' }, unknown };
    const gender = has('common-gender') || (genders.includes('Masc') && genders.includes('Fem')) ? 'Fem,Masc' : genders.length === 1 ? genders[0] : undefined;
    if (numberValue === 'Plur') return { features: { Degree: 'Pos', Number: 'Plur' }, unknown };
    if (defValue === 'Def' && numberValue === 'Sing') return { features: { Degree: 'Pos', Definite: 'Def', Number: 'Sing' }, unknown };
    if (gender && (defValue === 'Ind' || defValue === undefined) && (numberValue === 'Sing' || numberValue === undefined)) {
      return { features: { Degree: 'Pos', Definite: 'Ind', Gender: gender, Number: 'Sing' }, unknown };
    }
    return { unknown, skipped: defValue || numberValue || genders.length ? 'not-modelled' : 'not-a-form' };
  }

  // pronouns and determiners: the closed-class word list gives Person, Number, Gender, Case, Definite
  const f: Record<string, string> = {};
  for (const t of l) {
    if (PERSON[t]) f.Person = PERSON[t];
    if (CASE[t]) f.Case = CASE[t];
  }
  if (numberValue) f.Number = numberValue;
  if (defValue) f.Definite = defValue;
  if (genders.length) f.Gender = genders.length === 2 && genders.includes('Masc') && genders.includes('Fem') ? 'Fem,Masc' : genders[0];
  if (has('common-gender')) f.Gender = 'Fem,Masc';
  if (has('genitive')) return { unknown, skipped: 'not-modelled' };
  if (!Object.keys(f).length) return { unknown, skipped: 'not-a-form' };
  return { features: f, unknown };
}

/** The features a dictionary row's tags name for this adapter, or undefined when the row names none (or none the table has). */
export function norwegianFeaturesFromTableTags(tags: readonly string[], pos: PartOfSpeech): Record<string, string> | undefined {
  return noTableTagsDetail(tags, pos).features;
}
