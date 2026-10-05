/**
 * The review pipeline of a ladder unit (docs/LADDER.md, "The pipeline"): draft -> review -> corrections -> audio -> published.
 *
 * A unit carries an optional `pipeline` block (`Pipeline`, defined in `format.ts`). This module holds everything about it
 * that is pure: the allowed order of states, the validator behind the `pipeline-*` codes, `advance` (the one way a
 * document's pipeline moves), `pipelineSummary`, and the pieces of the reviewer round trip that the two scripts wrap:
 *
 *   buildReviewPacket   a document -> the printable packet (HTML) and the `<unit>.return.json` template
 *   parseReturn         a return file -> a checked reviewer return (a person, with name and competence, is required)
 *   applyReturn         a document + a return -> the document with the reviewer's corrections and the new history entries
 *
 * Nothing here reads or writes a file, and nothing imports an adapter: sentence segmentation is passed in.
 * The publication rule that reads the block is `computePublished` (publish.ts); the review/apply scripts are
 * `scripts/review-packet.mts` and `scripts/review-apply.mts`.
 */
import { LANGUAGE_ROWS } from '../core';
import type {
  ChecklistItem, ChecklistResult, CorpusDocument, DocSentence, Pipeline, PipelineActor, PipelineChecklist, PipelineEntry, PipelineState,
  ReviewerCompetence,
} from './format';
import { contentSignatureOf, pipelineHoldReasons } from './publish';

// ───────────────────────────── vocabulary ─────────────────────────────

export const PIPELINE_STATES: readonly PipelineState[] = ['machine-draft', 'in-review', 'corrections-pending', 'reviewed', 'audio-ready', 'published'];
export const REVIEWER_COMPETENCES: readonly ReviewerCompetence[] = ['native', 'near-native', 'professional'];
export const CHECKLIST_ITEMS: readonly ChecklistItem[] = [
  'naturalness', 'contemporaryUsage', 'register', 'grammar', 'dialect', 'soundsTranslated', 'culturalOddities', 'unnaturalSimplification',
];
export const CHECKLIST_RESULTS: readonly ChecklistResult[] = ['ok', 'changed', 'problem'];
export const DEFAULT_REVIEWER_ROLE = 'linguistic-reviewer';
export const RETURN_FORMAT = 'go-review-return@1';

/** Where each state may go next. A correction sends a unit back to `in-review` (from `reviewed` onwards too). */
export const NEXT_STATES: Readonly<Record<PipelineState, readonly PipelineState[]>> = {
  'machine-draft': ['in-review'],
  'in-review': ['corrections-pending', 'reviewed'],
  'corrections-pending': ['in-review', 'reviewed'],
  'reviewed': ['audio-ready', 'in-review'],
  'audio-ready': ['published', 'in-review'],
  'published': ['in-review'],
};

/** States a tool can never record: they are past `in-review`, so only a person moves a unit into them. */
const PERSON_ONLY: readonly PipelineState[] = ['corrections-pending', 'reviewed', 'audio-ready', 'published'];

/** The eight checklist questions, in the plain words the packet shows a reviewer. */
export const CHECKLIST_GUIDE: ReadonlyArray<{ item: ChecklistItem; title: string; question: string; explanation: string }> = [
  { item: 'naturalness', title: 'Naturalness', question: 'Would a native speaker really say or write it this way?',
    explanation: 'Read each sentence aloud. Mark it when the words are correct but nobody would put them together like that.' },
  { item: 'contemporaryUsage', title: 'Contemporary usage', question: 'Are the words and phrases the ones people use today?',
    explanation: 'Look for old-fashioned words, bookish phrasing or expressions that have gone out of use.' },
  { item: 'register', title: 'Register', question: 'Is the level of formality right for who is speaking to whom?',
    explanation: 'Friends, family, a boss and a stranger are addressed differently. Check pronouns, greetings and polite forms.' },
  { item: 'grammar', title: 'Grammatical correctness', question: 'Is the grammar, spelling and punctuation correct?',
    explanation: 'Agreement, verb forms, accents and punctuation. Correct anything that a careful writer would not write.' },
  { item: 'dialect', title: 'Dialect appropriateness', question: 'Does it match the variety of the language this unit is for?',
    explanation: 'The variety is named at the top of this packet. Check vocabulary, the forms of address and any spelling or expressions that belong to another region.' },
  { item: 'soundsTranslated', title: 'Sounds translated', question: 'Does anything sound translated from English?',
    explanation: 'Word order, a phrase copied word for word, or an expression that exists in English but is not used in this language.' },
  { item: 'culturalOddities', title: 'Cultural oddities', question: 'Is anything odd or out of place for the culture?',
    explanation: 'Names, food, places, customs, gestures, or things people would not do or say in real life there.' },
  { item: 'unnaturalSimplification', title: 'Unnatural simplification', question: 'Is anything simplified so much that it sounds unnatural?',
    explanation: 'Very short, choppy sentences; the same noun repeated where a speaker would use a pronoun; a tone that is too childish for the learners.' },
];

// ───────────────────────────── validation ─────────────────────────────

export type PipelineProblemCode =
  | 'invalid-value' | 'missing-field' | 'unknown-field' | 'pipeline-tool-cannot-review' | 'pipeline-illegal-move' | 'pipeline-state-mismatch';

