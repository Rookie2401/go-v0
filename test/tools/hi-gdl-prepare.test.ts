import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = 'data/sources/hi/gdl';
describe('cached Hindi GDL collection', () => {
  it('has stable registered identities, complete credits, and no damaged sources', () => {
    const docs = JSON.parse(fs.readFileSync(`${root}/gdl-library-documents.json`, 'utf8')) as any[];
    const coverage = JSON.parse(fs.readFileSync(`${root}/coverage.json`, 'utf8')) as any;
    expect(docs).toHaveLength(92);
    expect(coverage.eligible).toBe(125);
    expect(new Set(docs.map(d => d.id)).size).toBe(92);
    expect(coverage.books.filter((b: any) => b.replacementCharacters > 0 || b.sourceStatus !== 'extracted').map((b: any) => b.apiPostId)).toEqual([6161]);
    expect(docs.every(d => d.source.rights === 'licensed' && /CC BY 4\.0/.test(d.source.licenseNote))).toBe(true);
    expect(docs.every(d => d.review?.status === 'reviewed' && /source fidelity/i.test(d.review?.notes ?? ''))).toBe(true);
    const entries = JSON.parse(fs.readFileSync(`${root}/gdl-library-entry.json`, 'utf8')).entries as any[];
    expect(entries[0].slug).toBe('gdl-hindi-ccby');
    expect(entries.map(e => e.stage)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(entries.every(e => JSON.stringify(e.streams) === '["children"]')).toBe(true);
    expect(docs.every(d => d.streams?.includes('children'))).toBe(true);
  });
  it('is written in NFC and graded onto Classes 1-4 by measured difficulty', () => {
    const docs = JSON.parse(fs.readFileSync(`${root}/gdl-library-documents.json`, 'utf8')) as any[];
    const entries = JSON.parse(fs.readFileSync(`${root}/gdl-library-entry.json`, 'utf8')).entries as any[];
    const report = JSON.parse(fs.readFileSync(`${root}/gdl-grading.json`, 'utf8')) as any;
    // every string of every document is NFC (the cached extract's precomposed nukta letters U+0958-095F are not)
    for (const d of docs) expect(JSON.stringify(d)).toBe(JSON.stringify(d).normalize('NFC'));
    expect(JSON.stringify(docs)).not.toMatch(/[क़-य़]/);
    // four shelves of 23, together the 92 books once each; each shelf's chapters run 1..n in order of difficulty
    const ids = entries.flatMap(e => e.source.only as string[]);
    expect(ids.slice().sort()).toEqual(docs.map(d => d.id).sort());
    const score = new Map<string, number>(report.books.map((b: any) => [b.id, b.score]));
    for (const e of entries) {
      expect(e.source.only).toHaveLength(23);
      const shelf = docs.filter(d => d.work.slug === e.slug);
      expect(shelf.map(d => d.work.chapter.index)).toEqual(shelf.map((_, i) => i + 1));
      expect(shelf.map(d => d.id)).toEqual(e.source.only);
      const s = shelf.map(d => score.get(d.id)!);
      expect(s).toEqual([...s].sort((a, b) => a - b));
    }
    // a harder shelf is longer and has longer sentences (medians)
    const m = report.summary as any[];
    for (let i = 1; i < m.length; i++) { expect(m[i].medianWords).toBeGreaterThan(m[i - 1].medianWords); expect(m[i].medianMeanSentence).toBeGreaterThanOrEqual(m[i - 1].medianMeanSentence); }
  });
  it('reconstructs the collection through the helper with a fresh output path', () => {
    const entryBefore = fs.readFileSync(`${root}/gdl-library-entry.json`, `utf8`);
    fs.mkdirSync('work', { recursive: true });
    const scratch = fs.mkdtempSync('work/gdl-rebuilt-test-');
    const out = path.join(scratch, 'rebuilt.json'); const map = path.join(scratch, 'mapping.json');
    try {
      fs.copyFileSync(`${root}/gdl-id-map.json`, map);
      // Tool-only config avoids loading the app's full rights gate and React plugins for a cached-source reconstruction.
      execFileSync(process.execPath, ['node_modules/vite-node/dist/cli.mjs', '--config', 'scripts/vite.config.ts', 'scripts/prepare-hi-gdl-collection.mts', '--out', out, '--mapping', map], { stdio: 'pipe', timeout: 120000 });
      const rebuilt = JSON.parse(fs.readFileSync(out, 'utf8')) as any[];
      const original = JSON.parse(fs.readFileSync(`${root}/gdl-library-documents.json`, 'utf8')) as any[];
      expect(rebuilt.map(d => [d.id, d.work.chapter.index, d.review.contentSignature])).toEqual(original.map(d => [d.id, d.work.chapter.index, d.review.contentSignature]));
      expect(fs.readFileSync(`${root}/gdl-library-entry.json`, `utf8`)).toBe(entryBefore);
      expect(JSON.parse(fs.readFileSync(`${out}.entry.json`, 'utf8')).entries.map((e: any) => e.source.only)).toEqual(JSON.parse(entryBefore).entries.map((e: any) => e.source.only));
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }, 150000);
});
