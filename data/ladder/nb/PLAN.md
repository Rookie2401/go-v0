# Bokmål ladder: plan, style and the b1-bridge (a1-1 ... a2-2, and 24 bridge units)

Written 2026-10-07 by Team Norway package D for `data/ladder/nb/ladder.json` (contract: `docs/LADDER.md`); the coverage, recurrence and recycling pass over the 48 early units and the 24 controlled `b1-bridge` units (section 7) were added on 2026-10-08. **Nothing here is reviewed by a native speaker or by any person.** Every unit is a machine draft (`pipeline.state: machine-draft`, by a tool), `review.status: unreviewed`, so no unit publishes: a ladder unit publishes only from `audio-ready`. The figures below are those printed by `npm run ladder:check -- nb` on 2026-10-08 with the real analyzer (`adapter-nb`); they will move when the analyzer or its lexicon changes, so re-run the gate rather than trusting a decimal.

**State on 2026-10-08:** 72 controlled units, 25,594 running words after Stage 0, `ladder:check -- nb`: **0 errors, 0 warnings** (the 2026-10-07 figures in sections 1, 3 and 5 below are kept as history).

## 1. What exists

| stage | units | running words | mean coverage (cov3) | notes |
|---|---:|---:|---:|---|
| `stage0` (head, by package C) | 21 texts | 731 | - | 15 scenes plus 4 re-readings and package C's two added scenes; the head of the path (`after: "stage0"`) |
| `a1-1` | 12 | 2,859 | 87.8 % | present tense, V2, `ikke`, questions, nouns with `ei/-a`, numbers and prices, church, weather, the week |
| `a1-2` | 12 | 2,853 | 91.1 % | modals (`kan`, `må`, `skal`), the past tense (from unit 06), health, the phone, a birthday, a recap unit |
| `a2-1` | 12 | 3,036 | 89.5 % | subordinate clauses (`da`, `når`, `hvis`, `at`, `fordi`), the perfect, a letter, a cabin, 17 May, opinions, a retold parable |
| `a2-2` | 12 | 3,545 | 90.3 % | news, a train journey, an original tale, faith and doubt, Bokmål/Nynorsk/dialects, a process text, a job offer, fishing, a church letter, nature, a dog, a closing unit |
| `b1-bridge` | 0 on 2026-10-07; **24 on 2026-10-08 (12,992 words, mean coverage 93.5 %)** | 0 / 12,992 | - | empty on 2026-10-07 (section 5); filled on 2026-10-08 with 24 new controlled units (section 7) |

Total on 2026-10-07: 48 controlled units, 12,293 running words, **0 errors**, 24 warnings (11 coverage between 84.6 and 87.8 %, 2 recycling, 11 recurrence, 0 orphan, 0 new-lemma density). Total on 2026-10-08 after the pass of section 7: 72 controlled units, 25,594 running words (a1-1 2,934, a1-2 2,911, a2-1 3,056, a2-2 3,701, b1-bridge 12,992), 0 errors, 0 warnings. All units are `controlled`; none is `adapted` or `authentic`.

The units are shorter than the German and Spanish ones (about 250 words on average, including the "Husker du?" paragraphs described in section 3). They were kept short because every new word must be met three times in its own unit and the first units sit on a very small Stage 0 (624 words, 93 lemmas, of which only about 60 were met three times). A reviewer should expect the ladder to need several times more text before `b1-bridge`.

## 2. House style (one canonical style, kept in every unit)

The text is **contemporary written Bokmål under the 2005 norm**, in the *moderate* style:

- three genders: `en` (masculine), `ei` with the `-a` definite for feminine nouns (`ei seng / senga`, `ei bok / boka`, `kirka`), `et` (neuter). The `en`-forms of feminine nouns (`sengen`) are also valid Bokmål and are not used. Stage 0 (package C) writes `boka`, `søstera`, `veska`, `bestemora`, so the ladder agrees with it.
- weak past tense in `-et` (`bakte`, `laget`); neuter definite plural in `-ene`; `sju`, `tjue`, `tretti` (not `syv`, `tyve`, `tredve`); `ble` (not `blei`); `sa`, `gikk`, `sto`.
- `trøtt` for "tired" (the Stage 0 form), never `trett`.
- no Riksmål or Dano-Norwegian spellings (`efter`, `nu`, `sprog`, `hvad` never appear) and no Nynorsk; the ladder is Bokmål only.
- everyone says `du`; the polite `De` is not taught. Names come from `data/stage0/world.json` (nb): Anna, Lars, Marta, Nils, Sam; the city is Bergen. They are written as `{ana}` ... `{city}` in the authoring files and resolved by `authoring/build.mjs`.
- direct speech uses the Norwegian quotation marks.
- English glosses are the drafter's own (`english.source: "drafted with the text; not reviewed"`).

