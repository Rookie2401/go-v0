/**
 * The generated known-limits list (src/adapters/arabic/generated/deck-limits.ts) is the sweep's output: re-run the sweep (the compiled core
 * plus EVERY shard, the three development sets) and fail when the file on disk differs. Run `npm run ar:deck-limits` to regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { installFullIndex, LIMITS_FILE, renderLimits, shardsPresent, sweepDeckLimits } from '../../scripts/ar-deck-limits-lib.mts';
import { AR_KNOWN_LIMITS, AR_LIMITED_LEMMAS } from '../../src/adapters/arabic/generated/deck-limits';
import { arKnownLimitOf } from '../../src/adapters/arabic/deck';

describe.skipIf(!shardsPresent())('the known-limits list is the sweep (needs public/lexicon/ar/standard)', () => {
  it('the generated file equals the sweep of the development sets, byte for byte', () => {
    installFullIndex();
    const sweep = sweepDeckLimits();
    expect(fs.readFileSync(path.resolve(LIMITS_FILE), 'utf8')).toBe(renderLimits(sweep));
  });
});

describe('the known-limits list as the gate reads it', () => {
  it('has entries, each with a reason that names the wrong and the reference lemma', () => {
    expect(Object.keys(AR_KNOWN_LIMITS).length).toBeGreaterThan(0);
    for (const reason of Object.values(AR_KNOWN_LIMITS)) expect(reason).toMatch(/credited .* reference lemma/u);
    for (const reason of Object.values(AR_LIMITED_LEMMAS)) expect(reason).toMatch(/reference lemma/u);
  });

  it('finds a listed unvocalized key from a printed token, and a vocalized entry only for exactly that printed form', () => {
    const [key] = Object.keys(AR_KNOWN_LIMITS).filter((k) => !/[ً-ْ]/u.test(k));
    expect(arKnownLimitOf(key)).toBeDefined();
    const [voc] = Object.keys(AR_KNOWN_LIMITS).filter((k) => /[ً-ْ]/u.test(k));
    expect(arKnownLimitOf(voc)).toBeDefined();
    expect(arKnownLimitOf('كِتَابٌ ابد')).toBeUndefined();
  });
});
