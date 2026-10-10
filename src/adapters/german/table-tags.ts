/**
 * German inflection-table tags (kaikki.org / Wiktextract, checked against the real file, 2026-10-10) → the feature keys
 * and values the adapter uses in its generated paradigm cells (`german/paradigm.ts`). This is the dictionary half of a
 * paradigm: the tags of one table row in, one feature bundle out, so that `cellOf(paradigm, features)` finds the same
 * cell from either side.
 *
 * The cell conventions (the same as `paradigm.ts`; the analysis in `tags.ts`/`morphology.ts` uses the same values):
 *  - noun       Case × Number (Gender is a fact of the whole word and is not a cell feature; an adjectival noun adds Decl)
 *  - adjective  Decl (Strong / Weak / Mixed) × Case × Gender (singular only) × Number, and Degree (Cmp / Sup; the positive
 *               has none); the uninflected predicative form is the cell `Position: 'Pred'` (+ Degree)
 *  - determiner Case × Gender (singular only) × Number
 *  - verb       finite VerbForm=Fin, Mood (Ind / Sub / Imp), Tense (Pres / Past; none for the imperative), Person, Number;
 *               Konjunktiv I = Sub + Pres, Konjunktiv II = Sub + Past (as in the analysis); `Clause: 'Sub'` for the
 *               subordinate-clause form of a separable verb (aufsteht); VerbForm=Inf (+ `Variant: 'Zu'` for zu-infinitive)
 *               and VerbForm=Part + Tense for the participles
 * A table row names exactly ONE cell, so a row with two values of one feature is not a cell. Rows that are not cells of
 * the table (the template header rows, the auxiliary, the class, the periphrastic tenses "habe aufgestanden" / "werde
 * aufstehen", the declined participle rows of a verb entry) map to nothing.
 */

const CASE: Record<string, string> = { nominative: 'Nom', genitive: 'Gen', dative: 'Dat', accusative: 'Acc' };
const NUMBER: Record<string, string> = { singular: 'Sing', plural: 'Plur' };
const GENDER: Record<string, string> = { masculine: 'Masc', feminine: 'Fem', neuter: 'Neut' };
const PERSON: Record<string, string> = { 'first-person': '1', 'second-person': '2', 'third-person': '3' };
const DECL: Record<string, string> = { strong: 'Strong', weak: 'Weak', mixed: 'Mixed' };
const DEGREE: Record<string, string> = { comparative: 'Cmp', superlative: 'Sup' };
const MOOD: Record<string, string> = { indicative: 'Ind', imperative: 'Imp', 'subjunctive-i': 'Sub', 'subjunctive-ii': 'Sub' };

/** Tags that decide a feature (the mapper reads them). */
export const USED_TABLE_TAGS: ReadonlySet<string> = new Set([
  ...Object.keys(CASE), ...Object.keys(NUMBER), ...Object.keys(GENDER), ...Object.keys(PERSON), ...Object.keys(DECL),
  ...Object.keys(DEGREE), ...Object.keys(MOOD), 'subjunctive', 'present', 'preterite', 'past', 'infinitive', 'infinitive-zu', 'participle',
  'predicative', 'subordinate-clause',
]);

/**
 * Tags the mapper knows and deliberately lets pass: they qualify a row without changing which cell it is (the article
 * context of an adjective row, usage and region labels on a variant spelling).
 */
export const IGNORED_TABLE_TAGS: ReadonlySet<string> = new Set([
  'definite', 'indefinite', 'negative', 'without-article', 'includes-article', 'with-article', 'usually-without-article',
  'formal', 'rare', 'uncommon', 'archaic', 'obsolete', 'dated', 'colloquial', 'informal', 'nonstandard', 'proscribed', 'regional',
  'dialectal', 'poetic', 'literary', 'standard', 'humorous', 'vernacular', 'common', 'honorific', 'figuratively', 'jargon', 'often',
  'especially', 'possibly', 'also', 'austria', 'switzerland', 'southern-germany', 'northern-germany', 'northwest-german',
  'swiss-german', 'upper-german', 'jewish', 'hypercorrect', 'mutation', 'before-noun', 'with-numeral', 'without-numeral',
  'same-sort', 'different-sort', 'ruhrdeutsch', 'berlinisch', '18th-ct.',
]);