## 3. Method and the figures that matter

- A lemma is **known** after three encounters in earlier texts (the gate). The tokens of every new lemma therefore count against the unit that introduces it. The units were written to introduce about 4-9 new lemmas each, each used about three times in its own unit, with everything else already known. Units 1 and 2 sit in the "first units" band (warning below 85 %, error below 78 %): a1-1-01 is at 87.4 % and a1-1-02 at 84.6 % (package C added two Stage 0 scenes after the first draft).
- All 48 units are at or above 84.6 % (a1-1-02, first-units band) and every later unit is at or above 85.1 % (the error line is 85 %); 10 later units are below 88 % (a warning). The gate prints no new-lemma density warning. Totals on 2026-10-07: 0 errors, 24 warnings (11 coverage, 2 recycling, 11 recurrence; before the recycling pass: 117 warnings, 28 coverage, 6 new-lemmas, 41 recycling, 26 orphan, 16 recurrence).
- The gate treats a **particle verb as one lemma** (`stå opp`, `gå opp`, `ta med`): using one costs a new lemma. Units were rewritten to avoid unplanned ones.
- **Recycling pass (2026-10-07).** The first draft had 41 recycling warnings and 127 of 356 new lemmas never met again. Every unit now ends (or carries) a short section "Husker du?" ("Do you remember?") in which a character or the narrator recalls the scenes of the previous units in real sentences: the same objects, people and places return (the room and the bed, the market and the apples, the cabin and the fireplace). Each unit N is recalled in N+1, N+3 and N+5, plus a few top-up sentences where a lemma still lacked its third return. Result: recycling warnings 41 -> 2, orphan lemmas 127 of 356 (36 %) -> 8 of 340 (2 %), orphan units over the threshold 26 -> 0, new-lemma density warnings 6 -> 0, recurrence warnings 16 of 36 judged units -> 11 of 44. The two remaining recycling warnings are a2-2-01 and a2-2-02, whose words belong to one-off scenes (a news item, a train journey) in the last stretch of the ladder, which has no later units left to carry them; fixing them means adding text after a2-2-12, which is the bridge's job.
- Recurrence (the gap between a lemma's first three meetings should widen): the 11 remaining units (a1-1-03, -04, -05; a1-2-02, -05, -07, -10, -11; a2-1-08; a2-2-05, -09) have their three first meetings close together inside the unit that introduces the word, in question-and-answer pairs. A lead sentence that previews the words before their first natural use fixed eight more units (a1-1-07, -08, -11, -12, a2-1-02, -05, -06, a1-2-04); the rest need the unit's own scene rewritten.
- The authoring files (`authoring/<stage>/NN.txt`) are the source; `node data/ladder/nb/authoring/build.mjs` writes `ladder.json` and `units/*.json` from them. A reviewer's corrections can be made in the text files and rebuilt, or in the JSON units directly (then the authoring file is stale).

## 4. The schedule: what each unit introduces

Columns: unit, domain, running words, coverage (cov3) in %, number of new lemmas, the new lemmas as the analyzer lemmatised them (this includes a few oddities: `berg` is the name in "fru Berg"; `komme med` is a particle verb).

| unit | domain | words | cov3 % | new | new lemmas |
|---|---|---:|---:|---:|---|
| nb-a1-1-01 | conversation | 183 | 87.4 | 8 | fru, berg, komme, fra, glad, hvordan, til, komme med |
| nb-a1-1-02 | daily-life | 162 | 84.6 | 6 | hus, stor, rom, liten, seng, vindu |
| nb-a1-1-03 | family | 219 | 88.1 | 7 | om, familie, hvem, mor, far, år, lærer |
| nb-a1-1-04 | food | 208 | 89.4 | 6 | kafé, ost, melk, mett, nå, mer |
| nb-a1-1-05 | food | 259 | 86.1 | 9 | mye, mat, fisk, potet, etter, lage, middag, hver, suppe |
| nb-a1-1-06 | town | 233 | 86.7 | 6 | ta, dyr, billig, penger, betale, eple |
| nb-a1-1-07 | daily-life | 285 | 89.5 | 8 | begynne, mange, elev, lekse, si, lese, skrive, slutt |
| nb-a1-1-08 | work | 250 | 89.2 | 9 | all, folk, sykepleier, bake, alle, jobb, pasient, hjelpe, ofte |
| nb-a1-1-09 | faith | 262 | 88.9 | 7 | prest, synge, sang, be, bibel, elske, hjerte |
| nb-a1-1-10 | travel | 240 | 87.5 | 11 | busstopp, sentrum, buss, unnskyld, stoppe, gå ut, rett, fram, høyre, rette, denne |
| nb-a1-1-11 | nature | 267 | 87.3 | 8 | vær, våt, sol, ute, alltid, paraply, varm, jakke |
| nb-a1-1-12 | narrative | 291 | 87.6 | 8 | mandag, tirsdag, onsdag, torsdag, fredag, lørdag, uke, fred |
| nb-a1-2-01 | conversation | 249 | 89.6 | 9 | besøke, kunne, komme inn, sitte, stue, få, snill, besøk, lang |
| nb-a1-2-02 | daily-life | 282 | 91.8 | 8 | måtte, mene, borte, finne, lete, under, telefon, ligge |
| nb-a1-2-03 | daily-life | 232 | 87.5 | 8 | skulle, handle, liste, trenge, egg, smør, de, butikk |
| nb-a1-2-04 | health | 242 | 88.0 | 7 | feber, lege, syk, vond, hode, hvile, for |
| nb-a1-2-05 | daily-life | 266 | 89.8 | 7 | stå opp, før, tidlig, gjøre, gjøre om, sove, natt |
| nb-a1-2-06 | narrative | 240 | 91.3 | 6 | miste, gråte, tenke, huske, se, at |
| nb-a1-2-07 | nature | 206 | 90.8 | 5 | tur, fjell, vei, høy, lenge |
| nb-a1-2-08 | faith | 252 | 92.1 | 6 | takke, håp, bønn, synd, tilgi, godt |
| nb-a1-2-09 | norway | 212 | 90.6 | 6 | land, nord, fjord, hav, vest, sør |
| nb-a1-2-10 | conversation | 232 | 90.5 | 9 | sende, melding, tid, treffe, svare, ringe, ring, plan, lite |
| nb-a1-2-11 | family | 201 | 91.5 | 5 | bursdag, kake, gjest, gratulere, gave |
| nb-a1-2-12 | narrative | 239 | 99.2 | 1 | lett |
| nb-a2-1-01 | narrative | 299 | 90.0 | 8 | derfor, pakke, venn, reise, fly, vente, da, ny |
| nb-a2-1-02 | correspondence | 269 | 91.5 | 9 | brev, mamma, savne, kjære, håpe, snart, hilse, hilsen, dere |
| nb-a2-1-03 | work | 264 | 88.3 | 8 | klasse, når, spørsmål, forstå, vanskelig, hvis, spørre, prøve |
| nb-a2-1-04 | nature | 255 | 89.4 | 7 | vinter, snø, hytte, dra, ski, peis, sitte igjen |
| nb-a2-1-05 | biography | 236 | 89.4 | 8 | gammel, liv, leve, gård, hest, kjøre, noen, gang |
| nb-a2-1-06 | norway | 244 | 88.5 | 7 | mai, flagg, is, pølse, feire, tog, bunad |
| nb-a2-1-07 | narrative | 261 | 90.0 | 5 | forsinket, nesten, fortsette, bil, hjelp |
| nb-a2-1-08 | conversation | 240 | 90.4 | 5 | synes, enn, enig, dårlig, kanskje |
| nb-a2-1-09 | faith | 262 | 88.9 | 11 | samaritan, mann, røver, hans, skade, forbi, hotell, nabo, lytte, historie, som |
| nb-a2-1-10 | nature | 218 | 89.0 | 5 | vår, sommer, høst, lys, mørk |
| nb-a2-1-11 | daily-life | 230 | 87.0 | 8 | fredagskveld, taco, første, ved, sofa, film, hvilken, spille |
| nb-a2-1-12 | narrative | 258 | 91.5 | 7 | måned, neste, bestemme, lenger, reise hjem, seg, gi |
| nb-a2-2-01 | community | 370 | 92.7 | 8 | bygge, åpne, nyhet, plass, ola, dit, der, først |
| nb-a2-2-02 | travel | 265 | 90.9 | 10 | langt, stasjon, billett, ut, utsikt, gjennom, tunnel, igjen, komme tilbake, dame |
| nb-a2-2-03 | narrative | 285 | 89.8 | 8 | jente, bro, troll, redd, stopp, gåte, klok, ingen |
| nb-a2-2-04 | faith | 201 | 88.6 | 7 | tvil, sikker, svar, kjenne, trygg, alt, etterpå |
| nb-a2-2-05 | norway | 302 | 87.8 | 13 | måte, bokmål, nynorsk, begge, dialekt, forskjellig, hverandre, hvorfor, eller, slik, feil, ord, heller |
| nb-a2-2-06 | work | 311 | 87.8 | 11 | mel, salt, gjær, riktig, deig, sette, ovn, lukte, ferdig, smake, selv |
| nb-a2-2-07 | work | 356 | 92.1 | 8 | tilbud, sykehus, flytte, sjef, valg, høre, lure, senere |
| nb-a2-2-08 | norway | 270 | 87.4 | 9 | fisker, nær, båt, dra ut, fange, fortelle, tørrfisk, tørr, prosjekt |
| nb-a2-2-09 | faith | 264 | 89.0 | 8 | invitere, gudstjeneste, velkommen, sammen, menighet, flere, alene, invitasjon |
| nb-a2-2-10 | nature | 263 | 90.1 | 6 | time, natur, elv, skog, strøm, ta med |
| nb-a2-2-11 | narrative | 243 | 88.9 | 5 | hund, eier, redde, lik, smakte |
| nb-a2-2-12 | narrative | 415 | 94.9 | 4 | ung, le, hit, bjørn |$

## 5. Why the library part of the bridge is empty (the written bridge exists: see section 7)

`docs/LADDER.md` says the bridge is where authentic or lightly adapted texts become dominant. For Norwegian that needs texts that **require the owner's approval to download** and a rights check by a person before anything is bundled (`docs/norway/SPEC.md` sections 8 and 10; `docs/norway/recon/corpus-rights-bible.md`). Nothing was downloaded and no rights state was changed, so the stage holds no unit and `ladder.json` has no `b1-bridge` entry. Writing "adapted" units from texts nobody has read would only be invention.

The lawful leads are recorded as `rights-unverified` and withheld in `data/sources/course-library/nb.json` (and, built from it, in `src/course/norwegian.ts`). The ten downloads that recon 3 lists as "first objects to ask the owner to download", with what each would give the bridge:

1. SWORD module `Norsk` (1930 Bokmål Bible), about 1.8 MB, labelled Public Domain by CrossWire: Scripture for the bridge, once the owner has a written answer from Bibelselskapet.
2. SWORD module `NorSMB` (1921 Nynorsk Bible), about 1.7 MB: the Nynorsk Scripture counterpart.
3. The Åpen Bibel repository (about 6.2 MB): a cross-check of item 1, never a sole source.
4. Gutenberg plain texts: Hamsun *Sult* 30027, *Markens grøde* 43724 and 43725, Undset *Jenny* 32245 (each probably under 1 MB): heritage prose in Dano-Norwegian and early Riksmål, not modern Bokmål.
5. The NBdigital README (small): to be read before item 6.
6. The NBdigital public-domain archive (`20150526_nbdig_txt01.tar.gz`, about 2.7 GB unpacked, CC0 label): a search layer only, and only after item 5; ask about disk space first.
7. Runeberg, Rolfsen *Læsebok for folkeskolen*, part 2 (OCR text, size unknown): the best graded heritage candidate (1909, Riksmål); every contributor needs a death year.
8. Wikikilden: Asbjørnsen and Moe 1852, Vinje, Aasen, Duun, Garborg (EPUB or PDF, sizes unknown): folk tales and Nynorsk heritage.
9. Tatoeba `nob` and `nno` exports (a few hundred KB each, CC BY 2.0 FR): single sentences with attribution.
10. Biblica Open Norwegian NT from eBible (1-3 MB, CC BY-SA 4.0): modern Scripture, optional, share-alike.

What the bridge still needs after those: **modern authentic reading**. Recon found no open source of modern, connected Bokmål that is both lawful and graded (Wikipedia and NDLA are share-alike or mixed; Klar Tale and NRK are not open). The realistic plan is to write the modern part of the bridge as `adapted` units from open sources the owner approves (for example short Wikipedia articles under CC BY-SA 4.0, kept share-alike and attributed), reviewed like a controlled unit, and to place heritage texts (Rolfsen, Asbjørnsen and Moe) beside them with their variety label. That belongs to a later phase, after the owner has answered the rights questions in recon 3 (questions 1, 5, 6, 7 and 8 especially).

## 6. Weak points a reviewer should know

- Every unit is machine-drafted. The Norwegian is simple and repetitive on purpose and may sound unnatural; the English lines are the drafter's.
- Facts about Norway and Bergen (the seasons, the 17th of May, bunad, fishing, the language situation, Fløyen, the cabin, Friday tacos, the railway to Oslo, hydropower) are general knowledge and unchecked.
- The retelling of the good Samaritan (`nb-a2-1-09`) is in the course's own words, not a Bible translation; `nb-a2-2-03` (the troll on the bridge) is an original tale.
- On 2026-10-07 the analyzer gave no reading for 31 forms in the Bokmål units (reported to package B, who is adding them and merging troll/trollet and bro/bru under one lemma): a form with no reading counts as its own lemma, which lowers coverage a little and breaks recycling for that word. Re-run the gate after B's change.
- Units 1 and 2 are in the allowance band because Stage 0 secures only a few words. Two more short Stage 0 scenes using its weak lemmas (`bo`, `snakke`, `norsk`, `by`, `gjerne`, `men`, `te`, `drikke`, `han`) would lift them.

## 7. The b1-bridge of 2026-10-08, and the pass over the early units

Written by the Norwegian content package on 2026-10-08. Nothing in this section was read by a native speaker; everything is `machine-draft`. The source of truth is still `authoring/<stage>/NN.txt` plus `authoring/build.mjs` (the build now also reads `authoring/b1-bridge/NN.txt`, level `B1`); the JSON units are rebuilt from them.

### 7.1 Why the bridge is written, not imported

Section 5 stays true about the library (nothing authentic can be bundled before the owner approves downloads and a person verifies rights). The bridge is therefore **24 new controlled units**, written for the ladder from nothing but the ladder's own words and the course's characters; no library text, no dictionary, no download, and none of the rights-unverified heritage leads is used as text. One continuous story: Sam, now in his second year in Bergen, finds a job in a bookshop (units 1-4), is paid and moves into a flat of his own (5-10), meets his neighbours, watches the municipal election (11), handles a difficult customer (12), is with Nils at the emergency clinic and hears Anna explain her work (13-14), joins a church home group, helps at the Christmas bazaar and spends Christmas Eve with the family (15-17), learns about the price of electricity, goes to the cabin and meets fog (18-19), keeps Easter (20), writes a letter to his mother (21), travels north on the coastal ship to the midnight sun (22-23) and, two years after his arrival, receives his mother in Bergen (24). The domains are work, daily life, community, news, health, faith, family, nature, travel and narrative.

B1 grammar met, each in situations that need it: the past perfect (`hadde bodd`, `hadde prøvd`), perfect and modal + perfect (`burde ha sagt`, `skulle ha tatt`), subordinate clauses with `at`, `før`, `mens`, `fordi`, `selv om`, embedded questions, passive with `bli` (`ble pyntet`) and in -s (`det stemmes`, `kontrakten skrives under`), relative `som`-clauses, comparison (`dyrere`, `billigst`), indirect speech in narration (`sjefen spurte om han hadde jobbet ...`), `hvis ... ville`, `kommer til å`, and the connectors `dessuten`, `likevel`, `uansett`, `enten ... eller`, `egentlig`, `allerede`. The gate reports `bli-passive` first met in unit 7.

### 7.2 The units (figures from `npm run ladder:check -- nb`, 2026-10-08)

| unit | title | domain | words | cov3 % | new lemmas | the new lemmas as the analyzer lemmatised them |
|---|---|---|---:|---:|---:|---|
| nb-b1-bridge-01 | A job in the paper | work | 501 | 91.6 | 10 | avis, annonse, bokhandel, stilling, aldri, søke, erfaring, søknad, kunde, mens |
| nb-b1-bridge-02 | The call from the bookshop | work | 530 | 93.8 | 9 | ennå, burde, intervju, nervøs, øve, hvorfor, ærlig, råd, forberede |
| nb-b1-bridge-03 | The interview | work | 509 | 95.3 | 7 | arbeid, deltid, annenhver, helg, lønn, kollega, tilby |
| nb-b1-bridge-04 | The first day | work | 481 | 91.1 | 9 | vise, kasse, legge, hylle, navn, rolig, feil, pause, lunsj |
| nb-b1-bridge-05 | The first pay | daily-life | 564 | 92.4 | 9 | konto, leie, egen, stolt, spare, bank, leilighet, sted, regning |
| nb-b1-bridge-06 | Flats to rent | daily-life | 466 | 93.6 | 8 | kjøkken, baderom, etasje, balkong, husleie, ledig, sammenligne, nummer |
| nb-b1-bridge-07 | The viewing | daily-life | 528 | 92.8 | 10 | utleier, visning, gulv, vegg, fuktig, flekk, male, skifte, dusj, viktig; first met: bli-passive |
| nb-b1-bridge-08 | The contract | daily-life | 501 | 93.6 | 6 | dør, kontrakt, forklare, depositum, regel, skrive, under |
| nb-b1-bridge-09 | Moving day | community | 503 | 95.2 | 7 | dugnad, bære, tung, trapp, løfte, pizza, heldig |
| nb-b1-bridge-10 | The neighbours | community | 535 | 92.3 | 12 | lapp, søppel, støy, problem, kaste, glass, papir, plast, pose, barn, vaske, noe |
| nb-b1-bridge-11 | The local election | news | 521 | 92.9 | 7 | kommune, stemme, parti, ordfører, mening, politiker, debatt |
| nb-b1-bridge-12 | A difficult customer | work | 565 | 93.3 | 10 | sint, bestille, engelsk, klage, tilbake, kvittering, nok, sjekke, eller, levere |
| nb-b1-bridge-13 | A fall from the bicycle | health | 551 | 91.8 | 11 | sykkel, sykle, hjelm, uten, fort, falle, hele, arm, brudd, legevakt, gips |
| nb-b1-bridge-14 | What does a nurse do? | health | 563 | 94.8 | 9 | måle, temperatur, medisin, ganske, annen, vakt, frisk, ansvar, omsorg |
| nb-b1-bridge-15 | The home group | faith | 509 | 92.1 | 12 | gruppe, tekst, leder, dele, glede, lignelse, hyrde, sau, over, mellom, bety, kjærlighet |
| nb-b1-bridge-16 | The Christmas bazaar | community | 589 | 92.7 | 9 | basar, organisere, lodd, plakat, samle, strikke, allerede, bak, premie |
| nb-b1-bridge-17 | Christmas Eve | family | 566 | 92.8 | 9 | jul, julaften, tre, pynte, stjerne, tradisjon, grøt, mandel, likevel |
| nb-b1-bridge-18 | The electricity price | news | 528 | 94.7 | 6 | bruke, pris, øke, egentlig, tips, slå, av |
| nb-b1-bridge-19 | Winter holiday at the cabin | nature | 593 | 94.4 | 8 | ferie, forsiktig, mot, løype, kakao, tåke, spor, følge |
| nb-b1-bridge-20 | Easter | faith | 538 | 91.6 | 10 | påske, krim, enten, blant, kors, dø, grav, tom, sjokolade, frokost |
| nb-b1-bridge-21 | A letter to Mum | family | 551 | 96.0 | 8 | ensom, faktisk, takknemlig, hverdag, forandre, vokse, drøm, hurtigrute |
| nb-b1-bridge-22 | On board the coastal ship | travel | 558 | 91.9 | 10 | havn, skip, langs, kyst, lugar, dekk, rundt, vind, bølge, kaptein |
| nb-b1-bridge-23 | The midnight sun | travel | 563 | 95.0 | 8 | uvanlig, øy, vakker, dessuten, himmel, midnattssol, forskjell, vandre |
| nb-b1-bridge-24 | Two years in Norway | narrative | 595 | 98.0 | 6 | lufthavn, overraske, bagasje, klem, skål, både |

Whole ladder after the pass: 72 units, 25,510 words, 0 errors, 0 warnings. The bridge averages about 93.5 % coverage after a2-2 (all 24 units are above 90 %, the minimum is 91.1 % in unit 4), and at most 12 new lemmas in a unit (2.4 per 100 words at the worst; the ceiling is 5). Unit 19 and unit 24 were trimmed to just under 600 words.

### 7.3 Method

1. The vocabulary was taken from the gate's own analysis (`inventory`), not from memory: for every candidate sentence the analyser reading of each token decides whether a word is "known" (met three times before). Sentences were written, run, and rewritten until the unit's new lemmas were few, useful and each one met again inside the unit.
2. Recall of a2-2: every unit re-uses the lemmas of the last stage whose recurrence was weakest (the gate lists them as orphans or low-count lemmas), so the bridge is also the review of a2-2.
3. English rescue on every line, as in the other stages. The recall sections are plain and machine-drafted.
4. Names other than the five cast members are written plainly in the text (the builder only replaces `{ana} {luis} {marta} {nico} {sam} {city}`); non-cast speakers are declared with `speakers:` lines.
5. Analyser traps met and worked around (not fixed in the engine, which belongs to another package): `men` read as `mene`; `bad` as `be`; `tenke etter`, `gå inn`, `leid ut`, `ta vare på` read as particle units; the imperative `bruk` read as a noun; `stolt` read as a form of `stole`; `lagde`/`laget` lemma split; `flere` needs a following noun. `får` (sheep or verb) was avoided by using `sau`.

### 7.4 What else changed in the earlier stages

- The 11 units under 88 % coverage were lifted above 88 % by adding recalls of already-met words and replacing singletons, without lowering any other unit.
- The 11 recurrence warnings were structural (first two meetings too far apart). The introducing scenes' question-and-answer pairs were rewritten so a new word meets its second occurrence right after its first and its third later; the gate now reports 0 non-widening of 69 judged lemmas.
- The 2 recycling warnings are gone (every unit with six followers has at most 25 % of its new lemmas unmet).
- Units whose text changed are listed by `git diff` of `authoring/a1-1 ... a2-2`; the schedule in section 4 still describes the intended introduction order and was not rewritten line by line.

### 7.5 Lexicon additions (all `machine-draft`)

Appended only at the end of `lexicon-nouns-nb-4.ts` (62 noun rows), `lexicon-verbs-nb.ts` (13 verbs: forberede, sammenligne, løfte, levere, sjekke, klage, sykle, måle, strikke, organisere, pynte, øke, overraske) and `lexicon-adjectives-nb.ts` (nervøs, ærlig, fuktig, forsiktig, uvanlig). Duplicates of existing rows (59) were removed. Small in-place fixes to existing rows: `strøm` (m, strømmen/strømmer), `tre` and `drøm` plurals, `smake`, `stemme`, `leie` (-s, rent) and `tom` neuter/plural. `nb.ts` has no `version` field; the shared engine version in `norwegian/engine.ts` was not changed.

### 7.6 Weak points of the bridge

- The Norwegian is moderate contemporary Bokmål written by a machine and read by nobody; idiom, register (for example the job-advert and tenancy vocabulary) and the facts about Norway (hourly work in a bookshop, deposit and tenancy rules, the municipal election, emergency-clinic procedure, the coastal ship route and the midnight sun, Easter and Christmas customs, the electricity price) need a native reviewer.
- The church scenes (units 15, 17, 20) use general Christian vocabulary and a parable in the course's own words, not a Bible translation.
- Units 4 and 20 are the lowest in coverage (about 91 %); the new lemmas of the bridge are met in the bridge only 3 to 6 times, so the ladder after unit 24 should recall them.
