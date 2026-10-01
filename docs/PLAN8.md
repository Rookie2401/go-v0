# PLAN8 — GoListen deferred to V2

Course owner, 2026-10-01: "Scrap GoListen for now. This will be a later V2 iteration."

**Decision (coordinator):** GoListen is switched off by one flag, not deleted. `FEATURES.listen` in
`src/core/config.ts` is `false`. The `src/golisten` package, the speech proxy (`server/`), their tests and
`npm run speech:check` stay in the repository, dormant and green, so V2 starts from working code. With the flag off:

- the app registers **no speech provider**, makes **no speech request** (no proxy check, no remembered Azure key
  read, no queued-audio resume) and the dev / preview server exposes no `/api/speech/*` endpoint (done in
  `vite.config.ts`);
- **no audio interface** is shown anywhere: no player, no "audio is not available" banner, no "Prepare audio", no
  Settings → Speech, no speech controls under Advanced, no fixture-audio switch, no recordings / shadowing in My
  Testimony, no listening recommendations, no listening group on the reading ladder;
- **no statement about listening** is made: no "Listening" readiness signal, no listening line in a word's history,
  no "listened" figure, no mention of audio in the preview banner;
- nothing is deleted from a learner's data: existing audio rows, recordings and listening events stay in the store
  and in backups untouched (they are simply not shown), and learner evidence from reading and writing is unchanged.

Everything else behaves exactly as before. The four reading/writing surfaces, the Thai course, the importer and the
publication safeguards are untouched. No new features.

## Contract (already made)

- `Features { listen: boolean }` and `FEATURES` in `src/core/config.ts` (exported from `src/core`).

To be added by the packages below, with these exact names:

- `AppServices.features: Features` (`src/ui/context.tsx`) — the UI reads `useApp().features.listen`, never the
  constant directly, so tests can render either state.
- `BootstrapOptions.features?: Partial<Features>` (`src/app/bootstrap.ts`) — default `FEATURES`.
- `GoLearnDeps.listening?: boolean` (`src/golearn/index.ts`) — default `true` (the engine's capability and its tests
  are unchanged); bootstrap passes `features.listen`.
- The UI test harness (`test/ui/harness.tsx`) defaults `features.listen` to `true` so the existing audio tests keep
  exercising the dormant code unchanged; new tests set it to `false`.

Rules: as PLAN5 / PLAN7. Touch only your files. Every existing test stays green; do not delete GoListen tests.
Add tests for the off state. Do not commit. Report under 150 words.

## E — engine side

**Yours:** `src/golearn/**`, `test/golearn/**`.

`createGoLearn({ …, listening })`, default `true`. When `false`: `recommend` never offers `listen-to-read-text` (or
any other audio reason); `stageReadiness` omits the `listening` signal entirely (and does not count it toward the
signals-with-data rule); `itemHistory` returns `listening: 'not part of this version'` and no listening line in
`lines`; `explainItem` / `auditEvidence` wording makes no mention of listening or audio unless listening evidence
actually exists for the item; `readingProgress.listenedSentences` stays in the record (0 unless evidence exists).
Listening events already in a log still fold exactly as before (history is preserved; a later V2 shows it again).
Tests for each, plus: flipping the option does not change any stored learner state (same fold, same rows).

## F1 — bootstrap, settings, home, ladder, testimony

**Yours:** `src/app/bootstrap.ts`, `src/ui/context.tsx`, `src/ui/App.tsx`, `src/ui/PreviewBanner.tsx`,
`src/ui/SandboxBanner.tsx`, `src/ui/prefs.ts`, `src/ui/coverage.tsx`, `src/ui/pages/**` except `TextPage.tsx`,
`src/ui/course/**`, `src/ui/testimony/**`, `test/ui/harness.tsx`, and the tests of those.

1. `AppServices.features`; `BootstrapOptions.features`. With `listen: false`, bootstrap: creates GoListen with no
   providers and never the fixture (the object must still exist — other code holds a reference — but
   `availability()` is simply unavailable), skips the speech-proxy status check, does not read a remembered Azure
   key, does not resume queued audio, passes `listening: false` to GoLearn and **no** `golisten` to GoTell (so a
   saved testimony version queues no audio job), and exposes a `speech` API whose methods are inert. Prove with a
   test that bootstrap with the default features performs **no** `fetch` to `/api/speech/` and writes no audio job.
2. Settings: no Speech section, no speech controls or fixture switch under Advanced, no "include recordings" option
   in Backup (recordings already in a backup file are still restored and kept — only the option is hidden; say what
   you did), no audio wording in the evidence explanations.
3. Preview banner: no mention of audio or placeholder sound.
4. Home / library / progress line: no "listened" figure, no audio recommendation text.
5. Reading ladder: works with role `audio` (the LISTENING group) are not shown; nothing else on the page changes.
6. My Testimony: no revision audio, no recorder, no shadowing controls.
7. With `listen: true` (the harness default) everything renders exactly as today: existing tests unchanged.
8. Tests for each point in the off state.

## F2 — reader

**Yours:** `src/ui/reader/**`, `src/ui/player/**`, `src/ui/pages/TextPage.tsx`, their tests.

With `useApp().features.listen === false`: the player, the audio status banner ("Audio is not available…"), "Prepare
audio for this text", the transcript / speed controls and any listening wording in the reading details are not
rendered and `golisten` is not called at all from the reader (no `audioStatus`, no `ensureAudio`, no
`availability`). The word sheet's history layer shows no listening line (the engine omits it; do not add one). With
`listen: true` everything renders exactly as today. Tests: off state renders none of the above and makes zero calls
on a spy `golisten`; on state unchanged.
