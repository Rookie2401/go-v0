/**
 * REVIEW ELIGIBILITY — which linguistic FIELDS of an analysis or unit may be put to a HUMAN reviewer, and in what order
 * (Linguistic Engine V2, Stage 7). This is the validation queue (a person checks a field the machine only guessed), not the
 * learner's flashcard deck: the deck is `decideIntake`, which keeps deciding `needs-validation` for items whose analysis is not
 * sound enough to ask about. The two meet in `validationQueue`.
 *
 * RULES (pure, explainable; every result carries its reason):
 *   1. An invalidated analysis (status `invalidated` or `supersededBy`) or unit is never eligible: it was withdrawn, a reviewer
 *      would be checking a statement nobody holds any more.
 *   2. Only `conflicted` and `provisional` fields can be put to a reviewer. `verified` never (already settled by a person),
 *      `supported` never (a source states it and the rules agree: the queue is for what is NOT yet backed), `unknown` never
 *      (there is nothing to check), `invalidated` never.
 *   3. A field the pack marks unreviewable (`unreviewableFields`: no native reviewer, no source to check against) never.
 *   4. A field is worth a person's time only when learners meet it: a `conflicted` field from 1 encounter, a `provisional` field
 *      from 2 encounters in different sentences (`encounters` counts distinct sentences, never repeated lookups).
 *   5. (projection@4) A unit becomes review material ONLY through its progression along the knowledge levels (docs/ecosystem/KNOWLEDGE-LEVELS.md): when the
 *      evidence names the unit's level, a unit at level `new` (nobody has met it) is never eligible, and there is no input by which a learner asks for a
 *      field to be reviewed: encounters and levels come from the Repository's projection (`reviewEvidenceOf`), never from a request.
 *   6. priority = conflicts x encounters, where `conflicts` is the number of conflicts (default: the conflicted fields found).
 *      A provisional-only item therefore has priority 0 unless the caller counts conflicts; ties sort by encounters, then id.
 *
 * What the reviewer sees is exactly what is stored: `reviewerView` copies the stored state and basis and never upgrades a field,
 * so nothing is presented as verified unless it is. The reviewer's decision becomes `correct(formId, { by: 'reviewer', reviewerId, ... })`
 * on the linguistic service (`reviewerCorrection` builds that request and refuses an unnamed reviewer); it never writes an event.
 *
 * Items WITHOUT field states (rows written before Stage 7) are not eligible here and are listed under `legacy`: the existing intake
 * rules keep deciding them.
 */
import { FIELD_NAMES } from '../../../repository-contract/src';
import type { AnalysisStatus, FieldName, FieldState, FieldStateEntry, FieldStates, KnowledgeLevel, LinguisticUnit, FormAnalysis, UnitKnowledge } from '../../../repository-contract/src';
import type { UnitFacts } from '../types';

/** What may be reviewed: an analysis or a unit, reduced to the part the rules read. */
export interface ReviewSubject {
  /** `analysis:…` or a unit id. */
  id: string;
  status?: AnalysisStatus;
  supersededBy?: string;
  fieldStates?: FieldStates;
  /** From the language pack (`LanguagePackInfo.unreviewableFields`). */
  unreviewableFields?: readonly FieldName[];
}

export interface ReviewEvidence {
  /** Distinct sentences in which learners met the item (never a count of lookups). */
  encounters: number;
  /** Conflicts counted by the caller; default: the number of conflicted fields found. */
  conflicts?: number;
  /** projection@4: the knowledge level the evidence comes from (`UnitKnowledge.level`). A unit at level `new` has not been met, so it is never eligible. Absent: not checked. */
  level?: KnowledgeLevel;
}

/**
 * The evidence a knowledge row gives (projection@4): its encounters (or the distinct sentences the caller counted) and its level. Review material comes from
 * the progression the row records, never from a request: there is no "requested" flag to pass.
 */
