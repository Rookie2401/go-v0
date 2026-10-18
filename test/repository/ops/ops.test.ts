// @vitest-environment node
/**
 * The operator tooling: backup (snapshot, gzip, encrypt, checksum, retention, upload hooks), restore (verify, refuse, keep aside) and the restore drill,
 * on real SQLite files. The Postgres paths (pg_dump, psql) need the tools and a server; their argument handling is covered here.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openSqliteStore } from '../../../packages/repository-store/src';
import {
  backupName, decryptFile, encryptFile, parseArgs, parseBackupName, pgEnv, pruneBackups, runBackup, runRestore, s3FromEnv, s3Put, selectRetained, sha256File, sigV4Authorization,
} from '../../../scripts/ops/lib.mts';
import { L1, L2, account, doc, ev } from '../store/fixtures';

const tmp = mkdtempSync(join(tmpdir(), 'ops-'));
afterAll(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* locked on Windows */ } });
let n = 0;
const dir = (label: string): string => { const d = join(tmp, `${label}-${++n}`); mkdirSync(d, { recursive: true }); return d; };

async function seed(dataDir: string): Promise<void> {
  const s = openSqliteStore(join(dataDir, 'repository.sqlite'));
  await s.putLearner({ learnerId: L1, createdAt: '2026-10-01T00:00:00.000Z' });
  await s.putLearner({ learnerId: L2, createdAt: '2026-10-01T00:00:00.000Z' });
  await s.putAccount({ ...account('a1', L1, 'ana@example.com'), verifiedAt: '2026-10-01T00:00:00.000Z' });
  await s.putAccount(account('a2', L2, 'bob@example.com'));
  await s.append(L1, [ev('e1'), ev('e2'), ev('e3')]);
  await s.append(L2, [ev('x1', { learnerId: L2 })]);
  await s.putDocument(doc(L1, 'd1', 'words'), 0);
  await s.close();
}

describe('names and retention', () => {
  it('round-trips a backup name', () => {
    const d = new Date(Date.UTC(2026, 9, 17, 2, 0, 5));
    expect(backupName('sqlite', d, false)).toBe('repository-sqlite-20261017T020005Z.sqlite.gz');
    expect(backupName('postgres', d, true)).toBe('repository-postgres-20261017T020005Z.sql.gz.enc');
    expect(parseBackupName('repository-postgres-20261017T020005Z.sql.gz.enc')).toMatchObject({ kind: 'postgres', encrypted: true, date: d });
    expect(parseBackupName('notes.txt')).toBeUndefined();
    expect(parseBackupName('repository-sqlite-20261017T020005Z.sqlite.gz.sha256')).toBeUndefined();
  });

  const at = (iso: string, kind: 'sqlite' = 'sqlite') => parseBackupName(backupName(kind, new Date(iso), false))!;

  it('keeps the newest of each of the last 7 days and of each of the last 4 weeks, and always the newest', () => {
    const now = new Date('2026-10-17T12:00:00Z'); // a Saturday
    const files = [
      '2026-10-17T02:00:00Z', '2026-10-17T10:00:00Z', // today: the later one stays
      '2026-10-16T02:00:00Z', '2026-10-15T02:00:00Z', '2026-10-14T02:00:00Z', '2026-10-13T02:00:00Z', '2026-10-12T02:00:00Z', '2026-10-11T02:00:00Z', // 7 days incl. today
      '2026-10-10T02:00:00Z', // 8 days ago, week of Oct 5: the newest in that week stays
      '2026-10-09T02:00:00Z', '2026-10-06T02:00:00Z',
      '2026-10-03T02:00:00Z', '2026-09-30T02:00:00Z', // week of Sep 28
      '2026-09-24T02:00:00Z', // week of Sep 21 (3 weeks back)
      '2026-09-10T02:00:00Z', // older than 4 weeks: goes
      '2026-08-01T02:00:00Z',
    ].map((d) => at(d));
    const keep = selectRetained(files, now, 7, 4);
    expect(keep.has(at('2026-10-17T10:00:00Z').name)).toBe(true);
    expect(keep.has(at('2026-10-17T02:00:00Z').name)).toBe(false); // the earlier backup of a day that has a later one
    for (const d of ['16', '15', '14', '13', '12', '11']) expect(keep.has(at(`2026-10-${d}T02:00:00Z`).name), d).toBe(true);
    expect(keep.has(at('2026-10-10T02:00:00Z').name)).toBe(false); // the week of Oct 5 is already held by Oct 11, its newest
    expect(keep.has(at('2026-10-09T02:00:00Z').name)).toBe(false);
    expect(keep.has(at('2026-10-06T02:00:00Z').name)).toBe(false);
    expect(keep.has(at('2026-10-03T02:00:00Z').name)).toBe(true); // newest of the week of Sep 28
    expect(keep.has(at('2026-09-30T02:00:00Z').name)).toBe(false);
    expect(keep.has(at('2026-09-24T02:00:00Z').name)).toBe(true); // newest of the week of Sep 21
    expect(keep.has(at('2026-09-10T02:00:00Z').name)).toBe(false);
    expect(keep.has(at('2026-08-01T02:00:00Z').name)).toBe(false);
  });

  it('keeps the single newest backup even when it is older than every window', () => {
    const keep = selectRetained([at('2025-01-01T00:00:00Z'), at('2025-01-02T00:00:00Z')], new Date('2026-10-17T00:00:00Z'), 7, 4);
    expect([...keep]).toEqual([backupName('sqlite', new Date('2025-01-02T00:00:00Z'), false)]);
  });

  it('prunes files and their checksums, and leaves anything that is not a backup alone', () => {
    const d = dir('prune');
    const old = backupName('sqlite', new Date('2026-06-01T02:00:00Z'), false);
    const recent = backupName('sqlite', new Date('2026-10-17T02:00:00Z'), false);
    for (const f of [old, `${old}.sha256`, recent, `${recent}.sha256`, 'notes.txt', 'repository-other.gz']) writeFileSync(join(d, f), 'x');
    const gone = pruneBackups(d, new Date('2026-10-17T12:00:00Z'), 7, 4);
    expect(gone).toEqual([old]);
    expect(readdirSync(d).sort()).toEqual([recent, `${recent}.sha256`, 'notes.txt', 'repository-other.gz'].sort());
  });
});

