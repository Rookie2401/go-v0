# Spanish B1 bridge — plan (units es-b1-01 … es-b1-35)

Planning document for the `b1-bridge` stage of `data/ladder/es/ladder.json` (contract: `docs/LADDER.md`; context: `docs/audits/B2-SIMULATION.md`, `docs/audits/B2-AUDIT.md`, `data/ladder/es/PLAN.md` §5), written 2026-10-05. **Nothing here is reviewed by a person**, nothing is written into the ladder, and no unit text exists. Every figure marked *(measured)* comes from the real Spanish adapter (`adapter-es@7`) run on the working tree of 2026-10-05 with the code path of `src/ladder/analyse.ts` and `place.ts` (first reading of each word, proper nouns and numerals known, a lemma known after 3 earlier encounters); figures marked *(modelled)* come from a lemma-level simulation of the bridge described in section 3.1 (the units do not exist, so their coverage is arithmetic).

## 0. Summary

- **Starting point (measured, on the ladder as rewritten at 21:03 on 2026-10-05).** The ladder ends with **1,087 known lemmas** (1,127 met; 69 units, 49,250 words after 614 words of Stage 0; ladder:check -- es: 0 errors, 5 warnings, all recycling in units 10–14). That vocabulary covers **79.6 %** of the running words of the non-Scripture library (1.93 M words) and 84.4 % of Reina-Valera. Of the 1,865 library texts, **none** of the 463 non-Scripture texts of 300+ words reaches 92 %; only 18 Bible chapters do. The best non-Scripture texts of any length are *Platero y yo* ch05 (89.8 %, 167 w; rights doubtful), Baroja *El árbol de la ciencia* ch44 (89.3 %; rights doubtful), Unamuno *Niebla* ch12 (89.3 %, 1,222 w) and *Vuelve, Gata* (88.7 %, 53 w).
- **The bridge (modelled).** 35 units, **41,987 words**: 15 adapted units (19,500 w, 724 lemma slots taught, 2.9 lemmas first met per 100 words, about 90 % coverage each) and 20 authentic placements (22,487 w, 54 %), the authentic share rising from 31 % (units 1–10) to 47 % (11–22) to 71 % (23–35). Scripture is 2,435 words, **5.8 %** of the stage. Assuming 34 proper names the adapter does not recognise are added to its proper-name list (3.1), the learner starts the bridge with 1,121 known lemmas and ends it at **1,872** (+751 taught), and at the end every one of the 200 most frequent missing lemmas is known.
- **Cost.** 41,987 words for +751 known lemmas = **56 words per newly known lemma** (the ladder cost 52). An adapted unit spends 27 words per lemma it teaches; the authentic texts contribute almost nothing to *known* lemmas (27 reach three encounters inside their own text) but about 1,000 first meetings that later packs finish cheaply.
- **Authentic placements found (measured).** 20 in the sequence: 3 Bible chapters, 1 Global Voices excerpt, 1 GDL story, 2 Martí chapters (the *Meñique* tale), 12 Niebla chapters and 1 Marianela chapter; **all ≥ 92 % at their place and the last five authentic units ≥ 95 %** (units 29, 31, 32, 34, 35). After unit 35, 26 further non-Scripture texts (of any length) are ≥ 92 % (the best is 95.1 %; listed in 3.6), and 436 Bible chapters are ≥ 92 %.
- **What the bridge cannot do.** It makes *Niebla* (30 of 34 chapters ≥ 92 %), the *Meñique* tale and the GDL stories nearly reachable (88.6 % pooled; 29 lemmas from 92 %). Everything else in the open library stays below 92 % *(modelled)*: Quijote 189 / 814 more lemmas to reach 92 / 95 % pooled, Alarcón 267–278 / 734–735, Galdós *Marianela* 357 / 988, Palma 1,292 / 2,367, Pardo Bazán 1,845 / 3,154. With the adapter's lemma counting, even the 5,000 most frequent library lemmas cover only 94.9 % of the library; "the library comfortably readable" is **not** reached by a 30–60 k-word bridge on open text. And the library has **no contemporary conversation, no modern nonfiction beyond 7 k words, no voseo** (section 4).
- **Decisions the owner must take first:** (1) may Gutenberg texts (canModify: false) be adapted — if not, the 7 adapted units that start from Martí, Unamuno or Galdós (2, 5, 10, 11, 13, 30, 33) are written as new texts with the same lemma packs (the other 8 units are new texts or adapt open-licence GDL texts already); (2) the 92 % entry line for authentic texts and the gate's new-lemmas-per-100 warning (it will fire on 3 of the 20 authentic placements); (3) the recycling rule for adapted units (section 3.4); (4) a rights check on Unamuno and Galdós for Honduras; (5) whether *Niebla* (Peninsular, 1914, love and suicide themes in later chapters) is the right core for a mission-team learner, since it is the only place where the bridge reaches the library; (6) adding 34 names to the adapter's proper-name list (3.1).

> **The rewrite of es-a2-2-16…20 landed while this plan was being made** (files changed at 20:59 and again at 21:03 on 2026-10-05; the plan was first measured on the earlier files, at 100 % and 0 new lemmas each). Everything below is measured on the rewritten ladder. The rewrite taught 87 new lemmas in 5,455 words (1.4–2.0 per 100), added +48 known lemmas (1,039 → 1,087) and 40 partly-met ones, raised the library's coverage from 78.4 to 79.6 %, *Niebla* ch12 from 86.6 to 89.3 %, and removed the cliff at the start of the bridge (section 3.4). It also made five recycling warnings in the ladder gate (units 10–14) that belong to the rewrite, not to the bridge. Packs must be recomputed whenever any unit changes (method in section 5).

## 1. The measured starting point

### 1.1 The ladder at its end

| | value |
|---|---:|
| Stage 0 head | 21 texts, 614 words, 81 lemmas |
| ladder units | 69 (a1-1 15, a1-2 16, a2-1 18, a2-2 20), 49,250 words |
| lemmas met / known (≥ 3 encounters) | 1,127 / **1,087** |
| gate (`npm run ladder:check -- es`) | 0 errors, 5 warnings (recycling, units 10–14); mean coverage a1-1 92.2, a1-2 92.8, a2-1 92.7, a2-2 93.4 % |
| coverage of the non-Scripture library (1,928,912 words, 66,257 of them proper nouns / numerals) | **79.6 %** |
| coverage of Reina-Valera 1909 (704,415 words) | 84.4 % |
| known lemmas among the 100 / 250 / 500 / 1,000 / 2,000 / 3,000 most frequent library lemmas | 99 / 235 / 392 / 609 / 817 / 917 |
| running words covered by the N most frequent library lemmas (any reader who knew exactly those) | 100: 63.0 %; 500: 78.6 %; 1,000: 84.5 %; 2,000: 89.7 %; 3,000: 92.3 %; 5,000: 94.9 % |

Two readings of that table matter for the whole plan. First, the ladder's vocabulary is a *Honduran daily-life* vocabulary: 99 of the 100 most frequent library lemmas are in it, but only 61 % of the top 1,000, so the gap is not "rare words": it is ordinary literary words (*echar, voz, puerta, pie, cielo, brazo, matar, tocar, coger, exclamar, comenzar, junto, largo, malo*) and the old-fashioned function words of Bible and 19th-century prose (*tal, cual, cuyo, mío, vuestro, os, mas, aun, delante, sólo, cuanto*). Second, **the adapter counts lemmas, not words**: it gives words it cannot lemmatize a guessed lemma (*modo → modar, punto → puntar, dulce → dulcer, caballero → caballerar, enorme → enormar*) and sometimes two lemmas to one word (*enorme / enormar, comedia / comedio / comediar, rana / rano / ranar*). Counts below are in adapter lemmas, about 8–10 % above real dictionary headwords, and the gate will judge writers on these same lemmas.

### 1.2 The 200 most frequent library lemmas not yet known — the bridge's vocabulary target

Method *(measured)*: analyse all 676 non-Scripture library texts with the adapter; for every lemma not known at the end of the ladder, take its running-word rate in each of the 18 works of 20,000+ words and average the rates (so that *Quijote* and *Fortunata y Jacinta* do not dominate); keep lemmas that occur in at least 9 of those 18 works; drop abbreviations and fragments (*d.*, *etc.*, *señá*, *conque*, *de veras*). Columns: the most frequent surface form (the adapter lemma in ‹› when it is an artefact), tokens in the non-Scripture library, works (of 22 groups) in which it occurs, tokens in Reina-Valera, and the bridge unit that teaches it (b = in an adapted pack, a = learned inside an authentic text).

