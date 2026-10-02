/**
 * A dictionary's own labels for German forms and regions turned into this adapter's features and variety codes.
 *
 * The dictionary is the Wiktionary extract from kaikki.org. THE LABEL INVENTORY BELOW WAS WRITTEN FROM KNOWLEDGE OF
 * WIKTIONARY'S CONVENTIONS (nominative, third-person, subjunctive-i, participle + past, strong / weak / mixed …) AND
 * MUST BE CHECKED AGAINST THE REAL FILE when it is available. A label that is not listed is ignored, never guessed.
 *
 * Conventions are those of docs/PLAN11.md: Case Nom|Acc|Dat|Gen; Gender Masc|Fem|Neut; Number Sing|Plur; Person 1|2|3;
 * Mood Ind|Sub|Imp; Tense Pres|Past; VerbForm Fin|Inf|Part; Degree Cmp|Sup; Decl Strong|Weak|Mixed. Several values of
 * one feature (a label set that stands for two cases or two persons) are a comma list in that order. Konjunktiv I is
 * `Mood Sub, Tense Pres`; Konjunktiv II is `Mood Sub, Tense Past`; a past participle is `VerbForm Part, Tense Past`.
 */

const TAG_CASE: Record<string, string> = { nominative: 'Nom', accusative: 'Acc', dative: 'Dat', genitive: 'Gen' };
const TAG_GENDER: Record<string, string> = { masculine: 'Masc', feminine: 'Fem', neuter: 'Neut' };
const TAG_NUMBER: Record<string, string> = { singular: 'Sing', plural: 'Plur' };
const TAG_PERSON: Record<string, string> = { 'first-person': '1', 'second-person': '2', 'third-person': '3' };
const TAG_DECL: Record<string, string> = { strong: 'Strong', weak: 'Weak', mixed: 'Mixed' };
const TAG_DEGREE: Record<string, string> = { comparative: 'Cmp', superlative: 'Sup' };
/** The moods a label names; the two subjunctives also name a tense (handled below). */
const TAG_MOOD: Record<string, string> = { indicative: 'Ind', subjunctive: 'Sub', 'subjunctive-i': 'Sub', 'subjunctive-ii': 'Sub', imperative: 'Imp' };

const ORDER = {
  Case: ['Nom', 'Acc', 'Dat', 'Gen'],
  Gender: ['Masc', 'Fem', 'Neut'],
  Number: ['Sing', 'Plur'],
  Person: ['1', '2', '3'],
  Mood: ['Ind', 'Sub', 'Imp'],
  Tense: ['Pres', 'Past'],
  Decl: ['Strong', 'Weak', 'Mixed'],
} as const;

/** The labels as a set: lower case, spaces read as hyphens ("first person" = "first-person"). */
function labelSet(tags: readonly string[]): Set<string> {
  return new Set(tags.map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter((t) => t !== ''));
}

export function deMorphFromTags(tags: readonly string[]): Record<string, string> {
  const have = labelSet(tags);
  const out: Record<string, string> = {};
  /** The values of one feature the labels give, in the feature's own order, as a comma list. */
  const pick = (feature: keyof typeof ORDER, table: Record<string, string>): string | undefined => {
    const values = new Set<string>();
    for (const t of have) { const v = table[t]; if (v !== undefined) values.add(v); }
    const list = ORDER[feature].filter((v) => values.has(v));
    return list.length ? list.join(',') : undefined;
  };
  const set = (k: string, v: string | undefined) => { if (v !== undefined) out[k] = v; };

  const participle = have.has('participle');
  const infinitive = have.has('infinitive');
  const mood = pick('Mood', TAG_MOOD);

  // An infinitive has no case, person, mood or tense of its own.
  if (infinitive && !participle) { out.VerbForm = 'Inf'; return out; }

  // The tense: present / preterite always; "past" only beside a mood (indicative, subjunctive) or a participle.
  const tenseTable: Record<string, string> = { present: 'Pres', preterite: 'Past' };
  if (have.has('past') && (participle || have.has('indicative') || have.has('subjunctive') || have.has('subjunctive-i') || have.has('subjunctive-ii'))) tenseTable.past = 'Past';
  if (have.has('subjunctive-i')) tenseTable['subjunctive-i'] = 'Pres';
  if (have.has('subjunctive-ii')) tenseTable['subjunctive-ii'] = 'Past';

  if (participle) {
    // a participle has no mood or person; as an adjective it can be declined, so case, gender, number and declension stay
    out.VerbForm = 'Part';
    set('Tense', pick('Tense', { present: 'Pres', past: 'Past', preterite: 'Past' }));
  } else if (mood) {
    out.VerbForm = 'Fin';
    out.Mood = mood;
    // an imperative has no tense; the other moods take the tense the labels name
    if (mood !== 'Imp') set('Tense', pick('Tense', tenseTable));
  } else {
    // no mood and no participle: present / preterite alone still say a tense; "past" alone is not read as one
    set('Tense', pick('Tense', { present: 'Pres', preterite: 'Past' }));
  }
  if (!participle) set('Person', pick('Person', TAG_PERSON));
  set('Case', pick('Case', TAG_CASE));
  set('Gender', pick('Gender', TAG_GENDER));
  set('Number', pick('Number', TAG_NUMBER));
  // Wiktionary's adjective tables label the declension itself "strong", "weak", "mixed"; definite / indefinite are ignored
  set('Decl', pick('Decl', TAG_DECL));
  for (const t of have) if (TAG_DEGREE[t]) { out.Degree = TAG_DEGREE[t]; break; }
  // a form that carries both degrees is not decided: take neither rather than guess
  if (have.has('comparative') && have.has('superlative')) delete out.Degree;
  return out;
}

/** A dictionary's region and usage labels → variety codes (varieties.ts); lower-case keys, spaces read as hyphens. */
export const DE_LABEL_VARIETIES: Readonly<Record<string, string>> = {
  austria: 'de-AT', austrian: 'de-AT',
  switzerland: 'de-CH', swiss: 'de-CH',
  'southern-germany': 'de-south', bavaria: 'de-south',
  'northern-germany': 'de-north',
  dialectal: 'de-dialect', regional: 'de-dialect',
};

export function deVarietiesFromTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of labelSet(tags)) {
    const code = DE_LABEL_VARIETIES[t];
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}
