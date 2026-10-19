# PLAN 14 — Hebrew and Greek as one language each, with period varieties; the Variants tab; Biblia as a Go reading surface

Status: **architecture only** (2026-10-17). Nothing in this plan is built. Owner decisions and download permissions
are listed at the end; building starts when they are given.

The owner's request, verbatim: *build two new language packages, one for Hebrew, with a modern and ancient variant
(not separate languages, but siblings under the same language) and another for greek (modern, koine, attic, homeric)
… create a card that looks at whatever word the user has selected, and display that one word as GoLearn does … only add
another tab to the far right, next to Deeper, next to the breakdown of the sentence. This tab will be called Variants,
and it will parse through the historical variations of the word, "Homeric: this, Attic: , Koine: , Modern: ,
Medieval: , etc." … for GoTell, target whichever iteration of the language the user wants to target, and for
GoReview, do the same. Once these systems are in place, look at the Biblia app. I want you to recreate it. Replace the
old parsing system with this new parsing system, so that the Biblia app serves as input within GoReview.*

## 0. What the repo has and has not (measured, 2026-10-17)

- A language is a closed union `LanguageCode` (`src/core/model.ts:18`) plus `LANGUAGES`; `Script` is `Latn | Deva | Thai`;
  `direction: 'rtl'` exists in the type and is used nowhere. Adding a language touches ~25 `Record<LanguageCode, …>`
  tables (list in §7) and ~40 tests that enumerate the seven languages.
- A **variety** is metadata on a reading (`AnalysisCandidate.varieties`), on the enrolment and on events
  (`varietyId`), never identity: unit ids are `form:<lang>:…`, `lemma:<lang>:…`, so varieties of one language share
  all unit ids and mastery. That is exactly the owner's "siblings under the same language", and it is why Hebrew and
  Greek must each be ONE `languageId` (not the nb/nn two-language route).
- The adapter is **variety-blind**: `analyze(tokens)` has no variety parameter; the selected `varietyId` reaches only
  translation, events, voices and the `lang=` attribute.
- `varietyStanding` (`src/core/variety.ts`) returns `'historical'` for any tag whose `Variety.kind` is `historical`
  BEFORE the policy is consulted: a historical variety can never be the learner's target. Koine and Biblical Hebrew
  must therefore be a new kind (§1.2).
- Period variants exist only as **spelling** relations (`OrthographyRelation {modern, period}`: Norwegian 1907/1917,
  German 1901, Albanian pre-1972). No lexical or morphological period variants are modelled anywhere.
- The card (`packages/golearn-extension/src/popup/card.ts`) has pills `Go deeper` · `See full sentence` · `Report`;
  "Go deeper" opens all six sections (`LAYER_ORDER`). Only `.word` gets `dir`; the rest of the card is ltr.
- GoReview/GoTell carry `varietyId` on `ReviewTarget`, `DeckItem`, `WriterProfile`, `DraftRecord`, `WritingPrompt`
  (`varietyIds`) but never use it to choose facts, sentences, prompts or checks.
- GoReview `normalizeAnswer` folds only ë/ç; nothing for niqqud, cantillation, final forms, Greek accents/breathings/final sigma.
- Biblia (`C:\Users\CJWal\dev\biblia-v0`, repo Rookie2401/biblia, LIVE at rookie2401.github.io/biblia) already holds,
  on disk and rights-cleared: MAM Tanakh text (CC BY-SA 4.0, via Sefaria) aligned with OSHB morphology (CC BY 4.0),
  SBLGNT (CC BY 4.0) with MorphGNT (CC BY-SA 3.0), BDB (Sefaria), Abbott-Smith, Dodson, Strong's, LXX lemma counts,
  BSB interlinear. Shipped data: `public/data/he` 14 MB, `gr` 5.7 MB, `lex` 29 MB. Its decoders
  (`src/morph/hebrew.ts`, `src/morph/greek.ts`) already turn OSHB and MorphGNT codes into the card's language.
- kaikki.org (Wiktionary extracts, CC BY-SA 4.0, dated 2026-10-03): **Ancient Greek 43.3 MB gz**, **Greek 25.1 MB gz**,
  **Hebrew 8.6 MB gz**. There is NO separate Koine, Medieval/Byzantine or Biblical Hebrew extract (404): Wiktionary
  files Koine, Byzantine, Epic, Attic, Ionic and Doric forms as *labels* inside the Ancient Greek entries, and Biblical
  Hebrew inside the Hebrew entries. `src/dict/build-full.ts` `KAIKKI_LANGUAGE_NAMES` already knows `grc: 'Ancient Greek'`.