| # | word | tokens | works | Bible | unit | # | word | tokens | works | Bible | unit |
|--:|---|--:|--:|--:|---|--:|---|--:|--:|--:|---|
| 1 | tal | 2222 | 21 | 276 | b02 | 101 | murmuró ‹murmurar› | 275 | 16 | 30 | b11 |
| 2 | medio | 1421 | 21 | 649 | b02 | 102 | falta | 388 | 21 | 50 | b11 |
| 3 | echó | 1551 | 22 | 700 | b02 | 103 | efecto | 376 | 19 | 9 | b08 |
| 4 | cual | 1914 | 21 | 2080 | b02 | 104 | enamorado ‹enamorar› | 345 | 19 | 8 | b02 |
| 5 | sólo | 1137 | 21 | 58 | b02 | 105 | chica ‹chico› | 351 | 17 | 6 | b11 |
| 6 | pie | 1160 | 22 | 425 | b02 | 106 | coche | 325 | 19 | 0 | b11 |
| 7 | exclamó ‹exclamar› | 593 | 18 | 8 | b02 | 107 | importa ‹importar› | 377 | 21 | 3 | b05 |
| 8 | cuanto | 1140 | 21 | 374 | b02 | 108 | cargo | 340 | 21 | 79 | b05 |
| 9 | modo ‹modar› | 916 | 22 | 45 | b02 | 109 | conde ‹condar› | 249 | 12 | 0 | b11 |
| 10 | cielo | 858 | 22 | 767 | b02 | 110 | adelante | 418 | 21 | 39 | b11 |
| 11 | brazos | 862 | 21 | 125 | b02 | 111 | silencio ‹silenciar› | 387 | 19 | 16 | b10 |
| 12 | bajo | 630 | 22 | 97 | b02 | 112 | deseo | 518 | 18 | 65 | b11 |
| 13 | e | 552 | 20 | 895 | b02 | 113 | versos | 303 | 20 | 1 | b10 |
| 14 | cuya | 653 | 20 | 195 | b03 | 114 | pena | 382 | 21 | 7 | b11 |
| 15 | propio | 667 | 22 | 59 | b02 | 115 | sitio | 269 | 18 | 11 | b11 |
| 16 | comenzó ‹comenzar› | 677 | 19 | 239 | b02 | 116 | gozo | 370 | 20 | 237 | b10 |
| 17 | matar | 678 | 21 | 474 | b02 | 117 | lágrimas | 354 | 20 | 32 | b05 |
| 18 | según | 721 | 20 | 355 | b03 | 118 | dispuesto ‹disponer› | 320 | 20 | 39 | b11 |
| 19 | muerte | 629 | 21 | 321 | b03 | 119 | advirtió | 327 | 17 | 3 | b11 |
| 20 | punto ‹puntar› | 711 | 22 | 22 | b03 | 120 | retiró ‹retirar› | 312 | 19 | 21 | b11 |
| 21 | marqués ‹marcar› | 530 | 20 | 3 | b02 | 121 | abajo | 347 | 20 | 57 | b02 |
| 22 | aire | 607 | 22 | 15 | b03 | 122 | siglo | 284 | 20 | 117 | b13 |
| 23 | mas | 669 | 19 | 2597 | a01 | 123 | soltó | 388 | 20 | 61 | b13 |
| 24 | marido | 758 | 18 | 146 | a01 | 124 | nota | 177 | 18 | 1 | b13 |
| 25 | herido ‹herir› | 439 | 21 | 536 | b03 | 125 | considerar | 288 | 18 | 55 | b13 |
| 26 | cogió | 729 | 21 | 90 | b03 | 126 | gato | 268 | 19 | 2 | b13 |
| 27 | oh | 669 | 21 | 719 | b02 | 127 | costumbre | 318 | 19 | 45 | b13 |
| 28 | señorita | 456 | 13 | 0 | b03 | 128 | dulce ‹dulcer› | 298 | 20 | 17 | b05 |
| 29 | suya | 714 | 22 | 187 | b03 | 129 | tras | 324 | 19 | 179 | b13 |
| 30 | aun | 628 | 19 | 477 | b03 | 130 | terrible ‹terriblar› | 206 | 19 | 29 | b11 |
| 31 | poeta | 395 | 19 | 1 | b03 | 131 | autor | 292 | 16 | 3 | b13 |
| 32 | ésta ‹ésto› | 457 | 19 | 201 | b02 | 132 | linda | 196 | 17 | 2 | b13 |
| 33 | suelo | 552 | 22 | 13 | b03 | 133 | respeto | 311 | 20 | 22 | b13 |
| 34 | dirigió ‹dirigir› | 378 | 20 | 5 | b03 | 134 | produjo ‹producir› | 265 | 19 | 29 | b13 |
| 35 | delante | 614 | 20 | 1717 | b05 | 135 | principal | 349 | 20 | 189 | b13 |
| 36 | piedra | 433 | 20 | 371 | b02 | 136 | contrario | 284 | 19 | 17 | b10 |
| 37 | faltaba | 675 | 22 | 119 | b02 | 137 | ciego ‹cegar› | 255 | 19 | 58 | b11 |
| 38 | vivo | 488 | 21 | 146 | a01 | 138 | dientes | 269 | 21 | 59 | b13 |
| 39 | caballero ‹caballerar› | 830 | 19 | 1 | b05 | 139 | letras | 291 | 18 | 38 | b15 |
| 40 | color | 455 | 22 | 30 | b05 | 140 | ay | 372 | 21 | 130 | b10 |
| 41 | vuestra | 1249 | 21 | 1663 | b05 | 141 | molino ‹molinar› | 108 | 12 | 8 | b15 |
| 42 | muerto | 424 | 22 | 455 | b05 | 142 | lanzó ‹lanzar› | 193 | 18 | 39 | b15 |
| 43 | formado ‹formar› | 360 | 22 | 51 | b05 | 143 | hojas | 316 | 22 | 23 | b10 |
| 44 | criada ‹criar› | 480 | 19 | 137 | b05 | 144 | grave ‹gravar› | 252 | 19 | 18 | b11 |
| 45 | instante | 441 | 22 | 3 | b05 | 145 | pasear | 258 | 17 | 10 | b13 |
| 46 | solía ‹soler› | 608 | 20 | 26 | b05 | 146 | arte ‹artar› | 270 | 18 | 2 | b15 |
| 47 | figura ‹figurar› | 451 | 21 | 15 | b05 | 147 | imposible | 255 | 18 | 11 | b10 |
| 48 | replicó ‹replicar› | 557 | 16 | 4 | b05 | 148 | remedio | 379 | 17 | 4 | b13 |
| 49 | ah | 422 | 21 | 25 | b02 | 149 | entero | 313 | 22 | 38 | b15 |
| 50 | campo | 441 | 21 | 501 | b05 | 150 | primo | 217 | 16 | 0 | b15 |
| 51 | rostro ‹rostrar› | 512 | 19 | 305 | b05 | 151 | detrás | 305 | 21 | 35 | b15 |
| 52 | ello ‹ellar› | 474 | 19 | 90 | b05 | 152 | ciencia ‹ciencio› | 240 | 18 | 64 | b13 |
| 53 | acuerdo ‹acordar› | 568 | 20 | 229 | b05 | 153 | alegría | 329 | 21 | 101 | b03 |
| 54 | demás ‹demá› | 456 | 21 | 48 | b05 | 154 | fijo ‹fijar› | 287 | 18 | 10 | b15 |
| 55 | frente | 399 | 21 | 37 | b08 | 155 | virtud | 327 | 20 | 38 | b15 |
| 56 | real | 406 | 20 | 87 | b05 | 156 | barba | 287 | 20 | 19 | b10 |
| 57 | loco | 560 | 20 | 26 | b02 | 157 | hermosura ‹hermosuro› | 297 | 17 | 43 | b15 |
| 58 | mirada | 421 | 17 | 0 | b08 | 158 | soldados | 196 | 16 | 32 | b15 |
| 59 | pensamiento | 570 | 21 | 98 | b08 | 159 | referir | 232 | 17 | 12 | b15 |
| 60 | marcharse | 299 | 17 | 14 | b08 | 160 | ambos | 274 | 18 | 80 | b15 |
| 61 | añadió ‹añader› | 377 | 17 | 27 | b05 | 161 | memoria | 342 | 19 | 113 | b17 |
| 62 | puro | 483 | 21 | 52 | b08 | 162 | chico ‹chicar› | 385 | 19 | 8 | b17 |
| 63 | papel | 436 | 21 | 1 | b08 | 163 | esperanza | 280 | 19 | 121 | b10 |
| 64 | francés | 258 | 18 | 0 | b08 | 164 | traje | 253 | 20 | 5 | b17 |
| 65 | varias | 317 | 19 | 3 | b08 | 165 | diablo | 292 | 19 | 36 | b17 |
| 66 | pájaro | 292 | 20 | 8 | b03 | 166 | pico | 242 | 20 | 2 | b02 |
| 67 | imagen ‹imager› | 364 | 14 | 56 | b08 | 167 | vencido | 314 | 18 | 58 | b17 |
| 68 | rato | 503 | 20 | 0 | b05 | 168 | gritos | 238 | 20 | 20 | b17 |
| 69 | os | 642 | 21 | 1611 | b02 | 169 | entregó ‹entregar› | 274 | 19 | 372 | b17 |
| 70 | único | 407 | 20 | 13 | b08 | 170 | rara | 232 | 20 | 0 | b17 |
| 71 | segunda | 465 | 20 | 167 | b05 | 171 | monja | 259 | 14 | 0 | b17 |
| 72 | sueño | 419 | 22 | 133 | b02 | 172 | atención | 269 | 16 | 10 | b17 |
| 73 | fondo ‹fondar› | 308 | 20 | 3 | b03 | 173 | contemplando | 199 | 20 | 6 | b17 |
| 74 | muchacha ‹muchacho› | 291 | 19 | 32 | b08 | 174 | temblaba | 245 | 20 | 78 | b08 |
| 75 | sonriendo | 425 | 19 | 0 | b08 | 175 | representaba | 253 | 18 | 3 | b15 |
| 76 | ocasión | 446 | 19 | 24 | b08 | 176 | carácter | 203 | 18 | 0 | b17 |
| 77 | basta ‹bastar› | 373 | 20 | 35 | b02 | 177 | ánimo | 311 | 15 | 53 | b17 |
| 78 | fuego | 350 | 20 | 493 | b03 | 178 | sombra | 283 | 20 | 78 | b19 |
| 79 | observó ‹observar› | 386 | 17 | 18 | b10 | 179 | voluntad ‹voluntar› | 354 | 17 | 144 | b15 |
| 80 | orden ‹ordar› | 338 | 18 | 98 | b10 | 180 | arrojó | 300 | 17 | 53 | b19 |
| 81 | capitán | 179 | 13 | 131 | b10 | 181 | especie ‹especiar› | 178 | 18 | 29 | b19 |
| 82 | suerte | 398 | 19 | 157 | b10 | 182 | abierto | 214 | 19 | 52 | b05 |
| 83 | inglés | 264 | 12 | 0 | b10 | 183 | acudir | 305 | 16 | 8 | b17 |
| 84 | libre | 391 | 22 | 78 | b08 | 184 | consuelo | 260 | 19 | 80 | b11 |
| 85 | frase | 291 | 18 | 0 | b03 | 185 | apartó | 284 | 21 | 387 | b15 |
| 86 | ante | 372 | 21 | 35 | b08 | 186 | conciencia ‹conciencio› | 328 | 15 | 28 | b17 |
| 87 | merced ‹mercer› | 967 | 15 | 11 | b10 | 187 | reina | 189 | 20 | 70 | b19 |
| 88 | palacio | 273 | 19 | 56 | b02 | 188 | tendido ‹tender› | 248 | 20 | 47 | b19 |
| 89 | carne | 385 | 21 | 432 | b10 | 189 | capa ‹capo› | 166 | 17 | 12 | b19 |
| 90 | acaso | 288 | 20 | 17 | b02 | 190 | soñado ‹soñar› | 232 | 19 | 22 | b02 |
| 91 | ruido ‹ruir› | 345 | 20 | 16 | b05 | 191 | consejo | 240 | 18 | 165 | b19 |
| 92 | embargo ‹embargar› | 279 | 20 | 9 | b10 | 192 | repuso ‹reponer› | 133 | 15 | 1 | b17 |
| 93 | cura ‹curo› | 587 | 18 | 7 | b10 | 193 | sostener | 227 | 18 | 20 | b19 |
| 94 | pintado | 381 | 20 | 14 | b10 | 194 | semejante ‹semejantar› | 237 | 19 | 120 | b19 |
| 95 | monte | 296 | 19 | 624 | b02 | 195 | conviene ‹convenir› | 304 | 19 | 65 | b19 |
| 96 | cabo | 341 | 19 | 111 | b10 | 196 | angustias ‹angustiar› | 63 | 12 | 44 | b19 |
| 97 | atrevió ‹atrever› | 471 | 21 | 4 | b10 | 197 | queja ‹quejar› | 256 | 20 | 17 | b19 |
| 98 | pecho | 392 | 21 | 55 | b05 | 198 | espaldas | 252 | 20 | 52 | b19 |
| 99 | conversación | 375 | 18 | 10 | b10 | 199 | pálido | 213 | 16 | 2 | b21 |
| 100 | sombrero | 274 | 20 | 0 | b11 | 200 | procuraba ‹procurar› | 318 | 18 | 100 | b17 |

Reading the list: about 25 entries are old-fashioned or Bible-register function words and pronouns (*cual, tal, mío, mas, os, vuestro, aun, cuyo, delante, ésta/éstos, e, sólo, cuanto*) — they are receptive items, not production targets (the course teaches *ustedes* and voseo), and they are also what keeps most Bible chapters below 92 %. Many are narrative verbs in the preterite or imperfect (*echó, exclamó, comenzó, cogió, mató, tocó, dirigió, replicó, sonreía, soler*); many are concrete nouns (*puerta, voz, pie, cielo, brazo, aire, suelo, piedra, ventana, ropa, silla*); the rest are abstractions and adjectives (*duda, miedo, pensamiento, único, propio, puro, loco, libre*). Almost none is technical or Honduran-specific: that is the real meaning of "native text begins here".

Placement of the list in the bridge: 15 adapted units each carry the next 13 not-yet-known entries of this list (195 slots, in rank order, so the most frequent words arrive first), together with about 33 text-driven lemmas of the authentic texts they unlock. All 200 are known at the end of unit 35 *(modelled)*. Library coverage rises from 79.6 % to 86.4 % over the bridge; the 200 alone would add about 4–5 points *(measured: Martí 82.8 → 86.6 %, Niebla 83.8 → 87.9 %, Marianela 79.9 → 84.9 % with the top 200 of the balanced list)*.

## 2. Candidate authentic texts

`ladder:place` was run (by the same code path, `placeCandidate` over snapshots of the ladder state after Stage 0 and after each unit) on **every one of the 1,865 library texts**; the 188 below are a broad sample (all 10 modern stories and excerpts, Martí's 12 chapters, 34 Unamuno, 22 Marianela, 22 Alarcón, 8 Trafalgar, Palma, Valera's letters, Pardo Bazán, Palacio Valdés, Clarín, Cervantes, Quevedo, Darío, Samaniego and 30 Bible chapters). The official command was also run by hand on text:es:unamuno-niebla-ch12 (89.3 % after the last unit, "library, not ladder"), on text:es:bible-jhn-4 and on the Global Voices excerpt; it agrees with the table. For every text in the sample the verdict today is *library, not ladder* (best coverage after es-a2-2-20 below 95 %); in the whole library only Números 26 (96.1 %, a list of names) reaches 95 %.

**Per work** *(measured; "now" = after es-a2-2-20, "after" = after the modelled es-b1-35; lemmas needed to bring the work as a whole to 92 / 95 % pooled coverage, by greedy choice of the most frequent missing lemmas of that work)*:

| work | words | now | after | lemmas to 92 / 95 % now | lemmas to 92 / 95 % after | chapters ≥ 92 / ≥ 95 % after |
|---|--:|--:|--:|--:|--:|--:|
| Martí, *La Edad de Oro* (ch01–06 tale; ch07–12 long essays) | 66,816 | 82.8 | 88.7 | 363 / 829 | 124 / 490 | 4 / 1 of 13 |
| Unamuno, *Niebla* (d. 1936) | 57,306 | 83.8 | 93.1 | 397 / 944 | 0 / 324 | 30 / 13 of 34 |
| Galdós, *Marianela* | 50,969 | 79.9 | 87.7 | 799 / 1477 | 357 / 988 | 1 / 1 of 22 |
| Alarcón, *El capitán Veneno* (edition check) | 21,368 | 79.9 | 87.3 | 601 / 1125 | 278 / 734 | 0 / 0 of 23 |
| Alarcón, *El sombrero de tres picos* (edition check) | 24,722 | 79.5 | 86.7 | 607 / 1148 | 267 / 735 | 1 / 0 of 32 |
| Galdós, *Trafalgar* | 51,247 | 76.8 | 84.4 | 898 / 1572 | 486 / 1115 | 0 / 0 of 17 |
| Cervantes, *Don Quijote* | 381,973 | 81.9 | 88.7 | 518 / 1232 | 189 / 814 | 1 / 0 of 127 |
| Quevedo, *El Buscón* | 42,702 | 82.4 | 88.0 | 470 / 1006 | 214 / 690 | 0 / 0 of 23 |
| Valera, *Pepita Jiménez* (letters) | 56,650 | 78.3 | 85.6 | 1084 / 1873 | 623 / 1370 | 0 / 0 of 8 |
| Palacio Valdés, *La hermana San Sulpicio* | 117,284 | 78.3 | 85.6 | 1227 / 2233 | 734 / 1691 | 0 / 0 of 16 |
| Galdós, *Fortunata y Jacinta* | 394,628 | 81.1 | 87.3 | 1287 / 2789 | 738 / 2167 | 0 / 0 of 42 |
| Clarín, *La Regenta* | 308,220 | 78.7 | 85.4 | 1416 / 2677 | 873 / 2064 | 0 / 0 of 31 |
| Palma, *Tradiciones peruanas* | 47,998 | 74.7 | 80.8 | 1735 / 2874 | 1292 / 2367 | 0 / 0 of 5 |
| Pardo Bazán, *Los pazos de Ulloa* | 83,749 | 73.3 | 80.9 | 2412 / 3760 | 1845 / 3154 | 0 / 0 of 30 |
| Darío, *Azul…* | 31,930 | 71.5 | 79.1 | 1391 / 2142 | 1006 / 1696 | 0 / 0 of 10 |
| Samaniego, *Fábulas* (verse) | 42,735 | 72.4 | 80.6 | 1472 / 2316 | 1048 / 1828 | 0 / 0 of 9 |
| Iriarte, *Fábulas* (verse) | 14,236 | 77.3 | 84.1 | 688 / 1115 | 385 / 809 | 0 / 0 of 1 |
| Darío, *Cantos de vida y esperanza* (verse) | 12,614 | 70.2 | 79.1 | 862 / 1241 | 560 / 939 | 0 / 0 of 14 |
| Modern: 9 GDL stories + Global Voices excerpt | 7,004 | 78.8 | 88.6 | 201 / 367 | 29 / 130 | see 3.6 |
| Reina-Valera 1909 (1,189 chapters) | 704,415 | 84.4 | 90.7 | — | — | 436 / 92 (before: 18 / 1) |

