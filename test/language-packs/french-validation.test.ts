// @vitest-environment node
/**
 * The French pack's validation cases are what `installPack` runs on the learner's device (the setup page then says "ready" or "did not
 * verify"). They must read the same in both states the analyser can be in: with the hand word list alone, and with the dictionary's
 * lemma list loaded, which is how the extension's analyser chunk arrives (packages/golearn-extension/src/analysers/fr.ts waits for it).
 * A real-browser run on 2026-11-17 found one case (sont) failing only in the second state: this test keeps both.
 */
import { describe, expect, it } from 'vitest';
import { frAdapter, loadFrenchLexicon } from '../../src/adapters/fr';
import { frenchLexiconLoaded } from '../../src/adapters/french/lexicon-full';
import { FR_VALIDATION, FR_VERSION, frenchManifest } from '../../packages/language-packs/src/packs/fr';
import { MIN_VALIDATION_CASES, validateManifest } from '../../packages/language-packs/src/manifest';
import { runCase } from '../../packages/language-packs/src/analysis';

const failures = (): string[] => FR_VALIDATION.map((c) => runCase(frAdapter, c)).filter((r) => !r.pass).map((r) => `${r.id}: ${r.got}`);

describe('French pack: the validation cases, as the installer runs them', () => {
  it('the manifest is valid, names the adapter that ships, and has enough cases', () => {
    expect(validateManifest(frenchManifest())).toEqual([]);
    expect(FR_VERSION).toBe(frAdapter.version);
    expect(FR_VALIDATION.length).toBeGreaterThanOrEqual(MIN_VALIDATION_CASES);
    expect(new Set(FR_VALIDATION.map((c) => c.id)).size).toBe(FR_VALIDATION.length);
  });

  it('every case passes with the hand word list alone', () => {
    expect(frenchLexiconLoaded()).toBe(false);
    expect(failures()).toEqual([]);
  });

  it('every case passes with the dictionary lemma list loaded, as in the extension', async () => {
    await loadFrenchLexicon();
    expect(frenchLexiconLoaded()).toBe(true);
    expect(failures()).toEqual([]);
  });

  it('être and avoir are one word however they are listed: never an AUX reading and a VERB reading of the same form', () => {
    for (const [sentence, word] of [['Les chevaux sont beaux.', 'sont'], ['Ils ont un livre.', 'ont'], ['Elle est ici.', 'est'], ['Nous avons faim.', 'avons']] as const) {
      const tokens = frAdapter.tokenize(sentence);
      const read = frAdapter.analyze(tokens).find((a) => a.token.normalized === word)!;
      const verbal = read.candidates.filter((c) => (c.lemma === 'être' || c.lemma === 'avoir') && (c.pos === 'AUX' || c.pos === 'VERB'));
      expect(new Set(verbal.map((c) => c.pos)).size, `${word}: ${verbal.map((c) => c.pos).join(', ')}`).toBe(1);
    }
  });
});
