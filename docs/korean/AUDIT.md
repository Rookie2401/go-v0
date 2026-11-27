# Korean pack: audit of the architecture and of the sources

2026-11-25, against master `7f08e85e`. The plan built from this audit is `PLAN.md`.

## 1. What a language is, in this repository

GoLearn is a Manifest V3 browser extension (`packages/golearn-extension`). A language is not an application: it is

- an **analyser** `src/adapters/<lang>.ts` implementing `LanguageAdapter` (`src/core/adapters.ts`): tokenise, segment
  sentences, analyse tokens into readings (`AnalysisCandidate`: lemma, part of speech, features, parts, notes,
  confidence), detect phrases and patterns, shallow syntax, pronunciation notes;
- a **pack manifest** `packages/language-packs/src/packs/<lang>.ts` (name, script, varieties, the grammar copy a card
  shows for each feature, validation sentences, what is thin) and a tutorial;
- **data**: a compiled core inside the analyser, optional sharded indexes under `public/lexicon/<lang>/`, and a
  dictionary under `public/dict/<lang>/` built by the shared pipeline (`src/dict`);
- **registrations** in the shared lists below.

The same analyser runs in every host: the extension's content script (as its own chunk, `dist/analysers/<lang>.js`),
the extension's worker (the device's own Repository), GoReview on the web and in the phone shell (`packFacts.ts`), and
the Repository service on Render (`packages/repository-linguistics`), a 512 MB instance that sat at about 121 MB at
rest on 2026-11-17.

A learner's knowledge is keyed by unit ids the analyser's readings produce (`lemma:<lang>:<lemma>:<POS>`,
`form:<lang>:<form>`, `morph:<lang>:<POS>:<features>`, `syntax:<lang>:<pattern>`): `packages/repository-contract`.
GoReview's cards are `card:<dimension>:<unitId>` folded from events; one FSRS for every language. Nothing in the
Repository, in sync or in GoReview is language-specific, so a new language needs no change there.

### Where a language is registered (from the diff that landed Russian and French, `3d92b264..b5aa3630`)

`src/adapters/index.ts`, `src/core/{model,config}.ts`, `src/dict/{map,forms,full-format,build-full,adapter-normalize-node}.ts`,
`src/course/{bibleAccess,curriculumPolicy}.ts`, `src/golisten/{azureProvider,fixtureProvider}.ts`,
`src/gotell/{concepts,provider}.ts` and `src/gotell/productive/{goals,practice}.ts`, `src/ingest/{format,quality}.ts`,
`src/stage0/lang/{index,types}.ts`;
`packages/language-packs/src/{builtins,catalogue,evidence,index,registry}.ts`, `packs/<lang>.ts`, `tutorial/{<lang>,index}.ts`,
`alphabet-sprint/profiles/{<lang>,index}.ts`, `alphabet-sprint/words/<lang>.ts`;
`packages/golearn-extension/src/analysers/{<lang>,loaders,urlLoader}.ts`, `src/active/pageLanguages.ts`,
`src/content/{active,voiceTags}.ts`, `src/language/resolve.ts`, `src/lexicon/prepare.ts`, `src/parser/{index,registry}.ts`,
`src/protocol.ts`, `src/background/speech.ts`, `vite.config.ts`, `app/screens/audio.ts`;
`packages/golisten/src/{deviceTags,registry}.ts`, `providers/device.ts`;
`packages/goreview/app/{alphabetDeck,alphabetLetters,leanBuiltins,packFacts,vite.config}.ts`;
`packages/repository-linguistics/src/packs.ts`; `THIRD-PARTY-NOTICES.md`; `package.json` scripts;
and about forty tests that pin those lists (`test/language-packs`, `test/reader-languages`, `test/extension/bundle.test.ts`,
`test/loading/goreview.startup.*`, `test/audit/*`, `test/golisten`, `test/gotell`, `test/ingest`, `test/multilang`, `test/ui`).

## 2. Why Korean is not a form index

Russian, Greek and Hebrew file every written form the source lists under its lemma. Korean writes a stem and then a
chain of particles or endings; the forms of one word are not a finite list. The Wiktionary conjugation table of a
verb has about 60 to 110 cells and covers a small part of what a page shows (먹었겠습니다만, 먹으셨다고요, 학교에서부터는).
So the Korean lexicon holds STEMS and the analyser generates and matches the chain by rule. The dictionary's tables
are used for two things only: the conjugation class of each verb (read off its own infinitive and sequential forms),
and a check of the rule engine against every table (`npm run ko:conj-check`).

## 3. Kiwi: evaluated, not embedded

