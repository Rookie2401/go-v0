/** Norwegian Nynorsk (Latin script) for an English reader: the same units as Bokmål (norwegian.ts), words from the pack Nynorsk lexicon only. Not native-reviewed. */
import { PHRASES, WORDS } from '../words/nn';
import { NORWEGIAN_CONFUSIONS, NORWEGIAN_UNITS, norwegianDependencies } from './norwegian';
import type { ScriptProfile } from '../types';

export const NN_PROFILE: ScriptProfile = {
  languageId: 'nn', scriptId: 'Latn', firstBatch: 5, laterBatch: 4,
  units: NORWEGIAN_UNITS, words: WORDS, phrases: PHRASES, confusions: NORWEGIAN_CONFUSIONS.map((c) => ({ ...c })),
  dependencies: norwegianDependencies,
  notes: 'Only what an English reader would read wrong is taught: a i o u y å æ ø j, kj skj sj hv hj gj rs, soft k/g/sk before i y ei øy, the silent d. East Norwegian is the reference. Vowel length and tone are not taught. Word weights are a Bokmål-spelling proxy (Nynorsk has no frequency list). Not reviewed by a native speaker.',
};
