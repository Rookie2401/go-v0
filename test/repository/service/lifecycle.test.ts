// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EXPORT_FORMAT, MAX_BODY_BYTES } from '../../../packages/repository-service/src/handler';
import { createHarness, makeEvent, raw, signUp } from './fakes';

describe('export', () => {
  it('assembles the learner’s events, documents, enrolments, knowledge, preferences and tombstones, and no password hash', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const who = { learnerId: s.learnerId, enrolmentId: s.enrolmentId };
    await s.api.appendEvents([makeEvent(who, { id: 'export-me' })]);
    await s.api.putDocument('d1', { languageId: 'sq', kind: 'testimony', body: 'MY TESTIMONY BODY' }, 0);
    await s.api.putTombstone({ kind: 'event', id: 'something-old' }, 'asked to forget');
    await h.store.putKnowledge([{ learnerId: s.learnerId, unitId: 'lemma:sq:libër:NOUN', languageId: 'sq', dimensions: {}, retention: { estimate: 0, halfLifeDays: 1, basedOn: 'none' }, uncertainty: 1, modelVersion: 'fake-1', basis: { events: 1 } } as never]);
    await h.store.putPreferences({ ...(await h.engine.preferences(s.learnerId, 'sq')) });
    const r = await s.api.exportAll();
    expect(r.ok).toBe(true);
    const data = r.ok ? r.data : {};
    expect(data.format).toBe(EXPORT_FORMAT);
    expect(data.format).toBe('go-repository-export@1');
    expect((data.events as Array<{ id: string }>).map((e) => e.id)).toContain('export-me');
    expect((data.documents as Array<{ body: string }>)[0].body).toBe('MY TESTIMONY BODY');
    expect(data.enrolments).toHaveLength(1);
    expect(data.knowledge).toHaveLength(1);
    expect(data.preferences).toHaveLength(1);
    expect(data.tombstones).toMatchObject([{ scope: { kind: 'event', id: 'something-old' }, reason: 'asked to forget' }]);
    expect(data.account).toEqual({ accountId: expect.any(String), email: 'ana@example.com', createdAt: expect.any(String) });
    const text = JSON.stringify(data);
    const hash = (await h.store.getAccountByEmail('ana@example.com'))!.passwordHash;
    expect(text).not.toContain(hash);
    expect(text).not.toMatch(/passwordHash|tokenHash/);
    expect(text).not.toContain(s.token);
    expect(text).not.toContain(s.password);
  });

  it('exports a long log in full (more than one page)', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const who = { learnerId: s.learnerId, enrolmentId: s.enrolmentId };
    for (let i = 0; i < 5; i++) await s.api.appendEvents(Array.from({ length: 450 }, () => makeEvent(who)));
    const r = await s.api.exportAll();
    expect(r.ok && (r.data.events as unknown[]).length).toBe(2251);
  });

  it('uses deps.exporter when given', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    h.deps.exporter = async (learnerId) => ({ format: 'custom', learnerId });
    const r = await s.api.exportAll();
    expect(r.ok && r.data).toEqual({ format: 'custom', learnerId: s.learnerId });
  });
});

