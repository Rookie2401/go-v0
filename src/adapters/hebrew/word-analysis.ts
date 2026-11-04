/**
 * Hebrew word analysis: the English of a verb form from its Open Scriptures features and the lexicon's citation ("to say";
 * "love, lovely, loveable"). The conjugations are written as a reader of narrative expects: qatal "he said", yiqtol "he
 * will say", wayyiqtol "and he said", weqatal "and he will say", imperative "Hear!", cohortative "let me …", jussive "may
 * he …", participle "going", passive participle "written", infinitive "to say".
 *
 * The binyan: Strong's cites a root by the sense of the stem it is mostly used in (נגד "be conspicuous, declare, tell" is the
 * Hifil's "tell"; שבע "swear" is the Nifal's), so the citation is taken as the form's own sense, and a stem's grammatical
 * nuance is written only where the citation is the Qal sense and the stem turns it: Hifil "caused to come" (הֵבִיא of בוא),
 * Hofal "was caused to …", Hitpael "sanctified himself" (קדש), the passive stems (Pual, Hofal, the passive Qal) and the Nifal
 * of a transitive root "was found" (נִמְצָא). A citation that opens with a state ("be conspicuous") yields to its next sense
 * where the form is not stative.
 */
import { candidateWordAnalysis, hasListedFeatures, type CandidateMeaningInput, type WordAnalysis } from '../../core/word-analysis';
import { realizeEnglishVerb, verbSensesOfCitation, type VerbShape, type VerbSense } from '../../core/english-verb';

export type HebrewWordAnalysisInput = Omit<CandidateMeaningInput, 'language'>;

const PASSIVE = new Set(['Pual', 'Hofal', 'QalPass', 'Polal', 'Poal', 'Pulal', 'Polpal', 'Hotpaal', 'Peil', 'Ittafal']);
const CAUSATIVE = new Set(['Hifil', 'Afel', 'Hafel', 'Safel', 'Shafel', 'Tifil']);
const REFLEXIVE = new Set(['Hitpael', 'Hitpolel', 'Hitpalpel', 'Nitpael', 'Hitpoel', 'Nitpalel', 'Nitpoel', 'Hitpeel', 'Hitpaal', 'Itpaal', 'Itpeel', 'Itpoel', 'Itpolel', 'Itpalpel', 'Hitafel']);
/** Roots whose citation is the Qal sense and whose Hifil (Hofal) is its causative: בוא "come", הֵבִיא "brought" (caused to come). */
const CAUSATIVE_OF_QAL = new Set(['בוא', 'ראה', 'ידע', 'יצא', 'שוב', 'עלה', 'ירד', 'מות', 'חיה', 'קום', 'אכל', 'שתה', 'עבר', 'נוח', 'סור', 'שמע', 'זכר', 'אבד', 'רבה', 'גדל',
  'ישב', 'שכן', 'חזק', 'רום', 'קרב', 'נגש', 'שכב', 'עמד', 'ילד', 'נחל', 'ירש', 'שבת', 'נוס', 'פוץ', 'סבב', 'אור', 'אתה', 'לבש', 'אמן']);
/** Roots whose Hitpael is the Qal sense turned on oneself: הִתְקַדֵּשׁ "sanctified himself". */
const REFLEXIVE_OF_QAL = new Set(['קדש', 'חזק', 'רחץ', 'טהר', 'כסה', 'לבש', 'נשא', 'גדל', 'ברך', 'סתר', 'חבא', 'פאר', 'חטא', 'ענה', 'נקם']);
/** Roots whose Nifal is the verb itself, not a passive: נִשְׁבַּע "swore", נִלְחַם "fought", נִשְׁאַר "remained". */
const NIFAL_IS_THE_VERB = new Set(['לחם', 'שבע', 'נבא', 'מלט', 'אנח', 'חבא', 'קהל', 'אבק', 'שען', 'שאר', 'נגש', 'נצב', 'יצב', 'נחם', 'יעץ', 'פלא', 'סתר', 'אסף', 'כנע']);
const single = (v: string | undefined): string | undefined => (v && !v.includes(',') ? v : undefined);
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
/** The root's consonants: the pointed headword without its points, final letters made medial. */
export const hebrewSkeleton = (lemma: string | undefined): string => (lemma ?? '').normalize('NFD').replace(/[^א-ת]/g, '').replace(/[ךםןףץ]/g, (c) => FINALS[c]);
const stative = (s: VerbSense | undefined): boolean => !!s && (s.head === 'be' || s.head === 'become');

