// @vitest-environment node
/**
 * Offline / failure audit — the durable queue and synchronisation (brief §23):
 *   no connection, Repository unavailable (503) and back, lost acknowledgement, duplicate upload, out-of-order events,
 *   expired or revoked session, multi-device conflicts on a draft.
 * Real service (both stores), real GoLearn worker, real sync client, real GoTell syncing draft store. Fakes: the network
 * boundary (`createNet`) and the clock.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { createSyncClient, type SyncClient, type Transport } from '../../packages/repository-sync/src';
import {
  createDraftStore, createLocalDraftStore, createSyncingDraftStore, newVersion, type DraftRecord,
} from '../../packages/gotell/src';
import { createMemoryArea } from '../../packages/repository-sync/src';
import {
  PASSWORD, STORE_KINDS, addDevice, comparableKnowledge, firstDifference, createDevice, createNet, createPracticeDevice, createStack, lookup, production, raw, review,
  serverEvents, signUp, text, transportOf, type Learner, type Stack, type StoreKind,
} from './privacy.support';
import { accountFor, createWorkerRig } from './offline.support';

const stacks: Stack[] = [];
const make = (kind: StoreKind): Stack => { const s = createStack(kind); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

const queueKeys = async (rig: ReturnType<typeof createWorkerRig>): Promise<string[]> => Object.keys(await rig.fake.local.get(null)).filter((k) => k.startsWith('queue:'));
const countOf = async (s: Stack, learnerId: string, id: string): Promise<number> => (await serverEvents(s, learnerId)).filter((e) => e.id === id).length;

describe.each(STORE_KINDS)('no connection: a GoLearn encounter is queued durably and sent exactly once — %s store', (kind) => {
  async function offlineEncounter() {
    const s = make(kind);
    const net = createNet(s);
    const a = await accountFor(s, 'ana@example.com');
    const rig = createWorkerRig(s, net);
    expect((await rig.connect(a.email)).ok).toBe(true);
    net.calls.length = 0;
    net.down = true;
    const { reply, eventId } = await rig.recordLookup();
    return { s, net, a, rig, reply, eventId };
  }

  it('the encounter is recorded and on disk before anything is sent; the failed sync is reported and nothing is lost', async () => {
    const { s, net, a, rig, reply, eventId } = await offlineEncounter();
    expect(reply).toMatchObject({ ok: true, attributed: 'account' });
    expect(await queueKeys(rig)).toEqual([`queue:${eventId}`]);                  // durable: a row in chrome.storage.local
    await rig.fireTimers();                                                       // the debounced sync runs and fails
    const sync = await rig.page({ type: 'golearn:sync-now' });
    expect(sync.ok).toBe(false);
    const st = await rig.page({ type: 'golearn:status' });
    expect(st.sync).toMatchObject({ pending: 1, online: true, needsSignIn: false });
    expect(st.sync.lastError).toBeTruthy();
    expect(await countOf(s, a.learnerId, eventId)).toBe(0);
    expect(net.calls.every((c) => c.outcome === 'network-error')).toBe(true);
    const row = (await rig.fake.local.get(`queue:${eventId}`))[`queue:${eventId}`] as { attempts: number; lastError?: string };
    expect(row.attempts).toBeGreaterThan(0);                                      // the failed attempts are counted on the row, the row stays
    expect(row.lastError).toBeTruthy();
  });

  it('the browser kills the worker while offline: the restarted worker still has the event, and when the network returns the server holds exactly one copy', async () => {
    const { s, net, a, rig, eventId } = await offlineEncounter();
    await rig.fireTimers();
    rig.restart();                                                                // a new worker over the same storage
    expect((await rig.page({ type: 'golearn:status' })).sync.pending).toBe(1);
    rig.restart();
    net.down = false;
    rig.advance(10 * 60_000);                                                     // past any backoff
    const sync = await rig.page({ type: 'golearn:sync-now' });
    expect(sync.ok).toBe(true);
    expect(await countOf(s, a.learnerId, eventId)).toBe(1);
    expect(await queueKeys(rig)).toEqual([]);
    expect((await rig.page({ type: 'golearn:status' })).sync.pending).toBe(0);
    await rig.page({ type: 'golearn:sync-now' });
    rig.restart();
    await rig.page({ type: 'golearn:sync-now' });
    expect(await countOf(s, a.learnerId, eventId)).toBe(1);                       // sent exactly once, however often it syncs or restarts
  });

  it('the acknowledgement is lost (the server stored the event, the answer never arrived): the retry is told "duplicate", the queue empties, still one copy', async () => {
    const { s, net, a, rig, eventId } = await offlineEncounter();
    net.down = false;
    net.loseResponses = 1;
    const first = await rig.page({ type: 'golearn:sync-now' });
    expect(first.ok).toBe(false);                                                 // the device cannot know it arrived
    expect(await countOf(s, a.learnerId, eventId)).toBe(1);                       // but it did
    expect((await rig.page({ type: 'golearn:status' })).sync.pending).toBe(1);
    rig.advance(10 * 60_000);
    const second = await rig.page({ type: 'golearn:sync-now' });
    expect(second.ok).toBe(true);
    expect(await countOf(s, a.learnerId, eventId)).toBe(1);
    expect((await rig.page({ type: 'golearn:status' })).sync.pending).toBe(0);
  });

  it('many encounters recorded offline across restarts all arrive, each once, in the order they were made', async () => {
    const { s, net, a, rig } = await offlineEncounter();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await rig.recordLookup(`fjalë${i}`, `Kjo është fjalia ${i} me fjalë${i} brenda.`);
      expect(r.reply.ok).toBe(true);
      ids.push(r.eventId);
      if (i % 2) rig.restart();
    }
    net.down = false;
    rig.advance(10 * 60_000);
    expect((await rig.page({ type: 'golearn:sync-now' })).ok).toBe(true);
    const server = (await serverEvents(s, a.learnerId)).filter((e) => e.kind === 'SelectionLookedUp');
    expect(server.length).toBeGreaterThanOrEqual(7);
    const mine = server.filter((e) => ids.includes(e.id)).map((e) => e.id);
    expect(mine).toEqual(ids);                                                    // arrival order = recording order
    expect(new Set(server.map((e) => e.id)).size).toBe(server.length);
  });
});

describe.each(STORE_KINDS)('Repository unavailable (503) and back: backoff, no loss, no duplicate — %s store', (kind) => {
  const BASE = 1_000;
  async function device(n: number) {
    const s = make(kind);
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const d = createDevice(a, net);
    const events = Array.from({ length: n }, () => lookup(a));
    await d.record(events);
    return { s, net, a, d, events };
  }

  it('each failure backs off exponentially (1 s, 2 s, 4 s); within the window no request is made at all; the queue keeps every event', async () => {
    const { net, d, events } = await device(5);
    net.status = 503; net.statusTimes = 99;
    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await d.client.syncOnce();
      expect(r.ok).toBe(false);
      const st = await d.client.status();
      expect(st.lastError).toMatch(/503/);
      expect(st.pending).toBe(5);
      delays.push((st.nextRetryAt ?? 0) - d.clock.ms);
      const during = net.calls.length;
      expect((await d.client.syncOnce()).skipped).toBe('backoff');                 // inside the window: nothing is sent
      expect(net.calls.length).toBe(during);
      d.clock.ms += delays[i] + 1;
    }
    expect(delays).toEqual([BASE, 2 * BASE, 4 * BASE]);
    expect((await d.queue.pending()).map((r) => r.event.id)).toEqual(events.map((e) => e.id));   // order kept
    expect((await d.queue.pending()).every((r) => r.attempts === 3)).toBe(true);
  });

  it('the delay is capped at the maximum, however long the outage', async () => {
    const { net, d } = await device(1);
    net.status = 503; net.statusTimes = 999;
    let last = 0;
    for (let i = 0; i < 14; i++) {
      await d.client.syncOnce({ force: true });
      const st = await d.client.status();
      last = (st.nextRetryAt ?? 0) - d.clock.ms;
      d.clock.ms += last;
    }
    expect(last).toBe(60_000);                                                      // the harness's maxMs
  });

  it('when the service is back the next attempt sends everything once; nothing is duplicated by the retries, and a further sync adds nothing', async () => {
    const { s, net, a, d, events } = await device(5);
    net.status = 503; net.statusTimes = 2;
    expect((await d.client.syncOnce()).ok).toBe(false);
    d.clock.ms += 5_000;
    expect((await d.client.syncOnce()).ok).toBe(false);
    d.clock.ms += 10_000;
    const ok = await d.client.syncOnce();
    expect(ok.ok).toBe(true);
    expect(ok.push?.acked).toBe(5);
    expect((await d.client.status()).pending).toBe(0);
    const held = (await serverEvents(s, a.learnerId)).filter((e) => events.some((x) => x.id === e.id));
    expect(held.map((e) => e.id)).toEqual(events.map((e) => e.id));
    await d.client.syncOnce({ force: true });
    expect((await serverEvents(s, a.learnerId)).length).toBe(held.length + 1);      // +1: the EnrolmentChanged the service wrote at sign-up
    expect(net.count('/sync/push')).toBeGreaterThanOrEqual(3);
  });

  it('a failure in the middle of a large queue: the batch already acknowledged stays acknowledged, the rest stays queued, the retry sends only the rest', async () => {
    const { s, a, d, events } = await device(0);
    const many = Array.from({ length: 450 }, () => lookup(a));
    await d.record(many);
    let pushes = 0;
    const flaky: Transport = {
      push: async (req) => { pushes++; if (pushes === 2) throw new Error('503 mid-way'); return transportOf(createNet(s).api(a.token)).push(req); },
      pull: (req) => transportOf(createNet(s).api(a.token)).pull(req),
    };
    const client: SyncClient = createSyncClient({ queue: d.queue, local: d.log, transport: flaky, deviceId: a.deviceId, now: () => d.clock.ms, random: () => 0.5, backoff: { baseMs: 1000, maxMs: 60_000, factor: 2, jitter: 0 } });
    const first = await client.push();
    expect(first.ok).toBe(false);
    expect(first.acked).toBe(200);                                                  // the first batch of 200 got through
    expect(await d.queue.size()).toBe(250);
    expect((await serverEvents(s, a.learnerId)).filter((e) => many.some((m) => m.id === e.id)).length).toBe(200);
    const second = await client.push();
    expect(second.ok).toBe(true);
    expect(second.sent).toBe(250);                                                   // not 450: the acknowledged ones are not re-sent
    expect((await serverEvents(s, a.learnerId)).filter((e) => many.some((m) => m.id === e.id)).length).toBe(450);
    expect(events.length).toBe(0);
  });

  it('GoLearn\'s worker: a 503 is a retryable error (not "sign in again"); the event waits and arrives once the service answers', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await accountFor(s, 'ana@example.com');
    const rig = createWorkerRig(s, net);
    expect((await rig.connect(a.email)).ok).toBe(true);
    const { eventId } = await rig.recordLookup();
    net.status = 503; net.statusTimes = 99;
    const r = await rig.page({ type: 'golearn:sync-now' });
    expect(r.ok).toBe(false);
    const st = await rig.page({ type: 'golearn:status' });
    expect(st.sync).toMatchObject({ pending: 1, needsSignIn: false });
    expect(st.sync.lastError).toMatch(/503|unavailable/i);
    net.statusTimes = 0;
    rig.advance(10 * 60_000);
    expect((await rig.page({ type: 'golearn:sync-now' })).ok).toBe(true);
    expect(await countOf(s, a.learnerId, eventId)).toBe(1);
  });

  it('a 500 for a request the server cannot process leaves the event queued and retried (it is not dropped or marked rejected)', async () => {
    const { net, d } = await device(1);
    net.status = 500; net.statusTimes = 1;
    expect((await d.client.syncOnce()).ok).toBe(false);
    expect((await d.client.status())).toMatchObject({ pending: 1, rejected: 0 });
  });
});

describe.each(STORE_KINDS)('duplicate event upload — %s store', (kind) => {
  it('the same event id sent twice, in separate requests, is stored once; the projection and the log do not change; the original row is untouched', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const e = review(a, { correct: true });
    const first = await a.api.appendEvents([e]);
    expect(first.ok && first.data.stored).toBe(1);
    const k1 = JSON.stringify(await comparableKnowledge(s, a.learnerId));
    const log1 = await serverEvents(s, a.learnerId);
    const again = await a.api.appendEvents([e]);
    expect(again.ok && again.data.stored).toBe(0);
    expect(again.ok && again.data.duplicates).toBe(1);
    expect(again.ok && again.data.outcomes[0]).toMatchObject({ id: e.id, stored: false, duplicateOf: e.id });
    expect(JSON.stringify(await comparableKnowledge(s, a.learnerId))).toBe(k1);
    const log2 = await serverEvents(s, a.learnerId);
    expect(log2).toEqual(log1);                                                    // same seq, same recordedAt, same everything
    expect(log2.filter((x) => x.id === e.id).length).toBe(1);
  });

  it('a retried batch of old and new events stores only the new ones; the same id twice inside one batch and the same dedupeKey under another id are one event', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const old1 = review(a); const old2 = review(a, { correct: false });
    expect((await a.api.appendEvents([old1, old2])).ok).toBe(true);
    const fresh = review(a, { dedupeKey: 'fresh:1' });
    const sameKey = review(a, { dedupeKey: 'fresh:1' });
    const r = await a.api.appendEvents([old1, fresh, old2, fresh, sameKey]);
    expect(r.ok && r.data.stored).toBe(1);
    expect(r.ok && r.data.duplicates).toBe(4);
    const held = (await serverEvents(s, a.learnerId)).filter((e) => [old1.id, old2.id, fresh.id, sameKey.id].includes(e.id));
    expect(held.map((e) => e.id).sort()).toEqual([old1.id, old2.id, fresh.id].sort());
  });

  it('two identical uploads at the same moment (a retry racing its original) give one stored event and no error', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const e = review(a);
    const results = await Promise.all([a.api.appendEvents([e]), a.api.appendEvents([e]), a.api.appendEvents([e])]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.reduce((n, r) => n + (r.ok ? r.data.stored : 0), 0)).toBe(1);
    expect((await serverEvents(s, a.learnerId)).filter((x) => x.id === e.id).length).toBe(1);
  });

  it('the same events through /sync/push twice (a replayed request) change nothing', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const evs = [lookup(a), review(a)];
    const body = { deviceId: a.deviceId, events: evs, documents: [], clientTime: s.clock.now() };
    const one = await a.api.syncPush(body);
    const k1 = JSON.stringify(await comparableKnowledge(s, a.learnerId));
    const two = await a.api.syncPush(body);
    expect(one.ok && one.data.outcomes.every((o) => o.stored)).toBe(true);
    expect(two.ok && two.data.outcomes.every((o) => !o.stored && o.duplicateOf)).toBe(true);
    expect(JSON.stringify(await comparableKnowledge(s, a.learnerId))).toBe(k1);
  });
});

describe.each(STORE_KINDS)('events arriving out of order — %s store', (kind) => {
  /** A small deterministic generator (mulberry32) so a failing permutation can be replayed. */
  const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const DAY = 86_400_000;

  /** Event templates over three units, a week of history, every evidence route that the fold treats differently. */
  function templates(seed: number): Array<(who: Pick<Learner, 'learnerId' | 'enrolmentId' | 'deviceId'>, tag: string) => GoEvent> {
    const r = rng(seed);
    const at = (): string => new Date(Date.UTC(2026, 9, 2, 8, 0, 0) + Math.floor(r() * 7 * DAY)).toISOString();
    const units = ['lemma:sq:libër:NOUN', 'lemma:sq:shtëpi:NOUN', 'lemma:sq:çaj:NOUN'];
    const out: Array<(who: Pick<Learner, 'learnerId' | 'enrolmentId' | 'deviceId'>, tag: string) => GoEvent> = [];
    for (let i = 0; i < 24; i++) {
      const when = at(); const unit = units[i % 3]; const kind = i % 4; const ok = r() > 0.5;   // all randomness is drawn HERE, once, so both learners get identical events
      out.push((who, tag) => {
        const id = `${tag}-${i}`;
        if (kind === 0) return review(who, { id, at: when, correct: ok, subject: { itemIds: [unit], cardId: `c${i % 3}` } });
        if (kind === 1) return lookup(who, { id, at: when, subject: { itemIds: [unit.replace('lemma:', 'form:').replace(':NOUN', '')], sentenceKey: `s${i}` } });
        if (kind === 2) return production(who, { id, at: when, subject: { itemIds: [unit], draftId: 'd1' }, payload: { mode: 'free', assisted: i % 8 === 2, assistance: i % 8 === 2 ? ['hint'] : [], usedCorrectly: i % 3 === 0 ? true : 'unjudged', draftId: 'd1', wordCount: 4 } });
        return lookup(who, { id, at: when, kind: 'AssistanceRequested', subject: { itemIds: [unit], sentenceKey: `s${i}` }, payload: { assistance: 'gloss', depth: 'brief' } });
      });
    }
    return out;
  }

  it('two events with the later `at` arriving first give the same learner state as arriving in time order', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const b = await signUp(s, 'ben@example.com', 'phone-b');
    const mk = (who: Learner, tag: string): GoEvent[] => [
      review(who, { id: `${tag}-early`, at: '2026-10-05T08:00:00.000Z', correct: false }),
      review(who, { id: `${tag}-late`, at: '2026-10-08T08:00:00.000Z', correct: true }),
    ];
    const [aEarly, aLate] = mk(a, 'a');
    const [bEarly, bLate] = mk(b, 'b');
    expect((await a.api.appendEvents([aEarly, aLate])).ok).toBe(true);                // time order, one batch
    expect((await b.api.appendEvents([bLate])).ok).toBe(true);                        // the later event first, alone ...
    expect((await b.api.appendEvents([bEarly])).ok).toBe(true);                       // ... the earlier one afterwards
    expect(await comparableKnowledge(s, b.learnerId)).toEqual(await comparableKnowledge(s, a.learnerId));
    const seqs = (await serverEvents(s, b.learnerId)).map((e) => e.id);
    expect(seqs.indexOf('b-late')).toBeLessThan(seqs.indexOf('b-early'));              // the log keeps ARRIVAL order (seq) ...
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])('property (seed %i): 24 mixed events folded in time order in one batch, and the same events shuffled into random batches, give identical knowledge', async (seed) => {
    const s = make(kind);
    const a = await signUp(s, `ordered${seed}@example.com`, `da-${seed}`);
    const b = await signUp(s, `shuffled${seed}@example.com`, `db-${seed}`);
    const tpl = templates(seed);
    const inOrder = tpl.map((t) => t(a, 'o')).sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
    expect((await a.api.appendEvents(inOrder)).ok).toBe(true);
    const r = rng(seed * 7919);
    const shuffled = tpl.map((t) => t(b, 's'));
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    for (let i = 0; i < shuffled.length;) {                                            // random batch sizes, each followed by the service's own projection
      const n = 1 + Math.floor(r() * 5);
      const res = await b.api.appendEvents(shuffled.slice(i, i + n));
      expect(res.ok).toBe(true);
      i += n;
    }
    const folded = (await comparableKnowledge(s, a.learnerId)) as Array<{ dimensions: Record<string, { observations: number }> }>;
    expect(folded.length).toBeGreaterThanOrEqual(3);                                   // the comparison is not between two empty projections
    expect(folded.some((k) => k.dimensions.readingRecognition.observations > 0) && folded.some((k) => k.dimensions.contextualProduction.observations + k.dimensions.assistedRecognition.observations > 0)).toBe(true);
    expect(firstDifference(await comparableKnowledge(s, b.learnerId), folded)).toBe('');
    const pa = await a.api.preferences('sq'); const pb = await b.api.preferences('sq');
    expect(pa.ok && pb.ok && JSON.stringify(pb.data.preferences)).toBe(pa.ok && pb.ok ? JSON.stringify({ ...pa.data.preferences, learnerId: b.learnerId }) : '');
  });

  it('a rebuild from the log equals the live rows after out-of-order arrival', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const tpl = templates(99).map((t) => t(a, 'x'));
    const reversed = [...tpl].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
    for (const e of reversed) expect((await a.api.appendEvents([e])).ok).toBe(true);
    const live = JSON.stringify(await comparableKnowledge(s, a.learnerId));
    await s.store.clearKnowledge(a.learnerId);
    await s.store.putProjectionCursor(a.learnerId, { seq: 0, modelVersion: 'rebuild' });
    expect((await a.api.knowledge()).ok).toBe(true);                                    // the engine refolds on the next read
    const rebuilt = JSON.stringify(await comparableKnowledge(s, a.learnerId));
    expect(rebuilt).toBe(live);
  });
});

