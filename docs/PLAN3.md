# PLAN 3 — demonstrably ready for supplied texts (small reviewed Spanish corpus first)

Rules for every package are those of `docs/PLAN2.md` ("Rules for every package"). `src/core/**`, `docs/PLAN*.md`,
`docs/READINESS.md`, `test/integration/**`, `test/core/**`, `scripts/verify-scripture.mjs`, `data/verified/**`
belong to the coordinator. Evidence policy v2 (PLAN2) stays in force; nothing below may weaken it.

## Finding that drives this round
"Read: 0 of 3" became "Read: 2 of 3" just by opening a Scripture passage and its preparation panel. Causes:
a sentence counted as viewed after 600 ms on screen whatever its length and whatever the learner was doing;
the label said "Read"; completion was inferred once every sentence had been seen; and a new session id on every
page load let reloads and route revisits mint new exposure encounters.

## The five notions (contract: `ReadingProgress`, `SentenceViewed`, `TextViewed`, `TextCompleted`)
1. **Displayed / previewed** — opened, or shown by a preview / preparation panel. `TextViewed` (`mode`). Counts nothing.
2. **Reading exposure** — `SentenceViewed`: the sentence stayed in view in the reader itself, tab visible, no
   preparation panel open, for a dwell proportional to its length. `ReadingProgress.sentencesSeen`. Label "Seen".
3. **Explicit completion** — `TextCompleted` only. `finishedAt`. Never inferred.
4. **Reported understanding** — `ComprehensionReported` degree `all` without help. `sentencesUnderstood`.
5. **Estimated familiarity** — `estimatedFamiliar`, a labelled estimate on items. Never progress, never "known".

Duplicates: GoLearn derives a **sitting** from time (`SITTING_GAP_MS` = 30 min, `Encounter.sitting`). Within one
sitting there is at most one exposure encounter per (learner, item, sentence, modality), whatever session id the UI
sent; estimates count distinct sittings, not session ids. Evidence is pinned to the version encountered
(`contentVersion` on the events and on `Encounter`).

## Packages (all `model: sonnet`)

### A3 — review workflow and revision history (`src/ingest/**`, `scripts/corpus-*.mts`, `docs/IMPORT.md`, `docs/import/**`, `test/ingest/**`, package.json `corpus:*`)
- `npm run corpus:review -- <file> --by "<name>" [--status reviewed|approved|in-review|rejected] [--date YYYY-MM-DD] [--notes "…"]`:
  records the review in the file's `review` block, removes `needs-native-review` from `editorialTags` when the
  status is reviewed/approved, never touches any text, refuses without `--by`, refuses Scripture that has no
  `scripture.verification` (verification is a separate step), prints whether the document would now publish
  and the remaining reasons if not. Exit codes like the other CLIs.
- Revision history: every import that changes content appends a `TransformationRecord` (`tool: 'ingest@…'`)
  describing the bump (from → to version, sentences added / retired by key, analysis rows written); export
  `contentHistory(text): Array<{version, at, summary}>` for the UI. Confirm (tests) that a revision keeps retired
  sentences with their tokens/analyses, that learner encounters are untouched, and that re-importing the
  ORIGINAL document after a revision revives the original sentence ids rather than minting new ones.
- `validate` output states publication requirements explicitly per document (`would publish: yes/no` + each
  missing requirement), so "missing publication requirements" is a visible validation result.
- `docs/IMPORT.md`: exact, numbered import → validate → review → publish → revise instructions using the CLIs
  and the in-app importer; `docs/import/examples/README.md` with a worked example on a COPY of the bundled
  Spanish story (commands only — do not add reviewed copies of machine-drafted text to `data/corpus`).

### B3 — GoLearn: progress semantics, sittings, version-pinned evidence (`src/golearn/**`, `test/golearn/**`)
- `readingProgress` per the new contract: `sentencesSeen` (live sentences with a reading exposure, i.e. a
  `SentenceViewed`; a report never fabricates a view), `sentencesUnderstood`, `finishedAt` from explicit
  `TextCompleted` only (remove the inferred completion), `sittings`, `contentVersion`. `TextViewed` (any mode)
  affects nothing. Recommendations that depended on "completed" must use `finishedAt` (explicit) — a text all
  of whose sentences were seen but not finished is "in progress".
- Sittings: derive `Encounter.sitting` from event time per learner (gap ≥ `SITTING_GAP_MS` starts a new sitting);
  within a sitting keep at most one exposure encounter per (user, item, sentence, modality) regardless of
  `session`; help / reports inside the sitting upgrade that encounter as today. `estimatedFamiliar` counts
  distinct sittings (≥ 2) and needs ≥ 4 help-free exposures. Bump `policyVersion` to `evidence@3` so existing
  state is rebuilt; rebuild must be deterministic.
- Fill `Encounter.contentVersion` from the event's `contentVersion`, else from the sentence's `versionAdded`.
- Tests: rerender, scroll-in/out, route revisit, reload with a new session id inside 30 minutes ⇒ no new
  encounters; a second sitting ⇒ exposure +1; preview (`TextViewed`) ⇒ nothing; seeing all sentences ⇒ not
  finished; explicit finish ⇒ finishedAt; repeated exposure alone never reaches `recognized`; estimate needs
  two sittings; rebuild identity under `evidence@3`; encounters keep the version they were made against
  after a content revision.

