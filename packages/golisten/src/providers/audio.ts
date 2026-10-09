/**
 * Playback of a URL through the injected AudioPort (recorded and remote voices), plus the browser's AudioPort.
 * Adapted from 2GoLearn listen-engine (audioPort / playerSession): one clip, state and callbacks outside.
 */
import type { PlaybackDriver } from '../playback';
import type { AudioClip, AudioPort } from '../ports';

export function clipDriver(port: AudioPort, url: string, onDispose?: () => void): PlaybackDriver {
  let clip: AudioClip | undefined;
  let current: { ended(): void; failed(): void } | undefined;
  const ensure = (): AudioClip => {
    if (!clip) {
      clip = port.open(url);
      clip.onEnded(() => current?.ended());
      clip.onError(() => current?.failed());
    }
    return clip;
  };
  return {
    start(rate, cb) {
      current = cb;
      const c = ensure();
      c.stop();
      c.setRate(rate);
      c.play().catch(() => cb.failed());
    },
    pause() { clip?.pause(); },
    resume() { clip?.play().catch(() => current?.failed()); },
    cancel() { clip?.stop(); },
    setRate(r) { clip?.setRate(r); },
    durationMs() { return clip?.durationMs(); },
    dispose() { clip?.release(); clip = undefined; onDispose?.(); },
  };
}

/** The browser's AudioPort over HTMLAudioElement (pitch preserved when the rate changes). */
export function createHtmlAudioPort(): AudioPort | undefined {
  if (typeof Audio === 'undefined') return undefined;
  return {
    open(url) {
      const el = new Audio(url);
      el.preload = 'auto';
      (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
      return {
        play: () => el.play(),
        pause: () => el.pause(),
        stop: () => { el.pause(); try { el.currentTime = 0; } catch { /* not seekable yet */ } },
        setRate: (r) => { el.playbackRate = r; },
        onEnded: (cb) => { el.addEventListener('ended', () => cb()); },
        onError: (cb) => { el.addEventListener('error', () => cb(el.error?.message)); },
        durationMs: () => (Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration * 1000) : undefined),
        release: () => { el.pause(); el.removeAttribute('src'); el.load(); },
      };
    },
  };
}
