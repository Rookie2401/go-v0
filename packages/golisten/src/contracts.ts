/**
 * GoListen public contracts. GoListen is the shared pronunciation and phonological subsystem (docs/ecosystem/
 * GO-ECOSYSTEM-CHARTER.md): one engine, two uses, ordinary playback (GoLearn now) and structured listening
 * assessment (GoReview next). It is not an application.
 *
 * THE EVIDENCE-DIRECTION RULE. Audio that was generated from an already selected textual interpretation can never
 * validate that interpretation and never yields listening evidence: the machine said what the text said, so hearing it
 * tells nothing about whether the learner can recognise the sounds of the language (or whether the text was right).
 * Only a reviewed human recording that exists independently of the text can be listening evidence. Synthetic speech
 * (device or remote) is practice. Playback is exposure, never comprehension. `isIndependentEvidence` is the one place
 * the rule is written as code; `evidenceFor` in assessment.ts and the playback event helper both go through it.
 */
import type { PlaybackPayload } from '../../repository-contract/src';

export type PronunciationKind = 'word' | 'phrase' | 'sentence';
export type ProviderKind = 'recorded' | 'device' | 'remote';

export interface PronunciationRequest {
  languageId: string;
  varietyId?: string;
  /** A word, a phrase or a sentence. Never a passage. */
  text: string;
  kind: PronunciationKind;
  /** The sentence the word was met in. Informational only; GoListen does not send it anywhere. */
  context?: { sentence?: string };
  preferred?: ProviderKind;
  /** Playback rate, clamped to 0.5 to 1.5. */
  rate?: number;
  /** Ask for one specific voice (a `VoiceDescriptor.voiceId`). A voice of another language is refused. */
  voiceId?: string;
  /** Start playing as soon as the result is returned (default false: the caller calls `playback.play()`). */
  autoplay?: boolean;
}

export type Availability = 'available' | 'needs-consent' | 'needs-key' | 'unavailable';
export type QualityVerification = 'unverified' | 'machine-checked' | 'native-reviewed';

export interface VoiceDescriptor {
  voiceId: string;
  languageId: string;
  varietyId?: string;
  provider: ProviderKind;
  /** 'remote' = the text leaves the device (a speech service, or a browser voice that is not local). */
  execution: 'local' | 'remote';
  synthetic: boolean;
  licence: string;
  qualityVerification: QualityVerification;
  knownLimitations: string[];
  supports: PronunciationKind[];
  /** True only for a reviewed human recording prepared for listening assessment. Never true for synthetic speech. */
  suitableForAssessment: boolean;
  label: string;
}

export interface PronunciationProvenance {
  source: 'device-tts' | 'remote-tts' | 'recording';
  voiceId: string;
  providerId?: string;
  /** true: the audio was produced from the text (synthetic speech). false: a recording that exists independently. */
  generatedFromText: true | false;
  /** For a recording: whether a human reviewer has checked it against the text and the language. */
  reviewedRecording?: boolean;
  note: string;
}

/**
 * The evidence-direction rule as code. Only a human recording that was not generated from the text AND has been
 * reviewed can be independent listening evidence. Every synthetic path is false, whatever the voice's quality.
 */
export function isIndependentEvidence(p: PronunciationProvenance): boolean {
  return p.source === 'recording' && p.generatedFromText === false && p.reviewedRecording === true;
}

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'ended' | 'error';

export interface PlaybackHandle {
  play(): void;
  pause(): void;
  /** Stop and return to idle. */
  stop(): void;
  /** Hear it again from the start. Counts as a replay. */
  replay(): void;
  /** 0.5 to 1.5. A device voice takes the new rate at its next start; a recording takes it at once. */
  setRate(rate: number): void;
  readonly rate: number;
  readonly state: PlaybackState;
  /** Hearings beyond the first (replay(), or play() after the previous hearing was stopped or ended). */
  readonly replays: number;
  /** Called each time a hearing runs to its natural end. Returns an unsubscribe function. */
  onEnd(cb: () => void): () => void;
  /** Called when playback changes state, including asynchronous device speech errors. Returns an unsubscribe function. */
  onState?(cb: (state: PlaybackState) => void): () => void;
  /** The recording's length, or the measured length of the last completed hearing; unknown before then. */
  readonly durationMs?: number;
  /** Releases the audio (and any object URL this handle owns). */
  dispose(): void;
}

export interface PhoneticDetail {
  ipa?: string;
  respelling?: string;
  syllables?: string[];
  /** Index into `syllables` of the stressed syllable. */
  stress?: number;
  tones?: string[];
  notes: string[];
  /** Where this came from and how far to trust it. */
  source: string;
}

export type PronunciationFailure = 'no-voice' | 'wrong-language-voice' | 'no-consent' | 'provider-error' | 'unsupported-kind' | 'offline';

export type PronunciationResult =
  | { ok: true; voice: VoiceDescriptor; playback: PlaybackHandle; provenance: PronunciationProvenance; phonetic?: PhoneticDetail }
  | { ok: false; reason: PronunciationFailure; message: string; alternatives: string[] };

/** The only event GoListen produces for ordinary playback: exposure in the listening modality, never assessment. */
export interface PronunciationPlayedEvent {
  kind: 'PronunciationPlayed';
  payload: PlaybackPayload;
  /** Always 'none': hearing a word is exposure, not evidence of recognition (and synthetic speech is never evidence). */
  evidence: { quality: 'none'; assisted: false };
}

/* ---------------------------------------------------------------- assessment (GoReview) */

export interface AudioStimulus {
  stimulusId: string;
  languageId: string;
  kind: 'word' | 'sentence';
  itemIds: string[];
  voice: VoiceDescriptor;
  audio: { kind: 'recorded'; url: string } | { kind: 'device'; text: string } | { kind: 'remote'; url: string };
  /** The written form must not be on screen before the response. The stimulus carries text only where the device voice needs it to speak. */
  answerHidden: true;
  replaysAllowed: number;
  validity: { eligibleForEvidence: boolean; reason: string };
}

export interface StimulusRequest {
  languageId: string;
  varietyId?: string;
  kind: 'word' | 'sentence';
  /** The text to be heard (needed to find a matching recording, or to speak with a device or remote voice). */
  text: string;
  itemIds: string[];
  replaysAllowed?: number;
}

export interface ScoringMetadata {
  voice: 'synthetic' | 'recorded';
  hinted: boolean;
  replays: number;
  eligibleForEvidence: boolean;
}

export interface AssessmentSource {
  prepareStimulus(req: StimulusRequest): Promise<AudioStimulus | { unavailable: true; reason: string }>;
  playbackOf(stimulus: AudioStimulus): PlaybackHandle;
  scoringMetadata(stimulus: AudioStimulus, replaysUsed: number): ScoringMetadata;
}
