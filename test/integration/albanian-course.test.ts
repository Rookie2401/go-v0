/**
 * Albanian course, end to end on the real adapter, importer, catalogue, learner model and GoTell (memory store):
 * the ladder and its rights records → the course's own texts (machine-drafted, unpublished) → every word read by the
 * word list → the little words keep every reading → a linking article and its adjective are ONE item → a disputed reading
 * stays cautious → one learner model keyed by lemma → rights enforced by the build gate → the learner's own book, typed
 * partly without ë / ç → constructions and the writing checks → the other languages are untouched.
 *
 * The bundled Albanian texts are machine-drafted and unreviewed, and they stay that way here. Every Albanian sentence in
 * this file is taken from a bundled corpus document or from the adapter tests; none is written for this file.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { COURSES, ids, varietyStanding } from '../../src/core';
import type { Sentence, Text, Token, TokenAnalysis } from '../../src/core';
import { ALBANIAN_COURSE_ID, ALBANIAN_DOORS, ALBANIAN_SCRIPTURE_POLICY, ALBANIAN_STAGES, ALBANIAN_STREAMS, ALBANIAN_VARIETY_POLICY, ALBANIAN_WORKS, ALB_BIBLE_RIGHTS, createCourseCatalog } from '../../src/course';
import { ALBANIAN_ASSISTANCE } from '../../src/course/albanian';
import { importDocuments, plainTextToDocuments } from '../../src/ingest';
import type { CorpusDocument } from '../../src/ingest';
import { BUNDLABLE_WORK_STATES, bundleDecision } from '../../src/ingest/rights';
import type { AnalyzedError } from '../../src/gotell/provider';
import { sqAdapter } from '../../src/adapters/sq';
import { SQ_CONSTRUCTIONS } from '../../src/adapters/albanian/constructions';
import { SQ_MAJORITY } from '../../src/adapters/albanian/disputed';
import { bundled, bundledDoc, liveSentences, makeApp, reader, seedUser, tokensOf, type App } from './harness';

const C = ALBANIAN_COURSE_ID;
const U = 'sq-learner';
const T = (slug: string) => ids.text('sq', slug);
const OWN = /^(udha-0|udha-1|misioni-1)-\d+$/; // the course's own bundled documents
const COURSE_WORKS = ['udha-0', 'udha-1', 'misioni-1'];
const LITTLE = new Set(['e', 'i', 'të', 'së', 'u', 'më', 'do', 'po', 'pa']);

let app: App;
let catalog: ReturnType<typeof createCourseCatalog>;
let importReport: Awaited<ReturnType<typeof importDocuments>>;

/** Every word token of the course's own texts with its sentence, text and stored (first) analysis. */
interface Row { text: Text; sentence: Sentence; token: Token; tokens: Token[]; analysis: TokenAnalysis }
let rows: Row[] = [];

const ownDocs = (): CorpusDocument[] => bundled('sq').filter((d) => OWN.test(d.id));
const text = async (slug: string): Promise<Text> => (await app.store.texts.get(T(slug)))!;
const analysisOf = async (tokenId: string): Promise<TokenAnalysis | undefined> => (await app.store.analyses.where('tokenId', tokenId))[0];
const lemmaText = async (a: TokenAnalysis) => (a.lemmaId ? (await app.store.lemmas.get(a.lemmaId))?.lemma : undefined);
const workRecord = (_lang: string, slug: string) => {
  const w = ALBANIAN_WORKS.find((x) => x.id === ids.work(C, slug));
  return w ? { state: w.rights.state, verifiedBy: w.rights.verifiedBy, verifiedAt: w.rights.verifiedAt } : undefined;
};

/** A sentence of a bundled document, found by its exact wording (so no Albanian is written for this file). */
function corpusSentence(docId: string, wording: string): string {
  const all = bundledDoc('sq', docId).sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.map((x) => x.text) : [])));
  if (!all.includes(wording)) throw new Error(`${docId} has no sentence "${wording}"`);
  return wording;
}
/** The same sentence as a learner without an Albanian keyboard would type it. */
const withoutDiacritics = (s: string) => s.replace(/ë/g, 'e').replace(/Ë/g, 'E').replace(/ç/g, 'c').replace(/Ç/g, 'C');

async function sentenceWith(slug: string, wording: string): Promise<{ t: Text; s: Sentence; tokens: Token[] }> {
  const t = await text(slug);
  const s = (await liveSentences(app.store, t.id)).find((x) => x.text === wording);
  if (!s) throw new Error(`${slug} has no sentence "${wording}"`);
  return { t, s, tokens: await tokensOf(app.store, s.id) };
}

beforeAll(async () => {
  app = makeApp();
  await seedUser(app.store, U, C);
  catalog = createCourseCatalog({ store: app.store, golearn: app.golearn });
  await catalog.install(C);
  // the whole bundled Albanian corpus: the 20 course documents, the two seed texts and the Scripture fixture
  importReport = await importDocuments(app.store, app.adapters, bundled('sq'), { clock: app.clock.now });
  for (const t of (await app.store.texts.all()).filter((x) => x.lang === 'sq' && OWN.test(x.id.slice('text:sq:'.length)))) {
    for (const sentence of await liveSentences(app.store, t.id)) {
      const tokens = await tokensOf(app.store, sentence.id);
      for (const token of tokens.filter((x) => x.isWord)) {
        const analysis = await analysisOf(token.id);
        rows.push({ text: t, sentence, token, tokens, analysis: analysis as TokenAnalysis });
      }
    }
  }
}, 120_000);

