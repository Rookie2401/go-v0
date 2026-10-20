# Go Repository service for GoLearn and GoReview

This deployment gives the GoLearn browser extension and GoReview phone app one HTTPS account service. Both sign in to the same account. The service stores account-scoped events and review projections in one SQLite database; GoLearn pushes encounters, GoReview pulls them and asks for review candidates, and GoReview pushes reviews for GoLearn to pull.

## Current service contract

The Node service reports `contractVersion: 3` from `GET /health`. It supports account creation and password sessions, device-bound bearer tokens, `/sync/push`, `/sync/pull`, `/sync/status`, `/sync/wait`, and `/candidates`. Each device must sign in with its own `deviceId`; both devices use the same account credentials. Authorization is derived from the session's learner, and a foreign learner's event is refused before storage. Event IDs and dedupe keys make push retries idempotent.

`POST /sync/wait` supports a 25-second maximum long poll, up to four held requests per learner. The live notifier is in process, and SQLite is opened as one database by one service process. Run exactly one service instance against a data directory. Do not put SQLite on a network filesystem or scale this unit horizontally: other instances would neither share the process-local sign-in throttle nor wake this instance's long polls.

The service is currently a Node 24 process started from the repository source using the existing `vite-node` dev dependency and Node's built-in `node:sqlite`; it does not have a separately built production bundle. This recipe therefore deploys a pinned repository checkout with `npm ci`, rather than claiming an immutable production image. Use a dedicated Linux host, a stable hostname, and a firewall that exposes only HTTPS (ports 80/443) and SSH administration. The app itself binds loopback only.

## Install on a Linux host

1. Install Node.js 24 and Caddy from their official packages. Create a deployment checkout at `/opt/go-v0` and a dedicated runtime account. Check out the reviewed commit, then install exactly its lockfile dependencies as the deploy owner:

   ```sh
   sudo useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin go-repository
   sudo install -d -o root -g go-repository -m 0750 /opt/go-v0
   sudo install -d -o go-repository -g go-repository -m 0700 /var/lib/go-repository
   cd /opt/go-v0
   npm ci
   ```

   Make the deployed files readable by `go-repository` and not writable by it. Keep `/var/lib/go-repository` writable only by that service account. Use an empty database for a fresh test deployment; preserve the existing learner database during migration as described below.

2. Install `infra/repository/go-repository.service` as `/etc/systemd/system/go-repository.service`. Replace `/opt/go-v0` in `WorkingDirectory`/`ExecStart` if the checkout differs. Ensure the installed `vite-node` executable is at that path and that Node 24 is on the system service `PATH`.

3. Replace `repository.example.com` in `infra/repository/Caddyfile` with the public DNS name, point its A/AAAA records at this host, and install it as Caddy's site config. Caddy obtains and renews HTTPS certificates. The reverse proxy forwards `/sync/wait` unchanged, uses low-latency flushing, and does not set a shorter proxy timeout than the service's 25-second wait.

