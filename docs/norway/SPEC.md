# Team Norway: specification (Phase 2)

Written 2026-10-07 by the lead after reviewing the three reconnaissance reports in `docs/norway/recon/` against the
code. Everything marked ✔ was checked in the repository by the lead; everything marked ⚠ is a decision taken under
uncertainty that the owner can reverse. Status of the build is kept in `docs/norway/STATUS.md`, not here.

The governing question (from the brief): can a learner with zero Norwegian proceed through published Team Norway
texts, in order, and arrive at reading authentic modern Norwegian at roughly B2, with every step reviewed, lawful
and honestly labelled?

## 1. Bokmål-first policy

- **The acquisition spine is contemporary Bokmål under the 2005 norm.** Språkrådet's own pages say the official norms
  apply only to the written language and that there is no official spoken standard (recon 1, A1). The app therefore
  teaches written Bokmål plus a *tagged, non-normative* reference pronunciation. Speech is never labelled "Bokmål".
- **Nynorsk is a distinct written standard, introduced receptively.** It is read in its own collection, counted in its
  own accounts, and never credited to Bokmål mastery.
- **Historical registers are read, never credited as modern.** Riksmål (a living private norm, no official status),
  Dano-Norwegian (pre-1907 Danish-based spelling), Landsmål (pre-1929 Nynorsk) and Høgnorsk are varieties with their
  own labels. An older spelling of a modern word credits the modern lemma through the existing orthography relation
  (German precedent, `src/adapters/german/historical.ts` ✔); the form id stays distinct.
- **Variation inside Bokmål is not error.** `boka/boken`, `kastet/kasta`, `husene/husa`, `sju/syv` are all valid 2005
  forms. The analyzer accepts all; paradigm display picks one canonical (moderate) form and marks the rest
  `variant`, never "wrong".

## 2. Identifiers

| thing | value | basis |
|---|---|---|
| Bokmål | `nb` (`LanguageCode`), display "Norwegian (Bokmål)", locale `nb-NO` | BCP 47; IANA macrolanguage `no` (recon 1, A5) |
| Nynorsk | `nn` (`LanguageCode`), display "Norwegian (Nynorsk)", locale `nn-NO` | same |
| aliases on import | `no`, `nor` → ambiguous; map to `nb` only when the text is known Bokmål-spelled, else flag | recon 1, A5 |
| historical varieties | `nb-riksmal`, `nb-dano`, `nn-landsmal`, `nn-hognorsk` (adapter `varieties` table) | app convention; no standard subtag exists |
| orthography eras | `OrthographyRelation.period` ∈ `nb-pre1907`, `nb-1907`, `nb-1917`, `nb-1938`, `nb-1959`, `nb-1981`; `nn-1901`, `nn-1917`, `nn-1938`, `nn-1959` | reform dates (recon 1, A3) |

**Decision D1 (⚠): `nb` and `nn` are both `LanguageCode`s; there is one course.** Item ids are language-scoped
(`src/core/ids.ts:30-31` ✔, fed by `doc.lang`), so `lemma:nn:eg:PRON` and `lemma:nb:jeg:PRON` never merge and the
form items of shared spellings (`hus`) stay separate too. That is the brief's "independent encounter accounting"
for free. The cost is that a course has a single `lang` (`src/core/model.ts:33` ✔); so the course gains an optional
`readsLangs?: LanguageCode[]` ("companion languages the course also reads"), set to `['nn']` for Norway, honoured by
the bootstrap import, the text page, the library filters and the voice plan. There is no Nynorsk course, no Nynorsk
Stage 0 and no Nynorsk ladder. Both codes are appended **last** in every list so existing order-dependent tests keep
their positions.

**Rejected:** Nynorsk as a variety inside `nb`. It would merge form-level encounters, leave Nynorsk words without a
dictionary (the kaikki mapper rejects other-language entries ✔), break the locale check and the voice plan, and the
only existing variety hook in the evidence fold is the heritage *skip* (`src/golearn/fold.ts:470-473` ✔), which
would zero Nynorsk evidence instead of counting it separately.

## 3. Register model

- Register is data on **analysis candidates** (`register?: RegisterTag[]` ✔ exists), on **works** (`registers` ✔) and
  on **texts** through `CurriculumMetadata.registers` ✔. Norwegian uses the existing tags `standard`, `colloquial`,
  `formal`, `literary`, `archaic`, `historical`, `religious`, `everyday`; no new tag is added.
- **GoTell reads register** (decision D4): the Norwegian `checkProduction` emits the existing error categories
  `dialect` (a Nynorsk form in Bokmål writing, with the Bokmål member of its concept family as the replacement) and
  `register` (a Riksmål or Dano-Norwegian spelling such as *efter*, *nu*, *sprog*, with the modern spelling). Both are
  notes with a replacement, like the Albanian adapter's dialect notes (`src/adapters/albanian/production.ts` ✔). A
  recombination suggestion built from a phrase whose every occurrence is in a text of a historical variety is dropped
  for Norwegian, so the learner is never nudged to write *efter*.
- The reader's word sheet shows the register line and, in the Bokmål course, the Nynorsk family member ("Nynorsk: eg").

