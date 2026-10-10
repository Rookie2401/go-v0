// @vitest-environment jsdom
/**
 * Prompt 6 §14 — the complete feedback loop for one Albanian learner, 43 steps, over the ACTUAL applications and the
 * ACTUAL Repository:
 *   - the Repository service (`handle`, SQLite in memory, real scrypt, real linguistics and projection engine);
 *   - GoLearn: the real setup application (the sign-in page, then the languages page: download the language, whose pack installs by itself), the real background worker
 *     with the real Albanian pack (dictionary shards read from public/dict/sq), the real content-script controller and
 *     card on a page;
 *   - GoPractice: the real shell (`createApp`) with GoReview's real builders, scheduler, intake, planner, runner and
 *     evidence, the real pack facts, and GoTell's real engine behind the real writing screens;
 *   - GoListen: the real assessment source and playback, with a TEST registry entry that stands in for a reviewed
 *     Albanian recording (no such recording exists; §14 asks for exactly this when validated audio is unavailable).
 * Fakes: the network (in-process `fetch`), the clock, the timers, the audio element. Nothing between a screen and the
 * service is replaced.
 */
import fs from 'node:fs';
import path from 'node:path';
import { URL as NodeURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateEvent, type Dimension, type GoEvent, type StoredEvent, type UnitKnowledge } from '../../packages/repository-contract/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createLinguisticService } from '../../packages/repository-linguistics/src';
import { createMemoryStore, openSqliteStore } from '../../packages/repository-store/src';
import { createRepositoryApi, type RepositoryApi } from '../../packages/repository-service/src/api';
import { nodeCrypto } from '../../packages/repository-service/src/crypto-node';
import { handle } from '../../packages/repository-service/src/handler';
import { adaptLinguistics } from '../../packages/repository-service/src/linguistics-adapter';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { createApp as createSetupApp } from '../../packages/golearn-extension/app/app';
import { createPackBindings } from '../../packages/golearn-extension/app/bindings';
import type { Deps as SetupDeps } from '../../packages/golearn-extension/app/ports';
import { UnsupportedAdapter, WebGenericAdapter } from '../../packages/golearn-extension/src/adapters';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { LookupController } from '../../packages/golearn-extension/src/content/controller';
import { createBridge } from '../../packages/golearn-extension/src/content/services';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { MSG, type ChromeApi } from '../../packages/golearn-extension/src/platform';
import { createCardUI } from '../../packages/golearn-extension/src/popup/card';
import { createMemoryStorageArea } from '../../packages/golearn-extension/src/store';
import { buildCardAdded, createFsrsScheduler, evidenceFor, foldDeckItems, planSession, ratingFor, registry } from '../../packages/goreview/src';
import { createApp as createPracticeApp, type AppHandle } from '../../packages/gopractice/app';
import { createAudioDeps } from '../../packages/gopractice/audio';
import { createReviewEngine } from '../../packages/gopractice/engine';
import { packFactsFor } from '../../packages/gopractice/packFacts';
import type { Deps as PracticeDeps } from '../../packages/gopractice/ports';
import { decodeBody } from '../../packages/gotell/src/documents';
import type { VoiceRegistry } from '../../packages/golisten/src';
import type { AudioClip, AudioPort } from '../../packages/golisten/src/ports';
import { createMemoryArea } from '../../packages/repository-sync/src';
import { sqAdapter } from '../../src/adapters/sq';
import { createChromeFake } from '../extension/chromeFake';
import { selectText, stubLayout } from '../golearn-app/domtools';
import { choose, flush, submit, type, until } from '../golearn-app/helpers';

(globalThis as { URL: typeof URL }).URL = NodeURL as unknown as typeof URL;

// ───────────────────────────── the real Repository ─────────────────────────────
let clockMs = Date.now();   // the worker stamps encounters with the wall clock; the service refuses future timestamps, so the fake clock starts now and only moves forward
const nowIso = (): string => new Date(clockMs).toISOString();
const tick = (ms: number): void => { clockMs += ms; };
const MIN = 60_000;
const MIGRATIONS = path.resolve(__dirname, '../../packages/repository-store/migrations');
const store = openSqliteStore(':memory:', { now: nowIso, migrationsDir: MIGRATIONS });
const engine = createProjectionEngine({ store, now: nowIso });
const serviceDeps: ServiceDeps = { store, engine, linguistics: adaptLinguistics(createLinguisticService(store, { now: nowIso })), crypto: nodeCrypto, now: nowIso, log: () => {} };
const net = { down: false, calls: [] as string[] };
const serviceFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  net.calls.push(`${init?.method ?? 'GET'} ${new URL(u, 'http://x/').pathname}`);
  if (net.down) throw new TypeError('Failed to fetch');
  return handle(new Request(input, init), serviceDeps);
}) as typeof fetch;
const ASSETS = path.resolve(__dirname, '../../public');
const fileFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  const file = path.join(ASSETS, decodeURIComponent(url.pathname));
  return fs.existsSync(file) ? new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('not found', { status: 404 });
}) as typeof fetch;
const workerFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return u.includes('/dict/') ? fileFetch(input) : serviceFetch(input, init);
}) as typeof fetch;
const BASE = 'http://127.0.0.1:8790';
const EMAIL = 'ana@albania.test';
const PASSWORD = 'a very long password 123';
const ok = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>): T => { if (!r.ok) throw new Error(`api ${r.status} ${String(r.error)}: ${String(r.message)} ${JSON.stringify(r.body ?? "")}`); return r.data as T; };

// ───────────────────────────── GoListen: a TEST fixture, declared as such ─────────────────────────────
const played: string[] = [];
const fakeAudio: AudioPort = {
  open(url) {
    let ended: (() => void) | undefined;
    const clip: AudioClip = { async play() { played.push(url); setTimeout(() => ended?.(), 5); }, pause() {}, stop() {}, setRate() {}, onEnded(cb) { ended = cb; }, onError() {}, durationMs: () => 900, release() {} };
    return clip;
  },
};
/** TEST ONLY (§14 step 20): no validated Albanian recording exists in this repository; this entry exercises the software path and claims nothing about Albanian audio. */
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
const noSpeech = { getVoices: () => [], speak() {}, cancel() {}, pause() {}, resume() {} };

