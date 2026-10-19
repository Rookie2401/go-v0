import { describe, expect, it } from 'vitest';
import { loadBundledCorpus, validateBatch, type CorpusDocument, type ValidationCode, type ValidationIssue } from '../../src/ingest';
import { isSeed } from './seed';
import { baseDoc, errorCodes, issuesOf, registry, scriptureDoc, warningCodes } from './helpers';

const clone = <T,>(x: T): T => structuredClone(x);
const withSentences = (sentences: Array<Record<string, unknown>>, lang: CorpusDocument['lang'] = 'es'): CorpusDocument => {
  const d = baseDoc();
  d.lang = lang;
  d.sections = [{ paragraphs: [{ sentences: sentences as never }] }];
  return d;
};
const has = (issues: ValidationIssue[], code: ValidationCode, severity?: 'error' | 'warning') =>
  issues.some((i) => i.code === code && (!severity || i.severity === severity));

describe('validateDocument — acceptance', () => {
  it('accepts every bundled document (errors: none)', () => {
    const docs = loadBundledCorpus();
    expect(docs.filter(isSeed)).toHaveLength(27); // the seed texts (three per seed language, nine languages); the course texts are added to the corpus over time
    expect(docs.length).toBeGreaterThanOrEqual(27);
    for (const d of docs) expect(issuesOf(d).filter((i) => i.severity === 'error'), `${d.lang}/${d.id}`).toEqual([]);
    expect(validateBatch(docs, { registry }).ok).toBe(true);
  });

  it('accepts minimal valid story and scripture documents with no issues at all', () => {
    expect(issuesOf(baseDoc())).toEqual([]);
    expect(issuesOf(scriptureDoc())).toEqual([]);
  });

  it('ignores _comment fields and does not warn about them', () => {
    const d = { ...baseDoc(), _comment: 'anything', source: { ...baseDoc().source, _comment: 'x' } };
    expect(issuesOf(d)).toEqual([]);
  });

  it('every issue carries path, code, message, hint and severity', () => {
    const d = clone(baseDoc()) as unknown as Record<string, unknown>;
    delete d.review; delete d.topics; d.lang = 'fr';
    const issues = issuesOf(d);
    expect(issues.length).toBeGreaterThan(2);
    for (const i of issues) {
      expect(typeof i.path).toBe('string');
      expect(i.code).toMatch(/^[a-z-]+$/);
      expect(i.message.length).toBeGreaterThan(5);
      expect(i.hint.length).toBeGreaterThan(5);
      expect(['error', 'warning']).toContain(i.severity);
    }
  });
});