// ───────────────────────────── 1. the catalogue ─────────────────────────────

describe('the Albanian catalogue', () => {
  it('installs eleven stages, 0 to 9 and open, in order, none of them a lock', async () => {
    const stages = await catalog.stages(C);
    expect(stages.map((s) => s.key)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'open']);
    expect(stages.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(stages.map((s) => s.id)).toEqual(ALBANIAN_STAGES.map((s) => s.id));
    expect(stages.every((s) => s.courseId === C && s.lang === 'sq')).toBe(true);
    for (const s of stages.filter((x) => x.kind !== 'open')) expect(s.purpose.join(' ')).toMatch(/nothing is locked/);
  });

  it('installs the eight streams; listening is unavailable and every door opens an existing stream', async () => {
    const streams = await catalog.streams(C);
    expect(streams.map((s) => s.key)).toEqual(['acquisition', 'library', 'scripture', 'mission', 'historical', 'gheg', 'personal', 'listening']);
    expect(streams.filter((s) => !s.available).map((s) => s.key)).toEqual(['listening']);
    expect(streams.map((s) => s.id)).toEqual(ALBANIAN_STREAMS.map((s) => s.id));
    const keys = new Set(streams.map((s) => s.key));
    for (const d of ALBANIAN_DOORS) { expect(keys.has(d.stream), d.key).toBe(true); expect(d.stream).not.toBe('listening'); }
  });

  it('installs every work of the manifest, each in a stage that exists', async () => {
    const works = await catalog.works(C);
    expect(works.map((w) => w.id).sort()).toEqual(ALBANIAN_WORKS.map((w) => w.id).sort());
    const stageIds = new Set((await catalog.stages(C)).map((s) => s.id));
    for (const w of works) expect(stageIds.has(w.stageId), w.title).toBe(true);
    expect((await catalog.findWorks({ courseId: C, stream: 'mission' })).items.map((w) => w.id)).toContain(ids.work(C, 'misioni-1'));
  });

  it('lets exactly the three course-authored works be bundled, and no external work claims to be verified', async () => {
    const works = await catalog.works(C);
    const bundlable = works.filter((w) => BUNDLABLE_WORK_STATES.includes(w.rights.state ?? ''));
    expect(bundlable.map((w) => w.id.split(':')[2]).sort()).toEqual([...COURSE_WORKS].sort());
    for (const w of bundlable) {
      expect(w.rights).toMatchObject({ state: 'course-authored', canBundle: true });
      expect(w.ingestion).toBe('bundled');
    }
    for (const w of works.filter((x) => !bundlable.includes(x))) {
      expect(w.rights.canBundle, w.title).toBe(false);
      expect(w.rights.verified, w.title).toBe(false);
      expect(w.ingestion, w.title).toBe('catalogued');
    }
  });

  it('keeps the ALB Bible as a rights-unverified candidate, and publishes nothing from it', async () => {
    const alb = (await catalog.work(ids.work(C, 'bibla-alb')))!;
    expect(alb.rights).toEqual(ALB_BIBLE_RIGHTS);
    expect(alb.rights).toMatchObject({ state: 'rights-unverified', canBundle: false, verified: false, statusByJurisdiction: { US: 'unknown' } });
    expect(alb).toMatchObject({ readiness: 'candidate', ingestion: 'catalogued', bibliographyVerified: false });
    expect(ALBANIAN_SCRIPTURE_POLICY.candidate).toMatchObject({ workSlug: 'bibla-alb', canBundleText: false, status: 'candidate-unverified' });
    // no text belongs to the work, and the only Albanian Scripture in the corpus is the unidentified fixture: unpublished
    expect(await catalog.textsOf(alb.id)).toEqual([]);
    const scripture = (await app.store.texts.all()).filter((t) => t.lang === 'sq' && t.kind === 'scripture');
    expect(scripture.map((t) => t.id)).toEqual([T('bible-1john-1')]);
    expect(scripture[0].published).toBe(false);
    expect(scripture[0].unpublishedReasons.length).toBeGreaterThan(0);
    expect(scripture[0].workId).toBeUndefined();
  });

  it('puts a course text on its stage and opens it with that stage\'s help', async () => {
    expect((await catalog.stageOfText(T('udha-0-02')))?.key).toBe('0');
    expect((await catalog.stageOfText(T('misioni-1-02')))?.key).toBe('1');
    expect(await catalog.assistanceFor({ courseId: C, textId: T('udha-0-02') })).toEqual(ALBANIAN_ASSISTANCE['0']);
    expect(await catalog.assistanceFor({ courseId: C, textId: T('misioni-1-02') })).toEqual(ALBANIAN_ASSISTANCE['1']);
  });

  it('makes Standard Albanian the target and a Gheg form a recognised, not a target, variety', () => {
    const course = COURSES.find((c) => c.id === C)!;
    expect(course.variety).toEqual(ALBANIAN_VARIETY_POLICY);
    const varieties = app.adapters.get('sq').varieties!;
    expect(varietyStanding(['sq'], course.variety, varieties)).toBe('target');
    expect(varietyStanding(['aln'], course.variety, varieties)).not.toBe('target');
  });
});

// ───────────────────────────── 2. import of the bundled texts ─────────────────────────────

