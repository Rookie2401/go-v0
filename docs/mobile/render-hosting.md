# Optional Render host for GoLearn and GoReview

This is a ready-to-review Render option for the Repository sync service. It defines one paid Node web service, one 1 GB persistent disk, TLS through Render's public service hostname, and no automatic deploys. The blueprint is at `infra/repository/render.yaml` so it cannot accidentally become the repository's default root Blueprint. In Render's Blueprint setup, set the Blueprint file path to `infra/repository/render.yaml`.

No Render service has been created and no database has been uploaded. Applying the Blueprint provisions the paid service and makes its public `onrender.com` URL available; a custom domain is optional. Provisioning requires a Render account and authorization for the recurring hosting charge.

## What this plan creates

The Blueprint pins Node to 24.21.0 and stores the SQLite database at `/var/data/repository/repository.sqlite` on a Render persistent disk. Its startup guard binds `0.0.0.0:$PORT`. While `REPOSITORY_MIGRATION_PENDING=true` and `/var/data/repository/.migration-ready` is absent, `/health` reports `service: "migration-pending"` with HTTP 200, while every application route is unavailable. After a database file and marker exist, the guard closes its listener and starts the existing service. `npm ci --include=dev` installs its existing `vite-node` development dependency.

It sets `numInstances: 1` and disables automatic deploys. Keep one service process for this SQLite database: the service's sign-in throttle and long-poll notifications are process-local, and a persistent disk can attach to only one Render service instance. A disk-backed deploy stops the old instance before starting the new one, so a short interruption during deploy is expected. Render's 25-second `/sync/wait` route is comfortably below its documented HTTP response limit.

Render issues TLS and a default service hostname without a domain purchase. Point both apps at the exact same `https://<service-name>.onrender.com` base URL. You do not need a Mac or the Apple Developer account for this hosted service; those are separate requirements for distributing the iOS app.

## Estimated price

The proposed `starter` web plan is 0.5 CPU / 512 MB RAM and Render's article lists it at **$7/month**. Render's published disk rate is **$0.25 per GB-month**, so a 1 GB disk brings the estimate to **$7.25/month**, before bandwidth or workspace overages. Render prorates these amounts by runtime. Treat this as an **unverified estimate**, based on Render's [Starter plan article](https://render.com/articles/best-railway-alternatives) and [disk pricing article](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses); its [pricing page](https://render.com/pricing) uses a dynamic table that could not be independently read here. Confirm the actual checkout and billing view before provisioning because provider prices and account usage can change.

## Provisioning steps when you're ready

1. Put this reviewed Blueprint on a Git branch Render can access. The Render account needs access to the repository. Its default `onrender.com` host is sufficient; a custom domain is optional.
2. In Render, create a Blueprint from that repository and set the Blueprint path to `infra/repository/render.yaml`. Review the displayed resources and paid Starter plan before applying.
3. Review the existing-data migration status below. The startup guard does not create or open a database by itself.
4. Apply the Blueprint. Before restore, check `https://<service-name>.onrender.com/health` returns `ok: true` and `service: "migration-pending"`; `/sync/*` and other application routes must return 503. For a disposable empty-service smoke test only, initialize a new empty database and release the guard over SSH:

   ```sh
   ssh SERVICE@ssh.oregon.render.com 'mkdir -p /var/data/repository && test ! -e /var/data/repository/repository.sqlite && : > /var/data/repository/repository.sqlite && touch /var/data/repository/.migration-ready'
   ```

   For existing account data, follow the verified backup restore procedure below instead of creating an empty database.
5. After `/health` reports `service: "repository"` and `contractVersion: 3`, use a disposable test account only. Sign in on GoLearn with one device ID and on GoReview with a different device ID, both against that same HTTPS URL and account. Confirm an encounter pushed from GoLearn appears in GoReview's candidate list, then submit a test review and confirm it is pulled by GoLearn. The included [cross-device integration test](../../test/repository/service/mobile-cross-device.test.ts) exercises the same account isolation and retry contract locally.
6. Delete the disposable account with the service's account deletion flow after the smoke test, or keep the service suspended until the production cutover decision. Automatic deploys remain off; deploy reviewed commits manually.

No secrets are required by the current server service, and the Blueprint does not define or request any. Account passwords and sessions are handled by the service. Do not place test or learner credentials in the repository, build command, or logs.

## Existing local database and safe migration

