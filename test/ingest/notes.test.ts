import { describe, expect, it } from 'vitest';
import { createMemoryStore, hash, ids } from '../../src/core';
import { importDocuments, type CorpusDocument, type DocDocumentNote, type DocNote } from '../../src/ingest';
import { clock, countWrites, errorCodes, issuesOf, registry, snapshot } from './helpers';
import { CAT, SCHOOL, bookDoc, thAdapter } from './book';

const TEXT_ID = 'text:th:book-ch01';
const school = thAdapter.tokenize(SCHOOL); // ฉัน | ไป | โรงเรียน
const AGAIN = `${SCHOOL}อีก`; // a second sentence that also contains "โรงเรียน"

/** Two declared sentences (author ids a and b), with the given notes on each and on the document. */
const declared = (a: DocNote[] = [], b: DocNote[] = [], doc: DocDocumentNote[] = []): CorpusDocument => ({
  ...bookDoc(),
  sections: [{ paragraphs: [{ sentences: [{ id: 'a', text: SCHOOL, ...(a.length ? { notes: a } : {}) }, { id: 'b', text: CAT, ...(b.length ? { notes: b } : {}) }] }] }],
  ...(doc.length ? { notes: doc } : {}),
});

const cultural = (body: string, over: Partial<DocNote> = {}): DocNote => ({ kind: 'cultural', body, ...over });
const errs = (d: unknown) => issuesOf(d).filter((i) => i.severity === 'error').map((i) => i.code);