/** The neutral shape of an OSHB verb reading, or undefined when the features do not describe one form. */
export function hebrewVerbShape(lemma: string | undefined, morph: Readonly<Record<string, string>>, lemmaGloss?: string): VerbShape | undefined {
  if (hasListedFeatures(morph)) return undefined; // two readings in one: candidateWordAnalysis splits them first
  const root = hebrewSkeleton(lemma);
  const binyan = single(morph.Binyan) ?? '';
  const senses = verbSensesOfCitation(lemmaGloss);
  const first = senses[0];
  const reflexiveCitation = senses.some((s) => /\b(?:oneself|himself|itself)\b/.test(s.tail));
  const causative = (CAUSATIVE.has(binyan) || binyan === 'Hofal') && CAUSATIVE_OF_QAL.has(root) && !stative(first); // Hofal: the Hifil's passive, "was caused to come"
  const reflexive = REFLEXIVE.has(binyan) && REFLEXIVE_OF_QAL.has(root) && !reflexiveCitation;
  const passive = PASSIVE.has(binyan) || (binyan === 'Nifal' && !NIFAL_IS_THE_VERB.has(root) && !stative(first) && !reflexiveCitation);
  const nuance: VerbShape['nuance'] | undefined = causative ? 'causative' : reflexive ? 'reflexive' : undefined;
  const conj = single(morph.Conj);
  const form = single(morph.VerbForm);
  const gender = single(morph.Gender);
  const common = { passive, ...(nuance ? { nuance } : {}), ...(gender === 'Masc' || gender === 'Fem' ? { gender: gender as VerbShape['gender'] } : {}) };
  if (form === 'Inf' || conj === 'InfCons' || conj === 'InfAbs') return { finite: false, nonFinite: 'infinitive', ...common };
  if (conj === 'PassPart') return { finite: false, nonFinite: 'participle', time: 'perfect', ...common, passive: true };
  if (form === 'Part' || conj === 'Part') return { finite: false, nonFinite: 'participle', time: 'present', ...common };
  if (form && form !== 'Fin') return undefined;
  const person = single(morph.Person) as VerbShape['person'] | undefined;
  const numberValue = single(morph.Number);
  const number: VerbShape['number'] | undefined = numberValue === 'Sing' ? 'Sing' : numberValue === 'Plur' || numberValue === 'Dual' ? 'Plur' : undefined;
  if (!person || !['1', '2', '3'].includes(person) || !number) return undefined;
  const who = { person, number };
  switch (conj) {
    case 'Perf': return { finite: true, time: 'past', ...common, ...who };
    case 'Impf': return { finite: true, time: 'future', ...common, ...who };
    case 'Wayyiqtol': return { finite: true, time: 'past', prefix: 'and ', ...common, ...who };
    case 'WeQatal': return { finite: true, time: 'future', prefix: 'and ', ...common, ...who };
    case 'Imp': return { finite: true, mood: 'imperative', ...common, ...who };
    case 'Coh': return { finite: true, mood: 'cohortative', ...common, ...who };
    case 'Juss': return { finite: true, mood: 'jussive', ...common, ...who };
    default: return undefined;
  }
}

/**
 * The sense the form takes: the citation's first sense; its next non-stative sense when the first is a state and the stem
 * is a derived one ("be conspicuous, declare, tell" for the Hifil הִגִּיד: "declared").
 */
export function hebrewSenseFor(binyan: string | undefined, lemmaGloss: string | undefined): VerbSense | undefined {
  const senses = verbSensesOfCitation(lemmaGloss);
  if (!senses.length) return undefined;
  // a Nifal keeps the state ("was hostile"); the active derived stems take the next sense (the Piel of "be set apart, consecrate" consecrates)
  const derived = !!binyan && !['Qal', 'Peal', 'Nifal', 'QalPass', 'Peil'].includes(binyan);
  return (derived && stative(senses[0]) ? senses.find((s) => !stative(s)) : undefined) ?? senses[0];
}

/** The English of a Hebrew verb form, or undefined when the features or the citation do not support one. */
export function hebrewInflectedMeaning(lemma: string | undefined, morph: Readonly<Record<string, string>>, lemmaGloss?: string): string | undefined {
  const shape = hebrewVerbShape(lemma, morph, lemmaGloss);
  const sense = hebrewSenseFor(single(morph.Binyan), lemmaGloss);
  return shape && sense ? realizeEnglishVerb(sense, shape) : undefined;
}

export function hebrewWordAnalysis(input: HebrewWordAnalysisInput): WordAnalysis {
  return candidateWordAnalysis({ ...input, language: 'he' }, { realize: (lemma, _pos, m, gloss) => hebrewInflectedMeaning(lemma, m, gloss) });
}
