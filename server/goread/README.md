# GoRead team server

A small Node program that lets a team share import documents between devices. The contract (routes, errors, what is
never shared) is [`docs/goread/BACKEND.md`](../../docs/goread/BACKEND.md); this file only says how to run it.

```
npx vite-node server/goread/main.ts --port 8787 --data data/goread
```

- `--port` (default 8787; `0` picks a free one), `--data` (default `data/goread`, created if missing, git-ignored),
  `--host` (default `127.0.0.1`). It prints `goread listening on http://127.0.0.1:<port>` when ready.
- Needs Node 24 (it uses the built-in `node:sqlite`) and no other dependency. The texts are in `<data>/goread.sqlite`.
- Stops cleanly on Ctrl-C / SIGTERM.

## Team codes

One code per team (course id), read from
1. the environment: `GOREAD_TEAM_CODES="honduras-es=<code>,thailand-th=<code>"`, and
2. `<data>/team-codes.json`: `{ "honduras-es": "<code>" }`.

Where both name a course, the environment wins. A course without a code is closed: every request to it gets `401`.
Clients send `Authorization: Bearer <code>`; codes are compared in constant time and are never printed, logged or
returned. Use long random codes (the program warns about codes under 12 characters).

## What it refuses

Every refusal is a `422 { error, message }` written for the learner (`403 not-yours` for someone else's text):

| error | when |
|---|---|
| `id-mismatch` | `document.id` is not the id in the address |
| `wrong-language` | `document.lang` is not the course's language |
| `not-the-team-language` | the text itself looks like another language (`src/ingest/language.ts`) |
| `not-shareable` | rights: only `owner-authored`, or `public-domain` / `licensed` with a verification record (`by` + `checkedAt`, in `source.verification` or `scripture.verification`), are shared; personal copies, `user-private`, `generated`, `unverified` never |
| `invalid-document` | the body is not `{ document, addedBy }`, `addedBy` is not 1-60 characters, or `validateBatch` found an error (listed in `issues`) |
| `too-large` | the request body is over 2 MB |

The checks run in that order, then the ownership check (`403 not-yours`), then the text is stored.

## Logs

One line per request on stdout: `METHOD /path status ms`. Never a body, a query string or a code.

Tests: `npx vitest run test/server/goread.test.ts`.
