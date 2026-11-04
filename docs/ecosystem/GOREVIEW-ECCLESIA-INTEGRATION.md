# GoReview Ecclesia — Integration guide

For the engineer or agent building the Ecclesia library's interface. The package is headless; you design every screen. This guide says what to call, what to implement, and what never to do. Architecture and rationale: [GOREVIEW-ECCLESIA-ARCHITECTURE.md](GOREVIEW-ECCLESIA-ARCHITECTURE.md).

One import:

```ts
import * as Ecclesia from 'packages/goreview-ecclesia/src';   // or the barrel's relative path
```

## 0. The five things you implement

| You provide | Type | Notes |
| --- | --- | --- |
| Tokenised passages | `PassageTokens { language, ref, verses: [{ verse, tokens: EcclesiaToken[] }] }` | From your corpus and analysis. `EcclesiaToken { index, surface, lemma, pos (UD), features?, status? }`. Lemmas as your edition spells them (Greek accented, Hebrew pointed, Latin as printed). |
| A lexicon | `EcclesiaLexicon { lexeme(id), form(id), distractorPool?(language, limit) }` | Glosses short (≤ 4 words each, no brackets) — they are the accepted answers. Give an `attribution`. |
| An identity | `ReaderIdentity { learnerId, enrolmentId, deviceId }` | One enrolment per Ecclesia language (`profile.repository.languageId` + `varietyId`), made through the Repository API as Biblia does (`packages/biblia/src/repo.ts`). |
| A sink | `EncounterSink { record(events) }` | Your device queue or the Repository API; it must persist before it resolves. The Repository is idempotent on event id and `dedupeKey`. |
| Encounter ids and a clock | `encounterId` per observation, `at` ISO instants | A UUID or `<readingSessionId>:<n>`. Never reuse an id for different content. |

Optional: a `CorpusFrequencyProvider` (`frequencyTable` / `frequencyFromPassages` over your corpus), a `KeyValueArea` for in-progress sessions, a `Scheduler` other than the default FSRS.

## 1. Choose the language

```ts
const profile = Ecclesia.profileOf('grc');            // 'he' | 'arc' | 'grc' | 'la'
profile.repository                                      // { languageId: 'el', varietyId: 'el-koi', packId: 'pack:el', packVersion: '1' }
profile.textId                                          // 'SBLGNT' — goes into every Scripture reference
```

