/** Evidence policy v2: exposure ≠ comprehension, demonstration, estimate, listening eligibility, audit and migration. */
import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { ES_STORY, TH_STORY, buildSpanish, buildThai } from './fixtures';

const U = 'u1';
const F = (w: string) => ids.form('es', w);
const LUZ = ids.form('es', 'luz');

/** Four sentences that all contain "luz" — so one session can hold four encounters of one item. */
async function buildLuz(h: Harness) {
  await buildFixtureText(h.store, {
    lang: 'es', slug: 'luz',
    sentences: Array.from({ length: 4 }, (_, i) => ({ tokens: [{ surface: 'la', lemma: 'la', pos: 'DET' as const }, { surface: 'luz', lemma: 'luz', pos: 'NOUN' as const }, { surface: `n${i}`, lemma: `n${i}`, pos: 'NOUN' as const }] })),
  });
  return 'text:es:luz';
}

const reading = async (h: Harness, itemId: string, user = U) => (await h.golearn.getItemState(user, itemId))!.reading;

describe('policyVersion', () => {
  it('is evidence@4', async () => {
    expect(createHarness().golearn.policyVersion).toBe('evidence@4');
  });
});

describe('exposure is not comprehension', () => {
  it('viewing, completing and opening a text — any number of times — never passes "encountered" and adds no evidence', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    for (const s of ['s1', 's2', 's3']) {
      await h.viewAll(U, 'es', ES_STORY, 4, s);
      await h.bus.emit({ type: 'TextViewed', userId: U, lang: 'es', surface: 'corpus', session: s, dedupeKey: `tv:${s}`, textId: ES_STORY } as never);
      await h.complete(U, 'es', ES_STORY, s);
    }
    for (const r of await h.store.learnerItems.where('userId', U)) {
      expect(r.reading.level).toBe('encountered');
      expect(r.reading.evidence).toBe(0);
    }
    for (const e of await h.store.encounters.where('userId', U)) expect(e.evidenceKind).toBe('exposure');
    expect(await h.golearn.listKnown(U, 'es', 'reading', 'recognized')).toEqual([]);
    const creo = await reading(h, F('creo'));
    expect(creo.exposures).toBe(6); // 2 sentences × 3 sessions
    expect(creo.estimatedFamiliar).toBe(true); // six help-free exposures over three sessions: an estimate, nothing more
    expect(creo.confidence).toBe(0.3);
    const dios = await reading(h, F('perdona')); // met three times only
    expect(dios.estimatedFamiliar).toBe(false);
    expect(dios.confidence).toBe(0);
    expect((await h.golearn.coverage(U, ES_STORY)).knownLexicalCoverage).toBe(0);
  });
});

