# Thai ladder — vocabulary and unit plan (a1-1 … a2-2, with the b1-bridge brief)

Planning document for `data/ladder/th/ladder.json` (contract: `docs/LADDER.md`), written 2026-10-06 by the Thai ladder planner. Writers draft the texts from it later; **nothing here is reviewed by a person** (every Thai sentence, every cultural choice and every word marked "needs a compound entry" needs the Thai session and a native Thai reviewer). Figures marked *(measured)* were produced on 2026-10-06 with the real Thai adapter (`adapter-th@3`, `createAdapterRegistry`) on the working tree, read the way the gate reads a unit: the adapter tokenises each sentence, the first candidate's lemma stands for the word (the ICU token when the hand lexicon has no entry), PROPN and numerals count as known. Figures marked *(modelled)* assume that every unit does what this plan tells it to do: each new lemma is used **exactly three times** in the unit that introduces it, nothing outside the lists is used, every Stage 0 top-up token is placed. The planning scripts were scratch files and are not in the repository; the plan below is the data. **Another session was changing the adapter (segmentation of the Bible's name chunks, lexicon entries) while this was measured: Scripture figures, and anything about names, may shift a little; re-run `npm run ladder:place -- --lang th <textId>` for every authentic unit before it is committed.**

## 0. Summary and the findings that shape the plan

