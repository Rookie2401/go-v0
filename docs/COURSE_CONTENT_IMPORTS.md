# Course content imports — 2026-10-02

Sol coordinated three GPT-5.6 Luna workers. Sources were acquired once and cached; no separate paid generation API was used. Books are held in the lazy library and imported into the learner's database when opened. Original Scripture seed documents are preserved; the lazy remainder omits those original seed verses and retains references for its own verses. A separate partial-chapter ID prevents the original seed from hiding the remaining verses.

## Installed sources

- Hindi: complete IRV 2019 Bible (66 books, 31,104 verses including original seed references), 124 individually licensed GDL children's books, and the six-act *अंधेर नगरी*. The lazy library holds 1,310 published documents and 858,467 analyzed words. The children's books contribute 80,752 words. One eligible GDL EPUB with replacement characters is withheld. The official Kaikki dictionary is installed: 38,635 entries, 35,814 forms, 256 shards.
- Thai: Biblica Open Thai Common Version 2025, immutable release `a62f327aa0179709-rev2`, CC BY-SA 4.0. USX and USFM agree on all 31,087 nonblank verses; 16 source slots are blank. The library contains 1,189 published chapters and 863,775 analyzed words. The unverified older Scripture fixture remains excluded.
- German: 36 registered works, 1,860 published documents, and 2,523,188 analyzed words. This includes the complete Luther 1912 Bible, 33 Gutenberg editions, 210 Grimm stories from the 1850 sixth edition, and Hauff's complete canonical 1826 Almanach section. Selected-volume editions, such as Mommsen Book 1 and the 14-tale Bechstein collection, are explicitly labelled in the catalogue.
- Spanish: 20 installed works, 1,929 published documents, and 2,603,567 analyzed words, including the complete nonblank Reina-Valera 1909 Scripture archive. Six accepted sources are withheld: two English-annotated editions fail the language check and four have unresolved OCR-confusion flags. The copyrighted Gutenberg edition of *La Celestina* is excluded. Exact editions and all candidate outcomes are retained in the source manifests and `data/sources/gutenberg/dispositions.json`.
- Albanian now has a licensed contemporary article collection and a linked Bible route; see the acquisition-ladder additions below. Historical/Gheg recommendations remain distinct from modern-standard reading.

## Acquisition-ladder additions

The final installed totals supersede the baseline counts above:

| Language | Added published reading units | Final installed works / documents | Final analyzed words |
|---|---:|---:|---:|
| German | 11 GDL short readers (1,008 words) | 47 / 1,871 | 2,524,196 |
| Spanish | 9 GDL readers (8,100 words) | 29 / 1,938 | 2,611,667 |
| Hindi | 2 complete early Premchand stories (7,536 words) | 5 / 1,312 | 866,003 |
| Albanian | 23 contemporary article sections (8,707 words) | 1 / 23 | 8,707 |
| Thai | 12 new drafts, unpublished | 1 / 1,189 | 863,775 |

These add 45 published reading units and 25,351 analyzed words. Source attribution and exact revisions/editions are retained. Albanian articles are an intermediate bridge, not beginner or CEFR-certified lessons. Hindi's 124 GDL records contain 92 unique content signatures; duplicate bodies are not additional exposure. Two Albanian units and three Spanish bridge candidates were withheld for source problems. Thai-Vietnamese transliteration records were not mistaken for Thailand Thai-script reading.

Every language has a Bible implementation route: four verified bundled editions and Albanian's external Bibla Shqip “Së bashku” 2020 (AL), credited to the Interconfessional Bible Society of Albania. Personal-copy import provides ordinary reading, not Scripture verse navigation. See `docs/BIBLE_ACCESS.md`.

The updated reading home samples each available reading stream, including short readers, so thousands of Scripture chapters cannot crowd out early reading. Installed bridge documents were opened through the actual library service; opening imports the selected document rather than the whole collection.

There are 126 unpublished generated drafts in the native-review queue (15,050 measured words/tokens), including the 12 distinct new Thai stories with complete English glosses. Do not publish these without native review. Allocate 60–70% of human review to A0–B1 material and 20–30% to Albanian/Hindi quality. These additions improve the ladder but do not establish a continuous first 50–100 hours of suitable reading. Thai still needs reviewed secular beginner material; modern Albanian needs expansion and linguistic review. See `docs/READING_LADDER_AUDIT.md` and `docs/READING_REVIEW_QUEUE.md`.

## Rebuild and verify