export interface PipelineProblem { severity: 'error' | 'warning'; path: string; code: PipelineProblemCode; message: string; hint: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isState = (v: unknown): v is PipelineState => (PIPELINE_STATES as readonly unknown[]).includes(v);

/** True for a real calendar date written YYYY-MM-DD. */
export function isCalendarDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Check a `pipeline` block. Errors: the shape; a history entry that moves a unit past `in-review` and is not by a person
 * (`pipeline-tool-cannot-review`); a move the order does not allow (`pipeline-illegal-move`); a `state` that is not the last
 * history entry's (`pipeline-state-mismatch`). `base` is the JSON path of the block.
 */
export function pipelineProblems(value: unknown, base = 'pipeline'): PipelineProblem[] {
  const out: PipelineProblem[] = [];
  const add = (severity: PipelineProblem['severity'], path: string, code: PipelineProblemCode, message: string, hint: string) =>
    out.push({ severity, path, code, message, hint });
  const err = (path: string, code: PipelineProblemCode, message: string, hint: string) => add('error', path, code, message, hint);

  if (!isObj(value)) {
    err(base, 'invalid-value', 'pipeline must be an object {state, history}', 'e.g. "pipeline": {"state": "machine-draft", "history": [{"state": "machine-draft", "at": "2026-10-05", "by": {"kind": "tool", "name": "ladder drafting agent"}}]}');
    return out;
  }
  for (const k of Object.keys(value)) if (k !== 'state' && k !== 'history' && !k.startsWith('_')) add('warning', `${base}.${k}`, 'unknown-field', `unknown pipeline field "${k}" is ignored`, 'A pipeline block is {state, history}.');
  const stateOk = isState(value.state);
  if (!stateOk) err(`${base}.state`, 'invalid-value', `pipeline.state must be one of ${PIPELINE_STATES.join(', ')}`, 'It is the state of the last history entry.');
  if (!Array.isArray(value.history) || value.history.length === 0) {
    err(`${base}.history`, 'missing-field', 'pipeline.history must be a non-empty array', 'Record every move: the first entry is the machine draft.');
    return out;
  }

  let previous: PipelineState | undefined;
  let last: PipelineState | undefined;
  (value.history as unknown[]).forEach((e, i) => {
    const p = `${base}.history[${i}]`;
    if (!isObj(e)) { err(p, 'invalid-value', 'a history entry must be an object {state, at, by, …}', 'e.g. {"state": "in-review", "at": "2026-10-06", "by": {"kind": "person", …}}'); previous = undefined; last = undefined; return; }
    for (const k of Object.keys(e)) {
      if (!['state', 'at', 'by', 'checklist', 'corrections', 'recordings', 'contentSignature'].includes(k) && !k.startsWith('_')) add('warning', `${p}.${k}`, 'unknown-field', `unknown history field "${k}" is ignored`, 'Entries are {state, at, by?, checklist?, corrections?, recordings?}.');
    }
    const state = isState(e.state) ? e.state : undefined;
    if (!state) err(`${p}.state`, 'invalid-value', `state must be one of ${PIPELINE_STATES.join(', ')}`, 'Use the state the unit moved into.');
    if (!isStr(e.at) || !Number.isFinite(Date.parse(e.at))) err(`${p}.at`, 'invalid-value', 'at must be a date such as "2026-10-06"', 'Write the day the unit moved (YYYY-MM-DD).');

    // who moved it
    let kind: 'tool' | 'person' | undefined;
    if (e.by === undefined) {
      if (state && state !== 'published') err(`${p}.by`, 'missing-field', `an entry for "${state}" must say who moved the unit (by)`, 'by is {"kind": "tool", "name"} or {"kind": "person", "name", "competence", "role"}.');
    } else if (!isObj(e.by) || (e.by.kind !== 'tool' && e.by.kind !== 'person')) {
      err(`${p}.by`, 'invalid-value', 'by must be {"kind": "tool" | "person", "name": …}', 'A tool: {"kind": "tool", "name": "ladder drafting agent"}; a person also needs competence and role.');
    } else {
      kind = e.by.kind;
      const by = e.by;
      if (!isStr(by.name)) err(`${p}.by.name`, 'missing-field', 'by.name is required', 'Name the tool or the person. Reviews are never anonymous.');
      if (kind === 'person') {
        if (!(REVIEWER_COMPETENCES as readonly unknown[]).includes(by.competence)) err(`${p}.by.competence`, 'invalid-value', `a person's competence must be one of ${REVIEWER_COMPETENCES.join(', ')}`, 'Say how well the person knows the language.');
        if (!isStr(by.role)) err(`${p}.by.role`, 'missing-field', 'a person needs a role (e.g. "linguistic-reviewer")', 'Say what the person did.');
        if (by.variety !== undefined && !isStr(by.variety)) err(`${p}.by.variety`, 'invalid-value', 'variety must be a non-empty string such as "es-HN"', 'The variety of the language the person speaks, or omit it.');
      }
      for (const k of Object.keys(by)) if (!['kind', 'name', 'competence', 'variety', 'role'].includes(k) && !k.startsWith('_')) add('warning', `${p}.by.${k}`, 'unknown-field', `unknown field "${k}" is ignored`, 'by is {kind, name, competence?, variety?, role?}.');
    }
    if (state && PERSON_ONLY.includes(state) && kind === 'tool') {
      err(`${p}.by`, 'pipeline-tool-cannot-review', `"${state}" is past in-review, and a tool cannot move a unit past in-review`, 'A tool can draft and check; the review, the corrections, the recording and the publication are a person\'s.');
    }

    // checklist, corrections, recordings
    if (e.checklist !== undefined) {
      if (!isObj(e.checklist)) err(`${p}.checklist`, 'invalid-value', 'checklist must be an object with the review items', `Items: ${CHECKLIST_ITEMS.join(', ')}; each {"result": "ok" | "changed" | "problem", "note"?}.`);
      else {
        for (const [k, item] of Object.entries(e.checklist)) {
          if (k.startsWith('_')) continue;
          if (!(CHECKLIST_ITEMS as readonly string[]).includes(k)) { add('warning', `${p}.checklist.${k}`, 'unknown-field', `unknown checklist item "${k}" is ignored`, `Items: ${CHECKLIST_ITEMS.join(', ')}.`); continue; }
          if (!isObj(item) || !(CHECKLIST_RESULTS as readonly unknown[]).includes(item.result) || (item.note !== undefined && typeof item.note !== 'string')) {
            err(`${p}.checklist.${k}`, 'invalid-value', `checklist item "${k}" must be {"result": "ok" | "changed" | "problem", "note"?: string}`, 'Answer every item the reviewer answered; leave out the others.');
          }
        }
      }
    }
    if (e.corrections !== undefined && !(typeof e.corrections === 'number' && Number.isInteger(e.corrections) && e.corrections >= 0)) err(`${p}.corrections`, 'invalid-value', 'corrections must be a whole number (how many sentences the review changed)', 'e.g. 7');
    if (e.recordings !== undefined && !isStr(e.recordings)) err(`${p}.recordings`, 'invalid-value', 'recordings must be a non-empty string saying where the reviewed recording is', 'e.g. "recordings/es-a1-1-01/ (Ana Ruiz, reviewed 2026-10-20)"');
    if (e.contentSignature !== undefined && !isStr(e.contentSignature)) err(`${p}.contentSignature`, 'invalid-value', 'contentSignature must be a non-empty string', 'Written by npm run review:apply.');

    // the order
    if (state) {
      if (i === 0 ? state !== 'machine-draft' : previous !== undefined && !NEXT_STATES[previous].includes(state)) {
        err(`${p}.state`, 'pipeline-illegal-move',
          i === 0 ? `the first entry must be "machine-draft", not "${state}"` : `a unit cannot move from "${previous}" to "${state}"`,
          i === 0 ? 'Every unit starts as a machine draft.' : `From "${previous}" a unit moves to ${NEXT_STATES[previous!].map((s) => `"${s}"`).join(' or ')}. Order: ${PIPELINE_STATES.join(' -> ')}; a correction goes back to in-review.`);
      }
    }
    previous = state;
    last = state;
  });

  if (stateOk && last !== undefined && value.state !== last) {
    err(`${base}.state`, 'pipeline-state-mismatch', `pipeline.state is "${String(value.state)}" but the last history entry is "${last}"`, 'The state is the state of the last history entry; change it by adding an entry (advance), not by editing the state.');
  }
  return out;
}

// ───────────────────────────── advance ─────────────────────────────

export interface PipelineRefusal { code: PipelineProblemCode | 'not-a-document' | 'no-pipeline' | 'invalid-date'; message: string; hint: string }

export interface AdvanceExtra {
  /** YYYY-MM-DD; default today (UTC). */
  at?: string;
  checklist?: PipelineChecklist;
  corrections?: number;
  recordings?: string;
  contentSignature?: string;
}

export type AdvanceResult =
  | { ok: false; refusals: PipelineRefusal[] }
  | { ok: true; doc: CorpusDocument; entry: PipelineEntry };

/**
 * Move a document one step along its pipeline. Pure: returns a new document, the input is never mutated. Refuses an illegal
 * move, a tool recording a state past `in-review`, a document with no pipeline (only `machine-draft` can start one), and any
 * result that would not be a valid pipeline. The text is never touched.
 */
export function advance(doc: unknown, state: PipelineState, by?: PipelineActor, extra: AdvanceExtra = {}): AdvanceResult {
  if (!isObj(doc)) return { ok: false, refusals: [{ code: 'not-a-document', message: 'the input is not a corpus document (one JSON object)', hint: 'Pass a schemaVersion 2 corpus document.' }] };
  const at = extra.at ?? today();
  if (!isCalendarDate(at)) return { ok: false, refusals: [{ code: 'invalid-date', message: `"${at}" is not a date`, hint: 'Write the date as YYYY-MM-DD (a real calendar date).' }] };
  if (!isState(state)) return { ok: false, refusals: [{ code: 'invalid-value', message: `unknown state "${String(state)}"`, hint: `Use one of: ${PIPELINE_STATES.join(', ')}.` }] };
  const existing = doc.pipeline;
  if (existing === undefined && state !== 'machine-draft') {
    return { ok: false, refusals: [{ code: 'no-pipeline', message: `the document has no pipeline block, so it cannot move to "${state}"`, hint: 'Start the pipeline with state "machine-draft" (a tool or person drafting the unit).' }] };
  }
  const entry: PipelineEntry = {
    state, at,
    ...(by ? { by: structuredClone(by) } : {}),
    ...(extra.checklist ? { checklist: structuredClone(extra.checklist) } : {}),
    ...(extra.corrections !== undefined ? { corrections: extra.corrections } : {}),
    ...(extra.recordings !== undefined ? { recordings: extra.recordings } : {}),
    ...(extra.contentSignature !== undefined ? { contentSignature: extra.contentSignature } : {}),
  };
  const history = isObj(existing) && Array.isArray(existing.history) ? [...(structuredClone(existing.history) as PipelineEntry[]), entry] : [entry];
  const pipeline: Pipeline = { state, history };
  const problems = pipelineProblems(pipeline).filter((p) => p.severity === 'error');
  if (problems.length) return { ok: false, refusals: problems.map((p) => ({ code: p.code, message: `${p.path}: ${p.message}`, hint: p.hint })) };
  const next = { ...structuredClone(doc), pipeline } as unknown as CorpusDocument;
  return { ok: true, doc: next, entry };
}

// ───────────────────────────── summary ─────────────────────────────

export interface PipelineSummary {
  hasPipeline: boolean;
  state?: PipelineState;
  /** The latest review by a person, if any. */
  reviewedBy?: string;
  reviewedAt?: string;
  /** How many reviews came back with corrections. */
  correctionRounds: number;
  /** Sentences changed by reviews, all rounds together. */
  correctionsTotal: number;
  correctionsPending: boolean;
  recordings?: string;
  /** Whether the pipeline lets the unit reach learners (the other publication rules still apply). */
  pipelineOpen: boolean;
  /** Plain sentences: what the unit is still waiting for. */
  waitingFor: string[];
  /** One line for a report or a log. */
  line: string;
}

export function pipelineSummary(doc: unknown): PipelineSummary {
  const p = isObj(doc) ? doc.pipeline : undefined;
  if (!isObj(p)) return { hasPipeline: false, correctionRounds: 0, correctionsTotal: 0, correctionsPending: false, pipelineOpen: true, waitingFor: [], line: 'no pipeline (the ordinary review rules apply)' };
  const history = (Array.isArray(p.history) ? p.history : []).filter(isObj) as unknown as PipelineEntry[];
  const state = isState(p.state) ? p.state : undefined;
  const lastReviewed = history.map((e, i) => (e.state === 'reviewed' && e.by?.kind === 'person' ? i : -1)).filter((i) => i >= 0).pop();
  const reviewed = lastReviewed === undefined ? undefined : history[lastReviewed];
  const rounds = history.filter((e) => e.state === 'corrections-pending');
  const waitingFor = pipelineHoldReasons(p, contentSignatureOf(doc));
  const recordings = [...history].reverse().find((e) => e.state === 'audio-ready' && isStr(e.recordings))?.recordings;
  const correctionsPending = history.some((e, i) => e.state === 'corrections-pending' && i > (lastReviewed ?? -1));
  return {
    hasPipeline: true,
    ...(state ? { state } : {}),
    ...(reviewed?.by?.kind === 'person' ? { reviewedBy: reviewed.by.name } : {}),
    ...(reviewed ? { reviewedAt: reviewed.at } : {}),
    correctionRounds: rounds.length,
    correctionsTotal: history.reduce((n, e) => n + (typeof e.corrections === 'number' ? e.corrections : 0), 0),
    correctionsPending,
    ...(recordings ? { recordings } : {}),
    pipelineOpen: waitingFor.length === 0,
    waitingFor,
    line: `${state ?? 'unknown state'}${reviewed?.by?.kind === 'person' ? `, reviewed by ${reviewed.by.name} on ${reviewed.at}` : ''}${waitingFor.length ? ` - ${waitingFor.join('; ')}` : ' - open for learners'}`,
  };
}

// ───────────────────────────── sentences ─────────────────────────────

export type Segmenter = (text: string) => Array<{ start: number; end: number; text: string }>;

export interface SentenceRef {
  /** 1-based, in reading order across the whole document. */
  n: number;
  text: string;
  english?: string;
  /** Display name of the speaker, when the document names one. */
  speaker?: string;
  section: number;
  paragraph: number;
}

/** The sentences of a document in reading order, numbered from 1: declared sentences as given, raw paragraphs as the adapter splits them (as `planDocument` does). */
export function listSentences(doc: CorpusDocument, segment: Segmenter): SentenceRef[] {
  const out: SentenceRef[] = [];
  doc.sections.forEach((sec, si) => {
    sec.paragraphs.forEach((par, pi) => {
      if ('sentences' in par) {
        for (const s of par.sentences) {
          out.push({ n: out.length + 1, text: s.text, ...(s.english ? { english: s.english } : {}), ...(s.speaker ? { speaker: doc.speakers?.[s.speaker] ?? s.speaker } : {}), section: si, paragraph: pi });
        }
      } else {
        segment(par.text).forEach((sp, k) => out.push({ n: out.length + 1, text: sp.text, ...(par.english?.[k] ? { english: par.english[k] } : {}), section: si, paragraph: pi }));
      }
    });
  });
  return out;
}

// ───────────────────────────── the return file ─────────────────────────────

export interface ReturnCorrection { sentence: number; replacement: string; note?: string }

/** A checked reviewer return (see `parseReturn`). */
export interface ParsedReturn {
  unitId?: string;
  unitPath?: string;
  /** The wording signature of the unit the reviewer saw. */
  unitSignature?: string;
  reviewer: { name: string; competence: ReviewerCompetence; variety?: string; role: string };
  /** YYYY-MM-DD, when the reviewer gave one. */
  date?: string;
  /** The sentences as the reviewer saw them, by number. */
  sentences?: Array<{ n: number; text: string }>;
  corrections: ReturnCorrection[];
  /** The checklist items the reviewer answered. */
  checklist: PipelineChecklist;
  /** The items left blank. */
  blank: ChecklistItem[];
}

export type ReturnRefusalCode =
  | 'not-a-return' | 'reviewer-missing' | 'reviewer-not-a-person' | 'reviewer-name-missing' | 'reviewer-competence-missing' | 'reviewer-competence-invalid'
  | 'invalid-date' | 'invalid-correction' | 'duplicate-correction' | 'invalid-checklist'
  | 'wrong-unit' | 'stale-return' | 'sentence-out-of-range' | 'sentence-count-changed' | 'checklist-incomplete' | 'checklist-problem-unresolved' | 'nothing-to-do'
  | PipelineRefusal['code'];

export interface ReturnRefusal { code: ReturnRefusalCode; message: string; hint: string }

const blankChecklist = (): Record<ChecklistItem, null> => Object.fromEntries(CHECKLIST_ITEMS.map((k) => [k, null])) as Record<ChecklistItem, null>;

/** Check the shape of a return file. A return is a person's: a name and a competence are required, or the return is refused. */
export function parseReturn(raw: unknown): { ok: true; value: ParsedReturn } | { ok: false; refusals: ReturnRefusal[] } {
  const refusals: ReturnRefusal[] = [];
  const refuse = (code: ReturnRefusalCode, message: string, hint: string) => refusals.push({ code, message, hint });
  if (!isObj(raw)) return { ok: false, refusals: [{ code: 'not-a-return', message: 'the return is not a JSON object', hint: 'Pass the <unit>.return.json written by npm run review:packet, filled in by the reviewer.' }] };

  const r = raw.reviewer;
  let reviewer: ParsedReturn['reviewer'] | undefined;
  if (!isObj(r)) refuse('reviewer-missing', 'the return has no reviewer', 'Fill in the "reviewer" block: name, competence, variety, role.');
  else {
    if (r.kind !== undefined && r.kind !== 'person') refuse('reviewer-not-a-person', `the reviewer is a "${String(r.kind)}": only a person can review a unit`, 'A tool can draft and check a unit; it can never move it past in-review.');
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) refuse('reviewer-name-missing', 'the reviewer has no name', 'Reviews are never anonymous: write the reviewer\'s name in reviewer.name.');
    const comp = typeof r.competence === 'string' ? r.competence.trim().toLowerCase() : '';
    if (!comp) refuse('reviewer-competence-missing', 'the reviewer gives no competence', `Say how well the reviewer knows the language: ${REVIEWER_COMPETENCES.join(', ')}.`);
    else if (!(REVIEWER_COMPETENCES as readonly string[]).includes(comp)) refuse('reviewer-competence-invalid', `competence "${comp}" is not one of ${REVIEWER_COMPETENCES.join(', ')}`, 'Use one of the three words exactly.');
    const variety = typeof r.variety === 'string' ? r.variety.trim() : '';
    const role = typeof r.role === 'string' && r.role.trim() ? r.role.trim() : DEFAULT_REVIEWER_ROLE;
    if (name && (REVIEWER_COMPETENCES as readonly string[]).includes(comp) && refusals.length === 0) {
      reviewer = { name, competence: comp as ReviewerCompetence, ...(variety ? { variety } : {}), role };
    }
  }

