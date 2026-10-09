# Security audit: Repository service, GoLearn extension, contract validators, remote-AI gates

Date: 2026-10-09. Owner of this file and of `test/audit/security.*`: the security audit session.
Remediation 2026-10-09: S-01 to S-13 are **Fixed** (S-14 is handled separately); the product code that changed is listed under "Fixes" at the end. Every `it.fails` of the audit is now an ordinary `it` that proves the fix.
Suite: `npx vitest run test/audit/security.*.test.ts` → **8 files, 341 tests, all green**, no `it.fails` left (audit: 7 files, 319 tests, 44 of them `it.fails`); `npx tsc -b` clean for these files and the packages.

## How to read this

The tests are adversarial: each one states the *secure* behaviour. At audit time, where the product did not have it, the test was written with `it.fails`
(its title began `DEFECT`). The remediation fixed S-01 to S-13 and turned each of those tests into an ordinary `it` (title begins `FIXED S-nn`), so each one is now the
regression test of its fix; `test/audit/security.fixes.test.ts` adds the edges and the legitimate inputs. The service tests run once per store, memory and SQLite.
Tests titled `FINDING` pin down behaviour that is accepted or by design, so a change to it is noticed.

Targets and how they were driven:

| target | driven with |
|---|---|
| Repository service `packages/repository-service/src/handler.ts` | raw `Request`s and `createInProcessApi` over the REAL stack: real memory store **and** real SQLite store (file, read back through a second connection), real projection engine, real linguistics, fast test hash (real scrypt in two tests) |
| extension background worker (`message router`, `recorder.ts`, `session.ts`, `gloss.ts`, `profile.ts`, `sync.ts`) | the real worker over a fake chrome and the real service handler; `test/audit/security.extrig.ts` records every request in full (URL, headers, body) and refuses to leave the service origin |
| content script, card, controller, parser, web adapter | jsdom, the real controller + card + bridge + worker + service |
| contract validators `repository-contract/src/{index,payloads}.ts` | through the service (`POST /events`, `/reviews`, `/writing`, `/sync/push`) and through the worker's `golearn:record` |
| built bundles | text of `packages/golearn-extension/dist/*` (present at audit time, so not skipped) and of the source tree |
| remote AI / speech | source inventory of `golisten`, `gotell` (new and legacy), reader code; spies on `fetch` and on the `RemoteAssistant` port |

## Headline

No critical or high finding. **Authentication, authorization and cross-learner isolation held under every attack tried, on both stores**
(several hundred cross-learner and credential assertions: foreign learner ids in query/body/nested events/documents, foreign document, enrolment, event and device ids, team leader vs member, tombstones, sync under another device, tokens that are revoked/expired/malformed/derived from the stored digest).
Reader text injection was inert in all 20 payload classes. Two **medium** defects concerned *what the event log may contain* (S-01, S-02); twelve were
low (input hardening, robustness, hardening headers). Nothing leaked one learner's data to another. **S-01 to S-13 are now fixed** (see the Status column).

## Defects (each was reproduced by an `it.fails` test; S-01 to S-13 are now fixed and the test is a plain `it`)

