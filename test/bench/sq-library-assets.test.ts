/** Integrity checks for the installed Albanian open-reading source and its lazy library build. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve('.');
const readJson = (name: string): any => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const sha256 = (name: string): string => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');

describe('Albanian open-reading library source', () => {
  const sourceFile = 'data/sources/sq-modern-open/documents.json';
  const source = readJson(sourceFile) as Array<Record<string, any>>;
  const sourceManifest = readJson('data/sources/sq-modern-open/library-manifest.json');
  const courseManifest = readJson('data/sources/course-library/sq.json');
  const publicManifest = readJson('public/library/sq/manifest.json');
  const provenance = readJson('public/library/sq/provenance.json');

  it('binds the source review and course entry to the exact source bytes', () => {
    const hash = sha256(sourceFile);
    expect(sourceManifest.entries[0].review.coversSourceSha256).toBe(hash);
    expect(courseManifest.entries[0].review.coversSourceSha256).toBe(hash);
  });

  it('keeps the 27 source-faithful chapters and no duplicate IDs', () => {
    expect(source).toHaveLength(27);
    expect(new Set(source.map((d) => d.id)).size).toBe(source.length);
    expect(source.every((d) => d.generated === false && d.source.rights === 'licensed')).toBe(true);
    expect(source.some((d) => d.id.endsWith('familja'))).toBe(false);
    expect(source.some((d) => d.id.endsWith('shqiperia-kultura'))).toBe(false);
  });

  it('matches the installed lazy-library manifest and provenance', () => {
    expect(publicManifest).toMatchObject({ lang: 'sq', texts: 38, words: 24566 });
    expect(provenance.works).toHaveLength(3);
    expect(provenance.works[0]).toMatchObject({ slug: 'sq-modern-open', texts: 27, words: 9647, published: 0, notes: [] });
    expect(provenance.works[0].source.sha256).toBe(sha256(sourceFile));
  });

  it('keeps separately selected sub-sections out of their parent readings', () => {
    const paragraphs = (id: string): string[] => source.find((d) => d.id === `sq-modern-open-${id}`)!.sections.flatMap((s: any) => s.paragraphs.map((p: any) => p.text));
    for (const [parent, child] of [['tirana-gjeografia', 'tirana-klima'], ['tirana-historia', 'tirana-arkeologjia'], ['shqiperia-gjeografia', 'shqiperia-relievi'], ['shqiperia-gjeografia', 'shqiperia-klima']]) {
      const selected = new Set(paragraphs(child));
      expect(paragraphs(parent).some((p) => selected.has(p))).toBe(false);
    }
  });

  it('installs the ten new modern prose sources with their exact review hashes', () => {
    const entry = courseManifest.entries.find((e: any) => e.slug === 'sq-modern-gap-readings');
    const installed = provenance.works.find((w: any) => w.slug === entry.slug);
    expect(entry.review.coversSourceSha256).toBe(sha256(`data/sources/${entry.source.file}`));
    expect(installed).toMatchObject({ texts: 10, published: 0, words: 14612 });
    const recovered = readJson(`data/sources/${entry.source.file}`);
    expect(recovered.every((d: any) => d.generated === false && d.variety === 'sq' && d.contentType === 'nonfiction')).toBe(true);
    expect(new Set([...source, ...recovered].map((d: any) => d.id)).size).toBe(37);
  });
});

