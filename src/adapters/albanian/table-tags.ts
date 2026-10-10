/**
 * The dictionary's inflection-table tags for one Albanian form (Wiktionary via kaikki.org: "accusative", "definite",
 * "singular"; "first-person", "present", "subjunctive") → the feature keys and values of THIS adapter's analysis
 * (types.ts), so that a table cell and a generated cell of the same form carry the same `featureKey` and can be merged
 * (`mergeParadigm`).
 *
 * What a row is, in the dictionary's Albanian tables (read from the real data, 2026-10-10):
 *   - noun / name rows: Definite × Case (nominative, accusative, dative, ablative) × Number. There is NO genitive row:
 *     the "dative" row is the genitive-dative, whose forms Albanian shares. Both "genitive" and "dative" map to Case
 *     'Gen,Dat'; "ablative" is its own row ('Abl'), because the indefinite plural ablative has its own form (librash).
 *   - verb rows: Person × Number × (Mood, Tense). The simple tenses become cells (present, imperfect, aorist; the moods
 *     indicative, subjunctive, admirative, optative, imperative). Perfect, pluperfect, future, conditional, progressive
 *     and the negated rows are CONSTRUCTIONS (kam + participle, do të + verb): they are not cells and map to undefined.
 *     The adapter gives the imperative and the optative no Tense, so the table's "optative present" loses its tense here.
 *   - adjective rows: Gender × Number, the linking article inside the form ("i mirë", "të mira"). The adapter has no
 *     case or definiteness for an adjective, so a row with a case other than nominative, or a definite row, is not placed.
 *   - the non-finite rows: participle → VerbForm 'Part'; gerund ("duke punuar") → VerbForm 'Ger'; the infinitive
 *     ("për të punuar") is a construction and is not placed.
 *
 * A label that is not listed is left out and reported by `sqTableTagsDetail().unknown`; it is never guessed. A row that
 * names no feature (only "canonical", "table-tags", "inflection-template", an alternative spelling) maps to undefined.
 * The tables are template-generated and sometimes wrong (docs/albanian/STATUS.md); this module maps what a row SAYS and
 * never corrects it. Disagreement shows up as `conflicted` after the merge.
 */
import type { PartOfSpeech } from '../../core';

export type TableRowSkip =
  | 'not-a-form' // only meta tags: the table header, the template name, the canonical form
  | 'error' // the dictionary's template flagged the cell itself ("error-unrecognized-form")
  | 'construction' // a compound tense or a periphrasis (perfect, future, conditional, infinitive ...)
  | 'not-modelled' // a feature the adapter has no value for (vocative; an adjective's case or definiteness)
  | 'wrong-table'; // a verb's tag in a noun table (the entry has the wrong part of speech) or the reverse

export interface TableTagsDetail {
  features?: Record<string, string>;
  /** Tags that are neither mapped nor known to be ignorable. */
  unknown: string[];
  skipped?: TableRowSkip;
}

const META = new Set([
  'table-tags', 'inflection-template', 'canonical', 'alternative', 'colloquial', 'informal', 'dialectal', 'archaic', 'obsolete', 'dated', 'rare', 'literary',
  'poetic', 'regional', 'nonstandard', 'Gheg', 'Tosk', 'Arbëresh', 'Southern', 'Northern', 'North', 'South', 'Macedonia', 'Northeastern', 'Standard', 'plural-only', 'singular-only',
]);
const ERROR = new Set(['error-unrecognized-form']);
const CONSTRUCTION = new Set([
  'perfect', 'pluperfect', 'future', 'future-i', 'future-ii', 'conditional', 'progressive', 'infinitive', 'negative', 'past-i', 'past-ii', 'past',
]);
const NOT_MODELLED = new Set(['vocative']);

const CASE: Record<string, string> = { nominative: 'Nom', accusative: 'Acc', genitive: 'Gen,Dat', dative: 'Gen,Dat', ablative: 'Abl' };
const NUMBER: Record<string, string> = { singular: 'Sing', plural: 'Plur' };
const DEFINITE: Record<string, string> = { definite: 'Def', indefinite: 'Ind' };
const GENDER: Record<string, string> = { masculine: 'Masc', feminine: 'Fem', neuter: 'Neut' };
const PERSON: Record<string, string> = { 'first-person': '1', 'second-person': '2', 'third-person': '3' };
const TENSE: Record<string, string> = { present: 'Pres', imperfect: 'Imp', aorist: 'Past' };
const MOOD: Record<string, string> = { indicative: 'Ind', subjunctive: 'Sub', imperative: 'Imp', optative: 'Opt', admirative: 'Adm' };
const VOICE: Record<string, string> = { active: 'Act', mediopassive: 'Mid', passive: 'Mid', 'non-active': 'Mid' };