export const reviewEvidenceOf = (row: Pick<UnitKnowledge, 'encounters' | 'level'>, opts: { sentences?: number; conflicts?: number } = {}): ReviewEvidence => ({
  encounters: opts.sentences ?? row.encounters, level: row.level, ...(opts.conflicts !== undefined ? { conflicts: opts.conflicts } : {}),
});

export interface FieldReviewEligibility {
  eligible: boolean;
  reason: string;
  /** The fields that may be put to a reviewer, in the fixed field order. Empty when not eligible. */
  fields: FieldName[];
  priority: number;
}

/** Encounters needed (across different sentences) before a field in this state is put to a reviewer. */
export const MIN_ENCOUNTERS: Readonly<Partial<Record<FieldState, number>>> = { conflicted: 1, provisional: 2 };

const subjectOf = (x: FormAnalysis | LinguisticUnit | ReviewSubject): ReviewSubject => {
  const any = x as { analysisId?: string; unitId?: string; id?: string; status?: AnalysisStatus; supersededBy?: string; fieldStates?: FieldStates; unreviewableFields?: readonly FieldName[] };
  return {
    id: any.id ?? any.analysisId ?? any.unitId ?? '(unnamed)',
    ...(any.status ? { status: any.status } : {}), ...(any.supersededBy ? { supersededBy: any.supersededBy } : {}),
    ...(any.fieldStates ? { fieldStates: any.fieldStates } : {}), ...(any.unreviewableFields ? { unreviewableFields: any.unreviewableFields } : {}),
  };
};

const no = (reason: string): FieldReviewEligibility => ({ eligible: false, reason, fields: [], priority: 0 });

export function reviewEligibility(input: FormAnalysis | LinguisticUnit | ReviewSubject, evidence: ReviewEvidence): FieldReviewEligibility {
  const s = subjectOf(input);
  if (s.status === 'invalidated' || s.supersededBy) return no('invalidated: withdrawn, so there is nothing to put to a reviewer');
  if (evidence.level === 'new') return no('level New: nobody has met this item, so there is nothing to put to a reviewer yet (review follows the learner\'s progression, never a request)');
  const states = s.fieldStates;
  if (!states || FIELD_NAMES.every((f) => !states[f])) return no('no field states are stored for this item (written before field states): the intake rules decide it');
  const enc = Number.isFinite(evidence.encounters) ? Math.max(0, Math.floor(evidence.encounters)) : 0;
  const unreviewable = new Set(s.unreviewableFields ?? []);

  const open: FieldName[] = [];
  const blocked: string[] = [];
  const tooFew: string[] = [];
  const settled: string[] = [];
  for (const f of FIELD_NAMES) {
    const e = states[f];
    if (!e) continue;
    if (e.state !== 'conflicted' && e.state !== 'provisional') { settled.push(`${f} ${e.state}`); continue; }
    if (unreviewable.has(f)) { blocked.push(f); continue; }
    const need = MIN_ENCOUNTERS[e.state]!;
    if (enc < need) { tooFew.push(`${f} (${e.state}, needs ${need} encounter${need === 1 ? '' : 's'})`); continue; }
    open.push(f);
  }
  if (!open.length) {
    const why: string[] = [];
    if (tooFew.length) why.push(`too few encounters across sentences (${enc}): ${tooFew.join(', ')}`);
    if (blocked.length) why.push(`the pack marks these unreviewable: ${blocked.join(', ')}`);
    if (!why.length) why.push(`nothing to review: ${settled.length ? settled.join(', ') : 'no field is conflicted or provisional'}`);
    return no(why.join('; '));
  }
  const conflicted = open.filter((f) => states[f]!.state === 'conflicted').length;
  const conflicts = evidence.conflicts !== undefined ? Math.max(0, evidence.conflicts) : conflicted;
  const parts = open.map((f) => `${f} ${states[f]!.state}`).join(', ');
  return {
    eligible: true,
    reason: `${parts}; met in ${enc} sentence${enc === 1 ? '' : 's'}${blocked.length ? `; not reviewable: ${blocked.join(', ')}` : ''}`,
    fields: open, priority: conflicts * enc,
  };
}

