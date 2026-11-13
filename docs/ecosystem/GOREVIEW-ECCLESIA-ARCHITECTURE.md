# GoReview Ecclesia — Architecture

Branch `feat/goreview-ecclesia` from `master` `30106b4d`. Package `packages/goreview-ecclesia`; tests `test/goreview-ecclesia`. Companion documents: [GOREVIEW-ECCLESIA-INTEGRATION.md](GOREVIEW-ECCLESIA-INTEGRATION.md) (how the Ecclesia library plugs in) and [GOREVIEW-ECCLESIA-REPORT.md](GOREVIEW-ECCLESIA-REPORT.md) (what was built, tested, deferred).

Ecclesia is a Scripture reader for four classical languages — Biblical Hebrew, Biblical Aramaic, Koine Greek, Latin — that wants spaced review of what the learner reads. GoReview already is the review engine of the Go ecosystem (FSRS over a shared event log). Ecclesia is therefore not a second review system: it is a thin, typed layer that (1) names things stably across readers and devices, (2) turns what the reader observes into the ecosystem's events, (3) reads the learner's standing on two scales that are never confused, and (4) composes sessions and chooses passages. Everything that schedules, grades, plans or records is the shared GoReview code, imported.

The owner's instruction for this branch: **architecture first, no UI** — "create something that GPT can immediately and easily integrate into the Ecclesia system, let GPT design the interface". So the deliverable is the contract in `src/contract.ts`, the pure modules behind it, the fixtures and tests that prove the loop, and these documents.

## 1. Audit of the existing system (what Ecclesia stands on)

Read on `master` `30106b4d`; nothing in these packages was changed.

| Concern | Where it lives | What Ecclesia relies on |
| --- | --- | --- |
| Shared FSRS core | `packages/goreview/src/scheduler/fsrs.ts` (`createFsrsScheduler`, ts-fsrs 5.4.2, FSRS-6 defaults, fuzz off, `schedulerProfile` stamped on every review) | Imported as-is. One scheduler for every language and reader. |
| Deck as a fold | `scheduler/deck.ts` (`foldDeck`, `itemIdFor`, `buildCardAdded`) | The deck is never stored; it is re-folded from events, so a card made on one device is the same card everywhere. Card id = `card:<dimension>:<unitId>`. |
| Event contract | `packages/repository-contract/src` (`GoEvent` v3, `EVENT_KINDS`, payload validators, text guard, `ScriptureSourceRef`, `dedupeKey`) | Every Ecclesia event validates; the text guard (surfaces ≤ 4 words, no passages) is enforced by `validateEvent`. Idempotency rides on `dedupeKey` and the id. |
| Six knowledge levels | `repository-engine/src/levels.ts` (`levelOf`; new, seen, recognized, familiar, known, automatic), `evidence.ts` (weights per event kind), `projection.ts` (`foldEvents`) | The level is the Repository projection's; Ecclesia reads it, never computes its own. |
| Intake | `goreview/src/intake/intake.ts` (`decideIntake`, level-gated: New never automatic, Seen needs repeated encounter / help / relevance / explicit) | Ecclesia supplies candidates and lets this gate decide. |
| Planner | `goreview/src/planner/planner.ts` (`planSession`: learning → due → remediation → new; workload admission; nothing dropped silently) | Composition calls it with Ecclesia preferences. |
| Session runner | `goreview/src/session/runner.ts` (`createSessionRunner`: grade → rating → evidence → record → advance; deterministic event ids; recovery) | Ecclesia wraps it with its facts, identity and listening off. |
| Exercise builders / grading / evidence | `goreview/src/exercises/**`, `grading/**` | Imported; Ecclesia only supplies `UnitFacts`. |
| Language adapters | `src/adapters/he.ts` (varieties `he-bib`, heritage `arc-bib`), `el.ts` (one language `el`, Koine = `el-koi`), `la.ts` (no period varieties) | Decided how each language is filed (§3). The adapters themselves are not needed at runtime: the reader hands over analysed tokens. |
| Existing Scripture reader | `packages/biblia/src/repo.ts` (`READER_ID 'biblia'`, producer `golearn-app`, enrolment per language and period) and its bundled SBLGNT/MorphGNT, MAM/OSHB data | Model for the recorder; source of the verified John 1 fixture. |
| Verified fixes preserved | the 2026-10-26 self-mark rule (a mark holds until the learner marks again), the deck's CAS chain (`expectedPreviousReviewId`), the text guard, the listening-off marker | None touched; the vertical slice exercises the CAS chain through the real runner. |

