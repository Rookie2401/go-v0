/**
 * Audit finding 1: a whole-text comprehension report must be bound to the content version it was made about.
 * Real importer + real GoLearn on a memory store. The text is a synthetic four-sentence Spanish document (test data,
 * synthetically reviewed so that the published path is exercised).
 */
import { describe, expect, it } from 'vitest';
import type { ComprehensionReported, Sentence, Text } from '../../src/core';
import { ids } from '../../src/core';
import { importDocuments } from '../../src/ingest';
import type { CorpusDocument } from '../../src/ingest';
import { bundledDoc, liveSentences, makeApp, reader, seedUser, syntheticallyReviewed, type App } from './harness';

const U = 'versioned';
const V1 = ['La casa es grande.', 'El perro come pan.', 'Mi madre lee un libro.', 'Hoy vamos al mercado.'];
const ALL_NEW = ['El gato bebe leche.', 'Mi padre abre la puerta.', 'La niña canta bien.', 'Mañana vamos al río.'];

function doc(sentences: string[], over: Partial<CorpusDocument> = {}): CorpusDocument {
  const base = bundledDoc('es', 'story-01');
  const d: CorpusDocument = {
    ...base, id: 'versioned-report-test', title: 'Versioned report test (synthetic)',
    sections: [{ paragraphs: [{ sentences: sentences.map((text) => ({ text })) }] }],
    ...over,
  };
  delete (d as { english?: unknown }).english;
  return syntheticallyReviewed({ ...d, review: { status: 'unreviewed' } });
}

async function setup(): Promise<{ app: App; text: () => Promise<Text>; sentences: () => Promise<Sentence[]>; put: (d: CorpusDocument) => Promise<string> }> {
  const app = makeApp();
  await seedUser(app.store, U, 'honduras-es');
  const textId = ids.text('es', 'versioned-report-test');
  const put = async (d: CorpusDocument) => {
    const r = await importDocuments(app.store, app.adapters, [d], { clock: app.clock.now });
    expect(r.ok, JSON.stringify(r.documents.map((x) => x.issues))).toBe(true);
    return r.documents[0].action;
  };
  await put(doc(V1));
  return { app, put, text: async () => (await app.store.texts.get(textId))!, sentences: () => liveSentences(app.store, textId) };
}

async function readAndReportAll(app: App, text: Text, sentences: Sentence[], session = 's1') {
  const r = reader(app, U, 'es', session);
  await r.view(text, sentences);
  await r.report(text, sentences, 'all', 'text');
  await app.golearn.settled();
}

