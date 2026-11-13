# GoReview Ecclesia — Handoff for the interface builder (GPT)

You are building the Ecclesia theological library's reader interface for Biblical Hebrew, Biblical Aramaic, Koine Greek and Latin, with spaced review of what the learner reads. The review engine already exists and has been specialised for you. This page says **where it is, what you are looking for, what to read in which order, and what you must not do**. Read it first; the other three documents go deeper.

## 1. Where

| | |
| --- | --- |
| Repository | `https://github.com/Rookie2401/go-v0` |
| Branch | **`feat/goreview-ecclesia`** (one commit `c1a66235` on top of `master` `30106b4d`; not merged) |
| Package you integrate | `packages/goreview-ecclesia/src/` — import the barrel `index.ts` |
| Tests that are your executable examples | `test/goreview-ecclesia/` |
| Documents | `docs/ecosystem/GOREVIEW-ECCLESIA-ARCHITECTURE.md` (why), `GOREVIEW-ECCLESIA-INTEGRATION.md` (how, per screen), `GOREVIEW-ECCLESIA-REPORT.md` (what was built/tested/deferred), this file |
| Run the tests | `npm install` at the repo root, then `npx vitest run test/goreview-ecclesia` (93 tests, ~1 s) and `npx tsc -p tsconfig.app.json --noEmit` |

Everything you need is TypeScript with relative imports; there is no build step for the package. Node 24 / Vitest 3.

## 2. What you are looking for

One typed surface, in one file: **`packages/goreview-ecclesia/src/contract.ts`**. Every other module implements a part of it. You design every screen; the package never renders anything.

The contract gives you nine things:

1. `EcclesiaLanguageId` / `EcclesiaLanguageProfile` — the four languages and how each is filed in the shared Repository (`profileOf('grc')`).
2. `PassageRef`, `EcclesiaToken`, `PassageTokens` — how you hand over a tokenised passage (USFM book code, chapter, verse; tokens with lemma, UD part of speech, features).
3. `ReadingEncounter` (eight kinds) + `mapEncounter` / `recordEncounters` — how what the reader observes becomes Repository events, idempotently.
4. `ContextualCard` + `contextualCard` / `cardsForPassage` / `contextsOf` — a word's card and every Scripture place it was met.
5. `EcclesiaLexicon` + `factsProviderFor` — how your dictionary feeds the exercise builders.
6. `UnitStanding` (six knowledge levels) and `CardSchedule` (FSRS) + `knowledgeStandings` / `cardSchedules` / `unitOverview` — what to show about a word, on two scales that are never mixed.
7. `PassageFamiliarity` / `RankedPassage` + `passageFamiliarity` / `nextBestPassage` — the Next Best Passage estimate, **provisional** and labelled so.
8. `CorpusFrequencyProvider` + `frequencyTable` / `frequencyFromPassages` — frequencies from your corpus; the package ships none.
9. `ComposedSession` + `composeSession` / `createEcclesiaRunner` — a review session: reading → GoReview intake → planner → real runner.
10. `EcclesiaPeriod` + `periodsOf` / `resolvePeriod` / `profileForPeriod` / `periodEvidence` / `crossPeriodKey` — the periods of Hebrew (Biblical/Classical, Mishnaic, Medieval, Modern) and Greek (Homeric, Attic, Koine, Medieval, Modern): ids are period-free, the period travels with each text, spellings are linked not merged. And `WorkPassageRef` for works that are not Scripture.

You implement five inputs (integration guide §0): tokenised passages, a lexicon, a `ReaderIdentity` (one enrolment per language), an `EncounterSink` that persists before it resolves, and encounter ids + a clock.

## 3. What you are looking through — reading order

**30 minutes, in this order:**

1. `packages/goreview-ecclesia/README.md` — the module map (2 min).
2. `packages/goreview-ecclesia/src/contract.ts` — read all of it; it is commented for you (10 min).
3. `docs/ecosystem/GOREVIEW-ECCLESIA-INTEGRATION.md` — the calls per screen and the do/don't list (10 min).
4. `test/goreview-ecclesia/greek-vertical-slice.test.ts` — the whole loop over John 1:1–18 against an in-memory Repository store; copy its shape (8 min).

**Then, as you build each part:**

