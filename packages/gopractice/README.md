# GoPractice — the application shell

One static web application with two independent workspaces, **GoReview** (`packages/goreview`) and **GoTell**
(`packages/gotell`), sharing only the shell, sign-in, the design and the Repository client. The shell holds no review or
writing logic. No streaks, points or badges anywhere.

```
npx vite build -c packages/gopractice/vite.config.ts     → packages/gopractice/dist/   (base './', any host or sub-path)
npx vite -c packages/gopractice/vite.config.ts           → dev server on :5198
GOPRACTICE_DICT=sq,de npx vite build …                   → which dictionaries to copy into dist/dict/ (default sq; empty = none)
```

`config.json` next to the page: `{ "serviceUrl", "assetBaseUrl" }`. The service address must be https (http only on
localhost); the learner can override it at sign-in or in Settings.

## Screens

| route | what |
|---|---|
| `#/signin` | email + password to the service; the service address is under a disclosure |
| `#/review` | GoReview workspace: due summary, intake outcomes with reasons and a "Why" expander per candidate (Test now / Later / Dismiss), session controls, the deck with per-item snooze / suspend / dismiss / resume, "Start a session" |
| `#/review/session` | one exercise at a time, feedback, challenge, analysis-error report, per-item tools, summary |
| `#/review/history/<item>` | the item's review history (the scheduler numbers are labelled bookkeeping) |
| `#/review/transfer` | transfer measures — "research measures, not conclusions" — with their basis and what they cannot show |
| `#/tell` | GoTell boundary: words you can use (read-only), your drafts, a placeholder editor saving a `PrivateDocument` with revisions. The writing engine is a later phase and the page says so |
| `#/settings` | review preferences, remote-speech switch, account (sign out / sign out and remove this device's data), service address, sync, diagnostics (versions, FSRS algorithm string, counts) |

## Keyboard (session)

Enter submits a typed answer, reveals a self-graded answer, and moves on from feedback · `1`–`4` Again/Hard/Good/Easy once
the answer is shown (self-graded), or the first four choices (choice questions) · Space plays, then replays, the audio ·
Esc skips the item (nothing is written).

## What is written, and when

An answer is graded for feedback with `driver.preview` (no write). It is committed with `driver.answer` — GoReview's
session runner grades, rates and records through the device queue *before* advancing — when the learner presses Next,
finishes, sets the item aside or leaves the screen. This is what lets "Challenge this answer" and "Report an analysis error"
act before anything is claimed (events are never edited). Skip and finish-early write nothing; the rest stays due. If the
queue refuses an event, the item stays on screen. For audio items the DOM carries neither the transcript nor the unit label
nor the item id before the response (`hiddenBeforeAnswer`; the item tools are concealed).

## Storage keys (application origin only)

| key | content |
|---|---|
| `gopractice:session` | `{token, learnerId, email, expiresAt}` — the only place the bearer token is written |
| `gopractice:service` | `{baseUrl}` |
| `gopractice:settings` | `{remoteSpeechConsent}` |
| `gopractice:deviceId` | random device id |
| `gopractice:profile` | cached enrolments (cleared at every account switch) |
| `gopractice:active` | `{learnerId, enrolmentId}` — the one active language |
| `gopractice:prefs:<learner>:<language>` | `ReviewPreferences` |
| `gopractice:choices:<learner>` | "test later" notes (device-local) |
| `gopractice:candidates:<learner>:<enrolment>` | last candidate list from the service (offline display) |
| `u:<learnerId>:…` | one learner's data: `queue:*`, `rejected:*`, `quarantine:*`, `sync:*`, `log:*` (the local event log), `goreview:session:*` |

Switching accounts clears the profile, the active language and the candidate caches, and never exposes another learner's
`u:<id>:` rows; the previous learner's unsent events stay under their prefix (Settings can remove them). Storage is
`localStorage`, so the local log is bounded by the browser's quota; an IndexedDB area is a drop-in replacement
(`KeyValueArea`).

## Structure

`app.ts` shell/router · `context.ts` session, active language, learner data (queue, log, sync client) · `state.ts` storage,
local `EventLog`, preferences · `engine.ts` the only import of GoReview's modules, adapted to the `ReviewEngine` port in
`ports.ts` · `packFacts.ts` pack facts for the exercises · `audio.ts` GoListen · `workspace.ts` the dashboard model and the
start of a session · `screens/*` · `packages/gotell/src` the GoTell workspace (no DOM).

Boundaries (`test/ecosystem/boundaries.test.ts`): GoPractice may import `goreview`, `gotell`, the contract, `golisten`,
`language-packs`, `repository-sync` and `repository-service/src/api`; `goreview` and `gotell` never import each other.
