# Hindi b1-bridge and recycling pass — what was done (2026-10-08)

Written by the Hindi content package for `data/ladder/hi/ladder.json` (contract: `docs/LADDER.md`; models: `data/ladder/es/PLAN-B1.md`). **Everything below is a machine draft; nothing is reviewed by a person, no rights state was set or changed, no unit is published.** Figures are from `npm run ladder:check -- hi` with `adapter-hi@6` (full output of that run: `authoring/ladder-check-2026-10-08.txt`).

## 1. Result in one table

| | before (2026-10-07) | after |
|---|---:|---:|
| units | 101 (a1-1 … a2-2) | 132 (101 + 31 in `b1-bridge`) |
| running words after Stage 0 | 52.0 k | 74.7 k (bridge 20,676 words) |
| gate | 0 errors, 85 warnings | 0 errors, 93 warnings |
| recycling warnings, a1-1 … a2-2 | 33 | **8** (all authentic Global Digital Library books or John 14, see 4) |
| orphans, a1-1 … a2-2 (new lemmas never met again) | 93 of 1,018 (9.1 %) | **62 of 1,046 (5.9 %)** |
| coverage of any a1-1 … a2-2 unit | — | **never lower than before** (132 units compared, 0 lower) |
| new-lemma warnings | 10 | 10 (all in a1-2 / a2 units that were already there; none in the bridge) |
| recycling warnings, whole ladder | 33 | 22 (14 of them in the bridge) |

## 2. The recycling pass on a1-1 … a2-2

Method: for every unit whose new lemmas did not come back three times within the next six units (`ladder:check` rule), `authoring/recalls.txt` appends a short **recall paragraph** (real sentences, a lead sentence first, only words already met or the recalled word itself) to editable controlled units inside the window — N+1, N+3, N+5 where the unit is editable (the 28 in-place Stage 0 drafts and the authentic books cannot be edited). 33 units received a paragraph (1 – 16 sentences). Each paragraph was measured so that its host unit's coverage does not fall: a first meeting of a word (two tokens still below three encounters) was placed only in hosts whose coverage the paragraph does not lower, otherwise a known-word sentence was added. `authoring/recalls-applied.json` remembers what was added, so that editing `recalls.txt` and running `node data/ladder/hi/authoring/build.mjs` replaces a paragraph instead of repeating it. Recycling warnings fell 33 → 8; the 8 left are a2-1-12, a2-2-02, -03, -05, -06, -07, -10, -19 — books whose new lemmas are mostly one-off words, misspellings of the source (मिठाइ, चटाइ, रज़ाइ, कया, किड़, कूना, हमा, साँ, प, रा, धम्म …) or the whole vocabulary of John 14 (33 new lemmas in 747 words).

## 3. The b1-bridge (31 units)

Placed by `ladder:place` logic (the unit enters where the text's curriculum coverage is ≥ 92 %, the gate's authentic floor), authentic texts unmodified (`kind: authentic`, `textId`), new controlled units written to prepare the vocabulary of the book that follows (each prepared lemma used three times in the unit, ≤ 5 new lemmas per 100 words in the following book), controlled units at 89 – 97 % coverage with English rescue per sentence. 16 authentic texts (13,286 words: 13 GDL books of 133 – 2,112 words, John 15 / 17 and 1 John 4 = 1,864 words, **9.0 % Scripture** of the stage, limit 15 %), 14 controlled units and one adapted unit (7,390 words; 370 – 621 words each). All controlled units are in the ladder's characters (Sam, Aman, Seeta Nani, Ravi sir, Meera didi, Pastor Anil, Chacha ji, Reema aunty …) and in ordinary modern Hindi; domains: work, nature, animals, church, daily life, contemporary nonfiction (a notice), school, correspondence (a letter), family, travel, explanation, narrative, instructions (a recipe), biography (a diary).

