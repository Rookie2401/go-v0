import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { computePublished, contentSignatureOf, validateDocument, type CorpusDocument } from '../../src/ingest';
import { THAI_BEGINNER_DRAFT_WORKS } from '../../src/course/thaiBeginnerDrafts';

const root = path.resolve('data/corpus/th');
const documents = fs.readdirSync(root).filter((file) => /^bridge-thai-bridge-\d+\.json$/.test(file))
  .map((file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as CorpusDocument);

describe('Thai beginner review batch', () => {
  it('keeps each draft tied to its course work, with complete English rescue and genuine review still pending', () => {
    expect(documents).toHaveLength(12);
    expect(new Set(documents.map(contentSignatureOf)).size).toBe(12);
    const registry = createAdapterRegistry();
    for (const doc of documents) {
      expect(validateDocument(doc, { registry }).filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(doc.generated).toBe(true);
      expect(doc.source.authorship).toBe('generated');
      expect(doc.review.status).toBe('unreviewed');
      expect(computePublished(doc).published).toBe(false);
      const work = THAI_BEGINNER_DRAFT_WORKS.find((item) => item.id === ids.work('thailand-th', doc.work?.slug ?? 'missing'));
      expect(work).toBeDefined();
      expect(work!.stageId).toMatch(/^stage:thailand-th:g[12]$/);
      const sentences = doc.sections.flatMap((section) => section.paragraphs.flatMap((paragraph) => 'sentences' in paragraph ? paragraph.sentences : []));
      expect(sentences.length).toBeGreaterThan(5);
      for (const sentence of sentences) {
        expect(sentence.text).toMatch(/[\u0E00-\u0E7F]/);
        expect(sentence.english).toMatch(/[A-Za-z]/);
        expect(sentence.english).not.toMatch(/[\u0E00-\u0E7F]/);
      }
      expect(computePublished({ ...doc, review: { ...doc.review, status: 'reviewed', reviewedBy: 'Tool check', level: 'linguistic-check', contentSignature: contentSignatureOf(doc) } }).published).toBe(false);
    }
  });
});
