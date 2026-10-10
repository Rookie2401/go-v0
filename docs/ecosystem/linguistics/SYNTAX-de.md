# German contextual syntax (Linguistic Engine V2, Stage 4)

`deAdapter.syntax(tokens, analyses)` returns shallow dependency relations for one sentence, from the adapter's own readings (lemma,
part of speech, case / gender / number sets, finite or not, the separable-verb units), with a plain-words basis for each relation and
the readings it could not rule out. It is rule-based, deterministic, and has no parser behind it. All rules are machine-drafted;
**no native speaker has checked them or the gold labels**. The contract is `src/core/syntax.ts`; the code is
`src/adapters/german/syntax.ts`; the analyzer name is `syntax-de@1`. Probe:
`npx tsx scripts/probe-syntax-de.mts [--limit N] [--show K] [--worst K] [--unattached K] [--only SUBSTR] [--skip A,B] [--gold-only]`.
Tests: `test/adapters/german-syntax.test.ts`. Gold: `data/gold/de/syntax-dev.json`, `syntax-heldout.json`, `syntax-unseen.json`.

## What is modelled

Labels are Universal Dependencies labels. The contract has no `parataxis`, so a second main clause that follows without a joining word is
a `conj` of the first (its `label` says "further clause"); a loose phrase with no verb is `dep`. Decisions that are conventions, not
facts, and are the same in the gold files: a **modal verb heads its infinitive** (`xcomp`; the subject hangs on the modal, objects and
adverbials on the infinitive); `sein` / `werden` with no other verb is the **copula** (`cop`) of its predicate, which is the head of the
clause; `haben` / `sein` / `werden` + participle or infinitive is `aux` on the participle / infinitive; the separable prefix is `compound`;
in a coordination the first member is the head and `cc` hangs on the second; a quotation after a colon is a `ccomp` of the verb of saying.

