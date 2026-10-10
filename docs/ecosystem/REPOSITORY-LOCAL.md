# The device-local Repository

Status: 2026-10-09. Package `packages/repository-local`; worker integration in `packages/golearn-extension/src/background/localRepo.ts`.
Tests: `test/repository-local/`, `test/extension/background.local.test.ts`, `test/extension/profile.local.test.ts`.

## The decision this implements

An account is **optional**. A learner can use GoLearn and GoPractice entirely on one device with no account. An account exists to keep
progress across devices, and nothing else: it adds no feature of the reader, the card or the review on the device that has the history.

Before this, the extension kept encounters in a local queue and took the learner-model lines of the card from the server, and GoPractice needed the
server for everything. Now the device holds a real Repository of its own — the same store rules, the same projection engine, the same linguistic layer
and the same request handler as the server — and the card and the review ask it.

## What is local

`openLocalRepository({ area })` assembles, in one process, the service's own parts:

| part | what it is here |
|---|---|
| store | `createMemoryStore` (the server's rules, `repository-store`), mirrored row by row into a `KeyValueArea` (write-through) |
| projection | the real `createProjectionEngine`; the knowledge projection is **never stored**: it is rebuilt from the events when the repository opens |
| linguistics | the real linguistic service for Albanian and Spanish; a small adapter-based resolver for any other language the host passes an analyser for; a form-only record otherwise (`linguistics.ts`) |
| service | `handle` (the request handler), reached through the typed client `createRepositoryApi` wired straight to it: every route a server client has exists here, with the same validation, the same "own data only" rule and the same source-restriction capping |
| crypto | `crypto.getRandomValues` / `randomUUID`; SHA-256 in plain JavaScript (the port is synchronous, `crypto.subtle` is not; tested against Node's); **no scrypt and no password** |

Rows in the area, all under one prefix (`golearn:repo:` in the extension; `local-repo:` by default):

```
<p>meta                         the anonymous learner, the device, the creation time (written with the first row that follows, never alone)
<p>event:<seq>                  { v: 1, event: StoredEvent }          one row per event, keyed by sequence number
<p>unit:<id> relation:<k> analysis:<id> alias:<k> pack:<k>           Layer A rows a lookup produced (no learner data)
<p>enrolment:<id> pref:<language> doc:<id> tomb:<id>                  enrolments, informative preferences, private documents, deletion receipts
<p>uploaded:<eventId>           { to: <account learner>, at }  or  { from: <account learner>, at }
<p>pull                         the cursor of the last pull from an account
<p>skipped:<eventId>            an event the current contract no longer accepts: kept, not loaded
golearn:local-active            the enrolment the learner chose to read with
golearn:local-upload            the outcome of the last upload (counts and an error line, no event)
```

The anonymous local learner has an account row marked `localOnly` with the address `local@device` and no password hash that can match. The session
token is made at open, held in memory only, and is different after every restart: it is in no stored row. `createSession` and `createAccount` do not work
here (there is nothing to sign in to), and the message interface does not forward them.

Enrolments: one per language the learner picks (no team). The setup page chooses a language with `op: 'enrol'`; the learner's choice is the **active
language** when there is no session. A lookup in a language with no enrolment gets an automatic one (no goals) because the service refuses an event with no
enrolment; an automatic enrolment never becomes the active language and is replaced, not duplicated, when the learner chooses that language.

## What the account adds

Nothing is needed on the device that recorded the history. Signing in adds three things:

1. **One upload.** On a successful sign-in the worker calls `uploadTo(api)` with the session's client: it sends every event not yet sent, in batches of
   100, through `/events`, `/reviews` (review and listening events) or `/writing` (`ProductionRecorded`), exactly as a server client would. Each event is
   sent under the account's identity (the local learner and enrolment are replaced by the account's), with its own id and `dedupeKey`. A `stored: false` duplicate answer counts as success. A marker `uploaded:<id>` is kept, so a
   second sign-in sends nothing and asks for nothing. The local copy stays.
   **The account is never enrolled in a language it did not choose.** An event whose language the account has no open enrolment in *waits*: it stays pending
   and is not a failure (`inspectLocal().waiting`, `lastUpload.waiting`). When the account gets that enrolment (`MSG.enrol`, a refresh), the worker uploads
   again at once if anything is pending, and the waiting events go under it.
   An event is sent to **one** account: what went to account A is never sent to account B (the service would refuse a repeated id anyway).
   An event recorded while signed in is marked as the account's already (the sync queue sends it), so it is not repeated.
2. **A pull.** After the upload, `pullFrom(api)` reads the account's log page by page (`GET /events`) and appends the events this device does not have,
   under the local learner, marked `{ from }` so they are never uploaded; the surfaces of pulled lookups are registered, so the units exist here. It is
   idempotent (cursor, and an event already held is skipped).
3. **Cross-device continuity.** The projection the card shows is now the union of this device's history and the account's.

Not sent: events the local service wrote itself (`producer.app` = `repository`: enrolment changes, corrections) — a client may not name that producer and the
account's enrolments are its own; private documents (GoTell's own sync handles them); the sentence or page text (none is ever stored). Source restrictions are
stored **capped to `unknown`** (the handler's fail-closed default, because the policy table is a server file): the account's service applies its own table to
what it receives.

If the upload fails (offline, refused), the events stay pending and are tried at the next sign-in or `op: 'upload'`; the outcome is in `golearn:local-upload`.

## What never leaves the device without a sign-in

- The background worker's only network call is its `fetch`; the device Repository has no network code at all (its in-process client uses an address that is
  not a web address, `repository://device`, and calls the handler directly). `bundle.test.ts` and `security.bundle.test.ts` still assert one `fetch` in the worker.
