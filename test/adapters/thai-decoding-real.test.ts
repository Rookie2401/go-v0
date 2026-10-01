/**
 * The adapter wired to the real orthography engine. Nothing here depends on what the engine decides beyond its
 * contract (an array of syllables with sane offsets and confidences), so it holds before and after the engine is
 * filled in.
 */
import { describe, expect, it } from 'vitest';
import { decodeFor } from '../../src/core';
import { thAdapter, thLexicon } from '../../src/adapters/th';
import { run } from './helpers';

const forms = [...new Set(thLexicon.entries.map((e) => e.lemma))];

describe('Thai adapter: real decoder wiring', () => {
  it('offers all four hooks', () => {
    for (const k of ['decode', 'decodeWithPronunciation', 'orthFeatures', 'describeOrthFeature'] as const) expect(typeof thAdapter[k], k).toBe('function');
  });

  it('decode returns an array for every lexicon word, with offsets inside the word and sane confidences', () => {
    for (const f of forms) {
      const syls = thAdapter.decode!(f);
      expect(Array.isArray(syls), f).toBe(true);
      for (const s of syls) {
        expect(s.start, f).toBeGreaterThanOrEqual(0);
        expect(s.end, f).toBeLessThanOrEqual(f.length);
        expect(s.end, f).toBeGreaterThan(s.start);
        expect(s.confidence, f).toBeGreaterThanOrEqual(0);
        expect(s.confidence, f).toBeLessThanOrEqual(1);
        expect(['open', 'live', 'dead'], f).toContain(s.ending);
        if (s.tone) expect(['mid', 'low', 'falling', 'high', 'rising'], f).toContain(s.tone);
      }
    }
  });

  it('decode is a pure function of the NFC spelling (same answer for the decomposed form)', () => {
    expect(thAdapter.decode!('ทําไม')).toEqual(thAdapter.decode!('ทำไม'));
  });

  it('non-Thai and empty input decode to nothing, never throw', () => {
    for (const s of ['', 'abc', '123', ' ', '.']) expect(() => thAdapter.decode!(s)).not.toThrow();
    expect(thAdapter.decode!('abc')).toEqual([]);
  });

  it('decodeWithPronunciation and decodeFor return arrays, also with a respelling the engine may not understand', () => {
    expect(Array.isArray(thAdapter.decodeWithPronunciation!('ขนม', { respelling: 'ขะ-หฺนม', ipa: '/kʰa˨˩.nom˩˩˦/' }))).toBe(true);
    expect(Array.isArray(thAdapter.decodeWithPronunciation!('ขนม', { ipa: '/kʰa˨˩.nom˩˩˦/' }))).toBe(true);
    expect(Array.isArray(thAdapter.decodeWithPronunciation!('ขนม', { respelling: '??' }))).toBe(true);
    expect(Array.isArray(decodeFor(thAdapter, 'ขนม', { notes: { respelling: 'ขะ-หฺนม' } }))).toBe(true);
  });

  it('orthFeatures returns strings and describeOrthFeature always returns a non-empty string', () => {
    const feats = thAdapter.orthFeatures!(thAdapter.decode!('นก'));
    expect(Array.isArray(feats)).toBe(true);
    for (const f of feats) {
      expect(typeof f).toBe('string');
      expect(thAdapter.describeOrthFeature!(f).length).toBeGreaterThan(0);
    }
    expect(thAdapter.describeOrthFeature!('class:mid').length).toBeGreaterThan(0);
  });

  it('pronunciation() never claims what the decoder does not: a tone line needs a certain decoding', () => {
    for (const f of forms) {
      const r = run('th', f);
      if (r.tokens.length !== 1) continue;
      const p = thAdapter.pronunciation(r.tokens[0], r.analyses[0]);
      const syls = thAdapter.decode!(f);
      const certain = syls.length > 0 && syls.every((s) => s.confidence >= 0.6 && s.tone);
      const text = (p.notes ?? []).join(' ');
      if (text.includes('Tone by syllable')) expect(certain, f).toBe(true); // never a tone from an uncertain decoding
      if (!certain && syls.length) expect(text, f).toMatch(/not certain/);
      if (p.ipa) expect(syls.every((s) => s.ipa && s.confidence >= 0.6), f).toBe(true);
    }
  });

  it('a word outside the lexicon gets no invented romanization: it is the decoder\'s or nothing', () => {
    const r = run('th', 'ภูมิศาสตร์');
    const p = thAdapter.pronunciation(r.tokens[0], r.analyses[0]);
    const syls = thAdapter.decode!(r.tokens[0].surface);
    if (p.transliteration !== undefined) {
      expect(syls.length).toBeGreaterThan(0);
      expect(p.transliteration).toBe(syls.map((s) => s.romanization).join('-'));
    }
  });
});
