/**
 * Hebrew word analysis: three separate things, kept apart (the owner's audit, 2026-11-05).
 *   lexical       the lemma's meaning, as the lexicon cites it: "be high, exalted, rise".
 *   morphological the English of this form from its Open Scriptures features: "And I raised". Written here, from the grammar first: the stem chooses
 *                 the sense (below), the conjugation and agreement shape it, a conjunction or an object suffix on the word is said.
 *   contextual    the rendering a passage asks for (contextual.ts): "And I brought up" in Isaiah 1:2. Authored and sourced, never computed.
 * A conjugation is written as a reader of narrative expects, qatal "he said", yiqtol "he will say", wayyiqtol "and he said", weqatal "and he will say",
 * and that is a default and not a claim about the verse: Hebrew tense depends on syntax, so the explanation (form-analysis.ts) says so.
 *
 * The sense a stem takes. A lexicon cites a root by the sense of the stem it is mostly used in, often as a state ("be high, exalted"), so:
 *   1. A root and stem in STEM_SENSES has its own English (רום Polel "raise, exalt"; יצא Hifil "bring out").
 *   2. A stem that acts (Piel, Hifil, Polel …) takes the citation's first sense that names an action; a state's participle names one ("exalted": exalt).
 *      A citation that is only a state is made ("be heavy": "made heavy").
 *   3. A passive stem (Pual, Hofal, Polal …) takes the citation's participle where it has one ("was exalted"), else its action in the passive.
 *   4. A Nifal keeps a state or a listed verb ("was hostile", "swore"); otherwise it is a passive.
 *   5. A reflexive stem turns that sense on the subject where the root is listed or the citation is a state ("made himself clean").
 * If no sense can be written the form has no English of its own: the card shows the lemma meaning and says so. Nothing is invented.
 */
import { candidateWordAnalysis, hasListedFeatures, type CandidateMeaningInput, type CandidateWordPart, type WordAnalysis } from '../../core/word-analysis';
import { realizeEnglishVerb, verbSensesOfCitation, type VerbShape, type VerbSense } from '../../core/english-verb';
import { contextualRenderingFor } from './contextual';
import { hebrewFormAnalysis } from './form-analysis';

export type HebrewWordAnalysisInput = Omit<CandidateMeaningInput, 'language'>;

const PASSIVE = new Set(['Pual', 'Hofal', 'QalPass', 'Polal', 'Poal', 'Pulal', 'Polpal', 'Hotpaal', 'Peil', 'Ittafal']);
const ACTIVE_DERIVED = new Set(['Piel', 'Hifil', 'Polel', 'Poel', 'Pilel', 'Palel', 'Pilpel', 'Pealal', 'Tifil', 'Pael', 'Afel', 'Hafel', 'Safel', 'Shafel', 'Palpel', 'Tifel', 'Hishtafel', 'Ishtafel']);
const REFLEXIVE = new Set(['Hitpael', 'Hitpolel', 'Hitpalpel', 'Nitpael', 'Hitpoel', 'Nitpalel', 'Nitpoel', 'Hitpeel', 'Hitpaal', 'Itpaal', 'Itpeel', 'Itpoel', 'Itpolel', 'Itpalpel', 'Hitafel']);
/** Roots whose Hitpael is the sense turned on oneself: הִתְקַדֵּשׁ "consecrated himself". Written as hebrewSkeleton writes them, final letters medial. */
const REFLEXIVE_OF_QAL = new Set(['קדש', 'חזק', 'רחצ', 'טהר', 'כסה', 'לבש', 'נשא', 'גדל', 'ברכ', 'סתר', 'חבא', 'פאר', 'חטא', 'ענה', 'נקמ', 'רומ']);
/** Roots whose Nifal is the verb itself, not a passive: נִשְׁבַּע "swore", נִלְחַם "fought", נִשְׁאַר "remained". */
const NIFAL_IS_THE_VERB = new Set(['לחמ', 'שבע', 'נבא', 'מלט', 'אנח', 'חבא', 'קהל', 'אבק', 'שענ', 'שאר', 'נגש', 'נצב', 'יצב', 'נחמ', 'יעצ', 'פלא', 'סתר', 'אספ', 'כנע']);
/**
 * A root's own English in a stem, where the stem is a different verb in English from the citation. Standard lexical meanings (Brown-Driver-Briggs, HALOT);
 * the first sense is the one written. A Hofal takes its Hifil's sense in the passive, a Polal its Polel's. Keys as hebrewSkeleton writes them.
 */
