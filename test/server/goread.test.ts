/**
 * The GoRead team server (docs/goread/BACKEND.md, v3). Part 1 drives `handle()` directly with `new Request(...)`, the same
 * table of cases against the sqlite store (with the FULL check, as main.ts runs it) and against the D1 store over a fake
 * D1 built on node:sqlite (with the LIGHT check, as worker.ts runs it). Part 2 runs main.ts once as a child process.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { COURSES } from '../../src/core/config';
import type { CorpusDocument } from '../../src/ingest';
import { lightCheck, PERSONAL_COPY_MESSAGE, type DocumentCheck } from '../../server/goread/check';
import { fullCheck } from '../../server/goread/check-full';
import { constantTimeEqual, handle, notOnWhitelistMessage, sha256Hex } from '../../server/goread/handler';
import type { GoreadStore } from '../../server/goread/store';
import { createD1Store } from '../../server/goread/store-d1';
import { openSqliteStore, STORE_FILE } from '../../server/goread/store-sqlite';
import { runAdmin } from '../../server/goread/admin-lib';
import { baseDoc } from '../ingest/helpers';
import { makeFakeD1 } from './fakeD1';

const TEAM = 'honduras-es';
const ANA_KEY = 'ana-made-up-contributor-key';
const LUIS_KEY = 'luis-made-up-contributor-key';
const GONE_KEY = 'gone-made-up-contributor-key';

const dirs: string[] = [];
const tempDir = (): string => { const d = mkdtempSync(join(tmpdir(), 'goread-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

/** A valid Spanish document the team may share. */
const spanish = (id = 'el-viajero-ch01', extra: Partial<CorpusDocument> = {}): CorpusDocument => ({
  ...baseDoc(), id, title: 'El viajero', work: { slug: 'el-viajero', chapter: { index: 1, title: 'Uno' } }, ...extra,
});
const withSource = (doc: CorpusDocument, source: Partial<CorpusDocument['source']>): CorpusDocument => ({ ...doc, source: { ...doc.source, ...source } });

/** Sixty-plus words of Albanian, written for this test. */
const ALBANIAN = 'Në mëngjes ajo ishte në shtëpi dhe nuk kishte punë për të bërë, por kur dielli doli nga pas malit ajo shkoi në qytet me një shok të vjetër. '
  + 'Ai ishte i lodhur dhe nuk fliste shumë, por ajo i tha se do të kthehej para se të binte nata, sepse kjo ishte e vetmja ditë që ajo kishte për të parë nënën e saj. '
  + 'Edhe pse rruga ishte e gjatë dhe e vështirë, ata ecën duke biseduar për gjithçka që kishte ndodhur në vit, dhe kur arritën në fshat, të gjithë ishin ende në tryezë me një darkë të madhe e të ngrohtë për të gjithë.';

const HONDURAS_401 = "Adding texts to the Honduras team's shelf is open to the people on its list. Ask whoever keeps the team's list for a contributor key, and enter it in Settings → Team sharing. You can still read everything here.";

interface Variant { name: string; check: DocumentCheck; full: boolean; open(): { store: GoreadStore; close(): void } }

const VARIANTS: Variant[] = [
  { name: 'sqlite store + full check (Node)', check: fullCheck, full: true, open() { const store = openSqliteStore(tempDir()); return { store, close: () => store.close() }; } },
  { name: 'D1 store (fake) + light check (Worker)', check: lightCheck, full: false, open() { const store = createD1Store(makeFakeD1().d1); return { store, close: () => store.close() }; } },
];