Override only when you must (e.g. file Aramaic under the learner's Hebrew enrolment): `Ecclesia.withOverrides(Ecclesia.ARAMAIC, { repository: { languageId: 'he', varietyId: 'arc-bib', packId: 'pack:he', packVersion: '1' } })`.

## 2. Name things (you rarely call these directly, but they define what you will see)

```ts
Ecclesia.unitIdsOf(profile, token)      // { lexeme: 'lemma:el:λόγος:NOUN', form: 'form:el:λόγος', morph?: 'morph:el:NOUN:Case=Nom|Gender=Masc|Number=Sing' }
Ecclesia.cardIdFor(unitId, 'written-recognition')   // 'card:written-recognition:lemma:el:λόγος:NOUN'
Ecclesia.passageKey(ref)                // 'JHN.1.1-18'
Ecclesia.scriptureRef(profile, ref, 3)  // typed ScriptureSourceRef for JHN 1:3, no text
```

Pass surfaces as printed (`λόγος,`, `בְּרֵאשִׁ֖ית`, `Verbum,`): normalisation is the package's job and is idempotent.

## 3. Record what the reader observes

Map, then record (or `recordEncounters` for both):

```ts
const ctx = { profile, identity };
await Ecclesia.recordEncounters([
  { kind: 'passage-viewed',      encounterId: `${rs}:1`, at: now(), passage: ref, verses: passage.verses },
  { kind: 'word-selected',       encounterId: `${rs}:2`, at: now(), passage: ref, verse: 1, token },
  { kind: 'definition-revealed', encounterId: `${rs}:3`, at: now(), passage: ref, verse: 1, token, depth: 'brief' },
  { kind: 'morphology-revealed', encounterId: `${rs}:4`, at: now(), passage: ref, verse: 1, token },
  { kind: 'translation-revealed',encounterId: `${rs}:5`, at: now(), passage: ref, verse: 5, tokens: verse5.tokens },
  { kind: 'context-explained',   encounterId: `${rs}:6`, at: now(), passage: ref, verse: 5, tokens: verse5.tokens },
  { kind: 'passage-completed',   encounterId: `${rs}:7`, at: now(), passage: ref, verses: passage.verses, helpUsed: true },
  { kind: 'word-marked',         encounterId: `${rs}:8`, at: now(), passage: ref, verse: 1, token, mark: 'known' },
], ctx, sink);
```

Rules:

- **When** — `passage-viewed` once per display of a passage (not per scroll); `word-selected` on every tap/hover that opens a card; the `*-revealed` kinds when the layer is actually shown; `passage-completed` when the learner says they are done, with `helpUsed` computed from what you revealed in that passage; `word-marked` when the learner chooses a level (`new | seen | recognized | familiar | known | automatic`) or bookmarks (`saved | ignore`).
- **Retries are free** — the same encounter (same id, same content) maps to the same events; send again after a crash or a sync failure.
- **Never** build `CardReviewed`, `CardAdded`, `AssessmentAnswered` or `ListeningAssessed` yourself: the session runner (§5) does, with the CAS chain and scheduler profile the engine needs.
- The mapper throws on a malformed encounter (bad id, bad instant, verse outside the passage, non-USFM book). Treat a throw as a programming error, not a user error.
- `mapEncounters(...)` without a sink gives you the events to inspect; `EncounterMapping.notes` tells you when nothing was recorded (empty verse, bookmark).

## 4. Show where the learner stands

```ts
const scope = { learnerId: identity.learnerId, languageId: profile.repository.languageId };
const standings = Ecclesia.knowledgeStandings(events, scope);          // Map<unitId, UnitStanding>  — the six levels
const schedules = Ecclesia.cardSchedules(events, scheduler, { ...scope, now: now() }); // CardSchedule[] — FSRS
const overview  = Ecclesia.unitOverview(unitId, standings, schedules); // both, for one word
Ecclesia.levelDistribution(standings)                                  // { new, seen, recognized, familiar, known, automatic }
Ecclesia.passageStandings(profile, passage, standings)                 // level per lexeme of a passage, reading order
Ecclesia.KNOWLEDGE_LEVEL_WORDS                                         // the learner-facing words for each level
```

Show the level as the word's state and the schedule as the card's return; never derive one from the other. `events` is the learner's log for this language (fetch it from the Repository; `scopedEvents` filters a mixed log).

## 5. Run a review session

```ts
const scheduler = Ecclesia.createFsrsScheduler();
const facts = Ecclesia.factsProviderFor(profile, lexicon);

const composed = Ecclesia.composeSession({ profile, identity, events, now: now(), readingContext: passageJustRead, random: Math.random });
composed.plan.items            // what will be asked, in order; each has `why`
composed.plan.skipped          // what was not, and why (never silent)
composed.admitted / declined   // reading-proposed words intake accepted / refused (with reasons)
composed.fromReadingContext    // the planned cards that came from the passage just read

const runner = Ecclesia.createEcclesiaRunner({
  profile, identity, plan: composed.plan, preferences: composed.preferences, facts, scheduler,
  record: sink.record, committedEvents: () => fetchEvents(), persist: yourKeyValueArea, now, random: Math.random,
});
for (;;) {
  const cur = await runner.current();           // null when finished; unbuildable items are skipped with a reason in runner.skips()
  if (!cur) break;
  const card = cur.exercise;                    // prompt.instruction, prompt.options?, responseMode, answerKey (hide until answered)
  // render card; the Scripture context for the word: Ecclesia.contextsOf(cur.planned.item.unitId, events) → show the verse from your corpus
  const grading = await runner.preview(response);   // optional feedback before committing
  const result = await runner.answer(response);     // grades, records CardReviewed (+ CardAdded for a new card), advances
  // result.grading.outcome, result.rating (1..4 | null), result.evidence
}
await runner.finish();
Ecclesia.summarize(runner.state(), runner.skips());
```

`Response` is `{ typed?, choice?, selfGrade?, hinted, assistance: string[], reviewSeconds?, challenged? }`. Set `hinted: true` or list `assistance` when you showed help during the item: the evidence is then weakened honestly. `challenged: true` keeps the answer out of the evidence when the learner disputes the key. `runner.skip()` leaves the card due. `runner.recover(sessionId, events)` resumes an interrupted session from `persist`.

Listening is off for all four languages (no reviewed voice exists); do not pass audio.

## 6. Choose the next passage

```ts
const frequency = Ecclesia.frequencyFromPassages(profile, allPassagesOfYourCorpus, 'sblgnt');   // once, cached
const ranked = Ecclesia.rankPassages(candidates.map((p) => Ecclesia.passageFamiliarity({ profile, passage: p, standings, frequency })));
const best = Ecclesia.nextBestPassage({ profile, passages: candidates, standings, frequency });
best.familiarity.familiarity, .inTargetBand, .reliability, .unknownLexemes (commonest first), .notes
```

Every estimate says `provisional: true` and `heuristic: 'ecclesia-familiarity@provisional-1'`: show the number as an estimate, show the reasons, and let the learner choose. Early on, nothing is `familiar`; pass `policy: { knownFrom: 'recognized' }` (and say so) if you want the reading to count before the learner has repeated recognitions. The default band is 80–90 % (`profile.familiarity`).

## 7. Contextual cards without a session

To show a word's card beside the text, or let the learner add it by hand:

```ts
const card = Ecclesia.contextualCard(profile, token, { ref, verse });      // deterministic cardId + context
const added = Ecclesia.cardAddedEvent(profile, card, identity, now(), 'learner');   // then sink.record([added])
Ecclesia.cardsForPassage(profile, passage)                                  // one card per distinct word
Ecclesia.contextsOf(card.unitId, events)                                    // every place the word was met
```

## 8. Do and don't

- **Do** keep text in your corpus and show it by reference (`card.context.ref`, `contextsOf`). **Don't** put verse text into events, facts or glosses; `validateEvent` will refuse a surface of more than four words, and the facts adapter keeps `exampleSentences` empty on purpose.
- **Do** use one `encounterId` per observation and resend freely. **Don't** mint a new id for a retry (that is a second observation).
- **Do** let `composeSession` decide what is asked. **Don't** hand-pick cards into the plan; pass `readingContext` for preference or your own `candidates` for different proposals.
- **Do** record on the device first (a queue that persists before it resolves) and sync. **Don't** advance a session on a failed record: the runner already refuses to.
- **Do** show `plan.skipped` and `composed.declined` reasons when a learner asks "why not this word".
- **Do** tell the learner that familiarity is provisional.

## 9. Worked example

`test/goreview-ecclesia/greek-vertical-slice.test.ts` is the whole loop over John 1:1–18 with a demo learner and an in-memory Repository store; `test/goreview-ecclesia/fixtures/greek-john.ts` shows a MorphGNT → `EcclesiaToken` decoder and a lexicon from Dodson glosses; `fixtures/four-languages.ts` shows Hebrew (Genesis 1:1), Aramaic (Daniel 2:4b) and Latin (John 1:1–5) tokens and lexicons.
