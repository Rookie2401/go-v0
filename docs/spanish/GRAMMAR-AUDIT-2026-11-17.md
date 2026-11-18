# Spanish grammar audit (pack `es`, target Honduras), 2026-11-17

Auditor: a grammar-audit agent (an AI model, not a native speaker; nothing was looked up). Code audited: the shared clone
at master `985c742b`, adapter `adapter-es@12`. Brief from the owner: audit the linguistic content, be brutal, note every
missed feature and detail, and weigh every finding against what the GoLearn card actually shows.

## 1. Verdict

Spanish has the best verb engine of the languages audited so far and a word list that is far too small for it. It is
usable on the course's own beginner texts and unreliable on anything else.

- **The verb engine is right.** I read every generated form of the 361 listed verbs and then checked all 24,902 verb
  cells mechanically against the Wiktionary tables the card merges in: 24,344 are identical (97.8 %); what differs is
  two impersonal verbs, one verb the dictionary has no table for, four older spellings of *huir*, and **nine wrong
  forms**, all in the voseo cells of six verbs (*vos dás, vos dés, vos vés, vos ís, réí, sonréi, fréí* …, section 5). Stem changes, yo-forms, spelling changes, strong preterites, irregular futures, both imperfect
  subjunctives, the future subjunctive, vos / vosotros / usted commands and irregular participles are all generated and
  recognised. Attached pronouns are a strength: *dámelo, díselo, diciéndoselo, vámonos, sentémonos, dánoslo, decime,
  callate* are split correctly, each pronoun is named, and the accent is handled.
- **The word list is 1,812 lemmas (361 verbs, 863 nouns, 210 adjectives), and every word outside it falls to a guesser
  that invents words.** *radio* (after *la*) is shown as a verb "radiar", first person singular; *orden* as a verb
  "ordar", third person plural present subjunctive; *colonia* as a noun "colonio"; *cuidadosamente* as the present
  subjunctive of a verb "cuidadosamentar"; *sexto* as a verb "sextar"; *EE. UU.* as a verb "ear". Any unknown noun in *-ción, -dad, -or, -al* is blank or a verb. On 613 words of ordinary
  Spanish the card was blank for 1.1 %, guessed for 6.5 % (more than half of the guesses with an invented lemma) and
  wrong although confirmed for about 4 %.
- **The meaning line is wrong for whole classes of form.** Every past participle is glossed with the English *-ing*
  form (*hecho* "doing", *dicho* "saying", *muerto* "dying"). Every verb with *usted / ustedes* is glossed "He, she, or
  it" / "They" (*Ustedes tienen razón*: "They have"), and every *usted* command "Let him, her, or it …" (*Siéntese*:
  "Let him, her, or it seat"). *hay / había / hubo* are "He, she, or it has / I had". Reflexive verbs keep the meaning
  of the plain verb (*Me llamo Marta*: "I call"; *Acordate de mí*: "Agree on!"). *estoy* shows the cut-off gloss
  "I am (state".
- **First and third person are never told apart.** Wherever the two share a form (imperfect, conditional, every
  subjunctive) the card says "first person singular", also with the subject standing before the verb: *Que Dios te
  bendiga*, *Mi esposa todavía dormía*, *Ojalá que llueva*, *Venga tu reino*, *Santificado sea tu nombre*.
- **Text typed without accents or ñ is not handled at all**: 0 of 16 probes right, and no card says that an accent is
  missing. *Tengo veinte anos* shows the dictionary line "anus". *éste, ése, aquél* (the spelling of the Reina-Valera
  1960 and of every book before 2010) are blank or read as "es + te".
- **Honduras**: voseo is real and good (forms generated, recognised, labelled, with a sound note). The Honduran word
  stock is 18 tagged words; *maje, púchica, bus, goma, milpa, colonia, cheque* ("OK"), *vaya pues, fijate* are unknown
  or wrong. *Ustedes* is listed but its verb is glossed "They". Peninsular forms are recognised and labelled.
- Unlike what the brief assumed, **Spanish has a second source for "All forms"**: `public/dict/es/full` holds Wiktionary
  tables and the popup merges them with the generated table (section 3). That merge works, and it brings eleven wrong
  cells of its own (*sobrina*, plural "sobrinos"; *bueno*, masculine singular "before a noun buen").

## 2. How this was audited, and the numbers

1. Read the adapter: `es.ts`, `morphology.ts`, `verb-regular.ts`, `verb-stem.ts`, `verb-irregular.ts`, `verbs.ts`,
   `morph-nominal.ts`, `morph-clitics.ts`, `paradigm.ts`, `constructions.ts`, `entries.ts`, `varieties.ts`, every
   lexicon file, the pack and the orientation. **Not read line by line**: `disambiguate.ts`, `syntax.ts`, `phrases.ts`,
   `historical.ts`, `sentences.ts`, `morph-orth.ts`, `morph-verbcands.ts`, `table-tags.ts`; they were tested through
   the probes only.
2. Dumped every generated form of every verb, noun and adjective row and the closed classes (`dump.mts`) and read it:
   all verbs in full or in a 20-form diagnostic line (the 104 plain regular *-ar* verbs after the first 125 lines were
   checked by the machine comparison only), all 863 noun plurals and genders, all 210 adjectives with feminine,
   plurals and superlative, all closed-class rows. Also dumped 147 further verbs through the same generator.
3. Compared every generated cell with the Wiktionary table as the popup merges it (`merged.mts`, `merged2.mts`).
4. Ran **699 word-in-sentence probes** through the card's own `parseSelection` and the dictionary lookup, plus 18
   pronunciation probes and 8 with the full notes.
