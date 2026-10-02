# The acquisition path: controlled German (GF starter corpus)

Status: **machine-drafted, unreviewed, preview only.** Every text below was drafted by an AI model for the course and has
not been read by a native speaker. Each document is `generated: true`, `review.status: "unreviewed"`,
`source.rights: "owner-authored"`, `source.authorship: "generated"`, carries the editorial tags `machine-drafted` and
`needs-native-review` (the four Deutschland readings also `needs-regional-review`), and so stays visible in preview mode only
until a person reviews it (`computePublished` gives one reason: native-speaker review). Nothing here weakens that.
**The four Deutschland — Lesungen need a German reviewer before publication**: every one says so in its source notes
(`source.provenance` and `review.notes`).

Files: `data/corpus/de/weg-<level>-<nn>.json` (22 texts), `data/corpus/de/deutschland-lesungen-1-<nn>.json` (4 texts) and
`data/corpus/de/gespraeche-1-<nn>.json` (6 dialogues). Test: `test/content/german-acquisition.test.ts`. The works are
`weg-1`, `weg-2`, `weg-3`, `deutschland-lesungen-1` and `gespraeche-1` in `src/course/german.ts` (shelf 0; streams
`acquisition`, plus `germany` for the readings and `conversation` for the dialogues). Words these texts need that the main
word list may lack are in `src/adapters/german/lexicon-course.ts` (`COURSE_ROWS`: about 590 rows of nouns, verbs,
adjectives, adverbs and proper names, in the row formats of `src/adapters/german/types.ts`).

## Size

| Work | Texts | Sentences per text | Words (running) | Distinct forms |
|---|---|---|---|---|
| Weg 1 — Erste Schritte | 8 | 16–22 | 72–98 per text (660 in all) | 30–49 per text (137 in all) |
| Weg 2 — Tage und Orte | 8 | 15–19 | 126–139 per text (1,036) | 63–84 per text (302) |
| Weg 3 — Geschichten | 6 | 20–25 | 202–294 per text (1,393) | 122–170 per text (494) |
| Deutschland — Lesungen 1 | 4 | 18–19 | 158–189 per text (682) | 102–113 per text (306) |
| Gespräche 1 | 6 | 14–17 | 103–115 per text (652) | 67–81 per text (284) |

Together the 32 texts have **4,423 running words and 881 distinct word forms** (forms, not lemmas; lower-cased, proper
names included). Sentences are declared one by one, each with a plain English line. The test asserts the ranges: Weg 1
70–120 words and at most 10 words a sentence; Weg 2 120–180 and 16; Weg 3 200–300 and 22; Lesungen 150–220 and 22;
Gespräche 100–160 and 18. The mean sentence grows from level to level (4.6 → 7.5 → 10.5 words; the readings average 9.1 and the dialogues 7.2).

## The principle

This is **massive comprehensible reading, not a course book.** The learner reads meaningful text from the first sentence,
taps a word only when help is wanted, and the system quietly records what he knows. So the texts contain no word lists, no
grammar explanations, no drills, no "Das ist ein Tisch" captions. They are small stories about people who come back, and,
for the last two works, German as it is really read and spoken.

1. **Narrative from the first line.** Weg 1 opens "Ich bin Anna. Ich habe ein Haus. Das Haus ist klein." and reaches, in
   the first text, the owner's progression: "Ich habe auch ein Buch. / Das Buch ist auf dem Tisch. / Ich nehme das Buch. /
   Jetzt habe ich das Buch in der Hand." Something always happens: a dog wants the bread, a ball lands in a tree, a book is lost.
2. **Heavy, natural repetition.** A word comes back in a new sentence before the text leans on it. The test asserts that in
   Weg 1 the 40 most frequent word forms cover at least 70 % of the running words (measured: 73.3 %), and that most words of
   each Weg 2 text were met in the texts before it.
3. **One recurring cast** (below). Knowing the people makes the next text easier.
4. **Grammar arrives inside stories, in the order a story needs it**, never named: present tense, sein and haben,
   nominative and accusative; then the dative with the everyday prepositions, modal verbs, separable verbs and the perfect;
   then connected narrative with subordinate clauses and the preterite. The learner is never told which tense he is reading.
