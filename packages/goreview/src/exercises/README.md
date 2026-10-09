# GoReview assessment: exercises, grading, facts

What GoReview asks, how an answer is graded, and what the Repository is told about it. Three directories:

```
src/facts/       createFactsProvider(deps) → FactsProvider      Repository unit + pack manifest + adapter → UnitFacts
src/exercises/   eight builders, validateExercise, evidenceFor   UnitFacts → Exercise → Grading → GoEvent
src/grading/     normalizeAnswer, gradeTyped/Choice/Self, ratingFor
```

Imports: the Repository contract, GoListen's contracts and assessment helpers, the language packs, `../types`. Nothing else.
Tests: `test/goreview/exercises/` (real Albanian pack, adapter and dictionary; a fake Repository built from the real resolver).

## No sentence from a commercial book, ever

An exercise sentence comes from exactly two places, both owner-authored and machine-drafted: the pack's validation cases
(`source: 'pack-validation'`) and the pack's tutorial passage / example sentences (`'pack-tutorial'`). `'original'` is the
third value the type allows and nothing produces it yet. `validateExercise` refuses any other source, and refuses a sentence
that does not hold its surface at its offsets. An event payload never carries a sentence (a hash would be allowed; none is
needed), only ids, option labels the pack wrote, and flags.

## Facts

`createFactsProvider({ unit, pack: { manifest, runtime }, adapter, tutorial?, constructionPatterns?, now? })`.

