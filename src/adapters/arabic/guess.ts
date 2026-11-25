/**
 * A reading for a word no source has, from an UNMISTAKABLE pattern only. Arabic offers very little of it: most endings are shared by
 * several parts of speech (ـان, ـون, ـة, ـا), so the one pattern guessed is the sound feminine plural ـات of an unknown noun
 * (سَيَّارَات, حَاسُوبَات). A guess is `unconfirmed`, at most 0.35, has no gloss and, because the singular cannot be told (ـة, a bare form,
 * a shortened form), no lemma. A word whose ending is not listed here gets no reading at all; an empty list is the honest answer.
 *
 * Not guessed: a word under five letters, a word with fewer than three letters before ـات, a word in capitals or with Latin letters,
 * a verb (a prefix pattern such as يَـ … also begins nouns), the dual and the sound masculine plural (the endings ـان and ـون end
 * many words that are not plurals).
 */
import type { PartOfSpeech } from '../../core';
import { ARABIC_LETTER } from './text';

export interface ArGuess { pos: PartOfSpeech; morph: Record<string, string>; ending: string }

export function arGuess(key: string): ArGuess[] {
  if (!key || /[a-zA-Z]/.test(key) || ![...key].every((c) => ARABIC_LETTER.test(c))) return [];
  let body = key;
  let definite = false;
  if (body.startsWith('ال') && body.length - 2 >= 5) { body = body.slice(2); definite = true; }
  if (body.length < 5 || !body.endsWith('ات') || body.length - 2 < 3) return [];
  return [{ pos: 'NOUN', morph: { Number: 'Plur', PluralType: 'Sound', ...(definite ? { Definite: 'Def' } : {}) }, ending: 'ـات' }];
}
