# GoTell — the productive-language engine

Status of record for GoTell practice ("Practise saying it", `/tell`). Written 2026-10-03 with the first implementation.

The question the engine answers: **what is the most useful thing this learner is almost able to say on his own right now?**

## 1. What existed (audit) and what was reused

| Existing piece | Where | How the new engine uses it |
|---|---|---|
| Event log, append-only, `dedupeKey` | `src/core/events.ts`, `src/core/bus.ts` | All practice state is new event types on the same bus. No new table, **no Dexie version bump**. |
| GoLearn receptive state (`listKnown`, encounters → sentences → texts) | `src/golearn`, `src/gotell/sources.ts` | GoLearn → GoTell signal: which ideas he has met words for; "a sentence you have read" hints; retelling tasks. Read-only. |
| `ProductionRecorded` → writing dimension (once per item × sentence, ever) | `src/golearn/fold.ts`, `policy.ts` | A successful practice attempt emits it, classified by the help shown: independent / self-repaired / assisted / copied. Same dedupe key format as My Testimony. |
| Concept tables (19 concepts × 5 languages), negators | `src/gotell/concepts.ts` | Meaning assessment. Added `conceptMatches` (how a token matched) and two stems (`vergib`, `beson`). |
| Language adapters' `checkProduction` | `src/adapters/*` | Language assessment, unchanged. GoTell never shows a checker fix unless asked. |
| `checkerCoverage` | `src/gotell/coverage.ts` | Attached to every language assessment ("no issue detected" ≠ correct). |
| My Testimony: drafts, immutable revisions, suggestions, provenance | `src/gotell/service.ts` | Untouched in behaviour. Saved revisions are read for spontaneous use (P7) and the testimony map. |
| `forUser(userId)` actor binding | `service.ts` | `gotell.practice` is built per actor; every call asserts the actor. |

Nothing existing was removed or migrated. The old API (`getOrCreateTestimony`, `submitDraft`, `acceptRevision`, `intent` …) is unchanged; `practice` is a new optional member of the `GoTell` contract.

## 2. Architecture

```
src/core/contracts/gotell-practice.ts   contract: SemanticGoal, ModelWording, AssistanceStep, TellAttemptRecord, ProductiveLevel,
                                        MeaningAssessment, LanguageAssessment, SelectionExplanation, GoTellPractice, InterpretationProvider
src/core/events.ts                      TellGoalDefined · TellTaskPresented · TellInterventionShown · TellAttemptSubmitted · TellTaskClosed
src/gotell/productive/
  goals.ts       MEANING: 15 catalog goals (11 testimony, 1 Scripture, 1 church, 1 ministry, 1 daily life) + learner goals;
                 LANGUAGE kept apart: model wordings per language, every one `review: 'unreviewed'`
  assess.ts      deterministic meaning assessment (concepts, polarity, key-term substitution, English words, confidence)
                 and language assessment (adapter checker) — judged separately
  taxonomy.ts    extensible error codes: meaning.* / lexical.* from GoTell, lang.<category> from adapters; registerErrorCode()
  ladder.ts      the ladder of help: smallest next step, tiers none / cue / scaffold / model
  state.ts       P0–P7 as a PURE fold of the log; lapses, peak, spacing (dueAt)
  scheduler.ts   inspectable scoring, task-family choice, first-hint rung
  interpret.ts   validation of an optional interpreter's (LLM's) output — advisory only
  practice.ts    the service: tasks, hints, attempts, events, GoLearn signals, testimony map
src/golearn/productive.ts               GoTell → GoLearn: productive gaps (read from TellAttemptSubmitted)
src/ui/tell/Practice.tsx                /tell        the learner's page
src/ui/tell/Inspector.tsx               /tell/inspect developer view (read-only)
src/ui/tell/TestimonyMap.tsx            "Your testimony map" on My Testimony
```

### Meaning vs language

A goal is a meaning in English plus the concepts it must carry (`components`) and its polarity (`negated`). It contains no target-language text (a test checks this). An attempt is judged twice:

- **meaning** — every component recognised (form / lemma / stem / Thai substring, with adjacent Thai tokens read together), polarity right, no English words; confidence from how each concept matched and the adapter's lemmatization support. `limits` says what it cannot see (synonyms outside the word lists, who-did-what, tense).
- **language** — the adapter's checker. `noIssuesDetected` is reported as exactly that, with the checker's coverage.

Outcome: `success` (both), `meaning-only`, `language-only`, `failed`. Only `success` promotes.

### The three kinds of language (always labelled in the UI)

- **MY LANGUAGE** — an attempt with no help shown in the task.
- **MY LANGUAGE WITH ASSISTANCE** — an attempt after any step.
- **MODEL LANGUAGE** — wording GoTell showed: the learner's own earlier independent success ("your own words, date"), else the catalog wording (labelled *not yet reviewed by a native speaker*), else a sentence he has read (quoted exactly; Scripture marked "Scripture, quoted exactly" and never altered).

