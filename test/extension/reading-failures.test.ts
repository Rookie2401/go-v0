// @vitest-environment jsdom
/**
 * Reading Analysis, the ways its knowledge can be incomplete, stale, mixed or damaged. Each must be DETECTED: an explicit `ok: false`, or a
 * snapshot that says `unverified` and why. A wrong or partial list of verdicts, or `verified` over a record that is not whole, is a defect.
 *
 * The bed is the one of reading-repository.test.ts (reading.support.ts): the real background worker, its real on-device Repository, and the
 * account service's own handler over the real projection engine, with one hook on the network (`rig.net.intercept`). Sections (i) and (k)
 * use the two seams the code has: `createReadingService` over a stand-in for the device Repository, and `createReadingSession` over a
 * stand-in for the background.
 *
 * A test that begins with a `// FINDING:` comment states what the feature promises and what the source did NOT do when the test was written
 * (commit 5d63db33); the comment names the cause. Such a test fails until the source is put right, and none was weakened to pass. When it
 * passes, the comment has done its work and can go.
 */
import { IDBKeyRange } from 'fake-indexeddb';
import { beforeAll, describe, expect, it } from 'vitest';
import { sqAdapter } from '../../src/adapters/sq';
import type { GoEvent, UnitKnowledge } from '../../packages/repository-contract/src';
import { MODEL_VERSION, foldEvents } from '../../packages/repository-engine/src';
import { createAdapters } from '../../packages/golearn-extension/src/adapters';
import { ACCOUNTS_KEY, LEVEL_KEY, LOCAL_PREFIX, type CatchUp, type LocalRepoService } from '../../packages/golearn-extension/src/background/localRepo';
import { GRANT_PREFIX, createReadingService } from '../../packages/golearn-extension/src/background/reading';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { GRANT_MS, MAX_READINGS, MAX_WORDS_PER_MESSAGE, type KnowledgeSnapshot, type ReadingKnowledgeReply, type WireVerdict, type WireWord } from '../../packages/golearn-extension/src/reading/protocol';
import { createReadingSession, type ReadingSessionDeps } from '../../packages/golearn-extension/src/reading/session';
import { createMemoryStorageArea } from '../../packages/golearn-extension/src/store';
import type { LocalRepository } from '../../packages/repository-local/src';
import { pendingEvent } from './rig';
import {
  READING, TAB, accountEvents, accountRows, ago, classifyAll, createAccount, createReadingRig, createRealService, deviceEvents, deviceMark, deviceRows, formId, idsOf, lemmaId, lookedUp,
  marked, pause, quiet, restartWorker, reviewed, sendToAccount, signIn, snapshotOf, until, wordOf,
  type Phone, type ReadingRig, type RealService,
} from './reading.support';

const EMAIL = 'ana@example.com';
const LONG = 240_000;
const L = lemmaId;
const F = formId;
const both = (w: string): string[] => [L('sq', w), F('sq', w)];

/** An answer that is a refusal carries no verdict and no snapshot: nothing a caller could count by mistake. */
function expectRefused(r: unknown, error: string): void {
  expect(r).toMatchObject({ ok: false, error });
  const x = r as Record<string, unknown>;
  expect(x.verdicts).toBeUndefined();
  expect(x.snapshot).toBeUndefined();
  expect(x.asked).toBeUndefined();
}

const WORDS = Array.from({ length: 40 }, (_, i) => `fjala${'abcdefghijklmnopqrstuvwxyz'[i % 26]}${'ab'[Math.floor(i / 26)]}`);
/** `n` lookups over forty words, the oldest first: an account history of several pages of its event list (a page is 1,000 events). */
const lookups = (p: Phone, n: number, startDaysAgo = 60): GoEvent[] => Array.from({ length: n }, (_, i) => lookedUp(p, both(WORDS[i % WORDS.length]!), { at: ago(startDaysAgo, i * 1000) }));

/** How many of the account's own events (not the service's bookkeeping) the device does not hold. */
async function missingOnDevice(rig: ReadingRig, svc: RealService, phone: Phone): Promise<number> {
  const held = new Set((await deviceEvents(rig)).map((e) => e.id));
  return (await accountEvents(svc, phone.learnerId)).filter((e) => e.producer.app !== 'repository' && !held.has(e.id)).length;
}
const unavailable = (): Response => new Response(JSON.stringify({ error: 'unavailable', message: 'try later' }), { status: 503, headers: { 'content-type': 'application/json' } });
const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const sessionToken = async (rig: ReadingRig): Promise<string> => ((await rig.fake.local.get('golearn:session'))['golearn:session'] as { token: string }).token;

// ───────────────────────────── a. a pull interrupted mid-history ─────────────────────────────

describe('a. the pull of the account history is interrupted', () => {
  it('the snapshot says unverified/incomplete (no "last verified" before any complete pull), then resumes from its cursor and is verified', async () => {
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    const target = wordOf('sq', WORDS[7]!);
    const later = wordOf('sq', WORDS[8]!);
    // 1,100 lookups, then the learner marks one word Known: that mark is on the second page of the event list (a page is 1,000 events)
    await sendToAccount(phone, [...lookups(phone, 1_100), marked(phone, [target[1]!], 'known', { at: ago(1) })]);

    const rig = createReadingRig({ svc });
    rig.net.intercept = (call, proceed) => (call.path === '/events' && (call.afterSeq ?? 0) >= 1_000 ? Promise.resolve(unavailable()) : proceed());
    await signIn(rig, EMAIL);
    expect(await missingOnDevice(rig, svc, phone)).toBeGreaterThan(0);

    const cut = await snapshotOf(rig);
    expect(cut).toMatchObject({ authority: 'account', state: 'unverified', reason: 'incomplete' });
    expect(cut.verifiedAt).toBeUndefined();
    expect(cut.lastVerifiedAt).toBeUndefined(); // the device has never held the whole history
    // what the device would say meanwhile is its own partial record: the snapshot is what says not to trust it
    expect((await classifyAll(rig, 'sq', [target], cut.id)).verdicts).toEqual([['below', 'seen']]);
    expect((await accountRows(phone.api, [target[1]!])).get(target[1]!)!.level).toBe('known');

    // the service answers again
    rig.net.intercept = undefined;
    const mark = rig.log.length;
    const whole = await snapshotOf(rig);
    expect(whole).toMatchObject({ authority: 'account', state: 'verified' });
    expect(whole.added).toBeGreaterThan(0);
    expect(typeof whole.verifiedAt).toBe('number');
    expect(await missingOnDevice(rig, svc, phone)).toBe(0);
    // only the rest was asked for: nothing before the cursor
    const pages = rig.log.slice(mark).filter((l) => l.path === '/events');
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((l) => Number(new URLSearchParams(l.query).get('afterSeq')) >= 1_000)).toBe(true);
    expect((await classifyAll(rig, 'sq', [target], whole.id)).verdicts).toEqual([['known', 'known']]);
    expectRefused(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: cut.id, words: [target] }), 'snapshot-changed');

    // interrupted again, after a complete pull: now the snapshot can say since when the device is known to be whole
    await sendToAccount(phone, [marked(phone, [later[1]!], 'known', { at: ago(0, -60_000) })]);
    rig.net.intercept = (call, proceed) => (call.path === '/events' ? Promise.resolve(unavailable()) : proceed());
    const again = await snapshotOf(rig);
    expect(again).toMatchObject({ state: 'unverified', reason: 'incomplete', added: 0 });
    expect(again.lastVerifiedAt).toBe(whole.verifiedAt);
    expect((await classifyAll(rig, 'sq', [later], again.id)).verdicts).toEqual([['below', 'seen']]);
    rig.net.intercept = undefined;
    const last = await snapshotOf(rig);
    expect(last).toMatchObject({ state: 'verified', added: 1 });
    expect((await classifyAll(rig, 'sq', [later], last.id)).verdicts).toEqual([['known', 'known']]);
  }, LONG);
});

// ───────────────────────────── b. a page of the event list is short or missing ─────────────────────────────