describe.each(STORE_KINDS)('expired or revoked session (401) — %s store', (kind) => {
  it('bare sync client: a revoked token fails every attempt with 401, the queue keeps everything, and a client with a fresh token flushes it once', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const d = createDevice(a, net);
    const evs = [lookup(a), review(a)];
    await d.record(evs);
    await a.api.deleteSession();                                                       // the session ends (another device signed it out, or it expired)
    const r = await d.client.syncOnce();
    expect(r.ok).toBe(false);
    expect((await d.client.status()).lastError).toMatch(/401/);
    expect(await d.queue.size()).toBe(2);
    expect((await serverEvents(s, a.learnerId)).some((e) => evs.some((x) => x.id === e.id))).toBe(false);
    // the learner signs in again: a new session for the same device, a client over the SAME queue area
    const again = await addDevice(s, a, a.deviceId);
    const d2 = createDevice(again, net, { area: d.area, clock: d.clock });
    const ok = await d2.client.syncOnce();
    expect(ok.ok).toBe(true);
    expect((await serverEvents(s, a.learnerId)).filter((e) => evs.some((x) => x.id === e.id)).length).toBe(2);
    expect(await d2.queue.size()).toBe(0);
  });

  it('GoLearn worker, session revoked on the server: the queue holds, sync stops asking (no retry storm), the popup says "sign in again", and signing in flushes everything once', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await accountFor(s, 'ana@example.com');
    const rig = createWorkerRig(s, net);
    expect((await rig.connect(a.email)).ok).toBe(true);
    const token = ((await rig.fake.local.get('golearn:session'))['golearn:session'] as { token: string }).token;
    expect((await s.api(token).deleteSession()).ok).toBe(true);                        // revoked behind the worker's back
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await rig.recordLookup(`fjalë${i}`, `Kjo është fjalia ${i} me fjalë${i} brenda.`)).eventId);
    const r = await rig.page({ type: 'golearn:sync-now' });
    expect(r).toMatchObject({ ok: false, skipped: 'needs-sign-in' });
    let st = await rig.page({ type: 'golearn:status' });
    expect(st.needsSignIn).toBe(true);
    expect(st.sync).toMatchObject({ pending: 3, needsSignIn: true });
    expect(st.sync.lastError).toMatch(/sign in again/i);
    const calls = net.calls.length;
    await rig.page({ type: 'golearn:sync-now' }); await rig.page({ type: 'golearn:sync-now' });
    expect(net.calls.length).toBe(calls);                                              // it does not hammer a service that said 401
    rig.restart();
    st = await rig.page({ type: 'golearn:status' });
    expect(st.sync).toMatchObject({ pending: 3, needsSignIn: true });                  // and the state survives a worker restart
    expect((await rig.connect(a.email)).ok).toBe(true);                                // re-sign-in
    await rig.fireTimers();
    st = await rig.page({ type: 'golearn:status' });
    expect(st.sync).toMatchObject({ pending: 0, needsSignIn: false });
    for (const id of ids) expect(await countOf(s, a.learnerId, id)).toBe(1);
  });

  it('GoLearn worker, session expired by the clock (31 days offline): events still queue; nothing is sent with an expired token; signing in flushes them', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await accountFor(s, 'ana@example.com');
    const rig = createWorkerRig(s, net);
    expect((await rig.connect(a.email)).ok).toBe(true);
    rig.advance(31 * 86_400_000);
    const { eventId } = await rig.recordLookup();
    const before = net.calls.length;
    const r = await rig.page({ type: 'golearn:sync-now' });
    expect(r).toMatchObject({ ok: false, skipped: 'needs-sign-in' });
    expect(net.calls.length).toBe(before);                                             // the expired token never leaves the device
    const st = await rig.page({ type: 'golearn:status' });
    expect(st).toMatchObject({ needsSignIn: true, connected: true });
    expect(st.sync.pending).toBe(1);
    expect((await rig.connect(a.email)).ok).toBe(true);
    await rig.fireTimers();
    expect(await countOf(s, a.learnerId, eventId)).toBe(1);
  });

  it('GoReview: a 401 on sync sets authExpired, keeps the learner\'s queue, and signing in again sends it once', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'setup');
    const dev = createPracticeDevice(net);
    expect((await dev.ctx.signIn({ email: a.email, password: PASSWORD })).ok).toBe(true);
    const id = (await dev.ctx.identity())!;
    const token = ((await dev.area.get('gopractice:session'))['gopractice:session'] as { token: string }).token;
    expect((await s.api(token).deleteSession()).ok).toBe(true);
    const evs = [lookup(id), review(id)];
    expect((await dev.ctx.record(evs)).queued).toBe(2);
    await dev.ctx.syncNow({ force: true });
    const view = await dev.ctx.syncView();
    expect(view.authExpired).toBe(true);
    expect(view.status?.pending).toBe(2);
    expect((await dev.ctx.signIn({ email: a.email, password: PASSWORD })).ok).toBe(true);
    await dev.ctx.syncNow({ force: true });
    await dev.ctx.syncNow({ force: true });
    for (const e of evs) expect(await countOf(s, a.learnerId, e.id)).toBe(1);
    expect((await dev.ctx.syncView()).authExpired).toBe(false);
  });

  it('the service answers an expired or revoked token with 401 and nothing else: no data, no hint of the account', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com', 'phone');
    await a.api.appendEvents([lookup(a)]);
    s.clock.advance(31 * 86_400_000);
    for (const [method, path] of [['GET', '/events'], ['GET', '/export'], ['POST', '/sync/pull']] as const) {
      const r = await raw(s, method, path, { token: a.token, ...(method === 'POST' ? { body: { deviceId: a.deviceId, afterSeq: 0 } } : {}) });
      expect(r.status).toBe(401);
      expect(r.text).not.toContain(a.learnerId);
      expect(r.text).not.toContain(a.email);
    }
  });
});

