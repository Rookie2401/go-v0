/**
 * Confident misreadings found by the deck audit: "kisha" (I had / the church) and "kurse" (whereas / courses).
 * Every case goes through the real word-form engine and the sentence layer.
 */
import { describe, expect, it } from 'vitest';
import type { RawToken } from '../../src/core';
import { makeWordTokenizer } from '../../src/adapters/shared';
import { sqNormalize } from '../../src/adapters/albanian/orthography';
import { sqCandidates } from '../../src/adapters/albanian/analyze';
import { orderSqSentence } from '../../src/adapters/albanian/sentence';

const tokenize = makeWordTokenizer({ locale: 'sq', normalize: sqNormalize });

/** The first reading, and whether the runner-up is within 0.15 of it (undecided). */
function read(sentence: string, word: string) {
  const tokens: RawToken[] = tokenize(sentence);
  const base = tokens.map((t) => (t.isWord ? sqCandidates(t.normalized) : []));
  const out = orderSqSentence(tokens, base);
  const i = tokens.findIndex((t) => t.normalized === word);
  expect(i).toBeGreaterThanOrEqual(0);
  const [first, ...rest] = out[i];
  const rival = rest.find((c) => c.lemma !== first.lemma || c.pos !== first.pos);
  return { lemma: first.lemma, pos: first.pos, undecided: rival !== undefined && first.confidence - rival.confidence <= 0.15 };
}

describe('kisha: the verb before an object', () => {
  it.each([
    'Sot u zgjova herët, sepse kisha shumë punë.',
    'Kisha pak kohë dhe u largova.',
    'Kur erdhi nata, ndërsa kisha një libër në dorë, fjeta.',
  ])('reads kisha as kam: %s', (s) => {
    expect(read(s, 'kisha')).toMatchObject({ lemma: 'kam', pos: 'VERB', undecided: false });
  });
  it('reads kisha after "unë" as kam', () => {
    expect(read('Unë kisha një libër.', 'kisha')).toMatchObject({ lemma: 'kam', undecided: false });
  });
  it('leaves the church alone after a preposition', () => {
    expect(read('Shkova te kisha e vjetër.', 'kisha')).toMatchObject({ lemma: 'kishë', pos: 'NOUN' });
  });
  it('still reads kisha before a participle as the auxiliary', () => {
    expect(read('Kisha shkuar në qytet.', 'kisha')).toMatchObject({ lemma: 'kam' });
  });
});

describe('kurse: the conjunction between clauses', () => {
  it.each([
    'Unë lexova një libër, kurse im vëlla luajti futboll.',
    'Ai punon, kurse ajo pushon.',
    'Sot është ftohtë, kurse nesër do të bjerë shi.',
  ])('reads kurse after a comma as the conjunction: %s', (s) => {
    expect(read(s, 'kurse')).toMatchObject({ pos: 'SCONJ', undecided: false });
  });
  it('without a comma, is undecided between the conjunction and the plural noun', () => {
    expect(read('Ndoqa dy kurse në shkollë.', 'kurse').undecided).toBe(true);
  });
  it('after a comma but before "të" (a described noun), is left to the other rules (the noun)', () => {
    expect(read('Ofrojnë libra, kurse të reja dhe lloje të tjera.', 'kurse')).toMatchObject({ lemma: 'kurs', pos: 'NOUN' });
  });
});