describe('b. the event list comes back short, or a page of it is skipped', () => {
  it('a page shorter than asked, with the account head beyond it, must not be taken for the end of the history', async () => {
    // FINDING: repository-local/src/transfer.ts `pull`: `if (events.length < pageSize || afterSeq >= r.data.head) { complete = true; break; }`.
    // A short page ends the pull as COMPLETE even when the same answer says the account's head is beyond the last event received (the sync
    // route's own rule is `last.seq < head` = more). localRepo.catchUp then reports `level`, and the snapshot `verified`, while events are missing.
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    const target = wordOf('sq', WORDS[3]!);
    await sendToAccount(phone, lookups(phone, 50));
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    expect((await snapshotOf(rig)).state).toBe('verified');

    // another device records 300 more events; the last of them marks a word Known
    await sendToAccount(phone, [...lookups(phone, 300, 20), marked(phone, [target[1]!], 'known', { at: ago(0, -60_000) })]);
    // a transport (a proxy, a size limit, a service fault) that returns only the first 100 events of a page; the head it reports is true
    rig.net.intercept = async (call, proceed) => {
      const res = await proceed();
      if (call.path !== '/events' || res.status !== 200) return res;
      const body = await res.json() as { events: unknown[]; head: number };
      return json({ ...body, events: body.events.slice(0, 100) });
    };
    const snap = await snapshotOf(rig);
    const missing = await missingOnDevice(rig, svc, phone);
    const verdict = (await classifyAll(rig, 'sq', [target], snap.id)).verdicts[0];
    // either the device was brought level, or the snapshot says it is not
    expect({ state: snap.state, missing, verdict }).toEqual(missing > 0 ? { state: 'unverified', missing, verdict } : { state: 'verified', missing: 0, verdict: ['known', 'known'] });
  }, LONG);

  /** An account of three pages of events whose second page holds a mark of Known, and a device whose transport answers the request for that page with the third. */
  async function skippedPage(persistent: boolean) {
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    const target = wordOf('sq', WORDS[5]!);
    // seq 1 is the service's own enrolment event; the mark of Known falls on the second page (seq 1001..2000)
    await sendToAccount(phone, [...lookups(phone, 1_200), marked(phone, [target[1]!], 'known', { at: ago(5) }), ...lookups(phone, 1_000, 4)]);
    const rig = createReadingRig({ svc });
    let misrouted = 0;
    rig.net.intercept = (call, proceed) => {
      if (call.path !== '/events' || call.afterSeq !== 1_000 || call.url.searchParams.get('limit') !== '1000' || (!persistent && misrouted > 0)) return proceed();
      misrouted += 1;
      return proceed('/events?afterSeq=2000&limit=1000');
    };
    await signIn(rig, EMAIL);
    const first = await snapshotOf(rig);
    const missingFirst = await missingOnDevice(rig, svc, phone);
    rig.net.intercept = undefined; // the transport is sound again
    const second = await snapshotOf(rig);
    const missingSecond = await missingOnDevice(rig, svc, phone);
    const verdict = (await classifyAll(rig, 'sq', [target], second.id)).verdicts[0];
    expect(misrouted).toBeGreaterThan(0);
    expect((await accountRows(phone.api, [target[1]!])).get(target[1]!)!.level).toBe('known');
    return { first: first.state, missingFirst, second: second.state, missingSecond, verdict };
  }
  /** Whole and verified, or not whole and said so: the two outcomes that are not a silent hole. */
  const noSilentHole = (o: Awaited<ReturnType<typeof skippedPage>>): unknown => (o.missingSecond > 0
    ? { first: 'unverified', missingFirst: o.missingFirst, second: 'unverified', missingSecond: o.missingSecond, verdict: o.verdict }
    : { first: o.missingFirst > 0 ? 'unverified' : 'verified', missingFirst: o.missingFirst, second: 'verified', missingSecond: 0, verdict: ['known', 'known'] });

  it('a page answered ONCE for another position must not leave a hole that the snapshot calls verified', async () => {
    // FINDING: repository-local/src/transfer.ts `pull` trusted each page blindly: `afterSeq = events[events.length - 1].seq` moved the cursor to
    // whatever came back. Nothing compared the first sequence number received with the one asked for, or the number of events held with the
    // head. A page answered for another position was appended, the cursor jumped the gap, and the events in it were never asked for again:
    // 1,000 events missing for good, and every later snapshot `verified`.
    const o = await skippedPage(false);
    expect(o).toEqual(noSilentHole(o));
  }, LONG);

  it('a page answered EVERY time for another position must not leave a hole that the snapshot calls verified', async () => {
    // FINDING: as above, and it cannot be put right in `pull` alone: from the device, a page that begins after a gap is the same whether the
    // transport skipped a range or the account deleted it (a tombstone removes events and the head does not fall). Telling them apart needs
    // the service to say what lies between (a count of the learner's events up to the head, or the sequence number before the page's first).
    const o = await skippedPage(true);
    expect(o).toEqual(noSilentHole(o));
  }, LONG);

  it('an account event the device store refuses is remembered: the device is not called level by a later snapshot, until it holds the event', async () => {
    // FINDING: transfer.ts counted `refused` for ONE pull and moved the cursor past the refused event; localRepo.catchUp read `p.refused` of
    // the pull it had just run and kept nothing. The first snapshot said `refused-events`; the next pull started after the cursor, refused
    // nothing, and `noteLevel` / `catchUp` called the device level: `verified`, with an account event missing for good.
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    await sendToAccount(phone, lookups(phone, 20));
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    await sendToAccount(phone, lookups(phone, 3, 2));
    // the account holds an event this build cannot store (a kind of a newer contract version): whenever it is sent, it is that event
    let unknown: unknown;
    rig.net.intercept = async (call, proceed) => {
      const res = await proceed();
      if (call.path !== '/events' || res.status !== 200) return res;
      const body = await res.json() as { events: Array<Record<string, unknown>>; head: number };
      if (unknown === undefined && body.events.length === 3) unknown = body.events[1]!.id;
      return json({ ...body, events: body.events.map((e) => (e.id === unknown ? { ...e, kind: 'KindOfANewerContract' } : e)) });
    };
    const first = await snapshotOf(rig);
    expect(first).toMatchObject({ authority: 'account', state: 'unverified', reason: 'refused-events' });
    expect(await missingOnDevice(rig, svc, phone)).toBe(1);
    // asked again, nothing has changed: the account still holds an event the device does not
    const second = await snapshotOf(rig);
    expect({ state: second.state, reason: second.reason, missing: await missingOnDevice(rig, svc, phone) }).toEqual({ state: 'unverified', reason: 'refused-events', missing: 1 });
    // a build that can store the event: only when the device really holds it may the snapshot say verified
    rig.net.intercept = undefined;
    const third = await snapshotOf(rig);
    expect({ state: third.state, missing: await missingOnDevice(rig, svc, phone) }).toEqual({ state: 'verified', missing: 0 });
  }, LONG);

  it('many refused events (more than a cursor row lists): none is forgotten when the device can store them at last', async () => {
    // FINDING (in the first repair, commit d6b9b3c0): repository-local/src/transfer.ts keeps the refused sequence numbers with the pull cursor
    // but writes at most REFUSED_MAX (200) of them (`cursorRow`: `refusedSeqs.slice(0, REFUSED_MAX)`). With more, the rest are dropped from the
    // row while the cursor is already past them. A build that can store the kind takes the 200 it remembers, the list empties, and the
    // device is called level without the others. (A new kind of event that an app records often passes 200 quickly.)
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    await sendToAccount(phone, lookups(phone, 20));
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const mark = wordOf('sq', WORDS[9]!);
    await sendToAccount(phone, [...lookups(phone, 259, 2), marked(phone, [mark[1]!], 'known', { at: ago(0, -60_000) })]); // 260 new events, the last a mark of Known
    const known = new Set((await accountEvents(svc, phone.learnerId)).slice(0, 21).map((e) => e.id)); // what the device already holds
    // every one of the new events is of a kind this build cannot store
    rig.net.intercept = async (call, proceed) => {
      const res = await proceed();
      if (call.path !== '/events' || res.status !== 200) return res;
      const body = await res.json() as { events: Array<Record<string, unknown>>; head: number };
      return json({ ...body, events: body.events.map((e) => (known.has(e.id as string) ? e : { ...e, kind: 'KindOfANewerContract' })) });
    };
    const first = await snapshotOf(rig);
    expect(first).toMatchObject({ state: 'unverified', reason: 'refused-events' });
    expect(await missingOnDevice(rig, svc, phone)).toBe(260);
    // the build is updated: the events can be stored now
    rig.net.intercept = undefined;
    const second = await snapshotOf(rig);
    const missing = await missingOnDevice(rig, svc, phone);
    const verdict = (await classifyAll(rig, 'sq', [mark], second.id)).verdicts[0];
    expect({ state: second.state, missing, verdict }).toEqual(missing > 0 ? { state: 'unverified', missing, verdict } : { state: 'verified', missing: 0, verdict: ['known', 'known'] });
  }, LONG);
});

// ───────────────────────────── c. the account cannot be read: three reasons ─────────────────────────────

describe('c. offline, unreachable, sign-in no longer accepted', () => {
  async function levelDevice(reading?: { online?: () => boolean; verifyTimeoutMs?: number }) {
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    const word = wordOf('sq', 'rritje');
    await sendToAccount(phone, [reviewed(phone, word[1]!, { at: ago(9) }), reviewed(phone, word[1]!, { at: ago(8) })]);
    const rig = createReadingRig({ svc, ...(reading ? { reading } : {}) });
    await signIn(rig, EMAIL);
    const level = await snapshotOf(rig);
    expect(level).toMatchObject({ state: 'verified' });
    // from here the account moves on without the device
    await sendToAccount(phone, [marked(phone, [word[1]!], 'known', { at: ago(0, -60_000) })]);
    return { svc, phone, rig, word, level };
  }
  /** The stale answer is the device record, given under a snapshot that says it is not verified. */
  async function staleButSaid(rig: ReadingRig, snap: KnowledgeSnapshot, word: WireWord): Promise<void> {
    expect(snap.state).toBe('unverified');
    expect(snap.verifiedAt).toBeUndefined();
    const got = await classifyAll(rig, 'sq', [word], snap.id);
    expect(got.verdicts).toEqual([['below', 'familiar']]);
    expect(got.answered).toBe(got.asked);
  }

  it('offline: said without asking the service anything', async () => {
    const online = { value: true };
    const { rig, word } = await levelDevice({ online: () => online.value });
    online.value = false;
    const mark = rig.log.length;
    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ authority: 'account', state: 'unverified', reason: 'offline' });
    expect(rig.log.length).toBe(mark);
    await staleButSaid(rig, snap, word);
    online.value = true;
    const back = await snapshotOf(rig);
    expect(back).toMatchObject({ state: 'verified', added: 1 });
    expect((await classifyAll(rig, 'sq', [word], back.id)).verdicts).toEqual([['known', 'known']]);
  }, LONG);

  it('unreachable: the connection fails, or the service answers with an error', async () => {
    const { rig, word, level } = await levelDevice();
    rig.offline.value = true; // the browser says online; the request fails
    const dropped = await snapshotOf(rig);
    expect(dropped).toMatchObject({ authority: 'account', state: 'unverified', reason: 'unreachable', added: 0 });
    expect(dropped.lastVerifiedAt).toBe(level.verifiedAt);
    await staleButSaid(rig, dropped, word);
    rig.offline.value = false;
    rig.net.intercept = () => Promise.resolve(unavailable()); // every route answers 503
    const failing = await snapshotOf(rig);
    expect(failing).toMatchObject({ state: 'unverified', reason: 'unreachable' });
    expect(failing.lastVerifiedAt).toBe(level.verifiedAt);
    rig.net.intercept = undefined;
    expect(await snapshotOf(rig)).toMatchObject({ state: 'verified', added: 1 });
  }, LONG);

  it('sign-in no longer accepted: once the worker has met the 401, and when the stored session has expired', async () => {
    const { svc, rig, word } = await levelDevice();
    expect((await svc.api(await sessionToken(rig)).deleteSession()).ok).toBe(true); // signed out everywhere from another device
    expect(await rig.page({ type: MSG.syncNow })).toMatchObject({ ok: false, skipped: 'needs-sign-in' });
    const mark = rig.log.length;
    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ authority: 'account', state: 'unverified', reason: 'needs-sign-in' });
    expect(rig.log.length).toBe(mark); // a dead sign-in is not tried again
    await staleButSaid(rig, snap, word);

    const other = await levelDevice();
    other.rig.clock.now += 31 * 24 * 3600 * 1000; // the session lasts 30 days
    const expired = await snapshotOf(other.rig);
    expect(expired).toMatchObject({ authority: 'account', state: 'unverified', reason: 'needs-sign-in' });
    await staleButSaid(other.rig, expired, other.word);
  }, LONG);

  it('a sign-in the service has just revoked is reported as needs-sign-in by the snapshot that meets the 401', async () => {
    // FINDING (the reason is wrong, the state is right): transfer.ts `pull` returns `{ added: 0, complete: false }` for ANY failed GET /me, a 401
    // included, and localRepo.catchUp maps a pull with no `remoteLearnerId` to `unreachable`. Nothing tells the sync service of the 401
    // (`noteUnauthorized`), so every analysis says "unreachable" until a sync round happens to run; the learner is told to check the network
    // when they must sign in again.
    const { svc, rig } = await levelDevice();
    expect((await svc.api(await sessionToken(rig)).deleteSession()).ok).toBe(true);
    const snap = await snapshotOf(rig);
    expect(snap.state).toBe('unverified');
    expect(snap.reason).toBe('needs-sign-in');
  }, LONG);

  it('offline and needs-sign-in also say since when the device is known to be whole', async () => {
    // FINDING (minor): background/reading.ts `snapshot` returns early for `needs-sign-in` and `offline` with no `lastVerifiedAt`, although
    // LEVEL_KEY holds it; reading/protocol.ts documents it for every unverified snapshot ("the device's record as of `lastVerifiedAt` was used").
    const online = { value: true };
    const { rig, level } = await levelDevice({ online: () => online.value });
    online.value = false;
    const off = await snapshotOf(rig);
    expect(off).toMatchObject({ state: 'unverified', reason: 'offline' });
    online.value = true;
    rig.clock.now += 31 * 24 * 3600 * 1000;
    const expired = await snapshotOf(rig);
    expect(expired).toMatchObject({ state: 'unverified', reason: 'needs-sign-in' });
    expect({ offline: off.lastVerifiedAt, needsSignIn: expired.lastVerifiedAt }).toEqual({ offline: level.verifiedAt, needsSignIn: level.verifiedAt });
  }, LONG);
});

