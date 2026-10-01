# Spanish course — status (2026-10-01)

Words as in `docs/READINESS.md`: **implemented** (the code exists and its own tests pass), **verified** (also proven
end to end: integration tests on the real adapter, importer and engines, and a browser flow in a sandbox database),
**architecture only** (the contract, the code path and fixture tests exist; no real content has been through it),
**awaiting external input** (cannot be completed inside the repository).

This is not a production-readiness claim. The short version:

- The **system** for a large Spanish course is built and tested: streams, shelves, rights states, varieties, rule
  morphology, a library that never loads whole, personal difficulty, ranking, search, "Your copy" import of `.txt`
  and `.epub`, source quality checks.
- The **content** is almost entirely absent, on purpose. What is bundled is 26 short texts written for the course by
  an AI model and not reviewed by anyone, plus the three seed documents that were already there. No book has been
  ingested, no corpus downloaded, and no work's rights verified in this pass except the one that was already
  verified (three verses of Reina-Valera 1909).
- Nothing Spanish is **published** to a learner beyond those three verses. Everything else is visible only in
  preview mode, labelled as unreviewed.

Design: `docs/SPANISH_COURSE.md`. Build plan and file ownership: `docs/PLAN9.md`. The controlled texts:
`docs/spanish/ACQUISITION.md`.

## 1. Implemented and verified

