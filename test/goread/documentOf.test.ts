import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import type { AppStore } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { importDocuments, validateBatch } from '../../src/ingest';
import type { CorpusDocument, DocParagraphRaw, DocParagraphSentences } from '../../src/ingest';
import { documentOf } from '../../src/goread/documentOf';

const registry = createAdapterRegistry();

const P1 = 'Don Elías salió de su casa temprano. Caminó hasta el río, y allí encontró a su hermano.';
const P2 = '«¿Adónde vas?», preguntó el hermano.\nNo lo sé todavía — respondió Elías.';
const P3 = 'Al final del día, los dos volvieron juntos a casa. Hablaron  poco, pero estaban contentos.';

function base(over: Partial<CorpusDocument> = {}): CorpusDocument {
  return {
    schemaVersion: 2, id: 'el-viajero-ch01', lang: 'es', locale: 'es-HN', title: 'El viajero — La llegada', contentType: 'story',
    corpus: { id: 'ci-es', kind: 'comprehensible-input', title: 'Comprehensible input - Spanish' },
    source: {
      id: 'src:es:el-viajero', title: 'El viajero (equipo)', author: 'Ana Ruiz', attribution: 'Escrito por el equipo.',
      provenance: 'Written by the team for its own reading. Nothing is copied.', rights: 'owner-authored', authorship: 'human',
    },
    review: { status: 'reviewed', reviewedBy: 'Ana Ruiz (native speaker)', reviewedAt: '2026-10-01', notes: 'checked: wording and glosses' },
    difficulty: 'A2', topics: ['daily-life'], editorialTags: ['team'], prepTargets: [], generated: false,
    sections: [{ paragraphs: [{ text: P1 }, { text: P2 }] }],
    ...over,
  };
}

async function imported(docs: CorpusDocument[], store: AppStore = createMemoryStore()) {
  const report = await importDocuments(store, registry, docs, { clock: () => '2026-10-02T08:00:00.000Z' });
  expect(report.ok).toBe(true);
  return store;
}

/** Every paragraph's text of a document, in order (a sentence paragraph is the sentences joined with its separator). */
function paragraphTexts(doc: CorpusDocument): string[] {
  return doc.sections.flatMap((s) => s.paragraphs.map((p) => ('text' in p ? (p as DocParagraphRaw).text : (p as DocParagraphSentences).sentences.map((x) => x.text).join((p as DocParagraphSentences).separator ?? ' '))));
}

/** A reviewed text always carries the note that the kind of review is not stored; nothing else is lost in these rebuilds. */
const notReviewLevel = (n: string): boolean => !/kind of review/.test(n);

function expectValid(doc: CorpusDocument) {
  const v = validateBatch([doc], { registry });
  expect(v.documents[0].issues.filter((i) => i.severity === 'error')).toEqual([]);
  expect(v.ok).toBe(true);
}