describe('demonstration', () => {
  it('"all" demonstrates: one demonstration is recognized with help; a second sentence or session makes it recognized', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.understood(U, 'es', ES_STORY, [0], 's1');
    expect((await reading(h, F('creo'))).level).toBe('recognized_with_help');
    expect((await reading(h, F('creo'))).evidence).toBe(1);
    await h.understood(U, 'es', ES_STORY, [0], 's2'); // same sentence, another session
    expect((await reading(h, F('creo'))).level).toBe('recognized');
    // "en" occurs in two sentences of one session: two distinct sentences are enough
    await h.understood('v', 'es', ES_STORY, [0, 2], 's1');
    expect((await reading(h, F('en'), 'v')).level).toBe('recognized');
    expect(await h.golearn.getItemState('v', F('corazón'))).toBeUndefined();
  });

  it('only degree "all" is item evidence; most / some / little are stored but change nothing, and nothing is downgraded', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.viewAll(U, 'es', ES_STORY, 4, 's1');
    for (const degree of ['most', 'some', 'little'] as const) await h.report(U, 'es', ES_STORY, [0, 1, 2, 3], { degree, scope: 'text' });
    expect((await reading(h, F('creo'))).evidence).toBe(0);
    expect((await reading(h, F('creo'))).level).toBe('encountered');
    await h.report(U, 'es', ES_STORY, [0], { degree: 'all' });
    expect((await reading(h, F('creo'))).evidence).toBe(1);
    await h.report(U, 'es', ES_STORY, [0], { degree: 'little' }); // a later, lower report never erases a demonstration
    expect((await reading(h, F('creo'))).evidence).toBe(1);
    expect((await h.bus.history({ userId: U, types: ['ComprehensionReported'] })).length).toBe(5); // all of them are in the log
  });

  it('a report in either order with the view reaches the same state; a report for an unseen sentence materialises the reading', async () => {
    const a = createHarness();
    const b = createHarness();
    for (const h of [a, b]) await buildSpanish(h.store);
    await a.view(U, 'es', ES_STORY, 0);
    await a.report(U, 'es', ES_STORY, [0]);
    await b.report(U, 'es', ES_STORY, [0]); // reported without a SentenceViewed
    const pick = async (h: Harness) => (await h.store.encounters.where('userId', U)).map((e) => [e.itemId, e.evidenceKind, e.weight]).sort();
    expect(await pick(b)).toEqual(await pick(a));
    expect((await reading(b, F('creo'))).evidence).toBe(1);
    // and a view that arrives after the report does not add a second encounter
    await b.view(U, 'es', ES_STORY, 0);
    expect(await pick(b)).toEqual(await pick(a));
  });

  it('a report belongs to its own sitting: demonstrating in sitting 1 says nothing about sitting 2', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0, 's1');
    await h.report(U, 'es', ES_STORY, [0], { session: 's1' });
    await h.view(U, 'es', ES_STORY, 0, 's2'); // 31 minutes later
    const kinds = (await h.store.encounters.where('itemId', F('creo'))).sort((x, y) => (x.at < y.at ? -1 : 1)).map((e) => e.evidenceKind);
    expect(kinds).toEqual(['demonstrated', 'exposure']);
  });

  it('an explicit "known" mark is an explicit demonstration of that one item', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    await h.mark(U, 'es', F('creo'), 'known');
    const cov = await h.golearn.coverage(U, ES_STORY, [`${ES_STORY}/s0`]);
    expect(cov.knownLexicalCoverage).toBeCloseTo(1 / 4, 10);
    const why = await h.golearn.explainItem(U, F('creo'));
    expect(why.summary).toContain('You marked it known');
  });

  it('production demonstrates only in writing / speaking and never raises reading', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    await h.produce(U, 'es', F('creo'), 'independent');
    const st = (await h.golearn.getItemState(U, F('creo')))!;
    expect(st.writing.level).toBe('used_independently');
    expect(st.writing.estimatedFamiliar).toBe(false);
    expect(st.reading.level).toBe('encountered');
    expect(st.reading.evidence).toBe(0);
  });
});

describe('the estimate ("likely familiar")', () => {
  it('needs ≥ 4 help-free exposures over ≥ 2 sessions', async () => {
    const h = createHarness();
    const luz = await buildLuz(h);
    await h.viewAll(U, 'es', luz, 4, 's1'); // four encounters, one session
    expect((await reading(h, LUZ)).exposures).toBe(4);
    expect((await reading(h, LUZ)).estimatedFamiliar).toBe(false);
    await h.view(U, 'es', luz, 0, 's2'); // a second session
    const r = await reading(h, LUZ);
    expect(r.estimatedFamiliar).toBe(true);
    expect(r.level).toBe('encountered'); // an estimate is not a level
    expect(r.evidence).toBe(0);
    expect(r.confidence).toBe(0.3);
    const k = await h.golearn.queryItem(U, { itemId: LUZ, lang: 'es' });
    expect(k.reading.estimatedFamiliar).toBe(true);
  });

  it('three exposures are not enough, however many sessions', async () => {
    const h = createHarness();
    const luz = await buildLuz(h);
    for (const s of ['s1', 's2', 's3']) await h.view(U, 'es', luz, 0, s);
    expect((await reading(h, LUZ)).estimatedFamiliar).toBe(false);
  });

  it('help in either of the last two encounters withdraws it; two clean encounters restore it', async () => {
    const h = createHarness();
    const luz = await buildLuz(h);
    for (const s of ['s1', 's2', 's3', 's4']) await h.view(U, 'es', luz, 0, s);
    expect((await reading(h, LUZ)).estimatedFamiliar).toBe(true);
    await h.view(U, 'es', luz, 0, 's5');
    await h.help(U, 'es', luz, 0, 1, LUZ, 1, 's5'); // a gloss on "luz"
    expect((await reading(h, LUZ)).estimatedFamiliar).toBe(false);
    await h.view(U, 'es', luz, 0, 's6');
    expect((await reading(h, LUZ)).estimatedFamiliar).toBe(false); // the gloss is still one of the last two
    await h.view(U, 'es', luz, 0, 's7');
    expect((await reading(h, LUZ)).estimatedFamiliar).toBe(true);
  });

  it('is reported separately in coverage, never merged into "known", and explained', async () => {
    const h = createHarness();
    const luz = await buildLuz(h);
    for (const s of ['s1', 's2', 's3', 's4']) await h.view(U, 'es', luz, 0, s);
    const cov = await h.golearn.coverage(U, luz, [`${luz}/s0`]);
    expect(cov.estimatedFamiliarCoverage).toBe(1); // all three words of the sentence were met four times, help-free
    expect(cov.knownLexicalCoverage).toBe(0);
    const why = await h.golearn.explainItem(U, LUZ);
    expect(why.summary).toContain('Likely familiar');
    expect(why.summary).toContain('estimate');
  });

  it('is withdrawn once the item is demonstrated (recognized) and when the learner says "unknown"', async () => {
    const h = createHarness();
    const luz = await buildLuz(h);
    for (const s of ['s1', 's2', 's3', 's4']) await h.view(U, 'es', luz, 0, s);
    await h.mark(U, 'es', LUZ, 'unknown');
    expect((await h.golearn.queryItem(U, { itemId: LUZ, lang: 'es' })).reading.estimatedFamiliar).toBe(false);
    await h.mark(U, 'es', LUZ, 'clear');
    expect((await h.golearn.queryItem(U, { itemId: LUZ, lang: 'es' })).reading.estimatedFamiliar).toBe(true);
    for (const s of ['d1', 'd2']) await h.report(U, 'es', luz, [0], { session: s });
    expect((await reading(h, LUZ)).level).toBe('recognized');
    expect((await reading(h, LUZ)).estimatedFamiliar).toBe(false);
  });
});

