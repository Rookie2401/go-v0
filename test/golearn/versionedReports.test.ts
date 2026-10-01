/**
 * PLAN7 E — a whole-text comprehension report is about one content version of a text. After the wording changes it is history
 * (`reportedEarlierVersion`), never a statement about the new wording: not in the progress record, not in the `reread`
 * recommendation, not in the readiness signal. Sentence-level understanding follows sentence identity as before.
 * Runs on the real fold and the real importer (memory store).
 */
import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import type { DomainEvent, EventInput } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';
import { importDocuments } from '../../src/ingest';
import type { CorpusDocument } from '../../src/ingest';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { ES_STORY, buildSpanish } from './fixtures';
import { COURSE, buildChapter, stageRow, t, workRow } from './courseFixtures';

const U = 'u1';
const textId = ids.text('es', 'vers');
const registry = createAdapterRegistry();
const day = (d: string) => () => `${d}T00:00:00.000Z`;

const story = (texts: string[], title = 'Versioned'): CorpusDocument => ({
  schemaVersion: 2, id: 'vers', lang: 'es', title, contentType: 'story',
  corpus: { id: 'ci-es', kind: 'comprehensible-input', title: 'CI' },
  source: { id: 'src:vers', title: 'S', attribution: 'Test', provenance: 'written for tests', rights: 'owner-authored', authorship: 'human' },
  review: { status: 'unreviewed' }, topics: [], editorialTags: [], prepTargets: [], generated: false,
  sections: [{ paragraphs: [{ sentences: texts.map((text) => ({ text })) }] }],
});
const V1 = ['Dios ama al mundo.', 'Yo creo en Dios.', 'Ahora tengo paz.'];
const V2_ALL = ['El cielo es azul.', 'La casa es grande.', 'Mi madre canta bien.'];
const V2_ONE = ['Dios ama al mundo.', 'Yo no creo en Dios.', 'Ahora tengo paz.'];

const importAt = (h: Harness, doc: CorpusDocument, d: string) => importDocuments(h.store, registry, [doc], { clock: day(d) });
const liveIds = async (h: Harness) =>
  (await h.store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index).map((s) => s.id);

const emit = (h: Harness, e: object) => h.bus.emit(e as EventInput<DomainEvent>);
let k = 0;
const base = (session: string) => ({ userId: U, lang: 'es', surface: 'corpus', session, dedupeKey: `vr${k++}` });
const view = (h: Harness, sentenceId: string, session: string) => emit(h, { type: 'SentenceViewed', ...base(session), textId, sentenceId, tokenIds: [] });
const sentenceAll = (h: Harness, sentenceIds: string[], session: string, contentVersion?: number) =>
  emit(h, { type: 'ComprehensionReported', ...base(session), textId, sentenceIds, modality: 'reading', scope: 'sentence', degree: 'all', ...(contentVersion ? { contentVersion } : {}) });
const wholeText = (h: Harness, degree: 'all' | 'most' | 'some' | 'little', session: string, contentVersion?: number, id = textId) =>
  emit(h, { type: 'ComprehensionReported', ...base(session), textId: id, sentenceIds: [], modality: 'reading', scope: 'text', degree, ...(contentVersion !== undefined ? { contentVersion } : {}) });

/** Version 1 read in full and understood, with a whole-text report 'all' made about version 1. */
async function readV1(h: Harness, withVersion: number | null = 1) {
  await importAt(h, story(V1), '2026-01-01');
  const ids1 = await liveIds(h);
  for (const s of ids1) await view(h, s, 's1');
  await sentenceAll(h, ids1, 's1', 1);
  await wholeText(h, 'all', 's1', withVersion ?? undefined);
  return ids1;
}

