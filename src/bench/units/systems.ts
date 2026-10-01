/**
 * The reading-unit systems: one interface, `split(paragraph) => Span[]` (spans slice the paragraph exactly, in order,
 * and never contain the whitespace that separates units).
 *
 *  - `adapter`   the real splitter the app uses: `thAdapter.segmentSentences` (segmentThaiSentences + segmentThaiProse).
 *  - `paragraph` no splitting: the whole paragraph is one unit (a lower bound on boundaries, an upper bound on unit size).
 *  - `spaces`    every run of whitespace splits (an upper bound on boundaries, a lower bound on unit size).
 * The last two are bounds, not competitors.
 */
import type { Span } from '../../core';
import { thAdapter } from '../../adapters/th';
import { isWs } from '../shared';
import { unitsOf, type UnitGoldCase } from './gold';

export interface UnitSystem { id: string; label: string; split(paragraph: string): Span[] }

/** The paragraph as a single span, trimmed of whitespace at both ends (empty list for an empty paragraph). */
function whole(text: string): Span[] {
  let a = 0;
  let b = text.length;
  while (a < b && isWs(text[a])) a++;
  while (b > a && isWs(text[b - 1])) b--;
  return b > a ? [{ start: a, end: b, text: text.slice(a, b) }] : [];
}

function bySpaces(text: string): Span[] {
  const out: Span[] = [];
  let a = -1;
  for (let i = 0; i <= text.length; i++) {
    const ws = i === text.length || isWs(text[i]);
    if (!ws && a < 0) a = i;
    if (ws && a >= 0) { out.push({ start: a, end: i, text: text.slice(a, i) }); a = -1; }
  }
  return out;
}

export const UNIT_SYSTEMS: readonly UnitSystem[] = [
  { id: 'adapter', label: 'adapter (thAdapter.segmentSentences)', split: (t) => thAdapter.segmentSentences(t) },
  { id: 'paragraph', label: 'paragraph (no splitting; bound)', split: whole },
  { id: 'spaces', label: 'spaces (every space splits; bound)', split: bySpaces },
];

/** The gold units themselves as a system (what a perfect splitter would produce), for scoring the guards on the gold. */
export function goldSystem(cases: readonly UnitGoldCase[]): UnitSystem {
  const byParagraph = new Map(cases.map((c) => [c.paragraph, c]));
  return {
    id: 'gold', label: 'gold units (what a perfect splitter would give)',
    split: (text) => {
      const c = byParagraph.get(text);
      if (!c) throw new Error('goldSystem: paragraph not in the gold set');
      const out: Span[] = [];
      let at = 0;
      for (const u of unitsOf(c)) {
        const lead = u.length - u.trimStart().length;
        const trimmed = u.trim();
        if (trimmed) out.push({ start: at + lead, end: at + lead + trimmed.length, text: trimmed });
        at += u.length;
      }
      return out;
    },
  };
}

export function unitSystem(id: string): UnitSystem {
  const s = UNIT_SYSTEMS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown unit system "${id}" (one of ${UNIT_SYSTEMS.map((x) => x.id).join(', ')})`);
  return s;
}

/** Unit-start offsets of a split, excluding the first unit. */
export const boundariesOfSpans = (spans: readonly Span[]): number[] => spans.slice(1).map((s) => s.start);

/** Whether the spans slice the paragraph exactly and cover every non-space character in order. */
export function coversParagraph(paragraph: string, spans: readonly Span[]): boolean {
  let at = 0;
  for (const s of spans) {
    if (s.start < at || s.end <= s.start || s.end > paragraph.length || paragraph.slice(s.start, s.end) !== s.text) return false;
    for (let i = at; i < s.start; i++) if (!isWs(paragraph[i])) return false;
    at = s.end;
  }
  for (let i = at; i < paragraph.length; i++) if (!isWs(paragraph[i])) return false;
  return true;
}
