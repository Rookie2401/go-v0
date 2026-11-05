import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARAMAIC_SEED } from '../../src/adapters/aramaic/seed';
import { arcAdapter } from '../../src/adapters/arc';
import { checkVerifiedScripture } from '../../scripts/verified-scripture';
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
  it('keeps lexical headwords tied to the selected Strong source entries', () => {
    const lexicon = fs.readFileSync('data/sources/aramaic/strong-excerpts.xml', 'utf8');
    const entries = new Map([...lexicon.matchAll(/<entry id="H(\d+)">([\s\S]*?)<\/entry>/g)].map(m => [
      m[1], m[2].match(/<w [^>]+>([^<]+)<\/w>/)?.[1],
    ]));
    for (const row of ARAMAIC_SEED) {
      const id = row.lemmaId.split('/').pop()!;
      if (id === 'l') continue; // source preposition code, not a Strong entry
      expect(entries.get(id)).toBe(row.lemma);
      expect(row.gloss).not.toBe('');
    }
  });
  it('compares Scripture with its own named source record and rejects edited wording', () => {
    const record = JSON.parse(fs.readFileSync('data/verified/arc.scripture.json', 'utf8'));
    const docs = loadBundledCorpus().filter(d => d.lang === 'arc');
    expect(checkVerifiedScripture(docs, record.translations)).toEqual({ errors: [], sentences: 2 });
    const edited = structuredClone(docs[0]);
    const paragraph = edited.sections[0].paragraphs[0];
    if (!('sentences' in paragraph)) throw new Error('Expected source sentences');
    paragraph.sentences[0].text += ' מַלְכָּא';
    expect(checkVerifiedScripture([edited], record.translations).errors).toHaveLength(1);
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
