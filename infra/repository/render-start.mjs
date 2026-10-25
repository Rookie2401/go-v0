import { createServer } from 'node:http';
import { existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BACKUP_DELAY_MS = 60 * 1000;

/**
 * Serve a deliberately limited health endpoint until a restored DB and sentinel are present.
 * `isReady` replaces that check (it may be async): with Postgres the "database" is a server and the sentinel is a row, so main() passes a function
 * that reads `service_state.migration-ready` (written by scripts/ops/migrate-sqlite-to-postgres.mts --mark-ready or restore.mts --mark-ready).
 */
export async function startMigrationGate({ dataDir, port, host = '0.0.0.0', pollIntervalMs = 1000, launchService, isReady }) {
  const root = resolve(dataDir);
  const database = join(root, 'repository.sqlite');
  const sentinel = join(root, '.migration-ready');
  let started = false;
  let timer;
  let resolveLaunched;
  let rejectLaunched;
  const launched = new Promise((resolvePromise, rejectPromise) => {
    resolveLaunched = resolvePromise;
    rejectLaunched = rejectPromise;
  });

  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    if (request.method === 'GET' && new URL(request.url ?? '/', 'http://localhost').pathname === '/health') {
      response.writeHead(200);
      response.end(JSON.stringify({ ok: true, service: 'migration-pending' }));
      return;
    }
    response.writeHead(503);
    response.end(JSON.stringify({ ok: false, error: 'repository-migration-pending' }));
  });

  const listening = new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, resolveListen);
  });
  await listening;

  const filesReady = () => {
    if (!existsSync(sentinel) || !existsSync(database)) return false;
    try {
      return statSync(database).isFile();
    } catch {
      return false;
    }
  };
  let checking = false;
  const checkReady = async () => {
    if (started || checking) return;
    checking = true;
    let ready = false;
    try { ready = await (isReady ?? filesReady)(); } catch { ready = false; } finally { checking = false; }
    if (!ready || started) return;
    started = true;
    clearInterval(timer);
    server.close(async (error) => {
      if (error) {
        rejectLaunched(error);
        return;
      }
      try {
        resolveLaunched(await launchService());
      } catch (launchError) {
        rejectLaunched(launchError);
      }
    });
    server.closeAllConnections();
  };
  timer = setInterval(() => { void checkReady(); }, pollIntervalMs);
  timer.unref();
  void checkReady();

  return {
    server,
    launched,
    close: async () => {
      clearInterval(timer);
      if (!server.listening) return;
      await new Promise((resolveClose) => {
        server.close(() => resolveClose());
        server.closeAllConnections();
      });
    },
  };
}

/** Start a single-flight backup loop. The first run is delayed until after service readiness; logs never include paths or child output. */
export function startBackupScheduler({ intervalMs = DAY_MS, initialDelayMs = DEFAULT_BACKUP_DELAY_MS, runBackup, onResult = reportBackupResult }) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 2_147_483_647) throw new Error('backup interval must be a positive whole number of milliseconds no greater than 2147483647');
  if (!Number.isSafeInteger(initialDelayMs) || initialDelayMs < 0 || initialDelayMs > 2_147_483_647) throw new Error('backup initial delay must be a non-negative whole number of milliseconds no greater than 2147483647');
  if (typeof runBackup !== 'function') throw new Error('backup runner is required');

  let timer;
  let active;
  let closed = false;
  const schedule = (delay) => {
    if (closed) return;
    timer = setTimeout(() => {
      timer = undefined;
      void runOnce();
    }, delay);
    timer.unref?.();
  };
  const runOnce = async () => {
    if (closed || active) return;
    let operation;
    try {
      operation = runBackup();
      active = operation;
      const result = await operation.done;
      onResult(result);
    } catch {
      onResult({ ok: false, reason: 'runner-error' });
    } finally {
      active = undefined;
      if (!closed) schedule(intervalMs);
    }
  };
  schedule(initialDelayMs);

  return {
    close: async () => {
      if (closed) return;
      closed = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (active) {
        active.stop?.();
        await active.done.catch(() => undefined);
      }
    },
  };
}

function reportBackupResult(result) {
  if (result?.ok) console.log('repository backup: completed');
  else if (Number.isInteger(result?.code)) console.error(`repository backup: failed (exit ${result.code})`);
  else if (typeof result?.signal === 'string' && /^SIG[A-Z0-9]+$/.test(result.signal)) console.error(`repository backup: failed (${result.signal})`);
  else console.error('repository backup: failed');
}