5. **Modern standard German of Germany** (`de-DE`): reformed spelling (dass, muss, ß only after a long vowel or diphthong;
   the test rejects daß, muß, ißt and the like), du among friends and family, children and in a congregation that has agreed
   to it, **Sie** with strangers, shop staff, neighbours and elders. German quotation marks „ … “ in narrative; the dialogue
   documents use speakers instead. No Swiss or Austrian markers (the test forbids Grüezi, Servus, Jänner, Paradeiser …), and
   one regional word, Semmel, is used once and labelled as Bavarian.
6. **A ramp, not the course.** The texts make real German readable; as authentic texts become comprehensible for the
   learner, recommendations should favour them over this path.

## The recurring cast and world

The Keller family, who live in a small house in a small town: **Anna** (mother, narrator of the first and last Weg 1
texts and of Weg 2 text 4), **Paul** (her husband, who drives to work), **Lena** (their daughter, eight years
old, goes to school), **Max** (the dog, brown and large, who sleeps on a book, wags his tail, never speaks), **Oma and Opa**
(Anna's parents, who live in a village and come by train), **Frau Weber** (the elderly neighbour, addressed with Sie, who
turns 81 in Weg 3), Annas sister **Katrin** (once, on the telephone). In the Deutschland readings and the Gespräche a newcomer
joins: **Daniel Miller**, a young man from the USA who has lived in the town for two weeks, helps in the congregation and wants
to learn German (he stands in for the learner and is addressed with Sie by the Kellers until Paul offers the du); **Herr Brandt**
(an older man of the congregation who offers the du) and **Pastor Lange** appear only in the Gespräche. The world is a house, a kitchen, a table, a
book, bread and rolls, a garden, a bakery and a market, a station, a bus, a tram, a train, a church. Everything about these
people and this town is invented.

## What each level introduces (the hidden sequence)

For maintainers. The learner never sees a syllabus.

### Weg 1 — present tense, sein and haben, nominative and accusative (A0)

Verbs: **sein, haben**, plus the plain action verbs gehen, nehmen, lesen, sitzen, essen, trinken, sehen, wollen, werfen, laufen,
holen, fahren, kommen, machen, heißen, sagen, schlafen, liegen. Nominative and accusative in use: *der Tisch / einen Tisch,
der Ball / den Ball, kein / keinen*; the neuter and feminine articles; plural nouns (Brötchen, Zimmer, Euro). Prepositional
chunks the owner's brief itself uses, learnt as wholes: *auf dem Tisch, in der Hand, in der Küche, im Glas, zu Hause, am
Tisch, ins Bett*. First quoted speech in German quotation marks; "Guten Morgen", "Hallo", "bitte", "danke", "Hast du Hunger?".

1. Ich bin Anna — the owner's progression: ich bin, ich habe ein Buch, das Buch ist auf dem Tisch, ich nehme das Buch
2. Max und das Brot — heißen, will, sagt, a ball; nein; "für Anna"
3. Lena hat Hunger — Hunger haben, a first greeting, essen, isst
4. Das Haus — rooms and places with in / auf, hell, "aber"
5. Das Frühstück — Morgen, Kaffee, Brötchen, Butter, trinken, keinen
6. Paul geht in die Stadt — fahren, a bakery, "Ein Brot, bitte", the euro, "Auf Wiedersehen"
7. Lena und Max im Park — heute, Samstag, werfen, holen, "zu hoch", er
8. Der Abend — wir, Abendbrot, müde, ins Bett; the first text comes back round to the book

### Weg 2 — dative and the everyday prepositions, modal verbs, separable verbs, the perfect (A1)