const STEM_SENSES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  רומ: { Polel: 'raise, exalt', Hifil: 'raise, lift up' },
  בוא: { Hifil: 'bring' }, יצא: { Hifil: 'bring out' }, עלה: { Hifil: 'bring up' }, ירד: { Hifil: 'bring down' }, שוב: { Hifil: 'bring back', Polel: 'restore' },
  קומ: { Hifil: 'raise up', Piel: 'establish', Hafel: 'set up', Afel: 'set up' }, ראה: { Hifil: 'show' }, ידע: { Hifil: 'make known', Hafel: 'make known', Afel: 'make known' }, מות: { Hifil: 'put to death', Polel: 'kill' }, חיה: { Hifil: 'keep alive', Piel: 'keep alive' },
  אכל: { Hifil: 'feed' }, עבר: { Hifil: 'bring across' }, נוח: { Hifil: 'give rest' }, סור: { Hifil: 'remove' }, שמע: { Hifil: 'proclaim' }, זכר: { Hifil: 'mention' },
  אבד: { Hifil: 'destroy', Piel: 'destroy' }, רבה: { Hifil: 'multiply', Piel: 'multiply' }, גדל: { Hifil: 'magnify', Piel: 'bring up' }, ישב: { Hifil: 'settle' }, שכנ: { Hifil: 'settle', Piel: 'settle' },
  חזק: { Hifil: 'take hold of', Piel: 'strengthen' }, קרב: { Hifil: 'bring near', Piel: 'bring near' }, נגש: { Hifil: 'bring near' }, שכב: { Hifil: 'lay down' }, עמד: { Hifil: 'station' },
  ילד: { Hifil: 'father', Piel: 'help give birth', Nifal: 'be born', Pual: 'be born', Hofal: 'be born' }, נחל: { Hifil: 'give as an inheritance', Piel: 'give as an inheritance' }, ירש: { Hifil: 'dispossess' }, שבת: { Hifil: 'put an end to' }, נוס: { Hifil: 'put to flight' },
  פוצ: { Hifil: 'scatter' }, סבב: { Hifil: 'turn around' }, אור: { Hifil: 'give light' }, לבש: { Hifil: 'clothe' }, אמנ: { Hifil: 'believe' }, כונ: { Hifil: 'establish', Polel: 'establish' },
  רעע: { Hifil: 'do evil' }, יטב: { Hifil: 'do good' }, רגל: { Piel: 'spy out' }, גלה: { Hifil: 'exile', Piel: 'uncover' }, שבע: { Hifil: 'make swear' }, נכה: { Hifil: 'strike' },
  כול: { Pilpel: 'sustain' }, עור: { Polel: 'rouse', Hifil: 'rouse' },
  // the Aramaic causatives
  נפק: { Hafel: 'bring out', Afel: 'bring out' }, נחת: { Hafel: 'deposit', Afel: 'deposit' },
};
/** The passive stem of these roots says the verb itself: אֻמְלְלָה "she languished". */
const PASSIVE_FORM_ONLY = new Set(['אמל']);
/** Aramaic Hitpeel and Hitpaal: the passive of their active stems, "was found", "was cast". */
const ARAMAIC_PASSIVE = new Set(['Hitpeel', 'Itpeel', 'Hitpaal', 'Itpaal', 'Hotpaal', 'Ittafal', 'Peil']);
const participialTail = (s: VerbSense): boolean => /^\S*(?:ed|en|ken|wn)\b/.test(s.tail) || /^(?:born|borne|stricken|set|made|built|cast|put|cut|sworn|torn|worn)\b/.test(s.tail);
const single = (v: string | undefined): string | undefined => (v && !v.includes(',') ? v : undefined);
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
/** The root's consonants: the pointed headword without its points, final letters made medial. */
export const hebrewSkeleton = (lemma: string | undefined): string => (lemma ?? '').normalize('NFD').replace(/[^א-ת]/g, '').replace(/[ךםןףץ]/g, (c) => FINALS[c]);
const stative = (s: VerbSense | undefined): boolean => !!s && (s.head === 'be' || s.head === 'become');
/** The verb a sense acts with: its own, or the verb of a state's participle ("exalted": exalt). */
const actionOf = (s: VerbSense): VerbSense | undefined => (!stative(s) ? s : s.base ? { head: s.base, tail: s.baseTail ?? '' } : undefined);