function positiveIntervalFromEnv() {
  const value = process.env.REPOSITORY_BACKUP_INTERVAL_MS;
  if (value === undefined || value === '') return DAY_MS;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 60_000 || Number(value) > 2_147_483_647) {
    throw new Error('REPOSITORY_BACKUP_INTERVAL_MS must be a whole number from 60000 to 2147483647 milliseconds');
  }
  return Number(value);
}

function runRepositoryBackup({ dataDir, backupDir }) {
  const child = spawn(process.execPath, [
    '--experimental-strip-types',
    resolve('scripts/ops/backup.mts'),
    '--data', dataDir,
    '--out', backupDir,
    '--keep-daily', '7',
    '--keep-weekly', '4',
  ], { stdio: 'ignore', env: process.env });
  let settled = false;
  let forceTimer;
  let stopping = false;
  let resolveDone;
  const done = new Promise((resolvePromise) => { resolveDone = resolvePromise; });
  const finish = (result) => {
    if (settled) return;
    settled = true;
    if (forceTimer) clearTimeout(forceTimer);
    resolveDone(result);
  };
  child.once('error', () => finish({ ok: false, reason: 'spawn-error' }));
  child.once('exit', (code, signal) => finish({ ok: code === 0, ...(code === null ? {} : { code }), ...(signal ? { signal } : {}) }));
  return {
    done,
    stop: () => {
      if (settled || stopping) return;
      stopping = true;
      child.kill('SIGTERM');
      forceTimer = setTimeout(() => { if (!settled) child.kill('SIGKILL'); }, 2000);
      forceTimer.unref?.();
    },
  };
}

async function waitForRepositoryHealth(port, childState) {
  const url = `http://127.0.0.1:${port}/health`;
  while (!childState.exited) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        const body = await response.json();
        if (body?.ok === true && body?.service === 'repository') return;
      }
    } catch { /* the service is still starting or the probe timed out */ }
    if (!childState.exited) await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
}

function launchRepositoryService() {
  const port = process.env.PORT ?? '10000';
  const data = process.env.REPOSITORY_DATA_DIR ?? '/var/data/repository';
  const backupIntervalMs = positiveIntervalFromEnv();
  const cli = resolve('node_modules/vite-node/dist/cli.mjs');
  const child = spawn(process.execPath, [
    cli,
    '--config', 'server/goread/vite.config.ts',
    'packages/repository-service/src/main.ts',
    '--port', port, '--host', '0.0.0.0', '--data', data,
  ], { stdio: 'inherit' });

  const forwardSignal = (signal) => child.kill(signal);
  process.on('SIGTERM', forwardSignal);
  process.on('SIGINT', forwardSignal);
  const state = { exited: false };
  let scheduler;
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const finish = (error, code, signal) => {
      if (settled) return;
      settled = true;
      state.exited = true;
      process.off('SIGTERM', forwardSignal);
      process.off('SIGINT', forwardSignal);
      void (async () => {
        await scheduler?.close();
        if (error) rejectPromise(error);
        else resolvePromise(code ?? (signal ? 1 : 0));
      })();
    };
    child.once('error', (error) => finish(error));
    child.once('exit', (code, signal) => finish(undefined, code, signal));
    void waitForRepositoryHealth(port, state).then(() => {
      if (state.exited) return;
      scheduler = startBackupScheduler({
        intervalMs: backupIntervalMs,
        runBackup: () => runRepositoryBackup({ dataDir: resolve(data), backupDir: join(resolve(data), 'backups') }),
      });
    }).catch((error) => finish(error));
  });
}

/** True once the Postgres store's `service_state` holds `migration-ready = verified`. A missing table or an unreachable server is "not yet". */
async function postgresReady(url) {
  let pool;
  try {
    const pg = await import('pg');
    const Pool = (pg.default ?? pg).Pool;
    pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 });
    const r = await pool.query("SELECT value FROM service_state WHERE key = 'migration-ready'");
    return r.rows[0]?.value === 'verified';
  } catch {
    return false;
  } finally {
    await pool?.end().catch(() => undefined);
  }
}

async function main() {
  const launchService = async () => {
    const exitCode = await launchRepositoryService();
    process.exitCode = exitCode;
  };
  if (process.env.REPOSITORY_MIGRATION_PENDING !== 'true') {
    await launchService();
    return;
  }

  const gate = await startMigrationGate({
    dataDir: process.env.REPOSITORY_DATA_DIR ?? '/var/data/repository',
    port: Number(process.env.PORT ?? 10000),
    host: '0.0.0.0',
    launchService,
    ...(process.env.DATABASE_URL ? { isReady: () => postgresReady(process.env.DATABASE_URL) } : {}),
  });
  const shutdown = () => { void gate.close().then(() => { process.exitCode = 0; }); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  await gate.launched;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`repository startup: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
