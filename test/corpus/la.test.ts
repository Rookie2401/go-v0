import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LATIN_WORKS } from '../../src/course/latin';
import { BUNDLABLE_WORK_STATES, bundleDecision } from '../../src/ingest/rights';
import { checkVerifiedScripture, type VerifiedTranslation } from '../../scripts/verified-scripture';
import type { CorpusDocument } from '../../src/ingest';

// The bundled Latin corpus (data/corpus/la, built by scripts/corpus-la-build.mts from public-domain sources). See docs/latin/CORPUS.md.
const DIR = path.resolve('data/corpus/la');
interface Sent { id?: string; text: string; english?: string; verseRefs?: string[] }
interface Doc {
  schemaVersion: number; id: string; lang: string; title: string; contentType: string;
  corpus: { id: string; kind: string };
  source: { id: string; attribution: string; provenance: string; rights: string; licenseNote?: string; url?: string; authorship: string; sourceHash?: string };
  review: { status: string };
  scripture?: { book: string; chapter: number; translationId: string };
  work?: { slug: string; chapter?: { index: number } };
  streams?: string[];
  sections: Array<{ title?: string; paragraphs: Array<{ sentences: Sent[] }> }>;
}
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const docs: Array<{ file: string; doc: Doc }> = files.map((file) => ({ file, doc: JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8')) as Doc }));
const sentencesOf = (d: Doc): Sent[] => d.sections.flatMap((s) => s.paragraphs.flatMap((p) => p.sentences));

describe('Latin corpus (data/corpus/la)', () => {
  it('has at least 8 files and 400 sentences, with a Scripture block and a ladder block', () => {
    expect(docs.length).toBeGreaterThanOrEqual(8);
    expect(docs.reduce((n, d) => n + sentencesOf(d.doc).length, 0)).toBeGreaterThanOrEqual(400);
    expect(docs.filter((d) => d.doc.contentType === 'scripture').length).toBeGreaterThanOrEqual(8);
    expect(docs.filter((d) => d.file.startsWith('ladder-')).length).toBeGreaterThanOrEqual(3);
  });

  it('keeps no file that clashes with a seed text id of the other languages', () => {
    for (const { doc } of docs) expect(['bible-1john-1', 'dialogue-01', 'story-01']).not.toContain(doc.id);
  });

  it.each(docs)('$file: schema 2, lang la, id = file name, non-empty sections', ({ file, doc }) => {
    expect(doc.schemaVersion).toBe(2);
    expect(doc.lang).toBe('la');
    expect(file).toBe(`${doc.id}.json`);
    expect(doc.title.trim()).not.toBe('');
    expect(['scripture', 'story', 'nonfiction']).toContain(doc.contentType);
    expect(doc.sections.length).toBeGreaterThan(0);
    for (const s of doc.sections) { expect(s.paragraphs.length).toBeGreaterThan(0); for (const p of s.paragraphs) expect(p.sentences.length).toBeGreaterThan(0); }
  });

  it.each(docs)('$file: every sentence is non-empty, untrimmed-free Latin script, with a unique id', ({ doc }) => {
    const ids = new Set<string>();
    for (const s of sentencesOf(doc)) {
      expect(s.text, `${doc.id} ${s.id}`).toBe(s.text.trim());
      expect(s.text.length, `${doc.id} ${s.id}`).toBeGreaterThan(0);
      expect(/\p{L}/u.test(s.text), `${doc.id} ${s.id}: no letter`).toBe(true);
      expect(s.text.includes('�'), `${doc.id} ${s.id}: replacement character`).toBe(false);
      // Latin only: every letter belongs to the Latin script (macrons and ligatures are Latin).
      const foreign = [...s.text].filter((c) => /\p{L}/u.test(c) && !/\p{Script=Latin}/u.test(c));
      expect(foreign, `${doc.id} ${s.id}: non-Latin letters`).toEqual([]);
      expect(s.id, `${doc.id}: sentence without an id`).toBeTruthy();
      expect(ids.has(s.id!), `${doc.id}: duplicate id ${s.id}`).toBe(false);
      ids.add(s.id!);
    }
  });

  it('sentence ids are unique across the whole corpus', () => {
    const all = docs.flatMap((d) => sentencesOf(d.doc).map((s) => s.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it('Scripture sentences carry one well-formed verse reference each, verses run 1..n without gaps', () => {
    for (const { doc } of docs.filter((d) => d.doc.contentType === 'scripture')) {
      for (const s of sentencesOf(doc)) {
        expect(s.verseRefs, `${doc.id} ${s.id}`).toHaveLength(1);
        expect(s.verseRefs![0]).toMatch(/^[1-3A-Z]{3}\.\d+\.\d+$/);
        expect(s.id!.startsWith(s.verseRefs![0])).toBe(true);
        expect(s.verseRefs![0].startsWith(`${doc.scripture!.book}.${doc.scripture!.chapter}.`)).toBe(true);
      }
      // verses run 1..n without gaps
      const verses = [...new Set(sentencesOf(doc).map((s) => Number(s.verseRefs![0].split('.')[2])))];
      expect(verses).toEqual(verses.map((_, i) => i + 1));
    }
  });

  it.each(docs)('$file: sources, rights and review are recorded', ({ doc }) => {
    expect(doc.source.id).toBe(`src:la:${doc.id}`);
    expect(doc.source.attribution.length).toBeGreaterThan(20);
    expect(doc.source.provenance.length).toBeGreaterThan(80);
    expect(doc.source.provenance).toContain('corpus-la-build.mts');
    expect(doc.source.rights).toBe('public-domain');
    expect(doc.source.authorship).toBe('public-domain');
    expect(doc.source.licenseNote).toBeTruthy();
    expect(doc.source.url).toMatch(/^https:\/\//);
    expect(doc.source.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(['unreviewed', 'in-review', 'reviewed', 'approved']).toContain(doc.review.status);
    expect(doc.corpus.id).toMatch(/^(bible-la-clementine|lit-la)$/);
  });

  it('Scripture: one verse is one sentence (id = the reference, verseRefs = [reference])', () => {
    for (const { doc } of docs.filter((d) => d.doc.contentType === 'scripture')) {
      for (const s of sentencesOf(doc)) { expect(s.id).toBe(s.verseRefs![0]); expect(s.text).not.toBe(''); }
    }
  });

  it('the Scripture verification record (data/verified/scripture.json) verifies every Latin Scripture document', () => {
    const verified = JSON.parse(fs.readFileSync(path.resolve('data/verified/scripture.json'), 'utf8')) as { translations: VerifiedTranslation[] };
    const latin = docs.filter((d) => d.doc.contentType === 'scripture').map((d) => d.doc as unknown as CorpusDocument);
    const r = checkVerifiedScripture(latin, verified.translations);
    expect(r.errors).toEqual([]);
    expect(r.sentences).toBe(latin.reduce((n, d) => n + sentencesOf(d as unknown as Doc).length, 0));
  });

  it('every document names a work of the Latin catalogue (verified public domain) and passes the rights gate', () => {
    const bySlug = new Map(LATIN_WORKS.map((w) => [w.id.split(':').pop()!, w]));
    for (const { doc } of docs) {
      expect(doc.work?.slug, doc.id).toBeTruthy();
      const w = bySlug.get(doc.work!.slug);
      expect(w, `${doc.id}: work ${doc.work!.slug}`).toBeDefined();
      expect(BUNDLABLE_WORK_STATES).toContain(w!.rights.state);
      expect(w!.rights.verifiedBy && w!.rights.verifiedAt).toBeTruthy();
      expect(doc.work!.chapter?.index, doc.id).toBeGreaterThanOrEqual(0);
      expect(doc.streams?.length, doc.id).toBeGreaterThan(0);
      const decision = bundleDecision(doc as never, { work: (lang, slug) => { const x = LATIN_WORKS.find((y) => y.lang === lang && y.id.endsWith(`:${slug}`)); return x && { state: x.rights.state, verifiedBy: x.rights.verifiedBy, verifiedAt: x.rights.verifiedAt, statusByJurisdiction: x.rights.statusByJurisdiction }; } });
      expect(decision.verdict, `${doc.id}: ${decision.reason}`).toBe('bundle');
    }
  });

  const usfx = path.resolve('..', 'vetus-v0/data/vulgate/lat-clementine.usfx.xml');
  it.skipIf(!fs.existsSync(usfx))('Vulgate sentences join back to exactly the verses of the USFX source', () => {
    const raw = fs.readFileSync(usfx, 'utf8');
    const hash = crypto.createHash('sha256').update(fs.readFileSync(usfx)).digest('hex');
    for (const { doc } of docs.filter((d) => d.doc.contentType === 'scripture')) {
      expect(doc.source.sourceHash, `${doc.id}: source file changed since the build`).toBe(hash);
      const { book, chapter } = doc.scripture!;
      const usfxChapter = book === 'PSA' && chapter === 23 ? 22 : chapter; // Vulgate psalm numbering
      const b = new RegExp(String.raw`<book id="${book}">([\s\S]*?)</book>`).exec(raw)![1];
      const c = new RegExp(String.raw`<c id="${usfxChapter}"/>([\s\S]*?)(?=<c id="|$)`).exec(b)![1];
      const verses = new Map([...c.matchAll(/<v id="(\d+)"\/>([\s\S]*?)<ve\/>/g)].map((m) => [Number(m[1]), m[2].trim()]));
      const byVerse = new Map<number, string[]>();
      for (const s of sentencesOf(doc)) { const v = Number(s.verseRefs![0].split('.')[2]); byVerse.set(v, [...(byVerse.get(v) ?? []), s.text]); }
      expect([...byVerse.keys()]).toEqual([...verses.keys()]);
      for (const [v, text] of verses) expect(byVerse.get(v)!.join(' '), `${doc.id} ${v}`).toBe(text);
    }
  });
});