## 1. Language model

### 1.1 Two languages, period varieties

| languageId | name | script | direction | varieties (varietyId · label · analysed) |
|---|---|---|---|---|
| `he` | Hebrew · עברית | `Hebr` | rtl | `he-bib` Biblical Hebrew ✔ · `he-mish` Mishnaic/Rabbinic ✘ (recognised, not analysed) · `he-med` Medieval ✘ · `he-mod` Modern Hebrew ✔ ; `arc-bib` Biblical Aramaic (Daniel, Ezra, Jer 10:11, Gen 31:47) as `kind: 'heritage'` — read as its own language, never credited to Hebrew |
| `el` | Greek · Ελληνικά | `Grek` | ltr | `el-hom` Homeric ✔ · `el-att` Attic ✔ · `el-koi` Koine ✔ · `el-med` Medieval/Byzantine ✘ (recognised, not analysed) · `el-mod` Modern ✔ |

Variety ids are BCP-47-ish (GoPractice uses `varietyId ?? languageId` as the HTML `lang`). `analysed: false` varieties
appear in the Variants tab when a source attests a form, and in the picker only as "recognised, not a target".

### 1.2 Core changes (all additive, announced to the peers before they land)

- `src/core/model.ts`: `LanguageCode` += `'he' | 'el'`; `Script` += `'Hebr' | 'Grek'`.
- `src/core/config.ts`: two `LANGUAGE_ROWS` (`he` with `direction: 'rtl'`), courses `hebrew` and `greek` whose
  `variety` policy names the learner's target (default `he-mod` / `el-koi` until the picker sets one; see §5).
- `src/core/variety.ts`: new `Variety.kind` value **`'period'`** — "a historical stage of this language that a learner
  may actively target". `varietyStanding` treats `period` like a national variety (target / within-target / receptive),
  not like `historical`. `varietyLine` gets one sentence for a receptive period ("Attic — an earlier stage of the
  language: recognise it; your target is Koine."). Existing languages are untouched (`historical` keeps its meaning).
- `src/core/adapters.ts`:
  - `analyze(tokens, opts?: { varietyId?: string })` — optional hint; adapters that ignore it behave as today.
  - `checkProduction(tokens, analyses, sentence, opts?: { varietyId?: string })` — same.
  - new optional **`variants?(lemma: string, pos: PartOfSpeech, surface?: string): VariantSet | undefined`** (§3).
  - `AnalysisCandidate.varieties` already exists; every Hebrew/Greek reading carries the period(s) it is attested in.

## 2. The adapters

Both follow the sq/norwegian layout: `src/adapters/he.ts` + `src/adapters/hebrew/**`, `src/adapters/el.ts` +
`src/adapters/greek/**`, version `adapter-he@1`, `adapter-el@1`. Every number below is to be MEASURED by a
`he:check-analyzer` / `el:check-analyzer` script before any pack claims it (the Albanian rule: all sources must agree;
unanimous / majority / disputed / single-source recorded per reading).

### 2.1 Hebrew (`he`)

| part | source (rights) | what it gives |
|---|---|---|
| Biblical token lexicon | OSHB morphology aligned to MAM, from `biblia-v0/data/oshb` + `data/mam-raw` (CC BY 4.0 / CC BY-SA 4.0) | every attested Tanakh form → lemma id, prefix chain, stem, conjugation, PGN, state, suffix, with its attestation count; ~300k tokens, ~8.7k lemmas. Readings tagged `he-bib`. |
| Biblical dictionary | BDB via Sefaria + Strong's + Open Scriptures index (`biblia-v0/data/bdb-*`, `lexicon/`) | glosses, roots, families, LXX renderings → re-sharded into Go's `public/dict/he` format (git-ignored like `sq`) |
| Modern lexicon + tables | **kaikki Hebrew (8.6 MB gz; download needs permission)** | lemmas, inflection tables (binyan/tense/person, noun plural/construct/possessive), senses, etymology ("from Biblical Hebrew …"), labels (Biblical, Rabbinic, Medieval, Modern, colloquial) |
| Rule engine | owner-authored, machine-drafted, unreviewed | clitic peeling (וְ בְּ לְ כְּ מִ הַ שֶׁ הֲ), pronominal suffixes, final-form folding, niqqud/cantillation stripping (`normalize`, `searchNormalize`), binyan pattern recognition on consonantal skeletons for forms outside both lexicons (always `unconfirmed`) |
| Second source for agreement | OSHB vs kaikki tables where both hold a form; Biblia's own `hebrew.ts` decoder as a third reading of the same code | `he:agreement` report, like `sq:agreement` |

Variety resolution per selection (in the adapter, never by guessing): pointed text with te'amim → `he-bib`; pointed
without te'amim → ambiguous (both lexicons consulted, the learner's target breaks ties, the card says so); unpointed →
`he-mod` first, Biblical consonantal match second. A page/book tag `hbo` → `he-bib`; `he` → `he-mod`.

