import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import { computePublished, importDocuments, validateDocument, type CorpusDocument } from '../../src/ingest';
import { baseDoc, clock, errorCodes, registry, warningCodes } from './helpers';

const team = (over: Partial<CorpusDocument> = {}): CorpusDocument => ({ ...baseDoc(), id: 'team-doc', teamText: true, ...over });

describe('teamText — the validator', () => {
  it('accepts a team text without a warning for the field', () => {
    const d = team();
    expect(errorCodes(d)).toEqual([]);
    expect(warningCodes(d)).not.toContain('unknown-field');
  });

  it('accepts a document without the flag exactly as before', () => {
    expect(errorCodes(baseDoc())).toEqual([]);
  });

  it('refuses it unless owner-authored, human, not generated and not Scripture, with a message and a hint', () => {
    const cases: Array<[string, CorpusDocument]> = [
      ['public-domain', team({ source: { ...baseDoc().source, rights: 'public-domain', authorship: 'public-domain' } })],
      ['personal-copy', team({ source: { ...baseDoc().source, rights: 'personal-copy', authorship: 'published' } })],
      ['licensed', team({ source: { ...baseDoc().source, rights: 'licensed' } })],
      ['authorship learner', team({ source: { ...baseDoc().source, authorship: 'learner' } })],
      ['authorship generated', team({ source: { ...baseDoc().source, authorship: 'generated' } })],
      ['generated', team({ generated: true })],
    ];
    for (const [name, d] of cases) {
      const issue = validateDocument(d, { registry }).find((i) => i.code === 'team-text-rights');
      expect(issue, name).toBeDefined();
      expect(issue!.severity, name).toBe('error');
      expect(issue!.path, name).toBe('teamText');
      expect(issue!.message.length, name).toBeGreaterThan(10);
      expect(issue!.hint.length, name).toBeGreaterThan(10);
    }
  });

  it('refuses it on Scripture', () => {
    const scripture = team({
      contentType: 'scripture', corpus: { id: 'bible-es', kind: 'scripture', title: 'B' },
      scripture: { translationId: 'tst', translationName: 'Test Bible', edition: '1900', book: 'JHN', chapter: 3 },
      sections: [{ chapter: 3, paragraphs: [{ sentences: [{ text: 'Porque Dios amó.', verseRefs: ['JHN.3.16'] }] }] }],
    });
    expect(errorCodes(scripture)).toContain('team-text-rights');
  });

  it('refuses a value that is not true', () => {
    const d = { ...baseDoc(), teamText: false };
    expect(errorCodes(d)).toContain('invalid-value');
  });
});

describe('teamText — computePublished', () => {
  it('publishes a team text without a review, with teamText in the decision', () => {
    expect(computePublished(team())).toEqual({ published: true, unpublishedReasons: [], teamText: true });
  });

  it('a rejected review still blocks it', () => {
    const r = computePublished(team({ review: { status: 'rejected', reviewedBy: 'Ana' } }));
    expect(r.published).toBe(false);
    expect(r.teamText).toBeUndefined();
    expect(r.unpublishedReasons.join(' ')).toMatch(/rejected/);
  });

  it('without the flag, or without the conditions, the ordinary gate applies', () => {
    expect(computePublished(baseDoc()).published).toBe(false);
    const notOurs = computePublished(team({ source: { ...baseDoc().source, rights: 'licensed' } }));
    expect(notOurs.published).toBe(false);
    expect(notOurs.teamText).toBeUndefined();
    expect(computePublished(team({ generated: true })).published).toBe(false);
  });
});

describe('teamText — the import', () => {
  it('stores a published Text with teamText, no personalCopy, review untouched', async () => {
    const store = createMemoryStore();
    const report = await importDocuments(store, registry, [team()], { clock });
    expect(report.ok).toBe(true);
    expect(report.documents[0]).toMatchObject({ action: 'created', published: true, teamText: true });
    const text = await store.texts.get('text:es:team-doc');
    expect(text).toMatchObject({ published: true, teamText: true, reviewStatus: 'unreviewed', unpublishedReasons: [] });
    expect(text?.personalCopy).toBeUndefined();
  });

  it('re-importing the same text with the flag added publishes it (the flag is part of the signature)', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [{ ...baseDoc(), id: 'team-doc' }], { clock });
    expect((await store.texts.get('text:es:team-doc'))?.published).toBe(false);
    const again = await importDocuments(store, registry, [team()], { clock });
    expect(again.documents[0].action).toBe('updated');
    expect(await store.texts.get('text:es:team-doc')).toMatchObject({ published: true, teamText: true });
  });

  it('a text without the flag has no teamText', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [{ ...baseDoc(), id: 'plain' }], { clock });
    expect((await store.texts.get('text:es:plain'))?.teamText).toBeUndefined();
  });

  it('the same document as a personal copy with teamText is refused, and nothing is stored', async () => {
    const store = createMemoryStore();
    const bad = team({ source: { ...baseDoc().source, rights: 'personal-copy', authorship: 'published' } });
    const report = await importDocuments(store, registry, [bad], { clock });
    expect(report.ok).toBe(false);
    expect(report.documents[0].action).toBe('rejected');
    expect(report.documents[0].issues.map((i) => i.code)).toContain('team-text-rights');
    expect(await store.texts.all()).toEqual([]);
  });
});
