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

Corrected 2026-11-11: that note was wrong about the first sync. The pull appends one page at a time and projects ONCE at the
end (it did so before this work; 58150c18 made each page one append). Traced and counted with
`scripts/loadcheck/golearn-history/probe-firstsync.ts`: 16.8 IndexedDB requests per event at 1,000 events and 10.3 at 3,000,
one projection at either size, so a first sync is linear in the history. The 107 s seen in a browser on 2026-11-09 predates
those changes and has not been re-measured in a browser. What was missing was staying power, added in dc815ed9: the worker is
held awake for the length of a sync round and of the upload-and-pull, and a pull that was cut off resumes on the next
successful sync round from its per-page cursor (`golearn:local-pull-open`). Still true: the history comes down twice over the
network at first sign-in (`GET /events` for the device, `POST /sync/pull` for the client's cursor).

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

### Stages 3 and 4 as built (2026-11-11), and what is left

Built, each with a test under `test/loading/` or the suite named:

| What | Where | Before -> after |
|---|---|---|
| Service read paths (stage 3) | 367e2a78, 06a2abde, 58150c18; live on Render since 2026-11-11 | at 12,000 events: vocabulary walk 26.5 s -> 0.6 s, sorted page 6.3 s -> 74 ms, 200-event push 1,036 -> 141 ms, candidates 119 -> 21 ms |
| GoReview start script carries no language | 4c4838c0 (`leanBuiltins.ts`) | start script 4.10 MB -> 1.01 MB; start graph 221 -> 40 ms |
| Build stamp and self-update of the unpacked extension | 73871178 (below) | a stale folder no longer runs for days |
| First sync stays awake and resumes | dc815ed9 | an interrupted first pull continued only at the next sign-in |
| The dictionary's location is local-first | 0691a016 (`gloss.ts`) | the first meaning after every worker restart waited on up to three network probes of up to 15 s; now none when the device holds the dictionary, and 4 s per probe otherwise |
| One answered card folds one card | d6771d1c (`engine.ts`) | 12,006 events through the fold per answer at 12,000 events -> 6 |
| The hosted GoReview keeps its dictionary and its languages | d1c5dda0 (`sw.js`, `register.js`) | no dictionary shard was ever kept on the hosted site (it is read from outside the worker's scope); a language could be lost by an update or a first visit |
| A deleted account leaves the service's memory | 5dde62de | its cached lists stayed until other keys pushed them out |

Two premises of this document were wrong and are corrected above: persisting the projection would not have fixed cold starts
(section 5, stage 2), and the first sync was never quadratic (the note under the real-browser table).

Not built, with the reason:

- **2026-11-11, built: the explicit "Download for offline use" below.** The owner decided it, per language, in the setup page
  (GoLearn extension only): the worker fetches the meaning files and the forms index into its own IndexedDB database
  `golearn-dictionary` (as fetched, not in chrome.storage), reads from it only after a chrome.storage miss, and Delete this
  device's data now removes it, the cached `pack:shard:*` rows and the pack install records. "Installed" (the badge) still means
  only what it meant; `docs/ecosystem/GOLEARN-INSTALL-AND-TROUBLESHOOTING.md` has the learner-facing text. The full entries
  (`full/`) and the reverse index are not part of it.
- **"Installed" still does not mean "usable offline" for a dictionary** (without that download). `installPack` fetches the dictionary's manifest and
  ONE shard and runs the validation cases; meanings are then fetched as the learner reads (and kept). A whole-language
  download is a storage decision: the meanings alone are 6 MB (Albanian), 41 MB (German), 58 MB (Spanish) compressed, more
  once inflated into extension storage, and several times that with the full entries. Proposed as an explicit "Download for
  offline use" per language; the owner decides.
- **One language/pack-ready record.** The trace found not seven stores answering one question but several stores answering
  different ones; only two say "pack installed" (`golearn:pack:installed:<id>` and `golearn:app`.packs), and only the setup
  page reads them. Lookups never consult either. A single persisted record replacing them needs a migration across four
  writers and two apps; a derived `packReady()` is the smaller step and belongs with the offline download above.
- **GoReview intake fetches facts for every candidate** (226 lookups at a first sign-in). A bounded fetch is built and
  measured (a8269763) but not passed by the app, because it changes the counts the details screen shows: the owner decides.
- **GoReview still reads its whole log about eight times per answer** (`context.ts` `events`), about 100 ms per answer at
  12,000 events in Node, and the review model's refresh folds the whole log once when it runs. Measured, left.
- **The history comes down twice at a first sign-in** (`GET /events` for the device, `POST /sync/pull` for the client).
- **Not seen in a real browser:** a first sync's seconds since 58150c18; the signed-in GoReview screens with the on-demand
  language files (their caching was checked signed-out on the live site: `goreview-lang-<build>` and, for the first time,
  `goreview-dict-v1` with `/go-v0/dict/...` entries).

Seen in the owner's browser, 2026-11-12 (read from the worker's own `golearn:self-update` row and the browser's record of
the extension, by another session): the unpacked extension reloaded itself twice, 95 s and 126 s after `build.json` was
written last in the mirrored folder (faabbabbd5c7 -> b59be400dc86 at 01:53:30Z, b59be400dc86 -> 2cf4bfdbcf38 at 02:12:30Z),
with no Reload pressed: an unpacked extension's fetch of `build.json` does read the file on disk, and the two-sighting rule
holds the reload back as designed.

## 6. How to check

- `npx vitest run test/loading` : the rule.
- `scripts/loadcheck/README.md` : the browser rigs (headless Brave, a throw-away local service behind a delay proxy).
  Measure "visible" (the splash gone), not "present in the DOM".

## Delivery: build stamp and self-update

The owner runs GoLearn as an unpacked extension from `packages/golearn-extension/dist`. A rebuilt folder changes nothing until Reload is pressed at the browser's extensions page, and the browser was repeatedly found days behind the code.

- **Stamp.** `vite.config.ts` computes the build id once per process: the first 12 characters of `git rev-parse HEAD`, plus `-dirty` when `git status --porcelain` is not empty (`unknown` without git; `computeBuildId` is exported), and the build time. Every mode compiles them in as `__GOLEARN_BUILD_ID__` and `__GOLEARN_BUILT_AT__`; the background build also writes `dist/build.json` (`{ id, builtAt }`), so the file and `background.js` always agree. The status carries `build`; the popup's last line reads `Build <id> · <time>`.
- **Self-update** (`src/background/selfUpdate.ts`). At worker start, on the one-minute alarm and when the popup asks for the status (never from a content script) the worker fetches `build.json` (`cache: 'no-store'`). A different id (and a `builtAt` not older than its own) means the folder is newer. **Two sightings:** the first check that finds it only records it (`seen: { id, builtAt, at }` in the same storage record, so a stopped worker still has it); a later check at least `SETTLE_MS` = 60 s after `seen.at` that reads the SAME id again may reload (a different id restarts the wait). This is because a file-by-file mirror (robocopy) or an in-place build can make `build.json` appear while `background.js`, `content.js`, the lexicon and the pages are still being written; a mirror should still copy `build.json` last when it can. At the second sighting it calls `chrome.runtime.reload()` only if the device Repository is not opening or migrating, no `record` message is in flight, and the last self-reload was more than 120 s ago. `golearn:self-update` in `chrome.storage.local` keeps `{ reloadedAt, toId, fromId }`: if the worker starts again still running another id while build.json says `toId`, it does not reload for that id again and records `stuck: true`. A missing, unreadable or malformed build.json does nothing; a store install (build.json equal to its code) is inert. For 10 minutes after a reload the status carries `updatedAt` and `updatedFrom` and the popup says `Updated to build <id> at <time>`.
- **Open pages.** Content scripts already in pages are orphaned by the reload; the next injection replaces them and their keep-warm stops when a send throws. A learner reloads the page (or lets Active re-register) to get the new script.
- **Caveat.** build.json is written when the background build finishes, before the popup and analyser modes; a reload in that window can pair a new worker with a popup not yet rebuilt until the next check. Tests: `test/loading/golearn.update.test.ts`.
