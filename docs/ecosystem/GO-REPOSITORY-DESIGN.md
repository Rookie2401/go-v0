# The Go Repository — design

Status: proposed 2026-10-08 (architectural phase). Facts about the current code are from `LEGACY-SALVAGE-AUDIT.md`
and `BASELINE-TEST-REPORT.md`; decisions marked **D** are recommendations for the owner; open questions are listed
at the end. Nothing here is implemented beyond the scaffolding named in `IMPLEMENTATION-ROADMAP.md`.

## 1. What the Repository is

The one learner-data model behind GoLearn (the extension and its setup app) and GoPractice (GoReview and GoTell).
It is infrastructure, not an application: a local store on each device, a sync service between a learner's devices,
and the contracts both applications use to write evidence and read state. It holds three kinds of data that must
never be confused:

| layer | contents | mutability | owner |
|---|---|---|---|
| **Stable language facts** | lemmas, inflections, grammatical categories, relationships (families, variants, compounds), pronunciation data, dictionary entries, each with provenance and licence | versioned, replaced only by a new language-pack version | the language pack |
| **Learner events** | every meaningful observation: a lookup, a context analysis shown, a playback, a review result, a listening assessment, a correction, a writing activity, a mark, a settings change that affects interpretation | **immutable, append-only**; corrections are new events that reference the old | the application that observed it |
| **Derived learner state** | per-item knowledge estimates with confidence, priorities, review schedules, writing-correction history views, recommended actions | recomputed by a versioned pure fold from the events; never edited by hand; rebuilt when the policy version changes | the Repository's projection engine |

The projection engine is the part of the Repository that both applications trust; neither may write derived state
directly, and neither may overwrite the other's events.

## 2. Reuse decision

**D1. Build the Repository's local engine on `2GoLearn` (`C:\Users\CJWal\dev\2GoLearn`), not on a second lift of
`src/golearn`.** 2GoLearn is already the host-neutral extraction of this app's learner model: an append-only event
bus, time-derived sittings, a pure fold to per-item state in four modalities, content-addressed item ids, a
versioned evidence policy (`evidence@8-universal-1`), rebuild-equivalence proven by a probe, memory and Dexie stores,
a conformance kit for language adapters, headless React hooks, a spaced-repetition deck (ladder and FSRS
schedulers), and GoListen as a subsidiary module that produces listening practice and evidence through the same
store and bus. Its core package imports nothing. Its tests: 793 at the last commit in that repo. Its remaining
follow-ups are small and listed in its `docs/STATUS.md`.

What 2GoLearn does not have and the Repository must add: (a) identity and multi-device sync; (b) the stable
language-facts layer as a first-class, versioned, licensed store (2GoLearn reads adapters and glosses through
ports); (c) privacy, export and deletion controls as contracts; (d) a GoTell writing-activity event family and its
projections; (e) the enrolment model (team, language, variety, script, pack version, goals); (f) a cross-application
event contract so the extension, GoReview and GoTell write through one interface with provenance.

What is **not** carried from go-v0: course, stage, shelf, ladder, library and Scripture-catalogue concepts; the
recommendation of "next text" from a bundled library (there is no library; the learner chooses what to read); the
rights gate for bundled texts (replaced by the source-category decisions in `RIGHTS-AND-PRIVACY-BOUNDARIES.md`).

## 3. Identity, enrolment, devices

```
Learner        { learnerId (stable, device-independent once connected), displayName, createdAt }
Enrolment      { enrolmentId, learnerId, teamId, languageId, varietyId?, scriptId?, packId, packVersion,
                 goals[], startedAt, endedAt? }
Team           { teamId, organisationId?, name, defaultLanguageId?, regionalPreferences? }
Language       { languageId (BCP 47 primary: sq, es, de, hi, th, nb, nn), name }
Variety        { varietyId (es-HN, es-419, nb-riksmal…), languageId, kind, label }
LanguagePack   { packId, languageId, version, analyzerId, lexiconDigest, dictionaryRefs[], licences[] }
Device         { deviceId, learnerId, platform, lastSyncAt, extensionVersion?, packVersions{} }
```

