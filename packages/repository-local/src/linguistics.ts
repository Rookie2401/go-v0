/**
 * Layer A on the device: the service's `LinguisticsPort` over the local store.
 *
 * Two paths, one result shape:
 *  - Albanian and Spanish go through the real linguistic service (`createLinguisticService`), exactly as on the server. Its
 *    resolver links those two adapters itself; the extension's worker build links Albanian only and replaces the Spanish module
 *    with a stub that reads the parser registry (see packages/golearn-extension/vite.config.ts), so a worker that has not loaded
 *    Spanish records a form-only unit for it.
 *  - Any other language that the host passes an adapter for (`adapters`, read at call time so an analyser loaded later is used) is
 *    resolved by `resolveWithAdapter`: a single word becomes a form unit, one lexeme per distinct reading, `form-of` relations and one
 *    analysis that keeps every reading. It makes no claim beyond the adapter's own: every row is `provisional`, validation is the pack's
 *    level (`packValidation`), a guess from an ending stays `unreviewed`. A selection of several words, or a language with no
 *    adapter, falls back to the service's form-only record.
 *
 * The sentence of a lookup is not used here (the service's own event-driven registration is out of context as well).
 */
import { unitIds } from '../../repository-contract/src';
import type {
  AnalysisCandidate, AnalysisStatus, FormAnalysis, LinguisticStore, LinguisticUnit, ProvenanceSource, UnitProvenance, UnitRelation,
} from '../../repository-contract/src';
import { analysisIdOf, createLinguisticService, packValidation, withValidation } from '../../repository-linguistics/src';
import type { LearnerCorrection, LinguisticsPort, LookupInput, LookupResult } from '../../repository-service/src/deps';

/** The languages whose resolver is linked into `repository-linguistics`. */
const STOCK = new Set(['sq', 'es']);

/**
 * What this package needs of a language analyser, structurally: the language adapters of `src/core` (`LanguageAdapter`) satisfy it, and the package imports none of
 * the legacy tree (the analysers reach it only through `repository-linguistics`, which already does).
 */
export interface AdapterLike {
  readonly lang: string;
  readonly version: string | number;
  tokenize(sentence: string): Array<{ surface: string; start: number; end: number; isWord: boolean; normalized: string }>;
  analyze(tokens: never[]): Array<{ analyzer: string; candidates: AdapterCandidate[] }>;
}
/** A reading, as an analyser reports it (the members used here). */
export interface AdapterCandidate {
  lemma?: string; pos?: string; morph: Record<string, string>; confidence: number; gloss?: string; origin?: string; unconfirmed?: boolean; sourceId?: string; notes?: Record<string, unknown>;
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

function sourceOf(c: AdapterCandidate): ProvenanceSource {
  if (c.unconfirmed || c.origin === 'rule' || (!c.origin && c.notes?.source === 'rule')) return 'rule';
  if (c.origin === 'dictionary') return 'dictionary';
  if (c.origin === 'reviewed') return 'reviewer';
  return 'hand-lexicon';
}

function flat(morph: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(morph ?? {}).sort()) {
    const v = (morph as Record<string, unknown>)[k];
    if (typeof v === 'string' && v) out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
  }
  return out;
}

