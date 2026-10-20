/**
 * The environment ports GoListen runs against. Everything the browser provides (speech synthesis, audio output,
 * fetch, object URLs, the clock) comes in through these structural types, so the package has no hard DOM dependency
 * and tests inject fakes. The audio-port idea is adapted from 2GoLearn listen-engine (audioPort / player).
 */

/** What GoListen needs from a `SpeechSynthesisVoice` (a real one satisfies this structurally). */
export interface SpeechVoiceLike {
  name: string;
  lang: string;
  voiceURI?: string;
  /** false = the browser sends the text to a network speech service (e.g. a cloud voice). */
  localService?: boolean;
  default?: boolean;
}

export interface SpeechUtteranceLike {
  text?: string;
  lang: string;
  rate: number;
  voice: unknown;
  onend: ((ev?: unknown) => void) | null;
  onerror: ((ev?: { error?: string }) => void) | null;
}

/** What GoListen needs from `window.speechSynthesis`. */
export interface SpeechLike {
  getVoices(): SpeechVoiceLike[];
  speak(utterance: SpeechUtteranceLike): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  addEventListener?(type: 'voiceschanged', listener: () => void): void;
  removeEventListener?(type: 'voiceschanged', listener: () => void): void;
}

/** One loaded audio clip (an HTMLAudioElement in browsers, a fake in tests). */
export interface AudioClip {
  play(): Promise<void>;
  pause(): void;
  /** Stop and rewind. */
  stop(): void;
  setRate(rate: number): void;
  onEnded(cb: () => void): void;
  onError(cb: (message?: string) => void): void;
  durationMs(): number | undefined;
  release(): void;
}

export interface AudioPort {
  open(url: string): AudioClip;
}

/** The slice of `Response` the remote provider reads. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
  blob(): Promise<Blob>;
}

export type FetchLike = (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  credentials?: 'same-origin' | 'omit' | 'include';
  cache?: 'no-store';
  signal?: AbortSignal;
}) => Promise<FetchResponseLike>;

/** Turns audio bytes into a playable URL and back (URL.createObjectURL in browsers). */
export interface ObjectUrlPort {
  create(blob: Blob): string;
  revoke(url: string): void;
}

export interface ConsentState {
  /**
   * The learner has allowed text to be sent to a remote speech service. Also governs any browser voice that is not
   * `localService` (it sends the text to the browser vendor's cloud).
   */
  remoteSpeech: boolean;
  /** When true, remote providers and network-backed browser voices are forbidden. */
  localOnly?: boolean;
}