| Part | What it does | Evidence |
|---|---|---|
| Streams, shelves, doors | Eight streams (acquisition, library, honduras, knowledge, scripture, mission, personal; listening exists as data and is off). Eight shelves (Stage 0–7) that are an orientation and never a lock. Nine doors on Home and Explore (Acquisition Path, Honduras, Stories, Bible, History, Science & Engineering, Theology, Classics, Your Books) | `test/course/spanishCatalog.test.ts`, `test/integration/spanish-catalogue.test.ts`, `test/ui/spanishHome.test.tsx`, `test/ui/explore.test.tsx`; browser |
| Rights as data | One explicit state per work: verified public domain, verified open licence, course-authored, recommended only, user-supplied, rights unverified, prohibited from bundling. Only the first three may be bundled; the library build tool refuses anything else; the interface says "Rights not verified — not bundled. Read it from your own copy." and never "public domain" for an unverified work | `test/integration/spanish-catalogue.test.ts`, `test/library/build.test.ts`, `test/library/cli.test.ts`; browser (Explore) |
| "Your copy" | A `.txt` file, or an `.epub` without copy protection, is checked, split into chapters, previewed and imported on the device; the words are never changed; it is labelled "Your copy", never uploaded, bundled or published. A protected EPUB is refused before anything is read. A damaged or wrong-language source is reported, not silently imported | `test/ingest/epub.test.ts`, `plaintext`, `quality`, `publish`, `test/ui/books.test.tsx`, `courseImport.test.tsx`; browser: a two-chapter text file imported, read, chapter navigation in order |
| Source quality check | Flags, never fixes: mojibake, replacement and control characters, broken accents, OCR confusions, hard-wrapped lines, hyphenated line breaks, page numbers, running heads, footnote markers, duplicated paragraphs, missing chapters, Project Gutenberg header / licence, production credits, text of another language, mixed scripts, mangled punctuation. Verdict clean / usable / damaged | `test/ingest/quality.test.ts` (27 cases) |
| Spanish morphology by rule | Any verb form of the regular conjugations, 23 irregular verbs, about 180 stem-changing verbs, voseo (`tenés`, `sos`), vosotros, the `-ra` and `-se` subjunctives, the older future subjunctive, participles, gerunds, attached pronouns with their roles (`decírselo` = decir + se + lo), nouns and adjectives (gender, number, diminutives). Each reading carries its rule, its confidence, and whether the lemma is in the word list or only inferred (0.6 at most, no gloss) | `test/integration/spanish-morphology.test.ts` (152 judged forms), `test/adapters/spanish-*.test.ts`; browser word sheets |
| Readings in context (added in the audit of this pass) | A written form with two readings is ordered by its neighbours: noun or verb (`la pregunta` / `—pregunta Marvin`), adjective or verb (`está llena`), participle after haber, plural noun or "tú" form (`tiendas`), and the pairs `fue` (ser / ir), `sé` (saber / ser), `siento` (sentir / sentar), `como`, `ve`, `ven`, `solo`, `junto a`. The chosen reading keeps its confidence; the others stay on the word sheet, marked down, with a note of which neighbour decided. Not a parser | `test/integration/spanish-homographs.test.ts` (85 judged sentences); section 6 below |
| Word list | 1,701 lemmas (822 nouns, 352 verbs, 210 adjectives, closed classes complete), 192 phrase units, 23 constructions, sentence splitting with `¿ ¡ « »` and dialogue dashes. **Machine-drafted; not checked by a native speaker** | `test/adapters/spanish-lexicon.test.ts`, `spanish-constructions.test.ts`, `spanish-sentences.test.ts` |
| Regional Spanish | The course has an explicit policy: active target Honduran / Central American Spanish inside general Latin American Spanish; voseo is part of the target; Spain, other regions and older Spanish are receptive. The word sheet says which: "voseo (vos) — part of the language you are aiming to use", "used in Spain: worth recognising, not your default". Nothing is hidden or suppressed | `test/integration/spanish-catalogue.test.ts`, `spanish-course.test.ts`, `test/ui/wordsheetSpanish.test.tsx`; browser (`Vos tenés`, `sos`, `boletos`) |
| Historical Spanish | Older spelling (`á`, `fué`, `dixo`, `fazer`, `vn`, `deste`) is recognised without changing the text; the modern form is shown beside it as an aid | `test/adapters/spanish-wiring.test.ts`, `spanish-lexicon.test.ts`, `verification.test.ts` |
| One learner model | Every Spanish text — course texts, Scripture, testimony, the learner's own books — feeds the same items (`form:es:…`, `lemma:es:…`, `phrase:es:…`, `pattern:es:…`) | `test/integration/spanish-course.test.ts`, `test/golearn/sharedItems.test.ts` |
| Personal difficulty | For this learner and this text: predicted coverage, new words worth knowing, rare words, weak phrases, new constructions, and factors in words (sentence length, clause depth, subjunctive, attached pronouns, regional and historical vocabulary, names). It says what it does not know ("You have read little so far…", "No frequency data…"). It replaces no label: the static level stays what the editor said | `test/golearn/personalDifficulty.test.ts`, `forecastPersonal.test.ts`; browser (Preview difficulty) |
| Ranking | `rankLibrary` scores candidates for one learner: comprehensibility that peaks below 100 % coverage, interest, natural reinforcement of weak items, regional fit, novelty, source quality; controlled texts fade as authentic ones become comprehensible; at most two results in a row from one work; each result carries its reasons in words | `test/golearn/rankLibrary.test.ts`, `test/integration/spanish-course.test.ts` |
| Library at scale | An index row per text, posting lists for stream, shelf, rights, location and a three-letter text search, a per-text profile fetched only for the candidates being scored, documents imported only when a text is opened. A page of a 20,000-row catalogue reads about one page of rows wherever it is; a search reads one bucket | `test/library/scale.test.ts` (20,000 rows on the memory store; 3,000 rows through real IndexedDB transactions) |
| Search | Title and author across the catalogue; every occurrence of a word, lemma or phrase in the texts on the device (`findOccurrences`) | `test/golearn/occurrences.test.ts`, `test/ui/explore.test.tsx` |
| Reader | Text first; gloss → phrases → grammar → sentence → English in layers; word parts, variety line and morphology in words appear only where the analysis carries them | `test/ui/wordsheet*.test.tsx`; browser |
| Analyzer upgrades reach texts already on a device (added in the audit of this pass) | The remembered signature of the built-in texts now names the analyzers. When one changes, the affected texts are re-analysed in place — same sentences, same tokens, same content version — and every learner's derived state is rebuilt from the event log, which is never rewritten | `test/integration/analyzer-upgrade.test.ts`, `test/ui/bootstrap.test.ts`; browser (a sandbox prepared by the earlier analyzer came up with the new readings) |

Speed, measured on the 29 bundled Spanish documents (3,836 word tokens): analysis 0.08 ms per word cold, 0.005 ms
warm (`npx vite-node scripts/probe-es-speed.mts`). The per-view cost of the learner model is flat in the size of
the history (see `docs/READINESS.md`, Thai course).

## 2. Architecture only

These exist as contracts, code and fixture tests. No real content has been through them.

- **The built library.** `npm run library:build` turns a manifest of rights-cleared sources into shards. It has run
  on test fixtures only. No library is built or shipped: `public/` holds no Spanish library, and the app's
  catalogue index contains only the texts on the device.
- **Ranking over a real corpus.** The ranking has been exercised on the 29 bundled documents and on synthetic
  profiles. Its weights (`RANKING` in `src/golearn/policy.ts`) are first guesses, not tuned on any learner. "Best
  next reads" needs texts to rank: with only unpublished texts it shows nothing outside preview.
