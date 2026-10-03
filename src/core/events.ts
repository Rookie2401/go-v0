/**
 * Domain events — the ONLY way surfaces and engines change learner state.
 *
 * UI components emit events through `EventBus.emit`; GoLearn subscribes and folds them into
 * LearnerItemState. GoListen and GoTell also emit here (listening evidence, production evidence)
 * rather than maintaining their own mastery scores.
 *
 * Every event has a `dedupeKey`. The bus drops an event whose key was already appended, so a
 * rerendered component cannot count an encounter twice. A `session` string (e.g. one per reading
 * sitting) scopes dedupe for view events; deliberate learner actions (tap, reveal, accept) use a
 * unique key per action.
 */
import type { AssistanceLevel, AudioSourceType, ItemKind, LanguageCode, Modality, ProductionKind } from './model';
import type { AssistanceStep, SelectionExplanation, SemanticGoal, TaskFamily, TellAttemptRecord } from './contracts/gotell-practice';

export type Surface = 'corpus' | 'scripture' | 'testimony' | 'listen' | 'home';

interface Base {
  id: string;
  userId: string;
  lang: LanguageCode;
  at: string; // ISO
  surface: Surface;
  session: string;
  dedupeKey: string;
}

// ── reading ──
/** The text was opened (or shown in a preview/preparation panel: mode 'preview'). Displayed ≠ exposure: never evidence. */
export interface TextViewed extends Base { type: 'TextViewed'; textId: string; mode?: 'open' | 'preview'; contentVersion?: number }
/** The learner had this sentence on screen long enough to read it (the reader decides, not the DOM). */
/**
 * READING EXPOSURE: emitted only when the sentence stayed in view, in the reader itself (not a preview or
 * preparation panel), in a visible tab, for a dwell proportional to its length. Still not "read" and not
 * comprehension. `contentVersion` pins the evidence to the version encountered.
 */
export interface SentenceViewed extends Base { type: 'SentenceViewed'; textId: string; sentenceId: string; tokenIds: string[]; dwellMs?: number; contentVersion?: number }
export interface TokenHelpOpened extends Base { type: 'TokenHelpOpened'; sentenceId: string; tokenId: string; itemId: string; level: AssistanceLevel }
export interface PhraseHelpOpened extends Base { type: 'PhraseHelpOpened'; sentenceId: string; phraseOccurrenceId: string; phraseId: string }
export interface GrammarHelpOpened extends Base { type: 'GrammarHelpOpened'; sentenceId: string; patternId: string; tokenIds: string[] }
export interface SentenceExplanationRevealed extends Base { type: 'SentenceExplanationRevealed'; sentenceId: string }
export interface EnglishRescueRevealed extends Base { type: 'EnglishRescueRevealed'; textId: string; sentenceIds: string[]; scope: 'sentence' | 'verse' | 'parallel' }
export interface SentenceReread extends Base { type: 'SentenceReread'; sentenceId: string }
/**
 * The learner opened the script decoding of a word (syllables, consonant class, vowel length, tone rule), or — only
 * where the stage still allows it — the romanization rescue. This is help with the written form: it counts as
 * item-targeted help for the form (`itemId`) and for each writing-system item in `features` (ids.orth(lang, feature)).
 */
export interface DecodingRevealed extends Base { type: 'DecodingRevealed'; sentenceId: string; tokenId: string; itemId: string; features: string[]; romanization: boolean }
/**
 * A note attached to the text was opened. Cultural / regional / register / literary / historical notes are context,
 * not language help: recorded, no effect on evidence. A 'clause-structure' note is a sentence explanation: the UI
 * emits SentenceExplanationRevealed for it as well.
 */
export interface NoteOpened extends Base { type: 'NoteOpened'; textId: string; noteId: string; sentenceId?: string; kind: string }
/**
 * The learner says how much he understood. This — not viewing, completing or playing — is what demonstrates
 * comprehension. Only degree 'all' is item-level evidence, and only for listed sentences where no sentence
 * explanation / English rescue was used; 'most' | 'some' | 'little' inform recommendations (reread) only.
 */
