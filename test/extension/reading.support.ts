/**
 * Test bed for Reading Analysis' Repository half (reading-repository.test.ts, reading-failures.test.ts).
 *
 * Nothing of the Repository is mocked: the ACCOUNT is the service's own handler over the memory store and the REAL projection engine (the
 * extension tests' usual harness has a recording engine that projects nothing, so it cannot be the authority a figure is reconciled with);
 * the DEVICE is the real background worker (`createBackground`) over the fake chrome API, with its real device-local Repository (over
 * fake-indexeddb, as in the browser, or over the storage rows). Between them is a fetch that IS the service's handler, with one hook
 * (`net.intercept`) through which a test can hold, fail or alter a single request.
 */
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { CONTRACT_VERSION, type GoEvent, type StoredEvent, type UnitKnowledge } from '../../packages/repository-contract/src';
import { KNOWLEDGE_LEVEL_RANK, type KnowledgeLevel } from '../../packages/repository-contract/src/knowledge-levels';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createLinguisticService } from '../../packages/repository-linguistics/src';
import { createInProcessApi, type RepositoryApi } from '../../packages/repository-service/src/api';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { handle } from '../../packages/repository-service/src/handler';
import { adaptLinguistics } from '../../packages/repository-service/src/linguistics-adapter';
import { createMemoryStore } from '../../packages/repository-store/src/memory';
import { createBackground, type BackgroundOptions } from '../../packages/golearn-extension/src/background/core';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { MAX_WORDS_PER_MESSAGE, type KnowledgeSnapshot, type ReadingKnowledgeReply, type WireVerdict, type WireWord } from '../../packages/golearn-extension/src/reading/protocol';
import { PENDING_IDENTITY, buildMarkEvent } from '../../packages/golearn-extension/src/store';
import { createFakeCrypto } from '../repository/service/fakes';
import { createChromeFake, EXT_ID, type ChromeFake } from './chromeFake';
import { PASSWORD, SERVICE, fakePacks } from './rig';

export { PASSWORD, SERVICE };
export const READING = MSG.readingKnowledge;
export const TAB = 7;

// ───────────────────────────── the account service (authoritative) ─────────────────────────────

export interface RealService {
  deps: ServiceDeps;
  store: ReturnType<typeof createMemoryStore>;
  /** The service's clock: the system clock plus `skewMs`. */
  clock: { skewMs: number; now(): string };
  api(token?: string): RepositoryApi;
}

/** The service's handler over the memory store, the real projection engine and the real linguistic layer (a fast password hash is the one stand-in). */
export function createRealService(): RealService {
  const clock = { skewMs: 0, now: (): string => new Date(Date.now() + clock.skewMs).toISOString() };
  const store = createMemoryStore({ now: clock.now });
  const engine = createProjectionEngine({ store, now: clock.now });
  const deps: ServiceDeps = { store, engine, linguistics: adaptLinguistics(createLinguisticService(store, { now: clock.now })), crypto: createFakeCrypto(), now: clock.now, log: () => undefined };
  return { deps, store, clock, api: (token) => createInProcessApi(deps, token) };
}

/** Another device of the learner's (a phone running GoReview): a signed-in client of the account. */
export interface Phone { api: RepositoryApi; email: string; learnerId: string; deviceId: string; enrolments: Record<string, string> }

export type LanguageChoice = string | { languageId: string; varietyId?: string };

/** Creates an account, signs a first device in and enrols it in the languages given. */
export async function createAccount(svc: RealService, email: string, languages: LanguageChoice[] = ['sq'], deviceId = 'phone'): Promise<Phone> {
  const made = await svc.api().createAccount({ email, password: PASSWORD, displayName: 'Ana' });
  if (!made.ok) throw new Error(`createAccount ${made.status} ${made.error}`);
  const api = svc.api();
  const s = await api.createSession({ email, password: PASSWORD, deviceId, platform: 'test' });
  if (!s.ok) throw new Error(`createSession ${s.status} ${s.error}`);
  const enrolments: Record<string, string> = {};
  for (const l of languages) {
    const languageId = typeof l === 'string' ? l : l.languageId;
    const e = await api.enrol({ languageId, packId: `pack:${languageId}`, packVersion: '1', goals: [{ kind: 'reading' }], ...(typeof l !== 'string' && l.varietyId ? { varietyId: l.varietyId } : {}) });
    if (!e.ok) throw new Error(`enrol ${languageId} ${e.status} ${e.error}`);
    enrolments[languageId] = e.data.enrolment.enrolmentId;
  }
  return { api, email, learnerId: made.data.learnerId, deviceId, enrolments };
}

