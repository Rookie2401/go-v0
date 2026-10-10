# Spanish contextual syntax (Stage 4)

Module `src/adapters/spanish/syntax.ts` (`spanishSyntax(tokens, analyses)`), wired as `syntax` in `src/adapters/es.ts`. Analyzer id `spanish-syntax@1`; the adapter version stays `adapter-es@12`. Pure rules over the adapter's own readings (lemma, part of speech, gender, number, person, `parts` of attached pronouns) and word order; no data files; deterministic. Labels follow Universal Dependencies without subtypes. Everything is machine-drafted, AI-labelled, and unreviewed by a native speaker.

## What is modelled

| Area | Rule and basis (every relation carries a plain-words `basis`) |
|---|---|
| Noun phrase | article / possessive / demonstrative = `det` (agreement in gender and number is the basis; "el" before a stressed a- feminine noun is allowed; a mismatch is attached at confidence 0.45 and said so); `nummod`; adjective = `amod` (after the noun it must agree, before it it may not stand before the determiner); name sequences and titles = `flat` ("doña Reina", "San Pedro Sula"); a person noun + name = `appos`; a determiner with no noun ("el que", "lo bueno", "todos") becomes the head. |
| Verb group | `haber`/`ser` + participle, `estar` + gerund, `ir a` + infinitive = `aux` (+ `mark` on "a"); finite verb + infinitive = `xcomp`; "tener que", "empezar a", "acabar de" … = `xcomp` + `mark`; "ayudar a X a hacer" is found with the object in between. Copula (`ser`/`estar`, also the infinitive: "podía ser maestra"): the predicate is the head, the copula is `cop`, a prepositional predicate keeps its `case`; "¿Qué es esto?" makes the question pronoun the predicate. |
| Subject | person and number agreement with the verb ending; explicit subject pronouns (yo, tú, él …) are always subjects; coordinated subjects are plural and take the lowest person ("Pedro y yo fuimos"). Pro-drop: no subject word is fine, a note says "the ending shows 1st person singular". |
| Objects | direct object = bare noun after the verb (or "hay"); personal "a" + person = `obj` after verbs like ver/amar/llamar, `iobj` after dar/decir/enviar, with a "le/les" clitic, or when an object is already there; "a" + place with a verb of motion = `obl`; clitics lo/la/los/las = `obj`, le/les = `iobj`, "se" before lo/la = `iobj`, me/te/nos/os = `iobj` with lo/la or with gustar-type verbs, otherwise `obj`; clitics before a modal climb to the infinitive ("lo quiero ver"). Pronouns written onto the verb (`dártelo`) cannot take a relation (no token), so the verb's basis names them with their roles from `parts`. |
| Prepositional phrases | `case` on the noun; "de" after a noun = `nmod`; other prepositions after a verb = `obl`; "cerca de / antes de" + noun = `obl` of the adverb; "antes de / para / sin + infinitive" = `advcl` with `mark`; time words without a preposition ("un día", "el sábado") = `obl`. |
| Clauses | "que" after a verb = `ccomp` + `mark`; "que / quien / donde / el cual" after a noun = relative clause (`acl`), the relative pronoun is `nsubj` (no other subject) or `obj`/`obl` (a subject stands between, or a preposition precedes: "en que", "al que"); "si", "porque", "cuando", "aunque", "para que", "antes de que", "en cuanto" = `advcl` + `mark`; indirect questions = `ccomp`; "y / pero / o" between clauses = `conj` + `cc` (to the first conjunct); "y que" after a subordinate clause continues it; a speech verb after a quote becomes the root of the dialogue line. |
| Coordination | `conj` to the first conjunct, `cc` on the second; comma lists; nouns, prepositional phrases, adjectives, infinitives. |
| Other | `vocative` ("Juan, ven"), `discourse` (interjections, isolated exclamations), `advmod` (negation, degree words, "también", wh-adverbs), `expl` (se with pronominal verbs and the passive), depictive adjectives = `xcomp`. |

`attached` is the share of word tokens with a relation. Punctuation gets a low-confidence `punct` relation (not counted). `clauses` lists main / subordinate / relative / coordinate / quote spans with their marker.

## Where the rules keep both readings (`alternatives`, status `conflicted`)