// ───────────────────────────── d. the account answers too slowly ─────────────────────────────

/** Holds the requests `match` names until `release()`; `releaseOne()` lets the oldest held request through. */
function holdRequests(rig: ReadingRig, match: (path: string, afterSeq: number | undefined) => boolean) {
  const held: Array<() => void> = [];
  const gate = { hit: 0, open: false, releaseOne: () => { held.shift()?.(); }, release: () => { gate.open = true; while (held.length) held.shift()!(); } };
  rig.net.intercept = async (call, proceed) => {
    if (!gate.open && match(call.path, call.afterSeq)) { gate.hit += 1; await new Promise<void>((r) => held.push(r)); }
    return proceed();
  };
  return gate;
}

describe('d. the account answers more slowly than the analysis waits', () => {
  it('unverified/timeout after verifyTimeoutMs; the device record still answers; the pull finishes behind and the next snapshot is verified', async () => {
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    const word = wordOf('sq', 'rritje');
    await sendToAccount(phone, [reviewed(phone, word[1]!, { at: ago(9) }), reviewed(phone, word[1]!, { at: ago(8) })]);
    const rig = createReadingRig({ svc, reading: { verifyTimeoutMs: 250 } });
    await signIn(rig, EMAIL);
    const level = await snapshotOf(rig);
    await sendToAccount(phone, [marked(phone, [word[1]!], 'known', { at: ago(0, -60_000) })]);

    const gate = holdRequests(rig, (path) => path === '/me' || path === '/events');
    const started = Date.now();
    const slow = await snapshotOf(rig);
    const waited = Date.now() - started;
    expect(slow).toMatchObject({ authority: 'account', state: 'unverified', reason: 'timeout', added: 0 });
    expect(slow.lastVerifiedAt).toBe(level.verifiedAt);
    expect(waited).toBeGreaterThanOrEqual(200);
    expect(waited).toBeLessThan(5_000);
    expect(gate.hit).toBeGreaterThan(0);
    // the classification that follows works, against the device record
    const stale = await classifyAll(rig, 'sq', [word], slow.id);
    expect(stale.verdicts).toEqual([['below', 'familiar']]);
    expect(stale.answered).toBe(stale.asked);

    // the service answers at last: the pull that was not abandoned brings the mark in, and the old snapshot is no longer answered
    gate.release();
    expect(await until(async () => (await deviceRows(rig, [word[1]!])).get(word[1]!)?.level === 'known')).toBe(true);
    await quiet(rig);
    expectRefused(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: slow.id, words: [word] }), 'snapshot-changed');
    const fresh = await snapshotOf(rig);
    expect(fresh).toMatchObject({ state: 'verified' });
    expect((await classifyAll(rig, 'sq', [word], fresh.id)).verdicts).toEqual([['known', 'known']]);
  }, LONG);

  it('events the slow pull brings in page by page, between two batches, make the later batch snapshot-changed', async () => {
    // FINDING: background/localRepo.ts `catchUp` (and `uploadAndPull`) raise the generation ONCE, after `repo.pullFrom` has returned
    // (`if (p.added > 0) changes += 1`), while transfer.ts appends every page to the store as it arrives (and a read folds what is new).
    // After a `timeout` snapshot the pull runs on behind the analysis: its pages change what `knowledgeRows` reads while `generation()` still
    // returns the snapshot's id, so batches of ONE snapshot are answered from different states of the learner's knowledge. The same holds for
    // a catch-up started by the worker's sync round during an analysis.
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    const word = wordOf('sq', WORDS[2]!);
    const other = wordOf('sq', WORDS[3]!);
    await sendToAccount(phone, lookups(phone, 10));
    const rig = createReadingRig({ svc, reading: { verifyTimeoutMs: 250 } });
    await signIn(rig, EMAIL);
    await snapshotOf(rig);
    // another device: a mark of Known, then more than a page of other events (so the pull has a second page to wait for)
    await sendToAccount(phone, [marked(phone, [word[1]!], 'known', { at: ago(2) }), ...lookups(phone, 1_100, 1)]);

    const gate = holdRequests(rig, (path) => path === '/events');
    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ state: 'unverified', reason: 'timeout' });
    // batch 1 of the analysis: the state the snapshot was taken in
    const one = await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words: [word] });
    expect(one).toMatchObject({ ok: true, verdicts: [['below', 'seen']] });
    // the first page arrives (with the mark); the pull now waits for the second
    gate.releaseOne();
    expect(await until(async () => (await deviceRows(rig, [word[1]!])).get(word[1]!)?.level === 'known')).toBe(true);
    expect(gate.hit).toBe(2);
    // batch 2 of the SAME analysis
    const two = await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words: [word, other] });
    gate.release();
    await quiet(rig);
    expect(two, 'a batch answered from a later state of the Repository under the snapshot of an earlier one').toMatchObject({ ok: false, error: 'snapshot-changed' });
  }, LONG);
});

// ───────────────────────────── e. the worker is stopped between the snapshot and a batch ─────────────────────────────

describe('e. the browser stops the worker midway', () => {
  it('a batch that names the stopped worker\'s snapshot is refused, never answered from another state; the new worker starts again and agrees', async () => {
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    const word = wordOf('sq', 'rritje');
    await sendToAccount(phone, [marked(phone, [word[1]!], 'known', { at: ago(3) })]);
    const first = createReadingRig({ svc });
    await signIn(first, EMAIL);
    expect(await first.reading({ op: 'grant', tabId: TAB }, 'page')).toEqual({ ok: true, op: 'grant' });
    const snap = await snapshotOf(first, 'content');
    expect((await classifyAll(first, 'sq', [word], snap.id, { as: 'content' })).verdicts).toEqual([['known', 'known']]);

    // meanwhile the phone changes the word, and the worker is stopped before the next batch
    await sendToAccount(phone, [marked(phone, [word[1]!], 'familiar', { at: ago(0, -60_000) })]);
    const second = await restartWorker(first);
    expectRefused(await second.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words: [word] }, 'content'), 'snapshot-changed');
    // the popup's grant was kept in session storage, which outlives the worker: the tab may still ask
    const again = await snapshotOf(second, 'content');
    expect(again.id).not.toBe(snap.id);
    expect(again).toMatchObject({ authority: 'account', state: 'verified', added: 1 });
    expect((await classifyAll(second, 'sq', [word], again.id, { as: 'content' })).verdicts).toEqual([['below', 'familiar']]);
    // and the stopped worker's id is not accepted later either
    expectRefused(await second.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words: [word] }, 'content'), 'snapshot-changed');
  }, LONG);

  it('a worker stopped in the middle of the first pull: the new one says unverified until it has the rest', async () => {
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    const target = wordOf('sq', WORDS[7]!);
    await sendToAccount(phone, [...lookups(phone, 1_100), marked(phone, [target[1]!], 'known', { at: ago(1) })]);
    const first = createReadingRig({ svc, reading: { verifyTimeoutMs: 250 } });
    const gate = holdRequests(first, (path, afterSeq) => path === '/events' && (afterSeq ?? 0) >= 1_000);
    void first.connect(EMAIL); // never returns: the second page is never answered
    expect(await until(() => gate.hit > 0)).toBe(true);
    await pause(60);
    // the stopped worker's held request is abandoned; the new worker meets a service that still does not answer the event list
    const second = await restartWorker(first, { reading: { verifyTimeoutMs: 250 } });
    const stuck = holdRequests(second, (path) => path === '/events');
    const cut = await snapshotOf(second);
    expect(cut).toMatchObject({ authority: 'account', state: 'unverified', reason: 'timeout' });
    expect(cut.lastVerifiedAt).toBeUndefined();
    expect((await classifyAll(second, 'sq', [target], cut.id)).verdicts).toEqual([['below', 'seen']]);
    stuck.release();
    expect(await until(async () => (await missingOnDevice(second, svc, phone)) === 0)).toBe(true);
    await quiet(second);
    const whole = await snapshotOf(second);
    expect(whole).toMatchObject({ state: 'verified' });
    expect((await classifyAll(second, 'sq', [target], whole.id)).verdicts).toEqual([['known', 'known']]);
  }, LONG);
});

// ───────────────────────────── f. the Repository takes in an event between two batches ─────────────────────────────

