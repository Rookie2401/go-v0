/**
 * The coverage statement, short. A checker's whole limitation list (hundreds of words) under every analysis buries the result, so the
 * screen shows ONE line and a disclosure:
 *
 *   Checked: definiteness, case, agreement, conjugation, particles. Not checked: 8 other areas — see details.
 *
 * and the details list the headline (what "nothing found" means) and each limit the adapter declares, in full. Nothing is dropped: the
 * line is a summary of the same statement, never a substitute for it. Pure: strings in, strings out.
 *
 * What "checked" names is a short hand-kept list per language (the categories its production rules actually fire on, each pinned
 * by a test against the real checker); a language not in the table says plainly that the list is not recorded.
 */
import type { CoverageParts } from '../types';

/** The areas whose rules the checker really has, by language id. Albanian: src/adapters/albanian/production.ts. */
export const CHECKED_AREAS: Readonly<Record<string, readonly string[]>> = {
  sq: ['definiteness', 'case', 'agreement', 'conjugation', 'particles'],
};

export interface CoverageSummary {
  /** The one line to show. */
  line: string;
  /** Everything else, in full: the headline(s) first, then each limit. Empty when the line already says it all. */
  details: string[];
  /** The areas named as checked (empty when not recorded or when nothing was checked). */
  checked: string[];
  /** How many limits the details list (the "N other areas"). */
  notChecked: number;
}

const LIMITS_MARK = ' Known limits: ';

/** A coverage string from before the parts existed (or from a test double): split at the limits marker, never lose a word. */
function partsFromText(text: string): CoverageParts {
  const at = text.indexOf(LIMITS_MARK);
  if (at < 0) return { headline: text.trim(), limits: [], checked: true };
  return { headline: text.slice(0, at).trim(), limits: [text.slice(at + LIMITS_MARK.length).trim()].filter(Boolean), checked: true };
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/**
 * `sentences` are the analysed sentences (their `coverageParts`, else their `checkerCoverage` string). Identical statements and limits
 * are merged, so a ten-sentence draft gives one summary.
 */
export function summariseCoverage(sentences: ReadonlyArray<{ checkerCoverage: string; coverageParts?: CoverageParts }>, languageId: string): CoverageSummary {
  const parts = sentences.filter((s) => s.coverageParts || s.checkerCoverage.trim()).map((s) => s.coverageParts ?? partsFromText(s.checkerCoverage));
  if (!parts.length) return { line: '', details: [], checked: [], notChecked: 0 };

  const headlines = [...new Set(parts.map((p) => p.headline).filter(Boolean))];
  const limits = [...new Set(parts.flatMap((p) => p.limits))];
  const anyChecked = parts.some((p) => p.checked);

  // nothing was checked anywhere: say so, whole
  if (!anyChecked) return { line: headlines[0] ?? '', details: headlines.slice(1), checked: [], notChecked: limits.length };

  const checked = CHECKED_AREAS[languageId] ?? [];
  if (!limits.length) {
    // a short statement stands on its own line
    return { line: headlines[0] ?? '', details: headlines.slice(1), checked: [...checked], notChecked: 0 };
  }
  const named = checked.length ? `Checked: ${checked.join(', ')}.` : 'What the checker covers is not recorded for this language.';
  const line = `${named} Not checked: ${limits.length} other ${plural(limits.length, 'area', 'areas')} — see details.`;
  return { line, details: [...headlines, ...limits], checked: [...checked], notChecked: limits.length };
}
