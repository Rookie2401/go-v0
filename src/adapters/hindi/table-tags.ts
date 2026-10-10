/**
 * The dictionary's inflection-table tags for one Hindi form (Wiktionary via kaikki.org, templates hi-ndecl, hi-adecl,
 * hi-conj, l-self) -> the feature keys and values of THIS adapter's cells (paradigm.ts), so that a table cell and a
 * generated cell of the same form carry the same `featureKey` and can be merged (`mergeParadigm`).
 *
 * What a row is, in the dictionary's Hindi tables (read from the real data, 2026-10-10; counts in
 * docs/ecosystem/linguistics/PARADIGMS-hi.md):
 *   - noun / name rows: Case (direct, oblique, vocative) x Number. No gender (the table is for one gender; two-gender
 *     entries carry two tables back to back). The cells of a noun are Case x Number, as the adapter's are.
 *   - adjective rows: Case x Gender x Number. The adapter gives the feminine no case (laRkii does not change), so a
 *     feminine row of any case lands on Gender x Number; the masculine keeps its case.
 *   - pronoun rows: direct, indirect (= the oblique stem), ergative, dative, genitive, and the postposition rows
 *     inessive (में), adessive (पर / पे) and terminative (तक) which become Case=Obl with `Adp`. The से row is flagged
 *     "error-unrecognized-form" by the dictionary's own template and is not placed.
 *   - verb rows: only the SINGLE-WORD forms become cells: stem, infinitive, habitual (= imperfective) participle,
 *     perfective participle (and the simple past, which is the same word), conjunctive, the future, the subjunctive,
 *     the commands. Everything built with an auxiliary is a CONSTRUCTION and maps to undefined: the habitual present
 *     and past (karta hai, karta tha), the present perfect and pluperfect (kiya hai, kiya tha), the presumptive
 *     (karta hoga), the contrary-to-fact (karta hota), the compound subjunctive, the "adjectival" participles
 *     (karta hua) and the -vala agent noun. The reduplicated progressive (karte-karte) is not modelled.
 *
 * One table row can stand for several persons (karega = 2nd and 3rd person singular). The adapter's analysis gives
 * one reading per person, so a row expands to several cells: `bundles` lists them, the first is the primary one that
 * `featuresFromTableTags` returns (the third person, whose form the others share).
 *
 * A future-tense row has the SAME tags as the corresponding row of the perfect + future construction (karega /
 * kiya hoga), so the future cannot be told apart from the tags alone: pass the row's `form` (third argument) and a
 * form of more than one word is a construction. Without the form a future row is not placed (`needs-form`).
 *
 * A tag that is neither mapped nor known to be ignorable is listed in `unknown` and never guessed. This module maps what
 * a row SAYS and never corrects it: disagreement shows up as `conflicted` after the merge.
 */
import type { PartOfSpeech } from '../../core';

export type HiRowSkip =
  | 'not-a-form' // only meta tags (the table header, the template name, the class) or a row that names no cell
  | 'error' // the dictionary's template flagged the cell itself
  | 'construction' // built with an auxiliary or another word
  | 'not-modelled' // a single word the adapter has no cell for (agent noun in -vala, reduplicated progressive, third-person polite command)
  | 'needs-form' // the tags alone cannot tell a simple tense from the construction with the same tags: pass the form
  | 'wrong-table'; // the entry sits under a part of speech whose table this is not

export interface HiTableDetail {
  /** The cells the row stands for, primary first. Empty when the row is not placed. */
  bundles: Array<Record<string, string>>;
  unknown: string[];
  skipped?: HiRowSkip;
}

type Features = Record<string, string>;

const META = new Set([
  'table-tags', 'inflection-template', 'class', 'canonical', 'alternative', 'rare', 'colloquial', 'dialectal', 'archaic', 'dated', 'obsolete', 'literary', 'poetic', 'nonstandard', 'Urdu', 'romanization',
]);
const ERROR = 'error-unrecognized-form';

