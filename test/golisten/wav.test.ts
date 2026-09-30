import { describe, expect, it } from 'vitest';
import { encodeWav, inspectWav, validateWav } from '../../src/golisten';

function tone(ms: number, opts: { rate?: number; amp?: number; freq?: number } = {}) {
  const rate = opts.rate ?? 22050;
  const n = Math.round((ms / 1000) * rate);
  const s = new Int16Array(n);
  for (let i = 0; i < n; i++) s[i] = Math.round(Math.sin((2 * Math.PI * (opts.freq ?? 300) * i) / rate) * (opts.amp ?? 0.3) * 32767);
  return s;
}

describe('encodeWav / validateWav', () => {
  it('encodes a canonical PCM16 mono header and round-trips the measured duration', () => {
    const bytes = encodeWav({ samples: tone(500) });
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.subarray(8, 12))).toBe('WAVE');
    const v = new DataView(bytes.buffer);
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getUint16(34, true)).toBe(16);
    const insp = inspectWav(bytes);
    expect(insp.sampleRate).toBe(22050);
    expect(insp.channels).toBe(1);
    expect(insp.durationMs).toBeCloseTo(500, 0);
  });

  it('accepts a healthy tone and reports peak/rms/silence metrics', () => {
    const v = validateWav(encodeWav({ samples: tone(800) }));
    expect(v.ok).toBe(true);
    expect(v.problems).toEqual([]);
    expect(v.peak!).toBeGreaterThan(0.25);
    expect(v.rms!).toBeGreaterThan(0.1);
    expect(v.silenceRatio!).toBeLessThan(0.1);
    expect(v.clipped).toBe(false);
  });

  it('encodes floats (clamped) as well as Int16', () => {
    const f = new Float32Array(2205).map((_, i) => Math.sin(i / 5) * 2); // overdriven on purpose
    const insp = inspectWav(encodeWav({ samples: f }));
    expect(insp.validation.peak!).toBeGreaterThan(0.99);
  });

  it('rejects an all-zero (silent) WAV', () => {
    const v = validateWav(encodeWav({ samples: new Int16Array(22050) }));
    expect(v.ok).toBe(false);
    expect(v.problems).toContain('silent');
  });

  it('rejects a near-silent WAV (peak below the floor)', () => {
    const v = validateWav(encodeWav({ samples: tone(500, { amp: 0.005 }) }));
    expect(v.ok).toBe(false);
    expect(v.problems).toContain('silent');
  });

  it('rejects empty bytes, garbage, a header with no samples, and truncated data', () => {
    expect(validateWav(new Uint8Array(0)).problems).toEqual(['empty']);
    expect(validateWav(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])).ok).toBe(false);
    const header = encodeWav({ samples: new Int16Array(0) });
    const noData = validateWav(header);
    expect(noData.ok).toBe(false);
    expect(noData.problems).toContain('no-audio-data');
    const full = encodeWav({ samples: tone(500) });
    const cut = validateWav(full.subarray(0, 44 + 2000));
    expect(cut.ok).toBe(false);
    expect(cut.problems).toContain('truncated-data');
  });

  it('rejects a non-PCM16 or compressed container instead of guessing', () => {
    const bytes = encodeWav({ samples: tone(300) });
    const b = new Uint8Array(bytes);
    new DataView(b.buffer).setUint16(20, 3, true); // IEEE float
    const v = validateWav(b);
    expect(v.ok).toBe(false);
    expect(v.problems[0]).toMatch(/unsupported-encoding/);
    expect(validateWav(new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4, 5, 6, 7, 8, 9])).ok).toBe(false);
  });

  it('flags too-short audio, clipping, long edge silence and sample-rate mismatch', () => {
    expect(validateWav(encodeWav({ samples: tone(20) })).problems).toContain('too-short');
    const clipped = new Int16Array(22050).fill(32767);
    expect(validateWav(encodeWav({ samples: clipped })).problems).toContain('clipped');
    const lead = new Int16Array(22050 * 4 + 11025);
    lead.set(tone(500), 22050 * 4);
    const v = validateWav(encodeWav({ samples: lead }));
    expect(v.ok).toBe(false);
    expect(v.problems).toContain('leading-silence');
    expect(v.leadingSilenceMs!).toBeGreaterThan(3900);
    const mism = validateWav(encodeWav({ samples: tone(300) }), { expectedSampleRate: 24000 });
    expect(mism.problems.some((p) => p.startsWith('sample-rate-mismatch'))).toBe(true);
  });

  it('never throws on arbitrary bytes', () => {
    for (let n = 0; n < 60; n++) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37 + n) & 0xff);
      expect(() => validateWav(bytes)).not.toThrow();
    }
  });
});
