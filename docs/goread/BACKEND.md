# GoRead — the team server (contract v3, 2026-10-02 — open to read, a whitelist to add)

Until now "the team" in Team Texts meant every learner on one device. This server lets a team share texts between
devices. It is deliberately small: one Node program, no third-party service, no accounts, no codes, no personal data beyond a
display name the learner types.

**Teams (v3).** A team exists on its own, independently of who uses it. Anyone with the app may join any team and read
what is there. **Adding** is open to the people on that team's **whitelist**: each has a personal contributor key,
issued by whoever keeps the server (the *keeper*) and revocable one person at a time. Nothing added is taken away: a
text, once added, stays — it cannot be replaced or deleted through the app, and revoking a key leaves that person's
texts where they are. Only the keeper can remove a text, in the database.

**The whitelist.** One row per person per team: `{ team, name, keyHash, createdAt, revokedAt? }`. A key is 32
random bytes, base64url, shown once when it is made and never stored — the server keeps only its sha256. The name on
the row is what the shelf shows as "Added by"; the client no longer chooses it.

Keeper commands (`server/goread/admin.ts`, run where the keeper keeps the server's data):
`whitelist add --team <course> --name "<name>"` prints the new key once; `whitelist list --team <course>` shows
names, dates and whether revoked, never keys; `whitelist revoke --team <course> --name "<name>"`. With `--sql` the
same commands print SQL for the Cloudflare database instead of writing a local file (the key is still made locally;
only its hash goes into the SQL).

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

All bodies are JSON. Reading carries no credential. `PUT` carries `Authorization: Bearer <contributor key>`; a missing,
unknown or revoked key for that team is `401 { error: 'not-on-whitelist', message: "Adding texts to the <country>
team's shelf is open to the people on its list. Ask whoever keeps the team's list for a contributor key, and enter it in
Settings → Team sharing. You can still read everything here." }`. Keys are compared by their sha256, in constant time.
A course the server does not know: `404 { error: 'no-such-team' }`.

`GET /teams/:course/me` with the key: `200 { team, name }` for a key on the list (so the app can say "You can add
texts as Ana"), `401 not-on-whitelist` otherwise.

| | |
|---|---|
| `GET /health` | `200 { ok: true, service: 'goread', version: 1 }` |
| `GET /teams/:course/texts[?since=<ISO>]` | `200 { course, lang, texts: TextSummary[] }` — summaries only, newest last; `since` keeps those added or updated after that time |
| `GET /teams/:course/texts/:id` | `200 { document, addedBy, addedAt, updatedAt, sha256 }` or `404 { error: 'no-such-text' }` |
| `PUT /teams/:course/texts/:id` body `{ document }` + key | `201 { summary: TextSummary }` (new); `409 { error: 'already-there', message }` when the id exists — a text once added is never replaced; `422 { error, message }` for a refused document (see below) |

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

`addedBy` is the name on the whitelist row of the key that added the text (an `addedBy` in the body is ignored).

**Two runtimes, one handler.** `server/goread/handler.ts` takes a web `Request` and returns a `Response`, with the store
and the document check passed in. Node (`main.ts`, node:http + node:sqlite) passes the **full** validator
(`validateBatch` with every language adapter). Cloudflare (`worker.ts`, Workers + D1) passes the **light** check only —
measured: the full validator takes ~20 ms per chapter warm and ~400 ms cold, and the free plan allows ~10 ms of CPU per
request. The light check: the document's shape and required fields, size, id, `lang`, the rights table, generated, the
language gate. A text that passes the light check but is broken in a deeper way is still turned away on every device,
because fetching runs it through the app's own importer, which validates fully.

## The app side

- Settings → **Team sharing**: the server address, and (optional) **Your contributor key**, both kept on this device
  only (`prefs`). A status line says whether the server answers (`/health`) and, with a key, "You can add texts to the
  <country> team as <name>." (`/me`) or the 401 sentence. Without a key everything is readable and the Share buttons
  say why they are not there.
- Team Texts page, when a server is configured: **"Fetch team texts"** pulls the summaries, imports the documents the
  device does not have yet (through the ordinary importer, so every check runs again locally) and records them in the
  `goread:<lang>` row with the server's `addedBy`/`addedAt`. **"Share with the team"** on a book row sends its chapters
  (the document rebuilt from the store: `src/goread/documentOf.ts`); a book that may not be shared shows why instead of
  a button. After a local import on this page, the same documents are offered for sharing with one click.
- Nothing is sent without a tap. Nothing is fetched without a tap. No background sync in v1.

## Not in v3

Accounts, passwords, self-service sign-up, any removal through the app, audio, a hosted instance (the keeper
deploys; `docs/goread/DEPLOY.md` has the steps). Where to host it is
the owner's decision; it runs on any machine with Node 24 and a port.

## Status

v1 (team codes, replace and delete by the adder) was built and checked end to end on 2026-10-02 (commit 77d77db).
v2 (open teams, immutable texts, no code) replaces it the same day; see the commit for what was checked.