describe('the bundled Albanian texts import', () => {
  it('imports the 20 course documents (and the rest of the Albanian corpus) without an error', () => {
    expect(importReport.ok, JSON.stringify(importReport.documents.filter((d) => d.issues.some((i) => i.severity === 'error')).map((d) => [d.id, d.issues]))).toBe(true);
    expect(importReport.documents.every((d) => d.action === 'created')).toBe(true);
    expect(ownDocs()).toHaveLength(20);
    expect(ownDocs().filter((d) => d.id.startsWith('udha-0-'))).toHaveLength(8);
    expect(ownDocs().filter((d) => d.id.startsWith('udha-1-'))).toHaveLength(8);
    expect(ownDocs().filter((d) => d.id.startsWith('misioni-1-'))).toHaveLength(4);
  });

  it('puts each document in its work with a chapter, and the chapters of a work are in order', async () => {
    for (const d of ownDocs()) {
      const slug = (d as { work?: { slug?: string; chapter?: { index: number } } }).work!.slug!;
      const chapter = (d as { work?: { chapter?: { index: number } } }).work!.chapter!.index;
      const t = await text(d.id);
      expect(t.workId, d.id).toBe(ids.work(C, slug));
      expect(t.chapter?.index, d.id).toBe(chapter);
      expect(COURSE_WORKS).toContain(slug);
    }
    for (const [slug, n] of [['udha-0', 8], ['udha-1', 8], ['misioni-1', 4]] as const) {
      const chapters = (await catalog.textsOf(ids.work(C, slug))).map((t) => t.chapter!.index);
      expect(chapters, slug).toHaveLength(n);
      expect(chapters, slug).toEqual([...chapters].sort((a, b) => a - b));
      expect(new Set(chapters).size, slug).toBe(n);
    }
  });

  it('keeps them machine-drafted, unreviewed and unpublished until a native speaker has read them', async () => {
    for (const d of ownDocs()) {
      const t = await text(d.id);
      expect(t.reviewStatus, d.id).toBe('unreviewed');
      expect(t.published, d.id).toBe(false);
      expect(t.generated, d.id).toBe(true);
      expect(t.editorialTags, d.id).toEqual(expect.arrayContaining(['machine-drafted', 'needs-native-review']));
      expect(t.unpublishedReasons.join(' '), d.id).toMatch(/native-speaker review/);
    }
  });

  it('gives every word of them a reading from the word list; none is left to a guess by its ending', () => {
    expect(rows.length).toBeGreaterThan(800);
    const unread = rows.filter((r) => !r.analysis || !r.analysis.lemmaId || r.analysis.notes?.lemmaStatus !== 'in the word list');
    expect(unread.map((r) => `${r.text.id}: ${r.sentence.text} -> ${r.token.surface}`)).toEqual([]);
  });
});

// ───────────────────────────── 3. ambiguity preserved ─────────────────────────────

