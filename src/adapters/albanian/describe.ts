/**
 * A feature bundle in plain words for the word sheet: "definite accusative singular", "third person singular, aorist".
 * Package Q3. Never throws: a feature or value it does not know is skipped; an empty bundle gives an empty string.
 *
 * The features are the conventions of `types.ts` (Case, Number, Gender, Definite, Person, Tense, Mood, Voice, VerbForm,
 * Degree, PronType, Poss, Clitic). A value the form leaves open is a comma union and is read "a, b or c".
 */
import type { PartOfSpeech } from '../../core';

const CASE: Record<string, string> = { Nom: 'nominative', Acc: 'accusative', Gen: 'genitive', Dat: 'dative', Abl: 'ablative' };
const NUMBER: Record<string, string> = { Sing: 'singular', Plur: 'plural' };
const GENDER: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' };
const DEFINITE: Record<string, string> = { Def: 'definite', Ind: 'indefinite' };
const PERSON: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third' };
const DEGREE: Record<string, string> = { Cmp: 'comparative', Sup: 'superlative' };
const PRONTYPE: Record<string, string> = {
  Prs: 'personal pronoun', Dem: 'demonstrative', Int: 'interrogative', Rel: 'relative', Ind: 'indefinite', Neg: 'negative',
};
const TENSE_FULL: Record<string, string> = { Pres: 'present', Imp: 'imperfect', Past: 'aorist (simple past)' };
const TENSE_SHORT: Record<string, string> = { Pres: 'present', Imp: 'imperfect', Past: 'aorist' };
const MOOD_WORD: Record<string, string> = {
  Ind: 'indicative',
  Sub: 'subjunctive (the form used after të)',
  Imp: 'imperative',
  Opt: 'optative (a wish)',
  Adm: 'admirative (surprise)',
};

