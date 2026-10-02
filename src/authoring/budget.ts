/**
 * Controlled-text authoring tools, part 3: the lexical budget of a course's own texts.
 *
 * The ceilings are a way of WRITING course texts, never a gate on the learner: a learner may open any text at any
 * time. They tell an author that a draft brings in more vocabulary than its stage was designed to carry.
 *
 * What is counted: distinct lemmas (lemma + part of speech) of the texts, cumulatively by stage. Guesses (unconfirmed
 * readings) and unread tokens are never counted as lemmas; they are findings of their own. Function words are COUNTED
 * unless `exemptPos` names their parts of speech (default: none exempt); the result says which were exempt.
 */
import { NO_STAGE, firstLemmaOccurrences, firstStageOfLemmas, type CorpusAnalysis } from './analyse';

export type FindingKind = 'over-budget' | 'dense' | 'unread' | 'guess' | 'no-stage';
export type Severity = 'error' | 'warning';

export interface BudgetOptions {
  /** `dense`: MORE than this many new lemmas per 100 running words in one text. Default 12. */
  maxNewPer100?: number;
  /** Parts of speech not counted against the lemma budget (e.g. ['ADP', 'CONJ', 'PART']). Default: none. */
  exemptPos?: readonly string[];
  /** How many of the last-added lemmas an `over-budget` finding lists at most. Default 20. */
  listLast?: number;
}

export interface Finding {
  kind: FindingKind;
  severity: Severity;
  message: string;
  docId?: string;
  stage?: string;
  /** Sentence index inside the document, from 0 (for unread and guess). */
  sentence?: number;
  form?: string;
  /** over-budget: by how many distinct lemmas the ceiling is exceeded. */
  over?: number;
  /** over-budget: the lemmas (lemma|POS) last added in that stage, most recent last. */
  lastAdded?: string[];
  /** dense: new lemmas per 100 running words. */
  newPer100?: number;
}

export interface StageBudgetRow { stage: string; ceiling?: number; cumulative: number; newLemmas: number }

export interface BudgetResult {
  findings: Finding[];
  stages: StageBudgetRow[];
  exemptPos: readonly string[];
  errors: number;
  warnings: number;
  /** One sentence for the report: what was counted. */
  counted: string;
}

const SEVERITY: Record<FindingKind, Severity> = { 'over-budget': 'error', unread: 'error', dense: 'warning', guess: 'warning', 'no-stage': 'warning' };

export function checkBudget(analysis: CorpusAnalysis, budgets: Record<string, number>, opts: BudgetOptions = {}): BudgetResult {
  const maxNew = opts.maxNewPer100 ?? 12;
  const exempt = opts.exemptPos ?? [];
  const listLast = opts.listLast ?? 20;
  const findings: Finding[] = [];
  const posOf = (key: string): string => key.slice(key.lastIndexOf('|') + 1);
  const counted = (key: string): boolean => !exempt.includes(posOf(key));

  // cumulative distinct lemmas by stage (a lemma belongs to the earliest stage it occurs in)
  const firstOcc = firstLemmaOccurrences(analysis);
  const firstStage = firstStageOfLemmas(analysis);
  const added = new Map<string, string[]>(); // stage → lemma keys by first occurrence order
  for (const [key] of firstOcc) {
    if (!counted(key)) continue;
    const st = firstStage.get(key)!;
    const l = added.get(st); if (l) l.push(key); else added.set(st, [key]);
  }
  // within a stage, order by where the lemma first occurs in reading order (Map iteration already follows it)
  let cumulative = 0;
  const stages: StageBudgetRow[] = analysis.stageOrder.map((stage) => {
    const list = added.get(stage) ?? [];
    cumulative += list.length;
    const ceiling = Object.hasOwn(budgets, stage) ? budgets[stage] : undefined;
    if (ceiling !== undefined && cumulative > ceiling) {
      const over = cumulative - ceiling;
      const last = list.slice(Math.max(0, list.length - Math.min(over, listLast)));
      findings.push({
        kind: 'over-budget', severity: SEVERITY['over-budget'], stage, over, lastAdded: last,
        message: `stage ${stage}: ${cumulative} distinct lemmas up to the end of the stage, ceiling ${ceiling} (over by ${over}); last added: ${last.join(', ')}`,
      });
    }
    return { stage, ceiling, cumulative, newLemmas: list.length };
  });

  // dense texts
  const newInDoc = new Map<string, number>();
  for (const [key, o] of firstOcc) if (counted(key)) newInDoc.set(o.docId, (newInDoc.get(o.docId) ?? 0) + 1);
  for (const d of analysis.docs) {
    const n = newInDoc.get(d.id) ?? 0;
    const per100 = d.words ? (n * 100) / d.words : 0;
    if (per100 > maxNew) {
      findings.push({
        kind: 'dense', severity: SEVERITY.dense, docId: d.id, stage: d.stage, newPer100: per100,
        message: `${d.id}: ${n} new lemmas in ${d.words} words (${per100.toFixed(1)} per 100; more than ${maxNew})`,
      });
    }
    if (d.stage === NO_STAGE) {
      findings.push({ kind: 'no-stage', severity: SEVERITY['no-stage'], docId: d.id, stage: d.stage, message: `${d.id}: the text belongs to no stage of the course, so no ceiling applies to it` });
    }
  }

  // tokens with no reading, and guesses: a course's own text should have neither
  for (const o of analysis.occurrences) {
    if (o.kind === 'lemma') continue;
    const unread = o.kind === 'unread';
    findings.push({
      kind: unread ? 'unread' : 'guess', severity: SEVERITY[unread ? 'unread' : 'guess'], docId: o.docId, stage: o.stage, sentence: o.sentence, form: o.form,
      message: `${o.docId} s${o.sentence + 1}: "${o.form}" ${unread ? 'has no reading' : `is only a guess (${o.lemma})`}`,
    });
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  return {
    findings, stages, exemptPos: exempt, errors, warnings: findings.length - errors,
    counted: exempt.length
      ? `Distinct lemmas counted per stage, cumulatively; parts of speech exempt from the budget: ${exempt.join(', ')}.`
      : 'Distinct lemmas counted per stage, cumulatively; function words are counted (no part of speech is exempt).',
  };
}
