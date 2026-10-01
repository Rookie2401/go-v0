import { describe, expect, it } from 'vitest';
import { createMemoryStore, ids, type AppStore } from '../../src/core';
import { importDocuments, type CorpusDocument } from '../../src/ingest';
import { baseDoc, clock, countWrites, registry } from './helpers';

// "creer en" is a phrase occurrence; "amó … que" gives the preterite pattern occurrence (see the Spanish adapter)
const A = 'Yo creo en Dios.';
const B = 'Porque Dios amó tanto al mundo que dio a su Hijo.';
const A2 = 'Tú crees en Dios.';
const B2 = 'Porque Dios amó al mundo.';
const TEXT_ID = 'text:es:test-doc';

const doc = (a: string, b: string): CorpusDocument => ({
  ...baseDoc(), sections: [{ paragraphs: [{ sentences: [{ text: a, english: 'English A' }, { text: b, english: 'English B' }, { text: 'Hola.', english: 'Hello.' }] }] }],
});

const occs = async (store: AppStore, sentenceIds: string[]) => ({
  phrase: (await store.phraseOccurrences.all()).filter((o) => sentenceIds.includes(o.sentenceId)),
  pattern: (await store.patternOccurrences.all()).filter((o) => sentenceIds.includes(o.sentenceId)),
});
const byText = async (store: AppStore) => {
  const all = await store.sentences.where('textId', TEXT_ID);
  const find = (text: string) => all.find((s) => s.text === text);
  return { all, find };
};

describe('a retired sentence keeps its phrase and pattern occurrences (history, like its tokens and analyses)', () => {
  it('after a revision the occurrences of the retired sentences are still in the store, with their definitions', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [doc(A, B)], { clock });
    const v1 = await byText(store);
    const [a, b] = [v1.find(A)!, v1.find(B)!];
    const before = await occs(store, [a.id, b.id]);
    expect(before.phrase.length).toBeGreaterThan(0);
    expect(before.pattern.length).toBeGreaterThan(0);

    const r = await importDocuments(store, registry, [doc(A2, B2)], { clock });
    expect(r.documents[0]).toMatchObject({ action: 'updated', contentVersion: 2, sentencesRetired: 2 });
    const v2 = await byText(store);
    expect(v2.find(A)!.retiredInVersion).toBe(2);
    expect(v2.find(B)!.retiredInVersion).toBe(2);

    const after = await occs(store, [a.id, b.id]);
    expect(after.phrase).toEqual(before.phrase);
    expect(after.pattern).toEqual(before.pattern);
    // the definitions they point to stay
    for (const o of after.phrase) expect(await store.phrases.get(o.phraseId)).toBeDefined();
    for (const o of after.pattern) expect(await store.patterns.get(o.patternId)).toBeDefined();
    // tokens and analyses stay as before; the English rescue (an aid, not evidence) goes
    expect((await store.tokens.where('sentenceId', a.id)).length).toBeGreaterThan(0);
    expect(await store.rescues.get(ids.rescue(a.id))).toBeUndefined();
    expect(await store.rescues.get(ids.rescue(v2.find(A2)!.id))).toBeDefined();
  });

  it('re-importing the revised document is unchanged and writes nothing', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [doc(A, B)], { clock });
    await importDocuments(store, registry, [doc(A2, B2)], { clock });
    const w = countWrites(store);
    const again = await importDocuments(store, registry, [doc(A2, B2)], { clock });
    expect(again.documents[0]).toMatchObject({ action: 'unchanged', contentVersion: 2 });
    expect(w.count()).toBe(0);
  });

  it('reverting to the original wording brings the sentences back live with their occurrences, without duplicates', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [doc(A, B)], { clock });
    const v1 = await byText(store);
    const [a, b] = [v1.find(A)!, v1.find(B)!];
    const original = await occs(store, [a.id, b.id]);
    await importDocuments(store, registry, [doc(A2, B2)], { clock });
    const v2Ids = (await byText(store)).all.filter((s) => s.text === A2 || s.text === B2).map((s) => s.id);
    const revised = await occs(store, v2Ids);

    const back = await importDocuments(store, registry, [doc(A, B)], { clock });
    expect(back.documents[0]).toMatchObject({ action: 'updated', contentVersion: 3 });
    const v3 = await byText(store);
    expect(v3.find(A)!.id).toBe(a.id); // the original sentence ids come back
    expect(v3.find(A)!.retiredInVersion).toBeUndefined();
    expect(v3.find(B)!.retiredInVersion).toBeUndefined();
    const live = await occs(store, [a.id, b.id]);
    expect(live.phrase).toEqual(original.phrase);
    expect(live.pattern).toEqual(original.pattern);
    // the revision's sentences are history now, and keep theirs
    expect(v3.all.filter((s) => v2Ids.includes(s.id)).every((s) => s.retiredInVersion === 3)).toBe(true);
    expect(await occs(store, v2Ids)).toEqual(revised);
    // no duplicated rows anywhere
    for (const rows of [await store.phraseOccurrences.all(), await store.patternOccurrences.all()]) {
      expect(new Set(rows.map((o) => o.id)).size).toBe(rows.length);
    }
    expect((await store.rescues.get(ids.rescue(a.id)))?.english).toBe('English A');
  });

  it('a failed attempt (rows newer than the Text) is still cleaned completely', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [doc(A, B)], { clock });
    const t = (await store.texts.get(TEXT_ID))!;
    // simulate a crashed revision: a sentence newer than the Text's version with an occurrence
    const orphan = { ...(await byText(store)).find(A)!, id: ids.sentence(TEXT_ID, 'orphan'), key: 'orphan', versionAdded: t.contentVersion + 1, text: 'Otro.' };
    await store.sentences.put(orphan);
    const occ = (await store.phraseOccurrences.all())[0];
    await store.phraseOccurrences.put({ ...occ, id: 'po:orphan', sentenceId: orphan.id });
    await importDocuments(store, registry, [{ ...doc(A, B), title: 'Changed title' }], { clock });
    expect(await store.sentences.get(orphan.id)).toBeUndefined();
    expect(await store.phraseOccurrences.get('po:orphan')).toBeUndefined();
  });
});
