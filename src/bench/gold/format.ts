/**
 * Gold sentences: validator, JSON Lines reader/writer, and the editing format a person corrects in any text editor.
 *
 * Editing format (plain UTF-8, one sentence per two lines):
 *
 *     ## any line starting with two hashes is a comment and is ignored
 *     # <sentence id>            (optionally followed by " [held-out]")
 *     word|word|word            (the sentence text with "|" at every word boundary; spaces stay where they are)
 *
 * A "|" may sit before or after a space ("ก |ข" and "ก| ข" mean the same). Blank lines are ignored. An empty word
 * ("||", or a "|" at either end of the line) is an error: the author most likely lost a character.
 */
import { boundaryProblem, canonicalBoundaries, graphemeBoundaries, isWs, wordsOf } from '../shared';
import {
  ALL_STRATA, GOLD_RIGHTS, type EditingEntry, type GoldIssue, type GoldSentence,
} from './types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

// ───────────────────────────── converters ─────────────────────────────

/** `text` with "|" inserted at every boundary. */
export function toEditingLine(text: string, boundaries: readonly number[]): string {
  let out = '';
  let prev = 0;
  for (const b of boundaries) {
    out += text.slice(prev, b) + '|';
    prev = b;
  }
  return out + text.slice(prev);
}

export function toEditing(entries: readonly EditingEntry[], comments: readonly string[] = []): string {
  const lines: string[] = comments.map((c) => `## ${c}`);
  for (const e of entries) {
    lines.push('', `# ${e.id}${e.heldOut ? ' [held-out]' : ''}`, toEditingLine(e.text, e.boundaries));
  }
  return lines.join('\n') + '\n';
}

export function sentenceToEntry(s: GoldSentence): EditingEntry {
  return { id: s.id, heldOut: s.heldOut === true, text: s.text, boundaries: s.boundaries };
}

export interface EditingParse { entries: EditingEntry[]; problems: string[] }

