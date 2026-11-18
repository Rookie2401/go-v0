# German grammar audit, 2026-11-17

Auditor: the grammar-audit session (an AI model, not a native speaker). Code audited: master `985c742b`.
Brief from the owner: audit the linguistic content, be brutal, note every missed feature and detail, and weigh every finding
against what the GoLearn card actually shows. The Norwegian audit is `docs/norway/GRAMMAR-AUDIT-2026-11-17.md`.

## 1. Verdict

German is in a different class from Norwegian. It is usable for a learner today, with a short list of faults that must be
fixed and a longer list of gaps that should be said plainly.

- On 571 words of everyday German the card was **blank for 5 words (0.9 %)**, gave a marked guess for 28 (4.9 %) and a
  confirmed reading for 94.2 %. I found about ten confirmed or guessed readings that were wrong (under 2 %).
- Case, gender and number are read from the noun phrase and are usually right. Separable verbs are put together correctly
  and, unlike Norwegian, do **not** fire on ordinary prepositions (*Er kommt aus Berlin*, *Sie sieht aus dem Fenster* stay
  kommen and sehen). Konjunktiv I and II, the passive, the perfect, relative clauses and modal particles are recognised.
- The word list (1,476 nouns, 890 verbs, 358 adjectives) is mostly right, because each row states its genitive, plural and
  principal parts. I found **about fifty wrong generated forms**, almost all from four rule faults (section 4).
- The real weaknesses: the **guesser for unknown words invents words** (*dreihundert* is shown as a verb "dreihundern");
  the **polite form** is read as "they" (*Gehen Sie!* is "They go"); **compound numbers, abbreviations and compound
  adjectives are blank**; the form line is often **not narrowed** although the card's own sentence role has decided the
  case; and the "All forms" table has **no second source** (no full dictionary record is built for German), so the wrong
  forms of section 4 are displayed as they are.

## 2. How this was audited, and the numbers

1. Dumped every generated form of every noun, verb and adjective row and the closed classes (`dump.mts`). Three cheaper
   reviewer agents read all of it and reported suspects; I checked each reported item myself and ran mechanical checks
   over the dump, which found three more that the reviewers had missed (*Visan*, *Staues*, *Maies*). Their list is
   therefore a floor, not a ceiling.
2. Ran **301 word-in-sentence probes** through the card's own parser and dictionary lookup.
3. Ran **571 words of running text** word by word: everyday narrative, a news paragraph, a conversation, article 1 of the
   human-rights declaration, the Lord's Prayer, John 3:16.
4. Read the design headers of the adapter. I did **not** read `constructions.ts`, `syntax.ts`, `production.ts`,
   `phrases.ts`, `historical.ts` or `units.ts` line by line; their behaviour was tested through the probes only.

Evidence: `docs/german/audit-2026-11-17/`.

| Measure | German | (Bokmål, for scale) |
|---|---|---|
| Running text: blank card | 5 of 571 (0.9 %) | 7.1 % |
| Running text: marked guess (unconfirmed) | 28 (4.9 %), about 7 of them with a wrong lemma | 0.2 % |
| Running text: common word shown as a name | 0 | 1.1 % |
| Running text: wrong reading shown as confirmed (hand count) | about 4 | about 45 |
| Targeted probes: blank card | 8 of 301 | 56 of 276 |
| Wrong generated forms found in the tables | about 50 in 2,724 rows | several hundred in 1,426 rows |

## 3. Findings on the card

