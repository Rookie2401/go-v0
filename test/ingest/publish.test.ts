import { describe, expect, it } from 'vitest';
import { computePublished, testimonyDocument, type CorpusDocument } from '../../src/ingest';
import { baseDoc, scriptureDoc } from './helpers';

const story = (over: Partial<CorpusDocument> = {}, review?: CorpusDocument['review'], rights?: CorpusDocument['source']['rights']): CorpusDocument => {
  const d = { ...baseDoc(), ...over };
  if (review) d.review = review;
  if (rights) d.source = { ...d.source, rights };
  return d;
};
const reviewed = { status: 'reviewed' as const, reviewedBy: 'Ana Ruiz (native speaker)', reviewedAt: '2026-02-01' };

describe('computePublished — the publication gate', () => {
  it('story matrix: review status × rights', () => {
    const cases: Array<[string, CorpusDocument, boolean]> = [
      ['unreviewed', story(), false],
      ['in-review', story({}, { status: 'in-review' }), false],
      ['rejected', story({}, { status: 'rejected', reviewedBy: 'x' }), false],
      ['reviewed, rights ok', story({}, reviewed), true],
      ['approved, rights ok', story({}, { ...reviewed, status: 'approved' }), true],
      ['reviewed, rights licensed', story({}, reviewed, 'licensed'), true],
      ['reviewed, rights unverified', story({}, reviewed, 'unverified'), false],
      ['reviewed but anonymous', story({}, { status: 'reviewed' }), false],
      ['unreviewed, rights unverified', story({}, undefined, 'unverified'), false],
    ];
    for (const [name, doc, want] of cases) {
      const r = computePublished(doc);
      expect(r.published, name).toBe(want);
      expect(r.unpublishedReasons.length === 0, name).toBe(want);
    }
  });

  it('machine-drafted text that is unreviewed says it needs a native-speaker review', () => {
    const r = computePublished(story({ generated: true }));
    expect(r.unpublishedReasons.join(' ')).toMatch(/native-speaker review/);
    expect(r.unpublishedReasons.join(' ')).toMatch(/reviewedBy/);
    // once reviewed, a generated text is published (the reader still badges it)
    expect(computePublished(story({ generated: true }, reviewed)).published).toBe(true);
  });

  it('scripture matrix: needs identity, edition, a complete verification, review and rights', () => {
    expect(computePublished(scriptureDoc())).toEqual({ published: true, unpublishedReasons: [] });

    const noVer = scriptureDoc(); delete noVer.scripture!.verification;
    const r1 = computePublished(noVer);
    expect(r1.published).toBe(false);
    expect(r1.unpublishedReasons).toHaveLength(1);
    expect(r1.unpublishedReasons[0]).toMatch(/verify-scripture/);

    const unidentified = scriptureDoc(); unidentified.scripture!.translationId = 'unidentified';
    expect(computePublished(unidentified).unpublishedReasons.join(' ')).toMatch(/translation is not identified/);

    const badEdition = scriptureDoc(); badEdition.scripture!.edition = 'unverified sample';
    expect(computePublished(badEdition).unpublishedReasons.join(' ')).toMatch(/edition/);

    const unreviewed = scriptureDoc(); unreviewed.review = { status: 'unreviewed' };
    expect(computePublished(unreviewed).published).toBe(false);

    const unverifiedRights = scriptureDoc(); unverifiedRights.source.rights = 'unverified';
    expect(computePublished(unverifiedRights).unpublishedReasons.join(' ')).toMatch(/rights are unverified/);

    const partial = scriptureDoc(); (partial.scripture!.verification as unknown as Record<string, unknown>).by = '';
    expect(computePublished(partial).published).toBe(false);

    expect(computePublished({ ...scriptureDoc(), generated: true }).unpublishedReasons.join(' ')).toMatch(/never be generated/);
  });

  it('every failed condition contributes its own reason (an unverified sample lists all of them)', () => {
    const sample = scriptureDoc();
    sample.review = { status: 'unreviewed' };
    sample.source.rights = 'unverified';
    sample.scripture = { translationId: 'unidentified', translationName: 'unverified sample', edition: 'unverified sample', book: '1JN', chapter: 1 };
    const r = computePublished(sample);
    expect(r.published).toBe(false);
    expect(r.unpublishedReasons).toHaveLength(5);
  });

  it('is tolerant of a partial document (missing pieces simply count as not established)', () => {
    const r = computePublished({ contentType: 'story' });
    expect(r.published).toBe(false);
    expect(r.unpublishedReasons.length).toBeGreaterThanOrEqual(2);
  });

  it('a learner testimony passes the gate (the learner accepted their own writing)', () => {
    const doc = testimonyDocument({ userId: 'u1', lang: 'es', n: 1, sentences: ['Yo creo en Dios.'] });
    expect(computePublished(doc)).toEqual({ published: true, unpublishedReasons: [] });
  });
});
