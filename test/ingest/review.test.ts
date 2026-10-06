import { describe, expect, it } from 'vitest';
import { createMemoryStore, ids } from '../../src/core';
import {
  applyReview, contentHistory, contentSignatureOf, importDocuments, loadBundledCorpus, validateDocument, type CorpusDocument, type ReviewResult,
} from '../../src/ingest';
import { baseDoc, clock, registry, scriptureDoc } from './helpers';

const clone = <T,>(x: T): T => structuredClone(x);
const allTexts = (d: CorpusDocument): string[] =>
  d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.map((x) => x.text) : [p.text])));
const ok = (r: ReviewResult) => { if (!r.ok) throw new Error(`refused: ${r.refusals.map((x) => x.code).join(',')}`); return r; };
const codes = (r: ReviewResult) => (r.ok ? [] : r.refusals.map((x) => x.code));

const draft = (): CorpusDocument => ({ ...baseDoc(), editorialTags: ['needs-native-review', 'machine-drafted'], generated: true });

describe('applyReview', () => {
  it('records the review block, removes needs-native-review, keeps machine-drafted, and never touches a text byte', () => {
    const before = draft();
    const frozen = clone(before);
    const r = ok(applyReview(before, { by: 'Ana Ruiz (native speaker)', date: '2026-02-01', notes: 'Checked wording.', level: 'native' }));
    expect(before).toEqual(frozen); // the input is not mutated
    expect(r.review).toEqual({ status: 'reviewed', reviewedBy: 'Ana Ruiz (native speaker)', reviewedAt: '2026-02-01', contentSignature: contentSignatureOf(before), notes: 'Checked wording.', level: 'native' });
    expect(r.doc.review).toEqual(r.review);
    expect(r.doc.editorialTags).toEqual(['machine-drafted']);
    expect(r.removedTags).toEqual(['needs-native-review']);
    expect(r.previous).toEqual({ status: 'unreviewed' });
    // every sentence text, every paragraph, every section: identical before and after
    expect(allTexts(r.doc)).toEqual(allTexts(before));
    expect(r.doc.sections).toEqual(before.sections);
    expect(JSON.stringify(r.doc.sections)).toBe(JSON.stringify(before.sections));
    // nothing but review and editorialTags differs
    expect({ ...r.doc, review: 0, editorialTags: 0 }).toEqual({ ...before, review: 0, editorialTags: 0 });
    expect(r.decision).toEqual({ published: true, unpublishedReasons: [] });
    expect(validateDocument(r.doc, { registry }).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('every sentence of every bundled Spanish text is byte-identical after a review (the bundled copies stay unreviewed)', () => {
    for (const d of loadBundledCorpus().filter((x) => x.lang === 'es' && x.contentType !== 'scripture')) {
      const r = ok(applyReview(d, { by: 'Test Reviewer', date: '2026-02-01' }));
      expect(allTexts(r.doc), d.id).toEqual(allTexts(d));
      expect(r.doc.sections, d.id).toEqual(d.sections);
      expect(r.doc.editorialTags).not.toContain('needs-native-review');
      expect(d.review.status).toBe('unreviewed'); // the bundled document itself was not changed
      expect(d.editorialTags).toContain('needs-native-review');
    }
  });

  it('refuses without a named reviewer (undefined, empty, blank)', () => {
    for (const by of [undefined, '', '   ']) expect(codes(applyReview(draft(), { by }))).toEqual(['missing-reviewer']);
  });

  it('refuses an unknown status and an impossible date, and reports every refusal at once', () => {
    expect(codes(applyReview(draft(), { by: 'A', status: 'perfect' }))).toEqual(['invalid-status']);
    expect(codes(applyReview(draft(), { by: 'A', status: 'unreviewed' }))).toEqual(['invalid-status']);
    for (const date of ['2026-02-30', '01/02/2026', '2026-2-1', '']) expect(codes(applyReview(draft(), { by: 'A', date })), date).toEqual(['invalid-date']);
    expect(codes(applyReview(draft(), { status: 'x', date: 'y' })).sort()).toEqual(['invalid-date', 'invalid-status', 'missing-reviewer']);
    expect(codes(applyReview(null, { by: 'A' }))).toEqual(['not-a-document']);
    expect(codes(applyReview([], { by: 'A' }))).toEqual(['not-a-document']);
  });

  it('refuses Scripture that lacks scripture.verification (verification is a separate step), whatever the status', () => {
    const unverified = scriptureDoc();
    delete unverified.scripture!.verification;
    unverified.review = { status: 'unreviewed' };
    const r = applyReview(unverified, { by: 'A' });
    expect(codes(r)).toEqual(['scripture-unverified']);
    expect(!r.ok && r.refusals[0].hint).toMatch(/verify-scripture/);
    expect(codes(applyReview(unverified, { by: 'A', status: 'in-review' }))).toEqual(['scripture-unverified']);
    // an incomplete verification counts as none
    const partial = clone(unverified);
    partial.scripture!.verification = { against: 'x', checkedAt: '', method: 'byte-comparison', by: 'x' };
    expect(codes(applyReview(partial, { by: 'A' }))).toEqual(['scripture-unverified']);
    // verified Scripture can be reviewed and then publishes
    const verified = scriptureDoc();
    verified.review = { status: 'unreviewed' };
    const done = ok(applyReview(verified, { by: 'A', date: '2026-02-01' }));
    expect(done.decision.published).toBe(true);
  });

  it('in-review and rejected record who and when but keep needs-native-review, and do not publish', () => {
    const a = ok(applyReview(draft(), { by: 'A', status: 'in-review', date: '2026-02-01' }));
    expect(a.doc.editorialTags).toEqual(['needs-native-review', 'machine-drafted']);
    expect(a.removedTags).toEqual([]);
    expect(a.decision.published).toBe(false);
    expect(a.decision.unpublishedReasons.join(' ')).toMatch(/in-review/);
    const rej = ok(applyReview(draft(), { by: 'A', status: 'rejected' }));
    expect(rej.decision.published).toBe(false);
    expect(rej.decision.unpublishedReasons.join(' ')).toMatch(/rejected/);
    expect(rej.review.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/); // date defaults to today
  });

  it('a positive review does not make unestablished rights publishable: the remaining reasons come back', () => {
    const d = draft();
    d.source = { ...d.source, rights: 'unverified', provenance: 'unknown; replace this text' };
    const r = ok(applyReview(d, { by: 'A', status: 'approved', level: 'native' }));
    expect(r.decision.published).toBe(false);
    expect(r.decision.unpublishedReasons).toHaveLength(1);
    expect(r.decision.unpublishedReasons[0]).toMatch(/rights are unverified/);
  });

  it('a review is metadata only: re-importing the reviewed document publishes it without a content bump', async () => {
    const store = createMemoryStore();
    const d = draft();
    const first = await importDocuments(store, registry, [d], { clock });
    expect(first.documents[0]).toMatchObject({ action: 'created', published: false });
    const reviewed = ok(applyReview(d, { by: 'Ana Ruiz', date: '2026-02-01', level: 'native' })).doc;
    const second = await importDocuments(store, registry, [reviewed], { clock: () => '2026-02-01T00:00:00.000Z' });
    expect(second.documents[0]).toMatchObject({ action: 'updated', contentVersion: 1, published: true, sentencesAdded: 0, sentencesRetired: 0 });
    const t = (await store.texts.get(ids.text('es', 'test-doc')))!;
    expect(t).toMatchObject({ published: true, reviewStatus: 'reviewed', contentVersion: 1 });
    expect(t.editorialTags).toEqual(['machine-drafted']);
    expect(contentHistory(t)).toHaveLength(1); // a review is not a content revision
  });
});