describe('only reviewed real speech counts for listening (rule 5)', () => {
  it('new events: counted only when speech AND voiceReviewed are true; a stored non-speech asset wins', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.listen('ok', 'es', ES_STORY, [0], { speech: true, voiceReviewed: true });
    await h.listen('tone', 'es', ES_STORY, [0], { speech: false, voiceReviewed: true });
    await h.listen('raw', 'es', ES_STORY, [0], { speech: true, voiceReviewed: false });
    await h.seedAudio('fx', { speech: false });
    await h.listen('lie', 'es', ES_STORY, [0], { speech: true, voiceReviewed: true, assetId: 'asset:fx' }); // says speech, the asset says tone
    expect((await h.golearn.getItemState('ok', F('creo')))?.listening.level).toBe('encountered');
    for (const u of ['tone', 'raw', 'lie']) {
      expect(await h.golearn.getItemState(u, F('creo'))).toBeUndefined();
      expect(await h.store.encounters.where('userId', u)).toEqual([]);
    }
  });

  it('legacy events are resolved segment → asset → voice', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    const real = await h.seedAudio('real', { speech: true, reviewStatus: 'approved' });
    const fixture = await h.seedAudio('fix', { speech: false });
    const unreviewed = await h.seedAudio('raw', { speech: true, reviewStatus: 'unreviewed' });
    const noFlagFixture = await h.seedAudio('old-fix', { speech: false, flag: false, provider: 'fixture' });
    const noFlagReal = await h.seedAudio('old-real', { speech: true, flag: false, provider: 'azure' });
    const cases: Array<[string, string | undefined, boolean]> = [
      ['real', real, true], ['fixture', fixture, false], ['unreviewed', unreviewed, false],
      ['old-fixture', noFlagFixture, false], ['old-real-unflagged', noFlagReal, false], ['unknown', 'seg:missing', false],
    ];
    for (const [user, segmentId, counted] of cases) {
      await h.listen(user, 'es', ES_STORY, [0], { legacy: true, segmentId });
      expect(!!(await h.golearn.getItemState(user, F('creo'))), user).toBe(counted);
    }
  });

  it('auditEvidence lists the excluded events with reasons, changes nothing, and can rebuild', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.listen(U, 'es', ES_STORY, [0], { session: 'l1' });
    await h.listen(U, 'es', ES_STORY, [1], { session: 'l2', speech: false });
    await h.listen(U, 'es', ES_STORY, [2], { session: 'l3', voiceReviewed: false });
    const fixture = await h.seedAudio('fix', { speech: false });
    await h.listen(U, 'es', ES_STORY, [3], { session: 'l4', legacy: true, segmentId: fixture });
    await h.listen(U, 'es', ES_STORY, [3], { session: 'l5', legacy: true, segmentId: 'seg:nope' });
    const events = await h.store.events.where('userId', U);
    const audit = await h.golearn.auditEvidence(U);
    expect(audit).toMatchObject({ userId: U, policyVersion: 'evidence@4', totalEvents: events.length, rebuilt: false });
    expect(audit.excluded.map((x) => x.reason).sort()).toEqual(['non-speech-audio', 'non-speech-audio', 'unknown-asset', 'unreviewed-voice']);
    expect(audit.excluded.every((x) => x.type === 'AudioSegmentCompleted')).toBe(true);
    const before = (await h.store.encounters.where('userId', U)).length;
    const again = await h.golearn.auditEvidence(U, { rebuild: true });
    expect(again.rebuilt).toBe(true);
    expect((await h.store.encounters.where('userId', U)).length).toBe(before); // nothing excluded ever counted
    expect((await h.store.events.where('userId', U)).length).toBe(events.length); // nothing deleted from the log
  });

  it('explainItem says how many ignored plays there were', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.listen(U, 'es', ES_STORY, [0], { session: 'l1', speech: false });
    await h.view(U, 'es', ES_STORY, 0);
    const why = await h.golearn.explainItem(U, F('creo'));
    expect(why.excludedEvents).toBe(1);
    expect(why.summary).toContain('1 audio play ignored');
  });
});