### 3.1 The guesser for unknown words invents words (shown as "unconfirmed", 0.35 to 0.5)

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| Das kostet dreihundert Euro. | dreihundert | lemma **dreihundern**, verb, third person singular present | numeral |
| Dreihundert Leute kamen. | Dreihundert | a noun, "nominative, accusative, dative or genitive" | numeral |
| der zwanzigste Mai | zwanzigste | lemma *zwanzigst*, also offered: verbs **zwanzigsen**, **zwanzigsten** | ordinal zwanzigste |
| Ich bin damit einverstanden. | einverstanden | lemma **einverstehen**, verb, past participle, with the note "perfect tense" | adjective einverstanden |
| Die Arbeitslosen suchen Arbeit. | Arbeitslosen | noun *Arbeitslosen*, **feminine** nominative plural; also *Arbeitslos* | der/die Arbeitslose, plural |
| Die Schweizer sprechen Deutsch. | Schweizer | **feminine** nominative plural; also *Schweiz* | der Schweizer, plural |
| zwei Verdächtige / Der Verletzte | Verdächtige, Verletzte | noun with no gender, every case | nominalised adjective / participle |
| Sie sind mit Vernunft begabt | begabt | lemma **begaben**, verb | adjective begabt |
| diejenigen, die wenig haben | diejenigen | lemma *diejenig*, adjective | derjenige, pronoun |
| nach Angaben des Statistischen Bundesamtes | Angaben, Statistischen | lemma *Angaben*; *Statistischen* as a noun | Angabe; statistisch, adjective |
| Arbeitslosigkeit, Freundlichkeit | | "feminine nominative singular **or plural**" | singular (the plural is -keiten) |
| Wir gehen spazieren. | spazieren | unconfirmed verb; also offered: adjective *spazier* | spazieren is a basic verb missing from the list |

A wrong guess is marked unconfirmed and gets no own meaning, so the damage is limited, but the dictionary line under it
usually has the right word, and the two contradict each other on the same card. The dictionary already holds
"form of" entries for most of these; the guesser should ask it before inventing a lemma.

### 3.2 Blank card

- **Compound numbers:** einundzwanzig, fünfundzwanzig, neunundvierzig; anderthalb.
- **Abbreviations:** z. B., usw., Dr. (the dictionary line knows all three).
- **Compound adjectives and adjectives in -los:** hellblau, lebensgefährlich, arbeitslos. Compounds are split only when
  the head is a noun.
- **Adverbs:** weiterhin, voraussichtlich.
- **Older or shortened forms:** unsern (for unseren).

### 3.3 Wrong reading shown as confirmed

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| Gehen Sie bitte geradeaus! / Nehmen Sie Platz! | Gehen, Nehmen | "third person plural, present", meaning **"They go"**, "They take" | polite imperative: "Go!", "Take a seat" |
| Arbeiten Sie hier? / Könnten Sie mir helfen? | Arbeiten, Könnten | "third person plural", "They work" | polite second person |
| Das hat mir gut gefallen. | gefallen | **fallen**, "having fallen", with the note "perfect tense" | gefallen, "pleased". *fallen* takes sein, the sentence has *hat* and a dative |
| Ich trinke lieber Kaffee. | lieber | **lieb**, adjective, masculine nominative, "dear" | comparative of gern, "rather" |
| Die Tür ist zu. | zu | adverb, **"too (excessively)"** | "closed, shut" |
| Und führe uns nicht in Versuchung | führe | **fahren** (its Konjunktiv II) | führen, imperative |
| Er ist genauso groß wie ich. | wie | adverb, "how" | "as" |
| frei und gleich an Würde | gleich | adverb | adjective, "equal" |
| Das ist viel besser. | viel | determiner, "the main word of the sentence" | adverb, "much" |
| Er fährt am schnellsten. | am | "at the; on the" (the superlative note is shown beside it) | part of the superlative |

The verb table's own note says "Not covered: the polite imperative (Gehen Sie)". It is among the first things a learner
meets in a phrase book and in every sign and form.

### 3.4 The form line is not narrowed, or is unreadable

- The role line and the form line disagree. *Wir besuchen zwei Museen*: role "direct object", form "nominative,
  accusative, dative or genitive plural". *Ich habe zwei Brüder*: role "direct object", form "nominative, accusative or
  genitive plural". *Der Mann gibt der Frau das Buch*: role "indirect object (dative)", form "dative or genitive".
  *Ich schreibe Herrn Müller einen Brief*: role "indirect object (dative)", form "accusative, dative or genitive". The
  card has decided the case and then prints the undecided list.
- *Liebe Anna*: "masculine, feminine or neuter nominative or accusative singular or plural; strong, weak or mixed
  declension". *am besten*: "masculine, feminine or neuter nominative, accusative, dative or genitive singular or
  plural; strong, weak or mixed declension". That is every cell of the table, printed as a sentence.
