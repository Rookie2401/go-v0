import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import { applyReview, computePublished, contentSignatureOf, importDocuments, testimonyDocument, type CorpusDocument } from '../../src/ingest';
import { baseDoc, clock, issuesOf, registry, scriptureDoc } from './helpers';
import { bookDoc } from './book';

const story = (over: Partial<CorpusDocument> = {}, review?: CorpusDocument['review'], rights?: CorpusDocument['source']['rights']): CorpusDocument => {
  const d = { ...baseDoc(), ...over };
  if (review) d.review = { ...review, contentSignature: contentSignatureOf(d) }; // a review that covers this wording
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

  describe('review binding: a review covers the wording it was given for', () => {
    const wordings = (d: CorpusDocument) => (d.sections[0].paragraphs[0] as { sentences: Array<{ text: string; english?: string }> }).sentences;

    it('three outcomes: signature matches (published), differs (changed after review), missing (does not say what it covers)', () => {
      const ok = story({}, reviewed);
      expect(computePublished(ok)).toEqual({ published: true, unpublishedReasons: [] });

      const changed = story({}, reviewed);
      wordings(changed)[0].text = 'Hola, Ana.';
      expect(computePublished(changed)).toEqual({
        published: false, unpublishedReasons: ['the text changed after it was reviewed — record a new review (npm run corpus:review)'],
      });

      const unsigned = story({}, reviewed);
      delete unsigned.review.contentSignature;
      expect(computePublished(unsigned)).toEqual({
        published: false, unpublishedReasons: ['the review does not say which wording it covers — record it with npm run corpus:review'],
      });
    });

    it('applyReview records the signature, so a reviewed document publishes; editing the text afterwards unpublishes it until reviewed again', () => {
      const r = applyReview(baseDoc(), { by: 'Ana Ruiz', date: '2026-02-01' });
      expect(r.ok && r.review.contentSignature).toBe(contentSignatureOf(baseDoc()));
      if (!r.ok) throw new Error('refused');
      expect(r.decision.published).toBe(true);
      const edited = structuredClone(r.doc);
      wordings(edited)[0].text = 'Adiós.';
      expect(computePublished(edited).published).toBe(false);
      const again = applyReview(edited, { by: 'Ana Ruiz', date: '2026-02-02' });
      expect(again.ok && again.decision.published).toBe(true);
    });

    it('the signature depends on the exact sentence texts and their order only', () => {
      const base = (): CorpusDocument => {
        const d = baseDoc();
        d.sections = [{ paragraphs: [{ sentences: [{ text: 'Uno.', english: 'One.' }, { text: 'Dos.' }] }, { text: 'Tres. Cuatro.' }] }];
        return d;
      };
      const sig = contentSignatureOf(base());
      expect(contentSignatureOf(base())).toBe(sig);
      expect(sig).toMatch(/^[0-9a-f]{16}$/);

      // metadata, English, spans, tags, review and title do not matter
      const meta = base();
      meta.title = 'Other'; meta.topics = ['x']; meta.editorialTags = ['y']; meta.generated = true; meta.review = { status: 'reviewed', reviewedBy: 'z' };
      meta.english = { source: 'elsewhere' };
      const first = wordings(meta)[0] as { text: string; english?: string; spans?: unknown[] };
      first.english = 'Different English.'; first.spans = [{ start: 0, end: 3, lemma: 'uno' }];
      expect(contentSignatureOf(meta)).toBe(sig);

      // any text change, reordering, addition or removal does
      const edit = base(); wordings(edit)[1].text = 'Dos!';
      expect(contentSignatureOf(edit)).not.toBe(sig);
      const space = base(); wordings(space)[1].text = 'Dos. ';
      expect(contentSignatureOf(space)).not.toBe(sig);
      const reorder = base(); wordings(reorder).reverse();
      expect(contentSignatureOf(reorder)).not.toBe(sig);
      const add = base(); wordings(add).push({ text: 'Nuevo.' });
      expect(contentSignatureOf(add)).not.toBe(sig);
      const remove = base(); wordings(remove).pop();
      expect(contentSignatureOf(remove)).not.toBe(sig);
      const raw = base(); (raw.sections[0].paragraphs[1] as { text: string }).text = 'Tres.  Cuatro.';
      expect(contentSignatureOf(raw)).not.toBe(sig);
      const moved = base(); moved.sections[0].paragraphs.reverse();
      expect(contentSignatureOf(moved)).not.toBe(sig);
    });

    it('Scripture is exempt (its wording is bound by scripture.verification), and a testimony keeps publishing', () => {
      const sc = scriptureDoc();
      expect(sc.review.contentSignature).toBeUndefined();
      expect(computePublished(sc)).toEqual({ published: true, unpublishedReasons: [] });
      const changed = scriptureDoc();
      (changed.sections[0].paragraphs[0] as { sentences: Array<{ text: string }> }).sentences[0].text = 'Otro texto.';
      changed.review.contentSignature = 'deadbeef';
      expect(computePublished(changed).published).toBe(true); // verification, not the signature, binds Scripture

      const t = testimonyDocument({ userId: 'u1', lang: 'es', n: 2, sentences: ['Yo creo.', 'Dios me ama.'] });
      expect(t.review.contentSignature).toBe(contentSignatureOf(t));
      expect(computePublished(t).published).toBe(true);
    });
  });
});

