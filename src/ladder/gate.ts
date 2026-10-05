/**
 * The ladder gate (docs/LADDER.md, "The gate"): walks Stage 0, then the units in order, and reports per unit the words,
 * curriculum coverage (>= 3 and >= 1 earlier encounters), new lemmas per 100 words and the constructions first met, then
 * judges each against the policy. Pure given the loaded ladder and an adapter (no file access).
 *
 * Finding codes (`check`):
 *   coverage         coverage below the band of the unit's kind (the first two units use the lower allowance band)
 *   cliff            coverage dropped below the mean of the previous three units (needs three earlier readable units)
 *   new-lemmas       too many never-met lemmas per 100 running words
 *   recycling        (warning) too many of the unit's new lemmas do not come back >= 3 times within the next 6 units
 *   scripture-share  (warning, unit = the stage id) more than 40 % of a stage's words are Scripture
 *   missing-text     (warning) an authentic unit whose text is in neither the bundled corpus nor the built library
 *   missing-document (error) a controlled / adapted unit whose document file does not exist
 *   invalid-document (error) a unit whose text could not be read (bad JSON, wrong language, path outside the repository)
 *   empty-unit       (error) a readable unit with no words
 */
import type { LanguageAdapter } from '../core';
import { analyseDocument, Progress } from './analyse';
import type { UnitStat } from './analyse';
import { POLICY } from './policy';
import type { LadderPolicy } from './policy';
import type { LadderKind, LadderStage, LoadedLadder, UnitStatus } from './types';

export type FindingLevel = 'warning' | 'error';
export interface Finding {
  /** The unit id (or the stage id for `scripture-share`). */
  unit: string;
  check: string;
  level: FindingLevel;
  message: string;
}

export interface UnitRow {
  id: string;
  stage: LadderStage;
  kind: LadderKind;
  domain: string;
  title?: string;
  status: UnitStatus;
  words: number;
  /** Share of running words whose lemma was met >= 3 times in earlier texts (PROPN and numerals known), 0..1. */
  cov3: number;
  /** The same for >= 1 earlier encounter. */
  cov1: number;
  newLemmas: number;
  newPer100: number;
  /** Construction keys (adapter `detectPatterns`) first met in this unit. */
  constructionsFirstMet: string[];
  scripture: boolean;
  /** Share of this unit's new lemmas that came back >= 3 times in the next 6 units; null when that window is incomplete or there are no new lemmas. */
  recycled: number | null;
  /** True when the first-units allowance band applied to this unit. */
  allowance: boolean;
}

export interface StageSummary {
  stage: 'stage0' | LadderStage;
  units: number;
  words: number;
  scriptureWords: number;
  /** scriptureWords / words (0 when the stage has no words). */
  scriptureShare: number;
  /** Word-weighted mean of cov3 over the stage's readable units (null for Stage 0 and empty stages). */
  meanCov3: number | null;
}

export interface LadderReport {
  lang: string;
  head: { texts: number; words: number; lemmas: number; constructions: number };
  rows: UnitRow[];
  stages: StageSummary[];
  findings: Finding[];
  errors: number;
  warnings: number;
}

export interface GateDeps {
  adapter: LanguageAdapter;
  policy?: LadderPolicy;
}

const round = (x: number, d = 4): number => Number(x.toFixed(d));
const pct = (x: number): string => `${(x * 100).toFixed(1)} %`;
const isScripture = (doc: { contentType?: string } | undefined, domain: string): boolean => doc?.contentType === 'scripture' || domain.toLowerCase() === 'scripture';