/** Parse the editing format. Boundaries are canonical (see `canonicalBoundaries`). Never throws. */
export function fromEditing(source: string): EditingParse {
  const entries: EditingEntry[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  const lines = source.replace(/^﻿/u, '').split(/\r?\n/u);
  let header: { id: string; heldOut: boolean; line: number } | undefined;
  lines.forEach((raw, k) => {
    const lineNo = k + 1;
    if (raw.trim() === '' || raw.startsWith('## ') || raw === '##') return;
    const h = /^#\s+(\S+)((?:\s+\[[a-z-]+\])*)\s*$/u.exec(raw);
    if (raw.startsWith('#')) {
      if (header) problems.push(`line ${header.line}: header "${header.id}" has no sentence line`);
      if (!h) { header = undefined; problems.push(`line ${lineNo}: malformed header (expected "# <id>")`); return; }
      header = { id: h[1], heldOut: /\[held-out\]/u.test(h[2]), line: lineNo };
      if (seen.has(h[1])) problems.push(`line ${lineNo}: duplicate id "${h[1]}"`);
      seen.add(h[1]);
      return;
    }
    if (!header) { problems.push(`line ${lineNo}: a sentence line without a "# <id>" header above it`); return; }
    const hd = header;
    header = undefined;
    // positions of the pipes in the stripped text
    let text = '';
    const cuts: number[] = [];
    for (const ch of raw) {
      if (ch === '|') cuts.push(text.length);
      else text += ch;
    }
    if (text.trim().length === 0 || raw.includes('||') || /\|\s*$/u.test(raw) || /^\s*\|/u.test(raw)) {
      problems.push(`line ${lineNo}: "${hd.id}" has an empty word (a "|" at the start or end of the line, or "||")`);
      return;
    }
    entries.push({ id: hd.id, heldOut: hd.heldOut, text, boundaries: canonicalBoundaries(text, cuts) });
  });
  if (header) problems.push(`line ${header.line}: header "${header.id}" has no sentence line`);
  return { entries, problems };
}

// ───────────────────────────── validator ─────────────────────────────

/**
 * Every problem of one gold sentence (empty list = valid). Boundaries must lie inside the text, on user-perceived
 * character boundaries, never before a Thai vowel sign / tone mark nor right after a leading vowel, never on
 * whitespace; the text must be NFC and trimmed; re-joining the words must reproduce the text exactly.
 */
export function validateGold(input: unknown): GoldIssue[] {
  const issues: GoldIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (!isObj(input)) return [{ code: 'not-an-object', message: 'a gold sentence is a JSON object' }];
  const s = input;
  if (!isStr(s.id) || /\s/u.test(s.id as string)) add('bad-id', 'id must be a non-empty string without whitespace');
  if (s.lang !== 'th') add('bad-lang', 'lang must be "th"');
  if (typeof s.stratum !== 'string' || !ALL_STRATA.includes(s.stratum)) add('bad-stratum', `stratum must be one of ${ALL_STRATA.join(', ')}`);
  if (!isStr(s.tokenizedBy)) add('missing-tokenizedBy', 'tokenizedBy must say who or what drew the boundaries');
  const src = s.source;
  if (!isObj(src) || !isStr(src.title) || !isStr(src.licence) || !(GOLD_RIGHTS as readonly unknown[]).includes(src.rights)) {
    add('bad-source', `source must be {title, licence, rights} with rights one of ${GOLD_RIGHTS.join(', ')}`);
  }
  if ((s.checkedBy === undefined) !== (s.checkedAt === undefined)) add('checked-incomplete', 'checkedBy and checkedAt go together');
  if (s.checkedBy !== undefined && !isStr(s.checkedBy)) add('bad-checkedBy', 'checkedBy must be a name');
  if (s.checkedAt !== undefined && !(typeof s.checkedAt === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(s.checkedAt))) add('bad-checkedAt', 'checkedAt must be an ISO date');
  if (s.heldOut !== undefined && typeof s.heldOut !== 'boolean') add('bad-heldOut', 'heldOut must be true or false');
  if (s.notes !== undefined && typeof s.notes !== 'string') add('bad-notes', 'notes must be a string');

  if (typeof s.text !== 'string' || s.text.length === 0) { add('bad-text', 'text must be a non-empty string'); return issues; }
  const text = s.text;
  if (text !== text.normalize('NFC')) add('not-nfc', 'text is not in Unicode NFC');
  if (text.trim() !== text || isWs(text[0]) || isWs(text[text.length - 1])) add('edge-whitespace', 'text has leading or trailing whitespace');
  if (/[|\r\n]/u.test(text)) add('forbidden-character', 'text contains "|" or a line break, which the editing format cannot carry');
  if (text.startsWith('#')) add('forbidden-character', 'text starts with "#", which the editing format reads as a header');
  if (text.trim().length === 0) { add('bad-text', 'text is blank'); return issues; }

  if (!Array.isArray(s.boundaries) || s.boundaries.some((b) => !Number.isInteger(b))) {
    add('bad-boundaries', 'boundaries must be an array of integers (UTF-16 offsets)');
    return issues;
  }
  const bs = s.boundaries as number[];
  const graphemes = graphemeBoundaries(text);
  let prev = 0;
  let boundaryBad = false;
  bs.forEach((b, k) => {
    if (b <= prev) { add('boundaries-not-increasing', `boundary ${b} at index ${k} is not strictly after ${prev}`); boundaryBad = true; }
    const why = boundaryProblem(text, b, graphemes);
    if (why) { add('bad-boundary', `boundary ${b}: ${why}`); boundaryBad = true; }
    prev = b;
  });
  if (!boundaryBad) {
    // re-joining the words with the whitespace between them must give the text back
    const cuts = [0, ...bs, text.length];
    let joined = '';
    for (let k = 0; k + 1 < cuts.length; k++) joined += text.slice(cuts[k], cuts[k + 1]);
    if (joined !== text || wordsOf(text, bs).length !== bs.length + 1) add('rejoin-mismatch', 'the words do not re-join to the exact text (an empty word or lost text)');
  }
  return issues;
}

// ───────────────────────────── JSON Lines ─────────────────────────────

export const toJsonl = (rows: readonly GoldSentence[]): string => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

export interface JsonlParse { sentences: GoldSentence[]; problems: string[] }

/** Parse JSON Lines of gold sentences, validating each; invalid rows are reported and left out. */
export function parseGoldJsonl(source: string, label = 'gold'): JsonlParse {
  const sentences: GoldSentence[] = [];
  const problems: string[] = [];
  const ids = new Set<string>();
  source.split(/\r?\n/u).forEach((line, k) => {
    if (line.trim() === '') return;
    let obj: unknown;
    try { obj = JSON.parse(line); } catch { problems.push(`${label} line ${k + 1}: not JSON`); return; }
    const issues = validateGold(obj);
    if (issues.length) { problems.push(`${label} line ${k + 1}: ${issues.map((i) => i.message).join('; ')}`); return; }
    const g = obj as GoldSentence;
    if (ids.has(g.id)) { problems.push(`${label} line ${k + 1}: duplicate id ${g.id}`); return; }
    ids.add(g.id);
    sentences.push(g);
  });
  return { sentences, problems };
}
