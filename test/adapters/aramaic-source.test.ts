import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARAMAIC_SEED } from '../../src/adapters/aramaic/seed';
import { arcAdapter } from '../../src/adapters/arc';
import { checkVerifiedScripture } from '../../scripts/verified-scripture';
import { loadBundledCorpus } from '../../src/ingest';

describe('Aramaic source transcription verification (not held-out linguistic accuracy)', () => {
  const xml = fs.readFileSync('data/sources/aramaic/oshb-aramaic-snapshot.xml', 'utf8');
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
    expect(ARAMAIC_SEED).toHaveLength(4828);
    expect(new Set(ARAMAIC_SEED.map(row => row.sourceWordId)).size).toBe(4828);
    expect(ARAMAIC_SEED.every(row => row.morph.startsWith('A'))).toBe(true);
  });
  it('uses exact augmented LexicalIndex entries and leaves missing Strong glosses unavailable', () => {
    const lexicon = fs.readFileSync('data/sources/aramaic/strong-aramaic-entries.xml', 'utf8');
    const entries = new Map([...lexicon.matchAll(/<entry id="H(\d+)">([\s\S]*?)<\/entry>/g)].map(m => [
      m[1], m[2].match(/<w [^>]+>([^<]+)<\/w>/)?.[1],
    ]));
    const indexXml = fs.readFileSync('data/sources/aramaic/lexical-index-aramaic-entries.xml', 'utf8');
    const indexEntries = new Map([...indexXml.matchAll(/<sourceEntry\b([^>]*)>([\s\S]*?)<\/sourceEntry>/g)].map(m => {
      const wrapper = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
      const body = m[2];
      return [wrapper.sourceLemmaId, {
        lemma: body.match(/<w\b[^>]*>([\s\S]*?)<\/w>/)?.[1].replace(/<[^>]*>/g, ''),
        gloss: [...body.matchAll(/<def>([\s\S]*?)<\/def>/g)].map(a => a[1].replace(/<[^>]*>/g, '')).join('; '),
      }];
    }));
    for (const row of ARAMAIC_SEED) {
      const id = row.lemmaId.split('/').pop()!;
      if (/^\d+ [a-z]$/i.test(id) || /^\d+\+$/.test(id)) {
        const exact = indexEntries.get(id);
        if (!exact) throw new Error(`missing exact LexicalIndex entry ${id}`);
        expect(row.lemma).toBe(exact.lemma);
        expect(row.gloss).toBe(exact.gloss);
        continue;
      }
      const strongId = /^\d+$/.test(id) ? id : undefined;
      if (!strongId) continue; // OSHB linguistic prefix code, outside the Strong dictionary index
      expect(entries.get(strongId)).toBe(row.lemma);
      if (row.glossStatus === 'external') expect(row.gloss).not.toBe('');
      else expect(row.gloss).toBe('');
    }
    const herb = ARAMAIC_SEED.find(row => row.sourceWordId === '27WPN')!;
    expect(herb).toMatchObject({ lemmaId: 'b/6211 b', lemma: 'עֲשַׂב', gloss: 'herbage', glossStatus: 'external' });
    const exactMissing = ARAMAIC_SEED.filter(row => row.glossStatus === 'unavailable');
    expect(exactMissing).toHaveLength(26);
    expect(exactMissing.every(row => row.lemmaId.split('/').at(-1)?.match(/^3390(?:$|$)/))).toBe(true);
  });
  it('compares Scripture with its own named source record and rejects edited wording', () => {
    const record = JSON.parse(fs.readFileSync('data/verified/arc.scripture.json', 'utf8'));
    const docs = loadBundledCorpus().filter(d => d.lang === 'arc');
    expect(checkVerifiedScripture(docs, record.translations)).toEqual({ errors: [], sentences: 269 });
    const edited = structuredClone(docs[0]);
    const paragraph = edited.sections[0].paragraphs[0];
    if (!('sentences' in paragraph)) throw new Error('Expected source sentences');
    paragraph.sentences[0].text += ' מַלְכָּא';
    expect(checkVerifiedScripture([edited], record.translations).errors).toHaveLength(1);
  });
  it('retains all source paseq punctuation in the bundled reading text', () => {
    const docs = loadBundledCorpus().filter(d => d.lang === 'arc');
    const passages = docs.flatMap(d => d.sections.flatMap(s => s.paragraphs.flatMap(p => 'sentences' in p ? p.sentences : [])));
    const sourceVerses = [...xml.matchAll(/<verse\s+osisID="([^"]+)"[^>]*>([\s\S]*?)<\/verse>/g)]
      .map(m => ({ ref: m[1], count: [...m[2].matchAll(/<seg\s+type="x-paseq">׀<\/seg>/g)].length }))
      .filter(v => v.count > 0);
    expect(sourceVerses).toHaveLength(30);
    expect(sourceVerses.reduce((sum, v) => sum + v.count, 0)).toBe(35);
    for (const source of sourceVerses) {
      const [book, chapter, verse] = source.ref.split('.');
      const code = ({ Dan: 'DAN', Ezra: 'EZR', Jer: 'JER', Gen: 'GEN' } as Record<string, string>)[book];
      const passage = passages.find(p => p.verseRefs?.includes(`${code}.${chapter}.${verse}`));
      expect((passage?.text.match(/׀/g) ?? []).length, source.ref).toBe(source.count);
    }
  });
  it('the declared source tokens are all recognized, with ambiguity measured separately', () => {
    const docs = loadBundledCorpus().filter(d => d.lang === 'arc');
    const sentences = docs.flatMap(d => d.sections.flatMap(s => s.paragraphs.flatMap(p => 'sentences' in p ? p.sentences : [])));
    const analyses = sentences.flatMap(s => arcAdapter.analyze(arcAdapter.tokenize(s.text)).filter(a => a.token.isWord));
    expect(analyses).toHaveLength(4828);
    expect(analyses.filter(a => a.candidates.length === 0)).toHaveLength(0);
    expect(analyses.filter(a => a.candidates.length > 1).length).toBeGreaterThan(0);
    // This is source-fixture recognition coverage; it is explicitly not an accuracy score for unseen Aramaic.
  });
});
