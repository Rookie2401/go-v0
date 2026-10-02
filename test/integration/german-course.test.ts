/**
 * German course, end to end on the real adapter, importer, catalogue and learner model (memory store).
 * Coordinator's test: what the owner's brief asks the system to UNDERSTAND, checked on the bundled texts —
 *   steht … auf / aufstehen / aufgestanden are one verb;  im is in + dem;  Hause, Haus are one noun across Scripture
 *   and stories;  daß is dass;  a unit is one encounter;  rights states gate what is bundled.
 *
 * The first-party texts are machine-drafted and unpublished; here one level is given a SYNTHETIC review so that the
 * published path can be exercised (the bundled files stay unreviewed).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { COURSES, ids, varietyStanding } from '../../src/core';
import type { Sentence, Text, Token, TokenAnalysis } from '../../src/core';
import { GERMAN_COURSE_ID, GERMAN_DOORS, GERMAN_SHELVES, GERMAN_STREAMS, GERMAN_WORKS, createCourseCatalog } from '../../src/course';
import { importDocuments, plainTextToDocuments } from '../../src/ingest';
import { bundleDecision } from '../../src/ingest/rights';
import { measureStoredText } from '../../src/library/measure';
import { bundled, liveSentences, makeApp, reader, seedUser, syntheticallyReviewed, tokensOf, type App } from './harness';

const U = 'de-learner';
const COURSE = COURSES.find((c) => c.id === GERMAN_COURSE_ID)!;
const T = (slug: string) => ids.text('de', slug);

let app: App;
const text = async (slug: string): Promise<Text> => (await app.store.texts.get(T(slug)))!;
const sentencesOf = (slug: string): Promise<Sentence[]> => liveSentences(app.store, T(slug));

/** The sentence of a text that has exactly this wording, its tokens, and the stored analysis of each word. */
async function sentence(slug: string, wording: string): Promise<{ s: Sentence; tokens: Token[]; a: (surface: string, nth?: number) => Promise<TokenAnalysis> }> {
  const s = (await sentencesOf(slug)).find((x) => x.text === wording);
  if (!s) throw new Error(`${slug} has no sentence "${wording}"`);
  const tokens = await tokensOf(app.store, s.id);
  const a = async (surface: string, nth = 0) => {
    const t = tokens.filter((x) => x.surface === surface)[nth];
    if (!t) throw new Error(`"${wording}" has no token "${surface}"`);
    const rows = await app.store.analyses.where('tokenId', t.id);
    if (!rows[0]) throw new Error(`"${surface}" has no stored analysis`);
    return rows[0];
  };
  return { s, tokens, a };
}
const lemmaText = async (a: TokenAnalysis) => (a.lemmaId ? (await app.store.lemmas.get(a.lemmaId))?.lemma : undefined);

beforeAll(async () => {
  app = makeApp();
  await seedUser(app.store, U, GERMAN_COURSE_ID);
  const catalog = createCourseCatalog({ store: app.store, golearn: app.golearn });
  await catalog.install(GERMAN_COURSE_ID);
  const docs = bundled('de').map((d) => (d.id.startsWith('weg-2-') ? syntheticallyReviewed(d) : d));
  const report = await importDocuments(app.store, app.adapters, docs, { clock: app.clock.now });
  expect(report.ok, JSON.stringify(report.documents.filter((d) => d.issues.some((i) => i.severity === 'error')).map((d) => [d.id, d.issues]))).toBe(true);
}, 120_000);

