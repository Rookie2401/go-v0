/**
 * The linguistic service: resolve a selection and keep what it learned in a LinguisticStore, look units up, invalidate
 * and correct analyses, migrate identities between pack versions and report coverage gaps. Nothing here ever deletes
 * a row, and a learner's performance never reaches this layer.
 */
import { STATUS_RANK, unitIds } from '../../repository-contract/src';
import type {
  AnalysisCandidate, AnalysisStatus, FormAnalysis, LinguisticStore, LinguisticUnit, UnitAlias, UnitProvenance, UnitRelation,
} from '../../repository-contract/src';
import { packFor } from './packs';
import { resolveSelection } from './resolver';
import type { ResolveInput, Resolution } from './resolver';

export interface Correction {
  lexemeId?: string;
  features?: Record<string, string>;
  by: 'learner' | 'reviewer';
  reason?: string;
  /** Limits the correction (and the analyses it invalidates) to one sentence; absent = the out-of-context analysis. */
  sentenceKey?: string;
}

export interface MigrationChange { oldId: string; newId?: string; reason: string; confidence: number }

export interface LookupResult {
  unit?: LinguisticUnit;
  relations: { out: UnitRelation[]; in: UnitRelation[] };
  analyses: FormAnalysis[];
}

export const LEARNER_CORRECTION_CONFIDENCE = 0.6;
export const REVIEWER_CORRECTION_CONFIDENCE = 0.95;
/** From this confidence an identity migration is `certain` and evidence may be re-attributed. */
export const CERTAIN_MIGRATION = 0.9;

const relKey = (r: UnitRelation): string => `${r.fromId}|${r.relation}|${r.toId}`;
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
const langOfId = (id: string): string => id.split(':')[1] ?? 'und';

export function createLinguisticService(store: LinguisticStore, opts: { now: () => string }) {
  /** Resolves a selection and stores what is new: units never downgraded, relations and analyses never duplicated. */
  async function resolveAndStore(input: Omit<ResolveInput, 'now'> & { now?: string }): Promise<Resolution> {
    const resolution = resolveSelection({ ...input, now: input.now ?? opts.now() });

    const existing = new Map((await store.getUnits(resolution.units.map((u) => u.unitId))).map((u) => [u.unitId, u]));
    const toPut = resolution.units.filter((u) => {
      const old = existing.get(u.unitId);
      if (!old) return true;
      if (old.status === 'invalidated' || old.supersededBy) return false;
      return STATUS_RANK[u.status] > STATUS_RANK[old.status];
    });
    if (toPut.length) await store.putUnits(toPut);

    const known = new Set<string>();
    for (const from of uniq(resolution.relations.map((r) => r.fromId))) {
      for (const r of await store.relationsOf(from, 'out')) known.add(relKey(r));
    }
    const newRels = resolution.relations.filter((r) => !known.has(relKey(r)));
    if (newRels.length) await store.putRelations(newRels);

    // an analysis that exists (and may have been invalidated or corrected since) is never rewritten
    if (!(await store.getAnalysis(resolution.analysis.analysisId))) await store.putAnalyses([resolution.analysis]);
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
    return { unit, relations: { out, in: inn }, analyses };
  }

  /** The ids the candidates of an analysis pointed at: lexemes and constructions, for finding the review items they touch. */
  const pointedAt = (a: FormAnalysis): string[] =>
    uniq(a.candidates.flatMap((c) => [...(c.lexemeId ? [c.lexemeId] : []), ...(c.constructionIds ?? [])]));

  async function invalidate(analysisId: string, reason: string, replacement?: FormAnalysis): Promise<{ affectedUnitIds: string[] }> {
    const old = await store.getAnalysis(analysisId);
    if (!old) return { affectedUnitIds: [] };
    if (replacement) await store.putAnalyses([replacement]);
    await store.invalidateAnalysis(analysisId, reason, replacement?.analysisId);
    return { affectedUnitIds: pointedAt(old) };
  }

  async function correct(formId: string, correction: Correction, now: string = opts.now()): Promise<{ analysis: FormAnalysis; invalidated: FormAnalysis[] }> {
    if (!correction.lexemeId && !(correction.features && Object.keys(correction.features).length)) {
      throw new RangeError('A correction needs a lexemeId or features.');
    }
    const languageId = langOfId(formId);
    const learner = correction.by === 'learner';
    const confidence = learner ? LEARNER_CORRECTION_CONFIDENCE : REVIEWER_CORRECTION_CONFIDENCE;
    const status: AnalysisStatus = learner ? 'provisional' : 'verified';
    const provenance: UnitProvenance = {
      source: correction.by, ref: `correction:${correction.by}`, confidence,
      ...(learner ? {} : { validatedBy: 'reviewer', validatedAt: now }),
    };

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
    };

    // the units the correction points at, so nothing it names dangles; existing units are left as they are
    const wanted: LinguisticUnit[] = [];
    const base = { languageId, packId: pack.packId, packVersion: pack.version, provenance, status, createdAt: now };
    if (correction.lexemeId) wanted.push({ ...base, unitId: correction.lexemeId, kind: 'lexeme', label: correction.lexemeId.split(':')[2] ?? correction.lexemeId, ...(pos ? { pos } : {}) });
    if (constructionId && pos) wanted.push({ ...base, unitId: constructionId, kind: 'morph-construction', label: unitIds.featureKey(features!), pos, features });
    const have = new Set((await store.getUnits(wanted.map((u) => u.unitId))).map((u) => u.unitId));
    const fresh = wanted.filter((u) => !have.has(u.unitId));
    if (fresh.length) await store.putUnits(fresh);
    const rels: UnitRelation[] = [];
    if (correction.lexemeId) rels.push({ fromId: formId, relation: 'form-of', toId: correction.lexemeId, confidence, provenance, status });
    if (constructionId) rels.push({ fromId: formId, relation: 'realizes', toId: constructionId, confidence, provenance, status });
    if (rels.length) await store.putRelations(rels);

    await store.putAnalyses([analysis]);
    const reason = `Corrected by ${correction.by}${correction.reason ? `: ${correction.reason}` : ''}`;
    const invalidated: FormAnalysis[] = [];
    for (const a of previous) {
      await store.invalidateAnalysis(a.analysisId, reason, analysis.analysisId);
      invalidated.push({ ...a, status: 'invalidated', reason, supersededBy: analysis.analysisId });
    }
    return { analysis, invalidated };
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
  async function coverageGaps(languageId: string, ids: string[]): Promise<string[]> {
    const wanted = uniq(ids);
    const have = new Map((await store.getUnits(wanted)).map((u) => [u.unitId, u]));
    const notes: string[] = [];
    for (const id of wanted) {
      const u = have.get(id);
      if (!u) notes.push(`${id}: no stored linguistic unit for ${languageId}`);
      else if (u.status === 'provisional' || u.status === 'conflicted') notes.push(`${id}: status ${u.status}`);
    }
    return notes;
  }

  return { resolveAndStore, lookup, invalidate, correct, migrate, coverageGaps };
}

export type LinguisticService = ReturnType<typeof createLinguisticService>;