- *ihr Auto*: "personal pronoun, possessive". A possessive is not a personal pronoun.
- Konjunktiv forms keep the bare infinitive as the meaning: *hätte* "to have", *käme* "to come", *wäre* "to be", where
  the indicative forms get "He, she, or it …". The form that most needs an English prop ("would have") gets none.
- *Lasst uns gehen*: "Let! (plural)". *regnete*: "He, she, or it rained".
- Ordinals: lemma *dritt*, *zweit* (the dictionary line under *dritt* then says "only used in zu dritt").
- *Entschuldigung* is a lower-case adverb *entschuldigung*.

### 3.5 Role in the sentence

Mostly sound. Wrong labels seen: *Das ist das Beste*: "adverb of das"; *Alles Gute*: "adverb of Alles"; *dessen Vater*:
"genitive adverbial of Arzt" (it belongs to *Vater*); *Ich schreibe Herrn Müller* (without a second object): "direct
object" for a dative. A predicate adjective is "the main word of the sentence", a parser convention that reads oddly.

### 3.6 The dictionary meaning line

- *ja*: first sense shown is **"initialism of Junge Alternative für Deutschland"**.
- *gekocht*: "cooked, **fucked**". A vulgar slang sense is printed second on the card of a kitchen word.
- *ein*: second sense "misconstruction of einen". *halb*: first sense is the clock-time use only.
- *Lehrerin*: no dictionary meaning at all.
- As in Norwegian, `dict/de/frequency.json` should be checked for what it was counted from before anything is ranked by
  it. I did not check the German file.

### 3.7 Phrases and units

- *Ich hätte gern ein Bier* shows two phrases: "ich hätte gern" (right) and **"gern haben"** ("to like", wrong here).
- *Es kommt darauf an*: no unit *ankommen auf*. *Das geht mich nichts an*: no *angehen*.
- *Er ließ das Auto reparieren*: no note on *lassen* + infinitive.
- Good: Zeit haben, Lust haben, Angst haben vor, recht haben, Platz nehmen, warten auf, denken an, sich freuen auf,
  teilnehmen an, es gibt, es geht um, wie geht es dir, es tut mir leid, je … desto, entweder … oder, guten Morgen.

### 3.8 Pronunciation notes

German has no respelling, only letter notes, and some are attached to the wrong words: *Chef* and *Chor* get the
"ach / ich sound" note (they are "sh" and "k"); *sechs* gets it too (chs is "ks"); *Weg* and *zwanzig* get "v is usually
f" though they contain no v, while *Vater* and *verstehen* get nothing. Nothing is said about final devoicing (Tag, Weg),
-ig (König), eu / äu (heute, Häuser), long and short vowels (Stadt, Staat), or stress.

### 3.9 Tables: no second source

No full dictionary record exists for German (`public/lexicon/` holds only `el`, `he`, `ru`), so "All forms" is the
engine's output alone. I confirmed that the wrong forms of section 4 reach the table: *unterhalten* shows *ünterhielte,
ünterhieltest, ünterhielten, ünterhieltet* in all six Konjunktiv II cells; *viel* shows *viler* with the note "The
endings attach to vil- (not viel-): viler, vilen"; *Tee* shows the genitive *Teees*; *spannend* shows *spannendester*.

## 4. Wrong forms in the word list

### 4.1 Four rule faults (each a few lines to fix)

1. **Konjunktiv II puts the umlaut on the prefix.** *ünterhielte* (unterhalten, both rows), *ünterschiede*
   (unterscheiden), *ünterschriebe* (unterschreiben), *ümginge* (umgehen). The stem vowel is the one to change, and
   *ie / i* take none at all.
2. **The genitive in -es is offered where German never has it:** after a vowel or diphthong (*Kniees, Teees, Zooes,
   Cafées, Schneees, Seees, Staues, Maies*), after unstressed -er (*Feueres, Flyeres*), and for loanwords (*Chefes,
   Linkes, Bloges, Centes*). *Gotts* is offered beside Gottes.
3. **The dative plural adds -n to plurals that take none:** *Praktikan* (Praktika), *Visan* (Visa), *Euron* (Euro),
   *Centn* (Cent).
4. **The superlative of participles in -end gets -est:** *spannendester, wütendester, anstrengendester,
   ansteckendester* (spannendster and so on).

### 4.2 Wrong rows