// ───────────────────────────── the passage and the units ─────────────────────────────
const SENTENCE = 'Fëmijët lexojnë librin.';
const PASSAGE = `${SENTENCE} Nëna është në kuzhinë. Beni e pi çajin dhe ha bukën.`;
const LEMMA = 'lemma:sq:libër:NOUN';
const ATTEMPT = 'Unë shkoj te libër. Unë lexoj librin.';
const REVISED = 'Unë shkoj te libri. Unë lexoj librin.';
const DIMS: Dimension[] = ['exposure', 'assistedRecognition', 'readingRecognition', 'listeningRecognition', 'productiveRetrieval', 'contextualProduction', 'grammaticalUnderstanding'];

// ───────────────────────────── GoLearn: worker, setup app, reader ─────────────────────────────
const fake = createChromeFake();
const EXT = fake.runtime.id!;
const PAGE_SENDER = { id: EXT, url: `chrome-extension://${EXT}/app/index.html` };
fake.runtime.sendMessage = (message) => fake.dispatch(message, PAGE_SENDER);
const area = fake.local as unknown as ReturnType<typeof createMemoryStorageArea>;
const page = (m: Record<string, unknown>) => fake.dispatch(m, PAGE_SENDER) as Promise<any>;
const workerTimers: Array<{ fire(): void }> = [];
const fireWorkerTimers = async (): Promise<void> => { for (const t of workerTimers.splice(0)) t.fire(); await flush(40); };
let restoreLayout: () => void;
let setup: ReturnType<typeof createSetupApp> | undefined;
let controller: LookupController | undefined;

const q = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => { const el = root.querySelector<T>(sel); if (!el) throw new Error(`not found: ${sel}`); return el; };

function reader() {
  controller?.dispose();
  const bridge = createBridge(fake.contentChrome(7));
  const holder: { c?: LookupController } = {};
  const ui = createCardUI({ doc: document, speech: null, onDismiss: () => holder.c?.onCardDismissed() });
  controller = new LookupController({
    doc: document, adapters: [new WebGenericAdapter({ doc: document, segmentSentences: (t) => sqAdapter.segmentSentences(t) }), new UnsupportedAdapter()],
    parse: parseSelection, ui, store: bridge.events, metrics: bridge.metrics, services: bridge, analysers: ['sq'],
    identity: { learnerId: 'pending', enrolmentId: 'pending', deviceId: 'pending' }, version: '0.2.0', sessionId: `cert-${clockMs}`, nextFrame: () => Promise.resolve(),
  });
  holder.c = controller;
  controller.enable();
  return { ui, c: controller, text: () => ui.root()?.textContent ?? '', rows: () => [...(ui.root()?.querySelectorAll<HTMLElement>('.rows [data-row]') ?? [])].map((r) => r.dataset.row) };
}
async function lookup(r: ReturnType<typeof reader>, word: string) {
  selectText(q('#passage'), word);
  const out = await r.c.lookup({ trigger: 'command' });
  if (out.status !== 'shown') throw new Error(`lookup of ${word}: ${out.status} ${(out as { message?: string }).message ?? ''}`);
  await out.settled;
  await flush(40);
  return out;
}

// ───────────────────────────── GoPractice: the real shell ─────────────────────────────
let practice: AppHandle | undefined;
let practiceRoot: HTMLElement;
const audioDeps = createAudioDeps({ consent: () => false, registries: [TEST_SQ_REGISTRY], audio: fakeAudio, speech: noSpeech });
let ids = 0;
let practiceArea = createMemoryArea();
async function openPractice(fresh = false): Promise<AppHandle> {
  if (fresh) practiceArea = createMemoryArea();
  practice?.destroy();
  document.body.innerHTML = '';
  practiceRoot = document.createElement('div');
  practiceRoot.id = 'app';
  document.body.append(practiceRoot);
  const reviewEngine = createReviewEngine({
    builders: registry, evidenceFor, ratingFor, factsFor: packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' }), now: nowIso, random: () => 0.5,
  });
  const deps: PracticeDeps = {
    win: window, doc: document, fetch: fileFetch, area: practiceArea, config: { serviceUrl: BASE, assetBaseUrl: 'http://assets.local/' },
    createApi: (baseUrl, token) => createRepositoryApi({ baseUrl, fetch: serviceFetch, token }),
    engine: reviewEngine, audio: audioDeps, now: () => new Date(clockMs), newId: () => `cert-${++ids}`, random: () => 0.5, appVersion: 'cert', autoSync: false,
    timers: { set: () => 0, clear: () => undefined },
  };
  practice = createPracticeApp(practiceRoot, deps);
  await practice.ready();
  return practice;
}
const pq = <T extends HTMLElement = HTMLElement>(sel: string): T => q<T>(sel, practiceRoot);
const pqa = <T extends HTMLElement = HTMLElement>(sel: string): T[] => [...practiceRoot.querySelectorAll<T>(sel)];
async function go(route: string, waitFor?: string): Promise<void> {
  await practice!.go(route); await practice!.ready(); await flush(6);
  if (waitFor) { try { await until(() => !!practiceRoot.querySelector(waitFor), 8000); } catch { throw new Error(`${waitFor} never appeared on ${route} (${practice!.current()}): ${(practiceRoot.textContent ?? '').replace(/s+/g, ' ').slice(0, 400)}`); } }
}
const typeInto = (el: HTMLInputElement | HTMLTextAreaElement, value: string): void => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
const keyOn = (k: string, target: EventTarget, opts: { ctrl?: boolean } = {}): void => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: !!opts.ctrl, bubbles: true, cancelable: true })); };

