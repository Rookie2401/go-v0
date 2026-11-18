# Norwegian grammar audit (Bokmål and Nynorsk), 2026-11-17

Auditor: the grammar-audit session (an AI model, not a native speaker). Code audited: master `985c742b`.
Brief from the owner: audit the linguistic content, be brutal, note every missed feature and detail, and weigh every finding
against what the GoLearn card actually shows.

## 1. Verdict

Norwegian is not fit to put in front of a learner as it stands.

- **The word list is small and a large share of it is wrong.** Both lists were written by a model from memory and never
  checked against a dictionary. I read every form the lists generate. The Bokmål list teaches non-words for common verbs
  (*kallet* for kalte, *klaret* for klarte, *leveret* for leverte), nouns (*museumet*, *sykdomen*, *klærene*) and adjectives
  (*morsome*, *lokle*, *spesiellt*). The Nynorsk list is worse: seventeen verbs have a wrong imperative (*tenkj*, *sitj*),
  every `-leg` adjective has a wrong neuter (*vanlegt*), and nine of 260 nouns have the wrong gender.
- **On ordinary text the card is blank or wrong for about one word in six in Bokmål and one in four in Nynorsk.** Measured
  on 563 words of everyday Bokmål and 360 words of everyday Nynorsk (section 2).
- **When the card is wrong it does not say so.** "Voksen" (adult) is shown as "voks, wax, definite" at confidence 0.9.
  "Kan du si det" shows *si* as the possessive "sin". "La navnet ditt helliges" shows *La* as the past of legge.
  A sentence-initial word the list lacks is shown as a person's name ("Klærne: name").
- **Nynorsk is a thin copy of Bokmål.** It has a third of the Bokmål vocabulary, no weekdays, no numbers from 11 to 19 or
  30 to 90, Bokmål wording in its grammar notes, and a dictionary line that for most verbs reads "alternative form of
  koma" instead of a meaning.
- **The "All forms" table has no second source.** No full dictionary record (table, origin, IPA) is built for `nb` or
  `nn`; `public/lexicon/` holds only `el`, `he`, `ru`. So every cell the learner sees is the unchecked rule output,
  wrong forms included. The note on the card that says so is accurate.

The honest labels ("machine-drafted", "unreviewed") are present, but a label does not make a wrong form harmless: a
learner will still learn *kallet*.

## 2. How this was audited, and the numbers

1. Read the rule files in full: `src/adapters/norwegian/` (text, lexicon, nouns, verbs, adjectives, analysis, context,
   engine, paradigm, compounds, units, constructions, pronunciation, historical, varieties, families head, syntax first
   half) and the card model (`packages/golearn-extension/src/parser`).
2. Dumped **every generated form of every entry** of both word lists (`dump.mts`) and read all of it: Bokmål 347 verbs,
   844 nouns, 235 adjectives, 293 closed-class lemmas; Nynorsk 125 verbs, 261 nouns, 108 adjectives, 208 closed-class
   lemmas.
3. Built a probe that calls the same function the card calls (`parseSelection`) and the same dictionary lookup, and ran
   **403 word-in-sentence probes** (276 Bokmål, 127 Nynorsk), each aimed at one suspected fault.
4. Ran **923 words of running text** through the card word by word: everyday narrative, a news paragraph, a
   conversation, article 1 of the human-rights declaration, the Lord's Prayer and John 3:16.
5. Checked 314 everyday Bokmål words and 105 everyday Nynorsk words against the lists.

Evidence (inputs, outputs, scripts) is in `docs/norway/audit-2026-11-17/`. The scripts use absolute paths to this
machine's clone.

| Measure | Bokmål | Nynorsk |
|---|---|---|
| Running text: words with **no reading** (blank card) | 40 of 563 (7.1 %) | 54 of 360 (15.0 %) |
| Running text: common words **shown as a name** | 6 (1.1 %) | 6 (1.7 %) |
| Running text: words with a reading that is **wrong** (my count, by hand) | about 45 (8 %) | about 20 (6 %) |
| Running text: reading left **undecided** although the sentence decides it | about 35 (6 %) | about 20 (6 %) |
| Everyday words not in the list at all | 144 of 314 (46 %) | 98 of 105 (93 %) |
| Targeted probes: blank card | 56 of 276 | 21 of 127 |
| Targeted probes: common word shown as a name | 14 | 4 |

The targeted probes were chosen to find faults, so their rates are not coverage figures; the running-text rows are.
The "wrong" and "undecided" counts are my own reading of the output and could be off by a few either way.

Limits of this audit are in section 9.

## 3. What the card shows, and what is wrong with each part

| Part of the card | State | Section |
|---|---|---|
| Lemma, part of speech | Blank for 7 % (nb) / 15 % (nn) of running words; wrong for about 8 % / 6 % | 4.1, 4.2 |
| Form line ("past tense", "neuter, singular") | Blank for every adjective `-e` form; undecided for the largest verb class; case never stated | 4.3, 4.4 |
| Own meaning (short gloss) | Follows the lemma, so wrong whenever the lemma is wrong | 4.2 |
| Dictionary meaning | Usually right in Bokmål; wrong sense or wrong word class first in places; a redirect instead of a meaning for most Nynorsk verbs | 4.6 |
| "All forms" table | Rule output only, with the wrong forms of section 5 | 5 |
| Particle verb / unit | Good when right; fires wrongly on ordinary prepositions | 4.7 |
| Fixed phrase | Short list; "så fort" always glossed "as soon as" | 4.8 |
| Grammar notes (constructions) | Never fire for the largest verb class; Nynorsk card shows Bokmål text | 4.9 |
| Role in the sentence (syntax) | Wrong whenever the reading is wrong ("indirect object of Han") | 4.10 |
| Word structure (compounds) | Works for noun + noun; nothing else | 4.11 |
| Pronunciation line (respelling) | Wrong for most of the commonest words | 4.13 |
| Notes | One stale claim; Nynorsk tables carry Bokmål labels and examples | 4.15 |

