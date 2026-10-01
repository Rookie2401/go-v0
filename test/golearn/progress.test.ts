/**
 * ReadingProgress — ONE canonical record per (learner, language, text, content version), and `readingProgressMany` from ONE log
 * read. Exposure recorded against sentences that are no longer part of the text (a revision, the legacy index ids) is history:
 * kept and reported in `earlierVersions`, never counted. A completion is `finishedAt` only for the CURRENT version.
 */
import { describe, expect, it } from 'vitest';
import type { DomainEvent, EventInput, Sentence } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { ES_JOHN, ES_STORY, buildSpanish, buildSpanishScripture } from './fixtures';

const U = 'u1';

/** A revision that retires the sentences at `retire` (by index) and adds the same number of new live ones; text → version 2. */
async function revise(h: Harness, textId: string, retire: number[], version = 2) {
  const text = (await h.store.texts.get(textId))!;
  await h.store.texts.put({ ...text, contentVersion: version });
  for (const i of retire) {
    const old = (await h.store.sentences.get(`${textId}/s${i}`))!;
    await h.store.sentences.put({ ...old, retiredInVersion: version });
    const fresh: Sentence = { ...old, id: `${textId}/s${i}@${version}`, key: `${old.key}@${version}`, versionAdded: version };
    delete fresh.retiredInVersion;
    await h.store.sentences.put(fresh);
  }
}

const complete = (h: Harness, textId: string, contentVersion?: number, key = `done:${Math.random()}`) =>
  h.bus.emit({
    type: 'TextCompleted', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: key, textId,
    ...(contentVersion !== undefined ? { contentVersion } : {}),
  } as EventInput<DomainEvent>);

describe('earlier versions', () => {
  it('a revision that retires 4 seen sentences: Seen drops by 4 and the 4 are reported as an earlier version, not counted', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.viewAll(U, 'es', ES_STORY, 4, 's1');
    expect(await h.golearn.readingProgress(U, ES_STORY)).toMatchObject({ contentVersion: 1, sentencesTotal: 4, sentencesSeen: 4 });
    await revise(h, ES_STORY, [0, 1, 2, 3]);
    const p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p).toMatchObject({ contentVersion: 2, sentencesTotal: 4, sentencesSeen: 0, sentencesUnderstood: 0, sittings: 0 });
    expect(p.earlierVersions).toEqual({ sentencesSeen: 4, sentencesUnderstood: 0 });
    // the new sentences are counted as they are seen; the history stays
    await h.bus.emit({ type: 'SentenceViewed', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'nv', textId: ES_STORY, sentenceId: `${ES_STORY}/s0@2`, tokenIds: [] } as EventInput<DomainEvent>);
    const q = await h.golearn.readingProgress(U, ES_STORY);
    expect(q).toMatchObject({ sentencesSeen: 1, earlierVersions: { sentencesSeen: 4, sentencesUnderstood: 0 } });
  });

  it('a partial revision: only the retired seen sentences move to earlierVersions; understood is reported the same way', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.understood(U, 'es', ES_STORY, [0, 1], 's1');
    await h.viewAll(U, 'es', ES_STORY, 4, 's1');
    await revise(h, ES_STORY, [0, 3]);
    const p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p).toMatchObject({ sentencesTotal: 4, sentencesSeen: 2, sentencesUnderstood: 1 });
    expect(p.earlierVersions).toEqual({ sentencesSeen: 2, sentencesUnderstood: 1 });
  });

  it('nothing retired ⇒ no earlierVersions key at all', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.viewAll(U, 'es', ES_STORY, 4, 's1');
    expect('earlierVersions' in (await h.golearn.readingProgress(U, ES_STORY))).toBe(false);
  });

  it('legacy index-id sentences retired by the importer: their views are earlierVersions, never "Seen"', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.viewAll(U, 'es', ES_STORY, 4, 's1'); // views recorded against the old `…/sN` index ids
    // the importer's migration: stable-key sentences replace the index ids; the old ones are retired, not deleted
    await revise(h, ES_STORY, [0, 1, 2, 3]);
    await complete(h, ES_STORY); // a legacy completion has no version
    const p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p.sentencesSeen).toBe(0);
    expect(p.earlierVersions?.sentencesSeen).toBe(4);
    expect(p.finishedAt).toBeUndefined(); // version 2 now: an unversioned completion is not "of this version"
    expect(p.finishedEarlierVersion).toMatchObject({ at: expect.any(String) });
    expect('version' in p.finishedEarlierVersion!).toBe(false);
  });
});

