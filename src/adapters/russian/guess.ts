/**
 * A reading from the ENDING of a word the indexes do not hold, for the few endings that say something on their own. It is a guess and
 * says so: the analyser gives it `unconfirmed: true`, a confidence of at most 0.40 and no gloss, and it gives a lemma only where the
 * ending fixes it (a reflexive infinitive IS its lemma). A word whose ending is not listed here gets no reading at all; an empty list is
 * the honest answer.
 *
 * What is NOT guessed: nouns in -а, -ы, -и, -у, -ом, -ов, -ой, -ей (too many parts of speech end that way), anything shorter than five
 * letters, a word with fewer than two letters before the ending, a word in capitals (an acronym), a word with a hyphen.
 */
import type { PartOfSpeech } from '../../core';
import { RUSSIAN_LETTER } from './text';

export interface RuGuess {
  pos: PartOfSpeech;
  morph: Record<string, string>;
  /** Only when the ending fixes it. */
  lemma?: string;
  /** The ending that decided, for the context rules and the tests. */
  ending: string;
}

type Rule = readonly [ending: string, pos: PartOfSpeech, morph: Record<string, string>, lemma?: 'self'];

const FIN = { VerbForm: 'Fin', Mood: 'Ind' } as const;
/** Longest endings first within a group; the first ending that matches decides, all of its rules are given. */
const RULES: readonly Rule[] = [
  // reflexive infinitive: the word is its own lemma
  ['ться', 'VERB', { VerbForm: 'Inf', Reflex: 'Yes' }, 'self'],
  // reflexive present / non-past, third person
  ['ется', 'VERB', { ...FIN, Person: '3', Number: 'Sing', Tense: 'Fut,Pres', Reflex: 'Yes' }],
  ['ётся', 'VERB', { ...FIN, Person: '3', Number: 'Sing', Tense: 'Fut,Pres', Reflex: 'Yes' }],
  ['ится', 'VERB', { ...FIN, Person: '3', Number: 'Sing', Tense: 'Fut,Pres', Reflex: 'Yes' }],
  ['ются', 'VERB', { ...FIN, Person: '3', Number: 'Plur', Tense: 'Fut,Pres', Reflex: 'Yes' }],
  ['утся', 'VERB', { ...FIN, Person: '3', Number: 'Plur', Tense: 'Fut,Pres', Reflex: 'Yes' }],
  ['атся', 'VERB', { ...FIN, Person: '3', Number: 'Plur', Tense: 'Fut,Pres', Reflex: 'Yes' }],
  ['ятся', 'VERB', { ...FIN, Person: '3', Number: 'Plur', Tense: 'Fut,Pres', Reflex: 'Yes' }],
  // adjectives and participles
  ['ющий', 'VERB', { VerbForm: 'Part', Voice: 'Act', Tense: 'Pres', Case: 'Nom', Number: 'Sing', Gender: 'Masc' }],
  ['ящий', 'VERB', { VerbForm: 'Part', Voice: 'Act', Tense: 'Pres', Case: 'Nom', Number: 'Sing', Gender: 'Masc' }],
  ['ущий', 'VERB', { VerbForm: 'Part', Voice: 'Act', Tense: 'Pres', Case: 'Nom', Number: 'Sing', Gender: 'Masc' }],
  ['ающий', 'VERB', { VerbForm: 'Part', Voice: 'Act', Tense: 'Pres', Case: 'Nom', Number: 'Sing', Gender: 'Masc' }],
  ['вший', 'VERB', { VerbForm: 'Part', Voice: 'Act', Tense: 'Past', Case: 'Nom', Number: 'Sing', Gender: 'Masc' }],
  ['ого', 'ADJ', { Case: 'Gen', Gender: 'Masc,Neut', Number: 'Sing' }],
  ['его', 'ADJ', { Case: 'Gen', Gender: 'Masc,Neut', Number: 'Sing' }],
  ['ому', 'ADJ', { Case: 'Dat', Gender: 'Masc,Neut', Number: 'Sing' }],
  ['ему', 'ADJ', { Case: 'Dat', Gender: 'Masc,Neut', Number: 'Sing' }],
  ['ыми', 'ADJ', { Case: 'Ins', Number: 'Plur' }],
  ['ими', 'ADJ', { Case: 'Ins', Number: 'Plur' }],
  ['ая', 'ADJ', { Case: 'Nom', Gender: 'Fem', Number: 'Sing' }],
  ['яя', 'ADJ', { Case: 'Nom', Gender: 'Fem', Number: 'Sing' }],
  ['ую', 'ADJ', { Case: 'Acc', Gender: 'Fem', Number: 'Sing' }],
  ['юю', 'ADJ', { Case: 'Acc', Gender: 'Fem', Number: 'Sing' }],
  ['ые', 'ADJ', { Case: 'Acc,Nom', Number: 'Plur' }],
  ['ых', 'ADJ', { Case: 'Gen,Prep', Number: 'Plur' }],
  ['их', 'ADJ', { Case: 'Gen,Prep', Number: 'Plur' }],
  // verbs: present / non-past
  ['ешь', 'VERB', { ...FIN, Person: '2', Number: 'Sing', Tense: 'Fut,Pres' }],
  ['ёшь', 'VERB', { ...FIN, Person: '2', Number: 'Sing', Tense: 'Fut,Pres' }],
  ['ишь', 'VERB', { ...FIN, Person: '2', Number: 'Sing', Tense: 'Fut,Pres' }],
  ['ете', 'VERB', { ...FIN, Person: '2', Number: 'Plur', Tense: 'Fut,Pres' }],
  ['ёте', 'VERB', { ...FIN, Person: '2', Number: 'Plur', Tense: 'Fut,Pres' }],
  ['ите', 'VERB', { ...FIN, Person: '2', Number: 'Plur', Tense: 'Fut,Pres' }],
  ['ют', 'VERB', { ...FIN, Person: '3', Number: 'Plur', Tense: 'Fut,Pres' }],
  ['ут', 'VERB', { ...FIN, Person: '3', Number: 'Plur', Tense: 'Fut,Pres' }],
  ['ят', 'VERB', { ...FIN, Person: '3', Number: 'Plur', Tense: 'Fut,Pres' }],
  ['ет', 'VERB', { ...FIN, Person: '3', Number: 'Sing', Tense: 'Fut,Pres' }],
  ['ёт', 'VERB', { ...FIN, Person: '3', Number: 'Sing', Tense: 'Fut,Pres' }],
  // verbs: past
  ['ала', 'VERB', { ...FIN, Tense: 'Past', Gender: 'Fem', Number: 'Sing' }],
  ['ила', 'VERB', { ...FIN, Tense: 'Past', Gender: 'Fem', Number: 'Sing' }],
  ['ало', 'VERB', { ...FIN, Tense: 'Past', Gender: 'Neut', Number: 'Sing' }],
  ['ило', 'VERB', { ...FIN, Tense: 'Past', Gender: 'Neut', Number: 'Sing' }],
  ['али', 'VERB', { ...FIN, Tense: 'Past', Number: 'Plur' }],
  ['или', 'VERB', { ...FIN, Tense: 'Past', Number: 'Plur' }],
  ['ал', 'VERB', { ...FIN, Tense: 'Past', Gender: 'Masc', Number: 'Sing' }],
  ['ил', 'VERB', { ...FIN, Tense: 'Past', Gender: 'Masc', Number: 'Sing' }],
  // nouns: the plural cases whose endings only nouns have
  ['ами', 'NOUN', { Case: 'Ins', Number: 'Plur' }],
  ['ями', 'NOUN', { Case: 'Ins', Number: 'Plur' }],
  ['ах', 'NOUN', { Case: 'Prep', Number: 'Plur' }],
  ['ях', 'NOUN', { Case: 'Prep', Number: 'Plur' }],
];
const MIN_LENGTH = 5;
const MIN_STEM = 2;

/** The guesses for a key (as `ruKey` writes it) or its surface (capitals decide whether an acronym is meant). */
export function ruGuess(key: string, surface: string = key): RuGuess[] {
  if (key.length < MIN_LENGTH || /[^а-яё]/.test(key)) return [];
  if (surface.length > 1 && surface === surface.toUpperCase() && RUSSIAN_LETTER.test(surface)) return [];
  const out: RuGuess[] = [];
  let ending: string | undefined;
  for (const [end, pos, morph, lemma] of RULES) {
    if (!key.endsWith(end) || key.length - end.length < MIN_STEM) continue;
    // the first (longest listed) ending that matches decides; its sibling rules of the same ending are all given
    if (ending !== undefined && ending !== end) continue;
    ending = end;
    out.push({ pos, morph: { ...morph }, ending: end, ...(lemma === 'self' ? { lemma: key } : {}) });
  }
  return out;
}
