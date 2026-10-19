# Latin in the apps: the pack, the setup app, GoReview and the resolver

Written 2026-10-17 by the app-wiring lane. The analyser (`src/adapters/la.ts`, id `adapter-la@1`) belongs to the adapter lane, the
dictionary (`public/dict/la/`) to the dictionary lane and the corpus (`data/corpus/la/`) to the corpus lane; this note is only
about how the apps see them.

## What was added

| Where | What |
|---|---|
| `packages/language-packs/src/packs/la.ts` | the Latin manifest: pack id `pack:la`, level `experimental`, status `installable`, review `machine-drafted`; the honest note "Latin: ported analyser, Clementine-Vulgate orthography, unreviewed." is in its provenance. One analysed variety, `la-ecclesiastical` (Clementine Vulgate spelling); `la-classical` is listed as read beside it, not analysed. Dictionary `kaikki-la@2026-10-17`, `dict/la/`, the same hosted base as every other language. |
| `packages/language-packs/src/tutorial/la.ts` | the minimal orientation (7 steps): selecting a word, the card, a practice lookup, Latin spelling in the Vulgate (i/j, u/v, æ œ, no vowel length), nine first words, the honesty step and the sound note. AI-drafted, unreviewed, skippable. |
| `registry.ts`, `index.ts`, `tutorial/index.ts`, `catalogue.ts` | Latin is the eighth pack, the eighth tutorial and the **seventh catalogue entry** (last in the picker). The setup app's language rows and its "Download language" menu are built from the catalogue, so Latin appears and installs with no setup-app code of its own (`app/languages.ts` only turns an entry into a view). |
| `packs/planned.ts` | additive: the dictionary spec may carry its own `id` (Latin's extract is dated 2026-10-17, not the default 2026-09-28). |
| `golearn-extension/src/language/resolve.ts` | `la` and `lat` map to the pack; the script is Latin; `PACK_VARIETIES.la = ['la-ecclesiastical']`. |
| `golearn-extension/src/protocol.ts` | `languageNameOf('la') = 'Latin'`. (`gopractice/format.ts` and `content/languageNames.ts` already knew `la`.) |
| `gopractice/classEssentials.ts` | the Latin set of the 28 Class Essentials cards (below), with its own deck note. |

`src/language/capabilities.ts` needed no change: it has no per-language table (the parser's `PARSER_LANGUAGES`, which the adapter
lane extends with `la`, decides what is parseable).

## Language detection

The resolver does not use letter heuristics for Latin script; it compares the installed packs' word lists
(`detect()` in `resolve.ts`), so Latin is recognised through the Latin word list and **only when the Latin pack is installed**.
`ae`/`oe` ligatures and the function words (et, in, est, non, qui, quae, quod, cum, ad, ut, sed) are the analyser's business.
`test/reader-languages/latin.test.ts` pins that Vulgate sentences resolve to `la` while Spanish, German and Albanian sentences keep
resolving to `es`, `de` and `sq` with Latin installed, that a Latin sentence is not called Spanish when Latin is not installed, and
that a page declared `lang="la"` is Latin (and is not read with another language's word list when the pack is missing).
Those detection tests need the real analyser and are skipped until `src/adapters/la.ts` exists.

## Class Essentials: the Latin cards (Church Latin phrasing)

28 cards, same topics and order as every other language. The deck note is "…not yet reviewed by a Latinist" (Latin has no native
speakers, so the note names the reviewer who could review it). Every word was checked as a headword or an inflected-form entry in
the kaikki Latin extract (`romance-v0/data/dict/kaikki-la.jsonl`); `loquerisne` is *loqueris* + the question particle *-ne*, and
*caffeum* is listed there as a form of *cafea* (a modern coinage). Register and idiom are the author's knowledge.

| # | English | Latin |
|---|---|---|
| 1 | Hello / Goodbye | Salve / Vale |
| 2 | Please / Thank you / I'm sorry | Quaeso / Gratias tibi ago / Ignosce mihi |
| 3 | Excuse me | Da veniam |
| 4 | One … Ten | unus, duo, tres, quattuor, quinque, sex, septem, octo, novem, decem |
| 5 | How much is this? | Quanti hoc constat? |
| 6 | My name is… / I'm from… | Nomen mihi est… / Sum ex… |
| 7 | Where is the restroom? | Ubi est latrina? |
| 8 | Water / Bottled water | Aqua / Aqua in lagoena |
| 9 | I would like… | Velim… |
| 10 | Do you speak English? | Loquerisne Anglice? |
| 11 | I do not understand | Non intellego |
| 12 | I don't speak the country's language, but I would like to learn. | Latine non loquor, sed discere velim. |
| 13 | Jesus is the Savior! | Iesus est Salvator! |
| 14 | One coffee, please! | Unum caffeum, quaeso! |

"Excuse me" is *Da veniam* ("grant me pardon"); the unclassical *Excusa me* was not used. "How much is this?" adds *hoc* to the
short form *Quanti constat?* so that "this" is said.

## What depends on the other lanes

- **Adapter lane.** `builtins.ts` (the full static set used by servers and tests) imports `laAdapter` from `src/adapters/la.ts`;
  the validation cases, the tutorial's example words and the capability report are calibrated against it. Everything that needs the
  real analyser uses `test/support/latin.ts` (`laAdapter`, found with `import.meta.glob`, so it is `undefined` rather than an import
  error while the file is absent) and `describe.skipIf`.
- **Dictionary lane.** `LA_DICTIONARY` (id, entry count, frequency flag) must equal `public/dict/la/manifest.json` or the installer
  refuses with `dictionary-mismatch`; `test/language-packs/latin.test.ts` compares the two. A rebuild of the dictionary means
  updating `LA_DICTIONARY`.
- **Speech.** No Latin voice is offered by Azure or registered in GoListen; the manifest's `remoteVoice.voices` is empty and the
  extension's speech whitelist (`background/speech.ts`) does not include `la`.

## Open items at the time of writing (2026-10-17)

- `laAdapter.version` is `'adapter-la@1'` (it re-uses `LA_ANALYZER_VERSION`); every other adapter's `version` is the bare number
  (`'9'`, `'6'`) and the pack is `adapter-<lang>@<version>`. The pack therefore says version `'1'` and three tests fail until the
  adapter's `version` is `'1'`: `registry.test.ts` (adapter versions), `capabilities.test.ts` (la identity, which reports
  `adapter-la@adapter-la@1`) and `latin.test.ts` (the same two assertions).
- The parser's `LANGUAGE_META` entry for `la` (adapter lane) is what makes `reader-support.test.ts` count Latin as parseable and
  what lets `registerAllAnalysers()` register it (it registers `la` only once that entry exists).
- The manifest declares the adapter's phrases, ten sentence patterns and pronunciation notes, and `capabilities.ts` has two
  script-handling probes for Latin (ligatures and macrons stay whole; enclitic -que); all three are checked against the real analyser.