/** Tags that mean the row is NOT a cell of the paradigm (the whole row maps to nothing). */
export const REJECT_TABLE_TAGS: ReadonlySet<string> = new Set([
  'table-tags', 'inflection-template', 'class', 'auxiliary', 'multiword-construction', 'future', 'future-i', 'future-ii', 'perfect',
  'pluperfect', 'alternative', 'diminutive', 'canonical', 'form-of', 'romanization', 'vocative', 'ablative',
]);

/** The tags of a row the mapper does not know, for the probe's report. */
export function unknownTableTags(tags: readonly string[]): string[] {
  return tags.map((t) => t.toLowerCase()).filter((t) => !USED_TABLE_TAGS.has(t) && !IGNORED_TABLE_TAGS.has(t) && !REJECT_TABLE_TAGS.has(t));
}

/** Usage labels that go into a cell's note when a dictionary form carries them. */
const NOTE_LABELS = ['archaic', 'obsolete', 'dated', 'proscribed', 'nonstandard', 'colloquial', 'regional', 'dialectal', 'austria', 'switzerland', 'poetic'];
export function tableNote(tags: readonly string[]): string | undefined {
  const have = new Set(tags.map((t) => t.toLowerCase()));
  const hit = NOTE_LABELS.filter((l) => have.has(l));
  return hit.length ? hit.join(', ') : undefined;
}

/** One value of a feature among the tags: the value, undefined (none named) or null (several named). */
function one(have: ReadonlySet<string>, table: Record<string, string>): string | undefined | null {
  const values = new Set([...have].map((t) => table[t]).filter((v): v is string => v !== undefined));
  if (values.size === 0) return undefined;
  return values.size === 1 ? [...values][0] : null;
}

/** Why a row maps to nothing, for the probe: 'not-a-cell' | 'no-features' | 'ambiguous' | 'pos'. */
export type RowOutcome = { features: Record<string, string> } | { skipped: 'not-a-cell' | 'no-features' | 'ambiguous' | 'pos' };

export function tableRow(tags: readonly string[], pos: string): RowOutcome {
  const have = new Set(tags.map((t) => t.toLowerCase().trim().replace(/\s+/g, '-')));
  for (const t of have) if (REJECT_TABLE_TAGS.has(t)) return { skipped: 'not-a-cell' };
  switch (pos) {
    case 'NOUN': return nominalRow(have, 'NOUN');
    case 'ADJ': return nominalRow(have, 'ADJ');
    case 'DET': return nominalRow(have, 'DET');
    case 'VERB': case 'AUX': return verbRow(have);
    default: return { skipped: 'pos' };
  }
}

function nominalRow(have: ReadonlySet<string>, pos: 'NOUN' | 'ADJ' | 'DET'): RowOutcome {
  const c = one(have, CASE), n = one(have, NUMBER), g = one(have, GENDER), d = one(have, DECL), deg = one(have, DEGREE);
  if (c === null || n === null || g === null || d === null || deg === null) return { skipped: 'ambiguous' };
  const out: Record<string, string> = {};
  if (pos === 'NOUN') {
    // a noun table has Case × Number (and the declension for an adjectival noun); a gender- or degree-specific row is not one of those cells
    if (g !== undefined || deg !== undefined) return { skipped: 'not-a-cell' };
    if (c === undefined || n === undefined) return { skipped: 'no-features' };
    out.Case = c; out.Number = n;
    if (d !== undefined) out.Decl = d;
    return { features: out };
  }
  if (pos === 'DET') {
    if (c === undefined || n === undefined) return { skipped: 'no-features' };
    if (n === 'Sing' && g === undefined) return { skipped: 'no-features' };
    out.Case = c; out.Number = n;
    if (n === 'Sing') out.Gender = g!;
    return { features: out };
  }
  // adjective
  if (deg !== undefined) out.Degree = deg;
  if (have.has('predicative')) {
    // the uninflected form (gut, besser, am besten): one cell, whatever gender and number the table row repeats it under
    if (c !== undefined || d !== undefined) return { skipped: 'ambiguous' };
    out.Position = 'Pred';
    return { features: out };
  }
  if (c === undefined || n === undefined || d === undefined) return { skipped: 'no-features' };
  if (n === 'Sing' && g === undefined) return { skipped: 'no-features' };
  out.Decl = d; out.Case = c; out.Number = n;
  if (n === 'Sing') out.Gender = g!;
  return { features: out };
}

