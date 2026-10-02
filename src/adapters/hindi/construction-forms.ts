/**
 * The few regular forms the writing checks need to offer a correction: the participles of a verb, an adjective in -ा, the
 * present and past of होना, and the fused forms of the personal pronouns. There is no generator behind this (the morphology
 * engine is a separate package); every form is built by rule and the caller checks the rule against the form the learner
 * actually wrote (`participleForm(...) === surface`) before trusting it, so an irregular verb gives no suggestion rather
 * than a wrong one. Machine-drafted from general knowledge of Hindi, not checked by a native speaker.
 */

export type Gender = 'Masc' | 'Fem';
export type Num = 'Sing' | 'Plur';

const slot = (g: Gender, n: Num): 0 | 1 | 2 | 3 => (g === 'Masc' ? (n === 'Sing' ? 0 : 1) : n === 'Sing' ? 2 : 3);

const IRREGULAR_PERFECTIVE: Readonly<Record<string, readonly [string, string, string, string]>> = {
  'जाना': ['गया', 'गए', 'गई', 'गईं'],
  'करना': ['किया', 'किए', 'की', 'कीं'],
  'लेना': ['लिया', 'लिए', 'ली', 'लीं'],
  'देना': ['दिया', 'दिए', 'दी', 'दीं'],
  'होना': ['हुआ', 'हुए', 'हुई', 'हुईं'],
  'पीना': ['पिया', 'पिए', 'पी', 'पीं'],
};

/** The stem of an infinitive in -ना; undefined for anything else. */
export const stemOfInfinitive = (lemma: string): string | undefined => (lemma.endsWith('ना') && lemma.length > 2 ? lemma.slice(0, -2) : undefined);

/** The imperfective, perfective or progressive participle of a regular verb, agreeing with gender and number. */
export function participleForm(lemma: string, kind: 'ipf' | 'pf' | 'prog', g: Gender, n: Num): string | undefined {
  const i = slot(g, n);
  if (kind === 'prog') return ['रहा', 'रहे', 'रही', 'रहीं'][i];
  const stem = stemOfInfinitive(lemma);
  if (!stem) return undefined;
  if (kind === 'ipf') return stem + ['ता', 'ते', 'ती', 'तीं'][i];
  const irregular = IRREGULAR_PERFECTIVE[lemma];
  if (irregular) return irregular[i];
  const last = stem[stem.length - 1];
  if (last === 'ा' || last === 'ो' || last === 'आ') return stem + ['या', 'ए', 'ई', 'ईं'][i];
  if (/[ऄ-औा-ौॢॣ]/u.test(last)) return undefined; // a stem ending in another vowel sign: irregular more often than not
  return stem + ['ा', 'े', 'ी', 'ीं'][i];
}

/** An adjective in -ा, in the form for this gender, number and case. Undefined for an adjective that does not end in -ा. */
export function adjectiveForm(lemma: string, g: Gender, n: Num, oblique: boolean): string | undefined {
  if (!lemma.endsWith('ा') || lemma.length < 2) return undefined;
  const stem = lemma.slice(0, -1);
  if (g === 'Fem') return stem + 'ी';
  return n === 'Sing' && !oblique ? lemma : stem + 'े';
}

/** The ending a genitive takes before a noun: की before a feminine, का before a direct masculine singular, के otherwise. */
export function genitiveEnding(g: Gender, n: Num, cases: readonly string[]): string[] {
  if (g === 'Fem') return ['ी'];
  if (n === 'Plur') return ['े'];
  const dir = cases.includes('Dir');
  const obl = cases.includes('Obl');
  return dir && !obl ? ['ा'] : obl && !dir ? ['े'] : ['ा', 'े'];
}

