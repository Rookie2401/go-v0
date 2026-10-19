/**
 * MorphGNT codes → this adapter's readings. A MorphGNT token has a part-of-speech code (two characters) and an eight-column parse
 * (person · tense · voice · mood · case · number · gender · degree, "-" where a column does not apply):
 *   "V- 3IAI-S--" is a verb, 3rd person, imperfect, active, indicative, singular. Reference: github.com/morphgnt/sblgnt.
 * Feature keys (UD-style): Person, Tense, Voice, Mood, VerbForm, Case, Number, Gender, Degree, PronType, Definite.
 */
import type { PartOfSpeech } from '../../core';

export const POS: Record<string, PartOfSpeech> = {
  'A-': 'ADJ', 'C-': 'CONJ', 'D-': 'ADV', 'I-': 'INTJ', 'N-': 'NOUN', 'P-': 'ADP', RA: 'DET', RD: 'PRON', RI: 'PRON', RP: 'PRON', RR: 'PRON', 'V-': 'VERB', 'X-': 'PART',
};
const TENSE: Record<string, string> = { P: 'Pres', I: 'Impf', F: 'Fut', A: 'Aor', X: 'Perf', Y: 'Plup' };
const VOICE: Record<string, string> = { A: 'Act', M: 'Mid', P: 'Pass' };
const MOOD: Record<string, string> = { I: 'Ind', D: 'Imp', S: 'Sub', O: 'Opt', N: 'Inf', P: 'Part' };
const CASE: Record<string, string> = { N: 'Nom', G: 'Gen', D: 'Dat', A: 'Acc', V: 'Voc' };
const NUMBER: Record<string, string> = { S: 'Sing', P: 'Plur' };
const GENDER: Record<string, string> = { M: 'Masc', F: 'Fem', N: 'Neut' };
const DEGREE: Record<string, string> = { C: 'Cmp', S: 'Sup' };
const PRON: Record<string, string> = { RD: 'Dem', RI: 'Int,Ind', RP: 'Prs', RR: 'Rel' };

export interface MorphGntReading { pos: PartOfSpeech; morph: Record<string, string> }

/** `code` is "<pos>|<parse>" as the index stores it ("N-|----NSF-"); a bare pos ("P-") has no parse. */
export function decodeMorphGnt(code: string, lemma?: string): MorphGntReading {
  const [posCode, parse = ''] = code.split('|');
  let pos: PartOfSpeech = POS[posCode] ?? 'X';
  const morph: Record<string, string> = {};
  if (parse.length === 8) {
    const [p, t, v, m, c, n, g, d] = parse;
    if (/[123]/.test(p)) morph.Person = p;
    if (TENSE[t]) morph.Tense = TENSE[t];
    if (VOICE[v]) morph.Voice = VOICE[v];
    if (MOOD[m]) {
      if (m === 'N') morph.VerbForm = 'Inf';
      else if (m === 'P') morph.VerbForm = 'Part';
      else { morph.Mood = MOOD[m]; morph.VerbForm = 'Fin'; }
    }
    if (CASE[c]) morph.Case = CASE[c];
    if (NUMBER[n]) morph.Number = NUMBER[n];
    if (GENDER[g]) morph.Gender = GENDER[g];
    if (DEGREE[d]) morph.Degree = DEGREE[d];
  }
  if (PRON[posCode]) morph.PronType = PRON[posCode];
  if (posCode === 'RA') morph.Definite = 'Def';
  // MorphGNT writes every noun N-: a capitalised lemma is a name
  if (pos === 'NOUN' && lemma && /^\p{Lu}/u.test(lemma)) pos = 'PROPN';
  return { pos, morph };
}
