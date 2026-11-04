/**
 * The word analysis of an analyzer's reading, for every language: Greek, Hebrew and Latin have their own feature maps
 * (their lexica cite verbs in a fixed person or tense, and their conjugations need naming); any other language realizes
 * a verb from Universal-Dependencies features where they are plain (one person, one number, an indicative tense or an
 * imperative) and a citation that names the verb ("to speak"), and otherwise shows the lemma meaning as before.
 */
import { candidateWordAnalysis, hasListedFeatures, type CandidateMeaningInput, type WordAnalysis } from '../core/word-analysis';
import { realizeFromCitation, type VerbShape } from '../core/english-verb';
import { greekWordAnalysis } from './greek/word-analysis';
import { hebrewWordAnalysis } from './hebrew/word-analysis';
import { latinWordAnalysis } from './latin/word-analysis';

const TIME: Record<string, VerbShape['time']> = { Pres: 'present', Past: 'past', Imp: 'progressive-past', Fut: 'future', Pqp: 'pluperfect' };
const single = (v: string | undefined): string | undefined => (v && !v.includes(',') ? v : undefined);

/** A plain UD reading as a shape: indicative or imperative finite forms, infinitives and participles; anything else is left to the lemma meaning. */
export function genericVerbShape(morph: Readonly<Record<string, string>>): VerbShape | undefined {
  if (hasListedFeatures(morph)) return undefined; // two readings in one: candidateWordAnalysis splits them first
  const tense = single(morph.Tense);
  const time = tense ? TIME[tense] : undefined;
  if (tense && !time) return undefined;
  const voice = single(morph.Voice);
  if (voice && voice !== 'Act' && voice !== 'Pass') return undefined;
  const passive = voice === 'Pass';
  const form = single(morph.VerbForm);
  const gender = single(morph.Gender) as VerbShape['gender'] | undefined;
  if (form === 'Inf') return { finite: false, nonFinite: 'infinitive', time: time === 'past' ? 'present' : time, passive };
  if (form === 'Part') return { finite: false, nonFinite: 'participle', time, passive, ...(gender ? { gender } : {}) };
  if (form && form !== 'Fin') return undefined;
  const mood = single(morph.Mood) ?? 'Ind';
  if (mood !== 'Ind' && mood !== 'Imp') return undefined;
  const person = single(morph.Person) as VerbShape['person'] | undefined;
  const number = single(morph.Number);
  if (!person || !['1', '2', '3'].includes(person) || (number !== 'Sing' && number !== 'Plur')) return undefined;
  return { finite: true, mood: mood === 'Imp' ? 'imperative' : 'indicative', time, passive, person, number, ...(gender ? { gender } : {}) };
}

export function genericInflectedMeaning(morph: Readonly<Record<string, string>>, lemmaGloss?: string): string | undefined {
  const shape = genericVerbShape(morph);
  return shape ? realizeFromCitation(lemmaGloss, shape) : undefined;
}

/** The word analysis for a reading in `input.language`. */
export function wordAnalysisFor(input: CandidateMeaningInput): WordAnalysis {
  switch (input.language) {
    case 'el': return greekWordAnalysis(input);
    case 'he': return hebrewWordAnalysis(input);
    case 'la': return latinWordAnalysis(input);
    default: return candidateWordAnalysis(input, { realize: (_lemma, _pos, m, gloss) => genericInflectedMeaning(m, gloss) });
  }
}
