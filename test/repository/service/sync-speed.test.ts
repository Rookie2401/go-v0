// @vitest-environment node
/**
 * What makes the Repository fast to sync over a phone's connection: gzip on the wire, paged pulls with `hasMore`, no documents unless asked for,
 * validators (ETag / 304) on reads, one ranking of the candidates per load, and the typed client that uses the validators.
 */
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { GZIP_MIN_BYTES, maybeGzip } from '../../../packages/repository-service/src/compress';
import { CANDIDATE_CACHE_MS, handle } from '../../../packages/repository-service/src/handler';
import { createRepositoryApi } from '../../../packages/repository-service/src/api';
import { createHarness, lookupEvent, raw, signUp, type Harness } from './fakes';

type S = Awaited<ReturnType<typeof signUp>>;
const push = (h: Harness, s: S, n: number) =>
  raw(h, 'POST', '/sync/push', { token: s.token, body: { deviceId: s.deviceId, clientTime: h.clock.now(), events: Array.from({ length: n }, () => lookupEvent(s, { enrolmentId: s.enrolmentId })) } });

describe('gzip (the node bridge)', () => {
  const json = { 'content-type': 'application/json; charset=utf-8' };
  const big = Buffer.from(JSON.stringify({ events: Array.from({ length: 80 }, (_, i) => ({ id: `ev-${i}`, kind: 'SelectionLookedUp', payload: { surface: 'shtëpinë' } })) }));

  it('compresses a JSON body over 1 KB for a client that accepts gzip, and the body round-trips', async () => {
    expect(big.length).toBeGreaterThan(GZIP_MIN_BYTES);
    const r = await maybeGzip(big, json, 'gzip, deflate, br');
    expect(r.headers['Content-Encoding']).toBe('gzip');
    expect(r.headers.Vary).toBe('Accept-Encoding');
    expect(r.payload.length).toBeLessThan(big.length / 4);
    expect(r.headers['Content-Length']).toBe(String(r.payload.length));
    expect(gunzipSync(r.payload).equals(big)).toBe(true);
  });

  it('leaves everything else as it was: no Accept-Encoding, q=0, a small body, a non-JSON body, an already encoded body', async () => {
    expect((await maybeGzip(big, json, undefined)).payload).toBe(big);
    expect((await maybeGzip(big, json, 'identity')).headers['Content-Encoding']).toBeUndefined();
    expect((await maybeGzip(big, json, 'gzip;q=0')).payload).toBe(big);
    const small = Buffer.from('{"ok":true}');
    expect((await maybeGzip(small, json, 'gzip')).payload).toBe(small);
    expect((await maybeGzip(big, { 'content-type': 'text/plain' }, 'gzip')).payload).toBe(big);
    expect((await maybeGzip(big, { ...json, 'content-encoding': 'br' }, 'gzip')).payload).toBe(big);
  });

  it('says Vary: Accept-Encoding even when it did not compress, so a shared cache keeps the two apart', async () => {
    expect((await maybeGzip(big, json, undefined)).headers.Vary).toBe('Accept-Encoding');
  });
});

describe('POST /sync/pull', () => {
  it('pages: hasMore is true until the last page, and a page past the end is empty with hasMore false', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    await push(h, s, 5);
    const head = (await raw(h, 'GET', '/sync/status', { token: s.token })).body.events as number;
    const first = await raw(h, 'POST', '/sync/pull', { token: s.token, body: { deviceId: s.deviceId, afterSeq: 0, limit: 2 } });
    expect(first.body.events).toHaveLength(2);
    expect(first.body.hasMore).toBe(true);
    const seen: number[] = [];
    let after = 0;
    for (let guard = 0; guard < 20; guard++) {
      const page = await raw(h, 'POST', '/sync/pull', { token: s.token, body: { deviceId: s.deviceId, afterSeq: after, limit: 2 } });
      for (const e of page.body.events) seen.push(e.seq);
      if (!page.body.hasMore) { expect(page.body.head).toBe(head); break; }
      after = page.body.events[page.body.events.length - 1].seq;
    }
    expect(seen).toEqual(Array.from({ length: head }, (_, i) => i + 1));
    const past = await raw(h, 'POST', '/sync/pull', { token: s.token, body: { deviceId: s.deviceId, afterSeq: head } });
    expect(past.body).toMatchObject({ events: [], hasMore: false, head });
  });

  it('sends no documents when "documents" is false, all of them otherwise', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const put = await s.api.putDocument('doc-1', { languageId: 'sq', kind: 'testimony', title: 'T', body: 'x'.repeat(2000) }, 0);
    expect(put.ok).toBe(true);
    const all = await raw(h, 'POST', '/sync/pull', { token: s.token, body: { deviceId: s.deviceId, afterSeq: 0 } });
    expect(all.body.documents).toHaveLength(1);
    const none = await raw(h, 'POST', '/sync/pull', { token: s.token, body: { deviceId: s.deviceId, afterSeq: 0, documents: false } });
    expect(none.body.documents).toEqual([]);
    expect(none.body.events.length).toBe(all.body.events.length);
    expect((await raw(h, 'POST', '/sync/pull', { token: s.token, body: { deviceId: s.deviceId, afterSeq: 0, documents: 'no' } })).status).toBe(422);
  });
});