const NOMINAL_CASE: Record<string, string> = { direct: 'Dir', oblique: 'Obl', vocative: 'Voc' };
const NUMBER: Record<string, string> = { singular: 'Sing', plural: 'Plur' };
const GENDER: Record<string, string> = { masculine: 'Masc', feminine: 'Fem' };
const PERSON: Record<string, string> = { 'first-person': '1', 'second-person': '2', 'third-person': '3' };
/** Pronoun rows: the case, and for the postposition rows the postposition written onto the stem. */
const PRON_CASE: Record<string, { Case: string; Adp?: string }> = {
  direct: { Case: 'Dir' }, indirect: { Case: 'Obl' }, oblique: { Case: 'Obl' }, ergative: { Case: 'Erg' }, dative: { Case: 'Dat' }, genitive: { Case: 'Gen' },
  inessive: { Case: 'Obl', Adp: 'में' }, adessive: { Case: 'Obl', Adp: 'पर' }, terminative: { Case: 'Obl', Adp: 'तक' }, vocative: { Case: 'Voc' },
};

const VERBAL = new Set([
  'stem', 'infinitive', 'conjunctive', 'habitual', 'perfective', 'perfect', 'imperfect', 'indicative', 'subjunctive', 'imperative', 'future', 'present', 'past', 'presumptive',
  'counterfactual', 'progressive', 'adjectival', 'agentive', 'prospective', 'first-person', 'second-person', 'third-person', 'formal',
]);
/** Tags that make a verb row an auxiliary construction or something the adapter has no cell for. */
const CONSTRUCTION = new Set(['adjectival', 'presumptive', 'counterfactual']);
const NOT_MODELLED = new Set(['agentive', 'prospective', 'progressive']);

const norm = (t: string): string => t.normalize('NFC').trim().replace(/\s+/g, '-');

/** True for a form of one word (no space, no hyphen) -- the form of a construction or a light-verb lemma has more. */
export const isSingleWord = (form: string): boolean => !/[\s​-]/u.test(form.trim());

function detail(bundles: Features[], unknown: string[], skipped?: HiRowSkip): HiTableDetail {
  return bundles.length ? { bundles, unknown } : { bundles: [], unknown, skipped: skipped ?? 'not-a-form' };
}

/** Everything the mapper learned about one row: the cells, what it did not understand, and why it placed nothing. */
export function hiTableTagsDetail(tags: readonly string[], pos: PartOfSpeech, form?: string): HiTableDetail {
  const all = tags.map(norm).filter(Boolean);
  const set = new Set(all);
  const has = (t: string): boolean => set.has(t);
  const unknown: string[] = [];
  const known = (t: string): boolean => META.has(t) || t === ERROR || t in NOMINAL_CASE || t in NUMBER || t in GENDER || t in PERSON || t in PRON_CASE || VERBAL.has(t);
  for (const t of all) if (!known(t)) unknown.push(t);

  if (has('table-tags') || has('inflection-template') || has('class')) return { bundles: [], unknown, skipped: 'not-a-form' };
  if (has(ERROR)) return { bundles: [], unknown, skipped: 'error' };
  const verbTags = all.some((t) => VERBAL.has(t));

  switch (pos) {
    case 'VERB': case 'AUX': return verbRow(set, unknown, form);
    case 'NOUN': case 'PROPN': {
      if (verbTags) return { bundles: [], unknown, skipped: 'wrong-table' };
      const c = all.map((t) => NOMINAL_CASE[t]).find(Boolean);
      const n = all.map((t) => NUMBER[t]).find(Boolean);
      if (!c || !n) return { bundles: [], unknown, skipped: 'not-a-form' };
      return detail([{ Case: c, Number: n }], unknown);
    }
    case 'ADJ': case 'DET': case 'NUM': return adjectiveRow(all, unknown, verbTags);
    case 'PRON': {
      if (verbTags && !all.some((t) => t in PERSON)) return { bundles: [], unknown, skipped: 'wrong-table' };
      // a possessive (merA, tumhArA) has an adjective's table
      if (all.some((t) => t in GENDER) && !all.some((t) => t === 'ergative' || t === 'dative' || t === 'genitive' || t === 'indirect')) return adjectiveRow(all, unknown, false);
      const c = all.map((t) => PRON_CASE[t]).find(Boolean);
      if (!c) return { bundles: [], unknown, skipped: 'not-a-form' };
      const n = all.map((t) => NUMBER[t]).find(Boolean);
      return detail([{ Case: c.Case, ...(c.Adp ? { Adp: c.Adp } : {}), ...(n ? { Number: n } : {}) }], unknown);
    }
    default: return { bundles: [], unknown, skipped: 'not-a-form' };
  }
}