- subject vs object: a noun on each side of a finite verb, same number ("Juan tiene un libro": SVO chosen at 0.7, the swap kept; with a repeated "lo/la" the two are 0.5/0.5); a single noun after a finite verb with no subject before it (object 0.55, subject 0.45);
- "se" + verb + noun: passive (noun = subject) or impersonal (noun = object); "se" alone: expl / reflexive obj / iobj;
- "a" + person: `obj` or `iobj` when the verb is not in either list; "a" + noun with a possessive after an unknown verb;
- a prepositional phrase right after an object noun: `obl` of the verb or `nmod` of the noun;
- "si": whether (`ccomp`) or if (`advcl`); le with a direct-person verb (leísmo); me/te with no other object (`obj` / `iobj` / `expl`); a gerund after a noun (`acl` / `advcl`); a vocative that could be a subject.

Words the engine does not know: a word with **no reading** gets no relation (note: "No reading for …"). A word whose only reading is a low-confidence rule-inferred verb ("ruido" read as *ruidar*) after an article, preposition, demonstrative, quantifier or "ser" is re-typed noun / adjective from its position; every relation touching it is capped at 0.45 and a note says "Not in the word list".

## Not modelled

Subtypes (`nsubj:pass`, `obl:tmod`, `acl:relcl`, `expl:pv`, `aux:pass`), `parataxis`, `csubj`, `orphan` (ellipsis: "¿y vos?"), comparatives ("más … que", "como las tuyas"), `dislocated` objects other than the clitic-doubling case, enclitic pronoun relations (no token), "lo que" free relatives beyond the common case, tag questions, direct speech with several speakers, long Biblical periods (a relative clause inside the subject of a subordinate clause is handled only for the common "para que todo aquel que …" shape), `fixed` expressions ("sobre todo", "poco a poco", "gracias a"), noun / verb attachment of "de" phrases after the first.

## Measured (probe `npx vite-node scripts/probe-syntax-es.mts [--limit N] [--show]`)

Corpus `data/corpus/es`: 467 sentences, 3 836 word tokens.

| | |
|---|---|
| word tokens with a relation | 3 822 / 3 836 = 99.6 % (97.9 % of sentences fully attached, every sentence has a root) |
| relations with alternatives | 245 / 3 822 = 6.4 % (31.3 % of sentences have at least one) |
| mean confidence | 0.82 |
| sentences with a non-routine note | 2.8 % |
| speed | mean 0.047 ms per sentence, p95 0.064 ms, 0.11 ms per 20 words (max seen 5 ms, first call) |

Most frequent relations: det 14.0 %, root 12.2 %, nsubj 11.1 %, case 9.0 %, obj 8.3 %, obl 7.4 %, advmod 5.1 %, mark 4.7 %, conj 4.7 %, cc 4.0 %.

Gold (UD labels, labelled by Claude, no native speaker, unreviewed; word tokens only, punctuation left out; no Spanish UD treebank is on disk, so there is no treebank score):

| set | sentences / tokens | UAS | LAS |
|---|---|---|---|
| `data/gold/es/syntax-dev.json` (56 corpus + 37 written sentences; the rules were developed against it) | 93 / 807 | 99.3 % | 98.0 % |
| `data/gold/es/syntax-heldout.json`, **first run before any fix** | 35 / 241 | 94.2 % | 92.5 % |
| same file after the fixes it showed (no longer held out) | 35 / 241 | 95.4 % | 94.2 % |

The dev number is a development score and says little about unseen text; the first-run held-out figure (written after the first freeze, labelled before looking at the output) is the honest estimate, on short everyday sentences. Real corpus text with words the list lacks is harder.

## Known wrong cases

- Engine readings the syntax inherits: "fría" read as a form of *freír* (the adjective is missing), "Lucía" read as *lucía* mid-sentence, "cuánto" as a determiner (patched in the syntax), unknown words such as "información", "funciona" with only weak verb readings (no verb anchor, so the clause around them is thin).
- "Hace mucho frío": "frío" read as an adjective after a verb, so it becomes a depictive `xcomp`.
- "enseñó a conducir" with "me": `obj` chosen, the gold says `iobj` (kept as an alternative).
- Ambiguous gold choices where the system and the labeller may both be defensible: "libro sobre la historia" (`nmod` kept only as an alternative), "con frijoles" after "tortilla de harina", "de mi hijo" after "profesora de matemáticas".
- Elliptical "¿y vos?" gets `mark` / `obj` (should be `conj` / `orphan`); "ni un cabrito" gets `mark` on "ni".
- Subject / object conflict is flagged on most plain SVO sentences by design, so about a third of the corpus sentences carry at least one `conflicted` relation.
