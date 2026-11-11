# Loading in GoLearn and GoReview: assessment and re-foundation (2026-11-10)

The owner, 2026-11-10: "Look at the GoLearn and GoReview architecture. The loading is so inconsistent and unstable that I am
thinking there is need for massive architectural overhaul."

This document records what was traced and measured, what the cause is, what was changed at once (stage 1), and what is proposed
next (stages 2 to 4). The traces were read from master `c0dd0076`; the measurements are those of the sessions that made the fixes
of 2026-11-08 and 11-09, taken on throw-away local accounts behind a delay proxy (rigs: `scripts/loadcheck/`).

## 1. Verdict

The foundation is sound and stays: an append-only event log per learner, projected into knowledge rows, synced through the
Repository service. What is wrong is the **read side**. Both apps were written so that a screen first asks the service, or
re-reads and refolds the learner's whole history, and only then shows something. Loading time is therefore a function of history
size, of the network, and of whether a cache happened to be warm, which is what "inconsistent" looks like from the outside.

Six commits in 48 hours (469c1143, 6123a2ff, cfafb1c4, 609ced8c, 2efbef5b, c0dd0076) each rescued one path from this shape.
They were right, and each was a patch: the shape itself was unchanged, and every new screen written the old way would bring the
problem back. The remedy is not a rewrite. It is one rule, enforced by tests, and three pieces of read-side infrastructure.

## 2. What was found

### The service is not the cause, but it amplifies
`/health` answers in 0.2 to 0.3 s and the process had been up 25 hours. Several requests the clients make on every load do work
that grows with the learner's history (E events, K knowledge rows):

| Request | Cost per call | Where |
|---|---|---|
| `GET /candidates` | reads and folds the WHOLE log, plus up to 2K sequential store calls; a 20 s in-memory cache that any upload voids | `repository-engine/src/engine.ts` candidates, `handler.ts` rankedCandidates |
| `GET /vocabulary?sort=…` | scans and enriches every row, sorts in memory, returns one page; a full walk is O(K²/page) | `handler.ts` vocabulary; GoReview asks `sort: 'recent'` (`deckModel.ts` loadVocabLive) |
| `GET /knowledge`, `/vocabulary`, `/candidates` | every read runs `rekeyIfAliased`, which reads all K rows | `engine.ts` ensureCurrent |
| `GET /preferences` | re-reads the entire log, no cache; may write | `engine.ts` preferences |
| first sync on a device | the whole log in sequential pages of 1,000 (12 requests for 12,000 events; measured 107 to 111 s in the extension) | `repository-sync/src/client.ts` |

SQLite access is synchronous on one Node process, so one learner's heavy request stalls every other request, and the server has
no request timeout: a client that gave up after 8 s leaves the work running. Identical requests alternate between near-zero and
the full cost. (The projection itself is incremental since b22a4e5e; these read paths were not touched by it.)

### GoReview (web and iPhone)
- The home model was rebuilt live on every cold start, memo miss and stale press: 10 to 40 requests, a per-request 8 s timeout,
  **no overall deadline and no single-flight**. It was awaited at 17 call sites.
- 6123a2ff painted this device's saved deck first, but `render` still awaited the live load and the review build's launch
  splash is dismissed only when the first screen's `render` resolves (`app.ts`), so on the installed app the saved paint sat
  under an opaque splash until the live load finished. The 1.5 to 2 s "reopen" measured on 11-09 was the time to the element
  existing, not to it being visible.
- Every press on the home (`freshModel`) ran a full live load when the model was older than 5 minutes or a sync had appended
  events: the 18 to 25 s "Begin new deck".
- The session summary awaited a live load before showing its Next section (a blank panel), and again on each button.
- `identity()` awaited `GET /me` in front of every screen once the cached profile was 10 minutes old.
- Each answered card re-read and refolded the whole log about ten times (presentation guard and return tracking), with a
  possible awaited `/knowledge` call. Not yet measured; stage 2.
- A failed `config.json` silently pointed the app at `http://127.0.0.1:8790`.
- Nine caches and memos with different lifetimes (2 s, 30 s, 5 min, 10 min, page, build), none of them the single source.
- First sign-in on a device: about 21 s, mostly 226 dictionary shard downloads and a 4 MB bundle; about 1 s (at 4x CPU) of every
  start builds the lexicons of languages not in use at module load.

