# Albanian contextual syntax (Linguistic Engine V2, Stage 4)

`sqAdapter.syntax(tokens, analyses)` returns shallow dependency relations for one sentence, from the adapter's own readings, with a
plain-words basis for each relation and the readings it could not rule out. It is rule-based, deterministic, and has no parser behind
it. All rules are machine-drafted; **no native speaker has checked them**. The contract is `src/core/syntax.ts`; the code is
`src/adapters/albanian/syntax.ts` (clauses), `syntax-np.ts` (noun phrases) and `syntax-core.ts` (word classes, the one place a
relation is recorded). Probe: `npx vite-node scripts/probe-syntax-sq.mts [--limit N] [--errors N] [--no-ud]`. Tests:
`test/adapters/albanian-syntax.test.ts`.

## What is modelled

Labels follow Universal Dependencies, subtypes dropped (the contract has no `parataxis`: a second main clause after a comma or a dash is
`dep`, explained in its `label`). A fused short-pronoun cluster (`ma`, `ia`, `ta`) is one token and gets the relation of its first part,
with the second part named in an alternative.

| Relation | What the rule looks at (the `basis` says it in words) |
| --- | --- |
| `root` | the first verb that is not introduced by a subordinating word or an "and"; the predicate of a copular clause; with no verb at all, the first noun phrase / interjection |
| `cop`, predicate | `jam` + an adjective (article + adjective, or a bare one), an adverb, the noun of a prepositional phrase, or a noun phrase: the predicate is the clause head. A question word before `jam` (kush, çfarë, ku, si) is the predicate and the noun after it the subject |
| `nsubj` | a noun phrase that can be nominative and **agrees** with the finite verb in person and number (a noun is third person; a coordination is plural). A definite nominative is the subject wherever it stands; a first / second person pronoun after the verb is still the subject; an indefinite noun (nominative = accusative) is the subject only before the verb, or after a verb on a short list of subject-after verbs (bie, vij, ndodh …) |
| `obj` | the first accusative noun phrase that is not the subject; a short accusative pronoun with no noun repeating it |
| `iobj` | a noun in the dative form with no preposition; a short dative pronoun with no noun repeating it; `më / të / na / ju` when the clause already has an object noun |
| `expl` | a short pronoun that only repeats a noun of the clause (clitic doubling), the non-active `u` |
| `obl`, `case` | a preposition directly before its noun phrase (`case`, with the governed case in the basis); the phrase goes to the verb, or to the predicate of a copular clause; a fronted accusative before the subject, `çdo` + noun, and a second accusative are adverbials |
| `det`, `amod`, `nmod`, `nummod` | `një`, numbers, demonstratives, `të` before a noun ("të dielën"); the linking article `i / e / të / së` + adjective after the noun (`amod` on the noun it **agrees with in gender and number**, `det` on the adjective); a genitive noun with its article (`nmod` on the possessed noun); a possessive (`im`, `juaj`, `e tij`) is a `det`; a bare adjective right after a noun |
| `aux`, `mark`, `xcomp`, `ccomp` | `kam / jam` + participle (the participle is the head); `të`, `do`, `po`, `duke`, `pa`, `me` before a verb are `mark`; a verb after `të` completes the verb before it (`xcomp` for dua, mund, filloj …, `ccomp` for others, `advcl` for `për të + verb`) |
| `advcl`, `acl`, `conj`, `cc` | a clause opened by se / që / sepse / kur / sa / nëse / "në qoftë se" is attached to the clause before it (or, if it comes first, to the main clause after it) by its marker: `se` → `ccomp`, `që` after a noun → `acl`, the others `advcl`; "and / but" between two verbs, nouns or adjectives coordinates them, the second attached to the first |
| `advmod`, `discourse`, `vocative`, `appos`, `fixed`, `punct` | adverbs (before an adjective they modify it), `nuk / mos`, `edhe`; interjections, `a`, yes / no; a lone proper or indefinite noun between commas is a `vocative`, or an `appos` right after a noun phrase; "në qoftë se" is `fixed`; punctuation goes to the head of the clause it closes |