describe.each(VARIANTS)('GoRead handler: $name', (variant) => {
  let clock = '2026-10-02T10:00:00.000Z';

  /** A fresh store with Ana and Luis on the honduras-es list and Gone revoked. */
  async function setup() {
    clock = '2026-10-02T10:00:00.000Z';
    const { store, close } = variant.open();
    for (const [name, key] of [['Ana', ANA_KEY], ['Luis', LUIS_KEY], ['Gone', GONE_KEY]] as const) {
      await store.addContributor({ team: TEAM, name, keyHash: await sha256Hex(key), createdAt: clock, revokedAt: null });
    }
    await store.revoke(TEAM, 'Gone', clock);
    const call = async (method: string, path: string, opts: { key?: string | null; body?: unknown; raw?: string } = {}) => {
      const headers: Record<string, string> = {};
      if (opts.key) headers.Authorization = `Bearer ${opts.key}`;
      const body = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await handle(new Request(`http://goread.test${path}`, { method, headers, body }), { store, courses: COURSES, check: variant.check, now: () => clock });
      const text = await res.text();
      return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) as Record<string, any> : undefined };
    };
    const put = (doc: unknown, key: string | null = ANA_KEY, id = (doc as { id: string }).id, extra: Record<string, unknown> = {}) =>
      call('PUT', `/teams/${TEAM}/texts/${id}`, { key, body: { document: doc, ...extra } });
    const texts = async () => (await call('GET', `/teams/${TEAM}/texts`)).json?.texts as Array<Record<string, any>>;
    return { store, close, call, put, texts };
  }

  it('reads without a key: /health, the lists of every team, a text; an unknown team is 404', async () => {
    const { call, put, close } = await setup();
    expect((await call('GET', '/health')).json).toEqual({ ok: true, service: 'goread', version: 1 });
    for (const c of COURSES) {
      const r = await call('GET', `/teams/${c.id}/texts`);
      expect(r.status, c.id).toBe(200);
      expect(r.json).toMatchObject({ course: c.id, lang: c.lang });
    }
    await put(spanish());
    expect((await call('GET', `/teams/${TEAM}/texts/el-viajero-ch01`)).status).toBe(200);
    expect((await call('GET', `/teams/${TEAM}/texts/nope`)).json?.error).toBe('no-such-text');
    const unknown = await call('GET', '/teams/atlantis/texts');
    expect(unknown.status).toBe(404);
    expect(unknown.json?.error).toBe('no-such-team');
    expect((await call('PUT', '/teams/atlantis/texts/x', { key: ANA_KEY, body: {} })).json?.error).toBe('no-such-team');
    close();
  });

  it('/me: 200 { team, name } for a key on the list; 401 not-on-whitelist without, unknown, revoked, or another team\'s key', async () => {
    const { call, close } = await setup();
    const me = await call('GET', `/teams/${TEAM}/me`, { key: ANA_KEY });
    expect(me.status).toBe(200);
    expect(me.json).toEqual({ team: TEAM, name: 'Ana' });
    expect((await call('GET', `/teams/${TEAM}/me`, { key: LUIS_KEY })).json?.name).toBe('Luis');
    for (const [label, key] of [['none', null], ['unknown', 'not-a-key-at-all'], ['revoked', GONE_KEY]] as const) {
      const r = await call('GET', `/teams/${TEAM}/me`, { key });
      expect(r.status, label).toBe(401);
      expect(r.json).toEqual({ error: 'not-on-whitelist', message: HONDURAS_401 });
    }
    // the same key on a team whose list it is not on
    const other = await call('GET', '/teams/albania-sq/me', { key: ANA_KEY });
    expect(other.status).toBe(401);
    expect(other.json?.message).toContain("Albania team's shelf");
    expect((await call('POST', `/teams/${TEAM}/me`, { key: ANA_KEY })).status).toBe(405);
    close();
  });

  it('PUT needs a key on the list: 401 without, with an unknown key, and with a revoked key', async () => {
    const { put, texts, close } = await setup();
    for (const key of [null, 'wrong-key', GONE_KEY]) {
      const r = await put(spanish(), key);
      expect(r.status, String(key)).toBe(401);
      expect(r.json).toEqual({ error: 'not-on-whitelist', message: HONDURAS_401 });
      expect(JSON.stringify(r.json)).not.toContain(ANA_KEY);
    }
    expect(await texts()).toEqual([]);
    expect(notOnWhitelistMessage('Honduras')).toBe(HONDURAS_401);
    close();
  });

  it('stores a shareable document (201), addedBy is the whitelist name whatever the body says, and GET returns it byte-for-byte', async () => {
    const { call, put, texts, close } = await setup();
    const doc = spanish();
    const r = await put(doc, ANA_KEY, undefined, { addedBy: 'Mallory' });
    expect(r.status).toBe(201);
    expect(r.json?.summary).toMatchObject({
      id: 'el-viajero-ch01', title: 'El viajero', lang: 'es', addedBy: 'Ana', addedAt: clock, updatedAt: clock,
      workId: 'work:honduras-es:el-viajero', chapter: { index: 1, title: 'Uno' },
    });
    const canonical = JSON.stringify(doc);
    expect(r.json?.summary.bytes).toBe(Buffer.byteLength(canonical));
    expect(r.json?.summary.sha256).toBe(await sha256Hex(canonical));
    expect(await texts()).toEqual([r.json?.summary]);

    const got = await call('GET', `/teams/${TEAM}/texts/el-viajero-ch01`);
    expect(JSON.stringify(got.json?.document)).toBe(canonical);
    expect(got.json).toMatchObject({ addedBy: 'Ana', addedAt: clock, updatedAt: clock, sha256: r.json?.summary.sha256 });
    expect(Object.keys(got.json!).sort()).toEqual(['addedAt', 'addedBy', 'document', 'sha256', 'updatedAt']);

    const luis = await put(spanish('otro'), LUIS_KEY);
    expect(luis.json?.summary.addedBy).toBe('Luis');
    close();
  });

  it('never replaces a text: a second PUT of the id is 409 already-there, whoever adds it', async () => {
    const { call, put, texts, close } = await setup();
    const first = await put(spanish());
    clock = '2026-10-02T11:00:00.000Z';
    for (const key of [ANA_KEY, LUIS_KEY]) {
      const again = await put(spanish('el-viajero-ch01', { title: 'Otra versión' }), key);
      expect(again.status).toBe(409);
      expect(again.json).toEqual({
        error: 'already-there',
        message: "This text is already on the team's shelf. A text once added stays as it is; add it under another id if it is a new version.",
      });
    }
    const got = await call('GET', `/teams/${TEAM}/texts/el-viajero-ch01`);
    expect(got.json?.document.title).toBe('El viajero');
    expect(got.json).toMatchObject({ addedBy: 'Ana', updatedAt: '2026-10-02T10:00:00.000Z' });
    expect(await texts()).toEqual([first.json?.summary]);
    close();
  });

  it('revoking a key leaves that person\'s texts where they are', async () => {
    const { call, put, store, texts, close } = await setup();
    expect((await put(spanish('de-ana'), ANA_KEY)).status).toBe(201);
    expect(await store.revoke(TEAM, 'Ana', clock)).toBe(true);
    expect(await store.revoke(TEAM, 'Ana', clock)).toBe(false);
    expect((await put(spanish('despues'), ANA_KEY)).status).toBe(401);
    expect((await call('GET', `/teams/${TEAM}/me`, { key: ANA_KEY })).status).toBe(401);
    expect((await texts()).map((t) => [t.id, t.addedBy])).toEqual([['de-ana', 'Ana']]);
    expect((await call('GET', `/teams/${TEAM}/texts/de-ana`)).status).toBe(200);
    expect((await put(spanish('luis-sigue'), LUIS_KEY)).status).toBe(201);
    close();
  });

  it('has no DELETE: 405 with or without a key, and the text stays', async () => {
    const { call, put, close } = await setup();
    await put(spanish());
    for (const key of [ANA_KEY, null]) expect((await call('DELETE', `/teams/${TEAM}/texts/el-viajero-ch01`, { key })).status).toBe(405);
    expect((await call('GET', `/teams/${TEAM}/texts/el-viajero-ch01`)).status).toBe(200);
    close();
  });

  it('keeps the texts of different teams apart', async () => {
    const { call, put, close } = await setup();
    await put(spanish());
    expect((await call('GET', '/teams/albania-sq/texts')).json?.texts).toEqual([]);
    expect((await call('GET', '/teams/albania-sq/texts/el-viajero-ch01')).status).toBe(404);
    close();
  });

  it('filters the listing by ?since= (updated after it), newest last', async () => {
    const { call, put, texts, close } = await setup();
    await put(spanish('uno'));
    clock = '2026-10-02T12:00:00.000Z';
    await put(spanish('dos'));
    clock = '2026-10-02T13:00:00.000Z';
    await put(spanish('tres'));
    const ids = async (since?: string) => ((await call('GET', `/teams/${TEAM}/texts${since ? `?since=${encodeURIComponent(since)}` : ''}`)).json?.texts as Array<{ id: string }>).map((t) => t.id);
    expect((await texts()).map((t) => t.id)).toEqual(['uno', 'dos', 'tres']);
    expect(await ids('2026-10-02T10:00:00.000Z')).toEqual(['dos', 'tres']);
    expect(await ids('2026-10-02T12:00:00.000Z')).toEqual(['tres']);
    expect(await ids('2026-10-02T13:00:00.000Z')).toEqual([]);
    expect((await call('GET', `/teams/${TEAM}/texts?since=yesterday-ish`)).status).toBe(422);
    close();
  });

  describe('refuses with a 422 that says why', () => {
    async function refused(error: string, make: (s: Awaited<ReturnType<typeof setup>>) => Promise<{ status: number; json?: Record<string, any> }>) {
      const s = await setup();
      const res = await make(s);
      expect(res.status).toBe(422);
      expect(res.json?.error).toBe(error);
      expect(typeof res.json?.message).toBe('string');
      expect(await s.texts()).toEqual([]); // nothing was stored
      s.close();
      return res.json!;
    }

    it('id-mismatch: the address and the document disagree', async () => {
      await refused('id-mismatch', ({ put }) => put(spanish('uno'), ANA_KEY, 'otro'));
    });

    it('wrong-language: the document is not in the course language', async () => {
      const j = await refused('wrong-language', ({ put }) => put({ ...spanish(), lang: 'de' }));
      expect(j.message).toContain('German');
    });

    it('not-the-team-language: Albanian words in a document marked Spanish', async () => {
      const doc = spanish('shqip', { sections: [{ paragraphs: [{ text: ALBANIAN }] }] });
      const j = await refused('not-the-team-language', ({ put }) => put(doc));
      expect(j.message).toContain('Albanian');
      expect(j.message).toContain('Honduras team reads Spanish');
    });

    it('not-shareable: a personal copy, with the exact sentence', async () => {
      const j = await refused('not-shareable', ({ put }) => put(withSource(spanish(), { rights: 'personal-copy', authorship: 'published' })));
      expect(j.message).toBe(PERSONAL_COPY_MESSAGE);
      expect(j.message).toBe('Your own copy of a published book stays on your device — it is yours to read, not to redistribute. Texts your team wrote can be shared.');
    });

    it('not-shareable: public-domain or licensed without a verification record', async () => {
      await refused('not-shareable', ({ put }) => put(withSource(spanish(), { rights: 'public-domain', authorship: 'public-domain' })));
      await refused('not-shareable', ({ put }) => put(withSource(spanish(), { rights: 'licensed', authorship: 'licensed' })));
    });

    it('not-shareable: generated text whatever its rights say', async () => {
      const j = await refused('not-shareable', ({ put }) => put({ ...spanish(), generated: true }));
      expect(j.message).toBe('Machine-generated text is not shared with the team. Texts your team wrote can be shared.');
      await refused('not-shareable', ({ put }) => put(withSource(spanish(), { authorship: 'generated' })));
      await refused('not-shareable', ({ put }) => put({ ...withSource(spanish(), { rights: 'generated', authorship: 'generated' }), generated: true }));
    });

    it('not-shareable: user-private and unverified', async () => {
      await refused('not-shareable', ({ put }) => put(withSource(spanish(), { rights: 'user-private', authorship: 'learner' })));
      await refused('not-shareable', ({ put }) => put(withSource(spanish(), { rights: 'unverified', provenance: 'unverified sample, replace before release' })));
    });

    it('invalid-document: a document missing a required field comes back with "issues"', async () => {
      const { title: _title, ...noTitle } = spanish();
      const j = await refused('invalid-document', ({ put }) => put(noTitle));
      expect(j.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'title', code: 'missing-field', severity: 'error' })]));
      await refused('invalid-document', ({ put }) => put({ ...spanish(), sections: [] }));
      await refused('invalid-document', ({ put }) => put({ ...spanish(), sections: [{ paragraphs: [{ sentences: [{ text: '  ' }] }] }] }));
      await refused('invalid-document', ({ put }) => put(withSource(spanish(), { rights: 'invented' as never })));
    });

    it('invalid-document: a body that is not {document}', async () => {
      const s = await setup();
      for (const opts of [{ raw: '{not json' }, { body: [] }, { body: { addedBy: 'Ana' } }, { body: { document: 'text' } }]) {
        const r = await s.call('PUT', `/teams/${TEAM}/texts/uno`, { key: ANA_KEY, ...opts });
        expect(r.status).toBe(422);
        expect(r.json?.error).toBe('invalid-document');
      }
      s.close();
    });

    it('too-large: a body over 2 MB, read from the stream', async () => {
      const j = await refused('too-large', ({ put }) => put({ ...spanish('grande'), _padding: 'x'.repeat(2 * 1024 * 1024 + 10) }));
      expect(j.message).toContain('2 MB');
    });
  });

  it(variant.full ? 'full check: a document that passes the shape check but not the validator is 422 invalid-document' : 'light check: the same document is accepted (the importer on every device validates it fully)', async () => {
    const { put, texts, close } = await setup();
    const deep = spanish('hondo', { sections: [{ paragraphs: [{ sentences: [{ text: 'Hola.', spans: [{ start: 0, end: 99, lemma: 'hola' }] }] }] }] });
    const r = await put(deep);
    if (variant.full) {
      expect(r.status).toBe(422);
      expect(r.json?.error).toBe('invalid-document');
      expect(r.json?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'span-out-of-bounds' })]));
      expect(await texts()).toEqual([]);
    } else {
      expect(r.status).toBe(201);
    }
    close();
  });

  it('shares a public-domain text that carries a verification record', async () => {
    const { put, close } = await setup();
    const doc = withSource(spanish('verificado'), { rights: 'public-domain', authorship: 'public-domain', verification: { against: 'the printed edition', checkedAt: '2026-10-01', method: 'human-proofread', by: 'Ana' } } as never);
    expect((await put(doc)).status).toBe(201);
    close();
  });

  it('answers CORS preflights with 204 (Authorization allowed) and puts allow-origin on every answer', async () => {
    const { call, close } = await setup();
    const pre = await call('OPTIONS', `/teams/${TEAM}/texts/uno`);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect(pre.headers.get('access-control-allow-methods')).toBe('GET,PUT,OPTIONS');
    expect(pre.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');
    for (const r of [await call('GET', '/health'), await call('GET', `/teams/${TEAM}/me`), await call('GET', '/nowhere'), await call('PUT', `/teams/${TEAM}/texts/x`)]) {
      expect(r.headers.get('access-control-allow-origin')).toBe('*');
    }
    close();
  });

  it('answers an unknown path with 404 and a wrong method with 405', async () => {
    const { call, close } = await setup();
    expect((await call('GET', '/nowhere')).status).toBe(404);
    expect((await call('POST', '/health')).status).toBe(405);
    expect((await call('POST', `/teams/${TEAM}/texts`)).status).toBe(405);
    expect((await call('PATCH', `/teams/${TEAM}/texts/x`)).status).toBe(405);
    close();
  });
});

