# Annex D — identity, storage, sync, privacy and integrations (read-only audit, 2026-10-08)

Produced by a code-reading agent on HEAD 8dc86370 and reviewed by the lead. Nothing edited or created; no
downloads. Stale docs noted: `docs/STORAGE.md` says "Schema version 1"; `src/ui/goread/TeamTexts.tsx:3-4` says
"There is no server" while importing the server client. Code is cited, not the docs.

## 1. Identity and auth

`User = { id, displayName, courseId, createdAt, interests? }` (`src/core/model.ts:52-59`): no email, credential,
token or external id. The first learner is `u-local`, "Learner", created by `seedFirstRun` once a team is chosen
(`bootstrap.ts:120-128`, `prefs.ts:167`); extra learners get `u-${Date.now().toString(36)}` (device-local;
`Settings.tsx:154-163`); switching is a `<select>` with no PIN or lock; all learners share one IndexedDB, isolated
only by `userId` filters. Active learner and team live in localStorage (`go-v0:active-user`, `go-v0:chosen-course`).
`userId` is embedded in dedupe keys, learner item ids (`userId|itemId`), encounter ids, testimony/draft ids, meta ids
and two localStorage keys; `metaBelongsTo` (`backup/format.ts:42-47`) tests id segments against the userId.

No login, no session token. The only browser secrets: the Azure key (opt-in remember) and the team contributor key:
32 random bytes base64url shown once, server stores sha256 only, authorises `PUT /teams/:course/texts/:id` and
`GET /teams/:course/me`, stored client-side in plaintext inside the `go-v0:prefs` JSON (`prefs.ts:36-43`), sent as
`Authorization: Bearer` (`goread/client.ts:120-122,165,175-177`). Server (`server/goread/handler.ts:160-171`):
constant-time hash compare, revoked keys refused, reads fully open to any origin and team, CORS `*`, no rate limit;
whitelist management is CLI only. Speech proxy (`server/speechHandler.ts`): no user auth, same-origin check,
30/min per address, 20 KB body cap. No learner accounts exist server-side.

## 2. Storage

Dexie DB `go-v0` (`src/db/dexie.ts:232`); sandbox `go-v0-sandbox-<name>`. Versions: v1 original; v2 adds `drafts`,
`meta`, `texts.reviewStatus`, `sentences.key` with a real upgrade; v3 adds `stages`, `works`, `notes`, `texts.workId`;
v4 adds `catalog` and is `schemaFor()` derived live from `INDEXES`, so a later index change silently alters v4 with
no upgrade. 37 `AppStore` tables plus `blobs` (content-addressed audio bytes). User-scoped: `users`, `events`
(userId,type,dedupeKey,session), `encounters`, `learnerItems`, `recordings`, `testimonies`, `revisions`,
`suggestions`, `drafts`; mixed: `meta` (free-form, some per-user: policy marker, retrieval state, alphabet state,
held-out map, stage choice, assessment attempts; some global), `texts` (includes private testimonies and personal
copies); global content: `languages`, `courses`, `sources`, `corpora`, `sections`, `paragraphs`, `sentences`,
`tokens`, `lemmas`, `analyses`, `phrases`, `phraseOccurrences`, `patterns`, `patternOccurrences`, `rescues`,
`stages`, `works`, `notes`, `catalog`; audio tables. Sizes: `public/library` 196 MB / 12,634 files (de, es, hi, sq,
th), `public/dict` 122 MB / 2,315 files, `dist` 328 MB; the active language's bundled texts are imported into
IndexedDB at startup. The event bus loads the entire `events` table (all users) into memory on first emit to build its
dedupe set (`bus.ts:15-19`). Nothing calls `navigator.storage.persist()`.

localStorage keys: `go-v0:prefs` (highlight, speed, transcript, fontSize, theme, challenge, preview, devFixtureAudio,
azureDirectKey, teamServer, teamKey), `go-v0:speech-azure` (`{key, region}` plaintext if remembered),
`go-v0:active-user`, `go-v0:chosen-course`, `go-v0:sitting:<userId>`, `go-v0:draft-copy:<userId>:<lang>` (plaintext
testimony draft copy), `stage0:computer-voice`, `go.read.open.<lang>`, `go.scripture.open.<lang>` (the last two
unscoped). No sessionStorage, Cache API, service worker or manifest.

