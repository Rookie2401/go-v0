/**
 * Layer A — linguistic knowledge units (what the language contains), independent of any learner.
 * docs/ecosystem/GO-REPOSITORY-DESIGN.md §4; Prompt 3 §2–§4, §11, §17.
 *
 * Representation: typed rows plus typed relationships (a relational model with a small graph of relations), not a
 * graph database. Ambiguity is a first-class row (`FormAnalysis` with several candidates), never a forced choice.
 * Nothing in this layer is ever modified by a learner's performance; corrections create new rows and aliases.
 */

export const UNIT_KINDS = [
  'lexeme',                   // lexical identity (lemma + part of speech)
  'sense',                    // one meaning of a lexeme
  'form',                     // an inflected / surface form
  'morph-construction',       // a morphological construction (e.g. definite accusative singular of masculine nouns)
  'multiword',                // a multiword expression
  'syntactic-construction',   // a syntactic pattern (e.g. clitic doubling of the direct object)
  'phonological-distinction', // a sound contrast the learner must hear (e.g. ë vs e)
  'pronunciation-pattern',    // how a class of forms is pronounced in a variety
  'orthographic-pattern',     // a sound–symbol or spelling regularity
  'form-meaning-link',        // a specific form ↔ meaning relationship worth tracking on its own
] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

/** The validation status of an analysis or a unit; Prompt 3 §11. Names are stable identifiers. */
export const ANALYSIS_STATUSES = ['verified', 'high-confidence', 'provisional', 'conflicted', 'invalidated'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const PROVENANCE_SOURCES = ['hand-lexicon', 'dictionary', 'rule', 'parser', 'reviewer', 'learner', 'import'] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

export interface UnitProvenance {
  source: ProvenanceSource;
  /** Which resource produced it: `pack:sq:9`, `adapter-sq@9`, `wiktionary:kaikki@2026-09`, a reviewer id, … */
  ref: string;
  confidence: number; // 0..1, the producer's own number
  /** Who or what validated it to its current status (a reviewer id, a test id), when known. */
  validatedBy?: string;
  validatedAt?: string;
}

export interface LinguisticUnit {
  /** Stable, content-derived id: `lemma:sq:libër:NOUN`, `form:sq:librin`, `morph:sq:NOUN:def.acc.sg`, `phrase:sq:…`, `sense:sq:libër:NOUN:1`. */
  unitId: string;
  kind: UnitKind;
  languageId: string;
  varietyId?: string;
  scriptId?: string;
  /** Human-readable: the lemma, the surface form, the construction name, the expression. */
  label: string;
  pos?: string;
  /** Morphological or other feature structure as flat key→value (Universal-Dependencies-style where it fits). */
  features?: Record<string, string>;
  /** Frequency rank / register where a trustworthy source gives it; absent otherwise (never estimated here). */
  frequency?: { rank?: number; perMillion?: number; source: string };
  register?: string;
  packId: string;
  packVersion: string;
  provenance: UnitProvenance;
  status: AnalysisStatus;
  createdAt: string;
  /** Set when a later pack version replaced this unit; the alias table says by what. */
  supersededBy?: string;
}

export const RELATION_KINDS = [
  'form-of',            // form → lexeme (surface form belongs to lemma)
  'sense-of',           // sense → lexeme (lemma has sense)
  'realizes',           // form → morph-construction (form realizes features)
  'contains',           // multiword / construction → lexeme or form (phrase contains lexical units)
  'idiomatic-meaning',  // multiword → sense (expression has idiomatic meaning)
  'requires',           // syntactic-construction → morph-construction / feature-bearing unit
  'pronounced-as',      // form → pronunciation-pattern (in a variety)
  'depends-on',         // skill unit → skill unit (knowing A partly depends on B)
  'variant-of',         // orthographic / dialect variant
  'alias-of',           // unit → unit after a corrected identity (migration)
] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

export interface UnitRelation {
  fromId: string;
  relation: RelationKind;
  toId: string;
  confidence: number;
  provenance: UnitProvenance;
  status: AnalysisStatus;
  /** For `pronounced-as` and `variant-of`: the variety the relation holds in. */
  varietyId?: string;
}

/** One possible reading of a form in a context; several candidates = represented ambiguity. */
export interface AnalysisCandidate {
  lexemeId?: string;
  senseId?: string;
  features?: Record<string, string>;
  /** Constructions this reading realizes or takes part in. */
  constructionIds?: string[];
  /** Syntactic role in the sentence when the parser offered one (e.g. `obj`). */
  role?: string;
  confidence: number;
  provenance: UnitProvenance;
}

/**
 * The analysis of a surface form, optionally in one sentence (by sentence hash). The chosen index is the parser's or
 * a reviewer's preference; the others remain. A learner's performance never changes this row.
 */
export interface FormAnalysis {
  analysisId: string;
  formId: string;
  languageId: string;
  /** Hash of the sentence the analysis was made in; absent for an out-of-context analysis. */
  sentenceKey?: string;
  candidates: AnalysisCandidate[];
  chosen?: number;
  status: AnalysisStatus;
  analyzerId: string;
  packId: string;
  packVersion: string;
  createdAt: string;
  /** When invalidated or superseded: the analysis that replaced it and why. */
  supersededBy?: string;
  reason?: string;
}

/** Identity migration between pack versions (Prompt 3 §17): never silent, always carries confidence. */
export interface UnitAlias {
  oldId: string;
  newId: string;
  packVersion: string;
  reason: string;
  confidence: number;
  createdAt: string;
  /** `certain` → evidence may be re-attributed; `uncertain` → evidence stays on the old id and is reported as such. */
  mapping: 'certain' | 'uncertain';
}

export interface LanguagePackInfo {
  packId: string;
  languageId: string;
  version: string;
  analyzerId: string;
  /** Human-readable scope and limitations, so coverage gaps can be reported (§12). */
  coverage: { lexemes?: number; forms?: number; constructions?: number; notes: string[] };
  licences: Array<{ resource: string; licence: string; notice?: string }>;
  reviewStatus: 'machine-drafted' | 'partly-reviewed' | 'reviewed';
}

export interface ValidationIssue { path: string; message: string }

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const in01 = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1;

export function validateProvenance(p: unknown, path = 'provenance'): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!p || typeof p !== 'object') return [{ path, message: 'required object' }];
  const x = p as Record<string, unknown>;
  if (!(PROVENANCE_SOURCES as readonly string[]).includes(String(x.source))) out.push({ path: `${path}.source`, message: 'unknown provenance source' });
  if (!isStr(x.ref)) out.push({ path: `${path}.ref`, message: 'required string' });
  if (!in01(x.confidence)) out.push({ path: `${path}.confidence`, message: 'number within 0..1' });
  return out;
}

