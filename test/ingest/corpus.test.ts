import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANGUAGES, type LanguageCode } from '../../src/core';
import { computePublished, loadBundledCorpus, type CorpusDocument } from '../../src/ingest';
import { createMemoryStore } from '../../src/core';
import { GERMAN_WORKS } from '../../src/course/german';
import { HINDI_WORKS } from '../../src/course/hindi';
import { SPANISH_WORKS } from '../../src/course/spanish';

// The works of every course that bundles texts of its own: a course adds its list here.
const COURSE_WORKS = [...SPANISH_WORKS, ...GERMAN_WORKS, ...HINDI_WORKS];
import { importDocuments, validateBatch } from '../../src/ingest';
import { clock, registry } from './helpers';
import { isSeed, loadCourseCorpus } from './seed';

// The three original seed texts per language (story-01, dialogue-01, bible-1john-1): the shape assertions below are about them.
// The course texts added to the bundled corpus later have their own describe at the end of this file.
const docs = loadBundledCorpus().filter(isSeed);
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

  it('es and de Scripture (public domain) and hi Scripture (licensed) are verified and published; sq and th are unverified and unpublished with reasons', () => {
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
    // Hindi: a LICENSED translation (Indian Revised Version, CC BY-SA 4.0), never described as public domain; the licence,
    // the rights holder and the source are named in every document, and every document is verified against the source
    const hindi = byLang('hi').filter((x) => x.contentType === 'scripture');
    expect(hindi.length).toBeGreaterThanOrEqual(1);
    for (const d of hindi) {
      expect(d.source.rights, d.id).toBe('licensed');
      expect(d.source.licenseNote, d.id).toMatch(/CC BY-SA 4.0/);
      expect(d.source.attribution, d.id).toMatch(/Bridge Connectivity Solutions/);
      expect(d.source.attribution, d.id).toMatch(/eBible.org/);
      expect(d.source.provenance, d.id).toMatch(/footnotes.*not included|not included/);
      expect(d.scripture, d.id).toMatchObject({ translationId: 'hin2017', verification: { method: 'byte-comparison', by: 'scripts/verify-scripture.mjs' } });
      expect(d.review.reviewedBy, d.id).toBe('scripts/verify-scripture.mjs');
      expect(d.generated, d.id).toBe(false);
      expect(computePublished(d), d.id).toEqual({ published: true, unpublishedReasons: [] });
    }
    for (const l of ['sq', 'th'] as const) {
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

  it('bundled es / de / hi Scripture text equals data/verified/scripture.json byte for byte', () => {
    const verified = JSON.parse(fs.readFileSync('data/verified/scripture.json', 'utf8')) as {
      by: string; checkedAt: string; translations: Array<{ lang: string; translationId: string; checkedAt?: string; verses: Record<string, { text: string }>; mismatches: unknown[] }>;
    };
    expect(verified.translations.map((t) => t.lang).sort()).toEqual(['de', 'es', 'hi']);
    for (const t of verified.translations) {
      expect(t.mismatches).toEqual([]);
      // every verified document of the language, not only the first: each verse equals the record
      const all = byLang(t.lang as LanguageCode).filter((x) => x.contentType === 'scripture' && x.scripture?.verification);
      expect(all.length, t.lang).toBeGreaterThanOrEqual(1);
      for (const d of all) {
        expect(d.scripture!.translationId, d.id).toBe(t.translationId);
        // a document carries the date its verses were verified: between the record's first writing and the translation's latest check
        const at = d.scripture!.verification!.checkedAt;
        expect(at >= verified.checkedAt && at <= (t.checkedAt ?? verified.checkedAt), `${d.id} verified ${at}`).toBe(true);
        for (const s of sentencesOf(d)) {
          expect(s.text, `${t.lang} ${s.verseRefs}`).toBe(s.verseRefs!.map((r) => t.verses[r].text).join(' '));
        }
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

describe('the bundled course texts (everything that is not a seed text)', () => {
  const course = loadCourseCorpus();
  const works = new Set(COURSE_WORKS.map((w) => w.id));

  it('are version 2 documents that validate as a batch, with no errors', () => {
    const batch = validateBatch(course, { registry });
    for (const d of batch.documents) expect(d.issues.filter((i) => i.severity === 'error'), d.id).toEqual([]);
    expect(batch.ok).toBe(true);
    for (const d of course) {
      expect(d.schemaVersion, d.id).toBe(2);
      expect(d.source.id, d.id).toBe(`src:${d.lang}:${d.id}`);
    }
  });

  it('belong to a work of the course (known work id, a chapter), carry streams and a variety, and are not seed ids', async () => {
    const store = createMemoryStore();
    await store.works.bulkPut(COURSE_WORKS);
    const r = await importDocuments(store, registry, course, { clock });
    expect(r.ok).toBe(true);
    for (const rep of r.documents) expect(rep.issues.filter((i) => i.code === 'unknown-work'), rep.id).toEqual([]);
    for (const d of course) {
      const t = (await store.texts.get(`text:${d.lang}:${d.id}`))!;
      expect(t.workId, d.id).toBeDefined();
      expect(works.has(t.workId!), `${d.id} -> ${t.workId}`).toBe(true);
      expect(t.chapter?.index, d.id).toBeGreaterThanOrEqual(0);
      if (d.streams) expect(t.streams, d.id).toEqual(d.streams);
      if (d.variety) expect(t.variety, d.id).toBe(d.variety);
    }
  });

  it('are not published, and say why (machine-drafted text needs a native-speaker review) — except Scripture whose wording is verified', () => {
    for (const d of course) {
      const gate = computePublished(d);
      // a Scripture slice taken from its source and verified verse by verse is published: that is what the gate is for
      if (d.contentType === 'scripture' && d.scripture?.verification) { expect(gate.published, d.id).toBe(true); continue; }
      expect(gate.published, d.id).toBe(false);
      expect(gate.unpublishedReasons.length, d.id).toBeGreaterThan(0);
      if (d.generated) expect(gate.unpublishedReasons.join(' '), d.id).toMatch(/native-speaker review/);
      else expect(gate.unpublishedReasons.join(' '), d.id).toMatch(/review|rights|verified/);
    }
  });

  it('re-import unchanged, and their analysis coverage is reported (not asserted: the Spanish lexicon is still being expanded)', async () => {
    const store = createMemoryStore();
    await store.works.bulkPut(COURSE_WORKS);
    const first = await importDocuments(store, registry, course, { clock });
    expect(first.documents.every((x) => x.action === 'created')).toBe(true);
    const again = await importDocuments(store, registry, course, { clock });
    expect(again.documents.every((x) => x.action === 'unchanged')).toBe(true);
    const total = first.documents.reduce((n, x) => ({ words: n.words + x.analysisCoverage.words, analysed: n.analysed + x.analysisCoverage.analysed }), { words: 0, analysed: 0 });
    const lowest = [...first.documents].sort((a, b) => a.analysisCoverage.coverage - b.analysisCoverage.coverage).slice(0, 3);
    console.info(`course texts: ${course.length} documents, ${total.words} words, analysis coverage ${total.words ? ((100 * total.analysed) / total.words).toFixed(1) : 'n/a'}% (${total.analysed}/${total.words}); lowest: ${lowest.map((x) => `${x.id} ${(x.analysisCoverage.coverage * 100).toFixed(1)}%`).join(', ')}`);
  });
});