Event log: a union `DomainEvent` of ~50 types with base `{id, userId, lang, at, surface, session, dedupeKey}`
(`events.ts:19-27`). `StoreEventBus.emit` drops a seen `dedupeKey` (global in-memory set), stamps `id =
ev:<time36>:<counter>` and `at`, then `events.put`. Immutability is by convention: `put`/`delete` exist; the only
deletes are `wipeLearner` in replace-mode restore and `store.destroy`. Only 11 types are folded into learner state
(`FOLD_TYPES`, `fold.ts:100-103`). Rebuild: `POLICY_VERSION = 'evidence@8'`, meta stamp `golearn.policy:<userId>`,
`ensureCurrent` at startup and on `selectUser`, `rebuild` deletes the learner's encounters and learnerItems and
replays `bus.history`; also triggered by bundled-text re-analysis and listening invalidation. Decay is computed at
read time with no version bump.

## 3. Backup, export, deletion

Format `go-backup` v1: `{format, version, createdAt, userId, policyVersion?, includesRecordings, counts, checksum
(fnv1a64 over canonical JSON; corruption, not tampering), data}`; `data` holds one learner's `user`, `events`,
`testimonies`, `revisions`, `suggestions`, `drafts`, `recordings` metadata, `testimonyContent`, `reference`, `meta`
(excluding `/polic/i`), optional base64 `assets`. Not encrypted. Excluded: personal book copies, team texts,
learner-imported listening recordings (inferred), `encounters`/`learnerItems`, all localStorage, other learners.
Restore validates first (format, version, checksum, wrong-learner rows, counts), merge (additive, dedupe by id then
`dedupeKey`, device wins for revisions, newer drafts, suggestions forward only, policy marker cleared) or replace
(`wipeLearner`: that learner's events, suggestions, drafts, recordings, revisions, testimonies, private texts,
encounters, learnerItems, meta; keeps the user row and shared blobs); idempotent.

**There is no "delete my data" path**: `users.delete` and `store.destroy()` are never called from the UI; the only
learner-data deletion is replace-restore, which is partial. Team texts are never removed through the server. Gaps:
export omits personal copies, imported audio and settings; no erasure; no per-event erase; plaintext backups and draft
copies; learner-authored text in events travels in backups (`ProductionRecorded.sentenceText`,
`TellAttemptSubmitted.record`, `Stage0ProductionAttempted.text`, `Stage0ExitAnswered.text`, `FormSearched.query`,
`GoTellSuggestionEdited.finalText`, `UserRecordingCreated.targetText`).

## 4. Sync and sharing

Learner evidence never leaves the device in code. Network clients: GoRead (`src/goread/client.ts`, posts
`{document}` of texts only), optional speech, same-origin `/library/**` and `/dict/**` GETs. No sync of events, no
background sync, no queue. GoRead protocol: `GET /health`, `GET /teams/:course/texts[?since]`, `GET
/teams/:course/texts/:id` (open), `PUT /teams/:course/texts/:id` (Bearer; 2 MB cap; 409 on existing id; no DELETE),
`GET /teams/:course/me`. Client gate `shareable()` refuses personal-copy, user-private, generated, unverified, and
PD/licensed without verification; the server re-checks. Server storage: one SQL schema (`texts`, `contributors`);
Node `node:sqlite` at `data/goread/goread.sqlite` (127.0.0.1:8787) or a Cloudflare Worker + D1
(`wrangler.toml.example`; the real config is git-ignored; nothing was run). Server URL is free text in Settings, not
constrained to HTTPS. Offline: local-first data, no service worker, library/dictionary fetched on demand. Conflicts:
none between devices (no sync); drafts have optimistic concurrency; event ordering trusts the client clock; event ids
(`time36 + counter`) are not collision-safe across devices; a same-user id collision on restore silently drops an
event.

## 5. External services and secrets

Azure direct (`azureProvider.ts`): POST to `{region}.tts.speech.microsoft.com` with `Ocp-Apim-Subscription-Key` and
SSML of the sentence; key in a private field, redacted in `toJSON` and errors; never tested live; "remember" stores
`{key, region}` plaintext. Proxy (`server/speechHandler.ts`): key in server env, same-origin `/api/speech/*`, 20 KB,
5,000 chars, 30/min; `LISTEN = false` in `vite.config.ts` mounts none; static deploy has no proxy; never run live.
What Azure would receive: sentence text plus voice/locale; generation needs `validateGenerationAuthorization` and
without a stored grant generated assets cannot play or count. Browser `speechSynthesis` for Stage 0 and the Reader
practice (never evidence). AI/LLM: none; `InterpretationProvider` is an interface, `consult()` takes an optional
provider with a 4 s timeout, nothing is passed, so nothing is sent; if wired it would send the learner's attempt
text, goal and language. No other network calls, no analytics, no CSP or security headers (`index.html` has none;
GitHub Pages cannot set headers; no `innerHTML`/`eval` in `src`). `.env.example` empty values; `*.local` and
`wrangler.toml` ignored.

