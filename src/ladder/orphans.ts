/**
 * The ladder's ORPHAN lemmas at run time: lemmas a ladder unit introduces that no later unit meets again - the gate's own finding
 * (`orphansOf` in gate.ts, warning code `orphan`), made available to the recommender (R4, docs/audits/COURSE-AUDIT-2026-10-07.md 4.3
 * item 12) so that a library text bringing such a word back can be offered as natural reinforcement.
 *
 * HOW THE LIST IS OBTAINED (chosen over a build-time bundle field): the ladder bundle (bundle.ts) already carries every controlled /
 * adapted unit's document, and the gate is pure given a document and an adapter. So the list is computed from the bundled documents
 * with the course language's own adapter the first time it is asked for, exactly as `measureLadder` does (same `analyseDocument`,
 * same `Progress` for "new lemma", same `orphansOf`, same `POLICY.orphans.minLaterUnits` rule that a unit with fewer than three
 * readable units after it is not judged), and cached per (adapter, ladder source) - a few hundred milliseconds once, then free. A
 * generated JSON next to ladder.json would go stale the moment a unit is edited and would need a build step in every course; the
 * computation cannot disagree with the gate because it is the gate's.
 *
 * Differences from the gate, stated: Stage 0's scenes are not part of the browser bundle (they are loaded from data/stage0 by the
 * Node loader), so a lemma Stage 0 already taught counts as new in its first unit here; authentic units have no bundled document
 * and are skipped. The result is a set of lower-cased NFC lemma words (the gate's keys), matched by the ranker to library lemmas
 * by their written lemma (rank.ts `lemmaWord`).
 */
import type { LanguageAdapter, LanguageCode } from '../core';
import { analyseDocument, Progress } from './analyse';
import type { UnitStat } from './analyse';
import { bundledLadder, defaultLadderSource } from './bundle';
import type { LadderSource } from './bundle';
import { orphansOf } from './gate';
import { POLICY } from './policy';

const cache = new WeakMap<LanguageAdapter, WeakMap<LadderSource, ReadonlySet<string>>>();

/** The orphan lemma words of `lang`'s bundled ladder (empty when it has none). Cached per adapter and source. */
export function ladderOrphanLemmas(lang: LanguageCode, adapter: LanguageAdapter, source: LadderSource = defaultLadderSource()): ReadonlySet<string> {
  let bySource = cache.get(adapter);
  if (!bySource) cache.set(adapter, (bySource = new WeakMap()));
  const hit = bySource.get(source);
  if (hit) return hit;
  const out = computeOrphans(lang, adapter, source);
  bySource.set(source, out);
  return out;
}

/** Uncached: the gate's walk over the bundled documents. */
export function computeOrphans(lang: LanguageCode, adapter: LanguageAdapter, source: LadderSource): ReadonlySet<string> {
  const out = new Set<string>();
  const ladder = bundledLadder(lang, source);
  if (!ladder) return out;
  const progress = new Progress(POLICY.minEncounters);
  const stats: Array<UnitStat | undefined> = [];
  const fresh: string[][] = [];
  for (const b of ladder.units) {
    if (!b.doc) { stats.push(undefined); fresh.push([]); continue; }
    let stat: UnitStat;
    try { stat = analyseDocument(adapter, b.doc); } catch { stats.push(undefined); fresh.push([]); continue; } // an unreadable unit is the gate's to report
    stats.push(stat);
    if (stat.words === 0) { fresh.push([]); continue; }
    fresh.push(progress.newLemmas(stat));
    progress.add(stat);
  }
  stats.forEach((_, i) => {
    if (fresh[i].length === 0) return;
    const later = stats.slice(i + 1).filter((s) => s && s.words > 0).length;
    if (later < POLICY.orphans.minLaterUnits) return;
    for (const l of orphansOf(i, fresh[i], stats)) out.add(l);
  });
  return out;
}
