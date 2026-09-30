/**
 * Typed errors of GoListen.
 *
 *  - `AudioUnavailableError` (name 'AudioUnavailable'): thrown by ensureAudio / ensureSentenceAudio / resolveVoice
 *    when no usable speech provider exists. It is thrown BEFORE anything is written.
 *  - `TtsProviderError` (name 'TtsProviderError'): thrown by a provider's `synthesize`. Its `kind` tells the job
 *    runner whether a retry can help (401/400 never; 429, 5xx, network always, with backoff).
 */
import type { ProviderAvailability } from '../core/contracts/golisten';

export type UnavailableReason = Exclude<NonNullable<ProviderAvailability['reason']>, 'development-fixture'>;

export class AudioUnavailableError extends Error {
  override name = 'AudioUnavailable';
  readonly reason: UnavailableReason;
  readonly detail?: string;
  constructor(reason: UnavailableReason, detail?: string) {
    super(unavailableMessage(reason, detail));
    this.reason = reason;
    this.detail = detail;
  }
}

export function isAudioUnavailable(e: unknown): e is AudioUnavailableError {
  return e instanceof Error && e.name === 'AudioUnavailable';
}

/** Human, learner-facing sentence for an unavailable provider state. Text learning always works without audio. */
export function unavailableMessage(reason: UnavailableReason, detail?: string): string {
  const tail = detail ? ` (${detail})` : '';
  switch (reason) {
    case 'no-provider': return `Audio is not available — no speech provider is configured. You can still read.${tail}`;
    case 'missing-credentials': return `Audio is not available — the speech provider has no working credentials in this session. You can still read.${tail}`;
    case 'offline': return `Audio is not available — the device is offline. You can still read.${tail}`;
    case 'provider-error': return `Audio is not available — the speech provider reported an error. You can still read.${tail}`;
  }
}

export type ProviderErrorKind = 'missing-credentials' | 'rate-limited' | 'server' | 'network' | 'bad-request' | 'bad-response';

export class TtsProviderError extends Error {
  override name = 'TtsProviderError';
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  /** From a Retry-After header, when the service sent one. */
  readonly retryAfterMs?: number;
  constructor(kind: ProviderErrorKind, message: string, opts: { status?: number; retryAfterMs?: number } = {}) {
    super(`${kind}: ${message}`);
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
  }
  /** A retry cannot fix a rejected key or a malformed request. */
  get retryable(): boolean { return this.kind !== 'missing-credentials' && this.kind !== 'bad-request'; }
}

export interface ErrorInfo { message: string; retryable: boolean; retryAfterMs?: number; kind?: ProviderErrorKind }

/** Duck-typed so any provider (including test doubles) can opt into non-retryable failures. */
export function describeError(e: unknown): ErrorInfo {
  const message = e instanceof Error ? e.message : String(e);
  if (e && typeof e === 'object') {
    const o = e as { kind?: unknown; retryable?: unknown; retryAfterMs?: unknown };
    const retryable = typeof o.retryable === 'boolean' ? o.retryable : true;
    const retryAfterMs = typeof o.retryAfterMs === 'number' && Number.isFinite(o.retryAfterMs) && o.retryAfterMs > 0 ? o.retryAfterMs : undefined;
    return { message, retryable, retryAfterMs, kind: typeof o.kind === 'string' ? (o.kind as ProviderErrorKind) : undefined };
  }
  return { message, retryable: true };
}