describe('notes: shape, defaults and validation', () => {
  it('a note on a sentence is stored as a ContentNote with token ids, spans, topics and defaults', async () => {
    const store = createMemoryStore();
    const doc = declared([
      cultural('About school', { start: school[1].start, end: school[2].end, topics: ['school'] }),
      { kind: 'clause-structure', body: 'Subject, then verb and place', spans: [{ start: 0, end: 3, label: 'subject' }, { start: 3, end: SCHOOL.length, label: 'predicate' }] },
    ]);
    expect(errs(doc)).toEqual([]);
    const r = await importDocuments(store, registry, [doc], { clock });
    expect(r.ok).toBe(true);
    const notes = await store.notes.where('textId', TEXT_ID);
    expect(notes).toHaveLength(2);
    const sentenceA = (await store.sentences.where('textId', TEXT_ID)).find((s) => s.key === 'a')!;
    const tokens = (await store.tokens.where('sentenceId', sentenceA.id)).sort((x, y) => x.index - y.index);
    const c = notes.find((n) => n.kind === 'cultural')!;
    expect(c).toEqual({
      id: ids.note(TEXT_ID, hash('a|cultural|About school')), textId: TEXT_ID, lang: 'th', sentenceId: sentenceA.id,
      tokenIds: [tokens[1].id, tokens[2].id], kind: 'cultural', body: 'About school', topics: ['school'], provenance: 'human', reviewStatus: 'approved',
    });
    const s = notes.find((n) => n.kind === 'clause-structure')!;
    expect(s.spans).toEqual([{ start: 0, end: 3, label: 'subject' }, { start: 3, end: SCHOOL.length, label: 'predicate' }]);
    expect(s.tokenIds).toBeUndefined(); // a whole-sentence note
    expect(s.sentenceId).toBe(sentenceA.id);
  });

  it('a human note is approved by default; a machine note is stored but flagged unreviewed until a named person reviews it', async () => {
    const store = createMemoryStore();
    const doc = declared([
      cultural('human'),
      cultural('machine', { provenance: 'machine' }),
      cultural('machine, checked', { provenance: 'machine', reviewStatus: 'reviewed', by: 'Khun Somchai' }),
      cultural('human, in review', { reviewStatus: 'in-review' }),
    ]);
    expect(errs(doc)).toEqual([]);
    await importDocuments(store, registry, [doc], { clock });
    const by = new Map((await store.notes.all()).map((n) => [n.body, n]));
    expect(by.get('human')).toMatchObject({ provenance: 'human', reviewStatus: 'approved' });
    expect(by.get('machine')).toMatchObject({ provenance: 'machine', reviewStatus: 'unreviewed' });
    expect(by.get('machine, checked')).toMatchObject({ provenance: 'machine', reviewStatus: 'reviewed' });
    expect(by.get('human, in review')!.reviewStatus).toBe('in-review');

    const anonymous = declared([cultural('x', { provenance: 'machine', reviewStatus: 'approved' })]);
    expect(errs(anonymous)).toEqual(['review-missing-reviewer']);
  });

  it('rejects malformed notes with a code and a fix', () => {
    const bad = (n: unknown) => errs({ ...declared(), sections: [{ paragraphs: [{ sentences: [{ text: SCHOOL, notes: n }] }] }] });
    expect(bad('x')).toEqual(['invalid-value']);
    expect(bad(['x'])).toEqual(['invalid-value']);
    expect(bad([{ body: 'no kind' }])).toEqual(['invalid-value']);
    expect(bad([{ kind: 'cultural' }])).toEqual(['missing-field']);
    expect(bad([{ kind: 'cultural', body: '  ' }])).toEqual(['missing-field']);
    expect(bad([{ kind: 'gossip', body: 'x' }])).toEqual(['invalid-value']);
    expect(bad([{ kind: 'cultural', body: 'x', provenance: 'robot' }])).toEqual(['invalid-value']);
    expect(bad([{ kind: 'cultural', body: 'x', reviewStatus: 'great' }])).toEqual(['invalid-value']);
    expect(bad([{ kind: 'cultural', body: 'x', topics: [1] }])).toEqual(['invalid-value']);
    expect(bad([{ kind: 'cultural', body: 'x', by: '' }])).toEqual(['invalid-value']);
    expect(bad([{ kind: 'cultural', body: 'x', surprise: 1 }]).length).toBe(0); // unknown field is only a warning
  });

  it('start/end go together, lie inside the sentence and sit on word boundaries', () => {
    const bad = (n: Partial<DocNote>) => errs(declared([cultural('x', n)]));
    const ok = { start: school[1].start, end: school[2].end };
    expect(bad(ok)).toEqual([]);
    expect(bad({ start: 0, end: SCHOOL.length })).toEqual([]);
    expect(bad({ start: 0 })).toEqual(['invalid-value']);
    expect(bad({ end: 3 })).toEqual(['invalid-value']);
    expect(bad({ start: 3, end: 3 })).toEqual(['span-empty']);
    expect(bad({ start: 5, end: 3 })).toEqual(['span-empty']);
    expect(bad({ start: 0, end: SCHOOL.length + 1 })).toEqual(['span-out-of-bounds']);
    expect(bad({ start: -1, end: 3 })).toEqual(['span-out-of-bounds']);
    expect(bad({ start: 1, end: 3 })).toEqual(['note-not-on-token']); // inside ฉัน
    expect(bad({ start: 0, end: 4 })).toEqual(['note-not-on-token']);
    expect(bad({ start: 0.5, end: 3 })).toEqual(['invalid-value']);
    const hint = issuesOf(declared([cultural('x', { start: 1, end: 3 })])).find((i) => i.code === 'note-not-on-token')!;
    expect(hint.path).toBe('sections[0].paragraphs[0].sentences[0].notes[0]');
    expect(hint.hint).toMatch(/Words here/);
  });

  it('spans only need to lie inside the sentence, on character boundaries, with a label', () => {
    const bad = (spans: unknown) => errs(declared([{ kind: 'clause-structure', body: 'x', spans: spans as DocNote['spans'] }]));
    expect(bad([{ start: 1, end: 2, label: 'inside a word is fine' }])).toEqual(['span-not-grapheme-boundary']); // splits ฉ from its vowel mark
    expect(bad([{ start: 0, end: 3, label: 'ok' }, { start: 2, end: 13, label: 'overlap is fine' }]).filter((c) => c !== 'span-not-grapheme-boundary')).toEqual([]);
    expect(bad([{ start: 0, end: SCHOOL.length + 5, label: 'x' }])).toEqual(['span-out-of-bounds']);
    expect(bad([{ start: 3, end: 3, label: 'x' }])).toEqual(['span-empty']);
    expect(bad([{ start: 0, end: 3 }])).toEqual(['invalid-value']);
    expect(bad('x')).toEqual(['invalid-value']);
  });
});

