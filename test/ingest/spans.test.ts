import { describe, expect, it } from 'vitest';
import { createMemoryStore, ids, LANGUAGES } from '../../src/core';
import { importDocuments, loadBundledCorpus, type CorpusDocument } from '../../src/ingest';
import { clock, errorCodes, registry } from './helpers';

const grapheme = new Intl.Segmenter('und', { granularity: 'grapheme' });
const boundaries = (text: string) => new Set([...[...grapheme.segment(text)].map((x) => x.index), text.length]);
const bundled = loadBundledCorpus();
const sentencesOf = (d: CorpusDocument) => d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences : [])));

/** The bundled text the span checks run on: the seed story, or for Latin (course texts only, no seed trio) the first Ritchie fable. */
const SAMPLE = (lang: string): string => (lang === 'la' ? 'ladder-ritchie-perseus' : 'story-01');

describe('span and grapheme integrity — all five languages', () => {
  for (const lang of LANGUAGES) {
    const adapter = registry.get(lang);

    it(`${lang}: no token or sentence span of any bundled text starts or ends inside a grapheme cluster`, () => {
      let checked = 0;
      for (const d of bundled.filter((x) => x.lang === lang)) for (const s of sentencesOf(d)) {
        const b = boundaries(s.text);
        for (const t of adapter.tokenize(s.text)) {
          expect(b.has(t.start), `${s.text} / ${t.surface}`).toBe(true);
          expect(b.has(t.end), `${s.text} / ${t.surface}`).toBe(true);
          checked++;
        }
        for (const sp of adapter.segmentSentences(s.text)) { expect(b.has(sp.start)).toBe(true); expect(b.has(sp.end)).toBe(true); }
      }
      expect(checked).toBeGreaterThan(150);
    });

    it(`${lang}: author spans on every word of a bundled sentence validate, import and are stored at the exact offsets`, async () => {
      const d = structuredClone(bundled.find((x) => x.lang === lang && x.id === SAMPLE(lang))!);
      const first = sentencesOf(d)[0] as { text: string; spans?: unknown[] };
      const words = adapter.tokenize(first.text).filter((t) => t.isWord);
      first.spans = words.map((t) => ({ start: t.start, end: t.end, lemma: t.normalized, gloss: `gloss of ${t.surface}` }));
      expect(errorCodes(d)).toEqual([]);

      const store = createMemoryStore();
      const r = await importDocuments(store, registry, [d], { clock });
      expect(r.ok).toBe(true);
      const sentence = (await store.sentences.where('textId', ids.text(lang, SAMPLE(lang)))).find((s) => s.text === first.text)!;
      const tokens = (await store.tokens.where('sentenceId', sentence.id)).sort((a, b) => a.index - b.index);
      for (const w of words) {
        const tok = tokens.find((t) => t.start === w.start && t.end === w.end)!;
        expect(sentence.text.slice(tok.start, tok.end)).toBe(tok.surface);
        const rows = await store.analyses.where('tokenId', tok.id);
        expect(rows.map((x) => x.analyzer), tok.surface).toEqual(['import@2']);
        expect(rows[0].gloss).toBe(`gloss of ${w.surface}`);
      }
    });
  }

  it('a span that cuts a token, joins two, or cuts a grapheme is rejected for every language', () => {
    for (const lang of LANGUAGES) {
      const d = structuredClone(bundled.find((x) => x.lang === lang && x.id === SAMPLE(lang))!);
      const first = sentencesOf(d)[0] as { text: string; spans?: unknown[] };
      const words = registry.get(lang).tokenize(first.text).filter((t) => t.isWord);
      first.spans = [{ start: words[0].start, end: words[1].end, lemma: 'x' }];
      expect(errorCodes(d), `${lang} joined`).toContain('span-not-on-token');
      first.spans = [{ start: words[0].start, end: words[0].end + 1000, lemma: 'x' }];
      expect(errorCodes(d), `${lang} overflow`).toContain('span-out-of-bounds');
    }
    // a cut through a combining sequence (Hindi, Thai and decomposed Latin)
    const cuts: Array<[typeof LANGUAGES[number], string, number, number]> = [['hi', 'नहीं है।', 0, 2], ['th', 'ที่นี่', 0, 2], ['es', 'Dios áma.', 6, 7]];
    for (const [lang, text, start, end] of cuts) {
      const d = structuredClone(bundled.find((x) => x.lang === lang && x.id === SAMPLE(lang))!);
      (d.sections[0].paragraphs[0] as { sentences: unknown[] }).sentences = [{ text, spans: [{ start, end, lemma: 'x' }] }];
      expect(errorCodes(d), lang).toContain('span-not-grapheme-boundary');
    }
  });
});