Findings worth stating: (a) GoReview's `ExampleSentence.source` admits pack material only, so a verse cannot be put into exercise facts without a shared change — Ecclesia carries the place of the word instead (§5); (b) the planner's priority (`scoreReviewPriority`) favours words met in many recent contexts, so after a verse translation is revealed the function words of that verse outrank a looked-up noun — correct for the engine, surprising for a reader, documented in §7; (c) the `Producer` union has no reader-specific member, so Ecclesia files its events under `golearn-app` with `producer.surface = 'ecclesia:<kind>'` and `payload.readerId = 'ecclesia'`, exactly as Biblia does.

## 2. Boundaries

```
 Ecclesia reader (GPT designs)            @go/goreview-ecclesia (this)              shared engine (unchanged)
 ───────────────────────────             ─────────────────────────────            ──────────────────────────
 corpus, tokens, dictionary   ──────▶    identity · encounters · cards            repository-contract (events)
 UI, navigation, storage      ◀──────    profile · familiarity · frequency  ────▶ repository-engine (levels)
 encounter ids, clock, device            session (compose · runner)        ────▶ goreview (FSRS, deck, intake,
                                                                                   planner, builders, runner)
```

The reader owns text and presentation; the package owns naming, mapping and composition; the engine owns scheduling and evidence. Text crosses the first boundary only as single-word surfaces and lemmas (ids) and never crosses the second.

## 3. Language profiles and lexical identity

| Ecclesia | Repository `languageId` | `varietyId` | Why |
| --- | --- | --- | --- |
| `he` Biblical Hebrew | `he` | `he-bib` | The Hebrew adapter's Biblical period. |
| `arc` Biblical Aramaic | `arc` | `arc-bib` | Its own language: an Aramaic מֶלֶךְ is not the Hebrew lexeme and must not merge with it. The GoLearn Hebrew adapter reads the same chapters as the *heritage variety* `arc-bib` of `he`; a reader that wants one enrolment for both may `withOverrides(ARAMAIC, { repository: { languageId: 'he', … } })` — the ids then become `lemma:he:…` and pool with Hebrew. The default keeps them apart. |
| `grc` Koine Greek | `el` | `el-koi` | The Greek adapter is one language whose periods are varieties; Koine is `el-koi`. Ids are `lemma:el:…`, the same the Biblia reader and the Greek pack write, so a word met in Ecclesia and in Biblia is one unit. |
| `la` Latin | `la` | — | The Latin adapter declares no period varieties. |

Unit ids are the Repository's own builders (`unitIds` in `repository-contract/src/units.ts`), so every other tool reads them:

- `lemma:<lang>:<lemma>:<UD POS>` — the lexeme; `form:<lang>:<surface>` — the printed word; `morph:<lang>:<POS>:<k=v|k=v…>` — the construction a form realises (sorted feature key).
- Normalisation per script (`identity.ts`): Hebrew/Aramaic strip cantillation, meteg, rafe, Masoretic dots, sof pasuq, and keep the vowel points; Greek keeps accents and the elision mark, strips edge punctuation; Latin lower-cases, strips length marks and punctuation. Idempotent, NFC. `consonantal()` gives a points-free secondary key for Hebrew.
- Parts of speech are UD tags (`UD_POS`). The fixture decoders show the MorphGNT → UD and PROIEL → UD mapping; Ecclesia's corpus does the same once, at tokenisation.

Card identity: `card:<assessment dimension>:<unitId>` — GoReview's `itemIdFor`. A card is a unit along one skill; the passage is metadata (§5). Same word, any passage, any device: one card.

