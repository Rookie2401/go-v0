/**
 * Text and Markdown rendering of word-segmentation reports. Numbers are percentages with two decimals; Thai text
 * appears only in the error patterns (single words), and only when the caller asks for them.
 */
import { pct } from '../shared';
import type { ErrorPattern, Metrics, SystemReport } from './metrics';
import { topErrorPatterns } from './metrics';

const row = (cells: ReadonlyArray<string | number>): string => `| ${cells.join(' | ')} |`;

const metricCells = (m: Metrics): string[] => [
  String(m.sentences), pct(m.boundary.precision), pct(m.boundary.recall), pct(m.boundary.f1),
  pct(m.word.precision), pct(m.word.recall), pct(m.word.f1), pct(m.exactRate),
];

const HEAD = ['sentences', 'boundary P', 'boundary R', 'boundary F1', 'word P', 'word R', 'word F1', 'exact match'];

/** One table of all systems, one block per stratum (and "all"). Percentages. */
export function markdownTable(reports: readonly SystemReport[]): string {
  const strata = new Set<string>();
  for (const r of reports) for (const k of Object.keys(r.byStratum)) strata.add(k);
  const lines = [row(['stratum', 'system', ...HEAD]), row(['---', '---', ...HEAD.map(() => '---:')])];
  for (const st of [...strata].sort()) {
    for (const r of reports) lines.push(row([st, r.system, ...metricCells(r.byStratum[st])]));
  }
  for (const r of reports) lines.push(row(['**all**', r.system, ...metricCells(r.overall)]));
  return lines.join('\n');
}

export function markdownErrorKinds(reports: readonly SystemReport[]): string {
  const lines = [row(['system', 'sentences with an error', 'over-split spans', 'under-split spans', 'shifted spans']), row(['---', '---:', '---:', '---:', '---:'])];
  for (const r of reports) {
    lines.push(row([r.system, `${r.errors.length} of ${r.overall.sentences}`, r.errorKinds['over-split'], r.errorKinds['under-split'], r.errorKinds.shifted]));
  }
  return lines.join('\n');
}

export function markdownPatterns(report: SystemReport, limit = 50): string {
  const pats: ErrorPattern[] = topErrorPatterns(report.errors, limit);
  const lines = [row(['#', 'kind', 'gold (editors)', report.system, 'count']), row(['---:', '---', '---', '---', '---:'])];
  pats.forEach((p, k) => {
    lines.push(row([k + 1, p.kind, p.gold.replace(/\|/gu, '¦'), p.system.replace(/\|/gu, '¦') || '(same words)', p.count]));
  });
  return lines.join('\n');
}

/** Plain-text summary for the console: numbers only. */
export function consoleSummary(reports: readonly SystemReport[]): string {
  const lines: string[] = [];
  const f = (m: Metrics) => `P ${pct(m.boundary.precision)}  R ${pct(m.boundary.recall)}  F1 ${pct(m.boundary.f1)}   word F1 ${pct(m.word.f1)}   exact ${pct(m.exactRate)}   (${m.sentences} sentences)`;
  for (const r of reports) {
    lines.push(`${r.system}  [${r.kind}]  ${r.label}`);
    lines.push(`  all                 ${f(r.overall)}`);
    for (const [st, m] of Object.entries(r.byStratum)) lines.push(`  ${st.padEnd(19)} ${f(m)}`);
    lines.push(`  errors: ${r.errors.length} sentences; over-split ${r.errorKinds['over-split']}, under-split ${r.errorKinds['under-split']}, shifted ${r.errorKinds.shifted}`);
  }
  return lines.join('\n');
}
