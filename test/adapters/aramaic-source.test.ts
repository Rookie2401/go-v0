import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARAMAIC_SEED } from '../../src/adapters/aramaic/seed';
import { arcAdapter } from '../../src/adapters/arc';
import { loadBundledCorpus } from '../../src/ingest';

describe('Aramaic source transcription verification (not held-out linguistic accuracy)', () => {
  const xml = fs.readFileSync('data/sources/aramaic/oshb-daniel-excerpts.xml', 'utf8');
  it('every seed annotation and segmentation matches an original A-coded OSHB word', () => {
    const source = new Map([...xml.matchAll(/<w\b([^>]*)>([^<]+)<\/w>/g)].map(m => {
      const attrs = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
      return [attrs.id, { attrs, text: m[2] }];
    }));
    for (const row of ARAMAIC_SEED) {
      const word = source.get(row.sourceWordId)!;
      expect(word).toBeDefined();
      expect(word.attrs.morph).toBe(row.morph);
      expect(word.attrs.lemma).toBe(row.lemmaId);
      expect(row.morph.startsWith('A')).toBe(true);
      expect(word.text.replace(/\//g, '')).toBe(row.surface);
      expect(word.text.split('/').map(p => (p.match(/[א-ת]/g) ?? []).length).join('/')).toBe(row.seg);
    }
    expect(ARAMAIC_SEED).toHaveLength(26);
  });
  it('the declared source tokens are all recognized, with ambiguity measured separately', () => {
    const docs = loadBundledCorpus().filter(d => d.lang === 'arc');
    const sentences = docs.flatMap(d => d.sections.flatMap(s => s.paragraphs.flatMap(p => 'sentences' in p ? p.sentences : [])));
    const analyses = sentences.flatMap(s => arcAdapter.analyze(arcAdapter.tokenize(s.text)).filter(a => a.token.isWord));
    expect(analyses).toHaveLength(26);
    expect(analyses.filter(a => a.candidates.length === 0)).toHaveLength(0);
    expect(analyses.filter(a => a.candidates.length > 1)).toHaveLength(3);
    // This is source-fixture recognition coverage; it is explicitly not an accuracy score for unseen Aramaic.
  });
});
