/**
 * evidence@7: time-derived sittings, one exposure per sitting, explicit completion, "Seen / Understood / Finished" kept
 * apart, and evidence pinned to the content version. Every test here controls time itself (`sittingPerSession: false`).
 */
import { describe, expect, it } from 'vitest';
import { SITTING_GAP_MS, buildFixtureText, ids } from '../../src/core';
import type { DomainEvent, EventInput } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { ES_STORY, buildSpanish } from './fixtures';

const U = 'u1';
const F = (w: string) => ids.form('es', w);
const LUZ = ids.form('es', 'luz');
const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 5, 1, 9, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const S = (i: number, textId = ES_STORY) => `${textId}/s${i}`;

const mk = () => createHarness({ sittingPerSession: false });
const reading = async (h: Harness, itemId: string, user = U) => (await h.golearn.getItemState(user, itemId))!.reading;
const encs = async (h: Harness, user = U) => (await h.store.encounters.where('userId', user)).sort((a, b) => (a.id < b.id ? -1 : 1));

/** SentenceViewed at an explicit time (the harness helpers use the 1 s clock). */
const viewAt = (h: Harness, at: string, index: number, o: { session?: string; user?: string; textId?: string; key?: string; contentVersion?: number } = {}) => {
  const textId = o.textId ?? ES_STORY;
  const user = o.user ?? U;
  const session = o.session ?? 's1';
  return h.bus.emit({
    type: 'SentenceViewed', userId: user, lang: 'es', surface: 'corpus', session, at,
    dedupeKey: o.key ?? `v:${user}:${session}:${textId}:${index}:${at}`, textId, sentenceId: S(index, textId), tokenIds: [],
    ...(o.contentVersion !== undefined ? { contentVersion: o.contentVersion } : {}),
  } as EventInput<DomainEvent>);
};
async function buildLuz(h: Harness) {
  await buildFixtureText(h.store, {
    lang: 'es', slug: 'luz',
    sentences: Array.from({ length: 4 }, (_, i) => ({ tokens: [{ surface: 'la', lemma: 'la', pos: 'DET' as const }, { surface: 'luz', lemma: 'luz', pos: 'NOUN' as const }, { surface: `n${i}`, lemma: `n${i}`, pos: 'NOUN' as const }] })),
  });
  return 'text:es:luz';
}

