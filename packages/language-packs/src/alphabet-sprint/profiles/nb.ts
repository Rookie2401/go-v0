/** Norwegian Bokmål (Latin script) for an English reader: see norwegian.ts for the shared units. Words are the pack Bokmål lexicon only. Not native-reviewed. */
import { PHRASES, WORDS } from '../words/nb';
import { NORWEGIAN_CONFUSIONS, NORWEGIAN_UNITS, norwegianDependencies } from './norwegian';
import type { ScriptProfile } from '../types';

export const NB_PROFILE: ScriptProfile = {
  languageId: 'nb', scriptId: 'Latn', firstBatch: 5, laterBatch: 4,
  units: NORWEGIAN_UNITS, words: WORDS, phrases: PHRASES, confusions: NORWEGIAN_CONFUSIONS.map((c) => ({ ...c })),
  dependencies: norwegianDependencies,
  notes: 'Only what an English reader would read wrong is taught: a i o u y å æ ø j, kj skj sj hv hj gj rs, soft k/g/sk before i y ei øy, the silent d. East Norwegian is the reference. Vowel length and tone are not taught (tone data is unverified). Not reviewed by a native speaker.',
};