describe('f. an event recorded between two batches of one analysis', () => {
  it('a lookup, a mark, an event of another device, a rebuild and a clear each make the next batch snapshot-changed', async () => {
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const words = [wordOf('sq', 'libër'), wordOf('sq', 'qytet')];
    const changes: Array<[string, () => Promise<unknown>]> = [
      ['a lookup on this device', () => rig.content({ type: MSG.record, event: pendingEvent('libër') })],
      ['a mark on this device', () => rig.content({ type: MSG.record, event: deviceMark('bukur', 'known', new Date()) })],
      ['an event of another device, pulled by the worker', async () => {
        await sendToAccount(phone, [marked(phone, [L('sq', 'qytet')], 'known', { at: ago(0, -60_000) })]);
        await rig.page({ type: MSG.syncNow });
        expect(await until(async () => (await deviceRows(rig, [L('sq', 'qytet')])).get(L('sq', 'qytet'))?.level === 'known')).toBe(true);
        await quiet(rig);
      }],
      ['a rebuild of the device projection', () => rig.local({ op: 'rebuild' })],
      ['an event appended by an extension page', async () => {
        const id = await rig.local({ op: 'identity' });
        const enrolments = await rig.local({ op: 'enrolments' });
        const enrolmentId = (enrolments.enrolments as Array<{ enrolmentId: string; languageId: string }>).find((e) => e.languageId === 'sq')!.enrolmentId;
        const event = { ...marked(phone, [L('sq', 'det')], 'known', { at: ago(0, -30_000) }), learnerId: id.learnerId, enrolmentId, producer: { app: 'golearn-ext', version: '1', deviceId: id.deviceId } };
        expect(await rig.local({ op: 'api', method: 'appendEvents', args: [[event]] })).toMatchObject({ ok: true, result: { ok: true } });
      }],
      ['clearing the device data', () => rig.page({ type: MSG.clearLocal })],
    ];
    for (const [what, change] of changes) {
      const snap = await snapshotOf(rig);
      const one = await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words });
      expect(one, what).toMatchObject({ ok: true, op: 'classify', snapshot: snap.id });
      await change();
      expectRefused(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words }), 'snapshot-changed');
      expect((await snapshotOf(rig)).id, what).not.toBe(snap.id);
    }
  }, LONG);

  it('an event already in the store, whose recording has not returned yet, is not answered under the old snapshot', async () => {
    // FINDING: background/localRepo.ts `record`: `const r = await repo.api.appendEvents([...]); ... changes += 1;`. The generation is raised only
    // after appendEvents has RETURNED (the store commit, then the projection, then the reply), but the event is readable from the commit on
    // (every knowledge read folds what is newer than the projection cursor). A batch that falls in between is answered from the new state
    // under the old snapshot id. Here the gap is HELD open (the one place in these two files where a call of the device Repository is delayed);
    // in the worker it is the projection of the new event and the reply. Unheld, 40 attempts in this bed did not hit it: it is narrow.
    const rig = createReadingRig();
    const repo = (await rig.bg.local.open())!;
    const word: WireWord = [F('sq', 'shtëpinë'), L('sq', 'shtëpi')];
    const snap = await snapshotOf(rig);
    expect(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words: [word] })).toMatchObject({ ok: true, verdicts: [['below', 'new']] });

    const append = repo.api.appendEvents.bind(repo.api);
    let stored!: () => void;
    const inStore = new Promise<void>((r) => { stored = r; });
    let finish!: () => void;
    const mayReturn = new Promise<void>((r) => { finish = r; });
    repo.api.appendEvents = (async (events: GoEvent[]) => { const r = await append(events); stored(); await mayReturn; return r; }) as typeof repo.api.appendEvents;
    const recording = rig.content({ type: MSG.record, event: deviceMark('shtëpinë', 'known', new Date()) });
    await inStore;
    const during = await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words: [word] });
    finish();
    repo.api.appendEvents = append as typeof repo.api.appendEvents;
    await recording;
    // once the recording has returned the old snapshot is refused, as it should be
    expectRefused(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words: [word] }), 'snapshot-changed');
    // while it had not: the same snapshot id must not carry the answer of the new state
    expect(during, 'answered Known under the snapshot in which the word was New').toMatchObject({ ok: false, error: 'snapshot-changed' });
  }, LONG);
});

// ───────────────────────────── g. two accounts on one device ─────────────────────────────

describe('g. signing in to another account on the same device', () => {
  async function twoAccounts() {
    const svc = createRealService();
    const ana = await createAccount(svc, EMAIL, ['sq'], 'phone-a');
    const ben = await createAccount(svc, 'ben@example.com', ['sq'], 'phone-b');
    await sendToAccount(ana, [marked(ana, [L('sq', 'mal')], 'known', { at: ago(5) })]);
    await sendToAccount(ben, [marked(ben, [L('sq', 'det')], 'known', { at: ago(5) })]);
    return { svc, ana, ben };
  }
  const words = [wordOf('sq', 'mal'), wordOf('sq', 'det')];

  it('the device record now holds both histories: the snapshot says mixed-accounts and never verified, also after a restart', async () => {
    const { svc, ben } = await twoAccounts();
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const asAna = await snapshotOf(rig);
    expect(asAna).toMatchObject({ authority: 'account', state: 'verified' });
    expect((await classifyAll(rig, 'sq', words, asAna.id)).verdicts).toEqual([['known', 'known'], ['below', 'new']]);

    expect(await rig.page({ type: MSG.disconnect })).toMatchObject({ ok: true });
    await signIn(rig, 'ben@example.com');
    const asBen = await snapshotOf(rig);
    expect(asBen).toMatchObject({ authority: 'account', state: 'unverified', reason: 'mixed-accounts' });
    expect(asBen.verifiedAt).toBeUndefined();
    // the figure such an analysis would give is the two accounts together, which is why it may not be called Ben's
    const mixed = await classifyAll(rig, 'sq', words, asBen.id);
    expect(mixed.verdicts).toEqual([['known', 'known'], ['known', 'known']]);
    const benRows = await accountRows(ben.api, idsOf(words));
    expect(benRows.has(L('sq', 'mal'))).toBe(false);
    // it stays said: a later snapshot, and a new worker over the same storage
    expect(await snapshotOf(rig)).toMatchObject({ state: 'unverified', reason: 'mixed-accounts' });
    const restarted = await restartWorker(rig);
    expect(await snapshotOf(restarted)).toMatchObject({ state: 'unverified', reason: 'mixed-accounts' });
    // and when the account cannot be reached as well, the mixture is still the reason given
    restarted.offline.value = true;
    expect(await snapshotOf(restarted)).toMatchObject({ state: 'unverified', reason: 'mixed-accounts' });
  }, LONG);

  it('signing in again to the SAME account stays verified; a device cleared between two accounts is not mixed', async () => {
    const { svc } = await twoAccounts();
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    expect(await snapshotOf(rig)).toMatchObject({ state: 'verified' });
    for (let i = 0; i < 2; i++) {
      expect(await rig.page({ type: MSG.disconnect })).toMatchObject({ ok: true });
      await signIn(rig, EMAIL);
      const snap = await snapshotOf(rig);
      expect(snap).toMatchObject({ authority: 'account', state: 'verified', added: 0 });
      expect((await classifyAll(rig, 'sq', words, snap.id)).verdicts).toEqual([['known', 'known'], ['below', 'new']]);
    }
    // sign out, delete the device data, sign in as someone else: one history again
    expect(await rig.page({ type: MSG.disconnect })).toMatchObject({ ok: true });
    expect(await rig.page({ type: MSG.clearLocal })).toMatchObject({ ok: true });
    await signIn(rig, 'ben@example.com');
    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ authority: 'account', state: 'verified' });
    expect((await classifyAll(rig, 'sq', words, snap.id)).verdicts).toEqual([['below', 'new'], ['known', 'known']]);
  }, LONG);

  it('a device that took in two accounts before the list of accounts was kept is still said to be mixed', async () => {
    // FINDING: background/localRepo.ts `noteAccount` knows a device's accounts from ACCOUNTS_KEY (kept from this build on) plus ONE more: the
    // account of the pull cursor. A device that an earlier build signed in to account A and then to account B holds both histories, and
    // after the update it knows of B only: `mixedAccounts` is false and the snapshot is `verified`. The device does hold the evidence: every
    // pulled event has a marker `{ from: <account> }` and every uploaded one `{ to: <account> }` (repository-local/src/transfer.ts), which
    // nothing reads for this.
    const { svc } = await twoAccounts();
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    expect(await rig.page({ type: MSG.disconnect })).toMatchObject({ ok: true });
    await signIn(rig, 'ben@example.com');
    expect(await snapshotOf(rig)).toMatchObject({ state: 'unverified', reason: 'mixed-accounts' });
    // the same device as an earlier build left it: it kept neither the list of accounts nor the time of the last complete pull
    await rig.fake.local.remove([ACCOUNTS_KEY, LEVEL_KEY]);
    const updated = await restartWorker(rig);
    const snap = await snapshotOf(updated);
    const mixed = await classifyAll(updated, 'sq', words, snap.id);
    expect(mixed.verdicts).toEqual([['known', 'known'], ['known', 'known']]); // the two accounts together, as before
    expect({ state: snap.state, reason: snap.reason }).toEqual({ state: 'unverified', reason: 'mixed-accounts' });
  }, LONG);

  it('the same device, when the learner looks a word up BEFORE analysing a page: still mixed', async () => {
    // FINDING (in the second repair, uncommitted when this was written): `noteAccount` reads the accounts from the markers only in the call
    // that first loads the kept list (`seeded` is set inside `if (!accountsKnown)`). A lookup recorded while signed in calls it first, with no
    // Repository to read (`record`: `noteAccount(event.learnerId)`); that call fills `accountsKnown` in memory, and every later call in the
    // same worker finds it filled and takes the list as seeded. The markers are never read, the list is never written, and the device that
    // holds two accounts is `verified`. The order is the ordinary one: reading comes before an analysis.
    const { svc } = await twoAccounts();
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    expect(await rig.page({ type: MSG.disconnect })).toMatchObject({ ok: true });
    await signIn(rig, 'ben@example.com');
    await rig.fake.local.remove([ACCOUNTS_KEY, LEVEL_KEY]); // as an earlier build left it
    const updated = await restartWorker(rig);
    // the worker's first work after the update: the learner clicks a word
    expect(await updated.content({ type: MSG.record, event: pendingEvent('libër') })).toMatchObject({ ok: true, attributed: 'account' });
    const snap = await snapshotOf(updated);
    expect({ state: snap.state, reason: snap.reason }).toEqual({ state: 'unverified', reason: 'mixed-accounts' });
    // and it is still said by the worker after that one
    const later = await restartWorker(updated);
    expect(await later.content({ type: MSG.record, event: pendingEvent('bukur') })).toMatchObject({ ok: true, attributed: 'account' });
    const again = await snapshotOf(later);
    expect({ state: again.state, reason: again.reason }).toEqual({ state: 'unverified', reason: 'mixed-accounts' });
  }, LONG);

  it('signed in, with an account that cannot be addressed at all: the snapshot is not "this device is the whole record, verified"', async () => {
    // FINDING (unlikely state, silent answer): background/localRepo.ts `catchUp` returns `{ state: 'no-account' }` whenever
    // `session.authenticated()` gives nothing or throws, and background/reading.ts `fromCatchUp` turns that into
    // `authority: 'device', state: 'verified'`, although `snapshot` has just established that the learner IS signed in (`s.connected`).
    // Here the stored service address is gone; a storage read that fails at that moment takes the same road.
    const { svc, ana } = await twoAccounts();
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    expect(await snapshotOf(rig)).toMatchObject({ authority: 'account', state: 'verified' });
    await sendToAccount(ana, [marked(ana, [L('sq', 'det')], 'known', { at: ago(0, -60_000) })]); // the account moves on
    await rig.fake.local.remove('golearn:service');
    expect((await rig.page({ type: MSG.status })).connected).toBe(true);
    const snap = await snapshotOf(rig);
    expect({ authority: snap.authority, state: snap.state }).toEqual({ authority: 'account', state: 'unverified' });
  }, LONG);
});

// ───────────────────────────── h. requests ─────────────────────────────

