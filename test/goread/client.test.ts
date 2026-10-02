import { describe, expect, it } from 'vitest';
import { TeamServerError, UNREACHABLE_MESSAGE, createTeamClient } from '../../src/goread/client';
import type { CorpusDocument } from '../../src/ingest';

interface Call { url: string; init: RequestInit }

/** A fake `fetch`: records every call and answers with the next canned response (or throws, for "no answer"). */
function fake(...answers: Array<{ status: number; body?: unknown } | 'throw'>) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const a = answers.shift();
    if (a === undefined || a === 'throw') throw new TypeError('Failed to fetch');
    return new Response(a.status === 204 ? null : JSON.stringify(a.body ?? {}), { status: a.status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { calls, impl };
}

const summary = { id: 'el-viajero-ch01', title: 'El viajero', lang: 'es', addedBy: 'Ana', addedAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z', sha256: 'ab', bytes: 10 };
const doc = { schemaVersion: 2, id: 'el-viajero-ch01', lang: 'es', title: 'El viajero' } as unknown as CorpusDocument;
const headers = (c: Call) => c.init.headers as Record<string, string>;

describe('createTeamClient', () => {
  it('health: GET /health with no code, trailing slashes trimmed', async () => {
    const f = fake({ status: 200, body: { ok: true, service: 'goread', version: 1 } });
    const client = createTeamClient({ baseUrl: ' https://goread.example.org// ', code: 'sekret', fetch: f.impl });
    expect(await client.health()).toEqual({ ok: true });
    expect(f.calls[0].url).toBe('https://goread.example.org/health');
    expect(f.calls[0].init.method).toBe('GET');
    expect(JSON.stringify(f.calls[0])).not.toContain('sekret');
  });

  it('health: an unreachable server, an error status and a stranger are all { ok: false } and never throw', async () => {
    const f = fake('throw', { status: 500 }, { status: 200, body: { hello: 'world' } });
    const client = createTeamClient({ baseUrl: 'http://x', code: 'c', fetch: f.impl });
    expect(await client.health()).toEqual({ ok: false, message: UNREACHABLE_MESSAGE });
    expect((await client.health()).ok).toBe(false);
    const stranger = await client.health();
    expect(stranger.ok).toBe(false);
    expect(stranger.message).toMatch(/not a GoRead team server/);
  });

  it('list: Bearer header, encoded course and since, returns the summaries', async () => {
    const f = fake({ status: 200, body: { course: 'honduras-es', lang: 'es', texts: [summary] } }, { status: 200, body: { texts: [] } });
    const client = createTeamClient({ baseUrl: 'http://x/', code: 'sekret', fetch: f.impl });
    expect(await client.list('honduras-es')).toEqual([summary]);
    expect(f.calls[0].url).toBe('http://x/teams/honduras-es/texts');
    expect(headers(f.calls[0])).toEqual({ Authorization: 'Bearer sekret' });
    await client.list('a b', '2026-10-01T00:00:00.000Z');
    expect(f.calls[1].url).toBe('http://x/teams/a%20b/texts?since=2026-10-01T00%3A00%3A00.000Z');
    // the code is never in a URL
    expect(f.calls.every((c) => !c.url.includes('sekret'))).toBe(true);
  });

  it('get: returns the shared text', async () => {
    const shared = { document: doc, addedBy: 'Ana', addedAt: 'a', updatedAt: 'b', sha256: 'c' };
    const f = fake({ status: 200, body: shared });
    const client = createTeamClient({ baseUrl: 'http://x', code: 'c', fetch: f.impl });
    expect(await client.get('honduras-es', 'el-viajero-ch01')).toEqual(shared);
    expect(f.calls[0].url).toBe('http://x/teams/honduras-es/texts/el-viajero-ch01');
  });

  it('share: PUT with { document, addedBy }; 201 and 200 are told apart', async () => {
    const f = fake({ status: 201, body: { summary } }, { status: 200, body: { summary } });
    const client = createTeamClient({ baseUrl: 'http://x', code: 'sekret', fetch: f.impl });
    const first = await client.share('honduras-es', doc, 'Ana');
    expect(first).toEqual({ status: 201, summary });
    expect(f.calls[0].url).toBe('http://x/teams/honduras-es/texts/el-viajero-ch01');
    expect(f.calls[0].init.method).toBe('PUT');
    expect(headers(f.calls[0])).toEqual({ Authorization: 'Bearer sekret', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ document: doc, addedBy: 'Ana' });
    expect((await client.share('honduras-es', doc, 'Ana')).status).toBe(200);
  });

  it('remove: DELETE with { addedBy }, 204 resolves', async () => {
    const f = fake({ status: 204 });
    const client = createTeamClient({ baseUrl: 'http://x', code: 'c', fetch: f.impl });
    await expect(client.remove('honduras-es', 'el-viajero-ch01', 'Ana')).resolves.toBeUndefined();
    expect(f.calls[0].init.method).toBe('DELETE');
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ addedBy: 'Ana' });
    expect(headers(f.calls[0]).Authorization).toBe('Bearer c');
  });

  it('maps the server error body to a TeamServerError carrying the learner-facing message and issues', async () => {
    const issues = [{ path: 'sections', code: 'missing-field', message: 'sections must be a non-empty array', severity: 'error' }];
    const f = fake(
      { status: 401, body: { error: 'not-a-team-member', message: 'That team code is not right.' } },
      { status: 422, body: { error: 'invalid-document', message: 'The text did not pass the checks.', issues } },
      { status: 403, body: { error: 'not-yours', message: 'Another learner added this text.' } },
      { status: 404, body: { error: 'no-such-text' } },
    );
    const client = createTeamClient({ baseUrl: 'http://x', code: 'c', fetch: f.impl });
    const e1 = await client.list('honduras-es').catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(TeamServerError);
    expect(e1).toMatchObject({ status: 401, error: 'not-a-team-member', message: 'That team code is not right.' });
    const e2 = await client.share('honduras-es', doc, 'Ana').catch((e: unknown) => e);
    expect(e2).toMatchObject({ status: 422, error: 'invalid-document', message: 'The text did not pass the checks.', issues });
    const e3 = await client.remove('honduras-es', 'x', 'Bea').catch((e: unknown) => e);
    expect(e3).toMatchObject({ status: 403, error: 'not-yours' });
    const e4 = await client.get('honduras-es', 'zz').catch((e: unknown) => e);
    expect(e4).toMatchObject({ status: 404, error: 'no-such-text' });
    expect((e4 as TeamServerError).message.length).toBeGreaterThan(0);
  });

  it('a non-JSON error becomes http-<status>', async () => {
    const impl = (async () => new Response('<html>bad gateway</html>', { status: 502 })) as typeof fetch;
    const client = createTeamClient({ baseUrl: 'http://x', code: 'c', fetch: impl });
    await expect(client.list('honduras-es')).rejects.toMatchObject({ status: 502, error: 'http-502' });
  });

  it('a network failure is status 0 / unreachable with the Settings sentence', async () => {
    const f = fake('throw', 'throw', 'throw', 'throw');
    const client = createTeamClient({ baseUrl: 'http://x', code: 'c', fetch: f.impl });
    for (const run of [() => client.list('c'), () => client.get('c', 'i'), () => client.share('c', doc, 'Ana'), () => client.remove('c', 'i', 'Ana')]) {
      const e = await run().catch((x: unknown) => x);
      expect(e).toBeInstanceOf(TeamServerError);
      expect(e).toMatchObject({ status: 0, error: 'unreachable', message: 'The team server did not answer. Check the address in Settings → Team sharing.' });
    }
  });

  it('a successful answer that is not what the contract promises is a bad-response', async () => {
    const f = fake({ status: 200, body: { nope: true } }, { status: 200, body: { nope: true } });
    const client = createTeamClient({ baseUrl: 'http://x', code: 'c', fetch: f.impl });
    await expect(client.list('c')).rejects.toMatchObject({ error: 'bad-response' });
    await expect(client.get('c', 'i')).rejects.toMatchObject({ error: 'bad-response' });
  });
});