/** The present of होना for a person, number and politeness: the forms that are right, the first being the one to offer. */
export function presentOfBe(person: string, n: string, polite?: string): string[] {
  if (person === '1') return n === 'Plur' ? ['हैं'] : ['हूँ'];
  if (person === '2') {
    if (polite === 'Form') return ['हैं', 'हो'];
    if (polite === 'Infm' || n === 'Sing') return ['है'];
    return ['हो'];
  }
  return n === 'Plur' ? ['हैं'] : ['है', 'हैं']; // a singular third person may take the plural of respect
}

export const PAST_OF_BE: Readonly<Record<string, string>> = { MascSing: 'था', MascPlur: 'थे', FemSing: 'थी', FemPlur: 'थीं' };

/** The person who must or feels, in the direct case → with को. */
export const DATIVE_OF: Readonly<Record<string, string>> = {
  'मैं': 'मुझे', 'हम': 'हमें', 'तू': 'तुझे', 'तुम': 'तुम्हें', 'आप': 'आपको', 'वह': 'उसे', 'वो': 'उसे', 'यह': 'इसे', 'ये': 'इन्हें', 'वे': 'उन्हें', 'कौन': 'किसे',
};
/** …and the ergative of the same person → the dative (उसने जाना है → उसे जाना है). */
export const DATIVE_OF_ERGATIVE: Readonly<Record<string, string>> = {
  'मैंने': 'मुझे', 'हमने': 'हमें', 'तूने': 'तुझे', 'तुमने': 'तुम्हें', 'आपने': 'आपको', 'उसने': 'उसे', 'इसने': 'इसे', 'उन्होंने': 'उन्हें', 'इन्होंने': 'इन्हें',
};
/** A personal pronoun in the direct case followed by a postposition, written as the one fused word Hindi uses. */
export const FUSED: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'मैं': { 'को': 'मुझे', 'से': 'मुझसे', 'में': 'मुझमें', 'पर': 'मुझपर', 'ने': 'मैंने' },
  'हम': { 'को': 'हमें', 'से': 'हमसे', 'में': 'हममें', 'पर': 'हमपर', 'ने': 'हमने' },
  'तू': { 'को': 'तुझे', 'से': 'तुझसे', 'में': 'तुझमें', 'पर': 'तुझपर', 'ने': 'तूने' },
  'वह': { 'को': 'उसे', 'से': 'उससे', 'में': 'उसमें', 'पर': 'उसपर', 'ने': 'उसने' },
  'यह': { 'को': 'इसे', 'से': 'इससे', 'में': 'इसमें', 'पर': 'इसपर', 'ने': 'इसने' },
  'वे': { 'को': 'उन्हें', 'से': 'उनसे', 'में': 'उनमें', 'पर': 'उनपर', 'ने': 'उन्होंने' },
  'ये': { 'को': 'इन्हें', 'से': 'इनसे', 'में': 'इनमें', 'पर': 'इनपर', 'ने': 'इन्होंने' },
  'कौन': { 'को': 'किसे', 'से': 'किससे', 'में': 'किसमें', 'पर': 'किसपर', 'ने': 'किसने' },
};

/** Masculine nouns in -ा that do not change (पिता, राजा …): they take no oblique -े. */
export const INVARIANT_IN_AA: ReadonlySet<string> = new Set(['पिता', 'राजा', 'नेता', 'देवता', 'दाता', 'कर्ता', 'विधाता', 'योद्धा', 'दादा', 'नाना', 'चाचा', 'मामा', 'फूफा', 'काका', 'ताया', 'बाबा', 'पिताजा', 'रचयिता']);

/** The oblique plural of a feminine plural noun, built from the direct plural the learner wrote; undefined when the shape is not one of the regular three. */
export function obliquePluralOfFeminine(surface: string): string | undefined {
  if (/ियाँ$|ियां$/u.test(surface)) return surface.replace(/ियाँ$|ियां$/u, 'ियों');
  if (/ाएँ$|ाएं$/u.test(surface)) return surface.replace(/ाएँ$|ाएं$/u, 'ाओं');
  if (/ें$/u.test(surface)) return surface.replace(/ें$/u, 'ों');
  return undefined;
}
