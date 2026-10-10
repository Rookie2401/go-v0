# The six knowledge levels

Owner's request (2026-10-10): the card's three self-assessment choices ("New to me", "I recognise it", "I can use it") were
too few. There are **six knowledge levels**, shared by every app that reads the learner's Repository, and **review is not a
metric shown to the learner**: whether a word comes back for practice is a natural consequence of how well they know it.

| level | meaning (the words the learner sees) | what GoLearn shows | what GoPractice does |
|---|---|---|---|
| **New** | not met yet, or marked as new | dashed underline | proposes it for recognition practice once it was looked up, got wrong or is common, or the learner marked it new |
| **Seen** | met or looked up, nothing shows it was understood | faint dotted | same: recognition practice |
| **Recognized** | understood with help, or recognised once | dotted | reading recognition, and its retention (on the same signals) |
| **Familiar** | recognised repeatedly while reading | thin solid, faint | reading recognition, and its retention (on the same signals) |
| **Known** | recognised reliably, or marked as known | hairline, faint | retrieval (the next step up), only when retention decayed or the word is common |
| **Automatic** | produced or retrieved without help, or marked as automatic | hairline, barely visible | left alone unless retention decayed or the learner's mark was contradicted |

The vocabulary, its order and its words live in `packages/repository-contract/src/knowledge-levels.ts` (`KnowledgeLevel`,
`KNOWLEDGE_LEVELS`, `KNOWLEDGE_LEVEL_RANK`, `KNOWLEDGE_LEVEL_WORDS`, `levelOfMark`). The computation lives in
`packages/repository-engine/src/levels.ts` (`levelOf`). Every threshold below is a hypothesis until calibrated against independent
assessment, like every other number in the projection.

## 1. What the evidence says (`evidenceLevelOf`)

From the unit's dimension estimates alone (`UnitKnowledge.dimensions`; the score is the engine's estimate, prior 0.5):

| level | rule |
|---|---|
| new | no observation at all |
| seen | something was observed (a lookup, an encounter, a help request, a failed attempt), nothing shows it was understood |
| recognized | a positive `assistedRecognition` (understood with help), **or** a positive recognition observation (read once, or below the familiar bar), **or** one correct unassisted production |
| familiar | a recognition dimension with score >= 0.6 over >= 2 observations |
| known | a recognition dimension with score >= 0.8 over >= 4 observations |
| automatic | `productiveRetrieval` or `contextualProduction` with score >= 0.7 over >= 2 observations |

"A recognition dimension" is `readingRecognition` or `listeningRecognition` (listening counts like reading), and, because a phrase or a
construction is understood as a whole, also `phraseComprehension` and `grammaticalUnderstanding`; the highest level any of them
reaches counts. Two things differ from the shortest reading of the owner's list, deliberately: a negative-only
`assistedRecognition` ("I needed help and still failed") is not recognition, and a recognition observation that is *negative only*
leaves the unit at Seen, not Recognized.

A self-report never reaches a threshold: a mark weighs at most 0.09 as evidence (below), and the fold computes the evidence level on the
unit **without** its self-mark observations, so a mark cannot raise the level it is being compared with.

Worked examples (a recognition card answered correctly weighs 0.56): one correct card = Recognized; two = Familiar (score 0.76);
four = Known (0.85). Two correct recall cards = Automatic (0.78). Four lookups and nothing else = Seen.

## 2. What the learner says: self-marks, contradiction, release

`UnitKnowledge.selfMark` is the learner's **latest** mark of the unit, as a level (latest by event instant, then event id). The newest
mark **decides the level outright** until later evidence disagrees. "Later" is exact: the fold builds the unit's evidence from the
observations dated *after* the mark, leaving out other self-reports.

- **Contradicted (downward).** The evidence after the mark contains something *against* it (a lookup, an assistance request, a failed
  judgement) **and** puts the unit two or more levels below the mark: the level is then what the evidence supports. A plain
  re-encounter, a correct answer and anything dated before the mark never contradict. (`CANDIDATE_RULES`' reason `selfMarkContradicted`
  names the mark and the level the evidence supports.)
- **Released (upward).** The evidence after the mark puts the unit two or more levels *above* it (a word marked New, then recognised
  reliably): the level is what the evidence supports. An old request for help does not stop a word progressing.
- **A mark of New is released by any later observation (2026-10-10).** New means *not met*: a lookup, an exposure, a help request or a
  failed attempt dated after the mark is a meeting, so the level becomes `max(seen, what the evidence supports)`. This is why clicking a New
  word in GoLearn turns it into Seen at once (the click records `SelectionLookedUp`). No two-level gap applies (nothing lies below New);
  an observation dated before the mark never releases it, and marking the word New again starts over. Rows stored before this rule keep the
  level they were folded with until the unit's next event refolds them.
- Otherwise the mark stands. A later mark replaces an earlier one, so a word can be marked back down.

