/**
 * Corrections: built only from the checker's own replacements, each one validated (checker re-run, nothing added outside the edited
 * spans, meaning compared), and never applied. Real Albanian pack throughout; wrapped adapters only where the real checker does not
 * produce the shape under test (a deleted negation, a replacement that adds a noun, overlapping edits).
 */
import { describe, expect, it } from 'vitest';
import { hashText } from '../../packages/gotell/src/engine';
import { realAnalyzer, withChecker } from './helpers';

const analyzer = realAnalyzer();
const sentence = (text: string, a = analyzer) => a.analyzeDraft('d', text).sentences[0];

describe('every correction the real checker supports is validated', () => {
  it.each([
    'Unë shkoj te libër.', 'Unë shkoj në shtëpia.', 'Unë kam një shtëpi e madh.', 'Unë lexon librin.', 'Libër im është i mirë.', 'Ai asht këtu.', 'Do shkoj nesër.',
  ])('%s', (text) => {
    const s = sentence(text);
    expect(s.corrections).toHaveLength(1);
    const c = s.corrections[0];
    expect(c.validation).toEqual({ checkerClean: true, addsOnlyWithinSpans: true, issues: [] });
    expect(c.meaningChange).toBeUndefined();
    expect(c.issueIds).toEqual(s.issues.map((i) => i.issueId));
    expect(c.sentenceIndex).toBe(0);
    expect(c.original).toBe(text);
    expect(c.suggested).not.toBe(text);
    expect(c.explanation.length).toBeGreaterThan(20);
    expect(c.provenance.source).toBe('adapter-checker');
    // the suggestion is re-checked by the real checker, independently of the engine
    expect(analyzer.detect(c.suggested)).toEqual([]);
    // only the flagged word differs: same number of words, same text outside the edited place
    expect(c.suggested.split(' ').length).toBe(text.split(' ').length + (text === 'Do shkoj nesër.' ? 1 : 0));
  });

  it('keeps the learner’s capital letter and punctuation', () => {
    expect(sentence('Libër im është i mirë.').corrections[0].suggested.startsWith('Libri im')).toBe(true);
    expect(sentence('Unë shkoj në shtëpia!').corrections[0].suggested).toBe('Unë shkoj në shtëpinë!');
  });
});

describe('one combined repair when every issue has a replacement, else one per issue', () => {
  it('two issues with replacements → one correction that fixes both', () => {
    const s = sentence('Ai asht këtu dhe Ana shkon në shtëpia.');
    expect(s.issues.map((i) => i.category)).toEqual(['dialect', 'case']);
    expect(s.corrections).toHaveLength(1);
    expect(s.corrections[0].issueIds).toEqual(s.issues.map((i) => i.issueId));
    expect(s.corrections[0].suggested).toBe('Ai është këtu dhe Ana shkon në shtëpinë.');
    expect(s.corrections[0].validation.checkerClean).toBe(true);
    expect(s.corrections[0].confidence).toBe(0.75);
  });

  it('an issue without a replacement is not repaired, and the others are offered one by one with the remainder named', () => {
    const s = sentence('Unë shkoj me shoku dhe në shtëpia.');
    expect(s.issues.map((i) => [i.category, i.class])).toEqual([['case', 'uncertain-analysis'], ['case', 'grammatically-wrong']]);
    expect(s.corrections).toHaveLength(1);
    const c = s.corrections[0];
    expect(c.issueIds).toEqual([s.issues[1].issueId]);
    expect(c.suggested).toBe('Unë shkoj me shoku dhe në shtëpinë.');
    expect(c.validation.checkerClean).toBe(false);
    expect(c.validation.issues).toEqual(['still flagged: case at "me shoku"']);
    expect(c.validation.addsOnlyWithinSpans).toBe(true);
  });

  it('overlapping replacements cannot be combined: one correction per issue', () => {
    const adapter = withChecker(() => [
      { category: 'morphology', tokenIndexes: [1], message: 'first', confidence: 0.8, suggestion: { start: 4, end: 9, replacement: 'lexon' }, affectsMeaning: false },
      { category: 'agreement', tokenIndexes: [1, 2], message: 'second', confidence: 0.7, suggestion: { start: 6, end: 16, replacement: 'lexojmë librin' }, affectsMeaning: false },
    ]);
    const s = sentence('Unë lexoj librin.', realAnalyzer({ adapter }));
    expect(s.corrections).toHaveLength(2);
    expect(s.corrections.map((c) => c.issueIds.length)).toEqual([1, 1]);
    expect(s.corrections.map((c) => c.confidence)).toEqual([0.8, 0.7]);
  });

  it('a replacement outside the sentence is ignored, not applied', () => {
    const adapter = withChecker(() => [{ category: 'morphology', tokenIndexes: [1], message: 'bad offsets', confidence: 0.8, suggestion: { start: 4, end: 400, replacement: 'x' }, affectsMeaning: false }]);
    const s = sentence('Unë lexoj librin.', realAnalyzer({ adapter }));
    expect(s.issues).toHaveLength(1);
    expect(s.corrections).toEqual([]);
  });
});