function adjectiveRow(all: string[], unknown: string[], verbTags: boolean): HiTableDetail {
  if (verbTags) return { bundles: [], unknown, skipped: 'wrong-table' };
  const c = all.map((t) => NOMINAL_CASE[t]).find(Boolean);
  const n = all.map((t) => NUMBER[t]).find(Boolean);
  const g = all.map((t) => GENDER[t]).find(Boolean);
  if (!g || !n) return { bundles: [], unknown, skipped: 'not-a-form' };
  // the adapter gives the feminine no case: one cell per number, whatever the row's case
  if (g === 'Fem') return detail([{ Gender: g, Number: n }], unknown);
  if (!c) return { bundles: [], unknown, skipped: 'not-a-form' };
  return detail([{ Gender: g, Number: n, Case: c }], unknown);
}

/** The person cells a row of a finite verb stands for, as the adapter splits them (see morph-verb.ts `split`). */
function personCells(set: Set<string>, genderFeatures: Features, base: Features): Features[] | undefined {
  const p1 = set.has('first-person'), p2 = set.has('second-person'), p3 = set.has('third-person');
  const plural = set.has('plural'), singular = set.has('singular'), formal = set.has('formal');
  const out: Features[] = [];
  const add = (f: Features): void => { out.push({ ...base, ...genderFeatures, ...f }); };
  if (p2 && formal) { add({ Person: '2', Number: 'Plur', Polite: 'Form' }); }
  else if (p2 && p3 && singular) { add({ Person: '3', Number: 'Sing' }); add({ Person: '2', Number: 'Sing', Polite: 'Infm' }); }
  else if (p1 && p3 && plural) { add({ Person: '3', Number: 'Plur' }); add({ Person: '1', Number: 'Plur' }); }
  else if (p1 && singular) { add({ Person: '1', Number: 'Sing' }); }
  // tum: the adapter's cell has no number
  else if (p2 && !singular && !formal) { add({ Person: '2', Polite: 'Fam' }); }
  else return undefined;
  return out;
}