describe('tombstones', () => {
  it('records a tombstone for the session’s learner and validates the scope', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const ok = await s.api.putTombstone({ kind: 'learner' }, 'leaving');
    expect(ok.ok && ok.data.tombstone).toMatchObject({ learnerId: s.learnerId, scope: { kind: 'learner' }, reason: 'leaving' });
    expect((await s.api.putTombstone({ kind: 'range', from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' })).ok).toBe(true);
    expect((await s.api.putTombstone({ kind: 'source', sourceRef: { kind: 'ebook', title: 'A book' } })).ok).toBe(true);
    expect(await h.store.listTombstones(s.learnerId)).toHaveLength(3);
    for (const scope of [undefined, {}, { kind: 'galaxy' }, { kind: 'event' }, { kind: 'range', from: 'x', to: 'y' }, { kind: 'source' }]) {
      expect((await raw(h, 'POST', '/tombstones', { token: s.token, body: { scope } })).status, JSON.stringify(scope)).toBe(422);
    }
    // a learner tombstone deletes nothing by itself
    expect(await h.store.head(s.learnerId)).toBe(1);
  });
});

describe('DELETE /me', () => {
  it('needs the account email, then erases everything and ends every session', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const second = await raw(h, 'POST', '/sessions', { body: { email: 'ana@example.com', password: s.password, deviceId: 'tablet' } });
    await s.api.appendEvents([makeEvent({ learnerId: s.learnerId, enrolmentId: s.enrolmentId })]);
    await s.api.putDocument('d1', { languageId: 'sq', kind: 'note', body: 'PRIVATE TEXT' }, 0);

    for (const body of [{}, { confirmEmail: 'someone@else.com' }, { confirmEmail: 42 }]) {
      const refused = await raw(h, 'DELETE', '/me', { token: s.token, body });
      expect(refused.status).toBe(422);
      expect(refused.body.error).toBe('email-mismatch');
    }
    expect(await h.store.head(s.learnerId)).toBe(2); // untouched
    expect((await raw(h, 'GET', '/me', { token: s.token })).status).toBe(200);

    const done = await raw(h, 'DELETE', '/me', { token: s.token, body: { confirmEmail: ' Ana@Example.com' } });
    expect(done.status).toBe(204);
    expect(await h.store.head(s.learnerId)).toBe(0);
    expect(await h.store.listDocuments(s.learnerId)).toEqual([]);
    expect(await h.store.listEnrolments(s.learnerId)).toEqual([]);
    expect(h.store.dump()).not.toContain('PRIVATE TEXT');
    // both sessions are dead
    expect((await raw(h, 'GET', '/me', { token: s.token })).status).toBe(401);
    expect((await raw(h, 'GET', '/me', { token: second.body.token })).status).toBe(401);
    // the account cannot sign in, and its email and name are gone from the records the port left behind
    expect((await raw(h, 'POST', '/sessions', { body: { email: 'ana@example.com', password: s.password, deviceId: 'd' } })).status).toBe(401);
    expect(h.store.dump()).not.toContain('ana@example.com');
    expect((await h.store.getLearner(s.learnerId))?.displayName).toBeUndefined();
    // the address can be used again
    expect((await raw(h, 'POST', '/accounts', { body: { email: 'ana@example.com', password: 'a new long password' } })).status).toBe(201);
  });

  it('through the typed client, with the same refusal', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const no = await s.api.deleteMe('nope@example.com');
    expect(!no.ok && no.status).toBe(422);
    expect((await s.api.deleteMe('ana@example.com')).ok).toBe(true);
  });
});

describe('limits, errors and logging', () => {
  it('health answers without a session', async () => {
    const h = createHarness();
    const r = await raw(h, 'GET', '/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, version: 1 });
    const viaClient = await h.api().health();
    expect(viaClient.ok && viaClient.data.ok).toBe(true);
  });

  it('413 for a body over 1 MB, however it arrives, before anything is parsed', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const huge = JSON.stringify({ events: [], pad: 'x'.repeat(2 * 1024 * 1024) });
    const a = await raw(h, 'POST', '/events', { token: s.token, rawBody: huge });
    expect(a.status).toBe(413);
    expect(a.body.error).toBe('too-large');
    // declared in the header
    const b = await raw(h, 'POST', '/events', { token: s.token, rawBody: '{}', headers: { 'content-length': String(2 * 1024 * 1024) } }).catch(() => ({ status: 413 }));
    expect(b.status).toBe(413);
    // a stream with no length, in chunks
    const chunk = new Uint8Array(256 * 1024).fill(32);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (sent >= 2 * 1024 * 1024) c.close(); else { c.enqueue(chunk); sent += chunk.length; } } });
    const { handle } = await import('../../../packages/repository-service/src/handler');
    const res = await handle(new Request('http://repository.local/events', { method: 'POST', headers: { Authorization: `Bearer ${s.token}` }, body: stream, duplex: 'half' } as RequestInit), h.deps);
    expect(res.status).toBe(413);
    // just under the limit is read (and then judged on its content)
    const under = JSON.stringify({ events: [], pad: 'x'.repeat(MAX_BODY_BYTES - 100) });
    expect((await raw(h, 'POST', '/events', { token: s.token, rawBody: under })).status).toBe(422);
  });

  it('400 invalid-json, 422 for a non-object body, 404, 405 and CORS preflight', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const bad = await raw(h, 'POST', '/events', { token: s.token, rawBody: '{ not json' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('invalid-json');
    expect((await raw(h, 'POST', '/accounts', { rawBody: '{ not json' })).status).toBe(400);
    expect((await raw(h, 'POST', '/events', { token: s.token, rawBody: '[1,2]' })).status).toBe(422);
    expect((await raw(h, 'GET', '/nothing/here', { token: s.token })).status).toBe(404);
    const method = await raw(h, 'PATCH', '/events', { token: s.token });
    expect(method.status).toBe(405);
    expect(method.body.error).toBe('method-not-allowed');
    const pre = await raw(h, 'OPTIONS', '/events');
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(pre.headers.get('access-control-allow-methods')).toContain('DELETE');
  });

  it('every error body is { error, message } and responses are never cached', async () => {
    const h = createHarness();
    for (const r of [await raw(h, 'GET', '/me'), await raw(h, 'GET', '/nothing'), await raw(h, 'POST', '/accounts', { rawBody: '{' })]) {
      expect(Object.keys(r.body).sort()).toEqual(['error', 'message']);
      expect(r.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('a store failure is a bare 500 that leaks nothing', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    h.store.listEnrolments = async () => { throw new Error('SECRET connection string postgres://user:pw@host'); };
    const r = await raw(h, 'GET', '/enrolments', { token: s.token });
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'server-error', message: expect.any(String) });
    expect(JSON.stringify(r.body)).not.toMatch(/SECRET|postgres/);
    expect(h.logs.at(-1)).toMatch(/^GET \/enrolments 500 \d+ms$/);
  });

  it('logs one line per request, METHOD /path status ms, and never a body, a query or a token', async () => {
    const h = createHarness();
    const password = 'a very secret password';
    await raw(h, 'POST', '/accounts', { body: { email: 'ana@example.com', password } });
    const s = await raw(h, 'POST', '/sessions', { body: { email: 'ana@example.com', password, deviceId: 'd' } });
    await raw(h, 'GET', `/events?afterSeq=0&unitId=lemma:sq:private`, { token: s.body.token });
    await raw(h, 'GET', '/me', { token: 'bogus-token-value' });
    await raw(h, 'GET', '/health');
    expect(h.logs).toHaveLength(5);
    for (const line of h.logs) expect(line).toMatch(/^(GET|POST|DELETE|PUT) \/[\w/:%-]* \d{3} \d+ms$/);
    expect(h.logs[2]).toMatch(/^GET \/events 200 /);
    expect(h.logs[3]).toMatch(/^GET \/me 401 /);
    const all = h.logs.join('\n');
    expect(all).not.toContain(password);
    expect(all).not.toContain(s.body.token);
    expect(all).not.toContain('bogus-token-value');
    expect(all).not.toContain('afterSeq');
    expect(all).not.toContain('ana@example.com');
  });
});
