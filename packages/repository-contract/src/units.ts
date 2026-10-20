/**
 * Layer A — linguistic knowledge units (what the language contains), independent of any learner.
 * docs/ecosystem/GO-REPOSITORY-DESIGN.md §4; Prompt 3 §2–§4, §11, §17.
 *
 * Representation: typed rows plus typed relationships (a relational model with a small graph of relations), not a
 * graph database. Ambiguity is a first-class row (`FormAnalysis` with several candidates), never a forced choice.
 * Nothing in this layer is ever modified by a learner's performance; corrections create new rows and aliases.
 */

import type { FieldName, FieldStates } from './field-states';
import { validateFieldStates } from './field-states';

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
export const ANALYSIS_STATUSES = ['verified', 'high-confidence', 'provisional', 'requires-review', 'conflicted', 'invalidated'] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const PROVENANCE_SOURCES = ['hand-lexicon', 'dictionary', 'rule', 'parser', 'reviewer', 'learner', 'import'] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

/**
 * How a row came to exist (contract v3, audit P-12). `source` says what kind of producer made it; `origin` says through which
 * path it entered the shared layer: a pack's own lexicon, a dictionary import, a rule, a learner's lookup (never with a learner
 * id), a reviewer, or an import.
 */
export const PROVENANCE_ORIGINS = ['pack-lexicon', 'dictionary', 'rule-derived', 'learner-lookup', 'reviewer', 'import'] as const;
export type ProvenanceOrigin = (typeof PROVENANCE_ORIGINS)[number];

/** How far a pack (and so anything derived from it) has been validated; also the `validation` of a row. Names are stable identifiers. */
export const VALIDATION_LEVELS = ['production-validated', 'experimental', 'seed-only', 'unreviewed', 'incomplete', 'unsupported'] as const;
export type ValidationLevel = (typeof VALIDATION_LEVELS)[number];

/** What an unreviewed v2 row reads as. */
export const DEFAULT_ORIGIN: ProvenanceOrigin = 'import';
export const DEFAULT_VALIDATION: ValidationLevel = 'unreviewed';

/** A correction recorded against a row: appended, never edited. It names no learner (`by` is a role) and holds a bounded reason. */
export interface UnitCorrection {
  at: string; // ISO
  by: 'reviewer' | 'learner' | 'system';
  from?: string;
  to?: string;
  reason: string;
}
export const MAX_CORRECTIONS = 50;
export const MAX_ALTERNATIVES = 50;
export const MAX_CORRECTION_REASON_CHARS = 300;

export interface UnitProvenance {
  source: ProvenanceSource;
  /** Which resource produced it: `pack:sq:9`, `adapter-sq@9`, `wiktionary:kaikki@2026-09`, a reviewer id, … */
  ref: string;
  confidence: number; // 0..1, the producer's own number
  /** Who or what validated it to its current status (a reviewer id, a test id), when known. */
  validatedBy?: string;
  validatedAt?: string;
  // ── contract v3 (P-12). Optional so a v2 row stays valid; read through `provenanceOf`, which fills the defaults. ──
  /** The path the row entered through. Absent on a v2 row, which reads as `import`. */
  origin?: ProvenanceOrigin;
  /** The licence entry (`LanguagePackInfo.licences`) the content rests on, when it rests on one. */
  licenceId?: string;
  packVersion?: string;
  analyzerVersion?: string;
  /** The validation level of the pack/analyzer behind the row. Absent on a v2 row, which reads as `unreviewed`. */
  validation?: ValidationLevel;
  /** Other unit ids that were considered for the same thing and not chosen. */
  alternatives?: string[];
  /** Corrections recorded against this row, oldest first. */
  corrections?: UnitCorrection[];
}

/** A provenance with the v3 defaults filled in: what every reader of a row should use, so a v2 row and a v3 row read alike. */
export const provenanceOf = (p: UnitProvenance): UnitProvenance & { origin: ProvenanceOrigin; validation: ValidationLevel } => ({
  ...p, origin: p.origin ?? DEFAULT_ORIGIN, validation: p.validation ?? DEFAULT_VALIDATION,
});

/** The two indexed columns a store keeps beside a row's JSON (`origin`, `validation`). A form analysis: its own provenance, else its chosen (or first) candidate's. */
export function provenanceColumns(row: { provenance?: UnitProvenance; candidates?: Array<{ provenance?: UnitProvenance }>; chosen?: number }): { origin: ProvenanceOrigin; validation: ValidationLevel } {
  const p = row.provenance ?? row.candidates?.[row.chosen ?? 0]?.provenance;
  return { origin: p?.origin ?? DEFAULT_ORIGIN, validation: p?.validation ?? DEFAULT_VALIDATION };
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
  /**
   * Stage 7: the state of each linguistic FIELD that belongs to this unit whatever the sentence (a form's pronunciation and paradigm cell,
   * a lexeme's etymology, a sense's gloss). Absent on a row written before Stage 7: every field reads `unknown` (`fieldStateOf`).
   */
  fieldStates?: FieldStates;
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
  /** Contract v3: how the analysis as a whole came to exist; without it a store reads the chosen candidate's provenance. */
  provenance?: UnitProvenance;
  /**
   * Stage 7: the state of each field of the CHOSEN reading (lemma, pos, features, sense, paradigmCell, syntaxRelation, segmentation).
   * Absent on a row written before Stage 7: every field reads `unknown`. When the analysis is invalidated its stated fields read `invalidated`.
   */
  fieldStates?: FieldStates;
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
  /** Contract v3: the manifest's own `level` (installable, experimental, planned). Absent on a v2 row. */
  level?: 'installable' | 'experimental' | 'planned';
  /** Contract v3: the validation level the pack's MANIFEST claims. Only `production-validated` here lets an installable pack's rows read as production-validated. */
  validation?: ValidationLevel;
  /** Stage 7: fields this pack says no human can review (no native reviewer, no source to check against); GoReview never puts them to a reviewer. */
  unreviewableFields?: FieldName[];
}

