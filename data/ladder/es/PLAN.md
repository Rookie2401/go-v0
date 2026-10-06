# Spanish ladder — vocabulary and unit plan (a1-1 … a2-2, with the b1-bridge brief)

Planning document for `data/ladder/es/ladder.json` (contract: `docs/LADDER.md`), written 2026-10-05 by the Spanish ladder planner. Writers draft the texts from it later; **nothing here is reviewed by a person** (Honduran usage, glosses and every word marked "to add" need the Spanish session and a Honduran reviewer). Figures marked *(measured)* were produced on 2026-10-05 with the real Spanish adapter (`adapter-es@7`) on the working tree, the same way the future gate will read the units (first reading of each word, lemma, proper nouns and numerals known). The planning scripts were scratch files and are not in the repository; the plan below is the data.

## 0. Summary and the findings that shape the plan

| | a1-1 | a1-2 | a2-1 | a2-2 | total |
|---|---:|---:|---:|---:|---:|
| units (core + volume) | 15 (12+3) | 16 (13+3) | 18 (13+5) | 20 (15+5) | 69 (53+16) |
| words per unit | 270–400 | 400–600 | 600–900 | 900–1300 | |
| running words | 5,160 | 7,990 | 13,990 | 23,100 | 50,240 |
| new lemmas (incl. words to add) | 123 | 188 | 300 | 349 | 960 |
| new lemmas per 100 words | 2.38 | 2.35 | 2.14 | 1.51 | 1.91 |
| lemmas known at the end of the stage (with Stage 0's 80) | 203 | 391 | 691 | 1,040 | 1,040 |
| Scripture-domain share of the stage | 0.0% | 6.5% | 6.4% | 5.2% | 5.2% |

Findings, in the order they matter:

1. **The coverage rule, not the "5 per 100" ceiling, sets the vocabulary budget.** The gate calls a lemma known only after three earlier encounters, so the first three tokens of every new lemma are "unknown" in the unit that introduces it, whatever the writer does. Expected coverage of a unit is therefore about 1 − (3 × new lemmas + Stage 0 top-up tokens) / words. The warning line is 92 %, which allows **at most 2.65 new lemmas per 100 words** (a unit of 400 words may introduce 10). The brief's ceiling of 5 per 100 would land at 85 %, the error line for controlled units. The plan budgets every core unit at ≤ 2.65 per 100 and every volume unit at ≤ 2.3 per 100, so all units except 01 and 02 are planned at ≥ 92 % ("est. cov." in the tables) and 01–02 at ≈ 85 % inside the lower band the policy grants them. Each new lemma must be used **exactly three times** in its introducing unit (fewer leaves it unknown for the next unit; more is harmless to learning but changes nothing for the gate).
2. **Stage 0 secures only 41 of its 81 lemmas** (met three times or more in its 15 scenes); 40 more are met once or twice. Using one of them in unit 01 costs one or two "unknown" tokens each. The plan spends 50 top-up tokens across units 01–09 (section 1.4). The cheaper fix is on Stage 0's side: two more scenes (about 100 words) that use the 40 under-met lemmas once or twice each would free units 01–09 of this cost and let 01–02 reach 92 %.
3. **No authentic library text clears the gate at the end of a2-2** (≈ 1,040 lemmas): estimated coverage of the best candidates is 86–93 % (a few Bible chapters, two children's stories) and 70–85 % for everything else (section 5). The b1-bridge therefore starts with adapted units that teach the missing 50–100 lemmas of the easiest authentic texts, and needs about 400–650 more lemmas before Martí, Unamuno, Alarcón or Galdós are comfortable.
4. **Size.** 69 units / 50,240 words meets the 45–60 k target only with 16 volume units (11,840 words, almost no new vocabulary) next to the 53 core units (38,400 words). The per-unit ranges alone (250–400, 400–600, 600–900, 900–1,300 words) cannot reach 45 k in 50 units (at their upper ends they give about 38 k). a1 in total (13,150 words) is a little under the 15–30 k that `docs/LADDER.md` calls indicative; three or four more a1 volume units (+1.5 k) would close it at no vocabulary cost.
5. **Drafts.** Camino 1–3 use *tú* (¿tienes…?, cuéntanos, dime) and one Spain-ism (*estación*); Honduras — Lecturas are voseo and Honduran but need A2 vocabulary (25–38 % off-plan at the units their titles suggest). Section 4 maps each draft to the unit where it is readable with ≤ 15 % off-plan words.
6. **Adapter points the gate will trip on** (section 7): *Nico* is read as the verb *nicar* and *Sam* as an unknown word (add both to the proper-name list); the `vosotros` detector fires on voseo *-ís* forms (*vivís, salís, decís*); there is no detector for reflexive verbs, commands, or pronouns written before the verb.

## 1. The starting point: what Stage 0 gives

### 1.1 Size and cast

Stage 0 (`data/stage0/es/`, AI-drafted, unreviewed, audio "needed" on every line): 15 scenes (86 lines, 396 running words *(measured)*), 3 sound steps (vowels and silent *h*; *ll, ñ, j, z/c as s*; *r/rr, qu, b/v*), 4 review steps, 2 exit forms (not exposure). Cast: **Sam** (the learner's stand-in, a newcomer), **Ana** (nurse at the clinic, Luis's sister), **Luis** (teacher, Ana's brother), **doña Marta** (grandmother, sells bread at the market, goes to church), **Nico** (her grandson, ten, loses things). The ladder keeps this cast and widens it with names from the word list (Karla, Daniel, Marvin, Elena, Kevin, Carlos, Mario, Sofía, Miguel…); proper nouns and numerals count as known if the adapter reads them as such.

### 1.2 Lemmas

**Met three or more times (41, known to the gate from unit 01):** hola (4), me (11), llamar (3), mucho (9), gustar (14), ser (7), mi (6), y (6), tener (5), agua (6), café (10), no (10), querer (9), gracias (4), aquí (3), de (4), nada (3), yo (6), estar (17), en (16), la (16), casa (4), escuela (4), también (3), el (15), trabajar (3), hoy (6), cansado (5), sí (5), tu (4), bolsa (3), pan (10), a (8), doña (4), arroz (6), costar (5), domingo (4), ir (9), iglesia (4), con (3), tomar (3).

**Met once or twice (40, need top-up):** él (2), hermano (2), hermana (2), beber (2), mercado (2), clínica (2), dónde (2), llave (1), saber (2), mesa (2), muy (2), bien (2), vender (2), mí (2), te (2), bueno (2), día (2), qué (2), por (2), favor (2), haber (2), cuánto (2), lempira (2), mañana (1), nosotros (2), ustedes (2), pero (2), llover (2), porque (2), abuela (2), vivo (1), amiga (1), su (1), maestro (1), comer (1), ella (1), amigo (1), vivir (1), para (1), vos (1). *(In scene s13 "Vivo en Honduras" the adapter's first reading is the adjective *vivo*, so *vivir* is counted once, from s15.)*

Numerals taught: *diez, veinte* (free for the gate). Names: Sam, Ana, Luis, Marta, Nico, Honduras, Jesús (sound step). The 12 sound-step words (hola, agua, café, hermano, llave, mañana, Jesús, gracias, arroz, quiero, bebe, vos) are all already in the scenes except the name Jesús.

### 1.3 Constructions

Stage 0 declares 29 coverage ids (`coverage.json`): **pragmatics** greeting and meeting, politeness (gracias, de nada, por favor, doña); **constructions** me llamo + name, X es Y, tener + thing, yes/no questions by intonation, estar en + place, estar + state, ¿Dónde está…?, no sé, (a mí) me gusta + thing, hay, ¿Cuánto cuesta…?, ir a + place, ir a + verb, porque, pero; **grammar** possessives mi / tu / su, gender -o/-a, el / la, present he/she, present I (-o), vos forms (querés, tenés, vas), no before the verb, adjective agreement, numbers (diez, veinte), time words (mañana, domingo, hoy). The adapter's `detectPatterns` *(measured)* fires on three keys only: `voseo`, `gustar-type` (me gusta), `ir-a-infinitive` (vamos a tomar). Verb forms met: llamo; gusto/gusta; es; tiene/tenés; bebe; querés/quiero/quieren; está/estás/estoy; trabaja; sé; vendo/vende; hay; cuesta; va/van/vas/voy/vamos; llueve; tomo; comemos; vive.

### 1.4 What Stage 0 does not give, and the top-up

Not met at all: *un/una/unos/unas*, *los/las* and plural nouns (except *días, lempiras*), *al/del*, *nuestro*, *que*, *hablar, hacer, ver, decir, poder, venir, salir*, *sos/soy* and *vivís/hablás/comés* (only *querés, tenés, vas*), *tú, ellos, ellas* (Stage 0 has *yo, él, ella, nosotros, ustedes, vos*), all days but *domingo*, all numbers above *veinte*, the hour, colours, family beyond *hermano/a, abuela*, any past tense, any object pronoun beyond *me/te* with *gustar*. Units 01–04 therefore teach the articles, the plural, and the full present before anything else.

Top-up (these Stage 0 lemmas are used in the stated unit exactly the stated number of times; each token is counted as unknown by the gate): **es-a1-1-01** — vos×2, bien, muy, bueno, día, qué, por, favor, te, dónde, vivir×2, amiga×2 (15); **es-a1-1-02** — mesa, llave×2, haber, su×2, él, ella×2, para×2, mí, pero, porque (14); **es-a1-1-03** — hermano, hermana, abuela (3); **es-a1-1-04** — beber, comer×2 (3); **es-a1-1-05** — amigo×2, nosotros, ustedes (4); **es-a1-1-06** — mercado, vender, cuánto (3); **es-a1-1-07** — clínica, saber, llover, maestro×2, mañana×2 (7); **es-a1-1-09** — lempira (1). Total 50 tokens.

## 2. Targets per stage

### 2.1 Table

| stage | units | words / unit | stage words | core words | volume words | new lemmas | new / 100 | known lemmas at end | lowest est. cov. (from unit 03) | Scripture share |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| a1-1 | 15 (12+3) | 270–400 | 5,160 | 4,140 | 1,020 | 123 | 2.38 | 203 | 92.0% | 0.0% |
| a1-2 | 16 (13+3) | 400–600 | 7,990 | 6,550 | 1,440 | 188 | 2.35 | 391 | 92.2% | 6.5% |
| a2-1 | 18 (13+5) | 600–900 | 13,990 | 10,110 | 3,880 | 300 | 2.14 | 691 | 92.0% | 6.4% |
| a2-2 | 20 (15+5) | 900–1300 | 23,100 | 17,600 | 5,500 | 349 | 1.51 | 1,040 | 92.1% | 5.2% |

*Core* units carry the vocabulary and the construction; *volume* units (marked "vol") carry almost none: they exist to give recycling, to bring the totals to ~50 k words, to vary domain, and to hold units of the Camino / Honduras drafts. A volume unit has ≤ 2.3 new lemmas per 100 words (est. cov. ≥ 92 %, most ≥ 95 %). Units 65–69 introduce nothing: the new lemmas of the last six units cannot be recycled inside the ladder (the gate asks for three more encounters within the next six units), so only unit 64 (nine occupation words) introduces any, and the b1-bridge starts by recycling them.

### 2.2 Constructions: the sequence and where the adapter can see it

The order the owner set holds: present → near future → preterite → imperfect → object pronouns → reflexives → perfect → commands → subjunctive basics. Formulaic forms (*vení, mirá, dame*, *me llamo*, *me levanto*, *se sientan*) appear earlier as chunks, never as paradigms.

| order | construction | adapter key (`detectPatterns`) | taught in | note |
|---|---|---|---|---|
| 1 | present, all persons; voseo (-ás/-és/-ís); ser, estar, tener, hay | `voseo`, `ser-estar-adjective` | Stage 0, then 01–08 | The `vosotros` key also fires on *vivís/salís/decís* (adapter ambiguity, section 7). |
| 2 | gustar / doler (me gusta, me duele) | `gustar-type` | Stage 0, 04, 12 | *encantar, interesar, molestar* are missing from the list (section 6). |
| 3 | near future: ir a + infinitive | `ir-a-infinitive` | Stage 0, 10 |  |
| 4 | modal + infinitive: tener que, poder, querer; hay que | `tener-que` (also fires on *hay que*) | 10, 11, 24 | *poder / querer + infinitive* have no key. |
| 5 | estar + gerund | `estar-gerund` | 16 |  |
| 6 | preterite: regular, then ir/ser, hacer, ver, estar, tener, dar, decir, venir, poner, poder | `preterite` | 19–21, then 23–26 | Voseo preterite = the tú form (*vos comiste*). |
| 7 | comparison (más … que, tan … como) | `comparison` | 28, 62 |  |
| 8 | impersonal / passive se (se pone, se vende) | `se-impersonal` | 27, 48 |  |
| 9 | imperfect (description, habit); preterite vs imperfect; acabar de | `imperfect`, `acabar-de` | 32–35 |  |
| 10 | object pronouns: lo/la/los/las, then le/les/me/te/nos; attached to the infinitive; personal a | `enclitic-pronoun`, `personal-a` | 36–38 | Pronouns written before the verb (*lo vi, me prestó*) have no key. |
| 11 | reflexive verbs (me levanto, se baña, nos reunimos) | — none — | 39–40 | No detector exists. |
| 12 | present perfect (he/has/ha + participle) | `perfect-tense` | 50–52 |  |
| 13 | commands: vos (vení, mirá, decime), usted/ustedes, negative | — none — (`voseo`, `enclitic-pronoun` fire on some) | 53–54 | No detector for the imperative. |
| 14 | subjunctive: querer que, para que, cuando, si-clauses, aunque | `querer-que-subjunctive`, `para-que-subjunctive`, `cuando-subjunctive`, `si-conditional`, `aunque-subjunctive` | 55, 57, 58, 66 | Present subjunctive only; the future subjunctive and *vosotros* are receptive (`future-subjunctive`, `vosotros` are never taught). |
| 15 | double object pronouns (se lo dije); llevar + gerund | `double-object-pronouns`, `llevar-gerund` | 66, 61 |  |

### 2.3 Domain mix (running words)

| domain | a1-1 | a1-2 | a2-1 | a2-2 |
|---|---:|---:|---:|---:|
| conversation | 270 (5%) | 400 (5%) | 1,600 (11%) | 2,200 (10%) |
| daily life | 630 (12%) | 440 (6%) | 760 (5%) | — |
| family | 300 (6%) | — | — | 1,000 (4%) |
| food | 650 (13%) | — | — | — |
| community | 680 (13%) | — | — | 1,120 (5%) |
| work | 360 (7%) | 600 (8%) | 850 (6%) | 1,150 (5%) |
| travel | 370 (7%) | 460 (6%) | 780 (6%) | 2,340 (10%) |
| church and mission life | 380 (7%) | 540 (7%) | 790 (6%) | 1,150 (5%) |
| health | 380 (7%) | 520 (7%) | 820 (6%) | 1,180 (5%) |
| practical communication | 390 (8%) | — | 730 (5%) | 1,080 (5%) |
| correspondence | — | 580 (7%) | 1,580 (11%) | 1,300 (6%) |
| testimony | 400 (8%) | — | — | 2,250 (10%) |
| narrative | 350 (7%) | 1,880 (24%) | 1,300 (9%) | 1,200 (5%) |
| explanation | — | 970 (12%) | 620 (4%) | 1,260 (5%) |
| biography | — | 540 (7%) | 1,500 (11%) | 1,290 (6%) |
| instructions | — | 540 (7%) | 900 (6%) | 1,040 (5%) |
| contemporary nonfiction | — | — | 870 (6%) | 2,330 (10%) |
| scripture | — | 520 (7%) | 890 (6%) | 1,210 (5%) |

"Scripture" means a retelling or quotation of a biblical text (units 25, 45, 59). Church and mission life, testimony and prayer vocabulary are separate domains and are **not** counted as Scripture, though the shared vocabulary is religious in places (units 51 and 57). The Scripture share is 0–7 % per stage, which leaves room under the 15 % ceiling for the b1-bridge and for the owner to add a unit per stage.

### 2.4 What every unit must obey

1. **Budget.** Introduce exactly the new lemmas listed, each exactly three times in the unit; use no lemma outside Stage 0, the earlier units' lists and the unit's own list (including "words to add" only once the Spanish session has accepted them). Inflections of a listed lemma are free; a word that the adapter cannot analyse as a listed lemma counts as unknown.
2. **Recycle.** Use every lemma on the unit's "recycle" list at least once. Function words (articles, pronouns, prepositions, conjunctions) are listed as new where they are new but need no recycle slot.
3. **Variety.** es-HN: voseo for informal address (*vos sos, tenés, vení*), *usted* for older or unknown people (doña Marta, the pastor), *ustedes* for plurals, never *vosotros*. Honduran or Central American words (*baleada, tamal, pulpería, chamba, pisto, cipote, catracho, ahorita, platicar, jugo*) appear only where listed and are flagged for the Honduran reviewer.
4. **Names, numerals.** Names from the list are free; numerals are free and are taught on the way: 1–20 and ages (03), prices to 100 (06), the hour (07), dates (14, 30), years (26), hundreds and thousands (31, 47).
5. **Sentence length.** Mean ≤ 7 words in a1-1, ≤ 9 in a1-2, ≤ 12 in a2-1, ≤ 15 in a2-2; one clause per sentence in a1-1.
6. **Domains.** Follow the unit's domain; keep the cast; texts are for adults on a mission team (no children's register apart from Nico's units).
7. **Provenance.** Each unit is a `controlled` document under `data/ladder/es/units/`, corpus id `ladder-es`, `pipeline.state: "machine-draft"`, review checklist ready; Honduran usage points listed in the unit's notes for the reviewer.

## 3. The units

### 3.1 Table

"New" counts include words to add. "Est. cov." = 1 − (3 × new + top-up) / words *(planned, not measured)*. Units 01–02 are in the policy's lower band (warn 85 %, error 78 %).

| id | # | kind | words | domain | title | new | / 100 | est. cov. | main construction |
|---|---:|---|---:|---|---|---:|---:|---:|---|
| es-a1-1-01 | 1 | core | 270 | conversation | Meeting in the street | 8 | 3.0 | 86% | vos / usted questions |
| es-a1-1-02 | 2 | core | 280 | daily life | Sam's room | 9 | 3.2 | 85% | articles, plural, hay |
| es-a1-1-03 | 3 | core | 300 | family | A family photograph | 7 | 2.3 | 92% | tener + age, possessives |
| es-a1-1-04 | 4 | core | 320 | food | Breakfast at the comedor | 7 | 2.2 | 93% | querer / gustar + noun |
| es-a1-1-05 | 5 | vol | 330 | food | Sunday lunch | 7 | 2.1 | 92% | recycling (food, family) |
| es-a1-1-06 | 6 | core | 340 | community | At the market | 8 | 2.4 | 92% | numbers to 100 |
| es-a1-1-07 | 7 | core | 350 | daily life | Luis's school day | 7 | 2.0 | 92% | present 3sg, the hour |
| es-a1-1-08 | 8 | core | 360 | work | Who works where | 9 | 2.5 | 93% | full present, ser + profession |
| es-a1-1-09 | 9 | vol | 340 | community | A Sunday morning on the street | 6 | 1.8 | 94% | recycling (street, greetings) |
| es-a1-1-10 | 10 | core | 370 | travel | The bus to San Pedro Sula | 9 | 2.4 | 93% | ir a + infinitive, tener que |
| es-a1-1-11 | 11 | core | 380 | church and mission life | The team meeting | 10 | 2.6 | 92% | poder / querer + infinitive |
| es-a1-1-12 | 12 | core | 380 | health | Nico is sick | 10 | 2.6 | 92% | doler, tener fiebre |
| es-a1-1-13 | 13 | vol | 350 | narrative | The lost school bag | 6 | 1.7 | 95% | recycling (hay, buscar) |
| es-a1-1-14 | 14 | core | 390 | practical communication | A message and a notice | 10 | 2.6 | 92% | infinitive instructions, dates |
| es-a1-1-15 | 15 | core | 400 | testimony | Sam's first testimony | 10 | 2.5 | 93% | first-person present |
| es-a1-2-01 | 16 | core | 400 | conversation | "¿Qué estás haciendo?" | 10 | 2.5 | 93% | estar + gerund |
| es-a1-2-02 | 17 | core | 410 | explanation | Rainy season, dry season | 10 | 2.4 | 93% | weather expressions |
| es-a1-2-03 | 18 | vol | 420 | narrative | A rainy Saturday | 5 | 1.2 | 96% | recycling (estar + gerund) |
| es-a1-2-04 | 19 | core | 440 | daily life | Yesterday after work | 11 | 2.5 | 93% | preterite, regular -ar |
| es-a1-2-05 | 20 | core | 460 | travel | By bus to the coast | 12 | 2.6 | 92% | preterite, regular -er / -ir |
| es-a1-2-06 | 21 | core | 480 | narrative | Ana's weekend in Tegucigalpa | 12 | 2.5 | 93% | irregular preterites |
| es-a1-2-07 | 22 | vol | 480 | narrative | Last weekend | 11 | 2.3 | 93% | recycling (preterite) |
| es-a1-2-08 | 23 | core | 500 | narrative | Sam's first week | 13 | 2.6 | 92% | preterite narration |
| es-a1-2-09 | 24 | core | 520 | health | At the clinic | 13 | 2.5 | 93% | tener + symptom, hay que |
| es-a1-2-10 | 25 | core | 520 | scripture | The lost sheep (Luke 15) | 13 | 2.5 | 93% | preterite narration (parable) |
| es-a1-2-11 | 26 | core | 540 | biography | Doña Marta's life | 14 | 2.6 | 92% | preterite + present biography |
| es-a1-2-12 | 27 | core | 540 | instructions | How to make baleadas | 14 | 2.6 | 92% | instructions: infinitive, se |
| es-a1-2-13 | 28 | core | 560 | explanation | Describing people and places | 14 | 2.5 | 93% | ser vs estar, comparison |
| es-a1-2-14 | 29 | vol | 540 | church and mission life | A service through a child's eyes | 6 | 1.1 | 97% | recycling (church) |
| es-a1-2-15 | 30 | core | 580 | correspondence | Invitations and the calendar | 15 | 2.6 | 92% | months, dates, invitations |
| es-a1-2-16 | 31 | core | 600 | work | Carlos looks for work | 15 | 2.5 | 93% | preterite + present, interview |
| es-a2-1-01 | 32 | core | 600 | biography | "Cuando yo era niño" | 15 | 2.5 | 93% | imperfect |
| es-a2-1-02 | 33 | core | 620 | explanation | Our village before and now | 16 | 2.6 | 92% | imperfect description |
| es-a2-1-03 | 34 | vol | 620 | narrative | Grandmother's night story | 9 | 1.5 | 96% | recycling (imperfect) |
| es-a2-1-04 | 35 | core | 680 | narrative | The night of the storm | 18 | 2.6 | 92% | preterite vs imperfect |
| es-a2-1-05 | 36 | core | 700 | conversation | Buying clothes | 18 | 2.6 | 92% | lo / la / los / las |
| es-a2-1-06 | 37 | core | 730 | practical communication | Asking, telling, lending | 18 | 2.5 | 93% | le / les / me / te / nos |
| es-a2-1-07 | 38 | vol | 700 | correspondence | The team's group chat | 9 | 1.3 | 96% | recycling (pronouns) |
| es-a2-1-08 | 39 | core | 760 | daily life | Nico's morning | 20 | 2.6 | 92% | reflexives, present |
| es-a2-1-09 | 40 | core | 790 | church and mission life | Getting ready for church | 20 | 2.5 | 92% | reflexives, all persons |
| es-a2-1-10 | 41 | core | 820 | health | The medical brigade | 21 | 2.6 | 92% | pronouns with advice |
| es-a2-1-11 | 42 | vol | 780 | travel | A delayed bus | 11 | 1.4 | 96% | recycling (past + pronouns) |
| es-a2-1-12 | 43 | core | 850 | work | A day at the workshop and the farm | 22 | 2.6 | 92% | past tenses at work |
| es-a2-1-13 | 44 | core | 870 | contemporary nonfiction | Honduras in facts | 23 | 2.6 | 92% | description in the present |
| es-a2-1-14 | 45 | core | 890 | scripture | The son who left (Luke 15) | 19 | 2.1 | 94% | long past narrative |
| es-a2-1-15 | 46 | vol | 880 | correspondence | A letter abroad | 7 | 0.8 | 98% | recycling (letter) |
| es-a2-1-16 | 47 | core | 900 | biography | A missionary couple | 24 | 2.7 | 92% | all past tenses, biography |
| es-a2-1-17 | 48 | core | 900 | instructions | How it is done | 22 | 2.4 | 93% | impersonal se |
| es-a2-1-18 | 49 | vol | 900 | conversation | Renting a room | 8 | 0.9 | 97% | recycling (negotiation) |
| es-a2-2-01 | 50 | core | 900 | conversation | "¿Ya has desayunado?" | 23 | 2.6 | 92% | present perfect |
| es-a2-2-02 | 51 | core | 950 | testimony | Small-group testimonies | 25 | 2.6 | 92% | perfect vs preterite |
| es-a2-2-03 | 52 | vol | 1000 | family | A long phone call | 6 | 0.6 | 98% | recycling (all tenses) |
| es-a2-2-04 | 53 | core | 1040 | instructions | Vení, mirá, decime | 27 | 2.6 | 92% | vos imperatives |
| es-a2-2-05 | 54 | core | 1080 | practical communication | Notices, rules, recipes | 28 | 2.6 | 92% | usted imperatives |
| es-a2-2-06 | 55 | core | 1120 | community | The neighbourhood meeting | 29 | 2.6 | 92% | querer que + subjunctive |
| es-a2-2-07 | 56 | vol | 1050 | contemporary nonfiction | Neighbourhood news | 8 | 0.8 | 98% | recycling (perfect) |
| es-a2-2-08 | 57 | core | 1150 | church and mission life | Planning the next visit | 30 | 2.6 | 92% | para que / cuando + subjunctive |
| es-a2-2-09 | 58 | core | 1180 | health | If you have a fever | 31 | 2.6 | 92% | si + present |
| es-a2-2-10 | 59 | core | 1210 | scripture | The Good Samaritan | 27 | 2.2 | 93% | all pasts, parable |
| es-a2-2-11 | 60 | vol | 1100 | travel | A traveller's blog | 8 | 0.7 | 98% | recycling (description) |
| es-a2-2-12 | 61 | core | 1240 | travel | Diary of the mission trip | 32 | 2.6 | 92% | llevar + gerund, mixed past |
| es-a2-2-13 | 62 | core | 1260 | explanation | Opinions and comparisons | 33 | 2.6 | 92% | comparatives, opinions |
| es-a2-2-14 | 63 | core | 1280 | contemporary nonfiction | The rainy season and the farmers | 33 | 2.6 | 92% | porque / aunque, explanation |
| es-a2-2-15 | 64 | vol | 1150 | work | Interview with a nurse | 9 | 0.8 | 98% | recycling (questions) |
| es-a2-2-16 | 65 | core | 1290 | biography | A nurse's life | 0 | 0.0 | 100% | all past tenses, relative clauses |
| es-a2-2-17 | 66 | core | 1300 | conversation | A loan, politely | 0 | 0.0 | 100% | aunque, double pronouns |
| es-a2-2-18 | 67 | vol | 1200 | narrative | The key that came back | 0 | 0.0 | 100% | recycling (narrative) |
| es-a2-2-19 | 68 | core | 1300 | correspondence | The weekly report | 0 | 0.0 | 100% | formal report |
| es-a2-2-20 | 69 | core | 1300 | testimony | Why I came to Honduras | 0 | 0.0 | 100% | all tenses, subjunctive |

### 3.2 Unit by unit

Format: situation; **new** lemmas (from the course list; words to add are marked `+`); **recycle** (lemmas introduced in the previous six units that this unit must use at least once; chosen by theme overlap and load, each new lemma is assigned to three of the following six units: 904 content lemmas tracked, 0 with fewer than three slots, most recycles per 100 words 10.4); focus; draft source.

#### es-a1-1-01 · #1 · core · conversation · 270 words · est. cov. 86% · Meeting in the street
- **Situation.** Sam meets Ana and doña Marta in the street: greetings by time of day, "¿cómo te llamás?" to Ana (vos) but "¿cómo se llama usted?" to doña Marta, where are you from, where do you live, "¿hablás español?"
- **New (8).** usted cómo se señor nombre tarde hablar español *(function words, no recycle slot: usted, se)*
- **Stage 0 top-up (15 tokens).** vos×2 bien muy bueno día qué por favor te dónde vivir×2 amiga×2
- **Recycle (0).** nothing yet (first unit)
- **Focus.** vos vs usted questions, ser identity and origin, present of hablar / vivir / ser / llamar in yo, vos, usted, question words — keys: `voseo`.

#### es-a1-1-02 · #2 · core · daily life · 280 words · est. cov. 85% · Sam's room
- **Situation.** Sam's room at doña Marta's house: what there is in each room, "hay una cama grande y un baño", where things are (en, al lado de)
- **New (9).** un una los las al este cuarto cama grande *(function words, no recycle slot: un, una, los, las, al, este)*
- **Stage 0 top-up (14 tokens).** mesa llave×2 haber su×2 él ella×2 para×2 mí pero porque
- **Recycle (6).** cómo señor nombre tarde hablar español
- **Focus.** indefinite and plural articles, plural nouns, hay + noun, estar + location, adjective agreement — keys: `ser-estar-adjective`.
- **Draft.** camino-1-02 (La casa de Ana), camino-1-01 (Juan y el libro)

#### es-a1-1-03 · #3 · core · family · 300 words · est. cov. 92% · A family photograph
- **Situation.** Ana shows Sam a family photograph: who is who, ages ("mi papá tiene cuarenta años"), whose house this is
- **New (7).** familia papá mamá hijo hija año del *(function words, no recycle slot: del)*
- **Stage 0 top-up (3 tokens).** hermano hermana abuela
- **Recycle (3).** cuarto cama grande
- **Focus.** tener + age, possessives mi / tu / su (nuestro arrives in Unit 11), ser + relation, numbers 1–40 — keys: `ser-estar-adjective`.
- **Draft.** camino-1-04 (La familia de Marta)

#### es-a1-1-04 · #4 · core · food · 320 words · est. cov. 93% · Breakfast at the comedor
- **Situation.** Breakfast at a comedor: "¿qué desean?", baleada with beans, eggs and coffee; "tengo hambre", "me gusta / no me gusta"
- **New (7).** comida desayuno huevo frijol tortilla baleada hambre
- **Stage 0 top-up (3 tokens).** beber comer×2
- **Recycle (6).** cómo señor nombre tarde hablar español
- **Focus.** querer + noun, gustar (a mí / a vos), tener hambre, polite requests — keys: `gustar-type`.
- **Draft.** camino-1-05 (El desayuno)

#### es-a1-1-05 · #5 · vol · food · 330 words · est. cov. 92% · Sunday lunch
- **Situation.** Sunday lunch at doña Marta's table: who sits where, what each person eats, a short thanks before the meal
- **New (7).** plato sopa pollo tamal dar señora adiós
- **Stage 0 top-up (4 tokens).** amigo×2 nosotros ustedes
- **Recycle (16).** cuarto cama grande familia papá mamá hijo hija año comida desayuno huevo frijol tortilla baleada hambre
- **Focus.** recycling of Units 02–04; present 3sg / 3pl; thanks before eating.
- **Draft.** honduras-lecturas-1-04 (La comida en familia), shortened, present tense

#### es-a1-1-06 · #6 · core · community · 340 words · est. cov. 92% · At the market
- **Situation.** At the market: bananas, prices in lempiras, "¿cuánto cuesta?", "dame dos", too dear / cheap, a baleada from the stall
- **New (8).** dinero precio caro barato comprar pagar plátano más
- **Stage 0 top-up (3 tokens).** mercado vender cuánto
- **Recycle (13).** familia papá mamá hijo hija año plato sopa pollo tamal dar señora adiós
- **Focus.** numbers 20–100, más, dar (dame as a chunk), prices.
- **Draft.** honduras-lecturas-1-01 (En el mercado), camino-1-06 (Pedro va a la ciudad)

#### es-a1-1-07 · #7 · core · daily life · 350 words · est. cov. 92% · Luis's school day
- **Situation.** Luis's school day: he leaves home at seven, school starts at eight, "el lunes", "¿qué hora es?", "a las ocho"
- **New (7).** hora lunes salir llegar que decir hacer *(function words, no recycle slot: que)*
- **Stage 0 top-up (7 tokens).** clínica saber llover maestro×2 mañana×2
- **Recycle (15).** cómo señor nombre tarde hablar español huevo tortilla hambre dinero precio caro barato pagar más
- **Focus.** present 3sg / yo of -ar / -er / -ir verbs, a las + hour, el lunes, ¿qué hacés? (vos) — keys: `voseo`.

#### es-a1-1-08 · #8 · core · work · 360 words · est. cov. 93% · Who works where
- **Situation.** Who works where: Ana the nurse at the hospital, Luis the teacher, doña Marta sells bread; "¿en qué trabajás?"
- **New (9).** trabajo médico enfermera hospital ayudar necesitar ellos todo estudiar *(function words, no recycle slot: ellos, todo)*
- **Recycle (20).** cuarto cama grande año comida desayuno frijol baleada plato sopa tamal señora comprar plátano hora lunes salir llegar decir hacer
- **Focus.** ser + profession (no article), the full present paradigm (yo, vos, usted, nosotros, ustedes, ellos), voseo -ás / -és / -ís — keys: `voseo`.

#### es-a1-1-09 · #9 · vol · community · 340 words · est. cov. 94% · A Sunday morning on the street
- **Situation.** A Sunday morning in the neighbourhood: neighbours greet each other in the street on the way to church
- **New (6).** vecino calle gente tienda pulpería catracho
- **Stage 0 top-up (1 tokens).** lempira
- **Recycle (23).** familia papá mamá hijo hija comida desayuno huevo frijol tortilla baleada hambre pollo dar adiós plátano trabajo médico enfermera hospital ayudar necesitar estudiar
- **Focus.** recycling; greetings by time of day; present plural.
- **Draft.** honduras-lecturas-1-03 (first half only, without the reflexives)

#### es-a1-1-10 · #10 · core · travel · 370 words · est. cov. 93% · The bus to San Pedro Sula
- **Situation.** The bus to San Pedro Sula: ticket, "¿a qué hora sale?", where to wait, "vení", "mirá", we arrive tomorrow
- **New (9).** autobús terminal boleto venir esperar cerca lejos hasta noche *(function words, no recycle slot: hasta)*
- **Recycle (11).** plato sopa tamal señora dinero precio caro barato comprar pagar más
- **Focus.** ir a + infinitive (systematic), venir, salir / llegar, tener que (new), vos imperatives vení / mirá as chunks — keys: `ir-a-infinitive`, `tener-que`, `voseo`.
- **Draft.** honduras-lecturas-1-02 (En el autobús) as the spine

#### es-a1-1-11 · #11 · core · church and mission life · 380 words · est. cov. 92% · The team meeting
- **Situation.** The team meeting on Saturday: who visits which family, "¿podés venir?", "tengo que trabajar", "vamos a orar"
- **New (10).** Dios orar pastor equipo reunión visitar poder ahora siempre nuestro *(function words, no recycle slot: nuestro)*
- **Recycle (26).** pollo dar adiós caro comprar plátano hora lunes salir llegar decir hacer vecino calle gente tienda pulpería catracho autobús terminal boleto venir esperar cerca lejos noche
- **Focus.** poder / querer / tener que + infinitive, nuestro, polite refusal ("no puedo, tengo que…") — keys: `tener-que`.

#### es-a1-1-12 · #12 · core · health · 380 words · est. cov. 92% · Nico is sick
- **Situation.** Nico has a headache and a fever; Ana the nurse asks where it hurts; Luis takes him home
- **New (10).** cabeza mano ojo boca doler dolor fiebre enfermo mal mejor
- **Recycle (18).** dinero precio barato pagar más trabajo médico enfermera hospital ayudar necesitar estudiar gente pulpería orar equipo visitar ahora
- **Focus.** doler as gustar-type (me duele la cabeza), tener fiebre / frío / sed, estar enfermo / mejor — keys: `gustar-type`.

#### es-a1-1-13 · #13 · vol · narrative · 350 words · est. cov. 95% · The lost school bag
- **Situation.** Nico loses his school bag; Luis and Marta look for it; found at school
- **New (6).** perder encontrar buscar mochila libro cipote
- **Recycle (32).** hora lunes salir llegar decir hacer trabajo médico enfermera hospital ayudar necesitar estudiar vecino calle tienda catracho Dios pastor reunión poder siempre cabeza mano ojo boca doler dolor fiebre enfermo mal mejor
- **Focus.** recycling; ir a, querer, buscar; present narration.
- **Draft.** camino-1-01 echoed, camino-1-08 (Marta quiere un perro) recast with Nico

#### es-a1-1-14 · #14 · core · practical communication · 390 words · est. cov. 92% · A message and a notice
- **Situation.** A text message to the team ("Reunión el sábado a las tres en la iglesia") and a notice ("Favor no fumar")
- **New (10).** mensaje teléfono celular número escribir enviar aviso fecha semana sábado
- **Recycle (18).** vecino calle tienda catracho autobús terminal boleto venir esperar cerca lejos noche poder siempre perder encontrar buscar libro
- **Focus.** infinitive instructions (favor + infinitive, no fumar), dates, messages without full sentences.

#### es-a1-1-15 · #15 · core · testimony · 400 words · est. cov. 93% · Sam's first testimony
- **Situation.** Sam's first short testimony and a Honduran neighbour's: who I am, my family, what I believe, why I am happy
- **New (10).** vida amar creer cristiano paz corazón feliz nuevo pequeño ayuda
- **Recycle (18).** gente pulpería terminal venir cerca noche Dios orar pastor equipo reunión visitar ahora dolor enfermo mejor mochila cipote
- **Focus.** first-person present narration, creer en, estar feliz, gracias a Dios.
- **Draft.** story-01 (Mi historia) as a seed, present tense only

#### es-a1-2-01 · #16 · core · conversation · 400 words · est. cov. 93% · "¿Qué estás haciendo?"
- **Situation.** A phone call: "¿Qué estás haciendo?" "Estoy cocinando; Nico está leyendo"
- **New (10).** ver mirar leer cocinar jugar dormir mientras ya ahorita otro *(function words, no recycle slot: mientras, otro)*
- **Recycle (30).** autobús boleto esperar lejos equipo visitar ahora cabeza mano ojo boca doler fiebre mal perder encontrar buscar mochila libro cipote mensaje teléfono celular número escribir enviar aviso fecha semana sábado
- **Focus.** estar + gerund (present progressive), mientras — keys: `estar-gerund`.

#### es-a1-2-02 · #17 · core · explanation · 410 words · est. cov. 93% · Rainy season, dry season
- **Situation.** Rainy season and dry season in Honduras: what the weather is like, what farmers do in each; "En invierno llueve mucho"
- **New (10).** lluvia sol viento calor frío verano invierno mes poco menos *(function words, no recycle slot: poco)*
- **Recycle (21).** Dios orar pastor reunión poder siempre mejor teléfono número enviar fecha vida amar creer cristiano paz corazón feliz nuevo pequeño ayuda
- **Focus.** hacer + weather (hace calor), hay + weather, verano / invierno, poco / menos, en + season.
- **Draft.** camino-2-03 (La lluvia), present-tense frame only

#### es-a1-2-03 · #18 · vol · narrative · 420 words · est. cov. 96% · A rainy Saturday
- **Situation.** A rainy Saturday: nobody can go out; what each person does at home
- **New (5).** pasar quedar juego así solo
- **Recycle (43).** cabeza mano ojo boca doler dolor fiebre enfermo mal libro mensaje celular escribir aviso semana sábado vida amar creer cristiano paz corazón feliz nuevo pequeño ayuda ver mirar leer cocinar jugar dormir ya ahorita lluvia sol viento calor frío verano invierno mes menos
- **Focus.** recycling; estar + gerund; weather — keys: `estar-gerund`.
- **Draft.** camino-2-03 rewritten in the present

#### es-a1-2-04 · #19 · core · daily life · 440 words · est. cov. 93% · Yesterday after work
- **Situation.** Yesterday: Ana tells what she did after work (preterite, regular -ar, yo and ella)
- **New (11).** ayer anoche caminar cenar regresar terminar tiempo luego después antes entonces
- **Recycle (18).** perder encontrar buscar mochila cipote ver mirar leer cocinar jugar dormir ya ahorita pasar quedar juego así solo
- **Focus.** preterite of regular -ar (yo, usted / ella, nosotros, ellos), ayer / anoche / luego / después — keys: `preterite`.

#### es-a1-2-05 · #20 · core · travel · 460 words · est. cov. 92% · By bus to the coast
- **Situation.** A trip by bus to the coast: we left at six, we ate in the terminal, we saw the sea
- **New (12).** subir bajar ciudad volver aprender pueblo mar playa viaje sin sobre llevar *(function words, no recycle slot: sin, sobre)*
- **Recycle (26).** mensaje teléfono celular número escribir enviar aviso fecha semana sábado ayuda viento frío invierno menos ayer anoche caminar cenar regresar terminar tiempo luego después antes entonces
- **Focus.** preterite of regular -er / -ir, plural forms (comimos, salieron), vos preterite = tú form (vos comiste) — keys: `preterite`.
- **Draft.** camino-2-07 (El viaje en autobús), without imperfect and pronouns

#### es-a1-2-06 · #21 · core · narrative · 480 words · est. cov. 93% · Ana's weekend in Tegucigalpa
- **Situation.** Ana's weekend in Tegucigalpa: where she went, what she saw, who she met, what she did
- **New (12).** poner traer conocer pedir sentir seguir parque centro lugar visita entre allí *(function words, no recycle slot: entre)*
- **Recycle (24).** vida amar creer cristiano paz corazón feliz nuevo pequeño lluvia sol calor verano mes subir bajar ciudad volver aprender pueblo mar playa viaje llevar
- **Focus.** irregular high-frequency preterites: fue, hizo, vio, estuvo, tuvo, dio, dijo, vino, puso, pudo — keys: `preterite`.

#### es-a1-2-07 · #22 · vol · narrative · 480 words · est. cov. 93% · Last weekend
- **Situation.** Last weekend: a birthday at the neighbours' house, a walk, a present
- **New (11).** fin paseo fiesta regalo bailar momento anteayer claro seguro posible quizás
- **Recycle (28).** ver mirar leer cocinar jugar dormir ya ahorita calor verano mes pasar quedar juego así solo regresar tiempo luego antes poner traer conocer pedir sentir parque lugar allí
- **Focus.** recycling of Units 19–21; preterite; agreeing and declining (claro, seguro, quizás) — keys: `preterite`.
- **Draft.** camino-2-06 (El cumpleaños de Marta), preterite only

#### es-a1-2-08 · #23 · core · narrative · 500 words · est. cov. 92% · Sam's first week
- **Situation.** Sam's first week in Honduras: what was easy, what was hard, new words he learnt, what surprised him
- **New (13).** primero último diferente difícil fácil idioma palabra pregunta entender si cuando o como *(function words, no recycle slot: si, cuando, o, como)*
- **Recycle (23).** lluvia sol viento frío invierno menos ayer anoche caminar cenar terminar después entonces volver mar viaje seguir centro visita regalo momento claro posible
- **Focus.** preterite in first-person narration, ordinals, ser / estar + adjective — keys: `preterite`.

#### es-a1-2-09 · #24 · core · health · 520 words · est. cov. 93% · At the clinic
- **Situation.** At the clinic: Ana's patient has a cough and a fever; what the nurse says to do (infinitive instructions), when to come back
- **New (13, 3 to add).** pastilla+ receta+ tos+ doctor enfermedad salud cita cuerpo garganta deber cuidar sangre nariz
- **Recycle (23).** pasar quedar juego así solo regresar tiempo después entonces subir bajar ciudad aprender pueblo playa llevar fin paseo fiesta bailar anteayer seguro quizás
- **Focus.** tener + symptom, hay que / tiene que / debe + infinitive, schedules ("cada ocho horas") — keys: `tener-que`.

#### es-a1-2-10 · #25 · core · scripture · 520 words · est. cov. 93% · The lost sheep (Luke 15)
- **Situation.** A Bible story in plain Spanish: the lost sheep (Luke 15) retold for learners
- **New (13).** oveja perdido perdonar ángel Biblia mundo bendecir salvar rey milagro alabar adorar gloria
- **Recycle (40).** ayer anoche caminar cenar terminar luego antes poner traer conocer pedir sentir seguir parque centro lugar visita allí primero último diferente difícil fácil idioma palabra pregunta entender pastilla receta tos doctor enfermedad salud cita cuerpo garganta deber cuidar sangre nariz
- **Focus.** preterite and present narration, questions to the reader — keys: `preterite`.

#### es-a1-2-11 · #26 · core · biography · 540 words · est. cov. 92% · Doña Marta's life
- **Situation.** Doña Marta's life: born in a village, married young, children, the bread stall, grandchildren (years, ages, "hace")
- **New (14).** nacer crecer casar morir esposo esposa nieto mujer hombre niño niña joven viejo edad
- **Recycle (54).** subir bajar ciudad volver aprender pueblo mar playa viaje llevar poner traer conocer pedir sentir seguir parque centro lugar visita allí fin paseo fiesta regalo bailar momento anteayer claro seguro posible quizás primero último diferente difícil fácil idioma palabra pregunta entender oveja perdido perdonar ángel Biblia mundo bendecir salvar rey milagro alabar adorar gloria
- **Focus.** preterite + present, tener X años, hace + time, years, first / last — keys: `preterite`.
- **Draft.** camino-3-02 (La vida de Elena), simplified to preterite and present

#### es-a1-2-12 · #27 · core · instructions · 540 words · est. cov. 92% · How to make baleadas
- **Situation.** How to make baleadas: ingredients, steps in order (primero, luego, después), tools
- **New (14, 1 to add).** crema+ cortar calentar agregar harina aceite sal cuchara freír queso preparar tomate cebolla verdura
- **Recycle (19).** fin paseo regalo momento claro posible pastilla receta tos doctor enfermedad salud cita cuerpo garganta deber cuidar sangre nariz
- **Focus.** instructions as infinitive / usted / se ("se pone", "agregue"), sequencers primero / luego / después, quantities — keys: `se-impersonal`.
- **Draft.** honduras-lecturas-1-01 (the baleada sentences) as a seed

#### es-a1-2-13 · #28 · core · explanation · 560 words · est. cov. 93% · Describing people and places
- **Situation.** Describing people and places: a tall brother, a small clean house, a red bus; who is taller; "es más alta que yo"
- **New (14).** alto bonito feo simpático amable contento triste limpio blanco negro rojo azul verde delgado
- **Recycle (33).** fiesta bailar anteayer seguro quizás entender nacer crecer casar morir esposo esposa nieto mujer hombre niño niña joven viejo edad crema cortar calentar agregar harina aceite sal cuchara freír queso preparar tomate cebolla
- **Focus.** ser vs estar with adjectives, colours, comparison más / menos … que, adjective agreement — keys: `comparison`, `ser-estar-adjective`.

#### es-a1-2-14 · #29 · vol · church and mission life · 540 words · est. cov. 97% · A service through a child's eyes
- **Situation.** A Sunday service seen through a child's eyes: songs, offering, greetings, the sermon in one sentence
- **New (6).** culto himno alabanza ofrenda canción cantar
- **Recycle (56).** primero último diferente difícil fácil idioma palabra pregunta doctor salud cita garganta cuidar nariz oveja perdido perdonar ángel Biblia mundo bendecir salvar rey milagro alabar adorar gloria nacer crecer casar morir esposo esposa nieto mujer hombre niño niña joven viejo edad verdura alto bonito feo simpático amable contento triste limpio blanco negro rojo azul verde delgado
- **Focus.** recycling; present and preterite; hay / estar; no reflexives yet (levantar, sentar arrive in Unit 39) — keys: `preterite`.
- **Draft.** honduras-lecturas-1-03 (El domingo en la iglesia), simplified, reflexives removed

#### es-a1-2-15 · #30 · core · correspondence · 580 words · est. cov. 92% · Invitations and the calendar
- **Situation.** Invitations by message and note, with the calendar: a birthday on a given date, a Saturday outing, "¿Querés venir?", replying yes / no / maybe
- **New (15).** enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre invitar celebrar cumpleaños
- **Recycle (25).** pastilla receta tos enfermedad cuerpo deber sangre bendecir rey alabar gloria crema cortar calentar harina sal freír preparar cebolla culto himno alabanza ofrenda canción cantar
- **Focus.** the twelve months and dates (el 12 de abril), polite replies, voy a + infinitive — keys: `ir-a-infinitive`.
- **Draft.** camino-2-05 (La carta) as a seed for the replies

#### es-a1-2-16 · #31 · core · work · 600 words · est. cov. 93% · Carlos looks for work
- **Situation.** Carlos looks for work: the notice, the interview, wages, the schedule; what he did yesterday at the workshop
- **New (15, 2 to add).** horario+ mecánico+ empleo sueldo jefe empresa negocio gastar ahorrar banco cuenta conseguir carpintero chamba pues *(function words, no recycle slot: pues)*
- **Recycle (33).** oveja perdido perdonar ángel Biblia mundo salvar milagro adorar hombre niña viejo agregar aceite cuchara queso tomate verdura alto bonito feo simpático amable contento triste limpio blanco negro rojo azul verde delgado cumpleaños
- **Focus.** preterite + present; money; yo / usted forms in an interview — keys: `preterite`.

#### es-a2-1-01 · #32 · core · biography · 600 words · est. cov. 93% · "Cuando yo era niño"
- **Situation.** "Cuando yo era niño": a farm childhood in the hills (animals, games, school on foot)
- **New (15).** finca animal perro caballo vaca gallina árbol flor contar cuento pelota recordar olvidar abuelo tío
- **Recycle (33).** nacer crecer casar morir esposo esposa nieto mujer niño joven edad culto himno alabanza ofrenda canción cantar enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre invitar celebrar cuenta carpintero
- **Focus.** imperfect (regular and ser / ir / ver), cuando + imperfect, siempre / todos los días — keys: `imperfect`.
- **Draft.** camino-2-08 (La abuela cuenta), first half

#### es-a2-1-02 · #33 · core · explanation · 620 words · est. cov. 92% · Our village before and now
- **Situation.** Our village before and now: houses, light, water, school; what has changed
- **New (16).** luz pared techo piso patio jardín país cambio comunidad construir mejorar nunca donde tierra gobierno tía
- **Recycle (33).** crema cortar calentar agregar harina aceite sal cuchara freír queso preparar tomate cebolla verdura enero marzo mayo julio octubre diciembre celebrar horario mecánico empleo sueldo jefe empresa negocio gastar ahorrar banco conseguir chamba
- **Focus.** imperfect for description and habit, antes / ahora contrast, había — keys: `imperfect`.

#### es-a2-1-03 · #34 · vol · narrative · 620 words · est. cov. 96% · Grandmother's night story
- **Situation.** Grandmother tells a night-time story of her own childhood
- **New (9).** luna estrella oscuridad pensar parecer escuchar cambiar abrir ganar
- **Recycle (61).** alto bonito feo simpático amable contento triste limpio blanco negro rojo azul verde delgado culto himno alabanza ofrenda canción cantar febrero abril junio agosto septiembre noviembre invitar cumpleaños conseguir chamba finca animal perro caballo vaca gallina árbol flor contar cuento pelota recordar olvidar abuelo tío luz pared techo piso patio jardín país cambio comunidad construir mejorar nunca donde tierra gobierno tía
- **Focus.** recycling; imperfect narrative — keys: `imperfect`.
- **Draft.** camino-2-08 (La abuela cuenta), second half

#### es-a2-1-04 · #35 · core · narrative · 680 words · est. cov. 92% · The night of the storm
- **Situation.** The night of the storm: preterite for what happened, imperfect for the scene (it was raining, people were sleeping)
- **New (18).** trueno rayo inundación huracán incendio escapar caer romper gritar llorar peligro accidente susto noticia arreglar oír acabar empezar
- **Recycle (24).** enero febrero marzo mayo agosto octubre diciembre celebrar horario mecánico empleo sueldo jefe empresa negocio gastar ahorrar banco cuenta carpintero contar pelota olvidar tío
- **Focus.** preterite vs imperfect in one story, mientras / cuando, acabar de — keys: `imperfect`, `preterite`, `acabar-de`.
- **Draft.** camino-2-04 (Sol se fue), camino-2-03 (La lluvia)

#### es-a2-1-05 · #36 · core · conversation · 700 words · est. cov. 92% · Buying clothes
- **Situation.** Buying clothes: "¿Lo tiene en azul?" "Sí, lo tengo"; trying on, paying, a gift for a friend
- **New (18).** lo ese cada aquel camisa pantalón zapato vestido camiseta probar usar regalar caja mostrar unos unas quién cuál *(function words, no recycle slot: lo, ese, cada, aquel, unos, unas, quién, cuál)*
- **Recycle (47).** abril junio julio septiembre noviembre invitar cumpleaños negocio ahorrar cuenta carpintero finca animal perro caballo vaca gallina árbol flor cuento recordar abuelo luz pared techo piso patio jardín país cambio comunidad construir mejorar nunca donde tierra gobierno tía luna estrella oscuridad pensar parecer escuchar cambiar abrir ganar
- **Focus.** direct object pronouns lo / la / los / las (before the verb and attached to the infinitive: comprarlo), personal a — keys: `enclitic-pronoun`, `personal-a`.
- **Draft.** camino-2-01 (El libro perdido), camino-2-02 (En el mercado)

#### es-a2-1-06 · #37 · core · practical communication · 730 words · est. cov. 93% · Asking, telling, lending
- **Situation.** Asking, telling, lending, promising: "Le pregunté a doña Marta", "me prestó su celular", "te aviso mañana"
- **New (18).** le les nos preguntar responder contestar explicar enseñar prestar prometer agradecer avisar ofrecer devolver cuándo ti conmigo ellas *(function words, no recycle slot: le, les, nos, ti, conmigo, ellas)*
- **Recycle (35).** horario mecánico empleo sueldo jefe empresa gastar banco conseguir chamba tío oscuridad parecer cambiar ganar trueno rayo inundación huracán incendio escapar caer romper gritar llorar peligro accidente susto noticia arreglar oír acabar empezar usar caja
- **Focus.** indirect object pronouns le / les / me / te / nos, le dije que…, indirect vs direct pronoun in the same text — keys: `enclitic-pronoun`.
- **Draft.** camino-2-02 (second half: "me das un plátano", "se las dio")

#### es-a2-1-07 · #38 · vol · correspondence · 700 words · est. cov. 96% · The team's group chat
- **Situation.** A group chat for the team: photos, thanks, changes of plan, who brings what
- **New (9, 1 to add).** correo+ grupo foto martes miércoles jueves mandar compartir cumplir
- **Recycle (56).** finca animal perro caballo vaca gallina árbol flor contar cuento pelota recordar olvidar abuelo luna estrella pensar escuchar abrir trueno rayo inundación huracán incendio escapar caer romper gritar llorar peligro accidente susto noticia arreglar oír acabar camisa pantalón zapato vestido camiseta probar regalar mostrar preguntar responder contestar explicar enseñar prestar prometer agradecer avisar ofrecer devolver cuándo
- **Focus.** recycling of object pronouns; short messages.

#### es-a2-1-08 · #39 · core · daily life · 760 words · est. cov. 92% · Nico's morning
- **Situation.** Nico's morning from alarm to school: wake up, wash, get dressed, breakfast, school bell
- **New (20, 4 to add).** ducha+ jabón+ toalla+ cepillar+ levantar acostar despertar bañar vestir sentar cara pelo espejo mediodía clase tarea lección alumno colegio temprano
- **Recycle (36).** luz pared techo piso patio jardín país cambio comunidad construir mejorar nunca donde tierra gobierno tía luna estrella oscuridad pensar parecer escuchar cambiar abrir ganar empezar camisa pantalón zapato vestido camiseta probar usar regalar caja mostrar
- **Focus.** reflexive verbs in the present (me levanto, se baña), vos forms (te levantás), daily-routine order.

#### es-a2-1-09 · #40 · core · church and mission life · 790 words · est. cov. 92% · Getting ready for church
- **Situation.** Getting ready for church and what happens after: greetings with abrazo and beso, "nos reunimos", who stays to clean
- **New (20, 2 to add).** versículo+ capítulo+ reunir templo diezmo predicar bautizar bautismo congregación testimonio saludar abrazar abrazo beso despedir bienvenida acompañar asistir nosotras creyente *(function words, no recycle slot: nosotras)*
- **Recycle (31).** trueno rayo inundación incendio caer gritar peligro susto arreglar acabar preguntar responder contestar explicar enseñar prestar prometer agradecer avisar ofrecer devolver cuándo correo grupo foto martes miércoles jueves mandar compartir cumplir
- **Focus.** reflexive verbs in all persons (nos reunimos, se despiden), reflexive + infinitive (voy a sentarme / me voy a sentar).
- **Draft.** honduras-lecturas-1-03 (El domingo en la iglesia), expanded

#### es-a2-1-10 · #41 · core · health · 820 words · est. cov. 92% · The medical brigade
- **Situation.** A medical brigade in the village: registration, a child with a wound, advice on clean water, who gets a vaccine
- **New (21, 4 to add).** brigada+ vacuna+ herida+ dengue+ hueso piel rodilla cuello hombro dedo uña lengua enfermar quemar sanar sufrir farmacia tratar insecto mosca abeja
- **Recycle (47).** huracán escapar romper llorar accidente noticia oír empezar ducha jabón toalla cepillar levantar acostar despertar bañar vestir sentar cara pelo espejo mediodía clase tarea lección alumno colegio temprano versículo capítulo reunir templo diezmo predicar bautizar bautismo congregación testimonio saludar abrazar abrazo beso despedir bienvenida acompañar asistir creyente
- **Focus.** object pronouns with health advice (dale agua, tómalo), imperfect for symptoms ("tenía fiebre") — keys: `enclitic-pronoun`.

#### es-a2-1-11 · #42 · vol · travel · 780 words · est. cov. 96% · A delayed bus
- **Situation.** A delayed bus and a lost suitcase: complaining politely, asking for help
- **New (11).** retraso aeropuerto pasaporte vuelo entrar descansar desear carro decidir recibir viajar
- **Recycle (45).** camisa pantalón zapato vestido camiseta probar usar regalar caja mostrar preguntar responder contestar explicar enseñar prestar prometer agradecer avisar ofrecer devolver cuándo correo grupo foto martes miércoles jueves mandar compartir cumplir tarea lección colegio brigada herida hueso rodilla hombro uña lengua quemar sufrir tratar mosca
- **Focus.** recycling; preterite vs imperfect; object pronouns — keys: `preterite`, `imperfect`.
- **Draft.** camino-3-03 (El viaje de Tomás), simplified

#### es-a2-1-12 · #43 · core · work · 850 words · est. cov. 92% · A day at the workshop and the farm
- **Situation.** A day at the workshop and on the farm: tools, who does what, what the boss said (reported speech)
- **New (22, 3 to add).** taller+ sembrar+ cultivar+ herramienta martillo clavo cuerda cubo escoba cavar plantar regar semilla granja campesino pescador panadero ingeniero director empleado patrón comerciante
- **Recycle (44).** correo grupo foto miércoles mandar cumplir ducha jabón toalla cepillar levantar acostar despertar bañar vestir sentar cara pelo espejo mediodía clase alumno temprano vacuna dengue piel cuello dedo enfermar sanar farmacia insecto abeja retraso aeropuerto pasaporte vuelo entrar descansar desear carro decidir recibir viajar
- **Focus.** preterite + imperfect + object pronouns in work narrative, dijo que… (reported speech, present only) — keys: `imperfect`, `preterite`.

#### es-a2-1-13 · #44 · core · contemporary nonfiction · 870 words · est. cov. 92% · Honduras in facts
- **Situation.** Honduras in facts: coasts, islands, valleys, borders, animals; a short factual text with a map
- **New (23).** norte sur frontera costa isla lago valle cerro bosque selva mapa nación zona temperatura naturaleza ave culebra mono hondureño guatemalteco salvadoreño nicaragüense centroamericano
- **Recycle (53).** martes jueves compartir jabón cepillar acostar bañar sentar pelo mediodía tarea alumno temprano versículo capítulo reunir templo diezmo predicar bautizar bautismo congregación testimonio saludar abrazar abrazo beso despedir bienvenida acompañar asistir creyente brigada vacuna herida dengue hueso piel rodilla cuello hombro dedo uña lengua enfermar quemar sanar sufrir farmacia tratar insecto mosca abeja
- **Focus.** present tense in description, ser / estar / haber in descriptions, comparisons, numbers and measures — keys: `comparison`.

#### es-a2-1-14 · #45 · core · scripture · 890 words · est. cov. 94% · The son who left (Luke 15)
- **Situation.** The son who left (Luke 15) retold in the plain Spanish of the course, with the father's forgiveness
- **New (19).** pecado pecar arrepentir merecer compasión criado anillo cerdo besar enojar lejano rico pobre cosa verdad manera persona vez camino
- **Recycle (51).** ducha toalla levantar despertar vestir cara espejo clase lección colegio versículo capítulo reunir templo diezmo predicar bautizar bautismo congregación testimonio saludar abrazar abrazo beso despedir bienvenida acompañar asistir creyente taller sembrar cultivar herramienta martillo clavo cuerda cubo escoba cavar plantar regar semilla granja campesino pescador panadero ingeniero director empleado patrón comerciante
- **Focus.** preterite vs imperfect in a long narrative, direct speech with vos / usted, object pronouns — keys: `imperfect`, `preterite`.
- **Draft.** camino-3-04 (El hijo que volvió), pluperfect and conditional removed

#### es-a2-1-15 · #46 · vol · correspondence · 880 words · est. cov. 98% · A letter abroad
- **Situation.** A letter to a friend abroad: what is new, what I miss, plans for the holidays
- **New (7).** carta extrañar cariño pronto comprender repetir correr
- **Recycle (59).** brigada vacuna herida dengue hueso piel rodilla cuello hombro uña lengua quemar sufrir tratar mosca retraso aeropuerto pasaporte vuelo entrar descansar desear carro decidir recibir viajar norte sur frontera costa isla lago valle cerro bosque selva mapa nación zona temperatura naturaleza ave culebra mono hondureño guatemalteco salvadoreño nicaragüense centroamericano pecar merecer criado cerdo enojar lejano pobre verdad persona camino
- **Focus.** recycling; letter conventions; preterite / imperfect / ir a.
- **Draft.** camino-3-06 (Querida abuela), subjunctive removed

#### es-a2-1-16 · #47 · core · biography · 900 words · est. cov. 92% · A missionary couple
- **Situation.** A missionary couple's story: leaving home, learning Spanish, the first year, what they built, what they learnt
- **New (24, 2 to add).** ministerio+ líder+ dejar lograr luchar esfuerzo éxito dedicar servir problema solución razón causa resultado ejemplo diferencia cultura sociedad tradición futuro pasado desde durante presente *(function words, no recycle slot: desde, durante)*
- **Recycle (43).** dedo enfermar sanar farmacia insecto abeja entrar desear decidir viajar taller sembrar cultivar herramienta martillo clavo cuerda cubo escoba cavar plantar regar semilla granja campesino pescador panadero ingeniero director empleado patrón comerciante pecado arrepentir compasión anillo besar rico cosa manera vez comprender correr
- **Focus.** all indicative past tenses in one biography, object pronouns, time expressions (desde, hace, durante) — keys: `imperfect`, `preterite`.
- **Draft.** camino-3-02 (La vida de Elena) as a model for structure

#### es-a2-1-17 · #48 · core · instructions · 900 words · est. cov. 93% · How it is done
- **Situation.** How it is done: covering water, storing food, planting beans — "se cubre", "se debe", "se puede"
- **New (22).** cubrir mantener proteger evitar mezcla cantidad tipo forma parte mitad lado uso taza vaso botella olla basura seguridad riesgo cuidado pesar jarra
- **Recycle (40).** retraso aeropuerto pasaporte vuelo descansar carro recibir semilla campesino panadero director comerciante norte sur frontera costa isla lago valle cerro bosque selva mapa nación zona temperatura naturaleza ave culebra mono hondureño guatemalteco salvadoreño nicaragüense centroamericano carta extrañar cariño pronto repetir
- **Focus.** se-impersonal / passive se (se vende, se debe), infinitive instructions, quantities — keys: `se-impersonal`.

#### es-a2-1-18 · #49 · vol · conversation · 900 words · est. cov. 97% · Renting a room
- **Situation.** Renting a room: bargaining over the price, what is included, when to move in
- **New (8).** alquilar valor acá ahí allá adónde hacia ni *(function words, no recycle slot: hacia, ni)*
- **Recycle (89).** taller sembrar cultivar herramienta martillo clavo cuerda cubo escoba cavar plantar regar granja pescador ingeniero empleado patrón cerro selva mapa zona naturaleza culebra hondureño guatemalteco nicaragüense pecado pecar arrepentir merecer compasión criado anillo cerdo besar enojar lejano rico pobre cosa verdad manera persona vez camino ministerio líder dejar lograr luchar esfuerzo éxito dedicar servir problema solución razón causa resultado ejemplo diferencia cultura sociedad tradición futuro pasado presente cubrir mantener proteger evitar mezcla cantidad tipo forma parte mitad lado uso taza vaso botella olla basura seguridad riesgo cuidado pesar jarra
- **Focus.** recycling; usted / vos in negotiation, object pronouns, ir a.

#### es-a2-2-01 · #50 · core · conversation · 900 words · est. cov. 92% · "¿Ya has desayunado?"
- **Situation.** "¿Ya has desayunado?" "¿Has visto mi llave?" — what has happened today, said in a dialogue between neighbours
- **New (23).** todavía jamás aún alguien nadie algo alguno ninguno tampoco casi intentar descubrir resolver notar aceptar continuar obtener comienzo inicio equivocar mencionar apenas dudar *(function words, no recycle slot: alguien, nadie, algo, alguno, ninguno)*
- **Recycle (30).** norte sur frontera costa isla lago valle bosque nación temperatura ave mono salvadoreño centroamericano pobre verdad vez carta extrañar cariño pronto comprender repetir correr alquilar valor acá ahí allá adónde
- **Focus.** present perfect (he / has / hemos + participle), vos has, ya / todavía no, nunca / jamás, irregular participles (hecho, visto, escrito, puesto, dicho, vuelto) — keys: `perfect-tense`.
- **Draft.** camino-3-01 (El libro que desapareció), pluperfect removed

#### es-a2-2-02 · #51 · core · testimony · 950 words · est. cov. 92% · Small-group testimonies
- **Situation.** Short testimonies in a small group: what God has done in my life this year, what I have not been able to do, what has changed
- **New (25, 1 to add).** petición+ gracia perdón salvación bendición misericordia pecador convertir liberar libertad oración evangelio discípulo confesar abandonar obedecer rogar rezar alma espíritu amor tristeza felicidad padre madre
- **Recycle (41).** pecado pecar arrepentir merecer compasión criado anillo cerdo besar enojar lejano rico cosa manera persona camino ministerio líder dejar lograr luchar esfuerzo éxito dedicar servir problema solución razón causa resultado ejemplo diferencia cultura sociedad tradición futuro pasado presente obtener inicio apenas
- **Focus.** perfect vs preterite (esta semana, este año vs ayer, hace diez años), testimony formulas, "ha cambiado", "me ha ayudado" — keys: `perfect-tense`, `preterite`.
- **Draft.** dialogue-01 (Una conversación) as a seed, tú converted to vos

#### es-a2-2-03 · #52 · vol · family · 1000 words · est. cov. 98% · A long phone call
- **Situation.** A long phone call between Sam and his sister: news from both sides, what has happened since he left
- **New (6).** platicar llamada vuelta sonrisa risa reír
- **Recycle (69).** carta extrañar cariño pronto comprender repetir correr ministerio líder dejar luchar esfuerzo dedicar problema razón resultado ejemplo cultura tradición pasado cubrir mantener proteger evitar mezcla cantidad tipo forma parte mitad lado uso taza vaso botella olla basura seguridad riesgo cuidado pesar jarra todavía jamás aún tampoco casi intentar descubrir resolver notar aceptar continuar comienzo equivocar mencionar dudar salvación bendición pecador liberar oración discípulo abandonar obedecer rezar espíritu tristeza padre
- **Focus.** recycling; perfect, preterite, imperfect, ir a; telephone formulas — keys: `perfect-tense`.

#### es-a2-2-04 · #53 · core · instructions · 1040 words · est. cov. 92% · Vení, mirá, decime
- **Situation.** Telling a friend what to do (vos): "Vení", "tomá", "decime", "no te preocupés"; a neighbour's practical advice about the house
- **New (27).** tú callar agarrar apagar encender guardar colocar meter sacar quitar tirar mover parar andar llenar ordenar barrer sala comedor dormitorio sofá armario cortina almohada manta habitación hogar *(function words, no recycle slot: tú)*
- **Recycle (50).** lograr éxito servir solución causa diferencia sociedad futuro presente cubrir mantener proteger evitar mezcla cantidad tipo forma parte mitad lado uso taza vaso botella olla basura seguridad riesgo cuidado pesar jarra alquilar valor acá ahí allá adónde petición gracia perdón misericordia convertir libertad evangelio confesar rogar alma amor felicidad madre
- **Focus.** imperative: vos forms (hablá, comé, vení, decime, andá), tú forms recognised, negative with subjunctive (no te preocupés), attached pronouns (dámelo, decime) — keys: `voseo`, `enclitic-pronoun`.
- **Draft.** honduras-lecturas-1-02 (the "Vení, mirá, cuidate" lines)

#### es-a2-2-05 · #54 · core · practical communication · 1080 words · est. cov. 92% · Notices, rules, recipes
- **Situation.** Notices, rules and recipes: "Favor no estacionar", "Pase por la caja", "Agregue sal"; usted commands and polite formulas
- **New (28).** estacionar manejar conducir cruzar detener permitir obligar impedir informar indicar anunciar incluir presentar firmar revisar avenida esquina supermercado restaurante estación anuncio oferta compra venta tarjeta público privado general
- **Recycle (50).** todavía jamás aún tampoco casi intentar descubrir resolver notar aceptar continuar obtener comienzo inicio equivocar mencionar apenas dudar platicar llamada vuelta sonrisa risa reír callar agarrar apagar encender guardar colocar meter sacar quitar tirar mover parar andar llenar ordenar barrer sala comedor dormitorio sofá armario cortina almohada manta habitación hogar
- **Focus.** imperative: usted and ustedes (pase, entren, no fume), negative commands, polite formulas, signs and forms — keys: `enclitic-pronoun`.

#### es-a2-2-06 · #55 · core · community · 1120 words · est. cov. 92% · The neighbourhood meeting
- **Situation.** The neighbourhood meeting: what we want the council to do (querer que + subjunctive), who will bring what
- **New (29).** apoyar votar defender aumentar existir depender ocurrir suceder actuar convencer discutir declarar publicar proponer sugerir elección voto presidente política patria derecho ley justicia guerra fuerza ciudadano religión opinión idea
- **Recycle (55).** alquilar valor acá ahí allá adónde todavía jamás aún tampoco casi intentar descubrir resolver notar aceptar continuar obtener comienzo inicio equivocar mencionar apenas dudar petición gracia perdón salvación bendición misericordia pecador convertir liberar libertad oración evangelio discípulo confesar abandonar obedecer rogar rezar alma espíritu amor tristeza felicidad padre madre platicar llamada vuelta sonrisa risa reír
- **Focus.** subjunctive after querer que / pedir que / esperar que (present), regular and voseo (que vengás), recognition of subjunctive in news — keys: `querer-que-subjunctive`, `voseo`.

#### es-a2-2-07 · #56 · vol · contemporary nonfiction · 1050 words · est. cov. 98% · Neighbourhood news
- **Situation.** Neighbourhood news: a new well, a school roof, a football match, a local election
- **New (8).** partido balón gol premio baile periódico película cine
- **Recycle (62).** callar agarrar apagar encender guardar colocar meter sacar quitar tirar mover parar andar llenar ordenar barrer sala comedor dormitorio sofá armario cortina almohada manta habitación hogar estacionar manejar conducir cruzar detener permitir obligar impedir informar indicar anunciar incluir presentar firmar revisar avenida esquina supermercado restaurante estación anuncio oferta compra venta tarjeta público privado general sugerir voto presidente patria ley guerra ciudadano opinión
- **Focus.** recycling; present perfect for news; past tenses — keys: `perfect-tense`.

#### es-a2-2-08 · #57 · core · church and mission life · 1150 words · est. cov. 92% · Planning the next visit
- **Situation.** Planning the next visit: so that they can hear, when we arrive, "para que" and "cuando" with the subjunctive
- **New (30).** traducir practicar ayunar alegrar felicitar disfrutar sacrificar sermón predicador altar cruz comunión misa cordero siervo promesa señal profecía adoración espiritual celestial divino santo sagrado bendito glorioso poderoso fiel eterno ojalá
- **Recycle (54).** petición gracia perdón salvación bendición misericordia pecador convertir liberar libertad oración evangelio discípulo confesar abandonar obedecer rogar rezar alma espíritu amor tristeza felicidad padre madre apoyar votar defender aumentar existir depender ocurrir suceder actuar convencer discutir declarar publicar proponer elección política derecho justicia fuerza religión idea partido balón gol premio baile periódico película cine
- **Focus.** para que + subjunctive, cuando + present subjunctive (future reference), sin que, antes de que (recognition) — keys: `para-que-subjunctive`, `cuando-subjunctive`.
- **Draft.** camino-3-05 (La bicicleta de Marta), some sentences

#### es-a2-2-09 · #58 · core · health · 1180 words · est. cov. 92% · If you have a fever
- **Situation.** If you have a fever, drink water: advice, conditions and results (si + present)
- **New (31).** sed aliento labio pierna mejilla cabello bebé limpieza prueba peso corte golpe vista sano débil pesado ligero duro blando suave caliente tibio fresco lleno vacío peligroso importante necesario útil oler temer
- **Recycle (61).** platicar llamada vuelta sonrisa risa reír callar agarrar apagar encender guardar colocar meter sacar quitar tirar mover parar andar llenar ordenar barrer sala comedor dormitorio sofá armario cortina almohada manta habitación hogar estacionar manejar conducir cruzar detener permitir obligar impedir informar indicar anunciar incluir presentar firmar revisar avenida esquina supermercado restaurante estación anuncio oferta compra venta tarjeta público privado general ojalá
- **Focus.** si + present + present / imperative / ir a, hay que, conditional recognition (podría, debería) — keys: `si-conditional`.

#### es-a2-2-10 · #59 · core · scripture · 1210 words · est. cov. 93% · The Good Samaritan
- **Situation.** The Good Samaritan retold, then a short comparison with a modern situation on the road
- **New (27).** ladrón extranjero enemigo sacerdote vino juez mandamiento profeta mentira culpa castigo robar quebrar pegar malvado jurar mentir engañar rechazar pelear odiar tan despacio dentro fuera debajo encima
- **Recycle (60).** apoyar votar defender aumentar existir depender ocurrir suceder actuar convencer discutir declarar publicar proponer sugerir elección voto presidente política patria derecho ley justicia guerra fuerza ciudadano religión opinión idea traducir practicar ayunar alegrar felicitar disfrutar sacrificar sermón predicador altar cruz comunión misa cordero siervo promesa señal profecía adoración espiritual celestial divino santo sagrado bendito glorioso poderoso fiel eterno importante oler
- **Focus.** all past tenses in a parable, imperative in direct speech, si-clauses in speech — keys: `imperfect`, `preterite`, `si-conditional`.

#### es-a2-2-11 · #60 · vol · travel · 1100 words · est. cov. 98% · A traveller's blog
- **Situation.** A traveller's blog: three days in Copán and one in Roatán
- **New (8, 1 to add).** taxi+ tren barco bicicleta moto torre desierto arriba
- **Recycle (72).** estacionar manejar conducir cruzar detener permitir obligar impedir informar indicar anunciar incluir presentar firmar revisar avenida esquina supermercado restaurante estación anuncio oferta compra venta tarjeta público privado general voto política derecho ley guerra ciudadano opinión partido balón gol premio baile periódico película cine sed aliento labio pierna mejilla cabello bebé limpieza prueba peso corte golpe vista sano débil pesado ligero duro blando suave caliente tibio fresco lleno vacío peligroso necesario útil temer
- **Focus.** recycling; mixed past and present; description.

#### es-a2-2-12 · #61 · core · travel · 1240 words · est. cov. 92% · Diary of the mission trip
- **Situation.** A diary from the mission trip: preterite and imperfect, what we had done before we arrived
- **New (32).** atravesar volar nadar partir acercar alcanzar hallar aparecer pertenecer huir saltar durar tardar aldea minuto calendario río arena nieve hielo ola sequía terremoto mula toro cabra principio final tumba montaña puente avión
- **Recycle (87).** apoyar votar defender aumentar existir depender ocurrir suceder actuar convencer discutir declarar publicar proponer sugerir elección presidente patria justicia fuerza religión idea traducir practicar ayunar alegrar felicitar disfrutar sacrificar sermón predicador altar cruz comunión misa cordero siervo promesa señal profecía adoración espiritual celestial divino santo sagrado bendito glorioso poderoso fiel eterno ojalá ladrón extranjero enemigo sacerdote vino juez mandamiento profeta mentira culpa castigo robar quebrar pegar malvado jurar mentir engañar rechazar pelear odiar tan despacio dentro fuera debajo encima taxi tren barco bicicleta moto torre desierto arriba
- **Focus.** llevar + gerund, mixed past tenses in a diary, perfect vs preterite, time clauses (antes de, después de, hasta que) — keys: `llevar-gerund`, `imperfect`, `preterite`, `perfect-tense`.
- **Draft.** camino-3-03 (El viaje de Tomás)

#### es-a2-2-13 · #62 · core · explanation · 1260 words · est. cov. 92% · Opinions and comparisons
- **Situation.** Opinions and comparisons: the best bus, the worst day, "creo que", "me parece que", which is better
- **New (33).** peor mayor menor igual mismo próximo siguiente anterior verdadero cierto falso natural humano moderno antiguo actual además aparte demasiado bastante afirmar negar expresar describir reconocer distinguir juzgar suponer imaginar aunque sino honesto sincero *(function words, no recycle slot: demasiado, bastante, aunque, sino)*
- **Recycle (39).** partido balón gol premio baile periódico película cine sed aliento labio pierna mejilla cabello bebé limpieza prueba peso corte golpe vista sano débil pesado ligero duro blando suave caliente tibio fresco lleno vacío peligroso importante necesario útil oler temer
- **Focus.** comparatives and superlatives, tan … como, mejor / peor, creo que + indicative, no creo que + subjunctive (recognition), aunque + indicative, sino — keys: `comparison`.

#### es-a2-2-14 · #63 · core · contemporary nonfiction · 1280 words · est. cov. 92% · The rainy season and the farmers
- **Situation.** The rainy season and the farmers: why the harvest matters, what changes with the weather, what families do
- **New (33).** trigo cebada hierba rosa gallo pato serpiente león lobo oso ratón conejo zorro ganancia pérdida oficio compañía copia obra estudio hecho puesto trato perezoso trabajador valer sorprender cortés alegre hermoso guapo tanto quien *(function words, no recycle slot: tanto, quien)*
- **Recycle (89).** traducir practicar ayunar alegrar felicitar disfrutar sacrificar sermón predicador altar cruz comunión misa cordero siervo promesa señal profecía adoración espiritual celestial divino santo sagrado bendito glorioso poderoso fiel eterno ojalá ladrón extranjero enemigo sacerdote vino juez mandamiento profeta mentira culpa castigo robar quebrar pegar malvado jurar mentir engañar rechazar pelear odiar tan despacio dentro fuera debajo encima atravesar volar nadar partir acercar alcanzar hallar aparecer pertenecer huir saltar durar tardar aldea minuto calendario río arena nieve hielo ola sequía terremoto mula toro cabra principio final tumba montaña puente avión
- **Focus.** explanation with porque / por eso / aunque, present perfect for change, passive se — keys: `se-impersonal`, `aunque-subjunctive`.

#### es-a2-2-15 · #64 · vol · work · 1150 words · est. cov. 98% · Interview with a nurse
- **Situation.** An interview with a nurse about her work: questions and long answers
- **New (9).** abogado profesor profesora maestra cocinero chofer piloto músico universidad
- **Recycle (73).** sed aliento labio pierna mejilla cabello bebé limpieza prueba peso corte golpe vista sano débil pesado ligero duro blando suave caliente tibio fresco lleno vacío peligroso importante necesario útil oler temer rechazar odiar despacio fuera encima taxi tren barco bicicleta moto torre desierto arriba peor mayor menor igual mismo próximo siguiente anterior verdadero cierto falso natural humano moderno antiguo actual además aparte afirmar negar expresar describir reconocer distinguir juzgar suponer imaginar honesto sincero
- **Focus.** recycling; question forms, perfect, preterite, imperfect.

#### es-a2-2-16 · #65 · core · biography · 1290 words · est. cov. 100% · A nurse's life
- **Situation.** A nurse's life, told by herself: childhood, training, her first night shift, why she stayed
- **New (0).** none
- **Recycle (102).** ladrón extranjero enemigo sacerdote vino juez mandamiento profeta mentira culpa castigo robar quebrar pegar malvado jurar mentir engañar pelear tan dentro debajo taxi tren barco bicicleta moto torre desierto arriba atravesar volar nadar partir acercar alcanzar hallar aparecer pertenecer huir saltar durar tardar aldea minuto calendario río arena nieve hielo ola sequía terremoto mula toro cabra principio final tumba montaña puente avión trigo cebada hierba rosa gallo pato serpiente león lobo oso ratón conejo zorro ganancia pérdida oficio compañía copia obra estudio hecho puesto trato perezoso trabajador valer sorprender cortés alegre hermoso guapo abogado profesor profesora maestra cocinero chofer piloto músico universidad
- **Focus.** all past tenses, relative clauses (que, donde, lo que), time clauses — keys: `imperfect`, `preterite`, `perfect-tense`.
- **Draft.** camino-3-02 (La vida de Elena) as the model

#### es-a2-2-17 · #66 · core · conversation · 1300 words · est. cov. 100% · A loan, politely
- **Situation.** A disagreement about a loan, polite and firm: aunque, double pronouns ("me lo dio", "se lo dije"), excuses and promises
- **New (0).** none
- **Recycle (41).** peor mayor menor igual mismo próximo siguiente anterior verdadero cierto falso natural humano moderno antiguo actual además aparte afirmar negar expresar describir reconocer distinguir juzgar suponer imaginar honesto sincero pato león oso conejo pérdida compañía obra hecho trato trabajador sorprender hermoso
- **Focus.** aunque + subjunctive / indicative, double object pronouns, reported speech in the past — keys: `aunque-subjunctive`, `double-object-pronouns`.

#### es-a2-2-18 · #67 · vol · narrative · 1200 words · est. cov. 100% · The key that came back
- **Situation.** A short story: the key that came back
- **New (0).** none
- **Recycle (51).** atravesar volar nadar partir acercar alcanzar hallar aparecer pertenecer huir saltar durar tardar aldea minuto calendario río arena nieve hielo ola sequía terremoto mula toro cabra principio final tumba montaña puente avión trigo cebada hierba rosa gallo serpiente lobo ratón zorro ganancia oficio copia estudio puesto perezoso valer cortés alegre guapo
- **Focus.** recycling; narrative with all tenses.
- **Draft.** camino-3-01 (El libro que desapareció) as a model

#### es-a2-2-19 · #68 · core · correspondence · 1300 words · est. cov. 100% · The weekly report
- **Situation.** The weekly report to the sending church: what we did, what we need, what we hope
- **New (0).** none
- **Recycle (69).** peor mayor menor igual mismo próximo siguiente anterior verdadero cierto falso natural humano moderno antiguo actual además aparte afirmar negar expresar describir reconocer distinguir juzgar suponer imaginar honesto sincero trigo cebada hierba rosa gallo pato serpiente león lobo oso ratón conejo zorro ganancia pérdida oficio compañía copia obra estudio hecho puesto trato perezoso trabajador valer sorprender cortés alegre hermoso guapo abogado profesor profesora maestra cocinero chofer piloto músico universidad
- **Focus.** formal register, perfect + preterite + subjunctive (que + subjunctive), future with ir a — keys: `perfect-tense`, `querer-que-subjunctive`.
- **Draft.** camino-3-06 (Querida abuela) as a model for structure

#### es-a2-2-20 · #69 · core · testimony · 1300 words · est. cov. 100% · Why I came to Honduras
- **Situation.** "Why I came to Honduras": a longer first-person testimony in all tenses, with faith, doubt and work in plain language
- **New (0).** none
- **Recycle (9).** abogado profesor profesora maestra cocinero chofer piloto músico universidad
- **Focus.** all tenses, subjunctive after querer que / para que, perfect — keys: `preterite`, `imperfect`, `perfect-tense`.
- **Draft.** story-01 (Mi historia) as a seed

## 4. The existing drafts (Camino 1–3, Honduras — Lecturas 1)

All 26 (plus the two seed documents `dialogue-01` and `story-01`) are machine-drafted, unreviewed and unpublished: about 3.7 k words, 7 % of the ladder. "Off-plan" = share of the draft's running words (names and numerals excluded) whose lemma is neither in Stage 0 nor in the lists of units up to the mapped one *(measured)*; ≤ 10 % means "as-is with small changes", 10–15 % "needs a pass", above that "outline only". Changes common to all: rename the cast to Stage 0's (Sam, Ana, Luis, doña Marta, Nico) and the list names; the name *Rosa* is read as the noun *rosa* (use another name); keep one text per scene and let the unit's writer add the rest.

| draft | words | feeds | role | off-plan | what to change |
|---|---:|---|---|---:|---|
| camino-1-02 La casa de Ana | 47 | a1-1-02 | opening scene, as-is with changes | 15 % | pequeño, bonito, silla, cocina, contento → grande, cama, baño, cansado; *hambre* waits for 04 |
| camino-1-04 La familia de Marta | 56 | a1-1-03 | core of the unit, as-is with changes | 11 % | *padre/madre* → papá/mamá; Rosa → another name; add ages (tener + años) |
| camino-1-05 El desayuno | 42 | a1-1-04 | core scene | 14 % | *más, dar, contento* → rephrase; Rosa → another name; add baleada and a comedor dialogue |
| camino-1-06 Pedro va a la ciudad | 65 | a1-1-06 | spine, shortened | 18 % | ciudad, carro, tienda, azul, contento are not yet known: make it "Pedro va al mercado", prices in lempiras |
| camino-1-01 Juan y el libro | 37 | a1-1-13 | opening scene | 14 % | *leer, contento* → buscar, encontrar; Juan → Nico |
| camino-1-03 Juan y Ana | 43 | a1-1-13 | dialogue, as-is with changes | 7 % | hombre/mujer → names; no *tú* forms to fix |
| camino-1-07 Luis y Sol | 48 | a2-1-01 | as-is | 4 % | only *correr* off-plan; the dog's name Sol must be read as a name |
| camino-1-08 Marta quiere un perro | 56 | a2-1-01 | as-is with changes | 9 % | maestra, madre, sonreír → professor/mamá/…; combine with 1-07 |
| camino-2-01 El libro perdido | 102 | a2-1-05 | spine (lo / la) | 8 % | **tú → vos** (¿tienes mi libro? → ¿tenés…?); drop cocina, sala, suelo; *debajo* → en |
| camino-2-02 En el mercado | 121 | a2-1-05 (first half), a2-1-06 (second half) | seed | 14 % at 37 | fruta/naranja/vendedora not in plan → plátano, tomate; "me das un plátano" is the le/me example for 37 |
| camino-2-03 La lluvia | 102 | a2-1-04; a1-2-03 (present-tense version) | first scene of the storm unit; present-tense seed for the rainy Saturday | 9 % | ventana, sala, suelo, mojado, lástima → swap; *le dio una pelota* waits for 37 |
| camino-2-04 Sol se fue | 97 | a2-1-04 | second scene | 15 % | tú imperative *No llores* → *No llorés*; *lo buscó* → buscó a Sol (lo is taught in 36) |
| camino-2-05 La carta | 90 | a2-1-06; a1-2-15 | seed | 12 % at 37 | carta, recibir, abrazar, limpiar not yet known at 30; read as-is from 37 |
| camino-2-06 El cumpleaños de Marta | 87 | a1-2-15 | seed only | 22 % | imperfect (*iba a cumplir*), preterite and *globos / pastel / chocolate* → rewrite as an invitation in the present / ir a |
| camino-2-07 El viaje en autobús | 112 | a2-1-11 (as-is); a1-2-05 (model) | as-is at 42; at 20 only the situation | 14 % at 42; 21 % at 20 | **estación → terminal**; asiento, ventana, vacaciones, río → swap; *dale el asiento* (imperative + pronoun) is a 53 sentence |
| camino-2-08 La abuela cuenta | 127 | a2-1-01 (first half), a2-1-03 (second half) | as-is with changes | 13 % | **Cuéntanos → Contanos**; juguete, imaginación, historia → swap |
| camino-3-01 El libro que desapareció | 183 | a2-2-01; a2-2-18 (model) | spine of 50, shape of 67 | 10 % at 50 | pluperfect (había dejado, se había levantado) out; **tú → vos** (¿has visto, tienes razón, dime, quédatelo); subjunctive (antes de que, quiero que) out until 55 |
| camino-3-02 La vida de Elena | 206 | a2-1-16; a1-2-11 (simplified); a2-2-16 (model) | biography model for three units | 9 % at 47; 20 % at 26 | perfect (han llegado) and subjunctive (querían que estudiara) out at 26 and 47; keep as written at 65 |
| camino-3-03 El viaje de Tomás | 243 | a2-2-12 | as-is with changes | 7 % | pluperfect, conditional (saldría) and subjunctive (antes de que saliera) → recast; **estación → terminal** |
| camino-3-04 El hijo que volvió | 384 | a2-1-14 | spine of the Scripture unit | 13 % | pluperfect, conditional (habría querido), imperative (traigan, vístanlo) and subjunctive (quiero que me des) → direct speech; *cabrito* → ask the Honduran reviewer |
| camino-3-05 La bicicleta de Marta | 260 | a2-2-17; some sentences in a2-2-08 | seed for the money / aunque conversation | 8 % at 66 | **tú → vos** (¿me la puedes comprar? si vienes los sábados); future (pagaré, enseñaría) → ir a |
| camino-3-06 Querida abuela | 199 | a2-1-15; a2-2-19 (structure model) | letter, as-is with changes at 46 | 10 % at 46 | subjunctive (Espero que estés bien) and *tú* forms out at 46; keep for 68 |
| honduras-lecturas-1-01 En el mercado | 155 | a1-1-06 (outline); a1-2-12 (baleada paragraph); a2-1-06 (whole) | outline at 06 (rewrite ≈ 70 %); as-is from about 37 | 32 % at 06; 15 % at 27 | keep the greeting–price–pay exchange and the baleada; cut verduras, esquina, cambio, recibir at 06 |
| honduras-lecturas-1-02 En el autobús | 177 | a1-1-10 (outline); a2-2-04 (whole) | ticket dialogue at 10; the vos commands (Vení, Mirá, Cuidate) are a model for 53 | 24 % at 10; 9 % at 53 | cut minutos, asientos, ventana, montañas at 10; **keep voseo throughout** (the draft is already Honduran) |
| honduras-lecturas-1-03 El domingo en la iglesia | 191 | a2-1-09 (spine); a1-2-14 (simplified) | reflexives (*se levanta, se sientan*) fit 40 | 15 % at 40; 22 % at 29 | at 29 remove every reflexive; at 40 add the abrazo / beso greetings and the cleaning after |
| honduras-lecturas-1-04 La comida en familia | 157 | a1-1-05 (outline only) | situation only; readable as-is from about 45 | 37 % at 05 | keep "everyone helps, thanks before the meal"; tajadas, jugo, ensalada, amén wait |
| dialogue-01 Una conversación (seed) | 42 | a2-2-02 | testimony seed | 2 % at 51 | **tú → vos** (entiendes, crees) |
| story-01 Mi historia (seed) | 53 | a1-1-15 (present tense); a2-2-20 | testimony seed | 26 % at 15; 0 % at 69 | at 15 keep only the present-tense sentences; the past ones are 69 sentences |

Observed: the Camino 1 stories (A0, 37–65 words) are too short to be units on their own (a unit is 270–400 words); each becomes the opening scene of a unit. The Camino 2–3 and Honduras texts are the only existing material on the A2 side of the ladder, but they use constructions the plan places later (pluperfect, conditional, future, present subjunctive) — those sentences must be cut or recast, not kept.

## 5. The b1-bridge: how to fill it

### 5.1 What the library offers, measured against this ladder

The library index (`public/library/es`, built 2026-10-04, 1,865 texts, 2.63 M words) is overwhelmingly Scripture (704 k words of Reina-Valera 1909) and 19th-century prose; the only contemporary, openly licensed non-Scripture material is **nine children's / young-reader stories from the Global Digital Library (CC BY 4.0, 6.8 k words in all, `canModify: true`)** and **one Global Voices excerpt (214 words, CC BY 3.0)**. The reading ladder's "comfortable" point for Spanish is therefore reached through 19th-century narrative and Bible, not through modern text — which is also what the audit found.

Method *(measured)*: for each work, the share of running words whose lemma (the adapter's first reading; proper nouns and numerals known) is in Stage 0 or in any unit list of this plan — "now" — and the number of extra lemmas, taken in order of frequency, that would lift it to 88 % (the error line for authentic texts), 92 % (warning line) and 95 %. These are estimates of what `npm run ladder:place` will say once the units exist; `ladder:place` itself does not exist yet (`src/ladder` is absent).

| work (textId prefix) | words | now | +lemmas to 88 % | to 92 % | to 95 % | notes |
|---|---:|---:|---:|---:|---:|---|
| bridge-vuelve-gata | 53 | 88.7 % | 0 | 1 | 3 | GDL, CC BY 4.0; the easiest text in the library |
| bridge-una-casa-para-raton | 98 | 84.7 % | 1 | 4 | 7 | GDL |
| bridge-demasiados-platanos | 481 | 85.9 % | 4 | 12 | 26 | GDL; a banana farm in India, translated |
| bridge-safari-en-la-banera | 100 | 77.0 % | 11 | 15 | 18 | GDL |
| bridge-pishi-atrapado-en-una-tormenta | 351 | 77.2 % | 16 | 30 | 41 | GDL |
| bridge-el-bate-perdido-2 | 545 | 78.5 % | 17 | 39 | 55 | GDL; cricket vocabulary |
| bridge-dentro-de-la-world-wide-web | 1,567 | 78.3 % | 23 | 58 | 105 | GDL; contemporary nonfiction (internet, ordenador: Spain / Latin America mix) |
| bridge-el-nino-y-el-tambor | 2,825 | 78.9 % | 22 | 60 | 109 | GDL; the longest modern text |
| bridge-inmersion | 770 | 67.7 % | 58 | 89 | 112 | GDL; marine vocabulary |
| gv-es-dae11aaaf264-excerpt | 214 | 72.0 % | 22 | 30 | 37 | Global Voices, CC BY 3.0; one excerpt only |
| BIBLE Juan (RV 1909) | 17,106 | 88.8 % | 0 | 7 | 47 | ch. 4, 9, 11 individually 89–93 % |
| BIBLE Génesis | 34,990 | 87.5 % | 2 | 45 | 157 | ch. 37–45 (Joseph) 82–90 % |
| BIBLE Jonás / Rut | 1,153 / 2,262 | 85.3 / 84.8 % | 6 / 7 | 21 / 24 | 51 / 50 | short and complete |
| BIBLE Marcos / San Lucas / Hechos | 13.3 k / 22.8 k / 21.8 k | 84.8–86.1 % | 6–12 | 53–75 | 157–219 | |
| marti-edad-de-oro | 66,816 | 81.9 % | 128 | 391 | 863 | ch. 02–05 are 82–86 %; sentences ≈ 20–25 words |
| unamuno-niebla | 57,306 | 82.7 % | 123 | 426 | 979 | short sentences (≈ 8–10 words); Unamuno d. 1936 |
| quevedo-el-buscon | 42,702 | 81.3 % | 171 | 503 | 1,042 | 17th-century; not recommended as a first authentic novel |
| alarcon-capitan-veneno / sombrero-de-tres-picos | 21,368 / 24,722 | 78.8 / 78.4 % | 272 / 257 | 632 / 638 | 1,161 / 1,182 | see the edition warning in 5.4 |
| galdos-marianela | 50,969 | 78.9 % | 348 | 839 | 1,519 | ch. 03 is the easiest (80 %) |
| valera-pepita-jimenez | 56,650 | 77.5 % | 519 | 1,120 | 1,911 | |
| palma-tradiciones-peruanas | 47,998 | 73.8 % | 944 | 1,773 | 2,918 | sentences ≈ 24 words; viceregal vocabulary |
| pardo-bazan-pazos-de-ulloa | 83,749 | 72.1 % | 1,301 | 2,458 | 3,812 | |
| iriarte / samaniego fábulas (verse) | 14.2 k / 42.7 k | 76.3 / 71.7 % | 362 / 811 | 716 / 1,507 | 1,143 / 2,356 | verse; library, not ladder |

Reading the table:

- **The Bible is nearly in reach.** The most frequent unknown words of every Bible book are *mas, os, vosotros, vuestro, cual, delante, mío, e, aun, cualquiera* — all already in the course list, but deliberately not taught (voseo and *ustedes* are the target). They are a dozen receptive items, not a vocabulary gap: adding *mas, os, vosotros, vuestro, cual, delante, mío, e, aun, cualquiera, tal* to the known set lifts Juan 4 to 94.6 %, Génesis 45 to 94.0 %, Génesis 42 to 92.3 %, Marcos 2 to 92.1 %, Juan 9 to 91.7 %, and Jonás 3, Juan 11, Génesis 39 / 43 / 44 to 90–91 % *(measured)*.
- **The modern stories need 12–60 lemmas each** (nature, school, internet vocabulary), which is a single adapted unit apiece.
- **The 19th-century narrative needs 400–850 lemmas** to reach 92 %: Martí and Unamuno first (≈ 400), then Alarcón and Galdós (≈ 650–850); Palma and Pardo Bazán belong to the library, not to the ladder.

### 5.2 A fill plan for about 45 000 words (30–60 k allowed)

| block | words | kind | content | lemmas known at the end (estimate) |
|---|---:|---|---|---:|
| B1-a | ≈ 6 k | adapted (new text) | 6 units of about 1,000 words in the Honduran mission setting: receptive Bible forms (*mas, os, vosotros, vuestro, cual, delante*), the 50–100 lemmas the easiest authentic texts lack, recycling of units 64–69 (occupations) | ≈ 1,200 |
| B1-a placements | ≈ 5 k | authentic | Vuelve, Gata; Una casa para Ratón; Demasiados plátanos; then Juan 4, 9, 11; Marcos 2; Jonás 1, 3; Rut 1–4; Génesis 39, 42, 45 (Scripture ≤ 15 % of the stage = 6.7 k) | ≈ 1,250 |
| B1-b | ≈ 12 k | adapted | 12–14 units in the domains the ladder is thin on: contemporary explanation and nonfiction (clean water, dengue, the coffee harvest, school year), correspondence, biography, practical documents; new lemmas ≤ 2.65 per 100 | ≈ 1,570 |
| B1-b placements | ≈ 6 k | authentic | the rest of the GDL set (Pishi, Safari, El bate perdido, Inmersión, Dentro de la World Wide Web, El niño y el tambor) as each clears 92 % | ≈ 1,720 |
| B1-c | ≈ 5 k | adapted | 5 units preparing the 19th-century voice: longer sentences, older register, *pretérito imperfecto de subjuntivo* recognition, the *-ra* forms | ≈ 1,850 |
| B1-c placements | ≈ 11 k | authentic | Martí, *La Edad de Oro* ch. 02–05 (≈ 4.2 k) and Unamuno, *Niebla* ch. 01–03 and onward first (placeable from about 1,450 lemmas); then Alarcón, *El capitán Veneno* ch. 24–31 (short, mean sentence ≈ 8 words) and Galdós, *Marianela* ch. 03 (about 1,700–1,900 lemmas) | ≈ 2,100 |

At the end the learner has met about 2,100 lemmas three times (estimates, 2.65 new lemmas per 100 adapted words plus the unknown words of each authentic text): that puts Martí and Unamuno at about 95 % (they need ≈ 1,900 and ≈ 2,020), Alarcón and Galdós at 92–93 % (they need ≈ 1,670–1,880 for 92 %), and still leaves Palma (≈ 2,800 for 92 %), Pardo Bazán and Cervantes in the library. The audit's B2 figures (3,250 lemmas for recognition) are not reached by 45 k words; a b1-bridge that reaches them needs about 100 k words, or a gate threshold for authentic units below 92 %.

### 5.3 If no library text fits: the adapted texts to commission

1. **Receptive-Bible unit(s)** — short original narratives that use *mas, os, vosotros, vuestro, cual, delante, mío* in Bible-like sentences, no Scripture text quoted. Needed before any Bible chapter is placed.
2. **Contemporary explanation and nonfiction on Honduran topics** (the library has none): 800–1,500 words each, written new, facts checked by a person; about 8 units.
3. **Correspondence and practical documents**: team reports, prayer letters, minutes, notices, forms, health instructions; about 6 units. The nearest real source is the team itself (with consent).
4. **Biographies of composite or consenting people** (a Honduran nurse, a pastor, a farmer): about 4 units; never real persons without their agreement.
5. **Scripture retellings in plain Spanish** (Joseph, Ruth, Jonah, Lazarus), at most 15 % of the stage.
6. **Voice preparation**: adapted extracts that keep Martí's or Alarcón's syntax and replace the rarest words. Rights records of the Gutenberg works say `canModify: false`; the owner must decide whether such a transformation is allowed. The alternative is original controlled narrative with the same lemma set.
7. **More open contemporary sources to acquire**, each verified per text by a person: further Global Voices en Español articles (CC BY 3.0; only one excerpt is in the library), higher levels of the Global Digital Library in Spanish (the nine "bridge" books are its lowest levels), other CC BY / CC BY-SA sources. Their lemma gap should be measured as in 5.1 before they are acquired.
8. **Scripts for listening**: because native audio is the bottleneck (all 488 Stage 0 lines still wait for a recording), every b1 adapted unit should be written so that a person can record it in one sitting (≤ 1,100 words).

### 5.4 Hold or avoid

- **Platero y yo** (Jiménez, d. 1958) and the two **Baroja** novels in the library (*Zalacaín el aventurero*, *El árbol de la ciencia*; Baroja d. 1956): by the audit's and `docs/spanish/STATUS.md`'s reading (leads, not legal opinions) probably still protected in Honduras and Spain; the library's rights records say "public domain" for the United States only. Not candidates. (Platero also has 14 % English apparatus in its Gutenberg edition.)
- **Alarcón, *El capitán Veneno* and *El sombrero de tres picos***: `docs/spanish/STATUS.md` records both Gutenberg editions as American school editions with 17 % and 26 % English notes. The built chapters show an unanalysed share near 0 %, so the apparatus may be stripped, but a person must check the editions before placement.
- **Palma, Darío (prose and verse), the fable collections**: too far (sentences of 20–30 words, 70–76 % now). Library, not ladder.
- **Reina-Valera 1909 as a whole**: the verified rights record covers three verses; the whole-Bible record is the generic Gutenberg-type check. Placing chapters needs the rights check for the release jurisdictions (`docs/spanish/STATUS.md` §7).
- **Any text with Spain-only vocabulary** (*ordenador, coche, vosotros*): placeable, but the word sheet already labels it receptive; keep these for the last third of the bridge.

### 5.5 First placements to run when `ladder:place` exists

`npm run ladder:place -- --lang es <textId>`, in this order (percentages are with this ladder alone, before the Bible forms): `text:es:bridge-vuelve-gata-ch01`, `…bridge-una-casa-para-raton-ch01`, `…bridge-demasiados-platanos-ch01`, `text:es:bible-jhn-4` (92.9 %), `bible-jon-3` (91.3), `bible-jhn-9` (90.8), `bible-mrk-2` (90.6), `bible-gen-39` (89.8), `bible-gen-45` (89.6), `bible-gen-42` (89.1), `bible-jhn-11` (88.8), `bible-act-9` (88.7), `bible-rut-1` (87.7); then the other `bridge-*` stories, `gv-es-dae11aaaf264-excerpt-ch01`, `marti-edad-de-oro-ch02…05`, `unamuno-niebla-ch01…03`, `alarcon-capitan-veneno-ch24…31`, `galdos-marianela-ch03`. Expect each to say "after unit N" only after the adapted b1 units exist; before that, "library, not ladder".

## 6. Words to add to the list (for the Spanish session to review)

24 words, all used by the plan; each is used first in the unit shown. If a word is refused, the unit's writer replaces it with a listed word of the same theme and the plan owner updates the unit's list. Glosses and genders are machine-drafted. Regional notes are for the Honduran reviewer.

| word | POS | gender | gloss | first unit |
|---|---|---|---|---|
| pastilla | NOUN | f | pill, tablet | es-a1-2-09 |
| receta | NOUN | f | prescription; recipe | es-a1-2-09 |
| tos | NOUN | f | cough | es-a1-2-09 |
| crema | NOUN | f | cream (as on a baleada) | es-a1-2-12 |
| horario | NOUN | m | timetable, schedule | es-a1-2-16 |
| mecánico | NOUN | m | mechanic | es-a1-2-16 |
| correo | NOUN | m | mail; email | es-a2-1-07 |
| ducha | NOUN | f | shower | es-a2-1-08 |
| jabón | NOUN | m | soap | es-a2-1-08 |
| toalla | NOUN | f | towel | es-a2-1-08 |
| cepillar | VERB | — | to brush | es-a2-1-08 |
| versículo | NOUN | m | verse (of the Bible) | es-a2-1-09 |
| capítulo | NOUN | m | chapter | es-a2-1-09 |
| brigada | NOUN | f | team of volunteers (as in "brigada médica") | es-a2-1-10 |
| vacuna | NOUN | f | vaccine | es-a2-1-10 |
| herida | NOUN | f | wound, injury | es-a2-1-10 |
| dengue | NOUN | m | dengue fever (a seasonal concern in Honduras) | es-a2-1-10 |
| taller | NOUN | m | workshop, repair shop | es-a2-1-12 |
| sembrar | VERB | — | to sow, to plant (seed) | es-a2-1-12 |
| cultivar | VERB | — | to grow, to farm | es-a2-1-12 |
| ministerio | NOUN | m | ministry | es-a2-1-16 |
| líder | NOUN | mf | leader | es-a2-1-16 |
| petición | NOUN | f | request; prayer request | es-a2-2-02 |
| taxi | NOUN | m | taxi | es-a2-2-11 |
| Sam | PROPN | m | the learner's stand-in in the Stage 0 scenes (now read as an unknown word) | Stage 0 |
| Nico | PROPN | m | Marta's grandson, ten (now read as the verb *nicar*, first candidate) | Stage 0 |

**Also wanted, not used by this plan** (over budget now; useful for the b1-bridge or as substitutes): colonia (noun/f: neighbourhood, housing district; in Honduras a colonia is a named barrio); cuadra (noun/f: block of a street, the usual way to give a short distance); gripe (noun/f: flu, bad cold); inyección (noun/f: injection); diarrea (noun/f: diarrhoea); dentista (noun/mf: dentist); invitación (noun/f: invitation); consulta (noun/f: medical appointment); refresco (noun/m: soft drink, soda); aguacate (noun/m: avocado, the usual word in Honduras); voluntario (noun/m: volunteer); traductor (noun/m: translator, interpreter); lectura (noun/f: reading); internet (noun/m: the internet); camioneta (noun/f: pickup truck, small bus or van); gasolina (noun/f: petrol); pariente (noun/mf: relative); encantar, interesar, molestar (verbs: gustar-type, "me encanta / me interesa / me molesta"); feriado (noun/m: public holiday); grado (noun/m: school grade); yuca (noun/f: cassava); caldo (noun/m: broth); mango (noun/m: mango).

The `gustar-type` detector names *encantar, interesar, molestar* but the list does not have the verbs. Regional entries that the plan relies on and that already exist but are unverified (list status "machine-drafted"): baleada, tamal, pulpería, chamba, pisto, cipote, catracho, ahorita, platicar, papa, jugo, carro, computadora, lapicero.

## 7. Under-specified, risky, or decided by someone else

1. **The b1-bridge is a brief, not a unit plan.** Its units cannot be listed before a2-2 exists and the real lemma set is measured; section 5 gives the composition, the lemma gaps and the order of placements, nothing more. This is the least specified stage.
2. **a1-1 units 01–09 depend on a decision about Stage 0.** If two top-up scenes are added to Stage 0, the 50 top-up tokens disappear, units 01–02 reach ≈ 92 % and the budgets of 01–07 can be raised by one or two lemmas each. If not, units 01–02 sit at ≈ 85–86 % (inside the lower band) and 03–09 at 92 % only if the writers use the top-up lemmas exactly as many times as stated.
3. **Everything is planned on the 92 % line.** The core units have 0–1 lemma of slack; one extra new word or one lemma used fewer than three times drops a unit into the warning band. The estimates are arithmetic, not measurement: they assume the adapter reads every listed word as its listed lemma. Known traps: *Nico* → *nicar*, *Sam* unknown (add both as proper names), *Rosa* → *rosa*, *vivo* (adjective vs *vivir*), *sé / fue / solo / como / ve* homographs, and *esto / eso / aquello* all counted as *este / ese / aquel* (this is why *este* is taught in unit 02 and *ese / aquel* in 36). The cliff rule is safe on paper: the largest planned drop below the mean of the three previous units is 2.7 points (unit 47; the gate warns above 6).
4. **Recycling is dense.** Three encounters per new lemma within six units means 2–10 tracked content words per 100 running words that the writer must place (the plan's heaviest unit: 10.4 per 100). The assignment is by theme overlap and load, not by meaning; some pairings are awkward (a loan dispute that must mention a river), and the writer may use any of the three slots in any order or put all three occurrences in one unit. Where a recycle list reads absurdly for a unit, move the word to the unit with the nearest theme and tell the plan owner. Function words are exempt from recycle slots on the assumption that they recur by themselves.
5. **Units 65–69 introduce no new lemma** (only unit 64 introduces nine). This is deliberate (no later unit can recycle them), but it leaves the last five units as pure consolidation; if the gate's recycling check is relaxed for the last six, 40–60 more lemmas could be moved there from units 50–63. Their "est. cov. 100 %" is an artefact of the arithmetic; real figures will be 96–98 %.
6. **Scripture units (25, 45, 59) are retellings written for the course**, not quotations; they need a Scripture-competent reviewer in addition to the linguistic one. Quoted verses would need the Reina-Valera rights record per verse and would bring the archaic forms (*vosotros, os, mas*).
7. **Adapter detectors missing for the constructions this plan teaches**: reflexive verbs (39–40), imperatives (53–54), pronouns before the verb (36–38), and *poder / querer + infinitive*. The gate's "constructions first met" column will be empty for them. Also: the `vosotros` key fires on voseo *vivís, salís, decís* (units 01, 08 and every vos question): the gate would report *vosotros* as a construction met in unit 01. A small change to that detector (require a vosotros context) is the Spanish session's.
8. **The list lacks words the plan wants** (section 6): 24 added words plus two names; another 25 are wanted for the b1-bridge. The list also lacks *encantar, interesar, molestar*, which the `gustar-type` detector names.
9. **Honduran usage is unverified.** Every es-HN choice here (baleada, tamal, pulpería, chamba, pisto, cipote, catracho, ahorita, platicar, brigada, vos forms in the imperative: *vení, mirá, decime, andá*) is the planner's reading of the dictionary's labels, not a native's. A Honduran reviewer should read the plan before the texts are drafted, not after.
10. **a1 is 13.2 k words**, below the 15 k lower bound that `docs/LADDER.md` calls indicative. Three or four a1 volume units would close it without touching the vocabulary budget; they are not planned because the owner's per-unit ranges and unit count were fixed.
11. **Domain gaps in a2-2**: food, family and daily life appear only as topics inside other units; if the owner wants them as domains in a2-2, relabel units 52, 56, 64 and 67.
12. **Audio**: every unit is meant to be recordable in one sitting (a1 ≤ 400 words; a2-2 ≤ 1,300), but nothing here schedules recordings or reviewers; `docs/audits/B2-AUDIT.md` items 2–3 (a named native reviewer, native audio) are still the precondition for any unit to reach a learner.
13. **This plan is prose.** The Spanish session should turn the unit blocks into `ladder.json` entries plus a per-unit allowed-lemma list (Stage 0 + all earlier lists + the unit's own) so that writers and the gate read the same data; hand-copying 960 lemmas will introduce errors.



## Units 65–69 (rewritten 2026-10-06)

Units es-a2-2-16 … es-a2-2-20 were pure recycling (100 % known words, nothing new) and the drafters had avoided ordinary words the plan never scheduled (`docs/audits/B2-SIMULATION.md`, item 6). They were rewritten as core units that use those words naturally. The "New (0) / Recycle" lists of units 65–69 above are superseded: the units no longer carry them, and no padding with known words was done. Unit ids, order, domains and titles in `ladder.json` are unchanged. All remain `machine-draft` (tool, 2026-10-06), corpus `ladder-es`, variety es-HN (vos among friends, usted for respect, ustedes only), one English line per sentence, present subjunctive only (no future, conditional or imperfect subjunctive).

Measured with the gate (`npm run ladder:check -- es`): 0 errors. Findings of the new texts and the words that stand behind them:

| unit | domain / title | words | cov3 | new lemmas (per 100) |
|---|---|---:|---:|---:|
| es-a2-2-16 (65) | biography, A nurse's life (Ana, first person) | 1,183 | 94.1 % | 18 (1.5) |
| es-a2-2-17 (66) | conversation, A loan, politely (Sam, don Carlos, Marvin, Elena) | 1,094 | 95.2 % | 15 (1.4) |
| es-a2-2-18 (67) | narrative, The key that came back (doña Marta, Nico) | 1,002 | 92.4 % | 15 (1.5) |
| es-a2-2-19 (68) | correspondence, The weekly report (Sam and Karla to the sending church) | 1,052 | 97.0 % | 17 (1.6) |
| es-a2-2-20 (69) | testimony, Why I came to Honduras (Sam) | 1,124 | 96.2 % | 22 (2.0) |

**Words each unit teaches** (home unit, at least three uses; every word is in the word list, `otra vez` in `phrases.ts`; all recur in the later units unless noted):
- **65 (biography, childhood and training)**: *historia, cocina, ropa, lavar, desayunar, preocupar, miedo, fuerte* (never met before), *cada, cosa, casi, tan, mismo, todavía, desde, guardar*. Other new lemmas: *leche, almuerzo, cena, cuaderno, estudiante, calma, vecina*.
- **66 (loan conversation)**: *contra, juntos (junto), rápido* (never met before), *quién, cuándo, ese/esa/eso, tanto, perdón, problema, importante, ni, mismo*. Other new lemmas: *deuda, escalera, malo, tranquilo, ocupado, don*.
- **67 (story)**: *puerta, ventana, silla, música, cerrar* (never met before), *correr, guardar, otra vez, algo, alguien, nadie, camino, cuidado, miedo, ese/esa/eso*. Other new lemmas: *guitarra, tocar, sonar, barro, polvo, oscuro, bolsillo, voz, limpiar*.
- **68 (weekly report)**: *importante, desde, ellos, ellas, ropa, música, cocina, desayunar, lavar, oración, problema, historia, cuidado*, recycling of the earlier ones (*puerta, ventana, cerrar, contra, junto, camino, correr*). Other new lemmas: *apoyo, gasto, esperanza, alegría, necesidad, faltar, lápiz, viernes, maíz*.
- **69 (testimony)**: *empezar, pensar, dejar, oración, camino, ni, cuándo, quién, mismo, juntos*, recycling of nearly all the others (*miedo, música, fuerte, cerrar, puerta, ventana, silla, correr, contra, perdón, cuidado, otra vez*). Other new lemmas: *oficina, duda, fe, error, valiente, paso, maleta*.

Of the 44 words of the brief, 16 were unknown to the gate before (fewer than three earlier encounters): *contra, juntos, historia, puerta, cocina, ropa, ventana, silla, fuerte, rápido, cerrar, lavar, preocupar, desayunar, miedo, música*. The other 28 words (and the phrase *otra vez*, made of known words) were already met at least three times in units 1–64 (*quién, cuándo, cada, cosa, mismo, ni, todavía, ese, algo, alguien, nadie, casi, tan, tanto, desde, problema, importante, ellos, ellas, camino, cuidado, oración, perdón, empezar, pensar, dejar, correr, guardar*); they are used here in the ordinary places a native writer would put them, three or more times in their unit.

Notes for the reviewer:
- **Recycling warnings.** The gate now warns for units 10–14 (new lemmas not coming back 3+ times within six units: animals, grains, abstract words such as *trigo, cebada, gallo, pato, ladrón, sincero*). The old 16–20 only recycled them by stuffing; they are not forced back in. Re-plan their recycling in the b1-bridge, or accept the warning.
- New lemmas per 100 words: 1.4–2.0, below the plan's 2.65, because the texts avoid one-use words; the rest of the learning is the 28 known words in natural use.
- Honduran usage still unverified: *vos* forms (*pasá, sentate, decí, vení, tenés, querés, tocá, poné*), *don/doña*, lempiras, the dialogue register of don Carlos and Marvin. Unit 66 uses *usted* from Marvin to don Carlos and *vos* back; Sam says *usted* to don Carlos and *vos* to Marvin.
- Consistency with unit 64 (Ana, her mother, Luis, the doctor, the university, the bicycle and the main road): kept. Unit 69 mentions people from 65–68 (Ana, Marvin, doña Marta, Nico, Pastor Mario).
