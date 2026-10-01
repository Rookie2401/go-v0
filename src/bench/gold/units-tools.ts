/**
 * Course gold set for READING UNITS: draft and accept, mirroring the word-segmentation workflow (draft.ts, accept.ts).
 * The formats are H2's (src/bench/units/gold.ts), imported unchanged. A draft is the adapter's unit boundaries for
 * sampled paragraphs; it becomes gold only when a named person has corrected it and accepted it with --by.
 *
 * The units editing format has no room for comment lines (every "#" line is a header), so what a draft needs to
 * remember (stratum, source, the machine's own boundaries) lives in a sidecar `<draft>.meta.json`.
 */
import { thAdapter } from '../../adapters/th';
import { fnv1a, seededShuffle } from '../shared';
import { fromEditing, toEditing, validateUnitCases, type UnitGoldCase } from '../units/gold';
import type { SourceMeta } from './draft';
import { COURSE_STRATA } from './types';

export const UNITS_DRAFTED_BY = 'thAdapter.segmentSentences draft (unchecked machine draft)';
export const UNITS_CHECKED_BY_HAND = 'thAdapter.segmentSentences draft, units checked and corrected by hand';
export const UNITS_CONFIRMED = 'thAdapter.segmentSentences draft, confirmed unchanged by hand';

const THAI_LETTER = /\p{Script=Thai}/u;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The adapter's reading-unit boundaries for a paragraph: the start of every sentence span after the first. */
export function adapterUnitBoundaries(paragraph: string): number[] {
  return thAdapter.segmentSentences(paragraph).slice(1).map((s) => s.start);
}

// ───────────────────────────── paragraphs of a supplied text ─────────────────────────────

/** Paragraphs of a v2 corpus document: raw paragraphs as given, declared sentences joined by the paragraph separator. */
export function paragraphsOfDocument(doc: unknown): string[] {
  const out: string[] = [];
  if (!isObj(doc) || !Array.isArray(doc.sections)) return out;
  for (const sec of doc.sections as unknown[]) {
    if (!isObj(sec) || !Array.isArray(sec.paragraphs)) continue;
    for (const par of sec.paragraphs as unknown[]) {
      if (!isObj(par)) continue;
      if (Array.isArray(par.sentences)) {
        const sep = typeof par.separator === 'string' ? par.separator : ' ';
        out.push((par.sentences as unknown[]).map((s) => (isObj(s) && typeof s.text === 'string' ? s.text : '')).join(sep));
      } else if (typeof par.text === 'string') out.push(par.text);
    }
  }
  return out;
}

/** Plain text: paragraphs are separated by blank lines; a text without any blank line has one paragraph per line. */
export function paragraphsOfPlainText(text: string): string[] {
  const t = text.replace(/^﻿/u, '');
  return /\n[ \t]*\r?\n/u.test(t) ? t.split(/\r?\n[ \t]*\r?\n/u) : t.split(/\r?\n/u);
}

export interface ParagraphCandidates { paragraphs: string[]; skipped: { notNfc: number; forbiddenCharacter: number; noThai: number; duplicate: number } }

