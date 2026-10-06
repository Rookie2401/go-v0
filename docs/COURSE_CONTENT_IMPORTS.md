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

Run from `C:\Users\CJWal\dev\go-v0`. Generated dictionaries and `public/library/` are ignored by Git, so retain the source inputs for reproducible local builds.

```text
npx vite-node scripts/prepare-hi-gdl-collection.mts
npx vite-node scripts/build-hi-combined-manifest.mts
npx vite-node scripts/build-de-es-combined-manifests.mts
npx vite-node scripts/integrate-reading-bridges.mts
npm run library:build -- --lang hi --manifest data/sources/course-library/hi.json --in data/sources --out public/library --date 2026-10-02
npm run library:build -- --lang de --manifest data/sources/course-library/de.json --in data/sources --out public/library --date 2026-10-02
npm run library:build -- --lang es --manifest data/sources/course-library/es.json --in data/sources --out public/library --date 2026-10-02
npm run library:build -- --lang sq --manifest data/sources/course-library/sq.json --in data/sources --out public/library --date 2026-10-02
npx vite-node scripts/integrate-reading-bridges.mts
npx vite-node scripts/sync-acquired-course-works.mts
npx vite-node scripts/audit-reading-ladders.mts
npx vite-node scripts/prepare-reading-review-queue.mts
npx vite-node scripts/check-reading-bridge-runtime.mts
npm run rights:check
npm run library:check
```

The German children's inputs can be regenerated from the retained raw page records with `node scripts/prepare-de-children-documents.mjs`, followed by `npx vite-node scripts/sign-de-children-documents.mts` and the combined-manifest command above. Signing also refreshes the source-file review hashes. To acquire those records again, run `node scripts/acquire-de-children-wikisource.mjs --date 2026-10-02`; existing records are reused unless `--refresh` is supplied.

`library:check` validates every installed document, catalogue rights, publication binding, index counts, and Scripture wording against the independent verification record. `npm run build` includes this check. Full publisher-archive verifiers are `verify-hi-usfm.mjs`, `verify-scripture-usfm-full.mjs --lang de|es`, and `verify-thai-scripture.mjs`. The older page-fetch Scripture verifier encountered a host TLS certificate failure; archive comparisons provide the full-source verification without disabling TLS.

Project Gutenberg rights evidence applies to the United States; it does not establish worldwide distribution rights. Set `GO_RELEASE_JURISDICTIONS` for release-specific checks. Copyrighted recommendations, unverified editions, and damaged sources are not made publishable. Machine-drafted Stage 0 content still requires native review. Source-fidelity checks of existing published books do not claim native-speaker or linguistic review.

This is the completed import pass for the verified available sources, not a claim that every recommended catalogue title is installed. Permission-dependent works, missing complete editions, the six Spanish quality refusals, and Albanian full-text gaps remain recorded for follow-up. The installed texts open through the reader; all five dictionaries are available.

Detailed acquisition records: `docs/hindi/GDL_ACQUISITION.md`, `docs/hindi/LITERATURE_ACQUISITION.md`, `docs/GERMAN_PROSE_ACQUISITION.md`, `docs/SPANISH_PROSE_ACQUISITION.md`, and `docs/albanian/LITERATURE_ACQUISITION.md`.
