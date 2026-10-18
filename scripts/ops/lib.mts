/// <reference types="node" />
/**
 * Shared by the operator scripts (backup, restore, purge, migrate): argument parsing, backup file names and retention, hashing, optional encryption,
 * the SQLite snapshot, the pg_dump/psql plumbing, and a dependency-free S3 (SigV4) upload. Everything here is a plain function so the tests can drive it.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, openSync, readSync, closeSync, copyFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';

export type Log = (line: string) => void;
export const SQLITE_FILE = 'repository.sqlite';
export const READY_SENTINEL = '.migration-ready';

// ───────────────────────────── arguments ─────────────────────────────

export interface ArgSpec { flags: string[]; values: string[] }

/** `--flag` (boolean) and `--name value` / `--name=value` (string). Unknown arguments are an error. */
export function parseArgs(argv: readonly string[], spec: ArgSpec): { flags: Set<string>; values: Record<string, string> } {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue;
    const eq = a.indexOf('=');
    const name = a.startsWith('--') ? (eq > 0 ? a.slice(2, eq) : a.slice(2)) : '';
    if (spec.flags.includes(name) && eq < 0) flags.add(name);
    else if (spec.values.includes(name)) {
      const v = eq > 0 ? a.slice(eq + 1) : argv[++i];
      if (v === undefined) throw new Error(`--${name} needs a value`);
      values[name] = v;
    } else throw new Error(`unknown argument "${a}" (use ${[...spec.flags, ...spec.values].map((n) => `--${n}`).join(', ')})`);
  }
  return { flags, values };
}

export function wholeNumber(v: string | undefined, name: string, def: number): number {
  if (v === undefined) return def;
  if (!/^\d+$/.test(v)) throw new Error(`${name} must be a whole number, not "${v}"`);
  return Number(v);
}

// ───────────────────────────── names and retention ─────────────────────────────

export type BackupKind = 'sqlite' | 'postgres';

export const stampOf = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

/** `repository-sqlite-20261017T020000Z.sqlite.gz` (plus `.enc` when encrypted). */
export function backupName(kind: BackupKind, d: Date, encrypted: boolean): string {
  return `repository-${kind}-${stampOf(d)}.${kind === 'sqlite' ? 'sqlite' : 'sql'}.gz${encrypted ? '.enc' : ''}`;
}

const NAME = /^repository-(sqlite|postgres)-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.(sqlite|sql)\.gz(\.enc)?$/;
export interface ParsedBackup { name: string; kind: BackupKind; date: Date; encrypted: boolean }
export function parseBackupName(name: string): ParsedBackup | undefined {
  const m = NAME.exec(name);
  if (!m) return undefined;
  const date = new Date(Date.UTC(Number(m[2]), Number(m[3]) - 1, Number(m[4]), Number(m[5]), Number(m[6]), Number(m[7])));
  return { name, kind: m[1] as BackupKind, date, encrypted: m[9] !== undefined };
}

const DAY = 24 * 3600 * 1000;
const dayIndex = (d: Date): number => Math.floor(d.getTime() / DAY);
/** Weeks start on Monday (1970-01-05 was one). */
const weekIndex = (d: Date): number => Math.floor((dayIndex(d) - 4) / 7);

/**
 * Which backups to keep: the newest of each of the last `keepDaily` UTC days (today counts), the newest of each of the last `keepWeekly` weeks (Monday
 * start; this week counts), and always the single newest backup. Everything else may go. Newer-than-now files (a skewed clock) are kept.
 */
export function selectRetained(files: ParsedBackup[], now: Date, keepDaily: number, keepWeekly: number): Set<string> {
  const keep = new Set<string>();
  const newestFirst = [...files].sort((a, b) => b.date.getTime() - a.date.getTime());
  if (newestFirst[0]) keep.add(newestFirst[0].name);
  const days = new Set<number>();
  const weeks = new Set<number>();
  for (const f of newestFirst) {
    if (f.date.getTime() > now.getTime()) { keep.add(f.name); continue; }
    const di = dayIndex(f.date);
    if (dayIndex(now) - di < keepDaily && !days.has(di)) { days.add(di); keep.add(f.name); }
    const wi = weekIndex(f.date);
    if (weekIndex(now) - wi < keepWeekly && !weeks.has(wi)) { weeks.add(wi); keep.add(f.name); }
  }
  return keep;
}

