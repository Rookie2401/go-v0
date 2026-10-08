/**
 * Spanish course, end to end on the real adapter, importer, catalogue, library and engines (memory store):
 * shelves that are not locks → the course's own controlled texts → one learner model across stories and Scripture →
 * personal difficulty from a profile → ranking with reasons → morphology, word parts and varieties in stored analysis →
 * a learner's own book → rights refusals.
 *
 * The controlled texts are machine-drafted and unpublished; here some are given a SYNTHETIC review so that the
 * published path can be exercised (the bundled files stay unreviewed).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { COURSES, DEFAULT_ASSISTANCE, ids, varietyStanding } from '../../src/core';
import { SPANISH_ASSISTANCE } from '../../src/course/spanish';
import type { Library, Sentence, Text } from '../../src/core';
import { SPANISH_COURSE_ID, createCourseCatalog } from '../../src/course';
import { importDocuments, plainTextToDocuments } from '../../src/ingest';
import { createLibrary } from '../../src/library';
import { rightsRefusals } from '../../src/library/build';
import { bundled, liveSentences, makeApp, reader, seedUser, syntheticallyReviewed, tokensOf, type App } from './harness';

const U = 'es-learner';
const COURSE = COURSES.find((c) => c.id === SPANISH_COURSE_ID)!;

let app: App;
let catalog: ReturnType<typeof createCourseCatalog>;
let library: Library;
const T = (slug: string) => ids.text('es', slug);
const text = async (slug: string): Promise<Text> => (await app.store.texts.get(T(slug)))!;

beforeAll(async () => {
  app = makeApp();
  await seedUser(app.store, U, SPANISH_COURSE_ID);
  catalog = createCourseCatalog({ store: app.store, golearn: app.golearn });
  await catalog.install(SPANISH_COURSE_ID);
  // the bundled Spanish documents; the first level of the controlled path gets a synthetic review (tests only)
  const docs = bundled('es').map((d) => (d.id.startsWith('camino-1-') ? syntheticallyReviewed(d) : d));
  const report = await importDocuments(app.store, app.adapters, docs, { clock: app.clock.now });
  expect(report.ok, JSON.stringify(report.documents.filter((d) => d.issues.some((i) => i.severity === 'error')).map((d) => [d.id, d.issues]))).toBe(true);
  library = createLibrary({ store: app.store, adapters: app.adapters, fetch: async () => new Response('', { status: 404 }) });
  await library.indexStore('es');
});

describe('a catalogue, not a ladder', () => {
  it('has shelves and streams, pages its works, and never gates the reader', async () => {
    expect((await catalog.stages(SPANISH_COURSE_ID)).map((s) => s.kind)).toEqual(Array(8).fill('shelf'));
    expect((await catalog.streams(SPANISH_COURSE_ID)).filter((s) => s.available).length).toBe(7);
    const page = await catalog.findWorks({ courseId: SPANISH_COURSE_ID, stream: 'honduras', limit: 5 });
    expect(page.items.length).toBe(5);
    expect(page.total).toBeGreaterThan(5);
    // a shelf course has a current stage (the first shelf not ready) and nothing locks; a controlled text takes its shelf's profile, a text on no shelf the default
    expect((await catalog.currentStage(U, SPANISH_COURSE_ID))!.key).toBe('s0');
    expect(await catalog.assistanceFor({ courseId: SPANISH_COURSE_ID, textId: T('camino-1-01') })).toEqual(SPANISH_ASSISTANCE.s0);
    expect(await catalog.assistanceFor({ courseId: SPANISH_COURSE_ID })).toEqual(DEFAULT_ASSISTANCE);
  });

  it('the controlled texts belong to their work and stream; unreviewed ones stay unpublished', async () => {
    const c1 = await text('camino-1-01');
    expect(c1).toMatchObject({ workId: ids.work(SPANISH_COURSE_ID, 'camino-1'), published: true, generated: true }); // synthetic review in this test only
    expect(c1.streams).toContain('acquisition');
    const c2 = await text('camino-2-01');
    expect(c2.published).toBe(false);
    expect(c2.unpublishedReasons.join(' ')).toMatch(/review/i);
    const hn = await text('honduras-lecturas-1-01');
    expect(hn).toMatchObject({ variety: 'es-HN', published: false });
  });
});

describe('the library: an index and profiles, nothing loaded whole', () => {
  it('indexes the texts in the store and pages by stream, by work and by text', async () => {
    const acq = await library.search({ lang: 'es', stream: 'acquisition', limit: 5 });
    expect(acq.items.length).toBe(5);
    expect(acq.total).toBeGreaterThanOrEqual(22);
    const byWork = await library.search({ lang: 'es', workId: ids.work(SPANISH_COURSE_ID, 'camino-1') });
    expect(byWork.items.map((i) => i.chapter)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const published = await library.search({ lang: 'es', publishedOnly: true, limit: 100 });
    expect(published.items.every((i) => i.published)).toBe(true);
    expect(published.items.some((i) => i.id === T('camino-2-01'))).toBe(false);
    const found = await library.search({ lang: 'es', text: 'juan' });
    expect(found.items.some((i) => i.id === T('camino-1-01'))).toBe(true);
  });

  it('a profile carries what scoring needs and the generic features of the text', async () => {
    const p = (await library.profile(T('camino-3-04')))!;
    expect(p.words).toBeGreaterThan(200);
    expect(p.forms.length).toBeGreaterThan(80);
    expect(p.forms.reduce((n, [, c]) => n + c, 0)).toBe(p.words);
    expect(p.features.meanSentenceWords).toBeGreaterThan(8);
    const early = (await library.profile(T('camino-1-01')))!;
    expect(early.features.meanSentenceWords).toBeLessThan(p.features.meanSentenceWords);
  });
});

describe('one learner model across every surface', () => {
  let s1: Sentence[];

  it('reading a story changes the personal difficulty of other texts, Scripture included', async () => {
    const scripture = (await library.profile(T('bible-1john-1')))!;
    const next = (await library.profile(T('camino-1-02')))!;
    const before = { next: await app.golearn.scoreProfile(U, next), scripture: await app.golearn.scoreProfile(U, scripture) };
    expect(before.next.newShare).toBe(1);
    expect(before.next.personal.caveats.join(' ')).toMatch(/little|history|read/i);

    const t = await text('camino-1-01');
    s1 = await liveSentences(app.store, t.id);
    const r = reader(app, U, 'es', 'sit-1');
    await r.view(t, s1);
    await r.report(t, s1, 'all', 'text');
    await app.golearn.settled();

    const after = { next: await app.golearn.scoreProfile(U, next), scripture: await app.golearn.scoreProfile(U, scripture) };
    expect(after.next.newShare).toBeLessThan(before.next.newShare);
    expect(after.next.knownShare).toBeGreaterThan(0);
    // words met in a course story are known when they turn up in Scripture
    expect(after.scripture.newShare).toBeLessThan(before.scripture.newShare);
    for (const s of [after.next, after.scripture]) expect(s.knownShare + s.familiarShare + s.metShare + s.newShare).toBeCloseTo(1, 5);
    expect(['comfortable', 'manageable', 'challenging', 'hard', 'unknown']).toContain(after.next.personal.label);
  });

  it('ranks next reads with reasons, prefers what the learner can read, and brings back what he struggled with', async () => {
    const t = await text('camino-1-01');
    const mesa = (await Promise.all(s1.map((s) => tokensOf(app.store, s.id)))).flat().find((x) => x.normalized === 'mesa')!;
    const r = reader(app, U, 'es', 'sit-1');
    await r.tap(t, s1.find((s) => s.id === mesa.sentenceId)!, mesa, 1);
    await app.golearn.settled();

    const slugs = ['camino-1-02', 'camino-1-03', 'camino-1-04', 'camino-3-04', 'bible-1john-1'];
    const candidates = await Promise.all(slugs.map(async (slug) => {
      const entry = (await library.entry(T(slug)))!;
      return { profile: (await library.profile(T(slug)))!, workId: entry.workId, stream: entry.stream, variety: entry.variety, published: entry.published, controlled: slug.startsWith('camino') };
    }));
    const ranked = await app.golearn.rankLibrary(U, candidates, { targetVariety: COURSE.variety?.target, interests: ['acquisition'] });
    expect(ranked.length).toBe(slugs.length);
    // best first — but not strictly by score: no more than two texts of one work may follow each other
    expect(ranked[0].score).toBe(Math.max(...ranked.map((x) => x.score)));
    const workOf = (id: string) => candidates.find((c) => c.profile.textId === id)!.workId;
    for (let i = 2; i < ranked.length; i++) {
      const [a, b, c] = [ranked[i - 2], ranked[i - 1], ranked[i]].map((x) => workOf(x.textId));
      expect(a !== undefined && a === b && b === c, `three in a row from ${String(a)}`).toBe(false);
    }
    for (const x of ranked) { expect(x.reasons.length).toBeGreaterThan(0); expect(x.score).toBeGreaterThanOrEqual(0); expect(x.score).toBeLessThanOrEqual(1); }
    // a first-level text outranks a long subjunctive narrative for a learner who has read one story
    const pos = (slug: string) => ranked.findIndex((x) => x.textId === T(slug));
    expect(Math.min(pos('camino-1-02'), pos('camino-1-03'), pos('camino-1-04'))).toBeLessThan(pos('camino-3-04'));
    // the same ranking twice is the same ranking
    expect(await app.golearn.rankLibrary(U, candidates, { targetVariety: COURSE.variety?.target, interests: ['acquisition'] })).toEqual(ranked);
    // contextual repetition: a text containing the word he needed help with says so in its reasons or carries it as a weak item
    const withMesa = ranked.filter((x) => x.profile.weakItems.includes(ids.form('es', 'mesa')));
    for (const x of withMesa) expect(x.parts.reinforcement).toBeGreaterThan(0);
  });

  it('finds natural examples of a word across the texts in the store', async () => {
    const hits = await app.golearn.findOccurrences({ lang: 'es', itemId: ids.form('es', 'libro'), includeUnpublished: true, limit: 5 });
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.length).toBeLessThanOrEqual(5);
    expect(new Set(hits.map((h) => h.textId)).size).toBeGreaterThanOrEqual(1);
  });
});

describe('Spanish morphology, word parts and varieties reach the stored analysis', () => {
  let toks: Awaited<ReturnType<typeof tokensOf>>;
  const analysisOf = async (surface: string) => app.golearn.resolveAnalysis(toks.find((t) => t.normalized === surface)!.id);

  beforeAll(async () => {
    const body = [
      'Si hubiéramos tenido tiempo, habríamos ido al mercado.',
      'Quiero decírselo mañana.',
      'Vos tenés razón.',
      'Vosotros tenéis un ordenador nuevo.',
    ].join('\n');
    const { documents } = plainTextToDocuments(body, { lang: 'es', title: 'Morphology probe (synthetic)', idPrefix: 'morph-probe', chapters: 'none' });
    const r = await importDocuments(app.store, app.adapters, documents, { clock: app.clock.now });
    expect(r.ok, JSON.stringify(r.documents.map((d) => d.issues))).toBe(true);
    const sentences = await liveSentences(app.store, T(documents[0].id));
    toks = (await Promise.all(sentences.map((s) => tokensOf(app.store, s.id)))).flat();
  });

  it('hubiéramos is haber, first person plural, imperfect subjunctive — by rule, with its origin recorded', async () => {
    const a = (await analysisOf('hubiéramos'))!;
    const lemma = await app.store.lemmas.get(a.lemmaId!);
    expect(lemma?.lemma).toBe('haber');
    expect(a.morph).toMatchObject({ Mood: 'Sub', Tense: 'Imp', Person: '1', Number: 'Plur' });
    expect(['rule', 'hand']).toContain(a.origin);
    expect(app.adapters.get('es').describeMorph!(a.morph, a.pos).toLowerCase()).toMatch(/imperfect subjunctive/);
  });

  it('decírselo is decir + se + lo, and the parts tile the written word', async () => {
    const a = (await analysisOf('decírselo'))!;
    expect((await app.store.lemmas.get(a.lemmaId!))?.lemma).toBe('decir');
    expect(a.parts?.map((p) => p.text.toLowerCase())).toEqual(['decír', 'se', 'lo']);
    expect(a.parts![0].start).toBe(0);
    expect(a.parts!.at(-1)!.end).toBe('decírselo'.length);
  });

  it('vos tenés is part of the Honduran target; vosotros tenéis and ordenador are for recognition', async () => {
    const varieties = app.adapters.get('es').varieties;
    const standing = async (surface: string) => varietyStanding((await analysisOf(surface))?.varieties, COURSE.variety, varieties);
    expect(await standing('tenés')).toBe('target');
    expect(await standing('tenéis')).toBe('receptive');
    expect(await standing('ordenador')).toBe('receptive');
    expect(await standing('razón')).toBe('general');
  });
});

describe('a learner\'s own Spanish book', () => {
  it('imports from wrapped plain text with Spanish chapter headings, stays personal, and is scored like anything else', async () => {
    const book = [
      'CAPÍTULO I', '',
      'Juan tenía una casa pequeña cerca del', 'mercado. Todos los días iba a la mesa y', 'tomaba un libro grande.', '',
      'Su madre le decía que el libro era muy bueno.', '',
      'CAPÍTULO II', '',
      'Un día Juan quiso leer otro libro, pero', 'no lo encontró en la casa.', '',
    ].join('\n');
    const { documents, notes } = plainTextToDocuments(book, { lang: 'es', title: 'Libro de prueba (synthetic)', idPrefix: 'libro-prueba', paragraphs: 'blank-line', unwrap: true });
    expect(documents.length, notes.join(' | ')).toBe(2);
    const r = await importDocuments(app.store, app.adapters, documents, { clock: app.clock.now });
    expect(r.ok, JSON.stringify(r.documents.map((d) => d.issues))).toBe(true);
    const ch1 = (await app.store.texts.get(T(documents[0].id)))!;
    expect(ch1).toMatchObject({ personalCopy: true, published: true });
    const paragraphs = (await app.store.paragraphs.where('textId', ch1.id)).sort((a, b) => a.index - b.index).map((p) => p.originalText);
    expect(paragraphs[0]).toBe('Juan tenía una casa pequeña cerca del mercado. Todos los días iba a la mesa y tomaba un libro grande.');
    await library.indexStore('es');
    expect((await library.entry(ch1.id))?.location).toBe('personal');
    const f = await app.golearn.predictDifficulty(U, ch1.id);
    expect(f.personal?.label).toBeDefined();
    expect(f.personal!.factors.length).toBeGreaterThan(0);
  });
});

describe('rights are enforced by the tooling, not by good intentions', () => {
  it('the library build refuses anything that is not verified or course-authored', () => {
    const unverified = rightsRefusals({ rights: { state: 'rights-unverified', copyrightStatus: 'unknown', permission: 'unknown', canBundle: false, userImportOnly: true, audiobook: 'unknown', verified: false }, source: 'x.txt' } as never);
    expect(unverified.length).toBeGreaterThan(0);
    const modern = rightsRefusals({ rights: { state: 'prohibited-from-bundling', copyrightStatus: 'in-copyright', permission: 'none', canBundle: false, userImportOnly: true, audiobook: 'unknown', verified: false }, source: 'x.txt' } as never);
    expect(modern.length).toBeGreaterThan(0);
    // "verified" without a named verifier and a basis is not verified
    const hollow = rightsRefusals({ rights: { state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, userImportOnly: false, audiobook: 'unknown', verified: true }, source: 'x.txt' } as never);
    expect(hollow.length).toBeGreaterThan(0);
  });
});