### Assistance provenance

Every step is a `TellInterventionShown` event recorded **before** the next attempt, exactly as shown (`content`, `kind`, `tier`, `rung`, `revealedItemIds`, `source`, `sourceRef`, `review`). Every attempt carries the full ordered lineage of steps shown before it in its task, and the strongest tier among them.

Ladder for a missing idea (per concept): restatement → conceptual hint → English cue → first letter → dictionary form → a sentence he has read with it → sentence frame → the sentence with one gap → choose the word → full model. Ladder for a language problem (per checker finding): where to look again (category + location, never the fix) → that one correction → … → full model. *Deviation from the brief's list order, on purpose:* the frame comes before gap completion and recognition choice because it gives less wording away.

Every task starts with **free production**. The scheduler's `startRung` only decides where the *first* hint starts (a learner far from a meaning gets a frame rather than useless cues). Pre-showing help would have made it impossible for a learner who knows a meaning from outside the app ever to show independence (a test covers this).

### Attempts are immutable

`TellAttemptSubmitted.record` holds: the text exactly as typed, its hash, goal + version, task family, the assistance lineage, tier, `afterModel`, both assessments, the error list (taxonomy codes), `selfRepair`, outcome, evaluator (`deterministic@1`, confidence, optional validated advisory or the reason it was rejected), the level before/after and the rule that fired, and the GoLearn gap items. A repair is a new attempt; nothing is ever rewritten. The level stored on the record is what the fold computed then; the fold over the log stays the source of truth.

### Productive levels (explicit rules — `src/gotell/productive/state.ts`)

| Level | Rule |
|---|---|
| P0 | not yet said |
| P1 | said after a full model (in the task, **or** a model/heavy help for the same goal shown in the last 30 min in another task) — never independent |
| P2 | said with part of the wording given (frame, gap, choice, dictionary form, a read sentence, a correction) |
| P3 | said after a cue (concept hint, English cue, first letter, "look again here"); self-repair is recorded as such |
| P4 | said with no help |
| P5 | said with no help again, on a later day |
| P6 | already P5, said with no help on a later day in a kind of task not yet used (transfer) |
| P7 | the meaning appears in a saved testimony version, in a sentence with no suggestion involved and not copied from a model/frame/gap shown in practice, checker silent, meaning confidence ≥ 0.7 |

An assisted success never lowers a level. **Lapse:** a free attempt that fails at P4+ sets the current level to P3, counts a lapse, keeps the peak; the next independent success restores the level from the counters. Spacing: due after 4 h (P1), 8 h, 1 d, 2 d, 5 d, 12 d, 30 d (P7); 4 h after a failure. Receptive state is never touched.

### Scheduler (`tell-scheduler@1`)

Score = Σ weight × factor, every factor kept with value, weight, contribution and a reason: importance 0.2 · weakness 0.12 · input (GoLearn) 0.15 · due 0.2 · since-independent 0.05 · transfer 0.1 · frontier fit 0.15 · novelty 0.05 · overload −0.2 · recent failure −0.1 · recent model −0.35 · too soon −0.25. `predictedSuccess` is a heuristic (level, input, lapses), labelled as such — not calibrated. The task records the explanation it was chosen with (`TellTaskPresented.selection`); "Why this one?" shows it to the learner, `/tell/inspect` shows all of it.

Task families: `testimony-part`, `express`, `answer-question`, `retell` (only when he has read a sentence carrying the meaning), `transfer` (a meaning never tried whose ideas he already says on his own elsewhere). At P4+ the scheduler picks a family not yet used independently.

### GoLearn ↔ GoTell

- **GoLearn → GoTell:** receptive items per concept (reading + listening `encountered`) feed the `input` and `overload` factors, the first-hint rung, "a sentence you have read" and retelling.
- **GoTell → GoLearn:** (1) `ProductionRecorded` for a successful attempt, classified by the support it counts with; (2) productive gaps — met items for ideas he failed to produce, cleared by an independent success, forgotten after 21 days. `rankLibrary` adds them to the reinforcement factor at **half the weight of a weak item** (`RANKING.productiveWeight`) and says so in a reason line. Nothing becomes a drill; no receptive row changes.

### LLM boundary

No LLM ships. `InterpretationProvider` exists so one can be added: its output is validated (known concept ids, confidence 0..1, short note), stored as `evaluator.advisory` with whether it agrees, and **never read for any decision** — outcome, level, assistance record and text are decided deterministically. A malformed or failing provider changes nothing (`advisoryRejected` records why).

### Testimony as a semantic graph

`testimonyMap()` lists the testimony meanings in story order with their level and whether they appear in the current saved version (own words or with suggestions), and three deliveries: **30-second** (4 core meanings), **two-minute** (10), **full story** (11), each with what he can say alone, what is in his testimony and what is missing. It shows meanings, never wording: the testimony stays his.

