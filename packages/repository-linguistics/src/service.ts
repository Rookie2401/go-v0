/**
 * The linguistic service: resolve a selection and keep what it learned in a LinguisticStore, look units up, invalidate
 * and correct analyses, migrate identities between pack versions and report coverage gaps. Nothing here ever deletes
 * a row, and a learner's performance never reaches this layer.
 */
import { FIELD_NAMES, STATUS_RANK, invalidateFieldStates, mergeFieldStates, sameFieldStates, unitIds } from '../../repository-contract/src';
import type {
  AnalysisCandidate, AnalysisStatus, FieldName, FieldState, FormAnalysis, LinguisticStore, LinguisticUnit, UnitAlias, UnitProvenance, UnitRelation,
} from '../../repository-contract/src';
import { contextualFieldStates, fieldStatesFor } from './field-states';
import { packFor, withValidation } from './packs';
import { resolveSelection } from './resolver';
import type { ResolveInput, Resolution } from './resolver';

export interface Correction {
  lexemeId?: string;
  features?: Record<string, string>;
  by: 'learner' | 'reviewer';
  /** The reviewer's name or id (Stage 7). A field is `verified` by a NAMED reviewer; a caller that omits it is recorded as the role `reviewer`. */
  reviewerId?: string;
  reason?: string;
  /** Limits the correction (and the analyses it invalidates) to one sentence; absent = the out-of-context analysis. */
  sentenceKey?: string;
  /**
   * Whether the ids the superseded analyses pointed at are re-keyed to the corrected ones (an alias row, so the learner's evidence follows).
   * Default (absent): only when the superseded reading was a single committed one (a wrong answer, not an ambiguity resolved) and no other live
   * analysis still points at the old id. `true` forces the re-key, `false` forbids it.
   */
  rekey?: boolean;
}

/** What a correction did beyond the new analysis (projection and deck follow these). */
export interface CorrectionResult {
  analysis: FormAnalysis;
  invalidated: FormAnalysis[];
  /** Every unit id the superseded analyses or the corrected one pointed at. */
  affectedUnitIds: string[];
  /** Ids the superseded analyses pointed at and the corrected one does not: candidates and review items on these must be withdrawn. */
  withdrawUnitIds: string[];
  /** Identity re-keys written: `certain` (a reviewer) lets the projection move the learner's evidence to the new id, `uncertain` (a learner) leaves it and says so. */
  aliases: UnitAlias[];
  /** Old units marked `supersededBy` (certain re-keys only); their eligibility reads `invalidated`. */
  superseded: string[];
}

export interface MigrationChange { oldId: string; newId?: string; reason: string; confidence: number }

/**
 * What `lookup` returns. Stage 7: `unit.fieldStates` are the unit's shared-fact fields and each `analyses[i].fieldStates` the contextual
 * fields of that reading (an invalidated analysis shows its stated fields as `invalidated` even if the store row predates the rule).
 */
export interface LookupResult {
  unit?: LinguisticUnit;
  relations: { out: UnitRelation[]; in: UnitRelation[] };
  analyses: FormAnalysis[];
}

/** One field that is not yet solid, for `coverageGapsByField`. */
export interface FieldGap { unitId: string; field: FieldName; state: FieldState; basis: string; where: 'unit' | 'analysis'; analysisId?: string }

export const LEARNER_CORRECTION_CONFIDENCE = 0.6;
export const REVIEWER_CORRECTION_CONFIDENCE = 0.95;
/** From this confidence an identity migration is `certain` and evidence may be re-attributed. */
export const CERTAIN_MIGRATION = 0.9;

/** An invalidated analysis reads with its stated fields invalidated, whatever the store row says (rows invalidated by a store that predates Stage 7). */
const withInvalidatedFields = (a: FormAnalysis): FormAnalysis =>
  a.status === 'invalidated' && a.fieldStates ? { ...a, fieldStates: invalidateFieldStates(a.fieldStates, a.reason ?? 'analysis invalidated') } : a;

const relKey = (r: UnitRelation): string => `${r.fromId}|${r.relation}|${r.toId}`;
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
const langOfId = (id: string): string => id.split(':')[1] ?? 'und';

