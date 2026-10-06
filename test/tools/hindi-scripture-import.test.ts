import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = path.resolve('data/corpus/hi');
const docs = fs.readdirSync(dir).filter((f) => f.startsWith('bible-') && f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const scripture = docs.filter((d) => d.contentType === 'scripture');
const libraryDocs = JSON.parse(fs.readFileSync(path.resolve('data/sources/hi/irv2019-library-documents.json'), 'utf8'));

describe('Hindi IRV Scripture import', () => {
  it('contains the complete 66-book publisher-file corpus in compact documents', () => {
    expect(libraryDocs).toHaveLength(1189);
    expect(scripture).toHaveLength(5);
    const librarySentences = libraryDocs.flatMap((d: any) => d.sections.flatMap((s: any) => s.paragraphs.flatMap((p: any) => p.sentences ?? [])));
    expect(librarySentences).toHaveLength(31104);
    expect(librarySentences.every((s: any) => s.text.length > 0 && s.verseRefs?.length === 1)).toBe(true);
    for (const id of ['bible-gen-1-complete', 'bible-psa-1-complete', 'bible-psa-23-complete', 'bible-mrk-1-complete', 'bible-1john-1-complete']) {
      expect(libraryDocs.some((d: any) => d.id === id), id).toBe(true);
    }
  });

  it('preserves the established chapter identities and licensed verification', () => {
    for (const id of ['bible-gen-1', 'bible-psa-1', 'bible-psa-23', 'bible-mrk-1', 'bible-1john-1']) {
      const d = scripture.find((x) => x.id === id);
      expect(d, id).toBeDefined();
      expect(d.source.rights, id).toBe('licensed');
      expect(d.scripture.translationId, id).toBe('hin2017');
      expect(d.scripture.verification.method, id).toBe('byte-comparison');
    }
  });

  it('does not duplicate verse identities across compact books and retained chapters', () => {
    const refs = libraryDocs.flatMap((d: any) => d.sections.flatMap((s: any) => s.paragraphs.flatMap((p: any) => p.sentences ?? []))).flatMap((s: any) => s.verseRefs);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('keeps lazy chapter rows in canonical order across Acts and Romans', () => {
    const indexes = libraryDocs.map((d: any) => d.work.chapter.index);
    expect(indexes).toEqual(Array.from({ length: 1189 }, (_, i) => i + 1));
    expect(libraryDocs.find((d: any) => d.scripture.book === 'ACT' && d.scripture.chapter === 1).work.chapter.index).toBe(1019);
    expect(libraryDocs.find((d: any) => d.scripture.book === 'ROM' && d.scripture.chapter === 1).work.chapter.index).toBe(1047);
  });
});
