# Origin and Word structure (Linguistic Engine V2, Stage 5)

Two deeper sections of the card answer "where does this word come from" and "what is it made of". Both are built page-side
(`packages/golearn-extension/src/content/enrich.ts`) from the dictionary's full record and the loaded analyser. Neither is
generated text: every field names its source and carries a status, and an empty field is shown as unavailable, never filled in.

## What the card shows

### Origin (`etymologyOf`)

- The dictionary's etymology text as written (Wiktionary via kaikki.org, CC BY-SA 4.0), unedited.
- **Steps the source names**: the chain of its templates `inh bor lbor slbor der uder clq calque af affix suffix prefix com
  compound blend onom unc`, in words: "borrowed from Latin liber", "inherited from Proto-Albanian *lībra", "compound of
  bojë + kafe (Albanian)". A language code is replaced by its name when the code is in `content/languageNames.ts`; a code that
  is not there stays a code ("derived from xyz: form"). A name is never guessed.
- **Cognates the source lists**: the `cog` templates, kept apart from the chain because a cognate is a word of another language
  that shares the origin, not a step in this word's history ("Romanian liber").
- Status: `supported-by-source` for a documented origin; `conflicted` when the source itself says the origin is uncertain or
  disputed (the text says so, or an `unc` template is present); `unknown` with the line "No documented origin in the dictionary.
  GoLearn does not invent one." when the record has no etymology.

`EtymologyView` gained `cognates` and `languageNames` (only the codes that occur in this word's chain and cognates). `chain` is
unchanged for everything except that cognates are no longer in it.

### Word structure (`structureOf`, layer `structure`, button "Word structure" between Origin and Sound)

A segmented line (prefix | root | suffix, each piece with its role and, where a source gives one, a gloss), "Derived from", the
word family (derived and related words), a status line, the notes and a "Sources" line. Opening it is reported as an
`AssistanceRequested` of kind `hint`, like Origin. With nothing to show: "No documented structure for this word." (a family with
no parts shows "No documented parts for this word." and the family).

## Where each field comes from

`structureOf(record, adapter, lemma, pos, surface, features, { languageId })`, sources in this order, each named in the
part's `source`:

| # | source | gives | status |
|---|---|---|---|
| 1 | the dictionary's etymology templates `af affix suffix prefix com compound blend` (their `form` is the parts joined with " + ") | `parts` (prefix, root, suffix, component, linking element), and `derivedFrom` when the template for the word's own language has exactly one root and at least one affix | `supported-by-source` |
| 2 | the analyser's reading of the word (`analyze` on the written form, else on the lemma): `parts` (German/Norwegian compound components with the link kept apart, the German separable prefix and its `ge`/`zu` marker, Spanish and Albanian attached pronouns, contractions, Hindi `-वाला` words and the stem + marker split), `notes.components`, `notes.derivedFrom` (Hindi causatives and abstract nouns), `unit` (German "steht … auf") | `parts`, `derivedFrom` (relation "second causative of", "causative of …", or "derived from, by the analyser's rule"), a note for the unit and the stem | `provisional` |
| 3 | the analyser's paradigm, when it generates the lemma: the longest start the one-word cells share is the stem, the rest of the surface the ending | `parts` stem + ending, source says "generated" | `provisional` (parts) |
| 4 | the dictionary's `rel.d` (derived) and `rel.r` (related) | `family` | the family is listed whatever the status; it alone does not make a structure |

Rules that keep it honest:

- The template for the word's own language is taken first. A template for another language (`af` with `lang=la` in a Spanish
  entry) describes the source word, not this one: it is used only if nothing else is there, with the note "The dictionary gives
  these parts for the Latin word this one comes from", and it never yields a `derivedFrom`.
- A template with no `form`, a part longer than 40 characters, or more than 8 parts is not a segmentation and is ignored. `inh`,
  `bor`, `der` give a history and never parts.
- The generated stem must be at least 2 characters and at least half the lemma, the surface must be one of the generated forms,
  and no cut falls between a consonant and its nukta or virama. An irregular paradigm (go, went, gone) shares no stem, so there is
  no split. Cells with a space (periphrastic forms) are left out.
- When a template and the analyser both speak, the template's parts are shown, the status is the source's, and a disagreement
  between the two cuts is said in a note. The inflection of the selected form (stem + ending) is then a note, not part of the line.
- `unknown` means no source gave anything: no parts, no `derivedFrom`. The word is not split.
- The status marks: `supported-by-source` "From the dictionary: its etymology template names these parts."; `provisional`
  "Provisional: from the analyser's rules only; no dictionary template confirms it."

