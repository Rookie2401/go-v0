/**
 * The rig behind the Korean journey (test/certification/korean-journey.test.ts), built from the same parts as the Albanian reference
 * journey (test/certification/albanian-reference-e2e.test.ts), with nothing between a screen and the Repository replaced:
 *   - the Repository service (`handle`, SQLite in memory, real scrypt, real linguistics and projection engine), reached through an in-process `fetch`;
 *   - the GoLearn setup application and its real pack installer (the languages page), the real background worker with the real Korean pack
 *     (dictionary shards read from public/dict/ko), the real content-script controller and card, and the real Active page scan;
 *   - the real GoReview shell with its real builders, scheduler, planner and pack facts (stem lexicon shards read from public/lexicon/ko).
 * Faked: the network (in-process `fetch`), the clock, the timers, the audio, the chrome API. Needs jsdom (a test file says `@vitest-environment jsdom`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { URL as NodeURL } from 'node:url';
import { expect } from 'vitest';
import type { StoredEvent, UnitKnowledge } from '../../../packages/repository-contract/src';
import { createProjectionEngine } from '../../../packages/repository-engine/src';
import { createLinguisticService } from '../../../packages/repository-linguistics/src';
import { openSqliteStore } from '../../../packages/repository-store/src';
import { createRepositoryApi, type RepositoryApi } from '../../../packages/repository-service/src/api';
import { nodeCrypto } from '../../../packages/repository-service/src/crypto-node';
import { handle } from '../../../packages/repository-service/src/handler';
import { adaptLinguistics } from '../../../packages/repository-service/src/linguistics-adapter';
import type { ServiceDeps } from '../../../packages/repository-service/src/deps';
import { UnsupportedAdapter, WebGenericAdapter } from '../../../packages/golearn-extension/src/adapters';
import { createBackground } from '../../../packages/golearn-extension/src/background/core';
import { LookupController } from '../../../packages/golearn-extension/src/content/controller';
import { createBridge } from '../../../packages/golearn-extension/src/content/services';
import { lemmaLookupKeys } from '../../../packages/repository-contract/src/lemma-display';
import { getAnalyser, hasAnalyser, parseSelection } from '../../../packages/golearn-extension/src/parser';
import { createLexiconPreparer } from '../../../packages/golearn-extension/src/lexicon/prepare';
import { MSG, type ChromeApi } from '../../../packages/golearn-extension/src/platform';
import { createCardUI } from '../../../packages/golearn-extension/src/popup/card';
import { createMemoryStorageArea } from '../../../packages/golearn-extension/src/store';
import { createFsrsScheduler, evidenceFor, ratingFor, registry } from '../../../packages/goreview/src';
import { createApp as createPracticeApp, type AppHandle } from '../../../packages/goreview/app/app';
import { createReviewEngine } from '../../../packages/goreview/app/engine';
import { packFactsFor } from '../../../packages/goreview/app/packFacts';
import type { Deps as PracticeDeps } from '../../../packages/goreview/app/ports';
import { createMemoryArea } from '../../../packages/repository-sync/src';
import { koAdapter } from '../../../src/adapters/ko';
import { createChromeFake } from '../../extension/chromeFake';
import { stubLayout } from '../../golearn-app/domtools';
import { flush, until } from '../../golearn-app/helpers';
import { registerAllAnalysers } from '../analysers';

(globalThis as { URL: typeof URL }).URL = NodeURL as unknown as typeof URL;

export const ASSETS = path.resolve(__dirname, '../../../public');
/** Built data this journey reads (public/dict/ko, public/lexicon/ko). Without it the journey cannot run: a test file skips on this. */
export const DATA_PRESENT = fs.existsSync(path.join(ASSETS, 'dict/ko/manifest.json')) && fs.existsSync(path.join(ASSETS, 'lexicon/ko/standard/manifest.json'));

export const BASE = 'http://127.0.0.1:8790';
export const EMAIL = 'min@korea.test';
export const PASSWORD = 'a very long password 123';
export const MIN = 60_000;

export const fileFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  const file = path.join(ASSETS, decodeURIComponent(url.pathname));
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('not found', { status: 404 });
}) as typeof fetch;

export const q = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => { const el = root.querySelector<T>(sel); if (!el) throw new Error(`not found: ${sel}`); return el; };
export const typeInto = (el: HTMLInputElement | HTMLTextAreaElement, value: string): void => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };

export interface Counted { urls: string[] }