describe('h. what a request may be, and who may send it', () => {
  it('more than 400 words, another language, malformed ids, a lemma in the form position, seven readings: refused whole', async () => {
    const rig = createReadingRig();
    await rig.content({ type: MSG.record, event: deviceMark('shtëpinë', 'known', new Date()) });
    const snap = await snapshotOf(rig);
    const good: WireWord = [F('sq', 'shtëpinë'), L('sq', 'shtëpi')];
    const ask = (over: Record<string, unknown>) => rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words: [good], ...over });
    expect(await ask({})).toMatchObject({ ok: true, verdicts: [['known', 'known']] });

    const many = Array.from({ length: MAX_WORDS_PER_MESSAGE + 1 }, (_, i) => wordOf('sq', `fjalë${i}`));
    expectRefused(await ask({ words: many }), 'too-many');
    expectRefused(await ask({ words: [good, ...many] }), 'too-many');
    expect(await ask({ words: many.slice(0, MAX_WORDS_PER_MESSAGE) })).toMatchObject({ ok: true, asked: 800, answered: 800 });

    const readings = (n: number): WireWord => [F('sq', 'shumë'), ...Array.from({ length: n }, (_, i) => L('sq', `shumë${i}`))];
    expect(await ask({ words: [readings(MAX_READINGS)] })).toMatchObject({ ok: true, asked: 1 + MAX_READINGS });
    const invalid: Array<[string, Record<string, unknown>]> = [
      ['a word of another language among the words', { words: [good, wordOf('es', 'casa')] }],
      ['a lemma of another language as a reading', { words: [[F('sq', 'shtëpinë'), L('es', 'casa')]] }],
      ['a form of another language', { words: [[F('es', 'shtëpinë'), L('sq', 'shtëpi')]] }],
      ['the right words, the wrong language named', { languageId: 'es' }],
      ['a lemma in the form position', { words: [[L('sq', 'shtëpi'), L('sq', 'shtëpi')]] }],
      ['a form in a reading position', { words: [[F('sq', 'shtëpinë'), F('sq', 'shtëpi')]] }],
      ['seven readings', { words: [readings(MAX_READINGS + 1)] }],
      ['an empty word', { words: [[]] }],
      ['a word that is a string', { words: [F('sq', 'shtëpinë')] }],
      ['an id that is not a unit id', { words: [['shtëpinë']] }],
      ['an id with a comma', { words: [[F('sq', 'a,b')]] }],
      ['an id with a query', { words: [[`${F('sq', 'a')}?x=1`]] }],
      ['an id of 300 characters', { words: [[F('sq', 'a'.repeat(300))]] }],
      ['a number among the ids', { words: [[F('sq', 'shtëpinë'), 7]] }],
      ['a null word', { words: [null] }],
      ['words that are not a list', { words: { 0: good } }],
      ['no words', { words: undefined }],
      ['no language', { languageId: undefined }],
      ['a language that is not one', { languageId: 'Albanian!' }],
      ['no snapshot', { snapshot: undefined }],
      ['an empty snapshot', { snapshot: '' }],
      ['a snapshot that is not a string', { snapshot: 42 }],
    ];
    for (const [what, over] of invalid) {
      const r = await ask(over);
      expect(r, what).toMatchObject({ ok: false, error: 'invalid' });
      expect((r as { verdicts?: unknown }).verdicts, what).toBeUndefined();
    }
    expectRefused(await rig.reading({ op: 'explode' }), 'invalid');
    expectRefused(await rig.reading({}), 'invalid');
    expectRefused(await ask({ snapshot: 'not-a-snapshot:0' }), 'snapshot-changed');
    // nothing above changed the Repository: the first snapshot still stands
    expect(await ask({})).toMatchObject({ ok: true, verdicts: [['known', 'known']] });
  }, LONG);

  it('a content script needs a grant for its own tab, made by an extension page, and the grant ends', async () => {
    const rig = createReadingRig();
    const words = [wordOf('sq', 'libër')];
    // no grant: nothing is answered, not even a snapshot
    expectRefused(await rig.reading({ op: 'snapshot', languageId: 'sq' }, 'content'), 'not-granted');
    expectRefused(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: 'x', words }, 'content'), 'not-granted');
    // a content script cannot grant itself, for its tab or another
    expectRefused(await rig.reading({ op: 'grant', tabId: TAB }, 'content'), 'not-granted');
    expectRefused(await rig.reading({ op: 'grant', tabId: 8 }, 'content'), 'not-granted');
    expectRefused(await rig.reading({ op: 'snapshot', languageId: 'sq' }, 'content'), 'not-granted');
    expect(Object.keys(await rig.fake.sessionArea.get(null)).filter((k) => k.startsWith(GRANT_PREFIX))).toEqual([]);
    // a grant must name a tab
    for (const tabId of [undefined, '7', -1, 1.5, null]) expectRefused(await rig.reading({ op: 'grant', tabId }, 'page'), 'invalid');

    expect(await rig.reading({ op: 'grant', tabId: TAB }, 'page')).toEqual({ ok: true, op: 'grant' });
    // kept where a content script cannot read it, never in local storage
    expect(Object.keys(await rig.fake.sessionArea.get(null)).filter((k) => k.startsWith(GRANT_PREFIX))).toEqual([`${GRANT_PREFIX}${TAB}`]);
    expect(Object.keys(await rig.fake.local.get(null)).filter((k) => k.startsWith(GRANT_PREFIX))).toEqual([]);
    const snap = await snapshotOf(rig, 'content');
    expect(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words }, 'content')).toMatchObject({ ok: true, verdicts: [['below', 'new']] });
    // the grant is for that tab only
    expectRefused(await rig.reading({ op: 'snapshot', languageId: 'sq' }, 'content', 8), 'not-granted');
    expectRefused(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words }, 'content', 8), 'not-granted');
    // and for GRANT_MS only
    rig.clock.now += GRANT_MS - 1_000;
    expect(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words }, 'content')).toMatchObject({ ok: true });
    rig.clock.now += 1_001;
    expectRefused(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words }, 'content'), 'not-granted');
    expectRefused(await rig.reading({ op: 'snapshot', languageId: 'sq' }, 'content'), 'not-granted');
    // an extension page needs none
    expect(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words }, 'page')).toMatchObject({ ok: true });
  }, LONG);

  it('another extension, a web page and a sender with no identity are refused before anything is read', async () => {
    const rig = createReadingRig();
    expect(await rig.reading({ op: 'grant', tabId: TAB }, 'page')).toEqual({ ok: true, op: 'grant' });
    for (const op of ['grant', 'snapshot', 'classify']) {
      const message = { type: READING, op, tabId: TAB, languageId: 'sq', snapshot: 'x', words: [wordOf('sq', 'libër')] };
      expect(await rig.foreign(message)).toEqual({ ok: false, error: 'forbidden' });
      expect(await rig.fake.dispatch(message, { id: 'another-extension', tab: { id: TAB }, url: 'https://example.test/article' })).toEqual({ ok: false, error: 'forbidden' });
      expect(await rig.fake.dispatch(message, { url: 'https://evil.example/' })).toEqual({ ok: false, error: 'forbidden' });
      expect(await rig.fake.dispatch(message, {})).toEqual({ ok: false, error: 'forbidden' });
      // this extension id, but neither one of its pages nor a tab
      expect(await rig.fake.dispatch(message, { id: 'test-ext-id', url: 'https://example.test/article' })).toEqual({ ok: false, error: 'forbidden' });
    }
    // a page of ANOTHER extension that names this extension in its path is not this extension
    expect(await rig.fake.dispatch({ type: READING, op: 'snapshot', languageId: 'sq' }, { id: 'test-ext-id', url: 'chrome-extension://another-extension/test-ext-id/popup.html' })).toEqual({ ok: false, error: 'forbidden' });
  }, LONG);
});

// ───────────────────────────── i. rows that should not be there ─────────────────────────────

/** Real rows of the device learner `me`, folded by the real engine from a small history. */
function realRows(me: string): Map<string, UnitKnowledge> {
  let n = 0;
  const event = (kind: GoEvent['kind'], itemIds: string[], payload: Record<string, unknown>, at: string, app: GoEvent['producer']['app'] = 'golearn-ext', cardId?: string): GoEvent => ({
    id: `i:${++n}`, v: 2, learnerId: me, enrolmentId: 'e', languageId: itemIds[0]!.split(':')[1]!, at, producer: { app, version: '1', deviceId: 'd' }, kind,
    subject: { itemIds, ...(cardId ? { cardId } : {}) }, payload,
  } as GoEvent);
  const answer = (unit: string, at: string): GoEvent => event('CardReviewed', [unit], { cardKind: 'recognition', grade: 'good', correct: true, hinted: false, rating: 3 }, at, 'gopractice-review', `card:written-recognition:${unit}`);
  const rows = foldEvents([
    event('ItemMarked', [L('sq', 'mal')], { mark: 'known' }, ago(5)),
    event('SelectionLookedUp', [L('sq', 'det'), F('sq', 'det')], { surface: 'det', tokenCount: 1, contextKind: 'none', contextConfidence: 0, readerId: 'demo', helpShown: ['surface'] }, ago(5)),
    ...[9, 8, 7, 6, 5, 4].map((d) => answer(L('sq', 'lumë'), ago(d))), // six correct answers, none typed: Familiar, not Known
    event('ItemMarked', [L('es', 'casa')], { mark: 'known' }, ago(5)),
  ], { modelVersion: MODEL_VERSION });
  return new Map(rows.map((r) => [r.unitId, r]));
}

