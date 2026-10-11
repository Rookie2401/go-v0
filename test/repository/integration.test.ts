// @vitest-environment node
/**
 * The Prompt 3 §18 integration scenario, end to end over the REAL packages: SQLite store (node:sqlite, in memory),
 * the real Albanian linguistics service, the real projection engine, the real authenticated service (in-process,
 * real scrypt crypto) and the real device-side sync client. No fakes except a controllable clock and a transport that
 * can be switched off to simulate the network.
 *
 * It proves invariants, not insertions: playback never becomes listening, a wrong grammar answer moves grammatical
 * understanding and nothing else, written recall and audio recognition are updated independently, assisted writing is
 * kept apart from independent writing, a rebuild equals the live state, duplicates change nothing, a second learner
 * cannot reach the first learner's data, and offline evidence survives a dead network and a lost acknowledgement.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, type GoEvent, type PrivateDocument, type SyncPullRequest, type SyncPushRequest, type UnitKnowledge } from '../../packages/repository-contract/src';
import { openSqliteStore } from '../../packages/repository-store/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { albanianPack, createLinguisticService } from '../../packages/repository-linguistics/src';
import { createInProcessApi, type RepositoryApi, type ServiceDeps } from '../../packages/repository-service/src';
import { adaptLinguistics } from '../../packages/repository-service/src/linguistics-adapter';
import { nodeCrypto } from '../../packages/repository-service/src/crypto-node';
import { createLocalQueue, createMemoryArea, createSyncClient, newEventId, type Transport } from '../../packages/repository-sync/src';

// ───────────────────────────── a controllable clock ─────────────────────────────
let clockMs = Date.UTC(2026, 9, 9, 8, 0, 0);
const nowIso = (): string => new Date(clockMs).toISOString();
const tick = (ms = 60_000): void => { clockMs += ms; };

const store = openSqliteStore(':memory:', { now: nowIso });
const engine = createProjectionEngine({ store, now: nowIso });
const linguistics = createLinguisticService(store, { now: nowIso });
const deps: ServiceDeps = { store, engine, linguistics: adaptLinguistics(linguistics), crypto: nodeCrypto, now: nowIso, log: () => {} };

const LEMMA = 'lemma:sq:libër:NOUN';
const FORM = 'form:sq:librin';
const SENTENCE = 'Fëmijët lexojnë librin.';

interface Who { api: RepositoryApi; learnerId: string; enrolmentId: string; deviceId: string; email: string }

let a: Who;
let b: Who;
let constructionId = '';
let sentenceKey = '';
let counter = 0;

function ev(who: Who, kind: GoEvent['kind'], subject: GoEvent['subject'], payload: Record<string, unknown>, extra: Partial<GoEvent> = {}): GoEvent {
  counter++;
  return {
    id: `it:${counter}:${kind}`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq', at: nowIso(),
    producer: { app: 'gopractice-review', version: 'test', deviceId: who.deviceId }, kind, subject, payload, dedupeKey: `it:${counter}`, ...extra,
  };
}

const ok = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>): T => {
  if (!r.ok) throw new Error(`api ${r.status} ${String(r.error)}: ${String(r.message)}`);
  return r.data as T;
};

async function signUp(email: string, deviceId: string): Promise<Who> {
  const api = createInProcessApi(deps);
  ok(await api.createAccount({ email, password: 'correct horse battery staple', displayName: email.split('@')[0] }));
  const session = ok<{ token: string; learnerId: string }>(await api.createSession({ email, password: 'correct horse battery staple', deviceId, platform: 'test' }));
  const pack = albanianPack();
  const enrolled = ok<{ enrolment: { enrolmentId: string } }>(await api.enrol({ languageId: 'sq', packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'reading' }] }));
  return { api, learnerId: session.learnerId, enrolmentId: enrolled.enrolment.enrolmentId, deviceId, email };
}

const dim = (rows: UnitKnowledge[], unitId: string) => {
  const row = rows.find((r) => r.unitId === unitId);
  if (!row) throw new Error(`no knowledge row for ${unitId}`);
  return row.dimensions;
};

const knowledgeOf = async (who: Who, ids: string[]) => ok<{ knowledge: UnitKnowledge[] }>(await who.api.knowledge(ids)).knowledge;

beforeAll(async () => {
  a = await signUp('ana@example.test', 'dev-A1');
  b = await signUp('ben@example.test', 'dev-B1');
});
afterAll(async () => { await store.close(); });

describe('Prompt 3 §18 — the Albanian learner, end to end over the real packages', () => {
  it('1–4. an Albanian learner exists; "librin" resolves to its lexeme and its morphological construction', async () => {
    expect(a.learnerId).not.toBe(b.learnerId);
    const res = ok<{ formId: string; units: Array<{ unitId: string; kind: string; status: string; features?: Record<string, string> }>; relations: Array<{ fromId: string; relation: string; toId: string }>; analysis: { candidates: unknown[]; status: string } | null; sentenceKey: string | null }>(
      await a.api.lookup({ languageId: 'sq', surface: 'librin', sentence: SENTENCE }),
    );
    expect(res.formId).toBe(FORM);
    expect(res.units.map((u) => u.unitId)).toContain(LEMMA);
    const morph = res.units.find((u) => u.kind === 'morph-construction');
    expect(morph, 'a morphological construction unit').toBeDefined();
    expect(morph!.features).toMatchObject({ Case: 'Acc', Definite: 'Def', Number: 'Sing' });
    constructionId = morph!.unitId;
    expect(res.relations).toContainEqual(expect.objectContaining({ fromId: FORM, relation: 'form-of', toId: LEMMA }));
    expect(res.relations).toContainEqual(expect.objectContaining({ fromId: FORM, relation: 'realizes', toId: constructionId }));
    expect(res.analysis!.candidates.length).toBeGreaterThan(0);
    expect(res.sentenceKey).toBeTruthy();
    sentenceKey = res.sentenceKey!;
    // the sentence itself is nowhere in the store
    const everything = JSON.stringify(await store.list({ learnerId: a.learnerId })) + JSON.stringify(await store.getUnits([FORM, LEMMA, constructionId]));
    expect(everything).not.toContain('lexojnë');
  });

  it('5–7. an encounter, a meaning lookup and a playback are exposure only: no listening or reading recognition', async () => {
    const events = [
      ev(a, 'SelectionLookedUp', { itemIds: [LEMMA, FORM, constructionId], sentenceKey, sourceRef: { kind: 'demo', title: 'test passage' } },
        { surface: 'librin', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma', 'morphology'] },
        { producer: { app: 'golearn-ext', version: 'test', deviceId: a.deviceId } }),
      ev(a, 'AssistanceRequested', { itemIds: [LEMMA, FORM], sentenceKey }, { assistance: 'gloss', depth: 'brief' }, { producer: { app: 'golearn-ext', version: 'test', deviceId: a.deviceId } }),
      ev(a, 'PronunciationPlayed', { itemIds: [LEMMA, FORM], sentenceKey }, { voice: 'synthetic' }, { producer: { app: 'golearn-ext', version: 'test', deviceId: a.deviceId } }),
    ];
    tick();
    const r = ok<{ stored: number; duplicates: number }>(await a.api.appendEvents(events));
    expect(r.stored).toBe(3);
    const d = dim(await knowledgeOf(a, [LEMMA]), LEMMA);
    expect(d.exposure.weight).toBeGreaterThan(0);
    expect(d.exposure.observations).toBe(3);
    expect(d.listeningRecognition.weight).toBe(0);   // playback is not listening
    expect(d.readingRecognition.weight).toBe(0);     // a click is not understanding
    expect(d.assistedRecognition.weight).toBe(0);    // asking for a gloss is not understanding with help either
    const counters = await engine.counters(a.learnerId, LEMMA);
    expect(counters).toMatchObject({ lookups: 1, assistance: 1, playbacks: 1 });
    // projection@5: the rows the service returns carry the level and the encounters (a lookup and an assistance request are two encounters; a playback is none)
    const row = (await knowledgeOf(a, [LEMMA])).find((r) => r.unitId === LEMMA)!;
    expect(row).toMatchObject({ level: 'seen', encounters: 2, modelVersion: 'projection@5' });
  });

  it('8. review candidates are explainable, and the provisional construction is not eligible for a grammar assessment', async () => {
    const c = ok<{ candidates: Array<{ unitId: string; score: number; reasons: Array<{ rule: string }>; eligibility: { eligible: boolean }; targetDimension: string }> }>(await a.api.candidates(a.enrolmentId, 20)).candidates;
    const lex = c.find((x) => x.unitId === LEMMA);
    expect(lex, 'the looked-up lexeme is a candidate').toBeDefined();
    expect(lex!.reasons.map((r) => r.rule)).toContain('repeatedLookups');
    expect(lex!.score).toBeGreaterThan(0);
    const morph = c.find((x) => x.unitId === constructionId);
    if (morph && morph.targetDimension === 'grammaticalUnderstanding') expect(morph.eligibility.eligible).toBe(false);
    for (const x of c) expect(x.reasons.length).toBeGreaterThan(0);
  });

  it('9–10. an incorrect morphology answer lowers grammatical understanding of the construction and nothing else', async () => {
    tick();
    ok(await a.api.submitReviews([ev(a, 'AssessmentAnswered', { itemIds: [constructionId] }, { constructionId, task: 'choose-form', correct: false, hinted: false, difficulty: 0.5 })]));
    const rows = await knowledgeOf(a, [constructionId, LEMMA]);
    const g = dim(rows, constructionId).grammaticalUnderstanding;
    expect(g.negative).toBeGreaterThan(0);
    expect(g.score).toBeLessThan(0.5);
    const lex = dim(rows, LEMMA);
    expect(lex.grammaticalUnderstanding.weight).toBe(0);
    expect(lex.productiveRetrieval.weight).toBe(0);
  });

  it('11–12. a correct written recall updates productive retrieval, independently of reading and listening', async () => {
    tick();
    ok(await a.api.submitReviews([ev(a, 'CardReviewed', { itemIds: [LEMMA], cardId: 'card-1' }, { cardKind: 'recall', grade: 'good', correct: true, hinted: false })]));
    const d = dim(await knowledgeOf(a, [LEMMA]), LEMMA);
    expect(d.productiveRetrieval.positive).toBeGreaterThan(0);
    expect(d.productiveRetrieval.score).toBeGreaterThan(0.5);
    expect(d.readingRecognition.weight).toBe(0);
    expect(d.listeningRecognition.weight).toBe(0);
  });

  it('13–14. a legitimate audio-only assessment updates listening recognition separately', async () => {
    tick();
    const before = dim(await knowledgeOf(a, [LEMMA]), LEMMA);
    ok(await a.api.submitReviews([ev(a, 'ListeningAssessed', { itemIds: [LEMMA] }, { stimulus: 'word', voice: 'recorded', answerShownBefore: false, correct: true, responseMode: 'choice' })]));
    const d = dim(await knowledgeOf(a, [LEMMA]), LEMMA);
    expect(d.listeningRecognition.positive).toBeGreaterThan(0);
    expect(d.listeningRecognition.score).toBeGreaterThan(0.5);
    expect(d.productiveRetrieval).toEqual(before.productiveRetrieval);
    expect(d.readingRecognition.weight).toBe(0);
    // a listening "assessment" whose answer was shown first is refused at the contract boundary
    const bad = ev(a, 'ListeningAssessed', { itemIds: [LEMMA] }, { stimulus: 'word', voice: 'recorded', answerShownBefore: true, correct: true, responseMode: 'choice' });
    const r = await a.api.submitReviews([bad]);
    expect(r.ok).toBe(false);
    expect(r.ok ? 0 : r.status).toBe(422);
  });

  it('15–16. independent and assisted writing are distinguished; the draft lives apart from the events', async () => {
    tick();
    const doc: PrivateDocument = { docId: 'draft-1', learnerId: a.learnerId, languageId: 'sq', kind: 'draft', title: 'My book', body: 'Unë e lexoj librin çdo ditë.', revision: 0, deviceId: a.deviceId, updatedAt: nowIso() };
    const independent = ev(a, 'ProductionRecorded', { itemIds: [LEMMA, constructionId], draftId: 'draft-1' }, { mode: 'free', assisted: false, assistance: [], usedCorrectly: true, wordCount: 6 }, { producer: { app: 'gopractice-tell', version: 'test', deviceId: a.deviceId } });
    ok(await a.api.submitWriting({ observation: independent, document: { doc, expectedRevision: 0 } }));
    const afterIndependent = dim(await knowledgeOf(a, [LEMMA]), LEMMA);
    expect(afterIndependent.contextualProduction.positive).toBeGreaterThan(0);
    expect(afterIndependent.assistedRecognition.weight).toBe(0);

    tick();
    const assisted = ev(a, 'ProductionRecorded', { itemIds: [LEMMA] }, { mode: 'guided', assisted: true, assistance: ['correction'], usedCorrectly: true }, { producer: { app: 'gopractice-tell', version: 'test', deviceId: a.deviceId } });
    ok(await a.api.submitWriting({ observation: assisted }));
    const afterAssisted = dim(await knowledgeOf(a, [LEMMA]), LEMMA);
    expect(afterAssisted.contextualProduction).toEqual(afterIndependent.contextualProduction); // assisted writing never counts as independent
    expect(afterAssisted.assistedRecognition.weight).toBeGreaterThan(0);

    // accepting a correction is not production
    ok(await a.api.appendEvents([ev(a, 'CorrectionAccepted', { itemIds: [LEMMA], draftId: 'draft-1' }, {}, { producer: { app: 'gopractice-tell', version: 'test', deviceId: a.deviceId } })]));
    const afterAccept = dim(await knowledgeOf(a, [LEMMA]), LEMMA);
    expect(afterAccept.contextualProduction).toEqual(afterIndependent.contextualProduction);
    expect(afterAccept.productiveRetrieval).toEqual(afterIndependent.productiveRetrieval);

    // the draft text is in the document store and in no event
    const stored = ok<{ document: PrivateDocument }>(await a.api.getDocument('draft-1')).document;
    expect(stored.body).toContain('librin');
    const log = await store.list({ learnerId: a.learnerId });
    expect(JSON.stringify(log)).not.toContain('çdo ditë');
    // a writing observation that smuggles text is refused
    const smuggled = ev(a, 'ProductionRecorded', { itemIds: [LEMMA] }, { mode: 'free', assisted: false, assistance: [], usedCorrectly: true, text: 'Unë e lexoj librin.' });
    const r = await a.api.submitWriting({ observation: smuggled });
    expect(r.ok).toBe(false);
  });

  it('17–18. a rebuild from the historical events equals the live state', async () => {
    const live = await knowledgeOf(a, []);
    expect(live.length).toBeGreaterThanOrEqual(3);
    const rebuilt = await engine.rebuild(a.learnerId);
    const norm = (rows: UnitKnowledge[]) => [...rows].sort((x, y) => x.unitId.localeCompare(y.unitId));
    expect(norm(rebuilt)).toEqual(norm(live));
    expect(norm(await knowledgeOf(a, []))).toEqual(norm(live));
  });

  it('19–20. replaying duplicate events (same ids, and same dedupe keys under new ids) changes nothing', async () => {
    const live = await knowledgeOf(a, []);
    const head = ok<{ head: number }>(await a.api.listEvents({ limit: 1 })).head;
    const all = ok<{ events: GoEvent[] }>(await a.api.listEvents({ limit: 1000 })).events;
    const replay = all.filter((e) => e.kind !== 'EnrolmentChanged').map(({ ...e }) => { const { seq: _s, recordedAt: _r, ...rest } = e as GoEvent & { seq?: number }; return rest as GoEvent; });
    const r1 = ok<{ stored: number; duplicates: number }>(await a.api.appendEvents(replay));
    expect(r1.stored).toBe(0);
    expect(r1.duplicates).toBe(replay.length);
    const renamed = replay.map((e) => ({ ...e, id: `${e.id}:retry` }));
    const r2 = ok<{ stored: number; duplicates: number }>(await a.api.appendEvents(renamed));
    expect(r2.stored).toBe(0);
    expect(ok<{ head: number }>(await a.api.listEvents({ limit: 1 })).head).toBe(head);
    expect(await knowledgeOf(a, [])).toEqual(live);
  });

  it('21–22. another learner cannot read, write or export the first learner\'s data', async () => {
    const foreign = ev(a, 'CardReviewed', { itemIds: [LEMMA] }, { cardKind: 'recall', grade: 'good', correct: true, hinted: false });
    const w = await b.api.appendEvents([foreign]);
    expect(w.ok).toBe(false);
    expect(w.ok ? 0 : w.status).toBe(403);
    expect((await store.list({ learnerId: a.learnerId })).some((e) => e.id === foreign.id)).toBe(false);
    const doc = await b.api.getDocument('draft-1');
    expect(doc.ok).toBe(false);
    expect([403, 404]).toContain(doc.ok ? 0 : doc.status);
    const cand = await b.api.candidates(a.enrolmentId);
    expect(cand.ok).toBe(false);
    const kb = ok<{ knowledge: UnitKnowledge[] }>(await b.api.knowledge([LEMMA])).knowledge;
    expect(kb.every((r) => r.learnerId === b.learnerId)).toBe(true);
    expect(kb.length).toBe(0);
    const exported = ok<Record<string, unknown>>(await b.api.exportAll());
    expect(JSON.stringify(exported)).not.toContain(a.learnerId);
    expect(JSON.stringify(exported)).not.toContain('draft-1');
    const pushed = await b.api.syncPush({ deviceId: b.deviceId, events: [ev(a, 'ItemMarked', { itemIds: [LEMMA] }, { mark: 'known' })], clientTime: nowIso() });
    expect(pushed.ok).toBe(false);
    expect(pushed.ok ? 0 : pushed.status).toBe(403);
    const noToken = createInProcessApi(deps);
    expect((await noToken.knowledge([LEMMA])).ok).toBe(false);
  });

  it('23–24. offline events on a second device survive a dead network and a lost acknowledgement; nothing is lost or duplicated', async () => {
    // device 2 of learner A: its own session, its own queue, a transport over the real service that can be cut
    const api2 = createInProcessApi(deps);
    ok(await api2.createSession({ email: a.email, password: 'correct horse battery staple', deviceId: 'dev-A2', platform: 'test' }));
    let network: 'up' | 'down' | 'lose-ack' = 'down';
    const transport: Transport = {
      async push(req: SyncPushRequest) {
        if (network === 'down') throw new Error('network unreachable');
        const r = await api2.syncPush(req);
        if (!r.ok) throw new Error(`push ${r.status}`);
        if (network === 'lose-ack') { network = 'up'; throw new Error('timeout after the server stored the batch'); }
        return r.data;
      },
      async pull(req: SyncPullRequest) {
        if (network === 'down') throw new Error('network unreachable');
        const r = await api2.syncPull(req);
        if (!r.ok) throw new Error(`pull ${r.status}`);
        return r.data;
      },
    };
    const area = createMemoryArea();
    const queue = createLocalQueue(area, { now: () => clockMs });
    const local = store; // the device's local log: for the test, a second view on the same store would hide bugs, so use a separate memory log
    const localLog = createLocalLog();
    const client = createSyncClient({ queue, local: localLog, transport, deviceId: 'dev-A2', now: () => clockMs, random: () => 0.5, backoff: { baseMs: 10, maxMs: 100, factor: 2, jitter: 0 } });
    void local;

    const offline: GoEvent[] = [];
    for (let i = 0; i < 5; i++) {
      tick(1000);
      const e: GoEvent = { ...ev(a, 'CardReviewed', { itemIds: [LEMMA], cardId: `offline-${i}` }, { cardKind: 'recognition', grade: 'good', correct: true, hinted: false }), id: newEventId('dev-A2', clockMs), producer: { app: 'gopractice-review', version: 'test', deviceId: 'dev-A2' } };
      e.dedupeKey = e.id;
      offline.push(e);
      const q = await queue.enqueue(e);
      expect(q.ok).toBe(true);
    }
    expect(await queue.size()).toBe(5);
    const headBefore = await store.head(a.learnerId);

    // 1. the network is dead: nothing is lost, the queue keeps everything, the client reports the failure
    const dead = await client.syncOnce({ force: true });
    expect(dead.ok ?? false).toBe(false);
    expect(await queue.size()).toBe(5);
    expect(await store.head(a.learnerId)).toBe(headBefore);

    // 2. the server stores the batch but the acknowledgement is lost; the retry must be answered with duplicates
    network = 'lose-ack';
    tick(5000);
    const lost = await client.syncOnce({ force: true });
    expect(lost.ok ?? false).toBe(false);
    expect(await store.head(a.learnerId)).toBe(headBefore + 5); // the server has them
    expect(await queue.size()).toBe(5); // the device does not know yet

    tick(5000);
    const healed = await client.syncOnce({ force: true });
    expect(healed.ok ?? false).toBe(true);
    expect(await queue.size()).toBe(0);
    expect(await store.head(a.learnerId)).toBe(headBefore + 5); // exactly once on the server
    const serverIds = new Set((await store.list({ learnerId: a.learnerId, limit: 5000 })).map((e) => e.id));
    for (const e of offline) expect(serverIds.has(e.id)).toBe(true);

    // the evidence counts: five correct unhinted recognitions moved reading recognition, which nothing else had touched
    const d = dim(await knowledgeOf(a, [LEMMA]), LEMMA);
    expect(d.readingRecognition.observations).toBe(5);
    expect(d.readingRecognition.score).toBeGreaterThan(0.5);

    // 3. pull brings the whole history to the second device, idempotently
    const p1 = await client.pull();
    expect(p1.ok ?? false).toBe(true);
    const n1 = (await localLog.list({ learnerId: a.learnerId, limit: 5000 })).length;
    expect(n1).toBe(await store.head(a.learnerId));
    const p2 = await client.pull();
    expect(p2.ok ?? false).toBe(true);
    expect((await localLog.list({ learnerId: a.learnerId, limit: 5000 })).length).toBe(n1);
    const status = await client.status();
    expect(status.pending).toBe(0);
    expect(status.lastError).toBeUndefined();
  });
});

/** A minimal device-side EventLog over a Map, idempotent on id — what a Dexie-backed local store would provide. */
function createLocalLog() {
  const rows = new Map<string, GoEvent & { seq: number; recordedAt: string }>();
  let seq = 0;
  return {
    async append(learnerId: string, events: GoEvent[]) {
      return events.map((e) => {
        if (e.learnerId !== learnerId) return { id: e.id, stored: false, issues: [{ path: 'learnerId', message: 'not this learner' }] };
        if (rows.has(e.id)) return { id: e.id, stored: false, duplicateOf: e.id };
        rows.set(e.id, { ...e, seq: ++seq, recordedAt: e.recordedAt ?? nowIso() });
        return { id: e.id, stored: true };
      });
    },
    async list(f: { learnerId: string; limit?: number }) { return [...rows.values()].filter((e) => e.learnerId === f.learnerId).slice(0, f.limit ?? 1000); },
    async get(learnerId: string, id: string) { const r = rows.get(id); return r && r.learnerId === learnerId ? r : undefined; },
    async head(learnerId: string) { return [...rows.values()].filter((e) => e.learnerId === learnerId).length; },
  };
}
