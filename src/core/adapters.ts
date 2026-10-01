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
import type { ErrorCategory, LanguageCode, PartOfSpeech, Script, TransformationRecord } from './model';
import type { RegisterTag, SyllableAnalysis } from './course';

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
  analyze(tokens: RawToken[]): AnalyzedToken[];
  detectPhrases(tokens: RawToken[], analyses: AnalyzedToken[]): PhraseCandidate[];
  detectPatterns(tokens: RawToken[], analyses: AnalyzedToken[]): PatternCandidate[];
  pronunciation(token: RawToken, analysis?: AnalyzedToken): PronunciationSupport;
  /** Deterministic, versioned. Handles numbers/abbreviations/verse markers; never transliterates. */
  speechNormalize(displayText: string, opts?: { isScripture?: boolean }): SpeechNormalizationResult;
  display: DisplayConventions;
  /** Rule-based checks on learner writing (GoTell). Empty array = nothing found, not "correct". */
  checkProduction(tokens: RawToken[], analyses: AnalyzedToken[], sentence: string): ErrorCandidate[];
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
  decodeWithPronunciation?(surface: string, pron: { respelling?: string; ipa?: string }): SyllableAnalysis[];
  /** The writing-system items ('orth') a decoded word exercises, e.g. ["class:mid", "vowel:า", "mark:mai-tho", "rule:mid+mai-tho=falling"]. */
  orthFeatures?(syllables: SyllableAnalysis[]): string[];
  /** Plain-words label of one orth feature key, for the word sheet and the audit views. */
  describeOrthFeature?(feature: string): string;
}

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
    const out = adapter.decodeWithPronunciation(surface, { respelling, ipa });
    if (out.length) return out;
  }
  return adapter.decode ? adapter.decode(surface) : [];
}

export interface AdapterRegistry {
  get(lang: LanguageCode): LanguageAdapter;
  all(): LanguageAdapter[];
}