4. Start the service and Caddy, then check the externally served health response. It must return HTTP 200 and JSON containing `ok: true`, `service: "repository"`, and `contractVersion: 3`:

   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable --now go-repository
   sudo systemctl reload caddy
   curl --fail --silent --show-error https://repository.example.com/health
   ```

   A healthy endpoint only proves process reachability and the reported contract version. Before handing the URL to a phone build, complete the account/device sync smoke test below on the deployed host using two test devices and a disposable account. Do not create or use a learner account during deployment automation.

5. Configure the GoLearn and GoReview clients with this same HTTPS base URL. Sign in on GoLearn with a stable desktop `deviceId`; sign in on GoReview with a distinct stable phone `deviceId`, using the same learner account. Verify the extension's sync status reaches zero pending events, the phone sees a newly looked-up word in its candidates, and a phone review appears after GoLearn's next pull. Remove the disposable account and its data after the smoke test if it was created.

## Preserve the existing local sync service

The service inspected on 2026-10-14 listens on port 8790 and runs with `--data data/local-repository` in the Windows checkout. Its database is `data/local-repository/repository.sqlite`. This identifies the active database location; its learner records were not inspected. The separate `data/repository` directory must not be assumed to hold the same accounts or history.

Before replacing that service, identify the intended live database with the owner and take a consistent SQLite backup. Use SQLite's online backup facility, or schedule a brief service stop and copy the closed database. Never copy only the main SQLite file while its writer is running. Keep that backup private: it contains account records and learner history and must not be included in source archives or build artifacts.

Restore the verified backup into the new host's private data directory using the matching service version. Verify account sign-in, enrolments, event counts and sequence head, and review candidates before changing either client's address. A new empty database will not preserve existing accounts; independently creating a replacement account can assign a different learner identity.

Pause writes during the final cutover, then point GoLearn and GoReview to the same HTTPS URL and sign in again. Check that queued desktop events reach the preserved account and that the phone pulls its existing history. Retain the local service and backup for recovery until the deployed cross-device test succeeds. This migration and any service interruption have not been performed.

## Updates and rollback

Deploy one reviewed commit at a time. Stop the service, retain a backup as described below, update the checkout to the new reviewed commit, run `npm ci`, then start it. The service applies SQLite migrations on startup. Check `/health` and service logs, then exercise push, pull, candidate lookup, and `/sync/wait` before considering the update complete. To roll back, stop the unit, restore the prior checkout and its matching database backup, then start it. Do not roll older code against a database after a newer migration unless that exact rollback path has been verified; restoring the matching pre-update database is the safe rollback path.

## Backup and recovery

The database is `/var/lib/go-repository/repository.sqlite`. It may have SQLite `-wal`/`-shm` sidecars while the service is running; copying only the main file while live is not a valid backup. For a simple consistent backup, briefly stop the single writer, copy the closed database, then restart:

```sh
sudo systemctl stop go-repository
sudo install -d -m 0700 /var/backups/go-repository
sudo cp --preserve=mode,ownership,timestamps /var/lib/go-repository/repository.sqlite "/var/backups/go-repository/repository-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
sudo systemctl start go-repository
```

Encrypt backups at rest, restrict access to the backup directory to the service operator, and copy encrypted backups to a separate failure domain. Set and test a retention policy; a backup on the same disk does not protect against disk loss. Verify a backup by restoring a copy into an isolated test host/data directory and checking `/health`, sign-in, and sync before relying on it. The export endpoint is learner-scoped portability, not a whole-service backup: it does not include passwords, sessions, or the complete shared linguistic tables.

To recover, stop the service, preserve the damaged directory for diagnosis, restore one known-good database snapshot to `/var/lib/go-repository/repository.sqlite`, set owner/group to `go-repository`, mode `0600`, and ensure no stale `repository.sqlite-wal` or `repository.sqlite-shm` files remain from the damaged instance. Start the service and verify health and a test account's data. If the snapshot predates recent pushes, those devices should retry their queued events; idempotent IDs prevent duplication.

## Operational checks and current limits

- `GET /health`, account creation, and password sign-in are unauthenticated; learner, event, candidate, document, and sync data routes require a bearer session.
- Password sign-in throttling is per process and account creation/other routes do not yet have a general rate limiter. Put suitable host/network abuse controls in place before inviting public signups; adding multiple app processes is not a substitute.
- The service currently has no account email verification or password reset flow. Provide a support/recovery policy before opening account creation to the public.
- Request and event limits, 25-second long-poll limit, session lifetime, and data handling are described in `packages/repository-service/README.md` and `docs/ecosystem/REPOSITORY-API-AND-OPERATIONS.md`; review those with any release that changes the contract.
- For systemd logs and status, use `journalctl -u go-repository` and `systemctl status go-repository`. Keep request logs and backups access-controlled; never add bearer tokens or request bodies to proxy logs.

The Caddy `flush_interval -1` setting uses the documented low-latency reverse-proxy mode, which disables response buffering and flushes each upstream write immediately. This is suitable for the held `/sync/wait` request and is not a substitute for checking the end-to-end client timeout on a real mobile network. See the [Caddy reverse_proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