describe('the progress record: a whole-text report belongs to its content version', () => {
  it('full replacement: understood 0, no current report, the version-1 report is history with its version', async () => {
    const h = createHarness();
    await readV1(h);
    const before = await h.golearn.readingProgress(U, textId);
    expect(before).toMatchObject({ contentVersion: 1, sentencesUnderstood: 3, reportedComprehension: 'all' });
    expect(before.reportedEarlierVersion).toBeUndefined();

    await importAt(h, story(V2_ALL), '2026-01-02');
    const p = await h.golearn.readingProgress(U, textId);
    expect(p.contentVersion).toBe(2);
    expect(p.sentencesUnderstood).toBe(0);
    expect(p.reportedComprehension).toBeUndefined();
    expect(p.reportedEarlierVersion).toMatchObject({ degree: 'all', version: 1 });
    expect(typeof p.reportedEarlierVersion!.at).toBe('string');
    expect(p.earlierVersions).toEqual({ sentencesSeen: 3, sentencesUnderstood: 3 });
    // nothing is deleted from the log
    expect(await h.bus.history({ userId: U, types: ['ComprehensionReported'] })).toHaveLength(2);
  });

  it('partial revision: unchanged sentences stay understood, retired ones move to earlierVersions, the whole-text report moves to history', async () => {
    const h = createHarness();
    await readV1(h);
    await importAt(h, story(V2_ONE), '2026-01-02');
    const p = await h.golearn.readingProgress(U, textId);
    expect(p).toMatchObject({ contentVersion: 2, sentencesTotal: 3, sentencesUnderstood: 2, sentencesSeen: 2 });
    expect(p.earlierVersions).toEqual({ sentencesSeen: 1, sentencesUnderstood: 1 });
    expect(p.reportedComprehension).toBeUndefined();
    expect(p.reportedEarlierVersion).toMatchObject({ degree: 'all', version: 1 });
  });

  it('an unchanged re-import and a metadata-only re-import do not change the version: the report stays current', async () => {
    const h = createHarness();
    await readV1(h);
    await importAt(h, story(V1), '2026-01-02'); // unchanged
    await importAt(h, story(V1, 'A new title'), '2026-01-03'); // metadata only
    const p = await h.golearn.readingProgress(U, textId);
    expect(p).toMatchObject({ contentVersion: 1, sentencesUnderstood: 3, reportedComprehension: 'all' });
    expect(p.reportedEarlierVersion).toBeUndefined();
    expect((await h.store.texts.get(textId))!.title).toBe('A new title');
  });

  it('a legacy report without a version counts only while the text is at version 1', async () => {
    const h = createHarness();
    await readV1(h, null);
    expect((await h.golearn.readingProgress(U, textId)).reportedComprehension).toBe('all');
    await importAt(h, story(V2_ALL), '2026-01-02');
    const p = await h.golearn.readingProgress(U, textId);
    expect(p.reportedComprehension).toBeUndefined();
    expect(p.reportedEarlierVersion).toMatchObject({ degree: 'all' });
    expect(p.reportedEarlierVersion).not.toHaveProperty('version');
  });

  it('a new report at version 2 becomes current while the version-1 report stays as history; the latest of each wins', async () => {
    const h = createHarness();
    await readV1(h);
    await wholeText(h, 'some', 's1b', 1); // a later report about version 1: the history shows this one
    await importAt(h, story(V2_ALL), '2026-01-02');
    await wholeText(h, 'little', 's2', 2);
    await wholeText(h, 'most', 's2b', 2);
    const p = await h.golearn.readingProgress(U, textId);
    expect(p.reportedComprehension).toBe('most');
    expect(p.reportedEarlierVersion).toMatchObject({ degree: 'some', version: 1 });
    // many and single calls agree
    expect((await h.golearn.readingProgressMany(U, [textId])).get(textId)).toEqual(p);
  });

  it('the record is derived from the log: a rebuild changes nothing', async () => {
    const h = createHarness();
    await readV1(h);
    await importAt(h, story(V2_ONE), '2026-01-02');
    await wholeText(h, 'most', 's2', 2);
    const before = await h.golearn.readingProgress(U, textId);
    // Word and lemma items are derived from tokens, which a revision keeps. (Phrase and pattern occurrences of a RETIRED sentence are
    // removed by the importer, so a rebuild cannot recreate those items: a pre-existing limit, not about reports.)
    const words = async () => JSON.stringify((await h.store.learnerItems.where('userId', U)).filter((r) => r.itemKind === 'form' || r.itemKind === 'lemma').sort((x, y) => (x.id < y.id ? -1 : 1)));
    const items = await words();
    await h.golearn.rebuild(U);
    expect(await h.golearn.readingProgress(U, textId)).toEqual(before);
    expect(await words()).toBe(items);
  });
});

