# The Thai course — design

The Thai course teaches Thai by having the learner read increasingly difficult **native Thai** while the system
supplies only the help needed at that moment and records what happened. It is the first course with a reading
ladder; nothing here is Thai-only in the architecture except the adapter (`src/adapters/th.ts`,
`src/adapters/thai/**`) and the ladder data (`src/course/thai.ts`).

> GoLearn succeeds when the learner eventually stops noticing GoLearn.

Status words are used as in `docs/READINESS.md`: **implemented**, **verified**, **awaiting external input**.
This document describes the design; READINESS records what is actually true.

## 1. Model: Course → Stage → Work → Chapter → Paragraph → Sentence → Phrase → Token

| Level | Record | Where |
|---|---|---|
| Course | `Course` (`thailand-th`) | `core/config.ts` |
| Stage | `Stage` — Stage 0, Grades 1–9, Open reading. Internal bands, **not** school years | `core/course.ts`, data in `src/course/thai.ts` |
| Work | `Work` — a curriculum entry with role (spine / subsidiary / nonfiction / extensive / audio) and `WorkRights` | same |
| Chapter | a `Text` with `workId` + `chapter` | importer |
| Paragraph, Sentence, Token, Phrase, Pattern | existing model, unchanged | `core/model.ts` |
| Note | `ContentNote` — cultural, regional, register, literary, historical, clause-structure | `core/course.ts` |

A work listed in the ladder is a **recommendation**. It becomes readable only when texts for it are imported.

## 2. Canonical text and rights

- The source text is never rewritten, simplified, re-spaced or "corrected". Help is layered over it. A simplified
  edition can exist only as a separately supplied text that says so.
- **Rights are recorded, never assumed.** Every work in `src/course/thai.ts` is `canBundle: false`,
  `userImportOnly: true`, `verified: false`, `bibliographyVerified: false`. `copyrightStatus` is `in-copyright`
  (presumed, modern works) or `unknown`; nothing is marked public domain. A `basis` is a lead for verification.
- **Personal copies.** A learner who holds a copy of a book he is entitled to use can import its text
  (`source.rights: "personal-copy"`, `authorship: "published"`). It is readable on that device, labelled
  "Your copy", written under `data/private/` by the converter (git-ignored), never bundled, never part of the
  shipped corpus. No native review is required (it is a published native work); the transcription is labelled
  unchecked until someone reviews it. Generated text and Scripture can never be personal copies.
- Bundling any work requires a recorded licence or an established public-domain status with its basis — then
  `rights.verified` and `canBundle` are set by a person, in data.

## 3. The Bible corpus

Scripture is a second, continuous corpus outside the numbered ladder (`THAI_OUTSIDE_LADDER`): available from the
beginning, sharing the same learner model and item ids, so a word met in Scripture counts in a novel and the
reverse. It takes the assistance profile of the stage the learner is working at. It is single-language (Thai
with English rescue), exact, verified against its source, never generated — the existing Scripture gate applies
unchanged. **Policy (2026-10-01, `THAI_SCRIPTURE_POLICY`):** THSV11 was declined by its rights holder and is never
stored, shown, analysed, packaged or played in the app (external link only, never listening evidence); the Biblica
Open Thai Common Version 2025 is a candidate whose licence must be verified from the release metadata before
anything is ingested; a draft translation may enter only as a labelled technical fixture that the gate never
publishes; English rescue is the World English Bible.

## 4. Thai analysis

| Layer | Source | Honest limit |
|---|---|---|
| Word segmentation | ICU dictionary (`Intl.Segmenter('th')`) + course compound list | not measured on real prose yet; unlisted compounds may split |
| Reading units ("sentences") | newline, double space, terminal punctuation, final particle + space; long prose spans are divided at clause spaces by rule | Thai has no sentence mark: a unit is a reading unit, not a grammarian's sentence |
| Syllable + tone decoding | rule engine (`src/adapters/thai/orthography.ts`): consonant class, vowel, length, final, live/dead, tone mark → tone, with the rule stated | never guesses silently: ambiguous spellings get low confidence or no tone; irregular words need the exception list or a dictionary pronunciation |
| Dictionary | built offline from a licensed source into shards (`npm run dict:build`), read through `LexiconSource`; a separately sourced, attributed layer that stands beside the hand lexicon and never replaces it; disagreements are recorded for review (`npm run dict:compare`) | senses are not disambiguated by context; no frequency data |
| Function words, particles, classifiers, discourse markers | hand lexicon with a `role` each | machine-drafted, not native-reviewed |
| Phrase units (ไปหา …) and constructions (กำลัง + VERB …) | adapter phrase rules and pattern detectors | listed patterns only |
| Register / variety | `RegisterTag` on analyses and works; non-standard forms are shown as such | tags come from the hand lexicon, the dictionary's labels and reviewer notes |
| Omitted subjects, implication, literary devices | notes (`ContentNote`) written by a person | not detected automatically |

