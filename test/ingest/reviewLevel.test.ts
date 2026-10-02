/**
 * Review levels. Machine-drafted course text (the controlled Hindi stories, the Spanish and German course texts) is shown
 * to beginners, so the bar is a native speaker's review. A language check by someone else, or by a tool, is worth
 * recording — and is not that: it must never publish a machine-drafted text.
 *   generated (unreviewed) → linguistic-check (recorded, still unpublished) → native (published) → approved
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { applyReview, computePublished, loadBundledCorpus, validateBatch, type CorpusDocument } from '../../src/ingest';

const registry = createAdapterRegistry();
// a machine-drafted course text from the bundled corpus (any language will do: the rule is language-neutral)
const draft = (): CorpusDocument => structuredClone(loadBundledCorpus().find((d) => d.lang === 'es' && d.id === 'story-01')!);
const errorsOf = (d: unknown) => validateBatch([d], { registry }).documents[0].issues.filter((i) => i.severity === 'error');

describe('review levels', () => {
  it('a machine draft starts unreviewed and unpublished', () => {
    const d = draft();
    expect(d.generated).toBe(true);
    expect(d.review.status).toBe('unreviewed');
    expect(computePublished(d).published).toBe(false);
  });

  it('a language check is recorded with its reviewer and wording, and does not publish the text', () => {
    const r = applyReview(draft(), { by: 'A. Linguist (not a native speaker)', date: '2026-10-02', level: 'linguistic-check' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.review).toMatchObject({ status: 'reviewed', reviewedBy: 'A. Linguist (not a native speaker)', level: 'linguistic-check' });
    expect(r.review.contentSignature).toBeTruthy();
    expect(r.decision.published).toBe(false);
    expect(r.decision.unpublishedReasons.join(' ')).toMatch(/language check by A\. Linguist.*not a native speaker's review/);
    expect(errorsOf(r.doc)).toEqual([]); // still a valid document
  });

  it('a native speaker\'s review publishes it; "approved" after that keeps it published', () => {
    const native = applyReview(draft(), { by: 'N. Speaker', date: '2026-10-02', level: 'native' });
    expect(native.ok && native.decision.published).toBe(true);
    if (!native.ok) return;
    const approved = applyReview(native.doc, { by: 'Course owner', date: '2026-10-03', status: 'approved', level: 'native' });
    expect(approved.ok && approved.decision.published).toBe(true);
  });

  it('a review recorded before levels existed is taken as given (nothing already published is withdrawn)', () => {
    const r = applyReview(draft(), { by: 'N. Speaker', date: '2026-10-02' });
    expect(r.ok && r.review.level).toBeUndefined();
    expect(r.ok && r.decision.published).toBe(true);
  });

  it('a language check of a text that is NOT machine-drafted is an ordinary review (the rule is about generated text)', () => {
    const d = draft();
    d.generated = false;
    d.source = { ...d.source, authorship: 'human' };
    const r = applyReview(d, { by: 'A. Linguist', date: '2026-10-02', level: 'linguistic-check' });
    expect(r.ok && r.decision.published).toBe(true);
  });

  it('an unknown level is refused by the review step and by the validator', () => {
    const r = applyReview(draft(), { by: 'X', level: 'thorough' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusals.map((x) => x.code)).toContain('invalid-level');
    const d = draft() as unknown as { review: Record<string, unknown> };
    d.review = { status: 'reviewed', reviewedBy: 'X', reviewedAt: '2026-10-02', level: 'thorough' };
    expect(errorsOf(d).map((i) => i.path)).toContain('review.level');
  });

  it('the wording check still applies: a native review of an older wording does not publish a changed text', () => {
    const r = applyReview(draft(), { by: 'N. Speaker', date: '2026-10-02', level: 'native' });
    if (!r.ok) throw new Error('review refused');
    const changed = structuredClone(r.doc);
    const first = changed.sections[0].paragraphs[0];
    if ('sentences' in first) first.sentences[0].text = `${first.sentences[0].text} `;
    expect(computePublished(changed).published).toBe(false);
  });
});
