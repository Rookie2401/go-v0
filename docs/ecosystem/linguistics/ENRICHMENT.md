# Progressive enrichment architecture (Linguistic Engine V2, Stage 6)

How a clicked word becomes a card in layers, so that the immediate card never waits for the slow parts, and every later
section says where its content came from and how far it is validated.

## The three levels

| level | when | what | where it runs | source of truth |
|---|---|---|---|---|
| 1 — immediate | synchronously on click | selected form, lemma, part of speech, morphology line, features, constructions, phrases, confidence, the sentence-level role or dependency relation, alternatives, honest notes | content script (`packages/golearn-extension/src/parser/index.ts` → `CardModel`) | the loaded analyser (`src/adapters/<lang>.ts`), its word list and rules; `adapter.syntax` when it has rules |
| 1b — gloss | a few ms later, never blocks | the dictionary senses for the lemma (or the written form; a form-only entry is followed to its headword with `via`) | worker (`src/background/gloss.ts` → pack runtime `gloss()` over the schema-3 shards) | Wiktionary via kaikki.org (CC BY-SA 4.0), the course word list as fallback |
| 2 — deeper sections | on the same click, after the gloss, never blocks | All forms (paradigm), Meanings (every sense with examples), Origin (etymology chain), Word structure (parts, derivation, family), Sound (IPA, hyphenation, recordings, the analyser's notes) | worker fetches the `full-1` record (`MSG.entry` → `gloss.entryFor` → `runtime.entry()`); the page builds the sections (`src/content/enrich.ts`) | the full record (`public/dict/<lang>/full/`, see LEXICAL-SCHEMA.md) merged with the analyser's generation (`adapter.paradigm`, `adapter.featuresFromTableTags`, `adapter.cellsFor`) |

The learner-model consultation (`MSG.profile` / `MSG.activeProfile`) and the pack explanations (`MSG.explain`) are separate
asynchronous arrivals on the same card and are unchanged by V2.

## Field states on the card

Every Level 2 field carries a status that the card prints as a mark and names in a legend:

| status | meaning | mark |
|---|---|---|
| `verified` | the analyser's rules and the dictionary table agree on this cell | ✓ |
| `supported` / `supported-by-source` | one authoritative source states it (the dictionary table; the dictionary's etymology text); the rules do not contradict | ◌ |
| `generated` / `provisional` | only the analyser's rules state it; no second source | ~ |
| `conflicted` | the rules and the dictionary disagree (both forms are shown), or the source itself calls an origin uncertain | ‼ |
| `unknown` | nothing states it; the section says "unavailable" and why | — |

"Verified" never means a person checked it: the card says "Not reviewed by a person" wherever rules produced content, and
the Repository's field states (REPOSITORY-STATES.md) reserve a reviewer-verified state for a named reviewer's correction.

## Honest empty states

- No dictionary entry: the Meanings row says `No meaning in the word list; <reason>` with the worker's reason (`not-found`,
  `no-pack`, `no-location`, `offline`), never a guessed gloss.
- No paradigm: "No paradigm: the analyser has no rules for this word and the dictionary has no table for it."
- Uninflecting language (Thai): the All forms section lists the constructions to know instead, and the cuts of the selection
  into words (`adapter.segmentations`), with the pieces the word list does not hold marked `?`.
- No etymology: "No documented origin in the dictionary." An etymology is never generated.
- No IPA: the analyser's own letter/stress/tone notes are shown as `provisional`; a recording is only listed when it is a
  Wikimedia Commons file named by the dictionary, labelled as a volunteer recording that nobody reviewed for the learner's
  variety.

## Where the pieces live

- Worker: `src/background/gloss.ts` (`locate` resolves the dictionary location: configured address → the extension's own
  `app/dict` copy → the hosted fallback from `app/config.json`; `glossFor`, `entryFor` with a shard cache), `core.ts` routes
  `MSG.gloss` / `MSG.entry`.
- Page: `src/content/controller.ts` (the lookup pipeline: parse → profile → gloss → entry → enrichment), `src/content/enrich.ts`
  (`pickRecord`, `buildParadigm` + `alignTable`, `selectedCellKeys`, `segmentationsOf`, `etymologyOf`, `pronunciationOf`,
  `relationsOf`, `sensesOf`, `structureOf`), `src/popup/card.ts` (the layers; `fillForms` renders layout tables with the
  selected cell marked; `fillSyntax` the relation with basis, alternatives and dependents), `src/popup/view.ts`
  (`EnrichmentView`), `src/store/index.ts` (`ExpandedLayer`, `LAYER_ASSISTANCE`: which assistance kind opening a layer records).
- Contracts: `src/core/paradigm.ts`, `src/core/syntax.ts`, `src/core/adapters.ts` (the optional methods `paradigm`,
  `featuresFromTableTags`, `cellsFor`, `segmentations`, `syntax`).
- Tests: `test/extension/enrich.test.ts`, `enrich.selection.test.ts`, `card.forms.test.ts`, `syntax.card.test.ts`,
  `entry.integration.test.ts` (the real worker over the real shards served from disk), `layers.test.ts`, `card.test.ts`.

## Performance

Measured on the probe corpus (`scripts/probe-linguistic-coverage.mts`, 200 selections per language, 2026-10-10): parse
0.3–3 ms per selection, dictionary 0.4–1.3 ms, full record 0.6–1.4 ms from a warm shard cache; a cold shard is one fetch of
44–119 kB (gzip ≈ a tenth). The card is shown before any fetch; nothing in Level 2 is awaited by Level 1.

## What is deliberately not done

- No remote AI call per clicked word; no machine translation of the sentence.
- No caching of unsupported guesses: only the dictionary's records and the Repository's validated analyses are stored.
- The worker still carries only the Albanian analyser; the other analysers load on demand in the page (`analysers/*.js`).
