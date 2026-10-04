/**
 * GoListen service contract. Implementation in src/golisten.
 * Reports listening evidence to GoLearn through events; keeps no mastery score of its own.
 */
import type { AudioAlignment, AudioAsset, AudioJob, AudioManifest, AudioRightsRecord, AudioSegment, AudioValidation, LanguageCode, VoiceConfig } from '../model';

/** User-supplied WAV + provenance record. The importer verifies every field against live canonical text. */
export interface AudioImportManifest {
  id: string;
  textId: string;
  contentVersion: number;
  /** SHA-256 of JSON.stringify({textId,contentVersion,sentences:[[id,text],...]}) in sentence order. */
  textSha256: string;
  /** Must be `${textId}@${contentVersion}`; Bible imports also require the exact selected edition. */
  releaseId: string;
  editionId?: string;
  lang: LanguageCode;
  locale: string;
  narrator: string;
  variety?: string;
  kind: 'human' | 'synthetic';
  syntheticProvider?: { id: string; terms: string; retention: 'none' | 'transient' | 'stored' };
  recording: { owner: string; basis: string; license?: string; attribution?: string };
  performance: { performer: string; permission: string };
  rights: Omit<AudioRightsRecord, 'id' | 'recordingOwner' | 'recordingBasis' | 'recordingLicense' | 'performanceOwner' | 'performancePermission' | 'attribution' | 'reviewedAt' | 'providerId' | 'providerTerms'>;
  /** Explicitly accepted terms for provider use of text; mandatory for synthetic imports. */
  textDerivative?: 'allowed' | 'denied';
  qualityState: 'unreviewed' | 'machine_checked' | 'human_reviewed' | 'approved' | 'rejected';
  coverage: Array<{ sentenceId: string; startMs: number; endMs: number; sourceStart?: number; sourceEnd?: number; reviewState: 'checked' | 'reviewed' }>;
}

export interface AudioImportResult { manifest: AudioManifest; asset: AudioAsset; imported: number; reused: boolean }

/**
 * Who is vouching for an imported recording.
 *  - 'learner': a recording a learner added on this device (the /listen upload form). Everything in the manifest is the
 *    uploader's own statement. The recording plays, but its quality state is capped at 'machine_checked', its voice stays
 *    unreviewed, and no review is stamped: it can never be listening evidence.
 *  - 'curated': scripts and course authoring (not reachable from the UI). A review (qualityState human_reviewed / approved)
 *    is a fact a named person establishes, so a non-empty `reviewer` is required and is recorded with the review time.
 */
export type ImportOrigin = 'learner' | 'curated';

/** The import arguments: the trust argument is mandatory and explicit. */
export interface ImportRecordingArgs { manifest: AudioImportManifest; bytes: Uint8Array; origin: ImportOrigin; reviewer?: string }

/**
 * What an importer DECLARED versus what was established, kept per asset in the `meta` table under
 * `golisten-import:<assetId>` (JSON). `declared*` are claims in the manifest, never checked by the app.
 */
export interface ImportRecord {
  assetId: string;
  manifestId: string;
  origin: ImportOrigin;
  declaredKind: 'human' | 'synthetic';
  declaredQualityState: AudioImportManifest['qualityState'];
  declaredRightsStatus: AudioRightsRecord['status'];
  /** Only for a curated review: the named person and the time. */
  reviewer?: string;
  reviewedAt?: string;
  importedAt: string;
}
export interface OfflineAudioPackage { asset: AudioAsset; bytes: Uint8Array; rights: AudioRightsRecord; textBinding: NonNullable<AudioAsset['textBinding']>; alignments: AudioAlignment[] }
export interface AudioGenerationAuthorization { rights: AudioRightsRecord; textBinding: NonNullable<AudioAsset['textBinding']> }

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

export interface ProviderAvailability {
  /**
   * Playback of SOME kind is possible. From GoListen.availability() in preview mode this can be the development
   * fixture, which is placeholder sound and not speech: a caller that means "real speech" must read `realSpeech`.
   */
  available: boolean;
  /**
   * GoListen.availability() only: a real speech provider is usable right now. Never true for a fixture. When false
   * while `available` is true, only placeholder playback exists, and `realSpeechReason` / `realSpeechDetail` say why
   * real speech is not available (so the missing-configuration guidance stays accurate).
   */
  realSpeech?: boolean;
  realSpeechReason?: 'no-provider' | 'missing-credentials' | 'provider-error' | 'offline';
  realSpeechDetail?: string;
  reason?: 'no-provider' | 'missing-credentials' | 'provider-error' | 'offline' | 'development-fixture';
  detail?: string;
}

