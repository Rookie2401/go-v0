# GoRead — the team server (contract v2, 2026-10-02 — open teams)

Until now "the team" in Team Texts meant every learner on one device. This server lets a team share texts between
devices. It is deliberately small: one Node program, no third-party service, no accounts, no codes, no personal data beyond a
display name the learner types.

**Open teams (v2).** A team exists on its own, independently of who uses it. Anyone with the app may join any team,
read what is there and add to it, and leave again. Nothing a learner adds is taken away: a text, once added, stays —
it cannot be replaced or deleted through the app. Only whoever runs the server can remove one, in the database.
There is nearly no security, by decision; the server's only defences are the checks below on what a text is.

## What is shared, and what never is

A **shared text** is an import document (Go text format, version 2) exactly as a learner imported it, plus who added it
and when. Everyone with the team's code can fetch it and read it in their own Go.

Never shared, refused by the server and never offered by the app:

| `source.rights` of the document | shared? | why |
|---|---|---|
| `owner-authored` (written by the team or the course) | yes | theirs to share |
| `public-domain`, `licensed` — with a `source.verification` record | yes | the record says who checked |
| `public-domain`, `licensed` — without one | no | "unverified" in all but name |
| `personal-copy` (a learner's own copy of a published book) | **no** | sharing it is redistribution; it stays on the device |
| `user-private`, `generated`, `unverified` | no | private, or not fit to publish |

A text in another language than the team's is refused with the same kind sentence the app uses (`src/ingest/language.ts`),
and so is a document that does not validate (`validateBatch`), one over 2 MB, or one whose `lang` is not the course's.

## Running it

```
npx vite-node server/goread/main.ts --port 8787 --data data/goread
```

- `--data` is a directory (created if missing; git-ignored). It holds `goread.sqlite` (Node's built-in `node:sqlite`).
- Every course the app knows (`COURSES`) is a team; there is nothing to configure.
- CORS: any origin may call it (the app is a static site); only the headers below.
- Logs one line per request to stdout (method, path, status, ms); never a body.

## HTTP

All bodies are JSON. No request carries any credential. A course the server does not know: `404 { error: 'no-such-team' }`.

| | |
|---|---|
| `GET /health` | `200 { ok: true, service: 'goread', version: 1 }` |
| `GET /teams/:course/texts[?since=<ISO>]` | `200 { course, lang, texts: TextSummary[] }` — summaries only, newest last; `since` keeps those added or updated after that time |
| `GET /teams/:course/texts/:id` | `200 { document, addedBy, addedAt, updatedAt, sha256 }` or `404 { error: 'no-such-text' }` |
| `PUT /teams/:course/texts/:id` body `{ document, addedBy }` | `201 { summary: TextSummary }` (new); `409 { error: 'already-there', message }` when the id exists — a text once added is never replaced; `422 { error, message }` for a refused document (see below) |

There is no DELETE: what a learner adds stays. (`PUT` of an id that exists answers 409 even for the same `addedBy`.)

```ts
interface TextSummary { id: string; title: string; lang: string; addedBy: string; addedAt: string; updatedAt: string; sha256: string; bytes: number; workId?: string; chapter?: { index: number; title?: string } }
```

`:id` is the document's own `id` (the import document id, e.g. `el-viajero-ch01`); the body's `document.id` must equal it.

`422` errors, each with a `message` written for the learner:
`not-the-team-language` (the language gate's sentence), `not-shareable` (the rights table above; for a personal copy:
"Your own copy of a published book stays on your device — it is yours to read, not to redistribute. Texts your team
wrote can be shared."), `invalid-document` (with the validator's issues in `issues`), `too-large`, `id-mismatch`,
`wrong-language` (document `lang` ≠ the course's language).

`addedBy` is a display name (1–60 characters), shown beside the text as who added it. It is not an identity and
decides nothing; anyone may write any name. That is the honest limit of an open team.

## The app side

- Settings → **Team sharing**: the server address, kept on this device only (`prefs`). A status line says whether the
  server answers (`/health`). No code, no sign-in: the team is the course the learner chose.
- Team Texts page, when a server is configured: **"Fetch team texts"** pulls the summaries, imports the documents the
  device does not have yet (through the ordinary importer, so every check runs again locally) and records them in the
  `goread:<lang>` row with the server's `addedBy`/`addedAt`. **"Share with the team"** on a book row sends its chapters
  (the document rebuilt from the store: `src/goread/documentOf.ts`); a book that may not be shared shows why instead of
  a button. After a local import on this page, the same documents are offered for sharing with one click.
- Nothing is sent without a tap. Nothing is fetched without a tap. No background sync in v1.

## Not in v2

Accounts, passwords, per-learner identity, any removal through the app, audio, a hosted instance. Where to host it is
the owner's decision; it runs on any machine with Node 24 and a port.

## Status

v1 (team codes, replace and delete by the adder) was built and checked end to end on 2026-10-02 (commit 77d77db).
v2 (open teams, immutable texts, no code) replaces it the same day; see the commit for what was checked.