interface Shown { family: string; hidden: string[]; hasInput: boolean; choices: string[]; audio: boolean }
function shown(): Shown | undefined {
  const ex = practiceRoot.querySelector<HTMLElement>('#session .exercise');
  if (!ex) return undefined;
  return {
    family: ex.getAttribute('data-family') ?? '', hidden: [], hasInput: !!ex.querySelector('#answer-input'),
    choices: [...ex.querySelectorAll<HTMLElement>('.choice')].map((b) => b.getAttribute('data-choice') ?? ''), audio: !!ex.querySelector('#audio'),
  };
}
/** Answers the current item: typed when there is an input, else a choice; `pick` returns the text to give. */
async function answer(pick: (s: Shown) => string): Promise<string> {
  const s = shown(); if (!s) throw new Error('no exercise on screen');
  const give = pick(s);
  if (s.hasInput) { const input = pq<HTMLInputElement>('#answer-input'); typeInto(input, give); keyOn('Enter', input); }
  else { const btn = pqa('.choice').find((b) => b.getAttribute('data-choice') === give) ?? pqa('.choice')[0]; if (!btn) throw new Error('no way to answer'); btn.click(); }
  await until(() => !!practiceRoot.querySelector('#feedback'), 8000);
  return pq('#outcome').textContent ?? '';
}
async function next(): Promise<void> { pq('#next').click(); await flush(10); await until(() => !!practiceRoot.querySelector('#session .exercise') || !!practiceRoot.querySelector('#summary'), 8000); }
async function startSession(): Promise<void> {
  await go('review', '#review-home > *');
  await until(() => !!practiceRoot.querySelector('#start-session'), 8000);
  const startBtn = pq<HTMLButtonElement>('#start-session');
  if (startBtn.disabled) throw new Error(`start disabled: ${(practiceRoot.querySelector('#review-home')?.textContent ?? '').slice(0, 600)}`);
  startBtn.click();
  try { await until(() => !!practiceRoot.querySelector('#session .exercise') || !!practiceRoot.querySelector('#summary'), 10_000); }
  catch (e) { throw new Error(`no exercise after start (${practice!.current()}): status=${[...practiceRoot.querySelectorAll('.status, [role=status], [aria-live]')].map((n) => n.textContent).join(' | ')} candidates=${[...practiceRoot.querySelectorAll('#candidates li.candidate')].map((n) => `${n.getAttribute('data-unit')}:${n.getAttribute('data-decision')}`).join(',')}`); }
}

// ───────────────────────────── shared state ─────────────────────────────
const events = (learnerId: string): Promise<StoredEvent[]> => store.list({ learnerId, limit: 5000 });
const knowledge = async (learnerId: string, id: string): Promise<UnitKnowledge> => { const r = (await engine.knowledge(learnerId, [id]))[0]; if (!r) throw new Error(`no row for ${id}`); return r; };
const dimsOf = async (learnerId: string, id: string) => (await knowledge(learnerId, id)).dimensions;
const scheduler = createFsrsScheduler({ desiredRetention: 0.9 });

let learnerId = '';
let enrolmentId = '';
let token = '';
let api: RepositoryApi;
let writtenDim: Dimension = 'readingRecognition';
let firstCardText = '';
let readingBeforeListening: UnitKnowledge['dimensions']['readingRecognition'];
let draftId = '';
let learnerDevice = 'cert-practice';

beforeAll(() => {
  restoreLayout = stubLayout();
  const worker = createBackground(fake as unknown as ChromeApi, {
    fetch: workerFetch,
    timers: { set: (fn, ms) => { const t = { ms, fired: false, fire() { if (!t.fired) { t.fired = true; fn(); } } }; workerTimers.push(t); return t; }, clear: () => {} },
  });
  worker.register();
});
afterAll(async () => { controller?.dispose(); practice?.destroy(); restoreLayout(); await store.close(); });