describe('sittings: no duplicate exposure inside one sitting', () => {
  it('rerender, scroll in/out (same dedupeKey), a route revisit and a reload with a NEW session id add nothing', async () => {
    const h = mk();
    await buildSpanish(h.store);
    expect(await h.view(U, 'es', ES_STORY, 0, 's1')).not.toBeNull();
    const snap = async () => JSON.stringify({ e: await encs(h), i: (await h.store.learnerItems.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)) });
    const before = await snap();
    const creoBefore = (await reading(h, F('creo'))).exposures;

    // rerender and scroll out / back in: the reader reuses the dedupeKey, the bus drops it
    expect(await h.view(U, 'es', ES_STORY, 0, 's1')).toBeNull();
    expect(await h.view(U, 'es', ES_STORY, 0, 's1')).toBeNull();
    // route revisit: the same session, a fresh dedupeKey (a new mount of the reader)
    h.clock.advance(5 * MIN);
    await h.bus.emit({ type: 'SentenceViewed', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: 'revisit-1', textId: ES_STORY, sentenceId: S(0), tokenIds: [] } as EventInput<DomainEvent>);
    // reload: a NEW session id, inside 30 minutes of the previous evidence
    h.clock.advance(10 * MIN);
    expect(await h.view(U, 'es', ES_STORY, 0, 's2')).not.toBeNull(); // a real new event…
    h.clock.advance(10 * MIN);
    expect(await h.view(U, 'es', ES_STORY, 0, 's3')).not.toBeNull(); // …and another reload

    expect(await snap()).toBe(before); // identical rows (the first encounter keeps its time)
    expect((await reading(h, F('creo'))).exposures).toBe(creoBefore);
    expect((await h.golearn.readingProgress(U, ES_STORY)).sittings).toBe(1);
    expect((await h.golearn.readingProgress(U, ES_STORY)).sentencesSeen).toBe(1);
  });

  it('a second sitting (clock +31 minutes) adds exactly one exposure per item/sentence and a second sitting to progress', async () => {
    const h = mk();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0, 's1');
    expect((await reading(h, F('creo'))).exposures).toBe(1);
    h.clock.advance(31 * MIN);
    await h.view(U, 'es', ES_STORY, 0, 's2'); // (the UI rotates its session id after 30 minutes of inactivity; GoLearn does not rely on it)
    expect((await reading(h, F('creo'))).exposures).toBe(2);
    expect((await h.golearn.readingProgress(U, ES_STORY)).sittings).toBe(2);
    expect((await h.golearn.readingProgress(U, ES_STORY)).sentencesSeen).toBe(1);
    expect(new Set((await encs(h)).map((e) => e.sitting)).size).toBe(2);
  });

  it('the gap is measured from the previous evidence event, exactly SITTING_GAP_MS starts a new sitting, and the key is the first event time', async () => {
    const h = mk();
    await buildSpanish(h.store);
    // 20-minute steps for two hours: one long sitting (no gap reaches 30 minutes)
    for (let i = 0; i <= 6; i++) await viewAt(h, iso(T0 + i * 20 * MIN), 0, { key: `a${i}`, session: `s${i}` });
    expect((await h.golearn.readingProgress(U, ES_STORY)).sittings).toBe(1);
    expect(new Set((await encs(h)).map((e) => e.sitting))).toEqual(new Set([iso(T0)]));
    // one millisecond short of the gap: still the same sitting
    const last = T0 + 6 * 20 * MIN;
    await viewAt(h, iso(last + SITTING_GAP_MS - 1), 1, { key: 'edge-1' });
    expect((await h.golearn.readingProgress(U, ES_STORY)).sittings).toBe(1);
    // exactly the gap after the previous event: a new sitting, keyed by ITS first event
    const start2 = last + SITTING_GAP_MS - 1 + SITTING_GAP_MS;
    await viewAt(h, iso(start2), 0, { key: 'edge-2' });
    expect((await h.golearn.readingProgress(U, ES_STORY)).sittings).toBe(2);
    const keys = new Set((await encs(h)).map((e) => e.sitting));
    expect(keys).toEqual(new Set([iso(T0), iso(start2)]));
  });

  it('sittings are per learner: another learner never extends or splits mine', async () => {
    const h = mk();
    await buildSpanish(h.store);
    await viewAt(h, iso(T0), 0, { key: 'a' });
    await viewAt(h, iso(T0 + 10 * MIN), 0, { key: 'b', user: 'other' });
    await viewAt(h, iso(T0 + 35 * MIN), 1, { key: 'c', user: 'other' }); // 'other' is still within 30 min of their own previous event
    await viewAt(h, iso(T0 + 45 * MIN), 1, { key: 'd' }); // 45 min after MY previous event: my second sitting
    expect((await h.golearn.readingProgress(U, ES_STORY)).sittings).toBe(2);
    expect((await h.golearn.readingProgress('other', ES_STORY)).sittings).toBe(1);
  });

  it('exposure alone — any number of sittings — never reaches "recognized"; it is only a labelled estimate', async () => {
    const h = mk();
    await buildSpanish(h.store);
    for (let i = 0; i < 12; i++) {
      await h.view(U, 'es', ES_STORY, 0, `s${i}`);
      await h.view(U, 'es', ES_STORY, 2, `s${i}`);
      h.clock.advance(SITTING_GAP_MS + MIN);
    }
    const creo = await reading(h, F('creo'));
    expect(creo.exposures).toBe(24); // 2 sentences × 12 sittings
    expect(creo.level).toBe('encountered');
    expect(creo.evidence).toBe(0);
    expect(creo.estimatedFamiliar).toBe(true);
    expect(await h.golearn.listKnown(U, 'es', 'reading', 'recognized')).toEqual([]);
    expect((await h.golearn.coverage(U, ES_STORY)).knownLexicalCoverage).toBe(0);
    expect((await h.golearn.readingProgress(U, ES_STORY)).sentencesUnderstood).toBe(0);
  });
});