## 3. Invariants and where they are tested

| Invariant | Test |
|---|---|
| Full-model repetition is never independent (also across tasks within 30 min) | `test/gotell/practice/invariants.test.ts` › repeating the full model |
| Assistance provenance preserved, cumulative, ordered | › assistance provenance |
| Original attempts immutable | › original attempts are immutable |
| Productive and receptive can disagree both ways | › productive and receptive state can disagree |
| Failed retrieval never erases receptive state | › a failed retrieval…; `test/integration/gotell-practice.test.ts` (real GoLearn, every learner row byte-identical) |
| Self-repair distinguishable from model correction | › self-repair is distinguishable |
| Explicit promotion rules P4 → P5 → P6 | › promotion rules are explicit |
| Delayed transfer can promote; transfer tasks offered | › promotion rules; › a delayed transfer task |
| Lapse keeps peak | › a lapse lowers the current level |
| Scripture quoted exactly, never written | › Scripture is quoted exactly |
| Scheduler explains its choice; schedule records nothing | › the scheduler explains its choice; `test/ui/tell.test.tsx` (inspector) |
| LLM output cannot change outcome/level; validated | › an interpreter (LLM) cannot change… |
| State is a pure function of the log (backup/restore) | › productive state is a pure function |
| Non-GoTell data untouched | › practice never writes My Testimony data…; all 128 earlier GoTell tests unchanged |
| Privacy | › privacy |
| Catalog self-consistency (each model carries its meaning, real checker silent, 5 languages) | `test/gotell/practice/engine.test.ts` › catalog |
| Ladder order, labels, Thai/Hindi graphemes, language track | engine.test.ts › the ladder of help |
| P7 only for own, uncopied sentences; testimony map | engine.test.ts › spontaneous use |
| GoTell → GoLearn gaps, window, modest rank effect | engine.test.ts › GoTell → GoLearn; integration test |

Regression: the full suite in a clean worktree (HEAD + only these changes) — 305 of 307 files pass; the 2 failing files (`test/ui/teamSharing.test.tsx`, `test/ingest/cli.test.ts`) fail identically at HEAD without these changes.

## 4. Implemented vs groundwork vs not built

**Implemented and tested (Phase 1 + most of Phase 2):** semantic goals with meaning/language separation; learner-authored goals (refused when unassessable); immutable attempt history; receptive/productive separation; structured assistance provenance; P0–P7 with explicit rules, lapses, peaks; minimum-effective-intervention repair loop with self-repair; graduated scaffolding (first-hint rung that shrinks as the level rises); deterministic meaning and language assessment with confidence; extensible error taxonomy; scheduler with inspectable factors and spacing; task families incl. retell and transfer; GoLearn → GoTell input signal; GoTell → GoLearn production evidence and productive gaps in ranking; testimony semantic graph with three delivery lengths; spontaneous-use detection (P7) from saved testimony; developer inspector; learner UI; validated advisory interpreter interface.

**Groundwork only (interfaces exist, nothing pretends to work):**
- `InterpretationProvider` — no provider is configured or shipped.
- `registerErrorCode` — no adapter registers finer codes yet; adapters' categories are mapped generically.
- `TaskFamily` has no scenario family; `GoalDomain` lists `ministry` / `daily-life` with one goal each.

**Not built (later phases):** scenario engine; conversational practice; speaking/voice evidence (GoListen is not a prerequisite; when it comes, its evidence must stay a separate stream — `modality: 'speaking'`); dynamic retelling of whole passages; expression families with provenance beyond "your own words / catalog / read sentence"; testimony delivery practice as a timed whole; calibrated success prediction.

## 5. Known limits (honest)

- **Every catalog model wording is unreviewed** (TODO(review)) and says so wherever it is shown. 73 wordings across es/de/hi/sq/th (15 each; Albanian 13); Hindi first-person wordings use masculine forms, with a note saying so. The Albanian `now-trust` model is omitted because the Albanian checker flags *mbështetem* (a false positive, reported to that adapter's owner); Albanian `church-family` is omitted because *kisha* is also "I had".
- Meaning is recognised through GoTell's concept word lists (starter sets, not native-reviewed). A correct paraphrase outside them is reported as a missing idea; word salad that contains the right words passes the meaning check (the checker may not catch it). Both are stated in `limits` and on the page.
- Productive gaps are one-way hints to ranking; they are not shown on Home.
- Each practice call refolds the log and re-reads receptive state; fine at current sizes, worth caching if logs grow large.

## 6. How to look at it

- Learner: My Testimony → "Practise saying parts of your testimony", or `#/tell`.
- Developer: `#/tell/inspect` (scheduler factors, states with rules, raw attempt records, taxonomy). In a real browser use `?sandbox=<name>` to keep test data out of a real library.
