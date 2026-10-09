# GoPractice — GoReview and GoTell

Status: proposed 2026-10-08 (architectural phase). Two independent workspaces in one application shell. Neither
requires the other; they share the shell, authentication, design system and the Repository integration only.

## 1. The shell

A single web application (installable PWA, same build toolchain as today) with: the Repository client (local store,
sync when connected), the learner's enrolments, the design system, and two top-level workspaces. The shell holds no
domain logic. GoReview and GoTell are separate packages with separate routes, state and tests; an import from one
into the other is a build error (an import-boundary test enforces it from the scaffolding onward).

```
 GoPractice shell ── repository client ── local store ── sync
      ├── GoReview  (packages/goreview)   reads: deck, priorities, item knowledge · writes: review/listening events
      └── GoTell    (packages/gotell)     reads: writing projections, item knowledge · writes: writing events
```

## 2. GoReview

**Engine (D6): 2GoLearn's deck**, unchanged in its principles: cards are born from reading (an item the learner met
in text), carry a sentence the learner actually read (or, where no snippet was retained, the headword with the
pack's example), are scheduled by a port (the legible interval ladder by default, FSRS available), and feed the
learner model under strict limits (a recall is a production; a recognition is half-weight receptive evidence capped
at `recalled`). The three owner decisions 2GoLearn flagged (membership floor, recognition cap, ladder-over-FSRS
default) remain the owner's; defaults stand until real reviews exist.

What GoReview adds on top of the deck:

- **Intelligent selection.** A daily session is composed from the Repository's priorities (weak and recently met,
  overdue, frequent in the language, in the learner's goals, failed in writing), bounded by the learner's time
  setting; the reasons are shown ("you looked this up three times this week").
- **Card kinds**: written recognition (meaning of a highlighted word in its sentence), written retrieval (typed cloze
  with grapheme hints), **auditory recognition** through GoListen (the sentence's audio with the item blanked, or a
  word pronounced and the learner picks the meaning), and **grammatical / phrase-level** cards (a construction or a
  particle verb in its sentence; the pack's constructions and phrases are the item universe).
- **Assessment** records what was actually asked and answered (`CardReviewed`, `AssessmentAnswered`,
  `ListeningAssessed`) with latency and hints; every grade is the learner's own or a deterministic check (typed
  answer matching with the pack's normalisation and the lenient accent rule); no machine judges meaning.
- **Feedback to the model** is the fold's business, not GoReview's: GoReview emits events and reads the result.

Snippets: a card shows a retained sentence only where the learner consented to keep snippets for that source
(`GO-REPOSITORY-DESIGN.md` D4); otherwise the card falls back to the headword plus the pack's licensed example, and
says so.

## 3. GoTell

**Engine (D7): adapt the existing writing engine** (`src/gotell/*`: the testimony service, the practice goals,
concepts, scheduler, assessment and taxonomy, and the per-language `checkProduction` in the adapters) into an
independent package that reads and writes through the Repository contract. What changes: GoTell no longer reads
"what the learner has met" from a course's texts but from the Repository's item knowledge and writing projections;
its suggestions (repairs, recombinations, expansions) come from the pack's phrases and the learner's own retained
material; its model wordings stay machine-draft until reviewed, as labelled today.

Workspace: free writing (testimony, letters, mission prompts) sentence by sentence with the pack's checker beside
it; a practice ladder of prompts (the existing P0–P7 scheme with its own spacing) that is independent of GoReview's
deck; corrections recorded as events the learner can accept, reject or rewrite; a history of what was written and
how it changed. GoTell's contextual help (a gloss, a construction note, a suggested phrase) is help and is recorded
as such.

Independence: GoTell's scheduler (`DUE_HOURS`) and GoReview's deck scheduler stay separate implementations with the
same principle; a shared pure scheduling library is acceptable, shared state is not.

## 4. Shared pieces and their limits

| shared | where | limit |
|---|---|---|
| design system | shell | components only |
| Repository client | shell | both workspaces read state and emit events through it; no direct store access |
| GoListen | Repository/pack layer | GoReview uses it for listening cards; GoTell may use it to play the learner's sentence back (practice only) |
| language pack | Repository | both read facts; neither modifies |

## 5. What GoPractice does not do

No reading library, no recommendations of texts, no course lessons. A writing exercise belongs to the learner's
goals, not to a lesson; a review belongs to the learner's history, not to a stage.

## 6. Open decisions

1. Deck membership floor, recognition cap, scheduler default (2GoLearn `DECK.md` §11).
2. Whether grammatical cards are generated from the pack's construction table automatically or curated per pack.
3. Whether GoTell keeps the testimony-specific goal catalogue (15 goals) as the default or as one profile among
   mission prompts.
