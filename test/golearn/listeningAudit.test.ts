/**
 * Listening audit (evidence@8): the eight findings of the GoListen evidence audit, each with a positive and a negative case.
 *   1 synthetic speech is never listening evidence      5 only the sentences heard are credited
 *   2 no credit without observed coverage               6 state follows the log (descriptive snapshot; invalidateListening)
 *   3 hearing never merges reading sittings             7 a visible transcript is sentence-level help
 *   4 nothing heard changes a reading measure           8 listening-assessment texts never surface
 * plus: bumping the policy version leaves a reading-only learner's state byte-identical.
 */
import { describe, expect, it } from 'vitest';
import { SITTING_GAP_MS, buildFixtureText, ids } from '../../src/core';
import type { DomainEvent, RankCandidate } from '../../src/core';
import type { StoredItem } from '../../src/golearn/agg';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { withoutHeadCache } from './harness';
import { ES_JOHN, ES_PREP, ES_STORY, buildSpanish, buildSpanishPrep, buildSpanishScripture } from './fixtures';
import { profile } from './profiles';

const U = 'u1';
const F = (w: string) => ids.form('es', w);
const MIN = 60 * 1000;
/** JSON with sorted keys: equal strings = equal values, whatever order a row's keys were written in. */
const canon = (v: unknown): string => JSON.stringify(v, (k, x) => {
  if (['summary', 'needsRelevel', 'pendingPriors'].includes(k)) return undefined;
  return x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x;
});

const listeningOf = async (h: Harness, user: string, itemId: string) => (await h.golearn.getItemState(user, itemId))?.listening;
const excludedReasons = async (h: Harness, user: string) => (await h.golearn.auditEvidence(user)).excluded.map((x) => x.reason);
const encountersOf = async (h: Harness, user: string, modality?: string) =>
  (await h.store.encounters.where('userId', user)).filter((e) => !modality || e.modality === modality);

/** A five-sentence text, one fresh word per sentence: w0 … w4. */
async function buildFive(h: Harness) {
  await buildFixtureText(h.store, {
    lang: 'es', slug: 'five', kind: 'story', title: 'Cinco',
    sentences: Array.from({ length: 5 }, (_, i) => ({ tokens: [{ surface: `w${i}`, lemma: `w${i}`, pos: 'NOUN' as const }] })),
  });
  return 'text:es:five';
}

async function world() {
  const h = createHarness();
  await buildSpanish(h.store);
  return h;
}

// ───────────────────────────── 1 ─────────────────────────────
describe('1 — synthetic speech is never listening evidence', () => {
  it('a reviewed human recording is evidence (the positive control)', async () => {
    const h = await world();
    await h.listen(U, 'es', ES_STORY, [0]);
    expect((await listeningOf(h, U, F('creo')))?.level).toBe('encountered');
    expect(await excludedReasons(h, U)).toEqual([]);
  });

  it('synthetic speech gives no listening encounter, however well reviewed: audit says synthetic-audio', async () => {
    const h = await world();
    // approved quality, reviewed voice, approved rights, exact binding, full observed coverage: still practice only
    await h.listen(U, 'es', ES_STORY, [0], { kind: 'synthetic', quality: 'approved', voiceReviewed: true });
    await h.listen(U, 'es', ES_STORY, [1], { kind: 'synthetic', quality: 'machine_checked' });
    expect(await h.golearn.getItemState(U, F('creo'))).toBeUndefined();
    expect(await encountersOf(h, U)).toEqual([]);
    expect(await excludedReasons(h, U)).toEqual(['synthetic-audio', 'synthetic-audio']);
    // a rebuild keeps it that way and deletes nothing from the log
    await h.golearn.rebuild(U);
    expect(await encountersOf(h, U)).toEqual([]);
    expect((await h.store.events.where('userId', U)).filter((e) => e.type === 'AudioSegmentCompleted')).toHaveLength(2);
  });

  it('a human recording that is only machine-checked is still no evidence (its own reason)', async () => {
    const h = await world();
    await h.listen(U, 'es', ES_STORY, [0], { quality: 'machine_checked' });
    expect(await encountersOf(h, U)).toEqual([]);
    expect(await excludedReasons(h, U)).toEqual(['machine-checked-audio']);
  });
});