describe('§14 Acquisition (steps 1–11): GoLearn over the real Repository', () => {
  it('1–4. the learner is created on the sign-in page and downloads Albanian on the languages page, whose pack installs by itself', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    window.location.hash = '';
    const deps: SetupDeps = {
      win: window, doc: document, chrome: fake as unknown as ChromeApi, fetch: fileFetch, area, packs: createPackBindings(), config: {},
      createApi: (baseUrl, tok) => createRepositoryApi({ baseUrl, fetch: serviceFetch, token: tok }),
      download: () => {}, now: () => new Date(clockMs), closeWindow: () => false, copyText: async () => true, appVersion: 'cert', speech: null,
    };
    setup = createSetupApp(document.getElementById('app')!, deps);
    await setup.ready();
    const open = async (route: string) => { await setup!.go(route); await setup!.ready(); await flush(); };

    expect(setup.current()).toBe('signin');                                            // 1. create a learner (the first page of a first run: sign in, optional)
    choose(q('#acct-mode'), 'create');
    type(q<HTMLInputElement>('#acct-email'), EMAIL);
    type(q<HTMLInputElement>('#acct-password'), PASSWORD);
    submit(q<HTMLFormElement>('#acct-form'));
    await until(() => setup!.current() === 'languages' && document.getElementById('flash'), 8000);   //    the app moves on to the languages page by itself
    expect(q('#flash').textContent).toMatch(/Account created/);
    const session = (await area.get('golearn:session'))['golearn:session'] as { learnerId: string; token: string };
    learnerId = session.learnerId; token = session.token;
    learnerDevice = ((await area.get(null)) as Record<string, unknown>)['golearn:deviceId'] as string ?? (session as { deviceId?: string }).deviceId ?? learnerDevice;
    expect(JSON.stringify(await area.get(null))).not.toContain(PASSWORD);
    api = createRepositoryApi({ baseUrl: BASE, fetch: serviceFetch, token });

    expect(document.getElementById('team')).toBeNull();                               // 2. choose Albanian: any learner may pick any language; no team is asked for.
    q('#language-cards > [data-language="sq"] [data-action="choose"]').click();       //    “Download Albanian”: one click enrols (on the device and on the account) and installs the pack.
    await until(() => /is ready|did not|could not/.test(q('#language-cards > [data-language="sq"] .status').textContent ?? ''), 20_000);
    const enrolment = (await store.listEnrolments(learnerId))[0];
    enrolmentId = enrolment.enrolmentId;
    expect(enrolment).toMatchObject({ languageId: 'sq', packId: 'pack:sq' });
    expect(enrolment.teamId).toBeUndefined();
    await flush(30);

    // 3. the pack install ran inside step 2: the real installer over the real dictionary files, every validation case through the real analyser
    await until(() => document.querySelector('#language-cards > [data-language="sq"] .verify'), 15_000);
    expect(q('#language-cards > [data-language="sq"] .verify').getAttribute('data-ok')).toBe('true');
    expect(q('#language-cards > [data-language="sq"] .status').textContent).toMatch(/Albanian is ready: [0-9]+ checks passed/);
    await until(() => document.querySelector('#next-note'));
    expect(q('#language-cards > [data-language="sq"] .mine').textContent).toContain('Downloaded · ready');
    // 4. there is no orientation in setup any more: the old links lead to the languages page
    await open('tutorial');
    expect(setup!.current()).toBe('languages');
    setup.destroy(); setup = undefined;
  }, 90_000);

  it('5–9. an authorized reader: "librin" gives the lemma, the morphology, a contextual explanation, and an honest pronunciation state', async () => {
    await page({ type: MSG.serviceConfig, baseUrl: BASE, assetBase: 'http://localhost/' });
    const status = await page({ type: MSG.status });
    expect(status).toMatchObject({ connected: true, languageId: 'sq', packAvailable: true });
    document.body.innerHTML = `<main><h1>Udha</h1><p id="passage">${PASSAGE}</p></main>`;   // 5. a web page: the one verified reader class
    const r = reader();
    const out = await lookup(r, 'librin');                                                 // 6. select "librin"
    expect(out.recorded).toBe('recorded');
    const t = r.text();
    firstCardText = t;
    expect(t).toContain('libër (NOUN)');                                                   // 7. lemma
    expect(t).toContain('definite masculine accusative singular');                          // 7. morphology
    (r.ui.root()!.querySelector('button.deeperBtn') as HTMLElement).click();
    expect(r.ui.root()!.querySelector('.layer.l2')!.textContent).toMatch(/accusative/i);    // 8. contextual explanation
    expect(t).toMatch(/context\s*full sentence/i);
    expect(t).toMatch(/Speech is not available|No local Albanian voice|voice/i);           // 9. GoListen: nothing validated for Albanian here, said plainly
    expect(t).not.toMatch(/native-quality|native speaker voice/i);
    expect(t).toMatch(/· 0× encounters/);
  });

  it('10–11. the encounter is recorded under the account without text, and no mastery was granted', async () => {
    tick(5 * MIN);
    const r = reader();
    const again = await lookup(r, 'librin');                                               // a second encounter, so the Repository has something to propose
    expect(again.recorded).toBe('recorded');
    (r.ui.root()!.querySelector('.rateBtn[data-mark="new"]') as HTMLElement).click();      // the learner's own level on the card ("New", which grants no evidence): GoLearn's own ItemMarked
    await flush(40);
    await fireWorkerTimers();
    await page({ type: MSG.syncNow });
    await until(async () => (await store.list({ learnerId, kinds: ['SelectionLookedUp'] })).length >= 2, 8000);
    const evs = await events(learnerId);
    const sel = evs.filter((e) => e.kind === 'SelectionLookedUp' && e.producer.app === 'golearn-ext');
    expect(sel.length).toBeGreaterThanOrEqual(2);
    expect(sel[0].enrolmentId).toBe(enrolmentId);
    expect(sel[0].subject.itemIds).toContain(LEMMA);
    expect(sel[0].subject.sentenceKey).toBeTruthy();
    expect(evs.some((e) => e.kind === 'ItemMarked')).toBe(true);
    for (const e of evs) expect(validateEvent(e)).toEqual([]);
    expect(JSON.stringify(evs)).not.toContain('lexojnë');
    expect(evs.some((e) => e.kind === 'PronunciationPlayed')).toBe(false);
    const d = await dimsOf(learnerId, LEMMA);                                              // 11. no unearned mastery
    expect(d.exposure.observations).toBeGreaterThan(0);
    // The learner's own "New" on the card is a weak NEGATIVE self-report of reading recognition (engine rule `itemMark`): it may carry weight, never a positive credit.
    for (const k of DIMS) if (k !== 'exposure' && k !== 'assistedRecognition' && k !== 'readingRecognition') expect(d[k].weight, k).toBe(0);
    expect(d.readingRecognition.positive, 'readingRecognition').toBe(0);
  });
});

