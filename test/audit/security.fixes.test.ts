// @vitest-environment node
/**
 * Regression tests for the fixes of S-01, S-03..S-08, S-11 and S-12 beyond the audit's original `DEFECT` cases (which are now
 * ordinary tests in security.events / security.auth / security.authz): the edges of each rule, the legitimate inputs that must
 * keep working, and the other routes the same rule has to cover.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { validateEvent, type GoEvent } from '../../packages/repository-contract/src';
import { MAX_BODY_BYTES } from '../../packages/repository-service/src/handler';
import { createStack, lookup, raw, review, signUp, type Learner, type Stack } from './security.support';

const stacks: Stack[] = [];
const make = (): Stack => { const s = createStack('memory'); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

const PAYLOAD = { surface: 'x', tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'r', helpShown: [] as string[] };
const post = (s: Stack, who: Learner, events: unknown[], path = '/events') => raw(s, 'POST', path, { token: who.token, body: { events } });
const countOf = async (s: Stack, who: Learner): Promise<number> => ((await raw(s, 'GET', '/events?kinds=SelectionLookedUp&limit=1000', { token: who.token })).body.events as unknown[]).length;

const PASSAGE = 'Unë po lexoj një libër të bukur në shtëpinë time dhe pastaj shkoj në punë.';
const WHO = { learnerId: 'l', enrolmentId: 'e', deviceId: 'd' };
const withPayload = (extra: Record<string, unknown>): GoEvent => ({ ...lookup(WHO), payload: { ...PAYLOAD, ...extra } });
const paths = (e: GoEvent): string[] => validateEvent(e).map((i) => i.path);

describe('S-01: the text guard looks everywhere in an event', () => {
  it('a text-like key is refused at any depth (objects, arrays of objects, any case or separator)', () => {
    expect(paths(withPayload({ notes: { text: PASSAGE } }))).toContain('payload.notes.text');
    expect(paths(withPayload({ meta: { deeper: { sentence: 'x' } } }))).toContain('payload.meta.deeper.sentence');
    expect(paths(withPayload({ list: [{ ok: 1 }, { Passage: 'x' }] }))).toContain('payload.list[1].Passage');
    expect(paths(withPayload({ Sentence_Text: 'x' }))).toContain('payload.Sentence_Text');
    expect(paths(withPayload({ 'sentence-text': 'x' }))).toContain('payload.sentence-text');
    expect(paths(withPayload({ body: 'x' }))).toContain('payload.body');
  });

  it('a passage under any other key is refused: a string of more than four words, or over 300 characters, anywhere in the payload or the subject', () => {
    expect(paths(withPayload({ reflection: PASSAGE }))).toContain('payload.reflection');
    expect(paths(withPayload({ nested: { reflection: [PASSAGE] } }))).toContain('payload.nested.reflection[0]');
    expect(paths(withPayload({ blob: 'x'.repeat(301) }))).toContain('payload.blob');
    expect(paths(withPayload({ ok: 'four words are fine' }))).toEqual([]);
    const subject = { ...lookup(WHO), subject: { itemIds: ['form:sq:x'], meta: { sentence: PASSAGE }, notes: PASSAGE } };
    expect(paths(subject)).toEqual(expect.arrayContaining(['subject.meta.sentence', 'subject.notes']));
  });

  it('a hostile structure costs a bounded walk and is refused: 100,000 levels deep, or a 100,000-entry array', () => {
    let deep: unknown = 'x';
    for (let i = 0; i < 100_000; i++) deep = { a: deep };
    const started = Date.now();
    expect(validateEvent(withPayload({ deep })).some((i) => /nested more than/.test(i.message))).toBe(true);
    expect(validateEvent(withPayload({ wide: Array.from({ length: 100_000 }, () => 1) }))).toEqual([]); // numbers are not text; only the first 500 entries are looked at
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('legitimate payloads stay valid: a goal label, a correction reason, a typed answer, a voice name, nested numbers and short strings', () => {
    const ok = (kind: GoEvent['kind'], payload: Record<string, unknown>): void => {
      expect(validateEvent({ ...lookup(WHO), kind, producer: { app: 'golearn-app', version: '1', deviceId: 'd' }, payload }), kind).toEqual([]);
    };
    ok('EnrolmentChanged', { change: 'started', packId: 'p', packVersion: '1', goals: [{ kind: 'custom', label: 'read the Gospel of John in Albanian with my sister', priority: 2 }] });
    ok('AnalysisCorrected', { formId: 'form:sq:x', by: 'learner', reason: 'this is the plural of the noun, not the verb form that the card showed me' });
    ok('AssessmentAnswered', { constructionId: 'construction:sq:x', task: 'explain', correct: true, hinted: false, answer: 'because the noun is definite and in the accusative case' });
    ok('PronunciationPlayed', { voice: 'synthetic', voiceId: 'Microsoft Zira Desktop - English (United States)', repeated: false });
    ok('SelectionLookedUp', { ...PAYLOAD, surface: 'një libër të mirë', extra: { counts: [1, 2, 3], flags: { a: true }, name: 'two words' } });
  });

  it('a free-text field is bounded too: a reason of 1,001 characters is refused', () => {
    const e = { ...lookup(WHO), kind: 'AnalysisCorrected' as const, producer: { app: 'golearn-app' as const, version: '1', deviceId: 'd' }, payload: { formId: 'form:sq:x', by: 'learner', reason: 'r'.repeat(1001) } };
    expect(paths(e)).toEqual(['payload.reason']);
  });

  it('the same rule on the other routes: a text key hidden in a sync push or a review is refused like one sent to /events, and the passage is stored nowhere', async () => {
    const s = make();
    const a = await signUp(s, 'ana@example.com');
    const hidden = { deep: { sentence: PASSAGE } };
    const viaPush = await raw(s, 'POST', '/sync/push', { token: a.token, body: { deviceId: a.deviceId, clientTime: s.clock.now(), events: [lookup(a, { payload: { ...PAYLOAD, ...hidden } })] } });
    const viaReview = await post(s, a, [review(a, { payload: { cardKind: 'recall', grade: 'good', correct: true, hinted: false, note: hidden } })], '/reviews');
    expect([viaPush.status, viaReview.status]).toEqual([422, 422]);
    expect((await raw(s, 'GET', '/export', { token: a.token })).text).not.toContain(PASSAGE);
  });
});

describe('what the service holds an event to', () => {
  it('S-03: 5 minutes ahead of the server clock is the edge; a sync push is held to the skew it declares (up to a day); old events are never refused for age', async () => {
    const s = make();
    const a = await signUp(s, 'ana@example.com');
    const at = (ms: number): string => new Date(Date.parse(s.clock.now()) + ms).toISOString();
    expect((await post(s, a, [lookup(a, { at: at(5 * 60_000) })])).status).toBe(200);
    const over = await post(s, a, [lookup(a, { at: at(5 * 60_000 + 1000) })]);
    expect(over.status).toBe(422);
    expect(over.body.issues[0].issues[0].message).toMatch(/^at-in-future: later than /);
    expect((await post(s, a, [lookup(a, { at: '2001-01-01T00:00:00.000Z' })])).status).toBe(200);
    const push = (clientTime: string, evAt: string) => raw(s, 'POST', '/sync/push', { token: a.token, body: { deviceId: a.deviceId, clientTime, events: [lookup(a, { at: evAt })] } });
    expect((await push(at(3_600_000), at(3_600_000))).status).toBe(200); // a device an hour ahead keeps its own timeline
    expect((await push(at(3_600_000), at(2 * 3_600_000))).status).toBe(422); // but not an event ahead of the clock it declared
    expect((await push(at(1000 * 24 * 3_600_000), at(1000 * 24 * 3_600_000))).status).toBe(422); // declaring a clock years ahead does not move the limit past a day
    expect((await push(at(-3_600_000), at(5 * 60_000))).status).toBe(200); // a device behind the server is still held to the server's 5 minutes, not to its own
    expect((await push(at(-3_600_000), at(6 * 60_000))).status).toBe(422);
  });

  it('S-04: the service still writes its own "repository" events (enrolment), and a client may not send them from any route', async () => {
    const s = make();
    const a = await signUp(s, 'ana@example.com');
    const events = (await raw(s, 'GET', '/events', { token: a.token })).body.events as Array<{ kind: string; producer: { app: string } }>;
    expect(events.find((e) => e.kind === 'EnrolmentChanged')?.producer.app).toBe('repository');
    const forged = lookup(a, { producer: { app: 'repository', version: '1', deviceId: a.deviceId } });
    const push = await raw(s, 'POST', '/sync/push', { token: a.token, body: { deviceId: a.deviceId, clientTime: s.clock.now(), events: [forged] } });
    expect(push.status).toBe(422);
    expect(push.body.issues[0].issues[0].path).toBe('producer.app');
  });

  it('S-05: an event may name the session\'s device or another device REGISTERED to the same learner (a sign-in from it), never an unregistered or another learner\'s device', async () => {
    const s = make();
    const a = await signUp(s, 'ana@example.com', 'phone');
    const b = await signUp(s, 'ben@example.com', 'ben-phone');
    const named = (who: Learner, deviceId: string) => post(s, who, [lookup(who, { producer: { app: 'golearn-ext', version: '1', deviceId } })]);
    expect((await named(a, 'phone')).status).toBe(200);
    expect((await named(a, 'ben-phone')).status).toBe(422); // another learner's device
    expect((await named(a, 'laptop')).status).toBe(422); // not registered yet
    expect((await raw(s, 'POST', '/sessions', { body: { email: 'ana@example.com', password: 'correct horse battery staple', deviceId: 'laptop' } })).status).toBe(201);
    expect((await named(a, 'laptop')).status).toBe(200); // registered by a sign-in from it
    expect((await named(b, 'laptop')).status).toBe(422); // and still not Ben's
  });

  it('S-06: the enrolment check is per learner and per batch; a learner with several enrolments may use each, and only the bad index is reported', async () => {
    const s = make();
    const a = await signUp(s, 'ana@example.com');
    const second = await raw(s, 'POST', '/enrolments', { token: a.token, body: { languageId: 'sq', packId: 'pack:sq2', packVersion: '1', goals: [] } });
    expect(second.status).toBe(201);
    const e2 = second.body.enrolment.enrolmentId as string;
    expect((await post(s, a, [lookup(a), lookup({ ...a, enrolmentId: e2 })])).status).toBe(200);
    const mixed = await post(s, a, [lookup(a), lookup({ ...a, enrolmentId: 'nope' }), lookup(a)]);
    expect(mixed.status).toBe(422);
    expect(mixed.body.issues.map((i: { index: number }) => i.index)).toEqual([1]);
  });

  it('S-07: the caps are exact: 200 characters of identifier pass and 201 do not; locator 2,048, title 300, unit ids 300 and at most 200 of them', () => {
    const e = (over: Partial<GoEvent>): string[] => paths({ ...lookup(WHO), ...over });
    expect(e({ enrolmentId: 'e'.repeat(200) })).toEqual([]);
    expect(e({ enrolmentId: 'e'.repeat(201) })).toEqual(['enrolmentId']);
    expect(e({ languageId: 'l'.repeat(201) })).toEqual(['languageId']);
    expect(e({ varietyId: 'v'.repeat(201) })).toEqual(['varietyId']);
    expect(e({ subject: { itemIds: ['x'.repeat(300)] } })).toEqual([]);
    expect(e({ subject: { itemIds: ['x'.repeat(301)] } })).toEqual(['subject.itemIds[0]']);
    expect(e({ subject: { itemIds: Array.from({ length: 201 }, (_v, i) => `form:sq:w${i}`) } })).toEqual(['subject.itemIds']);
    expect(e({ subject: { itemIds: [], sourceRef: { kind: 'web', title: 't'.repeat(300), locator: '/'.padEnd(2048, 'p') } } })).toEqual([]);
    expect(e({ subject: { itemIds: [], sourceRef: { kind: 'web', locator: '/'.padEnd(2049, 'p') } } })).toEqual(['subject.sourceRef.locator']);
    expect(e({ subject: { itemIds: [], sentenceKey: 's'.repeat(201) } })).toEqual(['subject.sentenceKey']);
    expect(e({ subject: { itemIds: [], sourceRef: 'web' as never } })).toEqual(['subject.sourceRef']);
  });

  it('S-08: a body nested 25 levels is a 400 with a code, 24 is read; a megabyte of brackets never crashes the service; nothing is stored', async () => {
    const s = make();
    const a = await signUp(s, 'ana@example.com');
    const nest = (n: number): string => '['.repeat(n) + ']'.repeat(n);
    const body = (n: number): string => `{"events":[],"x":${nest(n - 1)}}`; // depth = 1 (the object) + n - 1
    const deep = await raw(s, 'POST', '/events', { token: a.token, rawBody: body(25) });
    expect(deep.status).toBe(400);
    expect(deep.body.error).toBe('too-deeply-nested');
    expect((await raw(s, 'POST', '/events', { token: a.token, rawBody: body(24) })).status).toBe(422); // read, then refused for its empty "events"
    expect((await raw(s, 'POST', '/events', { token: a.token, rawBody: `{"x":${nest(450_000)}}` })).status).toBeLessThan(500);
    expect(await countOf(s, a)).toBe(0);
  });

  it('S-11: subject [], payload [] and sourceRef [] are refused; an object subject without itemIds is still fine for kinds that name no unit', () => {
    const e = lookup(WHO);
    expect(paths({ ...e, subject: [] as never })).toEqual(['subject']);
    expect(paths({ ...e, payload: [] as never })).toEqual(['payload']);
    expect(paths({ ...e, kind: 'CardAdded', producer: { app: 'gopractice-review', version: '1', deviceId: 'd' }, payload: [] as never })).toEqual(['payload']);
    expect(validateEvent({ ...e, kind: 'EnrolmentChanged', producer: { app: 'repository', version: '1', deviceId: 'd' }, subject: {}, payload: { change: 'started' } })).toEqual([]);
  });
});

describe('S-09 and S-10: a revision that names nothing', () => {
  const doc = (docId: string, body = 'x') => ({ docId, languageId: 'sq', kind: 'note', body });

  it('PUT /documents/:id and POST /writing answer 409 (no 500), create nothing, and keep a real revision conflict distinct (it carries the current copy)', async () => {
    const s = make();
    const a = await signUp(s, 'ana@example.com');
    const put = await raw(s, 'PUT', '/documents/ghost', { token: a.token, body: { doc: doc('ghost'), expectedRevision: 3 } });
    expect(put.status).toBe(409);
    expect(put.body).toMatchObject({ error: 'conflict', reason: 'no-such-document' });
    expect(put.body.current).toBeUndefined();
    expect((await raw(s, 'GET', '/documents/ghost', { token: a.token })).status).toBe(404);
    const writing = await raw(s, 'POST', '/writing', { token: a.token, body: { observation: { ...lookup(a), kind: 'ProductionRecorded', producer: { app: 'gopractice-tell', version: '1', deviceId: a.deviceId }, payload: { mode: 'free', assisted: false, assistance: [], usedCorrectly: 'unjudged' } }, document: { doc: doc('ghost2'), expectedRevision: 2 } } });
    expect(writing.status).toBe(409);
    expect((await raw(s, 'GET', '/documents/ghost2', { token: a.token })).status).toBe(404);
    // a stale revision of a document that exists is the ordinary conflict, with the current copy
    expect((await raw(s, 'PUT', '/documents/real', { token: a.token, body: { doc: doc('real', 'v1'), expectedRevision: 0 } })).status).toBe(200);
    const stale = await raw(s, 'PUT', '/documents/real', { token: a.token, body: { doc: doc('real', 'v2'), expectedRevision: 7 } });
    expect(stale.status).toBe(409);
    expect(stale.body.current.body).toBe('v1');
  });

  it('a sync push reports each impossible document by itself and stores the events and the other documents; a second push is the same', async () => {
    const s = make();
    const a = await signUp(s, 'ana@example.com');
    const ev = lookup(a);
    const body = { deviceId: a.deviceId, clientTime: s.clock.now(), events: [ev], documents: [{ doc: doc('ghost'), expectedRevision: 5 }, { doc: doc('fine'), expectedRevision: 0 }, { doc: doc('ghost-2'), expectedRevision: 1 }] };
    const r = await raw(s, 'POST', '/sync/push', { token: a.token, body });
    expect(r.status).toBe(200);
    expect(r.body.outcomes).toEqual([{ id: ev.id, stored: true }]);
    expect(r.body.documents).toEqual([{ docId: 'ghost', ok: false, reason: 'no-such-document' }, { docId: 'fine', ok: true }, { docId: 'ghost-2', ok: false, reason: 'no-such-document' }]);
    const again = await raw(s, 'POST', '/sync/push', { token: a.token, body: { ...body, events: [] } });
    expect(again.status).toBe(200);
    expect(again.body.documents.map((d: { docId: string; ok: boolean }) => [d.docId, d.ok])).toEqual([['ghost', false], ['fine', false], ['ghost-2', false]]); // 'fine' is now at revision 1: a revision-0 write conflicts, with its current copy
    expect(again.body.documents[1].current.body).toBe('x');
  });
});

describe('S-12: hardening headers', () => {
  it('every response carries them: success, 404, 401, 413, 204 and OPTIONS', async () => {
    const s = make();
    const a = await signUp(s, 'ana@example.com');
    const all = [
      await raw(s, 'GET', '/health'), await raw(s, 'GET', '/me', { token: a.token }), await raw(s, 'GET', '/nope', { token: a.token }), await raw(s, 'GET', '/me'),
      await raw(s, 'OPTIONS', '/events'), await raw(s, 'POST', '/events', { token: a.token, rawBody: ' '.repeat(MAX_BODY_BYTES + 1) }), await raw(s, 'DELETE', '/documents/none', { token: a.token }),
    ];
    expect(all.map((r) => r.status)).toEqual([200, 200, 404, 401, 204, 413, 404]);
    for (const r of all) {
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('referrer-policy')).toBe('no-referrer');
      expect(r.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
      expect(r.headers.get('x-frame-options')).toBe('DENY');
    }
  });
});

// ───────────── the sync client and the extension's transport meet the new refusals (S-08, S-09, S-10) ─────────────

import { FakeServer, makeClock, makeDevice, makeEvent as syncEvent } from '../repository/sync/helpers';
import type { SyncPushRequest, SyncPushResponse } from '../../packages/repository-contract/src';

/** The real service's answer for a document at a revision it does not hold: `reason: no-such-document`, no copy. */
class StrictServer extends FakeServer {
  rebased: number[] = [];
  async push(req: SyncPushRequest): Promise<SyncPushResponse> {
    const known = new Set(this.docs.keys());
    const r = await super.push(req);
    const pairs = req.documents ?? [];
    return {
      ...r,
      documents: r.documents.map((d, i) => {
        const sent = pairs[i];
        if (!d.ok && !d.current && !known.has(d.docId) && sent.expectedRevision > 0) return { docId: d.docId, ok: false, reason: 'no-such-document' as const };
        if (!d.ok && !d.current) return { docId: d.docId, ok: false, reason: 'refused' as const };
        if (d.ok) this.rebased.push(sent.expectedRevision);
        return d;
      }),
    };
  }
}

