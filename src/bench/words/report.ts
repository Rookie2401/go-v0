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

// ───────────────────────────── report of a frozen set ─────────────────────────────

export interface FrozenReportInput {
  date: string;
  manifest: {
    id: string; setHash: string; createdAt: string;
    tools: { goldTools: string; adapter: string; node: string; icu: string; unicode: string };
    selection: { strata: string[] | null; heldOutOnly: boolean };
    files: Array<{ path: string; kind: string; sha256: string; rows: number }>;
    checkedBy: Array<{ name: string; firstDate: string; lastDate: string; rows: number }>;
  };
  runTools: { node: string; icu: string; unicode: string; adapter: string };
  /** An explicit held-out run: only the held-out rows were scored; no sentence text is printed in this report. */
  heldOutRun: boolean;
  reports: readonly SystemReport[];
  errorsDir: string;
  patterns: number;
}

/** A dated Markdown report for a frozen set. Local by default: the numbers describe personal copies of books. */
export function renderFrozenReport(i: FrozenReportInput): string {
  const m = i.manifest;
  const sentences = i.reports[0]?.overall.sentences ?? 0;
  const lines: string[] = [
    `# Word segmentation report: frozen set ${m.id}`,
    '',
    `- Date of this run: ${i.date}`,
    `- Frozen set: \`${m.id}\`, set hash \`${m.setHash}\` (frozen ${m.createdAt}; every file verified against its sha256 before this run)`,
    `- Scored: ${sentences} sentences (${i.heldOutRun ? 'HELD-OUT rows only, an explicit held-out run' : 'ordinary rows; held-out rows were not used'})`,
    `- Selection: strata ${m.selection.strata ? m.selection.strata.join(', ') : 'all'}; held-out only: ${m.selection.heldOutOnly ? 'yes' : 'no'}`,
    `- Checked by: ${m.checkedBy.map((c) => `${c.name} (${c.rows} rows, ${c.firstDate === c.lastDate ? c.firstDate : `${c.firstDate} to ${c.lastDate}`})`).join('; ') || 'nobody'}`,
    `- Tools when frozen: ${m.tools.goldTools}, ${m.tools.adapter}, Node ${m.tools.node}, ICU ${m.tools.icu}`,
    `- Tools in this run: bench-words, ${i.runTools.adapter}, Node ${i.runTools.node}, ICU ${i.runTools.icu}, Unicode ${i.runTools.unicode}${m.tools.icu !== i.runTools.icu || m.tools.adapter !== i.runTools.adapter ? ' (differs from the freeze: compare with care)' : ''}`,
    `- Errors file${i.reports.length > 1 ? 's' : ''}: \`${i.errorsDir}/\` (one per system${i.heldOutRun ? ', held-out rows, with text' : ''}; local only)`,
    '',
    'Files in the set:',
    '',
    ...m.files.map((f) => `- \`${f.path}\` (${f.kind}, ${f.rows} rows, sha256 \`${f.sha256.slice(0, 16)}…\`)`),
    '',
    '## Results',
    '',
    'Percentages. "boundary" counts each cut; "word" counts a word right only if both edges are; "exact match" is the share of sentences with no error.',
    '',
    markdownTable(i.reports),
    '',
    markdownErrorKinds(i.reports),
    ...(i.patterns > 0 && !i.heldOutRun
      ? i.reports.flatMap((r) => ['', `### Most frequent error patterns: ${r.system}`, '', markdownPatterns(r, i.patterns)])
      : []),
    '',
    '## What these numbers are',
    '',
    '- The reference is the boundaries a named person checked and accepted; a machine draft is never reference.',
    `- Systems: ${i.reports.map((r) => `${r.system} (${r.kind}: ${r.label})`).join('; ')}.`,
    '- Held-out sentences are for reporting, once. Do not tune the adapter, the compound list or any threshold on them.',
    '- The sentences come from texts supplied by the owner, possibly personal copies: keep this report local unless the owner chooses to copy numbers (not text) into the docs.',
    '',
  ];
  return lines.join('\n');
}
