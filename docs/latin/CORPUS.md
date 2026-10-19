# Latin corpus (`data/corpus/la`)

Sixteen schema-version-2 documents, 1,073 sentences, all public domain, built by `scripts/corpus-la-build.mts` from texts already on this PC
(nothing is downloaded, nothing is retyped). The coverage probe (`scripts/probe-linguistic-coverage.mts`) reads them as it reads the other
languages: `sections -> paragraphs -> sentences[{text}]`.

## Sources and licences

| Source | What | Licence |
|---|---|---|
| Clementine Vulgate (1592), USFX from `seven1m/open-bibles`, held by `vetus-v0/data/vulgate/lat-clementine.usfx.xml` | the `vulgate-*` Scripture slices | public domain |
| Francis Ritchie, *Fabulae Faciles* (1903), Latin Wikisource wikitext held by `romance-v0/data/la/ritchie-fabulae-faciles.wikitext.json` | the four `ladder-ritchie-*` tales | text public domain (1903); the Wikisource transcription is CC BY-SA 4.0 (named in each document's `attribution`) |
| Caesar, *De bello Gallico* I.1-7, Latin Wikisource edition with vowel length marked, held by `romance-v0/data/la/caesar-bg-1.text.json` | `ladder-caesar-bg-1` | text public domain; the edition (macrons, transcription) is CC BY-SA 4.0 (named in the document) |
| World English Bible (eBible.org `eng-web`), copied from the German/Hindi corpora | the optional `english` line on single-sentence Scripture verses | public domain |

Every document records its source in `source` (`attribution`, `provenance`, `url`, `licenseNote`, `rights: public-domain`, `sourceHash` = SHA-256 of
the source file, `modifications`). Review status: the Scripture slices are `reviewed` by scripts/verify-la-scripture.mts (byte comparison with the USFX file); the ladder texts are `unreviewed`: the text is a mechanical copy, not proofread against a printed edition.
Excluded on purpose: romance-v0's own pedagogical stories (`data/curriculum/stories`, "app_generated", not public domain), the other Wikisource
works in `romance-v0/data/la` (Cicero, Vergil, Augustine ... - not wanted for the lowest rungs), and any machine-drafted dialogue.

## Slices and counts

| File | Content | Sections | Verses / sentences | with `english` |
|---|---|---|---|---|
| `vulgate-gen-1` | Genesis 1 | 1 | 31 / 31 | 31 |
| `vulgate-psa-1` | Psalm 1 | 1 | 6 / 6 | 6 |
| `vulgate-psa-23` | Psalm 22 (23 Hebrew numbering) | 1 | 6 / 6 | 6 |
| `vulgate-1john-1` | 1 John 1 | 1 | 10 / 10 | 2 |
| `vulgate-john-1` | John 1 | 1 | 51 / 51 | 0 |
| `vulgate-john-3` | John 3 | 1 | 36 / 36 | 1 |
| `vulgate-luke-2` | Luke 2 | 1 | 52 / 52 | 0 |
| `vulgate-mat-1` | Matthew 1 | 1 | 25 / 25 | 25 |
| `vulgate-mat-5` | Matthew 5 | 1 | 48 / 48 | 0 |
| `vulgate-mat-6` | Matthew 6 | 1 | 34 / 34 | 0 |
| `vulgate-mark-1` | Mark 1 | 1 | 45 / 45 | 45 |
| `ladder-ritchie-perseus` | Perseus (sections 1-11) | 11 | 85 | - |
| `ladder-ritchie-hercules` | Hercules (12-56) | 45 | 300 | - |
| `ladder-ritchie-argonauts` | The Argonauts (57-80) | 24 | 156 | - |
| `ladder-ritchie-ulysses` | Ulysses (81-100) | 20 | 150 | - |
| `ladder-caesar-bg-1` | De bello Gallico I, chapters 1-7 | 7 | 38 | - |

The Scripture slices are the passages the other corpora share (Genesis 1, Psalms 1 and 23, 1 John 1, John 3, Matthew 1, Mark 1) plus John 1, Luke 2
and Matthew 5-6, so cross-language ladders line up. They are whole chapters; the German/Albanian/Hindi seed `bible-1john-1` (1 John 1:8-9 and
John 3:16) is contained in `vulgate-1john-1` and `vulgate-john-3`. The file ids are deliberately NOT `bible-1john-1`: that id is a seed id
(`test/ingest/seed.ts`) and would join the three-seeds-per-language assertions of `test/ingest/corpus.test.ts`.

## Rules the builder follows

- **Text exactly as the source.** Clementine spelling (`ae` as the ligature `æ`/`œ`, `i`/`j`, `u`/`v` as printed, spaces before `:` `;` `?`), no macrons
  added; Caesar keeps the edition's macrons. Test `test/corpus/la.test.ts` joins every verse's sentences back and compares byte for byte with the USFX file.
- **Sentences.** Scripture: ONE VERSE = ONE SENTENCE (id = the reference, `verseRefs` = [reference]), like the other languages, so that the verification contract
  (`scripts/verified-scripture.ts`, which compares a sentence with the joined text of its verses) can verify every sentence. A Vulgate verse may therefore hold several clauses
  (`:` and `;` are commas in the Clementine) or even several sentences. The ladder texts (Ritchie, Caesar) are split after `.` `?` `!` (plus closing quote or bracket) followed by space and a
  capital, quote or bracket; one-letter abbreviations (`M. Pisone`, `P.`, `a. d. V. Kal. Apr.`) do not end a sentence.
- **Ids and references.** Scripture: USFM reference (`JHN.3.16`) as `id` and `verseRefs`. Ritchie: `perseus.<section>.<n>`; Caesar: `bg1.<chapter>.<n>`.
  Psalm 23 uses the Hebrew number in references (the Vulgate calls it 22) so it lines up with the other languages.
- **English** is attached to the verses that the German or Hindi corpus already carries with a World English Bible line (copied verbatim; 116 verses).
- **Ritchie.** Only the Latin paragraphs; the italic English argument before each tale is dropped; section titles are Ritchie's English headings (titles only, never sentence text).
  One stray U+FFFD in the stored copy (Hercules 23.5, before *neque*) is removed and recorded in `modifications`.
- **Verification.** Each Scripture document carries `scripture.verification` and `review.status: reviewed` (by `scripts/verify-la-scripture.mts`). That script writes ONE translation record
  (`latVulgClementine`, the 344 bundled verses, Psalm 23 under its Hebrew-numbered refs) into `data/verified/scripture.json`, which `corpus:check` and `test/corpus/la.test.ts` (`checkVerifiedScripture`) read.
  It is a copy-integrity check against the same USFX file the text was built from, not an independent second edition; the provenance says so.
- **Rights.** `src/course/latin.ts` (`LATIN_COURSE_ID` `latin-la`, `LATIN_WORKS`, exported from `src/course/index.ts`) holds three works with `verified-public-domain` records:
  `ritchie-fabulae-faciles` (chapters 1-4 = the four tales), `caesar-de-bello-gallico-1`, `vulgata-clementina` (chapters 1-11 = the slices in build order). Every document carries `work: { slug, chapter }` and `streams`.
  The records say what was NOT established from a primary source (Ritchie's death year for EU/DE; the rights note read directly in seven1m/open-bibles). `npm run rights:check` reports all 16 documents as bundled.

## Rebuild

```
node scripts/corpus-la-build.mts           # writes data/corpus/la/*.json (needs ../vetus-v0 and ../romance-v0, or LA_VETUS_ROOT / LA_ROMANCE_ROOT)
node scripts/corpus-la-build.mts --check   # builds in memory and fails if a file on disk differs
node scripts/verify-la-scripture.mts       # (re)writes the Latin record in data/verified/scripture.json (--check: fail if it differs)
npx vitest run test/corpus --reporter=dot
```

The builder refuses to run when a source file is missing. Output is deterministic (fixed verification date), so a rebuild is byte-identical.

## Open points for the integrators

- `la` has no language adapter yet (`src/adapters`): every test that imports the whole bundled corpus (`corpus.test.ts`, `format.test.ts` "accepts every bundled document", `cli.test.ts` `corpus:check`/`corpus:migrate`) fails with "no adapter for language la" until it exists.
- `test/ingest/corpus.test.ts` needs `LATIN_WORKS` in its `COURSE_WORKS` list and `'la'` in the list of languages with a verification record (`['de','es','hi','th']`).
- Not provided: the other languages' seed trio (`story-01`, `dialogue-01`, `bible-1john-1`); a story or dialogue would have to be machine-drafted, which was not wanted.
- The Latin course is not registered in `src/course/catalog.ts` (the store catalogue) or in `scripts/check-course-libraries.mts`; `LATIN_STREAMS` and `LATIN_SHELVES` exist for when it is.