- viel: stem given as *vil-*, so *viler, vilen*; comparative declined as *mehrer*. wenig: *wenigerer*.
- anders (an adverb) is an adjective row: *anderser, anderserer, andersester*. gern and oft are adjective rows:
  *gerner, lieberer*.
- verschieben is weak: *verschiebte, verschiebt* (verschob, verschoben).
- schreien: Konjunktiv II *schrie* (schriee). schwören: *schwöre* (schwüre).
- heimbringen is labelled strong (its forms are the mixed ones, correctly). *hineinsammeln* is not a verb in use.
- wehtun and leidtun lack the dative mark.
- hungerig beside hungrig; Lebtag as a neuter beside the masculine; *Email* as a feminine noun for "e-mail" (the word is
  E-Mail; das Email is enamel).
- spalten gives only *gespaltet* and offenbaren only *geoffenbart*; the usual forms are gespalten and offenbart (both
  pairs are accepted, the less common one is listed).
- Comparison is generated for about seventy adjectives that have none or hardly any (tot, schwanger, einzig, ganz, halb,
  täglich, deutsch, golden, the participles, the ordinals).
- Contractions carry only the masculine dative cell (am, im, beim, vom, zum, vorm, hinterm, überm, unterm); the neuter
  (am Fenster, im Haus) still parsed correctly in my probes. jedermann has no genitive (jedermanns).
- Missing from the closed classes: derjenige and its forms, irgendein, irgendwer, irgendjemand, irgendetwas, sämtliche,
  the pronoun uses of einer / keiner / meiner, the genitives zweier and dreier. Missing prepositions: anhand, inmitten,
  zugunsten, zufolge, ungeachtet, seitens, zwecks, kraft, halber, um … willen, entsprechend, mitsamt, via, gen.
  wegen, während, trotz and statt list only the genitive, though the dative is everyday German (*wegen dem Regen* was
  still parsed).

## 5. Not modelled or not tested

- The polite imperative and the polite reading of verb + *Sie* (3.3).
- Compound numbers, ordinals as their own lemmas, fractions, abbreviations.
- Compound adjectives and verbs; derivation of -keit / -heit / -ung / -los / un- words that are not listed (they fall to
  the guesser).
- Nominalised adjectives and participles that are not listed (der Verletzte, die Arbeitslosen).
- *lassen* + infinitive; *ankommen auf*; verb-first conditionals; *als ob*; the *sein* + *zu* + infinitive passive;
  double infinitive (*hat arbeiten müssen* was read, but with no note).
- Regional standard German (Austria, Switzerland) beyond the notes in the lists; I did not test it.
- I did not audit the German course texts, the Stage 0 material, the checks on the learner's own writing
  (`production.ts`) or the older-spelling list beyond *daß* and *muß* (both read correctly).

## 6. What to fix first

1. The four rule faults of 4.1 and the rows of 4.2.
2. The polite form: verb + *Sie* at the start of a sentence that ends in "!" is an imperative; verb + *Sie* (capital,
   not sentence-initial) is the polite second person, never "They".
3. Make the guesser ask the dictionary's "form of" entries before it invents a lemma, and stop it from proposing verbs
   for words that end in -t or -en only by accident (*dreihundert*, *einverstanden*, *begabt*).
4. Numbers: compound cardinals by rule (ein-und-zwanzig), ordinals as lemmas (dritte, zwanzigste).
5. Print the case the sentence role has already decided; never print the whole table as a form line.
6. Rank *gefallen* by auxiliary and dative, *lieber* after a verb as the comparative of gern, *zu* after *sein* at the
   end of a clause as "closed".
7. Abbreviations and compound adjectives.
8. Filter the dictionary line: no initialisms or vulgar senses first.
9. Build full dictionary records for German so that the table has a second source.

## 7. Limits of this audit

- I am a language model, not a native speaker, and looked nothing up. I am confident of the forms given. Where Duden
  accepts two forms I say so.
- The table read was done by cheaper reviewer agents and then checked by me; my mechanical recheck shows they missed a
  few, so more wrong forms of the kinds in 4.1 may remain.
- Much less of the German rule code was read than of the Norwegian. The syntax and construction layers were tested
  through about 300 sentences only.
- Hand counts of wrong readings could be off by a few.