export interface ComprehensionReported extends Base {
  type: 'ComprehensionReported';
  textId: string;
  sentenceIds: string[];
  modality: 'reading' | 'listening';
  scope: 'sentence' | 'text';
  degree: 'all' | 'most' | 'some' | 'little';
  contentVersion?: number;
}
/** EXPLICIT completion: the learner pressed "I have finished reading". Never inferred from views. */
export interface TextCompleted extends Base { type: 'TextCompleted'; textId: string; contentVersion?: number }
export interface PassageCompleted extends Base { type: 'PassageCompleted'; textId: string; sentenceIds: string[]; mode: Modality }
export interface ItemMarked extends Base { type: 'ItemMarked'; itemId: string; itemKind: ItemKind; mark: 'known' | 'unknown' | 'clear' }
export interface FormSearched extends Base { type: 'FormSearched'; query: string; itemId?: string }
/** Emitted by GoLearn itself when a phrase/pattern occurrence is covered by a SentenceViewed. */
export interface PhraseEncountered extends Base { type: 'PhraseEncountered'; sentenceId: string; phraseId: string; phraseOccurrenceId: string; modality: Modality; assistance: AssistanceLevel }

// ── listening (GoListen emits) ──
interface Listen extends Base {
  textId: string; segmentId: string; sentenceIds: string[]; speed: number; transcriptVisible: boolean;
  /** The asset actually played and whether it is reviewed real speech. Absent on legacy events (then GoLearn
   *  resolves segment → asset). Non-speech (fixture) or unreviewed audio NEVER yields learner evidence. */
  assetId?: string;
  speech?: boolean;
  voiceReviewed?: boolean;
  /** Immutable playback facts snapshotted when emitted; historical evidence never changes with later edits. */
  sourceType?: AudioSourceType;
  audioKind?: 'human' | 'synthetic';
  qualityState?: 'unreviewed' | 'machine_checked' | 'human_reviewed' | 'approved' | 'rejected';
  variety?: string;
  rightsId?: string;
  rightsApproved?: boolean;
  exactTextBound?: boolean;
  textSha256?: string;
  contentVersion?: number;
  releaseId?: string;
  editionId?: string;
  narratorOrVoiceId?: string;
  locale?: string;
  /** Fraction of the required audio range observed as audible monotonic playback in this pass. */
  heardCoverageRatio?: number;
  audibleCoverageVersion?: 'observed-playback@1';
}
export interface AudioPlayed extends Listen { type: 'AudioPlayed' }
export interface AudioSegmentCompleted extends Listen { type: 'AudioSegmentCompleted'; replayCount: number; revealedTranscript: boolean; revealedTranslation: boolean }
export interface AudioReplayed extends Listen { type: 'AudioReplayed'; count: number }
export interface PhraseReplayed extends Listen { type: 'PhraseReplayed'; alignmentId: string; unitId: string }
export interface AudioSeeked extends Base { type: 'AudioSeeked'; textId: string; fromSegmentId?: string; toSegmentId: string }
export interface PlaybackSpeedChanged extends Base { type: 'PlaybackSpeedChanged'; textId: string; from: number; to: number }
export interface TranscriptRevealed extends Listen { type: 'TranscriptRevealed' }
export interface AudioAbandoned extends Listen { type: 'AudioAbandoned'; positionMs: number }
/** Durable resume checkpoint. This is player state only and is never folded into learner/mastery evidence. */
export interface ListeningPositionSaved extends Base {
  type: 'ListeningPositionSaved'; textId: string; manifestId: string; segmentId: string; positionMs: number;
}
/** A test-only route over a curated protected text; submissions are self-report unless separately validated. */
export interface ListeningAssessmentStarted extends Base {
  type: 'ListeningAssessmentStarted'; attemptId: string; textId: string; manifestId: string; contentVersion: number; sentenceIds: string[];
  transcriptHidden: true; speed: 1; preview: false;
}
export interface ListeningAssessmentSubmitted extends Base {
  type: 'ListeningAssessmentSubmitted'; attemptId: string; textId: string; report: 'understood' | 'partly-understood' | 'not-understood'; basis: 'learner-self-report';
  validity: 'uncontaminated' | 'contaminated' | 'not-completed'; contaminationReasons: string[];
}
export interface ShadowingAttempt extends Listen { type: 'ShadowingAttempt'; attempt: number }
export interface UserRecordingCreated extends Base { type: 'UserRecordingCreated'; recordingId: string; targetText: string; sentenceId?: string; testimonyRevisionId?: string }

