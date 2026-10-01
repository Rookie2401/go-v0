# PLAN9 — Spanish course foundation (packages)

Read first: `docs/SPANISH_COURSE.md` (the architecture note), then the contract files named in your section.
The fundamental model is **massive comprehensible input + a learner model + adaptive text selection**. This is not
a lesson tree, not a flashcard system, not a CEFR syllabus. Build architecture, textual accuracy, rights clarity and
performance before content volume.

Coordinator-owned (do not edit): `src/core/**`, `src/course/spanish.ts`, `src/course/thai.ts`, `docs/PLAN9.md`,
`docs/SPANISH_COURSE.md`, `docs/READINESS.md`, `test/integration/**`, `package.json`, `.gitignore`,
`vite.config.ts`. Rules for every package: as in `docs/PLAN5.md` ("Rules for every package") — touch only your
files; other packages are being written in the same tree at the same time; STUB files carry the final signatures;
run only your own tests; do not commit; download nothing and install nothing; no Spanish or other non-ASCII text
in shell commands (use the Write/Edit tools); report under 250 words with files, exported names, numbers, what you
could not do and every fact you were unsure of.

Standing constraints: preserve all existing behaviour and tests (Thai, German, Albanian, Hindi included); GoListen
is off (`FEATURES.listen`) and must stay off — build nothing that needs audio, but leave texts structurally ready
for it; never fabricate a rights status, a bibliographic fact, a frequency or an alignment; uncertain analysis is
stored as uncertain (alternatives + confidence), never asserted; canonical text is never modified.

---

## S1 — Spanish morphology engine

**Yours:** `src/adapters/spanish/morphology.ts` (STUB → real), `src/adapters/spanish/verbs.ts` and other files you
add under `src/adapters/spanish/` whose names start with `morph-` or `verb`, `test/adapters/spanish-morphology.test.ts`.
**Contract:** the stub's exported names and signatures; `WordPart` in `src/core/model.ts`.

A pure, synchronous, dependency-free engine that works in both directions.

1. **Generate** (`conjugateSpanish(lemma)`): every form of a verb — infinitive, gerund, participle (four gender /
   number forms), present / imperfect / preterite / future / conditional indicative, present and imperfect
   subjunctive (both -ra and -se), future subjunctive (tagged `es-hist`), affirmative imperative — for all persons
   including **voseo** (vos tenés, vos hablás, imperative hablá / tené; tag `voseo`) and **vosotros** (tag
   `vosotros`). Regular -ar / -er / -ir; stem changes (e→ie, o→ue, e→i, u→ue; -ir preterite and gerund changes);
   spelling changes (-car, -gar, -zar, -ger/-gir, -guir, -cer/-cir → zc, -uir → y, -eer → y, -iar/-uar accents); and
   tables for the irregular verbs (at least: ser, estar, haber, tener, ir, hacer, decir, poder, querer, saber, venir,
   poner, salir, dar, ver, traer, caer, oír, conducir and its family, andar, caber, valer, reír, and prefixed forms
   such as mantener, componer, deshacer, predecir handled through their base). Irregular participles (hecho, dicho,
   visto, puesto, escrito, abierto, roto, vuelto, muerto, cubierto, resuelto …).
2. **Analyse** (`analyzeSpanishForm(form, { knownLemma })`): all readings the rules allow, best first:
   - verb forms → lemma + features (UD style: `VerbForm` Fin/Inf/Ger/Part, `Mood` Ind/Sub/Imp/Cnd, `Tense`
     Pres/Imp/Past/Fut, `Person`, `Number`, `Gender` for participles), with `varieties` for voseo, vosotros and the
     future subjunctive;
   - **attached pronouns** on infinitives, gerunds and imperatives, with the accent the attachment forces removed
     to find the verb form (decírselo → decir + se + lo; dámelo → da + me + lo; diciéndole; vámonos; siéntese;
     callaos): `parts` with offsets, lemma, and a plain role (indirect object pronoun, direct object pronoun,
     reflexive) when the form settles it, "object pronoun" when it does not;
   - nouns and adjectives → singular lemma, `Gender`, `Number` (plural rules incl. -ces, accent shifts joven /
     jóvenes), feminine of adjectives, superlative -ísimo, diminutives and augmentatives (-ito, -illo, -ico, -ote,
     -azo: lemma = base, a `Degree` / derivation note), adverbs in -mente (lemma = the adjective);
   - contractions al / del as two parts.
