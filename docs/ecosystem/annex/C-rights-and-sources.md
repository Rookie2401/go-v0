# Annex C — rights and sources audit (read-only, 2026-10-08)

Produced by a research agent on HEAD 8dc86370 and reviewed by the lead. Nothing edited, downloaded or fetched; the
only commands run were `git ls-files`/`check-ignore`/`ls-tree`/`log`, `npm run rights:check`, and a scratchpad
script. This is a documented decision basis, not a legal opinion. "Expert review" means a rights lawyer or the
rights holder.

## Headline findings

1. **Nobody in the repo is a named person.** Every `verifiedBy` string describes a source or a tool ("Project
   Gutenberg official edition page", "Official GDL API book licence"); seven catalogue works are verified by
   "coordinator (AI) … to be confirmed by the owner" (German `grimm-sternthaler-1857`, `grimm-der-suesse-brei-1857`;
   Hindi `bible-hindi` and four GDL works); 27 course-authored works say "course authors"; Scripture wording checks
   are `by: scripts/...`; 34 Norwegian evidence records say "research agent (no legal check)". "Verified" in this
   repo means "records present and consistent", not "a human confirmed it".
2. **Many "verified-public-domain" works are US-only.** 57 of 59 German and 25 of 26 Spanish PD entries record
   `statusByJurisdiction {"US":"public-domain"}` only; `docs/german/RIGHTS.md` and
   `data/review/curriculum-remediation/rights-evidence.json` say non-US clearance is not established. Leads (general
   knowledge, not repo-recorded): Thomas Mann (d. 1955), Bonsels (d. 1952), Rilke, Kafka; Baroja (d. 1956), Jiménez
   (d. 1958), Unamuno. All are in the built libraries on gh-pages.
3. **Bundled texts have already been published.** `origin/gh-pages` holds 14,957 files including 12,634 `library/`
   shards and `dict/` shards (built 2026-10-08); git history tracks 1,036 files under `data/sources/` (full USFM
   Bibles, Gutenberg texts, Wikisource and Global Voices JSON). Whether the repo or site is public is not recorded.
4. **Sentence text from read books is retained in the event log**: `src/golearn/retrieval/index.ts:208-215` emits
   `ProductionRecorded` with `sentenceText` (the sentence the learner read, from any text including a personal copy);
   the log is append-only and exported in unencrypted backups. The main precedent for "retain snippets".
5. **Third-party fixtures and packages are clean**: fixtures hand-made; 14 direct dependencies MIT/Apache-2.0; no
   code touches DRM.

## 1. Catalogue and rights records

States (`src/core/course.ts`): `verified-public-domain`, `verified-open-licence`, `permission-granted`,
`course-authored` (bundlable, needing `verifiedBy` + `verifiedAt`), `recommended-only`, `user-supplied`,
`rights-unverified`, `prohibited-from-bundling`, `research-only` (not bundlable). The comment says only a named
person may set verified states; nothing enforces it (the gate checks a non-empty string). `bundleDecision()`
excludes on jurisdiction only when `GO_RELEASE_JURISDICTIONS` is set. The gates cover `data/corpus/**` only, not
`public/library/**` (which carries its own `provenance.json`).

Catalogue (378 works, `npm run rights:check`): de 117 (65 PD, 14 open, 5 authored, 26 unverified, 7 prohibited);
es 76 (26, 10, 4, 25, 11); hi 55 (3, 6, 3, 31, 12); th 80 (5, 1, 12, 0, 0, 62 no state); sq 33 (0, 3, 3, 21, 6);
nb/nn 17 (all unverified). Installed libraries: de 66, es 32, hi 9, sq 3, th 6 works, every one in a verified state;
four Spanish works refused for OCR damage. Inconsistencies: `bible-hindi` and the Hindi GDL works carry two different
verifier records (library manifest vs `src/course/hindi.ts`).

Decisions: KEEP the schema and gate code as design reuse; KEEP the PD records with three jurisdictions (Luther 1912,
Reina-Valera 1909, Grimm KHM) with expert review of the Luther DE/EU basis; QUARANTINE the 82 US-only PD works (not
to be redistributed); RETIRE open-licence texts as bundled books but KEEP the records as provenance; KEEP the 27
course-authored works as owner material (AI-drafted, unreviewed; ownership of AI-drafted text is itself a question);
RETIRE unverified / prohibited / no-state works as bundle.

## 2. Bundled texts

`data/corpus/<lang>/`: 147 documents (143 bundled, 4 left out): de 41 (34 owner-authored, 5 Luther, 2 Grimm), es 29
(28 + 1 RV1909), hi 33 (28 + 5 IRV CC BY-SA), sq 23 (22 + 1 unverified sample), th 15 (14 + 1), nb/nn 3 each
(2 + 1 unverified CrossWire excerpt). All owner-authored documents say `authorship: generated`, `review: unreviewed`.
The sq and th Scripture samples say "written from memory by an AI assistant … licence unknown … MUST be replaced"
and are excluded from bundles.

`data/ladder/<lang>/`: de 99 (81 controlled, 18 authentic), es 110 (91, 2 adapted, 17 authentic), hi 132 (101, 1,
30), nb 72 (72), sq 105 (105), th 115 (90, 17 adapted, 8 authentic). Twenty units are `rights: licensed` adaptations
(es-b1-08/19 GDL CC BY 4.0; hi-b1-29 *Andher Nagari* Wikisource CC BY-SA 4.0; 17 Thai Aesop units adapted from Thai
Wikisource CC BY-SA transcriptions of the 1956 translation) and are themselves CC BY-SA derivatives; the Thai
evidence file says "non-Thai rights pending" while the catalogue records Thailand-only PD. Authentic units are
pointers into the library.

`data/stage0/<lang>/`: 169 files; 156 carry `provenance.authoring: ai-drafted`, `review: unreviewed`.

`data/sources/` (1,036 tracked files, all committed): full USFM Bibles (de, es ~19 MB each; eBible PD), Hindi IRV +
~125 GDL books (46.8 MB; CC BY-SA / CC BY 4.0), Thai Biblica OTCV2025 (67.6 MB; CC BY-SA, Biblica trademark),
`de-prose`/`es-prose` Gutenberg texts (38 + 27 books, US PD notice), curriculum-remediation sources (6.8 MB),
Wikisource JSON (de children, th, hi), rendered sq Wikipedia pages (CC BY-SA, exact revision), unverified
historical Albanian fables and the Hindi *Bharat Durdasha* text, GDL bridge books. Held but unverified items are
tracked too (six German and two Spanish extras). `data/review/` (132 tracked files) holds rights evidence and review
packets. `data/research/` (ignored): kaikki raw 171 MB, UniParser (MIT) 131 MB, UD treebanks (CC BY-SA). `data/private/`
(ignored): Python venvs, GDL EPUBs (142 MB), and an unencrypted learner backup `audit-learner-2026-10-01.json`.
Untracked: `work/` (677 MB incl. a Gutenberg source cache and `thai11728.epub` of unrecorded origin); `work-thai.zip`
is not a valid zip.

Decisions: KEEP owner/AI-drafted units, scenes and corpus as practice seed material or authoring examples (Y expert
review on AI authorship only); QUARANTINE the 20 adapted units until decided (keep only with attribution and a
CC BY-SA licence on the unit, or retire); RETIRE bundled PD/licensed books and `data/sources` as product content
(keep a minimal subset only as test fixtures; expert review before removing from git history or leaving a public
repo, since the bundles already live on gh-pages and in history); QUARANTINE then delete unverified held texts and
`work/` caches; KEEP `data/review/` and the catalogue JSON as an audit trail; KEEP `data/research`/`data/private` out
of the repo and delete the learner backup if not needed.

## 3. Scripture editions

| Lang | Translation | Basis recorded | Obligation |
|---|---|---|---|
| es | Reina-Valera 1909, 31,084 verses | eBible "Public Domain"; ES/US/EU | none |
| de | Lutherbibel 1912, 31,102 verses | eBible "Public Domain"; DE/EU basis rests on a third party's report of a 2014 Deutsche Bibelgesellschaft confirmation (`docs/german/RIGHTS.md`) | none; expert review of DE/EU |
| hi | IRV Hindi 2019, 31,104 verses | CC BY-SA 4.0, © 2017–2019 Bridge Connectivity Solutions | attribution + share-alike; mark modifications |
| th | Biblica Open Thai Common Version 2025 | CC BY-SA 4.0, Biblica, Inc.; trademark line | attribution + share-alike + trademark rule |
| sq | none (Bibla Shqip 2020 linked online) | rights not established | n/a |
| nb/nn | 1930 / 1938 not held; CrossWire 1930 / 1921 excerpts | Bibelselskapet "falt i det fri" with no basis; 1938 reviser d. 1984 | unverified |

The new extension bundles no Scripture. A retained-snippet feature is the exposure: a snippet of a CC BY-SA edition
shown in the practice app carries its notice. Expert review: Luther DE/EU, Norwegian 1930/1938.

## 4. Dictionaries and lexical data

`public/dict/<lang>/manifest.json` carries "Wiktionary, via kaikki.org — CC BY-SA 4.0" with a licence statement,
`source.sha256`, `retrievedAt`: de 357,750, es 808,278, hi 38,635, sq 91,271, th 20,254 entries; no nb dictionary.
The word card shows the attribution only when the reading came from the dictionary; Settings shows it per language.
Raw kaikki (`data/dictionaries/`, ~2.3 GB) is git-ignored. Frequency sidecars were built from the installed
libraries (US-only PD and CC texts included; aggregates, low exposure) and should be rebuilt without quarantined
works. Hand lexicons are owner/AI-authored; Albanian `lexicon-ladder.ts` was checked against Wiktionary and
`disputed.ts` is generated from UniParser (MIT), Wiktionary and two treebanks and is shipped;
`data/review/sq/source-agreement.json` is tracked. Decisions: KEEP built shards with obligations (visible attribution,
licence link, derived data stays CC BY-SA; expert review of share-alike scope); KEEP raw kaikki out of the repo;
QUARANTINE frequency sidecars (rebuild from clearly licensed text); KEEP hand lexicons (Albanian Wiktionary-derived
parts: expert review); QUARANTINE the tracked Wiktionary-derived review data.

## 5. Audio and pronunciation

Exactly one recording exists: `test/fixtures/golisten/de-guten-tag.{oga,wav}` + manifests, from Wikimedia Commons
(`File:De-Guten_Tag.oga`, uploaded 2007-02-27 by Beagle Beck, PD-self; authorship "assumed" by Commons). KEEP as a
test fixture with attribution; expert review only if redistributed publicly. No production audio exists;
`docs/SPEECH.md`: "No request has ever been sent to the live Azure service". Azure code (`azureProvider.ts`,
`proxyProvider.ts`, `server/speech*`) cites no Azure terms; the synthesis gate requires caller-supplied
`providerTerms`/`providerRetention`/`textDerivative` claims, not checked ones; generated audio stays on device and is
excluded from backups. Rule-based pronunciation is owner code; dictionary IPA is CC BY-SA with attribution. Expert
review: provider terms, and whether sending a learner's book passages to Azure is allowed under the book's terms and
Azure's data-retention terms.

## 6. Test fixtures copied from publications

Dictionary fixtures are hand-made and say so; `thai-synthetic-book.txt` is synthetic; long inline lines are
hand-written sentence lists; no quoted literary passage was found. ~50 test files read the real bundled data
(`data/verified/scripture.json`, `data/sources/course-library`, `data/sources/th-gap-recovery`, `data/sources/hi/gdl`,
Gutenberg texts, git-ignored `data/research/ud`, `data/benchmarks/**`); these break when the bundles are retired
and must be rewritten to synthetic fixtures (QUARANTINE). `data/benchmarks/{de,th}` gold sets are author-written;
`hi/gold-draft.jsonl` is AI-drafted (KEEP). Wikipedia/Wikisource/Global Voices material appears only in `data/sources`.

## 7. Third-party packages

Direct: dexie 4.4.6 (Apache-2.0), react/react-dom 19.3.0 (MIT), react-router-dom 7.18.4 (MIT), @types/* (MIT),
@vitejs/plugin-react 6.1.1 (MIT), fake-indexeddb 6.2.5 (Apache-2.0), jsdom 26.1.0 (MIT), typescript 6.0.3
(Apache-2.0), vite 8.3.1 (MIT), vite-node 6.0.0 (MIT), vitest 3.2.7 (MIT). Installed tree (113 packages): MIT 94,
Apache-2.0 6, ISC 4, BSD-2 2, BSD-3 2, MIT-0 1, MPL-2.0 2 (`lightningcss`, build-time). No GPL/LGPL/AGPL, no UNKNOWN.
EB Garamond fonts bundled (3 woff2) with no licence file in the repo (SIL OFL 1.1 by general knowledge, unverified).
The repo has no LICENSE file. Not checked: whether `dist` carries the required third-party notices.

## 8. Privacy-relevant data flows (facts)

Leaves the device only when set up: same-origin shard fetches; Azure speech (proxy or direct with a learner key,
both currently off); the team server (whole import documents of owner-authored/verified texts only, on an explicit
tap, Bearer contributor key). No telemetry, no background sync, no LLM calls. Stored on device: imported texts in
full (texts/sentences/tokens/analyses), the append-only event log (ids and hashes for reading events; text in
`ProductionRecorded.sentenceText`, `Stage0ProductionAttempted.text`, `Stage0ExitAnswered.text`,
`GoTellSuggestionEdited.finalText`, `UserRecordingCreated.targetText`), testimony text, drafts, recordings; backups
are unencrypted JSON including events and testimony text. The retrieval cloze is the one path that writes a read
sentence's text into events; sentences also live permanently in the `sentences` table.

## 9. The six activities

| Activity | Existing code |
|---|---|
| locally analysing text visible to its lawful user | `src/ingest/{plaintext,epub,import,pipeline}.ts`, `src/adapters/*`, `src/golearn/*`, `src/dict/*`, the Reader, `CopyImporter`, `JsonImporter`, `Books` |
| sending selected passages to a remote service | Azure direct/proxy (opt-in), team server (owner/verified texts only); no LLM calls |
| retaining snippets for review | `src/golearn/retrieval/index.ts` (clozes; `sentenceText` into events); `sentences` table; backup export |
| storing whole books | `src/ingest/*` → IndexedDB; `CopyImporter` (.txt, unprotected .epub, .json); the bundled library for retired books |
| redistributing texts | `public/library`/`data/corpus` bundles (gh-pages); team server `PUT` for owner/verified texts |
| defeating DRM | none |

DRM: `src/ingest/epub.ts` refuses protected files (`META-INF/rights.xml`, `sinf.xml`, `encryption.xml` entries other
than font obfuscation, encrypted zip entries) with `EpubError('encrypted')`; no decrypt/strip/workaround code
anywhere in `src`, `scripts`, `server`. EPUB, `.txt` and `.json` are the only ebook formats handled.

## 10. Attribution and notice obligations the new builds must carry

Wiktionary/kaikki.org (CC BY-SA 4.0, every dictionary shard and pronunciation shown from them; derived data stays
CC BY-SA); Biblica OTCV 2025 (© 2025 Biblica, CC BY-SA 4.0, trademark line) if shown; IRV Hindi 2019 (© Bridge
Connectivity Solutions, CC BY-SA 4.0); eBible PD editions (source citation by convention); Wikipedia/Wikisource-derived
units with exact revision link, CC BY-SA, statement of changes, if kept; GDL books (CC BY 4.0 credits per
`.attribution.json`); Global Voices (CC BY 3.0); Project Gutenberg trademark/licence terms; the Commons recording
credit; MIT/Apache/BSD/ISC notices for shipped packages, MPL notices if redistributed, the EB Garamond licence text.

## Could not verify

Whether the repo or Pages site is public; whether the Cloudflare worker was deployed; any author death date or
national term; the 1956 Thai translation's term and translator; whether Wikisource's CC BY-SA reaches faithful
transcriptions of PD works and the 20 adapted units; whether Wiktionary-derived shards and lexicon additions are
derivative data under CC BY-SA; the Luther DE/EU and Bibelselskapet bases; EB Garamond's licence; embedded
third-party media in Global Voices/GDL/Wikipedia; Azure's terms; `work/thai11728.epub` origin;
`test/bench/fixtures/sq-sample.conllu` origin; anything in git history later removed; a `license-checker` run.
