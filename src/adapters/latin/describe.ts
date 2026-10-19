/**
 * Plain-words descriptions of a Latin feature bundle, for the word sheet ("ablative or dative singular, neuter";
 * "third person singular, perfect indicative active"). Union values ("Abl,Dat") are joined with "or".
 */
import type { PartOfSpeech } from '../../core';

const CASE: Record<string, string> = { Nom: 'nominative', Gen: 'genitive', Dat: 'dative', Acc: 'accusative', Abl: 'ablative', Voc: 'vocative', Loc: 'locative' };
const NUMBER: Record<string, string> = { Sing: 'singular', Plur: 'plural' };
const GENDER: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' };
const TENSE: Record<string, string> = { Pres: 'present', Imp: 'imperfect', Fut: 'future', Perf: 'perfect', Pqp: 'pluperfect', FutPerf: 'future perfect' };
const MOOD: Record<string, string> = { Ind: 'indicative', Sub: 'subjunctive', Imp: 'imperative' };
const VOICE: Record<string, string> = { Act: 'active', Pass: 'passive' };
const PERSON: Record<string, string> = { '1': 'first person', '2': 'second person', '3': 'third person' };
const DEGREE: Record<string, string> = { Cmp: 'comparative', Sup: 'superlative' };

export const LATIN_LABELS = { Case: CASE, Number: NUMBER, Gender: GENDER, Tense: TENSE, Mood: MOOD, Voice: VOICE, Person: PERSON, Degree: DEGREE };

const words = (map: Record<string, string>, v: string | undefined): string | undefined => {
  if (!v) return undefined;
  return v.split(',').map((x) => map[x] ?? x).join(' or ');
};

const nominal = (m: Record<string, string>): string => [words(CASE, m.Case), words(NUMBER, m.Number), words(GENDER, m.Gender)].filter(Boolean).join(' ');

export function describeLatinMorph(morph: Record<string, string>, pos?: PartOfSpeech): string {
  const parts: string[] = [];
  const vf = morph.VerbForm;
  const verbal = pos === 'VERB' || pos === 'AUX' || !!vf;
  if (verbal) {
    if (vf === 'Fin' || (!vf && (morph.Mood || morph.Person))) {
      const who = [words(PERSON, morph.Person), words(NUMBER, morph.Number)].filter(Boolean).join(' ');
      const what = [words(TENSE, morph.Tense), words(MOOD, morph.Mood), words(VOICE, morph.Voice)].filter(Boolean).join(' ');
      parts.push([who, what].filter(Boolean).join(', '));
    } else if (vf === 'Inf') {
      parts.push([words(TENSE, morph.Tense), words(VOICE, morph.Voice), 'infinitive'].filter(Boolean).join(' '));
    } else if (vf === 'Part') {
      const head = [words(TENSE, morph.Tense), words(VOICE, morph.Voice), 'participle'].filter(Boolean).join(' ');
      parts.push([head, nominal(morph)].filter(Boolean).join(', '));
    } else if (vf === 'Gdv') {
      parts.push(['gerundive (verbal adjective of obligation: "to be ...ed")', nominal(morph)].filter(Boolean).join(', '));
    } else if (vf === 'Ger,Gdv' || vf === 'Gdv,Ger') {
      parts.push(['gerund or gerundive', nominal(morph)].filter(Boolean).join(', '));
    } else if (vf === 'Ger') {
      parts.push([words(CASE, morph.Case), 'gerund (verbal noun)'].filter(Boolean).join(' '));
    } else if (vf === 'Sup') {
      parts.push([words(CASE, morph.Case), 'supine'].filter(Boolean).join(' '));
    }
    if (morph.Deponent === 'Yes') parts.push('deponent verb (passive form, active meaning)');
  } else {
    const person = words(PERSON, morph.Person);
    const deg = words(DEGREE, morph.Degree);
    parts.push([person, deg, nominal(morph)].filter(Boolean).join(' '));
  }
  return parts.filter(Boolean).join('; ');
}
