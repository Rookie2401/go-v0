/** The Korean analyser's version and the ids of its sources (the same ids a candidate's `sourceId` carries). Bump the version when analysis changes. */
export const KO_ANALYZER_VERSION = '1';
export const KO_ANALYZER = `adapter-ko@${KO_ANALYZER_VERSION}`;

export const KO_SOURCE_IDS = {
  /** Headwords of the Wiktionary Korean entries, via kaikki.org (CC BY-SA 4.0): the stem lexicon (part of speech, conjugation class, first gloss, Hanja). */
  lexicon: 'kaikki-ko-lexicon',
  /** Particles and endings: closed tables written by hand for this adapter (korean/particles.ts, korean/endings.ts). */
  closed: 'ko-closed',
  /** Rules: Hangul arithmetic, stem alternation, contraction, particle and ending chains, an unknown stem offered as written, context ordering. */
  rules: 'ko-rules',
  /** Grammar patterns of several morphemes or words (-고 있다, -(으)ㄹ 수 있다 …). */
  constructions: 'ko-constructions',
  /** Fixed phrases. */
  phrases: 'ko-phrases',
  /** Lemma counts from the UD Korean-Kaist treebank, train split (CC BY-SA 4.0): the order of readings and the choice of the compiled core. */
  priors: 'ud-ko-kaist-train',
} as const;
