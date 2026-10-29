// @vitest-environment node
/**
 * Offline / failure audit — "what works offline" (brief §23), one capability at a time, with the network cut at the boundary.
 * Each capability is answered "works", "degraded" or "needs connection" by a test whose title says which; OFFLINE-FAILURE.md quotes
 * these titles. Real pieces throughout (worker, pack runtime with the real dictionary files, GoListen, GoTell, GoReview context,
 * the Repository service); only `fetch` is cut.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { defaultPacks } from '../../packages/golearn-extension/src/background/gloss';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { createStorageEncounterStore } from '../../packages/golearn-extension/src/store';
import { createPackRuntime, installPack, packFor, verifyInstalled } from '../../packages/language-packs/src';
import { albanianRegistry, createGoListen } from '../../packages/golisten/src';
import {
  createAnalyzer, createDraftStore, createLocalDraftStore, createSyncingDraftStore, exportDraft, exportLearnerWriting, newVersion, type DraftRecord,
} from '../../packages/gotell/src';
import { createMemoryArea } from '../../packages/repository-sync/src';
import {
  PASSWORD, createNet, createPracticeDevice, createStack, lookup, serverEvents, signUp, type Learner, type Stack,
} from './privacy.support';
import { accountFor, createReviewRig, createWorkerRig, fileFetch } from './offline.support';

const stacks: Stack[] = [];
const make = (): Stack => { const s = createStack('sqlite'); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

const SENTENCE = 'Fëmijët lexojnë librin.';
const down = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;

describe('reading assistance (GoLearn) with the pack on the device', () => {
  /** The real packs and the real dictionary files, served while the network is up. */
  async function reader() {
    const s = make();
    const net = createNet(s);
    const a = await accountFor(s, 'ana@example.com');
    const dictionary = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (u.includes('/dict/')) { if (net.down) throw new TypeError('Failed to fetch'); return fileFetch(input); }
      return net.fetch(input, init);
    }) as typeof fetch;
    const rig = createWorkerRig(s, net, { packs: defaultPacks, fetch: dictionary });
    expect((await rig.connect(a.email)).ok).toBe(true);
    return { s, net, a, rig };
  }

  it('WORKS offline: the card itself (lemma, morphology, constructions, phrase notes) is computed on the device by the pack\'s analyser; it needs no network at all', () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => { calls++; return down(...args); }) as typeof fetch;
    try {
      const at = SENTENCE.indexOf('librin');
      const card = parseSelection({ surface: 'librin', context: { kind: 'sentence', confidence: 0.9, sentence: SENTENCE, selStart: at, selEnd: at + 6 } });
      expect(card.lemma).toMatch(/libër/);
      expect(card.constructions.some((c) => c.unitId.startsWith('morph:sq:NOUN'))).toBe(true);
      expect(card.itemIds.length).toBeGreaterThan(0);
    } finally { globalThis.fetch = original; }
    expect(calls).toBe(0);
  });

  it('WORKS offline: the grammar explanations of the card come from the pack manifest in the bundle (no fetch)', async () => {
    const { net, rig } = await reader();
    net.down = true;
    const r = await rig.content({ type: 'golearn:explain', languageId: 'sq', features: { Case: 'Acc', Definite: 'Def' }, constructionIds: [] });
    expect(r.ok).toBe(true);
    expect(r.source).toBe('pack');
    expect(r.features.some((f: { explanation?: string }) => !!f.explanation)).toBe(true);
  });

  it('WORKS offline: a dictionary gloss for a word whose shard was fetched once, even after the worker restarts', async () => {
    const { net, rig } = await reader();
    const online = await rig.content({ type: 'golearn:gloss', lemma: 'libër', languageId: 'sq' });
    expect(online).toMatchObject({ ok: true, found: true });
    net.down = true;
    rig.restart();                                                                   // memory gone, storage kept
    const offline = await rig.content({ type: 'golearn:gloss', lemma: 'libër', languageId: 'sq' });
    expect(offline).toMatchObject({ ok: true, found: true });
    expect(offline.senses).toEqual(online.senses);
    expect(offline.attribution).toBe(online.attribution);                             // and the licence line is not lost with the network
  });

  it('DEGRADED offline: a gloss from a dictionary shard never fetched says "offline" and the card shows the analysis without a gloss (no error, no invented meaning)', async () => {
    const { net, rig } = await reader();
    net.down = true;
    const r = await rig.content({ type: 'golearn:gloss', lemma: 'libër', languageId: 'sq' });
    expect(r.ok).toBe(true);
    expect(r.found).toBe(false);
    expect(r.senses).toEqual([]);
    expect(r.reason).toBe('offline');                                                // (the shard fetch failed inside the runtime: reported as offline, audit O-07)
  });

  // DEFECT O-07: when the dictionary shard cannot be fetched, the pack runtime swallows the failure and the gloss service answers
  // reason 'not-found' ("this word is not in the dictionary"), never 'offline'. The reply path for 'offline' exists in gloss.ts but is
  // unreachable, so the card cannot tell "the word is unknown" from "you are offline, try again".
  it('O-07 (fixed): a gloss that failed only because the network is down is reported as "offline", not as "not found"', async () => {
    const { net, rig } = await reader();
    net.down = true;
    const r = await rig.content({ type: 'golearn:gloss', lemma: 'libër', languageId: 'sq' });
    expect(r.reason).toBe('offline');
  });

  it('DEGRADED offline: the learner-model line of the card (what you know of this word) is the last cached answer, marked stale, or absent; the card never waits for it', async () => {
    const { s, net, a, rig } = await reader();
    expect((await a.api.appendEvents([{ ...lookup(a), kind: 'CardReviewed', producer: { app: 'gopractice-review', version: '1', deviceId: a.deviceId }, subject: { itemIds: ['lemma:sq:libër:NOUN'], cardId: 'c' }, payload: { cardKind: 'recognition', grade: 'good', correct: true, hinted: false } }])).ok).toBe(true);
    const fresh = await rig.content({ type: 'golearn:profile', unitIds: ['lemma:sq:libër:NOUN'], languageId: 'sq' });
    expect(Object.keys(fresh.rows)).toContain('lemma:sq:libër:NOUN');
    net.down = true;
    rig.advance(30 * 60_000);                                                        // the 10-minute cache lifetime has passed
    const stale = await rig.content({ type: 'golearn:profile', unitIds: ['lemma:sq:libër:NOUN'], languageId: 'sq' });
    expect(stale.ok).toBe(true);
    expect(stale.stale).toBe(true);
    expect(stale.error).toBe('offline');
    expect(Object.keys(stale.rows)).toContain('lemma:sq:libër:NOUN');                // the old answer, flagged
    const never = await rig.content({ type: 'golearn:profile', unitIds: ['lemma:sq:shtëpi:NOUN'], languageId: 'sq' });
    expect(never.ok).toBe(true);
    expect(never.rows).toEqual({});                                                  // nothing cached: no row, no crash
    expect(s.logs.length).toBeGreaterThan(0);
  });

  it('NEEDS CONNECTION: signing in the first time (the password goes to the service); the learner gets a plain message, nothing is stored', async () => {
    const s = make();
    const net = createNet(s);
    const a = await accountFor(s, 'ana@example.com');
    const rig = createWorkerRig(s, net);
    net.down = true;
    const r = await rig.connect(a.email);
    expect(r).toMatchObject({ ok: false, error: 'unreachable' });
    expect(r.message).toMatch(/could not reach the service/i);
    expect(await rig.storageText()).not.toContain('golearn:session');
    expect(await rig.storageText()).not.toContain('correct horse');
  });

  it('WORKS offline: a learner who is already signed in keeps reading and recording; the session is only needed when events are sent', async () => {
    const { net, a, rig } = await reader();
    net.down = true;
    const r = await rig.recordLookup();
    expect(r.reply).toMatchObject({ ok: true, attributed: 'account' });
    expect((await rig.page({ type: 'golearn:status' })).connected).toBe(true);
    expect(await createStorageEncounterStore(rig.fake.local as never).count()).toBe(1);   // and the local copy the learner can read exists
    expect(a.learnerId).toBeTruthy();
  });
});