**Dative** after mit, bei, zu, nach, von, aus and in the two-way prepositions answering "wo?" (*auf dem Sofa, unter dem Bett,
hinter dem Schrank, im Korb, neben Anna*) against the accusative answering "wohin?" (*auf den Markt, in den Garten, auf
den Tisch*); dative objects (*hilft ihr, gibt Lena einen Apfel, wie geht es Ihnen*). **Contractions** im, ins, am, zum, zur,
beim, vom. **Modal verbs** können, müssen, wollen, möchte. **Separable verbs in main clauses**: steht … auf,
fängt … an, ruft … an, kauft … ein, kommt … mit, gehen … zurück, kommt … zurück, hole … ab, fährt … ab, bringt … mit, sieht …
an; and in the infinitive after a modal (aufstehen, mitkommen). **The perfect** with haben (hat gegessen, haben gebacken, hat
geschlafen) and with sein (sind gekommen, ist gefahren, sind gegangen), told as one connected account (text 4). First **weil**
and **dass** clauses with the verb last (*weil sie so freundlich ist, dass Lena heute zu Hause bleibt, weil sie Oma und Opa lange
nicht gesehen hat*). Times of day (*um sechs Uhr, um halb sieben, um Viertel nach sieben*), Sie and Frau + surname for the
first time.

1. Am Morgen — a day's routine; aufstehen, anfangen, abfahren; times; mit dem Bus, zur Schule
2. Auf dem Markt — einkaufen; buying with möchte; weil; the first dative object
3. Ein Anruf — anrufen, abholen, dass; "Wie geht es dir?"; the telephone
4. Am Sonntag bei uns — the perfect told as a day; haben and sein; mitbringen
5. Lena ist krank — müssen, können, weil, dass; zum Arzt, vom Bett aus, im Bett bleiben
6. Frau Weber — Sie, Ihnen, Ihre; helfen and geben with the dative; beim, aus dem
7. Wo ist mein Buch? — the two-way prepositions, wo? with the dative, wohin? with the accusative, perfect of the search
8. Was machen wir am Samstag? — planning with möchte, will, muss, kann; mitkommen, zurückgehen; "Kommt Max auch mit?"

### Weg 3 — connected narrative: subordinate clauses, the preterite, relative clauses (A2)

**Subordinate clauses**: weil, dass, wenn, als, ob (*Als Anna … nach Hause kam, war das Buch nicht mehr auf dem Tisch; …, ob er das
Buch gesehen hatte; Wenn ihr uns im Sommer besucht, zeige ich dir …*), the verb last, and the main clause after a subordinate
clause (verb first, *…, war das Buch weg*). **Preterite** of the common verbs: war, hatte, ging, kam, sah, sagte, fand, fuhr,
lag, saß, stand, nahm, gab, rief, wusste, wollte, musste (and the pluperfect hatte … gesehen, war … gewesen, war … abgefahren).
**Relative clauses** (*das sie am Morgen hingelegt hatte; die auf der Bank neben ihnen saß; in der sie umsteigen mussten*).
**Adjective endings in natural use** (ein neues Buch, kleine Dörfer, die besten Äpfel, ein großer Mann, die schwarze Seite).
**Separable verbs** in the perfect (aufgestanden, angerufen, abgefahren, mitgebracht), in subordinate clauses (weiterfuhr,
umsteigen mussten, den Ofen aufmachte) and with zu (herauszunehmen, anfing … zu weinen). Genres: a small mystery with a
kind turn, **a letter** (text 2: Liebe Oma … Viele liebe Grüße, Deine Lena, with wenn, als, ob, dass), a journey with a delay,
**a retelling of a parable in plain modern German** (text 4), a baking disaster, and how two people met.

1. Das Buch, das verschwunden war — the lost book of Weg 2, told as a story with a turn: Lena took it to Frau Weber, who is ill
2. Ein Brief an Oma — **the letter**; "ob", "wenn", "als", "dass", the perfect in a child's voice, P.S.-like closing
3. Der Zug, der zu spät kam — a journey; the preterite; a tree on the tracks; a missed connection; a woman who knows Oma
4. Der Sohn, der zurückkam — **the parable**, told in the author's own words, no translation quoted; the longest text
5. Der Kuchen für Frau Weber — a burnt cake that turns out to be the best present; "fing an zu weinen", "herauszunehmen"
6. Eine Brezel für zwei — how Anna and Paul met; Sie at first, then "Wir können uns doch duzen, oder?"

### Deutschland — Lesungen 1 — ordinary life in Germany as real reading (A2)

Not tourist phrases: four continuous readings about Daniel's first weeks, with the vocabulary Germans really use.
**Needs a German reviewer** (naturalness and every statement of fact; see below).

