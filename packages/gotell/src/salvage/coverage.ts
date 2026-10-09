/**
 * adapted from src/gotell/coverage.ts (2026-10-09)
 *
 * What GoTell's checker can and cannot verify for a language, stated from the adapter's own `support` record.
 * Shown on every sentence: a suggestion fixes what the checker found, never "the sentence".
 */
import type { AdapterSupport, LanguageAdapter, SupportLevel } from './types';
const LEVEL_TEXT: Record<SupportLevel, string> = {
  dependable: 'broad',
  limited: 'limited',
  'seed-only': 'very small (written for the course texts only)',
  none: 'no',
};

export function checkerCoverage(adapter: LanguageAdapter): string {
  // `support` is required by the contract but older adapters may not declare it yet: say so rather than guess.
  const support = (adapter as { support?: AdapterSupport }).support;
  const name = adapter.name;
  if (!support) {
    return `GoTell has not been told what its ${name} checker covers, so nothing here shows the sentence is correct. A sentence with no detected problem may still contain mistakes.`;
  }
  if (support.productionChecks === 'none') {
    return `GoTell has no automatic writing checks for ${name}: it cannot tell whether this sentence is correct.${limitations(support)}`;
  }
  return `GoTell's ${name} checker has ${LEVEL_TEXT[support.productionChecks]} coverage. It reports only the mistakes its rules recognise, so accepting this does not mean the sentence is now correct, and a sentence with no detected problem may still contain mistakes.${limitations(support)}`;
}

function limitations(s: AdapterSupport): string {
  const l = s.limitations.filter((x) => x.trim().length > 0);
  return l.length ? ` Known limits: ${l.join(' ')}` : '';
}
