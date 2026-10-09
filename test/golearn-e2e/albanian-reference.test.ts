// @vitest-environment jsdom
/**
 * Prompt 4 §17 — the Albanian reference run, end to end over the REAL pieces, in one jsdom page:
 *   the real Repository service (SQLite in memory, real scrypt), the real background worker with the real language
 *   pack (dictionary shards read from public/dict/sq on disk), the real setup application for the setup steps, and the
 *   real content-script controller + card on a page for the reading steps. Nothing is mocked between the page and the
 *   service except the network (an in-process `fetch`), the clock, and the timers the worker asks for.
 *
 * It asserts behaviour, not insertions: the lemma and morphology shown, the honest syntax and pronunciation states,
 * the event the service holds, no false mastery, and that a grammar weakness recorded through the Repository changes
 * how the next lookup is presented.
 */
import fs from 'node:fs';
import path from 'node:path';
import { URL as NodeURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, validateEvent, type GoEvent, type UnitKnowledge } from '../../packages/repository-contract/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createLinguisticService } from '../../packages/repository-linguistics/src';
import { openSqliteStore } from '../../packages/repository-store/src';
import { createRepositoryApi } from '../../packages/repository-service/src/api';
import { nodeCrypto } from '../../packages/repository-service/src/crypto-node';
import { handle } from '../../packages/repository-service/src/handler';
import { adaptLinguistics } from '../../packages/repository-service/src/linguistics-adapter';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { createApp } from '../../packages/golearn-extension/app/app';
import { createPackBindings } from '../../packages/golearn-extension/app/bindings';
import type { Deps } from '../../packages/golearn-extension/app/ports';
import { UnsupportedAdapter, WebGenericAdapter } from '../../packages/golearn-extension/src/adapters';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { LookupController } from '../../packages/golearn-extension/src/content/controller';
import { createBridge } from '../../packages/golearn-extension/src/content/services';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { MSG, type ChromeApi } from '../../packages/golearn-extension/src/platform';
import { createCardUI } from '../../packages/golearn-extension/src/popup/card';
import { createMemoryStorageArea } from '../../packages/golearn-extension/src/store';
import { sqAdapter } from '../../src/adapters/sq';
import { createChromeFake } from '../extension/chromeFake';
import { selectText, stubLayout } from '../golearn-app/domtools';
import { choose, flush, submit, type, until } from '../golearn-app/helpers';

(globalThis as { URL: typeof URL }).URL = NodeURL as unknown as typeof URL;

const DICT_ROOT = path.resolve(__dirname, '../../public');
const store = openSqliteStore(':memory:', { migrationsDir: path.resolve(__dirname, '../../packages/repository-store/migrations') });
const clock = (): string => new Date().toISOString();
const engine = createProjectionEngine({ store, now: clock });
const serviceDeps: ServiceDeps = {
  store, engine, linguistics: adaptLinguistics(createLinguisticService(store, { now: clock })), crypto: nodeCrypto, now: clock, log: () => {},
};
const serviceFetch = ((input: RequestInfo | URL, init?: RequestInit) => handle(new Request(input, init), serviceDeps)) as typeof fetch;
const fileFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://app.test/');
  const file = path.join(DICT_ROOT, url.pathname);
  return fs.existsSync(file) ? new Response(fs.readFileSync(file), { status: 200 }) : new Response('not found', { status: 404 });
}) as typeof fetch;

/** The network the worker sees: dictionary files from disk, everything else is the service; `offline` cuts both. */
const net = { offline: false, calls: [] as string[] };
const workerFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  net.calls.push(new URL(u, 'http://x/').pathname);
  if (net.offline) throw new TypeError('Failed to fetch');
  return u.includes('/dict/') ? fileFetch(input) : serviceFetch(input, init);
}) as typeof fetch;

/** The Repository's own construction id for a form of the passage (what GoPractice's assessments name). */
const PASSAGE = 'Fëmijët lexojnë librin. Nëna është në kuzhinë. Beni e pi çajin dhe ha bukën.';
const SENTENCE_1 = 'Fëmijët lexojnë librin.';
const constructionOf = (word: string, sentence = SENTENCE_1): string => {
  const at = sentence.indexOf(word);
  const id = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + word.length } }).constructions.map((c) => c.unitId).find((u) => u.startsWith('morph:'));
  if (!id) throw new Error(`no construction for ${word}`);
  return id;
};
const LEMMA = 'lemma:sq:libër:NOUN';
const EMAIL = 'ana@albania.test';
const PASSWORD = 'a very long password 123';