// ── production (GoTell emits) ──
export interface TestimonyTextSubmitted extends Base { type: 'TestimonyTextSubmitted'; testimonyId: string; draftHash: string; sentenceCount: number }
export interface TestimonyRevisionAccepted extends Base { type: 'TestimonyRevisionAccepted'; testimonyId: string; revisionId: string; number: number }
export interface GoTellSuggestionShown extends Base { type: 'GoTellSuggestionShown'; suggestionId: string; kind: 'repair' | 'recombination' | 'expansion' }
export interface GoTellSuggestionAccepted extends Base { type: 'GoTellSuggestionAccepted'; suggestionId: string; kind: 'repair' | 'recombination' | 'expansion'; itemIds: string[] }
export interface GoTellSuggestionRejected extends Base { type: 'GoTellSuggestionRejected'; suggestionId: string }
export interface GoTellSuggestionEdited extends Base { type: 'GoTellSuggestionEdited'; suggestionId: string; finalText: string }
/**
 * Productive evidence for one item, classified by how it came about. `independent` is the strongest,
 * `copied` the weakest. GoLearn folds these into the writing (or speaking) dimension.
 */
export interface ProductionRecorded extends Base {
  type: 'ProductionRecorded';
  itemId: string;
  itemKind: ItemKind;
  kind: ProductionKind;
  modality: 'writing' | 'speaking';
  revisionId?: string;
  sentenceText: string;
  /** Hash of the sentence text: evidence for (item, sentenceHash) is recorded at most once, ever. */
  sentenceHash?: string;
  suggestionId?: string;
}
/** Convenience alias emitted for each independently produced item. */
export interface IndependentProductionDetected extends Base { type: 'IndependentProductionDetected'; itemIds: string[]; revisionId: string }

// ── GoTell practice (the productive engine). Append-only: productive state is a pure function of these. ──
/** The learner wrote down a meaning he wants to be able to say. A later definition with the same goalId is a new version. */
export interface TellGoalDefined extends Base { type: 'TellGoalDefined'; goal: SemanticGoal }
/** A practice task was offered, with the scheduler's reasons as they were at that moment. */
export interface TellTaskPresented extends Base {
  type: 'TellTaskPresented'; taskId: string; goalId: string; goalVersion: number; family: TaskFamily; prompt: string;
  retellSource?: { textId: string; title: string }; selection: SelectionExplanation;
}
/** One intervention (hint, cue, frame, correction, model) exactly as shown. */
export interface TellInterventionShown extends Base { type: 'TellInterventionShown'; taskId: string; goalId: string; step: AssistanceStep }
/** One attempt, immutable: the text as typed, what was shown before it, how it was judged, and the state change. */
export interface TellAttemptSubmitted extends Base { type: 'TellAttemptSubmitted'; record: TellAttemptRecord }
/** The task ended: said successfully, reproduced after the model, or left. */
export interface TellTaskClosed extends Base { type: 'TellTaskClosed'; taskId: string; goalId: string; outcome: 'success' | 'model-reproduced' | 'abandoned'; finalAttemptId?: string }

export type DomainEvent =
  | TextViewed | SentenceViewed | TokenHelpOpened | PhraseHelpOpened | GrammarHelpOpened
  | SentenceExplanationRevealed | EnglishRescueRevealed | SentenceReread | DecodingRevealed | NoteOpened | ComprehensionReported | TextCompleted | PassageCompleted
  | ItemMarked | FormSearched | PhraseEncountered
  | AudioPlayed | AudioSegmentCompleted | AudioReplayed | PhraseReplayed | AudioSeeked | PlaybackSpeedChanged
  | TranscriptRevealed | AudioAbandoned | ListeningPositionSaved | ListeningAssessmentStarted | ListeningAssessmentSubmitted | ShadowingAttempt | UserRecordingCreated
  | TestimonyTextSubmitted | TestimonyRevisionAccepted | GoTellSuggestionShown | GoTellSuggestionAccepted
  | GoTellSuggestionRejected | GoTellSuggestionEdited | ProductionRecorded | IndependentProductionDetected
  | TellGoalDefined | TellTaskPresented | TellInterventionShown | TellAttemptSubmitted | TellTaskClosed;

export type EventType = DomainEvent['type'];
export type EventOf<T extends EventType> = Extract<DomainEvent, { type: T }>;

/** Fields the emitter must supply; the bus fills id/at. */
export type EventInput<E extends DomainEvent = DomainEvent> = Omit<E, 'id' | 'at'> & { at?: string };

export type EventHandler = (event: DomainEvent) => Promise<void> | void;

export interface EventBus {
  /** Appends the event (unless its dedupeKey was seen) and notifies subscribers in order. Returns the stored event or null if deduped. */
  emit<E extends DomainEvent>(input: EventInput<E>): Promise<E | null>;
  subscribe(handler: EventHandler, opts?: { types?: EventType[] }): () => void;
  /** Read the append-only log (for replay / recomputation of derived state). */
  history(filter?: { userId?: string; types?: EventType[]; since?: string }): Promise<DomainEvent[]>;
}