The active local service and its database at `data/local-repository/repository.sqlite` remain the current source of truth. Keep the local service and its database in place while evaluating Render. A new Render deployment stays behind the startup guard with no database until the operator restores a backup or explicitly releases a disposable empty database; neither path copies local data automatically.

The service has a learner-scoped `/export` route, but no matching import endpoint; the app's device-local upload flow is not a service-database migration. The local source remains `data/local-repository/repository.sqlite`; it has not been changed or uploaded. A private, application-consistent snapshot was prepared separately and integrity-checked, outside this repository. Make a fresh coordinated backup at cutover. A raw full-database copy contains every account in the database, so handle it as sensitive data and confirm the account scope before transferring.

Cross-platform migration is authorized. This Blueprint provides a guarded full-database file restore; it does not import learner-scoped `/export` bundles. Test against a separate disposable backup first. At cutover, coordinate a write pause and fresh application-consistent backup, then restore to a new empty service disk as follows. Render supports SFTP/SCP transfer to a paid web service with SSH enabled; use its [SSH and Shell instructions](https://render.com/docs/ssh) and [persistent disk transfer guidance](https://render.com/docs/disks).

1. Create a private, application-consistent snapshot from `data/local-repository/repository.sqlite` using Node 24's [`node:sqlite` backup API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html#sqlitebackupsource-path-options). Do this while the service is running; do not copy only the live SQLite main file because committed WAL data may be missing.
2. Connect to the new service's live instance over SSH, create the data directory, and copy the backup as a temporary file on the mounted disk, for example:

```sh
ssh SERVICE@ssh.oregon.render.com 'mkdir -p /var/data/repository'
scp -s ./repository-migration.sqlite SERVICE@ssh.oregon.render.com:/var/data/repository/repository.sqlite.restore
```

Replace `SERVICE` and host with the service SSH command shown in Render. In the service shell, verify the received copy before activation, then atomically install it and create the sentinel last:

```sh
cd /var/data/repository
node --input-type=module -e 'import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync("repository.sqlite.restore", { readOnly: true }); try { const result = db.prepare("PRAGMA integrity_check").get(); if (result.integrity_check !== "ok") process.exitCode = 1; else console.log("integrity_check=ok"); } finally { db.close(); }'
chmod 600 repository.sqlite.restore
mv repository.sqlite.restore repository.sqlite
touch .migration-ready.tmp
mv .migration-ready.tmp .migration-ready
```

Create the marker only after the transferred file is verified and installed. The guard then closes its health-only listener and starts the repository service; wait for `/health` to report `service: "repository"` and `contractVersion: 3`. Check account access, event counts, documents, and sync cursors before retiring the local service. Keep the local database untouched and available until those checks pass. Protect backup files as sensitive account data, verify `PRAGMA integrity_check` on a separate copy before transfer, and never put the backup or its private path in this repository.

## Storage, backup, and operational limits

Render preserves only files under `/var/data`; the app writes the SQLite database below that path. Disk capacity can be increased later but not reduced, so check usage before changing it. Render attaches the disk to only one service and disables multi-instance scaling. Disk-backed deploys are not zero-downtime; Render stops the old instance first to protect the disk from concurrent application versions. These are platform constraints, not settings to work around with a second process. See [Render Persistent Disks](https://render.com/docs/disks).

Render takes daily disk snapshots and retains them for at least seven days, but these are whole-disk restores and lose changes newer than the selected snapshot. A custom SQLite database still needs application-consistent backups and a restore drill. Use Node 24's `node:sqlite` backup API or stop the service cleanly before copying the closed database; never treat a live copy of just `repository.sqlite` as a backup while SQLite WAL mode is active. Keep encrypted copies in another failure domain and check restore integrity. See the [Node 24 SQLite backup API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html#sqlitebackupsource-path-options).

The running service supports v3 accounts, device-bound sessions, `/sync/push`, `/sync/pull`, `/sync/status`, `/sync/wait` long polling, and `/candidates`. It still has per-process sign-in throttling and no account email verification or password reset. Keep one instance, and review the service's full limits in `packages/repository-service/README.md` before inviting users.

The Blueprint uses fields documented in Render's [Blueprint specification](https://render.com/docs/blueprint-spec). The current Render Node runtime is pinned explicitly using the documented `NODE_VERSION` setting from [Setting Your Node.js Version](https://render.com/docs/node-version). Render's public hostname, health checks, TLS, port binding, and web service behavior are described in [Web Services](https://render.com/docs/web-services).