describe.each(STORE_KINDS)('two devices edit the same draft offline — %s store', (kind) => {
  const now = (s: Stack) => () => new Date(s.clock.ms());
  const idOf = (w: Learner) => ({ learnerId: w.learnerId, enrolmentId: w.enrolmentId, deviceId: w.deviceId, languageId: 'sq' });
  const rec = (s: Stack, who: Learner, body: string, base?: DraftRecord): DraftRecord => newVersion(
    base ?? { draftId: 'g1', languageId: 'sq', mode: 'free', title: 'Dëshmia', text: '', versions: [], assistance: [], createdAt: s.clock.now(), updatedAt: s.clock.now() },
    body, () => ({ authorship: 'independent', assistance: [] }), who.deviceId, now(s));
  const devices = (s: Stack, ...who: Learner[]) => who.map((w) => {
    const local = createLocalDraftStore(createMemoryArea(), { identity: idOf(w), now: now(s) });
    const remote = createDraftStore({ api: w.api, identity: idOf(w), now: now(s) });
    return { who: w, local, remote, syncing: createSyncingDraftStore({ local, remote, now: now(s) }) };
  });

  it('GoTell: both texts survive, in full, on the server and on both devices: the first to sync keeps the draft id, the other becomes a titled conflict copy', async () => {
    const s = make(kind);
    const a1 = await signUp(s, 'ana@example.com', 'phone');
    const a2 = await addDevice(s, a1, 'laptop');
    const [phone, laptop] = devices(s, a1, a2);
    expect((await phone.syncing.save(rec(s, a1, 'Unë lexoj librin.'), 0)).ok).toBe(true);
    s.clock.advance(1000);
    await laptop.syncing.sync();
    const base = (await phone.syncing.load('g1'))!;
    s.clock.advance(1000);
    // both go offline and edit
    const net = createNet(s);
    net.down = true;
    const offline = (w: Learner) => createSyncingDraftStore({ local: w === a1 ? phone.local : laptop.local, remote: createDraftStore({ api: net.api(w.token), identity: idOf(w), now: now(s) }), now: now(s) });
    const phoneOff = offline(a1); const laptopOff = offline(a2);
    expect((await phoneOff.save(rec(s, a1, 'PHONE-TEXT lexoj librin.', base.record), base.revision)).ok).toBe(true);
    s.clock.advance(1000);
    expect((await laptopOff.save(rec(s, a2, 'LAPTOP-TEXT lexoj librin.', base.record), base.revision)).ok).toBe(true);
    expect(await phoneOff.pendingPush()).toEqual(['g1']);
    expect(await laptopOff.pendingPush()).toEqual(['g1']);
    // network back: the phone syncs first
    expect((await phone.syncing.push()).pushed).toEqual(['g1']);
    const lap = await laptop.syncing.push();
    expect(lap.conflicts.length).toBe(1);
    const copyId = lap.conflicts[0].copyId;
    expect(copyId).toMatch(/^g1:conflict:laptop:/);
    await phone.syncing.sync(); await laptop.syncing.sync(); await phone.syncing.sync();
    for (const d of [phone, laptop]) {
      const list = await d.syncing.list();
      expect(list.map((m) => m.docId).sort()).toEqual([copyId, 'g1'].sort());
      expect((await d.syncing.load('g1'))!.record.text).toBe('PHONE-TEXT lexoj librin.');
      expect((await d.syncing.load(copyId))!.record.text).toBe('LAPTOP-TEXT lexoj librin.');
      expect(list.find((m) => m.docId === copyId)?.title).toMatch(/conflict copy from laptop/);
      expect(await d.syncing.pendingPush()).toEqual([]);
    }
    const onServer = await a1.api.listDocuments();
    expect(onServer.ok && onServer.data.documents.map((d) => d.docId).sort()).toEqual([copyId, 'g1'].sort());
    // the version history of each text is intact inside its record
    expect((await phone.syncing.load(copyId))!.record.versions.at(-1)?.text).toBe('LAPTOP-TEXT lexoj librin.');
    expect((await a1.api.exportAll()).ok).toBe(true);
  });

  it('sync package documents: the same rule: the remote keeps the id, the local text becomes <docId>:conflict:<device>:<revision>; both reach the server and both devices', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a1 = await signUp(s, 'ana@example.com', 'phone');
    const a2 = await addDevice(s, a1, 'laptop');
    const phone = createDevice(a1, net);
    const laptop = createDevice(a2, net);
    await phone.docs.save({ docId: 'n1', learnerId: a1.learnerId, languageId: 'sq', kind: 'note', title: 'Shënim', body: 'base' });
    await phone.client.syncOnce(); s.clock.advance(1000); await laptop.client.syncOnce(); s.clock.advance(1000);
    await phone.docs.save({ docId: 'n1', learnerId: a1.learnerId, languageId: 'sq', kind: 'note', title: 'Shënim', body: 'PHONE-EDIT' });
    await laptop.docs.save({ docId: 'n1', learnerId: a2.learnerId, languageId: 'sq', kind: 'note', title: 'Shënim', body: 'LAPTOP-EDIT' });
    await phone.client.syncOnce(); s.clock.advance(1000);
    const r = await laptop.client.syncOnce();
    expect(r.documents?.conflicts.length).toBe(1);
    s.clock.advance(1000);
    await phone.client.syncOnce(); s.clock.advance(1000); await laptop.client.syncOnce();
    const bodies = async (d: ReturnType<typeof createDevice>) => (await d.docs.list()).map((x) => `${x.doc.docId}=${x.doc.body}`).sort();
    expect(await bodies(laptop)).toEqual(await bodies(phone));
    expect(await bodies(phone)).toEqual(['n1:conflict:laptop:2=LAPTOP-EDIT', 'n1=PHONE-EDIT']);
    expect((await phone.client.status()).dirtyDocuments).toBe(0);
    expect((await laptop.client.status()).dirtyDocuments).toBe(0);
  });

  it('three devices, three offline edits: three texts, none lost', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a1 = await signUp(s, 'ana@example.com', 'd1');
    const a2 = await addDevice(s, a1, 'd2');
    const a3 = await addDevice(s, a1, 'd3');
    const ds = [a1, a2, a3].map((w) => createDevice(w, net));
    await ds[0].docs.save({ docId: 'n1', learnerId: a1.learnerId, languageId: 'sq', kind: 'note', body: 'base' });
    for (const d of ds) { await d.client.syncOnce(); s.clock.advance(1000); }
    for (const [i, d] of ds.entries()) await d.docs.save({ docId: 'n1', learnerId: a1.learnerId, languageId: 'sq', kind: 'note', body: `EDIT-FROM-${i}` });
    for (let round = 0; round < 3; round++) for (const d of ds) { await d.client.syncOnce(); s.clock.advance(1000); }
    const served = await a1.api.listDocuments();
    expect(served.ok).toBe(true);
    const texts: string[] = [];
    for (const m of served.ok ? served.data.documents : []) { const g = await a1.api.getDocument(m.docId); if (g.ok) texts.push(g.data.document.body); }
    expect(texts.sort()).toEqual(['EDIT-FROM-0', 'EDIT-FROM-1', 'EDIT-FROM-2']);
    expect(text(await a1.api.exportAll())).toContain('EDIT-FROM-2');
  });
});