### Where the forms or the order cannot decide, both readings stay

Every relation has `alternatives` where another reading is possible, with a `why`. `status` is `conflicted` when an alternative has
confidence 0.3 or more (a genuinely open case), `generated` otherwise (a remote possibility is listed but the relation stands).
On the 218 course sentences, 14.2 % of relations carry an alternative and 7.2 % are `conflicted`.

* an indefinite noun after the verb: `obj` with `nsubj` as the alternative (and the reverse on a before-the-verb subject that could be an object);
* two nouns an article agrees with (a genitive chain: "librin e vëllait të madh"): the nearest, the other kept (`conflicted`);
* `më / të / na / ju` (accusative or dative), `i` (dative singular or accusative plural), the first part of a fused cluster;
* two nouns on either side of "to be" ("Motra e Benit është Ana"): the order decides; the other order is on both nouns (`conflicted`);
* `se` (complement or reason), `që` (relative or complement), `xcomp` / `ccomp` after të, `vocative` / `appos`, a prepositional phrase that could modify the noun before it.

### Words with no relation

A word with no reading in the adapter (not in the word list, and no guess from its ending) gets **no relation** and a line in `notes`;
`attached` is the share of word tokens with a relation. A reading guessed from the ending is used, its relations capped at 0.5 with a basis
line saying so.

## Not modelled

* no parser: no long-distance dependencies, no scope; a sentence of more than 45 words gets a note;
* relative clauses are found only when `që` follows a noun; `i cili / e cila`, `ku`, `kur` relatives are not;
* a genitive noun without the linking article ("kohën e tij" is covered; a bare genitive after a noun is not), adjectives before the noun except article + adjective, nominalised adjectives other than article + adjective ("e vërteta");
* verb valency: nothing says which verbs take an object, so a bare accusative after any verb is `obj` (a fronted one is `obl`); `quhem` + name is the one coded exception;
* comparatives, superlatives, `duke` clauses beyond the marker, the admirative, `kush ... të` constructions, ellipsis, right dislocation, topicalised objects without a doubling pronoun;
* PP attachment is always to the verb or the predicate (the noun is listed as an alternative only);
* a speech tag ("— thotë Marku") is a `dep` of the quote, or the quote a `dep` of the tag when the quote has no verb;
* numerals and digits, abbreviations, Gheg and pre-standard forms beyond what the sentence layer already relates to Standard.

## Measured

`npx vite-node scripts/probe-syntax-sq.mts`, 2026-10-10:

| | |
| --- | --- |
| course texts (`data/corpus/sq`) | 218 sentences, 1034 word tokens |
| word tokens with a relation | 100.0 % (no sentence has an unattached word) |
| relations with an alternative / `conflicted` | 14.2 % / 7.2 % of 1034 |
| time of `syntax()`, analysis excluded | 0.042 ms per sentence, 0.18 ms per 20 words (warm; limit 2 ms) |
| gold set `data/gold/sq/syntax-dev.json` (107 sentences, 576 words) | **UAS 100.0 %, LAS 99.7 %**, root 100.0 % |
| UD Albanian-STAF (dev + test + train) | 145 sentences, 1902 words: UAS 51.9 %, LAS 41.8 %, root 69.0 % |
| UD Albanian-TSA (test) | 54 sentences, 760 words: UAS 55.0 %, LAS 48.8 %, root 74.1 % |
| **UD, both, aligned** | **199 sentences, 2662 words: UAS 52.8 %, LAS 43.8 %**, root 70.4 %, 18.2 % of words with no relation |

Relations in the course texts: root 21 %, nsubj 16 %, det 9.5 %, obj 8.5 %, cop 8 %, case 6 %, advmod 6 %, obl 4 %, mark 3 %, expl 2.5 %, cc 2 %, conj 2 %, discourse 2 %, iobj 1.5 %, xcomp 1.5 %, dep 1.4 %, amod 1.2 %, vocative 1.1 %, the rest under 1 %.