describe('a correction that changes meaning is kept, flagged, and never applied', () => {
  it('real checker: të nuk → të mos swaps one negator for another, and the swap is flagged', () => {
    const text = 'Unë dua të nuk shkoj.';
    const s = sentence(text);
    expect(s.corrections).toHaveLength(1);
    expect(s.corrections[0].suggested).toBe('Unë dua të mos shkoj.');
    expect(s.corrections[0].meaningChange).toMatch(/Changes the negation: "nuk" becomes "mos"/);
    expect(s.corrections[0].validation.checkerClean).toBe(true); // checker-clean and still flagged: the two are separate questions
    // never applied: the sentence of the analysis is the learner’s, byte for byte
    expect(s.text).toBe(text);
  });

  it('a replacement that drops a negation says the sentence would say the opposite', () => {
    const adapter = withChecker(() => [{ category: 'syntax', tokenIndexes: [1], message: 'drop it', confidence: 0.8, suggestion: { start: 4, end: 7, replacement: '' }, affectsMeaning: false }]);
    const s = sentence('Unë nuk lexoj librin.', realAnalyzer({ adapter }));
    expect(s.corrections[0].suggested).toBe('Unë lexoj librin.');
    expect(s.corrections[0].meaningChange).toMatch(/Removes the negation "nuk": the sentence would say the opposite/);
  });

  it('a replacement that adds a negation is flagged', () => {
    const adapter = withChecker(() => [{ category: 'syntax', tokenIndexes: [1], message: 'add', confidence: 0.8, suggestion: { start: 4, end: 9, replacement: 'nuk lexoj' }, affectsMeaning: false }]);
    const s = sentence('Unë lexoj librin.', realAnalyzer({ adapter }));
    expect(s.corrections[0].meaningChange).toMatch(/Adds a negation "nuk"/);
  });

  it('dropping a time word is flagged as chronology', () => {
    const adapter = withChecker(() => [{ category: 'syntax', tokenIndexes: [2], message: 'drop', confidence: 0.8, suggestion: { start: 10, end: 14, replacement: '' }, affectsMeaning: false }]);
    const s = sentence('Unë lexoj tani.', realAnalyzer({ adapter }));
    expect(s.corrections[0].suggested).toBe('Unë lexoj.');
    expect(s.corrections[0].meaningChange).toMatch(/Drops the time word "tani"/);
  });

  it('swapping a key term (believe → know) is flagged', () => {
    const adapter = withChecker(() => [{ category: 'lexical-choice', tokenIndexes: [1], message: 'swap', confidence: 0.8, suggestion: { start: 4, end: 10, replacement: 'njoh' }, affectsMeaning: false }]);
    const s = sentence('Unë besoj Jezusin.', realAnalyzer({ adapter }));
    expect(s.corrections[0].meaningChange).toMatch(/key term/i);
  });
});

describe('never add content', () => {
  it('a replacement that brings in a noun the learner did not write is kept but marked as adding beyond the flagged place', () => {
    const adapter = withChecker(() => [{ category: 'syntax', tokenIndexes: [1], message: 'complete it', confidence: 0.8, suggestion: { start: 4, end: 9, replacement: 'lexoj librin' }, affectsMeaning: false }]);
    const s = sentence('Unë lexoj.', realAnalyzer({ adapter }));
    expect(s.corrections).toHaveLength(1);
    expect(s.corrections[0].validation.addsOnlyWithinSpans).toBe(false);
    expect(s.corrections[0].validation.issues).toContain('adds more content words than it removes');
  });

  it('adding a function word inside the edited span is allowed (do shkoj → do të shkoj)', () => {
    const c = sentence('Do shkoj nesër.').corrections[0];
    expect(c.suggested).toBe('Do të shkoj nesër.');
    expect(c.validation.addsOnlyWithinSpans).toBe(true);
  });

  it('a correction whose suggestion the checker still flags is reported as not clean, with what is not resolved', () => {
    // a checker that flags the same thing in whatever it is given
    const adapter = withChecker(() => [{ category: 'definiteness', tokenIndexes: [3], message: 'always', confidence: 0.8, suggestion: { start: 13, end: 18, replacement: 'libri' }, affectsMeaning: false }]);
    const s = sentence('Unë shkoj te libër.', realAnalyzer({ adapter }));
    expect(s.corrections[0].suggested).toBe('Unë shkoj te libri.');
    expect(s.corrections[0].validation.checkerClean).toBe(false);
    expect(s.corrections[0].validation.issues).toEqual(['not resolved: definiteness at "libri"']);
  });
});

describe('alternatives only when the pack knows a variant or a register note', () => {
  it('a Gheg form: the learner’s own wording stays on offer, with the checker’s note that nothing is wrong if Gheg is meant', () => {
    const c = sentence('Ai asht këtu.').corrections[0];
    expect(c.alternatives).toHaveLength(1);
    expect(c.alternatives[0].text).toBe('Ai asht këtu.');
    expect(c.alternatives[0].note).toMatch(/Gheg form/);
    expect(c.alternatives[0].note).toMatch(/Nothing is wrong if you mean to write Gheg/);
  });

  it('a register note: spoken “do shkoj” stays on offer beside the Standard future', () => {
    const c = sentence('Do shkoj nesër.').corrections[0];
    expect(c.alternatives).toHaveLength(1);
    expect(c.alternatives[0].note).toMatch(/not a mistake in speech/);
  });

  it('a grammatical error has no alternative: none is invented', () => {
    for (const text of ['Unë shkoj te libër.', 'Unë lexon librin.', 'Unë shkoj në shtëpia.']) expect(sentence(text).corrections[0].alternatives, text).toEqual([]);
  });
});

describe('a learner who rejects a correction leaves the analysis as it was', () => {
  it('re-analysing the unchanged text gives the same issues, corrections and ids', () => {
    const text = 'Unë shkoj te libër. Unë dua të nuk shkoj.';
    const before = analyzer.analyzeDraft('d1', text);
    const snapshot = JSON.stringify(before);
    // nothing in the engine takes a "rejection"; rejecting is leaving the text alone, and the analysis of that text is the same
    const after = analyzer.analyzeDraft('d1', text);
    expect(JSON.stringify(after)).toBe(snapshot);
    expect(after.textHash).toBe(hashText(text));
    expect(before.sentences[1].corrections[0].meaningChange).toBeDefined();
  });
});
