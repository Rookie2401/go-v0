# Backups, off the box, and restoring them

Written 2026-10-17. Tools: `scripts/ops/backup.mts`, `scripts/ops/restore.mts`, the units `infra/repository/go-repository-backup.service` and `.timer`. Tests: `test/repository/ops/ops.test.ts`.

## What a backup is

| Store | How | File |
|---|---|---|
| SQLite | `VACUUM INTO` a snapshot through a **read-only** connection (consistent while the service keeps writing; never copy `repository.sqlite` alone while it runs), `PRAGMA integrity_check` on the snapshot, then gzip | `repository-sqlite-20261018T030711Z.sqlite.gz` |
| Postgres (`DATABASE_URL` set) | `pg_dump --no-owner --no-privileges` (plain SQL), gzip. Needs `pg_dump` on the PATH (`PG_DUMP` overrides the name). The password is passed to the tool in `PG*` environment variables, never on its command line | `repository-postgres-…sql.gz` |

Each backup gets `<file>.sha256` beside it (`<hash>  <name>`), and optionally encryption: with `BACKUP_PASSPHRASE` the gzip is sealed with AES-256-GCM (key from the passphrase by scrypt, N=2^15; file = magic, salt, iv, ciphertext, tag) and the name ends `.gz.enc`. **Keep the passphrase somewhere that is not the server**; without it an encrypted backup is unreadable by design. A wrong passphrase and a changed byte are both refused with no output written.

Backups contain everything: password hashes (scrypt), learners' events and private documents. Treat the files and the bucket as sensitive: encrypt, restrict access, no public buckets.

## Off the box

A backup next to the database dies with the disk. After writing, `backup.mts` sends the file (and its `.sha256`) off the machine, by either or both of:

1. **S3-compatible bucket**, no SDK needed (`@aws-sdk/client-s3` is not in `node_modules`; the script signs a single AWS-SigV4 `PUT` itself, path-style, so it works on AWS S3, Cloudflare R2, Backblaze B2, MinIO, Wasabi). Set all four:
   `BACKUP_S3_ENDPOINT` (https://, for R2: `https://<account-id>.r2.cloudflarestorage.com`), `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`; optional `BACKUP_S3_REGION` (default `auto`; AWS needs the real region, e.g. `eu-central-1`) and `BACKUP_S3_PREFIX` (default `go-repository/`). Use a key that can only write to this bucket. Give the bucket a lifecycle rule (for example expire after 90 days) and, if offered, object lock/versioning so a compromised server cannot erase history. The signature code is checked against the published AWS test vector; the first real upload against your provider is the one thing this repository cannot test for you (see "What was verified").
2. **A hook**: `BACKUP_UPLOAD_CMD` is run through the shell with the backup path appended as the last argument. Examples (the `--` after the quoted script fills `$0`, so the path arrives as `$1`): `sh -c 'rclone copyto "$1" remote:go-backups/"$(basename "$1")"' --`; `sh -c 'scp "$1" backup@other-host:/srv/go-backups/' --`; and, to be told when backups stop, end with a dead-man ping: `sh -c 'rclone copyto "$1" remote:go-backups/"$(basename "$1")" && curl -fsS https://hc-ping.com/<your-uuid> >/dev/null' --`.

A failed upload or hook makes the command exit non-zero, so `systemctl status go-repository-backup` and `journalctl -u go-repository-backup` show it. With nothing configured the script prints a warning ("nothing was uploaded off this machine").

## Retention

Local files in `--out` are pruned after each backup: the newest backup of each of the last **7 days** (UTC; today counts) and of each of the last **4 weeks** (Monday start), plus always the single newest. Override with `BACKUP_KEEP_DAILY` / `BACKUP_KEEP_WEEKLY` or `--keep-daily` / `--keep-weekly`. Only files named like backups are ever touched. The bucket has its own retention (lifecycle rule): the script never deletes remote objects.

## Schedule

```sh
sudo install -d -o go-repository -g go-repository -m 0700 /var/backups/go-repository
sudo cp infra/repository/go-repository-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now go-repository-backup.timer
systemctl list-timers go-repository-backup.timer      # next run
sudo systemctl start go-repository-backup.service      # run one now
journalctl -u go-repository-backup -n 20 --no-pager
```

Daily at 02:30 UTC (`Persistent=true`: a missed run happens at the next boot). The settings come from `/etc/go-repository/env` (`BACKUP_*`, `DATABASE_URL`).

## Restoring

```sh
# 1. Always first: verify. Checksum, decrypt, integrity check, and open it with THIS build's store (which refuses a database newer than the code). Touches nothing.
npx vite-node --config scripts/vite.config.ts scripts/ops/restore.mts -- --file /var/backups/go-repository/repository-sqlite-….sqlite.gz --verify-only
# 2. SQLite: stop the service, restore into the data directory. It refuses to overwrite; --force keeps the old file beside it as repository.sqlite.before-restore-<time>
#    and deletes the old -wal/-shm (a log of the old database must never be replayed onto the new one).
sudo systemctl stop go-repository
sudo -u go-repository npx vite-node --config scripts/vite.config.ts scripts/ops/restore.mts -- --file …gz --data /var/lib/go-repository [--force]
sudo systemctl start go-repository
curl -s http://127.0.0.1:8790/health
```

Postgres: `DATABASE_URL=postgres://… restore.mts -- --file repository-postgres-….sql.gz` loads the dump with `psql --single-transaction -v ON_ERROR_STOP=1` into an **empty** database (it refuses one that already has a Go Repository schema unless `--force`, after a backup of it), then opens the store (which applies any newer migrations) and prints the counts. Needs `psql` on the PATH (`PSQL` overrides the name). An encrypted backup needs `BACKUP_PASSPHRASE` in the environment. `--mark-ready` also writes the `.migration-ready` sentinel (SQLite) or the `migration-ready` row in `service_state` (Postgres) that the Render/hosted start-up gate waits for.

What a restore gives back: every row at the moment of the snapshot. Events recorded after it are not in it; devices still hold them in their queues and push them again (pushes are idempotent on event id), so after a restore the clients heal by syncing. Sequence numbers continue from the restored head and are never reused. Sessions in the backup are valid again (until they expire), so devices stay signed in.

## The restore drill, run on 2026-10-17 on a copy of the live data

On the owner's PC, from `data/local-repository` (the running service's database, read through a read-only snapshot; the live files were not modified):

