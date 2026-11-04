// @vitest-environment node
/**
 * A backup that fails must show (the readiness audit of 2026-11-03, D1, D3: failures were only a log line, off-site upload was silently absent, and a full
 * disk took backups first and writes next). `/health` also tests the database now.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { backupHealth, durabilityOf } from '../../../packages/repository-service/src/backupHealth';
import { BACKUP_STATUS_FILE, classifyBackupError, readBackupStatus, runBackup, writeBackupStatus } from '../../../scripts/ops/lib.mts';
import { openSqliteStore, createMemoryStore } from '../../../packages/repository-store/src';
import { handle } from '../../../packages/repository-service/src/handler';
import { createClock, createFakeCrypto, createFakeEngine, createFakeLinguistics } from '../service/fakes';

const NOW = Date.parse('2026-11-03T12:00:00.000Z');
const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();
const tmp = mkdtempSync(join(tmpdir(), 'durability-'));
afterAll(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* locked on Windows */ } });

describe('what /health says about the backups', () => {
  const ok = { ok: true, lastOkAt: iso(NOW - DAY), offsite: true, encrypted: true };

  it('ok, off-site and encrypted', () => {
    expect(durabilityOf(ok, 60, NOW)).toEqual({ backup: 'ok', lastBackupAt: iso(NOW - DAY), offsite: true, encrypted: true, disk: 'ok', diskFreePct: 60 });
  });
  it('a backup that stayed on this disk says so', () => {
    expect(durabilityOf({ ...ok, offsite: false, encrypted: false }, 60, NOW)).toMatchObject({ backup: 'ok', offsite: false, encrypted: false });
  });
  it('a failure shows, with why, and keeps the last good time', () => {
    expect(durabilityOf({ ok: false, lastOkAt: iso(NOW - DAY), error: 'upload-failed', offsite: true }, 60, NOW)).toMatchObject({ backup: 'failed', backupError: 'upload-failed', lastBackupAt: iso(NOW - DAY) });
  });
  it('a job that stopped running shows as overdue, even though its last run was fine', () => {
    expect(durabilityOf({ ...ok, lastOkAt: iso(NOW - 3 * DAY) }, 60, NOW).backup).toBe('overdue');
  });
  it('never run, and a filling disk', () => {
    expect(durabilityOf(undefined, 20, NOW)).toEqual({ backup: 'none', offsite: false, encrypted: false, disk: 'low', diskFreePct: 20 });
    expect(durabilityOf(undefined, undefined, NOW).disk).toBe('unknown');
  });
  it('reads the status file beside the backups and gives no path or size', () => {
    const data = join(tmp, 'read');
    writeBackupStatus(join(data, 'backups'), { at: iso(NOW), ok: true, lastOkAt: iso(NOW), offsite: false, encrypted: false, bytes: 123 });
    const out = backupHealth(data, NOW);
    expect(out.backup).toBe('ok');
    expect(out.disk).not.toBe('unknown');
    expect(JSON.stringify(out)).not.toMatch(/durability-|backups|123\b/);
    expect(backupHealth(join(tmp, 'missing'), NOW).backup).toBe('none');
  });
});

describe('the backup job records what happened', () => {
  it('names the reason without a path or a credential', () => {
    expect(classifyBackupError(Object.assign(new Error('x'), { code: 'ENOSPC' }))).toBe('disk-full');
    expect(classifyBackupError(Object.assign(new Error('x'), { stage: 'upload' }))).toBe('upload-failed');
    expect(classifyBackupError(new Error('/secret/path'))).toBe('failed');
  });

  it('a failed upload is an upload failure: the local copy is still written', async () => {
    const data = join(tmp, 'up-data'), out = join(tmp, 'up-out');
    mkdirSync(data, { recursive: true });
    const s = openSqliteStore(join(data, 'repository.sqlite'));
    await s.close();
    const bad = join(tmp, 'fail.cjs');
    writeFileSync(bad, 'process.exit(3)');
    const error = await runBackup({ dataDir: data, outDir: out, keepDaily: 3, keepWeekly: 1, uploadCmd: `${JSON.stringify(process.execPath)} ${JSON.stringify(bad)}` }).catch((e: unknown) => e);
    expect(classifyBackupError(error)).toBe('upload-failed');
    writeBackupStatus(out, { at: iso(NOW), ok: false, offsite: true, encrypted: false, error: 'upload-failed' });
    expect(readBackupStatus(out)).toMatchObject({ ok: false, error: 'upload-failed' });
    expect(readFileSync(join(out, BACKUP_STATUS_FILE), 'utf8')).not.toContain(tmp);
  });
});

describe('GET /health', () => {
  const deps = (over: object) => {
    const clock = createClock();
    const store = createMemoryStore({ now: clock.now });
    return { store, engine: createFakeEngine(store), linguistics: createFakeLinguistics(store, clock.now), crypto: createFakeCrypto(), now: clock.now, ...over };
  };
  const health = (d: ReturnType<typeof deps>) => handle(new Request('http://x/health'), d as never);

  it('answers 503 when the database cannot be read, so the host replaces the instance', async () => {
    const r = await health(deps({ info: { storeKind: 'sqlite', startedAt: Date.now(), schemaVersion: async () => { throw new Error('/var/data/gone'); } } }));
    expect(r.status).toBe(503);
    const text = await r.text();
    expect(JSON.parse(text)).toMatchObject({ ok: false, error: 'database-unavailable' });
    expect(text).not.toContain('/var/data');
  });

  it('carries how the backups stand, and stays up when that cannot be read', async () => {
    const up = await health(deps({ info: { storeKind: 'sqlite', startedAt: Date.now(), schemaVersion: async () => 4, durability: () => ({ backup: 'failed' }) } }));
    expect(up.status).toBe(200);
    expect(await up.json()).toMatchObject({ ok: true, durability: { backup: 'failed' } });
    const down = await health(deps({ info: { storeKind: 'sqlite', startedAt: Date.now(), schemaVersion: async () => 4, durability: () => { throw new Error('no'); } } }));
    expect(down.status).toBe(200);
  });
});