// ───────────────────────────── hashing and encryption ─────────────────────────────

export async function sha256File(path: string): Promise<string> {
  const h = createHash('sha256');
  await pipeline(createReadStream(path), h);
  return h.digest('hex');
}

const MAGIC = Buffer.from('GOBK1\n');
const SALT = 16;
const IV = 12;
const TAG = 16;
const HEADER = MAGIC.length + SALT + IV;
const keyOf = (passphrase: string, salt: Buffer): Buffer => scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });

/** AES-256-GCM, key from the passphrase by scrypt. File: magic, salt, iv, ciphertext, tag. */
export async function encryptFile(src: string, dest: string, passphrase: string): Promise<void> {
  const salt = randomBytes(SALT);
  const iv = randomBytes(IV);
  const cipher = createCipheriv('aes-256-gcm', keyOf(passphrase, salt), iv);
  const out = createWriteStream(dest, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, salt, iv]));
  await pipeline(createReadStream(src), cipher, out, { end: false });
  await new Promise<void>((ok, fail) => out.end(cipher.getAuthTag(), (e?: Error | null) => (e ? fail(e) : ok())));
}

export async function decryptFile(src: string, dest: string, passphrase: string): Promise<void> {
  const size = statSync(src).size;
  if (size < HEADER + TAG) throw new Error('the file is too short to be an encrypted backup');
  const fd = openSync(src, 'r');
  const head = Buffer.alloc(HEADER);
  const tag = Buffer.alloc(TAG);
  try { readSync(fd, head, 0, HEADER, 0); readSync(fd, tag, 0, TAG, size - TAG); } finally { closeSync(fd); }
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('not an encrypted Go Repository backup (bad header)');
  const salt = head.subarray(MAGIC.length, MAGIC.length + SALT);
  const iv = head.subarray(MAGIC.length + SALT);
  const decipher = createDecipheriv('aes-256-gcm', keyOf(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(createReadStream(src, { start: HEADER, end: size - TAG - 1 }), decipher, createWriteStream(dest, { mode: 0o600 }));
  } catch {
    rmSync(dest, { force: true });
    throw new Error('could not decrypt the backup: wrong BACKUP_PASSPHRASE, or the file was changed');
  }
}

export async function gzipFile(src: string, dest: string): Promise<void> {
  await pipeline(createReadStream(src), createGzip({ level: 9 }), createWriteStream(dest, { mode: 0o600 }));
}
export async function gunzipFile(src: string, dest: string): Promise<void> {
  await pipeline(createReadStream(src), createGunzip(), createWriteStream(dest, { mode: 0o600 }));
}

// ───────────────────────────── SQLite ─────────────────────────────

/** A consistent copy of a live database (VACUUM INTO on a read-only connection; the writer is not stopped), checked before it is returned. */
export function snapshotSqlite(dbPath: string, outPath: string): { tables: number; schemaVersion: number } {
  if (!existsSync(dbPath)) throw new Error(`there is no database at ${dbPath}`);
  if (existsSync(outPath)) rmSync(outPath);
  const live = new DatabaseSync(dbPath, { readOnly: true });
  try { live.prepare('VACUUM INTO ?').run(outPath); } finally { live.close(); }
  return checkSqlite(outPath);
}

/** `PRAGMA integrity_check` and the schema version, on a file opened read-only. */
export function checkSqlite(path: string): { tables: number; schemaVersion: number } {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
    if (rows.length !== 1 || rows[0]!.integrity_check !== 'ok') throw new Error(`integrity check failed: ${rows.map((r) => r.integrity_check).slice(0, 3).join('; ')}`);
    const tables = Number((db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get() as { n: number }).n);
    const v = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
    if (v.v === null) throw new Error('the file has no schema_version rows: it is not a Go Repository database');
    return { tables, schemaVersion: Number(v.v) };
  } finally { db.close(); }
}