function verbRow(have: ReadonlySet<string>): RowOutcome {
  // the declined participle rows of a verb entry (nominative masculine …) are adjective cells of the participle, not verb cells
  if ([...have].some((t) => CASE[t] || GENDER[t] || DECL[t])) return { skipped: 'not-a-cell' };
  const clause: Record<string, string> = have.has('subordinate-clause') ? { Clause: 'Sub' } : {};
  if (have.has('infinitive')) {
    if (have.has('participle')) return { skipped: 'ambiguous' };
    return { features: { VerbForm: 'Inf', ...(have.has('infinitive-zu') ? { Variant: 'Zu' } : {}) } };
  }
  if (have.has('participle')) {
    const past = have.has('past'), pres = have.has('present');
    if (past === pres) return { skipped: past ? 'ambiguous' : 'no-features' };
    return { features: { VerbForm: 'Part', Tense: past ? 'Past' : 'Pres' } };
  }
  const mood = one(have, MOOD);
  const person = one(have, PERSON), number = one(have, NUMBER);
  if (person === null || number === null) return { skipped: 'ambiguous' };
  if (have.has('subjunctive-i') && have.has('subjunctive-ii')) return { skipped: 'ambiguous' };
  if (have.has('indicative') && (have.has('subjunctive-i') || have.has('subjunctive-ii') || have.has('imperative'))) return { skipped: 'ambiguous' };
  if (mood === null) return { skipped: 'ambiguous' };
  if (mood === undefined) return { skipped: 'no-features' };
  if (person === undefined || number === undefined) return { skipped: 'no-features' };
  const out: Record<string, string> = { VerbForm: 'Fin', Mood: mood, Person: person, Number: number, ...clause };
  if (mood === 'Imp') {
    if (person !== '2') return { skipped: 'not-a-cell' };
    return { features: out };
  }
  if (have.has('subjunctive-i')) out.Tense = 'Pres';
  else if (have.has('subjunctive-ii')) out.Tense = 'Past';
  else if (have.has('present') && !have.has('preterite')) out.Tense = 'Pres';
  else if (have.has('preterite') && !have.has('present')) out.Tense = 'Past';
  else return { skipped: have.has('present') ? 'ambiguous' : 'no-features' };
  return { features: out };
}

/** The leading words of an "includes-article" table form: der große → große, keine großen → großen. */
const ARTICLE = /^(?:der|die|das|des|dem|den|ein|eine|eines|einem|einen|einer|kein|keine|keines|keinem|keinen|keiner)\s+/u;

/**
 * The spelling a table row stands for: an adjective table writes the weak and mixed declensions with their article
 * ("der große", "keine großen"), which is not part of the cell's form; a dash is an empty cell; "older also: daß"
 * and "also der" are annotations, not forms; the reflexive pronoun of a cited infinitive (sich sputen) is dropped. The predicative superlative keeps its "am" ("am größten").
 */
export function tableForm(form: string, tags: readonly string[]): string | undefined {
  let f = form.normalize('NFC').trim();
  if (f === '' || f === '-' || f === '–') return undefined;
  if (/^(?:older also|also|rare|dated)\b:?\s/u.test(f)) return undefined;
  const have = new Set(tags.map((t) => t.toLowerCase()));
  if (have.has('includes-article')) f = f.replace(ARTICLE, '');
  // a reflexive verb's table cites its infinitive and participles with the pronoun (sich sputen); the cell holds the verb alone
  if (have.has('infinitive') || have.has('participle')) f = f.replace(/^sich\s+/u, '');
  return f || undefined;
}