const VERBAL = new Set([...Object.keys(PERSON), ...Object.keys(TENSE), ...Object.keys(MOOD), ...Object.keys(VOICE), 'participle', 'gerund']);

const norm = (t: string): string => t.normalize('NFC').trim().replace(/\s+/g, '-');
const lower = (t: string): string => t.toLowerCase();

/** Everything the mapper learned about one row: the features, what it did not understand, and why it placed nothing. */
export function sqTableTagsDetail(tags: readonly string[], pos: PartOfSpeech): TableTagsDetail {
  const all = tags.map(norm).filter(Boolean);
  const unknown: string[] = [];
  const known = (t: string): boolean => {
    const l = lower(t);
    return META.has(t) || META.has(l) || ERROR.has(l) || CONSTRUCTION.has(l) || NOT_MODELLED.has(l) || l in CASE || l in NUMBER || l in DEFINITE || l in GENDER
      || l in PERSON || l in TENSE || l in MOOD || l in VOICE || l === 'participle' || l === 'gerund' || l === 'clitic';
  };
  for (const t of all) if (!known(t)) unknown.push(t);

  if (all.some((t) => ERROR.has(lower(t)))) return { unknown, skipped: 'error' };

  const verbal = pos === 'VERB' || pos === 'AUX';
  const nominal = pos === 'NOUN' || pos === 'PROPN';
  const adjective = pos === 'ADJ';
  const pronoun = pos === 'PRON' || pos === 'DET';

  // A verb's tags in a noun / adjective / pronoun table, or a case in a verb table: the entry sits under the wrong part of speech.
  if (!verbal && all.some((t) => VERBAL.has(lower(t)) && !(pronoun && lower(t) in PERSON))) return { unknown, skipped: 'wrong-table' };
  if (verbal && all.some((t) => lower(t) in CASE || lower(t) in DEFINITE)) return { unknown, skipped: 'wrong-table' };

  if (all.some((t) => CONSTRUCTION.has(lower(t)))) {
    // "past" alone is not a simple tense of the adapter; every other listed tag is a periphrasis
    return { unknown, skipped: 'construction' };
  }
  if (all.some((t) => NOT_MODELLED.has(lower(t)))) return { unknown, skipped: 'not-modelled' };

  const out: Record<string, string> = {};
  const one = (key: string, map: Record<string, string>): void => {
    const vals: string[] = [];
    for (const t of all) { const v = map[lower(t)]; if (v && !vals.includes(v)) vals.push(v); }
    if (vals.length) out[key] = vals.join(',');
  };

  if (verbal) {
    one('Person', PERSON);
    one('Number', NUMBER);
    one('Tense', TENSE);
    one('Mood', MOOD);
    one('Voice', VOICE);
    if (all.some((t) => lower(t) === 'participle')) return { features: { VerbForm: 'Part' }, unknown };
    if (all.some((t) => lower(t) === 'gerund')) return { features: { VerbForm: 'Ger' }, unknown };
    if (!out.Person && !out.Tense && !out.Mood) return { unknown, skipped: 'not-a-form' };
    out.VerbForm = 'Fin';
    out.Voice ??= 'Act';
    out.Mood ??= 'Ind';
    // the adapter gives the imperative and the optative no tense
    if ((out.Mood === 'Imp' || out.Mood === 'Opt') && out.Tense === 'Pres') delete out.Tense;
    return { features: out, unknown };
  }

  if (nominal || adjective || pronoun) {
    one('Case', CASE);
    one('Number', NUMBER);
    one('Definite', DEFINITE);
    one('Gender', GENDER);
    if (pronoun) one('Person', PERSON);
    if (all.some((t) => lower(t) === 'clitic')) out.Clitic = 'Yes';
    if (adjective) {
      // an adjective's cell is Gender × Number; the linking article is inside the form
      if (out.Definite || (out.Case && out.Case !== 'Nom')) return { unknown, skipped: 'not-modelled' };
      delete out.Case;
      if (!out.Gender && !out.Number) return { unknown, skipped: 'not-a-form' };
    } else if (!Object.keys(out).length) {
      return { unknown, skipped: 'not-a-form' };
    }
    if (nominal && !out.Case && !out.Number && !out.Definite) return { unknown, skipped: 'not-a-form' };
    return { features: out, unknown };
  }
  return { unknown, skipped: 'not-a-form' };
}

/** The adapter's `featuresFromTableTags`: undefined for a row that is not an inflected form of a cell the paradigm can hold. */
export function sqFeaturesFromTableTags(tags: readonly string[], pos: PartOfSpeech): Record<string, string> | undefined {
  return sqTableTagsDetail(tags, pos).features;
}
