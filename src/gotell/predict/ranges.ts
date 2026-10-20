/**
 * Pure range arithmetic for the assist bookkeeping (docs/GOTELL-GUIDED.md, Package A). Ranges are half-open
 * [start, end) offsets into the editor text and are shifted on every edit; a range that overlaps an edit is dropped.
 */
import type { Range, TextAssist } from './types';

/** One contiguous replacement: `removed` characters of the old text at `start` became `inserted` new characters. */
export interface TextEdit { start: number; removed: number; inserted: number }

/** The smallest single edit that turns `oldText` into `newText` (common prefix and common suffix). */
export function editBetween(oldText: string, newText: string): TextEdit {
  const max = Math.min(oldText.length, newText.length);
  let p = 0;
  while (p < max && oldText.charCodeAt(p) === newText.charCodeAt(p)) p++;
  let s = 0;
  while (s < max - p && oldText.charCodeAt(oldText.length - 1 - s) === newText.charCodeAt(newText.length - 1 - s)) s++;
  return { start: p, removed: oldText.length - p - s, inserted: newText.length - p - s };
}

/**
 * Entirely before the edit (ends at or before its start): unchanged. Entirely after (starts at or after the end of the
 * removed span): shifted. Anything else overlaps the edit and is dropped. Empty ranges are dropped.
 */
export function shiftRanges(ranges: readonly Range[], edit: TextEdit): Range[] {
  const delta = edit.inserted - edit.removed;
  const editEnd = edit.start + edit.removed;
  const out: Range[] = [];
  for (const r of ranges) {
    if (r.end <= r.start) continue;
    if (r.end <= edit.start) out.push({ start: r.start, end: r.end });
    else if (r.start >= editEnd) out.push({ start: r.start + delta, end: r.end + delta });
    // otherwise the edit touched the range: it no longer describes what the learner did
  }
  return out;
}

export function shiftAssist(assist: TextAssist, edit: TextEdit): TextAssist {
  return { supplied: shiftRanges(assist.supplied, edit), guided: shiftRanges(assist.guided, edit) };
}

/** Adds a range (a new array, sorted by start). Ranges it overlaps are merged into it; ranges that merely touch stay apart. */
export function addRange(ranges: readonly Range[], r: Range): Range[] {
  if (r.end <= r.start) return ranges.map((x) => ({ ...x }));
  let merged: Range = { start: r.start, end: r.end };
  const out: Range[] = [];
  for (const x of ranges) {
    if (x.end <= x.start) continue;
    if (x.end > merged.start && x.start < merged.end) merged = { start: Math.min(x.start, merged.start), end: Math.max(x.end, merged.end) };
    else out.push({ start: x.start, end: x.end });
  }
  out.push(merged);
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** The range that covers the character at `offset` (start <= offset < end), if any. */
export function rangeAt(ranges: readonly Range[], offset: number): Range | undefined {
  return ranges.find((r) => r.start <= offset && offset < r.end);
}