1. Mit dem Regionalzug und der Straßenbahn — Fahrkartenautomat, Bahnsteig, Haltestelle, "Die Fahrscheine, bitte!", the Knopf to
   ask for a stop
2. Sonntag in der Gemeinde — Gottesdienst, Gemeinde, Liederbuch, Lied, Bibel, Predigt, Pastor, Kindergottesdienst, Kaffee und Kuchen afterwards
3. Beim Bäcker und auf dem Markt — Bäckerei, Brötchen, Brezel, Semmel, Wochenmarkt, Bargeld, "Sonntags sind die meisten Geschäfte geschlossen"
4. Zum ersten Mal bei einer deutschen Familie — pünktlich, Blumen mitbringen, Hausschuhe, Abendbrot, "Guten Appetit", Sie → du

### Gespräche 1 — everyday spoken German, du and Sie, the modal particles (A2)

Six dialogues (`contentType: "dialogue"`, speakers declared, one turn a paragraph). Spoken contractions *geht's, gibt's* and
the clipped forms of speech (*Ich hole sie mal; Das mach ich*). **The modal particles are a teaching aim of the course and are
seeded on purpose, at least three different ones in every dialogue and all eight across the six**: *doch* (Doch, Sie sprechen
schon sehr gut!; Dann setzen Sie sich doch zu uns!; Das ist doch kein Problem!; Doch, doch, das mache ich gern!), *mal* (Dann
probiere ich das mal; Moment mal; Ich hole sie mal), *ja* (Ich bin ja erst seit zwei Wochen hier; die fährt ja direkt hin),
*denn* (Woher kommen Sie denn?; Wo ist denn die Haltestelle?), *eben* (Pastor Lange spricht eben manchmal schnell; Abends essen wir
eben meistens kalt), *halt* (Das schmeckt halt ein bisschen kräftiger; dann frühstücken wir halt zusammen), *schon* (Das kommt schon
noch; Es gibt ja schon genug), *wohl* (die ist wohl auf der anderen Straßenseite; der Kuchen ist heute wohl von Frau Schmidt).
Also: *Ich hätte gern …, Was darf es sein?, Sonst noch etwas?, Schönen Tag noch!, Gern geschehen, Wie komme ich zum …?*, imperatives
in the Sie form (*Gehen Sie geradeaus, biegen Sie links ab*) and in the du form (*Komm einfach um neun, Bring nur gute Laune mit*),
answering the telephone with the surname.

1. Hallo, ich bin Daniel — greeting and introducing oneself; Sie; Woher kommen Sie denn?
2. Beim Bäcker — Was darf es sein? Ich hätte gern …; choosing, paying, "Schönen Tag noch!"
3. Wie komme ich zum Bahnhof? — asking the way; Sie; Moment mal; the tram
4. Am Telefon — a child answers "Keller."; du; "Soll ich etwas mitbringen?"
5. Nach dem Gottesdienst — talking after the service; the offer of the du ("In unserer Gemeinde sagen wir meistens du")
6. Eine Einladung zum Abendbrot — inviting someone for a meal; du; "Soll ich etwas mitbringen?"; the Blumen

## Vocabulary

Per text: sentences, running words, distinct word forms, and how many of those forms are new compared with the earlier texts of the
same path (Weg 1–3 build on each other; the Lesungen and the Gespräche are each counted against themselves). For reviewers and for
tuning the lexicon, not for learners. The lists are generated from the JSON by a script that is not part of the repository.