describe('the sync client and a document the server cannot place', () => {
  const save = (dev: ReturnType<typeof makeDevice>, docId: string, body: string) => dev.docs.save({ docId, learnerId: 'learner-1', languageId: 'es', kind: 'note', body });

  it('a document built on a revision the server lacks is re-sent as a NEW document (nothing is lost) and the events and the pull go on in the same round', async () => {
    const clock = makeClock();
    const server = new StrictServer(clock);
    const dev = makeDevice('d1', server, clock);
    // the device believes the server holds revision 3 of "lost": it pushed it before, and the server has since lost it
    await dev.docs.acceptRemote({ docId: 'lost', learnerId: 'learner-1', languageId: 'es', kind: 'note', body: 'v3', revision: 3, deviceId: 'd1', updatedAt: new Date(clock.now()).toISOString() });
    await save(dev, 'lost', 'v4 edited here');
    await dev.queue.enqueue(syncEvent('d1', clock));
    const r = await dev.client.syncOnce({ force: true });
    expect(r.ok).toBe(true);
    expect(r.push).toMatchObject({ acked: 1 });
    expect(r.pull).toBeDefined();
    expect(server.docs.get('lost')?.body).toBe('v4 edited here'); // the local text is the copy that survives
    expect(server.docs.get('lost')?.revision).toBe(1);
    expect(r.documents).toMatchObject({ ok: true, failed: 0 });
    expect((await dev.docs.get('lost'))?.dirty).toBe(false);
  });

  it('a document refused with no copy and no remedy is that document\'s failure alone: the result says which, ok stays true, and the pull still runs', async () => {
    const clock = makeClock();
    const server = new StrictServer(clock);
    const dev = makeDevice('d1', server, clock);
    // a revision-0 write against an id the server holds under a revision the device never saw, with no current copy offered (the fake offers none for 'refused')
    const refuse = server.push.bind(server);
    server.push = async (req) => {
      const r = await refuse(req);
      return { ...r, documents: r.documents.map((d) => ({ docId: d.docId, ok: false, reason: 'refused' as const })) };
    };
    await save(dev, 'odd', 'text');
    await save(dev, 'odd-2', 'more');
    const r = await dev.client.syncOnce({ force: true });
    expect(r.documents).toMatchObject({ ok: true, failed: 2, refused: [{ docId: 'odd', reason: 'refused' }, { docId: 'odd-2', reason: 'refused' }] });
    expect(r.pull).toBeDefined();
    expect(r.ok).toBe(true);
  });
});