describe('the estimate counts sittings, not session ids', () => {
  it('four help-free exposures inside one sitting — however many reloads — are not an estimate; a second sitting makes it one', async () => {
    const h = mk();
    const luz = await buildLuz(h);
    await h.viewAll(U, 'es', luz, 4, 's1'); // four encounters, one sitting
    h.clock.advance(MIN);
    await h.view(U, 'es', luz, 0, 's2'); // a "reload": new session id, same sitting
    h.clock.advance(MIN);
    await h.view(U, 'es', luz, 1, 's3'); // and another
    expect((await reading(h, LUZ)).exposures).toBe(4);
    expect((await reading(h, LUZ)).estimatedFamiliar).toBe(false);
    h.clock.advance(SITTING_GAP_MS + MIN);
    await h.view(U, 'es', luz, 0, 's3'); // second sitting
    const r = await reading(h, LUZ);
    expect(r.exposures).toBe(5);
    expect(r.estimatedFamiliar).toBe(true);
    expect(r.level).toBe('encountered');
  });

  it('needs ≥ 4 help-free exposures: three across many sittings are not enough, and help in the last two withdraws it', async () => {
    const h = mk();
    const luz = await buildLuz(h);
    for (let i = 0; i < 3; i++) { await h.view(U, 'es', luz, 0, `a${i}`); h.advance(); }
    expect((await reading(h, LUZ)).estimatedFamiliar).toBe(false);
    await h.view(U, 'es', luz, 0, 'a3');
    expect((await reading(h, LUZ)).estimatedFamiliar).toBe(true);
    h.advance();
    await h.view(U, 'es', luz, 0, 'a4');
    await h.help(U, 'es', luz, 0, 1, LUZ, 1, 'a4'); // gloss on "luz" in this sitting
    expect((await reading(h, LUZ)).estimatedFamiliar).toBe(false);
  });
});

describe('help and reports are scoped to the sitting, not the session id', () => {
  it('help given after a reload (new session id) inside the same sitting still marks the encounter assisted', async () => {
    const h = mk();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0, 's1');
    h.clock.advance(2 * MIN);
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 3, 's2'); // after a reload
    const e = (await h.store.encounters.where('itemId', F('creo')))[0];
    expect(e.assistance).toBe(3);
    expect(e.evidenceKind).toBe('assisted');
    expect((await reading(h, F('creo'))).assisted).toBe(1);
    expect((await h.store.encounters.where('itemId', F('creo'))).length).toBe(1);
    // the same help in a LATER sitting says nothing about this one
    h.advance();
    await h.view(U, 'es', ES_STORY, 0, 's2');
    const all = (await h.store.encounters.where('itemId', F('creo'))).sort((a, b) => (a.at < b.at ? -1 : 1));
    expect(all.map((x) => x.evidenceKind)).toEqual(['assisted', 'exposure']);
  });

  it('help that arrives BEFORE the view in the same sitting (new session id) still applies; a report after a reload demonstrates', async () => {
    const h = mk();
    await buildSpanish(h.store);
    await h.help(U, 'es', ES_STORY, 3, 1, F('perdona'), 1, 's1');
    h.clock.advance(MIN);
    await h.view(U, 'es', ES_STORY, 3, 's2');
    expect((await h.store.encounters.where('itemId', F('perdona')))[0].evidenceKind).toBe('assisted');
    // the clean sentence, viewed in s1 and reported in s2 (reload) in one sitting: demonstrated on the SAME encounter
    await h.view(U, 'es', ES_STORY, 1, 's1');
    h.clock.advance(MIN);
    await h.report(U, 'es', ES_STORY, [1], { session: 's2' });
    const corazon = await h.store.encounters.where('itemId', F('corazón'));
    expect(corazon).toHaveLength(1);
    expect(corazon[0].evidenceKind).toBe('demonstrated');
  });
});

