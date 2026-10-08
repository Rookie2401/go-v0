# Stage 0 — from zero to a GoLearn learner

Status of record for Stage 0 ("Start from zero", `#/start`). Design written 2026-10-04 before implementation; §8 records what was built. Updated 2026-10-06: the content table and the open adapter items of §8 and the listening statements of §8–§9 now match the packs and adapters as they stand (`npm run stage0:validate`: 0 errors in all five); §1 is the audit of 2026-10-04 and stays as written.

Governing question: **could a person who knows nothing of the language enter the app, follow Stage 0 without outside help, and come out able to learn from new simple GoLearn material?**

## 1. What a new learner sees today (audit, 2026-10-04, HEAD 9ff7fae + working tree)

- Onboarding is two screens: "Select your team", then five teams. No level question and no orientation (`src/ui/Onboarding.tsx`).
- Home (working tree) is a plain directory: Reading, GoListen, Scripture, Testimony, Team Texts. Nothing in `src/ui` calls `recommend(` any more.
- **No course-authored text is published in any language.** All are machine-drafted and need a named native review (`src/ingest/publish.ts`), so outside preview mode every language's first stage is empty. What does exist:
  - Spanish: Camino 1–3, Honduras 1.
  - German: Weg 1–3, Gespräche, Lesungen.
  - Albanian: Udha 0–1, Misioni 1.
  - Hindi: Stage 0A–0C, 26 stories.
  - Thai: 12 bridge drafts, untracked work by another writer.
- Prior knowledge the first texts assume:
  - Spanish, German, Albanian: Latin-script decoding with the target sound values. No sound–spelling teaching exists, and the first texts are full present-tense sentences ("Juan tiene un libro…", "Ich bin Anna…", "Ky është Beni…").
  - Hindi: Stage 0A begins with real Devanagari sentences. Script help is decoding on tap plus a romanization rescue; there is no route from zero letters.
  - Thai: the pre-reader stage has no readable text. The earliest drafts are A1 connected prose with romanization "never".
- Script support that exists and is reused here:
  - Hindi akṣara decoding (inherent vowel, mātrās, conjuncts, anusvāra; `adapters/hindi/*`).
  - The Thai decoder (class, live/dead syllables, tone marks → tone; `adapters/thai/orthography.ts`).
  - `orthFeatures()`, which gives `orth:<lang>:<feature>` GoLearn items (`letter:प`, `matra:ा`, `conjunct:स्त`, `rule:mid+mai-tho=falling`).
- The alphabet trainer (`src/alphabet/**`, Thai and Hindi letter cards with Leitner spacing) stays as an optional drill. It emits nothing, and its owner wants it kept that way: a recognition drill is not decoding evidence.
- The learner model (GoLearn) keeps four dimensions per item (reading, listening, writing, speaking). Evidence comes only from:
  - `SentenceViewed` (exposure)
  - help events (assistance 1–5)
  - `ComprehensionReported` degree `all` (demonstration)
  - `DecodingRevealed` (help on the form and its orth items, flagged when romanized)
  - `AudioSegmentCompleted`, under strict eligibility
  - `ProductionRecorded` (writing or speaking)

  `rescueDependence` already measures seven kinds of rescue.
- Listening evidence requires a human recording reviewed by a named person, with a reviewed voice and approved rights. **Synthetic speech is practice only** (evidence@8, `golearn/eligibility.ts`). The build has no speech proxy (`LISTEN = false` in `vite.config.ts`). No native recordings exist, and the app has never used browser speech synthesis.

## 2. Principles carried into the design