- The single road out is `uploadTo(api)` with a session the learner created by signing in. With no session `authenticated()` is undefined and nothing is sent.
- A content script cannot use `MSG.localRepo` (extension pages only); the card receives only the compacted rows (the dimensions, no learner id).
- "Clear local data" (`MSG.clearLocal`, or `op: 'clear'`) removes **every row** under the prefix and the two `golearn:local-*` keys. After it, the area holds
  no row of the repository at all — not even a fresh anonymous identity, which is written only with the first row after it
  (`test/audit/privacy.devices.test.ts` checks the storage areas are empty of the learner).
- Signing out does not clear the device Repository: the history is the learner's; clearing is a separate, explicit act.

## The extension's use of it

- **Recording.** `recorder.record` calls `onRecorded(event, attributed)` after the event is in the local log and the queue (awaited, failures ignored); the event
  is appended to the Repository with the same id, the local learner/enrolment/device in place of the placeholder or the account's. No change to what the
  sync client sends.
- **The card.** `profile.knowledgeFor`: with no session the rows come from the device (`connected: false`, `source: 'device'`); with a session from the
  account as before, and when the account cannot be reached (offline, 401, error) the units the cache does not hold are filled from the device
  (`source: 'device'`, `error` kept). The explanation depth with no session is what the device infers. **The card (`src/content/controller.ts`) still reads
  `!reply.connected` as "not connected"; it must treat `source === 'device'` as ready for the lines to show (UX lane).**
- **Active language.** `publicStatus().languageId` = the session's, else the learner's choice on the device, else Albanian.
- **Sign-in.** `onConnect` awaits `uploadAndPull()` (errors are recorded, never thrown), so when `connect` returns the history is on the account.

### The message contract (`MSG.localRepo`, extension pages only)

`{ type: 'golearn:local-repo', op, ... }` → always `{ ok, ... }` (`{ ok: false, error }` on a refusal). Types: `LocalRepoRequest`, `LocalRepoStatus`, `LocalEnrolmentView` in `protocol.ts`.

| op | request | reply |
|---|---|---|
| `status` | | `available, events, pendingUpload, uploaded, fromAccount, enrolments[], languageId?, storedChars, writeFailures, lastWriteError?, lastUpload?` |
| `knowledge` | `unitIds?, languageId?` | `knowledge: UnitKnowledge[]` |
| `candidates` | `languageId?, limit?` | `candidates: ReviewCandidate[]` (for the language's, else the active, enrolment) |
| `export` | | `format: 'golearn-local-export@1', exportedAt, events, enrolments` |
| `enrolments` | | `enrolments[]` (open ones) |
| `enrol` | `languageId, packId?, packVersion?, goals?` | `enrolment` — idempotent per language; becomes active |
| `select` | `enrolmentId` | `enrolment` |
| `end` | `enrolmentId` | |
| `identity` | | `learnerId, deviceId` |
| `upload` | | `upload?: { sent, duplicates, failed, waiting }, pulled?, skipped?: 'not-connected' \| 'unavailable'` |
| `rebuild` | | |
| `clear` | | |
| `api` | `method, args?` | `result: ApiResult` — one method of the typed client (`LOCAL_API_METHODS`; no accounts or sessions) |

`connectLocalRepository(send, MSG.localRepo)` (package `repository-local`) gives an extension page a `LocalRepository` over these messages — **the page must
not open a second copy of the repository over the same area**: two in-memory copies of write-through rows would number their events from the same sequence and
overwrite each other. One repository, in the worker; pages use the proxy. Its `uploadTo(remote)` cannot carry `remote` (a token) across a message, so it asks the
worker to upload to the account the worker is signed in to, and to pull.

## Size budget

- **Storage.** `chrome.storage.local` allows about 10 MB for the whole extension (`unlimitedStorage` is deliberately not requested; `security.bundle.test.ts`
  forbids it). Measured (Albanian lookups, one event each, `inspectLocal().storedChars`): about **2.0 KB per distinct new word** (its event, form, lexeme,
  relations and analysis), about **0.5 KB per repeated lookup**. The extension's own log and queue hold another copy of each event (about 1 KB). Roughly 3,000
  distinct words fit with room to spare. A write the browser refuses does not fail the operation: the data stays in memory for the session and `writeFailures` /
  `lastWriteError` say so in `status`.
- **Worker bundle.** `background.js` went from 347,383 B to 505,047 B (493 KB) with the Repository (the handler 34 KB, the engine 30 KB, the linguistic
  layer 19 KB, the store 12 KB, this package 19 KB, minified). The ceiling in `bundle.test.ts` is 520 KB. The worker still carries Albanian only: the Spanish
  adapter that the linguistic resolver links is replaced in the worker build by `src/background/esStub.ts` (`leanSpanish` in `vite.config.ts`), and the
  handler stub is kept for every other script.
- **Startup.** Opening reads all rows once (`get(null)` filtered by prefix), re-appends the events and rebuilds the projection: linear in the log. It is
  started when the worker registers, so the first lookup does not wait for it.

## Open

- The unit rows of Layer A are recomputed on the device by the same code as on the server, but with the analysers the worker has (Albanian). Other
  languages record the form only until a worker can load them; the page-side proxy cannot change that.
- Documents (GoTell) are persisted locally but not uploaded by `uploadTo`.
- The review scheduler and GoTell are not wired to this Repository here; they can use `connectLocalRepository` or the `api` op.
