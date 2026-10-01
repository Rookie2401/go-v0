# The acquisition path: controlled Spanish (S7 prototype)

Status: **machine-drafted, unreviewed, not published.** Every text below was drafted by an AI model for the course and has
not been read by a native speaker. Each document is `generated: true`, `review.status: "unreviewed"`,
`source.rights: "owner-authored"`, `source.authorship: "generated"`, carries the editorial tags `machine-drafted` and
`needs-native-review`, and so stays visible in preview mode only until a person reviews it (`computePublished` gives
one reason: native-speaker review). Nothing here weakens that.

Files: `data/corpus/es/camino-<level>-<nn>.json` (22 texts) and `data/corpus/es/honduras-lecturas-1-<nn>.json` (4 texts).
Test: `test/content/spanish-acquisition.test.ts`. The works are `camino-1`, `camino-2`, `camino-3` and
`honduras-lecturas-1` in `src/course/spanish.ts` (shelf 0, stream `acquisition`; the Honduras readings also carry the stream
`honduras`).

## Size

| Work | Texts | Sentences per text | Words (running) | Distinct forms |
|---|---|---|---|---|
| Camino 1 — Primeros pasos | 8 | 10–12 | 44–72 per text | 21–37 per text |
| Camino 2 — Días y lugares | 8 | 14–18 | 100–130 per text | 61–77 per text |
| Camino 3 — Historias | 6 | 18–27 | 192–387 per text | 122–195 per text |
| Honduras — Lecturas 1 | 4 | 22–28 | 164–210 per text | 86–112 per text |

The exact figures per text are in the vocabulary lists below. Together the 26 texts have about 3,660 running words and about
850 distinct word forms (forms, not lemmas).

## The principle

This is **massive comprehensible reading, not a course book.** The learner reads meaningful text from the first sentence,
taps a word only when help is wanted, and the system quietly records what he knows. So the texts contain no word lists, no
grammar explanations, no drills and no dialogue written only to display a phrase. They are small stories about people who
come back.

How the progression works:

1. **Narrative from the first line.** Camino 1 opens "Juan tiene un libro. El libro está en la mesa. Juan quiere leer el
   libro." — a person, a thing, a place, a wish. Something always happens.
2. **Heavy, natural repetition.** A word is met many times in the same text and again in the next ones before the text
   leans on it. Repetition is made by the story (Luis feeds the dog; the dog eats; the dog is happy), not by padding.
3. **One recurring cast.** Juan and Ana, then Marta, Luis, Pedro and Rosa and their dog Sol, then the grandmother,
   Tomás and Sofía. Knowing the people is part of what makes the next text easier. The Honduras readings have their own
   people: Karla, her mother doña Reina, her father don José, her brother Kevin, the friends Daniel and Marvin.
4. **Few new words at a time.** Camino 1 adds about 7 to 21 new forms per text after the first. A new word is
   introduced where its meaning can be guessed from the story and then used again at once.
5. **Grammar arrives inside stories, in the order a story needs it:** present tense first; then the past, because
   stories are told in the past; then connected narrative with subordinate clauses. The learner is never told which tense
   he is reading; the English line and the word sheet carry the meaning.
6. **Sentences lengthen by level.** Camino 1 averages about 5 words a sentence, Camino 2 about 7, Camino 3 about 12 (the
   test asserts that the average grows from level to level).
7. **A ramp, not the course.** The texts are written so that real Spanish becomes readable; as authentic texts become
   comprehensible for the learner, recommendations should favour them over this path (`docs/SPANISH_COURSE.md` §3).

Variety: Camino texts use ordinary Latin American Spanish (`es-419`): ustedes, never vosotros; carro, jugo, boletos,
autobús, sala, pastel; "tú" as the familiar form. The Honduras readings are `es-HN` and use **usted** as the ordinary
polite form and, in exactly one text, **vos** among friends. No text uses vosotros forms (asserted by the test).

