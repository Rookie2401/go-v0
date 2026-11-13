import type { ActiveLevel } from '../active/levels';

export interface CoverageToken {
  identity?: string;
  state?: ActiveLevel;
  /** Existing language-wide Hebrew/Greek evidence cannot prove which period was studied. */
  legacyShared?: boolean;
}

export interface CoverageOptions {
  languageId: string;
  varietyId?: string;
  sourceScope: 'primary' | 'page';
  freshness: 'current' | 'cached' | 'stale' | 'unknown';
}

export function aggregateCoverage(tokens: readonly CoverageToken[], options: CoverageOptions) {
  const occurrences = { confidentKnown: 0, familiarOnly: 0, newOrSeen: 0, unrecorded: 0, unresolved: 0, legacyShared: 0 };
  const identities = new Set<string>();
  for (const { identity, state, legacyShared } of tokens) {
    if (!identity) {
      occurrences.unresolved++;
      continue;
    }
    identities.add(identity);
    if (legacyShared && state === undefined) occurrences.legacyShared++;
    if (state === undefined) occurrences.unrecorded++;
    else if (state === 'known' || state === 'automatic') occurrences.confidentKnown++;
    else if (state === 'recognized' || state === 'familiar') occurrences.familiarOnly++;
    else occurrences.newOrSeen++;
  }
  const totalOccurrences = tokens.length;
  const percent = (count: number) => totalOccurrences ? count / totalOccurrences * 100 : null;
  return {
    ...options, occurrences, totalOccurrences, uniqueResolvedVocabulary: identities.size,
    confidentCoverage: percent(occurrences.confidentKnown),
    familiarCoverage: percent(occurrences.confidentKnown + occurrences.familiarOnly),
  };
}

export type CoverageResult = ReturnType<typeof aggregateCoverage>;
