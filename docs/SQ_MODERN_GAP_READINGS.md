# Modern Standard Albanian gap readings

On 2026-10-02 the bounded acquisition lane found no cached GDL, StoryWeaver, Bloom, Book Dash, or other publisher-labelled Albanian beginner-story set in the repository. The existing literature research also has no exact reusable edition plus licence for a bundleable Albanian literary work. The lane therefore added ten connected modern Standard Albanian prose readings from exact Albanian Wikipedia revisions under CC BY-SA 4.0. These are authentic reference readings, not invented lessons, translations, stories, or CEFR/A0 claims.

The new source-only set contains 10 documents and 14,778 measured whitespace words:

| reading | topic |
|---|---|
| Vlora | place/geography |
| Berati | place/history |
| Korça | place/education |
| Gjirokastra | place/culture |
| Parku Kombëtar i Lurës | nature/geography |
| Parku Kombëtar i Dajtit | nature/geography |
| Lumi Vjosa | nature/geography |
| Liqeni i Shkodrës | nature/places |
| Alpet Shqiptare | nature/geography |
| Parku Kombëtar i Butrintit | nature/history |

Each document is in `data/sources/sq-modern-gap-readings/documents.json`. Exact revision IDs, oldid URLs, raw HTML SHA-256 values, and licence links are in `source-manifest.json`; the source file is bound by `library-manifest.json` with `kind: "documents"`. The extractor removes navigation, tables, references and list-only blocks while retaining source paragraph wording. It sets `generated: false`, `contentType: "nonfiction"`, `streams: ["library"]`, and stage `7`; it does not touch the shared course-library manifest or public library.

The source-fidelity review records `review.status: "reviewed"` with `level: "linguistic-check"` and an explicit limitation: it verifies extraction and provenance, not native linguistic quality or CEFR level. `needs-native-review` remains on every document. No existing `sq-modern-open` page was reused, and the quarantined `Familja` material was not used.

The acquisition script is [acquire-sq-modern-gap-readings.mts](../scripts/acquire-sq-modern-gap-readings.mts). It is reproducible from cached page HTML, records the exact revisions, runs `parseBuildManifest` on the full isolated output manifest, and runs `validateDocumentDetailed` with the Albanian adapter before writing output. The last run returned 10 documents, 14,778 words, 10 pages, and zero validation errors.
