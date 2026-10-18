// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMigrationGate } from '../../../infra/repository/render-start.mjs';

describe('Render repository migration startup gate', () => {
  let directory: string | undefined;
  let gate: Awaited<ReturnType<typeof startMigrationGate>> | undefined;

  afterEach(async () => {
    await gate?.close();
    gate = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it('keeps API routes closed until both the restored database and readiness marker exist', async () => {
    directory = await mkdtemp(join(tmpdir(), 'repository-render-gate-'));
    let launches = 0;
    gate = await startMigrationGate({
      dataDir: directory,
      port: 0,
      host: '127.0.0.1',
      pollIntervalMs: 10,
      launchService: async () => { launches++; return 0; },
    });
    const address = gate.server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not bind a TCP port');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, service: 'migration-pending' });
    const api = await fetch(`${baseUrl}/sync/push`, { method: 'POST', body: '{}' });
    expect(api.status).toBe(503);
    expect(await api.json()).toEqual({ ok: false, error: 'repository-migration-pending' });
    expect(launches).toBe(0);

    await writeFile(join(directory, '.migration-ready'), 'verified\n');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));
    expect(launches).toBe(0); // A marker alone can never start an empty service.

    await writeFile(join(directory, 'repository.sqlite'), 'disposable test fixture');
    await expect(gate.launched).resolves.toBe(0);
    expect(launches).toBe(1);
    expect(gate.server.listening).toBe(false);
  });

  it('with a custom readiness check (Postgres: a service_state row) it starts exactly when the check says so, and a throwing check is "not yet"', async () => {
    let ready = false;
    let calls = 0;
    let launches = 0;
    gate = await startMigrationGate({
      dataDir: '/nonexistent',
      port: 0,
      host: '127.0.0.1',
      pollIntervalMs: 10,
      launchService: async () => { launches++; return 0; },
      isReady: async () => { calls++; if (calls === 2) throw new Error('database unreachable'); return ready; },
    });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 60));
    expect(launches).toBe(0);
    expect(calls).toBeGreaterThan(2);
    ready = true;
    await expect(gate.launched).resolves.toBe(0);
    expect(launches).toBe(1);
  });
});
