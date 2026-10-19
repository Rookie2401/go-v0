/**
 * LanguageAdapter — the boundary between language-neutral engines and language-specific knowledge.
 *
 * Rules:
 *  - tokenize() is NEVER text.split(' '). Thai uses dictionary segmentation (Intl.Segmenter 'th');
 *    Hindi/Devanagari must keep combining marks (matras, nukta, virama) inside the token; German may
 *    report compound components; Spanish may report clitic boundaries.
 *  - Every analysis carries a confidence and an analyzer name. Uncertain ⇒ low confidence +
 *    alternatives, never a confident guess.
 *  - Adapters own no learner state and no storage.
 */
import type { AnalysisOrigin, AnalysisSourceInfo, ErrorCategory, LanguageCode, PartOfSpeech, Script, TransformationRecord, WordPart, OrthographyRelation } from './model';
import type { Variety } from './variety';
import type { RegisterTag, SyllableAnalysis } from './course';
import type { GeneratedParadigm, Paradigm, ParadigmCell, SegmentationAlternatives } from './paradigm';
import type { SyntaxAnalysis } from './syntax';

export interface Span { start: number; end: number; text: string }

export interface RawToken {
  surface: string;
  start: number;
  end: number;
  isWord: boolean;
  /** Adapter-normalized identity of the form (e.g. NFC + lowercase for Latin; NFC only for Devanagari/Thai). */
  normalized: string;
}

export interface AnalysisCandidate {
  lemma?: string;
  pos?: PartOfSpeech;
  morph: Record<string, string>;
  notes?: Record<string, string | string[]>;
  confidence: number;
  gloss?: string;
  /** Script decoding (see SyllableAnalysis). Present whenever the adapter can decode the spelling, even for a
   *  word it has no gloss for: decoding does not depend on the dictionary. */
  syllables?: SyllableAnalysis[];
  register?: RegisterTag[];
  role?: string;
  definition?: string;
  /** Varieties the form or meaning belongs to when it is not general usage (see core/variety.ts). */
  varieties?: string[];
  /** Units inside the written word (verb + attached pronouns, contraction parts). */
  parts?: WordPart[];
  /** Where this candidate came from; the importer stores it on the analysis. Absent ⇒ 'hand' for a lexicon hit, 'rule' when notes.source === 'rule'. */
  origin?: AnalysisOrigin;
  sourceId?: string;
  /**
   * This token is one piece of a lexical unit that the sentence writes as several words (German "steht … auf" =
   * aufstehen). `lemma` of the candidate is the unit's lemma on every piece; `head` and `pieces` are token indexes in
   * the sentence; the importer turns them into token ids (`TokenAnalysis.unit`). The unit's encounter is counted once,
   * on the head piece.
   */
  unit?: { head: number; pieces: number[]; role: string; display: string };
  /** The written form follows an older or other spelling norm; the text is never changed (see OrthographyRelation). */
  orthography?: OrthographyRelation;
  /**
   * A reading by rule whose lemma the adapter's own data does not vouch for (Spanish: "trabucaban" → a guessed
   * "trabucar"). It explains the form and nothing more. When a dictionary is installed the importer lets the
   * dictionary decide such a word: a reading the dictionary confirms is kept (with the dictionary as its source),
   * one it does not confirm is dropped; with no dictionary entry for the form the guess stays as it is.
   */
  unconfirmed?: boolean;
}

export interface AnalyzedToken {
  token: RawToken;
  /** Best first; may be empty when the adapter knows nothing (uncertainty stored, not guessed). */
  candidates: AnalysisCandidate[];
  analyzer: string; // "adapter-es@1"
}

export interface PhraseCandidate {
  /** Normalized pattern tokens; "_" = slot. */
  pattern: string[];
  display: string;
  kind: 'collocation' | 'formula' | 'idiom' | 'frame' | 'construction';
  tokenIndexes: number[];
  confidence: number;
  gloss?: string;
}

export interface PatternCandidate {
  key: string;
  title: string;
  explanation: string;
  tokenIndexes: number[];
  confidence: number;
}

export interface PronunciationSupport {
  /** Romanization / phonetic aid for display in the support panel (never sent to TTS). */
  transliteration?: string;
  ipa?: string;
  /**
   * Who produced `ipa` when it is the adapter's own (rule-based, e.g. Norwegian 'rules'): the word sheet then shows it, labelled
   * with the adapter's name, when neither the analysis nor a dictionary carries an IPA. Absent ⇒ the sheet ignores `ipa` (as before).
   */
  ipaSource?: string;
  /** Thai tone per syllable, Hindi schwa deletion hints, German stress, etc. */
  notes?: string[];
}