  let date: string | undefined;
  if (raw.date !== undefined && raw.date !== null && raw.date !== '') {
    if (!isCalendarDate(raw.date)) refuse('invalid-date', `"${String(raw.date)}" is not a date`, 'Write the date as YYYY-MM-DD, or leave it empty for today.');
    else date = raw.date;
  }

  const corrections: ReturnCorrection[] = [];
  if (raw.corrections !== undefined && !Array.isArray(raw.corrections)) refuse('invalid-correction', 'corrections must be a list', 'Each correction is {"sentence": 3, "replacement": "the whole sentence as it should be", "note": "why"}.');
  else {
    const seen = new Set<number>();
    ((raw.corrections as unknown[] | undefined) ?? []).forEach((c, i) => {
      if (!isObj(c) || typeof c.sentence !== 'number' || !Number.isInteger(c.sentence) || c.sentence < 1 || typeof c.replacement !== 'string' || !c.replacement.trim() || (c.note !== undefined && typeof c.note !== 'string')) {
        refuse('invalid-correction', `corrections[${i}] is not {"sentence": n, "replacement": "…", "note"?}`, 'sentence is the number shown in the packet; replacement is the whole sentence as it should read.');
        return;
      }
      if (seen.has(c.sentence)) { refuse('duplicate-correction', `sentence ${c.sentence} is corrected more than once`, 'Give one replacement per sentence.'); return; }
      seen.add(c.sentence);
      corrections.push({ sentence: c.sentence, replacement: c.replacement.trim(), ...(isStr(c.note) ? { note: c.note.trim() } : {}) });
    });
  }

