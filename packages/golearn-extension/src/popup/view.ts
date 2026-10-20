/**
 * What the card shows besides the parsed `CardModel`: the pieces that arrive LATER and never block the card (the
 * dictionary gloss, the learner-model consultation, the pack's explanations, the pronunciation state), and the
 * callbacks through which the card reports what the learner did. Pure data and types; no DOM.
 */
import type { Paradigm, SegmentationAlternatives } from '../../../../src/core/paradigm';
import type { EtymologyView, PronunciationView, RelationsView, WordStructureView } from '../content/enrich';
import type { KnowledgeLevel } from '../../../repository-contract/src/knowledge-levels';
import type { ConstructionExplanation, ExplanationDepth, FeatureExplanation, SelfMark, SourceLink } from '../protocol';

/**
 * The sections "Go deeper" opens, all at once, in this order: Form (`morphology`; its ANALYSIS dropdown holds Grammar, recorded as `grammar` on its first opening), Syntax (`phrase-syntax`), All forms (the paradigm),
 * Meanings, Origin, Word structure, Sentence (the word-by-word English rescue). "About this analysis" follows them and is not a layer: it records nothing.
 * There is no Sound layer any more: the speaker beside the word replaces it.
 * `variants` is the "Variants" pill of a language with period varieties (Hebrew, Greek): the word across the periods, its own panel to the
 * right of "See full sentence", exclusive with the other two; recorded once on its first opening.
 */
export type LayerName = 'morphology' | 'grammar' | 'phrase-syntax' | 'forms' | 'meaning' | 'origin' | 'structure' | 'sentence' | 'variants';

/** The order "Go deeper" shows (and records) the layers in. */
export const LAYER_ORDER: readonly LayerName[] = ['morphology', 'phrase-syntax', 'forms', 'meaning', 'origin', 'structure'];

/** Level 2 of the card: what the dictionary's full record and the analyser's generation give, with field states; arrives after the card, never blocks it. */
export interface EnrichmentView {
  /** idle: not asked (no dictionary service); loading: asked; ready: answered (fields may still be unknown); unavailable: could not be asked, with why. */
  state: 'idle' | 'loading' | 'ready' | 'unavailable';
  paradigm?: Paradigm;
  /** Feature keys (`featureKey`) of the cells the selected form occupies, as the adapter projects the reading; the card marks them. */
  selected?: string[];
  /** Alternative cuts of the selection into words (a script without word spaces). */
  segmentations?: SegmentationAlternatives;
  etymology?: EtymologyView;
  /** The word's parts, what it derives from and its family (Stage 5), each with its source and a status. */
  structure?: WordStructureView;
  pronunciation?: PronunciationView;
  /** The dictionary's romanization of each form of its table (Hindi), by form; the All forms cells show it under the form. */
  formRoman?: Record<string, string>;
  relations?: RelationsView;
  senses?: Array<{ gloss: string; tags: string[]; examples: string[] }>;
  attribution?: string;
  message?: string;
}

export interface GlossView {
  /** idle: nothing asked (no dictionary service); loading: asked, not answered; ready: senses arrived; none: asked, nothing found; error: could not ask. */
  state: 'idle' | 'loading' | 'ready' | 'none' | 'error';
  senses: string[];
  attribution?: string;
  message?: string;
}

export type RecognitionLevel = 'low' | 'medium' | 'high';

export interface ProfileView {
  state: 'idle' | 'loading' | 'ready' | 'not-connected' | 'unavailable';
  /** How many times the learner has met the word (the exposure observations of the unit). */
  met?: number;
  /** Reading recognition of the word: a level with the estimate's confidence, or not assessed. */
  recognition?: { level: RecognitionLevel; confidence: number } | 'not-assessed';
  /** Ids of constructions the form realizes where the learner's grammatical understanding is weak (negative > positive). */
  weak: string[];
  stale?: boolean;
  /** Why the model could not be consulted (state 'unavailable'). */
  reason?: 'needs-sign-in' | 'offline' | 'error';
  /** The learner's latest own mark on the word, from the model's rows, as a level (an older mark is already translated). */
  selfMark?: SelfMark;
  /** The word's knowledge level: the learner's own mark, else the engine's, else the page's reading of the rows (`src/active/levels.ts`). */
  level?: KnowledgeLevel;
  /** How many times the learner has met the word before this lookup: the larger of the lemma row's and the form row's observations (summed over the dimensions). */
  encounters?: number;
}

