import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import { importDocuments, plainTextToDocuments, validateBatch } from '../../src/ingest';
import { clock, registry } from './helpers';

const TEXT = ['Era una tarde tranquila en el pueblo.', 'Los niños jugaban en la plaza.', 'El abuelo empezó a contar una historia.'].join('\n');
const convert = (over: Partial<Parameters<typeof plainTextToDocuments>[1]> = {}) =>
  plainTextToDocuments(TEXT, { lang: 'es', title: 'Mi cuento', author: 'Ana', chapters: 'none', ...over });

describe('plainTextToDocuments: ownership', () => {
  it('the default is a personal copy, exactly as before', () => {
    const [d] = convert({ copyNote: 'my paperback' }).documents;
    expect(d.source.rights).toBe('personal-copy');
    expect(d.source.authorship).toBe('published');
    expect(d.source.attribution).toBe('Mi cuento — Ana. Your own copy; not distributed.');
    expect(d.source.provenance).toBe('Supplied by the learner from a personal copy (my paperback); transcription not checked.');
    expect(d.source.licenseNote).toBe('Personal copy: kept on this device, never bundled or shared.');
    expect('teamText' in d).toBe(false);
    expect(convert({ ownership: 'personal-copy', copyNote: 'my paperback' }).documents[0].source).toEqual(d.source);
  });

  it('team-authored: owner-authored, human, credited to the team, still in "Your books"', () => {
    const by = 'the Honduras team';
    const [d] = convert({ ownership: { kind: 'team-authored', by } }).documents;
    expect(d.source.rights).toBe('owner-authored');
    expect(d.source.authorship).toBe('human');
    expect(d.source.attribution).toBe(`Mi cuento — Ana. Written by ${by}.`);
    expect(d.source.provenance).toBe(`Supplied by ${by} as their own writing.`);
    expect(d.source.licenseNote).toBe(`Written by ${by}; theirs to share with their team.`);
    expect(d.corpus).toEqual({ id: 'personal-es', kind: 'comprehensible-input', title: 'Your books' });
    expect((d as unknown as { teamText?: unknown }).teamText).toBe(true);
  });

  it('team-authored without an author leaves the dash out of the attribution', () => {
    const [d] = convert({ author: undefined, ownership: { kind: 'team-authored', by: 'Ana' } }).documents;
    expect(d.source.attribution).toBe('Mi cuento. Written by Ana.');
  });

  it('team-authored documents validate and import as texts that are not personal copies', async () => {
    const { documents } = convert({ ownership: { kind: 'team-authored', by: 'the Honduras team' } });
    const batch = validateBatch(documents, { registry });
    expect(batch.ok).toBe(true);
    for (const d of batch.documents) expect(d.issues.filter((i) => i.severity === 'error'), d.id).toEqual([]);

    const store = createMemoryStore();
    const r = await importDocuments(store, registry, documents, { clock });
    expect(r.ok).toBe(true);
    const text = (await store.texts.all())[0];
    expect(text.personalCopy).not.toBe(true);
    expect((await store.sources.get(text.sourceId))!.rights).toBe('owner-authored');
  });

  it('a personal copy still imports as a personal copy', async () => {
    const store = createMemoryStore();
    const r = await importDocuments(store, registry, convert().documents, { clock });
    expect(r.ok).toBe(true);
    const text = (await store.texts.all())[0];
    expect(text.personalCopy).toBe(true);
    expect((await store.sources.get(text.sourceId))!.rights).toBe('personal-copy');
  });
});
