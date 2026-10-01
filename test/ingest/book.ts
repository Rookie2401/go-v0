/** Thai personal-copy fixtures shared by the works / notes / dictionary / plain-text tests. Not a test file. */
import {
  COURSES, type AdapterRegistry, type AnalyzedToken, type AppStore, type LanguageAdapter, type LanguageCode, type LexiconSource, type RawToken, type Work,
} from '../../src/core';
import { THAI_WORKS } from '../../src/course/thai';
import { createMemoryLexiconSource } from '../../src/dict';
import { createAdapterRegistry } from '../../src/adapters';
import type { CorpusDocument } from '../../src/ingest';

export const SCHOOL = 'ฉันไปโรงเรียน'; // "I go to school"
export const CAT = 'แมวนั่งบนเสื่อ';

/** A valid Thai personal-copy chapter: two raw paragraphs, one sentence each. */
export const bookDoc = (over: Partial<CorpusDocument> = {}): CorpusDocument => ({
  schemaVersion: 2, id: 'book-ch01', lang: 'th', title: 'A Book — Chapter 1', contentType: 'story',
  corpus: { id: 'personal-th', kind: 'comprehensible-input', title: 'Your books' },
  source: {
    id: 'src:th:book', title: 'A Book', author: 'An Author', attribution: 'A Book — An Author. Your own copy; not distributed.',
    provenance: 'Supplied by the learner from a personal copy; transcription not checked.', rights: 'personal-copy', authorship: 'published',
  },
  review: { status: 'unreviewed' }, topics: [], editorialTags: [], prepTargets: [], generated: false,
  sections: [{ paragraphs: [{ text: SCHOOL }, { text: CAT }] }],
  ...over,
});

export const workBySlug = (slug: string): Work => {
  const w = THAI_WORKS.find((x) => x.id === `work:thailand-th:${slug}`);
  if (!w) throw new Error(`no such work ${slug}`);
  return w;
};

export const registry = createAdapterRegistry();
export const thAdapter = registry.get('th');

/**
 * The Thai adapter with a lexicon of exactly one word, ฉัน. Dictionary tests use it so that they do not depend on how
 * large the real adapter's lexicon has grown: every other word is one the adapter "cannot analyse".
 */
const KNOWN = thAdapter.tokenize(SCHOOL)[0].normalized;
export const bareAdapter: LanguageAdapter = {
  ...thAdapter,
  analyze: (tokens: RawToken[]): AnalyzedToken[] => tokens.map((token) => ({
    token, analyzer: `adapter-th@${thAdapter.version}`,
    candidates: token.isWord && token.normalized === KNOWN ? [{ lemma: KNOWN, pos: 'PRON' as const, morph: {}, gloss: 'I (adapter)', confidence: 1 }] : [],
  })),
};
export const bareRegistry: AdapterRegistry = { get: (lang) => (lang === 'th' ? bareAdapter : registry.get(lang)), all: () => registry.all() };

/** The word tokens of a sentence the bare Thai adapter says nothing about (so a dictionary may fill them). */
export const unknownWords = (text: string): string[] => {
  const toks = bareAdapter.tokenize(text);
  return bareAdapter.analyze(toks).filter((a) => a.token.isWord && a.candidates.length === 0).map((a) => a.token.normalized);
};

export const lexiconOf = (src: LexiconSource | undefined) => (lang: LanguageCode) => (lang === 'th' ? src : undefined);
export const memoryLexicon = (entries: Parameters<typeof createMemoryLexiconSource>[1], id: string) => createMemoryLexiconSource('th', entries, { id });

export const THAI_COURSE = COURSES.find((c) => c.lang === 'th')!.id;

/** Seed the `works` table with the Thai ladder (what the app does at start). */
export async function seedWorks(store: AppStore): Promise<void> {
  await store.works.bulkPut(THAI_WORKS);
}
