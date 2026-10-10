# Linguistic coverage audit (GoLearn Linguistic Engine V2, Stage 1)

Status: 2026-10-10. Baseline figures: `baseline-2026-10-10.json` (probe `scripts/probe-linguistic-coverage.mts`). This document
answers the brief's Stage 1 question: why the card's parsing "leaves much to be desired", field by field, with evidence, before
anything is downloaded or rewritten. Companion documents in this folder: `SOURCE-INVENTORY.md`, `LEXICAL-SCHEMA.md` (Stage 2).

## 1. What the baseline measures

The probe takes natural sentences from `data/corpus/<lang>` (the owner's course drafts and verified Scripture slices; used for
measurement only), selects 200 word tokens per language in context, runs the real parser the extension uses (`parseSelection`
with the real analysers) and the real dictionary lookup (`createPackRuntime` over the schema-3 shards in `public/dict`), and
counts **availability** of each field. It does not measure correctness: that needs checked gold sets (§6). The corpus is the
text the word lists were drafted against, so lemma and gloss availability is an upper bound for arbitrary text.

| field | sq | es | de | hi | th |
|---|---|---|---|---|---|
| selections (sentences) | 200 (166) | 200 (199) | 200 (197) | 200 (193) | 200 (161) |
| definition available (dictionary or word list) | 98% | 100% | 100% | 100% | 95% |
| dictionary senses found | 89.5% | 97.5% | 88.5% | 92.5% | 95% |
| word-list gloss | 93.5% | 100% | 100% | 100% | 95% |
| lemma given | 100% | 100% | 100% | 100% | 95% |
| lemma from the word list / from a rule | 69 / 31% | 80 / 20% | 51 / 49% | 97.5 / 2.5% | 93 / 2% |
| part of speech | 100% | 100% | 100% | 100% | 95% |
| any morphological feature | 81.5% | 69.5% | 67% | 78.5% | 0% |
| morphology described in words | 81.5% | 65% | 67% | 80.5% | 0% |
| construction / pattern noted | 89.5% | 71% | 74% | 89.5% | 21% |
| syntactic role given | 19.5% | 0% | 8% | 0% | 35% |
| syntax notes | 10.5% | 2% | 3.5% | 3% | 0% |
| alternative readings kept | 37% | 6% | 34% | 44% | 7% |
| pronunciation note (adapter) | 57% | 100% | 38% | 58.5% | 100% |
| **full paradigm available** | **0%** | **0%** | **0%** | **0%** | n/a |
| **sourced etymology** | **0%** | **0%** | **0%** | **0%** | **0%** |
| **IPA pronunciation on the card** | **0%** | **0%** | **0%** | **0%** | **0%** |
| parse ms / selection | 0.49 | 0.96 | 1.64 | 1.12 | 0.39 |
| dictionary ms / selection | 2.14 | 1.54 | 1.62 | 0.66 | 0.52 |

## 2. Why definitions are missing in the browser (delivery, not data)

Against the shards on disk, a definition is available for 95–100% of selections. In the installed extension the card said
"No dictionary location is configured" or showed no meaning because of two integration defects in
`packages/golearn-extension/src/background/gloss.ts` and `app/config.json`:

1. With no account, no service is configured, so the worker's dictionary location (`svc.assetBase ?? svc.baseUrl`) is
   undefined and **no language has a dictionary at all**.
2. With an account, the setup app wrote `assetBaseUrl: "./"`, the extension's own `app/` folder, which ships **Albanian only**
   (`dist/app/dict/sq`). German, Spanish, Hindi and Thai meanings were never fetched, although their dictionaries are built
   and hosted at `https://rookie2401.github.io/go-v0/dict/<lang>/` (all five answer 200).

Classification: *resource present, not reachable*. Repair (Stage 1, in progress): per-language location resolution in the
worker and in the setup app's download step: the configured address, else the extension's own copy, else the hosted copy
named in `app/config.json`; the Diagnostics screen says which one answers.

## 3. Why the grammar is shallow (engine and card)

From the read-only audit of `src/core/adapters.ts`, `src/adapters/*`, the parser and the card (2026-10-10):

- **No generation reaches the learner.** Generation exists in four adapters (`conjugateSpanish`; `declineNoun`,
  `declineAdjective`, `conjugateGerman`; Hindi `inflectNoun/Adj/Verb`; Albanian `formsOf`/`sqGeneratedForms`) but only bench
  scripts call it. The adapter contract has no paradigm method, so the parser and the card never see a paradigm. Classification:
  *computed but discarded*.
- **Pronunciation is computed and thrown away.** Thai IPA, romanisation and per-syllable tone, Hindi transliteration and schwa
  notes, Norwegian IPA and respelling exist in `pronunciation()` and `decode()`; the parser keeps only `notes`. Classification:
  *computed but discarded*.
