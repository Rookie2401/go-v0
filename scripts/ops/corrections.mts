/// <reference types="node" />
/**
 * Learners' reports on the shared word list, for the person who reviews them. A learner's correction never changes the shared rows: it is an
 * AnalysisCorrected event in that learner's own log, and it waits here.
 *
 *   On Render (the Shell, beside the running service): node scripts/ops/run.mjs corrections … (the same arguments, no --); vite-node there runs the
 *   instance out of memory. Elsewhere:
 *   npx vite-node --config scripts/vite.config.ts scripts/ops/corrections.mts -- list --data /var/lib/go-repository
 *   npx vite-node --config scripts/vite.config.ts scripts/ops/corrections.mts -- apply --data /var/lib/go-repository \
 *     --form form:sq:librin --lexeme lemma:sq:libër:NOUN --reviewer "A. Reviewer" [--features Case=Acc,Number=Sing] [--reason "..."]
 *
 * Postgres when DATABASE_URL is set. `list` changes nothing and prints each proposal with how many learners made it, never who. It also lists analyses
 * written by a learner's correction before the word list was closed to them (2026-11-03), which still reach every learner until a reviewer replaces
 * them. `apply` writes a reviewer's correction through the linguistic service; a card a report set aside returns once its facts are verified.
 */
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs, summariseCorrectionReports, type CorrectionReportRow, type LearnerWrittenAnalysis } from './lib.mts';
import { createLinguisticService } from '../../packages/repository-linguistics/src';
import { createPgPool, openPostgresStore, openSqliteStore } from '../../packages/repository-store/src';

const REPORTS = `SELECT learner_id, json FROM events WHERE kind = 'AnalysisCorrected'`;
const parsed = <T,>(json: unknown): T => (typeof json === 'string' ? JSON.parse(json) : json) as T;

/** Reads across learners, which no store port offers on purpose: this script is the only reader. */
async function readRows(dataFile: string): Promise<{ reports: CorrectionReportRow[]; analyses: LearnerWrittenAnalysis[] }> {
  type Row = { learner_id?: string; json: unknown };
  let reportRows: Row[]; let analysisRows: Row[];
  if (process.env.DATABASE_URL) {
    const pool = await createPgPool(process.env.DATABASE_URL, { max: 1 });
    try {
      reportRows = (await pool.query(REPORTS)).rows as Row[];
      analysisRows = (await pool.query(`SELECT json FROM analyses WHERE status <> 'invalidated' AND json->>'analyzerId' = 'correction:learner'`)).rows as Row[];
    } finally { await pool.end(); }
  } else {
    const db = new DatabaseSync(dataFile, { readOnly: true });
    try {
      reportRows = db.prepare(REPORTS).all() as Row[];
      analysisRows = db.prepare(`SELECT json FROM analyses WHERE status <> 'invalidated' AND json_extract(json, '$.analyzerId') = 'correction:learner'`).all() as Row[];
    } finally { db.close(); }
  }
  return {
    reports: reportRows.map((r) => ({ learnerId: r.learner_id!, event: parsed(r.json) })),
    analyses: analysisRows.map((r) => parsed<LearnerWrittenAnalysis>(r.json)),
  };
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2).filter((a) => a !== '--');
  const { values } = parseArgs(rest, { flags: [], values: ['data', 'form', 'lexeme', 'features', 'reviewer', 'reason'] });
  const dataFile = join(resolve(values.data ?? process.env.REPOSITORY_DATA_DIR ?? 'data/repository'), 'repository.sqlite');

  if (command === 'list') {
    const { reports, analyses } = await readRows(dataFile);
    const proposals = summariseCorrectionReports(reports);
    console.log(`corrections: ${proposals.length} proposal(s) from learners`);
    for (const p of proposals) console.log(`  ${p.formId} -> ${p.proposed} | ${p.learners} learner(s) | last ${p.lastAt}${p.reasons.length ? ` | ${p.reasons.join(' / ')}` : ''}`);
    console.log(`corrections: ${analyses.length} live analysis(es) written by a learner before 2026-11-03`);
    for (const a of analyses) console.log(`  ${a.formId} | ${a.analysisId}`);
    return;
  }
  if (command === 'apply') {
    if (!values.form || !values.reviewer || (!values.lexeme && !values.features)) throw new Error('apply needs --form, --reviewer and a --lexeme or --features');
    const features = values.features ? Object.fromEntries(values.features.split(',').map((f) => f.split('=', 2) as [string, string])) : undefined;
    const store = process.env.DATABASE_URL
      ? await openPostgresStore(await createPgPool(process.env.DATABASE_URL, { max: 2 }))
      : openSqliteStore(dataFile);
    try {
      const now = (): string => new Date().toISOString();
      const r = await createLinguisticService(store, { now }).correct(values.form, {
        by: 'reviewer', reviewerId: values.reviewer,
        ...(values.lexeme ? { lexemeId: values.lexeme } : {}),
        ...(features ? { features } : {}),
        ...(values.reason ? { reason: values.reason } : {}),
      }, now());
      console.log(`corrections: ${values.form} now has ${r.analysis.analysisId}; ${r.invalidated.length} earlier analysis(es) replaced`);
    } finally { await store.close(); }
    return;
  }
  throw new Error('use "list" or "apply"');
}

main().catch((e) => { console.error(`corrections: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
