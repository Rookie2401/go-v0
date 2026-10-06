# Curriculum acquisition and review — 2026-10-04

This isolated acquisition writes only `data/sources/curriculum-remediation` and `data/review/curriculum-remediation`. No course-authored sentences, translations, native approvals, illustrations, or audio were generated. The acquisition script uses the actual language adapters for token, type, observed lemma, analyzer-unknown, and sentence metrics. These are evidence for placement, not CEFR or personalized vocabulary estimates.

## German source-authorized prose

[Project Gutenberg #35794](https://www.gutenberg.org/ebooks/35794) identifies **Erster Teil**, D. C. Heath 1897 imprint, copyright 1896. [#45189](https://www.gutenberg.org/ebooks/45189) identifies **Zweiter Teil**, undated D. C. Heath imprint, copyright 1896. Both exact digital edition catalogues currently state US public domain. HTML, plain edition, catalogue, and current [PG license](https://www.gutenberg.org/policy/license.html) are cached with hashes. US rights clearance does not establish release in every other jurisdiction.

The extraction contains 15 first-volume and 13 second-volume numbered prose stories, 47,980 German adapter tokens. Poems, English introduction, vocabulary, questions, advertisements, and PG wrapper are excluded at heading boundaries; page markers and footnote anchor numerals are excluded; historical spelling and actual paragraph wording are retained. Some prose includes verse spoken by characters, as in the original story. The volume 2 preface expressly describes its bridge purpose. The exact excerpt hashes, upstream edition hashes, source links, credits, adaptation notice and source-fidelity review survive in `de/library-manifest.json`.

Refined placements remain **provisional**: first-volume stories 01–04 in s2; 05–08, 10 and 15 in s3; 09 and 11–14 in s4; second-volume stories in s6. The first four s2 stories provide 3,937 tokens, so density remains limited. First volume ranges 565–4,935 tokens, with median sentence lengths 6–20; second volume ranges 723–6,983 tokens, with median sentence lengths 11–21. Longer stories need chapter treatment and later canonical placement; publication must not imply all are equally elementary. Source-fidelity checks are completed, native suitability review is pending and explicitly queued. Do not count a whole volume's word total as sufficient evidence of any stage's mastery or continuity.

Integration (coordinator owns shared catalog/manifests): merge the 28 entries in `data/sources/curriculum-remediation/de/library-manifest.json` into the German source manifest, rewrite each source path relative to the merged manifest input directory, add canonical works referencing these slugs and stages, and avoid publishing the overlapping old `guerber-maerchen-und-erzaehlungen` whole-volume blob as an additional recurrence corpus. Retain the exact rights and attribution fields. Build through the normal library importer:

```text
npm run library:build -- --lang de --manifest data/sources/curriculum-remediation/de/library-manifest.json --in data/sources/curriculum-remediation/de --out data/review/curriculum-remediation/build-test --date 2026-10-04 --strict
```

The isolated build is for validation; the coordinator performs the merged learner release. Do not replace the full German public manifest with this isolated 28-work manifest.

## Modern prose: four ready excerpts, full candidates held

[Global Voices' official republication policy](https://globalvoices.org/about/global-voices-attribution-policy/), updated April 9, 2025, permits commercial sharing/adaptation with author, original-story link, license and change notice; its current footer points to **CC BY 3.0**. Third-party media are separately excluded. Three current official RSS articles per German, Spanish, Hindi and Albanian edition are cached as text-only candidates with article HTML, RSS creator, feed/source hashes and actual adapter metrics. Media, captions, embeds and blockquotes are removed. Inline quoted text and reference retention require individual verification. **All 13 complete-article candidates (including the added German arts article) are held, canBundle false:** RSS creator is not assumed to identify the original author; the translator, original story, exception notices, article credits and extraction fidelity must be resolved from the cached article before import. They must not inflate published modern-register coverage.

Four **separately selected, source-faithful excerpts** now have exact article-level author/translation credit verification, CC BY 3.0 footer evidence, original-story links, explicit excerpt/adaptation notices, source hashes and review signatures. Their selected paragraphs contain GV author narrative/explanation rather than copied third-party quotation or media. Import-ready manifests are `modern/{de,es,hi,sq}-library-manifest.json`; source files are in the same directory. These authentic excerpts have provisional German s6, Spanish s4, Hindi c6 and Albanian 6 placement, not a beginner or native-placement approval. Longer full articles remain held.

| Language | Excerpt | Source authorship / translation |
| --- | --- | --- |
| German | A Colombian view of Encanto | Lully; translated through Andreas Kallinteris and FTSK; original Spanish source linked |
| Spanish | Documenting indigenous Tharu folklore | Sanjib Chaudhary; Julissa Álvarez Coroa; original English source linked |
| Hindi | Pani puri and regional food culture | Abhinash Das; Debashish Chakrabarty; original English source linked |
| Albanian | Uzbekistan air pollution and its response | Nurbek Bekmurzaev; Ardi Pulaj; original English source linked |

These excerpts improve contemporary source coverage but cannot alone supply adequate recurrence or fill the entire modern-prose stage. No third-party media/audio or native review is imported. Apply the normal library builder with `--lang <language> --manifest data/sources/curriculum-remediation/modern/<language>-library-manifest.json --in data/sources/curriculum-remediation/modern`, then merge the resulting provenance/catalogue through the coordinator.

## Albanian translation packet

`sq-translation/packet.json` contains **40** already acquired edition-credited Hindi StoryWeaver/GDL stories (**53,355 source-language adapter tokens**). Exact source text is supplied alongside hash-bound original EPUB identity and complete edition credits, including existing Hindi translator/original-author records. [StoryWeaver attribution guidance](https://storyweaver.org.in/attributions) specifies CC BY 4.0 and requires publisher, author, illustrator, funder and existing notices. Retain all story credits, add the Albanian translator and explicit translation/adaptation notice; text only. Audio/read-along rights are not inherited.

Each job is translation_needed; **no Albanian translation or native review exists**. A named source-language competent translator must produce Standard Albanian, then a separate native Standard Albanian reviewer must read the complete hash-bound draft. Record person, date, corrections, target variety, edition credits, actual lexical/syntactic metrics, proposed stage, and independent rescue-text review. Revisions invalidate signatures. Gheg source editions are not substitutes for Standard Albanian beginner input. The packet is substantial rights-cleared translation-ready source material, not released Albanian lessons.

## Thai source and commission backlog

[Thai Aesop root](https://th.wikisource.org/wiki/นิทานอีสป) identifies the 1956/2499 funeral reprint by พระยาเมธาธิบดี (สาตร สุทธเสถียร), printed by โรงพิมพ์พระจันทร์ and published by องค์การค้าของคุรุสภา. Its edition-specific Thai PD template supports Thailand only; modern transcription contributions are separately CC BY-SA. [The scan index](https://th.wikisource.org/wiki/ดัชนี:นิทานอีสป_(2499).pdf) names editor กรมพระยาดำรงราชานุภาพ and says every page is proofread **but not validated**. The root contains a restored-text category. [Author's preface](https://th.wikisource.org/wiki/นิทานอีสป/คำชี้แจงของผู้แต่ง) describes easy words and short sentences after the primer; that historical purpose does not prove contemporary foreign-beginner suitability. All 45 existing fables have concrete scan-comparison/native-review tasks. No silent modernization or independent validation claim is made; global/US rights remain unresolved.

`honduras-commission.json` contains 14 practical connected-narrative topic briefs, from introductions and food to health, community invitations and respectful personal testimony. All are **commission_needed**. Require a Honduran writer, an independent native reviewer and a recorded commercial/derivative/offline rights agreement. Heritage literature is not labeled Honduran Spanish.

## Run and hold policy

```text
$env:NODE_OPTIONS="--use-system-ca"
npx vite-node --config scripts/vite.config.ts scripts/acquire-curriculum-remediation.mts
```

Alternatively set `NODE_OPTIONS=--use-system-ca` and invoke the local vite-node binary. Uses system trust rather than disabling TLS verification. Network downloads have 25-second timeouts. Re-running regenerates deterministic identities and text checksums while refreshing official source evidence; every review remains pending unless an actual person completes it. Held candidate files have no import manifest and cannot enter the release through the acquisition script. Retain rejection findings in the queue rather than changing rights labels to force import.


Fresh isolated validation: the atomic-directory build failed twice with Windows EPERM. The pure buildLibrary + BuildIO check then passed all five import manifests: 28 German historical texts (47,980 tokens) and four modern texts (219/214/218/307 tokens), 32 published source-faithful documents, zero refusals. All 32 built documents preserve sourceHash, attribution and review signatures. Reports: data/review/curriculum-remediation/pure-build-validation.json and built-source-validation.json. Re-run without downloads using the acquisition script with --build-check. Native-placement approvals remain pending.

Focused installed-content regression tests verify all 32 exact source paragraphs against the published documents and independent original HTML parsing, review signatures and attribution hashes, real adapter profiles, measured stage placement, and held review/commission status. Edition-level source/media/derivative evidence with honest null dates and unknown reviewers is in data/review/curriculum-remediation/rights-evidence.json. Historical variety is neutral de with explicit historical registers; no 1901 spelling claim is made. The acquired canModify false flag remains preserved; possible US public-domain derivative permission is documented separately and never used to silently modernize prose.

The Honduran commission queue additionally covers asking for clarification, respectful Bible discussion about actual separately cleared passages, Honduran geography and community biography. All 14 briefs remain commission_needed with author, nativeReviewer and rightsAgreement null. The Spanish authentic excerpt carries generic es variety: publication in a Spanish-language edition does not verify Latin American or Honduran regional usage.