// ───────────────────────────── 2 ─────────────────────────────
describe('2 — no credit without observed coverage', () => {
  it.each([
    ['no version, ratio 0.1', { unobserved: true, ratio: 0.1 }],
    ['no version, ratio 0.95', { unobserved: true, ratio: 0.95 }],
    ['no version, no ratio', { unobserved: true }],
    ['version, ratio 0.79', { ratio: 0.79 }],
    ['version, ratio NaN', { ratio: Number.NaN }],
    ['version, ratio above 1', { ratio: 1.2 }],
    ['version, negative ratio', { ratio: -0.5 }],
  ])('%s is excluded as insufficient coverage', async (_name, o) => {
    const h = await world();
    await h.listen(U, 'es', ES_STORY, [0], o);
    expect(await encountersOf(h, U)).toEqual([]);
    expect(await excludedReasons(h, U)).toEqual(['insufficient-audible-coverage']);
  });

  it.each([[0.8], [0.9], [1]])('observed-playback@1 with ratio %s is counted', async (ratio) => {
    const h = await world();
    await h.listen(U, 'es', ES_STORY, [0], { ratio });
    expect((await listeningOf(h, U, F('creo')))?.exposures).toBe(1);
    expect(await excludedReasons(h, U)).toEqual([]);
  });
});

// ───────────────────────────── 3 ─────────────────────────────
describe('3 — hearing never merges reading sittings', () => {
  /** read sentence 3 at T, [listen | nothing] at T+20 min, read it again at T+40 min. */
  async function timeline(withListen: boolean) {
    const h = createHarness({ sittingPerSession: false });
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 3, 's1');
    h.advance(20 * MIN);
    if (withListen) await h.listen(U, 'es', ES_STORY, [3], { session: 'l1' });
    else await h.noteOpened(U, 'es', ES_STORY, 3, 'l1'); // spends the same clock tick; not evidence
    h.advance(20 * MIN);
    await h.view(U, 'es', ES_STORY, 3, 's2');
    return h;
  }
  const readingSnapshot = async (h: Harness) => ({
    items: ((await h.store.learnerItems.where('userId', U)) as StoredItem[]).map((r) => ({ id: r.itemId, reading: r.reading, agg: { reading: r.agg.reading, headR: r.agg.headR, texts: r.agg.texts } }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
    encounters: (await encountersOf(h, U, 'reading')).sort((a, b) => (a.id < b.id ? -1 : 1)),
    progress: { ...(await h.golearn.readingProgress(U, ES_STORY)), listenedSentences: 0 }, // hearing is its own count
  });

  it('a listen between two readings leaves two reading exposures in two sittings, exactly as if it had not happened', async () => {
    expect(40 * MIN).toBeGreaterThanOrEqual(SITTING_GAP_MS); // the premise: read-to-read alone is two sittings
    const withListen = await timeline(true);
    const without = await timeline(false);
    const pecado = await withListen.golearn.getItemState(U, F('pecado'));
    expect(pecado?.reading.exposures).toBe(2);
    expect(new Set((await encountersOf(withListen, U, 'reading')).filter((e) => e.itemId === F('pecado')).map((e) => e.sitting)).size).toBe(2);
    expect((await listeningOf(withListen, U, F('pecado')))?.exposures).toBe(1); // it was heard, in a sitting of its own
    expect(canon(await readingSnapshot(withListen))).toBe(canon(await readingSnapshot(without)));
  });

  it('listening encounters live in their own sitting key space and a rebuild reproduces the state', async () => {
    const h = await timeline(true);
    const heard = (await encountersOf(h, U, 'listening'))[0];
    expect(heard.sitting).toMatch(/^listen:/);
    for (const e of await encountersOf(h, U, 'reading')) expect(e.sitting).not.toMatch(/^listen:/);
    const before = canon((await h.store.learnerItems.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)));
    await h.golearn.rebuild(U);
    expect(canon((await h.store.learnerItems.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)))).toBe(before);
  });

  it('negative: two readings only 10 minutes apart are still one reading sitting (reading sittings are unchanged)', async () => {
    const h = createHarness({ sittingPerSession: false });
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 3, 's1');
    h.advance(10 * MIN);
    await h.view(U, 'es', ES_STORY, 3, 's2');
    expect((await h.golearn.getItemState(U, F('pecado')))?.reading.exposures).toBe(1);
  });
});

