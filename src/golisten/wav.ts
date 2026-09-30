/**
 * Minimal, dependency-free PCM16 WAV encoder + validator.
 *
 * The validator is the gate that decides whether a provider response may become an `AudioAsset`.
 * A segment is never `ready` unless `validateWav(...).ok` was true for the bytes it points at.
 * Only uncompressed 16-bit PCM WAV can be measured here; any other container is reported as
 * unvalidatable (so it cannot become ready) rather than waved through.
 * TODO(contract): validators for audio/mpeg and audio/ogg once a real provider needs them.
 */
import type { AudioValidation } from '../core/model';

export const DEFAULT_SAMPLE_RATE = 22050;

export interface EncodeWavOptions {
  /** Int16 PCM, or floats in [-1, 1] (clamped). Interleaved when channels > 1. */
  samples: Int16Array | Float32Array | number[];
  sampleRate?: number;
  channels?: number;
}

/** Canonical 44-byte-header PCM16 WAV. */
export function encodeWav(opts: EncodeWavOptions): Uint8Array {
  const sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = opts.channels ?? 1;
  const isInt = opts.samples instanceof Int16Array;
  const n = opts.samples.length;
  const dataBytes = n * 2;
  const out = new Uint8Array(44 + dataBytes);
  const v = new DataView(out.buffer);
  const ascii = (off: number, s: string) => { for (let i = 0; i < s.length; i++) out[off + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * channels * 2, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  ascii(36, 'data'); v.setUint32(40, dataBytes, true);
  for (let i = 0; i < n; i++) {
    const x = opts.samples[i];
    const s = isInt ? x : Math.round(Math.max(-1, Math.min(1, x)) * 32767);
    v.setInt16(44 + i * 2, s, true);
  }
  return out;
}

export interface ValidateWavOptions {
  /** If given, the header sample rate must match. */
  expectedSampleRate?: number;
  expectedChannels?: number;
  minDurationMs?: number; // default 100
  maxDurationMs?: number; // default 10 minutes
  /** Leading/trailing silence longer than this is a problem (default 3000 ms). */
  maxEdgeSilenceMs?: number;
}

export interface WavInspection {
  validation: AudioValidation;
  /** Measured from the data chunk, not claimed by any provider. Undefined when unparseable. */
  durationMs?: number;
  sampleRate?: number;
  channels?: number;
}

const SILENCE_WINDOW_MS = 10;
const SILENT_WINDOW_RMS = 0.004; // about -48 dBFS
const SILENT_PEAK = 0.02;
const SILENT_RMS = 0.002;
const CLIP_LEVEL = 0.999;

/** Parse + measure. Never throws. */
export function inspectWav(bytes: Uint8Array, opts: ValidateWavOptions = {}): WavInspection {
  const fail = (...problems: string[]): WavInspection => ({ validation: { ok: false, problems } });
  if (!bytes || bytes.length === 0) return fail('empty');
  if (bytes.length < 12) return fail('not-wav: too short for a RIFF header');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (off: number) => String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return fail('not-wav: missing RIFF/WAVE header');

  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | undefined;
  let dataStart = -1;
  let declaredData = 0;
  let off = 12;
  while (off + 8 <= bytes.length) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > bytes.length) return fail('bad-fmt-chunk');
      fmt = { format: v.getUint16(body, true), channels: v.getUint16(body + 2, true), sampleRate: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    } else if (id === 'data') {
      dataStart = body;
      declaredData = size;
      break;
    }
    off = body + size + (size % 2);
  }
  if (!fmt) return fail('no-fmt-chunk');
  if (dataStart < 0) return fail('no-data-chunk');
  if (fmt.format !== 1 || fmt.bits !== 16) return fail(`unsupported-encoding: format ${fmt.format}, ${fmt.bits}-bit (only PCM16 can be validated)`);
  if (fmt.channels < 1 || fmt.channels > 2) return fail(`unsupported-channels: ${fmt.channels}`);
  if (fmt.sampleRate < 8000 || fmt.sampleRate > 96000) return fail(`unsupported-sample-rate: ${fmt.sampleRate}`);

  const problems: string[] = [];
  const available = bytes.length - dataStart;
  let dataBytes = declaredData;
  if (declaredData === 0xffffffff) dataBytes = available; // streaming header
  else if (declaredData > available) { problems.push('truncated-data'); dataBytes = available; }
  const frameBytes = fmt.channels * 2;
  const frames = Math.floor(dataBytes / frameBytes);
  const durationMs = (frames / fmt.sampleRate) * 1000;
  const base = { durationMs, sampleRate: fmt.sampleRate, channels: fmt.channels };
  if (frames === 0) return { ...base, validation: { ok: false, problems: [...problems, 'no-audio-data'], peak: 0, rms: 0 } };

  let peak = 0, sumSq = 0, clippedSamples = 0;
  const winFrames = Math.max(1, Math.round((fmt.sampleRate * SILENCE_WINDOW_MS) / 1000));
  const windows: boolean[] = [];
  let winSq = 0, winCount = 0;
  const flush = () => { if (winCount > 0) { windows.push(Math.sqrt(winSq / winCount) < SILENT_WINDOW_RMS); winSq = 0; winCount = 0; } };
  for (let f = 0; f < frames; f++) {
    let frameSq = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const s = v.getInt16(dataStart + (f * fmt.channels + c) * 2, true) / 32768;
      const a = Math.abs(s);
      if (a > peak) peak = a;
      if (a >= CLIP_LEVEL) clippedSamples++;
      sumSq += s * s;
      frameSq += s * s;
    }
    winSq += frameSq / fmt.channels; winCount++;
    if (winCount === winFrames) flush();
  }
  flush();
  const rms = Math.sqrt(sumSq / (frames * fmt.channels));
  let lead = 0; while (lead < windows.length && windows[lead]) lead++;
  let trail = 0; while (trail < windows.length - lead && windows[windows.length - 1 - trail]) trail++;
  const silentWindows = windows.filter(Boolean).length;
  const leadingSilenceMs = lead * SILENCE_WINDOW_MS;
  const trailingSilenceMs = trail * SILENCE_WINDOW_MS;
  const silenceRatio = windows.length ? silentWindows / windows.length : 1;
  const clipRatio = clippedSamples / (frames * fmt.channels);
  const clipped = clipRatio > 0.0005;

  if (peak < SILENT_PEAK || rms < SILENT_RMS) problems.push('silent');
  if (durationMs < (opts.minDurationMs ?? 100)) problems.push('too-short');
  if (durationMs > (opts.maxDurationMs ?? 10 * 60 * 1000)) problems.push('too-long');
  const edge = opts.maxEdgeSilenceMs ?? 3000;
  if (!problems.includes('silent')) {
    if (leadingSilenceMs > edge) problems.push('leading-silence');
    if (trailingSilenceMs > edge) problems.push('trailing-silence');
    if (silenceRatio > 0.97) problems.push('mostly-silence');
  }
  if (clipRatio > 0.01) problems.push('clipped');
  if (opts.expectedSampleRate !== undefined && opts.expectedSampleRate !== fmt.sampleRate) problems.push(`sample-rate-mismatch: header ${fmt.sampleRate}, expected ${opts.expectedSampleRate}`);
  if (opts.expectedChannels !== undefined && opts.expectedChannels !== fmt.channels) problems.push(`channel-mismatch: header ${fmt.channels}, expected ${opts.expectedChannels}`);

  return { ...base, validation: { ok: problems.length === 0, problems, peak, rms, leadingSilenceMs, trailingSilenceMs, silenceRatio, clipped } };
}

export function validateWav(bytes: Uint8Array, opts?: ValidateWavOptions): AudioValidation {
  return inspectWav(bytes, opts).validation;
}
