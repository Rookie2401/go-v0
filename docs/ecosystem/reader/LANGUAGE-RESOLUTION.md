# Language resolution

Status: 2026-10-09 (Prompt 2, language lane). Code: `packages/golearn-extension/src/language/resolve.ts`. Types:
`packages/golearn-extension/src/contract/language.ts`. Tests: `test/reader-languages/resolve.test.ts` (62 tests).

The reader meets text in many languages. Before a selection is analysed, the content script asks ONE question, "which
language is this in?", and gets one answer with its basis and its reasons. The resolver implements that answer. It is a pure
function of the evidence: no DOM, no storage, no network, and nothing it is given is kept or sent.

## The evidence

```ts
interface LanguageEvidence {
  override?: string;                                   // the learner's choice
  bookLanguage?: { languageId; source; confidence };   // an OPF dc:language ...
  documentLanguage?: { languageId; source: 'html-lang' | 'meta' | 'og-locale' | 'element-lang' | 'url'; confidence };
  sample?: string;                                     // the selected surface plus up to 400 characters of the block around it (since 2026-10-09; read for this only, never kept)
  teamDefault?: string;                                // the language the learner picked (the field keeps its old name; there are no teams in the apps)
  installed: string[];                                 // the languages the learner chose (account + device enrolments); every pack when none is chosen
}
interface LanguageResolution {
  languageId?: string; varietyId?: string; confidence: number;
  basis: 'override' | 'book-metadata' | 'document-metadata' | 'detection' | 'team-default' | 'undetermined';
  reasons: string[];                                   // plain words; never the sample
}
```

`installed` limits every candidate. A language is never resolved to a pack that is not installed.

## The ladder

The first rung that decides ends the ladder.

| # | rung | decides when | confidence |
|---|---|---|---|
| 1 | `override` | the learner chose a language (an id or a tag such as `es-HN`) | 1 |
| 2 | `book-metadata` | the book declares a pack language with confidence of at least **0.8** | the book's own |
| 3 | `document-metadata` | the page declares a pack language with confidence of at least **0.6** and the source is not `url` | the page's own, at most 0.95 |
| 4 | `detection` | at least **3 words** in the sample, then script or word-list evidence (below) | 0.35 – 0.9, computed |
| 5 | `team-default` | nothing above decided and the learner has a picked language | **0.3** (a default, not evidence) |
| - | `undetermined` | none of the above | 0 |

Weak declarations (an `og:locale` at 0.55, a book at 0.79) and a locale found in the URL are listed in `reasons` and decide
nothing. An override or a declaration naming something no pack covers is skipped or stops the ladder as follows:

- **no pack for the tag** (`en`, `fr`): the rung is skipped with a reason; an English page does not stop detection or the default.
- **ambiguous tag**: skipped with a reason and the ladder goes on. See the table below.
- **a pack language that is not installed**: the ladder ends with `undetermined` and says "the th pack is not installed". Reading a
  Thai page with the learner's Spanish word list would be confident nonsense, so it is not offered. (The learner's own
  override that cannot be matched ends the ladder the same way: the learner's word is never second-guessed.)

When metadata decides but the sample clearly looks like another installed language (detection confidence at least 0.6), the
answer keeps the declared language, drops its confidence to **0.55** and adds "the text itself looks like es, not de".

### A mislabelled page and the learner's chosen language (2026-10-09)

Many sites in the six languages declare `html lang="en"` (templates), so the first rule, "a reliable declaration of a language
no pack covers blocks the default", stopped every lookup on them with "GoLearn cannot tell which language this is" although the
learner had chosen the language in setup. Two changes, both for every language:

1. The sample is no longer the selected word alone but the word plus up to **400 characters of the block around it**, so rung 4
   (detection) has enough words to recognise the text, and so does the rule below.
2. When a declaration names a language no pack covers, the chosen language (`teamDefault`) is still used if its word list
   recognises at least **45 %** of the words around the selection, with at least 3 hits (`DEFAULT_COMPATIBLE_SHARE`); the reason
   states the share. Measured with `scripts/probe-resolver-share.mts`: every pack recognises 70–100 % of its own prose and at most
   38 % of foreign prose (English against Albanian 7–22 %, French against Spanish 38 %), so English text on an English-labelled
   page is still never read as Albanian (the certification finding stands), and an Albanian article on an English-labelled page is.

`installed` is now the learner's chosen languages (the account's enrolment and the device's open enrolments), every pack when
none is chosen: a page in the chosen language is recognised from that language's own word list without loading the other
packs' chunks, and a page in a language the learner has not chosen says so and offers the setup page.

A declaration naming a **pack language the learner has not chosen** (an Albanian site on a German template declares `de`) is
treated exactly like a no-pack declaration: it decides nothing, nothing is read with that language's word list, detection and
the compatibility rule above still apply. Before, it ended the ladder at once. The "a book declares th, the page declares es"
case now resolves to the page's own declaration of a chosen language.