Pronunciation: Modern Hebrew device/Azure voices (`he-IL-HilaNeural`, `he-IL-AvriNeural` are the expected remote
voices; what GoListen really holds is stated by the capability report, not by the pack). Biblical Hebrew has NO voice:
the card plays the modern voice **labelled "modern pronunciation"** and gives a written Tiberian-style transliteration
line beside the modern one. Nothing is called a reconstruction unless a source is named.

### 2.2 Greek (`el`)

| part | source (rights) | what it gives |
|---|---|---|
| Koine token lexicon | MorphGNT + SBLGNT from `biblia-v0/data/gnt` (CC BY-SA 3.0 / CC BY 4.0) | every NT form → lemma, POS, parse (person·tense·voice·mood·case·number·gender·degree); ~138k tokens, ~5.4k lemmas; readings tagged `el-koi`. LXX lemma counts (lxx-morph) as a second Koine witness of the lemma, not of the form. |
| Koine dictionary | Abbott-Smith (public domain), Dodson (public domain), Strong's | glosses → `public/dict/el` shards |
| Ancient lemmas, tables, dialect labels | **kaikki Ancient Greek (43.3 MB gz; permission)** | full inflection tables (many with Epic/Attic/Ionic/Doric/Koine rows), senses, etymology, descendants ("Greek: …" → the Modern form), labels (Epic, Attic, Koine, Byzantine, Late) — the backbone of Homeric, Attic and the Variants tab |
| Modern lemmas + tables | **kaikki Greek (25.1 MB gz; permission)** | Modern paradigms, senses, etymology ("from Ancient Greek …", "from Byzantine Greek …") |
| Second source for Attic/Homeric agreement | **Perseus Ancient Greek Dependency Treebank** (`PerseusDL/treebank_data`, CC BY-SA 3.0, repo ≈ 78 MB; permission) — Homer, Hesiod, Aeschylus, Sophocles, Plato … | gold lemma + morphology for ~560k tokens; the held-out agreement set for `el-hom` / `el-att`, as UD TSA/STAF was for Albanian |
| Dictionary of record for Attic/Homeric (optional, phase 2) | **LSJ** from `PerseusDL/lexica` (CC BY-SA 4.0, repo ≈ 140 MB; permission) | fuller senses than kaikki for ancient words; deferred — kaikki glosses suffice for a first pack |
| Rule engine | owner-authored, machine-drafted, unreviewed | accent/breathing/iota-subscript folding (`normalize`), final-sigma folding, movable-nu, crasis/elision marks, augment and reduplication stripping, contract-verb and third-declension pattern recognition for forms outside the lexicons (always `unconfirmed`) |

Variety resolution per selection: monotonic text → `el-mod`; polytonic → ancient, then: NT/LXX attested form → `el-koi`;
Homeric markers (-οιο, -εσσι, -φι, κε(ν), unaugmented aorists, tmesis, Ionic η for ᾱ) → `el-hom`; Attic markers
(-ττ-, -ρρ-, dual, ᾱ after ε ι ρ) → `el-att`; otherwise the learner's target, and the card states the basis. A page/book
tag `grc` → ancient (sub-period as above), `grc-koi`/`grc-x-koine` → `el-koi`, `el` → `el-mod`.

Pronunciation: Modern Greek voices (`el-GR-AthinaNeural`, `el-GR-NestorasNeural` expected). Ancient periods have no
voice; the card plays the modern voice labelled "modern pronunciation" and writes three transliteration lines where
they differ — Modern, Koine (Horrocks/Buth-style, named), Erasmian (named) — each as a convention with its source, not
as "how it sounded".