| Relation | What the rule looks at (the `basis` says it in words) |
| --- | --- |
| `root` | the finite verb of the first main clause (verb second or first); the predicate when the verb is only a copula; the participle / infinitive that carries the meaning when the finite verb is an auxiliary; with no verb at all, the first noun phrase or word (conf 0.5) |
| `nsubj` | a noun phrase that can be **nominative and agrees** with the finite verb in person and number (a noun is third person; `X und Y` is plural; the polite `Sie` takes a plural verb; a pronoun with several readings offers each). With two candidates the clearer nominative wins (`er`, `der Mann`: nominative only), then the first in the sentence. A coordinated clause that opens with its verb (`und trinkt das Wasser`) shares the subject, so a following syncretic noun is not taken as subject. A noun whose first reading excludes the nominative but has a nominative reading that agrees (`Bauern`) is used at confidence 0.55 |
| `obj`, `iobj`, `expl`, `obl` (bare) | accusative → `obj`; dative → `iobj`; with an ambiguous name or noun, a dative-taking verb (lexicon `[dat]`), or another noun phrase that can only be the accusative object (`gibt Anna die Blumen`), decides for the dative; a second accusative is `obj` with status `conflicted`; `sich` and a reflexive pronoun of a reflexive verb are `expl`; an accusative time noun (`jeden Tag`) and a lone genitive (`eines Tages`) are `obl` |
| `obl`, `case` | a preposition directly before its noun phrase is `case` (the governed case, the contraction `im = in + dem`, and for a **two-way preposition the case of the phrase decides**: dative = location, "where?", accusative = direction, "where to?" — said in the basis; when the case is not narrowed both stay open). The phrase hangs on the verb, or on the noun in front of it: before the finite verb (the one position in front of it) always; `von` and `mit` + a bare noun after a noun (`Tee mit Honig`); a place phrase after a place phrase (`in einer Stadt in Deutschland`). Otherwise `obl` of the verb, with the noun as an alternative (conf 0.35) |
| `det`, `amod`, `nummod`, `nmod`, `flat` | an article / possessive / demonstrative before the noun, with **case, gender, number agreement** as the basis (or "do not agree", status `conflicted`); an adjective with an ending before a noun (`amod`; `große und kleine Hunde`: the second hangs on the first); a number; a genitive noun phrase right behind a noun (`des Mannes`; `der Frau` = dative or genitive keeps `iobj` as an alternative); `Pauls Handy`; `ein Glas Wasser`; a title and a name (`Frau Weber`) |
| `aux`, `xcomp`, `mark`, `compound` | haben / sein + participle, werden + participle (passive) or infinitive (future); a modal or a verb like `gehen`, `lassen`, `fangen … an` + a bare infinitive; `zu` + infinitive (`zu` is `mark` on the infinitive; a verb with `zu` inside, `aufzustehen`, has none); **the prefix of a separable verb** is `compound` of the verb, label "separable prefix", the unit (`aufstehen`, `steht … auf`) as the basis; a lone separable prefix at the end of a clause for a verb the list does not hold as a unit is a guess (conf 0.5) |
| `ccomp`, `advcl`, `acl`, `mark`, `cc`, `conj` | a clause opened by `dass` / `ob` / a question word and ending in its verb is `ccomp` of the (lowest) verb before it; `weil / wenn / als / obwohl / damit / bevor / nachdem / während …` is `advcl`, also when it stands first (it hangs on the main clause after it); `um / ohne … zu` is `advcl`; a bare `zu` clause is `xcomp`, or `acl` after a noun (`keine Zeit, ein Buch zu lesen`, alternative `xcomp`); a clause opened by `der / die / das` (or preposition + relative pronoun) and ending in its verb is `acl` of the nearest noun the pronoun agrees with in gender and number; `und / oder / aber / denn` between clauses with finite verbs starts a coordinated clause (`conj` + `cc`); between phrases, adjectives, adverbs, infinitives it coordinates those |
| `advmod`, `discourse`, `vocative` | adverbs (an intensifier before an adjective or adverb modifies it; `nur / etwa / erst` + a phrase modify the phrase); the negation `nicht`; modal particles (`doch`, `halt`, `mal`, `wohl`) and greetings are `discourse`; a name on its own between commas / marks, with no article, is `vocative` (a bare noun right behind another noun is a list item instead) |
| `punct` | the head of the clause that follows (a comma), precedes (a closing mark), or the root (the final stop) |

### Where the forms or the order cannot decide, both readings stay

Every relation that has a second reading more than a remote possibility (confidence 0.3 or more) carries it in `alternatives` with a `why`
and has status `conflicted`, which the card prints as "‼ not decided". 8.1 % of the relations on the course texts carry an alternative.

* **Nominative / accusative syncretism**: `Die Frau sieht die Tochter` — both noun phrases are nominative-or-accusative, so `Frau` is `nsubj`
  (first in the sentence, conf 0.7) with `obj` as an alternative, and `Tochter` is `obj` with `nsubj` as an alternative. A clear case
  (`Den Mann sieht die Frau`, `Der Mann liest das Buch`) keeps none.
* a name with no case marking after a verb: `obj` with `iobj` as an alternative, and the reverse;
* a prepositional phrase after a noun: `obl` of the verb with `nmod` of the noun as an alternative (or the other way round);
* `der / die` after a noun: genitive attribute with the dative object as an alternative; a relative pronoun that agrees with two nouns before the comma;
* a zu-infinitive clause after a noun: `acl` of the noun with `xcomp` of the verb as an alternative.

### Words with no relation

A word with no reading in the adapter gets **no relation** and a line in `notes`; `attached` is the share of word tokens that got a relation.
A reading the adapter only guessed (unconfirmed) is used, but every relation it takes part in is capped at confidence 0.5. A figure (`3`, `2.5`) counts as a number
word for the rules. At most eight notes are kept; a sentence of more than 70 words gets a note.

## Not modelled