## 4. Historical-language model

- A historical text carries `variety` = one of the four historical codes; the adapter's `varieties` table gives each
  a label and a `note`, and the fixed "not used this way today" sentence gets a per-variety override because it is
  false for Riksmål (recon 2, §1 ✔ `src/core/variety.ts:61-74`).
- Token level: spelling relations by period through `OrthographyRelation`, listed pairs at 0.9 and patterns
  (`aa`→`å`, soft→hard consonants, `hv`→`hv`/`kv`, `-ig`/`-lig`, capitalised nouns) at 0.5–0.7, **gated on the modern
  candidate being a known word** (German's rule). The text is never changed.
- Era detection for cataloguing: marker words (`aa`, `efter`, `nu`, `sprog`, `bog`, `gade`, `hvad`, capitalised
  nouns, hard consonants) feed a `norway:audit` guess that a person confirms; the guess is recorded as a guess.

## 5. Concept families (decision D3)

A new, small core contract:

```ts
export interface ConceptFamilyMember { lang: LanguageCode; lemma: string; pos?: PartOfSpeech; register?: RegisterTag[]; note?: string }
export interface ConceptFamily { id: string; meaning: string; members: ConceptFamilyMember[] }
// LanguageAdapter (optional): family?(lemma: string, pos?: PartOfSpeech): ConceptFamily | undefined
```

- Members **never share an item id**. Mastery is never transferred between members.
- Consumers: the word sheet (the other members, labelled by standard and register) and GoLearn's "related item seen"
  (`src/golearn/queries.ts:122` ✔), which gains a distinct `family` signal that is shown but **not credited**.
- `relate()` is unchanged (`jeg`/`eg` stay `'none'`), because `src/gotell/text.ts:62` ✔ treats any non-`none`
  relation as the same word.
- The Norwegian table is the nb↔nn list in recon 1, B10, held as `machine-draft` until a native reviewer confirms it.
  The Hindi register groups (`src/adapters/hindi/registers.ts` ✔) are the data precedent; they are **not** migrated
  in this phase (no change to a shipped course).

## 6. Spoken-variety policy and GoListen metadata

- No official spoken standard exists. Pronunciation data is per `pronVariant` ∈ `east | southwest | west | trond |
  north`; East is the *reference realisation*, never a norm. Tone (1/2/both), the kj/sj merger (not an error) and
  retroflexion are stored per variant when data exists (NB Uttale, CC0, coverage unverified: recon 1, D and E7).
- `AudioImportManifest` gains optional, additive fields (decision D10): `speaker?: { id: string; native?: boolean;
  region?: string; locality?: string; dialect?: string }`, `writtenStandard?: 'nb' | 'nn'`, `spokenTranscript?:
  Array<{ sentenceId: string; spoken: string }>` (what was actually said when it differs from the text, e.g. *e* for
  *ikke*), `alignment?: { unit: 'sentence' | 'phrase' | 'word'; method?: string; confidence?: number }`. Audio is not
  a launch dependency; the Home page already says "No recordings in Norwegian yet".

## 7. Analyzer

- Files: `src/adapters/nb.ts`, `src/adapters/nn.ts`, shared engine in `src/adapters/norwegian/**` parameterised by
  standard. German is the structural model (lexicon files, morphology, compounds, units for particle verbs,
  constructions, historical, varieties, production).
- Scope of the first analyzer: the full function-word inventory (recon 1, B9, and its nn counterparts B10), the
  strong/irregular verb table (B4), noun gender/plural classes with the irregular table (B1), adjective agreement and
  comparison (B2), possessives and reflexives (B3), particle verbs as units (B5), compound splitting into
  lexicon-known parts, marked `unconfirmed` (B6), V2 and subordinate word order as constructions (B7), the learner
  traps as construction keys (B8). Every lexicon entry carries `source` and `reviewStatus`.
- **Measurement, not assertion.** A gold set (`test/adapters/norwegian-gold.test.ts`) written while the analyzer is
  built, and a **fresh holdout** written afterwards by a different agent that did not see the lexicon; both are
  machine-drafted and labelled so until a native reviewer signs them. The measured lemma and POS accuracy on the
  holdout goes into STATUS.md as numbers, with the holdout's own review status beside them.
- Recon 1 Part B is a draft from memory; where it and Norsk ordbank disagree, the lexicon wins. Ordbank, Ordbøkene,
  kaikki and the Språkbanken frequency lists all require downloads that need the owner's approval (§ 10), so the first
  analyzer's lexicon is hand-authored and bounded to Stage 0 + ladder + seed vocabulary.

## 8. Rights (decision D5)

- No new `RightsState` members. The brief's vocabulary maps onto the existing union ✔ (`src/core/course.ts:106`):
  `verified-for-bundling` = `verified-public-domain` or `verified-open-licence`; `permission-granted` = same;
  `project-owned` = `course-authored`; `external-link-only` = `recommended-only`; `blocked` =
  `prohibited-from-bundling`; `unverified` = `rights-unverified`.
- Additive optional fields on `WorkRights`: `licenceName?`, `licenceVersion?`, `attributionText?`,
  `redistribution?: boolean`, and `evidenceRecords?: Array<{ kind: 'publisher-statement' | 'catalogue-entry' |
  'author-death' | 'licence-text' | 'correspondence' | 'statute' | 'other'; url?: string; quote?: string; checkedAt:
  string; by: string; note?: string }>`.
- The gates already exist and are kept: `rights-gate.mts` + the Vite plugin exclude unverified documents from the
  bundle; `library:build` refuses non-verified entries ✔. A Norwegian rights test asserts that every Norwegian work in
  a bundlable state names a human `verifiedBy` and a date, and that no work's state was set by a tool.
- **Every Norwegian work starts as `rights-unverified`** with the evidence recorded. Nothing in this phase marks a
  work verified. "Viewable at nb.no" never implies redistributable (recon 3, §2).

## 9. Scripture (decision D6)

- Bibelselskapet's own page says the 1930 Bokmål and 1938 Nynorsk translations have "falt i det fri" (recon 3, 1a,
  primary). It gives no legal basis, and the sole 1938 reviser died in 1984, so the 1938 claim is in tension with
  life + 70. No digital 1938 text with a licence was found at all. **Neither is treated as verified** until the
  owner has a written answer from Bibelselskapet or a lawyer (questions listed in recon 3).