3. **Confidence and honesty.** `knownLemma` is the only way the engine learns that a lemma exists. A reading whose
   lemma is confirmed gets ≥ 0.8 (0.9 for an irregular-table hit). A reading whose lemma is only inferred stays
   ≤ 0.6 and says so in `rule`; when several readings compete (hablamos: present or preterite; canto: noun or verb;
   fue: ser or ir; ve: ver or ir) return them all — no single reading may claim more than 0.75 when another valid
   one exists. Never return a reading for a string the rules cannot derive.
4. `describeSpanishMorph(morph)`: plain words, e.g. "first person plural, imperfect subjunctive".
5. Tests: round trip (every generated form of ~60 verbs analyses back to the lemma with the same features), the
   irregular tables, each spelling and stem change, voseo and vosotros, clitic cases above, ambiguity cases,
   noun / adjective cases, non-words give nothing. The coordinator runs its own table
   (`test/integration/spanish-morphology.test.ts`; do not edit it).

## S2 — Spanish lexical layer and adapter

**Yours:** `src/adapters/es.ts`, files under `src/adapters/spanish/` whose names do NOT start with `morph-` or
`verb` (`lexicon-core.ts`, `function-words.ts`, `phrases.ts`, `constructions.ts`, `varieties.ts`, `historical.ts`,
`sentences.ts` …), `test/adapters/es.test.ts`, new `test/adapters/spanish-*.test.ts` except
`spanish-morphology.test.ts`. **Contract:** `src/core/adapters.ts`, `src/core/variety.ts`, `WordPart`.

Keep every current export of `es.ts` and every existing Spanish test green (`test/adapters`, `test/ingest/corpus.test.ts`,
`test/integration/spanish-loop.test.ts`, `acquisition-loop.test.ts`, the GoTell tests that use the adapter).

1. **Analysis order** for a token: hand lexicon hit → the morphology engine (`analyzeSpanishForm`, with `knownLemma`
   answered from the lexicon) → nothing. Candidates carry `origin` (`hand` / `rule`), `sourceId`
   (`adapter-es@<v>:hand`, `:rules`), `parts`, `varieties`. `thAdapter.sources` is the model for `esAdapter.sources`
   (all hand data: `machine-drafted`).
2. **Core lexicon**: about 1,500 lemmas of ordinary Spanish with part of speech, gender for nouns, and a short
   gloss: the commonest verbs (as lemmas — the engine supplies the forms), nouns of everyday life, family, body,
   home, food, places, time, nature, travel, work, school, church and Scripture basics, adjectives, adverbs,
   numbers, and the complete closed classes (articles, pronouns incl. vos / vosotros / usted(es), clitics,
   possessives, demonstratives, prepositions, conjunctions, question words). Only meanings you are certain of.
   Machine-drafted, labelled as such.
3. **Phrase units** (first-class, with gloss): tener que, acabar de, darse cuenta de, a pesar de, por lo tanto,
   tener ganas de, por supuesto, sin embargo, a veces, de repente, en seguida, tal vez, a lo mejor, por favor, de
   nada, hacer falta, echar de menos, tener razón, volver a + infinitive, dejar de, ponerse a, llegar a … (about
   120), matching inflected forms of the verb and tolerating clitics.
4. **Constructions** (`detectPatterns`, each with key, title, one-or-two-sentence explanation with a Spanish
   example and its English): ir a + infinitive; haber + participle (perfect tenses); estar + gerund; llevar +
   gerund; acabar de + infinitive; tener que / hay que + infinitive; se impersonal / passive; gustar-type verbs;
   aunque + subjunctive; si + imperfect subjunctive … conditional; para que + subjunctive; cuando + subjunctive
   (future reference); querer que + subjunctive; comparison (más … que, tan … como); ser vs estar + adjective;
   personal a; double object pronouns (se lo); voseo (tagged); vosotros (tagged); future subjunctive (tagged
   historical). Keep the existing keys.
