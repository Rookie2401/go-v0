/**
 * Every Stage 0 language pack in data/stage0 must validate with no errors on the real adapters: ids and references,
 * provenance, coverage bands along the path, construction prerequisites, the checker on every line, decoder-backed answer
 * keys for Hindi and Thai, romanization that retires, and unseen, covered exit forms. Warnings (missing native audio, words
 * without a gloss, words met once) are reported by `npx vite-node scripts/stage0-validate.mts`, not failed here.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import type { LanguageCode } from '../../src/core';
import { bundledStage0, stage0Config, validatePack } from '../../src/stage0';

const { world, packs } = bundledStage0();
const reg = createAdapterRegistry();

describe('Stage 0 content packs', () => {
  it('Spanish exists (the first vertical slice)', () => {
    expect(packs.has('es')).toBe(true);
  });
  for (const [lang, pack] of packs) {
    it(`${lang}: validates with no errors`, () => {
      const errors = validatePack(pack, reg.get(lang as LanguageCode), world).filter((i) => i.severity === 'error');
      expect(errors.map((e) => `${e.where} [${e.code}] ${e.message}`)).toEqual([]);
    });
    it(`${lang}: is never presented as reviewed without a named reviewer, and every line plans its audio`, () => {
      for (const item of [...pack.scenes.values(), ...pack.sounds.values(), ...pack.exits.values()]) {
        if (item.provenance.review.status === 'reviewed') expect(item.provenance.review.reviewer).toBeTruthy();
      }
      for (const s of pack.scenes.values()) for (const l of s.lines) expect(l.audio, `${s.id}/${l.id}`).toBeTruthy();
    });
    it(`${lang}: the path reaches the exit, and script support has a retirement step inside the path`, () => {
      const steps = pack.path.steps;
      expect(steps[steps.length - 1].kind).toBe('exit');
      const cfg = stage0Config(lang as LanguageCode);
      if (cfg.script.transliteration) expect(cfg.script.transliteration.retireAfterStep).toBeLessThan(steps.length - 1);
      if (cfg.script.segmentation) expect(cfg.script.segmentation.retireAfterStep).toBeLessThan(steps.length - 1);
    });
  }
});
