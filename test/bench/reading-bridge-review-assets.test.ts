import fs from 'node:fs';
import crypto from 'node:crypto';
import { expect, it } from 'vitest';
import { computePublished, contentSignatureOf, type CorpusDocument } from '../../src/ingest';

it('publishes the thirteen recovered children’s readings with exact source reviews', () => {
  let checked = 0;
  for (const lang of ['de', 'es']) {
    const combined = JSON.parse(fs.readFileSync(`data/sources/course-library/${lang}.json`, 'utf8'));
    const installed = JSON.parse(fs.readFileSync(`public/library/${lang}/provenance.json`, 'utf8'));
    for (const entry of combined.entries.filter((e: any) => e.slug.startsWith('bridge-'))) {
      const bytes = fs.readFileSync(`data/sources/${entry.source.file}`);
      const doc = JSON.parse(bytes.toString('utf8')) as CorpusDocument;
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      expect(doc.generated).toBe(false);
      expect(doc.review?.contentSignature).toBe(contentSignatureOf(doc));
      expect(computePublished(doc).published).toBe(true);
      expect(entry.review.coversSourceSha256).toBe(hash);
      expect(installed.works.find((w: any) => w.slug === entry.slug)).toMatchObject({ texts: 1, published: 1, source: { sha256: hash } });
      checked++;
    }
  }
  expect(checked).toBe(13);
});