/** "a" / "a or b" / "a, b or c". */
function orList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** The raw values of one feature, split on the comma union. */
function raw(m: Record<string, string>, key: string): string[] {
  const v = m[key];
  return typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/** The known values of one feature, as plain words, in the order the form states them. */
function vals(m: Record<string, string>, key: string, table: Record<string, string>): string[] {
  const out: string[] = [];
  for (const v of raw(m, key)) {
    const w = Object.prototype.hasOwnProperty.call(table, v) ? table[v] : undefined;
    if (w && !out.includes(w)) out.push(w);
  }
  return out;
}

const has = (m: Record<string, string>, key: string, value: string): boolean => raw(m, key).includes(value);

/** "third person singular", "second or third person singular or plural". */
function personNumber(m: Record<string, string>): string {
  const p = vals(m, 'Person', PERSON);
  const n = vals(m, 'Number', NUMBER);
  return [p.length ? `${orList(p)} person` : '', n.length ? orList(n) : ''].filter(Boolean).join(' ');
}

function describeArticle(m: Record<string, string>): string {
  const g = vals(m, 'Gender', GENDER);
  const n = vals(m, 'Number', NUMBER);
  const c = vals(m, 'Case', CASE);
  const d = vals(m, 'Definite', DEFINITE);
  const noun = [g.length ? orList(g) : '', n.length ? orList(n) : ''].filter(Boolean).join(' ');
  const bits: string[] = [];
  if (noun || c.length) bits.push(`agrees with a ${noun ? `${noun} noun` : 'noun'}${c.length ? ` in the ${orList(c)}` : ''}`);
  if (d.length === 1 && d[0] === 'definite') bits.push('standing directly after a definite noun');
  return bits.length ? `linking article (${bits.join(', ')})` : 'linking article';
}

function describeVerb(m: Record<string, string>): string {
  const bits: string[] = [];
  const pn = personNumber(m);
  if (pn) bits.push(pn);
  const tenses = raw(m, 'Tense').filter((v) => Object.prototype.hasOwnProperty.call(TENSE_FULL, v));
  const moods = raw(m, 'Mood').filter((v) => Object.prototype.hasOwnProperty.call(MOOD_WORD, v));
  if (moods.length === 1 && moods[0] === 'Imp') {
    bits.push('imperative');
  } else if (moods.length === 0 || (moods.length === 1 && moods[0] === 'Ind')) {
    if (tenses.length) bits.push(orList(tenses.map((t) => TENSE_FULL[t])));
    else if (moods.length) bits.push('indicative');
  } else {
    const tense = tenses.length ? `${orList(tenses.map((t) => TENSE_SHORT[t]))} ` : '';
    bits.push(`${tense}${orList(moods.map((x) => MOOD_WORD[x]))}`);
  }
  if (has(m, 'Voice', 'Mid')) bits.push('non-active');
  return bits.join(', ');
}

/** [definite] [gender] [degree] [case] [number], or [definite] [gender] [degree] [number], [cases] when the case is open. */
function nominalPhrase(m: Record<string, string>): string {
  const d = vals(m, 'Definite', DEFINITE);
  const g = vals(m, 'Gender', GENDER);
  const deg = vals(m, 'Degree', DEGREE);
  const c = vals(m, 'Case', CASE);
  const n = vals(m, 'Number', NUMBER);
  const head = [d.length ? orList(d) : '', g.length ? orList(g) : '', deg.length ? orList(deg) : ''];
  if (c.length > 1) {
    const base = [...head, n.length ? orList(n) : ''].filter(Boolean).join(' ');
    return base ? `${base}, ${orList(c)}` : orList(c);
  }
  return [...head, c[0] ?? '', n.length ? orList(n) : ''].filter(Boolean).join(' ');
}

function pronounKind(m: Record<string, string>): string {
  const types = vals(m, 'PronType', PRONTYPE);
  let label = orList(types);
  if (has(m, 'PronType', 'Prs') && has(m, 'Clitic', 'Yes') && types.length === 1) label = 'short (clitic) object pronoun';
  if (has(m, 'Poss', 'Yes')) label = label ? `possessive ${label}` : 'possessive';
  return label;
}

function describePronoun(m: Record<string, string>): string {
  const bits: string[] = [];
  const kind = pronounKind(m);
  if (kind) bits.push(kind);
  if (vals(m, 'Person', PERSON).length === 0) {
    // demonstratives, possessives, interrogatives: described like a noun phrase
    const phrase = nominalPhrase(m);
    if (phrase) bits.push(phrase);
    return bits.join(', ');
  }
  const g = vals(m, 'Gender', GENDER);
  const d = vals(m, 'Definite', DEFINITE);
  const who = [personNumber(m), g.length ? orList(g) : '', d.length ? orList(d) : ''].filter(Boolean).join(' ');
  if (who) bits.push(who);
  const c = vals(m, 'Case', CASE);
  if (c.length) bits.push(orList(c));
  return bits.join(', ');
}

export function describeSqMorph(morph: Record<string, string>, pos?: PartOfSpeech): string {
  try {
    if (!morph || typeof morph !== 'object') return '';
    const m = morph;
    if (has(m, 'PronType', 'Art') && !has(m, 'PronType', 'Prs')) return describeArticle(m);
    if (has(m, 'VerbForm', 'Part')) return ['participle', has(m, 'Voice', 'Mid') ? 'non-active' : ''].filter(Boolean).join(', ');
    const verbal = pos === 'VERB' || pos === 'AUX' || m.Tense !== undefined || m.Mood !== undefined || has(m, 'Voice', 'Mid') || (has(m, 'VerbForm', 'Fin') && m.PronType === undefined);
    if (verbal) return describeVerb(m);
    if (m.PronType !== undefined || m.Poss !== undefined || (m.Person !== undefined && pos !== 'NOUN')) return describePronoun(m);
    return nominalPhrase(m);
  } catch {
    return '';
  }
}
