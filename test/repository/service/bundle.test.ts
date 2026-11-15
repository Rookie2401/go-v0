// @vitest-environment node
/**
 * The service as Render runs it: compiled by infra/repository/bundle.mjs into one file and started with plain Node, no Vite in the process (2026-11-12:
 * under vite-node it held about 360 MB at rest on a 512 MB instance and ran out of memory several times a day). The whole account flow goes over real
 * HTTP, the migrations are found beside their sources, and the process stays well under the instance's memory.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRepositoryApi } from '../../../packages/repository-service/src/api';
import { makeEvent } from './fakes';
import { bundle, SERVICE_ENTRY } from '../../../infra/repository/bundle.mjs';

const root = resolve(__dirname, '../../..');
const outfile = `infra/repository/.build/test-${process.pid}.mjs`;
let child: ChildProcess | undefined;
let base = '';
let data = '';

beforeAll(async () => {
  await bundle({ entry: SERVICE_ENTRY, outfile, root });
  data = mkdtempSync(join(tmpdir(), 'go-bundle-'));
  child = spawn(process.execPath, [resolve(root, outfile), '--port', '0', '--host', '127.0.0.1', '--data', data], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, RATE_LIMIT: 'off', RENDER_GIT_COMMIT: 'abcdef1234567890' },
  });
  base = await new Promise<string>((ok, fail) => {
    let out = '';
    const timer = setTimeout(() => fail(new Error(`no listening line: ${out}`)), 20_000);
    child!.stdout!.on('data', (d: Buffer) => {
      out += d.toString();
      const m = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
      if (m) { clearTimeout(timer); ok(m[1]!); }
    });
    child!.stderr!.on('data', (d: Buffer) => { out += d.toString(); });
    child!.once('exit', (code) => { clearTimeout(timer); fail(new Error(`exited ${code}: ${out}`)); });
  });
}, 60_000);

afterAll(() => {
  child?.kill();
  rmSync(resolve(root, outfile), { force: true });
  rmSync(resolve(root, `${outfile}.map`), { force: true });
  try { rmSync(data, { recursive: true, force: true }); } catch { /* Windows may hold the database a moment longer */ }
});

describe('the bundled service', () => {
  it('runs every migration, from the files beside the sources', async () => {
    const health = await (await fetch(`${base}/health`)).json() as { ok: boolean; migrations: number; commit: string; store: string };
    const migrations = readdirSync(resolve(root, 'packages/repository-store/migrations')).filter((f) => f.endsWith('.sql')).length;
    expect(health).toMatchObject({ ok: true, store: 'sqlite', commit: 'abcdef123456', migrations });
  });

  it('signs up, writes, ranks, lists, exports and deletes over real HTTP', async () => {
    const api = createRepositoryApi({ baseUrl: base, fetch });
    const created = await api.createAccount({ email: 'ana@example.com', password: 'a long enough password' });
    expect(created.ok).toBe(true);
    expect((await api.createSession({ email: 'ana@example.com', password: 'a long enough password', deviceId: 'phone' })).ok).toBe(true);
    const enrol = await api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    if (!created.ok || !enrol.ok) throw new Error('setup failed');
    const who = { learnerId: created.data.learnerId, enrolmentId: enrol.data.enrolment.enrolmentId };
    expect((await api.syncPush({ deviceId: 'phone', clientTime: new Date().toISOString(), events: [makeEvent({ ...who, deviceId: 'phone' })] })).ok).toBe(true);
    const pulled = await api.syncPull({ deviceId: 'phone', afterSeq: 0 });
    expect(pulled.ok && pulled.data.events.map((e) => e.kind)).toEqual(['EnrolmentChanged', 'CardReviewed']);
    expect((await api.candidates(who.enrolmentId, 50)).ok).toBe(true);
    expect((await api.vocabulary({ languageId: 'sq' } as never)).ok).toBe(true);
    expect((await api.exportAll()).ok).toBe(true);
    expect((await api.deleteMe('ana@example.com')).ok).toBe(true);
    expect((await api.me()).ok).toBe(false);
  });

  it('holds well under the 512 MB instance', async () => {
    const metrics = await (await fetch(`${base}/metrics`)).text();
    const rss = Number(/process_resident_memory_bytes (\d+)/.exec(metrics)?.[1]);
    expect(rss).toBeGreaterThan(0);
    expect(rss).toBeLessThan(220 * 2 ** 20); // under vite-node this was about 360 MB before the first request
  });
});