## 6. Ebook and reader integration surface

Paths in: `.txt` (`CopyImporter.tsx:107-146` → `plainTextToDocuments`, chapters auto/none/regex/explicit, quality
report); `.epub` (`src/ingest/epub.ts`: own zip reader, spine → XHTML → lines; caps 64 MB entry / 256 MB total);
`.json` import documents (`CopyImporter`, `JsonImporter`); team texts; dry-run preview before any write. Each chapter
becomes a `personal-copy` document, "Your copy", never bundled or shared. DRM: none; `epub.ts:7-8,92,244-248`
refuses protected EPUBs with `EpubError('encrypted')`, allows only font obfuscation. No browser-extension code (no
manifest, no `chrome.*`/`browser.*`, no `postMessage`/`BroadcastChannel`), no desktop integration.

## 7. Build and supply chain

`npm run build`: `tsc -b` → `rights-gate.mts` → `check-course-libraries --require hi,de,es,th,sq` →
`verify-scripture-canon.mjs` → `library-audit all` → `dict-status --require …` → `vite build`. The Vite rights-gate
plugin nulls unverified `data/corpus/**` documents and aborts on a refused claim; it does not touch `public/library`
or `public/dict`. Git-ignored: `data/private/`, `public/dict/`, `public/library/`, `data/dictionaries/`,
`data/research/`, `data/goread/`, `wrangler.toml`. No CI, `package-lock.json` v3, no Node pin, 4 runtime + 11 dev
dependencies, no install scripts, 421 test files, no deploy script (gh-pages holds built files). Base-path finding:
`createFetchLexiconSource` defaulted to `/dict` and `createLibrary` to `/library`, which break under a sub-path host
(lead's note: confirmed live on 2026-10-08 — `/go-v0/dict/...` 200, `/dict/...` 404 — and fixed in `bootstrap.ts`
by deriving the base from Vite's `BASE_URL`).

## 8. Risks (ranked)

1. No deletion / erasure path (per-learner purge needed; tombstones if events sync).
2. Team-server writes gated by one plaintext bearer key; reads open to anyone; no rate limits; no HTTPS enforcement.
3. Secrets in localStorage in plaintext (Azure key, team key); no CSP.
4. No CSP or security headers; static host cannot set them; data-rich origin.
5. Plaintext backups that omit personal copies and imported audio.
6. IndexedDB not persisted (`navigator.storage.persist()` never requested); single source of truth.
7. Event identity and dedupe not multi-device safe (time+counter ids, global in-memory dedupe, device-local user ids,
   trusted client clock; restore can silently drop a colliding event).
8. Learner-typed text and read-sentence text inside events and backups; private-book slugs in ids.
9. Synthetic-speech provider terms not recorded; never run live.
10. Absolute `/dict` and `/library` fetch paths (fixed, see §7).
11. `INDEXES` drives Dexie v4 with no version guard.
12. No CI, no Node pin, caret ranges.
13. No offline shell (no service worker).
14. Several learners share one profile unlocked.

## 9. What a shared Repository could reuse, and the coupling to cut

Event-log shape and bus (sound; cut the product-specific kinds — `Stage0*`, `UnseenCheckRecorded.stageId`,
`ListeningAssessment*`, `Tell*` ids — and the closed `surface` enum; payloads reference `textId`/`sentenceId`/
positional `tokenIds`; event ids need a global scheme); dedupe keys (portable, but embed `userId` and the UI
session); folded aggregates (`encounters`, `learnerItems`, `agg.ts`, `fold.ts`: the derived-state layer; the fold
reads library `Text`/`Sentence`/`Token`/`Analysis` rows to resolve items); policy versioning (generic mechanism;
the stamp is a meta row; decay changed rules without a bump); backup format (versioned, checksummed,
validate-then-write; per-learner with GoTell payloads; no encryption); id scheme (`ids.ts`: FNV content ids;
sentence ids depend on exact text; token ids positional; `ids.event` not globally unique); store contract (small,
swappable; one flat 37-table schema; `meta` untyped).

## Not inspected / uncertain

Contents of `gh-pages`; live behaviour of Azure, the proxy, the GoRead server; most of `docs/goread/BACKEND.md`,
`docs/SPEECH.md`, `docs/ARCHITECTURE.md`, `docs/GOLISTEN.md`; `documentOf.ts`, `JsonImporter.tsx`, `golisten/import.ts`
internals; which meta rows are learner-scoped in practice; the recorder and testimony upload UI; `GoTell.forUser`;
whether any `speechSynthesis` voice is network-backed; installed versions and vulnerability scans; tests (counted, not
run); the untracked `work*` files.
