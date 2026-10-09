/**
 * Linguistic accuracy audit, part 1: the Albanian adapter on 70 FRESH sentences (323 words) written for this audit.
 *
 * READ THIS FIRST. The expectations in fixtures/albanian-unseen.json are one language MODEL's reading of each sentence,
 * written before the adapter was run on it. They are not a native speaker's judgement, and the adapter's own word list
 * was drafted by the same family of model, so correlated mistakes are possible in both. "Accuracy" here means
 * "agreement with that model's reading". The write-up is docs/ecosystem/audit/LINGUISTIC-ACCURACY.md.
 *
 * What this file pins: floors, "no worse than the first measurement" (2026-10-09, adapter-sq@9). A floor is the measured
 * count, not a target and not rounded up. If the adapter improves the tests still pass; if it regresses they fail.
 * Nothing here asserts that a known error is still an error.
 */
import { describe, expect, it } from 'vitest';
import { SQ_LETTERS } from '../../src/adapters/albanian/orthography';
import { sqAdapter } from '../../src/adapters/sq';
import { ADJUSTMENTS, disagreements, summarizeAdjusted } from './linguistic.adjust';
import { loadFixture, runAdapter, summarize } from './linguistic.measure';

const fx = loadFixture();
const res = runAdapter(fx);
const strict = summarize(res);
const adjusted = summarizeAdjusted(res);

