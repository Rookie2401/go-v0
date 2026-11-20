/**
 * French inflection labels (kaikki.org / Wiktextract) → the feature keys and values the adapter uses in analysis and in
 * its generated paradigm cells (MORPH package, docs/french/PLAN.md). MACHINE-DRAFTED, not checked by a native speaker.
 *
 * Written AFTER counting the labels the French extract really uses (404,127 French entries; the verb, noun and adjective
 * form-of senses and the conjugation tables of the lemma entries):
 *   form-of senses of verb forms:  first-person second-person third-person singular plural masculine feminine indicative
 *     subjunctive imperative conditional present imperfect future historic past participle (and rarely: infinitive)
 *     "historic past" = the passé simple ("past historic"); "imperfect subjunctive" = the imparfait du subjonctif;
 *     "future" and "historic past" carry NO "indicative" label, "conditional" none either; "participle present" = the
 *     participe présent, "participle past" = the participe passé; a form shared by two readings lists both ("indicative
 *     present singular subjunctive third-person" = il parle, indicative or subjunctive).
 *   conjugation tables: the same labels, one form per row, and "multiword-construction" rows (j'ai parlé, que je parle,
 *     en parlant: tagged perfect, pluperfect, anterior, ...) which are not cells of the simple paradigm; the gerund row is
 *     "gerund participle present" (parlant); every row of a lemma also has an IPA row with the same labels (paʁl).
 *   noun and adjective forms: plural, feminine, masculine, singular, "before-vowel" (bel, nouvel, vieil, fol, mol),
 *     alternative, canonical, plus usage and region labels.
 *
 * Differences from `frenchMorphFromTags`, which labels a dictionary reading's form and may return a comma list:
 *  - a table row names exactly ONE cell, so a row with two values of one feature is not a cell (undefined), except Gender
 *    on a noun or adjective, where "feminine masculine plural" is the form of an invariable word;
 *  - the participe passé row of a lemma ("participle past") is the masculine singular, as the generated cell is;
 *  - rows that are not cells of the simple paradigm at all (compound tenses, reflexive rows, IPA, alternatives) map to undefined.
 */

const PERSON: Record<string, string> = { 'first-person': '1', 'second-person': '2', 'third-person': '3' };
const NUMBER: Record<string, string> = { singular: 'Sing', plural: 'Plur' };
const GENDER: Record<string, string> = { masculine: 'Masc', feminine: 'Fem' };
const MOOD: Record<string, string> = { indicative: 'Ind', subjunctive: 'Sub', imperative: 'Imp', conditional: 'Cnd' };
const TENSE: Record<string, string> = { present: 'Pres', imperfect: 'Imp', future: 'Fut', historic: 'Past' };
const DEGREE: Record<string, string> = { diminutive: 'Dim', augmentative: 'Aug', superlative: 'Sup', comparative: 'Cmp' };

/** Tags that decide a feature (the mappers read them). */
export const USED_TABLE_TAGS: ReadonlySet<string> = new Set([
  ...Object.keys(PERSON), ...Object.keys(NUMBER), ...Object.keys(GENDER), ...Object.keys(MOOD), ...Object.keys(TENSE),
  'past', 'participle', 'gerund', 'infinitive',
]);

/**
 * Tags the mappers know and deliberately let pass: they qualify a row without changing which cell it is (usage labels,
 * regions, the structure words of a form-of sense, remarks on a variant spelling).
 */
export const IGNORED_TABLE_TAGS: ReadonlySet<string> = new Set([
  'form-of', 'before-vowel', 'intransitive', 'active', 'impersonal', 'by-personal-gender', 'gender-neutral', 'invariable', 'plural-only', 'plural-normally',
  'uncountable', 'indeclinable', 'ethnic', 'demonym', 'agent', 'noun-from-verb', 'adjectival', 'unabbreviated', 'emphatic', 'idiomatic', 'neologism',
  'offensive', 'vulgar', 'derogatory', 'slur', 'endearing', 'ironic', 'humorous', 'familiar', 'informal', 'colloquial', 'slang', 'formal', 'literary', 'poetic',
  'obsolete', 'archaic', 'dated', 'rare', 'uncommon', 'nonstandard', 'proscribed', 'hypercorrect', 'misconstruction', 'suppletive', 'traditional', 'common',
  'especially', 'usually', 'broadly', 'also', 'sometimes', 'variant', 'short-form', 'standard', 'modern', 'early', 'historical', 'regional', 'dialectal',
  'quebec', 'canada', 'canadian', 'canadian-french', 'louisiana', 'switzerland', 'belgium', 'france', 'north-america', 'europe', 'northern', 'internet',
  'brazilian', 'spanish', 'french', 'noun', 'interjection', 'apocopic', 'negative', 'interrogative',
]);

