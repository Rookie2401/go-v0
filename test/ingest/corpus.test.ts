import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANGUAGES, type LanguageCode } from '../../src/core';
import { computePublished, loadBundledCorpus, type CorpusDocument } from '../../src/ingest';
import { registry } from './helpers';

const docs = loadBundledCorpus();
const byLang = (l: LanguageCode) => docs.filter((d) => d.lang === l);
type S = { text: string; english?: string; verseRefs?: string[] };
const sentencesOf = (d: CorpusDocument): S[] =>
  d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences : [{ text: p.text, english: undefined, verseRefs: p.verseRefs }])));

describe('bundled corpus shape (schema version 2)', () => {
  it('has story, dialogue and Bible doc for each language, sorted deterministically', () => {
    expect(docs.map((d) => `${d.lang}/${d.id}`)).toEqual(
      ['de', 'es', 'hi', 'sq', 'th'].flatMap((l) => ['bible-1john-1', 'dialogue-01', 'story-01'].map((s) => `${l}/${s}`)));
    for (const l of LANGUAGES) expect(byLang(l).map((d) => d.contentType).sort()).toEqual(['dialogue', 'scripture', 'story']);
    for (const d of docs) expect(d.schemaVersion).toBe(2);
  });

  it('stories have 8–12 sentences, dialogues 6–8, every sentence has an English rescue with a declared source', () => {
    for (const d of docs) {
      const s = sentencesOf(d);
      if (d.contentType === 'story') expect(s.length, `${d.lang} story`).toBeGreaterThanOrEqual(8), expect(s.length).toBeLessThanOrEqual(12);
      if (d.contentType === 'dialogue') expect(s.length, `${d.lang} dialogue`).toBeGreaterThanOrEqual(6), expect(s.length).toBeLessThanOrEqual(8);
      if (d.contentType === 'scripture') expect(s).toHaveLength(3);
      for (const x of s) expect(x.english, `${d.lang}/${d.id}: ${x.text}`).toBeTruthy();
      expect(d.english?.source, `${d.lang}/${d.id}`).toBeTruthy();
    }
  });

  it('all bundled text is NFC and trimmed (the importer would keep it exactly either way)', () => {
    for (const d of docs) for (const s of sentencesOf(d)) {
      expect(s.text).toBe(s.text.normalize('NFC'));
      expect(s.text).toBe(s.text.trim());
    }
  });

  it('stories and dialogues: machine-drafted, unreviewed, unpublished, with honest provenance', () => {
    for (const d of docs.filter((x) => x.contentType !== 'scripture')) {
      const name = `${d.lang}/${d.id}`;
      expect(d.source.id, name).toBe(`src:${d.lang}:${d.id}`);
      expect(d.source.rights, name).toBe('owner-authored');
      expect(d.source.authorship, name).toBe('generated');
      expect(d.generated, name).toBe(true);
      expect(d.review.status, name).toBe('unreviewed');
      expect(d.review.reviewedBy, name).toBeUndefined();
      expect(d.editorialTags, name).toEqual(expect.arrayContaining(['needs-native-review', 'machine-drafted']));
      expect(d.topics, name).not.toContain('needs-native-review');
      expect(d.topics.some((t) => t.startsWith('prep:')), name).toBe(false);
      expect(d.source.provenance.length, name).toBeGreaterThan(80);
      expect(d.source.provenance, name).toMatch(/native speaker/);
      const gate = computePublished(d);
      expect(gate.published, name).toBe(false);
      expect(gate.unpublishedReasons.join(' '), name).toMatch(/native-speaker review/);
    }
  });

  it('story prepTargets are verse refs resolved from the old prep: tags', () => {
    for (const l of LANGUAGES) {
      const story = byLang(l).find((d) => d.id === 'story-01')!;
      expect(story.prepTargets).toEqual(['JHN.3.16', '1JN.1.8', '1JN.1.9']);
      expect(byLang(l).find((d) => d.id === 'dialogue-01')!.prepTargets).toEqual([]);
    }
  });

  it('Bible docs: 1 John 1:8–9 and John 3:16, never generated, WEB as English rescue', () => {
    for (const l of LANGUAGES) {
      const d = byLang(l).find((x) => x.contentType === 'scripture')!;
      const s = sentencesOf(d);
      expect(s.map((x) => x.verseRefs?.[0])).toEqual(['1JN.1.8', '1JN.1.9', 'JHN.3.16']);
      expect(s[2].english).toMatch(/only born Son/);
      expect(s[0].english).toMatch(/we have no sin/);
      expect(d.generated).toBe(false);
      expect(d.english?.source).toMatch(/World English Bible/);
    }
  });

  it('es and de Scripture are verified and published; sq, th and hi are unverified and unpublished with reasons', () => {
    for (const l of ['es', 'de'] as const) {
      const d = byLang(l).find((x) => x.contentType === 'scripture')!;
      expect(d.review.status).toBe('reviewed');
      expect(d.review.reviewedBy).toBe('scripts/verify-scripture.mjs');
      expect(d.scripture!.verification).toMatchObject({ method: 'byte-comparison', by: 'scripts/verify-scripture.mjs' });
      expect(d.source.rights).toBe('public-domain');
      expect(computePublished(d)).toEqual({ published: true, unpublishedReasons: [] });
    }
    expect(byLang('es').find((x) => x.contentType === 'scripture')!.scripture).toMatchObject({ translationId: 'spaRV1909', translationName: 'Reina-Valera 1909' });
    expect(byLang('de').find((x) => x.contentType === 'scripture')!.scripture).toMatchObject({ translationId: 'deu1912' });
    for (const l of ['sq', 'th', 'hi'] as const) {
      const d = byLang(l).find((x) => x.contentType === 'scripture')!;
      expect(d.source.rights).toBe('unverified');
      expect(d.scripture!.verification).toBeUndefined();
      expect(d.scripture!.translationId).toBe('unidentified');
      const g = computePublished(d);
      expect(g.published).toBe(false);
      expect(g.unpublishedReasons.join(' ')).toMatch(/rights are unverified/);
      expect(g.unpublishedReasons.join(' ')).toMatch(/not verified against a published source/);
      expect(d.source.provenance).toMatch(/MUST be replaced|replace/i);
    }
  });

  it('bundled es / de Scripture text equals data/verified/scripture.json byte for byte', () => {
    const verified = JSON.parse(fs.readFileSync('data/verified/scripture.json', 'utf8')) as {
      by: string; checkedAt: string; translations: Array<{ lang: string; translationId: string; verses: Record<string, { text: string }>; mismatches: unknown[] }>;
    };
    expect(verified.translations.map((t) => t.lang).sort()).toEqual(['de', 'es']);
    for (const t of verified.translations) {
      expect(t.mismatches).toEqual([]);
      const d = byLang(t.lang as LanguageCode).find((x) => x.contentType === 'scripture')!;
      expect(d.scripture!.translationId).toBe(t.translationId);
      expect(d.scripture!.verification!.checkedAt).toBe(verified.checkedAt);
      for (const s of sentencesOf(d)) {
        expect(s.text, `${t.lang} ${s.verseRefs}`).toBe(s.verseRefs!.map((r) => t.verses[r].text).join(' '));
      }
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
      expect(analysed / words, `${d.lang}/${d.id}`).toBeGreaterThanOrEqual(0.95);
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