describe('TextViewed is not evidence and not activity', () => {
  it('open and preview leave no state at all and do not bridge two sittings', async () => {
    const h = mk();
    await h.seed(U, 'honduras-es');
    await buildSpanish(h.store);
    for (const [i, mode] of (['open', 'preview'] as const).entries()) {
      await h.bus.emit({ type: 'TextViewed', userId: U, lang: 'es', surface: 'corpus', session: 's1', dedupeKey: `tv${i}`, textId: ES_STORY, mode, contentVersion: 1 } as EventInput<DomainEvent>);
    }
    expect(await h.store.encounters.where('userId', U)).toEqual([]);
    expect(await h.store.learnerItems.where('userId', U)).toEqual([]);
    expect(await h.golearn.readingProgress(U, ES_STORY)).toEqual({
      userId: U, lang: 'es', textId: ES_STORY, contentVersion: 1, sentencesTotal: 4, sentencesSeen: 0, sentencesUnderstood: 0, sittings: 0, listenedSentences: 0,
    }); // a TextViewed is not activity: no asOf either
    expect(await h.golearn.recommend(U)).not.toEqual([]); // still a new learner
    expect((await h.golearn.recommend(U))[0].reason).toBe('first-text');
    // a preview 20 minutes after a view does not keep the sitting alive: the next view 40 minutes later is a new sitting
    await viewAt(h, iso(T0), 0, { key: 'p1' });
    await h.bus.emit({ type: 'TextViewed', userId: U, lang: 'es', surface: 'corpus', session: 's1', at: iso(T0 + 20 * MIN), dedupeKey: 'tv-mid', textId: ES_STORY, mode: 'preview' } as EventInput<DomainEvent>);
    await viewAt(h, iso(T0 + 40 * MIN), 0, { key: 'p2' });
    expect((await h.golearn.readingProgress(U, ES_STORY)).sittings).toBe(2);
  });
});

describe('Seen is not Finished', () => {
  it('seeing every sentence leaves finishedAt undefined and the text "in progress"; only the explicit finish sets it', async () => {
    const h = mk();
    await h.seed(U, 'honduras-es');
    await buildSpanish(h.store);
    await h.viewAll(U, 'es', ES_STORY, 4, 's1');
    let p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p.sentencesSeen).toBe(4);
    expect(p.finishedAt).toBeUndefined();
    let rec = (await h.golearn.recommend(U, { limit: 10 })).find((r) => r.textId === ES_STORY)!;
    expect(rec.reason).toBe('next-input');
    expect(rec.explanation).toContain('not marked it finished');
    expect(rec.score).toBeGreaterThanOrEqual(0.9); // in progress, ahead of unread texts
    // nothing that needs a finished text is offered
    const recs = await h.golearn.recommend(U, { limit: 10 });
    expect(recs.filter((r) => r.textId === ES_STORY).map((r) => r.reason)).not.toContain('reread');
    expect(recs.filter((r) => r.textId === ES_STORY).map((r) => r.reason)).not.toContain('listen-to-read-text');

    await h.complete(U, 'es', ES_STORY, 's1');
    p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p.finishedAt).toBeTruthy();
    expect(p.sentencesSeen).toBe(4);
    rec = (await h.golearn.recommend(U, { limit: 10 })).find((r) => r.textId === ES_STORY)!;
    expect(rec?.explanation ?? '').not.toContain('not marked it finished');
    expect(rec?.explanation ?? '').not.toContain('partway');
  });

  it('a text with an explicit finish is completed: a low self-report then suggests a reread', async () => {
    const h = mk();
    await h.seed(U, 'honduras-es');
    await buildSpanish(h.store);
    await h.viewAll(U, 'es', ES_STORY, 4, 's1');
    await h.report(U, 'es', ES_STORY, [0, 1, 2, 3], { scope: 'text', degree: 'some' });
    expect((await h.golearn.recommend(U, { limit: 10 })).find((r) => r.textId === ES_STORY)!.reason).toBe('next-input'); // not finished yet
    await h.complete(U, 'es', ES_STORY, 's1');
    expect((await h.golearn.recommend(U, { limit: 10 })).find((r) => r.textId === ES_STORY)!.reason).toBe('reread');
  });
});

