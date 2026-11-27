# Korean (`ko`) real-browser run, 2026-11-25 (frozen code)

The real built extension in a real (headless) Brave, against a throw-away local Repository service, on three Korean pages and one English page written for this run
(not from the pack's tests, data or brief). Rig: `scripts/loadcheck/golearn/ko.mjs` (adapted from `ru.mjs`); pages: `scripts/loadcheck/golearn/ko-pages/`.

An earlier run was made on `09542fc8` plus uncommitted edits. It differed from this one in: older analyser code; the six unmarked news words not looked up; the second GoReview card not opened and no next-due time read;
no browser restart; and the rig then looked for a GoReview language dropdown that does not exist (a rig fault, fixed). Its results otherwise agreed with this run.

## What was built and run

- Code: `git rev-parse HEAD` = `ccaad140cfa0ab47fa99bc803e2d6f38a9f59f30` at build time, and `git status --short` showed only the rig's own files (`docs/korean/BROWSER-RUN.md`, `scripts/loadcheck/golearn/ko-pages/`, `scripts/loadcheck/golearn/ko.mjs`).
  The build stamp (`dist/build.json`) says **`ccaad140cfa0-dirty`**; "dirty" is only those untracked rig files. HEAD later moved to `5c7ab1fe` (docs and a golden only, no product code, per the coordinator); the build is from `ccaad140` and was not rebuilt.
- Build: `npm run ext:build`; `GOLEARN_APP_DICT=ko vite build -c packages/golearn-extension/app/vite.config.ts --mode options`; `GOREVIEW_DICT=ko vite build -c packages/goreview/app/vite.config.ts --mode extension` (into `packages/golearn-extension/dist`, deleted afterwards).
- Browser: Brave `Chrome/158.0.8127.42`, `--headless=new`, throw-away profile under `tmp-mem\ko-browser\tmp\profile`. Command: `LOADCHECK_BRAVE=<brave.exe> LOADCHECK_TMP=<scratch> node scripts/loadcheck/golearn/ko.mjs packages/golearn-extension/dist <outDir>`.
  The rig starts the service (`vite-node packages/repository-service/src/main.ts --port 8811 --data <fresh dir> --host 127.0.0.1`), serves the pages on 127.0.0.1:8795, and makes a made-up `@example.test` account with a random password (in memory only, never printed or stored except in the throw-away profile). Nothing beyond 127.0.0.1.
- One attempt of this rerun is discarded: the service took 409 s to start under machine load and account creation was refused as "unreachable" (steps 1, 7, 10 failed). The rig now retries account creation; the reported run is the next one (service start 22 s). Nothing else differed.

## Steps

| # | Step | Result | Observed |
|---|------|--------|----------|
| 1 | Account; add Korean on the setup page | PASS | "Korean is ready: 21 checks passed, dictionary from this extension's own files." Dictionary from `chrome-extension://<id>/app/dict/ko/` (3 requests). Record: version 1, manifest and sample shard verified, 19 validation cases, 0 failures. |
| 2 | Korean once in popup, options, GoReview | PASS | Popup `ko=Korean` once; setup page one row and one "mine"; GoReview has no dropdown by design (Languages page since 2026-11-18): header "Korean" once, its Languages page lists "Korean (한국어)" once. |
| 3 | Active, counts | PASS | Counts below. |
| 4 | Chunk and lexicon not on non-Korean pages; once on Korean | PASS with a note | English page, Active on, no lookup: no Korean request. English page, explicit lookup of "baker": `analysers/ko.js` once, no lexicon (see fault 5). Korean page: `ko.js` once, lexicon manifest + 16 shards each once (17 requests, no duplicates). |
| 5 | Inflected words: cards | PASS | 12 words, 12 full cards (below). |
| 6 | Mark a word; event | PASS | 먹었어요 Known: one `ItemMarked`, `languageId ko`, `itemIds ["lemma:ko:먹다:VERB"]`, payload `{mark:"known"}`; subject has only `itemIds, sentenceKey, sourceRef` (hash locator); no page text. |
| 7 | Sync once; reload shows it | PASS | Service holds `ItemMarked` once (event kinds: EnrolmentChanged 1, PackInstalled 1, SelectionLookedUp 19, AnalysisShown 19, AssistanceRequested 108, EncounterRecorded 246, ItemMarked 1). New tab: 먹었어요 x2, 먹었다 x2, 먹은 all `known` (before `seen`); page levels {new 84, seen 22} -> {new 84, seen 17, known 5}. |
| 7b | NEW: browser closed and started again on the same profile | PASS | Same extension id; device knowledge `lemma:ko:먹다:VERB` = known with its self-mark (2026-11-25T22:21:48Z); on the page the same five 먹- forms are `known`, levels {new 84, seen 17, known 5}. (A browser restart on the profile, not `chrome.runtime.reload()`, which headless Brave does not survive.) |
| 8 | GoReview | PASS | Korean is the language; a 10-item session. Card 1 front `갈`, back "Answer: to go"; Good. Card 2 front `눈` ("Flip card to reveal the answer"), back "Answer: eye; eyesight"; Good. Device events: `CardAdded` + `CardReviewed` for `lemma:ko:가다:VERB` and `lemma:ko:눈¹:NOUN` (the deck holds numbered entry 1 although the front shows `눈`), rating 3, `fsrs@v5.4.2 using FSRS-6.0`, `scheduledDueBefore` 22:22:12Z (14:22:12 PST). NEXT DUE IS A NUMBER: the end-of-session screen ("Session ended early", "2 of 2 right", "8 cards are left for next time") says "Next learning return · 11/25/2026, 2:32:27 PM", ten minutes after the answers (the first FSRS learning step). The event carries only `scheduledDueBefore` (no `scheduledDueAfter`); the after-time was read from that screen. |
| 9 | Reading Analysis on page 2 | PASS | Done in 515 ms, no error: total 111, known 0 (0 %), seen 7, new 104, unidentified 0, ambiguous 0; language ko. (The 7 "seen" are the six unmarked tokens plus 시장은, looked up by the rig on that page just before: a card lookup of an unmarked word makes it "seen". In the earlier run, with no such lookups, 6 were "unidentified".) |
| 10 | Offline | PASS | Service killed (health refused): the 드렸습니다 card is complete from local files; 은혜로 marked Familiar: 1 `ItemMarked` queued on the device; sync while down `ok:false`; service restarted, after sync it holds it once (`lemma:ko:은혜:NOUN`), still once after a second sync. |
| 11 | Timings | INFO | Below. |

## Counts (Active on, Korean only; tokens = space-separated Hangul words)

| Page | Scanned | New | Seen | Skipped / unconfirmed | No mark |
|------|---------|-----|------|-----------------------|---------|
| 1 narrative (25 sentences) | 106 | 84 | 22 | 0 / 0 | 0 |
| 2 news (15) | 111 | 104 | 1 | 6 / 6 | 6 |
| 3 devotion (11) | 63 | 62 | 1 | 0 / 0 | 0 |

The 22 "seen" on page 1 are words just looked up on it (twelve lookups and other forms of the same lemmas), not residue of the page. `confirmed` was 0 everywhere. The extension reports counts only, not per-token flags, so the unconfirmed words are those with no underline: page 2 only,
`서울시는`, `연구팀은` (twice), `김민수`, `주최`, `기상청은`. Counter words are underlined on the counter part only (`12일` marks `일`, `3월부터` marks `월부터`, `2.5퍼센트` marks `퍼센트`, `5년` marks `년`, `2시에` marks `시에`). Largest timer gap in the page while activating: 53 to 94 ms (none over 100 ms).

## Cards

Every card: WORD · KOREAN, sound in brackets, romanisation (tooltip and accessible name "Revised Romanization (2000)"; the scheme name is not visible on the card), meaning with source line "Wiktionary, via kaikki.org — CC BY-SA 4.0", VIEW SOURCES, ALL FORMS, limits text ("new and machine-drafted ... not reviewed by a native speaker"); "No Korean voice on this device".

1. 드렸습니다 (page 3, service stopped): `[드렫씀니다]` `deuryeotseumnida`; 드리다 VERB "to give (honorific); to offer"; form "past, formal polite (하십시오체), statement"; parts `드리` stem, `-었-` past, `-습니다` formal polite ending; main predicate 0.70 with 지난주에, 우리는, 함께, 예배를 attached; ALL FORMS present; one other reading listed (AUX "do for someone honoured").
2. 시장에는 (page 1): `[시장에는]` `sijangeneun`; 시장 NOUN "hunger / market / mayor" (no entry number); form "에 (at, in, on ...), topic particle"; parts `시장` stem, `에`, `는` topic; adverbial phrase of 많았어요 0.65; ALL FORMS present.
3. 눈이 twice: both `[누니]` `nuni`, 눈 NOUN, "subject particle". "겨울에는 눈이 많이 온다" gives "ENTRY 2 — snow" (0.88, "눈이 with 온다"); "어제는 눈이 아파서 병원에 갔다" gives "ENTRY 1 — eye; eyesight"; other entries listed at 0.43 to 0.45.
Others: 갔어요 `[가써요]` 가다 "to go" (94 forms); 샀어요 사다; 배가 (고파서) entry 1 "belly; stomach"; 배를 (큰 배를 보았다) entry 2 "ship"; 오셨다 오다; 먹은 먹다; 읽고 읽다; 올 오다. Screenshots are in scratch `tmp-mem\ko-browser\out\shots`.

## Timings (loaded machine)

- First Korean lookup in a fresh tab (injection, `ko.js`, 16 shards): reply 205 ms, card 216 ms. Warm: 74 ms / 84 ms.
- Active: first scan visible 344 to 435 ms after the tab opened, no later change; scan 136 to 195 ms; learner-model wait 19 to 63 ms.
- Fetched for Korean on page 1: `ko.js` 580,097 bytes; lexicon manifest 2,280 + 16 gzip shards = 830,187 bytes (whole lexicon 27 files, 1,320,907 bytes).
- Page JS heap 18.9 MB (lookups), 25 to 27 MB with Active. Browser process memory: NOT read.

## Built sizes (bytes)

`content.js` 602,499; `background.js` 1,342,910; `analysers/ko.js` 580,097; `action/popup.js` 18,994 (+ `popup.html` 11,450); options `app/app.js` 982,295 (+ `app/index.html` 715); GoReview extension page `review/assets/index-*.js` 6,570,997 (+ `review/index.html` 985).

## The nine faults of the first run, checked on the frozen code

1. Still holds, but the card says it could not tell. 배를 in "어머니는 사과와 배를 샀어요": headline meaning line "belly; stomach / ship / pear (the fruit) / double / cup (contest) / yours truly", no entry number; MEANINGS lists "Other possible readings: 배 · entry 1 ... entry 6" with each gloss; OTHER READINGS entry 1 belly 0.45, entry 2 ship 0.44, entry 3 pear 0.43; NOTES "6 other readings possible even with the sentence; the one shown has the highest confidence"; the DICTIONARY line shows only entry 1's gloss;
   and "Several dictionary entries share this spelling; the card could not tell which, so no one entry's origin or forms is shown as the word's." (also under ORIGIN). Confidence line "0.92 · lexicon". The 눈 and the other two 배 sentences are decided; 시장에는 lists three senses undecided in the same way. The statement that it could not tell is lower on the card, not in the headline.
2. Holds (6 of 111 unmarked), and every one gives a card. Each card says "No meaning in the word list; not in the dictionary either." and marks the lemma "LEMMA (GUESS)", "The lemma is inferred from the ending."
   - `서울시는`: a built compound with its particle: lemma guess 서울시 NOUN, form "topic particle", parts 서울 "capital" + 시 "town" + 는; relation topic of 일 0.50 (83 % of the sentence attached; it attached to the `일` of "12일").
   - `연구팀은` (x2): lemma guess 연구팀 NOUN, parts 연구 "research" + 팀 "team" + 은; sound `[연구티믄]`.
   - `기상청은`: lemma guess 기상청 NOUN, parts 기상 "weather" + 청 "request" (a wrong gloss for 청 here) + 은.
   - `김민수`: a name; lemma guess `김민수` class X, form "other", "The analyser gave no features for this word", no relation, no paradigm, no meaning. The card does not say it is a name.
   - `주최`: class X guess, form "other", no features, no relation, no paradigm, no meaning, though 주최 is an ordinary noun (and 측은 next to it is not attached either).
   So three are built compounds with a particle, one is a name, one (주최) is a plain noun the analyser knows nothing about; none gives a blank card. None is underlined in Active mode.
3. Holds. The first GoReview card shows `갈`, not 가다. The second shows `눈`; its back says "eye; eyesight" and the deck unit is `눈¹` (entry 1), so which homonym is meant is shown only by the answer, not the front.
4. Holds. The scheme name is only in the tooltip and accessible name of the romanisation line.
5. Holds as observed; it is the product's shared code path, not Korean's. A lookup resolves the selection's language in `controller.ts` (`resolveLanguageOf`). When the resolver's reasons say "no word list available" (`WORD_LIST_MISSING` in `contract/language.ts`; `language/resolve.ts` line 317 skips an installed language whose analyser is not loaded), the controller loads the analyser of EVERY installed language not yet loaded (`installed.filter(!hasAnalyser)`, then `loadAnalyser`) and asks the resolver again. `installed` is the learner's installed analysers plus the reading language, so with Korean the only installed pack, `ko.js` is fetched; the lexicon is not (it is fetched by `prepareLexicon` once the language is Korean). The code names no language: an installed Russian or Hebrew pack is requested the same way, so this is existing behaviour. I did not run Russian or Hebrew in this build (their dictionaries were not in it); that conclusion is from reading the code. A page load with Active on does not do this (verified: no request).
6. Holds, probably fine: numerals are not marked, only the counter part.
7. Holds: the setup page says "21 checks passed"; the record holds 19 validation cases.
8. Holds: 246 `EncounterRecorded` and 108 `AssistanceRequested` events (more lookups this run) for three small pages; unit ids only.
9. Resolved in part: the review screen itself shows no due time, but the end-of-session summary does ("Next learning return · 2:32:27 PM", "8 cards are left").

## What this run does NOT cover

No phone or touch. No real account, no production or hosted service. One machine, one browser (Brave 158, headless), one throw-away profile. `chrome.runtime.reload()` not done (headless Brave does not bring a command-line extension back); a browser restart on the same profile was done instead (7b).
Small pages by one non-native author (about 280 words, standard written Korean; no dialogue, forum text, mixed-language page, frames or single-page app); one device in sync. Meanings are Wiktionary via kaikki.org; the pack was served from the extension's own files. No audio (no Korean voice). Grammar notes' correctness not judged beyond what is quoted. Browser process memory not measured.
Russian and Hebrew behaviour on an English-page lookup was not run (code reading only). The schedule reading covers two cards (both answered Good).