## What each level introduces

### Camino 1 — present tense, the commonest verbs, people, home, food, places (A0)

Verbs: **tener, ser, estar, querer, ir, hay**, plus the plain action verbs leer, tomar, comer, dar, vivir, hablar, comprar,
correr, llamarse (se llama). Nouns: libro, mesa, casa, cocina, pan, huevos, café, agua, familia, padre, madre, hermano,
amigo, ciudad, tienda, carro, perro, parque, escuela, maestra. Adjectives: grande, pequeño, bonito, bueno, contento, azul.
Structures: article + noun with gender agreement; subject + verb + object; "tiene hambre"; "hay"; "va a" + place (and "al");
"quiere" + infinitive; coordination with "y"; the first embedded speech with the dialogue dash ("—Hola, Ana —dice Juan.")
and the first inverted question mark.

1. Juan y el libro — tener, estar, querer + infinitive, ir a + place
2. La casa de Ana — hay, the house and the kitchen, tener hambre
3. Juan y Ana — ser (people), a first greeting, dialogue dashes, a question
4. La familia de Marta — family words, se llama, vivir, "quiere mucho a" (the personal a)
5. El desayuno — food and drink, "no", "más", dar
6. Pedro va a la ciudad — places, "en el carro", comprar, "para su familia"
7. Luis y Sol — animals, "van" (plural of ir), "al parque", correr
8. Marta quiere un perro — age (tiene ocho años), school, "por la tarde", hablar con

### Camino 2 — past narration, object pronouns, ir a, tener que, acabar de (A1)

The preterite and imperfect arrive **together**, as a story uses them: what happened (fue, buscó, llegó, vio, dio) against
what was the case (estaba, quería, tenía, era). Object pronouns lo / la / le / les / me / se (and the pairs se las dio, se lo comió,
se lo dio) and attached pronouns (buscarlo, ayudarte, visitarlos). **ir a + infinitive** (voy a hacer, vamos a buscarlo,
iban a ir, iba a cumplir), **tener que** (tenían que), **acabar de** (acababa de terminar, acababa de llegar), "empezar a",
"dar las gracias", "hace un rato". Conversations are embedded in stories (a search for a book; a market; a lost dog), always with a
reason to speak. The negative imperative (no llores) and a first "me gusta" also appear.

1. El libro perdido — the Camino 1 book story told in the past; lo / la; "vamos a buscarlo"
2. En el mercado — buying; "se las dio"; "se lo comió"; tener que; "voy a hacer"
3. La lluvia — "iban a ir", empezar a, acabar de; the imperfect of mood and weather
4. Sol se fue — a search; "lo vi hace un rato"; "no llores"; "siempre cierra"
5. La carta — a letter read and answered; "va a venir a vernos"; tener que; "les dio un regalo"
6. El cumpleaños de Marta — planning and a surprise; "acababa de llegar cuando…"; "le dio"
7. El viaje en autobús — a journey; "tuvieron que ir"; "dale el asiento"; "Luis se lo dio"
8. La abuela cuenta — a story inside a story; the imperfect for habit and description; "me gusta"

### Camino 3 — connected narrative, perfect tenses, the subjunctive met naturally (A2)

Long sentences with subordinate clauses (que, cuando, porque, mientras, aunque, que + relative). **Perfect tenses:**
pluperfect (había dejado, había hecho, nunca habían aprendido), present perfect (¿has visto…?, han llegado a ser, ha
vuelto), conditional perfect once (habría querido), and one present-perfect subjunctive (cuando hayas ahorrado). **The
subjunctive, always inside a sentence a reader can follow without a rule:** quiero que + subjunctive (quiero que me des,
quiero que lo disfrutes, quiero que me enseñes), para que (para que descanses, para que no se perdiera), cuando + subjunctive
for the future (cuando lo termine, cuando vuelva, cuando ahorres), aunque (aunque tarde unos días), antes de que, en
cuanto, ojalá, "como si hubiera muerto". Reported speech (le dijo que… saldría; me dijo que… se había retrasado) and
several reflexive verbs. Genres: a small mystery of a missing book, a biography, a journey, a Bible-story retelling, a story
of saving and working, and a letter.