export interface SpeechNormalizationResult {
  speechText: string;
  transformations: TransformationRecord[];
  normalizerVersion: string;
}

export interface DisplayConventions {
  wordSeparator: string; // ' ' or ''
  /** Whether to render token boundaries subtly when highlighting (Thai wants this). */
  showBoundariesOnHighlight: boolean;
  fontFamily?: string;
  lineHeight?: number;
}

/** A candidate error in learner-written text, found by language-specific rules. */
export interface ErrorCandidate {
  category: ErrorCategory;
  tokenIndexes: number[];
  message: string; // learner-facing, short
  /** Suggested replacement of the affected span, when the rule is confident enough to offer one. */
  suggestion?: { start: number; end: number; replacement: string };
  confidence: number;
  affectsMeaning: boolean;
}

export type SupportLevel = 'dependable' | 'limited' | 'seed-only' | 'none';

/** What this adapter can honestly do. Shown in Settings and in the readiness table; never overstated. */
export interface AdapterSupport {
  tokenization: SupportLevel;
  sentenceSegmentation: SupportLevel;
  /** 'seed-only' = a small hand lexicon covering the seed corpus; supplied texts will have unanalysed words. */
  lemmatization: SupportLevel;
  morphology: SupportLevel;
  phraseDetection: SupportLevel;
  productionChecks: SupportLevel;
  /** Plain statements of limits ("Thai sentence breaks need a newline between sentences"). */
  limitations: string[];
}

/** One member of a concept family: a word of one language/standard that names the same concept as the others. */
export interface ConceptFamilyMember { lang: LanguageCode; lemma: string; pos?: PartOfSpeech; register?: RegisterTag[]; note?: string }
/**
 * Words of different standards that name one concept (Bokmål jeg / Nynorsk eg). Members NEVER share an item id and mastery is
 * never transferred between them; a family is shown ("related, not credited"), not merged.
 */
export interface ConceptFamily { id: string; meaning: string; members: ConceptFamilyMember[] }

export interface LanguageAdapter {
  readonly lang: LanguageCode;
  readonly name: string;
  readonly script: Script;
  readonly version: string; // bump when analysis changes (analysis provenance)
  readonly support: AdapterSupport;

