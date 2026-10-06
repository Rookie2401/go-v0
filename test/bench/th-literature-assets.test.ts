import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentSignatureOf, computePublished } from '../../src/ingest';
import type { CorpusDocument } from '../../src/ingest';

const root = 'data/sources/th-literature';
const json = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

describe('embedded Thai literature', () => {
  const source = json(`${root}/library-manifest.json`);
  const combined = json('data/sources/course-library/th.json');
  const provenance = json('public/library/th/provenance.json');

  it('embeds all 45 authentic Aesop fables in their original order', () => {
    const documents: CorpusDocument[] = json('data/sources/th-gap-recovery/documents.json');
    expect(documents).toHaveLength(45);
    expect(documents.map(d => d.work?.chapter?.index)).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
    expect(new Set(documents.map(d => d.id)).size).toBe(45);
    for (const doc of documents) {
      expect(doc.generated).toBe(false);
      expect(computePublished(doc).published).toBe(false);
      expect(computePublished(doc).unpublishedReasons.join(" ")).toMatch(/native-speaker/);
      expect(doc.review?.contentSignature).toBe(contentSignatureOf(doc));
      expect(doc.sections.length).toBeGreaterThan(0);
    }
    const installed = provenance.works.find((w: { slug: string }) => w.slug === 'th-gap-recovery-aesop');
    expect(installed).toMatchObject({ texts: 45, published: 0 });
    expect(installed.source.sha256).toBe(digest('data/sources/th-gap-recovery/documents.json'));
  });

  it('retains complete Scripture alongside all acquired reading sources', () => {
    expect(provenance.works.find((w: { slug: string }) => w.slug === 'bible-thai-otcv2025').texts).toBe(1189);
    expect(source.entries).toHaveLength(4);
    for (const entry of source.entries) {
      const installed = provenance.works.find((w: { slug: string }) => w.slug === entry.slug);
      expect(installed).toBeDefined();
      expect(installed.published).toBe(installed.texts);
      expect(installed.source.sha256).toBe(digest(path.join('data/sources', entry.source.file)));
      const bound = combined.entries.find((w: { slug: string }) => w.slug === entry.slug);
      expect(bound.review.coversSourceSha256).toBe(installed.source.sha256);
    }
  });

  it('binds publication to authentic Thai wording and exact cached revisions', () => {
    const ids = new Set<string>();
    for (const entry of source.entries) {
      const documents: CorpusDocument[] = json(path.join('data/sources', entry.source.file));
      for (const doc of documents) {
        expect(ids.has(doc.id)).toBe(false);
        ids.add(doc.id);
        expect(doc.generated).toBe(false);
        expect(doc.review?.contentSignature).toBe(contentSignatureOf(doc));
        expect(computePublished(doc).published).toBe(true);
        expect(JSON.stringify(doc.sections)).toMatch(/[\u0e00-\u0e7f]/);
        expect(doc.source.url).toMatch(/th\.wikisource\.org\/w\/index\.php\?oldid=\d+/);
      }
    }
    expect(ids.size).toBe(9);
    for (const entry of json(`${root}/source-manifest.json`).entries) {
      const cached = json(`${root}/pages/${entry.page.replaceAll('/', '__')}.json`);
      expect(crypto.createHash('sha256').update(cached.html).digest('hex')).toBe(entry.renderedSha256);
      expect(cached.revision).toBe(entry.revision);
    }
  });

  it('labels Vetal as four complete available stories with their frame', () => {
    const entry = source.entries.find((w: { slug: string }) => w.slug === 'nms-vetal-selected');
    const documents: CorpusDocument[] = json(path.join('data/sources', entry.source.file));
    expect(documents).toHaveLength(6);
    expect(entry.title).toContain('1, 8–10');
    expect(documents.map((d) => d.source.title).join(' ')).not.toMatch(/เรื่องที่ [2-7](?:\D|$)/);
  });
});