export function createJourneyRig() {
  // ───────────── the real Repository ─────────────
  let clockMs = Date.now();
  const nowIso = (): string => new Date(clockMs).toISOString();
  const tick = (ms: number): void => { clockMs += ms; };
  const MIGRATIONS = path.resolve(__dirname, '../../../packages/repository-store/migrations');
  const store = openSqliteStore(':memory:', { now: nowIso, migrationsDir: MIGRATIONS });
  const engine = createProjectionEngine({ store, now: nowIso });
  const serviceDeps: ServiceDeps = { store, engine, linguistics: adaptLinguistics(createLinguisticService(store, { now: nowIso })), crypto: nodeCrypto, now: nowIso, log: () => {} };
  const net = { down: false, calls: [] as string[] };
  /** Every dictionary file the worker read (public/dict/ko/…). */
  const dictRequests: string[] = [];
  const serviceFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    net.calls.push(`${init?.method ?? 'GET'} ${new URL(u, 'http://x/').pathname}`);
    if (net.down) throw new TypeError('Failed to fetch');
    return handle(new Request(input, init), serviceDeps);
  }) as typeof fetch;
  // the worker's own fetch: dictionary files from public/, everything else is the service (down when the network is)
  const workerFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (u.includes('/dict/')) { dictRequests.push(new URL(u).pathname); return fileFetch(input); }
    return serviceFetch(input, init);
  }) as typeof fetch;

  // ───────────── GoLearn: the worker, the chrome fake ─────────────
  const fake = createChromeFake();
  const EXT = fake.runtime.id!;
  const PAGE_SENDER = { id: EXT, url: `chrome-extension://${EXT}/app/index.html` };
  fake.runtime.sendMessage = (message) => fake.dispatch(message, PAGE_SENDER);
  const area = fake.local as unknown as ReturnType<typeof createMemoryStorageArea>;
  const page = (m: Record<string, unknown>) => fake.dispatch(m, PAGE_SENDER) as Promise<any>;
  const content = (m: Record<string, unknown>) => fake.dispatch(m, { id: EXT, tab: { id: 7 }, url: 'https://news.example.test/ko' }) as Promise<any>;
  const workerTimers: Array<{ fire(): void }> = [];
  const fireWorkerTimers = async (): Promise<void> => { for (const t of workerTimers.splice(0)) t.fire(); await flush(40); };
  let restoreLayout: (() => void) | undefined;
  let controller: LookupController | undefined;

  /** The lexicon shards the content script asked for (a count by file: the lazy loading assertions read it). */
  const lexiconRequests: string[] = [];
  const lexiconFetch = (async (input: RequestInfo | URL) => { lexiconRequests.push(new URL(String(input), 'http://assets.local/').pathname); return fileFetch(input); }) as typeof fetch;
  const preparer = createLexiconPreparer({ runtime: { getURL: (p: string) => `http://assets.local/${p}` } } as never, lexiconFetch, 'http://assets.local/');

  function start(): void {
    restoreLayout = stubLayout();
    registerAllAnalysers();
    const worker = createBackground(fake as unknown as ChromeApi, {
      fetch: workerFetch,
      timers: { set: (fn, ms) => { const t = { ms, fired: false, fire() { if (!t.fired) { t.fired = true; fn(); } } }; workerTimers.push(t); return t; }, clear: () => {} },
    });
    worker.register();
  }
  async function stop(): Promise<void> { controller?.dispose(); practice?.destroy(); restoreLayout?.(); await store.close(); }

  /** A reader on the current document: the real controller, the real card, the real bridge to the worker, Korean registered, shards prepared on demand. */
  function reader(opts: { prepare?: boolean } = {}) {
    controller?.dispose();
    const bridge = createBridge(fake.contentChrome(7));
    const holder: { c?: LookupController } = {};
    const ui = createCardUI({ doc: document, speech: null, onDismiss: () => holder.c?.onCardDismissed() });
    controller = new LookupController({
      doc: document, adapters: [new WebGenericAdapter({ doc: document, segmentSentences: (t) => koAdapter.segmentSentences(t) }), new UnsupportedAdapter()],
      parse: parseSelection, ui, store: bridge.events, metrics: bridge.metrics, services: bridge, analysers: ['ko'],
      ...(opts.prepare === false ? {} : { prepareLexicon: (languageId: string, text: string) => preparer.prepare(languageId, text) }),
      analyserOf: getAnalyser, hasAnalyser, segmenterFor: (l: string) => { const a = getAnalyser(l); return a ? (t: string) => a.segmentSentences(t) : undefined; },
      glossForms: (lemma: string, pos: string | undefined, languageId: string) => { const a = getAnalyser(languageId); return a ? [...new Set([...lemmaLookupKeys(languageId, lemma).map((k) => a.normalize(k)), ...(a.lemmaVariants?.(lemma, pos as never) ?? []).map((v: string) => a.normalize(v))])].slice(0, 8) : []; },
      identity: { learnerId: 'pending', enrolmentId: 'pending', deviceId: 'pending' }, version: '0.2.0', sessionId: `ko-${clockMs}`, nextFrame: () => Promise.resolve(),
    } as never);
    holder.c = controller;
    controller.enable();
    return { ui, c: controller, text: () => ui.root()?.textContent ?? '' };
  }
  type Reader = ReturnType<typeof reader>;
  async function lookup(r: Reader, selectIn: HTMLElement, word: string, select: (root: Node, needle: string) => unknown) {
    select(selectIn, word);
    const out = await r.c.lookup({ trigger: 'command' });
    if (out.status !== 'shown') throw new Error(`lookup of ${word}: ${out.status} ${(out as { message?: string }).message ?? ''}`);
    await out.settled;
    await flush(40);
    return out;
  }

  // ───────────── GoReview: the real shell ─────────────
  let practice: AppHandle | undefined;
  let practiceRoot: HTMLElement | undefined;
  let practiceArea = createMemoryArea();
  let ids = 0;
  const factsFor = packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' });
  async function openPractice(opts: { fresh?: boolean; deviceId?: string } = {}): Promise<AppHandle> {
    if (opts.fresh) practiceArea = createMemoryArea();
    if (practice) await flush(30); // let the previous shell's pending reads settle before it is destroyed (a destroyed shell's late work would throw into the next test)
    practice?.destroy();
    document.body.innerHTML = '';
    practiceRoot = document.createElement('div');
    practiceRoot.id = 'app';
    document.body.append(practiceRoot);
    const reviewEngine = createReviewEngine({ builders: registry, evidenceFor, ratingFor, factsFor, now: nowIso, random: () => 0.5 });
    const deps: PracticeDeps = {
      win: window, doc: document, fetch: fileFetch, area: practiceArea, config: { serviceUrl: BASE, assetBaseUrl: 'http://assets.local/' },
      createApi: (baseUrl, token) => createRepositoryApi({ baseUrl, fetch: serviceFetch, token }),
      engine: reviewEngine, audio: null, now: () => new Date(clockMs), newId: () => `ko-${++ids}`, random: () => 0.5, appVersion: 'cert', autoSync: false,
      timers: { set: () => 0, clear: () => undefined },
    } as PracticeDeps;
    practice = createPracticeApp(practiceRoot, deps);
    await practice.ready();
    return practice;
  }
  async function signInPractice(): Promise<void> {
    await until(() => !!practiceRoot!.querySelector('#signin-form'), 8000);
    typeInto(q<HTMLInputElement>('#signin-email', practiceRoot), EMAIL);
    typeInto(q<HTMLInputElement>('#signin-password', practiceRoot), PASSWORD);
    q<HTMLFormElement>('#signin-form', practiceRoot).dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await until(async () => !!(await practiceArea.get('gopractice:session'))['gopractice:session'], 8000);
    await practice!.ready(); await flush(10);
  }

  const events = (learnerId: string): Promise<StoredEvent[]> => store.list({ learnerId, limit: 5000 });
  const knowledge = async (learnerId: string, id: string): Promise<UnitKnowledge | undefined> => (await engine.knowledge(learnerId, [id]))[0];

  return {
    store, engine, serviceDeps, net, dictRequests, serviceFetch, fileFetch, fake, EXT, area, page, content, fireWorkerTimers, start, stop, reader, lookup,
    lexiconRequests, preparer, openPractice, signInPractice, factsFor, events, knowledge, nowIso, tick, scheduler: createFsrsScheduler({ desiredRetention: 0.9 }),
    get practice() { return practice!; }, get practiceRoot() { return practiceRoot!; }, get practiceArea() { return practiceArea; }, get clockMs() { return clockMs; },
    get controller() { return controller; },
    api(token: string): RepositoryApi { return createRepositoryApi({ baseUrl: BASE, fetch: serviceFetch, token }); },
  };
}
export type JourneyRig = ReturnType<typeof createJourneyRig>;
export { MSG, expect };
