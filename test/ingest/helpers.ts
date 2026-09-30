import type { AppStore } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import type { CorpusDocument, ValidationIssue } from '../../src/ingest';
import { validateDocument } from '../../src/ingest';

export const registry = createAdapterRegistry();
export const clock = () => '2026-01-01T00:00:00.000Z';

/** A minimal valid Spanish story (unreviewed, so unpublished). */
export const baseDoc = (): CorpusDocument => ({
  schemaVersion: 2, id: 'test-doc', lang: 'es', title: 'T', contentType: 'story',
  corpus: { id: 'ci-es', kind: 'comprehensible-input', title: 'CI' },
  source: { id: 'src:t', title: 'S', attribution: 'Test', provenance: 'written for tests', rights: 'owner-authored', authorship: 'human' },
  review: { status: 'unreviewed' }, topics: [], editorialTags: [], prepTargets: [], generated: false,
  english: { source: 'test author' },
  sections: [{ paragraphs: [{ sentences: [{ text: 'Hola.', english: 'Hello.' }] }] }],
});

/** A minimal valid, fully verified and reviewed scripture document (published). */
export const scriptureDoc = (): CorpusDocument => ({
  ...baseDoc(), id: 'sc', contentType: 'scripture', corpus: { id: 'bible-es', kind: 'scripture', title: 'B' },
  source: { id: 'src:sc', title: 'B', attribution: 'Test Bible, public domain', provenance: 'verified against the test source', rights: 'public-domain', authorship: 'public-domain' },
  review: { status: 'reviewed', reviewedBy: 'test', reviewedAt: '2026-01-01' },
  scripture: {
    translationId: 'tst', translationName: 'Test Bible', edition: '1900', book: 'JHN', chapter: 3,
    verification: { against: 'test source', checkedAt: '2026-01-01', method: 'byte-comparison', by: 'test' },
  },
  sections: [{ chapter: 3, paragraphs: [{ sentences: [{ text: 'Porque Dios amó.', verseRefs: ['JHN.3.16'] }] }] }],
});

export const issuesOf = (doc: unknown, existingTexts?: Array<{ id: string; sourceId: string }>): ValidationIssue[] =>
  validateDocument(doc, { registry, existingTexts });

export const errorCodes = (doc: unknown) => issuesOf(doc).filter((i) => i.severity === 'error').map((i) => i.code);
export const warningCodes = (doc: unknown) => issuesOf(doc).filter((i) => i.severity === 'warning').map((i) => i.code);

/** Wrap every table's writers so a test can count (or forbid) writes. */
export function countWrites(store: AppStore): { count: () => number; reset: () => void } {
  let n = 0;
  for (const [name, table] of Object.entries(store)) {
    if (name === 'assets' || name === 'transaction') continue;
    const t = table as { put: (...a: unknown[]) => Promise<void>; bulkPut: (r: unknown[]) => Promise<void>; delete: (...a: unknown[]) => Promise<void> };
    for (const m of ['put', 'delete'] as const) { const orig = t[m].bind(t); t[m] = async (...a: unknown[]) => { n++; return orig(...a); }; }
    const origBulk = t.bulkPut.bind(t);
    t.bulkPut = async (rows: unknown[]) => { n += rows.length; return origBulk(rows); };
  }
  return { count: () => n, reset: () => { n = 0; } };
}

/** The ids of every row of every content table, for exact before/after comparisons. */
export async function snapshot(store: AppStore): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const name of ['sources', 'corpora', 'texts', 'sections', 'paragraphs', 'sentences', 'tokens', 'lemmas', 'analyses', 'phrases', 'phraseOccurrences', 'patterns', 'patternOccurrences', 'rescues', 'meta'] as const) {
    out[name] = (await store[name].all()).map((r) => r.id).sort();
  }
  return out;
}
