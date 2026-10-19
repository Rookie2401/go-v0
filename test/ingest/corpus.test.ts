import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type LanguageCode } from '../../src/core';
import { computePublished, loadBundledCorpus, type CorpusDocument } from '../../src/ingest';
import { createMemoryStore } from '../../src/core';
import { ALBANIAN_WORKS } from '../../src/course/albanian';
import { GERMAN_WORKS } from '../../src/course/german';
import { HINDI_WORKS } from '../../src/course/hindi';
import { LATIN_WORKS } from '../../src/course/latin';
import { THAI_WORKS } from '../../src/course/thai';
import { SPANISH_WORKS } from '../../src/course/spanish';

// The works of every course that bundles texts of its own: a course adds its list here.
const COURSE_WORKS = [...SPANISH_WORKS, ...GERMAN_WORKS, ...HINDI_WORKS, ...ALBANIAN_WORKS, ...THAI_WORKS, ...LATIN_WORKS];
import { importDocuments, validateBatch } from '../../src/ingest';
import { clock, registry } from './helpers';
import { PERIOD_LANGS, SEED_BY_LANG, isSeed, loadCourseCorpus } from './seed';

// The three original seed texts per language (story-01, dialogue-01, bible-1john-1): the shape assertions below are about them.
// The course texts added to the bundled corpus later have their own describe at the end of this file.
// Latin was added with course texts only (no seed trio): the seed assertions cover the seven seed languages. Hebrew and Greek have a seed trio
// too (data/corpus/he, data/corpus/el) with two stated differences: Hebrew's scripture seed is Genesis 1:1–5 (no open-licence Hebrew New
// Testament is at hand), and their compiled analysers are seed cores, so the coverage bars do not apply to them.
const SEED_LANGS = ['de', 'es', 'hi', 'nb', 'nn', 'sq', 'th'] as const;
const ALL_SEED_LANGS = (Object.keys(SEED_BY_LANG) as LanguageCode[]).sort();
const docs = loadBundledCorpus().filter(isSeed);
const byLang = (l: LanguageCode) => docs.filter((d) => d.lang === l);
type S = { text: string; english?: string; verseRefs?: string[] };
const sentencesOf = (d: CorpusDocument): S[] =>
  d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences : [{ text: p.text, english: undefined, verseRefs: p.verseRefs }])));

