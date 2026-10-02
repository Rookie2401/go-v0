import { describe, expect, it } from 'vitest';
import { authoringState, mayShowToLearners, stateCounts, type StateDoc } from '../../src/authoring/states';

const doc = (status: string, tags: string[] = [], extra: Record<string, unknown> = {}): StateDoc =>
  ({ review: { status, ...extra }, editorialTags: tags } as unknown as StateDoc);

describe('authoringState', () => {
  it('derives DRAFT, AUTO_VALIDATED and NEEDS_NATIVE_REVIEW from the tags', () => {
    expect(authoringState(doc('unreviewed'))).toEqual({ state: 'DRAFT' });
    expect(authoringState(doc('unreviewed', ['machine-drafted', 'needs-native-review']))).toEqual({ state: 'DRAFT' }); // not auto-validated
    expect(authoringState(doc('unreviewed', ['auto-validated']))).toEqual({ state: 'AUTO_VALIDATED' });
    expect(authoringState(doc('unreviewed', ['auto-validated', 'needs-native-review']))).toEqual({ state: 'NEEDS_NATIVE_REVIEW' });
    expect(authoringState(doc('in-review', ['auto-validated']))).toEqual({ state: 'AUTO_VALIDATED' });
  });

  it('rejected is REJECTED whatever the tags', () => {
    expect(authoringState(doc('rejected', ['auto-validated']))).toEqual({ state: 'REJECTED' });
  });

  it('reviewed and approved are believed only with a named reviewer and a date', () => {
    expect(authoringState(doc('reviewed', [], { reviewedBy: 'A. Hoxha', reviewedAt: '2026-10-01' }))).toEqual({ state: 'NATIVE_REVIEWED' });
    expect(authoringState(doc('approved', [], { reviewedBy: 'A. Hoxha', reviewedAt: '2026-10-02' }))).toEqual({ state: 'APPROVED' });
  });

  it('a "reviewed" or "approved" status without a reviewer or date is not believed: the vouchable state and a problem', () => {
    const noName = authoringState(doc('reviewed', ['auto-validated', 'needs-native-review']));
    expect(noName.state).toBe('NEEDS_NATIVE_REVIEW');
    expect(noName.problem).toMatch(/no reviewer is named/);
    const blank = authoringState(doc('approved', [], { reviewedBy: '   ', reviewedAt: '2026-10-01' }));
    expect(blank.state).toBe('DRAFT');
    expect(blank.problem).toMatch(/no reviewer/);
    const noDate = authoringState(doc('reviewed', ['auto-validated'], { reviewedBy: 'A. Hoxha' }));
    expect(noDate).toMatchObject({ state: 'AUTO_VALIDATED' });
    expect(noDate.problem).toMatch(/no review date/);
  });

  it('a language check of machine-drafted text is not a native review; for human text it is taken as given', () => {
    const extra = { reviewedBy: 'tool', reviewedAt: '2026-10-01', level: 'linguistic-check' };
    const gen = authoringState({ ...doc('reviewed', [], extra), generated: true });
    expect(gen.state).toBe('DRAFT');
    expect(gen.problem).toMatch(/language check/);
    expect(authoringState({ ...doc('reviewed', [], extra), generated: false }).state).toBe('NATIVE_REVIEWED');
    expect(authoringState({ ...doc('reviewed', [], { ...extra, level: 'native' }), generated: true }).state).toBe('NATIVE_REVIEWED');
  });

  it('mayShowToLearners is true only for NATIVE_REVIEWED and APPROVED', () => {
    const all = ['DRAFT', 'AUTO_VALIDATED', 'NEEDS_NATIVE_REVIEW', 'NATIVE_REVIEWED', 'APPROVED', 'REJECTED'] as const;
    expect(all.filter(mayShowToLearners)).toEqual(['NATIVE_REVIEWED', 'APPROVED']);
  });

  it('stateCounts counts every state, with zeros', () => {
    const counts = stateCounts([doc('unreviewed'), doc('unreviewed'), doc('rejected'), doc('reviewed', [], { reviewedBy: 'x', reviewedAt: 'y' })]);
    expect(counts).toEqual({ DRAFT: 2, AUTO_VALIDATED: 0, NEEDS_NATIVE_REVIEW: 0, NATIVE_REVIEWED: 1, APPROVED: 0, REJECTED: 1 });
  });

  it('only reads: the document is not changed', () => {
    const d = doc('unreviewed', ['machine-drafted']);
    const before = JSON.stringify(d);
    authoringState(d);
    expect(JSON.stringify(d)).toBe(before);
  });
});