describe('the German catalogue: recommended is not bundleable', () => {
  it('has streams, shelves that are not locks, doors, and a de-DE target', () => {
    expect(GERMAN_STREAMS.find((s) => s.key === 'listening')!.available).toBe(false);
    expect(GERMAN_STREAMS.filter((s) => s.available).map((s) => s.key)).toEqual(['acquisition', 'conversation', 'library', 'germany', 'knowledge', 'scripture', 'mission', 'personal']);
    expect(GERMAN_SHELVES.every((s) => s.kind === 'shelf')).toBe(true);
    expect(GERMAN_DOORS.some((d) => d.key === 'your-books')).toBe(true);
    expect(COURSE.variety).toEqual({ target: 'de-DE', within: [] });
    const varieties = app.adapters.get('de').varieties!;
    expect(varietyStanding(['de-DE'], COURSE.variety, varieties)).toBe('target');
    expect(varietyStanding(['de-AT'], COURSE.variety, varieties)).toBe('receptive');
    expect(varietyStanding(['de-1901'], COURSE.variety, varieties)).toBe('historical');
  });

  it('never marks a work bundled, implemented or verified-ready without a verified rights state and its evidence', () => {
    const bundlable = new Set(['verified-public-domain', 'verified-open-licence', 'permission-granted', 'course-authored']);
    for (const w of GERMAN_WORKS) {
      const state = w.rights.state!;
      if (w.ingestion === 'bundled' || w.readiness === 'implemented' || w.readiness === 'verified-ready') expect(bundlable.has(state), `${w.title}: ${state}`).toBe(true);
      if (!bundlable.has(state)) {
        expect(w.rights.canBundle, w.title).toBe(false);
        expect(w.ingestion, w.title).toBe('catalogued');
        expect(['candidate', 'recommendation'], w.title).toContain(w.readiness);
      }
      if (state === 'verified-public-domain' || state === 'verified-open-licence' || state === 'permission-granted') {
        expect(w.rights.verified, w.title).toBe(true);
        expect(w.rights.verifiedBy, w.title).toBeTruthy();
        expect(w.rights.sourceRepository, w.title).toBeTruthy();
        expect(w.rights.evidence?.length ?? 0, w.title).toBeGreaterThanOrEqual(2);
        expect(w.rights.jurisdictions?.length ?? 0, w.title).toBeGreaterThan(0);
        expect(w.rights.modifications, w.title).toBeTruthy();
        expect(w.rights.compliance, w.title).toBeTruthy();
      }
      if (state === 'prohibited-from-bundling') expect(w.readiness, w.title).toBe('recommendation');
      if (state === 'rights-unverified') expect(w.rights.basis ?? w.rights.acquisitionNotes, w.title).toMatch(/lead|not verified/i);
      expect(w.bibliographyVerified, w.title).toBe(false);
    }
    // a death year alone never became "public domain"
    expect(GERMAN_WORKS.filter((w) => w.rights.state === 'verified-public-domain').map((w) => w.title).sort())
      .toEqual(['Der süße Brei', 'Die Bibel nach der deutschen Übersetzung D. Martin Luthers (1912)', 'Die Sternthaler']);
  });

  it('every bundled German document belongs to a catalogued work and passes the production rights gate', () => {
    const works = new Map(GERMAN_WORKS.map((w) => [w.id, w]));
    for (const d of bundled('de')) {
      const slug = (d as { work?: { slug?: string } }).work?.slug;
      if (slug) expect(works.has(ids.work(GERMAN_COURSE_ID, slug)), `${d.id} → ${slug}`).toBe(true);
      const verdict = bundleDecision(d, { work: (_lang, s) => { const w = works.get(ids.work(GERMAN_COURSE_ID, s)); return w ? { state: w.rights.state, verifiedBy: w.rights.verifiedBy, verifiedAt: w.rights.verifiedAt } : undefined; } });
      expect(verdict.verdict, `${d.id}: ${verdict.reason}`).toBe('bundle');
    }
  });

  it('publishes the verified Scripture slice, and nothing machine-drafted without a review', async () => {
    for (const slug of ['bible-gen-1', 'bible-psa-1', 'bible-psa-23', 'bible-mat-1']) expect((await text(slug)).published, slug).toBe(true);
    expect((await text('weg-1-01')).published).toBe(false);
    expect((await text('weg-1-01')).unpublishedReasons.join(' ')).toMatch(/native-speaker review/);
    expect((await text('weg-2-01')).published).toBe(true); // the synthetic review of this test
    // the Grimm tale: wording verified, English lines machine-drafted → still waiting for a reader
    expect((await text('grimm-sternthaler-1857')).published).toBe(false);
  });
});

