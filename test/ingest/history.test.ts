import { describe, expect, it } from 'vitest';
import { createMemoryStore, ids, type AppStore, type TokenAnalysis } from '../../src/core';
import { contentHistory, importDocuments, type CorpusDocument } from '../../src/ingest';
import { baseDoc, registry, snapshot } from './helpers';

const textId = ids.text('es', 'hist');
const story = (texts: string[]): CorpusDocument => {
  const d = baseDoc();
  d.id = 'hist';
  d.source = { ...d.source, id: 'src:hist' };
  d.sections = [{ paragraphs: [{ sentences: texts.map((text) => ({ text })) }] }];
  delete d.english;
  return d;
};
const ORIGINAL = ['Dios ama al mundo.', 'Yo creo en Dios.', 'Ahora tengo paz.'];
const REVISED = ['Dios ama al mundo.', 'Yo no creo en Dios.', 'Ahora tengo paz.'];
const key = (t: string) => ids.sentenceKey(t, 0);
const all = async (store: AppStore) => (await store.sentences.where('textId', textId)).sort((a, b) => a.index - b.index);
const live = async (store: AppStore) => (await all(store)).filter((s) => s.retiredInVersion === undefined);
const analysesOf = async (store: AppStore, sentenceId: string): Promise<TokenAnalysis[]> => {
  const out: TokenAnalysis[] = [];
  for (const t of await store.tokens.where('sentenceId', sentenceId)) out.push(...(await store.analyses.where('tokenId', t.id)));
  return out.sort((a, b) => a.id.localeCompare(b.id));
};
const at = (day: string) => () => `${day}T00:00:00.000Z`;