| unit | what the facts hold |
|---|---|
| `lemma:` | lemma, pos, word-list gloss (the adapter's reading of the lemma itself), dictionary senses of the same part of speech (with attribution), sibling forms (every form of the lemma in the pack sentences, `conflicted` ones left out), sentences with offsets, the Repository construction id of each form |
| `form:` | features, lemma (the `form-of` relation), `morph:<lang>:<POS>:<featureKey>` built with `unitIds.morph` + `unitIds.featureKey` exactly as the Repository does, per-feature explanations, the matching manifest construction (label and explanation), sibling forms, sentences |
| `morph:` | label and explanation from the manifest (matched on feature pattern, see `SQ_CONSTRUCTION_PATTERNS`), the forms realising it in the sentences |
| `phrase:` | display, gloss and kind from the adapter's phrase rules over the sentences, the sentence span |

`status` is the Repository unit's own status. Only when the Repository does not hold the unit is a status derived
(`statusOf`), and then the facts say so (`derivedFromPack`, provenance ref `goreview-facts:pack-derived`). A lemma's derived
status compares it with readings of OTHER words only. The dictionary is asked with the lemma's part of speech and a sense of
another part of speech is dropped (çaj "tea" is not çaj "to split"). Attribution is set only when a dictionary sense that
is not already a word-list gloss is taken. Nothing is invented: absent facts stay absent and builders refuse.

`ReviewFacts` (`facts/review-facts.ts`) is a structural extension of `UnitFacts` with optional extras: per-sentence
readings with status, per-form status, the pack's feature vocabulary, the adapter's description of the features, whether the
lemma is a word-list entry, the unit's provenance source. See "Gaps in types.ts".

## Families

Every builder has `canBuild`, `build` (returns `{ unavailable: true, reason }` rather than a weak exercise) and `grade`.
Eligibility is the Repository engine's rule, restated: verified and high-confidence support every family; provisional
supports recognition families only, with a caveat; conflicted and invalidated support nothing.

| family | dimension | shown → asked | target | requires | response |
|---|---|---|---|---|---|
| `written-recognition` | written-recognition | the form → its meaning | lexeme, form | not conflicted/invalidated (provisional ok, caveat); a gloss | typed-or-self (glosses and their parts accepted); `choice` when `ctx.pool` gives three distractors that share no word with the answer |
| `meaning-to-form` | meaning-to-target-retrieval | the meaning → the form | lexeme, form | high-confidence/verified; a concise gloss; for a form, its feature description | typed; lemma accepted, for a form the form (+ same-feature siblings), the lemma is `partial` |
| `morphological-identification` | morphological-analysis | a form in its sentence → ONE feature, or its lemma | form | high-confidence/verified and a pack sentence that reads the form as the unit says | choice among the pack's values for the feature; or typed lemma |
| `grammar-application` | construction-understanding | a sentence with a gap → the form of the lemma that has the named value | lexeme, form, morph-construction | high-confidence/verified; a trusted reading in a pack sentence; at least two forms of the lemma in the pack sentences, one differing in a feature the pack can name | choice |
| `phrase-comprehension` | phrase-comprehension | a multiword unit in its sentence → its meaning | multiword | not conflicted/invalidated; phrase gloss; a pack sentence | typed-or-self |
| `sentence-completion` | productive-recall | a sentence with the word removed, cued by the meaning → the word | lexeme, form | high-confidence/verified; a trusted reading in a pack sentence that does not leak the answer | typed |
| `audio-to-meaning` | auditory-recognition | audio (written form hidden) → meaning | lexeme, form | as written-recognition; an `AssessmentSource` stimulus | typed-or-self |
| `audio-transcription` | auditory-transcription | audio (written form hidden) → the typed form | lexeme, form | not conflicted/invalidated; a stimulus | typed |

### Refusal rules (each is a `reason` string, never a weaker exercise)

* Wrong unit, language, or dimension for the family; a unit kind the family does not take.
* `conflicted` or `invalidated` anywhere: `analysis conflicted: sources disagree`, `analysis invalidated`,
  `every analysis of this form is invalidated`.
* `provisional` for a grammar or productive family: `provisional analysis; no authoritative grammar question` (or
  `… production question`).
* THE ONE EXCEPTION (morphological-identification): a `provisional` form whose unit was produced by the word-form rules
  (provenance source `rule`) and whose lemma is a word-list entry (`lemmaInWordList`) may be asked for its LEMMA only. Its
  features are rule guesses and are never asked or stated; the lemma is vouched for by the word list. The exercise carries the
  caveat and the tag `exception:provisional-rule-lemma-only`; `validateExercise` accepts a provisional grammar-family
  exercise only in exactly that shape; its evidence is a recognition card, not a grammar assessment.
* A feature that is a union (`Nom,Acc`) is never asked. No sentence, or a sentence that reads the target differently from the
  unit, or one that still contains the answer: refused.
* grammar-application with fewer than two forms of the lemma in the pack sentences: `fewer than two forms of the lemma appear
  in the pack's sentences, so there is nothing to choose between`. The question names the wanted value ("definiteness:
  indefinite") because the pack has no parser and cannot prove a different form wrong in the sentence; naming the value makes
  the answer unique.
* Audio: no source, the source says unavailable or throws, a stimulus that does not hide its answer or is for another
  language. A synthetic voice is allowed (practice) and the exercise says so in its caveats.

### validateExercise

Non-empty instruction, id, explanation and at least one accepted answer; the stimulus never equals the answer (meaning
questions, loose comparison); audio families list the written form (and any meaning) in `hiddenBeforeAnswer`, declare the
stimulus answer-hidden, and do not name the word in the instruction; eligibility consistent with the status (above); sentence
source allowed, surface at its offsets, gap sentence matches the offsets and has exactly one gap and does not leak; choice
questions have distinct options containing exactly one correct answer; the dimension and response mode belong to the family.
Builders run it on every exercise and return `unavailable` if it fails; `exercise.validation` records the result.

## Grading (`src/grading`)

`normalizeAnswer(s, mode)`: NFC, curly apostrophes straightened, whitespace collapsed, lower-cased, surrounding punctuation
stripped. `loose` also folds ë→e and ç→c.

`gradeTyped(key, response)`:

1. exact after normalisation against any accepted answer → `correct` (confidence 1);
2. loose keys: the accepted answer without its leading article (`i bukur` ← `bukur`, `to read` ← `read`) → `correct` (0.9);
3. the answer is in `key.alternatives` (right for another sense) → `ambiguous` (0.5), not counted either way;
4. loose keys: equal only after the ë/ç fold → `partial` (0.7) — never `correct`;
5. `key.partial` (the lemma for a form question) → `partial` (0.6);
6. otherwise `incorrect` (0.95; 0.7 for an open-ended meaning question, whose accepted glosses cannot be complete);
7. empty or without a letter → `unable-to-grade`.

`gradeChoice` (a choice that is not one of the options is `unable-to-grade`), `gradeSelf` (again→incorrect, hard→partial,
good/easy→correct, confidence 0.6), `gradeResponse(exercise, response)` (by response mode; invalid exercises and failed audio
are `invalid-question`). The explanation of every outcome is the key's own explanation, written from the pack's feature and
construction explanations.

`ratingFor(grading, response)`: challenged, audioFailed, ambiguous, invalid-question, unable-to-grade → `null`; incorrect → 1;
partial → 2; correct → 2 when hinted, 4 when self-graded easy, else 3.

## Evidence (`evidenceFor`)

`evidenceFor(exercise, { response, grading, rating, scoring? }, { learnerId, enrolmentId, deviceId, itemId }, now, { latencyMs?, difficulty? })`
(and the single-object form the session runner's `GradingPort` uses). Producer `gopractice-review`, `subject.cardId = itemId`,
`itemIds = [unitId]` (+ the construction id for grammar events), deterministic `id` and `dedupeKey`
(`review:<itemId>:<exerciseId>:<now>`), so a retry is the same event.

| result | event |
|---|---|
| written-recognition, phrase-comprehension | `CardReviewed` `cardKind: 'recognition'` |
| meaning-to-form | `CardReviewed` `'recall'` |
| sentence-completion | `CardReviewed` `'cloze'` |
| morphological-identification, grammar-application | `AssessmentAnswered { constructionId, task: 'interpret' | 'choose-form' }` (+ `answer`/`expected` option labels for choices) |
| lemma-only question on a provisional form | `CardReviewed` `'recognition'` (no construction is vouched for, none is credited) |
| audio families, audio-only and the audio played | `ListeningAssessed` via GoListen's `listeningAssessedPayload`, `answerShownBefore: false`, `assessmentEvidence(meta)` |
| audio families, written form shown first or audio never played | `CardReviewed` `'recognition'`, `answerShownBefore` stated, `quality: 'none'` |

Common payload fields: `grade` (cards), `correct` (only `correct`; a `partial` is `false` with grade `hard`), `hinted`,
`rating` (omitted when null), `outcome`, `family`, `exerciseId`, `assessmentDimension`, optional `latencyMs`/`difficulty`.

Quality: typed `moderate`; choice, self-grade `weak` (self-grade `sourceReliability` 0.6); a hint or a `provisional` target caps
it at `weak`; listening quality is GoListen's (`assessmentEvidence`: none unless a reviewed recording), also capped by
provisional. Quality `none` for a challenged answer, a synthetic or unreviewed stimulus (the stimulus's own validity can lower
the scoring metadata and is never raised by it), and the not-audio-only cases. `null` (no event) when the question was invalid,
the answer could not be graded or was ambiguous, or the audio failed (`audioPlayed: false` is "not played"; `undefined` is
taken as played, as the session runner does).

## Gaps in types.ts (reported, not edited)

* `UnitFacts` has no per-form status, per-sentence reading, feature vocabulary or provenance, so `ReviewFacts` extends it
  structurally. Suggest folding `exampleReadings`, `formGroups`, `featureDefs`, `lemmaInWordList`, `source`, `lexiconGlossCount`
  and `morphDescription` into `UnitFacts`.
* `AnswerKey` has no alternatives (other senses), near misses or article list, so `GradingKey` extends it.
* `Exercise` carries no sentence offsets, so `ReviewExercise.context` does.
* `ExampleSentence` carries no translation; the pack's passage glosses are not exposed.
* `ReviewResult.scoring` is a superset of `ScoringMetadata`; `evidenceFor` reads only the four `ScoringMetadata` fields.