function verbRow(set: Set<string>, unknown: string[], form?: string): HiTableDetail {
  const has = (t: string): boolean => set.has(t);
  const masc = has('masculine'), fem = has('feminine');
  const gender = masc && !fem ? 'Masc' : fem && !masc ? 'Fem' : undefined;
  const number = has('plural') ? 'Plur' : has('singular') ? 'Sing' : undefined;
  const skip = (s: HiRowSkip): HiTableDetail => ({ bundles: [], unknown, skipped: s });
  const placed = (b: Features[]): HiTableDetail => ({ bundles: b, unknown });
  for (const t of set) if (CONSTRUCTION.has(t)) return skip('construction');
  for (const t of set) if (NOT_MODELLED.has(t)) return skip('not-modelled');
  const hasPerson = has('first-person') || has('second-person') || has('third-person');
  const oneWord = form === undefined ? undefined : isSingleWord(form);

  if (has('stem')) return placed([{ VerbForm: 'Stem' }]);
  if (has('conjunctive')) return placed([{ VerbForm: 'Conv' }]);

  if (has('infinitive')) {
    if (has('oblique')) return placed([number === 'Plur' ? { VerbForm: 'Inf', Gender: 'Masc', Number: 'Plur' } : { VerbForm: 'Inf', Gender: 'Masc', Case: 'Obl' }]);
    if (gender === 'Fem') return placed([number === 'Plur' ? { VerbForm: 'Inf', Gender: 'Fem', Number: 'Plur' } : { VerbForm: 'Inf', Gender: 'Fem' }]);
    if (number === 'Plur') return placed([{ VerbForm: 'Inf', Gender: 'Masc', Number: 'Plur' }]);
    return placed([{ VerbForm: 'Inf', Gender: 'Masc', Case: 'Dir' }]);
  }

  const participle = (aspect: 'Imp' | 'Perf'): HiTableDetail => {
    if (!gender || !number) return skip('not-a-form');
    const f: Features = { VerbForm: 'Part', Aspect: aspect, Gender: gender, Number: number };
    if (gender === 'Masc' && has('oblique') && number === 'Sing') f.Case = 'Obl';
    return placed([f]);
  };
  // the habitual (imperfective) participle and the perfective participle alone
  const bareParticiple = !has('indicative') && !has('subjunctive') && !has('imperative') && !has('present') && !has('past') && !has('future') && !hasPerson && !has('perfect');
  if (has('habitual') && bareParticiple) return participle('Imp');
  if (has('perfective') && bareParticiple) return participle('Perf');

  // the simple past: the perfective participle, agreeing with the thing done (karta hai etc. carry present / past)
  if (has('perfect') && has('indicative') && !has('present') && !has('past') && !has('future')) {
    if (!gender) return skip('not-a-form');
    return placed([{ VerbForm: 'Part', Aspect: 'Perf', Gender: gender, Number: number ?? 'Sing' }]);
  }

  if (has('imperative')) {
    if (!has('second-person') || hasPerson && has('third-person') && !has('formal')) return skip('not-modelled');
    const tense: Features = has('future') ? { Tense: 'Fut' } : {};
    if (oneWord === false) return skip('construction');
    const imp: Features = { VerbForm: 'Fin', Mood: 'Imp', Person: '2', ...tense };
    if (has('formal')) return placed([{ ...imp, Polite: 'Form' }]);
    return placed([{ ...imp, Polite: has('plural') ? 'Fam' : 'Infm' }]);
  }

  if (has('subjunctive')) {
    // the simple subjunctive carries both gender tags (and "future"); the compound ones with an auxiliary carry one
    if (!(masc && fem) || has('present') || has('past')) return skip('construction');
    if (oneWord === false) return skip('construction');
    const cells = personCells(set, {}, { VerbForm: 'Fin', Mood: 'Sub' });
    return cells ? placed(cells) : skip('not-a-form');
  }

  if (has('future') && has('indicative')) {
    if (has('present') || has('past') || has('perfect')) return skip('construction');
    if (oneWord === undefined) return skip('needs-form');
    if (!oneWord) return skip('construction');
    if (!gender) return skip('not-a-form');
    const cells = personCells(set, { Gender: gender }, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Fut' });
    return cells ? placed(cells) : skip('not-a-form');
  }

  // present / past / perfect + an auxiliary: constructions
  if (has('present') || has('past') || has('perfect') || has('indicative') || has('imperfect')) return skip('construction');
  return skip('not-a-form');
}

/** The adapter's `featuresFromTableTags`: the primary cell of a row, undefined for a row that is not an inflected form of a cell. */
export function hiFeaturesFromTableTags(tags: readonly string[], pos: PartOfSpeech, form?: string): Record<string, string> | undefined {
  return hiTableTagsDetail(tags, pos, form).bundles[0];
}
