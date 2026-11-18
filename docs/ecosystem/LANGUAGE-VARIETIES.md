# Language varieties as a learning dimension

2026-11-17. Greek and Hebrew stay one language each in GoLearn. Under each, a learner's knowledge, review cards and
review queues are kept per variety: Homeric, Classical (Attic), Koine and Modern Greek; Biblical and Modern Hebrew.

The rule in one line: **one language, shared lexical items, independent demonstrated mastery, queues scoped on purpose.**

Nothing here changes a screen. Every language other than Greek and Hebrew behaves exactly as before; since 2026-11-18 Albanian
is the third language with learning varieties, its dialects (section 10).

## 1. What was there before (the audit)

| Question | What the code did on master `ebf6f3b4` |
|---|---|
| How is a language registered? | A pack manifest per language (`packages/language-packs/src/packs/*.ts`). Greek and Hebrew each declare `varieties` (`el-hom`, `el-att`, `el-koi`, `el-mod`, `he-bib`, `he-mod` and others) and say "item ids are shared, and the period travels on each reading and on the enrolment". The analysers decide a period per sentence (`src/adapters/{greek,hebrew}/analyze.ts`). |
| What identifies a word? | A unit id: `lemma:el:λόγος:NOUN`, `form:he:…` (`repository-contract/src/units.ts`). No variety in it. A word spelled alike in two periods has ONE id. |
| What identifies a learner's knowledge? | One `UnitKnowledge` row per learner and unit id. No variety. A level reached in Classical Greek was the level of the Modern word of the same spelling. |
| What identifies a review card? | `card:<dimension>:<unitId>` (`goreview/src/scheduler/deck.ts`), folded per learner and language. No variety. One FSRS history for the word across periods. |
| Did events say which variety? | Only a lookup, and only when the page or the reader declared it (`payload.language.varietyId`). A mark, a help request and a playback said nothing. GoReview stamped the ENROLMENT's variety on a card's envelope: a target, not a statement about the text. |
| How was a queue built? | The Repository ranks candidates per enrolment (per language). GoReview's intake and planner work per language. An enrolment's variety chose which facts to prefer, never which cards to hold. |
| Saved decks, sync | Saved decks are lists of card ids, synced as preference events. Everything else is the event log; knowledge and decks are folds of it. |

So Classical and Modern Greek, and Biblical and Modern Hebrew, shared mastery, review schedule and card identity
wherever their spelling coincided. The identifiers did not hold enough to tell them apart.

## 2. The model

`packages/repository-contract/src/varieties.ts` is the one place.

```
Greek (el)                              Hebrew (he)
  ancient   el-hom  Homeric               biblical  he-bib  Biblical
            el-att  Classical (Attic)     rabbinic  he-mish Mishnaic
            el-koi  Koine                 medieval  he-med  Medieval
            el-ion, el-dor, el-aeo        modern    he-mod  Modern
  medieval  el-med  Byzantine             (heritage) arc-bib Biblical Aramaic, read inside the Hebrew Bible
  modern    el-mod  Modern
```

- The ids are the ones the packs and the stored events already use. `grc-homeric`, `grc-classical`, `grc-koine`,
  `el-modern`, `he-biblical`, `he-modern` are accepted as aliases and never stored.
- Each variety has a parent language, a historical group, approximate years, its related varieties (nearest first)
  and whether a learner may choose it (`selectable`: the four Greek and two Hebrew varieties the packs analyse).
- The registry is data. `defineLanguageVarieties` adds a language. A language absent from it has no learning
  varieties: its regional varieties (es-HN, de-AT) stay usage labels.
- A test holds the registry to the packs' own declarations (`test/varieties/contract.test.ts`).
- **Decided by the owner, 2026-11-17: Homeric, Classical and Koine stay separate learning identities** (their own knowledge, cards and
  queues), not one "Ancient Greek" identity with the stage as a label. What is known in one of them reaches the others only as familiarity
  (section 5: strong for Known or Automatic, since they share a historical group).

Three things are kept apart:

