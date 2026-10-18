import { createServer } from 'node:http';
import { existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

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

function launchRepositoryService() {
  const port = process.env.PORT ?? '10000';
  const data = process.env.REPOSITORY_DATA_DIR ?? '/var/data/repository';
  const viteNode = resolve('node_modules/.bin/vite-node');
  const child = spawn(viteNode, [
    '--config', 'server/goread/vite.config.ts',
    'packages/repository-service/src/main.ts',
    '--port', port, '--host', '0.0.0.0', '--data', data,
  ], { stdio: 'inherit' });

  const forwardSignal = (signal) => child.kill(signal);
  process.on('SIGTERM', forwardSignal);
  process.on('SIGINT', forwardSignal);
  return new Promise((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      process.off('SIGTERM', forwardSignal);
      process.off('SIGINT', forwardSignal);
      resolvePromise(code ?? (signal ? 1 : 0));
    });
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
