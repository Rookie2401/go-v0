# The German course — architecture note

Thai taught the system that spaces do not define words. German teaches the inverse: **a written word is not always a
lexical word.** `steht … auf` is one verb in two places; `im` is two words in one; `Lebensversicherung` is one word
with three parts; `guten` is one form with more than twenty possible meanings until its neighbours speak. The German
course is built on the same text-first architecture as Thai and Spanish — text → word → lexical unit → morphology →
phrase and construction → sentence explanation → English rescue — with a linguistic layer that fits German.

Target: modern Standard German of Germany (de-DE). Status words as in `docs/READINESS.md`; what is actually built is
in `docs/german/STATUS.md`, rights in `docs/german/RIGHTS.md`, the brief and package ownership in `docs/PLAN11.md`.

## 1. What is shared and unchanged

| Need | Existing part |
|---|---|
| Exact canonical text, versions, publication gate, personal copies, EPUB / text import, source quality check | `src/ingest` |
| One learner model across stories, Scripture, testimony and the learner's own books | `src/golearn`: items `form:de:…`, `lemma:de:…`, `phrase:de:…`, `pattern:de:…` |
| Layered help; exposure is not comprehension; estimated familiarity; flat cost per sentence view | reader, evidence policy |
| Analysis provenance (rule / hand / dictionary / corpus / reviewed); the dictionary as a separate layer that decides what the rules only guess | contracts v6 and v8 |
| Streams, shelves that are not locks, rights states, doors, the library that never loads whole, personal difficulty, ranking | Spanish course (contract v7) |
| Scripture with identity, verification and English rescue | `scripts/verify-scripture.mjs`, the Scripture surface |
| Testimony writing with honest, rule-based checks | `src/gotell` + the adapter's `checkProduction` |

Nothing German-only was added to these. German knowledge lives behind the adapter (`src/adapters/de.ts`,
`src/adapters/german/**`) and in data (`src/course/german.ts`).

## 2. What German added to the shared model (contract v9)

| Addition | Why | Where |
|---|---|---|
| **Lexical units written as several words** | `Ich stehe früh auf`: both pieces carry the lemma aufstehen; the encounter is counted once, on the verb; the reader marks the pieces as belonging together | `AnalysisCandidate.unit`, `TokenAnalysis.unit` (`UnitLink`), GoLearn `creditableLemmaId` |
| **Parts with a kind** | compound components, the head and the linking element (`Leben` + `-s-` + `Versicherung`); a contraction (`im` = in + dem); a prefix written on and the inserted `zu` / `ge` (`aufzustehen`, `aufgestanden`) | `WordPart.kind` |
| **Older spelling as a relation** | `daß` → dass, `thun` → tun: the text is never rewritten; search and the word sheet relate the two | `OrthographyRelation` on candidates and analyses |
| **Rights evidence** | the exact source, jurisdictions, licence, checksum, proofreading state, what was modified, whether the app complies | `WorkRights` evidence fields, `RightsState 'permission-granted'`, `Work.readiness`, `Work.pipeline` |
| **Difficulty that knows German** | compounds made of known words, the distance across the verb bracket, genitives, passives, relative clauses, participial modifiers, older spelling | `TextFeatures`, `TextProfile.compounds`, `PersonalDifficulty` factors, `ProfileScore.compounds` |

All are optional fields; a language that does not use them is unaffected. A periphrastic tense (`ist gegangen`,
`würde gehen`, `wird gebaut`) is deliberately **not** a unit: the participle or infinitive carries its own lemma, the
auxiliary keeps its own with a plain-words role, and the whole is a construction the learner model tracks.

## 3. The adapter

```
lexicon rows — the facts of each word: gender, genitive, plural; principal parts, auxiliary, separable prefix
      │
word-form engine — every context-free reading of a written word, with ALL its case / gender / number possibilities
      │
sentence layer — agreement inside the noun phrase, what a preposition governs, capital letters,
                 separated verbs put together, compounds taken apart, readings ordered by their neighbours
      │
constructions and phrase units · checks on the learner's own German · older spelling · dictionary labels
```

- **Sets, not guesses.** `guten` is reported with every possibility; `den guten Mann` narrows it to masculine
  accusative singular, weak declension; `Die Frau sieht die Tochter` stays "nominative or accusative" for both nouns,
  because nothing in the sentence decides it.
- **Separable verbs.** A stranded prefix joins its verb only when the joined verb is a known word. For the prefixes
  that are sometimes separable and sometimes not (um, über, durch, unter, wieder), only the lexicon decides:
  `Er fährt das Kind um` and `Er umfährt die Baustelle` are two listed verbs.
- **Compounds.** A compound in the lexicon keeps its own lemma and meaning, with its parts beside it. One that is not
  listed is taken apart only into known words, with the linking element named separately and the head deciding the
  gender; nothing is split arbitrarily, and a compound of known parts is never silently counted as a known word.
- **Honest standing.** Every word list is machine-drafted. A reading for a word outside the lexicon is marked
  unconfirmed until a dictionary confirms it.

## 4. Streams

`acquisition` (controlled modern German written for the course) · `conversation` (dialogues, with the modal
particles) · `library` (the literary ladder on shelves 1–12 and open reading) · `germany` (Germany as reading) ·
`knowledge` (nonfiction by domain) · `scripture` · `mission` · `personal` (the learner's own books) · `listening`
(data only; switched off with GoListen).

## 5. Scripture

Baseline: the Lutherbibel of 1912 from eBible.org, public domain as stated by the distributor, taken verse by verse
by script and verified by an independent extraction. German text with English rescue (World English Bible); no
parallel-Bible interface. Its spelling (`daß`, `muß`) and vocabulary (`ward`) are related to today's German in the
analysis. Biblical words are ordinary lemma items: `Gnade` met in Scripture is `Gnade` everywhere.

## 6. What the first pass does not do

It does not ingest literature at scale, install a dictionary (permission for the download is outstanding), run a
statistical parser, or attach audio. The first-party texts are machine-drafted and stay in preview until reviewed.
