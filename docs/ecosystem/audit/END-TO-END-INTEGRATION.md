# End-to-end integration — the complete feedback loop (Prompt 6 §14)

Status: 2026-10-09. `test/certification/albanian-reference-e2e.test.ts` runs the 43 steps of §14 for one Albanian
learner over the ACTUAL applications and the ACTUAL Repository, and passes (16 tests; 4 s on an idle machine, 37 s while five other agents were running).

```
npx vitest run test/certification/albanian-reference-e2e.test.ts --reporter=verbose
```

## 1. What is real and what is faked

Real, wired exactly as the shipped code wires them: the Repository service (`handle`, SQLite in memory, scrypt
accounts, the real linguistics service and projection engine), GoLearn's setup application (`createApp`), the
background worker (`createBackground`) with the real Albanian pack and the dictionary shards from `public/dict/sq`,
the content-script controller and card on a page, GoPractice's shell (`createApp`) with GoReview's builders,
FSRS scheduler, intake, planner, session runner and evidence, the real pack facts, GoTell's engine behind the real
writing screens, GoListen's assessment source and playback. Faked: the network (an in-process `fetch` that calls the
service handler), the clock (starts at the wall clock and only moves forward, because the service refuses future
timestamps), timers, the audio element, and ONE declared TEST voice-registry entry (§3 below). Nothing between a
screen and the service is replaced; every event reaches the store through the service's own routes and the apps'
own sync paths.

## 2. The 43 steps, as observed

| steps | observed |
|---|---|
| 1 | account created from the setup app; the password is not in the extension's storage |
| 2 | Team Albania chosen; the enrolment is `teamId albania, languageId sq, packId pack:sq` |
| 3 | the Albanian pack installed and verified (`data-ok="true"`) |
| 4 | the orientation completed step by step, including the practice steps that require a real lookup in the demo paragraph (`#tutorial-state[data-state="done"]`) |
| 5 | a web page (the verified reader class) holding "Fëmijët lexojnë librin. …"; the worker reports `connected, languageId sq, packAvailable` |
| 6–7 | "librin" selected; the card shows `libër (NOUN)` and "definite masculine accusative singular" |
| 8 | the Case layer explains the accusative; "context: full sentence" is stated on the card |
| 9 | GoListen: "Speech is not available" — no Albanian voice exists, said plainly; nothing native-quality is claimed; no `PronunciationPlayed` event |
| 10 | a second encounter five minutes later and "Review this" on the card; after sync the store holds ≥ 2 `SelectionLookedUp` (enrolment id, lemma id, sentence hash) and one `ItemMarked`; every event validates; the sentence text appears nowhere |
| 11 | knowledge of `lemma:sq:libër:NOUN`: exposure > 0, every demonstrated dimension at weight 0 |
| 12 | GoPractice signs in through its own form (password not stored) |
| 13 | the candidate row for the lemma appears on the GoReview home |
| 14 | its "Why" names the rules the Repository saw (recent encounter, repeated lookups, analysis confidence) and the decision's reason; this run's decision was "test later" (score between the thresholds), and the learner pressed **Test now** |
| 15 | a written exercise is presented (`written-recognition`, "What does “libër” mean?") |
| 16 | "bread" → "Not quite" |
| 17 | only the written dimension moved (negative > 0, score < 0.5); listening, production, grammar unchanged |
| 18 | twenty minutes later the item is due; the correct answer is accepted |
| 19 | the dimension's positive evidence rose; the deck item has reps ≥ 2 and a due date in the future (FSRS v5.4.2, FSRS-6.0 parameters) |
| 20 | no validated Albanian audio exists; a TEST registry entry (label "TEST asset (not real Albanian audio)", licence "TEST FIXTURE") stands in for a reviewed recording; availability `available: true, eligibleForEvidence: true` |
| 21 | the listening item is presented with no `#stimulus`, no transcript, and no file name on screen |
| 22 | Play → the fixture URL is played; "book" → Correct |
| 23 | `ListeningAssessed` with `answerShownBefore: false`, naming the recorded voice |
| 24 | listening recognition rose; reading recognition is byte-identical to its value before the listening step; productive retrieval unchanged |
| 25–26 | the reading page reopened; the worker refreshed its learner-model cache on sync |
| 27 | "librin" again, and a related form of the same construction ("çajin") |
| 28 | the card now says "You have met this word N times; reading recognition: low/medium/high" instead of the first-time line |
| 29 | the full explanation (Layer 4) is still there: direct object / ending |
| 30 | GoTell opens from the same shell |
| 31 | the profile shows no invented CEFR level anywhere on the page |
| 32 | a mission prompt is suggested with a stated reason |
| 33 | the learner's own text "Unë shkoj te libër. Unë lexoj librin." is accepted unchanged (`lang="sq-…"` on the editor) |
| 34 | Analyse marks one grammatically-wrong issue and changes nothing; Level 1 names the word and "definiteness"; Level 2 explains definiteness without revealing "te libri" |
| 35 | the learner revises to "te libri", re-checks (clean), saves with Ctrl+S: version 1 with per-sentence authorship `[after-hint, independent]` in a private document of the account |
| 36 | `DraftSaved` + two `ProductionRecorded` (after-hint, assisted; independent, unassisted, `usedCorrectly: true`) reach the store with lemma ids and sentence hashes and no text; contextual production of "libër" rose |
| 37 | no GoTell event is a card, review or assessment event; the deck schedules folded with and without GoTell's events are identical; a second learner with no review history at all signs in on a fresh device, opens GoTell, writes and analyses |
| 38 | the history holds > 8 valid events from three producers (golearn-ext, gopractice-review, gopractice-tell) with the expected kinds, unique ids and seqs, and neither the sentences nor the session token |
| 39 | the history (units and aliases copied, events appended in scrambled order) replays into a fresh memory store and a fresh projection engine |
| 40 | the rebuilt rows equal the live rows (dimensions, basis counts, retention, uncertainty); the live engine's own rebuild equals its incremental state |
| 41 | re-sending the whole history through `/events` stores nothing (`stored: false` for all); a sync-push retry of the listening event stores nothing; the event count and the knowledge row are unchanged |
| 42 | exposure ≥ the lookups; listening has exactly one observation; contextual production counts exactly the unassisted clean sentences; the hinted clean sentence counts as assisted recognition; grammatical understanding has no observation for the lemma; listening and written scores differ |
| 43 | an anonymous caller gets 401 on events and documents; a leader of the same mission team sees only their own events, an empty knowledge row, refused candidates, a refused document read and delete, a refused forged `ListeningAssessed` (the store still holds exactly one); the owner can still read the draft |