describe('§14 Review (steps 12–19): the real GoPractice shell on the real Repository', () => {
  it('12–14. GoPractice opens, signs in, and shows the candidate with the reason it was selected', async () => {
    await openPractice();                                                                  // 12. open GoPractice
    await until(() => !!practiceRoot.querySelector('#signin-form'), 8000);
    typeInto(pq<HTMLInputElement>('#signin-email'), EMAIL);
    typeInto(pq<HTMLInputElement>('#signin-password'), PASSWORD);
    pq<HTMLFormElement>('#signin-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await until(async () => !!(await practiceArea.get('gopractice:session'))['gopractice:session'], 8000);
    expect(JSON.stringify(await practiceArea.get(null))).not.toContain(PASSWORD);
    await practice!.ready(); await flush(10);
    await go('review', '#review-home > *');
    await until(() => !!practiceRoot.querySelector(`#candidates li[data-unit="${LEMMA}"]`), 10_000);
    const row = pq(`#candidates li[data-unit="${LEMMA}"]`);                                // 13. the review candidate
    const why = row.querySelector('details.why')!.textContent ?? '';                       // 14. why it was selected
    expect(row.getAttribute('data-decision'), why).toMatch(/test-now|test-later/);
    expect(why).toMatch(/repeatedLookups|saved|looked up|met/i);
    expect(why.length).toBeGreaterThan(20);
    if (row.getAttribute('data-decision') === 'test-later') {                         // the Repository explains a "later"; the learner decides to test it now
      expect(why).toMatch(/score|later/i);
      (row.querySelector('[data-act="test-now"]') as HTMLButtonElement).click();
      await until(() => /Added .* to your deck/.test(practiceRoot.textContent ?? ''), 8000);
      await practice!.ctx.syncNow({ force: true });
    }
  }, 30_000);

  it('15–17. a written exercise is presented; an incorrect response lowers the relevant estimate only', async () => {
    const before = await dimsOf(learnerId, LEMMA);
    await startSession();
    const s = shown();
    expect(s, practiceRoot.textContent ?? '').toBeDefined();
    expect(s!.family).not.toMatch(/^audio/);                                                // 15. written, not listening
    const outcome = await answer((x) => (x.hasInput ? 'bread' : x.choices.find((c) => !/book/i.test(c)) ?? x.choices[0]));
    expect(outcome).toMatch(/Incorrect|Not quite|wrong/i);                                 // 16. recorded as incorrect
    writtenDim = s!.family === 'meaning-to-form' ? 'productiveRetrieval' : s!.family.startsWith('morph') || s!.family.startsWith('grammar') ? 'grammaticalUnderstanding' : 'readingRecognition';
    await next();
    for (let i = 0; i < 6 && shown(); i++) { pq('#skip').click(); await flush(10); await until(() => !!practiceRoot.querySelector('#session .exercise') || !!practiceRoot.querySelector('#summary'), 8000); }
    await until(() => !!practiceRoot.querySelector('#summary'), 8000);
    await practice!.ctx.syncNow({ force: true });
    await until(async () => (await store.list({ learnerId, kinds: ['CardReviewed', 'AssessmentAnswered'] })).length >= 1, 8000);
    const after = await dimsOf(learnerId, LEMMA);                                           // 17. the estimate moved on one dimension
    expect(after[writtenDim].negative).toBeGreaterThan(before[writtenDim].negative);
    expect(after[writtenDim].score).toBeLessThan(0.5);
    for (const k of DIMS) if (k !== writtenDim && k !== 'exposure' && k !== 'assistedRecognition') expect(after[k], k).toEqual(before[k]);
  }, 30_000);

  it('18–19. a later correct review raises the estimate and advances the schedule', async () => {
    tick(20 * MIN);
    const before = await dimsOf(learnerId, LEMMA);
    const sched = foldDeckItems(await events(learnerId), scheduler, { languageId: 'sq', now: nowIso() }).map((d) => ({ item: d.itemId, due: d.schedule.due, phase: d.schedule.phase, reps: d.schedule.reps }));
    await openPractice();
    await go('review', '#review-home > *');
    try { await startSession(); } catch (e) { throw new Error(`${String(e)} | now=${nowIso()} deck=${JSON.stringify(sched)}`); }
    let found = false;
    for (let i = 0; i < 8 && shown(); i++) {
      const s = shown()!;
      if (s.family.startsWith('audio')) { pq('#skip').click(); await flush(10); await until(() => !!practiceRoot.querySelector('#session .exercise') || !!practiceRoot.querySelector('#summary'), 8000); continue; }
      const outcome = await answer((x) => (x.hasInput ? (x.family === 'meaning-to-form' ? 'libër' : 'book') : x.choices.find((c) => /book|libër/i.test(c)) ?? x.choices[0]));
      if (/^Correct/i.test(outcome)) found = true;
      await next();
    }
    expect(found, 'one correct review happened').toBe(true);
    await until(() => !!practiceRoot.querySelector('#summary'), 8000);
    await practice!.ctx.syncNow({ force: true });
    await flush(20);
    const after = await dimsOf(learnerId, LEMMA);
    const moved = DIMS.filter((k) => after[k].positive > before[k].positive);
    expect(moved.length).toBeGreaterThanOrEqual(1);                                        // 19. retrieval/recognition evidence
    const deck = foldDeckItems(await events(learnerId), scheduler, { languageId: 'sq', now: nowIso() });
    const item = deck.find((d) => d.unitId === LEMMA && d.dimension !== 'auditory-recognition');
    expect(item).toBeDefined();
    expect(item!.schedule.reps).toBeGreaterThanOrEqual(2);                                 // 19. scheduling updated
    expect(new Date(item!.schedule.due).getTime()).toBeGreaterThan(clockMs);
    readingBeforeListening = after.readingRecognition;
  }, 30_000);
});

describe('§14 Listening (steps 20–24): GoListen through the real shell, with a declared TEST fixture', () => {
  it('20–24. the stimulus is presented without the written answer, the response is recorded as listening evidence, and reading stays distinct', async () => {
    tick(MIN);
    ok(await api.appendEvents([buildCardAdded({ learnerId, enrolmentId, languageId: 'sq', at: nowIso(), deviceId: learnerDevice, producerVersion: 'cert', unitId: LEMMA, unitKind: 'lexeme', dimension: 'auditory-recognition', family: 'audio-to-meaning', addedBy: 'learner' })]));
    const availability = await audioDeps.availability('sq');                                 // 20. "validated" audio: the TEST fixture, reported as such
    expect(availability).toMatchObject({ available: true, eligibleForEvidence: true });
    await openPractice();
    await practice!.ctx.syncNow({ force: true });                                              // the device pulls the card added from the other device
    await go('review', '#review-home > *');
    await until(() => !!practiceRoot.querySelector('#pref-listening'), 8000);
    const pref = pq<HTMLInputElement>('#pref-listening');
    if (!pref.checked) { pref.click(); pref.dispatchEvent(new Event('change', { bubbles: true })); await flush(10); await go('settings'); await go('review', '#review-home > *'); }   // leave and return: the home is re-read with the saved preference
    expect(pq<HTMLInputElement>('#pref-listening').checked).toBe(true);
    try { await startSession(); } catch (e) {
      const deck = foldDeckItems(await events(learnerId), scheduler, { languageId: 'sq', now: nowIso() });
      const plan = planSession({ deck, intake: [], preferences: { languageId: 'sq', sessionMinutes: 10, maxNew: 5, desiredRetention: 0.9, includeListening: true, grammarShare: 0.2, prioritizeSaved: true }, audio: availability, scheduler, now: nowIso(), random: () => 0.5 });
      throw new Error(`${String(e)} | deck=${JSON.stringify(deck.map((d) => ({ item: d.itemId, dim: d.dimension, due: d.schedule.due, phase: d.schedule.phase, suspended: d.suspendedReason })))} | plan=${JSON.stringify({ items: plan.items.map((p) => p.item.itemId), skipped: plan.skipped, listening: plan.listeningCount })} now=${nowIso()}`);
    }
    let s = shown();
    const firstShown = practiceRoot.querySelector('#session .exercise')?.outerHTML.slice(0, 300);
    for (let i = 0; i < 8 && s && !s.family.startsWith('audio'); i++) { pq('#skip').click(); await flush(10); await until(() => !!practiceRoot.querySelector('#session .exercise') || !!practiceRoot.querySelector('#summary'), 8000); s = shown(); }
    expect(s?.family, `first=${firstShown} | ${practiceRoot.textContent ?? ''}`).toBe('audio-to-meaning');
    expect(practiceRoot.querySelector('#stimulus')).toBeNull();                              // 21. no written answer on screen
    expect(practiceRoot.querySelector('#session')!.textContent).not.toContain('libër');
    expect(practiceRoot.querySelector('#session')!.textContent).not.toMatch(/liber.wav|test:sq/); // the voice descriptor (which names a file) is never on screen before the answer
    pq('#audio-play').click();
    await until(() => played.includes('test://sq/liber.wav'), 5000);
    const before = await dimsOf(learnerId, LEMMA);
    const outcome = await answer((x) => (x.hasInput ? 'book' : x.choices.find((c) => /book/i.test(c)) ?? x.choices[0]));   // 22. respond
    expect(outcome).toMatch(/^Correct/);
    const reveal = practiceRoot.querySelector('#feedback')?.textContent ?? '';
    await next();
    for (let i = 0; i < 6 && shown(); i++) { pq('#skip').click(); await flush(10); await until(() => !!practiceRoot.querySelector('#session .exercise') || !!practiceRoot.querySelector('#summary'), 8000); }
    await practice!.ctx.syncNow({ force: true });
    await until(async () => (await store.list({ learnerId, kinds: ['ListeningAssessed'] })).length >= 1, 8000);
    const la = (await store.list({ learnerId, kinds: ['ListeningAssessed'] }))[0];           // 23. listening evidence
    expect(la.payload).toMatchObject({ answerShownBefore: false });
    expect(`${reveal} ${JSON.stringify(la.payload)}`).toMatch(/TEST asset|test:sq-liber-recording|recorded/); // the fixture is named as such, never a claim of Albanian audio
    expect(validateEvent(la)).toEqual([]);
    const after = await dimsOf(learnerId, LEMMA);                                             // 24. distinct estimates
    expect(after.listeningRecognition.positive).toBeGreaterThan(before.listeningRecognition.positive);
    expect(after.readingRecognition).toEqual(readingBeforeListening);
    expect(after.productiveRetrieval).toEqual(before.productiveRetrieval);
  }, 40_000);
});

describe('§14 Return to GoLearn (steps 25–29)', () => {
  it('25–29. the reader shows the updated learner state for the same form and keeps the deeper explanation', async () => {
    practice?.destroy(); practice = undefined;
    document.body.innerHTML = `<main><p id="passage">${PASSAGE}</p></main>`;                  // 25. reopen the reading environment
    await page({ type: MSG.syncNow });                                                        // 26. the worker refreshes its learner-model cache
    await flush(40);
    const r = reader();
    const out = await lookup(r, 'librin');                                                    // 27. the same form
    expect(out.status).toBe('shown');
    const t = r.text();
    expect(t).toMatch(/· [1-9]\d*× encounters/);                                      // 28. assistance reflects the model (the card shows the number of meetings only)
    expect(r.ui.root()!.querySelector('.rateBtn[aria-pressed="true"]')).not.toBeNull();       // ...and the word's level
    expect(t).not.toMatch(/· 0× encounters/);
    expect(t).not.toBe(firstCardText);
    (r.ui.root()!.querySelector('button.deeperBtn') as HTMLElement).click();                   // 29. the deeper explanation
    expect(r.ui.root()!.querySelector('.layer.l4')!.textContent).toMatch(/direct object|ending|accusative/i);
    expect(t).toContain('libër (NOUN)');
    const related = await lookup(reader(), 'çajin');                                          // 27. a related form of the same construction
    expect(related.status).toBe('shown');
  });
});

describe('§14 Writing (steps 30–37): GoTell through the real shell', () => {
  it('30–33. GoTell opens on the learner profile, proposes a prompt, and accepts independent writing', async () => {
    await openPractice();                                                                     // 30. open GoTell
    await go('tell', '#tell-new-draft');
    expect(pq('#tell-modes').textContent).toMatch(/Missionary/i);
    await go('tell/prompts/missionary', '#tell-suggest-btn');
    pq('#tell-suggest-btn').click();                                                          // 32. a suitable prompt, with its reason
    await until(() => !!practiceRoot.querySelector('#tell-suggestion [data-prompt]'), 8000);
    expect((pq('#tell-suggestion-reason').textContent ?? '').length).toBeGreaterThan(0);
    expect(practiceRoot.textContent).not.toMatch(/CEFR|\bA[12]\b|\bB[12]\b/);               // 31. the profile, without invented levels
    const write = pq('#tell-suggestion [data-prompt] button');
    write.click();
    await until(() => !!practiceRoot.querySelector('#writer-text'), 8000);
    draftId = decodeURIComponent(window.location.hash.replace(/^#\/tell\/write\//, ''));
    expect(draftId.length).toBeGreaterThan(0);
    expect(pq('#writer-text').getAttribute('lang')).toMatch(/^sq/);
    typeInto(pq<HTMLTextAreaElement>('#writer-text'), ATTEMPT);                               // 33. independent writing
    expect(pq<HTMLTextAreaElement>('#writer-text').value).toBe(ATTEMPT);
  }, 30_000);

  it('34–36. graded assistance (hint, then correction shown but never applied), a saved revision, and qualified evidence without text', async () => {
    pq('#writer-analyse').click();
    try { await until(() => !!practiceRoot.querySelector('mark.issue-mark[data-issue]'), 8000); }
    catch { throw new Error(`no issue mark: ${['#writer-analysis-summary', '#writer-analysis-error', '#writer-analysis', '#writer-status'].map((id) => `${id}=${practiceRoot.querySelector(id)?.textContent?.slice(0, 300) ?? '-'}`).join(' | ')}`); }
    const mark = pq('mark.issue-mark[data-issue]');
    expect(mark.getAttribute('data-class')).toBe('grammatically-wrong');
    expect(pq<HTMLTextAreaElement>('#writer-text').value).toBe(ATTEMPT);                      // analysis changes nothing
    const issueId = mark.getAttribute('data-issue')!;
    const card = () => pq(`[data-issue-card="${issueId}"]`);                              // the card is repainted after every step
    const level = async (n: number) => { (card().querySelector(`button[data-level="${n}"]`) as HTMLButtonElement).click(); await until(() => !!card().querySelector(`.tell-step[data-level="${n}"]`), 8000); return card().querySelector(`.tell-step[data-level="${n}"]`)!.textContent ?? ''; };
    const l1 = await level(1);                                                                // 34. graded assistance
    expect(l1).toMatch(/libër|definiteness/i);
    const l2 = await level(2);
    expect(l2).toMatch(/definite/i);
    expect(l2).not.toContain('te libri');
    typeInto(pq<HTMLTextAreaElement>('#writer-text'), REVISED);                               // the learner revises after the hint
    pq('#writer-analyse').click();                                                             // and checks the revision: the hinted sentence is now clean
    await until(() => !practiceRoot.querySelector('mark.issue-mark[data-issue]') && !!practiceRoot.querySelector('#writer-analysis-summary'), 8000);
    expect(pq<HTMLTextAreaElement>('#writer-text').value).toBe(REVISED);
    keyOn('s', document, { ctrl: true });                                                     // 35. save the revision
    await until(() => /Saved as version 1/.test(pq('#writer-status').textContent ?? ''), 10_000);
    const docs = ok<{ documents: Array<{ docId: string }> }>(await api.listDocuments()).documents;
    expect(docs.map((d) => d.docId)).toContain(draftId);
    const doc = ok<{ document: { body: string; kind: string } }>(await api.getDocument(draftId)).document;
    const record = decodeBody(doc as never);
    expect(record.versions).toHaveLength(1);
    expect(record.versions[0].text).toBe(REVISED);
    expect(record.versions[0].sentences.map((s) => s.authorship)).toEqual(['after-hint', 'independent']);
    await practice!.ctx.syncNow({ force: true });                                             // 36. writing evidence
    await until(async () => (await store.list({ learnerId, kinds: ['DraftSaved'] })).length >= 1, 8000);
    const prods = await store.list({ learnerId, kinds: ['ProductionRecorded'] });
    expect(prods).toHaveLength(2);
    expect(prods.map((p) => (p.payload as { authorship: string }).authorship).sort()).toEqual(['after-hint', 'independent']);
    const all = await events(learnerId);
    expect(JSON.stringify(all)).not.toMatch(/Unë shkoj|lexoj librin|shkoj te/);
    for (const e of all) expect(validateEvent(e)).toEqual([]);
    const d = await dimsOf(learnerId, LEMMA);
    expect(d.contextualProduction.positive, JSON.stringify(prods.map((p) => [p.subject.itemIds, p.payload]))).toBeGreaterThan(0);
  }, 40_000);

  it('37. GoTell operated without touching review schedules, and works for a learner with no review history', async () => {
    const all = await events(learnerId);
    const fromTell = all.filter((e) => /tell/.test(e.producer.app));
    expect(fromTell.length).toBeGreaterThan(0);
    expect(fromTell.every((e) => !/^Card|^ReviewItem|^AssessmentAnswered|^ListeningAssessed/.test(e.kind))).toBe(true);
    const deckBefore = foldDeckItems(all.filter((e) => !/tell/.test(e.producer.app)), scheduler, { languageId: 'sq', now: nowIso() });
    const deckAll = foldDeckItems(all, scheduler, { languageId: 'sq', now: nowIso() });
    expect(deckAll.map((d) => [d.itemId, d.schedule])).toEqual(deckBefore.map((d) => [d.itemId, d.schedule]));
    // a brand-new learner: GoTell home and a prompt with no review event at all
    const anon = createRepositoryApi({ baseUrl: BASE, fetch: serviceFetch });
    ok(await anon.createAccount({ email: 'bardh@albania.test', password: PASSWORD }));
    const bs = ok<{ token: string }>(await anon.createSession({ email: 'bardh@albania.test', password: PASSWORD, deviceId: 'dev-B0' }));
    ok(await createRepositoryApi({ baseUrl: BASE, fetch: serviceFetch, token: bs.token }).enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '9', goals: [{ kind: 'writing' }] }));
    practice!.destroy(); practice = undefined;
    await openPractice(true);                                                               // a fresh device for the second learner
    await until(() => !!practiceRoot.querySelector('#signin-form'), 8000);
    typeInto(pq<HTMLInputElement>('#signin-email'), 'bardh@albania.test');
    typeInto(pq<HTMLInputElement>('#signin-password'), PASSWORD);
    pq<HTMLFormElement>('#signin-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    try { await until(async () => ((await practiceArea.get('gopractice:session'))['gopractice:session'] as { email?: string } | undefined)?.email === 'bardh@albania.test', 8000); }
    catch { throw new Error(`second sign-in: ${JSON.stringify((await practiceArea.get('gopractice:session'))['gopractice:session'] ?? null).slice(0, 200)} status=${practiceRoot.querySelector('#signin-form .status')?.textContent ?? '-'}`); }
    await practice!.ready(); await flush(10);
    await until(() => practice!.current() === 'review' && !!practiceRoot.querySelector('#review-home > *'), 8000);   // the sign-in lands on GoReview first
    await go('tell', '#tell-new-draft');
    pq('#tell-new-draft').click();
    await until(() => !!practiceRoot.querySelector('#writer-text'), 8000);
    typeInto(pq<HTMLTextAreaElement>('#writer-text'), 'Unë jam në shtëpi.');
    pq('#writer-analyse').click();
    await until(() => !!practiceRoot.querySelector('#writer-analysis-summary'), 8000);
    expect(pq('#writer-analysis-summary').textContent).toMatch(/sentence/i);
    practice!.destroy(); practice = undefined;
  }, 40_000);
});

describe('§14 Reconstruct learner state (steps 38–43)', () => {
  let history: StoredEvent[] = [];

  it('38. the complete event history is inspectable, valid, from three producers, and holds no text', async () => {
    history = await events(learnerId);
    expect(history.length).toBeGreaterThan(8);
    for (const e of history) expect(validateEvent(e)).toEqual([]);
    const apps = new Set(history.map((e) => e.producer.app));
    expect([...apps].some((a) => /golearn/.test(a))).toBe(true);
    expect([...apps].some((a) => /review/.test(a))).toBe(true);
    expect([...apps].some((a) => /tell/.test(a))).toBe(true);
    const kinds = new Set<string>(history.map((e) => e.kind));
    for (const k of ['SelectionLookedUp', 'ItemMarked', 'ListeningAssessed', 'DraftSaved', 'ProductionRecorded']) expect(kinds.has(k), k).toBe(true);
    expect(kinds.has('CardReviewed') || kinds.has('AssessmentAnswered')).toBe(true);
    expect(JSON.stringify(history)).not.toMatch(/lexojnë|kuzhinë|Unë shkoj|shkoj te libri/);
    expect(JSON.stringify(history)).not.toContain(token);
    const seqs = history.map((e) => e.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(new Set(history.map((e) => e.id)).size).toBe(history.length);
  });

  it('39–40. replaying the history into a fresh projection reproduces the current learner state exactly', async () => {
    const fresh = createMemoryStore({ now: nowIso });
    const ids = [...new Set(history.flatMap((e) => e.subject.itemIds ?? []))];
    await fresh.putUnits(await store.getUnits(ids));
    await fresh.putAliases(await store.aliasesFor(ids));
    const shuffled = [...history].sort((a, b) => (a.id < b.id ? 1 : -1));            // arrival order deliberately scrambled
    const outcomes = await fresh.append(learnerId, shuffled.map(({ seq: _s, recordedAt: _r, ...e }) => e as GoEvent));
    expect(outcomes.every((o) => o.stored)).toBe(true);
    const replay = createProjectionEngine({ store: fresh, now: nowIso });
    const current = await engine.knowledge(learnerId, ids);
    const rebuilt = await replay.knowledge(learnerId, ids);
    const norm = (rows: UnitKnowledge[]) => rows.map((r) => ({ unitId: r.unitId, dims: r.dimensions, basis: r.basis.events, retention: r.retention, uncertainty: r.uncertainty })).sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
    expect(norm(rebuilt)).toEqual(norm(current));
    await engine.rebuild(learnerId);                                                       // and the live engine's own rebuild agrees with its incremental state
    expect(norm(await engine.knowledge(learnerId, ids))).toEqual(norm(current));
  });

  it('41. no duplicate credit: re-sending the whole history (and a sync retry) changes nothing', async () => {
    const before = await engine.knowledge(learnerId, [LEMMA]);
    const resent = await api.appendEvents(history.map(({ seq: _s, recordedAt: _r, ...e }) => e as GoEvent));
    expect(resent.ok, resent.ok ? '' : `${resent.status} ${String(resent.error)}: ${String(resent.message)} ${JSON.stringify(resent.body).slice(0, 600)}`).toBe(true);
    if (resent.ok) expect((resent.data as { outcomes: Array<{ stored: boolean }> }).outcomes.every((o) => !o.stored)).toBe(true);
    const push = await api.syncPush({ deviceId: learnerDevice, clientTime: nowIso(), events: history.filter((e) => e.kind === 'ListeningAssessed').map(({ seq: _s, recordedAt: _r, ...e }) => e as GoEvent) });
    expect(push.ok, push.ok ? '' : `${push.status} ${String(push.message)} ${JSON.stringify(push.body).slice(0, 400)}`).toBe(true);
    if (push.ok) expect(push.data.outcomes.every((o) => !o.stored)).toBe(true);
    expect((await events(learnerId)).length).toBe(history.length);
    expect(await engine.knowledge(learnerId, [LEMMA])).toEqual(before);
  });

  it('42. the skill dimensions of "libër" rest on separate evidence', async () => {
    const d = await dimsOf(learnerId, LEMMA);
    const count = (kind: GoEvent['kind'], pred: (e: StoredEvent) => boolean = () => true) => history.filter((e) => e.kind === kind && (e.subject.itemIds ?? []).includes(LEMMA) && pred(e)).length;
    expect(d.exposure.observations).toBeGreaterThanOrEqual(count('SelectionLookedUp'));
    expect(d.listeningRecognition.observations).toBe(count('ListeningAssessed'));
    expect(d.listeningRecognition.observations).toBe(1);
    expect(d.listeningRecognition.positive).toBeGreaterThan(0);
    // only an unassisted clean sentence is contextual production; a clean sentence written after a hint counts as assisted recognition
    expect(d.contextualProduction.observations).toBe(count('ProductionRecorded', (e) => (e.payload as { usedCorrectly?: boolean; assisted?: boolean }).usedCorrectly === true && (e.payload as { assisted?: boolean }).assisted === false));
    expect(d.assistedRecognition.observations).toBeGreaterThanOrEqual(count('ProductionRecorded', (e) => (e.payload as { assisted?: boolean }).assisted === true));
    expect(d.grammaticalUnderstanding.observations).toBe(0);
    const written = count('CardReviewed') + count('AssessmentAnswered');
    expect(written).toBeGreaterThanOrEqual(2);
    expect(d[writtenDim].observations + (writtenDim === 'readingRecognition' ? 0 : d.readingRecognition.observations)).toBeGreaterThanOrEqual(2);
    expect(d.listeningRecognition.score).not.toBe(d[writtenDim].score);
  });

  it('43. access is per learner: another learner, a team leader and an anonymous caller get nothing', async () => {
    const anon = createRepositoryApi({ baseUrl: BASE, fetch: serviceFetch });
    expect((await anon.listEvents({ limit: 10 })).ok).toBe(false);
    expect((await anon.getDocument(draftId)).ok).toBe(false);
    const s = ok<{ token: string; learnerId: string }>(await anon.createSession({ email: 'bardh@albania.test', password: PASSWORD, deviceId: 'dev-B' }));
    await store.putTeamMember('albania', s.learnerId, 'leader', nowIso());                    // a leader of the same mission team
    const leader = createRepositoryApi({ baseUrl: BASE, fetch: serviceFetch, token: s.token });
    const theirs = ok<{ events: GoEvent[] }>(await leader.listEvents({ limit: 1000 })).events;
    expect(theirs.every((e) => e.learnerId === s.learnerId)).toBe(true);
    expect(theirs.some((e) => e.kind === 'ListeningAssessed' || e.kind === 'ProductionRecorded')).toBe(false);
    expect(ok<{ knowledge: UnitKnowledge[] }>(await leader.knowledge([LEMMA])).knowledge).toHaveLength(0);
    expect((await leader.candidates(enrolmentId, 10)).ok).toBe(false);
    const doc = await leader.getDocument(draftId);
    expect(doc.ok).toBe(false);
    expect([403, 404]).toContain(doc.ok ? 0 : doc.status);
    expect((await leader.deleteDocument(draftId)).ok).toBe(false);
    const forged = await leader.appendEvents([{ ...history.find((e) => e.kind === 'ListeningAssessed')!, id: 'forged:1', dedupeKey: 'forged:1' } as GoEvent]);
    expect(forged.ok).toBe(false);
    expect((await store.list({ learnerId, kinds: ['ListeningAssessed'] })).length).toBe(1);
    expect((await api.getDocument(draftId)).ok).toBe(true);                                   // the owner still can
  });
});