1. El libro que desapareció — the model sentence: "Cuando Juan llegó a casa, vio que el libro que había dejado sobre la
   mesa ya no estaba allí."; pluperfect; a first "quiero que"; "cuando… te lo traeré"
2. La vida de Elena — **biography** (a fictional teacher, not a real person); aunque, querían que estudiara; present perfect
   at the end
3. El viaje de Tomás — **journey**; antes de que saliera el sol; para que descanses; reported speech; "de repente"
4. El hijo que volvió — **Bible-story retelling** in the author's own words (the parable in Luke 15:11–32; no translation is
   quoted); the longest text; "habría querido", "merezco que me llames hijo", "como si hubiera muerto"
5. La bicicleta de Marta — **a story of saving**; cuando hayas ahorrado; "necesita que alguien lo ayude"; para que no se
   perdiera; "valer la pena"
6. Querida abuela — **a letter**; espero que estés bien; ojalá que puedas; cuando vuelva, quiero que me enseñes; en cuanto pueda

### Honduras — Lecturas 1: ordinary life in plain educated Spanish (A1)

Present tense, short sentences, the Camino 1–2 vocabulary reused in Honduran settings. The polite form is **usted** (¿Qué
desea?, ¿Cómo está usted?, ¿Quiere más pollo, abuela?). In **one** text (En el autobús), two friends use **vos** with its
forms: vos tenés, vos querés, ¿qué hacés?, vos sos, ¡vení!, ¡mirá!, cuidate; the clerk at the terminal calls them "joven" and
they speak to him politely. A few regional words, used sparingly and never explained in the Spanish: baleada, pulpería,
tajadas, cipotes, catracho, and the currency lempiras.

1. En el mercado — a market in Tegucigalpa; buying with "por favor" and "¿cuánto es?"; the baleada
2. En el autobús — two friends on a bus to San Pedro Sula; **vos** among friends, usted with the clerk; catracho
3. El domingo en la iglesia — a family walks to church; greetings with don and doña; singing, the Bible, prayer, coffee
   afterwards; cipotes
4. La comida en familia — Sunday meal at home; the grandmother; giving thanks; tajadas; usted to the grandmother

## Vocabulary added by each text

For reviewers and for tuning the lexicon, not for learners. "New" means a word form (lower-cased, accents kept) that did not
occur in any earlier text of the path: Camino texts are measured against all earlier Camino texts; the Honduras readings are
measured against Camino 1 and 2 and the earlier Honduras readings. Forms, not lemmas: *busca*, *buscó* and *buscarlo* are three
forms. Proper names are included. The lists are generated from the JSON by a script that is not part of the repository; they
are accurate for the texts as committed.

### camino-1 / camino-1-01 — Juan y el libro

10 sentences, 44 words, 21 distinct forms; 21 new:

a, bueno, contento, el, en, es, está, grande, juan, la, lee, leer, libro, mesa, muy, quiere, tiene, toma, un, va, y

### camino-1 / camino-1-02 — La casa de Ana

12 sentences, 54 words, 25 distinct forms; 13 new:

ana, bonita, casa, cocina, come, comer, contenta, hambre, hay, pan, pequeña, silla, una

### camino-1 / camino-1-03 — Juan y Ana

12 sentences, 60 words, 28 distinct forms; 11 new:

amigos, da, de, dice, hola, hombre, hoy, mujer, sí, son, tengo

### camino-1 / camino-1-04 — La familia de Marta

11 sentences, 65 words, 30 distinct forms; 14 new:

familia, hermano, llama, luis, madre, marta, mucho, padre, pedro, rosa, se, su, también, viven

### camino-1 / camino-1-05 — El desayuno