describe('i. the device Repository answers with rows that should not be there', () => {
  const ME = 'device-learner';
  const SNAPSHOT = 'boot:1';
  const rows = realRows(ME);
  const words: WireWord[] = [wordOf('sq', 'mal'), wordOf('sq', 'det'), wordOf('sq', 'lumë')];
  type Rows = Awaited<ReturnType<LocalRepoService['knowledgeRows']>>;

  function service(knowledgeRows: (ids: readonly string[]) => Promise<Rows>, o: { generation?: () => string; open?: () => Promise<LocalRepository | undefined>; catchUp?: () => Promise<CatchUp>; connected?: boolean; standIn?: () => Promise<boolean> } = {}) {
    return createReadingService({
      local: { open: o.open ?? (async () => ({}) as LocalRepository), catchUp: o.catchUp ?? (async () => ({ state: 'no-account' })), knowledgeRows, generation: o.generation ?? (() => SNAPSHOT), ...(o.standIn ? { standIn: o.standIn } : {}) },
      session: { status: async () => ({ connected: o.connected ?? false, expired: false, hasEnrolment: false }) },
      sync: { status: async () => ({ pending: 0, localOnly: 0, rejected: 0, online: true, needsSignIn: false }), needsSignIn: async () => false },
      area: createMemoryStorageArea(), now: () => 1_000,
    });
  }
  // (`asked`: the ids that went to the Repository in a request it answered; the device service counts them where it makes the requests)
  const honest = async (ids: readonly string[]): Promise<Rows> => ({ ok: true, rows: ids.flatMap((id) => (rows.has(id) ? [rows.get(id)!] : [])), learnerId: ME, generation: SNAPSHOT, asked: ids.length });
  const ask = (s: ReturnType<typeof service>, over: Record<string, unknown> = {}) => s.handle({ op: 'classify', languageId: 'sq', snapshot: SNAPSHOT, words, ...over }, 'page', undefined);
  const withRows = (change: (good: UnitKnowledge[]) => unknown[]) => service(async (ids) => { const r = await honest(ids); if (!r.ok) return r; return { ...r, rows: change(r.rows) as UnitKnowledge[] }; });

  it('the stand-in, when honest, is answered exactly as the real rows say', async () => {
    const r = await ask(service(honest));
    expect(r).toEqual({ ok: true, op: 'classify', snapshot: SNAPSHOT, verdicts: [['known', 'known'], ['below', 'seen'], ['below', 'familiar']], asked: 6, answered: 6 });
    expect(rows.get(L('sq', 'lumë'))!.level).toBe('familiar');
  });

  it('a row that was not asked for, the same unit twice, another learner, another language, no unit id, no row: the batch is refused', async () => {
    const cases: Array<[string, (good: UnitKnowledge[]) => unknown[]]> = [
      ['a row for an id that was not asked', (g) => [...g, rows.get(L('es', 'casa'))!]],
      ['a row for an id of this language that was not asked', (g) => [...g, { ...g[0]!, unitId: L('sq', 'tjetër') }]],
      ['the same unit twice', (g) => [...g, g[0]!]],
      ['the same unit twice, with two different levels', (g) => [...g, { ...g[0]!, level: 'new' }]],
      ['a row of another learner', (g) => g.map((r, i) => (i === 0 ? { ...r, learnerId: 'someone-else' } : r))],
      ['a row with no learner', (g) => g.map((r, i) => (i === 0 ? { ...r, learnerId: undefined } : r))],
      ['a row of another language under an id that was asked', (g) => g.map((r, i) => (i === 0 ? { ...r, languageId: 'es' } : r))],
      ['a row with no unit id', (g) => [...g, { ...g[0]!, unitId: undefined }]],
      ['a row that is null', (g) => [...g, null]],
      ['a row that is a string', (g) => [...g, 'lemma:sq:mal:NOUN']],
    ];
    for (const [what, change] of cases) {
      const r = await ask(withRows(change));
      expect(r, what).toMatchObject({ ok: false, error: 'lookup-failed' });
      expect((r as { verdicts?: unknown }).verdicts, what).toBeUndefined();
    }
  });

  it('a lookup that failed, threw, would not open, or belongs to another state of the Repository: never a list of verdicts', async () => {
    expectRefused(await ask(service(async () => ({ ok: false, error: 'failed' }))), 'lookup-failed');
    expectRefused(await ask(service(async () => ({ ok: false, error: 'unavailable' }))), 'repository-unavailable');
    expectRefused(await ask(service(async () => { throw new Error('the database is closed'); })), 'lookup-failed');
    expectRefused(await ask(service(async () => undefined as unknown as Rows)), 'lookup-failed');
    expectRefused(await ask(service(async (ids) => ({ ...(await honest(ids)), rows: undefined } as unknown as Rows))), 'lookup-failed');
    expectRefused(await ask(service(async (ids) => ({ ...(await honest(ids)), rows: 'none' } as unknown as Rows))), 'lookup-failed');
    // the rows were read from a state other than the snapshot's
    expectRefused(await ask(service(async (ids) => ({ ...(await honest(ids)), generation: 'boot:2' } as Rows))), 'snapshot-changed');
    // the Repository changed while the rows were being read
    let generation = SNAPSHOT;
    expectRefused(await ask(service(async (ids) => { const r = await honest(ids); generation = 'boot:2'; return r; }, { generation: () => generation })), 'snapshot-changed');
    // the Repository is already in another state when the batch arrives: it is not even read
    let read = 0;
    expectRefused(await ask(service(async (ids) => { read += 1; return honest(ids); }, { generation: () => 'boot:9' })), 'snapshot-changed');
    expect(read).toBe(0);
    // the snapshot of a Repository that would not open
    expectRefused(await service(honest, { open: async () => undefined }).handle({ op: 'snapshot', languageId: 'sq' }, 'page', undefined), 'repository-unavailable');
    expectRefused(await service(honest, { open: async () => { throw new Error('no storage'); } }).handle({ op: 'snapshot', languageId: 'sq' }, 'page', undefined), 'lookup-failed');
  });

  it('what a catch-up came to is what the snapshot says, one reason each', async () => {
    const snap = async (c: CatchUp): Promise<KnowledgeSnapshot> => {
      const r = await service(honest, { connected: true, catchUp: async () => c }).handle({ op: 'snapshot', languageId: 'sq' }, 'page', undefined);
      if (!r.ok || r.op !== 'snapshot') throw new Error(JSON.stringify(r));
      return r.snapshot;
    };
    expect(await snap({ state: 'level', at: 77, added: 3, mixedAccounts: false })).toEqual({ id: SNAPSHOT, authority: 'account', state: 'verified', verifiedAt: 77, added: 3, unsent: 0 });
    expect(await snap({ state: 'level', at: 77, added: 0, mixedAccounts: true })).toMatchObject({ state: 'unverified', reason: 'mixed-accounts' });
    for (const reason of ['unreachable', 'timeout', 'incomplete', 'refused-events', 'needs-sign-in'] as const) {
      expect(await snap({ state: 'behind', reason, added: 2, lastLevelAt: 50, mixedAccounts: false })).toEqual({ id: SNAPSHOT, authority: 'account', state: 'unverified', reason, lastVerifiedAt: 50, added: 2, unsent: 0 });
      expect((await snap({ state: 'behind', reason, added: 0, mixedAccounts: false })).lastVerifiedAt).toBeUndefined();
      expect(await snap({ state: 'behind', reason, added: 0, mixedAccounts: true })).toMatchObject({ state: 'unverified', reason: 'mixed-accounts' });
    }
    expect(await snap({ state: 'behind', reason: 'unavailable', added: 0, mixedAccounts: false })).toMatchObject({ state: 'unverified', reason: 'unreachable' });
  });

  it('a row whose level is not one of the six levels is refused, not read by another rule', async () => {
    // FINDING: background/reading.ts `accept` checks a row's unit, learner and language and nothing of its STATE. reading/classify.ts hands the
    // row to `compactKnowledge` (background/profile.ts), which drops a `level` that is not a knowledge level, and active/levels.ts
    // `engineLevelOfRow` then works one out from the dimensions with the page's older thresholds (Known = reading recognition >= 0.8 over 4
    // observations). The engine's rule also asks for four independent typed successes, so a row the Repository holds at Familiar, with its
    // level field damaged or missing, is credited as Known.
    const familiar = rows.get(L('sq', 'lumë'))!;
    const one: WireWord[] = [wordOf('sq', 'lumë')];
    expect(await ask(service(honest), { words: one })).toMatchObject({ ok: true, verdicts: [['below', 'familiar']] });
    const outcomes: Record<string, unknown> = {};
    for (const [what, level] of [['a misspelt level', 'Familiar'], ['an unknown level', 'mastered'], ['no level', undefined], ['a number', 3], ['null', null]] as const) {
      const r = await ask(withRows((g) => g.map((row) => (row.unitId === familiar.unitId ? { ...row, level } : row))), { words: one });
      outcomes[what] = r.ok ? (r.op === 'classify' ? r.verdicts[0] : r.op) : r.error;
    }
    expect(outcomes).toEqual({ 'a misspelt level': 'lookup-failed', 'an unknown level': 'lookup-failed', 'no level': 'lookup-failed', 'a number': 'lookup-failed', null: 'lookup-failed' });
  });

  it('`answered` is counted from what the Repository answered, so a lookup that covered fewer ids than were asked is seen', async () => {
    // FINDING: background/reading.ts `classify` returns `asked: ids.length, answered: ids.length`: one number, twice. localRepo.knowledgeRows
    // returns rows only (no count of the ids each request covered), so nothing measures `answered`. The page checks `asked !== answered`
    // (reading/session.ts) and the popup shows the two numbers as proof; with the real background the check can never fire.
    const asked: string[][] = [];
    const firstChunkOnly = service(async (ids) => { asked.push([...ids]); const r = await honest(ids.slice(0, 2)); return r; }); // a lookup that stopped after two ids (the old limits of 60 and 200 did exactly this)
    const r = await ask(firstChunkOnly);
    expect(asked[0]).toHaveLength(6);
    // six ids were asked and two were looked up: the reply may not claim six were answered
    expect(r.ok && r.op === 'classify' ? { asked: r.asked, answered: r.answered } : r).not.toEqual({ asked: 6, answered: 6 });
    // and four words that were never looked up are not given a verdict
    expect((r as { verdicts?: unknown }).verdicts).toBeUndefined();
    // a lookup that claims more than it was asked is no better
    expectRefused(await ask(service(async (ids) => { const h = await honest(ids); return h.ok ? { ...h, asked: h.asked + 1 } : h; })), 'lookup-failed');
    expectRefused(await ask(service(async (ids) => { const h = await honest(ids); return h.ok ? ({ ...h, asked: undefined } as unknown as Rows) : h; })), 'lookup-failed');
  });

  it('a device whose own history is not what is open (a stand-in): never a verified snapshot, with or without an account', async () => {
    const signedOut = service(honest, { standIn: async () => true });
    expectRefused(await signedOut.handle({ op: 'snapshot', languageId: 'sq' }, 'page', undefined), 'repository-unavailable');
    // signed in: whatever the account answers (level with it, or not reached), the stand-in lacks what this device recorded and did not send
    for (const c of [{ state: 'level', at: 5, added: 9, mixedAccounts: false }, { state: 'behind', reason: 'unreachable', added: 0, mixedAccounts: false }] as CatchUp[]) {
      const r = await service(honest, { standIn: async () => true, connected: true, catchUp: async () => c }).handle({ op: 'snapshot', languageId: 'sq' }, 'page', undefined);
      expect(r.ok && r.op === 'snapshot' ? r.snapshot.state : 'refused', c.state).not.toBe('verified');
    }
  });
});

// ───────────────────────────── j. the device Repository cannot be opened ─────────────────────────────

const brokenIdb = (): { indexedDB: IDBFactory; keyRange: typeof IDBKeyRange } => ({
  indexedDB: { open: () => { throw new Error('Internal error opening backing store for indexedDB.open.'); }, deleteDatabase: () => { throw new Error('unavailable'); } } as unknown as IDBFactory,
  keyRange: IDBKeyRange,
});

