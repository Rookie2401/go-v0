/**
 * The library build puts the texts of a work in order whatever the source gave it: Scripture by the canon, numbered by
 * each chapter's place in it; a collection 1, 2, 3 …; the same words once; a text that is bundled already left out.
 * Enforced in the build (src/library/build.ts), so a regenerated source cannot undo it.
 */
import { describe, expect, it } from 'vitest';
import type { CorpusDocument } from '../../src/ingest';
import { buildLibrary, type BuildManifest } from '../../src/library/build';
import { parseShard } from '../../src/library/format';
import { CANON, CANON_CHAPTERS, runningNumber } from '../../src/library/canon';
import { CANON as CANON_MJS, runningNumber as runningNumberMjs } from '../../scripts/lib-canon.mjs';
import { registry } from './helpers';
import { PD, cleanInspect, entry, memoryIO } from './fixtures';

const DATE = '2026-10-02';
const verse = (book: string, chapter: number, text: string): CorpusDocument => ({
  schemaVersion: 2, id: `bible-${book.toLowerCase()}-${chapter}`, lang: 'es', title: `${book} ${chapter}`, contentType: 'scripture',
  corpus: { id: 'bible-es-test', kind: 'scripture', title: 'Test Bible' },
  source: { id: `src:es:bible-${book.toLowerCase()}-${chapter}`, title: 'Test Bible', attribution: 'Test Bible, public domain', provenance: 'fixture', rights: 'public-domain', authorship: 'public-domain' },
  review: { status: 'reviewed', reviewedBy: 'fixture', reviewedAt: DATE }, topics: [], editorialTags: [], prepTargets: [], generated: false,
  scripture: { translationId: 'test', translationName: 'Test Bible', edition: 'test', book, chapter, verification: { against: 'fixture', url: 'https://example.test', checkedAt: DATE, method: 'byte-comparison', by: 'fixture' } },
  sections: [{ title: `${book} ${chapter}`, chapter, paragraphs: [{ sentences: [{ text, verseRefs: [`${book}.${chapter}.1`] }] }] }],
} as unknown as CorpusDocument);
const story = (id: string, text: string, index?: number): CorpusDocument => ({
  schemaVersion: 2, id, lang: 'es', title: id, contentType: 'story', corpus: { id: 'lib', kind: 'comprehensible-input', title: 'Library' },
  source: { id: `src:es:${id}`, title: id, attribution: 'public domain', provenance: 'fixture', rights: 'public-domain', authorship: 'public-domain' },
  review: { status: 'unreviewed' }, topics: [], editorialTags: [], prepTargets: [], generated: false,
  ...(index !== undefined ? { work: { slug: 'coleccion', chapter: { index, title: id } } } : {}),
  sections: [{ paragraphs: [{ text }] }],
} as unknown as CorpusDocument);
const build = async (manifest: BuildManifest, files: Record<string, string>, bundledTextIds?: ReadonlySet<string>) => {
  const m = memoryIO(files);
  const r = await buildLibrary({ lang: 'es', manifest, io: m.io, adapters: registry, date: DATE, inspect: cleanInspect, bundledTextIds });
  const rows = r.manifest.shards.flatMap((s) => parseShard(JSON.parse(m.out.get(s.file)!), 'es'));
  return { ...r, rows };
};
const pdDocs = { ...PD, state: 'verified-public-domain' as const };

describe('the canon', () => {
  it('is one table in src and in the plain-JavaScript helper', () => {
    expect(CANON_MJS).toEqual(CANON);
    expect(CANON_CHAPTERS).toBe(1189);
    for (const [book, n] of CANON) for (const c of [1, n]) expect(runningNumberMjs(book, c)).toBe(runningNumber(book, c));
  });
});