/** One word, one adapter: the rows a lookup leaves in the local linguistic layer. Undefined when the selection is not exactly one word. */
export function resolveWithAdapter(adapter: AdapterLike, input: LookupInput, now: string): LookupResult | undefined {
  const lang = input.languageId;
  const surface = (input.surface ?? '').normalize('NFC').trim();
  if (!surface) return undefined;
  const tokens = adapter.tokenize(surface);
  const words = tokens.map((t, i) => ({ t, i })).filter((x) => x.t.isWord);
  if (words.length !== 1) return undefined;
  const analyzed = adapter.analyze(tokens as never[])[words[0].i];
  const packId = `pack:${lang}`;
  const packVersion = String(adapter.version);
  const analyzerId = analyzed?.analyzer ?? `adapter-${lang}@${adapter.version}`;
  const level = packValidation(lang);
  const formId = unitIds.form(lang, words[0].t.normalized);

  const readings = (analyzed?.candidates ?? []).filter((c) => !!c.lemma);
  const candidates: AnalysisCandidate[] = readings.map((c) => ({
    lexemeId: unitIds.lexeme(lang, c.lemma!, c.pos),
    features: flat(c.morph),
    confidence: clamp01(c.confidence),
    provenance: withValidation({ source: sourceOf(c), ref: c.sourceId ?? analyzerId, confidence: clamp01(c.confidence) }, c.unconfirmed ? 'unreviewed' : level),
  }));
  if (!candidates.length) {
    candidates.push({ confidence: 0.1, provenance: withValidation({ source: 'parser', ref: analyzerId, confidence: 0.1 }, level) });
  }
  let chosen = 0;
  candidates.forEach((c, i) => { if (c.confidence > candidates[chosen].confidence) chosen = i; });

  const status: AnalysisStatus = 'provisional';
  const unit = (kind: LinguisticUnit['kind'], unitId: string, label: string, provenance: UnitProvenance, extra: Partial<LinguisticUnit> = {}): LinguisticUnit => ({
    unitId, kind, languageId: lang, label, packId, packVersion, provenance, status, createdAt: now, ...extra,
  });
  const units: LinguisticUnit[] = [unit('form', formId, words[0].t.surface, candidates[chosen].provenance, readings[chosen]?.pos ? { pos: readings[chosen].pos } : {})];
  const relations: UnitRelation[] = [];
  candidates.forEach((cand, i) => {
    if (!cand.lexemeId) return;
    const r = readings[i];
    if (!units.some((u) => u.unitId === cand.lexemeId)) units.push(unit('lexeme', cand.lexemeId, r.lemma!, cand.provenance, r.pos ? { pos: r.pos } : {}));
    relations.push({ fromId: formId, relation: 'form-of', toId: cand.lexemeId, confidence: cand.confidence, provenance: cand.provenance, status });
  });
  const analysis: FormAnalysis = {
    analysisId: analysisIdOf(formId, undefined, analyzerId), formId, languageId: lang, candidates, chosen, status, analyzerId, packId, packVersion, createdAt: now,
  };
  return { formId, units, relations, analysis };
}

export interface LocalLinguisticsOptions {
  now: () => string;
  /** Analysers by language id, read at call time. */
  adapters?: Readonly<Record<string, AdapterLike | undefined>>;
}

export function createLocalLinguistics(store: LinguisticStore, opts: LocalLinguisticsOptions): LinguisticsPort {
  const service = createLinguisticService(store, { now: opts.now });
  return {
    async resolveAndStore(input: LookupInput): Promise<LookupResult> {
      const adapter = STOCK.has(input.languageId) ? undefined : opts.adapters?.[input.languageId];
      if (adapter) {
        let resolved: LookupResult | undefined;
        try { resolved = resolveWithAdapter(adapter, input, opts.now()); } catch { resolved = undefined; }
        if (resolved) {
          await store.putUnits(resolved.units);
          await store.putRelations(resolved.relations);
          if (resolved.analysis && !(await store.getAnalysis(resolved.analysis.analysisId))) await store.putAnalyses([resolved.analysis]);
          return resolved;
        }
      }
      const r = await service.resolveAndStore({
        languageId: input.languageId, surface: input.surface,
        ...(input.sentence !== undefined ? { sentence: input.sentence } : {}), ...(input.sentenceKey !== undefined ? { sentenceKey: input.sentenceKey } : {}),
        ...(input.selStart !== undefined ? { selStart: input.selStart } : {}), ...(input.selEnd !== undefined ? { selEnd: input.selEnd } : {}),
      });
      return { formId: r.formId, units: r.units, relations: r.relations, analysis: r.analysis };
    },
    async lookup(unitId) {
      const r = await service.lookup(unitId);
      if (!r.unit) return undefined;
      return { unit: r.unit, relations: [...r.relations.out, ...r.relations.in], analyses: r.analyses };
    },
    async correct(formId, correction: LearnerCorrection, now) {
      const r = await service.correct(formId, {
        by: correction.by,
        ...(correction.lexemeId ? { lexemeId: correction.lexemeId } : {}),
        ...(correction.features ? { features: correction.features } : {}),
        ...(correction.reason ? { reason: correction.reason } : {}),
        ...(correction.sentenceKey ? { sentenceKey: correction.sentenceKey } : {}),
      }, now);
      return { analysis: r.analysis, invalidated: r.invalidated.map((a) => a.analysisId) };
    },
  };
}
