# GoTell engine — analysis, corrections, graduated assistance, authorship

`packages/gotell/src/engine` (and the legacy helpers it stands on, `../salvage`) turn a learner's draft into a `DraftAnalysis`, offer help one
small step at a time, and judge how each sentence came to be. It imports the repository contract, the language packs and the sync client
only. It reaches a language through the pack runtime (`runtime.analyzer().adapter`), never through `src/adapters`, `src/core` or the legacy
`src/gotell`. No DOM, no store, no network, no clock of its own (`now` is injected).

The learner's text is the artefact. Nothing here edits it, replaces it, or applies a correction.

## The pipeline (`analyze.ts`, `createAnalyzer(...).analyzeDraft`)

| # | Step | Where |
|---|---|---|
| 1 | Preserve the text; hash it (FNV-1a 64 over UTF-8, same function as the extension's `fnv1a64`) | `hashText` (`text.ts`), `DraftAnalysis.textHash` |
| 2 | Split sentences with the pack's analyser (the adapter's `segmentSentences`, else the browser's segmenter) | `Analyzer.segment` |
| 3 | Tokenise and analyse each sentence; unit ids as the extension's parser derives them (`lemma:sq:<lemma>:<POS>` for a creditable lemma — confidence ≥ 0.5, not `unconfirmed` — else `form:sq:<normalised>`) | `unitIdAt` |
| 4 | Familiarity: share of word tokens among `profile.productive ∪ profile.recognisedOnly` | `SentenceAnalysis.familiarity` |
| 5 | Check: the adapter's `checkProduction` is the **only** source of issues. An empty result is no issues | `detectParsed` |
| 6 | Classify (table below); doubt downgrades, never upgrades | `classOfCategory`, `analyzeSentence` |
| 7 | Explain: `hint` (Level 2, the *type* of problem, one line, from the pack feature/construction text) and `explanation` (Level 4, the pack's fuller text) | `packText` |
| 8 | Repair: the checker's replacements become corrections — one combined when every issue has a non-overlapping replacement, else one per issue | `planRepairs` (salvage) |
| 9 | Validate each correction: checker re-run (`checkerClean`), `addsOnlyWithinSpans`, `meaningChange` | `Analyzer.validateRewrite` |
| 10 | Report what the checker cannot see, on every sentence; `analysisStatus` from the pack's `statusOf` | `checkerCoverage` (salvage), `coverageLine` |

### Issue classes

| Checker category | Class |
|---|---|
| spelling, morphology, conjugation, agreement, case, syntax, word-order, missing-function-word, definiteness, particle, postposition, classifier, segmentation | `grammatically-wrong` |
| ambiguity, clarity, meaning-change | `semantically-unclear` |
| collocation, idiomaticity, lexical-choice | `acceptable-but-awkward` |
| dialect | `regional-variation` |
| register | `register-difference` |
| any category this table does not know | `uncertain-analysis` |
| **any** finding with confidence < 0.5 after the analysis is applied | `uncertain-analysis` |

`stylistic-alternative` exists in the contract; no checker produces it, so the engine never does.

Doubt about the analysis. A finding's confidence is capped at 0.45 (so it becomes `uncertain-analysis`) when a **content word the issue is about**
has no reading, only an `unconfirmed` reading (a guess by ending), or two close competing readings (`statusOf` = `conflicted`). Closed-class
words (POS in the function set, and every form the pack lists in `grammar.clitics`) are exempt: the checker already reads an article or
particle against its neighbours, and the analyser reads the article *e* as an adjective when it stands alone. **Deviation from the brief:**
`provisional` alone does not downgrade. The Repository's rule keeps every form made by a word-form rule at `provisional` however sure the
adapter is, so downgrading on it would make every inflection error "uncertain". `provisional` + `unconfirmed` does downgrade.

## The ladder (`assist.ts`, `createAssistance`)

| Level | Shows | Source |
|---|---|---|
| 1 identify | `Possible problem at “libër”: definiteness.` — place and kind; a note when the class is not `grammatically-wrong`. No fix | checker |
| 2 hint | the issue's `hint`: the pack's description of the type | pack grammar |
| 3 targeted | the word/inflection to look at; the checker's replacement is **named, not applied**; else the pack's text for the construction; plus the adapter's reading of the word | checker / pack grammar |
| 4 correction | `Revised sentence: “…”`, why, the **meaning check** when there is one, whether the checker is satisfied, and "this is a proposal" | checker |
| 5 alternatives | variants and register notes the pack knows; else "No alternative is known to this pack" | checker / none |
| 6 model | **only when `req.level === 6`**: (a) the learner's own earlier independent sentence (`ctx.ownSentence`, or a prior step with that source), (b) a pack sentence that contains the units, is clean under the checker and is not the learner's sentence, (c) a remote proposal if `consent.remoteAssistance()` and a provider exists. Otherwise refused: *"no model expression is available without a remote assistant; nothing was sent"* | own / pack / remote |

Monotone per request: asking for level N reveals 1..N. `through(analysis, req, prior, ctx)` returns **every** step the request reveals that is
not already in `prior` (so the caller can record all of them); `step(...)` returns the last, with `revealedUnitIds` accumulated over the
prior steps and the steps below it. A refusal reveals nothing, not even the lower levels. `prior` is the list of steps already shown for
this issue of this sentence (a step carries no issue reference). `step`/`through` are `async` because the remote port is.

## The meaning-change rule

A correction is checked against the learner's sentence for **negation, time words, key terms and tense** (`salvage/meaning.ts`, from the legacy
engine; data in `salvage/concepts.ts`). Any difference becomes a sentence in `Correction.meaningChange`. Such a correction is **kept and
flagged**: Level 4 prints it next to the revised sentence ("it will not be applied automatically"). Checker-clean and meaning-changing are
independent questions: the real Albanian checker turns *të nuk shkoj* into *të mos shkoj*, which is checker-clean **and** flagged
("Changes the negation: nuk becomes mos"). The comparisons are string/analysis comparisons, not understanding; a language with no table is
silent (and says nothing it does not know).

Never add content: a correction's `addsOnlyWithinSpans` is false when the text outside the edited spans is not the learner's own, or when the
suggestion adds more content words than it removes. A remote proposal is held to a stricter test (no content word unrelated to the learner's
words at all), the checker must be silent on it, and its meaning changes are flagged.

## Authorship (`authorship.ts`)

`judgeAuthorship(text, steps, history)` → `independent` (no step; the learner's own sentence shown back is not help) · `after-hint` (only
levels 1–3) · `revised-after-feedback` (4/5/6 shown, text not a copy) · `copied-from-model` (equals a shown correction or model after NFC,
case, quotes, spacing and edge punctuation; letters are never folded, ë ≠ e) · `ai-generated` (equals a remote proposal). `reproduced-later`
is the documents module's: it uses `isReproducedLater(current, earlierVersions)` ("is this the same sentence as one that was assisted
before?"; the caller has established that no help was shown this time). `history.previous` is accepted for the caller's convenience and does
not change a judgement.

**Per sentence.** Every `AssistanceStep` records the sentence it was shown for: `sentenceIndex` (0-based, in the analysed text) and
`sentenceHash` (`sentenceScopeHash`: the hash of the sentence's comparison form). `judgeAuthorship(text, steps, { sentenceIndex })` and
`judgeFromAssistance` (documents) count only the steps that touched THIS sentence (`stepsForSentence`: same index, or same sentence hash if
sentences were inserted above it). A sentence no step touched stays `independent`, however much help its neighbour had. A step with neither
field (a legacy record, a hand-made step) is taken to touch every sentence (the old whole-round rule: it never over-credits). Copying is
judged across all steps: text equal to a shown correction or model is `copied-from-model` wherever it lands. Known limit: if the learner
deletes a hinted sentence and a different one moves into its position, that one is judged by position (after-hint), not independent.

## What the checker cannot see

Stated on every sentence (`checkerCoverage`, and the same statement in parts as `coverageParts`: a headline and one entry per limit the adapter declares), from the adapter's own `support` record. The screens do not print the whole list: `summariseCoverage` (`coverage.ts`) turns it into one line ("Checked: definiteness, case, agreement, conjugation, particles. Not checked: 8 other areas — see details.") and the full headline and limits go in a collapsed "details" element. The checked areas are a short hand-kept table (`CHECKED_AREAS`, one list per language, each entry pinned by a test against the real checker); a language not in the table says the list is not recorded. For Albanian (adapter-sq@9): production checks are
"limited": rules for the commonest learner errors, each firing only on its own unambiguous shape. Measured misses (2026-10-09, pinned in the engine tests): *Unë lexoj librin dhe ti lexoj librin* (a subject pronoun after *dhe* is not checked against its verb), *Ana është e mirë dhe Mira është i mirë* (predicate agreement), *Unë lexoj libri* (an object in the nominative without a preposition), *Unë dua një libri* (a definite noun after *një*). No idiomaticity,
tense/mood choice, genitive chains or old spelling. A language whose pack has only the browser's segmenter gets sentences and tokens, no
issues, and "Nothing in this sentence was checked". A checker that throws yields no issues and says the sentence was not checked. **No
issue is ever invented; "nothing detected" is never "correct".**

## The remote port

`RemoteAssistant` is a type. **Nothing is wired.** Level 6 reaches it only when the learner has consented (`ConsentGate.remoteAssistance()` returning the boolean `true` — a truthy string, number, object or Promise is not consent; the gate in `privacy/` holds to the same rule),
a provider is passed in, and no learner/pack model exists. What is sent: `{ languageId, sentence, intendedMeaning? }` — the learner's
sentence, only after consent. What is shown: only a proposal that passes shape validation (`salvage/remote.ts`, from the legacy interpreter
validator), the checker and the never-add-content rule; labelled `source: 'remote-assistant'`, `review: 'unreviewed'`. A provider that fails
or times out gives a refusal and shows nothing.

## Tests

`test/gotell-engine/` (real Albanian pack runtime): analyse, corrections, assist, authorship, salvage, boundary.
