# Albanian reference implementation — what the learner can do today

Status: 2026-10-09. Source of every row: `audit/END-TO-END-INTEGRATION.md` (the 43 steps of §14) and the test
`test/certification/albanian-reference-e2e.test.ts`. I re-ran it on 2026-10-09 at 10:11: 16 tests passed, duration 4.0 s
(the audit document says about 45 s; unresolved). Command: `npx vitest run test/certification/albanian-reference-e2e.test.ts --reporter=verbose`.

The test is real in this sense: the Repository service (SQLite in memory, scrypt accounts), the setup app, the background worker with the real
Albanian pack and dictionary shards, the content-script card, the GoPractice shell, GoReview, GoTell and GoListen run unmodified. Faked: the network
(in-process `fetch`), the clock, timers, the audio element, and one declared TEST voice entry. It runs in jsdom, not in a browser.

## 1. Per step of the §14 run

| §14 steps | what the learner can do (as observed by the test) | honest limit |
|---|---|---|
| 1–4 (`1–4. the learner is created, chooses Team Albania ...`) | create an account in the setup app; choose Team Albania, which creates an enrolment (`teamId albania`, `languageId sq`, `packId pack:sq`); install the pack (verified, `data-ok="true"`); finish the orientation including practice steps that use the real parser | the pack, dictionary glosses and tutorial are machine-drafted and unreviewed; the dictionary is Wiktionary via kaikki (CC BY-SA 4.0), not a reviewed lexicon |
| 5–9 (`5–9. an authorized reader ...`) | on a web page of the verified reader class, select "librin": card shows `libër (NOUN)` and "definite masculine accusative singular"; the Case layer explains the accusative; the card states "context: full sentence" | reader classes: ordinary web pages and the local EPUB prototype only (section 3); step 9 shows "Speech is not available": no Albanian voice exists here, no `PronunciationPlayed` is recorded |
| 10–11 (`10–11. the encounter is recorded ...`) | a second lookup and "Review this" are stored as `SelectionLookedUp` and `ItemMarked` with enrolment, lemma id and sentence hash; knowledge shows exposure only | no sentence text is stored anywhere (asserted); no mastery is granted |
| 12–19 (`12–14`, `15–17`, `18–19`) | GoPractice shows the candidate "libër" with a reason; "Test now"; a written exercise; a wrong answer lowers only the written dimension; twenty minutes later a correct answer raises it and the FSRS schedule advances | this run's intake said "test later" and the learner pressed Test now (E-05, by design); E-03 and E-04 are open UI defects (Start-a-session uses stale preferences; first pull after paint) |
| 20–24 (`20–24. the stimulus is presented without the written answer ...`) | a listening item with no transcript on screen, played, answered, recorded as `ListeningAssessed` with `answerShownBefore: false`; listening rose, reading byte-identical | the audio is the TEST registry entry `test:sq-liber-recording` ("TEST asset (not real Albanian audio)"). No Albanian listening assessment works for a learner today: with the shipped registry the planner asks listening items in writing and adds none |
| 25–29 (`25–29. the reader shows the updated learner state ...`) | back on the page, the card reads "You have met this word N times; reading recognition: low/medium/high" for "librin" and a related form ("çajin"); the Layer 4 explanation is still there | the learner-model line is an estimate labelled `inference`; the model's weights are hypotheses |
| 30–33 (`30–33. GoTell opens on the learner profile ...`) | GoTell opens from the same shell; no CEFR level is shown; a mission prompt is proposed with a reason; the learner's own text "Unë shkoj te libër. Unë lexoj librin." is accepted unchanged | 47 prompts (27 neutral, 20 Albanian variants), all machine-drafted and unreviewed |
| 34–36 (`34–36. graded assistance ...`) | Analyse flags one grammatically-wrong issue without changing the text; Level 1 names the word and "definiteness"; Level 2 explains without revealing "te libri"; the learner revises, saves version 1 with authorship `[after-hint, independent]`; `DraftSaved` plus two `ProductionRecorded` reach the store with hashes and no text | the checker located 13 of 20 seeded errors and raised 0 false alarms on 79 correct sentences in the model-judged audit (`audit/LINGUISTIC-ACCURACY.md`, small sample); it misses coordinated subjects and some agreement cases |
| 37 | no GoTell event is a card, review or assessment event; the deck folds identically with and without GoTell events; a second learner with no review history uses GoTell on a fresh device | see `GOTELL-INDEPENDENCE.md` |
| 38–41 (`38.`, `39–40.`, `41.`) | the history holds more than 8 valid events from three producers with unique ids and seqs; it replays into a fresh store and engine to identical rows; re-sending it stores nothing | one projection engine only; calibration against learners is untested |
| 42 | each dimension of "libër" rests on separate evidence (listening exactly one observation; production counts only unassisted clean sentences; grammar has none) | |
| 43 | anonymous callers get 401; a same-team leader sees nothing of the learner; a forged `ListeningAssessed` is refused | single process, in-process network; not a penetration test (`audit/SECURITY.md` has the adversarial suite) |

## 2. How accurate the Albanian is (not verified by a native speaker)

`audit/LINGUISTIC-ACCURACY.md` measured the analyser (adapter-sq@9) on 323 words in 70 fresh sentences. **Every judgement in it is a language model's;
no native or fluent speaker has checked any of it**, and `data/benchmarks/sq/gold/` is empty. After six declared scheme adjustments: lemma 313/323
(96.9 %, strict 90.4 %), POS 311/323 (96.3 %), whole reading 304/323 (94.1 %), exact feature match 187/246 (76.0 %, union-aware 93.9 %), 41 flagged-ambiguous
words 36/41 right in context. These are agreement with one model's reading of simple present/past sentences, with about ±2.6 points of sampling error on
the headline; they do not extrapolate to running prose.

## 3. Reader coverage (audit/READER-COMPATIBILITY-RETEST.md §5)

| reader | classification in the audit |
|---|---|
| ordinary web pages, generic adapter, local harness pages | Verified partial support (jsdom and a content script in a Chromium pane; not an installed extension) |
| ordinary web pages on a live third-party site | Unverified |
| controlled EPUB reader (local DRM-free file) | Verified partial support; prototype, not an app entry; DRM files are refused with a message |
| Kindle Cloud Reader | Blocked (page spread is a bitmap; the adapter declines the host); **no Kindle support is claimed** |
| Kindle apps, Kobo | Unsupported |

## 4. Limits the learner will meet

* Machine-drafted analyses everywhere (pack, grammar notes, tutorial, prompts, validation sentences); the cards say so.
* No Albanian audio of any kind: no recording, no installed device voice on the development machine, Azure voices unverified and never called live. Pronunciation notes are rule-based letter values.
* No native review of anything, and no rights clearance (`audit/RIGHTS-AND-ATTRIBUTION.md` lists items for a lawyer).
* The test is jsdom; the installed-extension steps (activeTab, context menu, Alt+Shift+G, alarms) are manual and were not run by the build sessions.
* The card gives no dependency roles ("role: not available from this analyser").