| Text | Title | Sentences | Words | Distinct | New |
|---|---|---|---|---|---|
| weg-1-01 | Ich bin Anna | 16 | 72 | 30 | 30 |
| weg-1-02 | Max und das Brot | 18 | 76 | 31 | 18 |
| weg-1-03 | Lena hat Hunger | 17 | 80 | 44 | 22 |
| weg-1-04 | Das Haus | 17 | 90 | 38 | 13 |
| weg-1-05 | Das Frühstück | 20 | 83 | 37 | 14 |
| weg-1-06 | Paul geht in die Stadt | 16 | 77 | 34 | 13 |
| weg-1-07 | Lena und Max im Park | 22 | 98 | 42 | 14 |
| weg-1-08 | Der Abend | 19 | 84 | 49 | 13 |
| weg-2-01 | Am Morgen | 18 | 129 | 69 | 25 |
| weg-2-02 | Auf dem Markt | 17 | 130 | 84 | 40 |
| weg-2-03 | Ein Anruf | 16 | 129 | 78 | 35 |
| weg-2-04 | Am Sonntag bei uns | 19 | 126 | 77 | 31 |
| weg-2-05 | Lena ist krank | 19 | 139 | 82 | 18 |
| weg-2-06 | Frau Weber | 16 | 127 | 75 | 20 |
| weg-2-07 | Wo ist mein Buch? | 19 | 130 | 63 | 14 |
| weg-2-08 | Was machen wir am Samstag? | 15 | 126 | 71 | 22 |
| weg-3-01 | Das Buch, das verschwunden war | 24 | 238 | 129 | 50 |
| weg-3-02 | Ein Brief an Oma | 20 | 211 | 133 | 51 |
| weg-3-03 | Der Zug, der zu spät kam | 20 | 226 | 138 | 53 |
| weg-3-04 | Der Sohn, der zurückkam | 22 | 294 | 170 | 71 |
| weg-3-05 | Der Kuchen für Frau Weber | 25 | 222 | 133 | 51 |
| weg-3-06 | Eine Brezel für zwei | 22 | 202 | 122 | 37 |
| deutschland-lesungen-1-01 | Mit dem Regionalzug und der Straßenbahn | 19 | 189 | 113 | 113 |
| deutschland-lesungen-1-02 | Sonntag in der Gemeinde | 19 | 174 | 113 | 81 |
| deutschland-lesungen-1-03 | Beim Bäcker und auf dem Markt | 18 | 158 | 105 | 64 |
| deutschland-lesungen-1-04 | Zum ersten Mal bei einer deutschen Familie | 19 | 161 | 102 | 48 |
| gespraeche-1-01 | Hallo, ich bin Daniel | 14 | 108 | 76 | 76 |
| gespraeche-1-02 | Beim Bäcker | 16 | 106 | 67 | 53 |
| gespraeche-1-03 | Wie komme ich zum Bahnhof? | 15 | 103 | 75 | 48 |
| gespraeche-1-04 | Am Telefon | 15 | 109 | 77 | 40 |
| gespraeche-1-05 | Nach dem Gottesdienst | 14 | 111 | 80 | 36 |
| gespraeche-1-06 | Eine Einladung zum Abendbrot | 17 | 115 | 81 | 31 |

Distinct forms per work: Weg 1 137, Weg 2 302 (of which 97 are already in Weg 1), Weg 3 494 (181 already met in Weg 1 or 2), Lesungen 306, Gespräche 284.

## Document fields

Every document is a v2 story (`contentType: "story"`) or dialogue (`contentType: "dialogue"`, with `speakers`), corpus
`ci-de` (the block the three older German seed documents use), with explicit declared `sentences`, each with an English line
(`english.source: "drafted with the text; not reviewed"`), and no analysis spans: the German adapter does the analysis.
`work: { slug, chapter: { index, title } }` places it in its work; `streams`, `domains` (home, books, food, town, church,
family …) and `variety: "de-DE"` are set. Difficulty labels: Weg 1 A0; Weg 2 A1; Weg 3, Lesungen and Gespräche A2.
`prepTargets` are empty: the parable in Weg 3 text 4 is told in the author's own words and quotes no translation, so it is not
tied to a verse reference.

Fictional material. The people, the town, the prices and the times are invented. Nothing in a text is a statistic, a date or a
historical claim.

## Facts about Germany the texts state or rely on

Only these, each one a reviewer can check at a glance. Anything not listed was left out.

* Words and phrasing: Brötchen (Bavaria: Semmel, said so once); Abendbrot as the evening meal; Hausschuhe; Pastor; Kindergottesdienst;
  Kaffee und Kuchen after a service; Wochenmarkt; Fahrkartenautomat; Regionalzug; Straßenbahn.
