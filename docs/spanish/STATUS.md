# Spanish course — status (2026-10-01, updated the same evening for the dictionary pass and that night for the first run on real prose)

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
- **Since the evening of 2026-10-01 a Spanish dictionary is installed** (Wiktionary via kaikki.org, 808,278 entries,
  kept as a separately sourced layer) and the importer uses it for a learner's own books: `docs/spanish/DICTIONARY.md`
  has what it does and every measurement, including the two evaluations on data that was never looked at.
- **That night the pipeline met real books for the first time** — five plain-text files another tool had placed in
  `data/sources/es-prose/` were planned (not imported) with the dictionary. Between 99.6 % and 99.9 % of the words of
  the four clean books get a reading; nine defects showed and were fixed (adapter 6). Whether the readings are right
  on a book is still unmeasured: three 150-word samples wait for a person. See "First run on real prose" at the end.
- **A library for Spanish is being built by another tool in the same working tree, uncommitted** (26 Project
  Gutenberg editions, rights recorded as verified for the United States only). This document does not vouch for it;
  what this session saw of it, and what it would ask before relying on it, is at the end.

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

| The dictionary decides what the rules only guess (PLAN10) | With the dictionary installed, a learner's own book is imported with it: a word outside the word list gets the dictionary's lemma and meaning (rule and dictionary agreeing at 0.7), a form the dictionary lacks is read by rule from a lemma it has, the dictionary's other readings of a word-list word are added below the word list's and ordered by context, capitals matter (`PA` is not a reading of "pa"), region labels are carried, and the word sheet names the dictionary and says the meaning was not checked for the sentence | `test/ingest/dictionaryDecides.test.ts`, `dictionaryBeside.test.ts`, `dictionaryWritten.test.ts`, `test/integration/spanish-dictionary.test.ts`; browser (a two-chapter book: 1.5 s, 133 shard requests); held-out figures in `docs/spanish/DICTIONARY.md` |
| Dictionary at Spanish scale | Compact shards (57.7 MB for 808,278 entries; the first format projected 93 MB), at most 24 parsed shards in memory, 4 read at a time; `npm run dict:status` before every build says which dictionaries ship | `test/dict/format3.test.ts`, `bounded.test.ts`, `scale-es.test.ts`, `status-cli.test.ts` |
| Startup imports one language | Only the active course's built-in texts are imported at startup; another language's when its course becomes active; a first-run team choice ends with texts, ladder and library index in place ("Preparing your texts…"). First start had grown to about 25 s because every language's texts were imported | `test/ui/bootstrap.test.ts`, `courseOnboarding.test.tsx` |

Speed, measured on the 29 bundled Spanish documents (3,836 word tokens): analysis 0.02 ms per word cold, 0.002 ms
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
- *(no longer architecture only)* The Spanish dictionary layer: installed and measured on the real file — see
  section 1 and `docs/spanish/DICTIONARY.md`.
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

- **Readings in sentences, measured on data never looked at** (`docs/spanish/DICTIONARY.md` 4.2): on 7,649 words that
  Wiktionary's usage examples mark, the pipeline's first reading is the example's own headword and part of speech for
  92.65 %, and for 82.1 % of the 1,686 words that have competing readings (61.9 % without the context rules). So
  roughly one ambiguous word in six still gets the wrong first reading; the right one is on the word sheet. The examples
  are not running prose, and the judge is the dictionary the pipeline also uses.
- **Homographs in the course texts.** Measured on the bundled texts: 186 of 3,836 word tokens (4.8 %) have readings that differ in
  lemma or part of speech. Before the context rules, I judged the first reading wrong for about 44 of them (1.1 % of
  all tokens); after, for 1 (`con mucho gusto`: determiner read as adverb, same lemma). **This is a
  development-set figure**: the rules were written while looking at these texts, and the judge was the same model
  that wrote them, not a native speaker. The only independent signal is small: 85 sentences judged before the rules
  were run (about 35 of them not from the course texts) all came out as judged on the first run. On real prose only
  coverage has been measured (whether a word gets a reading), not correctness. A `di`, `sal` or `para` at the start of a sentence, `la`/`los`/`las` before a word that
  can be a verb, and subordinate clauses are the known weak places.