Run from `C:\Users\CJWal\dev\go-v0`. Generated dictionaries and `public/library/` are ignored by Git, so retain the source inputs for reproducible local builds. The build reads `data/sources/course-library/<lang>.json` (the manifest of every work; it is the source of truth) and the retained source files named in it. It needs the five installed dictionaries (`public/dict/<lang>/manifest.json`; `npm run dict:build`, `npm run dict:status`) and no network.

### One command per language

```text
npm run library:rebuild -- hi      # also: de, es, sq, th, or all (one after the other)
```

`library:rebuild` rebuilds that language's whole library into `public/library/<lang>/` and leaves it in a state where `npm run library:audit -- <lang> --deep` passes. Options: `--out <dir>` (rebuild somewhere else first, for example a scratch directory; the library is only moved into place when the build succeeded), `--date YYYY-MM-DD`, `--dict <dir>`, `--audit shallow|deep|none` (default shallow; `deep` takes hours for de and es, add `--limit N` for a sample), `--no-sync`, `--skip-prepare`. In order:

1. **prepare** (Hindi only). `scripts/prepare-hi-gdl-collection.mts` rebuilds the 92 GDL books from the cached extracts, writes every string in Unicode NFC, grades the books onto Classes 1-4 and makes the GDL entries of `course-library/hi.json` name the same books. `scripts/verify-hi-usfm.mjs --check-only` compares the IRV source with the publisher archive without writing `data/verified/scripture.json` (run it without `--check-only` only to refresh that record on purpose).
2. **order.** `library:order <lang>` puts the inputs in order (canon order, chapter numbers, duplicates, apparatus). Idempotent: a second run changes nothing.
3. **build.** `library:build` **with `--dict public/dict`**. The stored profiles are then exactly what a learner's device measures today with today's adapters and dictionary. This is the dictionary-aware profile refresh: profiles go stale when a library is built without the dictionary, or built once and left while an adapter or the dictionary moves on. (`library:refresh` re-measures an installed library without rebuilding, into a separate directory; a rebuild makes it unnecessary.) A build with the dictionary takes roughly 1 to 1.5 hours for de and es, about 40 minutes for hi and th, and seconds for sq on this machine; run the languages in parallel.
4. **sync.** `library:sync-catalogue --lang <lang>` makes the catalogue say which works are really installed (a dry run when `--out` is not `public/library`).
5. **audit.** `library:audit <lang> --library <out>`: structure, catalogue, order, titles, sentences. `--deep` adds the fresh-import comparison of every text.

Then, once after rebuilding any language: `npm run rights:check`, `npm run library:check` (add `--library <dir>` to check a scratch rebuild; it validates every document, rights, publication, index counts and Scripture wording) and the reading-ladder steps below.

### What the build guarantees (2026-10-06)

- **Sentences.** A paragraph stored as one very long declared sentence (a document source with one "sentence" per paragraph: Grimm, Hauff, Andher Nagari, the selected Vetal tales) is handed back to the language adapter's `segmentSentences`, exactly how every plain-text work is cut, when a declared sentence has more than 60 words, the adapter would cut it, and none of the paragraph's sentences carries an English line, a verse reference, a note or a speaker (those paragraphs stay as declared and the build says so). No word changes; a review that covered the wording is re-bound to the same words. `npm run library:sentences -- all [--list]` prints the median sentence length of every work, and `library:audit` fails a work whose median is over 60 words.
- **Streams and domains.** Every index row and document carries the streams and subject domains of its work in the course catalogue (`src/course/*.ts`), merged with what the manifest entry says. The primary stream is the entry's unless the catalogue knows streams for the work and the entry's is not one of them. A door that counts texts by stream (`honduras`) or domain (`history`, `theology`) therefore finds them. `library:audit` checks every row.
- **Titles.** Cleaned (`#I#` heading markup unwrapped, zero-width U+200B and U+FEFF removed, blank runs and a contents-page number stuck to the end removed, a closing quotation mark that closes nothing removed) and unique inside a work (a repeated title gets its chapter number: "Azul... — I (15)"). A Scripture chapter's title is the chapter ("1 Juan 1"), never the title of the partial seed passage, and its `source.id` is `src:<lang>:<text id>` (a `-complete` chapter no longer carries the seed chapter's source id).
- **Shared document files.** `source.only: [ids]` on a manifest entry builds only those documents of the file, so several works can read one documents file (the four Hindi GDL shelves do). `library:order` leaves such files alone.

### Hindi children's books: Classes 1-4 by measured difficulty