describe('a whole-text comprehension report covers the version it was made about', () => {
  it('full replacement: the report about version 1 is history, not understanding of the new wording', async () => {
    const { app, put, text, sentences } = await setup();
    await readAndReportAll(app, await text(), await sentences());
    const before = await app.golearn.readingProgress(U, (await text()).id);
    expect(before).toMatchObject({ contentVersion: 1, sentencesUnderstood: 4, reportedComprehension: 'all' });
    expect(before.reportedEarlierVersion).toBeUndefined();

    expect(await put(doc(ALL_NEW))).toBe('updated');
    const after = await app.golearn.readingProgress(U, (await text()).id);
    expect(after.contentVersion).toBe(2);
    expect(after.sentencesUnderstood).toBe(0);
    expect(after.reportedComprehension).toBeUndefined();
    expect(after.reportedEarlierVersion).toMatchObject({ degree: 'all', version: 1 });
    expect(after.earlierVersions).toMatchObject({ sentencesUnderstood: 4 }); // history kept, shown as history
    // nothing was deleted from the log
    expect((await app.store.events.where('type', 'ComprehensionReported')).length).toBe(1);
  });

  it('partial revision: unchanged sentences stay understood; the whole-text statement does not carry over', async () => {
    const { app, put, text, sentences } = await setup();
    await readAndReportAll(app, await text(), await sentences());
    await put(doc([V1[0], V1[1], 'Mi madre escribe una carta.', V1[3]]));
    const p = await app.golearn.readingProgress(U, (await text()).id);
    expect(p.contentVersion).toBe(2);
    expect(p.sentencesTotal).toBe(4);
    expect(p.sentencesUnderstood).toBe(3);
    expect(p.reportedComprehension).toBeUndefined();
    expect(p.reportedEarlierVersion).toMatchObject({ degree: 'all', version: 1 });
  });

  it('an unchanged re-import and a metadata-only change leave the report current', async () => {
    const { app, put, text, sentences } = await setup();
    await readAndReportAll(app, await text(), await sentences());
    expect(await put(doc(V1))).toBe('unchanged');
    expect(await app.golearn.readingProgress(U, (await text()).id)).toMatchObject({ contentVersion: 1, reportedComprehension: 'all', sentencesUnderstood: 4 });

    await put(doc(V1, { topics: ['family', 'home', 'added-topic'] }));
    const p = await app.golearn.readingProgress(U, (await text()).id);
    expect(p.contentVersion).toBe(1); // the wording did not change, so neither does the version
    expect(p).toMatchObject({ reportedComprehension: 'all', sentencesUnderstood: 4 });
    expect(p.reportedEarlierVersion).toBeUndefined();
  });

  it('a legacy report without a version counts only while the text is still at version 1', async () => {
    const { app, put, text, sentences } = await setup();
    const t = await text();
    const ss = await sentences();
    await reader(app, U, 'es', 's1').view(t, ss);
    await app.bus.emit<ComprehensionReported>({
      type: 'ComprehensionReported', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: `legacy-report:${t.id}`,
      textId: t.id, sentenceIds: ss.map((s) => s.id), modality: 'reading', scope: 'text', degree: 'most',
    });
    await app.golearn.settled();
    expect((await app.golearn.readingProgress(U, t.id)).reportedComprehension).toBe('most');
    await put(doc(ALL_NEW));
    const p = await app.golearn.readingProgress(U, t.id);
    expect(p.reportedComprehension).toBeUndefined();
    expect(p.reportedEarlierVersion?.degree).toBe('most');
    expect(p.reportedEarlierVersion?.version).toBeUndefined(); // the event never said which version: we do not invent one
  });

  it('a new report about the revised text becomes current and the old one stays as history', async () => {
    const { app, put, text, sentences } = await setup();
    await readAndReportAll(app, await text(), await sentences());
    await put(doc(ALL_NEW));
    app.clock.jumpDays(1);
    const r = reader(app, U, 'es', 's2');
    await r.view(await text(), await sentences());
    await r.report(await text(), await sentences(), 'some', 'text');
    await app.golearn.settled();
    const p = await app.golearn.readingProgress(U, (await text()).id);
    expect(p).toMatchObject({ contentVersion: 2, reportedComprehension: 'some' });
    expect(p.reportedEarlierVersion).toMatchObject({ degree: 'all', version: 1 });
    // 'some' is not item-level evidence: the new sentences are seen, not understood
    expect(p.sentencesUnderstood).toBe(0);
    expect(p.sentencesSeen).toBe(4);
  });

  it('recommendations and the batch read agree with the single read, and never cite the earlier report as current', async () => {
    const { app, put, text, sentences } = await setup();
    const t0 = await text();
    await readAndReportAll(app, t0, await sentences());
    await reader(app, U, 'es', 's1').complete(t0);
    await app.golearn.settled();
    await put(doc(ALL_NEW));
    const single = await app.golearn.readingProgress(U, t0.id);
    const many = (await app.golearn.readingProgressMany(U, [t0.id])).get(t0.id);
    expect(many).toEqual(single);
    expect(single.finishedAt).toBeUndefined();
    expect(single.finishedEarlierVersion).toMatchObject({ version: 1 });
    const recs = await app.golearn.recommend(U, { lang: 'es' });
    for (const r of recs) expect(r.explanation, r.reason).not.toMatch(/You said you understood/);
    // word knowledge is not reset by a revision: forms met in version 1 are still met
    const casa = await app.golearn.getItemState(U, ids.form('es', 'casa'));
    expect(casa?.encounterCount ?? 0).toBeGreaterThan(0);
  });
});