1. **Meaning first, the real language at once.** The teaching object is a micro-scene: a few lines of real, contemporary language about the same small cast (`data/stage0/world.json`). Mostly known language, a little new, recycled on purpose. There are no alphabet walls, flashcard decks or grammar chapters.
2. **hear → see → understand → meet again → notice → short explanation → hear again → retrieve → new context.** Notes appear only after the learner has met the pattern in a set number of scenes (`afterScenes`), and stay available on request.
3. **Nothing collapses into one "known".** Reading recognition, listening recognition (per channel, native audio vs computer voice), decoding (per orth/sound feature), construction recognition, written production, spoken production and support dependence are each kept separately.
4. **Extend, don't duplicate.**
   - Stage 0 scenes are imported as ordinary Texts through the existing importer. Every reading, gloss, rescue, decoding and production act is emitted as the ordinary GoLearn event, so GoLearn's rules decide what counts.
   - Stage 0's own facts go in its own append-only events (`Stage0*`), folded by `src/stage0/state.ts`. These are comprehension checks with channel and rescue, decode checks, production attempts, speaking, steps and the exit gate. As with GoTell practice: no new table, no migration, carried by backups.
5. **Support fades from evidence, not from lesson numbers** (`src/stage0/fading.ts`). It is decided per feature, per learner, with the reasons shown. Romanization for Hindi and Thai has a hard retirement step: it cannot become permanent, and the validator refuses content that would make it so.
6. **Honest provenance.**
   - All Stage 0 content is AI-drafted and marked `unreviewed`.
   - Stage 0 shows it by its own rule, with a draft label on every screen. It is never "published" curriculum, and imported scenes stay unpublished in the rest of the app.
   - A review binds to a content signature; any edit to the wording invalidates it.
7. **Audio is planned on every line but never faked.**
   - Every line has an audio slot (`needed` | `recorded`).
   - A curated, reviewed recording is played and counts as evidence.
   - Without one, the browser's own computer voice is offered where the device has a voice for the language. It is labelled as practice and never sent to GoLearn as listening evidence.
   - Where neither exists, the listening channels say so and fall back to reading.

## 3. Data model (contract: `src/core/contracts/stage0.ts`)

**Authoring (data, not code)** lives in `data/stage0/<lang>/`. The shared world is `data/stage0/world.json`.

| file | shape | what it holds |
|---|---|---|
| `path.json` | `Stage0Path` | ordered steps (scene / sounds / review with a listening channel / exit) and the GoLearn texts that follow |
| `scenes/*.json` | `Stage0Scene` | lines (target text, English meaning, speaker, picture, audio slot), `introduces` (words, constructions, orth), `represents` (coverage ids), `intentional` early uses, checks, production tasks, notes with `afterScenes`, provenance |
| `sounds/*.json` | `Stage0SoundStep` | the features it teaches, through real words with meaning; a two-line explanation plus "more" on request; decode checks |
| `coverage.json` | `Stage0CoverageEntry[]` | the hidden construction/grammar/sound map with prerequisites (not shown as a syllabus) |
| `exit-*.json` | `Stage0ExitForm` | an unseen form: reading passage and checks, listening items, writing tasks, speaking prompts, decoding / tone / segmentation items |

