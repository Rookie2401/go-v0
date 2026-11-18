/**
 * Script readiness of a text: how much of it the learner's DEMONSTRATED script knowledge lets them decode. Two figures, both kept
 * apart from the vocabulary "words known" figure, which this never changes:
 *
 *   unit coverage      the share of the text's script-unit occurrences that are ready (knowledge.ts READY) — each word token
 *                      counts each unit it needs once;
 *   decodable tokens   the share of word tokens whose every unit is ready.
 *
 * Denominators, stated once:
 *   - a word token is a run of letters and marks (profile.words_of when the profile has its own); punctuation, digits, spaces and
 *     symbols are not tokens; every occurrence counts (a word repeated five times is five tokens);
 *   - diacritics and points are part of their word and count as units where the profile models them;
 *   - a token in another script, or one the profile cannot model, is UNSUPPORTED: it stays in the denominator of decodable tokens
 *     (as not decodable) and is reported separately, never counted as decodable;
 *   - with no tokens at all the figures are undefined, never 0 % or 100 %.
 */
import { lettersAndMarksWords } from './segment';
import { readyUnits, type UnitKnowledge } from './knowledge';
import type { ScriptProfile } from './types';

export interface ScriptReadiness {
  tokens: number;
  decodable: number;
  unsupported: number;
  /** decodable / tokens; undefined with no tokens. */
  decodableShare?: number;
  unitOccurrences: number;
  unitCovered: number;
  /** unitCovered / unitOccurrences; undefined with none. */
  unitShare?: number;
  /** The units not yet ready, most frequent in the text first: what would help most. */
  missing: Array<{ key: string; occurrences: number }>;
}

export function tokensOf(profile: ScriptProfile, text: string): string[] {
  return profile.words_of ? profile.words_of(text) : lettersAndMarksWords(text);
}

/** Occurrences of each unit in a text (each token counts each unit it needs once). Tokens the profile cannot model are skipped. */
export function unitCounts(profile: ScriptProfile, tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) {
    const deps = profile.dependencies(t);
    if (!deps) continue;
    for (const d of new Set(deps)) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return counts;
}

export function scriptReadiness(profile: ScriptProfile, tokens: readonly string[], knowledge: ReadonlyMap<string, UnitKnowledge>): ScriptReadiness {
  const ready = readyUnits(knowledge);
  let decodable = 0, unsupported = 0, unitOccurrences = 0, unitCovered = 0;
  const missing = new Map<string, number>();
  for (const t of tokens) {
    const deps = profile.dependencies(t);
    if (!deps || !deps.length) { unsupported++; continue; }
    let all = true;
    for (const d of new Set(deps)) {
      unitOccurrences++;
      if (ready.has(d)) unitCovered++;
      else { all = false; missing.set(d, (missing.get(d) ?? 0) + 1); }
    }
    if (all) decodable++;
  }
  return {
    tokens: tokens.length, decodable, unsupported,
    ...(tokens.length ? { decodableShare: decodable / tokens.length } : {}),
    unitOccurrences, unitCovered, ...(unitOccurrences ? { unitShare: unitCovered / unitOccurrences } : {}),
    missing: [...missing].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([key, occurrences]) => ({ key, occurrences })),
  };
}
