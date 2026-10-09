/**
 * adapted from src/gotell/coverage.ts (2026-10-09)
 *
 * What GoTell's checker can and cannot verify for a language, stated from the adapter's own `support` record.
 * Shown on every sentence: a suggestion fixes what the checker found, never "the sentence".
 *
 * `checkerCoverageParts` is the structured form (a headline and the adapter's list of limits, one entry each); `checkerCoverage`
 * is the same thing as one string, kept for the evidence rules and the older callers. The screens show the parts through
 * `summariseCoverage` (engine/coverage.ts) so that a long list of limits is one line with a disclosure.
 */
import type { CoverageParts } from '../types';
import type { AdapterSupport, LanguageAdapter, SupportLevel } from './types';
const LEVEL_TEXT: Record<SupportLevel, string> = {
  dependable: 'broad',
  limited: 'limited',
  'seed-only': 'very small (written for the course texts only)',
  none: 'no',
};

/** The coverage statement as a headline plus the adapter's limits (one array entry per limit the adapter declares). */
export function checkerCoverageParts(adapter: LanguageAdapter): CoverageParts {
  // `support` is required by the contract but older adapters may not declare it yet: say so rather than guess.
  const support = (adapter as { support?: AdapterSupport }).support;
  const name = adapter.name;
  if (!support) {
    return { headline: `GoTell has not been told what its ${name} checker covers, so nothing here shows the sentence is correct. A sentence with no detected problem may still contain mistakes.`, limits: [], checked: false };
  }
  const limits = support.limitations.filter((x) => x.trim().length > 0);
  if (support.productionChecks === 'none') {
    return { headline: `GoTell has no automatic writing checks for ${name}: it cannot tell whether this sentence is correct.`, limits, checked: false };
  }
  return {
    headline: `GoTell's ${name} checker has ${LEVEL_TEXT[support.productionChecks]} coverage. It reports only the mistakes its rules recognise, so accepting this does not mean the sentence is now correct, and a sentence with no detected problem may still contain mistakes.`,
    limits, checked: true,
  };
}

/** The parts as the single string the checker has always produced. */
export function coverageText(parts: Pick<CoverageParts, 'headline' | 'limits'>): string {
  return parts.limits.length ? `${parts.headline} Known limits: ${parts.limits.join(' ')}` : parts.headline;
}

export function checkerCoverage(adapter: LanguageAdapter): string {
  return coverageText(checkerCoverageParts(adapter));
}
