import type { AdapterRegistry } from '../core/adapters';
import type { EventBus } from '../core/events';
import type { AppStore } from '../core/store';
import type { TtsProvider } from '../core/contracts/golisten';

export const GOLISTEN_VERSION = 'golisten@1';
/** Suffix added to the adapter's normalizerVersion because the pipeline applies its own verse-marker safety net. */
export const PIPELINE_NORMALIZER_SUFFIX = 'golisten-strip@1';

export interface GoListenDeps {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  clock?: () => string;
  softwareVersion?: string;
  /** Extra providers to register (the fixture provider is always registered). */
  providers?: TtsProvider[];
  /** Provider used by resolveVoice when a voice config does not exist yet. Default: "fixture". */
  defaultProviderId?: string;
  /** Synthesis settings (part of every cache key). Default {}. */
  settings?: Record<string, string | number | boolean>;
  maxAttempts?: number; // default 4
  backoffBaseMs?: number; // default 1000
  backoffMaxMs?: number; // default 300000
}

/** Resolved internals shared by pipeline / jobs / index. */
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
  defaultProviderId: string;
}

export const addMs = (iso: string, ms: number): string => new Date(Date.parse(iso) + ms).toISOString();