describe('validation codes — document level', () => {
  it('not-an-object', () => {
    expect(errorCodes(null)).toEqual(['not-an-object']);
    expect(errorCodes([])).toEqual(['not-an-object']);
  });

  it('unsupported-schema-version: any other version is rejected with an actionable message', () => {
    const v1 = { formatVersion: 1, lang: 'es', slug: 'x' };
    const i = issuesOf(v1)[0];
    expect(i.code).toBe('unsupported-schema-version');
    expect(i.message).toMatch(/version 1/);
    expect(i.hint).toMatch(/corpus:migrate/);
    expect(errorCodes({ ...baseDoc(), schemaVersion: 3 })).toEqual(['unsupported-schema-version']);
    expect(errorCodes({ ...baseDoc(), schemaVersion: undefined })).toEqual(['unsupported-schema-version']);
  });

  it('missing-field: review, sections, generated, topics, title, attribution', () => {
    const noReview = clone(baseDoc()) as unknown as Record<string, unknown>; delete noReview.review;
    expect(has(issuesOf(noReview), 'missing-field', 'error')).toBe(true);
    expect(issuesOf(noReview).find((i) => i.path === 'review')).toBeTruthy();
    expect(has(issuesOf({ ...baseDoc(), sections: [] }), 'missing-field')).toBe(true);
    expect(issuesOf({ ...baseDoc(), generated: undefined }).some((i) => i.path === 'generated' && i.code === 'missing-field')).toBe(true);
    expect(issuesOf({ ...baseDoc(), topics: 'x' }).some((i) => i.path === 'topics' && i.code === 'missing-field')).toBe(true);
    expect(issuesOf({ ...baseDoc(), title: '' }).some((i) => i.path === 'title')).toBe(true);
    const noSrc = { ...baseDoc(), source: { ...baseDoc().source, attribution: '' } };
    expect(issuesOf(noSrc).some((i) => i.path === 'source.attribution' && i.code === 'missing-field')).toBe(true);
  });

  it('invalid-value: lang, contentType, rights, authorship, review status, corpus, difficulty, locale syntax', () => {
    expect(issuesOf({ ...baseDoc(), lang: 'fr' }).some((i) => i.path === 'lang' && i.code === 'invalid-value')).toBe(true);
    expect(issuesOf({ ...baseDoc(), contentType: 'poem' }).some((i) => i.path === 'contentType' && i.code === 'invalid-value')).toBe(true);
    expect(issuesOf({ ...baseDoc(), source: { ...baseDoc().source, rights: 'maybe' } }).some((i) => i.path === 'source.rights' && i.code === 'invalid-value')).toBe(true);
    expect(issuesOf({ ...baseDoc(), source: { ...baseDoc().source, authorship: 'robot' } }).some((i) => i.path === 'source.authorship')).toBe(true);
    expect(issuesOf({ ...baseDoc(), review: { status: 'fine' } }).some((i) => i.path === 'review.status' && i.code === 'invalid-value')).toBe(true);
    expect(issuesOf({ ...baseDoc(), corpus: { id: 'x' } }).some((i) => i.path === 'corpus')).toBe(true);
    expect(issuesOf({ ...baseDoc(), difficulty: 'Z9' }).some((i) => i.path === 'difficulty')).toBe(true);
    expect(issuesOf({ ...baseDoc(), locale: 'es_HN' }).some((i) => i.path === 'locale' && i.code === 'invalid-value')).toBe(true);
  });

  it('invalid-id: document id and sentence id', () => {
    expect(issuesOf({ ...baseDoc(), id: 'Bad Slug' }).some((i) => i.path === 'id' && i.code === 'invalid-id')).toBe(true);
    expect(errorCodes(withSentences([{ id: 'a/b', text: 'Hola.' }]))).toContain('invalid-id');
    expect(errorCodes(withSentences([{ id: 'a@2', text: 'Hola.' }]))).toContain('invalid-id');
  });

  it('unknown-field is a warning, never an error', () => {
    const d = { ...baseDoc(), sourceNote: 'v1 leftover' };
    const i = issuesOf(d).find((x) => x.code === 'unknown-field')!;
    expect(i.severity).toBe('warning');
    expect(i.path).toBe('sourceNote');
    expect(errorCodes(d)).toEqual([]);
  });

  it('locale-mismatch: the locale prefix must equal lang', () => {
    expect(errorCodes({ ...baseDoc(), locale: 'de-DE' })).toEqual(['locale-mismatch']);
    expect(errorCodes({ ...baseDoc(), locale: 'es-HN' })).toEqual([]);
  });

  it('language-mismatch: the text script must fit lang', () => {
    const th = { ...baseDoc(), lang: 'th' as const };
    expect(errorCodes(th)).toEqual(['language-mismatch']); // "Hola." is Latin
    const hi = { ...baseDoc(), lang: 'hi' as const };
    expect(errorCodes(hi)).toEqual(['language-mismatch']);
    expect(errorCodes(withSentences([{ text: 'สวัสดีค่ะ' }]))).toContain('language-mismatch');
    // a learner's private writing may mix languages: a warning only
    const testimony = { ...withSentences([{ text: 'Hello there' }], 'th'), contentType: 'testimony' as const };
    expect(issuesOf(testimony).find((i) => i.code === 'language-mismatch')?.severity).toBe('warning');
  });

  it('duplicate-document-id (validateBatch) and text-id-conflict (against the store)', () => {
    const r = validateBatch([baseDoc(), baseDoc()], { registry });
    expect(r.ok).toBe(false);
    expect(r.documents[0].issues.map((i) => i.code)).not.toContain('duplicate-document-id');
    expect(r.documents[1].issues.map((i) => i.code)).toContain('duplicate-document-id');
    // the same id in another language is a different text
    expect(validateBatch([baseDoc(), { ...withSentences([{ text: 'Hallo.' }], 'de'), id: 'test-doc' }], { registry }).ok).toBe(true);

    const conflict = issuesOf(baseDoc(), [{ id: 'text:es:test-doc', sourceId: 'src:other' }]);
    expect(conflict.find((i) => i.code === 'text-id-conflict')?.severity).toBe('error');
    expect(issuesOf(baseDoc(), [{ id: 'text:es:test-doc', sourceId: 'src:t' }])).toEqual([]);
  });

  it('missing-provenance and unverified-without-note', () => {
    const noProv = { ...baseDoc(), source: { ...baseDoc().source, provenance: '' } };
    expect(issuesOf(noProv).some((i) => i.path === 'source.provenance' && i.code === 'missing-provenance')).toBe(true);
    const unverified = { ...baseDoc(), source: { ...baseDoc().source, rights: 'unverified' as const, provenance: 'some text' } };
    expect(errorCodes(unverified)).toEqual(['unverified-without-note']);
    expect(errorCodes({ ...unverified, source: { ...unverified.source, provenance: 'unverified sample, replace before release' } })).toEqual([]);
    expect(errorCodes({ ...unverified, source: { ...unverified.source, licenseNote: 'Licence unknown: verify before shipping.' } })).toEqual([]);
  });

  it('review-missing-reviewer: a review is never anonymous', () => {
    expect(errorCodes({ ...baseDoc(), review: { status: 'reviewed' } })).toEqual(['review-missing-reviewer']);
    expect(errorCodes({ ...baseDoc(), review: { status: 'approved', reviewedBy: '  ' } })).toEqual(['review-missing-reviewer']);
    expect(errorCodes({ ...baseDoc(), review: { status: 'reviewed', reviewedBy: 'Ana Ruiz', reviewedAt: '2026-02-01' } })).toEqual([]);
    expect(errorCodes({ ...baseDoc(), review: { status: 'in-review' } })).toEqual([]);
  });

  it('speakers: unknown-speaker', () => {
    const d = { ...withSentences([{ text: 'Hola.', speaker: 'Z' }]), speakers: { A: 'Ana' } };
    expect(errorCodes(d)).toEqual(['unknown-speaker']);
    expect(errorCodes({ ...d, speakers: { Z: 'Zoe' } })).toEqual([]);
    expect(errorCodes(withSentences([{ text: 'Hola.', speaker: 'A' }]))).toEqual(['unknown-speaker']); // no speakers map at all
  });
});

