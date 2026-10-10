/**
 * Spanish inflection-table tags (kaikki.org / Wiktextract) → the feature keys and values the adapter uses in analysis
 * and in its generated paradigm cells (`spanish/paradigm.ts`). This is the dictionary half of a paradigm: the tags of
 * one table row in, one feature bundle out, so that `cellOf(paradigm, features)` finds the same cell from either side.
 *
 * Differences from `morphFromTags` (es.ts), which labels a dictionary reading's form and may return a comma list:
 *  - a table row names exactly ONE cell, so a row with two values of one feature is not a cell (undefined) — except
 *    Gender on a noun or adjective, where "feminine masculine plural" means the form serves both genders (the
 *    generated cell of an invariable adjective carries no Gender, and so does this one);
 *  - "conditional" wins over "indicative" (Wiktionary tags a conditional row with both) and has no Tense, as in analysis;
 *  - the imperfect subjunctive is Tense=Imp with Variant=Ra, or Variant=Se when the row says so ("imperfect-se");
 *  - a vos row ("vos-form") carries Variety=Voseo, the one feature the paradigm adds (the analysis marks voseo only in
 *    `varieties`; a cell needs a feature to be told apart from tú);
 *  - rows that are not cells of the table at all (clitic-attached "combined-form" rows, negative imperatives, derived
 *    forms, the table's own bookkeeping rows) map to undefined.
 */

const PERSON: Record<string, string> = { 'first-person': '1', 'second-person': '2', 'third-person': '3' };
const NUMBER: Record<string, string> = { singular: 'Sing', plural: 'Plur' };
const GENDER: Record<string, string> = { masculine: 'Masc', feminine: 'Fem' };
const MOOD: Record<string, string> = { indicative: 'Ind', subjunctive: 'Sub', imperative: 'Imp', conditional: 'Cnd' };
const TENSE: Record<string, string> = { present: 'Pres', imperfect: 'Imp', preterite: 'Past', future: 'Fut' };
const NONFINITE: Record<string, string> = { infinitive: 'Inf', gerund: 'Ger', participle: 'Part' };

/** Tags that decide a feature (the mapper reads them). */
export const USED_TABLE_TAGS: ReadonlySet<string> = new Set([
  ...Object.keys(PERSON), ...Object.keys(NUMBER), ...Object.keys(GENDER), ...Object.keys(MOOD), ...Object.keys(TENSE),
  ...Object.keys(NONFINITE), 'imperfect-se', 'imperfect-ra', 'vos-form', 'formal', 'negative',
]);

/**
 * Tags the mapper knows and deliberately lets pass: they qualify a row without changing which cell it is
 * (informal = tú, affirmative = the plain imperative, past = the participle, usage labels on a variant spelling).
 */
export const IGNORED_TABLE_TAGS: ReadonlySet<string> = new Set([
  'informal', 'affirmative', 'past', 'second-person-semantically', 'archaic', 'obsolete', 'dated', 'rare', 'literary', 'colloquial',
  'dialectal', 'regional',
  // regions a variant spelling belongs to: the form is still the cell's form (it becomes an alternative)
  'argentina', 'uruguay', 'rioplatense', 'latin-america', 'spain', 'mexico', 'chile', 'peru', 'colombia', 'venezuela', 'ecuador', 'bolivia', 'paraguay', 'cuba', 'puerto-rico',
  'dominican-republic', 'costa-rica', 'guatemala', 'honduras', 'el-salvador', 'nicaragua', 'panama', 'central-america', 'caribbean', 'andalusia', 'canary-islands', 'aragon', 'philippines', 'us', 'nonstandard', 'uncommon', 'poetic', 'also', 'sometimes', 'usually', 'common', 'not-comparable',
]);

/** Tags that mean the row is NOT a cell of the paradigm (the whole row maps to undefined). */
export const REJECT_TABLE_TAGS: ReadonlySet<string> = new Set([
  'combined-form', 'table-tags', 'inflection-template', 'class', 'canonical', 'form-of', 'alternative', 'diminutive', 'augmentative', 'superlative',
  'comparative', 'abbreviation', 'misspelling', 'error-unrecognized-form', 'error-unknown-tag', 'romanization', 'pronunciation-spelling',
  'with-tú', 'with-vos', 'with-vosotros', 'with-usted', 'with-ustedes', 'with-nosotros',
  'enclitic', 'object-first-person', 'object-second-person', 'object-third-person', 'object-singular', 'object-plural',
  'dative', 'accusative', 'apocopic', 'apocopated', 'pronominal',
]);

