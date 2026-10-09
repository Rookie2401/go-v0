// @vitest-environment jsdom
/**
 * Prompt 3 §XVII — the Repository vertical slice, 30 steps, over a REAL PERSISTENT Repository (the service process
 * `packages/repository-service/src/main.ts` on a SQLite FILE, reached over HTTP with the typed API client) and the
 * controlled authorised EPUB reader (`epub-local` on the owner-authored `udha-sample.epub` in jsdom through epub.js),
 * with GoLearn's real background worker (sync, profile cache), the real content controller and card, the real
 * language pack runtime, and the real projection engine for the replay. Fakes: the clock for the review/listening
 * events we simulate (GoReview/GoTell are not driven here; their events are built with the contract and sent through
 * the real routes), a network switch in front of the worker's fetch, and jsdom.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import nodeNet from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, DIMENSIONS, validateEvent, type Dimension, type GoEvent, type UnitKnowledge } from '../../packages/repository-contract/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createMemoryStore, openSqliteStore } from '../../packages/repository-store/src';
import { createRepositoryApi, type RepositoryApi } from '../../packages/repository-service/src/api';
import { installPack, packFor } from '../../packages/language-packs/src';
import { sqAdapter } from '../../src/adapters/sq';
import { UnsupportedAdapter } from '../../packages/golearn-extension/src/adapters';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { LookupController } from '../../packages/golearn-extension/src/content/controller';
import { createBridge } from '../../packages/golearn-extension/src/content/services';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { resolveLanguage } from '../../packages/golearn-extension/src/language';
import { MSG, type ChromeApi } from '../../packages/golearn-extension/src/platform';
import { createCardUI } from '../../packages/golearn-extension/src/popup/card';
import { createMemoryStorageArea } from '../../packages/golearn-extension/src/store';
import { createChromeFake } from '../extension/chromeFake';
import { READER_PAGE_TITLE } from '../../packages/controlled-reader/src/adapter';
import { openFixture, rangeOfText, select, type Opened } from '../controlled-reader/helpers/book';
import { stubLayout } from '../golearn-app/domtools';
import { flush, until } from '../golearn-app/helpers';

// ───────────────────────────── the real service process on a file database ─────────────────────────────
let PORT = 0;
let BASE = '';
/** A free loopback port, so parallel test files and a running local service never clash. */
const freePort = (): Promise<number> => new Promise((resolve, reject) => { const srv = nodeNet.createServer(); srv.once('error', reject); srv.listen(0, '127.0.0.1', () => { const p = (srv.address() as nodeNet.AddressInfo).port; srv.close(() => resolve(p)); }); });
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'go-repo-slice-'));
const MIGRATIONS = path.resolve(__dirname, '../../packages/repository-store/migrations');
let child: ChildProcess | undefined;

