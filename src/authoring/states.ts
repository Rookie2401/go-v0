/**
 * Controlled-text authoring tools, part 4: the states a course-written text goes through,
 *
 *   DRAFT → AUTO_VALIDATED → NEEDS_NATIVE_REVIEW → NATIVE_REVIEWED → APPROVED        (or REJECTED)
 *
 * derived from fields a document already has (`review`, `editorialTags`): no format change. A review is believed only
 * when it names a person and a date; a claim of "reviewed" or "approved" without them returns the state that can be
 * vouched for, plus a `problem`. The same holds for a language check ('linguistic-check') of machine-drafted text,
 * which is not a native speaker's review (the publication gate in src/ingest says the same). These functions only
 * READ: nothing here writes a tag or a status; a person, or `npm run corpus:review`, does that.
 */
import type { CorpusDocument } from '../ingest/format';

export type AuthoringState = 'DRAFT' | 'AUTO_VALIDATED' | 'NEEDS_NATIVE_REVIEW' | 'NATIVE_REVIEWED' | 'APPROVED' | 'REJECTED';

export const AUTHORING_STATES: readonly AuthoringState[] = ['DRAFT', 'AUTO_VALIDATED', 'NEEDS_NATIVE_REVIEW', 'NATIVE_REVIEWED', 'APPROVED', 'REJECTED'];

export const TAG_AUTO_VALIDATED = 'auto-validated';
export const TAG_NEEDS_NATIVE_REVIEW = 'needs-native-review';

export type StateDoc = Pick<CorpusDocument, 'editorialTags'> & {
  review?: Partial<CorpusDocument['review']>;
  generated?: boolean;
  source?: { authorship?: string };
};

export interface StateResult { state: AuthoringState; problem?: string }

const named = (s: string | undefined): boolean => typeof s === 'string' && s.trim().length > 0;

export function authoringState(doc: StateDoc): StateResult {
  const review = doc.review ?? {};
  const tags = Array.isArray(doc.editorialTags) ? doc.editorialTags : [];
  if (review.status === 'rejected') return { state: 'REJECTED' };

  let problem: string | undefined;
  if (review.status === 'reviewed' || review.status === 'approved') {
    const generated = doc.generated === true || doc.source?.authorship === 'generated';
    if (!named(review.reviewedBy) || !named(review.reviewedAt)) {
      problem = `review.status is "${review.status}" but ${!named(review.reviewedBy) ? 'no reviewer is named' : 'no review date is given'}${!named(review.reviewedBy) && !named(review.reviewedAt) ? ' and no date is given' : ''}; the review is not believed`;
    } else if (review.level === 'linguistic-check' && generated) {
      problem = `the review by ${review.reviewedBy} is a language check, not a native speaker's review; machine-drafted text still needs a native reader`;
    } else {
      return { state: review.status === 'approved' ? 'APPROVED' : 'NATIVE_REVIEWED' };
    }
  }

  const auto = tags.includes(TAG_AUTO_VALIDATED);
  const state: AuthoringState = auto ? (tags.includes(TAG_NEEDS_NATIVE_REVIEW) ? 'NEEDS_NATIVE_REVIEW' : 'AUTO_VALIDATED') : 'DRAFT';
  return problem ? { state, problem } : { state };
}

/** True only for NATIVE_REVIEWED and APPROVED. Mirrors the publication gate for reports; the gate (src/ingest) decides. */
export const mayShowToLearners = (state: AuthoringState): boolean => state === 'NATIVE_REVIEWED' || state === 'APPROVED';

export function stateCounts(docs: readonly StateDoc[]): Record<AuthoringState, number> {
  const out = Object.fromEntries(AUTHORING_STATES.map((s) => [s, 0])) as Record<AuthoringState, number>;
  for (const d of docs) out[authoringState(d).state]++;
  return out;
}
