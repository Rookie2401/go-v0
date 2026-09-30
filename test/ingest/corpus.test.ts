import { describe, expect, it } from 'vitest';
import { LANGUAGES, type LanguageCode } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { loadBundledCorpus, type CorpusDocument } from '../../src/ingest';

const registry = createAdapterRegistry();
const docs = loadBundledCorpus();
const byLang = (l: LanguageCode) => docs.filter((d) => d.lang === l);
const sentencesOf = (d: CorpusDocument) =>
  d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences : [{ text: p.text, english: undefined as string | undefined, verseRefs: p.verseRefs }])));

describe('bundled corpus shape', () => {
  it('has story, dialogue and Bible doc for each language, sorted deterministically', () => {
    expect(docs.map((d) => `${d.lang}/${d.slug}`)).toEqual(
      ['de', 'es', 'hi', 'sq', 'th'].flatMap((l) => ['bible-1john-1', 'dialogue-01', 'story-01'].map((s) => `${l}/${s}`)));
    for (const l of LANGUAGES) expect(byLang(l).map((d) => d.kind).sort()).toEqual(['dialogue', 'scripture', 'story']);
  });

  it('stories have 8–12 sentences, dialogues 6–8, every sentence has an English rescue', () => {
    for (const d of docs) {
      const s = sentencesOf(d);
      if (d.kind === 'story') expect(s.length, `${d.lang} story`).toBeGreaterThanOrEqual(8), expect(s.length).toBeLessThanOrEqual(12);
      if (d.kind === 'dialogue') expect(s.length, `${d.lang} dialogue`).toBeGreaterThanOrEqual(6), expect(s.length).toBeLessThanOrEqual(8);
      if (d.kind === 'scripture') expect(s).toHaveLength(3);
      for (const x of s) expect((x as { english?: string }).english, `${d.lang}/${d.slug}: ${x.text}`).toBeTruthy();
    }
  });

  it('all text is stored NFC and trimmed', () => {
    for (const d of docs) for (const s of sentencesOf(d)) {
      expect(s.text).toBe(s.text.normalize('NFC'));
      expect(s.text).toBe(s.text.trim());
    }
  });

  it('every document says where it came from; generated/owner-authored vs scripture are not confused', () => {
    for (const d of docs) {
      expect(d.sourceNote.length).toBeGreaterThan(80);
      expect(d.source.id).toBe(`src:${d.lang}:${d.slug}`);
      if (d.kind === 'scripture') {
        expect(d.generated).toBe(false);
        expect(d.englishSource).toMatch(/World English Bible/);
      } else {
        expect(d.source.rights).toBe('owner-authored');
        // AI-drafted, owned by the course: honest provenance = generated (badged in the reader) until native review.
        expect(d.source.authorship).toBe('generated');
        expect(d.generated).toBe(true);
        expect(d.tags).toContain('needs-native-review');
      }
    }
  });

  it('Bible docs: 1 John 1:8–9 and John 3:16, with the WEB as English rescue', () => {
    for (const l of LANGUAGES) {
      const d = byLang(l).find((x) => x.kind === 'scripture')!;
      const s = sentencesOf(d);
      expect(s.map((x) => x.verseRefs?.[0])).toEqual(['1JN.1.8', '1JN.1.9', 'JHN.3.16']);
      expect(s.map((x) => (x as { english: string }).english)[2]).toMatch(/only born Son/);
      expect(s.map((x) => (x as { english: string }).english)[0]).toMatch(/we have no sin/);
    }
  });

  it('the language lexicons cover the bundled texts (uncertain words are few)', () => {
    for (const d of docs) {
      const ad = registry.get(d.lang);
      let words = 0, analysed = 0;
      for (const s of sentencesOf(d)) {
        const toks = ad.tokenize(s.text);
        const an = ad.analyze(toks);
        toks.forEach((t, i) => { if (t.isWord) { words++; if (an[i].candidates.length) analysed++; } });
      }
      expect(analysed / words, `${d.lang}/${d.slug}`).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('the Thai texts contain no word-separating spaces inside words (only clause pauses)', () => {
    const th = registry.get('th');
    for (const d of byLang('th')) for (const s of sentencesOf(d)) {
      for (const t of th.tokenize(s.text)) expect(/\s/u.test(t.surface)).toBe(false);
      expect(th.tokenize(s.text).filter((t) => t.isWord).length).toBeGreaterThanOrEqual(3);
    }
  });
});
