/**
 * The Latin evaluation instrument (scripts/latin-eval-lib.mts): runs it on a 300-sentence slice of each corpus that is on disk
 * and checks the shape of the report and that every number is a percentage. It does not assert any accuracy: the numbers move
 * with the adapter (see docs/latin/EVAL.md).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { loadLatinLexicon } from '../../src/adapters/la';
import { ALL_CORPORA, MAIN_CORPORA, resolveCorpora, runEval, sourceStatus, strictKey, alignPairs } from '../../scripts/latin-eval-lib.mts';

const status = sourceStatus();
const inRange = (x: number): boolean => Number.isFinite(x) && x >= 0 && x <= 100;

describe('latin-eval instrument', () => {
  beforeAll(async () => { await loadLatinLexicon(); }, 60_000); // the numbers are of the full lexicon, as the CLI measures them
  it('resolves corpus names', () => {
    expect(resolveCorpora(['all'], false)).toEqual([...MAIN_CORPORA]);
    expect(resolveCorpora(['all'], true).length).toBe(ALL_CORPORA.length);
    expect(() => resolveCorpora(['nope'], false)).toThrow();
  });
  it('folds spelling and aligns word lists', () => {
    expect(strictKey('Jūnō')).toBe(strictKey('iuno'));
    expect(strictKey('cælum')).toBe('caelum');
    expect(alignPairs(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd'])).toEqual([[0, 0], [2, 2], [3, 3]]);
  });

  for (const name of MAIN_CORPORA) {
    it.skipIf(!status[name])(`${name}: a 300-sentence slice gives a well-formed report`, () => {
      const r = runEval({ corpora: [name], gold: true, limit: 300, misses: true });
      const c = r.corpora[name];
      expect(c).toBeDefined();
      expect(c.sentences).toBeLessThanOrEqual(300);
      expect(c.sentences).toBeGreaterThan(0);
      expect(c.tokens).toBeGreaterThan(0);
      for (const v of [c.anyReadingPct, c.lexiconConfirmedPct, c.ruleBuiltPct, c.unconfirmedGuessPct, c.noReadingPct, c.multiReadingPct, c.listedFormsSharePct]) expect(inRange(v)).toBe(true);
      expect(c.counts.lexiconConfirmed + c.counts.ruleBuilt + c.counts.unconfirmedGuess + c.counts.noReading).toBe(c.tokens);
      expect(c.wordsPerSecond).toBeGreaterThan(0);
      expect(Array.isArray(c.misses)).toBe(true);
      expect(c.misses!.length).toBeLessThanOrEqual(300);
      if (c.gold) {
        const g = c.gold;
        for (const v of [g.alignedPct, g.lemmaStrict, g.lemmaLenient, g.lemmaAnyLenient, g.posStrict, g.posLenient, g.lemmaPosStrict, g.lemmaPosLenient, g.featuresSubsetStrict, g.featuresSubsetLenient, g.fullStrict, g.fullLenient]) expect(inRange(v)).toBe(true);
        expect(g.lemmaLenient).toBeGreaterThanOrEqual(g.lemmaStrict);
        expect(g.topPosErrors.length).toBeLessThanOrEqual(10);
        for (const k of ['Case', 'Number', 'Gender', 'Person', 'Tense', 'Mood', 'Voice', 'VerbForm', 'Degree']) expect(g.perFeature[k]).toBeDefined();
      }
    }, 120_000);
  }

  it.skipIf(!status['perseus-cicero'])('scores the Perseus treebank on its own text', () => {
    const r = runEval({ corpora: ['perseus-cicero'], gold: true, limit: 300 });
    const g = r.corpora['perseus-cicero'].gold!;
    expect(g).not.toBeNull();
    expect(g.aligned).toBeGreaterThan(0);
    expect(inRange(g.lemmaLenient)).toBe(true);
  }, 120_000);

  it.skipIf(!status.proiel || !status.nt)('scores the New Testament against PROIEL', () => {
    const r = runEval({ corpora: ['nt'], gold: true, limit: 300 });
    const g = r.corpora.nt.gold!;
    expect(g.aligned).toBeGreaterThan(300);
    expect(g.alignedPct).toBeGreaterThan(50);
  }, 120_000);
});