// ───────────────────────────── Postgres tools ─────────────────────────────

/** Connection settings as libpq environment variables, so a password never appears in a process list. */
export function pgEnv(url: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const u = new URL(url);
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw new Error('not a postgres:// URL');
  const env: NodeJS.ProcessEnv = { ...base, PGHOST: u.hostname, PGPORT: u.port || '5432', PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')) };
  if (u.username) env.PGUSER = decodeURIComponent(u.username);
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  const ssl = u.searchParams.get('sslmode');
  if (ssl) env.PGSSLMODE = ssl;
  return env;
}

/** pg_dump to a gzip file. The tool name can be overridden with PG_DUMP. */
export async function pgDumpGz(url: string, destGz: string): Promise<void> {
  const child = spawn(process.env.PG_DUMP || 'pg_dump', ['--no-owner', '--no-privileges', '--format=plain'], { env: pgEnv(url), stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });
  const exited = new Promise<number>((ok, fail) => { child.once('error', fail); child.once('close', (code) => ok(code ?? 1)); });
  const written = pipeline(child.stdout, createGzip({ level: 9 }), createWriteStream(destGz, { mode: 0o600 }));
  const [code] = await Promise.all([exited, written.catch((e) => { throw e; })]);
  if (code !== 0) { rmSync(destGz, { force: true }); throw new Error(`pg_dump failed (${code}): ${stderr.trim().split('\n').slice(-3).join(' | ')}`); }
}

/** psql reading a SQL file, in one transaction, stopping at the first error. The tool name can be overridden with PSQL. */
export function psqlFile(url: string, sqlPath: string): void {
  const r = spawnSync(process.env.PSQL || 'psql', ['--quiet', '--no-psqlrc', '--single-transaction', '-v', 'ON_ERROR_STOP=1', '-f', sqlPath], { env: pgEnv(url), encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`psql failed (${r.status}): ${(r.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
}

// ───────────────────────────── S3 (SigV4, no SDK) ─────────────────────────────

const hmac = (key: Buffer | string, data: string): Buffer => createHmac('sha256', key).update(data, 'utf8').digest();
const hex = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');
const encodeSegment = (s: string): string => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface SigV4Input {
  method: string;
  /** Already-encoded absolute path, e.g. `/bucket/key`. */
  path: string;
  query?: string;
  /** Lower-case header names; `host` and `x-amz-date` are required. */
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  service: string;
  accessKey: string;
  secretKey: string;
  amzDate: string;
}

/** AWS Signature Version 4: the Authorization header value, for the headers given. */
export function sigV4Authorization(i: SigV4Input): string {
  const names = Object.keys(i.headers).map((n) => n.toLowerCase()).sort();
  const canonicalHeaders = names.map((n) => `${n}:${i.headers[n]!.trim().replace(/\s+/g, ' ')}\n`).join('');
  const signedHeaders = names.join(';');
  const canonical = [i.method, i.path, i.query ?? '', canonicalHeaders, signedHeaders, i.payloadHash].join('\n');
  const date = i.amzDate.slice(0, 8);
  const scope = `${date}/${i.region}/${i.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', i.amzDate, scope, hex(canonical)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${i.secretKey}`, date), i.region), i.service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(toSign, 'utf8').digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${i.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

export interface S3Config { endpoint: string; bucket: string; accessKey: string; secretKey: string; region: string; prefix: string }

export function s3FromEnv(env: NodeJS.ProcessEnv): S3Config | undefined {
  if (!env.BACKUP_S3_ENDPOINT && !env.BACKUP_S3_BUCKET && !env.BACKUP_S3_ACCESS_KEY && !env.BACKUP_S3_SECRET_KEY) return undefined;
  for (const k of ['BACKUP_S3_ENDPOINT', 'BACKUP_S3_BUCKET', 'BACKUP_S3_ACCESS_KEY', 'BACKUP_S3_SECRET_KEY'] as const) if (!env[k]) throw new Error(`${k} is required for the S3 upload (set all four of BACKUP_S3_ENDPOINT, _BUCKET, _ACCESS_KEY, _SECRET_KEY)`);
  if (!/^https:\/\//i.test(env.BACKUP_S3_ENDPOINT!) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(env.BACKUP_S3_ENDPOINT!)) throw new Error('BACKUP_S3_ENDPOINT must be an https:// URL');
  return {
    endpoint: env.BACKUP_S3_ENDPOINT!.replace(/\/+$/, ''), bucket: env.BACKUP_S3_BUCKET!, accessKey: env.BACKUP_S3_ACCESS_KEY!, secretKey: env.BACKUP_S3_SECRET_KEY!,
    region: env.BACKUP_S3_REGION || 'auto', prefix: (env.BACKUP_S3_PREFIX ?? 'go-repository/').replace(/^\/+/, ''),
  };
}

/** PUT one object, path-style (works on S3, Cloudflare R2, Backblaze B2, MinIO, Wasabi). Reads the file into memory (backups are megabytes). */
export async function s3Put(cfg: S3Config, file: string, now: Date = new Date(), doFetch: typeof fetch = fetch): Promise<string> {
  const key = `${cfg.prefix}${basename(file)}`;
  const body = readFileSync(file);
  const url = new URL(`${cfg.endpoint}/${encodeSegment(cfg.bucket)}/${key.split('/').map(encodeSegment).join('/')}`);
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const payloadHash = hex(body);
  const headers = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const authorization = sigV4Authorization({ method: 'PUT', path: url.pathname, headers, payloadHash, region: cfg.region, service: 's3', accessKey: cfg.accessKey, secretKey: cfg.secretKey, amzDate });
  const res = await doFetch(url, { method: 'PUT', headers: { ...headers, authorization, 'content-length': String(body.length) }, body, signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok) throw new Error(`the S3 upload was refused: ${res.status}`);
  return `${cfg.bucket}/${key}`;
}

/** Runs BACKUP_UPLOAD_CMD with the file path as its last argument (for rclone, scp, restic, gsutil, `age | …`). */
export function runUploadHook(cmd: string, file: string): void {
  const r = spawnSync(`${cmd} "${file.replace(/"/g, '\\"')}"`, { shell: true, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`BACKUP_UPLOAD_CMD failed (${r.status ?? r.signal})`);
}

// ───────────────────────────── backup ─────────────────────────────

export interface BackupOptions {
  /** SQLite: the data directory holding repository.sqlite. */
  dataDir?: string;
  /** Postgres: when set, pg_dump is used and dataDir is ignored. */
  databaseUrl?: string;
  outDir: string;
  keepDaily: number;
  keepWeekly: number;
  passphrase?: string;
  s3?: S3Config;
  uploadCmd?: string;
  now?: Date;
  log?: Log;
  fetch?: typeof fetch;
}
export interface BackupResult { file: string; kind: BackupKind; bytes: number; sha256: string; encrypted: boolean; pruned: string[]; uploaded: string[]; schemaVersion?: number }

export async function runBackup(o: BackupOptions): Promise<BackupResult> {
  const log = o.log ?? ((): void => undefined);
  const now = o.now ?? new Date();
  const kind: BackupKind = o.databaseUrl ? 'postgres' : 'sqlite';
  mkdirSync(o.outDir, { recursive: true, mode: 0o700 });
  const work = join(o.outDir, `.work-${process.pid}-${Date.now()}`);
  mkdirSync(work, { recursive: true, mode: 0o700 });
  const name = backupName(kind, now, o.passphrase !== undefined);
  const final = join(o.outDir, name);
  let schemaVersion: number | undefined;
  try {
    const gz = join(work, 'dump.gz');
    if (kind === 'sqlite') {
      const dbPath = join(resolve(o.dataDir ?? 'data/repository'), SQLITE_FILE);
      const snap = join(work, 'snapshot.sqlite');
      const check = snapshotSqlite(dbPath, snap);
      schemaVersion = check.schemaVersion;
      log(`snapshot taken and checked: ${check.tables} tables, schema version ${check.schemaVersion}`);
      await gzipFile(snap, gz);
      rmSync(snap);
    } else {
      await pgDumpGz(o.databaseUrl!, gz);
      log('pg_dump finished');
    }
    if (o.passphrase !== undefined) {
      await encryptFile(gz, join(work, 'out'), o.passphrase);
      renameSync(join(work, 'out'), final);
    } else renameSync(gz, final);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const sha = await sha256File(final);
  writeFileSync(`${final}.sha256`, `${sha}  ${name}\n`, { mode: 0o600 });
  const bytes = statSync(final).size;
  log(`wrote ${name} (${bytes} bytes, sha256 ${sha.slice(0, 12)}…)`);

  const uploaded: string[] = [];
  if (o.s3) { uploaded.push(await s3Put(o.s3, final, now, o.fetch)); await s3Put(o.s3, `${final}.sha256`, now, o.fetch); log(`uploaded to s3://${uploaded[0]}`); }
  if (o.uploadCmd) { runUploadHook(o.uploadCmd, final); uploaded.push(`hook:${name}`); log('upload hook finished'); }

  const pruned = pruneBackups(o.outDir, now, o.keepDaily, o.keepWeekly, log);
  return { file: final, kind, bytes, sha256: sha, encrypted: o.passphrase !== undefined, pruned, uploaded, ...(schemaVersion !== undefined ? { schemaVersion } : {}) };
}

/** Deletes the local backups (and their .sha256) outside the retention set. Files that do not look like ours are never touched. */
export function pruneBackups(dir: string, now: Date, keepDaily: number, keepWeekly: number, log: Log = () => undefined): string[] {
  const files = readdirSync(dir).map(parseBackupName).filter((f): f is ParsedBackup => f !== undefined);
  const keep = selectRetained(files, now, keepDaily, keepWeekly);
  const gone: string[] = [];
  for (const f of files) {
    if (keep.has(f.name)) continue;
    rmSync(join(dir, f.name), { force: true });
    rmSync(join(dir, `${f.name}.sha256`), { force: true });
    gone.push(f.name);
    log(`pruned ${f.name}`);
  }
  return gone;
}

// ───────────────────────────── restore ─────────────────────────────

export interface RestoreOptions {
  file: string;
  dataDir?: string;
  databaseUrl?: string;
  passphrase?: string;
  /** Replace an existing database (the old file is kept beside it as `*.before-restore-<stamp>`). */
  force?: boolean;
  verifyOnly?: boolean;
  /** Write the `.migration-ready` sentinel (SQLite) or the `migration-ready` service-state row (Postgres) after verification. */
  markReady?: boolean;
  now?: Date;
  log?: Log;
}
export interface RestoreResult { kind: BackupKind; verified: true; restored: boolean; schemaVersion?: number; learners?: number; accounts?: number; eventsIssued?: number; target?: string; movedAside?: string }

export async function runRestore(o: RestoreOptions): Promise<RestoreResult> {
  const log = o.log ?? ((): void => undefined);
  const parsed = parseBackupName(basename(o.file));
  if (!parsed) throw new Error(`"${basename(o.file)}" is not a backup file name (repository-<sqlite|postgres>-<UTC time>.<sqlite|sql>.gz[.enc])`);
  if (!existsSync(o.file)) throw new Error(`there is no file ${o.file}`);
  const sidecar = `${o.file}.sha256`;
  if (existsSync(sidecar)) {
    const want = readFileSync(sidecar, 'utf8').trim().split(/\s+/)[0];
    const have = await sha256File(o.file);
    if (want !== have) throw new Error(`the checksum does not match ${basename(sidecar)}: the file is damaged or was changed`);
    log('checksum matches');
  } else log('no .sha256 beside the file; skipping the checksum check');
  if (parsed.encrypted && o.passphrase === undefined) throw new Error('the backup is encrypted: set BACKUP_PASSPHRASE');

  const work = join(dirname(resolve(o.file)), `.restore-${process.pid}-${Date.now()}`);
  mkdirSync(work, { recursive: true, mode: 0o700 });
  try {
    let gz = o.file;
    if (parsed.encrypted) { gz = join(work, 'dump.gz'); await decryptFile(o.file, gz, o.passphrase!); log('decrypted'); }
    const plain = join(work, parsed.kind === 'sqlite' ? 'restored.sqlite' : 'restored.sql');
    await gunzipFile(gz, plain);

    if (parsed.kind === 'sqlite') {
      const check = checkSqlite(plain);
      log(`integrity check ok: ${check.tables} tables, schema version ${check.schemaVersion}`);
      // open a throw-away copy with the real store: proves this build can read it (it refuses a database newer than the code) and gives the counts
      const probe = join(work, 'probe.sqlite');
      copyFileSync(plain, probe);
      const { openSqliteStore } = await import('../../packages/repository-store/src');
      const store = openSqliteStore(probe);
      const stats = await store.stats!();
      await store.close();
      const base = { kind: 'sqlite' as const, verified: true as const, schemaVersion: check.schemaVersion, learners: stats.learners, accounts: stats.accounts, eventsIssued: stats.eventsIssued };
      if (o.verifyOnly) return { ...base, restored: false };
      if (!o.dataDir) throw new Error('--data <dir> is required to restore (or use --verify-only)');
      const dir = resolve(o.dataDir);
      mkdirSync(dir, { recursive: true });
      const target = join(dir, SQLITE_FILE);
      let movedAside: string | undefined;
      if (existsSync(target)) {
        if (!o.force) throw new Error(`${target} already exists; refusing to overwrite it (use --force to keep it aside and restore over it)`);
        movedAside = `${target}.before-restore-${stampOf(o.now ?? new Date())}`;
        renameSync(target, movedAside);
      }
      for (const suffix of ['-wal', '-shm']) rmSync(`${target}${suffix}`, { force: true }); // a stale log from the old database must never be replayed onto the new one
      copyFileSync(plain, target);
      if (o.markReady) writeFileSync(join(dir, READY_SENTINEL), 'verified\n');
      log(`restored to ${target}`);
      return { ...base, restored: true, target, ...(movedAside ? { movedAside } : {}) };
    }

    // postgres
    if (!o.databaseUrl) throw new Error('--database-url (or DATABASE_URL) is required to restore a Postgres backup');
    if (o.verifyOnly) {
      const head = readFileSync(plain, { encoding: 'utf8', flag: 'r' }).slice(0, 4096);
      if (!/PostgreSQL database dump/.test(head)) throw new Error('the file does not look like a pg_dump (no "PostgreSQL database dump" header)');
      return { kind: 'postgres', verified: true, restored: false };
    }
    const stores = await import('../../packages/repository-store/src');
    const pool = await stores.createPgPool(o.databaseUrl, { max: 2 });
    try {
      const has = (await pool.query("SELECT to_regclass('schema_version') AS t")).rows[0]!.t;
      if (has && !o.force) throw new Error('the target database already has a Go Repository schema; refusing to restore over it (use --force, after taking a backup of it)');
    } finally { await pool.end(); }
    psqlFile(o.databaseUrl, plain);
    log('psql finished');
    const pool2 = await stores.createPgPool(o.databaseUrl, { max: 2 });
    const store = await stores.openPostgresStore(pool2); // applies any newer migrations and proves the schema is readable
    try {
      const stats = await store.stats!();
      if (o.markReady) await store.setServiceState!('migration-ready', 'verified');
      return { kind: 'postgres', verified: true, restored: true, schemaVersion: stats.schemaVersion, learners: stats.learners, accounts: stats.accounts, eventsIssued: stats.eventsIssued };
    } finally { await store.close(); }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
