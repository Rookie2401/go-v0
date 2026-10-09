/**
 * The analyser against the REAL Albanian pack. The pinned sentences below are what adapter-sq@9 actually reports (probed 2026-10-09);
 * if the checker changes, these say so. Nothing here is a claim about what the checker misses beyond the cases named as misses.
 */
import { describe, expect, it } from 'vitest';
import { classOfCategory, createAnalyzer, hashText } from '../../packages/gotell/src/engine';
import { ISSUE_CLASSES } from '../../packages/gotell/src/types';
import type { DraftAnalysis, SentenceAnalysis } from '../../packages/gotell/src/types';
import { NOW, deepFreeze, norwegianAnalyzer, profile, realAnalyzer, realRuntime, withChecker } from './helpers';

const analyzer = realAnalyzer();
const one = (text: string, draftId = 'd1'): SentenceAnalysis => analyzer.analyzeDraft(draftId, text).sentences[0];

/** sentence → [category, class, confidence, flagged surface, corrected sentence] as the real checker and the analyser report them */
const PINNED: Array<[string, string, string, number, string, string | undefined]> = [
  ['Unë shkoj te libër.', 'definiteness', 'grammatically-wrong', 0.8, 'libër', 'Unë shkoj te libri.'],
  ['Unë shkoj në shtëpia.', 'case', 'grammatically-wrong', 0.75, 'shtëpia', 'Unë shkoj në shtëpinë.'],
  ['Unë kam një shtëpi e madh.', 'agreement', 'grammatically-wrong', 0.8, 'madh', 'Unë kam një shtëpi e madhe.'],
  ['Unë lexon librin.', 'conjugation', 'grammatically-wrong', 0.8, 'lexon', 'Unë lexoj librin.'],
  ['Unë dua të nuk shkoj.', 'particle', 'grammatically-wrong', 0.8, 'nuk', 'Unë dua të mos shkoj.'],
  ['Libër im është i mirë.', 'definiteness', 'grammatically-wrong', 0.75, 'Libër', 'Libri im është i mirë.'],
  ['Ai asht këtu.', 'dialect', 'regional-variation', 0.75, 'asht', 'Ai është këtu.'],
  ['Do shkoj nesër.', 'register', 'register-difference', 0.5, 'Do', 'Do të shkoj nesër.'],
  ['Unë shkoj me shoku.', 'case', 'uncertain-analysis', 0.45, 'me shoku', undefined],
];

describe('what the real Albanian checker finds, and how it is classed', () => {
  it.each(PINNED)('%s → %s / %s', (text, category, cls, confidence, surface, corrected) => {
    const s = one(text);
    expect(s.issues).toHaveLength(1);
    const [issue] = s.issues;
    expect(issue).toMatchObject({ category, class: cls, confidence, surface, sentenceIndex: 0 });
    expect(text.slice(issue.span.start, issue.span.end)).toBe(surface); // offsets point into the sentence as written
    expect(issue.provenance.source).toBe('adapter-checker');
    expect(issue.provenance.ref).toMatch(/^adapter-sq@\d+:/);
    expect(issue.hint.length).toBeGreaterThan(10);
    if (corrected) {
      expect(s.corrections).toHaveLength(1);
      expect(s.corrections[0].suggested).toBe(corrected);
      expect(s.corrections[0].original).toBe(text);
    } else {
      expect(s.corrections).toEqual([]); // the checker offered no replacement; none is invented
    }
  });

  it('pins the issue classes to the six the contract names, never inventing one', () => {
    for (const [text] of PINNED) for (const i of one(text).issues) expect(ISSUE_CLASSES).toContain(i.class);
  });

  it('a sentence with no detected problem gives no issues and says what was not checked', () => {
    const s = one('Unë lexoj librin.');
    expect(s.issues).toEqual([]);
    expect(s.corrections).toEqual([]);
    expect(s.checkerCoverage).toMatch(/found nothing/i);
    expect(s.checkerCoverage).toMatch(/does not show the sentence is correct/i);
    expect(s.checkerCoverage).toMatch(/limited coverage/i);
    expect(s.checkerCoverage).toMatch(/idiomaticity/i); // a named limit of the Albanian checker
  });

  it('the checker misses things it does not claim to see; the analyser does not invent them', () => {
    // all four are wrong Albanian that adapter-sq@9 does not flag (measured, not guessed)
    for (const text of ['Unë lexoj librin dhe ti lexoj librin.', 'Ana është e mirë dhe Mira është i mirë.', 'Unë lexoj libri.', 'Unë dua një libri.']) {
      const s = one(text);
      expect(s.issues, text).toEqual([]);
      expect(s.checkerCoverage).toMatch(/found nothing/i);
    }
  });
});