5. **Varieties** (`esAdapter.varieties`): `es-HN` Honduras, `es-CA` Central America, `es-419` Latin America
   (general), `es-MX`, `es-CAR` Caribbean, `es-AND` Andean, `es-AR` Río de la Plata, `es-ES` Spain, `es-hist` older
   Spanish, and the features `voseo`, `vosotros`. Tag lexical regionalisms only where you are sure, both ways
   (ordenador `es-ES` / computadora `es-419`; coche / carro; zumo / jugo; móvil / celular; conducir / manejar;
   patata / papa …) and a careful handful of Honduran / Central American words (pulpería, cipote, catracho, baleada,
   pisto, chele …): ordinary educated Honduran usage first, colloquial forms marked `colloquial`, nothing reduced to
   slang, and say in your report which of these you were unsure of.
6. **Historical spelling** (`historical.ts`): recognise without altering the text — á / é / ó as prepositions and
   conjunctions, fué / dió / vió, -ss-, ç, x for j (dixo), f- for h- (fazer), u / v and i / j interchange, vn —
   returning the modern lemma with `varieties: ['es-hist']`, `notes.modern` = the modern spelling, and lower
   confidence. The source text is never normalised.
7. **Sentence segmentation**: ¿ ? ¡ !, dialogue dashes (—), quotation marks « », abbreviations (Sr., Sra., Dr.,
   Ud., Uds., etc., pág., núm., a. C., EE. UU.), ellipses, numbers. `morphFromTags` and `describeMorph` on the
   adapter (the latter from the engine).
8. `SUPPORT` restated honestly. Tests for each list (every entry analyses), each construction (fires on its
   example, not on a near miss), varieties both ways, historical forms, segmentation, offsets round-trip, and the
   forms in the spec: hubiéramos, decírselo, vos tenés, vosotros tenéis.

## S3 — Dictionary: inflected-form data and Spanish

**Yours:** `src/dict/**` except `compare*.ts`, `scripts/dict-build.mts`, `test/dict/**` except `compare*`.
**Contract:** `DictionaryEntry.formOf` in `src/core/contracts/lexicon.ts`.

The kaikki English-Wiktionary extract for Spanish exists (about 1.05 GB) but is **not downloaded and must not be**:
the owner has not approved it. Build against a hand-made fixture in the real shape (label it as a fixture).
In that file an inflected form is its own entry whose senses carry `form_of: [{ word: <lemma> }]` and `tags` such as
`form-of`, `first-person`, `plural`, `imperfect`, `subjunctive`, `indicative`, `preterite`, `feminine`, `participle`,
`with-voseo`, `Latin-America`, `Spain`; lemma entries carry glosses, `forms` tables and region labels in sense tags
(`Spain`, `Latin-America`, `Mexico`, `Honduras`, `Central-America`, `Rioplatense` …); `sounds` carry IPA with region
tags. Treat every shape as untrusted.

1. Map form-of entries to `formOf: [{ lemma, tags }]` (never to a gloss of their own); keep lemma entries as today.
   A form with both (a lemma that is also an inflected form of another word) keeps both.
2. Region labels on senses → `DictionarySense.tags` verbatim (the adapter decides what they mean); do not guess a
   variety from a vague label.
3. Size: the Spanish file is twenty times the Thai one. The builder must stream, hold bounded memory, and write
   shards whose largest stays under ~250 kB (raise the bucket count per language; put it in the manifest; a reader
   of an older manifest still works). Report peak memory and time on a synthetic 300,000-line file generated in a
   test's temp directory.
4. Tests on the fixture: form-of mapping, both-kinds entries, region tags, bucket count from the manifest, the
   Thai dictionary on disk (`public/dict/th`, schema 2) still reads.

## S4 — Importer: quality control, Western prose, EPUB, parts and varieties

**Yours:** `src/ingest/**` (`quality.ts` and `epub.ts` are STUBS → real), `scripts/corpus-*.mts`, `docs/IMPORT.md`,
`test/ingest/**`. **Contract:** `QualityReport` / `QualityFlag`, `Text.quality / streams / domains / variety`,
`TokenAnalysis.parts / varieties` in `src/core/model.ts`; `DictionaryEntry.formOf`; `LanguageAdapter.morphFromTags`.