describe('the extension\'s sync transport and a batch the service refuses (S-08)', () => {
  it('one invalid event in a pushed batch is set aside as a rejected row, and the good ones are sent in the same round', async () => {
    const { createAuditRig } = await import('./security.extrig');
    const { MSG } = await import('../../packages/golearn-extension/src/platform');
    const { pendingEvent } = await import('../extension/rig');
    const rig = createAuditRig();
    await rig.signUp();
    expect((await rig.connect()).ok).toBe(true);
    for (const id of ['good-1', 'bad', 'good-2']) expect(await rig.content({ type: MSG.record, event: { ...pendingEvent(), id } })).toMatchObject({ ok: true });
    // 'bad' became invalid for the service after it was queued (its enrolment is gone): the service refuses the whole batch with the bad index
    const key = Object.keys(await rig.fake.local.get(null)).find((k) => k === 'queue:bad')!;
    const row = (await rig.fake.local.get(key))[key] as { event: { enrolmentId: string } };
    await rig.fake.local.set({ [key]: { ...row, event: { ...row.event, enrolmentId: 'an-enrolment-the-service-has-never-seen' } } });
    await rig.fireTimers();
    await rig.page({ type: MSG.syncNow });
    const store = rig.h.store;
    const ids = (await store.list({ learnerId: ((await rig.fake.local.get('golearn:session'))['golearn:session'] as { learnerId: string }).learnerId, limit: 1000 })).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['good-1', 'good-2']));
    expect(ids).not.toContain('bad');
    const rows = Object.keys(await rig.fake.local.get(null));
    expect(rows).toContain('rejected:bad');
    expect(rows).not.toContain('queue:bad');
    expect(rows).not.toContain('queue:good-1');
    expect(rows).not.toContain('queue:good-2');
  });
});