12 sentences, 51 words, 30 distinct forms; 8 new:

agua, café, huevos, los, mañana, más, no, por

### camino-1 / camino-1-06 — Pedro va a la ciudad

12 sentences, 72 words, 32 distinct forms; 9 new:

azul, carro, casas, ciudad, compra, muchas, para, tienda, tiendas

### camino-1 / camino-1-07 — Luis y Sol

12 sentences, 54 words, 29 distinct forms; 8 new:

al, árbol, corre, parque, pequeño, perro, sol, van

### camino-1 / camino-1-08 — Marta quiere un perro

12 sentences, 66 words, 37 distinct forms; 14 new:

años, como, con, elena, escuela, habla, maestra, mamá, muchos, niños, ocho, quiero, sonríe, tarde

### camino-2 / camino-2-01 — El libro perdido

18 sentences, 118 words, 61 distinct forms; 41 new:

allí, aquí, ayer, buscarlo, buscaron, buscó, cama, contentos, debajo, dijo, dio, dónde, dos, encontró, entonces, estaba, estaban, final, fue, gracias, juntos, las, llamó, llegó, lo, mi, pero, preguntó, pues, quería, sala, sé, suelo, tienes, toda, tomó, triste, tu, vamos, vio, voy

### camino-2 / camino-2-02 — En el mercado

17 sentences, 127 words, 70 distinct forms; 40 new:

ayudarte, bien, bolsa, bolsas, buenos, cebollas, comió, comprar, compró, cuántas, das, después, días, diez, esta, frutas, gente, había, hacer, hija, le, me, mercado, mucha, naranjas, pagó, plátano, plátanos, puso, que, qué, seis, semana, sopa, tenía, tenían, tomates, vendedora, verduras, volvieron

### camino-2 / camino-2-03 — La lluvia

14 sentences, 108 words, 66 distinct forms; 28 new:

acababa, ahora, buen, corrió, día, empezó, hora, iban, ir, jugó, lástima, llover, llueve, lluvia, mira, miraba, miró, mojado, partes, pelota, podemos, quedarse, salieron, terminar, todas, todo, ventana, ya

### camino-2 / camino-2-04 — Sol se fue

15 sentences, 106 words, 69 distinct forms; 29 new:

abrazó, blanco, calle, cierra, corrieron, cuando, del, desde, diste, él, ese, hace, hacia, iba, jardín, lloraba, llores, preguntaron, puerta, rato, salió, señor, siempre, susto, todos, ustedes, vi, vieron, volvió

### camino-2 / camino-2-05 — La carta

15 sentences, 102 words, 67 distinct forms; 26 new:

abrió, ayudaron, carta, comieron, cuándo, era, escribió, lejos, les, leyó, limpió, llegar, otra, porque, preparar, recibió, regalo, sábado, sillas, tenemos, tomás, venir, ver, vernos, visitarlos, vivía

### camino-2 / camino-2-06 — El cumpleaños de Marta

16 sentences, 100 words, 69 distinct forms; 22 new:

bonito, cantaron, chocolate, creerlo, cumpleaños, cumplir, dibujo, entró, fiesta, globos, gritaron, hizo, mí, nada, nueve, pastel, podía, prepararlo, sabía, sorpresa, tan, ti

### camino-2 / camino-2-07 — El viaje en autobús

17 sentences, 122 words, 73 distinct forms; 29 new:

abuela, asiento, autobús, boletos, compraron, dale, durmió, esperaba, estación, están, fueron, grandes, hermana, horas, junto, largo, llegaron, llevó, mis, montañas, primero, pueblo, ríos, temprano, tuvieron, vacaciones, vacas, viaje, yo

### camino-2 / camino-2-08 — La abuela cuenta

14 sentences, 130 words, 77 distinct forms; 28 new:

ayudaba, caminar, campo, cocinaba, cómo, contarles, cuéntanos, dormir, edad, enseñar, gusta, historia, imaginación, jugábamos, juguetes, misma, niña, noche, pie, quedaba, rió, río, sentó, teníamos, tortillas, trabajaba, vida, vieja

### camino-3 / camino-3-01 — El libro que desapareció

18 sentences, 192 words, 122 distinct forms; 54 new:

almuerzo, antes, aunque, cabo, calma, colgar, dejado, dejé, dime, disfrutes, e, ella, esa, estante, estoy, fin, has, hecho, intentó, léelo, leerlo, leído, levantado, lleves, otro, páginas, pasado, pensó, preocupes, prestado, problema, próxima, quédatelo, raro, razón, recordar, recordó, sacó, salido, seguro, siento, sobre, sofía, te, teléfono, termine, tomado, trabajar, traeré, unas, unos, vacía, vez, visto

### camino-3 / camino-3-02 — La vida de Elena

19 sentences, 217 words, 135 distinct forms; 64 new:

agricultor, agricultores, algunos, alumnos, aprendido, aprendieran, ayudó, bancos, cada, caminaba, cariño, carpintero, casó, cinco, contesta, cosía, cuatro, dicen, enfermeros, enseña, enseñaba, enseñó, entre, escribía, estudiaba, estudiara, estudios, extrañaba, habían, han, hasta, hermanos, hijos, llegado, maestro, maestros, mayor, mientras, miguel, nació, nos, nunca, padres, pobre, poco, pocos, primeros, principio, querían, quince, ropa, saludan, semanas, ser, setenta, solo, sus, terminó, tía, tres, vecino, vecinos, ven, vivió

### camino-3 / camino-3-03 — El viaje de Tomás

22 sentences, 257 words, 138 distinct forms; 61 new:

abrazaron, acostumbrado, así, ayudar, bajaron, bajó, brazos, caído, caja, camino, campos, carmen, casi, cenaron, conductor, conoció, cuidado, decidió, descanses, detrás, detuvo, dormido, empleado, entero, esperando, esperar, estaría, explicó, hablaron, hacía, hombres, limpiar, linterna, llamaba, llegaría, llegue, llevaba, llevo, mano, moverlo, nieta, pequeñas, pesado, piernas, pregunté, primer, pudieron, repente, retrasado, retraso, saldría, saliera, seguir, subía, tardaron, tomar, trabajo, veía, verdes, viajaba, visitar

### camino-3 / camino-3-04 — El hijo que volvió

27 sentences, 387 words, 195 distinct forms; 97 new:

acercarse, alegrarnos, anillo, aquella, besó, cabrito, celebrar, cerdos, compasión, conmigo, contra, cosas, criado, criados, cuidar, daba, decir, dejó, des, dinero, dios, dolía, durante, encontrado, enojó, entrar, entrara, estás, este, fiestas, fuerte, gastó, ha, habría, haces, hagamos, he, hemos, hijo, hubiera, joven, juntó, lejano, levantó, llames, mandó, mejor, menor, merezco, mío, mismo, muero, muerto, música, nadie, necesidad, necesitaba, ni, oyó, país, parte, pasaba, pecado, perdido, pidió, pónganle, preparado, querido, quiso, respondió, servido, si, sido, sintió, sobra, sufrir, supo, tanta, tanto, tienen, tierra, toca, todavía, trabajadores, traigan, trátame, tú, tus, tuyo, uno, vístanlo, vivir, volver, volvía, vuelto, vuelve, zapatos

### camino-3 / camino-3-05 — La bicicleta de Marta

26 sentences, 276 words, 162 distinct forms; 63 new:

aceptó, ahorrado, algo, alguien, aplaudió, ayude, barrio, bicicleta, bicicletas, calor, cansada, carlos, cayó, comprarla, contó, cuanto, cuesta, cumplió, don, eligió, enseguida, enseñaría, gritó, guardaba, hayas, hierbas, lata, llena, lloró, logré, malas, meses, mitad, momento, montar, necesita, pagaré, papá, pasar, pasaron, pedaleó, pena, perdiera, plantas, pondré, propongo, puedes, regaba, rodillas, roja, sábados, sacaba, siguiente, sola, soñaba, suya, tener, tenido, tercera, tuviera, valido, veces, vienes

