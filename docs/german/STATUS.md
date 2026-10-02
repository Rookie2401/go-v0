# German course — status of record (2026-10-01, after the readiness audit)

**Verdict: a development preview with a working engine, not a course ready for public release, and not a dependable
analyser of arbitrary German.** What is built is a vertical slice of the German course inside the shared GoLearn
architecture. What is missing for a release is content a person has reviewed, an owner's confirmation of the rights
record, and a release gate run on a frozen tree.

Words used here, and kept apart everywhere: **bundled** (in the repository's corpus) · **published** (visible to a
learner without preview mode) · **wording verified** (the text is its source's text) · **rights recorded** (a basis
with its evidence is in the catalogue) · **linguistically correct** (measured only where this document says so) ·
**browser verified** (the journey in section 6 was run).

Design: `docs/GERMAN_COURSE.md`. Rights: `docs/german/RIGHTS.md`. Texts: `docs/german/ACQUISITION.md`. Brief and
package ownership: `docs/PLAN11.md`. This round answers the outside audit of 2026-10-01
(`german-readiness-audit.md`, kept by the owner outside the repository).

## 1. What changed in this round, and why

| Defect the audit named | Root cause | What was changed |
|---|---|---|
| `nicht` reported as a modal particle | the detector accepted every particle with a role except `zu` | a positive test: the chosen reading must be a particle the word list marks as modal (`PARTICLE_KINDS`); negation, the infinitive marker, answer words and focus particles never count |
| `abgeschickt` → invented `abgeschicken`, finite; the perfect lost | the guess knew ge- only at the start of a word | a separable prefix + a real form of a KNOWN verb is read as that separable verb (participle with ge-, zu-infinitive, infinitive, finite), marked unconfirmed, no gloss, the base verb's meaning on its part only; inseparable prefixes never; two-way prefixes without ge- / zu- stay low. The auxiliary of an unconfirmed participle is still an auxiliary |
| No construction for `ist … gebaut worden` | the perfect detector stayed silent on `worden`, the passive detector needed a finite `werden` | `passive-perfect` as its own construction; and `passive-state` (`Die Tür ist geöffnet`) so that sein + the participle of a haben-verb is no longer a false perfect |
| `Der Lehrer …`: article left nominative-or-genitive, verb left 2nd-or-3rd person | agreement ran before the steps that chose among noun readings and never heard of their result | the members of a noun phrase share one set of cells for the whole pipeline; the subject fixes the verb wherever it stands (before it, after an inverted verb, before a clause-final verb, across an inserted clause); a subject shared across a coordination is inherited, never asserted |
| Relative pronoun not agreeing; matrix verb across a relative clause | no antecedent rule; the inserted clause broke the subject search | the relative pronoun takes gender and number (never case) from its antecedent; the matrix clause continues across an inserted clause |
| `bis zur Kirche` read as a conjunction | only "bis + noun phrase" was a preposition | `bis` is a preposition before a noun phrase, time word, number or another preposition; a conjunction only when a verb-final clause follows |
| `Je mehr du liest`: `mehr` as an imperative of `mehren` | an imperative reading was allowed anywhere | an imperative needs the head of its clause; `je` opens a verb-final clause; `je … desto` is a construction |
| `Im Sommer fahren viele Deutsche …` | the subject was looked for only before the verb | see the subject rule above |
| **Genesis 1: `Feste` read confidently as the plural of `Fest`** | `die Feste` fits both words and the first row won at 0.9 | (1) the row `Feste` (f., firmament) exists; (2) an occurrence decided by agreement (`unter der Feste`) decides the others in its sentence; (3) where nothing decides, both readings are capped at 0.45 — below the 0.5 at which the learner model names a lemma — and the word sheet says "possibly". **Result on the five occurrences in the bundled chapter: three are read as `Feste`, two (`Und Gott nannte die Feste Himmel`, `an die Feste des Himmels`) are withheld, with `Fest` still listed first.** The wrong lemma is no longer credited or presented as certain; it is not yet resolved, because the adapter sees one sentence at a time (section 9) |
| Known-limit tests accepted any failure | a listed sentence passed whenever anything failed | each limit records the exact expectations that fail; a further failure, or a recorded one that has gone, fails the test (section 2) |
| A wording verification stood in for rights | the Scripture branch of the gate never consulted the catalogue | section 5 |
| "Transparent" compounds | knowing the parts was called knowing how to read the whole | renamed `partsKnown`; said as an estimate, with a caveat; the whole is never counted as known |

