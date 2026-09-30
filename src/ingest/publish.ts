/**
 * The publication gate (evidence policy v2, rule 8). A text reaches normal learner use only when it is
 * `published`; everything else is reachable only in the explicitly marked preview mode.
 *
 *   published  ⇔  review.status ∈ {reviewed, approved} with a named reviewer
 *              ∧  rights established (not "unverified")
 *              ∧  for Scripture: translation identity + edition + a complete SourceVerification, never generated
 *
 * Every failed condition contributes one actionable sentence to `unpublishedReasons`.
 */
import { REVIEW_OK } from '../core';
import type { CorpusDocument } from './format';

export interface PublicationDecision {
  published: boolean;
  unpublishedReasons: string[];
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** Tolerant of a partially valid document: missing pieces simply count as "not established". */
export function computePublished(doc: Pick<CorpusDocument, 'contentType' | 'review' | 'source' | 'generated' | 'scripture'> | Record<string, unknown>): PublicationDecision {
  const d = doc as Partial<CorpusDocument>;
  const reasons: string[] = [];

  const status = d.review?.status;
  if (!status || !(REVIEW_OK as readonly string[]).includes(status)) {
    reasons.push(
      status === 'rejected'
        ? 'review was rejected — fix the text and record a new review'
        : d.generated === true || d.source?.authorship === 'generated'
          ? `review status is "${status ?? 'missing'}" — machine-drafted text needs a native-speaker review (set review.status to "reviewed" with reviewedBy and reviewedAt)`
          : `review status is "${status ?? 'missing'}" — needs a review (set review.status to "reviewed" with reviewedBy and reviewedAt)`,
    );
  } else if (!nonEmpty(d.review?.reviewedBy)) {
    reasons.push('the review names no reviewer — set review.reviewedBy');
  }

  const rights = d.source?.rights;
  if (rights === 'unverified' || !rights) {
    reasons.push('rights are unverified — replace the text with a licensed or public-domain one, or establish the rights and update source.rights');
  }

  if (d.contentType === 'scripture') {
    const sc = d.scripture;
    if (d.generated === true) reasons.push('scripture can never be generated');
    if (!sc || !nonEmpty(sc.translationId) || sc.translationId === 'unidentified') {
      reasons.push('the translation is not identified — set scripture.translationId to the exact translation');
    }
    if (!sc || !nonEmpty(sc.edition) || /unverified|unidentified/i.test(sc.edition)) {
      reasons.push('the edition is not established — set scripture.edition');
    }
    const v = sc?.verification;
    if (!v || !nonEmpty(v.against) || !nonEmpty(v.checkedAt) || !nonEmpty(v.by) || !nonEmpty(v.method)) {
      reasons.push('the wording is not verified against a published source — run scripts/verify-scripture.mjs (or proofread and record scripture.verification)');
    }
  }

  return { published: reasons.length === 0, unpublishedReasons: reasons };
}