- **The Spanish dictionary layer.** The mapping from kaikki / Wiktionary to the dictionary format handles Spanish
  (inflected-form entries, `formOf`), tested on a small fixture. The real file has **not** been downloaded (see
  section 8), so no Spanish dictionary is installed.
- **Knowledge, mission and listening streams.** They exist as streams with no texts. Science & Engineering is an
  empty door that says so.
- **Frequency.** There is no Spanish frequency list. "Rare" in the difficulty preview means "occurs once in this
  text and nowhere else you have read", and the preview says that it has no frequency data.
- **Alignment.** No text–translation or text–audio alignment exists for Spanish beyond the sentence-level English
  of the course's own texts. None is fabricated.

## 3. What is actually bundled

| Material | Amount | State |
|---|---|---|
| Camino 1–3 (controlled Spanish, 22 texts) and Honduras — Lecturas 1 (4 texts) | 26 documents, about 3,660 words | Written by an AI model for the course. **Not reviewed by a native speaker; unpublished**; visible in preview only. The Honduran texts state facts and usage (`pulpería`, `baleada`, `catracho`, `vos`) that a Honduran reviewer must check |
| "Mi historia", "Una conversación" (seed documents) | 2 documents | Generated, unreviewed, unpublished |
| 1 Juan 1:8–9; Juan 3:16, Reina-Valera 1909 | 3 verses | **Published.** Byte-verified against the distributor's file (eBible.org, `spaRV1909`) in an earlier round |

That is all the Spanish text in the repository: 29 documents, 467 sentences, 3,836 word tokens. Every word of them
has an analysis; that is a statement about these texts, which were written with the word list in view, and says
nothing about coverage on a real book.

The production bundle grew from 1,072 kB to 1,398 kB (gzip 328 → 431 kB) with this pass, because the
Spanish word list, the rule engine, the library runtime and the 26 course texts are compiled into it. Moving the
course texts and the word list out of the main bundle is the first thing to do before real content is added.

## 4. Recommended only

The catalogue (`src/course/spanish.ts`) lists 66 works. For 61 of them the app holds **metadata only**: title,
author, shelf, variety, era, and a rights record. No text of any of them is in the repository.

- 11 modern works are `prohibited-from-bundling` and can only ever be read as the learner's own copy.
- 50 older works are `rights-unverified` (section 5).
- Bibliographic fields that were not certain are left empty. Dates of death and publication, where given, are
  recorded as leads for a rights check and have not themselves been checked against a source.

## 5. Rights that remain unverified

**All of them except one.** By state: 50 `rights-unverified`, 11 `prohibited-from-bundling`, 4 `course-authored`,
1 `verified-public-domain` (Reina-Valera 1909, verified for the three bundled verses against eBible.org).

No work is treated as public domain because it is old or available online. For each candidate, verification means
a person recording: the exact edition and source file, the basis (author's death date and the term that applies in
the jurisdictions that matter, or the licence text), who checked and when. Until `rights.state` is changed by that
record, the build tool refuses the work and the interface says it is not bundled. Translations, modern editions,
annotations and audio recordings have their own rights and are recorded separately (`canBundleAudio`).

## 6. Known limits of the Spanish analysis

- **Homographs.** Measured on the bundled texts: 186 of 3,836 word tokens (4.8 %) have readings that differ in
  lemma or part of speech. Before the context rules, I judged the first reading wrong for about 44 of them (1.1 % of
  all tokens); after, for 1 (`con mucho gusto`: determiner read as adverb, same lemma). **This is a
  development-set figure**: the rules were written while looking at these texts, and the judge was the same model
  that wrote them, not a native speaker. The only independent signal is small: 85 sentences judged before the rules
  were run (about 35 of them not from the course texts) all came out as judged on the first run. Nothing has been
  measured on real prose. A `di`, `sal` or `para` at the start of a sentence, `la`/`los`/`las` before a word that
  can be a verb, and subordinate clauses are the known weak places.
- **Inferred lemmas.** A word outside the 1,701-lemma list gets a rule reading with an inferred lemma, no gloss,
  confidence 0.6 or less, shown as uncertain. On real books this will be common until a dictionary is installed.
- **Rare forms.** `freír`-type verbs, irregular `-ísimo` forms and some irregular participles of unlisted verbs
  are not derived.
- **Regional tags.** Only a handful of words per variety are tagged (6 Honduran, 4 Central American, 20 Latin
  American, 4 Spain). An untagged word is not thereby the same everywhere. The Honduran entries are unverified.