Found in the browser audit of this round and fixed: the word sheet showed a contraction as letters (`im = i + m`,
now `im = in + dem`); a remark about one sentence ("here the case is accusative: an ihn") was stored once per
construction and shown on every other sentence with it; compound parts were shown as letter slices (`Haus +
aufgaben`, now `Haus + Aufgabe`); Home said "No German text is published yet" although Scripture is published.

## 2. Linguistic accuracy: what was measured, and what the numbers mean

All gold sentences and all judgements are the coordinator's — **an AI model, not a native speaker; standard school
grammar; nothing was reviewed by a person.** Each round states its provenance in its own file
(`data/benchmarks/de/gold*.json`). A sentence is *correct* when every stated expectation on it holds; a *stated
fact* is one expectation (a lemma, a part of speech, one feature, one construction).

| Round | What it is | First run (unseen) | Now | Standing |
|---|---|---|---|---|
| 1 — `gold.json`, 84 sentences | written before the adapter existed | not recorded as such (80 of 84 on the day the adapter landed) | 84 of 84 · 642 of 642 facts | development data: the packages ran it while fixing |
| 2 — `gold-2.json`, 35 sentences | written after the adapter landed | **25 of 35** | 35 of 35 · 456 of 456 facts | development data since its first run. Two expectations were corrected, each recorded in the file (`passive-perfect` as the key; `spielten` no longer required to be certainly indicative) |
| 3 — `gold-3.json`, 48 sentences: 35 written by the coordinator on new vocabulary, 13 unchanged from Kafka's *Die Verwandlung* | written while the audit fixes were made, kept outside the repository | **39 of 48** — 32 of 35 on the coordinator's own sentences, **7 of 13 on Kafka**; 706 of 730 facts | 46 of 48 · 728 of 730 facts | development data since its first run |
| 4 — `gold-4.json`, 21 whole sentences of Kafka (the next two pages) | written during the last fix batch, kept outside the repository, run once after it | **13 of 21 sentences (61.9 %) · 377 of 393 facts (95.9 %)** | the same: **nothing was fixed after this run** | the only figure in this document for German the adapter was not tuned on |

Baseline of this round, before any fix (commit `f0a057c`): round 1 84 of 84, round 2 25 of 35, the ten failures
exactly as the audit lists them.

**How to read this.** Rounds 1–3 at or near 100 % say that the adapter was fitted to those sentences. The
generalisation signal is the first-run column: about nine in ten of the coordinator's own new sentences, and
**about six in ten sentences of real literary prose** fully right, with roughly 96 % of the individual facts
checked on that prose. The facts checked are the ones the coordinator chose to state: the figure is not a
token-level accuracy over every word. The sets are small, by one judge, and the prose is one author of 1915.

**What still fails** (`data/benchmarks/de/known-limits.json`, each with its reason and the exact failing
expectations; `npx vite-node scripts/de-gold.mts` prints them):

- Round 3: `Pult` is not in the word list (gender honestly left open); an `als`-clause at the end of a very long
  sentence is not recorded as verb-final.
