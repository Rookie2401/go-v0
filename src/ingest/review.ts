/**
 * The review step of the import workflow (docs/IMPORT.md §4): record WHO checked a document and WHEN in its `review`
 * block, and drop the `needs-native-review` editorial tag once the review is positive. Pure: it returns a new
 * document and never touches a sentence, a paragraph, a source or any other text — only `review` and `editorialTags`.
 * The CLI (`npm run corpus:review`) and the in-app importer are thin wrappers around it.
 */
import type { ReviewStatus } from '../core';
import { REVIEW_OK } from '../core';
import type { CorpusDocument, DocReview } from './format';
import { computePublished, contentSignatureOf, type PublicationDecision } from './publish';

export const REVIEW_STATUSES: readonly ReviewStatus[] = ['reviewed', 'approved', 'in-review', 'rejected'];
export const NEEDS_REVIEW_TAG = 'needs-native-review';

export interface ReviewOptions {
  /** The named reviewer (a person, or a verification tool). Required; never invented. */
  by?: string;
  /** Default `reviewed`. */
  status?: ReviewStatus | string;
  /** YYYY-MM-DD; default today (UTC). */
  date?: string;
  notes?: string;
}

export type ReviewRefusalCode =
  | 'not-a-document' | 'missing-reviewer' | 'invalid-status' | 'invalid-date' | 'scripture-unverified';

export interface ReviewRefusal { code: ReviewRefusalCode; message: string; hint: string }

export type ReviewResult =
  | { ok: false; refusals: ReviewRefusal[] }
  | {
    ok: true;
    /** A new document (the input is never mutated). */
    doc: CorpusDocument;
    previous: DocReview | undefined;
    review: DocReview;
    removedTags: string[];
    /** Whether the reviewed document would now be published, and the remaining reasons if not. */
    decision: PublicationDecision;
  };

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** The scripture verification fields the publication gate needs (`computePublished` reads the same four). */
function scriptureVerified(doc: Record<string, unknown>): boolean {
  const sc = doc.scripture;
  const v = isObj(sc) ? sc.verification : undefined;
  return isObj(v) && nonEmpty(v.against) && nonEmpty(v.checkedAt) && nonEmpty(v.by) && nonEmpty(v.method);
}

export function applyReview(doc: unknown, opts: ReviewOptions): ReviewResult {
  const refusals: ReviewRefusal[] = [];
  if (!isObj(doc)) {
    return { ok: false, refusals: [{ code: 'not-a-document', message: 'the input is not a corpus document (one JSON object)', hint: 'Pass the path of a schemaVersion 2 corpus file.' }] };
  }
  const by = typeof opts.by === 'string' ? opts.by.trim() : '';
  if (!by) {
    refusals.push({ code: 'missing-reviewer', message: 'a review needs a named reviewer', hint: 'Pass --by "<name>" (a person, or a verification tool). Reviews are never anonymous and never invented.' });
  }
  const status = (opts.status === undefined ? 'reviewed' : opts.status) as ReviewStatus;
  if (!REVIEW_STATUSES.includes(status)) {
    refusals.push({ code: 'invalid-status', message: `unknown review status "${String(opts.status)}"`, hint: `Use one of: ${REVIEW_STATUSES.join(', ')}.` });
  }
  const date = opts.date === undefined ? todayIso() : opts.date;
  if (!isIsoDate(date)) {
    refusals.push({ code: 'invalid-date', message: `"${String(opts.date)}" is not a date`, hint: 'Write the review date as YYYY-MM-DD (a real calendar date).' });
  }
  if (doc.contentType === 'scripture' && !scriptureVerified(doc)) {
    refusals.push({
      code: 'scripture-unverified',
      message: 'this Scripture has no complete scripture.verification',
      hint: 'Verification is a separate step: run `node scripts/verify-scripture.mjs` (or proofread against a published source) and record scripture.verification {against, checkedAt, method, by} first; then review.',
    });
  }
  if (refusals.length) return { ok: false, refusals };

  const next = structuredClone(doc) as unknown as CorpusDocument;
  const previous = isObj(doc.review) ? (structuredClone(doc.review) as unknown as DocReview) : undefined;
  const review: DocReview = { status, reviewedBy: by, reviewedAt: date, contentSignature: contentSignatureOf(doc) };
  if (nonEmpty(opts.notes)) review.notes = opts.notes.trim();
  next.review = review; // assigned in place: an existing `review` key keeps its position in the file

  let removedTags: string[] = [];
  if ((REVIEW_OK as readonly string[]).includes(status) && Array.isArray(next.editorialTags)) {
    removedTags = next.editorialTags.filter((t) => t === NEEDS_REVIEW_TAG);
    next.editorialTags = next.editorialTags.filter((t) => t !== NEEDS_REVIEW_TAG);
  }
  return { ok: true, doc: next, previous, review, removedTags, decision: computePublished(next) };
}
