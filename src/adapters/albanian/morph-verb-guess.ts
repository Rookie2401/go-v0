/**
 * Readings by ending for a verb form outside the word list (part of package Q2, re-exported by morph-verb.ts).
 * Only the productive class in -oj and only clear endings; the lemma is a guess in -oj; never a gloss; never more than
 * three readings; none when the ending says nothing. Machine-drafted, not checked by a native speaker.
 */
import type { SqReading } from './types';

interface Rule {
  ending: string;
  /** What the guessed lemma gets after the stem ('oj', or 'uaj' for the -uan present). */
  lemmaEnd: string;
  morph: Record<string, string>;
  how: string;
}

const act = { Voice: 'Act', VerbForm: 'Fin' };
const mid = { Voice: 'Mid', VerbForm: 'Fin' };
const P = (person: string, number: string, rest: Record<string, string>) => ({ Person: person, Number: number, ...rest });

const RULES: Rule[] = [
  { ending: 'ojmë', lemmaEnd: 'oj', morph: P('1', 'Plur', { Tense: 'Pres', Mood: 'Ind,Sub', ...act }), how: 'present, first person plural' },
  { ending: 'ojnë', lemmaEnd: 'oj', morph: P('3', 'Plur', { Tense: 'Pres', Mood: 'Ind,Sub', ...act }), how: 'present, third person plural' },
  { ending: 'oni', lemmaEnd: 'oj', morph: P('2', 'Plur', { Tense: 'Pres', Mood: 'Ind,Sub', ...act }), how: 'present, second person plural' },
  { ending: 'oni', lemmaEnd: 'oj', morph: P('2', 'Plur', { Mood: 'Imp', ...act }), how: 'imperative, second person plural' },
  { ending: 'onte', lemmaEnd: 'oj', morph: P('3', 'Sing', { Tense: 'Imp', Mood: 'Ind', ...act }), how: 'imperfect, third person singular' },
  { ending: 'onim', lemmaEnd: 'oj', morph: P('1', 'Plur', { Tense: 'Imp', Mood: 'Ind', ...act }), how: 'imperfect, first person plural' },
  { ending: 'onit', lemmaEnd: 'oj', morph: P('2', 'Plur', { Tense: 'Imp', Mood: 'Ind', ...act }), how: 'imperfect, second person plural' },
  { ending: 'onin', lemmaEnd: 'oj', morph: P('3', 'Plur', { Tense: 'Imp', Mood: 'Ind', ...act }), how: 'imperfect, third person plural' },
  { ending: 'ova', lemmaEnd: 'oj', morph: P('1', 'Sing', { Tense: 'Past', Mood: 'Ind', ...act }), how: 'aorist, first person singular' },
  { ending: 'ove', lemmaEnd: 'oj', morph: P('2', 'Sing', { Tense: 'Past', Mood: 'Ind', ...act }), how: 'aorist, second person singular' },
  { ending: 'oi', lemmaEnd: 'oj', morph: P('3', 'Sing', { Tense: 'Past', Mood: 'Ind', ...act }), how: 'aorist, third person singular' },
  { ending: 'uam', lemmaEnd: 'oj', morph: P('1', 'Plur', { Tense: 'Past', Mood: 'Ind', ...act }), how: 'aorist, first person plural' },
  { ending: 'uat', lemmaEnd: 'oj', morph: P('2', 'Plur', { Tense: 'Past', Mood: 'Ind', ...act }), how: 'aorist, second person plural' },
  { ending: 'uan', lemmaEnd: 'oj', morph: P('3', 'Plur', { Tense: 'Past', Mood: 'Ind', ...act }), how: 'aorist, third person plural' },
  { ending: 'uar', lemmaEnd: 'oj', morph: { VerbForm: 'Part' }, how: 'participle' },
  { ending: 'ohem', lemmaEnd: 'oj', morph: P('1', 'Sing', { Tense: 'Pres', Mood: 'Ind,Sub', ...mid }), how: 'non-active present, first person singular' },
  { ending: 'ohesh', lemmaEnd: 'oj', morph: P('2', 'Sing', { Tense: 'Pres', Mood: 'Ind,Sub', ...mid }), how: 'non-active present, second person singular' },
  { ending: 'ohet', lemmaEnd: 'oj', morph: P('3', 'Sing', { Tense: 'Pres', Mood: 'Ind,Sub', ...mid }), how: 'non-active present, third person singular' },
  { ending: 'ohemi', lemmaEnd: 'oj', morph: P('1', 'Plur', { Tense: 'Pres', Mood: 'Ind,Sub', ...mid }), how: 'non-active present, first person plural' },
  { ending: 'oheni', lemmaEnd: 'oj', morph: P('2', 'Plur', { Tense: 'Pres', Mood: 'Ind,Sub', ...mid }), how: 'non-active present, second person plural' },
  { ending: 'ohen', lemmaEnd: 'oj', morph: P('3', 'Plur', { Tense: 'Pres', Mood: 'Ind,Sub', ...mid }), how: 'non-active present, third person plural' },
  // the same ending read as a verb in -uaj (shkruan, luan): one more guess, after the -oj one
  { ending: 'uan', lemmaEnd: 'uaj', morph: P('2,3', 'Sing', { Tense: 'Pres', Mood: 'Ind', ...act }), how: 'present, second or third person singular' },
];

const MIN_STEM = 3;
const MAX_READINGS = 3;

/** Readings by ending for a form outside the word list: `lemmaKnown: false`, confidence 0.5 at most. May be empty. */
export function guessVerb(form: string): SqReading[] {
  const f = form.normalize('NFC').toLowerCase();
  const out: SqReading[] = [];
  for (const r of RULES) {
    if (out.length >= MAX_READINGS) break;
    if (!f.endsWith(r.ending)) continue;
    const stem = f.slice(0, -r.ending.length);
    if (stem.length < MIN_STEM || !/^[a-zçë]+$/.test(stem)) continue;
    const lemma = r.lemmaEnd === 'uaj' ? `${stem}uaj` : `${stem}oj`;
    out.push({
      lemma,
      pos: 'VERB',
      morph: { ...r.morph },
      confidence: 0.4,
      lemmaKnown: false,
      rule: `a guess: the ending -${r.ending} looks like the ${r.how} of a verb in -${r.lemmaEnd} (${lemma}); the word is not in the word list`,
      origin: 'rule',
    });
  }
  return out;
}