- Round 4 (eight sentences): a relative clause after a separated prefix is not recorded; the object of a
  sentence-initial zu-infinitive is **asserted** nominative (`Die Decke abzuwerfen war …`); `vom Bett aus` is read
  as the verb `aussehen` — **a confident wrong lemma**; `gewiß` (pre-1996 spelling) gets **no reading at all**; a
  subject is not inherited across a long inserted phrase; the last infinitive of a chain under one modal is read as
  finite; a genitive attribute inside a subordinate clause stays dative-or-genitive and `der Reisenden` lacks its
  plural reading; `in diesem Falle` gets the lemma `Falle`; `um den einzuholen` is not recorded as um … zu.

**What a green test run means.** `test/integration/german-gold.test.ts` passes while every known limit fails
exactly as recorded. It fails when a new failure appears on a listed sentence, when a recorded failure has gone
(the record must be updated), or when a listed sentence has become correct (the entry must be removed). It prints
the correctness per round apart from the number of known limits. A green run is "nothing changed against the
record", never "all sentences are correct".

### Recognition coverage — and what it is not

| Bundled texts | Word tokens | With a confirmed reading |
|---|---|---|
| Weg 1–3 | 3,089 | 100.0 % |
| Deutschland — Lesungen | 682 | 100.0 % |
| Gespräche | 650 | 100.0 % |
| two older seed texts | 119 | 100.0 % |
| Luther 1912 slice | 1,401 | 99.9 % |
| two Grimm tales | 520 | 96.7 % |

- A word counts when **any** of its candidate readings is not marked unconfirmed — not when the first reading is
  right, not when the meaning fits the sentence.
- "Confirmed" means the machine-drafted word list or a rule vouches for it. Nobody independent has verified the
  list. The `Feste` case (section 1) is a confirmed reading that was the wrong word.
- Coverage is **not** lemma accuracy, morphology accuracy, construction accuracy or comprehension.
- These are the texts the word list was extended for. They say nothing about arbitrary native prose: on Kafka
  (round 4) eight of 21 sentences had at least one wrong or missing fact, among them a word with no reading at all.
- "0 findings of the writing checks on the 508 bundled course sentences" is a low rate of false alarms on that
  sample. It does not measure how many real mistakes the checks would find (recall), and the sentences themselves
  are unreviewed.
- "Every generated form analyses back to its lemma" is a consistency check of the engine against its own
  paradigms, not a validation of those paradigms.

## 3. Implemented

- **Course**: `germany-de`, target de-DE; streams, shelves (never locks), doors, catalogue of 76 works with rights
  states (`src/course/german.ts`).
- **Adapter** `adapter-de@5` (`src/adapters/de.ts`, `src/adapters/german/**`): tokenizer and sentence splitting;
  word-form engine (nouns with gender, case and number as sets; three adjective declensions; strong, mixed, separable
  and irregular verbs); a word list of **1,287 nouns, 824 verbs, 312 adjectives** plus closed classes and about 590
  course rows — **all machine-drafted, none reviewed by a native speaker**; a sentence layer (agreement, government,
  subject, clauses, separated verbs as one lexical unit, compounds from known words with the linking element,
  contractions, auxiliaries and their roles, mood by context, homograph nouns withheld when undecidable); older
  spelling as a relation (the text is never changed); **38 constructions** and 213 phrase rules; rule checks on a
  learner's own German (auxiliary, case after a preposition, subject and verb, word order, capitals, spelling …).
  No statistical parser, no model.
- **Shared engines** (language-neutral): one encounter per lexical unit; compounds by parts (an estimate); search
  across spellings; text features; word-sheet lines for units, compound parts, contractions and older spelling.
- **Plain-text import** recognises German chapter headings (`Kapitel 1`, `Erstes Kapitel`, `1. Kapitel`).
- **Speed** (`scripts/probe-de-speed.mts`, 6,461 words): cold 0.05 ms per word, warm 0.015 ms per word; analysis
  happens at import, not while reading.

## 4. Corpus: bundled is not published