describe('ensureCurrent — migration from an older policy without deleting anything', () => {
  it('rebuilds once when the stored policy version differs; fixture-derived state disappears, events stay', async () => {
    const h = createHarness({ attach: false });
    await buildSpanish(h.store);
    // the old world: the fixture tone completed and was folded as listening evidence under the previous policy
    const fixture = await h.seedAudio('fix', { speech: false });
    await h.listen(U, 'es', ES_STORY, [0], { legacy: true, segmentId: fixture });
    await h.view(U, 'es', ES_STORY, 0);
    await h.store.learnerItems.put({
      id: ids.learnerItem(U, F('creo')), userId: U, lang: 'es', itemId: F('creo'), itemKind: 'form', encounterCount: 9, textIds: [ES_STORY],
      reading: { level: 'recognized', confidence: 0.9, evidence: 9, unassisted: 9, assisted: 0 } as never,
      listening: { level: 'rapid', confidence: 0.9, evidence: 9, unassisted: 9, assisted: 0 } as never,
      writing: { level: 'unseen', confidence: 0, evidence: 0, unassisted: 0, assisted: 0 } as never, speaking: { level: 'unseen', confidence: 0, evidence: 0, unassisted: 0, assisted: 0 } as never,
    });
    await h.store.meta.put({ id: `golearn.policy:${U}`, value: 'evidence@1', updatedAt: '2025-01-01T00:00:00.000Z' });
    const events = (await h.store.events.where('userId', U)).length;

    expect(await h.golearn.ensureCurrent(U)).toBe(true);
    const creo = (await h.golearn.getItemState(U, F('creo')))!;
    expect(creo.listening.level).toBe('unseen'); // the tone never counted
    expect(creo.reading.level).toBe('encountered'); // exposure only
    expect(creo.reading.evidence).toBe(0);
    expect((await h.store.events.where('userId', U)).length).toBe(events);
    expect((await h.store.meta.get(`golearn.policy:${U}`))?.value).toBe('evidence@4');
    expect(await h.golearn.ensureCurrent(U)).toBe(false); // idempotent
  });

  it('rebuilds a user whose derived state exists without any policy stamp, and leaves other users alone', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view('b', 'es', ES_STORY, 0); // b: folded from scratch, so stamped
    await h.store.encounters.put({
      id: 'legacy-a', userId: 'a', lang: 'es', itemId: F('creo'), itemKind: 'form', sentenceId: `${ES_STORY}/s0`, textId: ES_STORY,
      surface: 'corpus', modality: 'reading', at: '2025-01-01T00:00:00.000Z', evidenceKind: 'exposure', assistance: 0, priorLevel: 'unseen', weight: 0,
    });
    await h.view('a', 'es', ES_STORY, 0); // a: state predates any stamp
    const b = (await h.store.encounters.where('userId', 'b')).length;
    expect(await h.golearn.ensureCurrent('a')).toBe(true);
    expect((await h.store.meta.get('golearn.policy:b'))?.value).toBe('evidence@4');
    expect((await h.store.encounters.where('userId', 'b')).length).toBe(b);
  });

  it('a brand-new learner is just stamped', async () => {
    const h = createHarness();
    expect(await h.golearn.ensureCurrent('fresh')).toBe(false);
    expect((await h.store.meta.get('golearn.policy:fresh'))?.value).toBe('evidence@4');
  });
});

