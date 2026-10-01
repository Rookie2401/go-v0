/**
 * Reading pace — quiet measures from what was already recorded. Never a score, a target or a badge.
 *
 * The words-per-minute figure divides the words of the sentences that carried a dwell time by that dwell. The reader
 * records how long a sentence stayed in view and CAPS it, and the time includes thinking and idle moments: the figure
 * is therefore only a ROUGH, LOWER-BOUND measure of speed (a slow figure may mean a long pause, not slow reading). It
 * needs `READINESS.pace.minTimedSentences` timed sentences before it is shown at all.
 *
 * Trend: the median per-sitting words-per-minute of the last three sittings against the three before them (a sitting
 * needs `minTimedPerSitting` timed sentences to have a figure of its own). 10 % faster / slower or more is a change;
 * fewer than six sittings with a figure is `insufficient-data`.
 *
 * Lookups per 100 words and rescues per 100 sentences count help recorded in the same (sentence, sitting) as a view.
 * `rereadSittings` = sittings in which at least one sentence was viewed that an earlier sitting had already viewed.
 */
import type { ReadingPace } from '../core';
import type { ReadingUnit, UnitScope } from './activity';
import { readingUnits, stageTextIds } from './activity';
import { READINESS } from './policy';
import type { Ctx } from './state';
import { median, round1 } from './util';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Per-sitting words-per-minute figures, oldest first (only sittings with enough timed sentences). */
function sittingPaces(units: ReadingUnit[]): number[] {
  const bySitting = new Map<string, ReadingUnit[]>();
  for (const u of units) {
    if (u.dwellMs === undefined) continue;
    let l = bySitting.get(u.sitting);
    if (!l) bySitting.set(u.sitting, (l = []));
    l.push(u);
  }
  return [...bySitting.entries()]
    .filter(([, l]) => l.length >= READINESS.pace.minTimedPerSitting)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, l]) => sum(l.map((u) => u.words)) / (sum(l.map((u) => u.dwellMs!)) / 60000));
}

export function paceTrend(units: ReadingUnit[]): ReadingPace['trend'] {
  const n = READINESS.pace.sittings;
  const paces = sittingPaces(units);
  if (paces.length < 2 * n) return 'insufficient-data';
  const now = median(paces.slice(-n));
  const before = median(paces.slice(-2 * n, -n));
  if (!(before > 0)) return 'insufficient-data';
  if (now >= before * (1 + READINESS.pace.change)) return 'faster';
  if (now <= before * (1 - READINESS.pace.change)) return 'slower';
  return 'steady';
}

export function paceOf(units: ReadingUnit[]): ReadingPace {
  const words = sum(units.map((u) => u.words));
  const timed = units.filter((u) => u.dwellMs !== undefined);
  const firstSitting = new Map<string, string>();
  for (const u of units) {
    const f = firstSitting.get(u.sentenceId);
    if (f === undefined || u.sitting < f) firstSitting.set(u.sentenceId, u.sitting);
  }
  const reread = new Set<string>();
  for (const u of units) if (u.sitting > firstSitting.get(u.sentenceId)!) reread.add(u.sitting);
  const pace: ReadingPace = {
    basis: 'sentence-dwell',
    sentences: units.length,
    lookupsPer100Words: words > 0 ? round1((sum(units.map((u) => u.lookups)) / words) * 100) : 0,
    rescuesPer100Sentences: units.length > 0 ? round1((units.filter((u) => u.rescued).length / units.length) * 100) : 0,
    rereadSittings: reread.size,
    trend: paceTrend(units),
  };
  if (timed.length >= READINESS.pace.minTimedSentences) {
    const minutes = sum(timed.map((u) => u.dwellMs!)) / 60000;
    if (minutes > 0) pace.wordsPerMinute = round1(sum(timed.map((u) => u.words)) / minutes);
  }
  return pace;
}

export async function readingPace(
  ctx: Ctx, userId: string, opts?: { textId?: string; stageId?: string; lang?: import('../core').LanguageCode },
): Promise<ReadingPace> {
  let textIds: Set<string> | undefined;
  if (opts?.textId) textIds = new Set([opts.textId]);
  if (opts?.stageId) {
    const stage = await stageTextIds(ctx, opts.stageId);
    textIds = textIds ? new Set([...textIds].filter((t) => stage.has(t))) : stage;
  }
  const scope: UnitScope = { ...(opts?.lang ? { lang: opts.lang } : {}), ...(textIds ? { textIds } : {}) };
  return paceOf(await readingUnits(ctx, userId, scope));
}
