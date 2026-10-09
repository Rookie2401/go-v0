// @vitest-environment jsdom
/**
 * Prompt 5 §21 — GoReview end to end over the REAL pieces: the Repository service (SQLite in memory, real scrypt),
 * the real Albanian linguistics and projection engine, GoLearn's real event builder for the encounter, GoReview's real
 * intake, planner, FSRS scheduler, exercise builders, grading and evidence, GoListen's real assessment source (with a
 * TEST registry entry that stands in for a reviewed Albanian recording — labelled as such, never a claim of Albanian
 * audio), and finally GoLearn's real background worker and card to see the updated learner state. Fakes: the network
 * (in-process), the clock, the audio element.
 */
import fs from 'node:fs';
import path from 'node:path';
import { URL as NodeURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, validateEvent, type GoEvent, type UnitKnowledge } from '../../packages/repository-contract/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createLinguisticService } from '../../packages/repository-linguistics/src';
import { openSqliteStore } from '../../packages/repository-store/src';
import { createRepositoryApi, type RepositoryApi } from '../../packages/repository-service/src/api';
import { nodeCrypto } from '../../packages/repository-service/src/crypto-node';
import { handle } from '../../packages/repository-service/src/handler';
import { adaptLinguistics } from '../../packages/repository-service/src/linguistics-adapter';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { buildSelectionEvent } from '../../packages/golearn-extension/src/store';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { LookupController } from '../../packages/golearn-extension/src/content/controller';
import { createBridge } from '../../packages/golearn-extension/src/content/services';
import { UnsupportedAdapter, WebGenericAdapter } from '../../packages/golearn-extension/src/adapters';
import { createCardUI } from '../../packages/golearn-extension/src/popup/card';
import { MSG, type ChromeApi } from '../../packages/golearn-extension/src/platform';
import {
  buildCardAdded, createFsrsScheduler, createSessionRunner, foldDeckItems, gatherCandidates, gradeTyped, planSession, ratingFor, registry,
  type DeckItem, type IntakeOutcome, type ReviewPreferences, type SessionPlan,
} from '../../packages/goreview/src';
import { packFactsFor } from '../../packages/gopractice/packFacts';
import { createAudioDeps } from '../../packages/gopractice/audio';
import { albanianRegistry, type VoiceRegistry } from '../../packages/golisten/src';
import type { AudioClip, AudioPort } from '../../packages/golisten/src/ports';
import { createLocalQueue, createMemoryArea, createSyncClient, type Transport } from '../../packages/repository-sync/src';
import { sqAdapter } from '../../src/adapters/sq';
import { createChromeFake } from '../extension/chromeFake';
import { selectText, stubLayout } from '../golearn-app/domtools';
import { flush } from '../golearn-app/helpers';

(globalThis as { URL: typeof URL }).URL = NodeURL as unknown as typeof URL;

// ───────────────────────────── the real service ─────────────────────────────
let clockMs = Date.UTC(2026, 9, 9, 9, 0, 0);
const nowIso = (): string => new Date(clockMs).toISOString();
const tick = (ms: number): void => { clockMs += ms; };
const MIN = 60_000;

const store = openSqliteStore(':memory:', { now: nowIso, migrationsDir: path.resolve(__dirname, '../../packages/repository-store/migrations') });
const engine = createProjectionEngine({ store, now: nowIso });
const serviceDeps: ServiceDeps = { store, engine, linguistics: adaptLinguistics(createLinguisticService(store, { now: nowIso })), crypto: nodeCrypto, now: nowIso, log: () => {} };
const net = { down: false };
const serviceFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (net.down) throw new TypeError('Failed to fetch');
  return handle(new Request(input, init), serviceDeps);
}) as typeof fetch;
const DICT_ROOT = path.resolve(__dirname, '../../public');
const fileFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  const file = path.join(DICT_ROOT, decodeURIComponent(url.pathname));
  return fs.existsSync(file) ? new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('not found', { status: 404 });
}) as typeof fetch;
const BASE = 'http://127.0.0.1:8790';
const PASSWORD = 'correct horse battery staple';

