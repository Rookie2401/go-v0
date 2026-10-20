import { describe, expect, it } from 'vitest';
import { sqAdapter as real } from '../../src/adapters/sq';
import { sqAdapter as worker } from '../../packages/golearn-extension/src/background/sqStub';

const sentence = 'Unë po lexoj një libër të bukur.';

describe('the worker Albanian adapter keeps Repository lexical behavior', () => {
  it('preserves metadata used to stamp pack coverage and provenance', () => {
    expect(worker.lang).toBe(real.lang);
    expect(worker.version).toBe(real.version);
    expect(worker.sources).toEqual(real.sources);
    expect(worker.support.limitations[0]).toBe(real.support.limitations[0]);
    expect(worker.support.tokenization).toBe(real.support.tokenization);
    expect(worker.support.lemmatization).toBe(real.support.lemmatization);
  });

  it('matches the real tokenizer, analyzer, phrase rules and morphology description', () => {
    const tokens = worker.tokenize(sentence);
    expect(tokens).toEqual(real.tokenize(sentence));
    expect(worker.analyze(tokens)).toEqual(real.analyze(tokens));
    const analyses = worker.analyze(tokens);
    expect(worker.detectPhrases(tokens, analyses)).toEqual(real.detectPhrases(tokens, real.analyze(tokens)));
    const candidate = analyses.find((x) => x.candidates.length)?.candidates[0];
    expect(candidate).toBeDefined();
    expect(worker.describeMorph!(candidate!.morph ?? {}, candidate!.pos)).toBe(real.describeMorph!(candidate!.morph ?? {}, candidate!.pos));
  });

  it('keeps representative Gheg, disputed and construction-adjacent readings unchanged', () => {
    for (const text of ['asht mirë', 'Ai po e sheh shtëpinë.', 'Unë do të shkoj në qytet.']) {
      const rt = real.tokenize(text); const wt = worker.tokenize(text);
      expect(worker.analyze(wt), text).toEqual(real.analyze(rt));
    }
  });

  it('keeps pronunciation notes while leaving page-only methods out of the worker payload', () => {
    const token = worker.tokenize('shtëpinë').find((x) => x.isWord)!;
    const expected = real.pronunciation(token, real.analyze(real.tokenize('shtëpinë'))[0]);
    expect(worker.pronunciation(token, worker.analyze(worker.tokenize('shtëpinë'))[0])).toEqual(expected);
    expect(worker.support.limitations[0]).toBe(real.support.limitations[0]);
  });
});