  const checklist: PipelineChecklist = {};
  const blank: ChecklistItem[] = [];
  if (raw.checklist !== undefined && raw.checklist !== null && !isObj(raw.checklist)) refuse('invalid-checklist', 'checklist must be an object', `Items: ${CHECKLIST_ITEMS.join(', ')}.`);
  else {
    const given = (raw.checklist ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(given)) if (!k.startsWith('_') && !(CHECKLIST_ITEMS as readonly string[]).includes(k)) refuse('invalid-checklist', `unknown checklist item "${k}"`, `Items: ${CHECKLIST_ITEMS.join(', ')}.`);
    for (const item of CHECKLIST_ITEMS) {
      const v = given[item];
      if (v === undefined || v === null || v === '') { blank.push(item); continue; }
      const result = typeof v === 'string' ? v.trim().toLowerCase() : isObj(v) && typeof v.result === 'string' ? v.result.trim().toLowerCase() : '';
      const note = isObj(v) && typeof v.note === 'string' ? v.note.trim() : '';
      if (!(CHECKLIST_RESULTS as readonly string[]).includes(result)) { refuse('invalid-checklist', `checklist item "${item}" must be ok, changed or problem`, 'Answer {"result": "ok" | "changed" | "problem", "note": "…"}, or leave it null.'); continue; }
      checklist[item] = { result: result as ChecklistResult, ...(note ? { note } : {}) };
    }
  }

