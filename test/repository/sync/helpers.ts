/** Test doubles for the sync client: a fake server that models the contract, a memory EventLog, event builders. */
import {
  validateEvent,
  type AppendOutcome, type EventFilter, type EventLog, type GoEvent, type PrivateDocument, type StoredEvent,
  type SyncPullRequest, type SyncPullResponse, type SyncPushRequest, type SyncPushResponse,
} from '../../../packages/repository-contract/src';
import {
  createLocalDocuments, createLocalQueue, createMemoryArea, createSyncClient, dedupeKeyFor, newEventId,
  type SyncClientOptions, type Transport,
} from '../../../packages/repository-sync/src';

export const LEARNER = 'learner-1';

export interface Clock { t: number; now: () => number; advance(ms: number): void }
export function makeClock(start = Date.parse('2026-10-08T12:00:00Z')): Clock {
  const c: Clock = { t: start, now: () => c.t, advance: (ms) => { c.t += ms; } };
  return c;
}

export function makeEvent(deviceId: string, clock: Clock, over: Partial<GoEvent> = {}, random: () => number = Math.random): GoEvent {
  return {
    id: newEventId(deviceId, clock.now(), random), v: 2, learnerId: LEARNER, enrolmentId: 'enr-1', languageId: 'es',
    at: new Date(clock.now()).toISOString(),
    producer: { app: 'golearn-app', version: '1.0.0', deviceId },
    kind: 'EncounterRecorded', subject: { itemIds: ['u:es:casa'] }, payload: { contextKind: 'none' },
    ...over,
  };
}

/** A memory EventLog standing in for the device's local store. `failNext` makes the next append throw. */
export function makeMemoryLog(): EventLog & { events: Map<string, StoredEvent>; failNext: number } {
  const events = new Map<string, StoredEvent>();
  const keys = new Map<string, string>();
  let seq = 0;
  const log = {
    events, failNext: 0,
    async append(learnerId: string, evs: GoEvent[]): Promise<AppendOutcome[]> {
      if (log.failNext > 0) { log.failNext -= 1; throw new Error('local store unavailable'); }
      const out: AppendOutcome[] = [];
      for (const e of evs) {
        const issues = validateEvent(e);
        if (issues.length || e.learnerId !== learnerId) { out.push({ id: e.id, stored: false, issues: issues.length ? issues : [{ path: 'learnerId', message: 'mismatch' }] }); continue; }
        if (events.has(e.id)) { out.push({ id: e.id, stored: false, duplicateOf: e.id }); continue; }
        const k = dedupeKeyFor(e);
        if (keys.has(k)) { out.push({ id: e.id, stored: false, duplicateOf: keys.get(k) }); continue; }
        seq += 1;
        events.set(e.id, { ...e, seq, recordedAt: new Date().toISOString() });
        keys.set(k, e.id);
        out.push({ id: e.id, stored: true });
      }
      return out;
    },
    async list(f: EventFilter) { return [...events.values()].filter((e) => e.learnerId === f.learnerId && e.seq > (f.afterSeq ?? 0)).sort((a, b) => a.seq - b.seq).slice(0, f.limit ?? 1e9); },
    async get(_l: string, id: string) { return events.get(id); },
    async head() { return seq; },
  };
  return log;
}

/** A fake server speaking the contract's sync shapes. */
export class FakeServer implements Transport {
  events = new Map<string, StoredEvent>();
  byKey = new Map<string, string>();
  docs = new Map<string, PrivateDocument>();
  seq = 0;
  /** Server clock offset from the shared test clock, ms (the client is ahead by `-serverOffsetMs`). */
  serverOffsetMs = 0;
  failNext = 0;
  /** Store the batch, then throw: the acknowledgement is lost. */
  lostAckNext = 0;
  pushCalls = 0;
  pullCalls = 0;
  pushedBatchSizes: number[] = [];
  constructor(public clock: Clock) {}

  serverNow(): number { return this.clock.now() + this.serverOffsetMs; }

  async push(req: SyncPushRequest): Promise<SyncPushResponse> {
    this.pushCalls += 1;
    if (this.failNext > 0) { this.failNext -= 1; throw new Error('network down'); }
    if (req.events.length) this.pushedBatchSizes.push(req.events.length);
    const outcomes: AppendOutcome[] = req.events.map((e) => {
      const issues = validateEvent(e);
      if (issues.length) return { id: e.id, stored: false, issues };
      if (this.events.has(e.id)) return { id: e.id, stored: false, duplicateOf: e.id };
      const k = dedupeKeyFor(e);
      const other = this.byKey.get(k);
      if (other) return { id: e.id, stored: false, duplicateOf: other };
      this.seq += 1;
      this.events.set(e.id, { ...e, seq: this.seq, recordedAt: new Date(this.serverNow()).toISOString() });
      this.byKey.set(k, e.id);
      return { id: e.id, stored: true };
    });
    const documents = (req.documents ?? []).map(({ doc, expectedRevision }) => {
      const cur = this.docs.get(doc.docId);
      if ((cur?.revision ?? 0) === expectedRevision) { this.docs.set(doc.docId, structuredClone(doc)); return { docId: doc.docId, ok: true }; }
      return { docId: doc.docId, ok: false, current: cur ? structuredClone(cur) : undefined };
    });
    if (this.lostAckNext > 0) { this.lostAckNext -= 1; throw new Error('timeout waiting for the response'); }
    return {
      outcomes, documents, serverTime: new Date(this.serverNow()).toISOString(),
      clockSkewMs: Date.parse(req.clientTime) - this.serverNow(), head: this.seq,
    };
  }

  async pull(req: SyncPullRequest): Promise<SyncPullResponse> {
    this.pullCalls += 1;
    if (this.failNext > 0) { this.failNext -= 1; throw new Error('network down'); }
    const events = [...this.events.values()].filter((e) => e.seq > req.afterSeq).sort((a, b) => a.seq - b.seq).slice(0, req.limit ?? 500);
    const since = req.documentsSince;
    const documents = [...this.docs.values()].filter((d) => !since || d.updatedAt >= since).map((d) => structuredClone(d));
    return { events: structuredClone(events), documents, head: this.seq, serverTime: new Date(this.serverNow()).toISOString() };
  }
}

export interface Device {
  id: string;
  area: ReturnType<typeof createMemoryArea>;
  queue: ReturnType<typeof createLocalQueue>;
  local: ReturnType<typeof makeMemoryLog>;
  docs: ReturnType<typeof createLocalDocuments>;
  client: ReturnType<typeof createSyncClient>;
}

export function makeDevice(id: string, server: Transport, clock: Clock, over: Partial<SyncClientOptions> = {}, area = createMemoryArea()): Device {
  const queue = createLocalQueue(area, { now: clock.now });
  const local = makeMemoryLog();
  const docs = createLocalDocuments(area, { deviceId: id, now: clock.now });
  const client = createSyncClient({
    queue, local, transport: server, deviceId: id, now: clock.now, documents: docs,
    backoff: { baseMs: 1000, maxMs: 60_000, factor: 2, jitter: 0 }, ...over,
  });
  return { id, area, queue, local, docs, client };
}

/** Deterministic RNG for the property test. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