describe('a verb written in two places is one verb', () => {
  it('"Anna steht jeden Morgen um sechs Uhr auf." — both pieces are aufstehen, joined as a unit, counted once', async () => {
    const { s, tokens, a } = await sentence('weg-2-01', 'Anna steht jeden Morgen um sechs Uhr auf.');
    const verb = await a('steht');
    const particle = await a('auf');
    expect(await lemmaText(verb)).toBe('aufstehen');
    expect(await lemmaText(particle)).toBe('aufstehen');
    const verbToken = tokens.find((t) => t.surface === 'steht')!;
    const particleToken = tokens.find((t) => t.surface === 'auf')!;
    expect(verb.unit?.headTokenId).toBe(verbToken.id);
    expect(particle.unit?.headTokenId).toBe(verbToken.id);
    expect(verb.unit?.pieceTokenIds).toEqual([verbToken.id, particleToken.id]);
    expect(verb.unit?.display).toBe('aufstehen');
    // one encounter of the verb, not two — and none of the preposition "auf"
    const t = await text('weg-2-01');
    await reader(app, U, 'de', 's-unit').view(t, [s]);
    expect((await app.golearn.getItemState(U, verb.lemmaId!))?.encounterCount).toBe(1);
    const auf = app.adapters.get('de').analyze(app.adapters.get('de').tokenize('auf dem Tisch'))[0].candidates[0];
    expect(auf.lemma).toBe('auf');
    expect(await app.golearn.getItemState(U, ids.lemma('de', 'auf', auf.pos!))).toBeUndefined();
    // the construction is tracked too
    const patterns = (await app.store.patternOccurrences.where('sentenceId', s.id)).map((p) => p.patternId);
    expect(patterns).toContain(ids.pattern('de', 'separable-prefix-verb'));
  });

  it('the infinitive, the separated form and the participle all lead to the same lemma item', async () => {
    const split = await (await sentence('weg-2-01', 'Anna steht jeden Morgen um sechs Uhr auf.')).a('steht');
    const infinitive = await (await sentence('weg-2-01', 'Anna sagt: „Du musst jetzt aufstehen, Lena. Die Schule fängt um acht Uhr an.“')).a('aufstehen');
    const participle = await (await sentence('weg-3-03', 'Lena war schon um fünf Uhr aufgestanden, weil sie sich so auf die Reise freute.')).a('aufgestanden');
    expect(infinitive.lemmaId).toBe(split.lemmaId);
    expect(participle.lemmaId).toBe(split.lemmaId);
    expect(participle.morph).toMatchObject({ VerbForm: 'Part', Tense: 'Past' });
    expect(participle.parts?.map((p) => p.kind)).toEqual(expect.arrayContaining(['prefix', 'marker']));
    expect(infinitive.unit).toBeUndefined();
  });

  it('a preposition with its noun is not a stranded prefix: "Sie geht ins Zimmer und sucht auf dem Sofa."', async () => {
    const { a } = await sentence('weg-2-07', 'Sie geht ins Zimmer und sucht auf dem Sofa.');
    const auf = await a('auf');
    expect(auf.unit).toBeUndefined();
    expect(auf.pos).toBe('ADP');
    expect(await lemmaText(await a('sucht'))).toBe('suchen');
    expect((await a('Sofa')).morph).toMatchObject({ Case: 'Dat', Gender: 'Neut', Number: 'Sing' });
  });
});

describe('one written word, two words', () => {
  it('im is in + dem, and what follows is dative: "Lena liegt im Bett und ist sehr müde."', async () => {
    const { a } = await sentence('weg-2-05', 'Lena liegt im Bett und ist sehr müde.');
    const im = await a('im');
    expect(await lemmaText(im)).toBe('in');
    expect(im.parts?.map((p) => [p.lemma, p.kind])).toEqual([['in', 'contracted'], ['der', 'contracted']]);
    expect((await a('Bett')).morph).toMatchObject({ Case: 'Dat', Gender: 'Neut', Number: 'Sing' });
  });
});

describe('one learner model across stories and Scripture', () => {
  it('Haus in a story and Hause in Psalm 23 are the same lemma item; HERRN is Herr', async () => {
    const story = await (await sentence('weg-2-06', 'Frau Weber wohnt im Haus neben Anna.')).a('Haus');
    const psalm = (await sentencesOf('bible-psa-23')).find((s) => s.text.includes('im Hause des HERRN'))!;
    const tokens = await tokensOf(app.store, psalm.id);
    const analysisOf = async (surface: string) => (await app.store.analyses.where('tokenId', tokens.find((t) => t.surface === surface)!.id))[0];
    const hause = await analysisOf('Hause');
    expect(hause.lemmaId).toBe(story.lemmaId);
    expect(hause.morph).toMatchObject({ Case: 'Dat', Number: 'Sing' });
    expect(await lemmaText(await analysisOf('HERRN'))).toBe('Herr');
    // reading the psalm verse credits the same item the story uses
    const before = (await app.golearn.getItemState(U, story.lemmaId!))?.encounterCount ?? 0;
    await reader(app, U, 'de', 's-psalm').view(await text('bible-psa-23'), [psalm]);
    expect((await app.golearn.getItemState(U, story.lemmaId!))?.encounterCount).toBe(before + 1);
  });
});

