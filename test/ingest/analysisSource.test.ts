import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import { ingestDocument } from '../../src/ingest';
import { baseDoc, clock, registry } from './helpers';

describe('analysis source descriptor snapshots', () => {
  it('persists the adapter source descriptor with the analysis so later registry edits do not rewrite history', async () => {
    const store = createMemoryStore();
    const doc = baseDoc();
    doc.id = 'source-snapshot';
    doc.sections = [{ paragraphs: [{ sentences: [{ text: 'Hola.' }] }] }];
    await ingestDocument(store, registry, doc, { clock });
    const textId = 'text:es:source-snapshot';
    const token = (await store.tokens.where('textId', textId)).find((t) => t.isWord)!;
    const analysis = (await store.analyses.where('tokenId', token.id))[0]!;
    const descriptor = registry.get('es').sources?.[analysis.sourceId!];
    expect(descriptor).toBeDefined();
    expect(analysis.sourceInfo).toEqual(descriptor);

    // A later installed adapter may reuse a source ID with different wording/review metadata. The imported analysis
    // keeps the exact versioned descriptor that accompanied its original analysis.
    const changed = { ...descriptor!, label: 'Renamed current source', reviewStatus: 'external' as const, version: 'future' };
    const currentAdapter = registry.get('es');
    const changedAdapter = { ...currentAdapter, sources: { ...currentAdapter.sources, [analysis.sourceId!]: changed } };
    expect(changedAdapter.sources[analysis.sourceId!]).not.toEqual(analysis.sourceInfo);
    expect((await store.analyses.get(analysis.id))?.sourceInfo).toEqual(descriptor);
  });
});