describe('the little words keep every reading', () => {
  const little = () => rows.filter((r) => LITTLE.has(r.token.normalized));

  it('keeps e, i and të with more than one candidate, none of them certain', () => {
    for (const w of ['e', 'i', 'të']) {
      const found = rows.filter((r) => r.token.normalized === w);
      expect(found.length, w).toBeGreaterThan(5);
      for (const r of found) {
        expect(r.analysis.alternatives?.length ?? 0, `${w} in "${r.sentence.text}"`).toBeGreaterThanOrEqual(1);
        expect(r.analysis.confidence, `${w} in "${r.sentence.text}"`).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it('says in plain words what in the sentence decided the first reading', () => {
    // a little word that is a piece of a unit, or that the neighbours decided, carries the reason
    const inUnit = rows.filter((r) => LITTLE.has(r.token.normalized) && r.analysis.unit);
    expect(inUnit.length).toBeGreaterThan(5);
    for (const r of inUnit) expect(String(r.analysis.notes?.context), `"${r.sentence.text}" ${r.token.surface}`).toMatch(/linking article/);
    const decided = little().filter((r) => r.analysis.notes?.context !== undefined);
    expect(decided.length).toBeGreaterThan(inUnit.length - 1);
    // the same written të is read as the particle in one sentence and as a pronoun in another
    const readings = new Set(rows.filter((r) => r.token.normalized === 'të').map((r) => r.analysis.lemmaId));
    expect(readings.size).toBeGreaterThanOrEqual(2);
  });

  it('never stores a little word as a lone candidate with confidence 1', () => {
    for (const r of little()) {
      const lone = (r.analysis.alternatives?.length ?? 0) === 0;
      expect(lone && r.analysis.confidence === 1, `${r.token.surface} in "${r.sentence.text}"`).toBe(false);
      expect(r.analysis.confidence, `${r.token.surface} in "${r.sentence.text}"`).toBeLessThan(1);
    }
  });
});

// ───────────────────────────── 4. units and parts ─────────────────────────────

describe('a linking article and its adjective are one unit; a fused pronoun has parts', () => {
  it('"Buka e gjyshes është shumë e mirë.": e mirë carries the lemma "i mirë" on both tokens, joined as a unit', async () => {
    const { tokens } = await sentenceWith('udha-1-03', corpusSentence('udha-1-03', 'Buka e gjyshes është shumë e mirë.'));
    const articles = tokens.filter((t) => t.surface === 'e');
    const article = articles[articles.length - 1]; // the second e: before mirë
    const adjective = tokens.find((t) => t.surface === 'mirë')!;
    const a = (await analysisOf(article.id))!;
    const b = (await analysisOf(adjective.id))!;
    const mirë = ids.lemma('sq', 'i mirë', 'ADJ');
    expect(a.lemmaId).toBe(mirë);
    expect(b.lemmaId).toBe(mirë);
    expect(await lemmaText(a)).toBe('i mirë');
    for (const x of [a, b]) {
      expect(x.unit?.display).toBe('i mirë');
      expect(x.unit?.headTokenId).toBe(adjective.id);
      expect(x.unit?.pieceTokenIds).toEqual([article.id, adjective.id]);
    }
    expect(a.unit?.role).toBe('linking article');
    // the genitive article before gjyshes is not part of that unit
    const genitive = (await analysisOf(articles[0].id))!;
    expect(genitive.unit).toBeUndefined();
    expect(genitive.lemmaId).not.toBe(mirë);
  });

  it('every unit of the course texts has its pieces in order, its head among them, and one lemma for all', () => {
    const withUnit = rows.filter((r) => r.analysis.unit);
    expect(withUnit.length).toBeGreaterThanOrEqual(40);
    for (const r of withUnit) {
      const u = r.analysis.unit!;
      expect(u.pieceTokenIds.length, r.sentence.text).toBeGreaterThanOrEqual(2);
      expect(u.pieceTokenIds, r.sentence.text).toContain(r.token.id);
      expect(u.pieceTokenIds, r.sentence.text).toContain(u.headTokenId);
      const order = u.pieceTokenIds.map((id) => r.tokens.findIndex((t) => t.id === id));
      expect(order, r.sentence.text).toEqual([...order].sort((x, y) => x - y));
      for (const id of u.pieceTokenIds) {
        const piece = rows.find((x) => x.token.id === id)!;
        expect(piece.analysis.lemmaId, `${r.sentence.text}: ${r.token.surface}`).toBe(r.analysis.lemmaId);
        expect(piece.analysis.unit?.display).toBe(u.display);
      }
    }
  });

  it('credits ONE item for the unit when the sentence is read, not one for each word', async () => {
    const user = 'sq-unit-reader';
    await seedUser(app.store, user, C);
    const { t, s } = await sentenceWith('udha-0-02', corpusSentence('udha-0-02', 'Shtëpia është e madhe.'));
    const madh = ids.lemma('sq', 'i madh', 'ADJ');
    expect(await app.golearn.getItemState(user, madh)).toBeUndefined();
    await reader(app, user, 'sq', 's-unit').view(t, [s]);
    await app.golearn.settled();
    expect((await app.golearn.getItemState(user, madh))?.encounterCount).toBe(1);
    // neither the article nor the bare adjective became an item of its own
    for (const [lemma, pos] of [['e', 'DET'], ['i', 'DET'], ['madh', 'ADJ'], ['madhe', 'ADJ']] as const) {
      expect(await app.golearn.getItemState(user, ids.lemma('sq', lemma, pos)), `${lemma}/${pos}`).toBeUndefined();
    }
    // reading the same sentence again in the same sitting adds nothing
    await reader(app, user, 'sq', 's-unit').view(t, [s]);
    await app.golearn.settled();
    expect((await app.golearn.getItemState(user, madh))?.encounterCount).toBe(1);
  });

  it('"Ajo ia jep librin Anës.": the fused ia is taken apart into the pieces it is written from', async () => {
    const { tokens } = await sentenceWith('udha-1-02', corpusSentence('udha-1-02', 'Ajo ia jep librin Anës.'));
    const ia = tokens.find((t) => t.surface === 'ia')!;
    const a = (await analysisOf(ia.id))!;
    expect(a.parts?.length).toBe(2);
    expect(a.parts!.map((p) => p.text).join('')).toBe('ia');
    expect(a.parts![0].start).toBe(0);
    expect(a.parts![1].end).toBe('ia'.length);
    expect(a.parts!.every((p) => p.lemma && p.kind === 'clitic')).toBe(true);
    // every fused short pronoun in the course texts has parts that tile it
    const fused = rows.filter((r) => ['ia', 'ta', 'ma', 'ua'].includes(r.token.normalized));
    expect(fused.length).toBeGreaterThanOrEqual(3);
    for (const r of fused) {
      expect(r.analysis.parts?.length, `${r.token.surface} in "${r.sentence.text}"`).toBeGreaterThanOrEqual(2);
      expect(r.analysis.parts!.map((p) => p.text).join('')).toBe(r.token.normalized);
    }
  });
});

// ───────────────────────────── 5. disputed readings ─────────────────────────────

describe('a reading the sources dispute stays cautious', () => {
  it('"dha" is stored at 0.55 at most and marked disputed, in every place it occurs', () => {
    const dha = rows.filter((r) => r.token.normalized === 'dha');
    expect(dha.length).toBeGreaterThanOrEqual(4);
    expect(dha.some((r) => r.text.id === T('misioni-1-04'))).toBe(true);
    for (const r of dha) {
      expect(r.analysis.confidence, r.sentence.text).toBeLessThanOrEqual(0.55);
      expect(r.analysis.notes?.disputed, r.sentence.text).toBeTruthy();
    }
  });

  it('a form where one source says otherwise and two agree is kept at 0.75 at most, as "majority"', async () => {
    // no majority reading occurs in the course texts; the adapter is asked on each form of SQ_MAJORITY
    expect(rows.some((r) => r.analysis.notes?.sources === 'majority')).toBe(false);
    expect(SQ_MAJORITY.size).toBeGreaterThan(30);
    for (const key of SQ_MAJORITY) {
      const [form, lemma] = key.split('\t');
      const candidates = sqAdapter.analyze(sqAdapter.tokenize(form))[0].candidates;
      const majority = candidates.filter((c) => c.notes?.sources === 'majority');
      expect(majority.length, key).toBeGreaterThan(0);
      for (const c of majority) {
        expect(c.confidence, key).toBeLessThanOrEqual(0.75);
        expect(c.notes?.disputed, key).toBeUndefined();
        expect(c.unconfirmed, key).toBeUndefined();
      }
      expect(majority.some((c) => c.lemma?.normalize('NFC').toLocaleLowerCase('sq') === lemma), key).toBe(true);
    }
    // and a majority reading is stored as it is analysed: through a learner's own text
    const { documents } = plainTextToDocuments(oneWordLine('tha'), { lang: 'sq', title: 'majority probe', idPrefix: 'majority-probe', chapters: 'none' });
    const r = await importDocuments(app.store, app.adapters, documents, { clock: app.clock.now });
    expect(r.ok, JSON.stringify(r.documents.map((d) => d.issues))).toBe(true);
    const stored = await storedFirstAnalysis(ids.text('sq', documents[0].id), 'tha');
    expect(stored.notes?.sources).toBe('majority');
    expect(stored.confidence).toBeLessThanOrEqual(0.75);
  });
});

/** A one-word line: the form alone, so that it is the form of SQ_MAJORITY that is analysed. */
const oneWordLine = (form: string) => `${form}.`;
async function storedFirstAnalysis(textId: string, normalized: string): Promise<TokenAnalysis> {
  for (const s of await liveSentences(app.store, textId)) {
    const tok = (await tokensOf(app.store, s.id)).find((t) => t.normalized === normalized);
    if (tok) return (await analysisOf(tok.id))!;
  }
  throw new Error(`no token "${normalized}" in ${textId}`);
}

// ───────────────────────────── 6. learner model ─────────────────────────────

describe('one learner model, keyed by lemma', () => {
  const user = 'sq-lemma-reader';

  it('"Ajo ia jep librin Anës." credits libër, not librin; another form of the noun credits the same item', async () => {
    await seedUser(app.store, user, C);
    const libër = ids.lemma('sq', 'libër', 'NOUN');
    expect(await app.golearn.getItemState(user, libër)).toBeUndefined();

    const first = await sentenceWith('udha-1-02', corpusSentence('udha-1-02', 'Ajo ia jep librin Anës.'));
    const r = reader(app, user, 'sq', 'sit-1');
    await r.view(first.t, [first.s]);
    await app.golearn.settled();
    expect((await app.golearn.getItemState(user, libër))?.encounterCount).toBe(1);
    expect(await app.golearn.getItemState(user, ids.lemma('sq', 'librin', 'NOUN'))).toBeUndefined();
    // the written form is its own, finer item beside the lemma
    expect(await app.golearn.getItemState(user, ids.form('sq', 'librin'))).toBeDefined();

    // another form (libër, indefinite) in another text, another day
    const second = await sentenceWith('udha-1-06', corpusSentence('udha-1-06', 'Beni më dha një libër të ri.'));
    await reader(app, user, 'sq', 'sit-2').view(second.t, [second.s]);
    await app.golearn.settled();
    expect((await app.golearn.getItemState(user, libër))?.encounterCount).toBe(2);
    expect((await app.golearn.getItemState(user, ids.form('sq', 'librin')))?.encounterCount).toBe(1);
    expect((await app.golearn.getItemState(user, ids.form('sq', 'libër')))?.encounterCount).toBe(1);
    // no item was made for any inflected form as if it were a lemma: every lemma item names a word of the word list
    const items = (await app.store.learnerItems.where('userId', user)).filter((i) => i.itemId.startsWith('lemma:sq:'));
    for (const i of items) expect((await app.store.lemmas.get(i.itemId)), i.itemId).toBeDefined();
  });

  it('a help request on a word is remembered on that word', async () => {
    const { t, s, tokens } = await sentenceWith('udha-1-02', corpusSentence('udha-1-02', 'Ajo ia jep librin Anës.'));
    const token = tokens.find((x) => x.surface === 'librin')!;
    await reader(app, user, 'sq', 'sit-3').tap(t, s, token, 1);
    await app.golearn.settled();
    const row = (await app.store.learnerItems.where('userId', user)).find((i) => i.itemId === token.formId);
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).toMatch(/help|lookup|assist/i);
  });
});

// ───────────────────────────── 7. rights gate in code ─────────────────────────────

describe('the rights gate', () => {
  const base = () => bundledDoc('sq', 'udha-1-03');
  const asClaim = (id: string, slug: string, over: Partial<CorpusDocument['source']> = {}): CorpusDocument => {
    const d = base();
    return { ...d, id, generated: false, work: { slug, chapter: { index: 1, title: 'x' } }, source: { ...d.source, rights: 'public-domain', authorship: 'published', ...over } } as unknown as CorpusDocument;
  };

  it('accepts every bundled document of the three course-authored works on its own evidence', () => {
    for (const d of ownDocs()) expect(bundleDecision(d, { work: workRecord }), d.id).toMatchObject({ verdict: 'bundle' });
    // the seed texts belong to no work and are owner-authored
    for (const id of ['story-01', 'dialogue-01']) expect(bundleDecision(bundledDoc('sq', id), { work: workRecord }).verdict, id).toBe('bundle');
  });

  it('refuses a document that claims to be public domain in the rights-unverified ALB Bible work', () => {
    const verdict = bundleDecision(asClaim('x-alb', 'bibla-alb'), { work: workRecord });
    expect(verdict.verdict).toBe('refuse');
    expect(verdict.reason).toMatch(/rights-unverified/);
  });

  it('refuses it even when its wording is verified and its translation identified: wording is not rights', () => {
    const d = asClaim('x-alb-verified', 'bibla-alb') as unknown as Record<string, unknown>;
    d.contentType = 'scripture';
    d.scripture = {
      translationId: 'alb-test', translationName: 'a test translation', edition: 'a test edition', book: 'JHN', chapter: 3,
      verification: { against: 'a test source', checkedAt: '2026-10-01', method: 'byte-comparison', by: 'integration test' },
    };
    const verdict = bundleDecision(d, { work: workRecord });
    expect(verdict.verdict).toBe('refuse');
    expect(verdict.reason).toMatch(/rights-unverified/);
  });

  it('refuses the unidentified Scripture fixture\'s claim, and leaves the fixture itself out of a build', () => {
    expect(bundleDecision(bundledDoc('sq', 'bible-1john-1'), { work: workRecord }).verdict).toBe('exclude');
    const claimed = asClaim('x-fixture', 'bibla-alb') as unknown as Record<string, unknown>;
    claimed.contentType = 'scripture';
    claimed.scripture = { translationId: 'unidentified', edition: 'unverified sample', book: '1JN', chapter: 1 };
    expect(bundleDecision(claimed, { work: workRecord }).verdict).toBe('refuse');
  });

  it('refuses a document of a modern book (prohibited from bundling), whatever the document says', () => {
    for (const w of ALBANIAN_WORKS.filter((x) => x.rights.state === 'prohibited-from-bundling')) {
      const slug = w.id.split(':')[2];
      const verdict = bundleDecision(asClaim(`x-${slug}`, slug), { work: workRecord });
      expect(verdict.verdict, slug).toBe('refuse');
      expect(verdict.reason, slug).toMatch(/prohibited-from-bundling/);
    }
  });

  it('refuses every other work of the manifest that is not course-authored', () => {
    for (const w of ALBANIAN_WORKS.filter((x) => x.rights.state !== 'course-authored')) {
      const slug = w.id.split(':')[2];
      expect(bundleDecision(asClaim(`x-${slug}`, slug), { work: workRecord }).verdict, slug).toBe('refuse');
    }
  });

  it('refuses a research-only document and a document of a research-only work', () => {
    // a document whose own rights value is not one the gate knows
    expect(bundleDecision(asClaim('x-research', 'udha-1', { rights: 'research-only' as never }), { work: workRecord }).verdict).toBe('refuse');
    // and a work recorded as research-only (a treebank, a reference edition): never bundled
    const research = (_lang: string, _slug: string) => ({ state: 'research-only' });
    const verdict = bundleDecision(asClaim('x-research-work', 'udha-1'), { work: research });
    expect(verdict.verdict).toBe('refuse');
    expect(verdict.reason).toMatch(/research-only/);
  });

  it('does not take "written for the course" on its word: such a document inside somebody else\'s work is refused', () => {
    // the label a course text carries, put on a document of the rights-unverified Bible work and of every other
    // work that is not the course's own
    for (const rights of ['owner-authored', 'generated'] as const) {
      for (const w of ALBANIAN_WORKS.filter((x) => x.rights.state !== 'course-authored')) {
        const slug = w.id.split(':')[2];
        const verdict = bundleDecision(asClaim(`x-own-${slug}`, slug, { rights: rights as never }), { work: workRecord });
        expect(verdict.verdict, `${rights} in ${slug}`).toBe('refuse');
        expect(verdict.reason, `${rights} in ${slug}`).toContain(String(w.rights.state));
      }
      // inside the course's own works, and with no work at all, the label stands
      expect(bundleDecision(asClaim('x-own-udha', 'udha-1', { rights: rights as never }), { work: workRecord }).verdict).toBe('bundle');
    }
    const research = (_lang: string, _slug: string) => ({ state: 'research-only' });
    expect(bundleDecision(asClaim('x-own-research', 'udha-1', { rights: 'owner-authored' as never }), { work: research }).verdict).toBe('refuse');
  });

  it('refuses a work that is not in the catalogue, and an unverified document is left out', () => {
    expect(bundleDecision(asClaim('x-unlisted', 'no-such-work'), { work: (_l, s) => workRecord(_l, s) }).verdict).toBe('refuse');
    const unverified = { ...base(), id: 'x-unverified', generated: false, source: { ...base().source, rights: 'unverified' } } as unknown as CorpusDocument;
    expect(bundleDecision(unverified, { work: workRecord }).verdict).toBe('exclude');
  });
});

// ───────────────────────────── 8. the learner's own book ─────────────────────────────

describe('the learner\'s own Albanian book ("Your copy")', () => {
  const originals = [
    corpusSentence('udha-0-02', 'Shtëpia është e madhe.'),
    corpusSentence('udha-1-02', 'Ajo ia jep librin Anës.'),
    corpusSentence('udha-1-03', 'Buka e gjyshes është shumë e mirë.'),
  ];
  // the first two typed without ë / ç, the last one as it stands
  const lines = [withoutDiacritics(originals[0]), withoutDiacritics(originals[1]), originals[2]];
  let own: { text: Text; sentences: Sentence[]; tokens: Token[]; document: CorpusDocument };

  beforeAll(async () => {
    const { documents } = plainTextToDocuments(lines.join('\n'), { lang: 'sq', title: 'Libri im (synthetic)', idPrefix: 'libri-im', chapters: 'none' });
    expect(documents).toHaveLength(1);
    const r = await importDocuments(app.store, app.adapters, documents, { clock: app.clock.now });
    expect(r.ok, JSON.stringify(r.documents.map((d) => d.issues))).toBe(true);
    const t = (await app.store.texts.get(T(documents[0].id)))!;
    const sentences = await liveSentences(app.store, t.id);
    const tokens = (await Promise.all(sentences.map((s) => tokensOf(app.store, s.id)))).flat();
    own = { text: t, sentences, tokens, document: documents[0] };
  });

  it('is stored as a personal copy: on this device, no work, never bundled', async () => {
    expect(own.document.source.rights).toBe('personal-copy');
    expect(own.text).toMatchObject({ personalCopy: true, published: true }); // "published" = readable on this device
    expect(own.text.workId).toBeUndefined();
    expect(bundled('sq').some((d) => d.id === own.document.id)).toBe(false);
    expect(bundleDecision(own.document, { work: workRecord }).verdict).toBe('refuse');
    // the catalogue holds no text for it
    for (const slug of COURSE_WORKS) expect((await catalog.textsOf(ids.work(C, slug))).some((t) => t.id === own.text.id)).toBe(false);
  });

  it('keeps the text exactly as typed: the ASCII spelling is not corrected in the stored text', async () => {
    const paragraphs = (await app.store.paragraphs.where('textId', own.text.id)).sort((a, b) => a.index - b.index).map((p) => p.originalText);
    expect(paragraphs.join('\n')).toBe(lines.join('\n'));
    expect(own.sentences.map((s) => s.text)).toEqual(lines);
    expect(own.tokens.some((t) => t.surface === 'Shtepia')).toBe(true);
    expect(own.tokens.some((t) => t.surface === 'shtëpia')).toBe(false);
    expect(own.tokens.find((t) => t.surface === 'Shtepia')!.formId).toBe(ids.form('sq', 'shtepia'));
  });

  it('reads each word typed without ë / ç as the properly spelled word, and says so', async () => {
    // pair the words of the typed lines with the words of the original lines
    const typedLines = own.sentences.slice(0, 2);
    const compared: string[] = [];
    for (let i = 0; i < 2; i++) {
      const was = sqAdapter.tokenize(originals[i]).filter((t) => t.isWord);
      const now = (await tokensOf(app.store, typedLines[i].id)).filter((t) => t.isWord);
      expect(now.length).toBe(was.length);
      for (let k = 0; k < now.length; k++) {
        if (now[k].surface === was[k].surface) continue; // a word without ë / ç: nothing to say
        const a = (await analysisOf(now[k].id))!;
        expect(a.orthography, `${now[k].surface} (${was[k].surface})`).toMatchObject({ period: 'sq-ascii' });
        expect(a.orthography!.modern.normalize('NFC').toLocaleLowerCase('sq'), now[k].surface).toBe(was[k].normalized);
        expect(a.confidence, now[k].surface).toBeLessThanOrEqual(0.7);
        compared.push(now[k].surface);
      }
    }
    expect(compared).toEqual(['Shtepia', 'eshte', 'Anes']); // the only words of the two lines that had an ë or ç
    // the line typed with its ë says nothing of the kind
    for (const t of own.tokens.filter((x) => x.sentenceId === own.sentences[2].id && x.isWord)) expect((await analysisOf(t.id))?.orthography, t.surface).toBeUndefined();
  });

  it('does not make a lemma of its own for a word typed without ë: the learner model credits the real lemma', async () => {
    const shtepi = own.tokens.find((t) => t.surface === 'Shtepia')!;
    const a = (await analysisOf(shtepi.id))!;
    expect(a.lemmaId).toBe(ids.lemma('sq', 'shtëpi', 'NOUN'));
    expect(await app.store.lemmas.get(ids.lemma('sq', 'shtepi', 'NOUN'))).toBeUndefined();
    const eshte = (await analysisOf(own.tokens.find((t) => t.surface === 'eshte')!.id))!;
    expect(eshte.lemmaId).toBe(ids.lemma('sq', 'jam', 'VERB'));
    // no lemma row of the language is spelled in ASCII for a word that has an ë
    const lemmas = (await app.store.lemmas.all()).filter((l) => l.lang === 'sq').map((l) => l.lemma);
    for (const asciiOnly of ['shtepi', 'eshte', 'ane', 'liber']) expect(lemmas, asciiOnly).not.toContain(asciiOnly);

    const user = 'sq-own-reader';
    await seedUser(app.store, user, C);
    const lemma = ids.lemma('sq', 'shtëpi', 'NOUN');
    await reader(app, user, 'sq', 'own-1').view(own.text, [own.sentences[0]]);
    await app.golearn.settled();
    expect((await app.golearn.getItemState(user, lemma))?.encounterCount).toBe(1);
    // the same noun, properly spelled, in a course text, is the same item
    const course = await sentenceWith('udha-0-02', originals[0]);
    await reader(app, user, 'sq', 'own-2').view(course.t, [course.s]);
    await app.golearn.settled();
    expect((await app.golearn.getItemState(user, lemma))?.encounterCount).toBe(2);
  });
});

// ───────────────────────────── 9. constructions and writing checks ─────────────────────────────

describe('constructions and writing checks reach the services', () => {
  const keys = new Set(SQ_CONSTRUCTIONS.map((c) => c.key));

  it('detects constructions in a corpus sentence, all of them from the catalogue', () => {
    const wording = corpusSentence('udha-0-02', 'Shtëpia është e madhe.');
    const tokens = sqAdapter.tokenize(wording);
    const found = sqAdapter.detectPatterns(tokens, sqAdapter.analyze(tokens)).map((p) => p.key);
    expect(found).toContain('linking-article-adjective');
    expect(found).toContain('definite-noun-ending');
    for (const k of found) expect(keys.has(k), k).toBe(true);
  });

  it('records constructions where they occur in the stored texts, each one a pattern of the catalogue', async () => {
    const occurrences = (await app.store.patternOccurrences.all()).filter((o) => o.lang === 'sq');
    expect(occurrences.length).toBeGreaterThan(100);
    for (const o of occurrences) expect(keys.has(o.patternId.replace('pattern:sq:', '')), o.patternId).toBe(true);
    const patterns = (await app.store.patterns.all()).filter((p) => p.lang === 'sq');
    for (const p of patterns) { expect(keys.has(p.key), p.key).toBe(true); expect(p.explanation.length).toBeGreaterThan(20); }
    const { s } = await sentenceWith('udha-0-02', corpusSentence('udha-0-02', 'Shtëpia është e madhe.'));
    expect((await app.store.patternOccurrences.where('sentenceId', s.id)).map((o) => o.patternId)).toContain(ids.pattern('sq', 'linking-article-adjective'));
  });

  describe('GoTell checks the learner\'s own sentence', () => {
    const apply = (s: string, sug: { start: number; end: number; replacement: string }) => s.slice(0, sug.start) + sug.replacement + s.slice(sug.end);
    const check = async (wording: string) => {
      const gotell = app.gotellAll.forUser(U);
      const testimony = await gotell.getOrCreateTestimony(U, 'sq');
      // the service's errors carry the checker's suggestion and confidence (AnalyzedError); the public type shows less
      return (await gotell.submitDraft(testimony.id, wording)).sentences[0].errors as AnalyzedError[];
    };

    it('names the error and offers the repair: a verb that does not go with its subject', async () => {
      const wrong = 'Unë shkon në shkollë.';
      const errors = await check(wrong);
      expect(errors.map((e) => e.category)).toEqual(['conjugation']);
      expect(apply(wrong, errors[0].suggestion!)).toBe('Unë shkoj në shkollë.');
      expect(errors[0].confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('names the case a preposition governs, and the negation after the subjunctive particle', async () => {
      const wrongCase = 'Jam në shtëpia.';
      const e1 = await check(wrongCase);
      expect(e1.map((e) => e.category)).toEqual(['case']);
      expect(apply(wrongCase, e1[0].suggestion!)).toBe('Jam në shtëpinë.');
      const wrongNeg = 'Dua të nuk shkoj.';
      const e2 = await check(wrongNeg);
      expect(e2.map((e) => e.category)).toEqual(['particle']);
      expect(apply(wrongNeg, e2[0].suggestion!)).toBe('Dua të mos shkoj.');
    });

    it('reads a word typed without ë as a spelling matter, not as an unknown word', async () => {
      const wrong = 'Kam mekat në zemrën time.';
      const errors = await check(wrong);
      expect(errors.map((e) => e.category)).toEqual(['spelling']);
      expect(apply(wrong, errors[0].suggestion!)).toBe('Kam mëkat në zemrën time.');
    });

    it('leaves correct Albanian alone', async () => {
      for (const ok of ['Unë shkoj.', 'Jam në shtëpinë.', 'Dua të mos shkoj.', 'Kam mëkat në zemrën time.']) expect(await check(ok), ok).toEqual([]);
    });

    it('checks each sentence of a longer draft on its own', async () => {
      const gotell = app.gotellAll.forUser(U);
      const testimony = await gotell.getOrCreateTestimony(U, 'sq');
      const analysis = await gotell.submitDraft(testimony.id, 'Unë shkon në shkollë. Jam në shtëpinë.');
      expect(analysis.sentences).toHaveLength(2);
      expect(analysis.sentences[0].errors.map((e) => e.category)).toEqual(['conjugation']);
      expect(analysis.sentences[1].errors).toEqual([]);
    });
  });
});

// ───────────────────────────── 10. other languages untouched ─────────────────────────────

describe('the other languages are untouched by the Albanian course', () => {
  it('Spanish and German seed texts imported beside the Albanian ones keep their own analyzers', async () => {
    const seeds = [...bundled('es'), ...bundled('de')].filter((d) => d.id === 'story-01');
    expect(seeds).toHaveLength(2);
    const report = await importDocuments(app.store, app.adapters, seeds, { clock: app.clock.now });
    expect(report.ok).toBe(true);
    for (const lang of ['es', 'de'] as const) {
      const analyzers = new Set<string>();
      for (const s of await liveSentences(app.store, ids.text(lang, 'story-01'))) {
        for (const tok of await tokensOf(app.store, s.id)) for (const a of await app.store.analyses.where('tokenId', tok.id)) analyzers.add(a.analyzer);
      }
      expect([...analyzers], lang).toEqual([`adapter-${lang}@${app.adapters.get(lang).version}`]);
    }
    // and the Albanian rows still say adapter-sq
    const sqAnalyzers = new Set(rows.map((r) => r.analysis.analyzer));
    expect([...sqAnalyzers]).toEqual([`adapter-sq@${sqAdapter.version}`]);
  });

  it('keeps lemmas and forms apart by language, and each adapter still relates its own inflections', async () => {
    for (const l of await app.store.lemmas.all()) expect(l.id.startsWith(`lemma:${l.lang}:`), l.id).toBe(true);
    for (const a of rows) expect(a.analysis.lemmaId?.startsWith('lemma:sq:'), a.token.surface).toBe(true);
    expect(app.adapters.get('es').relate('pecado', 'pecados')).toBe('inflection');
    expect(app.adapters.get('de').relate('sünde', 'sünden')).toBe('inflection');
    expect(app.adapters.get('sq').relate('mëkat', 'mëkatin')).toBe('inflection');
    expect(app.adapters.get('sq').relate('pecado', 'pecados')).toBe('none');
  });
});
