# The ladder (contract v1, 2026-10-05)

Follows the B2 audit (`docs/audits/B2-AUDIT.md`) and the owner's response to it. The audit found that Spanish and German
have an ocean of text and no beach: a newcomer is handed native 19th-century prose at 3.5 % known words. This document
defines the beach — and keeps it separate from the ocean.

## Library and ladder

- The **library** answers *what can this learner eventually read?* Everything readable: native books, Scripture, a
  learner's own copies, team texts. Large, unordered, chosen by the learner and by GoLearn.
- The **ladder** answers *what should this learner read next?* One ordered path per language, from Stage 0 to the
  point where the library becomes readable: controlled texts written for the ladder, adapted texts, and — towards the
  top — authentic library texts placed where the learner is ready for them.

A text can be excellent library material and still not be the next ladder text. The gate below says which.

## Two kinds of "known" — never confused

- **Curriculum coverage** (this document): deterministic. For text *N* on the ladder, the share of its running words
  whose lemma appeared at least three times in texts 1…N−1. It audits the *designed path* for a learner who follows it
  faithfully. Three encounters is an audit threshold, not mastery.
- **Personal mastery** (GoLearn): what this learner actually shows — reading, listening, rescues, recall, production.
  Recommendations are driven by mastery; the ladder is the default route and the fallback, not a cage.

## Stages

| stage id | level | what it is for | indicative size |
|---|---|---|---|
| `stage0` | pre-A1 | script and sounds where needed, the first few hundred words and constructions, tiny scenes: enough to make GoLearn usable. Owned by Stage 0 (`docs/STAGE0.md`, `data/stage0/<lang>/`) | as it is |
| `a1-1`, `a1-2` | A1 | daily life, narrative, dialogue, simple description, questions, simple testimony language | 15–30 k words together |
| `a2-1`, `a2-2` | A2 | longer stories, conversations, biography, explanations, more natural syntax, much less rescue | 30–60 k words together |
| `b1-bridge` | B1 | authentic or lightly adapted texts increasingly dominant; ends where the library is comfortably readable | 30–60 k words |

Each stage mixes domains — conversation, narrative, explanation, practical communication, biography, instructions,
correspondence, contemporary nonfiction — and **Scripture is one domain among them, not the ladder**. The audit's
lesson: reading Bible Spanish comfortably is not broad Spanish.

## Data

`data/ladder/<lang>/ladder.json`:

```json
{ "lang": "es", "version": 1, "after": "stage0",
  "units": [
    { "id": "es-a1-1-01", "stage": "a1-1", "kind": "controlled", "document": "units/es-a1-1-01.json",
      "domain": "conversation", "title": "…" },
    { "id": "es-b1-07", "stage": "b1-bridge", "kind": "authentic", "textId": "text:es:palma-tradiciones-peruanas-ch04",
      "domain": "narrative" }
  ] }
```

- `kind`: `controlled` (written for the ladder), `adapted` (a library text simplified — a transformation, reviewed like a
  controlled text), `authentic` (a library text placed as it is; the unit refers to it by `textId`).
- `after: "stage0"` makes Stage 0's path (`data/stage0/<lang>/path.json`) the head of the ladder: its scenes count as
  the first texts read.
- A controlled or adapted unit's `document` is an ordinary import document (format v2) under `data/ladder/<lang>/units/`,
  with corpus id `ladder-<lang>`, carrying the pipeline block below.

## The gate — `npm run ladder:check` (and a test, so CI fails)

Walks Stage 0, then the units in order, with the real adapter (the probe of the audit, made permanent), and reports per
unit: words, curriculum coverage (≥ 3 and ≥ 1 encounters), new lemmas per 100 words, constructions first met (the
adapter's `detectPatterns` keys), domain, and Scripture share of the stage.

| check | warning | error (fails CI) |
|---|---|---|
| coverage of a controlled/adapted unit (≥ 3 encounters; PROPN and numerals count as known) | < 92 % | < 85 % |
| coverage of an authentic unit | < 92 % | < 88 % |
| cliff: drop below the mean of the previous three units | > 6 points | > 12 points |
| new lemmas per 100 running words | > 5 | > 9 |
| recycling: a lemma introduced in a unit appears ≥ 3 more times within the next 6 units | not met for > 25 % of the unit's new lemmas | — |
| a stage whose words are > 40 % Scripture | warning | — |

The first two units after Stage 0 are allowed one band lower (warning at 85 %, error at 78 %): Stage 0 gives only a few
hundred words. Thresholds live in one place (`src/ladder/policy.ts`) and are themselves provisional.

`npm run ladder:place -- --lang es <textId | file>` answers the owner's question for any candidate text: *where could
this enter the ladder* (the first unit after which its coverage is ≥ 95 %), or *library, not ladder* (never).

`test/ladder/gate.test.ts` runs the gate over every committed `data/ladder/*/ladder.json`; any error fails the suite.

## The pipeline — draft → review → corrections → audio → published

Every controlled or adapted unit carries:

```json
"pipeline": {
  "state": "machine-draft",
  "history": [
    { "state": "machine-draft", "at": "2026-10-05", "by": { "kind": "tool", "name": "ladder drafting agent" } },
    { "state": "in-review", "at": "…", "by": { "kind": "person", "name": "…", "competence": "native", "variety": "es-HN",
      "role": "linguistic-reviewer" } },
    { "state": "corrections-pending", "at": "…", "by": { … }, "checklist": { … }, "corrections": 7 },
    { "state": "reviewed", "at": "…", "by": { … } },
    { "state": "audio-ready", "at": "…", "by": { … }, "recordings": "…" },
    { "state": "published", "at": "…" }
  ] }
```

- **States**: `machine-draft` → `in-review` → `corrections-pending` → `reviewed` → `audio-ready` → `published`. A
  correction sends the unit back to `in-review` with a new content version.
- **A reviewer is a person** (`kind: "person"`) with a name, a competence (`native`, `near-native`, `professional`), the
  variety they speak (for Honduras, a Honduran reviewer is preferred for spoken material) and a role. A tool can draft
  and check; it can never move a unit past `in-review`.
- **The review checklist** (recorded per review, each item ok / changed / problem with a note): naturalness,
  contemporary usage, register, grammatical correctness, dialect appropriateness, sounds translated, cultural oddities,
  unnatural simplification.
- **Publication rule for ladder units**: published only from `audio-ready`, i.e. reviewed by a person with every
  correction resolved and a reviewed human recording attached. The rule that hides machine drafts stays as strict as it
  is; this is the road through it, not around it.
- **Tools**: `npm run review:packet -- --lang es --unit <id>` writes a printable packet for a reviewer (numbered
  sentences, the checklist, room for corrections) and a return file; `npm run review:apply -- <return.json>` records
  the review and the corrections; `npm run audio:packet -- --lang es --unit <id>` writes a recording script (sentence
  ids, text, notes on speed and register) and the manifest a curated recording needs.
- Library texts by native authors are not run through this pipeline: their check is source fidelity, and the app should
  call it that ("source checked"), not "reviewed".

## Ownership (agreed with the other sessions; see the messages of 2026-10-05)

- Gate, pipeline, packets, Spanish ladder: the Spanish session.
- German, Hindi, Thai, Albanian ladders: their sessions, on this contract.
- Recordings reaching the player (GoListen): the session that owns GoListen.
- Whole-corpus recommendations (GoLearn reading the full library, not 40 samples): to be agreed.
