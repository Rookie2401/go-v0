/**
 * The adapter's decoding hooks, tested against a stand-in for the orthography engine (thai/orthography is owned by
 * another package): what the adapter does with the engine's answers, not what the engine says.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyllableAnalysis } from '../../src/core';

const engine = vi.hoisted(() => ({
  decodeThai: vi.fn<(s: string) => SyllableAnalysis[]>(),
  decodeThaiRespelling: vi.fn<(s: string, r: string, ipa?: string) => SyllableAnalysis[]>(),
  tonesFromIpa: vi.fn<(ipa: string) => Array<SyllableAnalysis['tone'] | undefined>>(),
  thaiOrthFeatures: vi.fn<(s: SyllableAnalysis[]) => string[]>(),
  describeThaiOrthFeature: vi.fn<(k: string) => string>(),
}));
vi.mock('../../src/adapters/thai/orthography', () => engine);

import { decodeFor } from '../../src/core';
import { thAdapter } from '../../src/adapters/th';
import { run } from './helpers';

const syl = (over: Partial<SyllableAnalysis> = {}): SyllableAnalysis => ({
  text: 'ขา', start: 0, end: 2, ending: 'open', tone: 'rising', confidence: 0.95, romanization: 'kha', ipa: 'kʰǎː', ...over,
});

beforeEach(() => {
  engine.decodeThai.mockReset().mockReturnValue([]);
  engine.decodeThaiRespelling.mockReset().mockReturnValue([]);
  engine.tonesFromIpa.mockReset().mockReturnValue([]);
  engine.thaiOrthFeatures.mockReset().mockReturnValue([]);
  engine.describeThaiOrthFeature.mockReset().mockImplementation((k) => `label:${k}`);
});

describe('Thai adapter: decoding hooks', () => {
  it('decode reads the NFC-normalised spelling and returns what the engine returns', () => {
    engine.decodeThai.mockReturnValue([syl()]);
    expect(thAdapter.decode!('ขา')).toEqual([syl()]);
    // nikhahit + sara aa is normalised to sara am before the engine sees it
    thAdapter.decode!('ทําไม');
    expect(engine.decodeThai).toHaveBeenLastCalledWith('ทำไม');
  });

  it('decodeWithPronunciation: the respelling is the authority and receives the IPA', () => {
    const out = [syl({ irregular: true })];
    engine.decodeThaiRespelling.mockReturnValue(out);
    expect(thAdapter.decodeWithPronunciation!('ขนม', { respelling: 'ขะ-หฺนม', ipa: '/kʰa˨˩.nom˩˩˦/' })).toBe(out);
    expect(engine.decodeThaiRespelling).toHaveBeenCalledWith('ขนม', 'ขะ-หฺนม', '/kʰa˨˩.nom˩˩˦/');
    expect(engine.decodeThai).not.toHaveBeenCalled();
  });

  it('decodeWithPronunciation falls back to the spelling rules when the respelling cannot be used', () => {
    engine.decodeThaiRespelling.mockReturnValue([]);
    engine.decodeThai.mockReturnValue([syl()]);
    expect(thAdapter.decodeWithPronunciation!('ขา', { respelling: '???' })).toEqual([syl()]);
    expect(thAdapter.decodeWithPronunciation!('ขา', {})).toEqual([syl()]);
  });

  it('with IPA alone the tone letters decide the tone; a disagreement is flagged and capped at 0.7', () => {
    engine.decodeThai.mockReturnValue([syl({ text: 'ขะ', tone: 'low', confidence: 0.9 }), syl({ text: 'นม', tone: 'rising', confidence: 0.9 })]);
    engine.tonesFromIpa.mockReturnValue(['low', 'mid']);
    const out = thAdapter.decodeWithPronunciation!('ขนม', { ipa: '/x/' });
    expect(out[0].tone).toBe('low');
    expect(out[0].irregular).toBeUndefined();
    expect(out[0].confidence).toBe(0.9);
    expect(out[1].tone).toBe('mid');
    expect(out[1].irregular).toBe(true);
    expect(out[1].confidence).toBeLessThanOrEqual(0.7);
    expect(out[1].rule).toMatch(/dictionary pronunciation/);
    expect(out[1].rule).toMatch(/rising/); // says what the rule had given
  });

  it('with IPA alone a missing tone is filled in from the IPA; no IPA tone leaves the syllable as it was', () => {
    engine.decodeThai.mockReturnValue([syl({ tone: undefined, confidence: 0.4 }), syl({ tone: 'high', confidence: 0.9 })]);
    engine.tonesFromIpa.mockReturnValue(['falling', undefined]);
    const out = thAdapter.decodeWithPronunciation!('ขา', { ipa: '/x/' });
    expect(out[0].tone).toBe('falling');
    expect(out[0].confidence).toBeGreaterThanOrEqual(0.75);
    expect(out[1]).toEqual(syl({ tone: 'high', confidence: 0.9 }));
  });

  it('with IPA alone and a different syllable count the rule decoding is returned untouched', () => {
    const base = [syl(), syl()];
    engine.decodeThai.mockReturnValue(base);
    engine.tonesFromIpa.mockReturnValue(['mid']);
    expect(thAdapter.decodeWithPronunciation!('ขา', { ipa: '/x/' })).toEqual(base);
  });

  it('decodeFor takes the dictionary respelling stored in the analysis notes', () => {
    engine.decodeThaiRespelling.mockReturnValue([syl({ irregular: true })]);
    const out = decodeFor(thAdapter, 'ขนม', { notes: { respelling: 'ขะ-หฺนม', ipa: '/y/' } });
    expect(out).toHaveLength(1);
    expect(engine.decodeThaiRespelling).toHaveBeenCalledWith('ขนม', 'ขะ-หฺนม', '/y/');
    // an author-supplied decoding wins over everything
    expect(decodeFor(thAdapter, 'ขนม', { syllables: [syl({ text: 'ก' })] })[0].text).toBe('ก');
  });

  it('orthFeatures and describeOrthFeature are the engine\'s', () => {
    engine.thaiOrthFeatures.mockReturnValue(['class:mid', 'vowel:◌า']);
    expect(thAdapter.orthFeatures!([syl()])).toEqual(['class:mid', 'vowel:◌า']);
    expect(thAdapter.describeOrthFeature!('class:mid')).toBe('label:class:mid');
  });
});

describe('Thai adapter: pronunciation()', () => {
  const pron = (text: string, i = 0) => {
    const r = run('th', text);
    return thAdapter.pronunciation(r.tokens[i], r.analyses[i]);
  };

  it('reports the tone per syllable only when every syllable is decoded with confidence of at least 0.6', () => {
    engine.decodeThai.mockReturnValue([syl({ text: 'ขะ', tone: 'low' }), syl({ text: 'นม', tone: 'rising' })]);
    const p = pron('ขนม');
    expect(p.notes!.join(' ')).toContain('Tone by syllable: ขะ low, นม rising.');
    expect(p.notes!.join(' ')).toMatch(/consonant class: high/);
  });

  it('says the tone is not certain, and names none, when a syllable is below 0.6 or has no tone', () => {
    engine.decodeThai.mockReturnValue([syl({ tone: 'low' }), syl({ confidence: 0.5, tone: 'mid' })]);
    let p = pron('ขนม');
    expect(p.notes!.join(' ')).not.toContain('Tone by syllable');
    expect(p.notes!.join(' ')).toMatch(/not certain/);
    engine.decodeThai.mockReturnValue([syl({ tone: undefined })]);
    p = pron('ขนม');
    expect(p.notes!.join(' ')).not.toContain('Tone by syllable');
    expect(p.notes!.join(' ')).toMatch(/not certain/);
  });

  it('names no tone when the course romanization and the decoder disagree (one of them is wrong)', () => {
    engine.decodeThai.mockReturnValue([syl({ romanization: 'san' }), syl({ romanization: 'phap' })]);
    const p = pron('สารภาพ'); // course romanization: saraphap
    expect(p.transliteration).toBe('saraphap');
    expect(p.notes!.join(' ')).not.toContain('Tone by syllable');
    expect(p.notes!.join(' ')).toMatch(/not certain/);
    // a hyphenated decoder romanization that agrees is fine
    engine.decodeThai.mockReturnValue([syl({ romanization: 'sa' }), syl({ romanization: 'ra' }), syl({ romanization: 'phap' })]);
    expect(pron('สารภาพ').notes!.join(' ')).toContain('Tone by syllable');
  });

  it('adds nothing about tone when the engine cannot decode the word', () => {
    engine.decodeThai.mockReturnValue([]);
    const p = pron('ขนม');
    expect(p.notes!.join(' ')).not.toMatch(/Tone by syllable|not certain/);
    expect(p.transliteration).toBeUndefined();
    expect(p.ipa).toBeUndefined();
  });

  it('a romanization comes from the lexicon, else from the decoder when every syllable is certain (0.85), else nowhere', () => {
    // lexicon first: พระเจ้า keeps its course romanization whatever the decoder says
    engine.decodeThai.mockReturnValue([syl({ romanization: 'zzz' })]);
    expect(pron('พระเจ้า').transliteration).toBe('phrachao');
    // not in the lexicon: from the decoder, syllables joined with a hyphen
    engine.decodeThai.mockReturnValue([syl({ romanization: 'kha' }), syl({ romanization: 'nom' })]);
    expect(pron('ขนม').transliteration).toBe('kha-nom');
    engine.decodeThai.mockReturnValue([syl({ romanization: 'kha' }), syl({ romanization: 'nom', confidence: 0.8 })]);
    expect(pron('ขนม').transliteration).toBeUndefined();
    engine.decodeThai.mockReturnValue([syl({ romanization: undefined })]);
    expect(pron('ขนม').transliteration).toBeUndefined();
  });

  it('IPA is joined from the syllables only when every syllable has one and all are decoded', () => {
    engine.decodeThai.mockReturnValue([syl({ ipa: 'kʰa˨˩' }), syl({ ipa: 'nom˩˩˦' })]);
    expect(pron('ขนม').ipa).toBe('kʰa˨˩.nom˩˩˦');
    engine.decodeThai.mockReturnValue([syl({ ipa: 'kʰa˨˩' }), syl({ ipa: undefined })]);
    expect(pron('ขนม').ipa).toBeUndefined();
  });

  it('uses the dictionary respelling stored with the analysis', () => {
    engine.decodeThaiRespelling.mockReturnValue([syl({ text: 'ขะ', tone: 'low' }), syl({ text: 'หนม', tone: 'rising' })]);
    const r = run('th', 'ขนม');
    const an = { ...r.analyses[0], candidates: [{ morph: {}, confidence: 0.6, notes: { respelling: 'ขะ-หฺนม' } }] };
    const p = thAdapter.pronunciation(r.tokens[0], an);
    expect(p.notes!.join(' ')).toContain('ขะ low, หนม rising');
  });
});
