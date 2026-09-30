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

export interface LanguageAdapter {
  readonly lang: LanguageCode;
  readonly name: string;
  readonly script: Script;
  readonly version: string; // bump when analysis changes (analysis provenance)

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
}

export interface AdapterRegistry {
  get(lang: LanguageCode): LanguageAdapter;
  all(): LanguageAdapter[];
}