Not candidates: Baroja (*Zalacaín*, *El árbol de la ciencia*; d. 1956) and Jiménez (*Platero y yo*; d. 1958) — rights doubtful for Honduras and Spain (PLAN.md §5.4) — although they are measured here too (Baroja ch44 89.3 %, Platero ch05 89.8 %: no better than Unamuno).

**Per text** *(measured)*. Columns: words; coverage after es-a2-2-20; coverage after the modelled bridge; number of lemmas (the most frequent missing ones) that would lift it to 92 / 95 % *from the current ladder end*; the five missing lemmas with most running words now (the adapter lemma, surface form first). "★" marks the 20 texts used in the sequence.

| text | w | now % | after % | to 92 / 95 | missing lemmas that keep it below 95 % (tokens) |
|---|--:|--:|--:|--:|---|
| ★ Bible jhn-4 | 1005 | 93.0 | 98.3 | 0 / 4 | vosotros 6, siega 6, marido 5, mas 4, fuente 3 |
| ★ Bible jhn-9 | 749 | 90.8 | 97.7 | 1 / 6 | ciego 13, mas 6, lodo 5, judío 3, vosotros 3 |
| Bible jhn-11 | 996 | 89.1 | 95.3 | 4 / 17 | mas 14, judío 8, muerto 6, pie 3, lázaro 3 |
| Bible gen-28 | 556 | 92.1 | 95.9 | 0 / 6 | aram 4, simiente 4, piedra 3, contigo 2, cual 2 |
| Bible gen-39 | 590 | 92.0 | 96.3 | 0 / 6 | cárcel 5, prosperar 3, acontecido 3, principal 3, varón 2 |
| ★ Bible gen-45 | 681 | 90.2 | 96.2 | 2 / 9 | vuestra 10, os 5, delante 4, vosotros 4, medio 2 |
| Bible gen-42 | 884 | 89.6 | 95.4 | 3 / 12 | vuestra 12, espía 5, vosotros 5, os 4, descender 4 |
| Bible gen-37 | 839 | 87.2 | 92.5 | 11 / 30 | sueño 7, cisterna 6, soñado 5, matar 4, color 3 |
| Bible rut-1 | 576 | 88.7 | 96.0 | 5 / 13 | lehem 5, campo 5, varón 4, marido 4, nuera 4 |
| Bible rut-2 | 665 | 83.6 | 91.9 | 14 / 27 | campo 8, espigas 7, cogió 6, segadores 6, moza 6 |
| Bible jon-1 | 418 | 86.6 | 92.3 | 7 / 18 | echó 6, nave 4, delante 3, suerte 3, quieto 3 |
| Bible jon-3 | 242 | 91.3 | 94.2 | 1 / 7 | pregonar 3, segunda 1, pregón 1, conforme 1, sobremanera 1 |
| Bible mrk-2 | 631 | 90.8 | 94.8 | 2 / 9 | paralítico 5, lecho 4, odre 4, aun 3, mas 3 |
| Bible mrk-5 | 837 | 86.0 | 95.2 | 17 / 33 | mas 6, puercos 5, muchacha 5, demonio 4, príncipe 4 |
| Bible luk-15 | 629 | 86.3 | 92.5 | 13 / 26 | hacienda 5, mas 5, gozo 3, cielo 3, dracmo 3 |
| Bible luk-10 | 892 | 84.8 | 93.5 | 16 / 34 | os 12, vosotros 8, mas 5, cielo 5, cual 4 |
| Bible act-9 | 929 | 89.2 | 94.7 | 9 / 28 | acontecido 4, mas 4, cual 4, saular 3, príncipe 3 |
| Bible act-26 | 741 | 84.5 | 94.6 | 21 / 43 | cual 12, judío 5, oh 4, mas 4, potestad 3 |
| Bible 1sa-3 | 482 | 92.1 | 95.0 | 0 / 6 | manifestó 3, jehovar 3, visiones 2, comenzó 2, samuel 2 |
| Bible 1sa-17 | 1585 | 86.1 | 92.2 | 23 / 47 | campo 7, escuadrón 7, vencido 7, ejército 5, e 5 |
| Bible 2sa-9 | 384 | 92.2 | 98.2 | 0 / 3 | boseth 7, pie 2, mephi 2, cual 1, aun 1 |
| Bible exo-4 | 777 | 91.5 | 96.5 | 1 / 11 | seno 5, aun 4, vara 3, echó 3, tornó 2 |
| Bible mat-8 | 670 | 86.7 | 93.1 | 12 / 28 | mas 5, echó 4, hato 4, puercos 4, centurión 3 |
| Bible jhn-3 | 725 | 90.8 | 95.9 | 2 / 10 | mas 8, cielo 5, nacido 3, os 3, condenado 3 |
| Bible jhn-1 | 932 | 92.5 | 97.2 | 0 / 6 | mas 7, cual 7, tras 3, descender 3, tinieblas 2 |
| Bible gen-1 | 754 | 83.3 | 92.3 | 11 / 18 | cielo 10, según 10, expansión 9, simiente 6, género 6 |
| Bible psa-23 | 105 | 77.1 | 82.9 | 16 / 19 | salmos 1, jehovar 1, faltaba 1, delicados 1, pasta 1 |
| Bible dan-6 | 867 | 82.0 | 89.7 | 19 / 34 | foso 10, delante 8, reino 7, oh 7, gobernador 6 |
| Bible est-1 | 701 | 83.3 | 91.6 | 13 / 31 | príncipe 8, reina 8, reino 7, delante 7, provincia 5 |
| Bible act-22 | 669 | 84.3 | 95.8 | 27 / 47 | tribuna 5, romano 4, judío 3, mas 3, persiguen 3 |
| bridge-safari-en-la-banera-ch01 | 100 | 77.0 | 83.0 | 15 / 18 | baño 1, favorito 1, aseguro 1, orejas 1, detrás 1 |
| bridge-una-casa-para-raton-ch01 | 98 | 85.7 | 92.9 | 3 / 6 | sueño 4, cálido 2, ruidosa 1, salvajes 1, peces 1 |
| bridge-vuelve-gata-ch01 | 53 | 88.7 | 94.3 | 1 / 3 | cesta 2, afuera 1, tuyo 1, siesta 1, gata 1 |
| bridge-dentro-de-la-world-wide-web-ch01 | 1567 | 79.2 | 90.7 | 49 / 96 | www 21, internet 20, ordenadores 17, página 12, información 10 |
| bridge-el-bate-perdido-2-ch01 | 545 | 79.3 | 83.7 | 35 / 51 | bates 9, bate 7, cricket 6, rehman 4, fábrica 4 |
| bridge-el-nino-y-el-tambor-ch01 | 2825 | 79.9 | 86.5 | 51 / 97 | tam 48, coro 31, narrador 26, tambor 18, novio 14 |
| bridge-inmersion-ch01 | 770 | 68.6 | 89.6 | 83 / 106 | peces 23, corales 7, arrecife 7, anémonas 5, aletas 4 |
| bridge-pishi-atrapado-en-una-tormenta-ch01 | 351 | 79.5 | 90.6 | 26 / 37 | peces 12, pishi 4, océano 3, enormes 2, ratnakara 2 |
| ★ bridge-demasiados-platanos-ch01 | 481 | 86.3 | 93.8 | 10 / 24 | madura 4, sringeri 3, dulces 3, cosecha 3, puya 3 |
| ★ gv-es-dae11aaaf264-excerpt-ch01 | 214 | 73.4 | 93.9 | 28 / 35 | documento 5, tharu 3, indígena 3, significa 2, popular 2 |
| marti-edad-de-oro-ch01 | 533 | 83.3 | 91.4 | 30 / 46 | palacio 6, roble 4, ramas 3, hacha 3, cuanto 2 |
| ★ marti-edad-de-oro-ch02 | 865 | 86.0 | 94.2 | 15 / 36 | pico 8, hacha 6, roca 5, echó 4, piedra 4 |
| marti-edad-de-oro-ch03 | 965 | 82.9 | 92.7 | 32 / 61 | pozo 8, orejas 8, roble 5, cartel 5, palacio 4 |
| marti-edad-de-oro-ch04 | 1538 | 83.0 | 92.0 | 38 / 85 | gigante 32, echó 12, pie 6, cuero 6, buey 5 |
| marti-edad-de-oro-ch05 | 823 | 84.2 | 92.0 | 22 / 46 | princesa 12, gigante 4, hilo 4, echó 3, dueño 3 |
| ★ marti-edad-de-oro-ch06 | 398 | 87.2 | 97.2 | 6 / 15 | princesa 8, enigma 4, gigante 3, adivinaba 2, oh 2 |
| marti-edad-de-oro-ch07 | 10935 | 84.3 | 89.6 | 138 / 291 | griegos 43, cielo 26, piedra 23, echó 19, palo 17 |
| marti-edad-de-oro-ch08 | 8992 | 83.4 | 89.2 | 166 / 333 | piedra 25, color 20, palacio 18, pintado 14, cielo 14 |
| marti-edad-de-oro-ch09 | 9162 | 79.8 | 85.7 | 378 / 652 | poeta 24, versos 23, compuso 19, palacio 16, pie 14 |
| marti-edad-de-oro-ch10 | 10008 | 81.0 | 87.0 | 275 / 515 | indios 29, maga 22, palacio 21, camarón 21, echó 20 |
| marti-edad-de-oro-ch11 | 10037 | 83.8 | 89.1 | 161 / 315 | echó 21, francés 19, máquina 17, metal 15, tenedor 14 |
| marti-edad-de-oro-ch12 | 9465 | 82.8 | 88.6 | 120 / 251 | emperador 54, ruiseñor 40, pájaro 38, elefante 34, echó 27 |
| unamuno-niebla-ch00 | 3397 | 77.1 | 84.0 | 263 / 365 | metafísica 17, prólogo 11, erótico 11, ingenua 7, ingenio 7 |
| unamuno-niebla-ch01 | 1388 | 82.2 | 92.1 | 84 / 126 | paraguas 7, portera 6, vago 4, apellido 4, cabía 3 |
| unamuno-niebla-ch02 | 1546 | 81.8 | 92.5 | 81 / 127 | aparición 8, señorito 5, señorita 5, azar 4, ésta 4 |
| unamuno-niebla-ch03 | 677 | 82.1 | 89.8 | 37 / 58 | distraído 6, lógica 4, pieza 4, chico 3, quehaceres 3 |
| unamuno-niebla-ch04 | 1234 | 81.4 | 93.6 | 73 / 110 | piano 6, aburrimiento 5, tal 4, niebla 4, matar 4 |
| unamuno-niebla-ch05 | 2183 | 81.8 | 91.5 | 129 / 194 | dulce 9, lágrimas 6, señorito 5, melancólico 5, silencio 4 |
| unamuno-niebla-ch06 | 1380 | 83.1 | 95.1 | 45 / 86 | caballero 8, canario 7, esperanto 7, augusto 6, anarquismo 6 |
| unamuno-niebla-ch07 | 805 | 82.4 | 94.0 | 45 / 69 | creación 6, eternidad 5, corriente 4, decisivo 3, porvenir 3 |
| unamuno-niebla-ch08 | 1950 | 82.2 | 92.6 | 87 / 146 | conocimiento 10, caballero 10, misteriosa 6, exclamó 6, puño 6 |
| ★ unamuno-niebla-ch09 | 775 | 87.9 | 96.4 | 17 / 41 | eugenia 3, horror 3, cuchitril 2, portería 2, portera 2 |
| ★ unamuno-niebla-ch10 | 1820 | 84.0 | 95.6 | 46 / 99 | enamorado 21, veras 10, ésta 5, cabellera 5, brazos 4 |
| ★ unamuno-niebla-ch11 | 1621 | 86.3 | 95.8 | 35 / 81 | exclamó 6, eugenia 5, oh 4, calmar 4, novio 4 |
| ★ unamuno-niebla-ch12 | 1222 | 89.3 | 98.0 | 7 / 26 | sueño 10, señorito 8, tonto 5, augusto 4, planchado 3 |
| unamuno-niebla-ch13 | 1556 | 84.6 | 93.8 | 60 / 107 | eugenia 7, ilusión 6, sólo 4, señorita 3, cuanto 3 |
| unamuno-niebla-ch14 | 2176 | 85.4 | 93.7 | 60 / 126 | matrimonio 6, ridículo 6, marido 5, desliz 5, resignada 5 |
| ★ unamuno-niebla-ch15 | 1611 | 88.0 | 96.0 | 21 / 58 | chiquilla 8, brutos 8, hombrada 7, veras 4, sólo 3 |
| ★ unamuno-niebla-ch16 | 1067 | 86.7 | 95.8 | 23 / 53 | seductor 5, libre 5, conquistar 4, capaz 3, eh 3 |
| unamuno-niebla-ch17 | 2546 | 86.6 | 93.4 | 47 / 112 | novela 11, inventado 8, diálogo 7, tal 6, viudedad 5 |
| ★ unamuno-niebla-ch18 | 1340 | 85.2 | 96.3 | 35 / 73 | chica 4, novio 4, pecho 4, cuanto 4, fisiológico 4 |
| unamuno-niebla-ch19 | 2260 | 83.5 | 92.1 | 100 / 167 | tal 9, hojas 7, compromiso 5, grosería 5, exaltado 5 |
| ★ unamuno-niebla-ch20 | 2212 | 87.3 | 95.8 | 36 / 93 | importa 7, señorita 6, fatalidad 6, eugenia 5, emprender 4 |
| unamuno-niebla-ch21 | 1909 | 86.9 | 94.2 | 38 / 95 | ésta 5, loco 5, adivinaba 4, fortuna 4, celos 4 |
| unamuno-niebla-ch22 | 1184 | 83.6 | 94.5 | 48 / 83 | ciego 5, envejecido 5, ésta 4, fogueteiro 4, fuego 4 |
| unamuno-niebla-ch23 | 3227 | 77.4 | 83.8 | 288 / 385 | erudito 9, paparrigópulos 8, s 7, crítica 7, tal 6 |
| unamuno-niebla-ch24 | 1750 | 83.4 | 93.6 | 66 / 119 | psicología 8, psicológica 6, loco 5, ridículo 5, fisiológico 5 |
| unamuno-niebla-ch25 | 1026 | 82.8 | 94.1 | 47 / 78 | crudezas 4, solitario 4, infinito 4, justificar 4, nivola 3 |
| ★ unamuno-niebla-ch26 | 836 | 86.6 | 96.4 | 18 / 41 | admirable 6, exclamó 4, rana 3, resignada 3, eugenia 3 |
| ★ unamuno-niebla-ch27 | 917 | 85.4 | 96.3 | 30 / 58 | piano 4, ladrar 4, cualquiera 3, versos 3, persiguen 3 |
| ★ unamuno-niebla-ch28 | 1198 | 87.6 | 96.0 | 21 / 57 | soñado 8, consuelo 4, acaso 3, sueño 3, echó 3 |
| ★ unamuno-niebla-ch29 | 1443 | 85.9 | 95.1 | 51 / 94 | augusto 6, boda 4, respeto 4, mirada 3, celos 3 |
| unamuno-niebla-ch30 | 1677 | 82.2 | 93.7 | 57 / 108 | devorar 14, confundir 8, comedia 7, burla 6, burla 6 |
| unamuno-niebla-ch31 | 2693 | 83.7 | 94.7 | 57 / 118 | matar 25, ente 11, vivo 10, exclamó 10, suicidarse 8 |
| unamuno-niebla-ch32 | 2336 | 85.8 | 94.6 | 49 / 119 | señorito 8, soñado 7, pie 6, señorito 6, muerte 5 |
| unamuno-niebla-ch33 | 2344 | 83.7 | 93.4 | 49 / 112 | soñado 13, resucitar 11, muerto 9, muerte 8, ficción 8 |
| galdos-marianela-ch01 | 1786 | 75.0 | 83.4 | 199 / 252 | adelante 15, minas 9, viajero 5, vereda 5, murmuró 4 |
| galdos-marianela-ch02 | 2653 | 76.9 | 85.1 | 247 / 327 | ciego 17, piedra 8, cuya 5, cielo 5, galería 5 |
| galdos-marianela-ch03 | 2066 | 81.3 | 88.0 | 149 / 211 | minas 6, rostro 4, muchacha 4, replicó 4, suelo 4 |
| galdos-marianela-ch04 | 3262 | 78.2 | 84.4 | 298 / 395 | pieza 7, cesta 7, gato 6, córcholis 6, medio 5 |
| galdos-marianela-ch05 | 2171 | 70.7 | 77.7 | 365 / 430 | ruedas 6, hierro 4, faltaba 4, ciego 4, taludes 3 |
| ★ galdos-marianela-ch06 | 2032 | 86.3 | 95.9 | 41 / 102 | echó 7, ay 7, cielo 7, exclamó 6, ciego 5 |
| galdos-marianela-ch07 | 2206 | 81.6 | 90.2 | 132 / 198 | belleza 10, ciego 8, añadió 6, cogió 5, pájaro 5 |
| galdos-marianela-ch08 | 2615 | 81.6 | 89.9 | 155 / 234 | ciego 9, faltaba 6, observó 5, chiquilla 5, aire 4 |
| galdos-marianela-ch09 | 3666 | 78.8 | 85.9 | 290 / 400 | pie 8, observó 6, sólo 5, punto 5, lili 5 |
| galdos-marianela-ch10 | 1299 | 81.8 | 88.0 | 103 / 142 | acuerdo 5, adelante 4, amos 3, campo 3, formado 2 |
| galdos-marianela-ch11 | 2488 | 79.3 | 87.1 | 203 / 278 | d 15, teodoro 8, operación 6, patriarca 5, ciego 5 |
| galdos-marianela-ch12 | 1434 | 84.7 | 91.3 | 42 / 85 | d 13, teodoro 7, córcholis 5, cogió 5, celipín 4 |
| galdos-marianela-ch13 | 1382 | 81.0 | 88.6 | 109 / 150 | belleza 5, modo 4, carece 3, único 3, nociones 3 |
| galdos-marianela-ch14 | 2684 | 77.3 | 86.5 | 248 / 328 | d 9, propio 8, modo 8, señorita 7, delante 5 |
| galdos-marianela-ch15 | 1729 | 83.2 | 90.7 | 98 / 150 | señorita 5, ciego 5, medio 4, primo 4, lágrimas 4 |
| galdos-marianela-ch16 | 1392 | 79.5 | 86.9 | 134 / 176 | triunfo 4, señorita 4, cual 3, cuya 3, delicados 3 |
| galdos-marianela-ch17 | 2472 | 80.4 | 88.6 | 192 / 266 | señorita 14, d 7, florentina 6, teodoro 5, exclamó 5 |
| galdos-marianela-ch18 | 1638 | 80.9 | 88.0 | 123 / 173 | piedra 7, echó 5, rato 4, marcha 4, nela 4 |
| galdos-marianela-ch19 | 3749 | 83.6 | 90.8 | 150 / 262 | señorita 11, brazos 5, ingrata 5, vagabunda 5, observó 5 |
| galdos-marianela-ch20 | 2557 | 81.1 | 89.4 | 141 / 218 | prima 11, hermosura 9, cual 5, curiosidad 5, visible 5 |
| galdos-marianela-ch21 | 4826 | 80.0 | 88.8 | 253 / 398 | florentina 14, exclamó 11, d 10, teodoro 10, muerte 9 |
| galdos-marianela-ch22 | 850 | 73.8 | 80.0 | 142 / 168 | sepulcro 3, piedra 3, cementerio 3, rara 2, magnífico 2 |
| alarcon-capitan-veneno-ch04 | 662 | 73.4 | 81.3 | 110 / 129 | republicanos 3, soldados 3, medio 3, disparó 2, tropa 2 |
| alarcon-capitan-veneno-ch05 | 543 | 81.8 | 88.4 | 50 / 66 | angustias 3, ello 2, criada 2, replicó 2, desangrándose 2 |
| alarcon-capitan-veneno-ch10 | 701 | 81.7 | 88.6 | 57 / 78 | exclamó 4, gas 2, forasteros 2, bajo 2, modo 2 |
| alarcon-capitan-veneno-ch11 | 1090 | 80.8 | 89.4 | 87 / 120 | señorita 7, conque 5, capitán 4, sonriendo 4, gallega 4 |
| alarcon-capitan-veneno-ch13 | 878 | 76.9 | 86.3 | 113 / 140 | capitán 3, dirigió 3, d 3, marqués 3, cura 2 |
| alarcon-capitan-veneno-ch15 | 657 | 74.4 | 82.8 | 103 / 123 | marqués 4, medio 3, queja 2, ilustre 2, primo 2 |
| alarcon-capitan-veneno-ch17 | 1209 | 78.0 | 84.6 | 145 / 181 | capitán 3, basta 3, reemplazo 3, tal 3, e 2 |
| alarcon-capitan-veneno-ch19 | 669 | 79.4 | 87.0 | 71 / 91 | angustias 5, marqués 3, ahumado 3, capitán 2, algodón 2 |
| alarcon-capitan-veneno-ch21 | 589 | 79.6 | 86.1 | 65 / 83 | capitán 3, d 2, alcoba 2, carlista 2, nacido 2 |
| alarcon-capitan-veneno-ch22 | 932 | 80.8 | 88.3 | 81 / 109 | capitán 6, angustias 5, sonriendo 4, cual 3, alcoba 2 |
| alarcon-capitan-veneno-ch24 | 919 | 83.0 | 89.7 | 71 / 99 | retiró 3, mirada 2, angustias 2, silencio 2, echó 2 |
| alarcon-capitan-veneno-ch25 | 886 | 83.4 | 89.8 | 62 / 88 | teresa 3, cual 3, viuda 3, angustias 2, dª 2 |
| alarcon-capitan-veneno-ch26 | 1779 | 83.5 | 89.4 | 101 / 155 | d 8, teresa 4, angustias 4, viuda 3, herido 3 |
| alarcon-capitan-veneno-ch29 | 714 | 83.8 | 90.6 | 51 / 73 | capitán 2, principal 2, remedio 2, marcharse 2, suspiro 2 |
| alarcon-capitan-veneno-ch30 | 4992 | 81.7 | 88.9 | 246 / 396 | d 15, angustias 10, muletas 9, capitán 8, exclamó 8 |
| alarcon-sombrero-de-tres-picos-ch01 | 534 | 79.0 | 84.5 | 63 / 79 | según 2, corona 2, batalla 2, costumbre 2, gaceta 2 |
| alarcon-sombrero-de-tres-picos-ch03 | 618 | 74.6 | 81.1 | 91 / 110 | vuestra 5, molinero 4, molino 3, tal 3, cerezas 2 |
| alarcon-sombrero-de-tres-picos-ch04 | 894 | 73.8 | 81.3 | 139 / 166 | señá 7, molino 5, medio 4, traje 3, clérigo 2 |
| alarcon-sombrero-de-tres-picos-ch06 | 561 | 70.2 | 79.7 | 98 / 114 | señá 4, etc 4, imposible 3, molino 3, medio 3 |
| alarcon-sombrero-de-tres-picos-ch08 | 876 | 73.4 | 81.7 | 118 / 145 | sombrero 6, especie 5, picos 4, capa 4, corregidor 4 |
| alarcon-sombrero-de-tres-picos-ch10 | 774 | 85.5 | 91.6 | 32 / 55 | parra 5, corregidor 3, figura 3, señá 2, cesta 2 |
| alarcon-sombrero-de-tres-picos-ch11 | 1562 | 81.5 | 88.3 | 118 / 164 | señá 9, exclamó 5, expuso 4, bajo 3, parra 3 |
| alarcon-sombrero-de-tres-picos-ch12 | 871 | 75.0 | 80.5 | 107 / 133 | obispo 8, uvas 7, secretario 4, mirada 3, envidiaba 3 |
| alarcon-sombrero-de-tres-picos-ch13 | 618 | 80.6 | 87.2 | 54 / 73 | penitenciario 4, canónigo 3, señá 3, obispo 2, cual 2 |
| alarcon-sombrero-de-tres-picos-ch14 | 1212 | 81.0 | 89.1 | 82 / 118 | garduña 7, medio 6, consejo 4, usía 4, acuerdo 4 |
| alarcon-sombrero-de-tres-picos-ch15 | 1175 | 79.9 | 88.1 | 91 / 127 | señá 8, orden 8, molino 4, exclamó 4, medio 4 |
| alarcon-sombrero-de-tres-picos-ch17 | 628 | 81.4 | 85.5 | 45 / 64 | secretario 4, alcalde 3, cántaro 3, despacho 2, mediar 2 |
| alarcon-sombrero-de-tres-picos-ch19 | 548 | 77.2 | 84.9 | 64 / 80 | imposible 4, rebuzno 4, echó 3, molino 3, alcalde 2 |
| alarcon-sombrero-de-tres-picos-ch20 | 1712 | 77.6 | 86.0 | 178 / 229 | propio 5, señá 4, medio 4, tal 4, matar 4 |
| alarcon-sombrero-de-tres-picos-ch21 | 1369 | 80.2 | 88.3 | 84 / 125 | señá 8, marcharse 6, marido 6, frasquita 6, conque 6 |
| alarcon-sombrero-de-tres-picos-ch22 | 627 | 83.9 | 91.1 | 32 / 51 | señá 5, ahorcado 4, garduña 3, d 3, eugenia 3 |
| alarcon-sombrero-de-tres-picos-ch24 | 736 | 85.3 | 91.6 | 24 / 46 | señá 6, molino 6, exclamó 4, marido 4, toñuelo 3 |
| alarcon-sombrero-de-tres-picos-ch27 | 631 | 80.7 | 88.9 | 52 / 71 | señá 5, exclamó 4, toñuelo 3, d 3, eugenia 3 |
| alarcon-sombrero-de-tres-picos-ch28 | 540 | 83.5 | 91.3 | 35 / 51 | señá 3, pum 3, medio 2, molino 2, alguacil 2 |
| alarcon-sombrero-de-tres-picos-ch31 | 1336 | 79.1 | 87.0 | 111 / 151 | marido 7, señá 6, corregidor 5, d 4, eugenia 4 |
| alarcon-sombrero-de-tres-picos-ch32 | 554 | 79.1 | 87.0 | 60 / 77 | tal 3, d 2, eugenia 2, adelantado 2, corregidor 2 |
| alarcon-sombrero-de-tres-picos-ch33 | 963 | 86.1 | 92.3 | 34 / 63 | señá 4, ah 3, etc 3, molino 3, exclamó 2 |
| alarcon-sombrero-de-tres-picos-ch34 | 857 | 85.5 | 91.7 | 32 / 58 | señá 7, cárcel 3, asesino 3, figura 3, lector 3 |
| alarcon-sombrero-de-tres-picos-ch35 | 569 | 79.8 | 88.2 | 58 / 75 | d 3, eugenia 3, suelo 2, marido 2, conque 2 |
| alarcon-sombrero-de-tres-picos-ch36 | 736 | 79.2 | 85.2 | 81 / 103 | señá 4, molino 4, francés 3, molinero 2, sólo 2 |
| galdos-trafalgar-ch01 | 2503 | 76.7 | 83.9 | 264 / 339 | recuerdo 8, sólo 6, memoria 6, cual 6, referir 5 |
| galdos-trafalgar-ch05 | 2591 | 77.7 | 85.8 | 267 / 345 | señorita 7, amos 6, novio 5, amita 5, sólo 4 |
| galdos-trafalgar-ch06 | 2723 | 78.6 | 86.6 | 224 / 305 | d 10, cual 7, escuadra 7, alonso 6, combate 5 |
| galdos-trafalgar-ch07 | 2000 | 79.4 | 87.0 | 174 / 234 | d 9, ésta 6, alonso 5, pieza 5, sitio 3 |
| galdos-trafalgar-ch09 | 3024 | 73.8 | 80.8 | 344 / 434 | escuadra 9, navío 8, marineros 6, francés 6, cuanto 5 |
| galdos-trafalgar-ch10 | 2181 | 72.2 | 80.4 | 249 / 314 | e 20, f 16, línea 10, navíos 7, marineros 6 |
| galdos-trafalgar-ch11 | 3482 | 71.5 | 80.2 | 330 / 434 | navío 14, cañón 14, fuego 13, herido 13, terrible 12 |
| galdos-trafalgar-ch13 | 3832 | 74.7 | 83.6 | 325 / 440 | inglés 16, navío 15, herido 12, dirigió 8, instante 7 |
| palma-tradiciones-peruanas-ch01 | 9555 | 74.5 | 81.0 | 807 / 1094 | virrey 55, conde 27, cuya 15, jesuítas 12, sólo 11 |
| palma-tradiciones-peruanas-ch02 | 9555 | 74.1 | 80.1 | 903 / 1190 | virrey 40, marqués 14, real 13, época 12, pie 10 |
| palma-tradiciones-peruanas-ch03 | 9608 | 74.7 | 80.9 | 886 / 1174 | virrey 32, capitán 14, tal 12, marqués 11, benedicta 10 |
| palma-tradiciones-peruanas-ch04 | 9678 | 76.2 | 81.8 | 826 / 1117 | fray 15, echó 13, arzobispo 12, medio 11, cual 11 |
| palma-tradiciones-peruanas-ch05 | 9602 | 74.0 | 80.4 | 922 / 1210 | marqués 19, echó 15, llorona 12, reina 11, lego 10 |
| valera-pepita-jimenez-ch01 | 8786 | 77.9 | 85.1 | 495 / 758 | tal 19, vicario 12, medio 12, sólo 12, propio 12 |
| valera-pepita-jimenez-ch02 | 8711 | 78.2 | 84.7 | 579 / 840 | vicario 29, tal 14, medio 11, afecto 8, pasión 8 |
| valera-pepita-jimenez-ch03 | 8803 | 79.5 | 86.2 | 543 / 807 | imagen 12, mirada 11, medio 10, tertulia 9, tresillo 9 |
| valera-pepita-jimenez-ch04 | 9320 | 78.7 | 86.4 | 599 / 878 | d 80, vicario 27, pepita 16, conde 12, sólo 10 |
| valera-pepita-jimenez-ch05 | 9316 | 77.4 | 85.1 | 653 / 933 | d 50, tal 24, penetrar 12, sólo 12, cual 10 |
| valera-pepita-jimenez-ch06 | 9255 | 78.3 | 86.2 | 547 / 825 | d 84, conde 46, deán 15, capitán 10, cuanto 9 |
| valera-pepita-jimenez-ch07 | 2051 | 77.9 | 85.7 | 224 / 286 | muerte 7, epílogo 5, vicario 5, cuya 4, pepita 4 |
| cervantes-don-quijote-ch001 | 1883 | 79.6 | 87.1 | 134 / 190 | caballero 11, rocín 6, suya 5, vuestra 5, pensamiento 5 |
| cervantes-don-quijote-ch016 | 2782 | 79.4 | 86.6 | 170 / 253 | arriero 12, ventero 11, moza 10, cual 9, caballero 9 |
| cervantes-don-quijote-ch037 | 3992 | 83.0 | 89.7 | 125 / 245 | vuestra 17, cual 14, merced 10, os 9, mora 9 |
| cervantes-don-quijote-ch054 | 1705 | 82.9 | 89.2 | 77 / 128 | vuestra 12, merced 9, cura 6, barbero 6, ínsula 6 |
| cervantes-don-quijote-ch071 | 2780 | 82.6 | 87.9 | 133 / 216 | licenciado 10, labrador 9, espada 9, tal 7, vuestra 5 |
| cervantes-don-quijote-ch087 | 2643 | 79.3 | 86.3 | 192 / 271 | azotes 11, os 10, desencanto 8, diablo 7, condición 6 |
| quevedo-el-buscon-ch01 | 949 | 82.9 | 88.3 | 64 / 92 | tal 4, mas 4, pensamiento 3, barba 3, sustento 3 |
| quevedo-el-buscon-ch07 | 867 | 85.4 | 90.9 | 43 / 69 | vuestra 4, os 4, verdugo 3, muerte 2, allegado 2 |
| quevedo-el-buscon-ch13 | 1465 | 82.0 | 88.0 | 108 / 152 | tal 5, md 3, medio 3, capa 3, rascó 3 |
| pardo-bazan-pazos-de-ulloa-ch01 | 2340 | 68.5 | 77.0 | 405 / 475 | jinete 13, marqués 11, crucero 7, escopeta 6, cazador 6 |
| pardo-bazan-pazos-de-ulloa-ch08 | 1953 | 73.6 | 83.2 | 249 / 308 | señorito 10, marqués 8, cazador 7, soto 6, julián 5 |
| pardo-bazan-pazos-de-ulloa-ch15 | 2540 | 71.6 | 79.1 | 399 / 475 | brazos 5, pie 5, nucha 4, jueza 4, ésta 4 |
| pardo-bazan-pazos-de-ulloa-ch22 | 1173 | 69.1 | 77.1 | 214 / 249 | cazador 10, perdices 5, estremeció 3, capellán 3, escopeta 3 |
| palacio-valdes-hermana-san-sulpicio-ch02 | 3603 | 76.3 | 83.7 | 310 / 418 | d 20, nemesio 20, catalán 19, comenzó 7, medicina 5 |
| palacio-valdes-hermana-san-sulpicio-ch10 | 7257 | 79.9 | 87.0 | 391 / 609 | d 26, oscar 24, tal 12, echó 11, d.ª 11 |
| palacio-valdes-hermana-san-sulpicio-ch16 | 5213 | 77.0 | 84.5 | 462 / 619 | uzté 17, duque 12, alegría 9, muelle 8, dirigió 6 |
| clarin-la-regenta-ch00 | 4175 | 72.7 | 79.9 | 520 / 646 | arte 14, clarín 9, d 9, crítica 8, social 8 |
| clarin-la-regenta-ch18 | 8679 | 77.7 | 84.2 | 629 / 890 | campo 8, cuanto 8, humedad 7, frígilis 7, echó 7 |
| dario-azul-ch01 | 2856 | 75.2 | 82.6 | 306 / 392 | autor 15, francés 11, tal 9, arte 9, pensamiento 7 |
| samaniego-fabulas-ch00 | 2672 | 72.5 | 79.6 | 315 / 395 | fábula 23, ediciones 10, fabulista 9, versos 8, autor 6 |