- **Words outside the word list.** With the dictionary installed they get the dictionary's lemma and meaning; on the
  held-out example sentences 1.0 % of all words stay a rule guess and 1.2 % get nothing (names, typing, rare forms).
  Without the dictionary (a clean checkout, or a build made without `dict:build`) such a word is a rule guess: an
  inferred lemma, no meaning, shown as uncertain. A learner's own book imported before the dictionary was installed
  keeps its old analysis until it is imported again.
- **The rule engine against the dictionary's inflection data, held out** (`docs/spanish/DICTIONARY.md` 4.1): the
  dictionary's lemma is among the readings for 98.4 % of word-list forms, features agree for 99.8 %, verbs with
  attached pronouns are found for 99.3 %; for forms of lemmas outside the word list the right lemma is among the
  guesses for 93.3 %. Not derived: bare e > i stem changes of unlisted verbs, obsolete verbs, a guessed verb beside a
  word-list verb that already explains the form (`créales` is read as creer).
- **Regional tags.** Only a handful of words per variety are tagged (6 Honduran, 4 Central American, 20 Latin
  American, 4 Spain). An untagged word is not thereby the same everywhere. The Honduran entries are unverified.
- **Sentence splitting** knows the common abbreviations, not all.
- **"Possibly …" on the word sheet** appears when the reading is below 0.6 or another word or part of speech is about
  as likely (within 0.2) — not because another reading exists, and not for another person of the same verb.
- **The word list against the dictionary**: 45 differences recorded for a person to decide, none decided
  (`docs/spanish/DICTIONARY_REPORT.md`).

## 7. What remains

**Honduras.** Everything that makes the course Honduran is unverified: the four Honduran readings, the regional
vocabulary and its glosses, the claim that voseo is the everyday form to aim at. Needed: a Honduran reviewer for
the texts and the word list; lawful Honduran and Central American texts (the catalogue lists Turcios, Molina,
Gamero, Amaya Amador, Sosa, Salarrué, Asturias, Darío as candidates, rights unverified); mission-specific texts
from the team itself.

**Honduras, from an independent source.** The dictionary labels 940 senses in 780 entries as Honduran and 300 in 269
as Central American (`scripts/es-regional.mts` writes them to a local review file; nothing is committed or shipped).
Seven of the ten Honduran or Central American words of the hand list carry a matching label; `baleada`, `catracha`
and `lempira` carry none. That is material for the Honduran reviewer, not a verification.

**The Bible.** Three verses of Reina-Valera 1909 are bundled and published. The rights record now carries the date of
its verification; it records no status per jurisdiction ("stated by the distributor; not separately researched per
country"), so a build made with a release list of jurisdictions (`npm run rights:check -- --release …`, the shared
rights gate) leaves the verses out until someone has checked those jurisdictions. Bundling the whole translation needs
the rights verification repeated for the complete text and edition, then an ordinary import through the Scripture
path (which is already verified for Spanish). No modern Spanish translation is bundled or proposed: each has an
owner whose permission would be needed. No verse alignment to another language is fabricated.

**GoListen.** Deferred to V2 and switched off (`FEATURES.listen`). Spanish texts stay structurally ready for audio
(sentence ids, speech normalisation for Spanish including dialogue dashes), and the `listening` stream exists as
data. Nothing in the Spanish course waits for it.

**Large-scale ingestion.** In order:
1. *(done 2026-10-01)* A Spanish dictionary is installed and the importer uses it.
2. Choose a first small set of sources and **verify their rights** (section 5). Recommended start: ten to twenty
   short nineteenth-century works whose authors' death dates make a check straightforward.
3. Run them through `corpus:convert` → quality check → `library:build`; read the quality reports; fix sources, not
   texts.