| | Documents | Words | Rights | Published |
|---|---|---|---|---|
| Lutherbibel 1912: Genesis 1, Psalm 1, Psalm 23, Matthew 1, 1 John 1:8–9 + John 3:16 | 5 | 1,401 (71 verses) | public domain as recorded (section 5) | **yes** — wording verified against the source |
| Weg 1–3, Gespräche 1, Deutschland — Lesungen 1 | 32 | 4,421 | written for the course | **no** — machine-drafted, awaiting a native speaker's review |
| two older seed texts | 2 | 119 | written for the course | **no** — the same |
| Grimm, *Die Sternthaler*, *Der süße Brei* (1857) | 2 | 520 | public domain; transcription CC BY-SA 4.0 | **no** — the German is verified against the source, the English lines are machine-drafted and unread |

So what a learner sees without preview mode is **71 verses of a 1912 Bible** — no modern acquisition path, no
reading ladder. No review record was created or simulated: the one "review" in the tests
(`syntheticallyReviewed`) exists only inside `test/integration/german-course.test.ts` to exercise the published
path and never touches a bundled file.

Catalogue: 5 course works and 3 verified works bundled; 61 candidates with unverified rights; 7 recommendations
(in copyright: the learner's own copy only). This is the committed state — see section 8 for uncommitted changes by
another agent.

## 5. Rights

Three facts, kept apart by the machine (`src/ingest/rights.ts`, `npm run rights:check`):

1. **Wording verified** — the bundled verse is the source's verse. Source fidelity; says nothing about rights.
2. **Rights recorded** — the catalogue work states who established the rights state, when, and on what evidence.
   A Scripture text that names its work is now held to this record; verified wording alone no longer bundles it.
3. **Jurisdictions recorded** — a status per jurisdiction. A build or report that names where it is released
   (`GO_RELEASE_JURISDICTIONS=US,DE,EU`, `rights:check --release US,DE,EU`) leaves out any public-domain or licensed
   text without a recorded basis for each. Without a release list the build makes no claim about where it may be
   distributed and says so.

`rights:check` today: German 41 documents bundled, 0 left out, 0 refused, with and without `--release US,DE,EU`.
**"OK" means the records are present and consistent. It is not legal clearance.**

**Luther 1912 in Germany and the EU.** A basis is now recorded with its evidence (`docs/german/RIGHTS.md` 1.1):
the publisher of the Luther Bible claims copyright only in its own digital edition; a third party reports the
Deutsche Bibelgesellschaft's licensing department confirming in 2014 that the text is free; the revision was
published without named revisers, for which the term is 70 years from publication. **Not established from a primary
source:** a written statement of the Deutsche Bibelgesellschaft, and the revisers' names and death dates. The
record was made by an AI model and is not legal advice. It stays an open point for the owner (section 7).

Unchanged and enforced: canonical historical text is never altered; editions, translations and recordings carry
separate rights; recommendations and a learner's own copies are never bundled; no audio is bundled; attribution
and licence are shown where a text is read (verified in the browser for Scripture and Grimm).

## 6. Verification actually run in this round

| Check | State tested | Result |
|---|---|---|
| Baseline gold sets and 28 targeted test files | `f0a057c`, before any fix | 1,562 tests passed; rounds as in section 2 |
| German-targeted tests (26 files) | `62c76b1` + working tree | 1,788 passed, 2 failed — neither German code: one Spanish test (another session's uncommitted `es.ts`), one German catalogue test failing on **another agent's uncommitted edit of `src/course/german.ts`** (section 8) |
| Whole suite, once, announced to the other sessions | `a49a8bd` + working tree | 288 files: 8,615 passed, 6 failed, **none German** (Scripture record changed by another agent; two corpus CLI tests; two Hindi catalogue tests; one Albanian speech test) |
| Type check `tsc -b` | `62c76b1` + working tree | fails on two files of another session (`src/adapters/es.ts`, `scripts/probe-es-book.mts`); no German file |
| `npm run rights:check`, with and without `--release US,DE,EU` | working tree | OK; German 41 bundled |
| Production build in the shared working tree | — | **not run**: its first step is the type check, which fails there on another session's uncommitted files |
| Clean checkout of the final German commit | `cd8ce97` | type check, whole suite (8,615 tests), rights check and production build **all pass** — see "Release-candidate check" below |

**Browser audit** (sandbox databases; a dev server without hot reload at commit `62c76b1`, because five writers
were saving files): course selection and onboarding ("You will be learning German" → texts prepared → Home);
preview off shows only Scripture, preview on lists every unreviewed text with its reason and a banner on every
screen; reader and word sheet on Psalm 23, Genesis 1, a course text, a Grimm tale; a separated verb (`steht … auf`:
both pieces marked, "steht … auf = aufstehen", role of each piece); contractions; compounds with the linking
element and the head; older spelling (`daß` → dass, `gieng` → ging) with the period named and the text unchanged;
one vocabulary entry for `Haus` met in a story and `Hause` met in Psalm 23 ("met twice in 2 texts"); a learner's
own book from a `.txt` with `Erstes Kapitel` / `Zweites Kapitel. Der Brief` (two chapters found, imported as "Your
copy"); testimony writing (starts empty; wrong auxiliary, case after `mit`, capital, word order after `weil`,
subject–verb agreement each found with a suggestion; correct German gets "Nothing to suggest", with the caveat
that this is no guarantee); source line and "Licence and source" on Scripture and Grimm.

Not covered in the browser: an adjacent (unseparated) lexical unit — German has none in the bundled texts (the
display rule is unit-tested); EPUB import in German; a learner switching teams; anything on a phone-sized screen.

Observed and **not** fixed: on the Read page in preview the works are listed Weg 2, Gespräche, Deutschland, Weg 3,
Weg 1 (order not investigated); the stranded prefix of a separated verb is labelled "preposition" as its part of
speech beside the correct unit line; with the German dictionary present (section 8) `renoviert` in a passive
sentence of an imported book was shown as "possibly renovated — adjective".

### Release-candidate check (a clean checkout of one commit)

Because the shared working tree never holds still, commit **`cd8ce97`** (this document's first version; every German
change of the round is in it) was checked out by itself, with nothing uncommitted and no dictionary, and the release
steps were run there on 2026-10-01:

| Step | Result at `cd8ce97` |
|---|---|
| `tsc -b` | passes |
| `npx vitest run` (whole suite) | **286 files, 8,615 tests, all passed** |
| `npm run rights:check` | OK: 129 documents, 127 bundled, 2 left out, 0 refused; German 41 bundled |
| `npm run rights:check -- --release US,DE,EU` | OK: 126 bundled, 3 left out; German 41 bundled |
| `npm run build` (type check, rights check, dictionary status, production bundle) | passes; 2 documents left out by the rights gate (Albanian and Thai Scripture samples, rights unverified); bundle 2,710 kB (gzip 795 kB) in one chunk |
| the same build with `GO_RELEASE_JURISDICTIONS=US,DE,EU` | passes; 3 documents left out (also the Spanish Scripture sample: no catalogue work records a basis); every German document stays |

This is a reproducible sign-off **of the software at that commit**: it builds and its tests pass. It is not a sign-off
of the German course for release (section 7), and it says nothing about the uncommitted changes of section 8. The
browser audit ran at `62c76b1`; the only later German changes are documents. The bundle is one large file holding every
language's word list and course texts: splitting it by language is outstanding for all courses.

## 7. Blockers to a public release

1. **No reviewed modern content.** 32 course texts, 2 seed texts and the English lines of 2 Grimm tales await a
   person. Until then the public course is 71 Bible verses.
2. **The rights record is an AI model's.** The owner must confirm Luther 1912 for Germany / EU — ideally with one
   written line from the Deutsche Bibelgesellschaft — and the Grimm record, before distribution.
3. **The release gate passes only on a clean checkout of one commit** (`cd8ce97`, section 6), not on the shared
   working tree, where other writers' uncommitted changes break the type check and several tests. A release must be
   cut from an identified commit, and the browser journey repeated on that build.
4. **The word list and the gold judgements are unreviewed.** Every explanation a learner reads rests on a
   machine-drafted list.

## 8. Things in the working tree that are not this session's

- **A German dictionary was downloaded and built by another agent** (`data/dictionaries/kaikki.org-dictionary-German.jsonl.gz`,
  98,334,006 bytes, 20:43 on 2026-10-01; `public/dict/de`, 357,750 entries, 512 shards, about 40 MB; Wiktionary via
  kaikki.org, CC BY-SA 4.0). This session did not download it and had no authorization to. Effect as the code
  stands: the bundled texts are analysed without it; **a learner's own imported book is analysed with it** (a word
  the adapter only guesses is decided by the dictionary, with the dictionary named on the word sheet). That path is
  **not evaluated for German**; one wrong choice was seen in the browser (section 6). A production build made now
  would ship it.
- **`src/course/german.ts` carries uncommitted edits by an agent none of the four coordinating sessions can see**:
  some thirty works marked `verified-public-domain` on a United-States-only Project Gutenberg basis, without the
  evidence fields the German brief requires (jurisdictions, modifications, compliance), and
  `data/sources/de-prose/` holds downloaded texts of which three (`bechstein-maerchenbuch.txt`, `grimm-khm.txt`,
  `hauff-maerchen.txt`) are byte-identical. This session did not make, review or commit those changes; the German
  rights test fails on them in the working tree, as it should. With a release list that includes DE or EU the
  jurisdiction gate would leave such works out.

## 9. Known limitations (medium risk)

- **One sentence at a time.** The adapter cannot use the rest of the text: the two withheld `Feste` in Genesis 1
  would need "one sense per text", which belongs in the importer (not built).
- **Open reading rests on a small list.** Outside the list a word gets a guess marked unconfirmed, or — for a
  learner's own book — the dictionary's reading, unevaluated.
- **Confident errors exist** (round 4: `aussehen` for `sah … aus` in `vom Bett aus`; a case asserted wrongly).
- **A compound whose parts are known is treated as probably readable.** That is an estimate from its parts; a
  lexicalised compound may not mean what they suggest. It is said as an estimate and never counted as known.
- **A word with two nominatives** (`Friede` / `Frieden`) needs the row tag `[same: …]`; others may exist unmarked.
- **The state passive** is recognised only for verbs the list gives with `haben` alone.
- **The writing checks** have limited coverage and say so; a sentence with no finding may still be wrong.

## 10. Documentation and process debt

- Round 1 of the gold set was described as an independent check; it is development data (`docs/PLAN11.md`, note
  added).
- The first-run figures are the coordinator's; an independent, native-reviewed evaluation does not exist. The
  Universal Dependencies German treebanks would give human judgements; using them needs the owner's permission for
  the download and a licence check.
- Four writers and one unseen agent share one working tree; a release candidate needs its own checkout.
- `docs/READINESS.md`, `docs/GERMAN_COURSE.md` and `docs/german/RIGHTS.md` were corrected in this round; the
  ARCHITECTURE and README documents still describe German in one line each.

## 11. Next actions

1. A native speaker reviews Weg 1 (8 texts) and the Grimm English lines: the first modern published content.
2. The owner confirms or restricts the Luther record; decides what to do with the dictionary and the Gutenberg
   catalogue changes of section 8.
3. Fix the round-4 failures as rules (circumposition `von … aus`; a reading for every older spelling; objects of a
   fronted infinitive clause; genitive attributes inside subordinate clauses), then write and run a round 5 unseen.
4. "One sense per text" in the importer, for homographs a sentence cannot decide.
5. Evaluate the dictionary path on German before a learner's own books are advertised as supported.