Passage identity: `PassageRef { book (USFM), chapter, verse, verseEnd? }`; `passageKey` → `JHN.1.1-18`; `verseKey` → `v:JHN.1.1` used as `subject.sentenceKey` (a text-free context identifier; the contract's "hash of the sentence" is satisfied by a coordinate that never carries text); `scriptureRef` → the contract's typed `ScriptureSourceRef` (`provider 'other'`, `translationId` = the profile's edition id, `confidence 1`, the profile's licence restrictions).

## 3a. Periods of Hebrew and Greek (`periods.ts`)

Hebrew and Greek are each **one language read in several periods**. The layout follows the GoLearn adapters exactly (the ids are their Repository variety ids; a test holds the catalogue to `src/adapters/hebrew/varieties.ts` and `src/adapters/greek/varieties.ts`), and adds what a library needs to know about each.

| Period id | Name (also called) | Era (a filing convention) | Normally written | What the GoLearn adapter has | Default trust | In a theological library |
| --- | --- | --- | --- | --- | --- | --- |
| `he-bib` | Biblical Hebrew (Classical) | c. 1000–200 BC | pointed, with cantillation | corpus: OSHB morphology over MAM | high-confidence | the Tanakh |
| `he-mish` | Mishnaic (Rabbinic) Hebrew | c. AD 1–500 | unpointed (editions often pointed) | dictionary labels only | provisional | Mishnah, Tosefta, early midrashim, the Hebrew of the Talmuds |
| `he-med` | Medieval Hebrew | c. 500–1800 | unpointed | dictionary labels only | provisional | Rashi and the commentators, Maimonides, piyyut, the translators |
| `he-mod` | Modern Hebrew | 1880– | unpointed | Wiktionary tables | provisional | modern scholarship and translation |
| `el-hom` | Homeric Greek (Epic) | c. 800–600 BC | polytonic | Wiktionary Epic tables | provisional | Homer, Hesiod |
| `el-att` | Attic Greek (Classical) | c. 500–300 BC | polytonic | Wiktionary Ancient Greek tables | provisional | Plato, Aristotle, the tragedians, the orators |
| `el-koi` | Koine Greek (Hellenistic, New Testament, "late", patristic) | c. 300 BC–AD 600 | polytonic | corpus: MorphGNT over SBLGNT | high-confidence | New Testament, Septuagint, Apostolic Fathers, Philo, Josephus, the Fathers to the sixth century |
| `el-med` | Medieval Greek (Byzantine) | c. 600–1500 | polytonic | labels only | provisional | John of Damascus, Byzantine liturgy and hymnography, Palamas |
| `el-mod` | Modern Greek | 1500– | monotonic | Wiktionary Modern Greek tables | provisional | modern scholarship and translation |
| `arc-bib` | Biblical Aramaic | c. 500–150 BC | pointed, with cantillation | corpus: OSHB Aramaic | high-confidence | Daniel, Ezra (its own language, never a period of Hebrew) |

Latin has no periods here: the Latin adapter declares none. Default periods: Biblical Hebrew, Koine Greek, Biblical Aramaic.

**Three rules** decide everything else:

1. **Identity is period-free.** `lemma:el:λόγος:NOUN` is one lexeme in Homer, Plato, John and a Byzantine homily; `lemma:he:…` likewise from Kings to Rashi. A card is one card whichever period the word was met in, and knowledge of the word **pools** across periods. Nothing pools between Hebrew and Aramaic: they are two languages.
2. **The period belongs to the text.** Each event carries the period of the passage that was read, as `varietyId` (and in `payload.language`). The reader declares it by recording with `profileForPeriod(periodId)`; Ecclesia declares, it does not detect (the adapters' `sentencePeriod` detection stays in GoLearn). Evidence is therefore readable per period — `periodEvidence` ("met in Koine 14 times, in Attic twice") and `knowledgeStandings(events, scope, { varietyId })` — without ever having been split in storage.
3. **Spelling is not identity.** Modern Greek is monotonic (άνθρωπος) where the older periods are polytonic (ἄνθρωπος); Modern, and most Rabbinic and Medieval, Hebrew is unpointed where the Bible is pointed. A lemma spelled two ways is two unit ids. `crossPeriodKey` (accents, breathings, points and case removed) **links** them without merging; the familiarity estimate credits the link only when the reader sets `crossPeriodCredit`, and then reports `creditedAcrossPeriods`. A reader that wants one unit across periods lemmatises every period to **one headword spelling** — the polytonic / pointed dictionary form the Biblical and Koine data already use.

| Question | Mechanism |
| --- | --- |
| Which period is this text in? | The reader says: `profileForPeriod('el-att')`, `resolvePeriod('he', 'Classical Hebrew')`. Every event of that reading carries `varietyId`. |
| Is this the word I met in another period? | Same lemma spelling and part of speech → the same unit, the same card. |
| Same word, another spelling? | `crossPeriodKey` + `crossPeriodIndex`; opt-in credit in familiarity; never a merged id. |
| Does it mean the same? | Not assumed. `EcclesiaLexeme.glossesByPeriod` (λόγος: Attic "account, reason"; Koine "word") and `periods` (where it is attested); the facts provider answers with the glosses of the period asked for — the learner's target period, which the planner passes as `varietyId`. |
| What has the learner shown in this period? | `periodEvidence(events, scope)`; `knowledgeStandings(…, { varietyId })`. |
| Which period is the learner studying? | The profile a session is composed with (`preferences.varietyId`). One enrolment per language and target period, as the Biblia reader does; texts of other periods read under it still carry their own `varietyId`. |
| How far is the analysis trusted? | `EcclesiaPeriod.defaultStatus` → the profile's `analysis.status`; a token may state its own. `provisional` supports recognition questions only (the shared `eligibilityOf` rule), with a caveat shown. A reader with a reviewed analysis of its own says so through `profileForPeriod(id, { analysis })`. |
| Where is a passage of Plato, the Mishnah, Rashi? | `WorkPassageRef { work, title?, chapter, verse, verseEnd? }`: the reader's stable id for the work and two whole numbers of its own citation scheme (1..100000). Keys `w:plato-republic.514.1`; the event's source reference is a plain one with that locator. Scripture keeps its typed reference. |

Conventions that are choices, not facts, and may be revisited: Greek of the fourth to sixth centuries is filed under Koine (as the adapter files the label "late Greek"); the ancient dialects (Ionic, Doric, Aeolic) and Katharevousa are adapter varieties, not periods — a text in them is filed under the period it belongs to; later Aramaic (the Targums, the Talmud) and the periods of Latin (Classical, Late, Medieval) are not modelled; Modern Hebrew "full" spelling adds letters a pointed lemma lacks, which no key can link — only lemmatising to one headword does.

Since this branch was cut, `master` gained a Biblical Aramaic language pack filed as `arc` / `arc-bib` — the same filing Ecclesia chose in §3; the Aramaic fixture uses that pack's feature keys (`Binyan`, `Conj`, `State`).

## 4. Reading encounters → events (`encounters.ts`)

The brief's event names, adapted to the contract's kinds (nothing new was added to `EVENT_KINDS`):

| Ecclesia encounter | Repository event | Subject | What the engine makes of it |
| --- | --- | --- | --- |
| `passage-viewed` (token_viewed, in bulk) | `EncounterRecorded` ×1 per verse | every form and lexeme of the verse, `sentenceKey v:…`, `sourceRef` | exposure (weight 0.2 × quality) — moves `new` → `seen` |
| `word-selected` (word_selected) | `SelectionLookedUp` | form, lexeme, construction; `surface` (one word) | exposure, counted as a lookup |
| `definition-revealed` | `AssistanceRequested { assistance: 'gloss', layer: 'definition', depth? }` | lexeme, form | exposure + assistance count; **never** recognition, never failure |
| `morphology-revealed` | `AssistanceRequested { assistance: 'morphology', layer: 'parsing' }` | form, construction, lexeme | as above |
| `translation-revealed` | `AssistanceRequested { assistance: 'translation', layer: 'verse' }` | every unit of the verse | as above (spread over the verse) |
| `context-explained` | `AssistanceRequested { assistance: 'grammar', layer: 'context' }` | every unit of the verse | as above |
| `passage-completed` | `UnderstoodMarked { scope: 'passage', helpUsed, tokenCount }` ×1 per verse | every unit of the verse | a weak self-report: `readingRecognition` positive without help → `recognized`; `assistedRecognition` positive with help → `recognized` |
| `word-marked` | `ItemMarked { mark }` | lexeme, form | a level mark decides the level (KNOWLEDGE-LEVELS.md); `saved`/`ignore` is a bookmark, no evidence |
| review_answered | — | — | **not an encounter**: the session runner records `CardReviewed` (and `CardAdded` for a new card) itself; a reader never builds a review event by hand, or the CAS chain and the scheduler profile would be wrong. |

Idempotency: `dedupeKey = ecclesia:<kind>:<encounterId>[:<verse>[:<chunk>]]`; `id = ev:ecclesia:<fnv(dedupeKey)><fnv(learner|device|dedupeKey)>`. The same encounter twice → the same events → the store keeps one (`duplicateOf`). A verse with more than `MAX_ITEM_IDS` (200) units is chunked with distinct keys. `encounterId` is the reader's (1–120 non-space characters); it must never be reused for different content.

Envelope: `v 3`, the profile's `languageId`/`varietyId`, `producer { app: 'golearn-app', version: 'goreview-ecclesia@1', deviceId, surface: 'ecclesia:<kind>' }`, `payload.language { basis: 'book-metadata', confidence: 1 }` (a declared language weighs in full), `evidence.quality 'weak'` for exposures and self-reports (`assisted` set when help was used). Every event is passed through `assertValidEvent` before it leaves the mapper, so the text guard is a hard wall.

## 5. Contextual cards (`cards.ts`, `facts.ts`)

A `ContextualCard` is `{ cardId, unitId, unitKind, dimension, family, context: { ref, verse, tokenIndex, sentenceKey, sourceRef } }`. Default: the lexeme, `written-recognition` ("what does λόγος mean?"); `target: 'form'` asks the printed form. `cardsForPassage` gives one card per distinct unit in reading order; `contextsOf(unitId, events)` lists every Scripture place the word was met (from the events' typed references), so a card's "contexts" are derived, never stored twice.

The exercise content comes from `factsProviderFor(profile, lexicon)`: the reader implements `EcclesiaLexicon` (`lexeme(id)`, `form(id)`, optional `distractorPool`); the adapter makes `UnitFacts` the shared builders accept (glosses as word-list glosses, attribution line, `form-of` relation, features). **Example sentences stay empty**: `ExampleSentence.source` is `pack-validation | pack-tutorial | original`, and a verse must not enter the facts. The reader shows the verse beside the card from `card.context` out of its own corpus. Extending the source union with `'scripture'` would be a shared change (deferred, see the report).

Learner-added cards: `cardAddedEvent` uses GoReview's `buildCardAdded` with `reason: 'met in JHN.1.1-18 verse 1'` and `addedBy 'learner'`; intake-born cards are written by the runner in the same batch as the first answer.

## 6. Two scales, never mixed (`profile.ts`)

- **Knowledge level** — `knowledgeStandings(events, scope)` folds the Repository projection (`projection@7`) and returns `UnitStanding { level, encounters, retention, readingRecognition, assistedRecognition, lookups, selfMark, firstSeenAt, lastSeenAt }` per unit. A word can be `familiar` with no card (understood repeatedly while reading).
- **FSRS schedule** — `cardSchedules(events, scheduler, scope)` folds GoReview's deck and returns `CardSchedule { cardId, status, due, isDue, retrievability, phase, reps, lapses, lastReview }` per card. A card can be due while its word is still `seen`.
- `unitOverview(unitId, standings, schedules)` returns both. The vertical slice shows a missed review that returns in minutes while the word's level stays `recognized`.

## 7. Session composition (`session.ts`)

`composeSession({ profile, identity, events, now, readingContext?, candidates?, intent?, preferences? })`:

1. scope the events to learner and language; fold the deck (FSRS) and the knowledge rows (levels);
2. `readingCandidates` — Ecclesia's reading-side rules, each explained: `looked-up` (+bonus if repeated), `help-requested`, `repeated-encounter` (≥ 2 distinct encounters), `marked-for-learning` (mark new/seen/recognized), `weak-but-seen` (reading score < 0.5), `in-reading-context`; lexemes only by default; units with an active recognition card or at `known`+ (unless marked for learning) are not proposed;
3. `decideIntake` for each — GoReview's level gate (a verse viewed once proposes nothing; words met in several verses may be admitted as later work);
4. `planSession` with `ecclesiaPreferences` — listening **off** (`listeningOff: true`: no reviewed voice exists for these languages, so nothing pretends), `newItemsSet`, `dailyNewLimit = 3 × maxNew`, the profile's `grammarShare`/`cardsPerDeck`/`sessionMinutes`;
5. `preferReadingContext` — within each planner queue (learning, due, remediation, new) the cards from the passage just read come first; nothing is added, removed or moved across queues, so a due card is never trapped behind context.

The result names what was `admitted`, what was `declined` (with intake's reasons) and which planned items came `fromReadingContext`. The planner's own `why`/`skipped` stay on the plan.

`createEcclesiaRunner` wires GoReview's `createSessionRunner` with the shared builder registry, the Ecclesia facts provider (and its distractor pool), the identity, the reader's `record` (must persist before it resolves), `committedEvents` (for crash recovery) and a `KeyValueArea` for in-progress sessions (memory by default). Review events (`CardReviewed`, `CardAdded`) are produced only there.

Observed engine behaviour (not changed): the planner's knowability priority favours words met in many recent contexts, so a verse translation (help on every word of the verse) lifts function words. Ecclesia's candidate score multiplies into the planner's benefit but does not override it. A reader that wants looked-up nouns first should record verse-level help sparingly or pass its own `candidates`.

## 8. Next Best Passage (`familiarity.ts`, `frequency.ts`) — PROVISIONAL

`passageFamiliarity({ profile, passage, standings, frequency?, policy? })` returns `PassageFamiliarity` with `heuristic: 'ecclesia-familiarity@provisional-1'`, `provisional: true`, token counts, `familiarity` (known-token share), `inTargetBand` for the profile band (80–90 %), `distanceFromBand`, `reliability` (share of tokens with any knowledge row), `unknownLexemes` (commonest first by corpus rank, else by occurrences) and `notes` that repeat the caveat. Policy per language profile: `knownFrom: 'familiar'`, `formsCount: true`, the band. `rankPassages` / `nextBestPassage` order deterministically (in band → nearest → better evidenced → fewer unknowns → canonical order) and give reasons.

Why provisional: a token-share heuristic with an uncalibrated band; the engine's `estimateSuitability` (recognition score) is a second, independent reading of the same question. Early in a learner's life nothing is `familiar`, so the default policy reports 0 % honestly; a reader may lower `knownFrom` to `recognized` (the vertical slice does) and should say so.

Frequency is a **contract**: `CorpusFrequencyProvider { corpusId, language, total, rankOf, countOf, perMillion }`, built by `frequencyTable` or `frequencyFromPassages` from the reader's corpus. The package ships no counts; the Greek fixture uses the Biblia index's New Testament lemma counts.

## 9. Persistence and migration

No new storage. Events go to the existing event log (device queue → Repository service, or the on-device Repository), all of them `v 3` with existing kinds and validated payloads; a Repository that predates this branch accepts them unchanged. In-progress sessions use GoReview's `goreview:session:<id>` keys in whatever `KeyValueArea` the reader provides. Re-folding is the migration story: a newer projection or scheduler version refolds the same events.

## 10. Invariants the tests hold

- Ids are stable across punctuation, cantillation, position and passage; distinct across languages and parts of speech.
- Every emitted event validates; no passage text appears in any event or any exercise fact.
- Mapping is deterministic and idempotent; the memory store keeps one copy of a retried encounter.
- Levels and schedules are read from the same events by two independent folds; a miss moves the schedule, not the level.
- The runner writes `CardAdded` + `CardReviewed` per answered card, with `schedulerProfile`; the deck re-folds identically from a reversed event order.
- The familiarity estimate is labelled provisional on every result; ranking is deterministic.
- The same contract runs for all four languages (`four-languages.test.ts`).