  segmentSentences(text: string): Span[];
  tokenize(sentence: string): RawToken[];
  normalize(surface: string): string;
  /** Normalize a search query in a script-aware way (strip accents for es? keep for de; NFC for Deva). */
  searchNormalize(query: string): string;
  /**
   * `opts.varietyId` (optional): the variety the text is known or believed to be in — the reader's declared period (a
   * Tanakh verse is Biblical Hebrew), else the learner's enrolment. An adapter with period varieties uses it only to
   * BREAK TIES between readings the text itself leaves open; what the text decides (pointing, polytonic accents, an
   * attested form) is never overridden by it. Adapters without varieties ignore it.
   */
  analyze(tokens: RawToken[], opts?: AnalyzeOptions): AnalyzedToken[];
  detectPhrases(tokens: RawToken[], analyses: AnalyzedToken[]): PhraseCandidate[];
  detectPatterns(tokens: RawToken[], analyses: AnalyzedToken[]): PatternCandidate[];
  pronunciation(token: RawToken, analysis?: AnalyzedToken): PronunciationSupport;
  /** Deterministic, versioned. Handles numbers/abbreviations/verse markers; never transliterates. */
  speechNormalize(displayText: string, opts?: { isScripture?: boolean }): SpeechNormalizationResult;
  display: DisplayConventions;
  /** Rule-based checks on learner writing (GoTell). Empty array = nothing found, not "correct". */
  checkProduction(tokens: RawToken[], analyses: AnalyzedToken[], sentence: string, opts?: AnalyzeOptions): ErrorCandidate[];
  /**
   * Relation between two normalized forms (for "related item seen" in GoLearn):
   * 'same' | 'inflection' (same lemma) | 'component' (German compound part) | 'none'.
   */
  relate(a: string, b: string): 'same' | 'inflection' | 'component' | 'none';
  /**
   * Script decoding of one written word, independent of any dictionary (optional: languages whose script needs no
   * decoding help do not implement it). Never guesses: low confidence / missing tone when the spelling is ambiguous.
   */
  decode?(surface: string): SyllableAnalysis[];
  /**
   * Decoding with a dictionary's pronunciation data as the authority (phonemic respelling and/or IPA): used for
   * words whose spelling does not follow the rules. Falls back to decode() when the data cannot be used.
   */
  decodeWithPronunciation?(surface: string, pron: { respelling?: string; ipa?: string }, sourceId?: string): SyllableAnalysis[];
  /** The writing-system items ('orth') a decoded word exercises, e.g. ["class:mid", "vowel:า", "mark:mai-tho", "rule:mid+mai-tho=falling"]. */
  orthFeatures?(syllables: SyllableAnalysis[]): string[];
  /** Plain-words label of one orth feature key, for the word sheet and the audit views. */
  describeOrthFeature?(feature: string): string;
  /**
   * Turn a dictionary's own grammatical labels for an inflected form ("first-person", "plural", "imperfect",
   * "subjunctive") into this adapter's morphological features. Unknown labels are ignored, never guessed.
   */
  morphFromTags?(tags: readonly string[]): Record<string, string>;
  /**
   * Turn a dictionary's own region and usage labels ("Honduras", "Central-America", "Spain", "with-voseo") into the
   * variety codes this adapter can label (`varieties`). Unknown labels are ignored, never guessed. The importer puts the
   * result on a dictionary reading only when the labels hold for the whole reading (every sense of the entry carries
   * them, or the form-of relation itself does), so that one regional sense does not mark a general word as regional.
   */
  varietiesFromTags?(tags: readonly string[]): string[];
  /**
   * The concept family this word belongs to, if the adapter knows one (Norwegian: jeg/eg). Optional; a language without families omits it.
   */
  family?(lemma: string, pos?: PartOfSpeech): ConceptFamily | undefined;
  /**
   * Morphological GENERATION (Linguistic Engine V2): the forms a lexeme takes, from this adapter's own rules and irregular
   * tables, as feature-keyed cells (`src/core/paradigm.ts`). `undefined` when the adapter cannot generate for this lemma
   * and part of speech (it is then the dictionary's table alone, or nothing). A language whose words do not inflect returns
   * `kind: 'none'` with the constructions to show instead. Generation is `generated` until the dictionary's table confirms a
   * cell; the merge with the dictionary happens outside the adapter (`mergeParadigm`).
   */
  paradigm?(lemma: string, pos: PartOfSpeech, hint?: { features?: Record<string, string>; surface?: string }): GeneratedParadigm | undefined;
  /**
   * Map the dictionary's inflection-table tags for one form ("accusative", "definite", "singular"; "first-person",
   * "present", "subjunctive") to this adapter's feature keys, for the dictionary half of a paradigm. Unknown tags are
   * ignored; a row whose tags name no feature maps to undefined (it is not placed in the table). `form` is the row's
   * written form, for a language whose tags alone cannot tell two rows apart (Hindi: the simple future and a construction).
   */
  featuresFromTableTags?(tags: readonly string[], pos: PartOfSpeech, form?: string): Record<string, string> | undefined;
  /**
   * The cells of a paradigm that the selected reading occupies: the adapter projects an analysed reading (whose values
   * may be unions such as "Fem,Masc", or lack a key the cells carry, or carry a variety) onto its own cell bundles.
   * Optional: without it the card splits union values itself (`cellsForSelection`) and falls back to matching the form.
   */
  cellsFor?(paradigm: Pick<Paradigm, 'cells' | 'kind' | 'pos'>, features: Record<string, string>, surface?: string): ParadigmCell[];
  /**
   * Alternative ways of cutting a selection into words, for a script without word spaces (Thai): the chosen cut first,
   * then the others the word list allows, each with its confidence share and basis. Optional.
   */
  segmentations?(text: string, context?: { before?: string; after?: string }): SegmentationAlternatives | undefined;
  /**
   * Contextual syntax (Linguistic Engine V2, Stage 4): shallow dependency relations between the words of one sentence,
   * from this adapter's rules over the readings `analyze` gave (`src/core/syntax.ts`). Every relation carries its basis and
   * the alternatives the rules could not rule out; a word the rules cannot attach gets none. Optional; a sentence the rules
   * do not model returns an analysis with few relations and a note, never a guess.
   */
  syntax?(tokens: RawToken[], analyses: AnalyzedToken[]): SyntaxAnalysis | undefined;
  /**
   * Order the readings of each token by its neighbours again, after the importer replaced the readings of some tokens
   * with a dictionary's. The importer calls it once per sentence; the replaced lists arrive as the dictionary gives them
   * (not yet ordered by context). The adapter does what `analyze` does, taking those lists as given: for its own tokens
   * it starts again from its context-free readings, so nothing depends on an earlier ordering. It may only move a
   * reading, lower a confidence and set `notes.context`: it never adds, removes or rewrites a reading, and never
   * touches a token whose `analyzer` is not in `analyzers` (an author's span, a reviewer's correction).
   * `given` (optional) names token indexes whose lists must be taken as given although the analyzer is the adapter's
   * own: the importer added a dictionary's readings of another lemma or part of speech BESIDE the adapter's (la marcha:
   * the word list has the noun, the dictionary also a form of marchar), and starting those tokens again would lose them.
   */
  refine?(tokens: RawToken[], analyzed: AnalyzedToken[], analyzers: ReadonlySet<string>, given?: ReadonlySet<number>): AnalyzedToken[];
  /**
   * Other headwords a dictionary may file this lemma under, most likely first (Spanish: a verb the source lists only as
   * pronominal, "arrepentir" → ["arrepentirse"]). The importer asks for them when the lemma itself has no entry of its
   * own; the reading keeps the adapter's lemma. Empty or absent = none.
   */
  lemmaVariants?(lemma: string, pos?: PartOfSpeech): string[];
  /** A plain-words line for a feature bundle ("first person plural, imperfect subjunctive"), for the word sheet. */
  describeMorph?(morph: Record<string, string>, pos?: PartOfSpeech): string;
  /** The varieties this adapter can label, keyed by code. */
  readonly varieties?: Readonly<Record<string, Variety>>;
  /** The adapter's own sources (hand word list, rule sets) with their honest review state, keyed by sourceId. */
  readonly sources?: Readonly<Record<string, AnalysisSourceInfo>>;
  /**
   * The word across the periods of the language (the card's "Variants" tab): for each period variety, the form(s) the
   * adapter's sources attest, or a plain statement that they attest none. Optional: a language without period varieties
   * omits it. Never invents a form (see VariantSet).
   */
  variants?(lemma: string, pos?: PartOfSpeech, surface?: string): VariantSet | undefined;
}

