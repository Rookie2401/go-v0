// The fuller Latin orientation (packages/language-packs/src/tutorial/la.ts): every word of its passage and of every practice sentence is
// read by the real analyser with a confirmed reading (a check of coverage, not of style), every practice target is a word of its sentence,
// and the steps the course relies on are there.
import { beforeAll, describe, expect, it } from 'vitest';
import { LA_PASSAGE, LA_TUTORIAL } from '../../packages/language-packs/src/tutorial/la';
import { laAdapter } from '../../src/adapters/la';
import { loadLatinLexicon } from '../../src/adapters/latin/lexicon-load';

beforeAll(async () => { await loadLatinLexicon(); }, 120_000);

const unread = (sentence: string): string[] => {
  const tokens = laAdapter.tokenize(sentence);
  const an = laAdapter.analyze(tokens, sentence);
  return tokens.flatMap((t, i) => {
    if (!t.isWord) return [];
    const top = an[i].candidates[0];
    return !top?.lemma || top.unconfirmed ? [t.surface] : [];
  });
};

describe('the Latin orientation', () => {
  it('has the sounds, the three patterns and the passage', () => {
    const ids = LA_TUTORIAL.steps.map((s) => s.id);
    for (const id of ['alphabet-latin', 'sounds-church', 'words-first', 'pattern-endings', 'pattern-verb-ending', 'pattern-est', 'passage-demo']) expect(ids).toContain(id);
    expect(LA_PASSAGE.sentences.length).toBeGreaterThanOrEqual(5);
    expect(LA_TUTORIAL).toMatchObject({ authorship: 'machine-drafted', reviewed: false });
  });

  it('every word of the passage and of every practice sentence is read, none of them a guess', () => {
    const sentences = [...LA_PASSAGE.sentences.map((s) => s.text), ...LA_TUTORIAL.steps.flatMap((s) => (s.practice ? [s.practice.sentence] : []))];
    for (const s of sentences) expect(unread(s), s).toEqual([]);
  });

  it('every practice target is a word of its sentence, and the passage raises no writing alarm', () => {
    for (const s of LA_TUTORIAL.steps) if (s.practice) {
      const words = laAdapter.tokenize(s.practice.sentence).filter((t) => t.isWord).map((t) => t.surface);
      expect(words, s.id).toContain(s.practice.target);
    }
    for (const { text } of LA_PASSAGE.sentences) {
      const tokens = laAdapter.tokenize(text);
      expect(laAdapter.checkProduction(tokens, laAdapter.analyze(tokens, text), text), text).toEqual([]);
    }
  });
});