/** The tags of a row the mapper does not know, for the probe's report. */
export function unknownTableTags(tags: readonly string[]): string[] {
  return tags.map((t) => t.toLowerCase()).filter((t) => !USED_TABLE_TAGS.has(t) && !IGNORED_TABLE_TAGS.has(t) && !REJECT_TABLE_TAGS.has(t));
}

function one(have: ReadonlySet<string>, table: Record<string, string>): string | undefined | null {
  const values = new Set([...have].map((t) => table[t]).filter((v): v is string => v !== undefined));
  if (values.size === 0) return undefined;
  return values.size === 1 ? [...values][0] : null; // null: the row names several values of the feature
}

/** Why a row maps to nothing, for the probe: 'not-a-cell' | 'no-features' | 'ambiguous' | 'pos'. */
export type RowOutcome = { features: Record<string, string> } | { skipped: 'not-a-cell' | 'no-features' | 'ambiguous' | 'pos' };

export function tableRow(tags: readonly string[], pos: string): RowOutcome {
  const have = new Set(tags.map((t) => t.toLowerCase()));
  for (const t of have) if (REJECT_TABLE_TAGS.has(t)) return { skipped: 'not-a-cell' };
  const verbal = pos === 'VERB' || pos === 'AUX';
  const nominal = pos === 'NOUN' || pos === 'ADJ';
  if (!verbal && !nominal) return { skipped: 'pos' };
  if (verbal) return verbRow(have);
  return nominalRow(have, pos);
}

function verbRow(have: ReadonlySet<string>): RowOutcome {
  const out: Record<string, string> = {};
  const nonFinite = one(have, NONFINITE);
  const mood = one(have, { ...MOOD, conditional: 'Cnd' });
  // "conditional" rows are tagged "indicative" as well: the conditional is the cell
  const moodValue = have.has('conditional') ? 'Cnd' : mood;
  if (nonFinite === null || mood === null && !have.has('conditional')) return { skipped: 'ambiguous' };
  if (have.has('negative')) return { skipped: 'not-a-cell' }; // negative commands are the subjunctive; the paradigm does not place them
  if (nonFinite) {
    // a reflexive verb's table also lists the infinitive and gerund once per person (quejarme, quejarte …): glued forms, not cells
    if (nonFinite !== 'Part' && (have.has('first-person') || have.has('second-person') || have.has('third-person'))) return { skipped: 'not-a-cell' };
    out.VerbForm = nonFinite;
    if (nonFinite === 'Part') {
      const g = one(have, GENDER), n = one(have, NUMBER);
      if (g === null || n === null) return { skipped: 'ambiguous' };
      if (g) out.Gender = g;
      if (n) out.Number = n;
    }
    return { features: out };
  }
  if (!moodValue) return { skipped: 'no-features' };
  out.VerbForm = 'Fin';
  out.Mood = moodValue;
  const tense = one(have, TENSE);
  const person = one(have, PERSON);
  const number = one(have, NUMBER);
  if (tense === null || person === null || number === null) return { skipped: 'ambiguous' };
  if (moodValue !== 'Cnd' && moodValue !== 'Imp' && tense) out.Tense = tense;
  if (person) out.Person = person;
  if (number) out.Number = number;
  if (moodValue === 'Sub' && out.Tense === 'Imp') {
    out.Variant = have.has('imperfect-se') ? 'Se' : 'Ra';
  }
  // the engine marks the usted / ustedes command as formal: Mood Imp with the third person
  if (moodValue === 'Imp' && (out.Person === '3' || have.has('formal'))) {
    out.Polite = 'Form';
    if (out.Person === '2') out.Person = '3'; // "formal ... second-person" would be usted; Wiktionary spells it third-person
  }
  if (have.has('vos-form') && out.Person === '2' && out.Number === 'Sing') out.Variety = 'Voseo';
  if (!out.Person && !out.Number) return { skipped: 'no-features' };
  return { features: out };
}

function nominalRow(have: ReadonlySet<string>, pos: string): RowOutcome {
  const g = one(have, GENDER);
  const n = one(have, NUMBER);
  if (n === null) return { skipped: 'ambiguous' };
  if (g === undefined && n === undefined) return { skipped: 'no-features' };
  const out: Record<string, string> = {};
  // a row for both genders ("feminine masculine plural") is the form of an invariable word: no Gender, as generated
  if (g) out.Gender = g;
  out.Number = n ?? 'Sing';
  void pos;
  return { features: out };
}

/** The adapter's `featuresFromTableTags`: the feature bundle one table row names, or undefined when it is not a cell. */
export function spanishFeaturesFromTableTags(tags: readonly string[], pos: string): Record<string, string> | undefined {
  const r = tableRow(tags, pos);
  return 'features' in r ? r.features : undefined;
}
