/**
 * The playback state machine behind every `PlaybackHandle`. A provider supplies a small `PlaybackDriver` (a speech
 * utterance, an audio clip); this module owns the state, the replay count and the rate rule. Never throws: a driver
 * that fails puts the handle in state 'error'. Shape adapted from 2GoLearn listen-engine (player / playerSession).
 */
import type { PlaybackHandle, PlaybackState } from './contracts';

export const MIN_RATE = 0.5;
export const MAX_RATE = 1.5;

export function clampRate(r: number | undefined): number {
  if (r === undefined || !Number.isFinite(r)) return 1;
  return Math.round(Math.min(MAX_RATE, Math.max(MIN_RATE, r)) * 100) / 100;
}

export interface DriverCallbacks {
  ended(): void;
  failed(): void;
  /** The hearing was cut short from outside (another utterance took over the speaker): back to idle, not an error. */
  interrupted(): void;
}

export interface PlaybackDriver {
  /** Begin a fresh hearing from the start. */
  start(rate: number, cb: DriverCallbacks): void;
  pause(): void;
  resume(): void;
  /** Abandon the current hearing silently (no ended / failed callback for it). */
  cancel(): void;
  /** Change the rate of a hearing in progress, when the medium allows it. */
  setRate?(rate: number): void;
  durationMs?(): number | undefined;
  dispose?(): void;
}

export interface PlaybackOptions { now: () => number; rate?: number }

export function createPlayback(driver: PlaybackDriver, opts: PlaybackOptions): PlaybackHandle {
  let state: PlaybackState = 'idle';
  let hearings = 0;
  let rate = clampRate(opts.rate);
  let token = 0; // a callback from an abandoned hearing sees an older token and is ignored
  let startedAt = 0;
  let measured: number | undefined;
  let disposed = false;
  const listeners = new Set<() => void>();

  const safe = (f: () => void) => { try { f(); } catch { /* a driver must not break the caller */ } };

  const begin = () => {
    const mine = ++token;
    hearings += 1;
    state = 'playing';
    startedAt = opts.now();
    try {
      driver.start(rate, {
        ended: () => {
          if (mine !== token || disposed) return;
          state = 'ended';
          measured = Math.max(0, opts.now() - startedAt);
          for (const cb of [...listeners]) safe(cb);
        },
        failed: () => { if (mine === token && !disposed) state = 'error'; },
        interrupted: () => { if (mine === token && !disposed) state = 'idle'; },
      });
    } catch {
      state = 'error';
    }
  };

  return {
    play() {
      if (disposed || state === 'playing') return;
      if (state === 'paused') { safe(() => driver.resume()); state = 'playing'; return; }
      begin();
    },
    pause() {
      if (disposed || state !== 'playing') return;
      safe(() => driver.pause());
      state = 'paused';
    },
    stop() {
      if (disposed || state === 'idle') return;
      token += 1;
      safe(() => driver.cancel());
      state = 'idle';
    },
    replay() {
      if (disposed) return;
      token += 1;
      safe(() => driver.cancel());
      begin();
    },
    setRate(r: number) {
      rate = clampRate(r);
      safe(() => driver.setRate?.(rate));
    },
    get rate() { return rate; },
    get state() { return state; },
    get replays() { return Math.max(0, hearings - 1); },
    onEnd(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    get durationMs() { return driver.durationMs?.() ?? measured; },
    dispose() {
      if (disposed) return;
      token += 1;
      safe(() => driver.cancel());
      safe(() => driver.dispose?.());
      disposed = true;
      listeners.clear();
      state = 'idle';
    },
  };
}

/** A handle for something that could not be played: state 'error', every action a no-op. Lets callers stay uniform. */
export function failedPlayback(now: () => number = Date.now): PlaybackHandle {
  const h = createPlayback({ start: () => { throw new Error('unavailable'); }, pause() {}, resume() {}, cancel() {} }, { now });
  h.play();
  return h;
}