// ───────────────────────────── events, as another device records them ─────────────────────────────

let counter = 0;
const RUN = Math.random().toString(36).slice(2, 8);
/** `days` ago (and `ms` after that instant), as an ISO time: histories are dated in the past of whatever day the tests run. */
export const ago = (days: number, ms = 0): string => new Date(Date.now() - days * 86_400_000 + ms).toISOString();
const languageOf = (unitId: string): string => unitId.split(':')[1]!;

export interface EventOpts { at: string; id?: string; sentenceKey?: string; cardId?: string; evidence?: GoEvent['evidence']; varietyId?: string; app?: GoEvent['producer']['app'] }

export function eventOf(who: Phone, kind: GoEvent['kind'], itemIds: string[], payload: Record<string, unknown>, o: EventOpts): GoEvent {
  counter += 1;
  const languageId = languageOf(itemIds[0]!);
  const enrolmentId = who.enrolments[languageId];
  if (!enrolmentId) throw new Error(`the account has no enrolment in ${languageId}`);
  const id = o.id ?? `qa:${RUN}:${counter}`;
  return {
    id, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId, languageId, at: o.at, ...(o.varietyId ? { varietyId: o.varietyId } : {}),
    producer: { app: o.app ?? 'golearn-ext', version: '1', deviceId: who.deviceId }, kind,
    subject: { itemIds, ...(o.sentenceKey ? { sentenceKey: o.sentenceKey } : {}), ...(o.cardId ? { cardId: o.cardId } : {}) },
    payload, ...(o.evidence ? { evidence: o.evidence } : {}), dedupeKey: id,
  } as GoEvent;
}
/** A click that looked the word up. */
export const lookedUp = (who: Phone, itemIds: string[], o: EventOpts): GoEvent =>
  eventOf(who, 'SelectionLookedUp', itemIds, { surface: itemIds[0]!.split(':')[2], tokenCount: 1, contextKind: o.sentenceKey ? 'sentence' : 'none', contextConfidence: o.sentenceKey ? 1 : 0, readerId: 'demo', helpShown: ['surface'] }, o);
/** Words met on a page (GoLearn Active): no click. */
export const met = (who: Phone, itemIds: string[], o: EventOpts): GoEvent => eventOf(who, 'EncounterRecorded', itemIds, { tokenCount: itemIds.length, contextKind: 'none', readerId: 'demo' }, o);
/** The learner's own mark. */
export const marked = (who: Phone, itemIds: string[], mark: string, o: EventOpts): GoEvent => eventOf(who, 'ItemMarked', itemIds, { mark }, o);
/** One answer in GoReview. `typed`: a typed, correct, unhinted answer (the only kind that counts towards Known). */
export function reviewed(who: Phone, unitId: string, o: EventOpts & { correct?: boolean; typed?: boolean; rating?: 1 | 2 | 3 | 4 }): GoEvent {
  const correct = o.correct ?? true;
  const rating = o.rating ?? (correct ? 3 : 1);
  return eventOf(who, 'CardReviewed', [unitId], {
    cardKind: 'recognition', grade: (['again', 'hard', 'good', 'easy'] as const)[rating - 1], correct, hinted: false, rating,
    ...(o.typed ? { responseMode: 'typed', outcome: correct ? 'correct' : 'incorrect' } : {}),
  }, { ...o, app: 'gopractice-review', cardId: o.cardId ?? `card:written-recognition:${unitId}`, ...(o.typed ? { evidence: { quality: 'moderate', assisted: false, sourceReliability: 1 } } : {}) });
}
/** GoReview put the unit in the deck. */
export const cardAdded = (who: Phone, unitId: string, o: EventOpts): GoEvent => eventOf(who, 'CardAdded', [unitId],
  { unitId, unitKind: 'lexeme', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'intake' },
  { ...o, app: 'gopractice-review', cardId: o.cardId ?? `card:written-recognition:${unitId}`, evidence: { quality: 'none' } });