describe('"Understood" on a sentence never dwelt on', () => {
  it('demonstrates its items and counts as understood, but is not a view', async () => {
    const h = mk();
    await buildSpanish(h.store);
    await h.report(U, 'es', ES_STORY, [0], {}); // no SentenceViewed at all
    const p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p.sentencesSeen).toBe(0);
    expect(p.sentencesUnderstood).toBe(1);
    expect(p.sittings).toBe(0);
    expect(p.finishedAt).toBeUndefined();
    const creo = await reading(h, F('creo'));
    expect(creo.level).toBe('recognized_with_help'); // one demonstration
    expect(creo.evidence).toBe(1);
    expect(creo.exposures).toBe(0);
    // the same sentence later viewed: seen goes up, understood is unchanged
    h.advance();
    await h.view(U, 'es', ES_STORY, 0, 's1');
    expect(await h.golearn.readingProgress(U, ES_STORY)).toMatchObject({ sentencesSeen: 1, sentencesUnderstood: 1, sittings: 1 });
  });

  it('sentence-level help in the report\'s sitting means "not understood without help"; token help and other sittings do not', async () => {
    const h = mk();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0, 's1');
    await h.rescue(U, 'es', ES_STORY, [0], 's1');
    await h.report(U, 'es', ES_STORY, [0], { session: 's2' }); // after a reload, same sitting: the rescue counts
    expect((await h.golearn.readingProgress(U, ES_STORY)).sentencesUnderstood).toBe(0);
    h.advance();
    await h.view(U, 'es', ES_STORY, 0, 's3');
    await h.report(U, 'es', ES_STORY, [0], { session: 's3' }); // a clean later sitting
    expect((await h.golearn.readingProgress(U, ES_STORY)).sentencesUnderstood).toBe(1);
    // a gloss on one word is item-level help, not sentence-level help
    await h.view(U, 'es', ES_STORY, 1, 's3');
    await h.help(U, 'es', ES_STORY, 1, 0, F('el'), 1, 's3');
    await h.report(U, 'es', ES_STORY, [1], { session: 's3' });
    expect((await h.golearn.readingProgress(U, ES_STORY)).sentencesUnderstood).toBe(2);
    // 'most' and listening reports are not "understood" in the reading sense
    await h.report(U, 'es', ES_STORY, [2], { session: 's3', degree: 'most' });
    await h.report(U, 'es', ES_STORY, [3], { session: 's3', modality: 'listening' });
    expect((await h.golearn.readingProgress(U, ES_STORY)).sentencesUnderstood).toBe(2);
  });
});