describe('document-level notes: anchoring by the exact text of a sentence', () => {
  const rawDoc = (notes: unknown[]): CorpusDocument => ({
    ...bookDoc(), sections: [{ paragraphs: [{ text: SCHOOL }, { text: CAT }, { text: AGAIN }] }], notes: notes as DocDocumentNote[],
  });

  it('attaches to the first sentence containing match, or the occurrence-th; works for raw paragraphs', async () => {
    const store = createMemoryStore();
    const doc = rawDoc([
      { match: 'โรงเรียน', kind: 'cultural', body: 'first school sentence' },
      { match: 'โรงเรียน', occurrence: 2, kind: 'cultural', body: 'second school sentence' },
      { match: 'แมว', kind: 'regional', body: 'cat' },
      { match: 'โรงเรียน', occurrence: 1, kind: 'register', body: 'explicit first' },
    ]);
    expect(errs(doc)).toEqual([]);
    expect((await importDocuments(store, registry, [doc], { clock })).ok).toBe(true);
    const sentences = (await store.sentences.where('textId', TEXT_ID)).sort((x, y) => x.index - y.index);
    expect(sentences.map((s) => s.text)).toEqual([SCHOOL, CAT, AGAIN]);
    const all = await store.notes.all();
    const at = (body: string) => sentences.findIndex((s) => s.id === all.find((n) => n.body === body)!.sentenceId);
    expect(at('first school sentence')).toBe(0);
    expect(at('second school sentence')).toBe(2);
    expect(at('cat')).toBe(1);
    expect(at('explicit first')).toBe(0);
  });

  it('is matched exactly (no normalisation, no trimming); a miss is note-anchor-missing and the batch imports nothing', async () => {
    for (const note of [
      { match: 'หมา', kind: 'cultural', body: 'x' }, // appears nowhere
      { match: 'โรงเรียน', occurrence: 3, kind: 'cultural', body: 'x' }, // only two sentences contain it
      { match: 'แมว นั่ง', kind: 'cultural', body: 'x' }, // a space the text does not have
    ]) {
      const doc = rawDoc([note]);
      const issues = issuesOf(doc).filter((i) => i.severity === 'error');
      expect(issues.map((i) => i.code), JSON.stringify(note)).toEqual(['note-anchor-missing']);
      expect(issues[0].path).toBe('notes[0].match');
      const store = createMemoryStore();
      const r = await importDocuments(store, registry, [doc], { clock });
      expect(r.ok).toBe(false);
      expect(await store.texts.all()).toEqual([]);
      expect(await store.notes.all()).toEqual([]);
    }
  });

  it('malformed document-level notes', () => {
    expect(errs(rawDoc([{ kind: 'cultural', body: 'x' }]))).toEqual(['missing-field']); // no match
    expect(errs(rawDoc([{ match: '', kind: 'cultural', body: 'x' }]))).toEqual(['missing-field']);
    expect(errs(rawDoc([{ match: 'แมว', occurrence: 0, kind: 'cultural', body: 'x' }]))).toEqual(['invalid-value']);
    expect(errs(rawDoc([{ match: 'แมว', occurrence: 1.5, kind: 'cultural', body: 'x' }]))).toEqual(['invalid-value']);
    expect(errs({ ...rawDoc([]), notes: 'x' })).toEqual(['invalid-value']);
    expect(errs(rawDoc(['x']))).toEqual(['invalid-value']);
  });

  it('start/end of a document-level note are checked against the sentence it is anchored to', () => {
    const at = (start: number, end: number) => errs(rawDoc([{ match: 'แมว', kind: 'cultural', body: 'x', start, end }]));
    const cat = thAdapter.tokenize(CAT);
    expect(at(cat[0].start, cat[0].end)).toEqual([]);
    expect(at(1, 2)).toEqual(['note-not-on-token']);
    expect(at(0, CAT.length + 9)).toEqual(['span-out-of-bounds']);
  });
});