## 3. The listening fixture

§14 asks for a clearly identified test fixture when validated production audio is unavailable. The registry entry
`test:sq-liber-recording` (provider `recorded`, `synthetic: false`, label "TEST asset (not real Albanian audio)",
licence "TEST FIXTURE — not a real recording") exists only in tests (here and in `test/goreview-app-e2e/review-reference.test.ts`), never in a shipped registry. It proves the software path (hidden answer,
playback, response, `ListeningAssessed`, a separate listening estimate). It is not evidence that Albanian listening
assessment works for learners: with the shipped registry the planner asks a due listening item in writing, flagged,
and adds no new listening items (`GOLISTEN-CAPABILITIES` in the final reports; `test/goreview-app-e2e` "missing audio").

## 4. Defects found by this test, and their state

| id | found at | what | state |
|---|---|---|---|
| E-01 (high) | step 13 | the Repository's linguistic store never learned the units GoLearn's reader showed: the worker parses locally and sends events with unit ids, nothing registered the analysis, so every candidate came back "needs validation: unit is not in the linguistic store" and GoReview could build nothing | **fixed**: `registerSurfaces` in `packages/repository-service/src/handler.ts` resolves the surface of each `SelectionLookedUp` (already in the event, ≤ 4 words, plus the sentence hash) through the linguistics service at ingestion (`/events` and `/sync/push`), exactly as `/lookup` does; a failure never affects ingestion |
| E-02 (high) | step 36 | GoTell's evidence default required an empty checker-coverage line, which the analyser never produces, so no sentence written through the app was ever `usedCorrectly: true` and GoTell contributed no contextual-production evidence (the Part A acceptance test passed a custom rule and did not see this) | **fixed**: `defaultCovers` in `packages/gotell/src/evidence/evidence.ts` now uses `coverageParts.checked` and a live analysis status; `test/gotell-documents/evidence.test.ts` fixture updated |
| E-03 (medium, open) | step 20 | the GoReview home's **Start a session** plans with the preferences as they were when the home was painted; a learner who changes "include listening" in the session controls and presses Start at once gets the old preferences until the screen is re-entered | open (UI; the test leaves and re-enters the screen) |
| E-04 (low, open) | step 20 | the home paints before the device's first pull completes, so a card added from another device is invisible until the next sync | open (the test syncs first) |
| E-05 (info) | step 14 | two encounters and a saved mark give a score between the "later" and "now" thresholds; the learner's explicit **Test now** is the designed path | by design |