/** Which sense of the citation a form takes, and how its stem turns it. */
interface StemReading { sense: VerbSense; passive: boolean; nuance?: VerbShape['nuance'] }

function readStem(root: string, binyan: string, lemmaGloss: string | undefined): StemReading | undefined {
  // a Hofal is its Hifil in the passive, a Polal its Polel
  const own = STEM_SENSES[root]?.[binyan] ?? (binyan === 'Hofal' ? STEM_SENSES[root]?.Hifil : binyan === 'Polal' ? STEM_SENSES[root]?.Polel : undefined);
  if (own) {
    const sense = verbSensesOfCitation(own)[0];
    if (sense) return { sense, passive: PASSIVE.has(binyan) };
  }
  const passiveStem = PASSIVE.has(binyan) || ARAMAIC_PASSIVE.has(binyan);
  const senses = verbSensesOfCitation(lemmaGloss);
  if (!senses.length) return undefined;
  const first = senses[0];
  const reflexiveCitation = senses.some((s) => /\b(?:oneself|himself|itself)\b/.test(s.tail));
  const action = senses.map(actionOf).find((s): s is VerbSense => !!s);
  const state = first.tail && stative(first) ? first : senses.find((s) => stative(s) && s.tail);
  const madeState: VerbSense | undefined = state ? { head: 'make', tail: state.tail } : undefined;
  if (PASSIVE_FORM_ONLY.has(root)) return { sense: action ?? first, passive: false };
  // the active stem of a citation that names the reflexive ("rouse oneself") is the plain verb
  if (ACTIVE_DERIVED.has(binyan)) {
    const sense = action ?? madeState ?? first;
    return { sense: /\boneself\b/.test(sense.tail) ? { ...sense, tail: sense.tail.replace(/\s*\boneself\b/, '').trim() } : sense, passive: false };
  }
  if (REFLEXIVE.has(binyan) && !passiveStem) {
    if (reflexiveCitation) return { sense: first, passive: false };
    const listed = REFLEXIVE_OF_QAL.has(root) ? { nuance: 'reflexive' as const } : {};
    if (action) return { sense: action, passive: false, ...listed };
    return madeState ? { sense: madeState, passive: false, nuance: 'reflexive' } : { sense: first, passive: false };
  }
  if (passiveStem) {
    // the citation's own passive where it has one: "exalted", "be twisted", "be found"
    const participle = senses.find((s) => stative(s) && (s.base || participialTail(s)));
    if (participle) return { sense: participle, passive: false };
    if (action) return { sense: action, passive: true };
    return madeState ? { sense: madeState, passive: true } : { sense: first, passive: false };
  }
  if (binyan === 'Nifal') {
    if (NIFAL_IS_THE_VERB.has(root) || reflexiveCitation) return { sense: first, passive: false };
    if (stative(first)) return { sense: senses.find((s) => stative(s) && s.base) ?? first, passive: false };
    return { sense: first, passive: true };
  }
  return { sense: first, passive: false }; // the Qal and anything unnamed: the citation as it stands
}

/** What the word carries beside its stem, from the source's morpheme parts. */
export interface HebrewAttachments { conjunction?: boolean; object?: { person?: string; gender?: string; number?: string } }
export function attachmentsOf(parts: readonly CandidateWordPart[] | undefined): HebrewAttachments {
  const out: HebrewAttachments = {};
  for (const p of parts ?? []) {
    if (p.pos === 'CONJ' && /^ו/u.test(p.text.normalize('NFC'))) out.conjunction = true;
    if (p.role === 'object suffix') out.object = { person: p.morph?.Person, gender: p.morph?.Gender, number: p.morph?.Number };
  }
  return out;
}
function objectPronoun(o: HebrewAttachments['object']): string | undefined {
  if (!o) return undefined;
  const plural = o.number === 'Plur' || o.number === 'Dual';
  if (o.person === '1') return plural ? 'us' : 'me';
  if (o.person === '2') return 'you';
  if (o.person === '3') return plural ? 'them' : o.gender === 'Fem' ? 'her' : 'him';
  return undefined;
}

