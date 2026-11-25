/**
 * Wiktionary (kaikki.org) Arabic labels → this adapter's features. Three entrances, one reader (the same shape as russian/tags.ts):
 *
 *   arFeaturesOfCode         the tag bundle of an index row ("accusative|indefinite|singular|triptote", "active|indicative|masculine|past|
 *                            perfective|singular|third-person"), the part of speech and the lexeme's own features (`lex`).
 *   arMorphFromTags          the adapter's `morphFromTags`: the labels of a form-of sense (a bundle or a list), no lexeme known.
 *   arFeaturesFromTableTags  the adapter's `featuresFromTableTags`: one row of the dictionary's table → the cell it fills.
 *
 * Keys and values (docs/arabic/PLAN.md, UD style): Case Nom Acc Gen; Number Sing Dual Plur (Coll collective, Pauc paucal); Gender Masc Fem;
 * Definite Def Ind Cons; Person 1 2 3; Aspect Perf Imp (the two conjugations: time is contextual, never claimed); Mood Ind Sub Jus Imp;
 * Voice Act Pass; VerbForm Fin Part Vnoun; Form I … X, Iq … (the lexeme's); Decl Trip Dip Indecl; PluralType Sound Broken; Pausal Yes
 * (the source's "informal" rows: the form without its ending); Degree Cmp (the elative). Several values of one key are one union value,
 * sorted and joined with a comma.
 *
 * Read from the source, never invented:
 *  - the source tags the dual cells of a noun "dual" AND "singular" (a template habit): that is Number=Dual; "dual" with "plural"
 *    (the first-person plural of a preposition) is Number=Plur;
 *  - a past row is Aspect=Perf, a non-past row Aspect=Imp; a participle or a verbal noun under a verb is VerbForm=Part / Vnoun and has
 *    no person or mood;
 *  - the declension class markers (ar-infl-a …), "long-construct" and the register labels are not features (the register labels are
 *    returned apart as `usage`; they lower a reading, they never name a cell);
 *  - a label this file does not know is ignored and COUNTED (`arUnknownTags`).
 */
import type { PartOfSpeech } from '../../core';

type Entry = readonly [key: string, value: string];

const LABELS: Readonly<Record<string, Entry>> = {
  nominative: ['Case', 'Nom'], accusative: ['Case', 'Acc'], genitive: ['Case', 'Gen'],
  singular: ['Number', 'Sing'], plural: ['Number', 'Plur'], dual: ['Number', 'Dual'], collective: ['Number', 'Coll'], paucal: ['Number', 'Pauc'],
  masculine: ['Gender', 'Masc'], feminine: ['Gender', 'Fem'],
  definite: ['Definite', 'Def'], indefinite: ['Definite', 'Ind'], construct: ['Definite', 'Cons'], 'long-construct': ['Definite', 'Cons'],
  'first-person': ['Person', '1'], 'second-person': ['Person', '2'], 'third-person': ['Person', '3'],
  indicative: ['Mood', 'Ind'], subjunctive: ['Mood', 'Sub'], jussive: ['Mood', 'Jus'], imperative: ['Mood', 'Imp'],
  active: ['Voice', 'Act'], passive: ['Voice', 'Pass'],
  triptote: ['Decl', 'Trip'], diptote: ['Decl', 'Dip'], invariable: ['Decl', 'Indecl'],
  'sound-form': ['PluralType', 'Sound'], 'broken-form': ['PluralType', 'Broken'],
  informal: ['Pausal', 'Yes'],
  energetic: ['Mood', 'Ene'],
};

/** Register and style labels: how a form is used, never what it is. */
export const AR_USAGE_LABELS: ReadonlySet<string> = new Set([
  'dialectal', 'poetic', 'archaic', 'rare', 'obsolete', 'dated', 'alternative', 'colloquial', 'slang', 'vulgar', 'literary', 'nonstandard', 'Classical',
  'uncommon', 'formal', 'pejorative', 'derogatory', 'humorous', 'proscribed', 'misspelling', 'regional', 'Hijazi', 'Egyptian', 'Levantine',
]);
/** The ones that make a reading less likely the intended one (the analyser lowers it by 0.10). */
export const AR_LOWERED_USAGE: ReadonlySet<string> = new Set([
  'dialectal', 'poetic', 'archaic', 'rare', 'obsolete', 'dated', 'colloquial', 'slang', 'vulgar', 'nonstandard', 'uncommon', 'proscribed', 'misspelling', 'regional',
]);

