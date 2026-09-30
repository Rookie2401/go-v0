/**
 * Alignment writers.
 *
 *  - Sentence alignment is BY CONSTRUCTION: a segment is one sentence, so the whole asset is that
 *    sentence (0..durationMs, confidence 1). No timing is inferred.
 *  - Word alignment exists ONLY when the provider really returned marks AND declares trustworthy word
 *    boundaries. Each mark is mapped to a token only when its character range is exactly that token's
 *    range in the speech text; anything ambiguous is dropped rather than guessed. Nothing is ever
 *    interpolated, evenly spread, or estimated.
 */
import type { AudioAlignment, AudioAsset, AudioSegment, Token } from '../core/model';
import type { WordMark } from '../core/contracts/golisten';
import type { RawToken } from '../core/adapters';
import type { Runtime } from './types';

export const ALIGNER_CONSTRUCT = 'golisten-construct@1';
/** Confidence policy for provider marks: exact mapping through an unmodified speech text / through a transformed one. */
export const MARKS_CONFIDENCE_EXACT = 0.9;
export const MARKS_CONFIDENCE_MAPPED = 0.7;

export async function writeSentenceAlignments(rt: Runtime, segment: AudioSegment, asset: AudioAsset): Promise<number> {
  const rows: AudioAlignment[] = segment.sentenceIds.map((sentenceId) => ({
    id: `al:${segment.id}:sentence:${sentenceId}`,
    segmentId: segment.id, assetId: asset.id, unit: 'sentence', unitId: sentenceId,
    startMs: 0, endMs: asset.durationMs, method: 'by-construction', confidence: 1, alignerVersion: ALIGNER_CONSTRUCT,
  }));
  if (rows.length) await rt.store.alignments.bulkPut(rows);
  return rows.length;
}

/** Returns a reason string if the marks cannot be trusted at all. */
export function marksProblem(marks: WordMark[], textLength: number, durationMs: number): string | undefined {
  let prevStart = -Infinity;
  for (const m of marks) {
    if (![m.charStart, m.charEnd, m.startMs, m.endMs].every(Number.isFinite)) return 'non-finite mark';
    if (m.charStart < 0 || m.charEnd <= m.charStart || m.charEnd > textLength) return 'mark outside text';
    if (m.startMs < 0 || m.endMs < m.startMs || m.endMs > durationMs + 50) return 'mark outside audio';
    if (m.startMs < prevStart) return 'marks not in time order';
    prevStart = m.startMs;
  }
  return undefined;
}

/** Longest-common-subsequence pairing of speech word tokens to display word tokens by normalized form. */
function pairTokens(speech: RawToken[], display: Token[]): Array<[number, number]> {
  const n = speech.length, m = display.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = speech[i].normalized === display[j].normalized ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (speech[i].normalized === display[j].normalized) { pairs.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

export interface MarkAlignmentReport { written: number; dropped: number; note?: string }

export async function writeMarkAlignments(
  rt: Runtime, segment: AudioSegment, asset: AudioAsset, marks: WordMark[], speechText: string, alignerVersion: string,
): Promise<MarkAlignmentReport> {
  const problem = marksProblem(marks, speechText.length, asset.durationMs);
  if (problem) return { written: 0, dropped: marks.length, note: `provider marks rejected: ${problem}` };
  // Index marks by their trimmed character range.
  const byRange = new Map<string, WordMark[]>();
  for (const mk of marks) {
    const raw = speechText.slice(mk.charStart, mk.charEnd);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = `${mk.charStart + lead}:${mk.charStart + lead + trimmed.length}`;
    byRange.set(key, [...(byRange.get(key) ?? []), mk]);
  }
  const speechTokens = rt.adapters.get(segment.lang).tokenize(speechText).filter((t) => t.isWord);
  const rows: AudioAlignment[] = [];
  let usedMarks = 0;
  for (const sentenceId of segment.sentenceIds) {
    const display = (await rt.store.tokens.where('sentenceId', sentenceId)).filter((t) => t.isWord).sort((a, b) => a.index - b.index);
    const pairs = pairTokens(speechTokens, display);
    const identity = pairs.length === display.length && display.length === speechTokens.length;
    for (const [si, di] of pairs) {
      const st = speechTokens[si];
      const hits = byRange.get(`${st.start}:${st.end}`);
      if (!hits || hits.length !== 1) continue; // no mark, or ambiguous: leave unaligned
      const mk = hits[0];
      usedMarks++;
      rows.push({
        id: `al:${segment.id}:word:${display[di].id}`,
        segmentId: segment.id, assetId: asset.id, unit: 'word', unitId: display[di].id,
        startMs: mk.startMs, endMs: mk.endMs, method: 'provider-marks',
        confidence: identity ? MARKS_CONFIDENCE_EXACT : MARKS_CONFIDENCE_MAPPED, alignerVersion,
      });
    }
  }
  if (rows.length) await rt.store.alignments.bulkPut(rows);
  return { written: rows.length, dropped: Math.max(0, marks.length - usedMarks) };
}