describe('documentOf', () => {
  it('round trip: the rebuilt document validates, re-imports, and carries the paragraphs byte for byte', async () => {
    const original = base();
    const store = await imported([original]);
    const { document, notes } = await documentOf(store, 'text:es:el-viajero-ch01');
    expectValid(document);
    expect(paragraphTexts(document)).toEqual([P1, P2]);
    expect(document.id).toBe('el-viajero-ch01');
    expect(document.schemaVersion).toBe(2);
    expect(document.lang).toBe('es');
    expect(document.locale).toBe('es-HN');
    expect(document.title).toBe(original.title);
    expect(document.contentType).toBe('story');
    expect(document.corpus).toEqual(original.corpus);
    expect(document.source).toEqual(original.source);
    expect(document.review).toEqual(original.review);
    expect(document.difficulty).toBe('A2');
    expect(document.topics).toEqual(['daily-life']);
    expect(document.editorialTags).toEqual(['team']);
    expect(document.prepTargets).toEqual([]);
    expect(document.generated).toBe(false);
    expect(document.work).toBeUndefined();
    expect(document.english).toBeUndefined();
    // the document is plain JSON: no undefined holes
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
    expect(notes.filter(notReviewLevel)).toEqual([]);

    // importing it into a fresh store gives the same running text, sentence for sentence
    const other = await imported([document]);
    const key = (s: { index: number; text: string; retiredInVersion?: number }) => `${s.index}:${s.text}`;
    const mine = (await store.sentences.where('textId', 'text:es:el-viajero-ch01')).map(key).sort();
    const theirs = (await other.sentences.where('textId', 'text:es:el-viajero-ch01')).map(key).sort();
    expect(theirs).toEqual(mine);
    expect(theirs.length).toBeGreaterThan(3);
    // and rebuilding that gives the same document again
    expect((await documentOf(other, 'text:es:el-viajero-ch01')).document).toEqual(document);
  });

  it('teamText round trips: the flag comes back, the rebuilt document validates and re-imports as a published team text', async () => {
    const store = await imported([base({ id: 'nuestro', teamText: true, review: { status: 'unreviewed' } })]);
    expect((await store.texts.get('text:es:nuestro'))?.teamText).toBe(true);
    const { document } = await documentOf(store, 'text:es:nuestro');
    expect(document.teamText).toBe(true);
    expectValid(document);
    const other = await imported([document]);
    expect(await other.texts.get('text:es:nuestro')).toMatchObject({ published: true, teamText: true });
    // a text without the flag does not get one
    const plain = await imported([base({ id: 'comun' })]);
    expect((await documentOf(plain, 'text:es:comun')).document.teamText).toBeUndefined();
  });

  it('a two-chapter document: section titles, a work and its chapter come back', async () => {
    const original = base({
      id: 'el-viajero', title: 'El viajero',
      work: { slug: 'el-viajero', chapter: { index: 2, title: 'El río' } },
      streams: ['library'], domains: ['honduras'], variety: 'es-HN',
      sections: [
        { title: 'Capítulo 1 — La salida', paragraphs: [{ text: P1 }] },
        { title: 'Capítulo 2 — El río', paragraphs: [{ text: P2 }, { text: P3 }] },
      ],
    });
    const store = await imported([original]);
    const { document, notes } = await documentOf(store, 'text:es:el-viajero');
    expectValid(document);
    expect(document.sections.map((s) => s.title)).toEqual(['Capítulo 1 — La salida', 'Capítulo 2 — El río']);
    expect(document.sections.map((s) => s.paragraphs.length)).toEqual([1, 2]);
    expect(paragraphTexts(document)).toEqual([P1, P2, P3]);
    expect(document.work).toEqual({ slug: 'el-viajero', chapter: { index: 2, title: 'El río' } });
    expect(document.streams).toEqual(['library']);
    expect(document.domains).toEqual(['honduras']);
    expect(document.variety).toBe('es-HN');
    expect(notes.filter(notReviewLevel)).toEqual([]);

    // the work and chapter reach the new store's Text again
    const other = await imported([document]);
    const text = await other.texts.get('text:es:el-viajero');
    expect(text?.workId).toBe('work:honduras-es:el-viajero');
    expect(text?.chapter).toEqual({ index: 2, title: 'El río' });
  });

  it('two chapters as two documents of one work keep their own ids and chapter order', async () => {
    const a = base({ id: 'libro-ch01', work: { slug: 'libro', chapter: { index: 1 } } });
    const b = base({ id: 'libro-ch02', work: { slug: 'libro', chapter: { index: 2, title: 'Dos' } }, sections: [{ title: 'Dos', paragraphs: [{ text: P3 }] }] });
    const store = await imported([a, b]);
    const one = (await documentOf(store, 'text:es:libro-ch01')).document;
    const two = (await documentOf(store, 'text:es:libro-ch02')).document;
    expect([one.id, two.id]).toEqual(['libro-ch01', 'libro-ch02']);
    expect(two.work?.chapter).toEqual({ index: 2, title: 'Dos' });
    expect(one.work?.chapter).toEqual({ index: 1 });
    expectValid(one);
    expectValid(two);
  });

  it('English lines and speakers are kept by writing the paragraph sentence by sentence', async () => {
    const original = base({
      id: 'dialogo-01', contentType: 'dialogue', speakers: { A: 'Ana', B: 'Pedro' }, english: { source: 'Written by the team' },
      sections: [{
        paragraphs: [
          { sentences: [
            { text: 'Hola, ¿cómo estás?', english: 'Hello, how are you?', speaker: 'A' },
            { text: 'Muy bien, gracias.', english: 'Very well, thanks.', speaker: 'B' },
          ] },
          { sentences: [{ text: 'Nos vemos mañana.', english: 'See you tomorrow.', speaker: 'A' }, { text: 'Hasta luego.', speaker: 'B' }], separator: '\n' },
        ],
      }],
    });
    const store = await imported([original]);
    const { document, notes } = await documentOf(store, 'text:es:dialogo-01');
    expectValid(document);
    expect(document.english).toEqual({ source: 'Written by the team' });
    expect(document.speakers).toEqual({ Ana: 'Ana', Pedro: 'Pedro' });
    const [p1, p2] = document.sections[0].paragraphs as DocParagraphSentences[];
    expect(p1.sentences).toEqual([
      { text: 'Hola, ¿cómo estás?', english: 'Hello, how are you?', speaker: 'Ana' },
      { text: 'Muy bien, gracias.', english: 'Very well, thanks.', speaker: 'Pedro' },
    ]);
    expect(p1.separator).toBeUndefined();
    expect(p2.separator).toBe('\n');
    expect(p2.sentences[1]).toEqual({ text: 'Hasta luego.', speaker: 'Pedro' });
    expect(notes.filter(notReviewLevel)).toEqual([]);

    // the paragraphs are byte for byte what the store holds
    const rows = (await store.paragraphs.where('textId', 'text:es:dialogo-01')).sort((a, b) => a.index - b.index);
    expect(paragraphTexts(document)).toEqual(rows.map((r) => r.originalText));
    // and the rebuilt document re-imports to the same Text paragraphs
    const other = await imported([document]);
    const again = (await other.paragraphs.where('textId', 'text:es:dialogo-01')).sort((a, b) => a.index - b.index);
    expect(again.map((r) => r.originalText)).toEqual(rows.map((r) => r.originalText));
  });

  it('a changed text is rebuilt from its current sentences, not its retired ones', async () => {
    const store = await imported([base()]);
    await importDocuments(store, registry, [base({ sections: [{ paragraphs: [{ text: P3 }] }] })], { clock: () => '2026-10-03T08:00:00.000Z' });
    const { document } = await documentOf(store, 'text:es:el-viajero-ch01');
    expect(paragraphTexts(document)).toEqual([P3]);
    expectValid(document);
  });

  it('a paragraph without originalText falls back to its sentences, and says so', async () => {
    const store = await imported([base({ sections: [{ paragraphs: [{ text: P1 }] }] })]);
    const [row] = await store.paragraphs.where('textId', 'text:es:el-viajero-ch01');
    const { originalText: _drop, ...bare } = row;
    await store.paragraphs.put(bare);
    const { document, notes } = await documentOf(store, 'text:es:el-viajero-ch01');
    expect(paragraphTexts(document)).toEqual([P1]);
    expect(notes.some((n) => /no stored original text/.test(n))).toBe(true);
    expectValid(document);
  });

  it('says what it cannot carry: sentence notes, author sentence ids, a missing reviewer, a missing corpus row', async () => {
    const store = await imported([base({
      sections: [{ paragraphs: [{ sentences: [{ id: 's1', text: 'Hola.', notes: [{ kind: 'regional', body: 'saludo' }] }] }] }],
    })]);
    const { notes } = await documentOf(store, 'text:es:el-viajero-ch01');
    expect(notes.some((n) => /note\(s\) on the text are not in the document/.test(n))).toBe(true);
    expect(notes.some((n) => /author-chosen ids/.test(n))).toBe(true);
    expect(notes.some((n) => /kind of review/.test(n))).toBe(true);

    await store.corpora.delete('ci-es');
    const again = await documentOf(store, 'text:es:el-viajero-ch01');
    expect(again.notes.some((n) => /corpus ci-es is not on this device/.test(n))).toBe(true);
    expect(again.document.corpus).toEqual({ id: 'ci-es', kind: 'comprehensible-input', title: 'ci-es' });
  });

  it('a text that is not on the device is an error', async () => {
    await expect(documentOf(createMemoryStore(), 'text:es:nope')).rejects.toThrow(/no text/);
  });
});