describe('the fixture', () => {
  it('has at least 60 fresh sentences, annotated per word, each word marked confident or unsure', () => {
    expect(fx.sentences.length).toBeGreaterThanOrEqual(60);
    expect(strict.words).toBeGreaterThanOrEqual(300);
    for (const s of fx.sentences) for (const w of s.words) expect(['c', 'u']).toContain(w.conf);
    expect(fx.about).toMatch(/MODEL \(not a native speaker\)/);
  });

  it('covers every area the audit was asked about', () => {
    const cats = new Set(fx.sentences.map((s) => s.category));
    for (const c of ['definiteness', 'case', 'genitive', 'dative', 'ablative', 'plural', 'adjective', 'clitic', 'present', 'imperfect', 'aorist', 'aorist-irregular', 'future', 'subjunctive', 'negation', 'ambiguity', 'mwu']) expect(cats, c).toContain(c);
    expect(fx.production.errors).toHaveLength(20);
    expect(fx.production.correct).toHaveLength(10);
    expect(fx.gheg.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps its declared adjustments to the scoring, each one stated', () => {
    expect(ADJUSTMENTS.map((a) => a.id).sort()).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
  });
});

describe('tokenization and sentence segmentation (exact boundaries)', () => {
  it('every sentence tokenizes exactly as the model expected, ë and ç and the apostrophe form included', () => {
    expect(strict.tokenization.n).toBeGreaterThanOrEqual(70);
    expect(strict.tokenCount.n).toBeGreaterThanOrEqual(401);
  });
  it('splits "Si je? Jam mirë, faleminderit." into two sentences and leaves the rest whole', () => {
    expect(strict.sentenceSegmentation.n).toBeGreaterThanOrEqual(70);
  });
});

describe('lemma, part of speech (top candidate)', () => {
  it('STRICT (fixture as written): lemma and POS floors', () => {
    expect(strict.lemma.n).toBeGreaterThanOrEqual(292); // of 323
    expect(strict.pos.n).toBeGreaterThanOrEqual(289);
    expect(strict.lemmaConfident.n).toBeGreaterThanOrEqual(279); // of 310 words the model was confident about
    expect(strict.coverage.n).toBeGreaterThanOrEqual(319); // words the word list vouches for; 4 are outside it
  });
  it('ADJUSTED (scheme differences neutralised, see ADJUSTMENTS): lemma and POS floors', () => {
    expect(adjusted.lemma.n).toBeGreaterThanOrEqual(313);
    expect(adjusted.pos.n).toBeGreaterThanOrEqual(311);
    expect(adjusted.lemmaKnown.n).toBeGreaterThanOrEqual(313);
  });
});

describe('morphology (feature exact match, and per feature)', () => {
  it('STRICT: whole-word feature exact match and the lenient count (a union that contains the value)', () => {
    expect(strict.morphExact.n).toBeGreaterThanOrEqual(173); // of 247 words with asserted features
    expect(strict.morphLenient.n).toBeGreaterThanOrEqual(213);
  });
  it('ADJUSTED: feature exact match, lenient match, and whole-reading (lemma + POS + features)', () => {
    expect(adjusted.morphExact.n).toBeGreaterThanOrEqual(187); // of 246
    expect(adjusted.morphLenient.n).toBeGreaterThanOrEqual(231);
    expect(adjusted.wholeReading.n).toBeGreaterThanOrEqual(304); // of 323
  });
  it('per feature: nothing is wrong more often than at the first measurement', () => {
    const wrong = (k: string) => adjusted.perFeature[k]?.wrong ?? 0;
    expect(wrong('Person')).toBeLessThanOrEqual(2);
    expect(wrong('Mood')).toBeLessThanOrEqual(2);
    expect(wrong('Number')).toBeLessThanOrEqual(1);
    for (const k of ['Case', 'Definite', 'Gender', 'Tense', 'Clitic', 'VerbForm', 'Voice']) expect(wrong(k), k).toBe(0);
    expect(adjusted.perFeature.Definite.exact).toBeGreaterThanOrEqual(67);
    expect(adjusted.perFeature.Tense.exact).toBeGreaterThanOrEqual(70);
  });
  it('Case is often a union ("Nom,Acc") rather than wrong: the exact count does not fall', () => {
    expect(adjusted.perFeature.Case.exact).toBeGreaterThanOrEqual(56);
  });
});

describe('contextual disambiguation (words flagged ambiguous: e, i, të, më, u, do, pa, ne, jetë …)', () => {
  it('the sentence leaves the right reading on top at least as often as at the first measurement, and never breaks a right isolated reading', () => {
    expect(strict.ambiguity.flagged).toBeGreaterThanOrEqual(41);
    expect(adjusted.ambiguity.correctInContext.n).toBeGreaterThanOrEqual(36);
    expect(strict.ambiguity.contextFixed).toBeGreaterThanOrEqual(6);
    expect(strict.ambiguity.contextBroke).toBe(0);
    expect(adjusted.ambiguity.contextFixed).toBeGreaterThanOrEqual(8);
    expect(adjusted.ambiguity.contextBroke).toBe(0);
    expect(adjusted.ambiguity.rightReadingNotInList).toBeLessThanOrEqual(1);
    // context must help: more right in the sentence than the word alone
    expect(adjusted.ambiguity.correctInContext.n).toBeGreaterThan(adjusted.ambiguity.correctInIsolation.n);
  });
});

describe('phrase detection and constructions (the adapter has no parser: patterns are all it offers for syntax)', () => {
  it('finds the multiword units the model expected, at least as many as at the first measurement', () => {
    expect(strict.phrases.foundExactCore).toBeGreaterThanOrEqual(11); // of 14 confident ones
  });
  it('finds the constructions the sentence holds (88 after the declared completions) and fires at most one that is not there', () => {
    expect(adjusted.patterns.found).toBeGreaterThanOrEqual(85);
    expect(adjusted.patterns.extraFired).toBeLessThanOrEqual(1);
  });
  it('gives no dependency relation: `role` is a descriptive label of a function word, never head + relation', () => {
    const roles = res.flatMap((r) => r.words.flatMap((w) => w.candidates.map((c) => c.role).filter(Boolean))) as string[];
    expect(roles.length).toBeGreaterThan(0);
    for (const role of roles) expect(role).not.toMatch(/^(nsubj|obj|iobj|obl|amod|det|case|nmod|root|advmod|aux|cop)\b/);
    expect(sqAdapter.support.limitations.join(' ')).toMatch(/no parser/i);
  });
});

describe('pronunciation metadata', () => {
  it('names exactly the letters an English reader does not sound as written, in every one of the 323 words', () => {
    expect(strict.pronunciation.letterSetCorrect).toBeGreaterThanOrEqual(323);
  });
  it('the IPA the adapter teaches for each of those letters is the standard Albanian value (an independent table)', () => {
    const IPA: Record<string, string> = { 'ë': 'ə', 'ç': 'tʃ', c: 'ts', dh: 'ð', gj: 'ɟ', j: 'j', ll: 'ɫ', nj: 'ɲ', q: 'c', rr: 'r', sh: 'ʃ', th: 'θ', x: 'dz', xh: 'dʒ', y: 'y', zh: 'ʒ' };
    for (const [letter, ipa] of Object.entries(IPA)) expect(SQ_LETTERS.find((l) => l.letter === letter)?.ipa, letter).toBe(ipa);
  });
});

describe('the Gheg probes (kept out of the statistics; Gheg is not analysed as a variety)', () => {
  it('degrades without throwing and flags what it recognises as Gheg', () => {
    for (const g of fx.gheg) {
      const toks = sqAdapter.tokenize(g.text);
      const an = sqAdapter.analyze(toks);
      expect(() => sqAdapter.checkProduction!(toks, an, g.text)).not.toThrow();
    }
    const t = sqAdapter.tokenize(fx.gheg[0].text);
    const lemmas = sqAdapter.analyze(t).map((a) => a.candidates[0]?.lemma);
    expect(lemmas).toContain('dua'); // due
    expect(lemmas).toContain('shkoj'); // shkue
  });
});

describe('every adjusted disagreement is listed (the report quotes this list)', () => {
  it('has no more than the 19 disagreements of the first measurement', () => {
    expect(disagreements(res).length).toBeLessThanOrEqual(19);
  });
});