Pronunciation data order of authority: an author-supplied decoding, then the dictionary's phonemic respelling and
IPA, then the spelling rules (`decodeFor` in `core/adapters.ts`). Decodings are computed on demand, not stored
per token.

## 5. Assistance that removes itself

Each stage carries an `AssistanceProfile` (data, `THAI_ASSISTANCE`): which help layers the word sheet offers and
in what order, how close English is, whether romanization exists, how much chrome the reader shows.

| Stage | Visibility | First help | English | Romanization | Chrome |
|---|---|---|---|---|---|
| 0 | heavy | gloss with decoding | easy | rescue only | full |
| 1–2 | heavy | gloss, phrase, grammar | easy | never | full |
| 3–4 | contextual | gloss, phrase, Thai definition where one exists | secondary | never | full → reduced |
| 5 | light | same, notes appear | secondary | never | reduced |
| 6–8 | clean | gloss, notes, clause structure | deep | never | reduced → minimal |
| 9, open | invisible | gloss, own history | on request | never | minimal |

Help never disappears; it moves deeper. English rescue is in every profile. Romanization exists only as a
Stage 0 rescue, is never shown by default, and its use is recorded so dependence is visible.

Evidence: opening a layer emits the existing help events (`LAYER_ASSISTANCE_LEVEL`). Decoding is help with the
written form (`DecodingRevealed`). Notes are context (`NoteOpened`, no evidence effect), except a
clause-structure note, which is a sentence explanation. Looking at one's own history is not help.

## 6. Learner model

Items: `form`, `lemma`, `phrase`, `pattern` as before, plus `orth` — writing-system items (consonant class,
vowel pattern, tone mark, tone rule) so that script acquisition is measured by the same evidence policy.

| Question | Answer in the system |
|---|---|
| Where did I meet this word? | `GoLearn.itemHistory` — first text / work / chapter, count by text, reading / listening / production status; pronunciation is "not measured" |
| How hard is this chapter for me? | `GoLearn.predictDifficulty` — predicted coverage, new useful words, rare words, weak phrases, new constructions, proper nouns, varieties, unanalysed words, and `limits`. Optional preview, **never a gate** |
| Am I ready for the next stage? | `GoLearn.stageReadiness` — lexical coverage, lookup rate, sentence-rescue rate, reported comprehension, pace trend, unfamiliar material, retention, decoding (Stage 0), listening (when real speech exists). Advice only; finishing a book is never sufficient; thresholds are provisional policy |
| Am I getting faster? | `GoLearn.readingPace` — from recorded dwell, lookups and rescues. Quiet; never a score or a target |

No flashcard mode. Exposure is not comprehension (policy unchanged). Recommendations after Grade 9 use the same
forecast over whatever texts are imported (the `open` stage has no grade numbers).

## 7. Notes

Concise, attached to a place in the text, written or reviewed by a person: cultural (kinship, Buddhism, food,
school life, Chinese-Thai life), regional (Isan, southern, Teochew — always marked as such, never presented as
ordinary Central Thai), register, literary, historical, clause-structure (labelled spans over the sentence's own
words — the sentence is never rewritten). Political and social content in the novels is reading material; notes
explain references and never argue a position.

## 8. GoListen, GoTell, My Testimony

**GoListen is deferred to V2** (course owner, 2026-10-01) and switched off by `FEATURES.listen`: no audio
interface, no speech request, no statement about listening; the `audio` works stay in the ladder data but are not
shown. When it returns, listening counts only for reviewed real speech, a recording is bound to the exact text
release it reads, and audio rights are tracked separately from text rights. GoTell continues to constrain
production to what the learner has met and never writes the testimony for him.

## 9. Not in this foundation

Sense disambiguation; automatic detection of omitted subjects and literary devices; a Thai–Thai learner's
dictionary (`definition` is carried when supplied, there is no source yet); frequency data (the candidate
dictionary source has none — the forecast says so in `limits`); measured segmentation accuracy; any real text of
the ladder; a Thai Bible; real speech.