describe('classes', () => {
  it('maps every checker category to the class the brief names', () => {
    for (const c of ['spelling', 'morphology', 'conjugation', 'agreement', 'case', 'syntax', 'word-order', 'missing-function-word', 'definiteness', 'particle', 'postposition', 'classifier', 'segmentation']) {
      expect(classOfCategory(c), c).toBe('grammatically-wrong');
    }
    for (const c of ['ambiguity', 'clarity', 'meaning-change']) expect(classOfCategory(c), c).toBe('semantically-unclear');
    for (const c of ['collocation', 'idiomaticity', 'lexical-choice']) expect(classOfCategory(c), c).toBe('acceptable-but-awkward');
    expect(classOfCategory('dialect')).toBe('regional-variation');
    expect(classOfCategory('register')).toBe('register-difference');
    expect(classOfCategory('something-new')).toBe('uncertain-analysis'); // a category nobody mapped is doubt, not a mistake
  });

  it('a checker confidence under 0.5 downgrades any class to uncertain-analysis, and a high one never upgrades it', () => {
    const adapter = withChecker((_real, tokens) => [
      { category: 'agreement', tokenIndexes: [0, 1], message: 'low', confidence: 0.3, affectsMeaning: false },
      { category: 'clarity', tokenIndexes: [1], message: 'clear but sure', confidence: 0.9, affectsMeaning: true },
      { category: 'dialect', tokenIndexes: [2], message: 'dialect low', confidence: 0.4, affectsMeaning: false },
      { category: 'never-heard-of-it' as never, tokenIndexes: [3], message: 'unknown category, very sure', confidence: 0.95, affectsMeaning: false },
      { category: 'collocation', tokenIndexes: [tokens.length - 1], message: 'awkward', confidence: 0.6, affectsMeaning: false },
    ]);
    const s = realAnalyzer({ adapter }).analyzeDraft('d', 'Unë lexoj librin e mirë').sentences[0];
    const by = Object.fromEntries(s.issues.map((i) => [i.category, i]));
    expect(by.agreement.class).toBe('uncertain-analysis');
    expect(by.clarity.class).toBe('semantically-unclear');
    expect(by.clarity.affectsMeaning).toBe(true);
    expect(by.dialect.class).toBe('uncertain-analysis');
    expect(by['never-heard-of-it'].class).toBe('uncertain-analysis');
    expect(by.collocation.class).toBe('acceptable-but-awkward');
  });

  it('doubt about the word an issue is about (competing readings) caps the confidence and downgrades the class', () => {
    // "shoku" has two close readings in the real analysis (status conflicted); the real checker already reports 0.45 for it, so make
    // the checker sure and see the analysis override it
    const adapter = withChecker(() => [{ category: 'case', tokenIndexes: [2, 3], message: 'sure', confidence: 0.8, suggestion: { start: 13, end: 18, replacement: 'shokun' }, affectsMeaning: false }]);
    const s = realAnalyzer({ adapter }).analyzeDraft('d', 'Unë shkoj me shoku.').sentences[0];
    expect(s.issues[0].class).toBe('uncertain-analysis');
    expect(s.issues[0].confidence).toBeLessThan(0.5);
    // a function word that is merely ambiguous (the linking article) does not cast the same doubt: the checker already reads it in context
    const article = one('Djali e mirë.');
    expect(article.issues[0]).toMatchObject({ category: 'agreement', class: 'grammatically-wrong' });
  });

  it('a word the analyser has no reading for casts doubt too', () => {
    const adapter = withChecker(() => [{ category: 'case', tokenIndexes: [2], message: 'on an unknown word', confidence: 0.9, affectsMeaning: false }]);
    const s = realAnalyzer({ adapter }).analyzeDraft('d', 'Unë shkoj xyzqwk.').sentences[0];
    expect(s.issues[0].class).toBe('uncertain-analysis');
  });
});