export function createLinguisticService(store: LinguisticStore, opts: { now: () => string }) {
  /** Resolves a selection and stores what is new: units never downgraded, relations and analyses never duplicated. */
  async function resolveAndStore(input: Omit<ResolveInput, 'now'> & { now?: string }): Promise<Resolution> {
    const resolution = resolveSelection({ ...input, now: input.now ?? opts.now() });

    const existing = new Map((await store.getUnits(resolution.units.map((u) => u.unitId))).map((u) => [u.unitId, u]));
    const toPut: LinguisticUnit[] = [];
    for (const u of resolution.units) {
      const old = existing.get(u.unitId);
      if (!old) { toPut.push(u); continue; }
      if (old.status === 'invalidated' || old.supersededBy) continue;
      if (STATUS_RANK[u.status] > STATUS_RANK[old.status]) {
        const merged = mergeFieldStates(old.fieldStates, u.fieldStates);
        toPut.push(merged ? { ...u, fieldStates: merged } : u);
        continue;
      }
      // same or lower unit status: the row stays as it is, but a shared field that is now better stated (or newly stated) is added, never lowered
      const merged = mergeFieldStates(old.fieldStates, u.fieldStates);
      if (merged && !sameFieldStates(merged, old.fieldStates)) toPut.push({ ...old, fieldStates: merged });
    }
    if (toPut.length) await store.putUnits(toPut);

    const known = new Set<string>();
    for (const from of uniq(resolution.relations.map((r) => r.fromId))) {
      for (const r of await store.relationsOf(from, 'out')) known.add(relKey(r));
    }
    const newRels = resolution.relations.filter((r) => !known.has(relKey(r)));
    if (newRels.length) await store.putRelations(newRels);

    // an analysis that exists (and may have been invalidated or corrected since) is never rewritten
    const storedAnalysis = await store.getAnalysis(resolution.analysis.analysisId);
    if (!storedAnalysis) await store.putAnalyses([resolution.analysis]);
    else if (!storedAnalysis.fieldStates && resolution.analysis.fieldStates && storedAnalysis.status !== 'invalidated' && !storedAnalysis.supersededBy) {
      // a row written before Stage 7: it gains its field states once and is otherwise untouched
      await store.putAnalyses([{ ...storedAnalysis, fieldStates: resolution.analysis.fieldStates }]);
    }
    return resolution;
  }

  async function lookup(unitId: string): Promise<LookupResult> {
    const [unit] = await store.getUnits([unitId]);
    const out = await store.relationsOf(unitId, 'out');
    const inn = await store.relationsOf(unitId, 'in');
    let analyses: FormAnalysis[] = [];
    if (unit?.kind === 'form') analyses = await store.analysesOfForm(unitId);
    else if (unit) {
      const forms = uniq(inn.filter((r) => r.fromId.startsWith('form:')).map((r) => r.fromId));
      const seen = new Map<string, FormAnalysis>();
      for (const f of forms) {
        for (const a of await store.analysesOfForm(f)) {
          if (a.candidates.some((c) => c.lexemeId === unitId || c.senseId === unitId || c.constructionIds?.includes(unitId))) seen.set(a.analysisId, a);
        }
      }
      analyses = [...seen.values()];
    }
    return { unit, relations: { out, in: inn }, analyses: analyses.map(withInvalidatedFields) };
  }

  /**
   * Every id the candidates of an analysis pointed at: lexemes, senses and morph constructions, sorted. Same set as the
   * engine's `affectedByInvalidation` (kept in step by test/audit/model.analysis), so a deck item on a sense unit is named too.
   */
  const pointedAt = (a: FormAnalysis): string[] =>
    uniq(a.candidates.flatMap((c) => [...(c.lexemeId ? [c.lexemeId] : []), ...(c.senseId ? [c.senseId] : []), ...(c.constructionIds ?? [])])).sort();

  async function invalidate(analysisId: string, reason: string, replacement?: FormAnalysis): Promise<{ affectedUnitIds: string[]; withdrawUnitIds: string[] }> {
    const old = await store.getAnalysis(analysisId);
    if (!old) return { affectedUnitIds: [], withdrawUnitIds: [] };
    if (replacement) await store.putAnalyses([replacement]);
    await store.invalidateAnalysis(analysisId, reason, replacement?.analysisId);
    const kept = new Set(replacement ? pointedAt(replacement) : []);
    return { affectedUnitIds: pointedAt(old), withdrawUnitIds: pointedAt(old).filter((i) => !kept.has(i)) };
  }

  async function correct(formId: string, correction: Correction, now: string = opts.now()): Promise<CorrectionResult> {
    if (!correction.lexemeId && !(correction.features && Object.keys(correction.features).length)) {
      throw new RangeError('A correction needs a lexemeId or features.');
    }
    const languageId = langOfId(formId);
    const learner = correction.by === 'learner';
    const confidence = learner ? LEARNER_CORRECTION_CONFIDENCE : REVIEWER_CORRECTION_CONFIDENCE;
    const status: AnalysisStatus = learner ? 'provisional' : 'verified';
    // A reviewer's correction is validated for the item it names; a learner's is not (it stays provisional and unreviewed).
    const provenance: UnitProvenance = withValidation({
      source: correction.by, ref: `correction:${correction.by}`, confidence,
      ...(learner ? {} : { validatedBy: correction.reviewerId?.trim() || 'reviewer', validatedAt: now }),
    }, learner ? 'unreviewed' : 'production-validated');

    const previous = (await store.analysesOfForm(formId, correction.sentenceKey))
      .filter((a) => a.status !== 'invalidated' && !a.supersededBy)
      // without a sentence key the correction replaces every live analysis of the form; with one, only that sentence's
      .filter((a) => correction.sentenceKey === undefined || a.sentenceKey === correction.sentenceKey);
    const pack = previous[0] ? { packId: previous[0].packId, version: previous[0].packVersion } : (() => { const p = packFor(languageId); return { packId: p.packId, version: p.version }; })();

    const features = correction.features && Object.keys(correction.features).length ? { ...correction.features } : undefined;
    const pos = correction.lexemeId ? correction.lexemeId.split(':')[3] : undefined;
    const constructionId = features && pos ? unitIds.morph(languageId, pos, unitIds.featureKey(features)) : undefined;
    const candidate: AnalysisCandidate = {
      ...(correction.lexemeId ? { lexemeId: correction.lexemeId } : {}),
      ...(features ? { features } : {}),
      ...(constructionId ? { constructionIds: [constructionId] } : {}),
      confidence, provenance,
    };
    const analysis: FormAnalysis = {
      analysisId: `analysis:${formId}@${correction.sentenceKey ?? 'none'}@correction:${correction.by}:${now}`,
      formId, languageId, ...(correction.sentenceKey ? { sentenceKey: correction.sentenceKey } : {}),
      candidates: [candidate], chosen: 0, status, analyzerId: `correction:${correction.by}`,
      packId: pack.packId, packVersion: pack.version, createdAt: now,
      // Stage 7: what the correction states becomes verified (a reviewer, named by reviewerId) or provisional (a learner); nothing else is claimed
      fieldStates: contextualFieldStates(fieldStatesFor({
        readings: [candidate], chosen: 0, now,
        ...(learner ? {} : { reviewer: { id: correction.reviewerId?.trim() || 'reviewer' } }),
      })),
    };

    // the units the correction points at, so nothing it names dangles; existing units are left as they are
    const wanted: LinguisticUnit[] = [];
    const base = { languageId, packId: pack.packId, packVersion: pack.version, provenance, status, createdAt: now };
    if (correction.lexemeId) wanted.push({ ...base, unitId: correction.lexemeId, kind: 'lexeme', label: correction.lexemeId.split(':')[2] ?? correction.lexemeId, ...(pos ? { pos } : {}) });
    if (constructionId && pos) wanted.push({ ...base, unitId: constructionId, kind: 'morph-construction', label: unitIds.featureKey(features!), pos, features });
    const haveRows = new Map((await store.getUnits(wanted.map((u) => u.unitId))).map((u) => [u.unitId, u]));
    const fresh = wanted.filter((u) => !haveRows.has(u.unitId));
    // A REVIEWER's correction supersedes an earlier lower status (conflicted, provisional ...) on the units it names; the
    // store only ever raises a rank, so this cannot lower anything. A learner's correction never raises an existing unit.
    const raised: LinguisticUnit[] = learner ? [] : wanted.flatMap((u) => {
      const old = haveRows.get(u.unitId);
      return old && !old.supersededBy && STATUS_RANK[old.status] < STATUS_RANK[status] ? [{ ...old, status, provenance }] : [];
    });
    if (fresh.length || raised.length) await store.putUnits([...fresh, ...raised]);
    const rels: UnitRelation[] = [];
    if (correction.lexemeId) rels.push({ fromId: formId, relation: 'form-of', toId: correction.lexemeId, confidence, provenance, status });
    if (constructionId) rels.push({ fromId: formId, relation: 'realizes', toId: constructionId, confidence, provenance, status });
    if (rels.length) await store.putRelations(rels);

    await store.putAnalyses([analysis]);
    const reason = `Corrected by ${correction.by}${correction.reason ? `: ${correction.reason}` : ''}`;
    const invalidated: FormAnalysis[] = [];
    for (let prior of previous) {
      if (!prior.fieldStates) {
        // a row written before Stage 7: derive what it stated from its readings so that the fields can be shown as invalidated, not lost
        prior = { ...prior, fieldStates: contextualFieldStates(fieldStatesFor({ readings: prior.candidates, ...(prior.chosen === undefined ? {} : { chosen: prior.chosen }), now: prior.createdAt })) };
        await store.putAnalyses([prior]);
      }
      const a = prior;
      await store.invalidateAnalysis(a.analysisId, reason, analysis.analysisId);
      // the superseded analysis keeps its row; every field it stated reads invalidated (the stores do the same to the stored row)
      const fs = invalidateFieldStates(a.fieldStates, reason, now);
      invalidated.push({ ...a, status: 'invalidated', reason, supersededBy: analysis.analysisId, ...(fs ? { fieldStates: fs } : {}) });
    }
    // Re-key (b), withdraw (c): the ids the superseded analyses pointed at and the corrected one does not.
    const nextIds = new Set(pointedAt(analysis));
    const before = uniq(previous.flatMap(pointedAt)).sort();
    const withdrawUnitIds = before.filter((i) => !nextIds.has(i));
    const aliases: UnitAlias[] = [];
    const superseded: string[] = [];
    if (correction.rekey !== false) {
      const target = (oldId: string): string | undefined => {
        if (oldId.startsWith('lemma:') && correction.lexemeId && correction.lexemeId !== oldId) return correction.lexemeId;
        // a construction follows only within its part of speech (morph:<lang>:<POS>:<features>)
        if (oldId.startsWith('morph:') && constructionId && constructionId !== oldId && oldId.split(':')[2] === constructionId.split(':')[2]) return constructionId;
        return undefined;
      };
      for (const oldId of withdrawUnitIds) {
        const newId = target(oldId);
        if (!newId) continue;
        if (correction.rekey !== true) {
          // a committed single reading that was wrong, and nothing else still relies on the old id
          const committed = previous.filter((a) => pointedAt(a).includes(oldId)).every((a) => a.candidates.length === 1);
          if (!committed) continue;
          const support = (await lookup(oldId)).analyses.filter((a) => a.status !== 'invalidated' && !a.supersededBy && a.analysisId !== analysis.analysisId && pointedAt(a).includes(oldId));
          if (support.length) continue;
        }
        aliases.push({
          oldId, newId, packVersion: pack.version, reason: `correction of ${formId} by ${correction.by}${correction.reason ? `: ${correction.reason}` : ''}`,
          confidence, createdAt: now, mapping: confidence >= CERTAIN_MIGRATION ? 'certain' : 'uncertain',
        });
      }
      if (aliases.length) {
        await store.putAliases(aliases);
        const certain = new Map(aliases.filter((a) => a.mapping === 'certain').map((a) => [a.oldId, a.newId]));
        const olds = (await store.getUnits([...certain.keys()])).filter((u) => !u.supersededBy);
        if (olds.length) await store.putUnits(olds.map((u) => ({ ...u, supersededBy: certain.get(u.unitId)! })));
        superseded.push(...olds.map((u) => u.unitId));
      }
    }
    // The form's own row follows a reviewer's verdict once no other live analysis of it is left to disagree (a correction
    // limited to one sentence leaves the out-of-context readings, so the form keeps its status then).
    if (!learner) {
      const [formUnit] = await store.getUnits([formId]);
      const others = (await store.analysesOfForm(formId)).filter((a) => a.analysisId !== analysis.analysisId && a.status !== 'invalidated' && !a.supersededBy);
      if (formUnit && !formUnit.supersededBy && others.length === 0 && STATUS_RANK[formUnit.status] < STATUS_RANK[status]) {
        await store.putUnits([{ ...formUnit, status, provenance }]);
      }
    }
    return { analysis, invalidated, affectedUnitIds: uniq([...before, ...nextIds]).sort(), withdrawUnitIds, aliases, superseded };
  }

  /**
   * Identity migration between pack versions: an alias row per mapped change, never silent and never a deletion.
   * `certain` (confidence >= 0.9) lets evidence move to the new id; `uncertain` leaves it on the old id and says so.
   * A change with no `newId` is a retirement: nothing to alias, reported in `unmapped`.
   */
  async function migrate(oldPackVersion: string, newPackVersion: string, changes: MigrationChange[]): Promise<{ aliases: UnitAlias[]; superseded: string[]; unmapped: string[] }> {
    const now = opts.now();
    const aliases: UnitAlias[] = [];
    const unmapped: string[] = [];
    for (const c of changes) {
      if (!c.newId || c.newId === c.oldId) { unmapped.push(c.oldId); continue; }
      const confidence = Math.max(0, Math.min(1, c.confidence));
      aliases.push({
        oldId: c.oldId, newId: c.newId, packVersion: newPackVersion,
        reason: `${c.reason} (pack ${oldPackVersion} → ${newPackVersion})`,
        confidence, createdAt: now, mapping: confidence >= CERTAIN_MIGRATION ? 'certain' : 'uncertain',
      });
    }
    if (aliases.length) await store.putAliases(aliases);
    const olds = await store.getUnits(aliases.map((a) => a.oldId));
    const target = new Map(aliases.map((a) => [a.oldId, a.newId]));
    const marked = olds.map((u) => ({ ...u, supersededBy: target.get(u.unitId)! }));
    if (marked.length) await store.putUnits(marked);
    return { aliases, superseded: marked.map((u) => u.unitId), unmapped };
  }

  /** Notes for the suitability query: ids with no stored unit, or a unit that is only provisional or conflicted. */
  async function coverageGaps(languageId: string, ids: string[], opts: { byField?: boolean } = {}): Promise<string[]> {
    const wanted = uniq(ids);
    const have = new Map((await store.getUnits(wanted)).map((u) => [u.unitId, u]));
    const notes: string[] = [];
    for (const id of wanted) {
      const u = have.get(id);
      if (!u) notes.push(`${id}: no stored linguistic unit for ${languageId}`);
      else if (u.status === 'provisional' || u.status === 'requires-review' || u.status === 'conflicted') notes.push(`${id}: status ${u.status}`);
    }
    // Stage 7, opt in so the unit-level notes above keep their exact text: one note per field that is not yet supported or verified
    if (opts.byField) for (const g of await coverageGapsByField(languageId, wanted)) notes.push(`${g.unitId}: ${g.where === 'analysis' ? 'reading' : 'unit'} field ${g.field} is ${g.state}`);
    return notes;
  }

  /**
   * The fields that are `provisional` or `conflicted` on the stored units and on the live analyses of the forms among `ids`
   * (and of the forms that point at a lexeme / sense / construction among them). `unknown` is not listed: a field nothing
   * states is not a gap in what is stored, it is what is absent (`absent = unknown`). Invalidated rows are skipped.
   */
  async function coverageGapsByField(_languageId: string, ids: string[]): Promise<FieldGap[]> {
    const wanted = uniq(ids);
    const gaps: FieldGap[] = [];
    const add = (unitId: string, fs: LinguisticUnit['fieldStates'], where: FieldGap['where'], analysisId?: string): void => {
      for (const f of FIELD_NAMES) {
        const e = fs?.[f];
        if (e && (e.state === 'provisional' || e.state === 'conflicted')) gaps.push({ unitId, field: f, state: e.state, basis: e.basis, where, ...(analysisId ? { analysisId } : {}) });
      }
    };
    for (const u of await store.getUnits(wanted)) {
      if (u.status === 'invalidated' || u.supersededBy) continue;
      add(u.unitId, u.fieldStates, 'unit');
    }
    for (const id of wanted) {
      for (const a of (await lookup(id)).analyses) {
        if (a.status === 'invalidated' || a.supersededBy) continue;
        add(id, a.fieldStates, 'analysis', a.analysisId);
      }
    }
    return gaps;
  }

  return { resolveAndStore, lookup, invalidate, correct, migrate, coverageGaps, coverageGapsByField };
}

export type LinguisticService = ReturnType<typeof createLinguisticService>;