How to read it: Bible chapters are close because names count as known and the gap is a dozen archaic words (*tal, cual, mío, mas, os, vuestro, delante, aun, cuyo*); *Niebla* chapters are 60–100 lemmas from 95 %; Galdós, Alarcón and Cervantes need 100–300 per chapter; Palma, Pardo Bazán, the fables and Darío need thousands (library, not ladder). The long Martí chapters ch07–12 (9–11 k words each) are essays and a long tale as single texts: each is a quarter of the whole bridge and cannot be a unit; they stay library, and three of them (ch08, ch09, ch11) are used only as *lemma sources* for adapted units.

## 3. The bridge sequence

### 3.1 How the sequence was built

A lemma-level simulation over the real library data *(modelled)*: start from the lemma encounter counts at the end of the ladder; an **authentic** unit adds the true lemma counts of the library text; an **adapted** unit is a text of 1,300 words (about 1,000 for the first ones is also fine) that uses each lemma of its *pack* exactly `3 − (encounters so far)` times (at least once) and otherwise only known lemmas, so its expected coverage is 1 − (tokens of pack lemmas) / words ≈ **90 %** (the controlled band warns below 88 %, errors below 85 %). A pack is chosen by benefit/cost: for the texts the unit is meant to unlock, the sum over those texts of (running words of the lemma ÷ words of the text), divided by the encounters still needed; 13 slots per pack are reserved for the next entries of the top-200 list of 1.2. Authentic units are placed when their coverage is ≥ 92 % (first third), ≥ 93 % (middle) and ≥ 94–95 % (last third). Lemma identities are the adapter's (first candidate); a real writer has to hit these exact forms, and unit texts will miss the arithmetic by 1–2 points either way.

