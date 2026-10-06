# Reading bridge acquisition

Acquisition date: 2026-10-02. Sources are queried from the official Global Digital Library (GDL) WordPress content API and downloaded from each book's official EPUB URL. The bridge keeps source wording; it does not translate or claim native-speaker review. GDL reading levels remain source metadata and are not course-level certifications.

## Albanian coverage

The official GDL API was queried with all three relevant identifiers: `sq`, `sqi`, and `als`. Each returned zero books. The query records are in `data/sources/reading-bridge/sq/catalogue.json`, `sqi/catalogue.json`, and `als/catalogue.json`. StoryWeaver's official open-content language catalogue lists supported European languages but does not list Albanian; its licence page confirms that available storybooks are CC BY 4.0, but it is not evidence of an Albanian source. No Albanian text is invented, translated, or bundled. This remains a verified source-availability gap, not a language-quality conclusion.

## Published bridge outputs

| API catalogue | Licence filter | EPUBs imported | Published build result | Output evidence |
| --- | ---: | ---: | --- | --- |
| GDL `de` | CC BY 4.0 | 11 EPUBs imported after cache-safe official fetch | 11 works / 11 texts / 1,008 words / 0 refusals | `data/sources/reading-bridge/de/library-manifest.json` |
| GDL `es-es` | CC BY 4.0 | 12 | 12 works / 12 texts / 8,377 words / 0 refusals | `data/sources/reading-bridge/es-es/library-manifest.json` |
| GDL `th-vn` | CC BY 4.0 | 12 | 0 published: official GDL language catalogue exposes only `th-vn`; direct EPUB inspection confirms Latin transliteration and no Thai Unicode, so the Thai language gate refused all 12 | `data/sources/reading-bridge/th-vn/library-manifest.json` |

The German and Spanish StoryWeaver front-matter blocks were removed from document paragraphs only after being retained in `source.attribution`; CDATA delimiters and blank extracted paragraphs are removed by the reproducible `--repair-existing` path. Each repaired document receives a fresh content signature and manifest source hash. Three Spanish records are explicitly quarantined after source inspection (French body or obvious source-language grammar issue), with their wording preserved in per-book records. Thai records remain quarantined because the official EPUB payloads fail the Thai script gate; the text was not rewritten or transliterated.

Primary evidence: [GDL content API](https://content.digitallibrary.io/api/), [GDL licence policy](https://digitallibrary.io/about/license/), and the per-book URLs recorded in each manifest entry. StoryWeaver's official [open-content catalogue](https://storyweaver.org.in/en/open-content) documents CC BY 4.0 licensing and its supported language catalogue.

The acquisition is reproducible with `scripts/acquire-reading-bridge.mts`; it writes raw-source-derived document records, per-book rights evidence, SHA-bound reviews, and catalogue query records under `data/sources/reading-bridge/`.