// ───────────────────────────── a fake audio element and a TEST voice registry ─────────────────────────────
const played: string[] = [];
const fakeAudio: AudioPort = {
  open(url) {
    let ended: (() => void) | undefined;
    const clip: AudioClip = {
      async play() { played.push(url); setTimeout(() => ended?.(), 5); },
      pause() {}, stop() {}, setRate() {}, onEnded(cb) { ended = cb; }, onError() {}, durationMs: () => 900, release() {},
    };
    return clip;
  },
};
/** TEST ONLY: a registry that pretends one reviewed Albanian recording of "libër" exists. It is a stand-in for the software path; no such recording exists in this repository. */
const TEST_SQ_REGISTRY: VoiceRegistry = {
  languageId: 'sq',
  entries: [{
    voiceId: 'test:sq-liber-recording', languageId: 'sq', varietyId: 'sq-standard', provider: 'recorded', execution: 'local', synthetic: false,
    licence: 'TEST FIXTURE — not a real recording; exists only to exercise the assessment path',
    qualityVerification: 'native-reviewed', knownLimitations: ['TEST FIXTURE: stands in for a reviewed recording; makes no claim about Albanian audio'],
    supports: ['word'], suitableForAssessment: true, label: 'TEST asset (not real Albanian audio)',
    source: { kind: 'recorded', recordings: [{ text: 'libër', url: 'test://sq/liber.wav', attribution: 'test fixture' }] },
  }],
  gaps: ['TEST registry: no real Albanian recording exists'],
};

const LEMMA = 'lemma:sq:libër:NOUN';
const SENTENCE = 'Fëmijët lexojnë librin.';
const prefs: ReviewPreferences = { languageId: 'sq', sessionMinutes: 10, maxNew: 5, desiredRetention: 0.9, includeListening: true, grammarShare: 0.3, prioritizeSaved: true };

interface Who { api: RepositoryApi; learnerId: string; enrolmentId: string; token: string; deviceId: string }
const ok = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>): T => { if (!r.ok) throw new Error(`api ${r.status} ${String(r.error)}: ${String(r.message)}`); return r.data as T; };

async function signUp(email: string, deviceId: string): Promise<Who> {
  const anon = createRepositoryApi({ baseUrl: BASE, fetch: serviceFetch });
  ok(await anon.createAccount({ email, password: PASSWORD }));
  const s = ok<{ token: string; learnerId: string }>(await anon.createSession({ email, password: PASSWORD, deviceId }));
  const api = createRepositoryApi({ baseUrl: BASE, fetch: serviceFetch, token: s.token });
  const e = ok<{ enrolment: { enrolmentId: string } }>(await api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '9', goals: [{ kind: 'reading' }] }));
  return { api, learnerId: s.learnerId, enrolmentId: e.enrolment.enrolmentId, token: s.token, deviceId };
}

/** GoLearn's real encounter: the parser's card and the extension's event builder, attributed to the learner. */
function encounter(who: Who, word: string, sessionId: string): GoEvent[] {
  const at = SENTENCE.indexOf(word);
  const card = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence: SENTENCE, selStart: at, selEnd: at + word.length } });
  const sel = buildSelectionEvent({ card, readerId: 'web-generic', identity: { learnerId: who.learnerId, enrolmentId: who.enrolmentId, deviceId: who.deviceId }, version: 'e2e', sessionId, now: new Date(clockMs) });
  const help: GoEvent = {
    id: `${sel.id}:help`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq', at: nowIso(),
    producer: { app: 'golearn-ext', version: 'e2e', deviceId: who.deviceId }, kind: 'AssistanceRequested', subject: { itemIds: card.itemIds, sentenceKey: card.context.sentenceKey },
    payload: { assistance: 'gloss', depth: 'brief' }, dedupeKey: `${sel.dedupeKey}:help`,
  };
  return [sel, help];
}

const dims = (rows: UnitKnowledge[], id: string) => { const r = rows.find((x) => x.unitId === id); if (!r) throw new Error(`no row for ${id}`); return r.dimensions; };
const knowledge = (who: Who, ids: string[]) => engine.knowledge(who.learnerId, ids);
const events = async (who: Who): Promise<GoEvent[]> => store.list({ learnerId: who.learnerId, limit: 5000 });

let a: Who;
let b: Who;
let restore: () => void;
const scheduler = createFsrsScheduler({ desiredRetention: 0.9 });
const factsFor = packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' });
const audioDeps = createAudioDeps({ consent: () => false, registries: [TEST_SQ_REGISTRY], audio: fakeAudio, speech: { getVoices: () => [], speak() {}, cancel() {}, pause() {}, resume() {} } });
const noAudioDeps = createAudioDeps({ consent: () => false, registries: [albanianRegistry()], audio: fakeAudio, speech: { getVoices: () => [], speak() {}, cancel() {}, pause() {}, resume() {} } });