| | What it is | Where |
|---|---|---|
| Lexical identity | the unit id, shared by the varieties that spell the word alike; relations between units as before | `units.ts` |
| Learning identity | unit id + variety | `UnitKnowledge.varieties[varietyId]`, `cardIdFor(unitId, dimension, varietyId)` |
| Review scope | the varieties one queue draws from | `ReviewScope` |

## 3. Review identity

```
card:<dimension>:<unitId>                 no variety (every card before this change; still valid for ever)
card:<dimension>@<varietyId>:<unitId>     one variety of a language that has them
```

Learner and language are the fold's own scope, as before. So a card is identified by learner, language, variety,
lexical unit and skill dimension. The invariants, each with a test:

1. Two varieties never share a card id (`contract.test.ts`).
2. A shared unit id does not mean a shared schedule: answering the Modern card never touches the Classical one
   (`goreview-scope.test.ts`, Test A).
3. Old cards keep their ids, histories and schedules; the fold of old events is unchanged (Test E).
4. The id is a pure function of unit, dimension and variety, so it is the same on every device (Test G).
5. Choosing another scope changes which cards a queue is given. It writes nothing, so it cannot overwrite progress.

One FSRS and one deck fold serve every variety. Nothing was forked.

## 4. Knowledge per variety (projection@8)

`packages/repository-engine/src/projection.ts`. A row keeps every field it had: the unit across all its varieties,
exactly as before. A row of a Greek or Hebrew unit gains:

- `varieties[varietyId]`: what the learner has shown in that variety. `{ whole: true }` when every record of the
  unit belongs to that one variety (the row is its knowledge). Otherwise a slice: level, dimensions, mark,
  encounters, folded from that variety's records plus the records nothing classifies; and `own`, the variety's
  classified records alone (level, event counts from reading and from review, first and last instants).
- `unclassified`: the unit folded from the records nothing classifies, when there are any beside slices.
- `sources`: how many events came from reading and how many from review.

Read a row in a variety with `knowledgeInVariety(row, varietyId)`:

| The unit has | The view is |
|---|---|
| classified evidence in that variety | that variety's slice |
| nothing classified at all | the row itself, as it was (basis `unsettled`) |
| classified evidence in other varieties only | New, plus whatever nothing classifies (basis `not-met`) |

