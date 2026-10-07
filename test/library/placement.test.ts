import { describe, expect, it } from 'vitest';
import type { CatalogText } from '../../src/core';
import type { CorpusDocument } from '../../src/ingest';
import { buildLibrary, cleanTitle, placementOf, resegmentLongSentences, type BuildManifest } from '../../src/library/build';
import { median, sentenceWordCounts } from '../../src/library/sentences';
import { parseShard } from '../../src/library/format';
import { registry } from './helpers';
import { PD, cleanInspect, entry, memoryIO } from './fixtures';

const es = registry.get('es');
const DATE = '2026-10-06';

/** A Spanish paragraph of `n` short sentences. */
const paragraph = (n: number): string => Array.from({ length: n }, (_, i) => `La casa de Ana ${i + 1} era pequeña y tenía una mesa.`).join(' ');

const doc = (id: string, paragraphs: unknown[], over: Record<string, unknown> = {}): CorpusDocument => ({
  schemaVersion: 2, id, lang: 'es', title: id, contentType: 'story', corpus: { id: 'ci-es', kind: 'comprehensible-input', title: 'CI' },
  source: { id: `src:es:${id}`, title: id, attribution: 'Test', provenance: 'test', rights: 'public-domain', authorship: 'public-domain' },
  review: { status: 'unreviewed' }, topics: [], editorialTags: [], prepTargets: [], generated: false,
  sections: [{ paragraphs }], ...over,
} as unknown as CorpusDocument);

const buildDocs = async (docs: CorpusDocument[], over: Record<string, unknown> = {}, opts: Record<string, unknown> = {}) => {
  const manifest: BuildManifest = { schema: 1, lang: 'es', entries: [entry({ slug: 'obra', source: { file: 'obra.json', kind: 'documents' }, ...over })] };
  const m = memoryIO({ 'obra.json': JSON.stringify(docs) });
  const r = await buildLibrary({ lang: 'es', manifest, io: m.io, adapters: registry, date: DATE, inspect: cleanInspect, ...opts });
  const rows = parseShard(JSON.parse(m.out.get(r.manifest.shards[0].file)!), 'es');
  const documents = rows.map((row) => JSON.parse(m.out.get(row.documentPath!)!) as CorpusDocument);
  return { r, rows, documents, out: m.out };
};

describe('paragraphs stored as one very long declared sentence', () => {
  it('are cut by the language adapter, as every plain-text work is, and no word changes', async () => {
    const long = paragraph(30);
    const d = doc('relato-ch01', [{ sentences: [{ text: long }] }, { sentences: [{ text: 'Una frase corta.' }] }]);
    expect(sentenceWordCounts(d, es)).toEqual([300, 3]);
    const { r, documents } = await buildDocs([d]);
    const lens = sentenceWordCounts(documents[0], es);
    expect(lens.length).toBe(31);
    expect(Math.max(...lens)).toBeLessThan(15);
    expect(median(lens)).toBeLessThanOrEqual(10);
    // the paragraph is handed back as raw text; the text is exactly what it was
    expect('text' in documents[0].sections[0].paragraphs[0] && (documents[0].sections[0].paragraphs[0] as { text: string }).text).toBe(long);
    expect(r.built[0].notes.join(' ')).toMatch(/1 paragraph\(s\) stored as one very long declared sentence/);
  });

  it('leaves a paragraph alone when its sentences carry English lines, verse references or notes', () => {
    const long = paragraph(30);
    const d = doc('relato-ch01', [{ sentences: [{ text: long, english: 'English.' }] }]);
    const r = resegmentLongSentences(d, es, 60);
    expect(r).toEqual({ handedBack: 0, kept: 1 });
    expect((d.sections[0].paragraphs[0] as { sentences: unknown[] }).sentences).toHaveLength(1);
    const v = doc('relato-ch02', [{ sentences: [{ text: long, verseRefs: ['GEN.1.1'] }] }]);
    expect(resegmentLongSentences(v, es, 60).handedBack).toBe(0);
  });

  it('keeps a sentence the adapter does not cut, and does nothing below the limit or when switched off', () => {
    const one = Array.from({ length: 70 }, (_, i) => `palabra${i}`).join(' '); // 70 words, no sentence end
    expect(resegmentLongSentences(doc('a', [{ sentences: [{ text: one }] }]), es, 60).handedBack).toBe(0);
    expect(resegmentLongSentences(doc('b', [{ sentences: [{ text: paragraph(3) }] }]), es, 60).handedBack).toBe(0);
    expect(resegmentLongSentences(doc('c', [{ sentences: [{ text: paragraph(30) }] }]), es, 0).handedBack).toBe(0);
  });

  it('keeps a review that covered the wording valid: the signature of the unchanged words is recomputed', async () => {
    const { contentSignatureOf, computePublished } = await import('../../src/ingest');
    const d = doc('relato-ch01', [{ sentences: [{ text: paragraph(30) }] }], { generated: true, review: { status: 'reviewed', reviewedBy: 'T', reviewedAt: '2026-10-01', level: 'native' } });
    (d.review as { contentSignature?: string }).contentSignature = contentSignatureOf(d);
    const { documents } = await buildDocs([d], {});
    expect((documents[0].review as { contentSignature?: string }).contentSignature).toBe(contentSignatureOf(documents[0]));
    expect(computePublished(documents[0]).published).toBe(true);
  });
});