/** Known labels that name no feature of the contract (markers of the extract, class markers, kinds of word). */
const NON_FEATURE: ReadonlySet<string> = new Set([
  'canonical', 'romanization', 'table-tags', 'inflection-template', 'form-of', 'alt-of', 'error-unrecognized-form', 'error-unknown-tag', 'enclitic',
  'ar-infl-a', 'ar-infl-in', 'ar-infl-an', 'ar-infl-u', 'ar-infl-ay', 'ar-infl-aw', 'ar-infl-iyy', 'ar-infl-ī', 'ar-infl-ā', 'ar-infl-i', 'ar-infl-ū',
  'noun', 'verb', 'adjective', 'adverb', 'name', 'pronoun', 'relative', 'demonstrative', 'personal', 'transitive', 'intransitive', 'causative', 'reflexive',
  'no-gloss', 'Arabic', 'sound-masculine', 'sound-feminine', 'animate', 'inanimate', 'abstract', 'diminutive', 'relational', 'ellipsis',
  'form-i', 'form-ii', 'form-iii', 'form-iv', 'form-v', 'form-vi', 'form-vii', 'form-viii', 'form-ix', 'form-x', 'form-iq', 'form-iiq', 'form-iiiq', 'form-ivq',
  'non-past', 'past', 'perfective', 'imperfective', 'participle', 'noun-from-verb', 'singulative', 'elative', 'usually', 'sometimes', 'often', 'also',
]);

const POS_NAMES: Readonly<Record<string, string>> = {
  noun: 'NOUN', name: 'PROPN', propn: 'PROPN', verb: 'VERB', adj: 'ADJ', adjective: 'ADJ', adv: 'ADV', pron: 'PRON', det: 'DET', num: 'NUM',
  prep: 'ADP', adp: 'ADP', conj: 'CONJ', sconj: 'SCONJ', particle: 'PART', part: 'PART', intj: 'INTJ', aux: 'AUX',
};
const normPos = (pos: string | undefined): string | undefined => (pos ? POS_NAMES[pos.toLowerCase()] ?? pos.toUpperCase() : undefined);

const UNKNOWN = new Map<string, number>();
/** The labels met that this file does not read, with how often (for the index probe and the tests). */
export const arUnknownTags = (): Array<[string, number]> => [...UNKNOWN.entries()].sort((a, b) => b[1] - a[1]);
export const resetArUnknownTags = (): void => UNKNOWN.clear();
export const isKnownArTag = (t: string): boolean => t in LABELS || AR_USAGE_LABELS.has(t) || NON_FEATURE.has(t);

const NOUNISH = new Set(['NOUN', 'PROPN']);
const VERBAL = new Set(['VERB', 'AUX']);

function parseLex(lex: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of lex.split('|')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i)] = part.slice(i + 1); }
  return out;
}
const joinValues = (values: ReadonlySet<string>): string => [...values].sort().join(',');

interface Read { morph: Record<string, string>; usage: string[] }

function read(tags: readonly string[], pos: string | undefined, lex: string, countUnknown = true): Read {
  const sets: Record<string, Set<string>> = {};
  const seen = new Set<string>();
  const usage: string[] = [];
  const put = (k: string, v: string): void => { (sets[k] ??= new Set()).add(v); };
  for (const raw of tags) {
    const t = raw.trim();
    if (!t) continue;
    seen.add(t);
    const hit = LABELS[t];
    if (hit) { put(hit[0], hit[1]); continue; }
    if (AR_USAGE_LABELS.has(t)) { if (!usage.includes(t)) usage.push(t); continue; }
    if (NON_FEATURE.has(t)) continue;
    if (countUnknown) UNKNOWN.set(t, (UNKNOWN.get(t) ?? 0) + 1);
  }
  const P = normPos(pos);
  const has = (k: string): boolean => (sets[k]?.size ?? 0) > 0;
  // the template's habit: a dual cell is tagged "dual" and "singular"; a first-person "dual|plural" cell is the plural
  if (sets.Number?.has('Dual')) {
    if (sets.Number.has('Plur')) sets.Number = new Set(['Plur']);
    else sets.Number = new Set(['Dual']);
  }
  // the elative has only its one form: comparative or superlative is the sentence's to say
  if (seen.has('elative')) { put('Degree', 'Cmp'); put('Degree', 'Sup'); }
  // the conjugations
  if (seen.has('past') || seen.has('perfective')) put('Aspect', 'Perf');
  // the imperfect rows name only a mood (يَكْتُبْنَ: indicative, subjunctive, jussive): a mood that is not the imperative on a verb row is the imperfect's
  else if (!seen.has('non-past') && !seen.has('imperfective') && !seen.has('participle') && !seen.has('noun-from-verb') && (P === undefined || VERBAL.has(P))
    && (sets.Mood?.has('Ind') || sets.Mood?.has('Sub') || sets.Mood?.has('Jus') || sets.Mood?.has('Ene'))) put('Aspect', 'Imp');
  if (seen.has('non-past') || seen.has('imperfective')) put('Aspect', 'Imp');
  if (seen.has('participle')) { sets.VerbForm = new Set(['Part']); delete sets.Aspect; delete sets.Mood; delete sets.Person; }
  else if (seen.has('noun-from-verb')) { sets.VerbForm = new Set(['Vnoun']); delete sets.Aspect; delete sets.Mood; delete sets.Person; }
  else if (has('Aspect') || has('Mood') || (has('Person') && (P === undefined || VERBAL.has(P)))) { sets.VerbForm = new Set(['Fin']); }
  // an imperative has no aspect of its own (the source gives it no tag): leave it out
  if (sets.Mood?.has('Imp') && sets.Mood.size === 1) delete sets.Aspect;
  if (seen.has('singulative')) { /* the unit of a collective: no feature, the lexeme says it */ }
  // a pausal form has no case ending to name
  if (has('Pausal')) delete sets.Case;

  const morph: Record<string, string> = {};
  for (const [k, vs] of Object.entries(sets)) if (vs.size) morph[k] = joinValues(vs);

  if (lex) {
    const L = parseLex(lex);
    if (L.Gender && !morph.Gender && P !== undefined && NOUNISH.has(P)) morph.Gender = L.Gender;
    if (L.Form && (P === 'VERB' || P === 'AUX' || P === undefined) && morph.VerbForm) morph.Form = L.Form;
    if (L.Decl && !morph.Decl && P !== undefined && (NOUNISH.has(P) || P === 'ADJ')) morph.Decl = L.Decl;
  }
  return { morph, usage };
}

