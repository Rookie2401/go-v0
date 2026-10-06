# German ladder — vocabulary and unit plan (a1-1 … a2-2, with the b1-bridge brief)

Planning document for `data/ladder/de/ladder.json` (contract: `docs/LADDER.md`), written 2026-10-06 by the German ladder planner. Writers draft the texts from it later; **nothing here is reviewed by a person** (the German of every situation, every gloss and every word marked † "to add" needs the German session and a native reviewer). Figures marked *(measured)* were produced on 2026-10-06 with the real German adapter (`adapter-de@6`, `createAdapterRegistry`) on the working tree, the same way the gate reads units (first reading of each word, its lemma, lower-cased; proper nouns and numerals known, Stage 0 as the head of the path). **Another session was revising the adapter at the same time**, so re-measure before relying on a decimal; the planning scripts were scratch files and are not in the repository, the plan below is the data. Method and structure follow `data/ladder/es/PLAN.md`; the gate bands are those of `src/ladder/policy.ts` (controlled coverage warns below 88 %, errors below 85 %; the first two units 85 % / 78 %; new lemmas per 100 words warn above 5, error above 9).

## 0. Summary and the findings that shape the plan

| | a1-1 | a1-2 | a2-1 | a2-2 | total |
|---|---:|---:|---:|---:|---:|
| units (core + volume) | 15 (12+3) | 16 (13+3) | 18 (13+5) | 20 (15+5) | 69 (53+16) |
| words per unit | 270–400 | 400–600 | 600–900 | 900–1,300 | |
| running words | 5,160 | 7,990 | 13,990 | 23,100 | 50,240 |
| new lemmas | 159 | 243 | 310 | 312 | 1,024 |
| new lemmas per 100 words | 3.08 | 3.04 | 2.22 | 1.35 | 2.04 |
| lemmas known at the end of the stage (with Stage 0's 88) | 247 | 490 | 800 | 1,112 | 1,112 |
| Scripture-domain share of the stage | 0.0% | 6.5% | 6.4% | 5.2% | 5.2% |

Findings, in the order they matter:

1. **The arithmetic of the coverage rule.** A lemma is "known" only after three earlier encounters, so the three tokens of every new lemma are "unknown" in the unit that introduces it. Expected coverage of a unit is about 1 − (3 × new lemmas + Stage 0 top-up tokens) / words. The controlled warning at 88 % allows at most **4.0 new lemmas per 100 words**; the plan budgets the a1 units at 2.2–3.6 new lemmas per 100 words (the basics have to be taught) and the a2 units at 0.5–3.0, falling with the stage (planned coverage, "est. cov." in the tables: lowest from unit 03 89.1 %). The plan is deliberately **not** written to the warning line: it leaves 1–3 points of slack in each unit for the ordinary words a good writer needs and the plan has not scheduled (the lesson of `docs/audits/B2-SIMULATION.md`: never pad with known words, never avoid an ordinary word). New lemmas per 100 words stay far below the gate's 5 / 9. Each new lemma is used **exactly three times in its introducing unit** — counted in *tokens*, which matters for separable verbs (section 2.4, rule 3).
2. **Stage 0 secures only 62 of its 88 lemmas** (met three times or more in its 15 scenes and 4 review re-readings, 548 running words *(measured)*); 26 more are met once or twice and cost tokens when a unit uses them (section 1.4: 29 top-up tokens in units 01–08). Two of the 62 are names the adapter does not know as names (*Sam*, *Ben*); *Marta* is read as a common noun and is one of the weak lemmas. Two more short Stage 0 scenes using the 26 weak lemmas once or twice each would free units 01–08 of this cost.
3. **German multiplies lemmas in three ways the gate sees and a Spanish plan did not meet** (section 7, measured): (a) a *separable verb* split in a main clause is two tokens of one lemma (*er steht auf*: both tokens are `aufstehen`), (b) every *compound* is its own lemma and knowing its parts does not help (51 of the plan's new lemmas are compounds), (c) a noun or verb that is **not in the adapter's word list** is read by rule: its singular is recognised, but its plural and genitive forms become *separate lemmas* (*Kurs / Kurse / Kurses*) and the participles of such verbs get wrong lemmas (*beachtet* → `beachen`, *vermisst* → `vermisen`). **156 of the 1,024 lemmas of the plan (15 %) are not in the word list** (marked † in the unit tables, listed with gender and gloss in section 6). Adding them to the word list before the units are drafted is the single most useful change outside the ladder.
4. **No authentic library text clears the gate at the end of a2-2.** Measured, with the plan followed to the letter (every listed lemma counted as known; the real gate, needing three encounters, will read a little lower): the best are **Luther 1912, Johannes 14 (92.3 %), Johannes 17 (90.8 %), 1 Johannes 5 (89.9 %)**, then two Guerber school-reader stories (*Die drei Schläfer* 89.8 %, *Der Hausvater* 89.4 %); the 28 Guerber stories average 81.6 % (v1) and 77.6 % (v2), the 210 Grimm tales 72 % (the 63 tales under 600 words also 72 %), Heidi 75 %, the great novels 68–75 %. The four modern "bridge" texts are 23–41 words long and need 4–9 lemmas each (animals). Section 5 gives the lemma gaps (Luther's John: a union of 317 lemmas puts every chapter at 92 %, median 24 per chapter; 1 John: 32 lemmas for all five chapters; Guerber v1: 336 lemmas for all 15 stories, median 14 per story) and a fill plan for the b1-bridge.
5. **Size.** 69 units and 50,240 words fit the 45–55 k target only with 16 volume units (11,840 words, 16 % of the vocabulary) next to the 53 core units. **a1 in total (13,150 words) is under the 15 k that `docs/LADDER.md` calls indicative**; three or four more a1 volume units (+1.5 k, no new vocabulary) would close it.
6. **Drafts.** Weg 1 (8 texts, 660 words) is almost on plan in a1-1 (5–14 % off-plan at the mapped units, mostly 02–09); Weg 2 (8, 1,036) belongs to a1-1/a1-2, mostly as outlines (9–30 %); Weg 3 (6, 1,393) is readable only in a2 (5–17 %); Gespräche (6, 650) and Lesungen (4, 682) use regional words (*Brezel, Semmel, Regionalzug, Hausschuhe, Roggenbrot*) and mostly need rewriting. Section 4 maps each of the 32 drafts to the unit where it is readable. The Weg/Gespräche cast (Anna, Paul, Max, Lena, Daniel Miller, Familie Keller) is partly different from Stage 0's (Anna, Lukas, Sam, Marta, Ben); section 1.1 reconciles them.
7. **Names.** The adapter reads *Sam*, *Ben*, *Tim*, *Jan*, *Ute* as nothing, and reads *Marta, Elena, Katharina, Markus, Julia, Stefan, Karla, Müller, Fischer, Hannover, Freiburg* … as common nouns (measured: of 112 first names, surnames, places and biblical names tried, 45 are proper nouns, 62 common nouns and 5 have no reading). The plan uses only names the adapter reads as proper nouns (Anna, Lukas, Thomas, Daniel, Jonas, Michael, Paul, Lena, Max, Sabine, Andreas, Klaus, Maria, Johannes, Martin, Jakob, Ruth, David, Hans, Eva; Weber, Schmidt; Leipzig, Berlin, Dresden, Deutschland, Sachsen) and says so to the drafting agents (section 2.4).
8. **The frame.** A member of a church-planting team in **Leipzig** (a secular city in Sachsen, with an old Gemeinde, a university, trams, a Hauptbahnhof): Sam rents a room from Frau Weber, learns German, joins a small Gemeinde and a team of two married leaders (David and Ruth), meets Anna's family (the Stage 0 cast). Daily life, practical Germany (Anmeldung, Mülltrennung, Hausordnung, Krankenkasse) and church life carry the vocabulary; Scripture is three retellings (5 % of the ladder).

## 1. The starting point: what Stage 0 gives

### 1.1 Size and cast

Stage 0 (`data/stage0/de/`, AI-drafted, unreviewed): 15 scenes (430 running words), 5 sound steps (ei/au/eu/sch/w/ß; ö/ü/ch; z/w/ei/eu and numbers; sp/st/ä and final d/g; long and short vowels, s, j), 4 review steps (re-readings of scenes 04, 07, 12, 13: +118 words, which the gate counts as encounters), 2 exit forms (not exposure). The gate reads **19 head texts, 548 running words, 88 lemma types, 32 tokens of proper nouns and numerals** *(measured)*. Cast: **Sam** (the learner's stand-in, a newcomer), **Anna** (nurse at the clinic, Lukas's sister), **Lukas** (teacher, Anna's brother), **Marta** (grandmother, sells bread at the market, goes to church), **Ben** (her grandson, ten, loses things). The ladder keeps this cast and widens it. Reconciliation with the drafts: in Weg / Gespräche / Lesungen Anna is a mother, Paul her husband, Max the dog (weg-1) or a boy (weg-2), Lena a child, Daniel (Miller) a newcomer like Sam, Familie Keller a host family. The ladder uses: **Anna, Lukas, Marta, Ben** (Stage 0); **Sam** (the newcomer; Daniel Miller of the drafts is a second team member, American, who needs German too); **Frau Weber** (Sam's landlady, 70s, retired; the Weg text *Frau Weber* fits her); **Herr Schmidt** (the baker, 50s); **Pastor Thomas** (the Gemeinde, Sie to strangers, du in the Gemeinde); **David and Ruth** (the team leaders, a married couple from the sending church); **Jonas** (22, apprentice mechanic from the Gemeinde); **Sabine** (Erzieherin in a Kindergarten, Anna's friend); **Eva** (Sam's language teacher); **Paul, Max, Lena** (Paul: Lukas's friend and colleague; Max and Lena: Ben's friends at school; Max is also the dog of one Weg text, rename). Only names the adapter reads as proper nouns appear (section 7.1).

### 1.2 Lemmas

**Met three times or more (62, known to the gate from unit 01):** ich (41), sein (33), der (31), in (23), mögen (17), sam (16), brot (12), gehen (12), kaffee (11), und (10), du (10), es (10), mein (9), gern (9), nicht (9), haus (8), ja (8), kirche (8), auch (7), danke (7), ben (7), heute (7), sehr (7), haben (6), müde (6), er (6), oma (6), reis (6), sonntag (6), wasser (5), trinken (5), schule (5), dein (5), gut (5), kosten (5), hallo (4), heißen (4), bitte (4), was (4), sie (4), mitgehen (4), mit (4), stadt (4), freuen (3), bruder (3), kein (3), nein (3), zu (3), auf (3), arbeiten (3), klinik (3), wo (3), wissen (3), hier (3), morgen (3), ein (3), euro (3), an (3), regnen (3), weil (3), wir (3), lehrer (3).

**Met once or twice (26, need top-up):** schön (2), markt (2), schlüssel (2), tasche (2), verkaufen (2), essen (2), einkaufen (2), geben (2), marta (2), aber (2), bleiben (2), tee (2), wohnen (2), freundin (2), ihr (2), buch (2), tisch (2), bei (2), nach (2), hunger (2), für (2), nichts (2), aufräumen (2), schwester (1), spät (1), abend (1). (*Marta* is read as a common noun, *Anna* and *Lukas* as proper nouns; the three numerals *zwei, drei, zehn* are free.)

### 1.3 Constructions

Stage 0 declares 36 coverage ids (`coverage.json`): **pragmatics** greeting and meeting, politeness, Sie-formal; **constructions** Ich heiße + name, X ist Y, haben + thing, möchte, yes/no questions (verb first), gern + verb, sein + place, sein + state, W-questions, Wo ist …?, Ich weiß nicht, es gibt, gehen + place, nach Hause, weil, aber / und, haben + state (Hunger); **grammar** present ich / du / er-sie, possessives mein / dein / ihr, kein / nicht, accusative and dative only as chunks (keinen Kaffee, im Haus, auf dem Markt), der / die / das, verb second, the separable verb (mitgehen, aufräumen), numbers, days; **orthography** the capital letter of nouns. The adapter's `detectPatterns` *(measured)* fires on 13 keys in the head: `imperative, reflexive-verb, negation-kein, konjunktiv-2, question-verb-first, two-way-preposition, dative-after-preposition, verb-second-inversion, separable-prefix-verb, adjective-ending-strong, es-gibt, verb-final-subordinate, accusative-after-preposition` (`reflexive-verb` comes from *Freut mich*).

### 1.4 What Stage 0 does not give, and the top-up

Not met at all: **plural nouns** (except *Euro*), *kommen, machen, sagen, sehen, lesen, können, müssen, wollen, dürfen, sollen, werden*, the verbs of the daily round, **all past tenses**, *wie, wann, warum, wer, woher*, *von, aus, um, durch, vor, über, unter, neben*, *oder, dass, wenn, denn*, *viel, noch, schon, immer, nie*, the days other than *Sonntag*, all numbers above *zehn*, the clock, every adjective but *müde, gut, schön*, the family beyond *Bruder, Schwester, Oma*, the object pronouns beyond *dich / mich / mir* as chunks. Units 01–15 therefore teach the articles in the plural and with *ein / kein*, the full present, the modal verbs and the first prepositions before anything else.

Top-up (these Stage 0 lemmas are used in the stated unit exactly the stated number of times; each token counts as unknown to the gate; `lemma×n` = n tokens, always 3 − the Stage 0 count): **de-a1-1-01** — wohnen ihr schön aber (4); **de-a1-1-02** — tisch buch schlüssel tasche geben bei für (7); **de-a1-1-03** — schwester×2 marta freundin (4); **de-a1-1-04** — tee essen hunger (3); **de-a1-1-05** — bleiben nichts (2); **de-a1-1-06** — markt verkaufen einkaufen (3); **de-a1-1-07** — spät×2 nach abend×2 (5); **de-a1-1-08** — aufräumen (1). Total 29 tokens.

## 2. Targets per stage

### 2.1 Table

| stage | units | words / unit | stage words | core words | volume words | new lemmas | new / 100 | known lemmas at end | lowest est. cov. (from unit 03) | Scripture share |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| a1-1 | 15 (12+3) | 270–400 | 5,160 | 4,140 | 1,020 | 159 | 3.08 | 247 | 89.1% | 0.0% |
| a1-2 | 16 (13+3) | 400–600 | 7,990 | 6,550 | 1,440 | 243 | 3.04 | 490 | 89.3% | 6.5% |
| a2-1 | 18 (13+5) | 600–900 | 13,990 | 10,110 | 3,880 | 310 | 2.22 | 800 | 90.8% | 6.4% |
| a2-2 | 20 (15+5) | 900–1300 | 23,100 | 17,600 | 5,500 | 312 | 1.35 | 1,112 | 92.2% | 5.2% |

*Core* units carry the vocabulary and the construction; *volume* units ("vol") carry fewer or less central words and exist to give recycling, to vary the domain, to hold draft material and to bring the totals to ~50 k words (in a1 they still carry 2.0–3.6 new lemmas per 100 words, because there is little vocabulary to recycle yet; from a2-1 they carry 0.5–1.9). **The last six units (64–69) are scheduled at 0.4–0.9 new lemmas per 100 words**, for two reasons: the gate does not judge recycling in the last six units, and a1/a2 experience (`docs/audits/B2-SIMULATION.md`) is that a unit that must not use unscheduled words becomes stilted. Their lists are a **minimum**: writers add ordinary words (about 1–2 new lemmas per 100 words) and the units then read at 95–97 %, not at the planned 97–99 %. Lemmas introduced in units 67–69 cannot receive three recycle slots inside the ladder; the b1-bridge begins by re-using them (section 5).

### 2.2 Constructions: the sequence and where the adapter can see it

The owner-agreed order for German: present and the modal verbs → separable verbs → Perfekt → subordinate clauses (weil / dass / wenn / ob) → comparison → Präteritum → reflexive verbs → adjective endings and the dative → relative clauses and the passive → Konjunktiv II and the future → connectors. Case endings are first met as **chunks** (*im Haus, auf dem Markt, keinen Kaffee*) and analysed only when the unit says so.

| order | construction | adapter key (`detectPatterns`) | taught in (unit #) | note |
|---|---|---|---|---|
| 1 | present, sein / haben, du vs Sie, W-questions, verb second | `question-verb-first`, `verb-second-inversion` | Stage 0, 1–9 | no key for the plain present or for W-questions |
| 2 | plural nouns, ein / kein, es gibt, accusative as chunks | `es-gibt`, `negation-kein`, `accusative-after-preposition` | Stage 0, 2, 4, 6 | no key for the bare accusative object |
| 3 | possessives (mein … ihr, unser) | — | 3, 16 | *unser* is first read as the pronoun *wir* when it stands alone (section 7) |
| 4 | separable verbs (steht … auf, fängt … an, ruft … an) | `separable-prefix-verb` | Stage 0, 7, 10, 14, then every unit | a split use is two tokens of one lemma |
| 5 | modal verbs + Infinitiv at the end (Satzklammer) | `modal-infinitive` | 6 (dürfen), 10 (müssen), 11 (können, wollen, sollen) | möchte already in Stage 0 (`konjunktiv-2`) |
| 6 | clock, weekdays, dates, months, ordinals | numerals free; *halb, erst, zweit, dritt* are lemmas | 7, 14, 30, 31 | |
| 7 | imperative (du, ihr, Sie) | `imperative` | Stage 0, 14, 27, 53 | |
| 8 | Perfekt with haben, then sein, then strong verbs | `sentence-bracket-perfect` | 19–23 | the participle of a verb **not in the word list** gets a wrong lemma (section 7) |
| 9 | weil / dass / wenn / ob clauses (verb at the end) | `verb-final-subordinate` | Stage 0 (weil), 17 (wenn), 23 (dass), 50 (ob) | |
| 10 | comparison: größer als, am besten | `comparative-als`, `superlative-am` | 28, 62 | |
| 11 | dative: mir tut … weh, dative verbs, mit / bei / von / zu / nach | `dative-after-preposition`, `dative-object-verb` | Stage 0 chunks, 12, 24, 37 | |
| 12 | Präteritum: war / hatte, modals, then strong verbs in narration | **none** — no detector | 32–33, 35, 45, 59 | the gate's "constructions first met" column will be empty for the Präteritum |
| 13 | reflexive verbs (sich waschen, sich freuen, sich treffen) | `reflexive-verb` (not on the perfect: *hat sich gewaschen* is silent) | Stage 0 (Freut mich), 12, 24, 39–40 | |
| 14 | adjective endings (ein blauer Pullover, der kleine Hund) | `adjective-ending-strong` (Stage 0), `adjective-ending-mixed`, `adjective-ending-weak` | 36 | predicative adjectives earlier (28) |
| 15 | zu-Infinitiv, um … zu, damit | `zu-infinitive`, `um-zu` | 31 (chunks), 53, 57 | |
| 16 | genitive: attribute (des Landes), wegen | `genitive-attribute`, `genitive-preposition` | 44, 68 | von + Dativ in speech earlier |
| 17 | relative clauses | `relative-clause` | 51 | |
| 18 | man; passive (present, then past, state) | `man-impersonal`, `passive`, `passive-past`, `passive-state` | 27 (man), 48, 54, 63 | |
| 19 | Konjunktiv II: polite (könnte, hätte, wäre) and advice (würde, sollte) | `konjunktiv-2`, `konjunktiv-2-wuerde` | Stage 0 (möchte), 49 (chunks), 58, 66, 69 | |
| 20 | Futur I, Plusquamperfekt | `future`, `pluperfect` | 57, 45, 59, 61 | |
| 21 | je … desto; obwohl / trotzdem / deshalb | `je-desto` | 62, 63 | |
| 22 | participial adjectives, nominalised verbs (das Rauchen) | `participial-modifier`, `nominalised-verb` | 63, 54 | |
| 23 | modal particles (doch, mal, ja, eben) | `modal-particle` | 38 | |
| 24 | Konjunktiv I (reported speech) | `konjunktiv-1` | **receptive only**, b1-bridge (news, Luther) | never taught as a paradigm |

### 2.3 Domain mix (running words)

| domain | a1-1 | a1-2 | a2-1 | a2-2 |
|---|---:|---:|---:|---:|
| conversation | 270 (5%) | 400 (5%) | 1,600 (11%) | 2,200 (10%) |
| daily-life | 630 (12%) | 440 (6%) | 760 (5%) | — |
| family | 300 (6%) | — | — | 1,000 (4%) |
| food | 650 (13%) | — | — | — |
| community | 680 (13%) | — | — | 1,120 (5%) |
| work | 360 (7%) | 600 (8%) | 850 (6%) | 1,150 (5%) |
| travel | 370 (7%) | 460 (6%) | 780 (6%) | 2,340 (10%) |
| church-and-mission-life | 380 (7%) | 540 (7%) | 790 (6%) | 1,150 (5%) |
| health | 380 (7%) | 520 (7%) | 820 (6%) | 1,180 (5%) |
| narrative | 350 (7%) | 1,880 (24%) | 1,300 (9%) | 1,200 (5%) |
| practical-communication | 390 (8%) | — | 730 (5%) | 1,080 (5%) |
| testimony | 400 (8%) | — | — | 2,250 (10%) |
| explanation | — | 970 (12%) | 620 (4%) | 1,260 (5%) |
| scripture | — | 520 (7%) | 890 (6%) | 1,210 (5%) |
| biography | — | 540 (7%) | 1,500 (11%) | 1,290 (6%) |
| instructions | — | 540 (7%) | 900 (6%) | 1,040 (5%) |
| correspondence | — | 580 (7%) | 1,580 (11%) | 1,300 (6%) |
| contemporary-nonfiction | — | — | 870 (6%) | 2,330 (10%) |

"Scripture" means a retelling of a biblical text written for the course (units 25, 45, 59), never a quotation of Luther. Church and mission life, testimony and prayer vocabulary are separate domains and are **not** counted as Scripture. The Scripture share is 0–7 % per stage, under the gate's 40 % and the owner's 10 %. Domains the owner asked for and where they are: daily life, conversation, narrative, practical communication (notices, forms, Hausordnung, Anmeldung), biography (Frau Weber, a missionary couple, a nurse), instructions (recipe, directions, registering), correspondence (invitations, group chat, letter, weekly report), simple nonfiction about Germany (Germany in facts, Mülltrennung, neighbourhood news), church life, testimony language.

### 2.4 What every unit must obey

1. **Budget.** Introduce exactly the new lemmas listed, each exactly **three tokens** in the unit; use no content lemma outside Stage 0, the earlier units' lists and the unit's own list, **except** ordinary words a native writer cannot avoid (one or two per hundred words in a1-1 and a1-2, two or three per hundred from a2-1 on; the est. cov. column leaves room, and in the last six units the list is a minimum, section 2.1). Inflections of a listed lemma are free **only if the lemma is in the adapter's word list**; a word marked † may not be inflected in the unit more than the plan needs (use the form the plan lists, and the plural only if the plan says so) until the word list has it (section 6).
2. **Recycle.** Use every lemma on the unit's "recycle" list at least once (it is the third encounter of lemmas introduced in the previous six units; the assignment is by theme overlap and load). Function words (articles, pronouns, prepositions, conjunctions, particles) are listed as new where they are new but need no recycle slot.
3. **Tokens, not uses.** The gate counts running words. A separable verb in a main clause is **two tokens of one lemma** (*Sam steht früh auf*: `steht` and `auf` are both `aufstehen`). A new separable verb (marked ˘) is therefore exactly met by *one split main-clause use + one infinitive or participle* (2 + 1 = 3 tokens), or by one infinitive, one participle and one subordinate-clause use (3 tokens); two split uses are four tokens. The same holds for *anrufen, mitkommen, einladen* and the rest.
4. **Compounds are lemmas.** *Krankenhaus*, *Straßenbahn*, *Wochenbericht* are each one new lemma; their parts are not credited and the parts are not "free". Do not introduce a compound without the plan listing it; do not replace a listed compound by its parts.
5. **Nominalised adjectives and participles are separate lemmas** (*der Kranke* ≠ *krank*, *der Deutsche* ≠ *deutsch*, *der Fremde* ≠ *fremd*). Use them only where the plan lists them. *Deutsch* (the language) and *deutsch* share a lemma after lower-casing.
6. **Names and numerals.** Proper nouns and numerals are free *if the adapter reads them as such*: use only the names in section 1.1 and these cities and countries: Leipzig, Berlin, Dresden, Hamburg, München, Köln, Frankfurt, Stuttgart, Deutschland, Österreich, Sachsen, Europa, USA (not Hannover, Bremen, Erfurt, Halle, Jena, Freiburg, Amerika). *Sam* and *Ben* are lemmas known from Stage 0; *Marta* is a top-up item in 03. Numerals are taught on the way: 1–20 and ages (03), prices to 100 (06), the clock (07), dates and months (30), years (26), hundreds and thousands (44).
7. **Variety.** Standard German (Germany). **Sie** for Frau Weber, Herr Schmidt, officials, the doctor and strangers; **du** among the team, in the Gemeinde (Pastor Thomas is Thomas), among the neighbours of Sam's age and with children. Regional words (*Brötchen*, *Semmel*, *Schrippe*, *Brezel*, *Abendbrot*) only where the plan lists them; Swiss and Austrian forms never. Older spellings never (*dass*, *Tür*, never *daß*, *Thür*).
8. **Sentence length.** Mean ≤ 7 words in a1-1, ≤ 9 in a1-2, ≤ 12 in a2-1, ≤ 15 in a2-2; one clause per sentence in a1-1 (weil-clauses only as chunks); the verb bracket (Satzklammer) is taught with modal + infinitive in a1-1 and the Perfekt in a1-2, never with more than two inserted elements before a2-2.
9. **Domains and register.** Follow the unit's domain; keep the cast; texts are for adults on a mission team (no children's register apart from Ben's units). Scripture units retell, no quotation.
10. **Provenance.** Each unit is a `controlled` document under `data/ladder/de/units/`, corpus id `ladder-de`, `pipeline.state: "machine-draft"`, `variety: "de-DE"`, review checklist ready, one English line per sentence; the German usage points (du/Sie choices, regional words, church vocabulary of the Freikirchen vs the Landeskirche) are listed in the unit's `review.notes` for the native reviewer.

### 2.5 How the vocabulary schedule was chosen (measured)

The schedule is a hand-made list of about 1,020 lemmas in teaching order, built from three kinds of evidence and then corrected against them:

1. **Frequency of the easiest published texts.** Share of the running words covered by the *n* most frequent lemmas of the text group itself (the best any list of *n* lemmas can do; first reading, proper nouns and numerals known):

| group | words | lemma types | 100 | 200 | 300 | 500 | 700 | 1,000 | 1,300 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Guerber vol. 1 (15 stories) | 20,019 | 1,340 | 69.3 | 80.8 | 86.7 | 92.7 | 95.9 | 98.3 | 99.8 |
| Guerber vol. 2 (13 stories) | 27,961 | 2,537 | 63.0 | 72.7 | 78.4 | 85.1 | 88.9 | 92.6 | 95.0 |
| Luther 1912, Johannes (21 chapters) | 18,082 | 1,212 | 77.8 | 86.4 | 90.7 | 94.9 | 97.1 | 98.8 | — |
| Luther 1912, Markus (16 chapters) | 14,084 | 1,417 | 72.1 | 81.0 | 85.7 | 91.1 | 94.3 | 97.0 | 99.2 |
| Grimm, the 63 tales under 600 words | 19,075 | 2,866 | 60.0 | 68.5 | 73.5 | 79.9 | 84.0 | 88.1 | 91.2 |

   Reading: a text of 1,000–1,400 lemma types is covered at 92 % by about 500 of its own lemmas (Guerber vol. 1, Johannes, Markus), but a list of *modern* daily-life lemmas does not coincide with them: the plan's ~1,100 lemmas reach 81.6 % of Guerber vol. 1 and 83 % of Johannes, not 98 %. The 15–17 points between are the vocabulary of old stories and of the Bible (section 5), which the plan leaves to the b1-bridge on purpose.

2. **A first-pass gap check.** The first version of the list (a1 and a2 chosen by topic) covered only 67 % of the tokens of Guerber vol. 1 and of Johannes and 80 % of the Weg drafts. The most frequent missing lemmas were the closed-class basics (*sagen, werden, sich, von, aus, so, da, aber, wieder, denn, doch, dieser, sollen, lassen, nichts, ganz, nun, einmal, nie*) and a few everyday verbs and adjectives (*kennen, halten, fragen, bekommen, beginnen, ziehen, lachen, weinen, neu, schlecht, richtig, falsch, früh, traurig, glücklich*). These were moved into units 01–32 and the list was trimmed elsewhere (niche nouns such as *Zebrastreifen, Radweg, Dienstplan, Überstunde, Pflegeschule* were dropped) so that the total stayed near 1,000.
3. **A list of 446 general-frequency German words** written from memory (articles, pronouns, about 100 verbs, adjectives, adverbs, time words) was checked against the schedule: 109 were not on it; about 45 of these are inflected forms of free or scheduled lemmas (*die, das, ist, hat, sind, war, kann, seine, ihre, zwei, jahren, neuen*), and about 60 were real gaps. The ones that matter for A1–A2 daily life were added (*dort, oben, unten, hinten, früh, sehen, Mädchen, kennen, halten, Zeit, Tag*); the rest (*hassen, fliegen, schlagen, gewinnen, erreichen, benutzen, verwenden, zählen, rechnen, tief, breit, schmal, hässlich, schwach, nötig, her, hin, herein, hinaus, hinein, überall, ziemlich, selten, vorher, nachher, ungefähr*) are left to the allowance for unscheduled ordinary words (section 2.4, rule 1) and to the b1-bridge.

Every lemma was then run through the adapter (in the frame *Das ist X.* or *Wir wollen X.*): it must be read as itself (first candidate), not already seen in Stage 0, and not duplicated. 156 are read by rule, not from the word list (†, section 6), two more are read wrongly or not at all (*weh*, *kaputt*), and about 20 candidate words were replaced because the adapter read them as another lemma (*Meister, Plan, Herde, Wiese, Nächste, Rate, Schulden, dringend, entfernt, Fremder*; the bare *Gebet* and *Reise* are traps only outside a sentence) or not at all (*blond, streng, klettern, basteln, einsam, verantwortlich, ansteckend, ungern, anstrengend*).

## 3. The units

### 3.1 Table

"New" counts include † words (not in the word list). "Est. cov." = 1 − (3 × new + top-up tokens) / words *(planned, not measured)*. Units 01–02 are allowed the policy's lower band (warn 85 %, error 78 %); the plan plans them at 88–89 % and does not need it. `kind` is `controlled` for every unit; "absorbs" names the existing draft(s) whose content the writer takes over (section 4).

| id | # | kind | words | domain | title | new | / 100 | est. cov. | main construction | absorbs |
|---|---:|---|---:|---|---|---:|---:|---:|---|---|
| de-a1-1-01 | 1 | core | 270 | conversation | Meeting in the street | 9 | 3.3 | 89% | du vs Sie questions | — |
| de-a1-1-02 | 2 | core | 280 | daily-life | Sam's room | 9 | 3.2 | 88% | es gibt + Akkusativ | weg-1-01, weg-1-04 |
| de-a1-1-03 | 3 | core | 300 | family | A family photograph | 9 | 3.0 | 90% | possessives mein / dein / sein / ihr / unser | — |
| de-a1-1-04 | 4 | core | 320 | food | Breakfast at the bakery café | 10 | 3.1 | 90% | möchten / nehmen + Akkusativ | weg-1-03, weg-1-05, gespraeche-1-02 |
| de-a1-1-05 | 5 | vol | 330 | food | Sunday lunch | 10 | 3.0 | 90% | recycling | weg-1-08 |
| de-a1-1-06 | 6 | core | 340 | community | At the market | 10 | 2.9 | 90% | numbers 40–100 | weg-2-02, deutschland-lesungen-1-03 |
| de-a1-1-07 | 7 | core | 350 | daily-life | Lukas's school day | 11 | 3.1 | 89% | telling the time | — |
| de-a1-1-08 | 8 | core | 360 | work | Who works where | 11 | 3.1 | 91% | ganzes Präsens | — |
| de-a1-1-09 | 9 | vol | 340 | community | A Sunday morning on the street | 9 | 2.6 | 92% | recycling | weg-1-06 |
| de-a1-1-10 | 10 | core | 370 | travel | The tram to the Hauptbahnhof | 11 | 3.0 | 91% | müssen + Infinitiv | weg-2-01 |
| de-a1-1-11 | 11 | core | 380 | church-and-mission-life | The team meeting | 12 | 3.2 | 91% | können / wollen + Infinitiv | — |
| de-a1-1-12 | 12 | core | 380 | health | Ben is sick | 12 | 3.2 | 91% | wehtun / mir ist … | weg-2-05 |
| de-a1-1-13 | 13 | vol | 350 | narrative | Ben's lost school bag | 11 | 3.1 | 91% | recycling | weg-2-07 |
| de-a1-1-14 | 14 | core | 390 | practical-communication | A message and a notice | 12 | 3.1 | 91% | weekdays | weg-2-03 |
| de-a1-1-15 | 15 | core | 400 | testimony | Sam's first testimony | 13 | 3.3 | 90% | ich + present for belief and feeling | — |
| de-a1-2-01 | 16 | core | 400 | conversation | "Was machst du gerade?" | 14 | 3.5 | 90% | Präsens for "now" | gespraeche-1-01, gespraeche-1-04 |
| de-a1-2-02 | 17 | core | 410 | explanation | Summer, winter: the seasons in Leipzig | 14 | 3.4 | 90% | weather expressions | — |
| de-a1-2-03 | 18 | vol | 420 | narrative | A rainy Saturday | 15 | 3.6 | 89% | recycling | weg-2-08 |
| de-a1-2-04 | 19 | core | 440 | daily-life | Yesterday after work | 15 | 3.4 | 90% | Perfekt with haben | weg-2-04 |
| de-a1-2-05 | 20 | core | 460 | travel | By train to Dresden | 16 | 3.5 | 90% | Perfekt with sein | deutschland-lesungen-1-01 |
| de-a1-2-06 | 21 | core | 480 | narrative | Anna's weekend in Berlin | 14 | 2.9 | 91% | Perfekt with strong verbs | — |
| de-a1-2-07 | 22 | vol | 480 | narrative | Last weekend | 16 | 3.3 | 90% | recycling | weg-1-02 |
| de-a1-2-08 | 23 | core | 500 | narrative | Sam's first week | 17 | 3.4 | 90% | Perfekt in narration | deutschland-lesungen-1-04 |
| de-a1-2-09 | 24 | core | 520 | health | At the doctor's | 14 | 2.7 | 92% | sollen / müssen + Infinitiv | — |
| de-a1-2-10 | 25 | core | 520 | scripture | The lost sheep (Luke 15) | 14 | 2.7 | 92% | narrative present | — |
| de-a1-2-11 | 26 | core | 540 | biography | Frau Weber's life | 16 | 3.0 | 91% | Perfekt + present biography | weg-2-06 |
| de-a1-2-12 | 27 | core | 540 | instructions | How to make potato soup | 15 | 2.8 | 92% | Imperativ | — |
| de-a1-2-13 | 28 | core | 560 | explanation | Describing people and places | 17 | 3.0 | 91% | Komparativ + als | — |
| de-a1-2-14 | 29 | vol | 540 | church-and-mission-life | A service through Ben's eyes | 12 | 2.2 | 93% | recycling | deutschland-lesungen-1-02 |
| de-a1-2-15 | 30 | core | 580 | correspondence | Invitations and the calendar | 18 | 3.1 | 91% | months and ordinal dates | gespraeche-1-06 |
| de-a1-2-16 | 31 | core | 600 | work | Jonas looks for work | 16 | 2.7 | 92% | Perfekt + present in an interview | — |
| de-a2-1-01 | 32 | core | 600 | biography | "Als ich ein Kind war" | 17 | 2.8 | 92% | Präteritum of sein / haben | weg-1-07 |
| de-a2-1-02 | 33 | core | 620 | explanation | Our neighbourhood before and now | 19 | 3.1 | 91% | Präteritum of modals | — |
| de-a2-1-03 | 34 | vol | 620 | narrative | Grandmother's night story | 12 | 1.9 | 94% | recycling | weg-3-06 |
| de-a2-1-04 | 35 | core | 680 | narrative | The night of the storm | 19 | 2.8 | 92% | Präteritum of regular and strong verbs in narration | — |
| de-a2-1-05 | 36 | core | 700 | conversation | Buying clothes | 21 | 3.0 | 91% | adjective endings after ein / der | — |
| de-a2-1-06 | 37 | core | 730 | practical-communication | Asking, telling, lending | 19 | 2.6 | 92% | Dativ and Akkusativ objects | — |
| de-a2-1-07 | 38 | vol | 700 | correspondence | The team's group chat | 12 | 1.7 | 95% | recycling | — |
| de-a2-1-08 | 39 | core | 760 | daily-life | Ben's morning | 19 | 2.5 | 93% | reflexive verbs | — |
| de-a2-1-09 | 40 | core | 790 | church-and-mission-life | Getting ready for church | 15 | 1.9 | 94% | reflexive verbs with all persons | gespraeche-1-05, weg-3-05 |
| de-a2-1-10 | 41 | core | 820 | health | At the pharmacy and the health insurance | 21 | 2.6 | 92% | advice with sollen / müssen / dürfen | — |
| de-a2-1-11 | 42 | vol | 780 | travel | A delayed train | 12 | 1.5 | 95% | recycling | weg-3-03 |
| de-a2-1-12 | 43 | core | 850 | work | A day in the workshop and in the Kindergarten | 18 | 2.1 | 94% | all past tenses at work | — |
| de-a2-1-13 | 44 | core | 870 | contemporary-nonfiction | Germany in facts | 22 | 2.5 | 92% | description in the present | — |
| de-a2-1-14 | 45 | core | 890 | scripture | The son who left (Luke 15) | 21 | 2.4 | 93% | long Präteritum narrative | weg-3-04 |
| de-a2-1-15 | 46 | vol | 880 | correspondence | A letter abroad | 10 | 1.1 | 97% | recycling | weg-3-02 |
| de-a2-1-16 | 47 | core | 900 | biography | A missionary couple | 23 | 2.6 | 92% | all past tenses | — |
| de-a2-1-17 | 48 | core | 900 | instructions | How it is done | 22 | 2.4 | 93% | man + Präsens | — |
| de-a2-1-18 | 49 | vol | 900 | conversation | Renting a room | 8 | 0.9 | 97% | recycling | — |
| de-a2-2-01 | 50 | core | 900 | conversation | Making plans and giving reasons | 23 | 2.6 | 92% | ob / dass / weil / wenn in one conversation | — |
| de-a2-2-02 | 51 | core | 950 | testimony | Small-group testimonies | 19 | 2.0 | 94% | Relativsätze | — |
| de-a2-2-03 | 52 | vol | 1000 | family | A long phone call | 5 | 0.5 | 99% | recycling | — |
| de-a2-2-04 | 53 | core | 1040 | instructions | Directions and forms | 27 | 2.6 | 92% | imperatives with Sie and du | gespraeche-1-03 |
| de-a2-2-05 | 54 | core | 1080 | practical-communication | Notices, rules, recipes | 22 | 2.0 | 94% | Passiv | — |
| de-a2-2-06 | 55 | core | 1120 | community | The neighbourhood meeting | 18 | 1.6 | 95% | Relativsätze with Akkusativ / Dativ | — |
| de-a2-2-07 | 56 | vol | 1050 | contemporary-nonfiction | Neighbourhood news | 7 | 0.7 | 98% | recycling | — |
| de-a2-2-08 | 57 | core | 1150 | church-and-mission-life | Planning the next outreach | 21 | 1.8 | 95% | damit / um … zu | — |
| de-a2-2-09 | 58 | core | 1180 | health | If you have a fever | 19 | 1.6 | 95% | Konjunktiv II for advice | — |
| de-a2-2-10 | 59 | core | 1210 | scripture | The Good Samaritan | 18 | 1.5 | 96% | Präteritum narration | — |
| de-a2-2-11 | 60 | vol | 1100 | travel | A traveller's blog | 8 | 0.7 | 98% | recycling | — |
| de-a2-2-12 | 61 | core | 1240 | travel | Diary of the mission trip | 24 | 1.9 | 94% | während / nachdem / bevor | — |
| de-a2-2-13 | 62 | core | 1260 | explanation | Opinions and comparisons | 25 | 2.0 | 94% | je … desto | — |
| de-a2-2-14 | 63 | core | 1280 | contemporary-nonfiction | Why Germans sort their rubbish | 17 | 1.3 | 96% | obwohl / deshalb / trotzdem | — |
| de-a2-2-15 | 64 | vol | 1150 | work | Interview with a nurse | 9 | 0.8 | 98% | recycling | — |
| de-a2-2-16 | 65 | core | 1290 | biography | A nurse's life | 9 | 0.7 | 98% | all past tenses | — |
| de-a2-2-17 | 66 | core | 1300 | conversation | A loan, politely | 9 | 0.7 | 98% | Konjunktiv II | — |
| de-a2-2-18 | 67 | vol | 1200 | narrative | The key that came back | 10 | 0.8 | 98% | recycling | weg-3-01 |
| de-a2-2-19 | 68 | core | 1300 | correspondence | The weekly report | 11 | 0.8 | 97% | formal register | — |
| de-a2-2-20 | 69 | core | 1300 | testimony | Why I came to Germany | 11 | 0.8 | 97% | all tenses | — |

### 3.2 Unit by unit

Format: situation; **new** lemmas (the lemma as the adapter spells it, lower-cased by the gate; † = not in the word list, ˘ = separable verb; function words are listed with the others and need no recycle slot); **Stage 0 top-up**; **recycle** (lemmas introduced in the previous six units that this unit uses at least once: every new content lemma is assigned to three of the following six units; the most recycles per 100 words in any unit is 8.6); focus; expected construction keys; cast; drafts. Lemmas introduced in units 67, 68 and 69 get only two, one and no recycle slots (the b1-bridge recycles them).

#### de-a1-1-01 · #1 · core · conversation · 270 words · est. cov. 89% · Meeting in the street
- **Situation.** Sam meets Frau Weber (Sie) and Anna (du) in the street in Leipzig: greetings by time of day, "Wie ist Ihr Name?" / "Wie heißt du?", where are you from, where do you live, "Sprechen Sie Deutsch?"
- **New (9).** wie woher kommen aus Frau Herr Name sprechen deutsch *(function words, no recycle slot: aus)*
- **Stage 0 top-up (4 tokens).** wohnen ihr schön aber
- **Recycle (0).** nothing to recycle yet
- **Focus.** du vs Sie questions, verb in second place, W-questions, ich komme aus … / ich wohne in ….
- **Cast.** Sam, Frau Weber, Anna

#### de-a1-1-02 · #2 · core · daily-life · 280 words · est. cov. 88% · Sam's room
- **Situation.** Sam's rented room at Frau Weber's: what there is in each room (es gibt), where things are (auf, an, in + Dativ); size and position
- **New (9).** Zimmer Bett Fenster Küche Bad groß klein Stuhl da
- **Stage 0 top-up (7 tokens).** tisch buch schlüssel tasche geben bei für
- **Recycle (4).** wie kommen Herr deutsch
- **Focus.** es gibt + Akkusativ, ein / eine / kein, sein + Adjektiv, location with in / auf / an.
- **Cast.** Sam, Frau Weber
- **Draft.** weg-1-01 (Ich bin Anna; 10 % off-plan here: as-is with small changes); weg-1-04 (Das Haus; 9 % off-plan here: as-is with small changes)

#### de-a1-1-03 · #3 · core · family · 300 words · est. cov. 90% · A family photograph
- **Situation.** Anna shows Sam a family photograph: who is who, ages ("Mein Vater ist 58 Jahre alt"), whose house this is
- **New (9).** Familie Vater Mutter Tochter Jahr alt Kind von Bild *(function words, no recycle slot: von)*
- **Stage 0 top-up (4 tokens).** schwester×2 marta freundin
- **Recycle (7).** wie kommen Herr sprechen Fenster Bad klein
- **Focus.** possessives mein / dein / sein / ihr / unser, sein + relation, numbers 1–40 and ages.
- **Cast.** Anna, Lukas, Marta, Ben, Sam

#### de-a1-1-04 · #4 · core · food · 320 words · est. cov. 90% · Breakfast at the bakery café
- **Situation.** Breakfast at a Bäckerei with a Café corner: "Was möchten Sie?", a Brötchen with Käse, Ei, Butter and Marmelade; "ich nehme …", "ich habe Hunger"
- **New (10).** Frühstück Brötchen Ei Butter Käse Milch nehmen oder ganz Tag *(function words, no recycle slot: oder)*
- **Stage 0 top-up (3 tokens).** tee essen hunger
- **Recycle (11).** wie kommen Herr sprechen Zimmer Küche klein da Vater Tochter alt
- **Focus.** möchten / nehmen + Akkusativ, polite requests, Akkusativ of ein / eine, oder-questions.
- **Cast.** Sam, Anna, Herr Schmidt (baker)
- **Draft.** weg-1-03 (Lena hat Hunger; 10 % off-plan here: as-is with small changes); weg-1-05 (Das Frühstück; 6 % off-plan here: as-is with small changes); gespraeche-1-02 (Beim Bäcker; 33 % off-plan here: outline only)

#### de-a1-1-05 · #5 · vol · food · 330 words · est. cov. 90% · Sunday lunch
- **Situation.** Sunday lunch at Marta's: soup, potatoes, meat, salad; who cooks, what tastes good; Marta serves, Ben complains
- **New (10).** Mittagessen Suppe Kartoffel Fleisch lecker kochen so Kuchen Mama Papa
- **Stage 0 top-up (2 tokens).** bleiben nichts
- **Recycle (17).** woher Frau Name sprechen Bett Bad klein da Vater Tochter alt Bild Frühstück Brötchen Butter nehmen Tag
- **Focus.** recycling (food, family); schmecken-free: "Das ist lecker".
- **Cast.** Marta, Ben, Anna, Lukas, Sam
- **Draft.** weg-1-08 (Der Abend; 11 % off-plan here: needs a pass)

#### de-a1-1-06 · #6 · core · community · 340 words · est. cov. 90% · At the market
- **Situation.** Sam at the Wochenmarkt: kilos and prices, "Darf es sonst noch etwas sein?", "Wie viel kostet das?", counting money to 100 euros
- **New (10).** kaufen Kilo Tomate Apfel Preis viel zusammen alle dürfen etwas *(function words, no recycle slot: viel, alle, etwas)*
- **Stage 0 top-up (3 tokens).** markt verkaufen einkaufen
- **Recycle (18).** woher Frau Name deutsch Fenster Bad groß Stuhl Familie Mutter Jahr Bild Käse ganz Suppe lecker Kuchen Papa
- **Focus.** numbers 40–100, dürfen in polite questions, plural nouns with -n / -e / ¨-e, viel / wenig. Keys first met (expected): `modal-infinitive (dürfen)`.
- **Cast.** Sam, Marta, Herr Schmidt
- **Draft.** weg-2-02 (Auf dem Markt; 30 % off-plan here: outline only); deutschland-lesungen-1-03 (Beim Bäcker und auf dem Markt; 45 % off-plan here: outline only)

#### de-a1-1-07 · #7 · core · daily-life · 350 words · est. cov. 89% · Lukas's school day
- **Situation.** Lukas's day at school: times of day, the lessons, break; separable verbs aufstehen, anfangen; the learner meets the hour
- **New (11).** um Uhr Stunde Klasse Schüler Pause anfangen˘ aufstehen˘ lernen sagen halb *(function words, no recycle slot: um)*
- **Stage 0 top-up (5 tokens).** spät×2 nach abend×2
- **Recycle (19).** woher Frau Name deutsch Zimmer Bett Fenster Küche groß Stuhl da Kind Käse nehmen Mittagessen lecker so Papa zusammen
- **Focus.** telling the time (um sieben Uhr), separable verbs (steht … auf, fängt … an), dann + verb-second.
- **Cast.** Lukas, Ben, Sam

#### de-a1-1-08 · #8 · core · work · 360 words · est. cov. 91% · Who works where
- **Situation.** Who does what job: Anna is a Krankenschwester, Lukas a Lehrer, Herr Schmidt a Bäcker, Thomas a Pastor, Sam a Student of German; where they work
- **New (11).** Beruf Arzt Bäcker Student Pastor Krankenschwester machen Chef als wer Mann *(function words, no recycle slot: als, wer)*
- **Stage 0 top-up (1 tokens).** aufräumen
- **Recycle (19).** Zimmer Bett Küche groß Stuhl Familie Mutter Jahr Kind Ei Milch ganz Kartoffel kochen Mama Preis Uhr Schüler aufstehen
- **Focus.** ganzes Präsens (ich, du, er/sie, wir, ihr, sie/Sie), Beruf without article (Er ist Bäcker), Was machst du?.
- **Cast.** Anna, Lukas, Herr Schmidt, Thomas, Sam

#### de-a1-1-09 · #9 · vol · community · 340 words · est. cov. 92% · A Sunday morning on the street
- **Situation.** A quiet Sunday morning on the street and in the park: the weather, who is out, church bells, people walking to church
- **New (9).** Straße Park Wetter Sonne warm kalt immer wieder dann
- **Stage 0 top-up (0 tokens).** none
- **Recycle (21).** Familie Vater Mutter Tochter Jahr alt Kind Bild Frühstück Brötchen Ei Butter Milch Tag Fleisch so Mama kaufen Kilo Tomate sagen
- **Focus.** recycling (street, greetings, weather); es ist + Adjektiv.
- **Cast.** Sam, Frau Weber, Marta, Ben
- **Draft.** weg-1-06 (Paul geht in die Stadt; 14 % off-plan here: needs a pass)

#### de-a1-1-10 · #10 · core · travel · 370 words · est. cov. 91% · The tram to the Hauptbahnhof
- **Situation.** Sam takes the Straßenbahn to the Hauptbahnhof to collect a friend: line, stop, ticket, times, "Wie komme ich zum Bahnhof?", leaving and arriving
- **New (11).** Straßenbahn Bahnhof Zug Fahrkarte fahren Haltestelle Minute müssen ankommen˘ abfahren˘ bis *(function words, no recycle slot: bis)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (24).** Frühstück Brötchen Ei Butter Käse Milch nehmen ganz Tag Mittagessen Suppe Kartoffel Fleisch kochen Kuchen Apfel dürfen Klasse anfangen halb Arzt Student Krankenschwester Mann
- **Focus.** müssen + Infinitiv (Satzklammer), fahren (a → ä), nach / zu + place, separable verbs ankommen / abfahren. Keys first met (expected): `modal-infinitive (müssen)`.
- **Cast.** Sam, Anna
- **Draft.** weg-2-01 (Am Morgen; 13 % off-plan here: needs a pass)

#### de-a1-1-11 · #11 · core · church-and-mission-life · 380 words · est. cov. 91% · The team meeting
- **Situation.** Sam's mission team meets on Wednesday at the Gemeinde: week plan, who can help, songs for Sunday, 'Wir wollen …', 'Kannst du …?'
- **New (12).** Gemeinde Gottesdienst beten Bibel singen Lied helfen können wollen Woche Freund sollen
- **Stage 0 top-up (0 tokens).** none
- **Recycle (25).** Mittagessen Suppe Kartoffel Fleisch lecker kochen so Kuchen Mama Papa kaufen Kilo Tomate Apfel Preis zusammen dürfen Stunde Pause lernen machen Straße Sonne immer abfahren
- **Focus.** können / wollen + Infinitiv, Fragen mit Modalverb, Bitte um Hilfe.
- **Cast.** Sam, Thomas, David, Ruth

#### de-a1-1-12 · #12 · core · health · 380 words · est. cov. 91% · Ben is sick
- **Situation.** Ben is ill: head, stomach, throat, fever, cough; Marta calls Anna; 'Mir ist heiß', 'Der Kopf tut weh', staying home in bed
- **New (12).** krank Kopf Bauch Hals tun weh Fieber Tablette gesund brauchen sich legen *(function words, no recycle slot: sich)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (25).** kaufen Kilo Tomate Apfel Preis zusammen dürfen Uhr Stunde Klasse Schüler Pause anfangen aufstehen lernen sagen halb Beruf Bäcker Pastor Chef Wetter kalt dann Woche
- **Focus.** wehtun / mir ist …, brauchen + Akkusativ, Dativ mir / dir / ihm as fixed phrases.
- **Cast.** Ben, Marta, Anna
- **Draft.** weg-2-05 (Lena ist krank; 17 % off-plan here: outline only)

#### de-a1-1-13 · #13 · vol · narrative · 350 words · est. cov. 91% · Ben's lost school bag
- **Situation.** Ben has lost his Rucksack; he looks in the house and at school; Lukas helps; where is it, under, next to, behind
- **New (11).** suchen finden verlieren liegen Rucksack† Heft unter neben hinter stehen sehen *(function words, no recycle slot: unter, neben, hinter)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (26).** Uhr Stunde Klasse Schüler Pause anfangen aufstehen lernen sagen halb Beruf Arzt Bäcker Student Pastor Krankenschwester machen Chef Mann Park warm wieder Freund tun Fieber brauchen
- **Focus.** recycling (Dativ locations, tasche / schlüssel); finden / suchen + Akkusativ.
- **Cast.** Ben, Lukas, Marta
- **Draft.** weg-2-07 (Wo ist mein Buch?; 15 % off-plan here: needs a pass)

#### de-a1-1-14 · #14 · core · practical-communication · 390 words · est. cov. 91% · A message and a notice
- **Situation.** Messages on the phone and a notice on the church door: day, time, place; "Ruf mich an!", writing the date, an appointment
- **New (12).** Montag Dienstag Mittwoch Donnerstag Freitag Samstag Nachricht Handy anrufen˘ schreiben Termin doch
- **Stage 0 top-up (0 tokens).** none
- **Recycle (28).** Beruf Arzt Bäcker Student Pastor Krankenschwester machen Chef Mann Straße Park Wetter Sonne warm kalt immer wieder dann Straßenbahn Bahnhof Zug Fahrkarte fahren Haltestelle Minute müssen ankommen gesund
- **Focus.** weekdays, Imperativ (du / Sie), the date and "am" + Tag, anrufen / schreiben.
- **Cast.** Sam, Thomas, Anna
- **Draft.** weg-2-03 (Ein Anruf; 16 % off-plan here: outline only)

#### de-a1-1-15 · #15 · core · testimony · 400 words · est. cov. 90% · Sam's first testimony
- **Situation.** Sam says in four minutes in German at the Hauskreis who he is, what he believed before and what he believes now; simple present
- **New (13).** glauben Gott Leben Liebe lieben danken Herz früher jetzt Christ froh Freude nie
- **Stage 0 top-up (0 tokens).** none
- **Recycle (30).** Straße Park Wetter Sonne warm kalt immer wieder dann Straßenbahn Bahnhof Zug Fahrkarte fahren Haltestelle Minute müssen ankommen abfahren Gemeinde Gottesdienst beten Bibel singen Lied helfen können wollen sollen doch
- **Focus.** ich + present for belief and feeling, früher / jetzt contrast, glauben + an + Akkusativ (as chunk).
- **Cast.** Sam, Thomas

#### de-a1-2-01 · #16 · core · conversation · 400 words · est. cov. 90% · "Was machst du gerade?"
- **Situation.** A phone call and a chat: what are you doing now, "Ich lese gerade", "Ich telefoniere noch", plans for the evening
- **New (14).** gerade lesen spielen schlafen telefonieren hören Musik noch schon nur bald unser Zeit tschüs *(function words, no recycle slot: unser)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (30).** Straßenbahn Bahnhof Zug Fahrkarte fahren Haltestelle Minute müssen ankommen abfahren Gemeinde Gottesdienst beten Bibel singen Lied helfen können wollen Woche Freund sollen krank Kopf Bauch Hals weh Tablette legen sehen
- **Focus.** Präsens for "now" (gerade), noch / schon / nur, Frage mit Verb an erster Stelle.
- **Cast.** Sam, Anna
- **Draft.** gespraeche-1-01 (Hallo, ich bin Daniel; 16 % off-plan here: outline only); gespraeche-1-04 (Am Telefon; 19 % off-plan here: outline only)

#### de-a1-2-02 · #17 · core · explanation · 410 words · est. cov. 90% · Summer, winter: the seasons in Leipzig
- **Situation.** What the weather is like in each season; clothes; what people do; "Wenn es kalt ist, …"
- **New (14).** Jahreszeit Frühling Sommer Herbst Winter Schnee Wind Grad heiß Regen scheinen wenn werden denn *(function words, no recycle slot: wenn, denn)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (33).** Gemeinde Gottesdienst beten Bibel singen Lied helfen können wollen Woche Freund sollen krank Kopf Bauch Hals tun weh Fieber Tablette gesund brauchen legen suchen finden verlieren liegen Rucksack Heft stehen hören schon Zeit
- **Focus.** weather expressions, wenn-Satz (verb at the end), Monate vorbereitend (Jahreszeiten).
- **Cast.** Sam, Lukas, Ben

#### de-a1-2-03 · #18 · vol · narrative · 420 words · est. cov. 89% · A rainy Saturday
- **Situation.** A rainy Saturday: cinema or at home, a film, pizza, an umbrella, Ben and Lukas
- **New (15).** Wochenende Kino Film Regenschirm† Jacke Pizza einmal traurig glücklich lachen weinen neu schlecht genug mitkommen˘
- **Stage 0 top-up (0 tokens).** none
- **Recycle (34).** krank Kopf Bauch Hals tun weh Fieber Tablette gesund brauchen legen suchen finden verlieren liegen Rucksack Heft stehen sehen Montag Dienstag Mittwoch Donnerstag Freitag Samstag Nachricht Handy anrufen schreiben Termin nie noch bald werden
- **Focus.** recycling (weather, free time).
- **Cast.** Ben, Lukas, Anna
- **Draft.** weg-2-08 (Was machen wir am Samstag?; 16 % off-plan here: outline only)

#### de-a1-2-04 · #19 · core · daily-life · 440 words · est. cov. 90% · Yesterday after work
- **Situation.** What Anna did yesterday after work: shopping, cleaning, washing, dinner, television; told to Sam on the phone
- **New (15).** gestern Arbeit Büro Supermarkt Wohnung duschen putzen Wäsche† Abendessen fertig leider vorgestern sitzen draußen zurück
- **Stage 0 top-up (0 tokens).** none
- **Recycle (32).** suchen finden verlieren liegen Rucksack Heft stehen sehen Montag Dienstag Mittwoch Donnerstag Freitag Samstag Nachricht Handy anrufen schreiben Termin doch glauben Gott Leben Liebe lieben danken Herz früher jetzt Christ froh Freude
- **Focus.** Perfekt with haben, regular verbs (gearbeitet, gekauft, geputzt), Satzklammer. Keys first met (expected): `sentence-bracket-perfect`.
- **Cast.** Anna, Sam
- **Draft.** weg-2-04 (Am Sonntag bei uns; 13 % off-plan here: needs a pass)

#### de-a1-2-05 · #20 · core · travel · 460 words · est. cov. 90% · By train to Dresden
- **Situation.** Sam and David travel by train to Dresden for the weekend: platform, changing trains, luggage, seats, 'Wir sind um 9 Uhr angekommen'
- **New (16).** Reise Gleis umsteigen˘ einsteigen˘ aussteigen˘ Koffer Platz schnell Bus Auto Fahrrad lang über vor halten bekommen *(function words, no recycle slot: über, vor)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (36).** Montag Dienstag Mittwoch Donnerstag Freitag Samstag Nachricht Handy anrufen schreiben Termin doch glauben Gott Leben Liebe lieben danken Herz früher jetzt Christ froh Freude nie gerade lesen spielen schlafen telefonieren Musik nur tschüs fertig vorgestern draußen
- **Focus.** Perfekt with sein (gefahren, gekommen, gegangen, angekommen), haben vs sein.
- **Cast.** Sam, David
- **Draft.** deutschland-lesungen-1-01 (Mit dem Regionalzug und der Straßenbahn; 28 % off-plan here: outline only)

#### de-a1-2-06 · #21 · core · narrative · 480 words · est. cov. 91% · Anna's weekend in Berlin
- **Situation.** Anna's weekend in Berlin: museum, hotel, a concert, friends, a present; told in the Perfekt
- **New (14).** besuchen treffen Museum Hotel übernachten laufen Café tanzen Konzert Geschäft schenken viele jeder Mädchen *(function words, no recycle slot: viele, jeder)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (39).** glauben Gott Leben Liebe lieben danken Herz früher jetzt Christ froh Freude nie gerade lesen spielen schlafen telefonieren hören Musik noch schon nur bald Zeit tschüs Jahreszeit Frühling Sommer Herbst Winter Schnee Wind Grad heiß Regen scheinen schlecht mitkommen
- **Focus.** Perfekt with strong verbs (gesehen, getroffen, gelaufen), time words (am Samstag, am Abend).
- **Cast.** Anna, Sabine

#### de-a1-2-07 · #22 · vol · narrative · 480 words · est. cov. 90% · Last weekend
- **Situation.** Last weekend: an excursion to the lake with the Gemeinde, swimming, a picnic, photographs
- **New (16).** Ausflug See Wald schwimmen Picknick† Foto fotografieren Berg beide ander weit springen werfen fangen voll leer *(function words, no recycle slot: beide)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (41).** gerade lesen spielen schlafen telefonieren hören Musik noch schon nur bald Zeit tschüs Jahreszeit Frühling Sommer Herbst Winter Schnee Wind Grad heiß Regen scheinen werden Wochenende Kino Film Regenschirm Jacke Pizza einmal traurig glücklich lachen weinen neu genug halten Café Geschäft
- **Focus.** recycling (Perfekt, free time).
- **Cast.** Sam, Ben, Lukas, David, Ruth
- **Draft.** weg-1-02 (Max und das Brot; 11 % off-plan here: needs a pass)

#### de-a1-2-08 · #23 · core · narrative · 500 words · est. cov. 90% · Sam's first week
- **Situation.** Sam's first week in Leipzig: the language course, neighbours, the first service, mistakes, what he understood
- **New (17).** Sprache Kurs† verstehen Wort Nachbar einziehen˘ Lehrerin Grammatik Fehler üben schwer leicht erklären dass dieser kennen fragen *(function words, no recycle slot: dass, dieser)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (43).** Jahreszeit Frühling Sommer Herbst Winter Schnee Wind Grad heiß Regen scheinen werden Wochenende Kino Film Regenschirm Jacke Pizza einmal traurig glücklich lachen weinen neu schlecht genug mitkommen gestern Arbeit Büro Supermarkt Wohnung duschen putzen Wäsche Abendessen leider sitzen zurück lang laufen Konzert Mädchen
- **Focus.** Perfekt in narration, dass-Satz (verb at the end), verstehen / üben / erklären.
- **Cast.** Sam, Frau Weber, Eva
- **Draft.** deutschland-lesungen-1-04 (Zum ersten Mal bei einer deutschen Familie; 27 % off-plan here: outline only)

#### de-a1-2-09 · #24 · core · health · 520 words · est. cov. 92% · At the doctor's
- **Situation.** Ben (and then Sam) at the Hausarzt: making an appointment, 'Wo tut es weh?', pharmacy, prescription, 'Ich soll …'
- **New (14).** Praxis† Schmerz Erkältung Rezept Apotheke Medikament fühlen Fuß Hand Auge Ohr Hilfe lassen Ärztin
- **Stage 0 top-up (0 tokens).** none
- **Recycle (42).** Wochenende Kino Film Regenschirm Jacke Pizza einmal traurig glücklich lachen weinen neu schlecht genug mitkommen gestern Arbeit Büro Supermarkt Wohnung duschen putzen Wäsche Abendessen fertig leider vorgestern sitzen draußen zurück Reise Gleis umsteigen einsteigen aussteigen Koffer Platz schnell Bus Auto Fahrrad bekommen
- **Focus.** sollen / müssen + Infinitiv, sich fühlen (chunk), body parts, Dativ in "Mir tut … weh".
- **Cast.** Ben, Marta, Sam

#### de-a1-2-10 · #25 · core · scripture · 520 words · est. cov. 92% · The lost sheep (Luke 15)
- **Situation.** The parable of the lost sheep retold in plain German (present tense and Perfekt, no quotation of Luther); the shepherd, the night, the joy
- **New (14).** Schaf Hirte Nacht tragen Schulter rufen Fest Sünder Himmel Tier Gras ohne Husten dort *(function words, no recycle slot: ohne)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (39).** gestern Arbeit Büro Supermarkt Wohnung duschen putzen Wäsche Abendessen fertig leider vorgestern sitzen draußen zurück Reise Gleis umsteigen einsteigen aussteigen Koffer Platz schnell Bus Auto Fahrrad lang halten bekommen besuchen treffen Museum Hotel übernachten tanzen schenken leicht fragen lassen
- **Focus.** narrative present, Perfekt, direct speech.
- **Cast.** Hirte (parable), Thomas telling

#### de-a1-2-11 · #26 · core · biography · 540 words · est. cov. 91% · Frau Weber's life
- **Situation.** Frau Weber tells Sam her life: born in Leipzig in 1950, school, the factory, her husband Hans, her daughter, retirement, the garden; Perfekt and present
- **New (16).** gebären heiraten Fabrik Rente Garten Enkel Kindheit† Jugend† Hochzeit† Ehemann sterben aufwachsen˘ seit lange Sohn Eltern *(function words, no recycle slot: seit)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (43).** Reise Gleis umsteigen einsteigen aussteigen Koffer Platz schnell Bus Auto Fahrrad lang halten bekommen besuchen treffen Museum Hotel übernachten laufen Café tanzen Konzert Geschäft schenken Mädchen Ausflug See Wald schwimmen Picknick Foto fotografieren Berg ander weit springen werfen fangen voll leer schwer kennen
- **Focus.** Perfekt + present biography, "ist … geboren", years as numbers, "seit".
- **Cast.** Frau Weber, Sam
- **Draft.** weg-2-06 (Frau Weber; 9 % off-plan here: as-is with small changes)

#### de-a1-2-12 · #27 · core · instructions · 540 words · est. cov. 92% · How to make potato soup
- **Situation.** A recipe read aloud by Marta: ingredients, cutting, boiling, salt and pepper; "Man schneidet …", and imperatives in the du and Sie forms
- **New (15).** Pfanne Zutat† Zwiebel Salz Pfeffer Öl Topf schneiden Messer Löffel Teller Gemüse bisschen backen Salat
- **Stage 0 top-up (0 tokens).** none
- **Recycle (40).** besuchen treffen Museum Hotel übernachten laufen Café tanzen Konzert Geschäft schenken Mädchen Ausflug See Wald schwimmen Picknick Foto fotografieren Berg ander weit springen werfen fangen voll leer Sprache Kurs verstehen Wort Nachbar einziehen Lehrerin Grammatik Fehler üben erklären Ohr Ärztin
- **Focus.** Imperativ (du, ihr, Sie), man + Präsens, quantities.
- **Cast.** Marta, Ben, Sam

#### de-a1-2-13 · #28 · core · explanation · 560 words · est. cov. 91% · Describing people and places
- **Situation.** Describing the people on Sam's team and places in the city: tall, friendly, the hair, the face; 'Sie ist größer als er'
- **New (17).** aussehen˘ freundlich nett jung Haar Gesicht dick dünn dunkel hell Mensch Brille lustig ruhig kurz hoch stark
- **Stage 0 top-up (0 tokens).** none
- **Recycle (41).** Ausflug See Wald schwimmen Picknick Foto fotografieren Berg ander weit springen werfen fangen voll leer Sprache Kurs verstehen Wort Nachbar einziehen Lehrerin Grammatik Fehler üben schwer leicht erklären kennen fragen Praxis Schmerz Erkältung Rezept Apotheke Medikament fühlen Fuß Hand Auge Hilfe
- **Focus.** Komparativ + als, am + Superlativ, adjectives after sein, aussehen. Keys first met (expected): `comparative-als, superlative-am`.
- **Cast.** Sam, Thomas, Ruth, David

#### de-a1-2-14 · #29 · vol · church-and-mission-life · 540 words · est. cov. 93% · A service through Ben's eyes
- **Situation.** A Sunday service seen by ten-year-old Ben: the organ, the sermon that is too long, the candles, the offering, the blessing
- **New (12).** Predigt Kerze still Segen Orgel Kollekte† genau Seite langsam richtig falsch mitbringen˘
- **Stage 0 top-up (0 tokens).** none
- **Recycle (42).** Sprache Kurs verstehen Wort Nachbar einziehen Lehrerin Grammatik Fehler üben schwer leicht erklären kennen fragen Praxis Schmerz Erkältung Rezept Apotheke Medikament fühlen Fuß Hand Auge Ohr Hilfe lassen Ärztin Schaf Hirte Nacht tragen Schulter rufen Fest Sünder Himmel Tier Gras Husten dort
- **Focus.** recycling (church, adjectives).
- **Cast.** Ben, Marta, Thomas
- **Draft.** deutschland-lesungen-1-02 (Sonntag in der Gemeinde; 17 % off-plan here: outline only)

#### de-a1-2-15 · #30 · core · correspondence · 580 words · est. cov. 91% · Invitations and the calendar
- **Situation.** Sam writes and receives invitations (Geburtstag, Hauskreis, Grillabend); the months and dates; the greeting and closing formulae of a short letter
- **New (18).** Einladung einladen˘ Monat Januar Februar März April Mai Juni Juli August September Oktober November Dezember Geburtstag später wünschen
- **Stage 0 top-up (0 tokens).** none
- **Recycle (44).** Praxis Schmerz Erkältung Rezept Apotheke Medikament fühlen Fuß Hand Auge Ohr Hilfe lassen Ärztin Schaf Hirte Nacht tragen Schulter rufen Fest Sünder Himmel Tier Gras Husten dort gebären heiraten Fabrik Rente Garten Enkel Kindheit Jugend Hochzeit Ehemann sterben aufwachsen lange Sohn Eltern ruhig hoch
- **Focus.** months and ordinal dates (am dritten Mai), letter formulae (Liebe … / Viele Grüße), einladen + Akkusativ.
- **Cast.** Sam, Anna, Thomas
- **Draft.** gespraeche-1-06 (Eine Einladung zum Abendbrot; 22 % off-plan here: outline only)

#### de-a1-2-16 · #31 · core · work · 600 words · est. cov. 92% · Jonas looks for work
- **Situation.** Jonas, a young German from the Gemeinde, looks for a job as a mechanic: the ad, the application, the interview, the contract; Perfekt and present
- **New (16).** Stelle Bewerbung Lebenslauf Firma verdienen Erfahrung Gespräch Kollege Vertrag unterschreiben Mechaniker† erst zweit dritt letzt nächst
- **Stage 0 top-up (0 tokens).** none
- **Recycle (43).** Schaf Hirte Nacht tragen Schulter rufen Fest Sünder Himmel Tier Gras Husten dort gebären heiraten Fabrik Rente Garten Enkel Kindheit Jugend Hochzeit Ehemann sterben aufwachsen lange Sohn Eltern Pfanne Zutat Zwiebel Salz Pfeffer Öl Topf schneiden Messer Löffel Teller Gemüse bisschen backen Salat
- **Focus.** Perfekt + present in an interview, zu-Infinitiv in chunks (Ich habe vor …), formal register (Sie). Keys first met (expected): `zu-infinitive`.
- **Cast.** Jonas, Sam, Herr Schmidt

#### de-a2-1-01 · #32 · core · biography · 600 words · est. cov. 92% · "Als ich ein Kind war"
- **Situation.** Lukas and Anna speak about their childhood: the village, grandparents, animals, summer holidays; the first Präteritum of sein and haben
- **New (17).** damals Dorf Opa Onkel Tante Geschwister Baum Bauernhof Kuh Pferd Ferien Geschichte Ball rennen Großeltern sonst beginnen
- **Stage 0 top-up (0 tokens).** none
- **Recycle (45).** gebären heiraten Fabrik Rente Garten Enkel Kindheit Jugend Hochzeit Ehemann sterben aufwachsen lange Sohn Eltern Pfanne Zutat Zwiebel Salz Pfeffer Öl Topf schneiden Messer Löffel Teller Gemüse bisschen backen Salat aussehen freundlich nett jung Haar Gesicht dick dünn dunkel hell Mensch Brille lustig kurz stark
- **Focus.** Präteritum of sein / haben (war, hatte), als-Satz, damals / früher.
- **Cast.** Lukas, Anna, Sam
- **Draft.** weg-1-07 (Lena und Max im Park; 5 % off-plan here: as-is with small changes)

#### de-a2-1-02 · #33 · core · explanation · 620 words · est. cov. 91% · Our neighbourhood before and now
- **Situation.** Frau Weber and Sam compare her street before 1990 and today: shops that closed, the swimming pool, the library, the traffic, new buildings
- **New (19).** mehr Laden Schwimmbad Bibliothek Spielplatz† Verkehr Lärm sauber schließen öffnen bauen Einwohner Veränderung† wenig sogar kaum offen oft manchmal *(function words, no recycle slot: wenig)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (46).** Pfanne Zutat Zwiebel Salz Pfeffer Öl Topf schneiden Messer Löffel Teller Gemüse bisschen backen Salat aussehen freundlich nett jung Haar Gesicht dick dünn dunkel hell Mensch Brille lustig ruhig kurz hoch stark Predigt Kerze still Segen Orgel Kollekte genau Seite langsam richtig falsch mitbringen Geburtstag wünschen
- **Focus.** Präteritum of modals (konnte, musste, wollte), nicht mehr / noch, comparison before / now.
- **Cast.** Frau Weber, Sam

#### de-a2-1-03 · #34 · vol · narrative · 620 words · est. cov. 94% · Grandmother's night story
- **Situation.** Marta tells Ben a night story: the moon, a strange noise at the door, a light; Ben asks questions
- **New (12).** erzählen Angst Mond Stern plötzlich Tür Licht Geräusch Märchen nun zuerst danach
- **Stage 0 top-up (0 tokens).** none
- **Recycle (45).** aussehen freundlich nett jung Haar Gesicht dick dünn dunkel hell Mensch Brille lustig ruhig kurz hoch stark Predigt Kerze still Segen Orgel Kollekte genau Seite langsam richtig falsch mitbringen Einladung einladen Monat Januar Februar März April Mai Juni Juli August September Oktober November Dezember später
- **Focus.** recycling (Präteritum narration, night).
- **Cast.** Marta, Ben
- **Draft.** weg-3-06 (Eine Brezel für zwei; 17 % off-plan here: outline only)

#### de-a2-1-04 · #35 · core · narrative · 680 words · est. cov. 92% · The night of the storm
- **Situation.** A storm over Leipzig: lightning, the power goes out, a tree falls on a roof, the fire brigade; how the neighbours help
- **New (19).** Sturm Blitz† Donner† Dach Strom fallen brechen laut leise Keller Taschenlampe ausfallen˘ Feuerwehr zittern schlimm Schaden beruhigen† endlich fürchten
- **Stage 0 top-up (0 tokens).** none
- **Recycle (51).** Predigt Kerze still Segen Orgel Kollekte genau Seite langsam richtig falsch mitbringen Einladung einladen Monat Januar Februar März April Mai Juni Juli August September Oktober November Dezember Geburtstag später wünschen Stelle Bewerbung Lebenslauf Firma verdienen Erfahrung Gespräch Kollege Vertrag unterschreiben Mechaniker erst zweit dritt letzt nächst Großeltern beginnen kaum manchmal danach
- **Focus.** Präteritum of regular and strong verbs in narration, Perfekt vs Präteritum.
- **Cast.** Frau Weber, Lukas, Sam, Ben

#### de-a2-1-05 · #36 · core · conversation · 700 words · est. cov. 91% · Buying clothes
- **Situation.** Sam buys a winter jacket and shoes with Anna's help: size, colour, price, 'Das passt', trying on; the first adjective endings
- **New (21).** Kleidung Hose Pullover† Hemd Schuh Größe passen anprobieren˘ teuer billig Farbe rot blau schwarz weiß grün Mütze gelb braun grau welcher *(function words, no recycle slot: welcher)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (51).** Einladung einladen Monat Januar Februar März April Mai Juni Juli August September Oktober November Dezember Geburtstag später wünschen Stelle Bewerbung Lebenslauf Firma verdienen Erfahrung Gespräch Kollege Vertrag unterschreiben Mechaniker erst zweit dritt letzt nächst damals Dorf Opa Onkel Tante Geschwister Baum Bauernhof Kuh Pferd Ferien Geschichte Ball rennen sonst sogar oft
- **Focus.** adjective endings after ein / der (ein blauer Pullover, die schwarzen Schuhe), passen, Akkusativ. Keys first met (expected): `adjective-ending-mixed, adjective-ending-weak`.
- **Cast.** Sam, Anna, Verkäuferin

#### de-a2-1-06 · #37 · core · practical-communication · 730 words · est. cov. 92% · Asking, telling, lending
- **Situation.** Sam asks neighbours and friends: borrowing a ladder, lending a bike, giving a present, "Gehört das Ihnen?", apologising, promising
- **New (19).** leihen tauschen zeigen gehören gefallen bringen schicken zurückgeben˘ Geld bitten versprechen Werkzeug Hammer Leiter† vergessen pünktlich entschuldigen hoffentlich reden
- **Stage 0 top-up (0 tokens).** none
- **Recycle (47).** Stelle Bewerbung Lebenslauf Firma verdienen Erfahrung Gespräch Kollege Vertrag unterschreiben Mechaniker erst zweit dritt letzt nächst damals Dorf Opa Onkel Tante Geschwister Baum Bauernhof Kuh Pferd Ferien Geschichte Ball rennen Großeltern sonst beginnen mehr Laden Schwimmbad Bibliothek Spielplatz Verkehr Lärm sauber schließen öffnen bauen Einwohner Veränderung offen
- **Focus.** Dativ and Akkusativ objects (Ich gebe dem Kind das Buch), Dativpronomen, dative verbs. Keys first met (expected): `dative-object-verb`.
- **Cast.** Sam, Frau Weber, Jonas

#### de-a2-1-07 · #38 · vol · correspondence · 700 words · est. cov. 95% · The team's group chat
- **Situation.** The team's group chat: proposals, 'doch', 'mal', cancelling and agreeing, photos and numbers
- **New (12).** Gruppe† antworten absagen˘ zusagen†˘ Nummer vorschlagen˘ Idee Link† bestätigen mal natürlich meistens
- **Stage 0 top-up (0 tokens).** none
- **Recycle (49).** damals Dorf Opa Onkel Tante Geschwister Baum Bauernhof Kuh Pferd Ferien Geschichte Ball rennen Großeltern sonst beginnen mehr Laden Schwimmbad Bibliothek Spielplatz Verkehr Lärm sauber schließen öffnen bauen Einwohner Veränderung sogar kaum offen oft manchmal erzählen Angst Mond Stern plötzlich Tür Licht Geräusch Märchen nun zuerst schlimm beruhigen gelb
- **Focus.** recycling (messages); modal particles (doch, mal, ja, eben). Keys first met (expected): `modal-particle`.
- **Cast.** Sam, David, Ruth, Daniel

#### de-a2-1-08 · #39 · core · daily-life · 760 words · est. cov. 93% · Ben's morning
- **Situation.** Ben gets up, washes, brushes his teeth, dresses, hurries; Marta waits; reflexive verbs in the present
- **New (19).** waschen anziehen˘ ausziehen˘ kämmen† Zahn Zahnbürste† Zahnpasta† Seife Handtuch Wecker klingeln aufwachen˘ beeilen verschlafen holen Brotdose† Schulweg† setzen früh
- **Stage 0 top-up (0 tokens).** none
- **Recycle (50).** mehr Laden Schwimmbad Bibliothek Spielplatz Verkehr Lärm sauber schließen öffnen bauen Einwohner Veränderung sogar kaum offen oft manchmal erzählen Angst Mond Stern plötzlich Tür Licht Geräusch Märchen nun zuerst danach Sturm Blitz Donner Dach Strom fallen brechen laut leise Keller Taschenlampe ausfallen Feuerwehr zittern Schaden endlich fürchten grau Leiter hoffentlich
- **Focus.** reflexive verbs (sich waschen, sich anziehen, sich beeilen), Akkusativ- vs Dativ-reflexive (Ich putze mir die Zähne).
- **Cast.** Ben, Marta, Lukas

#### de-a2-1-09 · #40 · core · church-and-mission-life · 790 words · est. cov. 94% · Getting ready for church
- **Situation.** Sunday at the Gemeindehaus: setting up chairs, welcoming guests, the order of service, the sound, the coffee, the children
- **New (15).** vorbereiten˘ Gesangbuch† begrüßen stellen aufstellen˘ Helfer† Gast willkommen Programm Ablauf† Andacht† Saal† Tasse Gemeindehaus† Blume
- **Stage 0 top-up (0 tokens).** none
- **Recycle (52).** erzählen Angst Mond Stern plötzlich Tür Licht Geräusch Märchen nun zuerst danach Sturm Blitz Donner Dach Strom fallen brechen laut leise Keller Taschenlampe ausfallen Feuerwehr zittern schlimm Schaden beruhigen endlich fürchten Kleidung Hose Pullover Hemd Schuh Größe passen anprobieren teuer billig Farbe rot blau schwarz weiß grün Mütze braun Hammer pünktlich reden
- **Focus.** reflexive verbs with all persons (wir treffen uns), separable verbs in Satzklammer, imperative for tasks.
- **Cast.** Thomas, Sam, Daniel, Ruth, Marta
- **Draft.** gespraeche-1-05 (Nach dem Gottesdienst; 8 % off-plan here: as-is with small changes); weg-3-05 (Der Kuchen für Frau Weber; 14 % off-plan here: needs a pass)

#### de-a2-1-10 · #41 · core · health · 820 words · est. cov. 92% · At the pharmacy and the health insurance
- **Situation.** Sam at the Apotheke and on the phone with the Krankenkasse; an emergency, the ambulance; what to say, what is covered
- **New (21).** Krankenhaus Krankenkasse Versicherung Notfall Krankenwagen† Wunde Pflaster† Spritze† impfen† Impfung† Blut Haut Zahnarzt† untersuchen Gesundheit verletzen fast sofort Rücken Arm Bein
- **Stage 0 top-up (0 tokens).** none
- **Recycle (53).** Sturm Blitz Donner Dach Strom fallen brechen laut leise Keller Taschenlampe ausfallen Feuerwehr zittern schlimm Schaden beruhigen endlich fürchten Kleidung Hose Pullover Hemd Schuh Größe passen anprobieren teuer billig Farbe rot blau schwarz weiß grün Mütze gelb braun grau leihen tauschen zeigen gehören gefallen bringen schicken zurückgeben Geld bitten versprechen Werkzeug vergessen entschuldigen
- **Focus.** advice with sollen / müssen / dürfen, pronouns (ihn, ihr, ihm), "Ich habe mich verletzt".
- **Cast.** Sam, Anna, Apotheker

#### de-a2-1-11 · #42 · vol · travel · 780 words · est. cov. 95% · A delayed train
- **Situation.** Sam's train to Berlin is late: announcements, missing the connection, waiting on the platform, information desk
- **New (12).** Verspätung Durchsage† Anschluss† warten Bahnsteig ärgern Auskunft† Bahn Stau Ersatz† Fahrplan durch *(function words, no recycle slot: durch)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (51).** Kleidung Hose Pullover Hemd Schuh Größe passen anprobieren teuer billig Farbe rot blau schwarz weiß grün Mütze gelb braun grau leihen tauschen zeigen gehören gefallen bringen schicken zurückgeben Geld bitten versprechen Werkzeug Hammer Leiter vergessen pünktlich entschuldigen hoffentlich reden Gruppe antworten absagen zusagen Nummer vorschlagen Idee Link bestätigen mal natürlich meistens
- **Focus.** recycling (travel, pronouns); Perfekt + Präteritum.
- **Cast.** Sam, Zugbegleiter
- **Draft.** weg-3-03 (Der Zug, der zu spät kam; 8 % off-plan here: as-is with small changes)

#### de-a2-1-12 · #43 · core · work · 850 words · est. cov. 94% · A day in the workshop and in the Kindergarten
- **Situation.** Two workplaces: Jonas repairs cars (customer, bill) and Sabine, an Erzieherin, looks after twelve children (painting, reading, nap)
- **New (18).** Werkstatt† Reifen† reparieren Ausbildung Kunde Rechnung bezahlen Kindergarten Erzieherin† Spiel malen vorlesen˘ Spielzeug kaputt prüfen austauschen†˘ Feierabend† ziehen
- **Stage 0 top-up (0 tokens).** none
- **Recycle (52).** leihen tauschen zeigen gehören gefallen bringen schicken zurückgeben Geld bitten versprechen Werkzeug Hammer Leiter vergessen pünktlich entschuldigen hoffentlich reden Gruppe antworten absagen zusagen Nummer vorschlagen Idee Link bestätigen mal natürlich meistens waschen anziehen ausziehen kämmen Zahn Zahnbürste Zahnpasta Seife Handtuch Wecker klingeln aufwachen beeilen verschlafen holen Brotdose Schulweg setzen früh Stau Fahrplan
- **Focus.** all past tenses at work (Perfekt + Präteritum), Dativ after mit / bei / von, temporal conjunctions als / wenn.
- **Cast.** Jonas, Sabine, Sam

#### de-a2-1-13 · #44 · core · contemporary-nonfiction · 870 words · est. cov. 92% · Germany in facts
- **Situation.** A short factual text about Germany: size, capital, Länder, rivers, neighbours, population, the euro, the language
- **New (22).** Land Hauptstadt Bundesland Fluss Meer Million† Währung† Norden† Süden† Osten† Westen† Grenze Insel Küste Kilometer† Staat Regierung wählen Wahl Bürger Kanzler Welt
- **Stage 0 top-up (0 tokens).** none
- **Recycle (50).** Gruppe antworten absagen zusagen Nummer vorschlagen Idee Link bestätigen mal natürlich meistens waschen anziehen ausziehen kämmen Zahn Zahnbürste Zahnpasta Seife Handtuch Wecker klingeln aufwachen beeilen verschlafen holen Brotdose Schulweg setzen früh vorbereiten Gesangbuch begrüßen stellen aufstellen Helfer Gast willkommen Programm Ablauf Andacht Saal Tasse Gemeindehaus Blume untersuchen verletzen sofort Arm
- **Focus.** description in the present, numbers (Millionen), genitive attribute (die Hauptstadt des Landes), passive in the facts. Keys first met (expected): `genitive-attribute`.
- **Cast.** neutral narrator

#### de-a2-1-14 · #45 · core · scripture · 890 words · est. cov. 93% · The son who left (Luke 15)
- **Situation.** The parable of the two sons retold in plain German, past tense: the inheritance, the far country, the pigs, the return, the feast
- **New (21).** Erbe† weggehen˘ ausgeben˘ Schwein Futter Arbeiter zurückkehren˘ umarmen küssen Ring feiern bereuen tot lebendig wütend Feld Lohn Schuld wohl darauf reich
- **Stage 0 top-up (0 tokens).** none
- **Recycle (51).** waschen anziehen ausziehen kämmen Zahn Zahnbürste Zahnpasta Seife Handtuch Wecker klingeln aufwachen beeilen verschlafen holen Brotdose Schulweg setzen früh vorbereiten Gesangbuch begrüßen stellen aufstellen Helfer Gast willkommen Programm Ablauf Andacht Saal Tasse Gemeindehaus Blume Krankenhaus Krankenkasse Versicherung Notfall Krankenwagen Wunde Pflaster Spritze impfen Impfung Blut Haut Zahnarzt Gesundheit fast Rücken Bein
- **Focus.** long Präteritum narrative, direct speech, Plusquamperfekt appears once. Keys first met (expected): `pluperfect`.
- **Cast.** Vater, two sons (parable), Thomas
- **Draft.** weg-3-04 (Der Sohn, der zurückkam; 8 % off-plan here: as-is with small changes)

#### de-a2-1-15 · #46 · vol · correspondence · 880 words · est. cov. 97% · A letter abroad
- **Situation.** Sam writes a letter to his home church: first impressions of Germany, the language, the people, thanks for the prayers
- **New (10).** Brief Gruß Heimat vermissen† Post Päckchen† Briefmarke Computer Internet Mail†
- **Stage 0 top-up (0 tokens).** none
- **Recycle (52).** vorbereiten Gesangbuch begrüßen stellen aufstellen Helfer Gast willkommen Programm Ablauf Andacht Saal Tasse Gemeindehaus Blume Krankenhaus Krankenkasse Versicherung Notfall Krankenwagen Wunde Pflaster Spritze impfen Impfung Blut Haut Zahnarzt untersuchen Gesundheit verletzen fast sofort Rücken Arm Bein Verspätung Durchsage Anschluss warten Bahnsteig ärgern Auskunft Bahn Ersatz prüfen Feierabend Insel Staat Wahl Welt reich
- **Focus.** recycling (letter formulae, Perfekt).
- **Cast.** Sam
- **Draft.** weg-3-02 (Ein Brief an Oma; 7 % off-plan here: as-is with small changes)

#### de-a2-1-16 · #47 · core · biography · 900 words · est. cov. 92% · A missionary couple
- **Situation.** David and Ruth: how they met, why they came to Germany, their studies, the move, homesickness, what they have learned; all past tenses
- **New (23).** Ehepaar Missionar† Mission† Ausland Studium studieren Universität Theologie† gründen Visum† umziehen˘ Abschied† Heimweh† Kultur fremd gewöhnen† Freundschaft unterstützen Berufung† Spende† entscheiden Entscheidung nennen
- **Stage 0 top-up (0 tokens).** none
- **Recycle (53).** Krankenhaus Krankenkasse Versicherung Notfall Krankenwagen Wunde Pflaster Spritze impfen Impfung Blut Haut Zahnarzt untersuchen Gesundheit verletzen fast sofort Rücken Arm Bein Verspätung Durchsage Anschluss warten Bahnsteig ärgern Auskunft Bahn Stau Ersatz Fahrplan Werkstatt Reifen reparieren Ausbildung Kunde Rechnung bezahlen Kindergarten Erzieherin Spiel malen vorlesen Spielzeug kaputt austauschen ziehen Küste Regierung Bürger wohl Mail
- **Focus.** all past tenses, Plusquamperfekt, seit + Dativ, nachdem / bevor (first contact).
- **Cast.** David, Ruth, Sam

#### de-a2-1-17 · #48 · core · instructions · 900 words · est. cov. 93% · How it is done
- **Situation.** How to register an address (Anmeldung) at the Bürgeramt: documents, forms, fees, queue numbers; what one may and must do
- **New (22).** Amt anmelden˘ Formular ausfüllen˘ Ausweis Gebühr† Unterschrift Antrag Behörde Briefkasten abgeben˘ Öffnungszeit† Bescheinigung† man Wohnsitz† Mitarbeiter Schalter Ausländer Aufenthalt Erlaubnis† also Raum *(function words, no recycle slot: man)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (52).** Verspätung Durchsage Anschluss warten Bahnsteig ärgern Auskunft Bahn Stau Ersatz Fahrplan Werkstatt Reifen reparieren Ausbildung Kunde Rechnung bezahlen Kindergarten Erzieherin Spiel malen vorlesen Spielzeug kaputt prüfen austauschen Feierabend ziehen Land Hauptstadt Bundesland Fluss Meer Million Währung Norden Süden Osten Westen Grenze Kilometer wählen Kanzler Futter zurückkehren küssen feiern tot wütend Lohn darauf
- **Focus.** man + Präsens, Passiv Präsens (Das Formular wird ausgefüllt), müssen / dürfen, imperative Sie. Keys first met (expected): `man-impersonal, passive`.
- **Cast.** Sam, Mitarbeiter

#### de-a2-1-18 · #49 · vol · conversation · 900 words · est. cov. 97% · Renting a room
- **Situation.** Sam helps Jonas find a room in a shared flat: asking about rent, deposit, furniture, the landlord
- **New (8).** Miete Vermieter Kaution† Nebenkosten† möblieren† frei monatlich Quadratmeter†
- **Stage 0 top-up (0 tokens).** none
- **Recycle (54).** Werkstatt Reifen reparieren Ausbildung Kunde Rechnung bezahlen Kindergarten Erzieherin Spiel malen vorlesen Spielzeug kaputt prüfen austauschen Feierabend ziehen Land Hauptstadt Bundesland Fluss Meer Million Währung Norden Süden Osten Westen Grenze Insel Küste Kilometer Staat Regierung wählen Wahl Bürger Kanzler Welt Erbe weggehen ausgeben Schwein Arbeiter umarmen Ring bereuen lebendig Feld Schuld Internet unterstützen entscheiden
- **Focus.** recycling (negotiation); Konjunktiv II chunks (Könnte ich …?).
- **Cast.** Jonas, Sam, Vermieter

#### de-a2-2-01 · #50 · core · conversation · 900 words · est. cov. 92% · Making plans and giving reasons
- **Situation.** Sam, Anna and Lukas plan a Saturday: ideas, reasons, who knows whether something is possible; "Ich weiß nicht, ob …"
- **New (23).** ob vielleicht planen Vorschlag Meinung möglich wahrscheinlich sicher Lust überlegen denken meinen Grund Problem Lösung Wunsch hoffen verabreden† bestimmt sondern nämlich wirklich eigentlich *(function words, no recycle slot: ob, sondern)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (57).** Land Hauptstadt Bundesland Fluss Meer Million Währung Norden Süden Osten Westen Grenze Insel Küste Kilometer Staat Regierung wählen Wahl Bürger Kanzler Welt Erbe weggehen ausgeben Schwein Futter Arbeiter zurückkehren umarmen küssen Ring feiern bereuen tot lebendig wütend Feld Lohn Schuld wohl darauf reich Brief Gruß Heimat vermissen Post Päckchen Briefmarke Computer Freundschaft Spende nennen Kaution möblieren monatlich
- **Focus.** ob / dass / weil / wenn in one conversation, indirect questions, Satzklammer + Nebensatz.
- **Cast.** Sam, Anna, Lukas

#### de-a2-2-02 · #51 · core · testimony · 950 words · est. cov. 94% · Small-group testimonies
- **Situation.** Three people in the Hauskreis tell what changed: forgiveness, hope, doubt, peace, trust; Sam listens and speaks
- **New (19).** Hauskreis† Zeugnis Vergebung vergeben Hoffnung Zweifel zweifeln Frieden Glaube Vertrauen Wahrheit Wunder verändern retten Kraft Trost† allein Sinn Tod
- **Stage 0 top-up (0 tokens).** none
- **Recycle (50).** Erbe weggehen ausgeben Schwein Futter Arbeiter zurückkehren umarmen küssen Ring feiern bereuen tot lebendig wütend Feld Lohn Schuld wohl darauf reich Brief Gruß Heimat vermissen Post Päckchen Briefmarke Computer Internet Mail Ehepaar Missionar Mission Ausland Studium studieren Universität Theologie gründen Visum umziehen Abschied Heimweh Kultur fremd gewöhnen Berufung Entscheidung also
- **Focus.** Relativsätze (der, die, das; Nominativ / Akkusativ), "Ich habe gelernt, dass …", Perfekt + Präteritum in testimony. Keys first met (expected): `relative-clause`.
- **Cast.** Daniel, Sabine, Frau Weber, Sam

#### de-a2-2-03 · #52 · vol · family · 1000 words · est. cov. 99% · A long phone call
- **Situation.** Anna phones her grandmother Marta from a hospital break: news, the garden, Ben's school, the weather; Marta asks the questions
- **New (5).** Telefon Enkelin Neuigkeit† Video† Verbindung
- **Stage 0 top-up (0 tokens).** none
- **Recycle (53).** Brief Gruß Heimat vermissen Post Päckchen Briefmarke Computer Internet Mail Ehepaar Missionar Mission Ausland Studium studieren Universität Theologie gründen Visum umziehen Abschied Heimweh Kultur fremd gewöhnen Freundschaft unterstützen Berufung Spende entscheiden Entscheidung nennen Amt anmelden Formular ausfüllen Ausweis Gebühr Unterschrift Antrag Behörde Briefkasten abgeben Öffnungszeit Bescheinigung Wohnsitz Mitarbeiter Schalter Ausländer Aufenthalt Erlaubnis Raum
- **Focus.** recycling (all tenses, relative clauses).
- **Cast.** Anna, Marta

#### de-a2-2-04 · #53 · core · instructions · 1040 words · est. cov. 92% · Directions and forms
- **Situation.** Giving and following directions in the city; numbered instructions to fill in a form; the ground floor and the lift
- **New (27).** geradeaus links rechts Kreuzung Ampel Ecke Brücke abbiegen˘ überqueren† entlang Richtung nah Meter† Parkplatz Gebäude gegenüber Stock† Erdgeschoss Treppe Aufzug Eingang Ausgang Hinweis† Weg oben unten hinten *(function words, no recycle slot: entlang, gegenüber)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (49).** Ehepaar Missionar Mission Ausland Studium studieren Universität Theologie gründen Visum umziehen Abschied Heimweh Kultur fremd gewöhnen Freundschaft unterstützen Berufung Spende entscheiden Entscheidung nennen Amt anmelden Formular ausfüllen Ausweis Gebühr Unterschrift Antrag Behörde Briefkasten abgeben Öffnungszeit Bescheinigung Wohnsitz Mitarbeiter Schalter Ausländer Aufenthalt Erlaubnis also Raum Miete Vermieter Nebenkosten frei Quadratmeter
- **Focus.** imperatives with Sie and du, zu-Infinitiv (Vergessen Sie nicht, … zu), prepositions + Dativ (gegenüber von, entlang).
- **Cast.** Sam, Passant
- **Draft.** gespraeche-1-03 (Wie komme ich zum Bahnhof?; 12 % off-plan here: needs a pass)

#### de-a2-2-05 · #54 · core · practical-communication · 1080 words · est. cov. 94% · Notices, rules, recipes
- **Situation.** The Hausordnung, a notice for the stairwell, a Gemeinde announcement and a Kuchen recipe; what is allowed and what is forbidden
- **New (22).** Hausordnung† Regel† verbieten erlauben Müll trennen Mülltonne† Treppenhaus† Flur abstellen†˘ parken Mitteilung Mieter Hausmeister Heizung sparen lüften† rauchen beachten† Rücksicht Nachbarschaft Geduld
- **Stage 0 top-up (0 tokens).** none
- **Recycle (52).** Amt anmelden Formular ausfüllen Ausweis Gebühr Unterschrift Antrag Behörde Briefkasten abgeben Öffnungszeit Bescheinigung Wohnsitz Mitarbeiter Schalter Ausländer Aufenthalt Erlaubnis also Raum Miete Vermieter Kaution Nebenkosten möblieren frei monatlich Quadratmeter vielleicht planen Vorschlag Meinung möglich wahrscheinlich sicher Lust überlegen denken meinen Grund Problem Lösung Wunsch hoffen verabreden bestimmt nämlich wirklich eigentlich Ausgang Weg
- **Focus.** Passiv (Es wird gebeten …), man darf / muss, Imperativ + Infinitiv as an order (Bitte nicht rauchen). Keys first met (expected): `nominalised-verb`.
- **Cast.** Frau Weber, Hausmeister

#### de-a2-2-06 · #55 · core · community · 1120 words · est. cov. 95% · The neighbourhood meeting
- **Situation.** A meeting about the playground and the traffic: motions, votes, pros and cons, minutes
- **New (18).** Versammlung† Verein Stadtteil Abstimmung† abstimmen†˘ dafür dagegen Mehrheit Sitzung Protokoll† Tagesordnung† Bürgermeister Baustelle† Veranstaltung† organisieren† Beitrag beschließen Antwort
- **Stage 0 top-up (0 tokens).** none
- **Recycle (52).** Miete Vermieter Kaution Nebenkosten möblieren frei monatlich Quadratmeter vielleicht planen Vorschlag Meinung möglich wahrscheinlich sicher Lust überlegen denken meinen Grund Problem Lösung Wunsch hoffen verabreden bestimmt nämlich wirklich eigentlich Hauskreis Zeugnis Vergebung vergeben Hoffnung Zweifel zweifeln Frieden Glaube Vertrauen Wahrheit Wunder verändern retten Kraft Trost allein Sinn Tod Telefon Enkelin Neuigkeit Video
- **Focus.** Relativsätze with Akkusativ / Dativ, dass-Sätze for opinions, reported proposals.
- **Cast.** Frau Weber, Sam, Jonas, Bürgermeister

#### de-a2-2-07 · #56 · vol · contemporary-nonfiction · 1050 words · est. cov. 98% · Neighbourhood news
- **Situation.** Four items from a district newspaper: an accident, a street festival, a new bakery, a police warning
- **New (7).** Zeitung Bericht berichten Polizei Unfall Feuer Meldung
- **Stage 0 top-up (0 tokens).** none
- **Recycle (48).** vielleicht planen Vorschlag Meinung möglich wahrscheinlich sicher Lust überlegen denken meinen Grund Problem Lösung Wunsch hoffen verabreden bestimmt nämlich wirklich eigentlich Hauskreis Zeugnis Vergebung vergeben Hoffnung Zweifel zweifeln Frieden Glaube Vertrauen Wahrheit Wunder verändern retten Kraft Trost allein Sinn Tod Verbindung unten rauchen Nachbarschaft Abstimmung Sitzung Baustelle beschließen
- **Focus.** recycling (Perfekt in reports), Passiv, Genitiv.
- **Cast.** neutral narrator

#### de-a2-2-08 · #57 · core · church-and-mission-life · 1150 words · est. cov. 95% · Planning the next outreach
- **Situation.** The team plans a street festival: tasks, flyers, a coffee stand, concert, conversations; who does what and why
- **New (21).** Flyer† verteilen Aktion† Evangelium Jugendkreis† damit Ziel Erfolg Verantwortung Aufgabe Liste† eintragen˘ Dienst Vorbereitung† drucken† Mut ansprechen˘ zuhören˘ Interesse Frage neugierig
- **Stage 0 top-up (0 tokens).** none
- **Recycle (52).** Hauskreis Zeugnis Vergebung vergeben Hoffnung Zweifel zweifeln Frieden Glaube Vertrauen Wahrheit Wunder verändern retten Kraft Trost allein Sinn Tod Telefon Enkelin Neuigkeit Video Verbindung geradeaus links rechts Kreuzung Ampel Ecke Brücke abbiegen überqueren Richtung nah Meter Parkplatz Gebäude Stock Erdgeschoss Treppe Aufzug Eingang Hinweis oben hinten beachten Geduld dafür Protokoll Veranstaltung Antwort
- **Focus.** damit / um … zu, Futur I (werden + Infinitiv), man soll / wir wollen. Keys first met (expected): `um-zu, future`.
- **Cast.** Thomas, David, Ruth, Sam, Daniel

#### de-a2-2-09 · #58 · core · health · 1180 words · est. cov. 95% · If you have a fever
- **Situation.** Advice from Anna the nurse: what to do with a fever, a cold or a stomach flu; when to see the doctor; what not to do
- **New (19).** Ratschlag† ausruhen˘ Ruhe Grippe† Temperatur messen Besserung† schwitzen frieren Durst atmen Magen Übelkeit† Durchfall† Hausarzt† Notaufnahme† falls Symptom† ernst *(function words, no recycle slot: falls)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (52).** Telefon Enkelin Neuigkeit Video Verbindung geradeaus links rechts Kreuzung Ampel Ecke Brücke abbiegen überqueren Richtung nah Meter Parkplatz Gebäude Stock Erdgeschoss Treppe Aufzug Eingang Ausgang Hinweis Weg oben unten hinten Hausordnung Regel verbieten erlauben Müll trennen Mülltonne Treppenhaus Flur abstellen parken Mitteilung Mieter Hausmeister Heizung sparen lüften Rücksicht Stadtteil dagegen Tagesordnung organisieren
- **Focus.** Konjunktiv II for advice (Du solltest …, Ich würde …), falls / wenn, imperatives. Keys first met (expected): `konjunktiv-2-wuerde`.
- **Cast.** Anna, Sam, Ben

#### de-a2-2-10 · #59 · core · scripture · 1210 words · est. cov. 96% · The Good Samaritan
- **Situation.** The parable of the Good Samaritan retold in plain German, past tense, with a modern frame: a question, the road, the three who pass, the inn
- **New (18).** Räuber† Priester Samariter† Wein Esel Herberge† Wirt† Gesetz Gesetzeslehrer† überfallen ausrauben† vorbeigehen˘ Mitleid† verbinden pflegen† barmherzig handeln ewig
- **Stage 0 top-up (0 tokens).** none
- **Recycle (54).** geradeaus links rechts Kreuzung Ampel Ecke Brücke abbiegen überqueren Richtung nah Meter Parkplatz Gebäude Stock Erdgeschoss Treppe Aufzug Eingang Ausgang Hinweis Weg oben unten hinten Hausordnung Regel verbieten erlauben Müll trennen Mülltonne Treppenhaus Flur abstellen parken Mitteilung Mieter Hausmeister Heizung sparen lüften rauchen beachten Rücksicht Nachbarschaft Geduld Versammlung Verein abstimmen Mehrheit Bürgermeister Beitrag Frage
- **Focus.** Präteritum narration, Plusquamperfekt, indirect and direct speech.
- **Cast.** Thomas, Gesetzeslehrer, Samariter (parable)

#### de-a2-2-11 · #60 · vol · travel · 1100 words · est. cov. 98% · A traveller's blog
- **Situation.** A short blog about a weekend in Dresden and Meissen: the old town, the castle, the market square, a tourist guide
- **New (8).** Blog† Sehenswürdigkeit Schloss Burg Altstadt Marktplatz Dom Reiseführer
- **Stage 0 top-up (0 tokens).** none
- **Recycle (47).** Hausordnung Regel verbieten erlauben Müll trennen Mülltonne Treppenhaus Flur abstellen parken Mitteilung Mieter Hausmeister Heizung sparen lüften rauchen beachten Rücksicht Nachbarschaft Geduld Versammlung Verein Stadtteil Abstimmung abstimmen dafür dagegen Mehrheit Sitzung Protokoll Tagesordnung Bürgermeister Baustelle Veranstaltung organisieren Beitrag beschließen Antwort Zeitung Bericht berichten Polizei Unfall Feuer Meldung
- **Focus.** recycling (description, Perfekt, Superlativ).
- **Cast.** Sam

#### de-a2-2-12 · #61 · core · travel · 1240 words · est. cov. 94% · Diary of the mission trip
- **Situation.** The team's week-long trip to a small town in Thuringia: arrival, host family, fog, conversations, return; diary entries in Perfekt and Präteritum
- **New (24).** Tagebuch† Eindruck während nachdem bevor Ankunft Abreise† Unterkunft† Gastfamilie† Begegnung† Überraschung erleben Erlebnis beeindrucken† Gastfreundschaft† Spaziergang Nebel Erinnerung erinnern Heimreise† unterwegs Landschaft† schließlich inzwischen *(function words, no recycle slot: während, nachdem, bevor)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (54).** Versammlung Verein Stadtteil Abstimmung abstimmen dafür dagegen Mehrheit Sitzung Protokoll Tagesordnung Bürgermeister Baustelle Veranstaltung organisieren Beitrag beschließen Antwort Zeitung Bericht berichten Polizei Unfall Feuer Meldung Flyer verteilen Aktion Evangelium Jugendkreis damit Ziel Erfolg Verantwortung Aufgabe Liste eintragen Dienst Vorbereitung drucken Mut ansprechen zuhören Interesse neugierig Gesetz ausrauben verbinden handeln Blog Schloss Burg Marktplatz Reiseführer
- **Focus.** während / nachdem / bevor, mixed past in a diary, Plusquamperfekt.
- **Cast.** Sam, David, Ruth, Daniel, host family

#### de-a2-2-13 · #62 · core · explanation · 1260 words · est. cov. 94% · Opinions and comparisons
- **Situation.** Two friends compare living in a big city and a small town, a bike and a car; "meiner Meinung nach", pros and cons; je … desto
- **New (25).** Vorteil Nachteil Unterschied ähnlich gleich verschieden wichtig einfach schwierig günstig praktisch bequem Qualität Auswahl lieber je desto jedoch tatsächlich Wohnort zwar außerdem allerdings anders Teil
- **Stage 0 top-up (0 tokens).** none
- **Recycle (49).** Zeitung Bericht berichten Polizei Unfall Feuer Meldung Flyer verteilen Aktion Evangelium Jugendkreis damit Ziel Erfolg Verantwortung Aufgabe Liste eintragen Dienst Vorbereitung drucken Mut ansprechen zuhören Interesse Frage neugierig Ratschlag ausruhen Ruhe Grippe Temperatur messen Besserung schwitzen frieren Durst atmen Magen Übelkeit Durchfall Hausarzt Notaufnahme Symptom ernst überfallen Mitleid barmherzig
- **Focus.** je … desto, Komparativ / Superlativ in argument, aber / jedoch / dagegen. Keys first met (expected): `je-desto`.
- **Cast.** Anna, Lukas, Sam

#### de-a2-2-14 · #63 · core · contemporary-nonfiction · 1280 words · est. cov. 96% · Why Germans sort their rubbish
- **Situation.** A factual article: the colour bins, the deposit on bottles, recycling rates, why the system exists and what it costs
- **New (17).** Mülltrennung† Pfand† Flasche Glas Papier Plastik† Umwelt schützen Energie Klima† Abfall Pflicht obwohl deshalb trotzdem deswegen System† *(function words, no recycle slot: obwohl)*
- **Stage 0 top-up (0 tokens).** none
- **Recycle (50).** Flyer verteilen Aktion Evangelium Jugendkreis damit Ziel Erfolg Verantwortung Aufgabe Liste eintragen Dienst Vorbereitung drucken Mut ansprechen zuhören Interesse Frage neugierig Ratschlag ausruhen Ruhe Grippe Temperatur messen Besserung schwitzen frieren Durst atmen Magen Übelkeit Durchfall Hausarzt Notaufnahme Symptom ernst Räuber Priester Samariter Wein Esel Herberge Wirt Gesetzeslehrer vorbeigehen pflegen ewig
- **Focus.** obwohl / deshalb / trotzdem, Passiv, participial adjectives (getrennter Müll). Keys first met (expected): `passive-past, passive-state, participial-modifier`.
- **Cast.** neutral narrator

#### de-a2-2-15 · #64 · vol · work · 1150 words · est. cov. 98% · Interview with a nurse
- **Situation.** A radio-style interview with Anna: her shift, patients, difficult nights, why she loves the work
- **New (9).** Interview† Schicht† Patient Station Pflege† Nachtdienst† hart Stress† schaffen
- **Stage 0 top-up (0 tokens).** none
- **Recycle (45).** Ratschlag ausruhen Ruhe Grippe Temperatur messen Besserung schwitzen frieren Durst atmen Magen Übelkeit Durchfall Hausarzt Notaufnahme Symptom ernst Räuber Priester Samariter Wein Esel Herberge Wirt Gesetz Gesetzeslehrer überfallen ausrauben vorbeigehen Mitleid verbinden pflegen barmherzig handeln ewig Sehenswürdigkeit Altstadt Dom erleben beeindrucken Spaziergang Erinnerung Heimreise schließlich
- **Focus.** recycling (questions, Perfekt, opinions).
- **Cast.** Anna, interviewer

#### de-a2-2-16 · #65 · core · biography · 1290 words · est. cov. 98% · A nurse's life
- **Situation.** Anna tells in the first person how she became a nurse: school, the exam, the first job, a patient she remembers
- **New (9).** Abitur Prüfung bestehen Kollegin Traum träumen beobachten stolz Ende
- **Stage 0 top-up (0 tokens).** none
- **Recycle (57).** Räuber Priester Samariter Wein Esel Herberge Wirt Gesetz Gesetzeslehrer überfallen ausrauben vorbeigehen Mitleid verbinden pflegen barmherzig handeln ewig Blog Sehenswürdigkeit Schloss Burg Altstadt Marktplatz Dom Reiseführer Tagebuch Eindruck Ankunft Abreise Unterkunft Gastfamilie Begegnung Überraschung Erlebnis Gastfreundschaft Nebel erinnern unterwegs Landschaft inzwischen Qualität lieber desto tatsächlich zwar außerdem anders Teil Flasche Plastik Energie Pflicht deswegen Schicht Station hart
- **Focus.** all past tenses, Relativsätze, Plusquamperfekt. Keys first met (expected): `passive-perfect`.
- **Cast.** Anna

#### de-a2-2-17 · #66 · core · conversation · 1300 words · est. cov. 98% · A loan, politely
- **Situation.** Jonas asks Herr Schmidt for a small loan to buy tools: polite requests, explanations, hesitation, agreement
- **New (9).** Kredit† zurückzahlen†˘ Zinsen Verständnis† Bank Konto ehrlich Sorge verlassen
- **Stage 0 top-up (0 tokens).** none
- **Recycle (62).** Blog Sehenswürdigkeit Schloss Burg Altstadt Marktplatz Dom Reiseführer Tagebuch Eindruck Ankunft Abreise Unterkunft Gastfamilie Begegnung Überraschung erleben Erlebnis beeindrucken Gastfreundschaft Spaziergang Nebel Erinnerung erinnern Heimreise unterwegs Landschaft schließlich inzwischen Vorteil Nachteil Unterschied ähnlich gleich verschieden wichtig einfach schwierig günstig praktisch bequem Auswahl je jedoch Wohnort zwar allerdings anders Mülltrennung Glas Umwelt Klima deshalb System Patient Nachtdienst schaffen Prüfung bestehen Traum beobachten Ende
- **Focus.** Konjunktiv II (könnte, würde, hätte), polite register, wenn-Sätze (irreal, first contact).
- **Cast.** Jonas, Herr Schmidt, Sam

#### de-a2-2-18 · #67 · vol · narrative · 1200 words · est. cov. 98% · The key that came back
- **Situation.** Marta loses her key; weeks later a stranger leaves it in the letterbox; the story of how it travelled
- **New (10).** Fundbüro† Zufall Fremde dankbar überraschen Mantel Schlüsselbund† Spur Rätsel entdecken
- **Stage 0 top-up (0 tokens).** none
- **Recycle (65).** Tagebuch Eindruck Ankunft Abreise Unterkunft Gastfamilie Begegnung Überraschung erleben Erlebnis beeindrucken Gastfreundschaft Spaziergang Nebel Erinnerung erinnern Heimreise unterwegs Landschaft schließlich inzwischen Vorteil Nachteil Unterschied ähnlich gleich verschieden wichtig einfach schwierig günstig praktisch bequem Qualität Auswahl lieber je desto jedoch tatsächlich Wohnort außerdem allerdings Teil Pfand Papier schützen Abfall trotzdem Interview Pflege Stress Abitur Kollegin träumen stolz Kredit zurückzahlen Zinsen Verständnis Bank Konto ehrlich Sorge verlassen
- **Focus.** recycling (narrative tenses, relative clauses).
- **Cast.** Marta, Ben, Frau Weber
- **Draft.** weg-3-01 (Das Buch, das verschwunden war; 5 % off-plan here: as-is with small changes)

#### de-a2-2-19 · #68 · core · correspondence · 1300 words · est. cov. 97% · The weekly report
- **Situation.** Sam and David write the team's weekly report to the sending church: visitors, events, needs, thanks, prayer requests
- **New (11).** Wochenbericht† Besucher Teilnehmer Ergebnis Zusammenarbeit† Bedarf Unterstützung† Dank Gebetsanliegen† Fortschritt Entwicklung
- **Stage 0 top-up (0 tokens).** none
- **Recycle (78).** Vorteil Nachteil Unterschied ähnlich gleich verschieden wichtig einfach schwierig günstig praktisch bequem Qualität Auswahl lieber je desto jedoch tatsächlich Wohnort zwar außerdem allerdings anders Teil Mülltrennung Pfand Flasche Glas Papier Plastik Umwelt schützen Energie Klima Abfall Pflicht deshalb trotzdem deswegen System Interview Schicht Patient Station Pflege Nachtdienst hart Stress schaffen Abitur Prüfung bestehen Kollegin Traum träumen beobachten stolz Ende Kredit zurückzahlen Zinsen Verständnis Bank Konto ehrlich Sorge verlassen Fundbüro Zufall Fremde dankbar überraschen Mantel Schlüsselbund Spur Rätsel entdecken
- **Focus.** formal register, Genitiv (wegen + Genitiv), nominal style. Keys first met (expected): `genitive-preposition`.
- **Cast.** Sam, David

#### de-a2-2-20 · #69 · core · testimony · 1300 words · est. cov. 97% · Why I came to Germany
- **Situation.** Sam says why he came: how he heard of the work, what he feared, what surprised him, what he hopes; all tenses and Konjunktiv II
- **New (11).** Auftrag Zukunft senden mutig Dankbarkeit† Anfang Herausforderung† prägen† besonders Gnade Vorbild†
- **Stage 0 top-up (0 tokens).** none
- **Recycle (64).** Mülltrennung Pfand Flasche Glas Papier Plastik Umwelt schützen Energie Klima Abfall Pflicht deshalb trotzdem deswegen System Interview Schicht Patient Station Pflege Nachtdienst hart Stress schaffen Abitur Prüfung bestehen Kollegin Traum träumen beobachten stolz Ende Kredit zurückzahlen Zinsen Verständnis Bank Konto ehrlich Sorge verlassen Fundbüro Zufall Fremde dankbar überraschen Mantel Schlüsselbund Spur Rätsel entdecken Wochenbericht Besucher Teilnehmer Ergebnis Zusammenarbeit Bedarf Unterstützung Dank Gebetsanliegen Fortschritt Entwicklung
- **Focus.** all tenses, Konjunktiv II (Wenn ich nicht … hätte), Nebensätze in sequence.
- **Cast.** Sam

## 4. The existing drafts (Weg 1–3, Gespräche, Lesungen)

All 32 are machine-drafted, unreviewed and unpublished (`data/corpus/de/`: weg-1-01…08, weg-2-01…08, weg-3-01…06 = 22 texts, 3,089 words; gespraeche-1-01…06 = 650 words; deutschland-lesungen-1-01…04 = 682 words); the plan maps 32 of them to a unit; about 4,421 words, 9 % of the ladder. **"Off-plan"** = share of the draft's running words (names and numerals excluded; the adapter's first-reading lemma) whose lemma is neither in Stage 0 nor in the lists of the units up to the mapped one *(measured)*; ≤ 10 % means "as-is with small changes", 10–15 % "needs a pass", above that "outline only" (the writer keeps the situation and rewrites with the unit's words). Changes common to all: rename the cast to section 1.1; the Weg texts say *Max* for a dog and a boy; the Lesungen use *Herr Miller* for Daniel.

| draft | title | words | feeds | role in the unit | off-plan | grade | what to change (off-plan lemmas at that unit) |
|---|---|---:|---|---|---:|---|---|
| weg-1-01 | Ich bin Anna | 72 | de-a1-1-02 (#2) | Anna introduces herself and her house: becomes the household scene of "Sam's room" | 10% | as-is with small changes | braun nehmen jetzt hand sitzen lesen froh |
| weg-1-04 | Das Haus | 90 | de-a1-1-02 (#2) | the rooms of the house (opening scene) | 9% | as-is with small changes | glas×2 schlafen×2 hell nehmen hand lesen |
| gespraeche-1-02 | Beim Bäcker | 106 | de-a1-1-04 (#4) | a bakery dialogue: outline for the café scene | 33% | outline only | noch×4 denn×2 roggenbrot×2 zusammenmachen×2 dürfen welcher weißbrot vollkornbrot hm dunkel schmecken halt … |
| weg-1-03 | Lena hat Hunger | 80 | de-a1-1-04 (#4) | a hungry child asks for bread (breakfast scene) | 10% | as-is with small changes | sagen×3 jetzt rot mama papa sehen |
| weg-1-05 | Das Frühstück | 83 | de-a1-1-04 (#4) | the breakfast (core scene) | 6% | as-is with small changes | sagen×2 machen heiß warm |
| weg-1-08 | Der Abend | 84 | de-a1-1-05 (#5) | a family evening after the Sunday lunch | 11% | needs a pass | liegen schlafen sagen nacht jetzt wieder hand lesen froh |
| deutschland-lesungen-1-03 | Beim Bäcker und auf dem Markt | 158 | de-a1-1-06 (#6) | bakery and market in Germany: outline for the market scene (Brezel, Semmel, Wochenmarkt) | 45% | outline only | sagen×5 viele×4 man×3 bäckerei×2 schon×2 dass×2 oft×2 bezahlen×2 samstag×2 blume×2 samstagmorgen zeigen … |
| weg-2-02 | Auf dem Markt | 130 | de-a1-1-06 (#6) | the market: outline, vocabulary differs (Banane, Obst, Pfund, Stand) | 30% | outline only | sagen×5 mann×3 mitkommen×2 noch×2 banane×2 samstag platz vor dort immer obst gemüse … |
| weg-1-06 | Paul geht in die Stadt | 77 | de-a1-1-09 (#9) | Paul goes into town: the street scene | 14% | needs a pass | auto×2 fahren×2 bäckerei×2 blau braun wiedersehen sehen froh |
| weg-2-01 | Am Morgen | 129 | de-a1-1-10 (#10) | the morning, the bus and the car: travel scene | 13% | needs a pass | jeder×2 mitkommen×2 bus×2 zurückkommen×2 noch wollen jetzt viertel auto arbeit still ruhe … |
| weg-2-05 | Lena ist krank | 139 | de-a1-1-12 (#12) | Lena is ill: the sick-child scene | 17% | outline only | liegen×2 anrufen×2 spielen×2 zurückkommen×2 mitbringen×2 noch×2 montagmorgen dass ärztin freundlich traurig sehen … |
| weg-2-07 | Wo ist mein Buch? | 130 | de-a1-1-13 (#13) | where is my book: the lost-things scene | 15% | needs a pass | fragen×2 korb×2 schlafen×2 hinsehen×2 ansehen×2 weiterschlafen×2 sofa dort schrank flur doch genau … |
| weg-2-03 | Ein Anruf | 129 | de-a1-1-14 (#14) | a phone call: the message scene | 16% | outline only | opa×6 abholen×2 mittwochabend plötzlich klingeln dorf fragen dass rufen lange backen lachen … |
| gespraeche-1-01 | Hallo, ich bin Daniel | 108 | de-a1-2-01 (#16) | a first conversation (Daniel): opening dialogue | 16% | outline only | seit×2 mithelfen×2 neu keller herzlich willkommen denn nett erst sorge werden setzen … |
| gespraeche-1-04 | Am Telefon | 107 | de-a1-2-01 (#16) | a phone call: "Was machst du gerade?" | 19% | outline only | mitbringen×3 zusammenfrühstücken×2 keller holen mal telefon hausaufgabe fragen ob bus problem einfach … |
| weg-2-08 | Was machen wir am Samstag? | 126 | de-a1-2-03 (#18) | what shall we do on Saturday: the rainy Saturday | 16% | outline only | schwimmbad×3 fragen×2 zurückgehen×2 freitagabend sitzen abendbrot lieber vormittag nachmittag zuerst mittag danach … |
| weg-2-04 | Am Sonntag bei uns | 126 | de-a1-2-04 (#19) | told in the Perfekt: the Sunday visit (fits "Yesterday after work" as the family-visit scene) | 13% | needs a pass | opa×4 garten×2 pünktlich mitbringen abholen früh danach backen dort stück wurst bringen |
| deutschland-lesungen-1-01 | Mit dem Regionalzug und der Straßenbahn | 189 | de-a1-2-05 (#20) | regional train and tram: outline for the travel unit | 28% | outline only | nah×2 regionalzug×2 bildschirm×2 man×2 oft×2 wählen×2 manchmal×2 fahrt×2 ansagen×2 zeigen×2 seit besuchen … |
| weg-1-02 | Max und das Brot | 76 | de-a1-2-07 (#22) | the dog and the bread at the picnic | 11% | needs a pass | ball×5 hund×2 braun |
| deutschland-lesungen-1-04 | Zum ersten Mal bei einer deutschen Familie | 161 | de-a1-2-08 (#23) | the first invitation to a German family: a scene of "Sam's first week" | 27% | outline only | ausziehen×4 tür×3 schuh×3 pünktlich×2 man×2 mitbringen×2 blume×2 aufmachen×2 hereinkommen×2 hausschuh×2 samstagabend erst … |
| weg-2-06 | Frau Weber | 127 | de-a1-2-11 (#26) | Frau Weber: the old neighbour whose life the unit tells | 9% | as-is with small changes | hereinkommen×2 dank×2 allein mehr mitbringen korb ende geschehen nah |
| deutschland-lesungen-1-02 | Sonntag in der Gemeinde | 174 | de-a1-2-14 (#29) | a Sunday in the Gemeinde: outline for the service seen by Ben | 17% | outline only | leute×2 text×2 mitsingen×2 vorlesen×2 erst mal einladen beginnen eingang liederbuch kindergottesdienst erwachsene … |
| gespraeche-1-06 | Eine Einladung zum Abendbrot | 115 | de-a1-2-15 (#30) | an invitation to dinner: the invitation scene | 22% | outline only | vorhaben×2 eigentlich×2 passen×2 warum abendbrot wann fast prima problem einfach wenigstens blume … |
| weg-1-07 | Lena und Max im Park | 98 | de-a2-1-01 (#32) | children in the park: a childhood memory | 5% | as-is with small changes | holen×2 rot fliegen oh |
| weg-3-06 | Eine Brezel für zwei | 202 | de-a2-1-03 (#34) | how two people met in a bakery: told by Marta as the night story (Präteritum) | 17% | outline only | brezel×5 bäckerei×3 kennenlernen×2 ausstrecken×2 teilen×2 vorstellen×2 wintermorgen eilig einzig blech gleich moment … |
| gespraeche-1-05 | Nach dem Gottesdienst | 111 | de-a2-1-09 (#40) | after the service: the coffee scene | 8% | as-is with small changes | na man normal eben vergebung wichtig wohl übrigens prima |
| weg-3-05 | Der Kuchen für Frau Weber | 222 | de-a2-1-09 (#40) | a cake for a neighbour: the baking scene for the coffee after church | 14% | needs a pass | ofen×2 aufmachen×2 abschneiden×2 stück×2 einundachtzig samstagnachmittag rühren teig schlagen schüssel mehl zucker … |
| weg-3-03 | Der Zug, der zu spät kam | 226 | de-a2-1-11 (#42) | the train that was late: the delayed-train unit | 8% | as-is with small changes | feld×2 taxi×2 deshalb mitten stimme lautsprecher weiterfahren mittag anschlusszug nah bank wohin … |
| weg-3-04 | Der Sohn, der zurückkam | 294 | de-a2-1-14 (#45) | the son who came back: the parable unit (a 294-word retelling of Luke 15) | 8% | as-is with small changes | entgegenlaufen×2 zurufen×2 diener×2 herauskommen×2 teil wenige packen sache fern weg bauer denken … |
| weg-3-02 | Ein Brief an Oma | 211 | de-a2-1-15 (#46) | a letter to Grandmother: the letter unit | 7% | as-is with small changes | lieb×2 ob×2 zurückschreiben×2 dank passieren zweimal wand hängen lieblingsbaum abholen ach wau |
| gespraeche-1-03 | Wie komme ich zum Bahnhof? | 103 | de-a2-2-04 (#53) | asking the way: the direction dialogue | 12% | needs a pass | hinfahren×2 entschuldigung dauern etwa schaffen direkt moment straßenseite dank geschehen fahrt |
| weg-3-01 | Das Buch, das verschwunden war | 238 | de-a2-2-18 (#67) | the book that disappeared: the lost-object story | 5% | as-is with small changes | korb×2 hinlegen warum langweilen böse lächeln sessel wunderbar aufhören behalten zufrieden |

Not mapped: none.

**In place or absorbed.** The default is *absorbed*: the drafts are sources for one section of a controlled unit written to this plan (the writer owns the new document, `data/ladder/de/units/<id>.json`). Where the grade is "as-is with small changes", the draft could instead stay *in place*: an extra `ladder.json` entry `{ "kind": "controlled", "document": "../../corpus/de/<draft>.json" }` placed right after its unit (the gate reads in-place documents like any other). That is an owner decision because it adds units and words outside the totals above; candidates by measurement: weg-1-01 (after de-a1-1-02, 10 % off-plan); weg-1-04 (after de-a1-1-02, 9 % off-plan); weg-1-03 (after de-a1-1-04, 10 % off-plan); weg-1-05 (after de-a1-1-04, 6 % off-plan); weg-2-06 (after de-a1-2-11, 9 % off-plan); gespraeche-1-05 (after de-a2-1-09, 8 % off-plan); weg-1-07 (after de-a2-1-01, 5 % off-plan); weg-3-03 (after de-a2-1-11, 8 % off-plan); weg-3-02 (after de-a2-1-15, 7 % off-plan); weg-3-04 (after de-a2-1-14, 8 % off-plan); weg-3-01 (after de-a2-2-18, 5 % off-plan). The Weg 3 texts (200–290 words, Präteritum and relative clauses) are the best in-place material for a2-1: weg-3-04 (the prodigal son) and weg-3-01 are the two with the smallest off-plan share at their mapped units (8 % and 5 % at their mapped units).

## 5. The b1-bridge: how to fill it

### 5.1 What the library offers, measured against this ladder

The published library index (`public/library/de`, 1,833 of the 1,870 indexed texts measured (texts under 15 words skipped): 4 bridge texts, 28 Guerber school-reader stories in 1890s spelling, 210 Grimm tales (Kinder- und Hausmärchen 1850), 1,189 chapters of Luther 1912, Heidi, Biene Maja, Taugenichts, Fontane, Mann, Kafka, Lessing, Storm, Goethe, Schiller, Nietzsche, Kant, Lilienthal, one Global Voices excerpt) is overwhelmingly Scripture (698 k words of Luther 1912) and 19th-century prose; the only contemporary open-licence texts are the four 23–41-word bridge texts and one 219-word Global Voices excerpt. The ladder alone therefore cannot reach "comfortable" for any of it: the b1-bridge has to be mostly **adapted** text, with authentic texts placed as each clears the gate.

Method *(measured)*: the share of a text's running words whose lemma (the adapter's first reading; proper nouns and numerals known) is in Stage 0 or in any unit list of this plan — "end" — and the number of extra lemmas, taken in order of frequency, that would lift it to 88 % (the error line for authentic texts), 92 % (the warning line) and 95 % (the placement threshold of `ladder:place`). "First unit" = the first unit after which the share reaches the threshold if the plan is followed to the letter (the real gate counts three encounters, so reads slightly lower). These are estimates of what `npm run ladder:place -- --lang de <textId>` will say once the units exist.

| work or chapter | words | end % | +lemmas to 88 % | to 92 % | to 95 % | first unit ≥ 88 / 92 % | notes |
|---|---:|---:|---:|---:|---:|---|---|
| bridge-der-lowe-rennt-und-die-kuh-geht-ch01 | 41 | 70.7 | 8 | 9 | 10 | — / — | open licence; animals, sport |
| bridge-navy-und-bora-ch01 | 34 | 61.8 | 3 | 4 | 4 | — / — | open licence; animals, sport |
| bridge-schmetterling-und-tukan-ch01 | 41 | 73.2 | 4 | 4 | 5 | — / — | open licence; animals, sport |
| bridge-verstecken-spielen-ch01 | 23 | 69.6 | 5 | 6 | 6 | — / — | open licence; animals, sport |
| gv-de-91a9508ad151-excerpt-ch01 | 219 | 62.1 | 47 | 56 | 63 | — / — | Global Voices, open licence; Colombian film, 56 lemmas short |
| guerber-v1-story-02-ch01 | 911 | 89.8 | 0 | 3 | 7 | u36 / — | Guerber, 1890s spelling |
| guerber-v1-story-03-ch01 | 642 | 89.4 | 0 | 2 | 4 | u56 / — | Guerber, 1890s spelling |
| guerber-v1-story-09-ch01 | 4935 | 85.3 | 5 | 23 | 57 | — / — | Guerber, 1890s spelling |
| guerber-v1-story-01-ch01 | 1327 | 83.8 | 2 | 5 | 7 | — / — | Guerber, 1890s spelling |
| guerber-v1-story-06-ch01 | 1395 | 83.5 | 2 | 6 | 13 | — / — | Guerber, 1890s spelling |
| guerber-v1-story-15-ch01 | 1122 | 82.4 | 10 | 26 | 46 | — / — | Guerber, 1890s spelling |
| guerber-v1-story-07-ch01 | 1128 | 82.1 | 5 | 14 | 26 | — / — | Guerber, 1890s spelling |
| guerber-v1-story-08-ch01 | 1354 | 82.1 | 5 | 13 | 23 | — / — | Guerber, 1890s spelling |
| guerber-v1-story-05-ch01 | 2266 | 81.4 | 5 | 12 | 23 | — / — | Guerber, 1890s spelling |
| guerber-v1-story-04-ch01 | 1057 | 76.3 | 6 | 11 | 15 | — / — | Guerber, 1890s spelling |
| guerber-v1-story-14-ch01 | 1214 | 76.3 | 29 | 53 | 90 | — / — | Guerber, 1890s spelling |
| guerber-v1-story-10-ch01 | 656 | 74.4 | 17 | 30 | 50 | — / — | Guerber, 1890s spelling |
| guerber-v1-story-11-ch01 | 565 | 72.7 | 39 | 61 | 78 | — / — | Guerber, 1890s spelling |
| guerber-v1-story-13-ch01 | 684 | 72.7 | 30 | 54 | 74 | — / — | Guerber, 1890s spelling |
| guerber-v1-story-12-ch01 | 763 | 68.2 | 50 | 80 | 103 | — / — | Guerber, 1890s spelling |
| guerber-v2-story-03-ch01 | 1759 | 82.5 | 16 | 45 | 84 | — / — | Guerber vol. 2 |
| guerber-v2-story-01-ch01 | 1967 | 81.4 | 20 | 53 | 105 | — / — | Guerber vol. 2 |
| guerber-v2-story-06-ch01 | 2426 | 81.1 | 40 | 94 | 167 | — / — | Guerber vol. 2 |
| guerber-v2-story-04-ch01 | 2207 | 80.7 | 14 | 39 | 71 | — / — | Guerber vol. 2 |
| bible-jhn-14 | 711 | 92.3 | 0 | 0 | 9 | u37 / u69 | Luther 1912 |
| bible-jhn-17 | 607 | 90.8 | 0 | 2 | 11 | u50 / — | Luther 1912 |
| bible-jhn-16 | 754 | 87.4 | 1 | 9 | 23 | — / — | Luther 1912 |
| bible-jhn-3 | 750 | 85.2 | 5 | 17 | 39 | — / — | Luther 1912 |
| bible-jhn-9 | 827 | 85.2 | 3 | 13 | 26 | — / — | Luther 1912 |
| bible-jhn-15 | 568 | 85.0 | 3 | 11 | 22 | — / — | Luther 1912 |
| bible-1john-5 | 474 | 89.9 | 0 | 3 | 9 | u51 / — | Luther 1912 |
| bible-1john-4 | 485 | 86.4 | 1 | 6 | 14 | — / — | Luther 1912 |
| bible-1john-2 | 674 | 85.8 | 4 | 14 | 24 | — / — | Luther 1912 |
| bible-1john-1-complete | 236 | 84.3 | 3 | 8 | 15 | — / — | Luther 1912 |
| bible-1john-3 | 522 | 83.1 | 6 | 15 | 24 | — / — | Luther 1912 |
| grimm-khm-story-115 | 510 | 85.1 | 4 | 15 | 28 | — / — | Grimm 1850, dialect-free, short |
| grimm-khm-story-151 | 214 | 85.0 | 2 | 5 | 9 | — / — | Grimm 1850, dialect-free, short |
| grimm-khm-story-093 | 2083 | 83.5 | 15 | 48 | 89 | — / — | Grimm 1850, dialect-free, short |
| grimm-khm-story-153 | 300 | 83.0 | 7 | 14 | 23 | — / — | Grimm 1850, dialect-free, short |

Whole works (chapter medians; "lemmas needed" = median over chapters of the extra lemmas to reach 92 %):

| work | chapters | words | end % | median +lemmas to 92 % | to 95 % |
|---|---:|---:|---:|---:|---:|
| Guerber vol. 1 | 15 | 20,019 | 81.6 | 14 | 26 |
| Guerber vol. 2 | 13 | 27,961 | 77.6 | 67 | 114 |
| Luther, Johannes | 21 | 18,082 | 83.1 | 24 | 45 |
| Luther, 1 Johannes | 5 | 2,391 | 86.0 | 8 | 15 |
| Luther, Markus | 16 | 14,084 | 79.3 | 46 | 72 |
| Luther, Lukas | 24 | 24,156 | 80.0 | 61 | 88 |
| Luther, Rut | 4 | 2,263 | 80.6 | 26 | 43 |
| Luther, Jona | 4 | 1,164 | 77.7 | 24 | 33 |
| Luther, Psalmen | 150 | 37,808 | 74.6 | 27 | 34 |
| Luther, 1 Mose | 50 | 33,854 | 77.5 | 32 | 50 |
| Grimm, all 210 | 210 | 259,413 | 72.1 | 69 | 101 |
| Spyri, Heidi | 6 | 51,370 | 75.1 | 350 | 595 |
| Bonsels, Biene Maja | 18 | 36,645 | 72.5 | 213 | 264 |
| Eichendorff, Taugenichts | 11 | 31,347 | 72.6 | 312 | 408 |
| Kafka, Die Verwandlung | 3 | 19,208 | 74.6 | 456 | 645 |
| Storm, Immensee | 1 | 9,744 | 73.2 | 628 | 920 |
| Fontane, Effi Briest | 24 | 95,308 | 75.0 | 292 | 387 |
| Mann, Buddenbrooks | 98 | 229,843 | 68.3 | 321 | 378 |
| Goethe, Werther | 4 | 39,199 | 73.8 | 618 | 832 |

Reading the tables:

- **The Bible is nearer than the stories.** Johannes 14, 17 and 1 Johannes 4–5 are within 0–9 lemmas of 92 %, and the lemmas missing from all of John are a short closed set the plan deliberately does not teach as vocabulary: *wahrlich, abermals, alsbald, darum, darnach, solcher, euer, hin, hingehen, hinausgehen, siehe, andern, selber, gen, Jünger, Volk, Jude, Weib, Werke, Zeugnis, Geist, Sünde, erkennen, zeugen, nachfolgen*. A **receptive-Luther adapted unit** (section 5.2, B1-a) puts these in modern sentences, then the chapters are placeable.
- **The Guerber stories are not all alike.** Vol. 1 stories 02 (*Die drei Schläfer*) and 03 (*Der Hausvater*) sit at 89 % and need 3 and 2 more lemmas for 92 %; stories 01, 05, 06, 07, 08, 09, 15 need 6–27; 10–14 are 30–80 lemmas short (names, towns, soldiers). The shared gaps are *ach, lieb, böse, Mädchen, fortgehen, wiederkommen, sogleich, Krieg, Maus, Hund, fressen, Höhle, treten, hungrig, Stück, begegnen, Fisch, folgen, Prinzessin, Jüngling, König, golden, wunderschön, bestrafen, stehlen, erstaunen, Diener* — the vocabulary of fairy tale and legend, which a modern daily-life ladder does not have.
- **The 210 Grimm tales** are the biggest practical reading resource after the Bible and are 72 % at the end of the ladder (the tales under 600 words, 63 of them, 28 lemmas short at the median); dialect tales (*de, un, säd, dat, ik*, 4.5 % of the tokens of the first 40 tales read with no reading at all) stay in the library.
- **The novels** (Buddenbrooks, Effi Briest, Werther, Kafka, Heidi) need 200–600 lemmas per chapter beyond the ladder; they are library, not ladder, for now. Heidi (median 350 more lemmas per chapter), Biene Maja (213) and Taugenichts (312) are the nearest.
- **The Global Voices excerpt** needs 56 lemmas of contemporary cultural nonfiction; the four bridge texts need 4–9 each and share no vocabulary (animals, a name): one adapted unit about animals and sports makes all four placeable.

### 5.2 A fill plan for about 45 000 words (30–60 k allowed)

The lemma estimates assume the 1,112 lemmas of the plan are known at the start (about 50 k words read).

| block | words | kind | content | lemmas known at the end (estimate) |
|---|---:|---|---|---:|
| B1-a | ≈ 6 k | adapted (new text) | 6 units of about 1,000 words in the Leipzig setting that **re-use the lemmas of units 64–69** and add the receptive Luther forms (*wahrlich, abermals, alsbald, solcher, euer, hingehen, hinausgehen, darum, darnach, siehe*), the animal and school words of the four bridge texts, and ≈ 60 words of fairy-tale vocabulary (*König, Königin, Prinzessin, Prinz, Ritter, Riese, Zwerg, Hexe, Wolf, Fuchs, Katze, Maus, Hund, Wald, Berg, Höhle, Drache, böse, golden, fortgehen, wiederkommen, sogleich*) | ≈ 1,312 |
| B1-a placements | ≈ 6 k | authentic | the four bridge texts (139 words); Luther: 1 Johannes 4–5 and Johannes 14 and 17 (about 2.4 k words) as each clears 92 %; Guerber v1 *Die drei Schläfer* and *Der Hausvater* (1.5 k) | ≈ 1,372 |
| B1-b | ≈ 12 k | adapted | 12–14 units in the domains the ladder is thin on: contemporary explanation and nonfiction on Germany (the school system, the Bundesländer, the tram network, the euro and cash, the Pfand, voting, Christmas markets, church tax and the Landeskirche), correspondence (emails, the weekly report, a Kündigung), biography of composite or consenting people (an Aussiedler, a Syrian pastor, a Turkish-German baker), practical documents (a lease, a doctor's letter), new lemmas ≤ 3 per 100 | ≈ 1,672 |
| B1-b placements | ≈ 6 k | authentic | the rest of Guerber v1 (seven more stories as each clears 92 %), the Global Voices excerpt, the 10–20 shortest Grimm tales that clear 92 % (*Die Bremer Stadtmusikanten*-length texts are 2 k; start with tales under 400 words), Luther: Johannes 3, 9, 15 and 16 and 1 Johannes 1–3 (about 3.4 k words); together with the B1-a placements and the retellings Scripture stays at or under 15 % of the b1-bridge, about 6.5 k words, and the gate warns only above 40 % | ≈ 1,762 |
| B1-c | ≈ 5 k | adapted | 5 units preparing the 19th-century voice: longer sentences, the Präteritum of strong verbs in the literary register, Konjunktiv I in reported speech, older spellings made visible (*Thür, thun, gieb, daß, Theil*) so that the learner meets them once on purpose, genitive objects and the past participle as adjective | ≈ 1,962 |
| B1-c placements | ≈ 10 k | authentic | Guerber vol. 1 stories 09–15 and vol. 2 stories 01–06; Grimm 40–60 further tales under 1,000 words; Bonsels *Die Biene Maja* ch. 1–6, Spyri *Heidi* part 1 (the nearest novels, 214–356 lemmas per chapter beyond the ladder at the start of the bridge, about 100–150 after B1-c) | ≈ 2,112 |

At the end the learner would have met about **2,112** lemmas three times (estimates: 3 new lemmas per 100 adapted words plus the unknown words of each authentic text). That puts the Guerber stories at about 92–95 %, Biene Maja and Heidi near 90–92 %, and still leaves Eichendorff, Storm, Kafka, Fontane and Mann in the library (Immensee needs 628 more at 92 % today; Effi Briest ≈ 290 per chapter). **The Luther Bible (1,189 chapters, 698 k words) and the 210 Grimm tales are the two resources that become comfortable first**; Luther's Psalms (median 27 lemmas to 92 %), Genesis (32), Johannes (24), Lukas (61) and Markus (46) are close at the end of the ladder.

### 5.3 If no library text fits: the adapted texts to commission

1. **Receptive-Luther unit(s)**: short original narratives in modern German that use *wahrlich, abermals, alsbald, solcher, euer, hin-, darnach* in Bible-like sentences, quoting no Luther text. Needed before any Luther chapter is placed.
2. **Fairy-tale and legend vocabulary in modern sentences** (animals, king, forest, cave, dragon, "es war einmal"): 2–3 units, then Guerber v1 and the Grimm tales.
3. **Contemporary explanation and nonfiction about Germany and Leipzig** (the library has none): 800–1,500 words each, facts checked by a person; about 8 units.
4. **Correspondence and practical documents**: team reports, prayer letters (Rundbriefe), minutes, notices, forms, a Mietvertrag, a doctor's letter, health instructions; about 6 units.
5. **Biographies of composite or consenting people**: about 4 units; never real persons without their agreement.
6. **Scripture retellings in plain German** (Joseph, Ruth, Jonah, Lazarus), at most 10–15 % of the stage.
7. **Voice preparation**: adapted extracts that keep the syntax of Spyri, Bonsels or Grimm and replace the rarest words. The library's rights records say `verified-public-domain` / `verified-open-licence` for these works, so a modified edition is allowed; the owner confirms (`docs/german/RIGHTS.md`).
8. **More open contemporary sources to acquire**, each checked per text by a person: further Global Voices Deutsch articles, other CC BY / CC BY-SA sources. Measure their lemma gap as in 5.1 before acquiring.
9. **Listening**: every b1 adapted unit should be recordable in one sitting (≤ 1,100 words), because native audio is the bottleneck.

### 5.4 Hold or avoid

- **Dialect Grimm tales** (Low German: *de, un, säd, dat, ik, se, fru*; 4.5 % of the tokens of the first 40 tales have no reading at all) and **verse** (Max und Moritz, Struwwelpeter, Faust, Wilhelm Tell): library, not ladder.
- **The Guerber vol. 2 stories with names and place-names as the main difficulty** (Rita, Basti, Falkenburg, Hohenburg, Tannenburg, Elsa, Emma: the adapter reads names as ordinary nouns, so each name is a "new lemma" in every text): they gain a few points when the adapter learns names, not when the ladder grows.
- **Any text in older spelling** needs the older spelling to be analysed by the adapter (*daß, Thür, giebt, gewiß*; section 7.4). Guerber is 1890s; Luther 1912 is mostly modern in spelling; Grimm 1850 uses *Thüre, andern, abermals*.
- **Nietzsche, Kant, Lilienthal, Goethe's Faust**: not candidates (65–70 % at the end of the ladder; sentences of 22–30 words).
- **Whole-library rights**: the Luther 1912 and Guerber records read `verified-public-domain`; confirm per work before placing a chapter in a published ladder (`docs/german/RIGHTS.md`).

### 5.5 First placements to run when `ladder:place` can read the units

`npm run ladder:place -- --lang de <textId>`, in this order (percentages are with this ladder alone, in the idealised reading above): `text:de:bridge-schmetterling-und-tukan-ch01`, `…bridge-verstecken-spielen-ch01`, `…bridge-navy-und-bora-ch01`, `…bridge-der-lowe-rennt-und-die-kuh-geht-ch01` (each 70 % now, 4–9 lemmas short); `text:de:bible-jhn-14` (92.3 %), `bible-jhn-17` (90.8), `bible-1john-5` (89.9), `bible-jhn-16` (87.4), `bible-1john-4` (86.4), `bible-1john-2`, `bible-jhn-3`, `bible-jhn-9`; `text:de:guerber-v1-story-02-ch01` (89.8), `…story-03-ch01` (89.4), then `story-09, 06, 15, 01, 05, 07, 08`; `gv-de-91a9508ad151-excerpt-ch01`; then the shortest Grimm tales (`grimm-khm-story-151, 115, 154, 109, 209`). Expect each to say "could enter after unit N" only after the adapted b1 units exist; today it says "library, not ladder (best: …)".

## 6. Words to add to the word list (for the German session to review)

156 of the plan's 1,024 lemmas are read by rule, not from the word list (the adapter marks them `unconfirmed`, "inferred by the rules"). Their singular is recognised; **plurals, genitives and the participles of the verbs are not tied to the same lemma** (section 7.2). Add them (with the gender, genitive and plural for nouns, the principal parts for strong verbs) before the units are drafted. Gender and glosses below are from the local Wiktionary extract (`kaikki.org` German), glosses shortened; the six words with no entry there were glossed by the planner. Neither is native-checked.

| word | POS | gender / note | gloss | first unit |
|---|---|---|---|---|
| Rucksack | noun | m | backpack | de-a1-1-13 |
| Regenschirm | noun | m | umbrella | de-a1-2-03 |
| Wäsche | noun | f | laundry | de-a1-2-04 |
| Picknick | noun | n | picnic | de-a1-2-07 |
| Kurs | noun | m | course, class | de-a1-2-08 |
| Praxis | noun | f | doctor's practice, surgery | de-a1-2-09 |
| Kindheit | noun | f | childhood | de-a1-2-11 |
| Jugend | noun | f | youth | de-a1-2-11 |
| Hochzeit | noun | f | wedding | de-a1-2-11 |
| Zutat | noun | f | ingredient | de-a1-2-12 |
| Kollekte | noun | f | collection (in church) | de-a1-2-14 |
| Mechaniker | noun | m | mechanic | de-a1-2-16 |
| Spielplatz | noun | m | playground | de-a2-1-02 |
| Veränderung | noun | f | change | de-a2-1-02 |
| Blitz | noun | m | a bolt of lightning | de-a2-1-04 |
| Donner | noun | m | thunder | de-a2-1-04 |
| beruhigen | verb | weak | to calm down | de-a2-1-04 |
| Pullover | noun | m | sweater | de-a2-1-05 |
| Leiter | noun | f | ladder (die Leiter; der Leiter = leader) | de-a2-1-06 |
| Gruppe | noun | f | group | de-a2-1-07 |
| zusagen | verb | weak | to accept | de-a2-1-07 |
| Link | noun | m | link (internet) | de-a2-1-07 |
| kämmen | verb | weak | to groom | de-a2-1-08 |
| Zahnbürste | noun | f | toothbrush | de-a2-1-08 |
| Zahnpasta | noun | f | toothpaste | de-a2-1-08 |
| Brotdose | noun | f | lunch box | de-a2-1-08 |
| Schulweg | noun | m | way to school | de-a2-1-08 |
| Gesangbuch | noun | n | songbook | de-a2-1-09 |
| Helfer | noun | m | helper | de-a2-1-09 |
| Ablauf | noun | m | order of events, procedure | de-a2-1-09 |
| Andacht | noun | f | short devotion | de-a2-1-09 |
| Saal | noun | m | hall | de-a2-1-09 |
| Gemeindehaus | noun | n | church hall | de-a2-1-09 |
| Krankenwagen | noun | m | ambulance | de-a2-1-10 |
| Pflaster | noun | n | sticking plaster | de-a2-1-10 |
| Spritze | noun | f | syringe | de-a2-1-10 |
| impfen | verb | weak | to inoculate | de-a2-1-10 |
| Impfung | noun | f | vaccination | de-a2-1-10 |
| Zahnarzt | noun | m | dentist | de-a2-1-10 |
| Durchsage | noun | f | An announcement over loudspeakers or on the radio. | de-a2-1-11 |
| Anschluss | noun | m | connection (train) | de-a2-1-11 |
| Auskunft | noun | f | information (desk) | de-a2-1-11 |
| Ersatz | noun | m | replacement | de-a2-1-11 |
| Werkstatt | noun | f | workshop | de-a2-1-12 |
| Reifen | noun | m | tyre | de-a2-1-12 |
| Erzieherin | noun | f | nursery teacher (f.) | de-a2-1-12 |
| austauschen | verb | weak | to exchange | de-a2-1-12 |
| Feierabend | noun | m | end of the working day | de-a2-1-12 |
| Million | noun | f | million | de-a2-1-13 |
| Währung | noun | f | currency | de-a2-1-13 |
| Norden | noun | m | north | de-a2-1-13 |
| Süden | noun | m | south | de-a2-1-13 |
| Osten | noun | m | East | de-a2-1-13 |
| Westen | noun | m | west | de-a2-1-13 |
| Kilometer | noun | m | kilometer | de-a2-1-13 |
| Erbe | noun | n | inheritance | de-a2-1-14 |
| vermissen | verb | weak | to miss | de-a2-1-15 |
| Päckchen | noun | n | packet | de-a2-1-15 |
| Mail | noun |  | alternative form of E-Mail | de-a2-1-15 |
| Missionar | noun | m | missionary | de-a2-1-16 |
| Mission | noun | f | mission | de-a2-1-16 |
| Theologie | noun | f | theology | de-a2-1-16 |
| Visum | noun | n | visa | de-a2-1-16 |
| Abschied | noun | m | parting | de-a2-1-16 |
| Heimweh | noun | n | homesickness | de-a2-1-16 |
| gewöhnen | verb | weak | to accustom | de-a2-1-16 |
| Berufung | noun | f | calling, vocation | de-a2-1-16 |
| Spende | noun | f | donation | de-a2-1-16 |
| Gebühr | noun | f | fee | de-a2-1-17 |
| Öffnungszeit | noun | f | opening hours | de-a2-1-17 |
| Bescheinigung | noun | f | certificate | de-a2-1-17 |
| Wohnsitz | noun | m | domicile | de-a2-1-17 |
| Erlaubnis | noun | f | permission | de-a2-1-17 |
| Kaution | noun | f | deposit (on a flat) | de-a2-1-18 |
| Nebenkosten | noun |  | side costs | de-a2-1-18 |
| möblieren | verb | weak | to furnish | de-a2-1-18 |
| Quadratmeter | noun | m | square metre | de-a2-1-18 |
| verabreden | verb | weak | to arrange | de-a2-2-01 |
| Hauskreis | noun | m | house group, small group | de-a2-2-02 |
| Trost | noun | m | consolation | de-a2-2-02 |
| Neuigkeit | noun | f | news | de-a2-2-03 |
| Video | noun | n | video | de-a2-2-03 |
| überqueren | verb | weak | to cross | de-a2-2-04 |
| Meter | noun | m | meter | de-a2-2-04 |
| Stock | noun | m | floor, storey (zweiter Stock) | de-a2-2-04 |
| Hinweis | noun | m | hint, notice | de-a2-2-04 |
| Hausordnung | noun | f | house regulations | de-a2-2-05 |
| Regel | noun | f | rule | de-a2-2-05 |
| Mülltonne | noun | f | wheelie bin | de-a2-2-05 |
| Treppenhaus | noun | n | stairwell | de-a2-2-05 |
| abstellen | verb | weak | to put down | de-a2-2-05 |
| lüften | verb | weak | to air | de-a2-2-05 |
| beachten | verb | weak | to note | de-a2-2-05 |
| Versammlung | noun | f | meeting, assembly | de-a2-2-06 |
| Abstimmung | noun | f | vote | de-a2-2-06 |
| abstimmen | verb | weak | to vote | de-a2-2-06 |
| Protokoll | noun | n | minutes | de-a2-2-06 |
| Tagesordnung | noun | f | agenda | de-a2-2-06 |
| Baustelle | noun | f | building site | de-a2-2-06 |
| Veranstaltung | noun | f | event | de-a2-2-06 |
| organisieren | verb | weak | to organize | de-a2-2-06 |
| Flyer | noun | m | flyer | de-a2-2-08 |
| Aktion | noun | f | campaign, action | de-a2-2-08 |
| Jugendkreis | noun | m | youth group | de-a2-2-08 |
| Liste | noun | f | list | de-a2-2-08 |
| Vorbereitung | noun | f | preparation | de-a2-2-08 |
| drucken | verb | weak | to print | de-a2-2-08 |
| Ratschlag | noun | m | piece of advice | de-a2-2-09 |
| Grippe | noun | f | flu | de-a2-2-09 |
| Besserung | noun | f | recovery (gute Besserung) | de-a2-2-09 |
| Übelkeit | noun | f | nausea | de-a2-2-09 |
| Durchfall | noun | m | diarrhea | de-a2-2-09 |
| Hausarzt | noun | m | family doctor | de-a2-2-09 |
| Notaufnahme | noun | f | emergency room | de-a2-2-09 |
| Symptom | noun | n | symptom | de-a2-2-09 |
| Räuber | noun | m | robber | de-a2-2-10 |
| Samariter | noun | m | Good Samaritan | de-a2-2-10 |
| Herberge | noun | f | hostel | de-a2-2-10 |
| Wirt | noun | m | innkeeper | de-a2-2-10 |
| Gesetzeslehrer | noun | m | teacher of the law (Bible) | de-a2-2-10 |
| ausrauben | verb | weak | to rob | de-a2-2-10 |
| Mitleid | noun | n | pity | de-a2-2-10 |
| pflegen | verb | weak | providing care or service for someone/something | de-a2-2-10 |
| Blog | noun | n | blog | de-a2-2-11 |
| Tagebuch | noun | n | diary | de-a2-2-12 |
| Abreise | noun | f | departure | de-a2-2-12 |
| Unterkunft | noun | f | accommodation | de-a2-2-12 |
| Gastfamilie | noun | f | host family | de-a2-2-12 |
| Begegnung | noun | f | encounter | de-a2-2-12 |
| beeindrucken | verb | weak | to impress | de-a2-2-12 |
| Gastfreundschaft | noun | f | hospitality | de-a2-2-12 |
| Heimreise | noun | f | homeward journey | de-a2-2-12 |
| Landschaft | noun | f | landscape | de-a2-2-12 |
| Mülltrennung | noun | f | waste sorting | de-a2-2-14 |
| Pfand | noun | n | deposit (on bottles) | de-a2-2-14 |
| Plastik | noun | n | plastic | de-a2-2-14 |
| Klima | noun | n | climate | de-a2-2-14 |
| System | noun | n | system | de-a2-2-14 |
| Interview | noun | n | interview | de-a2-2-15 |
| Schicht | noun | f | shift (at work) | de-a2-2-15 |
| Pflege | noun | f | care, nursing | de-a2-2-15 |
| Nachtdienst | noun | m | night service | de-a2-2-15 |
| Stress | noun | m | stress | de-a2-2-15 |
| Kredit | noun | m | loan | de-a2-2-17 |
| zurückzahlen | verb | weak | to pay back | de-a2-2-17 |
| Verständnis | noun | n | understanding | de-a2-2-17 |
| Fundbüro | noun | n | lost and found | de-a2-2-18 |
| Schlüsselbund | noun | m | A number or set of keys | de-a2-2-18 |
| Wochenbericht | noun | m | weekly report | de-a2-2-19 |
| Zusammenarbeit | noun | f | collaboration | de-a2-2-19 |
| Unterstützung | noun | f | support | de-a2-2-19 |
| Gebetsanliegen | noun | n | prayer request | de-a2-2-19 |
| Dankbarkeit | noun | f | gratitude | de-a2-2-20 |
| Herausforderung | noun | f | challenge | de-a2-2-20 |
| prägen | verb | weak | to mint | de-a2-2-20 |
| Vorbild | noun | n | model | de-a2-2-20 |

**Also wanted in the word list, not scheduled** (used by the b1-bridge or substitutes): König, Königin, Prinz, Prinzessin, Ritter, Riese, Zwerg, Hexe, Wolf, Fuchs, Katze, Maus, Hund, Höhle, Drache, böse, golden, Krieg, Fisch, Löwe, Ente, Elefant, Schlange, Papagei, Schmetterling; Jünger, Volk, Jude, Weib, Geist, Zeugnis; Christmas market, Wochenmarkt, Kita, Bürgeramt, Landeskirche, Kirchensteuer, Rundbrief. The list also lacks `wehtun` as a unit (the adapter reads *tut weh* as *tun* + an unknown *weh*), *kaputt* (read as `kaputen`), *fest* (read as `fesen`), *anstrengend, blond, einsam, klettern, basteln, verantwortlich, ansteckend, ungern* (no reading at all; the plan avoids them).

## 7. Adapter points the gate will trip on (measured evidence)

All examples were run through `createAdapterRegistry().get("de")` with `tokenize` and `analyze` on 2026-10-06 (`adapter-de@6`); the lemma is the first candidate's, lower-cased, as in `src/ladder/analyse.ts`. The adapter was being fixed by another session; each point should be re-run after its changes.

**7.1 Names.** `Sam` and `Ben`: no reading at all (the gate counts them as the lemmas `sam` and `ben`; both are secure after Stage 0: 16 and 7 tokens). `Marta`: `Marta/NOUN`, 2 tokens in Stage 0, so a top-up item (unit 03). Of 112 names tried in the frame *Das ist X.* (45 PROPN, 62 NOUN, 5 no reading): PROPN for Anna, Lukas, Thomas, Daniel, Jonas, Michael, Peter, Paul, Lena, Max, Sabine, Andreas, Klaus, Maria, Johannes, Martin, Jakob, Ruth, David, Hans, Eva, Weber, Schmidt, Berlin, Leipzig, Dresden, Hamburg, München, Köln, Frankfurt, Stuttgart, Deutschland, Österreich, Schweiz, Sachsen, Bayern, Europa, USA, Rhein, Luther, Jesus, Christus, Paulus, Petrus, Abraham; **NOUN** for Marta, Elena, Katharina, Markus, Julia, Mehmet, Stefan, Petra, Hannah, Felix, Lisa, Karin, Sophie, Emma, Leon, Nico, Karla, Sarah, Esther, Lydia, Simon, Tobias, Jörg, Heike, Frank, Ingrid, Gerhard, Müller, Fischer, Meyer, Wagner, Becker, Schulz, Hoffmann, Schneider, Koch, Bauer, Richter, Klein, Wolf, Neumann, Braun, Zimmermann, Hartmann, Berg, Hannover, Bremen, Erfurt, Halle, Jena, Nürnberg, Freiburg, Amerika, Texas, Elbe, Bach, Lazarus, Mose; **no reading** for Sam, Ben, Tim, Jan, Ute. In the library 8.8 % (Guerber v1), 10.7 % (v2) and 11.4 % (Grimm) of the tokens have an *unconfirmed first reading* — mostly nouns and names not in the list (*Heinrich, Betty, Hänsel, Grethel, Riese, Pfannkuchen, Einsiedler*). The plan uses PROPN-safe names only and adds *Weber / Schmidt* and *Leipzig* as the only surname and city of the cast. A name that is read as a noun costs three unknown tokens per unit until it has been met three times.

**7.2 Separable verbs, compounds, and words not in the word list.** (a) *Ich rufe dich morgen an* → `rufe` and `an` are both `anrufen/VERB`, ADP; likewise *Er steht um sieben Uhr auf* (`aufstehen`), *Der Zug fährt ab* (`abfahren`), *Kommst du mit?* (`mitkommen` twice). The plan has 43 separable verbs among its new lemmas (˘ in section 3.2): the "three tokens" rule of 2.4 is what keeps the arithmetic right. The particle is a token of the verb and not of the preposition (*an*, *auf*, *mit*, *um*, *aus*, *zu* remain separate lemmas). A prefix that is separable or inseparable by sense is resolved by the verb: *übersetzt* → `übersetzen`; *Wir fahren den Hund um* → `umfahren`. (b) **Compounds are unconfirmed lemmas** unless they are in the word list: *Krankenhausküche* → one new lemma with parts `Krankenhaus` + `Küche` (reading unconfirmed, confidence 0.55); the plan has 51 compound lemmas. (c) **Inflected forms of a noun not in the list become separate lemmas**: `Kurs / Kurse / Kurses`, `Praxis / Praxen`, `Mülltonne / Mülltonnen`, `Spritze / Spritzen`, `Verband / Verbände`, `Mechaniker / Mechanikerin`. (d) **Verbs not in the list get wrong lemmas on the participle and the imperative**: *Er beachtet die Regel* → `beachten` but *Wir haben es beachtet* → `beachen`, *Beachte das!* → noun `Beachte`; *Sie vermisst ihre Heimat* → `vermissen` but *Er hat uns vermisst* → `vermisen`. The 156 † words of section 6 are exactly the ones exposed to this.

**7.3 Wrong or unexpected first readings** (each is counted by the gate as the lemma shown):

| form | first reading | effect |
|---|---|---|
| *Meister* | `viel/ADJ` | *Meister* is silently "known" once *viel* is known (the plan drops it) |
| *kaputt* | `kaputen/VERB` | consistent but nonsense; a new lemma `kaputen` is counted |
| *fest* (adj.) | `fesen/VERB` | same |
| *weh* in *tut weh* | no reading | the gate counts the lemma `weh`; *tut* is `tun`; `wehtun` is not a lemma (planned as two new lemmas, unit 12) |
| *leid* in *es tut mir leid* | `leiden/VERB` | the phrase is `tun` + `ich` + `leiden` |
| *geboren* | `gebären/VERB` | the lemma to schedule is `gebären` (done) |
| *verboten, erlaubt* | `verbieten`, `erlauben` | participial adjectives resolve to the verb (done) |
| *unser* (determiner) | `unser/DET`; stand-alone *unser* → `wir/PRON` | scheduled as a new function lemma (unit 16) |
| *alles* | `alle/DET` | so *alles* is `alle`; scheduled as `alle` (unit 06) |
| *der Kranke, der Deutsche, ein Fremder* | `Kranke`, `Deutsche`, `Fremde` | not `krank`, `deutsch`, `fremd`: separate lemmas |
| *Reise* (alone) | `Reis` | in a sentence (*die Reise war lang*) the reading is `Reise`; the bare word is a trap for any single-word check |
| *E-Mail* | `E` (no reading) + `Mail/NOUN` | two tokens, one of them unreadable; the plan schedules `mail` (unit 46) and writers use *Mail* or *Nachricht* |
| *Ärztin, Lehrerin, Studentin, Kollegin, Mechanikerin* | each its own lemma | feminine forms are not folded into the masculine: the plan schedules *Lehrerin, Ärztin, Erzieherin, Kollegin, Krankenschwester*; any other feminine form is an unscheduled new lemma |
| *das Gebet* | `Gebet` (in a sentence); bare token `geben` | fine in text |
| *Schloss* | `Schloss/NOUN` after an article, but *schloss* (preterite of *schließen*) is `schließen` | homograph; the plan keeps *Schloss* for unit 60 and uses the preterite of *schließen* in 32–33: both known |
| *möchte* | `mögen/AUX` | counts as `mögen` (known) |
| *Kosten / kosten, Bitte / bitte, Morgen / morgen, Deutsch / deutsch, Essen / essen* | lower-cased to one lemma | the gate lowercases: noun and verb/adverb share a lemma (harmless; *Kosten* was therefore not scheduled) |
| *Sie* (formal) | `Sie/PRON` → `sie` | merges with *sie*: formal *Sie* is free from Stage 0 on |
| *ihr / Ihr* | `ihr/DET` and `ihr/PRON`, both `ihr` | a Stage 0 weak lemma (2 tokens); first use costs one token |

**7.4 Older spellings and archaic forms.** *daß* is read as `dass/SCONJ` (good) and *Thüre* gets an unconfirmed `Thüre`; *gewiß* and *gieb's* get no reading. Share of tokens with **no reading** *(measured)*: Guerber v1 0.9 % (*sogleich, los, bitterlich, tadellos, undankbar, augenblicklich, inbrünstig, wunderschön, gewiß, streicheln, überrumpeln*), v2 1.4 % (*sogleich, schüchtern, eifrig, herbei, mehrmals, gütig, freudig, fröhlich, dreimal, gewöhnlich, ungeduldig, zärtlich*), Grimm (first 40 tales) 4.5 % (Low German: *un, de, säd, dat, he, se, fru, nich, ik, as, do*; and *andern, hinab*), Luther John 1.3 % (*wahrlich, abermals, andern, gen, richtet, ewiglich, dieweil, wahrhaftig, alsbald, allda*), Mark 1.5 % (*alsbald, abermals, gen, darnach, wachet, begab, dieweil, allda*). **Words with no reading are counted by their surface form**, so every inflected form of such a word is a separate lemma (*strenge / strengen* would be, though *strenger* is read as `streng`). These tokens are what keeps authentic texts under 92 % even when the ladder has the vocabulary; they are the adapter's, not the ladder's, to fix.

**7.5 Detectors.** There is **no key for the Präteritum** (*Er ging nach Hause und aß ein Brot.* → none), none for the plain accusative object, W-questions or `werden` as a main verb; `reflexive-verb` is silent on *Sie hat sich die Zähne geputzt*; `sentence-bracket-perfect` fires on every haben/sein + participle including *Wir haben gesungen*; `modal-infinitive` fires on *Man darf hier nicht rauchen* together with `man-impersonal`; `dative-object-verb` fires on *gehört mir* but not on *gab dem Kind ein Buch*; `konjunktiv-1` fires on *sei* in *Er sagte, er sei krank* (a receptive form). So the gate's "constructions first met" column cannot confirm the Präteritum in 32–35 or the dative in 37; it can confirm 06, 19, 28, 36, 38, 44, 45, 48, 51, 57, 58, 62, 63, 68 (section 3.2, "keys first met (expected)").

**7.6 Where the plan is exposed.** If the adapter's word list grows to include the † words and the names, the unknown-token cost of units 09–69 falls by about 1 point per unit and the plan gains slack; if it does not, the est. cov. figures in the tables are optimistic by 1–2 points in a2 (plurals and participles of † words are unknown even after their introducing unit).

## 8. Under-specified, risky, or decided by someone else

1. **The b1-bridge is a brief, not a unit plan.** Its units cannot be listed before a2-2 exists and the real lemma set is measured; section 5 gives the composition, the gaps and the order of placements, nothing more.
2. **Units 01–08 depend on a decision about Stage 0.** If two top-up scenes are added to Stage 0 the 29 top-up tokens disappear, units 01–02 reach 90 % and the budgets of 03–08 can be raised by one lemma each. If not, units 01–02 sit at 89 % and 88 % (inside the lower band) and 03–08 reach their est. cov. only if the writers use the top-up lemmas exactly as many times as stated. *Marta* (a common noun to the adapter) is a top-up item in unit 03: do not use her name in 01–02.
3. **The plan sits at 89–92 % in a1-1, 89–93 % in a1-2, 91–97 % in a2-1 and 92–99 % in a2-2 (from unit 03).** The core units have 1–3 points of slack over the 88 % warning line; one extra new word or one lemma used fewer than three times lowers a unit by 0.2–0.5 points. The estimates are arithmetic, not measurement: they assume every listed word is read as its listed lemma (section 7.3). **The cliff rule** (a drop of more than 6 points below the mean of the previous three units) is safe on paper — the largest planned drop is 2.7 points at de-a2-2-04; the real risk is a volume unit (95–98 %) followed by a core unit (89–91 %) once the volume units are written with natural vocabulary and read lower than planned.
4. **Recycling is dense.** Three encounters per new lemma within six units means 2–9 tracked content words per 100 running words that the writer must place (the heaviest unit: 8.6 per 100). The assignment is by theme overlap and load, not by meaning: some pairings are awkward; the writer may move a word to the nearest unit and tell the plan owner. Function words are exempt.
5. **Units 64–69 introduce 59 lemmas; those of 67–69 (32) cannot be recycled three times inside the ladder**; the gate does not judge the last six units, but the b1-bridge must start by using them (section 5.2, B1-a).
6. **Scripture units (25, 45, 59) are retellings written for the course**, not quotations; they need a Scripture-competent reviewer as well as the linguistic one. Quoted verses would bring Luther's 1912 forms (*wahrlich, abermals, solcher*) and the rights check per verse; the retellings avoid both.
7. **Adapter detectors missing** for the Präteritum, reflexives in the perfect, the plain accusative and W-questions (section 7.5), and the adapter word list lacks 156 plan words (section 6): both are the German session's, not the ladder's.
8. **German usage is unverified.** Every choice here (Sie / du in the Gemeinde, *Brötchen* and *Abendbrot* as the Leipzig words, *Anmeldung* and *Bürgeramt* as the registration vocabulary, the reality of Kfz-Ausbildung, Krankenkasse and Hausordnung as described, the Gemeinde in Leipzig as a Freikirche) is the planner's reading, not a native's: a native reviewer should read the plan before the texts are drafted, not after. The city is a frame: swap Leipzig for any city whose name the adapter reads as a proper noun (Dresden, Berlin, Hamburg, München, Köln, Frankfurt, Stuttgart).
9. **a1 is 13,150 words**, below the 15 k lower bound that `docs/LADDER.md` calls indicative; three or four volume units would close it without touching the vocabulary budget; they are not planned because the owner's per-unit ranges and unit count were fixed.
10. **Audio**: every unit is meant to be recordable in one sitting (a1 ≤ 400 words; a2-2 ≤ 1,300), but nothing here schedules recordings or reviewers; `docs/audits/B2-AUDIT.md` items 2–3 (a named native reviewer, native audio) are still the precondition for any unit to reach a learner.
11. **This plan is prose.** The German session should turn the unit blocks into `ladder.json` entries plus a per-unit allowed-lemma list (Stage 0 + all earlier lists + the unit's own) so that writers and the gate read the same data; hand-copying 1024 lemmas will introduce errors. The units' `new` strings in section 3.2 are the data.
12. **The recycle lists were assigned by a program, the new lists by hand** (one pass over the frequency lists of Guerber, Luther, the Weg drafts and a general frequency check): the closed-class basics (*sagen, werden, sich, von, aus, so, da, sollen, lassen, nicht mehr, doch, denn*) were moved to units 01–17 after the first check showed they were missing; if a writer needs another basic word in a1-1, add it to the unit and tell the plan owner rather than avoid it.