// (Encounter capture offline is proved in offline.sync.test.ts: "no connection: a GoLearn encounter is queued durably and sent exactly once", 4 tests per store.)
describe('the review session', () => {
  it('WORKS offline: a review session of written exercises, built from the pack on the device; answers queue and are sent on return', async () => {
    const s = make();
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const rig = await createReviewRig(s, net, a);
    await rig.seedDeck(['written-recognition']);
    const plan = await rig.plan();
    net.down = true;
    const runner = rig.runner(plan, { facts: 'offline' });
    let done = 0;
    while (await rig.answerRight(runner)) done++;
    expect(done).toBe(plan.items.length);
    expect(await rig.device.queue.size()).toBe(done);
    net.down = false;
    rig.device.clock.ms += 120_000;
    expect((await rig.device.client.syncOnce()).ok).toBe(true);
    expect((await serverEvents(s, a.learnerId)).filter((e) => e.kind === 'CardReviewed' || e.kind === 'AssessmentAnswered').length).toBe(done);
  });

  it('NEEDS CONNECTION: building tomorrow\'s plan from the Repository\'s candidates (GET /candidates) — the planner\'s intake step; the deck-only plan still works', async () => {
    const s = make();
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'phone');
    net.down = true;
    const r = await net.api(a.token).candidates(a.enrolmentId, 10).then(() => 'answered', () => 'unreachable');
    expect(r).toBe('unreachable');
    const rig = await (async () => { net.down = false; return createReviewRig(s, net, a); })();
    await rig.seedDeck(['written-recognition']);
    net.down = true;
    const plan = await rig.plan();                                                   // the deck is folded from events and needs no candidates
    expect(plan.items.length).toBeGreaterThan(0);
  });
});

