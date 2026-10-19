/** Identity of the Latin analyser: bump LA_ANALYZER_VERSION whenever an analysis changes (the importer stores it as provenance). */
export const LA_ANALYZER_VERSION = '1';
export const LA_ANALYZER = `adapter-la@${LA_ANALYZER_VERSION}`;

export const LA_SOURCE_IDS = {
  /** The seed word list: Whitaker's Words entries for the commonest Vulgate lemmas, ranked by Vulgate counts. */
  lexicon: 'la-lexicon',
  /** The closed classes (pronouns, irregular verbs, numerals, prepositions, particles) ported from the Romance app. */
  closed: 'la-closed',
  /** Rule-built readings: word forms generated from principal parts, compound verbs, derived adverbs, guesses for unknown words. */
  rules: 'la-rules',
  constructions: 'la-constructions',
  phrases: 'la-phrases',
  /** The vocabulary of Wiktionary's Latin inflection tags (kaikki.org), used only to map a dictionary's table tags to features. */
  tags: 'la-wiktionary-tags',
} as const;
