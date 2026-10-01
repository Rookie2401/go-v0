/**
 * The German hand lexicon as the engine and the sentence layer see it. STUB — package GB replaces the body; the
 * exports are final.
 */
import type { DeLexiconView } from './types';

const none = <T>(): T[] => [];
export const deLexiconView: DeLexiconView = {
  nouns: none, verb: none, adjective: () => undefined, closed: none, plain: none, preposition: () => undefined, contraction: () => undefined,
  prefixKind: () => undefined, separableVerbsOf: none, allNouns: none, allVerbs: none, allAdjectives: none,
};

/** What the lexicon holds, for the readiness table and the tests. */
export const deLexiconStats = { nouns: 0, verbs: 0, strongVerbs: 0, separableVerbs: 0, adjectives: 0, closedForms: 0, plainWords: 0, duplicates: [] as string[] };
