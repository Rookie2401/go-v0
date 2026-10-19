/**
 * Latin specifics of the dictionary build (the rules themselves are in latin-normalize.ts, which a reader can import alone).
 *
 * `latinAliases(entry)`: for a mapped entry, the small form-of entries that make its other printed spellings find it: the
 * same headword with every `v` as `u` ("uerbum"), with a consonantal `i` as `j` ("ejus"), with both. An alias carries no gloss
 * and no pronunciation of its own, only the relation: an inflected form of a lemma copies the relations of the entry (so
 * "uerbo" says "dative/ablative singular of verbum" directly), a headword is named as the lemma with the labels
 * `alt-of` and `orthographic-variant`. Nothing is invented: the spellings are the same word, written the other way.
 */
import type { DictionaryEntry } from '../core';
import { latinVariantKeys } from './latin-normalize';

export const LATIN_ALIAS_LABELS: readonly string[] = ['alt-of', 'orthographic-variant'];
const MAX_ALIAS_KEY = 40;

export function latinAliases(entry: DictionaryEntry): DictionaryEntry[] {
  if (entry.form.length > MAX_ALIAS_KEY || entry.altOf?.length) return [];
  const relations = !entry.glosses.length && entry.formOf?.length
    ? entry.formOf.map((f) => ({ lemma: f.lemma, tags: [...f.tags] }))
    : [{ lemma: entry.form, tags: [...LATIN_ALIAS_LABELS] }];
  return latinVariantKeys(entry.form).map((form) => ({
    form, lang: entry.lang, glosses: [], ...(entry.pos ? { pos: entry.pos } : {}), formOf: relations.map((r) => ({ lemma: r.lemma, tags: [...r.tags] })),
  }));
}
