# Monitoring the Repository service

What the service tells you about itself, and how to scrape it. Written 2026-10-17. Nothing here sends data anywhere by itself: you point a scraper at it.

## `GET /health`

Open (no token), used by Caddy, uptime monitors and the hosting gate. Never holds a secret or a learner.

```json
{ "ok": true, "service": "repository", "version": 1, "contractVersion": 3, "store": "sqlite", "migrations": 4, "uptimeSec": 86213 }
```

`store` is `sqlite` or `postgres`, `migrations` the newest applied schema version, `uptimeSec` seconds since the process started. Point an external
monitor (UptimeRobot, Better Stack, Healthchecks) at `https://go-v0.onrender.com/health` (the default address of every system since 2026-10-27; `https://repo.golearn-global-languages.com/health` is the same service through its DNS-only canonical name) and alert on a non-200 or on `ok` missing.
While a hosted deployment is waiting for a restored database the gate answers `{ "ok": true, "service": "migration-pending" }` instead: treat that as down.

## `GET /metrics` (Prometheus text format 0.0.4)

Guarded, and 404 to anyone who is not allowed (the route does not announce itself):

* with `METRICS_TOKEN` set: only `Authorization: Bearer <token>`, from anywhere;
* without it: only a request from this machine **and** not through a proxy (a request carrying `X-Forwarded-For`, `X-Forwarded-Host`, `Forwarded` or `CF-Connecting-IP` is refused).

The Caddyfile in `infra/repository` also answers 404 for `/metrics` on the public name, so the scraper talks to `127.0.0.1:8790` (same box) or goes through a private network / SSH tunnel / WireGuard. If you must scrape over the internet, set `METRICS_TOKEN` and put the scraper's address on an allow-list at the firewall.

| metric | type | meaning |
|---|---|---|
| `go_repository_http_requests_total{route,method,status}` | counter | requests handled. `route` is the route **pattern** (`/units/:id`, `/sync/push`), never the path; unmatched paths are `unmatched` |
| `go_repository_http_request_duration_seconds{route}` | histogram | buckets 5 ms to 30 s, `_sum`, `_count` |
| `go_repository_rate_limited_total{rule}` | counter | requests refused with 429 by `signin`, `signup`, `syncPush`, `general`, `recovery`, `export` |
| `go_repository_sync_waiters` | gauge | `POST /sync/wait` long-polls being held right now (phones with the app open) |
| `go_repository_events_issued_total` | counter | events ever stored (sum of the learners' head sequences; does not fall on deletion) |
| `go_repository_learners`, `go_repository_accounts` | gauge | rows held |
| `go_repository_store_size_bytes` | gauge | SQLite file plus its log, or `pg_database_size` |
| `go_repository_schema_version` | gauge | newest applied migration |
| `go_repository_uptime_seconds`, `go_repository_build_info{store}` | gauge | process age; constant 1 labelled with the store |
| `process_resident_memory_bytes`, `nodejs_heap_used_bytes` | gauge | memory |

The store counters are cached for 15 seconds, so a scrape every few seconds costs the database nothing. No metric, label or HELP text carries an email, a learner id, a token or an address.

### Scrape example (`prometheus.yml`)

```yaml
scrape_configs:
  - job_name: go-repository
    scrape_interval: 30s
    metrics_path: /metrics
    static_configs:
      - targets: ['127.0.0.1:8790']        # Prometheus on the same box, no METRICS_TOKEN needed
    # Prometheus elsewhere, over a private network: use the token instead
    # authorization:
    #   type: Bearer
    #   credentials_file: /etc/prometheus/go-repository.token
```

Check by hand: `curl -s http://127.0.0.1:8790/metrics | head` on the server (works without a token), or `curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://127.0.0.1:8790/metrics`.

### Alerts worth having

```yaml
groups:
  - name: go-repository
    rules:
      - alert: RepositoryDown
        expr: up{job="go-repository"} == 0
        for: 2m
      - alert: RepositoryServerErrors
        expr: sum(rate(go_repository_http_requests_total{status=~"5.."}[5m])) > 0.05
        for: 10m
      - alert: RepositorySlowSync
        expr: histogram_quantile(0.95, sum by (le) (rate(go_repository_http_request_duration_seconds_bucket{route="/sync/push"}[10m]))) > 0.5
        for: 15m        # the signal that SQLite is reaching its limit: docs/ops/SCALING.md
      - alert: RepositoryRateLimiting
        expr: sum(rate(go_repository_rate_limited_total[10m])) > 1
        for: 10m        # many 429s: an attack, a client in a retry loop, or limits too tight for a shared school/church address
      - alert: RepositoryDiskGrowing
        expr: predict_linear(go_repository_store_size_bytes[6h], 7 * 24 * 3600) > 20e9
```

## Request logs

One line per request, to the service's stdout (systemd: `journalctl -u go-repository -f`).

* Default (`LOG_FORMAT` unset): `GET /sync/status 200 3ms`, as before.
* `LOG_FORMAT=json`: one object per line:

```json
{"ts":"2026-10-17T20:07:29.599Z","level":"info","msg":"request","requestId":"916720ed-2f07-4285-8340-5d73c7c90642","method":"GET","path":"/sync/status","route":"/sync/status","status":200,"ms":3}
```

`level` is `error` for 5xx and then carries `error`: the error **class** (or the database's SQLSTATE such as `23505`), never its message, which can quote a row. A request refused by a rate limit carries `"limited":"signin"`. `requestId` is the caller's `X-Request-Id` when it is 8 to 64 characters of `[A-Za-z0-9._-]`, otherwise a fresh UUID; it is also returned as the `X-Request-Id` response header, so a client can quote it in a bug report and you can find the line.

Never logged: bodies, query strings, headers, tokens, passwords, emails, addresses. Caddy's own access log (`/var/log/caddy/repository-access.log`) has the Authorization and Cookie headers stripped.

## Dashboards

Any Grafana works on the metrics above. The two panels that matter first: requests per second by status (stacked), and p50/p95 of `/sync/push` and `/sync/pull`.