export function measureLadder(lang: string, loaded: LoadedLadder, deps: GateDeps): LadderReport {
  const policy = deps.policy ?? POLICY;
  const progress = new Progress(policy.minEncounters);
  const findings: Finding[] = [];
  const add = (unit: string, check: string, level: FindingLevel, message: string): void => { findings.push({ unit, check, level, message }); };

  // Stage 0 first: its scenes are the first texts read.
  let headWords = 0;
  for (const h of loaded.head) {
    const st = analyseDocument(deps.adapter, h.doc);
    headWords += st.words;
    progress.add(st);
  }
  const head = { texts: loaded.head.length, words: headWords, lemmas: progress.seen.size, constructions: progress.patterns.size };

  // Pass 1: coverage, new lemmas, constructions (in ladder order).
  const rows: UnitRow[] = [];
  const stats: Array<UnitStat | undefined> = [];
  const freshLemmas: string[][] = [];
  loaded.units.forEach((lu, index) => {
    const u = lu.unit;
    const row: UnitRow = {
      id: u.id, stage: u.stage, kind: u.kind, domain: u.domain, ...(u.title ? { title: u.title } : {}), status: lu.status,
      words: 0, cov3: 0, cov1: 0, newLemmas: 0, newPer100: 0, constructionsFirstMet: [], scripture: isScripture(lu.doc, u.domain), recycled: null,
      allowance: index < policy.firstUnits.units,
    };
    rows.push(row);
    freshLemmas.push([]);
    if (lu.status !== 'ok' || !lu.doc) {
      stats.push(undefined);
      const problem = lu.problem ?? 'unreadable';
      if (lu.status === 'missing' && u.kind === 'authentic') add(u.id, 'missing-text', 'warning', `authentic text ${u.textId ?? ''} is not available (${problem}); the unit is skipped`);
      else add(u.id, lu.status === 'missing' ? 'missing-document' : 'invalid-document', 'error', problem);
      return;
    }
    const stat = analyseDocument(deps.adapter, lu.doc);
    stats.push(stat);
    row.words = stat.words;
    if (stat.words === 0) { add(u.id, 'empty-unit', 'error', 'the unit has no running words'); return; }
    const cov = progress.coverage(stat);
    const fresh = progress.newLemmas(stat);
    freshLemmas[index] = fresh;
    row.cov3 = round(cov.cov3);
    row.cov1 = round(cov.cov1);
    row.newLemmas = fresh.length;
    row.newPer100 = round((fresh.length * 100) / stat.words, 2);
    row.constructionsFirstMet = progress.firstPatterns(stat);
    progress.add(stat);

    // coverage by kind, with the allowance for the first units
    const band = row.allowance ? policy.firstUnits : policy.coverage[u.kind === 'authentic' ? 'authentic' : 'controlled'];
    const label = row.allowance ? `first-units allowance, ${u.kind}` : u.kind;
    if (cov.cov3 < band.error) add(u.id, 'coverage', 'error', `coverage ${pct(cov.cov3)} is below ${pct(band.error)} (${label} unit; warning below ${pct(band.warn)})`);
    else if (cov.cov3 < band.warn) add(u.id, 'coverage', 'warning', `coverage ${pct(cov.cov3)} is below ${pct(band.warn)} (${label} unit; error below ${pct(band.error)})`);

    // cliff against the mean of the previous three readable units
    const prev = rows.slice(0, index).filter((r) => r.status === 'ok' && r.words > 0).slice(-policy.cliff.previousUnits);
    if (prev.length === policy.cliff.previousUnits) {
      const mean = prev.reduce((n, r) => n + r.cov3, 0) / prev.length;
      const drop = (mean - cov.cov3) * 100;
      const text = `coverage ${pct(cov.cov3)} is ${drop.toFixed(1)} points below the mean ${pct(mean)} of the previous ${prev.length} units`;
      if (drop > policy.cliff.errorPoints) add(u.id, 'cliff', 'error', `${text} (error above ${policy.cliff.errorPoints})`);
      else if (drop > policy.cliff.warnPoints) add(u.id, 'cliff', 'warning', `${text} (warning above ${policy.cliff.warnPoints})`);
    }

    // new lemmas per 100 words
    const per100 = (fresh.length * 100) / stat.words;
    if (per100 > policy.newLemmasPer100.error) add(u.id, 'new-lemmas', 'error', `${per100.toFixed(1)} new lemmas per 100 words (${fresh.length} in ${stat.words}); error above ${policy.newLemmasPer100.error}`);
    else if (per100 > policy.newLemmasPer100.warn) add(u.id, 'new-lemmas', 'warning', `${per100.toFixed(1)} new lemmas per 100 words (${fresh.length} in ${stat.words}); warning above ${policy.newLemmasPer100.warn}`);
  });

  // Pass 2: recycling - the new lemmas of a unit should come back within the next `window` units.
  const win = policy.recycling.window;
  rows.forEach((row, i) => {
    const fresh = freshLemmas[i];
    if (!fresh.length || i + win >= rows.length) return; // window incomplete: not judged
    let back = 0;
    for (const l of fresh) {
      let n = 0;
      for (let j = i + 1; j <= i + win; j++) n += stats[j]?.lemmas.get(l) ?? 0;
      if (n >= policy.recycling.minEncounters) back++;
    }
    row.recycled = round(back / fresh.length);
    const unmet = 1 - back / fresh.length;
    if (unmet > policy.recycling.maxUnmetShare) {
      add(row.id, 'recycling', 'warning', `${fresh.length - back} of ${fresh.length} new lemmas (${pct(unmet)}) do not come back ${policy.recycling.minEncounters}+ times within the next ${win} units; warning above ${pct(policy.recycling.maxUnmetShare)}`);
    }
  });

  // Per-stage summary and the Scripture share.
  const stages: StageSummary[] = [{ stage: 'stage0', units: head.texts, words: head.words, scriptureWords: 0, scriptureShare: 0, meanCov3: null }];
  for (const stage of [...new Set(rows.map((r) => r.stage))]) {
    const r = rows.filter((x) => x.stage === stage && x.status === 'ok');
    const words = r.reduce((n, x) => n + x.words, 0);
    const scriptureWords = r.reduce((n, x) => n + (x.scripture ? x.words : 0), 0);
    const share = words ? scriptureWords / words : 0;
    stages.push({
      stage, units: r.length, words, scriptureWords, scriptureShare: round(share),
      meanCov3: words ? round(r.reduce((n, x) => n + x.cov3 * x.words, 0) / words) : null,
    });
    if (share > policy.scriptureShareMax) add(stage, 'scripture-share', 'warning', `${pct(share)} of the words of stage ${stage} are Scripture; warning above ${pct(policy.scriptureShareMax)} (Scripture is one domain among them, not the ladder)`);
  }

  return { lang, head, rows, stages, findings, errors: findings.filter((f) => f.level === 'error').length, warnings: findings.filter((f) => f.level === 'warning').length };
}