describe('the draft is preserved', () => {
  const text = 'Unë shkoj te libër. Unë lexoj librin.  Ai asht këtu dhe Ana shkon në shtëpia.\nDo shkoj nesër.';

  it('hashes the exact text (FNV-1a 64) and never alters it', () => {
    const original = String(text);
    const a = analyzer.analyzeDraft('d1', text);
    expect(text).toBe(original);
    expect(a.textHash).toBe(hashText(original));
    expect(a.textHash).toMatch(/^[0-9a-f]{16}$/);
    expect(hashText('')).toBe('cbf29ce484222325'); // the FNV-1a 64 offset basis
    expect(hashText('a')).toBe('af63dc4c8601ec8c'); // published FNV-1a 64 test vector
    expect(analyzer.analyzeDraft('d1', text + ' ').textHash).not.toBe(a.textHash);
  });

  it('splits sentences with the pack and keeps each one verbatim, with offsets that point back into the draft', () => {
    const spans = analyzer.segment(text);
    expect(spans.map((s) => s.text)).toEqual(['Unë shkoj te libër.', 'Unë lexoj librin.', 'Ai asht këtu dhe Ana shkon në shtëpia.', 'Do shkoj nesër.']);
    for (const s of spans) expect(text.slice(s.start, s.end)).toBe(s.text);
    const a = analyzer.analyzeDraft('d1', text);
    expect(a.sentences.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(a.sentences.map((s) => s.text)).toEqual(spans.map((s) => s.text));
  });

  it('is deterministic, carries the analyser and pack version, and the injected clock', () => {
    const a = analyzer.analyzeDraft('d1', text);
    const b = analyzer.analyzeDraft('d1', text);
    expect(b).toEqual(a);
    expect(a).toMatchObject({ draftId: 'd1', languageId: 'sq', at: NOW });
    expect(a.analyzerId).toMatch(/^adapter-sq@\d+$/);
    expect(a.packVersion).toBe(analyzer.manifest.version);
  });

  it('accepts a Date clock', () => {
    const a = createAnalyzer({ ...deps(), now: () => new Date('2026-01-02T03:04:05.000Z') }).analyzeDraft('d', 'Unë lexoj.');
    expect(a.at).toBe('2026-01-02T03:04:05.000Z');
  });

  it('empty and blank text give no sentences', () => {
    expect(analyzer.analyzeDraft('d', '').sentences).toEqual([]);
    expect(analyzer.analyzeDraft('d', '  \n  ').sentences).toEqual([]);
  });

  it('reads a frozen profile and a frozen result without writing to either', () => {
    const p = deepFreeze(profile({ productive: ['lemma:sq:libër:NOUN'] }));
    const a = deepFreeze(analyzer.analyzeDraft('d1', text, p));
    expect(a.sentences.length).toBe(4);
    expect(p.productive).toEqual(['lemma:sq:libër:NOUN']);
  });
});

describe('units and familiarity', () => {
  it('derives unit ids as the extension parser does: a creditable lemma, else the normalised form', () => {
    const s = one('Unë shkoj te libër Xyzqwk.');
    expect(s.unitIds).toContain('lemma:sq:libër:NOUN');
    expect(s.unitIds).toContain('lemma:sq:shkoj:VERB');
    expect(s.unitIds).toContain('form:sq:xyzqwk'); // no reading: the form, not a made-up lemma
    expect(s.tokens).toEqual(['Unë', 'shkoj', 'te', 'libër', 'Xyzqwk']);
    expect(new Set(s.unitIds).size).toBe(s.unitIds.length);
  });

  it('familiarity is the share of word tokens among the writer’s productive or recognised units', () => {
    const none = one('Unë shkoj te libër.');
    expect(none.familiarity).toBe(0);
    const p = profile({ productive: ['lemma:sq:libër:NOUN'], recognisedOnly: ['lemma:sq:shkoj:VERB'] });
    const s = analyzer.analyzeDraft('d', 'Unë shkoj te libër.', p).sentences[0];
    expect(s.familiarity).toBe(0.5);
    const all = profile({ productive: s.unitIds });
    expect(analyzer.analyzeDraft('d', 'Unë shkoj te libër.', all).sentences[0].familiarity).toBe(1);
  });

  it('the issue names the units of the words it is about', () => {
    expect(one('Unë shkoj te libër.').issues[0].unitIds).toEqual(['lemma:sq:te:ADP', 'lemma:sq:libër:NOUN']);
  });

  it('reports the weakest status of the content words, or none when nothing was read', () => {
    expect(['high-confidence', 'provisional', 'conflicted']).toContain(one('Unë shkoj te libër.').analysisStatus);
    expect(one('Unë shkoj me shoku.').analysisStatus).toBe('conflicted');
    expect(one('xyzqwk qwxyz.').analysisStatus).toBe('none');
  });
});

describe('hints and explanations come from the pack, and say so when it has nothing', () => {
  it('Level 2 hint is the pack’s own description of the kind of problem; Level 4 explanation is its fuller text', () => {
    const i = one('Unë shkoj te libër.').issues[0];
    expect(i.hint).toMatch(/^Definiteness: Albanian adds “the” to the end of the noun/);
    expect(i.explanation).toMatch(/The ending also carries the case/);
    expect(i.hint.split('\n')).toHaveLength(1);
    expect(i.explanation!.length).toBeGreaterThan(i.hint.length);
    const c = one('Unë shkoj në shtëpia.').issues[0];
    expect(c.hint).toMatch(/^Case: A noun changes its ending/);
    expect(one('Unë dua të nuk shkoj.').issues[0].hint).toMatch(/subjunctive/);
  });

  it('a dialect or register note is described as such, never as a mistake', () => {
    expect(one('Ai asht këtu.').issues[0].hint).toMatch(/regional variation\), not necessarily a mistake/);
    expect(one('Do shkoj nesër.').issues[0].hint).toMatch(/register/);
  });

  it('a category the pack has no grammar note for is named plainly', () => {
    const adapter = withChecker(() => [{ category: 'spelling', tokenIndexes: [1], message: 'spelt oddly', confidence: 0.9, affectsMeaning: false }]);
    const i = realAnalyzer({ adapter }).analyzeDraft('d', 'Unë shkoj.').sentences[0].issues[0];
    expect(i.hint).toMatch(/spelling problem/);
    expect(i.explanation).toBeUndefined();
  });
});

