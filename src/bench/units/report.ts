/** Plain-text and Markdown tables for the reading-unit benchmark, the guards and the sensitivity probe. */
import type { GuardReport } from './guards';
import type { UnitReport } from './metrics';
import { errorCounts } from './metrics';
import type { SensitivityReport } from './probe';

const p = (x: number): string => (100 * x).toFixed(1);
const f1 = (x: number): string => x.toFixed(1);

export function renderBenchmark(reports: readonly UnitReport[]): string {
  const rows = ['| system | paragraphs | gold boundaries | predicted | boundary P | boundary R | boundary F1 | paragraph exact-match |', '|---|---:|---:|---:|---:|---:|---:|---:|'];
  for (const r of reports) {
    const o = r.overall;
    rows.push(`| ${r.system} | ${o.paragraphs} | ${o.tp + o.fn} | ${o.tp + o.fp} | ${p(o.precision)} | ${p(o.recall)} | ${p(o.f1)} | ${o.exact}/${o.paragraphs} (${p(o.exactRate)}) |`);
  }
  return rows.join('\n');
}

export function renderByStratum(report: UnitReport): string {
  const rows = ['| hazard | paragraphs | gold | predicted | P | R | F1 | exact |', '|---|---:|---:|---:|---:|---:|---:|---:|'];
  for (const s of report.byStratum) rows.push(`| ${s.stratum} | ${s.paragraphs} | ${s.tp + s.fn} | ${s.tp + s.fp} | ${p(s.precision)} | ${p(s.recall)} | ${p(s.f1)} | ${s.exact}/${s.paragraphs} |`);
  return rows.join('\n');
}

export function renderFailing(report: UnitReport, opts: { max?: number } = {}): string {
  const lines: string[] = [];
  const failing = report.failing.slice(0, opts.max ?? report.failing.length);
  for (const r of failing) {
    lines.push(`${r.id} [${r.stratum}] ${r.errors.map((e) => `${e.kind} ${e.context}`).join(' ; ')}`);
  }
  const counts = errorCounts(report.results);
  lines.push(`-- ${report.failing.length}/${report.results.length} paragraphs differ; over-split ${counts['over-split']}, under-split ${counts['under-split']}, shifted ${counts.shifted}`);
  return lines.join('\n');
}

export function renderGuards(reports: readonly GuardReport[]): string {
  const rows = [
    '| system | paragraphs | units | words/unit median | p95 | max | units over 40 words | one-word units | begin in quotation | end in quotation | split a number | split an abbreviation |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const g of reports) {
    rows.push(`| ${g.system} | ${g.paragraphs} | ${g.units} | ${f1(g.wordsPerUnit.median)} | ${g.wordsPerUnit.p95} | ${g.wordsPerUnit.max} | ${g.overLong} | ${g.oneWord} | ${g.quoteBegin} | ${g.quoteEnd} | ${g.numberSplits} | ${g.abbreviationSplits} |`);
  }
  return rows.join('\n');
}

export function renderSensitivity(rep: SensitivityReport): string {
  const out: string[] = [`Sensitivity: ${rep.label}`];
  const rows = ['| dwell model | segmentation | units | words | words/unit max | units at 12 s cap | WPM (GoLearn) | WPM (ungated, ours) | lookups/100 words | form encounters | audio segments | longest segment (chars) |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const r of rep.runs) {
    const enc = [...r.formEncounters.values()].reduce((a, b) => a + b, 0);
    rows.push(`| ${r.dwellModel} | ${r.segmentation} | ${r.units} | ${r.words} | ${r.maxWordsPerUnit} | ${r.unitsAtDwellCap} | ${r.wordsPerMinute === undefined ? 'withheld' : f1(r.wordsPerMinute)} | ${f1(r.ungatedWordsPerMinute)} | ${r.lookupsPer100Words} | ${enc} | ${r.audioSegments} | ${r.audioSegmentsChars.max} |`);
  }
  out.push(rows.join('\n'), '');
  const drows = ['| base → other | forms (base) | forms (other) | forms with a different count | forms in one run only | encounters (base → other) | absolute change | % of base encounters | largest change |', '|---|---:|---:|---:|---:|---|---:|---:|---:|'];
  for (const { base, against, diff: d } of rep.diffs) {
    drows.push(`| ${base} → ${against} | ${d.formsA} | ${d.formsB} | ${d.formsDiffering} | ${d.formsOnlyInOne} | ${d.totalA} → ${d.totalB} | ${d.absoluteChange} | ${d.changePercentOfA.toFixed(1)} | ${d.maxChange} |`);
  }
  out.push(drows.join('\n'));
  return out.join('\n');
}