describe('notes in the store: replaced with the text, repeatable, versioned', () => {
  it('re-importing unchanged writes nothing and keeps every note id', async () => {
    const store = createMemoryStore();
    const doc = declared([cultural('one'), cultural('two', { start: 0, end: 3 })], [{ kind: 'literary', body: 'three' }], [{ match: 'แมว', kind: 'regional', body: 'four' }]);
    await importDocuments(store, registry, [doc], { clock });
    const before = await snapshot(store);
    const noteIds = (await store.notes.all()).map((n) => n.id).sort();
    expect(noteIds).toHaveLength(4);
    const w = countWrites(store);
    const again = await importDocuments(store, registry, [structuredClone(doc)], { clock });
    expect(again.documents[0].action).toBe('unchanged');
    expect(w.count()).toBe(0);
    expect((await store.notes.all()).map((n) => n.id).sort()).toEqual(noteIds);
    expect(await snapshot(store)).toEqual(before);
  });

  it('editing a note body replaces it; adding and removing notes follows the file; a notes-only edit does not bump the content version', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [declared([cultural('old')])], { clock });
    const oldId = (await store.notes.all())[0].id;

    const edited = await importDocuments(store, registry, [declared([cultural('new'), cultural('extra')])], { clock });
    expect(edited.documents[0]).toMatchObject({ action: 'updated', contentVersion: 1, sentencesAdded: 0, sentencesRetired: 0 });
    const rows = await store.notes.all();
    expect(rows.map((n) => n.body).sort()).toEqual(['extra', 'new']);
    expect(rows.some((n) => n.id === oldId)).toBe(false);

    const removed = await importDocuments(store, registry, [declared()], { clock });
    expect(removed.documents[0].action).toBe('updated');
    expect(await store.notes.all()).toEqual([]);
    const log = (await store.texts.get(TEXT_ID))!.transformations.filter((t) => t.tool === 'notes').map((t) => t.description);
    expect(log).toEqual([expect.stringMatching(/^1 note\(s\) stored/), expect.stringMatching(/^2 note\(s\) stored.*1 earlier note\(s\) replaced/), '2 note(s) removed']);
  });

  it('revising a chapter: version bump, the changed sentence takes a new key and its notes move with it; the others keep theirs', async () => {
    const store = createMemoryStore();
    const v1 = declared([cultural('on a')], [cultural('on b')]);
    await importDocuments(store, registry, [v1], { clock });
    const first = new Map((await store.notes.all()).map((n) => [n.body, n]));

    const v2 = declared([cultural('on a')], [cultural('on b')]);
    (v2.sections[0].paragraphs[0] as { sentences: Array<{ text: string }> }).sentences[0].text = `${SCHOOL}วันนี้`; // sentence a is reworded
    const r = await importDocuments(store, registry, [v2], { clock });
    expect(r.documents[0]).toMatchObject({ action: 'updated', contentVersion: 2, sentencesAdded: 1, sentencesRetired: 1 });

    const second = new Map((await store.notes.all()).map((n) => [n.body, n]));
    expect(second.size).toBe(2);
    expect(second.get('on b')!.id).toBe(first.get('on b')!.id); // untouched sentence: same note
    expect(second.get('on a')!.id).not.toBe(first.get('on a')!.id); // reworded sentence: its note was replaced
    const live = (await store.sentences.where('textId', TEXT_ID)).filter((s) => s.retiredInVersion === undefined);
    for (const n of second.values()) expect(live.some((s) => s.id === n.sentenceId)).toBe(true); // nothing points at a retired sentence
    expect(second.get('on a')!.sentenceId).toBe(live.find((s) => s.text === `${SCHOOL}วันนี้`)!.id);

    // reverting revives the original sentence id and the original note id
    const back = await importDocuments(store, registry, [v1], { clock });
    expect(back.documents[0].contentVersion).toBe(3);
    const third = new Map((await store.notes.all()).map((n) => [n.body, n]));
    expect(third.get('on a')!.id).toBe(first.get('on a')!.id);
  });

  it('two identical notes on one sentence stay two notes', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [declared([cultural('same'), cultural('same', { start: 0, end: 3 })])], { clock });
    const rows = await store.notes.all();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((n) => n.id)).size).toBe(2);
  });

  it('the log says who wrote the notes and how many are machine / unreviewed; a rejected batch writes no notes', async () => {
    const store = createMemoryStore();
    await importDocuments(store, registry, [declared([cultural('h', { by: 'Khun Somchai' }), cultural('m', { provenance: 'machine', by: 'drafter-1' })])], { clock });
    const line = (await store.texts.get(TEXT_ID))!.transformations.find((t) => t.tool === 'notes')!.description;
    expect(line).toBe('2 note(s) stored (1 human, 1 machine, 1 unreviewed); by Khun Somchai, drafter-1');

    const other = createMemoryStore();
    const broken = declared([cultural('x', { start: 1, end: 2 })]);
    const r = await importDocuments(other, registry, [broken, bookDoc({ id: 'fine' })], { clock });
    expect(r.ok).toBe(false);
    expect(await other.notes.all()).toEqual([]);
    expect(await other.texts.all()).toEqual([]);
    expect(errorCodes(broken)).toEqual(['note-not-on-token']);
  });
});