describe('j. the device Repository would not open', () => {
  const unreadable = (fake: ReadingRig['fake']): void => {
    const get = fake.local.get.bind(fake.local);
    fake.local.get = (async (keys: string | string[] | null) => {
      const list = keys == null ? [] : Array.isArray(keys) ? keys : [keys];
      if (list.some((k) => k.startsWith(LOCAL_PREFIX))) throw new Error('The browser would not let GoLearn read its storage.');
      return get(keys);
    }) as typeof fake.local.get;
  };

  for (const mode of ['IndexedDB', 'storage rows'] as const) {
    it(`repository-unavailable for the snapshot and for every batch, to a page and to a content script (${mode})`, async () => {
      const rig = createReadingRig({ ...(mode === 'IndexedDB' ? { idb: brokenIdb() } : { idb: false }), prepare: unreadable });
      expect(await rig.bg.local.open()).toBeUndefined();
      const words = [wordOf('sq', 'libër')];
      expectRefused(await rig.reading({ op: 'snapshot', languageId: 'sq' }, 'page'), 'repository-unavailable');
      expectRefused(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: 'any', words }, 'page'), 'snapshot-changed'); // no snapshot was ever given, so no id can match
      expect(await rig.reading({ op: 'grant', tabId: TAB }, 'page')).toEqual({ ok: true, op: 'grant' });
      expectRefused(await rig.reading({ op: 'snapshot', languageId: 'sq' }, 'content'), 'repository-unavailable');
      // a caller that guesses the id the worker would give still gets no verdicts
      const r = await rig.reading({ op: 'classify', languageId: 'sq', snapshot: rig.bg.local.generation(), words }, 'content');
      expectRefused(r, 'repository-unavailable');
    }, LONG);
  }

  it('a device that never had a history and whose IndexedDB will not open falls back to its storage rows, and says so truthfully (empty)', async () => {
    const rig = createReadingRig({ idb: brokenIdb() });
    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ authority: 'device', state: 'verified' });
    expect((await rig.local({ op: 'status' })).storage.mode).toBe('rows');
    expect(await rig.content({ type: MSG.record, event: deviceMark('shtëpinë', 'known', new Date()) })).toMatchObject({ ok: true });
    const next = await snapshotOf(rig);
    expect((await classifyAll(rig, 'sq', [[F('sq', 'shtëpinë'), L('sq', 'shtëpi')]], next.id)).verdicts).toEqual([['known', 'known']]);
  }, LONG);

  it('a device whose history is in an IndexedDB that will not open says repository-unavailable, never "every word is new"', async () => {
    // FINDING: repository-local/src/local.ts `openMigrating`, state `switched`: when IndexedDB will not open it returns
    // `rows(cowArea(old), { switched: true, frozen: true })`: an EMPTY Repository over the frozen old rows (`storage.mode: 'rows-frozen'`), with
    // a new learner. background/localRepo.ts `open` hands it on like any other, and background/reading.ts `snapshot` calls it
    // `authority: 'device', state: 'verified'`. Every word the learner knows is answered `below/new`: the failed lookup the feature must
    // never turn into a figure. (Signed in, the catch-up refills that memory copy from the account; signed out, nothing does.)
    const word: WireWord = [F('sq', 'shtëpinë'), L('sq', 'shtëpi')];
    const first = createReadingRig();
    expect(await first.content({ type: MSG.record, event: deviceMark('shtëpinë', 'known', new Date()) })).toMatchObject({ ok: true, attributed: 'local' });
    const before = await snapshotOf(first);
    expect((await classifyAll(first, 'sq', [word], before.id)).verdicts).toEqual([['known', 'known']]);
    expect((await first.local({ op: 'status' })).storage.mode).toBe('indexeddb');

    // the worker starts again and the browser will not open the database
    const second = await restartWorker(first, { idb: brokenIdb() });
    const snap = await second.reading({ op: 'snapshot', languageId: 'sq' });
    const mode = (await second.local({ op: 'status' })).storage?.mode;
    const answer = snap.ok && snap.op === 'snapshot' ? await second.reading({ op: 'classify', languageId: 'sq', snapshot: snap.snapshot.id, words: [word] }) : snap;
    expect({ mode, snapshot: snap.ok && snap.op === 'snapshot' ? `${snap.snapshot.authority}/${snap.snapshot.state}` : snap.error, classify: answer.ok && answer.op === 'classify' ? answer.verdicts : answer.error })
      .toEqual({ mode, snapshot: 'repository-unavailable', classify: 'repository-unavailable' });
  }, LONG);

  it('signed in, and the history will not open: an unsent mark the snapshot counts as "here" is in the answer, or the snapshot does not say verified', async () => {
    // FINDING (what is left of the one above when there IS an account): the stand-in is refilled from the account, so it holds what the
    // account holds and nothing else. Events of this device that the account does not have yet (not pushed, or waiting for an enrolment in
    // their language, which can be for ever) are in the history that would not open. background/reading.ts `snapshot` still reports them
    // (`unsent`, read from the sync queue; reading/protocol.ts: "they ARE counted here") under `verified`, and `classify` does not count them.
    const svc = createRealService();
    await createAccount(svc, EMAIL);
    const word: WireWord = [F('sq', 'shtëpinë'), L('sq', 'shtëpi')];
    const first = createReadingRig({ svc });
    await signIn(first, EMAIL);
    expect(await first.content({ type: MSG.record, event: deviceMark('shtëpinë', 'known', new Date()) })).toMatchObject({ ok: true, attributed: 'account' });
    const before = await snapshotOf(first);
    expect(before).toMatchObject({ state: 'verified', unsent: 1 });
    expect((await classifyAll(first, 'sq', [word], before.id)).verdicts).toEqual([['known', 'known']]);

    // the worker starts again before the mark was pushed, and the browser will not open the database
    const second = await restartWorker(first, { idb: brokenIdb() });
    const snap = await second.reading({ op: 'snapshot', languageId: 'sq' });
    if (!snap.ok || snap.op !== 'snapshot') { expectRefused(snap, 'repository-unavailable'); return; }
    const answer = await second.reading({ op: 'classify', languageId: 'sq', snapshot: snap.snapshot.id, words: [word] });
    const verdict = answer.ok && answer.op === 'classify' ? answer.verdicts[0] : answer.error;
    const told = { state: snap.snapshot.state, unsent: snap.snapshot.unsent, verdict };
    expect(told).toEqual(snap.snapshot.state === 'verified' ? { state: 'verified', unsent: snap.snapshot.unsent, verdict: ['known', 'known'] } : told);
  }, LONG);
});

// ───────────────────────────── k. the page side ─────────────────────────────

type Knowledge = ReadingSessionDeps['knowledge'];
type Ask = Parameters<Knowledge>[0];
const TERMINAL = ['done', 'failed', 'canceled'];

