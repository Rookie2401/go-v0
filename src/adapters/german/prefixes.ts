/**
 * Verb prefixes and how they behave. Machine-drafted, not checked by a native speaker.
 *
 *  - 'separable' always splits off in a main clause ("Er steht früh auf"): ab, an, auf, aus, ein, mit, nach, vor, zu …
 *  - 'inseparable' never does (be-, emp-, ent-, er-, ge-, miss-, ver-, zer-): "Er versteht", "Er bekommt".
 *  - 'dual' depends on the verb and its meaning (durch, über, um, unter, wieder, wider, hinter): "Er fährt das Kind um"
 *    (knocks down, separable) against "Er umfährt die Baustelle" (drives around, inseparable). For these ONLY the
 *    lexicon says which verb is which; a verb the lexicon does not hold is never split by guess.
 */
import type { DePrefixKind } from './types';

const SEPARABLE = [
  'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fort', 'los', 'mit', 'nach', 'vor', 'weg', 'weiter', 'zu', 'zurück', 'zusammen',
  'auseinander', 'dar', 'empor', 'entgegen', 'fern', 'fest', 'frei', 'heim', 'her', 'heran', 'herab', 'heraus', 'herbei',
  'herein', 'herüber', 'herum', 'herunter', 'hervor', 'hin', 'hinaus', 'hinein', 'hinüber', 'hinunter', 'hinzu', 'hoch',
  'kennen', 'nieder', 'statt', 'teil', 'vorbei', 'voran', 'voraus', 'wahr', 'zurecht', 'bereit', 'vorüber',
];
const INSEPARABLE = ['be', 'emp', 'ent', 'er', 'ge', 'miss', 'ver', 'zer'];
const DUAL = ['durch', 'über', 'um', 'unter', 'wieder', 'wider', 'hinter'];

const KINDS = new Map<string, DePrefixKind>();
for (const p of SEPARABLE) KINDS.set(p, 'separable');
for (const p of INSEPARABLE) KINDS.set(p, 'inseparable');
for (const p of DUAL) KINDS.set(p, 'dual');

/** How a prefix behaves: the prefix as written, lower case. Undefined = not a verb prefix the lexicon knows. */
export function prefixKind(prefix: string): DePrefixKind | undefined {
  return KINDS.get(prefix.normalize('NFC').toLocaleLowerCase('de'));
}

/** Every prefix the lexicon knows, by kind (for the tests and for code that builds an index). */
export const PREFIXES: Readonly<Record<DePrefixKind, readonly string[]>> = { separable: SEPARABLE, inseparable: INSEPARABLE, dual: DUAL };