## 4. Findings on the card

Each line: the sentence, the word, what the card shows, what it should show. All confirmed by probe unless marked
"from the code".

### 4.1 The card is blank (no lemma, no part of speech, no form)

The note reads "Not an entry of the Norwegian (Bokmål) word list, and the rules found no reading". The dictionary line
often still gives a meaning, so the learner gets a meaning and nothing else.

**Past tense of common verbs (the list gives them the wrong class, so the real form is unknown):**
kalte, klarte, nevnte, hendte, leverte (also tente, fortjente, nølte, hylte, bevarte, lurte, åpenbarte, skyldte: same
fault, from the table). Also blank: lagde, pleide, kledde, listet, snødd.

**Verbs missing altogether (Bokmål):** virke, starte, hate, love, låne, eie, mangle, blåse, fylle, pusse, orke, gidde,
føde, tvile, ødelegge, brenne, endre, skaffe, tape, veie, kutte, føre, styre, motta, hviske, prate, ende, skynde, varsle,
ramme, opplyse, pågripe, etterforske, utstyre, ane, lande, bytte, samarbeide, oversette, uttale, stave.

**Whole categories of verb form that are never recognised:**
- participle used as an adjective in the plural or definite: *den stjålne bilen*, *de skrevne reglene* (blank);
- present participle: *syngende*, *løpende*, *stående* (blank; only the few listed as adjectives, such as *spennende*, work);
- s-passive of a verb ending in a vowel: *tas*, *sies*, *fås*, *gis*, *nås* (blank);
- past s-passive: *bruktes* (blank; only the listed deponents *fantes*, *møttes*, *syntes* work);
- s-passive of an unknown or compound verb: *helliges*, *etterforskes* (blank).

**Adjective forms the rules build wrongly, so the real form is unknown:** raskt, friskt, søtt, morsomme, lokale,
nasjonale, kjedeligere, travelt.

**Adverbs, particles and prepositions (Bokmål), all blank:** altså, nemlig, selvfølgelig, naturligvis, absolutt, deretter,
derimot, vekk, unna, videre (alone), fremover, framover, stadig, særlig, vanligvis, tydeligvis, trolig, antakelig,
forresten, riktignok, knapt, neppe, nokså, temmelig, altfor, meget, iblant, hittil, foreløpig, herfra, derfra, desto, dess,
imot, igjennom, imellom, ifra, istedenfor, oppå, inni, utenom, ovenfor, nedenfor, angående, tross, i morges (*morges*).

**Everyday nouns and adjectives (Bokmål), blank:** kort (both "short" and "card"), stund, kø, størrelse, rente, budsjett,
fornuft, samvittighet, evighet, fristelse, vilje, innbrudd, politi, minister, internett, passord, skjerm, resept, brann;
sentral, digital, normal, travel, alvorlig, personlig, felles, eneste, enkelte, dobbel, høflig, slem, lat, skitten.

**Valid Bokmål variant forms, blank:** museet, steder, beinet, vegen (and so, from the code, sein, sjøl, høg, låg, rein,
tjukk, mjuk as far as the list lacks them). Only bro/bru is modelled as a pair.

**Numbers, blank:** tjueen, trettifem, tjuefem (no compound numeral at all), null, halvannen, milliard, ellevte and every
ordinal above tiende; *én* with the accent.

**Abbreviations, blank:** kr, pga. (and, from the code, every tokenised abbreviation without a row: evt., m.fl., o.l.,
jf., mht., tlf.).

**Interjections, blank:** hallo, morn, farvel, adjø, au, oi, ok, okei, beklager.

**Nynorsk, blank (in addition to the same categories):** the weekdays måndag, tysdag, onsdag, torsdag, fredag, laurdag,
sundag/søndag; elleve to nitten, tretti to nitti, million, null; att, attende, elles, au, jau, kvarandre, hos, altså,
nemleg, sjølvsagt, særleg, truleg, stundom, dessutan, derfor, vekk, unna, mens, korkje, einkvan, somme, orsak, eigentleg,
nett, alvorleg, mogleg, einsam, rein (so *reint*), keisam; universitet, film, sjokolade, pose, mobil, ettermiddag, helg,
kommune, person, luft, støvel, regjering, politi, soge, forteljing, høve, fridom; the verbs handle, liste, prate, auke,
varsle, tale, arbeide (*arbeider*), ringje (*ringde*), hende; the participles *komen*, *komne*, *lesen*, *pågripne*,
*skadde*; the present *møtest*; the past *flaug* (the list has the Bokmål-like *fløy*).

