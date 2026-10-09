# Implementation roadmap

Status: proposed 2026-10-08. Builds on the charter, the salvage audit and the three design documents. Nothing beyond
the phase-1 scaffolding is built. Every phase ends with the tests named for it actually run, and no claim of reader
support, accuracy or rights clearance is made without the evidence named.

## 1. Dependency diagram and module tree

```
                     ┌───────────────────────────── applications ─────────────────────────────┐
                     │  golearn-app  ·  golearn-extension        │   goreview   ·   gotell    │
                     │        (GoLearn)                          │        (GoPractice shell)   │
                     └──────────────┬────────────────────────────┴────────────┬───────────────┘
                                    │  events in · queries out (contract only)│
                     ┌──────────────▼─────────────────────────────────────────▼───────────────┐
                     │ repository-contract   events · validation · queries · writer · ids       │
                     ├────────────────────────────────────────────────────────────────────────┤
                     │ repository-engine     2GoLearn core (fold, policy, deck, listen) + add. │
                     │ repository-store      dexie / memory · export · deletion                │
                     │ repository-sync       (contract in phase 3)                             │
                     └──────────────┬─────────────────────────────────────────────────────────┘
                                    │ LanguageAdapter · dictionary · pronunciation
                     ┌──────────────▼─────────────────────────────────────────────────────────┐
                     │ language-packs/<lang>   adapters (from src/adapters) · dict refs · tests │
                     └────────────────────────────────────────────────────────────────────────┘
```

Rules (tested by `test/ecosystem/boundaries.test.ts` from the scaffolding onward): applications import only
`repository-contract`; `goreview` and `gotell` never import each other; nothing under `packages/` imports the
retired `src/course`, `src/ladder`, `src/stage0`, `src/library`; the contract imports nothing. Data ownership:
packs own language facts; applications own the events they produce; the engine owns derived state; the learner owns
everything and can export or delete it.

## 2. The first vertical slice (Albanian) — the gate before any expansion

| step | proves | done when |
|---|---|---|
| 1 | an Albanian language pack loads | `packages/language-packs/sq` builds from `src/adapters/albanian/**` + `sq.ts` with the extracted type slice; the conformance suite (2GoLearn `adapter-kit`) passes; the pack manifest lists version, support, limitations, licences |
| 2 | a user selects a word in an authorised demonstration reader | the demonstration reader (the existing Reader over a learner-supplied `.txt`/unprotected `.epub`, or an owner-authored passage) emits a selection with its sentence context through the `demo-reader` ReaderAdapter |
| 3 | the parser returns a justified lemma and morphological interpretation | the context parser (pack + dictionary join + `pickAnalysis`) returns candidates with confidence, rule/source, and the card model marks fact / analysis / inference; measured on the existing Albanian tests plus a 30-sentence selection test written for this slice |
| 4 | GoListen offers valid pronunciation when a voice exists | 2GoLearn `listen` with the browser `speechSynthesis` voice as practice (never evidence), and the pack's pronunciation notes; "no voice" is said honestly |
| 5 | an encounter is stored | a `SelectionLookedUp` + `AnalysisShown` event passes `validateEvent`, is appended by the store, and the fold produces an encounter and a learner-item row |
| 6 | GoPractice can retrieve the resulting state | the GoPractice shell reads `itemKnowledge` and `priorities` through the contract and shows the word |
| 7 | GoReview can conduct an assessment | a recognition card from the deck (2GoLearn) in the learner's read sentence (consented snippet) or headword; a recall card; a listening card when a voice exists (practice-labelled) |
| 8 | the result updates the learner model | `CardReviewed` folds to the writing/reading dimensions under the deck's limits; rebuild from the log yields identical rows (2GoLearn's rebuild probe) |
| 9 | GoLearn sees the update | the next lookup of the same word in the demo reader shows the changed knowledge line |
| 10 | GoTell can independently consult the same state | the GoTell workspace lists the word among "words you can use" from the writing projection without importing GoReview |

Acceptance: steps 1–10 pass as automated tests on memory and Dexie stores, and are walked once in a browser with the
results recorded in `BASELINE-TEST-REPORT.md`'s successor.

## 3. Phases

| phase | content | owner / agents | exit evidence |
|---|---|---|---|
| **1 (this)** | audits, charter, designs, boundaries, baseline, contract scaffolding, boundary test | lead + four read-only audits | the eight documents; `test/ecosystem` green; baseline recorded |
| **2** | `repository-engine` on 2GoLearn core (decay, priorities, writing projections, tombstones added); `repository-store`; `language-packs/sq` with the type slice; `golearn-extension` core (ReaderAdapter interface, `demo-reader` and `local-file` adapters, context parser, card model); `golearn-app` minimal (local identity, enrolment, pack install, demo reader, essentials screens); GoPractice shell with `goreview` (deck) and `gotell` (ported from `src/gotell`) | one package per Sonnet agent with exclusive ownership; the lead verifies on real data | the vertical slice §2 green |
| **3** | the remaining packs (es, de, hi, th with the tokenizer change, nb/nn); `web-generic` reader adapter with its compatibility test on real pages; export and deletion; sync contract and a first sync client; GoReview listening cards with recorded speech; notices and licences in builds | agents per pack; lead for sync and privacy | per-pack conformance + holdout numbers; export/delete tests; a browser walk on real web pages |
| **4** | ebook-reader adapters one at a time, each with terms review and real-page tests; team-branded builds from the same code; identity provider | lead decisions first (terms) | nothing called "supported" before its real-page test |
| **retirement** | per retired module (`src/course`, `src/ladder`, `src/stage0`, `src/library`, bundles), a reviewed commit that moves or removes its tests and data | lead | the full suite green after each removal; the rights decisions of §2 of the boundaries doc executed |

## 4. Ownership contracts for phase 2

| package | owns | may import | must provide tests for |
|---|---|---|---|
| repository-contract | event vocabulary, validation, queries, writer, ids | nothing | validation of every event kind |
| repository-engine | fold, policy, deck, listen, projections, tombstones | contract, 2GoLearn core | rebuild equivalence; decay; priorities |
| repository-store | dexie/memory bindings, export, deletion | contract, engine | export round-trip; deletion by source and by learner |
| language-packs/sq | the adapter, dictionary refs, manifest, pack tests | pack types only | conformance; the existing 909 Albanian tests; a selection-without-context test |
| golearn-extension | reader adapters, context parser, card model, overlay UI | contract, packs | parser on selections; adapter rules (never stores page text); event emission |
| golearn-app | identity, enrolment, pack install, demo reader, essentials, settings | contract | onboarding flow; privacy settings |
| goreview | session composition, card UIs, assessments | contract | selection reasons; grading; event emission |
| gotell | writing workspace, practice ladder | contract | independence from goreview (boundary test); production events |

## 5. Execution standards applied

Inspect before changing; a real baseline (done); typed interfaces with runtime validation (`validateEvent`);
versioned contracts (`CONTRACT_VERSION`); reversible migrations (2GoLearn's store is additive by table; go-v0's
Dexie stays untouched until retirement); no new services (sync is a contract first); incremental commits by path;
nothing deleted silently; no test claimed that did not run; no reader called supported after a mock.