/** Sends events to the account as the other device would (reader events to /events, review events to /reviews), in batches; every one must be stored. */
export async function sendToAccount(who: Phone, events: GoEvent[]): Promise<void> {
  const reviewKinds = new Set(['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed', 'CardAdded', 'CardRemoved']);
  const groups: Array<[GoEvent[], (batch: GoEvent[]) => ReturnType<RepositoryApi['appendEvents']>]> = [
    [events.filter((e) => !reviewKinds.has(e.kind)), (b) => who.api.appendEvents(b)],
    [events.filter((e) => reviewKinds.has(e.kind)), (b) => who.api.submitReviews(b)],
  ];
  for (const [list, send] of groups) {
    for (let i = 0; i < list.length; i += 100) {
      const batch = list.slice(i, i + 100);
      const r = await send(batch);
      if (!r.ok) throw new Error(`seed refused: ${r.status} ${r.error} ${JSON.stringify(r.body).slice(0, 400)}`);
      const lost = r.data.outcomes.filter((o) => !o.stored);
      if (lost.length) throw new Error(`seed not stored: ${JSON.stringify(lost.slice(0, 3))}`);
    }
  }
}

/** The authoritative rows of these units: the account service's own projection, asked 200 ids at a time (its limit), every request answered. */
export async function accountRows(api: RepositoryApi, unitIds: readonly string[]): Promise<Map<string, UnitKnowledge>> {
  const out = new Map<string, UnitKnowledge>();
  for (let i = 0; i < unitIds.length; i += 200) {
    const r = await api.knowledge(unitIds.slice(i, i + 200));
    if (!r.ok) throw new Error(`account knowledge ${r.status} ${r.error}`);
    for (const row of r.data.knowledge) {
      if (out.has(row.unitId)) throw new Error(`the account answered ${row.unitId} twice`);
      out.set(row.unitId, row);
    }
  }
  return out;
}

/** Every event of the account, in log order (read from the service's store, which no client can write around). */
export async function accountEvents(svc: RealService, learnerId: string): Promise<StoredEvent[]> {
  const out: StoredEvent[] = [];
  for (let afterSeq = 0; ;) {
    const page = await svc.store.list({ learnerId, afterSeq, limit: 5000 });
    out.push(...page);
    if (page.length < 5000) return out;
    afterSeq = page[page.length - 1]!.seq;
  }
}

// ───────────────────────────── words and the hand-written oracle ─────────────────────────────

export const formId = (languageId: string, w: string): string => `form:${languageId}:${w}`;
export const lemmaId = (languageId: string, w: string, pos = 'NOUN'): string => `lemma:${languageId}:${w}:${pos}`;
/** A word with one reading: its form and its lemma. */
export const wordOf = (languageId: string, w: string, pos = 'NOUN'): WireWord => [formId(languageId, w), lemmaId(languageId, w, pos)];
export const idsOf = (words: readonly WireWord[]): string[] => [...new Set(words.flat())];

const rank = (l: KnowledgeLevel): number => KNOWLEDGE_LEVEL_RANK[l];
/** A row met only in passing (words a page showed, never clicked): the Repository says Seen, every reader shows New. Written out here, not imported. */
function shown(row: UnitKnowledge, ignoreMark = false): KnowledgeLevel {
  if (row.level !== 'seen' || (row.selfMark && !ignoreMark)) return row.level;
  const lookedUpOrHelped = (row.dimensions.exposure?.negative ?? 0) > 0;
  const judged = Object.entries(row.dimensions).some(([name, d]) => name !== 'exposure' && (d?.observations ?? 0) > 0);
  return lookedUpOrHelped || judged ? 'seen' : 'new';
}
/** The level one row is shown at when it is the only row of a word: the mark when it has one (New leaves the Repository's level), else the level, with the rule above. */
export const shownLevel = (row: UnitKnowledge): KnowledgeLevel => (row.selfMark && row.selfMark.mark !== 'new' ? row.selfMark.mark : shown(row, true));
/**
 * The oracle for a word with ONE reading in a language WITHOUT learning varieties, written by hand from the specification and independent of
 * reading/classify.ts and active/levels.ts: the learner's newest own mark among the word's two rows decides (a mark of New leaves the level
 * the Repository gave the marked row); else the higher of the two rows' levels; Known and Automatic are `known`, everything else `below`.
 */
