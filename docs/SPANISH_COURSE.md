# The Spanish course — architecture note

Spanish has the opposite content problem from Thai. Thai needed a constructed ladder; Spanish has a surplus. So
the Spanish course is not a library with a syllabus: it is a **corpus operating system** —

> Spanish universe → analysis → learner model → personalised next text.

The interface stays simple however much text lies underneath. Status words as in `docs/READINESS.md`.

## 1. What already supports Spanish unchanged (inspected before designing)

| Need | Existing part |
|---|---|
| Canonical text, exact preservation, versions, publication gate, personal copies | `src/ingest` (format v2, `personal-copy`, review binding) |
| One learner model across every surface (stories, Scripture, testimony, imported books) | `src/golearn`: items are `form:es:…`, `lemma:es:…`, `phrase:es:…`, `pattern:es:…` — shared by all texts of the language |
| Layered help: word → phrase → grammar → sentence → English | the reader and word sheet, `DEFAULT_ASSISTANCE` |
| Reading / listening / production kept apart | evidence policy (`evidence@6`), dimensions per item |
| Exposure ≠ comprehension, estimated familiarity, incremental fold | policy and fold (flat cost per sentence) |
| Analysis provenance (rule / hand / dictionary / corpus / reviewed), dictionary as a separate layer | contract v6 |
| Works with rights records, catalogue, "Your copy" | `src/course`, `Work` / `WorkRights` |
| Difficulty forecast, weak items, recommendations | `predictDifficulty`, `recommend` |
| Testimony writing with assisted vs independent production | `src/gotell` |

Nothing Spanish-only is added to these. Spanish-specific knowledge lives behind the language adapter
(`src/adapters/es.ts`, `src/adapters/spanish/**`) and in data (`src/course/spanish.ts`).

## 2. What Spanish genuinely adds (contract v7)

| Addition | Why | Where |
|---|---|---|
| **Streams and shelves** | seven content streams sharing one learner model; shelves are an orientation, never a lock | `Stream`, `Stage.kind: 'shelf'`, `Work.streams / domains / variety / era / genre / genericLevel` |
| **Rights state** | one explicit state per work; "unverified" is never shown as public domain | `RightsState`, `WorkRights.state / jurisdiction / canModify / canStoreOffline / canBundleAudio / verifiedBy` |
| **Varieties** | the active target is Honduran / Central American Spanish inside general Latin American Spanish; Spain, other regions and older Spanish are receptive | `core/variety.ts`: `Variety`, `VarietyPolicy` on the course, `varieties` on analyses, `varietyStanding` |
| **Words that are several units** | `decírselo` = decir + se + lo | `WordPart`, `parts` on analyses |
| **Rule morphology** | Spanish inflection is regular enough to analyse any form by rule, with honest confidence | `src/adapters/spanish/morphology.ts` |
| **Inflected-form dictionary data** | a dictionary's form → lemma relations | `DictionaryEntry.formOf` |
| **The library** | a corpus far larger than the device database: index, per-text profile, import on open | `core/contracts/library.ts`, `src/library` |
| **Personal difficulty** | per learner, per text, in words, with its factors and caveats | `PersonalDifficulty`, `GoLearn.scoreProfile`, `rankLibrary` |
| **Source quality report** | flags OCR damage, wrapped lines, boilerplate before import; never silent fixes | `QualityReport` on `Text` |

All of it is language-neutral in shape: Thai, Hindi, German and Albanian can use streams, varieties, the library
and personal difficulty without change.

## 3. The seven streams

`acquisition` (controlled Spanish written for the course: the launch ramp) · `library` (readers → novels →
classics → medieval, on eight shelves) · `honduras` (Honduras and Central America) · `knowledge` (nonfiction by
domain) · `scripture` · `mission` · `personal` (the learner's own books). An eighth, `listening`, exists as data and
is switched off with GoListen (deferred to V2); texts stay structurally ready for audio.

The acquisition path is a ramp, not the course: its weight in recommendations falls as authentic texts become
comprehensible for the learner.

## 4. Scale

Nothing is loaded whole. The **index** is one small row per catalogued text (paged and searched through the store's
indexes); a text's **profile** (its distinct forms, lemmas, phrases and constructions with counts) is fetched only
for the candidates being scored; the **documents** of a text are imported through the ordinary importer only when
the learner opens it. Personal difficulty of an un-imported text is computed from its profile against the
learner's item states, at a cost proportional to the profile. The library is built offline by a repeatable tool
(`npm run library:build`) from rights-cleared sources and a manifest; it is never hand-entered.

## 5. Rights

Every work carries a rights record. Only `verified-public-domain`, `verified-open-licence` (each with a named
verifier, the basis and the exact source) and `course-authored` may be bundled. A date of death or publication is
recorded as a lead. Modern books are `prohibited-from-bundling` and reachable only as the learner's own copy,
which stays on the device. The library build tool refuses a source whose manifest entry is not in a bundlable
state.

## 6. Regional Spanish

`honduras-es` has the policy `{ target: 'es-HN', within: ['es-CA', 'es-419'], activeFeatures: ['voseo'] }`. A form
tagged `vosotros` or `es-ES` is shown, tracked and explained — "used in Spain: worth recognising, not your default"
— and never suppressed. Historical Spanish (`es-hist`) is preserved exactly as written; a modern equivalent is an
aid shown beside it, clearly separate from the text.

## 7. What this pass does not do

It does not download a corpus, verify any rights, or ingest literature: the catalogue lists candidates and the
tooling is proven on fixtures and on the course's own prototype texts. The controlled Spanish texts are
machine-drafted and stay in preview until a native speaker reviews them. GoListen stays off.