When the ladder ends undetermined, the card's message and the popup's "This page" line now append the resolver's last two
reasons after "Why:" (plain words about the evidence, never the page's text), so a learner can see what blocked the lookup.

## BCP-47 tags to pack languages

| tag | result |
|---|---|
| `sq`, `sq-AL`, `als` (Tosk), `aln` (Gheg) | `sq` (Gheg is related to Standard Albanian, not analysed as a variety: said in the reasons) |
| `de`, `de-DE`, `de-AT`, `de-CH` | `de`; variety `de-DE` / `de-AT` / `de-CH`; a region the pack does not list gives no variety |
| `es` | `es`, no variety |
| `es-HN` | `es` with the variety hint **`es-HN`** (Honduras, the course's target) |
| `es-ES` | `es`, variety `es-ES` |
| `es-419`, `es-MX`, `es-AR`, `es-CO` ... | `es`, variety `es-419` (the reasons say the pack has no variety of its own for the country) |
| `th`, `th-TH` | `th` |
| `hi`, `hi-IN` | `hi` |
| `nb`, `nb-NO`, `nn`, `nn-NO` | `nb`, `nn`: resolved directly when that pack is installed (both are experimental packs the learner installs); a page that declares `nn` is **never** read with the Bokmål pack when only `nb` is installed (undetermined: "the nn pack is not installed") |
| `no`, `no-NO`, `nor` | **ambiguous** between Bokmål (nb) and Nynorsk (nn); neither is assumed. See "Norwegian" below |
| `hi-Latn`, `th-Latn` (any script that is not the pack's) | **ambiguous**: Hindi in Latin script is a language no pack analyses |
| `gsw`, `bar`, `nds`, `ast`, `gl`, `ca`, `mr`, `ne`, `sa`, `awa`, `bra` | **ambiguous**: close to a pack language but not it |
| anything else (`en`, `fr`, `ja`, rubbish) | no pack |

The variety table (`PACK_VARIETIES`) is compared with the manifests' analysed varieties by a test. A related, un-analysed
variety (Gheg, Awadhi, Braj) is never a hint.

## Detection from the sample

Detection looks at the **selected surface only**, never the sentence around it (the contract forbids passing the context). It
reads at most the first 1,200 characters and 150 words.

1. **Fewer than 3 word tokens: undetermined, always.** "die" alone could be German or Norwegian; "casa" could be Spanish,
   Portuguese or Italian; a single Thai or Hindi word is still only one word. Two words are not enough either. This is the
   ambiguity rule, and it applies to script as well as word lists.
2. **Thai script** (at least 60% of the letters): `th`, confidence 0.9, if the Thai pack is installed (else undetermined with that reason).
3. **Devanagari script** (at least 60%): Hindi only when the Hindi word list recognises at least **50%** of the words. The script
   is shared with Marathi, Nepali and Sanskrit, so the word list is what supports Hindi; `मला पुस्तक आवडते आणि मी वाचतो` (Marathi)
   and a Nepali sentence stay undetermined.
4. **Latin script** (at least 60%): a lexicon-hit comparison across the **installed** packs that have a word list. A word is a
   *hit* when the pack's analyser gives it a reading that is not an inferred (unconfirmed) one. The best pack decides only when
   all three hold:
   - it recognises at least **60%** of the words,
   - and at least **3** words,
   - and it leads the runner-up by at least **25%** of the words.

   A tie ("a e i o u" is as Albanian as Spanish), a thin lead ("The die is cast and the man is here."), a floor not reached
   (English text) and a single installed pack that does not clear the floor are all `undetermined`, with the numbers in the
   reasons ("es 1/4, sq 0/4").

Examples (measured by `test/reader-languages/resolve.test.ts`):

| sample | installed | answer |
|---|---|---|
| `Ich lese das Buch.` | sq es de hi th | `de`, detection (de 4/4, es 1/4) |
| `Los niños leen los libros.` | same | `es`, detection |
| `Unë e lexoj librin dhe ai i shkruan një letër.` | same | `sq`, detection (sq 10/10) |
| `ฉันกินข้าวที่บ้านทุกวัน` | same | `th`, 0.9 |
| `मैं हर दिन किताब पढ़ता हूँ।` | same | `hi`, detection |
| `die` | de nb | undetermined: "fewer than 3 is never enough" |
| `Haus`, `casa`, `shtëpi`, `ข้าว`, `किताब` | all | undetermined (one word each) |
| `Ich lese das Buch.` | es sq | undetermined (es 1/4, sq 0/4): German is not installed, so it is not called Spanish |
| `The children read the books at school.` | any | undetermined |
| `Jeg leser boken i dag.` | nb nn de | `nb`, detection, 0.85 (nb 5/5, nn 2/5, de 0/5) |
| `Han er ikkje heime no.` | nb nn de | `nn`, detection, 0.85 (nn 5/5, nb 2/5, de 1/5) |
| `Eg les boka i dag.` | nb nn | undetermined: too close to call (nb 4/5, nn 5/5) |
| `Ich lese das Buch.` | de nb nn | `de` (de 4/4, nb 1/4, nn 1/4): Norwegian is compared too, and loses |
| `die` | de, team default `de` | `de`, **team-default**, 0.3, "a default, not evidence about this text" |

The word lists are the parser's: every analyser whose chunk has been loaded into its registry (sq, es, de, hi, th, nb, nn). Norwegian is
in the default table like any other language. Where an installed language's chunk has not been loaded yet, the resolver names it in the
reasons as "not compared (no word list available)" and the controller loads the analysers detection needs and asks again; a caller that
holds a word list the parser does not can still pass it (`createLanguageResolver({ adapters })`).

## Norwegian

Norwegian is written in two standards, Bokmål (`nb`) and Nynorsk (`nn`), and each is its own experimental pack. The resolver never
treats one as the other and never credits one for the other.

- **A page or book that declares `nb` or `nn`** (also `nb-NO`, `nn-NO`, `nob`, `nno`) resolves to that pack directly, at the usual
  confidence for its basis, when the pack is installed. If only the other standard is installed the answer is `undetermined` ("the nn
  pack is not installed"); the Bokmål pack is not used to read Nynorsk, because it would read `les` as the verb `le` in the s-passive
  and `Eg` as a name.
- **A bare `no`** (`no`, `no-NO`, `nor`) does not say which standard. It decides nothing between them:
  - with **both** packs installed, or **neither**, it is skipped with the reason "Norwegian is written in two standards ... neither is
    assumed", and the ladder goes on to the sample (a clear lead of a quarter of the words separates the two) or to the language the
    learner picked;
  - with **exactly one** of the two installed, the learner's own choice of pack decides it: the answer is that pack, with the basis of
    the declaration (override, book or document metadata) and the **lowered confidence 0.6** (`NORWEGIAN_UNSPECIFIED_CONFIDENCE`), and
    the reasons say that this was settled by the only installed Norwegian pack. This is the one exception to "an ambiguous tag
    decides nothing".
- **Detection** compares nb and nn like any two packs: they share most words, so only a lead of 25% of the words decides
  (`Jeg leser boken i dag.` is nb, `Han er ikkje heime no.` is nn, `Eg les boka i dag.` is too close to call).
- **One word is never enough**: `die` alone with German and Norwegian installed is undetermined.

## What detection cannot do

- **Short text.** Under three words it says nothing, however clear the word looks.
- **Closely related languages.** Bokmål against Nynorsk share most words; only a lead of a quarter of the sample decides, and a text in
  Nynorsk with Bokmål installed alone is read by nothing but the declared tag. Hindi
  against Urdu in Devanagari, or Hindi against Marathi, rests on a seed word list of about 1,500 lemmas: real Hindi with many
  unlisted words can fall below 50% and be reported undetermined (the safe failure).
- **Seed-only word lists.** A hit means "the pack's list knows this word". German, Hindi and Thai lists are small and
  machine-drafted; a text full of words outside them scores low in its own language. The resolver would rather say nothing.
- **Varieties.** `es` against `es-HN` cannot be detected from words; a variety comes only from a tag (`es-HN`, `de-AT`).
- **Languages with no pack.** English, French, Portuguese and the rest are not detected at all: they are "no pack", and the
  answer is whatever the later rungs say. There is no "this is English" result.
- **Mixed text.** A sample that is not mainly one script is undetermined. Thai-with-English inside a Thai sentence is mostly
  Thai script, so it is Thai; the English word is a separate token the analyser does not know.
- **Wrong metadata.** A page that declares `lang="en"` over German text is not "wrong" to the resolver: English has no pack, so
  detection runs and finds German. A page that declares `de` over Spanish text keeps `de` but at 0.55 with the disagreement said.

## Known gaps in the evidence the adapters supply

- `documentLanguageOf` (`src/adapters/languageMeta.ts`) reduces every tag to its primary subtag (`es-HN` becomes `es`), so a
  Honduran page's region never reaches the resolver and no variety hint comes from the page. The resolver understands full tags
  (`es-HN`, `de-AT`); the adapter lane would have to pass the tag through for the hint to appear. Tests prove the resolver half.
- The controller's `defaultResolveLanguage` is a placeholder (it takes the first declared language); the real one is
  `resolveLanguage` here and has to be passed as `ControllerDeps.resolveLanguage`.
