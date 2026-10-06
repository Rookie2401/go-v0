# Foundation course material gaps (2026-10-02)

This audit is based on the generated public library manifests and shards under `public/library/<lang>/`, the corpus files under `data/corpus/<lang>/`, and the generated review queue. A `published: true` library row is an installed source-faithful book with rights/provenance evidence; it is not a native-speaker quality certification. Generated corpus drafts remain unpublished. Catalogue pointers are not counted as material.

## Current installed material

| language | public library | Scripture | secular installed source material | generated/unpublished corpus queue |
|---|---:|---:|---:|---:|
| German | 37 works / 1,841 texts / 2,278,289 words | 1,189 / 697,618 | 652 / 1,580,671 (library + knowledge) | 34 / 4,540 words |
| Spanish | 31 / 1,864 / 2,633,113 | 1,189 / 704,415 | 675 / 1,928,698 | 28 / 3,768 words |
| Hindi | 5 / 1,284 / 847,761 | 1,189 / 776,469 | 95 / 71,292 (children + literature) | 28 / 4,530 words |
| Albanian | 2 / 37 / 24,259 | no bundled Scripture | 37 / 24,259 modern open/reference articles | 22 / 960 words |
| Thai | 6 / 1,243 / 903,566 | 1,189 / 863,775 | 54 / 39,791 | 14 / 1,252 words |

The exact per-stream counts are computed from each shard's `features.words` and `published` fields. Evidence: `public/library/{de,es,hi,sq,th}/manifest.json` and `public/library/*/index/*.json`. The Albanian manifest was rebuilt after removal of the unusable Feja lead and now has 27 rows.

## Prioritized gaps and bounded fills

### P0 — The controlled-to-easy-native progression is still thin

The installed libraries now contain real, rights-cleared secular books, but most are ordinary or literary works rather than a measured first-rung ladder. The generated queue is 126 non-Scripture drafts / 15,050 words (34 de, 28 es, 28 hi, 22 sq, 14 th), and none of those drafts is a published learner text. The concrete gap is continuity from controlled/very easy material to easy native and then intermediate material; book and word totals alone do not establish that progression.

**Fill:** use the existing cached queue as the controlled rung, and use the already installed short/source-faithful readers where available (German GDL readers, Spanish GDL readers, Hindi GDL/Premchand material, Albanian modern articles, Thai's 54 secular units) as candidates for placement. Keep source publication and language-quality status separate; only the text's existing rights/provenance should be claimed until a language reviewer evaluates it.

### P1 — Thai has secular material but almost no early ladder

Thai's public manifest has 54 published secular texts / 39,791 words, while 1,189 Scripture chapters account for 863,775 words. The secular rows now include 45 Aesop fables alongside three short Wikisource pieces and selected *Vetal* chapters, but they do not yet supply a measured continuous beginner-to-intermediate path. The 12 Thai bridge stories in `data/corpus/th/` remain generated drafts.

**Fill:** place the nine existing secular texts as later/diagnostic reading and use the cached 12 bridge drafts as the early rung after their publication status changes; identify a lawful short modern/children's source only if an already cached source record supports it.

### P1 — Modern-standard Albanian remains the clearest content shortage

The installed Albanian source is now 37 modern article/reference sections / 24,259 words after the 10-reading `Qytete dhe natyrë` addition. It is useful open reading, but the course materials themselves describe this collection as an intermediate bridge. The generated Stage 0/1 queue contributes only 22 drafts / 960 words, and the third-party catalogue remains separate from installed material. Albanian Bible wording remains a user-deferred access decision and is not inferred or bundled here.

**Fill:** prioritize the cached Stage 0/1 drafts and modern open sections for ladder placement, then add only rights-cleared modern Standard Albanian material already represented by retained source records. Keep Gheg and historical works outside the modern foundation.

### P1 — Mission has a door but no installed mission stream

The five course definitions expose mission pathways, but the current public manifests contain zero rows whose stream is `mission`. The only concrete mission files are Albanian `misioni-1-01` through `misioni-1-04`, all in the unpublished corpus. Scripture rows carrying theological content are not ordinary ministry dialogue.

**Fill:** retain the four Albanian mission drafts as the first bounded mission batch; add one small source-cleared ministry-dialogue batch per language only when material is actually available in the repository and its publication state is recorded. This is a materials gap, not a request to invent a phrasebook or ghostwrite testimony.

### V2 — Listening is intentionally deferred

GoListen is disabled globally. No provider, recording, player, or listening evidence is active. Audio catalogue rows are recommendations and do not count as recordings. This remains a V2 capability boundary rather than a V1 acquisition task.

### Testimony — functionality exists, source breadth is the limitation

The five adapter runtime support records declare `productionChecks: 'limited'` (`src/adapters/de.ts`, `es.ts`, `hi.ts`, `sq.ts`, `th.ts`). GoTell can check a learner's own draft and show bounded suggestions, but it cannot establish that a sentence with no finding is correct. The practical material gap is reviewed, varied input that gives the checker useful encountered language, especially mission and modern everyday text. The system must continue to preserve learner authorship.

## Boundaries

Do not count Scripture as secular foundation or mission dialogue. Do not count a catalogue pointer, generated draft, source-fidelity check, or public-library row as native linguistic review. This audit does not acquire external sources or change UI/course code; it records the current material gaps and bounded uses of material already cached in the repository.