describe('listening (GoListen)', () => {
  const deviceVoice = {
    getVoices: () => [{ name: 'Test Albanian', lang: 'sq-AL', localService: true, voiceURI: 'test-sq' }],
    speak(u: { text?: string; onend: (() => void) | null }) { setTimeout(() => u.onend?.(), 1); },
    cancel() {}, pause() {}, resume() {},
  };
  const utterance = (t: string) => ({ text: t, lang: '', rate: 1, voice: null, onend: null, onerror: null });

  it('WORKS offline (when a local voice exists): speaking a word with an installed device voice; the voice is labelled synthetic, so it is practice and never evidence', async () => {
    const listen = createGoListen({ registries: [albanianRegistry()], consent: () => ({ remoteSpeech: true }), speech: deviceVoice, fetch: down as never, utterance });
    const r = await listen.pronounce({ languageId: 'sq', text: 'libër', kind: 'word', autoplay: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.voice.synthetic).toBe(true);
  });

  it('NEEDS CONNECTION: the remote (Azure) voices, even with consent: the status check fails and they are reported unavailable', async () => {
    const listen = createGoListen({ registries: [albanianRegistry()], consent: () => ({ remoteSpeech: true }), speech: { getVoices: () => [], speak() {}, cancel() {}, pause() {}, resume() {} }, fetch: down as never });
    const a = await listen.availability('sq');
    expect(a.voices.filter((v) => v.provider === 'remote').every((v) => v.state === 'unavailable')).toBe(true);
  });

  it('DEGRADED always for Albanian today: with no recording and no device voice, listening items are not offered at all — online or offline (the full test is "speech synthesis unavailable" in offline.review.test.ts)', async () => {
    const listen = createGoListen({ registries: [albanianRegistry()], consent: () => ({ remoteSpeech: false }), speech: { getVoices: () => [], speak() {}, cancel() {}, pause() {}, resume() {} } });
    expect((await listen.availability('sq')).canPronounce).toBe(false);
  });
});

describe('GoTell writing and analysis', () => {
  const manifest = packFor('sq')!;
  const idOf = (w: Learner) => ({ learnerId: w.learnerId, enrolmentId: w.enrolmentId, deviceId: w.deviceId, languageId: 'sq' });
  const rec = (s: Stack, who: Learner, body: string): DraftRecord => newVersion(
    { draftId: 'm1', languageId: 'sq', mode: 'free', title: 'T', text: '', versions: [], assistance: [], createdAt: s.clock.now(), updatedAt: s.clock.now() },
    body, () => ({ authorship: 'independent', assistance: [] }), who.deviceId, () => new Date(s.clock.ms()));

  it('WORKS offline: checking a draft (grammar issues, hints, corrections, alternatives) — the checker is the pack\'s adapter on the device; only glosses need the dictionary', () => {
    const runtime = createPackRuntime(manifest, { fetch: down, baseUrl: 'http://assets.local/' });
    const analyzer = createAnalyzer({ languageId: 'sq', runtime, manifest, now: () => new Date('2026-10-09T08:00:00.000Z') });
    const a = analyzer.analyzeDraft('m1', 'Unë shkoj te libër.', undefined);
    expect(a.sentences[0].issues[0].category).toBe('definiteness');
    expect(a.sentences[0].corrections.length).toBeGreaterThan(0);
  });

  it('WORKS offline: writing and autosaving; the draft is on the device and waits to be pushed', async () => {
    const s = make();
    const net = createNet(s);
    const w = await signUp(s, 'ana@example.com', 'phone');
    net.down = true;
    const local = createLocalDraftStore(createMemoryArea(), { identity: idOf(w), now: () => new Date(s.clock.ms()) });
    const syncing = createSyncingDraftStore({ local, remote: createDraftStore({ api: net.api(w.token), identity: idOf(w), now: () => new Date(s.clock.ms()) }), now: () => new Date(s.clock.ms()) });
    expect((await syncing.save(rec(s, w, 'Unë lexoj librin.'), 0)).ok).toBe(true);
    expect(await syncing.pendingPush()).toEqual(['m1']);
    expect((await syncing.load('m1'))!.record.text).toBe('Unë lexoj librin.');
  });

  it('NEEDS CONNECTION: the account\'s copy of a draft — saving to the account, opening a draft from another device — and a remote assistant (consent and network)', async () => {
    const s = make();
    const net = createNet(s);
    const w = await signUp(s, 'ana@example.com', 'phone');
    const remote = createDraftStore({ api: net.api(w.token), identity: idOf(w), now: () => new Date(s.clock.ms()) });
    expect((await remote.save(rec(s, w, 'Unë lexoj.'), 0)).ok).toBe(true);
    net.down = true;
    await expect(remote.list()).rejects.toThrow();
    await expect(remote.load('m1')).rejects.toThrow();
    await expect(remote.save(rec(s, w, 'Unë lexoj librin.'), 1)).rejects.toThrow();
  });

  it('DEGRADED offline: deleting a draft — it disappears on this device at once, but the account\'s copy is deleted only when the connection returns (it is "pending", not "done")', async () => {
    const s = make();
    const net = createNet(s);
    const w = await signUp(s, 'ana@example.com', 'phone');
    const local = createLocalDraftStore(createMemoryArea(), { identity: idOf(w), now: () => new Date(s.clock.ms()) });
    const syncing = createSyncingDraftStore({ local, remote: createDraftStore({ api: net.api(w.token), identity: idOf(w), now: () => new Date(s.clock.ms()) }), now: () => new Date(s.clock.ms()) });
    expect((await syncing.save(rec(s, w, 'PRIVATE-TEXT-4402 lexoj.'), 0)).ok).toBe(true);
    net.down = true;
    await syncing.remove('m1');
    expect(await local.load('m1')).toBeUndefined();                                  // gone here
    expect(await syncing.pendingPush()).toEqual(['m1']);                             // but the deletion is queued
    const still = await w.api.getDocument('m1');
    expect(still.ok && still.data.document.body).toContain('PRIVATE-TEXT-4402');     // and the account still holds the text
    net.down = false;
    await syncing.push();
    expect((await w.api.getDocument('m1')).ok).toBe(false);
    expect(await syncing.pendingPush()).toEqual([]);
  });
});

describe('export', () => {
  it('WORKS offline: the draft the learner is looking at exports as json / text / markdown from the device', () => {
    const record: DraftRecord = newVersion(
      { draftId: 'e1', languageId: 'sq', mode: 'free', title: 'Eksport', text: '', versions: [], assistance: [], createdAt: '2026-10-09T08:00:00.000Z', updatedAt: '2026-10-09T08:00:00.000Z' },
      'Unë lexoj librin.', () => ({ authorship: 'independent', assistance: [] }), 'dev', () => new Date('2026-10-09T08:00:00.000Z'));
    for (const format of ['json', 'text', 'markdown'] as const) expect(exportDraft(record, format)).toContain('Unë lexoj librin.');
  });

  it('WORKS offline: GoLearn\'s local copy of the learner\'s own events (what the device holds) is readable and exportable', async () => {
    const s = make();
    const net = createNet(s);
    const a = await accountFor(s, 'ana@example.com');
    const rig = createWorkerRig(s, net);
    await rig.connect(a.email);
    net.down = true;
    await rig.recordLookup();
    const rows = JSON.parse(await createStorageEncounterStore(rig.fake.local as never).exportRows()) as Array<{ kind: string; learnerId: string }>;
    expect(rows.map((r) => r.kind)).toContain('SelectionLookedUp');
    expect(rows.every((r) => r.learnerId === a.learnerId)).toBe(true);
  });

  it('NEEDS CONNECTION: the complete account export (GET /export) and the export of ALL writing (the account\'s documents): both say plainly that the service cannot be reached', async () => {
    const s = make();
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'phone');
    expect((await a.api.putDocument('d1', { languageId: 'sq', kind: 'draft', body: 'x', title: 't' }, 0)).ok).toBe(true);
    net.down = true;
    await expect(net.api(a.token).exportAll()).rejects.toThrow(/Failed to fetch/);
    const out = await exportLearnerWriting(net.api(a.token));
    expect(out).toMatchObject({ ok: false });
    if (!out.ok) expect(out.message).toMatch(/cannot be reached/i);
  });

  it('DEGRADED offline: a GoReview device lets the learner see what is waiting to be sent (pending count) but has no whole-account export (that is the service\'s)', async () => {
    const s = make();
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'setup');
    const dev = createPracticeDevice(net);
    expect((await dev.ctx.signIn({ email: a.email, password: PASSWORD })).ok).toBe(true);
    net.down = true;
    const id = (await dev.ctx.identity())!;
    await dev.ctx.record([lookup(id)]);
    await dev.ctx.syncNow({ force: true });
    expect((await dev.ctx.syncView()).status?.pending).toBe(1);
  });
});

describe('language packs on the device', () => {
  it('WORKS offline: knowing whether the pack is installed and current (a storage read); NEEDS CONNECTION: installing or updating it (the dictionary is fetched and checked)', async () => {
    const rows = new Map<string, unknown>();
    const storage = { get: (k: string) => rows.get(k), set: (k: string, v: unknown) => { rows.set(k, structuredClone(v)); } };
    const m = packFor('sq')!;
    const r = await installPack(m, { fetch: fileFetch, baseUrl: 'http://assets.local/', storage });
    expect(r.ok).toBe(true);
    expect(await verifyInstalled(m, storage)).toMatchObject({ installed: true, current: true });          // no network involved
    const rows2 = new Map<string, unknown>();
    const offline = await installPack(m, { fetch: down, baseUrl: 'http://assets.local/', storage: { get: (k: string) => rows2.get(k), set: (k: string, v: unknown) => { rows2.set(k, v); } } });
    expect(offline).toMatchObject({ ok: false, reason: 'dictionary-unreachable' });
    expect(rows2.size).toBe(0);
  });
});