  const unit = isObj(raw.unit) ? raw.unit : {};
  let sentences: ParsedReturn['sentences'];
  if (Array.isArray(raw.sentences)) {
    sentences = [];
    for (const s of raw.sentences) if (isObj(s) && typeof s.n === 'number' && typeof s.text === 'string') sentences.push({ n: s.n, text: s.text });
  }
  if (refusals.length || !reviewer) return { ok: false, refusals };
  return {
    ok: true,
    value: {
      ...(isStr(unit.id) ? { unitId: unit.id } : {}), ...(isStr(unit.path) ? { unitPath: unit.path } : {}), ...(isStr(unit.contentSignature) ? { unitSignature: unit.contentSignature } : {}),
      reviewer, ...(date ? { date } : {}), ...(sentences ? { sentences } : {}), corrections, checklist, blank,
    },
  };
}

// ───────────────────────────── applying a return ─────────────────────────────

export interface AppliedChange {
  n: number;
  before: string;
  after: string;
  note?: string;
  /** Analysis attached to the old wording that was dropped with it ("spans (3)", "notes anchored to words (1)"). */
  dropped: string[];
  /** The English rescue line was kept: it may need the same correction. */
  englishKept: boolean;
}

export type ApplyResult =
  | { ok: false; refusals: ReturnRefusal[] }
  | {
    ok: true;
    doc: CorpusDocument;
    previousState: PipelineState;
    state: PipelineState;
    /** The history entries appended, in order. */
    entries: PipelineEntry[];
    changes: AppliedChange[];
    /** Sentence numbers whose replacement was identical to the text (nothing changed). */
    ignored: number[];
    warnings: string[];
  };