describe('completion scope', () => {
  it('finished at v1 then revised ⇒ finishedEarlierVersion, no finishedAt; finishing v2 gives finishedAt', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.viewAll(U, 'es', ES_STORY, 4, 's1');
    await complete(h, ES_STORY, 1);
    const v1 = await h.golearn.readingProgress(U, ES_STORY);
    expect(v1.finishedAt).toBeTruthy();
    expect(v1.finishedEarlierVersion).toBeUndefined();
    await revise(h, ES_STORY, [1]);
    const v2 = await h.golearn.readingProgress(U, ES_STORY);
    expect(v2.finishedAt).toBeUndefined();
    expect(v2.finishedEarlierVersion).toEqual({ version: 1, at: v1.finishedAt });
    await complete(h, ES_STORY, 2);
    const done = await h.golearn.readingProgress(U, ES_STORY);
    expect(done.finishedAt).toBeTruthy();
    expect(done.finishedAt! > v1.finishedAt!).toBe(true);
    expect(done.finishedEarlierVersion).toEqual({ version: 1, at: v1.finishedAt }); // true history; show it only without finishedAt
  });

  it('an event without a version counts as current only while the text is at version 1; the latest earlier completion wins', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await complete(h, ES_STORY); // legacy event at v1: current
    expect((await h.golearn.readingProgress(U, ES_STORY)).finishedAt).toBeTruthy();
    await revise(h, ES_STORY, [0]);
    expect((await h.golearn.readingProgress(U, ES_STORY)).finishedAt).toBeUndefined();
    await revise(h, ES_STORY, [1], 3);
    await complete(h, ES_STORY, 2);
    const p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p.finishedAt).toBeUndefined();
    expect(p.finishedEarlierVersion?.version).toBe(2); // the latest of the earlier ones
  });

  it('finished with zero sentences seen is finished, seen 0 (the two are independent facts)', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await complete(h, ES_STORY, 1);
    const p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p).toMatchObject({ sentencesSeen: 0, sentencesTotal: 4, sentencesUnderstood: 0 });
    expect(p.finishedAt).toBeTruthy();
    expect(p.asOf).toBe(p.finishedAt);
  });
});

describe('scope fields, asOf, readingProgressMany', () => {
  it('carries userId, lang, textId and the version; asOf is the latest event the record includes (none ⇒ undefined)', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    const none = await h.golearn.readingProgress(U, ES_STORY);
    expect(none).toMatchObject({ userId: U, lang: 'es', textId: ES_STORY, contentVersion: 1 });
    expect(none.asOf).toBeUndefined();
    await h.view(U, 'es', ES_STORY, 0);
    const first = (await h.bus.history({ userId: U }))[0].at;
    expect((await h.golearn.readingProgress(U, ES_STORY)).asOf).toBe(first);
    await h.view(U, 'es', ES_JOHN, 0, 's1', 'scripture'); // another text: this record is unchanged
    expect((await h.golearn.readingProgress(U, ES_STORY)).asOf).toBe(first);
    await h.view(U, 'es', ES_STORY, 1);
    const second = (await h.bus.history({ userId: U, types: ['SentenceViewed'] })).filter((e) => (e as { textId: string }).textId === ES_STORY).at(-1)!.at;
    expect((await h.golearn.readingProgress(U, ES_STORY)).asOf).toBe(second);
    await h.report(U, 'es', ES_STORY, [1], { scope: 'text', degree: 'some' });
    const p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p.reportedComprehension).toBe('some');
    expect(p.asOf! > second).toBe(true);
    expect((await h.golearn.readingProgress('someone-else', ES_STORY)).asOf).toBeUndefined();
  });

  it('readingProgressMany equals the per-text calls, and reads the log once', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildSpanishScripture(h.store);
    await h.understood(U, 'es', ES_STORY, [0, 1], 's1');
    await h.viewAll(U, 'es', ES_JOHN, 2, 's2', 'scripture');
    await complete(h, ES_STORY, 1);
    await h.listen(U, 'es', ES_STORY, [0], { session: 'l1' });
    await revise(h, ES_JOHN, [0]);

    let historyReads = 0;
    const history = h.bus.history.bind(h.bus);
    h.bus.history = (async (f) => { historyReads += 1; return history(f); }) as typeof h.bus.history;
    const many = await h.golearn.readingProgressMany(U, [ES_STORY, ES_JOHN, ES_STORY]);
    expect(historyReads).toBe(1);
    expect([...many.keys()]).toEqual([ES_STORY, ES_JOHN]);
    h.bus.history = history;
    for (const id of [ES_STORY, ES_JOHN]) expect(many.get(id)).toEqual(await h.golearn.readingProgress(U, id));
    expect(many.get(ES_STORY)).toMatchObject({ sentencesSeen: 2, sentencesUnderstood: 2, listenedSentences: 1, sittings: 1 });
    expect(many.get(ES_JOHN)).toMatchObject({ sentencesSeen: 1, earlierVersions: { sentencesSeen: 1, sentencesUnderstood: 0 } });
    expect((await h.golearn.readingProgressMany(U, [])).size).toBe(0);
    await expect(h.golearn.readingProgressMany(U, [ES_STORY, 'text:es:nope'])).rejects.toThrow(/unknown text/);
  });

  it('sentence-level help in the sitting of a report means "understood" is not claimed for that sentence', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0, 's1');
    await h.view(U, 'es', ES_STORY, 1, 's1');
    await h.rescue(U, 'es', ES_STORY, [1], 's1');
    await h.report(U, 'es', ES_STORY, [0, 1], { session: 's1' });
    expect(await h.golearn.readingProgress(U, ES_STORY)).toMatchObject({ sentencesSeen: 2, sentencesUnderstood: 1 });
  });

  it('progress is identical live and after a rebuild (it reads the log, not derived state) and is not changed by it', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.understood(U, 'es', ES_STORY, [0, 1, 2], 's1');
    await complete(h, ES_STORY, 1);
    const before = await h.golearn.readingProgress(U, ES_STORY);
    await h.golearn.rebuild(U);
    expect(await h.golearn.readingProgress(U, ES_STORY)).toEqual(before);
  });
});
