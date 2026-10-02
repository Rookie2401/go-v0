/**
 * The publication gate (evidence policy v2, rule 8). A text reaches normal learner use only when it is
 * `published`; everything else is reachable only in the explicitly marked preview mode.
 *
 *   published  ⇔  review.status ∈ {reviewed, approved} with a named reviewer
 *              ∧  rights established (not "unverified")
 *              ∧  non-Scripture: review.contentSignature equals the signature of the current wording (review binding)
 *              ∧  for Scripture: translation identity + edition + a complete SourceVerification, never generated
 *
 * Exception — a personal copy (source.rights 'personal-copy', authorship 'published', not generated, not Scripture, with a
 * provenance) is published without a review and marked `personalCopy`; any other use of 'personal-copy' is refused.
 *
 * Every failed condition contributes one actionable sentence to `unpublishedReasons`.
 */
import { REVIEW_OK, hash } from '../core';
import type { CorpusDocument } from './format';

export interface PublicationDecision {
  published: boolean;
  unpublishedReasons: string[];
  /** True (and only then present) when the text is published as the learner's own copy of a published work: `Text.personalCopy`. */
  personalCopy?: true;
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

  // A personal copy is the learner's own copy of a published native work: readable on this device without a review
  // (the transcription stays labelled unchecked), never Scripture, never generated. Any other combination is refused.
  if (d.source?.rights === 'personal-copy') {
    if (d.contentType === 'scripture') reasons.push('Scripture is never a personal copy: it must be an identified, verified translation');
    if (d.generated === true || d.source.authorship === 'generated') reasons.push('generated text is not a published work, so it cannot be a personal copy');
    else if (d.source.authorship !== 'published') reasons.push('a personal copy must have authorship "published" (a book by a native author)');
    if (!nonEmpty(d.source.provenance)) reasons.push('a personal copy needs source.provenance saying where the copy came from');
    if (d.review?.status === 'rejected') reasons.push('review was rejected — fix the text and record a new review');
    return reasons.length ? { published: false, unpublishedReasons: reasons } : { published: true, unpublishedReasons: [], personalCopy: true };
  }

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
  } else if (d.review?.level === 'linguistic-check' && (d.generated === true || d.source?.authorship === 'generated')) {
    // a language check is recorded and kept, but machine-drafted text reaches learners only after a native speaker has read it
    reasons.push(`the review on record is a language check by ${d.review.reviewedBy}, not a native speaker's review — machine-drafted text is published only after a native speaker has read it (npm run corpus:review -- <file> --by "<name>" --level native)`);
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

  // A technical fixture (a draft translation used to test the Scripture pipeline) is never published; the other checks above still run and show.
  if (d.contentType === 'scripture' && d.scripture?.role === 'technical-fixture') {
    reasons.unshift(`technical fixture for testing the Scripture pipeline — not the course Bible (${nonEmpty(d.scripture.fixtureNote) ? d.scripture.fixtureNote : 'no fixtureNote given'})`);
  }

  return { published: reasons.length === 0, unpublishedReasons: reasons };
}