**D2.** Enrolments, not learners, carry team and language. A learner changes or adds a team by adding an enrolment;
events reference `enrolmentId` and `languageId`, so history never corrupts. Team ≠ language is explicit (Team India
→ Hindi *when selected*). Norway's written standard is a required field of the enrolment (`nb` or `nn` as the
spine language, the other as a companion), never guessed.

**D3.** Identity is local-first: a learner exists on a device without an account (as today: a local `userId`), and
"connect" attaches the local learner to a Repository account for sync. The sync service is the only networked
component the Repository requires, and nothing in GoLearn or GoPractice stops working without it. Authentication
and the hosting of the sync service are open questions (§9); nothing in this phase builds them.

## 4. Stable language facts

Provided by language packs (see `GOLEARN-EXTENSION-STRATEGY.md` §4) and cached by the Repository:

- `Lexeme` rows (lemma, POS, inflection table reference, features, register, varieties, families, provenance:
  `hand-lexicon@<pack version>` / `dictionary:<source>@<version>` / `rule`), with the **licence** of each source.
- `Relationship` rows: inflection-of, component-of, family (concept family across standards), variant-of
  (orthographic/dialect), with confidence and provenance.
- `Pronunciation` rows: IPA / respelling per variant, source (rule, dictionary, recording), review status.
- `DictionaryEntry` references (not copies where the licence disallows copying into the Repository; kaikki/Wiktionary
  CC BY-SA entries may be cached with the required notice).

Facts are immutable per pack version; a new pack version supersedes, and derived state that depended on a changed
analysis is recomputed (2GoLearn already re-ingests on analyzer version change).

## 5. Learner events (the cross-application contract)

One event envelope, versioned, for every application:

```
Event {
  id            content-addressed (hash of learner, kind, subject, time, producer)
  v             envelope version
  learnerId, enrolmentId, languageId
  at            ISO time (device clock) · recordedAt (sync time)
  producer      { app: 'golearn-ext' | 'golearn-app' | 'gopractice-review' | 'gopractice-tell' | 'repository',
                  version, deviceId }
  kind          see families below
  subject       { itemIds[], sentenceKey?, sourceRef?, cardId?, draftId? }
  payload       kind-specific, validated at write time (runtime schema)
  dedupeKey     optional (idempotent writes across retries and devices)
  provenance    what produced the analysis shown (packId, analyzerId, confidence) when relevant
}
```

Event families (the full vocabulary is versioned in code; these are the groups):

| family | producer | examples | what it is evidence of |
|---|---|---|---|
| reading-context | extension | `SelectionLookedUp` (word/phrase selected; context sentence hash, never the text unless permitted and chosen), `AnalysisShown` (which layers: lemma, morphology, gloss, grammar, phrase), `PronunciationPlayed` | the learner met the item and wanted help with it; nothing about understanding |
| reading-report | extension | `UnderstoodMarked` (learner says they understood a sentence/passage), `ItemMarked` (known / still learning) | demonstrated comprehension (self-report, discounted by help) |
| listening | GoListen (either app) | `ListeningCompleted` (eligible only for reviewed human speech), `ListeningAssessed` (GoReview exercise result) | exposure; assessed recognition |
| review | GoReview | `CardReviewed` (grade, hinted, latency), `CardAdded/Removed`, `AssessmentAnswered` (grammar/phrase items) | retrieval or recognition of that item in that card's form |
| writing | GoTell | `DraftSaved`, `SentenceSubmitted`, `CorrectionAccepted/Rejected`, `ProductionRecorded` (items used, assistance) | production, with the assistance used |
| profile | GoLearn app | `EnrolmentChanged`, `PackInstalled`, `PrivacySettingChanged`, `ConsentGiven/Withdrawn` | interpretation context, not learning evidence |

