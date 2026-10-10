# @go/language-packs

The reusable language-pack framework of GoLearn, and the Albanian reference pack. The product serves exactly six languages of interest
(Norwegian, German, Albanian, Hindi, Thai, Spanish); any learner may pick any language pack freely, there are no mission teams in the
apps, and an account is optional. A pack is a declarative **manifest**
(data) plus an **analyser** (an adapter from `src/adapters`), an optional **dictionary** (sharded files under
`public/dict/<lang>/`), an **orientation tutorial** (data) and a list of **validation cases** that prove the analyser
still reads real selections the way the manifest says.

Imports allowed here: `packages/repository-contract/src`, `src/adapters/*`, `src/dict/*`, `src/core` types. Never
`src/course`, `src/ladder`, `src/stage0`, `src/library`, `src/ui`, `src/golearn` or an application package (enforced by
`test/ecosystem/boundaries.test.ts`).

```
src/manifest.ts       PackManifest, validateManifest, toPackInfo (the Repository's LanguagePackInfo)
src/analysis.ts       readSelection / runCase / statusOf: read a selected word, run a validation case
src/packs/sq.ts       the Albanian manifest (installable) and its 14 validation cases
src/packs/es.ts       the Spanish manifest (installable at a MINIMAL level, machine-drafted, NOT production-ready) and its 17 validation cases
src/packs/{de,hi,th,nb,nn}.ts  the EXPERIMENTAL manifests (installable, seed-only, unreviewed; built by packs/experimental.ts) and their validation cases (14 each)
src/packs/planned.ts  plannedManifest: a manifest for a language that has an analyser and nothing else (no pack is planned only at present)
src/capabilities.ts   packCapabilities(languageId): what a pack really supports (see docs/ecosystem/reader/LANGUAGE-PACK-CAPABILITIES.md)
src/catalogue.ts      LANGUAGE_CATALOGUE: the six languages for a picker (see "The catalogue" below)
src/tutorial/         TutorialStep types; sq.ts the Albanian orientation as data, es.ts a minimal Spanish one, {de,hi,th,nb,nn}.ts minimal ones
                      (built by orientation.ts); index.ts has TUTORIALS and tutorialFor(languageId) for all seven ids
src/runtime.ts        createPackRuntime, installPack, verifyInstalled
src/registry.ts       PACKS, packFor, installablePacks (TEAMS is kept for the older team views; nothing is chosen by team any more)
```

## The packs

| pack | language | level (`LEVEL_LABEL`) | validation | analyser | dictionary | cases | orientation |
|---|---|---|---|---|---|---|---|
| `pack:sq` | Albanian | installable | unreviewed | adapter-sq@9 | kaikki-sq, 91,271 | 14 | tutorial/sq (15 steps) |
| `pack:es` | Spanish (Honduras is a variety) | installable at a minimal level | unreviewed | adapter-es@12 | kaikki-es, 808,278 | 17 | tutorial/es (minimal) |
| `pack:de` | German | experimental, seed-only lemmatisation, unreviewed | experimental | adapter-de@9 | kaikki-de, 357,750 | 14 | tutorial/de (7 steps) |
| `pack:hi` | Hindi (Devanagari) | experimental | experimental | adapter-hi@6 | kaikki-hi, 38,635 | 14 | tutorial/hi (7 steps) |
| `pack:th` | Thai (Thai script) | experimental | experimental | adapter-th@5 | kaikki-th, 20,254 | 14 | tutorial/th (7 steps) |
| `pack:nb` | Norwegian Bokmål | experimental | experimental | adapter-nb@2 | none | 14 | tutorial/nb (8 steps) |
| `pack:nn` | Norwegian Nynorsk | experimental | experimental | adapter-nn@2 | none | 14 | tutorial/nn (8 steps) |

Every pack is `machine-drafted`: no native speaker has checked any word list, rule, grammar text or tutorial. `level` and `validation` are
read from the manifests (`levelOf`, `validationOf`), never typed twice.

## The manifest