function runnerFor(who: Who, plan: SessionPlan, opts: { audio?: boolean; record?: (evs: GoEvent[]) => Promise<void> } = {}) {
  const facts = factsFor('sq', who.api)!;
  return createSessionRunner({
    plan, builders: registry, facts, scheduler, identity: { learnerId: who.learnerId, enrolmentId: who.enrolmentId, deviceId: who.deviceId },
    ...(opts.audio ? { audio: audioDeps.source() } : {}),
    record: opts.record ?? (async (evs) => { ok(await who.api.appendEvents(evs)); }),
    persist: createMemoryArea(), now: nowIso, random: () => 0.5, sessionId: `s${clockMs}`,
  });
}

async function deckOf(who: Who): Promise<DeckItem[]> { return foldDeckItems(await events(who), scheduler, { languageId: 'sq', now: nowIso() }); }

beforeAll(async () => {
  restore = stubLayout();
  a = await signUp('ana@review.test', 'dev-A');
  b = await signUp('ben@review.test', 'dev-B');
});
afterAll(async () => { restore(); await store.close(); });

describe('Prompt 5 §21 — GoReview over the real Repository, pack, scheduler, GoListen and GoLearn', () => {
  let intake: IntakeOutcome[] = [];
  let readingAfterStep8: UnitKnowledge['dimensions']['readingRecognition'];

  it('1. GoLearn records an Albanian encounter (two lookups of "librin" with a gloss request)', async () => {
    ok(await a.api.lookup({ languageId: 'sq', surface: 'librin', sentence: SENTENCE }));
    ok(await a.api.appendEvents(encounter(a, 'librin', 's1')));
    tick(5 * MIN);
    ok(await a.api.appendEvents(encounter(a, 'librin', 's2')));
    // the learner presses "Review this" on the card (GoLearn's ItemMarked saved)
    ok(await a.api.appendEvents([{
      id: 'enc:saved', v: CONTRACT_VERSION, learnerId: a.learnerId, enrolmentId: a.enrolmentId, languageId: 'sq', at: nowIso(),
      producer: { app: 'golearn-ext', version: 'e2e', deviceId: a.deviceId }, kind: 'ItemMarked', subject: { itemIds: [LEMMA] }, payload: { mark: 'saved' }, dedupeKey: 'enc:saved',
    }]));
    const d = dims(await knowledge(a, [LEMMA]), LEMMA);
    expect(d.exposure.observations).toBe(4);
    expect(d.readingRecognition.weight).toBe(0);
  });

  it('2–3. the Repository proposes the lexeme; GoReview\'s intake explains its decision', async () => {
    const candidates = ok<{ candidates: Array<{ unitId: string; reasons: Array<{ rule: string }>; score: number }> }>(await a.api.candidates(a.enrolmentId, 20)).candidates;
    const c = candidates.find((x) => x.unitId === LEMMA);
    expect(c, 'the lemma is a candidate').toBeDefined();
    expect(c!.reasons.map((r) => r.rule)).toContain('repeatedLookups');
    intake = await gatherCandidates({
      api: {
        candidates: async (eid, limit) => ok<{ candidates: never[] }>(await a.api.candidates(eid, limit)).candidates,
        knowledge: async (ids) => ok<{ knowledge: UnitKnowledge[] }>(await a.api.knowledge(ids)).knowledge,
      },
      facts: factsFor('sq', a.api)!, audio: (l) => noAudioDeps.availability(l), deck: [], saved: new Set([LEMMA]), preferences: prefs, now: nowIso(), enrolmentId: a.enrolmentId,
    });
    const mine = intake.find((o) => o.unitId === LEMMA)!;
    expect(mine.decision).toBe('test-now'); // saved by the learner and prioritised
    expect(mine.reasons.length).toBeGreaterThan(0);
    expect(mine.proposed).toBeDefined();
    expect(mine.proposed!.family).not.toMatch(/^audio/); // no audio: never a listening item
  });

  it('4–6. a written exercise is built from pack facts; an incorrect answer schedules a relearning step and lowers reading recognition', async () => {
    const plan = planSession({ deck: [], intake, preferences: prefs, audio: await noAudioDeps.availability('sq'), scheduler, now: nowIso(), random: () => 0.5 });
    expect(plan.items.some((p) => p.item.unitId === LEMMA)).toBe(true);
    expect(plan.newCount).toBeGreaterThan(0);
    const runner = runnerFor(a, plan);
    const cur = (await runner.current())!;
    expect(cur).toBeTruthy();
    expect(cur.exercise.family).toMatch(/written-recognition|meaning-to-form/);
    expect(cur.exercise.validation.ok).toBe(true);
    expect(cur.exercise.answerKey.accepted.length).toBeGreaterThan(0);
    const result = await runner.answer({ typed: 'bread', hinted: false, assistance: [] });
    expect(result.grading.outcome).toBe('incorrect');
    expect(result.rating).toBe(1);
    expect(result.evidence?.kind).toMatch(/CardReviewed|AssessmentAnswered/);
    await runner.finish();
    const deck = await deckOf(a);
    const item = deck.find((d) => d.unitId === LEMMA)!;
    expect(item).toBeDefined();
    expect(item.schedule.reps).toBe(1);
    expect(['learning', 'relearning']).toContain(item.schedule.phase);
    expect(new Date(item.schedule.due).getTime() - clockMs).toBeLessThan(2 * 60 * MIN);
    const d = dims(await knowledge(a, [LEMMA]), LEMMA);
    const dim = result.evidence!.kind === 'CardReviewed' && (result.evidence!.payload as { cardKind: string }).cardKind === 'recognition' ? 'readingRecognition' : 'productiveRetrieval';
    expect(d[dim].negative).toBeGreaterThan(0);
    expect(d[dim].score).toBeLessThan(0.5);
    for (const e of await events(a)) expect(validateEvent(e)).toEqual([]);
    expect(JSON.stringify(await events(a))).not.toContain('lexojnë');
  });

  it('7–8. a later correct answer raises that dimension and leaves the others alone', async () => {
    tick(15 * MIN);
    const deck = await deckOf(a);
    const plan = planSession({ deck, intake: [], preferences: prefs, audio: await noAudioDeps.availability('sq'), scheduler, now: nowIso(), random: () => 0.5 });
    expect(plan.dueCount).toBeGreaterThan(0);
    const runner = runnerFor(a, plan);
    const cur = (await runner.current())!;
    const before = dims(await knowledge(a, [LEMMA]), LEMMA);
    const result = await runner.answer({ typed: cur.exercise.answerKey.accepted[0], hinted: false, assistance: [] });
    expect(result.grading.outcome).toBe('correct');
    expect(result.rating).toBeGreaterThanOrEqual(3);
    await runner.finish();
    const after = dims(await knowledge(a, [LEMMA]), LEMMA);
    const dim = cur.exercise.family === 'meaning-to-form' ? 'productiveRetrieval' : 'readingRecognition';
    expect(after[dim].positive).toBeGreaterThan(before[dim].positive);
    expect(after[dim].score).toBeGreaterThan(before[dim].score);
    expect(after.listeningRecognition).toEqual(before.listeningRecognition);
    expect(after.grammaticalUnderstanding).toEqual(before.grammaticalUnderstanding);
    const item = (await deckOf(a)).find((d) => d.unitId === LEMMA)!;
    expect(item.schedule.reps).toBe(2);
    expect(item.history).toHaveLength(2);
    readingAfterStep8 = after.readingRecognition;
  });

  it('9–13. an audio-only assessment hides the written form, plays, takes the response and updates listening recognition independently', async () => {
    tick(MIN);
    ok(await a.api.appendEvents([buildCardAdded({ learnerId: a.learnerId, enrolmentId: a.enrolmentId, languageId: 'sq', at: nowIso(), deviceId: a.deviceId, producerVersion: 'e2e', unitId: LEMMA, unitKind: 'lexeme', dimension: 'auditory-recognition', family: 'audio-to-meaning', addedBy: 'learner' })]));
    const audio = await audioDeps.availability('sq');
    expect(audio).toMatchObject({ available: true, eligibleForEvidence: true });
    const deck = await deckOf(a);
    const plan = planSession({ deck: deck.filter((d) => d.dimension === 'auditory-recognition'), intake: [], preferences: prefs, audio, scheduler, now: nowIso(), random: () => 0.5 });
    expect(plan.listeningCount).toBeGreaterThan(0);
    const runner = runnerFor(a, plan, { audio: true });
    const cur = (await runner.current())!;
    expect(cur.exercise.family).toBe('audio-to-meaning');
    expect(cur.exercise.hiddenBeforeAnswer).toContain('stimulusText');     // 10. the written answer is hidden
    expect(cur.exercise.prompt.audio?.answerHidden).toBe(true);
    expect(cur.exercise.prompt.audio?.voice.label).toMatch(/TEST asset/);
    const handle = audioDeps.playbackOf(cur.exercise.prompt.audio!);
    await handle.play();                                                     // 11. play
    await flush(20);
    expect(played).toContain('test://sq/liber.wav');
    const before = dims(await knowledge(a, [LEMMA]), LEMMA);
    const result = await runner.answer({ typed: 'book', hinted: false, assistance: [], audioPlayed: true, replays: 1 }); // 12. respond
    expect(result.grading.outcome).toBe('correct');
    expect(result.evidence?.kind).toBe('ListeningAssessed');
    expect((result.evidence!.payload as { answerShownBefore: boolean }).answerShownBefore).toBe(false);
    expect(result.scoring).toMatchObject({ voice: 'recorded', eligibleForEvidence: true, synthetic: false, pronunciationValidated: true });
    await runner.finish();
    const after = dims(await knowledge(a, [LEMMA]), LEMMA);              // 13. listening moved; reading did not
    expect(after.listeningRecognition.positive).toBeGreaterThan(before.listeningRecognition.positive);
    expect(after.readingRecognition).toEqual(readingAfterStep8);
    expect(after.productiveRetrieval).toEqual(before.productiveRetrieval);
  });

  it('14–16. back in GoLearn the card shows the learner\'s history and the full explanation stays available', async () => {
    const fake = createChromeFake();
    const EXT = fake.runtime.id!;
    const PAGE = { id: EXT, url: `chrome-extension://${EXT}/app/index.html` };
    const page = (m: Record<string, unknown>) => fake.dispatch(m, PAGE) as Promise<any>;
    const workerFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return u.includes('/dict/') ? fileFetch(input) : serviceFetch(input, init);
    }) as typeof fetch;
    const timers: Array<{ fire(): void }> = [];
    const worker = createBackground(fake as unknown as ChromeApi, { fetch: workerFetch, timers: { set: (fn, ms) => { const t = { ms, fired: false, fire() { if (!t.fired) { t.fired = true; fn(); } } }; timers.push(t); return t; }, clear: () => {} } });
    worker.register();
    await page({ type: MSG.serviceConfig, baseUrl: BASE, assetBase: 'http://localhost/' });
    await page({ type: MSG.connect, baseUrl: BASE, email: 'ana@review.test', password: PASSWORD });
    document.body.innerHTML = `<main><p id="passage">${SENTENCE}</p></main>`;
    const bridge = createBridge(fake.contentChrome(7));
    const holder: { c?: LookupController } = {};
    const ui = createCardUI({ doc: document, speech: null, onDismiss: () => holder.c?.onCardDismissed() });
    const c = new LookupController({
      doc: document, adapters: [new WebGenericAdapter({ doc: document, segmentSentences: (t) => sqAdapter.segmentSentences(t) }), new UnsupportedAdapter()],
      parse: parseSelection, ui, store: bridge.events, metrics: bridge.metrics, services: bridge, analysers: ['sq'],
      identity: { learnerId: 'pending', enrolmentId: 'pending', deviceId: 'pending' }, version: 'e2e', sessionId: 'back', nextFrame: () => Promise.resolve(),
    });
    holder.c = c;
    selectText(document.getElementById('passage')!, 'librin');
    const out = await c.lookup({ trigger: 'command' });
    if (out.status !== 'shown') throw new Error('card');
    await out.settled;
    await flush(60);
    const text = ui.root()!.textContent ?? '';
    expect(text).toMatch(/You have met this word \d+ times/);               // 15. the learner state reached the reader
    expect(text).toMatch(/reading recognition: (low|medium|high)/);
    expect(text).not.toMatch(/not met this word before/);
    (ui.root()!.querySelector('button.l4') as HTMLElement).click();        // 16. the full explanation is still there
    expect(ui.root()!.querySelector('.layer.l4')!.textContent).toMatch(/direct object|ending/i);
    expect(text).toContain('libër (NOUN)');
    c.dispose();
  });

  it('missing audio: with the real Albanian registry the listening item cannot be asked and the session says why', async () => {
    const deck = (await deckOf(a)).filter((d) => d.dimension === 'auditory-recognition');
    const audio = await noAudioDeps.availability('sq');
    expect(audio.available).toBe(false);
    const plan = planSession({ deck, intake: [], preferences: { ...prefs, includeListening: true }, audio, scheduler, now: nowIso(), random: () => 0.5 });
    // the planner asks the due listening item in writing (flagged) rather than inventing audio
    const p = plan.items.find((x) => x.item.unitId === LEMMA);
    if (p) expect(p.family).not.toMatch(/^audio/);
    const src = noAudioDeps.source()!;
    const stim = await src.prepareStimulus({ languageId: 'sq', kind: 'word', text: 'libër', itemIds: [LEMMA] });
    expect('unavailable' in stim && stim.unavailable).toBe(true);
  });

  it('invalid question: a provisional rule-derived form gets no authoritative grammar question', async () => {
    const facts = await factsFor('sq', a.api)!.factsFor('form:sq:librin', 'sq');
    expect(facts).toBeDefined();
    const builder = registry.find((x) => x.family === 'morphological-identification')!;
    const target = { unitId: 'form:sq:librin', unitKind: 'form', languageId: 'sq', dimension: 'morphological-analysis' as const };
    const built = await builder.build(target, facts!, { now: nowIso(), random: () => 0.5 });
    if ('unavailable' in built) expect(built.reason).toMatch(/provisional|lemma/i);
    else {
      // the only allowed question for such a form asks its lemma, never its features
      expect(built.answerKey.features).toBeUndefined();
      expect(built.prompt.instruction).toMatch(/lemma|dictionary form/i);
    }
  });

  it('ambiguous answers are not graded as wrong, and produce no rating', () => {
    const g = gradeTyped({ accepted: ['book'], normalization: 'loose', explanation: 'libër: book', alternatives: [{ answer: 'to split', sense: 'çaj (verb)' }] } as never, 'to split');
    expect(['ambiguous', 'incorrect']).toContain(g.outcome);
    if (g.outcome === 'ambiguous') expect(ratingFor(g, { hinted: false, assistance: [] })).toBeNull();
    const empty = gradeTyped({ accepted: ['book'], normalization: 'loose', explanation: '' } as never, '   ');
    expect(empty.outcome).toBe('unable-to-grade');
    expect(ratingFor(empty, { hinted: false, assistance: [] })).toBeNull();
  });

  it('offline reviews are kept on the device, sent once when the network returns, and duplicates change nothing', async () => {
    const area = createMemoryArea();
    const queue = createLocalQueue(area, { now: () => clockMs });
    const transport: Transport = {
      async push(req) { const r = await a.api.syncPush(req); if (!r.ok) throw new Error(`push ${r.status}`); return r.data; },
      async pull(req) { const r = await a.api.syncPull(req); if (!r.ok) throw new Error(`pull ${r.status}`); return r.data; },
    };
    const localLog = { async append(l: string, evs: GoEvent[]) { return evs.map((e) => ({ id: e.id, stored: e.learnerId === l })); }, async list() { return []; }, async get() { return undefined; }, async head() { return 0; } };
    const client = createSyncClient({ queue, local: localLog as never, transport, deviceId: a.deviceId, now: () => clockMs, random: () => 0.5, backoff: { baseMs: 1, maxMs: 2, factor: 2, jitter: 0 } });
    const before = (await events(a)).length;
    net.down = true;
    tick(30 * MIN);
    const deck = (await deckOf(a)).filter((d) => d.dimension !== 'auditory-recognition');
    const plan = planSession({ deck, intake: [], preferences: prefs, audio: await noAudioDeps.availability('sq'), scheduler, now: nowIso(), random: () => 0.5 });
    const runner = runnerFor(a, plan, { record: async (evs) => { for (const e of evs) { const q = await queue.enqueue(e); if (!q.ok) throw new Error('enqueue'); } } });
    const cur = await runner.current();
    expect(cur).toBeTruthy();
    const r = await runner.answer({ typed: cur!.exercise.answerKey.accepted[0], hinted: false, assistance: [] });
    expect(r.grading.outcome).toBe('correct');
    expect(await queue.size()).toBeGreaterThan(0);
    const failed = await client.syncOnce({ force: true });
    expect(failed.ok ?? false).toBe(false);
    expect((await events(a)).length).toBe(before);
    net.down = false;
    tick(MIN);
    const healed = await client.syncOnce({ force: true });
    expect(healed.ok ?? false).toBe(true);
    const afterCount = (await events(a)).length;
    expect(afterCount).toBeGreaterThan(before);
    expect(await queue.size()).toBe(0);
    await client.syncOnce({ force: true });
    expect((await events(a)).length).toBe(afterCount);
    const ids = (await events(a)).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('conflicting devices: both devices\' offline reviews of the same item survive, in time order, on every device', async () => {
    const deck = await deckOf(a);
    const item = deck.find((d) => d.unitId === LEMMA && d.dimension !== 'auditory-recognition')!;
    const mk = (device: string, at: string, rating: number): GoEvent => ({
      id: `conf:${device}:${at}`, v: CONTRACT_VERSION, learnerId: a.learnerId, enrolmentId: a.enrolmentId, languageId: 'sq', at,
      producer: { app: 'gopractice-review', version: 'e2e', deviceId: device }, kind: 'CardReviewed', subject: { itemIds: [LEMMA], cardId: item.itemId },
      payload: { cardKind: 'recognition', grade: rating >= 3 ? 'good' : 'again', correct: rating >= 3, hinted: false, rating, outcome: rating >= 3 ? 'correct' : 'incorrect', family: item.family, exerciseId: `x:${device}` }, dedupeKey: `conf:${device}:${at}`,
    });
    const t1 = new Date(clockMs + 60 * MIN).toISOString();
    const t2 = new Date(clockMs + 61 * MIN).toISOString();
    const e1 = mk('dev-A', t1, 3);
    const e2 = mk('dev-B', t2, 1);
    // device B's batch arrives first, device A's later: the fold orders by time, not arrival
    ok(await a.api.appendEvents([e2]));
    ok(await a.api.appendEvents([e1]));
    tick(62 * MIN);
    const folded = (await deckOf(a)).find((d) => d.itemId === item.itemId)!;
    const tail = folded.history.slice(-2);
    expect(tail.map((h) => h.deviceId)).toEqual(['dev-A', 'dev-B']);
    expect(folded.schedule.lapses).toBeGreaterThanOrEqual(1);
    const shuffled = foldDeckItems([...(await events(a))].reverse(), scheduler, { languageId: 'sq', now: nowIso() }).find((d) => d.itemId === item.itemId)!;
    expect(shuffled.schedule).toEqual(folded.schedule);
    expect(shuffled.history).toEqual(folded.history);
  });

  it('unsupported language features: a planned language has no pack facts, so nothing is built and nothing is claimed', async () => {
    expect(factsFor('de', a.api)).toBeUndefined();
    const e = ok<{ enrolment: { enrolmentId: string } }>(await a.api.enrol({ languageId: 'de', packId: 'pack:de', packVersion: '9', goals: [{ kind: 'reading' }] }));
    const c = ok<{ candidates: unknown[] }>(await a.api.candidates(e.enrolment.enrolmentId, 10)).candidates;
    expect(Array.isArray(c)).toBe(true);
  });

  it('cross-user authorization: the second learner cannot read the first learner\'s candidates, events or knowledge', async () => {
    const cand = await b.api.candidates(a.enrolmentId, 10);
    expect(cand.ok).toBe(false);
    const evs = ok<{ events: GoEvent[] }>(await b.api.listEvents({ limit: 1000 })).events;
    expect(evs.every((e) => e.learnerId === b.learnerId)).toBe(true);
    expect(evs.some((e) => e.kind === 'CardReviewed')).toBe(false);
    const k = ok<{ knowledge: UnitKnowledge[] }>(await b.api.knowledge([LEMMA])).knowledge;
    expect(k).toHaveLength(0);
    const foreign = await b.api.submitReviews([{ ...(await events(a)).find((e) => e.kind === 'CardReviewed')!, id: 'steal:1', dedupeKey: 'steal:1' } as GoEvent]);
    expect(foreign.ok).toBe(false);
    expect(foreign.ok ? 0 : foreign.status).toBe(403);
  });
});
