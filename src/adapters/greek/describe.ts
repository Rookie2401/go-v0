/** Plain words for a Greek feature bundle (the word sheet's one morphology line). Unknown values pass through. */
import type { PartOfSpeech } from '../../core';

const TENSE: Record<string, string> = { Pres: 'present', Impf: 'imperfect', Fut: 'future', Aor: 'aorist', Perf: 'perfect', Plup: 'pluperfect', FutPerf: 'future perfect' };
const VOICE: Record<string, string> = { Act: 'active', Mid: 'middle', Pass: 'passive', 'Mid,Pass': 'middle/passive' };
const MOOD: Record<string, string> = { Ind: 'indicative', Imp: 'imperative', Sub: 'subjunctive', Opt: 'optative' };
const CASE: Record<string, string> = { Nom: 'nominative', Gen: 'genitive', Dat: 'dative', Acc: 'accusative', Voc: 'vocative' };
const NUMBER: Record<string, string> = { Sing: 'singular', Dual: 'dual', Plur: 'plural' };
const GENDER: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' };
const DEGREE: Record<string, string> = { Cmp: 'comparative', Sup: 'superlative' };
const PRON: Record<string, string> = { Dem: 'demonstrative', 'Int,Ind': 'interrogative or indefinite', Int: 'interrogative', Ind: 'indefinite', Prs: 'personal', Rel: 'relative' };
const PERSON: Record<string, string> = { 1: '1st person', 2: '2nd person', 3: '3rd person' };
const w = (map: Record<string, string>, v?: string): string => (v ? v.split(',').map((x) => map[x] ?? x).join(' or ') : '');

export function describeElMorph(morph: Record<string, string>, pos?: PartOfSpeech): string {
  const parts: string[] = [];
  if (pos === 'VERB' || pos === 'AUX' || morph.Tense || morph.Mood || morph.VerbForm) {
    const tense = w(TENSE, morph.Tense);
    const voice = w(VOICE, morph.Voice);
    if (morph.VerbForm === 'Inf') parts.push([tense, voice, 'infinitive'].filter(Boolean).join(' '));
    else if (morph.VerbForm === 'Part') {
      parts.push([tense, voice, 'participle'].filter(Boolean).join(' '));
      const agr = [w(CASE, morph.Case), w(GENDER, morph.Gender), w(NUMBER, morph.Number)].filter(Boolean).join(' ');
      if (agr) parts.push(agr);
    } else {
      parts.push([tense, voice, w(MOOD, morph.Mood)].filter(Boolean).join(' '));
      const pn = [morph.Person ? PERSON[morph.Person] ?? morph.Person : '', w(NUMBER, morph.Number)].filter(Boolean).join(' ');
      if (pn) parts.push(pn);
    }
    return parts.filter(Boolean).join(', ');
  }
  if (morph.PronType) parts.push(w(PRON, morph.PronType));
  if (morph.Definite === 'Def' && pos === 'DET') parts.push('definite article');
  const agr = [w(CASE, morph.Case), w(GENDER, morph.Gender), w(NUMBER, morph.Number)].filter(Boolean).join(' ');
  if (agr) parts.push(agr);
  if (morph.Person) parts.push(PERSON[morph.Person] ?? morph.Person);
  if (morph.Degree) parts.push(w(DEGREE, morph.Degree));
  if (morph.Adverbial === 'Yes') parts.push('adverbial');
  return parts.join(', ');
}