## 5. Limits of this certification

Browser automation did not drive this run: the screens are the real ones but mounted in jsdom (no layout, no real
timers, no `chrome.*`); the installed-extension steps are in READER-COMPATIBILITY-RETEST.md §6. The listening path
rests on the fixture of §3. The Albanian analyses are machine-drafted and unreviewed (LINGUISTIC-ACCURACY.md); the
test asserts the system's behaviour, not that "libër" is correctly glossed by a native speaker.

## 6. Browser walk over the BUILT applications and the real HTTP service (2026-10-09, 17:33–17:45 UTC)

A second line of evidence, with the final bundles (`dist-web`, `gopractice/dist`) served on `localhost` and the real
service process (`packages/repository-service/src/main.ts`, SQLite file, fresh data directory) on `127.0.0.1:8790`:

| step | observed in the Chromium pane |
|---|---|
| setup app: account | "Account created and signed in as ana.walk@albania.test"; the password is sent only, never stored |
| setup app: team | the first enrolment attempt was refused: "The service says you are not a member of that team yet. A team leader adds members"; after the membership row was added the way a leader would (`putTeamMember`), "Enrolled: Albania → Albanian (Standard Albanian)" |
| setup app: pack | "Installed Albanian 9. Verified: all 16 checks passed" (dictionary description `kaikki-sq@2026-09-28`, a shard fetched, 14 validation cases incl. the unknown word) with the licences and attribution block under the pack |
| encounters | the harness page has no background worker, so two lookups of "librin" and the "Review this" mark were built with GoLearn's real event builder and sent through the real `/events` route; read-back: `stored: 3`, exposure 2, and the candidate `lemma:sq:libër:NOUN` **eligible (provisional)** — E-01 confirmed fixed on the real service (the unit was registered from the surface alone, hence provisional rather than high-confidence) |
| GoPractice: GoReview home | "New candidates 1", "Listening: not available: No Albanian recordings exist; nothing is claimed"; the candidate "libër · test now · Recognition (meaning of a word) · caveat: provisional analysis"; Why: "Test now as written-recognition: … saved by the learner (prioritised); score 0.40"; "What the Repository saw: recentEncounter 0.15, repeatedLookups 0.20 (2 lookups), goalMatch 0.05" |
| session | "What does “libër” mean?" → "bread" → "Not quite … Answer: book … (This reading comes from the pack’s word-form rules and has not been reviewed.)"; summary: 1 answered, 0 correct, "1 CardReviewed; 1 count as evidence" |
| read-back | `CardAdded` + `CardReviewed` from `gopractice-review` on the service; reading recognition: 1 observation, negative 0.245, score 0.40; every other dimension untouched |
| GoTell: prompts | the missionary prompt list with cultural notes and "machine-drafted, not yet reviewed"; "Suggest one for me" → "Thank someone sincerely." (First sentences) |
| writer | "Unë shkoj te libër. Unë lexoj librin." → Analyse: "Checked 2 sentence(s): 1 place(s) to look at. Your text was not changed."; the one-line coverage summary "Checked: definiteness, case, agreement, conjugation, particles. Not checked: 8 other areas — see details."; Level 1 "Possible problem at “libër”: definiteness."; Level 2 the definiteness note from the pack's grammar notes; revision "te libri" → "Nothing found in 2 sentence(s). That means the checker saw nothing, not that the text is correct." |
| save and read-back | one private document (`draft`, revision 1); `DraftSaved` + two `ProductionRecorded` with lemma ids, sentence hashes, `usedCorrectly: true` for both the after-hint sentence (assisted) and the independent one — E-02 confirmed fixed in the shipped build; assisted recognition 1 observation, contextual production 1 observation (positive 0.576); no sentence text anywhere in the event log |

Not walked today in the browser: the worker's own recording from a page (needs the unpacked extension; see READER-COMPATIBILITY-RETEST §6), the listening item (no Albanian audio exists; the fixture is test-only) and the return to the reader with the updated model (verified in the jsdom certification and in the Prompt 5 walk).