**D4. Context text policy.** The extension records the *identity* of a context (a sentence hash and a source
reference such as "ebook: title/chapter/location") by default. Retaining the sentence text itself for later review is
a separately consented, per-source choice ("keep short snippets of this book for my practice cards"); it is bounded
(one sentence per encounter), never a page, and is deletable per source. Whole books are never stored. See
`RIGHTS-AND-PRIVACY-BOUNDARIES.md` §3.

**D5. No overwrite.** Applications append; a correction is a new event (`CorrectionOf: eventId`). Deletion is a
Repository operation (tombstones by learner, by source, or by time range) that the fold honours; the exported log
makes deletions visible.

## 6. Derived learner state (the projection engine)

2GoLearn's fold, as is, with the policy parameterised per enrolment: per-item `LearnerItemState` in reading,
listening, writing and speaking dimensions (level, confidence, evidence counters, last-met time, help history), the
familiarity estimate with expiry, the deck's card and schedule rows, readiness signals (advice with data status,
never gates), per-item explanations and histories. Additions for the new product:

- **Priority** per item (why GoReview should spend time on it): weak and recently met, overdue, high corpus
  frequency, in the learner's goals, failed in writing; a scored list with reasons, consumed by GoReview's selection.
- **Writing projections** for GoTell: items the learner has used productively, recurring correction categories,
  constructions attempted; GoTell reads these, never GoReview's rows.
- **Listening-recognition estimate** kept apart from reading (2GoLearn already does).

Every projection row carries `policyVersion`; `ensureCurrent` rebuilds from the log when it changes.

## 7. How applications cooperate without circular dependencies

```
 GoLearn extension ──events──▶ Repository (local store) ──projection──▶ state ◀──reads── GoLearn extension
 GoReview         ──events──▶       │                         │          ◀──reads── GoReview
 GoTell           ──events──▶       │                         │          ◀──reads── GoTell
                                    └── sync (log + packs + settings) ──▶ other devices
```

- Applications depend on the Repository contract package only (`@go/repository` in the proposed tree); never on
  each other's code. GoReview's effect on GoLearn's help is an *event* (`CardReviewed`) that the fold turns into
  state the extension reads at its next lookup; GoTell's effect is `ProductionRecorded`. There is no runtime import
  in either direction.
- Reads are queries over derived state (`itemKnowledge`, `priorities`, `deck`, `writingProfile`); writes are
  events. The projection runs locally on every device; sync carries the log, not the state.

## 8. Sync, export, deletion (contracts, not yet built)

- **Sync**: the append-only log merges by union; events are content-addressed, so replay is idempotent; derived state
  is rebuilt locally. Language packs sync by version. Settings carry a vector of last-writer-wins per key with the
  device recorded.
- **Export**: the learner's whole log plus enrolments and settings in a documented JSON schema (today's backup format
  is the starting point) with every retained snippet listed by source so the learner can see exactly what text is
  kept.
- **Deletion**: per learner (everything), per source (all snippets and context identities from one book), per time
  range; implemented as tombstone events that the fold and the export honour, with physical removal of snippet text.

## 9. Open questions for the owner

1. Where the sync service runs and who authenticates (no server exists today beyond the team-sharing text server;
   see `LEGACY-SALVAGE-AUDIT.md` §D). Options: a small hosted API with email-link auth; a file-based sync through a
   store the learner controls; or none in the first vertical slice (single device). **Recommendation: none in the
   slice; design the contract now.**
2. Whether dictionary entries (CC BY-SA) are cached in the Repository or fetched from the pack at lookup time.
3. The retained-snippet default (D4) for sources the learner owns outright (a public-domain text) versus a
   commercial ebook.

## 10. Proposed module tree (scaffolding target)

```
packages/
  repository-contract/   events (families, schemas, versions), queries, ports, ids     ← both apps import this only
  repository-engine/     2GoLearn core + the additions in §6 (priorities, writing projections, tombstones)
  repository-store/      store-dexie / store-memory bindings, export/import, deletion
  repository-sync/       (contract only in this phase)
```
