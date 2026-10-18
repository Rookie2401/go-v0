# Deploying the Repository service off the owner's PC

Written 2026-10-17. Goal: `https://repo.golearn-global-languages.com` is served from a VPS that stays on, not from the owner's PC through a Cloudflare tunnel; same address, same accounts, nothing to re-enter on the phone or in the extension. Companion pages: `docs/ops/BACKUP-RESTORE.md`, `docs/ops/MONITORING.md`, `docs/ops/SCALING.md`; the original recipe is `C:\Users\CJWal\Documents\Codex\2026-10-14\ple\outputs\GoReview-sync-service-guide.md` (still right about Caddy and systemd; this page supersedes it where they differ: environment file, backups, accounts).

## What the owner supplies

| Need | Why | Notes |
|---|---|---|
| A VPS | runs Node 24 + Caddy | Ubuntu 24.04 LTS, 2 vCPU / 4 GB / 40 GB SSD is comfortable for hundreds of learners on SQLite. Any provider with a fixed IPv4. Cost: about 5 to 12 USD a month |
| A mail account | verification and password-reset emails | **Resend** (an API key and a sending domain you verify; free tier covers a small start) or any **SMTP** account (Postmark, Mailgun, Brevo, your host's). Add the SPF and DKIM records the provider lists for `golearn-global-languages.com`, or the mail lands in spam |
| An S3-compatible bucket | backups off the box | Cloudflare R2 (the domain is already on Cloudflare), Backblaze B2, or S3. A key that can write to that one bucket |
| The hosted setup app's address | links in the emails | `APP_PUBLIC_URL`, wherever the GoLearn setup app is published |

Nothing in this repository holds a secret: they all live in `/etc/go-repository/env` on the server.

## Settings (environment)

Template: `infra/repository/go-repository.env.example` (copy it to `/etc/go-repository/env`, mode 0640, owner `root:go-repository`). Parsed and validated at start (`packages/repository-service/src/config.ts`): a typo is an error at start-up, not a silent default.

| Variable | Meaning | Default |
|---|---|---|
| `DATABASE_URL` | `postgres://…` selects Postgres (`docs/ops/SCALING.md`); empty = SQLite in `--data` | SQLite |
| `TRUST_PROXY` | `1`: believe the last `X-Forwarded-For` entry (behind Caddy). `cloudflare`: believe `CF-Connecting-IP` (behind the Cloudflare tunnel). Only with the service listening on 127.0.0.1 | off |
| `LOG_FORMAT` | `json` for structured request logs | text |
| `METRICS_TOKEN` | bearer token for `GET /metrics`; unset = this machine only, not through a proxy | none |
| `RATE_LIMIT` | `off` disables all limits | on |
| `RATE_<NAME>_MAX`, `RATE_<NAME>_WINDOW_S` | NAME = `SIGNIN` 10/60 s per IP (plus the per-email lockout), `SIGNUP` 5/3600 s per IP, `SYNC_PUSH` 60/60 s per account, `GENERAL` 600/60 s per IP, `RECOVERY` 10/3600 s per IP (verify, resend, forgot, reset; each address also gets 3 mails an hour), `EXPORT` 3/3600 s per account | as listed |
| `SMTP_URL` / `RESEND_API_KEY`, `MAIL_FROM` | where mail goes; `MAIL_FROM` is required with either. `MAIL_SINK=console` prints instead, `OUTBOX_DIR` moves the file outbox | file outbox in `<data>/outbox` |
| `APP_PUBLIC_URL` | the hosted GoLearn setup app. Emails link to `<APP_PUBLIC_URL>#/verify?token=…` and `<APP_PUBLIC_URL>#/reset?token=…`. **No default** (without it an email carries the code alone). `VERIFY_URL` / `RESET_URL` override the two templates (`{token}` is replaced) | none |
| `GRACE_DAYS` | days an unverified account may still sign in | 7 |
| `DELETE_GRACE_DAYS` | days a requested deletion waits before the purge | 14 |
| `REQUIRE_EMAIL_VERIFICATION` | `1`/`0`. Default: **on exactly when mail can be delivered** (SMTP or Resend configured). With the file outbox nothing reaches a person, so nobody is ever locked out | auto |
| `SERVICE_NAME` | product name in the emails | Go |
| `PURGE_ON_BOOT`, `PURGE_INTERVAL_MINUTES` | maintenance pass (purge due deletions, prune ended sessions, spent tokens, 400-day-old security-log lines) at start and every N minutes (0 = never) | on, 60 |
| `PGPOOL_MAX` | Postgres connections | 10 |
| `BACKUP_*` | see `docs/ops/BACKUP-RESTORE.md` | none |

**Existing accounts and verification.** Migration 004 marks every account that exists when it runs as verified (at its creation time): they predate the rule, and nobody is locked out by the upgrade. Only accounts created afterwards start unverified.

## Until the VPS exists: the PC and the tunnel, with the new code

When the owner next restarts the local service (it is still running the older code), start it with the tunnel-aware setting, otherwise every phone and extension would share one rate-limit bucket (they all reach the service from the tunnel on 127.0.0.1):

```powershell
$env:TRUST_PROXY = 'cloudflare'          # behind the named tunnel (infra/cloudflare); the tunnel sets CF-Connecting-IP
$env:LOG_FORMAT  = 'json'                # optional
npx vite-node packages/repository-service/src/main.ts --port 8790 --data data/local-repository --host 127.0.0.1
```

Everything else defaults safely: no mail account means messages go to `data\local-repository\outbox\` and verification is not enforced; migration 004 is applied to the database on the first start (a restart cannot be undone by the older code: take a backup first, `docs/ops/BACKUP-RESTORE.md`).

## One-time VPS setup (Ubuntu 24.04)

```sh
# packages
sudo apt update && sudo apt install -y git curl ufw debian-keyring debian-archive-keyring apt-transport-https gpg
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
node --version        # v24.x

# firewall: SSH, HTTP (certificate), HTTPS
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw --force enable

# the service account and directories
sudo useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin go-repository
sudo install -d -o root -g go-repository -m 0750 /opt/go-v0
sudo install -d -o go-repository -g go-repository -m 0700 /var/lib/go-repository /var/backups/go-repository
sudo install -d -o root -g go-repository -m 0750 /etc/go-repository

# the code: one reviewed commit (replace the URL and the commit)
sudo git clone <your repository URL> /opt/go-v0
cd /opt/go-v0 && sudo git checkout <the reviewed commit>
sudo npm ci                                         # as root; the service only reads these files
sudo chown -R root:go-repository /opt/go-v0 && sudo chmod -R g+rX,go-w /opt/go-v0

# settings
sudo cp infra/repository/go-repository.env.example /etc/go-repository/env
sudo chown root:go-repository /etc/go-repository/env && sudo chmod 0640 /etc/go-repository/env
sudoedit /etc/go-repository/env     # TRUST_PROXY=1, LOG_FORMAT=json, METRICS_TOKEN, MAIL_FROM + RESEND_API_KEY or SMTP_URL, APP_PUBLIC_URL, BACKUP_*

# units (do NOT enable the service yet: it must not start on an empty database, see below)
sudo cp infra/repository/go-repository*.service infra/repository/go-repository*.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

Caddy: copy `infra/repository/Caddyfile` to `/etc/caddy/Caddyfile`, replace `repository.example.com` with the staging name `repo-new.golearn-global-languages.com` for the rehearsal (below), then `sudo systemctl reload caddy`.

## The cut-over, in order

Every step before "Freeze" can be done days ahead and repeated; nothing before it changes what the phone and extension use. The migration guard is the order itself: **the service is started on the VPS only after a verified restore**, so it can never serve an empty database under the real name. (On Render the same guard is `REPOSITORY_MIGRATION_PENDING=true`: the start-up gate answers `{"service":"migration-pending"}` until the restore is marked ready, with the `.migration-ready` file for SQLite or the `service_state` row for Postgres; both are tested.)

### 1. Rehearse on the staging name

1. In the Cloudflare DNS dashboard add `A  repo-new  <VPS IPv4>` with the proxy **off** (grey cloud, "DNS only"). Wait until `nslookup repo-new.golearn-global-languages.com` shows the address.
2. On the PC take a backup of the live data (the service keeps running):

   ```powershell
   cd C:\Users\CJWal\dev\go-v0
   npx vite-node --config scripts/vite.config.ts scripts/ops/backup.mts -- --data data/local-repository --out C:\go-backups
   scp C:\go-backups\repository-sqlite-*.gz* <you>@<VPS IP>:/tmp/
   ```
3. On the VPS verify and restore the rehearsal copy, and start the service:

   ```sh
   cd /opt/go-v0
   F=$(ls -t /tmp/repository-sqlite-*.sqlite.gz | head -1)
   sudo -u go-repository ./node_modules/.bin/vite-node --config scripts/vite.config.ts scripts/ops/restore.mts -- --file "$F" --verify-only
   sudo -u go-repository ./node_modules/.bin/vite-node --config scripts/vite.config.ts scripts/ops/restore.mts -- --file "$F" --data /var/lib/go-repository --mark-ready
   sudo systemctl enable --now go-repository
   curl -s http://127.0.0.1:8790/health          # ok:true, store:"sqlite", migrations:4
   curl -s https://repo-new.golearn-global-languages.com/health
   ```
4. Check the things that only exist behind the proxy:

   ```sh
   # rate limiting sees the real client address (10 sign-ins a minute per address, then 429 with Retry-After)
   for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code} " -X POST https://repo-new.golearn-global-languages.com/sessions -H 'content-type: application/json' -d '{"email":"nobody'$i'@example.com","password":"x","deviceId":"d"}'; done; echo   # 401 ×10 then 429 429
   curl -s -o /dev/null -w "%{http_code}\n" https://repo-new.golearn-global-languages.com/metrics      # 404: never public
   curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://127.0.0.1:8790/metrics | head -3           # 200 on the box
   # mail: create a throwaway account with an address you own; the verification email must arrive and its link must open the setup app
   curl -s -X POST https://repo-new.golearn-global-languages.com/accounts -H 'content-type: application/json' -d '{"email":"you+test@your-domain","password":"a long throwaway password"}'
   ```
   Then delete the throwaway account (setup app, or `DELETE /me` with its password and `scripts/ops/purge.mts` after the grace), and in the browser confirm the setup app signs in against the staging name if it can be pointed there.
5. Start the timers and see one backup go off the box:

   ```sh
   sudo systemctl enable --now go-repository-backup.timer go-repository-purge.timer
   sudo systemctl start go-repository-backup.service && journalctl -u go-repository-backup -n 20 --no-pager   # "uploaded to 1 place(s)"
   ```
6. Stop the rehearsal service: `sudo systemctl stop go-repository` (its data is replaced at the cut-over).

### 2. Freeze, final copy, switch (a few minutes of downtime; devices queue and retry)

1. **Freeze.** On the PC stop the local service so nothing is written after the backup:

   ```powershell
   Get-NetTCPConnection -LocalPort 8790 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }
   ```
2. **Final backup and copy.**

   ```powershell
   npx vite-node --config scripts/vite.config.ts scripts/ops/backup.mts -- --data data/local-repository --out C:\go-backups
   scp C:\go-backups\repository-sqlite-*.gz* <you>@<VPS IP>:/tmp/
   ```
3. **Restore it over the rehearsal copy and start.** On the VPS:

   ```sh
   cd /opt/go-v0
   F=$(ls -t /tmp/repository-sqlite-*.sqlite.gz | head -1)
   sudo systemctl stop go-repository
   sudo -u go-repository ./node_modules/.bin/vite-node --config scripts/vite.config.ts scripts/ops/restore.mts -- --file "$F" --data /var/lib/go-repository --force --mark-ready
   #   prints the counts it restored: compare learners / accounts / eventsIssued with the PC (the drill output in BACKUP-RESTORE.md shows the format)
   sudo systemctl start go-repository
   curl -s http://127.0.0.1:8790/health
   ```
4. **Switch the name.** In Cloudflare DNS: delete the `CNAME repo → <tunnel-id>.cfargotunnel.com` record (created by `cloudflared tunnel route dns`), add `A  repo  <VPS IPv4>` with the proxy **off**. In `/etc/caddy/Caddyfile` change the site name to `repo.golearn-global-languages.com` (keep the staging name too until you are done: `repo.golearn-global-languages.com, repo-new.golearn-global-languages.com {`) and `sudo systemctl reload caddy`. Caddy obtains the certificate on the first request (seconds). If the record stays proxied through Cloudflare instead, set `TRUST_PROXY=cloudflare` in the env file, restart, and set Cloudflare's SSL mode to Full (strict).
5. **Verify** (from outside the VPS):

   ```sh
   curl -s https://repo.golearn-global-languages.com/health      # ok:true, "store":"sqlite", "migrations":4
   ```
   Then on the phone and in the extension: open the app. Nothing needs re-entering: the address is the same, and the restored sessions are valid, so both stay signed in. The queued events push; the phone's queue is keyed by this address, so nothing is stranded. Watch `journalctl -u go-repository -f` for 401s (a device that must sign in again is fine, a flood is not).
6. **Afterwards.** Keep the PC service stopped and `data\local-repository` and `C:\go-backups` untouched for two weeks. Stop the tunnel (`cloudflared service uninstall`; `cloudflared tunnel delete goreview-repository` when you are sure). Delete the `repo-new` record and its Caddy name. Add an external uptime monitor on `/health` (`docs/ops/MONITORING.md`).

### Rollback

Until the old data is retired: set `repo` back to the tunnel (`cloudflared tunnel route dns goreview-repository repo.golearn-global-languages.com` replaces the A record's job; remove the A record first), start the PC service. Events written on the VPS since the switch exist only there: take a backup on the VPS first (`systemctl start go-repository-backup`), restore it on the PC (`restore.mts --force`) and the devices will not lose anything.

## Updating the code

```sh
cd /opt/go-v0 && sudo git fetch && sudo git checkout <the next reviewed commit> && sudo npm ci
sudo systemctl start go-repository-backup.service        # a fresh backup before a migration
sudo systemctl restart go-repository
curl -s http://127.0.0.1:8790/health                        # "migrations" is the new version
```

The service applies its migrations at start; it refuses a database newer than its code, and a migration file that was edited after being applied.

## Accounts, in operation

* New accounts get a confirmation email (24 h, one use); unverified accounts sign in for `GRACE_DAYS`, then get `403 email-unverified`. `POST /accounts/verify/resend` asks for another.
* `POST /accounts/password/forgot` and `/reset` (1 h, one use; a reset ends every session).
* Deletion: the learner sends their password to `DELETE /me`, gets `202 { scheduledPurgeAt }`, and has `DELETE_GRACE_DAYS` to cancel (`POST /me/delete/cancel`). After that the purge (in the service hourly, and `go-repository-purge.timer` daily) erases their events, documents, sessions, devices, enrolments, account and address. The shared linguistic tables stay (facts about words). The audit trail keeps one line: a truncated digest of the account id and counts.
* **Backups outlive deletions.** A purged learner is still in every backup taken before the purge until it ages out: locally 7 daily + 4 weekly (about five weeks), in the bucket per its lifecycle rule. Set the bucket rule at or below that. And a restore brings back anyone purged since that backup was taken. The purge audit lines live in the database and are lost with it, so keep your own note of deletions processed (date only, no names) and, after restoring an old backup, have those learners delete again.
* Export: `GET /me/export` (3 an hour per account) is the learner's own copy as one JSON attachment.
