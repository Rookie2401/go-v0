/**
 * Running-word analysis of one document, the way the B2 audit probe does it (scripts/audit-b2-ladder.mts): the real adapter
 * tokenises each declared sentence (raw paragraphs go through `segmentSentences` first); the FIRST candidate's lemma
 * (lowercased, NFC) stands for the word, or the normalized form when the adapter has no candidate. PROPN and numerals count
 * as known and stay out of the lemma inventory — except a name the adapter only GUESSED (see `isNameGuess`). Constructions are the adapter's `detectPatterns` keys.
 *
 * Note this is the adapter alone: the app's importer also consults the installed dictionary, so inflected forms the adapter
 * cannot lemmatize count here as separate lemmas, which UNDER-states coverage a little.
 */
import type { LanguageAdapter } from '../core';
import type { CorpusDocument } from '../ingest';

export interface UnitStat {
  /** Running words (word tokens). */
  words: number;
  /** Word tokens that are known by definition (PROPN, numerals). */
  auto: number;
  /** Lemma -> number of running words (auto tokens excluded). */
  lemmas: Map<string, number>;
  /** Construction keys found by `detectPatterns` anywhere in the document. */
  patterns: Set<string>;
  /** Lemma -> the running-word index (0-based, counting every word token of the document in reading order) of each occurrence. */
  positions: Map<string, number[]>;
}

/** The sentences of a document, in order. */
export function documentSentences(adapter: LanguageAdapter, doc: CorpusDocument): string[] {
  const out: string[] = [];
  for (const sec of doc.sections) {
    for (const p of sec.paragraphs as unknown as Array<{ sentences?: Array<{ text: string }>; text?: string }>) {
      if (Array.isArray(p.sentences)) for (const s of p.sentences) out.push(s.text);
      else if (typeof p.text === 'string') for (const sp of adapter.segmentSentences(p.text)) out.push(sp.text);
    }
  }
  return out;
}

/**
 * A proper noun the adapter only guessed from the text's own word marks (Thai: one U+200B-delimited chunk the word list does
 * not know, `unconfirmed` and `notes.nameGuess`). Such a chunk is often an ordinary word the list happens to lack (จง, สาวก,
 * ชาย …), so counting it as "known by definition" would let a text look about eight points easier than it is (Mark 1: 89 %
 * honest, 97.9 % with the guesses). It counts as an ordinary lemma instead: the learner has to meet it three times. A name
 * that is on the adapter's word list (PROPN, not unconfirmed) and the other adapters' capitalisation guesses (Spanish: a
 * capital inside a sentence, `unconfirmed` but with no `nameGuess`) still count as known: they are real evidence of a name.
 */
export function isNameGuess(c: { unconfirmed?: boolean; notes?: Record<string, unknown> } | undefined): boolean {
  return c?.unconfirmed === true && c.notes?.nameGuess === 'yes';
}

/** An abbreviation the adapter lists (Albanian km, shek, etj: part of speech X, its rule says so): known by definition, like a numeral —
 * a learner does not "learn" km. */
export function isAbbreviation(c: { pos?: string; notes?: Record<string, unknown> } | undefined): boolean {
  return c?.pos === 'X' && /abbreviation/.test(String(c.notes?.rule ?? ''));
}

export function analyseDocument(adapter: LanguageAdapter, doc: CorpusDocument): UnitStat {
  const lemmas = new Map<string, number>();
  const patterns = new Set<string>();
  const positions = new Map<string, number[]>();
  let words = 0, auto = 0;
  for (const s of documentSentences(adapter, doc)) {
    const tokens = adapter.tokenize(s);
    const analyses = adapter.analyze(tokens);
    for (const x of analyses) {
      if (!x.token.isWord) continue;
      words++;
      const c = x.candidates[0];
      const norm = x.token.normalized.toLowerCase();
      if ((c?.pos === 'PROPN' && !isNameGuess(c)) || c?.pos === 'NUM' || isAbbreviation(c) || /^\p{N}+$/u.test(norm)) { auto++; continue; }
      const l = (c?.lemma ?? norm).normalize('NFC').toLowerCase();
      lemmas.set(l, (lemmas.get(l) ?? 0) + 1);
      const at = positions.get(l);
      if (at) at.push(words - 1); else positions.set(l, [words - 1]);
    }
    for (const p of adapter.detectPatterns(tokens, analyses)) patterns.add(p.key);
  }
  return { words, auto, lemmas, patterns, positions };
}

/** What a learner who has read a sequence of texts has met: lemma encounter counts and construction keys. */
export class Progress {
  readonly seen = new Map<string, number>();
  readonly patterns = new Set<string>();

  constructor(private readonly minEncounters: number) {}

  /** Share of `stat`'s running words known (>= minEncounters earlier encounters) and met at least once, as fractions. */
  coverage(stat: UnitStat): { cov3: number; cov1: number } {
    if (stat.words === 0) return { cov3: 0, cov1: 0 };
    let k3 = stat.auto, k1 = stat.auto;
    for (const [l, n] of stat.lemmas) {
      const s = this.seen.get(l) ?? 0;
      if (s >= this.minEncounters) k3 += n;
      if (s >= 1) k1 += n;
    }
    return { cov3: k3 / stat.words, cov1: k1 / stat.words };
  }

  /** Lemmas of `stat` never met before. */
  newLemmas(stat: UnitStat): string[] {
    return [...stat.lemmas.keys()].filter((l) => !this.seen.has(l));
  }

  /** Construction keys of `stat` not seen in any earlier text, sorted. */
  firstPatterns(stat: UnitStat): string[] {
    return [...stat.patterns].filter((k) => !this.patterns.has(k)).sort();
  }

  add(stat: UnitStat): void {
    for (const [l, n] of stat.lemmas) this.seen.set(l, (this.seen.get(l) ?? 0) + n);
    for (const k of stat.patterns) this.patterns.add(k);
  }
}