### 2.3 Honesty floor

Each adapter's `support.limitations` and each pack's `thin[]` state: nothing reviewed by a native or classical scholar;
Mishnaic/Medieval Hebrew and Byzantine Greek recognised from labels only; forms outside the token lexicons are
pattern-matched and unconfirmed; the agreement numbers are what the `*:agreement` scripts measured on the date given.

## 3. The Variants tab

### 3.1 Data

```ts
export interface VariantForm {
  varietyId: string;            // 'el-hom' | 'el-att' | 'el-koi' | 'el-med' | 'el-mod' | 'he-bib' | …
  label: string;                // "Homeric", "Attic", …
  forms: string[];              // lemma (and, when known, the selected cell's form in that period)
  gloss?: string;               // meaning in that period when a source gives one and it differs
  status: 'attested' | 'same-as-lemma' | 'not-in-sources' | 'not-yet-existing' | 'obsolete';
  sources: string[];            // 'kaikki-grc', 'morphgnt', 'perseus-agdt', 'oshb', 'kaikki-el', 'bdb', …
  note?: string;                // "Ionic/epic genitive -οιο", "Attic -ττ- for -σσ-", "Modern Greek lost the dative"
}
export interface VariantSet { lemma: string; pos: PartOfSpeech; rows: VariantForm[] }  // rows in period order
```

Built offline into `src/adapters/greek/variants.ts` / `hebrew/variants.ts` (generated, like `albanian/disputed.ts`)
from: kaikki dialect-labelled table rows and alternative-form links; kaikki descendants/etymology chains
(Ancient → Byzantine → Modern; Biblical → Rabbinic → Modern); MorphGNT/OSHB attestation; Perseus treebank attestation.
Every row says which source attests it; a period with no evidence says **"not in our sources"** rather than inventing a
form; a word that first appears later (a Modern coinage) says "not yet existing" for earlier periods.

### 3.2 Card

`packages/golearn-extension/src/popup/view.ts`: `LayerName` += `'variants'`; `CardModel.variants?: VariantSet`.
`card.ts`: a fourth pill **Variants** placed immediately right of "See full sentence" (pills: Go deeper · See full
sentence · Variants · Report; the Report pill stays last as the utility pill — owner may flip), a `.variants` panel
(table: period · form(s) · gloss · source), the three-way `setPills('deeper'|'sentence'|'variants'|'none')`,
`onLayer('variants')` reported once on first opening. The pill is rendered only when the model has `variants`; sq/es/de/
hi/th/nb/nn cards are unchanged. The card gets `dir` from the language row (whole card rtl for Hebrew, the English
rescue list stays ltr per cell).

`cardModel.ts` fills `variants` from `adapter.variants(lemma, pos, surface)`; the word's own period row is marked
"this text".

## 4. Packs, extension, GoListen, Repository

- `packages/language-packs/src/packs/he.ts`, `el.ts` (`experimentalManifest` to start; `installable` once the validation
  cases and dictionary are in), tutorials `tutorial/he.ts`, `el.ts`, registry/catalogue entries 7 and 8 (`SCRIPT_NAME`
  += Hebr/Grek; `plannedManifest` takes `direction`), ≥12 validation cases **per analysed variety**, written as the
  analyser really reads them. Catalogue picker: kind `'variety'` (the Spanish route) with `required: true` for he/el —
  the learner must choose a target period; each (languageId, varietyId) pair is its own enrolment (already supported).
- Extension: `analysers/he.ts`, `el.ts`, `IMPORTS`, `ANALYSER_IDS`, `LANGUAGE_META` (`he`: `/^(he|iw|hbo)(-|$)/`;
  `el`: `/^(el|grc)(-|$)/`), `SCRIPT_TEST` Hebr/Grek, resolver `PACK_SCRIPT`/`PRIMARY`/`scriptShare` for the two
  scripts, `speech.ts` allow-list, `voiceTags.ts`, `gloss.ts` names; dictionary copy list.
- GoListen: `HEBREW_DEVICE_TAGS = ['he-IL','he','iw']`, `GREEK_DEVICE_TAGS = ['el-GR','el']`, `deviceRegistry` for both,
  `speechVarietyLocale` (`he-mod → he-il`, `el-mod → el-gr`; ancient periods → `noAudioRegistry` with the modern-voice
  fallback stated as such), two Azure entries each if the owner's subscription offers them.
