# Optional Render host for GoLearn and GoReview

This is a reviewed option for moving the Repository sync service off the owner’s PC. The Blueprint is `infra/repository/render.yaml`; in Render, set the Blueprint path to that file. It defines one paid Node web service, one 1 GB persistent disk, TLS, and manual deploys. **The Render service has not been provisioned and no production database has been uploaded.**

## Hosting plan

The Blueprint pins Node 24.21.0 and stores SQLite at `/var/data/repository/repository.sqlite` on the persistent disk. It binds to `0.0.0.0:$PORT`. Until a restored database and its readiness marker are present, `/health` answers with `service: "migration-pending"` and every application route returns 503. After a verified restore is marked ready, the existing repository service starts. The build installs the existing `vite-node` dependency with `npm ci --include=dev`.

After the restored service reports healthy, the startup wrapper waits one minute and then runs the existing `scripts/ops/backup.mts` tool daily. It takes a live, application-consistent SQLite snapshot, writes the archive and `.sha256` checksum under `/var/data/repository/backups`, and applies the existing retention of seven daily and four weekly backups. Runs do not overlap. `REPOSITORY_BACKUP_INTERVAL_MS` can override the daily interval (minimum 60,000 ms); leave it unset for daily backups. Logs report only success or a sanitized failure code, never archive paths or tool output. The job is not started while the migration gate is pending.

It uses one instance because sign-in throttles and long-poll notifications are process-local, and the disk can attach to only one service instance. Disk-backed deploys stop the old instance before starting the new one, so brief interruptions are expected. The service's 25-second `/sync/wait` request is below Render's documented HTTP response limit. Keep `TRUST_PROXY` off unless the forwarded-IP chain has been verified against the service's trust policy.

The proposed Starter plan provides 0.5 CPU and 512 MB RAM. The successful restore rehearsal below used about 203 MB resident memory while idle; that is a single idle measurement, not a load test or proof of headroom. Watch memory and CPU after cutover and increase the plan if observed workload needs it. The current cost estimate is **$7.25/month** ($7 Starter plus $0.25 for a 1 GB disk), before bandwidth or workspace overages. This estimate comes from Render's [Starter plan article](https://render.com/articles/best-railway-alternatives) and [disk pricing article](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses); confirm the actual price shown in the account before provisioning.

Render provides a default `onrender.com` address and TLS. For production, preserve the current canonical service address **`https://repo.golearn-global-languages.com`**: add that hostname as the Render custom domain and follow Render's DNS instructions to route it to the service. Render provisions TLS after the hostname validates. The generated `onrender.com` URL is useful for pre-cutover checks; it is not the production address clients should keep. Keep the PC service available as rollback while the canonical hostname and both clients are verified. No custom domain purchase is required because this hostname already exists.

## Restore rehearsal

A private fresh SQLite backup was verified and restored into a separate test location using the repository's backup and restore scripts. The backup had schema version 4 and contained 7 learners, 7 accounts, and 3,029 issued events. The restored service reported `service: "repository"`, contract version 3, and migration version 4. Its idle RSS was about 203 MB. This rehearsal did not provision Render or upload the backup. Keep backup files, checksums, and any paths to them out of this public repository; the database contains account and learning data.

The service supports account email verification and password reset. Verification is enforced by default when a mailer that can deliver messages is configured; `REQUIRE_EMAIL_VERIFICATION` can override that behavior. Configure a real mail delivery provider and the public app URL if users need to receive verification or reset links. Without a delivering mailer, those messages cannot reach users and verification is not enforced by default. See `packages/repository-service/README.md` and `infra/repository/go-repository.env.example` for settings.

## Production migration and cutover

The current local service and `data/local-repository/repository.sqlite` remain the source of truth until cutover is complete. The migration uses a full service database backup, not a learner-scoped `/export` file. The existing backup script creates an application-consistent SQLite snapshot while the service is running, runs integrity checks, and writes a `.sha256` checksum beside the archive. The restore script checks that checksum, verifies integrity, opens the database with the current code, reports counts, and can write the readiness marker only after a successful restore.

1. Create the Render Blueprint from the repository and review the paid resources and displayed price before applying it. Confirm `/health` reports `service: "migration-pending"`; application routes must return 503. Do not create an empty database for production.
2. Ahead of cutover, rehearse the process on a disposable copy using the scripts below. Keep both the archive and its `.sha256` sidecar together. The first command verifies without modifying the target. The second restores into the mounted data directory and writes `.migration-ready` last, after successful verification and restore.

   ```sh
   npx vite-node --config scripts/vite.config.ts scripts/ops/restore.mts -- --file <backup-file> --verify-only
   npx vite-node --config scripts/vite.config.ts scripts/ops/restore.mts -- --file <backup-file> --data /var/data/repository --mark-ready
   ```

   Transfer the archive **and its checksum sidecar** to the service using Render's [SSH and Shell instructions](https://render.com/docs/ssh) and [persistent disk guidance](https://render.com/docs/disks). Keep them private, and use the exact remote paths in the restore command. Do not copy the live `repository.sqlite` file by itself; committed data can still be in SQLite's WAL file. An encrypted archive also requires `BACKUP_PASSPHRASE` in the restore process environment.
3. For the actual cutover, pause writes to the local service and create a fresh application-consistent backup:

   ```sh
   npx vite-node --config scripts/vite.config.ts scripts/ops/backup.mts -- --data data/local-repository --out <private-backup-directory>
   ```

   Transfer the generated archive and its same-name `.sha256` file, run verify-only on the service copy, then restore with `--mark-ready` as above. The host gate switches from migration-pending to the restored service after the command succeeds. Allow for a brief interruption while the application starts.
4. Verify `https://repo.golearn-global-languages.com/health` reports `service: "repository"`, `contractVersion: 3`, and migration 4. Check account sign-in, learner/event counts, documents, and sync cursors against the backup report. Keep the old PC service and database intact until these checks pass.
5. Once the Render service and canonical hostname are verified, update the server URL in both users' locally configured GoLearn/GoReview extensions to `https://repo.golearn-global-languages.com`. The current localhost setting points to the PC; update it before retiring that PC service. Confirm each extension syncs against the hosted service.

Never put a production backup, checksum, private backup path, credentials, or tokens in the repository or logs. The archive contains password hashes, sessions, learner events, and private documents. The scheduled archives live on the same persistent disk, so Render's daily whole-disk snapshots include them but they are not an independent failure-domain backup. No off-host upload is configured by default. If desired, configure the backup tool's existing `BACKUP_S3_*` settings or `BACKUP_UPLOAD_CMD` to copy archives and checksums to a separately secured location; keep those credentials in Render's secret environment settings. Perform a restore drill after changing hosts and quarterly. Render's [persistent disks](https://render.com/docs/disks) are limited to one service instance; disk snapshots and local archives do not replace application-consistent off-host backups.

The Blueprint uses Render's documented [Blueprint specification](https://render.com/docs/blueprint-spec), [Node version setting](https://render.com/docs/node-version), and [web service behavior](https://render.com/docs/web-services).