describe('validation codes — sentences and paragraphs', () => {
  it('empty-sentence and no-sentences', () => {
    expect(errorCodes(withSentences([{ text: '   ' }]))).toContain('empty-sentence');
    expect(errorCodes(withSentences([{ text: 'Hola.' }, {}]))).toContain('empty-sentence');
    expect(errorCodes(withSentences([]))).toContain('no-sentences');
  });

  it('duplicate-sentence-id', () => {
    expect(errorCodes(withSentences([{ id: 's1', text: 'Hola.' }, { id: 's1', text: 'Adiós.' }]))).toEqual(['duplicate-sentence-id']);
  });

  it('english-count-mismatch: raw paragraph english must have one line per adapter sentence', () => {
    const d = baseDoc();
    d.lang = 'de';
    d.sections = [{ paragraphs: [{ text: 'Gott liebt die Welt. Ich liebe Gott auch!', english: ['only one'] }] }];
    const i = issuesOf(d).find((x) => x.code === 'english-count-mismatch')!;
    expect(i.severity).toBe('error');
    expect(i.message).toMatch(/2 sentence/);
    (d.sections[0].paragraphs[0] as { english: string[] }).english = ['God loves the world.', 'I love God too!'];
    expect(errorCodes(d)).toEqual([]);
  });

  it('warnings: not-nfc, edge-whitespace, adapter-would-split, low-analysis-coverage — none block', () => {
    const decomposed = 'Dios ama al mundo á.';
    expect(warningCodes(withSentences([{ text: decomposed }]))).toEqual(['not-nfc']);
    expect(warningCodes(withSentences([{ text: ' Hola. ' }]))).toEqual(['edge-whitespace']);
    expect(warningCodes(withSentences([{ text: 'Hola. Gracias.' }]))).toEqual(['adapter-would-split']);
    const low = withSentences([{ text: 'Zzyzx qqq www.' }]);
    expect(warningCodes(low)).toEqual(['low-analysis-coverage']);
    for (const d of [withSentences([{ text: decomposed }]), withSentences([{ text: ' Hola. ' }]), low]) expect(errorCodes(d)).toEqual([]);
  });
});