// ───────────────────────────── 4 ─────────────────────────────
describe('4 — nothing heard changes a reading measure', () => {
  async function twoLearners() {
    const h = createHarness();
    await h.seed('x', 'honduras-es');
    await h.seed('y', 'honduras-es');
    await buildSpanish(h.store);
    await buildSpanishPrep(h.store);
    await buildSpanishScripture(h.store);
    for (const u of ['x', 'y']) { // both read story-02 and finish it
      await h.viewAll(u, 'es', ES_PREP, 2, 'r1');
      await h.complete(u, 'es', ES_PREP, 'r1');
    }
    // x ALSO heard a sentence of story-01 (reviewed human speech, full coverage), with the transcript shown
    await h.listen('x', 'es', ES_STORY, [3], { session: 'l1', transcript: true });
    return h;
  }
  const noAsOf = <T extends { asOf?: string; userId?: string }>(c: T) => { const { asOf: _a, userId: _u, ...rest } = c; void _a; void _u; return rest; };

  it('a word only heard is still new to reading coverage; the forecast and the recommendations are unchanged', async () => {
    const h = await twoLearners();
    // the hearing registered as hearing ...
    expect((await h.golearn.getItemState('x', F('pecado')))?.listening.level).toBe('encountered');
    expect((await h.golearn.getItemState('x', F('pecado')))?.reading.level).toBe('unseen');
    // ... and moved no reading measure
    const cx = await h.golearn.coverage('x', ES_STORY);
    const cy = await h.golearn.coverage('y', ES_STORY);
    expect(noAsOf(cx)).toEqual(noAsOf(cy));
    expect(cx.newItems.map((n) => n.itemId)).toContain(F('pecado'));
    expect(cx.partialCoverage).toBe(cy.partialCoverage);
    const fx = await h.golearn.predictDifficulty('x', ES_STORY);
    const fy = await h.golearn.predictDifficulty('y', ES_STORY);
    expect({ ...fx, coverage: noAsOf(fx.coverage), userId: '' }).toEqual({ ...fy, coverage: noAsOf(fy.coverage), userId: '' });
    expect(fx.newUsefulWords.concat(fx.rareWords, fx.properNouns).map((i) => i.surface)).toContain('pecado');
    const rx = await h.golearn.recommend('x', { limit: 10 });
    const ry = await h.golearn.recommend('y', { limit: 10 });
    expect(rx).toEqual(ry);
    expect(rx.flatMap((r) => r.reinforces)).not.toContain(F('pecado'));
  });

  it('reading gaps: hearing a word (even with help) does not make it exposed or needing help', async () => {
    const h = createHarness();
    await buildSpanishPrep(h.store);
    await buildSpanishScripture(h.store);
    await h.listen('gx', 'es', ES_PREP, [0, 1], { session: 'l1', translation: true }); // mundo, amo, ama … heard with the translation shown
    const gx = await h.golearn.scriptureReadiness('gx', ES_JOHN);
    const gy = await h.golearn.scriptureReadiness('gy', ES_JOHN);
    expect((await listeningOf(h, 'gx', F('mundo')))?.assisted).toBeGreaterThan(0);
    const status = (r: typeof gx, w: string) => r.gaps.find((g) => g.surface === w)?.status;
    expect(status(gx, 'mundo')).toBe('unseen');
    expect(gx.gaps).toEqual(gy.gaps);
    expect(gx.coverage.unseenCoverage).toBe(gy.coverage.unseenCoverage);
  });

  it('relatedSeen counts forms READ, not forms heard', async () => {
    const h = await world();
    await h.listen(U, 'es', ES_STORY, [0]); // heard "creo"
    const cree = { itemId: F('cree'), lang: 'es' as const };
    expect((await h.golearn.queryItem(U, cree)).relatedSeen).toBe(false);
    await h.view(U, 'es', ES_STORY, 0, 's1'); // now read it
    expect((await h.golearn.queryItem(U, cree)).relatedSeen).toBe(true);
  });

  it('the rank reinforcement and the item row still describe the hearing for display (encounterCount counts both modalities)', async () => {
    const h = await world();
    await h.listen(U, 'es', ES_STORY, [3]);
    const row = (await h.golearn.getItemState(U, F('pecado')))!;
    expect(row.encounterCount).toBe(1); // display: met once, in any modality
    expect(row.reading.level).toBe('unseen');
    const cands: RankCandidate[] = [{ profile: profile('text:es:cand', [['pecado', 50], ['dios', 50]]), published: true, rights: 'verified-public-domain' }];
    const ranked = await h.golearn.rankLibrary(U, cands, {});
    expect(ranked[0].profile.metShare).toBe(0); // heard is not met for a reader
    expect(ranked[0].profile.newShare).toBeCloseTo(1, 6);
  });
});