describe('validators on reads', () => {
  it('a GET answers with a weak ETag; the same tag in If-None-Match is an empty 304; a change gives a new tag', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const first = await raw(h, 'GET', '/enrolments', { token: s.token });
    const tag = first.headers.get('etag');
    expect(tag).toMatch(/^W\/"[0-9a-f]{32}"$/);
    expect(first.status).toBe(200);
    const same = await raw(h, 'GET', '/enrolments', { token: s.token, headers: { 'If-None-Match': tag! } });
    expect(same.status).toBe(304);
    expect(same.body).toEqual({});
    expect(same.headers.get('etag')).toBe(tag);
    expect(same.headers.get('cache-control')).toBe('no-store');
    const other = await raw(h, 'GET', '/enrolments', { token: s.token, headers: { 'If-None-Match': 'W/"nope"' } });
    expect(other.status).toBe(200);
    // the tag is a digest of the answer, so a different answer cannot match it
    await h.api(s.token).enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'listening' }] });
    const changed = await raw(h, 'GET', '/enrolments', { token: s.token, headers: { 'If-None-Match': tag! } });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(tag);
  });

  it('is only for successful GETs: an error, a POST and the unauthenticated 401 carry none', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    expect((await raw(h, 'GET', '/enrolments')).headers.get('etag')).toBeNull();
    expect((await raw(h, 'POST', '/sync/pull', { token: s.token, body: { deviceId: s.deviceId, afterSeq: 0 } })).headers.get('etag')).toBeNull();
    expect((await raw(h, 'GET', '/candidates', { token: s.token })).headers.get('etag')).toBeNull(); // 422: enrolmentId missing
  });

  it('CORS lets a browser send and read them', async () => {
    const h = createHarness();
    const r = await raw(h, 'OPTIONS', '/enrolments');
    expect(r.headers.get('access-control-allow-headers')).toMatch(/If-None-Match/);
    expect(r.headers.get('access-control-expose-headers')).toMatch(/ETag/);
    expect(Number(r.headers.get('access-control-max-age'))).toBeGreaterThanOrEqual(3600);
  });
});

describe('GET /candidates ranks once per load', () => {
  it('pages of one load share one ranking; a push (the head moving) or the lifetime ending ranks again', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const ask = () => raw(h, 'GET', `/candidates?enrolmentId=${encodeURIComponent(s.enrolmentId!)}&limit=1`, { token: s.token });
    expect((await ask()).status).toBe(200);
    const after1 = h.engine.candidateCalls.length;
    for (let i = 0; i < 4; i++) expect((await ask()).status).toBe(200);
    expect(h.engine.candidateCalls.length).toBe(after1); // four more pages, no more rankings
    await push(h, s, 1);
    await ask();
    expect(h.engine.candidateCalls.length).toBe(after1 + 1);
    h.clock.advance(CANDIDATE_CACHE_MS + 1);
    await ask();
    expect(h.engine.candidateCalls.length).toBe(after1 + 2);
  });

  it('is per learner: another learner never sees (or shares) the list', async () => {
    const h = createHarness();
    const a = await signUp(h, 'ana@example.com');
    const b = await signUp(h, 'ben@example.com');
    await raw(h, 'GET', `/candidates?enrolmentId=${encodeURIComponent(a.enrolmentId!)}`, { token: a.token });
    const n = h.engine.candidateCalls.length;
    expect((await raw(h, 'GET', `/candidates?enrolmentId=${encodeURIComponent(a.enrolmentId!)}`, { token: b.token })).status).toBe(404);
    await raw(h, 'GET', `/candidates?enrolmentId=${encodeURIComponent(b.enrolmentId!)}`, { token: b.token });
    expect(h.engine.candidateCalls.length).toBe(n + 1);
  });
});

describe('the typed client and validators', () => {
  function client(h: Harness, token: string) {
    const seen: Array<{ path: string; ifNoneMatch: string | null; status: number }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const req = new Request(input as string, init);
      const res = await handle(req, h.deps);
      seen.push({ path: new URL(req.url).pathname, ifNoneMatch: req.headers.get('If-None-Match'), status: res.status });
      return res;
    }) as typeof fetch;
    return { api: createRepositoryApi({ baseUrl: 'http://repository.local', fetch: fetchImpl, token }), seen };
  }

  it('asks again with If-None-Match and returns the same data from a 304', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const { api, seen } = client(h, s.token);
    const a = await api.listEnrolments();
    const b = await api.listEnrolments();
    expect(a.ok && b.ok).toBe(true);
    expect(b.ok && b.status).toBe(200);
    expect(b.ok && b.data).toEqual(a.ok && a.data);
    expect(seen.map((x) => x.status)).toEqual([200, 304]);
    expect(seen[0].ifNoneMatch).toBeNull();
    expect(seen[1].ifNoneMatch).toMatch(/^W\//);
  });

  it('never serves a stale answer: a change in between is a 200 with the new data', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const { api, seen } = client(h, s.token);
    await api.listEnrolments();
    await h.api(s.token).enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'listening' }] });
    const again = await api.listEnrolments();
    expect(again.ok && again.data.enrolments).toHaveLength(2);
    expect(seen.map((x) => x.status)).toEqual([200, 200]);
  });

  it("keeps one learner's answers apart from another token's", async () => {
    const h = createHarness();
    const a = await signUp(h, 'ana@example.com');
    const b = await signUp(h, 'ben@example.com');
    const ca = client(h, a.token);
    await ca.api.listEnrolments();
    ca.api.token = b.token;
    const r = await ca.api.listEnrolments();
    expect(r.ok && r.data.enrolments[0]?.learnerId).toBe(b.learnerId);
    expect(ca.seen[1].ifNoneMatch).toBeNull();
  });

  it('does nothing special against a service that sends no validators', async () => {
    let calls = 0;
    const api = createRepositoryApi({ baseUrl: 'http://x', token: 't', fetch: (async (_u: string, init?: RequestInit) => { calls += 1; expect(new Headers(init?.headers).get('If-None-Match')).toBeNull(); return new Response(JSON.stringify({ enrolments: [] }), { status: 200 }); }) as unknown as typeof fetch });
    await api.listEnrolments();
    await api.listEnrolments();
    expect(calls).toBe(2);
  });
});
