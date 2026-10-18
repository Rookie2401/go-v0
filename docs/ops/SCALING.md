# Scale: SQLite now, Postgres when it grows

Written 2026-10-17. The service has two stores behind one port (`RepositoryStore`): **SQLite** (default, unchanged) and **PostgreSQL** (selected by `DATABASE_URL=postgres://…`). They keep the same rules; one conformance suite runs against memory, SQLite and Postgres (`test/repository/store`), and the lifecycle tests of the account features run against all three.

## What SQLite can carry (guidance, not a benchmark)

One service process, one writer, WAL mode, on the local disk of one machine (never a network share). Every write holds the database's single write lock for a few milliseconds; reads do not block. The measurements in `docs/ecosystem/SYNC.md` (a push of one event 24 ms with 678 events in the log, 52 ms with 3,000; a batch of 200 events 120 to 390 ms) are on the owner's PC. A learner who is reading produces a push every few seconds at most, and the extension and the phone debounce and batch. On that evidence **a few hundred active learners on one modest VPS (2 vCPU, 4 GB, SSD) is within SQLite's range**; nothing here has been load-tested at that size, so treat the number as a planning figure and let the metrics tell you (below).

Expected sizes (an estimate, not a measurement): an event is about 800 bytes of JSON on the wire; with its indexes plan on roughly 1 to 2 KB stored, so a learner with 100,000 events is on the order of 100 to 200 MB. The owner's own 2,601 events sit in a 7.4 MB file today, a large part of it shared linguistic rows.

Limits that are structural, not tunable:

* **One process per database file.** The long-poll notifier and the sign-in / rate-limit counters are in memory; a second process on the same file would not wake the first one's waiters (they time out and report the truth) and would multiply the rate limits.
* **No replica, no point-in-time recovery**: the safety net is the backup (`docs/ops/BACKUP-RESTORE.md`), at most a day old with the daily timer (run it more often if a day of lost events is too much; the devices re-push what they hold, so the real loss window is smaller).
* **A restart is a short outage** (about 40 s to listen on the owner's PC while the linguistic modules load).

## When to move to Postgres

Move when **any** of these is true, in this order of urgency:

1. `histogram_quantile(0.95, … route="/sync/push")` stays above **500 ms** in the metrics for an hour of normal traffic, or the service logs `SQLITE_BUSY` / "database is locked" errors. (The write lock is the bottleneck.)
2. You need the database on a different machine from the app (a managed service with backups, replication and point-in-time recovery), so a lost VPS is a restart, not a restore.
3. You want zero-downtime deploys or more than one app instance. **Not solved by this change alone**: the notifier and limiter are still per process (see "Postgres, one app instance" below).
4. The file passes a few GB and the nightly snapshot takes minutes.

If none is true, stay on SQLite; it is the simpler thing to run and to back up.

## Postgres, one app instance

What it gives today: the database off the app box, managed backups and PITR from the provider, concurrent writers (the app takes a per-learner advisory lock, so two appends for one learner never interleave and sequence numbers stay consecutive), no single-writer ceiling. What it does not give yet: running **two** app instances. Long-poll wake-ups (`/sync/wait`) and the rate limiters are in process, so a second instance would hold waiters that a push to the first never wakes (they still time out after 25 s and report the truth) and would double every limit. The fix is `LISTEN/NOTIFY` for the notifier and a shared limiter; it is the next step, not done.

Requirements: PostgreSQL 13 or newer is expected to work (the SQL uses only features from PostgreSQL 11 on: `ON CONFLICT`, `jsonb_set`, `hashtextextended`); it is tested on PGlite, PostgreSQL 18 compiled to WebAssembly, with the whole conformance suite; and the same suite runs against a real server when `TEST_DATABASE_URL` is set). Create an empty database and a role that owns it:

```sql
CREATE ROLE go_repository LOGIN PASSWORD '…';
CREATE DATABASE go_repository OWNER go_repository;
```

The schema is `packages/repository-store/migrations-pg/NNN-*.sql`, applied on boot in order, each in a transaction, recorded in `schema_version` with a checksum (an edited applied file is refused; a database newer than the code is refused; an advisory lock lets two instances start together safely). Add a migration by adding the next numbered file; never edit an applied one. Text columns are `go_text` (`text COLLATE "C"`) so ordering equals SQLite's byte order; JSON columns are `jsonb`.

Settings: `DATABASE_URL`, `PGPOOL_MAX` (connections, default 10; one is held while a transaction runs). Use `?sslmode=require` for a remote server.

Known differences, none visible through the API:

* Postgres text cannot contain the NUL character (U+0000). A document body or event field that contains one is refused by the database (HTTP 500 with the SQLSTATE `22021`/`22P05` in the log). SQLite stored it.
* Physical erasure: SQLite zeroes freed pages (`secure_delete`) and truncates its log after a deletion. In Postgres a deleted row stays on disk as a dead tuple until autovacuum reclaims it, and in the write-ahead log and any physical backup until those age out. Deletion is logically immediate; physical removal follows within the autovacuum interval, and in provider backups after their retention period. `compact()` (`VACUUM (ANALYZE)`) forces the reclaim.
* The Prometheus metric `go_repository_store_size_bytes` is `pg_database_size` rather than the file size.

## Moving the data: SQLite to Postgres

`scripts/ops/migrate-sqlite-to-postgres.mts` copies a SQLite database into an **empty** Postgres one, verifies it, and commits only if everything matches. It reads a `VACUUM INTO` snapshot, so the running service is not disturbed, but writes after the snapshot are not copied: do the real run with the service stopped.

```sh
# 0. a backup first (and keep it): docs/ops/BACKUP-RESTORE.md
sudo -u go-repository npx vite-node --config scripts/vite.config.ts scripts/ops/backup.mts -- --data /var/lib/go-repository --out /var/backups/go-repository
# 1. rehearsal: copies, verifies, rolls back. Safe at any time.
export DATABASE_URL='postgres://go_repository:…@db.example.org:5432/go_repository?sslmode=require'
npx vite-node --config scripts/vite.config.ts scripts/ops/migrate-sqlite-to-postgres.mts -- --sqlite /var/lib/go-repository/repository.sqlite --dry-run
# 2. the real run, service stopped
sudo systemctl stop go-repository
npx vite-node --config scripts/vite.config.ts scripts/ops/migrate-sqlite-to-postgres.mts -- --sqlite /var/lib/go-repository/repository.sqlite --mark-ready
#    -> prints every table's row count on both sides, then COMMITTED: N learners, M events
# 3. point the service at it and start
echo "DATABASE_URL=$DATABASE_URL" | sudo tee -a /etc/go-repository/env >/dev/null
sudo systemctl start go-repository
curl -s http://127.0.0.1:8790/health        # "store":"postgres", "migrations":1
```

Rules it enforces: it **refuses a target that holds any row** (so a second run changes nothing and cannot overwrite a live database), the copy is one transaction, and it verifies before committing the row count of every table, each learner's event count, head sequence and sequence sum, the per-learner head sequences, and the sets of account, session and event ids (hash). Any difference rolls everything back and exits non-zero. Event sequence numbers are copied as they are, so every device's cursor stays valid. Keep the SQLite file and the backup until the Postgres deployment has run clean for a while; to go back, stop the service, unset `DATABASE_URL`, and start it on the SQLite file (events written since the move exist only in Postgres).

Tested end to end against PGlite (`test/repository/store/copy-to-postgres.test.ts`: full copy and equality of what both stores then serve, refusal on a second run and on a non-empty target, dry run, an older SQLite file). Not run against a real server on this PC (none installed); the first real run should be the `--dry-run`.
