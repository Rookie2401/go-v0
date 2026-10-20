# Prompt: move the Go Repository service from the owner's PC to a server (for a Sonnet session)

Paste everything below the line into a new Claude Code session opened on `C:\Users\CJWal\dev\go-v0`. Fill in the three
`<…>` values first.

---

You are working in the Go ecosystem repository at `C:\Users\CJWal\dev\go-v0` (Vite, TypeScript strict, Vitest; several Claude
sessions share this tree, so only ever `git add` by explicit path, never `git add -A` or `commit -a`, never push, never revert or
delete files you did not write). Your task: move the Repository service (`packages/repository-service`) from this PC to the
server the owner has created, following `docs/ops/DEPLOY.md` exactly, with a rehearsal before the switch. Read that document
first, then `docs/ops/BACKUP-RESTORE.md`, `docs/ops/MONITORING.md`, `infra/repository/README.md` if present, and the files under
`infra/repository/` (Caddyfile, systemd units and timers, `go-repository.env.example`).

Inputs from the owner:
- Server IPv4: `<IP>`
- SSH login user: `<USER>` (sudo-capable; `root` on a fresh server)
- SSH key: `C:\Users\CJWal\.ssh\id_ed25519` (already created; the public key is installed on the server)
- Public name to keep: `repo.golearn-global-languages.com`; staging name for the rehearsal: `repo-new.golearn-global-languages.com`
- DNS is in the owner's Cloudflare dashboard. You never change DNS yourself: when a record is needed, tell the owner the exact
  record (type, name, value, proxy OFF) and wait for their confirmation.

Current state you start from:
- The service runs on this PC as the Scheduled Task `GoRepositoryService` (port 8790, data `data/local-repository`, SQLite,
  schema migration 4) behind a Cloudflare named tunnel run by the `cloudflared` Windows service. Both keep running until the
  cut-over; they are the rollback.
- This PC's own Wi-Fi blocks the domain `golearn-global-languages.com` (a router URL filter: plain HTTP answers a block page,
  HTTPS is reset). So a failed `curl https://repo…/health` from this PC proves nothing. Check public names from OUTSIDE:
  `https://api.hackertarget.com/httpheaders/?q=https://<name>/health` (fetch it with WebFetch) must show `HTTP/1.1 200 OK`.
- The code on the server must be one reviewed commit of this repository. There is no GitHub remote to clone from: send the
  tree with `git archive <commit> | ssh <USER>@<IP> "sudo tar -x -C /opt/go-v0"` (after creating `/opt/go-v0` as the plan says),
  then `sudo npm ci` on the server. Record the commit hash you shipped.
- Backups: `npx vite-node --config scripts/vite.config.ts scripts/ops/backup.mts -- --data data/local-repository --out backups`
  (the service keeps running). Restore on the server with `scripts/ops/restore.mts` exactly as the plan shows (`--verify-only`
  first, then `--mark-ready`).

Rules:
- The owner wants NO secrets handled by you: never ask for, read, print or store an API key, password, token or card number.
  The server's `/etc/go-repository/env` is filled by the owner: write the template there, print the variable NAMES that need
  values (`METRICS_TOKEN`, and optionally `RESEND_API_KEY`/`SMTP_URL` + `MAIL_FROM`, `APP_PUBLIC_URL`, `BACKUP_*`), and tell
  the owner to edit the file themselves with `sudoedit`. The service runs without mail and without off-box backups (file
  outbox; local backups) and that is acceptable for the first cut-over.
- Never buy anything, create accounts, or enter credentials anywhere. Never run `wrangler`. Never type into the Cloudflare dashboard.
- The migration guard is the order of the plan: the server's service is started only after a verified restore of a fresh
  backup; the public name is switched only after the staging name passed every check in "Rehearse"; the PC's task and tunnel
  are stopped only after the public name serves from the server and the phone syncs. If any step fails, stop, report the exact
  output, and do not improvise around it.
- Use `ssh -o BatchMode=yes -i C:\Users\CJWal\.ssh\id_ed25519 <USER>@<IP> '<command>'` for every remote step and show the real
  output in your report. Prefer small, single-purpose SSH commands over long scripts. Do not install anything on the server
  that the plan does not list.
- Commit only what you change in this repository (docs/ops notes, a record of the cut-over under `docs/ops/`), by path, with the
  trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` replaced by your own model name.

Deliver, in order, with the owner's go-ahead between the three parts:
1. **Server setup** ("One-time VPS setup" in the plan): packages, Node 24, Caddy, firewall, the `go-repository` account and
   directories, the code at one commit, `npm ci`, the env template, the systemd units (NOT enabled yet), the Caddyfile with the
   staging name. Report what each `--version` and `systemctl status` printed.
2. **Rehearsal on `repo-new`** (plan section "1. Rehearse on the staging name"): ask the owner for the `A repo-new <IP>` record
   (proxy off), take a backup on the PC, copy it over, verify and restore it, start the service, and run every check in that
   section (local health, outside probe of the staging name, rate limiting 429 after 10 sign-ins a minute, `/metrics` 404 from
   outside and 200 on the box with the token the owner set, backup timer producing a file). Then stop the rehearsal service.
3. **Cut-over** (plan section "2. Freeze, final copy, switch"): with the owner present, stop the PC task (freeze), take the final
   backup, restore it on the server, start the service, ask the owner to switch the `repo` record from the tunnel CNAME to
   `A repo <IP>` (proxy off), verify from outside, have the owner confirm the phone and the extension sync, then stop the tunnel
   service on the PC (`Stop-Service cloudflared` and `Unregister-ScheduledTask GoRepositoryService` are the owner's elevated
   commands; print them, do not run them). Write `docs/ops/CUTOVER-<date>.md` with the commit shipped, the backup file names and
   sizes, every check's real output, and the rollback steps from the plan.

Report honestly: what was verified by output you saw, what was not, and anything the owner still has to do (mail sender, backup
bucket, legal review of the drafts under `docs/legal/`).