describe.each(STORE_KINDS)('one event the service will not accept must not hold back the others — %s store', (kind) => {
  const FUTURE = '2099-01-01T00:00:00.000Z';

  it('GoLearn worker: a damaged queued event is refused by the service, set aside as a rejected row (reported), and the good ones are delivered in the same round', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await accountFor(s, 'ana@example.com');
    const rig = createWorkerRig(s, net);
    expect((await rig.connect(a.email)).ok).toBe(true);
    net.down = true;
    const good = await rig.recordLookup('shtëpinë');
    const bad = await rig.recordLookup('libër', 'Unë lexoj një libër.');
    const key = `queue:${bad.eventId}`;
    const row = (await rig.fake.local.get(key))[key] as { event: { at: string } };
    row.event.at = FUTURE;                                                          // a clock gone wrong: the service will refuse it
    await rig.fake.local.set({ [key]: row });
    const good2 = await rig.recordLookup('çajin', 'Beni pi çajin.');
    net.down = false;
    rig.advance(10 * 60_000);
    const r = await rig.page({ type: 'golearn:sync-now' });
    expect(r.ok).toBe(true);
    for (const id of [good.eventId, good2.eventId]) expect(await countOf(s, a.learnerId, id)).toBe(1);
    expect(await countOf(s, a.learnerId, bad.eventId)).toBe(0);
    const st = await rig.page({ type: 'golearn:status' });
    expect(st.sync).toMatchObject({ pending: 0, rejected: 1 });
    expect(Object.keys(await rig.fake.local.get(null))).toContain(`rejected:${bad.eventId}`);   // kept for the learner to see, not dropped
  });

  // DEFECT O-06: the service refuses a whole /sync/push batch when any event in it is invalid (422, "nothing was stored"). The sync
  // client only knows "the transport threw", so GoReview's transport (`defaultTransport`) turns the 422 into a failure of the whole
  // batch, which is retried unchanged on every round, for ever: one event with a clock gone wrong (or written by a build the service
  // does not accept) holds every later event of the learner back. (The GoLearn worker now isolates the bad event, see above.)
  it('O-06 (fixed): GoReview: an event the service refuses does not hold back the good events queued with it', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'setup');
    const dev = createPracticeDevice(net);
    expect((await dev.ctx.signIn({ email: a.email, password: PASSWORD })).ok).toBe(true);
    const id = (await dev.ctx.identity())!;
    const good1 = lookup(id); const bad = lookup(id, { at: FUTURE }); const good2 = review(id);
    net.down = true;
    expect((await dev.ctx.record([good1, bad, good2])).queued).toBe(3);
    net.down = false;
    dev.clock.ms += 10 * 60_000;
    await dev.ctx.syncNow({ force: true });
    dev.clock.ms += 10 * 60_000;
    await dev.ctx.syncNow({ force: true });
    for (const e of [good1, good2]) expect(await countOf(s, a.learnerId, e.id)).toBe(1);
  });

  it('FINDING (O-06 after the fix): with GoReview nothing is dropped: the refused event is kept as a rejected row and all three are still on the device', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'setup');
    const dev = createPracticeDevice(net);
    expect((await dev.ctx.signIn({ email: a.email, password: PASSWORD })).ok).toBe(true);
    const id = (await dev.ctx.identity())!;
    net.down = true;
    await dev.ctx.record([lookup(id), lookup(id, { at: FUTURE }), review(id)]);
    net.down = false;
    await dev.ctx.syncNow({ force: true });
    const st = (await dev.ctx.syncView()).status!;
    expect(st.pending).toBe(0);
    expect(st.rejected).toBe(1);                                                      // the refused one, kept for the learner to see
    expect((await dev.ctx.events()).length).toBeGreaterThanOrEqual(3);               // all three are still on the device (the pull now also brings the enrolment event)
  });
});
