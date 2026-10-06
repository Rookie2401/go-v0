# German, Spanish and Hindi course-gap recovery

This isolated acquisition pass writes only the three new recovery source folders, its acquisition script, and this report. It does not edit a course catalogue, UI, shared manifest, public library, or existing source.

## Findings

| Language | Existing ladder signal | Recovery result | New text |
|---|---|---|---:|
| German | The 11 CC-BY GDL books are the complete queried German GDL inventory; the remaining installed material is native or heritage prose. | Added the complete 1851 scan-backed *Der kleine Häwelmann* text from German Wikisource as a short native bridge. | 1 |
| Spanish | The 12-book Spanish GDL bridge is complete for queried `es-es`, but does not represent Honduras/Central America. Three cached classroom editions were withheld because English apparatus was mixed into the source. | Recovered the Spanish narrative bodies for *El capitán Veneno*, *Platero y yo*, and *El sombrero de tres picos*, preserving chapter order and excluding English introductions, notes, exercises, vocabulary, and footnotes at explicit boundaries. | 3 |
| Hindi | GDL's 125 extracts reduce to 124 clean documents and 92 distinct signatures; duplicates were not reintroduced. The existing Premchand bridge has two verified works. | Added all six acts of Bharatendu's *भारत दुर्दशा*. The transcription is retained, but rights remain unverified pending exact-edition evidence. | 1 (11,068 letter-token words) |

Spanish boundary audit: *El capitán Veneno* uses cached source lines 278–2974
(4 parts, 29 chapters; 21,403 words) and stops before `QUESTIONS FOR
CONVERSATION`. *Platero y yo* uses the 32 selected story chapters between the
first `#I#` story heading and `NOTES` (6,605 words); every questionnaire block,
translation exercise, and English tail is removed. *El sombrero de tres picos*
uses the narrative title at cached source character boundary 25,538 through
the narrative end before `NOTES` (the stock parser reports 36 chapter headings
plus front matter, 24,758 words). A strict scan of
the three outputs finds no `QUESTIONS`, `EXERCISE`, `VOCABULARY`, `NOTES`,
`INTRODUCTION`, or English exercise sentences.

## Provenance and rights

Each entry has an exact source URL, edition description, SHA-256 of the saved text, extraction notes, and a rights state. `reviewed` means source identity and boundaries were checked; it does not mean that a native speaker approved the language or level. Spanish entries retain their original classroom-edition wording and chapter order and use the baseline Project Gutenberg US-public-domain records. Honduras and other release jurisdictions require a separate rights decision. The Hindi entry records the Wikisource CC BY-SA 4.0 transcription licence separately from the underlying 1935 scanned edition; that edition remains `rights-unverified` and cannot be bundled yet.

## Reproduction and limitations

Run `npx --no-install vite-node scripts/acquire-course-gaps-de-es-hi.mts`. The current host requires its configured TLS certificate setup for remote fetches. The script is idempotent within the three new directories and never mutates shared course data. Hindi Wikisource's parsed pages contain proofread-page headers and entity text; the extractor removes HTML tags but does not modernise or rewrite wording. Native Hindi review and an edition-specific rights check remain required. A lawful modern Honduran/Central-American bridge remains missing. The German story is 1851 standard German rather than modern de-DE.

Checks completed on 2026-10-02: all manifests parse and use the build schema's `plain`/`gutenberg`/`story`/`reviewed` values; every `coversSourceSha256` matches the saved bytes; the Hindi duplicate inventory was not rewritten; and no shared integration or public-library files were changed by this pass.
