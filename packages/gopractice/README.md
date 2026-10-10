# GoPractice — the application shell

One static web application with two independent workspaces, **GoReview** (`packages/goreview`) and **GoTell**
(`packages/gotell`), sharing only the shell, the optional account, the design and the Repository client. The shell holds no review or
writing logic. No streaks, points or badges anywhere, and no teams: the enrolment label is the language and its variety.

**An account is optional where the app runs inside the GoLearn extension.** That copy (below) works on the device through the extension's
on-device Repository; the account only keeps progress across devices. The hosted copy has no such Repository, so it needs an account and says so
instead of showing a bare sign-in wall.

```
npx vite build -c packages/gopractice/vite.config.ts     → packages/gopractice/dist/   (base './', any host or sub-path; the hosted copy, needs an account)
npx vite build -c packages/gopractice/vite.config.ts --mode extension
                                                         → packages/golearn-extension/dist/practice/   (a page of the extension: chrome-extension://<id>/practice/index.html,
                                                           opened by the popup's "Practise" button; works with no account. Run it AFTER `npm run ext:build`, which empties dist/)
npx vite -c packages/gopractice/vite.config.ts           → dev server on :5198
GOPRACTICE_DICT=sq,de npx vite build …                   → which dictionaries to copy into dist/dict/ (default sq; empty = none)
```

`config.json` next to the page: `{ "serviceUrl", "assetBaseUrl", "extensionUrl"? }`. The service address must be https (http only on
localhost); the learner can override it at sign-in or in Settings. `extensionUrl` (https, or chrome-extension) is where the hosted copy points to the
extension's GoPractice page; without it the page tells the learner to use the extension's **Practise** button.

## Modes

| mode | when | what answers | the header says |
|---|---|---|---|
| `device` | the extension's copy, no account | the on-device Repository (through the worker; `localBinding.ts`) | "On this device only" + "Keep your progress across devices (optional)" |
| `account` | signed in (either copy) | the service over HTTP, with the sync client | "Online · … · last sync …" + "Synced to your account" |
| `none` | the hosted copy, signed out | nothing; `#/signin` explains the hosted copy and has the form | "Not signed in" |

Signing in from `device` mode signs the extension's worker in to the same account, opens the page's own session, uploads the device's history once and
says how many events; signing out pulls the account's history down, signs the worker out and returns to `device` mode without removing anything.
Settings → **Clear local data** is the explicit way to remove the device's data.

## Screens

| route | what |
|---|---|
| `#/signin` | the optional account (extension copy: "Not now", upload count) or the explanation of the hosted copy; email + password to the service; the service address is under a disclosure |
| `#/review` | GoReview workspace: due summary, intake outcomes with reasons and a "Why" expander per candidate (Test now / Later / Dismiss), session controls, the deck with per-item snooze / suspend / dismiss / resume, "Start a session" |
| `#/review/session` | one exercise at a time, feedback, challenge, analysis-error report, per-item tools, summary |
| `#/review/history/<item>` | the item's review history (the scheduler numbers are labelled bookkeeping) |
| `#/review/transfer` | transfer measures — "research measures, not conclusions" — with their basis and what they cannot show |
| `#/tell` | GoTell: the writing workspace (modes, prompts, writer with analysis and the six-level assistance ladder, versions, goals, privacy); see `docs/ecosystem/GOTELL-ARCHITECTURE.md` |
| `#/settings` | review preferences, remote-speech switch, account (on the device: "On this device only", the account offer, Clear local data; signed in: sign out / sign out and remove this device's data), service address, sync, diagnostics (versions, FSRS algorithm string, counts) |

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

`app.ts` shell/router · `context.ts` mode, session, active language, learner data (queue, log, sync client) · `localRepo.ts` /
`localBinding.ts` the on-device Repository (shape, transport over `appendEvents` / `listEvents`, the worker binding) · `state.ts` storage,
local `EventLog`, preferences · `engine.ts` the only import of GoReview's modules, adapted to the `ReviewEngine` port in
`ports.ts` · `packFacts.ts` pack facts for the exercises · `audio.ts` GoListen · `workspace.ts` the dashboard model and the
start of a session · `screens/*` · `packages/gotell/src` the GoTell workspace (no DOM).

Boundaries (`test/ecosystem/boundaries.test.ts`): GoPractice may import `goreview`, `gotell`, the contract, `golisten`,
`language-packs`, `repository-sync` and `repository-service/src/api`; `goreview` and `gotell` never import each other.