### C3 — speech configuration without client-side secrets (`server/**`, `vite.config.ts`, `.env.example`, `src/golisten/**`, `test/golisten/**`, `test/server/**`, `docs/SPEECH.md`)
- `server/speechProxy.ts`: a Vite plugin (dev + preview servers) exposing same-origin endpoints backed by
  environment variables `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` (read from `process.env` and `.env.local`,
  which is git-ignored): `GET /api/speech/status` → `{configured, provider, providerVersion, region}` (never
  the key), `GET /api/speech/voices?lang=`, `POST /api/speech/synthesize` (`{text|ssml, voice, locale, format}`
  → audio bytes; maps 401/403 → 401 `missing-credentials`, 429 with Retry-After, 5xx, timeouts). The key never
  appears in responses, thrown errors or logs (test this). Request-size and per-minute limits; same-origin only.
  The handler is a pure function `(req) => Response-like` so it is unit-testable with a mocked upstream fetch.
- `ProxySpeechProvider` in `src/golisten` (`isSpeech: true`, id `speech-proxy`): `availability()` from
  `/api/speech/status` (unconfigured ⇒ `missing-credentials` with the exact instruction "set AZURE_SPEECH_KEY
  and AZURE_SPEECH_REGION in .env.local and restart"), synthesize through the proxy, same error taxonomy as
  the Azure adapter, records provider + version, voice, requested vs delivered locale. No key in the browser.
- Partial generation: `audioStatus` must report it visibly (ready x of y, which sentences failed and why) and a
  player can play the ready sentences; add `partial` information to the `reason` text and diagnostics, and tests.
- Keep the direct `AzureSpeechProvider` (advanced / no-server deployments) and the development fixture
  (preview only, never evidence). Exports of learner data never contain credentials (assert in a test with
  `src/backup`).
- `docs/SPEECH.md`: how to configure (proxy first), what is recorded, cache keys (content version via sentence
  keys + voice configuration), review procedure, failure states, and the plain statement that no real speech
  has been produced or auditioned in this repository's history. `.env.example` with the two variable names.
- Tests with mocked fetch for the plugin handler and the provider (success, unconfigured, 401, 429 + retry,
  5xx → failed → dead, network error, partial generation, key never leaks).

### E3 — UI: progress labels, view detection, intent control, Settings structure (`src/ui/**`, `src/app/**`, `src/index.css`, `test/ui/**`)
- View detection: a sentence yields `SentenceViewed` only after a dwell of
  `max(1500 ms, 220 ms × word tokens)` (cap 12 s) at ≥ 60 % visibility, while `document.visibilityState ===
  'visible'`, the window is focused, and no preparation / preview panel or modal is open; timers pause and
  reset otherwise. Events carry `dwellMs` and `contentVersion`. Opening the preparation panel emits at most a
  `TextViewed` with `mode: 'preview'`. Remove any place where a comprehension report or a completion
  fabricates views. One **sitting-stable session id** per learner: persisted in localStorage with a last-
  activity timestamp, reused for 30 minutes of inactivity, so reloads and route revisits reuse it.
- Labels everywhere (reader, library rows, Home, prepare panel): "Seen x of y sentences" (exposure),
  "Finished" only after the explicit button, "Understood x of y (your report)", vocabulary line unchanged
  ("shown / likely familiar (estimate) / met / new"). Never the word "Read" for exposure counts.
- "What are you trying to say?": a real disclosure button (`aria-expanded`, `aria-controls`, visible focus
  ring, chevron, Enter/Space) that reveals the field; collapsed by default; focus moves into the field on open.
- Settings: clear sections with in-page navigation — **You** (learner, team), **Reading** (highlight, text
  size, theme), **Backup and recovery**, **Content** (preview toggle, importer, texts with review status,
  published state, reasons and version history from `contentHistory`), **Speech** (availability from
  `ProxySpeechProvider` status first; direct key entry under Advanced), and a collapsed **Advanced** panel
  holding the evidence audit table, rebuild controls, provider/job diagnostics and the language-support
  table. Everything that exists today stays reachable.
- Speech wiring in bootstrap: register `ProxySpeechProvider` when `/api/speech/status` says configured; never
  bundle or persist a key for the proxy path.
- Tests: the Scripture-preparation regression (opening the passage and its preparation panel for 1 s yields
  zero `SentenceViewed`; long dwell on one sentence yields exactly one; hidden tab yields none), session reuse
  across remounts/reloads, labels, the disclosure's a11y contract, Settings structure, version history list.

## Coordinator
Integration: extend the Spanish loop to the twelve steps (import + validate, publish only after review, read
with word / phrase / grammar / English help, accurate non-duplicated evidence, Scripture overlap, preparation,
testimony, restrained suggestion, assisted vs independent, save / navigate / reload / switch / recover, speech
for the accepted version or the honest unavailable state, revise the imported text and check version history,
analysis and audio). Browser run of the same loop. Per-language rendering checks. Final documentation.