/** What the learner-facing UI shows for a text's audio. Text learning is always possible without audio. */
export interface AudioStatus {
  textId: string;
  state: 'unavailable' | 'not-generated' | 'generating' | 'ready' | 'stale' | 'failed' | 'preview-only';
  /** Human-readable reason for every non-ready state, and for a ready state that is practice only (synthetic speech). */
  reason?: string;
  providerId?: string;
  providerVersion?: string;
  voiceId?: string;
  requestedLocale?: string;
  deliveredLocale?: string;
  voiceReview?: 'unreviewed' | 'in-review' | 'reviewed' | 'approved' | 'rejected';
  isSpeech: boolean;
  /** Content version the audio was made for vs the text's current version (stale when they differ). */
  audioContentVersion?: number;
  textContentVersion: number;
  readySegments: number;
  totalSegments: number;
  failedSegments: number;
  /**
   * True only for HUMAN speech whose recording was reviewed by a named person (qualityState human_reviewed / approved), with a
   * reviewed voice, approved rights and a current exact text binding. Synthetic speech is never evidence: it is practice only.
   */
  evidenceEligible: boolean;
  playAllowed?: boolean;
  rightsStatus?: AudioRightsRecord['status'];
  qualityState?: AudioAsset['qualityState'];
  sourceType?: AudioAsset['sourceType'];
  narratorOrVoiceId?: string;
}

export interface TtsProvider {
  readonly id: string;
  readonly version: string;
  /** False for fixtures and any non-speech generator. */
  readonly isSpeech: boolean;
  /** Can this provider synthesize right now (credentials present, reachable)? Never throws. */
  availability(): Promise<ProviderAvailability>;
  capabilities(): ProviderCapabilities;
  listVoices(lang: LanguageCode): Promise<Voice[]>;
  synthesize(req: SynthesisRequest): Promise<SynthesisResult>;
}

export interface EnsureAudioOptions {
  voiceConfigId?: string; // default: course default voice for the text's language
  sentenceIds?: string[]; // subset (e.g. a passage); default: whole text
  /** Run queued jobs now (tests/probes) rather than leaving them for the worker. */
  runNow?: boolean;
  /** Required for production speech: explicit derivative permission, provider retention terms, and exact text binding. */
  generationAuthorization?: AudioGenerationAuthorization;
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
  ensureSentenceAudio(args: { lang: LanguageCode; text: string; ownerId: string; contextId: string; voiceConfigId?: string; runNow?: boolean; generationAuthorization?: AudioGenerationAuthorization }): Promise<AudioSegment>;
  /** Import a verified local PCM WAV bound to one exact text release; no network fetches occur. */
  importRecording(args: ImportRecordingArgs): Promise<AudioImportResult>;
  /** Returns bytes and the complete rights/binding metadata only when offline use is explicitly granted. */
  offlinePackage(assetId: string): Promise<OfflineAudioPackage | undefined>;
  /** Process queued/retryable jobs. Returns number processed. */
  runJobs(opts?: { max?: number; now?: string }): Promise<number>;

  getManifest(textId: string, voiceConfigId?: string): Promise<AudioManifest | undefined>;
  getSegment(segmentId: string): Promise<AudioSegment | undefined>;
  getAsset(assetId: string): Promise<AudioAsset | undefined>;
  assetUrl(assetId: string): Promise<string | undefined>;
  alignments(segmentId: string): Promise<AudioAlignment[]>;
  /** Whether any real-speech provider is configured and usable. */
  availability(): Promise<ProviderAvailability>;
  /** Honest, learner-facing state of a text's audio (never throws; 'unavailable' when no real provider). */
  audioStatus(textId: string, opts?: { preview?: boolean; voiceConfigId?: string }): Promise<AudioStatus>;
  /** Forget a registered provider (e.g. the learner removed his speech key). */
  unregisterProvider(id: string): void;
  /** Development/preview only: allow non-speech fixture providers. Never on in normal learner use. */
  setAllowFixture(allow: boolean): void;
  allowFixture(): boolean;
  /** Requeue dead jobs (after fixing credentials / provider). Returns how many were requeued. */
  retryDead(jobId?: string): Promise<number>;
  /** Record a human audition decision for a voice. Only 'reviewed'/'approved' voices are evidence-eligible. */
  setVoiceReview(voiceConfigId: string, status: 'unreviewed' | 'in-review' | 'reviewed' | 'approved' | 'rejected', note?: string): Promise<VoiceConfig>;
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