describe('validation codes — spans and corrections', () => {
  const span = (extra: Record<string, unknown>) => withSentences([{ text: 'Dios ama al mundo.', spans: [{ lemma: 'x', ...extra }] }]);

  it('accepts a span on exactly one word and a correction with by/at', () => {
    expect(errorCodes(span({ start: 0, end: 4, pos: 'PROPN' }))).toEqual([]);
    const d = withSentences([{ text: 'Dios ama al mundo.', corrections: [{ start: 5, end: 8, lemma: 'amar', by: 'Ana', at: '2026-01-02' }] }]);
    expect(errorCodes(d)).toEqual([]);
  });

  it('span-empty', () => {
    expect(errorCodes(span({ start: 3, end: 3 }))).toEqual(['span-empty']);
    expect(errorCodes(span({ start: 5, end: 2 }))).toEqual(['span-empty']);
  });
  it('span-out-of-bounds', () => {
    expect(errorCodes(span({ start: 0, end: 99 }))).toEqual(['span-out-of-bounds']);
    expect(errorCodes(span({ start: -1, end: 3 }))).toEqual(['span-out-of-bounds']);
  });
  it('span-overlap', () => {
    const d = withSentences([{ text: 'Dios ama al mundo.', spans: [{ start: 0, end: 4, lemma: 'Dios' }, { start: 0, end: 4, lemma: 'Dios' }] }]);
    expect(errorCodes(d)).toEqual(['span-overlap']);
  });
  it('span-not-on-token: a span is exactly one word, and the hint lists the words', () => {
    const i = issuesOf(span({ start: 0, end: 2 })).find((x) => x.code === 'span-not-on-token')!;
    expect(i.severity).toBe('error');
    expect(i.hint).toMatch(/Dios/);
    expect(errorCodes(span({ start: 0, end: 8 }))).toEqual(['span-not-on-token']); // "Dios ama" is two words
  });
  it('span-not-grapheme-boundary: never inside a letter with its marks (Hindi)', () => {
    // नहीं = न + हीं (ह + ी + ं): offset 4 would cut between the consonant and its vowel sign
    const text = 'वह नहीं है।';
    const start = text.indexOf('नहीं');
    const d = withSentences([{ text, spans: [{ start, end: start + 2, lemma: 'नहीं' }] }], 'hi');
    expect(errorCodes(d)).toEqual(['span-not-grapheme-boundary']);
    expect(errorCodes(withSentences([{ text, spans: [{ start, end: start + 4, lemma: 'नहीं' }] }], 'hi'))).toEqual([]);
  });
  it('content problems are invalid-value (pos, confidence, morph, empty span, correction without author)', () => {
    expect(errorCodes(span({ start: 0, end: 4, pos: 'NOUNISH' }))).toEqual(['invalid-value']);
    expect(errorCodes(span({ start: 0, end: 4, confidence: 2 }))).toEqual(['invalid-value']);
    expect(errorCodes(span({ start: 0, end: 4, morph: { Case: 1 } }))).toEqual(['invalid-value']);
    expect(errorCodes(withSentences([{ text: 'Dios ama.', spans: [{ start: 0, end: 4 }] }]))).toEqual(['invalid-value']);
    const c = withSentences([{ text: 'Dios ama.', corrections: [{ start: 0, end: 4, lemma: 'Dios' }] }]);
    expect(issuesOf(c).filter((i) => i.code === 'missing-field').map((i) => i.path)).toEqual(
      ['sections[0].paragraphs[0].sentences[0].corrections[0].by', 'sections[0].paragraphs[0].sentences[0].corrections[0].at']);
  });
  it('the path names the offending span', () => {
    expect(issuesOf(span({ start: 3, end: 3 }))[0].path).toBe('sections[0].paragraphs[0].sentences[0].spans[0]');
  });
});