// ───────────────────────────── 5 ─────────────────────────────
describe('5 — credit only the sentences heard', () => {
  const credited = async (h: Harness, user: string) => {
    const out: number[] = [];
    for (let i = 0; i < 5; i++) if (await listeningOf(h, user, F(`w${i}`))) out.push(i);
    return out;
  };

  it('one sentence at 0.8 of its time is credited', async () => {
    const h = createHarness();
    const five = await buildFive(h);
    await h.listen('one', 'es', five, [0], { ratio: 0.8 });
    expect(await credited(h, 'one')).toEqual([0]);
  });

  it('five sentences at 0.8: nothing is credited, the audit says partial-passage', async () => {
    const h = createHarness();
    const five = await buildFive(h);
    await h.listen('p80', 'es', five, [0, 1, 2, 3, 4], { ratio: 0.8 });
    await h.listen('p97', 'es', five, [0, 1, 2, 3, 4], { ratio: 0.97 });
    expect(await credited(h, 'p80')).toEqual([]);
    expect(await credited(h, 'p97')).toEqual([]);
    expect(await excludedReasons(h, 'p80')).toEqual(['partial-passage']);
  });

  it('five sentences heard essentially completely (>= 0.98, and 1.0) credit all five', async () => {
    const h = createHarness();
    const five = await buildFive(h);
    await h.listen('p100', 'es', five, [0, 1, 2, 3, 4], { ratio: 1 });
    await h.listen('p98', 'es', five, [0, 1, 2, 3, 4], { ratio: 0.98 });
    expect(await credited(h, 'p100')).toEqual([0, 1, 2, 3, 4]);
    expect(await credited(h, 'p98')).toEqual([0, 1, 2, 3, 4]);
  });

  it('heardSentenceIds credits exactly those, ignoring the passage ratio rule', async () => {
    const h = createHarness();
    const five = await buildFive(h);
    await h.listen('two', 'es', five, [0, 1, 2, 3, 4], { ratio: 0.8, heard: [0, 1] });
    expect(await credited(h, 'two')).toEqual([0, 1]);
    expect(await excludedReasons(h, 'two')).toEqual([]);
    // the observation is still required, and a sentence outside the passage is a mismatch
    await h.listen('forged', 'es', five, [0, 1], { ratio: 1, heard: [0, 4] });
    await h.listen('unobs', 'es', five, [0, 1, 2, 3, 4], { unobserved: true, heard: [0, 1] });
    expect(await credited(h, 'forged')).toEqual([]);
    expect(await excludedReasons(h, 'forged')).toEqual(['sentence-mismatch']);
    expect(await credited(h, 'unobs')).toEqual([]);
  });
});

// ───────────────────────────── 6 ─────────────────────────────
describe('6 — state follows the log, not later store edits', () => {
  async function heard() {
    const h = await world();
    await h.listen(U, 'es', ES_STORY, [0]);
    const ev = (await h.store.events.where('userId', U)).find((e) => e.type === 'AudioSegmentCompleted') as Extract<DomainEvent, { type: 'AudioSegmentCompleted' }>;
    const asset = (await h.store.audioAssets.get(ev.assetId!))!;
    return { h, asset };
  }
  const state = async (h: Harness) => canon([
    (await h.store.learnerItems.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)),
    (await h.store.encounters.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)),
  ]);

  it('a legitimate later edit of the descriptive fields does not orphan history', async () => {
    const { h, asset } = await heard();
    await h.store.audioAssets.put({ ...asset, narratorOrVoiceId: 'renamed narrator', locale: 'es-HN', variety: 'es-HN', qualityState: 'approved' });
    await h.golearn.rebuild(U);
    expect((await listeningOf(h, U, F('creo')))?.exposures).toBe(1);
    expect(await excludedReasons(h, U)).toEqual([]);
  });

  it('a change of what was heard (the source kind) or a downgrade of the human review does orphan it', async () => {
    const { h, asset } = await heard();
    await h.store.audioAssets.put({ ...asset, qualityState: 'machine_checked' });
    await h.golearn.rebuild(U);
    expect(await encountersOf(h, U)).toEqual([]);
    expect(await excludedReasons(h, U)).toEqual(['machine-checked-audio']);
    await h.store.audioAssets.put({ ...asset, sourceType: 'licensed-recording' });
    await h.golearn.rebuild(U);
    expect(await encountersOf(h, U)).toEqual([]);
    expect(await excludedReasons(h, U)).toEqual(['unknown-asset']);
  });

  it('revoking the recording rights and calling invalidateListening leaves live state equal to a full rebuild, with no stale encounter', async () => {
    const { h, asset } = await heard();
    await h.view(U, 'es', ES_STORY, 3, 'r1'); // some reading beside it, which must survive
    expect((await listeningOf(h, U, F('creo')))?.exposures).toBe(1);
    await h.store.audioAssets.put({ ...asset, rights: { ...asset.rights!, status: 'revoked' as const } });
    expect((await listeningOf(h, U, F('creo')))?.exposures).toBe(1); // derived state is stale until GoListen says something changed
    expect(await h.golearn.invalidateListening('text:es:another-text')).toEqual([]); // nobody heard that one: nothing rebuilt
    expect((await listeningOf(h, U, F('creo')))?.exposures).toBe(1);
    expect(await h.golearn.invalidateListening(ES_STORY)).toEqual([U]);
    expect(await h.golearn.getItemState(U, F('creo'))).toBeUndefined(); // only ever heard, now not lawful: gone
    expect((await h.golearn.getItemState(U, F('pecado')))?.reading.exposures).toBe(1); // reading kept
    const live = await state(h);
    await h.golearn.rebuild(U);
    expect(await state(h)).toBe(live);
    expect(await excludedReasons(h, U)).toEqual(['rights-not-cleared']);
    // granting the rights again and invalidating brings the hearing back (the event was never deleted)
    await h.store.audioAssets.put(asset);
    expect(await h.golearn.invalidateListening()).toEqual([U]);
    expect((await listeningOf(h, U, F('creo')))?.exposures).toBe(1);
  });
});