describe('duplicate evidence guards', () => {
  it('rerender, replay and re-import of the same text add no encounters', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.understood(U, 'es', ES_STORY, [0, 1], 's1');
    const snap = async () => JSON.stringify((await h.store.encounters.where('userId', U)).sort((x, y) => (x.id < y.id ? -1 : 1)));
    const before = await snap();
    expect(await h.view(U, 'es', ES_STORY, 0, 's1')).toBeNull(); // rerender: same dedupeKey
    for (const e of await h.bus.history({ userId: U })) await h.golearn.handle(e); // replay every event
    expect(await snap()).toBe(before);
    await buildSpanish(h.store); // re-import: same sentence ids, same tokens
    await h.golearn.rebuild(U);
    expect(await snap()).toBe(before);
    expect((await h.golearn.readingProgress(U, ES_STORY)).sentencesSeen).toBe(2);
  });
});

describe('readingProgress — Seen / Understood / Finished are three different things', () => {
  it('counts seen live sentences, the last text report and really-heard sentences; finishing is never inferred', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    let p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p).toEqual({ userId: U, lang: 'es', textId: ES_STORY, contentVersion: 1, sentencesTotal: 4, sentencesSeen: 0, sentencesUnderstood: 0, sittings: 0, listenedSentences: 0 }); // no events: no asOf
    await h.view(U, 'es', ES_STORY, 0);
    await h.view(U, 'es', ES_STORY, 1);
    p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p).toMatchObject({ sentencesSeen: 2, sittings: 1 });
    expect(p.finishedAt).toBeUndefined();
    await h.view(U, 'es', ES_STORY, 2);
    await h.view(U, 'es', ES_STORY, 3);
    p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p.sentencesSeen).toBe(4);
    expect(p.finishedAt).toBeUndefined(); // every live sentence seen is NOT "finished"
    expect(p.reportedComprehension).toBeUndefined();
    await h.report(U, 'es', ES_STORY, [0, 1, 2, 3], { scope: 'text', degree: 'some' });
    await h.report(U, 'es', ES_STORY, [0, 1, 2, 3], { scope: 'text', degree: 'most' });
    expect((await h.golearn.readingProgress(U, ES_STORY)).reportedComprehension).toBe('most'); // the LAST self-report
    await h.listen(U, 'es', ES_STORY, [0, 1], { session: 'l1' });
    await h.listen(U, 'es', ES_STORY, [2], { session: 'l1', speech: false });
    expect((await h.golearn.readingProgress(U, ES_STORY)).listenedSentences).toBe(2); // the fixture play is not "heard"
    expect((await h.golearn.readingProgress('someone-else', ES_STORY)).sentencesSeen).toBe(0);
    await expect(h.golearn.readingProgress(U, 'text:es:nope')).rejects.toThrow();
  });

  it('an explicit TextCompleted sets finishedAt, even before every sentence was seen', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0);
    await h.complete(U, 'es', ES_STORY);
    const p = await h.golearn.readingProgress(U, ES_STORY);
    expect(p.sentencesSeen).toBe(1);
    expect(p.finishedAt).toBeTruthy();
  });
});

describe('explainItem', () => {
  it('summarises exposure, help and demonstration in one plain sentence, with texts', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 0, 's1');
    await h.view(U, 'es', ES_STORY, 0, 's2');
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 1, 's2');
    await h.understood(U, 'es', ES_STORY, [0], 's3');
    await h.produce(U, 'es', F('creo'), 'independent');
    const why = await h.golearn.explainItem(U, F('creo'));
    expect(why.summary).toBe('Met 3 times in 1 text; needed help with this word once; understood without help once; used in your own writing or speech once (1 on your own).');
    expect(why).toMatchObject({ itemId: F('creo'), exposures: 1, assisted: 1, demonstrated: 1, excludedEvents: 0 });
    expect(why.productions).toEqual({ independent: 1, selfRepaired: 0, assisted: 0, copied: 0 });
    expect(why.texts).toEqual([{ textId: ES_STORY, title: 'Historia 1', count: 3 }]);
    expect((await h.golearn.explainItem(U, F('nunca'))).summary).toBe('Not met yet.');
    await expect(h.golearn.explainItem(U, 'nonsense')).rejects.toThrow();
  });
});