describe('streams and domains of the catalogue are carried onto every row and document', () => {
  it('unions the manifest entry with the catalogue record of the work, primary stream first', async () => {
    expect(placementOf({ stream: 'library' }, { streams: ['honduras', 'library'], domains: ['history'] })).toEqual({ primary: 'library', streams: ['library', 'honduras'], domains: ['history'] });
    expect(placementOf({ stream: 'library' }, { streams: ['honduras'], domains: [] })).toEqual({ primary: 'honduras', streams: ['honduras'], domains: [] });
    expect(placementOf({ streams: ['library', 'knowledge'], domains: ['theology'] }, { streams: ['library'], domains: ['history', 'theology'] }))
      .toEqual({ primary: 'library', streams: ['library', 'knowledge'], domains: ['theology', 'history'] });
    expect(placementOf({}, undefined)).toEqual({ primary: 'library', streams: ['library'], domains: [] });

    const d = doc('relato-ch01', [{ text: 'Una casa. Una mesa.' }]);
    const { rows, documents } = await buildDocs([d], { stream: 'library' }, { catalogue: (id: string) => (id === 'work:honduras-es:obra' ? { streams: ['library', 'honduras'], domains: ['history'] } : undefined) });
    const row: CatalogText = rows[0];
    expect(row.stream).toBe('library');
    expect(row.streams).toEqual(['library', 'honduras']);
    expect(row.domains).toEqual(['history']);
    expect(documents[0].streams).toEqual(['library', 'honduras']);
    expect(documents[0].domains).toEqual(['history']);
  });

  it('puts the shelf the catalogue knows ahead of one it does not', async () => {
    const d = doc('relato-ch01', [{ text: 'Una casa. Una mesa.' }]);
    const { rows } = await buildDocs([d], { stream: 'library' }, { catalogue: () => ({ streams: ['knowledge'], domains: [] }) });
    expect(rows[0].stream).toBe('knowledge');
    expect(rows[0].streams).toBeUndefined(); // one stream: the row says it with `stream`
  });
});