## Which languages have which sources

Counts are from the built full records (`public/dict/<lang>/full`, 2026-10-10; a record is one entry per part of speech).
"Parts template" is a record with at least one of `af affix suffix prefix com compound blend` carrying a form (before the length
checks above). There are no full records for Norwegian yet: its structure comes from the analyser only.

| language | records | with etymology | with templates | **parts template** | with `cog` | **`rel.d`** | `rel.r` |
|---|---|---|---|---|---|---|---|
| German | 106,745 | 74,871 | 63,626 | **51,393** | 5,417 | **17,184** | 22,229 |
| Spanish | 125,981 | 62,396 | 15,979 | **2,675** | 3,738 | **15,385** | 17,990 |
| Hindi | 27,060 | 22,149 | 12,617 | **4,921** | 2,556 | **2,689** | 1,534 |
| Albanian | 14,727 | 10,194 | 7,080 | **2,998** | 2,198 | **2,391** | 3,277 |
| Thai | 21,116 | 16,607 | 14,612 | **7,246** | 5,344 | **4,222** | 1,453 |

What the analysers add (source 2 and 3):

| language | parts and notes | generated stem + ending |
|---|---|---|
| German | compound components + head + link, separable prefix + marker, `im`-type contractions, units | yes |
| Norwegian | compound components + head + link, units | yes (nb) |
| Spanish | attached pronouns, `al` / `del` | yes |
| Albanian | attached pronoun clitics, `të`/`u` particles | yes |
| Hindi | `-वाला` words, stem + conjunctive marker, causative and abstract-noun base (`derivedFrom`) | yes |
| Thai | none (a script without inflection; the `nominalizer` note on ความ is not used) | no (`kind: none`) |

The probe row "word structure available" (`scripts/probe-linguistic-coverage.mts`) measures how often any of this produced parts
or a `derivedFrom` on real sentences; "cognates present" how often the chosen record has a `cog` template. Availability, not
correctness: whether a given cut is right needs a checked gold set (see COVERAGE-AUDIT.md).

## Limits

- The templates are Wiktionary's: volunteer work, CC BY-SA 4.0, unreviewed here. The kaikki extract keeps at most 20 templates
  and 600 characters of text per record, and drops `root`, `etymon` and the others (LEXICAL-SCHEMA.md 2.2).
- A template describes the lemma. For an inflected form the line shows the lemma's parts; the selected form's ending is a note
  (source 3) only where the analyser generates the paradigm.
- A hyphen decides the role of a part in `af`/`affix`; without hyphens, `prefix` means the first part is the prefix and `suffix`
  the last. Wiktionary editors are not uniform about hyphens, so a bare affix in an `af` template is shown as a root or component.
  Spelling at the seams (sandhi, umlaut, a dropped vowel) is the template's own; GoLearn does not check that the parts add up to
  the lemma, except in the note when it compares an analyser cut with a template for the same word.
- `derivedFrom` from a template is only the case of one root plus affixes; a compound has no single base.
- Language names: the codes that occur in the five built dictionaries, about 200, in Wiktionary's own names. Dialect and
  sub-stage codes outside that list (and any new one) stay codes. `gl,pt` style pairs are named when both halves are known.
- The family lists are the first 30 derived and 30 related words the record keeps, unordered by relevance, and "related" is
  Wiktionary's loose notion (see also lists, not necessarily cognate).
- Provisional parts are machine rules (German compound decomposition is a longest-component search over the word list; the
  Hindi and Albanian rules are machine-drafted). They are marked provisional on the card and never raise a learner's evidence.

## Measured availability (probe, 2026-10-10, 200 selections per language from the course corpora)

`npx vite-node scripts/probe-linguistic-coverage.mts --n 200`; real parser, real analysers, real built shards. These are
availability figures, not correctness.

| field | sq | es | de | hi | th |
|---|---|---|---|---|---|
| etymology present in the record | 92% | 97% | 91.5% | 98.5% | 93.5% |
| word structure available (parts or a base word) | 40.5% | 18.5% | 12% | 25.5% | 10% |
| &nbsp;&nbsp;of which a dictionary template gave the parts | 10% | 0.5% | 5.5% | 1.5% | 10% |
| cognates present | 54% | 26.5% | 74% | 58% | 85.5% |

Most of the structure that is available on running text is the analyser's generated stem and ending (provisional); a dictionary
template naming parts is rare on the frequent words of a course corpus, which are mostly simple, inherited words.