/** Options an engine may pass to `analyze` / `checkProduction`. All optional; an adapter may ignore them. */
export interface AnalyzeOptions {
  /** The variety the text is declared or believed to be in (a period variety for Hebrew/Greek, a region for Spanish). */
  varietyId?: string;
}

/**
 * One row of the "Variants" tab: the word in one period variety of the language.
 *   attested         a source names this form for this period
 *   same-as-lemma    the period uses the lemma unchanged (said explicitly, not left blank)
 *   not-in-sources   the adapter's sources say nothing about this period for this word — NOT a claim that the word did not exist
 *   not-yet-existing a source dates the word later than this period (a Modern coinage shown against Homeric)
 *   obsolete         a source marks the word as no longer used in this period
 */
export interface VariantForm {
  varietyId: string;
  label: string;
  forms: string[];
  gloss?: string;
  status: 'attested' | 'same-as-lemma' | 'not-in-sources' | 'not-yet-existing' | 'obsolete';
  /** Source ids that attest the row ('oshb', 'morphgnt', 'kaikki-grc', 'perseus-agdt', …); empty for not-in-sources. */
  sources: string[];
  note?: string;
  /** True on the row of the period the selected text itself is in. */
  current?: boolean;
}
export interface VariantSet { lemma: string; pos?: PartOfSpeech; rows: VariantForm[] }

/**
 * The decoding of one token, from the best source available: a decoding stored with the analysis (author-supplied),
 * else the dictionary pronunciation stored in the analysis notes (`respelling`, `ipa`), else the spelling rules.
 * Decodings are computed on demand and never stored per token by the importer (a novel has tens of thousands).
 * Empty when the language needs no decoding or the spelling cannot be decoded.
 */
export function decodeFor(
  adapter: Pick<LanguageAdapter, 'decode' | 'decodeWithPronunciation'>,
  surface: string,
  analysis?: { syllables?: SyllableAnalysis[]; notes?: Record<string, string | string[]> },
): SyllableAnalysis[] {
  if (analysis?.syllables?.length) return analysis.syllables;
  const respelling = typeof analysis?.notes?.respelling === 'string' ? analysis.notes.respelling : undefined;
  const ipa = typeof analysis?.notes?.ipa === 'string' ? analysis.notes.ipa : undefined;
  if ((respelling || ipa) && adapter.decodeWithPronunciation) {
    // the source of the pronunciation travels with it (analysis notes: `pronunciationSource`), so a reading is never anonymous
    const sourceId = typeof analysis?.notes?.pronunciationSource === 'string' ? analysis.notes.pronunciationSource : undefined;
    const out = adapter.decodeWithPronunciation(surface, { respelling, ipa }, sourceId);
    if (out.length) return out;
  }
  return adapter.decode ? adapter.decode(surface) : [];
}

export interface AdapterRegistry {
  get(lang: LanguageCode): LanguageAdapter;
  all(): LanguageAdapter[];
}
