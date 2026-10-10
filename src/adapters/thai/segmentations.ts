/**
 * Segmentation alternatives for a selected Thai string (GoLearn Linguistic Engine V2, Stage 3). Thai writes no spaces, so a
 * selection of one or several words can be cut in more than one way (ตากลม is ตา + กลม "round eyes" or ตาก + ลม "dry in the
 * wind"). `thaiSegmentations(text)` returns
 *   - `chosen`: the cut the adapter's tokenizer makes (ICU dictionary segmentation + the course compound list + the
 *     context rules of thai/text.ts), with each word's readings from `analyze`;
 *   - `alternatives`: up to three OTHER cuts whose pieces are ALL words the adapter knows (its word list, its compound
 *     list, and, when the caller passes `isWord`, a dictionary's headwords), each with the same word readings;
 *   - `reason`: when no alternative is plausible, the plain-words reason why (never an empty list without one).
 *
 * Never invents a word: an alternative is a cut into known words only, found by dynamic programming over the selection; a
 * cut that leaves a piece nobody lists is not offered. The chosen cut may contain unknown pieces (the tokenizer cuts what
 * ICU cuts); those pieces are marked `known: false`.
 *
 * Confidence is a SHARE, not a probability: each listed cut has a cost (fewer, longer words cost less; a piece the lists do
 * not know costs more; the tokenizer's own cut gets a fixed bonus because it saw the context rules), the weights are
 * exp(-cost), and the confidence is the cut's share of the weights of the cuts considered, clamped to 0.02-0.95. It
 * says "this cut is about as likely as that one"; it has not been fitted to data. An alternative below
 * `MIN_ALTERNATIVE_CONFIDENCE` is dropped as implausible.
 *
 * Imports no value from the adapter (th.ts passes the tokenizer, the analyzer and the word test in), so there is no import cycle.
 */
import type { AnalyzedToken, RawToken } from '../../core';
import { normalizeThai } from './text';

export interface ThaiSegmentReading { lemma: string; pos: string; gloss?: string; confidence: number }

export interface ThaiSegmentWord {
  text: string;
  /** Offsets in the (normalized) selection. */
  start: number;
  end: number;
  /** The word is in the adapter's word list or compound list (or the caller's `isWord`). */
  known: boolean;
  /** The readings of `analyze`, best first (empty for a word the word list does not hold). */
  readings: ThaiSegmentReading[];
}

export interface ThaiSegmentation {
  words: ThaiSegmentWord[];
  /** Share of the plausibility among the cuts considered (not a probability; see the file header). */
  confidence: number;
  /** Where the cut comes from. */
  basis: 'tokenizer' | 'tokenizer-in-context' | 'word-list';
}

export interface ThaiSegmentations {
  /** The selection as segmented (NFC, the same normalization as the tokenizer). */
  text: string;
  chosen: ThaiSegmentation;
  alternatives: ThaiSegmentation[];
  /** Present when `alternatives` is empty: why only the tokenizer's cut is plausible. */
  reason?: string;
}

export interface ThaiSegmentationOptions {
  /** The text before and after the selection in its sentence: the tokenizer's context rules (ตากลม, หน้าที่) need them. */
  context?: { before?: string; after?: string };
  /** Extra word test for alternatives (a dictionary's headwords), on a normalized form. */
  isWord?: (normalized: string) => boolean;
  /** At most this many alternatives (default 3). */
  maxAlternatives?: number;
}

export interface ThaiSegmenterDeps {
  tokenize(text: string): RawToken[];
  analyze(tokens: RawToken[]): AnalyzedToken[];
  /** The adapter's own word test on a normalized form (word list or compound list). */
  isWord(normalized: string): boolean;
}

/** An alternative below this share of the plausibility is not offered. */
export const MIN_ALTERNATIVE_CONFIDENCE = 0.1;
/** The tokenizer's own cut is worth this much cost less (it read the context rules and ICU's dictionary). */
const TOKENIZER_PRIOR = 2.5;
const UNKNOWN_PIECE = 1;
const K_BEST = 12;
const MAX_WORD_LEN = 24;