export function oracleVerdict(form: UnitKnowledge | undefined, lemma: UnitKnowledge | undefined): WireVerdict {
  const rows = [form, lemma].filter((r): r is UnitKnowledge => !!r);
  let level: KnowledgeLevel = 'new';
  const markedRows = rows.filter((r) => r.selfMark).sort((a, b) => (a.selfMark!.at < b.selfMark!.at ? 1 : a.selfMark!.at > b.selfMark!.at ? -1 : 0));
  if (markedRows.length) {
    const newest = markedRows[0]!.selfMark!;
    if (newest.mark !== 'new') level = newest.mark;
    else for (const r of markedRows.filter((x) => x.selfMark!.at === newest.at)) { const l = shown(r, true); if (rank(l) > rank(level)) level = l; }
  } else {
    for (const r of rows) { const l = shown(r); if (rank(l) > rank(level)) level = l; }
  }
  return [level === 'known' || level === 'automatic' ? 'known' : 'below', level];
}

// ───────────────────────────── the device (the real background worker) ─────────────────────────────

export interface FetchLog { method: string; path: string; query: string; status: number }
export interface NetCall { method: string; path: string; url: URL; afterSeq?: number }
/** `proceed()` lets the request reach the service; `proceed(path)` sends another GET in its place (the same headers), as a faulty transport would. */
export type Intercept = (call: NetCall, proceed: (otherPathAndQuery?: string) => Promise<Response>) => Promise<Response>;

export const newIdb = (): { indexedDB: IDBFactory; keyRange: typeof IDBKeyRange } => ({ indexedDB: new IDBFactory(), keyRange: IDBKeyRange });

export interface ReadingRig {
  fake: ChromeFake;
  svc: RealService;
  bg: ReturnType<typeof createBackground>;
  idb: ReturnType<typeof newIdb> | undefined;
  log: FetchLog[];
  /** While true every request to the service fails as a dropped connection does. */
  offline: { value: boolean };
  net: { intercept?: Intercept };
  /** The worker's clock (sessions, grants, verification times). */
  clock: { now: number };
  timers: Array<{ ms: number; cleared: boolean; fired: boolean; fire(): void }>;
  /** Runs the timers the worker asked for (its debounced sync round) and lets them finish. */
  fireTimers(): Promise<void>;
  /** As the popup / setup page. */
  page(message: Record<string, unknown>): Promise<any>;
  /** As the content script of tab `tabId`. */
  content(message: Record<string, unknown>, tabId?: number): Promise<any>;
  /** As another extension. */
  foreign(message: Record<string, unknown>): Promise<any>;
  connect(email: string): Promise<any>;
  /** A Reading Analysis message to the background. */
  reading(message: Record<string, unknown>, as?: 'page' | 'content', tabId?: number): Promise<ReadingKnowledgeReply & Record<string, unknown>>;
  local(request: Record<string, unknown>): Promise<any>;
}

export interface RigOptions {
  svc?: RealService;
  /** The device Repository's IndexedDB: a fresh one by default (as in the browser); `false` = the storage rows. */
  idb?: ReturnType<typeof newIdb> | false;
  reading?: BackgroundOptions['reading'];
  /** A worker started again over the same storage (the browser stopped the first one): its two storage areas are copied in. */
  restartOf?: ReadingRig;
  /** Replaces the worker's local storage area behaviour before the worker is created. */
  prepare?: (fake: ChromeFake) => void;
}