/** Trimmed, NFC paragraphs with Thai, none containing "#" or one of the editing format's visible marks. */
export function collectParagraphs(raw: Iterable<string>): ParagraphCandidates {
  const out: string[] = [];
  const seen = new Set<string>();
  const skipped = { notNfc: 0, forbiddenCharacter: 0, noThai: 0, duplicate: 0 };
  for (const r of raw) {
    const p = r.trim();
    if (p === '') continue;
    if (p !== p.normalize('NFC')) { skipped.notNfc++; continue; }
    if (/[#␣↵␍⇥⍽⟦]/u.test(p)) { skipped.forbiddenCharacter++; continue; }
    if (!THAI_LETTER.test(p)) { skipped.noThai++; continue; }
    if (seen.has(p)) { skipped.duplicate++; continue; }
    seen.add(p);
    out.push(p);
  }
  return { paragraphs: out, skipped };
}

// ───────────────────────────── draft ─────────────────────────────

export const unitsCaseId = (stratum: string, paragraph: string): string => `units-${stratum}-${fnv1a(paragraph)}`;

export interface UnitsDraft {
  cases: UnitGoldCase[];
  /** The editing-format text the person corrects. */
  editing: string;
  /** What `gold:accept` needs to remember (written beside the draft as JSON). */
  meta: UnitsDraftMeta;
  available: number;
}

export interface UnitsDraftMeta { kind: 'units'; stratum: string; source: SourceMeta; draftedBy: string; seed: number; cases: UnitGoldCase[] }

export function makeUnitsDraft(
  paragraphs: readonly string[], opt: { stratum: string; n: number; seed: number; source: SourceMeta }, exclude: ReadonlySet<string> = new Set(),
  split: (paragraph: string) => number[] = adapterUnitBoundaries,
): UnitsDraft {
  if (!(COURSE_STRATA as readonly string[]).includes(opt.stratum)) throw new Error(`unknown stratum "${opt.stratum}" (one of ${COURSE_STRATA.join(', ')})`);
  if (!Number.isInteger(opt.n) || opt.n < 1) throw new Error('n must be a positive whole number');
  const fresh = paragraphs.filter((p) => !exclude.has(unitsCaseId(opt.stratum, p)));
  const order = new Map(fresh.map((p, i) => [p, i]));
  const picked = seededShuffle(fresh, opt.seed).slice(0, opt.n).sort((a, b) => (order.get(a) as number) - (order.get(b) as number));
  const cases: UnitGoldCase[] = picked.map((paragraph) => ({
    id: unitsCaseId(opt.stratum, paragraph), lang: 'th', stratum: opt.stratum, paragraph, unitBoundaries: split(paragraph),
    source: opt.source, segmentedBy: UNITS_DRAFTED_BY,
  }));
  const problems = validateUnitCases(cases);
  if (problems.length) throw new Error(`the machine draft is not valid: ${problems.slice(0, 3).join('; ')}`);
  return {
    cases, editing: toEditing(cases), available: fresh.length,
    meta: { kind: 'units', stratum: opt.stratum, source: opt.source, draftedBy: UNITS_DRAFTED_BY, seed: opt.seed, cases },
  };
}

// ───────────────────────────── accept ─────────────────────────────

export type UnitsAcceptResult = { ok: true; cases: UnitGoldCase[]; stratum: string } | { ok: false; refusals: string[] };

const sameBoundaries = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Validate a corrected units draft. Refuses without `by`, with a missing/damaged sidecar, with changed paragraph text,
 * with invalid boundaries, and — unless `confirmUnchanged` — a draft in which no unit was moved.
 */
export function acceptUnitsDraft(
  editing: string, meta: unknown, opt: { by: string | undefined; at: string; confirmUnchanged?: boolean },
): UnitsAcceptResult {
  const refusals: string[] = [];
  const by = opt.by?.trim();
  if (!by) refusals.push('--by "Name" is required: a gold paragraph records who checked it');
  const m = meta as Partial<UnitsDraftMeta> | undefined;
  if (!m || m.kind !== 'units' || !Array.isArray(m.cases) || typeof m.stratum !== 'string' || !isObj(m.source)) {
    refusals.push('the draft\'s .meta.json sidecar is missing or damaged; draft again with gold:draft --kind units');
    return { ok: false, refusals };
  }
  if (!(COURSE_STRATA as readonly string[]).includes(m.stratum)) refusals.push(`the sidecar's stratum is not one of ${COURSE_STRATA.join(', ')}`);
  const base = new Map(m.cases.map((c) => [c.id, c]));
  let parsed: UnitGoldCase[] = [];
  try { parsed = fromEditing(editing, { base }); } catch (e) { refusals.push(e instanceof Error ? e.message : String(e)); }
  if (parsed.length === 0 && refusals.length === 0) refusals.push('the draft contains no paragraphs');
  const ids = new Set(parsed.map((c) => c.id));
  if (ids.size !== parsed.length) refusals.push('a paragraph id appears twice in the draft');
  const changed = parsed.filter((c) => !sameBoundaries(c.unitBoundaries, (base.get(c.id) as UnitGoldCase).unitBoundaries)).length;
  if (refusals.length === 0 && changed === 0 && !opt.confirmUnchanged) {
    refusals.push('the draft is unchanged from the machine draft: correct it by hand, or pass --confirm-unchanged if every unit is right as drafted');
  }
  if (refusals.length) return { ok: false, refusals };
  const cases: UnitGoldCase[] = parsed.map((c) => ({
    ...c, segmentedBy: changed === 0 ? UNITS_CONFIRMED : UNITS_CHECKED_BY_HAND, checkedBy: by as string, checkedAt: opt.at,
    ...(changed === 0 ? { notes: 'accepted unchanged from the machine draft (--confirm-unchanged)' } : {}),
  }));
  const problems = validateUnitCases(cases);
  if (problems.length) return { ok: false, refusals: problems };
  return { ok: true, cases, stratum: m.stratum as string };
}