### 4.2 The card shows a wrong reading and looks sure of it

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| Han er voksen nå. / en voksen mann | voksen | **voks**, noun, "wax", masculine singular definite, 0.9. The adjective is not even an alternative | voksen, adjective, "adult" |
| Kan du si det en gang til? | si | **sin**, determiner, feminine possessive | si, verb, infinitive |
| La navnet ditt helliges. (four times in the Lord's Prayer) | La | **legge**, past tense | la (late), imperative, "let" |
| La viljen din skje | skje | skje, noun ("spoon") | skje, verb, "happen" |
| tilgi oss vår skyld | skyld | **skylde**, verb, imperative | skyld, noun, "guilt, debt" |
| Jeg har lyst på is. | lyst | **lyse**, perfect participle, "having shone", with the note "Perfect tense: har + participle" | lyst, noun, "desire" (ha lyst på) |
| Det er to år siden. | siden | **side**, noun, "page; side", definite | siden, adverb, "ago" |
| Han bor fortsatt her. (4 times in the texts) | fortsatt | **fortsette**, perfect participle, "having continued" | fortsatt, adverb, "still" |
| under tjuefem år | under | under, **noun**, neuter ("wonder") | preposition |
| like etter klokken åtte | like | **like**, verb, infinitive | adverb, "just" |
| Hun er like gammel som meg. | like | lik, adjective, "equal" | adverb, "equally, as" |
| Jeg trenger minst to timer. | minst | liten, superlative, "small", "adjective describing timer" | adverb, "at least" |
| Selv kongen kom. / selv om | selv | pronoun, reflexive, "self" | adverb "even"; part of the subjunction *selv om* |
| Jeg kom i går. | går | **gå**, present tense, "go; walk" (the phrase "i går" is listed below it) | part of *i går*, "yesterday" |
| Om kvelden så vi en film. | så | så, adverb | se, past tense |
| Hans bil er rød. | Hans | **Hans**, name | hans, possessive |
| Han løftet kassen. | løftet | **løfte**, noun, "promise", definite | løfte, verb, past |
| Han eier huset. | eier | eier, noun, "owner" | eie, verb, present |
| Kan du åpne døra? | åpne | **åpen**, adjective, 0.88, "adjective describing døra" | åpne, verb, infinitive after *kan* |
| De inviterte gjestene kom sent. | inviterte | verb, past tense, "the main word of the sentence" | participle used as an adjective |
| Han har rett. | rett | adverb, "straight; right (before a place)" | noun (ha rett, "be right") |
| Vet du om Kari kommer? | om | preposition | subjunction, "whether" |
| Vi venter til han kommer. | til | preposition | subjunction, "until" |
| blant unge under 25 | unge | unge, noun, "kid", singular | ung, adjective, plural ("young people") |
| Hun har blå øyne. | blå | "feminine or masculine, **singular**, indefinite" | plural |
| Regjeringen la i dag fram forslaget **til** statsbudsjett | la … til | particle verb **legge til**, "add" | legge fram; *til* is a plain preposition |
| Aner ikke. | Aner | a **name** | ane, verb, present |
| Nynorsk: renta vil bli sett ned | sett | **sjå**, participle | setje, participle |
| Nynorsk: så kvar den som trur | kvar | adverb, "where" | determiner, "each" |
| Nynorsk: Det vart seint. / har vorte | vart, vorte | lemma **bli** | lemma verte |
| Nynorsk: Eg likar å kasta ball. | kasta | "past tense or perfect participle" | infinitive (the a-infinitive) |
| Nynorsk: eit vanleg problem | vanleg | "feminine or masculine" | neuter (the table wrongly makes the neuter *vanlegt*) |
| Nynorsk: som brør | som | relative pronoun | "as" (comparison) |

**Why these happen (from the code).** There is no parser. A short list of hand-written neighbour rules ranks the readings,
and a row in the word list always beats common sense: the noun rows *voks*, *sult*, *under* ("wonder"), *lære*, *drikke*
generate forms identical to very common words, and nothing weighs how rare "the wax" is beside "adult". Several very
common words have only one reading in the list (*fortsatt* only as a participle; *siden* has no adverb; *like*, *minst*,
*selv*, *alt* have no adverb reading), so the right answer cannot be chosen at all.

### 4.3 The card leaves the form undecided although the sentence decides it

- **Every class-1 verb** (the largest class): *Hun har kastet ballen*, *Ballen ble kastet*, *Han kastet ballen* all show
  "past tense or perfect participle". After *har* it is a participle; after a subject it is the past. The same for
  *ventet*, *handlet*, *snakket*, *skadet*, *elsket*, *åpnet* and Nynorsk *elska*, *svara*, *venta*.
- **Infinitive after a modal** for every verb whose infinitive equals its imperative: *måtte stå*, *kunne bli*,
  *skal gå*, *Skal vi ta en kaffe* all show "imperative or infinitive".
- **Past or imperative**: *Da jeg kom hjem* shows "past tense or imperative"; *sov* likewise.
- **Nynorsk present or imperative**: *Ho skriv eit brev*, *Vi les boka*, *Han gjer det* show "present tense or
  imperative" with the subject standing right before the verb.
- **Imperatives that are not recognised as such**: *Spør ham!* shows "present tense"; *Se der!* and *Leve kongen!* show
  "infinitive"; Nynorsk *Sit ned!* shows "present tense" and *Tenk på det!* shows a name.

### 4.4 The form line says nothing where it matters most

- **Adjective in `-e`**: *store*, *lille*, *små*, *glade*, *frie*, *daglige*, *onde*, *åpne* show an **empty** form line.
  The learner is not told that the form is plural or definite, which is the whole point of the ending. In
  *De store bilene* the neighbours make it plural and definite beyond doubt. (The reading carries
  "Number=Plur,Sing; Definite=Def,Ind", which includes the impossible "singular indefinite", and the card then prints
  nothing.)
- **Case of pronouns is never printed**: *henne* shows "hun; feminine, singular, 3 person", *ham* shows "han; masculine,
  singular, 3 person", *meg*, *deg*, *dem*, *oss* likewise. Nothing says "object form". The own meaning is the same for
  both cases ("she; her", "I; me").
- **Comparative** shows only "comparative"; superlative "definite, superlative" is fine.
- *spennende* shows "feminine or masculine or neuter" and no number; *min* in *Boka er min* shows "feminine or
  masculine" beside a feminine noun.
- *verden* is always "indefinite" although the same form is the definite one (*elsket verden*).

### 4.5 Common words shown as a person's name

Any word with a capital letter that the list lacks is "probably a name" at 0.4, **including the first word of a
sentence**: Klærne, Setninga, Epla, Mjølka, Framtida, Sykdommen, Søsknene, Ideen, Deretter, Vanligvis,
Arbeidsgiveren, Statsministeren, Finansministeren, Opposisjonen, Politiet, Aner; Nynorsk Tenk, Setninga,
Dokker, Elles, Regjeringa, Spania (Bokmål knows Spania; Nynorsk does not). A sentence-initial compound is not even
tried as a compound. Several of these are the *correct* Bokmål `-a` forms (Setninga, Epla, Framtida), unknown because
the list gives those nouns one gender or one plural only.

### 4.6 The dictionary meaning line

- **Nynorsk verbs show a redirect, not a meaning.** The Nynorsk Wiktionary entries sit under the a-infinitive
  (koma, lesa, kasta); the card looks up the e-infinitive. Result, verbatim from the card: *kjem* "alternative form of
  koma"; *les* "e-infinitive form of lesa ; an inscription"; *kasta* "alternative form of kasta ; caste"; *veit*
  "alternative form of vita"; *tenkjer*, *spurde*, *køyrde*, *høyrer*, *syng*, *ligg*, *legg*, *fortel*, *hugsar*,
  *gjer* the same. 44 of 127 Nynorsk probes show such a line. The lookup does not follow "alternative form of".
- **Wrong sense or wrong word first**: *fås* "few"; *virker* "business; work" and "woodwork"; *starter* "a starter";
  *pleide* "care, nursing"; *klarte* "to clear; to clarify" (not "manage"); *samarbeider* "collaboration" (noun);
  *Rommet* "rum (alcoholic beverage)" before "room"; *boka* second sense "alternative form of bøk (beech)"; *henne*
  second sense "back board"; Nynorsk *fekk* "bleach, blanch ; soak and dissolve" (nothing about "got"), *flaug*
  "plane, aeroplane", *sel* second sense "a village", *set* (setje seg ned) "to see ; to look", *Jentene* "alternative
  form of gjente", *Me* second sense "eye dialect spelling of vil", *talar* "a speaker or orator".
- **The frequency file is not a frequency list.** `dict/nb/frequency.json` is counted from 51 of the course's own
  texts (12,478 words). Its 16th and 18th commonest lemmas are *bra* and *glad*. Anything ranked by it (sense order, "common
  word" claims, review order) rests on the course's own repetitive prose, not on Norwegian.
- No dictionary meaning at all for: tjueen, trettifem, bruktes, orker, gidder, luring, Kari; Nynorsk komen, komne,
  forteljing, *dømes* (in *til dømes*).

### 4.7 Particle verbs (units), reflexives, verbs with a fixed preposition

**False hits. The unit replaces the lemma on the card, so these are wrong headlines:**

| Sentence | The card shows | Why it is wrong |
|---|---|---|
| Hun ser på TV etter middag. | **se etter**, "look after" (0.6) | *etter middag* is "after dinner" |
| Han kom med bussen. | **komme med**, "bring; come along" (0.85) | *med bussen* is "by bus" |
| Han tok boka på bordet. | **ta på**, "put on" (0.6) | *på bordet* is "on the table" |
| Regjeringen la i dag fram forslaget til … | **legge til**, "add" | *fram* is the particle |
| Jeg ser ut av vinduet. | **se ut**, "look; appear" (0.85) | literal "look out of" |

The matcher takes any listed particle within four words. For particles that are also prepositions (på, av, med, til,
etter, over, om, for, fra) it needs to see that no noun phrase follows the particle.

**The particle itself loses its own meaning.** In *Vi går videre*, *videre* shows lemma "gå videre", part of speech
adverb, meaning "go on". In *tok jeg på meg støvlene*, the pronoun *meg* shows lemma "ta på seg". The learner who taps
*tilbake* wants "back" first and the unit second.

**Missing units (common, all read as the bare verb):** kjenne igjen, passe på, komme an på, finne på, få til, gå an,
si fra, si opp, se fram til, regne med, legge merke til, ta vare på, sette pris på, være med, bli kvitt, holde med,
slå seg ned, gjøre rede for. The Nynorsk list has 29 units against 136 in Bokmål.

**Reflexive verbs are not units unless they have a particle.** *Jeg legger meg klokka ti* shows *legge* "lay; put"
(it means "go to bed"). The same for sette seg, reise seg, skynde seg, bestemme seg, like seg, kjede seg, føle seg
(this one has a hint in the gloss), glede seg (hint present), gifte seg (hint present). The reflexive set in the code
contains *dem*, which is never reflexive, and lacks *dere*.

**Verbs with a fixed preposition are excluded by design** (vente på, tenke på, høre på, snakke med, stole på, tro på is
the one exception as a "frame"). For a learner these are vocabulary items: *vente på* is "wait for".

### 4.8 Fixed phrases

- *så fort* is always glossed "as soon as": wrong in *Han løp så fort* ("so fast").
- Bokmål has 53 phrases; Nynorsk has 14. Missing in both: vær så god, tusen takk, takk skal du ha, takk for sist,
  ha det, ikke sant, med en gang, etter hvert, i det hele tatt, rett og slett, først og fremst, av og til, mer eller
  mindre, fram og tilbake, i løpet av, i forhold til, ved hjelp av, når det gjelder, til tross for, på forhånd, i orden,
  for tiden, i det siste, for øvrig, i mellomtiden, om dagen, om vinteren, om våren, om høsten, i helga, i morges
  (the word *morges* is blank). Genitive phrases after *til* (til sengs, til fjells, til bords, til stede) are read as a
  bare genitive with no phrase.
- A phrase never changes the headline of the card: in *i går* the card still leads with "gå, present tense".

### 4.9 Grammar notes (constructions)

- **"Perfect tense: har + participle" and "The bli-passive" never fire for class-1 verbs**, because their form is the
  undecided "past or participle": *har kastet*, *har snakka*, *ble kastet*, *ble åpnet av læreren* get no note. They
  fire for *har kjøpt*, *ble bygd*. So the note is missing for the largest verb class.
- **"Modal verb + infinitive" is missed** when the infinitive is misread (*Kan du åpne døra?*) and never states which
  reading it chose.
- **The Nynorsk card shows Bokmål text.** There is one table of titles and explanations for both standards. A Nynorsk
  learner reads "Jeg bor i Oslo", "ikke before the verb", "hvem, hva, hvor, hvorfor, hvordan", "da or når?",
  "-ere, -est, mer, mest", "Boken blir lest", "bilen min, mora mi". Nynorsk is eg, ikkje, kven, kva, då, -are, -ast,
  meir, boka blir lesen.
- *da or når?* fires on every subjunction da/når, also where there is nothing to choose.
- *sin, si, sitt, sine* fires on every *sin*; fine, but in *Kan du si det* it would fire on the verb.
- **"Double definiteness"** needs an adjective: *den boka*, *denne bilen*, *dette huset* get no note, though that is
  the same rule.
- **Not modelled at all** (no note anywhere): the cleft (*det er … som*), presentation with *det* (*det bor en mann
  her*), the formal subject *det*, relative clauses and the dropped *som*, indirect questions, verb-first conditionals
  (*Kommer du, blir jeg glad*), the future with *skal / vil / kommer til å*, *holde på å*, *pleie å*, *få* + participle,
  *være* + participle (*er kommet*), the agent with *av* in the passive, *både … og*, *enten … eller*, *verken … eller*,
  *jo … desto*, *like … som*, *så … som*, agreement of the predicative adjective (*huset er stort*, *de er glade*),
  *noe / noen*, *mye / mange*, the genitive in *-s* and with *sin* (*Per sin bil*), *til* + genitive, preposition at the
  end (*Hvem snakker du med?*), short answers (*Ja, det gjør jeg*), the modal particles *jo, vel, nok, da, visst* in
  mid-sentence, time expressions (*for … siden*, *om en uke*, *i tre år*), *man / en* as subject, the polite *De*.

### 4.10 Role in the sentence

The role is derived from the chosen reading, so every wrong reading above gives a wrong role, stated plainly: *Han
løftet kassen*: *løftet* is "indirect object (the receiver) of Han". *Han eier huset*: *eier* the same. *Jeg så henne*:
*henne* is "direct object of **Jeg**". *Kan du åpne døra*: *åpne* is "adjective describing døra". *Det var en gang en
konge*: *var* is "copula linking gang to its subject". A predicate adjective is labelled "the main word of the
sentence" (*Rommet er stort*: *stort*), which is a parser convention and reads oddly to a learner. I did not audit the
second half of `syntax.ts` line by line; the role layer deserves its own pass once the readings are right.

### 4.11 Compounds

- Only **noun-headed** compounds are split. Blank: lyseblå, kjempestort, livsfarlig (adjective head); samarbeider,
  videreutvikle (verb head); statsbudsjett, pressekonferanse, prisvekst, barnetrygd, arbeidsledighet, menneskeverd,
  menneskerettigheter, brorskap (a part the list lacks).
- A split compound has **no own meaning** (by design). The dictionary line often has one (*kjøkkenbord*,
  *fotballkamp*, *ungdomsskole*), so the card works there; where Wiktionary lacks the compound the learner gets the
  parts only.
- The linking `-s-` and `-e-` are offered for **every** noun. Which nouns take `-s-` (arbeid-s-, stat-s-, but not
  bil-s-) is not recorded, so wrong splits are possible. The rule that drops a final `-e` from the first part invents
  first parts that do not exist.
- A sentence-initial compound becomes a name (4.5).

### 4.12 Numbers, abbreviations, tokens

- **An en dash glues words together**: *Oslo–Bergen* is one unknown word; so are *1940–45* and *mandag–fredag*.
- No compound numerals (*tjueen*, *trettifem*); no *null*, *milliard*, *halvannen*; ordinals stop at *tiende* in
  Bokmål and *femte* in Nynorsk.
- The accented *én* is unknown; accents are not folded (idé and kafé work only because their rows carry the accent).
- From the code, not probed: an ordinal's dot does not stop a sentence split (*17. mai*, *Harald 5. er konge*); the
  Nynorsk abbreviations *t.d.*, *m.a.*, *osb.* and many Bokmål ones (*mtp.*, *iht.*, *ift.*, *hhv.*, *inkl.*) are not in
  the tokeniser's list.
- Genitive: *Annes*, *Norges*, *guttens*, *dagens* work. The group genitive and the *sin* genitive do not exist.

### 4.13 The pronunciation line

The card prints a respelling made by letter rules. It is wrong for most of the commonest words. From the card:

| Word | Card | Problem |
|---|---|---|
| huset | hewsuht | the `-t` of the neuter definite ending is silent; every *huset, barnet, bordet* is wrong |
| han, kan, skal | haan, kaan, skaal | short vowel |
| vil, til | veel, teel | short vowel |
| den, men, fem, hjem | dayn, mayn, faym, yaym | short e |
| som, om, kom, for, nok | soom, oom, koom, foor, nook | short å-sound, not long oo |
| med, god, rød, tid, brød | mayd, good, röd, teed, bröd | the d is silent |
| her, der, lærer, merke | hayr, dayr, laaruhr, mehrkuh | e before r is æ |
| regn | rehgn | "rein" |
| selv, halv, tolv, sjølv | sehlv, hahlv, (none), shölv | the v is silent |
| verden, ferdig, fordel | vehruhn, fehrdi, forayl | rd: the rule deletes the d everywhere |
| bilde, kunde | biluh, kewnuh | here the d *is* pronounced |
| sove, tog, over | soovuh, toog, oovuhr | long å-sound, not oo |
| stort | stoot | |
| gitar, energi | yeetahr, aynehryi | g before i in a loanword is g |
| skei | skay | sk before ei is "sh" |
| morgen | morguhn | "måårn" |
| restaurant, interessant | rehstaewrahnt, intehrehsahnt | French endings |
| student, stasjon, musikk, universitet | no stress shown | stress is on the last syllable; the respelling never marks stress |
| ost, vogn | (no respelling) | "oost", "vongn" |

Rule faults behind these: vowel length before a single final consonant (wrong for m-final and most function words);
*o* long always "oo"; silent *d* after a vowel not handled; *rd* always silent; *eg+n*, *gn*, silent *v* in *lv* not
handled; g and k softened before i/y in loanwords; no stress for loanwords or for nouns in *for-*; the neuter `-et`
cannot be told from the verb `-et` without the reading, which the function does not get. The scheme itself uses "ay"
for long e and "ew" for u, which an English reader will say as diphthongs. Only seventeen words are listed by hand.
Tone is honestly not claimed.

### 4.14 Nynorsk on the card: the specific faults

- Tables and notes carry **Bokmål labels and examples**: "masculine (en)", "neuter (et)", "en stor bil", "subject
  (jeg, han)", "The genitive is the form + -s (bilens, husets)", number words "en/ett".
- Lemma of *vart, vert, vorte* is "bli".
- *dem* is listed as the object form of *dei*. Nynorsk has no *dem*.
- *hennes*, *endelig*, *syv*, *tyve* are accepted as Nynorsk with no note that they are Bokmål.
- The st-verbs: only *synast* and *finnast* are known; the present in *-st* (*møtest*, *kjennest*, *trivst*) is not
  generated; bogus forms *gjast*, *bast*, *skjast* are.
- Participle agreement (*komen, kome, komne*; *skriven, skrive, skrivne*; *lesen*) does not exist, so *Han er komen*
  and *Boka vert lesen* are blank.
- The a-infinitive is listed in the table but not read as an infinitive in a sentence.
- The feminine of adjectives and determiners is missing except *lita*, *mi*, *di*, *si*, *ei*: no *anna* (fem.),
  *noka*, *eiga*, *inga*.
- The variety note for Nynorsk says it is "read here, not the target of the course", and there is no Nynorsk ladder,
  yet a Nynorsk pack with its own orientation exists. Decide which it is and say so in one place.

### 4.15 Notes on the card that are false or misleading

- Every table says "No Norwegian dictionary table has been imported yet (docs/norway/SPEC.md section 10)". True for
  tables, but the card now has a Wiktionary meaning line, so the sentence reads as if there were no dictionary at all.
  It also sends a learner to a repository file.
- The *liten* table offers *små* **and** *lille* in both the definite-singular and the plural cell, with a note that
  the list "does not say which form is which". *lille* is the definite singular, *små* the plural. This is known
  grammar, not an open question.
- "The definite singular and the plural are the same form; both are cells so that a dictionary table can confirm
  each": there is no dictionary table.
- The verb table says "Not generated: the present participle (-ende) and the participle used as an adjective": honest,
  and a gap a learner meets on every page.
- The orientation says a feminine noun "may be written the old way (en bok, boken) or the newer way (ei bok, boka)".
  "Old" and "new" is the wrong frame; both have been official for a century. Say "as a common-gender noun" and "as a
  feminine noun".

## 5. The "All forms" table: every wrong form found

These are shown to the learner as the forms of the word, and they also decide what the analyser recognises.

### 5.1 Bokmål verbs (347 rows)

- **Wrong class: class 1 (-et/-a) given, the verb is class 2 (-te, -t).** The table shows the non-words in brackets:
  kalle (*kallet, kalla*; correct kalte, kalt), klare (*klaret*; klarte), nevne (*nevnet*; nevnte), tenne (*tennet*;
  tente), fortjene (fortjente), levere (*leveret*; leverte), nøle (nølte), hyle (hylte), bevare (bevarte), lure (lurte),
  åpenbare (åpenbarte), hende (hendte), skylde (skyldte).
- **Wrong forms:** se: imperative *s* (se). be: *b* (be). tilbe: *tilb*. le: *l*, and a passive *les*. skje: imperative
  *skj*, passive *skjes*. spørre: imperative *spørr* (spør). kle: past *kldde*, participle *kldd* (kledde, kledd).
  løfte: *løftte, løftt* (løftet/løfta). slåss: passive *slåsss*. fare: participle *faret* (fart). smelle: *smellet*
  (smelt). enes: past *enedes* (entes). synes: participle *synes* (syntes). treffes: participle *treffes* (truffes).
  forbyde as the dictionary form (forby), with imperative *forbyd*.
- **Missing accepted forms:** lagde/lagd, pleide, bøyde, gledde, ropte, lette, snødde, hengte, knakk, drog.
- **Junk row:** a verb "nei-" marked "(placeholder)" generates *nei-er*, *nei-et*.
- **Duplicate:** lyge and lyve as two verbs.
- **No -s form** for verbs ending in a vowel (ta, gi, si, få, nå, slå, by).
- **Deponents:** eleven listed; missing føles, skilles, eldes, omgås, lengtes, undres, gledes, trenges.

### 5.2 Bokmål nouns (844 rows)

- **m not doubled:** hjem (*hjemene*), rom (*romene*), soverom (*soveromet*), baderom, program (*programer*), sykdom
  (*sykdomen*), dom (*domen*), ungdom, visdom, lam (*lamet*), gram, klem. (The singular *hjemmet*, *rommet*,
  *programmet* are right, so the fault is in the plural and in the compounds.)
- **-um:** museum *museumet* (museet, museer), studium *studiumet* (studiet), evangelium *evangeliumet* (evangeliet).
- **Wrong plural:** sted plural *sted* (steder); parti *parti* (partier); feil *feiler* (feil); kilometer, meter,
  liter with *-e* (no ending); handel *handeler*; mandel *mandeler* (mandler); te *ter, tene* (teer).
- **Wrong gender:** mynt as neuter (*myntet*); it is masculine.
- **Garbage:** mamma *mammaa*; tv *tven, tver*; idé *idéen* (ideen); kafé *kaféen*; klær *klærene* (klærne); søsken
  *søskenene* (søsknene); fremmed *fremmeden*; slags *slagsen*; norsk, engelsk, nynorsk with *-et*; nord *nordet*; sør
  *søret*; tusenvis *tusenvisen* (not a noun); the months with *junien, julien*.
- **-ing nouns** setning, løsning, betydning are masculine only, so *setninga* is unknown, while regjering and melding
  are feminine: inconsistent.
- **Rows that create traps:** voks, sult, under, lære, drikke (see 4.2).
- **Neuter definite plural in -a** only for nouns without a plural ending: *epla*, *kontora* are unknown.

### 5.3 Bokmål adjectives (235 rows)

- **Wrong neuter:** spesiell *spesiellt* (spesielt); kulturell, tradisjonell the same; søt *søt* (søtt); flat *flat*
  (flatt); stygg *styggt* (stygt); tørr *tørrt* (tørt); rask, frisk, falsk, fersk with no *-t* (raskt, friskt, falskt,
  ferskt); sliten *sliten* (slitent); sjalu *sjalut* (no change); sprø *sprøt* (sprøtt).
- **Wrong plural/definite:** morsom *morsome* (morsomme); ensom *ensome*; dum *dume* (dumme); stram *strame*; lokal
  *lokle* (lokale); nasjonal *nasjonle*; internasjonal *internasjonle*; skrevet *skrevete* (skrevne); laget *lagete*;
  blå, grå with *-e* only (plain *blå* is usual); glatt marked invariable (glatte, glattere exist).
- **Nonsense comparison generated and shown:** egnere, helere, halvere, sistere, sistest, nestere, forrigere, sammere,
  levendere, kommendere, fødtere, giftere, dødere, opptattere, forelsketere, lukketere, skrevetere, lagetere,
  politiskere, økonomiskere, praktiskere, fantastiskere, årligere, ukentligere, norskere, velkomnere.
- kjedelig is marked "mer / mest", so the normal *kjedeligere* is unknown. *kjære* is a lemma (it is a form of kjær).
- **A neuter adjective used as an adverb** (*raskt*, *høyt*, *svakt*) is always shown as "adjective, neuter".

### 5.4 Bokmål closed classes (293 lemmas)

- No polite *De / Dem / Deres*; no *hen*; *ingen* and *begge* are determiners only; *annen* is masculine only (no
  *anna*); *selve* is a pronoun.
- Missing subjunctions: selv om (as one), skjønt, inntil, med mindre, hvorvidt, såfremt, liksom.
- Numerals: no *ei* as a numeral; gaps listed in 4.12.
- *samme* is in two lists.

### 5.5 Nynorsk verbs (125 rows)

- **Imperative keeps the j:** *sitj, liggj, leggj, setj, syngj, symj, trekkj, velj, selj, fortelj, tenkj, spørj,
  besøkj, krevj, telj, ønskj, byrj*. Correct: sit, ligg, legg, set, syng, sym, trekk, vel, sel, fortel, tenk, spør,
  besøk, krev, tel, ønsk, byrja. Also gje *gj*, be *b*, skje *skj*.
- **Invented infinitives:** gje gives *ge, ga*; skje gives *ske, ska*.
- **Wrong class:** tene as *tenar, tena* (tener, tente); øve as *øvar, øva* (øver, øvde). The class label "e" stands on
  rows that carry a-verb forms (svare, like, spele, dele, byrje).
- fly: past *fløy* (flaug). bryte: participle column *broten* (brote).
- gi and gje are two verbs.

### 5.6 Nynorsk nouns (261 rows)

- **Typos and garbage:** svar definite plural *svane* (svara); pengar *pengarene* (pengane); foreldre *foreldrene*
  (foreldra); rom *romet* (rommet); kne *knet* (kneet), plural *kna* (knea); tre *tret* (treet); te *ten, tar, tane*
  (teen); evangelium *evangeliumet, evangeliuma* (evangeliet, evangelia); kapittel, eksempel definite plural
  *kapittela, eksempela* (kapitla, eksempla).
- **Wrong gender (nine):** setning masculine (feminine: setninga); historie masculine (historia); gudsteneste
  masculine (gudstenesta); form masculine (forma); mynt neuter (masculine); nåde feminine (masculine: nåden); blome
  feminine (masculine: blomen, blomar); sau feminine (masculine: sauen, sauer); potet masculine with a feminine-type
  plural (see section 9).
- **Wrong plural:** sanning *sanninger* (sanningar: every *-ing* feminine takes *-ar*); gjest *gjestar* (gjester);
  månad *månadar* (månader); sommar *sommarar* (somrar).

### 5.7 Nynorsk adjectives (108 rows)

- **Every -leg adjective has a wrong neuter:** *dårlegt, vanskelegt, vanlegt, tidlegt, farlegt, hyggelegt* (no ending).
- The Bokmål faults repeated: *spesiellt*, *styggt*, *tørrt*, søt, våt, rask, frisk without *-t*, *tome*, *dume*.
- Bokmål lemmas: *ensam* (einsam), *ren* (rein).
- Nonsense comparison: sistare, nestare, førrare, levandare, føddare, giftare, dødare, halvare, heilare, eignare,
  norskare.

## 6. Grammar that is not modelled at all (inventory)

Morphology: present participle; participle agreement and use as an adjective; s-passive of vowel verbs and in the
past; Nynorsk st-present; optative (*leve kongen*); adverbs formed from adjectives; the adjective `-e` form as plural
versus definite; feminine forms of adjectives and determiners in Nynorsk; compound numerals; ordinals above ten;
fractions; group genitive and sin-genitive; diminutives and derivation (-het, -else, -ing, -lig, u-, mis-: a word such
as *umulig* or *vennlighet* is known only if listed); compound adjectives and verbs; abbreviations; accent variants;
valid side forms of the 2005 Bokmål norm and the 2012 Nynorsk norm (only bro/bru is a pair).

Syntax and usage: everything in the last bullet of 4.9; reflexive verbs; verbs with a fixed preposition; the adverb
readings of fortsatt, siden, like, minst, selv, alt, enda, rett; subjunction readings of til, om, selv om; modal
particles; the polite pronoun.

Standards and register: Riksmål forms beyond eight listed pairs; Dano-Norwegian is a list of about eighty pairs plus
three patterns; the period assigned to each pair is the model's guess (the file says so). Faults in that list:
*aldrig* and *saadan* are filed as "Riksmål kept after 1917" (they are pre-1917 spellings); *sne* is filed as "not valid
Bokmål today" (see section 9); a pair *skrive → skrive* maps a word to itself; the Nynorsk pair *elska → elskar* calls a
valid past tense an old spelling of the present. Dialect, spoken forms (*ha'kke*, *æ*, *itj*, *dokker* is blank) and
*kebabnorsk* are out of scope and should be said to be.

## 7. Orientation and course texts

- The orientation and a validation case use **"Barna spiller i hagen"** for "The children play in the garden".
  Children playing is *leker*; *spiller* is for a game, a sport or an instrument. A native reader will stumble on the
  first Norwegian sentence the app teaches.
- The orientation teaches eight nouns and the definite ending and nothing about verbs, word order or sounds. It says
  so.
- I read six of the sixty Bokmål ladder units. They are grammatical and stilted, as their own notice says. Unidiomatic
  wording I saw: "Sam traff mange nye folk" (mange nye mennesker); "Alle er velkomne, gamle og små" (store og små,
  unge og gamle); "Gården lå i fjellet" (på fjellet); "partiet som får mange stemmer, får ordføreren" (flest);
  "Jeg har stemt hver gang fra jeg var liten" (nobody votes as a child); "en bra menighet", "det er bra å få et brev"
  (*bra* is overused; *god*, *fin*, *hyggelig*); "Faren min kjørte, og han kjørte brødet til markedet". There is no
  Nynorsk ladder.
- The frequency list is built from these texts (4.6).

## 8. What to fix first

1. **Stop generating forms from an unchecked list. Take them from a source.** The Wiktionary data already in
   `public/dict/nb` and `nn` holds inflected-form entries ("form of kalle: past"). Use it (a) as the analyser's
   fallback for a word the list lacks, which would turn most blank cards of 4.1 into a lemma, a part of speech and a
   form, and (b) to check every generated form and delete the ones a dictionary contradicts. Better still, import
   Norsk ordbank (Språkrådet's full-form list, both standards, openly licensed) and make it the word list. Either
   needs the owner's yes for the download.
2. **Fix the rows listed in section 5.** Every item there is a known form, not a judgement call. The Nynorsk
   imperative rule, the `-leg` neuter rule, the m-doubling rule and the `-um` rule are each a few lines.
3. **Never call a sentence-initial word a name**; try it in lower case and as a compound first.
4. **Rank homographs by sense**, at least with a hand list: voksen, sulten, under, siden, fortsatt, like, minst, selv,
   lyst, rett, så, si, la, skje, skyld, hans, går in *i går*.
5. **Decide the form when the sentence decides it:** participle after ha / bli / være / få; infinitive after a modal
   or *å*; past after a subject; imperative at the start of a sentence that ends in "!". Then the perfect and passive
   notes fire for class-1 verbs.
6. **Print the adjective `-e` form** as "plural" or "definite" from the neighbours, and print "object form" for
   pronouns.
7. **Stop the false particle-verb hits** (4.7) and show the particle's own meaning first.
8. **Give Nynorsk its own explanation texts, labels and examples**, its weekdays and numbers, and follow "alternative
   form of" in the Nynorsk dictionary so that the meaning line shows a meaning.
9. **Take the respelling off the card** until it is right for the two hundred commonest words, or replace it with
   Wiktionary's IPA where there is one.
10. Replace "Barna spiller i hagen" with "Barna leker i hagen" everywhere it is taught or tested.
11. Build the frequency list from a real corpus.

Until at least 1 to 5 are done I would label Norwegian "preview" in the language chooser, not merely "experimental",
and keep Nynorsk out of the chooser.

## 9. Limits of this audit

- I am a language model, not a native speaker, and I looked nothing up: no download and no web lookup was made. The
  correct forms I give are standard Bokmål (2005 norm) and Nynorsk (2012 norm) as I know them. I am confident of
  almost all of them. Check these before acting on them: Nynorsk *potet* (I believe feminine; masculine also occurs);
  whether *sne* is still an accepted Bokmål side form of snø (I believe it is); whether *kun* and *nå* are accepted
  in Nynorsk; the Nynorsk participle column for bryte.
- Not audited: the second half of `syntax.ts`, `production.ts`, `table-tags.ts`, the Stage 0 scenes and sounds, the
  gold test sets, 54 of the 60 ladder units, and anything in GoReview's Norwegian questions.
- The "wrong" and "undecided" counts in section 2 are hand counts.
- A real audit of Norwegian needs a native reviewer for register, idiom and the spoken reference. Nothing here
  replaces that; it shows that the content is not yet worth a native reviewer's time until the list is rebuilt from a
  source.
