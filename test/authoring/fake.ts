import type { AnalysisCandidate, AnalyzedToken, LanguageAdapter, RawToken } from '../../src/core/adapters';
import type { CorpusDocument } from '../../src/ingest/format';

interface Entry { lemma: string; pos: string; unconfirmed?: boolean }

/** form → reading. Forms matching /^w\d+$/ are their own NOUN lemma; /^f\d+$/ are the PART lemma "filler". */
export const TABLE: Record<string, Entry> = {
  gato: { lemma: 'gato', pos: 'NOUN' }, gatos: { lemma: 'gato', pos: 'NOUN' },
  come: { lemma: 'comer', pos: 'VERB' }, comen: { lemma: 'comer', pos: 'VERB' }, comer: { lemma: 'comer', pos: 'VERB' },
  el: { lemma: 'el', pos: 'DET' }, la: { lemma: 'el', pos: 'DET' }, y: { lemma: 'y', pos: 'CONJ' },
  quiero: { lemma: 'querer', pos: 'VERB' }, tengo: { lemma: 'tener', pos: 'VERB' },
  por: { lemma: 'por', pos: 'ADP' }, favor: { lemma: 'favor', pos: 'NOUN' },
  steht: { lemma: 'aufstehen', pos: 'VERB' }, auf: { lemma: 'aufstehen', pos: 'VERB' },
  casi: { lemma: 'casar', pos: 'VERB', unconfirmed: true },
  libro: { lemma: 'libro', pos: 'NOUN' }, libros: { lemma: 'libro', pos: 'NOUN' },
  rojo: { lemma: 'rojo', pos: 'ADJ' }, rojos: { lemma: 'rojo', pos: 'ADJ' },
  aqui: { lemma: 'aquí', pos: 'ADV' },
};

const readingOf = (norm: string): Entry | undefined => {
  if (TABLE[norm]) return TABLE[norm];
  if (/^w\d+$/.test(norm)) return { lemma: norm, pos: 'NOUN' };
  if (/^f\d+$/.test(norm)) return { lemma: 'filler', pos: 'PART' };
  if (/^[a-z]+$/.test(norm) && !KNOWN_UNREAD.has(norm)) return { lemma: norm, pos: 'NOUN' };
  return undefined;
};
const KNOWN_UNREAD = new Set(['zzz', 'qqq']);

/** A whitespace tokenizer with a small table; punctuation is a separate non-word token. */
export const fakeAdapter = {
  lang: 'es',
  segmentSentences: (text: string) => [...text.matchAll(/[^.]+\.?/g)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, text: m[0].trim() })),
  tokenize: (s: string): RawToken[] => [...s.matchAll(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)].map((m) => ({
    surface: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, isWord: /[\p{L}\p{N}]/u.test(m[0]), normalized: m[0].toLowerCase(),
  })),
  analyze: (tokens: RawToken[]): AnalyzedToken[] => {
    const words = tokens.map((t) => t.normalized);
    const steht = words.indexOf('steht');
    const auf = words.indexOf('auf');
    return tokens.map((token, i): AnalyzedToken => {
      const r = token.isWord ? readingOf(token.normalized) : undefined;
      const candidates: AnalysisCandidate[] = r ? [{ lemma: r.lemma, pos: r.pos as never, morph: {}, confidence: 0.9, ...(r.unconfirmed ? { unconfirmed: true } : {}) }] : [];
      if (r && steht >= 0 && auf >= 0 && (i === steht || i === auf)) candidates[0].unit = { head: steht, pieces: [steht, auf], role: 'verb', display: 'steht … auf' };
      return { token, candidates, analyzer: 'fake@1' };
    });
  },
  detectPatterns: (tokens: RawToken[]) => {
    const out: Array<{ key: string; title: string; explanation: string; tokenIndexes: number[]; confidence: number }> = [];
    tokens.forEach((t, i) => {
      if (t.normalized === 'quiero') out.push({ key: 'pat:querer', title: 'quiero', explanation: '', tokenIndexes: [i], confidence: 1 });
      if (t.normalized === 'tengo') out.push({ key: 'pat:tener', title: 'tengo', explanation: '', tokenIndexes: [i], confidence: 1 });
    });
    return out;
  },
  detectPhrases: (tokens: RawToken[]) => {
    const out: Array<{ pattern: string[]; display: string; kind: 'collocation'; tokenIndexes: number[]; confidence: number }> = [];
    tokens.forEach((t, i) => { if (t.normalized === 'por' && tokens[i + 1]?.normalized === 'favor') out.push({ pattern: ['por', 'favor'], display: 'por favor', kind: 'collocation', tokenIndexes: [i, i + 1], confidence: 1 }); });
    return out;
  },
} as unknown as LanguageAdapter;

export interface DocOptions { slug?: string; chapter?: number; review?: CorpusDocument['review']; tags?: string[]; raw?: boolean }

/** A small format-v2 document: each string is one declared sentence (or, with `raw`, one raw paragraph of prose). */
export function mkDoc(id: string, sentences: string[], o: DocOptions = {}): CorpusDocument {
  return {
    schemaVersion: 2, id, lang: 'es', title: `Title ${id}`, contentType: 'story',
    corpus: { id: 'ci-es', kind: 'comprehensible-input', title: 'x' },
    source: { id: `src:${id}`, title: 'x', attribution: 'x', provenance: 'x', rights: 'owner-authored', authorship: 'generated' },
    review: o.review ?? { status: 'unreviewed' }, topics: [], editorialTags: o.tags ?? [], prepTargets: [], generated: true,
    work: { slug: o.slug ?? 'work-a', chapter: { index: o.chapter ?? 1 } },
    sections: [{ paragraphs: o.raw ? sentences.map((text) => ({ text })) : [{ sentences: sentences.map((text) => ({ text })) }] }],
  };
}

/** A sentence of `len` filler words with the given words placed at the given 0-based positions. */
export const seq = (len: number, at: Record<number, string> = {}): string =>
  Array.from({ length: len }, (_, i) => at[i] ?? 'f1').join(' ');