describe('bundled corpus shape (schema version 2)', () => {
  it('has story, dialogue and Bible doc for each language, sorted deterministically', () => {
    expect(docs.map((d) => `${d.lang}/${d.id}`)).toEqual(
      ALL_SEED_LANGS.flatMap((l) => SEED_BY_LANG[l].map((s) => `${l}/${s}`)));
    for (const l of ALL_SEED_LANGS) expect(byLang(l).map((d) => d.contentType).sort(), l).toEqual(['dialogue', 'scripture', 'story']);
    for (const d of docs) expect(d.schemaVersion).toBe(2);
  });

  it('stories have 8–12 sentences, dialogues 6–8, every sentence has an English rescue with a declared source', () => {
    for (const d of docs) {
      const s = sentencesOf(d);
      if (d.contentType === 'story') expect(s.length, `${d.lang} story`).toBeGreaterThanOrEqual(8), expect(s.length).toBeLessThanOrEqual(12);
      if (d.contentType === 'dialogue') expect(s.length, `${d.lang} dialogue`).toBeGreaterThanOrEqual(6), expect(s.length).toBeLessThanOrEqual(8);
      if (d.contentType === 'scripture') expect(s, `${d.lang}/${d.id}`).toHaveLength(d.id === 'bible-gen-1' ? 5 : 3); // Hebrew: Genesis 1:1–5
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
      expect(gate.unpublishedReasons.join(' '), name).toMatch(/native-speaker review|linguistic review by a person/);
    }
  });

  it('story prepTargets are verse refs resolved from the old prep: tags', () => {
    for (const l of ALL_SEED_LANGS) {
      const story = byLang(l).find((d) => d.id === 'story-01')!;
      expect(story.prepTargets, l).toEqual(['JHN.3.16', '1JN.1.8', '1JN.1.9']);
      expect(byLang(l).find((d) => d.id === 'dialogue-01')!.prepTargets, l).toEqual([]);
    }
  });

  it('Bible docs: 1 John 1:8–9 and John 3:16, never generated, WEB as English rescue', () => {
    for (const l of [...SEED_LANGS, 'el'] as LanguageCode[]) {
      const d = byLang(l).find((x) => x.contentType === 'scripture')!;
      const s = sentencesOf(d);
      expect(s.map((x) => x.verseRefs?.[0]), l).toEqual(['1JN.1.8', '1JN.1.9', 'JHN.3.16']);
      expect(s[2].english).toMatch(/only born Son/);
      expect(s[0].english).toMatch(/we have no sin/);
      expect(d.generated).toBe(false);
      expect(d.english?.source).toMatch(/World English Bible/);
    }
  });

  it('Hebrew’s scripture seed is Genesis 1:1–5 from the Masoretic text (MAM, stated CC BY-SA 4.0), recorded unverified and unpublished, its English stated as the course authors’ own; Greek’s is the SBLGNT (stated CC BY 4.0), likewise unverified and unpublished', () => {
    const d = byLang('he').find((x) => x.contentType === 'scripture')!;
    expect(d.id).toBe('bible-gen-1');
    expect(sentencesOf(d).map((x) => x.verseRefs?.[0])).toEqual(['GEN.1.1', 'GEN.1.2', 'GEN.1.3', 'GEN.1.4', 'GEN.1.5']);
    expect(d.scripture).toMatchObject({ translationId: 'mam', book: 'GEN', chapter: 1 });
    // the sources state their licences, but a licence claim without a verification record is not accepted by the bundle rule, so both are recorded unverified
    expect(d.source.rights).toBe('unverified');
    expect(d.source.licenseNote).toMatch(/CC BY-SA 4.0/);
    expect(d.source.provenance).toMatch(/no open-licence Hebrew New Testament/);
    expect(d.english?.source).toMatch(/Course authors.*not a published translation/);
    expect(d.generated).toBe(false);
    expect(d.review.status).toBe('unreviewed');
    expect(computePublished(d).published).toBe(false);
    const g = byLang('el').find((x) => x.contentType === 'scripture')!;
    expect(g.source.rights).toBe('unverified');
    expect(g.source.licenseNote).toMatch(/CC BY 4.0/);
    expect(g.scripture).toMatchObject({ translationId: 'sblgnt', book: '1JN', chapter: 1 });
    expect(computePublished(g).published).toBe(false);
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

  it('bundled es / de / hi / la Scripture text equals data/verified/scripture.json byte for byte', () => {
    const verified = JSON.parse(fs.readFileSync('data/verified/scripture.json', 'utf8')) as {
      by: string; checkedAt: string; translations: Array<{ lang: string; translationId: string; checkedAt?: string; verses: Record<string, { text: string }>; mismatches: unknown[] }>;
    };
    expect(verified.translations.map((t) => t.lang).sort()).toEqual(['de', 'es', 'hi', 'la', 'th']); // la: the Clementine Vulgate slices (scripts/verify-la-scripture.mts)
    for (const t of verified.translations) {
      expect(t.mismatches).toEqual([]);
      // every verified document of the language, not only the first: each verse equals the record
      const all = loadBundledCorpus().filter(x => x.lang === t.lang && x.contentType === 'scripture' && x.scripture?.verification && x.scripture.translationId === t.translationId);
      if (t.lang === 'th') {
        expect(byLang('th').find(x => x.contentType === 'scripture')!.scripture!.verification).toBeUndefined();
        expect(Object.keys(t.verses).length).toBeGreaterThan(30000);
      } else expect(all.length, t.lang).toBeGreaterThanOrEqual(1);
      for (const d of all) {
        expect(d.scripture!.translationId, d.id).toBe(t.translationId);
        // Earlier verified seed documents remain valid when a later full-translation record is added.
        const at = d.scripture!.verification!.checkedAt;
        expect(Number.isFinite(Date.parse(at)) && at <= (t.checkedAt ?? verified.checkedAt), `${d.id} verified ${at}`).toBe(true);
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
      // Hebrew and Greek: the compiled analyser is a seed core (closed classes + the commonest Biblical / New Testament words; the full indexes are
      // installed assets), so the Modern seed texts read at about half and the Biblical ones at 71–92 % (npm run corpus:validate)
      expect(analysed / words, `${d.lang}/${d.id}`).toBeGreaterThanOrEqual(PERIOD_LANGS.includes(d.lang) ? 0.45 : 0.95);
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

describe('Latin: course texts only, no seed trio (added 2026-10-17)', () => {
  const la = loadBundledCorpus().filter((d) => d.lang === 'la');
  const refsOf = (id: string) => new Set(la.find((d) => d.id === id)!.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.flatMap((x) => x.verseRefs ?? []) : []))));

  it('bundles at least eleven byte-verified Clementine Vulgate chapters (1 John 1:8–9 and John 3:16 among them) and the ladder texts', () => {
    const scripture = la.filter((d) => d.contentType === 'scripture');
    expect(scripture.length).toBeGreaterThanOrEqual(11);
    for (const d of scripture) {
      expect(d.scripture?.translationId).toBe('latVulgClementine');
      expect(d.scripture?.verification?.method).toBe('byte-comparison');
      expect(d.source.rights).toBe('public-domain');
      expect(d.work?.slug).toBe('vulgata-clementina');
    }
    expect(refsOf('vulgate-1john-1').has('1JN.1.8') && refsOf('vulgate-1john-1').has('1JN.1.9')).toBe(true);
    expect(refsOf('vulgate-john-3').has('JHN.3.16')).toBe(true);
    const ladder = la.filter((d) => d.contentType !== 'scripture');
    expect(ladder.length).toBeGreaterThanOrEqual(5);
    for (const d of ladder) expect(['ritchie-fabulae-faciles', 'caesar-de-bello-gallico-1']).toContain(d.work?.slug);
    expect(la.some((d) => ['story-01', 'dialogue-01', 'bible-1john-1'].includes(d.id))).toBe(false);
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
      expect(d.source.id, d.id).toMatch(new RegExp(`^src:${d.lang}:`));
      expect(d.source.provenance, d.id).toBeTruthy();
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
      if (d.generated) expect(gate.unpublishedReasons.join(' '), d.id).toMatch(/native-speaker review|linguistic review by a person/);
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