### camino-3 / camino-3-06 — Querida abuela

18 sentences, 204 words, 133 distinct forms; 47 new:

abrazo, acompañarme, acostumbrando, algún, calles, conoceré, contabas, darle, dile, duela, enseñes, espero, estés, extraño, guardó, historias, imaginado, iré, lucía, mando, matemáticas, mejorado, mes, noches, nueva, nuevo, ojalá, olvide, parece, perdí, preguntas, preocupe, pronto, pueda, puedas, querida, recuerdo, recuerdos, rodilla, señora, tuvo, tuyas, veas, verte, visitarme, vivo, vuelva

### honduras-lecturas-1 / honduras-lecturas-1-01 — En el mercado

23 sentences, 164 words, 86 distinct forms; 34 new:

baleada, baleadas, cambio, capital, cincuenta, compran, cuánto, desea, doña, esquina, favor, frijoles, harina, honduras, karla, lempiras, llenas, llevar, necesita, paga, pasan, pone, pregunta, puede, pulpería, queso, recibe, reina, rica, salir, señora, tegucigalpa, tortilla, vuelven

### honduras-lecturas-1 / honduras-lecturas-1-02 — En el autobús

28 sentences, 210 words, 104 distinct forms; 41 new:

algo, amigo, asientos, bajan, buenas, buscan, catracho, comen, cuidate, daniel, despiden, empleado, hablan, hacés, joven, llega, llegamos, marvin, minutos, mirá, miran, nos, pronto, querés, sale, san, sobrino, sos, suben, sula, sus, tardes, tenés, terminal, tío, varias, vemos, ven, vení, visitar, vos

### honduras-lecturas-1 / honduras-lecturas-1-03 — El domingo en la iglesia

24 sentences, 205 words, 112 distinct forms; 54 new:

adentro, afuera, amiga, amor, ayudar, biblia, caminan, cantan, cipotes, corren, dios, domingo, domingos, don, escucha, estar, estoy, frente, grupo, guitarra, gusto, hombres, iglesia, josé, jóvenes, juega, kevin, levanta, llena, mario, mediodía, mejor, menor, mujeres, ofrece, oran, otros, padres, pasaje, pastor, ponen, queda, responde, ropa, salen, saluda, sentado, servicio, sientan, toca, usted, vecinos, veinte, vuelve

### honduras-lecturas-1 / honduras-lecturas-1-04 — La comida en familia

22 sentences, 169 words, 91 distinct forms; 25 new:

amén, antes, arroz, ayudan, bienvenida, comí, comida, cuenta, despacio, dicen, ella, ensalada, fríe, hijo, jugo, lavan, naranja, platos, pollo, prepara, sentarse, sienta, sirve, tajadas, trae

## Document fields

Every document is a v2 story (`contentType: "story"`, corpus `ci-es`) with explicit declared `sentences`, each with an
English line (`english.source: "drafted with the text; not reviewed"`), and no analysis spans: the Spanish adapter does the
analysis. `work: { slug, chapter: { index, title } }` places it in its work. These three catalogue fields are accepted
by the validator now, so they are in the JSON (if a validator ever rejects them, remove them and keep this table):

| Texts | `streams` | `variety` | `domains` (examples) |
|---|---|---|---|
| Camino 1–3 | `acquisition` | `es-419` | home, books, family, food, places, animals, school, weather, travel, people |
| Honduras — Lecturas 1 | `honduras`, `acquisition` | `es-HN` | food, places, travel, people, church, family, honduras |