```
backup.mts --data data/local-repository --out <scratch>/backups
  backup: snapshot taken and checked: 21 tables, schema version 3
  backup: wrote repository-sqlite-20261018T030711Z.sqlite.gz (704962 bytes, sha256 cc6e8452eecd…)        (7.4 MB database + 4.3 MB log -> 0.7 MB; 1.7 s including start-up)
restore.mts --file … --verify-only
  restore: checksum matches / integrity check ok: 21 tables, schema version 3
  verified: learners 5, accounts 5, eventsIssued 2601
restore.mts --file … --data <scratch>/restored
  restore: restored to …\restored\repository.sqlite
live      learners 5, accounts 5, sessions 27, events 2601, event_heads 4, documents 0, sum(head) 2601
restored  learners 5, accounts 5, sessions 27, events 2601, event_heads 4, documents 0, sum(head) 2601   (identical)
```

The restored copy was then started with the new service code (`main.ts --data <scratch>/restored`, port 8799, since stopped): it applied migration 004 to the copy, `GET /health` answered `{"ok":true,…,"store":"sqlite","migrations":4,…}`, `GET /metrics` from the same machine answered 200 with `go_repository_events_issued_total 2601`, and a new account on it could sign in. The live service on 8790 and its database were not touched.

The same drill runs in the test suite on every change (`test/repository/ops/ops.test.ts`: "the restore drill"), including the backup being taken while a second connection holds the database open and keeps writing, a damaged file being refused by its checksum, `--force` keeping the old file aside, and encrypted backups.

**Do this drill again on the server after every change of host, and once a quarter**: a backup nobody has restored is a hope.

## What was verified, and what could not be

* SQLite backup, checksum, encryption, retention, restore, `--force`, the hook, the S3 request shape and signature (against AWS's published `get-vanilla` vector): tested.
* `pg_dump` / `psql` paths: the code is small and only builds the command and the `PG*` environment (tested); it was **not run against a real server** because this PC has no Postgres or `pg_dump`. Run the drill on the first Postgres deployment: `backup.mts`, then `restore.mts` into a scratch database, compare `learners`/`events` counts.
* A real upload to your bucket: needs your bucket and keys.
