# GoRead team server

A small server that lets a team share import documents between devices. The contract (routes, errors, what is never
shared) is [`docs/goread/BACKEND.md`](../../docs/goread/BACKEND.md); the Cloudflare steps are
[`docs/goread/DEPLOY.md`](../../docs/goread/DEPLOY.md). This file says what is where.

## Two runtimes, one handler

| file | what |
|---|---|
| `handler.ts` | `handle(request: Request, { store, courses, check, now? }): Promise<Response>`; web APIs only, every route and error |
| `check.ts` | `lightCheck(doc, course)`: shape, size, id, `lang`, rights table (generated included), language gate on the first 20,000 characters. No adapters. |
| `check-full.ts` | `fullCheck`: `lightCheck`, then `validateBatch` with every language adapter (Node only) |
| `store.ts` | the async `GoreadStore` contract: the shelf (`texts`) and the whitelist (`contributors`) |
| `store-sqlite.ts`, `store-d1.ts` | `node:sqlite` and Cloudflare D1 (a minimal local `D1Like` interface); both use `schema.sql` |
| `main.ts` | Node: node:http bridge + sqlite + `fullCheck` |
| `worker.ts` | Cloudflare: `export default { fetch(req, env) }` with D1 + `lightCheck`; `wrangler.toml.example` is its config |
| `admin.ts` (`admin-lib.ts`) | the keeper's whitelist commands |

## Run it on Node

```
npx vite-node --config server/goread/vite.config.ts server/goread/main.ts --port 8787 --data data/goread
```

- `--port` (default 8787; `0` picks a free one), `--data` (default `data/goread`, created if missing, git-ignored),
  `--host` (default `127.0.0.1`). It prints `goread listening on http://127.0.0.1:<port>` when ready.
- Needs Node 24 (built-in `node:sqlite`); no other dependency. Stops cleanly on Ctrl-C / SIGTERM.
- One log line per request: `METHOD /path status ms`; never a body, a query string or a key.

## Who may do what

Every course of the app is a team. **Reading is open.** **Adding** (`PUT`) needs `Authorization: Bearer <contributor key>`
for a person on that team's whitelist; the text's `addedBy` is the name on that row (a body `addedBy` is ignored).
`GET /teams/:course/me` says who a key belongs to. A text, once added, is never replaced (`409 already-there`) and cannot
be deleted through the server. A key is 32 random bytes, base64url, shown once; only its sha256 is stored, and digests are
compared in constant time.

```
npx vite-node server/goread/admin.ts whitelist add    --team honduras-es --name "Ana" [--data data/goread | --sql]
npx vite-node server/goread/admin.ts whitelist list   --team honduras-es [--data data/goread | --sql]
npx vite-node server/goread/admin.ts whitelist revoke --team honduras-es --name "Ana" [--data data/goread | --sql]
```

Without `--sql` they act on the local sqlite file (`add` prints the key on stdout and a "copy this key now; it is not
stored" line on stderr). With `--sql` they print SQL for D1 on stdout (the key, made locally, goes to stderr).

## What it refuses

`401 not-on-whitelist` (no, unknown or revoked key), then `422 { error, message }` written for the learner (`issues` for
`invalid-document`): `id-mismatch`, `wrong-language`, `not-the-team-language`, `not-shareable` (only `owner-authored`, or
`public-domain` / `licensed` with a verification record, `by` + `checkedAt`, at `source.verification` or
`scripture.verification`; never personal copies, `user-private`, `generated`, `unverified`, or anything marked
`generated: true` / `authorship: 'generated'`), `invalid-document`, `too-large` (over 2 MB, counted on the body stream);
then `409 already-there` when the id is on the shelf.

Tests: `npx vitest run test/server`.
