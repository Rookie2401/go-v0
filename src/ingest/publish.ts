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
 * Exception — a team text (`teamText: true` on an owner-authored, human-written, non-generated, non-Scripture document) is
 * published without a review and marked `teamText`; a rejected review still blocks it.
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
  /** True (and only then present) when the text is published as the team's own writing, without a review: `Text.teamText`. */
  teamText?: true;
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
  if (d.pipeline !== undefined) return computePublishedWithPipeline(doc as Record<string, unknown>);
  const reasons: string[] = [];
  const curriculum = d.curriculum;
  if (curriculum && !['ready', 'published'].includes(curriculum.lifecycle)) {
    reasons.push(`curriculum lifecycle is "${curriculum.lifecycle}" — only ready or published material can reach learners`);
    if (curriculum.lifecycle === 'rejected') reasons.push(...(curriculum.rejectionReasons ?? []));
  }
  const transformed = curriculum?.provenance?.kind && curriculum.provenance.kind !== 'original';
  const needsNative = d.generated === true || d.source?.authorship === 'generated' || d.editorialTags?.includes('needs-native-review') || transformed;
  if (needsNative && d.contentType !== 'scripture') {
    if (d.review?.level !== 'native' || !nonEmpty(d.review.reviewedBy) || !nonEmpty(d.review.reviewedAt) || !Number.isFinite(Date.parse(d.review.reviewedAt))) reasons.push('generated or transformed wording needs an explicit native-speaker review with a named reviewer and valid date');
    if ((d.teamText || d.source?.rights === 'personal-copy') && (!nonEmpty(d.review?.contentSignature) || d.review.contentSignature !== contentSignatureOf(doc))) reasons.push('native review must be bound to the current wording signature');
  }
  if (curriculum?.provenance?.kind === 'translation' && (!nonEmpty(curriculum.provenance.sourceTitle) || !nonEmpty(curriculum.provenance.sourceLanguage) || !nonEmpty(curriculum.provenance.translator))) reasons.push('translation provenance needs original title, source language and translator');
  if (curriculum?.provenance?.kind === 'adaptation' && (!nonEmpty(curriculum.provenance.sourceTextId) || curriculum.provenance.sourceTextId === d.id || curriculum.provenance.sourceTextId === `text:${d.lang}:${d.id}` || !nonEmpty(curriculum.provenance.adapter) || !nonEmpty(curriculum.provenance.description))) reasons.push('adaptation needs a distinct source identity, adapter and transformation description');

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

  // A team text is the team's own writing (owner-authored, by a person, not generated, not Scripture), added by a team member:
  // readable on this device without a review, labelled as the team's. A rejected review still blocks it. A document that
  // claims teamText without those conditions is not treated as one (the validator refuses it) and takes the ordinary path.
  if (d.teamText === true && d.source?.rights === 'owner-authored' && d.source.authorship === 'human' && d.generated !== true && d.contentType !== 'scripture') {
    if (d.review?.status === 'rejected') reasons.push('review was rejected — fix the text and record a new review');
    return reasons.length ? { published: false, unpublishedReasons: reasons } : { published: true, unpublishedReasons: [], teamText: true };
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

// ───────────────────────────── ladder units: the pipeline (docs/LADDER.md) ─────────────────────────────

/** The plain reasons a unit's pipeline gives for not publishing (the wording is part of the contract). */
export const PIPELINE_REASONS = {
  review: 'waiting for a linguistic review by a person',
  corrections: 'corrections from the review are not resolved yet',
  recording: 'waiting for a reviewed human recording',
  changed: 'the text changed after the review by a person: it must be reviewed again',
} as const;

/**
 * What a `pipeline` block still waits for, in plain sentences (empty ⇒ the pipeline lets the unit through):
 * the state is `audio-ready` or `published`, the history holds a `reviewed` entry by a person, no `corrections-pending`
 * comes after the last such entry, and the wording is still the one that review signed off (when it recorded it).
 * Tolerant of a malformed block: whatever cannot be established counts as not done. `signature` is `contentSignatureOf(doc)`.
 */
export function pipelineHoldReasons(pipeline: unknown, signature: string): string[] {
  const p = typeof pipeline === 'object' && pipeline !== null && !Array.isArray(pipeline) ? pipeline as { state?: unknown; history?: unknown } : {};
  type Entry = { state?: unknown; by?: { kind?: unknown; name?: unknown }; contentSignature?: unknown };
  const history = (Array.isArray(p.history) ? p.history : []).filter((e): e is Entry => typeof e === 'object' && e !== null);
  let lastReviewed = -1;
  history.forEach((e, i) => { if (e.state === 'reviewed' && e.by?.kind === 'person' && nonEmpty(e.by.name)) lastReviewed = i; });
  const reasons: string[] = [];
  if (lastReviewed < 0) reasons.push(PIPELINE_REASONS.review);
  else if (nonEmpty(history[lastReviewed].contentSignature) && history[lastReviewed].contentSignature !== signature) reasons.push(PIPELINE_REASONS.changed);
  if (history.some((e, i) => i > lastReviewed && e.state === 'corrections-pending')) reasons.push(PIPELINE_REASONS.corrections);
  if (p.state !== 'audio-ready' && p.state !== 'published') reasons.push(PIPELINE_REASONS.recording);
  return reasons;
}

/**
 * A document with a `pipeline` block: the pipeline decides whether the review is enough (a person's review, corrections
 * resolved, a reviewed recording), in place of the single `review` block; every other rule (rights, curriculum, Scripture
 * verification, a rejected review) still applies, so this is the road through the machine-draft rule, not around it.
 */
function computePublishedWithPipeline(doc: Record<string, unknown>): PublicationDecision {
  const { pipeline, ...rest } = doc;
  const hold = pipelineHoldReasons(pipeline, contentSignatureOf(doc));
  const prior = rest.review as { status?: unknown } | undefined;
  // the pipeline stands in for the review block: present it to the ordinary rules as a review of the current wording by the person named in it
  const standIn = { status: prior?.status === 'rejected' ? 'rejected' : 'reviewed', reviewedBy: 'pipeline review by a person', reviewedAt: '1970-01-01', level: 'native', contentSignature: contentSignatureOf(doc) };
  const base = computePublished({ ...rest, review: standIn });
  const reasons = [...hold, ...base.unpublishedReasons];
  return { ...base, published: reasons.length === 0, unpublishedReasons: reasons };
}
