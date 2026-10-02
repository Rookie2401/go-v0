/**
 * The GoRead team server (docs/goread/BACKEND.md). Part 1 drives the handler in-process on a throw-away http server
 * (port 0); part 2 runs the real program once, as a child process, on a free port with no configuration at all.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COURSES } from '../../src/core/config';
import type { CorpusDocument } from '../../src/ingest';
import { createGoreadHandler, PERSONAL_COPY_MESSAGE } from '../../server/goread/app';
import { openStore, STORE_FILE, type GoreadStore } from '../../server/goread/store';
import { baseDoc, registry } from '../ingest/helpers';

const TEAM = 'honduras-es';

const dirs: string[] = [];
const tempDir = (): string => { const d = mkdtempSync(join(tmpdir(), 'goread-')); dirs.push(d); return d; };
const removeDirs = (): void => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); };

/** A valid Spanish document the team may share. */
const spanish = (id = 'el-viajero-ch01', extra: Partial<CorpusDocument> = {}): CorpusDocument => ({
  ...baseDoc(), id, title: 'El viajero', work: { slug: 'el-viajero', chapter: { index: 1, title: 'Uno' } }, ...extra,
});
const withSource = (doc: CorpusDocument, source: Partial<CorpusDocument['source']>): CorpusDocument => ({ ...doc, source: { ...doc.source, ...source } });

/** Sixty-plus words of Albanian, written for this test. */
const ALBANIAN = 'Në mëngjes ajo ishte në shtëpi dhe nuk kishte punë për të bërë, por kur dielli doli nga pas malit ajo shkoi në qytet me një shok të vjetër. '
  + 'Ai ishte i lodhur dhe nuk fliste shumë, por ajo i tha se do të kthehej para se të binte nata, sepse kjo ishte e vetmja ditë që ajo kishte për të parë nënën e saj. '
  + 'Edhe pse rruga ishte e gjatë dhe e vështirë, ata ecën duke biseduar për gjithçka që kishte ndodhur në vit, dhe kur arritën në fshat, të gjithë ishin ende në tryezë me një darkë të madhe e të ngrohtë për të gjithë.';