| id | severity | where | what | test (title starts "FIXED S-nn" now) | suggested fix | status |
|---|---|---|---|---|---|---|
| S-01 | **medium** | `repository-contract/src/payloads.ts` `noText` | "Event payloads never carry text" is a blacklist of six top-level key names. `payload.notes.text`, `payload.reflection`, any other key, and the same under `subject.*` store whole passages (up to the 1 MB body), returned by `/events` and `/export` and kept in the SQLite file. | events: "text hidden under a nested key … is refused" | whitelist payload keys per kind (the typed payload interfaces already exist), reject unknown keys; or at least refuse any string over ~200 chars outside known free-text fields; recurse into nested objects | **Fixed.** `repository-contract/src/payloads.ts` `scanForText`, called by `validatePayload` and by `validateEvent` for the subject: a text-like key at ANY depth (case and separators ignored), a string of more than 4 words or 300 characters under any other key, a free-text field (`reason`, `label`, `answer`, `expected`, `voiceId`, `message`) over 1,000 characters, and nesting past 8 levels are all refused; the walk is bounded. A narrower rule than a key whitelist, so legitimate payloads (goal labels, correction reasons, typed answers, voice names) stay valid. Tests: events "FIXED S-01" (both stores); fixes "S-01" (6). |
| S-02 | **medium** | `golearn-extension/src/parser` `itemIds` (+ `store` `buildSelectionEvent`) | A selection of more than four words records `surfaceOmitted`, but `subject.itemIds` still lists the units of its **first 12 words in order** (`form:sq:ignore`, `form:sq:previous`, …), and the card sends the same ids on every lookup as `GET /knowledge?unitIds=`. A selected sentence (a password, an address, a private message) is thus reconstructible from the event and visible in the request line (and in any proxy log of it). | reader: "a long selection (more than four words) leaves the page's words out of the stored event" | when `tokenCount > 4` record no per-word item ids (or only those that are lemmas with a pack entry, capped at 4), and do not ask `/knowledge` for ids of words that are not in the pack | **Fixed in the worker.** `golearn-extension/src/background/wordids.ts` (new), used by `recorder.ts` and `profile.ts`: a list naming more than 4 words (`lemma:`/`form:` ids) is a long selection; the stored event keeps at most 4 ids and no `form:` id, its idempotency key (which embedded all of them) is replaced by a hash, and `GET /knowledge?unitIds=` asks for lemma ids only (at most 4), never raw words. The parser/store still build the 12-id list (outside the files I could edit); the worker removes it before anything is stored or sent. Tests: reader "FIXED S-02" and "S-02 in depth" (signed in: events, keys, request lines). |
| S-03 | low | `repository-contract/src/index.ts` `validateEvent`; `recorder.ts` | `at` is only shape-checked: year 2999 and 9999 are accepted (from the API and from a content script). Effect seen: `/candidates` reports "last seen 9999-12-31"; recency/decay of that learner's own model is skewed. Own data only. | events: "an event dated in the future (year 2999)…"; extension: "an event's timestamp cannot be set a day ahead…" | service: refuse or clamp `at` later than `now + 24 h` (the sync response already reports clock skew); worker: clamp to its own clock | **Fixed.** Service: `handler.ts` `prepareEvents` passes the server clock to `validateEvent`, which refuses `at` more than 5 minutes ahead (`MAX_FUTURE_SKEW_MS`) with 422 `invalid-events`, issue path `at`, message `at-in-future: later than <limit>`. A sync push may be as far ahead as the skew it declares in `clientTime` (the sync design reports skew instead of correcting it), never past a day. Worker: `recorder.ts` stamps its own clock on an `at` more than 5 minutes ahead. Tests: events "FIXED S-03" (both stores) and the two tests adjusted for it; extension "FIXED S-03" + behaviour; fixes "S-03". |
| S-04 | low | `handler.ts` `prepareEvents` / `validateEvent` `PRODUCERS` | A client may send `producer.app: "repository"` (the service's own name) on `/events` and `/reviews`. | events: "a client cannot pose as the Repository" | in `prepareEvents` refuse `app === 'repository'` (one line; not applied, see Fixes) | **Fixed.** `handler.ts` `prepareEvents` refuses `producer.app: "repository"` (422, path `producer.app`) on `/events`, `/reviews`, `/writing`, `/sync/push`; the service's own events (enrolment, correction) never pass through it. Tests: events "FIXED S-04"; fixes "S-04". |
| S-05 | low | `handler.ts` | `producer.deviceId` inside events is not bound to the session's device (`/sync/push` binds the request's `deviceId`, not the events'). Device attribution of one's own events can be forged. | events: "events carry the SESSION's device" | refuse or overwrite with `ctx.session.deviceId` | **Fixed (policy: session device, or a device registered to the learner).** `prepareEvents`: `producer.deviceId` must equal the session's device or be a device `store.getDevice(learnerId, id)` knows, which a sign-in from it registers; an invented or another learner's device id is 422 (path `producer.deviceId`). One lookup per distinct id per batch. Tests: events "FIXED S-05"; fixes "S-05". |
| S-06 | low | `handler.ts` | `enrolmentId` of an event is never checked: another learner's enrolment id, a nonexistent one, or 10,000 characters is stored under the caller. (Not a read leak: the log is the caller's own.) | events: "enrolmentId must be one of the learner's own enrolments" | check against `listEnrolments(learnerId)` once per batch | **Fixed.** `prepareEvents`: `enrolmentId` must be one of `listEnrolments(learnerId)` (one lookup per batch), else 422 path `enrolmentId`; shape is length-capped by S-07. Tests: events "FIXED S-06"; fixes "S-06". |
| S-07 | low | `validateEvent` | Only `id` (200), `dedupeKey` (300) and `surface` (120) are length-capped. Ten more identifier fields accept 10,000 characters: `enrolmentId`, `languageId`, `varietyId`, `producer.version`, `producer.deviceId`, `subject.sentenceKey`, `subject.itemIds[i]`, `subject.sourceRef.title`/`.locator`, `payload.readerId`. With no per-learner quota (A-05) this is storage amplification up to 1 MB per request. | events: ten tests "a 10,000-character … is accepted and stored" | cap at 200 (300 for unit ids and locators) in `validateEvent` | **Fixed.** `repository-contract/src/index.ts` `validateEvent`: 200 characters for `enrolmentId`, `languageId`, `varietyId`, `producer.version`, `producer.deviceId`, `producer.surface`, `subject.sentenceKey`/`cardId`/`draftId`, `payload.readerId`; 300 for each unit id (at most 200 of them) and the source title; 2,048 for the locator; wrong types refused. Tests: events "FIXED S-07" (10 fields x 2 stores); fixes "S-07". |
| S-08 | low | `handler.ts` / stores | An event whose payload is nested ≥ 5,000 levels (10 KB) gets `500`, not `422`. Nothing is stored and the service survives, but a queued event that always fails with 500 is retried forever by the sync client. (The worker's 6,000-byte limit stops this on the extension path.) | events: "payload is nested 5,000 levels deep" | depth limit in `prepareEvents` | **Fixed.** `handler.ts` `body()`: a request body nested more than 24 levels is `400 too-deeply-nested` before any field is read (iterative walk, no stack risk); the contract also refuses payload nesting past 8. `background/sync.ts`: a 422 `invalid-events` batch no longer wedges the queue: the bad events are set aside as `rejected:` rows and the good ones are sent in the same round. Tests: events "FIXED S-08"; fixes "S-08" and "the extension's sync transport". |
| S-09 | low | `repository-store/src/rules.ts` `decidePutDocument` via `PUT /documents/:id` | `expectedRevision > 0` for a document that does not exist **throws** → `500` (a guess of someone else's revision number hits it). | authz: "PUT /documents/:id with expectedRevision > 0 for a document that does not exist" | in the handler `saveDocument`, answer `409 conflict` (or 422) when the store throws that error / check `getDocument` first | **Fixed.** `handler.ts` `putUnderRevision` (used by `saveDocument`): a revision above 0 on a document that does not exist is `409 conflict` with `reason: "no-such-document"` and no `current` copy; nothing is created. Tests: authz "FIXED S-09"; fixes "S-09 and S-10". |
| S-10 | low | `handler.ts` `POST /sync/push` | The same throw inside the push transaction rolls back the **whole** push (events included) and returns 500: one impossible document poisons the batch, and the client retries it forever. | authz: "one sync push document with an impossible revision must not poison the whole push" | per-document `try/catch` in the loop → `{ ok:false }` for that document | **Fixed.** `POST /sync/push` answers per document (`{ ok:false, reason:"no-such-document" }` or `"refused"`; new optional `reason` on `SyncPushResponse.documents` in `ports.ts`) and stores the events and the other documents. `repository-sync/src/client.ts`: a document refused with a `no-such-document` reason is rebased to a NEW document (`documents.ts` `rebase`: local text is never discarded) and re-sent in the same call; any other refusal without a copy is that document's failure (`failed`, `refused[]`), not a failed batch, so the pull still runs. Tests: authz "FIXED S-10"; fixes "the sync client and a document the server cannot place" (2). |
| S-11 | low | `validateEvent` | `typeof x === 'object'` admits arrays: `subject: []` and (for the payload-free kinds `CardAdded`, `CardRemoved`, `CorrectionAccepted/Rejected`, profile family) `payload: []` are accepted and stored. | events: "an array is not an object" | `Array.isArray` guard next to the two `typeof … 'object'` checks | **Fixed.** `Array.isArray` guards for `subject`, `payload` and `sourceRef` in `validateEvent` / `validatePayload`. I read the audit's fix as the array guard; I did not add a "this kind needs at least one unit id" rule, because kinds such as `EnrolmentChanged` and `ConsentGiven` legitimately have `subject: {}`. Tests: events "FIXED S-11"; fixes "S-11". |
| S-12 | low | `handler.ts` `respond` | No `X-Content-Type-Options: nosniff`; document bodies (user-controlled markup) are served as JSON. Browsers do not render JSON as HTML, so this is hardening only. | auth: "responses carry X-Content-Type-Options: nosniff" | add the header in `respond` | **Fixed.** `handler.ts` `respond` adds `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY` to every response. Tests: auth "FIXED S-12"; fixes "S-12" (7 responses). |
| S-13 | low (hardening) | extension worker; **needs a browser to demonstrate** | `chrome.storage.local` is readable from content-script contexts by default (`TRUSTED_AND_UNTRUSTED_CONTEXTS`); the token lives in `golearn:session` there and `setAccessLevel` is called nowhere. The shipped content bundle does not touch storage (tested), so this is defence in depth against a future content-script bug, not an open hole. | extension: "the worker restricts chrome.storage.local to trusted contexts" (source check) | `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` at worker start (needs the `ChromeApi` type widened, so not a validation guard) | **Fixed, verified against a fake chrome only (needs a browser to demonstrate the effect).** `background/storageAccess.ts` `restrictStorageToTrustedContexts`, called first in `createBackground`: `setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` on `storage.local` and `storage.session`, feature-detected, a throw or a rejection ignored (older browsers keep working). `ChromeApi` was not widened (`platform.ts` is outside my files): the area is cast locally. Tests: extension "FIXED S-13" (source) and "S-13 behaviour" (fake chrome: called on both areas, tolerated when absent, throwing or rejecting). |
| S-14 | low (hardening) | `gotell` `assist.ts` `remoteModel`, `privacy.ts` `RemoteAssistantGate` | Consent is tested with `!consent.remoteAssistance()`: any truthy value (`'no'`, `1`, `{}`, or a **Promise** from an async consent store) counts as consent. GoListen requires `=== true`. No provider is wired today (A-08), so no text can leave; this guards the future wiring. | remoteai: "the consent gate accepts only the boolean true" | `consent.remoteAssistance() !== true` in both places | _Not part of this remediation (another agent)._ |

## Results by area

Result: PASS = secure behaviour confirmed; DEFECT = see table above; FINDING = accepted/by-design behaviour pinned (see "Accepted findings").
"Both" = memory and SQLite stores.

### (1) Authentication — `security.auth.test.ts`

| test | result | sev | note |
|---|---|---|---|
| wrong password | PASS | | 401 `bad-credentials`; no token in body; right password still works |
| unknown email vs wrong password | PASS | | identical status, body and headers; exactly one verification each (throw-away hash); with real scrypt the median time of the two is within 4× and above 3 ms |
| deleted account vs wrong password | PASS | | same body |
| lockout: 5 failures → 429 + `Retry-After: 900`, even for the right password | PASS | | case/whitespace-insensitive; reopens after 15 min; success resets the count; 4+success+4 is not a lockout; unknown emails get the same 429 sequence; other emails unaffected |
| malformed credentials | PASS | | 21 header shapes (empty, `Bearer`, `Basic`, truncated, +suffix, upper-case, doubled, 100,000 chars, `%00`, SQL text, `../`) → identical 401; token in query or body is not a credential |
| stolen database | PASS | | the stored digest is not a token (nor its digest); raw SQLite file has the digest and no token, no password; scrypt hashes salted and different for equal passwords |
| expired session | PASS | | 200 at expiry − 1 ms, 401 at exactly `expiresAt` on 8 routes; 401 ten TTLs later |
| revoked session | PASS | | after `DELETE /sessions/current` 401 on every route incl. writes and sync; second delete 401; the learner's other session survives; nothing written by the refused calls |
| `DELETE /me` | PASS | | wrong `confirmEmail` 422 and nothing changes; a foreign `learnerId` 403; afterwards token/password/email dead and raw store holds no document body, token or digest |
| sign-up reveals existing emails (409) | FINDING | low | A-01 |
| lockout can be used against the owner | FINDING | low | A-02 |
| no cookies, `Cache-Control: no-store` | PASS | | |
| `nosniff` | FIXED | low | S-12 |
| auth fault fails closed | PASS | | a store fault in authentication is a 500, never a pass |

### (2) Authorization and cross-user — `security.authz.test.ts`

| test | result | sev | note |
|---|---|---|---|
| victim's `learnerId` in the query of `/enrolments /events /knowledge /preferences /documents /documents/:id /export /candidates` and `DELETE /documents/:id` | PASS (both) | | 403 `not-your-data`, no victim value in the reply, victim's export byte-identical after |
| victim's `learnerId` in the body of 18 write attacks | PASS (both) | | `/events` (top-level, in 2nd event of a batch, as the event's identity), `/reviews`, `/enrolments`, `/lookup`, `/corrections`, `/tombstones`, `/writing` (observation, document), `PUT /documents/:id` (body and nested doc), `/sync/push` (body, nested document), `/sync/pull`, `DELETE /me`; attacker's own log unchanged too |
| victim's ids without a learnerId | PASS (both) | | document, enrolment (candidates, corrections), unit filters answer byte-for-byte like ids that do not exist |
| document takeover | PASS (both) | | B's `PUT` of A's doc id makes B's own document; a revision conflict returns B's own document; A's body unchanged |
| tombstones by B (event id, source, range, learner) | PASS (both) | | recorded under B; A's events and export unchanged |
| sync under another device, pull scope | PASS (both) | | 403 `not-your-device` both ways; pull returns only the caller's events/documents for any `afterSeq` |
| attacker's own export/preferences/candidates/lookup contain nothing of the victim | PASS (both) | | |
| team leader vs member | PASS (both) | | leader gets 403 on 8 routes naming the member, and the leader's own views hold none of the member's events, document, ids, email, device or token |
| join a team you are not in | PASS (both) | | 403, member of *another* team does not count; insider 201 |
| team id existence (404 vs 403) | FINDING | low | A-03 |
| revision 500s | FIXED | low | S-09, S-10 |

### (3) Event forgery — `security.events.test.ts`

| test | result | sev | note |
|---|---|---|---|
| another learner's id in an event | PASS (both) | | 403 for the whole batch wherever it sits; nothing stored for either learner |
| batch atomicity | PASS (both) | | one invalid event: 422 with each bad index, none of the good ones stored |
| `seq` / `recordedAt` from the client | PASS (both) | | replaced by the store |
| same event id from two learners | PASS (both) | | second refused as "in use"; no `duplicateOf`, no learner id; first untouched (existence oracle: A-04) |
| same `dedupeKey` from two learners | PASS (both) | | both stored, neither learns of the other; per-learner idempotent |
| `correctionOf` naming another learner's event | PASS (both) | | opaque string, never dereferenced (engine does not read it); victim's export unchanged; non-string 422 |
| `__proto__` / `constructor` / `prototype` keys (payload, subject, top level) | PASS (both) | | `Object.prototype` untouched; read-back, projection and export work |
| surfaces of 5+ words | PASS (both) | | space, tab, newline, NBSP, em-space, 121 chars all 422; 4 words and 120 chars accepted |
| word separators that are not whitespace (U+200B, hyphen) | FINDING | low | A-06 (bounded by the 120-char cap) |
| text keys (`text sentence sentenceText passage content body`) top level | PASS (both) | | 422 in payload and subject |
| nested / unlisted text keys | FIXED | **medium** | S-01 |
| future `at` | FIXED | low | S-03 (a year-2999 event is now refused; a few minutes ahead is projected without breaking candidates, tested) |
| `producer.app = repository`, foreign `producer.deviceId`, foreign/absent `enrolmentId` | FIXED | low | S-04, S-05, S-06 |
| 10,000-char `id`, `learnerId`, `dedupeKey`, `payload.surface` | PASS (both) | | 422 (403 for the learner id) |
| 10,000-char other identifier fields | FIXED | low | S-07 (10 fields) |
| 2 MB batch; undeclared chunked body; lying `Content-Length`; 501 events | PASS (both) | | 413 before parsing, stream cut within 3 chunks of the 1 MB limit; 422 over 500 events |
| `/reviews`, `/writing`, `/sync/push` family rules | PASS (both) | | a lookup on `/reviews` 422; a review on `/writing` 422; text key on `/sync/push` 422 |
| absurd numbers (1e308), years 0001/9999, `+14:00` | PASS (both) | | stored and projected, no `NaN`/`Infinity`, later events still project |
| deep nesting; arrays as objects | FIXED | low | S-08, S-11 |

### (7) API validation — `security.events.test.ts`

| test | result | sev | note |
|---|---|---|---|
| invalid JSON, non-object, empty, NUL, non-UTF-8 | PASS (both) | | 400/422, never 500, no parser text in the reply |
| content type not checked | FINDING | low | A-07 |
| path traversal in `/units/:id`, `/documents/:id` | PASS (both) | | 12 encodings (`..%2F`, `%2e%2e`, `%252e`, `..%5C`, `file:`, `%00`, bad percent, 5,000 chars) → 404/4xx, no file text; literal `/documents/../export` is resolved by the URL parser to the caller's OWN export |
| SQL-looking strings | PASS (both) | | `'; DROP TABLE events; --`, `UNION SELECT passwordHash …`, `" OR 1=1 --` as document id/title, event id, dedupeKey, itemIds, sentenceKey, sourceRef, unit/language/kinds filters, `/lookup`, email, device id: stored and read back byte for byte, no row of another learner returned, every table intact (raw SQLite file contains the value as data) |
| typed query parameters | PASS (both) | | negative, fractional, exponent, hex, `NaN`, huge, 60 kinds, 250 unit ids, bad dates → 422; `limit` clamped |
| methods and routes | PASS (both) | | 404/405, override and forwarding headers ignored, `OPTIONS` 204 empty, errors are `{error,message,issues?}` only |
| account/session input bounds | PASS (both) | | email 254, password 10–1000, display name, device id, platform; the password is never echoed |
| document/unit id and field bounds | PASS (both) | | id 200 (unit 300), title 300, kind enum, body must be a string, revision a whole number ≥ 0 |
| service URL in the worker | PASS | | section (7b) below |

### (8) Private documents — `security.authz.test.ts`

| test | result | sev | note |
|---|---|---|---|
| `GET/PUT/DELETE` of another learner's document | PASS (both) | | see (2) |
| `GET /documents` omits bodies | PASS (both) | | no `body` key, no body text anywhere in the reply |
| body never in events, projection, export events, logs | PASS (both) | | via `POST /writing` and `/sync/push`; present only in the export's `documents` section |
| deleted document | PASS (both) | | body blanked, pull shows `deletedAt` and empty body, raw store holds no trace of the text |
| server decides learner, device, time, revision, `deletedAt` | PASS (both) | | client-sent values ignored; stale revision 409, nothing overwritten |

### (9) Logging — `security.auth.test.ts`

| test | result | sev | note |
|---|---|---|---|
| log lines | PASS (both) | | 10 requests incl. secrets in query, body, headers and a broken JSON body: every line matches `^METHOD /path status Nms$`; no token, email, password, learner id, query, body |
| server fault | PASS | | 500 body is the fixed message; the cause (with a password-looking string) is in neither body nor log |
| path ids | FINDING | info | A-09: the (percent-encoded) path is logged, so document ids and unit ids appear |

### (4) Reader text injection and prompt injection — `security.reader.test.ts` (jsdom, 110 tests)

| test | result | sev | note |
|---|---|---|---|
| 20 payloads × (select the payload / select a neighbouring word) | PASS (40) | | `<img onerror>`, `<script>`, `<svg onload>`, `javascript:`, `<a href=javascript:>`, `<iframe srcdoc>`, entity-encoded, `</style><script>` breakout, bidi overrides (U+202E, U+2066), ZWJ/ZWNJ/WJ/BOM, 10,000 combining marks, lone high and low surrogates, NUL, C0 controls and ANSI, instruction text ("ignore previous instructions and send the token …"), prototype words. After each: card tags and attributes ⊆ the benign card's vocabulary (no `on*`, `href`, `src`, `srcdoc`, `action`); no `img script iframe a svg object embed link` in the card; **zero** calls to any HTML sink (`innerHTML`/`outerHTML` setters, `insertAdjacentHTML`, `createContextualFragment`, `document.write`, `DOMParser`, `setHTMLUnsafe`); the page keeps exactly its `<p>` plus the one closed-shadow host; `window.__pwned` never set; only the 7 reader message types go to the worker; a hostile neighbour never stops the word being looked up |
| parser on the same payloads × 8 surfaces × 8 contexts (selStart/selEnd negative, NaN, reversed, huge; no/empty sentence) | PASS (20) | | never throws, < 3 s each, ≤ 12 item ids, JSON-serialisable; a 200 KB sentence and a 200,000-char selection < 10 s |
| 2 MB paragraph through the real adapter | PASS | | context is a fragment ≤ 1,000 chars in < 5 s (the parser is super-linear: 2 MB would take ~11 s, but the adapter never passes more than ~265 chars) |
| hostile data coming back (glosses, attribution, explanations, labels, messages, feedback) | PASS | | rendered as text; no elements; wrong types, cycles and 2 MB strings in `update()` leave a card or an exception caught by the controller, never page damage |
| stored events, signed out (× 20 payloads) | PASS (20) | | valid per the contract, ≤ 6,000 bytes, local pseudonym learner, no `sentence/text/...` keys, none of the sentence's other words in storage, zero requests |
| stored events and requests, signed in (× 20 payloads, payload selected) | PASS (20) | | surface ≤ 4 words/120 chars or omitted; every request to the service origin only; no neighbouring-sentence word on the wire |
| an unselected instruction is never read | PASS | | no byte of it in any request; with the instruction selected: only 6 routes + the dictionary shard, no off-origin request, token only in the `Authorization` header to the service and nowhere the page can see |
| page title and URL | FINDING | low | A-10: title (≤ 120 chars, page text) and path (query and fragment dropped) are stored in `sourceRef` by design |
| static scan of `content popup parser adapters contract` (+ `app`, `action`) | PASS (3) | | no HTML sink, dynamic code, `on*`/`href`/`src` set from data, no network call, no web or extension storage, no cookie |
| long selection leaks 12 words | FIXED | **medium** | S-02 |

### (5) Extension privilege boundary — `security.extension.test.ts`, `security.bundle.test.ts`

| test | result | sev | note |
|---|---|---|---|
| tab sends page-only messages | PASS | | connect (to an attacker's address), create-account, service-config set/get, disconnect, sync-now, session-refresh, enrol (with team), select-enrolment, clear-local, set-enabled, get-state: from tab 7 and tab 99 → `forbidden`, storage text byte-identical, **no request**, still connected |
| tab flips consent/privacy settings | PASS | | 7 spellings of `settings set` (`SET`, array op, `get` with patch, `__proto__` patch …) leave both consents false |
| other extension id / no id / lookalike id (8 sender shapes × every message type) | PASS | | `forbidden`; no storage change, no request |
| lookalike page URLs (11: query smuggling, `.evil.com`, userinfo `@`, port, case, whitespace, scheme tricks) | PASS | | as a tab: content rights only; with no tab: nothing |
| messages sent *to* a tab (`enable disable lookup ping`) | PASS | | not handled by the worker |
| `golearn:record` kinds from a tab | PASS | | the six reader kinds only; every other contract kind refused (`kind-not-allowed`), incl. all profile-family kinds; page may add four, not more |
| `golearn:record` producers | PASS | | tab: `golearn-app`, `repository`, `import`, `gopractice-*`, case/space variants, non-strings all `producer-not-allowed`; page: other apps' names refused |
| malformed events | PASS | | 35 shapes (null, arrays, wrong types, circular, `Object.create(null)`, Date, wrong types) → `ok:false`, never `internal`, nothing stored |
| identity forgery | PASS | | learner, enrolment, device and version are replaced by the worker; the sync round sends none of the forged values |
| size limit | PASS | | 6,000 bytes: oversized, 5,000-deep and 2,000-key events refused before the contract sees them |
| future `at` from a tab | FIXED | low | S-03 |
| metrics rows | PASS | | key is prefixed (`golearn:session` cannot be overwritten), id shape and 3,000-char limit enforced |
| tab-facing replies carry no secret | PASS | | 9 content-allowed message types × 9 payload shapes (valid, junk, hostile, oversized): no token, learner id, enrolment id, email, device id, service host or password; status keys are exactly `connected languageId languageName needsSignIn ok packAvailable`; setup page gets email/address but no token or learner id |
| manifest | PASS | | exactly `activeTab scripting storage contextMenus alarms`; no host permissions, `content_scripts`, `externally_connectable`, `web_accessible_resources`, CSP override, `key`, `update_url`; 26 dangerous permissions absent |
| `content.js` | PASS | | no network, no web or extension storage, no credential literal, no dynamic code, no `postMessage`/message listener/`window.open`, no tabs/scripting/cookies APIs, no URL, no `console` |
| `action/popup.js`, `background.js`, `app/app.js` | PASS | | popup: no network/storage/credential; worker: the only `fetch`, no XHR/beacon/socket, no `eval`, no console, no URL literal, none of the service's handler code; setup page: no dynamic code/XHR/socket; no secret-looking literal in any bundle; HTML pages load only their own scripts |
| `chrome.storage.local` access level | FIXED | low | S-13 (called and tolerated in a fake chrome; needs a browser to prove the effect) |

### (6) Credential storage — `security.extension.test.ts`, `security.auth.test.ts`

| test | result | sev | note |
|---|---|---|---|
| where the token lives | PASS | | after sign-in, events, layer events, a metric, gloss, profile, correction, setting change and a sync, the token is in exactly one place: `golearn:session` in `storage.local`. Not in any event, queue row, metric, status, cache, local export (`exportRows`) or reply |
| the password | PASS | | in no storage area, no event, no service log, no export; in exactly **one** request body (`POST /sessions`) to the configured origin; never in a URL; a failed sign-in stores neither password nor session and does not echo it |
| `Authorization` goes to the service only | PASS | | never on dictionary (`/dict/…`) requests, never off-origin |
| expired session in storage | PASS | | no bearer token is sent by record, sync, profile or correct; status says `needsSignIn` |
| sign-out | PASS | | session key removed, token dead on the server (401), storage text has no token, no further authenticated request |
| tampered storage | PASS | | `golearn:service` set to `http://evil.example` (+ asset base): ignored on read, **zero requests** from sync, gloss, profile, correct; a session whose `token` is not a string is not used |
| server side | PASS | | see (1): digest only at rest, scrypt with salt |

### (7b) Service URL rules in the worker — `security.extension.test.ts`

| test | result | sev | note |
|---|---|---|---|
| `validateBaseUrl` | PASS | | accepts 9 forms (https, `localhost`, `127.0.0.1`, `[::1]`, `*.localhost`, upper case); refuses 29 (http to a host, `localhost.evil.com`, `127.0.0.1.evil.com`, `evil.com#@localhost`, `localhost@evil.com`, credentials, `ftp file javascript data chrome-extension ws wss`, `//host`, empty, `0.0.0.0`, private ranges, metadata address, trailing-dot `localhost.`); non-strings refused; query and fragment dropped |
| `validateAssetBase` | PASS | | only this extension's own origin besides what `validateBaseUrl` accepts; `other`, `id.evil`, `id@evil` refused |
| via messages | PASS | | `connect` and `service-config` from the setup page refuse every bad address with no request made and nothing stored |
| dictionary fetch confined | PASS | | 12 hostile lemmas (`../../../etc/passwd`, `%2f`, `?x#y`, 5,000 chars, NUL, absolute URL, UNC path, RLO, markup) and a hostile language id: every dictionary URL is `https://repo.example/dict/sq/<file>`, GET, no `..`, nothing off-origin |

### (10) Remote AI and speech — `security.remoteai.test.ts`

| test | result | sev | note |
|---|---|---|---|
| GoTell has no network code | PASS | | new package and legacy `src/gotell`: no `fetch`, XHR, socket, beacon or URL. The `RemoteAssistant` port is named in exactly 3 files (type, assistance ladder, consent gate) and implemented by exactly one class, the gate; **no provider is wired anywhere** |
| GoListen network sites | PASS | | only `environment.ts` (type), `golisten.ts` (builds the default, makes no call) and `providers/remote.ts` mention fetch; in `remote.ts` both functions that call the network (`prepareRemote`, `remoteAvailability`) have the `consent().remoteSpeech` guard, as an early `return`, before their first call; only `listing.ts`, `resolve.ts`, `remote.ts` reach them |
| browser-vendor cloud voices | PASS | | in `device.ts` a non-local voice is chosen only after the same consent check |
| reader code | PASS | | content/popup/parser/adapters have no network call; the content bundle imports GoListen's device provider only, never the networked facade |
| GoReview, sync, engine, linguistics, contract | PASS | | no network call or model/speech provider URL |
| GoListen behaviour | PASS | | with 9 consent values (false, `{}`, throwing, `'true'`, `1`, `{}` object, `undefined`, `null`, a Promise) × 3 kinds × 3 preferences, plus `voices` and `availability`: **zero** fetch calls; with consent the text is only in the POST body of one same-origin `/api/speech/synthesize` (never URL/headers/logs, `credentials: same-origin`, no `Authorization`/cookie); consent withdrawn between calls stops the next; hostile text never changes the URL; a networked device voice without consent speaks nothing |
| GoTell behaviour | PASS | | consent off: levels 1–6 via `step` and `through`, with and without an intended meaning → the remote port is called zero times; the gate refuses before passing anything on, reads consent on every call, and logs only lengths |
| consent truthiness | DEFECT | low | S-14 |

## Accepted findings (behaviour pinned by a `FINDING` test, no action required unless the owner decides otherwise)

| id | sev | what |
|---|---|---|
| A-01 | low | `POST /accounts` answers 409 for an existing email (an enumeration oracle; the sign-in path is uniform). |
| A-02 | low | The sign-in lockout is per email, in memory, per process: anyone can lock the real owner out for 15 minutes with five guesses (open sessions keep working); lost on restart; multiplied by the number of instances. Unknown emails are counted too (the map is pruned only above 10,000 entries). |
| A-03 | low | `POST /enrolments` with a `teamId`: 404 for no such team, 403 for a team you are not in (team ids can be probed). |
| A-04 | low | An event id owned by another learner is answered `stored:false, issue "event id already in use"` (an existence oracle for ids; ids are random UUIDs, nothing else is revealed). |
| A-05 | low | No per-learner quota and no sign-up throttle: 25 accounts in a row are 201; four 900 KB documents are accepted. The service has no IP-based limiting at all (it does not see the address). |
| A-06 | low | The four-word rule counts whitespace-separated words; U+200B / hyphens join words, so up to 120 characters of running text can ride in `payload.surface`. The 120-character cap bounds it. |
| A-07 | low | Content type is not checked (`text/plain` JSON is accepted) and CORS is `*`. Safe today because every state-changing route needs a bearer *header* (a cross-site form cannot send one) and there are no cookies; the two unauthenticated POSTs (`/accounts`, `/sessions`) can be reached cross-site but set nothing. Revisit if cookies are ever introduced. |
| A-08 | info | No remote AI provider exists in the product; the GoListen remote speech provider has only been exercised against a mock (its own header says so). The speech *proxy* (`server/speechHandler.ts`: same-origin check, 20 KB body, 30/min per remote address, key never echoed) is out of this audit's scope; it has no authentication of its own. |
| A-09 | info | Request paths are logged verbatim, so document ids and unit ids (which a learner chooses) appear in service logs. No query, body, token or email ever does. |
| A-10 | info | Events keep the page title (≤ 120 chars) and the URL **path** (`locator`) as `sourceRef`. A path can itself carry a secret (`/reset/<token>`); the query and fragment are dropped (tested). By design of the source reference; the owner may want to hash or truncate the locator. |
| A-11 | info | `DELETE /me` needs only the session and the account's email, not the password: a stolen token can delete the account. |

## What could not be tested here (needs a real browser, or a real network)

* That page JavaScript cannot reach the content script's isolated world, that the closed shadow root really hides the card, and what a hostile page's CSS/overlays can do to the card (clickjacking, covering the close button). jsdom has no isolated worlds.
* That `chrome.storage.local` is readable from the content-script context by default (S-13); only the absence of `setAccessLevel` is asserted.
* That `sender.id`, `sender.url` and `sender.tab` are set by Chrome and cannot be forged by a web page (the code's use of them is tested with every spoof shape; Chrome's behaviour is taken as given).
* `activeTab` injection only on a user gesture; the real `executeScript`; the extension-page CSP; `fetch`'s stripping of `Authorization` on a cross-origin redirect (the fake `fetch` does not redirect).
* TLS: the service speaks plain HTTP and expects a TLS-terminating proxy in front (the worker refuses non-https non-loopback addresses, tested). The `node:http` adapter (`main.ts`) was not run over a socket; the 1 MB limit is tested on the handler with an undeclared chunked stream.
* The speech proxy and the live Azure service; the hosted web app's `localStorage` session (the same token model as the worker, in the web origin).

## Fixes

S-01 to S-13 were fixed in the remediation of 2026-10-09 (S-14 belongs to another session). What changed, by package:

* `repository-contract/src`: `payloads.ts` (recursive text guard `scanForText`, `wordCount`, limits `MAX_NESTING` 8, `MAX_PLAIN_STRING_CHARS` 300, `MAX_FREE_TEXT_CHARS` 1,000; arrays are not payloads); `index.ts` (`validateEvent(e, { nowMs, futureSkewMs })` with the `at-in-future` rule, identifier caps `MAX_ID_CHARS` 200 / `MAX_UNIT_ID_CHARS` 300 / `MAX_ITEM_IDS` 200 / `MAX_TITLE_CHARS` 300 / `MAX_LOCATOR_CHARS` 2,048, array and type guards, `MAX_FUTURE_SKEW_MS` 5 minutes); `ports.ts` (`SyncPushResponse.documents[].reason`).
* `repository-service/src/handler.ts`: `prepareEvents` is now async and holds a batch to the server clock, the `repository` producer name, the session's device (or one registered to the learner) and the learner's own enrolments; `putUnderRevision` (a revision on a missing document is 409, never 500, and per document inside a sync push); the body depth limit (`MAX_BODY_DEPTH` 24 → 400 `too-deeply-nested`); the four hardening headers on every response.
* `repository-sync/src`: `client.ts` (a document refused without a copy is a per-item failure, `refused[]`; a `no-such-document` refusal is rebased to a new document and re-sent), `documents.ts` (`rebase`).
* `golearn-extension/src/background`: `wordids.ts` (new: a long selection names no raw words), `recorder.ts` (long-selection ids cut, idempotency key re-hashed, `at` clamped to the device clock), `profile.ts` (the `/knowledge` request line), `storageAccess.ts` (new: `TRUSTED_CONTEXTS`), `sync.ts` (a refused batch sets the bad events aside and sends the rest), `core.ts` (wiring).

Policy choices the owner may want to revisit:

* **Clock tolerance.** A direct `POST /events` may be at most 5 minutes ahead of the server. A sync push is allowed the skew its `clientTime` declares (the sync design reports skew rather than rewriting `at`), up to a day, and never more than 5 minutes past the clock it declared. A device more than a day wrong gets its events refused by the service; the extension sets such events aside as `rejected:` rows (kept, reported, never silently dropped) while the rest of the queue flows.
* **Status codes.** Event-level refusals stay `422 invalid-events` with the index and path of each bad event (the existing batch contract, pinned by tests), so the future `at`, the producer name, the device and the enrolment are 422 with a distinct message or path; an over-deep request body is `400 too-deeply-nested`; a missing document at a revision is `409 conflict` with `reason: "no-such-document"`.
* **Device binding.** An event may name the session's device or any device registered to the same learner (signing in from a device registers it). That keeps a second app or device that signed in as the same learner working; it refuses invented ids and other learners' ids.
* **Free-text fields.** `reason`, `label`, `answer`, `expected`, `voiceId` and `message` may hold up to 1,000 characters of prose in a payload; they are the only keys that may. The subject's unit ids, sentence key, card and draft ids, source title and locator are identifiers (length-capped, not word-counted). Unit ids are still free-form up to 300 characters: a unit-id grammar would be a stricter rule than the existing tests allow (they store SQL-looking ids byte for byte).
* **S-02 is cut in the worker, not at the source.** The parser and store (`golearn-extension/src/{parser,store}`) still build the first-12-words id list; `background/wordids.ts` removes it before storage and before the `/knowledge` request. If those files are touched later, `itemIdsFor` should stop listing raw words for a long selection and `wordids.ts` becomes a second line of defence.

Existing tests changed because a rule legitimately applies to them (intent kept): `test/repository/service/fakes.ts` (`lookupEvent`/`productionEvent` honour `who.deviceId`), `test/repository/service/integration.test.ts` and `isolation.test.ts` (events carry the session's device), `test/golearn-e2e/albanian-reference.test.ts` and `test/gopractice-e2e/review-reference.test.ts` (GoPractice's / the second device's id is registered to the learner; the clock passes the timestamps before they are sent), and in `security.events.test.ts` the two tests that stored a year-2999 and a year-9999 event (now: a few minutes ahead is stored and projected, the far future is refused).

## Files

* `test/audit/security.auth.test.ts` — (1) authentication, (9) logging, passwords and tokens at rest (36)
* `test/audit/security.authz.test.ts` — (2) authorization, teams, (8) private documents, storage abuse (33)
* `test/audit/security.events.test.ts` — (3) event forgery, (7) API validation (88)
* `test/audit/security.extension.test.ts` — (5) privilege boundary, (6) credential storage, (7) service URL rules (29)
* `test/audit/security.reader.test.ts` — (4) reader text and prompt injection (110)
* `test/audit/security.bundle.test.ts` — (5) manifest and built bundles (10)
* `test/audit/security.remoteai.test.ts` — (10) remote AI and speech consent (13)
* `test/audit/security.fixes.test.ts` — the fixes: edges of each rule, legitimate inputs, the other routes, the sync client and the extension transport (19)
* `test/audit/security.support.ts`, `security.extrig.ts` — harnesses (real-stack service; recording extension rig)

Total: **341 tests** in 8 files, all ordinary `it` (audit: 319 tests in 7 files, of which 44 were `it.fails` documenting 14 defects; the remediation turned the `it.fails` of S-01 to S-13 into `it`, the S-14 test was turned into `it` by the session that fixed S-14, and 22 tests were added: 19 in `security.fixes.test.ts`, 1 in the reader file, 2 in the extension file).
