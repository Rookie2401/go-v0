/**
 * The ladder gate counts proper nouns and numerals as known "by definition" (src/ladder/analyse.ts), but not a name that the
 * adapter only GUESSED from the text's own word marks (Thai: an unlisted U+200B chunk, `unconfirmed` + `notes.nameGuess`).
 * Without this, the Open Thai Common Version looked about eight points easier than it is (the plan's finding 5, Mark 1).
 */
import { describe, expect, it } from 'vitest';
import { thAdapter } from '../../src/adapters/th';
import type { AnalysisCandidate, LanguageAdapter, RawToken } from '../../src/core';
import type { CorpusDocument } from '../../src/ingest';
import { Progress, analyseDocument, isNameGuess } from '../../src/ladder';

const ZW = String.fromCharCode(0x200b);
const docOf = (...sentences: string[]): CorpusDocument =>
  ({ schemaVersion: 2, id: 'x', lang: 'th', title: 'x', contentType: 'story', sections: [{ paragraphs: [{ sentences: sentences.map((text) => ({ text })) }] }] }) as unknown as CorpusDocument;

/** A word-per-token adapter whose readings come from a table (so each kind of PROPN can be tested without a language). */
const stub = (table: Record<string, AnalysisCandidate[]>): LanguageAdapter => ({
  segmentSentences: (t: string) => [{ start: 0, end: t.length, text: t }],
  tokenize: (s: string): RawToken[] => s.split(' ').map((w, i) => ({ surface: w, start: i, end: i + w.length, isWord: true, normalized: w })),
  analyze: (tokens: RawToken[]) => tokens.map((t) => ({ token: t, candidates: table[t.normalized] ?? [], analyzer: 'stub' })),
  detectPatterns: () => [],
}) as unknown as LanguageAdapter;

const propn = (lemma: string, extra: Partial<AnalysisCandidate> = {}): AnalysisCandidate => ({ lemma, pos: 'PROPN', morph: {}, confidence: 0.9, ...extra });

describe('the gate and a guessed name', () => {
  it('a listed name is known by definition; a name guessed from word marks is an ordinary lemma', () => {
    const adapter = stub({
      Anna: [propn('Anna')], // on the word list
      Zorb: [propn('Zorb', { unconfirmed: true, notes: { nameGuess: 'yes', source: 'rule' } })], // a guess from the text's word marks
      Boro: [propn('Boro', { unconfirmed: true, notes: { rule: 'a capital inside the sentence' } })], // another adapter's capital-letter guess
      cat: [{ lemma: 'cat', pos: 'NOUN', morph: {}, confidence: 0.9 }],
    });
    const stat = analyseDocument(adapter, docOf('Anna Zorb Zorb Boro cat'));
    expect(stat.words).toBe(5);
    expect(stat.auto).toBe(2); // Anna and Boro
    expect([...stat.lemmas.entries()].sort()).toEqual([['cat', 1], ['zorb', 2]]);
    const progress = new Progress(3);
    expect(progress.coverage(stat).cov3).toBeCloseTo(2 / 5);
    expect(progress.newLemmas(stat).sort()).toEqual(['cat', 'zorb']);
  });

  it('isNameGuess is only the unconfirmed + nameGuess pair', () => {
    expect(isNameGuess(propn('a', { unconfirmed: true, notes: { nameGuess: 'yes' } }))).toBe(true);
    expect(isNameGuess(propn('a', { unconfirmed: true }))).toBe(false);
    expect(isNameGuess(propn('a', { notes: { nameGuess: 'yes' } }))).toBe(false);
    expect(isNameGuess(undefined)).toBe(false);
  });

  it('Thai: the OTCV chunk the word list lacks counts as a lemma that must be learnt; a listed name and a numeral stay free', () => {
    // ทัปปูวาห์ (not on the list: a guess), อับราม (listed name), สอง (numeral), จง (an ordinary word the list lacks, read as a name guess)
    const text = ['อับราม', 'กับ', 'ทัปปูวาห์', 'สอง', 'จงฮาชาบิยาห์'].join(ZW);
    const stat = analyseDocument(thAdapter, docOf(text));
    expect(stat.lemmas.has('ทัปปูวาห์')).toBe(true);
    expect(stat.lemmas.has('อับราม')).toBe(false); // a listed name is auto
    expect(stat.auto).toBeGreaterThanOrEqual(2); // อับราม and สอง
    expect(stat.words - stat.auto).toBe([...stat.lemmas.values()].reduce((a, b) => a + b, 0));
  });
});