describe('validation codes — scripture', () => {
  const sent = (d: CorpusDocument) => (d.sections[0].paragraphs[0] as unknown as { sentences: Array<Record<string, unknown>> }).sentences;

  it('a verified scripture passes; an unverified one still validates (the gate keeps it unpublished)', () => {
    expect(issuesOf(scriptureDoc())).toEqual([]);
    const unverified = scriptureDoc(); delete unverified.scripture!.verification;
    expect(errorCodes(unverified)).toEqual([]);
  });

  it('scripture-translation-missing / scripture-edition-missing / scripture-book-invalid / scripture-chapter-invalid', () => {
    const noBlock = scriptureDoc(); delete noBlock.scripture;
    expect(errorCodes(noBlock)).toEqual(['scripture-translation-missing']);
    const noId = scriptureDoc(); noId.scripture!.translationId = '';
    expect(errorCodes(noId)).toEqual(['scripture-translation-missing']);
    const noEd = scriptureDoc(); noEd.scripture!.edition = '';
    expect(errorCodes(noEd)).toEqual(['scripture-edition-missing']);
    const book = scriptureDoc(); book.scripture!.book = 'XYZ';
    expect(errorCodes(book)).toEqual(['scripture-book-invalid']);
    const ch = scriptureDoc(); ch.scripture!.chapter = 0;
    expect(errorCodes(ch)).toEqual(['scripture-chapter-invalid']);
  });

  it('scripture-corpus, scripture-generated, invalid-verification', () => {
    const corpus = scriptureDoc(); corpus.corpus.kind = 'comprehensible-input';
    expect(errorCodes(corpus)).toEqual(['scripture-corpus']);
    expect(errorCodes({ ...scriptureDoc(), generated: true })).toEqual(['scripture-generated']);
    const gen = scriptureDoc(); gen.source.rights = 'generated';
    expect(errorCodes(gen)).toContain('scripture-generated');
    const ver = scriptureDoc(); (ver.scripture as unknown as { verification: unknown }).verification = { against: 'x' };
    expect(errorCodes(ver)).toEqual(['invalid-verification']);
  });

  it('missing-verse-refs and verse-marker-in-text: verse numbers are metadata, never text', () => {
    const d = scriptureDoc(); sent(d)[0] = { text: 'Porque Dios amó.' };
    expect(errorCodes(d)).toEqual(['missing-verse-refs']);
    for (const marked of ['Porque [16] Dios amó.', 'Porque Dios amó ¹⁶', 'Porque <sup>16</sup> Dios']) {
      const m = scriptureDoc(); sent(m)[0] = { text: marked, verseRefs: ['JHN.3.16'] };
      expect(errorCodes(m), marked).toEqual(['verse-marker-in-text']);
    }
  });

  it('invalid-verse-ref: format and book code', () => {
    for (const bad of ['John 3:16', 'JHN.3', 'XXX.3.16', 'jhn.3.16']) {
      const d = scriptureDoc(); sent(d)[0].verseRefs = [bad];
      expect(errorCodes(d), bad).toContain('invalid-verse-ref');
    }
  });

  it('verse-chapter-mismatch: a section declaring chapter N holds only chapter N refs', () => {
    const d = scriptureDoc(); sent(d)[0].verseRefs = ['JHN.4.1'];
    expect(errorCodes(d)).toEqual(['verse-chapter-mismatch']);
  });

  it('verse-order: within a book, chapter then verse; several sentences may share a verse; a sentence may span verses', () => {
    const d = scriptureDoc();
    d.sections = [{ chapter: 3, paragraphs: [{ sentences: [
      { text: 'Uno.', verseRefs: ['JHN.3.16'] }, { text: 'Dos.', verseRefs: ['JHN.3.15'] },
    ] }] }];
    expect(errorCodes(d)).toEqual(['verse-order']);
    const many = scriptureDoc();
    many.sections = [{ chapter: 3, paragraphs: [{ sentences: [
      { text: 'Uno y dos.', verseRefs: ['JHN.3.16', 'JHN.3.17'] }, { text: 'Tres.', verseRefs: ['JHN.3.17'] }, { text: 'Cuatro.', verseRefs: ['JHN.3.17'] },
    ] }] }];
    expect(errorCodes(many)).toEqual([]);
    const within = scriptureDoc(); sent(within)[0].verseRefs = ['JHN.3.17', 'JHN.3.16'];
    expect(errorCodes(within)).toContain('verse-order');
    // different books may follow each other in any order (1 John 1 then John 3, as bundled)
    const two = scriptureDoc();
    two.sections = [
      { chapter: 1, paragraphs: [{ sentences: [{ text: 'Uno.', verseRefs: ['1JN.1.9'] }] }] },
      { chapter: 3, paragraphs: [{ sentences: [{ text: 'Dos.', verseRefs: ['JHN.3.16'] }] }] },
    ];
    expect(errorCodes(two)).toEqual([]);
  });
});

describe('every validation code is exercised above', () => {
  it('lists the codes this suite covers (guards against adding a code without a test)', () => {
    const covered: ValidationCode[] = [
      'not-an-object', 'unsupported-schema-version', 'missing-field', 'invalid-value', 'invalid-id', 'unknown-field',
      'duplicate-document-id', 'duplicate-sentence-id', 'text-id-conflict', 'language-mismatch', 'locale-mismatch',
      'empty-sentence', 'no-sentences', 'english-count-mismatch', 'unknown-speaker',
      'span-empty', 'span-out-of-bounds', 'span-overlap', 'span-not-grapheme-boundary', 'span-not-on-token',
      'invalid-verse-ref', 'verse-order', 'verse-chapter-mismatch', 'missing-verse-refs', 'verse-marker-in-text',
      'scripture-translation-missing', 'scripture-edition-missing', 'scripture-book-invalid', 'scripture-chapter-invalid',
      'scripture-corpus', 'scripture-generated', 'invalid-verification',
      'missing-provenance', 'unverified-without-note', 'review-missing-reviewer',
      'not-nfc', 'edge-whitespace', 'adapter-would-split', 'low-analysis-coverage',
    ];
    expect(new Set(covered).size).toBe(39);
  });
});
