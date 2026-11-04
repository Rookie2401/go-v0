/**
 * Latin word analysis: the English of a verb form from the analyser's features and Whitaker's citation ("love, like; fall in
 * love with"). Present "loves", imperfect "was loving", future "will love", perfect "loved", pluperfect "had loved", future
 * perfect "will have loved"; subjunctive present "may love", imperfect "might love", perfect "may have loved", pluperfect
 * "might have loved"; imperative "Love!"; infinitives and participles by tense and voice; gerund "loving", gerundive "to be
 * loved", supine "to love". A deponent's forms are already Voice=Act (the meaning); a true passive is written as one, with
 * the citation's own "(PASS)" sense where Whitaker gives one ("videtur" → "He, she, or it seems").
 */
import { candidateWordAnalysis, hasListedFeatures, type CandidateMeaningInput, type WordAnalysis } from '../../core/word-analysis';
import { realizeFromCitation, type VerbShape } from '../../core/english-verb';

export type LatinWordAnalysisInput = Omit<CandidateMeaningInput, 'language'>;

const TIME: Record<string, VerbShape['time']> = { Pres: 'present', Imp: 'progressive-past', Fut: 'future', Perf: 'past', Pqp: 'pluperfect', FutPerf: 'future-perfect' };
const MOOD: Record<string, VerbShape['mood']> = { Ind: 'indicative', Sub: 'subjunctive', Imp: 'imperative' };
const NON_FINITE: Record<string, VerbShape['nonFinite']> = { Inf: 'infinitive', Part: 'participle', Ger: 'gerund', Gdv: 'gerundive', Sup: 'supine' };
const single = (v: string | undefined): string | undefined => (v && !v.includes(',') ? v : undefined);

/** The neutral shape of a Latin verb reading, or undefined when the features do not describe one form (a list-valued feature is two readings). */
export function latinVerbShape(morph: Readonly<Record<string, string>>): VerbShape | undefined {
  if (hasListedFeatures(morph)) return undefined; // two readings in one: candidateWordAnalysis splits them first
  const passive = single(morph.Voice) === 'Pass';
  const tense = single(morph.Tense);
  const time = tense ? TIME[tense] : undefined;
  if (tense && !time) return undefined;
  const form = single(morph.VerbForm);
  const gender = single(morph.Gender) as VerbShape['gender'] | undefined;
  if (form && NON_FINITE[form]) {
    const nonFinite = NON_FINITE[form];
    // a perfect participle: the passive's state ("loved"); a deponent's own perfect ("having spoken")
    const partTime = nonFinite === 'participle' && time === 'past' ? (passive ? 'perfect' : 'past') : nonFinite === 'infinitive' && time === 'past' ? 'perfect' : time;
    return { finite: false, nonFinite, time: partTime, passive, ...(gender ? { gender } : {}) };
  }
  if (form && form !== 'Fin') return undefined;
  const mood = single(morph.Mood);
  if (!mood || !MOOD[mood]) return undefined;
  const person = single(morph.Person) as VerbShape['person'] | undefined;
  const number = single(morph.Number);
  if (!person || !['1', '2', '3'].includes(person) || (number !== 'Sing' && number !== 'Plur')) return undefined;
  // a perfect subjunctive is "may have loved": the realizer reads `perfect` for that; the indicative perfect stays a simple past
  const subjunctiveTime = MOOD[mood] === 'subjunctive' && time === 'past' ? 'perfect' : time;
  return { finite: true, mood: MOOD[mood], time: subjunctiveTime, passive, person, number, ...(gender ? { gender } : {}) };
}

/** The English of a Latin verb form, or undefined when the features or the citation do not support one. */
export function latinInflectedMeaning(morph: Readonly<Record<string, string>>, lemmaGloss?: string): string | undefined {
  const shape = latinVerbShape(morph);
  return shape ? realizeFromCitation(lemmaGloss, shape) : undefined;
}

export function latinWordAnalysis(input: LatinWordAnalysisInput): WordAnalysis {
  return candidateWordAnalysis({ ...input, language: 'la' }, { realize: (_lemma, _pos, m, gloss) => latinInflectedMeaning(m, gloss) });
}
