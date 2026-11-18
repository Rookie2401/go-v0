/**
 * Which units to teach next: the small group with the greatest marginal READING benefit, not the next letters of the alphabet.
 *
 *   utility(S) = Σ over words that S makes decodable  (UNLOCK + USE · weight)
 *              + PARTIAL · Σ over the other words      (weight × share of the word's missing units that S supplies)
 *              + PAGE · share of the page's unit occurrences S covers
 *              − Σ over u in S (COST · difficulty(u) + CONFUSION when u is easily confused with a unit not yet ready)
 *
 * Chosen by greedy steps with a lookahead of two (a step may take a pair whose words need both), compared per unit added, ties
 * broken by the profile's own unit order. Deterministic. The weights are exported and recorded in the deck notes and tests.
 */
import type { ScriptProfile, StarterWord } from './types';

export const SELECT_WEIGHTS = { UNLOCK: 1, USE: 2, PARTIAL: 0.6, PAGE: 3, COST: 0.25, CONFUSION: 0.4 } as const;

export interface WordDeps { word: StarterWord; deps: readonly string[] }

/** The starter words with their dependencies (words the profile cannot model are left out). */
export function wordDependencies(profile: ScriptProfile): WordDeps[] {
  const out: WordDeps[] = [];
  for (const word of profile.words) {
    const deps = profile.dependencies(word.form);
    if (deps && deps.length) out.push({ word, deps });
  }
  return out;
}

export const decodableWith = (deps: readonly string[], ready: ReadonlySet<string>): boolean => deps.every((d) => ready.has(d));

export interface SelectOptions {
  /** How many units to choose. */
  count: number;
  /** The units already ready for decoding (knowledge.ts readyUnits). */
  ready: ReadonlySet<string>;
  /** Units not to choose (already introduced and still being learned, or excluded). */
  exclude?: ReadonlySet<string>;
  /** Occurrences of each unit on the learner's page (pageStats.ts), optional. */
  pageCounts?: ReadonlyMap<string, number>;
}

function utility(profile: ScriptProfile, words: readonly WordDeps[], ready: ReadonlySet<string>, add: readonly string[], opts: SelectOptions): number {
  const W = SELECT_WEIGHTS;
  const withS = new Set([...ready, ...add]);
  let gain = 0;
  for (const { word, deps } of words) {
    if (decodableWith(deps, ready)) continue;
    if (decodableWith(deps, withS)) { gain += W.UNLOCK + W.USE * word.weight; continue; }
    const missing = deps.filter((d) => !ready.has(d));
    const supplied = missing.filter((d) => add.includes(d)).length;
    if (supplied) gain += W.PARTIAL * word.weight * (supplied / missing.length);
  }
  if (opts.pageCounts && opts.pageCounts.size) {
    let total = 0;
    let covered = 0;
    for (const [key, n] of opts.pageCounts) { total += n; if (add.includes(key)) covered += n; }
    if (total) gain += W.PAGE * (covered / total);
  }
  const unitOf = new Map(profile.units.map((u) => [u.key, u] as const));
  for (const key of add) {
    gain -= W.COST * (unitOf.get(key)?.difficulty ?? 1);
    for (const c of profile.confusions) {
      const partner = c.a === key ? c.b : c.b === key ? c.a : undefined;
      if (!partner) continue;
      if (add.includes(partner)) gain -= W.CONFUSION; // both new at once: the costliest
      else if (!ready.has(partner)) gain -= W.CONFUSION / 2;
    }
  }
  return gain;
}

/** The next units to teach, in the order to introduce them. */
export function selectNextUnits(profile: ScriptProfile, opts: SelectOptions, words: readonly WordDeps[] = wordDependencies(profile)): string[] {
  const order = new Map(profile.units.map((u, i) => [u.key, i] as const));
  const candidates = profile.units.filter((u) => !u.familiar && !opts.ready.has(u.key) && !(opts.exclude?.has(u.key))).map((u) => u.key);
  const chosen: string[] = [];
  let ready = new Set(opts.ready);
  while (chosen.length < opts.count) {
    const left = candidates.filter((k) => !chosen.includes(k));
    if (!left.length) break;
    const single = left.map((k) => ({ add: [k], score: utility(profile, words, ready, [k], opts) }))
      .sort((a, b) => b.score - a.score || order.get(a.add[0])! - order.get(b.add[0])!);
    let best = single[0];
    if (chosen.length + 2 <= opts.count) {
      const top = single.slice(0, 12).map((s) => s.add[0]);
      for (let i = 0; i < top.length; i++) {
        for (let j = i + 1; j < top.length; j++) {
          const add = [top[i], top[j]];
          const score = utility(profile, words, ready, add, opts) / 2;
          if (score > best.score / best.add.length + 1e-9) best = { add, score: score * 2 };
        }
      }
    }
    // introduce a pair in the order that lets the first already appear in more words
    for (const k of best.add) chosen.push(k);
    ready = new Set([...ready, ...best.add]);
  }
  return chosen.slice(0, opts.count);
}

/** For evaluation: how many of `words` are decodable after learning the first n units of an order (familiar units are given). */
export function decodableAfter(profile: ScriptProfile, orderKeys: readonly string[], n: number, words: readonly WordDeps[] = wordDependencies(profile)): number {
  const ready = new Set([...profile.units.filter((u) => u.familiar).map((u) => u.key), ...orderKeys.slice(0, n)]);
  return words.filter(({ deps }) => decodableWith(deps, ready)).length;
}

/** The full teaching order the selector produces from nothing (for evaluation and the deck's "letters in order" view). */
export function sprintOrder(profile: ScriptProfile, batch = 4): string[] {
  const words = wordDependencies(profile);
  const familiar = new Set(profile.units.filter((u) => u.familiar).map((u) => u.key));
  const order: string[] = [];
  const total = profile.units.filter((u) => !u.familiar).length;
  while (order.length < total) {
    const next = selectNextUnits(profile, { count: batch, ready: new Set([...familiar, ...order]) }, words);
    if (!next.length) break;
    order.push(...next);
  }
  return order;
}
