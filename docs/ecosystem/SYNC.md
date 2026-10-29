# Sync between GoLearn, the Repository and GoReview

Written 2026-10-15, after the owner's complaint: "the syncing system is very slow and inconsistent". This page says how sync works now, what was measured, which causes were proved and which are fixed, and what only the owner can do.

## The design as it is now

```
GoLearn extension (Brave, desktop)            Repository service (one Node process, SQLite)            GoReview (iPhone shell / PWA)
 background worker                              http://127.0.0.1:8790  ->  HTTPS tunnel/host             packages/gopractice
 queue (chrome.storage.local, durable)  -push-> POST /sync/push   (events immutable, idempotent on id)
 pull is for the cursor only            <-pull- POST /sync/pull   (paged, afterSeq, hasMore)  <-pull-     sync client + local queue/log
                                                POST /sync/wait   (held <= 25 s, wakes on a push) <-wait-  live loop while visible
                                                GET  /sync/status (cursor)                                  30 s poll as a safety net
```

Events are the only thing that moves. They are never edited; a push is at-least-once and a duplicate counts as success. Everything below is about when a round runs and how big it is.

### When a round runs

| Where | Trigger | Rule |
|---|---|---|
| Extension | an event is recorded | debounced 2 s (`SYNC_DEBOUNCE_MS`), then push, then pull |
| Extension | a round failed and events are waiting | retry after 5 s, 10 s, 20 s, 30 s, 30 s ... (`RETRY_BASE_MS`, `RETRY_MAX_MS`); stops on sign-out, offline, a 401 |
| Extension | `chrome.alarms` | every 1 minute (`SYNC_PERIOD_MINUTES`, was 5); an older install's 5-minute alarm is replaced |
| Extension | the browser comes back online | a round at once |
| Extension | any round with events in the queue | never skipped for the sync client's backoff; the client's backoff only throttles an empty-queue pull |
| Phone | app visible, signed in, online | holds `POST /sync/wait` (25 s); a wake runs push + pull and repaints; pauses when hidden or suspended |
| Phone | app resumes (Capacitor `appStateChange`) | forced round, live loop restarts, cached profile marked stale |
| Phone | an answer is recorded | pushed at once even inside a backoff; while the service keeps failing, a forced attempt at most every 5 s (`FORCED_PUSH_GAP_MS`) |
| Phone | every 30 s | `syncOnce()` safety net; backoff capped at 30 s (`SYNC_BACKOFF_MAX_MS`, was 120 s) |

The phone cannot learn anything while iOS has suspended the app: a lookup made on the desktop shows on the phone when GoReview is next opened (forced round on activation). Only a push notification would change that, and none exists.

### How big a round is

- Responses are gzipped by the Node bridge (`packages/repository-service/src/compress.ts`) when the client sends `Accept-Encoding: gzip`, the body is JSON and over 1 KB.
- `POST /sync/pull` takes `limit` (the service caps it at 1000; both clients now ask for 1000), `documents: false` (neither client keeps private documents in its sync client, so neither asks for them any more), and answers `hasMore`.
- Reads (`GET`) carry a weak `ETag`; `If-None-Match` gets an empty `304`. The typed client (`createRepositoryApi`) keeps validators in memory only and uses them; nothing is written to disk. CORS allows and exposes the header.
- `GET /candidates` ranks the learner's whole list once per load (kept 20 s, only while the event log has not moved) instead of once per page.
- The home load asks for the knowledge batches together (four at a time).
- CORS `Access-Control-Max-Age` is 7200 (was 600). A cross-origin call that carries `Authorization` is preceded by an `OPTIONS` round trip unless the browser has remembered the answer.

### What the learner sees

Settings, Synchronisation, starts with one quiet line, for example *Up to date · sent 2 min ago · fetched 30 s ago · nothing waiting*, or *Not reaching the service: fetch failed · 2 waiting on this device · trying again in 12 s*, or *Sign in again to sync. Nothing on this device was lost.* The facts table and "Sync now" are unchanged. The header line stays hidden unless something needs attention.

## Measured

`scripts/sync-bench.mts` reproduces every number here:

```
npx vite-node --config scripts/vite.config.ts scripts/sync-bench.mts -- --account <file.json> [--base http://127.0.0.1:8790] [--events 300] [--distinct 97] [--no-gzip] [--legacy-client] [--link 150:5] [--bootstrap]
```

It signs in as two devices, pushes synthetic reading events from the "desktop", and measures pushes, cold and incremental pulls, the desktop-to-phone wake, a GoReview cold start request by request, and repeated reads with `If-None-Match`. `--legacy-client` makes the cold start behave as the app did before this work, `--no-gzip` withholds `Accept-Encoding`, `--link rtt:mbps` simulates a phone's connection (one round trip per request, the response bytes sharing one line). It adds events to the account it is given: use a test account, or `--bootstrap` on a fresh empty data directory.

