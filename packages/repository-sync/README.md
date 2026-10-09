# repository-sync

The CLIENT side of Go Repository synchronization (design §8): a device's durable event queue, push/pull against a
`Transport`, retry, reconciliation, the mutable-document conflict rules, and a status object. It imports the contract
(`../../repository-contract/src`) and nothing else. The server implements the other end of `Transport`.

## The model

| Kind | Merge | Why it is safe |
|---|---|---|
| Events (immutable) | union by `id` | an event is never edited; a duplicate is the same event; the projection's fold is order-independent |
| Private documents (mutable) | by `revision`, with conflict copies | neither side's text is ever discarded |
| Preferences | per field: explicit > inferred > default; then later `updatedAt`; then smaller `deviceId` | an explicit choice on any device outlives every inference |

**Events.** `enqueue` validates (`validateEvent`) and persists `queue:<id>` before it resolves. `push()` sends the pending
rows in batches of at most 200. Per event: `stored` or `duplicateOf` is success and the row is acked (a duplicate means the
server has it, which is also how a lost acknowledgement heals); `issues` moves the row to `rejected:<id>` with the issues
(kept, reported in status, removed only by `dismissRejected`); anything else, or a transport error, `fail`s the row (attempts
and `lastError` recorded) and schedules a retry. Nothing is ever dropped.

**Time.** The client never reorders by `at`. Pull order is the server's `seq`; the device's `at` stays the event's time.
The clock skew (client − server) is measured from every response and reported as `skewMs`; it is not applied, because
rewriting `at` would rewrite the learner's own timeline from a clock that may itself be the wrong one, and the engine's fold
is order-independent, so a skewed `at` costs nothing the reported skew does not explain.

**Cursor.** `sync:cursor` holds the highest server seq appended to the local log. It advances only after
`local.append` succeeded; if that throws, the same page is read again (the append is idempotent on id). A pulled event the
local log refuses to validate (say, a newer client's kind) is kept under `quarantine:<id>` and the cursor moves past it.
Pulled events that carry this device's id also ack the matching queue rows.

**Documents.** Per document the device keeps `{ doc, baseRevision, dirty }` (`createLocalDocuments`). A local edit makes
the document dirty at `baseRevision + 1` (further edits coalesce into that revision) and it is pushed with
`expectedRevision = baseRevision`. `mergeDocument(local, remote, localDirty, baseRevision?)`:

- same revision, or remote older → `keep-local`; no local copy, or clean and remote newer → `take-remote`
- dirty on top of the remote's revision → `push-local`
- dirty, remote advanced, same content → `take-remote`
- dirty, remote advanced, different content → `conflict`: the remote keeps the docId, the local text becomes the new document
  `<docId>:conflict:<deviceId>:<revision>` titled `<title> (conflict copy from <deviceId>)`, a normal dirty document that
  syncs to every device. The copy is written before the original is overwritten.
- a local deletion against newer remote text: the text wins (a deletion has no text to preserve); a remote deletion against local
  edits: the deleted row wins the docId and the local text is kept as a copy.

The same rule runs when `pull` delivers a document and when `pushDocuments` receives `{ ok: false, current }` (the 409).

**Backoff.** After a failure, `nextRetryAt = now + min(maxMs, baseMs · factor^(streak−1)) · (1 − jitter + jitter · random)`
(`jitter: 1` is full jitter). Push, document push and pull each keep their own streak, so a failing pull is not reset by a
successful push. `syncOnce()` skips with `skipped: 'backoff'` until the time passes (`{ force: true }` overrides);
`push()`, `pull()` and `pushDocuments()` always try. `start(pollMs)` runs `syncOnce` on a timer and at `nextRetryAt`.

## Status

`await client.status()` →

| Field | Meaning |
|---|---|
| `pending` | events waiting for the server |
| `rejected` | events the server refused (`queue.rejected()` lists them with their issues) |
| `quarantined` | pulled events the local log refused |
| `dirtyDocuments` | documents edited here and not yet accepted |
| `lastPushAt`, `lastPullAt` | epoch ms (the host's `now`) of the last success |
| `lastError` | the current push / document / pull error, if any |
| `nextRetryAt` | epoch ms before which `syncOnce` will not try again |
| `skewMs`, `serverTime` | client − server clock, and the server's clock at the last response |
| `head`, `cursor` | server head seq as reported; highest seq applied locally |
| `online` | the `setOnline` gate |
| `conflictCopies` | conflict-copy docIds made since the client started |

`onStatus(status)` is called after every push and pull.

## What a host must provide

- `KeyValueArea` (`get / set / remove / list(prefix)`): `createMemoryArea()`; `adaptStorageArea(chrome.storage.local)` for the
  extension; Dexie or localStorage with a few lines. Values are JSON.
- `Transport` (`push` / `pull` with the contract's `SyncPush*` / `SyncPull*` shapes). It must THROW on any failure, including a
  timeout (a timeout after the server stored the batch is the lost-ack case and is handled). Authentication, retries below the
  sync level and request timeouts belong in the transport.
- The device's `EventLog` (`local`): pulled events are appended to it. The host also appends the device's own events to it
  when it creates them (or lets them return through pull).
- `now()` and, for production, nothing else: `random` and `timers` default to `Math.random` and `setTimeout`.
- Event ids: `newEventId(deviceId, Date.now(), Math.random)`; `dedupeKey` is the producer's when it needs cross-device idempotency.
- Connectivity: call `setOnline(false/true)` from the platform's online/offline events and call `syncOnce()` (or `start()`).

## Multi-device walkthrough

1. Phone and laptop both belong to learner L. The phone is offline on a train; the learner reads and marks 30 words. Each
   `enqueue` persisted a row, so closing the app loses nothing.
2. The phone reconnects: `syncOnce()` pushes in batches of ≤ 200. The server answers `stored` for each; rows are acked; the
   same call then pulls (own events come back and are skipped as duplicates by the local log).
3. The laptop's next `syncOnce()` pulls those 30 events after its cursor and appends them locally; its projection folds them.
4. Both devices have edited the draft `d1` offline. The phone syncs first (revision 2 on the server). The laptop's push is
   refused with `current` = revision 2 → the laptop shows the phone's text under `d1`, and its own text as
   `d1:conflict:laptop:2` titled "… (conflict copy from laptop)", pushed in the same call. The phone gets the copy on its
   next pull. Both texts exist on both devices; the learner merges by hand.
5. A response is lost after the server stored a batch: the retry (after backoff) gets `duplicateOf` for every event, acks them,
   and the server still has exactly one copy.