* Rail and tram: tickets can be bought from a machine at the station, whose screen can often be set to another language; **sometimes a
  ticket must be stamped before the journey** (stated as "manchmal"); regional trains stop at many small stations and a voice announces the
  stops; trains are sometimes late; on a tram a screen often shows the next stop, you press a button to get off, **tickets are checked
  and a rider without one pays a fine**.
* Bakery and market: many bakeries open early; there are very many kinds of bread; a weekly market sells fruit, vegetables,
  cheese, eggs and flowers; one pays in euros and **often in cash at a market stall**; **most shops are closed on Sundays**.
* Church: a service on Sunday morning (here, at ten o'clock, in an invented congregation of no stated denomination); people shake hands
  and say "Guten Morgen"; hymn book at the door; a children's service; a reading, prayer, a sermon by the pastor; coffee and cake afterwards.
* A first visit: arriving on time; bringing a small gift of flowers; **in many houses the shoes come off at the door and slippers are
  offered**; the evening meal is often cold (bread, cheese, sausage, tomatoes, tea) and the main hot meal midday for many families;
  "Guten Appetit" / "Danke, gleichfalls"; Sie until the older or host offers the du ("Wir können uns ruhig duzen").
* On the telephone one often answers with one's surname ("Keller.", "Hier ist Paul" among family).
* Spelling and form of address: reformed spelling (dass, muss); Herr / Frau + surname with Sie.

## What a reviewer should check

For every text:

1. **Naturalness.** Would a native speaker say it this way? Controlled texts tend toward stiffness: flag any sentence that sounds like a
   textbook, even if it is grammatical. In particular: **sentences that are correct but unusual** (*Lena ist traurig, weil sie nicht
   spielen kann*; the dialogue "Ich hole sie mal"), the word order after a quotation (*„Nein“, sagte er, „ich war ja …“*), and whether
   an eight-year-old would say what Lena says.
2. **Correctness.** Case endings, the perfect auxiliary, separable verbs and their position, adjective endings, the verb-last clauses,
   modern spelling and ß/ss, German quotation marks.
3. **Faithfulness of the English line** to its German sentence (plain, not free).
4. **Particles.** Do doch, mal, ja, denn, eben, halt, schon and wohl sound right where they stand, and are they used as a
   German would use them rather than as a learner shows them off?
5. **Register.** Sie to Herr Miller, the neighbour, the shop assistant and the stranger in the street; du between Anna and
   Daniel after the first visit, to Lena, and among the congregation after Herr Brandt's offer. Is the switch from Sie to du in
   Lesungen 4, Gespräche 5 and Weg 3 text 6 believable?
6. **Vocabulary choices.** Brötchen / Semmel; Handy; Abendbrot; Straßenbahn; Aufschnitt; Pfund (500 g); Pastor.

For the Deutschland readings, by a German reviewer: **every statement in the section above**, above all the three that are easiest to
get wrong (stamping a ticket "manchmal"; the ticket check and the fine; shoes at the door and the cold evening meal "in vielen
Häusern / viele Familien"), the church scene (generic by design; whether "Pastor" and the order of service suit the intended
denomination), and whether Daniel's first-week experiences are the ones a newcomer would have.

For Weg 3 text 4 (the parable): that the retelling is faithful to the parable of the two sons in Luke 15 in substance, that nothing is added
as if it were in the text, and that the final sentence is true ("Die Geschichte sagt nicht, ob der ältere Sohn ins Haus ging").

For the course: after review, record it with `npm run corpus:review`; until then the texts are unpublished and appear only in preview.

## Known limits of this prototype

* **Analysis coverage** depends on the adapter and its lexicon, which are growing. `test/content/german-acquisition.test.ts` prints
  the coverage per text; with the German adapter as it stood when these texts were written it was about 46 % of the words
  (the first single-file adapter had only about 80 entries). `lexicon-course.ts` is written to bring that to near 100 % once the
  engine reads the rows.
* **Separable verb kennenlernen** ("lernten sich … kennen"): the row is `kennen|lernen` and `kennen` is not one of the usual
  separable prefixes of the prefix table; the sentence layer needs to know it.
* **Prices, amounts and the English lines** are the drafter's own.
* Machine-drafted. No claim in this document replaces a native reviewer's judgement.