| field | meaning |
|---|---|
| `packId`, `languageId`, `varietyId`, `scriptId`, `version` | `packId` is `pack:<languageId>`; `version` is the analyser's version (a pack is versioned by its analyser) |
| `compatibility` | `contractVersion` of the Repository contract, `extensionMin` |
| `identity` | name, native name, text direction |
| `varieties` | every variety named; `analysed: false` means related to, not analysed. Norwegian packs carry `writtenStandard: 'nb' \| 'nn'` on every variety |
| `lexical.handLexicon` | where the hand word list lives, its licence and review status |
| `lexical.dictionary` | `id`, `baseUrl` relative to the application's asset base and ending `<lang>/` (e.g. `dict/sq/`), licence, the **attribution line**, entry count, frequency flag |
| `analyzer` | `id` (`adapter-<lang>@<version>`), `version`, `capabilities` (`lemma`, `morphology`, `phrases`, `pronunciation-notes`, …) |
| `segmentation`, `sentenceBoundaries` | `adapter` or `intl` |
| `grammar` | `features` (key, label, value names, plain-language `explain`), `constructions` (id, label, `explain`), `clitics` |
| `pronunciation` | registry reference (`golisten:<lang>`), whether notes exist, recordings (`none` \| `some`), whether a device voice is expected, remote voice (`requiresConsentAndKey: true`, always) |
| `tutorial` | `ref`, `estimatedMinutes` (the tutorial's own length for a pack that has one), `skippable: true` (always) |
| `rights` | `provenance` statements, `licences`, `reviewStatus` (never higher than the hand lexicon's) |
| `validation` | real selections: `{ id, surface, sentence?, expect: { lemma?, pos?, features?, status?, readings? } }` |
| `status` | `installable` or `planned` |
| `level` | optional: `installable`, `experimental` or `planned`. An experimental pack (German, Hindi, Thai, Norwegian Bokmål and Nynorsk) has `status: 'installable'` and `level: 'experimental'`, shown as "experimental, seed-only lemmatisation, unreviewed" (`LEVEL_LABEL`); absent = the level the status implies (`levelOf`). `validateManifest` refuses `planned` with an installable status and an experimental pack that claims review |

An experimental pack may declare **no dictionary** (Norwegian: none is built in the repository); every other installable pack must.
`installPack` then fetches nothing, runs the validation cases, and records `dictionaryManifest: false, sampleShard: false, dictionary:
'none-declared'`, so the record says "nothing to check" rather than claiming a check.

`validateManifest` refuses, among others: a CC BY-SA dictionary without `Wiktionary, via kaikki.org — CC BY-SA 4.0`;
an absolute dictionary path; a remote voice that does not require consent and a key; a tutorial that cannot be
skipped; a pack that claims more review than its hand lexicon; an installable pack with fewer than 12 validation
cases; an analyser id that does not name its language and version.

## Runtime

```ts
const rt = createPackRuntime(PACKS.sq, { fetch, baseUrl: '/' });   // baseUrl: where dict/ lives
rt.analyzer();                 // the real adapter for sq; a tokenize-only Intl.Segmenter fallback (that says so) for others
await rt.gloss('libër', 'NOUN');  // { senses, attribution, frequencyRank? } | undefined — lazy shards, never throws
rt.explainFeature('Case', 'Acc'); rt.explainConstruction('definite-accusative-singular'); rt.coverageNotes();

const r = await installPack(PACKS.sq, { fetch, baseUrl: '/', storage });
// { ok: true, verified: { dictionaryManifest, sampleShard, validation: [{ id, pass, got? }] }, installedAt, validationFailures }
// { ok: false, reason: 'planned' | 'invalid-manifest' | 'no-analyser' | 'dictionary-unreachable' | 'dictionary-invalid'
//             | 'dictionary-mismatch' | 'shard-unreachable' | 'storage-failed', detail }
await verifyInstalled(PACKS.sq, storage);   // reads `pack:installed:<packId>` = { version, installedAt, verified }
```

`installPack` fetches `dict/sq/manifest.json` (checks `lang`, `entries` and `id` against the manifest), fetches one
shard, runs every validation case through the real analyser and records the result. A failing validation case does
not stop the install and is never hidden: it is in `verified.validation` (with what the analyser really read) and
counted in `validationFailures`. A planned pack is refused.

## Adding a pack

1. Write the adapter in `src/adapters/<lang>.ts` (outside this package) and, if licensed, build its dictionary shards.
2. Copy `src/packs/sq.ts`: set `version` to the adapter's version, name its capabilities, write the grammar features
   and constructions with plain `explain` texts, state `rights` honestly.
3. Write at least 12 validation cases against the adapter as it really behaves, run them, and correct the
   expectations (never the adapter) where they disagree.
4. Write the orientation (`src/tutorial/<lang>.ts`) and check that its passage is fully covered by the analyser.
5. Set `status: 'installable'` (or `level: 'experimental'`), register it in `src/registry.ts`, and add it to the catalogue table in
   `src/catalogue.ts` if it is one of the languages the product offers.

## Albanian (`pack:sq`) — what it contains

- Analyser `adapter-sq@9` (version read from `sqAdapter.version`; agrees with `packages/repository-linguistics`'s
  `albanianPack()`): lemmas and morphology from a machine-drafted word list of about 1,350 words (the adapter's own statement) plus the closed classes and word-form rules,
  phrase units, constructions, per-letter pronunciation notes, production checks.
- Dictionary `kaikki-sq@2026-09-28`, 91,271 entries, with a frequency list.
- Grammar: Case, Definite, Gender, Number, Tense, Mood, Person, Voice, VerbForm, PronType; eight constructions
  (definite accusative singular, definite nominative singular, definite plural, linking article + adjective, clitic
  doubling, definite noun ending, nuk negation, `a` questions); clitics `e i të u më na ju ma ta ia ua`.
- Pronunciation: written notes only, no recordings; an optional remote Azure voice (`sq-AL-AnilaNeural`,
  `sq-AL-IlirNeural`) that needs the learner's consent and key.
- 14 validation cases, all passing against the adapter (see `test/language-packs/sq-validation.test.ts`).
- Orientation `tutorial/sq`: 15 steps, about 28 minutes (alphabet, sounds, 12 words, two sentence patterns, a 7-sentence
  demonstration passage, seven concept cards).

## Review status and licences

Everything linguistic is **machine-drafted and has not been checked by a native speaker**: the word list, the rules,
the phrase list, the grammar texts, the tutorial and its passage. The passage was checked by machine only (every word
is read by the analyser with confidence of at least 0.5); that is a coverage check, not a judgement of naturalness.

| resource | licence |
|---|---|
| Albanian word list, rules, phrase and construction lists (`adapter-sq`) | owner-authored, AI-drafted |
| dictionary `kaikki-sq@2026-09-28` | CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org); every surface that shows a gloss shows "Wiktionary, via kaikki.org — CC BY-SA 4.0" |
| orientation and demonstration passage | owner-authored, AI-drafted |

The `de`, `hi`, `th`, `nb` and `nn` manifests are **experimental** (see "Experimental packs" below). The `es` pack is installable at a minimal level (see "Spanish").

## Norwegian: two packs

Norwegian is written in two standards, Bokmål (`pack:nb`) and Nynorsk (`pack:nn`). Each is its own pack with its own analyser
(`adapter-nb@2`, `adapter-nn@2`, one shared engine), its own 14 validation cases, orientation and item ids. The learner chooses one;
neither is a default, neither is credited for the other (the nb ↔ nn word families relate `jeg` and `eg`, they do not merge them), and
`validateManifest` refuses a Norwegian pack whose varieties do not all name its written standard. There is no kaikki dictionary for
Norwegian in the repository, so both packs declare none (meanings come from the pack's own word list). The Nynorsk word list is smaller
than the Bokmål one and the Nynorsk adapter checks no writing.

## The catalogue

`LANGUAGE_CATALOGUE` (src/catalogue.ts) is the data a language picker needs, for exactly six languages in this order: Norwegian
(`languageId: 'nb'`; `writtenStandards`: Bokmål `nb` and Nynorsk `nn`; packs `pack:nb`, `pack:nn`), German, Albanian, Hindi
(Devanagari), Thai (Thai script) and Spanish (`varieties`: `es-standard` "General" and `es-HN` "Honduras (regional preference)"; Honduras is a
variety of the one Spanish pack, not a language). Each entry has `name`, `nativeName`, `scriptId`, `scriptName`, `packIds`, `packs`
(each pack's level, validation, review status and `tutorialAvailable`), the weakest `level` / `validation`, `tutorialAvailable`, an `audio`
line, and one honest sentence each of `whatWorks` and `whatDoesNot`. Only the identity (which packs, which standards, which varieties)
is written in the table; everything else is read from the manifests, the tutorial registry and the capability reports, and
`test/language-packs/catalogue.test.ts` compares every field with them. `audio` is "no validated audio" unless a GoListen provider is passed
to `buildCatalogue({ audio, adapterOf })`; `LANGUAGE_CATALOGUE` itself is built from the analysers linked into the build, so a lazy
extension build that wants the capability sentences builds its own catalogue after loading the analysers (an entry whose analyser is
not loaded says so instead of claiming anything).

## Teams (retired as a choice)

`TEAMS` still lists six teams (albania, honduras, germany, india, thailand, norway) for the views that were written before the pivot. A
team was never a language and no identifier joins a team to a learner's language; the apps no longer choose a language by team. Use
`LANGUAGE_CATALOGUE` and `PACKS`.

## Spanish (`pack:es`): the second language, and what is thin

Spanish goes through the same manifest, installer, runtime and tutorial as Albanian (test/multilang). It is installable
at a minimal level and says `reviewStatus: 'machine-drafted'`; no native speaker has checked any of it. What is thin:

- lemmatization is seed-only (about 1,500 hand-listed lemmas plus the closed classes); other words get a rule reading
  marked as inferred, or none; every rule reading stays `provisional`;
- morphology is rule-based and has not been measured on running prose; ambiguity is kept, not resolved;
- 17 validation cases (the minimum is 12), single words in short sentences; the tutorial is a short orientation
  (writing system, ten words, two patterns, a five-sentence passage, four concept cards), not a course; voseo is
  detected by the adapter but not taught;
- no recordings; GoListen has no per-letter Spanish phonetic rule set (the adapter's own short pronunciation notes are
  shown); device voices are accepted only for es-HN, es-419, es-MX and es-ES, remote Azure voices only with consent and a key;
- the runtime bundles the analysers for sq, es, de, hi, th, nb and nn (`builtInAdapter`); `deps.adapter` is for a language it does not bundle.

## Experimental packs (`pack:de`, `pack:hi`, `pack:th`, `pack:nb`, `pack:nn`)

Wired the way Spanish was, at an even more honest level. Each is installable (`status: 'installable'`, `level: 'experimental'`):
the runtime bundles its analyser (`adapter-de@9`, `adapter-hi@6`, `adapter-th@5`, `adapter-nb@2`, `adapter-nn@2`), `installPack` checks its kaikki
dictionary on disk (German, Hindi, Thai; Norwegian has none) and runs its 14 validation cases through the real analyser, and the extension parser
reads selections with it. What is thin, and
said in each manifest's provenance (`Thin: ...`) and on every card (`limits`):

- lemmatisation is seed-only (German about 2,900 entries, Hindi about 1,500 lemmas, Thai a hand lexicon of about 600 entries); other words get a marked guess or nothing;
- nothing has been reviewed by a native speaker; the validation cases are single words in short sentences, written as the analyser really reads them;
- the orientation (`tutorial/<lang>`) is minimal: how to select a word, what the card shows, one practice lookup, the script (or the two Norwegian standards), a few first words and an honesty step; it is AI-drafted and unreviewed, and its practice words were checked only by machine;
- the grammar tables explain only a few features and constructions; the pack does not declare production checking (so nothing the learner writes is checked), although the adapters have limited rules for it;
- no recordings; GoListen holds one two-word demonstration clip for German and nothing for Hindi, Thai or Norwegian; remote voices need the learner's consent and key;
- Thai word segmentation is limited (ICU plus a short compound list) and unmeasured on prose; Hindi and Thai have different scripts, and the parser says so when a selection is in another script.

`packCapabilities('de')` (and the other languages) reports all of this as data; the matrix, the per-language tables and the measured tests
are in `docs/ecosystem/reader/LANGUAGE-PACK-CAPABILITIES.md`. Language resolution (which pack reads a selection) is in
`docs/ecosystem/reader/LANGUAGE-RESOLUTION.md`.
