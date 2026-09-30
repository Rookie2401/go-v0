import { describe, expect, it } from 'vitest';
import { computeCacheKey, type CacheKeyParts } from '../../src/golisten';

const base: CacheKeyParts = {
  displayTextHash: 'aaaa', speechText: 'Yo creo en Dios.', lang: 'es', actualLocale: 'es-419', providerId: 'fixture', engine: 'fixture-tone-v1',
  voiceId: 'fixture-es-419', settings: { rate: 1, style: 'plain' }, normalizerVersion: 'n@1', lexiconVersion: 'none',
};

describe('computeCacheKey', () => {
  it('is deterministic and independent of settings key order', () => {
    expect(computeCacheKey(base)).toBe(computeCacheKey({ ...base }));
    expect(computeCacheKey(base)).toBe(computeCacheKey({ ...base, settings: { style: 'plain', rate: 1 } }));
    expect(computeCacheKey(base)).toMatch(/^ck:[0-9a-f]{32}$/);
  });

  const variants: Array<[string, Partial<CacheKeyParts>]> = [
    ['display text hash', { displayTextHash: 'bbbb' }],
    ['speech text', { speechText: 'Yo creo en Dios' }],
    ['lang', { lang: 'de' }],
    ['actual locale', { actualLocale: 'es-MX' }],
    ['provider', { providerId: 'azure' }],
    ['engine', { engine: 'neural-2' }],
    ['voice', { voiceId: 'other' }],
    ['settings', { settings: { rate: 1.1, style: 'plain' } }],
    ['normalizer version', { normalizerVersion: 'n@2' }],
    ['lexicon version', { lexiconVersion: 'p1@3' }],
    ['provider version', { providerVersion: '9' }],
  ];
  it.each(variants)('changes when the %s changes', (_name, patch) => {
    expect(computeCacheKey({ ...base, ...patch })).not.toBe(computeCacheKey(base));
  });

  it('distinguishes field boundaries (no concatenation ambiguity)', () => {
    const a = computeCacheKey({ ...base, providerId: 'ab', voiceId: 'c' });
    const b = computeCacheKey({ ...base, providerId: 'a', voiceId: 'bc' });
    expect(a).not.toBe(b);
  });
});