describe('titles', () => {
  it('cleanTitle drops markup, zero-width marks, blank runs, contents page numbers and a stray closing quote, and nothing else', () => {
    expect(cleanTitle('Platero y yo — #I#')).toBe('Platero y yo — I');
    expect(cleanTitle('ผู้​วินิจฉัย 1')).toBe('ผู้วินิจฉัย 1');
    expect(cleanTitle('Fábulas — XII. El Amor y la Locura                    143')).toBe('Fábulas — XII. El Amor y la Locura');
    expect(cleanTitle('  Dos   espacios  ')).toBe('Dos espacios');
    expect(cleanTitle('Eine Sicht auf den Film „Encanto“ von Disney“ — excerpt')).toBe('Eine Sicht auf den Film „Encanto“ von Disney — excerpt');
    expect(cleanTitle('Der „Faust“ — Teil 1')).toBe('Der „Faust“ — Teil 1');
    expect(cleanTitle('Say “hello” — 2')).toBe('Say “hello” — 2');
    expect(cleanTitle('Psalm 23')).toBe('Psalm 23');
    // ZWNJ is spelling in Hindi and Persian: kept
    expect(cleanTitle('गड्‌ढे')).toBe('गड्‌ढे'.normalize('NFC'));
  });

  it('a work whose texts share a title gets chapter numbers, so no two rows are alike', async () => {
    const a = doc('azul-ch01', [{ text: 'Una casa.' }], { title: 'Azul — I', work: { slug: 'obra', chapter: { index: 1, title: 'Azul — I' } } });
    const b = doc('azul-ch02', [{ text: 'Una mesa.' }], { title: 'Azul — II', work: { slug: 'obra', chapter: { index: 2, title: 'Azul — II' } } });
    const c = doc('azul-ch03', [{ text: 'Una silla.' }], { title: 'Azul — I', work: { slug: 'obra', chapter: { index: 3, title: 'Azul — I' } } });
    const { rows, documents, r } = await buildDocs([a, b, c]);
    expect(rows.map((x) => x.title)).toEqual(['Azul — I (1)', 'Azul — II', 'Azul — I (3)']);
    expect(documents.map((x) => x.title)).toEqual(rows.map((x) => x.title));
    expect(documents[0].work?.chapter?.title).toBe('Azul — I (1)');
    expect(r.built[0].notes.join(' ')).toMatch(/2 text\(s\) with a title another text of the work has/);
  });
});

describe('Scripture and shared document files', () => {
  it('a Scripture chapter is its own source: a stale source id is set to src:<lang>:<text id>', async () => {
    const d = doc('bible-gen-1-complete', [{ sentences: [{ text: 'En el principio creó Dios los cielos y la tierra.', verseRefs: ['GEN.1.1'] }] }], {
      contentType: 'scripture', corpus: { id: 'bible-es-x', kind: 'scripture', title: 'B' }, scripture: { book: 'GEN', chapter: 1, translationId: 'x', translationName: 'X', edition: 'x', verification: { against: 'a', url: 'https://example.test/a', checkedAt: '2026-10-01', by: 'b', method: 'publisher-file' } },
      source: { id: 'src:es:bible-gen-1', title: 'B', attribution: 'B', provenance: 'p', rights: 'public-domain', authorship: 'public-domain' },
      review: { status: 'reviewed', reviewedBy: 'x', reviewedAt: '2026-10-01', notes: 'x' },
    });
    const { documents, r } = await buildDocs([d], { contentType: 'scripture' });
    expect(documents[0].source.id).toBe('src:es:bible-gen-1-complete');
    expect(r.built[0].notes.join(' ')).toMatch(/1 Scripture text\(s\) had a source id that was not their own/);
  });

  it('source.only builds just the named documents of a file several works share, and refuses an unknown id', async () => {
    const docs = ['a-ch01', 'b-ch01', 'c-ch01'].map((id, i) => doc(id, [{ text: `Una casa ${i}.` }]));
    const manifest: BuildManifest = { schema: 1, lang: 'es', entries: [
      entry({ slug: 'obra-uno', source: { file: 'todo.json', kind: 'documents', only: ['a-ch01', 'c-ch01'] } }),
      entry({ slug: 'obra-dos', source: { file: 'todo.json', kind: 'documents', only: ['b-ch01'] } }),
      entry({ slug: 'obra-tres', source: { file: 'todo.json', kind: 'documents', only: ['z-ch01'] } }),
    ] };
    const m = memoryIO({ 'todo.json': JSON.stringify(docs) });
    const r = await buildLibrary({ lang: 'es', manifest, io: m.io, adapters: registry, date: DATE, inspect: cleanInspect });
    expect(r.built.map((b) => [b.slug, b.texts])).toEqual([['obra-uno', 2], ['obra-dos', 1]]);
    expect(r.refused.map((x) => x.slug)).toEqual(['obra-tres']);
    expect(r.refused[0].reasons[0]).toMatch(/source\.only names 1 document/);
    void PD;
  });
});
