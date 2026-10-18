# Named Cloudflare tunnel for the Repository service

Why: the phone (GoReview on TestFlight, or the PWA) must reach the Go Repository service on a stable HTTPS address.
The quick tunnel Codex used (`cloudflared tunnel --url …`, a `*.trycloudflare.com` name) has no uptime guarantee and
changes its name every start, which also strands the phone's queued events under the old address (the native app keys its
queue by service URL). A named tunnel keeps one name on the owner's own domain, survives restarts and runs as a Windows
service. Nothing is hosted anywhere else: the service and its SQLite file stay on this PC, so the PC must be on and online
for the phone to sync (see `docs/ecosystem/SYNC.md`; the Render/VPS path in `infra/repository` removes that dependency).

## The owner's domain (2026-10-17)

`golearn-global-languages.com`, registered at IONOS (nameservers `ns10xx.ui-dns.*`). Before the tunnel can exist the zone
must be on Cloudflare: add the site to the Cloudflare account (free plan) at dash.cloudflare.com → Add a site, then at
IONOS replace the four ui-dns nameservers with the two Cloudflare ones the dashboard shows, and wait until
`nslookup -type=NS golearn-global-languages.com` returns `*.ns.cloudflare.com`. Planned hostname:
`repo.golearn-global-languages.com`.

## What the owner must supply

1. A domain whose DNS is on Cloudflare (the zone), and the hostname to use: `repo.golearn-global-languages.com`.
2. The one-time browser authorisation: `cloudflared tunnel login` opens Cloudflare in the browser; the owner signs in and
   selects the zone. The script opens it and stops; nothing here types credentials.
3. An administrator prompt once, to install the tunnel as a Windows service (otherwise it can run in the foreground).

## Run

```powershell
cd C:\Users\CJWal\dev\go-v0
powershell -ExecutionPolicy Bypass -File infra\cloudflare\setup-named-tunnel.ps1 -Hostname repo.golearn-global-languages.com
```

First run: the browser opens for the login, the script exits with code 2; run it again after the login. It then creates the
tunnel `goreview-repository` (idempotent), writes `%USERPROFILE%\.cloudflared\config.yml` (ingress `hostname →
http://127.0.0.1:8790`, catch-all 404), routes the DNS name (a CNAME to `<tunnel-id>.cfargotunnel.com`), installs or restarts
the `cloudflared` Windows service when elevated, and checks `https://<hostname>/health` for `ok: true`, `service:
"repository"`, `contractVersion: 3`.

## Afterwards

- Stop the old quick tunnel (`Stop-Process -Name cloudflared` before installing the service, or the two will both run).
- Point the clients at the new name: the hosted/PWA GoReview `config.json` → `serviceUrl: "https://<hostname>"`; the next
  TestFlight build: `REPOSITORY_SERVICE_URL=https://<hostname>` for `packages/goreview-ios` `release:stage` (see its README).
  The desktop extension can keep `http://127.0.0.1:8790`; it is the same database.
- The local service must be running on 8790 (`scripts\local\start.cmd`, or
  `npx vite-node packages/repository-service/src/main.ts --port 8790 --data data/local-repository --host 127.0.0.1`).
- Secrets: `cert.pem` and `<tunnel-id>.json` live under `%USERPROFILE%\.cloudflared` only; never copy them into the repo.

## Remove

`cloudflared tunnel route dns` records are deleted in the Cloudflare DNS dashboard; `cloudflared tunnel delete goreview-repository`
removes the tunnel; `cloudflared service uninstall` removes the Windows service.
