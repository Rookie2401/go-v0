/**
 * Plain words for a Hebrew feature bundle (the word sheet's one morphology line). Values are the tokens oshb.ts and tags.ts
 * write; anything unknown is passed through rather than hidden.
 */
import type { PartOfSpeech } from '../../core';

export const BINYAN_WORDS: Record<string, string> = {
  Qal: 'Qal', Nifal: 'Nifʿal', Piel: 'Piʿel', Pual: 'Puʿal', Hifil: 'Hifʿil', Hofal: 'Hofʿal', Hitpael: 'Hitpaʿel', Polel: 'Polel', Polal: 'Polal',
  Hitpolel: 'Hitpolel', Poel: 'Poʿel', Poal: 'Poʿal', Palel: 'Palel', Pulal: 'Pulal', QalPass: 'Qal passive', Pilpel: 'Pilpel', Polpal: 'Polpal',
  Hitpalpel: 'Hitpalpel', Nitpael: 'Nitpaʿel', Pealal: 'Peʿalʿal', Pilel: 'Pilel', Hotpaal: 'Hotpaʿal', Tifil: 'Tifʿil', Hishtafel: 'Hishtafʿel',
  Nitpalel: 'Nitpalel', Nitpoel: 'Nitpoʿel', Hitpoel: 'Hitpoʿel',
  Peal: 'Peʿal', Peil: 'Peʿil', Hitpeel: 'Hitpeʿel', Pael: 'Paʿel', Itpaal: 'Itpaʿal', Hitpaal: 'Hitpaʿal', Afel: 'Afʿel', Hafel: 'Hafʿel', Safel: 'Safʿel',
  Shafel: 'Shafʿel', Itpeel: 'Itpeʿel', Ishtafel: 'Ishtafʿel', Hitafel: 'Hitafʿel', Itpoel: 'Itpoʿel', Hefal: 'Hefʿal', Tifel: 'Tifʿel', Palpel: 'Palpel',
  Itpalpel: 'Itpalpel', Itpolel: 'Itpolel', Ittafal: 'Ittafʿal',
};
export const CONJ_WORDS: Record<string, string> = {
  Perf: 'perfect (qatal)', WeQatal: 'weqatal (sequential perfect)', Impf: 'imperfect (yiqtol)', Wayyiqtol: 'wayyiqtol (narrative past)', Coh: 'cohortative',
  Juss: 'jussive', Imp: 'imperative', Part: 'participle', PassPart: 'passive participle', InfAbs: 'infinitive absolute', InfCons: 'infinitive construct',
  // Modern Hebrew (tags.ts)
  Past: 'past', Pres: 'present', Fut: 'future',
};
const GENDER: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Com: 'common gender', 'Fem,Masc': 'masculine or feminine' };
const NUMBER: Record<string, string> = { Sing: 'singular', Plur: 'plural', Dual: 'dual' };
const STATE: Record<string, string> = { Abs: 'absolute', Cons: 'construct', Det: 'determined (emphatic)' };
const PRON: Record<string, string> = { Dem: 'demonstrative', Ind: 'indefinite', Int: 'interrogative', Prs: 'personal', Rel: 'relative' };
const PART: Record<string, string> = { Obj: 'object marker', Int: 'interrogative particle', Aff: 'affirmative particle', Exh: 'exhortation particle' };
const PERSON: Record<string, string> = { 1: '1st person', 2: '2nd person', 3: '3rd person' };

export function describeHeMorph(morph: Record<string, string>, pos?: PartOfSpeech): string {
  const parts: string[] = [];
  const g = morph.Gender ? GENDER[morph.Gender] ?? morph.Gender : '';
  const n = morph.Number ? NUMBER[morph.Number] ?? morph.Number : '';
  if (pos === 'VERB' || pos === 'AUX' || morph.Binyan || morph.Conj) {
    if (morph.Binyan) parts.push(BINYAN_WORDS[morph.Binyan] ?? morph.Binyan);
    if (morph.Conj) parts.push(CONJ_WORDS[morph.Conj] ?? morph.Conj);
    const pgn = [morph.Person ? PERSON[morph.Person] ?? morph.Person : '', g, n].filter(Boolean).join(' ');
    if (pgn) parts.push(pgn);
    if (morph.State) parts.push(STATE[morph.State] ?? morph.State);
    if (morph.Voice === 'Pass') parts.push('passive');
    return parts.join(', ');
  }
  if (morph.PronType) parts.push(PRON[morph.PronType] ?? morph.PronType);
  if (morph.PartType) parts.push(PART[morph.PartType] ?? morph.PartType);
  if (morph.Polarity === 'Neg') parts.push('negative');
  if (morph.NumType === 'Ord') parts.push('ordinal');
  if (morph.NumType === 'Card') parts.push('cardinal number');
  if (morph.NounType === 'Gent') parts.push('gentilic');
  const pgn = [morph.Person ? PERSON[morph.Person] ?? morph.Person : '', g, n].filter(Boolean).join(' ');
  if (pgn) parts.push(pgn);
  if (morph.State) parts.push(STATE[morph.State] ?? morph.State);
  if (morph.Definite === 'Def' && pos !== 'DET') parts.push('with the article');
  if (morph.Poss === 'Yes') parts.push('with a possessive suffix');
  if (morph.Case === 'Dir') parts.push('directional ending');
  return parts.join(', ');
}