Which variety a record belongs to (`statedVarietyOf`, then the projection's two context rules):

1. a review card whose id names a variety;
2. `payload.variety` (new, any event kind): `{ varietyId, basis: declared | analysed | scope }`;
3. `payload.language` when the language itself was declared (the learner's override, the book, the page);
4. a follow-up event of a card (a mark, a help request) takes the variety of its sentence's lookup, when every
   lookup of that sentence states the same one;
5. a legacy GoReview card (old id shape) and its answers: see section 8;
6. otherwise unclassified. An enrolment's variety, a detected language and an analyser's fallback classify nothing.

## 5. What transfers and what does not

`transferEvidence(row, varietyId)` reports what the learner knows of the same word in other varieties.

| Relationship | Level there | Strength |
|---|---|---|
| same unit id, same historical group (Attic and Koine) | Known or Automatic | strong |
| same unit id, same group | Recognized or Familiar | moderate |
| same unit id, another group (Biblical and Modern) | Known or Automatic | moderate |
| same unit id, another group | lower | weak |
| a different unit id that is the same letters without points or accents (`lexicalFamilyKey`) | any | weak |
| a heritage language (Biblical Aramaic) | any | none |

What it may do: break ties in the order NEW cards are introduced (`transferPriority`: strong 2, moderate 1, weak
and none 0), and be shown on the planned item (`PlannedItem.transfer`, with a line in `why`).

What it never does: change a level, write a review, move a due date, alter stability or difficulty, make a card
eligible or ineligible, or count as a success. Shared spelling is not read as shared meaning; a shared root is not
read as a shared word. No confidence score is invented: the table above is the whole rule.

A word Automatic in Biblical Hebrew is therefore still proposed in Modern Hebrew, at whatever level its Modern
evidence supports, and its Modern card starts with an empty history.

## 6. Review scope

`ReviewScope { languageId, varietyIds, includeUnsettled }`. `includeUnsettled` (default true) also admits records
whose variety is not settled; they belong to no variety, so leaving them out of every queue would strand them.

The default is one variety, never a combination (`resolveScope`):

1. the learner's choice (`ReviewPreferences.scope`), when it names a variety the language knows;
2. else the enrolment's variety;
3. else the variety the deck shows was studied most recently;
4. else the language's default.

`scopeReview` (`packages/goreview/src/scheduler/scope.ts`) decides what intake and the planner are GIVEN. It is not
a filter over an assembled deck:

- **deck**: the cards of the scope's varieties (and the unsettled, when included);
- **coverage**: the deck plus every unsettled card, which covers its word in any scope, so no second card is made;
- **candidates**: a word with classified evidence in a scope variety, tagged with that variety; a word classified
  only elsewhere is left out; a word nothing classifies stays, untagged, when the unsettled are included;
- **knowledge**: every row read in the variety its word is reviewed in.

The planner makes a new card under `itemIdFor(unit, dimension, candidate.varietyId)`. Intake's "already in the
deck" means in the deck for this variety. The Repository's candidates route takes `varieties=` and then ranks each
row in its variety and counts only that variety's cards as coverage; a service that predates this ignores the
parameter and GoReview enforces the scope by itself (the app tests run against such a service).

In a scope of several varieties a word eligible in more than one is proposed for one of them per build (the one
without a card, most recently met first); the next build proposes the next. Two cards of one word in two varieties
are two cards. The planner's standing rule "one new card per word in a batch" still holds across varieties.

## 7. Source-aware acquisition

Every event of a reading card now records the variety of its text (`encounterVariety`,
`packages/golearn-extension/src/store/index.ts`; Biblia uses the same builders):

1. the learner's or the reader's own statement (Biblia reading the Hebrew Bible): `declared`;
2. the period the analyser read the SENTENCE in, when it settled it on evidence in the sentence: `analysed`;
3. what the book or page declares (`hbo`, `grc`): `declared`.

The analysers now say how they settled a period (`notes.periodEvidence`): `text` (cantillation; polytonic or
monotonic spelling; Homeric shapes; enough recognised words), `declared` (the caller's variety decided) or `default`
(a fallback). Only `text` is recorded. A single word spelled alike in every period, a tie, and "read on as the
sentence before" record nothing: the event stays unclassified rather than being assigned by guess.

One unit may have encounters in several varieties; each stays with its variety.

## 8. Existing data

No stored event is rewritten and none is added. Knowledge is a fold of the log; the projection version moves from 7
to 8, so each learner's rows are rebuilt once on their next read (the path every earlier version used). The deck is
a fold of the same events as before.

| Existing record | What happens |
|---|---|
| A reader's lookup that declared its variety (Biblia) | classified in that variety |
| A mark or help request on that card | classified with its lookup, by its sentence |
| A lookup with only the enrolment's default or a detection | unclassified; counted in every variety's view; never assigned |
| A review card (old id) and its answers | assigned by `legacyVarietyOf`, below |
| Everything of a language without learning varieties | untouched |

`legacyVarietyOf(stamp, classifiedBefore)` decides a card from its stamp (the enrolment's variety on its first
event) and the varieties the word had classified evidence in **at or before the card began**:

| Classified before | Stamp | The card is |
|---|---|---|
| one variety | none, the default, or that variety | that variety |
| one variety | another, chosen variety | unsettled (a conflict) |
| several | one of them | the stamp |
| several | anything else | unsettled |
| none | a chosen variety (not the language's default) | the stamp |
| none | none or the default | unsettled |

A stamp of the default variety (`he-mod`, `el-mod`) is what an enrolment gets when nobody chose, so by itself it
settles nothing: nothing is called Modern because of it. Evidence that arrives after a card began never moves the
card, so an assignment cannot flip. The Repository assigns the card's answers and GoReview classifies the card by
this one function, from the same inputs.

An unsettled card keeps its id, history and schedule, stays in the learner's default queue, and covers its word, so
no duplicate is made beside it. Its answers stay unclassified and count in every variety's view of the word.

Old clients keep working: every new field is optional, every old id is valid, and a row without `varieties` reads
as unsettled.

## 9. What a screen can ask (the contract for a later interface)

Nothing below needs a change to the scheduler.

| Need | Call |
|---|---|
| The varieties of a language | `learningVarietiesOf(languageId)`; `selectableVarietiesOf(languageId)`; on a model, `model.varieties.available` |
| The scope in force, and whether the learner chose it | `model.varieties.scope`, `model.varieties.chosen` |
| Choose one variety or a combination | `ctx.state.updatePrefs(learnerId, languageId, { scope: { varietyIds, includeUnsettled? } })`; `undefined` returns to the default |
| The choice, stored | `ReviewPreferences.scope` (the preferences record; aliases are stored as their ids; unknown ids are dropped) |
| The variety of a card | `item.variety` on every item of `model.deck` (`{ varietyId?, basis: card | legacy | unsettled }`); for any item, `varietyOfItem(item, knowledgeRow)` |
| Due, new and eligible cards per variety | `model.varieties.counts` (the whole deck, whatever the scope); `countByVariety(...)` |
| What was left out of this queue and why | `model.varieties.excluded` |
| Learned directly or inferred from another variety | `knowledgeInVariety(row, varietyId).basis`; `ownKnowledgeOf(row, varietyId)` (events from reading and review); `model.varieties.transfer[unitId]`; `PlannedItem.transfer` |
| The Repository's candidates for a scope | `api.candidates(enrolmentId, limit, after, objectives, varietyIds)` (`GET /candidates?varieties=`) |

`model.varieties` is absent for a language without learning varieties.

## 10. Albanian: dialects as learning varieties (2026-11-18)

The owner asked for "a feature to Albanian that distinguishes dialect". Albanian is now the third language in the registry, and the
first whose varieties are living dialects rather than periods.

```
Albanian (sq)
  modern   sq-standard    Standard Albanian   (default; a learner may choose it)   aliases sq, sqi
           sq-gheg        Gheg                (a learner may choose it)            aliases aln, aln-xk, aln-al
           sq-tosk        Tosk as a dialect   (recognised, never chosen)           alias als
           sq-arbereshe   Arbëresh            (recognised, never chosen)           alias aae
           sq-arvanitika  Arvanitika          (recognised, never chosen)           alias aat
```

- The ids are the pack's own (`packages/language-packs/src/packs/sq.ts`); the adapter's codes (`sq`, `aln` …) are aliases. One
  historical group: what is Known in Gheg is strong familiarity in Standard and the other way round (section 5), and never mastery.
- **How a sentence gets its dialect** (`src/adapters/albanian/dialect.ts`, adapter-sq@10). Most words are written alike in both, so
  the SENTENCE decides, on the forms the two write differently: asht / është, nji / një, tue / duke, a nasal vowel (â ê î ô û ŷ),
  participles in -ue / -ye / -un against -uar / -yer / -ur, the Gheg infinitive me + participle, shpi / shtëpi, tash / tani,
  çka / çfarë, and everyday spoken Gheg (ni, kom, jom, amo, aj, naj, gjo, veq, kqyr; participles cut short: punu, shku, kalua).
  A form counts once, however often it recurs: two points for a form only one side writes, one for a form that leans. The sides
  are not weighed alike: Gheg speakers use një, duke and tani freely, so on the Standard side only është is strong, një and duke
  lean, and tani counts for nothing. Gheg: two or more Gheg points, and more than the Standard ones. Standard: three or more
  Standard points and no Gheg form at all. Otherwise the sentence is not assigned: it is READ as Standard (the course's target)
  and says that this is a default.
- Every reading carries `notes.period` (`aln` or `sq`), `notes.periodBasis` and `notes.periodEvidence` (`text` or `default`), the
  same three notes Greek and Hebrew write. The card says "This sentence is read as Gheg: …" with the forms that decided. Only
  `text` is recorded on the reader's events (section 7), so a sentence that shows nothing stays unclassified and counts in both
  dialects' views, exactly as an Albanian record did before.
- From there everything is the framework's: knowledge per dialect (section 4), a card per dialect (section 3), a queue of one dialect
  by default — the enrolment's, which for every existing Albanian learner is Standard (section 6). A word met only in Gheg text is
  not proposed in the Standard queue; a learner who chooses Gheg, or both, gets it.
- **Existing Albanian data**: no event is rewritten. No stored Albanian record states a dialect, so every existing row reads as
  unsettled (as it was) and every existing card stays in the default queue with its id, history and schedule (section 8). The
  projection version does not move: an Albanian row gains its per-dialect fields when the next event touches its word, because a
  touched word is refolded from all its events.
- Measured (2026-11-18, `adapter-sq@10`):

  | Text | Sentences | Read as Gheg | Settled as Standard | Left unassigned |
  |---|---|---|---|---|
  | The repository's Albanian course texts (all Standard) | 10,923 | 0 | 586 | 10,337 |
  | UD_Albanian-STAF dev + UD_Albanian-TSA test (Standard) | 80 | 0 | 11 | 69 |
  | UD_Gheg-GPS test (transcribed spoken Kosovo Gheg) | 966 | 522 (54 %) | 2 | 442 |

  The two Gheg-treebank sentences settled as Standard are Standard in form ("… është duke vjelur dardha"). The treebanks are
  comparison data only (CC BY-SA 4.0, never bundled, never course text). **The Gheg figures are development figures, not
  held-out ones**: the first version of the rule recognised 8 % of that treebank and settled 10 % of it as Standard, and the
  rule was then changed after reading its sentences (the spoken forms, the short participles, the weaker Standard side). Written
  literary Gheg (the Shkodër tradition) was not measured: the repository holds none. No speaker has checked the rules.
- Not done: Gheg has no word list or grammar of its own (a Gheg form is still read through its Standard equivalent, when the list
  knows it); dialectal Tosk, Arbëresh and Arvanitika are not detected, only labelled when a dictionary labels a word; a text that
  mixes the two (a Kosovo newspaper with the odd Gheg word) is left unassigned sentence by sentence; nothing lets a learner say
  "this page is Gheg" yet (the `override` path of section 7 already carries such a statement when a screen offers it).
- Also fixed on the way: a passage that arrives through sharing (`packages/golearn-share`) records the variety of its sentence as a
  browser lookup does. The mirrored builder had not been given the rule, for Greek and Hebrew either.

## 11. Not done, and known limits

1. **GoLearn's page underline and the word list in GoReview ("My vocab") still show a word's level across its
   varieties.** The rows they read carry the per-variety data; they do not yet read it. Biblia does, and so do
   GoReview's deck, proposals, plans and home counts.
2. **Deploying the service rebuilds every learner's knowledge once** (projection 7 to 8), as each earlier version
   did. Nothing was deployed or measured against production data in this work.
3. **No one's real account was read.** The migration rules are tested on constructed histories only. An account
   whose GoReview enrolment was the default variety while all its reading was in another reader is the case the
   rules were written for; it should be checked on a copy of real data before release.
4. **Senses are not separate learning items.** A card is a word in a variety; the variety's own meanings come from
   the facts chosen for it. Sense-level cards, roots and cognates as stored relations between units were not added:
   the unit graph already has relation kinds, and nothing populates such relations for Greek or Hebrew yet. The only
   cross-unit link used is the spelling family, and it is always weak.
5. **Within a combined scope one row per word is read**, in the variety of the word's card or proposal in that
   build. The two cards stay separate; a screen listing the word once sees one variety's level.
6. **A Modern Greek or Modern Hebrew sentence is classified only when the Modern word index is installed.** With the
   compiled core alone its words match older forms by their letters; the analyser then says the sentence did not
   settle the period and nothing is recorded.
7. **Attic versus Koine on an undeclared page rests on vocabulary** and is recorded only for sentences with enough
   recognised words (eight for Attic, five for Koine). Shorter sentences are left unclassified.
8. **An unsettled card has no way yet to be settled by the learner.** It stays reviewable. A later interface could
   let the learner say which variety it is; that needs one new event rule in the deck fold.
9. **Reading signals** used to rank proposals (recent sentence contexts) are still counted per language.
10. **GoTell and GoListen** events carry no variety and stay unclassified for Greek and Hebrew.
