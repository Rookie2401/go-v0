/**
 * Plain words for a feature bundle, for the word sheet: "dative plural", "masculine accusative singular; weak
 * declension (after der, dieser …)", "first or third person singular, preterite", "Konjunktiv II, third person singular".
 */
import type { PartOfSpeech } from '../../core';

const CASE: Record<string, string> = { Nom: 'nominative', Acc: 'accusative', Dat: 'dative', Gen: 'genitive' };
const GENDER: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' };
const NUMBER: Record<string, string> = { Sing: 'singular', Plur: 'plural' };
const PERSON: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third' };
const TENSE: Record<string, string> = { Pres: 'present', Past: 'preterite' };
const DECL: Record<string, [string, string]> = {
  Strong: ['strong', 'no article'], Weak: ['weak', 'after der, dieser …'], Mixed: ['mixed', 'after ein, kein, mein …'],
};
const PRON: Record<string, string> = {
  Prs: 'personal pronoun', Rel: 'relative pronoun', Dem: 'demonstrative', Int: 'interrogative', Ind: 'indefinite', Neg: 'negative',
};

/** "a", "a or b", "a, b or c". */
function either(values: string[]): string {
  return values.length <= 1 ? (values[0] ?? '') : `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`;
}

function words(value: string | undefined, table: Record<string, string>): string[] {
  if (!value) return [];
  return value.split(',').map((v) => table[v] ?? v);
}

function declension(value: string): string {
  const parts = value.split(',');
  if (parts.length === 1) {
    const d = DECL[parts[0]];
    return d ? `${d[0]} declension (${d[1]})` : `${parts[0].toLowerCase()} declension`;
  }
  return `${either(parts.map((p) => DECL[p]?.[0] ?? p.toLowerCase()))} declension`;
}

/** A plain-words line for a feature bundle ("dative plural", "third person singular, preterite"), for the word sheet. */
export function describeGermanMorph(morph: Record<string, string>, _pos?: PartOfSpeech): string {
  const head: string[] = [];
  const m = morph;
  const number = either(words(m.Number, NUMBER));
  const person = m.Person ? `${either(words(m.Person, PERSON))} person${number ? ` ${number}` : ''}` : '';

  if (m.PronType === 'Art') head.push(m.Definite === 'Ind' ? 'indefinite article' : 'definite article');
  else if (m.PronType && PRON[m.PronType]) head.push(PRON[m.PronType]);
  if (m.Poss === 'Yes') head.push('possessive');
  if (m.Polite === 'Form') head.push('polite (Sie)');

  if (m.Degree === 'Cmp') head.push('comparative');
  else if (m.Degree === 'Sup') head.push('superlative');

  if (m.VerbForm === 'Inf') head.push('infinitive');
  else if (m.VerbForm === 'Part') head.push(m.Tense === 'Pres' ? 'present participle' : 'past participle');
  else if (m.Mood === 'Imp') head.push(person ? `imperative, ${person}` : 'imperative');
  else if (m.Mood === 'Sub') head.push(person ? `Konjunktiv ${m.Tense === 'Past' ? 'II' : 'I'}, ${person}` : `Konjunktiv ${m.Tense === 'Past' ? 'II' : 'I'}`);
  else if (m.Mood === 'Ind' || m.VerbForm === 'Fin') {
    const bits = [person, TENSE[m.Tense ?? ''] ?? ''].filter(Boolean);
    if (bits.length) head.push(bits.join(', '));
  }

  // a pronoun's person (a verb's already stands above); then case, gender and number of a nominal form
  if (m.Person && !m.VerbForm && !m.Mood) head.push(person);
  const nominal = [
    either(words(m.Gender, GENDER)),
    either(words(m.Case, CASE)),
    m.Person || m.VerbForm === 'Fin' || m.Mood ? '' : number,
  ].filter(Boolean).join(' ');
  if (nominal) head.push(nominal);

  let line = head.join(', ');
  if (m.Decl) line += `${line ? '; ' : ''}${declension(m.Decl)}`;
  return line;
}