Difficulty labels: Camino 1 A0; Camino 2 A1; Camino 3 A2; Honduras A1. The one text with `prepTargets` is
`camino-3-04` (`LUK.15.11`, the start of the parable it retells).

Fictional material. The people, places-in-stories and the prices in the market text are invented. The biography
(La vida de Elena) is of an invented person. Nothing in a text is a statistic, a date or a historical claim.

## Facts about Honduras the texts state or rely on

Only these, each one a reviewer can check at a glance:

* Tegucigalpa is the capital of Honduras ("Tegucigalpa, la capital de Honduras").
* San Pedro Sula is a city in Honduras, and one can travel from Tegucigalpa to San Pedro Sula by bus; the trip is long
  ("varias horas" — no duration is given). Mountains can be seen from the bus window.
* The currency is the lempira (prices in lempiras; the amount in the text is invented).
* A baleada is a flour tortilla with beans; it can also have cheese.
* Vocabulary used as ordinary Honduran / Central American words, unexplained in the Spanish: pulpería (a small
  neighbourhood shop), tajadas (fried plantain slices), cipote (a child; colloquial), catracho (a Honduran; friendly, colloquial,
  used once as a form of address between friends), the titles don and doña with a first name.
* Usage: usted is the polite form with a clerk, a seller, a neighbour and the grandmother; vos (tenés, querés, hacés, sos,
  vení, mirá, cuidate) is used by two friends in one text. Church on Sunday with singing, a reading from the Bible, a
  sermon by "el pastor" and prayer is told generically; nothing says which church.

## What a reviewer should check

For every text:

1. **Naturalness.** Would a native speaker say it this way? Controlled texts tend toward stiffness: flag any sentence that
   sounds like a textbook, even if it is grammatical.
2. **Correctness.** Accents, inverted ¿ ¡, agreement, the use of the preterite and imperfect together, the pronoun order
   (se lo, se las, me lo), the subjunctive after quiero que / para que / cuando / antes de que / ojalá.
3. **Faithfulness of the English line** to its Spanish sentence (plain, not free).
4. **Dialogue punctuation.** Speech uses the dialogue dash ("—¿Es bueno el libro? —dice Ana."), the Spanish convention; the
   adapter's sentence splitter currently disagrees with this convention for some lines (see below). Quotation marks « » are
   used once for a quoted letter and once for a rehearsed speech.
5. **Register.** Tú in the Camino texts between friends and family; usted to elders and strangers (Don Carlos, the
   vendors). Confirm the choices sound right for Latin American Spanish in general.
6. **Vocabulary choices.** carro, jugo, boletos, autobús, sala, pastel, platos, globos, cebollas, pelota. Are any of them odd
   for a Honduran or Central American reader?

For the Honduras texts, by a Honduran reviewer: every fact above; whether "usted" to the clerk, the seller and the
grandmother and "vos" between the two friends sound natural; the regional words and whether "catracho" and "cipotes" are
suitable for a learner text; whether "boletos", "terminal", "autobús" are what is said; the church scene (generic by design) and the meal.

For Camino 3, text 4 (the parable): that the retelling is faithful to Luke 15:11–32 in substance, that nothing is added
as if it were in the text, and that the final sentence is true ("La historia no dice si el hijo mayor entró a la fiesta").

For the course: after review, record it with `npm run corpus:review`; until then the texts are unpublished and appear only in
preview.

## Known limits of this prototype

* **Sentence splitting.** The Spanish adapter's splitter would cut about 30 declared sentences at the question or
  exclamation mark that precedes a speaker tag ("—¿Es bueno el libro? —dice Ana."), reported as `adapter-would-split`
  warnings. The declared sentences win at import, so the text is stored as written; the adapter should learn the dialogue-dash
  convention.
* **Analysis coverage** depends on the adapter's lexicon, which is growing; `test/content/spanish-acquisition.test.ts`
  prints the coverage per text and the forms still unanalysed.
* Machine-drafted. No claim in this document replaces a native reviewer's judgement.