/**
 * Record a reviewer's return on a document. Pure: returns a new document; only the replaced sentences differ (every other
 * sentence, paragraph and field is byte-identical). History: `in-review` (when the unit is not already there) then
 * `corrections-pending` (the return changed something) or `reviewed` (it changed nothing; a unit with corrections pending
 * goes straight to `reviewed`). Signing a unit off as `reviewed` needs all eight checklist items answered and none left
 * at "problem". The reviewer must have seen the unit as it stands: a stale return is refused.
 */
export function applyReturn(doc: CorpusDocument, ret: ParsedReturn, opts: { segment: Segmenter; at?: string }): ApplyResult {
  const refusals: ReturnRefusal[] = [];
  const refuse = (code: ReturnRefusalCode, message: string, hint: string) => refusals.push({ code, message, hint });
  const warnings: string[] = [];
  const at = ret.date ?? opts.at ?? today();

  if (!isObj(doc.pipeline)) {
    return { ok: false, refusals: [{ code: 'no-pipeline', message: 'the unit has no pipeline block', hint: 'A ladder unit carries "pipeline": {"state": "machine-draft", "history": […]} (docs/LADDER.md).' }] };
  }
  const probs = pipelineProblems(doc.pipeline).filter((p) => p.severity === 'error');
  if (probs.length) return { ok: false, refusals: probs.map((p) => ({ code: p.code, message: `the unit's pipeline is not valid - ${p.path}: ${p.message}`, hint: p.hint })) };
  const previousState = doc.pipeline.state;

  if (ret.unitId !== undefined && ret.unitId !== doc.id) refuse('wrong-unit', `this return is for unit "${ret.unitId}", not "${doc.id}"`, 'Apply a return to the unit its packet was made from.');
  const signature = contentSignatureOf(doc);
  const current = listSentences(doc, opts.segment);
  if (ret.unitSignature !== undefined) {
    if (ret.unitSignature !== signature) refuse('stale-return', 'the unit has changed since this packet was made, so the reviewer did not see its present wording', 'Make a fresh packet (npm run review:packet) and send that: the reviewer must read the unit as it stands now.');
  } else if (ret.sentences) {
    const same = ret.sentences.length === current.length && ret.sentences.every((s, i) => s.n === current[i].n && s.text === current[i].text);
    if (!same) refuse('stale-return', 'the sentences in this return are not the unit\'s present sentences', 'Make a fresh packet (npm run review:packet) and send that.');
  } else warnings.push('the return does not say which wording the reviewer saw (no unit.contentSignature and no sentences); it is applied as given');

  for (const c of ret.corrections) {
    if (c.sentence > current.length) refuse('sentence-out-of-range', `sentence ${c.sentence} does not exist (the unit has ${current.length})`, 'Use the numbers shown in the packet.');
  }
  if (refusals.length) return { ok: false, refusals };

  // ── the corrections: only the replaced sentences change ──
  const edits = new Map(ret.corrections.map((c) => [c.sentence, c]));
  const next = structuredClone(doc);
  const changes: AppliedChange[] = [];
  const ignored: number[] = [];
  let n = 0;
  for (const sec of next.sections) {
    for (const par of sec.paragraphs) {
      if ('sentences' in par) {
        for (const s of par.sentences) {
          n++;
          const c = edits.get(n);
          if (!c) continue;
          if (c.replacement === s.text) { ignored.push(n); continue; }
          changes.push({ n, before: s.text, after: c.replacement, ...(c.note ? { note: c.note } : {}), dropped: dropStaleAnalysis(s), englishKept: s.english !== undefined });
          s.text = c.replacement;
        }
      } else {
        const segs = opts.segment(par.text);
        const mine = segs.map((sp, k) => ({ sp, c: edits.get(n + k + 1), k })).filter((x) => x.c !== undefined && x.c.replacement !== x.sp.text);
        for (const [k, sp] of segs.entries()) { const c = edits.get(n + k + 1); if (c && c.replacement === sp.text) ignored.push(n + k + 1); }
        let text = par.text;
        for (const { sp, c, k } of [...mine].sort((a, b) => b.sp.start - a.sp.start)) {
          text = text.slice(0, sp.start) + c!.replacement + text.slice(sp.end);
          changes.push({ n: n + k + 1, before: sp.text, after: c!.replacement, ...(c!.note ? { note: c!.note } : {}), dropped: [], englishKept: par.english?.[k] !== undefined });
        }
        if (mine.length) {
          if (opts.segment(text).length !== segs.length) {
            refuse('sentence-count-changed', `a replacement changes how this paragraph splits into sentences (${segs.length} before, ${opts.segment(text).length} after)`,
              'Keep each replacement to one sentence, or ask for the paragraph to be declared sentence by sentence.');
          }
          par.text = text;
        }
        n += segs.length;
      }
    }
  }
  if (refusals.length) return { ok: false, refusals };
  changes.sort((a, b) => a.n - b.n);
  ignored.sort((a, b) => a - b);
  if (ignored.length) warnings.push(`the replacement for sentence${ignored.length > 1 ? 's' : ''} ${ignored.join(', ')} is the same as the text: nothing changed there`);
  if (changes.some((c) => c.englishKept)) warnings.push('English rescue lines were kept as they were: check that they still match the corrected sentences');
  if (changes.length && (previousState === 'audio-ready' || previousState === 'published')) warnings.push('the wording changed after the recording was reviewed: the recording no longer matches and must be redone');

  // ── what this return means for the state ──
  const reviewing = changes.length === 0;
  if (reviewing) {
    if (previousState === 'reviewed' || previousState === 'audio-ready' || previousState === 'published') {
      return { ok: false, refusals: [{ code: 'nothing-to-do', message: `the unit is already "${previousState}" and this return changes nothing`, hint: 'A return with corrections sends a unit back to review; a return without any has nothing to record.' }] };
    }
    const unanswered = ret.blank;
    if (unanswered.length) refuse('checklist-incomplete', `a review cannot be signed off with the checklist unanswered (blank: ${unanswered.join(', ')})`, 'Answer every item (ok / changed / problem), or send corrections instead.');
    const problems = CHECKLIST_ITEMS.filter((k) => ret.checklist[k]?.result === 'problem');
    if (problems.length) refuse('checklist-problem-unresolved', `no corrections were sent but ${problems.join(', ')} ${problems.length > 1 ? 'are' : 'is'} marked "problem"`, 'Send the corrections that solve it, or mark the item "ok" or "changed".');
  } else if (ret.blank.length) warnings.push(`checklist items left blank: ${ret.blank.join(', ')}`);
  if (refusals.length) return { ok: false, refusals };

  const by: PipelineActor = { kind: 'person', ...ret.reviewer };
  const checklist = Object.keys(ret.checklist).length ? ret.checklist : undefined;
  const steps: Array<{ state: PipelineState; extra: AdvanceExtra }> = [];
  const wasReviewing = previousState === 'in-review';
  if (reviewing && previousState === 'corrections-pending') steps.push({ state: 'reviewed', extra: { checklist, contentSignature: signature } });
  else {
    if (!wasReviewing) steps.push({ state: 'in-review', extra: {} });
    steps.push(reviewing
      ? { state: 'reviewed', extra: { checklist, contentSignature: signature } }
      : { state: 'corrections-pending', extra: { checklist, corrections: changes.length } });
  }

  let out: CorpusDocument = next;
  const entries: PipelineEntry[] = [];
  for (const step of steps) {
    const r = advance(out, step.state, by, { at, ...(step.extra.checklist ? { checklist: step.extra.checklist } : {}), ...(step.extra.corrections !== undefined ? { corrections: step.extra.corrections } : {}), ...(step.extra.contentSignature ? { contentSignature: step.extra.contentSignature } : {}) });
    if (!r.ok) return { ok: false, refusals: r.refusals };
    out = r.doc;
    entries.push(r.entry);
  }
  // `reviewed` signs off the wording the reviewer saw; with no corrections that is the present wording
  return { ok: true, doc: out, previousState, state: out.pipeline!.state, entries, changes, ignored, warnings };
}