// ───────────────────────────── 7 ─────────────────────────────
describe('7 — a visible transcript is sentence-level help', () => {
  /** "creo" heard help-free in four separate sittings (an estimate), then a fifth time with `last` shown. */
  async function fifth(last: { transcript?: boolean; translation?: boolean }) {
    const h = await world();
    for (const s of ['l1', 'l2', 'l3', 'l4']) await h.listen(U, 'es', ES_STORY, [0], { session: s });
    expect((await listeningOf(h, U, F('creo')))?.estimatedFamiliar).toBe(true);
    await h.listen(U, 'es', ES_STORY, [0], { session: 'l5', ...last });
    return h;
  }

  it('the encounter is assisted, but it does not veto the item estimate', async () => {
    const h = await fifth({ transcript: true });
    const creo = (await listeningOf(h, U, F('creo')))!;
    expect(creo.estimatedFamiliar).toBe(true);
    expect(creo.assisted).toBe(1);
    expect(creo.unassisted).toBe(4);
    const last = (await encountersOf(h, U, 'listening')).filter((e) => e.itemId === F('creo')).sort((a, b) => (a.at < b.at ? -1 : 1)).pop()!;
    expect(last.assistance).toBe(2);
    expect(last.evidenceKind).toBe('assisted');
    expect((last as { itemHelp?: number }).itemHelp).toBeUndefined();
  });

  it('a revealed translation behaves the same (it always did)', async () => {
    const h = await fifth({ translation: true });
    expect((await listeningOf(h, U, F('creo')))?.estimatedFamiliar).toBe(true);
  });

  it('the transcript encounter is not a help-free exposure either: it adds nothing toward an estimate', async () => {
    const h = await world();
    for (const s of ['l1', 'l2', 'l3']) await h.listen(U, 'es', ES_STORY, [0], { session: s });
    await h.listen(U, 'es', ES_STORY, [0], { session: 'l4', transcript: true });
    expect((await listeningOf(h, U, F('creo')))?.estimatedFamiliar).toBe(false); // 3 help-free, not 4
  });

  it('negative: item-targeted help while READING still vetoes that item', async () => {
    const h = await world();
    for (const s of ['r1', 'r2', 'r3', 'r4']) await h.view(U, 'es', ES_STORY, 0, s);
    expect((await h.golearn.getItemState(U, F('creo')))?.reading.estimatedFamiliar).toBe(true);
    await h.view(U, 'es', ES_STORY, 0, 'r5');
    await h.help(U, 'es', ES_STORY, 0, 1, F('creo'), 1, 'r5');
    expect((await h.golearn.getItemState(U, F('creo')))?.reading.estimatedFamiliar).toBe(false);
  });
});