1. **Quality control** (`inspectText`): detect and report, never silently fix — mojibake (UTF-8 read as Latin-1:
   Ã¡, Ã±, â€”), replacement characters, broken accents (a combining accent separated from its vowel, ´ before a
   vowel, n~), OCR confusions typical of Spanish scans (rn/m, l/1, tildes dropped in a text that otherwise has
   them), hard-wrapped lines, hyphenated line breaks, bare page numbers and running heads between paragraphs,
   footnote markers inside prose, duplicated paragraphs, licence / title-page boilerplate (Project Gutenberg start
   and end markers, "Produced by", transcriber's notes), language mismatch (share of words that are common function
   words of the language), mixed scripts, control characters, no chapters found, very long paragraphs. Each flag:
   code, severity, count, a sample. Verdict `clean` / `usable` / `damaged`.
2. **Western prose in the plain-text converter** (keep the Thai behaviour as it is; new options):
   `paragraphs: 'lines' | 'blank-line'` (auto: blank-line when the text has hard-wrapped lines), `unwrap: boolean`
   (join wrapped lines with a single space and re-join a hyphenated line break only when the joined word is not
   itself hyphenated in the text elsewhere — report every join count), `stripBoilerplate: boolean` (remove ONLY
   what `inspectText` identified as boilerplate, report exactly what was removed, keep it retrievable in the
   result's notes), Spanish and English chapter headings (Capítulo I / CAPÍTULO PRIMERO / Capítulo 12 / I. / Libro
   segundo / Parte tercera; Roman numerals; an explicit regex still wins), and a correction path: the result lists
   the detected headings so the caller can pass a corrected list (`headings: number[]` line numbers) on a second
   call. The quality report is stored on each document (`quality`) → `Text.quality`. A `damaged` verdict makes the
   import preview say so plainly; it does not block a personal copy (the learner decides), but a document destined
   for the built library is refused.
3. **EPUB** (`readEpub`, contract in the stub): a minimal zip reader (central directory; stored and deflate
   entries via `DecompressionStream('deflate-raw')`, which exists in browsers and in Node), `META-INF/container.xml`
   → the package document → spine order → each XHTML document to plain text (block elements → paragraphs, headings
   kept as their own lines, scripts / styles / navigation dropped, entities decoded). **A protected file is
   refused**: `META-INF/encryption.xml` listing content documents, or `rights.xml` → `EpubError('encrypted')` with
   a plain message; nothing is ever done to get around protection. `epubToDocuments(bytes, opts)` produces
   personal-copy documents through the same path as plain text. Tests build small EPUBs in memory.
4. **Document fields**: `streams?`, `domains?`, `variety?` on a document (validated: arrays of short slugs) → `Text`;
   `parts` and `varieties` from candidates → stored analysis; dictionary `formOf` → a candidate with `lemma` = the
   form-of lemma, `morph` from `adapter.morphFromTags(tags)` when the adapter has it, origin `dictionary`.
5. Tests for every flag (a positive and a clean negative), the converter options (exactness: with `unwrap` off the
   paragraph texts reproduce the source lines; with it on, the report accounts for every join), chapter headings,
   EPUB happy path / encrypted / damaged, the new fields, `corpus:prove` at 0 mismatches.

## S5 — The library: index, profiles, build tool, import on open

**Yours:** `src/library/**` (`index.ts` is a STUB → real), `scripts/library-build.mts` (npm script `library:build`
exists), `src/db/dexie.ts` (version 4: the `catalog` table from `INDEXES`), `test/library/**`, `test/db/**`.
**Contract:** `src/core/contracts/library.ts`; `catalog` table in `src/core/store.ts`.

1. `profileOfStoredText` / `featuresOfStoredText`: from stored tokens and resolved analyses of the LIVE sentences:
   form and lemma counts, phrase and pattern occurrence counts, and the features of `TextFeatures` (sentence
   length, long-sentence share, subordinators per sentence from POS `SCONJ` and relative pronouns, subjunctive share
   from `Mood=Sub`, clitic share from `parts` and clitic pronouns, phrase share, proper-noun share, unanalysed
   share, variety shares). A feature the analysis cannot measure is absent.
