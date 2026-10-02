import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { analyseCorpus } from '../../src/authoring/analyse';
import { checkBudget } from '../../src/authoring/budget';
import { recurrenceReport, renderRecurrenceMarkdown } from '../../src/authoring/recurrence';
import { selectCourseTexts, stageOfFromWorks } from '../../src/authoring/select';
import { SPANISH_WORKS } from '../../src/course/spanish';
import { loadBundledCorpus } from '../../src/ingest';
import { runNode } from '../helpers/cli';

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');

describe('the real Spanish course texts', () => {
  const stageOf = stageOfFromWorks(SPANISH_WORKS);
  const docs = selectCourseTexts(loadBundledCorpus(), 'es', stageOf);
  const analysis = analyseCorpus(docs, createAdapterRegistry().get('es'), { stageOf });
  const report = recurrenceReport(analysis);

  it('selects course-written, non-Scripture texts and gives each a stage from SPANISH_WORKS when its work is in the catalogue', () => {
    expect(docs.length).toBeGreaterThan(20);
    expect(docs.every((d) => d.contentType !== 'scripture' && ['owner-authored', 'generated'].includes(d.source.rights))).toBe(true);
    const slugs = new Set(SPANISH_WORKS.map((w) => w.id.slice(w.id.lastIndexOf(':') + 1)));
    const inCatalogue = docs.filter((d) => d.work && slugs.has(d.work.slug));
    expect(inCatalogue.length).toBeGreaterThan(20);
    for (const d of inCatalogue) expect(stageOf(d), d.id).toBeTruthy();
    // documents without a catalogue work are '?', never a guess
    for (const d of docs.filter((x) => !x.work || !slugs.has(x.work.slug))) expect(stageOf(d), d.id).toBeUndefined();
  });

  it('runs the report; cumulative lemma counts never decrease and end at the number of distinct lemmas', () => {
    expect(report.lemmas.length).toBeGreaterThan(100);
    const cum = report.stages.map((s) => s.cumulativeLemmas);
    expect(cum.every((n, i) => i === 0 || n >= cum[i - 1])).toBe(true);
    expect(cum[cum.length - 1]).toBe(report.lemmas.length);
    expect(report.stages.reduce((n, s) => n + s.words, 0)).toBe(report.totalWords);
    const md = renderRecurrenceMarkdown(report);
    expect(md).toContain('## Summary by stage');
    expect(renderRecurrenceMarkdown(report)).toBe(md);
  });

  it('runs the budget check without throwing', () => {
    const r = checkBudget(analysis, { s0: 100000 });
    expect(r.stages.length).toBe(analysis.stageOrder.length);
    expect(r.findings.some((f) => f.kind === 'over-budget')).toBe(false);
  });
});

describe('authoring CLIs', () => {
  const run = async (script: string, ...args: string[]) => {
    const r = await runNode([cli, script, ...args], { cwd: path.resolve('.'), timeout: 120_000 });
    return { status: r.status, out: r.out };
  };

  it('authoring-report prints a summary for Spanish', async () => {
    const r = await run('scripts/authoring-report.mts', '--lang', 'es');
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/authoring report — es: \d+ course-written text/);
    expect(r.out).toMatch(/stage\s+texts\s+words/);
    expect(r.out).toMatch(/lemmas met once: \d+/);
  }, 120_000);

  it('authoring-report accepts --stages as an inline map and a stray "--"', async () => {
    const r = await run('scripts/authoring-report.mts', '--', '--lang', 'es', '--stages', '{"camino-1":"A","camino-2":"B"}');
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/^A\s+8\s/m);
    expect(r.out).toMatch(/^B\s+8\s/m);
  }, 120_000);

  it('authoring-report without --lang explains the usage and exits 2', async () => {
    const r = await run('scripts/authoring-report.mts');
    expect(r.status).toBe(2);
    expect(r.out).toMatch(/usage/);
  }, 120_000);

  it('authoring-check prints states, writes nothing, and exits 1 on an over-budget stage', async () => {
    const ok = await run('scripts/authoring-check.mts', '--lang', 'es');
    expect(ok.status).toBe(0);
    expect(ok.out).toMatch(/camino-1-01: DRAFT/);
    expect(ok.out).toMatch(/passes the automatic checks \(a person may mark it auto-validated\)/);
    const bad = await run('scripts/authoring-check.mts', '--lang', 'es', '--budgets', '{"s0":10}');
    expect(bad.status).toBe(1);
    expect(bad.out).toMatch(/ERROR \[over-budget\] stage s0/);
  }, 120_000);
});
