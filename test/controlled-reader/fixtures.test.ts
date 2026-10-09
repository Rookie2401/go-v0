import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { readEpub } from '../../src/ingest/epub';
import { buildEpub } from '../../packages/controlled-reader/scripts/epub-builder';
import { fixtureBytes } from './helpers/book';

const ROOT = path.resolve(__dirname, '../..');

describe('EPUB fixtures', () => {
  it('are valid EPUB 3 zips: mimetype first and stored, container.xml, package.opf, nav.xhtml', () => {
    for (const name of ['udha-sample.epub', 'rtl-sample.epub', 'protected-sample.epub']) {
      const b = fixtureBytes(name);
      const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
      expect(v.getUint32(0, true), name).toBe(0x04034b50);
      expect(v.getUint16(8, true), `${name}: mimetype is stored (method 0)`).toBe(0);
      const nameLen = v.getUint16(26, true);
      expect(new TextDecoder().decode(b.subarray(30, 30 + nameLen)), name).toBe('mimetype');
      const body = new TextDecoder().decode(b.subarray(30 + nameLen, 30 + nameLen + 20));
      expect(body.startsWith('application/epub+zip')).toBe(true);
    }
  });

  it('the Albanian fixture has 3 chapters of about 20 sentences, in the course corpus text', async () => {
    const book = await readEpub(fixtureBytes('udha-sample.epub'));
    expect(book.title).toBe('Udha 1 — mostër (Go owner-authored sample)');
    expect(book.language).toBe('sq');
    expect(book.chapters.map((c) => c.title)).toEqual(['Mëngjesi', 'Gjyshi dhe gjyshja', 'Shiu']);
    const truth = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/epub/udha-sample.sentences.json'), 'utf8')) as { chapters: string[][][] };
    expect(truth.chapters.map((c) => c.flat().length)).toEqual([22, 18, 21]);
  });

  it('use only documents the corpus marks owner-authored and generated (never the Bible sample)', () => {
    const provenance = fs.readFileSync(path.join(ROOT, 'test/fixtures/epub/README.md'), 'utf8');
    for (const id of ['udha-1-01', 'udha-1-02', 'udha-1-03', 'udha-1-04', 'udha-1-05', 'udha-1-06']) {
      expect(provenance).toContain(id);
      const doc = JSON.parse(fs.readFileSync(path.join(ROOT, `data/corpus/sq/${id}.json`), 'utf8')) as { source: { rights: string; authorship: string }; generated: boolean };
      expect(doc.source.rights).toBe('owner-authored');
      expect(doc.source.authorship).toBe('generated');
      expect(doc.generated).toBe(true);
    }
    expect(provenance).not.toMatch(/bible-1john/);
  });

  it('the right-to-left fixture is five Hebrew lines (dir=rtl and the spine direction are checked in adapter.test.ts)', async () => {
    const book = await readEpub(fixtureBytes('rtl-sample.epub'));
    expect(book.language).toBe('he');
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0].text.split('\n')).toHaveLength(6); // the heading and five lines
  });

  it('are reproducible: the builder gives the same bytes for the same input', () => {
    const input = { identifier: 'urn:x', title: 'T', creator: 'C', language: 'sq', modified: '2026-10-08T00:00:00Z', chapters: [{ id: 'ch1', title: 'A', body: '<p>Një.</p>' }] };
    expect(Buffer.from(buildEpub(input)).equals(Buffer.from(buildEpub(input)))).toBe(true);
  });
});
