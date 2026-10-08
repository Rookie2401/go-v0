/**
 * The adapter's version and the ids of its sources, in a leaf module so that the sentence layer can stamp the readings it
 * makes itself (a name guessed from a capital letter, a Roman numeral) without importing analyze.ts, which imports it.
 *
 * Version history of the analyses (a changed analysis bumps the number; stored analyses carry `adapter-sq@<n>`):
 *   7  the word list of the Albanian course (about 900 content words), source agreement, sentence layer.
 *   8  the ladder plan's 271 additions (data/ladder/sq/PLAN-A1-2-A2.md section 6.1); the aorist of verbs that exist only in
 *      the non-active (mbeti, lindi, ndodhi, u ula, u nisëm); an unlisted word with a capital inside the sentence is an
 *      unconfirmed proper noun; Roman numerals are numbers; abbreviations (km, shek, etj, p.e.s …) are read; a capitalised
 *      cast name before a verb is the name (Drita, Mira, Luan); para with no noun phrase after it is the noun (money);
 *      the definite plural of a noun in -o is -ot.
 *   9  the b1-bridge word list (about 160 entries: lexicon-ladder.ts, SQ_BRIDGE_*), names of the bridge cast as proper nouns.
 */
export const SQ_VERSION = '9';
export const SQ_ANALYZER = `adapter-sq@${SQ_VERSION}`;
export const SQ_SOURCE_IDS = {
  hand: `${SQ_ANALYZER}:hand`,
  rules: `${SQ_ANALYZER}:rules`,
  phrases: `${SQ_ANALYZER}:phrases`,
  constructions: `${SQ_ANALYZER}:constructions`,
} as const;