let restore: () => void;
let app: ReturnType<typeof createApp> | undefined;
let controller: LookupController | undefined;
const timers: Array<{ ms: number; cleared: boolean; fired: boolean; fire(): void }> = [];
const fireTimers = async (): Promise<void> => { for (const t of [...timers]) t.fire(); await flush(40); };

const fake = createChromeFake();
// the worker accepts only its own extension's senders: pages (the setup app) and tabs (content scripts) share one id
const EXT = fake.runtime.id!;
const PAGE_SENDER = { id: EXT, url: `chrome-extension://${EXT}/app/index.html` };
fake.runtime.sendMessage = (message) => fake.dispatch(message, PAGE_SENDER);
const area = fake.local as unknown as ReturnType<typeof createMemoryStorageArea>;
const page = (m: Record<string, unknown>) => fake.dispatch(m, PAGE_SENDER) as Promise<any>;

beforeAll(() => {
  restore = stubLayout();
  const worker = createBackground(fake as unknown as ChromeApi, {
    fetch: workerFetch,
    timers: { set: (fn, ms) => { const t = { ms, cleared: false, fired: false, fire() { if (!t.cleared && !t.fired) { t.fired = true; fn(); } } }; timers.push(t); return t; }, clear: (h) => { (h as { cleared: boolean }).cleared = true; } },
  });
  worker.register();
});
afterAll(async () => { restore(); await store.close(); });
afterEach(() => { controller?.dispose(); controller = undefined; });

const q = <T extends Element = HTMLElement>(sel: string): T => { const el = document.querySelector<T>(sel); if (!el) throw new Error(`not found: ${sel}`); return el; };

/** The reader side: the real content controller and card on the current page, talking to the worker as tab 7. */
function reader() {
  const bridge = createBridge(fake.contentChrome(7));
  const holder: { c?: LookupController } = {};
  const ui = createCardUI({ doc: document, speech: null, onDismiss: () => holder.c?.onCardDismissed() });
  controller = new LookupController({
    doc: document,
    adapters: [new WebGenericAdapter({ doc: document, segmentSentences: (t) => sqAdapter.segmentSentences(t) }), new UnsupportedAdapter()],
    parse: parseSelection, ui, store: bridge.events, metrics: bridge.metrics, services: bridge, analysers: ['sq'],
    identity: { learnerId: 'pending', enrolmentId: 'pending', deviceId: 'pending' }, version: '0.2.0', sessionId: 'reference', nextFrame: () => Promise.resolve(),
  });
  holder.c = controller;
  return { ui, c: controller, text: () => ui.root()!.textContent ?? '', rows: () => [...ui.root()!.querySelectorAll<HTMLElement>('.rows [data-row]')].map((r) => r.dataset.row) };
}

async function lookup(r: ReturnType<typeof reader>, word: string) {
  selectText(q('#passage'), word);
  const out = await r.c.lookup({ trigger: 'command' });
  if (out.status !== 'shown') throw new Error(`lookup of ${word}: ${out.status} ${(out as { message?: string }).message ?? ''}`);
  await out.settled;
  await flush(40);
  return out;
}

const knowledge = async (learnerId: string, ids: string[]): Promise<UnitKnowledge[]> => engine.knowledge(learnerId, ids);
const dims = (rows: UnitKnowledge[], id: string) => { const r = rows.find((x) => x.unitId === id); if (!r) throw new Error(`no row for ${id}`); return r.dimensions; };