/** One field as the reviewer is shown it: the stored state and basis, never upgraded. */
export interface ReviewerFieldView { field: FieldName; state: FieldState; basis: string; sources: string[] }

export function reviewerView(input: FormAnalysis | LinguisticUnit | ReviewSubject, result: FieldReviewEligibility): ReviewerFieldView[] {
  const states = subjectOf(input).fieldStates;
  return result.fields.flatMap((f) => {
    const e: FieldStateEntry | undefined = states?.[f];
    return e ? [{ field: f, state: e.state, basis: e.basis, sources: [...e.sources] }] : [];
  });
}

export interface ReviewQueueItem {
  subject: FormAnalysis | LinguisticUnit | ReviewSubject;
  evidence: ReviewEvidence;
  /** The form the analysis is about (for the correction), when the subject is an analysis. */
  formId?: string;
}
export interface ReviewQueueEntry extends FieldReviewEligibility { id: string; formId?: string; encounters: number }
export interface ReviewQueue {
  /** Eligible items, highest priority first (ties: more encounters, then id). */
  queue: ReviewQueueEntry[];
  /** Items left out, with the rule that left them out. */
  skipped: Array<{ id: string; reason: string }>;
  /** Items without field states: the existing intake rules keep deciding them (they are never silently dropped). */
  legacy: string[];
}

export function validationQueue(items: ReviewQueueItem[]): ReviewQueue {
  const queue: ReviewQueueEntry[] = [];
  const skipped: ReviewQueue['skipped'] = [];
  const legacy: string[] = [];
  for (const it of items) {
    const s = subjectOf(it.subject);
    const r = reviewEligibility(s, it.evidence);
    if (r.eligible) queue.push({ ...r, id: s.id, encounters: Math.max(0, Math.floor(it.evidence.encounters)), ...(it.formId ? { formId: it.formId } : {}) });
    else if (!s.fieldStates || FIELD_NAMES.every((f) => !s.fieldStates![f])) legacy.push(s.id);
    else skipped.push({ id: s.id, reason: r.reason });
  }
  queue.sort((a, b) => b.priority - a.priority || b.encounters - a.encounters || a.id.localeCompare(b.id));
  return { queue, skipped, legacy };
}

/** The subjects of a unit's facts: the unit row and its live analyses, ready for `validationQueue`. */
export function subjectsOfFacts(facts: UnitFacts): Array<FormAnalysis | LinguisticUnit> {
  return [facts.unit, ...facts.analyses.filter((a) => a.status !== 'invalidated' && !a.supersededBy)];
}

/** What the host passes to the linguistic service's `correct(formId, correction)`. */
export interface ReviewerCorrectionRequest {
  formId: string;
  correction: { by: 'reviewer'; reviewerId: string; lexemeId?: string; features?: Record<string, string>; reason?: string; sentenceKey?: string };
}

/** A reviewer's decision as a correction by a NAMED reviewer. An unnamed reviewer, or a decision that names neither a lemma nor features, is refused. */
export function reviewerCorrection(formId: string, decision: { reviewerId: string; lexemeId?: string; features?: Record<string, string>; reason?: string; sentenceKey?: string }): ReviewerCorrectionRequest {
  const reviewerId = decision.reviewerId?.trim();
  if (!reviewerId) throw new RangeError('A reviewer decision needs the reviewer\'s name: a field is only verified by a named reviewer.');
  if (!decision.lexemeId && !(decision.features && Object.keys(decision.features).length)) throw new RangeError('A reviewer decision needs a lemma or features.');
  return {
    formId,
    correction: {
      by: 'reviewer', reviewerId,
      ...(decision.lexemeId ? { lexemeId: decision.lexemeId } : {}),
      ...(decision.features ? { features: { ...decision.features } } : {}),
      ...(decision.reason ? { reason: decision.reason } : {}),
      ...(decision.sentenceKey ? { sentenceKey: decision.sentenceKey } : {}),
    },
  };
}