* no parser: no long-distance dependencies; a stretch is read clause by clause (commas, a coordinating word before a finite verb, a quote mark, a sentence-final mark inside the quote);
* a verbless clause: a greeting, an answer (`Gern!`), a name between commas, a list item and a prepositional phrase after a comma are attached as `discourse`, `vocative`, `conj`, `nmod` / `obl`, or `dep` (conf 0.3) to the nearest clause; their inner structure is only chunked;
* verb valency and prepositional objects (`warten auf`, `bitten um`): every preposition + noun is `obl` (or `nmod`), none is a verb's required complement; `heißen`+ name is the one `xcomp`, `aussehen / bleiben / scheinen / wirken / klingen` + a bare adjective the others; an idiom such as `es eilig haben` is not;
* `sein` + a participle (Zustandspassiv versus adjective) is always `aux`; `lassen / sehen / hören` + infinitive with an accusative subject of the infinitive; double infinitives (`hat kommen wollen`); a verb cluster of more than three verbs;
* coordination beyond like with like: `abends kalt und mittags warm`, a predicate adjective with a prepositional phrase (`ist von heute und noch frisch`), ellipsis (`Man bezahlt in Euro, und am Marktstand oft mit Bargeld`);
* free relatives (`Wer aussteigen möchte, drückt …`: the clause is `ccomp` of the verb), correlates (`so … dass`, always `ccomp`), appositions (`Joseph, ihr Mann,`), `als / wie` comparisons, postpositions and circumpositions (`dem Haus gegenüber`, `um … willen`), `es` as a placeholder, the genitive object, a second accusative object other than flagged;
* a separable prefix in the middle of a clause (`Kommen Sie doch mit zum Kaffee`) where the adapter has made no unit; pronominal adverbs (`darauf`, `damit`) are plain adverbs;
* the older spelling and syntax of the Luther Bible and the Grimm text (verb second after `und` and `da`, `daß`, `ward`, dropped subjects): attached, but unmeasured and visibly worse (see below).

## Measured (2026-10-10)

