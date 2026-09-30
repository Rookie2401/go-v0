import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import { computePublished, importDocuments, validateBatch, type CorpusDocument } from '../../src/ingest';
import { clock, registry } from './helpers';

const read = (name: string) => JSON.parse(fs.readFileSync(`docs/import/templates/${name}.v2.json`, 'utf8')) as CorpusDocument;
const NAMES = ['ci-story', 'dialogue', 'scripture'];

describe('docs/import/templates', () => {
  it('ship three templates, each a valid version 2 document (no errors)', () => {
    expect(fs.readdirSync('docs/import/templates').sort()).toEqual(NAMES.map((n) => `${n}.v2.json`));
    const batch = validateBatch(NAMES.map(read), { registry });
    expect(batch.ok).toBe(true);
    for (const d of batch.documents) expect(d.issues.filter((i) => i.severity === 'error'), d.id).toEqual([]);
  });

  it('import, and are unpublished until reviewed / verified (the placeholders cannot reach a learner)', async () => {
    const store = createMemoryStore();
    const r = await importDocuments(store, registry, NAMES.map(read), { clock });
    expect(r.ok).toBe(true);
    expect(r.documents.every((d) => !d.published && d.unpublishedReasons.length > 0)).toBe(true);
    expect(r.documents[2].unpublishedReasons.join(' ')).toMatch(/not verified against a published source/);
  });

  it('following the review comment publishes the story template (and the scripture one stays blocked without verification)', () => {
    const story = read('ci-story');
    story.review = { status: 'reviewed', reviewedBy: 'Ana Ruiz (native speaker)', reviewedAt: '2026-02-01' };
    expect(computePublished(story)).toEqual({ published: true, unpublishedReasons: [] });
    const sc = read('scripture');
    sc.review = { status: 'reviewed', reviewedBy: 'someone', reviewedAt: '2026-02-01' };
    expect(computePublished(sc).published).toBe(false);
  });

  it('the story template exercises spans, corrections, author ids and a raw paragraph', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [read('ci-story')], { clock });
    const sentences = (await store.sentences.all()).sort((a, b) => a.index - b.index);
    expect(sentences.map((s) => s.key)).toEqual(['s1', 's2', 's3', expect.any(String), expect.any(String)]);
    expect((await store.analyses.all()).some((a) => a.analyzer === 'import@2')).toBe(true);
    expect((await store.analyses.all()).some((a) => a.provenance === 'human')).toBe(true);
    const dialogue = createMemoryStore();
    await importDocuments(dialogue, registry, [read('dialogue')], { clock });
    expect((await dialogue.sentences.all()).sort((a, b) => a.index - b.index).map((s) => s.speaker)).toEqual(['Ana', 'Pedro', 'Ana']);
  });
});
