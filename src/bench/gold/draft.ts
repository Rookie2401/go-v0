/**
 * Course gold set, step 1: draft. Sample sentences from a lawfully supplied text and write the adapter's
 * segmentation as a DRAFT in the editing format, for a person to correct. Nothing here reads or writes files
 * (see scripts/gold-draft.mts); everything is deterministic for the same text, stratum, n and seed.
 */
import { fnv1a, seededShuffle } from '../shared';
import { toEditingLine } from './format';
import type { EditingEntry, GoldRights } from './types';
import { COURSE_STRATA } from './types';

export interface SourceMeta { title: string; licence: string; rights: GoldRights }

export interface Candidates { sentences: string[]; skipped: { notNfc: number; forbiddenCharacter: number; noThai: number; duplicate: number } }

const THAI_LETTER = /\p{Script=Thai}/u;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Filter raw sentence strings into candidates for the gold set: trimmed, NFC, with Thai, no "|" / line break / leading "#". */
export function collectCandidates(raw: Iterable<string>): Candidates {
  const out: string[] = [];
  const seen = new Set<string>();
  const skipped = { notNfc: 0, forbiddenCharacter: 0, noThai: 0, duplicate: 0 };
  for (const r of raw) {
    const t = r.trim();
    if (t === '') continue;
    if (t !== t.normalize('NFC')) { skipped.notNfc++; continue; }
    if (/[|\r\n]/u.test(t) || t.startsWith('#')) { skipped.forbiddenCharacter++; continue; }
    if (!THAI_LETTER.test(t)) { skipped.noThai++; continue; }
    if (seen.has(t)) { skipped.duplicate++; continue; }
    seen.add(t);
    out.push(t);
  }
  return { sentences: out, skipped };
}

/** Sentences of a v2 corpus document (declared sentences as given, raw paragraphs split by `segmentSentences`). */
export function sentencesOfDocument(doc: unknown, segmentSentences: (text: string) => Array<{ text: string }>): string[] {
  const out: string[] = [];
  if (!isObj(doc) || !Array.isArray(doc.sections)) return out;
  for (const sec of doc.sections as unknown[]) {
    if (!isObj(sec) || !Array.isArray(sec.paragraphs)) continue;
    for (const par of sec.paragraphs as unknown[]) {
      if (!isObj(par)) continue;
      if (Array.isArray(par.sentences)) {
        for (const s of par.sentences as unknown[]) if (isObj(s) && typeof s.text === 'string') out.push(s.text);
      } else if (typeof par.text === 'string') {
        for (const s of segmentSentences(par.text)) out.push(s.text);
      }
    }
  }
  return out;
}

export const sentencesOfPlainText = (text: string, segmentSentences: (text: string) => Array<{ text: string }>): string[] =>
  segmentSentences(text).map((s) => s.text);

/** The course rights vocabulary mapped onto the gold set's three values; anything not clearly safe is a personal copy. */
export function goldRightsOf(corpusRights: string | undefined): GoldRights {
  switch (corpusRights) {
    case 'public-domain': case 'licensed': case 'owner-authored': case 'generated': return 'rights-safe';
    default: return 'personal-copy';
  }
}

export function sourceMetaOfDocument(doc: unknown): SourceMeta | undefined {
  if (!isObj(doc) || !isObj(doc.source)) return undefined;
  const s = doc.source;
  const title = typeof s.title === 'string' && s.title.trim() ? s.title : typeof doc.title === 'string' ? doc.title : undefined;
  if (!title) return undefined;
  const rights = typeof s.rights === 'string' ? s.rights : undefined;
  const licence = [typeof s.attribution === 'string' ? s.attribution : '', `corpus rights: ${rights ?? 'not stated'}`].filter(Boolean).join('; ');
  return { title, licence, rights: goldRightsOf(rights) };
}

export interface DraftOptions { stratum: string; n: number; seed: number; heldOut: boolean; source: SourceMeta }

export interface Draft {
  entries: EditingEntry[];
  comments: string[];
  available: number;
}

/** Id of a course gold sentence: the stratum and a hash of the exact text, so a text is never sampled twice. */
export const courseSentenceId = (stratum: string, text: string): string => `${stratum}-${fnv1a(text)}`;

/** Digest of what a draft says (ids and cut lines), for telling an unedited draft from a corrected one. */
export function draftDigest(entries: ReadonlyArray<{ id: string; text: string; boundaries: readonly number[] }>): string {
  return fnv1a(entries.map((e) => `${e.id}\n${toEditingLine(e.text, e.boundaries)}`).join('\n'));
}

/**
 * Sample `n` candidates (seeded; the original order is kept) that are not in `exclude` (ids already accepted or
 * drafted) and cut each with `segment` (the adapter's boundaries). Throws on an unknown stratum.
 */
export function makeDraft(
  candidates: readonly string[], opt: DraftOptions, segment: (text: string) => number[], exclude: ReadonlySet<string> = new Set(), tool = 'thAdapter.tokenize',
): Draft {
  if (!(COURSE_STRATA as readonly string[]).includes(opt.stratum)) throw new Error(`unknown stratum "${opt.stratum}" (one of ${COURSE_STRATA.join(', ')})`);
  if (!Number.isInteger(opt.n) || opt.n < 1) throw new Error('n must be a positive whole number');
  const fresh = candidates.filter((t) => !exclude.has(courseSentenceId(opt.stratum, t)));
  const order = new Map(fresh.map((t, i) => [t, i]));
  const picked = seededShuffle(fresh, opt.seed).slice(0, opt.n).sort((a, b) => (order.get(a) as number) - (order.get(b) as number));
  const entries: EditingEntry[] = picked.map((text) => ({
    id: courseSentenceId(opt.stratum, text), heldOut: opt.heldOut, text, boundaries: segment(text),
  }));
  const comments = [
    'DRAFT: correct the word boundaries ("|" between words), then run: npm run gold:accept -- <this file> --by "Your Name"',
    'Convention: words are separated by "|"; spaces stay where they are; each punctuation mark is a word of its own;',
    'a compound the course teaches as ONE word stays one word; do not add, remove or change any letter.',
    `stratum: ${opt.stratum}`,
    `source-title: ${opt.source.title}`,
    `source-licence: ${opt.source.licence}`,
    `source-rights: ${opt.source.rights}`,
    `drafted-by: ${tool} (unchecked machine draft), seed ${opt.seed}${opt.heldOut ? ', HELD OUT' : ''}`,
    `draft-digest: ${draftDigest(entries)}`,
  ];
  return { entries, comments, available: fresh.length };
}

/** `## key: value` lines of an editing-format file (first occurrence wins). */
export function parseMeta(source: string): Map<string, string> {
  const meta = new Map<string, string>();
  for (const line of source.replace(/^﻿/u, '').split(/\r?\n/u)) {
    const m = /^##\s+([a-z-]+):\s*(.*)$/u.exec(line);
    if (m && !meta.has(m[1])) meta.set(m[1], m[2].trim());
  }
  return meta;
}