/** Tags that mean the row is NOT a cell of the simple paradigm (the whole row maps to undefined). */
export const REJECT_TABLE_TAGS: ReadonlySet<string> = new Set([
  'multiword-construction', 'table-tags', 'inflection-template', 'canonical', 'alternative', 'abbreviation', 'misspelling', 'clipping', 'initialism',
  'error-unrecognized-form', 'error-unknown-tag', 'error-misspelling', 'romanization', 'pronunciation-spelling',
  'perfect', 'pluperfect', 'anterior', 'reflexive', 'pronominal',
  'diminutive', 'augmentative', 'superlative', 'comparative',
]);

/** The tags of a row the mappers do not know, for the probe's report. */
export function unknownTableTags(tags: readonly string[]): string[] {
  return tags.map((t) => t.toLowerCase()).filter((t) => !USED_TABLE_TAGS.has(t) && !IGNORED_TABLE_TAGS.has(t) && !REJECT_TABLE_TAGS.has(t));
}

// ---------------------------------------------------------------------------------------------------------------
// form-of labels (a dictionary reading's form)

const ORDER: Record<string, readonly string[]> = {
  Person: ['1', '2', '3'], Number: ['Plur', 'Sing'], Gender: ['Fem', 'Masc'], Mood: ['Cnd', 'Imp', 'Ind', 'Sub'], Tense: ['Fut', 'Imp', 'Past', 'Pres'],
};

/**
 * Dictionary labels of an inflected form → the features the engine uses for the same form (same keys, same values), so
 * that a rule reading and a dictionary reading of one form never contradict each other. A label set is unordered. Several
 * values of one feature become a comma list in alphabetical order ("first-person third-person singular present subjunctive"
 * → Person "1,3"). Anything else (usage, structure, region, "form-of") says nothing about the form and is ignored.
 *   historic → Tense Past (Mood Ind); future → Tense Fut (Mood Ind); conditional → Mood Cnd, Tense Pres;
 *   imperfect + subjunctive → Mood Sub, Tense Imp; imperative carries no Tense;
 *   participle (or gerund) + past → VerbForm Part, Tense Past; + present → VerbForm Part, Tense Pres.
 */