describe('k. the run in the page (createReadingSession)', () => {
  beforeAll(() => {
    // the page is an ordinary https article
    (globalThis as unknown as { jsdom?: { reconfigure(o: { url: string }): void } }).jsdom?.reconfigure({ url: 'https://example.test/artikull' });
  });

  /** A page with `n` distinct words (each used `i % 3 + 1` times) in its main content. */
  function article(n = 12): { words: number; occurrences: number } {
    const letters = 'abcdefghijklmnopqrstuvz';
    const word = (i: number): string => `fj${letters[i % 23]}${letters[Math.floor(i / 23) % 23]}${letters[Math.floor(i / 529) % 23]}la`;
    const parts: string[] = [];
    let occurrences = 0;
    for (let i = 0; i < n; i++) for (let k = 0; k < (i % 3) + 1; k++) { parts.push(word(i)); occurrences += 1; }
    document.documentElement.setAttribute('lang', 'sq');
    document.title = 'Artikull';
    document.body.innerHTML = `<main><article><p>${parts.join(' ')}.</p></article></main>`;
    return { words: n, occurrences };
  }

  const snapshot = (id: string): ReadingKnowledgeReply => ({ ok: true, op: 'snapshot', snapshot: { id, authority: 'device', state: 'verified', verifiedAt: 1, unsent: 0 } });
  const verdictsFor = (req: Extract<Ask, { op: 'classify' }>, verdict: WireVerdict = ['below', 'new']): Extract<ReadingKnowledgeReply, { op: 'classify' }> =>
    ({ ok: true, op: 'classify', snapshot: req.snapshot, verdicts: req.words.map(() => verdict), asked: idsOf(req.words).length, answered: idsOf(req.words).length });

  interface Script { snapshot?(n: number): ReadingKnowledgeReply | undefined | Promise<ReadingKnowledgeReply | undefined>; classify?(req: Extract<Ask, { op: 'classify' }>, n: number, snapshots: number): ReadingKnowledgeReply | undefined | Promise<ReadingKnowledgeReply | undefined> }
  function run(script: Script, o: { maxRestarts?: number } = {}) {
    const calls: Ask[] = [];
    let snapshots = 0;
    let classifies = 0;
    const knowledge: Knowledge = async (req) => {
      calls.push(req);
      if (req.op === 'snapshot') { snapshots += 1; return script.snapshot ? script.snapshot(snapshots) : snapshot(`g:${snapshots}`); }
      classifies += 1;
      return script.classify ? script.classify(req, classifies, snapshots) : verdictsFor(req);
    };
    const session = createReadingSession({
      doc: document, adapters: createAdapters(document), languages: ['sq'], adapterOf: (l) => (l === 'sq' ? sqAdapter : undefined), knowledge,
      ...(o.maxRestarts !== undefined ? { maxRestarts: o.maxRestarts } : {}),
    });
    const started = session.handle({ type: MSG.readingAnalysis, op: 'start', languageId: 'sq' });
    const finished = async () => { expect(await until(() => TERMINAL.includes(session.status().stage), 30_000, 5)).toBe(true); return session.status(); };
    return { session, started, finished, calls, count: () => ({ snapshots, classifies }) };
  }
  /** A run that failed shows a reason and nothing that could be read as a figure. */
  function expectNoFigure(status: ReturnType<ReturnType<typeof createReadingSession>['status']>, stage: 'failed' | 'canceled', code?: string): void {
    expect(status.stage).toBe(stage);
    expect(status.result).toBeUndefined();
    expect(status.progress).toBeUndefined();
    if (code) expect(status.error?.code).toBe(code); else expect(status.error).toBeUndefined();
    expect(JSON.stringify(status)).not.toMatch(/knownPercent|coverage/);
  }

  it('a run that is answered: every occurrence counted once, under one snapshot, in batches of at most 400 words', async () => {
    const page = article(450);
    const r = run({ classify: (req) => verdictsFor(req, ['known', 'known']) });
    expect(['extracting', 'resolving']).toContain(r.started.stage); // started, and nothing to show yet
    expect(r.started.result).toBeUndefined();
    const done = await r.finished();
    expect(done.stage).toBe('done');
    expect(done.error).toBeUndefined();
    expect(done.result!.coverage.counts.total).toBe(page.occurrences);
    expect(done.result!.coverage.distinctWords).toBe(page.words);
    expect(done.result!.coverage.knownOccurrences).toBe(page.occurrences);
    expect(done.result!.snapshot.id).toBe('g:1');
    const batches = r.calls.filter((c): c is Extract<Ask, { op: 'classify' }> => c.op === 'classify');
    expect(batches.map((b) => b.words.length)).toEqual([400, 50]);
    expect(batches.every((b) => b.words.length <= MAX_WORDS_PER_MESSAGE && b.snapshot === 'g:1' && b.languageId === 'sq')).toBe(true);
    expect(done.result!.lookups.asked).toBe(done.result!.lookups.answered);
    expect(done.result!.lookups.asked).toBe(batches.reduce((n, b) => n + idsOf(b.words).length, 0));
    // what crossed to the background: unit ids only, never the text
    expect(JSON.stringify(r.calls)).not.toContain(document.body.textContent!.slice(0, 40));
  }, LONG);

  it('a batch that is never answered: failed with lookup-incomplete after three tries, and no figure', async () => {
    article(450);
    const r = run({ classify: (req, n) => (n === 1 ? verdictsFor(req, ['known', 'known']) : undefined) }); // the first batch is answered, the second never
    expectNoFigure(await r.finished(), 'failed', 'lookup-incomplete');
    expect(r.count()).toEqual({ snapshots: 1, classifies: 4 }); // one answered, three tries of the next
  }, LONG);

  it('a batch answered on its third try is counted; a snapshot that is never answered is repository-unavailable', async () => {
    const page = article(20);
    const late = run({ classify: (req, n) => (n < 3 ? undefined : verdictsFor(req)) });
    const done = await late.finished();
    expect(done.stage).toBe('done');
    expect(done.result!.coverage.counts.total).toBe(page.occurrences);
    expect(done.result!.coverage.counts.new).toBe(page.occurrences);

    expectNoFigure(await run({ snapshot: () => undefined }).finished(), 'failed', 'repository-unavailable');
    expectNoFigure(await run({ snapshot: () => ({ ok: false, error: 'repository-unavailable' }) }).finished(), 'failed', 'repository-unavailable');
    expectNoFigure(await run({ snapshot: () => ({ ok: false, error: 'not-granted' }) }).finished(), 'failed', 'not-granted');
    expectNoFigure(await run({ snapshot: () => ({ ok: false, error: 'lookup-failed' }) }).finished(), 'failed', 'lookup-incomplete');
    expectNoFigure(await run({ snapshot: () => ({ ok: true, op: 'grant' }) }).finished(), 'failed', 'lookup-incomplete');
  }, LONG);

  it('fewer or more verdicts than words, asked not equal to answered, another snapshot in the reply, a refusal: failed, no figure', async () => {
    article(30);
    const damaged: Array<[string, (req: Extract<Ask, { op: 'classify' }>) => ReadingKnowledgeReply, string]> = [
      ['one verdict fewer', (req) => ({ ...verdictsFor(req), verdicts: req.words.slice(1).map(() => ['known', 'known'] as WireVerdict) }), 'lookup-incomplete'],
      ['one verdict more', (req) => ({ ...verdictsFor(req), verdicts: [...req.words, req.words[0]!].map(() => ['known', 'known'] as WireVerdict) }), 'lookup-incomplete'],
      ['no verdicts', (req) => ({ ...verdictsFor(req), verdicts: [] }), 'lookup-incomplete'],
      ['verdicts that are not a list', (req) => ({ ...verdictsFor(req), verdicts: 'known' as unknown as WireVerdict[] }), 'lookup-incomplete'],
      ['asked more than answered', (req) => { const v = verdictsFor(req) as Extract<ReadingKnowledgeReply, { op: 'classify' }>; return { ...v, answered: v.asked - 1 }; }, 'lookup-incomplete'],
      ['answered more than asked', (req) => { const v = verdictsFor(req) as Extract<ReadingKnowledgeReply, { op: 'classify' }>; return { ...v, answered: v.asked + 1 }; }, 'lookup-incomplete'],
      ['the reply names another snapshot', (req) => ({ ...verdictsFor(req), snapshot: 'g:other' }), 'lookup-incomplete'],
      ['a reply of another operation', () => snapshot('g:1'), 'lookup-incomplete'],
      ['lookup-failed', () => ({ ok: false, error: 'lookup-failed' }), 'lookup-incomplete'],
      ['too-many', () => ({ ok: false, error: 'too-many' }), 'lookup-incomplete'],
      ['invalid', () => ({ ok: false, error: 'invalid' }), 'lookup-incomplete'],
      ['repository-unavailable', () => ({ ok: false, error: 'repository-unavailable' }), 'repository-unavailable'],
      ['not-granted', () => ({ ok: false, error: 'not-granted' }), 'not-granted'],
      ['a verdict that is no verdict', (req) => ({ ...verdictsFor(req), verdicts: req.words.map(() => ['mastered', 'known'] as unknown as WireVerdict) }), 'error'],
      ['a word called known at a level below Known', (req) => ({ ...verdictsFor(req), verdicts: req.words.map(() => ['known', 'seen'] as WireVerdict) }), 'error'],
      ['a word called below Known at the level Known', (req) => ({ ...verdictsFor(req), verdicts: req.words.map(() => ['below', 'known'] as WireVerdict) }), 'error'],
    ];
    for (const [what, reply, code] of damaged) {
      const status = await run({ classify: (req) => reply(req) }).finished();
      expect(status.stage, what).toBe('failed');
      expect(status.error?.code, what).toBe(code);
      expect(status.result, what).toBeUndefined();
    }
  }, LONG);

  it('snapshot-changed: the run starts again from a new snapshot and every verdict it counts is from that one', async () => {
    const page = article(450);
    // the Repository changes after the first batch of the first attempt: what that batch answered (Known) must not be in the figure
    const r = run({ classify: (req, _n, snapshots) => (snapshots === 1 ? (req.words.length === 400 ? verdictsFor(req, ['known', 'known']) : { ok: false, error: 'snapshot-changed' }) : verdictsFor(req, ['below', 'seen'])) });
    const done = await r.finished();
    expect(done.stage).toBe('done');
    expect(r.count().snapshots).toBe(2);
    expect(done.result!.snapshot.id).toBe('g:2');
    expect(done.result!.coverage.counts.known).toBe(0);
    expect(done.result!.coverage.counts.seen).toBe(page.occurrences);
    expect(done.result!.coverage.knownPercent).toBe(0);
    const second = r.calls.filter((c): c is Extract<Ask, { op: 'classify' }> => c.op === 'classify' && c.snapshot === 'g:2');
    expect(second.map((b) => b.words.length)).toEqual([400, 50]); // all the batches again, not only the one that was refused
    expect(done.result!.lookups.asked).toBe(second.reduce((n, b) => n + idsOf(b.words).length, 0));
  }, LONG);

  it('a Repository that keeps changing: knowledge-changing after the restarts allowed, and no figure', async () => {
    article(20);
    const r = run({ classify: () => ({ ok: false, error: 'snapshot-changed' }) });
    expectNoFigure(await r.finished(), 'failed', 'knowledge-changing');
    expect(r.count()).toEqual({ snapshots: 4, classifies: 4 }); // the first attempt and three restarts
    const one = run({ classify: () => ({ ok: false, error: 'snapshot-changed' }) }, { maxRestarts: 0 });
    expectNoFigure(await one.finished(), 'failed', 'knowledge-changing');
    expect(one.count().snapshots).toBe(1);
  }, LONG);

  it('cancel in the middle of a run: canceled, no figure, and a late answer changes nothing', async () => {
    article(450);
    let answer!: (r: ReadingKnowledgeReply) => void;
    let asked!: () => void;
    const waiting = new Promise<void>((r) => { asked = r; });
    const r = run({ classify: (req, n) => (n === 2 ? new Promise<ReadingKnowledgeReply>((resolve) => { answer = resolve; asked(); }) : verdictsFor(req, n === 1 ? ['known', 'known'] : ['below', 'seen'])) });
    await waiting; // the second batch is with the background
    expect(r.session.status().stage).toBe('verifying');
    expect(r.session.status().progress).toEqual({ done: 400, total: 450 });
    const canceled = r.session.handle({ type: MSG.readingAnalysis, op: 'cancel' });
    expectNoFigure(canceled, 'canceled');
    const second = r.calls.filter((c): c is Extract<Ask, { op: 'classify' }> => c.op === 'classify')[1]!;
    answer(verdictsFor(second, ['known', 'known']));
    await pause(50);
    expectNoFigure(r.session.status(), 'canceled');
    expect(r.count().classifies).toBe(2); // nothing more was asked after the cancel
    // a new run after a cancel is a run of its own
    const again = r.session.handle({ type: MSG.readingAnalysis, op: 'start', languageId: 'sq' });
    expect(again.runId).not.toBe(r.started.runId);
    expect(await until(() => TERMINAL.includes(r.session.status().stage), 30_000, 5)).toBe(true);
    const fresh = r.session.status();
    expect(fresh.stage).toBe('done');
    expect(fresh.runId).toBe(again.runId);
    // nothing of the canceled run is in it: its first batch had said Known
    expect(fresh.result!.coverage.counts.known).toBe(0);
    expect(fresh.result!.coverage.counts.seen).toBe(fresh.result!.coverage.counts.total);
  }, LONG);

  it('wired to the real background: no grant is not-granted; with the grant of the popup the figure is the Repository\'s', async () => {
    const svc = createRealService();
    const phone = await createAccount(svc, EMAIL);
    document.documentElement.setAttribute('lang', 'sq');
    document.body.innerHTML = '<main><p>Unë po lexoj një libër të bukur në shtëpinë time. Libër, libër.</p></main>';
    await sendToAccount(phone, [marked(phone, [L('sq', 'libër')], 'known', { at: ago(3) })]);
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const session = createReadingSession({
      doc: document, adapters: createAdapters(document), languages: ['sq'], adapterOf: (l) => (l === 'sq' ? sqAdapter : undefined),
      knowledge: (req) => rig.content({ type: READING, ...req }) as Promise<ReadingKnowledgeReply | undefined>,
    });
    const finished = async () => { expect(await until(() => TERMINAL.includes(session.status().stage), 30_000, 5)).toBe(true); return session.status(); };
    session.handle({ type: MSG.readingAnalysis, op: 'start', languageId: 'sq' });
    expectNoFigure(await finished(), 'failed', 'not-granted');

    expect(await rig.reading({ op: 'grant', tabId: TAB }, 'page')).toEqual({ ok: true, op: 'grant' });
    session.handle({ type: MSG.readingAnalysis, op: 'start', languageId: 'sq' });
    const done = await finished();
    expect(done.stage).toBe('done');
    const result = done.result!;
    expect(result.snapshot).toMatchObject({ authority: 'account', state: 'verified' });
    expect(result.lookups.asked).toBe(result.lookups.answered);
    expect(result.coverage.counts.total).toBe(12);
    // "libër" is on the page three times and the account says Known: whatever the analyser calls its lemma, the Repository's row decides
    const libër = (await accountRows(phone.api, [L('sq', 'libër')])).get(L('sq', 'libër'))!;
    expect(libër.level).toBe('known');
    const sum = Object.entries(result.coverage.counts).filter(([k]) => k !== 'total').reduce((n, [, v]) => n + v, 0);
    expect(sum).toBe(result.coverage.counts.total);
    expect(result.coverage.knownOccurrences === 3 || result.coverage.knownOccurrences === 0).toBe(true);
    if (result.coverage.knownOccurrences === 0) expect(result.coverage.counts.unidentified + result.coverage.counts.new).toBe(12); // the analyser names the lemma otherwise: then nothing is credited by guess
  }, LONG);
});