describe('arguments', () => {
  it('parses flags and values and refuses the unknown', () => {
    const r = parseArgs(['--data', 'x', '--force', '--out=y', '--'], { flags: ['force'], values: ['data', 'out'] });
    expect([r.flags.has('force'), r.values.data, r.values.out]).toEqual([true, 'x', 'y']);
    expect(() => parseArgs(['--nope'], { flags: [], values: [] })).toThrow(/unknown argument/);
    expect(() => parseArgs(['--data'], { flags: [], values: ['data'] })).toThrow(/needs a value/);
  });
  it('turns a postgres URL into libpq variables so the password stays out of the process list', () => {
    const env = pgEnv('postgres://go%40user:p%2Fss@db.example.org:6543/go_repo?sslmode=require', {});
    expect(env).toEqual({ PGHOST: 'db.example.org', PGPORT: '6543', PGDATABASE: 'go_repo', PGUSER: 'go@user', PGPASSWORD: 'p/ss', PGSSLMODE: 'require' });
    expect(() => pgEnv('mysql://x/y')).toThrow();
  });
});

describe('encryption', () => {
  it('round-trips, and refuses a wrong passphrase or a changed byte', async () => {
    const d = dir('enc');
    const plain = join(d, 'plain');
    writeFileSync(plain, Buffer.concat([Buffer.from('secret learner data '), Buffer.alloc(200_000, 7)]));
    await encryptFile(plain, join(d, 'cipher'), 'correct horse');
    const cipher = readFileSync(join(d, 'cipher'));
    expect(cipher.includes(Buffer.from('secret learner data'))).toBe(false);
    await decryptFile(join(d, 'cipher'), join(d, 'back'), 'correct horse');
    expect(readFileSync(join(d, 'back')).equals(readFileSync(plain))).toBe(true);
    await expect(decryptFile(join(d, 'cipher'), join(d, 'bad1'), 'wrong')).rejects.toThrow(/wrong BACKUP_PASSPHRASE/);
    expect(existsSync(join(d, 'bad1'))).toBe(false);
    const tampered = Buffer.from(cipher);
    tampered[100] = tampered[100]! ^ 1;
    writeFileSync(join(d, 'tampered'), tampered);
    await expect(decryptFile(join(d, 'tampered'), join(d, 'bad2'), 'correct horse')).rejects.toThrow(/changed/);
  }, 30_000);
});