**Precondition: 34 names.** The adapter does not tag some character and place names as proper nouns, so each counts as a lemma that needs three encounters (and *Augusto*, *Eugenia*, *Meñique*, *Nela*, *Pishi* … would each take a pack slot). The simulation assumes the Spanish session adds these 34 to the proper-name list, as already planned for *Sam* and *Nico* (PLAN.md §7.3). Adapter lemmas: augustar, eugeniar, liduvinar, mauriciar, mauricia, rosariar, teodorar, florentinar, nelar, meñiquir, garduñar, lucar, alonsar, pishi, ratnakara, sringeri, tharu, cern, www, d, p, pro, tam, rehman, jehovar, saular, celipín, lili, frasquita, toñuelo, boseth, mephi, aram, lehem (Augusto, Eugenia, Liduvina, Mauricio, Mauricia, Rosario, Teodoro, Florentina, Nela, Meñique, Garduña, Lucas, Alonso, Pishi, Ratnakara, Sringeri, Tharu, CERN, WWW, the abbreviations D. and P., a Latin *pro*, Tam, Rehman, Jehová, Saúl, Celipín, Lili, Frasquita, Toñuelo, Boseth, Mefi-boset, Aram, Lehem). Effect: +34 known lemmas at the start (1,121), about 0.2–0.4 points on the Niebla, Marianela and Alarcón chapters, and packs free of names.

Design rules that came out of the numbers:

1. **The authentic texts teach little by themselves.** A 92–95 % library chapter has 4–8 first-met lemmas per 100 words and almost none of them occurs three times; the first meeting is worth having (the next pack pays only 1–2 tokens for it) but known lemmas come from adapted packs. 20 authentic texts: 960 first meetings, 27 lemmas known inside their own text.
2. **Work families beat generic frequency.** The most frequent missing 1,000 lemmas would lift Niebla only from 83.8 to 91.9 % pooled; 600 text-targeted lemmas bring 28 of its 33 chapters of 700+ words over 92 % and 13 over 95 %. So packs follow the authentic texts they unlock (Meñique first, then Niebla, then one Marianela chapter) and the domain units are made to carry pack words of the same family.
3. **The authentic prose of the open library is almost all narrative** (7 k of its 1.93 M non-Scripture words are not), so the non-narrative domains are carried by adapted units: news 2, explanation 3, biography 2, correspondence 1, testimony 1, practical 1 (10 adapted units, 13,000 words) next to 5 narrative adapted units. Overall, by running words: narrative 63 % (20 authentic units and 5 adapted), explanation 9 %, news 7 %, biography 6 %, Scripture 6 %, correspondence, testimony and practical 3 % each.
4. **Scripture is a domain, not the road**: three chapters (Juan 4, Juan 9, Génesis 45; 2,435 w; 5.8 %), chosen because they are testimony and reconciliation narratives and already at 92–96 %. Genealogy chapters (Números 26, Esdras 2: 95 % because names are free) are deliberately not used.

### 3.2 The sequence

Columns: **new lemmas** — for an adapted unit, *lemma slots taught* (of which "first met" = never met before; the rest are met once or twice already); for an authentic unit, *first-met lemmas* / *lemmas that reach 3 encounters inside the text*. **expected cov** is the gate's curriculum coverage for that unit (≥ 3 earlier encounters). **known** is the cumulative number of known lemmas after the unit, counting the names of the precondition (1,073 before unit 01).