describe('GoRead handler pieces', () => {
  it('sha256Hex matches the known vector, and constantTimeEqual compares whole strings', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });

  it('the Worker side imports no adapters, no validator and nothing from node:', () => {
    for (const file of ['check.ts', 'handler.ts', 'store.ts', 'store-d1.ts', 'worker.ts']) {
      const source = readFileSync(join('server/goread', file), 'utf8');
      const imports = [...source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
      expect(imports.filter((i) => /adapters|ingest\/format|check-full|store-sqlite|^node:/.test(i)), file).toEqual([]);
    }
  });
});

describe('GoRead admin (whitelist)', () => {
  const run = async (argv: string[], opts: { newKey?: () => string } = {}) => {
    let stdout = '';
    let stderr = '';
    const code = await runAdmin(argv, { stdout: (t) => { stdout += t; }, stderr: (t) => { stderr += t; } }, { now: () => '2026-10-02T10:00:00.000Z', ...opts });
    return { code, stdout, stderr };
  };

  it('add prints the key once (stdout) with a "copy it now" line (stderr); only its hash is stored', async () => {
    const data = tempDir();
    const added = await run(['whitelist', 'add', '--team', TEAM, '--name', 'Ana', '--data', data]);
    expect(added.code).toBe(0);
    const key = added.stdout.trim();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
    expect(added.stderr).toMatch(/Copy this key now; it is not stored/);
    expect(added.stderr).not.toContain(key);

    const store = openSqliteStore(data);
    const row = await store.findByKeyHash(TEAM, await sha256Hex(key));
    expect(row).toMatchObject({ team: TEAM, name: 'Ana', createdAt: '2026-10-02T10:00:00.000Z', revokedAt: null });
    expect(row?.keyHash).toBe(await sha256Hex(key));
    store.close();
    expect(readFileSync(join(data, STORE_FILE)).includes(Buffer.from(key))).toBe(false);

    const second = await run(['whitelist', 'add', '--team', TEAM, '--name', 'Luis', '--data', data]);
    expect(second.stdout.trim()).not.toBe(key);
    const again = await run(['whitelist', 'add', '--team', TEAM, '--name', 'Ana', '--data', data]);
    expect(again.code).toBe(1);
    expect(again.stdout).toBe('');
  });

  it('list shows names, dates and revoked or not, never a key or a hash; revoke is one person at a time', async () => {
    const data = tempDir();
    const ana = (await run(['whitelist', 'add', '--team', TEAM, '--name', 'Ana', '--data', data])).stdout.trim();
    await run(['whitelist', 'add', '--team', TEAM, '--name', 'Luis', '--data', data]);
    const revoked = await run(['whitelist', 'revoke', '--team', TEAM, '--name', 'Ana', '--data', data]);
    expect(revoked.code).toBe(0);
    expect((await run(['whitelist', 'revoke', '--team', TEAM, '--name', 'Ana', '--data', data])).code).toBe(1);
    expect((await run(['whitelist', 'revoke', '--team', TEAM, '--name', 'Nobody', '--data', data])).code).toBe(1);

    const list = await run(['whitelist', 'list', '--team', TEAM, '--data', data]);
    expect(list.code).toBe(0);
    expect(list.stdout).toContain('Ana');
    expect(list.stdout).toContain('revoked 2026-10-02T10:00:00.000Z');
    expect(list.stdout).toContain('Luis');
    expect(list.stdout).toContain('active');
    expect(list.stdout).not.toContain(ana);
    expect(list.stdout).not.toContain(await sha256Hex(ana));
    expect((await run(['whitelist', 'list', '--team', 'albania-sq', '--data', data])).stdout).toContain('nobody');
  });

  it('--sql prints SQL with the hash and not the key (the key goes to stderr), and the SQL works on a D1', async () => {
    const key = 'sql-mode-made-up-key-0123456789abcdefghij';
    const added = await run(['whitelist', 'add', '--team', TEAM, '--name', "Ana O'Neil", '--sql'], { newKey: () => key });
    expect(added.code).toBe(0);
    expect(added.stdout).toContain(await sha256Hex(key));
    expect(added.stdout).not.toContain(key);
    expect(added.stdout).toContain("'Ana O''Neil'");
    expect(added.stderr).toContain(key);
    expect(added.stderr).toMatch(/Copy this key now; it is not stored/);

    const { d1, db } = makeFakeD1();
    db.exec(added.stdout);
    const call = (path: string, k: string) => handle(new Request(`http://goread.test${path}`, { headers: { Authorization: `Bearer ${k}` } }), { store: createD1Store(d1), courses: COURSES, check: lightCheck });
    const me = await call(`/teams/${TEAM}/me`, key);
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ team: TEAM, name: "Ana O'Neil" });

    const revoke = await run(['whitelist', 'revoke', '--team', TEAM, '--name', "Ana O'Neil", '--sql']);
    expect(revoke.stdout).toContain('UPDATE contributors SET revoked_at');
    db.exec(revoke.stdout);
    expect((await call(`/teams/${TEAM}/me`, key)).status).toBe(401);

    const list = await run(['whitelist', 'list', '--team', TEAM, '--sql']);
    expect(list.stdout).toContain('SELECT name, created_at, revoked_at FROM contributors');
    expect(list.stdout).not.toContain('key_hash');
  });

  it('refuses a bad command, an unknown team, and a bad name (exit 2)', async () => {
    expect((await run(['whitelist', 'frobnicate'])).code).toBe(2);
    expect((await run(['whitelist', 'add', '--team', 'atlantis', '--name', 'Ana', '--sql'])).code).toBe(2);
    expect((await run(['whitelist', 'add', '--team', TEAM, '--sql'])).code).toBe(2);
    expect((await run(['whitelist', 'add', '--team', TEAM, '--name', 'x'.repeat(61), '--sql'])).code).toBe(2);
    expect((await run(['whitelist', 'add', '--team', TEAM, '--name', 'Ana', '--sql', '--data', 'x'])).code).toBe(2);
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
  });

  const freePort = (): Promise<number> => new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address() as AddressInfo; s.close(() => resolve(port)); });
  });

  it('main.ts: reads without a key, adds with one (named by the list), keeps a text immutable, runs the full check', async () => {
    const data = tempDir();
    const added = await runAdmin(['whitelist', 'add', '--team', TEAM, '--name', 'Ana', '--data', data], { stdout: () => undefined, stderr: () => undefined }, { newKey: () => ANA_KEY });
    expect(added).toBe(0);
    const port = await freePort();
    child = spawn(process.execPath, ['node_modules/vite-node/dist/cli.mjs', 'server/goread/main.ts', '--port', String(port), '--data', data], {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
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
    const auth = { Authorization: `Bearer ${ANA_KEY}`, 'Content-Type': 'application/json' };
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true, service: 'goread', version: 1 });
    expect((await fetch(`${base}/teams/${TEAM}/texts`)).status).toBe(200);
    expect(await (await fetch(`${base}/teams/${TEAM}/me`, { headers: auth })).json()).toEqual({ team: TEAM, name: 'Ana' });

    const doc = spanish('proceso-01');
    const put = (document: unknown, headers: Record<string, string>) => fetch(`${base}/teams/${TEAM}/texts/proceso-01`, { method: 'PUT', headers, body: JSON.stringify({ document, addedBy: 'Mallory' }) });
    expect((await put(doc, { 'Content-Type': 'application/json' })).status).toBe(401);
    const created = await put(doc, auth);
    expect(created.status).toBe(201);
    expect(((await created.json()) as { summary: { addedBy: string } }).summary.addedBy).toBe('Ana');
    expect((await put({ ...doc, title: 'Otra' }, auth)).status).toBe(409);
    // the full validator runs in the Node program
    const deep = { ...spanish('hondo'), sections: [{ paragraphs: [{ sentences: [{ text: 'Hola.', spans: [{ start: 0, end: 99, lemma: 'hola' }] }] }] }] };
    const refused = await fetch(`${base}/teams/${TEAM}/texts/hondo`, { method: 'PUT', headers: auth, body: JSON.stringify({ document: deep }) });
    expect(refused.status).toBe(422);
    const big = await fetch(`${base}/teams/${TEAM}/texts/grande`, { method: 'PUT', headers: auth, body: JSON.stringify({ document: { ...spanish('grande'), _padding: 'x'.repeat(2 * 1024 * 1024 + 10) } }) });
    expect(big.status).toBe(422);
    expect(((await big.json()) as { error: string }).error).toBe('too-large');
    const got = await fetch(`${base}/teams/${TEAM}/texts/proceso-01`);
    expect(JSON.stringify(((await got.json()) as { document: unknown }).document)).toBe(JSON.stringify(doc));

    // one line per request, never a body or a key
    await new Promise((r) => setTimeout(r, 200));
    expect(out).toMatch(/PUT \/teams\/honduras-es\/texts\/proceso-01 201 \d+ms/);
    expect(out + err).not.toContain(ANA_KEY);
    expect(out).not.toContain('El viajero');

    const exited = new Promise<void>((r) => child!.once('exit', () => r()));
    child.kill();
    await exited;
    expect(existsSync(join(data, STORE_FILE))).toBe(true);
    expect(existsSync(join(data, 'team-codes.json'))).toBe(false);
  }, 20_000);
});