/**
 * The `validation` a row made from this pack carries. `installable` reads as `production-validated` ONLY when the manifest says so
 * (`validation: 'production-validated'`); otherwise as what the manifest does say (`seed-only`, `incomplete`), else `unreviewed`.
 * `experimental` is always `experimental`; `planned` has no analyser behind it, `unsupported`. No level, or no pack, is `unreviewed`.
 */
export function validationForPack(pack: Pick<LanguagePackInfo, 'level' | 'validation'> | undefined): ValidationLevel {
  if (!pack) return 'unreviewed';
  if (pack.level === 'experimental') return 'experimental';
  if (pack.level === 'planned') return 'unsupported';
  if (pack.level === 'installable') {
    return pack.validation === 'production-validated' || pack.validation === 'seed-only' || pack.validation === 'incomplete' ? pack.validation : 'unreviewed';
  }
  return 'unreviewed';
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
  if (x.origin !== undefined && !(PROVENANCE_ORIGINS as readonly string[]).includes(String(x.origin))) out.push({ path: `${path}.origin`, message: `one of ${PROVENANCE_ORIGINS.join(', ')}` });
  if (x.validation !== undefined && !(VALIDATION_LEVELS as readonly string[]).includes(String(x.validation))) out.push({ path: `${path}.validation`, message: `one of ${VALIDATION_LEVELS.join(', ')}` });
  for (const k of ['licenceId', 'packVersion', 'analyzerVersion', 'validatedBy', 'validatedAt'] as const) {
    if (x[k] !== undefined && (typeof x[k] !== 'string' || (x[k] as string).length > 300)) out.push({ path: `${path}.${k}`, message: 'string of at most 300 characters' });
  }
  if (x.alternatives !== undefined) {
    if (!Array.isArray(x.alternatives) || x.alternatives.length > MAX_ALTERNATIVES || x.alternatives.some((a) => typeof a !== 'string' || a.length > 300)) out.push({ path: `${path}.alternatives`, message: `list of at most ${MAX_ALTERNATIVES} unit ids` });
  }
  if (x.corrections !== undefined) {
    if (!Array.isArray(x.corrections) || x.corrections.length > MAX_CORRECTIONS) out.push({ path: `${path}.corrections`, message: `list of at most ${MAX_CORRECTIONS} corrections` });
    else x.corrections.forEach((c, i) => out.push(...validateCorrection(c, `${path}.corrections[${i}]`)));
  }
  return out;
}

export function validateCorrection(c: unknown, path = 'correction'): ValidationIssue[] {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return [{ path, message: 'object' }];
  const x = c as Record<string, unknown>;
  const out: ValidationIssue[] = [];
  if (typeof x.at !== 'string' || Number.isNaN(Date.parse(x.at))) out.push({ path: `${path}.at`, message: 'ISO 8601 timestamp required' });
  if (!['reviewer', 'learner', 'system'].includes(String(x.by))) out.push({ path: `${path}.by`, message: 'one of reviewer, learner, system' });
  for (const k of ['from', 'to'] as const) if (x[k] !== undefined && (typeof x[k] !== 'string' || (x[k] as string).length > 300)) out.push({ path: `${path}.${k}`, message: 'string of at most 300 characters' });
  if (!isStr(x.reason) || x.reason.length > MAX_CORRECTION_REASON_CHARS) out.push({ path: `${path}.reason`, message: `required string of at most ${MAX_CORRECTION_REASON_CHARS} characters` });
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
  out.push(...validateFieldStates(x.fieldStates));
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
  if (x.provenance !== undefined) out.push(...validateProvenance(x.provenance));
  out.push(...validateFieldStates(x.fieldStates));
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

/**
 * Status ordering used by eligibility policies: higher is more trustworthy. `invalidated` is never eligible. `requires-review` (v3) is a
 * row someone challenged with a correction that a reviewer has not settled: it ranks below `provisional` and above `conflicted`.
 */
export const STATUS_RANK: Record<AnalysisStatus, number> = { invalidated: 0, conflicted: 1, 'requires-review': 2, provisional: 3, 'high-confidence': 4, verified: 5 };

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

/** Recover one bounded word from a reader-generated word unit id for surface-free encounter registration. */
export function surfaceFromEncounterUnitId(id: unknown, languageId: string): string | undefined {
  if (typeof id !== 'string' || !languageId || /\s/u.test(languageId)) return undefined;
  const prefix = id.startsWith(`form:${languageId}:`) ? `form:${languageId}:` : id.startsWith(`lemma:${languageId}:`) ? `lemma:${languageId}:` : undefined;
  if (!prefix) return undefined;
  let surface = id.slice(prefix.length);
  if (prefix.startsWith('lemma:')) surface = surface.replace(/:(?:NOUN|VERB|AUX|ADJ|ADV|PRON|DET|ADP|CCONJ|SCONJ|PART|NUM|INTJ|X)$/u, '');
  if (!surface || surface.length > 120 || /\s|:/u.test(surface)) return undefined;
  return surface.normalize('NFC');
}