- Bibel 2011 / 2024 are protected: external link only, never bundled.
- This phase bundles only the three-verse seed excerpt that the corpus contract requires for every language
  (1 John 1:8-9 and John 3:16 as the corpus tests fix them; the 1930 translation for `nb`, the 1921 Studentmållaget translation for `nn`, each read from one web source and labelled so), under quotation right, with state `rights-unverified`
  and the source URL recorded. The rights gate keeps it out of the release bundle until verified. A full Bible needs
  the owner's download approval (SWORD `Norsk` 1930, 1.82 MB; `NorSMB` 1921, 1.72 MB) and its own builder; the
  existing one-edition-per-language limits (`verify-scripture-canon.mjs:43` ✔) are not touched because `nb` and
  `nn` are different languages.

## 10. Corpus policy

- **Acquisition spine** (`stage0` → `a1-1` … `a2-2` → `b1-bridge`): project-authored contemporary controlled Bokmål.
  Every unit is a `machine-draft` requiring native review; review status is stored, never fabricated.
- **Open library** collections (course streams): *Modern* (contemporary open-licence text, attribution or
  share-alike honoured), *Nynorsk* (`nn` texts, receptive), *Heritage* (Dano-Norwegian/Riksmål/Landsmål works,
  labelled by variety and era). All catalogue entries are `rights-unverified` leads until a person verifies them.
- **Downloads that need the owner's approval** (filename, source, size; none performed): Norsk ordbank Bokmål 2005
  (`norsk_ordbank` tar.gz, nb.no/sprakbanken p=30527, size unlisted), Norsk ordbank Nynorsk 2012 (p=31088),
  kaikki Bokmål (`kaikki.org-dictionary-NorwegianBokmål.jsonl`, 83.5 MB), kaikki Nynorsk (63.5 MB), Språkbanken
  unigram frequency lists, NB Uttale, SWORD `Norsk` and `NorSMB`, Åpen Bibel repo (~6.2 MB), Gutenberg Hamsun/Undset
  texts (<1 MB each), Rolfsen *Læsebok* Part 2 (Runeberg), Tatoeba nob/nno exports.

## 11. Curriculum audit and learner simulation

- The existing ladder gate (`ladder:check`) measures coverage, cliffs, new-lemma density, six-unit recycling and
  Scripture share ✔. It gains two **warnings** that apply to every language and fail nothing existing: *orphans*
  (lemmas introduced in the ladder and never met again anywhere later in it) and *recurrence intervals* (the gap
  distribution between a lemma's first and later meetings, with a note when intervals do not widen).
- The ordered learner simulation is the existing simulator (`scripts/simulate-learner.mts`) run for `nb` in preview
  mode; its numbers go into STATUS.md beside the five other courses' figures from `docs/audits/COURSE-AUDIT-2026-10-06.md`.
- `npm run norway:audit` prints the reproducible corpus audit: every Norwegian work with standard, variety, era
  guess, rights state, evidence count, bundlability per the gate, and review status.

## 12. Honest B2 standard

B2 is claimed only when a learner can read authentic modern Bokmål of general content with ≥ 95 % known running
words without help, has been measured doing so on texts not used for teaching, and has reviewed listening evidence.
Until native reviewers, recordings and a level measure exist, STATUS.md says "no" to the governing question and
states what exists instead, exactly as the five other courses' audit does.

## 13. Risk fences for the five shipped courses

- Append `nb`, `nn` last everywhere; one commit for the type change with the fixture updates.
- Shared switches that must stay bit-identical for es/de/sq/hi/th: `rank.ts` `regionalFit`, `candidates.ts`
  historical rule, `assistance.ts` `readingRank`, the language guesser's thresholds, the evidence policy
  (`evidence@8`, no fold change in this phase). Golden tests before any generalisation.
- Build `--require` lists get `nb` only when its content is committed.