2. `createLibrary({ store, adapters, baseUrl, fetch, lexicon })`:
   - `indexStore(lang)`: one `CatalogText` row per text in the store (bundled → `location: 'bundled'`, personal
     copies → `'personal'`), with features; idempotent; cost proportional to texts changed since the last run.
   - a built library at `<baseUrl>/<lang>/manifest.json` + index shards + per-text documents and profiles, read
     lazily; missing ⇒ `info()` undefined and everything else still works on the store's own texts;
   - `search(q)`: paged (default 30, max 200), through the table's indexes plus an in-page filter; accent- and
     case-insensitive `text` match on title and author; never loads the whole catalogue into memory at once for a
     query that an index can serve (document which queries scan);
   - `profile(textId)`: stored text → computed and cached (invalidated by content version / analyzer change);
     library text → fetched; `open(textId)`: imports the library text's documents through `importDocuments`
     (dictionary included) if not present, then returns the `Text`.
3. **Build tool** `npm run library:build -- --lang es --manifest <manifest.json> --in <dir> --out public/library`:
   for each manifest entry (work metadata + rights record + source file + converter options) run the quality check,
   convert, validate, analyse, and write per-text documents, profiles and index shards deterministically. **It
   refuses any entry whose rights state is not `verified-public-domain`, `verified-open-licence` or
   `course-authored`, and any text whose quality verdict is `damaged`**, and prints why. Bounded memory: one work
   at a time. No network access.
4. **Scale proof** (`test/library/scale.test.ts`): a synthetic catalogue of 20,000 rows; a stream page, a
   text search and a rights filter each return a page without materialising all rows in the caller (count the
   table reads), within a time budget you state.
5. Tests: profile and features on small stored texts (Spanish and Thai), index idempotence, search paging and
   filters, build tool on a fixture manifest in a temp directory (accepted and refused entries), `open` imports
   once, Dexie v3 → v4 upgrade keeps data.

## S6 — GoLearn: personal difficulty, ranking, search; catalogue

**Yours:** `src/golearn/**`, `src/course/catalog.ts`, `src/course/index.ts`, `test/golearn/**`, `test/course/**`.
**Contract:** bottom of `src/core/contracts/golearn.ts` (`scoreProfile`, `rankLibrary`, `findOccurrences`,
`PersonalDifficulty`, `ProfileScore`, `RankCandidate`, `RankOptions`, `RankedText`; `DifficultyForecast.features /
personal`); `CourseCatalog.streams / findWorks`; `Stream`, shelves in `src/course/spanish.ts`.
**Do not touch `READINESS` thresholds.**

1. **Catalogue**: Spanish in `LADDERS` (shelves as stages, `SPANISH_WORKS`), `streams(courseId)` from
   `SPANISH_STREAMS` (empty for other courses), `findWorks` paged over the `works` table. For a course whose stages
   are all shelves, `currentStage` is undefined and `assistanceFor` returns the text's shelf profile
   (`DEFAULT_ASSISTANCE`): shelves never gate and never change the reader. Export the Spanish data from
   `src/course/index.ts`.
2. **`scoreProfile`**: shares of word tokens by the learner's state for each form (demonstrated / estimated
   familiar / met / new), using lemma state when the form is new but its lemma is known (an inflected form of a
   known verb is "met", not "new" — say this in a comment and test it); weak items present; new phrases and
   constructions; domain familiarity (known share of the forms of the learner's read texts that carry the same
   domain, when there are any); and a `PersonalDifficulty`: label from lexical coverage with the factors that
   apply (new words, phrases, constructions, sentence length, clause depth, subjunctive, clitics, regional,
   historical, proper names, domain, unanalysed), each `low` / `moderate` / `high` with a one-line note, and
   `caveats` (little history, many unanalysed words, no frequency data). Coarse on purpose. Cost proportional to the
   profile: read item states by id in batches, never the learner's whole item table.
