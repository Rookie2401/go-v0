/**
 * The publication gate (evidence policy v2, rule 8). A text reaches normal learner use only when it is
 * `published`; everything else is reachable only in the explicitly marked preview mode.
 *
 *   published  ⇔  review.status ∈ {reviewed, approved} with a named reviewer
 *              ∧  rights established (not "unverified")
 *              ∧  non-Scripture: review.contentSignature equals the signature of the current wording (review binding)
 *              ∧  for Scripture: translation identity + edition + a complete SourceVerification, never generated
 *
 * Every failed condition contributes one actionable sentence to `unpublishedReasons`.
 */
import { REVIEW_OK, hash } from '../core';
import type { CorpusDocument } from './format';

export interface PublicationDecision {
  published: boolean;
  unpublishedReasons: string[];
}

/**
 * Review binding: the signature of the WORDING a review covers. A hash over the ordered exact sentence texts of the
 * document (a declared sentence's `text`; a raw paragraph's `text` as one unit). Metadata, English lines, spans,
 * corrections, tags and review fields do not enter it; any change to a sentence text, the order, an addition or a
 * removal does. Tolerant of partially valid documents.
 */
export function contentSignatureOf(doc: unknown): string {
  const texts: string[] = [];
  const sections = (doc as { sections?: unknown } | null)?.sections;
  if (Array.isArray(sections)) {
    for (const sec of sections) {
      const paragraphs = (sec as { paragraphs?: unknown } | null)?.paragraphs;
      if (!Array.isArray(paragraphs)) continue;
      for (const p of paragraphs) {
        const par = p as { sentences?: unknown; text?: unknown } | null;
        if (par && Array.isArray(par.sentences)) {
          for (const s of par.sentences) texts.push(typeof (s as { text?: unknown } | null)?.text === 'string' ? (s as { text: string }).text : '');
        } else if (par && typeof par.text === 'string') texts.push(par.text);
      }
    }
  }
  return hash(JSON.stringify(texts));
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
  } else if (d.contentType !== 'scripture') {
    // A review must cover the content it publishes. Scripture is exempt: its wording is bound by
    // scripture.verification and the byte-for-byte check against data/verified (scripts/verify-scripture.mjs).
    const sig = d.review?.contentSignature;
    if (!nonEmpty(sig)) reasons.push('the review does not say which wording it covers — record it with npm run corpus:review');
    else if (sig !== contentSignatureOf(doc)) reasons.push('the text changed after it was reviewed — record a new review (npm run corpus:review)');
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