describe('GoRead handler (in-process)', () => {
  let store: GoreadStore;
  let server: Server;
  let base: string;
  let clock: string;

  beforeEach(async () => {
    clock = '2026-10-02T10:00:00.000Z';
    store = openStore(tempDir());
    server = createServer(createGoreadHandler({ store, registry, courses: COURSES, now: () => clock }));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); });
    store.close();
    removeDirs();
  });

  const call = async (method: string, path: string, opts: { body?: unknown; raw?: string } = {}) => {
    const headers: Record<string, string> = {};
    const body = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${base}${path}`, { method, headers, body });
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) as Record<string, any> : undefined };
  };
  const put = (doc: unknown, addedBy = 'Ana', id = (doc as { id: string }).id) => call('PUT', `/teams/${TEAM}/texts/${id}`, { body: { document: doc, addedBy } });

  it('answers /health', async () => {
    const r = await call('GET', '/health');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, service: 'goread', version: 1 });
  });

  it('needs no credential: every course is a team, and an unknown one is 404 no-such-team', async () => {
    for (const c of COURSES) {
      const r = await call('GET', `/teams/${c.id}/texts`);
      expect(r.status, c.id).toBe(200);
      expect(r.json).toMatchObject({ course: c.id, lang: c.lang, texts: [] });
    }
    const unknown = await call('GET', '/teams/atlantis/texts');
    expect(unknown.status).toBe(404);
    expect(unknown.json?.error).toBe('no-such-team');
    expect((await call('PUT', '/teams/atlantis/texts/x', { body: {} })).status).toBe(404);
  });

  it('stores a shareable document (201), lists it, and returns it byte-for-byte', async () => {
    const doc = spanish();
    const r = await put(doc);
    expect(r.status).toBe(201);
    expect(r.json?.summary).toMatchObject({
      id: 'el-viajero-ch01', title: 'El viajero', lang: 'es', addedBy: 'Ana', addedAt: clock, updatedAt: clock,
      workId: 'work:honduras-es:el-viajero', chapter: { index: 1, title: 'Uno' },
    });
    const canonical = JSON.stringify(doc);
    expect(r.json?.summary.bytes).toBe(Buffer.byteLength(canonical));
    expect(r.json?.summary.sha256).toMatch(/^[0-9a-f]{64}$/);

    const list = await call('GET', `/teams/${TEAM}/texts`);
    expect(list.status).toBe(200);
    expect(list.json).toMatchObject({ course: TEAM, lang: 'es' });
    expect(list.json?.texts).toEqual([r.json?.summary]);

    const got = await call('GET', `/teams/${TEAM}/texts/el-viajero-ch01`);
    expect(got.status).toBe(200);
    expect(JSON.stringify(got.json?.document)).toBe(canonical);
    expect(got.json).toMatchObject({ addedBy: 'Ana', addedAt: clock, updatedAt: clock, sha256: r.json?.summary.sha256 });
    expect(Object.keys(got.json!).sort()).toEqual(['addedAt', 'addedBy', 'document', 'sha256', 'updatedAt']);

    const missing = await call('GET', `/teams/${TEAM}/texts/nope`);
    expect(missing.status).toBe(404);
    expect(missing.json?.error).toBe('no-such-text');
  });

  it('never replaces a text: a second PUT of the id is 409 already-there, whoever adds it', async () => {
    const first = await put(spanish());
    expect(first.status).toBe(201);
    clock = '2026-10-02T11:00:00.000Z';
    for (const name of ['Ana', 'Luis']) {
      const again = await put(spanish('el-viajero-ch01', { title: 'Otra versión' }), name);
      expect(again.status, name).toBe(409);
      expect(again.json).toEqual({
        error: 'already-there',
        message: "This text is already on the team's shelf. A text once added stays as it is; add it under another id if it is a new version.",
      });
    }
    const got = await call('GET', `/teams/${TEAM}/texts/el-viajero-ch01`);
    expect(got.json?.document.title).toBe('El viajero');
    expect(got.json).toMatchObject({ addedBy: 'Ana', addedAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z' });
    expect((await call('GET', `/teams/${TEAM}/texts`)).json?.texts).toEqual([first.json?.summary]);
  });

  it('has no DELETE: it is 405 like any other wrong method, and the text stays', async () => {
    await put(spanish());
    for (const body of [{ addedBy: 'Ana' }, undefined]) {
      expect((await call('DELETE', `/teams/${TEAM}/texts/el-viajero-ch01`, { body })).status).toBe(405);
    }
    expect((await call('GET', `/teams/${TEAM}/texts/el-viajero-ch01`)).status).toBe(200);
  });

  it('keeps the texts of different teams apart', async () => {
    await put(spanish());
    expect((await call('GET', '/teams/albania-sq/texts')).json?.texts).toEqual([]);
    expect((await call('GET', '/teams/albania-sq/texts/el-viajero-ch01')).status).toBe(404);
  });

  it('filters the listing by ?since= (updated after it), newest last', async () => {
    await put(spanish('uno'));
    clock = '2026-10-02T12:00:00.000Z';
    await put(spanish('dos'));
    clock = '2026-10-02T13:00:00.000Z';
    await put(spanish('tres'));
    const ids = async (since?: string) => ((await call('GET', `/teams/${TEAM}/texts${since ? `?since=${encodeURIComponent(since)}` : ''}`)).json?.texts as Array<{ id: string }>).map((t) => t.id);
    expect(await ids()).toEqual(['uno', 'dos', 'tres']);
    expect(await ids('2026-10-02T10:00:00.000Z')).toEqual(['dos', 'tres']);
    expect(await ids('2026-10-02T12:00:00.000Z')).toEqual(['tres']);
    expect(await ids('2026-10-02T09:00:00.000Z')).toEqual(['uno', 'dos', 'tres']);
    expect(await ids('2026-10-02T13:00:00.000Z')).toEqual([]);
    expect((await call('GET', `/teams/${TEAM}/texts?since=yesterday-ish`)).status).toBe(422);
  });

  describe('refuses with a 422 that says why', () => {
    const refused = async (r: ReturnType<typeof put>, error: string) => {
      const res = await r;
      expect(res.status).toBe(422);
      expect(res.json?.error).toBe(error);
      expect(typeof res.json?.message).toBe('string');
      expect((await call('GET', `/teams/${TEAM}/texts`)).json?.texts).toEqual([]); // nothing was stored
      return res.json!;
    };

    it('id-mismatch: the address and the document disagree', async () => {
      await refused(put(spanish('uno'), 'Ana', 'otro'), 'id-mismatch');
    });

    it('wrong-language: the document is not in the course language', async () => {
      const j = await refused(put({ ...spanish(), lang: 'de' }), 'wrong-language');
      expect(j.message).toContain('German');
    });

    it('not-the-team-language: Albanian words in a document marked Spanish', async () => {
      const doc = spanish('shqip', { sections: [{ paragraphs: [{ text: ALBANIAN }] }] });
      const j = await refused(put(doc), 'not-the-team-language');
      expect(j.message).toContain('Albanian');
      expect(j.message).toContain('Honduras team reads Spanish');
    });

    it('not-shareable: a personal copy, with the exact sentence', async () => {
      const doc = withSource(spanish(), { rights: 'personal-copy', authorship: 'published' });
      const j = await refused(put(doc), 'not-shareable');
      expect(j.message).toBe(PERSONAL_COPY_MESSAGE);
      expect(j.message).toBe('Your own copy of a published book stays on your device — it is yours to read, not to redistribute. Texts your team wrote can be shared.');
    });

    it('not-shareable: public-domain or licensed without a verification record', async () => {
      await refused(put(withSource(spanish(), { rights: 'public-domain', authorship: 'public-domain' })), 'not-shareable');
      await refused(put(withSource(spanish(), { rights: 'licensed', authorship: 'licensed' })), 'not-shareable');
    });

    it('not-shareable: generated text whatever its rights say', async () => {
      const j = await refused(put({ ...spanish(), generated: true }), 'not-shareable');
      expect(j.message).toBe('Machine-generated text is not shared with the team. Texts your team wrote can be shared.');
      await refused(put(withSource(spanish(), { authorship: 'generated' })), 'not-shareable');
    });

    it('not-shareable: generated, user-private and unverified', async () => {
      await refused(put({ ...withSource(spanish(), { rights: 'generated', authorship: 'generated' }), generated: true }), 'not-shareable');
      await refused(put(withSource(spanish(), { rights: 'user-private', authorship: 'learner' })), 'not-shareable');
      await refused(put(withSource(spanish(), { rights: 'unverified', provenance: 'unverified sample, replace before release' })), 'not-shareable');
    });

    it('invalid-document: the validator\'s issues come back in "issues"', async () => {
      const { title: _title, ...noTitle } = spanish();
      const j = await refused(put(noTitle), 'invalid-document');
      expect(j.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'title', code: 'missing-field', severity: 'error' })]));
    });

    it('invalid-document: a body that is not {document, addedBy}, and a bad addedBy', async () => {
      const bad = async (opts: { body?: unknown; raw?: string }) => {
        const r = await call('PUT', `/teams/${TEAM}/texts/uno`, opts);
        expect(r.status).toBe(422);
        expect(r.json?.error).toBe('invalid-document');
      };
      await bad({ raw: '{not json' });
      await bad({ body: [] });
      await bad({ body: { addedBy: 'Ana' } });
      await bad({ body: { document: spanish('uno') } });
      await bad({ body: { document: spanish('uno'), addedBy: '   ' } });
      await bad({ body: { document: spanish('uno'), addedBy: 'x'.repeat(61) } });
      expect((await put(spanish('uno'), 'x'.repeat(60))).status).toBe(201);
    });

    it('too-large: a body over 2 MB', async () => {
      const big = { ...spanish('grande'), _padding: 'x'.repeat(2 * 1024 * 1024 + 10) };
      await refused(put(big), 'too-large');
      // the server is still alive and answering
      expect((await call('GET', '/health')).status).toBe(200);
    });
  });

  it('shares a public-domain text that carries a verification record', async () => {
    const doc = withSource(spanish('verificado'), { rights: 'public-domain', authorship: 'public-domain', verification: { against: 'the printed edition', checkedAt: '2026-10-01', method: 'human-proofread', by: 'Ana' } } as never);
    expect((await put(doc)).status).toBe(201);
  });

  it('answers CORS preflights with 204 and puts the allow-origin header on every answer', async () => {
    const pre = await fetch(`${base}/teams/${TEAM}/texts/uno`, { method: 'OPTIONS', headers: { Origin: 'https://example.org', 'Access-Control-Request-Method': 'PUT' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect(pre.headers.get('access-control-allow-methods')).toBe('GET,PUT,OPTIONS');
    expect(pre.headers.get('access-control-allow-headers')).toBe('Content-Type');
    for (const r of [await call('GET', '/health'), await call('GET', `/teams/${TEAM}/texts`), await call('GET', '/nowhere')]) {
      expect(r.headers.get('access-control-allow-origin')).toBe('*');
    }
  });

  it('answers an unknown path with 404 and a wrong method with 405', async () => {
    expect((await call('GET', '/nowhere')).status).toBe(404);
    expect((await call('POST', '/health')).status).toBe(405);
    expect((await call('POST', `/teams/${TEAM}/texts`)).status).toBe(405);
    expect((await call('PATCH', `/teams/${TEAM}/texts/x`)).status).toBe(405);
  });
});

describe('GoRead program (child process)', () => {
  let child: ChildProcess | undefined;
  afterEach(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((r) => child!.once('exit', () => r()));
      child.kill();
      await exited;
    }
    child = undefined;
    removeDirs();
  });

  const freePort = (): Promise<number> => new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address() as AddressInfo; s.close(() => resolve(port)); });
  });

  it('serves /health and a PUT then GET with no configuration, keeps a text immutable, and never writes a codes file', async () => {
    const data = tempDir();
    const port = await freePort();
    child = spawn(process.execPath, ['node_modules/vite-node/dist/cli.mjs', 'server/goread/main.ts', '--port', String(port), '--data', data], {
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'GOREAD_TEAM_CODES')), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let out = '';
    let err = '';
    child.stderr!.setEncoding('utf8').on('data', (d: string) => { err += d; });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no "listening" line in time; stdout: ${out}; stderr: ${err}`)), 15_000);
      child!.stdout!.setEncoding('utf8').on('data', (d: string) => {
        out += d;
        if (out.includes(`goread listening on http://127.0.0.1:${port}`)) { clearTimeout(timer); resolve(); }
      });
      child!.once('exit', (c) => { clearTimeout(timer); reject(new Error(`exited early (${c}); stdout: ${out}; stderr: ${err}`)); });
    });

    const base = `http://127.0.0.1:${port}`;
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true, service: 'goread', version: 1 });
    expect((await fetch(`${base}/teams/${TEAM}/texts`)).status).toBe(200);

    const doc = spanish('proceso-01');
    const headers = { 'Content-Type': 'application/json' };
    const put = await fetch(`${base}/teams/${TEAM}/texts/proceso-01`, { method: 'PUT', headers, body: JSON.stringify({ document: doc, addedBy: 'Ana' }) });
    expect(put.status).toBe(201);
    for (const addedBy of ['Ana', 'Luis']) {
      const again = await fetch(`${base}/teams/${TEAM}/texts/proceso-01`, { method: 'PUT', headers, body: JSON.stringify({ document: { ...doc, title: 'Otra' }, addedBy }) });
      expect(again.status, addedBy).toBe(409);
      expect(((await again.json()) as { error: string }).error).toBe('already-there');
    }
    const got = await fetch(`${base}/teams/${TEAM}/texts/proceso-01`);
    expect(got.status).toBe(200);
    expect(JSON.stringify(((await got.json()) as { document: unknown }).document)).toBe(JSON.stringify(doc));

    // one line per request, never a body
    await new Promise((r) => setTimeout(r, 200));
    expect(out).toMatch(/PUT \/teams\/honduras-es\/texts\/proceso-01 201 \d+ms/);
    expect(out).not.toContain('El viajero');
    expect(out + err).not.toMatch(/team code/i);

    const exited = new Promise<void>((r) => child!.once('exit', () => r()));
    child.kill();
    await exited;
    expect(existsSync(join(data, STORE_FILE))).toBe(true);
    expect(existsSync(join(data, 'team-codes.json'))).toBe(false);
  }, 20_000);
});