// ───────────────────────────── 8 ─────────────────────────────
describe('8 — listening-assessment texts never surface', () => {
  async function secret(h: Harness, marked: boolean) {
    await buildFixtureText(h.store, {
      lang: 'es', slug: 'secret', kind: 'story', title: 'Secreto', published: true,
      sentences: [{ tokens: [{ surface: 'zzsecreto', lemma: 'zzsecreto', pos: 'NOUN' as const }, { surface: 'dios', lemma: 'Dios', pos: 'PROPN' as const }] }],
    });
    const text = (await h.store.texts.get('text:es:secret'))!;
    await h.store.texts.put(marked ? { ...text, listeningAssessmentId: 'protected-check' } : { ...text, listeningAssessmentId: undefined });
    return 'text:es:secret';
  }
  const bare = async () => { const h = createHarness(); await h.seed(U, 'honduras-es'); return h; };

  it('recommend', async () => {
    for (const marked of [false, true]) {
      const h = await bare();
      const id = await secret(h, marked);
      const withUnpublished = await h.golearn.recommend(U, { includeUnpublished: true });
      const recs = await h.golearn.recommend(U);
      expect(recs.some((r) => r.textId === id), `marked=${marked}`).toBe(!marked);
      expect(withUnpublished.some((r) => r.textId === id), `marked=${marked} preview`).toBe(!marked);
    }
  });

  it('rankLibrary', async () => {
    for (const marked of [false, true]) {
      const h = await bare();
      const id = await secret(h, marked);
      const ranked = await h.golearn.rankLibrary(U, [
        { profile: profile(id, [['zzsecreto', 5]]), published: true, rights: 'verified-public-domain' },
        { profile: profile('text:es:not-imported', [['zzsecreto', 5]]), published: true, rights: 'verified-public-domain' },
      ], {});
      expect(ranked.map((r) => r.textId), `marked=${marked}`).toEqual(marked ? ['text:es:not-imported'] : expect.arrayContaining([id, 'text:es:not-imported']));
    }
  });

  it('findOccurrences', async () => {
    for (const marked of [false, true]) {
      const h = await bare();
      const id = await secret(h, marked);
      const hits = await h.golearn.findOccurrences({ lang: 'es', itemId: F('zzsecreto'), includeUnpublished: true });
      expect(hits.map((x) => x.textId), `marked=${marked}`).toEqual(marked ? [] : [id]);
    }
  });

  it('predictDifficulty', async () => {
    const control = await bare();
    expect((await control.golearn.predictDifficulty(U, await secret(control, false))).textId).toBe('text:es:secret');
    const h = await bare();
    await expect(h.golearn.predictDifficulty(U, await secret(h, true))).rejects.toThrow(/protected listening-assessment/);
  });
});

// ───────────────────────────── policy bump ─────────────────────────────
describe('the evidence@8 bump leaves a reading-only learner untouched', () => {
  it('state stamped evidence@7 is rebuilt by ensureCurrent into byte-identical encounters, items, progress and coverage', async () => {
    const h = createHarness();
    await h.seed(U, 'honduras-es');
    await buildSpanish(h.store);
    await buildSpanishPrep(h.store);
    await h.understood(U, 'es', ES_STORY, [0, 1], 's1');
    await h.view(U, 'es', ES_STORY, 2, 's2');
    await h.help(U, 'es', ES_STORY, 2, 1, F('creo'), 2, 's2');
    await h.rescue(U, 'es', ES_STORY, [3], 's3');
    await h.viewAll(U, 'es', ES_PREP, 2, 's4');
    await h.complete(U, 'es', ES_STORY, 's4');
    await h.produce(U, 'es', F('creo'), 'independent');
    const snapshot = async () => ({
      encounters: (await h.store.encounters.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1)),
      items: withoutHeadCache((await h.store.learnerItems.where('userId', U)).sort((a, b) => (a.id < b.id ? -1 : 1))),
      progress: await h.golearn.readingProgress(U, ES_STORY),
      coverage: [await h.golearn.coverage(U, ES_STORY), await h.golearn.coverage(U, ES_PREP)],
    });
    const before = await snapshot();
    expect(before.items.length).toBeGreaterThan(0);
    await h.store.meta.put({ id: `golearn.policy:${U}`, value: 'evidence@7', updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(await h.golearn.ensureCurrent(U)).toBe(true); // the bump triggers a rebuild ...
    expect((await h.store.meta.get(`golearn.policy:${U}`))?.value).toBe('evidence@8');
    expect(canon(await snapshot())).toBe(canon(before)); // ... learner state and its audit outputs do not change
    expect(canon(await snapshot())).toBe(canon(before)); // byte for byte, key order aside for a reading-only learner
  });
});