describe('isolation', () => {
  it('another learner\'s events never change a learner\'s state, coverage or explanations', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.understood('a', 'es', ES_STORY, [0], 's1');
    const snap = async () => JSON.stringify([
      await h.golearn.getItemState('a', F('creo')), await h.golearn.coverage('a', ES_STORY), await h.golearn.explainItem('a', F('creo')),
      await h.golearn.readingProgress('a', ES_STORY),
    ]);
    const before = await snap();
    await h.understood('b', 'es', ES_STORY, [0, 1, 2, 3], 's1'); // same session name, different learner
    await h.rescue('b', 'es', ES_STORY, [0], 's1');
    await h.mark('b', 'es', F('creo'), 'known');
    await h.listen('b', 'es', ES_STORY, [0], { session: 'l1' });
    expect(await snap()).toBe(before);
    await h.golearn.rebuild('b');
    expect(await snap()).toBe(before);
  });

  it('language: state is keyed by item id, so another language never interferes and switching back restores everything', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await buildThai(h.store);
    await h.understood(U, 'es', ES_STORY, [0], 's1');
    const es = JSON.stringify([await h.golearn.coverage(U, ES_STORY), await h.golearn.listKnown(U, 'es', 'reading', 'encountered')]);
    await h.understood(U, 'th', TH_STORY, [0, 1], 's1');
    await h.understood(U, 'th', TH_STORY, [0, 1], 's2');
    expect(await h.golearn.listKnown(U, 'es', 'reading', 'encountered')).toEqual(JSON.parse(es)[1]);
    expect(JSON.stringify([await h.golearn.coverage(U, ES_STORY), await h.golearn.listKnown(U, 'es', 'reading', 'encountered')])).toBe(es);
    expect((await h.golearn.listKnown(U, 'th', 'reading', 'recognized')).length).toBeGreaterThan(0);
    expect((await h.golearn.listKnown(U, 'es', 'reading', 'recognized')).every((r) => r.lang === 'es')).toBe(true);
  });
});

describe('policy stamp on first write', () => {
  const stampOf = async (h: Harness, user: string) => (await h.store.meta.get(`golearn.policy:${user}`))?.value;

  it('a learner whose state was folded from scratch is stamped, so ensureCurrent has nothing to rebuild', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    expect(await stampOf(h, U)).toBeUndefined();
    await h.view(U, 'es', ES_STORY, 0);
    expect(await stampOf(h, U)).toBe('evidence@4');
    expect(await h.golearn.ensureCurrent(U)).toBe(false);
    expect(await stampOf(h, 'nobody')).toBeUndefined(); // other learners are not stamped
  });

  it('derived state that exists without a stamp is legacy: folding leaves it unstamped and ensureCurrent rebuilds once', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.store.encounters.put({
      id: 'legacy-enc', userId: U, lang: 'es', itemId: F('creo'), itemKind: 'form', sentenceId: `${ES_STORY}/s0`, textId: ES_STORY,
      surface: 'corpus', modality: 'reading', at: '2025-01-01T00:00:00.000Z', evidenceKind: 'demonstrated', assistance: 0, priorLevel: 'unseen', weight: 1,
    });
    await h.view(U, 'es', ES_STORY, 0); // a live event folds; the old state is still there
    expect(await stampOf(h, U)).toBeUndefined();
    expect(await h.golearn.ensureCurrent(U)).toBe(true);
    expect((await h.store.encounters.get('legacy-enc'))).toBeUndefined(); // rebuilt from the log
    expect(await stampOf(h, U)).toBe('evidence@4');
    expect(await h.golearn.ensureCurrent(U)).toBe(false);
  });

  it('a legacy encounter written to a stamped-free user with no events: ensureCurrent returns true, then false', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.store.encounters.put({
      id: 'legacy-enc', userId: U, lang: 'es', itemId: F('creo'), itemKind: 'form', sentenceId: `${ES_STORY}/s0`, textId: ES_STORY,
      surface: 'corpus', modality: 'reading', at: '2025-01-01T00:00:00.000Z', evidenceKind: 'exposure', assistance: 0, priorLevel: 'unseen', weight: 0,
    });
    expect(await h.golearn.ensureCurrent(U)).toBe(true);
    expect(await h.golearn.ensureCurrent(U)).toBe(false);
  });

  it('an event that writes no state (fixture audio) still leaves a fresh learner consistent', async () => {
    const h = createHarness();
    await buildSpanish(h.store);
    await h.listen(U, 'es', ES_STORY, [0], { speech: false });
    expect(await h.golearn.ensureCurrent(U)).toBe(false);
    expect(await h.store.encounters.where('userId', U)).toEqual([]);
  });
});