| id | kind | domain | source | words | new lemmas | expected cov | known | note |
|---|---|---|---|--:|---|--:|--:|---|
| **es-b1-01** | authentic | Scripture narrative (dialogue, testimony) | Juan 4 — the woman at the well (RV 1909) | 1,005 | 37 first met / 8 known | 93.0 | 1129 | Placeable today (93.0 %). Opens the bridge with a text the learner already knows in outline. |
| **es-b1-02** | adapted | narrative (folktale) | adapted from Martí, *La Edad de Oro* ch01 (533 w) + the first 770 w of ch02, text:es:marti-edad-de-oro-ch01/02 | 1,300 | 51 taught (37 first met) | 90.0 | 1180 | Meñique, the giant, the oak. Light simplification: keep the plot, sentence rhythm and *-ra* forms; replace the rarest words. |
| **es-b1-03** | adapted | news / journalism | new text, Global Voices style: oral tradition and folklore (a 1,300-word feature), written to teach the missing words of text:es:gv-es-dae11aaaf264-excerpt-ch01 | 1,300 | 46 taught (40 first met) | 90.0 | 1226 | Opening paragraph in news form (who, where, quotation), then the explanatory body. |
| **es-b1-04** | authentic | news / journalism | text:es:gv-es-dae11aaaf264-excerpt-ch01 (Global Voices, CC BY 3.0) | 214 | 13 first met / 0 known | 93.9 | 1226 | The one open contemporary journalism excerpt in the library (214 w). Unlocked by unit 03. |
| **es-b1-05** | adapted | narrative (folktale) | adapted from Martí ch03–04 (the oak and the well; 2,503 w abridged to 1,300), text:es:marti-edad-de-oro-ch03/04 | 1,300 | 46 taught (41 first met) | 90.0 | 1272 | Unlocks ch06 and ch02. |
| **es-b1-06** | authentic | narrative (riddles, dialogue) | text:es:marti-edad-de-oro-ch06 | 398 | 14 first met / 0 known | 96.5 | 1272 | The three riddles; almost all dialogue. |
| **es-b1-07** | authentic | narrative (folktale) | text:es:marti-edad-de-oro-ch02 | 865 | 60 first met / 0 known | 92.4 | 1272 | Story order is not kept: ch06 (riddles) is placed before ch02; both are episodic. |
| **es-b1-08** | adapted | explanation (contemporary nonfiction) | adapted from Global Digital Library, *Dentro de la World Wide Web* (1,567 w; CC BY 4.0, canModify) text:es:bridge-dentro-de-la-world-wide-web-ch01 | 1,300 | 46 taught (40 first met) | 90.0 | 1318 | Open licence allows the adaptation; swap Spain-isms (ordenador, móvil) for Honduran *computadora, celular*. |
| **es-b1-09** | authentic | narrative (short story) | text:es:bridge-demasiados-platanos-ch01 (GDL, CC BY 4.0) | 481 | 35 first met / 0 known | 92.3 | 1318 | A modern translated story about a farmer; part of its farm vocabulary (cosecha, madura, dulces) is in the unit-08 pack. |
| **es-b1-10** | adapted | explanation (history) | adapted from Martí ch08 (*Historia del hombre contada por sus casas*, an excerpt of about 1,300 w from part 2 of ch07), text:es:marti-edad-de-oro-ch08 | 1,300 | 48 taught (37 first met) | 90.0 | 1366 | The only open explanatory prose that is not about computers or the sea. |
| **es-b1-11** | adapted | narrative (dialogue) | adapted from Unamuno, *Niebla* ch04 (1,234 w), text:es:unamuno-niebla-ch04 | 1,300 | 44 taught (42 first met) | 90.0 | 1410 | Gets the learner into Unamuno’s short sentences and quoted speech; names stay as written. |
| **es-b1-12** | authentic | narrative (dialogue) | text:es:unamuno-niebla-ch12 | 1,222 | 40 first met / 1 known | 96.2 | 1411 | The laundress; the first Niebla chapter. |
| **es-b1-13** | adapted | biography | adapted from Martí ch11 (the Las Casas section, ≈ 1,300 w), text:es:marti-edad-de-oro-ch11 | 1,300 | 46 taught (40 first met) | 90.0 | 1457 | If the owner does not allow adapting Gutenberg texts, write a new biography of a consenting person with the same pack. |
| **es-b1-14** | authentic | Scripture testimony | Juan 9 — the man born blind (RV 1909) | 749 | 21 first met / 1 known | 95.7 | 1458 | A first-person testimony inside the Bible: “una cosa sé”. |
| **es-b1-15** | adapted | biography (profile) | new text: a news-style profile of a Honduran person (composite or consenting), 1,300 w | 1,300 | 46 taught (40 first met) | 90.0 | 1504 | Contemporary biography the library lacks. |
| **es-b1-16** | authentic | narrative (dialogue) | text:es:unamuno-niebla-ch28 | 1,198 | 59 first met / 1 known | 94.3 | 1505 | Mauricio visits Augusto. |
| **es-b1-17** | adapted | correspondence | new text: three letters / e-mails (family, church, official), with the pack of the letters in text:es:valera-pepita-jimenez-ch01 as vocabulary model | 1,300 | 46 taught (39 first met) | 90.0 | 1551 | Pepita Jiménez is the only open letter-writing in the library and sits at 77 %; it stays library. |
| **es-b1-18** | authentic | narrative (dialogue) | text:es:unamuno-niebla-ch15 | 1,611 | 80 first met / 3 known | 94.2 | 1554 | The aunt and the niece. |
| **es-b1-19** | adapted | explanation (nature) | adapted from GDL *Inmersión* (770 w) + *Pishi atrapado en una tormenta* (351 w), extended by about 180 w; both CC BY 4.0 | 1,300 | 46 taught (39 first met) | 90.0 | 1600 | The sea and storm vocabulary (arrecife, océano, relámpago) of two GDL texts. |
| **es-b1-20** | authentic | narrative (dialogue) | text:es:unamuno-niebla-ch18 | 1,340 | 62 first met / 3 known | 94.3 | 1603 |  |
| **es-b1-21** | adapted | testimony | new text: three first-person testimonies (a conversion, a healing, a sentence in court), no Scripture quoted, with the lemma pack of Juan 9, Hechos 22 and 26, Marcos 5, 1 Juan 4 | 1,300 | 53 taught (30 first met) | 90.0 | 1656 | Mission-team testimonies fit here and could replace the composite ones (with consent). |
| **es-b1-22** | authentic | Scripture narrative | Génesis 45 — Joseph makes himself known (RV 1909) | 681 | 23 first met / 0 known | 95.9 | 1656 |  |
| **es-b1-23** | adapted | news / journalism | new text: a local news report and an interview (a flood, a health campaign), 1,300 w | 1,300 | 49 taught (38 first met) | 90.0 | 1705 | Written to teach the second news pack (océano, relámpago, contagio, inmediatamente, …). |
| **es-b1-24** | authentic | narrative (dialogue) | text:es:unamuno-niebla-ch11 | 1,621 | 72 first met / 2 known | 94.4 | 1707 |  |
| **es-b1-25** | authentic | narrative (dialogue) | text:es:unamuno-niebla-ch20 | 2,212 | 93 first met / 4 known | 94.3 | 1711 | The longest Niebla chapter in the sequence (2,212 w). |
| **es-b1-26** | adapted | practical communication | new text: notices, rules, a clinic leaflet and an instruction sheet, 1,300 w | 1,300 | 55 taught (31 first met) | 90.0 | 1766 | The pack is mostly Niebla / Marianela words; a word that does not fit a notice moves to unit 30 and the log says so. |
| **es-b1-27** | authentic | narrative (dialogue) | text:es:unamuno-niebla-ch10 | 1,820 | 83 first met / 4 known | 94.3 | 1770 |  |
| **es-b1-28** | authentic | narrative (dialogue) | text:es:unamuno-niebla-ch29 | 1,443 | 65 first met / 0 known | 94.7 | 1770 |  |
| **es-b1-29** | authentic | narrative (dialogue) | text:es:unamuno-niebla-ch09 | 775 | 27 first met / 0 known | 96.4 | 1770 | From here on every authentic unit is at or above 95 %. |
| **es-b1-30** | adapted | narrative (dialogue) | adapted from Unamuno, *Niebla* ch22 (1,184 w), text:es:unamuno-niebla-ch22 | 1,300 | 53 taught (34 first met) | 90.0 | 1823 |  |
| **es-b1-31** | authentic | narrative (dialogue) | text:es:unamuno-niebla-ch26 | 836 | 26 first met / 0 known | 96.4 | 1823 |  |
| **es-b1-32** | authentic | narrative (dialogue) | text:es:unamuno-niebla-ch16 | 1,067 | 36 first met / 0 known | 95.6 | 1823 |  |
| **es-b1-33** | adapted | narrative (19th-century description) | adapted from Galdós, *Marianela* ch12 (1,434 w abridged), text:es:galdos-marianela-ch12 | 1,300 | 49 taught (35 first met) | 90.0 | 1872 | Prepares Galdós’s longer sentences for unit 35. |
| **es-b1-34** | authentic | narrative (dialogue) | text:es:unamuno-niebla-ch27 | 917 | 31 first met / 0 known | 96.3 | 1872 |  |
| **es-b1-35** | authentic | narrative (19th-century description) | text:es:galdos-marianela-ch06 (Galdós, d. 1920) | 2,032 | 83 first met / 0 known | 95.9 | 1872 | The one Galdós chapter that reaches 95 %; the bridge ends on a different author and century. |

Totals: 35 units, **41,987 words**; adapted 15 units / 19,500 w; authentic 20 units / 22,487 w (54 %); Scripture 2,435 w (5.8 %). Known lemmas 1,039 (+34 names) → 1,872. Authentic share by thirds: units 1–10 31 %, 11–22 47 %, 23–35 71 %.

Stage tags for `ladder.json`: all 35 units are `"stage": "b1-bridge"`; an authentic unit is `{ "kind": "authentic", "textId": "text:es:…" }`; an adapted unit is a controlled-style document `data/ladder/es/units/es-b1-NN.json` with `"kind": "adapted"` and the pipeline block of `docs/LADDER.md`.

### 3.3 What each adapted unit introduces

Lemma slots (the adapter's lemma; the surface form to write in plain type; ‹lemma› when the adapter's lemma is an artefact and the writer must use the shown form; some words appear twice under two lemmas, e.g. *comedia*, *enorme*, *rana*, because the adapter splits one word in two). Each slot must occur **exactly three times** (once or twice where "partly met" is the case) and no other unknown lemma may occur; the names of the precondition are free. Entries that do not fit the unit's domain may move to the nearest unit within ± 2 (log the move). Some slots are Spain-isms or Scripture-register words (*vuestra, os, mas, cual*) that the unit text must put in a natural place (a quotation, a letter to a pastor, an old song).

