# Language-pack capabilities

Status: 2026-10-09 (Prompt 2, language lane; updated the same day for the six-language product: Norwegian Bokmål and Nynorsk are now
installable at the experimental level, and every pack has an orientation). Code: `packages/language-packs/src/capabilities.ts` (the report) and
`packages/golearn-extension/src/language/capabilities.ts` (the reader's view). Tests: `test/language-packs/capabilities.test.ts`,
`test/reader-languages/{sq,de,es,th,hi,nb,nn}.test.ts`, `experimental-packs.test.ts`, `reader-support.test.ts`, `test/language-packs/catalogue.test.ts`
(the six-language picker data) and `test/language-packs/tutorial-orientations.test.ts` (the five minimal orientations).

`packCapabilities(languageId)` returns what a pack **really** supports. Nothing in it is hand-asserted: a feature is `supported`
only when the pack's manifest declares it **and** the analyser the runtime bundles does not say `none` for it; script-handling
claims are probes run on the real analyser every time the report is built (a claim that stops being true shows `works: false`);
audio comes from GoListen's voice registry; review status and level come from the manifest. A test compares every report with
its manifest and its adapter and fails if a report claims what the adapter lacks.

## Levels

| level | meaning | packs |
|---|---|---|
| `installable` | analyser, dictionary, validation cases and an orientation tutorial exist | Albanian; Spanish (at a minimal level) |
| `experimental` | wired and installable, but seed-only, unreviewed, validation cases only, **a minimal AI-drafted orientation**; the setup page says "experimental, seed-only lemmatisation, unreviewed". German, Hindi and Thai have a kaikki dictionary; **Norwegian has none** (the pack declares no dictionary, the installer skips the dictionary checks and records "none declared") | German, Hindi, Thai, Norwegian Bokmål (nb), Norwegian Nynorsk (nn) |
| `planned` | described honestly, never installable, no analyser bundled | none at present (the level and `plannedManifest` stay for a language added later) |

An experimental pack has manifest `status: 'installable'` (the installer, the worker's `packAvailable` and the parser accept it)
and `level: 'experimental'`. `levelOf(manifest)` gives the level (absent = the one the status implies); `LEVEL_LABEL` has the
words. A manifest that says `level: 'experimental'` while reviewed, or `planned` while installable, is refused by `validateManifest`.

**Every pack is `machine-drafted`.** No native speaker has checked any word list, rule, grammar text or tutorial in any pack.

## The matrix

| capability | sq | es | de | hi | th | nb | nn |
|---|---|---|---|---|---|---|---|
| level | installable | installable | experimental | experimental | experimental | experimental | experimental |
| analyser | adapter-sq@9 | adapter-es@12 | adapter-de@9 | adapter-hi@6 | adapter-th@5 | adapter-nb@2 | adapter-nn@2 |
| tokenization | dependable | dependable | dependable | dependable | **limited** | dependable | dependable |
| sentence segmentation | limited | limited | limited | limited | limited | limited | limited |
| lemma | seed-only | seed-only | seed-only | seed-only | seed-only | seed-only | seed-only (smaller list) |
| morphology | limited | limited | limited | limited | **no** (no inflection) | limited | limited |
| phrases | limited | limited | limited | limited | seed-only | limited | limited |
| constructions | yes (8 explained) | yes (11) | yes (1) | yes (1) | yes (1) | yes (3) | yes (3) |
| syntax roles | **none** | none | none | none | none | none | none |
| production checker | **offered**, limited | **offered**, limited | not offered | not offered | not offered | not offered (adapter: limited) | not offered (adapter: none) |
| script handling | digraphs, clitic clusters | attached clitics, accents / ¿¡ | compounds, separable verbs | grapheme clusters, danda | word segmentation, tone decoding | æ ø å whole, particle verbs | æ ø å whole, particle verbs |
| recordings | 0 | 0 | 1 (a two-word demonstration) | 0 | 0 | 0 | 0 |
| device-voice template | yes | yes | no | no | no | no | no |
| remote voices (consent + key) | 2 | 3 | 0 | 0 | 0 | 0 | 0 |
| per-letter pronunciation notes (GoListen) | yes | no | no | no | no | no | no |
| listening evidence | never | never | never | never | never | never | never |
| review status | machine-drafted | machine-drafted | machine-drafted | machine-drafted | machine-drafted | machine-drafted | machine-drafted |
| validation cases | 14 | 17 | 14 | 14 | 14 | 14 | 14 |
| orientation tutorial | yes (sq) | yes (es) | yes, minimal (7 steps) | yes, minimal (7) | yes, minimal (7) | yes, minimal (8) | yes, minimal (8) |
| dictionary (kaikki, CC BY-SA 4.0) | 91,271 entries | 808,278 | 357,750 | 38,635 | 20,254 | **none** | **none** |

Notes on the matrix:

- **Syntax roles are none everywhere.** No analyser gives subject, object or modifier. A few function words carry a plain
  description of their own job as `role` (an Albanian linking article, a German relative pronoun or separable prefix, the Thai
  first-person pronoun); that is a word description, not a parse, and a test checks that no role is a grammatical relation.
- **The checker.** Albanian and Spanish declare production checking and the adapters call it `limited`; the Spanish adapter
  states four checks (article-noun agreement, de/a + el contraction, yo + conjugation, a number above one + singular noun),
  Albanian a wider set. German, Hindi, Thai and Norwegian Bokmål have rules in their adapters (`adapterLevel: 'limited'`) but their
  packs do not declare production checking, so **nothing the learner writes is checked** and the report says so ("does not offer
  them"); the Nynorsk adapter has no production rules at all (`adapterLevel: 'none'`).
  The two honest states are `offered` and `adapterLevel`; the earlier plan to call Spanish "thin" is expressed by its scope list,
  not by a different level, because the adapters themselves say `limited` for both.
- **Tokenization.** Thai is `limited`: ICU dictionary segmentation plus a short course compound list, not measured on prose.
  Norwegian is `dependable`: æ ø å stay inside their words and compounds stay one token.
- **Morphology features.** `explained` lists the features the pack's grammar tables describe to the learner; `observed` lists what
  the analyser actually wrote on the top readings of the pack's own validation sentences. They differ and both are shown:
  German explains Case and Gender but writes Case, Definite, Gender, Mood, Number, Person, PronType, Tense and VerbForm; Hindi
  explains Gender and Case (now including the ergative) but also writes Aspect, Number, Person, Tense and VerbForm. Thai writes none.
  Norwegian explains Gender, Definite and Tense and also writes Number, Mood, VerbForm, Degree, Person and PronType.
- **Union readings.** Where the analyser cannot choose, it keeps the union and says so: German `Nom,Acc`, Bokmål `Fem,Masc` (both
  feminine paradigms are valid, so `boken` is "feminine or masculine"), Norwegian `Mood: Imp,Ind` (`gjør`, `kom`, `les`), `VerbForm:
  Fin,Inf,Part` (Nynorsk `kasta`). The Norwegian card description used to say only "imperative" for `Imp,Ind` and only "infinitive" for
  `Inf,Part`; `describeNorwegianMorph` (src/adapters/norwegian/engine.ts) now says "present tense or imperative", "past tense or
  imperative", "imperative or infinitive" and "infinitive or perfect participle".

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

### Norwegian Bokmål (`pack:nb`, experimental)

| | |
|---|---|
| analyser | adapter-nb@2: seed-only lemmatisation (a machine-drafted word list of nouns, verbs, adjectives and the closed classes), limited morphology, limited phrases, 3 explained constructions (`perfect-har`, `modal-bare-infinitive`, `particle-verb`), rule-based East Norwegian respelling |
| script handling | æ ø å stay inside their words and are words alone (probe passes); a particle verb split by other words is one unit (probe passes) |
| checker / audio | **not offered** (the adapter has limited rules for a Nynorsk form in Bokmål, Riksmål spelling, min bilen, a missing neuter -t, ikke after the verb, og for å) / no recordings, no voice, no per-letter notes in GoListen |
| size | shared Norwegian engine chunk 161,306 bytes (about 57 KB gzipped, carries nb AND nn); `nb.js` is 76 bytes over it; **no dictionary** |
| review | machine-drafted; experimental |
| orientation | 8 steps: select a word, what the card shows, one practice lookup (hagen in *Barna spiller i hagen.*), æ ø å, the two written standards, eight nouns, the definite ending, honesty |
| validation | 14 cases, all pass on the real analyser (11 high-confidence, 3 provisional: har as a main verb, står … opp, the unconfirmed compound sykehusregning) |
| tests (`nb.test.ts`) | 27 tests: **23 assert what the analyser does, 4 are LIMITs** |

Asserted: the definite ending read off the noun (huset, bilene, barna, hagen, jenta, jakka); both feminine paradigms kept as
`Fem,Masc` (boken), the articles et / ei / en with their gender, the neuter adjective (stort); an unlisted compound
(sykehusregning) split into known words, UNCONFIRMED, no gloss, not credited as a lemma; the particle verb stå opp as one unit on both
pieces (also with ikke between); the perfect with har, the modal with a bare infinitive, the infinitive marker å; gjør / kom described
as "or imperative"; æ ø å in tokens; sentence splitting with f.eks.; the Bokmål pack reads its own sentence completely and the
Nynorsk sentence honestly badly (kvar has no reading, Eg is an unconfirmed name guess at confidence 0.4); boka (Nynorsk, Fem) and boken
(Bokmål, Fem,Masc) have different item ids; the nb / nn word families relate jeg and eg without merging them.

LIMITs (`it.fails`, counted): `ei bok` leaves the noun `Fem,Masc` although ei is feminine only; `Vi må gå nå` leaves gå as
"imperative or infinitive" (VerbForm Fin,Inf) although a modal allows only the infinitive; an unlisted abbreviation followed by a
capital letter (`Se kap. Tre i boka.`) is cut in two; the Bokmål pack reads a Nynorsk `les` as `le` (to laugh) in the s-passive at
0.88 (only the resolver keeps a Nynorsk page out of the Bokmål pack).

### Norwegian Nynorsk (`pack:nn`, experimental)

| | |
|---|---|
| analyser | adapter-nn@2: the same engine with a smaller machine-drafted word list; three genders (ein, ei, eit), both -a and -e infinitives for weak verbs; seed-only lemmatisation, limited morphology and phrases, the same 3 explained constructions |
| script handling | æ ø å (probe passes); particle verbs (probe passes) |
| checker / audio | **not offered** (the Nynorsk adapter checks no writing) / no recordings, no voice (no Azure voice is known for Nynorsk, so none is named; nothing is read aloud in Bokmål in its place) |
| size | the shared engine chunk above; `nn.js` is 76 bytes; **no dictionary** |
| review | machine-drafted; experimental |
| orientation | 8 steps, the same shape (practice: boka in *Eg les boka kvar dag.*) |
| validation | 14 cases, all pass (12 high-confidence, 2 provisional: eit, står … opp) |
| tests (`nn.test.ts`) | 21 tests: **18 assert, 3 are LIMITs** |

Asserted: boka (Fem exactly), hagen, eplet, borna as the plural definite of barn; ei bok narrows the noun to Fem (unlike Bokmål);
eit / ein / ei; raudt (neuter); eg, ikkje with nn item ids; les as "present tense or imperative"; kaste / kasta (kasta is past OR
participle: `Fin,Inf,Part`); har lese as "infinitive or perfect participle"; står opp as one unit; the perfect and the modal; vere;
the unknown-word card (no reading, a form id only); the adapter checks no writing; æ ø å in tokens; sentence splitting with t.d.

LIMITs: `kaffen` (a common noun) is not in the Nynorsk list and has no reading at all; the compound `sjukehusrekning` gets no
reading either (sjukehus is not in the list), where the Bokmål compound is split and marked unconfirmed; the unlisted abbreviation
`kap.` before a capital letter cuts the sentence.

Both Norwegian packs state their written standard on every variety (`validateManifest` refuses a Norwegian pack that does not), say
that Nynorsk is never credited to Bokmål or the reverse, and are each their own pack: a learner chooses; a page that says only `no`
decides nothing between them (see LANGUAGE-RESOLUTION.md). Norway is no longer a "team": any learner may pick any pack.

## Test totals (this lane)

| file | tests | asserting | LIMIT (`it.fails`) |
|---|---|---|---|
| `test/reader-languages/sq.test.ts` | 31 | 28 | 3 |
| `test/reader-languages/es.test.ts` | 23 | 20 | 3 |
| `test/reader-languages/de.test.ts` | 21 | 18 | 3 |
| `test/reader-languages/th.test.ts` | 22 | 19 | 3 |
| `test/reader-languages/hi.test.ts` | 25 | 22 | 3 |
| `test/reader-languages/nb.test.ts` | 27 | 23 | 4 |
| `test/reader-languages/nn.test.ts` | 21 | 18 | 3 |
| language-specific total | 170 | 148 | **22** |
| `test/reader-languages/resolve.test.ts` | 62 | 62 | 0 |
| `test/language-packs/capabilities.test.ts` | 40 | 40 | 0 |
| `test/language-packs/catalogue.test.ts` | 17 | 17 | 0 |
| `test/language-packs/tutorial-orientations.test.ts` | 49 | 49 | 0 |
| `test/reader-languages/experimental-packs.test.ts` | 58 | 58 | 0 |
| `test/reader-languages/reader-support.test.ts` | 11 | 11 | 0 |

A LIMIT is a test written as `it.fails('LIMIT: ...')` with a `// LIMIT:` comment saying what is missing. It passes while the
analyser still has the limit and turns red the day the analyser improves, so a limit cannot be fixed (or forgotten) silently.

## Size in the extension

`npm run ext:build`, measured 2026-10-09 after Norwegian was wired in (minified, bytes). Only Albanian, the reference language, is linked into
the content script and the worker; every other analyser is its own chunk that the content script loads on demand (the worker never
loads one: its pack runtime reads the parser's registry). `test/extension/bundle.test.ts` asserts the limits (content.js and
background.js at most 520 KB) and that no other analyser is inlined.

| bundle | bytes |
|---|---|
| `dist/content.js` | 347,741 |
| `dist/background.js` | 505,083 |
| `dist/analysers/sq.js` (Albanian, also inlined in the two above) | 201,680 |
| `dist/analysers/es.js` | 167,110 |
| `dist/analysers/de.js` | 329,984 |
| `dist/analysers/hi.js` | 405,574 |
| `dist/analysers/th.js` | 172,906 |
| `dist/analysers/nb.js` | 76 (re-exports the shared engine chunk) |
| `dist/analysers/nn.js` | 76 (re-exports the shared engine chunk) |
| `dist/analysers/shared-C3NX7yve.js` (the Norwegian engine and both word lists; hash changes with the code) | 161,306 |
| `dist/analysers/shared-D9wXEFyu.js` (code shared by the other analysers) | 8,244 |

Loading Bokmål or Nynorsk therefore costs about 161 KB once (the engine chunk is shared, so the second standard adds 76 bytes). The
earlier plan to carry German, Hindi and Thai inside the content script (which measured +918 KB) was dropped in favour of these chunks.
