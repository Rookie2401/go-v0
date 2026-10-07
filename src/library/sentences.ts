/**
 * How long the sentences of a library text are, as the learner will meet them: declared sentences as stored, raw paragraphs
 * cut by the language adapter's `segmentSentences` (exactly what the importer does); words are the adapter's word tokens.
 * Used by the library audit and by `npm run library:sentences`.
 */
import type { LanguageAdapter } from '../core';
import type { CorpusDocument } from '../ingest/format';

/** A work whose MEDIAN sentence has more words than this stores whole paragraphs as sentences. */
export const MAX_MEDIAN_SENTENCE_WORDS = 60;

/** The word count of every sentence of a document, in reading order. */
export function sentenceWordCounts(doc: CorpusDocument, adapter: LanguageAdapter): number[] {
  const words = (t: string) => adapter.tokenize(t).filter((x) => x.isWord).length;
  const lens: number[] = [];
  for (const s of doc.sections) {
    for (const p of s.paragraphs) {
      if ('sentences' in p) for (const x of p.sentences) lens.push(words(x.text));
      else for (const sp of adapter.segmentSentences(p.text)) lens.push(words(sp.text));
    }
  }
  return lens;
}

export const median = (a: readonly number[]): number => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
