/**
 * Corpus frequency: a CONTRACT and two constructors, no data. Ecclesia owns its corpora (the whole Greek New Testament, the
 * Tanakh, the Vulgate) and supplies the counts; this package never ships, estimates or guesses a frequency. Ranks are
 * competition ranks over lexeme ids (equal counts share a rank; ties in order are broken by id, so a table is deterministic).
 */
import type { CorpusFrequencyProvider, EcclesiaLanguageId, EcclesiaLanguageProfile, PassageTokens } from './contract';
import { lexemeId, passageLabel } from './identity';

/** A provider from counts per lexeme id (`lemma:el:λόγος:NOUN` → 330). */
export function frequencyTable(language: EcclesiaLanguageId, corpusId: string, counts: ReadonlyMap<string, number> | Record<string, number>): CorpusFrequencyProvider {
  const entries = (counts instanceof Map ? [...counts.entries()] : Object.entries(counts)).filter(([, n]) => Number.isFinite(n) && n > 0);
  entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const count = new Map(entries);
  const rank = new Map<string, number>();
  let last = -1, lastRank = 0;
  entries.forEach(([id, n], i) => { if (n !== last) { last = n; lastRank = i + 1; } rank.set(id, lastRank); });
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return {
    corpusId, language, total,
    rankOf: (id) => rank.get(id),
    countOf: (id) => count.get(id) ?? 0,
    perMillion: (id) => { const n = count.get(id); return n === undefined || !total ? undefined : Math.round((n / total) * 1e6 * 1000) / 1000; },
  };
}

/** Counts lexemes over tokenised passages: the way to build a provider from the reader's own corpus. */
export function frequencyFromPassages(profile: EcclesiaLanguageProfile, passages: readonly PassageTokens[], corpusId: string): CorpusFrequencyProvider {
  const counts = new Map<string, number>();
  for (const p of passages) {
    if (p.language !== profile.id) throw new RangeError(`passage ${passageLabel(p.ref)} is ${p.language}, not ${profile.id}`);
    for (const v of p.verses) for (const t of v.tokens) { const id = lexemeId(profile, t.lemma, t.pos); counts.set(id, (counts.get(id) ?? 0) + 1); }
  }
  return frequencyTable(profile.id, corpusId, counts);
}

/** No corpus: every lookup answers "unknown" (the familiarity estimate then orders unknown words by occurrences and says so). */
export const noFrequency = (language: EcclesiaLanguageId): CorpusFrequencyProvider => ({
  corpusId: 'none', language, total: 0, rankOf: () => undefined, countOf: () => 0, perMillion: () => undefined,
});