const THAI_RUN = /^[ก-๛]+$/u;
/** A piece cannot start with a vowel sign, tone mark or the like, nor end with a leading vowel. */
const NOT_A_START = /^[ะัาำิีึืฺุู็่้๊๋์ํฯ]/u;
const NOT_AN_END = /[เแโใไ]$/u;
const REPEAT = 'ๆ';

/** Cost of one known piece: short pieces are weaker evidence than long ones. */
const pieceCost = (w: string): number => {
  if (w.length > 1 && w.endsWith(REPEAT)) return pieceCost(w.slice(0, -1)) + 0.2; // a word with its repetition mark (ช้าๆ)
  return w === REPEAT ? 0.5 : [...w].length <= 2 ? 1.5 : 1;
};

function readingsOf(a: AnalyzedToken | undefined): ThaiSegmentReading[] {
  return (a?.candidates ?? []).slice(0, 3).map((c) => ({
    lemma: c.lemma ?? '', pos: String(c.pos ?? ''), ...(c.gloss ? { gloss: c.gloss } : {}), confidence: Math.round(c.confidence * 100) / 100,
  }));
}

export function createThaiSegmentations(deps: ThaiSegmenterDeps): (text: string, opts?: ThaiSegmentationOptions) => ThaiSegmentations {
  const rawToken = (surface: string, start: number): RawToken => ({ surface, start, end: start + surface.length, isWord: true, normalized: normalizeThai(surface) });

  /** Words of a cut with their readings: analyzed together as one sentence, so context rules between neighbours apply. */
  const wordsOf = (pieces: Array<{ text: string; start: number }>, isKnown: (w: string) => boolean): ThaiSegmentWord[] => {
    const tokens = pieces.map((p) => rawToken(p.text, p.start));
    const analyses = deps.analyze(tokens);
    return pieces.map((p, i) => ({ text: p.text, start: p.start, end: p.start + p.text.length, known: isKnown(normalizeThai(p.text)), readings: readingsOf(analyses[i]) }));
  };

  return (input, opts = {}) => {
    const text = normalizeThai(input);
    const max = opts.maxAlternatives ?? 3;
    const isKnown = (w: string): boolean =>
      w === REPEAT || deps.isWord(w) || !!opts.isWord?.(w) || (w.length > 1 && w.endsWith(REPEAT) && isKnown(w.slice(0, -1))); // ช้าๆ is the known word ช้า repeated

    // ── the tokenizer's cut (in its context when the caller gave one and the selection's edges are token edges there)
    let chosenPieces: Array<{ text: string; start: number }> | undefined;
    let basis: ThaiSegmentation['basis'] = 'tokenizer';
    let chosenAnalyses: AnalyzedToken[] | undefined;
    const before = normalizeThai(opts.context?.before ?? '');
    const after = normalizeThai(opts.context?.after ?? '');
    if (before || after) {
      const all = deps.tokenize(before + text + after);
      const from = before.length, to = before.length + text.length;
      const inside = all.filter((t) => t.start >= from && t.end <= to && t.isWord);
      if (inside.length && inside[0].start === from && inside[inside.length - 1].end === to && inside.map((t) => t.surface).join('') === text) {
        chosenPieces = inside.map((t) => ({ text: t.surface, start: t.start - from }));
        chosenAnalyses = deps.analyze(all).filter((_, i) => all[i].start >= from && all[i].end <= to && all[i].isWord);
        basis = 'tokenizer-in-context';
      }
    }
    if (!chosenPieces) {
      const toks = deps.tokenize(text).filter((t) => t.isWord);
      chosenPieces = toks.length && toks.map((t) => t.surface).join('') === text
        ? toks.map((t) => ({ text: t.surface, start: t.start }))
        : [{ text, start: 0 }];
    }
    const chosenWords = chosenAnalyses && chosenAnalyses.length === chosenPieces.length
      ? chosenPieces.map((p, i) => ({ text: p.text, start: p.start, end: p.start + p.text.length, known: isKnown(normalizeThai(p.text)), readings: readingsOf(chosenAnalyses![i]) }))
      : wordsOf(chosenPieces, isKnown);
    const chosenCost = chosenWords.reduce((s, w) => s + pieceCost(w.text) + (w.known ? 0 : UNKNOWN_PIECE), 0) - TOKENIZER_PRIOR;
    const chosen = (confidence: number): ThaiSegmentation => ({ words: chosenWords, confidence, basis });

    if (!THAI_RUN.test(text)) {
      return { text, chosen: chosen(chosenWords.every((w) => w.known) ? 0.9 : 0.5), alternatives: [],
        reason: 'The selection holds spaces or characters that are not Thai letters; it is read as written and only the tokenizer\'s cut is shown.' };
    }

    // ── the other cuts: k-best dynamic programming over the selection, from the end, pieces that are known words only
    const chars = [...text];
    const n = chars.length;
    const offsets: number[] = [];
    { let o = 0; for (const c of chars) { offsets.push(o); o += c.length; } offsets.push(o); }
    type Path = { cost: number; pieces: Array<[number, number]> };
    const best: Path[][] = Array.from({ length: n + 1 }, () => []);
    best[n] = [{ cost: 0, pieces: [] }];
    for (let i = n - 1; i >= 0; i--) {
      if (NOT_A_START.test(chars[i])) continue;
      const found: Path[] = [];
      for (let len = 1; len <= Math.min(MAX_WORD_LEN, n - i); len++) {
        const j = i + len;
        if (!best[j].length) continue;
        const w = chars.slice(i, j).join('');
        if (w === REPEAT || NOT_AN_END.test(w) || (j < n && NOT_A_START.test(chars[j]))) continue; // ๆ is never a piece of its own: it belongs to the word before it
        if (!isKnown(normalizeThai(w))) continue;
        const c = pieceCost(w);
        for (const p of best[j]) found.push({ cost: p.cost + c, pieces: [[i, j], ...p.pieces] });
      }
      found.sort((a, b) => a.cost - b.cost || a.pieces.length - b.pieces.length);
      best[i] = found.slice(0, K_BEST);
    }
    const sameCut = (pieces: Array<[number, number]>): boolean =>
      pieces.length === chosenPieces!.length && pieces.every(([a, b], k) => offsets[a] === chosenPieces![k].start && offsets[b] === chosenPieces![k].start + chosenPieces![k].text.length);
    const others = best[0].filter((p) => !sameCut(p.pieces));
    const costOf = (p: Path): number => p.cost;

    // shares among the chosen cut and the other cuts found (the K best, so a bounded set)
    const weight = (cost: number): number => Math.exp(-cost);
    const total = weight(chosenCost) + others.reduce((s, p) => s + weight(costOf(p)), 0);
    const clamp = (x: number): number => Math.round(Math.min(0.95, Math.max(0.02, x)) * 100) / 100;
    const share = (cost: number): number => clamp(weight(cost) / total);

    const plausible = others
      .map((p) => ({ p, confidence: share(costOf(p)) }))
      .filter((x) => x.confidence >= MIN_ALTERNATIVE_CONFIDENCE)
      .slice(0, max);
    const alternatives: ThaiSegmentation[] = plausible.map(({ p, confidence }) => ({
      words: wordsOf(p.pieces.map(([a, b]) => ({ text: chars.slice(a, b).join(''), start: offsets[a] })), isKnown),
      confidence, basis: 'word-list' as const,
    }));

    const unknownPieces = chosenWords.filter((w) => !w.known).map((w) => w.text);
    let reason: string | undefined;
    if (!alternatives.length) {
      if (!others.length) {
        reason = unknownPieces.length
          ? `The tokenizer's cut has pieces the word list does not know (${unknownPieces.join(', ')}), and no other cut gives pieces that are all listed words, so there is nothing to compare it with.`
          : chosenWords.length === 1
            ? 'This is one word of the word list, and no other cut gives pieces that are all listed words.'
            : 'No other cut gives pieces that are all listed words, so the tokenizer\'s cut is the only plausible one.';
      } else {
        reason = `Other cuts exist (${others.slice(0, 2).map((p) => p.pieces.map(([a, b]) => chars.slice(a, b).join('')).join('-')).join(', ')}) but each is far less plausible than the tokenizer's cut.`;
      }
    }
    return { text, chosen: chosen(share(chosenCost)), alternatives, ...(reason ? { reason } : {}) };
  };
}