4. Measure the analysis on that real prose with a hand-checked sample (the figures above are on dictionary examples
   and on the course's own texts, not on a book). *Started 2026-10-01 night: coverage measured on five books, samples
   written, none marked (`docs/spanish/DICTIONARY.md` 4.6).*
5. Move the word list and course texts out of the main bundle (it touches files every language's session shares, so
   it needs to be agreed with them); decide where the built library and the 57.7 MB dictionary are hosted.
6. Only then widen the manifest. The catalogue of 66 is a list of candidates, not a plan to ingest them all.

**Review of the controlled texts.** A native speaker reads Camino 1–3 and Honduras — Lecturas 1; `npm run
corpus:review` records the review and publishes them. Until then a new learner on the Honduras team sees no Spanish
text outside preview, and Home says so.

## 8. Awaiting a decision

- *(decided 2026-10-01: download and use it; ship the Thai dictionary too)* The Spanish dictionary data.
- Which sources to verify first, and who verifies ("I'll get back to you on a usable library").
- Who decides the 45 recorded differences between the word list and the dictionary, and who reads the Honduran extract.
- Whether a release names jurisdictions for the rights gate (then Reina-Valera 1909 needs a status for each).
- A native reviewer for the controlled texts and a Honduran reviewer for the Honduran material.
- Whether the library the other tool is building is the "usable library" meant above, and who integrates it. If it
  is: which jurisdictions a release is for (its rights records cover the United States only; the team is in
  Honduras), and what to do with the annotated school editions among its sources.
- Someone to mark the three 150-word samples from real books (a Spanish reader; an hour).

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

### The dictionary pass (evening of 2026-10-01)

Four sessions worked in this repository at once (Spanish and the dictionary / importer here; Hindi, German and
Albanian elsewhere), each committing its own files by path. What was run for Spanish:

- Typecheck: clean in every Spanish, dictionary, importer and shared file touched here (other sessions' in-flight files
  showed errors of their own at times).
- Tests: every area this work owns passes — 160 files, 2,587 tests (dictionary, importer, library, learner model,
  course, content, UI, Spanish adapter and integration). The whole suite at that moment: 8,485 of 8,497 passing in 286
  files; the 12 failures were in the German gold set and the Albanian course, both being worked on by their sessions.
  Under the load of four sessions the runner reported one worker timeout on a green run; see "Known" below.
- Evaluations: dev and held-out, in `docs/spanish/DICTIONARY.md` section 4. The held-out sentence set and the sealed
  morphology quarter were each run once, after all tuning, and nothing was changed afterwards.
- Browser, in an isolated worktree of the commit on its own port (so that other sessions' half-saved files could not
  reload the page): a two-chapter book of my own writing imported with the real dictionary (1.5 s, 133 shard
  requests); stored analyses and word sheets checked for `zurcía`, `alféizar`, `guaro`, `pulpería`, `decírselo`,
  `abandono`, `sabés`, `marcha` / `marchan`, `forjaba`, `trabucaban`, `mascullaba`, `Fue` / `fue`; no console
  errors. Found and fixed there: a dictionary meaning shown with no source; "possibly" for a word whose only other
  reading was another person of the same verb; first start taking about 25 s.
- Found by measuring rather than by tests: the attached-pronoun measure was unsound (biased sample, placeholder cells,
  a mangled regular expression) and reported 99 % then 62 % for an engine that was at 95 %; dictionary readings beside
  the word list's made 124 course-text words worse until the context rules weighed readings by standing; capitalised
  entries (PA, ESO, Rosa) matched lower-case words.

Known: a learner's own book imported before the dictionary keeps its old analysis until re-imported; the production
bundle still contains the word list and course texts of every language; `createFetchLexiconSource` reads 4 shards at
a time, which is slower on a high-latency link than reading all at once.

Left behind on this machine (browser storage for `127.0.0.1:5198`, the audit worktree's port): sandbox database `es3`
(a default learner and the two-chapter test book). Also, from the first pass (browser storage for `127.0.0.1:5196`, not the repository): sandbox databases `es1`
and `es2` from this pass (a default learner, one finished course text in `es1`, the two-chapter test book in
`es2`), and the sandboxes of earlier rounds. They are separate from the normal library and can be deleted from the
browser's site data.

### First run on real prose (night of 2026-10-01)

Done by this session, read-only with respect to the acquired files: `scripts/probe-es-book.mts` plans a plain-text
book with the installed dictionary and counts where each word's first reading comes from. Figures, the nine defects
it exposed and their fixes: `docs/spanish/DICTIONARY.md` 4.6. In short: *Marianela*, *La edad de oro*, *Tradiciones
peruanas* and *Don Quijote* (547,756 words together) are read to between 99.6 % and 99.9 % of their words, about
1 % of them as a guessed name; the word sheet would say "possibly" for about 4 %.

- Implemented and tested (commits `5c194a1`, `7bbded0`, `b8d71ca`, `4f22d0b`, `4ea6eb3`): adapter 6 — a pronoun
  after a conjugated verb, the older accent, `se` + indirect object, names guessed from a capital, Roman numerals,
  old contractions without a guess beside them, `--` as the dialogue dash; underscores of plain-text italics (shared
  tokenizer); chapter headings `-I-` and above XXXIX; division of an overlong chapter into parts; the quality
  check's report of English sections in an annotated edition.
- Verified: the Spanish, importer and shared-tokenizer tests (every language's adapter tests pass with the tokenizer
  change); the dev-split evaluations before and after (no fall in sentences beyond one word in 7,970; the held-out
  splits were not run again). A clean checkout of the commit was type-checked and tested.
- Not verified: correctness of readings on a book (samples unmarked); a whole book imported and read in the browser;
  speed of such an import in the browser (in Node: 0.5–1.7 ms per word on a busy machine).
- Because the analyzer version changed (5 → 6), the bundled Spanish texts are analysed again on the next start, and
  a learner's own Spanish books on re-import.

**The other tool's Spanish library, as this session saw it (not its author; nothing of it was changed, committed
or reverted here).** By 21:46 the working tree held 27 Spanish text files and a manifest of 26 works in
`data/sources/es-prose/`, uncommitted edits to `src/course/spanish.ts` (works marked `verified-public-domain`,
`verifiedBy: 'Project Gutenberg ebook page and licence notice'`, `statusByJurisdiction: { US: 'public-domain' }`),
to `src/library/build.ts`, to catalogue and UI files and to two Spanish catalogue tests, and a library build
running into `public/library/es`. Twelve course and catalogue tests fail in that working tree and pass in a clean
checkout of the last commit: they assert the rights states the edits change. What a person should decide before
relying on it:

1. **Who verified.** The project's rule is that no work is marked verified without a person's record. These
   records name a web page as the verifier.
2. **Where.** The records cover the United States. By this session's reading of the usual terms — not legal advice,
   and to be checked — Juan Ramón Jiménez (died 1958) and Pío Baroja (died 1956) are still protected in Honduras
   (life + 75 years), in Spain (life + 80 for authors who died before 1987) and in most of the European Union
   (life + 70). *Platero y yo*, *El árbol de la ciencia* and *Zalacaín el aventurero* are in the manifest. The shared
   rights gate refuses a work without a status for a named release jurisdiction, but only when the build is given
   the list (`npm run rights:check -- --release …`).
3. **Which edition.** *El capitán Veneno* (#29731) and *El sombrero de tres picos* (#29506) are American school
   editions: 17 % and 26 % of their words stand in English notes, exercises and vocabularies; *Platero y yo*
   (#9980) 14 %. The editors' apparatus is a work of its own, and for a learner it is not the book. The quality
   check now refuses the first two for a library and warns on the third.
4. **Old spelling.** Six files are judged "damaged" by the quality check; for *Novelas ejemplares*, *El conde
   Lucanor*, *Libro de buen amor* and Bécquer the cause is the missing-accent test firing on an old-orthography
   edition, which is a property of the edition and not scan damage. A person should look before either trusting
   or overriding that verdict; the test's threshold was not changed.