Corpus: `data/corpus/de`, 780 sentences (after the adapter's sentence splitter), 6,461 word tokens. `npx tsx scripts/probe-syntax-de.mts`:

```
attached word share               97.7 %      modern course texts (652 sentences, 4,540 words): 99.8 %
sentences fully attached          94.6 %      Luther Bible (111 sentences): 96.4 %; Grimm 1857 (17 long sentences): 83.3 %
relations with alternatives       8.1 %  (513 of 6315)
relations marked conflicted       8.4 %
relations with confidence < 0.5   1.3 %
relations with an empty basis     0
time per sentence (mean / max)    0.09 ms / 4.7 ms      (14-26 words: 0.21 ms mean)

relation distribution (words, punctuation excluded)
  nsubj 15.9 %  root 12.3 %  det 11.2 %  advmod 8.0 %  case 7.7 %  obj 7.0 %  obl 6.1 %  conj 5.9 %  cc 5.2 %  cop 3.2 %
  ccomp 2.3 %  amod 2.1 %  xcomp 1.4 %  aux 1.4 %  nmod 1.4 %  discourse 1.4 %  mark 1.3 %  iobj 1.2 %  compound 1.1 %
  dep 0.9 %  nummod 0.7 %  advcl 0.5 %  flat 0.5 %  vocative 0.5 %  expl 0.4 %  acl 0.4 %
most frequent unattached words: und (10), daß (7), es (7), jegliches (6), auf (4), sie (4), das (4)   (almost all Luther and Grimm)
```

Gold (hand-labelled by Claude; AI-judged, unreviewed; no native speaker; word tokens only, punctuation not labelled):

| File | Sentences / words | UAS | LAS | How it was made |
| --- | --- | --- | --- | --- |
| `syntax-dev.json` | 58 / 462 | 99.8 % | 99.8 % | course sentences chosen to cover the constructions above; **used while writing the rules**, so this is a development score, not an estimate |
| `syntax-heldout.json` | 30 / 270 | 99.6 % (first run **89.3 %**) | 99.3 % (first run **87.4 %**) | every 11th eligible corpus sentence (not in the dev file), labelled before the rules were run on it, scored once, then the generic faults it showed were fixed: comma lists splitting a clause, wh-adverb / deictic predicates, `ein bisschen`, `gar nicht`, a relative clause mistaken for a main clause after `und`, quoted fragments, `Heute will sie Äpfel, … kaufen` |
| `syntax-unseen.json` | 25 / 228 | 99.1 % (first run **96.1 %**) | 98.2 % (first run **94.3 %**) | every 9th eligible sentence of 6-20 words, labelled blind, scored once; then fixed: a particle (`wohl`) taken as predicate, a noun with a nominative second reading (`Bauern`), `mit` + bare noun after a noun, coordinated prepositional phrases, a figure splitting a clause |

Only the **first-run** numbers of the held-out and unseen sets are estimates for new, simple German of this kind (about 87-94 % LAS);
after the fixes those two sets are contaminated and the final numbers only guard against regression (test floors: dev > 98 %, held-out
> 96 % LAS, unseen > 95 % LAS, corpus attached > 95 %). They say nothing about the Luther and Grimm texts, about newspaper German, or about
sentences with long verb clusters and nested clauses, where the rules are known to be weaker. A German UD treebank is not on disk (only the
Albanian, Gheg and Norwegian ones), so there is no external score; the owner's course texts are simple, short and repetitive.

Of the 7 words still wrong on the three files, 2 carried alternatives and both listed the gold reading; the other 5 were stated without a doubt.

### Known wrong cases (final rules, gold files)

* `auf der Bank neben ihnen saß` — `neben ihnen` goes to `Bank` (nested place phrase); labelled as an adverbial of `saß`. Either is defensible.
* `Sünde in meinem Herzen` — `in meinem Herzen` goes to the verb `hatte` (alternative: `Sünde`); labelled `nmod`.
* `Anna hatte es eilig` — `eilig` is `advmod`; labelled `xcomp` (the idiom `es eilig haben` is not coded).
* `schon früh am Morgen`, `nur noch schnell eine Brezel kaufen` — a focus / intensifier adverb in front of another adverb goes to the verb instead of that adverb in two of the four positions.
* `Darf ich auch du sagen?` — the quoted pronoun `du` (nominative only) cannot be the subject (`ich` is), so it is `dep`; labelled `obj`.
* `so großen Hunger, dass er … wollte` — the consecutive clause is `ccomp` of `hatte`; labelled `advcl`.
* `Hier ist Paul` — `hier` is not taken as predicate in front of the verb, so `ist` is the root and `Paul` its subject (the intended reading); `Opa ist hier` has `hier` as predicate. `Wo ist die Haltestelle?` has `Wo` as predicate (UD style), so `ist` is a `cop`.
* `Das ist eine Jacke`, `Die Frau ist die Tochter`: two noun phrases that can be nominative around `sein`: the first is the subject, the second the predicate; `Die Tochter ist die Frau` is the same sentence in the other order and the rules cannot tell which is meant (the basis says so, no alternative is recorded).
* `Bauern und Händler Obst …` is right only because of the second reading (see Engine); without it the list head `Obst` would be the subject.

### Engine observations (for the sentence layer; not changed here)

* The first reading of `Bauern` (and other weak nouns) is dative / accusative / genitive singular; the nominative plural is only a later reading. The syntax layer reads the later one when the first cannot agree.
* After a comma that separates list items, the sentence layer reads the last word as a finite verb and drops its infinitive reading (`Heute will sie Äpfel, Tomaten und Kartoffeln kaufen`: `kaufen` has only finite readings). The syntax layer corrects this by the form of the word (surface = lemma) and by the list.
* The polite `Sie` has person 2 in the morphology but takes a third-person plural verb; the syntax layer maps it. A sentence-initial `Sie` is read as `sie` (3 sg fem) first.
* `Vielen Dank` is read as dative plural `Vielen` + a singular `Dank`: the determiner agreement check fails (`conflicted`), which is harmless but wrong.
* `mitkommen` etc.: the separable unit is formed only when the prefix ends the clause; `Kommen Sie doch mit zum Kaffee` has none.
* Contractions (`im`, `am`, `zum`, `zur`) carry an empty `morph`; the syntax layer asks the lexicon for the preposition and the case it governs.
