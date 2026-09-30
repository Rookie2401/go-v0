import type { AdapterRegistry } from '../core/adapters';
import type { EventBus } from '../core/events';
import type { AppStore } from '../core/store';
import type { TtsProvider } from '../core/contracts/golisten';

export const GOLISTEN_VERSION = 'golisten@2';
/** Suffix added to the adapter's normalizerVersion because the pipeline applies its own verse-marker safety net. */
export const PIPELINE_NORMALIZER_SUFFIX = 'golisten-strip@1';

export interface GoListenDeps {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  clock?: () => string;
  softwareVersion?: string;
  /**
   * Providers to register. A real provider (`isSpeech: true`, e.g. AzureSpeechProvider) is usable as soon as its
   * own `availability()` says so. Non-speech providers (the fixture, test doubles) are usable ONLY with `allowFixture`.
   */
  providers?: TtsProvider[];
  /**
   * Development / preview only. Registers the FixtureTtsProvider (sine tones, `isSpeech: false`) and lets non-speech
   * providers synthesize. Default false: without a usable real provider GoListen reports audio as unavailable.
   */
  allowFixture?: boolean;
  /** Provider used by resolveVoice when a voice config does not exist yet. Default: the first usable real provider, else the fixture. */
  defaultProviderId?: string;
  /** Synthesis settings (part of every cache key). Default {}. */
  settings?: Record<string, string | number | boolean>;
  maxAttempts?: number; // default 4
  backoffBaseMs?: number; // default 1000
  backoffMaxMs?: number; // default 300000
}

/** Resolved internals shared by pipeline / jobs / status / index. */
export interface Runtime {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  clock: () => string;
  softwareVersion: string;
  providers: Map<string, TtsProvider>;
  settings: Record<string, string | number | boolean>;
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** Job ids currently executing in this process (prevents concurrent double-synthesis). */
  inFlight: Set<string>;
  /** Explicit choice only (dependency or setDefaultProvider); undefined means "pick automatically". */
  defaultProviderId?: string;
  allowFixture: boolean;
}

export const addMs = (iso: string, ms: number): string => new Date(Date.parse(iso) + ms).toISOString();
