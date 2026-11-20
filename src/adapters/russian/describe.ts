/**
 * Plain words for a Russian feature bundle: the one line of morphology on the word card. Unknown values pass through as they are.
 *
 *   noun        "accusative singular, feminine, inanimate"
 *   adjective   "nominative or accusative plural"
 *   verb        "past, feminine singular, perfective" / "1st person singular, present, imperfective" / "imperative, 2nd person plural"
 *   participle  "present active participle, genitive singular masculine"
 *   adverbial   "past adverbial participle (having …), perfective"
 *   short form  "short form, masculine singular"
 */
import type { PartOfSpeech } from '../../core';

const CASE: Record<string, string> = { Nom: 'nominative', Gen: 'genitive', Dat: 'dative', Acc: 'accusative', Ins: 'instrumental', Prep: 'prepositional', Loc: 'locative', Par: 'partitive', Voc: 'vocative' };
const CASE_ORDER = Object.keys(CASE);
const NUMBER: Record<string, string> = { Sing: 'singular', Plur: 'plural' };
const GENDER: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' };
const GENDER_ORDER = ['Masc', 'Fem', 'Neut'];
const ANIMACY: Record<string, string> = { Anim: 'animate', Inan: 'inanimate' };
const PERSON: Record<string, string> = { 1: '1st person', 2: '2nd person', 3: '3rd person' };
const TENSE: Record<string, string> = { Pres: 'present', Past: 'past', Fut: 'future' };
const TENSE_ORDER = ['Pres', 'Past', 'Fut'];
const VOICE: Record<string, string> = { Act: 'active', Pass: 'passive' };
const ASPECT: Record<string, string> = { Imp: 'imperfective', Perf: 'perfective' };
const DEGREE: Record<string, string> = { Cmp: 'comparative', Sup: 'superlative' };

/** "a", "a or b", "a, b or c": the values of a union in a natural order. */
function words(map: Record<string, string>, v: string | undefined, order?: readonly string[]): string {
  if (!v) return '';
  let list = v.split(',');
  if (order) list = [...list].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const w = list.map((x) => map[x] ?? x);
  return w.length === 1 ? w[0] : `${w.slice(0, -1).join(', ')} or ${w[w.length - 1]}`;
}

/** Case, number, gender in that order; without a case, gender then number ("feminine singular"). */
const agreement = (cs: string, num: string, gen: string): string => (cs ? [cs, num, gen] : [gen, num]).filter(Boolean).join(' ');

export function describeRuMorph(morph: Record<string, string>, pos?: PartOfSpeech | string): string {
  const out: string[] = [];
  const cs = words(CASE, morph.Case, CASE_ORDER);
  const num = words(NUMBER, morph.Number);
  const gen = words(GENDER, morph.Gender, GENDER_ORDER);
  const animacy = words(ANIMACY, morph.Animacy);
  const aspect = words(ASPECT, morph.Aspect);
  const tense = words(TENSE, morph.Tense, TENSE_ORDER);
  const person = morph.Person ? words(PERSON, morph.Person) : '';
  const join = (...xs: string[]): string => xs.filter(Boolean).join(' ');
  const short = morph.Variant === 'Short' ? 'short form' : '';
  const voice = words(VOICE, morph.Voice);

  if (morph.VerbForm === 'Conv') {
    const note = morph.Tense === 'Past' ? ' (having …)' : morph.Tense === 'Pres' ? ' (while …)' : '';
    out.push(`${join(tense, 'adverbial participle')}${note}`);
    if (aspect) out.push(aspect);
    return out.join(', ');
  }
  if (morph.VerbForm === 'Part') {
    out.push(join(tense, voice, 'participle'));
    if (short) out.push(short);
    const agr = agreement(cs, num, gen);
    if (agr) out.push(agr);
    if (animacy && !short) out.push(animacy);
    if (aspect) out.push(aspect);
    return out.join(', ');
  }
  if (morph.VerbForm === 'Inf') {
    out.push('infinitive');
    if (aspect) out.push(aspect);
    return out.join(', ');
  }
  if (morph.VerbForm === 'Fin' || morph.Mood) {
    if (morph.Mood === 'Imp') {
      out.push('imperative');
      const pn = join(person, num);
      if (pn) out.push(pn);
    } else if (morph.Person) {
      out.push(join(person, num));
      if (tense) out.push(tense);
    } else {
      if (tense) out.push(tense);
      const gn = join(gen, num);
      if (gn) out.push(gn);
    }
    if (voice) out.push(voice);
    if (aspect) out.push(aspect);
    return out.filter(Boolean).join(', ');
  }

  const nounish = pos === 'NOUN' || pos === 'PROPN';
  if (morph.Degree && !cs && !gen && !num) {
    out.push(words(DEGREE, morph.Degree));
    return out.join(', ');
  }
  if (nounish) {
    const cn = join(cs, num);
    if (cn) out.push(cn);
    if (gen) out.push(gen);
    if (animacy) out.push(animacy);
  } else {
    if (short) out.push(short);
    const agr = agreement(cs, num, gen);
    if (agr) out.push(agr);
    if (person) out.push(person);
    if (animacy) out.push(animacy);
  }
  if (morph.Degree) out.push(words(DEGREE, morph.Degree));
  if (morph.Reflex === 'Yes') out.push('reflexive');
  return out.join(', ');
}
