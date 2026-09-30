import { describe, expect, it } from 'vitest';
import { loadBundledCorpus, validateDocument, type CorpusDocument } from '../../src/ingest';

const base = (): CorpusDocument => ({
  formatVersion: 1, lang: 'es', slug: 'test-doc', title: 'T', kind: 'story',
  corpus: { id: 'ci-es', kind: 'comprehensible-input', title: 'CI' },
  source: { id: 'src:t', title: 'S', rights: 'owner-authored', authorship: 'human' },
  sourceNote: 'written for tests', tags: [],
  sections: [{ paragraphs: [{ sentences: [{ text: 'Hola.', english: 'Hello.' }] }] }],
});
const scripture = (): CorpusDocument => ({
  ...base(), kind: 'scripture', slug: 'sc', version: 'RV', corpus: { id: 'bible-es', kind: 'scripture', title: 'B' },
  scripture: { book: 'JHN', chapter: 3 },
  sections: [{ chapter: 3, paragraphs: [{ sentences: [{ text: 'Porque Dios amó.', verseRefs: ['JHN.3.16'] }] }] }],
});

describe('validateDocument', () => {
  it('accepts every bundled document', () => {
    const docs = loadBundledCorpus();
    expect(docs).toHaveLength(15);
    for (const d of docs) expect(validateDocument(d), `${d.lang}/${d.slug}`).toEqual([]);
  });

  it('accepts minimal valid story and scripture documents', () => {
    expect(validateDocument(base())).toEqual([]);
    expect(validateDocument(scripture())).toEqual([]);
  });

  it('requires an honest provenance statement and valid rights', () => {
    expect(validateDocument({ ...base(), sourceNote: '' }).join()).toMatch(/sourceNote/);
    expect(validateDocument({ ...base(), source: { ...base().source, rights: 'maybe' } }).join()).toMatch(/source.rights/);
    const unverified = { ...base(), source: { ...base().source, rights: 'unverified' as const }, sourceNote: 'some text' };
    expect(validateDocument(unverified).join()).toMatch(/unverified/);
    expect(validateDocument({ ...unverified, sourceNote: 'unverified sample, replace before release' })).toEqual([]);
  });

  it('keeps verse numbers out of scripture text and requires verseRefs', () => {
    const s = scripture();
    s.sections[0].paragraphs = [{ sentences: [{ text: 'Porque [16] Dios amó.', verseRefs: ['JHN.3.16'] }] }];
    expect(validateDocument(s).join()).toMatch(/verse marker/);
    s.sections[0].paragraphs = [{ sentences: [{ text: 'Porque Dios amó ¹⁶', verseRefs: ['JHN.3.16'] }] }];
    expect(validateDocument(s).join()).toMatch(/verse marker/);
    s.sections[0].paragraphs = [{ sentences: [{ text: 'Porque Dios amó.' }] }];
    expect(validateDocument(s).join()).toMatch(/verseRefs is required/);
    s.sections[0].paragraphs = [{ sentences: [{ text: 'Porque Dios amó.', verseRefs: ['John 3:16'] }] }];
    expect(validateDocument(s).join()).toMatch(/USFM/);
  });

  it('scripture is never generated, needs a version and a scripture corpus', () => {
    expect(validateDocument({ ...scripture(), generated: true }).join()).toMatch(/never be generated/);
    expect(validateDocument({ ...scripture(), version: undefined }).join()).toMatch(/version/);
    expect(validateDocument({ ...scripture(), corpus: { id: 'x', kind: 'comprehensible-input', title: 'x' } }).join()).toMatch(/corpus of kind/);
  });

  it('rejects structural problems', () => {
    expect(validateDocument(null)).toEqual(['document is not an object']);
    expect(validateDocument({ ...base(), formatVersion: 2 }).join()).toMatch(/formatVersion/);
    expect(validateDocument({ ...base(), lang: 'fr' }).join()).toMatch(/lang/);
    expect(validateDocument({ ...base(), slug: 'Bad Slug' }).join()).toMatch(/slug/);
    expect(validateDocument({ ...base(), sections: [] }).join()).toMatch(/sections/);
    expect(validateDocument({ ...base(), sections: [{ paragraphs: [{ sentences: [{ text: ' padded ' }] }] }] }).join()).toMatch(/whitespace/);
    expect(validateDocument({ ...base(), sections: [{ paragraphs: [{}] }] }).join()).toMatch(/sentences\[\] or text/);
  });
});