export interface ExplainView {
  state: 'idle' | 'loading' | 'ready' | 'none';
  features: FeatureExplanation[];
  constructions: ConstructionExplanation[];
}

/** An explicitly requested, temporary sentence translation. The original word-by-word view remains separate. */
export interface SentenceTranslationView {
  state: 'unavailable' | 'idle' | 'loading' | 'ready' | 'error';
  naturalText?: string;
  /** Reference translations are sourced and scoped differently from model output. */
  origin?: 'reference' | 'machine';
  attribution?: string;
  generated?: boolean;
  reviewed?: boolean;
  sourceLanguage?: string;
  sourceDialect?: string;
  sourceConfidence?: number;
  sourceBasis?: string;
  message?: string;
  providerId?: string;
  sourceUncertaintyNotes?: string[];
  modelDownload?: 'not-needed' | 'may-start';
  processingMode?: 'local' | 'remote' | 'mixed' | 'unknown';
}

export type CorrectionState = { state: 'idle' } | { state: 'sending' } | { state: 'sent' | 'saved-locally' | 'error'; message: string };

export interface CardView {
  /** Language of the enrolment, as a learner-facing name ("Albanian"). */
  languageName: string;
  pronunciationContext?: { readerId?: string; varietyId?: string; kind?: 'word' | 'phrase' | 'sentence' };
  /** Transient reader context for an explicit sentence playback action; never stored in events. */
  pronunciationSentence?: string;
  depth: ExplanationDepth;
  depthOrigin?: string;
  gloss: GlossView;
  profile: ProfileView;
  explain: ExplainView;
  saved: boolean;
  /** The learner's own mark on this word, when they made one (one of the six levels). */
  rated?: SelfMark;
  /** Where the card's information came from (the "view sources" list); the worker builds the links. */
  sources?: SourceLink[];
  correction: CorrectionState;
  enrichment: EnrichmentView;
  sentenceTranslation: SentenceTranslationView;
}

export const initialView = (languageName: string): CardView => ({
  languageName, depth: 'brief',
  gloss: { state: 'idle', senses: [] },
  profile: { state: 'idle', weak: [] },
  explain: { state: 'idle', features: [], constructions: [] },
  saved: false,
  correction: { state: 'idle' },
  enrichment: { state: 'idle' },
  sentenceTranslation: { state: 'idle' },
});

export interface PlayOutcome { ok: true; voice: 'synthetic' | 'recorded'; voiceId?: string; repeated: boolean }
export interface CorrectionInput { lemma: string; pos?: string; fromAlternative: boolean }

/** What the card reports. Every callback may be omitted (a card with no callbacks just displays). */
export interface CardActions {
  /** A layer was opened by "Go deeper" (each opening, one call per layer; the recorder decides what counts as a repeat). */
  onLayer?(layer: LayerName): void;
  /** A pronunciation was played. */
  onPronounced?(p: PlayOutcome): void;
  /** The learner said how well they know the word (one of the six levels). */
  onRate?(mark: SelfMark): void;
  /** "Report": the learner chose an alternative reading or typed a lemma. */
  onCorrect?(c: CorrectionInput): void;
  /** The learner explicitly asked for the visible sentence to be translated into natural English. */
  onTranslateSentence?(): void;
}

// ───────────────────────────── pronunciation port ─────────────────────────────

export interface PronounceAvailability { available: boolean; note: string }
export type PlayResult = { ok: true; voice: 'synthetic' | 'recorded'; voiceId?: string } | { ok: false; message: string };

/** How the card pronounces. The real one wraps GoListen's device provider (content/voice.ts); tests pass fakes. */
export interface Pronouncer {
  availability(languageId: string): PronounceAvailability | Promise<PronounceAvailability>;
  play(text: string, languageId: string, context?: { readerId?: string; varietyId?: string; kind?: 'word' | 'phrase' | 'sentence' }): PlayResult | Promise<PlayResult>;
  stop?(): void;
  /** The shared player reports delayed browser failures as well as normal completion. */
  onPlaybackState?(cb: (state: 'idle' | 'playing' | 'paused' | 'ended' | 'error') => void): () => void;
  /** Practice speed; device voices apply this at the next start. */
  setRate?(rate: number): void;
  /** Voices may arrive after the page loaded (Chrome fills its list lazily). */
  onChange?(cb: () => void): () => void;
}