describe('older spelling is related, never rewritten', () => {
  it('daß in Genesis 1 is dass, in the spelling before 1996; the text keeps its ß', async () => {
    const s = (await sentencesOf('bible-gen-1')).find((x) => x.text.startsWith('Und Gott sah, daß das Licht gut war.'))!;
    expect(s.text).toContain('daß');
    const tokens = await tokensOf(app.store, s.id);
    const dass = (await app.store.analyses.where('tokenId', tokens.find((t) => t.surface === 'daß')!.id))[0];
    expect(await lemmaText(dass)).toBe('dass');
    expect(dass.orthography).toMatchObject({ modern: 'dass', period: 'de-1901' });
    expect(dass.pos).toBe('SCONJ');
  });

  it('gieng in Grimm is gehen (today: ging); searching the modern form finds the old one', async () => {
    const s = (await sentencesOf('grimm-der-suesse-brei-1857')).find((x) => x.text.startsWith('Da gieng das Kind hinaus in den Wald'))!;
    const tokens = await tokensOf(app.store, s.id);
    const gieng = (await app.store.analyses.where('tokenId', tokens.find((t) => t.surface === 'gieng')!.id))[0];
    expect(['gehen', 'hinausgehen']).toContain(await lemmaText(gieng));
    expect(gieng.orthography).toMatchObject({ modern: 'ging', period: 'de-pre1901' });
    const hits = await app.golearn.findOccurrences({ lang: 'de', itemId: ids.form('de', 'dass'), includeUnpublished: true, limit: 50 });
    expect(hits.some((h) => h.spellings?.some((x) => x.written === 'daß'))).toBe(true);
  });

  it('a text in older spelling says so in its features; a modern text does not', async () => {
    const grimm = await measureStoredText(app.store, T('grimm-sternthaler-1857'));
    const modern = await measureStoredText(app.store, T('weg-2-01'));
    expect(grimm!.features.historicalSpellingShare).toBeGreaterThan(0.01);
    expect(modern!.features.historicalSpellingShare).toBeUndefined();
    expect(modern!.features.bracketDistance).toBeGreaterThan(0); // steht … auf, fängt … an
    const forecast = await app.golearn.predictDifficulty(U, T('grimm-sternthaler-1857'));
    expect(forecast.personal?.factors.map((f) => f.key)).toContain('older-spelling');
  });
});

describe('the learner\'s own German book and his own writing', () => {
  it('a plain-text copy imports as "Your copy", with compounds, a separated verb and a contraction analysed', async () => {
    const book = [
      'Kapitel 1', '',
      'Am Montag steht Jonas früh auf. Er geht ins Arbeitszimmer und ruft seine Schwester an.', '',
      'Kapitel 2', '',
      'Die Lebensversicherung war teuer, aber er hat sie bezahlt.', '',
    ].join('\n');
    const { documents, notes } = plainTextToDocuments(book, { lang: 'de', title: 'Mein Buch (synthetic)', idPrefix: 'mein-buch', paragraphs: 'blank-line' });
    expect(documents.length, notes.join(' | ')).toBe(2);
    const r = await importDocuments(app.store, app.adapters, documents, { clock: app.clock.now });
    expect(r.ok, JSON.stringify(r.documents.map((d) => d.issues))).toBe(true);
    const ch1 = (await app.store.texts.get(T(documents[0].id)))!;
    expect(ch1).toMatchObject({ personalCopy: true, published: true });
    const sentences = await liveSentences(app.store, ch1.id);
    const tokens = (await Promise.all(sentences.map((s) => tokensOf(app.store, s.id)))).flat();
    const analysisOf = async (surface: string) => (await app.store.analyses.where('tokenId', tokens.find((t) => t.surface === surface)!.id))[0];
    expect(await lemmaText(await analysisOf('steht'))).toBe('aufstehen');
    expect(await lemmaText(await analysisOf('ruft'))).toBe('anrufen');
    expect((await analysisOf('ins')).parts?.map((p) => p.lemma)).toEqual(['in', 'der']);
    const zimmer = await analysisOf('Arbeitszimmer');
    expect(zimmer.parts?.filter((p) => p.kind === 'component' || p.kind === 'head').map((p) => p.lemma)).toEqual(['Arbeit', 'Zimmer']);
    expect(zimmer.parts?.some((p) => p.kind === 'link' && p.text === 's')).toBe(true);
  });

  it('checks the learner\'s own sentences without pretending to judge everything', () => {
    const de = app.adapters.get('de');
    const check = (s: string) => { const tokens = de.tokenize(s); return de.checkProduction(tokens, de.analyze(tokens), s); };
    const apply = (s: string, sug: { start: number; end: number; replacement: string }) => s.slice(0, sug.start) + sug.replacement + s.slice(sug.end);
    const aux = check('Ich habe nach Hause gegangen.');
    expect(aux.length).toBeGreaterThan(0);
    expect(aux.some((e) => e.suggestion && apply('Ich habe nach Hause gegangen.', e.suggestion) === 'Ich bin nach Hause gegangen.')).toBe(true);
    const order = check('Ich bleibe zu Hause, weil ich bin müde.');
    expect(order.some((e) => e.category === 'word-order')).toBe(true);
    const dative = check('Ich gehe mit den Mann.');
    expect(dative.some((e) => e.suggestion && apply('Ich gehe mit den Mann.', e.suggestion) === 'Ich gehe mit dem Mann.')).toBe(true);
    // correct German is left alone
    for (const ok of ['Ich bin nach Hause gegangen.', 'Ich bleibe zu Hause, weil ich müde bin.', 'Ich glaube an Jesus Christus.', 'Heute gehe ich mit dem Mann in die Kirche.']) expect(check(ok), ok).toEqual([]);
  });
});
