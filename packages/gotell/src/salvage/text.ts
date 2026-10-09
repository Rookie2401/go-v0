/**
 * adapted from src/gotell/text.ts (2026-10-09)
 *
 * Small adapter-backed text helpers shared by the analyser and the assistance ladder.
 * Everything goes through LanguageAdapter.tokenize/analyze — never split(' '). The adapter types come from the pack runtime
 * (./types), not from src/core. Added: `applyEditsDetailed` (the same edit rules, also reporting where each edit landed).
 */
import type { AnalysisCandidate, AnalyzedToken, LanguageAdapter, PartOfSpeech, RawToken } from './types';

/** Analyses below this confidence are treated as "unknown" (uncertainty is not a guess). */
export const MIN_ANALYSIS_CONFIDENCE = 0.5;
/** Legacy: error candidates below this were ignored entirely. The new analyser keeps them, classed uncertain-analysis. */
export const MIN_ERROR_CONFIDENCE = 0.6;

/** Closed-class parts of speech. Replacing/adding these never adds "content". NUM is content (dates). */
export const FUNCTION_POS: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>(['DET', 'ADP', 'PRON', 'CONJ', 'SCONJ', 'AUX', 'PART', 'CLF', 'PUNCT']);
/** A slot filler never runs across these. */
export const BOUNDARY_POS: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>(['CONJ', 'SCONJ', 'VERB', 'AUX']);

export interface Parsed {
  text: string;
  tokens: RawToken[];
  analyses: AnalyzedToken[];
}

export function parse(adapter: LanguageAdapter, text: string): Parsed {
  const tokens = adapter.tokenize(text);
  return { text, tokens, analyses: adapter.analyze(tokens) };
}

export function bestCandidate(a: AnalyzedToken | undefined): AnalysisCandidate | undefined {
  const c = a?.candidates[0];
  return c && c.confidence >= MIN_ANALYSIS_CONFIDENCE ? c : undefined;
}

export function posAt(p: Parsed, i: number): PartOfSpeech | undefined {
  return bestCandidate(p.analyses[i])?.pos;
}

/** Function word only when the analysis says so; unknown POS is treated as content (conservative). */
export function isFunctionAt(p: Parsed, i: number): boolean {
  const pos = posAt(p, i);
  return pos !== undefined && FUNCTION_POS.has(pos);
}

export function wordIndexes(p: Parsed): number[] {
  const out: number[] = [];
  p.tokens.forEach((t, i) => { if (t.isWord) out.push(i); });
  return out;
}

export function normSet(p: Parsed): Set<string> {
  return new Set(wordIndexes(p).map((i) => p.tokens[i].normalized));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Two normalized forms are "the same word" when equal or one of the adapter's relations holds. */
export function related(adapter: LanguageAdapter, a: string, b: string): boolean {
  return a === b || adapter.relate(a, b) !== 'none';
}

/** Word-token indexes in `suggested` whose normalized form is not covered by the original (multiset diff). */
export function introducedIndexes(original: Parsed, suggested: Parsed): number[] {
  const pool = new Map<string, number>();
  for (const i of wordIndexes(original)) pool.set(original.tokens[i].normalized, (pool.get(original.tokens[i].normalized) ?? 0) + 1);
  const out: number[] = [];
  for (const i of wordIndexes(suggested)) {
    const n = suggested.tokens[i].normalized;
    const c = pool.get(n) ?? 0;
    if (c > 0) pool.set(n, c - 1);
    else out.push(i);
  }
  return out;
}

/** Word-token indexes in `original` that the suggested text no longer contains (multiset diff). */
export function removedIndexes(original: Parsed, suggested: Parsed): number[] {
  return introducedIndexes(suggested, original);
}

/**
 * "Never add content" check. Content words the suggestion adds (not related to anything the learner
 * wrote, not from an allowed known phrase) may not outnumber the content words it removes — i.e. a
 * suggestion may reorder, inflect or *replace* the learner's tokens, never append new nouns/verbs.
 */
export function addsContent(adapter: LanguageAdapter, original: Parsed, suggested: Parsed, allowedWords: ReadonlySet<string>): boolean {
  const origWords = wordIndexes(original).map((i) => original.tokens[i].normalized);
  const sugWords = wordIndexes(suggested).map((i) => suggested.tokens[i].normalized);
  const added = wordIndexes(suggested).filter((i) => {
    if (isFunctionAt(suggested, i)) return false;
    const n = suggested.tokens[i].normalized;
    if (allowedWords.has(n)) return false;
    return !origWords.some((o) => related(adapter, n, o));
  });
  const removed = wordIndexes(original).filter((i) => {
    if (isFunctionAt(original, i)) return false;
    const n = original.tokens[i].normalized;
    return !sugWords.some((s) => related(adapter, n, s));
  });
  return added.length > removed.length;
}

/** Sørensen–Dice overlap of two token sets (0..1) — used to find which suggestion a saved sentence descends from. */
export function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return (2 * inter) / (a.size + b.size);
}

/**
 * Apply several replacements to one sentence. Deleting a span also removes one neighbouring space (never leaves
 * a double space). Returns undefined when any two edits overlap - callers then fall back to single edits.
 */
export function applyEdits(text: string, edits: Array<{ start: number; end: number; replacement: string }>): string | undefined {
  const adj = edits.map((e) => {
    let { start, end } = e;
    if (e.replacement === '') {
      if (start > 0 && /\s/u.test(text[start - 1])) start--;
      else if (end < text.length && /\s/u.test(text[end])) end++;
    }
    return { start, end, replacement: e.replacement };
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < adj.length; i++) if (adj[i].start < adj[i - 1].end) return undefined;
  let out = '';
  let cursor = 0;
  for (const e of adj) {
    if (e.start < 0 || e.end > text.length || e.start > e.end) return undefined;
    out += text.slice(cursor, e.start) + e.replacement;
    cursor = e.end;
  }
  return out + text.slice(cursor);
}

/**
 * `applyEdits`, also returning where each edit landed in the new text (so the caller can check that nothing was introduced outside
 * the edited spans). Same rules: a deleted span takes one neighbouring space with it; overlapping edits give undefined.
 */
export function applyEditsDetailed(
  text: string,
  edits: Array<{ start: number; end: number; replacement: string }>,
): { text: string; spans: Array<{ start: number; end: number }> } | undefined {
  const adj = edits.map((e) => {
    let { start, end } = e;
    if (e.replacement === '') {
      if (start > 0 && /\s/u.test(text[start - 1])) start--;
      else if (end < text.length && /\s/u.test(text[end])) end++;
    }
    return { start, end, replacement: e.replacement };
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < adj.length; i++) if (adj[i].start < adj[i - 1].end) return undefined;
  let out = '';
  let cursor = 0;
  const spans: Array<{ start: number; end: number }> = [];
  for (const e of adj) {
    if (e.start < 0 || e.end > text.length || e.start > e.end) return undefined;
    out += text.slice(cursor, e.start);
    const at = out.length;
    out += e.replacement;
    spans.push({ start: at, end: out.length });
    cursor = e.end;
  }
  return { text: out + text.slice(cursor), spans };
}
