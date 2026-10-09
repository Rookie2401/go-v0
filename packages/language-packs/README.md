# @go/language-packs

The reusable language-pack framework of GoLearn, and the Albanian reference pack. A pack is a declarative **manifest**
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
src/packs/{de,hi,th,nb,nn}.ts + planned.ts   planned manifests (never installable)
src/tutorial/         TutorialStep types; sq.ts is the Albanian orientation as data, es.ts a minimal Spanish one
src/runtime.ts        createPackRuntime, installPack, verifyInstalled
src/registry.ts       PACKS, packFor, TEAMS
```

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
| `tutorial` | `ref`, `estimatedMinutes`, `skippable: true` (always) |
| `rights` | `provenance` statements, `licences`, `reviewStatus` (never higher than the hand lexicon's) |
| `validation` | real selections: `{ id, surface, sentence?, expect: { lemma?, pos?, features?, status?, readings? } }` |
| `status` | `installable` or `planned` |

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
5. Set `status: 'installable'`, register it in `src/registry.ts`, and add the language to a team in `TEAMS`.

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

The `es`, `de`, `hi`, `th`, `nb` and `nn` manifests are **planned**: they name the existing adapter (version constants
checked against the adapter by `test/language-packs/registry.test.ts`) and say plainly that grammar tables beyond a
few entries, validation cases, tutorial, pronunciation notes and review do not exist yet. Norway is two packs, and the
`norway` team requires the learner to choose a written standard; neither is a default and neither is credited for the other.

## Teams

`TEAMS` lists six teams (albania, honduras, germany, india, thailand, norway). A team lists the languages its members
may study; it is not a language and no identifier joins a team to a learner's language. A learner may study several.

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
- `installPack` needs the Spanish adapter passed as `deps.adapter` (the runtime bundles only the Albanian one).