describe('derived state is rebuildable under evidence@7', () => {
  async function play(h: Harness) {
    await h.view(U, 'es', ES_STORY, 0, 's1');
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 2, 's2'); // reload inside the sitting
    await h.view(U, 'es', ES_STORY, 1, 's2');
    await h.report(U, 'es', ES_STORY, [1, 2], { session: 's3' });
    await h.view(U, 'es', ES_STORY, 0, 's3');
    h.advance();
    await h.view(U, 'es', ES_STORY, 0, 's4');
    await h.view(U, 'es', ES_STORY, 3, 's4');
    await h.rescue(U, 'es', ES_STORY, [3], 's5');
    await h.listen(U, 'es', ES_STORY, [0, 1], { session: 'l1', speech: true });
    await h.listen(U, 'es', ES_STORY, [2], { session: 'l1', speech: false }); // excluded but part of the log
    h.advance();
    await h.report(U, 'es', ES_STORY, [0, 1], { session: 's6' });
    await h.produce(U, 'es', F('creo'), 'independent');
    await h.mark(U, 'es', F('pecado'), 'known');
    await h.complete(U, 'es', ES_STORY, 's6');
  }

  it('rebuild reproduces live folding exactly, and a fresh instance folding the same log agrees', async () => {
    const h = mk();
    await buildSpanish(h.store);
    await play(h);
    const snap = async (x: Harness) => ({
      encounters: await encs(x),
      items: (await x.store.learnerItems.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)),
      progress: await x.golearn.readingProgress(U, ES_STORY),
    });
    const live = await snap(h);
    const receptive = live.encounters.filter((e) => e.modality === 'reading' || e.modality === 'listening');
    expect(receptive.length).toBeGreaterThan(10);
    expect(receptive.every((e) => e.sitting !== undefined && e.contentVersion === 1)).toBe(true);
    expect(new Set(live.encounters.filter((e) => e.modality === 'reading').map((e) => e.sitting)).size).toBeGreaterThanOrEqual(3);

    await h.golearn.rebuild(U);
    expect(await snap(h)).toEqual(live);

    // a second GoLearn (cold memo) over the same log, via rebuild and via live replay of every event
    const h2 = createHarness({ sittingPerSession: false, attach: false });
    await buildSpanish(h2.store);
    // This is a rebuildability test over the same local store, not a backup-restore test.
    // Audio rows and bytes are required to revalidate lawful listening evidence.
    for (const row of await h.store.voices.all()) await h2.store.voices.put(row);
    for (const row of await h.store.audioSegments.all()) await h2.store.audioSegments.put(row);
    for (const row of await h.store.audioAssets.all()) {
      const blob = await h.store.assets.get(row.checksum);
      if (blob) await h2.store.assets.put(blob.bytes, blob.mime);
      await h2.store.audioAssets.put(row);
    }
    for (const e of await h.bus.history({ userId: U })) await h2.store.events.put(e);
    await h2.golearn.rebuild(U);
    expect(await snap(h2)).toEqual(live);
    const h3 = createHarness({ sittingPerSession: false, attach: false });
    await buildSpanish(h3.store);
    for (const row of await h.store.voices.all()) await h3.store.voices.put(row);
    for (const row of await h.store.audioSegments.all()) await h3.store.audioSegments.put(row);
    for (const row of await h.store.audioAssets.all()) {
      const blob = await h.store.assets.get(row.checksum);
      if (blob) await h3.store.assets.put(blob.bytes, blob.mime);
      await h3.store.audioAssets.put(row);
    }
    for (const e of await h.bus.history({ userId: U })) { await h3.store.events.put(e); await h3.golearn.handle(e); }
    expect(await snap(h3)).toEqual(live);
  });

  it('a user stamped with an older policy (evidence@2) is rebuilt by ensureCurrent from the unchanged log', async () => {
    const h = mk();
    await buildSpanish(h.store);
    await play(h);
    const live = await encs(h);
    // simulate stale evidence@2 state: session-keyed encounters, no sitting, and an old stamp
    for (const e of live) await h.store.encounters.delete(e.id);
    await h.store.encounters.put({ ...live[0], id: 'enc:legacy', sitting: undefined, contentVersion: undefined } as never);
    await h.store.meta.put({ id: 'golearn.policy:u1', value: 'evidence@2', updatedAt: iso(T0) });
    const events = (await h.store.events.where('userId', U)).length;
    expect(await h.golearn.ensureCurrent(U)).toBe(true);
    expect((await h.store.events.where('userId', U)).length).toBe(events); // nothing deleted from the log
    expect((await h.store.meta.get('golearn.policy:u1'))?.value).toBe('evidence@7');
    expect(await encs(h)).toEqual(live);
    expect(await h.golearn.ensureCurrent(U)).toBe(false);
  });
});