/** The neutral shape of an OSHB verb reading, or undefined when the features do not describe one form. */
export function hebrewVerbShape(lemma: string | undefined, morph: Readonly<Record<string, string>>, lemmaGloss?: string, attachments: HebrewAttachments = {}): VerbShape | undefined {
  if (hasListedFeatures(morph)) return undefined; // two readings in one: candidateWordAnalysis splits them first
  const binyan = single(morph.Binyan) ?? '';
  const stem = readStem(hebrewSkeleton(lemma), binyan, lemmaGloss);
  const conj = single(morph.Conj);
  const form = single(morph.VerbForm);
  const gender = single(morph.Gender);
  const object = objectPronoun(attachments.object);
  // the conjugation's own "and" (wayyiqtol, weqatal) is not said twice
  const and = attachments.conjunction && conj !== 'Wayyiqtol' && conj !== 'WeQatal' ? { prefix: 'and ' } : {};
  const common = { passive: stem?.passive ?? false, ...(stem?.nuance ? { nuance: stem.nuance } : {}), ...(gender === 'Masc' || gender === 'Fem' ? { gender: gender as VerbShape['gender'] } : {}), ...and };
  if (form === 'Inf' || conj === 'InfCons' || conj === 'InfAbs') return { finite: false, nonFinite: 'infinitive', ...common };
  if (conj === 'PassPart') return { finite: false, nonFinite: 'participle', time: 'perfect', ...common, passive: true };
  if (form === 'Part' || conj === 'Part') return { finite: false, nonFinite: 'participle', time: 'present', ...common };
  if (form && form !== 'Fin') return undefined;
  const person = single(morph.Person) as VerbShape['person'] | undefined;
  const numberValue = single(morph.Number);
  const number: VerbShape['number'] | undefined = numberValue === 'Sing' ? 'Sing' : numberValue === 'Plur' || numberValue === 'Dual' ? 'Plur' : undefined;
  if (!person || !['1', '2', '3'].includes(person) || !number) return undefined;
  const who = { person, number, ...(object ? { object } : {}) };
  switch (conj) {
    case 'Perf': return { finite: true, time: 'past', ...common, ...who };
    case 'Impf': return { finite: true, time: 'future', ...common, ...who };
    case 'Wayyiqtol': return { finite: true, time: 'past', ...common, prefix: 'and ', ...who };
    case 'WeQatal': return { finite: true, time: 'future', ...common, prefix: 'and ', ...who };
    case 'Imp': return { finite: true, mood: 'imperative', ...common, ...who };
    case 'Coh': return { finite: true, mood: 'cohortative', ...common, ...who };
    case 'Juss': return { finite: true, mood: 'jussive', ...common, ...who };
    default: return undefined;
  }
}

/** The sense the form takes (see the header), or undefined when the citation names no verb and no state. */
export function hebrewSenseFor(binyan: string | undefined, lemmaGloss: string | undefined, lemma?: string): VerbSense | undefined {
  return readStem(hebrewSkeleton(lemma), binyan ?? '', lemmaGloss)?.sense;
}

/** The English of a Hebrew verb form, or undefined when the features or the citation do not support one. */
export function hebrewInflectedMeaning(lemma: string | undefined, morph: Readonly<Record<string, string>>, lemmaGloss?: string, attachments: HebrewAttachments = {}): string | undefined {
  const shape = hebrewVerbShape(lemma, morph, lemmaGloss, attachments);
  const sense = hebrewSenseFor(single(morph.Binyan), lemmaGloss, lemma);
  return shape && sense ? realizeEnglishVerb(sense, shape) : undefined;
}

export function hebrewWordAnalysis(input: HebrewWordAnalysisInput): WordAnalysis {
  const attachments = attachmentsOf(input.parts);
  const context = input.contextualMeaning ? undefined : contextualRenderingFor(input.surface, input.references, input.sentence);
  const verbal = !input.pos || input.pos === 'VERB' || input.pos === 'AUX';
  const inflected = verbal ? hebrewInflectedMeaning(input.lemma, input.morph ?? {}, input.lemmaGloss, attachments) : undefined;
  const analysis = candidateWordAnalysis({
    ...input, language: 'he',
    ...(context ? { contextualMeaning: { text: context.text, source: context.source, confidence: input.confidence } } : {}),
  }, { realize: (lemma, _pos, m, gloss) => hebrewInflectedMeaning(lemma, m, gloss, attachments) });
  const form = hebrewFormAnalysis({ surface: input.surface, lemma: input.lemma, pos: input.pos, lemmaGloss: input.lemmaGloss, morph: input.morph ?? {}, parts: input.parts, inflected, why: context?.why });
  return form ? { ...analysis, formAnalysis: form } : analysis;
}