- Repository: `repository-linguistics/resolver.ts` loses the `hi`-only non-Latin exemption (script from the language
  row), `scriptId` from the row; `LANGUAGES`/`packFor` entries; `repository-local` STOCK unchanged (host passes the
  adapter). `AnalysisCandidate.varieties` is carried into `LinguisticUnit.varietyId` for lexeme units so GoReview can
  filter (today it is dropped).
- GoReview `normalizeAnswer` `loose`: strip niqqud/cantillation, fold final forms; strip Greek accents/breathings/
  iota subscript, fold final sigma — per language, never globally.

## 5. GoTell and GoReview: "target whichever iteration the user wants"

- The enrolment's `varietyId` is the target period (picker, §4). GoTell: `WriterProfile.varietyId` → `checkProduction(…,
  { varietyId })`: Hebrew checks Modern spelling conventions (plene ו/י, no niqqud) against a `he-mod` target and flags
  Biblical-only forms as `'register'` ("wayyiqtol narrative form — Biblical; Modern uses the past tense"); Greek checks
  monotonic vs polytonic against the target, flags Modern forms in a Koine draft and Koine/Attic forms in a Modern
  draft as `'dialect'`/`'register'` proposals (never corrections). Prompts: `WritingPrompt.varietyIds` is finally
  consumed — Koine prompts (paraphrase a verse, write a short letter in the manner of Philemon), Modern prompts
  (everyday, mission communication). `guidancePackFor` reads the pack's per-variety constructions.
- GoReview: intake sets `varietyId` from the enrolment; the facts provider filters example sentences and paradigm cells
  to the target period (Koine learner: NT sentences, Koine paradigm; Modern learner: Modern sentences, Modern paradigm)
  and shows other periods only as a "variants" note; pronunciation facts per period as §2; `ReviewTarget.varietyId`
  is already on every event. A word met in Biblia (he-bib / el-koi) and reviewed by a learner whose target is Modern
  is kept in the deck under its own enrolment — nothing is suppressed, nothing is credited to the wrong period.

## 6. Biblia, recreated as a Go reading surface

Recommendation: **a new package `packages/biblia`** in go-v0 (the existing biblia-v0 repo and live site stay as they
are until the new one reaches parity; nothing there is deleted).

- Text data: the immutable `he/*.json` (MAM + OSHB tokens) and `gr/*.json` (SBLGNT + MorphGNT tokens) copied from
  biblia-v0 with their `SOURCES.json`; the BDB/Abbott-Smith HTML lexica become the `he`/`el` dictionaries (§2), not a
  parallel lexicon.
- Parsing: the per-token OSHB/MorphGNT codes are no longer decoded by Biblia's own `morph/*.ts`; the tokens are passed
  to `adapter-he`/`adapter-el` as a **pre-aligned analysis hint** (`analyze(tokens, { varietyId: 'he-bib', hints })`)
  so the shared card shows the same Form/Grammar/Syntax/All forms/Meanings/Origin/Structure/Sentence/Variants layers as
  on any web page, with the Tanakh/NT reading marked `high-confidence` (OSHB/MorphGNT are gold here) and the adapter's
  own reading beside it when it disagrees (disputed, visible).
- Reader: book → chapter → verse list, word selection → the shared card (`golearn-extension/src/popup/card.ts`, as the
  controlled reader already uses the shared contract), status marks (new/recognized/familiar/known/automatic map onto
  the existing `buildMarkEvent` ratings), positions and progress; RTL layout for Hebrew.
- Repository: every lookup, mark and chapter read is a `GoEvent` with `languageId: 'he'|'el'`, `varietyId: 'he-bib' |
  'el-koi'` (Aramaic verses `arc-bib`, heritage), `readerId: 'biblia'`, through `repository-service` in the same
  device/account modes as GoPractice — this is what makes Biblia *input for GoReview*: its lexeme units enter intake
  like any GoLearn lookup.
- Rights page: MAM CC BY-SA 4.0, OSHB CC BY 4.0, SBLGNT CC BY 4.0, MorphGNT CC BY-SA 3.0, BDB/Abbott-Smith/Dodson public
  domain, Strong's public domain, kaikki CC BY-SA 4.0 — restated in the pack `rights` and the reader's Sources screen.

## 7. Phases, each ending in a measured, committed state

| phase | deliverable | gate |
|---|---|---|
| P0 | this plan; peer announcement of the core/shared hunks; download permissions | owner's decisions (§8) |
| P1 | core additive changes; `he` adapter (Biblical from biblia-v0 data; Modern after the kaikki download); `he:check-analyzer`, `he:agreement`; `public/dict/he`; pack `he` experimental; tests (`test/adapters/hebrew-*.test.ts`, `test/reader-languages/he.test.ts`, every enumerating test from the map) | `npm test` green; agreement report committed in `docs/hebrew/STATUS.md` |
| P2 | `el` adapter (Koine from biblia-v0; Attic/Homeric/Modern after the downloads); `el:agreement` against the Perseus treebank; `public/dict/el`; pack `el` | same, `docs/greek/STATUS.md` |
| P3 | Variants tab (view.ts, card.ts, cardModel.ts), variants tables for both languages, variety resolution per selection, RTL card; extension dist rebuilt | card tests + Browser-pane check on a Hebrew and a Greek page |
| P4 | GoTell/GoReview variety targeting (§5), GoListen registries, Repository variety carry-through | multilang tests; a Koine and a Modern enrolment reviewed side by side |
| P5 | `packages/biblia` reader → Repository → GoReview intake | a word looked up in Genesis 1 / John 1 appears in a GoReview session under `he-bib` / `el-koi` |

Files I will own (one writer per file): `src/adapters/{he,el}.ts`, `src/adapters/{hebrew,greek}/**`,
`packages/language-packs/src/packs/{he,el}.ts`, `tutorial/{he,el}.ts`, `packages/golearn-extension/src/analysers/{he,el}.ts`,
`packages/golearn-extension/src/popup/{card,view,cardModel}.ts` (Variants only), `packages/biblia/**`,
`scripts/{he,el}-*.mts`, `data/**/{he,el}/**`, `public/dict/{he,el}`, `docs/{hebrew,greek}/**`, `docs/PLAN14.md`,
`test/adapters/{hebrew,greek}-*.test.ts`, `test/reader-languages/{he,el}.test.ts`.
Shared files touched with small additive hunks, announced first: `src/core/{model,config,variety,adapters}.ts`,
`src/adapters/index.ts`, the `Record<LanguageCode,…>` tables (`src/ingest/{quality,language,format}.ts`,
`src/course/{curriculumPolicy,bibleAccess}.ts`, `src/golisten/{azureProvider,fixtureProvider}.ts`, `src/gotell/**`,
`src/stage0/**`, `packages/gotell/src/salvage/concepts.ts`), extension `loaders.ts`, `vite.config.ts`, `parser/{registry,index}.ts`,
`language/resolve.ts`, `background/{speech,gloss}.ts`, `content/voiceTags.ts`, language-packs `registry.ts`,
`catalogue.ts`, `builtins.ts`, `manifest.ts`, `packs/planned.ts`, golisten `deviceTags.ts`, `registry.ts`, `environment.ts`,
repository-linguistics `resolver.ts`, `packs.ts`, goreview `grading/normalize.ts`, and the enumerating tests. The
extension `content/controller.ts`, `background/core.ts`, `language/capabilities.ts` and `app/**` currently carry a
peer's uncommitted edits: I do not touch them; the Variants model reaches the card through `cardModel.ts` only.

Peer constraints agreed 2026-10-17 with the "(fork)" session: `packages/repository-contract/src/{ports,units}.ts` are
not touched until that session's lane A is committed (it will say when); `packages/language-packs/src/runtime.ts`,
`src/dict/**`, `scripts/dict-*.mts`, `test/dict/**` and `test/language-packs/**` are that session's — my
`KAIKKI_LANGUAGE_NAMES` additions and the re-pinned language-pack tests go to it as patches, not edits; the
uncommitted reason-message hunks in extension `content/controller.ts` / `background/core.ts` belong to the GoListen
session's commit. `src/core/adapters.ts` additions stay optional (agreed).

## 7a. Status (2026-10-18)

Owner decisions taken (2026-10-18): downloads approved and done; one languageId per language with `kind: 'period'`; Variants pill right
of "See full sentence", before Report; Biblia to be RECREATED (texts and organisation copied, GoLearn parsing only, no old parsing code);
default target Modern (he-mod / el-mod) with immediate, text-driven switching to the actual period.

| phase | state |
|---|---|
| P0 | done |
| P1 | **built, tests green, uncommitted**: core additive changes; `he` adapter + Biblical/Modern indexes + pack:he + tutorial; `test/adapters/hebrew-biblical.test.ts` 20/20, `hebrew-greek-packs.test.ts` 6/6; measured numbers in `docs/hebrew/STATUS.md` |
| P2 | **built, tests green, uncommitted**: `el` adapter + Koine/Ancient/Modern indexes + pack:el + tutorial; `greek-periods.test.ts` 15/15; Perseus treebank downloaded, not yet consulted; `docs/greek/STATUS.md` |
| P3 | **card done** (`view.ts` 'variants', `CardModel.period/variants`, `card.ts` Variants pill + panel + period line, `store/index.ts` ExpandedLayer; `test/extension/card.variants.test.ts` 4/4). **Extension registration pending**: LANGUAGE_META, loaders, ANALYSER_IDS, resolve.ts, capabilities.ts, app language list and the PARSER_LANGUAGES test pins wait on the Latin session's lane in the same files (agreed order: Latin commits its Latin-only paths, then this session commits the shared files with both sets of rows). Done elsewhere: analyser chunks `analysers/{he,el}.ts`, SCRIPT_TEST Hebr/Grek, speech allow-list, gloss names, voiceTags, GoListen device tags/registries/variety locales, audit tests. The 123 MB Ancient Greek asset must be sharded before any host ships it. |
| P4 | **built, tests green, uncommitted**: GoReview `FactsProvider.factsFor(…, varietyId)`, `ReviewPreferences.varietyId`, period-aware `createFactsProvider` (reads the pack's sentences in the target period, prefers its examples, falls back, never invents), GoPractice `packFactsFor` one provider per period, intake/runner pass the variety, `normalizeAnswer` loose folds for Hebrew points and Greek accents (`test/goreview/facts.period.test.ts` 7/7); GoTell `AnalyzerDeps.varietyId` → `adapter.analyze/checkProduction(…, {varietyId})`, `PromptQuery.varietyId` + `WritingPrompt.varietyIds` finally consumed, GoPractice tellEngine passes the enrolment's variety. Not done: period-specific prompts for he/el; the GoPractice UI's period picker (catalogue `varieties` already lists the choices). |
| P5 | **shell built, uncommitted**: `packages/biblia` (README, canon + numerals, data loader, hash router with library / reader / settings / sources, the shared GoLearn card, events through the extension's on-device Repository with enrolments per period; `scripts/biblia-import.mts` copies the 66 books + canon from biblia-v0 into `packages/biblia/public/data`, git-ignored); `test/biblia` 8 green (the lookup case is skipped until the parser lists he/el). Not yet: the extension-page build wired into `ext:build`, the browser walk, the per-token gold hint, a dictionary panel, sharding of the Ancient Greek asset. |

## 8. Owner decisions and permissions needed before P1

1. **Downloads** (each to its own empty directory under `data/raw/`, read with scripts kept elsewhere):
   - `kaikki.org-dictionary-Hebrew.jsonl.gz` — kaikki.org — 8.6 MB (needed for Modern Hebrew; P1)
   - `kaikki.org-dictionary-AncientGreek.jsonl.gz` — kaikki.org — 43.3 MB (Homeric/Attic/Koine tables + Variants; P2)
   - `kaikki.org-dictionary-Greek.jsonl.gz` — kaikki.org — 25.1 MB (Modern Greek; P2)
   - `PerseusDL/treebank_data` master zip — github.com — ≈ 78 MB (agreement source for Attic/Homeric; P2)
   - optional, later: `PerseusDL/lexica` master zip (LSJ) — github.com — ≈ 140 MB
   Biblical Hebrew and Koine need no download: everything is already in `C:\Users\CJWal\dev\biblia-v0\data`.
2. One languageId per language (`he`, `el`) with period varieties as targets (new `Variety.kind: 'period'`) — confirm.
3. Variants pill position: right of "See full sentence", before "Report" (or after Report, truly last).
4. Biblia rebuilt as `packages/biblia` inside go-v0, live biblia-v0 site left untouched — confirm.
5. Default target when the learner has not chosen: `he-mod` and `el-koi` (missions use) — or force the choice.
