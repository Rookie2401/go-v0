/**
 * What the card shows besides the parsed `CardModel`: the pieces that arrive LATER and never block the card (the
 * dictionary gloss, the learner-model consultation, the pack's explanations, the pronunciation state), and the
 * callbacks through which the card reports what the learner did. Pure data and types; no DOM.
 */
import type { Paradigm } from '../../../../src/core/paradigm';
import type { EtymologyView, PronunciationView, RelationsView } from '../content/enrich';
import type { ConstructionExplanation, ExplanationDepth, FeatureExplanation, SelfMark } from '../protocol';

/** The first four open at once; the last four are the deeper sections (Linguistic Engine V2): the paradigm, every sense, the origin, the sound. */
export type LayerName = 'morphology' | 'phrase-syntax' | 'grammar' | 'sentence' | 'forms' | 'meaning' | 'origin' | 'sound';

/** Level 2 of the card: what the dictionary's full record and the analyser's generation give, with field states; arrives after the card, never blocks it. */
export interface EnrichmentView {
  /** idle: not asked (no dictionary service); loading: asked; ready: answered (fields may still be unknown); unavailable: could not be asked, with why. */
  state: 'idle' | 'loading' | 'ready' | 'unavailable';
  paradigm?: Paradigm;
  etymology?: EtymologyView;
  pronunciation?: PronunciationView;
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
  /** The learner's latest own mark on the word, from the model's rows. */
  selfMark?: SelfMark;
}

export interface ExplainView {
  state: 'idle' | 'loading' | 'ready' | 'none';
  features: FeatureExplanation[];
  constructions: ConstructionExplanation[];
}

export type CorrectionState = { state: 'idle' } | { state: 'sending' } | { state: 'sent' | 'saved-locally' | 'error'; message: string };

export interface CardView {
  /** Language of the enrolment, as a learner-facing name ("Albanian"). */
  languageName: string;
  depth: ExplanationDepth;
  depthOrigin?: string;
  gloss: GlossView;
  profile: ProfileView;
  explain: ExplainView;
  saved: boolean;
  /** The learner's own mark on this word, when they made one ("New to me" / "I recognise it" / "I can use it"). */
  rated?: SelfMark;
  correction: CorrectionState;
  enrichment: EnrichmentView;
}

export const initialView = (languageName: string): CardView => ({
  languageName, depth: 'brief',
  gloss: { state: 'idle', senses: [] },
  profile: { state: 'idle', weak: [] },
  explain: { state: 'idle', features: [], constructions: [] },
  saved: false,
  correction: { state: 'idle' },
  enrichment: { state: 'idle' },
});

export interface PlayOutcome { ok: true; voice: 'synthetic' | 'recorded'; voiceId?: string; repeated: boolean }
export interface CorrectionInput { lemma: string; pos?: string; fromAlternative: boolean }

/** What the card reports. Every callback may be omitted (a card with no callbacks just displays). */
export interface CardActions {
  /** A layer was opened (each opening; the recorder decides what counts as a repeat). */
  onLayer?(layer: LayerName): void;
  /** A pronunciation was played. */
  onPronounced?(p: PlayOutcome): void;
  /** "Review this". */
  onSave?(): void;
  /** The learner said how well they know the word. */
  onRate?(mark: SelfMark): void;
  /** "This analysis is wrong": the learner chose an alternative reading or typed a lemma. */
  onCorrect?(c: CorrectionInput): void;
}

// ───────────────────────────── pronunciation port ─────────────────────────────

export interface PronounceAvailability { available: boolean; note: string }
export type PlayResult = { ok: true; voice: 'synthetic' | 'recorded'; voiceId?: string } | { ok: false; message: string };

/** How the card pronounces. The real one wraps GoListen's device provider (content/voice.ts); tests pass fakes. */
export interface Pronouncer {
  availability(languageId: string): PronounceAvailability | Promise<PronounceAvailability>;
  play(text: string, languageId: string): PlayResult | Promise<PlayResult>;
  stop?(): void;
  /** Voices may arrive after the page loaded (Chrome fills its list lazily). */
  onChange?(cb: () => void): () => void;
}