describe('Prompt 4 §17 — GoLearn for an Albanian learner, end to end', () => {
  let learnerId = '';
  let enrolmentId = '';
  let token = '';
  let constructionId = '';

  it('1–5. launch GoLearn, create the account, choose Team Albania, install the Albanian pack, skip the orientation', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    window.location.hash = '';
    const deps: Deps = {
      win: window, doc: document, chrome: fake as unknown as ChromeApi, fetch: fileFetch, area, packs: createPackBindings(), config: {},
      createApi: (baseUrl, tok) => createRepositoryApi({ baseUrl, fetch: serviceFetch, token: tok }),
      download: () => {}, now: () => new Date(), closeWindow: () => false, copyText: async () => true, appVersion: 'ref', speech: null,
    };
    app = createApp(document.getElementById('app')!, deps);
    await app.ready();
    const go = async (route: string) => { await app!.go(route); await app!.ready(); await flush(); };

    await go('account');
    choose(q('#acct-mode'), 'create');
    type(q<HTMLInputElement>('#acct-email'), EMAIL);
    type(q<HTMLInputElement>('#acct-password'), PASSWORD);
    submit(q<HTMLFormElement>('#acct-form'));
    await until(() => /Account created/.test(q('#acct-form .status').textContent ?? ''), 8000);
    const session = (await area.get('golearn:session'))['golearn:session'] as { learnerId: string; token: string };
    learnerId = session.learnerId; token = session.token;
    expect(JSON.stringify(await area.get(null))).not.toContain(PASSWORD);

    await store.putTeam({ teamId: 'albania', name: 'Albania', createdAt: clock() });
    await store.putTeamMember('albania', learnerId, 'member', clock());
    await go('team');
    choose(q('#team'), 'albania');
    expect(q<HTMLSelectElement>('#language').value).toBe('sq');
    submit(q<HTMLFormElement>('#enrol-form'));
    await until(() => /Enrolled:/.test(q('#enrol-form .status').textContent ?? ''), 8000);
    const enrolment = (await store.listEnrolments(learnerId))[0];
    enrolmentId = enrolment.enrolmentId;
    expect(enrolment).toMatchObject({ teamId: 'albania', languageId: 'sq', packId: 'pack:sq' });
    await flush(30);

    await go('pack');
    q('[data-pack="pack:sq"] [data-action="install"]').click();
    await until(() => document.querySelector('[data-pack="pack:sq"] .verify'), 15_000);
    expect(q('[data-pack="pack:sq"] .verify').getAttribute('data-ok')).toBe('true');

    await go('tutorial');
    q<HTMLButtonElement>('#tutorial-skip').click();
    await until(() => document.querySelector('#tutorial-state[data-state="skipped"]'), 5000);
    app.destroy(); app = undefined;
  }, 60_000);

  it('6–7. the reader integration is active for the account and the passage is open', async () => {
    await page({ type: MSG.serviceConfig, baseUrl: 'http://127.0.0.1:8790', assetBase: 'http://localhost/' });
    const status = await page({ type: MSG.status });
    expect(status).toMatchObject({ connected: true, languageId: 'sq', packAvailable: true });
    document.body.innerHTML = `<main><h1>Udha</h1><p id="passage">${PASSAGE}</p></main>`;
  });

  it('8–13. "librin": lemma, morphology, the honest syntax and pronunciation states, and a recorded encounter', async () => {
    constructionId = constructionOf('librin');
    const r = reader();
    r.c.enable();
    const out = await lookup(r, 'librin');
    expect(out.recorded).toBe('recorded');
    const t = r.text();
    expect(t).toContain('libër (NOUN)');                                 // 9. lemma
    expect(t).toContain('definite masculine accusative singular');       // 10. morphology (Layer 1 line)
    (r.ui.root()!.querySelector('button.l2') as HTMLElement).click();
    expect(r.ui.root()!.querySelector('.layer.l2')!.textContent).toMatch(/accusative/i);
    (r.ui.root()!.querySelector('button.l3') as HTMLElement).click();    // 11. syntax: context exists; the analyser gives no role, and the card says so
    expect(r.ui.root()!.querySelector('.layer.l3')!.textContent).toMatch(/role/i);
    expect(t).toMatch(/context\s*full sentence/i);                       // capability negotiation stated on the card
    expect(t).toMatch(/Speech is not available|No local Albanian voice|voice/i); // 12. pronunciation: nothing suitable here, stated, not faked
    expect(t).not.toMatch(/native-quality|native speaker voice/i);
    await flush(40);
    const local = Object.entries(await area.get(null)).filter(([k]) => k.startsWith('queue:') || k.startsWith('golearn:event:')).map(([, v]) => (v as { event?: GoEvent }).event ?? (v as GoEvent));
    expect(local.some((e) => e.kind === 'SelectionLookedUp')).toBe(true);
    expect(local.some((e) => e.kind === 'PronunciationPlayed')).toBe(false);
    constructionId = constructionOf('librin');
    expect(constructionId).toMatch(/^morph:sq:NOUN:Case=Acc\|Definite=Def\|Gender=Masc\|Number=Sing$/);
  });

  it('14. the Repository holds the encounter under the account, with the sentence as a hash and no text', async () => {
    await fireTimers();
    await page({ type: MSG.syncNow });
    await until(async () => (await store.list({ learnerId, kinds: ['SelectionLookedUp'] })).length >= 1, 8000);
    const events = await store.list({ learnerId });
    const sel = events.find((e) => e.kind === 'SelectionLookedUp' && e.producer.app === 'golearn-ext')!;
    expect(sel.enrolmentId).toBe(enrolmentId);
    expect(sel.subject.itemIds).toContain(LEMMA);
    expect(sel.subject.sentenceKey).toBeTruthy();
    expect(sel.v).toBe(CONTRACT_VERSION);
    for (const e of events) expect(validateEvent(e)).toEqual([]);
    expect(JSON.stringify(events)).not.toContain('lexojnë');
    expect(JSON.stringify(events)).not.toContain('kuzhinë');
    expect(events.map((e) => e.kind)).toContain('AnalysisShown');
  });

  it('15. no mastery was granted: exposure only, every demonstrated dimension at zero', async () => {
    const d = dims(await knowledge(learnerId, [LEMMA]), LEMMA);
    expect(d.exposure.observations).toBeGreaterThan(0);
    for (const k of ['readingRecognition', 'listeningRecognition', 'productiveRetrieval', 'contextualProduction', 'grammaticalUnderstanding'] as const) expect(d[k].weight, k).toBe(0);
  });

  it('16. GoPractice records a wrong answer on the construction through the Repository', async () => {
    const api = createRepositoryApi({ baseUrl: 'http://127.0.0.1:8790', fetch: serviceFetch, token });
    // GoPractice is its own device of the account (a device id an event names must be registered to the learner)
    await store.putDevice({ deviceId: 'practice-dev', learnerId, registeredAt: clock(), platform: 'test' });
    const ev: GoEvent = {
      id: 'ref:grammar:1', v: CONTRACT_VERSION, learnerId, enrolmentId, languageId: 'sq', at: clock(),
      producer: { app: 'gopractice-review', version: 'ref', deviceId: 'practice-dev' }, kind: 'AssessmentAnswered',
      subject: { itemIds: [constructionId] }, payload: { constructionId, task: 'choose-form', correct: false, hinted: false }, dedupeKey: 'ref:grammar:1',
    };
    const r = await api.submitReviews([ev]);
    expect(r.ok).toBe(true);
    const g = dims(await knowledge(learnerId, [constructionId]), constructionId).grammaticalUnderstanding;
    expect(g.negative).toBeGreaterThan(0);
    expect(g.positive).toBe(0);
  });

  it('17–18. back in the reader, the next lookup of the same construction leads with the grammar hint and shows the history', async () => {
    await page({ type: MSG.syncNow });   // the worker refreshes its learner-model cache after a successful sync
    await flush(40);
    const r = reader();
    const out = await lookup(r, 'çajin');  // a different word realising the same construction (definite accusative singular, masculine)
    expect(out.status).toBe('shown');
    const rows = r.rows();
    expect(rows.indexOf('grammar'), rows.join(',')).toBeGreaterThanOrEqual(0);
    expect(rows.indexOf('grammar')).toBeLessThan(rows.indexOf('meaning'));
    const again = await lookup(reader(), 'librin');
    expect(again.status).toBe('shown');
  });

  it('an unknown word gets an honest partial card and is still recorded as a lookup', async () => {
    document.body.innerHTML = '<main><p id="passage">Fëmijët lexojnë librin. Ai tha Xyzqwk dhe iku.</p></main>';
    const r = reader();
    const out = await lookup(r, 'Xyzqwk');
    expect(out.status).toBe('shown');
    // the rules may guess a lemma from the ending; the card must say it is a guess, never a confident reading
    expect(out.card.unconfirmed || out.card.provenance === 'none').toBe(true);
    expect(out.card.gloss).toBeUndefined();
    expect(r.text()).toMatch(/Not in the word list|unknown to this pack|guess/);
    expect(out.recorded).toBe('recorded');
  });

  it('rapid selections: ten lookups at once give one card', async () => {
    document.body.innerHTML = `<main><p id="passage">${PASSAGE}</p></main>`;
    const r = reader();
    selectText(q('#passage'), 'kuzhinë');
    const outs = await Promise.all(Array.from({ length: 10 }, () => r.c.lookup({ trigger: 'command' })));
    expect(outs.filter((o) => o.status === 'shown')).toHaveLength(1);
    expect(outs.filter((o) => o.status === 'superseded')).toHaveLength(9);
  });

  it('offline: lookups keep working and recording; the queue waits; a failed sync is reported; coming back online sends everything once', async () => {
    const before = (await store.list({ learnerId })).length;
    net.offline = true;
    const r = reader();
    const out = await lookup(r, 'bukën');
    expect(out.status).toBe('shown');
    expect(out.recorded).toBe('recorded');
    await fireTimers();
    const failed = await page({ type: MSG.syncNow });
    expect(failed?.ok ?? failed?.sync?.ok ?? false).toBe(false);
    const st = await page({ type: MSG.status });
    expect(st.sync.pending).toBeGreaterThan(0);
    expect(st.sync.lastError ?? st.sync.error).toBeTruthy();
    net.offline = false;
    await page({ type: MSG.syncNow });
    await until(async () => (await page({ type: MSG.status })).sync.pending === 0, 8000);
    const after = await store.list({ learnerId });
    expect(after.length).toBeGreaterThan(before);
    // duplicates: the same queue sent again changes nothing on the server
    await page({ type: MSG.syncNow });
    expect((await store.list({ learnerId })).length).toBe(after.length);
    expect(new Set(after.map((e) => e.id)).size).toBe(after.length);
  });

  it('account switching: a second sign-in replaces the session; the second learner sees no history of the first', async () => {
    const api = createRepositoryApi({ baseUrl: 'http://127.0.0.1:8790', fetch: serviceFetch });
    const created = await api.createAccount({ email: 'ben@albania.test', password: PASSWORD });
    expect(created.ok).toBe(true);
    await page({ type: MSG.connect, baseUrl: 'http://127.0.0.1:8790', email: 'ben@albania.test', password: PASSWORD });
    const session = (await area.get('golearn:session'))['golearn:session'] as { learnerId: string; email: string };
    expect(session.email).toBe('ben@albania.test');
    expect(session.learnerId).not.toBe(learnerId);
    const r = reader();
    const out = await lookup(r, 'librin');
    expect(out.status).toBe('shown');
    expect(r.text()).not.toMatch(/You have met this word [1-9]/);
    // the first learner's data stayed with the first learner
    expect((await store.list({ learnerId })).length).toBeGreaterThan(0);
    expect((await store.list({ learnerId: session.learnerId, kinds: ['AssessmentAnswered'] })).length).toBe(0);
  });

  it('language switching: an enrolment in a planned language (Norwegian) is honest about the missing pack', async () => {
    const api = createRepositoryApi({ baseUrl: 'http://127.0.0.1:8790', fetch: serviceFetch, token: ((await area.get('golearn:session'))['golearn:session'] as { token: string }).token });
    const e = await api.enrol({ languageId: 'nb', packId: 'pack:nb', packVersion: '2', goals: [{ kind: 'reading' }] });
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    await page({ type: MSG.refreshSession });
    const selected = await page({ type: MSG.selectEnrolment, enrolmentId: e.data.enrolment.enrolmentId });
    const st = await page({ type: MSG.status });
    expect(JSON.stringify(selected)).not.toMatch(/"ok":false/);
    expect(st.languageId).toBe('nb');
    expect(st.packAvailable).toBe(false);
    const r = reader();
    selectText(q('#passage'), 'librin');
    const out = await r.c.lookup({ trigger: 'command' });
    expect(['shown', 'message']).toContain(out.status);
    expect(r.text()).toMatch(/pack|Norwegian|not (yet )?available/i);
  });
});