| | a1-1 | a1-2 | a2-1 | a2-2 | total |
|---|---:|---:|---:|---:|---:|
| units | 16 | 16 | 23 | 35 | 90 |
| of which controlled core / volume | 13 + 3 | 13 + 3 | 13 + 5 | 15 + 2 | 54 + 13 |
| adapted fables | 0 | 0 | 2 | 6 | 8 |
| in place (bridge drafts) | 0 | 0 | 3 | 6 | 9 |
| authentic (library) | 0 | 0 | 0 | 6 | 6 |
| running words (adapter tokens) | 5,510 | 7,990 | 13,800 | 19,473 | 46,773 |
| new lemmas in controlled and adapted units | 147 | 198 | 284 | 278 | 907 |
| new lemmas per 100 words (all units) | 2.67 | 2.48 | 2.06 | 1.46 | 1.95 |
| lemmas known at the end of the stage (≥ 3 encounters, Stage 0's 77 included) | 224 | 422 | 709 | 997 | 997 |
| Scripture-domain share of the stage | 0.0 % | 6.5 % | 5.8 % | 7.2 % | 5.8 % |

"Words" are adapter tokens (Thai has no spaces; digits are not word tokens and are never counted). Units are short in tokens: a1-1 260–400, a1-2 400–600, a2-1 540–810 (adapted fables 420–480, in-place drafts about 90–100, authentic fables 150–290), a2-2 740–1,020. **90 entries, 46,773 words, 997 lemmas known at the end of a2-2 (modelled)**; the b1-bridge starts at 997 and ends at about 1173 (section 5).

Findings, in the order they matter:

1. **The coverage rule, not the "5 per 100" ceiling, sets the vocabulary budget.** The gate calls a lemma known only after three earlier encounters, so the first three tokens of every new lemma are "unknown" in the unit that introduces it. A controlled unit's expected coverage is 1 − (3 × new lemmas + top-up tokens) / words. The warning line is now 88 %, which allows about 4 new lemmas per 100 words; the plan budgets cores at 1.0–3.5 per 100 (est. cov. 86.9–97.1 %), volume units at ≤ 2.7, adapted fables at 2.1–3.3 (est. cov. 88.8–91.7 %), and the first two units at 3.3–3.5 (est. cov. 86.9 % and 87.8 %, inside the 85 % band the policy grants them). Each new lemma must be used exactly three times in its unit; fewer leaves it unknown for the next unit.
2. **Stage 0 secures only 41 of its 77 lemmas** (met three times or more in its 16 scenes); 36 more are met once or twice, among them four of the five cast names. The plan spends 45 top-up tokens in units 01–06, 08, 09 and 12 of a1-1 (section 1.4). The cheaper fix is on Stage 0's side: two more scenes (about 100 words) that use these 36 lemmas would free those units of the cost and let 01–02 reach about 92 %.
3. **The bridge drafts cannot be the first units, and are not.** Measured against Stage 0 and each earlier draft, `bridge-thai-bridge-01` is 21.9 % known (54 new lemmas per 100 words) and `-12` is 69.6 %; no draft reaches 88 % in sequence. They are 12-sentence, first-person family narrations of about 95 words with no polite particles, nothing in them belongs to the mission cast, and their vocabulary is A2 (พิพิธภัณฑ์, เปลือกหอย, ปลอดภัย). The plan therefore writes the whole of a1 (32 controlled units, 13,500 words) and six units of a2-1 before the first draft reaches 92 % known, and places 9 of the twelve in place as short readings in a2-1 and a2-2, each at its first free slot at which it is at least 92 % known with at most three never-met lemmas; three wait for the b1-bridge (section 4). None is superseded; all need revision and native review first.
4. **Aesop is not an A2 text.** The 45 fables (9,475 words, a 1956 translation, 1,268 lemmas) are 14.4 % known after Stage 0 alone (≥ 3 encounters; 20.3 % for ≥ 1). With the plan's everyday vocabulary and **110 fable-register lemmas taught through 8 adapted retellings** (ข้าพเจ้า, ท่าน, เจ้า, เอ็ง, แล, มิ, จง, ใคร่, ครั้น, เถิด and พาล are all taught), the mean is 87.7 %, the best fable 96.5 %, and only 5 of 45 clear the authentic warning line (92 %), 10 clear 90 % and 21 clear 88 %. So the plan places only **5 fables in a2-2** as authentic units, **28 in the b1-bridge** (after 8 bridging units that teach 128 more lemmas), and leaves 12 in the library (section 5). The obstacles are the register (ข้าพเจ้า, มิ, เอ็ง, เถิด, ครั้น, ย่อม), rare tools and animals (บ่วง แร้ว ตะครุบ พราน), and ICU splits of rare words.
5. **The gate flatters Scripture by about eight points.** In the Open Thai Common Version every word is marked with U+200B; when ICU would cut a marked chunk into pieces the word list does not know, the adapter reads the chunk as a *proper-name guess*, and a proper noun counts as known. *(Measured: 3,211 of the 15,489 tokens of Mark, 20.7 %, are read as name guesses, and another 502 tokens are names in the hand lexicon and 187 are numerals, so one token in four is "known" without being learned; the most frequent guesses are จง, สาวก, ชาย, ทั้ง, เหล่า, มนุษย์, ผี, บัญญัติ, พา, ฝูงชน, ขนมปัง, มอง, วาง.)* Mark 1 therefore reads 97.9 % known after a2-2 and 89.0 % when the name guesses are not counted. The plan decides on the honest figure (table in section 5.1). The Scripture share per stage is 0 / 6.5 / 5.8 / 7.4 %, under the 10 % the owner asked for (the gate's own line is 40 %).
6. **Everything is counted in ICU tokens.** The lemma of a word the hand lexicon lacks is its ICU token, so a compound counts as its parts (รถ + สอง + แถว, ร้าน + อาหาร, ผู้ + ใหญ่), a loanword may be cut anywhere (ซิม → ซิ + ม in context, โอเค → โอ + เค, แชทกลุ่ม → แช + ทก + ลุ่ม, เอมี่ → เอ + มี่), and the plan's lists are lists of tokens. **907 planned lemmas were tested in five neutral carrier sentences** (a noun after a verb, a noun before a copula phrase, a place after ไป, a clause after ว่า, a noun after คุณ); the only ones that broke in at least two of the five are ศิษยาภิบาล, ๆ (ศิษยาภิบาล gives four junk pieces and needs a compound entry; ๆ is a separate token only when written with a space). Words known to split (ซิม, แชท, โอเค, เหรอ, สะมาเรีย, บัพติศมา, ยอม) were removed from the lists; ฟาริสี, เอมี่, มิชชันนารี and the other split names were never used. Section 7 gives the evidence for each trap.
7. **Names are ordinary words to the gate.** Only the few names in the hand lexicon (ไทย, พระเยซู, พระเจ้า, ยอห์น) are PROPN. แซม, มะลิ, ต้น and บอล are counted as lemmas (2, 2, 3, 2 encounters in Stage 0), and ต้น is also the common noun "tree" and a classifier. The plan keeps the cast to five names that Stage 0 already uses plus kin terms and composed names (ป้า + แดง, ลุง + เล็ก), and asks the Thai session for PROPN entries (section 6); without them each name costs at most three unknown tokens in the unit where it first returns.
8. **Numerals.** หนึ่ง–เก้า, สิบ, ร้อย, พัน, หมื่น, แสน, ล้าน and ศูนย์ are NUM (known). ยี่สิบ, สามสิบ … are single tokens that are not NUM, and สิบเอ็ด is สิบ + เอ็ด: each decade is a lemma. Digits (25, ๒๕) are not word tokens at all: they neither count as words nor teach anything. The plan teaches ยี่สิบ สามสิบ สี่สิบ ห้าสิบ เจ็ดสิบ in a1-2-11, หกสิบ แปดสิบ เก้าสิบ เอ็ด in th-a2-1-15, the night hours (ทุ่ม, ตี, ครึ่ง) in a1-2-05, and tells writers to keep prices and dates in digits and the spoken numbers in words, so that both occur in every unit that has numbers.
9. **Polite particles are a quarter of Stage 0** (ครับ 77, ค่ะ 30, คะ 11 of 455 tokens: 25.9 %) and are known from the first unit. Dialogue units therefore score a few points better than narration of the same difficulty, and the bridge drafts (no particles) score worse. This is not padding to correct; it is why the plan keeps a third of the core units in narration, explanation and correspondence. The consistency rules (section 2.4) fix who says ครับ, ค่ะ, คะ, ผม, ฉัน, ดิฉัน.
10. **Recycling.** 790 content lemmas are tracked; each gets three recycle slots in the next six controlled or adapted units, chosen by theme overlap and load (closed-class words are exempt). Only 12 lemmas, all in the last units, cannot get three slots; the busiest unit carries 9.0 recycle lemmas per 100 words. The adapted fables host only fable-like themes.
11. **Size.** 90 entries and 46,773 words reach the 40–50 k target without padding: 54 core and 13 volume units carry 40,610 words, the adapted fables 3,830, the in-place drafts 833, authentic texts 1,500, and nothing is repeated for length. a1 alone is 13,500 words (13.5 k), a little under the 15–30 k that `docs/LADDER.md` calls indicative; three more a1 volume units (about 1.2 k words, no new vocabulary) would close it.
12. **The b1-bridge is the part that is least specified**, as in Spanish (section 5): the library offers 45 fables, three short poems, a 30 k-word literary prose work and the Bible, and nothing contemporary. The plan therefore needs about fourteen further adapted units in mission-life domains (section 5.4) to reach 30 k words.

## 1. The starting point: what Stage 0 gives

### 1.1 Size and cast

Stage 0 (`data/stage0/th/`, AI-drafted, unreviewed, audio "needed" on every line): 16 scenes (94 lines, 361 running words *(measured)*, mean 3.8 words per line), 12 sound steps, 4 review steps counted by the gate as re-readings of their scenes (455 words in all), exit forms (not exposure). The cast uses the Spanish ids but Thai names:

| id in Stage 0 | name in the text | who | speaks as |
|---|---|---|---|
| sam | แซม | Sam, the learner's stand-in, a newcomer from America | ผม … ครับ; says ครับ also as "yes" |
| ana | มะลิ | Mali, a nurse at the hospital (Stage 0: "ฉันทำงานที่โรงพยาบาล") | ฉัน … ค่ะ (statements), คะ (questions) |
| luis | ต้น | Ton, a teacher, Mali's older brother | ผม … ครับ |
| marta | ป้า / ป้าแดง | Auntie Daeng, 60, sells sweets and has the corner shop where Sam rents a room; goes to church | calls herself ป้า; ค่ะ / คะ |
| nico | บอล | Ball, ten, Ton's son (Mali's nephew); loses things | ผม … ครับ |

The ladder keeps this cast and adds, as needed: Mali's and Ton's mother (แม่) and father (พ่อ), Mali's grandmother (ยาย, in a village near Lamphun), the pastor (ศิษยาภิบาล, called by his title; if he needs a name: สมชาย, which costs three tokens), a songthaew driver (ลุงเล็ก = ลุง + เล็ก), neighbours, a doctor, the team (Thai and foreign members, unnamed or named by plain words). **Keep Bangkok and Chiang Mai apart: the base is Chiang Mai (the shop house, the market, the church, the hospital, the neighbours' temple); Bangkok appears as a trip** (the night bus in a1-2-05, the night train in th-a2-1-13, Mali's nursing college in a2-2, a team conference in b1).

### 1.2 Lemmas

**Met three times or more (41, known to the gate from unit 01):** ครับ (77), ค่ะ (30), ผม (26), ไหม (24), ไป (21), วันนี้ (12), คะ (11), ไม่ (11), ที่ (11), มี (8), อยู่ (8), ชอบ (8), ป้า (8), ชื่อ (7), คุณ (7), กาแฟ (7), ตลาด (7), พรุ่งนี้ (7), ฉัน (6), ดื่ม (6), ชา (6), เป็น (6), ครู (6), ขนม (6), ดี (5), อยาก (5), เหนื่อย (5), สวัสดี (4), สบาย (4), กิน (4), ไม่ใช่ (4), ที่ไหน (4), ต้น (3), อะไร (3), น้ำ (3), บ้าน (3), โรงเรียน (3), อัน (3), ก็ (3), โบสถ์ (3), เพราะ (3).

**Met once or twice (36, need top-up):** มะลิ (2), แซม (2), ขอบคุณ (2), มา (2), ข้าว (2), ใช่ (2), หมอ (2), ไม่มี (2), ขอ (2), บอล (2), เห็น (2), ฝน (2), มาก (2), แต่ (2), หิว (2), บาท (2), เอา (2), ทำงาน (2), โรงพยาบาล (2), ขาย (2), ร้อน (2), ทำไม (2), หนังสือ (2), โต๊ะ (2), เจอ (2), แล้ว (2), สนุก (2), ดู (1), เท่าไร (1), กี่ (1), หนาว (1), นอน (1), ซื้อ (1), สี (1), ขาว (1), แดง (1). *(The names แซม, มะลิ, ต้น and บอล are among them: the adapter reads names as ordinary words.)*

Numerals met: สอง สาม ห้า สิบ (NUM, free; หนึ่ง and สี่ are in the adapter's list and cost nothing). Names: the cast above. The 12 sound steps teach letters, not text for the gate.

### 1.3 Constructions

Stage 0 declares 52 coverage ids (`coverage.json`): pragmatics (greeting, polite particles, thanks), constructions (ชื่อ + name, what is your name, how are you, yes/no questions with ไหม, go and come, answering with the verb, where is, have / do not have, like, hungry, how much, how many, today, tomorrow, because), grammar (ผม and ฉัน, ไม่ before a verb, classifiers). The adapter's `detectPatterns` *(measured)* fires on seven keys only: `final-particle`, `question-word-in-place`, `yes-no-question`, `negation-mai`, `modal-before-verb` (อยาก), `classifier-phrase`, `completed-laeo`.

### 1.4 What Stage 0 does not give, and the top-up

Not met at all: ให้, จะ, ได้, ต้อง, ของ, ใน, บน, กับ, และ, เขา, เรา, any past or progressive marker, any kin term beyond ป้า, any day of the week or month, any number above ห้า and สิบ, any classifier beyond อัน, ว่า, ที่ as a relative marker, นะ, any question word beyond อะไร, ที่ไหน, ทำไม, เท่าไร, กี่. Units 01–05 therefore teach location words, possession, kin terms, the main verbs of the shop and the street; units 06–10 teach prices, time of day, work, motion and the modals.

Top-up: these Stage 0 lemmas are used in the stated unit exactly the stated number of times; each token is counted as unknown by the gate (36 lemmas, 45 tokens). **th-a1-1-01** — ขอบคุณ ใช่ หมอ ทำงาน มาก มะลิ แซม (7); **th-a1-1-02** — โต๊ะ หนังสือ เห็น เจอ ไม่มี แต่ (6); **th-a1-1-03** — ดู×2 แล้ว ขอ บอล (5); **th-a1-1-04** — มา ข้าว ซื้อ×2 หิว เอา (6); **th-a1-1-05** — ฝน ร้อน สนุก ทำไม (4); **th-a1-1-06** — เท่าไร×2 กี่×2 บาท ขาย (6); **th-a1-1-08** — โรงพยาบาล (1); **th-a1-1-09** — สี×2 ขาว×2 แดง×2 (6); **th-a1-1-12** — นอน×2 หนาว×2 (4). Placing them anywhere else, or fewer times, leaves the lemma at two encounters and costs a token in every later unit that uses it.

## 2. Targets per stage

### 2.1 Table

See the table in section 0. *Core* units carry vocabulary and one construction; *volume* units (vol) carry fewer new lemmas than their neighbours (≤ 2.7 per 100 in a1-1, mostly ≤ 2.0 later) to give recycling, vary the domain and hold the drafts; *adapted* units retell a library fable in plain written Thai with the old-style small words; *in place* units are the existing bridge drafts; *authentic* units are library texts placed by `textId`.

### 2.2 Constructions: the sequence and where the adapter can see it

The order holds the owner's rule that the learner meets the simple form first and the written register last: polite and spoken patterns (a1), narrative and explanation (a2-1), the formal and fable register (a2-2), the Scripture forms (b1). The adapter has detectors for all but a few of the Thai constructions this plan teaches; the keys below are the ones the gate will report as "first met".

| order | adapter key (`detectPatterns`) | construction | first met in | note |
|---:|---|---|---|---|
| 1 | final-particle | sentence-final particle (ครับ / ค่ะ / คะ) | Stage 0 | measured on Stage 0: fires |
| 2 | yes-no-question | ไหม / ใช่ไหม questions | Stage 0 | measured on Stage 0: fires |
| 3 | question-word-in-place | question words stay in place (อะไร, ที่ไหน) | Stage 0 | measured on Stage 0: fires |
| 4 | negation-mai | ไม่ + verb / adjective | Stage 0 | measured on Stage 0: fires |
| 5 | classifier-phrase | number + classifier | Stage 0 | measured on Stage 0: fires |
| 6 | completed-laeo | verb + แล้ว | Stage 0 | measured on Stage 0: fires |
| 7 | modal-before-verb | อยาก / ต้อง / ควร + verb | Stage 0 | measured on Stage 0: fires |
| 8 | ability-dai | verb + ได้ / ไม่ได้ (can) | th-a1-1-01 |  |
| 9 | future-ja | จะ + verb | th-a1-1-10 |  |
| 10 | directional-after-verb | verb + ไป / มา / ขึ้น / ลง / เข้า / ออก | th-a1-1-10 |  |
| 11 | benefactive-hai | verb + … + ให้ + person | th-a1-1-08 |  |
| 12 | did-not-mai-dai | ไม่ได้ + verb (did not) | th-a1-1-16 |  |
| 13 | not-at-all-mai-loei | ไม่ … เลย | th-a1-1-16 |  |
| 14 | prohibition-ya | อย่า + verb | th-a1-1-14 |  |
| 15 | complement-wa | verb + ว่า (that …) | th-a1-1-15 |  |
| 16 | relative-thi | noun + ที่ + clause | th-a1-1-15 |  |
| 17 | progressive-kamlang | กำลัง + verb | th-a1-2-01 |  |
| 18 | continuing-yu | verb + อยู่ | th-a1-2-01 |  |
| 19 | not-yet-yang-mai | ยังไม่ + verb | th-a1-2-04 |  |
| 20 | experience-khoey | เคย + verb | th-a1-2-08 |  |
| 21 | nominalizer-khwam | ความ + word | th-a1-2-08 |  |
| 22 | conditional-tha-ko | ถ้า … ก็ … | th-a1-2-09 |  |
| 23 | comparative-kwa | adjective + กว่า | th-a1-2-13 |  |
| 24 | superlative-thisut | adjective + ที่สุด | th-a1-2-13 |  |
| 25 | reduplication-mai-yamok | ๆ | th-a1-2-14 |  |
| 26 | ordinal-thi | ที่ + number (dates, ordinals) | th-a1-2-15 |  |
| 27 | passive-thuk | ถูก + verb | th-a2-1-04 |  |
| 28 | causative-hai | ให้ / ทำให้ + person + verb | th-a2-1-04 |  |
| 29 | classifier-demonstrative | noun + classifier + นี้ / นั้น | th-a2-1-05 |  |
| 30 | nominalizer-kan | การ + verb | th-a2-1-15 |  |
| 31 | cause-result-phro-chung | เพราะ … จึง … | th-a2-2-02 |  |
| 32 | dai-before-verb | ได้ + verb (got to; did) | th-a2-2-02 |  |
| 33 | royal-verb | ทรง + verb (royal / divine register) | Scripture only (b1-bridge) | never taught; a receptive item for Mark / John / Psalms; the detector will report it from the first Bible text |

Not detected: serial verbs (ไปซื้อ, มาหา, พา … ไป), the classifier-counting order noun + number + classifier beyond the key above, the Thai clock (สองโมงเช้า, สองทุ่มครึ่ง), kin-term address (พี่, น้อง, ลุง, ป้า), polite request forms (ขอ … หน่อย, รบกวน), and the fable register (จึง, ครั้น, แล, มิ): the gate's "constructions first met" column will be empty for them; the unit's Focus line is the only record.

### 2.3 Domain mix (running words)

| domain | a1-1 | a1-2 | a2-1 | a2-2 |
|---|---:|---:|---:|---:|
| biography | — | 540 (7 %) | 1,350 (10 %) | 930 (5 %) |
| church-and-mission-life | 380 (7 %) | 540 (7 %) | 710 (5 %) | 880 (5 %) |
| community | 680 (12 %) | — | — | 880 (5 %) |
| contemporary-nonfiction | — | — | 780 (6 %) | 880 (5 %) |
| conversation | 260 (5 %) | 400 (5 %) | 1,440 (10 %) | 1,620 (8 %) |
| correspondence | — | 580 (7 %) | 1,420 (10 %) | 880 (5 %) |
| daily-life | 620 (11 %) | 440 (6 %) | 680 (5 %) | — |
| explanation | — | 970 (12 %) | 560 (4 %) | 880 (5 %) |
| family | 290 (5 %) | — | — | 740 (4 %) |
| food | 630 (11 %) | — | — | — |
| health | 380 (7 %) | 520 (7 %) | 740 (5 %) | 880 (5 %) |
| instructions | — | 540 (7 %) | 810 (6 %) | 790 (4 %) |
| narrative | 750 (14 %) | 1,880 (24 %) | 2,380 (17 %) | 4,397 (23 %) |
| practical-communication | 390 (7 %) | — | 660 (5 %) | 840 (4 %) |
| scripture | — | 520 (7 %) | 800 (6 %) | 1,396 (7 %) |
| testimony | 400 (7 %) | — | — | 1,810 (9 %) |
| travel | 370 (7 %) | 460 (6 %) | 700 (5 %) | 930 (5 %) |
| work | 360 (7 %) | 600 (8 %) | 770 (6 %) | 740 (4 %) |

"Scripture" means a retelling (th-a1-2-10, th-a2-1-16, th-a2-2-17: written for the course, not quoted) or an authentic OTCV chapter (th-a2-2-35: 1 John 4). Church and mission life, testimony and prayer vocabulary are separate domains and are **not** counted as Scripture. A temple fair, Songkran, the neighbours' temple, merit-making and the monks on the soi are narrative, explanation or community material: they appear respectfully as part of the neighbours' life and are never taught as doctrine (see section 8).

### 2.4 What every unit must obey

1. **Budget.** Introduce exactly the new lemmas listed, each exactly three times in the unit; use no lemma outside Stage 0, the earlier units' lists, the unit's own list, the Stage 0 top-up and seed lists given in its block, the cast names, numerals and digits. A "lemma" is an ICU token as the adapter reads it: write the word, run `npm run ladder:check -- th`, and look at what the tokens are before assuming that a compound is one lemma. A word that the adapter cannot find in the lists counts as unknown. Do not put spaces inside words; spaces between clauses are fine.
2. **Recycle.** Use every lemma on the unit's recycle list at least once (×2, ×3 mean the plan asked for that many uses; any of the three slots may be used in any order, or all in one place). Closed-class words (particles, pronouns, prepositions, conjunctions, auxiliaries) are exempt.
3. **Variety and register.** Standard Central Thai. Dialogue is everyday spoken-standard Thai of the educated urban middle class in Chiang Mai: no northern dialect (คำเมือง) in the lists, none in the units (a native reviewer may add a flagged note). Narration in a1 and a2-1 is plain written-spoken Thai; a2-2 adds the written register of letters, reports and news; **the old fable register (เจ้า, เอ็ง, ข้า, แล, มิ, จง, ครั้น, ใคร่, เถิด) appears only in the adapted fables and the authentic texts, never in the cast's dialogue**. ท่าน and ข้าพเจ้า appear in the retelling of Luke 15 (th-a2-1-16), where a son speaks to his father, and in the fable units.
4. **Polite particles and pronouns (one rule for every unit).** Men and boys: ผม … ครับ (statement and question: ไหมครับ, อะไรครับ). Women and girls: ฉัน … ค่ะ in statements, คะ in questions (ไหมคะ, อะไรคะ), นะคะ for a soft question or request and นะค่ะ for a soft statement; ดิฉัน only in written formal text (the report in a2-2, a letter). Auntie Daeng and the older neighbours call themselves ป้า / ลุง / ยาย to younger people. ครับ and ค่ะ also mean "yes": a speaker answers a question with the verb (ไป, มี) or with ใช่, and adds the particle. Narration, diary, testimony and letters have no particle except inside quoted speech; chat messages may use ครับ, ค่ะ and ครับผม. Address: คุณ to peers and strangers, พี่ to someone a little older, น้อง to someone younger, คุณครู, คุณหมอ, ลุง, ป้า; เธอ (she, or "you" between young women) from a2-1-06; เขา (he, she) and เรา (we) from a1-1-08; มัน for animals and things. The unit document's `speakers` map must give each speaker's gender so that a checker can match particle and pronoun.
5. **Names, numerals, digits.** Cast names as in section 1.1; any other name is built from known words or costs three tokens (listed in the unit's block if used). Write money, dates, times and ages in digits and also use the spoken numbers (ห้าบาท, สิบเอ็ดโมง) at least once per unit that has numbers; ยี่สิบ, สามสิบ … are lemmas and must be on the unit's list before they are used.
6. **Sentences.** Thai has no sentence mark: give the sentences explicitly in the unit document (one entry per reading unit, each with its English line). Mean sentence length in adapter tokens: a1-1 ≤ 6, a1-2 ≤ 8, a2-1 ≤ 11, a2-2 ≤ 14, adapted fables ≤ 12 (the originals run 15–25). Stage 0 averages 3.8. One clause per sentence in a1-1.
7. **Domains and cast.** Follow the unit's domain; keep the cast; texts are for adults on a mission team, except where a child narrates (Ball) and where a Thai neighbour is the speaker. A reading of the neighbours' temple, a festival or a monk is neutral and respectful; no doctrine about Buddhism is stated or implied.
8. **Provenance.** Each controlled or adapted unit is a document under `data/ladder/th/units/` (format v2, the shape of `data/ladder/es/units/es-a1-1-01.json`), corpus id `ladder-th`, `lang: "th"`, `variety: "central-thai"`, `pipeline.state: "machine-draft"`, `generated: true`, review checklist ready, one English line per sentence. The adapted fables derive from a CC BY-SA 4.0 transcription of a public-domain translation: the unit keeps the attribution and the share-alike term; the owner decides whether derivative retellings may be published (section 8). The three Scripture retellings are written for the course; they quote neither the OTCV (CC BY-SA) nor THSV11 (declined by its rights holder, never to be used) and need a Scripture-competent reviewer in addition to the linguistic one.
9. **Check before handing in.** Run the gate on the unit; compare est. cov. and new lemmas with its block; list the unit's tokens and compare them with the allowed lists; use `npm run ladder:place -- --lang th <file>` on the finished unit to see where it would enter. GoListen is deferred to V2 (`docs/THAI_COURSE.md`), so no recording is planned and the `audio-ready` state is not reachable yet; every unit is meant to be recordable in one sitting (≤ 1,100 words).

## 3. The units

### 3.1 Table

"New" excludes the Stage 0 top-up tokens and the seed tokens, which are counted in "est. cov.". "Est. cov." = 1 − (3 × new + top-up and seed tokens) / words *(modelled)*; "(m)" marks a measured coverage of an existing text (drafts, fables, chapters) against this plan's vocabulary at that position. The first two units are in the policy's lower band (warn 85 %, error 78 %).

| id | # | kind | words | domain | title | new | / 100 | est. cov. | main construction |
|---|---:|---|---:|---|---|---:|---:|---:|---|
| th-a1-1-01 | 1 | core | 260 | conversation | Where are you from? | 9 | 3.5 | 86.9 % | มาจาก + place |
| th-a1-1-02 | 2 | core | 270 | daily-life | Sam's room | 9 | 3.3 | 87.8 % | location words บน / ใน / ใต้ |
| th-a1-1-03 | 3 | core | 290 | family | Mali's family photograph | 9 | 3.1 | 89.0 % | noun + number + classifier คน |
| th-a1-1-04 | 4 | core | 300 | food | Breakfast at Auntie Daeng's shop | 9 | 3.0 | 89.0 % | สั่ง / เอา + dish |
| th-a1-1-05 | 5 | vol | 330 | food | Sunday lunch at Auntie's table | 9 | 2.7 | 90.6 % | recycling of 02–04 |
| th-a1-1-06 | 6 | core | 340 | community | At the market | 11 | 3.2 | 88.5 % | ราคา |
| th-a1-1-07 | 7 | core | 350 | daily-life | Ton's school day | 9 | 2.6 | 92.3 % | clock time: number + โมง + เช้า / บ่าย / เย็น |
| th-a1-1-08 | 8 | core | 360 | work | Who works where | 10 | 2.8 | 91.4 % | เป็น + job |
| th-a1-1-09 | 9 | vol | 340 | community | A Sunday morning in the soi | 7 | 2.1 | 92.1 % | recycling of 06–08 |
| th-a1-1-10 | 10 | core | 370 | travel | By songthaew to the Sunday market | 13 | 3.5 | 89.5 % | จะ + verb (future-ja) |
| th-a1-1-11 | 11 | core | 380 | church-and-mission-life | Sunday at the church | 6 | 1.6 | 95.3 % | อยาก / ชอบ + verb |
| th-a1-1-12 | 12 | core | 380 | health | Ball is ill | 10 | 2.6 | 91.1 % | ปวด + body part |
| th-a1-1-13 | 13 | vol | 350 | narrative | The lost school bag | 9 | 2.6 | 92.3 % | recycling |
| th-a1-1-14 | 14 | core | 390 | practical-communication | A message and a notice | 10 | 2.6 | 92.3 % | ห้าม + verb / อย่า + verb (prohibition-ya) |
| th-a1-1-15 | 15 | core | 400 | testimony | Sam's first testimony | 7 | 1.8 | 94.8 % | เชื่อ + ว่า (complement-wa) |
| th-a1-1-16 | 16 | core | 400 | narrative | Sam's first week | 10 | 2.5 | 92.5 % | ไม่ได้ + verb (did-not-mai-dai) |
| th-a1-2-01 | 17 | core | 400 | conversation | "What are you doing?" | 12 | 3.0 | 91.0 % | กำลัง + verb (progressive-kamlang) |
| th-a1-2-02 | 18 | core | 410 | explanation | Hot season, rainy season, cool season | 13 | 3.2 | 90.5 % | ทุก + noun |
| th-a1-2-03 | 19 | vol | 420 | narrative | A rainy Saturday | 9 | 2.1 | 93.6 % | recycling (weather, progressive) |
| th-a1-2-04 | 20 | core | 440 | daily-life | Yesterday after work | 15 | 3.4 | 89.8 % | past time words (เมื่อวาน, หลัง, ก่อน) |
| th-a1-2-05 | 21 | core | 460 | travel | The night bus to Bangkok | 15 | 3.3 | 90.2 % | ออก / ถึง + place |
| th-a1-2-06 | 22 | core | 480 | narrative | Mali's weekend in the village | 17 | 3.5 | 89.4 % | past narration without markers |
| th-a1-2-07 | 23 | vol | 480 | narrative | The temple fair | 8 | 1.7 | 95.0 % | recycling (past narration) |
| th-a1-2-08 | 24 | core | 500 | narrative | Sam's second month | 13 | 2.6 | 92.2 % | ยัง + verb (still) |
| th-a1-2-09 | 25 | core | 520 | health | At the clinic | 15 | 2.9 | 91.3 % | ต้อง + verb |
| th-a1-2-10 | 26 | core | 520 | scripture | The lost sheep (a retelling of Luke 15) | 10 | 1.9 | 94.2 % | หา + noun + จน + clause |
| th-a1-2-11 | 27 | core | 540 | biography | Auntie Daeng's life | 12 | 2.2 | 93.3 % | เกิด / แต่งงาน / ย้าย |
| th-a1-2-12 | 28 | core | 540 | instructions | How to make som tam | 16 | 3.0 | 91.1 % | imperative-like instructions (no subject) |
| th-a1-2-13 | 29 | core | 560 | explanation | Describing people and places | 14 | 2.5 | 92.5 % | adjective + กว่า (comparative-kwa) |
| th-a1-2-14 | 30 | vol | 540 | church-and-mission-life | A service through Ball's eyes | 4 | 0.7 | 97.8 % | recycling |
| th-a1-2-15 | 31 | core | 580 | correspondence | Invitations and the calendar | 14 | 2.4 | 92.8 % | วันที่ + digits + เดือน (ordinal-thi) |
| th-a1-2-16 | 32 | core | 600 | work | Ton looks for a second job | 11 | 1.8 | 94.5 % | เงินเดือน |
| th-a2-1-01 | 33 | core | 540 | biography | When I was a child | 19 | 3.5 | 89.4 % | เมื่อก่อน + habit |
| th-a2-1-02 | 34 | core | 560 | explanation | Our village then and now | 18 | 3.2 | 90.4 % | เมื่อก่อน … ตอนนี้ … |
| th-a2-1-03 | 35 | vol | 560 | narrative | Grandmother's night story | 13 | 2.3 | 93.0 % | recycling |
| th-a2-1-04 | 36 | core | 610 | narrative | The night of the storm | 19 | 3.1 | 90.7 % | เมื่อ … ก็ … |
| th-a2-1-05 | 37 | core | 630 | conversation | Buying clothes at the night bazaar | 19 | 3.0 | 91.0 % | classifier + demonstrative (ตัวนี้, อันนั้น |
| th-a2-1-06 | 38 | core | 660 | practical-communication | Asking, telling, lending | 17 | 2.6 | 92.3 % | ช่วย + verb + ให้หน่อย |
| th-a2-1-07 | 39 | vol | 630 | correspondence | The team's group chat | 8 | 1.3 | 96.2 % | recycling |
| th-a2-1-08 | 40 | core | 680 | daily-life | Ball's morning | 17 | 2.5 | 92.4 % | sequences with แล้ว … แล้ว … |
| th-a2-1-09 | 41 | core | 710 | church-and-mission-life | Getting ready for Sunday school | 14 | 2.0 | 93.7 % | จะ + verb |
| th-a2-1-10 | 42 | in place | 96 | narrative | บ้านของเรา | 0 | 0.0 | 95.8 % (m) | recycling; family narrative |
| th-a2-1-11 | 43 | adapted | 450 | narrative | The fox and the lion (a fable retold, 1) | 14 | 3.1 | 90.7 % | written register for narrative: จึง, ครั้น, ก็, แล, ใคร่ |
| th-a2-1-12 | 44 | core | 740 | health | The mobile clinic in a hill village | 13 | 1.8 | 94.6 % | ให้ + person + verb |
| th-a2-1-13 | 45 | vol | 700 | travel | A delayed night train | 9 | 1.3 | 95.7 % | recycling |
| th-a2-1-14 | 46 | core | 770 | work | A day at the school and the orchard | 15 | 1.9 | 94.2 % | ใช้ + noun + verb |
| th-a2-1-15 | 47 | core | 780 | contemporary-nonfiction | Thailand in facts | 19 | 2.4 | 92.7 % | การ + verb (nominalizer-kan) |
| th-a2-1-16 | 48 | core | 800 | scripture | The son who left home (a retelling of Luke 15) | 11 | 1.4 | 95.9 % | long past narration |
| th-a2-1-17 | 49 | adapted | 480 | narrative | The frog, the mouse and the hawk (a fable retold, 2) | 14 | 2.9 | 90.8 % | written register: เจ้า, เอ็ง, ข้า in speech |
| th-a2-1-18 | 50 | vol | 790 | correspondence | A letter home | 14 | 1.8 | 94.3 % | recycling |
| th-a2-1-19 | 51 | in place | 90 | narrative | ไปโรงเรียน | 0 | 0.0 | 92.2 % (m) | recycling; family narrative |
| th-a2-1-20 | 52 | core | 810 | biography | A missionary couple | 11 | 1.4 | 95.9 % | past narration with ได้ |
| th-a2-1-21 | 53 | core | 810 | instructions | How it is done | 13 | 1.6 | 95.1 % | ต้อง + verb |
| th-a2-1-22 | 54 | vol | 810 | conversation | Renting a room | 7 | 0.9 | 97.3 % | recycling |
| th-a2-1-23 | 55 | in place | 94 | narrative | ร้านหนังสือเล็กๆ | 0 | 0.0 | 94.7 % (m) | recycling; family narrative |
| th-a2-2-01 | 56 | core | 740 | conversation | "Have you eaten yet?" | 16 | 2.2 | 93.5 % | …หรือยัง / ยังไม่ + verb (not-yet-yang-mai) |
| th-a2-2-02 | 57 | core | 790 | testimony | Small-group testimonies | 12 | 1.5 | 95.4 % | ได้ + verb (dai-before-verb) |
| th-a2-2-03 | 58 | adapted | 520 | narrative | The hunter and the deer (a fable retold, 3) | 17 | 3.3 | 90.2 % | written register |
| th-a2-2-04 | 59 | in place | 87 | narrative | ของขวัญวันเกิด | 0 | 0.0 | 98.9 % (m) | recycling; family narrative |
| th-a2-2-05 | 60 | vol | 740 | family | A long phone call home | 8 | 1.1 | 96.5 % | recycling |
| th-a2-2-06 | 61 | core | 790 | instructions | Come, look, listen | 12 | 1.5 | 95.1 % | อย่า + verb (prohibition-ya) |
| th-a2-2-07 | 62 | adapted | 540 | narrative | The fox and the goat in the well (a fable retold, 4) | 15 | 2.8 | 91.7 % | written register |
| th-a2-2-08 | 63 | in place | 98 | narrative | แมวสีขาว | 0 | 0.0 | 94.9 % (m) | recycling; family narrative |
| th-a2-2-09 | 64 | core | 840 | practical-communication | Notices, rules, recipes | 12 | 1.4 | 95.6 % | ห้าม / ต้อง / ควร |
| th-a2-2-10 | 65 | core | 880 | community | The neighbourhood meeting | 18 | 2.0 | 93.5 % | reported speech with ว่า (complement-wa) |
| th-a2-2-11 | 66 | adapted | 480 | narrative | The banyan and the reed (a fable retold, 5) | 14 | 2.9 | 91.3 % | written register |
| th-a2-2-12 | 67 | in place | 89 | narrative | ข้าวเช้าวันนี้ | 0 | 0.0 | 95.5 % (m) | recycling; family narrative |
| th-a2-2-13 | 68 | core | 880 | church-and-mission-life | Planning the next visit | 10 | 1.1 | 96.5 % | อยาก / หวังว่า + clause |
| th-a2-2-14 | 69 | core | 880 | health | Dengue season | 10 | 1.1 | 96.4 % | ถ้า … ก็ …  |
| th-a2-2-15 | 70 | adapted | 520 | narrative | The monkey and the fisherman (a fable retold, 6) | 16 | 3.1 | 90.8 % | written register |
| th-a2-2-16 | 71 | in place | 101 | narrative | รถไฟไปเมือง | 3 | 3.0 | 95.0 % (m) | recycling; family narrative |
| th-a2-2-17 | 72 | core | 840 | scripture | The good neighbour (a retelling of Luke 10) | 8 | 1.0 | 96.5 % | long past narration |
| th-a2-2-18 | 73 | core | 930 | travel | Diary of the mission trip | 11 | 1.2 | 95.4 % | past narration |
| th-a2-2-19 | 74 | adapted | 420 | narrative | The eagle and the fox (a fable retold, 7) | 9 | 2.1 | 91.0 % | written register |
| th-a2-2-20 | 75 | in place | 85 | narrative | ช่วยกันทำอาหาร | 0 | 0.0 | 97.6 % (m) | recycling; family narrative |
| th-a2-2-21 | 76 | authentic | 150 | narrative | คนเลี้ยงแพะกับลูกเสือ | 0 | 0.0 | 93.3 % (m) | authentic text |
| th-a2-2-22 | 77 | core | 880 | explanation | Opinions and comparisons | 14 | 1.6 | 93.8 % | กว่า / ที่สุด / เท่ากับ |
| th-a2-2-23 | 78 | authentic | 211 | narrative | ลา หมาจิ้งจอก กับราชสีห์ | 0 | 0.0 | 92.4 % (m) | authentic text |
| th-a2-2-24 | 79 | core | 880 | contemporary-nonfiction | The rainy season and the farmers | 11 | 1.3 | 94.0 % | although (แม้ … แต่) |
| th-a2-2-25 | 80 | authentic | 289 | narrative | คนเลี้ยงวัวกับวัวหาย | 0 | 0.0 | 92.4 % (m) | authentic text |
| th-a2-2-26 | 81 | adapted | 420 | narrative | The wolf and the lamb (a fable retold, 8) | 11 | 2.6 | 88.8 % | written register |
| th-a2-2-27 | 82 | in place | 93 | narrative | ฝนตกที่บ้าน | 0 | 0.0 | 96.8 % (m) | recycling; family narrative |
| th-a2-2-28 | 83 | authentic | 114 | narrative | หมากับเงา | 0 | 0.0 | 96.5 % (m) | authentic text |
| th-a2-2-29 | 84 | vol | 740 | work | Interview with a nurse | 8 | 1.1 | 95.5 % | recycling |
| th-a2-2-30 | 85 | authentic | 180 | narrative | ลูกปูกับแม่ปู | 0 | 0.0 | 92.2 % (m) | authentic text |
| th-a2-2-31 | 86 | core | 930 | biography | A nurse's life | 9 | 1.0 | 97.1 % | all past narration |
| th-a2-2-32 | 87 | core | 880 | conversation | A loan, politely | 12 | 1.4 | 95.3 % | polite register (ขอ, รบกวน, เกรงใจ) |
| th-a2-2-33 | 88 | core | 880 | correspondence | The weekly report | 12 | 1.4 | 93.8 % | formal register |
| th-a2-2-34 | 89 | core | 1020 | testimony | Why I came to Thailand | 13 | 1.3 | 95.9 % | all constructions |
| th-a2-2-35 | 90 | authentic | 556 | scripture | 1 ยอห์น 4 | 3 | 0.5 | 98.6 % (m) | authentic text |

### 3.2 Unit by unit

Format: situation; cast; **new** lemmas (tokens; `(←word)` marks a token of a compound written as one word); Stage 0 **top-up**; **seeds** (lemmas of a later authentic text, used once each so that the text introduces no never-met lemma: they cost one unknown token each); **recycle**; focus (constructions, with the adapter key where there is one); notes. Authentic and in-place entries give the text, the reason for the position and the words still unknown.

#### th-a1-1-01 · #1 · core · conversation · 260 words · est. cov. 86.9 % · Where are you from?
- **Situation.** On the step of Auntie Daeng's shop house Sam meets Mali and Ton again: where are you from, do you speak Thai, a little; Mali says she works at the hospital.
- **Cast.** Sam, Mali, Ton
- **New (9).** อเมริกา เชียงใหม่ ภาษา พูด จาก ได้ เรียน นิด(←นิดหน่อย) หน่อย(←นิดหน่อย)
- **Stage 0 top-up (7 tokens).** ขอบคุณ ใช่ หมอ ทำงาน มาก มะลิ แซม
- **Recycle (0).** nothing (first unit)
- **Focus.** มาจาก + place; พูด…ได้ (ability-dai); นิดหน่อย; ผม / ฉัน by speaker

#### th-a1-1-02 · #2 · core · daily-life · 270 words · est. cov. 87.8 % · Sam's room
- **Situation.** Ton shows Sam his rented room above the shop: a bed, a chair, a window, the door; where things are (on, in, under); whose book is this.
- **Cast.** Sam, Ton, Auntie Daeng
- **New (9).** ห้อง เตียง เก้าอี้ ประตู หน้าต่าง บน ใน ใต้ ของ
- **Stage 0 top-up (6 tokens).** โต๊ะ หนังสือ เห็น เจอ ไม่มี แต่
- **Recycle (4).** อเมริกา ภาษา เรียน หน่อย
- **Focus.** location words บน / ใน / ใต้; ของ + owner; มี / ไม่มี

#### th-a1-1-03 · #3 · core · family · 290 words · est. cov. 89.0 % · Mali's family photograph
- **Situation.** Mali shows Sam a photograph: her father and mother, her older brother Ton with his son Ball (her nephew), her little sister; who is who, how old, how many people in the family.
- **Cast.** Mali, Sam, Ball
- **New (9).** ครอบครัว พ่อ แม่ พี่ น้อง ลูก รูป คน ปี
- **Stage 0 top-up (5 tokens).** ดู×2 แล้ว ขอ บอล
- **Recycle (6).** อเมริกา เชียงใหม่ เรียน หน่อย เตียง หน้าต่าง
- **Focus.** noun + number + classifier คน; age: อายุ + number + ปี; พี่ / น้อง

#### th-a1-1-04 · #4 · core · food · 300 words · est. cov. 89.0 % · Breakfast at Auntie Daeng's shop
- **Situation.** Breakfast at the corner shop: what there is, what to order (fried rice with pork, a fried egg), spicy or not spicy, delicious.
- **Cast.** Sam, Auntie Daeng, Ton
- **New (9).** ไข่ หมู ไก่ ผัด จาน ร้าน สั่ง อร่อย เผ็ด
- **Stage 0 top-up (6 tokens).** มา ข้าว ซื้อ×2 หิว เอา
- **Recycle (7).** เชียงใหม่ พูด นิด หน่อย เก้าอี้ หน้าต่าง รูป
- **Focus.** สั่ง / เอา + dish; ไม่เผ็ด; adjective after the noun (อร่อย, เผ็ด)

#### th-a1-1-05 · #5 · vol · food · 330 words · est. cov. 90.6 % · Sunday lunch at Auntie's table
- **Situation.** After church everyone eats lunch at Auntie Daeng's table: fish, vegetables, soup; who eats what, full, one more bowl.
- **Cast.** Auntie Daeng, Sam, Mali, Ton, Ball
- **New (9).** ผัก ปลา ชาม ช้อน อิ่ม กัน นี้ นั้น และ
- **Stage 0 top-up (4 tokens).** ฝน ร้อน สนุก ทำไม
- **Recycle (16).** ภาษา พูด นิด ห้อง เก้าอี้ ลูก ปี ไข่ หมู ไก่ ผัด จาน ร้าน สั่ง อร่อย เผ็ด
- **Focus.** recycling of 02–04; กัน; ทำไม … เพราะ …

#### th-a1-1-06 · #6 · core · community · 340 words · est. cov. 88.5 % · At the market
- **Situation.** Sam buys fruit with Auntie Daeng: mangoes, bananas, oranges; how much a kilo, too dear, a little cheaper, the change. Prices are written in digits.
- **Cast.** Sam, Auntie Daeng, a fruit seller
- **New (11).** ราคา เงิน แพง ถูก ลด ผลไม้ มะม่วง กล้วย ส้ม กับ นะ
- **Stage 0 top-up (6 tokens).** เท่าไร×2 กี่×2 บาท ขาย
- **Recycle (21).** ภาษา พูด นิด ห้อง ประตู รูป คน ไข่ หมู ไก่ ผัด จาน ร้าน สั่ง อร่อย เผ็ด ผัก ปลา ชาม ช้อน อิ่ม
- **Focus.** ราคา; noun + number + classifier; แพง / ถูก; ลด

#### th-a1-1-07 · #7 · core · daily-life · 350 words · est. cov. 92.3 % · Ton's school day
- **Situation.** Ton wakes at six, teaches at eight, goes home at four; what time is it, morning, afternoon, evening.
- **Cast.** Ton, Sam, Mali
- **New (9).** เช้า บ่าย เย็น โมง เวลา ตอน ตื่น กลับ สอน
- **Recycle (14).** อเมริกา เชียงใหม่ เรียน เตียง ประตู ครอบครัว พ่อ แม่ พี่ น้อง ลูก ปี ถูก มะม่วง
- **Focus.** clock time: number + โมง + เช้า / บ่าย / เย็น; ตอน + time; ตื่น / กลับ

#### th-a1-1-08 · #8 · core · work · 360 words · est. cov. 91.4 % · Who works where
- **Situation.** Mali is a nurse at the hospital, Ton teaches pupils, Sam studies Thai; what does your father do; who helps whom.
- **Cast.** Mali, Ton, Sam, Auntie Daeng
- **New (10).** งาน พยาบาล ช่วย ทำ เขา เรา เพื่อน เด็ก นักเรียน ให้
- **Stage 0 top-up (1 tokens).** โรงพยาบาล
- **Recycle (18).** ห้อง เตียง เก้าอี้ ประตู หน้าต่าง ครอบครัว พ่อ แม่ พี่ น้อง ลูก คน ปี กล้วย เช้า เย็น โมง ตอน
- **Focus.** เป็น + job; ทำงานที่ + place; ช่วย + verb + ให้ (benefactive-hai); เขา / เรา

#### th-a1-1-09 · #9 · vol · community · 340 words · est. cov. 92.1 % · A Sunday morning in the soi
- **Situation.** Neighbours meet in the lane on Sunday morning: monks walking, a boy on a bicycle, Sam greets a neighbour; the colours of the flowers.
- **Cast.** Sam, Auntie Daeng, a neighbour, Ball
- **New (7).** ซอย ถนน วัด พระ ยิ้ม ทัก เดิน
- **Stage 0 top-up (6 tokens).** สี×2 ขาว×2 แดง×2
- **Recycle (21).** ครอบครัว พ่อ แม่ พี่ น้อง รูป คน อร่อย ผัก ชาม อิ่ม เงิน ลด ส้ม ตื่น กลับ สอน งาน พยาบาล ช่วย ทำ
- **Focus.** recycling of 06–08; verbs of the street

#### th-a1-1-10 · #10 · core · travel · 370 words · est. cov. 89.5 % · By songthaew to the Sunday market
- **Situation.** Sam and Mali take the red songthaew to the Sunday market: wait, get on, near / far, how long, we must get off here, we will arrive soon.
- **Cast.** Sam, Mali, the driver
- **New (13).** รถ แถว รอ ถึง คัน ขึ้น ลง เข้า ออก ใกล้ ไกล ต้อง จะ
- **Recycle (18).** ไข่ หมู ไก่ ผัด จาน ร้าน สั่ง เผ็ด ปลา ช้อน ราคา แพง ผลไม้ ส้ม บ่าย เย็น เวลา ตอน
- **Focus.** จะ + verb (future-ja); ต้อง + verb (modal-before-verb); ขึ้น / ลง / เข้า / ออก (directional-after-verb)

#### th-a1-1-11 · #11 · core · church-and-mission-life · 380 words · est. cov. 95.3 % · Sunday at the church
- **Situation.** Sunday at the small church: the pastor welcomes Sam, the congregation sings and prays, a friend invites him to eat with the family afterwards.
- **Cast.** Sam, Mali, Ton, the pastor, Auntie Daeng
- **New (6).** อธิษฐาน เพลง ร้อง คริสตจักร ศิษยาภิบาล ด้วย  *(ศิษยาภิบาล needs a compound entry, section 6)*
- **Recycle (25).** ผัก ปลา ชาม ช้อน อิ่ม ราคา เงิน แพง ถูก ลด ผลไม้ มะม่วง กล้วย เช้า บ่าย โมง เวลา ตื่น กลับ สอน เพื่อน เด็ก นักเรียน ยิ้ม เดิน
- **Focus.** อยาก / ชอบ + verb; ด้วยกัน; ขอบคุณพระเจ้า

#### th-a1-1-12 · #12 · core · health · 380 words · est. cov. 91.1 % · Ball is ill
- **Situation.** Ball has a headache, a fever and a cough; Mali the nurse asks where it hurts, tells him to rest and take medicine; Ton takes him home.
- **Cast.** Ball, Mali, Ton
- **New (10).** หัว ท้อง คอ ป่วย ไข้ ปวด เจ็บ ไอ ยา พัก
- **Stage 0 top-up (4 tokens).** นอน×2 หนาว×2
- **Recycle (14).** ราคา เงิน แพง ถูก ลด ผลไม้ มะม่วง กล้วย ส้ม ซอย ถนน วัด พระ ไกล
- **Focus.** ปวด + body part; เป็นไข้; ไม่สบาย; ต้อง + verb

#### th-a1-1-13 · #13 · vol · narrative · 350 words · est. cov. 92.3 % · The lost school bag
- **Situation.** Ball cannot find his school bag; Ton and Auntie Daeng look under the bed, in the kitchen, at the shop; Sam finds it at the church.
- **Cast.** Ball, Ton, Auntie Daeng, Sam
- **New (9).** กระเป๋า หา หาย เปิด ดีใจ ไหน ใคร ผู้หญิง ผู้ชาย
- **Recycle (20).** เช้า บ่าย เย็น โมง เวลา ตอน ตื่น กลับ สอน งาน พยาบาล ช่วย ทำ เพื่อน เด็ก นักเรียน ยิ้ม ทัก เดิน ศิษยาภิบาล
- **Focus.** recycling; หา / หาย / เจอ; question words

#### th-a1-1-14 · #14 · core · practical-communication · 390 words · est. cov. 92.3 % · A message and a notice
- **Situation.** A message from the team on the phone (meeting on Saturday at three at the church) and a notice on the shop door (closed on Monday, no parking).
- **Cast.** Sam, Mali, Auntie Daeng
- **New (10).** ข้อความ โทรศัพท์ ส่ง อ่าน เขียน ห้าม ปิด อย่า วัน เดือน
- **Recycle (22).** งาน พยาบาล ช่วย ทำ เพื่อน เด็ก นักเรียน ซอย ถนน วัด พระ ทัก รถ แถว รอ ถึง คัน ใกล้ ไกล พัก ผู้หญิง ผู้ชาย
- **Focus.** ห้าม + verb / อย่า + verb (prohibition-ya); dates and times in digits; ส่ง / อ่าน / เขียน

#### th-a1-1-15 · #15 · core · testimony · 400 words · est. cov. 94.8 % · Sam's first testimony
- **Situation.** Sam tells in a few plain sentences who he is, why he came to Chiang Mai, what he believes; a Thai friend tells how she came to church.
- **Cast.** Sam, Mali
- **New (7).** เชื่อ รัก ชีวิต ใจ สุข ใหม่ ว่า
- **Recycle (22).** ซอย ถนน วัด พระ ยิ้ม ทัก เดิน รถ แถว รอ ถึง คัน ใกล้ อธิษฐาน เพลง ร้อง คริสตจักร ปวด ไอ หา หาย เปิด
- **Focus.** เชื่อ + ว่า (complement-wa); ที่ + clause; first-person narration

#### th-a1-1-16 · #16 · core · narrative · 400 words · est. cov. 92.5 % · Sam's first week
- **Situation.** Sam looks back on his first week: what he ate, whom he met, what he could and could not say, what made him laugh.
- **Cast.** Sam, Mali, Ton, Auntie Daeng, Ball
- **New (10).** เมื่อวาน อาทิตย์ สัปดาห์ เข้าใจ รู้ ได้ยิน หัวเราะ เลย หมด อีก
- **Recycle (27).** รถ แถว รอ ถึง คัน ใกล้ ไกล อธิษฐาน เพลง ร้อง คริสตจักร ศิษยาภิบาล หัว ท้อง คอ ป่วย ไข้ เจ็บ ยา หา หาย เปิด ดีใจ ผู้หญิง ผู้ชาย วัน เดือน
- **Focus.** ไม่ได้ + verb (did-not-mai-dai); ไม่ … เลย (not-at-all-mai-loei); verb + แล้ว; เมื่อวาน; connectives แล้ว … ก็

#### th-a1-2-01 · #17 · core · conversation · 400 words · est. cov. 91.0 % · "What are you doing?"
- **Situation.** A phone call on Saturday afternoon: Sam rings Mali; what are you doing now, are you free, I am cooking, Ball is reading; a bad line, wait a moment.
- **Cast.** Sam, Mali, Ball
- **New (12).** กำลัง ตอนนี้ เดี๋ยว นี่ นั่น โทร เสียง ฟัง ว่าง ยุ่ง อาหาร ล้าง
- **Recycle (18).** อธิษฐาน เพลง ร้อง คริสตจักร ศิษยาภิบาล หัว ท้อง คอ ป่วย ไข้ ปวด เจ็บ ไอ ยา พัก อ่าน ห้าม ใหม่
- **Focus.** กำลัง + verb (progressive-kamlang); verb + อยู่ (continuing-yu); ตอนนี้; เดี๋ยว

#### th-a1-2-02 · #18 · core · explanation · 410 words · est. cov. 90.5 % · Hot season, rainy season, cool season
- **Situation.** The three seasons of Chiang Mai: what the weather is like, what people wear and eat, what farmers do in each; "in the rainy season it often rains".
- **Cast.** narrator; Mali explains to Sam
- **New (13).** ฤดู อากาศ ลม แดด ตก เมฆ ท้องฟ้า เปียก ทุก มัก ทั่ว บาง หลาย
- **Recycle (20).** หัว ท้อง คอ ป่วย ไข้ ปวด เจ็บ ไอ ยา พัก กระเป๋า ดีใจ ข้อความ โทรศัพท์ ส่ง เขียน ปิด ตอนนี้ เดี๋ยว ล้าง
- **Focus.** ทุก + noun; มัก + verb; ฝนตก; adjective + มาก / ที่สุด

#### th-a1-2-03 · #19 · vol · narrative · 420 words · est. cov. 93.6 % · A rainy Saturday
- **Situation.** It rains all Saturday: nobody can go out; Ball is bored, Ton tells a story, Mali brings tea, Sam draws pictures with Ball.
- **Cast.** Ton, Ball, Mali, Sam
- **New (9).** ร่ม นิทาน กระดาษ เล่น เล่า วาด เบื่อ สิ ล่ะ
- **Recycle (22).** กระเป๋า×2 หา หาย เปิด ดีใจ ผู้หญิง ผู้ชาย ข้อความ โทรศัพท์ ส่ง อ่าน เขียน ห้าม ปิด วัน เดือน เชื่อ รัก ชีวิต ใจ สุข หัวเราะ
- **Focus.** recycling (weather, progressive); เล่น / เล่า

#### th-a1-2-04 · #20 · core · daily-life · 440 words · est. cov. 89.8 % · Yesterday after work
- **Situation.** Mali tells what she did yesterday after the hospital: bathed, washed clothes, swept the kitchen, sat and talked with her mother, fell asleep in front of the television.
- **Cast.** Mali (first person), her mother
- **New (15).** หลัง ก่อน คืน อาบ นั่ง คุย หลับ ซัก กวาด เช็ด โทรทัศน์ ผ้า ครัว นาฬิกา ยัง
- **Recycle (26).** ข้อความ โทรศัพท์ ส่ง อ่าน เขียน ห้าม ปิด วัน เดือน เชื่อ รัก ชีวิต ใจ สุข ใหม่ เมื่อวาน อาทิตย์ สัปดาห์ เข้าใจ รู้ ได้ยิน ตอนนี้ เดี๋ยว ร่ม นิทาน กระดาษ
- **Focus.** past time words (เมื่อวาน, หลัง, ก่อน); verb + แล้ว; ยังไม่ (not-yet-yang-mai)

#### th-a1-2-05 · #21 · core · travel · 460 words · est. cov. 90.2 % · The night bus to Bangkok
- **Situation.** Sam and Ton go to Bangkok for the team conference: the bus station, tickets, seats, leaving at 20.30, a ten-hour journey, who sits where, a full bus, the bags.
- **Cast.** Sam, Ton, a ticket seller
- **New (15).** สถานี ตั๋ว ทาง กรุงเทพ ถุง ชั่วโมง นาที เร็ว ช้า เต็ม ผ่าน ใบ ทุ่ม ตี ครึ่ง
- **Recycle (23).** เชื่อ รัก ชีวิต ใจ สุข ใหม่ เมื่อวาน อาทิตย์ สัปดาห์ เข้าใจ รู้ ได้ยิน หัวเราะ โทร เสียง ฟัง ว่าง ยุ่ง อาหาร เล่น เล่า เบื่อ คืน
- **Focus.** ออก / ถึง + place; ใช้เวลา + duration; ชั่วโมง / นาที
- **Already known, free to use.** ที่ นั่ง

#### th-a1-2-06 · #22 · core · narrative · 480 words · est. cov. 89.4 % · Mali's weekend in the village
- **Situation.** Mali spends the weekend at her grandmother's village: the house on stilts, the rice field, a buffalo, the river, the old woman's stories.
- **Cast.** Mali, her grandmother (ยาย), Ball
- **New (17).** หมู่บ้าน ยาย นา ควาย แม่น้ำ ไร่ หญ้า ต้นไม้ ดอกไม้ ภูเขา หมา แมว นก วัว ม้า ตัว เก็บ
- **Recycle (29).** เมื่อวาน อาทิตย์ สัปดาห์ เข้าใจ รู้ ได้ยิน หัวเราะ โทร เสียง ฟัง ว่าง ยุ่ง อาหาร ล้าง ฤดู อากาศ ลม แดด ตก เมฆ ท้องฟ้า เปียก สถานี ตั๋ว ทาง กรุงเทพ ถุง ชั่วโมง นาที
- **Focus.** past narration without markers; ไป / มา + place; จน (until)

#### th-a1-2-07 · #23 · vol · narrative · 480 words · est. cov. 95.0 % · The temple fair
- **Situation.** Sam goes to the evening fair at the neighbours' temple with Ton and Ball: lights, food stalls, music, a game with rings, a present for Ball, a long walk home. (Culture: the neighbours' temple, treated with respect.)
- **Cast.** Sam, Ton, Ball
- **New (8).** ของขวัญ ไฟ ถ่าย เสมอ เที่ยว ทั้ง ทำบุญ ไหว้
- **Recycle (29).** ตอนนี้ เดี๋ยว โทร เสียง ฟัง ว่าง ยุ่ง อาหาร ล้าง ฤดู อากาศ ลม แดด ตก เมฆ ท้องฟ้า เปียก ร่ม นิทาน กระดาษ วาด โทรทัศน์ ผ้า ครัว นาฬิกา นา หญ้า ม้า เก็บ
- **Focus.** recycling (past narration); เมื่อวันเสาร์; ได้ + verb

#### th-a1-2-08 · #24 · core · narrative · 500 words · est. cov. 92.2 % · Sam's second month
- **Situation.** A month in Chiang Mai: what became easy, what is still hard, new words, a wrong tone that made Auntie laugh; the first lonely evening.
- **Cast.** Sam (first person)
- **New (13).** คำ ความ(←ความหมาย) หมาย(←ความหมาย) ผิด จำ ลืม พยายาม เริ่ม จบ เคย ง่าย ยาก บ่อย
- **Recycle (32).** ฤดู อากาศ ลม แดด ตก เมฆ ท้องฟ้า เปียก เล่น เล่า วาด เบื่อ อาบ นั่ง คุย หลับ ซัก กวาด เช็ด เร็ว ช้า เต็ม ผ่าน ตี ครึ่ง ควาย แมว ตัว เก็บ ถ่าย เสมอ เที่ยว
- **Focus.** ยัง + verb (still); เคย + verb (experience-khoey); ความ + word (nominalizer-khwam: ความหมาย); ยากกว่า / ง่ายกว่า

#### th-a1-2-09 · #25 · core · health · 520 words · est. cov. 91.3 % · At the clinic
- **Situation.** At the clinic where Mali works: Auntie Daeng's cough, the doctor asks questions, listens to the chest, gives medicine; how to take it, when to come back.
- **Cast.** Auntie Daeng, Mali, the doctor, Sam (helps translate)
- **New (15).** คลินิก ตรวจ คนไข้ ฉีดยา แพ้ สุขภาพ มือ ตา หู ปาก แนะนำ อธิบาย เตือน ถ้า ครั้ง
- **Recycle (36).** ร่ม นิทาน กระดาษ เล่น เล่า วาด เบื่อ คืน อาบ นั่ง คุย หลับ ซัก กวาด เช็ด โทรทัศน์ ผ้า ครัว นาฬิกา ช้า ผ่าน ใบ ทุ่ม ตี หมู่บ้าน แม่น้ำ นก เก็บ ไฟ ถ่าย เสมอ เที่ยว ลืม พยายาม เริ่ม จบ
- **Focus.** ต้อง + verb; วันละ + number + ครั้ง; ห้าม / อย่า; ถ้า … ก็ … (conditional-tha-ko)

#### th-a1-2-10 · #26 · core · scripture · 520 words · est. cov. 94.2 % · The lost sheep (a retelling of Luke 15)
- **Situation.** A plain retelling for learners: a shepherd with a hundred sheep, one is lost, he looks for it, finds it and calls his friends to be glad.
- **Cast.** a shepherd, his friends
- **New (10).** แกะ ฝูง เลี้ยง หลง เรียก ปล่อย กอด ทิ้ง ยินดี เมื่อ
- **Recycle (39).** คืน อาบ นั่ง คุย หลับ ซัก กวาด เช็ด โทรทัศน์ ผ้า ครัว นาฬิกา สถานี ตั๋ว ทาง กรุงเทพ ถุง นาที เร็ว เต็ม ผ่าน ใบ ทุ่ม ครึ่ง ยาย ไร่ ต้นไม้ ดอกไม้ ภูเขา หมา แมว นก วัว ม้า ตัว บ่อย แนะนำ อธิบาย เตือน
- **Focus.** หา + noun + จน + clause; เมื่อ … ก็ …; direct speech with ว่า
- **Note.** Scripture domain (retelling, not a quotation). Needs a Scripture-competent reviewer.

#### th-a1-2-11 · #27 · core · biography · 540 words · est. cov. 93.3 % · Auntie Daeng's life
- **Situation.** Auntie Daeng tells her life: born in a village near Lamphun, school for four years, married, moved to Chiang Mai, four children, the shop, grandchildren.
- **Cast.** Auntie Daeng (first person), Sam
- **New (12).** เกิด โต แต่งงาน ย้าย ตาย หลาน สามี อายุ ลำพูน เมือง ยี่สิบ สามสิบ
- **Recycle (29).** สถานี ตั๋ว ทาง กรุงเทพ ถุง ชั่วโมง×2 นาที เร็ว ช้า เต็ม ใบ ทุ่ม ตี ครึ่ง หมู่บ้าน ยาย นา ควาย แม่น้ำ ไร่ หญ้า ต้นไม้ ดอกไม้ ภูเขา หมา วัว ของขวัญ ทำบุญ ไหว้
- **Focus.** เกิด / แต่งงาน / ย้าย; ปี + number; ตอนเด็ก; แล้ว … ก็ … sequences

#### th-a1-2-12 · #28 · core · instructions · 540 words · est. cov. 91.1 % · How to make som tam
- **Situation.** Auntie Daeng shows Sam how to make green papaya salad: the ingredients, pounding in the mortar, the taste (sour, salty, sweet, hot); steps in order.
- **Cast.** Auntie Daeng, Sam
- **New (16).** ครก ตำ ใส่ หั่น ชิม หม้อ มะละกอ มะนาว น้ำปลา น้ำตาล พริก ถั่ว เปรี้ยว หวาน เค็ม ขวด
- **Recycle (28).** หมู่บ้าน ยาย นา ควาย แม่น้ำ ไร่ หญ้า ต้นไม้ ดอกไม้ ภูเขา หมา แมว นก วัว ม้า ตัว ของขวัญ ไฟ ทำบุญ ไหว้ คำ หมาย ผิด ง่าย ยาก ตา ปาก สามสิบ
- **Focus.** imperative-like instructions (no subject); ก่อน … แล้วจึง …; ใส่ + noun; first / then / last

#### th-a1-2-13 · #29 · core · explanation · 560 words · est. cov. 92.5 % · Describing people and places
- **Situation.** Sam describes people and places to a friend: a tall teacher, a small clean room, a big old temple; who is taller, which is the most beautiful.
- **Cast.** Sam, a friend on the phone
- **New (14).** สูง เตี้ย ใหญ่ เล็ก สวย สะอาด เก่า ดำ กว่า ที่สุด เหมือน เดียว เขียว เหลือง
- **Recycle (32).** ของขวัญ ไฟ ถ่าย เสมอ เที่ยว ทำบุญ ไหว้ คำ หมาย ผิด จำ ลืม พยายาม เริ่ม จบ ง่าย ยาก บ่อย คลินิก ตรวจ คนไข้ ฉีดยา แพ้ สุขภาพ มือ หู ครั้ง มะละกอ น้ำตาล ถั่ว หวาน ขวด
- **Focus.** adjective + กว่า (comparative-kwa); ที่สุด (superlative-thisut); เหมือน

#### th-a1-2-14 · #30 · vol · church-and-mission-life · 540 words · est. cov. 97.8 % · A service through Ball's eyes
- **Situation.** Ball tells what he saw at church on Sunday: the guitar, the songs, an old man who prayed loudly, the pastor's short talk, the cake afterwards.
- **Cast.** Ball (first person), Sam, the pastor
- **New (4).** กีตาร์ ๆ ยืน ร้องไห้
- **Recycle (37).** คำ หมาย ผิด จำ×2 ลืม พยายาม เริ่ม จบ ง่าย ยาก บ่อย คลินิก ตรวจ คนไข้ ฉีดยา แพ้ สุขภาพ มือ ตา หู ปาก แนะนำ อธิบาย เตือน ครั้ง แกะ ฝูง เลี้ยง หลง เรียก ปล่อย กอด ทิ้ง ยินดี ที่สุด เหมือน เดียว
- **Focus.** recycling; ๆ (reduplication-mai-yamok); เสียง + adjective

#### th-a1-2-15 · #31 · core · correspondence · 580 words · est. cov. 92.8 % · Invitations and the calendar
- **Situation.** Mali's birthday invitation by message and a note on a card; the twelve months, dates, "can you come?", polite replies (yes, no, maybe).
- **Cast.** Mali, Sam, Ton, the team group chat
- **New (14).** มกราคม กุมภาพันธ์ มีนาคม เมษายน พฤษภาคม มิถุนายน กรกฎาคม สิงหาคม กันยายน ตุลาคม พฤศจิกายน ธันวาคม เชิญ ขอโทษ
- **Recycle (32).** คลินิก ตรวจ คนไข้ ฉีดยา แพ้ สุขภาพ มือ ตา หู ปาก แนะนำ อธิบาย เตือน ครั้ง แกะ ฝูง เลี้ยง หลง เรียก ปล่อย กอด ทิ้ง ยินดี ตาย อายุ เมือง ยี่สิบ มะนาว น้ำตาล ถั่ว หวาน ขวด
- **Focus.** วันที่ + digits + เดือน (ordinal-thi); ได้ไหม / มาได้ไหม; เชิญ; ขอโทษ

#### th-a1-2-16 · #32 · core · work · 600 words · est. cov. 94.5 % · Ton looks for a second job
- **Situation.** Ton wants evening work to pay for his mother's medicine: the notice, the interview at a language school, the pay, the hours, what he did before.
- **Cast.** Ton, the school director, Sam
- **New (11).** สมัคร สัมภาษณ์ ผู้(←ผู้อำนวยการ) อำนวย(←ผู้อำนวยการ) การ(←ผู้อำนวยการ) ประสบการณ์ ตำรวจ หัวหน้า นาย ต้องการ จ่าย
- **Recycle (33).** แกะ ฝูง เลี้ยง หลง เรียก ปล่อย กอด ทิ้ง ยินดี เกิด โต แต่งงาน ย้าย ตาย หลาน สามี อายุ ลำพูน เมือง ยี่สิบ สามสิบ ครก ตำ ใส่ หั่น ชิม หม้อ น้ำปลา พริก เปรี้ยว เค็ม เขียว เชิญ
- **Focus.** เงินเดือน; วันละ / เดือนละ; เคย + verb; ถ้า … ก็ …
- **Already known, free to use.** เงิน เดือน

#### th-a2-1-01 · #33 · core · biography · 540 words · est. cov. 89.4 % · When I was a child
- **Situation.** Ton's childhood on his grandparents' farm: animals, catching fish, climbing trees, walking to school, the first bicycle.
- **Cast.** Ton (first person), his grandparents
- **New (19).** ปู่ ย่า ลุง น้า ช้าง งู กบ หนู กระต่าย เต่า ปู สัตว์ จับ ว่าย ปีน กระโดด มอง วิ่ง ทุ่ง
- **Recycle (25).** เกิด×2 โต×2 แต่งงาน×2 ย้าย×2 ตาย หลาน×2 สามี×2 อายุ ลำพูน×2 เมือง ยี่สิบ สามสิบ ครก ตำ ใส่ หั่น ชิม หม้อ มะละกอ มะนาว น้ำปลา พริก เปรี้ยว เค็ม เหลือง
- **Focus.** เมื่อก่อน + habit; เคย + verb; ตอนเด็กๆ; ตัว for animals

#### th-a2-1-02 · #34 · core · explanation · 560 words · est. cov. 90.4 % · Our village then and now
- **Situation.** How a village near Chiang Mai has changed in forty years: electricity, the paved road, the school, the temple, which crops, fewer buffalo and more motorbikes.
- **Cast.** narrator; an old man; Mali
- **New (18).** เปลี่ยน ไฟฟ้า ทัน(←ทันสมัย) สมัย(←ทันสมัย) ข้าวโพด บ่อ โรงงาน ชาย ซึ่ง ส่วน เช่น คือ สิ่ง อย่าง จริง ประโยชน์ โลก พอ
- **Recycle (33).** ครก ตำ ใส่ หั่น ชิม หม้อ มะละกอ มะนาว น้ำปลา น้ำตาล พริก ถั่ว เปรี้ยว หวาน เค็ม ขวด ใหญ่ เล็ก สวย สะอาด เก่า ดำ ที่สุด เหมือน เดียว เขียว เหลือง มีนาคม พฤษภาคม กรกฎาคม กันยายน พฤศจิกายน ปู
- **Focus.** เมื่อก่อน … ตอนนี้ …; ซึ่ง / ส่วน / เช่น; ทั้ง … และ …

#### th-a2-1-03 · #35 · vol · narrative · 560 words · est. cov. 93.0 % · Grandmother's night story
- **Situation.** Mali's grandmother (ยาย) is visiting from the village; Ball asks her for a story: the tiger and the monkey, what the clever monkey said, why the tiger went away.
- **Cast.** Ball, Mali's grandmother (ยาย), a monkey, a tiger
- **New (13).** เสือ ลิง เรื่อง ถ้ำ ป่า จึง มัน หนี หลอก ฉลาด โง่ ซ่อน ไล่
- **Recycle (33).** สูง×3 เตี้ย×3 ใหญ่×2 เล็ก×2 สวย×2 สะอาด×2 เก่า×2 ดำ×2 ที่สุด เหมือน เดียว เขียว เหลือง กีตาร์ ยืน มกราคม กุมภาพันธ์ เมษายน มิถุนายน สิงหาคม ตุลาคม ธันวาคม ขอโทษ ช้าง งู กบ กระต่าย เต่า สัตว์ ข้าวโพด บ่อ โรงงาน ชาย
- **Focus.** recycling; narrative with จึง / ก็; direct speech with ว่า

#### th-a2-1-04 · #36 · core · narrative · 610 words · est. cov. 90.7 % · The night of the storm
- **Situation.** A storm hits the neighbourhood on a hot night: wind, the lights go out, a tree falls on the lane; the neighbours help each other, Sam helps carry Auntie Daeng.
- **Cast.** Sam, Auntie Daeng, Ton, Ball, neighbours
- **New (19).** พายุ ฟ้าแลบ ฟ้าร้อง พัด ดับ(←ไฟดับ) มืด หลังคา กิ่ง หัก ล้ม เสีย(←เสียหาย) กลัว ตกใจ ปลอดภัย ทำให้ เทียน ตะโกน มัด ผืน
- **Recycle (32).** กีตาร์×2 ยืน×2 ร้องไห้×3 มกราคม กุมภาพันธ์ มีนาคม เมษายน พฤษภาคม มิถุนายน กรกฎาคม สิงหาคม กันยายน ตุลาคม พฤศจิกายน ธันวาคม เชิญ ขอโทษ สมัคร สัมภาษณ์ อำนวย ประสบการณ์ ตำรวจ หัวหน้า นาย ต้องการ จ่าย กระโดด วิ่ง จริง โลก หลอก ไล่
- **Focus.** เมื่อ … ก็ …; ถูก + verb (passive-thuk); ทำให้ (causative-hai); verb + ลง / เข้า / ออก
- **Already known, free to use.** ไฟ หาย ถูก

#### th-a2-1-05 · #37 · core · conversation · 630 words · est. cov. 91.0 % · Buying clothes at the night bazaar
- **Situation.** Sam and Mali buy a shirt and trousers at the night bazaar: which colour, which size, try it on, bargaining politely, a discount for two.
- **Cast.** Sam, Mali, a stall holder
- **New (19).** เสื้อ กางเกง รองเท้า หมวก เสื้อผ้า ไซส์ ลอง ต่อ เลือก ทอน หลวม คับ ฟ้า สวม คู่ ชุด แบบ สั้น ยาว
- **Recycle (40).** มกราคม กุมภาพันธ์ มีนาคม เมษายน พฤษภาคม มิถุนายน กรกฎาคม สิงหาคม กันยายน ตุลาคม พฤศจิกายน ธันวาคม เชิญ ขอโทษ สมัคร สัมภาษณ์ อำนวย ประสบการณ์ ตำรวจ หัวหน้า นาย ต้องการ จ่าย ปู่ ย่า ลุง น้า จับ ว่าย ปีน มอง ทุ่ง ถ้ำ ป่า ฉลาด โง่ หลังคา ล้ม ปลอดภัย ตะโกน
- **Focus.** classifier + demonstrative (ตัวนี้, อันนั้น; classifier-demonstrative); verb + ดู; ลอง; ถ้า … ก็ …

#### th-a2-1-06 · #38 · core · practical-communication · 660 words · est. cov. 92.3 % · Asking, telling, lending
- **Situation.** Everyday requests: lend me your bicycle, please tell Ton to call me, could you help carry this; polite refusals; thanks and apologies.
- **Cast.** Sam, Ton, Mali, Auntie Daeng
- **New (17).** ยืม บอก ถาม ตอบ ถือ ฝาก รับ พา นำ ไว้ อย่างไร นึก รบกวน เป็นไร(←ไม่เป็นไร) เธอ แบ่ง จด
- **Recycle (52).** สมัคร สัมภาษณ์ อำนวย ประสบการณ์ ตำรวจ หัวหน้า นาย ต้องการ จ่าย ปู่ ย่า ลุง น้า ช้าง งู กบ กระต่าย เต่า ปู สัตว์ จับ ว่าย ปีน กระโดด มอง วิ่ง ทุ่ง เปลี่ยน ไฟฟ้า ทัน สมัย สิ่ง ประโยชน์ หนี ซ่อน ดับ กิ่ง กลัว ทำให้ มัด เสื้อ กางเกง หมวก เสื้อผ้า ลอง เลือก หลวม คับ สวม คู่ แบบ สั้น
- **Focus.** ช่วย + verb + ให้หน่อย; ขอ + verb; ให้ (benefactive-hai, causative-hai); บอก / ถาม / ตอบ
- **Already known, free to use.** คืน ไม่

#### th-a2-1-07 · #39 · vol · correspondence · 630 words · est. cov. 96.2 % · The team's group chat
- **Situation.** A week in the team chat: who brings what, the prayer request, a late bus, a photograph, thanks, a joke; messages are short.
- **Cast.** Sam, Mali, Ton, the team (chat)
- **New (8).** รูปภาพ หรือ ตลก ขำ ด่วน ข่าว เรียบร้อย ขอบใจ
- **Recycle (52).** ปู่ ย่า ลุง น้า ช้าง งู กบ กระต่าย เต่า ปู สัตว์ จับ ว่าย ปีน กระโดด มอง วิ่ง ทุ่ง เปลี่ยน ไฟฟ้า ทัน สมัย ข้าวโพด บ่อ โรงงาน ชาย สิ่ง จริง ประโยชน์ โลก ลิง พายุ ฟ้าแลบ ฟ้าร้อง พัด มืด หัก ตกใจ ผืน เสื้อ กางเกง รองเท้า หมวก ไซส์ ลอง ทอน หลวม ฟ้า คู่ ชุด แบบ ยาว
- **Focus.** recycling; abbreviations in chat (ครับผม, โอเค); emoji; time and date in digits

#### th-a2-1-08 · #40 · core · daily-life · 680 words · est. cov. 92.4 % · Ball's morning
- **Situation.** A school morning in Ton's house: Ball wakes late, washes, dresses, eats, packs his bag, runs to the bus; what he forgot.
- **Cast.** Ball, Ton, Mali
- **New (17).** แปรง(←แปรงฟัน) ฟัน(←แปรงฟัน) แต่ง(←แต่งตัว) หวี สบู่ ผ้าเช็ดตัว สมุด ปากกา ดินสอ การบ้าน รีบ ผูก เอง ชง ตาก แขวน สะพาย
- **Seeds (1 tokens, one use each, for a later authentic text).** พื้น
- **Recycle (61).** เปลี่ยน ไฟฟ้า ทัน สมัย ข้าวโพด บ่อ โรงงาน ชาย สิ่ง จริง ประโยชน์ โลก เสือ ลิง เรื่อง ถ้ำ ป่า หนี หลอก ฉลาด โง่ ซ่อน ไล่ พายุ ฟ้าแลบ ฟ้าร้อง พัด ดับ มืด หลังคา กิ่ง หัก ล้ม กลัว ตกใจ ปลอดภัย ทำให้ เทียน ตะโกน มัด ผืน รองเท้า เสื้อผ้า ไซส์ เลือก ทอน คับ ฟ้า สวม ชุด สั้น ยาว ถาม ตอบ ถือ ฝาก รับ พา นำ แบ่ง จด
- **Focus.** sequences with แล้ว … แล้ว …; กำลังจะ + verb; reflexive-like verbs (อาบน้ำ, แต่งตัว)
- **Already known, free to use.** ตัว

#### th-a2-1-09 · #41 · core · church-and-mission-life · 710 words · est. cov. 93.7 % · Getting ready for Sunday school
- **Situation.** Saturday evening at church: preparing the room for the children, the lesson, songs, snacks; who teaches, who plays the guitar; how many will come.
- **Cast.** Sam, Mali, the pastor, Auntie Daeng, children
- **New (14).** บท(←บทเรียน) เตรียม จัด วาง แจก นับ ตั้งใจ ซน เล่ม อาจ พร้อม หลับตา ถ้วย กล่อง
- **Seeds (3 tokens, one use each, for a later authentic text).** หน้า ทุกคน สวน
- **Recycle (54).** เสือ×2 ลิง เรื่อง×2 ถ้ำ ป่า หนี หลอก ฉลาด โง่ ซ่อน ไล่ พายุ ฟ้าแลบ ฟ้าร้อง พัด ดับ มืด หลังคา กิ่ง หัก ล้ม กลัว ตกใจ ปลอดภัย ทำให้ เทียน×2 ตะโกน มัด ผืน เสื้อ กางเกง รองเท้า หมวก เสื้อผ้า ไซส์ ลอง เลือก ทอน หลวม คับ ฟ้า สวม คู่ ชุด แบบ สั้น ยาว ถือ ฝาก รับ พา นำ แบ่ง จด
- **Focus.** จะ + verb; ต้อง + verb; อาจจะ; ให้ + person + verb
- **Already known, free to use.** เรียน

#### th-a2-1-10 · #42 · in place · narrative · 96 words · measured cov. 95.8 % · บ้านของเรา
- **Text.** the existing machine draft, referenced in place: `document: "../../corpus/th/bridge-thai-bridge-01.json"` (kind `controlled`). 12 sentences, first-person family narration; not the mission cast.
- **Why here.** First position at which the draft is ≥ 92 % known with at most three never-met lemmas: 95.8 %.
- **Words still off the plan (4).** พื้น หน้า สวน ทุกคน — replace each with a planned word when the draft is revised, or accept it (it is one token in about ninety).

#### th-a2-1-11 · #43 · adapted · narrative · 450 words · est. cov. 90.7 % · The fox and the lion (a fable retold, 1)
- **Situation.** A short fable retold for learners in plain written Thai with the old-style small words: the fox, the lion and what the fox saw; first of the school-reader fables (source suggestion: Aesop 33 / 37).
- **Cast.** a fox, a lion, a wolf
- **New (14).** หมาจิ้งจอก ราชสีห์ เข้าไป หมาป่า สัก ไม่รู้ แกล้ง ใคร่ ตรง กัด พ้น คราว โกรธ หลีก
- **Recycle (0).** none assigned (see section 7, item on recycling)
- **Focus.** written register for narrative: จึง, ครั้น, ก็, แล, ใคร่; no new verbs of motion beyond the list
- **Note.** adapted from the library fable; see section 5

#### th-a2-1-12 · #44 · core · health · 740 words · est. cov. 94.6 % · The mobile clinic in a hill village
- **Situation.** A one-day mobile clinic in a hill village: the long road, setting up under the tree, blood pressure, a child with a fever, an old man with a bad leg, medicine and advice.
- **Cast.** Mali, Sam, a doctor, villagers
- **New (13).** ดัน(←ความดัน) เลือด บาดแผล วัคซีน ทา ขา แขน นิ้ว เท้า ควร ศีรษะ ร่างกาย จมูก
- **Seeds (1 tokens, one use each, for a later authentic text).** ผนัง
- **Recycle (28).** ยืม×3 บอก×3 ถาม×2 ตอบ×2 ถือ ฝาก รับ พา นำ นึก×3 รบกวน×3 เป็นไร×3 แบ่ง จด รูปภาพ ตลก ขำ ด่วน ข่าว เรียบร้อย ขอบใจ รีบ ผูก ชง ตาก แขวน สะพาย หลับตา
- **Focus.** ให้ + person + verb; ควร + verb; ห้าม; passive; reasons with เพราะ
- **Already known, free to use.** ความ วัด

#### th-a2-1-13 · #45 · vol · travel · 700 words · est. cov. 95.7 % · A delayed night train
- **Situation.** The night train to Bangkok is three hours late: waiting on the platform, buying food, a conversation with an old woman, a missed meeting.
- **Cast.** Sam, Ton, an old woman
- **New (9).** ชาน(←ชานชาลา) ชาลา(←ชานชาลา) รถไฟ ตู้ ล่าช้า ระหว่าง นาน พื้น ชั้น
- **Seeds (3 tokens, one use each, for a later authentic text).** เค้ก รู้สึก ใช้
- **Recycle (34).** รูปภาพ×2 ตลก×2 ขำ×2 ด่วน×2 ข่าว×2 เรียบร้อย×2 ขอบใจ×2 แปรง ฟัน แต่ง หวี สบู่ ผ้าเช็ดตัว สมุด ปากกา ดินสอ การบ้าน รีบ ผูก ชง ตาก แขวน สะพาย เตรียม จัด วาง แจก นับ ตั้งใจ ซน เล่ม พร้อม ถ้วย กล่อง
- **Focus.** recycling; ช้า / เร็ว; ตั้งแต่ … จนถึง …; ระหว่าง

#### th-a2-1-14 · #46 · core · work · 770 words · est. cov. 94.2 % · A day at the school and the orchard
- **Situation.** Ton's day: the school office, Sam helps with English, the fruit orchard on the weekend; what each tool is for, what the farm worker says.
- **Cast.** Ton, Sam, a farm worker, a colleague
- **New (15).** เครื่อง ใช้ ปลูก รดน้ำ ขวาน ตัด ไม้ สวน ห้องเรียน กระดาน เพื่อ สำหรับ ถัง อ่าง ทราย
- **Recycle (32).** แปรง×2 ฟัน×2 แต่ง×2 หวี×2 สบู่×2 ผ้าเช็ดตัว×2 สมุด×2 ปากกา×2 ดินสอ×2 การบ้าน×2 รีบ ผูก ชง ตาก แขวน สะพาย บท เตรียม จัด วาง แจก นับ ตั้งใจ ซน เล่ม พร้อม หลับตา ถ้วย กล่อง นาน พื้น ชั้น
- **Focus.** ใช้ + noun + verb; เพื่อ + verb (purpose); ต้อง + verb; ถ้า … ก็ …
- **Already known, free to use.** มือ

#### th-a2-1-15 · #47 · core · contemporary-nonfiction · 780 words · est. cov. 92.7 % · Thailand in facts
- **Situation.** A short factual text: where Thailand is, its regions, rice and rubber, the sea, how many people live in Bangkok and Chiang Mai, the king, the temples.
- **Cast.** narrator
- **New (19).** ประเทศ ภาค เหนือ ตะวัน(←ตะวันออก) กลาง ทะเล เกาะ ศาสนา พุทธ กษัตริย์ ประชากร ยาง เอ็ด ทะเลสาบ กว้าง พิพิธภัณฑ์ แคว้น ธรรมเนียม ประเพณี
- **Recycle (40).** บท×2 เตรียม จัด วาง แจก นับ ตั้งใจ ซน เล่ม พร้อม หลับตา ถ้วย กล่อง เข้าไป หมาป่า แกล้ง ใคร่ ตรง กัด พ้น คราว โกรธ หลีก ดัน เลือด บาดแผล วัคซีน ทา ขา แขน นิ้ว เท้า ศีรษะ ร่างกาย จมูก ชาน ชาลา รถไฟ ตู้ ล่าช้า
- **Focus.** การ + verb (nominalizer-kan); ความ + adjective; ซึ่ง / ที่; numbers in digits
- **Already known, free to use.** ออก ตก การ ความ

#### th-a2-1-16 · #48 · core · scripture · 800 words · est. cov. 95.9 % · The son who left home (a retelling of Luke 15)
- **Situation.** A plain retelling: a father with two sons; the younger asks for his share, leaves, spends everything, feeds pigs, comes home; the father runs to meet him.
- **Cast.** the father, the younger son, the older son
- **New (11).** บิดา บุตร มรดก หมูป่า หิวโหย ต้อนรับ แหวน ท่าน ข้าพเจ้า เถิด ครั้น
- **Recycle (41).** หมาจิ้งจอก ราชสีห์ เข้าไป หมาป่า แกล้ง ใคร่ ตรง กัด พ้น คราว โกรธ หลีก ดัน เลือด บาดแผล วัคซีน ทา ขา แขน นิ้ว เท้า ศีรษะ ร่างกาย จมูก ชาน ชาลา รถไฟ ตู้ ล่าช้า นาน พื้น ชั้น ห้องเรียน กระดาน ถัง อ่าง ทราย กษัตริย์ ยาง ธรรมเนียม ประเพณี
- **Focus.** long past narration; จน / แล้ว / ครั้น; direct speech; ท่าน / ข้าพเจ้า in speech
- **Note.** Scripture domain (retelling). Needs a Scripture-competent reviewer.
- **Already known, free to use.** เสีย

#### th-a2-1-17 · #49 · adapted · narrative · 480 words · est. cov. 90.8 % · The frog, the mouse and the hawk (a fable retold, 2)
- **Situation.** A second school-reader fable, with the small words of the old register: two unlikely friends tied together, a hawk above; a lesson stated in one sentence (source suggestion: Aesop 32).
- **Cast.** a frog, a mouse, a hawk
- **New (14).** เจ้า เอ็ง ต่าง ติด แล หากิน ข้า วันหนึ่ง อื่น เพลิน ตีน ไม่ทัน น่า บิน
- **Seeds (2 tokens, one use each, for a later authentic text).** พวก พบ
- **Recycle (19).** หมาจิ้งจอก×2 ราชสีห์×2 เข้าไป หมาป่า แกล้ง ใคร่ ตรง กัด พ้น คราว โกรธ หลีก บิดา บุตร มรดก หมูป่า หิวโหย ต้อนรับ แหวน
- **Focus.** written register: เจ้า, เอ็ง, ข้า in speech; แล; ไม่ทัน; หากิน
- **Note.** adapted from the library fable; see section 5

#### th-a2-1-18 · #50 · vol · correspondence · 790 words · est. cov. 94.3 % · A letter home
- **Situation.** Sam writes a letter to his home church: first weeks, the food, the people, a prayer request, thanks for the gifts.
- **Cast.** Sam
- **New (14).** จดหมาย เคารพ คิดถึง ห่วง บ้าง ทักทาย สุดท้าย เรือ ลำธาร หิน ริม ดิน คริสเตียน ภารกิจ
- **Seeds (3 tokens, one use each, for a later authentic text).** จันทร์ เลิก เกี่ยว
- **Recycle (51).** ดัน เลือด บาดแผล วัคซีน ทา ขา แขน นิ้ว เท้า ศีรษะ ร่างกาย จมูก ชาน ชาลา รถไฟ ตู้ ล่าช้า นาน พื้น ชั้น รดน้ำ ขวาน ตัด ไม้ สวน ห้องเรียน กระดาน ถัง อ่าง ทราย ประเทศ ภาค ตะวัน กลาง ทะเล เกาะ พุทธ ประชากร เอ็ด ทะเลสาบ กว้าง พิพิธภัณฑ์ แคว้น ติด หากิน วันหนึ่ง เพลิน ตีน ไม่ทัน น่า บิน
- **Focus.** recycling; letter forms (เรียน, ด้วยความเคารพ); polite register

#### th-a2-1-19 · #51 · in place · narrative · 90 words · measured cov. 92.2 % · ไปโรงเรียน
- **Text.** the existing machine draft, referenced in place: `document: "../../corpus/th/bridge-thai-bridge-05.json"` (kind `controlled`). 12 sentences, first-person family narration; not the mission cast.
- **Why here.** First position at which the draft is ≥ 92 % known with at most three never-met lemmas: 92.2 %.
- **Words still off the plan (6).** หน้า2 จันทร์ พวก เกี่ยว เลิก พบ — replace each with a planned word when the draft is revised, or accept it (it is one token in about ninety).

#### th-a2-1-20 · #52 · core · biography · 810 words · est. cov. 95.9 % · A missionary couple
- **Situation.** The life of a Thai pastor and his wife: where they were born, how they met, how they came to faith, the years in the north, children, what they do now.
- **Cast.** pastor and wife (third person), Sam
- **New (11).** พบ ศรัทธา ภรรยา เปลี่ยนแปลง ผู้นำ พวก ทุกคน กำเนิด ยากจน ยุค อาจารย์
- **Recycle (36).** เครื่อง×3 ใช้×3 ปลูก×3 รดน้ำ×2 ขวาน×2 ตัด×2 ไม้×2 สวน×2 ห้องเรียน กระดาน ถัง อ่าง ทราย ประเทศ ภาค ตะวัน กลาง ทะเล เกาะ ศาสนา พุทธ กษัตริย์ ประชากร ยาง เอ็ด ทะเลสาบ กว้าง พิพิธภัณฑ์ แคว้น ธรรมเนียม ประเพณี เรือ ลำธาร หิน ริม ดิน
- **Focus.** past narration with ได้; ต่อมา; หลังจากนั้น; ที่ + clause
- **Already known, free to use.** รับ ใช้ ต่อ มา หลัง จาก นั้น ใน ที่สุด

#### th-a2-1-21 · #53 · core · instructions · 810 words · est. cov. 95.1 % · How it is done
- **Situation.** Practical know-how: getting a phone number and topping up, reporting to immigration, taking the right songthaew, thanking the host when you leave a Thai home.
- **Cast.** Sam, Mali, a shop assistant
- **New (13).** เบอร์ เติม(←เติมเงิน) อนุญาต(←ใบอนุญาต) ธนาคาร บัญชี บัตร หนังสือเดินทาง ยื่น แจ้ง ตาม โดย ธรรมดา สิทธิ
- **Seeds (1 tokens, one use each, for a later authentic text).** แรก
- **Recycle (38).** ประเทศ ภาค ตะวัน กลาง ทะเล เกาะ ศาสนา×2 พุทธ กษัตริย์ ประชากร ยาง เอ็ด ทะเลสาบ กว้าง พิพิธภัณฑ์ แคว้น ธรรมเนียม ประเพณี บิดา บุตร มรดก หมูป่า หิวโหย ต้อนรับ แหวน ติด หากิน วันหนึ่ง เพลิน ตีน ไม่ทัน น่า บิน ห่วง ทักทาย สุดท้าย คริสเตียน ภารกิจ
- **Focus.** ต้อง + verb; ถ้า … ก็ …; ก่อน + verb; ห้าม; เพื่อ
- **Already known, free to use.** เงิน ใบ ต่อ

#### th-a2-1-22 · #54 · vol · conversation · 810 words · est. cov. 97.3 % · Renting a room
- **Situation.** Sam rents a room near the school: asks about the price, the deposit, water and electricity, the rules; the landlady asks questions in return.
- **Cast.** Sam, a landlady, Ton
- **New (7).** เช่า มัดจำ ค่า เจ้าของ ตกลง จุด แผ่น
- **Seeds (1 tokens, one use each, for a later authentic text).** เคาน์เตอร์
- **Recycle (48).** บิดา บุตร มรดก หมูป่า หิวโหย ต้อนรับ แหวน ติด หากิน วันหนึ่ง เพลิน ตีน ไม่ทัน น่า บิน จดหมาย เคารพ คิดถึง ห่วง ทักทาย สุดท้าย เรือ ลำธาร หิน ริม ดิน คริสเตียน ภารกิจ พบ ศรัทธา ภรรยา เปลี่ยนแปลง ผู้นำ กำเนิด ยากจน ยุค อาจารย์ เบอร์ เติม อนุญาต ธนาคาร บัญชี บัตร หนังสือเดินทาง ยื่น แจ้ง ธรรมดา สิทธิ
- **Focus.** recycling; ราคา / มัดจำ; ได้ไหม / ได้; ไม่ … เลย

#### th-a2-1-23 · #55 · in place · narrative · 94 words · measured cov. 94.7 % · ร้านหนังสือเล็กๆ
- **Text.** the existing machine draft, referenced in place: `document: "../../corpus/th/bridge-thai-bridge-10.json"` (kind `controlled`). 12 sentences, first-person family narration; not the mission cast.
- **Why here.** First position at which the draft is ≥ 92 % known with at most three never-met lemmas: 94.7 %.
- **Words still off the plan (4).** เกี่ยว2 เลิก แรก เคาน์เตอร์ — replace each with a planned word when the draft is revised, or accept it (it is one token in about ninety).

#### th-a2-2-01 · #56 · core · conversation · 740 words · est. cov. 93.5 % · "Have you eaten yet?"
- **Situation.** A Thai greeting ritual and a real conversation: have you eaten yet, not yet, let me invite you; Auntie Daeng insists on feeding Sam; he learns to refuse twice and accept once.
- **Cast.** Sam, Auntie Daeng, Mali
- **New (16).** ชวน ทาน มื้อ หรอก ละ เสร็จ เนื้อ ข้าวสาร ขนมปัง เค้ก ทอด หอม สุก อุ่น แก้ว กระทะ
- **Recycle (39).** จดหมาย×2 เคารพ×2 คิดถึง×2 ห่วง ทักทาย สุดท้าย เรือ ลำธาร หิน ริม ดิน คริสเตียน ภารกิจ พบ ศรัทธา ภรรยา เปลี่ยนแปลง ผู้นำ กำเนิด ยากจน ยุค อาจารย์ เบอร์ เติม อนุญาต ธนาคาร บัญชี บัตร หนังสือเดินทาง ยื่น แจ้ง ธรรมดา สิทธิ เช่า มัดจำ ค่า เจ้าของ จุด แผ่น
- **Focus.** …หรือยัง / ยังไม่ + verb (not-yet-yang-mai); ชวน + verb; เลี้ยง; ไม่ … หรอก
- **Already known, free to use.** เลี้ยง ถ้วย

#### th-a2-2-02 · #57 · core · testimony · 790 words · est. cov. 95.4 % · Small-group testimonies
- **Situation.** Four members of the home group tell how they came to faith: a student, a taxi driver, a retired teacher, Sam; what changed, what they still find hard.
- **Cast.** a student, a driver (ลุง), a retired teacher, Sam
- **New (12).** อภัย ทุกข์ พึ่ง ขอบพระคุณ รู้สึก กล้า ทน บาป วิญญาณ พระบุตร อัศจรรย์ ปาฏิหาริย์
- **Recycle (38).** พบ ศรัทธา ภรรยา เปลี่ยนแปลง ผู้นำ กำเนิด ยากจน ยุค อาจารย์ เบอร์ เติม อนุญาต ธนาคาร บัญชี บัตร หนังสือเดินทาง ยื่น แจ้ง ธรรมดา สิทธิ เช่า มัดจำ ค่า เจ้าของ ตกลง จุด แผ่น เสร็จ เนื้อ ข้าวสาร ขนมปัง เค้ก ทอด หอม สุก อุ่น แก้ว กระทะ
- **Focus.** ได้ + verb (dai-before-verb); เคย; ทำให้ (causative-hai); เพราะ … จึง … (cause-result-phro-chung)
- **Already known, free to use.** ศรัทธา ความ สุข พระ

#### th-a2-2-03 · #58 · adapted · narrative · 520 words · est. cov. 90.2 % · The hunter and the deer (a fable retold, 3)
- **Situation.** A third school-reader fable: a doe, a hunter and a thicket; what saves her and what betrays her (source suggestion: Aesop 38 / 42).
- **Cast.** a doe, a hunter
- **New (17).** พราน ใด รอด นัก เหลือบ ร้าย เล็ม ถึงที่ นิ่ง ตนเอง สำคัญ อาศัย ไม่สู้ จวนตัว กวาง ฆ่า ดม
- **Recycle (2).** อัศจรรย์×2 ปาฏิหาริย์
- **Focus.** written register; จวนตัว; ไม่สู้; ถึงที่; ตนเอง
- **Note.** adapted from the library fable; see section 5

#### th-a2-2-04 · #59 · in place · narrative · 87 words · measured cov. 98.9 % · ของขวัญวันเกิด
- **Text.** the existing machine draft, referenced in place: `document: "../../corpus/th/bridge-thai-bridge-11.json"` (kind `controlled`). 12 sentences, first-person family narration; not the mission cast.
- **Why here.** First position at which the draft is ≥ 92 % known with at most three never-met lemmas: 98.9 %.
- **Words still off the plan (1).** ผนัง — replace each with a planned word when the draft is revised, or accept it (it is one token in about ninety).

#### th-a2-2-05 · #60 · vol · family · 740 words · est. cov. 96.5 % · A long phone call home
- **Situation.** Sam calls his mother on a Sunday: what he ate, the weather, his friends, a small mistake with the tone of a word, her worries and her prayers.
- **Cast.** Sam, his mother (rendered in Thai for the unit), Mali
- **New (8).** ฝัน เหงา กังวล ผ่อน(←พักผ่อน) แขก เงียบ ฉลอง วิธี
- **Seeds (2 tokens, one use each, for a later authentic text).** ข้าง เดิม
- **Recycle (33).** เช่า มัดจำ ค่า เจ้าของ ตกลง×2 จุด แผ่น ชวน×2 ทาน×2 มื้อ×2 เสร็จ เนื้อ ข้าวสาร ขนมปัง เค้ก ทอด หอม สุก อุ่น แก้ว กระทะ อภัย ทุกข์ พึ่ง ขอบพระคุณ รู้สึก กล้า ทน บาป วิญญาณ พระบุตร กวาง ดม
- **Focus.** recycling; ห่วง; คิดถึง; ตอนที่ …
- **Already known, free to use.** อุ่น ใจ พัก

#### th-a2-2-06 · #61 · core · instructions · 790 words · est. cov. 95.1 % · Come, look, listen
- **Situation.** Instructions and invitations at a village health day: please sit, come in, do not worry, wait here, show me your arm; polite imperatives and softeners (นะ, หน่อย, สิ).
- **Cast.** Mali, Sam, villagers
- **New (12).** กรุณา โปรด หยุด ชี้ ถอย ลุก หายใจ เบา แรง เถอะ แตะ แยก
- **Seeds (3 tokens, one use each, for a later authentic text).** ระวัง ตั้ง นิ่งๆ
- **Recycle (28).** ชวน ทาน มื้อ เสร็จ เนื้อ ข้าวสาร ขนมปัง เค้ก ทอด หอม สุก อุ่น แก้ว กระทะ อภัย×2 ทุกข์×2 พึ่ง×2 ขอบพระคุณ×2 รู้สึก×2 กล้า×2 ทน×2 บาป×2 วิญญาณ×2 พระบุตร×2 จวนตัว ฆ่า ฉลอง วิธี
- **Focus.** อย่า + verb (prohibition-ya); ลอง + verb; imperative + หน่อย / สิ / นะ; โปรด / กรุณา

#### th-a2-2-07 · #62 · adapted · narrative · 540 words · est. cov. 91.7 % · The fox and the goat in the well (a fable retold, 4)
- **Situation.** A fourth fable: two animals fall into a well; one climbs out on the other and leaves; the lesson (source suggestion: Aesop 05).
- **Cast.** a fox, a goat
- **New (15).** แพะ จม ฉวย ลึก น้ำตาย กระโจน เท่าใด ปัญญา ทันที เหยียบ ตะเกียกตะกาย ฝั่ง พลาด เงา ลา
- **Recycle (17).** อัศจรรย์ ปาฏิหาริย์×2 พราน×2 รอด×2 เหลือบ×2 ร้าย×2 เล็ม×2 ถึงที่×2 นิ่ง×2 ตนเอง×2 สำคัญ×2 อาศัย×2 ไม่สู้×2 จวนตัว กวาง ฆ่า ดม
- **Focus.** written register; ทันที; ฉวย; พลาด
- **Note.** adapted from the library fable; see section 5

#### th-a2-2-08 · #63 · in place · narrative · 98 words · measured cov. 94.9 % · แมวสีขาว
- **Text.** the existing machine draft, referenced in place: `document: "../../corpus/th/bridge-thai-bridge-06.json"` (kind `controlled`). 12 sentences, first-person family narration; not the mission cast.
- **Why here.** First position at which the draft is ≥ 92 % known with at most three never-met lemmas: 94.9 %.
- **Words still off the plan (5).** ข้าง ระวัง นิ่งๆ เดิม ตั้ง — replace each with a planned word when the draft is revised, or accept it (it is one token in about ninety).

#### th-a2-2-09 · #64 · core · practical-communication · 840 words · est. cov. 95.6 % · Notices, rules, recipes
- **Situation.** The things one reads every day: a bus timetable, a temple notice (dress code, take off your shoes), a fire notice, a clinic sign, the back of a medicine box, a recipe card.
- **Cast.** Sam, Mali (reading aloud)
- **New (12).** ระเบียบ ประกาศ ทางออก ฉุกเฉิน อันตราย สุภาพ โดยสาร(←ผู้โดยสาร) กรัม กิโลเมตร ถอด สมควร ขนาด
- **Seeds (1 tokens, one use each, for a later authentic text).** กลิ่น
- **Recycle (36).** พราน รอด เหลือบ ร้าย เล็ม ถึงที่ นิ่ง ตนเอง สำคัญ อาศัย ไม่สู้ จวนตัว กวาง ฆ่า ดม ฝัน เหงา กังวล ผ่อน แขก เงียบ ฉลอง วิธี กรุณา โปรด หยุด ชี้ ถอย ลุก หายใจ เบา แรง แตะ แยก พลาด ลา
- **Focus.** ห้าม / ต้อง / ควร; ก่อน / หลัง + verb; numbers and units; telegram style
- **Already known, free to use.** ผู้ ช้อน โต๊ะ

#### th-a2-2-10 · #65 · core · community · 880 words · est. cov. 93.5 % · The neighbourhood meeting
- **Situation.** The soi's residents meet about the flooded lane and the rubbish: the headman speaks, a monk from the temple offers a hall, people disagree politely, a vote.
- **Cast.** the headman, Auntie Daeng, a monk, Ton, Sam (listening)
- **New (18).** ผู้ใหญ่(←ผู้ใหญ่บ้าน) ชุมชน ประชุม ขยะ ท่วม(←น้ำท่วม) ท่อ เสนอ ตัดสิน(←ตัดสินใจ) ซ่อม บริจาค ตน แก่ กฎ อำนาจ ร่วม รวม สะพาน กลุ่ม
- **Seeds (3 tokens, one use each, for a later authentic text).** ดัง กลิ้ง ชิ้น
- **Recycle (29).** ฝัน เหงา กังวล ผ่อน×2 แขก×2 เงียบ×2 ฉลอง วิธี กรุณา×2 โปรด×2 หยุด×2 ชี้×2 ถอย×2 ลุก×2 หายใจ×2 เบา×2 แรง×2 แตะ×2 แยก×2 ฝั่ง เงา อันตราย สุภาพ โดยสาร กรัม กิโลเมตร ถอด สมควร ขนาด
- **Focus.** reported speech with ว่า (complement-wa); ถ้า … ก็ …; เห็นด้วย / ไม่เห็นด้วย; passive with ถูก
- **Already known, free to use.** บ้าน น้ำ เห็น ด้วย ใจ

#### th-a2-2-11 · #66 · adapted · narrative · 480 words · est. cov. 91.3 % · The banyan and the reed (a fable retold, 5)
- **Situation.** A fifth fable: a great tree breaks in the storm, a reed bends; strength and yielding (source suggestion: Aesop 36).
- **Cast.** a banyan tree, a reed, the wind
- **New (14).** เหล่า เป็นต้น จัก ตั้ง รู้จัก แข็ง เหตุ อ่อน หลบ ไหว ตลิ่ง รุ่ง เลี่ยง บางที
- **Recycle (17).** ฝัน เหงา กังวล แพะ×2 จม×2 ฉวย×2 ลึก×2 น้ำตาย×2 กระโจน×2 ปัญญา×2 ทันที×2 เหยียบ×2 ตะเกียกตะกาย×2 ฝั่ง พลาด เงา ลา
- **Focus.** written register; เหล่า; เป็นต้น; จัก; ตั้ง
- **Note.** adapted from the library fable; see section 5

#### th-a2-2-12 · #67 · in place · narrative · 89 words · measured cov. 95.5 % · ข้าวเช้าวันนี้
- **Text.** the existing machine draft, referenced in place: `document: "../../corpus/th/bridge-thai-bridge-02.json"` (kind `controlled`). 12 sentences, first-person family narration; not the mission cast.
- **Why here.** First position at which the draft is ≥ 92 % known with at most three never-met lemmas: 95.5 %.
- **Words still off the plan (4).** ดัง กลิ่น ชิ้น กลิ้ง — replace each with a planned word when the draft is revised, or accept it (it is one token in about ninety).

#### th-a2-2-13 · #68 · core · church-and-mission-life · 880 words · est. cov. 96.5 % · Planning the next visit
- **Situation.** The team plans a visit to a village church in Mae Hong Son: who goes, what they take, the road, the message, what they hope; a conflict of dates is settled.
- **Cast.** Sam, Mali, Ton, the pastor, a village leader
- **New (10).** ดอย ข่าวดี เผย(←เผยแพร่) แพร่(←เผยแพร่) แม่ฮ่องสอน หวัง วางแผน ขับ พยาน เทศนา
- **Seeds (1 tokens, one use each, for a later authentic text).** น้อย
- **Recycle (42).** แพะ จม ฉวย ลึก น้ำตาย กระโจน ปัญญา ทันที เหยียบ ตะเกียกตะกาย ฝั่ง พลาด เงา ลา ระเบียบ ประกาศ ทางออก ฉุกเฉิน อันตราย สุภาพ โดยสาร กรัม กิโลเมตร ถอด สมควร ขนาด ผู้ใหญ่ ชุมชน ประชุม ขยะ ท่วม ท่อ เสนอ ตัดสิน ซ่อม บริจาค กฎ×2 อำนาจ ร่วม×2 รวม สะพาน×2 กลุ่ม
- **Focus.** อยาก / หวังว่า + clause; เพื่อให้ + clause; ถ้า … ก็ …; ซึ่ง
- **Already known, free to use.** ผู้ เดิน ทาง เพื่อ ให้ ประกาศ สั่ง สอน

#### th-a2-2-14 · #69 · core · health · 880 words · est. cov. 96.4 % · Dengue season
- **Situation.** The rainy season and mosquitoes: how dengue spreads, the symptoms, when to go to the hospital, how to protect the house; Ball falls ill and is cared for.
- **Cast.** Mali (explains), Ton, Ball, a doctor
- **New (10).** ยุง ขัง(←น้ำขัง) อาการ โรค เกล็ด(←เกล็ดเลือด) ผื่น ป้องกัน ระวัง รักษา อาเจียน
- **Seeds (2 tokens, one use each, for a later authentic text).** หยิบ จน
- **Recycle (34).** ระเบียบ×2 ประกาศ×2 ทางออก×2 ฉุกเฉิน×2 อันตราย สุภาพ โดยสาร กรัม กิโลเมตร ถอด สมควร ขนาด ผู้ใหญ่×2 ชุมชน×2 ประชุม×2 ขยะ×2 ท่วม×2 ท่อ×2 เสนอ×2 ตัดสิน×2 ซ่อม×2 บริจาค×2 กฎ อำนาจ×2 ร่วม รวม×2 สะพาน กลุ่ม×2 แม่ฮ่องสอน หวัง วางแผน ขับ พยาน เทศนา
- **Focus.** ถ้า … ก็ … ; ควร / ไม่ควร; ซึ่ง; ทำให้ + clause
- **Already known, free to use.** ไข้ เลือด ออก น้ำ

#### th-a2-2-15 · #70 · adapted · narrative · 520 words · est. cov. 90.8 % · The monkey and the fisherman (a fable retold, 6)
- **Situation.** A sixth fable: a monkey copies a fisherman, throws the net, is dragged under; imitation without skill (source suggestion: Aesop 43).
- **Cast.** a monkey, a fisherman
- **New (16).** เกิน อด ไต่ หนัก ทำการ เหวี่ยง เผอิญ ดิ้นรน สิ้น ลับ แหละ สม ประมาณ หนุ่ม ทำร้าย ซุกซ่อน
- **Recycle (13).** เป็นต้น×2 จัก×2 ตั้ง×2 รู้จัก×2 แข็ง×2 เหตุ×2 อ่อน×2 หลบ ไหว×2 ตลิ่ง รุ่ง×2 เลี่ยง บางที×2
- **Focus.** written register; เหวี่ยง; ดิ้นรน; สิ้น; ประมาณ
- **Note.** adapted from the library fable; see section 5

#### th-a2-2-16 · #71 · in place · narrative · 101 words · measured cov. 95.0 % · รถไฟไปเมือง
- **Text.** the existing machine draft, referenced in place: `document: "../../corpus/th/bridge-thai-bridge-07.json"` (kind `controlled`). 12 sentences, first-person family narration; not the mission cast.
- **Why here.** First position at which the draft is ≥ 92 % known with at most three never-met lemmas: 95.0 %.
- **Words still off the plan (5).** ข้าง หยิบ คนใน ง่วง ค่ำ — replace each with a planned word when the draft is revised, or accept it (it is one token in about ninety).

#### th-a2-2-17 · #72 · core · scripture · 840 words · est. cov. 96.5 % · The good neighbour (a retelling of Luke 10)
- **Situation.** A plain retelling of the parable: a man attacked on the road to Jericho, two who pass by, one who stops; what his neighbour does for him.
- **Cast.** the traveller, a priest, a Levite, a man from another town (the Samaritan; the word สะมาเรีย is not used, see section 6), the innkeeper
- **New (8).** ปล้น ปุโรหิต โรงแรม น้ำมัน เหล้า(←เหล้าองุ่น) องุ่น(←เหล้าองุ่น) สงสาร ขโมย
- **Seeds (5 tokens, one use each, for a later authentic text).** ง่วง ลัก คาบ แย่ง โลภ
- **Recycle (41).** เป็นต้น จัก ตั้ง รู้จัก แข็ง เหตุ อ่อน หลบ×2 ไหว ตลิ่ง×2 รุ่ง เลี่ยง×2 บางที ข่าวดี เผย แพร่ แม่ฮ่องสอน หวัง วางแผน ขับ พยาน เทศนา ยุง ขัง อาการ โรค เกล็ด ผื่น ป้องกัน×2 ระวัง×2 รักษา×2 อาเจียน×2 เผอิญ ดิ้นรน สิ้น ลับ สม ประมาณ หนุ่ม ทำร้าย×2 ซุกซ่อน×2
- **Focus.** long past narration; ครั้น; ผู้ที่ …; direct speech
- **Note.** Scripture domain (retelling). Needs a Scripture-competent reviewer. Names such as เยรูซาเล็ม, เยริโค, เลวี need chunk handling (section 7).
- **Already known, free to use.** ตี ผูก ผ่าน

#### th-a2-2-18 · #73 · core · travel · 930 words · est. cov. 95.4 % · Diary of the mission trip
- **Situation.** Five days on the road in the far north: the pickup truck, a broken bridge, a night in a village house, a service under a tin roof; short diary entries day by day.
- **Cast.** Sam (diary), Ton, Mali, village hosts
- **New (11).** กระบะ(←รถกระบะ) ขาด ข้าม บรรทุก สังกะสี ขณะ ดังนั้น กลิ่น ดัง(←เสียงดัง) ค่อย สว่าง
- **Seeds (10 tokens, one use each, for a later authentic text).** พ่อค้า คอก หัด เหลือ มิ คนใน ก้อน เท่า เนื้อที่ ลาภ
- **Recycle (29).** ข่าวดี×2 เผย×2 แพร่×2 แม่ฮ่องสอน หวัง วางแผน ขับ พยาน เทศนา ยุง×2 ขัง×2 อาการ×2 โรค×2 เกล็ด×2 ผื่น×2 ป้องกัน ระวัง รักษา อาเจียน เผอิญ ดิ้นรน สิ้น ลับ สม ประมาณ หนุ่ม ทำร้าย ซุกซ่อน ขโมย
- **Focus.** past narration; ระหว่าง; ขณะที่ (simultaneous); ดังนั้น
- **Already known, free to use.** รถ เสียง ตกลง ค่ำ

#### th-a2-2-19 · #74 · adapted · narrative · 420 words · est. cov. 91.0 % · The eagle and the fox (a fable retold, 7)
- **Situation.** A seventh fable: an eagle takes a fox's cubs, the fox takes a burning brand; the cost of a wrong done to a weaker neighbour (source suggestion: Aesop 27).
- **Cast.** an eagle, a fox
- **New (9).** น้อย ที มิได้ ชาว คาบ เดียวกัน ลำพัง ลัก ถือดี
- **Seeds (11 tokens, one use each, for a later authentic text).** ไม้ไผ่ เชิง เคียง คิด ปลาย สบถ แค้น อาสา หล่ม ม ภาย
- **Recycle (13).** เกิน×3 อด×3 ไต่×3 หนัก×3 ทำการ×3 เหวี่ยง×3 เผอิญ ดิ้นรน สิ้น ลับ สม ประมาณ หนุ่ม
- **Focus.** written register; มิได้; ชาว; ถือดี
- **Note.** adapted from the library fable; see section 5

#### th-a2-2-20 · #75 · in place · narrative · 85 words · measured cov. 97.6 % · ช่วยกันทำอาหาร
- **Text.** the existing machine draft, referenced in place: `document: "../../corpus/th/bridge-thai-bridge-09.json"` (kind `controlled`). 12 sentences, first-person family narration; not the mission cast.
- **Why here.** First position at which the draft is ≥ 92 % known with at most three never-met lemmas: 97.6 %.
- **Words still off the plan (2).** หยิบ จน — replace each with a planned word when the draft is revised, or accept it (it is one token in about ninety).

#### th-a2-2-21 · #76 · authentic · narrative · 150 words · measured cov. 93.3 % · คนเลี้ยงแพะกับลูกเสือ
- **Text.** `text:th:th-gap-recovery-aesop-44` placed as it is (kind `authentic`, unit field `textId`).
- **Why here.** Measured with this plan's vocabulary: 93.3 % of its running words are known (≥ 3 earlier encounters).
- **Unknown at this point (10).** พ่อค้า ไม้ไผ่ คอก เชิง หัด เคียง เหลือ คิด มิ ปลาย

#### th-a2-2-22 · #77 · core · explanation · 880 words · est. cov. 93.8 % · Opinions and comparisons
- **Situation.** Ton and Sam discuss: is it better to live in the city or in the country, to buy or to rent, to study at home or abroad; reasons, agreement, disagreement.
- **Cast.** Ton, Sam, Mali
- **New (14).** คิด(←คิดว่า) เหตุผล ข้อดี ข้อ(←ข้อเสีย) เท่า ค่อน(←ค่อนข้าง) ย่อม ยิ่ง เพียง เปรียบ(←เปรียบเทียบ) เทียบ(←เปรียบเทียบ) ด้าน แตก(←แตกต่าง) แท้จริง
- **Seeds (13 tokens, one use each, for a later authentic text).** ลอย พอใจ เกลอ ละทิ้ง ลวง หล่อ ทันใด ซื่อตรง สาบ ต้อน ชะโงก บ่น ซ้ำ
- **Recycle (24).** ปล้น×3 ปุโรหิต×3 โรงแรม×3 น้ำมัน×3 เหล้า×3 องุ่น×3 สงสาร×3 ขโมย×2 กระบะ ขาด ข้าม บรรทุก สังกะสี ขณะ กลิ่น ดัง ค่อย สว่าง ชาว คาบ เดียวกัน ลำพัง ลัก ถือดี
- **Focus.** กว่า / ที่สุด / เท่ากับ; ผมคิดว่า / ผมเห็นว่า; เพราะ; แต่ … ก็ …; มากกว่า
- **Already known, free to use.** ว่า เสีย ความ เห็น ข้าง ต่าง

#### th-a2-2-23 · #78 · authentic · narrative · 211 words · measured cov. 92.4 % · ลา หมาจิ้งจอก กับราชสีห์
- **Text.** `text:th:th-gap-recovery-aesop-15` placed as it is (kind `authentic`, unit field `textId`).
- **Why here.** Measured with this plan's vocabulary: 92.4 % of its running words are known (≥ 3 earlier encounters).
- **Unknown at this point (13).** ลวง3 หล่ม2 สบถ เกลอ แค้น ละทิ้ง อาสา จน หล่อ ม ทันใด ภาย ซื่อตรง

#### th-a2-2-24 · #79 · core · contemporary-nonfiction · 880 words · est. cov. 94.0 % · The rainy season and the farmers
- **Situation.** A magazine-style text: how the rains decide the farm year; planting, floods, the price of rice, why farmers worry, how the church helped.
- **Cast.** narrator; a farmer quoted
- **New (11).** เกษตรกร ผลผลิต เมล็ด แห้ง กำไร ขาดทุน แม้ ดังนี้ ฤดูกาล ชาวนา ปุ๋ย
- **Seeds (20 tokens, one use each, for a later authentic text).** ใส น้ำลง เลน ซัด มัว ย้อม สึก ชนิด ตบ ที่พัก กราบ เป็ด ถวาย สุภาษิต ร่ำไร เกลือก ฟัด แก้บน เพิ่ม วุ่นวาย
- **Recycle (26).** กระบะ×2 ขาด×2 ข้าม×2 บรรทุก×2 สังกะสี×2 ขณะ×2 กลิ่น×2 ดัง×2 ค่อย×2 สว่าง×2 ชาว×2 คาบ×2 เดียวกัน×2 ลำพัง×2 ลัก×2 ถือดี×2 คิด×3 เหตุผล×3 ข้อดี×3 ข้อ×3 ค่อน×3 เปรียบ×3 เทียบ×3 ด้าน×3 แตก×3 แท้จริง×3
- **Focus.** although (แม้ … แต่); เพราะ … จึง; การ + verb; ซึ่ง; numbers
- **Already known, free to use.** เก็บ เกี่ยว ท่วม ทุ่ง นา

#### th-a2-2-25 · #80 · authentic · narrative · 289 words · measured cov. 92.4 % · คนเลี้ยงวัวกับวัวหาย
- **Text.** `text:th:th-gap-recovery-aesop-45` placed as it is (kind `authentic`, unit field `textId`).
- **Why here.** Measured with this plan's vocabulary: 92.4 % of its running words are known (≥ 3 earlier encounters).
- **Unknown at this point (20).** มิ2 สาบ2 ชนิด ตบ ฟัด ที่พัก ต้อน คอก กราบ แก้บน เป็ด ชะโงก ถวาย เพิ่ม สุภาษิต บ่น ร่ำไร วุ่นวาย เกลือก ซ้ำ

#### th-a2-2-26 · #81 · adapted · narrative · 420 words · est. cov. 88.8 % · The wolf and the lamb (a fable retold, 8)
- **Situation.** An eighth fable: a wolf finds reasons to quarrel with a lamb at a stream and eats it anyway (source suggestion: Aesop 17).
- **Cast.** a wolf, a lamb
- **New (11).** พาล ชั่ว ตะครุบ จง ก็ได้ วิสัย หาความ นักหนา เถียง ชิ้น ก้อน
- **Seeds (14 tokens, one use each, for a later authentic text).** งวด งุ่มง่าม เซ คด หาก เหม็น ครั่น สูด ยกยอ รู้ที พู หวัด คงจะ กระไร
- **Recycle (0).** none assigned (see section 7, item on recycling)
- **Focus.** written register; จง; ก็ได้; เถียง
- **Note.** adapted from the library fable; see section 5

#### th-a2-2-27 · #82 · in place · narrative · 93 words · measured cov. 96.8 % · ฝนตกที่บ้าน
- **Text.** the existing machine draft, referenced in place: `document: "../../corpus/th/bridge-thai-bridge-04.json"` (kind `controlled`). 12 sentences, first-person family narration; not the mission cast.
- **Why here.** First position at which the draft is ≥ 92 % known with at most three never-met lemmas: 96.8 %.
- **Words still off the plan (3).** ลอย ใส พอใจ — replace each with a planned word when the draft is revised, or accept it (it is one token in about ninety).

#### th-a2-2-28 · #83 · authentic · narrative · 114 words · measured cov. 96.5 % · หมากับเงา
- **Text.** `text:th:th-gap-recovery-aesop-12` placed as it is (kind `authentic`, unit field `textId`).
- **Why here.** Measured with this plan's vocabulary: 96.5 % of its running words are known (≥ 3 earlier encounters).
- **Unknown at this point (4).** แย่ง เนื้อที่ โลภ ลาภ

#### th-a2-2-29 · #84 · vol · work · 740 words · est. cov. 95.5 % · Interview with a nurse
- **Situation.** Sam interviews Mali for the church newsletter: why she became a nurse, a hard night, what she would tell a young person; question and answer format.
- **Cast.** Sam, Mali
- **New (8).** ภูมิใจ เวร ดึก ดูแล มั่นใจ ชนะ ช่วง ยืนยัน
- **Seeds (9 tokens, one use each, for a later authentic text).** ขย้ำ คร้าม ชื่น ล่อลวง หมิ่น ก คัด ฉะนั้น เกี่ยวข้อง
- **Recycle (18).** เกษตรกร×3 ผลผลิต×3 เมล็ด×3 แห้ง×3 กำไร×3 ขาดทุน×3 ฤดูกาล×3 ชาวนา×3 ปุ๋ย×3 พาล ชั่ว ตะครุบ วิสัย หาความ นักหนา เถียง ชิ้น ก้อน
- **Focus.** recycling; question and answer; อะไร / ทำไม / อย่างไร
- **Already known, free to use.** สัมภาษณ์

#### th-a2-2-30 · #85 · authentic · narrative · 180 words · measured cov. 92.2 % · ลูกปูกับแม่ปู
- **Text.** `text:th:th-gap-recovery-aesop-25` placed as it is (kind `authentic`, unit field `textId`).
- **Why here.** Measured with this plan's vocabulary: 92.2 % of its running words are known (≥ 3 earlier encounters).
- **Unknown at this point (11).** คด4 น้ำลง งวด เลน งุ่มง่าม ซัด เซ มัว ย้อม หาก สึก

#### th-a2-2-31 · #86 · core · biography · 930 words · est. cov. 97.1 % · A nurse's life
- **Situation.** Mali's life told by Mali: a girl in the village, the nursing college in Bangkok, the first hospital job, the years of night shifts, why she came back north.
- **Cast.** Mali (first person)
- **New (9).** วิทยาลัย ฝึกงาน ทุน สอบ ปริญญา กระทั่ง(←จนกระทั่ง) ฝ่าย แห่ง หมู่
- **Recycle (9).** พาล ชั่ว ตะครุบ วิสัย หาความ นักหนา เถียง ชิ้น ก้อน
- **Focus.** all past narration; ซึ่ง; ที่ + clause; ตั้งแต่ … จนถึง …
- **Already known, free to use.** จน

#### th-a2-2-32 · #87 · core · conversation · 880 words · est. cov. 95.3 % · A loan, politely
- **Situation.** A neighbour needs money for a roof; Sam is asked, Ton advises him; the delicate language of asking, giving, refusing and saving face.
- **Cast.** Sam, Ton, a neighbour (ลุง), Auntie Daeng
- **New (12).** เกรงใจ น้ำใจ เกียรติ หนี้ ดอกเบี้ย ทรัพย์ ปฏิเสธ สัญญา ขอร้อง เหลือ(←ช่วยเหลือ) สมบัติ โกง
- **Seeds (5 tokens, one use each, for a later authentic text).** ร้าง หน่าย ลำบาก มิใช่ ประการ
- **Recycle (24).** พาล ชั่ว ตะครุบ วิสัย หาความ นักหนา เถียง ชิ้น ก้อน ภูมิใจ เวร ดึก ดูแล มั่นใจ ชนะ ช่วง ยืนยัน วิทยาลัย ฝึกงาน ทุน สอบ ปริญญา กระทั่ง หมู่
- **Focus.** polite register (ขอ, รบกวน, เกรงใจ); ถ้า … ก็ …; แม้ … ก็; ว่า
- **Already known, free to use.** หน้า ช่วย

#### th-a2-2-33 · #88 · core · correspondence · 880 words · est. cov. 93.8 % · The weekly report
- **Situation.** Sam and Ton's weekly report to the sending church: what was done, numbers, needs, prayer items; formal written register with headings.
- **Cast.** Sam, Ton
- **New (12).** รายงาน กิจกรรม ผล สนับสนุน(←ผู้สนับสนุน) ปรึกษา ปรากฏ แสดง ดิฉัน นอกจาก ติดตาม สร้าง สามัคคี
- **Seeds (19 tokens, one use each, for a later authentic text).** พระวจนะ มุม พระบิดา ละเมาะ หวาด ฝี เป็นสุข นน เฒ่า ชะงัก เมื่อไร ขลาด กระ พิจารณา รก เต้น โจก จำพวก กลบ
- **Recycle (27).** ภูมิใจ เวร ดึก ดูแล มั่นใจ ชนะ ช่วง ยืนยัน วิทยาลัย ฝึกงาน ทุน สอบ ปริญญา กระทั่ง หมู่ เกรงใจ น้ำใจ เกียรติ หนี้×2 ดอกเบี้ย×2 ทรัพย์×2 ปฏิเสธ×2 สัญญา ขอร้อง×2 เหลือ สมบัติ×2 โกง
- **Focus.** formal register; การ + verb; ได้ + verb; ซึ่ง; lists with numbers
- **Already known, free to use.** ความ ต้องการ ผู้ ค่า ใช้ จ่าย ดังนี้ ต่อ ไป เปิด เผย

#### th-a2-2-34 · #89 · core · testimony · 1020 words · est. cov. 95.9 % · Why I came to Thailand
- **Situation.** Sam's longer testimony, first person: how he first heard of Thailand, the call, the doubts, the first year, what he hopes for the friendships here.
- **Cast.** Sam
- **New (13).** วจนะ(←พระวจนะ) สวรรค์ พระองค์ กางเขน ถวาย สรรเสริญ ฟื้น สาวก บัญญัติ ศัตรู สงบ มิตร สหาย
- **Seeds (3 tokens, one use each, for a later authentic text).** พระวิญญาณ องค์ เกลียด
- **Recycle (38).** ภูมิใจ เวร ดึก ดูแล มั่นใจ ชนะ ช่วง ยืนยัน วิทยาลัย ฝึกงาน ทุน สอบ ปริญญา กระทั่ง หมู่ เกรงใจ×2 น้ำใจ×2 เกียรติ×2 หนี้ ดอกเบี้ย ทรัพย์ ปฏิเสธ สัญญา×2 ขอร้อง เหลือ×2 สมบัติ โกง×2 รายงาน×3 กิจกรรม×3 ผล×3 สนับสนุน×3 ปรึกษา×3 ปรากฏ×3 แสดง×3 นอกจาก×3 ติดตาม×3 สร้าง×3 สามัคคี×3
- **Focus.** all constructions; ที่ … คือ …; ถึงแม้ … ก็; ว่า
- **Already known, free to use.** พระ บิดา ตัดสิน ใจ เรียก ร้อง

#### th-a2-2-35 · #90 · authentic · scripture · 556 words · measured cov. 98.6 % · 1 ยอห์น 4
- **Text.** `text:th:bible-thai-otcv2025-1jn-4` placed as it is (kind `authentic`, unit field `textId`).
- **Why here.** Measured with this plan's vocabulary: 98.6 % of its running words are known (≥ 3 earlier encounters); 94.2 % when the adapter's name guesses are not counted as known.
- **Unknown at this point (6).** พระวิญญาณ3 พระวจนะ มุม องค์ พระบิดา เกลียด
- **Never met before (3).** พระวจนะ พระวิญญาณ พระบิดา


### 3.3 What goes into `ladder.json`

One entry per row of the table, in the order of the table (the ids are final; the stage is the middle part of the id): `{ "id": "th-a1-1-01", "stage": "a1-1", "kind": "controlled", "document": "units/th-a1-1-01.json", "domain": "conversation", "title": "…" }`. Rows marked **core** or **vol** are `controlled`; rows marked **adapted** are `adapted` with a `document` under `units/`; rows marked **in place** are `controlled` with `"document": "../../corpus/th/bridge-thai-bridge-NN.json"` (the bundled corpus already has them, so they are not copied into `units/`); rows marked **authentic** are `authentic` with `"textId": "text:th:…"` and no document. Top level: `"lang": "th", "version": 1, "after": "stage0"`. The domain strings in the table are the ones the Spanish ladder uses. Stage 0's path (`data/stage0/th/path.json`) is the head of the ladder.

## 4. The existing drafts

All twelve `bridge-thai-bridge-NN` drafts are machine-drafted, unreviewed and unpublished: 1,125 words, 144 sentences, 12 sentences each, first-person family narration with no polite particles, A1/A2 "provisional course planning". "First ≥ 88 %" and "first ≥ 92 %" are the first unit after which the draft reaches that share known with this plan's vocabulary (controlled units only, *modelled*); the decision column says where it is actually placed (one draft per three slots at most, and only when at most three of its lemmas are new).

| draft | title | words | first ≥ 88 % | first ≥ 92 % | at the end of a2-2 | decision |
|---|---|---:|---|---|---:|---|
| bridge-thai-bridge-01 | บ้านของเรา | 96 | th-a1-2-12 | th-a2-1-06 | 100.0 % | in place as **th-a2-1-10** |
| bridge-thai-bridge-02 | ข้าวเช้าวันนี้ | 89 | th-a2-1-21 | th-a2-2-01 | 98.9 % | in place as **th-a2-2-12** |
| bridge-thai-bridge-03 | ตลาดใกล้บ้าน | 92 | th-a2-1-14 | th-a2-2-01 | 94.6 % | in place in the b1-bridge (section 5), after its remaining off-plan words are taught |
| bridge-thai-bridge-04 | ฝนตกที่บ้าน | 93 | th-a2-1-22 | th-a2-2-18 | 96.8 % | in place as **th-a2-2-27** |
| bridge-thai-bridge-05 | ไปโรงเรียน | 90 | th-a2-1-08 | th-a2-1-18 | 97.8 % | in place as **th-a2-1-19** |
| bridge-thai-bridge-06 | แมวสีขาว | 98 | th-a2-1-13 | th-a2-2-06 | 98.0 % | in place as **th-a2-2-08** |
| bridge-thai-bridge-07 | รถไฟไปเมือง | 101 | th-a2-1-13 | th-a2-1-15 | 97.0 % | in place as **th-a2-2-16** |
| bridge-thai-bridge-08 | วันหยุดริมทะเล | 96 | th-a2-2-06 | th-a2-2-26 | 92.7 % | in place in the b1-bridge (section 5), after its remaining off-plan words are taught |
| bridge-thai-bridge-09 | ช่วยกันทำอาหาร | 85 | th-a2-1-21 | th-a2-2-03 | 98.8 % | in place as **th-a2-2-20** |
| bridge-thai-bridge-10 | ร้านหนังสือเล็กๆ | 94 | th-a2-1-17 | th-a2-1-22 | 96.8 % | in place as **th-a2-1-23** |
| bridge-thai-bridge-11 | ของขวัญวันเกิด | 87 | th-a2-1-09 | th-a2-1-20 | 98.9 % | in place as **th-a2-2-04** |
| bridge-thai-bridge-12 | เย็นสบายในสวน | 102 | th-a2-1-14 | th-a2-1-17 | 95.1 % | in place in the b1-bridge (section 5), after its remaining off-plan words are taught |

What to change in every draft before it is placed: add a speaker identity or keep the narrator anonymous; replace each off-plan word listed in its block by a planned word (or accept it: each is one token in about ninety); keep the 12 sentences; the narrator says ฉัน throughout (a woman or an unnamed adult; no particle); the drafts use no cast name, so nothing needs renaming. **None of the twelve is superseded.** Their content (market, school, rain, a train, a cat, the sea, cooking, a bookshop, a birthday, a garden) overlaps a1-1 and a1-2 topics but at a level of vocabulary that those units do not reach, so they are good second readings of familiar scenes. The three that wait for the b1-bridge (03 market, 08 sea, 12 garden) reach 92 % only after the last free slot of a2-2 (the spacing rule allows one draft per three units, and the later a2-2 units are better spent on the fables and on 1 John 4), so they open the b1-bridge.

The other seeds in `data/corpus/th/`: `dialogue-01` (59 words, 91.5 % known after a2-2) and `story-01` (68 words, 85.3 %) are superseded by a1-1-01 and a1-1-15 and are not placed; `bible-1john-1.json` (77 words) is the older unverified Scripture fixture and stays excluded (`docs/THAI_COURSE.md`).

## 5. The b1-bridge: how to fill it

### 5.1 What the library offers, measured against this ladder

`public/library/th` (built 2026-10-04): the Biblica **Open Thai Common Version 2025** (1,189 chapters, 863,775 words, CC BY-SA 4.0), **45 Aesop fables** (`th-gap-recovery-aesop`, 9,475 words, the 1956 translation of พระยาเมธาธิบดี on Thai Wikisource, public-domain text with a CC BY-SA 4.0 transcription), **three short Wikisource poems** (156 words, archaic) and **นิทานเวตาล / Vetal** (six chapters, 30,160 words, early-20th-century literary prose). Nothing contemporary and nothing in the spoken register. "Gate reading" is what `ladder:place` will say today; "honest reading" does not count the adapter's name guesses as known (section 0, finding 5). Figures are for the plan's vocabulary after a2-2, and after the eight bridging units of section 5.3.

| text | words | gate reading after a2-2 | honest reading after a2-2 | honest reading after the b1 bridging units | what the plan does |
|---|---:|---:|---:|---:|---|
| poem: หนึ่งไซร้หมู่ไม้ม้วน | 58 | 60.3 % | 60.3 % | 62.1 % | library, not ladder |
| poem: ใฝ่ใจแลให้ทาน | 39 | 66.7 % | 66.7 % | 69.2 % | library, not ladder |
| poem: ผู้ใหญ่หาผ้าใหม่ | 59 | 71.2 % | 71.2 % | 78.0 % | library, not ladder |
| Vetal: นิทานเวตาล/ต้นเรื่อง | 7519 | 69.0 % | 69.0 % | 71.0 % | library, not ladder |
| Vetal: นิทานเวตาล/เรื่องที่ 1 | 8917 | 68.9 % | 68.9 % | 70.5 % | library, not ladder |
| Vetal: นิทานเวตาล/เรื่องที่ 8 | 5978 | 68.4 % | 68.4 % | 70.1 % | library, not ladder |
| Vetal: นิทานเวตาล/เรื่องที่ 9 | 4185 | 72.6 % | 72.6 % | 74.6 % | library, not ladder |
| Vetal: นิทานเวตาล/เรื่องที่ 10 | 1685 | 69.4 % | 69.4 % | 71.8 % | library, not ladder |
| Vetal: นิทานเวตาล/ปลายเรื่อง | 1876 | 65.1 % | 65.1 % | 67.1 % | library, not ladder |
| 1 ยอห์น 4 | 556 | 99.1 % | 94.8 % | 96.0 % | placed in a2-2 (authentic Scripture) |
| ลูกา 15 | 761 | 99.2 % | 93.3 % | 93.7 % | b1 (after the retelling in a2-1) |
| ยอห์น 4 | 1188 | 98.0 % | 92.2 % | 93.3 % | b1 |
| 1 ยอห์น 1 | 268 | 95.1 % | 88.8 % | 93.3 % | b1 |
| สดุดี 23 | 138 | 97.1 % | 89.1 % | 91.3 % | b1 |
| ยอห์น 9 | 999 | 97.8 % | 91.8 % | 92.5 % | library entry point |
| ยอห์น 3 | 837 | 96.4 % | 89.1 % | 91.0 % | library entry point |
| ยอห์น 1 | 1108 | 97.2 % | 90.8 % | 92.2 % | library entry point |
| ยอห์น 15 | 700 | 96.3 % | 90.0 % | 95.1 % | library entry point |
| มาระโก 1 | 936 | 98.0 % | 89.2 % | 90.8 % | library entry point |
| มาระโก 2 | 732 | 97.3 % | 89.3 % | 90.4 % | library entry point |
| มาระโก 4 | 872 | 97.8 % | 86.1 % | 88.4 % | library |
| มาระโก 6 | 1296 | 98.5 % | 91.4 % | 92.1 % | library entry point |
| ลูกา 10 | 1095 | 96.7 % | 90.4 % | 92.7 % | retold in a2-2; original is library |
| สดุดี 1 | 133 | 95.5 % | 85.0 % | 87.2 % | library |
| สดุดี 100 | 104 | 92.3 % | 85.6 % | 89.4 % | library |
| สดุดี 121 | 126 | 96.8 % | 82.5 % | 83.3 % | library |
| มัทธิว 5 | 1107 | 97.5 % | 84.2 % | 86.4 % | library |
| โรม 8 | 1135 | 97.5 % | 85.1 % | 86.5 % | library |

**Frequency evidence (measured).** Share of each text's running words (names and numerals excluded) covered by its own most frequent lemmas, and by the 41 Stage 0 lemmas met three times:

| text | words | lemmas | top 100 | top 300 | top 500 | top 800 | top 1,000 | Stage 0 (secure 41) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Aesop (45 fables) | 9,475 | 1,268 | 58.0 % | 79.8 % | 88.0 % | 94.0 % | 96.1 % | 13.3 % |
| Mark (OTCV, honest count) | 15,489 | 1,272 | 62.0 % | 80.8 % | 87.6 % | 92.4 % | 93.8 % | 11.5 % |
| John | 21,271 | 1,108 | 70.4 % | 86.6 % | 91.6 % | 94.7 % | 95.6 % | 12.3 % |
| Psalms | 48,032 | 2,268 | 62.2 % | 78.6 % | 85.3 % | 90.5 % | 92.5 % | 8.7 % |
| the 12 bridge drafts | 1,123 | 343 | 67.9 % | 95.4 % | 99.2 % | 99.2 % | 99.2 % | 15.6 % |

A list of 1,000 lemmas chosen by the frequency of one text would read that text at 94–96 %; the plan's 1,000 are chosen by the mission frame first (market, clinic, church, songthaew) and by fable and Bible frequency second, so they read Aesop at about 88 % and the Bible at 89–93 %. That gap is the reason for the eight bridging units, and it is the price of a ladder that is about Chiang Mai life rather than about the texts it leads to. The plan spends about 110 of its 1,000 lemmas on fable words and about 20 on church words; the bridging units spend 128 more.

Reading the table:

- **The Bible is nearly in reach, once the gate stops flattering it.** With the honest reading, 1 John 4 (95 %), Luke 15 (93 %) and John 4 (92 %) clear 92 % after a2-2; John 1, 9 and 15 and Mark 6 clear it after the bridging units; the rest of Mark and John sit at 85–92 %, the Psalms at 83–91 %. The most frequent unknown words are church words (พระบิดา, สาวก, บัญญัติ, ธรรม, พระวิญญาณ, พระวจนะ, องค์, มนุษย์, ฟาริสี, ยิว) which a2-2 starts and the bridging units finish; the royal verb `ทรง` and the register of the Psalms are receptive.
- **Aesop needs the bridging units.** After a2-2 the planned vocabulary reads the fables at 87.7 % on average; the units of section 5.3 raise 28 of them to ≥ 92 %.
- **Vetal and the poems are library, not ladder.** After the b1 bridge they read 62–78 % known; they need about 600–900 further lemmas and a literary register that the ladder does not teach.

### 5.2 Fables: where each becomes readable

Measured on this plan: "known with the planned vocabulary" is the share of the fable's tokens whose lemma has ≥ 3 earlier encounters in the controlled and adapted units alone (before any authentic fable is read). "At" is the position at which the sequence of section 5.3 places it, with its measured share at that point (every earlier authentic text has added its own encounters).

| fable | title | words | known with the planned vocabulary | placed | at |
|---|---|---:|---:|---|---|
| 01 | ราชสีห์กับหนู | 241 | 86.7 % | b1 authentic | b1-bridge step 24, after 3 bridging units (92.9 %) |
| 02 | พ่อกับลูก | 232 | 87.1 % | b1 authentic | b1-bridge step 22, after 3 bridging units (94.0 %) |
| 03 | ลากับจิ้งหรีด | 92 | 89.1 % | b1 authentic | b1-bridge step 20, after 2 bridging units (92.4 %) |
| 04 | หมาจิ้งจอกกับนกกระสา | 137 | 81.8 % | library (not within the first 8 bridging units) | — |
| 05 | หมาจิ้งจอกกับแพะ | 232 | 88.8 % | b1 authentic | b1-bridge step 37, after 6 bridging units (92.2 %) |
| 06 | กากับนกยูง | 222 | 78.4 % | library (not within the first 8 bridging units) | — |
| 07 | เด็กจับตั๊กแตน | 132 | 82.6 % | library (not within the first 8 bridging units) | — |
| 08 | มดง่ามกับจักจั่น | 210 | 88.6 % | b1 authentic | b1-bridge step 28, after 4 bridging units (93.3 %) |
| 09 | ไก่กับพลอย | 96 | 85.4 % | library (not within the first 8 bridging units) | — |
| 10 | กระต่ายกับเต่า | 211 | 87.7 % | b1 authentic | b1-bridge step 42, after 8 bridging units (98.1 %) |
| 11 | เทวดากับคนขับเกวียน | 121 | 82.6 % | library (not within the first 8 bridging units) | — |
| 12 | หมากับเงา | 114 | 96.5 % | a2-2 authentic | th-a2-2-28 (96.5 %) |
| 13 | ลูกอ้นกับแม่อ้น | 108 | 86.1 % | library (not within the first 8 bridging units) | — |
| 14 | ชาวนากับงูเห่า | 144 | 84.7 % | library (not within the first 8 bridging units) | — |
| 15 | ลา หมาจิ้งจอก กับราชสีห์ | 211 | 92.9 % | a2-2 authentic | th-a2-2-23 (92.4 %) |
| 16 | แมลงวันกับไหน้ำผึ้ง | 118 | 83.1 % | library (not within the first 8 bridging units) | — |
| 17 | หมาป่ากับลูกแกะ | 235 | 89.4 % | b1 authentic | b1-bridge step 13, after 1 bridging unit (92.3 %) |
| 18 | หมาไล่เนื้ออายุมาก | 170 | 90.6 % | b1 authentic | b1-bridge step 29, after 4 bridging units (92.4 %) |
| 19 | หมาอยู่ในรางหญ้า | 97 | 89.7 % | b1 authentic | b1-bridge step 16, after 2 bridging units (93.8 %) |
| 20 | ไก่แจ้กับเหยี่ยว | 28 | 85.7 % | b1 authentic | b1-bridge step 35, after 6 bridging units (100.0 %) |
| 21 | หมาจิ้งจอกหางด้วน | 338 | 86.7 % | b1 authentic | b1-bridge step 33, after 5 bridging units (92.9 %) |
| 22 | ลูกแพะกับหมาป่า | 231 | 89.2 % | b1 authentic | b1-bridge step 19, after 2 bridging units (92.6 %) |
| 23 | หมาจิ้งจอกกับเม่น | 262 | 89.7 % | b1 authentic | b1-bridge step 12, after 1 bridging unit (92.4 %) |
| 24 | อึ่งอ่างกับวัว | 223 | 89.7 % | b1 authentic | b1-bridge step 9, after 1 bridging unit (92.8 %) |
| 25 | ลูกปูกับแม่ปู | 180 | 92.2 % | a2-2 authentic | th-a2-2-30 (92.2 %) |
| 26 | พวกหนูประชุมปรึกษากัน | 220 | 88.6 % | b1 authentic | b1-bridge step 25, after 3 bridging units (92.3 %) |
| 27 | นกอินทรีกับหมาจิ้งจอก | 228 | 84.6 % | library (not within the first 8 bridging units) | — |
| 28 | ชาวสวนกับลูก | 195 | 85.6 % | library (not within the first 8 bridging units) | — |
| 29 | ท้องกับตัว | 212 | 86.8 % | b1 authentic | b1-bridge step 39, after 7 bridging units (97.2 %) |
| 30 | เทพารักษ์กับคนตัดไม้ | 437 | 87.6 % | b1 authentic | b1-bridge step 17, after 2 bridging units (93.4 %) |
| 31 | นายพรานกับไก่ฟ้า | 205 | 83.9 % | library (not within the first 8 bridging units) | — |
| 32 | หนู กบ กับเหยี่ยว | 382 | 87.4 % | b1 authentic | b1-bridge step 40, after 7 bridging units (92.1 %) |
| 33 | ราชสีห์ชันสูตรลมหายใจ | 267 | 91.4 % | b1 authentic | b1-bridge step 11, after 1 bridging unit (92.5 %) |
| 34 | กบเลือกนาย | 111 | 82.9 % | library (not within the first 8 bridging units) | — |
| 35 | ยายแก่กับหม้อ | 411 | 89.1 % | b1 authentic | b1-bridge step 14, after 1 bridging unit (92.2 %) |
| 36 | ต้นไทรกับต้นอ้อ | 238 | 86.6 % | b1 authentic | b1-bridge step 23, after 3 bridging units (93.3 %) |
| 37 | หมาจิ้งจอกกับราชสีห์ | 230 | 91.3 % | b1 authentic | b1-bridge step 8, after 1 bridging unit (93.0 %) |
| 38 | แม่เนื้อกับนายพรานป่า | 337 | 88.1 % | b1 authentic | b1-bridge step 36, after 6 bridging units (93.5 %) |
| 39 | หมาดุ | 206 | 85.0 % | b1 authentic | b1-bridge step 30, after 4 bridging units (92.2 %) |
| 40 | พ่อค้าเกลือกับโคต่าง | 242 | 87.2 % | b1 authentic | b1-bridge step 27, after 4 bridging units (94.2 %) |
| 41 | กระต่ายป่ากับกบ | 305 | 91.8 % | b1 authentic | b1-bridge step 7, after 1 bridging unit (93.1 %) |
| 42 | กวางกับเสือ | 178 | 90.4 % | b1 authentic | b1-bridge step 18, after 2 bridging units (93.3 %) |
| 43 | ลิงกับคนทอดแห | 247 | 87.0 % | b1 authentic | b1-bridge step 32, after 5 bridging units (94.7 %) |
| 44 | คนเลี้ยงแพะกับลูกเสือ | 150 | 94.7 % | a2-2 authentic | th-a2-2-21 (93.3 %) |
| 45 | คนเลี้ยงวัวกับวัวหาย | 289 | 92.7 % | a2-2 authentic | th-a2-2-25 (92.4 %) |

The eight **adapted retellings** in a2-1 and a2-2 teach the fable register (source suggestions are in their blocks: Aesop 33 / 37, 32, 38 / 42, 05, 36, 43, 27, 17). They are not copies: each is a simplified retelling in the register of the original with the lemmas of its list, ≤ 12 tokens per sentence, a one-sentence moral at the end. The authentic version of the same fable is placed later as a re-reading.

### 5.3 A sequence for about 30 000 words

| # | kind | unit | words | known % | lemmas known after |
|---:|---|---|---:|---:|---:|
| 1 | in place | bridge draft 12 เย็นสบายในสวน | 102 | 95.1 | 997 |
| 2 | in place | bridge draft 03 ตลาดใกล้บ้าน | 92 | 94.6 | 997 |
| 3 | authentic | OTCV ลูกา 15 | 761 | 93.3 (strict) | 997 |
| 4 | in place | bridge draft 08 วันหยุดริมทะเล | 96 | 92.7 | 997 |
| 5 | authentic | OTCV ยอห์น 4 | 1188 | 92.2 (strict) | 999 |
| 6 | adapted | AD-B1-01 (bridging unit, to write) | 700 | 93.1 | 1015 |
| 7 | authentic | Aesop 41 กระต่ายป่ากับกบ | 305 | 93.1 | 1016 |
| 8 | authentic | Aesop 37 หมาจิ้งจอกกับราชสีห์ | 230 | 93.0 | 1017 |
| 9 | authentic | Aesop 24 อึ่งอ่างกับวัว | 223 | 92.8 | 1017 |
| 10 | authentic | OTCV 1 ยอห์น 1 | 268 | 92.5 (strict) | 1018 |
| 11 | authentic | Aesop 33 ราชสีห์ชันสูตรลมหายใจ | 267 | 92.5 | 1022 |
| 12 | authentic | Aesop 23 หมาจิ้งจอกกับเม่น | 262 | 92.4 | 1025 |
| 13 | authentic | Aesop 17 หมาป่ากับลูกแกะ | 235 | 92.3 | 1027 |
| 14 | authentic | Aesop 35 ยายแก่กับหม้อ | 411 | 92.2 | 1029 |
| 15 | adapted | AD-B1-02 (bridging unit, to write) | 700 | 93.1 | 1045 |
| 16 | authentic | Aesop 19 หมาอยู่ในรางหญ้า | 97 | 93.8 | 1045 |
| 17 | authentic | Aesop 30 เทพารักษ์กับคนตัดไม้ | 437 | 93.4 | 1051 |
| 18 | authentic | Aesop 42 กวางกับเสือ | 178 | 93.3 | 1051 |
| 19 | authentic | Aesop 22 ลูกแพะกับหมาป่า | 231 | 92.6 | 1053 |
| 20 | authentic | Aesop 03 ลากับจิ้งหรีด | 92 | 92.4 | 1054 |
| 21 | adapted | AD-B1-03 (bridging unit, to write) | 700 | 93.1 | 1070 |
| 22 | authentic | Aesop 02 พ่อกับลูก | 232 | 94.0 | 1072 |
| 23 | authentic | Aesop 36 ต้นไทรกับต้นอ้อ | 238 | 93.3 | 1075 |
| 24 | authentic | Aesop 01 ราชสีห์กับหนู | 241 | 92.9 | 1076 |
| 25 | authentic | Aesop 26 พวกหนูประชุมปรึกษากัน | 220 | 92.3 | 1078 |
| 26 | adapted | AD-B1-04 (bridging unit, to write) | 700 | 93.1 | 1094 |
| 27 | authentic | Aesop 40 พ่อค้าเกลือกับโคต่าง | 242 | 94.2 | 1094 |
| 28 | authentic | Aesop 08 มดง่ามกับจักจั่น | 210 | 93.3 | 1096 |
| 29 | authentic | Aesop 18 หมาไล่เนื้ออายุมาก | 170 | 92.4 | 1098 |
| 30 | authentic | Aesop 39 หมาดุ | 206 | 92.2 | 1100 |
| 31 | adapted | AD-B1-05 (bridging unit, to write) | 700 | 93.1 | 1116 |
| 32 | authentic | Aesop 43 ลิงกับคนทอดแห | 247 | 94.7 | 1116 |
| 33 | authentic | Aesop 21 หมาจิ้งจอกหางด้วน | 338 | 92.9 | 1118 |
| 34 | adapted | AD-B1-06 (bridging unit, to write) | 700 | 93.1 | 1134 |
| 35 | authentic | Aesop 20 ไก่แจ้กับเหยี่ยว | 28 | 100.0 | 1134 |
| 36 | authentic | Aesop 38 แม่เนื้อกับนายพรานป่า | 337 | 93.5 | 1135 |
| 37 | authentic | Aesop 05 หมาจิ้งจอกกับแพะ | 232 | 92.2 | 1136 |
| 38 | adapted | AD-B1-07 (bridging unit, to write) | 700 | 93.1 | 1152 |
| 39 | authentic | Aesop 29 ท้องกับตัว | 212 | 97.2 | 1154 |
| 40 | authentic | Aesop 32 หนู กบ กับเหยี่ยว | 382 | 92.1 | 1156 |
| 41 | adapted | AD-B1-08 (bridging unit, to write) | 700 | 93.1 | 1172 |
| 42 | authentic | Aesop 10 กระต่ายกับเต่า | 211 | 98.1 | 1173 |

The sequence above is a simulation (*modelled*): after each placement the learner has met the text's words once more; when nothing clears 92 % the simulation adds one bridging unit teaching the 16 lemmas that help the nearest candidates most. It needs **8 bridging units of about 700 words (128 lemmas)** to place 28 fables and 3 Scripture chapters (2,217 words, under the 10 % cap of a b1 stage of about 30 k words), the three waiting drafts, and ends at about 1173 lemmas known. The bridging units are written like any other controlled unit, in the mission setting, with the lemma lists below (the writer may swap a rare word of a list for a common word of the same theme, but the fable-specific words are the point).

- **AD-B1-01** (≈ 700 words, 16 lemmas, each three times): อีฉัน ธรรม ละเมาะ รอย ตอม อึ่ง ด่า ปี่ พิจารณา พอง ฉะนั้น ยกยอ อ้าง สิ่งของ ไหล มาบ — serves FAB-41, FAB-33, FAB-37, FAB-42.
- **AD-B1-02** (≈ 700 words, 16 lemmas, each three times): เทพารักษ์ ทอง งม มด เถาวัลย์ งับ จิ้งหรีด นึกถึง ไล่กวด เป่า เห็นดี ราง รอบคอบ แทนคุณ หลุด ณ — serves FAB-42, FAB-22, FAB-19, FAB-18.
- **AD-B1-03** (≈ 700 words, 16 lemmas, each three times): เกลือ แขนง ไผ่ โค่น แขม หัวร่อ แข่ง เชือก พง รอดพ้น บึง จักจั่น แร้ว ลูกหนู พรวน ทะเลาะ — serves FAB-18, FAB-08, FAB-01, FAB-26.
- **AD-B1-04** (≈ 700 words, 16 lemmas, each three times): หาง แห ประดับ หว้า ลอบกัด อ่อนเพลีย ผอม ลำบาก พ่อค้า ห้วย ละลาย แช่ นุ่น งอก เย้ย คลาน — serves FAB-18, FAB-08, FAB-40, FAB-10.
- **AD-B1-05** (≈ 700 words, 16 lemmas, each three times): ทอดแห กุ้ง แน่ะ ประหลาด ประมาท ทุกที ด้วน รุงรัง เกลียด ดก ยิง เสี่ยง เซิง เหยี่ยว สนิท จืด — serves FAB-43, FAB-10, FAB-21, FAB-38.
- **AD-B1-06** (≈ 700 words, 16 lemmas, each three times): ภัย ใจเร็ว ฝีมือ พุ่ม สบายใจ ข่าย พลอย กำเริบ ขาดใจ เกี่ยง เฉย เคี้ยว ตลอด ถา ลาน แม่น — serves FAB-38, FAB-10, FAB-05, FAB-32.
- **AD-B1-07** (≈ 700 words, 16 lemmas, each three times): อินทรี คอย คบ ยอม ตั๊กแตน ลูกล้อ ถุ้ง งอน เท่านั้น เหน็ดเหนื่อย อิจฉา อม ทรมาน อดอยาก ซูบ คบคิด — serves FAB-29, FAB-10, FAB-32, SCR-psa-23.
- **AD-B1-08** (≈ 700 words, 16 lemmas, each three times): รัง ยอด เทวดา เยาะ ราวกะ ลองดี กระไร ท้า กระหยิ่ม ปลาย นัด ก้ม ลัด จนถึง ฝีเท้า ชะล่า — serves FAB-10, SCR-psa-23, FAB-11, FAB-31.

### 5.4 The rest of the stage (not planned unit by unit)

The authentic items and the bridging units come to about 14,821 words. To reach the 30 k that `docs/LADDER.md` gives as the indicative lower bound, and to give the b1-bridge the contemporary and practical Thai the library lacks, the plan reserves about fourteen further adapted units of 900–1,200 words each, written after a2-2 is measured, each introducing ≤ 2.65 new lemmas per 100 words in these domains: contemporary explanation (the smoky season in Chiang Mai, Songkran and water, the Thai school year, what the temple festival is, how rice is grown), news and correspondence (a church newsletter, a prayer letter, a formal request to the district office, a lease), biography of composite or consenting people (a Thai pastor, a nurse, a songthaew driver), testimony in the second person (what others say about their faith), practical documents (a clinic form, a hospital discharge note, a bus timetable), a Thai story of the Bible (Joseph, Ruth, Jonah) in plain written Thai (Scripture total still ≤ 10 %), and two units that prepare the literary register (longer sentences, ซึ่ง, อัน, ดังนั้น, ย่อม). Everything is machine-drafted until a native reviewer reads it.

### 5.5 Hold or avoid

- **THSV11**: declined by its rights holder; never stored, shown or analysed.
- **`bible-1john-1.json`** (the older fixture): excluded; use OTCV chapters from `public/library/th` instead.
- **Vetal and the poems**: library only (above).
- **The 12 fables that stay out of the ladder** (with their share known after the bridging units): 04 หมาจิ้งจอกกับนกกระสา (84 %); 06 กากับนกยูง (81 %); 07 เด็กจับตั๊กแตน (87 %); 09 ไก่กับพลอย (88 %); 11 เทวดากับคนขับเกวียน (89 %); 13 ลูกอ้นกับแม่อ้น (88 %); 14 ชาวนากับงูเห่า (86 %); 16 แมลงวันกับไหน้ำผึ้ง (83 %); 27 นกอินทรีกับหมาจิ้งจอก (91 %); 28 ชาวสวนกับลูก (87 %); 31 นายพรานกับไก่ฟ้า (88 %); 34 กบเลือกนาย (87 %). Archaic tools and animals (กระสา, จะงอย, ตั๊กแตน, อ้น, งูเห่า, เกวียน) and segmentation fragments; they are library reading for a learner who has finished the b1 bridge.
- **Mark 4, Matthew 5, Romans 8, Psalms 1, 100, 121**: honest readings of 83–89 % after the bridging units; library entry points later.
- **Anything with Thai-script spacing or archaic orthography** (the Wikisource poems, Vetal) reads as unknown fragments; the unknown share there is segmentation, not vocabulary.

### 5.6 First placements to run when the ladder exists

`npm run ladder:place -- --lang th <textId>`, in this order, to check the plan against the finished a2-2: `text:th:th-gap-recovery-aesop-44`, `text:th:th-gap-recovery-aesop-15`, `text:th:th-gap-recovery-aesop-45`, `text:th:th-gap-recovery-aesop-12`, `text:th:th-gap-recovery-aesop-25`, `text:th:bible-thai-otcv2025-1jn-4`; then, for the b1-bridge, `text:th:bible-thai-otcv2025-luk-15`, `text:th:bible-thai-otcv2025-jhn-4`, `text:th:th-gap-recovery-aesop-41`, `text:th:th-gap-recovery-aesop-37`, `text:th:th-gap-recovery-aesop-24`, `text:th:bible-thai-otcv2025-1jn-1`, `text:th:th-gap-recovery-aesop-33`, `text:th:th-gap-recovery-aesop-23`, `text:th:th-gap-recovery-aesop-17`, `text:th:th-gap-recovery-aesop-35`, `text:th:th-gap-recovery-aesop-19`, `text:th:th-gap-recovery-aesop-30`, `text:th:th-gap-recovery-aesop-42`, `text:th:th-gap-recovery-aesop-22`, then the rest of the fable list in the order of section 5.3. Expect each answer to differ by a few points from the figures here, because the finished units will not reproduce the plan's lists exactly.

## 6. Requests to the Thai session (adapter and lexicon), and words the plan avoids

Nothing in this plan edits `src/adapters/thai`. The plan works without these, with the costs stated; each request removes a cost.

| request | why | cost without it |
|---|---|---|
| `PROPN` entries for the cast: แซม, มะลิ, ต้น (collides with the noun "tree" and the classifier), บอล, แดง, สมชาย | Stage 0's names are ordinary lemmas with 2–3 encounters | up to 3 unknown tokens each in the unit where a name returns; ต้น stays ambiguous |
| compound entries (`THAI_COMPOUNDS`): ศิษยาภิบาล, มิชชันนารี, เยริโค, เอมี่-type names | ICU cuts them into 3–4 junk lemmas | a1-1-11 gets four extra new lemmas (ศิษ, ยา, ภิ, บาล); the plan lists ศิษยาภิบาล as one lemma and flags it |
| `NUM` for ยี่สิบ, สามสิบ … เก้าสิบ and a rule for สิบเอ็ด … | tens are lemmas now | 9 extra lemmas (taught in th-a1-2-11 and th-a2-1-15) |
| lexicon entries for the ICU-unstable everyday loanwords: ซิม, แชท, โอเค, ไซส์, เหรอ | ซิม → ซิ + ม, โอเค → โอ + เค, เหรอ → เห + รอ in context | removed from the plan; use ข้อความ, ตกลง, ใช่ไหม |
| keep the name-guess chunks out of PROPN, or tag them, for the OTCV | 20.7 % of Mark's tokens (15 % more are lexicon names and numerals) | Scripture coverage is read eight points too high; the plan uses the honest figure |
| a rule for ๆ: glued to a lexicon stem (เด็กๆ) it collapses on the stem; glued to any other word it is one unknown lemma; written with a space it is the single lemma ๆ | the Aesop text writes ช้า ๆ with a space and counts ๆ 57 times | the plan teaches ๆ in a1-2-14 and tells writers to glue it to a lexicon word |
| the lexicon's `ที่ + ...` / `หน้า + ที่` (หน้าที่) and ตา + กลม (ตากลม) merges | ICU merges them, wrongly for a beginner | writers must avoid the sequences (section 7) |

Words the plan **avoids** because the adapter splits them wrongly: ซิม, ซิมการ์ด, แชท, โอเค, เหรอ, เอมี่, มาร์ค (stable, but not a Thai name), มิชชันนารี, อีสเตอร์, สะมาเรีย, เยริโค, ฟาริสี, บัพติศมา, อับราฮัม, เปโตร, ดาวิด. A text that needs a Bible name uses a chapter of the OTCV (where the chunk rule keeps it whole) or goes in the b1-bridge after the Thai session has dealt with names.

## 7. The points the gate will trip on, with evidence

All *(measured)* on 2026-10-06 with `adapter-th@3`.

1. **Lemma = ICU token; compounds count as parts.** ศิษยาภิบาล → ศิษ|ยา|ภิ|บาล; มิชชันนารี → มิช|ชัน|นารี; เอมี่ → เอ|มี่; อีสเตอร์ → อีส|เตอร์; ห้างสรรพสินค้า → ห้าง|สรรพ|สินค้า; รถสองแถว → รถ|สอง|แถว; คนขับรถ → คน|ขับ|รถ; ผู้ใหญ่บ้าน → ผู้ใหญ่|บ้าน; เพื่อนบ้าน → เพื่อน|บ้าน; ไม่เป็นไร → ไม่|เป็นไร; ชาวสะมาเรีย → ชาว|สะ|มา|เรีย. Many compounds stay whole (ปวดหัว → ปวด|หัว but ฉีดยา, คนไข้, ทำบุญ, สงกรานต์, ขอบพระคุณ, ผู้ชาย, ผู้หญิง, โรงพยาบาล are single tokens). Consequence: the plan's lists are tokens, a compound's parts must each be on a list, and the writer must read the gate's token list.
2. **Context changes the segmentation.** ตากลม is one token (tā + klom, "to air", not "round eyes"); หน้าที่ merges into one token ("duty") in ไปหน้าที่ตลาด and ผมเห็นหน้าที่; ผมเห็นแชท is fine but แชทกลุ่ม → แช|ทก|ลุ่ม; ซื้อซิมที่ร้าน → ซื้อ|ซิ|ม|ที่|ร้าน; คุณไปเหรอคะ → คุณ|ไป|เห|รอ|คะ. 907 planned lemmas were tested in five neutral frames; those that broke in at least two: ศิษยาภิบาล, ๆ. The test is not a proof for running prose: it says only that ordinary neighbours do not break an ordinary word.
3. **Names are not proper nouns for the gate** (finding 7): แซม → [no candidate], มะลิ → [no candidate], บอล → [no candidate], ต้น → NOUN / CLF; ป้าแดง → ป้า + แดง (so Auntie Daeng's name is the colour red). PROPN in the hand lexicon: ไทย, พระเจ้า, พระเยซู, ยาห์เวห์ and a few more.
4. **Numerals.** หก เจ็ด แปด เก้า สิบ ร้อย พัน หมื่น แสน ล้าน ศูนย์ are NUM; ยี่สิบ, สามสิบ are single tokens with no analysis; ยี่สิบห้า → ยี่สิบ|ห้า; สิบเอ็ด → สิบ|เอ็ด; `10`, `๑๐`, `2025` produce no word tokens.
5. **Particles.** ครับ, ค่ะ, คะ are three lemmas (Stage 0: 77, 30, 11). นะ, สิ, ล่ะ, หรอก, ละ, เถอะ, จ้ะ are separate lemmas, none in Stage 0: the plan teaches นะ in th-a1-1-06, สิ and ล่ะ in th-a1-2-03, หรอก and ละ in th-a2-2-01, เถอะ in th-a2-2-06. เหรอ is unstable. Sentence-final particles followed by a single space end a reading unit in raw paragraphs (`segmentThaiSentences`); a unit document gives its sentences explicitly, so this only matters for chat messages and copied text.
6. **Classifiers** are lemmas (คน, ตัว, อัน, คัน, ใบ, ชิ้น, ขวด, คู่, ชุด, ลูก, เล่ม, ครั้ง, จาน, ชาม, ถุง): each is scheduled before its first use in a counted phrase (the plan places ลูก in a1-1-03, คัน in a1-1-10, ใบ in a1-2-05, ตัว in a1-2-06, ขวด in a1-2-12, คู่ and ชุด in a2-1-05). The homographs (ต้น name / tree / classifier, หลัง "after / back / classifier for houses", ตัว, คน, เรื่อง) share one lemma, so they are known together.
7. **Reduplication** (above): เด็กๆ is one token whose lemma is the stem เด็ก (hand-lexicon stem); ว่าวๆ is one unknown token; เด็ก ๆ (with a space) is เด็ก + ๆ.
8. **Loanwords** are cut unpredictably (examples in item 2). The plan uses only ICU-whole loanwords: โทรทัศน์, โทรศัพท์, คลินิก, วัคซีน, กีตาร์, ธนาคาร, โรงแรม, แท็กซี่ (as รถ + แท็กซี่), เค้ก, ไอศกรีม, เบอร์.
9. **Scripture and the name chunk rule** (finding 5): the OTCV's U+200B marks make any unknown chunk a name guess, hence known; unit documents written for the ladder do not carry U+200B, so the same words (จง, สาวก …) are ordinary lemmas in a ladder unit and *unknown* until taught. A retelling and the original are therefore read differently by the gate: the original looks easier than it is.
10. **The hand lexicon's first sense does not matter to the gate** (the lemma is the surface form), but it matters to the learner: เหนือ, ตกลง, ไว้, ตั้ง, เก็บ have several senses and the lexicon (being extended by the other session) lists a rare one first for some. The plan's lists make no assumption about the sense.
11. **Authentic fables always trip the new-lemma warning** if nothing prepares them (6–8 never-met lemmas per 100 words in a 115–290-word text; error at 9). The plan seeds the words in the two units before each authentic text (one use each, section 3.2: "Seeds").
12. **Polite-particle share** (finding 9) shifts dialogue and narration by a few points; the cliff rule (6 points below the mean of the previous three units) is therefore the check most likely to fire between a dialogue unit and a narration unit. The plan's largest estimated drop below the mean of the previous three units is 5.6 points (at th-a2-1-01); the gate warns above 6 and errors above 12. If a finished unit fires, move one new word to the neighbouring unit.

## 8. Under-specified, risky, or decided by someone else

1. **The b1-bridge is a brief, not a unit plan** (section 5): the fourteen mission-life units are described by domain only; it cannot be completed before a2-2 exists and is measured.
2. **a1-1 units 01–09 depend on a decision about Stage 0.** If two scenes are added that use the 36 under-met lemmas, the 45 top-up tokens disappear, units 01–02 reach about 92 % and the budgets of 01–06 can rise by one or two lemmas each. If not, units 01–02 sit at 87–88 % (inside the lower band) and 03–09 at 88–92 %.
3. **Everything is planned near the 88 % line and the estimates are arithmetic.** They assume that the adapter reads every listed word as the planned token(s). Known traps: names (section 7, item 3), ๆ, ศิษยาภิบาล, the sequences หน้า + ที่ and ตา + กลม, loanwords. A unit that uses one extra new word, or one new lemma fewer than three times, drops below its estimate by 1.0–1.5 points per 300 words.
4. **Recycling is dense** (up to 9.0 per 100 words). Some pairings are awkward (a clothes adjective in a hospital unit); the writer may use any of the three slots in any order and may move a word to the unit with the nearest theme, telling the plan owner.
5. **Authentic placements are modelled, not verified.** They depend on the finished units, on the OTCV name rule and on the lexicon changes under way. Re-run section 5.6 as soon as units exist. The numbers for Scripture (honest reading) may rise when the other session stops the name guesses from counting as known: then the *gate* reading will fall to the honest one, and some chapters that look placeable today will warn.
6. **Native review.** Every sentence is machine-drafted. The review checklist (naturalness, contemporary usage, register, grammatical correctness, dialect appropriateness, sounds, cultural oddities, unnatural simplification) needs a native Thai reviewer, preferably from Chiang Mai (the plan uses Central Thai with Chiang Mai scenes). Points the reviewer should see first: the polite-particle choices (section 2.4, item 4), the kin terms (ป้า, ลุง, ยาย), the Thai clock (โมง, ทุ่ม, ตี) in a1-1-07 and a1-2-05, the prices, Auntie Daeng's register with Sam, the neighbours' temple scenes, the written register of the report and the letter in a2-2, and every adapted fable.
7. **Religion and culture.** The neighbours' temple, merit-making, monks, Songkran and Loy Krathong are described by their neighbours, respectfully and factually; the unit texts never praise or criticise Buddhism, never use missionary pressure language, and the units' Scripture and testimony material stays in the church and testimony domains. The owner and a Thai Christian reviewer should read the plan's situation lines for this before any unit is drafted.
8. **Rights.** The adapted fables derive from a transcription under CC BY-SA 4.0 of a public-domain 1956 translation: attribution and share-alike apply to the derivative; the owner must decide whether adaptation is allowed and how it is labelled ("adapted from the library text", not "native text"). OTCV chapters carry CC BY-SA 4.0 attribution. THSV11 is never used. The three Scripture retellings are original course text.
9. **Audio.** GoListen is deferred to V2; the `audio-ready` and `published` states are unreachable for ladder units until it returns; every unit is written to be recordable in one sitting.
10. **Domain gaps.** Food and family appear as domains only in a1-1 (and as topics elsewhere); relabel th-a2-2-05 (phone call home) and th-a2-2-01 if the owner wants them as domains in a2-2. Home and travel are over-weighted in a1-1; correspondence, instructions and testimony are the main a2 additions.
11. **This plan is prose.** The Thai session should turn the unit blocks into `ladder.json` entries plus a per-unit allowed-lemma list (Stage 0 + all earlier lists + the unit's own + seeds) so that writers and the gate read the same data; hand-copying 907 lemmas will introduce errors. The block data (new lemmas, top-up, seeds, recycle) are generated from one table and can be regenerated.