describe('evidence is pinned to the content version', () => {
  it('encounters take the event\'s contentVersion, else the sentence\'s versionAdded; a revision never rewrites them', async () => {
    const h = mk();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0, 's1'); // no contentVersion on the event: the sentence says version 1
    await viewAt(h, iso(T0), 1, { key: 'cv-explicit', contentVersion: 1 });
    expect((await encs(h)).every((e) => e.contentVersion === 1)).toBe(true);

    // the event wins over the sentence when it is explicit
    await viewAt(h, iso(T0 + 1000), 2, { key: 'cv-7', contentVersion: 7 });
    const s2 = (await encs(h)).filter((e) => e.sentenceId === S(2));
    expect(s2.length).toBeGreaterThan(0);
    expect(s2.every((e) => e.contentVersion === 7)).toBe(true);
  });

  it('after a revision (a sentence retired, a new one added) old encounters stay at version 1 and progress is on the live sentences of version 2', async () => {
    const h = mk();
    await buildSpanish(h.store);
    await h.viewAll(U, 'es', ES_STORY, 4, 's1');
    await h.report(U, 'es', ES_STORY, [0, 1, 2, 3], { session: 's1' });
    const before = (await encs(h)).map((e) => ({ id: e.id, v: e.contentVersion, kind: e.evidenceKind }));
    expect(before.every((e) => e.v === 1)).toBe(true);
    const p1 = await h.golearn.readingProgress(U, ES_STORY);
    expect(p1).toMatchObject({ contentVersion: 1, sentencesTotal: 4, sentencesSeen: 4, sentencesUnderstood: 4 });

    // revision: s3 ("Dios perdona el pecado.") is retired and replaced by a new sentence; the text becomes version 2
    const old = (await h.store.sentences.get(S(3)))!;
    await h.store.sentences.put({ ...old, retiredInVersion: 2 });
    const newId = ids.sentence(ES_STORY, 'rev2-new');
    await h.store.sentences.put({ ...old, id: newId, key: 'rev2-new', versionAdded: 2, retiredInVersion: undefined, text: 'Dios cree.', normalizedText: 'dios cree.' });
    for (const [i, surface] of ['Dios', 'cree'].entries()) {
      await h.store.tokens.put({ id: ids.token(newId, i), sentenceId: newId, textId: ES_STORY, lang: 'es', index: i, surface, start: i * 5, end: i * 5 + surface.length, normalized: surface.toLowerCase(), formId: ids.form('es', surface.toLowerCase()), isWord: true });
    }
    await h.store.texts.put({ ...(await h.store.texts.get(ES_STORY))!, contentVersion: 2 });

    // progress: 3 old live sentences + 1 new one; the retired sentence's view no longer counts
    let p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p).toMatchObject({ contentVersion: 2, sentencesTotal: 4, sentencesSeen: 3, sentencesUnderstood: 3 });
    expect(p.finishedAt).toBeUndefined();

    // the learner reads the new sentence later; its encounters are version 2, the old ones are untouched
    h.advance();
    await h.bus.emit({ type: 'SentenceViewed', userId: U, lang: 'es', surface: 'corpus', session: 's2', dedupeKey: 'v-new', textId: ES_STORY, sentenceId: newId, tokenIds: [], contentVersion: 2 } as EventInput<DomainEvent>);
    p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p).toMatchObject({ contentVersion: 2, sentencesSeen: 4, sentencesUnderstood: 3 });
    const after = await encs(h);
    for (const b of before) expect(after.find((e) => e.id === b.id)).toMatchObject({ contentVersion: 1, evidenceKind: b.kind });
    const fresh = after.filter((e) => e.sentenceId === newId);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every((e) => e.contentVersion === 2)).toBe(true);

    // a rebuild keeps every version pin
    await h.golearn.rebuild(U);
    const rebuilt = await encs(h);
    expect(rebuilt).toEqual(after);
  });
});
