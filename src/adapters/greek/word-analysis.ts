/**
 * Greek word analysis: the English of a finite, infinitive or participial verb form from its MorphGNT features and the
 * lexicon's first-person citation ("I say, speak" → "He, she, or it said" for εἶπεν). The tense map is the usual classroom
 * one: present "loves", imperfect "was loving", future "will love", aorist "loved", perfect "has loved", pluperfect "had
 * loved"; subjunctive "may", optative "might"; imperative "Love!". A deponent (lemma in -μαι) keeps its active meaning in the
 * middle and passive; another verb's middle is written as the active (the lexicon's sense), its passive as a passive.
 */
import { candidateWordAnalysis, hasListedFeatures, type CandidateMeaningInput, type WordAnalysis } from '../../core/word-analysis';
import type { VerbShape } from '../../core/english-verb';
import { citationAsInfinitive, realizeFromCitation } from '../../core/english-verb';

export type GreekWordAnalysisInput = Omit<CandidateMeaningInput, 'language'>;

const clean = (s: string): string => s.normalize('NFC').toLocaleLowerCase('el-GR').replace(/̀/g, '́');
const TIME: Record<string, VerbShape['time']> = { Pres: 'present', Impf: 'progressive-past', Fut: 'future', Aor: 'past', Perf: 'perfect', Plup: 'pluperfect' };
const MOOD: Record<string, VerbShape['mood']> = { Ind: 'indicative', Sub: 'subjunctive', Opt: 'optative', Imp: 'imperative' };
const single = (v: string | undefined): string | undefined => (v && !v.includes(',') ? v : undefined);

/** The neutral shape of a MorphGNT verb reading, or undefined when the features do not describe one form. */
export function greekVerbShape(lemma: string | undefined, morph: Readonly<Record<string, string>>): VerbShape | undefined {
  if (hasListedFeatures(morph)) return undefined; // two readings in one: candidateWordAnalysis splits them first
  const deponent = !!lemma && (/μαι$/.test(clean(lemma)) || clean(lemma) === clean('εἰμί'));
  const voice = single(morph.Voice);
  const passive = voice === 'Pass' && !deponent;
  const tense = single(morph.Tense);
  const form = single(morph.VerbForm);
  let time = tense ? TIME[tense] : undefined;
  if (tense && !time) return undefined;
  // οἶδα is a perfect in form and a present in meaning ("we know"); its pluperfect is a past
  if (lemma && clean(lemma) === clean('οἶδα')) time = time === 'perfect' ? 'present' : time === 'pluperfect' ? 'past' : time;
  const gender = single(morph.Gender) as VerbShape['gender'] | undefined;
  if (form === 'Inf') return { finite: false, nonFinite: 'infinitive', time: time === 'past' ? 'present' : time, passive };
  if (form === 'Part') return { finite: false, nonFinite: 'participle', time, passive, ...(gender ? { gender } : {}) };
  if (form && form !== 'Fin') return undefined;
  const mood = single(morph.Mood);
  if (!mood || !MOOD[mood]) return undefined;
  const person = single(morph.Person) as VerbShape['person'] | undefined;
  const number = single(morph.Number);
  if (!person || !['1', '2', '3'].includes(person) || (number !== 'Sing' && number !== 'Plur')) return undefined;
  // a subjunctive, optative or imperative aorist is aspect, not time: it is written like the present ("may love", "Love!")
  const aspectual = MOOD[mood] !== 'indicative' && (time === 'past' || time === 'perfect');
  return { finite: true, mood: MOOD[mood], time: aspectual ? 'present' : time, passive, person, number, ...(gender ? { gender } : {}) };
}

/** The English of a Greek verb form, or undefined when the features or the citation do not support one. */
export function greekInflectedMeaning(surface: string, lemma: string | undefined, morph: Readonly<Record<string, string>>, lemmaGloss?: string): string | undefined {
  if (!surface.trim() || !lemma) return undefined;
  const shape = greekVerbShape(lemma, morph);
  return shape ? realizeFromCitation(lemmaGloss, shape) : undefined;
}

export function greekWordAnalysis(input: GreekWordAnalysisInput): WordAnalysis {
  const morph = input.morph ?? {};
  const inflectedText = (!input.pos || input.pos === 'VERB' || input.pos === 'AUX') ? greekInflectedMeaning(input.surface, input.lemma, morph, input.lemmaGloss) : undefined;
  // the one authored contextual rendering: the command of Galatians 5:14, and only with that reference and that form
  const gal514 = (input.references ?? []).some((r) => r.toUpperCase() === 'GAL.5.14')
    && !!inflectedText && clean(input.surface) === clean('ἀγαπήσεις') && morph.Tense === 'Fut' && morph.Person === '2' && morph.Number === 'Sing';
  return candidateWordAnalysis({
    ...input, language: 'el',
    ...(gal514 ? { contextualMeaning: { text: 'You shall love', source: 'Galatians 5:14', confidence: input.confidence }, sentenceSource: 'Galatians 5:14' } : {}),
  }, {
    realize: (lemma, _pos, m, gloss) => greekInflectedMeaning(input.surface, lemma, m, gloss),
    lexicalText: (gloss) => citationAsInfinitive(gloss) ?? gloss,
    labelReference: (r) => (r.toUpperCase() === 'GAL.5.14' ? { label: 'Galatians 5:14', source: 'SBL Greek New Testament', uri: r } : { label: r, uri: r }),
  });
}
