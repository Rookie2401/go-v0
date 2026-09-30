/** Small HTMLAudioElement helpers shared by the Player and the testimony sentence players. */
import { clampSpeed } from '../../golisten';

/** Apply speed with pitch preserved. Never resample: browsers implement this via time-stretching. */
export function configureAudio(audio: HTMLAudioElement, speed: number): void {
  const pitchable = audio as HTMLAudioElement & { webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean };
  audio.preservesPitch = true;
  pitchable.webkitPreservesPitch = true;
  pitchable.mozPreservesPitch = true;
  const rate = clampSpeed(speed);
  // A new src resets playbackRate to defaultPlaybackRate in browsers, so keep both in step.
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/** Create a detached, pitch-preserving audio element for one-shot playback (testimony sentences). */
export function createAudio(url: string, speed = 1): HTMLAudioElement {
  const audio = new Audio(url);
  configureAudio(audio, speed);
  return audio;
}