/** A declared sentence's analysis belongs to its old wording: spans, corrections and word-anchored notes are dropped when the text is replaced. */
function dropStaleAnalysis(s: DocSentence): string[] {
  const dropped: string[] = [];
  if (s.spans?.length) { dropped.push(`spans (${s.spans.length})`); delete s.spans; }
  if (s.corrections?.length) { dropped.push(`analysis corrections (${s.corrections.length})`); delete s.corrections; }
  if (s.notes?.length) {
    const kept = s.notes.filter((x) => x.start === undefined && x.end === undefined && !x.spans);
    if (kept.length !== s.notes.length) dropped.push(`notes anchored to words (${s.notes.length - kept.length})`);
    if (kept.length) s.notes = kept; else delete s.notes;
  }
  return dropped;
}

// ───────────────────────────── the packet ─────────────────────────────

export interface ReviewPacket {
  html: string;
  /** The `<unit>.return.json` template (JSON-serialisable). */
  returnTemplate: Record<string, unknown>;
  sentences: SentenceRef[];
  /** `<unit id>.packet.html` / `<unit id>.return.json`. */
  htmlName: string;
  returnName: string;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The printable packet for a reviewer and the return template. `unitPath` is stored in the return so `review:apply` can find the unit. */
export function buildReviewPacket(doc: CorpusDocument, opts: { segment: Segmenter; unitPath?: string; date?: string }): ReviewPacket {
  const sentences = listSentences(doc, opts.segment);
  const signature = contentSignatureOf(doc);
  const date = opts.date ?? today();
  const language = LANGUAGE_ROWS.find((r) => r.id === doc.lang)?.name ?? doc.lang;
  const variety = doc.variety ?? doc.locale ?? doc.lang;
  const state = isObj(doc.pipeline) && isState(doc.pipeline.state) ? doc.pipeline.state : undefined;
  const htmlName = `${doc.id}.packet.html`;
  const returnName = `${doc.id}.return.json`;

  const returnTemplate: Record<string, unknown> = {
    format: RETURN_FORMAT,
    _help: 'Fill in "reviewer" (name and competence are required), answer each checklist item {"result": "ok" | "changed" | "problem", "note": "…"}, and list every sentence you change under "corrections" as {"sentence": 3, "replacement": "the whole sentence as it should read", "note": "why"}. Leave "sentences" and "unit" as they are.',
    unit: { id: doc.id, lang: doc.lang, title: doc.title, ...(variety ? { variety } : {}), ...(opts.unitPath ? { path: opts.unitPath } : {}), contentSignature: signature },
    reviewer: { name: '', competence: '', variety: '', role: DEFAULT_REVIEWER_ROLE, _competence: REVIEWER_COMPETENCES.join(' | ') },
    date: '',
    sentences: sentences.map((s) => ({ n: s.n, text: s.text })),
    corrections: [],
    checklist: blankChecklist(),
    notes: '',
  };

  const boxes = (labels: string[]) => labels.map((l) => `<span class="box"><span class="sq"></span>${esc(l)}</span>`).join(' ');
  const guide = CHECKLIST_GUIDE.map((g, i) => `
      <div class="item">
        <h3>${i + 1}. ${esc(g.title)}</h3>
        <p class="q">${esc(g.item === 'dialect' ? `${g.question} (${variety})` : g.question)}</p>
        <p class="help">${esc(g.explanation)}</p>
        <p class="mark">${boxes(['All fine', 'I changed something', 'There is a problem'])}</p>
        <div class="lines short"></div>
      </div>`).join('');

  let body = '';
  let lastSection = -1;
  let lastParagraph = -1;
  for (const s of sentences) {
    const sec = doc.sections[s.section];
    if (s.section !== lastSection && sec?.title) body += `<h3 class="sec">${esc(sec.title)}</h3>`;
    const gap = s.section === lastSection && s.paragraph !== lastParagraph ? ' newpar' : '';
    lastSection = s.section;
    lastParagraph = s.paragraph;
    body += `
      <div class="sentence${gap}">
        <div class="num">${s.n}</div>
        <div class="main">
          <p class="text">${s.speaker ? `<span class="who">${esc(s.speaker)}:</span> ` : ''}${esc(s.text)}</p>
          ${s.english ? `<p class="en">English line shown to learners: ${esc(s.english)}</p>` : ''}
          <div class="fix"><span class="fixlabel">Correction - write the whole sentence as it should read:</span><div class="lines"></div></div>
        </div>
      </div>`;
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review packet - ${esc(doc.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 15px/1.5 Georgia, 'Times New Roman', serif; color: #1a1a1a; background: #fff; margin: 0 auto; padding: 24px; max-width: 820px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 28px 0 8px; border-bottom: 2px solid #1a1a1a; padding-bottom: 4px; }
  h3 { font-size: 15px; margin: 0 0 2px; }
  h3.sec { margin: 18px 0 6px; font-style: italic; }
  p { margin: 4px 0; }
  .meta { color: #444; margin: 0 0 12px; }
  .meta b { color: #1a1a1a; }
  .how { background: #f4f1ea; border: 1px solid #cfc8b8; padding: 10px 14px; border-radius: 4px; }
  .how ol { margin: 4px 0 0 18px; padding: 0; }
  .item { border: 1px solid #bbb; border-radius: 4px; padding: 8px 12px; margin: 8px 0; break-inside: avoid; }
  .q { font-weight: bold; }
  .help { color: #444; font-size: 14px; }
  .mark { margin-top: 6px; }
  .box { margin-right: 14px; white-space: nowrap; }
  .sq { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #1a1a1a; margin-right: 5px; vertical-align: -2px; }
  .lines { height: 54px; margin-top: 4px; background: repeating-linear-gradient(to bottom, transparent 0, transparent 26px, #999 26px, #999 27px); }
  .lines.short { height: 28px; background: repeating-linear-gradient(to bottom, transparent 0, transparent 26px, #999 26px, #999 27px); }
  .sentence { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #ddd; break-inside: avoid; }
  .sentence.newpar { margin-top: 10px; }
  .num { flex: 0 0 34px; font: bold 16px/1.4 Arial, sans-serif; color: #fff; background: #1a1a1a; border-radius: 3px; text-align: center; height: 24px; padding-top: 1px; }
  .main { flex: 1; }
  .text { font-size: 18px; }
  .who { font-weight: bold; }
  .en { color: #666; font-size: 13px; }
  .fixlabel { color: #555; font-size: 12px; font-family: Arial, sans-serif; }
  .details td { padding: 8px 6px 8px 0; vertical-align: bottom; }
  .details .blank { border-bottom: 1px solid #1a1a1a; min-width: 300px; height: 26px; }
  .foot { color: #555; font-size: 13px; margin-top: 18px; }
  @media print { body { padding: 0; max-width: none; font-size: 13px; } h2 { break-after: avoid; } .how { background: #fff; } }
</style>
</head>
<body>
<h1>${esc(doc.title)}</h1>
<p class="meta"><b>Language:</b> ${esc(language)} (${esc(doc.lang)}) &nbsp; <b>Variety:</b> ${esc(variety)} &nbsp; <b>Unit:</b> ${esc(doc.id)} &nbsp; <b>Sentences:</b> ${sentences.length}${state ? ` &nbsp; <b>State:</b> ${esc(state)}` : ''} &nbsp; <b>Packet made:</b> ${esc(date)}</p>

<div class="how">
  <b>What you are asked to do</b>
  <ol>
    <li>Read every numbered sentence below as a native speaker would, aloud if you can.</li>
    <li>When a sentence should read differently, write the whole corrected sentence in the lines under it.</li>
    <li>Answer the eight questions on the last pages, then fill in your details.</li>
    <li>Send the paper back (a clear photo is fine) or fill in <code>${esc(returnName)}</code> instead: the same corrections, as text.</li>
  </ol>
</div>

<h2>The sentences</h2>
${body}

<h2>The eight questions</h2>
<p class="help">For each question, tick one box. Add a few words where something needs saying.</p>
${guide}

<h2>Your details</h2>
<table class="details">
  <tr><td>Your name</td><td class="blank"></td></tr>
  <tr><td>How well you know the language</td><td>${boxes(['Native speaker', 'Near-native', 'Professional (a translator, teacher or linguist)'])}</td></tr>
  <tr><td>The variety you speak (for example Honduran Spanish)</td><td class="blank"></td></tr>
  <tr><td>Your role (usually: linguistic reviewer)</td><td class="blank"></td></tr>
  <tr><td>Date</td><td class="blank"></td></tr>
  <tr><td>Signature</td><td class="blank"></td></tr>
</table>
<p class="foot">Unit <b>${esc(doc.id)}</b> - wording ${esc(signature.slice(0, 8))}. Your corrections are applied sentence by sentence; nothing else in the unit changes.</p>
</body>
</html>
`;
  return { html, returnTemplate, sentences, htmlName, returnName };
}