### GoLearn (the extension)
- Manifest V3 stops the worker after about 30 s idle. **Every worker start reopened the device Repository**: it read every
  stored row and refolded the whole history (3.4 s at 12,000 events, after 2efbef5b; 5 to 13 s before). The projection is
  deliberately never persisted (`repository-local/src/persist.ts`). The rows that paint a page's marks and a card's level, and
  the language switch, waited for that open.
- A one-minute sync alarm woke the worker, so the open ran every minute whether or not anyone was reading.
- Warm, a lookup takes 0.5 to 0.8 s; cold, 5.4 to 6.3 s. Reading a paragraph is longer than 30 s, so most lookups were cold.
- The page's requests gave up silently after 4 s with no retry: marks that never appeared ("0 underlined"), a card that said
  "unavailable", and a `status` timeout that made the page read as Albanian whatever its language.
- History is stored about three times (the recorder's log, the upload queue, the Repository rows), all in `chrome.storage.local`.
- "Pack installed" is a reachability check plus a record; seven different stores say what the current language is, written by
  the worker, the popup and the setup page, and they can disagree.
- Only the Albanian dictionary ships inside the extension; every other language's shards come over the network on first use.

### Delivery
- The owner's browser runs an unpacked build that changes only when Reload is pressed; it was found days behind master more
  than once. The iPhone apps change only with a TestFlight build. The four surfaces are routinely on four different versions.
- CI's test job has been red on every master commit since 2026-11-07, so it protects nothing at present.

## 3. The rule

1. **No screen and no press awaits the network when the device holds a usable local copy.** The network refreshes the local
   copy in the background; a refresh that changes something repaints the open screen. A press may wait at most 1.5 s for a
   refresh that is already running.
2. **No read costs more as history grows.** State that is shown is read from a stored read model, keyed by what is asked
   for; the event log is folded when an event arrives, not when a screen opens.
3. **A slow or missing answer is a state, not a failure.** Reads are retried; nothing changes language, empties a page or
   reports "not saved" because a request was slow.
4. **One writer per fact.** One place says what the current language is and whether its pack is usable.
5. **The rule is a test.** `test/loading/` runs each journey with the service hanging forever and fails if a screen waits.

## 4. Stage 1 (done with this document)

See the commit that adds this file for the exact list. In short:
- GoReview: a local-first model accessor with a single-flight, deadline-bounded background refresh; the home, the presses,
  the session summary and the other screens open from the local copy; the splash goes at first paint; identity and
  configuration use the last good copy.
- GoLearn: the worker is kept warm while a page with GoLearn in use is visible; the Repository opens on demand, not on every
  alarm wake; reads are retried; the page keeps its language when `status` is slow.
- `test/loading/`: the rule as a suite. `scripts/loadcheck/`: the measuring rigs, kept.

Stage 1 changes no stored format and needs no server deploy.

## 5. Proposed next (each needs the owner's word)

**Stage 2: a device store that opens without reading (approved by the owner, 2026-11-10: "Go ahead with the larger step too").**

Measured before designing (`scripts/loadcheck/golearn-history/bench-open.ts`, Node, an in-memory area, so storage itself costs
nothing here):

| Events | Stored rows | Cold open | of which reading and re-inserting rows | of which the fold |
|---|---|---|---|---|
| 3,000 | 9,230 | 0.78 s | 0.43 s | 0.36 s |
| 12,000 | 18,230 | 1.27 s | 1.01 s | 0.26 s |

The fold is a fifth of the cost at 12,000 events; four fifths is reading every row back and re-inserting it into the in-memory
store, and in the browser that read goes through `chrome.storage` as well (3.4 s in all, measured 11-09). **Persisting the
projection alone would therefore not fix cold starts**; the store itself must stop being "all rows in memory". So:

- `openIndexedDbStore` (`repository-store/src/indexeddb.ts`): the same `ConcreteStore` port as the memory and SQLite stores,
  over IndexedDB, passing the three existing conformance suites. Opening reads nothing; each query reads what it asks for
  through an index; the projection and its cursor are stored like any other table, so an event folds only the units it
  touches, as on the server since b22a4e5e.
- `createIndexedDbArea` (`repository-sync/src/idb-area.ts`): the small rows that are not store tables (the device's meta
  record, upload markers) in the same database, read by key or by prefix range.
- `repository-local` opens over these when the host supplies an IndexedDB factory; the identity rows (the local account, the
  session and its token hash) stay in memory only, as now. Without a factory (older hosts, tests) the present path is unchanged.
- Migration, once per device: the existing `golearn:repo:*` rows are read through the present loader into the new store, the
  projection is rebuilt, and the result is checked against the old one (event count, head, every knowledge row) before the
  device switches. The old rows are kept, untouched, until a later release removes them; a failed check leaves the device on
  the old path and says so in the developer diagnostics.
- GoReview's per-screen and per-answer folds get one shared view per event head. Measured first.

Measured in a real browser (`scripts/loadcheck/idb-browser/`, Chromium 156, the device Repository over real IndexedDB, 750
distinct words):

| Events stored | Re-open | First knowledge of 60 words after open | The same, warm | Recording one event |
|---|---|---|---|---|
| 3,000 | 0.8 ms | 14 ms | 1.5 ms | 5.9 ms (max 9.7) |
| 12,000 | 1.0 ms | 17 ms | 2.0 ms | 6.6 ms (max 18.6) |

The present path's cold open at 12,000 events is 3.4 s in the extension. These do not grow with history: rule 2 holds.
Getting there needed one engine fix (0edf83ef): the stale-alias scan read every knowledge row on every read and projection
(790 requests per recorded event at 750 known words); it now runs only after the alias table changed.

Not fixed yet, and visible in the same run: a BULK append projects after every batch, and a batch of 500 events touches most
of the learner's units, so each batch re-reads most of the log (12,000 events seeded in 94 s). The first sync on a new device
goes through that path (`repository-local/src/transfer.ts` pull). The migration does not: it imports and rebuilds once.

The recorder's log and the upload queue stay where they are in this stage (they are the durable outbox); folding the three
copies of history into one is a later simplification.

### Stage 2 as wired (extension)

- **First start after the update.** The worker opens the device Repository over IndexedDB (`golearn-repository`, `golearn-repository-kv`) and, once, moves
  the `golearn:repo:` rows in and verifies the copy before switching (about 12.5 s at 12,000 events, measured). A device with no history starts fresh in
  IndexedDB. While the open runs the worker touches an extension API every 20 s so the browser does not stop it. Every start after that reads only the state
  row `golearn:repo:migration` (about 1 ms). Without IndexedDB in the worker nothing changes.
- **What the learner notices.** One wait of some seconds, on the first start, with a large history; lookups meanwhile are answered from the recorder's own
  log and the kept enrolment summary, as in Stage 1. Nothing is lost if the browser stops the worker: the move is restarted from the untouched rows.
- **How to see it.** The setup page's local-repository status carries `storage`: `mode` (`indexeddb`, `rows`, or `rows-frozen` when IndexedDB would not open)
  and `migration` (`state` switched or failed, `attempt`, `events`, `ms`, `reason` on a failure, `recovered: true` after a recovery).
- **How to retry.** A failed move is not tried again with the same number: raise `LOCAL_MIGRATION_ATTEMPT` (`background/localRepo.ts`) in a release and
  the devices that failed try once more.
- **Recovery.** If the browser discards the IndexedDB data of a switched device, the next open finds no identity row there, sees the frozen rows, and moves
  them in again (same attempt number); the history up to the switch comes back, anything recorded after the switch is gone with the discarded data.
- **Delete this device's data** clears the Repository itself: both databases are deleted, the frozen rows are removed, the state row is rewritten (switched,
  no events) and a fresh identity starts in IndexedDB. Signing out keeps the local data, as before.
- **The old rows stay**, frozen and unmodified, until a later release removes them. Only the worker opens them; the setup page, GoReview and Biblia reach the
  Repository through the worker.

**Stage 3: the service's read paths.** Candidates computed incrementally (or cached durably per learner and head);
preferences stored with a cursor; `rekeyIfAliased` off the read path; the sorted vocabulary listing served from an index;
a server-side request deadline; sync's first pull in parallel or as one compressed snapshot. Needs a Render deploy.

**Stage 4: delivery.** Language adapters loaded per language instead of all at module load; dictionaries packaged per
language at install so "installed" means usable offline; one language/pack-ready record; the unpacked extension reloads
itself when its folder holds a newer build; a build stamp visible in each app; CI green and required.

## 6. How to check

- `npx vitest run test/loading` : the rule.
- `scripts/loadcheck/README.md` : the browser rigs (headless Brave, a throw-away local service behind a delay proxy).
  Measure "visible" (the splash gone), not "present in the DOM".