export function frenchMorphFromTags(tags: readonly string[]): Record<string, string> {
  const have = new Set(tags.map((t) => t.toLowerCase()));
  const pick = (feature: keyof typeof ORDER, table: Record<string, string>): string | undefined => {
    const values = new Set([...have].map((t) => table[t]).filter((v): v is string => v !== undefined));
    const list = ORDER[feature].filter((v) => values.has(v));
    return list.length ? list.join(',') : undefined;
  };
  const out: Record<string, string> = {};
  const set = (k: string, v: string | undefined) => { if (v !== undefined) out[k] = v; };
  if (have.has('participle') || have.has('gerund')) {
    out.VerbForm = 'Part';
    // the agreeing forms ("feminine form-of participle singular") carry no tense label: only a past participle agrees
    const agrees = have.has('masculine') || have.has('feminine');
    if (have.has('present') && !agrees) out.Tense = 'Pres';
    else if (have.has('past') || agrees) out.Tense = 'Past';
    else if (have.has('gerund')) out.Tense = 'Pres';
    if (out.Tense === 'Past') { set('Gender', pick('Gender', GENDER)); set('Number', pick('Number', NUMBER)); }
    return out;
  }
  if (have.has('infinitive')) return { VerbForm: 'Inf' };
  const moodTable: Record<string, string> = { ...MOOD };
  // "historic past" and "future" are the indicative's; the dictionary does not say so
  if (have.has('historic') || have.has('future')) moodTable.historic = moodTable.future = 'Ind';
  const mood = pick('Mood', moodTable);
  if (mood) out.VerbForm = 'Fin';
  set('Mood', mood);
  const tense = pick('Tense', TENSE);
  if (mood === 'Imp') { /* a command has no tense */ } else if (mood === 'Cnd') out.Tense = 'Pres';
  else set('Tense', tense);
  set('Person', pick('Person', PERSON));
  set('Number', pick('Number', NUMBER));
  set('Gender', pick('Gender', GENDER));
  for (const t of have) if (DEGREE[t]) { out.Degree = DEGREE[t]; break; }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// table rows (one cell each)

function one(have: ReadonlySet<string>, table: Record<string, string>): string | undefined | null {
  const values = new Set([...have].map((t) => table[t]).filter((v): v is string => v !== undefined));
  if (values.size === 0) return undefined;
  return values.size === 1 ? [...values][0] : null; // null: the row names several values of the feature
}

/** Why a row maps to nothing, for the probe: 'not-a-cell' | 'no-features' | 'ambiguous' | 'pos'. */
export type RowOutcome = { features: Record<string, string> } | { skipped: 'not-a-cell' | 'no-features' | 'ambiguous' | 'pos' };

const IPA = /[ʁɑɔəɛœøʒʃɲŋɥɡ̃ːˈˌ]|̃/u;

export function tableRow(tags: readonly string[], pos: string, form?: string): RowOutcome {
  const have = new Set(tags.map((t) => t.toLowerCase()));
  for (const t of have) if (REJECT_TABLE_TAGS.has(t) || t.startsWith('error-')) return { skipped: 'not-a-cell' };
  if (form !== undefined && (/\s/.test(form) || !/\p{L}/u.test(form) || IPA.test(form))) return { skipped: 'not-a-cell' };
  const verbal = pos === 'VERB' || pos === 'AUX';
  const nominal = pos === 'NOUN' || pos === 'ADJ';
  if (!verbal && !nominal) return { skipped: 'pos' };
  return verbal ? verbRow(have) : nominalRow(have);
}

function verbRow(have: ReadonlySet<string>): RowOutcome {
  const out: Record<string, string> = {};
  if (have.has('infinitive')) return have.size > 1 && (have.has('first-person') || have.has('second-person') || have.has('third-person')) ? { skipped: 'not-a-cell' } : { features: { VerbForm: 'Inf' } };
  if (have.has('participle') || have.has('gerund')) {
    out.VerbForm = 'Part';
    if (have.has('present') || (have.has('gerund') && !have.has('past'))) { out.Tense = 'Pres'; return { features: out }; }
    out.Tense = 'Past';
    const g = one(have, GENDER), n = one(have, NUMBER);
    if (g === null || n === null) return { skipped: 'ambiguous' };
    // the participe passé row of a lemma entry (no gender, no number) is the masculine singular
    out.Gender = g ?? 'Masc';
    out.Number = n ?? 'Sing';
    return { features: out };
  }
  const moodTable: Record<string, string> = { ...MOOD };
  const mood = have.has('conditional') ? 'Cnd' : one(have, moodTable);
  const tenseV = one(have, TENSE);
  const person = one(have, PERSON);
  const number = one(have, NUMBER);
  if (mood === null || tenseV === null || person === null || number === null) return { skipped: 'ambiguous' };
  // "future" and "historic past" rows carry no mood label: they are the indicative
  const moodValue = mood ?? (tenseV === 'Fut' || tenseV === 'Past' ? 'Ind' : undefined);
  if (!moodValue) return { skipped: 'no-features' };
  out.VerbForm = 'Fin';
  out.Mood = moodValue;
  if (moodValue === 'Cnd') out.Tense = 'Pres';
  else if (moodValue !== 'Imp' && tenseV) out.Tense = tenseV;
  if (person) out.Person = person;
  if (number) out.Number = number;
  if (!out.Person && !out.Number) return { skipped: 'no-features' };
  return { features: out };
}

function nominalRow(have: ReadonlySet<string>): RowOutcome {
  const g = one(have, GENDER);
  const n = one(have, NUMBER);
  if (n === null) return { skipped: 'ambiguous' };
  if (g === undefined && n === undefined) return { skipped: 'no-features' };
  const out: Record<string, string> = {};
  // a row for both genders ("feminine masculine plural") is the form of an invariable word: no Gender, as generated
  if (g) out.Gender = g;
  out.Number = n ?? 'Sing';
  return { features: out };
}

/** The adapter's `featuresFromTableTags`: the feature bundle one table row names, or undefined when it is not a cell. */
export function frenchFeaturesFromTableTags(tags: readonly string[], pos: string, form?: string): Record<string, string> | undefined {
  const r = tableRow(tags, pos, form);
  return 'features' in r ? r.features : undefined;
}