**es-b1-02 — narrative (folktale)** (51 slots; 37 first met, 14 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-04 (93.9 %).

bajo, cual, pie, tal, cielo, echó, brazos, cuanto, exclamó ‹exclamar›, sólo, e, medio, modo ‹modar›, princesa, pozo ‹pozar›, gigante ‹gigantar›, hacha ‹hacho›, palacio, basta ‹bastar›, pico, propio, roble ‹roblar›, sueño, orejas, os, monte, acaso, ramas, cuero ‹cuerar›, enigma ‹enigmo›, faltaba, oh, roca ‹roco›, piedra, marqués ‹marcar›, encantado ‹encantar›, abajo, adivinaba, loco, comenzó ‹comenzar›, ésta ‹ésto›, dueño ‹dueñar›, señorito ‹señoritar›, arroyo ‹arroyar›, enamorado ‹enamorar›, cartel, tronco ‹troncar›, soñado ‹soñar›, ah, matar, raíces.

**es-b1-03 — news / journalism** (46 slots; 40 first met, 6 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-04 (93.9 %), es-b1-06 (96.5 %). Domain fit: 36 of 46 slots occur in the library texts of this domain (gv-es-dae11aaaf264-excerpt-ch01, bridge-dentro-de-la-world-wide-web-ch01, bridge-inmersion-ch01, bridge-pishi-atrapado-en-una-tormenta-ch01).

aun, cuya, herido ‹herir›, según, señorita, muerte, dirigió ‹dirigir›, suya, punto ‹puntar›, suelo, aire, poeta, cogió, documento, indígena ‹indígeno›, significa ‹significar›, popular, folclore ‹folclorar›, oral, peces, especialmente, fuego, fondo ‹fondar›, experiencia ‹experiencio›, pájaro, personajes ‹personaje›, inspiraba ‹inspirar›, sabiduría ‹sabidurío›, revelaba, frase, expresión, amantes ‹amante›, genios ‹genio›, añoraban ‹añorar›, datos ‹dato›, borais ‹borai›, vasija ‹vasijo›, utilizar, benévolos ‹benévolo›, malévola ‹malévolo›, fantasmas ‹fantasmar›, brujo ‹brujar›, maga, invaluables ‹invaluable›, alegría, molestaba.

**es-b1-05 — narrative (folktale)** (46 slots; 41 first met, 5 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-06 (96.5 %), es-b1-07 (92.4 %).

vuestra, delante, caballero ‹caballerar›, muerto, criada ‹criar›, figura ‹figurar›, instante, solía ‹soler›, replicó ‹replicar›, rostro ‹rostrar›, formado ‹formar›, color, campo, novio ‹noviar›, eh, dulce ‹dulcer›, cabía ‹caber›, veras ‹vero›, importa ‹importar›, ello ‹ellar›, niebla ‹nieblo›, demás ‹demá›, segunda, real, ruido ‹ruir›, piano ‹pianar›, hilo, celos ‹celo›, infeliz, añadió ‹añader›, balcón, lágrimas, acuerdo ‹acordar›, pecho, abierto, arrullo ‹arrullar›, duque ‹duquir›, atrás, conocimiento ‹conocimientar›, tuyo, señas ‹seño›, brotar, chiquilla ‹chiquillar›, rato, cargo, valiente.

**es-b1-08 — explanation (contemporary nonfiction)** (46 slots; 40 first met, 6 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-09 (92.3 %). Domain fit: 30 of 46 slots occur in the library texts of this domain (bridge-dentro-de-la-world-wide-web-ch01, bridge-demasiados-platanos-ch01, bridge-inmersion-ch01).

único, muchacha ‹muchacho›, mirada, puro, pensamiento, frente, sonriendo, papel, ocasión, imagen ‹imager›, varias, marcharse, francés, internet, ordenadores, página, información, conectados ‹conectado›, millones, madura, cualquiera, dulces ‹dulz›, colección, incluso ‹inclusar›, cualquier, libre, red, dirección, envuelto ‹envolver›, ante, cosecha, puya ‹puyo›, paquete ‹paquetar›, punta ‹punto›, siquiera ‹siquir›, normal, temblaba, genial, móviles, web, jip, novela, realidad ‹realidar›, efecto, conque ‹conquir›, cáscara ‹cáscaro›.

**es-b1-10 — explanation (history)** (48 slots; 37 first met, 11 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-12 (96.2 %). Domain fit: 22 of 48 slots occur in the library texts of this domain (marti-edad-de-oro-ch08, marti-edad-de-oro-ch09).

atrevió ‹atrever›, cura ‹curo›, carne, cabo, conversación, pintado, observó ‹observar›, embargo ‹embargar›, merced ‹mercer›, inglés, suerte, orden ‹ordar›, capitán, hojas, ridículo, ficción, matrimonio ‹matrimoniar›, cojió ‹cojer›, señorito ‹señoro›, portera ‹portero›, devorar, inventado, ay, despacho, ente ‹entar›, silencio ‹silenciar›, seco, anarquista, necesidad, contrario, resignada ‹resignar›, capaz, psicología ‹psicologío›, canario ‹canariar›, bah, barba, brutos, gozo, prosiguió, versos, creación, imposible, existencia ‹existencio›, conquistar, nivola ‹nivolar›, pianista, pino, esperanza.

**es-b1-11 — narrative (dialogue)** (44 slots; 42 first met, 2 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-12 (96.2 %), es-b1-14 (95.7 %).

adelante, chica ‹chico›, dispuesto ‹disponer›, pena, falta, sombrero, deseo, retiró ‹retirar›, coche, sitio, advirtió, murmuró ‹murmurar›, conde ‹condar›, apretaba ‹apretar›, misteriosa ‹misterioso›, admirable ‹admirablar›, burla ‹burlar›, suicidarse ‹suicidar›, calmar, ciego ‹cegar›, consuelo, chiquilla ‹chiquillo›, acariciaba, psicológica, separaba, sobrina, ilusión, antojaba ‹antojar›, eternidad ‹eternidar›, anarquismo ‹anarquismar›, porvenir, interrumpió ‹interrumper›, hipoteca ‹hipoteco›, exaltado ‹exaltar›, desgracia ‹desgracio›, tonto, aburrimiento ‹aburrimientar›, distraído ‹distraer›, género, grave ‹gravar›, fisiológico, ocultar, terrible ‹terriblar›, tonterías ‹tonterío›.

**es-b1-13 — biography** (46 slots; 40 first met, 6 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-14 (95.7 %), es-b1-16 (94.3 %). Domain fit: 12 of 46 slots occur in the library texts of this domain (marti-edad-de-oro-ch11).

tras, costumbre, respeto, nota, autor, gato, soltó, produjo ‹producir›, considerar, linda, dientes, siglo, principal, broma ‹bromo›, aseguro, sacudió ‹sacuder›, enamorada ‹enamoradar›, oído, pasear, vergüenza ‹vergüenzo›, remedio, sentimiento ‹sentimientar›, ése, ladrar, esperanto ‹esperantar›, entrañas ‹entraño›, oir, azar, siquiera ‹siquiero›, desnudo, experimentaba ‹experimentar›, solitario ‹solitariar›, consigo, rana ‹rano›, mozuela ‹mozuelo›, recuerdo, recojido ‹recojer›, confundir, burla ‹burlo›, aparición, infinito ‹infino›, ciencia ‹ciencio›, soltera ‹soltero›, cinismo ‹cinismar›, paraguas ‹paraguo›, imaginación.

**es-b1-15 — biography (profile)** (46 slots; 40 first met, 6 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-16 (94.3 %), es-b1-18 (94.2 %). Domain fit: 10 of 46 slots occur in the library texts of this domain (marti-edad-de-oro-ch11).

hermosura ‹hermosuro›, arte ‹artar›, fijo ‹fijar›, ambos, letras, detrás, entero, lanzó ‹lanzar›, virtud, molino ‹molinar›, primo, soldados, referir, aquél, corriente ‹corrientar›, locura ‹locuro›, empeño ‹empeñar›, fantasía ‹fantasío›, propósito ‹propóso›, voluntad ‹voluntar›, fortuna ‹fortuno›, vislumbraba, místico, monólogo, odio, horror, rana ‹ranar›, apartó, hombrada ‹hombrado›, disparate ‹disparatar›, pretende ‹pretendar›, teoría ‹teorío›, resucitar, seductor, desprecio, soledad ‹soledar›, respirar, representaba, filósofo, mente, vago ‹vagar›, emprender, secreto, insinuó ‹insinuar›, menester, dioses ‹diose›.

**es-b1-17 — correspondence** (46 slots; 39 first met, 7 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-18 (94.2 %), es-b1-20 (94.3 %). Domain fit: 31 of 46 slots occur in the library texts of this domain (valera-pepita-jimenez-ch01, valera-pepita-jimenez-ch07).

contemplando, memoria, vencido, entregó ‹entregar›, rara, carácter, chico ‹chicar›, diablo, traje, ánimo, gritos, atención, monja, procuraba ‹procurar›, derritiendo ‹derretir›, íntimo, vicario ‹vicariar›, gratitud, boda ‹bodo›, lector, conciencia ‹conciencio›, personaje ‹personajar›, sobra ‹sobrar›, conforme ‹conformar›, destino ‹destinar›, frialdad ‹frialdar›, pretendía, repuso ‹reponer›, humanidad ‹humanidar›, admirado, acudir, húmeda, harto ‹hartar›, breve ‹brevar›, completo, epílogo, preciso ‹precisar›, enamorados ‹enamorado›, renta ‹rento›, comedia ‹comedio›, intención, término, envejecido, desahogo, comedia ‹comediar›, precisamente ‹precisamentar›.

**es-b1-19 — explanation (nature)** (46 slots; 39 first met, 7 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-20 (94.3 %), es-b1-22 (95.9 %). Domain fit: 34 of 46 slots occur in the library texts of this domain (bridge-inmersion-ch01, bridge-dentro-de-la-world-wide-web-ch01, bridge-pishi-atrapado-en-una-tormenta-ch01).

semejante ‹semejantar›, conviene ‹convenir›, arrojó, espaldas, tendido ‹tender›, sombra, sostener, especie ‹especiar›, consejo, queja ‹quejar›, reina, capa ‹capo›, angustias ‹angustiar›, corales, arrecife ‹arrecifar›, anémonas ‹anemón›, payaso ‹payasar›, aletas ‹aleto›, pulpo ‹pulpar›, marina, distancia ‹distancio›, pluma, criatura ‹criaturo›, buceo, cuidadosamente ‹cuidadosamentar›, loro ‹lorar›, budiones ‹budión›, escondido ‹esconder›, aguja ‹agujar›, través ‹travé›, atraía, plantas, alimento ‹alimentar›, mezclado ‹mezclar›, amarillo, pasto, bote ‹botar›, plantel, venenosa ‹venenoso›, tiburones, tortuga ‹tortugo›, carey, dugongo ‹dugongar›, plancton, marino ‹marinar›, renunciar.

**es-b1-21 — testimony** (53 slots; 30 first met, 23 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-22 (95.9 %), es-b1-24 (94.4 %). Domain fit: 38 of 53 slots occur in the library texts of this domain (bible-jhn-9, bible-act-26, bible-act-22, bible-mrk-5, bible-1john-4).

pálido, sinagogo, persiguen, príncipe, perfecto ‹perfectar›, juicio ‹juiciar›, temor, tribuna ‹tribunar›, nacido, atado ‹atar›, testigo, romano, puercos ‹puerco›, demonio, encerrado ‹encerrar›, acontecido ‹acontecer›, arrebato ‹arrebatar›, tranquilidad ‹tranquilidar›, tercera, rincón, atormentaba ‹atormentar›, cárcel, espanto ‹espantar›, cuán, varón, resplandor, panoli, acusado ‹acusar›, prisión, susurro ‹susurrar›, capricho ‹caprichar›, potestad ‹potestar›, nacimiento, lástima, juntando, visiones, dueña ‹dueño›, azote, colocación, encuentro, alarmada ‹alarmar›, sepulcros, cadena, contigo, rodeado ‹rodear›, salvador, suspenso ‹suspensar›, castigar, aquélla ‹aquéllo›, contagio ‹contagiar›, testificar, ofender, cabellera ‹cabellero›.

**es-b1-23 — news / journalism** (49 slots; 38 first met, 11 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-24 (94.4 %), es-b1-25 (94.3 %). Domain fit: 8 of 49 slots occur in the library texts of this domain (gv-es-dae11aaaf264-excerpt-ch01, bridge-pishi-atrapado-en-una-tormenta-ch01).

reñir, océano, empujó ‹empujar›, solicitar, nubes, nivolesco ‹nivolescar›, preparación, seno, doble, portería ‹porterío›, suicidio ‹suicidiar›, aconseja, inquieto ‹inquietar›, concreto ‹concretar›, apetito ‹apeto›, crudezas ‹crudezo›, justificar, lentamente, estómago, profunda ‹profundo›, acostumbrado ‹acostumbrar›, compromiso ‹compromisar›, brillaban ‹brillar›, novia ‹novio›, oirle ‹oirlar›, silencioso ‹silenciosar›, decisivo ‹decisivar›, quia ‹quiar›, compadecía ‹compadecer›, diálogo, mozo ‹mozar›, agitado ‹agitar›, enormes ‹enorme›, ratnakara ‹ratnakar›, relámpago, víctima ‹víctimo›, cuchitril, entrevista, asiento, consultar, deslizándose ‹deslizar›, puño ‹puñar›, palpando, nebulosa ‹nebuloso›, fogueteiro ‹fogueteirar›, desgraciado ‹desgraciar›, deshacer, estancia ‹estancio›, palideció ‹palidecer›.

**es-b1-26 — practical communication** (55 slots; 31 first met, 24 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-27 (94.3 %), es-b1-28 (94.7 %), es-b1-29 (96.4 %).

heroico ‹heroicar›, arrancar, determinación, resolución, bruma ‹brumo›, enterado ‹enterar›, febril, conquista, generoso, águila ‹águilo›, haragán, concebir, apellido, despecho ‹despechar›, divertirse ‹divertir›, amparo, humor, muñeco ‹muñecar›, sendas ‹sendo›, intruso ‹intrusar›, metafísica, lógica, extendía ‹extender›, majadero ‹majaderar›, furiosa ‹furioso›, fío, misterio ‹misteriar›, jaula ‹jaulo›, cenicero ‹cenicerar›, conmovido ‹conmover›, lívido, honrado ‹honrar›, convicción, candidato ‹candidatar›, sacrificio, borrado, mortal, limosna ‹limosno›, arrastrando ‹arrastrar›, pareja ‹parejo›, diestra ‹diestro›, resistir, formalmente ‹formalmentar›, quieto ‹quietar›, rigor, butaca ‹butaco›, línea ‹líneo›, cura, excelente ‹excelentar›, recobrar, moza ‹mozo›, inmortal, cotidianas ‹cotidiano›, comprometido, mendigo.

**es-b1-30 — narrative (dialogue)** (53 slots; 34 first met, 19 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-31 (96.4 %), es-b1-32 (95.6 %).

arado ‹arar›, corresponde ‹correspondar›, chala ‹chalar›, rabia, confunde ‹confundar›, complicado ‹complicar›, artificial, ponderar, desfigurado ‹desfigurar›, muslo ‹muslar›, afea ‹afear›, disposición, tembloroso ‹temblorosar›, interesante ‹interesantar›, sendero ‹senderar›, proyección, fregar, ritmo ‹ritmar›, lírico, inútil, aterrado ‹aterrar›, cosa, aburrido ‹aburrir›, amoroso ‹amorosar›, pretexto ‹pretextar›, formulando, sujeto ‹sujetar›, figura ‹figuro›, entierro, nivolescos ‹nivolesco›, suplico ‹suplicar›, tiento, desliz, solterón, melancólico, molestia ‹molestio›, niebla ‹nieblar›, completamente ‹completamentar›, viuda ‹viudar›, anciano, engendrar, tolerar, estallar, autoridad ‹autoridar›, tragedia ‹tragedio›, rumor, grosería ‹groserío›, interior, par, confidente ‹confidentar›, teatro ‹teatrar›, destruir, lápiz.

**es-b1-33 — narrative (19th-century description)** (49 slots; 35 first met, 14 partly met; 1,300 w; expected 90.0 %). Next authentic units: es-b1-34 (96.3 %), es-b1-35 (95.9 %).

tonterías ‹tonter›, lazarillo ‹lazaro›, nueces, fantasía ‹fantaser›, frescura ‹frescuro›, palma ‹palmo›, crudo ‹crudar›, disparates ‹disparate›, compañeros ‹compañero›, bondad ‹bondar›, chocolate, batiendo ‹bater›, cavilar, distinto, prisa ‹priso›, relaciones, adelantado ‹adelantar›, lujo ‹lujar›, sabio ‹sabiar›, espinas ‹espino›, castaños ‹castaño›, gobernar, absoluto ‹absolutar›, difunta ‹difunto›, cesar, ensanchaba, temblorosa ‹tembloroso›, comparación, confuso ‹confusar›, gozoso ‹gozosar›, vegetal, entusiasmo ‹entusiasmar›, rocío ‹rociar›, esencia ‹esencio›, acento ‹acentar›, amorosos ‹amoroso›, facultad ‹facultar›, preciosas ‹precioso›, educación, ripio ‹ripiar›, timos ‹timo›, sinvergüenza ‹sinvergüenzar›, maldita ‹maldito›, rabia ‹rabio›, apuntó, sensación, manía ‹manío›, demostrar, físico.

**Domain fit is partial.** A pack is selected to unlock the authentic texts that follow, with 16–83 % of its slots drawn from the own domain texts of the unit (fit: news 36 of 46, internet 30 of 46, sea 34 of 46, testimony 38 of 53, correspondence 31 of 46, history 22 of 48, biography 12 of 46, biography 2 10 of 46, news 2 8 of 49, practical none). Where the fit is low the label is the *genre of the text* (a profile, a news report, a notice), not a promise that its vocabulary is that of the domain; the writer fills the rest from narrative content that fits the genre, or moves the word to a neighbouring unit. A domain-pure bridge would need 3–4 more adapted units (about 5 k words) and would delay the Niebla placements by the same amount.

### 3.4 What the gate will say (predicted) and rules that need a decision

Predicted findings for the 35 units *(modelled)*, in the order of `docs/LADDER.md`:

- **Coverage.** Adapted units at 90.0–90.1 % (controlled band: warn < 88 %, error < 85 %); authentic units at 92.3–96.5 % (authentic band: warn < 92 %, error < 88 %); the lowest are unit 9 (92.3 %), unit 7 (92.4 %), unit 1 (93.0 %), unit 4 (93.9 %). No coverage finding if the writers hit the packs; a pack missed by one lemma per 100 words moves a unit to 89 %.
- **New lemmas per 100 words** (warn > 5, error > 9). Adapted units 2.3–3.3. Authentic units 2.8–7.3: **3 warnings** (unit 4 6.1; unit 7 6.9; unit 9 7.3) and no error. A chapter at 92–95 % is bound to have about 5 first-met lemmas per 100 words; the rule is meant for controlled text. Recommendation to the Spanish session: judge authentic units on coverage alone.
- **Cliff** (a drop of more than 6 points below the mean of the previous three units). After the rewrite the ladder ends with units at 92.4, 97.0 and 96.2 %: unit 01 (93.0 %) drops 2.2 points and unit 02 (90.0 %) drops 5.4 points below the mean of the previous three; nothing later drops more. (On the earlier 100 % units both would have warned, by 7 points.) Unit 02 is one point from the warning: if its pack runs to 3.8 lemmas per 100 words it will fire.
- **Recycling** (a lemma first met in a unit appears ≥ 3 more times in the next 6 units; warning when more than 25 % of the unit's new lemmas miss it). The authentic texts alone give **7.5 %** (37 of 494 first-met pack lemmas reach 3 occurrences in the next six authentic texts). So the writers carry it: each adapted unit must re-use the packs of the previous two adapted units (about 65 slots × 1–2 tokens + the 2–3 occurrences that the next authentic text happens to give), roughly 90–100 recycled tokens per unit (7 % of its words). These tokens are *known* words when they occur, so they cost no coverage — but they constrain the writer, and the last two adapted units (30 and 33) are exempt by the gate's own rule (fewer than 6 units follow). The rewritten a2-2 units 10–14 show what happens without the discipline (5 warnings, 30–97 % unmet). If this proves unworkable, the honest alternative is a window of 10 units for the b1-bridge in `policy.ts`.
- **Scripture share** of the stage 5.8 % (limit 40 % / the brief's 15 %). **Domain mix** as in 3.1.
- **Constructions first met.** The adapter's detectors will register few new constructions here (the b1 target is recognition of *-ra/-se* subjunctive imperfects, long periodic sentences and the literary preterite in *Niebla*/*Marianela*); no detector exists for them (PLAN.md §7.7).

Other points for the Spanish session:

- **Editions.** Alarcón (*Capitán Veneno*, *Sombrero*) is a classroom edition with hard-wrapped lines and footnote markers (`[213]`); chapters of both are 86–92 % after the bridge, so they are not in the sequence; a person must check the edition before any placement.
- **Rights.** All Gutenberg records verify the United States only and say canModify: false. Unamuno (d. 1936) and Galdós (d. 1920) are probably public domain in Spain and Honduras by the plan's own reading, but nobody has verified it. Unit texts adapted from Gutenberg works (units 2, 5, 10, 11, 13, 30, 33) need the owner's decision; the open-licence sources (the GDL texts of units 8 and 19, the Global Voices article behind unit 3) are free to adapt.
- **Variety and register.** *Niebla* and *Marianela* are Peninsular and 19th/early-20th-century (*vosotros*, *os*, *leísmo*, *mío*, *sólo*); that is the library the learner will read, but it is not Honduran Spanish, and the bridge does not practise voseo. The word sheet already labels them receptive.
- **Content.** The Niebla chapters in the sequence (09–29) are love, jealousy and philosophical dialogue; the later chapters (30–33) discuss suicide and are not placed. A reviewer should read the twelve chapters before they reach a learner.
- **Audio.** Every adapted unit is 1,300 words, the limit used for a2-2; authentic units up to 2,212 words need an existing recording or text-to-speech; none exists.

### 3.5 If a unit text misses its pack

Rule of thumb from the model: one lemma used twice instead of three times leaves it unknown for the next unit and costs the following authentic text about 0.1 point; ten such lemmas in one unit cost the next authentic text about 1 point and can drop a placement below 92 %. Units 12, 14, 22, 29, 31, 34 (95.7–96.4 %) have 3–4 points of slack; units 7, 9 and 1 (92.4, 92.3 and 93.0 %) have less than one point, so their preceding adapted unit must be checked with `npm run ladder:place` before the placement stays in the ladder.

### 3.6 Placeable after the bridge but not in the sequence

*(modelled, after es-b1-35)* — the library the learner can read next, which is what "ends where the library is readable" means in practice today:

Non-Scripture, ≥ 92 %: Niebla ch06 (1380 w, 95.1); Niebla ch31 (2693 w, 94.7); Niebla ch32 (2336 w, 94.6); Niebla ch22 (1184 w, 94.5); GDL vuelve-gata-ch01 (53 w, 94.3); Niebla ch21 (1909 w, 94.2); Niebla ch25 (1026 w, 94.1); Niebla ch07 (805 w, 94.0); Niebla ch13 (1556 w, 93.8); Niebla ch30 (1677 w, 93.7); Niebla ch14 (2176 w, 93.7); Niebla ch24 (1750 w, 93.6); Niebla ch04 (1234 w, 93.6); Niebla ch17 (2546 w, 93.4); Niebla ch33 (2344 w, 93.4); dario-cantos-de-vida-y-esperanza-ch52 (74 w, 93.2); GDL una-casa-para-raton-ch01 (98 w, 92.9); marti-edad-de-oro-ch03 (965 w, 92.7); alarcon-capitan-veneno-ch27 (248 w, 92.7); Niebla ch08 (1950 w, 92.6); Niebla ch02 (1546 w, 92.5); alarcon-sombrero-de-tres-picos-ch33 (963 w, 92.3); cervantes-don-quijote-ch124 (1772 w, 92.2); Niebla ch19 (2260 w, 92.1); Niebla ch01 (1388 w, 92.1); marti-edad-de-oro-ch04 (1538 w, 92.0).

Bible: 436 chapters ≥ 92 % and 92 ≥ 95 % (from 18 / 1 today). Narrative and testimony chapters of 500+ words at ≥ 95 %: 2sa-19 (1358), jhn-6 (1337), num-26 (1312), jos-10 (1237), 2ki-4 (1199), num-1 (1165), jhn-8 (1139), 2ki-10 (1093), jdg-11 (1071), 2sa-13 (1054), neh-7 (1054), mrk-10 (1029), jhn-12 (1027), 2sa-14 (1020), jhn-4 (1005), 1ki-13 (1001), jhn-11 (996), 2sa-15 (992), jhn-1 (932), gen-47 (928), ezr-2 (927), jhn-5 (920), deu-2 (907), jhn-7 (907), ezr-8 (902), luk-4 (895), 2sa-12 (885), gen-42 (884), 2ki-8 (879), 1sa-9 (875).

The Martí tale after the bridge: ch01 91.4 %, ch03 92.7 %, ch04 92.0 %, ch05 92.0 % — the chapters the adapted units 2 and 5 were made from; ch03, ch04 and ch05 are within one point of the line and are optional extras (left out only to keep the sequence at 35 units).

## 4. What cannot be bridged with the open library, and what new texts are needed

**Measured limits.** After the bridge the learner knows 1,872 lemmas (including the 34 names); the audit's yardsticks are 3,250 for B2 recognition and 8,000 for comfortable novels. With this adapter, covering 95 % of the average library text needs far more than a bridge can teach: the 5,000 most frequent lemmas cover 94.9 %. In addition to what the table in 2 shows, a second, longer bridge — call it b2 — of roughly 60–100 k words at the same 56 words per known lemma would be needed before *Marianela* (357 lemmas = 20 k words for 92 % pooled, 988 = 55 k for 95 %), *Quijote* (189 / 814 = 11 k / 46 k) and Alarcón (267–278 / 734–735 = 16 k / 41 k) are comfortable. *Palma*, *Pardo Bazán*, Darío and the fables (1,292–3,154 lemmas) stay library for the whole course.

**What the open library does not contain at all** (so no placement and no adaptation can supply it):

1. **Contemporary conversation and spoken register.** The only dialogue is 19th-century fiction (*usted*, *vosotros*, *leísmo*, formal address). There is no voseo, no Honduran speech, no phone, chat, market or clinic talk beyond what the ladder itself writes (units 1–69). Needed: transcribed interviews and conversations in Honduran Spanish, recorded with consent (the mission team and its neighbours are the nearest source), 10–20 texts of 500–1,200 words, each with its audio; plus subtitles and transcripts from CC BY podcasts and radio if a verified source exists.
2. **Modern nonfiction and explanation.** 7 k words in all (9 GDL stories and one Global Voices excerpt), one explanatory text (WWW), one marine text. Needed: 20–30 texts of 800–1,500 words on health, farming, school, civics, the economy, the internet; candidate open sources to *measure before acquiring* (as PLAN.md 5.3 item 7 says): further Global Voices en Español articles (CC BY 3.0), Wikinoticias and Vikidia/Wikipedia simple articles (CC BY-SA, Latin American topics), US federal Spanish-language health and civics materials (public domain, neutral Latin-American register — to be verified per item), higher GDL levels (CC BY 4.0).
3. **Contemporary news.** One excerpt of 214 words. Needed: 10–15 articles (500–900 words) with date, place, quotation and numbers; the same open sources as above.
4. **Correspondence.** *Pepita Jiménez* (77 %, 1874) is the only real letter-writing and is out of reach. Needed: e-mails, messages, prayer letters, reports, formal letters of request and reply — 10 texts, from the team itself with consent (PLAN.md 5.3 item 3).
5. **Biography and testimony.** One biographical section (Las Casas in Martí ch11) and the Bible. Needed: 10 biographies of modern people (the Wikipedia/Vikidia route, or composite Honduran lives) and 15 first-person testimonies, preferably real mission-team testimonies with consent; no Scripture-only testimony.
6. **Modern narrative.** The nine GDL stories are 100–2,800 words and mostly translated. Needed: 20 short stories by living authors under CC BY(-SA) or written for the course (1,000–2,500 words), voseo and Honduran vocabulary included, so that the last third of the bridge is not only Unamuno.
7. **Modern-Spanish Scripture.** The library has Reina-Valera 1909 only (*vosotros, os, mas, vuestro*). The receptive forms are a dozen words in the target list, but the Bible the learner will hear in church is a modern translation that cannot be bundled; a licensed edition (or the course's own retellings, as units 25, 45, 59 of the ladder already are) is the only way to practise that register.

**Quantity needed to make the bridge half open-library, half modern.** About 25 new modern texts of 1,000 words (25 k words) would replace the 13 Niebla/Marianela authentic units and keep the same sequence logic (adapted unit teaches, authentic text confirms), with the authentic texts then chosen for the domains the learner needs; the packs of 3.3 would change, not their size.

## 5. Method, reproducibility, open points

- **Measurements.** `analyseDocument` / `Progress` / `placeCandidate` of `src/ladder` (the code `ladder:place` and `ladder:check` run) over all 1,865 texts of the built library (`public/library/es`, library-es@2026-10-04) and over the 69 units; scratch scripts in the session's temporary folder, not in the repository. The official CLI was run by hand on three texts (Niebla ch12 89.3 %, Juan 4 93.0 %, the Global Voices excerpt 73.4 %: identical to the table) and on the whole ladder (`ladder:check -- es`: 0 errors, 5 warnings).
- **Simulation.** As in 3.1; deterministic; reads the cached lemma counts of every library text. To recompute after the a2-2 rewrite or any edit of a unit: (1) re-run the ladder state; (2) recompute coverage of the candidates; (3) re-select packs for the same sequence; the sequence of authentic texts, the domains and the unit count are expected to survive, the packs are not.
- **Re-run.** `ladder.json` and es-a2-2-16…20 were checked by md5 at 20:38 (unchanged), after the rewrites of 20:59 and 21:03 (the whole plan was re-measured: lemma state, packs, table, `ladder:check -- es`, three `ladder:place` runs) and again at the end of the work (last line of this file). If a unit changes later, re-measure.
- **Not measured:** whether any of the unit texts can be written at 90 % with natural Spanish (the ladder drafters padded to the metric and avoided ordinary words, `B2-SIMULATION.md` "What wastes time" 6); comprehension; the dictionary-backed lemma counts of the app (adapter lemmas overcount real words by about 3 % for Spanish, more for artefact-heavy words); spoken Spanish of any kind.
- **The most uncertain assumption** is that adapted units can be written with exactly 3 uses per slot at 2.9 first-met lemmas per 100 words *and* stay natural; the safety margin is the authentic placements' own slack (1–4 points) and the option of units of 1,500 words (about +3 % cost per lemma).

---
*Final md5 check of es-a2-2-16…20 and ladder.json at 21:16 on 2026-10-05: unchanged since the final measurement began (21:12) (md5 of es-a2-2-20: c888d805).*