- **The dictionary build drops what the source has.** kaikki/Wiktextract carries declension and conjugation tables (Albanian
  nouns; Spanish verbs with 212 tagged forms each; German nouns 87% / verbs 53% / adjectives 59% with tables; Hindi nouns 91% /
  verbs 68%), IPA for most entries, etymology text with structured templates for 60–80% of entries, derived and related words,
  hyphenation and Wikimedia Commons audio. Schema 3 keeps senses, form-of relations and some pronunciation. Classification:
  *resource present, not indexed*. Stage 2 builds a parallel "full records" shard set (`LEXICAL-SCHEMA.md`).
- **No etymology anywhere.** Not in the adapters, the packs or the shards. Classification: *resource present (Wiktionary), not indexed*.
- **Syntax is roles and units, not relations.** `role` is a plain-words label ("linking article"), `unit` a head with pieces,
  constructions are pattern hits; there is no dependency structure. Spanish and Hindi give no role at all. Classification:
  *unsupported feature*.
- **Explanations are thin.** The packs explain 10 features for Albanian but 2 for German and Hindi and 1 for Thai, so the
  Morphology layer shows raw `Mood: Ind` for most languages. Classification: *UI shows the raw bundle; the explanation data is
  missing*.
- **Thai has no form row** and no morphological features by design (the language does not inflect), but the card does not show
  what Thai has instead: segmentation alternatives, tone, classifier and particle constructions.
- **Lexicons are small.** Word lists: sq 1,350 lexemes, es 1,812, de ~3,860, hi 2,972, th 1,692, nb ~1,790. On the owner's own
  course texts they cover 95–100% (circular); on held-out natural text (docs/albanian/STATUS.md, UD treebanks) Albanian
  first-reading POS is 57.7% (63.4% with the dictionary) and 15.6% of words get no reading. The dictionaries (sq 91k, es 808k,
  de 358k, hi 39k, th 20k entries) are the real lexical base; the word lists are the morphology seed.
- **What is measured as correct today:** Albanian on UD treebanks (above), Spanish on dictionary examples judged by the same
  dictionary (92.65% first reading), Norwegian on a blind 65-sentence holdout (nb 91.9% lemma+POS), German on an AI-judged
  Kafka round (13/21 sentences), Hindi nothing (189 gold drafts, 0 accepted), Thai segmentation on Wiktionary examples (F1
  90.3%). No native-speaker review anywhere.

## 4. Information lost between layers

| produced by the adapter | kept by the parser | shown on the card |
|---|---|---|
| lemma, pos, morph features, confidence, origin | yes | lemma, form line, raw feature table |
| role (label), unit (head + pieces), parts | role; unit as a text note | "role: not available" for es/hi; unit as one line |
| syllables (hi/th decode), IPA, transliteration, tone | no | no |
| register tags (hi), varieties, orthography period | varieties/orthography as notes; register dropped | notes only |
| notes: ergative, derivedFrom, compound components, class, governs, stem | no | no |
| production checks, relate, family | no | no (GoTell only) |
| generated paradigms | no | no |
| dictionary: senses | up to 6 | up to 3 |
| dictionary: IPA, etymology number | IPA kept in schema 2/3 for lemma entries; not requested by the worker | no |

## 5. Resources on hand (see SOURCE-INVENTORY.md)

kaikki/Wiktextract dumps for sq (gz), es, de, hi, th under `data/dictionaries/` (CC BY-SA 4.0); built schema-3 shards for the
five; none for nb/nn (the owner has the download list in docs/norway/SPEC.md §10). UD treebanks and uniparser-albanian under
`data/research/` (research only, not shipped). PyThaiNLP in a local venv (comparison only). No UniMorph, no Stanza, no
Hindi WordNet on disk.

## 6. What a correctness measure needs (Stage 8)

Per language: 200 contextual selections as a reproducible coverage benchmark (this probe, kept), 50 checked difficult
examples (authored, AI-judged until a person checks them, and labelled so), an unseen set not used for tuning (the verified
Scripture slices are the candidates: Luther 1912 for de, RV1909 for es, IRV 2019 for hi; sq and th have none verified), and
round-trip paradigm tests (observed form → analysis → generated form → compare, with Wiktionary tables as the oracle where
they exist). Metrics kept apart: definition availability, lemma rate, POS rate, feature rate, paradigm correctness, contextual
sense, syntactic relation accuracy, derivation coverage, sourced-etymology coverage, unsupported-claim rate, time to first
response, time to full analysis.

## 7. Stages and status

| stage | content | status |
|---|---|---|
| 1 | this audit; baseline; dictionary delivery repair | audit done; repair in progress |
| 2 | full lexical records from kaikki (tables, etymology, IPA, audio, relations), `entry()` at Level 2 | in progress |
| 3 | paradigm layer: adapter generation cross-checked against Wiktionary tables; Albanian nouns and Spanish verbs first | planned |
| 4 | contextual syntax: shallow dependency relations with explanations; alternatives kept | planned |
| 5 | etymology and derivation layer with provenance and status; never generated | planned |
| 6 | card sections (Grammar, Forms, Syntax, Meaning, Word structure, Etymology, Pronunciation) with field states | planned |
| 7 | Repository field-level validation; GoReview eligibility | planned |
| 8 | gold sets, unseen evaluation, end-to-end certification | planned |