describe('AWS Signature V4 (no SDK)', () => {
  it('reproduces the published "get-vanilla" test vector', () => {
    const auth = sigV4Authorization({
      method: 'GET', path: '/', headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      region: 'us-east-1', service: 'service', accessKey: 'AKIDEXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', amzDate: '20150830T123600Z',
    });
    expect(auth).toBe('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  });

  it('uploads with a signed path-style PUT and surfaces a refusal without the secret', async () => {
    const d = dir('s3');
    const file = join(d, 'repository-sqlite-20261017T020000Z.sqlite.gz');
    writeFileSync(file, 'backup bytes');
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const cfg = s3FromEnv({ BACKUP_S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com/', BACKUP_S3_BUCKET: 'go-backups', BACKUP_S3_ACCESS_KEY: 'AK', BACKUP_S3_SECRET_KEY: 'SECRET-VALUE' })!;
    const ok = await s3Put(cfg, file, new Date('2026-10-17T02:00:00Z'), (async (url: URL, init: RequestInit) => { seen.push({ url: String(url), init }); return new Response('', { status: 200 }); }) as unknown as typeof fetch);
    expect(ok).toBe('go-backups/go-repository/repository-sqlite-20261017T020000Z.sqlite.gz');
    expect(seen[0]!.url).toBe('https://acct.r2.cloudflarestorage.com/go-backups/go-repository/repository-sqlite-20261017T020000Z.sqlite.gz');
    const h = seen[0]!.init.headers as Record<string, string>;
    expect(h.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AK\/20261017\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(h['x-amz-date']).toBe('20261017T020000Z');
    expect(h['x-amz-content-sha256']).toBe(await sha256File(file));
    await expect(s3Put(cfg, file, new Date(), (async () => new Response('SECRET-VALUE denied', { status: 403 })) as unknown as typeof fetch)).rejects.toThrow(/^the S3 upload was refused: 403$/);
  });

  it('wants all four settings or none, and https', () => {
    expect(s3FromEnv({})).toBeUndefined();
    expect(() => s3FromEnv({ BACKUP_S3_BUCKET: 'b' })).toThrow(/BACKUP_S3_ENDPOINT is required/);
    expect(() => s3FromEnv({ BACKUP_S3_ENDPOINT: 'http://s3.example.org', BACKUP_S3_BUCKET: 'b', BACKUP_S3_ACCESS_KEY: 'a', BACKUP_S3_SECRET_KEY: 's' })).toThrow(/https/);
  });
});

describe('backup and restore on real SQLite files', () => {
  it('the restore drill: back up a live database, lose it, restore it, and find every row', async () => {
    const live = dir('live');
    await seed(live);
    // keep a connection open as the running service would: the backup must not need the writer to stop
    const running = openSqliteStore(join(live, 'repository.sqlite'));
    const out = dir('backups');
    const logs: string[] = [];
    const r = await runBackup({ dataDir: live, outDir: out, keepDaily: 7, keepWeekly: 4, now: new Date('2026-10-17T02:00:00Z'), log: (l) => logs.push(l) });
    expect(r.kind).toBe('sqlite');
    expect(r.file.endsWith('repository-sqlite-20261017T020000Z.sqlite.gz')).toBe(true);
    expect(readFileSync(`${r.file}.sha256`, 'utf8')).toBe(`${r.sha256}  repository-sqlite-20261017T020000Z.sqlite.gz\n`);
    expect(r.schemaVersion).toBeGreaterThanOrEqual(4);
    expect(readdirSync(out).filter((f) => f.startsWith('.work'))).toEqual([]); // no scratch left behind
    // while the backup existed the live database kept accepting writes
    await running.append(L1, [ev('while-running')]);
    await running.close();

    // verify only
    const v = await runRestore({ file: r.file, verifyOnly: true });
    expect(v).toMatchObject({ kind: 'sqlite', verified: true, restored: false, learners: 2, accounts: 2, eventsIssued: 4 });

    // disaster: the data directory is gone
    const fresh = dir('fresh');
    const restored = await runRestore({ file: r.file, dataDir: fresh, markReady: true });
    expect(restored).toMatchObject({ restored: true, learners: 2, eventsIssued: 4 });
    expect(readFileSync(join(fresh, '.migration-ready'), 'utf8')).toBe('verified\n');
    const store = openSqliteStore(join(fresh, 'repository.sqlite'));
    expect((await store.list({ learnerId: L1 })).map((e) => e.id)).toEqual(['e1', 'e2', 'e3']); // the write after the snapshot is not in it, nothing before it is missing
    expect(await store.head(L1)).toBe(3);
    expect(await store.head(L2)).toBe(1);
    expect((await store.getDocument(L1, 'd1'))?.body).toBe('words');
    expect((await store.getAccountByEmail('ana@example.com'))?.verifiedAt).toBe('2026-10-01T00:00:00.000Z');
    await store.append(L1, [ev('after-restore')]);
    expect((await store.get(L1, 'after-restore'))?.seq).toBe(4); // sequence numbers continue, never reused
    await store.close();
  });

  it('refuses to overwrite a database, and with --force keeps the old one aside and drops its stale log', async () => {
    const live = dir('live');
    await seed(live);
    const out = dir('backups');
    const r = await runBackup({ dataDir: live, outDir: out, keepDaily: 7, keepWeekly: 4 });
    await expect(runRestore({ file: r.file, dataDir: live })).rejects.toThrow(/already exists/);
    writeFileSync(join(live, 'repository.sqlite-wal'), 'stale'); // a log of the old database must never be replayed on the new one
    const forced = await runRestore({ file: r.file, dataDir: live, force: true, now: new Date('2026-10-17T03:00:00Z') });
    expect(forced.movedAside).toMatch(/repository\.sqlite\.before-restore-20261017T030000Z$/);
    expect(existsSync(forced.movedAside!)).toBe(true);
    expect(existsSync(join(live, 'repository.sqlite-wal'))).toBe(false);
    const s = openSqliteStore(join(live, 'repository.sqlite'));
    expect(await s.head(L1)).toBe(3);
    await s.close();
  });

  it('detects a damaged file by its checksum, before anything is touched', async () => {
    const live = dir('live');
    await seed(live);
    const out = dir('backups');
    const r = await runBackup({ dataDir: live, outDir: out, keepDaily: 7, keepWeekly: 4 });
    const bytes = readFileSync(r.file);
    bytes[Math.floor(bytes.length / 2)] = bytes[Math.floor(bytes.length / 2)]! ^ 0xff;
    writeFileSync(r.file, bytes);
    const target = dir('target');
    await expect(runRestore({ file: r.file, dataDir: target })).rejects.toThrow(/checksum does not match/);
    expect(existsSync(join(target, 'repository.sqlite'))).toBe(false);
  });

  it('encrypted backups: the file reveals nothing, restore needs the passphrase, and the drill still works', async () => {
    const live = dir('live');
    await seed(live);
    const out = dir('backups');
    const r = await runBackup({ dataDir: live, outDir: out, keepDaily: 7, keepWeekly: 4, passphrase: 'a long passphrase' });
    expect(r.encrypted).toBe(true);
    expect(r.file.endsWith('.gz.enc')).toBe(true);
    expect(readFileSync(r.file).includes(Buffer.from('SQLite format 3'))).toBe(false);
    await expect(runRestore({ file: r.file, verifyOnly: true })).rejects.toThrow(/BACKUP_PASSPHRASE/);
    await expect(runRestore({ file: r.file, verifyOnly: true, passphrase: 'not it' })).rejects.toThrow(/could not decrypt/);
    const fresh = dir('fresh');
    expect(await runRestore({ file: r.file, dataDir: fresh, passphrase: 'a long passphrase' })).toMatchObject({ restored: true, eventsIssued: 4 });
  }, 30_000);

  it('prunes old backups after a new one and reports an upload hook failure', async () => {
    const live = dir('live');
    await seed(live);
    const out = dir('backups');
    for (const iso of ['2026-05-01T02:00:00Z', '2026-05-02T02:00:00Z']) {
      const name = backupName('sqlite', new Date(iso), false);
      writeFileSync(join(out, name), 'old');
      writeFileSync(join(out, `${name}.sha256`), 'x');
    }
    const r = await runBackup({ dataDir: live, outDir: out, keepDaily: 7, keepWeekly: 4, now: new Date('2026-10-17T02:00:00Z') });
    expect(r.pruned).toHaveLength(2);
    expect(readdirSync(out).sort()).toEqual([basenameOf(r.file), `${basenameOf(r.file)}.sha256`].sort());
    const hookFile = join(dir('hook'), 'hook.cjs');
    const log = join(dirname2(hookFile), 'uploaded.txt');
    writeFileSync(hookFile, `require('fs').appendFileSync(${JSON.stringify(log)}, process.argv[2] + '\\n'); process.exit(process.env.FAIL_HOOK ? 3 : 0);`);
    const withHook = await runBackup({ dataDir: live, outDir: out, keepDaily: 7, keepWeekly: 4, now: new Date('2026-10-17T03:00:00Z'), uploadCmd: `node "${hookFile}"` });
    expect(withHook.uploaded).toHaveLength(1);
    expect(readFileSync(log, 'utf8').trim()).toBe(withHook.file);
    process.env.FAIL_HOOK = '1';
    try {
      await expect(runBackup({ dataDir: live, outDir: out, keepDaily: 7, keepWeekly: 4, now: new Date('2026-10-17T04:00:00Z'), uploadCmd: `node "${hookFile}"` })).rejects.toThrow(/BACKUP_UPLOAD_CMD failed/);
    } finally { delete process.env.FAIL_HOOK; }
  });

  it('says plainly when there is nothing to back up or the file is not a backup', async () => {
    await expect(runBackup({ dataDir: dir('empty'), outDir: dir('o'), keepDaily: 7, keepWeekly: 4 })).rejects.toThrow(/no database at/);
    await expect(runRestore({ file: join(dir('x'), 'random.gz'), verifyOnly: true })).rejects.toThrow(/not a backup file name/);
    await expect(runRestore({ file: join(dir('x'), backupName('sqlite', new Date(), false)), verifyOnly: true })).rejects.toThrow(/no file/);
  });
});

function basenameOf(p: string): string { return p.split(/[\\/]/).pop()!; }
function dirname2(p: string): string { return p.replace(/[\\/][^\\/]*$/, ''); }
