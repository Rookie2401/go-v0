# Rights and privacy boundaries

Status: decisions of 2026-10-08 on the basis of annex C (rights and sources) and annex D (storage and data flows).
This is a documented decision basis for the owner, not legal advice. Items marked **expert review** need a rights
lawyer or the rights holder before production distribution. Charter principles 10–14 are binding here.

## 1. The six activities, kept apart

| activity | new product's stance | existing code | boundary |
|---|---|---|---|
| **Locally analysing text visible to its lawful user** | the product's core; always allowed by us (the reader's terms may still restrict programmatic access) | adapters, dictionary join, EPUB/TXT import, Reader | analysis runs in the learner's browser or extension; nothing is sent |
| **Sending selected passages to a remote service** | only with informed, per-feature consent; never silently | Azure direct/proxy (off); team sharing (texts only); no LLM calls exist | pronunciation synthesis sends at most one sentence, after the learner enabled a provider and saw its terms; nothing else leaves the device |
| **Retaining snippets for review** | opt-in per source, bounded to one sentence per encounter, deletable per source, never for a page | the retrieval cloze already writes `sentenceText` into events (annex C headline 4) | D4 in `GO-REPOSITORY-DESIGN.md`: default is the context *identity* (hash + locator); snippet text is a separate consented store row, not an immutable event |
| **Storing whole books** | only the learner's own lawful local files, in the demonstration reader, on device, never synced or exported without an explicit choice | `CopyImporter`, `ingest/epub.ts` | the extension never stores a page of a web or ebook reader |
| **Redistributing texts** | none | the bundles and the team server | the refusal rules of `src/goread/sharing.ts` (personal-copy, user-private, generated, unverified never leave the device) survive as the Repository's own guard |
| **Defeating DRM** | never, in any form | none (`ingest/epub.ts` refuses protected files) | an adapter whose environment forbids programmatic reading declares `context: 'none'` |

## 2. Decisions per source category

| category | items | decision | obligation carried | expert review |
|---|---|---|---|---|
| Bundled literary texts (Gutenberg, Wikisource, Global Voices, GDL, Wikipedia) | `data/sources`, `data/corpus` authentic docs, `public/library` | **retire** from the product; **quarantine** the 82 US-only PD works; keep the catalogue JSON and `data/review` as an audit trail; decide separately about git history and the public `gh-pages` branch, where 12,634 shards are already published | none once removed from distribution | **yes** before leaving a public repo or branch holding Mann, Bonsels, Rilke, Kafka, Baroja, Jiménez, Unamuno texts verified for the US only |
| Scripture editions | RV1909, Luther 1912 (PD by eBible); IRV Hindi 2019, Biblica OTCV 2025 (CC BY-SA 4.0); Norwegian 1930/1921 excerpts (unverified) | **retire** as bundled product content; the learner's own Bible is a book like any other; a snippet of a CC BY-SA edition retained for a card carries its notice | IRV / Biblica attribution + share-alike + Biblica trademark line if shown | **yes** for Luther DE/EU and the Norwegian basis if ever bundled again |
| Dictionaries (Wiktionary via kaikki, CC BY-SA 4.0) | `public/dict/*` | **keep with obligations**: every surface that shows a dictionary gloss or IPA shows "Wiktionary, via kaikki.org — CC BY-SA 4.0" with a licence link; derived shards and any merged data stay CC BY-SA; ship as separately licensed pack files | attribution, share-alike | **yes** on the share-alike reach into the app's own lexicon rows that were written with Wiktionary as a reference (Albanian `lexicon-ladder.ts`, `disputed.ts`) |
| Hand lexicons and rules (owner/AI-authored) | `src/adapters/**` | **keep**; label machine-drafted and unreviewed in every pack manifest | none | ownership of AI-drafted text as a general question |
| Frequency sidecars | `public/dict/*/frequency.json` | **quarantine**; rebuild from clearly licensed text only | none for aggregates | low |
| Adapted units (CC BY-SA / CC BY derivatives) | 17 Thai Aesop, 1 Hindi *Andher Nagari*, 2 Spanish GDL | **quarantine** until decided: keep only with attribution and the same licence on the unit, else delete | attribution, share-alike, statement of changes | yes (Thai 1956 translation's non-Thai status) |
| Owner/AI-drafted units, scenes, corpus | ~270 docs + 156 Stage 0 files | **keep as seed material** for GoPractice examples and onboarding essentials; never presented as a course | none | AI authorship only |
| Audio | one Commons PD-self recording (test fixture); no production audio | keep the fixture with credit; production audio only from named, consenting speakers with recorded rights | credit line | only if redistributed |
| Generated pronunciation data | rule-based (owner); dictionary IPA (CC BY-SA) | keep; label the source on the card | attribution for dictionary IPA | no |
| Third-party packages | 113 installed, MIT/Apache/ISC/BSD/MPL-2.0 (build-time) | keep; reproduce notices in shipped bundles; add the EB Garamond licence text; add a LICENSE file to the repo | notices | no |
| Test fixtures | hand-made dictionary/ingest/bench fixtures; ~50 tests reading bundled data | keep the hand-made; **rewrite** the bundled-data tests to synthetic fixtures before the data is retired; carry only clear-rights fixtures (de Kafka via Wikisource PD) into packs | none | no |
| Learner data on disk | `data/private/backups/audit-learner-2026-10-01.json` (unencrypted), `work/` caches, an EPUB of unrecorded origin | **delete** unless the owner needs them | — | no |

## 3. Privacy boundaries of the new product

1. **What the extension records by default**: the item ids looked up, the help layers shown, the time, a hash of the
   context sentence, and a source reference (title/locator) — never the sentence text, never the page.
2. **Snippets**: per-source opt-in ("keep short snippets of this book for my practice"), one sentence per encounter,
   stored as deletable rows (not immutable events), listed in the export so the learner sees exactly what is kept,
   removable per source. The retrieval cloze's current practice of writing `sentenceText` into events is to be
   changed to reference a snippet row (annex C headline 4).
3. **Remote services**: pronunciation synthesis only after the learner enables a provider and sees its terms and
   retention; no LLM provider is wired, and none may be without a consent screen that names what is sent (a sentence,
   a draft) and to whom; team sharing of texts is retired.
4. **Sync**: the event log and settings, to the learner's own Repository account; never the learner's books; snippets
   only if the learner included them.
5. **Export and deletion**: a complete export (log, enrolments, settings, snippets by source); deletion per learner,
   per source and per time range as tombstones the fold honours, with physical removal of snippet text; a whole-device
   wipe. None of this exists today (annex D §3) and it is a precondition of the first public release.
6. **Secrets**: no bearer keys or provider keys in plaintext localStorage; provider keys are server-held or
   session-only; a content-security policy on any host that can set headers.
7. **Multiple learners on a device**: a per-learner lock or separate profiles before any shared-device use.

## 4. What the owner must decide (not a tool)

1. The fate of the public `gh-pages` branch and git history holding bundled texts verified for the US only.
2. Whether any adapted (share-alike) unit is kept as seed material.
3. The snippet default for public-domain sources the learner owns outright versus commercial ebooks.
4. Which speech provider, under what terms, if any, in the first release.
5. Expert review items above before production distribution.
