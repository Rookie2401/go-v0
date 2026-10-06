import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalScriptureKey, isSupplementalScripture, sameScriptureText, scriptureAddress, scriptureChapterIssues } from '../../src/course/scriptureIntegrity';

const row = { id: 'text:de:chapter', lang: 'de', workId: 'work:de:luther1912', scripture: { book: '1JN', chapter: 1 } };
describe('protected Scripture identity', () => {
  it('never equates separate texts by title, length, or missing edition', () => {
    expect(sameScriptureText(row, { ...row, id: 'text:de:excerpt' })).toBe(false);
    expect(sameScriptureText(row, { ...row })).toBe(true);
    expect(canonicalScriptureKey({ ...row, workId: undefined })).toBeUndefined();
    expect(canonicalScriptureKey(row)).not.toBe(canonicalScriptureKey({ ...row, workId: 'work:de:other-edition' }));
  });
  it('does not relocate invalid explicit metadata using a running chapter number', () => {
    expect(scriptureAddress({ ...row, chapter: 1, scripture: { book: 'BAD', chapter: 1 } })).toBeUndefined();
    expect(scriptureAddress({ id: 'x', lang: 'de', chapter: 1 })).toEqual({ book: 'GEN', chapter: 1 });
  });
  it('flags cross-book contamination, duplicate addresses, and verse order', () => {
    expect(scriptureChapterIssues(row, ['1JN.1.9', '1JN.1.8', '1JN.1.8', 'JHN.3.16'])).toEqual([
      'verse order: 1JN.1.8', 'duplicate verse: 1JN.1.8', 'verse order: 1JN.1.8', 'cross-chapter verse: JHN.3.16',
    ]);
  });
  it.each(['de', 'es', 'hi'])('recognizes the actual %s seed as supplemental without changing its source', (lang) => {
    const doc = JSON.parse(fs.readFileSync(`data/corpus/${lang}/bible-1john-1.json`, 'utf8'));
    const refs = doc.sections.flatMap((s: { paragraphs: Array<{ sentences: Array<{ verseRefs: string[] }> }> }) => s.paragraphs.flatMap((p) => p.sentences.flatMap((s) => s.verseRefs)));
    expect(refs).toContain('JHN.3.16');
    expect(isSupplementalScripture({ ...doc, workId: doc.work?.slug }, refs)).toBe(true);
    expect(doc.scripture.book).toBe('1JN');
  });
});
