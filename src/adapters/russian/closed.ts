/**
 * Closed-class forms the Wiktionary tables do not list, written by hand (`sourceId: RU_SOURCE_IDS.closed`, `origin: 'hand'`).
 * Only what the form index really lacks is here; the analyser also checks at run time that the index does not hold the reading
 * (same lemma, same part of speech) before it adds one, so an entry the index later gains simply stops being used.
 *
 * Each entry says a fact of the grammar and nothing about meaning: the lemma is the headword the dictionary files the word under
 * (so the gloss is found there), the part of speech and the features of the form. No gloss is written here.
 */
import type { PartOfSpeech } from '../../core';

export interface RuClosedEntry {
  lemma: string;
  pos: PartOfSpeech;
  morph: Record<string, string>;
}

/**
 * Checked against the real index (the compiled core and every shard, 2026-11-17):
 *  - the variants of prepositions and particles (во, со, ко, об, обо, изо, надо, подо, передо, ото, б, ж, ль) and the н-forms of the
 *    personal pronouns (него, неё, них, ним, нему, ней, нём, ними) ARE in the index (as pages of their own, or as forms of он / она /
 *    оно / они), so nothing is added for them;
 *  - безо is in no table and has no page: added (a variant of без);
 *  - the subordinators (что, чтобы, если, когда, хотя, пока …) are SCONJ ids of the index itself since batch A1: nothing is added.
 */
export const RU_CLOSED: Readonly<Record<string, readonly RuClosedEntry[]>> = {
  безо: [{ lemma: 'без', pos: 'ADP', morph: {} }],
};

/** The hand readings for a key, or none. */
export const ruClosedFor = (key: string): readonly RuClosedEntry[] => RU_CLOSED[key] ?? [];

/**
 * The LEXEME features of the personal pronouns, supplied by hand: the source's pronoun tables do not tag number (and on some forms
 * person or gender), so я, мы, мне, меня, нас … would read without them. They are merged into every index reading of the lemma
 * that LACKS the key and never override what the source states; the reading is still the index's (`origin` stays 'dictionary').
 * The reflexive себя has no person or number and is left alone.
 */
export const RU_PRONOUN_LEXEME: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  я: { Person: '1', Number: 'Sing' }, ты: { Person: '2', Number: 'Sing' },
  он: { Person: '3', Number: 'Sing', Gender: 'Masc' }, она: { Person: '3', Number: 'Sing', Gender: 'Fem' }, оно: { Person: '3', Number: 'Sing', Gender: 'Neut' },
  мы: { Person: '1', Number: 'Plur' }, вы: { Person: '2', Number: 'Plur' }, они: { Person: '3', Number: 'Plur' },
};
