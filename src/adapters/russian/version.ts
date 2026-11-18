/** The Russian analyser's version and the ids of its sources (the same ids a candidate's `sourceId` carries). Bump the version when analysis changes. */
export const RU_ANALYZER_VERSION = '1';
export const RU_ANALYZER = `adapter-ru@${RU_ANALYZER_VERSION}`;

export const RU_SOURCE_IDS = {
  /** Inflection tables and form-of pages of the Wiktionary Russian entries, via kaikki.org (CC BY-SA 4.0): the form index. */
  tables: 'kaikki-ru-tables',
  /** Closed-class forms the tables do not list, written by hand for this adapter. */
  closed: 'ru-closed',
  /** Rules: hyphenated words read through their parts, ё restored, readings guessed from an ending, context ordering. */
  rules: 'ru-rules',
  /** Grammar patterns (aspect, motion verbs, possession, numerals …). */
  constructions: 'ru-constructions',
  /** Fixed phrases. */
  phrases: 'ru-phrases',
  /** Lemma counts from the UD Russian-GSD treebank, train split (CC BY-SA 4.0): the order of readings. */
  priors: 'ud-ru-gsd-train',
} as const;
