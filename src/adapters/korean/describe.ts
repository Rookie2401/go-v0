/**
 * The plain-English line for a Korean feature bundle: "past, formal polite, statement"; "topic particle"; "descriptive verb, informal
 * polite". It describes the FORM only; it never conjugates a gloss (Korean has no person agreement, and 예쁜 is "pretty (before a
 * noun)", not "prettying"). A meaning line is the gloss unchanged plus this description, built by the caller.
 */
import type { PartOfSpeech } from '../../core';
import { SPEECH_LEVEL_NAMES } from './endings';
import { PARTICLES } from './particles';

const MOOD: Readonly<Record<string, string>> = { Ind: 'statement', Int: 'question', Imp: 'command', Prop: 'suggestion', Excl: 'exclamation' };
const CASE: Readonly<Record<string, string>> = {
  Nom: 'subject', Acc: 'object', Gen: 'possessive', Dat: 'to a person', Loc: 'place or time', Abl: 'from', Ins: 'means or direction',
  Com: 'with, and', Cmp: 'comparison (than)', Equ: 'like, as', Ess: 'as (capacity)', Voc: 'calling',
};
const CONNECTIVE: Readonly<Record<string, string>> = {
  and: 'and', 'and-while': 'and, while', while: 'while', but: 'but', so: 'so, because', since: 'since', because: 'because', if: 'if',
  intend: 'in order to', purpose: 'to (go and do)', 'even-if': 'even if', 'only-if': 'only if', background: 'background (…, and / but)',
  then: 'and then', 'as-soon-as': 'as soon as', 'so-that': 'so that', adverbial: 'so as to, -ly', 'as-if': 'as if', or: 'or', whether: 'whether',
  'because-busy': 'because (busy doing)', 'the-more': 'the more …', 'and-then': 'and then (as seen)', neg: 'before a negative', inf: 'infinitive (before an auxiliary)',
  after: 'after', quote: 'quotation (that …)', 'as-you-know': 'as you know', although: 'although', saying: 'saying', 'as-i': 'as I …',
};

/** The description of a reading's features, or undefined when there is nothing to say. */
export function describeKoMorph(morph: Readonly<Record<string, string>>, pos?: PartOfSpeech | string): string | undefined {
  const out: string[] = [];
  const m = morph;
  // what the word is
  if (m.VerbType === 'Descriptive') out.push('descriptive verb');
  else if (m.VerbType === 'Exist') out.push('existential (be, have)');
  else if (m.VerbType === 'Cop') out.push(m.Polarity === 'Neg' ? 'negative copula (is not)' : 'with the copula (is)');
  if (m.NounType === 'Bound') out.push('bound noun');
  if (m.NounType === 'Clf') out.push('counter');
  if (m.Voice === 'Pass') out.push('passive');
  if (m.Voice === 'Caus') out.push('causative');
  // predicate
  if (m.Honorific === 'Subj') out.push('honorific');
  if (m.Tense === 'Past' && m.Aspect === 'Pqp') out.push('past perfect');
  else if (m.Tense === 'Past') out.push('past');
  else if (m.Tense === 'Pres' && m.VerbForm === 'Adn') out.push('present');
  if (m.Aspect === 'Prosp') out.push('prospective');
  if (m.Modality) for (const v of m.Modality.split(',')) out.push(v === 'Presumptive' ? 'intention or conjecture (-겠-)' : v === 'Retrospective' ? 'retrospective (-더-)' : v === 'Necessitative' ? 'must (-아/어야겠-)' : v);
  if (m.SpeechLevel) out.push(SPEECH_LEVEL_NAMES[m.SpeechLevel] ?? m.SpeechLevel);
  if (m.Mood) out.push(MOOD[m.Mood] ?? m.Mood);
  if (m.Quote === 'Ind') out.push('reported (indirect quotation)');
  if (m.VerbForm === 'Adn') out.push('before a noun');
  else if (m.VerbForm === 'Nmlz') out.push('as a noun');
  else if (m.VerbForm === 'Conn' && m.Connective && m.Connective !== 'quote') out.push(`connective: ${CONNECTIVE[m.Connective] ?? m.Connective}`);
  else if (m.VerbForm === 'Conn') out.push('connective');
  // nominal side: name each particle
  if (m.Number === 'Plur') out.push('plural');
  if (m.Particle) {
    for (const id of m.Particle.split('+')) {
      const p = PARTICLES[id];
      if (!p || id === 'plural') continue;
      out.push(id === 'topic' ? 'topic particle' : id === 'subject' ? (m.Complement === 'Yes' ? 'complement particle' : 'subject particle') : id === 'object' ? 'object particle' : `${p.family} (${p.role})`);
    }
  } else if (m.Case) out.push(m.Case.split(',').map((c) => CASE[c] ?? c).join(', '));
  if (!out.length) return pos === 'VERB' || pos === 'ADJ' ? 'dictionary form' : undefined;
  return out.join(', ');
}
