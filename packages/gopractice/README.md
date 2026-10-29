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
GOPRACTICE_DICT=sq,de npx vite build …                   → which dictionaries to copy into dist/dict/ (default sq,es,de,hi,th; empty = none)
```

`config.json` next to the page: `{ "serviceUrl", "assetBaseUrl", "speechProxyBase"?, "extensionUrl"? }`. The service address must be https (http only on
localhost); it is the build's, and nothing in the app changes it (the sign-in and Developer fields that did are gone since 2026-10-28). `extensionUrl` (https, or chrome-extension) is where the hosted copy points to the
extension's GoPractice page; without it the page tells the learner to use the extension's **Practise** button.

When present, `speechProxyBase` must be an absolute `https://` endpoint (or `http://` on localhost for development). It is forwarded to GoListen;
the browser never receives an Azure key. A relative `/api/speech` is ignored because it resolves against the extension page origin in the packaged app.

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
| `#/signin` | the optional account (extension copy: "Not now", upload count) or the explanation of the hosted copy; email + password to the address in `config.json` (no field for it since 2026-10-28) |
| `#/review` | GoReview workspace: due summary, intake outcomes with reasons (each names the unit's knowledge level: candidates are drawn by level, see `docs/ecosystem/KNOWLEDGE-LEVELS.md`) and a "Why" expander per candidate (Test now / Later / Dismiss), session controls, the deck with per-item snooze / suspend / dismiss / resume, "Start a session" |
| `#/review/session` | one exercise at a time, feedback, challenge, analysis-error report, per-item tools, summary; at the end of a deck: Repeat this deck, or New deck from the weak words (half of the new deck is the weak words, weakest first, the rest what is due or new next; `deckModel.ts` weakEntries / planFollowUp) |
| `#/review/history/<item>` | the item's review history (the scheduler numbers are labelled bookkeeping) |
| `#/review/transfer` | transfer measures — "research measures, not conclusions" — with their basis and what they cannot show |
| `#/tell` | GoTell: the writing workspace (modes, prompts, writer with analysis and the six-level assistance ladder, versions, goals, privacy); see `docs/ecosystem/GOTELL-ARCHITECTURE.md` |
| `#/account` | the person icon beside the Settings cog (2026-10-28): name (set when the account is created in GoLearn; editable here, `POST /me/profile`) and email (with the resend only while unconfirmed), then Sign out, Download my data and Delete account as plain text, the last one red; the deletion is a guided step (what happens, how to restore within 14 days, the password) shown only when asked for; the devices signed in wait under a closed disclosure; on the device-only copy, the account offer and Clear local data. Nothing of the learner id or the session expiry |
| `#/developer` | the quiet "Developer information" line at the foot of Settings: the service address (read-only, among the diagnostics), the synchronisation counters with Sync now, the diagnostics (versions, FSRS algorithm string, ids, counts, cursors, clock skew) and the security events; a learner never needs it |
| `#/settings` | review preferences and the remote-speech switch, the links to the detail pages, the licences and the legal drafts. (Before 2026-10-28 it also held the account, the service address, sync and diagnostics; those moved to `#/account` and `#/developer`.) The account's older description, kept for the record: **Email address** (confirmed or not, with a resend), **Sessions** (device, last use, end one, "Sign out everywhere else"), **Download my data** (`GET /me/export` → `goreview-data-<date>.json`, through the share sheet on a phone), **Delete my account** (password-confirmed, 14-day grace, then the pending deletion with Cancel) and **Security events** (the last 20); a banner shows while a deletion is pending (`screens/accountSecurity.ts`, `accountClient.ts`) |
| `#/privacy`, `#/terms` | the Privacy Policy and the Terms of use, the drafts in `docs/legal` (marked "not in force"), rendered as text (`legal.ts`, `screens/legal.ts`); open without an account |

On `#/signin`: **Forgot password?** (asks for the email and always answers "If that address has an account, an email is on its way."), an unverified account's refusal (`403 email-unverified`) with "Send the confirmation email again", and the pending-deletion banner with Cancel. The links in confirmation and password-reset emails open the GoLearn setup app (`#/verify?token=…`, `#/reset?token=…`), not this one; the sign-in page says so and links to it when `links.setup` is known. Accounts are created in GoLearn setup.

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
| `gopractice:active` | `{learnerId, enrolmentId}` — the language the learner picked in the header switcher (remembered; wins over everything below) |
| `gopractice:prefs:<learner>:<language>` | `ReviewPreferences` |
| `gopractice:choices:<learner>` | "test later" notes (device-local) |
| `gopractice:candidates:<learner>:<enrolment>` | last candidate list from the service (offline display) |
| `u:<learnerId>:…` | one learner's data: `queue:*`, `rejected:*`, `quarantine:*`, `sync:*`, `log:*` (the local event log), `goreview:session:*` |

With several enabled languages and no pick yet, the active language is the one of the **most recent reading event** (the newest `SelectionLookedUp` over all the
learner's enrolments, from the local log and, on the device, the on-device Repository), then GoLearn's setup language, then the first enrolment; the header switcher lists every
enrolled language and says "Albanian: the language you read most recently" when the language was chosen that way (`Identity.chosenBy`).

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

## GoReview (the iPhone build)

`vite build -c packages/gopractice/vite.config.ts --mode review` writes `dist-review/`: this app as an installable PWA (manifest, icons, iOS tags,
service worker, "Update ready — reload"), starting at `#/review`, titled GoReview. It always needs an account (no extension on a phone) and a
Repository service reachable over HTTPS. While it is visible, online and signed in, `live.ts` holds `POST /sync/wait` and pulls when GoLearn pushes
(60 s pull as the fallback); `snapshot.ts` keeps the vocabulary list and the intake proposals on the device so the home, My vocab and Saved decks
render offline. Hosting, the service requirement, what "live" means on iOS and the limits: `docs/ecosystem/GOREVIEW-IPHONE.md`.

The home comes back at once: `screens/review.ts` keeps the last painted home per app instance under a key over every local store the deck
and the counts depend on (events, preferences, words added by hand, hold-out, saved decks, open sessions, the vocabulary snapshot), so a return from
Settings or the account page with nothing changed makes no request (2026-10-28: it took seconds on a phone, mostly the vocabulary pages and one unit
read per candidate word); a sync that brings events changes the key, and after ten minutes the Repository is asked again anyway. On a full load the
vocabulary count comes from the snapshot first and the live list replaces it, and the planner reads the units it may ask about in one batch
(`primeFacts`). While a screen opens, `loading.ts` shows the loading mark: the logo’s globe, its sphere turning (`packages/shared-brand/go-globe-*.png`).
