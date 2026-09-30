/**
 * GoListen service contract. Implementation in src/golisten.
 * Reports listening evidence to GoLearn through events; keeps no mastery score of its own.
 */
import type { AudioAlignment, AudioAsset, AudioJob, AudioManifest, AudioSegment, AudioValidation, LanguageCode, VoiceConfig } from '../model';

export interface Voice {
  id: string;
  name: string;
  lang: LanguageCode;
  locale: string;
  gender?: 'female' | 'male' | 'neutral';
}

export interface ProviderCapabilities {
  ssml: boolean;
  wordBoundaries: boolean; // trustworthy word-boundary marks
  phonemeOverrides: boolean;
  streaming: boolean;
  maxChars: number;
  outputFormats: string[]; // mimes
}

export interface SynthesisRequest {
  text: string; // speech-normalized text (never display text with verse numbers)
  lang: LanguageCode;
  locale: string;
  voiceId: string;
  ssml?: string;
  format: string; // mime
  settings: Record<string, string | number | boolean>;
}

export interface WordMark {
  /** Character offsets into the request text. */
  charStart: number;
  charEnd: number;
  startMs: number;
  endMs: number;
}

export interface SynthesisResult {
  bytes: Uint8Array;
  mime: string;
  sampleRate: number;
  channels: number;
  durationMs: number;
  /** Only when the provider really emits them; never synthesized by the adapter. */
  wordMarks?: WordMark[];
  engine?: string;
  /** The locale actually used (fallback recorded honestly). */
  actualLocale: string;
}

export interface TtsProvider {
  readonly id: string;
  readonly version: string;
  capabilities(): ProviderCapabilities;
  listVoices(lang: LanguageCode): Promise<Voice[]>;
  synthesize(req: SynthesisRequest): Promise<SynthesisResult>;
}

export interface EnsureAudioOptions {
  voiceConfigId?: string; // default: course default voice for the text's language
  sentenceIds?: string[]; // subset (e.g. a passage); default: whole text
  /** Run queued jobs now (tests/probes) rather than leaving them for the worker. */
  runNow?: boolean;
}

export interface EnsureAudioResult {
  manifest: AudioManifest;
  created: number; // segments newly generated
  reused: number; // segments served from cache
  failed: number;
}

export interface GoListen {
  registerProvider(p: TtsProvider): void;
  providers(): TtsProvider[];
  /** Resolve the voice for a language/course (explicit configuration, never scattered defaults). */
  resolveVoice(lang: LanguageCode, courseId?: string): Promise<VoiceConfig>;

  /** Idempotent: computes cache keys, creates missing segments/jobs, optionally runs them, builds the manifest. */
  ensureAudio(textId: string, opts?: EnsureAudioOptions): Promise<EnsureAudioResult>;
  /** Audio for an arbitrary accepted sentence (testimony). Returns a ready or pending segment. */
  ensureSentenceAudio(args: { lang: LanguageCode; text: string; ownerId: string; contextId: string; voiceConfigId?: string; runNow?: boolean }): Promise<AudioSegment>;
  /** Process queued/retryable jobs. Returns number processed. */
  runJobs(opts?: { max?: number; now?: string }): Promise<number>;

  getManifest(textId: string, voiceConfigId?: string): Promise<AudioManifest | undefined>;
  getSegment(segmentId: string): Promise<AudioSegment | undefined>;
  getAsset(assetId: string): Promise<AudioAsset | undefined>;
  assetUrl(assetId: string): Promise<string | undefined>;
  alignments(segmentId: string): Promise<AudioAlignment[]>;
  /** Diagnostics for the admin panel. */
  diagnostics(textId?: string): Promise<GoListenDiagnostics>;
  jobs(status?: AudioJob['status']): Promise<AudioJob[]>;
}

export interface GoListenDiagnostics {
  segments: Array<{
    segmentId: string;
    status: AudioSegment['status'];
    providerId?: string;
    voiceId?: string;
    requestedLocale?: string;
    actualLocale?: string;
    overridesUsed: string[];
    alignmentMethods: string[];
    minAlignmentConfidence?: number;
    validation?: AudioValidation;
    lastError?: string;
    contentVersion: number;
  }>;
  failedJobs: number;
  deadJobs: number;
}

/**
 * Player contract implemented by the UI on top of HTMLAudioElement (preservesPitch = true) or WebAudio.
 * Speed changes must preserve pitch — naive resampling is not acceptable.
 */
export interface PlayerState {
  manifestId?: string;
  segmentIndex: number;
  playing: boolean;
  speed: number; // 0.7 … 1.25 (UI enforces)
  transcriptMode: 'visible' | 'hidden' | 'reveal-current' | 'reveal-after';
  loop: { unit: 'none' | 'sentence' | 'phrase'; alignmentId?: string };
}