The brief asks for Kiwi (https://github.com/bab2min/Kiwi) to be investigated as the analyser. Facts gathered on
2026-11-25 by reading the repository, its releases and the npm registry; nothing was downloaded or run.

| Question | Finding |
|---|---|
| Version | Kiwi v0.25.0 (2026-11-20); npm `kiwi-nlp` 0.25.0 (same day) |
| Licence | Apache-2.0 from v0.24.0 (2026-09-13) on; LGPL for v0.23.2 and earlier. The README says the trained model files carry the same licence. |
| Model | One archive, `kiwi_model_v0.25.0_base.tgz`, 87.97 MB. Trained on the Sejong corpus and the Modu corpus (모두의 말뭉치); the corpora are not distributed. Whether those corpora's own terms reach the model was not verified. |
| WebAssembly | `kiwi-wasm.wasm` 5.64 MB in the npm package; the page must host the wasm and every model file and load them into an in-memory file system; a worker is recommended. An MV3 extension would need `'wasm-unsafe-eval'` in its content-security policy (Chrome's rule; Kiwi's documents say nothing about extensions). Threads, SIMD and service-worker behaviour: not documented. |
| Memory and speed | README, native build with AVX2: load 0.98 s, 278 MB resident, about 1.9 ms a line. No figures for the WebAssembly build. With typo correction: 9.4 s and 694 MB. |
| Output | Morphemes with Sejong tags, position and length in the input, a score, a homograph number; N-best. No lemma field: the dictionary form must be rebuilt from stem and tag. No glosses, no Hanja, no grammar explanation. |

Why it is not the product's analyser:

1. **Size.** 88 MB of model against bundle ceilings measured in kilobytes (`test/extension/bundle.test.ts`: the
   worker about 1.2 MB, the content script under 600 KB). Every other language's on-demand data is tens of
   megabytes at most and sharded, so a reader fetches a few hundred kilobytes for a page.
2. **Memory.** About 278 MB resident for the native build. The Repository service runs the same analysers in 512 MB
   and was out of memory ten times on one day in November before it was slimmed to 121 MB. A phone's web view and a
   browser tab's worker are no roomier.
3. **One contract.** Every host calls the analyser synchronously through `LanguageAdapter`. Kiwi is asynchronous,
   lives in a worker and cannot run in the service's Node process without a second, native build of it.
4. **What a card needs is not what Kiwi returns.** The card explains a form to a learner: which particle family,
   which speech level, which irregular class and why. That is the hand-written grammar tables either way; Kiwi would
   replace only the segmentation step.
5. **A changed extension policy for one language** (`wasm-unsafe-eval`) widens what the whole extension may run.

What Kiwi could still be used for: an OFFLINE reference to measure this analyser's segmentation on text no treebank
covers. That needs a 94 MB download and was not done; the human-checked UD Korean-Kaist treebank is the reference used.

## 4. Dictionary source

| Source | Licence | Access | Use |
|---|---|---|---|
| Wiktionary Korean, via kaikki.org (extract of 2026-10-30 from the dump of 2026-10-01) | CC BY-SA 4.0 (Wiktionary's; the kaikki page itself states none and asks for a citation) | one public file, 207,649,961 bytes, 64,457 entries | **the lexical source of this release**: headwords, class, English glosses, Hanja, standard pronunciation as a Hangul respelling, every verb's conjugation table |
| Korean Basic Dictionary (한국어기초사전, krdict; National Institute of Korean Language) | Creative Commons Attribution-ShareAlike (the site names no version; its sister 우리말샘 states 2.0 KR) | the Open API needs a personal key (50,000 calls a day); the full download is behind a popup and, as far as could be seen, a login | **preferred by the brief, not used yet** |
| 우리말샘, 표준국어대사전 | CC BY-SA 2.0 KR (stated on 우리말샘; not confirmed on the standard dictionary's own site) | API with a key; no English glosses seen | not used |

The owner chose on 2026-11-25 to build on Wiktionary now and leave a slot for krdict: the build cannot create an
account or hold a key (the standing rule that no secret is handled), and Wiktionary is the one source every other
pack already uses, attributes and ships. What that costs, said plainly: about 4,000 verbs and 1,450 adjectives with
tables and 41,000 nouns, against krdict's roughly 50,000 graded headwords with official homonym numbers and learner
grades. `scripts/ko-build-lexicon.mts` reads one source through one function; a krdict export the owner supplies
becomes a second reader beside it, and its official homonym numbers would then replace the etymology numbers through
Repository aliases.

The homonym number of this release is the entry's etymology number on its Wiktionary page. It is the source's own
number, but an editor can reorder a page, so `docs/korean/homonyms.json` pins every numbered headword and a rebuild
refuses to finish when a number has come to mean another word.

## 5. Measurement data

| Data | Licence | Use |
|---|---|---|
| UD Korean-Kaist (27,363 sentences, 350,090 tokens; lemma and tag columns converted from the hand-annotated KAIST corpus) | CC BY-SA 4.0 | TRAIN: counts only (which stems are common: the compiled core and the order of readings). DEV: tuning. TEST: the reported figure, run once. |
| UD Korean-GSD | CC BY-SA 4.0 for the annotation; its lemmas are automatic (KOMA) | not used: an automatic lemma is not a reference |
| UD Korean-PUD | CC BY-SA 3.0; lemma column mostly empty | not used |

Downloaded on 2026-11-25 with the owner's permission into `data/raw/ud-ko/` and `data/raw/kaikki-ko/` (git-ignored).

## 6. Audio

Korean uses the existing GoListen path. Azure lists ko-KR neural voices (SunHi, InJoon, BongJin, GookMin, Hyunsu,
JiMin, SeoHyeon, SoonBok, YuJin); a device's own ko-KR voice is used where the browser offers one, which was not
verified per platform.

## 7. What was not verified here

The krdict download's login requirement, size and field list; the standard dictionary's licence on its own site;
Kiwi's WebAssembly memory and speed; whether Kiwi's offsets count UTF-16 units; the Web Speech ko-KR voices by platform.
