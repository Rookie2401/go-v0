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
    const entry = JSON.parse(fs.readFileSync(`${root}/gdl-library-entry.json`, 'utf8')).entries[0];
    expect(entry.slug).toBe('gdl-hindi-ccby');
    expect(entry.stage).toBe('c1');
    expect(entry.streams).toEqual(['children']);
    expect(docs.every(d => d.streams?.includes('children'))).toBe(true);
  });
  it('reconstructs the collection through the helper with a fresh output path', () => {
    const entryBefore = fs.readFileSync(`${root}/gdl-library-entry.json`, `utf8`);
    fs.mkdirSync('work', { recursive: true });
    const scratch = fs.mkdtempSync('work/gdl-rebuilt-test-');
    const out = path.join(scratch, 'rebuilt.json'); const map = path.join(scratch, 'mapping.json');
    try {
      fs.copyFileSync(`${root}/gdl-id-map.json`, map);
      // Tool-only config avoids loading the app's full rights gate and React plugins for a cached-source reconstruction.
      execFileSync(process.execPath, ['node_modules/vite-node/dist/cli.mjs', '--config', 'scripts/vite.config.ts', 'scripts/prepare-hi-gdl-collection.mts', '--out', out, '--mapping', map], { stdio: 'pipe', timeout: 15000 });
      const rebuilt = JSON.parse(fs.readFileSync(out, 'utf8')) as any[];
      const original = JSON.parse(fs.readFileSync(`${root}/gdl-library-documents.json`, 'utf8')) as any[];
      expect(rebuilt.map(d => [d.id, d.work.chapter.index, d.review.contentSignature])).toEqual(original.map(d => [d.id, d.work.chapter.index, d.review.contentSignature]));
      expect(fs.readFileSync(`${root}/gdl-library-entry.json`, `utf8`)).toBe(entryBefore);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });
});
