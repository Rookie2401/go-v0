/** The Arabic analyser's version and the ids of its sources (the same ids a candidate's `sourceId` carries). Bump the version when analysis changes. */
export const AR_ANALYZER_VERSION = '1';
export const AR_ANALYZER = `adapter-ar@${AR_ANALYZER_VERSION}`;

export const AR_SOURCE_IDS = {
  /** Conjugation and declension tables and form-of pages of the Wiktionary Arabic entries, via kaikki.org (CC BY-SA 4.0): the form index. */
  tables: 'kaikki-ar-tables',
  /** Closed-class words and attached forms the tables do not list (particles, pronouns, prepositions with pronoun suffixes), written by hand for this adapter. */
  closed: 'ar-closed',
  /** Rules: clitics cut from a written word, a loose spelling restored, the vowels compared with the page's, a reading guessed from a pattern. */
  rules: 'ar-rules',
  /** Grammar patterns (construct phrases, kāna and inna, negation with its mood, conditionals …). */
  constructions: 'ar-constructions',
  /** Fixed phrases. */
  phrases: 'ar-phrases',
  /** Surface-word frequencies from hermitdave/FrequencyWords, Arabic (CC BY-SA 4.0): the estimate that orders readings. */
  priors: 'frequencywords-ar',
} as const;

/** The learning varieties of the Arabic pack (packages/repository-contract/src/varieties.ts declares them for the Repository). */
export const AR_VARIETIES = { msa: 'ar-msa', classical: 'ar-cla' } as const;
