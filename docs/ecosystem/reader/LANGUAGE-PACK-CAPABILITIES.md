# Language-pack capabilities

Status: 2026-10-09 (Prompt 2, language lane). Code: `packages/language-packs/src/capabilities.ts` (the report) and
`packages/golearn-extension/src/language/capabilities.ts` (the reader's view). Tests: `test/language-packs/capabilities.test.ts`,
`test/reader-languages/{sq,de,es,th,hi}.test.ts`, `experimental-packs.test.ts`, `reader-support.test.ts`.

`packCapabilities(languageId)` returns what a pack **really** supports. Nothing in it is hand-asserted: a feature is `supported`
only when the pack's manifest declares it **and** the analyser the runtime bundles does not say `none` for it; script-handling
claims are probes run on the real analyser every time the report is built (a claim that stops being true shows `works: false`);
audio comes from GoListen's voice registry; review status and level come from the manifest. A test compares every report with
its manifest and its adapter and fails if a report claims what the adapter lacks.

## Levels

| level | meaning | packs |
|---|---|---|
| `installable` | analyser, dictionary, validation cases and an orientation tutorial exist | Albanian; Spanish (at a minimal level) |
| `experimental` | wired and installable, but seed-only, unreviewed, validation cases only, **no orientation tutorial**; the setup page says "experimental, seed-only lemmatisation, unreviewed" | German, Hindi, Thai |
| `planned` | described honestly, never installable, no analyser bundled | Norwegian Bokmål (nb), Norwegian Nynorsk (nn) |

An experimental pack has manifest `status: 'installable'` (the installer, the worker's `packAvailable` and the parser accept it)
and `level: 'experimental'`. `levelOf(manifest)` gives the level (absent = the one the status implies); `LEVEL_LABEL` has the
words. A manifest that says `level: 'experimental'` while reviewed, or `planned` while installable, is refused by `validateManifest`.

**Every pack is `machine-drafted`.** No native speaker has checked any word list, rule, grammar text or tutorial in any pack.

## The matrix

| capability | sq | es | de | hi | th | nb / nn |
|---|---|---|---|---|---|---|
| level | installable | installable | experimental | experimental | experimental | planned |
| analyser | adapter-sq@9 | adapter-es@12 | adapter-de@9 | adapter-hi@6 | adapter-th@5 | none (browser segmenter only) |
| tokenization | dependable | dependable | dependable | dependable | **limited** | limited (browser) |
| sentence segmentation | limited | limited | limited | limited | limited | limited (browser) |
| lemma | seed-only | seed-only | seed-only | seed-only | seed-only | no |
| morphology | limited | limited | limited | limited | **no** (no inflection) | no |
| phrases | limited | limited | limited | limited | seed-only | no |
| constructions | yes (8 explained) | yes (11) | yes (1) | yes (1) | yes (1) | no |
| syntax roles | **none** | none | none | none | none | none |
| production checker | **offered**, limited | **offered**, limited | not offered | not offered | not offered | no |
| script handling | digraphs, clitic clusters | attached clitics, accents / ¿¡ | compounds, separable verbs | grapheme clusters, danda | word segmentation, tone decoding | - |
| recordings | 0 | 0 | 1 (a two-word demonstration) | 0 | 0 | 0 |
| device-voice template | yes | yes | no | no | no | no |
| remote voices (consent + key) | 2 | 3 | 0 | 0 | 0 | 0 |
| per-letter pronunciation notes (GoListen) | yes | no | no | no | no | no |
| listening evidence | never | never | never | never | never | never |
| review status | machine-drafted | machine-drafted | machine-drafted | machine-drafted | machine-drafted | machine-drafted |
| validation cases | 14 | 17 | 14 | 14 | 14 | 0 |
| dictionary (kaikki, CC BY-SA 4.0) | 91,271 entries | 808,278 | 357,750 | 38,635 | 20,254 | none |

Notes on the matrix:

- **Syntax roles are none everywhere.** No analyser gives subject, object or modifier. A few function words carry a plain
  description of their own job as `role` (an Albanian linking article, a German relative pronoun or separable prefix, the Thai
  first-person pronoun); that is a word description, not a parse, and a test checks that no role is a grammatical relation.
- **The checker.** Albanian and Spanish declare production checking and the adapters call it `limited`; the Spanish adapter
  states four checks (article-noun agreement, de/a + el contraction, yo + conjugation, a number above one + singular noun),
  Albanian a wider set. German, Hindi and Thai have rules in their adapters (`adapterLevel: 'limited'`) but their packs do not
  declare production checking, so **nothing the learner writes is checked** and the report says so ("does not offer them").
  The two honest states are `offered` and `adapterLevel`; the earlier plan to call Spanish "thin" is expressed by its scope list,
  not by a different level, because the adapters themselves say `limited` for both.
- **Tokenization.** Thai is `limited`: ICU dictionary segmentation plus a short course compound list, not measured on prose.
  Norwegian reports the browser's segmenter because the runtime bundles no Norwegian analyser.
- **Morphology features.** `explained` lists the features the pack's grammar tables describe to the learner; `observed` lists what
  the analyser actually wrote on the top readings of the pack's own validation sentences. They differ and both are shown:
  German explains Case and Gender but writes Case, Definite, Gender, Mood, Number, Person, PronType, Tense and VerbForm; Hindi
  explains Gender and Case (now including the ergative) but also writes Aspect, Number, Person, Tense and VerbForm. Thai writes none.

## Per language

Size = the language's analyser bundled alone and minified (esbuild; the word lists dominate), then gzipped; the dictionary is the
size of `public/dict/<lang>/` on disk (it is fetched lazily by shard, never bundled).

### Albanian (`pack:sq`, installable)

| | |
|---|---|
| analyser | adapter-sq@9: seed-only lemmatisation (about 1,350 words plus the closed classes), limited morphology, 8 explained constructions, per-letter pronunciation notes |
| script handling | digraphs dh gj ll nj rr sh th xh zh and ë / ç stay inside tokens (probe passes); fused clitic pairs (ma, ia ...) are taken apart (probe passes) |
| checker / audio | offered, limited / no recordings, device template, 2 remote voices, per-letter notes |
| size | analyser 213,187 bytes (68,787 gzipped); dictionary 6.1 MB, 91,271 entries |
| review | machine-drafted |
| tests (`sq.test.ts`) | 31 tests: **28 assert what the analyser does, 3 are LIMITs** |

Asserted: definite nouns (librin, Libri, Fëmijët with their constructions), genitive and accusative, the linking article with
an adjective, the nine digraph words as whole tokens and whole-word lookups, a partial selection of a digraph (sh), a decomposed
ë, apostrophe forms, clitics ma / ia taken apart and e / i / u keeping their competing readings, sentence splitting.

LIMITs (`it.fails`, counted): `shqipe` (gjuha shqipe) has no reading; `Nëna` is not resolved to the singular by the singular
verb `pi`; `dhe` between clauses ties its conjunction and verb readings (0.6 each).

### Spanish (`pack:es`, installable at a minimal level)

| | |
|---|---|
| analyser | adapter-es@12: seed-only lemmatisation (about 1,500 lemmas), limited morphology (incl. voseo, vosotros, attached pronouns), about 190 phrase units, 23 constructions (11 explained by the pack) |
| script handling | attached clitics dámelo / dártelo / irme read as verb + pronouns (probe passes); accents, ñ and ¿ ¡ stay in the right tokens and está is not esta (probe passes) |
| checker / audio | offered, limited / no recordings, device template (es-HN, es-419, es-MX, es-ES), 3 remote voices, no GoListen per-letter notes |
| size | analyser 177,449 bytes (63,162 gzipped); dictionary 58 MB, 808,278 entries |
| review | machine-drafted |
| tests (`es.test.ts`) | 23 tests: **20 assert, 3 are LIMITs** |

Asserted: conjugated verbs back to their lemma (leen, hablé, llueve, coma, estaba), rule readings marked as rules and listed forms
as lexicon, voseo, the perfect and the estar + gerund constructions, está against esta, NFC composition of a decomposed accent,
ñ and inverted marks, clitics, idioms as phrase units (tener hambre seen from hambre; hace falta as the whole card), ir a /
tener que as construction phrases, sentence splitting with ¿ ? and Sr.

LIMITs: selecting "tiene mucha hambre" does not take the idiom (the entry skips `mucha`); "se echó a llorar" is in no phrase
list; `como` after `yo` keeps the conjunction as an alternative (0.4).

### German (`pack:de`, experimental)

| | |
|---|---|
| analyser | adapter-de@9: seed-only lemmatisation (about 2,900 entries plus the closed classes), limited morphology (case / gender / number cells, unions kept), compound parts reported, separable verbs put together when the prefix ends the clause and the verb is listed |
| script handling | compounds are one token with parts reported (probe passes); steht … auf is aufstehen (probe passes) |
| checker / audio | **not offered** (the adapter has limited rules the pack does not declare) / 1 demonstration recording ("Guten Tag!"), no device template, no remote voice |
| size | analyser 339,204 bytes (116,214 gzipped); dictionary 40.8 MB, 357,750 entries |
| review | machine-drafted; experimental |
| tests (`de.test.ts`) | 21 tests: **18 assert, 3 are LIMITs** |

Asserted: Wohnzimmer / Bahnhof as one token with named parts, an unlisted compound (Krankenhausrechnung) split but UNCONFIRMED,
without a gloss and not credited as a lemma; the stranded prefix `auf` read as part of aufstehen (lemma, gloss, construction,
unit note) while `auf dem Stuhl` stays the preposition; case from the article (dem dative, den accusative), nouns taking it,
the two-way preposition (in die / in der), unions kept (Buch, Haus Nom,Acc), the contraction im = in + dem, the sentence-bracket
perfect, ß and umlauts, ordinal dots and z. B. in sentence splitting.

LIMITs: the card still labels the stranded prefix ADP, which reads as "preposition" (the unit note is the only place that says
"separable prefix"); `Die Frau sieht die Tochter` leaves both nouns Nom,Acc (no parser); `Mädchen` before the singular verb
keeps a plural reading.

### Hindi (`pack:hi`, experimental)

| | |
|---|---|
| analyser | adapter-hi@6: seed-only lemmatisation (about 1,500 lemmas), limited rule-based morphology, compound verbs and postpositions as phrase units, pronunciation notes (schwa deletion) |
| script handling | no token starts or ends inside a grapheme cluster (probe passes); the danda ends a sentence (probe passes) |
| checker / audio | not offered / no audio registered |
| size | analyser 519,501 bytes (130,902 gzipped); dictionary 9.4 MB, 38,635 entries |
| review | machine-drafted; experimental |
| tests (`hi.test.ts`) | 25 tests: **22 assert, 3 are LIMITs** |

Asserted: conjuncts, nukta, chandrabindu and matras never split; precomposed U+095D and dha + nukta give the same card; half a
word reads the whole word; postpositions (में, ने with Case=Erg, oblique plural before ने, के साथ as a frame, the possessive
agreeing with the possessed); the compound verb खा लिया as a phrase unit and as one card when both words are selected;
the habitual present and the progressive; sentence splitting on danda, ? and !.

LIMITs: `पर` after मेज़ keeps a CONJ alternative (0.55 against 0.4); `गया` after चला keeps the city name beside the verb (0.6 /
0.55); `सुंदर` keeps six readings.

### Thai (`pack:th`, experimental)

| | |
|---|---|
| analyser | adapter-th@5: seed-only lemmatisation (a hand lexicon of about 600 entries), no inflection, listed phrase units (about 60), classifier and particle patterns, tone decoding from the spelling |
| script handling | a space-less run is cut into words with no space added (probe passes); syllable / tone decoding returns syllables (probe passes) |
| checker / audio | not offered / no audio registered |
| size | analyser 229,282 bytes (60,556 gzipped); dictionary 7.4 MB, 20,254 entries |
| review | machine-drafted; experimental |
| tests (`th.test.ts`) | 22 tests: **19 assert, 3 are LIMITs** |

Asserted: ฉันกินข้าวที่บ้านทุกวัน becomes seven words; every token is an exact slice; a listed compound (ตากลม) is one word; the
wrongly cut คนใน is reported with the "selection is part of the word" note; a Latin word inside Thai text is its own token with no
reading and confidence 0; the final particles ครับ / คะ and แล้ว with their constructions; newline and double-space sentence breaks;
a single space does not split; the "not in Thai script" and "page declares another language" notes.

LIMITs: in สองคนในห้อง the segmenter produces the listed word คนใน, so the classifier คน is never its own word, and the card for
a selected คน is the noun คนใน; two sentences separated only by a single space stay one unit.

### Norwegian (`pack:nb`, `pack:nn`, planned)

No analyser is bundled, nothing is installable, and the report claims nothing: no lemma, morphology, phrases, constructions,
checker, script handling or audio; the tokenizer is the browser's. The `norway` team requires an explicit choice of written
standard; the resolver treats `no` as undetermined between them and never as either.

## Test totals (this lane)

| file | tests | asserting | LIMIT (`it.fails`) |
|---|---|---|---|
| `test/reader-languages/sq.test.ts` | 31 | 28 | 3 |
| `test/reader-languages/es.test.ts` | 23 | 20 | 3 |
| `test/reader-languages/de.test.ts` | 21 | 18 | 3 |
| `test/reader-languages/th.test.ts` | 22 | 19 | 3 |
| `test/reader-languages/hi.test.ts` | 25 | 22 | 3 |
| language-specific total | 122 | 107 | **15** |
| `test/reader-languages/resolve.test.ts` | 59 | 59 | 0 |
| `test/language-packs/capabilities.test.ts` | 36 | 36 | 0 |
| `test/reader-languages/experimental-packs.test.ts` | 36 | 36 | 0 |
| `test/reader-languages/reader-support.test.ts` | 6 | 6 | 0 |

A LIMIT is a test written as `it.fails('LIMIT: ...')` with a `// LIMIT:` comment saying what is missing. It passes while the
analyser still has the limit and turns red the day the analyser improves, so a limit cannot be fixed (or forgotten) silently.

## Size in the extension

`npm run ext:build` before and after wiring German, Hindi and Thai into the parser and the pack runtime:

| bundle | before | after | growth |
|---|---|---|---|
| `dist/content.js` | 466,713 bytes | 1,406,237 bytes | +939,524 (+918 KB, about three times) |
| `dist/background.js` | 499,455 bytes | 1,420,284 bytes | +920,829 (+899 KB) |

(The "after" build also contains the other reader lanes' concurrent edits to the controller and page adapters, which are a few KB at most; the standalone measurement below isolates the word lists.) This is **well over 300 KB**. The cause is the three seed word lists (all of `src/adapters/de|hi|th` and their data); the growth
is not optimised away here. Measured alone (minified, not gzipped) the five analysers are 386,230 bytes for sq + es and 1,457,254 for
all five. Options for a later decision, none taken: build one content script per language and inject only the enrolment's;
load an adapter on demand through `chrome.scripting` in a second file that registers itself; or ship the three experimental
languages in a separate build.
