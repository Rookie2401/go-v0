import fs from 'node:fs';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

const json = (file: string): any => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

describe('recovered German and Spanish literature', () => {
  for (const lang of ['de', 'es']) {
    it(`${lang}: embeds every recovered source with its exact review hash`, () => {
      const sources = json(`data/sources/${lang}-gap-recovery/library-manifest.json`);
      const combined = json(`data/sources/course-library/${lang}.json`);
      const installed = json(`public/library/${lang}/provenance.json`);
      for (const entry of sources.entries) {
        const hash = digest(`data/sources/${lang}-gap-recovery/${entry.source.file}`);
        const row = installed.works.find((w: any) => w.slug === entry.slug);
        expect(row).toBeDefined();
        expect(row.source.sha256).toBe(hash);
        expect(row.published).toBe(row.texts);
        expect(combined.entries.find((e: any) => e.slug === entry.slug).review.coversSourceSha256).toBe(hash);
        expect(installed.works.filter((w: any) => w.slug === entry.slug)).toHaveLength(1);
      }
    });
  }

  it('separates the 32 selected Platero stories and excludes classroom exercises', () => {
    const source = fs.readFileSync('data/sources/es-gap-recovery/jimenez-platero-y-yo.txt', 'utf8');
    expect(source.match(/^#[IVXLCDM]+#$/gm)).toHaveLength(32);
    expect(source).toContain('Platero es un burro pequeño');
    expect(source).not.toMatch(/QUESTIONS FOR CONVERSATION|EXERCISES|Translate into Spanish/i);
    const installed = json('public/library/es/provenance.json').works.find((w: any) => w.slug === 'jimenez-platero-y-yo');
    expect(installed).toMatchObject({ texts: 32, published: 32 });
  });

  it('keeps the actual Captain Veneno story instead of its question section', () => {
    const source = fs.readFileSync('data/sources/es-gap-recovery/alarcon-capitan-veneno.txt', 'utf8');
    expect(source).toContain('UN POCO DE HISTORIA POLÍTICA');
    expect(source).not.toContain('QUESTIONS FOR CONVERSATION');
    expect(source.length).toBeGreaterThan(100000);
  });
});
