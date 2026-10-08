# Bokmål ladder: plan, style and the empty bridge (a1-1 ... a2-2, and the b1-bridge brief)

Written 2026-10-07 by Team Norway package D for `data/ladder/nb/ladder.json` (contract: `docs/LADDER.md`). **Nothing here is reviewed by a native speaker or by any person.** Every unit is a machine draft (`pipeline.state: machine-draft`, by a tool), `review.status: unreviewed`, so no unit publishes: a ladder unit publishes only from `audio-ready`. The figures below are those printed by `npm run ladder:check -- nb` on 2026-10-07 with the real analyzer (`adapter-nb`); they will move when the analyzer or its lexicon changes, so re-run the gate rather than trusting a decimal.

## 1. What exists

| stage | units | running words | mean coverage (cov3) | notes |
|---|---:|---:|---:|---|
| `stage0` (head, by package C) | 21 texts | 731 | - | 15 scenes plus 4 re-readings and package C's two added scenes; the head of the path (`after: "stage0"`) |
| `a1-1` | 12 | 2,859 | 87.8 % | present tense, V2, `ikke`, questions, nouns with `ei/-a`, numbers and prices, church, weather, the week |
| `a1-2` | 12 | 2,853 | 91.1 % | modals (`kan`, `må`, `skal`), the past tense (from unit 06), health, the phone, a birthday, a recap unit |
| `a2-1` | 12 | 3,036 | 89.5 % | subordinate clauses (`da`, `når`, `hvis`, `at`, `fordi`), the perfect, a letter, a cabin, 17 May, opinions, a retold parable |
| `a2-2` | 12 | 3,545 | 90.3 % | news, a train journey, an original tale, faith and doubt, Bokmål/Nynorsk/dialects, a process text, a job offer, fishing, a church letter, nature, a dog, a closing unit |
| `b1-bridge` | **0** | 0 | - | **left empty on purpose, see section 5** |

Total: 48 controlled units, 12,293 running words, **0 errors**, 24 warnings (11 coverage between 84.6 and 87.8 %, 2 recycling, 11 recurrence, 0 orphan, 0 new-lemma density). All units are `controlled`; none is `adapted` or `authentic`.

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

## 5. The b1-bridge stage is empty, and why

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