- **Sentence splitting** knows the common abbreviations, not all.
- **"Possibly …" on the word sheet** now appears when the reading is below 0.6 or another reading is about as
  likely (within 0.2), not merely because another reading exists.

## 7. What remains

**Honduras.** Everything that makes the course Honduran is unverified: the four Honduran readings, the regional
vocabulary and its glosses, the claim that voseo is the everyday form to aim at. Needed: a Honduran reviewer for
the texts and the word list; lawful Honduran and Central American texts (the catalogue lists Turcios, Molina,
Gamero, Amaya Amador, Sosa, Salarrué, Asturias, Darío as candidates, rights unverified); mission-specific texts
from the team itself.

**The Bible.** Three verses of Reina-Valera 1909 are bundled and published. Bundling the whole translation needs
the rights verification repeated for the complete text and edition, then an ordinary import through the Scripture
path (which is already verified for Spanish). No modern Spanish translation is bundled or proposed: each has an
owner whose permission would be needed. No verse alignment to another language is fabricated.

**GoListen.** Deferred to V2 and switched off (`FEATURES.listen`). Spanish texts stay structurally ready for audio
(sentence ids, speech normalisation for Spanish including dialogue dashes), and the `listening` stream exists as
data. Nothing in the Spanish course waits for it.

**Large-scale ingestion.** In order:
1. Install a Spanish dictionary (needs the download in section 8) so that words outside the word list are glossed.
2. Choose a first small set of sources and **verify their rights** (section 5). Recommended start: ten to twenty
   short nineteenth-century works whose authors' death dates make a check straightforward.
3. Run them through `corpus:convert` → quality check → `library:build`; read the quality reports; fix sources, not
   texts.
4. Measure the analysis on that real prose with a hand-checked sample (the homograph and coverage figures above are
   not that).
5. Move the word list and course texts out of the main bundle; decide where the built library is hosted.
6. Only then widen the manifest. The catalogue of 66 is a list of candidates, not a plan to ingest them all.

**Review of the controlled texts.** A native speaker reads Camino 1–3 and Honduras — Lecturas 1; `npm run
corpus:review` records the review and publishes them. Until then a new learner on the Honduras team sees no Spanish
text outside preview, and Home says so.

## 8. Awaiting a decision

- **Permission to download the Spanish dictionary data**: `kaikki.org-dictionary-Spanish.jsonl` from
  https://kaikki.org/dictionary/Spanish/, 1,054,565,864 bytes (about 1.05 GB), Wiktionary content under CC BY-SA.
  It would be kept outside git, built into shards, attributed, and kept as a separate layer exactly as for Thai.
- Which sources to verify first, and who verifies.
- A native reviewer for the controlled texts and a Honduran reviewer for the Honduran material.

## 9. Verification of this pass

- `npm run gate`: typecheck clean; 3,531 tests in 196 files pass, with no runner errors (three consecutive full runs).
- `npm run corpus:check`: 41 documents, 0 validation errors, 2 published, 39 unpublished; re-import unchanged;
  6 verified verses byte-identical. `npm run corpus:prove`: 162 checks, 0 mismatches.
- Production build: succeeds (JavaScript 1,397.70 kB, gzip 431.06 kB).
- Browser, in fresh sandbox databases (`?sandbox=es1`, `?sandbox=es2`): Home for the Honduras team with the honest
  "nothing is published yet" note and the doors; Explore with shelves, paging, and rights lines; preview mode;
  the reader on Camino and Honduras texts (word sheets for `tiene`, `tenés`, `sos`, `Vos`, `boletos`, `buscarlo`,
  `sé`, `Fue`, `casa`; difficulty preview; marking a text understood and finished); "Your Books": a two-chapter
  text file checked, imported and read (`decírselo`, `hubiéramos`); Thailand and Germany teams unchanged; no
  console errors. Preview was switched off again in both sandboxes; the normal library was not opened or changed.
- Found and fixed during the browser pass: the reader's Previous / Next followed titles instead of chapter order;
  wrong first readings of common homographs, and guessed verbs listed beside adverbs (`después` → "despuer"); an
  improved analyzer never reached texts already imported; "possibly" shown for every word with a second reading;
  and the test suite reported worker timeouts because command-line tests blocked their workers (they now spawn
  asynchronously).

Left behind on this machine (browser storage for `127.0.0.1:5196`, not the repository): sandbox databases `es1`
and `es2` from this pass (a default learner, one finished course text in `es1`, the two-chapter test book in
`es2`), and the sandboxes of earlier rounds. They are separate from the normal library and can be deleted from the
browser's site data.
