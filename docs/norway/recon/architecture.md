# Team Norway recon 2: architecture map of go-v0 for adding Norwegian

Reconnaissance report (Phase 1 of the Team Norway brief), produced by a code-reading agent on 2026-10-07 and
reviewed by the lead. Read-only: no repo files were changed and no scripts or tests were run for it. Line numbers
are as of commit f86ff0f and will drift.

Lead's review notes (claims spot-checked in the code are marked ✔ in docs/norway/SPEC.md; the decisions taken from
this report are recorded there, not here).

## Headline findings

1. **One LanguageCode = one adapter, one course, one dictionary, one library shard tree, one set of item ids.** The app assumes a learner's course language equals every Text.lang they read. This shows up in:
   - `src/ui/pages/TextPage.tsx:47` (a text of another language shows a "language" state instead of opening);
   - `src/app/bootstrap.ts:317, 367, 382` (only the active course's language is imported);
   - `src/golisten/voices.ts:55-57` (a voice plan throws if `course.lang !== lang`);
   - `courseForLang` (`src/core/config.ts:44`, "first course with this lang").
   - `Course.lang` is a single value (`src/core/model.ts:35`).

2. **`nn` can be a second LanguageCode, and that is the cleaner choice for keeping encounters apart.** Item ids take the document's language: `ids.lemma(lang, …)` and `ids.form(lang, …)` at `src/core/ids.ts:30-31`, fed `doc.lang` at `src/ingest/plan.ts:1020-1035`. So `lemma:nn:eg:PRON` and `lemma:nb:jeg:PRON` never merge, and homographs (hus, bok) stay separate too. The kaikki dictionary mapper already rejects other-language entries (`src/dict/map.ts:171-172`, `wrong-language`), so nb and nn dictionaries would be separate files.
   - Cost: `Course.lang` is single-valued. An nn course would be a second "Norway" entry in Onboarding (`src/ui/Onboarding.tsx:34, ~60`, keyed on `c.country`), and an nb learner could not read nn texts.
   - A real fix needs `Course.readsLangs?: LanguageCode[]`. That does not exist.
   - Modelling nn as a variety inside nb is possible only for the learner-model side. It breaks the dictionary (nb-only entries), the locale check (`src/ingest/format.ts:436`: `locale.split('-')[0]` must equal `lang`), voices, and `fitsTeamLanguage`.

3. **Never use the `heritage` variety kind for Nynorsk or Landsmål.** `src/golearn/fold.ts:452-473` drops all item evidence for any text whose `variety` is `kind:'heritage'`. That is correct for Hindi's Awadhi and wrong for what the brief wants (separate counts, not zero counts).

4. **Most missing pieces are silent**, not compile errors. Examples are in the checklist: stage0 match (a Norwegian course would type å/ø/æ strictly), the JsonImporter language name (it would call Norwegian "Hindi"), the dictionary pronunciation ranker, and the regional-fit ranker.

---

## 1. Language registration

### TypeScript-enforced (`tsc -b` lists every one once `LanguageCode` grows)

- `src/core/model.ts:16-17`: `LanguageCode` and `LANGUAGES`. Registry order, dict:status and library:rebuild all derive from `LANGUAGES`.
- `src/core/config.ts:8-14`: `LANGUAGE_ROWS`. `src/core/config.ts:16-42`: `COURSES`, which feeds Onboarding, Settings and `seedFirstRun`.
- `src/adapters/index.ts:15-17`: `BY_LANG` and the import.
- `src/course/bibleAccess.ts:23`: `BIBLE_ACCESS` (one record per language).
- `src/course/curriculumPolicy.ts:42`: `constructions: Record<LanguageCode,…>`. Also line 41, the `ladders` array, and the `script:` ternaries in `STAGE_CONTRACTS` (they fall through to Latin).
- `src/stage0/lang/index.ts:13`: `STAGE0_LANGS`.
- `src/golisten/azureProvider.ts:33`: `AZURE_VOICES`. `src/golisten/fixtureProvider.ts:19`: `VOICES`.
- `src/gotell/concepts.ts:68` (`TABLES`), `:177` (`NEGATORS`), `:190` (`CHRONOLOGY`), `:199` (`SUBJECT_PRONOUNS`).
- `src/gotell/provider.ts:47-52`: `NEG_SETS`, `SUBJ_SETS`.
- `src/gotell/productive/goals.ts:72`: `MODELS` (15 testimony model wordings, with an optional `{text, note}` form).
- `src/gotell/productive/practice.ts:51`: `LANG_NAME`.
- `src/ingest/quality.ts:152`: `EXPECTED_SCRIPT`.
- `src/ingest/language.ts:16`: `LANGUAGE_NAMES`.
- `scripts/integrate-reading-bridges.mts:8`.
- `scripts/merge-course-gap-materials.mts:23`.

### Silent (nothing fails if forgotten)

- `src/stage0/match.ts:13` and `:42`: the diacritic-lenient answer match is hard-coded to `es|de|sq` only, and `lang !== 'th' && lang !== 'hi'` lowercases.
- `src/ui/goread/JsonImporter.tsx:23`: a nested ternary ending in `'Hindi'` is the language name shown on a mismatch.
- `src/ui/scripture/canon.ts:22-23, 113-ish`: `ScriptureLang`, `SCRIPTURE_LANGS`, and the book-name columns (`COLUMN` is per language, not per edition).
- `src/ui/scripture/ScripturePage.tsx:45`: `lang !== 'sq' && isScriptureLang(lang)`.
- `src/ui/read/ReadPage.tsx:356`: the alphabet link, th/hi only.
- `src/ui/reader/assistance.ts:532`: `readingRank` switch (es/de/sq). An unknown language returns 0, so the first listed IPA wins.
- `src/golearn/rank.ts:45-52`: `regionalFit` is Spanish-only. Other languages fall into a loose default.
- `src/golearn/candidates.ts:165`: "historical" means variety matches `/-hist$/`. German's `de-1901` and `de-pre1901` are not caught.
- `src/dict/build.ts:26`: `DROP_FORM_PRONUNCIATIONS` (Partial).
- `src/ingest/language.ts:21-24, 95`: `PROFILES`. The Latin-script guesser has no `nb`, `nn`, `da` or `sv`, and the "Latin-script team" test names `es|de|sq` explicitly.
- `src/ingest/quality.ts:140`: `FUNCTION_WORDS` (Partial).
- `src/authoring/cli.ts:24`: `COURSE_MODULES` (Partial).
- `src/golearn/book.ts:33`: default `lang:'es'`. Harmless.
- Course catalogue wiring (silent, plain data maps):
  - `src/course/catalog.ts:35-52`: `LADDERS` and `STREAMS`.
  - `src/course/doors.ts:20-26`: `COURSE_DOORS`.
  - `src/course/index.ts`: must export `NORWEGIAN_WORKS` etc. `src/ingest/rightsCatalogue.ts:11` collects works by the export-name pattern `/_WORKS$/`. A wrongly named export would be missed by the rights gate.

### Hard-coded language lists in scripts and `package.json`

- `package.json` `build` script: `check-course-libraries.mts --require hi,de,es,th,sq`, and `dict-status.mts --require hi,de,es,th,sq`.
- `scripts/check-course-libraries.mts:13` (the `_WORKS` spread), `:31` (`combinedManifestLanguages`), `:49` (the loop over languages).
- `scripts/library-audit.mts:52`.
- `scripts/sync-library-catalogue.mts:20`.
- `scripts/audit-b2-ladder.mts:49`, `scripts/audit-corpus-redundancy.mts:10`, `scripts/simulate-learner.mts:29`.
- `scripts/prepare-curriculum-review.mts:50`, `scripts/prepare-reading-review-queue.mts:9`.
- `scripts/verify-scripture-canon.mjs:14` (`SOURCES`).
- `scripts/build-scripture-usfm-full.mjs` and `scripts/verify-scripture-usfm-full.mjs`: an inline `{de, es}` config.
- Generic through `LANGUAGES` or directory globs, so they need no edit: `scripts/dict-build.mts`, `scripts/library-build.mts`, `scripts/library-rebuild.mts`, `scripts/rights-gate.mts`; `src/ladder/bundle.ts:87-89`, `src/stage0/content.ts:73`, `src/ingest/index.ts:64` (globs); `src/library/library.ts:43`, `src/library/postings.ts:191`.

### Data and directories to create

- `data/corpus/nb/` must contain the seed trio (see section 10).
- `data/stage0/nb/`; `data/stage0/world.json` `characters[].names` gets `nb` entries (Partial).
- `data/ladder/nb/ladder.json` and `units/`.
- `data/sources/course-library/nb.json` (shape: `{schema, lang, entries[], withheld}`; each entry carries slug, `courseId`, stream, `rights{state, verifiedBy, verifiedAt, basis, statusByJurisdiction, canBundle}`, `source{file, kind, url, edition, attribution}`).
- `public/dict/nb`, `public/library/nb`, `src/course/acquired-library-works.json`, and a `nb` key in `reading-bridge-works.json`.
- `data/verified/scripture.json` only if a Bible is bundled.

### Course definition (copy `src/course/german.ts`)

- It has per-course constants (`GERMAN_COURSE_ID`, `LANG`), `stream()` and `shelf()` factories, `GERMAN_SHELVES` (kind `'shelf'`, `assistance: DEFAULT_ASSISTANCE`), rights helpers `BASE`, `lead`, `modern`, `COURSE`, a `works()` builder merging `acquiredWorks[LANG]`, `GERMAN_DOORS`, and `GERMAN_SCRIPTURE_POLICY`.
- The `Course.variety` policy lives in `src/core/config.ts:16-42`: Spanish `{target:'es-HN', within:['es-CA','es-419'], activeFeatures:['voseo']}`; Albanian `{target:'sq', within:[]}`; German `{target:'de-DE', within:[]}`.
- `preferredLocales` for Norwegian would be `['nb-NO']`. `AZURE_VOICES` needs `nb` entries. Azure is believed to have nb-NO neural voices and no nn-NO voice (unverified). An nn voice entry pointing at nb-NO would mispronounce Nynorsk. Synthetic speech never counts as listening evidence anyway (`src/golearn/eligibility.ts`, `synthetic-audio`).

### How `variety` and `VarietyPolicy` work (`src/core/variety.ts`)

- `varietyStanding(tags, policy, varieties)` returns `general | target | within-target | receptive | historical | heritage`.
- `Variety.kind` is `national | regional | supranational | feature | historical | heritage`. There is **no "written standard" kind**.
- `Text.variety` and `Work.variety` are a single string. `CorpusDocument.variety` must match `VARIETY_CODE = /^[A-Za-z0-9][A-Za-z0-9-]{0,23}$/` (`src/ingest/format.ts:345, 492`).
- Where `varieties` is actually consumed: the word-sheet line (`src/ui/reader/TokenCard.tsx:167`); the library profile `varietyShare` (`src/library/measure.ts:151, 223`), which feeds the difficulty "regional" share (`src/golearn/personal.ts:245-249`); the heritage skip in fold. It never partitions encounters.
- **Judgement:** for an nb course, `nn` standing would be `receptive`, which fits "introduced receptively". Dano-Norwegian and Landsmål would be `historical`, but the fixed `varietyLine` sentence says "not used this way today" (`src/core/variety.ts:73-74`). That is false for Riksmål, which still has a living norm, so the wording needs a per-variety override. Standards and eras are two axes (nb/nn × pre-1907, 1917, 1938, 1959, 1981, 2005). The single-string `variety` forces codes like `nb-1938`, and `varietyStanding` compares by string equality, so those would all be `receptive`.

---

## 2. Adapter contract (`src/core/adapters.ts:138-205`)

### Methods

- **Required:** `segmentSentences`, `tokenize` (offsets exact, `normalized` is the form identity), `normalize`, `searchNormalize`, `analyze` (candidates best-first, `analyzer: "adapter-xx@N"`), `detectPhrases`, `detectPatterns` (construction keys; the ladder gate counts these), `pronunciation`, `speechNormalize` (deterministic; the test requires `normalizerVersion === 'speech-xx@1'` and `at === 1970-01-01T00:00:00.000Z`), `display`, `checkProduction`, `relate(a,b): 'same'|'inflection'|'component'|'none'`, `lang`, `name`, `script`, `version` (matching `/^\d+$/`), `support`.
- **Optional:** `decode`, `decodeWithPronunciation`, `orthFeatures`, `describeOrthFeature` (Thai/Hindi writing-system items); `morphFromTags`, `varietiesFromTags` (map dictionary labels to morph or variety codes; unknown labels are ignored, never guessed); `refine(tokens, analyzed, analyzers, given)` (re-order readings by context after the importer swapped in dictionary readings; it may only reorder, lower a confidence, or set `notes.context`); `lemmaVariants(lemma, pos)` (other headwords the dictionary may file the lemma under); `describeMorph`; `varieties` (a `Record<string, Variety>`) and `sources` (an `AnalysisSourceInfo` record keyed by `sourceId`).

### `AnalysisCandidate` (lines 22-68)

- Fields: `lemma, pos, morph, notes, confidence, gloss, syllables, register[], role, definition, varieties[], parts[] (WordPart.kind: component|head|link|contracted|clitic|prefix|marker|stem), origin, sourceId, unit{head,pieces,role,display}, orthography{modern,period,confidence}, unconfirmed`.
- `notes` is a free `Record<string, string|string[]>`. Keys in use: `source:'rule'` (stored as 'machine' and stripped), `ipa`, `respelling`, `pronunciationSource`, `context`, `nameGuess`, `altOf`, `formOfTags`, `glossFrom`, `rule`.
- The importer is `src/ingest/plan.ts:1020-1110`. A `unit` candidate gives every piece the unit's lemma, and the encounter is counted once on the head (`src/golearn/analysis.ts:isNonHeadPiece/creditableLemmaId`).
- Version rule: the signature `${INGEST_TOOL}|…|${lang}@${adapter.version}` (`src/app/bootstrap.ts:~318`) re-imports and re-analyses the bundled texts, and rebuilds the learner state, when the version changes. Bump `VERSION` whenever analysis output changes.

### Best model for Norwegian

- **German is the main model:** `src/adapters/de.ts` plus `src/adapters/german/`: lexicon files (`lexicon-nouns/verbs/modifiers/course/ladder.ts`, `function-words.ts`, `entries.ts`, `types.ts`); the word-form engine (`morphology.ts`, `morph-*.ts`); the sentence layer (`context*.ts`, `sentence.ts`, `sentences.ts`, `refineGermanSentence`); `units.ts` (the multiword unit pattern), `prefixes.ts`, `compounds.ts` (split only into lexicon-known parts, marked unconfirmed at 0.55), `constructions.ts` (phrase rules and `detectPatterns`), `phrases.ts`, `production.ts`; `historical.ts` (listed pairs at 0.9, patterns at 0.5-0.7, gated on "the candidate is a known modern word"), `varieties.ts`, `tags.ts`.
- **Spanish:** dictionary-join discipline and context disambiguation (`src/adapters/spanish/disambiguate.ts`, `unconfirmed` readings, `capitalInside`).
- **Albanian:** dialect-to-standard correspondence without counting the dialect form as standard (`albanian/gheg.ts`, `varieties.ts` and its `varietiesFromTags`), plus a `checkProduction` that emits `category:'dialect'` (`albanian/production.ts:185, 193`). That is the precedent for flagging nn forms written in a Bokmål course.
- Norwegian specifics for later: solid compounds with linking -s-/-e-; enclitic definiteness; optional forms inside Bokmål itself ("boka/boken", "kasta/kastet"). Those are inflection-level variants of one lemma and fit `relate()='inflection'`. Verb particles are post-verbal and stranded, which is closer to German `units.ts` than to a prefix table.

---

## 3. Analysis data model: what exists and what is missing

### Exists

- **Register tags:** `RegisterTag` is a closed union (`src/core/course.ts:266-271`), already padded with language-specific members. Per analysis: `TokenAnalysis.register`, `AnalysisCandidate.register`, `DictionaryEntry.register` (`REGISTER_MAP` in `src/dict/map.ts`). Per work: `Work.registers`. Per text: `CurriculumMetadata.registers` (`src/course/curriculumPolicy.ts:14`). Dictionary sense tags are kept verbatim (`DictionarySense.tags`, e.g. "dated", "obsolete").
- **Concept families:** `src/adapters/hindi/registers.ts` is the only precedent. Groups like `need = ज़रूरत:pa,ev ; आवश्यकता:sk,fo`, with the stated rule "words of a group are NEVER merged; each keeps its own lemma and learner item". It is adapter-local. `registerGroupOf/registerGroupsOf` are called only from `test/adapters/hindi-lexicon.test.ts`. Only `registerOf` is used (`hi.ts:240`). There is no core contract, no UI, and no use in GoLearn "related seen".
- **Historical form to modern equivalent without editing the text:** `OrthographyRelation {modern, period, confidence}` on `AnalysisCandidate` and `TokenAnalysis`. Sources: German `historical.ts` (`de-1901`, `de-pre1901`), Albanian `historical.ts` (`sq-pre1972`), Spanish `historical.ts` (`es-hist`). The modern lemma is credited, and the form id stays distinct (`form:de:daß`). It is spelling-only. It cannot express a lexical or inflectional correspondence (jeg↔eg, boken↔boka).
- **Gheg-style correspondence:** `albanian/gheg.ts` is the same idea for dialect forms (`standard`, `rule`, `confidence`, `variety`).
- **Corpus authors:** `DocSpan` and `DocCorrection` (`src/ingest/format.ts:~65-88`) have no `orthography`, `varieties` or `register` fields. A human cannot annotate "this is Dano-Norwegian for X" in a corpus document. Only the adapter can.

### Missing

1. **Register as first-class data on lexemes and texts.** There is no `Lexeme` or `Lemma.register` (`Lemma` is `{id, lang, lemma, pos, gloss}`). Register on a lemma exists only through whichever analysis mentions it.
2. **A cross-lemma "same concept" relation with separate counts.** `relate()` is form-string level and returns `none` for jeg/eg, which is right for keeping them separate but gives no "related, not credited" signal. The "related seen" fallback is `src/golearn/queries.ts:~80-125`: same lemma through analyses, else `adapter.relate`. `src/gotell/text.ts:62` treats `relate !== 'none'` as "the same word", so a `variant` kind added to `relate()` would silently be read as the same word there.
3. **Standard and era as separate text axes.** `Text.variety` is single-valued, `Work.orthography` is free text, `Work.modernization` is `'original'|'normalized'|'modernized'`, and there is no per-text orthography era.
4. A `Variety.kind` for "written standard" (see section 1).

---

## 4. Encounter and mastery model

- **Item ids** (`src/core/ids.ts:30-36`): `form:<lang>:<normalized>`, `lemma:<lang>:<lemma>[:POS]`, `phrase:<lang>:<pattern joined by _>`, `pattern:<lang>:<key>`, `orth:<lang>:<feature>`. Learner item: `<userId>|<itemId>`. Encounter ids hash `(user, item, sentence, modality, session)`.
- **Which language's prefix:** it comes from `Sentence.lang` / `Token.lang`, which is `doc.lang`. It is not the course language. Everything downstream filters `row.lang === lang` (`golearn/recommend.ts:147,164`, `coverage.ts:317`, `queries.ts:132`, `readiness.ts:201`, `forecast.ts:151`, `occurrences.ts`).
- **What credits a lemma:** `creditableLemmaId` (`analysis.ts`). The analysis must be human, or have confidence ≥ `LEMMA_MIN_CONFIDENCE = 0.5` (`policy.ts`), and non-head unit pieces credit nothing. Both `form` and `lemma` items are credited per sentence view. Phrases and patterns come from stored occurrences (`src/golearn/items.ts`).
- **Evidence:** levels `unseen → encountered → recognized_with_help → recognized → rapid → recalled → used_with_assistance → used_independently → automatic`. Policy `evidence@8` (`policy.ts:11-125`): a sentence view is an exposure (weight 0); help raises the assistance of that sitting's encounters; a comprehension report demonstrates; production is first-wins per (item, sentence hash, modality). **Estimate** ("likely familiar"): ≥ 4 help-free encounters over ≥ 2 sittings with a clean tail, confidence 0.30. Listening is its own modality with its own sittings (`fold.ts:~60-90`). Only reviewed human speech counts (`eligibility.ts`).
- **So separate nb/nn counts work for free if `nn` is a LanguageCode.** If nn stays inside nb, jeg and eg already have different lemma ids, but identical spellings and all form-level items (`form:nb:hus`) merge, and `relatedSeen` can fire between them only through a shared lemma id.
- Fold has exactly one variety hook: the heritage early-return at `fold.ts:470-473`. A "credit these items under a standard-specific namespace" hook would go in the same `encounterSentence` function.

---

## 5. Rights model

### Present

- `RightsState` (`src/core/course.ts:~105-117`): `verified-public-domain | verified-open-licence | permission-granted | course-authored | recommended-only | user-supplied | rights-unverified | prohibited-from-bundling | research-only`.
- `WorkRights` fields: `state, jurisdiction, canModify, canStoreOffline, canBundleAudio, verifiedBy, verifiedAt, copyrightStatus, basis, licensing, permission, canBundle, userImportOnly, audiobook, audioRights, transcriptRights, acquisitionNotes, verified, sourceRepository, jurisdictions[], licence, attributionRequired, shareAlike, modifications, retrievedAt, checksum, proofreading, evidence[], sourceTerms, compliance, countryOfOrigin, editionYear, scanSource, transcriptionSource, modernizationSource, statusByJurisdiction, commercialUse`.
- `Work` adds `author, publisher, edition, isbn, translator, editor, authorDied, translatorDied, publicationYear, sourceUrl, orthography, modernization, readiness, pipeline{acquisition,parsing,proofreading}`.
- Gate: `bundleDecision` (`src/ingest/rights.ts`): **bundle** when the text is course-written, or public-domain/licensed with a catalogue work in a bundlable state (`BUNDLABLE_WORK_STATES`) that records verifier and date; **exclude** when rights are unverified, or when `GO_RELEASE_JURISDICTIONS` is set and the work's `statusByJurisdiction` does not cover every named jurisdiction; **refuse** for a claim without evidence, and for personal-copy or user-private rights. Scripture additionally needs translationId, edition and a `scripture.verification` record. `canModify` is declared but is not read by `bundleDecision`.
- Wiring: `scripts/rights-gate.mts` (catalogue consistency plus per-document report) and `server/rightsGate.ts` (a Vite plugin that nulls excluded corpus JSON). Both run in `npm run build`.
- `computePublished` (`src/ingest/publish.ts`): non-Scripture needs review ok with a named reviewer, rights established, content signature matching; generated or transformed text needs a native review; Scripture needs translation identity plus a complete `SourceVerification`.
- Library build: `library:build` refuses entries whose state is not verified.
- Audio rights are separate (`AudioRightsRecord`, `src/core/model.ts:595-615`).

### Gaps against the brief

- No author death date on the edition record (`authorDied`/`translatorDied` are numbers on `Work`, labelled "a lead for rights research, never a conclusion").
- No separate editor or digital-source records at edition level (`sourceUrl`, `sourceRepository` are free strings; no standard catalogue id).
- No licence name plus version (`licence` is free text). No machine-readable evidence source type, date checked (only `verifiedAt` and `retrievedAt`), or per-field reviewer notes.
- Territory is `statusByJurisdiction` plus `jurisdictions[]`; no "permission scope per territory".
- Permissions: `canModify` and `canStoreOffline` exist; redistribution is only implied by bundling; `commercialUse` is optional and not read by the gate; no "attribution text" field apart from `attributionRequired` (the text lives on the document's `source.attribution`).
- Audio rights are separate and richer but have no link back to a text's edition rights, and no per-speaker consent field.
- OCR provenance: `scanSource`, `transcriptionSource`, `proofreading` are free strings. No OCR engine/version, confidence, or per-page link.
- State vocabulary: `permission-granted` exists; `project-owned` = `course-authored`; `external-link-only` = `recommended-only` (no URL contract); `blocked` = `prohibited-from-bundling`; `unverified` = `rights-unverified`. The brief's `verified-for-bundling` has no direct equivalent (the verified states are public-domain, open-licence and permission-granted). No state for "verified for linking only, with a retained citation".
- No machine-readable per-work decision record with a reason timestamp beyond `verifiedBy/At` and `basis` text.

---

## 6. Scripture pipeline

### How a Bible gets in

1. An eBible USFM archive goes under `data/sources/<lang>-bible/usfm`.
2. `scripts/build-scripture-usfm-full.mjs` parses it into `data/sources/<lang>-bible/<id>-library-documents.json`: one document per chapter, one sentence per verse, `verseRefs:["GEN.1.1"]`, `scripture{translationId, translationName, edition, book, chapter, verification{…method:'publisher-file'}}`, work slug `bible-<lang>`, `chapter.index = running canon number`.
3. `scripts/verify-scripture-usfm-full.mjs` writes verse text and hashes into `data/verified/scripture.json` (`translations[]` keyed by lang + translationId).
4. A manifest entry in `data/sources/course-library/<lang>.json` then lets `library:rebuild` build `public/library/<lang>`.
5. The Scripture page (`src/ui/scripture/*`) reads the canon tree. Rights state comes from the manifest entry. `BIBLE_ACCESS` documents the route.

### Identity and verification a translation needs

`translationId`, `translationName` and `edition` in each document; a `SourceVerification{against, url, checkedAt, method, by}`; a catalogue work with a bundlable state. Without these, `bundleDecision` refuses the document.

### Hard limits for a multi-edition language

- **One edition per language:** `verify-scripture-canon.mjs:43` throws "mixed editions in canonical library". `SOURCES` (line 14) maps one source per language. `BIBLE_ACCESS` has one record per language. The work slug is hard-coded `bible-${lang}`, so two editions would collide on chapter indexes.
- **Hard-coded Protestant 66-book `CANON`** (`src/library/canon.ts`, `scripts/lib-canon.mjs`). A Bible with the Apocrypha or different chapter divisions would hit "unexpected refs".
- **Book names:** the UI has one column per language (`canon.ts`), not per edition.
- Luther 1912's bracketed parallel numbering is stripped at display time in the Reader (commit eefd9e5). A new Norwegian edition could need a similar rule.

### The 2026-10-06 duplicate/shadowing fix (eefd9e5)

- `src/ui/scripture/ScripturePage.tsx:~118-135`: `superseded` hides a bundled sample chapter when the library holds the same address with at least as many sentences.
- It is **edition-blind**. `sentencesAt` is keyed `${book}.${chapter}`, and `sameScriptureText` compares only `id + lang`. With two editions in one language, a sample of edition A would be hidden by a library chapter of edition B. The same applies to `isSupplementalScripture` (`src/course/scriptureIntegrity.ts`).

### Do the canon integrity checks cover the cases?

- **Covered** (`verify-scripture-canon.mjs`, `scriptureChapterIssues`): duplicate canonical address (edition + book + chapter); duplicate catalog text ids; duplicate or out-of-order verse refs; cross-chapter contamination; missing books and chapters against the fixed canon; unexpected refs; installed wording and verse count equal to the protected source.
- **Not covered:** gaps inside a chapter (verse numbers only need to ascend); sample/library overlap (UI only); collisions between two editions; the seed corpus (`SOURCES` passes `undefined` for the corpus argument).

---

## 7. GoTell

- **Suggestions never add content.** `finalize` (`src/gotell/service.ts:~205-260`) drops any suggestion whose new words are not already met. "Met" means `isEncountered(k)` plus at least one source sentence. Lemma ids are language-scoped, so nn items cannot satisfy an nb suggestion if they are separate languages.
- **Repairs** come from the adapter's `checkProduction` replacements. **Recombinations** slot the learner's words into a known phrase (`provider.ts`). Neither looks at a variety or register of the phrase.
- **Register exists as error categories** (`src/core/model.ts:850-855`): `register` and `dialect`, with taxonomy family 'register' (`productive/taxonomy.ts:31, 38`). The Albanian adapter already emits them (`albanian/production.ts:185, 193, 555`). So the mechanism for "you wrote an nn form in a Bokmål course" is an adapter rule. Gating suggestions by register is not possible without a core change, because `Phrase` and `GoTellSuggestion` carry no register.
- **Model wordings** (`productive/goals.ts:72`): 15 testimony sentences per language. The `{text, note}` form already exists for gender notes (Hindi `HI_MASC`), so a Norwegian wording can carry a register or standard note.
- **Concept tables** (`src/gotell/concepts.ts`): stem/form/lexeme tables per language for ~19 concepts, plus negators, chronology words and subject pronouns. All Norwegian entries need a native pass and an nn variant if nn is a separate language.

---

## 8. GoListen audio metadata

`AudioImportManifest` (`src/core/contracts/golisten.ts:8-30`) and `AudioAsset` (`src/core/model.ts:647-694`):

| Brief field | What exists | Gap |
|---|---|---|
| speaker id | `narrator` (free string), `performance.performer` | no stable id |
| native/reviewer status | `qualityState` (unreviewed → approved), curated-import `reviewer` + `reviewedAt` (`ImportRecord`) | no native-speaker flag, no competence |
| region / locality | `locale` (required), `variety?` (free string) | one field for dialect, region and standard; no locality (e.g. "Bergen") |
| dialect / variety | `variety?` | same single string; no vocabulary check against the adapter's `varieties` |
| written standard of the text | not on the asset | the `Text.variety` is the only link |
| spoken transcript vs normalized text | import requires `textSha256` of the exact canonical text (`import.ts` hash check) | **cannot represent a spoken form that differs from the text** (e.g. "e" for "ikke"). TTS keeps `speechText` and `displayText` on segments, imports do not |
| rights / licence / attribution | `recording.owner/basis/license/attribution`, `AudioRightsRecord` (playInApp, stream, offline, redistribute, segment, transform) | adequate |
| alignment granularity / confidence | import `coverage[]` is sentence-level only, with `reviewState: 'checked'|'reviewed'`; `AudioAlignment` supports `unit: sentence|phrase|word`, `method`, `confidence`, `alignerVersion` | import cannot supply word-level or a confidence |
| verification state | `qualityState`, voice `reviewStatus`, import `origin: learner|curated` | adequate; a learner import is capped at `machine_checked` |

Event snapshots (`narratorOrVoiceId`, `locale`, `variety`, `qualityState`) are descriptive only. They are never compared with the asset later (`eligibility.ts` header, `progress.ts:117-133`).

---

## 9. Curriculum metrics already present

- **Ladder gate** (`src/ladder/gate.ts`, `policy.ts`, `analyse.ts`), run by `ladder:check` and `ladder:place`: coverage of running words whose lemma was met ≥ 3 times before (bands: controlled warn 0.88/error 0.85, authentic 0.92/0.88, first two units 0.85/0.78); cliff (drop vs the mean of the previous 3 units: warn 6, error 12 points); new lemmas per 100 words (warn 5, error 9); recycling (new lemmas must return ≥ 3 times within the next 6 units; warn above 25 % unmet); Scripture share per stage (warn above 40 %); constructions first met (from `detectPatterns`); missing and invalid unit documents. Stage names are fixed: `a1-1, a1-2, a2-1, a2-2, b1-bridge` (`src/ladder/types.ts`).
- **Counting method** (`analyse.ts`): the first candidate's lowercased lemma stands for each word; PROPN, numerals and listed abbreviations count as known; a compound counts as one lemma; `parts` and `unit` are not consulted. These are the "raw" counts.
- **Authoring report** (`src/authoring/*`, `authoring:report`): lemma flags `once | twice | single-text | one-form | clustered | late-gap`, gap statistics in words and documents, per-stage new lemmas, unread and guessed tokens, and budgets. It is a report for authors, not a gate.
- **Simulator** (`src/sim/*`, `scripts/simulate-learner.mts`): runs the real recommend loop over the real bootstrap.
- **`stage0:validate`:** per-scene new-word budget and coverage along the path, exit-form coverage, adapter checks.

### What the brief asks that these lack

- **Orphan vocabulary as a gate.** The authoring report's `once` flag is the nearest thing, and nothing fails a build.
- **Recurrence timing and widening intervals.** Gap statistics exist, but there is no target schedule and no check that gaps widen.
- **"Raw vs linguistically informed" counts.** The ladder always counts raw first-candidate lemmas. There is no second count with compounds split, `unit` pieces merged, or inflection variants folded.
- **Per-standard and per-register coverage.** The ladder counts all lemmas together.

---

## 10. Tests and build

### Gates in `npm run build` (`package.json`)

`tsc -b` → `rights-gate.mts` → `check-course-libraries.mts --require hi,de,es,th,sq` → `verify-scripture-canon.mjs` → `library-audit.mts all` → `dict-status.mts --require hi,de,es,th,sq` → `vite build`.

- `GO_ALLOW_MISSING_CONTENT=1` waives the `--require` lists. `GO_RELEASE_JURISDICTIONS` tightens the rights gate.
- `library-audit all` iterates the list at `scripts/library-audit.mts:52`.

### Tests parameterised over `LANGUAGES` (adding `nb` forces fixtures)

- `test/adapters/registry.test.ts`: order equals `LANGUAGES`; script and whitespace match `LANGUAGE_ROWS`; only Thai shows boundaries; `version` matches `/^\d+$/`.
- `test/adapters/verification.test.ts`: every adapter must declare `lemmatization: 'seed-only'` and mention it in its limitations (at least 3 limitations of > 20 characters); `productionChecks` must not be `dependable`; nothing but tokenization may be `dependable`.
- `test/adapters/offsets.test.ts`: a `SAMPLES` record keyed by language, plus every bundled sentence.
- `test/adapters/speech.test.ts`: a `WITH_MARKERS` record by language; the speech version string `speech-<lang>@1`; a number-to-words rule.
- `test/ingest/corpus.test.ts:28-32` and `test/ingest/seed.ts:4`: each language must have exactly the seed trio `story-01`, `dialogue-01`, `bible-1john-1` (8-12 sentences, 6-8 sentences, 3 sentences, each with English rescue). The explicit expected list is `['de','es','hi','sq','th']`.
- `test/ingest/ingest.test.ts` (lines 55, 141, 174, 197, 213, 234), `origins.test.ts:260`, `spans.test.ts`, `test/gotell/units.test.ts`.

### Hard-coded language arrays (not tied to `LANGUAGES`)

- `test/ui/onboarding.test.tsx:32`: the expected team list `['Honduras','Albania','Thailand','India','Germany']` (order = `COURSES` order).
- `test/db/dexie.test.ts:88`: `languages.count() === 5`.
- `test/course/bibleAccess.test.ts:6`: the exact sorted key list of `BIBLE_ACCESS`.
- `test/dict/status-cli.test.ts:23`.
- `test/golisten/support.ts:13`, `test/golisten/fixtureProvider.test.ts` (a `SAMPLE` record).
- `test/golearn/testAdapters.ts:75`.
- `test/course/albanianCatalog.test.ts:84`.
- `test/integration/compat.test.ts`.

### Naming convention

Tests are named per language and area (`german-*.test.ts`, `spanish-*.test.ts`, `hindi-*.test.ts`, `albanian-*.test.ts`), with shared helpers in `test/adapters/helpers.ts`. Course tests: `test/course/*Catalog.test.ts`, `test/integration/<lang>-course.test.ts`.

---

## (A) Checklist: files to change to add `nb` (and optionally `nn`)

### Core and config

1. `src/core/model.ts:16-17`: add `'nb'` (and `'nn'` if it is a separate code) to `LanguageCode` and `LANGUAGES`.
2. `src/core/config.ts`: add `LANGUAGE_ROWS` rows (Latn, ltr, whitespace-delimited) and a `COURSES` entry (`norway-nb`, `preferredLocales: ['nb-NO']`, `variety`). Append at the end to keep `COURSES[0]` and the team order stable.

### Adapter

3. `src/adapters/nb.ts` plus `src/adapters/norwegian/**` (see section 2 for the shape to copy).
4. `src/adapters/index.ts:15-17`: the import and `BY_LANG` row.
5. `src/adapters/norwegian/varieties.ts`: the `Variety` table (nb, nn, Dano-Norwegian/Riksmål, Landsmål, era codes).
6. `src/adapters/norwegian/historical.ts`: spelling relations by reform period.

### Course

7. `src/course/norwegian.ts`: streams, shelves, rights helpers, works, doors, scripture policy.
8. `src/course/index.ts`: export `NORWEGIAN_*`. The `*_WORKS` export name is required by the rights gate.
9. `src/course/catalog.ts:35-52`: `LADDERS` and `STREAMS`.
10. `src/course/doors.ts:20-26`.
11. `src/course/curriculumPolicy.ts:41-42` plus the five-band `constructions` row.
12. `src/course/bibleAccess.ts:23`.

### Data and dictionaries

13. `data/corpus/nb/` with the seed trio (story-01, dialogue-01, bible-1john-1, each with English rescue).
14. `data/stage0/nb/**` and `world.json` names.
15. `data/ladder/nb/ladder.json` and units.
16. `data/sources/course-library/nb.json`.
17. `public/dict/nb` via `dict:build`. `DROP_FORM_PRONUNCIATIONS` in `src/dict/build.ts:26` if wanted.

### Stage 0 and voice

18. `src/stage0/lang/index.ts:13`: a `Stage0LanguageConfig` (voiceLangs `['nb-NO','nb','no']`, spelling features for kj/skj/sj, ø/å/æ, retroflex rs, silent d/g).
19. `src/stage0/match.ts:13, 42`: add nb to the diacritic-lenient branch.
20. `src/golisten/azureProvider.ts:33` and `fixtureProvider.ts:19`: voice tables.
21. `src/ui/reader/assistance.ts:~520-540`: add a `readingRank` branch for nb pronunciation tags.

### GoTell

22. `src/gotell/concepts.ts` (four tables), `src/gotell/provider.ts:47-52`, `src/gotell/productive/goals.ts:72`, `src/gotell/productive/practice.ts:51`.

### Ingest and UI

23. `src/ingest/language.ts:16, 21, 95` (add `nb`, and Danish/Swedish profiles so Danish is not accepted as Norwegian), `src/ingest/quality.ts:140, 152`.
24. `src/ui/goread/JsonImporter.tsx:23` (language name), `src/ui/scripture/canon.ts` and `ScripturePage.tsx:45` if Scripture is offered.
25. `src/golearn/rank.ts:45-52`: generalise `regionalFit`. `src/golearn/candidates.ts:165` if the historical suffix convention is kept.

### Scripts and build

26. `package.json` `build`: add `nb` to both `--require` lists once the content exists.
27. `scripts/check-course-libraries.mts:13, 31, 49`, `library-audit.mts:52`, `sync-library-catalogue.mts:20`, `audit-b2-ladder.mts:49`, `simulate-learner.mts:29`, `integrate-reading-bridges.mts:8`, `merge-course-gap-materials.mts:23`, `src/authoring/cli.ts:24`.
28. Scripture only: `verify-scripture-canon.mjs:14`, `build-scripture-usfm-full.mjs`, `verify-scripture-usfm-full.mjs`.

### Tests

29. Update the fixtures and lists named in section 10, plus new `test/adapters/norwegian-*.test.ts`.

### Docs

30. `docs/ARCHITECTURE.md`, `docs/READINESS.md`, `docs/BIBLE_ACCESS.md`, `docs/audits/COURSE-AUDIT-2026-10-06.md` (course status lists), plus a new `docs/NORWEGIAN_COURSE.md`.

### Extra for `nn` as a second code

31. Repeat items 1-5, 13-22 for `nn`. Add `Course.readsLangs` support to `bootstrap.ts`, `TextPage.tsx`, `golisten/voices.ts` and the library language filters, or accept a separate "Norway (Nynorsk)" team.

---

## (B) Shared abstractions Norway needs that are missing

1. **A text/work `standard` + `era` pair** (core model, `Text` and `Work`, replacing the single `variety` string for this purpose). Today there is only one string, and the ranker, the library filter and `varietyStanding` all compare it by equality.
2. **A cross-standard concept family with separate counts** (`src/core/` contract, `LanguageAdapter.family?(lemma, pos)`). It should return family members with their standard and register, never merge item ids, and feed `relatedSeen` (`src/golearn/queries.ts`) as a distinct "related, not credited" signal. The Hindi `registers.ts` table is the data shape to promote.
3. **A variant relation kind in `relate()`** (or a separate method). It must be distinguishable from `inflection` so that `src/gotell/text.ts:62` does not treat nn "eg" as the same word as nb "jeg".
4. **`Course.readsLangs` (companion languages)** in `src/core/model.ts`, with matching changes in the places listed in headline 1. Without it, nn texts cannot be read from an nb course.
5. **Corpus-level annotation fields** on `DocSpan` and `DocCorrection` (`src/ingest/format.ts`): `varieties`, `register`, `orthography`. They would let a human record "this Dano-Norwegian form is modern X" without an adapter rule.
6. **Multi-edition Scripture per language:** an edition-keyed `BIBLE_ACCESS`, `SOURCES`, work slug, book-name table and `ScripturePage` supersession (edition-aware). The canon check should also learn a configurable canon.
7. (Smaller) A `Variety.kind` of `'standard'` (written norm), a per-variety `varietyLine` text override, an AudioImportManifest `spokenTranscript?`, `speaker{id, native, region, locality}`, `alignmentUnit`, and an optional "linguistically informed" count in `src/ladder/analyse.ts`.

---

## (C) Risks to the five existing courses and how to avoid them

- **Adding to `LANGUAGES` changes every parameterised test and every `Record<LanguageCode,…>`.** Do it in one commit with the typecheck and the fixtures, and append `nb` last in every list so existing order-dependent assertions keep their positions.
- **`COURSES.find(c => c.lang === lang)` assumes one course per language.** Never give two courses the same `lang`.
- **Silent switches** (section 1). The worst for current users would be changes to `rank.ts:regionalFit`, the shared `candidates.ts:165` historical rule, and `readingRank`. Any generalisation must keep the existing es/de/sq outputs bit-identical; add golden tests before touching them.
- **`RegisterTag`, `Variety.kind`, `ErrorCategory` and `RightsState` are closed unions** shared by all courses. Adding members is safe for types but changes any exhaustive `switch`/`Record` over them. Search for `Record<RegisterTag` and `Record<RightsState` before adding.
- **Evidence policy `evidence@8`.** Any change to fold changes learner state for all courses. Bump `POLICY_VERSION` deliberately and keep new behaviour behind a variety kind that no existing adapter uses.
- **The library and dictionary pipelines are generic by lang directory.** A bad `nb` manifest can only fail `library:build` for `nb`, but `library-audit.mts all` and `check-course-libraries.mts` iterate fixed lists: add `nb` to `--require` only when its content is committed, or the build breaks for everyone.
- **`fitsTeamLanguage` and `guessLanguage`** are shared. Adding `nb` and `da` word profiles changes the share ranking for all Latin-script guesses; keep the thresholds and verify with the existing language tests.
- **Danish text will pass as Norwegian** unless a Danish profile and a Danish/Norwegian-distinguishing marker list are added.
- **Scripture:** adding a second edition for a language trips "mixed editions", the work-slug collision, and the edition-blind sample hiding. Do not retrofit German/Spanish/Hindi/Thai builders; give Norwegian its own builder and make the `ScripturePage` supersession key include the edition before any language gets a second Bible.
- **Backups and Dexie:** learner events carry `lang`. New language ids are additive, but the `languages.count() === 5` test must change.
- **Rights:** several states and the jurisdiction check were designed for eBible-style sources. Add any new fields as optional so existing works validate unchanged.