export function validateUnit(u: unknown): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!u || typeof u !== 'object') return [{ path: '', message: 'not an object' }];
  const x = u as Record<string, unknown>;
  for (const k of ['unitId', 'languageId', 'label', 'packId', 'packVersion', 'createdAt']) if (!isStr(x[k])) out.push({ path: k, message: 'required string' });
  if (!(UNIT_KINDS as readonly string[]).includes(String(x.kind))) out.push({ path: 'kind', message: 'unknown unit kind' });
  if (!(ANALYSIS_STATUSES as readonly string[]).includes(String(x.status))) out.push({ path: 'status', message: 'unknown status' });
  out.push(...validateProvenance(x.provenance));
  if (x.features !== undefined && (typeof x.features !== 'object' || x.features === null)) out.push({ path: 'features', message: 'object of strings' });
  return out;
}

export function validateRelation(r: unknown): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!r || typeof r !== 'object') return [{ path: '', message: 'not an object' }];
  const x = r as Record<string, unknown>;
  for (const k of ['fromId', 'toId']) if (!isStr(x[k])) out.push({ path: k, message: 'required string' });
  if (!(RELATION_KINDS as readonly string[]).includes(String(x.relation))) out.push({ path: 'relation', message: 'unknown relation' });
  if (!in01(x.confidence)) out.push({ path: 'confidence', message: 'number within 0..1' });
  if (!(ANALYSIS_STATUSES as readonly string[]).includes(String(x.status))) out.push({ path: 'status', message: 'unknown status' });
  out.push(...validateProvenance(x.provenance));
  return out;
}

export function validateAnalysis(a: unknown): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!a || typeof a !== 'object') return [{ path: '', message: 'not an object' }];
  const x = a as Record<string, unknown>;
  for (const k of ['analysisId', 'formId', 'languageId', 'analyzerId', 'packId', 'packVersion', 'createdAt']) if (!isStr(x[k])) out.push({ path: k, message: 'required string' });
  if (!(ANALYSIS_STATUSES as readonly string[]).includes(String(x.status))) out.push({ path: 'status', message: 'unknown status' });
  if (!Array.isArray(x.candidates)) out.push({ path: 'candidates', message: 'array required' });
  else {
    x.candidates.forEach((c, i) => {
      if (!c || typeof c !== 'object') { out.push({ path: `candidates[${i}]`, message: 'object' }); return; }
      const y = c as Record<string, unknown>;
      if (!in01(y.confidence)) out.push({ path: `candidates[${i}].confidence`, message: 'number within 0..1' });
      out.push(...validateProvenance(y.provenance, `candidates[${i}].provenance`));
    });
    if (x.chosen !== undefined && (typeof x.chosen !== 'number' || x.chosen < 0 || x.chosen >= x.candidates.length)) out.push({ path: 'chosen', message: 'index into candidates' });
  }
  return out;
}

/** Status ordering used by eligibility policies: higher is more trustworthy. `invalidated` is never eligible. */
export const STATUS_RANK: Record<AnalysisStatus, number> = { invalidated: 0, conflicted: 1, provisional: 2, 'high-confidence': 3, verified: 4 };

/** Id helpers shared by packs, the extension and the engine so one unit has one id everywhere. */
export const unitIds = {
  lexeme: (lang: string, lemma: string, pos?: string): string => `lemma:${lang}:${lemma}${pos ? ':' + pos : ''}`,
  form: (lang: string, normalizedSurface: string): string => `form:${lang}:${normalizedSurface}`,
  sense: (lexemeId: string, n: number): string => `sense:${lexemeId.replace(/^lemma:/, '')}:${n}`,
  morph: (lang: string, pos: string, featureKey: string): string => `morph:${lang}:${pos}:${featureKey}`,
  phrase: (lang: string, pattern: string[]): string => `phrase:${lang}:${pattern.join('_')}`,
  syntactic: (lang: string, name: string): string => `syntax:${lang}:${name}`,
  phonological: (lang: string, name: string): string => `phon:${lang}:${name}`,
  pronunciation: (lang: string, varietyId: string, name: string): string => `pron:${lang}:${varietyId}:${name}`,
  orthographic: (lang: string, name: string): string => `orth:${lang}:${name}`,
  formMeaning: (formId: string, senseId: string): string => `link:${formId}~${senseId}`,
  /** A stable feature key from a feature structure: sorted `k=v` pairs joined with `|`. */
  featureKey: (features: Record<string, string>): string => Object.keys(features).sort().map((k) => `${k}=${features[k]}`).join('|'),
};