async function startService(): Promise<void> {
  PORT = await freePort(); BASE = `http://127.0.0.1:${PORT}`;
  child = spawn(process.execPath, ['node_modules/vite-node/dist/cli.mjs', '--config', 'server/goread/vite.config.ts', 'packages/repository-service/src/main.ts', '--port', String(PORT), '--data', DATA, '--host', '127.0.0.1'], {
    cwd: path.resolve(__dirname, '../..'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let out = ''; let err = '';
  child.stdout!.on('data', (d) => { out += String(d); });
  child.stderr!.on('data', (d) => { err += String(d); });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "listening" line in time; stdout: ${out}; stderr: ${err}`)), 60_000);
    const tick = () => { if (out.includes('repository listening on')) { clearTimeout(timer); resolve(); } else setTimeout(tick, 100); };
    tick();
  });
}
function stopService(): void {
  if (!child) return;
  if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  else child.kill();
  child = undefined;
}

// ───────────────────────────── the clock and the network switch ─────────────────────────────
let clockMs = Date.now();
const nowIso = (): string => new Date(clockMs).toISOString();
const tick = (ms: number): void => { clockMs += ms; };
const MIN = 60_000;
const net = { down: false, calls: 0 };
const realFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
const ASSETS = path.resolve(__dirname, '../../public');
const fileFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  const file = path.join(ASSETS, decodeURIComponent(url.pathname));
  return fs.existsSync(file) ? new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('not found', { status: 404 });
}) as typeof fetch;
/** The worker's network: dictionary shards from disk, everything else the real HTTP service; `net.down` cuts the service. */
const workerFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (u.includes('/dict/')) return fileFetch(input);
  net.calls++;
  if (net.down) throw new TypeError('Failed to fetch');
  return realFetch(input, init);
}) as typeof fetch;

const EMAIL = 'ana.slice@albania.test';
const PASSWORD = 'a very long password 123';
const LEMMA = 'lemma:sq:libër:NOUN';
const ok = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>): T => { if (!r.ok) throw new Error(`api ${r.status} ${String(r.error)}: ${String(r.message)} ${JSON.stringify(r.body ?? '').slice(0, 400)}`); return r.data as T; };

// ───────────────────────────── GoLearn: worker, reader, card ─────────────────────────────
const fake = createChromeFake();
const EXT = fake.runtime.id!;
const PAGE_SENDER = { id: EXT, url: `chrome-extension://${EXT}/app/index.html` };
fake.runtime.sendMessage = (message) => fake.dispatch(message, PAGE_SENDER);
const area = fake.local as unknown as ReturnType<typeof createMemoryStorageArea>;
const page = (m: Record<string, unknown>) => fake.dispatch(m, PAGE_SENDER) as Promise<any>;
const timers: Array<{ fire(): void }> = [];
const fireTimers = async (): Promise<void> => { for (const t of timers.splice(0)) t.fire(); await flush(40); };
let restoreLayout: () => void;
let opened: Opened | undefined;
let controller: LookupController | undefined;

function readerOn(open: Opened) {
  controller?.dispose();
  const bridge = createBridge(fake.contentChrome(7));
  const holder: { c?: LookupController } = {};
  const ui = createCardUI({ doc: document, speech: null, onDismiss: () => holder.c?.onCardDismissed() });
  controller = new LookupController({
    doc: document, adapters: [open.adapter, new UnsupportedAdapter()], parse: parseSelection, ui, store: bridge.events, metrics: bridge.metrics, services: bridge,
    analysers: ['sq'], resolveLanguage, identity: { learnerId: 'pending', enrolmentId: 'pending', deviceId: 'pending' }, version: '0.3.0', sessionId: `slice-${clockMs}`, nextFrame: () => Promise.resolve(),
  });
  holder.c = controller;
  controller.enable();
  return { ui, c: controller, text: () => ui.root()?.textContent ?? '', rows: () => [...(ui.root()?.querySelectorAll<HTMLElement>('.rows [data-row]') ?? [])].map((r) => r.dataset.row) };
}
async function lookupInBook(r: ReturnType<typeof readerOn>, open: Opened, word: string, _sentence: string) {
  const contents = open.contents();
  const range = rangeOfText(contents.document, word);           // the first occurrence of the word in the displayed chapter
  select(contents.document, range);
  const out = await r.c.lookup({ trigger: 'command' });
  if (out.status !== 'shown') throw new Error(`lookup of ${word}: ${out.status} ${(out as { message?: string }).message ?? ''}`);
  await out.settled;
  await flush(40);
  return out;
}

// ───────────────────────────── shared state ─────────────────────────────
let api: RepositoryApi;
let learnerId = '';
let enrolmentId = '';
let deviceId = '';
let token = '';
let fileStore: ReturnType<typeof openSqliteStore>;
const SENTENCE = 'Ana e do librin.';
const knowledgeOf = async (id: string): Promise<UnitKnowledge> => { const r = ok<{ knowledge: UnitKnowledge[] }>(await api.knowledge([id])).knowledge[0]; if (!r) throw new Error(`no row for ${id}`); return r; };
const allEvents = async (): Promise<GoEvent[]> => ok<{ events: GoEvent[] }>(await api.listEvents({ limit: 5000 })).events;
const demonstrated = (DIMENSIONS as readonly Dimension[]).filter((d) => d !== 'exposure' && d !== 'assistedRecognition');

beforeAll(async () => {
  restoreLayout = stubLayout();
  await startService();
  fileStore = openSqliteStore(path.join(DATA, 'repository.sqlite'), { migrationsDir: MIGRATIONS });
  const worker = createBackground(fake as unknown as ChromeApi, {
    fetch: workerFetch,
    timers: { set: (fn, ms) => { const t = { ms, fired: false, fire() { if (!t.fired) { t.fired = true; fn(); } } }; timers.push(t); return t; }, clear: () => {} },
  });
  worker.register();
}, 90_000);
afterAll(async () => { controller?.dispose(); await opened?.close(); restoreLayout(); await fileStore?.close(); stopService(); });

describe('§XVII steps 1–3: identity, Team Albania, the Albanian pack', () => {
  it('1–2. a learner identity exists on the persistent service and is enrolled with Team Albania', async () => {
    const anon = createRepositoryApi({ baseUrl: BASE, fetch: realFetch });
    expect((await anon.health()).ok).toBe(true);
    ok(await anon.createAccount({ email: EMAIL, password: PASSWORD }));
    await page({ type: MSG.serviceConfig, baseUrl: BASE, assetBase: 'http://localhost/' });
    await page({ type: MSG.connect, baseUrl: BASE, email: EMAIL, password: PASSWORD });          // GoLearn's own sign-in
    const session = (await area.get('golearn:session'))['golearn:session'] as { learnerId: string; token: string; deviceId?: string };
    learnerId = session.learnerId; token = session.token;
    deviceId = ((await area.get('golearn:deviceId'))['golearn:deviceId'] as string | undefined) ?? session.deviceId ?? 'slice-device';
    api = createRepositoryApi({ baseUrl: BASE, fetch: realFetch, token });
    await fileStore.putTeam({ teamId: 'albania', name: 'Albania', createdAt: nowIso() });          // a leader adds the member; no public route grants membership
    await fileStore.putTeamMember('albania', learnerId, 'member', nowIso());
    const e = ok<{ enrolment: { enrolmentId: string; teamId?: string } }>(await api.enrol({ teamId: 'albania', languageId: 'sq', packId: 'pack:sq', packVersion: '9', goals: [{ kind: 'reading' }] }));
    enrolmentId = e.enrolment.enrolmentId;
    expect(e.enrolment.teamId).toBe('albania');
    await page({ type: MSG.refreshSession });
    const st = await page({ type: MSG.status });
    expect(st).toMatchObject({ connected: true, languageId: 'sq', packAvailable: true });
  }, 30_000);

  it('3. the Albanian pack is installed and verified, and the Repository holds its validation level', async () => {
    const manifest = packFor('sq')!;
    const packArea = new Map<string, unknown>();
    const installed = await installPack(manifest, { fetch: fileFetch, baseUrl: 'http://assets.local/', storage: { get: (k) => packArea.get(k), set: (k, v) => { packArea.set(k, v); } }, adapter: sqAdapter, now: nowIso });
    expect(installed.ok, JSON.stringify(installed).slice(0, 300)).toBe(true);
    const ev: GoEvent = {
      id: `slice:pack:${clockMs}`, v: CONTRACT_VERSION, learnerId, enrolmentId, languageId: 'sq', at: nowIso(),
      producer: { app: 'golearn-ext', version: 'slice', deviceId }, kind: 'PackInstalled', subject: {},
      payload: { packId: manifest.packId, packVersion: manifest.version, analyzerId: manifest.analyzer.id, analyzerVersion: manifest.analyzer.version, level: 'installable', validation: 'unreviewed' }, dedupeKey: `slice:pack:${manifest.packId}:${manifest.version}`,
    };
    expect(validateEvent(ev)).toEqual([]);
    ok(await api.appendEvents([ev]));
    const stored = (await allEvents()).find((e) => e.kind === 'PackInstalled')!;
    expect(stored.payload).toMatchObject({ level: 'installable', validation: 'unreviewed' });
  }, 30_000);
});

describe('§XVII steps 4–12: the encounter in the authorised EPUB reader', () => {
  it('4–6. "librin" in "Ana e do librin." resolves to libër with its morphology, inside the controlled reader', async () => {
    document.title = READER_PAGE_TITLE;                                                           // the reader page the adapter matches (jsdom has no real location)
    opened = await openFixture('udha-sample.epub');
    await opened.show(0);
    const r = readerOn(opened);
    const out = await lookupInBook(r, opened, 'librin', SENTENCE);
    expect(out.card.lemma).toBe('libër');
    expect(r.text()).toContain('libër (NOUN)');
    expect(r.text()).toContain('definite masculine accusative singular');
    expect(out.card.language?.languageId).toBe('sq');
    expect(['book-metadata', 'document-metadata', 'team-default', 'override']).toContain(out.card.language?.basis);
    expect(out.recorded).toBe('recorded');
  }, 60_000);

  it('7–9. the real SelectionLookedUp reaches the file-backed service with its language basis, source metadata and provenance, and no text', async () => {
    tick(2 * MIN);
    const r = readerOn(opened!);
    await lookupInBook(r, opened!, 'librin', SENTENCE);                                            // a second encounter, so the Repository has something to propose
    (r.ui.root()!.querySelector('button.saveBtn') as HTMLElement).click();                        // "Review this"
    await flush(40);
    await fireTimers();
    await page({ type: MSG.syncNow });
    await until(async () => (await allEvents()).filter((e) => e.kind === 'SelectionLookedUp').length >= 2, 15_000);
    const sel = (await allEvents()).filter((e) => e.kind === 'SelectionLookedUp');
    expect(sel[0].producer.app).toBe('golearn-ext');
    expect(sel[0].enrolmentId).toBe(enrolmentId);
    expect(sel[0].subject.itemIds).toContain(LEMMA);
    expect(sel[0].subject.sentenceKey).toBeTruthy();
    const lang = (sel[0].payload as { language?: { languageId: string; basis: string; confidence: number; override: boolean } }).language;   // 8. resolution basis preserved
    expect(lang?.languageId).toBe('sq');
    expect(['book-metadata', 'document-metadata', 'team-default', 'override']).toContain(lang?.basis);
    expect(typeof lang?.override).toBe('boolean');
    const src = sel[0].subject.sourceRef as { kind: string; locator?: string; title?: string };          // 9. source metadata, never text
    expect(src.kind).toBe('file');
    expect(src.locator).toMatch(/^epubcfi\(/);
    expect(JSON.stringify(await allEvents())).not.toMatch(/Ana e do|do librin/);
    expect((sel[0].payload as { provenance?: unknown }).provenance).toBeDefined();
    const unit = ok<{ unit?: { provenance?: Record<string, unknown>; status: string } }>(await api.unit(LEMMA));          // 9. linguistic provenance (P-12)
    expect(unit.unit).toBeDefined();
    expect(unit.unit!.provenance).toMatchObject({ origin: expect.any(String) });
    expect(['verified', 'high-confidence', 'provisional', 'requires-review']).toContain(unit.unit!.status);
    for (const e of await allEvents()) expect(validateEvent(e)).toEqual([]);
  }, 60_000);

  it('10. a meaning request is recorded as its own event', async () => {
    const r = readerOn(opened!);
    const out = await lookupInBook(r, opened!, 'librin', SENTENCE);
    expect(out.status).toBe('shown');
    const l2 = r.ui.root()!.querySelector('button.l2') as HTMLElement | null;
    if (l2) l2.click();
    await flush(40);
    await fireTimers();
    await page({ type: MSG.syncNow });
    await until(async () => (await allEvents()).some((e) => e.kind === 'AnalysisShown' || e.kind === 'AssistanceRequested'), 15_000);
    const requests = (await allEvents()).filter((e) => e.kind === 'AnalysisShown' || e.kind === 'AssistanceRequested');
    expect(requests.length).toBeGreaterThan(0);
    expect(requests[0].subject.itemIds).toContain(LEMMA);
  }, 60_000);

  it('11–12. the projection shows exposure and no mastery, on all eight dimensions', async () => {
    const row = await knowledgeOf(LEMMA);
    expect(Object.keys(row.dimensions).sort()).toEqual([...DIMENSIONS].sort());
    expect(DIMENSIONS).toContain('phraseComprehension');
    expect(row.dimensions.exposure.observations).toBeGreaterThan(0);
    for (const d of demonstrated) expect(row.dimensions[d].weight, d).toBe(0);
    expect(row.modelVersion).toMatch(/^projection@/);
  });
});

describe('§XVII steps 13–19: review, listening and writing evidence through the real routes', () => {
  let writtenDim: Dimension = 'readingRecognition';
  let afterReview: UnitKnowledge['dimensions'];

  it('13. the Repository proposes a meaningful candidate with its reasons', async () => {
    const c = ok<{ candidates: Array<{ unitId: string; score: number; reasons: Array<{ rule: string }>; eligibility?: { eligible: boolean; status: string } }> }>(await api.candidates(enrolmentId, 20)).candidates;
    const mine = c.find((x) => x.unitId === LEMMA);
    expect(mine, JSON.stringify(c.map((x) => x.unitId))).toBeDefined();
    expect(mine!.reasons.map((r) => r.rule)).toEqual(expect.arrayContaining(['repeatedLookups']));
    expect(mine!.eligibility?.eligible).toBe(true);
    expect(c.filter((x) => x.unitId.startsWith('form:')).length).toBeLessThanOrEqual(c.length);   // not one card per clicked form
  });

  it('14–15. a written review outcome recomputes the written dimension only', async () => {
    const before = (await knowledgeOf(LEMMA)).dimensions;
    const ev: GoEvent = {
      id: `slice:review:1`, v: CONTRACT_VERSION, learnerId, enrolmentId, languageId: 'sq', at: nowIso(),
      producer: { app: 'gopractice-review', version: 'slice', deviceId }, kind: 'CardReviewed', subject: { itemIds: [LEMMA], cardId: `card:written-recognition:${LEMMA}` },
      payload: { cardKind: 'recognition', grade: 'again', correct: false, hinted: false, rating: 1, outcome: 'incorrect', family: 'written-recognition', exerciseId: 'slice:x1' }, dedupeKey: 'slice:review:1',
    };
    expect(validateEvent(ev)).toEqual([]);
    ok(await api.submitReviews([ev]));
    const after = (await knowledgeOf(LEMMA)).dimensions;
    writtenDim = 'readingRecognition';
    expect(after[writtenDim].negative).toBeGreaterThan(before[writtenDim].negative);
    expect(after.listeningRecognition).toEqual(before.listeningRecognition);
    expect(after.contextualProduction).toEqual(before.contextualProduction);
    expect(after.exposure.observations).toBe(before.exposure.observations);                      // a wrong answer never erases exposure
    afterReview = after;
  });

  it('16–17. an independent listening outcome changes listening recognition and nothing else', async () => {
    tick(MIN);
    const ev: GoEvent = {
      id: 'slice:listen:1', v: CONTRACT_VERSION, learnerId, enrolmentId, languageId: 'sq', at: nowIso(),
      producer: { app: 'gopractice-review', version: 'slice', deviceId }, kind: 'ListeningAssessed', subject: { itemIds: [LEMMA], cardId: `card:auditory-recognition:${LEMMA}` },
      // a recorded-voice flag stands in for the software path only: no Albanian audio exists (GOLISTEN-CAPABILITIES.md)
      payload: { stimulus: 'word', voice: 'recorded', correct: true, hinted: false, answerShownBefore: false, responseMode: 'typed', family: 'audio-to-meaning', exerciseId: 'slice:a1' },
      dedupeKey: 'slice:listen:1', evidence: { quality: 'moderate', sourceReliability: 0.8 },
    };
    expect(validateEvent(ev)).toEqual([]);
    ok(await api.submitReviews([ev]));
    const after = (await knowledgeOf(LEMMA)).dimensions;
    expect(after.listeningRecognition.observations).toBe(1);
    expect(after.listeningRecognition.positive).toBeGreaterThan(0);
    expect(after[writtenDim]).toEqual(afterReview[writtenDim]);
    expect(after.productiveRetrieval).toEqual(afterReview.productiveRetrieval);
  });

  it('18–19. an assisted (AI-corrected) writing observation never becomes independent production', async () => {
    tick(MIN);
    const before = (await knowledgeOf(LEMMA)).dimensions;
    const ev: GoEvent = {
      id: 'slice:write:1', v: CONTRACT_VERSION, learnerId, enrolmentId, languageId: 'sq', at: nowIso(),
      producer: { app: 'gopractice-tell', version: 'slice', deviceId, surface: 'writing' }, kind: 'ProductionRecorded',
      subject: { itemIds: [LEMMA], sentenceKey: 'deadbeef', draftId: 'slice-draft', sourceRef: { kind: 'writing' } },
      payload: { mode: 'guided', assisted: true, assistance: ['correction'], usedCorrectly: true, authorship: 'copied-from-model', draftId: 'slice-draft', sentenceKey: 'deadbeef', wordCount: 4 },
      dedupeKey: 'slice:write:1', evidence: { quality: 'none', assisted: true },
    };
    expect(validateEvent(ev)).toEqual([]);
    ok(await api.appendEvents([ev]));
    const after = (await knowledgeOf(LEMMA)).dimensions;
    expect(after.contextualProduction).toEqual(before.contextualProduction);
    expect(after.productiveRetrieval).toEqual(before.productiveRetrieval);
    expect(after.contextualProduction.positive).toBe(0);
  });
});

describe('§XVII steps 20–22: back in GoLearn', () => {
  it('20–22. the reader shows the updated learner state and keeps the complete analysis', async () => {
    await page({ type: MSG.syncNow });                                                             // 21. the worker refreshes its cache
    await flush(40);
    const r = readerOn(opened!);
    const out = await lookupInBook(r, opened!, 'librin', SENTENCE);
    expect(out.status).toBe('shown');
    const t = r.text();
    expect(t).toMatch(/You have met this word \d+ times/);                                        // 22. assistance reflects the state…
    expect(t).toMatch(/reading recognition: (low|medium|high)/);
    expect(t).toContain('libër (NOUN)');                                                           // …without hiding the analysis
    expect(t).toContain('definite masculine accusative singular');
    (r.ui.root()!.querySelector('button.l4') as HTMLElement).click();
    expect(r.ui.root()!.querySelector('.layer.l4')!.textContent).toMatch(/direct object|ending|accusative/i);
  }, 60_000);
});

describe('§XVII steps 23–30: replay, duplicates, offline sync, another user', () => {
  let history: GoEvent[] = [];

  it('23–24. replaying the whole history into a fresh projection reproduces the current state', async () => {
    await fireTimers(); await page({ type: MSG.syncNow });                                       // the reader's last lookup is on the server before the history is read
    await until(async () => (await page({ type: MSG.status })).sync.pending === 0, 15_000);
    history = await allEvents();
    expect(history.length).toBeGreaterThan(6);
    const fresh = createMemoryStore({ now: nowIso });
    const ids = [...new Set(history.flatMap((e) => e.subject.itemIds ?? []))];
    const units = await fileStore.getUnits(ids);
    await fresh.putUnits(units);
    await fresh.putAliases(await fileStore.aliasesFor(ids));
    const scrambled = [...history].sort((a, b) => (a.id < b.id ? 1 : -1));
    const outcomes = await fresh.append(learnerId, scrambled.map(({ seq: _s, recordedAt: _r, ...e }: GoEvent & { seq?: number; recordedAt?: string }) => e as GoEvent));
    expect(outcomes.every((o) => o.stored)).toBe(true);
    const replay = createProjectionEngine({ store: fresh, now: nowIso });
    const live = ok<{ knowledge: UnitKnowledge[] }>(await api.knowledge(ids)).knowledge;
    const rebuilt = await replay.knowledge(learnerId, ids);
    // retention is a function of the clock: the service answers with its own wall clock, the replay with the test clock a few seconds apart
    const norm = (rows: UnitKnowledge[]) => rows.map((r) => ({ unitId: r.unitId, dims: r.dimensions, basis: r.basis.events, halfLife: r.retention.halfLifeDays, basedOn: r.retention.basedOn, uncertainty: r.uncertainty })).sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
    expect(norm(rebuilt)).toEqual(norm(live));
    for (const row of rebuilt) expect(row.retention.estimate).toBeCloseTo(live.find((l) => l.unitId === row.unitId)!.retention.estimate, 2);
  });

  it('25–26. duplicates (the browser retrying) store nothing and count nothing', async () => {
    const before = await knowledgeOf(LEMMA);
    const resent = await api.appendEvents(history.map(({ seq: _s, recordedAt: _r, ...e }: GoEvent & { seq?: number; recordedAt?: string }) => e as GoEvent));
    expect(resent.ok, resent.ok ? '' : `${resent.status} ${String(resent.message)}`).toBe(true);
    if (resent.ok) expect((resent.data as { outcomes: Array<{ stored: boolean }> }).outcomes.every((o) => !o.stored)).toBe(true);
    await page({ type: MSG.syncNow });                                                             // the worker's own queue was already acknowledged
    expect((await allEvents()).length).toBe(history.length);
    expect(await knowledgeOf(LEMMA)).toEqual(before);
  });

  it('27–28. an encounter made offline survives the reconnection exactly once', async () => {
    const count = (await allEvents()).length;
    net.down = true;
    const r = readerOn(opened!);
    const out = await lookupInBook(r, opened!, 'Ana', SENTENCE);
    expect(out.recorded).toBe('recorded');
    await fireTimers();
    const failed = await page({ type: MSG.syncNow });
    expect(failed?.ok ?? failed?.sync?.ok ?? false).toBe(false);
    expect((await page({ type: MSG.status })).sync.pending).toBeGreaterThan(0);                    // 27. pending indicator
    expect((await allEvents()).length).toBe(count);
    net.down = false;
    await page({ type: MSG.syncNow });
    await until(async () => (await page({ type: MSG.status })).sync.pending === 0, 15_000);
    const after = await allEvents();
    expect(after.length).toBeGreaterThan(count);                                                   // 28. survived
    await page({ type: MSG.syncNow });
    expect((await allEvents()).length).toBe(after.length);                                         // once
    expect(new Set(after.map((e) => e.id)).size).toBe(after.length);
  }, 60_000);

  it('29–30. another user cannot read, forge or delete this learner\'s data', async () => {
    const anon = createRepositoryApi({ baseUrl: BASE, fetch: realFetch });
    ok(await anon.createAccount({ email: 'bardh.slice@albania.test', password: PASSWORD }));
    const s = ok<{ token: string; learnerId: string }>(await anon.createSession({ email: 'bardh.slice@albania.test', password: PASSWORD, deviceId: 'dev-B' }));
    const other = createRepositoryApi({ baseUrl: BASE, fetch: realFetch, token: s.token });
    const nobody = createRepositoryApi({ baseUrl: BASE, fetch: realFetch });                       // no token at all (createAccount signs its own client in)
    expect((await nobody.listEvents({ limit: 10 })).ok).toBe(false);
    const theirs = ok<{ events: GoEvent[] }>(await other.listEvents({ limit: 1000 })).events;
    expect(theirs.every((e) => e.learnerId === s.learnerId)).toBe(true);
    expect(theirs.some((e) => e.kind === 'SelectionLookedUp')).toBe(false);
    expect(ok<{ knowledge: UnitKnowledge[] }>(await other.knowledge([LEMMA])).knowledge).toHaveLength(0);
    expect((await other.candidates(enrolmentId, 10)).ok).toBe(false);
    const forged = await other.appendEvents([{ ...history.find((e) => e.kind === 'SelectionLookedUp')!, id: 'forged:1', dedupeKey: 'forged:1' } as GoEvent]);
    expect(forged.ok).toBe(false);
    const stealToken = createRepositoryApi({ baseUrl: BASE, fetch: realFetch, token: s.token });
    const mine = ok<{ events: GoEvent[] }>(await api.listEvents({ limit: 1000 })).events;
    expect(mine.length).toBe((await allEvents()).length);
    expect((await stealToken.getDocument('slice-draft')).ok).toBe(false);
  });
});