/**
 * The features of one form: a row's tag bundle (joined with "|", "" for a lemma's own citation row of a word with no table), the lemma's
 * UPOS and the lemma's own features (`lex`, "Form=I", "Decl=Trip|Gender=Masc"). `usage` is the register labels of the bundle.
 */
export function arFeaturesOfCode(code: string, pos: string, lex: string): { morph: Record<string, string>; usage: string[] } {
  return read(code ? code.split('|') : [], pos, lex);
}

/** The adapter's `morphFromTags`: a bundle ("a|b") or a list of labels, with the lemma's part of speech when it is known. */
export function arMorphFromTags(tags: string | readonly string[], pos?: string): Record<string, string> {
  return read(typeof tags === 'string' ? (tags ? tags.split('|') : []) : tags, pos, '').morph;
}

const NOT_A_CELL: ReadonlySet<string> = new Set(['canonical', 'romanization', 'table-tags', 'inflection-template', 'error-unrecognized-form', 'error-unknown-tag', 'form-of', 'alt-of']);

/**
 * The adapter's `featuresFromTableTags`: the cell one row of the dictionary's table fills, or undefined for a row that names none
 * (the template's own rows, a romanization, a row the source marks as an error). A verb's participles and verbal nouns are cells with
 * VerbForm=Part / Vnoun; the form itself is not needed to read them.
 */
export function arFeaturesFromTableTags(tags: readonly string[], pos: PartOfSpeech | string, _form?: string): Record<string, string> | undefined {
  for (const t of tags) if (NOT_A_CELL.has(t)) return undefined;
  const m = read(tags, pos, '').morph;
  delete m.Decl; delete m.PluralType;
  return Object.keys(m).length ? m : undefined;
}

/** What the card and the tutorial show for each feature (plain words). */
export const AR_FEATURES: Array<{ key: string; label: string; values: Record<string, string> }> = [
  { key: 'Case', label: 'Case', values: { Nom: 'nominative', Acc: 'accusative', Gen: 'genitive' } },
  { key: 'Number', label: 'Number', values: { Sing: 'singular', Dual: 'dual (two)', Plur: 'plural', Coll: 'collective', Pauc: 'paucal' } },
  { key: 'Gender', label: 'Gender', values: { Masc: 'masculine', Fem: 'feminine' } },
  { key: 'Definite', label: 'Definiteness', values: { Def: 'definite', Ind: 'indefinite', Cons: 'construct state' } },
  { key: 'Person', label: 'Person', values: { 1: '1st person', 2: '2nd person', 3: '3rd person' } },
  { key: 'Aspect', label: 'Conjugation', values: { Perf: 'perfect (completed action)', Imp: 'imperfect (action in progress or not completed)' } },
  { key: 'Mood', label: 'Mood', values: { Ind: 'indicative', Sub: 'subjunctive', Jus: 'jussive', Imp: 'imperative' } },
  { key: 'Voice', label: 'Voice', values: { Act: 'active', Pass: 'passive' } },
  { key: 'VerbForm', label: 'Verb form', values: { Fin: 'finite verb', Part: 'participle', Vnoun: 'verbal noun' } },
  { key: 'Form', label: 'Verb form (measure)', values: { I: 'form I' } },
  { key: 'Decl', label: 'Declension', values: { Trip: 'triptote', Dip: 'diptote', Indecl: 'indeclinable' } },
  { key: 'PluralType', label: 'Plural type', values: { Sound: 'sound plural', Broken: 'broken plural' } },
  { key: 'Pausal', label: 'Pausal form', values: { Yes: 'without its ending (pausal)' } },
];
