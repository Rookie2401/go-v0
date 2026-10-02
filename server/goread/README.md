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

## Open teams

There is nothing to configure: every course of the app (`COURSES`) is a team, and there are no codes, no sign-in and no
`Authorization` header. Anyone who can reach the server can read a team's texts and add to them. A text, once added, is
never replaced or deleted through the server (`PUT` of an existing id is `409 already-there`, whoever asks; there is no
`DELETE`). Whoever runs the server can remove one in `goread.sqlite`. `addedBy` is a 1-60 character display name and
decides nothing.

## What it answers

| | |
|---|---|
| `GET /health` | `200 { ok, service, version }` |
| `GET /teams/:course/texts[?since=<ISO>]` | summaries, oldest first; `404 no-such-team` for an unknown course |
| `GET /teams/:course/texts/:id` | the document and who added it, or `404 no-such-text` |
| `PUT /teams/:course/texts/:id` | `201 { summary }`; `409 already-there`; or one of the `422`s below |

Other methods are `405`. CORS: any origin; methods `GET,PUT,OPTIONS`; header `Content-Type`.

## What it refuses (`422 { error, message }`, written for the learner)

| error | when |
|---|---|
| `id-mismatch` | `document.id` is not the id in the address |
| `wrong-language` | `document.lang` is not the course's language |
| `not-the-team-language` | the text itself looks like another language (`src/ingest/language.ts`) |
| `not-shareable` | rights: only `owner-authored`, or `public-domain` / `licensed` with a verification record (`by` + `checkedAt`, in `source.verification` or `scripture.verification`), are shared; personal copies, `user-private`, `generated`, `unverified` never; and any document marked `generated: true` or `authorship: 'generated'`, whatever its rights say |
| `invalid-document` | the body is not `{ document, addedBy }`, `addedBy` is not 1-60 characters, or `validateBatch` found an error (listed in `issues`) |
| `too-large` | the request body is over 2 MB |

The checks run in that order; then, if the id is already on the shelf, `409`; otherwise the text is stored.

## Logs

One line per request on stdout: `METHOD /path status ms`. Never a body or a query string.

Tests: `npx vitest run test/server/goread.test.ts`.