Workload for the table: a fresh service, one account, 3,000 lookups over 800 different words, then a cold start as a new install makes it. "Before" is the unmodified service and `--no-gzip --legacy-client`; "after" is the new service and the defaults. Both on this PC.

| Measure | Before | After |
|---|---|---|
| Size of one event on the wire (JSON) | 800 bytes | 45 bytes gzipped (best case: the bench's events are near-identical; expect several times less saving on real reading) |
| Cold pull of the 3,002-event history | 7 requests (pages of 500), 2,399 KB | 4 requests (pages of 1000), 130 KB |
| GoReview cold start, fresh install: requests / bytes | 14 / 2,508 KB | 11 / 137 KB |
| ... elapsed on this PC (bytes cost nothing here) | 750 ms | 716 ms |
| ... elapsed on a simulated phone, 150 ms round trip, 5 Mbps | 6,988 ms | 2,553 ms |
| ... elapsed on a simulated good link, 60 ms, 25 Mbps | 2,511 ms | 1,350 ms |
| `GET /vocabulary` page (50 words): first / repeat | 96 KB / 96 KB | 3.7 KB / 0 KB (304) |
| `GET /candidates` page: first / repeat | 4.4 KB / 4.4 KB, 158 ms each (full re-rank) | 0.5 KB / 0 KB (304); one ranking per load |
| Incremental pull when nothing is new | 0.1 KB, 9-15 ms | unchanged |
| Desktop push to phone has the event (held `/sync/wait`) | 60 ms; 403 ms at 150 ms / 5 Mbps | unchanged: this part was already fast |
| Extension, after an outage: stranded events sent (median / worst, model below) | 2.5-3.5 min / 8.6 min | 15 s / 30 s (60 s if the worker slept) |

Other numbers taken while measuring: a push of 200 events takes 120-390 ms and does not grow over 15 batches; a push of one event takes 24 ms with 678 events in the log and 52 ms with 3,000. Projection is not the bottleneck. On the seeded pane test account on the running service (678 events) a cold start was 9 requests and 667 KB before the work. `GET /vocabulary` still costs the service 200-230 ms for 800 words (it scans the whole vocabulary per page); that is unchanged.

The "stranded events" row is a Monte Carlo of the extension's scheduling (`node scripts/sync-backoff-model.mjs`: events every 20-40 s while reading, reading stops 10 % before the outage ends, alarm phase random, outages of 1 to 60 minutes), not a field measurement. The tests prove the direction: the new timing tests fail against the old `sync.ts` and `context.ts`.

The "simulated phone" rows are what the bench's `--link` model predicts, not measurements on a phone. Where the real Cloudflare tunnel adds its own latency and compression the absolute numbers will differ; the bytes and request counts are real.

## Causes found

**Proved, and fixed here**

1. **Backoff held events back for minutes (extension).** The sync client backs off 2 s, 4 s ... to 5 minutes after each failed round and `syncOnce()` without `force` returns "skipped: backoff". The debounce and the alarm both called it unforced, so after an outage the stranded events waited out the backoff: median 2.5-3.5 minutes, worst 8.6. Now a queue that is not empty is always tried; the backoff is capped at 30 s; failures are retried on a 5/10/20/30 s ladder. Proof: `test/extension/sync-timing.test.ts` ("are sent by the next debounce round even while the sync client is in its backoff", "are sent at once by the alarm") fails on the old `sync.ts`.
2. **Alarm every 5 minutes (extension).** A worker that Chrome had put to sleep woke up to five minutes later to send what was waiting. Now every minute; installs that already hold the 5-minute alarm get it replaced.
3. **`online` did not send (extension).** Coming back online scheduled an unforced round, which the backoff could skip. Now forced.
4. **A new answer waited out the backoff (phone).** `record()` called `syncNow()` unforced and the backoff reached two minutes. Now a forced push, at most every 5 s while failing, and the cap is 30 s. Proof: `test/gopractice/sync-speed.test.ts` ("is sent at once when the service is back ...") fails on the old `context.ts`.
5. **Everything travelled uncompressed.** 800 bytes per event; a cold pull of 3,000 events was 2.4 MB in seven round trips. Now gzip, pages of 1000.
6. **Every pull could carry every document body.** Neither client keeps documents in its sync client, but without `documentsSince` the service returned all of them each round. Now `documents: false`. (The test accounts hold no documents, so there is no number; the structure is covered by `sync-speed.test.ts`.)
7. **No validators.** A vocabulary page was 96 KB every time. Now ETag/304 and an in-memory client cache.
8. **Candidates were re-ranked for every page** (136-158 ms a call at 3,000 events). Now once per load.
9. **The phone's profile cache ignored what a pull brought.** A language added in GoLearn waited up to ten minutes unless a live update arrived. A pull that appended events now marks the cache stale.
10. **Knowledge batches were serial.** Now four at a time.

**Proved, not fixable in code**

11. **The quick tunnel is gone.** `intention-floyd-median-wallace.trycloudflare.com` returns "DNS name does not exist" (checked with `Resolve-DnsName` and `curl`, exit 6), although the `cloudflared` process started on 2026-10-14 20:35 is still running. A quick tunnel has no uptime guarantee and a new address on every start. Until the extension and the phone share an address that does not change, sync is inconsistent whatever the code does: every push fails, every phone call fails, and the phone has to be signed in again after each new address.

**Not changed on purpose**

12. **The phone's queue and log are keyed by service address.** A new address signs the native app out and starts an empty queue; events recorded on the phone while the old address was dead stay under the old address (`test/gopractice/mobile.test.ts`, "retaining its queued events under its origin", states this as intended). Adopting them under the new address when the learner id matches would fix it, but it contradicts that test and Codex's stated design, so it needs the owner's decision. A stable address makes it moot. A new address now costs a 137 KB history download, not 2.5 MB. **2026-10-28:** no client can change the address any more (the fields are gone); it changes only with a build whose `config.json` names another, and the same rule applies then.
13. **Preflight round trips.** The PWA and the Capacitor shell call the service cross-origin with `Authorization`, so each distinct URL is preceded by an `OPTIONS` round trip until the browser remembers it (7200 s now; WebKit caps remembering at five minutes). Not measured here (the Browser pane would not make the cross-origin call). The real fix is native HTTP (the CapacitorHttp plugin) or serving the app from the service's own origin; both are changes in `packages/goreview-ios`, which is Codex's untracked work.

**Disproved**

14. **Sessions are not invalidated by a service restart.** Sessions are rows in SQLite (hash of the token, 30-day expiry); a restart keeps them. After 30 days, or a sign-out elsewhere, the phone says "Sign in again to sync. Nothing on this device was lost." and the extension sets `needsSignIn`; nothing is lost either way.
15. **The native shell does use `/sync/wait`.** The live loop (`packages/gopractice/live.ts`) holds it while the app is visible. iOS suspends the app in the background by design.
16. **Projection is not slow.** See the push timings above.

## What still costs, and was left alone

- The extension pulls and discards every event another device made (the phone's reviews) each round. Gzip makes this cheap; a status-only pull would make it free but needs a change in `packages/repository-sync`.
- `GET /vocabulary` is 200-230 ms of service time for 800 words. ETag saves the bytes, not the scan.
- A long history is still downloaded in full by a fresh install (4 requests, 137 KB at 3,000 events).

## What needs the owner

1. **A stable HTTPS address.** A named Cloudflare tunnel on a domain he owns, or the Render/VPS deployment in `GoReview-sync-service-guide.md`. Then put that one address in the extension's setup and the phone. This is the only fix for "inconsistent".
2. **Restart the local service** to pick up gzip, validators, paging and the candidate cache (about 40 s to listen): `npx vite-node packages/repository-service/src/main.ts --port 8790 --data data/local-repository --host 127.0.0.1`. I did not restart the running one.
3. **Rebuild and reload the extension** (`npm run ext:build`, reload in Brave) for the timing fixes and the 1-minute alarm.
4. **The next TestFlight build** for the phone's fixes (forced push, backoff cap, no documents, 1000-event pages, Sync line). The hosted PWA needs a rebuild and deploy as well.
5. **A decision on item 12** (adopt stranded events when the address changes), and on native HTTP for item 13.

## Live address (2026-10-17)

The Repository service is reachable at https://repo.golearn-global-languages.com through a named Cloudflare tunnel from the
owner's PC (infra/cloudflare/README.md: tunnel goreview-repository, zone golearn-global-languages.com). Build the installable
edition against it with GOPRACTICE_SERVICE_URL=https://repo.golearn-global-languages.com (the copied config.json gets that
serviceUrl; the source config.json keeps the local address), and use the same address as REPOSITORY_SERVICE_URL for the
next TestFlight build. The PC must still be on and online; the tunnel is not yet installed as a Windows service.

**Default address (2026-10-27).** The owner made `https://go-v0.onrender.com` the default address of every system: the hosted GoReview and Biblia and the setup
app are built and published with it, the extension's `app/config.json` names it, and the iPhone shells take it as `REPOSITORY_SERVICE_URL`. The
canonical name `https://repo.golearn-global-languages.com` is a DNS-only CNAME to the same Render service; it stays valid for anyone who typed it, but it is
blocked by some home routers (the owner's among them), which is why it is no longer the default anywhere. Build against the default:
`GOPRACTICE_SERVICE_URL=https://go-v0.onrender.com` for the installable GoReview, `REPOSITORY_SERVICE_URL=https://go-v0.onrender.com` for a TestFlight stage.