**How to read the two accuracy figures.** The gold set is the *course texts* (A1 to A2 sentences), labelled by Claude from the grammar
(UD conventions of the two Albanian treebanks) **before** looking at the rules' output, and then used while the rules were developed: it
is a regression set, not an estimate of accuracy. Its labels are unreviewed (no native speaker). The Universal Dependencies treebanks
(`data/research/ud`, comparison only, never bundled) are literary prose the rules were not built on, so 52.8 / 43.8 is the independent
number. Read it with two caveats: (1) 18 % of the treebank words are words the adapter has no reading for (the word list is a seed), and
those correctly get no relation, which counts as wrong here; (2) 61 of 260 treebank sentences are skipped because a fused clitic is written
as two words in the treebank or the tokenization differs. On the words that do have a relation, the head is right about 65 % of the time. By relation
on the treebank (labelled right): case 60 %, det 54 %, root 70 %, mark 48 %, obj 50 %, obl 44 %, nsubj 39 %, cop 42 %, amod 29 %, nmod 25 %,
conj 12 %, advcl 12 %, acl 11 %. Prose sentences with long coordinations, subordinate chains and bare genitives are where the rules fail.

Floors in the test file are the measured values rounded down: gold UAS ≥ 99 %, LAS ≥ 98 %; treebank UAS ≥ 50 %, LAS ≥ 41 %, unattached ≤ 22 %.

## Conventions and choices a reviewer should know

* The article of "e madhe / i ri" is a `det` of the adjective and the adjective an `amod` of the noun (as in the treebanks); a predicate
  adjective is the clause head with `cop`.
* A genitive noun is `nmod` of the possessed noun and carries the article as `det`. Possessives are `det` (the treebanks mix `det:poss` and `nmod:poss`).
* A doubled short pronoun is `expl` (as in the treebanks); the noun it repeats is the `obj` / `iobj`.
* Subjects of a `të` chain attach to the first verb; objects to the verb they stand next to.
* "Unattached words get no relation": the share of such words is in `attached`; a card should say "role unknown" for them.

## Known wrong cases

Rule limits (the first four are in the gold set):

* `i fal të gjithë` ("forgives everyone"): `i` is read as dative singular (`iobj`); the object `gjithë` is plural but has no number, so the accusative-plural reading (clitic doubling) is not taken.
* `nuk mendon më për shiun`: `më` (any more) is read by the sentence layer as a short pronoun and becomes `obj` (see engine bugs).
* `Ecën një burrë` (a man walks): a post-verbal indefinite noun is `obj` (with `nsubj` as the alternative) unless the verb is on the short subject-after list (bie, vij, dal …); `Bie shi` is right only because `bie` is on it.
* Relative clauses introduced by `që` right after a verb ("Gëzohem që …") are `ccomp`, with `advcl` as the alternative; "so that" readings are not told apart.
* `dhe` between two adverbs is not coordination (the second adverb is attached to the verb); a `duke` / `pa` / `me` clause is always attached to the verb before it, never to a noun.

Engine (sentence layer / word list) bugs found while writing the rules; the syntax works around the first three and does not change them:

1. `kisha` (I had / the church), and any form read as a noun with a verb reading of the same weight: the noun is ranked first. Worked around only when the clause has no verb at all.
2. `të` as the first word of the sentence ("Të dua") and `të mos humbasë`: ranked as particle / pronoun the wrong way; worked around for these two shapes.
3. `herët` (early) is read as a noun (`herë`, plural); `Beni zgjohet herët` gets `herët` as `obj`.
4. `më` (any more / more) before a preposition is ranked as the short pronoun.
5. `vërteta` in "e vërteta" is read as a plural feminine adjective, so the number is wrong; the syntax drops the number of such a noun-like unit.
6. Two readings of the same weight for names (`Marku` = nominative, and a genitive-dative `Mark`) leave a name that is certainly a subject looking ambiguous; the rules take "can be a nominative and cannot be an accusative" as a subject.
7. `Ana` has the readings Ana (name) and anë (side); harmless here.
