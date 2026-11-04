import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoListenEnv } from '../../packages/golisten/src/environment';
import { albanianRegistry } from '../../packages/golisten/src/registry';
import { REMOTE_AVAILABILITY_TIMEOUT_MS, remoteAvailability } from '../../packages/golisten/src/providers/remote';

describe('remote speech availability deadlines', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('settles a stalled backend probe within four seconds and aborts its request', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const env: GoListenEnv = {
      consent: () => ({ remoteSpeech: true }),
      fetch: async (_url, init) => { if (init?.signal) signals.push(init.signal); return new Promise(() => undefined); },
      utterance: () => ({ lang: '', rate: 1, voice: null, onend: null, onerror: null }),
      proxyBase: 'https://repo.example/api/speech', now: () => Date.now(), voiceWaitMs: 0, cache: new Map(),
    };
    const entry = albanianRegistry().entries.find((voice) => voice.source.kind === 'remote')!;
    const pending = remoteAvailability(entry, env);
    await vi.advanceTimersByTimeAsync(REMOTE_AVAILABILITY_TIMEOUT_MS);
    await expect(pending).resolves.toBe('unavailable');
    expect(REMOTE_AVAILABILITY_TIMEOUT_MS).toBe(4_000);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(true);
  });
});