| unit | kind | what | words | cov3 % | new /100 |
|---|---|---|---:|---:|---:|
| hi-b1-01 | authentic | GDL "मुझे वो वाला चाहिये!" (gdl-98) | 315 | 94.6 | 3.8 |
| hi-b1-02 | controlled | चाचा जी की लकड़ी की दुकान (prepares gdl-121) | 588 | 92.3 | 1.4 |
| hi-b1-03 | authentic | GDL "सोना सयानी" (gdl-121) | 133 | 100.0 | 0.0 |
| hi-b1-04 | controlled | नानी के आँगन का अमरूद (prepares gdl-62) | 621 | 90.7 | 1.6 |
| hi-b1-05 | authentic | GDL "गौरैया और अमरूद" (gdl-62) | 443 | 96.6 | 2.9 |
| hi-b1-06 | controlled | शर्मा अंकल का तोता (prepares gdl-108) | 544 | 90.8 | 2.2 |
| hi-b1-07 | authentic | GDL "रीति और मिठु" (gdl-108) | 1326 | 95.3 | 4.1 |
| hi-b1-08 | controlled | छत की बेल पर बाइबल की कक्षा (prepares John 15) | 521 | 91.4 | 2.3 |
| hi-b1-09 | authentic | IRV John 15 (Scripture) | 639 | 96.7 | 1.9 |
| hi-b1-10 | authentic | GDL "चुलबुल की पूँछ" (gdl-69) | 782 | 94.6 | 4.0 |
| hi-b1-11 | controlled | सफ़ाई का दिन (prepares gdl-84 and gdl-70) | 595 | 91.1 | 3.0 |
| hi-b1-12 | authentic | GDL "नानी की ऐनक" (gdl-84) | 327 | 93.3 | 4.6 |
| hi-b1-13 | authentic | GDL "चूहा सिकंदर, घर के अंदर" (gdl-70) | 307 | 94.1 | 4.9 |
| hi-b1-14 | authentic | IRV 1 John 4 (Scripture) | 571 | 95.1 | 3.1 |
| hi-b1-15 | controlled | गली की सफ़ाई (prepares gdl-24; a notice) | 434 | 90.8 | 2.3 |
| hi-b1-16 | authentic | GDL "कचरे का बादल" (gdl-24) | 845 | 93.4 | 4.5 |
| hi-b1-17 | controlled | कहानी का घंटा (prepares gdl-36) | 385 | 90.4 | 2.9 |
| hi-b1-18 | authentic | GDL "कहानियों का शहर" (gdl-36) | 1209 | 93.7 | 4.8 |
| hi-b1-19 | controlled | स्कूल का वार्षिकोत्सव (prepares gdl-77; a letter) | 420 | 90.5 | 3.8 |
| hi-b1-20 | authentic | GDL "थोड़ी सी मदद" (gdl-77) | 2112 | 93.0 | 4.5 |
| hi-b1-21 | controlled | गीता मौसी की बिटिया (prepares gdl-74) | 530 | 91.7 | 2.1 |
| hi-b1-22 | authentic | GDL "जुई मौसी की बेटी" (gdl-74) | 825 | 93.1 | 4.8 |
| hi-b1-23 | controlled | छत पर रात की प्रार्थना (prepares John 17 and gdl-80) | 408 | 91.4 | 2.9 |
| hi-b1-24 | authentic | IRV John 17 (Scripture) | 654 | 97.7 | 1.2 |
| hi-b1-25 | controlled | पहाड़ पर एक रात (prepares gdl-94) | 572 | 92.1 | 2.1 |
| hi-b1-26 | authentic | GDL "भबलू भालू की सैर" (gdl-94) | 1808 | 92.5 | 4.3 |
| hi-b1-27 | controlled | रवि सर का प्रयोग (prepares gdl-80) | 464 | 89.4 | 2.6 |
| hi-b1-28 | authentic | GDL "दीदी, दीदी, आकाश का रंग नीला क्यों है?" (gdl-80) | 990 | 94.7 | 3.0 |
| hi-b1-29 | **adapted** | अंधेर नगरी (कहानी की तरह): a retelling of Bharatendu's play | 416 | 90.4 | 3.6 |
| hi-b1-30 | controlled | बेसन के लड्डू (an instruction text) | 370 | 94.9 | 1.9 |
| hi-b1-31 | controlled | सैम की डायरी (brings back the bridge's words) | 522 | 97.3 | 0.8 |

Rights. The IRV chapters are CC BY-SA 4.0 (placed as they are); the 13 GDL books are CC BY 4.0 (placed as they are). The one adapted unit retells **Andher Nagari** (public domain in India and the United States, `canModify: true` in `data/sources/course-library/hi.json`); its `source` block carries the Wikisource CC BY-SA 4.0 attribution and the share-alike term, as the Thai Aesop units do. **Premchand's two stories (`canModify: false`) are not adapted and not placed**: after the whole bridge the best of them, *Panch parameshwar*, is at 69.7 % known (738 new lemmas) and *Namak ka daroga* at 67.7 % (705); Andher Nagari itself, after its retelling and with the two disciples' names in the word list, is at 67.9 % (598 new lemmas). They need roughly 400 – 500 further lemmas, i.e. a second bridge. Nothing in the library was marked verified or reviewed.

## 4. What is left, honestly

* **Authentic books carry the warnings.** 13 of the 16 authentic bridge units have a recycling warning and a high share of orphans (428 of 515 new lemmas; the controlled units: 7 of 147). The reason is the books: a GDL book of 800 – 2,000 words has 30 – 90 words that it uses once (onomatopoeia, rare nouns, spelling variants such as छिछ्छी, ऊऊऊ, कड़िक). They are exactly the words a reader meets once in the library and does not need to learn. The bridge teaches the words that carry the books (every prepared lemma returns three or more times) and recalls the commonest of the one-off words in the controlled units after a book; it does not try to recycle the long tail.
* New-lemma rate: every authentic bridge unit is ≤ 4.9 per 100 words after its preparing unit (gdl-70: 4.9, gdl-36 and gdl-74: 4.8), none above the gate's 5.
* Controlled bridge units with a recycling warning: hi-b1-11 only (its seven one-word additions for the two stories that follow — स्वेटर, बुनना, ऊन, दरी, टहलना, अक्सर, पाँव — were meant to keep gdl-84 and gdl-70 under 5 new lemmas per 100; they are met once more in those stories and no more).
* Coverage of the authentic units at their place: 92.5 – 100 % (floor 92 %); of the controlled and adapted units: 89.4 – 97.3 % (floor 88 %).
* `adapter-hi@6`: the test files `test/adapters/hindi-wiring.test.ts` (lines 23 – 25) and `test/adapters/hindi-gaps.test.ts` (line 197) still assert version `5`; they were outside this package's paths and need `6`.

## 5. Files

* `authoring/build.mjs` — builds `units/hi-b1-*.json` from `authoring/units/*.txt`, applies `authoring/recalls.txt`, writes the `b1-bridge` entries of `ladder.json` from `authoring/bridge.json`. Run `node data/ladder/hi/authoring/build.mjs` after any edit of those sources.
* `authoring/units/hi-b1-NN.txt` — the 15 controlled/adapted bridge units as sentence pairs; `authoring/recalls.txt` + `recalls-applied.json` — the recycling paragraphs; `authoring/bridge.json` — the bridge order.
* Lexicon additions (`src/adapters/hindi/lexicon-ladder-fixes.ts`, version 5 → 6): see the header comment of that file.
