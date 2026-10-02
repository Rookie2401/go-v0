# GoRead — the team server (contract v1, 2026-10-02)

Until now "the team" in Team Texts meant every learner on one device. This server lets a team share texts between
devices. It is deliberately small: one Node program, no third-party service, no accounts, no personal data beyond a
display name the learner types.

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
- **Team codes** are read from `GOREAD_TEAM_CODES` in the environment, `course=code` pairs separated by commas
  (`honduras-es=…,thailand-th=…`), or from `<data>/team-codes.json` (`{ "honduras-es": "…" }`). A course without a code
  is closed: every request to it is refused. The program never prints a code. Codes are compared in constant time.
- CORS: any origin may call it (the app is a static site); only the headers below.
- Logs one line per request to stdout (method, path, status, ms); never a body, never a code.

## HTTP

All bodies are JSON. Every `/teams/…` request carries `Authorization: Bearer <team code>`; a wrong or missing code is
`401 { error: 'not-a-team-member', message }`. A course the server does not know: `404 { error: 'no-such-team' }`.

| | |
|---|---|
| `GET /health` | `200 { ok: true, service: 'goread', version: 1 }` |
| `GET /teams/:course/texts[?since=<ISO>]` | `200 { course, lang, texts: TextSummary[] }` — summaries only, newest last; `since` keeps those added or updated after that time |
| `GET /teams/:course/texts/:id` | `200 { document, addedBy, addedAt, updatedAt, sha256 }` or `404 { error: 'no-such-text' }` |
| `PUT /teams/:course/texts/:id` body `{ document, addedBy }` | `201` (new) or `200` (same id, replaced by the same `addedBy`) `{ summary: TextSummary }`; `403 { error: 'not-yours' }` when another `addedBy` holds the id; `422 { error, message }` for a refused document (see below) |
| `DELETE /teams/:course/texts/:id` body `{ addedBy }` | `204`; `403 not-yours`; `404 no-such-text` |

```ts
interface TextSummary { id: string; title: string; lang: string; addedBy: string; addedAt: string; updatedAt: string; sha256: string; bytes: number; workId?: string; chapter?: { index: number; title?: string } }
```

`:id` is the document's own `id` (the import document id, e.g. `el-viajero-ch01`); the body's `document.id` must equal it.

`422` errors, each with a `message` written for the learner:
`not-the-team-language` (the language gate's sentence), `not-shareable` (the rights table above; for a personal copy:
"Your own copy of a published book stays on your device — it is yours to read, not to redistribute. Texts your team
wrote can be shared."), `invalid-document` (with the validator's issues in `issues`), `too-large`, `id-mismatch`,
`wrong-language` (document `lang` ≠ the course's language).

`addedBy` is a display name (1–60 characters). It is not an identity: the server trusts the team code, and within a
team the name only decides who may replace or delete a text. That is the honest limit of a code-shared team.

## The app side

- Settings → **Team sharing**: server address and team code, kept on this device only (`prefs`), never sent anywhere but
  to that server. A status line says whether the server answers (`/health`).
- Team Texts page, when a server is configured: **"Fetch team texts"** pulls the summaries, imports the documents the
  device does not have yet (through the ordinary importer, so every check runs again locally) and records them in the
  `goread:<lang>` row with the server's `addedBy`/`addedAt`. **"Share with the team"** on a book row sends its chapters
  (the document rebuilt from the store: `src/goread/documentOf.ts`); a book that may not be shared shows why instead of
  a button. After a local import on this page, the same documents are offered for sharing with one click.
- Nothing is sent without a tap. Nothing is fetched without a tap. No background sync in v1.

## Not in v1

Accounts, passwords, per-learner identity, audio, deletion by anyone but the adder, a hosted instance. Where to host
it is the owner's decision; it runs on any machine with Node 24 and a port.

## Status (2026-10-02, evening)

Built and checked end to end on one machine: the server on a local port with a throwaway code; the app in two sandbox
databases as two devices — one added a text its team wrote (the "Our team or I wrote it" choice) and shared it, the
other fetched it and read it in the reader, labelled "Your team's text". A learner's own copy of a published book was
offered no Share button, with the reason. The server logged no code. Tests: `test/server` (21), `test/goread` (39),
`test/ingest/teamText.test.ts`, `test/ingest/ownership.test.ts`, `test/ui/teamSharing.test.tsx`, `test/ui/teamTexts.test.tsx`.

Not done: hosting (where the server runs and who sets the team codes is the owner's decision); an `npm run` alias for
the server (package.json was being edited by another tool at the time — the command above works as is); anything
beyond "Not in v1".