describe('order enforced by the build', () => {
  it('sorts a Bible given alphabetically by book into the canon and numbers chapters by their place', async () => {
    const docs = [verse('1CH', 1, 'Adán, Set, Enós.'), verse('REV', 22, 'La gracia del Señor.'), verse('GEN', 2, 'Fueron acabados los cielos.'), verse('MAT', 1, 'Libro de la generación.'), verse('GEN', 1, 'En el principio.')];
    docs.forEach((d, i) => { d.work = { slug: 'biblia', chapter: { index: i + 1, title: d.title } }; });
    const r = await build({ schema: 1, lang: 'es', entries: [entry({ slug: 'biblia', title: 'Biblia', rights: pdDocs, stream: 'scripture', contentType: 'scripture', source: { file: 'b.json', kind: 'documents' } })] }, { 'b.json': JSON.stringify(docs) });
    expect(r.refused).toEqual([]);
    expect(r.rows.map((x) => [x.id.replace('text:es:', ''), x.chapter])).toEqual([['bible-gen-1', 1], ['bible-gen-2', 2], ['bible-1ch-1', 339], ['bible-mat-1', 930], ['bible-rev-22', 1189]]);
    expect(r.built[0].notes.join(' ')).toMatch(/order of the canon/);
  });

  it('stops a Bible with a chapter outside the canon instead of guessing a place for it', async () => {
    const docs = [verse('GEN', 1, 'En el principio.'), verse('TOB', 1, 'Tobías.')];
    docs.forEach((d, i) => { d.work = { slug: 'biblia', chapter: { index: i + 1, title: d.title } }; });
    await expect(build({ schema: 1, lang: 'es', entries: [entry({ slug: 'biblia', title: 'Biblia', rights: pdDocs, stream: 'scripture', contentType: 'scripture', source: { file: 'b.json', kind: 'documents' } })] }, { 'b.json': JSON.stringify(docs) })).rejects.toThrow(/outside the canon/);
  });

  it('numbers a collection 1, 2, 3 … in the order given, leaves out a text with the same words as an earlier one, and leaves out a text that is bundled', async () => {
    const docs = [story('cuento-a', 'Había una vez un hombre que vivía en una casa pequeña junto al río y tenía un libro.', 0), story('cuento-b', 'El hombre tenía una mesa grande y una silla pequeña en la casa de madera.', 4), story('cuento-c', 'Había una vez un hombre que vivía en una casa pequeña junto al río y tenía un libro.', 7), story('cuento-d', 'La mujer tenía un gato negro que dormía todo el día en la ventana de la cocina.', 9)];
    const r = await build({ schema: 1, lang: 'es', entries: [entry({ slug: 'coleccion', title: 'Colección', rights: pdDocs, source: { file: 'c.json', kind: 'documents' } })] }, { 'c.json': JSON.stringify(docs) }, new Set(['text:es:cuento-d']));
    expect(r.refused).toEqual([]);
    expect(r.rows.map((x) => [x.id.replace('text:es:', ''), x.chapter])).toEqual([['cuento-a', 1], ['cuento-b', 2]]);
    const notes = r.built[0].notes.join(' | ');
    expect(notes).toMatch(/cuento-c left out: the same words as cuento-a/);
    expect(notes).toMatch(/bundled with the app already: cuento-d/);
    expect(notes).toMatch(/numbered 1 … 2/);
  });

  it('keeps a collection that is already 1 … n, or 0 … n with front matter, as it is', async () => {
    const docs = [story('x-a', 'Había una vez un hombre que vivía en una casa pequeña junto al río.', 1), story('x-b', 'El hombre tenía una mesa grande y una silla pequeña en la casa.', 2)];
    const r = await build({ schema: 1, lang: 'es', entries: [entry({ slug: 'x', title: 'X', rights: pdDocs, source: { file: 'x.json', kind: 'documents' } })] }, { 'x.json': JSON.stringify(docs) });
    expect(r.rows.map((x) => x.chapter)).toEqual([1, 2]);
    expect(r.built[0].notes.join(' ')).not.toMatch(/numbered/);
  });
});