export function createReadingRig(o: RigOptions = {}): ReadingRig {
  const svc = o.svc ?? o.restartOf?.svc ?? createRealService();
  const fake = createChromeFake();
  const log: FetchLog[] = [];
  const offline = { value: false };
  const net: ReadingRig['net'] = {};
  const clock = { now: o.restartOf?.clock.now ?? Date.now() };
  const timers: ReadingRig['timers'] = [];
  const idb = o.idb === false ? undefined : (o.idb ?? o.restartOf?.idb ?? newIdb());

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (u.endsWith('/app/config.json')) return new Response('', { status: 404 });
    if (u.includes('/dict/')) return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    if (offline.value) throw new TypeError('Failed to fetch');
    const req = new Request(input, init);
    const url = new URL(req.url);
    const after = url.searchParams.get('afterSeq');
    const call: NetCall = { method: req.method, path: url.pathname, url, ...(after !== null ? { afterSeq: Number(after) } : {}) };
    const proceed = async (other?: string): Promise<Response> => {
      const res = await handle(other ? new Request(`${url.origin}${other}`, { method: 'GET', headers: req.headers }) : req, svc.deps);
      log.push({ method: req.method, path: url.pathname, query: other ? `(answered as ${other})` : url.search, status: res.status });
      return res;
    };
    return net.intercept ? net.intercept(call, proceed) : proceed();
  }) as typeof fetch;

  o.prepare?.(fake);
  const bg = createBackground(fake, {
    fetch: fetchImpl, packs: fakePacks(), now: () => clock.now,
    ...(idb ? { localRepo: { idb } } : {}),
    ...(o.reading ? { reading: o.reading } : {}),
    timers: { set: (fn, ms) => { const t = { ms, cleared: false, fired: false, fire() { if (!t.cleared && !t.fired) { t.fired = true; fn(); } } }; timers.push(t); return t; }, clear: (h) => { (h as { cleared: boolean }).cleared = true; } },
  });
  bg.register();
  const pageSender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/action/popup.html` };
  const rig: ReadingRig = {
    fake, svc, bg, idb, log, offline, net, clock, timers,
    async fireTimers() { for (const t of [...timers]) t.fire(); await new Promise((r) => setTimeout(r, 40)); },
    page: (m) => fake.dispatch(m, pageSender),
    content: (m, tabId = TAB) => fake.dispatch(m, { id: EXT_ID, tab: { id: tabId }, url: 'https://example.test/article' }),
    foreign: (m) => fake.dispatch(m, { id: 'another-extension', url: 'chrome-extension://another-extension/popup.html' }),
    connect: (email) => rig.page({ type: MSG.connect, baseUrl: SERVICE, email, password: PASSWORD }),
    reading: (m, as = 'page', tabId = TAB) => (as === 'page' ? rig.page({ type: READING, ...m }) : rig.content({ type: READING, ...m }, tabId)),
    local: (request) => rig.page({ type: MSG.localRepo, ...request }),
  };
  return rig;
}

/** Copies the first worker's storage (local and session: both outlive a stopped worker) into a new worker over the same IndexedDB and service. */
export async function restartWorker(first: ReadingRig, o: Omit<RigOptions, 'restartOf' | 'svc'> = {}): Promise<ReadingRig> {
  const second = createReadingRig({ ...o, restartOf: first });
  await second.fake.local.set(await first.fake.local.get(null));
  await second.fake.sessionArea.set(await first.fake.sessionArea.get(null));
  return second;
}

/** Signs the worker in and lets what follows a sign-in finish (the device's upload and pull, then the worker's own first sync round and the catch-up it starts). */
export async function signIn(rig: ReadingRig, email: string): Promise<void> {
  const out = await rig.connect(email);
  if (!out?.ok) throw new Error(`sign-in failed: ${JSON.stringify(out)}`);
  await rig.fireTimers();
  await rig.fireTimers();
  await quiet(rig);
}

/** Waits until the service has not been asked anything for a moment (the worker's background work after a sync round has ended). */
export async function quiet(rig: ReadingRig, ms = 80): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const n = rig.log.length;
    await new Promise((r) => setTimeout(r, ms));
    if (rig.log.length === n) return;
  }
}

export const pause = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** Polls until `test` holds (at most `ms`). */
export async function until(test: () => boolean | Promise<boolean>, ms = 20_000, step = 20): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end;) { if (await test()) return true; await pause(step); }
  return test();
}

/** A snapshot that must be answered (`ok`): the reply's snapshot. */
export async function snapshotOf(rig: ReadingRig, as: 'page' | 'content' = 'page', languageId = 'sq'): Promise<KnowledgeSnapshot> {
  const r = await rig.reading({ op: 'snapshot', languageId }, as);
  if (!r.ok || r.op !== 'snapshot') throw new Error(`snapshot refused: ${JSON.stringify(r)}`);
  return r.snapshot;
}

export interface Classified { verdicts: WireVerdict[]; asked: number; answered: number; messages: number; perMessage: Array<{ words: number; ids: number; asked: number; answered: number }> }

/** Every word, in messages of at most `batch` words under one snapshot id; every message must be answered `ok` with one verdict per word. */
export async function classifyAll(rig: ReadingRig, languageId: string, words: readonly WireWord[], snapshot: string, o: { varietyId?: string; as?: 'page' | 'content'; batch?: number } = {}): Promise<Classified> {
  const size = o.batch ?? MAX_WORDS_PER_MESSAGE;
  const out: Classified = { verdicts: [], asked: 0, answered: 0, messages: 0, perMessage: [] };
  for (let i = 0; i < words.length; i += size) {
    const part = words.slice(i, i + size);
    const r = await rig.reading({ op: 'classify', languageId, ...(o.varietyId ? { varietyId: o.varietyId } : {}), snapshot, words: part }, o.as ?? 'page');
    if (!r.ok || r.op !== 'classify') throw new Error(`classify refused (words ${i}..${i + part.length}): ${JSON.stringify(r)}`);
    if (r.snapshot !== snapshot) throw new Error('a batch was answered for another snapshot');
    if (r.verdicts.length !== part.length) throw new Error(`${r.verdicts.length} verdicts for ${part.length} words`);
    out.verdicts.push(...r.verdicts);
    out.asked += r.asked;
    out.answered += r.answered;
    out.messages += 1;
    out.perMessage.push({ words: part.length, ids: idsOf(part).length, asked: r.asked, answered: r.answered });
  }
  return out;
}

/** The device Repository's full rows of these units, as an extension page reads them (200 ids to a request). */
export async function deviceRows(rig: ReadingRig, unitIds: readonly string[]): Promise<Map<string, UnitKnowledge>> {
  const out = new Map<string, UnitKnowledge>();
  for (let i = 0; i < unitIds.length; i += 200) {
    const r = await rig.local({ op: 'knowledge', unitIds: unitIds.slice(i, i + 200) });
    if (!r?.ok) throw new Error(`device knowledge: ${JSON.stringify(r)}`);
    for (const row of r.knowledge as UnitKnowledge[]) out.set(row.unitId, row);
  }
  return out;
}
/** Every row the device Repository holds. */
export async function allDeviceRows(rig: ReadingRig): Promise<UnitKnowledge[]> {
  const r = await rig.local({ op: 'api', method: 'knowledge', args: [] });
  if (!r?.ok || !r.result?.ok) throw new Error(`device knowledge (all): ${JSON.stringify(r).slice(0, 300)}`);
  return [...(r.result.data.knowledge as UnitKnowledge[])].sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
}
export async function deviceEvents(rig: ReadingRig): Promise<StoredEvent[]> {
  const r = await rig.local({ op: 'export' });
  if (!r?.ok) throw new Error(`device export: ${JSON.stringify(r)}`);
  return r.events as StoredEvent[];
}

// ───────────────────────────── events, as this device's content script records them ─────────────────────────────

const SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
/** The learner's own mark on a word of the page, as the reading card sends it (placeholder identity; the worker puts the session's in). */
export function deviceMark(word: string, level: KnowledgeLevel, at: Date, sentence = SENTENCE): GoEvent {
  const start = sentence.indexOf(word);
  if (start < 0) throw new Error(`"${word}" is not in the sentence`);
  const card = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: start, selEnd: start + word.length } });
  return buildMarkEvent({ card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY }, version: '0.1.0', sessionId: `s${Math.random().toString(36).slice(2, 8)}`, now: at }, level);
}

/** What a comparison of two readings of the same rows may ignore: nothing. (Kept as a function so a test states it.) */
export const rowFacts = (r: UnitKnowledge | undefined): Record<string, unknown> | undefined => (r ? {
  unitId: r.unitId, languageId: r.languageId, level: r.level, encounters: r.encounters, selfMark: r.selfMark?.mark ?? null, selfMarkAt: r.selfMark?.at ?? null,
  events: r.basis.events, varieties: Object.keys(r.varieties ?? {}).sort(),
} : undefined);