The 92 unique GDL books are placed on Class 1 to Class 4 (23 each; works `gdl-hindi-ccby`, `gdl-hindi-ccby-c2`, `-c3`, `-c4`) by `scripts/prepare-hi-gdl-collection.mts`. Each book is measured with the Hindi adapter on three features: running words, mean words per sentence, and the share of running words whose normalised form occurs in fewer than 4 of the 92 books (vocabulary the other children's books do not share; forms rather than lemmas, so the grading depends only on the tokenizer and sentence splitter and does not move when the adapter's word lists are revised). Each feature becomes a percentile rank among the 92 books. The score is 0.4 words + 0.3 sentence length + 0.3 rarity. Books are ordered by score (the id breaks ties), cut into four equal shelves, and kept in score order inside a shelf, easiest first. The measurements and the rule are written to `data/sources/hi/gdl/gdl-grading.json`. The publisher's own reading level (printed in each book's credits) is recorded there but not used; it agrees with the measured shelves.

`data/sources/hi/library-manifest.json` is the Hindi BASE manifest (Bible, the GDL shelves, Andher Nagari on Class 8). It is the input of `scripts/integrate-reading-bridges.mts`, which adds the literature bridge and writes the manifest the build reads, `course-library/hi.json`; the base has fewer entries than `course-library/hi.json` by design.

### Step by step (what the one command runs, and the reading-ladder steps)

```text
npx vite-node scripts/prepare-hi-gdl-collection.mts
node scripts/verify-hi-usfm.mjs --check-only
npx vite-node scripts/library-order.mts <lang>
npm run library:build -- --lang hi --manifest data/sources/course-library/hi.json --in data/sources --out public/library --date 2026-10-02 --dict public/dict
npm run library:build -- --lang de --manifest data/sources/course-library/de.json --in data/sources --out public/library --date 2026-10-02 --dict public/dict
npm run library:build -- --lang es --manifest data/sources/course-library/es.json --in data/sources --out public/library --date 2026-10-02 --dict public/dict
npm run library:build -- --lang sq --manifest data/sources/course-library/sq.json --in data/sources --out public/library --date 2026-10-02 --dict public/dict
npm run library:build -- --lang th --manifest data/sources/course-library/th.json --in data/sources --out public/library --date 2026-10-02 --dict public/dict
npx vite-node scripts/sync-acquired-course-works.mts
npm run library:sync-catalogue
npx vite-node scripts/audit-reading-ladders.mts
npx vite-node scripts/prepare-reading-review-queue.mts
npx vite-node scripts/check-reading-bridge-runtime.mts
npm run rights:check
npm run library:check
```

The acquisition-time manifest builders (`build-hi-combined-manifest.mts`, `build-de-es-combined-manifests.mts`, `integrate-reading-bridges.mts`) write the base manifests and the combined `course-library/<lang>.json` from the retained acquisition records. They refuse to drop an entry the combined manifest already has, and `course-library/<lang>.json` was extended by hand afterwards (gap recovery, remediation), so they are not part of an ordinary rebuild.

The German children's inputs can be regenerated from the retained raw page records with `node scripts/prepare-de-children-documents.mjs`, followed by `npx vite-node scripts/sign-de-children-documents.mts` and the combined-manifest command above. Signing also refreshes the source-file review hashes. To acquire those records again, run `node scripts/acquire-de-children-wikisource.mjs --date 2026-10-02`; existing records are reused unless `--refresh` is supplied.

`library:check` validates every installed document, catalogue rights, publication binding, index counts, and Scripture wording against the independent verification record. `npm run build` includes this check. Full publisher-archive verifiers are `verify-hi-usfm.mjs`, `verify-scripture-usfm-full.mjs --lang de|es`, and `verify-thai-scripture.mjs`. The older page-fetch Scripture verifier encountered a host TLS certificate failure; archive comparisons provide the full-source verification without disabling TLS.

Project Gutenberg rights evidence applies to the United States; it does not establish worldwide distribution rights. Set `GO_RELEASE_JURISDICTIONS` for release-specific checks. Copyrighted recommendations, unverified editions, and damaged sources are not made publishable. Machine-drafted Stage 0 content still requires native review. Source-fidelity checks of existing published books do not claim native-speaker or linguistic review.

This is the completed import pass for the verified available sources, not a claim that every recommended catalogue title is installed. Permission-dependent works, missing complete editions, the six Spanish quality refusals, and Albanian full-text gaps remain recorded for follow-up. The installed texts open through the reader; all five dictionaries are available.

Detailed acquisition records: `docs/hindi/GDL_ACQUISITION.md`, `docs/hindi/LITERATURE_ACQUISITION.md`, `docs/GERMAN_PROSE_ACQUISITION.md`, `docs/SPANISH_PROSE_ACQUISITION.md`, and `docs/albanian/LITERATURE_ACQUISITION.md`.