**Language configuration (code)** is in `src/stage0/lang/<lang>.ts`:
- speaker forms (Spanish/Albanian adjectives, Hindi verbs, Thai polite particles depend on the speaker's gender)
- the script plan: features from the adapter (hi, th) or from spelling patterns (es, de, sq); a romanization fading policy with a retirement step; Thai segmentation
- coverage bands
- exit criteria

**Learner state** is folded from events (`src/stage0/state.ts`): step status (new / started / done / secure, with why; a scene counts as done or secure only when every comprehension check's latest answer is right — a step left with one wrong stays "started" and is marked "not secure yet"), feature states (attempts, correct, unaided streak, secure), and meters. The meters are decoding, reading independence, listening (native vs computer voice), production by kind, speaking, and support dependence.

## 4. Engine (`src/stage0/`)

| module | role |
|---|---|
| `content.ts` | loads and indexes the per-language packs |
| `features.ts` | which orth/sound features a word exercises (adapter for hi/th, patterns for es/de/sq) |
| `documents.ts` | scenes → CorpusDocuments (corpus `stage0-<lang>`, unpublished) |
| `coverage.ts` | expected known share of each step for a learner who followed the path; new words and constructions per step; personalised estimate from GoLearn |
| `validate.ts` | every authoring check (§6); `signatureOf` |
| `state.ts` | pure fold |
| `fading.ts` | what the player shows by default, and why |
| `match.ts` | production answers (normalisation, personal slots, speaker forms) |
| `exit.ts` | form choice, unseen check, scoring, verdict |
| `service.ts` | `Stage0Service` — the only thing the UI calls |

## 5. Learner flow (`src/ui/stage0/`)

- **Home.** A "Start from zero" entry opens `#/start`, the path:
  - step list with plain-language status
  - "Continue"
  - meters in language terms: "letters you can read on your own", "sentences understood before English", "understood by listening", "sentences you made", "help you needed"
  - the speaker-form question, asked once and only where the language needs it
- **Scene.** For each line: picture cue → audio (when the channel includes it) → text, with tap-a-word gloss and decoding. English is on request and recorded. Then the checks (recorded with whether English was opened first), then production (copy → choose → substitute → complete → recall → answer → describe → retell) and an optional spoken attempt (model replay, record, compare, self-check; never scored). A note appears when its moment has come.
- **Sounds step.** Real words with meaning; the letters or patterns highlighted with their sound. Then decode checks: how is it said, which word, which tone, where do the words begin.
- **Review step.** An earlier scene again, through the next listening channel (read+listen → listen-first → listen-only).
- **Exit.** An unseen form. Exposure is recorded the moment the form starts. The verdict is ready / ready-provisional (a section could not be given, e.g. no native audio yet) / not-yet, with which sections. Then links to the first ordinary GoLearn texts.

## 6. Validation (`npm run stage0:validate`, and `test/stage0/content.test.ts`)

Errors:
- duplicate ids
- broken line, step or coverage references
- missing provenance
- `reviewed` without a named reviewer or with a stale signature
- a check with a bad answer index
- a production task with no accepted answer
- an early scene over its band of new words
- a construction before its prerequisites without an `intentional` mark
- Hindi or Thai romanization with no retirement step, or past its step
- a line the adapter's checker objects to
- an exit form sharing a sentence with the path
- an exit form whose words are not covered by the path
- a malformed path

Warnings (reported, never hidden):
- audio `needed` everywhere (no native recordings exist yet)
- words the adapter cannot analyse (no gloss)

## 7. Exit gate

The exit gate uses unseen controlled material built from the path's own language: a short passage, listening items, a small written response, a spoken response, and for Hindi and Thai, decoding. Thai adds tone-from-spelling and segmentation. Criteria are per language (`src/stage0/lang/*`). **Gates (2026-10-07):** the ladder after Stage 0 opens only when an exit's READING section passed (any attempt, whatever the overall verdict), or when the learner opens it himself ("I know this already — open the path", the event `Stage0PathOverridden`, shown on the Stage 0 home). Finishing every scene does not open it. The speaking section passes only with at least `minRecorded` recordings of which at least `minSelfChecked` were judged "yes" or "partly" by the learner (both in every language's exit criteria).

**Without native recordings the listening section is unavailable**, and the best verdict is `ready-provisional`, which says so. Stage 0 is pre-A1 bootstrap. It never claims A1.

## 8. Implemented (2026-10-04)

**Framework (shared, language-configured).**
- Contract: `src/core/contracts/stage0.ts`.
- Events: `Stage0CheckAnswered`, `Stage0DecodeAnswered`, `Stage0SupportUsed`, `Stage0ProductionAttempted`, `Stage0SpeakingRecorded`, `Stage0StepCompleted`, `Stage0SettingsChanged`, `Stage0ExitStarted`, `Stage0ExitAnswered` and `Stage0ExitFinished` and `Stage0PathOverridden`, all in `src/core/events.ts`. They are additive and not folded by GoLearn.
- Engine: `src/stage0/*`.
- Language configurations: `src/stage0/lang/index.ts`.
- Service: wired in `src/app/bootstrap.ts` and bound per learner in `src/ui/context.tsx`.
- UI: `src/ui/stage0/*`. Routes are `#/start` and `#/start/:stepId`. The first Home entry is "Start from zero".

**How each brief requirement is met**

| Brief requirement | Where it lives |
|---|---|
| Sound / text / meaning on every line | Lines carry `text`, `en` and an `audio` slot; the validator refuses a planned-listening line without an audio slot |
| Three listening states, tracked apart | Channels `read+listen` → `listen-first` (transcript is a recorded support) → `listen-only`; review steps name their channel; `Stage0CheckAnswered.channel` and `audio`; meters keep native audio and computer voice separate |
| Reading ≠ listening ≠ production | GoLearn gets `ComprehensionReported` reading or listening (listening only with native audio) and `ProductionRecorded` writing; Stage 0's fold keeps its own per-channel counts |
| Support usage and rescue dependence | Every support is a `Stage0SupportUsed` plus its ordinary GoLearn event (English → `EnglishRescueRevealed`, gloss → `TokenHelpOpened`, romanization → `DecodingRevealed romanization:true`, note → `NoteOpened`) |
| Support fading by evidence | Romanization per feature, secure after 2 unaided decodes in a row or 4 unaided readings, with hard retirement (Hindi after step 15, Thai after step 21). Thai word gaps until segmentation is secure, retiring after step 24. Pictures fade with reading independence. English is always on request |
| Script acquisition bound to words | Sound steps teach through real words with meanings; decode checks: how is it said, which word, which tone, where do the words begin. Hindi and Thai answer keys are checked against the adapter's own decoder |
| Production from copying to retelling | Copy → choose → substitute → complete → recall → answer → describe → retell. Personal slots `{x}` and speaker forms (m/f) are supported. Accepted production is `ProductionRecorded` (copied / assisted / independent by what was on screen); his own name never counts as language evidence |
| Retrieval from learner state | The overview's `retrieval` is an earlier non-copy task he has met but not produced without a model, preferring the most-recycled constructions; shown as "From memory" on the Stage 0 page |
| Speaking | A retelling, not reading aloud: the picture and the English meaning are the cue, the target line stays hidden until after the recording, then the model is shown beside the learner's recording with "Compare: did you say the same thing?" (yes / partly / no, recorded on the attempt). Recordings stay on the device. Never machine-scored |
| Coverage tooling | `pathCoverage` (expected known share per step along the path, new words, undeclared words); personal share of the next scene from GoLearn; curriculum bands per language |
| Exit gate on unseen material | `src/stage0/exit.ts`: form choice by exposure; exposure recorded on start; reading / listening / writing / speaking / decoding; verdict `ready` / `ready-provisional` / `not-yet`. Exit answers never reach GoLearn |
| Authoring without code | `data/stage0/<lang>/*.json`; `npx vite-node scripts/stage0-validate.mts [-- <lang> --coverage]`; `test/stage0/content.test.ts` fails the gate on any error |
| Provenance | Every item records `ai-drafted` / `unreviewed`. Scenes import as unpublished Texts. A review binds to a content signature (`signatureOf`). The Stage 0 pages show the draft status on every screen |

**Tests.**
- `test/stage0/engine.test.ts`: real engines, the Spanish pack. Evidence separation, rescue, listening with a computer voice vs native audio, production kinds, speaker forms, accents, the secure/done distinction, fading, the pure fold, the exit gate (unseen, exposure, provisional verdict, protection from GoLearn) and privacy.
- `test/stage0/rules.test.ts`: synthetic packs. Every validator check, Hindi romanization fading and retirement, decoder-backed answer keys, matching.
- `test/stage0/content.test.ts`: every pack validates.
- `test/ui/stage0.test.tsx`: real bootstrap. Home entry, path page, a scene played through, the exit's promises.
- `test/stage0/gates.test.ts`: the secure requirement, the exit's reading gate, the override event, the self-checked speaking section. `test/ui/stage0Gates.test.tsx`: the retry loop, the speaking retelling flow with a fake MediaRecorder, the Stage 0 home's sections and override.

**Content (first vertical slices).** All of it is AI-drafted, unreviewed and validated with 0 errors (`npm run stage0:validate`). Spanish was written by this session; German, Albanian, Hindi and Thai by drafting agents under the same validator, then read through by this session. The JSON in `data/stage0/` is the source of truth; the generator scripts were scratch.

| | steps | scenes | lines | checks | production tasks | sound steps | decode items | coverage ids | exit forms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Spanish (Honduran, voseo) | 25 | 17 | 102 | 46 | 27 | 3 | 11 | 29 | 2 |
| German | 25 | 15 | 88 | 43 | 24 | 5 | 28 | 36 | 2 |
| Albanian (Standard) | 27 | 19 | 114 | 55 | 37 | 3 | 18 | 37 | 2 |
| Hindi (spoken) | 30 | 17 | 106 | 53 | 34 | 9 | 65 | 39 | 2 (7 decoding items each) |
| Thai (spoken) | 33 | 16 | 94 | 48 | 32 | 12 | 102 | 52 | 2 (10 decoding items each) |

- **Hindi script order:**
  1. प न म र with ा ी (पानी, पापा, नानी, मीरा)
  2. the dropped final a
  3. anusvāra and candrabindu
  4. े ै ो ौ
  5. ि ु ू
  6. aspirates (ख भ फ छ ठ थ झ)
  7. dental vs retroflex, by real pairs (तीन/टीन, दाल/डाल)
  8. nukta letters
  9. conjuncts, last

  Romanization retires after step 15; every scene from s10 on is read without it by default.
- **Thai script order:**
  1. mid-class consonants with long vowels
  2. live and dead syllables
  3. low class
  4. high class
  5. ่ and ้ on mid class
  6. the same marks on low and high class
  7. preposed vowels
  8. ือ ัว เ◌ีย and อ
  9. dead syllables with low class
  10. leading ห and อ
  11. clusters
  12. all the tone rules together

  Segmentation checks run from step 1 and tone checks from step 2, all answer keys checked against the decoder. Romanization retires after step 21 and word gaps after step 24.
- **Albanian.** The deepest staircase (19 scenes). It also passed the Albanian session's source check: every form against the word list and the offline UniParser analyzer, 0 disputed.

**Found in the adapters by the Stage 0 checks.**
- *Fixed (Hindi, this session's adapter):*
  - The checker flagged correct sentences: a subject said once for two verbs (*मैं यहाँ रहता हूँ और हिंदी सीखता हूँ*), an unknown name as subject (*सैम हिंदी सीखता है*), and a time word taken as subject (*कल सुबह…*).
  - The decoder dropped the a in *अस्पताल* (now aspatāl) and *रुपये* (now rupaye).
  - The trade-off is recorded in `src/adapters/hindi/production.ts`.
- *Fixed by the Albanian session (4eadf65):* *mbështetem*. *Fixed by the German session (15ca927):* a verbless "…, bitte" read as the verb *bitten* (the pack already says "Ich möchte bitte ein Brot").
- *Open on 2026-10-04, checked again 2026-10-06 (adapter-hi@5, adapter-th@4):*
  - Hindi: isolated *भाई*, *फल* and *सीता* now read first as noun, noun and name (the verb is the second reading); *क्लिनिक* is in the word list.
  - Thai: *เหรอ* is one word with a gloss; *ไม่รู้* is still one token with no reading and so no gloss.
  - Added to the other adapters: Spanish *clínica* (adapter-es@7, 27b84fc) and Albanian *klinikë*, *s'ka përse* and others (adapter-sq@5, 0bf3496), now used.
- *Content added since (2026-10-05):* Spanish gained two recycling scenes, es-s16 (Tomorrow at church) and es-s17 (Grandma's bread), so the head of the ladder secures its words; the German pack has five sound steps (the listen test, `docs/audits/LISTEN-TEST.md`, found what Stage 0 taught gave only 41–57 % of German words their right sounds).

**For native reviewers (beyond reading everything).**
- Spanish: Honduran usage throughout; *doña* use.
- German: *im Haus* glossed "at home"; *Und für mich? Auch nichts?*.
- Albanian: *Luan është vonë* / *Jam vonë* (vs *me vonesë*); *S'ka gjë* as "you're welcome"; *gjithashtu* placement.
- Hindi: present habitual for plans (*आज हम बाज़ार जाते हैं*, *मैं दूध पीता हूँ* "I'll have milk"); *सीखता हूँ* vs *सीख रहा हूँ*.
- Thai: pronoun density; *ห้าบาท* vs *อันละห้าบาท*.

**Decisions for the owner (made provisionally, easy to reverse).**
1. **Stage 0 shows its unreviewed drafts by its own rule, outside preview mode, with a draft label on every screen.** Without this, a blank learner sees nothing in any language, because no course text is published. The imported scenes stay unpublished everywhere else.
2. **The browser's own computer voice is offered as practice sound where the device has one.** It is offline and needs no account; it is labelled on every use and never counted as listening. The owner deferred GoListen on 2026-10-01 and `FEATURES.listen` has been `true` since 2026-10-03, but there is still no recording and the speech proxy is off; this uses no GoListen provider, proxy or network. It can be turned off on the Stage 0 page.
3. The Stage 0 exit therefore cannot give its listening part yet. The best verdict today is `ready-provisional`, and it says so.

## 9. Not done yet — and what each needs

- **Native review of every line, explanation and answer key (all five languages).** Nothing here is authoritative until a named reviewer signs a content signature. The publish path already exists: `provenance.review` plus `signatureOf`.
- **Lawful native audio.** Every one of the 504 scene lines (574 lines with the exit forms') has an audio slot marked `needed` (`stage0:validate`: "116 of 116" in Spanish, 102 of 102 in German, 120 of 120 in Hindi, 128 of 128 in Albanian, 108 of 108 in Thai). A recording reaches learners through GoListen's curated import (`importRecording` with origin `curated` and a named reviewer), and the line's slot then becomes `recorded` with its asset id. Until then:
  - listening practice is the device's computer voice, where one exists (none for Albanian on most devices);
  - the exit's listening part is not given.
- **Scale.** These are vertical slices that test the whole loop, about 15–19 scenes per language. A mature Stage 0 needs many more scenes, especially for Hindi, Thai and Albanian. The bands, the recurrence check and the coverage table are there to keep a larger pack honest.
- **Speech recognition or pronunciation scoring: none,** deliberately. Speaking is a retelling, a recording and the learner's own comparison with the model.
- **The follow-on texts are drafts too.** Camino 1, Weg 1, Udha 0, Stage 0A and the Thai bridge stories open only in preview mode, and the exit page says so. Since 2026-10-06 every course has a ladder (`docs/LADDER.md`) that takes Stage 0's path as its head (`after: "stage0"`); the Camino and Honduras drafts it absorbed are tagged `superseded-by-ladder`, and the ladder units are machine drafts in preview only as well.
- **The alphabet trainer (`#/alphabet`) is separate and optional.** By its owner's choice it records no evidence.
- **The existing pre-reader / Stage 0A–0C shelves of the course ladders are unchanged.** Stage 0 hands over to them through `path.next`.