describe('consumers of whole-text reports', () => {
  it('reread: a version-1 "little" does not make the revised text a reread; a version-2 one does', async () => {
    const h = createHarness();
    await readV1(h);
    await wholeText(h, 'little', 's1c', 1);
    await importAt(h, story(V2_ALL), '2026-01-02');
    const ids2 = await liveIds(h);
    for (const s of ids2) await view(h, s, 's2');
    await emit(h, { type: 'TextCompleted', ...base('s2'), textId, contentVersion: 2 });
    const rereads = async () => (await h.golearn.recommend(U, { includeUnpublished: true, limit: 10 })).filter((r) => r.reason === 'reread' && r.textId === textId);
    expect(await rereads()).toEqual([]);
    await wholeText(h, 'little', 's2b', 2);
    const now = await rereads();
    expect(now).toHaveLength(1);
    expect(now[0].explanation).toMatch(/understood little/);
  });

  it('readiness: only reports of the current version are counted, and the explanation says when earlier ones were left out', async () => {
    const h = createHarness();
    await h.store.stages.put(stageRow(1, 'g1'));
    await h.store.works.put(workRow('w1', 'g1'));
    const slugs = ['r1', 'r2', 'r3'];
    for (const [i, slug] of slugs.entries()) await buildChapter(h.store, { slug, work: 'w1', chapter: i + 1, sentences: [{ tokens: [t('sol', 'sol', 'NOUN')] }] });
    for (const slug of slugs) {
      await h.view(U, 'es', ids.text('es', slug), 0, 'x');
      await wholeText(h, 'all', 'x', 1, ids.text('es', slug));
    }
    const signal = async () => (await h.golearn.stageReadiness(U, COURSE, ids.stage(COURSE, 'g1'))).signals.find((s) => s.key === 'reported-comprehension')!;
    expect(await signal()).toMatchObject({ status: 'met', value: 1 });

    // the wording of one chapter changes: its report is about earlier wording
    const r2 = (await h.store.texts.get(ids.text('es', 'r2')))!;
    await h.store.texts.put({ ...r2, contentVersion: 2 });
    const after = await signal();
    expect(after.status).toBe('insufficient-data'); // two current reports; three are needed
    expect(after.explanation).toMatch(/earlier version/);
    // a legacy (unversioned) report counts only at version 1
    await wholeText(h, 'all', 'y', undefined, ids.text('es', 'r2'));
    expect((await signal()).status).toBe('insufficient-data');
    await wholeText(h, 'all', 'z', 2, ids.text('es', 'r2'));
    expect(await signal()).toMatchObject({ status: 'met', value: 1 });
  });

  it('no other read of whole-text reports exists in GoLearn (they all go through the version-scoped record)', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = new URL('../../src/golearn/', import.meta.url);
    const users = readdirSync(dir).filter((f) => f.endsWith('.ts')).filter((f) => /scope === 'text'/.test(readFileSync(new URL(f, dir), 'utf8')));
    expect(users).toEqual(['progress.ts']);
  });
});

describe('recommendation wording says what the text is', () => {
  async function two(published: boolean) {
    const h = createHarness();
    await h.seed(U, 'honduras-es');
    await buildFixtureText(h.store, { lang: 'es', slug: 'only', published, title: 'Solo', sentences: [{ tokens: [{ surface: 'uno' }] }] });
    return h;
  }

  it('published: "the easiest published … text", as before', async () => {
    const [r] = await (await two(true)).golearn.recommend(U);
    expect(r).toMatchObject({ reason: 'first-text', textId: 'text:es:only' });
    expect(r.explanation).toContain('is the easiest published Spanish text');
  });

  it('unpublished and reached only because preview is on: says "in preview (not published)", never "published"', async () => {
    const [r] = await (await two(false)).golearn.recommend(U, { includeUnpublished: true });
    expect(r).toMatchObject({ reason: 'first-text', textId: 'text:es:only' });
    expect(r.explanation).toContain('is the easiest Spanish text in preview (not published)');
    expect(r.explanation).not.toMatch(/easiest published/);
  });

  it('published texts keep the published wording in preview mode', async () => {
    const [r] = await (await two(true)).golearn.recommend(U, { includeUnpublished: true });
    expect(r.explanation).toContain('is the easiest published Spanish text');
  });

  it('with preview off, no unpublished text appears in any recommendation, for any reason', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildFixtureText(h.store, { lang: 'es', slug: 'draft1', published: false, sentences: [{ tokens: [{ surface: 'Dios' }, { surface: 'ama' }] }] });
    await buildFixtureText(h.store, { lang: 'es', slug: 'draft-prep', published: false, kind: 'generated-prep', generated: true, sentences: [{ tokens: [{ surface: 'mundo' }] }] });
    await buildFixtureText(h.store, { lang: 'es', slug: 'draft-bible', published: false, kind: 'scripture', version: 'fixture', scripture: { book: 'JHN', chapter: 3 }, sentences: [{ tokens: [{ surface: 'creo' }] }] });
    const unpublished = new Set(['text:es:draft1', 'text:es:draft-prep', 'text:es:draft-bible']);
    const offered = async (opts: Parameters<Harness['golearn']['recommend']>[1]) =>
      (await h.golearn.recommend(U, { limit: 50, ...opts })).filter((r) => r.textId && unpublished.has(r.textId));
    expect(await offered({})).toEqual([]); // a new learner
    await h.understood(U, 'es', ES_STORY, [0, 1, 2, 3], 's1');
    await h.complete(U, 'es', ES_STORY, 's1');
    await h.report(U, 'es', ES_STORY, [], { session: 's1', scope: 'text', degree: 'little' });
    expect(await offered({})).toEqual([]); // after reading and completing
    expect(await offered({ targetTextId: 'text:es:draft-bible' })).toEqual([]);
    expect(await offered({ interests: ['mission'] })).toEqual([]);
    expect((await offered({ includeUnpublished: true })).length).toBeGreaterThan(0); // preview does show them
  });
});