describe('a language whose pack has no analyser', () => {
  it('splits and tokenises, finds nothing, and says nothing was checked', () => {
    const nb = norwegianAnalyzer();
    expect(nb.hasChecker).toBe(false);
    const a: DraftAnalysis = nb.analyzeDraft('d', 'Jeg leser en bok. Du leser.');
    expect(a.sentences.map((s) => s.text)).toEqual(['Jeg leser en bok.', 'Du leser.']);
    for (const s of a.sentences) {
      expect(s.issues).toEqual([]);
      expect(s.corrections).toEqual([]);
      expect(s.analysisStatus).toBe('none');
      expect(s.checkerCoverage).toMatch(/Nothing in this sentence was checked/);
      expect(s.unitIds.every((u) => u.startsWith('form:nb:'))).toBe(true);
    }
    expect(a.analyzerId).toBe('intl-tokenize@1');
  });

  it('refuses a pack for another language', () => {
    const { manifest, runtime } = deps();
    expect(() => createAnalyzer({ languageId: 'de', runtime, manifest, now: () => NOW })).toThrow(/pack is for sq/);
  });
});

describe('a checker that fails', () => {
  it('invents no issue and says the sentence was not checked', () => {
    const adapter = withChecker(() => { throw new Error('rule table missing'); });
    const s = realAnalyzer({ adapter }).analyzeDraft('d', 'Unë lexoj librin.').sentences[0];
    expect(s.issues).toEqual([]);
    expect(s.checkerCoverage).toMatch(/stopped on this sentence \(rule table missing\), so nothing in it was checked/);
  });
});

function deps() {
  const { manifest, runtime } = realRuntime();
  return { languageId: 'sq', manifest, runtime, now: () => NOW };
}