describe('revision history (contentHistory + the version records the importer appends)', () => {
  it('the first import records version 1; metadata-only and repeated imports add no version record', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [story(ORIGINAL)], { clock: at('2026-01-01') });
    const t = (await store.texts.get(textId))!;
    const h = contentHistory(t);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ version: 1, at: '2026-01-01T00:00:00.000Z' });
    expect(h[0].summary).toMatch(/^content version 1 \(created\): 3 sentence\(s\) \[.*\]; \d+ analysis row\(s\) written$/);
    for (const k of ORIGINAL.map(key)) expect(h[0].summary).toContain(k);
    const rec = t.transformations.filter((x) => x.description.startsWith('content version '));
    expect(rec).toHaveLength(1);
    expect(rec[0].tool).toBe('ingest@2');

    const meta = story(ORIGINAL); meta.title = 'Renamed';
    await importDocuments(store, registry, [meta], { clock: at('2026-01-02') });
    await importDocuments(store, registry, [meta], { clock: at('2026-01-03') });
    expect(contentHistory((await store.texts.get(textId))!)).toHaveLength(1);
  });

  it('a revision appends from → to, the keys added and retired, and the analysis rows written; retired sentences keep tokens and analyses; encounters are untouched', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [story(ORIGINAL)], { clock: at('2026-01-01') });
    const [a0, b0, c0] = await live(store);
    const analysesB = await analysesOf(store, b0.id);
    const tokensB = (await store.tokens.where('sentenceId', b0.id)).sort((x, y) => x.index - y.index);
    expect(tokensB.length).toBeGreaterThan(0);
    expect(analysesB.length).toBeGreaterThan(0);
    // learner state that must survive any revision
    const encounter = { id: 'enc-b', userId: 'u1', lang: 'es', itemId: 'form:es:creo', sentenceId: b0.id, textId, evidenceKind: 'exposure', contentVersion: 1 };
    const enc2 = { ...encounter, id: 'enc-a', sentenceId: a0.id };
    await store.encounters.put(encounter as never);
    await store.encounters.put(enc2 as never);
    await store.events.put({ id: 'ev-b', type: 'SentenceViewed', userId: 'u1', sentenceId: b0.id, contentVersion: 1 } as never);
    const encountersBefore = await store.encounters.all();
    const eventsBefore = await store.events.all();

    const r = await importDocuments(store, registry, [story(REVISED)], { clock: at('2026-02-01') });
    expect(r.documents[0]).toMatchObject({ action: 'updated', contentVersion: 2, sentencesAdded: 1, sentencesRetired: 1 });

    const t = (await store.texts.get(textId))!;
    const h = contentHistory(t);
    expect(h.map((e) => e.version)).toEqual([1, 2]);
    expect(h[1].at).toBe('2026-02-01T00:00:00.000Z');
    const newKey = key(REVISED[1]);
    expect(h[1].summary).toBe(`content version 1 → 2: added [${newKey}], retired [${key(ORIGINAL[1])}]; ${(await analysesOf(store, (await live(store))[1].id)).length} analysis row(s) written`);

    // retired sentence: still there, with its tokens and analyses exactly as before
    const retired = (await store.sentences.get(b0.id))!;
    expect(retired).toMatchObject({ retiredInVersion: 2, text: ORIGINAL[1], key: key(ORIGINAL[1]) });
    expect((await store.tokens.where('sentenceId', b0.id)).sort((x, y) => x.index - y.index)).toEqual(tokensB);
    expect(await analysesOf(store, b0.id)).toEqual(analysesB);
    // unchanged sentences keep their ids
    expect((await live(store)).map((s) => s.id)).toEqual([a0.id, (await live(store))[1].id, c0.id]);
    // encounters and events are untouched
    expect(await store.encounters.all()).toEqual(encountersBefore);
    expect(await store.events.all()).toEqual(eventsBefore);
  });

  it('re-importing the ORIGINAL after a revision revives the original sentence ids: no new ids, the version still advances, three history entries', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [story(ORIGINAL)], { clock: at('2026-01-01') });
    const originalIds = (await live(store)).map((s) => s.id);
    const originalRows = await all(store);
    await importDocuments(store, registry, [story(REVISED)], { clock: at('2026-02-01') });
    const idsAfterRevision = (await all(store)).map((s) => s.id);
    expect(idsAfterRevision).toHaveLength(4);
    await store.encounters.put({ id: 'enc-1', userId: 'u1', lang: 'es', itemId: 'form:es:creo', sentenceId: originalIds[1], textId, evidenceKind: 'exposure', contentVersion: 1 } as never);
    const encountersBefore = await store.encounters.all();

    const r = await importDocuments(store, registry, [story(ORIGINAL)], { clock: at('2026-03-01') });
    expect(r.documents[0]).toMatchObject({ action: 'updated', contentVersion: 3, sentencesAdded: 1, sentencesRetired: 1 });

    // the live sentences are the original ids; no new sentence id was minted by the third import
    expect((await live(store)).map((s) => s.id)).toEqual(originalIds);
    expect((await all(store)).map((s) => s.id).sort()).toEqual(idsAfterRevision.sort());
    expect(await store.sentences.count()).toBe(4);
    // and the revived sentence is the original row again (same key, same first version), not retired
    const revived = (await store.sentences.get(originalIds[1]))!;
    expect(revived.retiredInVersion).toBeUndefined();
    expect(revived.versionAdded).toBe(originalRows[1].versionAdded);
    expect(revived.key).toBe(originalRows[1].key);
    // the middle revision's sentence is the one that is retired now
    expect((await store.sentences.get(idsAfterRevision.find((i) => !originalIds.includes(i))!))!.retiredInVersion).toBe(3);

    const t = (await store.texts.get(textId))!;
    expect(t.contentVersion).toBe(3);
    const h = contentHistory(t);
    expect(h.map((e) => e.version)).toEqual([1, 2, 3]);
    expect(h[2].summary).toMatch(new RegExp(`^content version 2 → 3: revived \\[${key(ORIGINAL[1])}\\], retired \\[${key(REVISED[1])}\\]; `));
    expect(await store.encounters.all()).toEqual(encountersBefore);
    // the older records are preserved verbatim, in order
    expect(h[0].summary).toMatch(/created/);
    expect(h[1].summary).toMatch(/^content version 1 → 2: added/);
    // doing it again changes nothing at all
    const snap = await snapshot(store);
    const again = await importDocuments(store, registry, [story(ORIGINAL)], { clock: at('2026-04-01') });
    expect(again.documents[0].action).toBe('unchanged');
    expect(await snapshot(store)).toEqual(snap);
    expect(contentHistory((await store.texts.get(textId))!)).toHaveLength(3);
  });

  it('a pure reorder is recorded as a version without added or retired sentences', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [story(ORIGINAL)], { clock: at('2026-01-01') });
    await importDocuments(store, registry, [story([ORIGINAL[2], ORIGINAL[1], ORIGINAL[0]])], { clock: at('2026-02-01') });
    const h = contentHistory((await store.texts.get(textId))!);
    expect(h.map((e) => e.version)).toEqual([1, 2]);
    expect(h[1].summary).toMatch(/^content version 1 → 2: sentence order changed \(no sentence added or retired\); 0 analysis row\(s\) written$/);
  });

  it('author-id sentences are reported by their keys (id and id@version)', async () => {
    const store = createMemoryStore();
    const mk = (t2: string): CorpusDocument => {
      const d = story([]);
      d.sections = [{ paragraphs: [{ sentences: [{ id: 's1', text: 'Dios ama al mundo.' }, { id: 's2', text: t2 }] }] }];
      return d;
    };
    await importDocuments(store, registry, [mk('Yo creo en Dios.')], { clock: at('2026-01-01') });
    await importDocuments(store, registry, [mk('Yo no creo en Dios.')], { clock: at('2026-02-01') });
    const h = contentHistory((await store.texts.get(textId))!);
    expect(h[1].summary).toMatch(/^content version 1 → 2: added \[s2@2\], retired \[s2\]; /);
  });

  it('a very long list of keys is truncated in the summary', async () => {
    const store = createMemoryStore();
    const many = Array.from({ length: 40 }, (_, i) => `Dios ama a la persona número ${'x'.repeat(i + 1)}.`);
    await importDocuments(store, registry, [story(many)], { clock: at('2026-01-01') });
    const h = contentHistory((await store.texts.get(textId))!);
    expect(h[0].summary).toMatch(/… and 20 more/);
  });

  it('a text stored before version records existed still gets one honest entry', () => {
    const h = contentHistory({ transformations: [{ at: 'x', tool: 'review', description: 'review status reviewed' }], contentVersion: 4, importedAt: '2025-01-01T00:00:00.000Z' });
    expect(h).toEqual([{ version: 4, at: '2025-01-01T00:00:00.000Z', summary: expect.stringMatching(/^content version 4: no version records/) }]);
  });
});