3. `predictDifficulty` also returns `features` (from `featuresOfStoredText` in `src/library` — import it; it is a
   stub until S5 lands, so guard) and `personal` (same function as above on the stored text's profile).
4. **`rankLibrary`**: score = comprehensibility (peaks around the coverage the `challenge` option asks for, not at
   100 %) + interest (candidate stream / domains ∩ interests) + reinforcement (weak items and phrases present —
   contextual repetition: a struggle raises the value of natural texts containing the item, never a drill) +
   regional relevance (candidate variety vs the course target) + novelty (unread; not the same author every time)
   + quality (published, rights reliable). **Anti-pathology**: a controlled text may not outrank an authentic text
   of comparable comprehensibility solely on overlap; the weight of controlled texts falls as the share of
   authentic candidates at ≥ 90 % predicted coverage rises; no more than two consecutive results from one work.
   Each result lists its reasons in plain words.
5. **`findOccurrences`**: live, visible sentences containing an item (form, lemma, phrase, pattern), through the
   occurrence and token indexes, bounded by `limit`.
6. Tests: lemma-aware coverage, each difficulty factor, caveats, ranking properties (monotonic in coverage up to the
   target, reinforcement effect, regional effect, the anti-pathology rules, determinism), occurrences, catalogue
   functions, Thai ladder unchanged.

## S7 — Controlled Spanish: the acquisition prototype

**Yours:** `data/corpus/es/camino-*.json`, `data/corpus/es/honduras-*.json`, `docs/spanish/ACQUISITION.md`,
`test/content/spanish-acquisition.test.ts`. Read `docs/IMPORT.md`, the template `docs/import/templates/`, and the
existing `data/corpus/es/story-01.json` for the exact document format.

Write a small, polished controlled corpus: quality over quantity. It is machine-drafted, so every document is
`generated: true`, `review.status: 'unreviewed'`, `source.rights: 'owner-authored'`, `authorship: 'generated'`, with
an honest provenance line; it will be visible in preview only until a native speaker reviews it. Do not weaken that.

- **Camino 1** (8 texts, 8–12 sentences each): present tense, the commonest verbs, people, home, food, places.
  Narrative from the first line ("Juan tiene un libro. El libro está en la mesa. Juan quiere leer el libro."),
  heavy natural repetition, no word lists, no dialogues for their own sake.
- **Camino 2** (8 texts, 12–18 sentences): past narration (preterite and imperfect together, as stories use them),
  object pronouns, ir a + infinitive, tener que, acabar de, conversations embedded in the story.
- **Camino 3** (6 texts, 18–30 sentences): connected narrative with subordinate clauses, perfect tenses, and the
  subjunctive met naturally (quiero que, para que, cuando + subjunctive, aunque), a biography, a journey, one
  Bible-story retelling in your own words (not a quotation of any translation).
- **Honduras — Lecturas 1** (4 texts): ordinary life in Honduras in plain educated Spanish with usted and, in one
  text, vos among friends; a market, a bus journey, a church on Sunday, a family meal. Only facts you are certain
  of (Tegucigalpa is the capital, the lempira is the currency, a baleada is a flour tortilla with beans); no
  statistics, no history claims; regional words used sparingly.

Each document: `work: { slug: 'camino-1' | 'camino-2' | 'camino-3' | 'honduras-lecturas-1', chapter: { index, title } }`,
`streams`, `variety` (`es-419`, or `es-HN`), topics, explicit `sentences` with an English line each
(`english.source: "drafted with the text; not reviewed"`), no analysis spans (the adapter must do the analysis).
`docs/spanish/ACQUISITION.md`: the progression principle, what each level introduces, the vocabulary each text adds
(a list per text), and what a reviewer should check. The test: every document validates with the real validator,
belongs to its work, is unpublished for the stated reasons, has one English line per sentence, and (reported, not
asserted) the analysis coverage per text with the adapter as it is when you run it.

## F1 — Spanish navigation, catalogue pages, Your Books

**Yours:** `src/app/bootstrap.ts`, `src/ui/context.tsx`, `src/ui/App.tsx`, `src/ui/pages/**` except `TextPage.tsx`,
`src/ui/course/**`, `src/ui/library.tsx`, `src/ui/coverage.tsx`, `src/ui/prefs.ts`, `test/ui/harness.tsx`,
`test/ui/fixtures.ts`, and the tests of those. **Contract:** `Library` (`AppServices.library`), `CourseCatalog.streams
/ findWorks`, `RankedText`, `SPANISH_DOORS` in `src/course/spanish.ts`, `readEpub` / `epubToDocuments` and the
converter options in `src/ingest`.

The existence of a large corpus must not make the interface feel like a database. Keep the established visual
language (warm paper, EB Garamond, quiet labels); no dashboard.

1. Services: `library: Library` (bootstrap: `createLibrary`, `indexStore` for the course language in the
   background after startup — never blocking first paint), `IngestApi.convertEpub`, the converter options.
2. **Home for a course with streams**: Continue reading (as today) · Best next reads (three to five results of
   `golearn.rankLibrary` over the catalogue page for the learner — each with its one-line reason and personal
   difficulty label, never a number without its words) · doors from `SPANISH_DOORS` (only doors that have something
   behind them, or an honest "nothing here yet") · Your Books. Courses without streams: Home exactly as today.
3. **Explore** (`/explore`, and a door's page `/explore/:door`): the shelves as an orientation ("shelves, not
   locks"), works paged through `findWorks` (never the whole catalogue in the DOM: page or virtualise), a search
   box (title, author) and quiet filters (stream, region / variety, era, rights state). Each work: title, author,
   region and era when known, one honest rights line from `rights.state` ("Rights not verified — not bundled",
   "In copyright — read it from your own copy", "Public domain (verified by …)", "Written for this course"), and
   what the learner can do (read / add your copy). Reuse the Thai ladder's add-your-copy flow, now accepting `.epub`
   and showing the quality report and detected chapters with a way to correct chapter breaks before importing.
4. **Your Books**: the generic import (no work needed): title, author, file (.txt / .epub), preview with quality
   flags, confirm. Labelled "Your copy"; stays on the device.
5. **Interests** (Settings → You): choose subjects and streams to see more of (`User.interests`), explained as "more
   of", never "only".
6. The Thai course keeps its ladder page exactly as it is. The listening stream and door are not shown (GoListen is
   off).
7. Tests: Home for Spanish (best next reads from a fake ranking; doors), Explore paging (a fake catalogue of 500
   works renders one page), search, rights lines never claim more than the data, EPUB import flow incl. the
   refusal of a protected file, interests persist, Thai and the other three courses unchanged.

## F2 — Reader: Spanish word sheet, varieties, personal difficulty

**Yours:** `src/ui/reader/**`, `src/ui/pages/TextPage.tsx`, their tests. **Contract:** `WordPart`, `TokenAnalysis.parts
/ varieties`, `LanguageAdapter.describeMorph / varieties`, `varietyLine` / `varietyStanding` in `src/core/variety.ts`
(with `course.variety`), `DifficultyForecast.personal / features`.

Text first; nothing new is shown until the learner taps, and a tap never produces a grammar lecture.

1. **Morphology in plain words** in the grammar layer: `adapter.describeMorph(morph, pos)` + the lemma ("first
   person plural, imperfect subjunctive of haber"); alternates listed briefly when the analysis has several
   readings ("or: …"), with the uncertain wording that already exists.
2. **Parts**: when the analysis has `parts`, one compact line in the gloss layer — decírselo = decir + se + lo, each
   part with its short role — no table.
3. **Variety**: when the analysis has `varieties`, one line from `varietyLine(tags, course.variety,
   adapter.varieties)`; historical forms with `notes.modern` add "today: <modern form>" clearly as an aid, never
   replacing the text.
4. **Difficulty preview**: when the forecast has `personal`, show the label and its factors in words (lexical
   coverage: 96 % · unfamiliar constructions: moderate · historical vocabulary: high), then the caveats verbatim.
5. All of this appears only when the data is present: Thai, German, Albanian and Hindi readers are unchanged, and
   existing reader tests stay green untouched.
6. Tests with fakes for each point, plus: hubiéramos, decírselo, vos tenés, vosotros tenéis render as specified.