describe('personal copies: published without a review, and nothing else', () => {
  const copy = (over: Partial<CorpusDocument['source']> = {}, top: Partial<CorpusDocument> = {}): CorpusDocument => {
    const d = bookDoc(top);
    d.source = { ...d.source, ...over };
    return d;
  };
  const codes = (d: CorpusDocument, severity: 'error' | 'warning' = 'error') => issuesOf(d).filter((i) => i.severity === severity).map((i) => i.code);

  it('a published, non-generated, non-Scripture work with a provenance is published with no review, and is marked a personal copy', () => {
    const d = copy();
    expect(d.review.status).toBe('unreviewed');
    expect(computePublished(d)).toEqual({ published: true, unpublishedReasons: [], personalCopy: true });
    expect(codes(d)).toEqual([]);
    // a review, if someone adds one, changes nothing
    expect(computePublished({ ...d, review: { status: 'reviewed', reviewedBy: 'x', contentSignature: 'stale' } }).published).toBe(true);
  });

  it('Scripture is never a personal copy', () => {
    const d = copy({}, { contentType: 'scripture' });
    const r = computePublished(d);
    expect(r.published).toBe(false);
    expect(r.personalCopy).toBeUndefined();
    expect(r.unpublishedReasons).toContain('Scripture is never a personal copy: it must be an identified, verified translation');
    expect(codes(d)).toContain('personal-copy-scripture');
    expect(issuesOf(d).find((i) => i.code === 'personal-copy-scripture')!.message).toBe('Scripture is never a personal copy: it must be an identified, verified translation');
  });

  it('generated text is not a published work', () => {
    for (const d of [copy({}, { generated: true }), copy({ authorship: 'generated' })]) {
      const r = computePublished(d);
      expect(r.published).toBe(false);
      expect(r.unpublishedReasons.join(' ')).toMatch(/generated text is not a published work/);
      expect(codes(d)).toContain('personal-copy-generated');
    }
  });

  it('any other authorship, or no provenance, is refused with a fix', () => {
    for (const authorship of ['human', 'public-domain', 'licensed', 'learner'] as const) {
      const d = copy({ authorship });
      expect(computePublished(d).published, authorship).toBe(false);
      expect(codes(d), authorship).toEqual(['personal-copy-authorship']);
      expect(issuesOf(d)[0].hint).toMatch(/published/);
    }
    const bare = copy({ provenance: '  ' });
    expect(computePublished(bare).published).toBe(false);
    expect(codes(bare)).toContain('missing-provenance');
  });

  it('a rejected review still holds a personal copy back', () => {
    const d = bookDoc({ review: { status: 'rejected', reviewedBy: 'x' } });
    expect(computePublished(d).published).toBe(false);
    expect(computePublished(d).unpublishedReasons.join(' ')).toMatch(/rejected/);
  });

  it('every other rights value behaves exactly as before: authorship "published" does not skip the review', () => {
    for (const rights of ['licensed', 'owner-authored', 'public-domain'] as const) {
      const d = copy({ rights });
      const r = computePublished(d);
      expect(r.published, rights).toBe(false);
      expect(r.personalCopy, rights).toBeUndefined();
      expect(r.unpublishedReasons.join(' '), rights).toMatch(/review status is "unreviewed"/);
      expect(codes(d), rights).toEqual([]);
    }
    expect(computePublished(copy({ rights: 'unverified' })).unpublishedReasons.join(' ')).toMatch(/rights are unverified/);
  });

  it('is imported as a personal copy: Text.personalCopy true and published; a non-copy never gets the flag', async () => {
    const store = createMemoryStore();
    const r = await importDocuments(store, registry, [bookDoc(), baseDoc()], { clock });
    expect(r.ok).toBe(true);
    const book = (await store.texts.get('text:th:book-ch01'))!;
    expect(book).toMatchObject({ published: true, unpublishedReasons: [], personalCopy: true, reviewStatus: 'unreviewed' });
    const other = (await store.texts.get('text:es:test-doc'))!;
    expect(other.personalCopy).toBeUndefined();
    expect(other.published).toBe(false);
    expect((await store.sources.get('src:th:book'))!).toMatchObject({ rights: 'personal-copy', authorship: 'published' });
  });

  it('the importer rejects the bad combinations (nothing written)', async () => {
    const store = createMemoryStore();
    const r = await importDocuments(store, registry, [copy({}, { contentType: 'scripture' })], { clock });
    expect(r.ok).toBe(false);
    expect(r.documents[0].issues.map((i) => i.code)).toContain('personal-copy-scripture');
    expect(await store.texts.all()).toEqual([]);
  });
});
