# Multi-language extensibility — Spanish through the shared interfaces

Status: 2026-10-09. Spanish (`pack:es`, adapter `adapter-es@12`) is the second language to pass through the same pack manifest, installer, runtime, parser registry, Repository resolver, GoListen registry and GoTell configuration as Albanian.
**Spanish is not production-ready.** Everything linguistic in it is machine-drafted (`reviewStatus: 'machine-drafted'`) and no native speaker has checked any of it; the pack, its header (`packages/language-packs/src/packs/es.ts`) and `packages/language-packs/README.md` say the same.

Command (run 2026-10-09, 10:09): `npx vitest run test/multilang --reporter=verbose` — 4 files, **55 tests, all passed**, 1.4 s. No browser, no installed extension, no audio.

## 1. What `test/multilang` proves, by file

| file (tests) | proves | titles (abridged) |
|---|---|---|
| `pack-es.test.ts` (19) | pack loading | the manifest validates, is installable and is the one in the registry; names the real adapter, version, script and only supported capabilities; "does not claim production readiness: machine-drafted everywhere, and the thin parts are stated"; declares the dictionary exactly as `public/dict/es/manifest.json`; declares device voices and the registry's remote voices; 17 validation cases run on the real adapter ("every case passes on adapter-es and says what the adapter really returns"; a wrong expectation fails); the pack's status rule and the Repository resolver agree; `installPack` over the real dictionary files installs, refuses honestly (no analyser supplied, the Albanian dictionary, a wrong entry count, offline) and installs side by side with Albanian; gloss "libro" = book with CC BY-SA attribution; the tutorial is flagged unreviewed and every word is read by the real adapter |
| `resolver-learners.test.ts` (10) | identity, independent learner states, no collisions, morphology, review candidates | "libros" resolves to `lemma:es:libro:NOUN` with Number=Plur and a `morph:es:NOUN` construction; every unit and relation is Spanish (no `sq` id, pack or variety); "librin" is unchanged in Albanian; the same surface in two languages gives two disjoint unit sets; two learners on one store (one sq, one es): rows never collide and candidates stay in their language; one learner enrolled in both keeps separate rows and candidates; a Spanish correction invalidates only Spanish analyses; an unknown Spanish word stays one provisional form unit |
| `extension.test.ts` (11) | parser choice by language, script rendering, controller | `parseSelection` picks the adapter by `languageId`; a Spanish sentence yields a Spanish card (lemma, POS, morphology line, unit ids, pronunciation notes); a Spanish verb in context shows a Spanish pattern and Spanish limits; Albanian unchanged; an unlisted language throws rather than use another adapter; accents, ñ and inverted marks survive NFC, a decomposed ñ is composed; the controller with a Spanish enrolment records a valid Spanish event; the content script's analyser list is built from the parser registry |
| `golisten-gotell.test.ts` (15) | GoListen reporting, GoTell configuration | Spanish registry is data (device template, three Azure voices, no recordings), synthetic/remote/unverified/never for assessment, ids do not collide with Albanian's, agrees with the pack; with no voice installed nothing can speak and the gaps are listed; device voices must be `es-HN`, `es-419`, `es-MX` or `es-ES` (bare `es`, other varieties, English or Albanian voices never substituted); a non-local voice needs consent; remote voices `needs-consent` first, no text sent while listing; GoTell: the pack registry says Spanish is installable with its tutorial and team, guidance reads the Spanish pack's own grammar notes, prompts for a Honduras learner are the neutral ones and none is Albanian, validation sentences are attested as Spanish |

## 2. Size growth

`content.js` grew as the Spanish analyser entered the parser registry (`PARSER_LANGUAGES`):

| build | `content.js` | source |
|---|---|---|
| prototype, Albanian only (2026-10-08) | 250,518 B | `EXTENSION-PROTOTYPE-TESTS.md` §2.1 |
| GoLearn, Albanian only (2026-10-08 20:2x) | 290,447 B | `GOLEARN-TEST-REPORT.md` §4 |
| final (built 2026-10-09 09:42; file on disk unchanged) | 464,384 B (about 453.5 KB, 153.5 KB gzip) | `audit/READER-COMPATIBILITY-RETEST.md`, `audit/PERFORMANCE.md` PF-05; `ls -l` today |

The +173,937 B between the last two builds is not attributable to Spanish alone (security and card changes were made in between); the Spanish share was not measured. For scale, unminified source on disk: `src/adapters/spanish` 264,120 B, `src/adapters/albanian` 397,805 B.
`background.js` went 303,152 B to 496,425 B and `app.js` 392,551 B to 586,513 B over the same period (same caveat). `PF-05` notes the per-page parse cost in a browser is unmeasured.
The Spanish dictionary (`public/dict/es`, 808,278 entries, `kaikki-es@2026-09-28`) is on disk but is **not** in any build: `packages/golearn-extension/dist/app/dict` and `packages/goreview/app/dist/dict` contain only `sq`. Whether a built extension can install `pack:es` end to end was not verified.

## 3. The thin parts (verified in source unless marked)

| part | what is thin |
|---|---|
| lemmatization | seed-only: about 1,500 hand-listed lemmas plus closed classes; other words get a rule reading marked inferred or none; every rule reading stays `provisional` (`es.ts` header) |
| morphology | rule-based, never measured on running prose; ambiguity kept, not resolved; no Spanish accuracy measurement exists in the ecosystem audit (`audit/LINGUISTIC-ACCURACY.md` covers Albanian only) |
| checker | GoTell has no Spanish checker coverage: `GOTELL-ARCHITECTURE.md` §5 "Spanish loads but has no checker coverage worth the name"; analysis runs only where the pack supplies one |
| voseo | the adapter detects it as a sentence-level pattern; the pack does not teach it; `tenés` is read as an ordinary second person singular (`es.ts` validation note) |
| sentence segmentation | the shared web adapter in the content script is constructed with the Albanian adapter's segmenter for every language: `packages/golearn-extension/src/content/index.ts` line 50, `segmentSentences: (t) => sqAdapter.segmentSentences(t)`; separately, the pack header says the Spanish adapter's own sentence splitting "knows the usual abbreviations but not all of them" |
| GoReview facts | `packages/goreview/src/facts/provider.ts` lines 150–151 bind the tutorial and construction patterns to `sq` only (`lang === 'sq' ? SQ_TUTORIAL : null`); no test builds a Spanish exercise |
| card `lang` | the brief names a card `lang` problem; I found only that the card's device-voice matcher special-cases `sq` (`sq|als|alb`, `popup/card.ts` line 145) and the controller defaults to `'sq'` when the worker gives no language (`content/controller.ts` lines 186–187). Not verified further |
| GoListen | no Spanish phonetic rule set; the extension and GoReview accept different device-tag sets (O4) |
| validation | 17 cases, single words in short present/past sentences; the tutorial is an orientation (writing system, ten words, two patterns, five-sentence passage, four concept cards), not a course |
| pack install | `installPack` needs the Spanish adapter passed in; the pack runtime bundles only the Albanian one |

## 4. What this does and does not show

It shows that a second language can be added as data plus an adapter without a second architecture: no unit id, event, projection row or candidate crossed between languages in the tests above, and the Albanian paths were unchanged.
It does **not** show: GoReview or GoTell working for Spanish end to end (no such test exists); the Honduran target being served; any accuracy figure; any audio; an installed extension reading Spanish on a real page; or that the other five packs (`de`, `hi`, `th`, `nb`, `nn`) are ready — they are planned manifests that say so, and their analysers are allowed by the conformance suite but unreached by any entry.