`saved` and `ignore` are bookmarks. They never set a mark and are not evidence either way.

### Evidence a mark carries (`evidence.ts`)

A mark is a claim, so it is a weak, low-reliability self-report (ceiling 0.2 or 0.3 x reliability 0.3):

| mark | evidence |
|---|---|
| `new`, `seen`, `learning` | a request for help: negative `readingRecognition`, weight 0.06 |
| `recognized`, `familiar`, `known` | a weak recognition self-report: positive `readingRecognition`, weight 0.06 |
| `automatic`, `productive` | a weak production self-report: positive `productiveRetrieval`, weight 0.09 |

## 3. Legacy marks keep their meaning

The old card stored `ItemMarked` marks `learning` ("New to me"), `known` ("I recognise it") and `productive` ("I can use it"). Those events
are immutable and still valid: the contract's validator accepts the six level words **and** the three legacy words (and `saved`,
`ignore`). Their **evidence is exactly what it was** in projection@3 (weights above). Their **level** is read through
`levelOfMark`: `learning` = New, `productive` = Known, a level word is itself.

**Known caveat.** `known` is both a legacy word and a level word, and an event cannot say which was meant. `levelOfMark('known')` reads
it as the level **Known**; `LEGACY_MARK_LEVEL.known` ("I recognise it" = Recognized) is the older meaning and is only reachable by a
caller that asks for it explicitly. A `known` mark stored by the three-choice card therefore reads one level high until the learner
marks the word again. The contradiction rule softens this: any lookup or failure after such a mark brings the level back down. If the owner
prefers the other reading, it is a one-line change in `levelOfMark`, plus a rebuild.

## 4. Encounters

`UnitKnowledge.encounters` is the number of **distinct events** in which the learner met the unit: an encounter, a lookup, an assistance
request, or any recognition judgement (assisted or not), each event id counted once however many dimensions it touched. Playing the
word's audio, producing it, and marking it are not encounters. The card's footer ("Previous encounters: N") and GoReview's
reviewer queue read it.

## 5. Review is a progression (candidates)

Nothing is asked of the learner and no event is required. `engine.candidates` draws by level (`packages/repository-engine/src/candidates.ts`):

- **new, seen**: a candidate for recognition practice once looked up, wrong, common, or marked new/seen by the learner (reason `selfMarkedNew`, weight 0.2).
- **recognized, familiar**: reading recognition (and its retention) on the same signals; decayed retention raises the score but is not, alone, a reason (a word recognised once is not re-tested just because days passed).
- **known**: retrieval (`productiveRetrieval`), only when retention decayed or the word is common. When the unit's analysis cannot support
  a production item but can support recognition, recognition is asked and the reason `levelTarget` says so.
- **automatic**: only when retention decayed or the mark was contradicted.
- **Retention decayed**: the retention estimate (already decayed to now) is below 0.3 **and** the strongest dimension was last observed
  at least one half-life ago (reason `retentionDecayed`, weight 0.15).

Every candidate carries a `knowledgeLevel` reason (weight 0, an explanation) such as `Known (4 encounters): recognised reliably; retrieving it
moves it to Automatic`. A demonstrated error still decides the target dimension; the level supplies it only when nothing went wrong.

## 6. Who reads the levels

- **GoLearn** (the extension): the underline per level and the card's six-button rating row. The page should prefer `row.level`, which
  already folds in the mark, its contradiction and its release, over reading `selfMark` itself.
- **GoPractice / GoReview intake** (`packages/goreview/src/intake/intake.ts`): `test-now` / `test-later` outcomes carry `level Known: ...`
  in their reasons, and a candidate whose unit is Automatic with no decay or contradiction among its reasons is `already-covered`.
- **GoReview's human reviewer queue** (`review-eligibility.ts`): a field becomes review material only through the progression, never through
  a learner's request. `reviewEvidenceOf(row)` builds the evidence from a knowledge row (its `encounters` and `level`); a unit at level New is
  never eligible, and there is no input by which a learner asks for review.

## 7. Migration: projection@3 -> projection@4

`MODEL_VERSION` is `projection@4` (`packages/repository-engine/src/engine.ts`). The new fields are `level`, `encounters`, and a `selfMark`
whose `mark` is a level. A store whose projection cursor is at `projection@3` is **rebuilt from the immutable events on the next read**
(`ensureCurrent`): `rebuild` clears the knowledge rows and refolds every live event, exactly as projection@3 and @2 were done. Nothing
stored is rewritten: events keep their original marks (`learning`, `known`, `productive`), and the dimension estimates of the rebuilt
rows equal the ones projection@3 stored (the evidence rules did not change); only the new fields appear, and `selfMark.mark` reads
`new` where it read `learning`. The incremental projection refolds every touched unit from all its events, so the level and the
contradiction rule are always exact; a caller that folds one observation into a stored row without history gets a coarser level
(documented on `foldObservation`).
