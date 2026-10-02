/**
 * The recurrence report as markdown for a course designer. Deterministic: stable order, no clock (a date appears only
 * when `opts.date` is passed in). Reads a report; changes nothing.
 */
import type { LemmaStat, RecurrenceReport, UnitStat } from './recurrence';

export interface MarkdownOptions {
  /** Printed under the title when given; never taken from the clock. */
  date?: string;
  title?: string;
  /** Cap on the rows of each "needs an eye" list (the rest is counted). Default: no cap. */
  maxListRows?: number;
}

const cell = (s: string | number): string => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const lem = (l: LemmaStat): string => `${l.lemma} (${l.pos})`;
const at = (w: { docId: string; sentence: number }): string => `${w.docId} s${w.sentence + 1}`;
const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const gap = (g: LemmaStat['gapWords']): string => (g ? `${num(g.min)} / ${num(g.median)} / ${num(g.max)}` : '–');
const forms = (l: LemmaStat): string => l.forms.map((f) => `${f.form} ×${f.count}`).join(', ');
const table = (head: string[], rows: Array<Array<string | number>>): string[] => [
  `| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
];

export function renderRecurrenceMarkdown(report: RecurrenceReport, opts: MarkdownOptions = {}): string {
  const o = report.options;
  const cap = opts.maxListRows ?? Infinity;
  const out: string[] = [];
  out.push(`# ${opts.title ?? `Recurrence report — ${report.lang}`}`, '');
  if (opts.date) out.push(`Date: ${opts.date}`, '');
  out.push(
    `${report.totalWords} running words in ${report.docs.length} text(s); ${report.lemmas.length} distinct lemmas (lemma + part of speech); ` +
    'guesses (unconfirmed readings) and unread tokens are listed apart and not counted as lemmas. This report only reads the texts: ' +
    'it is guidance for whoever writes them, not a gate on the learner.', '',
  );

  out.push('## Summary by stage', '');
  out.push(...table(
    ['Stage', 'Texts', 'Words', 'Sentences', 'Distinct lemmas', 'New lemmas', 'Cumulative lemmas', 'Guesses', 'Unread'],
    report.stages.map((s) => [s.stage, s.documents, s.words, s.sentences, s.distinctLemmas, s.newLemmas, s.cumulativeLemmas, s.guesses, s.unread]),
  ), '');

  const list = (heading: string, items: string[], empty: string): void => {
    out.push(`### ${heading} (${items.length})`, '');
    if (items.length === 0) out.push(empty, '');
    else { out.push(...items.slice(0, cap).map((i) => `- ${i}`)); if (items.length > cap) out.push(`- … and ${items.length - cap} more`); out.push(''); }
  };
  const withFlag = (f: LemmaStat['flags'][number]) => report.lemmas.filter((l) => l.flags.includes(f));
  out.push('## Needs a designer\'s eye', '');
  list('Lemmas met once', withFlag('once').map((l) => `${lem(l)} — ${at(l.first)} (${forms(l)})`), 'None.');
  list('Lemmas met twice', withFlag('twice').map((l) => `${lem(l)} — first ${at(l.first)}; ${forms(l)}`), 'None.');
  list(`Lemmas in one form only (at least ${o.oneFormMinOccurrences} occurrences, more than ${Math.round(o.oneFormShare * 100)} % in one form)`,
    withFlag('one-form').map((l) => `${lem(l)} — ${l.total}×, ${forms(l)}`), 'None.');
  list(`Clustered lemmas (${o.clusterCount} occurrences within ${o.clusterWindow} running words)`,
    withFlag('clustered').map((l) => `${lem(l)} — ${l.total}×, first ${at(l.first)}`), 'None.');
  list('Lemmas that occur in one text only (3 or more occurrences)', withFlag('single-text').map((l) => `${lem(l)} — ${l.total}× in ${l.first.docId}`), 'None.');
  list(`Long gaps (more than ${o.maxGapWords} running words between two occurrences)`,
    withFlag('late-gap').map((l) => `${lem(l)} — gaps min / median / max ${gap(l.gapWords)} words`), 'None.');
  const onceUnit = (u: UnitStat) => `${u.key}${u.title && u.title !== u.key ? ` (${u.title})` : ''} — ${at(u.first)}`;
  list('Constructions met once', report.constructions.filter((u) => u.flags.includes('once')).map(onceUnit), 'None.');
  list('Phrase units met once', report.phrases.filter((u) => u.flags.includes('once')).map(onceUnit), 'None.');

  out.push('## Texts', '');
  out.push(...table(
    ['Text', 'Stage', 'Words', 'New lemmas', 'New per 100 words', 'Guesses', 'Unread', 'Constructions met for the first time'],
    report.docs.map((d) => [d.id, d.stage, d.words, d.newLemmas, d.newPer100.toFixed(1), d.guesses, d.unread, d.newConstructions.join(', ') || '–']),
  ), '');

  out.push('## Constructions', '');
  out.push(...table(['Construction', 'Occurrences', 'Texts', 'First', 'Flags'],
    report.constructions.map((u) => [u.key, u.occurrences, u.documents, at(u.first), u.flags.join(', ') || '–'])), '');
  out.push('## Phrase units', '');
  out.push(...table(['Phrase', 'Occurrences', 'Texts', 'First', 'Flags'],
    report.phrases.map((u) => [u.key, u.occurrences, u.documents, at(u.first), u.flags.join(', ') || '–'])), '');

  out.push('## All lemmas, in order of first occurrence', '');
  out.push(...table(
    ['Lemma', 'Total', 'Texts', 'First', 'By stage', 'Gap words min / median / max', 'Gap texts min / median / max', 'Forms', 'Flags'],
    report.lemmas.map((l) => [
      lem(l), l.total, l.documents, at(l.first), Object.entries(l.byStage).map(([s, n]) => `${s}:${n}`).join(' '),
      gap(l.gapWords), gap(l.gapDocs), forms(l), l.flags.join(', ') || '–',
    ]),
  ), '');

  out.push('## Word forms, most frequent first', '');
  out.push(...table(['Form', 'Count', 'Lemma(s)'], report.forms.map((f) => [f.form, f.count, f.lemmas.join(', ')])), '');
  return out.join('\n');
}
