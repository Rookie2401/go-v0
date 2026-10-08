/**
 * Gold set: 74 Bokmål and 24 Nynorsk sentences with the expected lemma and part of speech per scored word.
 * MACHINE-DRAFTED expectations, pending native review: written by the model that built the analyzer, not by a native speaker,
 * and not independent of the lexicon (a development set; the blind holdout is a separate package). The numbers it prints are
 * the measured accuracy on this set only.
 */
import { describe, expect, it } from 'vitest';
import { NB_FRESH, NB_GOLD, NN_GOLD } from './norwegian-gold-data';
import { parseGold, scoreGold, scoreSentence } from './norwegian-gold-score';

const pct = (a: number, b: number): string => `${((100 * a) / b).toFixed(1)}%`;

describe('Norwegian gold set (machine-drafted, pending native review)', () => {
  it('the set is as large as promised and every annotation parses', () => {
    expect(NB_GOLD.length).toBeGreaterThanOrEqual(60);
    expect(NN_GOLD.length).toBeGreaterThanOrEqual(20);
    for (const g of [...NB_GOLD, ...NN_GOLD]) expect(parseGold(g.line).words.length, g.id).toBeGreaterThan(0);
    expect(new Set([...NB_GOLD, ...NN_GOLD].map((g) => g.id)).size).toBe(NB_GOLD.length + NN_GOLD.length);
    for (const kind of ['daily', 'fem', 'question', 'subordinate', 'particle', 'compound', 'testimony', 'bible', 'historical']) expect(NB_GOLD.some((g) => g.kind === kind), kind).toBe(true);
  });

  it('Bokmål: measured lemma and part-of-speech accuracy', () => {
    const s = scoreGold('nb', NB_GOLD);
    // eslint-disable-next-line no-console
    console.log(`[gold nb] sentences ${s.sentencesOk}/${s.sentences} (${pct(s.sentencesOk, s.sentences)}); words ${s.words}: lemma ${s.lemmaOk} (${pct(s.lemmaOk, s.words)}), POS ${s.posOk} (${pct(s.posOk, s.words)}), both ${s.bothOk} (${pct(s.bothOk, s.words)})\n${s.failures.join('\n')}`);
    expect(s.words).toBeGreaterThan(300);
    expect(s.lemmaOk / s.words).toBeGreaterThan(0.9);
    expect(s.posOk / s.words).toBeGreaterThan(0.9);
  });

  it('Nynorsk: measured lemma and part-of-speech accuracy', () => {
    const s = scoreGold('nn', NN_GOLD);
    // eslint-disable-next-line no-console
    console.log(`[gold nn] sentences ${s.sentencesOk}/${s.sentences} (${pct(s.sentencesOk, s.sentences)}); words ${s.words}: lemma ${s.lemmaOk} (${pct(s.lemmaOk, s.words)}), POS ${s.posOk} (${pct(s.posOk, s.words)}), both ${s.bothOk} (${pct(s.bothOk, s.words)})\n${s.failures.join('\n')}`);
    expect(s.words).toBeGreaterThan(80);
    expect(s.lemmaOk / s.words).toBeGreaterThan(0.85);
    expect(s.posOk / s.words).toBeGreaterThan(0.85);
  });

  it('Bokmål, second set (written after the lexicon was fixed; first-pass score before any change for it: lemma 95.7%, POS 96.6%, both 94.8%, 20/25 sentences, two of the misses were errors in the annotation)', () => {
    const s = scoreGold('nb', NB_FRESH);
    // eslint-disable-next-line no-console
    console.log(`[gold nb second set, after fixes] sentences ${s.sentencesOk}/${s.sentences}; words ${s.words}: lemma ${s.lemmaOk}, POS ${s.posOk}, both ${s.bothOk}`);
    expect(s.lemmaOk / s.words).toBeGreaterThan(0.9);
    expect(s.posOk / s.words).toBeGreaterThan(0.9);
  });

  it('the two feminine paradigms and both past forms give the same lemma', () => {
    for (const id of ['nb13', 'nb14']) expect(scoreSentence('nb', NB_GOLD.find((g) => g.id === id)!).ok, id).toBe(true);
    for (const id of ['nb17', 'nb18']) expect(scoreSentence('nb', NB_GOLD.find((g) => g.id === id)!).ok, id).toBe(true);
  });
});