| Building | Read | Notice |
| --- | --- | --- |
| Tokenisation of your corpus | `src/identity.ts`; fixtures `test/goreview-ecclesia/fixtures/greek-john.ts` (MorphGNT → UD decoder) and `fixtures/four-languages.ts` (Hebrew/Aramaic/Latin rows) | Pass surfaces as printed; the package normalises (strips cantillation, keeps Greek accents, lower-cases Latin). Lemma spelling **is** the identity. |
| Recording | `src/encounters.ts`; `test/goreview-ecclesia/encounters.test.ts` | Each encounter kind, what event it becomes, what the engine makes of it. `encounterId` is your idempotency promise. `review_answered` is **not** an encounter. |
| Word card / dictionary panel | `src/cards.ts`, `src/facts.ts`; `test/goreview-ecclesia/cards-facts.test.ts` | Card id is deterministic; verse text is shown by you from `card.context`, never stored. Glosses ≤ 4 words each are the accepted answers. |
| Progress / word status | `src/profile.ts`; `test/goreview-ecclesia/session.test.ts` ("knowledge profile from reading") | Level ≠ schedule. `KNOWLEDGE_LEVEL_WORDS` has learner-facing wording. |
| Review session | `src/session.ts`; the vertical slice | `composed.plan.items[].why`, `plan.skipped`, `composed.declined` explain every inclusion/exclusion — surface them. Listening is off. |
| Next passage | `src/familiarity.ts`, `src/frequency.ts`; `test/goreview-ecclesia/familiarity.test.ts` | Show the number as an estimate with its reasons; early on lower `knownFrom` to `'recognized'` and say so. |
| Periods (Classical / Mishnaic / Medieval / Modern Hebrew; Homeric / Attic / Koine / Medieval / Modern Greek) and non-Scripture works | `src/periods.ts`; architecture §3a; integration §1a; `test/goreview-ecclesia/periods.test.ts` | You declare each text's period with `profileForPeriod`; one lexeme = one unit in every period; monotonic / unpointed spellings are separate units linked by `crossPeriodKey`; periods without an analysed corpus default to `provisional`. |
| Language choices | `src/languages.ts`; architecture §3 | Aramaic is its own Repository language `arc`; Greek is `el`/`el-koi` (pools with the Biblia reader). `withOverrides` if you must change filing. |

**The shared engine you are standing on (read only when a question is not answered above):**

- `packages/goreview/src/types.ts` — `Exercise`, `Response`, `Grading`, `SessionPlan`, `DeckItem`, `ReviewPreferences`.
- `packages/goreview/src/session/runner.ts` — the `SessionRunner` you drive (`current / preview / answer / skip / challenge / finish / recover`).
- `packages/repository-contract/src/index.ts`, `payloads.ts`, `sources.ts` — the event envelope, payload validators, the text guard, `ScriptureSourceRef`.
- `docs/ecosystem/KNOWLEDGE-LEVELS.md` — the six levels and the self-mark rule.
- `packages/biblia/src/repo.ts` — the existing Scripture reader's recorder (enrolment per language and period; the same producer id you use).

## 4. The rules you must keep

1. **No passage text in events, facts or glosses.** A surface is one word; a verse is coordinates; `validateEvent` refuses more than four words. Show text from your own corpus by reference.
2. **One `encounterId` per observation; resend freely; never reuse an id for different content.**
3. **Never build review events yourself.** `createEcclesiaRunner(...).answer()` records `CardReviewed` (and `CardAdded` for a new card) with the CAS chain and scheduler profile the engine needs.
4. **Record on the device first**, in a sink that persists before resolving; sync afterwards. The runner refuses to advance on a failed record.
5. **Show the two scales apart**: level (what the learner knows) and schedule (when a card returns).
6. **Label familiarity as provisional** (`provisional: true`, `heuristic: 'ecclesia-familiarity@provisional-1'`) wherever it appears.
7. **Do not edit `packages/goreview`, `packages/repository-*`, `src/adapters`** from the Ecclesia side; if you need a shared change (see §5), ask for it as its own branch.

## 5. What is deliberately not there (so you do not search for it)

- Any UI, routes, storage layer or sync client — yours.
- Verse text inside exercises (`ExampleSentence.source` admits pack material only) — show it beside the card from `card.context`.
- A reader-specific `Producer` — events use `golearn-app` with `producer.surface = 'ecclesia:<kind>'`, `payload.readerId = 'ecclesia'`.
- Audio / listening — off for all four languages.
- Grammar and production exercises — builders exist, but no construction catalogue for these languages was authored; sessions are recognition-first.
- Frequency tables — build them from your corpus with `frequencyFromPassages`.
- A calibrated familiarity band — 80–90 % is the working hypothesis.

## 6. Identifiers you will see

| Form | Example | Meaning |
| --- | --- | --- |
| `lemma:<lang>:<lemma>:<POS>` | `lemma:el:λόγος:NOUN` | a lexeme (lang = Repository language id, not the Ecclesia code) |
| `form:<lang>:<surface>` | `form:el:λόγος` | a printed word, normalised |
| `morph:<lang>:<POS>:<k=v|…>` | `morph:el:NOUN:Case=Nom|Gender=Masc|Number=Sing` | a morphological construction |
| `card:<dimension>:<unitId>` | `card:written-recognition:lemma:el:λόγος:NOUN` | a review card |
| `JHN.1.1-18`, `v:JHN.1.1` | | passage key; per-verse context key (`subject.sentenceKey`) |
| `w:<work>.<n>.<n>` | `w:plato-republic.514.1` | a passage of a work that is not Scripture (also its source-reference locator) |
| period ids | `he-bib he-mish he-med he-mod` · `el-hom el-att el-koi el-med el-mod` · `arc-bib` | the period of a text = the event's `varietyId` |
| `ecclesia:<kind>:<encounterId>[:<verse>]` | `ecclesia:word-selected:rs42:7` | an event's `dedupeKey` |
| Levels | `new seen recognized familiar known automatic` | the six knowledge levels |

## 7. If something does not fit

The architecture document §1 lists what was found in the existing system and §7 the one behaviour likely to surprise you (a revealed verse translation lifts that verse's function words in the planner's priority; pass your own `candidates` to `composeSession` if you want different proposals). The report's "Risks and notes" names the open decisions (Aramaic filing, lemma spelling across editions, gloss quality, early-life familiarity). Anything else: the tests in `test/goreview-ecclesia` are the specification by example — run them, change an input, watch what moves.