5. Ran **613 words of running text** word by word (everyday narrative, a news paragraph, a Honduran conversation with
   voseo, article 1 of the human-rights declaration, the Lord's Prayer and John 3:16 in the Reina-Valera 1960 wording).
6. Checked two lists of everyday words against the word list, and ran Stage 0 (519 words) and twelve ladder units
   (13,112 words) through the same counter.

All inputs, outputs and scripts are in `C:\Users\CJWal\dev\tmp-mem\esaudit\`.

| Measure | Spanish |
|---|---|
| Word list | 1,812 lemmas: 361 verbs, 863 nouns, 210 adjectives, 132 names, 246 closed-class words, adverbs and interjections |
| Running text: blank card | 7 of 613 (1.1 %) |
| Running text: marked guess (unconfirmed) | 40 (6.5 %); 22 of them with a wrong lemma |
| Running text: ordinary word shown as a name | 3 (0.5 %) |
| Running text: confirmed reading | 563 (91.8 %) |
| Running text: reading or meaning wrong although confirmed (hand count) | about 24 (3.9 %): 10 "first person" for a third person, 5 participles glossed "-ing", 9 wrong word or sense |
| Running text: left in the wrong tense although the text decides (hand count) | 3 |
| Targeted probes: blank card | 21 of 699 |
| Targeted probes: marked guess | 91 of 699 (6 of them names) |
| Text typed without accents or ñ: right reading | 0 of 16 |
| Everyday words missing from the list, neutral list by category | 30 of 391 (8 %) |
| Everyday words missing, second list (news, church, Honduran speech, words that failed in probes) | 167 of 295 (57 %) |
| Generated cells identical to the Wiktionary table | 25,729 of 27,597 (93.2 %); verbs 24,344 of 24,902 (97.8 %) |
| Wrong generated forms found | 16 in 1,434 rows (9 verb, 5 adjective, 2 missing noun plurals), plus 11 wrong cells from the merge |
| Stage 0 scenes: blank / guessed | 0 / 0 of 519 words; 5 wrong words and 6 wrong meanings although confirmed (not counting the cut-off gloss on every form of estar) |
| Twelve ladder units: blank / guessed | 104 (0.8 %) / 815 (6.2 %) of 13,112 words |

The second word list was chosen after the probes, so its 57 % is not a coverage figure; the 8 % and the running-text
rows are. Hand counts could be off by a few either way.

## 3. What the card shows, and what is wrong with each part

| Part of the card | State | Section |
|---|---|---|
| Lemma, part of speech | Right for listed words. Unlisted words: blank (1.1 %) or a guess (6.5 %) that invents a lemma more often than not | 4.1, 4.2 |
| Form line | Excellent for verbs; first / third person never decided; common-gender nouns not narrowed by the article | 4.4 |
| Own meaning | Wrong for participles, usted / ustedes, existential haber, reflexive verbs, usted commands; one cut-off gloss | 4.5 |
| Word parts (verb + pronouns) | Correct and clear; reflexive *te / nos* called "object pronoun" | 4.6 |
| Fixed phrases | About 190 by the adapter's own count (I did not count them); the ones I probed are reliable (*a lo mejor, sin embargo, darse cuenta de, echar de menos, hacer falta*) | 4.9 |
| Grammar notes (constructions) | 23 notes, correctly worded; five fire where they do not apply; a filler note on almost every word | 4.8 |
| Role in the sentence | Mostly sound; wrong when the reading is wrong, and a direct object is still labelled "the" | 4.3, 4.10 |
| Dictionary meaning line | Often an obscure, foreign or vulgar sense first | 4.11 |
| "All forms" | Generated table merged with the Wiktionary table: 93 % of cells agree. Wrong cells in section 5 | 5 |
| Pronunciation | Letter notes only, no respelling; monosyllables get a wrong stress note | 4.12 |
| Variety label | voseo, vosotros, es-HN, es-CA, es-ES and older Spanish are labelled correctly | 4.7 |

**The second source.** `public/lexicon/` has nothing for Spanish, but `public/dict/es/full` has 2,049 files of full
records, and `packages/golearn-extension/src/content/enrich.ts` (`buildParadigm`) merges the record's table with the
adapter's cells. I measured the merge over the whole word list: of 1,434 verb, noun and adjective lemmas one has no
record (*baleada*) and seven have a record without a table. A cell where the two differ shows the dictionary form
first and the generated one as an alternative; a cell only the rules have is shown unverified. So most wrong
generated forms are corrected on the card, and the ones in a cell the dictionary lacks (*dás, vés, ís, marrona,
cortesa*) are shown as they are.

## 4. Findings on the card

Every line was seen through the probe unless marked "from the code". "Guess" means the card marks the reading
unconfirmed, gives no meaning of its own, and shows the dictionary meaning under it.

### 4.1 The guesser invents words

The rules are: an unknown word that could be a verb form is one; an unknown word in *-a* belongs to an invented
masculine in *-o*, listed first; an unknown word in *-mente* is a verb in *-mentar*.

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| Escucho la radio. | radio | **radiar**, verb, first person singular present | la radio, noun |
| El orden es importante. / Le dio una orden. | orden | **ordar**, verb, third person plural present subjunctive | el orden / la orden, noun |
| Vivo en el tercer piso. | tercer | **tercer**, verb, infinitive | short form of tercero |
| Es el sexto día. | sexto | **sextar**, verb, first person singular | ordinal sexto |
| Ello no importa. | Ello | **ellar**, verb | pronoun ello |
| Vive en EE. UU. desde niño. | EE | **ear**, verb, first person singular present subjunctive | abbreviation of Estados Unidos |
| Habló lenta y cuidadosamente. | cuidadosamente | **cuidadosamentar**, verb, present subjunctive | adverb, from cuidadoso |
| Simplemente no quiero. | Simplemente | **simplementar**, verb | adverb |
| (text) probablemente, gravemente, fraternalmente | | **probablementar, gravementar, fraternalmentar** | adverbs |
| Vive en una colonia. | colonia | noun **colonio**, feminine | colonia |
| Mi papá trabaja en la milpa. | milpa | noun **milpo** | milpa |
| El águila vuela alto. | águila | noun **águilo** | el águila (feminine) |
| El cura habló en la misa. | cura | noun **curo** | el cura |
| Compré una docena de huevos. | docena | noun **doceno** | docena |
| La carpeta … / Voy a la librería. | carpeta, librería | **carpeto**, **librerío** | carpeta, librería |
| Gloria a Dios en las alturas. | alturas | noun **alturo** | altura |
| (text) conferencia, prensa, cifras, alcaldías | | **conferencio, prenso, cifro, alcaldío** | conferencia, prensa, cifra, alcaldía |
| Una situación económica difícil. | económica | **noun** económico | adjective |
| (text) dignidad, voluntad | | verbs **dignidar**, **voluntar** | nouns |
| (text) ruido, fila, desempleo | | verbs **ruir**, **filar**, **desemplear** | nouns |
| (text) dulces / exige | | noun **dulz** / verb **exiger** | dulce / exigir |
| Averigüé la verdad. | Averigüé | **averigüar** (the note "Voseo" is attached) | averiguar |
| Siempre venzo. / Recojo a los niños. | venzo, Recojo | **venzar**, **recojar** | vencer, recoger |
| Yo rehíce el trabajo. | rehíce | **rehizar**, present subjunctive | rehacer, preterite |
| Fijate bien. (also in the conversation text) | Fijate | **fijatar**, first person singular present subjunctive | fijar + te, vos command |
| Líbranos del mal. | Líbranos | noun **líbrano**, plural | librar + nos, command |
| ¿Qué onda, maje? | maje | **majar**, verb | maje, noun (Honduran) |
| Está bien macizo. / ¡Qué chilero! | macizo, chilero | **macizar**, **chilerar**, verbs | adjectives |
| Voy a agarrar un taxi colectivo. | colectivo | **colectivar**, verb | adjective / noun |
| Le dio un golpazo. | golpazo | **golpazar**, verb | golpe + -azo |
| Adiós, mamita. / Mi papito lindo. | mamita, papito | **mamitar**, verb / noun **papo** | mamá, papá + -ita / -ito |
| Vive cerquita. | cerquita | noun **cerquito**, "direct object" | cerca + -ita, adverb |
| Muchísimas gracias. | Muchísimas | noun **muchísimo** | mucho, superlative |
| Sin embargo, no vino. | embargo | **embargar**, verb (the phrase "sin embargo" is shown beside it) | noun, part of the phrase |
| Cayeron dos regímenes. / Los caracteres chinos | | **regimen**, **caracter** (no accent) | régimen, carácter |
| Unos clubes de fútbol. | clubes | **clube** | club |
| El ornitorrinco nada. / Compré un smartphone. | | **ornitorrincar**, **smartphonar**, verbs | nouns |
| pingüino, chico (each selected alone, no sentence) | | **pingüinar**, **chicar**, verbs | nouns |

In almost every one of these the dictionary line under the guess has the right word ("radio (device)", "order
(command)", "carefully", "cornfield", "apocopic form of tercero"); it has nothing for *EE* and *güirra*. The
dictionary holds 808,278 entries with "form of" records; the guesser never asks it.

**Words on the list that still fall to the guesser** because a rule is missing: *taxis* and *espíritus* (no plural is
generated for a noun in unstressed *-i* or *-u*), *millones* (*millón* is listed as a numeral with one form),
*poquito* (*poco* is listed only as determiner and adverb).

### 4.2 Blank card

- **Any unlisted singular noun that ends in a consonant** (the guesser has no rule for it): *investigación, inflación,
  oposición, inversión, educación, tentación, población, burocratización, televisor, quintal, crisis, bus*. In the
  ladder sample: *capitán, virtud, gratitud, intención, atención, función, información, colección, preparación,
  carácter, temor, horror, balcón, cajón, cartón, caracol, internet, red, web*.
- **Adverbs in -mente from an unlisted adjective, when no verb can be invented**: *increíblemente*.
- **Superlatives the rules build wrongly or not at all**: *felicísimo, sucísimo, bonísimo, fortísimo*.
- **Accent pairs**: *aun* (without accent), *término*, *Ése*, *Aquél*.
- **Modern spelling of a verb form**: *Hui* (the engine only writes *huí*).
- **Abbreviations**: *Uds., p. ej., etc.* (and *Ud., Sr., Sra., Dr.* are shown as unconfirmed **names**).
- **Words typed without accents**: *senor, corazon*.
- **Honduran everyday word**: *bus*.

### 4.3 Wrong reading shown as confirmed

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| La vi ayer en el mercado. / No la conozco. | La, la | **article "the"**, with the role "direct object of vi" | object pronoun, "her / it" |
| Los compré en la pulpería. / Las conozco bien. | Los, Las | article "the" | object pronouns |
| Se lo di ayer. | Se | "oneself (reflexive clitic)", role "indirect object" | se standing for le / les, "to him, her, them" |
| Ayer vino mi hermano. | vino | noun, "wine" | venir, preterite |
| Traje pan. | Traje | noun, "suit; costume" | traer, preterite |
| Sal de aquí. | Sal | noun, "salt" | salir, command |
| Sed santos, porque yo soy santo. | Sed | noun, "thirst" | ser, vosotros command |
| Idos de aquí. | Idos | ir, past participle masculine plural, "going" | irse, vosotros command |
| El bus para aquí. | para | preposition "for" (the verb is not even an alternative) | parar, third person |
| Ella nada muy bien. | nada | pronoun "nothing" (no alternative) | nadar, third person |
| Entre, por favor. | Entre | preposition "between" (no alternative) | entrar, usted command |
| Como pan todos los días. | Como | conjunction "as, like; since" | comer, first person |
| Ahora bajo. | bajo | preposition "under" | bajar, first person |
| Todos los días camino al trabajo. | camino | noun "road" | caminar, first person |
| Espera un momento. | Espera | noun "wait" | esperar, command |
| Suelo levantarme temprano. | Suelo | noun "floor, ground" | soler, first person |
| Vivo en Honduras. (Stage 0) | Vivo | adjective "alive; lively" | vivir, first person |
| Mucho gusto. (Stage 0, four times) | gusto | **gustar**, verb, "I am pleasing" | noun gusto (not on the list) |
| el caso todavía se investiga | caso | **casar**, "I marry off" | noun caso (not on the list) |
| va a haber comida | comida | comer, past participle, "eating" | noun comida |
| El gobierno anunció nuevas medidas. | medidas | medir, past participle, "measuring" | noun medida |
| el reino, y el poder, y la gloria | poder | verb, infinitive, "to be able to" | noun, "power" |
| líbranos del mal | mal | adverb "badly" | noun, "evil" |
| Hace mal tiempo. | mal | adverb "badly", "adverb of Hace" | short form of malo |
| Puse la carta en el sobre. | sobre | preposition | noun, "envelope" |
| Me gusta el este del país. | este | determiner "this" | noun, "east" (norte, sur, oeste are listed; este is not) |
| El Papa vive en Roma. | Papa | papa, feminine, "potato" | el Papa |
| No tengo capital para el negocio. | capital | feminine, "capital city" | el capital, "funds" |
| Fui a la corte. | corte | masculine, "cut" | la corte, "court" |
| La policía informó … | policía | "police officer" | the police |
| Lo hizo por sí mismo. | sí | interjection "yes" | reflexive pronoun |
| He aquí el Cordero de Dios. | He | haber, "I have" | he aquí, "behold" |
| Me gusta éste. | éste | **ser**, third person, "és + te: object pronoun", with the note on pronouns after a conjugated verb | demonstrative pronoun |
| Éstos son mis hijos. / No quiero ésta. | | guess, noun **ésto** | demonstrative pronouns |
| Dolores vive en La Ceiba. / Rosa compró flores. / Ángel no vino. | | dolor "pain" (plural, "direct object"), rosa "rose", ángel "angel" | names |
| Todo cheque. | cheque | "cheque" | Honduran "fine, OK" |
| Vaya pues. / Va pues. | Vaya, Va | ir, "first person singular present subjunctive" / "He, she, or it goes" | set phrases of agreement |

Why (from the code): a closed-class row (*para, nada, entre, sobre, este, sí, la, los, las*) blocks every other reading
unless the word is on a three-word exception list (`ALSO_VERB`: como, salvo, bajo); and a noun that is on the list
outranks the same form of a listed verb at the start of a sentence (*Sal, Traje, Espera, Sed*).

### 4.4 The form line

- **First or third person.** The card always prints "first person singular" for a form shared by both persons:
  *Que Dios te bendiga, Dios le bendiga, Ojalá que llueva, Dudo que lo sepa, No creo que haya tiempo, Espero que hable,
  Espero que esté bien, Quiero que me dé un vaso, Me gustaría un café, Podría ayudarme, Mi esposa todavía dormía, la
  calle estaba llena, el aire estaba limpio, El mercado estaba lleno, Hacía más frío, que acababa de regresar, que se
  aumente la inversión, Venga tu reino, Santificado sea tu nombre, Sea lo que fuere, Como si fuese fácil*. In several
  the subject noun stands right before the verb (*la calle estaba, el aire estaba, El mercado estaba, Dios te
  bendiga*). The meaning line then says "I was sleeping", "I was (state".
- **Command or statement.** *Habla más despacio, por favor*: "third person singular, present indicative, He, she, or
  it speaks". *¡Oye!*: "He, she, or it hears". *Hable más despacio, por favor*: "first person singular, present
  subjunctive". *Pasen adelante*: "third person plural, present subjunctive". *Comamos juntos*: "present subjunctive".
  The command reading exists in each case and is not chosen. (*Ten, Pon, Ven, Di, Haz, Sé, Ve, Hablá, Tené, Vení,
  Hablad* are right.)
- **Preterite or present of -amos / -imos.** *Hablamos con ella ayer*: "present indicative, We speak"; in the
  narrative *Nos quedamos platicando, apagamos el televisor, nos acostamos* are all present.
- **Gender of a noun of both genders** is not taken from the article: *La estudiante, El policía, La policía* all show
  "singular". *Los lunes*: "masculine", no number.
- *no se pierda* (John 3:16): "third person singular", no tense or mood (an old hand-written row).
- Good: *fui / fue* as ser or ir is decided correctly in all four probes; *di, ve, ven, sé, siento* (sentir / sentar),
  *vino* after *El*, *cara, cuenta, cocina, trabajo* likewise.

### 4.5 The meaning line

| Class | The card shows | Correct |
|---|---|---|
| Every past participle | *hecho* "doing", *dicho* "saying", *visto* "seeing", *puesto* "putting", *escrito* "writing", *vuelto* "returning", *roto* "breaking", *muerto* "dying", *comido* "eating", *llovido* "raining", *dado* "giving", *detenidas* "stopping", *herido* "wounding", *construida* "building" | done, said, seen, put, written, returned, broken, dead, eaten, rained, given, detained, wounded, built |
| Verb with usted / ustedes | *Usted tiene razón* "He, she, or it has"; *¿Cómo está usted?* "He, she, or it is (state"; *Ustedes tienen razón* "They have"; *¿Ustedes vienen mañana?* "They come"; *¿Qué quieren ustedes?* (Stage 0) "They want" | You have; you are; you (plural) have … |
| usted / ustedes command | *Siéntese* "Let him, her, or it seat"; *Siéntense* "Let them seat"; *Tráigamelo* "Let him, her, or it bring"; *Póngase cómodo* "Let him, her, or it put"; *Díganme* "Let them say" | Sit down; Bring it to me; Make yourself comfortable; Tell me |
| Existential haber | *Hay tres libros* "He, she, or it has"; *Había mucha gente* "I had"; *Hubo un accidente* "He, she, or it had"; *Habrá mucha gente* "will have"; *hay pan y arroz* (Stage 0) | there is / are, there was, there will be |
| Reflexive verbs | *Me llamo Marta* "I call"; *¿Cómo se llama usted?* "He, she, or it calls"; *Levántate* "Raise!"; *Sentate* "Seat!"; *Acordate de mí* "Agree on!"; *Arrepentíos* "Make sorry! (plural)"; *Me siento aquí* "I seat"; *Se casa mañana* "marries off" | I am called; Get up; Sit down; Remember me; Repent; I sit down; gets married |
| estar | *Estoy* "I am (state"; *Estamos* "We are (state"; *Estáis* "You (plural) are (state" (the gloss "to be (state/location)" is cut at the slash) | I am |
| Impersonal verbs | *Llueve* "He, she, or it rains"; *Hace calor* "He, she, or it does"; *Hacía más frío* "I was doing" | it rains; it is hot |
| Passive | *Hágase tu voluntad* "Let him, her, or it do"; *Se venden casas* "They sell" | be done; are sold |
| Adverb in -mente | *Felizmente* "happy"; *Actualmente* "current, present-day"; *ligeramente* "light (weight)" | happily; currently; slightly |
| The preposition a | every *a* (*a las cinco, a Tegucigalpa*) "to, at (personal a)" | "to, at" |
| First sense only | *me contó* "counted"; *deben* "They owe"; *¿qué le pasó?* "passed"; *Debe de estar* "owes" | told; must; happened |
| que after a comparative | *más alto que yo*: "that" | than (the comparison note is shown beside it) |

### 4.6 Attached and free pronouns

Right, with parts and accent: *Dámelo, Dímelo, Díselo, Cómpratelo, Póntelo, Tráigamelo, dánoslo, decírselo,
diciéndoselo, lavándose, sentarse, sentarme, hacerlo, verla, comprarlas, creerlo, irme, pasándola, Levántate, Cállate,
Vete, Hazlo, Ponlo, Dime, Dale, Ayúdame, Perdónanos, Escúchame, Démosle, Vámonos, Sentémonos, Durmámonos, Siéntese,
Siéntense, Póngase, Díganme, Hágase, Amaos, Sentaos, Arrepentíos*, and the voseo forms *Decime, Decile, Sentate,
Mirame, Callate, ayudame, Quedate, Acordate, cuidate*. *se* before *lo* is named "indirect object pronoun" inside
*Díselo*.

Wrong or missing:
- the reflexive *te, nos, me* is called "object pronoun" (*Levántate, Vámonos, sentarme*); only *se* is called
  reflexive;
- *Idos* (4.3); *Fijate, Líbranos* (4.1): the split fails whenever the verb is not on the list;
- free *la, los, las* before a verb are articles (4.3); free *se* for *le* is "oneself" (4.3);
- *Se me olvidó el libro*: *me* is "direct object of olvidó"; nothing says what this *se* is;
- *Le vi ayer* (leísmo) and *La dije que viniera* (laísmo) pass without a note; neither is modelled.

### 4.7 Honduras, voseo, ustedes, and the forms of Spain

**Voseo: sound.** *tenés, sos, querés, hacés, podés, venís, sabés, llamás; preocupés, digás; hablá, tené, vení, tomá,
mirá, andá, llevá* and the forms with pronouns are read correctly, labelled "Variety: voseo" and given the note
"In Honduras and much of Central America vos replaces tú …". *vos* itself is listed. Faults: the tables give *vos dás,
vos vés, vos ís* (section 5); the voseo note also appears on *Asistí a la reunión* (a first person preterite),
*Espero que estés bien* and the guess for *Averigüé*; the present subjunctive *vos estés* duplicates tú.

**Ustedes.** The pronoun is listed and glossed "you (plural)". Its verb is glossed "They …" every time (4.5). Nothing
on the card says that ustedes is the only plural "you" of Honduras except the note on the vosotros forms.

**Vosotros and Spain: recognised.** *tenéis, sois, queréis, habéis, estáis, temáis, Amad, Venid, haced, Hablad, os,
vuestros* are read correctly and labelled "vosotros" with the note "used in Spain". *ordenador, zumo, móvil, patatas*
are labelled es-ES with the Latin American word named. *coger* carries a warning about its vulgar sense. Wrong: *Sed
santos* and *Idos* (4.3); *Vale* is only "is worth"; *tíos* only "uncles"; *Mola* is a guess.

**Honduran and Central American words.** Tagged and right: *lempira, cipote, cipota, catracho, catracha, baleada,
minuta, rapidito* (es-HN); *pulpería, pisto, chele, lapicero, comal, cuajada, mijo, mija, atol, nacatamal* (es-CA).
That is 18 words. Not known (check each with a Honduran speaker; the meanings are from my own knowledge):

| Word | The card shows | Honduran use |
|---|---|---|
| bus | blank | the everyday word for a bus |
| maje | verb "majar" | "dude", form of address |
| cheque | "cheque" | "fine, OK" |
| ¡Púchica! | noun "púchico" | mild exclamation |
| goma | noun "gomo" | hangover (and "rubber" is missing too) |
| macizo | verb "macizar" | "great, solid" |
| güirra / güirro | noun "güirro", no dictionary meaning | child |
| chigüines | guess, lemma chigüín | children |
| milpa, colonia, champa | "milpo", "colonio", "champo" | cornfield; neighbourhood; hut |
| fresco | adjective "fresh; cool" | soft drink |
| vaya pues, va pues | forms of ir | "all right then" |
| fijate (que) | verb "fijatar" | "listen, you know" |
| Primero Dios / Si Dios quiere | "first" + "God" | "God willing" |
| mamita, papito | "mamitar", "papo" | everyday forms of address |

On the dictionary line a Honduran word can show the wrong country's sense first: *cipote* "penis, cock", *rapidito*
"quickie (quick sex)", *chele* "sleep (in the corner of the eye)", *papito* (through the guess *papo*) "… ; vagina".

### 4.8 Grammar notes (constructions)

The 23 notes are correctly worded. What goes wrong is where they fire.

- **"Se: impersonal or passive"** is attached to every sentence that opens with *se* and a third-person verb, including
  the commonest reflexives: *Se llama Pedro, Se levanta a las seis, Se visten rápido, Se casa mañana, Se puso a llorar,
  Se volvió loco, Se cayó el vaso, Se rieron de mí, no se pierda* (all nine probes of that shape with a reflexive
  verb). Right on *Se habla español, Se venden casas, Aquí se come bien*.
- **"Voseo"** on *Asistí a la reunión*, *Espero que estés bien*, *Averigüé la verdad*.
- **"Future subjunctive (older Spanish)"** on *Ellos prefieren el té* (from a discarded guess, lemma "prefer").
- **"Personal a"** on *Bienvenidos a Honduras*; absent on *Busco a mi hermano* and *Vi a tu hermano* (it needs a name
  or *todo, alguien, nadie, quién* after the *a*; from the code).
- **"Preterite"** appeared on *Empecé* and *amó* and on no other preterite I probed (*habló, comieron, Busqué, Pagué,
  pidió, Tuve, dije* …). From the code: it asks for a feature that only the few preterite forms written out in the
  old hand list carry. "Imperfect" appears for all verbs.
- **"lo siento = I am sorry"** on *Si lo sintiera, lo diría*.
- Almost every card carries a note of the kind "third person singular, present indicative: The form shows these
  features; the pack has no separate explanation for this combination." It says nothing and fills the card.

No note exists for: the passive with *ser* (*Las cartas fueron escritas por María*, *fue construida por*); *hay*;
*hace* + time (*Hace dos años que vivo aquí*); *tener* + age (*Tiene veinte años*); por against para; ser against
estar beyond adjectives; the negative command; *al* + infinitive; leísmo; the accidental *se me olvidó*.

### 4.9 Fixed phrases

Good and reliable: *ir a, acabar de, tener que, hay que, volver a, soler, dejar de, ponerse a, seguir* + gerund,
*llegar a, a lo mejor, sin embargo, por supuesto, de vez en cuando, tal vez, así que, a pesar de, cerca de, detrás de,
darse cuenta de, echar de menos, hacer falta, hacer calor, tener hambre / razón / cuidado / éxito, dar las gracias,
buenos días, mucho gusto, con permiso, por favor, de nada, lo siento, qué tal, cómo estás, por la mañana*.

Missing: *he aquí; sobre todo; tener … años; de veras; Primero Dios; si Dios quiere; vaya pues; fijate que; hace* +
time; *lenta y cuidadosamente* (the shortened first adverb is shown as an adjective, "verb that completes Habló").
The word inside a phrase keeps a wrong reading of its own: *embargo* "embargar", *gusto* "gustar", *supuesto*
"supposing", *pesar* "to weigh".

### 4.10 Role in the sentence

Mostly sound: subjects, direct and indirect objects, "auxiliary of comido", "clause that completes Quiero",
"adverbial clause of viajaría" are right. Wrong labels seen: *Dolores vive* "direct object of vive"; *Vive cerquita*
"direct object"; *¿Tenéis hambre, tíos?* "renames hambre"; *Hace un calor del diablo, vos* "renames diablo"; *Se me
olvidó* *me* "direct object"; *Hace mal tiempo* "adverb of Hace". A predicate adjective is "the main word of the
sentence" and the subject is "subject of largo", a parser convention that reads oddly.

### 4.11 The dictionary meaning line

First sense shown: *al* "initialism of América Latina"; *como* "Como (a city and comune … Lombardy"; *si*
"abbreviation of Sinaloa: a state of Mexico"; *sí* "hello? (used when answering a phone call)"; *me* "Used as an
emphatic pronoun or as an expletive; initialism of muerte …"; *te* "yourself; The name of the Latin script letter
T/t"; *les* "the (plural)" (not Spanish at all); *policía* "Civility, polity, public order …"; *papa* "pope" before
"potato"; *San* "financial, temporal-savings scheme"; *mayor* "of age; adult" for *hermano mayor*; *Ud* "alternative
form of oud". For *Tengo veinte anos* the line reads "anus" and nothing says an ñ may be missing. *baleada* has no
dictionary meaning.

### 4.12 Pronunciation notes

There is no respelling, only letter notes. *pan* and *tres* get "stress is on the next-to-last syllable" (they have
one syllable); *el* gets "stress is on the last syllable". Nothing is said about *gu* before e / i (*guerra*), *gü*
(*pingüino*), *rr* and initial *r* (*perro*), *b* and *v* (*vaca*), *x* in *México*, *ch*, final *d*, or the sounds of
Honduran speech. The notes that do appear (silent h, ll, ñ, c / z, j / g, qu) are right.

### 4.13 Accents: the pairs, and text without them

The pairs are decided correctly when the accent is written: *el / él, tu / tú, mi / mí, si / sí, se / sé, de / dé,
te / té, mas / más, que / qué, como / cómo, cuando / cuándo, donde / dónde, quien / quién, este / esté, esta / está,
hablo / habló, hable / hablé, termino / terminó, papa / papá, solo / sólo, aún*. Exceptions: *aun* (blank), *término*
(blank), *éste, ésta, éstos, ése, aquél* (4.2, 4.3), *ingles* (a guess, right lemma).

Without accents nothing works, and no card mentions the possibility:

| Typed | The card shows | Meant |
|---|---|---|
| Manana voy a la iglesia. | verb **mananar** | mañana |
| Como estas? | estas: determiner "this" | estás |
| El nino esta en la escuela. | **ninar**, verb; esta: determiner | niño; está |
| Que paso ayer? | pasar, "I pass" | pasó |
| Tengo veinte anos. | ano, dictionary line "anus" | años |
| Que estes bien. | verb **ester** | estés |
| Yo tambien quiero cafe. | **tambiar**, **cafar**, verbs | también, café |
| El hablo conmigo ayer. | "I speak" | habló |
| Si, senor. | blank | señor |
| Feliz cumpleanos, mama. | **mamar**, verb | mamá |
| nos vemos despues | noun **despue**, plural | después |
| Mi corazon es tuyo. | blank | corazón |
| Donde esta el bano? | **banar**, verb | baño |
| No se que hacer. | se: "oneself" | sé |

The adapter already builds an accent-folded index of the word list (`foldLookup` in `es.ts`), used only for older
spellings; the dictionary line for *tambien* and *despues* even says "misspelling of también / después".

### 4.14 Nouns, adjectives, numbers

- Gender exceptions on the list are right: *el día, la mano, el problema, el mapa, el agua, la foto, el clima, el
  idioma, el tema, el poema, la moto*. Not on the list: *radio, águila, orden, cura, guía, programa, sistema, planeta*.
- Plurals with a change are right: *luces, lápices, peces, jóvenes, ingleses, exámenes, autobuses, sofás, reyes,
  lunes*. Wrong or unknown: *taxis, espíritus, crisis, regímenes, caracteres, clubes, menús* (4.1, 4.2).
- Short forms: *buen, gran, primer, algún, ningún, cualquier, cien, veintiún, san* are listed and right; *mal* (4.3)
  and *tercer* (4.1) are not. Nothing is said about the change of meaning by position (*una mujer pobre / ¡pobre
  mujer!*, *mi viejo amigo*).
- Superlatives: *riquísima, larguísimo, buenísimo* right; four blank (4.2).
- Diminutives: *cafecito, cafecitos, panecillo, casita, abuelita, hermanito, momentito, ratito, perrito, florecita,
  perrote* right. Not handled: *-azo* on a noun in *-e* (*golpazo*), *-ón / -ona* (*mujerona*: a guess, "mujerón"),
  *-ita* on *mamá, papá*, diminutives of adverbs (*cerquita*), *-ito* on a stem in *z* (the rules build "abrazito",
  so *pedacito* from a listed *pedazo* would fail; from the dump).
- Numbers: 0 to 29, the tens, the hundreds with feminine, *cien / ciento, mil, millón* are listed. *millones* is a
  guess; ordinals stop at *quinto* (*sexto* "sextar", *décima* a guess); *docena* "doceno"; *la una* is the article "a".
- Abbreviations: none is known to the card (4.1, 4.2), although the sentence splitter has a list of them.

### 4.15 Church and Bible Spanish

Right: *Amad a vuestros enemigos, Amaos, Venid a mí, No temáis, Id y haced, Vosotros sois, De cierto os digo,
dánoslo, perdónanos, No nos metas, Sea lo que fuere, Donde fueres … vieres* (labelled older Spanish), *amó Dios,
unigénito, Jehová, mas* ("but (literary)"), *todo aquel*.

Wrong in the three best-known texts: *Santificado sea* "first person"; *Venga tu reino* "first person, to come";
*Hágase* "Let him, her, or it do"; *líbranos* a noun "líbrano"; *del mal* "badly"; *el poder* "to be able to"; *Sed
santos* "thirst"; *He aquí* "I have"; *no se pierda* with the note "impersonal or passive"; *creó Dios* a guess
(*crear* is not on the list); *santificado, voluntad, tentación, deudores, bienaventurados, aconteció, alturas*
guessed or blank; *dado* "giving". In the Lord's Prayer and John 3:16 together (101 words) I count 12 words with a
blank, guessed or wrong card (*santificado, sea, Venga, Hágase, voluntad, deudores, tentación, líbranos, mal, poder,
dado*, and *estás* with the cut-off gloss).

## 5. Every wrong form in the tables

Found by reading the dump and confirmed against the merged table.

**Verbs (361 rows). Shown on the card as written, because the dictionary has no cell to set against them:**
1. dar: *vos **dás*** (das); present subjunctive *vos **dés*** (des).
2. ver: *vos **vés*** (ves).
3. ir: *vos **ís*** (vos vas; the dictionary's vos command *andá* is shown beside it).

**Shown as an alternative under the dictionary's form:**
4. reír: vos command ***réí***, ***rei*** (reí). sonreír: ***sonréi*** (sonreí). freír: ***fréí***, ***frei*** (freí).
   Cause (from the code): `accentLast` accents the last plain vowel of *reí*.
5. huir: *huí, huís* where today's spelling is *hui, huis* (the older spelling is not wrong, but the engine does not
   know the modern one, so *Hui* in a text is blank).

**Verbs outside the list, conjugated as regular** (the dictionary's forms are shown first, the rules' as
alternatives): colar *colo* (cuelo), soldar *soldo* (sueldo), sosegar *sosego* (sosiego), reventar *revento*
(reviento), enmendar *enmendo* (enmiendo), concernir *concerne* (concierne), erguir *ergo, erguió, erguiendo* (yergo /
irgo, irguió, irguiendo), engreír *engreo, engreyó* (engrío, engrió), pudrir participle *pudrido* (podrido), rehacer
*rehice, rehizo* (the dictionary table has rehíce, rehízo; I believe that is also the academy's ruling: check).
Their table carries the note "Generated by the regular rules only: the lemma **is** in the word list …"; it is shown
exactly when the lemma is **not** in the list (from the code, `paradigm.ts`).

**Defective and impersonal verbs** get a full table from the rules: soler (*soleré, solido, suele* as a command),
llover and nevar (*lluevo, nievo*, commands). For llover the dictionary's "-" is shown first. For amanecer the
dictionary also gives "-" in every personal cell, which hides *amaneciste* although the course's own Honduran unit
has *¿Cómo amaneciste?*.

**Adjectives (210 rows), shown on the card unverified:**
6. marrón: feminine ***marrona, marronas*** (marrón, marrones for both genders).
7. cortés: feminine ***cortesa, cortesas*** (cortés, corteses).
8. guay: plural *guayes* (guais, or unchanged: check).

**Nouns (863 rows):** genders are all right as far as I can judge. 9. No plural is generated for *taxi* and
*espíritu*; the dictionary supplies *taxis, espíritus* in the table, but the analyser does not recognise them in a
text. Outside the list the rules give *régimenes* and *carácteres* (regímenes, caracteres; the dictionary corrects
both in the table).

**Wrong cells that come from the merge with the dictionary (11):**
- sobrina, amiga, vecina, profesora, enfermera, vendedora: the plural cell shows the **masculine** plural
  (*sobrinos, amigos, vecinos, profesores, enfermeros, vendedores*) first and the right form as an alternative.
- bueno, malo, primero, tercero, santo: the masculine singular cell shows the text **"before a noun buen"**
  ("before a noun mal", "… primer", "… tercer", "… san") as if it were the form, with *bueno* as the alternative.
- The table of *madre* lists *padre, padres* as its masculine, *caballo* lists *yegua*, *soldado* lists *soldada*,
  *cocodrilo* lists *cocodrila*: the dictionary's "counterpart", shown as cells of the same word.

**Superlatives the rules would build** (not shown in a table, used only to recognise a word): *feliquísimo*
(felicísimo), *suquísimo* (sucísimo), *jovenísimo* (jovencísimo), *fielísimo* (fidelísimo), *antiguísimo*
(antiquísimo), *trabajadorísimo*; the learned forms *fortísimo, novísimo, bonísimo, certísimo, paupérrimo* are unknown.

**Closed classes (from the dump):** *la, los, las* only as articles; *lo* only as a masculine object pronoun; *se*
only as reflexive; *que* only as "that" (no relative, no "than"); *sí* only "yes"; *aquel* only as a pronoun, *este /
ese* only as determiners; *para, nada, entre, sobre, este* with one reading each; no *aun, ello, incluso, adonde*; no
*éste / ése / aquél*; no ordinal above *quinto*; no *millones*.

## 6. Grammar not modelled at all

- Choice between first and third person from the subject; choice between command and statement; choice of tense for
  *-amos / -imos* from a time word.
- *usted / ustedes* as second person in the meaning line; the usted command as an address.
- Pronominal (reflexive) verbs as words with their own meaning; the kinds of *se* (reflexive, reciprocal, *le → se*,
  accidental, impersonal, passive) told apart.
- *la, los, las* as object pronouns; leísmo and laísmo; *lo* as the neuter article.
- Existential *haber*; weather and time expressions with *hacer*; the passive with *ser*.
- A second reading for function words that are also verbs or nouns (*para, nada, entre, sobre, este, sí*).
- Text without accents or ñ; the accented demonstratives of the older spelling; the modern unaccented *hui, guion*
  type.
- Unknown words: nouns ending in a consonant, adverbs in *-mente*, the feminine in *-a*, with the dictionary's
  "form of" records never asked.
- Ordinals above fifth, plural *millones*, fractions, abbreviations.
- Augmentatives in *-ón / -ona*, *-azo* after *-e*, diminutives of adverbs and of words in a stressed vowel.
- Position and meaning of adjectives; por against para (one gloss each); the truncated first adverb in *lenta y
  cuidadosamente*.
- A pronunciation respelling.
- Not tested by me: the older-spelling layer (`historical.ts`), the checks on the learner's own writing
  (`checkProduction`), the sentence splitter.

## 7. Orientation and course texts

**Orientation (`tutorial/es.ts`).** Short and correct as far as it goes: ñ, ll, the accent, silent h, j / g, qu, c /
z, the stress rule, gender, ser and estar, *El agua está fría* explained rightly. I found no wrong statement. It says
of itself that it is minimal and does not teach voseo, although the pack's target is Honduras.

**Pack (`packs/es.ts`).** Calls itself "installable at a deliberately minimal level and not production-ready". The
feature explanations are correct. Its seventeen validation cases are single words in short sentences and test none of
the faults above.

**Stage 0 (17 scenes, 519 words through the card).** No blank and no guess. But the first scene is *Me llamo Sam. /
Mucho gusto*: the card for *llamo* says "I call" and the card for *gusto* says "gustar, verb, I am pleasing". *Vivo en
Honduras* shows *Vivo* as the adjective "alive; lively". *hay pan y arroz*: "He, she, or it has". *¿Qué quieren
ustedes?*: "They want". The Spanish of the scenes that I read is natural and uses vos, usted and ustedes correctly.

**Ladder (93 units, 93,443 words; I ran twelve, 13,112 words, and read only one unit's text).** Blank 104 (0.8 %),
guessed 815 (6.2 %), with the same invented lemmas as in 4.1 (*trapo* "trapar", *madera* "madero", *escena* "esceno",
*silencio* "silenciar", *piano* "pianar", *roble* "roblar", *realidad* "realidar", *oportunidad* "oportunidar",
*pantalla* "pantallo", *alcalde* "alcaldar", *incluso* "inclusar", *Afortunadamente* "afortunadamentar"). The Honduran
unit *Baleadas para el desayuno* reads as good Honduran Spanish to me (*¿Cómo amaneciste?*, voseo between friends,
usted to the elder); its own review note asks a Honduran speaker to confirm the local words. I did not audit the
gold files, the English lines or the other units.

## 8. What to fix first

1. **Ask the dictionary before guessing.** For a word the list lacks, take lemma and part of speech from the
   dictionary's own entry or "form of" record (it has *radio, orden, colonia, cuidadosamente, tercer, sexto*), and
   only then fall back to the rules. Until then: never offer a verb after an article or determiner; put the noun in
   *-a* before the invented one in *-o*; read *-mente* as an adverb always; give unknown nouns in *-ción, -sión, -dad,
   -tad, -tud, -or, -al, -ez* a noun reading (the gender follows from the ending).
2. **Participle meaning**: "done", not "doing".
3. **usted / ustedes**: with *usted, ustedes* in the clause, or a third-person command, gloss "you"; drop "Let him,
   her, or it".
4. **First or third person**: a noun or third-person pronoun subject next to the verb decides; with no subject print
   "first or third person", not "first".
5. **Text without accents**: when a word has no reading, or only a guess, try the accent-folded word list and the
   ñ / n pair, and say "written without its accent: también".
6. **Function words with a second life**: verb readings for *para, nada, entre, como, bajo, sobre*; pronoun readings
   for *la, los, las* before a verb; *se* for *le*; *sí* as a pronoun; *aun, ello, este* (noun); *éste, ése, aquél*.
7. **Reflexive verbs**: when a listed verb has a "(-se: …)" meaning and the clause has its pronoun, show that meaning;
   stop the "impersonal or passive" note for them.
8. **haber**: *hay, había, hubo, habrá, haya* without a participle are "there is …".
9. **Commands**: a sentence-initial verb with no subject that equals a command form, before *por favor*, a comma or
   "!", is a command (*Habla, Oye, Espera, Sal, Hable, Pasen, Comamos, Sed, Idos*).
10. **The word list**: add the commonest missing words first (*caso, gusto, punto, radio, orden, programa, sistema,
    situación, información, educación, crear, preferir, producir, realizar, considerar, resultar, simple, serio,
    interesante, aburrido, incluso*), the ordinals to *décimo*, the abbreviations, and the Honduran words of 4.7 after
    a Honduran speaker has confirmed them.
11. **Wrong forms**: *das, des, ves, vas* for vos; *reí, sonreí, freí*; *hui, huis*; *marrón* and *cortés* without a
    feminine; plurals for *-i, -u*; *regímenes, caracteres*; *felicísimo, sucísimo*; the list of stem-changing verbs
    (*colar, soldar, sosegar, reventar, enmendar, concernir*).
12. **The merge**: do not take the masculine headword's table for a feminine noun; strip "before a noun" from the
    dictionary's form; correct the "is in the word list" note.
13. **Notes**: fix the five that misfire (4.8); let "Preterite" fire for every verb; remove the filler note.
14. **Dictionary line**: no initialisms, foreign-language senses, letter names or vulgar senses first.
15. **"I am (state"**: do not cut a gloss at a slash.

## 9. Limits of this audit

- I am a language model, not a native speaker, and looked nothing up. I am sure of the standard forms given as
  correct. Marked "check": the plural of *guay*, the accent of *rehíce*, and every Honduran word and meaning in 4.7,
  which rest on my own knowledge of Central American Spanish and need a Honduran speaker.
- The table comparison uses the Wiktionary extract as the second source; where both agree on a wrong form I would not
  have seen it unless it was in the part of the dump I read by eye (all irregular, stem-changing and spelling-change
  verbs, all nouns, all adjectives; not 104 plain regular *-ar* verbs after the first 125 lines).
- `disambiguate.ts`, `syntax.ts`, `phrases.ts`, `historical.ts` and `sentences.ts` were not read; their behaviour was
  tested through about 700 sentences only. The older-spelling layer, the production checks and the sentence splitter
  were not tested.
- Of the course, I ran Stage 0 and twelve of 93 ladder units through the card and read one unit; I did not audit the
  remaining units, the English lines, or `data/gold/es`.
- The probe finds a word by its first occurrence in the sentence; three probes hit the wrong place (*bajo* inside
  *abajo*, *es* inside *fiesta*, *os* inside *Vosotros*) and were discarded or repeated.
- The hand counts of wrong readings in the running text could be off by a few. The card was tested through
  `parseSelection`, the dictionary `gloss` and `buildParadigm`, not through the popup itself.
- The brief says full dictionary records exist only for el, he and ru. For Spanish they exist in
  `public/dict/es/full` (and a `full` folder of the same size exists for German), so the "no second source" finding of
  the earlier audits does not carry over to Spanish.
