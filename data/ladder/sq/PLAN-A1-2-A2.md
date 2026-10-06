# Albanian ladder — vocabulary and unit plan (a1-2 … a2-2, with the b1-bridge brief)

Planning document for the continuation of `data/ladder/sq/ladder.json` (contract: `docs/LADDER.md`; worked example: `data/ladder/es/PLAN.md`), written 2026-10-06 by the Albanian ladder planner. Writers draft the units from it later; **nothing here is reviewed by a person** (every gloss, every form in section 6 and every word marked `+` needs the Albanian session and a native reviewer). Figures marked *(measured)* were produced on 2026-10-06 with the real Albanian adapter (`adapter-sq@7`, `createAdapterRegistry`) on the working tree, the way the gate reads units: the first reading of each word, its lemma (an articulated adjective under "i X"), proper nouns and numerals known. Figures marked *(estimated)* come from a simulation described where it is used (section 5.1); they are arithmetic on the plan, not measurements of texts that do not exist yet. The planning scripts were scratch files and are not in the repository; the plan below is the data.

## 0. Summary and the findings that shape the plan

| | a1-2 | a2-1 | a2-2 | total |
|---|---:|---:|---:|---:|
| units (core + volume) | 25 (23+2) | 18 (16+2) | 20 (13+7) | 63 (52+11) |
| words per unit | 220–640 | 650–980 | 900–1280 | |
| running words | 11,240 | 15,140 | 21,800 | 48,180 |
| new lemmas scheduled | 275 | 316 | 273 | 864 |
| of which the word list does not yet have (section 6) | 58 | 90 | 123 | 271 |
| new lemmas per 100 words | 2.45 | 2.09 | 1.25 | 1.79 |
| lemmas known at the end of the stage (≥ 3 encounters) | 468 | 784 | 1,057 | 1,057 |
| planned coverage, word-weighted mean (lowest unit) | 91.8 % (91.0) | 93.5 % (92.0) | 95.8 % (93.4) | 94.1 % |
| heaviest recycling load (tracked lemmas per 100 words) | 8.1 | 7.7 | 6.1 | |
| Scripture-domain share of the stage | 0.0 % | 0.0 % | 0.0 % | 0.0 % |

*Core* units carry the vocabulary and the construction; *volume* units ("vol") are the ones whose new-lemma load is low (≤ 2.0 per 100 words in a1-2, ≤ 1.5 in a2-1, ≤ 0.95 in a2-2): they give recycling, domain variety and length. Together with a1-1 (3,651 words) the A1 stages come to 14,891 words, just under the 15–30 k that `docs/LADDER.md` calls indicative; a1-1, a1-2, a2-1 and a2-2 together are 51,831 words.

Findings, in the order they matter:

1. **The word list is the binding constraint, not the vocabulary budget.** The adapter knows 905 content lexemes (463 nouns, 45 names, 224 verbs, 113 adjectives, 60 adverbs) and 164 function-word lexemes. A word it does not know has *no reading at all*: its citation form comes back empty and every inflected form of it is, for the gate, a different unknown "lemma". Of the 864 lemmas scheduled, 593 are already in the word list and **271 are not** (58 in a1-2, 90 in a2-1, 123 in a2-2; section 6.1 gives each with part of speech, gender or class, the forms the engine needs, and a gloss). A stage's additions must be accepted, and pass `sq:agreement` / `sq:check-texts`, before its first unit is drafted; the first two additions are needed by unit sq-a1-2-04 (`zakonisht`, `herë`). All names the plan uses are already in the word list (Sam, Ana, Luan, Drita, Ardi, Elira, Dritan, Mira, Gjergj, Pjetër, Arta). A name that is not in the list gets no reading and counts as a new unknown word every time (measured: Agim, Besa, Arben, Teuta, Pogradec, Dajti, Skënderbeu).
2. **The coverage rule sets the vocabulary budget, and articulated adjectives cost double.** A lemma is known only after three earlier encounters, so the three uses of each new lemma in its own unit are three unknown tokens. In Albanian a new adjective, ordinal or possessive written with its linking article ("e madhe", "e saj", "i dytë") costs *six*: the article token carries the unit's lemma too (measured: `e madhe` → `i madh` on both tokens). Expected coverage of a unit is therefore about 1 − (3 × W + top-up tokens) / words, where W counts every new "i X" lemma twice. The plan keeps every unit at ≥ 91 % (a1-2), ≥ 92 % (a2-1) and ≥ 93 % (a2-2) *(estimated, "est. cov." in the tables)*, so that the unscheduled words every real text needs (the Spanish rewrite's lesson) have 3–5 points of room before the 88 % warning line. 70 of the 864 new lemmas are articulated adjectives, possessives or ordinals; no unit has more than 7 of them.
3. **Rates.** New lemmas per 100 words: 2.45 in a1-2, 2.09 in a2-1, 1.25 in a2-2, 1.79 overall (the contract's warning line is 5, which would land at about 85 %, the error line). a1-2 is dense on purpose: it has to give 275 lemmas to a learner who has 175, so it has only 2 volume units; a2-2 is the light stage (1.25 per 100), and its units are the place to add unscheduled words naturally.
4. **Where the library stands (measured, then estimated).** After Stage 0 and all of a1-1 only 45.5 % of the library's running words are known (strict reading; the lemma of each word's first reading must have been met three times). At the end of a2-2 the plan reaches **73.8 %** on the same strict reading, **81.1 %** if capitalised unknown words (names, places: 1,878 tokens, 7.6 % of the library) count as proper nouns and Roman numerals as numerals, and **85.6 %** if the 182 words of the b1 list (section 6.2) are taught as well. Only three very short texts reach 92 % at the end (Durrës — Klima, Tirana — Institucione e Tiranës, Durrës — Gjeografia); the nearest sizeable ones are Shqipëri — Relievi (89.6 %, 240 words), Tirana — Demografia (87.8 %, 270 words), Shqipëri — Klima (86.9 %, 99 words). Reading the whole library comfortably needs about **602 more lemmas for 92 % and 1080 for 95 %** (section 5.1): at two new lemmas per 100 words that is 30–54 k words, the whole of the contract's b1-bridge with nothing to spare.
5. **No text of the library is a ladder text before the b1-bridge, and a large share of its tokens has no reading.** The adapter alone gives no reading to 23.9 % of the library's tokens (measured: 4.5 % proper nouns and numerals, 60.7 % read from the word list, 10.9 % read by rule from the ending, 23.9 % no reading); with the installed dictionary the brief puts the share at 12–19 %. Section 6.3 lists the three cheap fixes that would move the numbers most: capitalised unknown words as unconfirmed proper nouns, Roman numerals as numerals, abbreviations (`km`, `m`, `shek`, `etj`, `p.e.s`) as known tokens.
6. **Scripture is absent, not a domain here.** No Albanian Bible text is available; nothing in the plan quotes, paraphrases or retells a passage. Church life (the congregation, the pastor, the sermon, prayers and blessings as customs) and testimony are domains of their own: 5,960 words, 12.4 % of the new stages, all written in the course's own plain sentences with no Bible quotation and flagged `needs-theological-review`. The Scripture share is 0.0 % in every stage; if the owner supplies a rights-cleared Albanian text the 40 % ceiling leaves plenty of room.
7. **Adapter traps the gate and the writers will meet** (section 7 has the list): `Drita`, `Mira` and `Luan` read first as `dritë`, `i mirë` and `luaj`; `para` (money) reads as `i parë`; `më dhemb` reads `dhemb` as `dhëmb` (tooth); the aorist of non-active verbs (`mbeti, uli, ula, lindi, linda, ndodhi, nisëm`) has no reading; `u` before a verb often reads as `ai`; every `i X` adjective counts on two tokens. Constructions the detector cannot see: the aorist and the imperfect (the two tenses the plan teaches most), the dative, the imperative of ordinary verbs, `mos u …`.
8. **The ramp.** a1-1's units are 30–70 words (mean sentence 4.6 words); the plan starts a1-2 at 220 words (4 new lemmas) and reaches 640 by the end of the stage, a2-1 starts at 650 and a2-2 at 900 (ceiling 1,280, one sitting of recording). The first four units (220–300 words) soften the step from 50-word texts; a first unit of 400 words would be a jump of eight.

## 1. The starting point: what Stage 0 and a1-1 give

### 1.1 Size and cast

Stage 0 (`data/stage0/sq/`, machine-drafted, unreviewed): 19 scenes (and 4 review steps that re-read scenes), 23 head texts for the gate, 624 words counting the re-readings, 96 lemmas, 9 constructions *(measured)*. a1-1 (`data/ladder/sq/`): 72 units, 52 written for the ladder (`authoring/a1.txt`, ids `sq-a1-1-h01 … h52`) and 20 Udha / Misioni course texts placed in place, 3,651 words, 921 sentences in all, mean 4.6 words per sentence; all machine drafts. After Stage 0 and all of a1-1 a learner has met **4,160 running words** (4,275 counting the review re-readings), **193 lemmas** (names and numerals excluded; 208 with the 15 names, 100 numeral tokens), of which **175 met three times or more** and **18 once or twice**. `npm run ladder:check -- sq` today: 0 errors, 65 warnings (coverage 18, new-lemma rate 15, cliffs 6, recycling 26).

Cast (Stage 0 world plus the a1-1 additions): **Sam** (the newcomer, the learner's stand-in), **Ana** (nurse at the clinic), **Luan** (teacher, Ana's brother), **Drita** (grandmother, sells bread at the market, goes to church; the "gjyshja"), **Ardi** (her grandson, ten), **Elira** (Ardi's friend), **Dritan** and **Mira** (neighbours; Mira works at Luan's school), **Gjergj** (their son, a pupil), Ardi's grandfather in the village. The Udha drafts have a second Ana (Beni's sister) and a Beni; keep Beni out of the new units. New cast, all already in the word list: **Pastor Pjetër**, **Dr Arta** (Ana's colleague). Unnamed roles (the seller, the driver, a landlord, a manager) stay unnamed. a1-1 has 5 church-domain units (and several narrative ones set in church); the plan keeps the church as one domain among many.

### 1.2 Lemmas *(measured)*

**Met three times or more (175; known to the gate from unit 01):** jam (301), ai (201), në (199), dhe (114), kam (92), i mirë (86), shumë (72), pi (70), shkoj (68), kafe (66), bukë (59), shtëpi (54), nuk (53), lexoj (53), gjyshe (52), të (50), i lodhur (50), i lumtur (50), unë (47), libër (47), dua (45), sot (43), me (43), shkollë (39), pastaj (39), po (38), a (37), ky (33), them (33), i (31), faleminderit (30), kishë (28), nënë (28), gjysh (28), i madh (26), çaj (26), ujë (24), oriz (23), kuzhinë (22), për (22), i bukur (22), pëlqej (21), dhomë (20), flas (20), ha (20), i vogël (20), por (18), rrugë (18), pak (18), shqip (18), jap (18), nga (18), pyes (18), çantë (17), tavolinë (17), këtu (17), kushtoj (16), i ri (16), edhe (15), treg (15), diel (15), mund (15), përshëndetje (14), ju (14), ti (14), jetoj (14), i gjatë (14), mollë (14), çfarë (13), klinikë (13), baba (13), mace (13), çdo (13), gëzohem (12), ku (12), ditë (12), njeri (12), i vjetër (12), im (11), mbi (11), lutem (11), fshat (11), bibël (11), quhem (10), mirëmëngjes (10), mësues (10), blej (10), jo (9), di (9), ja (9), si (9), punoj (9), ne (9), laj (9), vij (9), perëndi (9), natë (9), sa (8), mirëdita (8), shi (8), te (8), tani (8), qen (8), mësoj (8), djathë (8), i tij (8), familje (7), dritare (7), shkruaj (7), bëj (7), ulem (7), fëmijë (7), luaj (7), mendoj (7), besoj (7), vëlla (6), motër (6), përse (6), lek (6), nesër (6), kush (6), mëngjes (6), njoh (6), se (6), i kuq (6), këndoj (6), dëgjoj (6), letër (6), i dashur (6), buzëqesh (6), fle (6), shes (5), xhaketë (5), sepse (5), nxënës (5), yt (5), djalë (5), vajzë (5), qumësht (5), herët (5), darkë (5), bir (5), histori (5), çelës (4), dritë (4), dëshiroj (4), drekë (4), zgjoj (4), burrë (4), verë (4), sjell (4), bie (4), dal (4), gjithë (4), dje (4), pjatë (4), bashkë (4), mëkat (4), vesh (3), përgatis (3), që (3), gjej (3), shoh (3), hyj (3), grua (3), shitës (3), shikoj (3), marr (3), filloj (3), kuptoj (3), dashuri (3), pas (3), diçka (3), vdes (3), më (3).

**Met once or twice (18; need top-up):** gjithashtu (2), llambë (2), autobus (2), vonë (2), le (2), sallatë (2), asgjë (2), do (2), fjalë (2), punë (2), ynë (2), u (2), ringjallem (2), kohë (2), cili (1), shok (1), juaj (1), zot (1).

Basic numbers (1–100, hundreds, 1,000) are numerals and free for the gate; the plan teaches them on the way: ages and the hour (a1-2-02, a1-2-05), prices (a1-2-09), years and dates (a1-2-23, a2-2-02).

### 1.3 Constructions *(measured)*

The adapter's `detectPatterns` knows 31 constructions. a1-1 has met **19**: from Stage 0 `non-active-present`, `definite-noun-ending`, `possessive-after-noun`, `negation-nuk`, `question-a`, `object-pronoun-before-verb`, `linking-article-adjective`, `subjunctive-te`, `nominative-after-preposition`; in a1-1 `genitive-linking-article` (h07), `clitic-doubling` (udha-1-01), `progressive-po` (misioni-1-01), `clitic-cluster` (udha-1-02), `future` (h27), `modal-te` (h34), `ablative-after-preposition` (h40), `perfect` (udha-1-07), `non-active-u` (h50), `purpose-per-te` (h52). Several are barely met (`perfect`, `progressive-po` in one text; `future`, `non-active-u`, `purpose-per-te` in two; `clitic-cluster` four; `ablative-after-preposition` three). Twelve remain: `negation-mos`, `comparative`, `pluperfect`, `superlative`, `gerund-duke`, `relative-clause`, `imperative-pronoun`, `conditional`, `optative`, `without-pa` (all ten are taught below), and `admirative`, `as-soon-me-te` (left to the b1-bridge, receptive). Verb forms met: present of about 55 verbs (mostly 3rd person), a handful of aorists (`shkova, mësova, shkrova, buzëqeshi, vdiq, dha`), one imperfect (`ishte`), one perfect (`kam bërë`), `do të` + subjunctive; no pluperfect, no comparison, no imperative except `hyr, hyni, ulu, uluni, pyet`.

### 1.4 What a1-1 does not give, and the top-up

Not met at all: the aorist as a narrative tense (a1-2-18 teaches it), the imperfect, the days of the week except `e diel`, the months, all colours but `i kuq`, the body, the clock, `kur`, `pse` (only `përse`), `mos`, `duke`, `ose`/`apo`, prepositions beyond `në, nga, te, me, për, mbi, pas`, the verbs `ec, rri, lë, vë, zë, kërkoj, tregoj, ngre, hap, mbyll, pres`, the whole vocabulary of town, travel, health, clothes, work and school. **a1-2-01 to a1-2-04 therefore teach time, frequency and the days before anything else.**

Top-up (these a1-1 lemmas are used in the stated unit exactly the stated number of times; each token is unknown to the gate): **a1-2-01** shok×2, punë, kohë, do, zot×2 (7 tokens); **a1-2-02** autobus, vonë, llambë, ringjallem (4); **a1-2-03** sallatë, asgjë, gjithashtu (3); **a1-2-04** ynë, juaj×2 (3); **a1-2-05** le, fjalë (2); **a1-2-06** cili×2, u (3). Total 22 tokens, 18 lemmas. After the first use a lemma met twice is known (three earlier encounters); the lemmas met once need two uses in the same unit.

The **a1-1 tail** is a gate matter, not a coverage one: the last six a1-1 units' new lemmas should come back three times within the next six units, which now reach into a1-2. Measured deficits: `vdes` (needs 1 more), `ynë` (2), `u` (2), `ringjallem` (2), `më` (1), `zot` (3), `kohë` (2), `mëkat` and `diçka` (already flagged for h48, whose window closed inside a1-1). The top-up above covers `ynë, u, ringjallem, zot, kohë` in a1-2-01 to a1-2-06; `vdes` fits a1-2-05 (family) and `më` any comparison. Treat the rest as advice: a warning is not a target.

## 2. Targets per stage

### 2.1 Table

| stage | units | words / unit | stage words | core words | volume words | new lemmas | new / 100 | known at end | lowest est. cov. | Scripture share |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| a1-2 | 25 (23+2) | 220–640 | 11,240 | 10,040 | 1,200 | 275 | 2.45 | 468 | 91.0 % | 0.0 % |
| a2-1 | 18 (16+2) | 650–980 | 15,140 | 13,310 | 1,830 | 316 | 2.09 | 784 | 92.0 % | 0.0 % |
| a2-2 | 20 (13+7) | 900–1280 | 21,800 | 13,760 | 8,040 | 273 | 1.25 | 1,057 | 93.4 % | 0.0 % |

### 2.2 Constructions: the sequence and where the adapter can see it

Order of teaching (the contract asks for present → future → past → … and the Albanian course catalogue for the stage each pattern belongs to; this is the order in which the plan's units need them). "no key" means no `detectPatterns` key fires, so the gate's "constructions first met" column stays empty; each key was tested on a sentence on 2026-10-06.

| order | construction | adapter key | taught in | note |
|---|---|---|---|---|
| 1 | present, all persons; `duhet të`, `mund të`, `dua të` | `modal-te`, `subjunctive-te` | a1-2-01 … 04, 15 | the present of every listed verb: 1st and 2nd person are new in volume |
| 2 | days, hour, frequency, `kur` / `pse` | — no key | a1-2-01 … 04 | time words are numerals and adverbs |
| 3 | genitive, `i saj` / `i tyre`, ages | `genitive-linking-article`, `possessive-after-noun` | a1-2-05 | `babai i Anës`, `shtëpia e tyre` |
| 4 | place prepositions with the ablative (`nën`, `pranë`, `brenda`) | `ablative-after-preposition` | a1-2-06 | `pranë derës` |
| 5 | adjective agreement in gender and number (colours, sizes, prices) | `linking-article-adjective` | a1-2-08, 09 | each new adjective costs six unknown tokens |
| 6 | comparison: `më i lirë`, `më … se`, `sa … aq` | `comparative` | a1-2-09, 25 | superlative later |
| 7 | imperatives, `mos` + imperative, directions | `negation-mos`, `imperative-pronoun` | a1-2-12, 13, 15, 24 | `mos u …` (reflexive) has no key |
| 8 | future `do të` (systematic) | `future` | a1-2-14 | `do të punonte` fires `conditional` by mistake (the detector reads `do të` + imperfect as the conditional) |
| 9 | object pronouns, clitic doubling, indirect object | `object-pronoun-before-verb`, `clitic-doubling` | a1-2-11, 17 | the dative has no key |
| 10 | progressive `po` | `progressive-po` | a1-2-16 | |
| 11 | aorist: active (regular, then the common irregulars), then `u` + aorist | no key; `non-active-u` fires on `u ul` | a1-2-18 (first), 19, 23; a2-1-01 … | the tense the plan teaches most has no detector; non-active aorists are unreadable (section 7) |
| 12 | perfect `kam shkruar` | `perfect` | a1-2-20, a2-1-12 | participles read as adjectives (`i hapur`) out of context |
| 13 | relative clause with `që` | `relative-clause` | a1-2-21, a2-1-08, 11 | `i cili` stays receptive (a2-2) |
| 14 | impersonal non-active in instructions (`bëhet`, `piqet`) | `non-active-present` | a1-2-24 | |
| 15 | imperfect: habit and description; imperfect vs aorist | no key | a2-1-01 … 04 | |
| 16 | `duke` + participle | `gerund-duke` | a2-1-04, 12, a2-2-04 | |
| 17 | formal requests with `ju`; conditional set phrases (`do të doja`) | `conditional` | a2-1-05, 10; a2-2-01, 13 | |
| 18 | imperatives with short pronouns (`hape`, `ruaje`), clitic clusters (`ma`, `ia`), purpose `për të` | `imperative-pronoun`, `clitic-cluster`, `purpose-per-te` | a2-1-06 | |
| 19 | descriptive non-active (`ndodhet`, `quhet`, `njihet`, `shtrihet`) | `non-active-present` | a2-1-08, 14, 17, a2-2-16 | the register of the library's nonfiction |
| 20 | pluperfect | `pluperfect` | a2-2-03, 04 | |
| 21 | superlative: `shoku më i mirë` | `superlative` | a2-2-07 | |
| 22 | `pa` + participle | `without-pa` | a2-2-14 | |
| 23 | optative in blessings and wishes, receptive | `optative` | a2-2-11 | `Zoti të ruajtë!` is not detected |
| 24 | left to the b1-bridge: `me të` + participle, admirative (`qenka`), the dative systematically | `as-soon-me-te`, `admirative` | b1 | receptive; the library uses them rarely |

Formulaic forms appear before they are taught (`faleminderit`, `ju lutem`, `mirë se vini`, `s'ka përse`, `ja`, `hyr`, `ulu`) and are never explained as paradigms.

### 2.3 Domain mix (running words)

| domain | a1-2 | a2-1 | a2-2 |
|---|---:|---:|---:|
| conversation | 1,550 (14 %) | 850 (6 %) | 2,060 (9 %) |
| narrative | 4,570 (41 %) | 3,890 (26 %) | 3,260 (15 %) |
| description | 1,020 (9 %) | — | — |
| practical | 1,310 (12 %) | 1,620 (11 %) | 2,980 (14 %) |
| health | 460 (4 %) | — | — |
| correspondence | 540 (5 %) | 780 (5 %) | 2,180 (10 %) |
| church | 560 (5 %) | 940 (6 %) | 1,100 (5 %) |
| biography | 590 (5 %) | 880 (6 %) | 1,080 (5 %) |
| instructions | 640 (6 %) | 770 (5 %) | — |
| explanation | — | 2,590 (17 %) | 3,280 (15 %) |
| nonfiction | — | 1,880 (12 %) | 3,440 (16 %) |
| testimony | — | 940 (6 %) | 2,420 (11 %) |
| scripture | — | — | — |

"Church" and "testimony" are the congregation, the pastor, prayer and blessing, and a person's own story of faith; none of it quotes Scripture. They are 12 % of the new stages. The domains the ladder is thin on in a1-1 (explanation, instructions, nonfiction, biography, correspondence) are all present from a1-2.

### 2.4 What every unit must obey

1. **Budget.** Introduce exactly the new lemmas listed, each exactly three times; use no lemma outside Stage 0, a1-1's 193, the earlier units' lists and the unit's own list (plus the top-up and recycle lists). Inflected and fused forms of a listed lemma are free; a word the adapter cannot read as a listed lemma counts as unknown. Lemmas written with the article (`i saj`, `i bardhë`) must have all their tokens, article included, counted in the three uses. A function word listed as new (kur, pse, mos, nën …) is used three times like any other.
2. **Recycle.** Use every lemma of the unit's "recycle" list at least once (section 3.2 gives each unit's list; the pairing is by theme and load, not by meaning: where a list reads absurdly, move the word to the nearest unit in the same window and tell the plan owner). Function words are exempt from recycle slots.
3. **Allowance.** The scheduled list is an agenda, not a ceiling. A text that needs an ordinary word the plan has not scheduled may use it (at most 1.0 per 100 words in a1-2, 1.5 in a2-1/a2-2, each used three times if it can be); never pad a unit with known words to stay above a warning. The measured new-lemma rate of a drafted unit is what the owner reads, not this plan's.
4. **Forms.** Every form must pass `npm run sq:check-texts` (known to the word list and the analyzer, sources agreeing). The first aorist, imperfect, non-active and nonfiction forms will not all pass: list the failures for the Albanian session rather than avoiding the words (the same lesson as the Spanish plan).
5. **Variety and register.** Standard Albanian (Tosk-based standard, 1972 spelling, `ë` and `ç` always written; no Gheg forms). `ti` for family, friends and children; `ju` (singular, polite) for older or unknown people, the pastor, officials; plural `ju`. Albanian address names: first names, `gjyshe` / `gjysh`, `zonja`, `Zoti` for the Lord only in church units. Words of Tirana (`furgon`, `byrek`, `bashki`) only where listed.
6. **Names, numerals.** Names from the cast are free; numerals are free and are taught on the way (the hour a1-2-02, ages a1-2-05, prices a1-2-09, years a1-2-23, centuries a2-1-14, dates a2-2-02).
7. **Sentence length.** Mean ≤ 7 words in a1-2 (a1-1: 4.6), ≤ 10 in a2-1, ≤ 13 in a2-2; one finite clause per sentence until a1-2-21 (relative clauses), then two.
8. **Domains.** Follow the unit's domain; keep the cast; texts are for adults on a mission team except the Ardi units, which stay short and concrete.
9. **Provenance.** Each unit is a `controlled` document under `data/ladder/sq/units/`, corpus id `ladder-sq`, `pipeline.state: "machine-draft"` (a tool, never a reviewer), an English line for every sentence; Albanian usage points and every fact in a nonfiction or biography unit (Mother Teresa, Tirana, Albania, dates) are listed in the unit's notes for the reviewer; church units carry the `needs-theological-review` tag.
10. **Authoring files.** `scripts/sq-ladder-build.mts` reads only `authoring/a1.txt`; it must read `a1-2.txt`, `a2-1.txt` and `a2-2.txt` (or every `a*.txt`) before the first unit is drafted, with headers `# sq-a1-2-01 | a1-2 | conversation | dialogue | Një telefonatë`. The ids below continue the existing scheme `sq-<stage>-<nn>`; the a1-1 ids with `h`, `udha-` and `misioni-` are untouched.

## 3. The units

### 3.1 Table

"New" counts include words to add (`+`). "Est. cov." = 1 − (3 × W + top-up) / words, W counting each `i X` lemma twice *(planned, not measured)*. `#` is the position in the whole ladder (a1-1 occupies 1–72). "core" and "vol" are this plan's labels; every unit is `kind: "controlled"` in `ladder.json`, e.g. `{ "id": "sq-a1-2-01", "stage": "a1-2", "kind": "controlled", "document": "units/sq-a1-2-01.json", "domain": "conversation", "title": "Një telefonatë" }`; the b1-bridge adds `adapted` and `authentic` units.

| id | # | kind | words | domain | title | new | / 100 | est. cov. | main construction |
|---|---:|---|---:|---|---|---:|---:|---:|---|
| sq-a1-2-01 | 73 | core | 220 | conversation | Një telefonatë (A phone call) | 4 | 1.8 | 91 % | present tense, all six persons, in a short phone conversation |
| sq-a1-2-02 | 74 | core | 240 | narrative | Një ditë te Drita (A day at Drita's) | 5 | 2.1 | 92 % | telling the hour (ora është tre, në orën shtatë) |
| sq-a1-2-03 | 75 | core | 280 | narrative | Java e Samit (Sam's week) | 6 | 2.1 | 93 % | days of the week with the definite accusative (të hënën, të martën) |
| sq-a1-2-04 | 76 | core | 300 | narrative | Çfarë bën zakonisht? (What does he usually do?) | 8 | 2.7 | 91 % | frequency adverbs (gjithmonë, shpesh, rrallë, zakonisht) |
| sq-a1-2-05 | 77 | core | 390 | description | Familja e Anës dhe e Luanit (Ana and Luan's family) | 9 | 2.3 | 91 % | possessive i saj / i tyre; genitive with the linking article (babai i Anës) |
| sq-a1-2-06 | 78 | core | 370 | conversation | Shtëpia e Samit (Sam's home) | 10 | 2.7 | 91 % | place prepositions with the ablative (nën tavolinë, pranë dritares) |
| sq-a1-2-07 | 79 | core | 340 | narrative | Macja e humbur (The lost cat) | 7 | 2.1 | 94 % | recycling of rooms and places |
| sq-a1-2-08 | 80 | core | 440 | practical | Në dyqan (At the clothes shop) | 10 | 2.3 | 91 % | linking article + adjective, all genders (një këmishë e bardhë, këpucë të zeza) |
| sq-a1-2-09 | 81 | core | 370 | practical | Sa kushton? (How much is it?) | 9 | 2.4 | 91 % | prices in lek and euro, numbers to 1,000 (free for the gate) |
| sq-a1-2-10 | 82 | core | 380 | narrative | Në treg me Dritën (At the market with Drita) | 8 | 2.1 | 94 % | recycling of food, prices and colours |
| sq-a1-2-11 | 83 | core | 470 | conversation | Në restorant (At the restaurant) | 12 | 2.6 | 91 % | polite requests: a mund të … ? / do të dëshiroja (as a set phrase) |
| sq-a1-2-12 | 84 | core | 500 | practical | Me autobus në qendër (By bus to the centre) | 14 | 2.8 | 91 % | imperatives (singular and plural), mos + imperative |
| sq-a1-2-13 | 85 | core | 420 | narrative | Sam humbet rrugën (Sam loses his way) | 12 | 2.9 | 91 % | directions (djathtas, majtas, drejt) |
| sq-a1-2-14 | 86 | core | 540 | narrative | Një ditë në mal (A day in the mountains) | 14 | 2.6 | 91 % | future with do të (systematic) |
| sq-a1-2-15 | 87 | core | 460 | health | Te mjeku (At the doctor's) | 12 | 2.6 | 92 % | më dhemb + body part; duhet të |
| sq-a1-2-16 | 88 | core | 470 | narrative | Ardi është i sëmurë (Ardi is ill) | 11 | 2.3 | 91 % | recycling of the body and the clinic |
| sq-a1-2-17 | 89 | core | 490 | conversation | Një mesazh, një telefonatë (A message, a phone call) | 14 | 2.9 | 91 % | short object pronouns, indirect object (i dërgoj një mesazh) |
| sq-a1-2-18 | 90 | core | 510 | narrative | Çfarë bëre dje? (What did you do yesterday?) | 14 | 2.7 | 92 % | aorist, first and third person singular, regular (-oi, -ova) |
| sq-a1-2-19 | 91 | core | 520 | narrative | Një ditë në fshat (A day in the village) | 12 | 2.3 | 93 % | aorist narration (3rd person singular and plural) |
| sq-a1-2-20 | 92 | core | 540 | correspondence | Një letër nga Tirana (A letter from Tirana) | 15 | 2.8 | 92 % | present perfect (kam shkruar, ke parë) |
| sq-a1-2-21 | 93 | core | 560 | church | E diela në bashkësi (Sunday with the congregation) | 15 | 2.7 | 92 % | relative clause with që (njerëzit që këndojnë) |
| sq-a1-2-22 | 94 | vol | 570 | narrative | Pas shërbimit (After the service) | 10 | 1.8 | 95 % | hospitality phrases (mirë se vini, ju lutem, urdhëroni) |
| sq-a1-2-23 | 95 | core | 590 | biography | Jeta e gjyshes Drita (Grandmother Drita's life) | 16 | 2.7 | 92 % | aorist narration of a life (lindi, u martua, punoi) |
| sq-a1-2-24 | 96 | core | 640 | instructions | Si bëhet byreku (How byrek is made) | 17 | 2.7 | 91 % | plural imperatives and mos |
| sq-a1-2-25 | 97 | vol | 630 | description | Tirana dhe fshati (Tirana and the village) | 11 | 1.7 | 91 % | comparative with më … se; sa … aq |
| sq-a2-1-01 | 98 | core | 650 | narrative | Kur isha i vogël (When I was small) | 14 | 2.2 | 94 % | imperfect (isha, kisha, luaja, shkonim): habit and description in the past |
| sq-a2-1-02 | 99 | core | 720 | explanation | Fshati para dhe tani (The village then and now) | 18 | 2.5 | 92 % | imperfect and present contrasted (dikur … tani) |
| sq-a2-1-03 | 100 | core | 690 | narrative | Rrëfimi i gjyshit natën (Grandfather's tale at night) | 12 | 1.7 | 94 % | aorist and imperfect in a story |
| sq-a2-1-04 | 101 | core | 830 | narrative | Nata e stuhisë (The night of the storm) | 21 | 2.5 | 92 % | aorist vs imperfect in one narrative (po flija kur …) |
| sq-a2-1-05 | 102 | core | 750 | practical | Në postë dhe në bankë (At the post office and the bank) | 19 | 2.5 | 92 % | formal requests with ju (mund të më ndihmoni?) |
| sq-a2-1-06 | 103 | core | 770 | instructions | Si ta përdorim kompjuterin (How to use the computer) | 16 | 2.1 | 94 % | imperatives with short pronouns (hape, ruaje, dërgoje) |
| sq-a2-1-07 | 104 | core | 780 | correspondence | Mesazhet e grupit (The group messages) | 15 | 1.9 | 94 % | short written messages, abbreviations, greetings |
| sq-a2-1-08 | 105 | core | 900 | nonfiction | Tirana — qyteti ku jetoj (Tirana — the city where I live) | 23 | 2.6 | 92 % | present-tense description with passive sense (ndodhet, quhet, njihet) |
| sq-a2-1-09 | 106 | core | 830 | narrative | Dita e shkollës (The school day) | 19 | 2.3 | 92 % | full past narrative with the three pasts |
| sq-a2-1-10 | 107 | core | 850 | conversation | Një intervistë pune (A job interview) | 13 | 1.5 | 95 % | formal questions and answers |
| sq-a2-1-11 | 108 | core | 870 | practical | Puna e Anës në klinikë (Ana's work at the clinic) | 20 | 2.3 | 93 % | relative clauses with që and cili |
| sq-a2-1-12 | 109 | core | 880 | biography | Luani, mësuesi (Luan the teacher) | 19 | 2.2 | 94 % | perfect and aorist together in a biography |
| sq-a2-1-13 | 110 | vol | 890 | narrative | Një ditë në Durrës (A day in Durrës) | 8 | 0.9 | 97 % | aorist narration of a trip |
| sq-a2-1-14 | 111 | core | 910 | explanation | Qytetet e Shqipërisë (The towns of Albania) | 22 | 2.4 | 93 % | descriptive present with ndodhet, shtrihet, njihet |
| sq-a2-1-15 | 112 | core | 940 | testimony | Si erdha në Shqipëri (How I came to Albania) | 23 | 2.4 | 92 % | first-person narrative with the three pasts |
| sq-a2-1-16 | 113 | vol | 940 | church | Pastori flet me Samin (The pastor talks with Sam) | 9 | 1.0 | 97 % | conversation with questions and advice |
| sq-a2-1-17 | 114 | core | 960 | explanation | Festat në Shqipëri (Holidays in Albania) | 21 | 2.2 | 93 % | habitual present and imperfect for customs |
| sq-a2-1-18 | 115 | core | 980 | nonfiction | Shqipëria: klima dhe natyra (Albania: climate and nature) | 24 | 2.4 | 93 % | descriptive nonfiction register (library direction) |
| sq-a2-2-01 | 116 | core | 900 | practical | Një banesë për Samin (A flat for Sam) | 13 | 1.4 | 96 % | negotiation with ju and conditional set phrases (do të doja, do të ishte mirë) |
| sq-a2-2-02 | 117 | core | 920 | practical | Datat dhe kalendari (Dates and the calendar) | 16 | 1.7 | 95 % | dates with months (më 15 maj), years and centuries |
| sq-a2-2-03 | 118 | core | 940 | conversation | Kisha harruar çelësin (I had forgotten the key) | 9 | 1.0 | 95 % | pluperfect (kisha harruar, kishte ardhur) |
| sq-a2-2-04 | 119 | core | 960 | narrative | Udhëtim në veri (A journey to the north) | 18 | 1.9 | 93 % | long past narrative (aorist, imperfect, pluperfect) |
| sq-a2-2-05 | 120 | core | 980 | nonfiction | Ekonomia e Shqipërisë (The economy of Albania) | 21 | 2.1 | 94 % | nonfiction register: participles, relative clauses, passives |
| sq-a2-2-06 | 121 | vol | 1000 | correspondence | Një email nga Gjergji (An email from Gjergj) | 8 | 0.8 | 98 % | informal written register |
| sq-a2-2-07 | 122 | core | 1020 | explanation | Bletët dhe mjalti (Bees and honey) | 15 | 1.5 | 95 % | explanatory present, general statements |
| sq-a2-2-08 | 123 | core | 1040 | explanation | Ushqimi dhe shëndeti (Food and health) | 16 | 1.5 | 94 % | advice and obligation (duhet të, mos …) |
| sq-a2-2-09 | 124 | vol | 1060 | narrative | Një ditë shiu në Tiranë (A rainy day in Tirana) | 7 | 0.7 | 98 % | recycling of weather, clothes and body |
| sq-a2-2-10 | 125 | core | 1080 | biography | Nënë Tereza (Mother Teresa) | 13 | 1.2 | 96 % | biography in the aorist and perfect, years and places |
| sq-a2-2-11 | 126 | core | 1100 | church | Lutje dhe urime (Prayers and blessings) | 14 | 1.3 | 96 % | optative in blessings and wishes (Qofsh i bekuar! Zoti të ruajtë!), receptive only |
| sq-a2-2-12 | 127 | vol | 1120 | conversation | Një darkë me miq (Dinner with friends) | 6 | 0.5 | 98 % | hospitality, toasts and thanks |
| sq-a2-2-13 | 128 | core | 1140 | testimony | Dëshmia e Dritanit (Dritan's testimony) | 14 | 1.2 | 96 % | conditional (do të kisha …, sikur …) |
| sq-a2-2-14 | 129 | vol | 1160 | practical | Një CV dhe një punë (A CV and a job) | 10 | 0.9 | 97 % | pa + participle (pa kaluar, pa pyetur) |
| sq-a2-2-15 | 130 | vol | 1180 | correspondence | Kartolina nga Berati (A postcard from Berat) | 8 | 0.7 | 97 % | short written travel messages |
| sq-a2-2-16 | 131 | core | 1200 | nonfiction | Turizmi në Shqipëri (Tourism in Albania) | 26 | 2.2 | 94 % | descriptive nonfiction (library direction) |
| sq-a2-2-17 | 132 | core | 1220 | explanation | Shqipëria në shekuj (Albania through the centuries) | 23 | 1.9 | 94 % | history in the aorist and the participle as adjective |
| sq-a2-2-18 | 133 | vol | 1240 | narrative | Gjyshi tregon edhe një herë (Grandfather tells once more) | 4 | 0.3 | 98 % | story in the three pasts and direct speech |
| sq-a2-2-19 | 134 | core | 1260 | nonfiction | Tirana sot (Tirana today) | 23 | 1.8 | 94 % | descriptive present, participles and relative clauses |
| sq-a2-2-20 | 135 | vol | 1280 | testimony | Një vit në Shqipëri (A year in Albania) | 9 | 0.7 | 98 % | all tenses: present, perfect, aorist, imperfect, future, conditional |

Largest planned cliff (coverage below the mean of the previous three units, with a1-1's last three as measured): 3.1 points, at sq-a2-2-16 (the gate warns above 6, errors above 12). The recycling load (tracked lemmas a writer must place, per 100 words) peaks at 8.1 (mean 5.0); the Spanish plan peaked at 10.4.

### 3.2 Unit by unit

Format: situation; **new** lemmas (`+` = to add to the word list, section 6.1; `i X` = articulated, six unknown tokens); **top-up** (a1-1 lemmas, first units only); **recycle** (lemmas introduced in the previous six units that this unit must use at least once: 821 content lemmas tracked, each assigned to three of the following six units; fewer than three slots exist only in the last three units, see section 7); focus; seed.

#### sq-a1-2-01 · #73 · core · conversation · 220 words · est. cov. 91 % · Një telefonatë
- **English title.** A phone call
- **Situation.** Sam phones Luan: when shall we meet, why is he late, what must each do today and tomorrow, who comes on Sunday.
- **Cast.** Sam, Luan
- **New (4; each exactly three times).** kur pse duhem javë
- **Top-up of a1-1 lemmas (7 unknown tokens).** shok×2 punë kohë do zot×2
- **Recycle (0).** nothing yet (first unit); use the stage-0 and a1-1 words freely
- **Focus.** present tense, all six persons, in a short phone conversation; duhet të + verb as a set phrase; kur and pse as question words — keys: `modal-te`.

#### sq-a1-2-02 · #74 · core · narrative · 240 words · est. cov. 92 % · Një ditë te Drita
- **English title.** A day at Drita's
- **Situation.** A day at grandmother Drita's house with the clock in view: bread at seven, school at eight, lunch at one, the market at four.
- **Cast.** Drita, Ardi, Sam
- **New (5; each exactly three times).** orë minutë mesditë pasdite mbrëmje
- **Top-up of a1-1 lemmas (4 unknown tokens).** autobus vonë llambë ringjallem
- **Recycle (4).** kur pse duhem javë
- **Focus.** telling the hour (ora është tre, në orën shtatë); parts of the day (pasdite, mbrëmje); present tense, 3rd person — keys: no detector fires for the new construction.

#### sq-a1-2-03 · #75 · core · narrative · 280 words · est. cov. 93 % · Java e Samit
- **English title.** Sam's week
- **Situation.** Monday school, Wednesday the clinic with Ana, Friday the market, Saturday tea with Dritan, Sunday church: the week in six short scenes.
- **Cast.** Sam, Drita, Ardi, Luan, Ana
- **New (6; each exactly three times).** hënë martë mërkurë enjte premte shtunë
- **Top-up of a1-1 lemmas (3 unknown tokens).** sallatë asgjë gjithashtu
- **Recycle (9).** kur pse duhem javë orë minutë mesditë pasdite mbrëmje
- **Focus.** days of the week with the definite accusative (të hënën, të martën); what Sam does on each day; recycling of places and people — keys: no detector fires for the new construction.

#### sq-a1-2-04 · #76 · core · narrative · 300 words · est. cov. 91 % · Çfarë bën zakonisht?
- **English title.** What does he usually do?
- **Situation.** What Sam, Luan and Ardi usually do: how often, and what they do at the weekend; a questionnaire read aloud.
- **Cast.** Sam, Luan, Ardi
- **New (8; each exactly three times).** gjithmonë shpesh rrallë ndonjëherë +zakonisht +herë fundjavë ngre
- **Top-up of a1-1 lemmas (3 unknown tokens).** ynë juaj×2
- **Recycle (15).** kur pse duhem javë orë minutë mesditë pasdite mbrëmje hënë martë mërkurë enjte premte shtunë
- **Focus.** frequency adverbs (gjithmonë, shpesh, rrallë, zakonisht); një herë, dy herë (herë); ngrihem / ngre in a morning routine — keys: no detector fires for the new construction.

#### sq-a1-2-05 · #77 · core · description · 390 words · est. cov. 91 % · Familja e Anës dhe e Luanit
- **English title.** Ana and Luan's family
- **Situation.** Ana shows Sam the family photographs: parents, an aunt and an uncle in the village, cousins; who is how old.
- **Cast.** Ana, Luan, Sam, Drita
- **New (9; each exactly three times).** bijë hallë teze kushëri i saj i tyre +vjeç emër tregoj *(function words, no recycle slot: i saj, i tyre)*
- **Top-up of a1-1 lemmas (2 unknown tokens).** le fjalë
- **Recycle (9).** hënë mërkurë premte shtunë gjithmonë shpesh rrallë ndonjëherë fundjavë
- **Focus.** possessive i saj / i tyre; genitive with the linking article (babai i Anës); ages (numeral + vjeç); ju as the polite you — keys: `genitive-linking-article`, `possessive-after-noun`.

#### sq-a1-2-06 · #78 · core · conversation · 370 words · est. cov. 91 % · Shtëpia e Samit
- **English title.** Sam's home
- **Situation.** Luan helps Sam arrange his small house: the bed, the cupboard, the chair under the window, the garden behind the door.
- **Cast.** Sam, Luan, Ardi
- **New (10; each exactly three times).** derë banjë shtrat kopsht +karrige +dollap nën pranë brenda jashtë *(function words, no recycle slot: nën, pranë)*
- **Top-up of a1-1 lemmas (3 unknown tokens).** cili×2 u
- **Recycle (11).** martë enjte premte gjithmonë shpesh rrallë ndonjëherë +zakonisht ngre kushëri emër
- **Focus.** place prepositions with the ablative (nën tavolinë, pranë dritares); ka / nuk ka in rooms; adjective agreement (e vogël, të mëdha) — keys: `ablative-after-preposition`.

#### sq-a1-2-07 · #79 · core · narrative · 340 words · est. cov. 94 % · Macja e humbur
- **English title.** The lost cat
- **Situation.** The cat is gone: Ardi and Elira look in the yard, on the stairs, behind the wall; grandmother finds it in the kitchen.
- **Cast.** Ardi, Elira, Drita
- **New (7; each exactly three times).** humbas oborr ose apo gjë lart poshtë *(function words, no recycle slot: ose, apo)*
- **Recycle (24).** orë minutë mesditë pasdite mbrëmje hënë martë mërkurë enjte shtunë gjithmonë shpesh rrallë ndonjëherë +zakonisht +herë fundjavë ngre derë banjë shtrat +karrige +dollap jashtë
- **Focus.** recycling of rooms and places; ose / apo in questions; imperative (shiko! eja!) — keys: no detector fires for the new construction.

#### sq-a1-2-08 · #80 · core · practical · 440 words · est. cov. 91 % · Në dyqan
- **English title.** At the clothes shop
- **Situation.** Sam and Ana buy a shirt, a dress for Ardi's grandmother and shoes; sizes, colours, "do you have it in black?"
- **Cast.** Sam, Ana, the seller
- **New (10; each exactly three times).** këmishë fustan këpucë +pallto +ngjyrë i bardhë i zi i gjelbër +madhësi dyqan
- **Recycle (15).** +zakonisht fundjavë bijë hallë teze kushëri +vjeç emër tregoj banjë kopsht +dollap brenda humbas lart
- **Focus.** linking article + adjective, all genders (një këmishë e bardhë, këpucë të zeza); më pëlqen / më pëlqejnë + noun; colours — keys: `linking-article-adjective`.
- **Draft.** seed: `dialogue-01` (49 words) is placeable from here on (95 % known after a1-2-07); a short church conversation, so it fits a church unit better: see section 4

#### sq-a1-2-09 · #81 · core · practical · 370 words · est. cov. 91 % · Sa kushton?
- **English title.** How much is it?
- **Situation.** Bargaining and paying at the market and at a shop: the price, a discount, the change, the cash desk.
- **Cast.** Sam, Drita, the seller
- **New (9; each exactly three times).** +para +euro +kusur +zbritje i lirë i shtrenjtë paguaj çmim arkë
- **Recycle (23).** +herë bijë teze +vjeç derë banjë shtrat kopsht +karrige +dollap brenda jashtë poshtë këmishë fustan këpucë +pallto +ngjyrë i bardhë i zi i gjelbër +madhësi dyqan
- **Focus.** prices in lek and euro, numbers to 1,000 (free for the gate); comparative first met: më i lirë; paguaj, kusur — keys: `comparative`.

#### sq-a1-2-10 · #82 · core · narrative · 380 words · est. cov. 94 % · Në treg me Dritën
- **English title.** At the market with Drita
- **Situation.** Saturday at the vegetable market: what grandmother buys, what Ardi carries, how Sam learns the prices.
- **Cast.** Drita, Ardi, Sam
- **New (8; each exactly three times).** perime frutë domate patate qepë hudhër sheqer gjalpë
- **Recycle (27).** +herë ngre hallë +vjeç tregoj humbas oborr gjë lart poshtë këmishë fustan këpucë +pallto +ngjyrë i bardhë i zi i gjelbër +madhësi dyqan +para +euro +kusur +zbritje i lirë i shtrenjtë arkë
- **Focus.** recycling of food, prices and colours; definite plural (domatet, patatet) — keys: no detector fires for the new construction.

#### sq-a1-2-11 · #83 · core · conversation · 470 words · est. cov. 91 % · Në restorant
- **English title.** At the restaurant
- **Situation.** A Sunday lunch for three at a restaurant in the centre: the menu, soup and fish, dessert, the bill.
- **Cast.** Ana, Luan, Sam, the waiter
- **New (12; each exactly three times).** restorant kamarier porosit supë mish +peshk pije ëmbëlsirë +faturë +porosi i uritur i ngopur
- **Recycle (23).** bijë hallë teze kushëri emër tregoj gjë këmishë fustan këpucë i bardhë i gjelbër dyqan i shtrenjtë çmim perime frutë domate patate qepë hudhër sheqer gjalpë
- **Focus.** polite requests: a mund të … ? / do të dëshiroja (as a set phrase); ordering and paying; object pronouns with the verb (e dua, e merr) — keys: `object-pronoun-before-verb`.

#### sq-a1-2-12 · #84 · core · practical · 500 words · est. cov. 91 % · Me autobus në qendër
- **English title.** By bus to the centre
- **Situation.** Sam takes the city bus and the furgon: which line, the ticket, "get off at the next stop", the delay.
- **Cast.** Sam, Ardi, the driver
- **New (14; each exactly three times).** qytet qendër stacion biletë +linjë +ndalesë +furgon +vonesë shofer +zbres mos i shpejtë makinë drejtim *(function words, no recycle slot: mos)*
- **Recycle (20).** derë shtrat kopsht +karrige brenda jashtë oborr +para +euro +kusur +zbritje i lirë i shtrenjtë paguaj çmim arkë kamarier +peshk +porosi i ngopur
- **Focus.** imperatives (singular and plural), mos + imperative; tickets and stops; duhet të / mund të — keys: `negation-mos`, `imperative-pronoun`.

#### sq-a1-2-13 · #85 · core · narrative · 420 words · est. cov. 91 % · Sam humbet rrugën
- **English title.** Sam loses his way
- **Situation.** Sam looks for a friend's address with a map, turns left too early, and is found by Dritan at the crossing.
- **Cast.** Sam, Dritan, a passer-by
- **New (12; each exactly three times).** hartë adresë +kryqëzim +kthesë +djathtas +majtas pres atje kërkoj larg afër drejt *(function words, no recycle slot: drejt)*
- **Recycle (29).** humbas oborr gjë lart poshtë perime frutë domate patate qepë hudhër sheqer gjalpë restorant supë ëmbëlsirë qytet qendër stacion biletë +linjë +ndalesë +furgon +vonesë shofer +zbres i shpejtë makinë drejtim
- **Focus.** directions (djathtas, majtas, drejt); imperative with a short pronoun (më thuaj) — keys: no detector fires for the new construction.

#### sq-a1-2-14 · #86 · core · narrative · 540 words · est. cov. 91 % · Një ditë në mal
- **English title.** A day in the mountains
- **Situation.** A Sunday trip to the mountain above Tirana: the plan, the weather, the forest, a cloud that turns into a storm.
- **Cast.** Sam, Luan, Ana, Ardi, Elira
- **New (14; each exactly three times).** mal diell qiell re erë borë stuhi pyll kodër lule gur +stinë i ngrohtë i ftohtë
- **Recycle (23).** +pallto +ngjyrë i zi +madhësi i lirë paguaj arkë gjalpë restorant kamarier porosit supë mish +peshk pije ëmbëlsirë +faturë +porosi i uritur i ngopur +zbres makinë afër
- **Focus.** future with do të (systematic); weather impersonals (bie shi, fryn erë); seasons — keys: `future`.

#### sq-a1-2-15 · #87 · core · health · 460 words · est. cov. 92 % · Te mjeku
- **English title.** At the doctor's
- **Situation.** Ardi has a stomach ache and a temperature; his grandmother takes him to the clinic where Ana and Dr Arta work.
- **Cast.** Ardi, Ana, Dr Arta, Drita
- **New (12; each exactly three times).** kokë dorë këmbë shpinë +gjoks +stomak dhimbje +dhemb +temperaturë +ilaç mjek kështu
- **Recycle (21).** +para +euro +kusur +zbritje paguaj çmim porosit pije i uritur qytet qendër stacion biletë +linjë +ndalesë +furgon +vonesë shofer drejtim lule i ngrohtë
- **Focus.** më dhemb + body part; duhet të; imperatives as advice (pi shumë ujë, mos shko në shkollë); object pronouns with the verb — keys: `modal-te`, `object-pronoun-before-verb`.

#### sq-a1-2-16 · #88 · core · narrative · 470 words · est. cov. 91 % · Ardi është i sëmurë
- **English title.** Ardi is ill
- **Situation.** Three days in bed: the cough, the tea, the medicine, grandmother's soup; on the fourth day Ardi gets well.
- **Cast.** Ardi, Drita, Ana
- **New (11; each exactly three times).** i sëmurë +shëroj +ftohje +kollë +gjumë gojë hundë i dobët +recetë ashtu i keq
- **Recycle (34).** perime frutë domate patate qepë hudhër sheqer mish +faturë i shpejtë hartë adresë +kryqëzim +kthesë +djathtas +majtas pres atje kërkoj larg gur i ftohtë kokë dorë këmbë shpinë +gjoks +stomak dhimbje +dhemb +temperaturë +ilaç mjek kështu
- **Focus.** recycling of the body and the clinic; po + present — keys: `progressive-po`.

#### sq-a1-2-17 · #89 · core · conversation · 490 words · est. cov. 91 % · Një mesazh, një telefonatë
- **English title.** A message, a phone call
- **Situation.** Mira sends Sam a message with an invitation to Gjergj's birthday; Sam phones back; Dritan gives the time and the address.
- **Cast.** Sam, Mira, Dritan
- **New (14; each exactly three times).** mesazh telefonatë +celular +ftesë +urim numër dërgoj telefonoj takim ftoj festë takoj tashmë shpjegoj
- **Recycle (27).** restorant kamarier porosit supë mish +peshk pije ëmbëlsirë +faturë +porosi i uritur i ngopur mal diell qiell re erë borë stuhi pyll kodër +stinë dorë +gjoks +dhemb mjek ashtu
- **Focus.** short object pronouns, indirect object (i dërgoj një mesazh); clitic doubling (e ftoj Samin); inviting, accepting, declining — keys: `object-pronoun-before-verb`, `clitic-doubling`.

#### sq-a1-2-18 · #90 · core · narrative · 510 words · est. cov. 92 % · Çfarë bëre dje?
- **English title.** What did you do yesterday?
- **Situation.** Luan asks Sam about yesterday: he set out early, walked, arrived late, forgot the key, finished at six, rested.
- **Cast.** Sam, Luan
- **New (14; each exactly three times).** +kaloj +ec arrij kthehem harroj kujtoj mbaroj pushoj nisem mbetem atëherë prej ndodhem shpejt *(function words, no recycle slot: prej)*
- **Recycle (41).** qytet qendër stacion biletë +linjë +ndalesë +furgon +vonesë shofer +zbres i shpejtë makinë drejtim hartë adresë +kryqëzim +kthesë +djathtas +majtas pres atje kërkoj larg afër këmbë dhimbje +ilaç i dobët mesazh telefonatë +celular +ftesë +urim numër dërgoj telefonoj takim ftoj festë takoj shpjegoj
- **Focus.** aorist, first and third person singular, regular (-oi, -ova); u + aorist (u ktheva); dje, atëherë — keys: `non-active-u`.

#### sq-a1-2-19 · #91 · core · narrative · 520 words · est. cov. 93 % · Një ditë në fshat
- **English title.** A day in the village
- **Situation.** Ardi spends a day with his grandfather: the cows and the sheep, the horse, sowing and reaping in the old way.
- **Cast.** Ardi, Ardi's grandfather, Drita
- **New (12; each exactly three times).** +bujk kafshë lopë dele kalë zog korr mbjell fshatar nëse tokë aty *(function words, no recycle slot: nëse)*
- **Recycle (36).** hartë adresë +kryqëzim +kthesë +djathtas +majtas pres atje kërkoj larg afër mal diell qiell re erë borë stuhi pyll kodër lule gur +stinë i ngrohtë i ftohtë i sëmurë +shëroj +ftohje +kollë +gjumë gojë hundë i dobët +recetë ashtu i keq
- **Focus.** aorist narration (3rd person singular and plural); recycling of animals and the house — keys: no detector fires for the new construction.

#### sq-a1-2-20 · #92 · core · correspondence · 540 words · est. cov. 92 % · Një letër nga Tirana
- **English title.** A letter from Tirana
- **Situation.** Sam writes his mother a long letter with a postcard: what he has learned, whom he has met, what he hopes.
- **Cast.** Sam, Sam's mother, Ana
- **New (15; each exactly three times).** postë +zarf +kartolinë +shënim +përgjigje përgjigjem shpresoj kujdesem dëshirë ëndërr mundësi hap mbyll prandaj pyetje *(function words, no recycle slot: prandaj)*
- **Recycle (34).** mal diell qiell re erë borë stuhi pyll kodër lule gur +stinë i ngrohtë i ftohtë kokë shpinë +stomak +temperaturë kështu i keq mesazh telefonatë +celular +ftesë +urim numër dërgoj telefonoj takim ftoj festë takoj tashmë shpjegoj
- **Focus.** present perfect (kam shkruar, ke parë); letter formulas (e dashur nënë, me dashuri); prandaj — keys: `perfect`.

#### sq-a1-2-21 · #93 · core · church · 560 words · est. cov. 92 % · E diela në bashkësi
- **English title.** Sunday with the congregation
- **Situation.** A Sunday in the congregation: the choir, the sermon, a collection for the sick, a blessing; Sam meets Pastor Pjetër.
- **Cast.** Pastor Pjetër, Drita, Dritan, Mira, Sam
- **New (15; each exactly three times).** +bashkësi +mbledhje +kor këngë shërbim predikim pastor lutje dhuratë +ofertë bekim adhurim dëshmoj mëshirë pra *(function words, no recycle slot: pra)*
- **Recycle (31).** kokë dorë këmbë shpinë +gjoks +stomak dhimbje +dhemb +temperaturë +ilaç mjek kështu i sëmurë +shëroj +ftohje +kollë +gjumë gojë hundë +recetë +kaloj +ec arrij harroj mbaroj nisem atëherë shpejt shpresoj mundësi mbyll
- **Focus.** relative clause with që (njerëzit që këndojnë); church-life vocabulary in everyday sentences; pra — keys: `relative-clause`.

#### sq-a1-2-22 · #94 · vol · narrative · 570 words · est. cov. 95 % · Pas shërbimit
- **English title.** After the service
- **Situation.** Visitors and neighbours come to drink coffee and eat cake at Drita's after church; Sam is introduced to them.
- **Cast.** Drita, Mira, Dritan, Ardi, Sam
- **New (10; each exactly three times).** mysafir fqinj shoqe zonjë mik vizitor tortë çokollatë akullore lëng
- **Recycle (46).** i sëmurë +shëroj +ftohje +kollë +gjumë gojë hundë i dobët +recetë ashtu i keq tashmë kthehem kujtoj pushoj mbetem ndodhem +bujk kafshë lopë dele kalë zog korr mbjell fshatar tokë aty përgjigjem dëshirë hap pyetje +bashkësi +mbledhje +kor këngë shërbim predikim pastor lutje dhuratë +ofertë bekim adhurim dëshmoj mëshirë
- **Focus.** hospitality phrases (mirë se vini, ju lutem, urdhëroni); recycling of church and food — keys: no detector fires for the new construction.

#### sq-a1-2-23 · #95 · core · biography · 590 words · est. cov. 92 % · Jeta e gjyshes Drita
- **English title.** Grandmother Drita's life
- **Situation.** Drita tells Sam her life: born in a village, school, marriage, the move to Tirana, the bread stall; who she remembers.
- **Cast.** Drita, Ardi, Sam
- **New (16; each exactly three times).** lindem martohem rrit +moshë +fëmijëri +rini jetë vdekje kujtim ruaj mbaj zakon traditë ndërroj rri vit
- **Recycle (38).** mesazh telefonatë +celular +ftesë +urim numër dërgoj telefonoj takim ftoj festë takoj tashmë shpjegoj +kaloj +ec arrij kthehem harroj kujtoj mbaroj pushoj nisem mbetem atëherë ndodhem shpejt +bujk kafshë lopë dele kalë zog korr mbjell tokë çokollatë lëng
- **Focus.** aorist narration of a life (lindi, u martua, punoi); age and date (në moshën, në vitin); rri, mbaj — keys: `non-active-u`.

#### sq-a1-2-24 · #96 · core · instructions · 640 words · est. cov. 91 % · Si bëhet byreku
- **English title.** How byrek is made
- **Situation.** Drita shows Sam and Ardi how to make byrek with spinach and cheese; the text gives the recipe step by step.
- **Cast.** Drita, Sam, Ardi
- **New (17; each exactly three times).** +miell +spinaq vezë vaj kripë +përziej +pjek +furrë thikë lugë shtoj hedh pastroj gatuaj +kos i hollë i trashë
- **Recycle (41).** +kaloj +ec arrij kthehem harroj kujtoj mbaroj pushoj nisem mbetem atëherë ndodhem shpejt fshatar aty postë +zarf +kartolinë +shënim +përgjigje kujdesem ëndërr hap pyetje +bashkësi +mbledhje këngë predikim lutje +ofertë adhurim mëshirë mysafir fqinj shoqe zonjë mik vizitor tortë akullore lëng
- **Focus.** plural imperatives and mos; non-active as impersonal (bëhet, piqet); quantities and order words (së pari, pastaj) — keys: `negation-mos`.

#### sq-a1-2-25 · #97 · vol · description · 630 words · est. cov. 91 % · Tirana dhe fshati
- **English title.** Tirana and the village
- **Situation.** Sam compares the city and the village with Luan: bigger, quieter, colder, easier, higher; what he likes in each.
- **Cast.** Sam, Luan
- **New (11; each exactly three times).** i shkurtër i lartë i ulët i gjerë i ngushtë i rëndë i lehtë vend pjesë lloj mënyrë
- **Recycle (32).** +bujk kafshë lopë dele kalë zog korr mbjell fshatar tokë aty postë +zarf +kartolinë +shënim +përgjigje përgjigjem shpresoj kujdesem dëshirë ëndërr mundësi mbyll +miell +spinaq vaj +përziej +furrë lugë hedh gatuaj i hollë
- **Focus.** comparative with më … se; sa … aq; adjective pairs and opposites; vend (place, country) — keys: `comparative`.

#### sq-a2-1-01 · #98 · core · narrative · 650 words · est. cov. 94 % · Kur isha i vogël
- **English title.** When I was small
- **Situation.** Ardi's grandfather tells how it was when he was a boy: the river, fishing, swimming, running barefoot, the stove in winter.
- **Cast.** Ardi's grandfather, Ardi, Sam
- **New (14; each exactly three times).** dikur lojë zjarr sobë lumë breg notoj vrapoj +ngjit +çati rërë liqen dhi sy
- **Recycle (46).** postë +zarf +kartolinë +shënim +përgjigje përgjigjem shpresoj kujdesem dëshirë ëndërr mundësi hap mbyll pyetje +kor shërbim pastor dhuratë bekim dëshmoj mysafir fqinj shoqe zonjë mik vizitor tortë çokollatë akullore lindem martohem rrit +moshë +fëmijëri +rini jetë vdekje kujtim ruaj mbaj zakon traditë ndërroj rri vit mënyrë
- **Focus.** imperfect (isha, kisha, luaja, shkonim): habit and description in the past; dikur; imperfect vs aorist: first contrast — keys: no detector fires for the new construction.

#### sq-a2-1-02 · #99 · core · explanation · 720 words · est. cov. 92 % · Fshati para dhe tani
- **English title.** The village then and now
- **Situation.** What the village was and is: more people left, a road and a school were built, farming changed; told by the grandfather and by Luan.
- **Cast.** Ardi's grandfather, Luan, Sam
- **New (18; each exactly three times).** ndryshim ndryshoj ndërtoj ndërtesë +banor +shumicë +pakicë largohem +bujqësi fabrikë zyrë +pasuri popull shtet disa ndërsa i tjetër tjetër *(function words, no recycle slot: disa, ndërsa, tjetër)*
- **Recycle (36).** +bashkësi +mbledhje +kor këngë shërbim predikim pastor lutje dhuratë +ofertë bekim adhurim dëshmoj mëshirë lindem martohem rrit +moshë +fëmijëri +rini jetë vdekje kujtim ruaj mbaj zakon traditë ndërroj vezë kripë +pjek thikë shtoj pastroj +kos i trashë
- **Focus.** imperfect and present contrasted (dikur … tani); quantifiers (shumica, disa, pak); large numbers and years — keys: no detector fires for the new construction.

#### sq-a2-1-03 · #100 · core · narrative · 690 words · est. cov. 94 % · Rrëfimi i gjyshit natën
- **English title.** Grandfather's tale at night
- **Situation.** By the stove the grandfather tells the children of the cave in the rock, a snake and a brave boy; nobody is afraid.
- **Cast.** Ardi's grandfather, Ardi, Elira
- **New (12; each exactly three times).** shpellë shkëmb hije mjegull frikë trim gjarpër asnjë i vetëm portë shkallë mur *(function words, no recycle slot: asnjë)*
- **Recycle (51).** mysafir fqinj shoqe zonjë mik vizitor tortë çokollatë akullore lëng lindem martohem rrit +moshë +fëmijëri +rini jetë vdekje kujtim ruaj mbaj zakon traditë ndërroj rri vit i shkurtër i lartë i ulët i gjerë i ngushtë i rëndë i lehtë vend pjesë lloj mënyrë dikur lojë zjarr sobë lumë breg notoj vrapoj +ngjit +çati rërë liqen dhi sy
- **Focus.** aorist and imperfect in a story; direct speech — keys: no detector fires for the new construction.

#### sq-a2-1-04 · #101 · core · narrative · 830 words · est. cov. 92 % · Nata e stuhisë
- **English title.** The night of the storm
- **Situation.** A storm cuts the light in Tirana: Sam hears a shout, a window breaks, the children cry; Ana and Luan calm everyone down.
- **Cast.** Sam, Luan, Ana, Ardi
- **New (21; each exactly three times).** +bubullimë +vetëtimë ndez +fik +bërtas +vërej qaj hesht thyej lëviz zë shpëtoj +rrezik duke kap pa shkak kthej i vështirë çoj lë *(function words, no recycle slot: duke, pa)*
- **Recycle (55).** rri vit +miell +spinaq vezë vaj kripë +përziej +pjek +furrë thikë lugë shtoj hedh pastroj gatuaj +kos i hollë i trashë i shkurtër i lartë i ulët i gjerë i ngushtë i rëndë i lehtë vend pjesë lloj mënyrë dikur lojë zjarr sobë lumë breg notoj vrapoj +ngjit +çati rërë liqen dhi sy shpellë shkëmb hije mjegull frikë trim gjarpër i vetëm portë shkallë mur
- **Focus.** aorist vs imperfect in one narrative (po flija kur …); verbs of sound and light; duke + participle introduced — keys: `gerund-duke`.

#### sq-a2-1-05 · #102 · core · practical · 750 words · est. cov. 92 % · Në postë dhe në bankë
- **English title.** At the post office and the bank
- **Situation.** Sam opens a bank account and sends a parcel: the queue, the form, the passport, a signature, opening hours.
- **Cast.** Sam, an official, Mira
- **New (19; each exactly three times).** bankë +dokument +formular kartë +llogari kontratë nënshkruaj +regjistroj +radhë kërkesë pasaportë orar +nevojë pagë +sasi vlerë secili njëri i rëndësishëm *(function words, no recycle slot: secili, njëri)*
- **Recycle (33).** +miell +spinaq vezë vaj kripë +përziej +pjek +furrë thikë lugë shtoj hedh pastroj gatuaj +kos i hollë i trashë ndryshim ndryshoj ndërtoj ndërtesë +banor +shumicë +pakicë largohem +bujqësi fabrikë zyrë +pasuri popull shtet i tjetër i vështirë
- **Focus.** formal requests with ju (mund të më ndihmoni?); forms and documents; number and date formats — keys: no detector fires for the new construction.

#### sq-a2-1-06 · #103 · core · instructions · 770 words · est. cov. 94 % · Si ta përdorim kompjuterin
- **English title.** How to use the computer
- **Situation.** Gjergj shows Sam how to write an email, attach a photograph, search the internet and save a file.
- **Cast.** Gjergj, Sam, Mira
- **New (16; each exactly three times).** kompjuter +internet +email faqe fotografi film zgjedh shtyp përdor mjet kërkim plotësoj kontrolloj +lidhje fillim fund
- **Recycle (51).** i shkurtër i lartë i ulët i gjerë i ngushtë i rëndë i lehtë vend pjesë lloj liqen sy shpellë shkëmb hije mjegull frikë trim gjarpër i vetëm portë shkallë mur +bubullimë +vetëtimë ndez +fik +bërtas qaj thyej zë +rrezik kthej çoj bankë +dokument +formular kartë +llogari kontratë nënshkruaj +regjistroj +radhë kërkesë pasaportë orar +nevojë pagë +sasi vlerë i rëndësishëm
- **Focus.** imperatives with short pronouns (hape, ruaje, dërgoje); polite plural instructions; në fillim, pastaj, në fund — keys: `imperative-pronoun`, `clitic-cluster`.

#### sq-a2-1-07 · #104 · core · correspondence · 780 words · est. cov. 94 % · Mesazhet e grupit
- **English title.** The group messages
- **Situation.** A week of messages in the congregation's group chat: who brings food, a change of time, a prayer request, a reminder.
- **Cast.** Mira, Dritan, Sam, Pastor Pjetër
- **New (15; each exactly three times).** +njoftim lajm gazetë revistë tregim roman poezi shkrimtar mbledh dikush askush grup anëtar ende akoma *(function words, no recycle slot: dikush, askush)*
- **Recycle (40).** dikur lojë zjarr sobë lumë breg notoj vrapoj +ngjit +çati rërë dhi ndryshim ndryshoj ndërtoj ndërtesë +banor +shumicë +pakicë largohem +bujqësi fabrikë zyrë +pasuri popull shtet i tjetër +fik +vërej hesht lëviz shpëtoj kap i vështirë lë zgjedh përdor kërkim +lidhje fund
- **Focus.** short written messages, abbreviations, greetings; dates, times, places in an announcement — keys: no detector fires for the new construction.

#### sq-a2-1-08 · #105 · core · nonfiction · 900 words · est. cov. 92 % · Tirana — qyteti ku jetoj
- **English title.** Tirana — the city where I live
- **Situation.** Sam writes for his home church what Tirana is: the capital, the university, the museums, the park, the airport, the main boulevard.
- **Cast.** Sam (writing), Luan
- **New (23; each exactly three times).** kryeqytet +popullsi +bashki republikë universitet muze park hotel aeroport bulevard urë +kombëtar +kulturor +historik +ndërkombëtar shesh rreth midis kryesor i njohur përpara tek e *(function words, no recycle slot: rreth, midis, përpara, tek, e)*
- **Recycle (31).** ndryshim ndryshoj ndërtoj ndërtesë +banor +shumicë +pakicë largohem +bujqësi fabrikë zyrë +pasuri popull shtet i tjetër +bërtas qaj thyej zë +rrezik shkak kthej lë lajm revistë tregim poezi shkrimtar mbledh anëtar ende
- **Focus.** present-tense description with passive sense (ndodhet, quhet, njihet); relative clauses (që, ku); numbers: years, population (free) — keys: `relative-clause`, `non-active-present`.

#### sq-a2-1-09 · #106 · core · narrative · 830 words · est. cov. 92 % · Dita e shkollës
- **English title.** The school day
- **Situation.** A day at Luan's school told through Gjergj and Ardi: the lessons, the exam, a forgotten notebook, a good mark.
- **Cast.** Gjergj, Ardi, Luan, Mira
- **New (19; each exactly three times).** klasë mësim fletore laps stilolaps provim detyrë tabelë fjalor fjali shkronjë notë drejtor shkencë matematikë +gjeografi i parë i dytë i fundit
- **Recycle (37).** shpellë shkëmb hije mjegull frikë trim gjarpër i vetëm portë shkallë mur +bubullimë +vetëtimë ndez +vërej hesht lëviz shpëtoj kap shkak çoj +njoftim gazetë tregim roman shkrimtar grup anëtar akoma +bashki universitet muze aeroport urë +kulturor +ndërkombëtar kryesor
- **Focus.** full past narrative with the three pasts; questions and answers in class; ordinal numbers (i parë, i dytë) — keys: no detector fires for the new construction.

#### sq-a2-1-10 · #107 · core · conversation · 850 words · est. cov. 95 % · Një intervistë pune
- **English title.** A job interview
- **Situation.** Dritan's company needs help with English; Sam is asked about his experience, his languages and his plans.
- **Cast.** Sam, a manager, Dritan
- **New (13; each exactly three times).** +intervistë +shef profesion kompani punëtor ekip projekt biznes përvojë +qëllim vetë mjaft tepër *(function words, no recycle slot: vetë)*
- **Recycle (62).** +bubullimë +vetëtimë ndez +fik +bërtas +vërej qaj hesht thyej lëviz zë shpëtoj +rrezik kap shkak kthej i vështirë çoj lë bankë +dokument +formular kartë +llogari kontratë nënshkruaj +regjistroj +radhë kërkesë pasaportë orar +nevojë pagë +sasi vlerë i rëndësishëm kompjuter +internet +email faqe fotografi film zgjedh shtyp përdor mjet kërkim plotësoj kontrolloj +lidhje fillim fund +njoftim lajm gazetë revistë roman poezi mbledh grup ende akoma
- **Focus.** formal questions and answers; conditional first met (do të doja, do të punoja); qëllim, përvojë — keys: `conditional`.

#### sq-a2-1-11 · #108 · core · practical · 870 words · est. cov. 93 % · Puna e Anës në klinikë
- **English title.** Ana's work at the clinic
- **Situation.** A day with Ana: the morning visits, an old patient, blood tests, a child with a hurt finger, the long afternoon list.
- **Cast.** Ana, Dr Arta, a patient, Sam
- **New (20; each exactly three times).** infermiere spital farmaci +pacient +vizitë shërbej ndihmë shëndet sëmundje trup lëkurë gjak zemër kockë gisht sipas infermier +mjekim +këshillë ndaj *(function words, no recycle slot: sipas)*
- **Recycle (56).** bankë +dokument +formular kartë +llogari kontratë nënshkruaj +regjistroj +radhë kërkesë pasaportë orar +nevojë pagë +sasi vlerë i rëndësishëm kompjuter +internet +email faqe fotografi film shtyp mjet plotësoj kontrolloj fillim kryeqytet +popullsi +bashki republikë universitet park aeroport urë +kulturor +ndërkombëtar kryesor detyrë fjali drejtor +gjeografi i fundit +intervistë +shef profesion kompani punëtor ekip projekt biznes përvojë +qëllim mjaft tepër
- **Focus.** relative clauses with që and cili; professional vocabulary in the present and perfect; office hours and duties — keys: `relative-clause`.

#### sq-a2-1-12 · #109 · core · biography · 880 words · est. cov. 94 % · Luani, mësuesi
- **English title.** Luan the teacher
- **Situation.** Luan's life as Ana tells it: school in the village, university in Tirana, first year as a teacher, English courses, the book he translates.
- **Cast.** Luan, Ana, Sam
- **New (19; each exactly three times).** diplomë arsim +fakultet studioj profesor student kurs tekst gjuhë +anglisht përkthej shkrim +ushtrim +lexim shembull ndihmoj bibliotekë +studim hartoj
- **Recycle (68).** kompjuter +internet +email faqe fotografi film zgjedh shtyp përdor mjet kërkim plotësoj kontrolloj +lidhje fillim fund park hotel bulevard +kombëtar +historik shesh i njohur klasë mësim fletore laps stilolaps provim detyrë tabelë fjalor fjali shkronjë notë drejtor shkencë matematikë +gjeografi i parë i dytë i fundit +intervistë +shef profesion kompani punëtor ekip projekt biznes përvojë +qëllim mjaft tepër infermiere spital farmaci +pacient +vizitë shërbej ndihmë shëndet sëmundje lëkurë zemër gisht +mjekim ndaj
- **Focus.** perfect and aorist together in a biography; university, degrees, career; duke + participle as "while" — keys: `perfect`, `gerund-duke`.

#### sq-a2-1-13 · #110 · vol · narrative · 890 words · est. cov. 97 % · Një ditë në Durrës
- **English title.** A day in Durrës
- **Situation.** A summer day by the sea: the train, the beach, the harbour, a boat to the lighthouse, ice cream.
- **Cast.** Sam, Luan, Ana, Ardi, Elira
- **New (8; each exactly three times).** plazh det anije varkë pushim +bregdet ishull tren
- **Recycle (39).** +njoftim lajm gazetë revistë tregim roman poezi shkrimtar mbledh grup anëtar ende akoma kryeqytet +popullsi republikë muze hotel bulevard +kombëtar +historik shesh i njohur tabelë shkronjë shkencë i parë tepër farmaci shërbej trup gjak kockë infermier +këshillë studioj tekst shkrim ndihmoj
- **Focus.** aorist narration of a trip; recycling of weather and transport — keys: no detector fires for the new construction.

#### sq-a2-1-14 · #111 · core · explanation · 910 words · est. cov. 93 % · Qytetet e Shqipërisë
- **English title.** The towns of Albania
- **Situation.** Luan's geography lesson on Durrës, Shkodër, Berat and Gjirokastër: founded when, a castle on the hill, what visitors come to see.
- **Cast.** Luan (teaching), Gjergj, Sam
- **New (22; each exactly three times).** +kala +kështjellë +monument +periudhë shekull mbret mbretëri perandori luftë epokë +pushtoj +themeloj +antik +zonë +trashëgimi +përfshij +shtrij +mesatar +rajon turist ndër nëpër *(function words, no recycle slot: ndër, nëpër)*
- **Recycle (41).** kryeqytet +popullsi +bashki republikë universitet muze park hotel aeroport bulevard urë +kombëtar +kulturor +historik +ndërkombëtar shesh kryesor i njohur klasë mësim fletore laps stilolaps provim fjalor notë matematikë i dytë spital +vizitë shëndet trup gjak kockë infermier +këshillë +fakultet kurs përkthej shembull hartoj
- **Focus.** descriptive present with ndodhet, shtrihet, njihet; dates and centuries (shekulli i parë); participle as adjective — keys: `non-active-present`.

#### sq-a2-1-15 · #112 · core · testimony · 940 words · est. cov. 92 % · Si erdha në Shqipëri
- **English title.** How I came to Albania
- **Situation.** Sam gives his testimony to the congregation: where he lived, why he came, the doubts, the first months, what changed.
- **Cast.** Sam (speaking), Pastor Pjetër
- **New (23; each exactly three times).** vendos +mision +misionar +vullnetar dyshoj besim fe dëshmi paqe gëzim +ndjenjë kuptim liri urtësi lavdi shpresë +vendim i krishterë +ndjej +rol kundër megjithëse i huaj *(function words, no recycle slot: kundër, megjithëse)*
- **Recycle (39).** klasë mësim fletore laps stilolaps provim detyrë tabelë fjalor fjali shkronjë notë drejtor shkencë matematikë +gjeografi i parë i dytë i fundit ndaj diplomë arsim +fakultet studioj profesor student kurs tekst gjuhë +anglisht përkthej shkrim +ushtrim +lexim shembull ndihmoj bibliotekë +studim hartoj
- **Focus.** first-person narrative with the three pasts; decision and change; church testimony language, no quotation of Scripture — keys: no detector fires for the new construction.
- **Draft.** seed: `story-01` "Historia ime" (62 words, 97 % known after a2-1-11; past-tense sentences only from a2-1-01)

#### sq-a2-1-16 · #113 · vol · church · 940 words · est. cov. 97 % · Pastori flet me Samin
- **English title.** The pastor talks with Sam
- **Situation.** Sam asks the pastor how to read the Bible in Albanian: a chapter a day, a verse to learn, a psalm for the evening.
- **Cast.** Pastor Pjetër, Sam
- **New (9; each exactly three times).** +kapitull +varg ungjill psalm shpëtim kryq falje hir përulem
- **Recycle (53).** +intervistë +shef profesion kompani punëtor ekip projekt biznes përvojë +qëllim mjaft infermiere +pacient ndihmë sëmundje lëkurë zemër gisht +mjekim arsim student +anglisht +lexim +studim plazh det anije varkë pushim +bregdet ishull tren vendos +mision +misionar +vullnetar dyshoj besim fe dëshmi paqe gëzim +ndjenjë kuptim liri urtësi lavdi shpresë +vendim i krishterë +ndjej +rol i huaj
- **Focus.** conversation with questions and advice; conditional and subjunctive wishes (le të …) — keys: `subjunctive-te`.
- **Draft.** seed: `dialogue-01` "Një bisedë" (49 words, 92 % known already after a1-2-03; it has the second Ana of the Udha texts, rename her)

#### sq-a2-1-17 · #114 · core · explanation · 960 words · est. cov. 93 % · Festat në Shqipëri
- **English title.** Holidays in Albania
- **Situation.** Drita explains to Sam how Christmas, Easter, a village wedding and New Year are kept: food, songs, a dance, who visits whom.
- **Cast.** Drita, Luan, Sam, Ardi
- **New (21; each exactly three times).** +Krishtlindje +Pashkë +vallë pemë kulturë ushqim gjellë festoj falënderoj dhuroj muzikë +tradicional këshilloj vizitoj dasmë ditëlindje +çift i tretë dimër pranverë gjatë *(function words, no recycle slot: gjatë)*
- **Recycle (56).** infermiere spital farmaci +pacient +vizitë shërbej ndihmë shëndet sëmundje trup lëkurë gjak zemër kockë gisht infermier +mjekim +këshillë ndaj diplomë profesor gjuhë +ushtrim bibliotekë +kala +kështjellë +monument +periudhë shekull mbret mbretëri perandori luftë epokë +pushtoj +themeloj +antik +zonë +trashëgimi +përfshij +shtrij +mesatar +rajon turist besim dëshmi gëzim kuptim urtësi shpresë i krishterë +rol +kapitull ungjill shpëtim hir
- **Focus.** habitual present and imperfect for customs; passive and impersonal (bëhet, festohet); ordinal numbers and dates — keys: `non-active-present`.

#### sq-a2-1-18 · #115 · core · nonfiction · 980 words · est. cov. 93 % · Shqipëria: klima dhe natyra
- **English title.** Albania: climate and nature
- **Situation.** A plain, factual text: how big Albania is, the sea and the mountains, rain in the north, heat in the south, rivers and lakes.
- **Cast.** (impersonal; Luan as the teacher)
- **New (24; each exactly three times).** +klimë +reshje +vapë +gradë +sipërfaqe +lartësi +gjatësi +veri +jug +lindje +perëndim +luginë +burim +kufi +përrua fushë ajër natyrë +bimë +metër +kilometër +malor pothuajse botë
- **Recycle (46).** diplomë arsim +fakultet studioj profesor student kurs tekst gjuhë +anglisht përkthej shkrim +ushtrim +lexim shembull ndihmoj bibliotekë +studim hartoj plazh det anije varkë pushim +bregdet ishull tren +kala +kështjellë +monument +periudhë shekull mbret mbretëri perandori luftë epokë +pushtoj +themeloj +antik +zonë +trashëgimi +përfshij +shtrij +mesatar +rajon
- **Focus.** descriptive nonfiction register (library direction); participles, relative clauses, comparatives; measures: metra, kilometra, gradë — keys: `comparative`, `relative-clause`.

#### sq-a2-2-01 · #116 · core · practical · 900 words · est. cov. 96 % · Një banesë për Samin
- **English title.** A flat for Sam
- **Situation.** Sam needs his own flat: the landlord shows an apartment on the second floor; rent, heating, electricity, what is in it, what is missing.
- **Cast.** Sam, Luan, a landlord
- **New (13; each exactly three times).** +banesë +qira +apartament +kat +ballkon +dysheme +frigorifer +pronar +rrymë +ngrohje +lagje +peshqir +sapun
- **Recycle (33).** plazh det anije varkë pushim +bregdet ishull tren turist +kapitull +varg ungjill psalm shpëtim kryq falje hir përulem +Krishtlindje +vallë kulturë ushqim festoj falënderoj muzikë +tradicional vizitoj dasmë +çift dimër pranverë +metër pothuajse
- **Focus.** negotiation with ju and conditional set phrases (do të doja, do të ishte mirë); contracts, rent, bills; passive meaning of non-active verbs (paguhet, jepet me qira) — keys: `conditional`.

#### sq-a2-2-02 · #117 · core · practical · 920 words · est. cov. 95 % · Datat dhe kalendari
- **English title.** Dates and the calendar
- **Situation.** The congregation plans its year: birthdays, a baptism, a camp in August, a concert in December; who is free in which month.
- **Cast.** Mira, Dritan, Sam, Gjergj
- **New (16; each exactly three times).** janar shkurt mars prill maj qershor korrik gusht shtator tetor nëntor dhjetor muaj sekondë moment +deri *(function words, no recycle slot: deri)*
- **Recycle (56).** +kala +kështjellë +monument +periudhë shekull mbret mbretëri perandori luftë epokë +pushtoj +themeloj +antik +zonë +trashëgimi +përfshij +shtrij +mesatar +rajon turist vendos +mision +misionar +vullnetar dyshoj fe paqe +ndjenjë liri lavdi +vendim +ndjej i huaj +varg psalm falje +Krishtlindje +Pashkë +vallë pemë kulturë ushqim gjellë festoj falënderoj dhuroj muzikë +tradicional këshilloj vizitoj dasmë ditëlindje +çift i tretë dimër pranverë
- **Focus.** dates with months (më 15 maj), years and centuries; ordinal numbers, "of the month" (e para e muajit); future and perfect in plans — keys: no detector fires for the new construction.

#### sq-a2-2-03 · #118 · core · conversation · 940 words · est. cov. 95 % · Kisha harruar çelësin
- **English title.** I had forgotten the key
- **Situation.** A day of small mishaps: a forgotten key, a late bus, an angry teacher; each person says what they had already done when it happened.
- **Cast.** Ardi, Drita, Ana, Sam
- **New (9; each exactly three times).** i mërzitur i zemëruar i shqetësuar i gëzuar i trishtuar i qetë sigurisht ndoshta vërtet
- **Recycle (45).** vendos +mision +misionar +vullnetar dyshoj besim fe dëshmi paqe gëzim +ndjenjë kuptim liri urtësi lavdi shpresë +vendim i krishterë +ndjej +rol i huaj +kapitull +varg ungjill psalm shpëtim kryq falje hir përulem +kufi fushë +bimë +malor +banesë +apartament +ballkon +frigorifer +ngrohje +sapun mars qershor shtator dhjetor moment
- **Focus.** pluperfect (kisha harruar, kishte ardhur); feelings and reasons; perfect vs pluperfect — keys: `pluperfect`.

#### sq-a2-2-04 · #119 · core · narrative · 960 words · est. cov. 93 % · Udhëtim në veri
- **English title.** A journey to the north
- **Situation.** Sam, Luan and Ana travel north to Shkodër by car and a hike; booking, a taxi, a guide, the lake, a missed turn.
- **Cast.** Sam, Luan, Ana
- **New (18; each exactly three times).** avion biçikletë valixhe udhëtim udhëtoj udhëtar mbërrij +taksi +rezervoj +ecje +udhëzues +ngas +peizazh +thërras +përgjatë i nxehtë i thatë i thellë *(function words, no recycle slot: përgjatë)*
- **Recycle (45).** kryq përulem +Pashkë pemë ushqim gjellë falënderoj dhuroj +tradicional këshilloj dasmë ditëlindje i tretë dimër +klimë +reshje +vapë +gradë +sipërfaqe +lartësi +gjatësi +veri +jug +lindje +perëndim +luginë +burim +kufi +përrua fushë ajër natyrë +bimë +metër +kilometër +malor pothuajse botë +pronar +lagje janar prill gusht nëntor sekondë
- **Focus.** long past narrative (aorist, imperfect, pluperfect); travel logistics; duke + participle — keys: `gerund-duke`, `pluperfect`.

#### sq-a2-2-05 · #120 · core · nonfiction · 980 words · est. cov. 94 % · Ekonomia e Shqipërisë
- **English title.** The economy of Albania
- **Situation.** A plain account of what Albania produces and sells: farming, tourism, trade, who governs; written as a school text.
- **Cast.** (impersonal)
- **New (21; each exactly three times).** +ekonomi +industri +turizëm +tregti +prodhim shitje blerje +fermer qeveri ligj president ministër kryetar ushtri komb +ekonomik +kryesisht +aktualisht +tregtar +industrial +popullor
- **Recycle (52).** +Krishtlindje +Pashkë +vallë pemë kulturë gjellë festoj dhuroj muzikë këshilloj vizitoj ditëlindje +çift i tretë pranverë +klimë +reshje +vapë +gradë +sipërfaqe +lartësi +gjatësi +veri +jug +lindje +perëndim +luginë +burim +kufi +përrua fushë ajër natyrë +bimë +metër +kilometër +malor pothuajse botë +banesë +qira +apartament +kat +ballkon +dysheme +frigorifer +pronar +rrymë +ngrohje +lagje +peshqir +sapun
- **Focus.** nonfiction register: participles, relative clauses, passives; figures, percentages, years (free); në vitin, gjatë, sipas — keys: `relative-clause`, `non-active-present`.

#### sq-a2-2-06 · #121 · vol · correspondence · 1000 words · est. cov. 98 % · Një email nga Gjergji
- **English title.** An email from Gjergj
- **Situation.** Gjergj writes from university in another town: his exams, a mistake in a form, a plan for the summer, a question for Sam.
- **Cast.** Gjergj, Sam
- **New (8; each exactly three times).** +sukses +gabim +plan +ide +arsye +rëndësi +gjendje +kusht
- **Recycle (45).** +klimë +reshje +vapë +gradë +sipërfaqe +lartësi +gjatësi +veri +jug +lindje +perëndim +luginë +burim +përrua ajër natyrë +kilometër botë +qira +kat +dysheme +rrymë +peshqir shkurt maj korrik tetor muaj i mërzitur i zemëruar i shqetësuar i gëzuar i trishtuar i qetë sigurisht ndoshta vërtet +ngas +thërras i thatë blerje president ushtri +kryesisht +popullor
- **Focus.** informal written register; reported speech (tha se, më shkroi që); recycling of school and plans — keys: no detector fires for the new construction.

#### sq-a2-2-07 · #122 · core · explanation · 1020 words · est. cov. 95 % · Bletët dhe mjalti
- **English title.** Bees and honey
- **Situation.** In the village the grandfather keeps bees: the queen, the workers, how honey is made, what flowers they visit; Ardi asks, the text explains.
- **Cast.** Ardi's grandfather, Ardi, Sam
- **New (15; each exactly three times).** bletë mjaltë insekt +mbretëreshë +nektar +larvë +thumb +prodhoj i veçantë i ndryshëm +mashkull +femër +tilla +ndërkohë +natyror *(function words, no recycle slot: tilla)*
- **Recycle (46).** +banesë +qira +apartament +kat +ballkon +dysheme +frigorifer +pronar +rrymë +ngrohje +lagje +peshqir +sapun janar shkurt mars prill maj qershor korrik gusht shtator tetor nëntor dhjetor muaj sekondë moment avion biçikletë valixhe udhëtim udhëtoj udhëtar mbërrij +taksi +rezervoj +ecje +udhëzues +ngas +peizazh +thërras i nxehtë i thatë i thellë +industrial
- **Focus.** explanatory present, general statements; relative clauses, comparatives, superlative first met (më i madhi); sentence connectors (kurse, ndërsa) — keys: `superlative`, `relative-clause`.

#### sq-a2-2-08 · #123 · core · explanation · 1040 words · est. cov. 94 % · Ushqimi dhe shëndeti
- **English title.** Food and health
- **Situation.** Ana explains to Sam and Drita what a healthy meal is: vegetables and fruit, less sugar, enough water; why too much of one thing harms.
- **Cast.** Ana, Sam, Drita
- **New (16; each exactly three times).** +fasule +limon byrek i shëndetshëm i ëmbël i hidhur +vitaminë +substancë +energji +dëm +i dëmshëm pulë +megjithatë +mirëpo +produkt +masë *(function words, no recycle slot: mirëpo)*
- **Recycle (59).** janar shkurt mars prill maj qershor korrik gusht shtator tetor nëntor dhjetor muaj sekondë moment i mërzitur i zemëruar i shqetësuar i gëzuar i trishtuar i qetë sigurisht ndoshta vërtet +ekonomi +industri +turizëm +tregti +prodhim shitje blerje +fermer qeveri ligj president ministër kryetar ushtri komb +ekonomik +kryesisht +aktualisht +tregtar +industrial +popullor bletë mjaltë insekt +mbretëreshë +nektar +larvë +thumb +prodhoj i veçantë i ndryshëm +mashkull +femër +ndërkohë +natyror
- **Focus.** advice and obligation (duhet të, mos …); cause and effect (prandaj, sepse, për shkak të); general statements with substances and quantities — keys: `modal-te`.

#### sq-a2-2-09 · #124 · vol · narrative · 1060 words · est. cov. 98 % · Një ditë shiu në Tiranë
- **English title.** A rainy day in Tirana
- **Situation.** A grey, rainy Saturday: the umbrella that turns inside out, wet socks, a hat, a girl who sees her face in a puddle.
- **Cast.** Sam, Elira, Ardi
- **New (7; each exactly three times).** +çadër fytyrë flok pasqyrë kapelë çorape krah
- **Recycle (35).** i mërzitur i zemëruar i shqetësuar i gëzuar i trishtuar i qetë sigurisht ndoshta vërtet avion biçikletë valixhe udhëtim udhëtoj udhëtar mbërrij +taksi +rezervoj +ecje +udhëzues +peizazh i nxehtë i thellë qeveri ministër komb +aktualisht +sukses +gabim +plan +ide +arsye +rëndësi +gjendje +kusht
- **Focus.** recycling of weather, clothes and body; imperfect for description, aorist for events — keys: no detector fires for the new construction.

#### sq-a2-2-10 · #125 · core · biography · 1080 words · est. cov. 96 % · Nënë Tereza
- **English title.** Mother Teresa
- **Situation.** A short life of Mother Teresa as told in a school reader: born in Skopje, to India, the sick and the poor, the prize, her death. Facts to be checked by a person.
- **Cast.** (impersonal; a school text), Luan reading it to Ardi
- **New (13; each exactly three times).** +murgeshë +urdhër +varfëri i varfër i pasur i nderuar shenjtor +shpërblim ndjek ofroj organizoj qëndroj vazhdoj
- **Recycle (38).** avion biçikletë valixhe udhëtim udhëtoj udhëtar mbërrij +taksi +rezervoj +ecje +udhëzues +ngas +peizazh +thërras i nxehtë i thatë i thellë +ekonomi +industri +turizëm +tregti +prodhim shitje +fermer ligj kryetar +ekonomik +tregtar i ndryshëm +femër +natyror i ëmbël +substancë +i dëmshëm +produkt fytyrë pasqyrë krah
- **Focus.** biography in the aorist and perfect, years and places; relative clauses, apposition (Nënë Tereza, shqiptare nga Shkupi); a person of the church, told as history — keys: `relative-clause`, `perfect`.

#### sq-a2-2-11 · #126 · core · church · 1100 words · est. cov. 96 % · Lutje dhe urime
- **English title.** Prayers and blessings
- **Situation.** Pastor Pjetër prays with the congregation for the sick and for a family; Drita teaches Sam the usual blessings and thanks; Sam writes his first prayer.
- **Cast.** Pastor Pjetër, Drita, Sam, Mira
- **New (14; each exactly three times).** parajsë engjëll profet apostull dishepull mrekulli pendim besimtar mëkatar bekoj lavdëroj bindem i shenjtë i bekuar
- **Recycle (51).** +ekonomi +industri +turizëm +tregti +prodhim shitje blerje +fermer qeveri ligj president ministër kryetar ushtri komb +ekonomik +kryesisht +aktualisht +tregtar +industrial +popullor +sukses +gabim +plan +ide +arsye +rëndësi +gjendje +kusht +fasule +limon byrek i hidhur +energji pulë +masë fytyrë kapelë +murgeshë +urdhër +varfëri i varfër i pasur i nderuar shenjtor +shpërblim ndjek ofroj organizoj qëndroj vazhdoj
- **Focus.** optative in blessings and wishes (Qofsh i bekuar! Zoti të ruajtë!), receptive only; imperative and subjunctive in prayer; church words in a plain sentence, no Scripture quotation — keys: `optative`, `imperative-pronoun`.

#### sq-a2-2-12 · #127 · vol · conversation · 1120 words · est. cov. 98 % · Një darkë me miq
- **English title.** Dinner with friends
- **Situation.** Sam cooks for the first time for his friends; a glass breaks, the soup is too salty, everybody laughs and eats.
- **Cast.** Drita, Ana, Luan, Dritan, Mira, Sam
- **New (6; each exactly three times).** pirun gotë shishe tenxhere kuzhinier mikeshë
- **Recycle (39).** +sukses +gabim +plan +ide +arsye +rëndësi +gjendje +kusht bletë mjaltë insekt +mbretëreshë +nektar +larvë +thumb +prodhoj i veçantë i ndryshëm +mashkull +femër +ndërkohë +natyror +fasule +limon byrek i shëndetshëm i ëmbël i hidhur +vitaminë +substancë +energji +dëm +i dëmshëm pulë +megjithatë +produkt +masë pasqyrë çorape
- **Focus.** hospitality, toasts and thanks; recycling of the table and the kitchen; conditional in polite requests — keys: no detector fires for the new construction.

#### sq-a2-2-13 · #128 · core · testimony · 1140 words · est. cov. 96 % · Dëshmia e Dritanit
- **English title.** Dritan's testimony
- **Situation.** Dritan tells the group how he lived before he believed: work, pride, a lie that cost him a friend, the hard year, what changed him.
- **Cast.** Dritan, Mira, Sam
- **New (14; each exactly three times).** shpirt mendje mendim forcë fuqi frymë ringjallje ngushëlloj gënjej i vërtetë i drejtë i qartë +siç +pasi *(function words, no recycle slot: siç, pasi)*
- **Recycle (45).** bletë mjaltë insekt +mbretëreshë +nektar +larvë +thumb +prodhoj i veçantë +mashkull +ndërkohë i shëndetshëm +vitaminë +dëm +megjithatë +çadër flok çorape +murgeshë +urdhër +varfëri i varfër i pasur i nderuar shenjtor +shpërblim ndjek ofroj organizoj qëndroj vazhdoj parajsë engjëll profet apostull dishepull mrekulli pendim besimtar mëkatar bekoj lavdëroj bindem i shenjtë i bekuar
- **Focus.** conditional (do të kisha …, sikur …); reflection on change in the three pasts; church testimony language, no Scripture quotation — keys: `conditional`.

#### sq-a2-2-14 · #129 · vol · practical · 1160 words · est. cov. 97 % · Një CV dhe një punë
- **English title.** A CV and a job
- **Situation.** Sam writes a CV in Albanian for a teaching job; Luan corrects it; the text shows the CV, the covering message and an interview.
- **Cast.** Sam, Dritan, Luan
- **New (10; each exactly three times).** avokat inxhinier mësuese koleg gazetar artist +aftësi +kandidat +i aftë +punësoj
- **Recycle (35).** +fasule +limon byrek i shëndetshëm i ëmbël i hidhur +vitaminë +substancë +energji +dëm +i dëmshëm pulë +megjithatë +produkt +masë +çadër flok kapelë krah parajsë engjëll profet apostull dishepull mrekulli pendim besimtar mëkatar bekoj lavdëroj bindem i shenjtë i bekuar gotë kuzhinier
- **Focus.** pa + participle (pa kaluar, pa pyetur); writing a CV and a covering message; professions in the present and the past — keys: `without-pa`.

#### sq-a2-2-15 · #130 · vol · correspondence · 1180 words · est. cov. 97 % · Kartolina nga Berati
- **English title.** A postcard from Berat
- **Situation.** Four postcards from a weekend in Berat: the castle, the white houses, the river, the room with a view.
- **Cast.** Sam, Ana
- **New (8; each exactly three times).** +pamje i pastër i plotë i hapur gati bosh mbrëmë sonte
- **Recycle (36).** +çadër fytyrë flok pasqyrë kapelë çorape krah ndjek organizoj vazhdoj i shenjtë pirun gotë shishe tenxhere kuzhinier mikeshë shpirt mendje mendim forcë fuqi frymë ngushëlloj i vërtetë i qartë avokat inxhinier mësuese koleg gazetar artist +aftësi +kandidat +i aftë +punësoj
- **Focus.** short written travel messages; recycling of places and adjectives — keys: no detector fires for the new construction.

#### sq-a2-2-16 · #131 · core · nonfiction · 1200 words · est. cov. 94 % · Turizmi në Shqipëri
- **English title.** Tourism in Albania
- **Situation.** A guide to what to see: Berat and Gjirokastër on the lists of world heritage, the ruins of Butrint, the lake of Shkodër, the national parks.
- **Cast.** (impersonal)
- **New (26; each exactly three times).** gjendem quaj lidh përmend shpall krijoj mbroj zhvilloj zbuloj +kullë +pallat +teatër +komunë +pikë +anë +vendas xhami +përveç +turistik +arkeologjik +mesdhetar +bregdetar +detar +jugor +verior +territor *(function words, no recycle slot: përveç)*
- **Recycle (33).** +murgeshë +urdhër +varfëri i varfër i pasur i nderuar shenjtor +shpërblim ofroj qëndroj bindem pirun tenxhere shpirt mendje mendim forcë fuqi frymë ringjallje ngushëlloj gënjej i vërtetë i drejtë i qartë +pamje i pastër i plotë i hapur gati bosh mbrëmë sonte
- **Focus.** descriptive nonfiction (library direction); gjendet, quhet, njihet, ndodhet; lists of places with relative clauses — keys: `non-active-present`, `relative-clause`.

#### sq-a2-2-17 · #132 · core · explanation · 1220 words · est. cov. 94 % · Shqipëria në shekuj
- **English title.** Albania through the centuries
- **Situation.** Luan teaches an outline of Albanian history: ancient peoples, the Ottoman centuries, independence in 1912, the twentieth century, today.
- **Cast.** Luan (teaching), Gjergj
- **New (23; each exactly three times).** shqiptar grek italian serb gjerman francez amerikan evropian +sundim +pavarësi +lëvizje +zgjedhje +parti +kuvend +kushtetutë +mes +osman +ilir +bizantin +turk +mesjetar +lindor +perëndimor *(function words, no recycle slot: mes)*
- **Recycle (52).** parajsë engjëll profet apostull dishepull mrekulli pendim besimtar mëkatar bekoj lavdëroj i bekuar shishe mikeshë avokat inxhinier mësuese koleg gazetar artist +aftësi +kandidat +i aftë +punësoj i plotë gati mbrëmë gjendem quaj lidh përmend shpall krijoj mbroj zhvilloj zbuloj +kullë +pallat +teatër +komunë +pikë +anë +vendas xhami +turistik +arkeologjik +mesdhetar +bregdetar +detar +jugor +verior +territor
- **Focus.** history in the aorist and the participle as adjective; sundoi, u shpall, u krijua; long sentences with connectors — keys: `non-active-u`.

#### sq-a2-2-18 · #133 · vol · narrative · 1240 words · est. cov. 98 % · Gjyshi tregon edhe një herë
- **English title.** Grandfather tells once more
- **Situation.** The grandfather tells again the story of the two brothers and the secret of the spring; the children say they know it, and listen.
- **Cast.** Ardi's grandfather, Ardi, Elira
- **New (4; each exactly three times).** i njëjtë i ngjashëm i largët i afërt
- **Recycle (61).** pirun gotë shishe tenxhere kuzhinier mikeshë shpirt mendje mendim forcë fuqi frymë ringjallje ngushëlloj gënjej i vërtetë i drejtë i qartë +pamje i pastër i plotë i hapur gati bosh mbrëmë sonte gjendem quaj lidh shpall mbroj zbuloj +teatër +pikë +vendas +turistik +mesdhetar +detar +verior shqiptar grek italian serb gjerman francez amerikan evropian +sundim +pavarësi +lëvizje +zgjedhje +parti +kuvend +kushtetutë +osman +ilir +bizantin +turk +mesjetar +lindor +perëndimor
- **Focus.** story in the three pasts and direct speech; recycling — keys: no detector fires for the new construction.

#### sq-a2-2-19 · #134 · core · nonfiction · 1260 words · est. cov. 94 % · Tirana sot
- **English title.** Tirana today
- **Situation.** What the capital is now: transport, traffic, universities, new districts, investment, culture; a page from a school atlas.
- **Cast.** (impersonal)
- **New (23; each exactly three times).** +transport +institucion +sektor +zhvillim +qendror +urban i gjallë i fuqishëm i rrezikshëm i mrekullueshëm sidomos veçanërisht +përmes +administrativ +karakteristik +lokal +botëror +ndërtim +nivel +formë +sistem +krahinë +rast *(function words, no recycle slot: përmes)*
- **Recycle (64).** ringjallje gënjej i drejtë avokat inxhinier mësuese koleg gazetar artist +aftësi +kandidat +i aftë +punësoj gjendem quaj lidh përmend shpall krijoj mbroj zhvilloj zbuloj +kullë +pallat +teatër +komunë +pikë +anë +vendas xhami +turistik +arkeologjik +mesdhetar +bregdetar +detar +jugor +verior +territor shqiptar grek italian serb gjerman francez amerikan evropian +sundim +pavarësi +lëvizje +zgjedhje +parti +kuvend +kushtetutë +osman +ilir +bizantin +turk +mesjetar +lindor +perëndimor i njëjtë i ngjashëm i largët i afërt
- **Focus.** descriptive present, participles and relative clauses; comparison with the past (dikur … sot); nëpërmjet, përmes, përgjatë — keys: `relative-clause`.

#### sq-a2-2-20 · #135 · vol · testimony · 1280 words · est. cov. 98 % · Një vit në Shqipëri
- **English title.** A year in Albania
- **Situation.** A year on, Sam speaks to the congregation: what he could not say, what he can say now, whom he thanks, what he promises.
- **Cast.** Sam (speaking), Pastor Pjetër, Ana, Luan
- **New (9; each exactly three times).** mundem dukem përpiqem habitem kënaqem premtoj pranoj lejoj respektoj
- **Recycle (65).** +pamje i pastër i hapur bosh sonte përmend krijoj zhvilloj +kullë +pallat +komunë +anë xhami +arkeologjik +bregdetar +jugor +territor shqiptar grek italian serb gjerman francez amerikan evropian +sundim +pavarësi +lëvizje +zgjedhje +parti +kuvend +kushtetutë +osman +ilir +bizantin +turk +mesjetar +lindor +perëndimor i njëjtë i ngjashëm i largët i afërt +transport +institucion +sektor +zhvillim +qendror +urban i gjallë i fuqishëm i rrezikshëm i mrekullueshëm sidomos veçanërisht +administrativ +karakteristik +lokal +botëror +ndërtim +nivel +formë +sistem +krahinë +rast
- **Focus.** all tenses: present, perfect, aorist, imperfect, future, conditional; summing up a year (në fillim … tani … në të ardhmen); church testimony language, no Scripture quotation — keys: no detector fires for the new construction.

## 4. The existing drafts and seeds

All a1-1 units and seeds are machine-drafted, unreviewed and unpublished. What exists beyond them:

- **`dialogue-01` "Një bisedë"** (49 words, `data/corpus/sq`; Pavli and Ana on forgiveness): 91.8 % known after a1-1, ≥ 92 % after a1-2-01, ≥ 95 % after a1-2-07 *(estimated)*. It can be placed as a short reading from a1-2-07 on and is a seed for a2-1-16 (the pastor and Sam). Its Ana is the Udha Ana: rename her.
- **`story-01` "Historia ime"** (62 words; a first testimony in the past tenses): 85.5 % known after a1-1, ≥ 92 % after a2-1-11, ≥ 95 % after a2-1-15 *(estimated)*. A seed for a2-1-15 (Si erdha në Shqipëri).
- **The 8 historical fables** (`data/sources/sq-gap-recovery`, 1,590 running words in all by the adapter; Wikisource, historical spelling, **rights unverified, quarantined, not built**): 66–76 % known at the end of a2-2, so not ladder texts. Library, not ladder, until a person has checked the editions; if used, they are adaptations into modern Standard Albanian (a new text), not placements.

| text | words | after a1-1 | after a1-2 | after a2-1 | after a2-2 | first unit ≥ 92 % |
|---|---:|---:|---:|---:|---:|---|
| sq-gap-recovery-historical-fables-01 (Bretkosa që deshi të trashej sa një Ka) | 110 | 50 | 62 | 70 | 70 | — |
| sq-gap-recovery-historical-fables-02 (Korbi dhe Dhelpra) | 135 | 50 | 64 | 72 | 73 | — |
| sq-gap-recovery-historical-fables-03 (Lopa, Dhija, Delja dhe Luani) | 220 | 54 | 61 | 75 | 75 | — |
| sq-gap-recovery-historical-fables-04 (Luani dhe Miu) | 143 | 53 | 62 | 73 | 75 | — |
| sq-gap-recovery-historical-fables-05 (Maçoku dhe Miu plak) | 223 | 50 | 58 | 66 | 67 | — |
| sq-gap-recovery-historical-fables-06 (Millonai, i Biri dhe një Gomar) | 369 | 49 | 57 | 66 | 68 | — |
| sq-gap-recovery-historical-fables-07 (Ujku dhe Qengji) | 144 | 51 | 62 | 72 | 73 | — |
| sq-gap-recovery-historical-fables-08 (Zogu dhe Djali) | 246 | 54 | 65 | 70 | 72 | — |
| story-01 (Historia ime) | 62 | 85 | 89 | 97 | 97 | sq-a2-1-11 |
| dialogue-01 (Një bisedë) | 49 | 92 | 96 | 98 | 98 | sq-a1-2-01 |

- The 20 Udha / Misioni texts sit inside a1-1 and are not touched. `bible-1john-1` is a technical fixture that never ships.

## 5. The b1-bridge: how to fill it

### 5.1 What the library offers, measured against this ladder

The library (`public/library/sq`, built 2026-10-04) holds **38 texts, 24,566 running words**: 27 Albanian Wikipedia sections ("sq-modern-open", `mo-` below; geography, history, nature of Tirana, Durrës and Albania, plus `Ushqimi, Qeni, Macja, Bleta, Mali, Deti`), 10 longer Wikipedia readings ("sq-modern-gap-readings", `gap-`: Berat, Gjirokastër, Korçë, Vlorë, Vjosa, the Alps, Shkodër lake, Butrint, two national parks) and one Global Voices excerpt (`gv-`, 307 words, published). The 37 Wikipedia texts are CC BY-SA and the Global Voices excerpt carries an open licence; the library records all 38 as `verified-open-licence`; the 37 Wikipedia texts are `published: false` (stage 7, "educational reference", held back pending native review). All are nonfiction; **none is narrative, dialogue or correspondence**.

Method *(estimated)*: for each text, the share of its running words that are known after a given unit = auto-known tokens (names and numerals) plus the tokens whose first-reading lemma has been met three times in Stage 0, a1-1 and the plan's lemma lists, with each `+` word's inflected forms matched to its lemma by stem. Three scenarios: **strict** (the gate as it is today), **policy** (additionally: an unknown word written with a capital inside a sentence counts as a proper noun, and Roman numerals as numerals; section 6.3), and **policy + b1 list** (the 182 words of section 6.2 taught as well). Overall:

| | share of the library's 24,566 words known |
|---|---:|
| after Stage 0 and a1-1 (strict) | 45.5 % |
| after a2-2, strict | 73.8 % |
| after a2-2, policy | 81.1 % |
| after a2-2, policy and the b1 list | 85.6 % |

Lemmas still needed on top of the plan (clusters of missing forms by frequency over the whole library, policy reading, *estimated*): **82 for 85 %, 234 for 88 %, 388 for 90 %, 602 for 92 %, 1080 for 95 %**. Per text:

| text | words | after a1-1 | after a1-2 | after a2-1 | after a2-2 | strict reading at a2-2 | first unit ≥ 92 % | first unit ≥ 95 % | lemma clusters still needed for 92 % / 95 % |
|---|---:|---:|---:|---:|---:|---:|---|---|---|
| mo-durresi-klima | 28 | 46.4 | 60.7 | 64.3 | 100.0 | 100.0 | sq-a2-2-04 | sq-a2-2-04 | 0 / 0 |
| mo-tirana-institucione | 60 | 58.3 | 61.7 | 93.3 | 95.0 | 80.0 | sq-a2-1-18 | sq-a2-2-13 | 0 / 0 |
| mo-durresi-gjeografia | 50 | 52.0 | 64.0 | 88.0 | 94.0 | 88.0 | sq-a2-2-13 | — | 0 / 1 |
| mo-shqiperia-relievi | 240 | 54.2 | 62.1 | 80.4 | 89.6 | 73.8 | — | — | 5 / 12 |
| mo-tirana-demografia | 270 | 59.3 | 70.4 | 83.7 | 87.8 | 79.3 | — | — | 9 / 17 |
| mo-shqiperia-klima | 99 | 53.5 | 68.7 | 81.8 | 86.9 | 83.8 | — | — | 5 / 8 |
| mo-durresi-transporti | 15 | 40.0 | 60.0 | 73.3 | 86.7 | 86.7 | — | — | 1 / 2 |
| mo-tirana-historia | 636 | 55.8 | 64.6 | 77.7 | 86.0 | 81.1 | — | — | 26 / 45 |
| mo-tirana-gjeografia | 198 | 53.5 | 64.6 | 81.3 | 85.4 | 75.8 | — | — | 6 / 12 |
| mo-tirana-turizmi | 379 | 53.8 | 62.3 | 75.5 | 85.0 | 74.4 | — | — | 22 / 34 |
| gap-korca | 1681 | 53.5 | 64.2 | 76.2 | 84.3 | 75.9 | — | — | 94 / 144 |
| mo-shqiperia-popullsia | 851 | 57.5 | 65.6 | 79.7 | 84.3 | 77.6 | — | — | 34 / 60 |
| gap-liqeni-shkoder | 299 | 56.2 | 63.2 | 76.9 | 83.9 | 76.9 | — | — | 19 / 28 |
| gap-gjirokastra | 3568 | 55.3 | 65.4 | 77.1 | 83.8 | 70.6 | — | — | 150 / 257 |
| gap-butrinti | 226 | 50.4 | 58.0 | 77.4 | 83.6 | 75.7 | — | — | 14 / 21 |
| mo-tirana-ekonomia | 122 | 53.3 | 64.8 | 70.5 | 83.6 | 83.6 | — | — | 11 / 14 |
| mo-shqiperia-historia | 456 | 51.8 | 59.0 | 72.8 | 83.3 | 74.6 | — | — | 34 / 48 |
| gap-vlora | 1400 | 55.3 | 64.8 | 75.3 | 83.1 | 73.9 | — | — | 76 / 118 |
| mo-shqiperia-gjeografia | 316 | 55.1 | 62.0 | 78.5 | 82.9 | 74.1 | — | — | 10 / 20 |
| mo-durresi-historia | 184 | 50.5 | 60.3 | 74.5 | 82.1 | 72.3 | — | — | 18 / 23 |
| mo-tirana-klima | 27 | 59.3 | 63.0 | 70.4 | 81.5 | 70.4 | — | — | 3 / 4 |
| mo-bleta | 1286 | 48.4 | 58.2 | 68.0 | 81.3 | 80.7 | — | — | 83 / 121 |
| mo-tirana-transporti | 253 | 49.8 | 64.0 | 72.3 | 81.0 | 78.7 | — | — | 25 / 33 |
| gap-park-lura | 725 | 49.4 | 62.9 | 75.4 | 80.7 | 74.5 | — | — | 34 / 56 |
| mo-mali | 188 | 45.7 | 57.4 | 70.2 | 80.3 | 73.4 | — | — | 19 / 25 |
| gap-berati | 3019 | 52.4 | 62.3 | 73.7 | 80.0 | 73.0 | — | — | 201 / 292 |
| gap-alpet-shqiptare | 1504 | 49.3 | 60.2 | 72.8 | 79.7 | 70.2 | — | — | 74 / 119 |
| mo-durresi-prejardhja | 489 | 56.9 | 67.3 | 74.0 | 79.6 | 68.3 | — | — | 32 / 47 |
| mo-macja | 776 | 51.9 | 65.1 | 73.7 | 78.7 | 78.2 | — | — | 63 / 87 |
| mo-tirana-arkeologjia | 234 | 47.9 | 58.5 | 70.9 | 78.2 | 75.2 | — | — | 21 / 28 |
| gap-lumi-vjosa | 2056 | 49.4 | 57.2 | 70.4 | 77.0 | 69.7 | — | — | 150 / 212 |
| mo-shqiperia-ekonomia | 390 | 45.9 | 56.2 | 68.2 | 76.7 | 72.6 | — | — | 45 / 57 |
| mo-ushqimi | 797 | 48.7 | 58.7 | 66.4 | 76.5 | 75.8 | — | — | 77 / 101 |
| mo-qeni | 635 | 53.7 | 64.3 | 71.3 | 76.4 | 75.1 | — | — | 72 / 91 |
| mo-deti | 547 | 42.2 | 51.7 | 66.7 | 73.9 | 73.5 | — | — | 77 / 93 |
| gv-excerpt | 307 | 45.6 | 53.7 | 64.8 | 71.3 | 64.8 | — | — | 49 / 58 |
| mo-shqiperia-politika | 121 | 43.8 | 49.6 | 60.3 | 71.1 | 71.1 | — | — | 22 / 25 |
| gap-park-dajti | 134 | 38.8 | 44.8 | 55.2 | 58.2 | 53.0 | — | — | 18 / 22 |

Columns: coverage in percent *(policy reading, estimated)* after a1-1, a1-2, a2-1, a2-2; the strict reading at a2-2; the first plan unit after which the text is ≥ 92 % (the gate's authentic-unit warning line) and ≥ 95 % (`ladder:place`'s threshold); the number of extra lemma clusters (clusters of forms, an upper bound on lemmas) that would lift the text to 92 % / 95 % at the end of a2-2. Reading the table:

- **Nothing of useful size is placeable at the end of a2-2.** The three that reach 92 % are 28, 60 and 50 words. The nearest sizeable texts need **1–10 more lemmas for 92 % and 2–20 for 95 %** (Shqipëri — Relievi 5 / 12, Tirana — Demografia 9 / 17, Shqipëri — Klima 5 / 8, Tirana — Gjeografia 6 / 12, Shqipëri — Gjeografia 10 / 20, Tirana — Klima 3 / 4, Durrës — Transporti 1 / 2; extra lemma clusters for 92 % / 95 %): one adapted unit of the b1-bridge would put them all in reach.
- **The short Tirana, Durrës and Albania sections** (1,425 words in the eleven nearest) are the first authentic placements; **the animal, food and nature texts** (`Bleta, Qeni, Macja, Ushqimi, Deti`, 4.0 k words, 60–80 clusters short each) need an adapted unit on each topic; **the long gap readings** (Berat, Gjirokastër, Korçë, Vlorë, Vjosa, the Alps: 13.2 k words, 70–185 clusters each) are the b1-c placements.
- **Scraping residue.** `gap-park-dajti`, `gap-alpet-shqiptare` and `gap-lumi-vjosa` contain the Wikipedia coordinate template's CSS ("mw-parser-output .geo-default … display:inline … longitude latitude white-space:nowrap", about 24 junk tokens each) and the Shkodër lake text contains Cyrillic and IPA lines; clean them in the source before any placement.

Library lemmas to schedule vocabulary toward: the 70 most frequent lemmas that a1-1 does not make known, with the unit that teaches each (of the top 120, 108 are taught in the plan, 4 are on the b1 list, 8 are names, artefacts or words nobody schedules):

| lemma (cluster) | tokens | texts | taught in |
|---|---:|---:|---|
| qytet | 188 | 19 | sq-a1-2-12 |
| vit | 132 | 23 | sq-a1-2-23 |
| u | 119 | 28 | a1-2 top-up |
| i parë | 118 | 23 | sq-a2-1-09 |
| cili | 111 | 24 | a1-2 top-up |
| i tjetër | 96 | 19 | sq-a2-1-02 |
| i tyre | 80 | 13 | sq-a1-2-05 |
| i lartë | 80 | 18 | sq-a1-2-25 |
| shqiptar | 78 | 14 | sq-a2-2-17 |
| vend | 74 | 23 | sq-a1-2-25 |
| duke | 72 | 17 | sq-a2-1-04 |
| i saj | 71 | 17 | sq-a1-2-05 |
| lumë | 67 | 13 | sq-a2-1-01 |
| prej | 66 | 21 | sq-a1-2-18 |
| rreth | 65 | 19 | sq-a2-1-08 |
| deri | 63 | 19 | sq-a2-2-02 |
| mal | 63 | 11 | sq-a1-2-14 |
| i rëndësishëm | 60 | 13 | sq-a2-1-05 |
| km | 58 | 14 | b1-bridge list (section 6) |
| pjesë | 57 | 21 | sq-a1-2-25 |
| qendër | 57 | 14 | sq-a1-2-12 |
| zonë | 55 | 12 | sq-a2-1-14 |
| emër | 54 | 14 | sq-a1-2-05 |
| det | 50 | 12 | sq-a2-1-13 |
| kombëtar | 47 | 14 | sq-a2-1-08 |
| bletë | 45 | 2 | sq-a2-2-07 |
| shekull | 45 | 12 | sq-a2-1-14 |
| jug | 44 | 13 | sq-a2-1-18 |
| e | 42 | 16 | sq-a2-1-08 |
| m | 42 | 8 | b1-bridge list (section 6) |
| disa | 41 | 16 | sq-a2-1-02 |
| sipas | 39 | 17 | sq-a2-1-11 |
| veri | 39 | 12 | sq-a2-1-18 |
| i zi | 39 | 6 | sq-a1-2-08 |
| gjatë | 38 | 14 | sq-a2-1-17 |
| park | 38 | 7 | sq-a2-1-08 |
| luginë | 38 | 5 | sq-a2-1-18 |
| i ndryshëm | 37 | 9 | sq-a2-2-07 |
| kur | 37 | 13 | sq-a1-2-01 |
| i vetëm | 36 | 13 | sq-a2-1-03 |
| i njohur | 36 | 13 | sq-a2-1-08 |
| i gjerë | 36 | 12 | sq-a1-2-25 |
| kohë | 35 | 16 | a1-2 top-up |
| gjendem | 35 | 16 | sq-a2-2-16 |
| perëndim | 35 | 17 | sq-a2-1-18 |
| i fundit | 34 | 11 | sq-a2-1-09 |
| ose | 33 | 17 | sq-a1-2-07 |
| etj | 33 | 13 | b1-bridge list (section 6) |
| ndodhem | 33 | 18 | sq-a1-2-18 |
| nën | 32 | 11 | sq-a1-2-06 |
| kala | 32 | 5 | sq-a2-1-14 |
| banor | 32 | 10 | sq-a2-1-02 |
| ndërtim | 30 | 15 | sq-a2-2-19 |
| shpall | 30 | 12 | sq-a2-2-16 |
| shek | 30 | 7 | b1-bridge list (section 6) |
| liqen | 30 | 6 | sq-a2-1-01 |
| ekonomi | 30 | 6 | sq-a2-2-05 |
| ndërsa | 29 | 17 | sq-a2-1-02 |
| lartësi | 29 | 8 | sq-a2-1-18 |
| alp | 29 | 2 | not scheduled (name, artefact or tail) |
| tjetër | 28 | 15 | sq-a2-1-02 |
| kufi | 28 | 11 | sq-a2-1-18 |
| i dytë | 27 | 8 | sq-a2-1-09 |
| kryesor | 27 | 12 | sq-a2-1-08 |
| ndërtoj | 26 | 9 | sq-a2-1-02 |
| popullsi | 26 | 10 | sq-a2-1-08 |
| vjosë | 26 | 4 | not scheduled (name, artefact or tail) |
| malor | 25 | 7 | sq-a2-1-18 |
| vjosa | 25 | 1 | not scheduled (name, artefact or tail) |
| përdor | 24 | 11 | sq-a2-1-06 |

### 5.2 A fill plan for about 54 000 words (30–60 k allowed)

| block | words | kind | content | lemmas known at the end (estimate) |
|---|---:|---|---|---:|
| B1-a | ≈ 6 k | adapted (new text) | 6 units of about 1,000 words: the 5–12 lemmas each that the eleven nearest library texts lack (relief, climate, demography, geography, transport, economy), the first 60–70 words of the b1 list, recycling of the 93 lemmas that a2-2-15 … 20 introduce and the ladder cannot recycle | ≈ 1,150 |
| B1-a placements | ≈ 1.4 k | authentic | the eleven nearest texts of the table (Durrës — Klima, Tirana — Institucione, Durrës — Gjeografia, Shqipëri — Relievi, Klima, Gjeografia, Tirana — Demografia, Gjeografia, Klima, Durrës — Transporti, Tirana — Ekonomia), each as it clears 92 % | ≈ 1,200 |
| B1-b | ≈ 13 k | adapted | 12 units of about 1,100 words in the domains the library does not have: narrative, correspondence, biography, instructions, plus explanation on the library's own topics (bees, dogs, cats, the sea, food and health, the history of Tirana and Albania) | ≈ 1,450 |
| B1-b placements | ≈ 7.9 k | authentic | `Bleta` (1,286), `Ushqimi` (797), `Macja` (776), `Qeni` (635), `Deti` (547); Tirana / Shqipëri / Durrës — Historia (636, 456, 184), Prejardhja (489), Popullsia (851), Turizmi (379), Transporti (253), Arkeologjia (234), Shqipëri — Ekonomia (390) | ≈ 1,550 |
| B1-c | ≈ 11 k | adapted | 10 units of about 1,100 words that prepare the long readings: city and landscape monographs in plain Albanian (Berat, Gjirokastër, Korçë, Vlorë, the Vjosa, the Alps) with the lemmas the gap texts need (about 450 more) | ≈ 1,750 |
| B1-c placements | ≈ 15 k | authentic | `gap-` Berat (3,019), Gjirokastër (3,568), Korçë (1,681), Vlorë (1,400), Vjosa (2,056), the Alps (1,504), Lura (725), Shkodër (299), Butrint (226), Dajti (134), `gv-` excerpt (307): 14.9 k | ≈ 1,950 |

At the end the learner has met about 1,950 lemmas: the plan's 1,057, about 600 taught in the 30 k words of adapted units (two per 100 words) and about 300 met for the first time in the authentic texts. That is more than the 1,659 lemmas that 92 % of the library needs (the plan's 1,057 plus 602) and a little less than the 2,137 for 95 %. The bridge is 54 k words of which 24 k are authentic (the whole library but a few unusable texts); the contract's "authentic units increasingly dominant" holds only in the last block. This is a bridge into the *open library of Wikipedia-register nonfiction*, which is all the library holds in Albanian.

### 5.3 If no library text fits: the adapted texts to commission

1. **Plain-Albanian nonfiction on Albanian geography, history and nature**: 800–1,500 words each, written new (not copied from Wikipedia), facts checked by a person; about 14 units; the b1-a and b1-c units above.
2. **Narrative, dialogue and correspondence** (the library has none): the Sam / Ana / Luan / Drita storyline continued, about 10 units.
3. **Biographies of composite or consenting people** (a nurse, a teacher, a pastor) and of public figures with checked facts (Mother Teresa is in a2-2-10): about 4 units.
4. **Church-life and testimony units** beyond the ones in the plan: about 4 units, theologically reviewed.
5. **Retellings of the eight historical fables** into modern Standard Albanian, as new adapted texts, once someone has checked the Wikisource editions.
6. **More open sources**, each verified per text: further Albanian Wikipedia sections (CC BY-SA, the same acquisition helper), more Global Voices in Albanian (CC BY; only one excerpt is in the library; the excerpt's 72 % comes from foreign names and abbreviations). Measure the lemma gap as in 5.1 before acquiring.
7. **Scripts for listening**: every b1 adapted unit should be recordable in one sitting (≤ 1,100 words).

### 5.4 Hold or avoid

- The **Albanian Bible**: not available; the course's own record says the provenance of the "ALB" text is not established; an outside YouVersion link is a link, not a text. No unit quotes or retells any passage.
- The **eight fables** (rights unverified, historical spelling, 66–76 % known): library only.
- The **three gap texts with CSS residue** and the **Shkodër lake text with Cyrillic**: clean first.
- The **Global Voices excerpt** (Uzbekistan's air pollution): 72 % known at the end; foreign proper names and abbreviations make it a late b1 text.
- Wikipedia sections whose text is mostly lists, figures or foreign words (`mo-shqiperia-politika`, `gap-park-dajti`): placeable only after the abbreviation and name policy of section 6.3.

### 5.5 First placements to run when the units exist

`npm run ladder:place -- --lang sq text:sq:<id>`, in this order: `sq-modern-open-durresi-klima` (expected after a2-2-04), `sq-modern-open-tirana-institucione` (after a2-1-18), `sq-modern-open-durresi-gjeografia` (after a2-2-13), then, after the first b1 adapted unit, `sq-modern-open-shqiperia-relievi`, `…tirana-demografia`, `…shqiperia-klima`, `…tirana-gjeografia`, `…shqiperia-gjeografia`, `…tirana-klima`, `…durresi-transporti`, `…tirana-ekonomia`; then `…bleta`, `…ushqimi`, `…macja`, `…qeni`, `…deti` once their adapted units exist; the `gap-` texts last. Expect "library, not ladder" for all of them until the b1 units exist (the placement threshold is 95 %, stricter than the gate's 92 % for authentic units).

## 6. Lexicon additions (for the Albanian session to review)

The adapter's lexicon files are `src/adapters/albanian/lexicon-{nouns,verbs,modifiers}.ts` and `function-*.ts`. A noun is stated as lemma, gender, definite nominative singular and indefinite nominative plural; a verb as 1st person singular present with its class, 1st person aorist and participle; an adjective with or without its article. All forms below are machine-drafted from the planner's own knowledge and **unchecked**: run `sq:agreement` on every one, and expect corrections. A "—" means no plural (or no such form) is in use.

### 6.1 Words the plan teaches that the word list does not have (271 words; 58 in a1-2, 90 in a2-1, 123 in a2-2)

#### a1-2: 58 words

| word | POS | gender / class | definite singular, plural (nouns); aorist, participle (verbs) | gloss | first used in |
|---|---|---|---|---|---|
| zakonisht | ADV |  |  | usually | sq-a1-2-04 |
| herë | NOUN | f | hera, herë | time, occasion (një herë, dy herë) | sq-a1-2-04 |
| vjeç | ADJ | no article |  | years old (after a number; invariable) | sq-a1-2-05 |
| karrige | NOUN | f | karrigia, karrige | chair | sq-a1-2-06 |
| dollap | NOUN | m | dollapi, dollapë | cupboard, wardrobe | sq-a1-2-06 |
| pallto | NOUN | f | palltoja, pallto | coat | sq-a1-2-08 |
| ngjyrë | NOUN | f | ngjyra, ngjyra | colour | sq-a1-2-08 |
| madhësi | NOUN | f | madhësia, madhësi | size | sq-a1-2-08 |
| zbritje | NOUN | f | zbritja, zbritje | discount | sq-a1-2-09 |
| para | NOUN | f | paratë, para | money (plural in use) | sq-a1-2-09 |
| euro | NOUN | f | euroja, euro | euro | sq-a1-2-09 |
| kusur | NOUN | m | kusuri, — | change (money) | sq-a1-2-09 |
| peshk | NOUN | m | peshku, peshq | fish | sq-a1-2-11 |
| faturë | NOUN | f | fatura, fatura | bill | sq-a1-2-11 |
| porosi | NOUN | f | porosia, porosi | order (in a restaurant) | sq-a1-2-11 |
| furgon | NOUN | m | furgoni, furgonë | minibus | sq-a1-2-12 |
| linjë | NOUN | f | linja, linja | line, bus route | sq-a1-2-12 |
| ndalesë | NOUN | f | ndalesa, ndalesa | stop | sq-a1-2-12 |
| vonesë | NOUN | f | vonesa, vonesa | delay | sq-a1-2-12 |
| zbres | VERB | class cons | zbrita, zbritur | go down, get off | sq-a1-2-12 |
| kryqëzim | NOUN | m | kryqëzimi, kryqëzime | crossroads | sq-a1-2-13 |
| kthesë | NOUN | f | kthesa, kthesa | turn, bend | sq-a1-2-13 |
| djathtas | ADV |  |  | on the right | sq-a1-2-13 |
| majtas | ADV |  |  | on the left | sq-a1-2-13 |
| stinë | NOUN | f | stina, stinë | season | sq-a1-2-14 |
| stomak | NOUN | m | stomaku, stomakë | stomach | sq-a1-2-15 |
| gjoks | NOUN | m | gjoksi, gjokse | chest | sq-a1-2-15 |
| ilaç | NOUN | m | ilaçi, ilaçe | medicine | sq-a1-2-15 |
| temperaturë | NOUN | f | temperatura, temperatura | temperature; fever | sq-a1-2-15 |
| dhemb | VERB | class cons | dhemba, dhembur | hurt, ache (3rd person: më dhemb koka) | sq-a1-2-15 |
| recetë | NOUN | f | receta, receta | prescription; recipe | sq-a1-2-16 |
| kollë | NOUN | f | kolla, — | cough | sq-a1-2-16 |
| ftohje | NOUN | f | ftohja, ftohje | cold (illness) | sq-a1-2-16 |
| gjumë | NOUN | m | gjumi, — | sleep | sq-a1-2-16 |
| shëroj | VERB | class oj | shërova, shëruar | cure, heal (shërohem: get well) | sq-a1-2-16 |
| ftesë | NOUN | f | ftesa, ftesa | invitation | sq-a1-2-17 |
| urim | NOUN | m | urimi, urime | good wish, greeting | sq-a1-2-17 |
| celular | NOUN | m | celulari, celularë | mobile phone | sq-a1-2-17 |
| ec | VERB | class cons | eca, ecur | walk | sq-a1-2-18 |
| kaloj | VERB | class oj | kalova, kaluar | pass; spend (time) | sq-a1-2-18 |
| bujk | NOUN | m | bujku, bujq | farmer, peasant | sq-a1-2-19 |
| përgjigje | NOUN | f | përgjigjja, përgjigje | answer | sq-a1-2-20 |
| kartolinë | NOUN | f | kartolina, kartolina | postcard | sq-a1-2-20 |
| zarf | NOUN | m | zarfi, zarfe | envelope | sq-a1-2-20 |
| shënim | NOUN | m | shënimi, shënime | note | sq-a1-2-20 |
| ofertë | NOUN | f | oferta, oferta | offer; offering | sq-a1-2-21 |
| bashkësi | NOUN | f | bashkësia, bashkësi | community, fellowship | sq-a1-2-21 |
| mbledhje | NOUN | f | mbledhja, mbledhje | meeting, gathering | sq-a1-2-21 |
| kor | NOUN | m | kori, kore | choir | sq-a1-2-21 |
| moshë | NOUN | f | mosha, moshë | age | sq-a1-2-23 |
| fëmijëri | NOUN | f | fëmijëria, — | childhood | sq-a1-2-23 |
| rini | NOUN | f | rinia, — | youth | sq-a1-2-23 |
| kos | NOUN | m | kosi, — | yoghurt | sq-a1-2-24 |
| miell | NOUN | m | mielli, — | flour | sq-a1-2-24 |
| spinaq | NOUN | m | spinaqi, — | spinach | sq-a1-2-24 |
| furrë | NOUN | f | furra, furra | oven; bakery | sq-a1-2-24 |
| pjek | VERB | class cons | pjeka, pjekur | bake, roast | sq-a1-2-24 |
| përziej | VERB | class cons | përzjeva, përzier | mix, stir | sq-a1-2-24 |

#### a2-1: 90 words

| word | POS | gender / class | definite singular, plural (nouns); aorist, participle (verbs) | gloss | first used in |
|---|---|---|---|---|---|
| çati | NOUN | f | çatia, çati | roof | sq-a2-1-01 |
| ngjit | VERB | class cons | ngjita, ngjitur | climb up (ngjitem: I climb) | sq-a2-1-01 |
| banor | NOUN | m | banori, banorë | inhabitant | sq-a2-1-02 |
| bujqësi | NOUN | f | bujqësia, — | agriculture | sq-a2-1-02 |
| pasuri | NOUN | f | pasuria, pasuri | wealth | sq-a2-1-02 |
| shumicë | NOUN | f | shumica, — | majority | sq-a2-1-02 |
| pakicë | NOUN | f | pakica, pakica | minority | sq-a2-1-02 |
| rrezik | NOUN | m | rreziku, rreziqe | danger, risk | sq-a2-1-04 |
| bërtas | VERB | class cons | bërtita, bërtitur | shout | sq-a2-1-04 |
| vërej | VERB | class cons | vërejta, vërejtur | notice | sq-a2-1-04 |
| fik | VERB | class cons | fika, fikur | switch off, put out | sq-a2-1-04 |
| bubullimë | NOUN | f | bubullima, bubullima | thunder | sq-a2-1-04 |
| vetëtimë | NOUN | f | vetëtima, vetëtima | lightning | sq-a2-1-04 |
| nevojë | NOUN | f | nevoja, nevoja | need | sq-a2-1-05 |
| sasi | NOUN | f | sasia, sasi | quantity | sq-a2-1-05 |
| dokument | NOUN | m | dokumenti, dokumente | document | sq-a2-1-05 |
| formular | NOUN | m | formulari, formularë | form (to fill in) | sq-a2-1-05 |
| llogari | NOUN | f | llogaria, llogari | account; calculation | sq-a2-1-05 |
| radhë | NOUN | f | radha, radha | queue; turn | sq-a2-1-05 |
| regjistroj | VERB | class oj | regjistrova, regjistruar | register, record | sq-a2-1-05 |
| email | NOUN | m | emaili, emaile | email | sq-a2-1-06 |
| internet | NOUN | m | interneti, — | the internet | sq-a2-1-06 |
| lidhje | NOUN | f | lidhja, lidhje | connection, link | sq-a2-1-06 |
| njoftim | NOUN | m | njoftimi, njoftime | notice, announcement | sq-a2-1-07 |
| bashki | NOUN | f | bashkia, bashki | municipality, town hall | sq-a2-1-08 |
| popullsi | NOUN | f | popullsia, popullsi | population | sq-a2-1-08 |
| kombëtar | ADJ | no article |  | national | sq-a2-1-08 |
| kulturor | ADJ | no article |  | cultural | sq-a2-1-08 |
| historik | ADJ | no article |  | historical | sq-a2-1-08 |
| ndërkombëtar | ADJ | no article |  | international | sq-a2-1-08 |
| gjeografi | NOUN | f | gjeografia, — | geography | sq-a2-1-09 |
| shef | NOUN | m | shefi, shefa | boss, chief | sq-a2-1-10 |
| intervistë | NOUN | f | intervista, intervista | interview | sq-a2-1-10 |
| qëllim | NOUN | m | qëllimi, qëllime | aim, purpose | sq-a2-1-10 |
| vizitë | NOUN | f | vizita, vizita | visit; medical appointment | sq-a2-1-11 |
| pacient | NOUN | m | pacienti, pacientë | patient | sq-a2-1-11 |
| mjekim | NOUN | m | mjekimi, mjekime | treatment | sq-a2-1-11 |
| këshillë | NOUN | f | këshilla, këshilla | advice | sq-a2-1-11 |
| lexim | NOUN | m | leximi, — | reading | sq-a2-1-12 |
| ushtrim | NOUN | m | ushtrimi, ushtrime | exercise | sq-a2-1-12 |
| fakultet | NOUN | m | fakulteti, fakultete | faculty (of a university) | sq-a2-1-12 |
| anglisht | ADV |  |  | in English | sq-a2-1-12 |
| studim | NOUN | m | studimi, studime | study | sq-a2-1-12 |
| bregdet | NOUN | m | bregdeti, bregdete | coast | sq-a2-1-13 |
| monument | NOUN | m | monumenti, monumente | monument | sq-a2-1-14 |
| kala | NOUN | f | kalaja, kala | castle, fortress | sq-a2-1-14 |
| kështjellë | NOUN | f | kështjella, kështjella | castle | sq-a2-1-14 |
| zonë | NOUN | f | zona, zona | zone, area | sq-a2-1-14 |
| trashëgimi | NOUN | f | trashëgimia, — | heritage | sq-a2-1-14 |
| periudhë | NOUN | f | periudha, periudha | period | sq-a2-1-14 |
| rajon | NOUN | m | rajoni, rajone | region | sq-a2-1-14 |
| pushtoj | VERB | class oj | pushtova, pushtuar | conquer, occupy | sq-a2-1-14 |
| themeloj | VERB | class oj | themelova, themeluar | found, establish | sq-a2-1-14 |
| shtrij | VERB | class cons | shtriva, shtrirë | stretch out (shtrihet: it lies, extends) | sq-a2-1-14 |
| përfshij | VERB | class cons | përfshiva, përfshirë | include | sq-a2-1-14 |
| mesatar | ADJ | no article |  | average | sq-a2-1-14 |
| antik | ADJ | no article |  | ancient | sq-a2-1-14 |
| ndjej | VERB | class cons | ndjeva, ndjerë | feel (ndihem: I feel) | sq-a2-1-15 |
| mision | NOUN | m | misioni, misione | mission | sq-a2-1-15 |
| misionar | NOUN | m | misionari, misionarë | missionary | sq-a2-1-15 |
| vullnetar | NOUN | m | vullnetari, vullnetarë | volunteer | sq-a2-1-15 |
| rol | NOUN | m | roli, role | role | sq-a2-1-15 |
| ndjenjë | NOUN | f | ndjenja, ndjenja | feeling | sq-a2-1-15 |
| vendim | NOUN | m | vendimi, vendime | decision | sq-a2-1-15 |
| kapitull | NOUN | m | kapitulli, kapituj | chapter | sq-a2-1-16 |
| varg | NOUN | m | vargu, vargje | verse (of a poem or the Bible) | sq-a2-1-16 |
| çift | NOUN | m | çifti, çifte | couple, pair | sq-a2-1-17 |
| Krishtlindje | NOUN | f | Krishtlindja, — | Christmas | sq-a2-1-17 |
| Pashkë | NOUN | f | Pashka, — | Easter | sq-a2-1-17 |
| vallë | NOUN | f | vallja, valle | folk dance | sq-a2-1-17 |
| tradicional | ADJ | no article |  | traditional | sq-a2-1-17 |
| kufi | NOUN | m | kufiri, kufij | border | sq-a2-1-18 |
| luginë | NOUN | f | lugina, lugina | valley | sq-a2-1-18 |
| klimë | NOUN | f | klima, klima | climate | sq-a2-1-18 |
| reshje | NOUN | f | reshja, reshje | rainfall, precipitation | sq-a2-1-18 |
| vapë | NOUN | f | vapa, vapa | heat (hot weather) | sq-a2-1-18 |
| gradë | NOUN | f | grada, gradë | degree | sq-a2-1-18 |
| bimë | NOUN | f | bima, bimë | plant | sq-a2-1-18 |
| burim | NOUN | m | burimi, burime | spring, source | sq-a2-1-18 |
| përrua | NOUN | m | përroi, përrenj | stream | sq-a2-1-18 |
| sipërfaqe | NOUN | f | sipërfaqja, sipërfaqe | surface, area | sq-a2-1-18 |
| lartësi | NOUN | f | lartësia, lartësi | height | sq-a2-1-18 |
| gjatësi | NOUN | f | gjatësia, gjatësi | length | sq-a2-1-18 |
| veri | NOUN | m | veriu, — | north | sq-a2-1-18 |
| jug | NOUN | m | jugu, — | south | sq-a2-1-18 |
| lindje | NOUN | f | lindja, — | east; birth | sq-a2-1-18 |
| perëndim | NOUN | m | perëndimi, — | west | sq-a2-1-18 |
| metër | NOUN | m | metri, metra | metre | sq-a2-1-18 |
| kilometër | NOUN | m | kilometri, kilometra | kilometre | sq-a2-1-18 |
| malor | ADJ | no article |  | mountainous, of the mountains | sq-a2-1-18 |

#### a2-2: 123 words

| word | POS | gender / class | definite singular, plural (nouns); aorist, participle (verbs) | gloss | first used in |
|---|---|---|---|---|---|
| kat | NOUN | m | kati, kate | floor, storey | sq-a2-2-01 |
| banesë | NOUN | f | banesa, banesa | home, flat | sq-a2-2-01 |
| qira | NOUN | f | qiraja, — | rent | sq-a2-2-01 |
| apartament | NOUN | m | apartamenti, apartamente | apartment | sq-a2-2-01 |
| dysheme | NOUN | f | dyshemeja, dysheme | floor | sq-a2-2-01 |
| peshqir | NOUN | m | peshqiri, peshqirë | towel | sq-a2-2-01 |
| sapun | NOUN | m | sapuni, sapunë | soap | sq-a2-2-01 |
| frigorifer | NOUN | m | frigoriferi, frigoriferë | refrigerator | sq-a2-2-01 |
| ballkon | NOUN | m | ballkoni, ballkone | balcony | sq-a2-2-01 |
| lagje | NOUN | f | lagjja, lagje | neighbourhood | sq-a2-2-01 |
| pronar | NOUN | m | pronari, pronarë | owner | sq-a2-2-01 |
| rrymë | NOUN | f | rryma, rryma | current; electricity | sq-a2-2-01 |
| ngrohje | NOUN | f | ngrohja, — | heating | sq-a2-2-01 |
| deri | ADP |  |  | until, up to, as far as | sq-a2-2-02 |
| taksi | NOUN | f | taksia, taksi | taxi | sq-a2-2-04 |
| ecje | NOUN | f | ecja, ecje | walk, hike | sq-a2-2-04 |
| udhëzues | NOUN | m | udhëzuesi, udhëzues | guide | sq-a2-2-04 |
| ngas | VERB | class cons | ngita, ngitur | drive (a vehicle) | sq-a2-2-04 |
| peizazh | NOUN | m | peizazhi, peizazhe | landscape | sq-a2-2-04 |
| thërras | VERB | class cons | thirra, thirrur | call, shout for | sq-a2-2-04 |
| rezervoj | VERB | class oj | rezervova, rezervuar | reserve, book | sq-a2-2-04 |
| përgjatë | ADP |  |  | along | sq-a2-2-04 |
| fermer | NOUN | m | fermeri, fermerë | farmer | sq-a2-2-05 |
| ekonomi | NOUN | f | ekonomia, — | economy | sq-a2-2-05 |
| industri | NOUN | f | industria, — | industry | sq-a2-2-05 |
| turizëm | NOUN | m | turizmi, — | tourism | sq-a2-2-05 |
| tregti | NOUN | f | tregtia, — | trade, commerce | sq-a2-2-05 |
| prodhim | NOUN | m | prodhimi, prodhime | production; product | sq-a2-2-05 |
| ekonomik | ADJ | no article |  | economic | sq-a2-2-05 |
| popullor | ADJ | no article |  | popular, of the people | sq-a2-2-05 |
| kryesisht | ADV |  |  | mainly | sq-a2-2-05 |
| aktualisht | ADV |  |  | currently | sq-a2-2-05 |
| tregtar | ADJ | no article |  | commercial, trade (adj.) | sq-a2-2-05 |
| industrial | ADJ | no article |  | industrial | sq-a2-2-05 |
| arsye | NOUN | f | arsyeja, arsye | reason | sq-a2-2-06 |
| rëndësi | NOUN | f | rëndësia, — | importance | sq-a2-2-06 |
| gjendje | NOUN | f | gjendja, gjendje | state, condition | sq-a2-2-06 |
| kusht | NOUN | m | kushti, kushte | condition | sq-a2-2-06 |
| ide | NOUN | f | ideja, ide | idea | sq-a2-2-06 |
| plan | NOUN | m | plani, plane | plan | sq-a2-2-06 |
| gabim | NOUN | m | gabimi, gabime | mistake | sq-a2-2-06 |
| sukses | NOUN | m | suksesi, — | success | sq-a2-2-06 |
| natyror | ADJ | no article |  | natural | sq-a2-2-07 |
| mbretëreshë | NOUN | f | mbretëresha, mbretëresha | queen | sq-a2-2-07 |
| nektar | NOUN | m | nektari, — | nectar | sq-a2-2-07 |
| larvë | NOUN | f | larva, larva | larva | sq-a2-2-07 |
| thumb | NOUN | m | thumbi, thumba | sting; thorn | sq-a2-2-07 |
| prodhoj | VERB | class oj | prodhova, prodhuar | produce | sq-a2-2-07 |
| mashkull | NOUN | m | mashkulli, meshkuj | male (animal) | sq-a2-2-07 |
| femër | NOUN | f | femra, femra | female | sq-a2-2-07 |
| ndërkohë | ADV |  |  | meanwhile | sq-a2-2-07 |
| tilla | DET |  |  | such (plural, feminine/neuter) | sq-a2-2-07 |
| fasule | NOUN | f | fasulja, fasule | beans | sq-a2-2-08 |
| limon | NOUN | m | limoni, limonë | lemon | sq-a2-2-08 |
| vitaminë | NOUN | f | vitamina, vitamina | vitamin | sq-a2-2-08 |
| substancë | NOUN | f | substanca, substanca | substance | sq-a2-2-08 |
| energji | NOUN | f | energjia, — | energy | sq-a2-2-08 |
| dëm | NOUN | m | dëmi, dëme | harm, damage | sq-a2-2-08 |
| i dëmshëm | ADJ | with i/e/të/së |  | harmful | sq-a2-2-08 |
| mirëpo | CONJ |  |  | but, however | sq-a2-2-08 |
| megjithatë | ADV |  |  | nevertheless, however | sq-a2-2-08 |
| masë | NOUN | f | masa, masa | measure; mass | sq-a2-2-08 |
| produkt | NOUN | m | produkti, produkte | product | sq-a2-2-08 |
| çadër | NOUN | f | çadra, çadra | umbrella | sq-a2-2-09 |
| murgeshë | NOUN | f | murgesha, murgesha | nun | sq-a2-2-10 |
| urdhër | NOUN | m | urdhri, urdhra | order (command; religious order) | sq-a2-2-10 |
| varfëri | NOUN | f | varfëria, — | poverty | sq-a2-2-10 |
| shpërblim | NOUN | m | shpërblimi, shpërblime | reward, prize | sq-a2-2-10 |
| siç | CONJ |  |  | as (siç thotë: as he says) | sq-a2-2-13 |
| pasi | SCONJ |  |  | after, since (conjunction) | sq-a2-2-13 |
| aftësi | NOUN | f | aftësia, aftësi | ability, skill | sq-a2-2-14 |
| kandidat | NOUN | m | kandidati, kandidatë | candidate, applicant | sq-a2-2-14 |
| i aftë | ADJ | with i/e/të/së |  | able, capable | sq-a2-2-14 |
| punësoj | VERB | class oj | punësova, punësuar | employ | sq-a2-2-14 |
| pamje | NOUN | f | pamja, pamje | view, sight | sq-a2-2-15 |
| teatër | NOUN | m | teatri, teatro | theatre | sq-a2-2-16 |
| kullë | NOUN | f | kulla, kulla | tower | sq-a2-2-16 |
| pallat | NOUN | m | pallati, pallate | apartment block, large building | sq-a2-2-16 |
| komunë | NOUN | f | komuna, komuna | commune | sq-a2-2-16 |
| pikë | NOUN | f | pika, pika | point; drop | sq-a2-2-16 |
| anë | NOUN | f | ana, ana | side | sq-a2-2-16 |
| turistik | ADJ | no article |  | tourist (adj.) | sq-a2-2-16 |
| jugor | ADJ | no article |  | southern | sq-a2-2-16 |
| verior | ADJ | no article |  | northern | sq-a2-2-16 |
| detar | ADJ | no article |  | sea (adj.), maritime | sq-a2-2-16 |
| bregdetar | ADJ | no article |  | coastal | sq-a2-2-16 |
| vendas | NOUN | m | vendasi, vendas | local, native (person) | sq-a2-2-16 |
| përveç | ADP |  |  | except, besides | sq-a2-2-16 |
| arkeologjik | ADJ | no article |  | archaeological | sq-a2-2-16 |
| mesdhetar | ADJ | no article |  | Mediterranean | sq-a2-2-16 |
| territor | NOUN | m | territori, territore | territory | sq-a2-2-16 |
| lindor | ADJ | no article |  | eastern | sq-a2-2-17 |
| perëndimor | ADJ | no article |  | western | sq-a2-2-17 |
| sundim | NOUN | m | sundimi, sundime | rule (period of rule) | sq-a2-2-17 |
| pavarësi | NOUN | f | pavarësia, — | independence | sq-a2-2-17 |
| lëvizje | NOUN | f | lëvizja, lëvizje | movement | sq-a2-2-17 |
| zgjedhje | NOUN | f | zgjedhja, zgjedhje | election; choice | sq-a2-2-17 |
| parti | NOUN | f | partia, parti | political party | sq-a2-2-17 |
| kuvend | NOUN | m | kuvendi, kuvende | assembly, parliament | sq-a2-2-17 |
| kushtetutë | NOUN | f | kushtetuta, kushtetuta | constitution | sq-a2-2-17 |
| mes | ADP |  |  | in the middle of, between | sq-a2-2-17 |
| osman | ADJ | no article |  | Ottoman | sq-a2-2-17 |
| ilir | ADJ | no article |  | Illyrian | sq-a2-2-17 |
| bizantin | ADJ | no article |  | Byzantine | sq-a2-2-17 |
| turk | ADJ | no article |  | Turkish | sq-a2-2-17 |
| mesjetar | ADJ | no article |  | medieval | sq-a2-2-17 |
| qendror | ADJ | no article |  | central | sq-a2-2-19 |
| botëror | ADJ | no article |  | world (adj.), global | sq-a2-2-19 |
| transport | NOUN | m | transporti, — | transport | sq-a2-2-19 |
| institucion | NOUN | m | institucioni, institucione | institution | sq-a2-2-19 |
| sektor | NOUN | m | sektori, sektorë | sector | sq-a2-2-19 |
| zhvillim | NOUN | m | zhvillimi, zhvillime | development | sq-a2-2-19 |
| urban | ADJ | no article |  | urban | sq-a2-2-19 |
| përmes | ADP |  |  | through, by means of | sq-a2-2-19 |
| lokal | ADJ | no article |  | local | sq-a2-2-19 |
| administrativ | ADJ | no article |  | administrative | sq-a2-2-19 |
| karakteristik | ADJ | no article |  | characteristic | sq-a2-2-19 |
| ndërtim | NOUN | m | ndërtimi, ndërtime | construction, building | sq-a2-2-19 |
| nivel | NOUN | m | niveli, nivele | level | sq-a2-2-19 |
| formë | NOUN | f | forma, forma | shape, form | sq-a2-2-19 |
| sistem | NOUN | m | sistemi, sisteme | system | sq-a2-2-19 |
| krahinë | NOUN | f | krahina, krahina | region, province | sq-a2-2-19 |
| rast | NOUN | m | rasti, raste | case, occasion | sq-a2-2-19 |

`para` (money, plural in use) is one word of this table whose *spelling* is already in the list (the preposition `para`); the noun reading must outrank the ordinal reading `i parë` that the engine gives the bare form today.

### 6.2 The b1 list: 182 words the library needs and the ladder does not teach

These are the most frequent missing lemma clusters of the library after a2-2 (hand-clustered from the unknown forms; tokens counted over the 38 texts, over all forms). They are not scheduled in a1-2 … a2-2: the b1-bridge teaches them, and the lexicon should hold them before the b1 units are drafted. Taught together they lift the library from 81.1 % to 85.6 % (the three abbreviation and symbol rows, `km`, `m` and `etj`, are worth half a point on their own); the table is sorted by tokens, rows without a count have no form in the library that the planner could match.

| word | POS | gender / class | forms | gloss | tokens in the library | texts |
|---|---|---|---|---|---:|---:|
| km | NOUN |  |  | abbreviation: kilometre | 58 | 14 |
| m | NOUN |  |  | abbreviation: metre | 42 | 8 |
| etj | ADV |  |  | abbreviation: etc. (e të tjera) | 33 | 13 |
| shek | NOUN |  |  | abbreviation: shekulli (century) | 30 | 7 |
| përbëj | VERB | class cons | përbëra, përbërë | make up, constitute (përbëhet nga: consists of) | 26 | 13 |
| rrjedh | VERB | class cons | rrodha, rrjedhur | flow | 22 | 6 |
| akullnajë | NOUN | f | akullnaja, akullnaja | glacier | 17 | 2 |
| ekzistoj | VERB | class oj | ekzistova, ekzistuar | exist | 14 | 7 |
| majë | NOUN | f | maja, maja | summit, peak | 14 | 5 |
| banoj | VERB | class oj | banova, banuar | live, inhabit | 13 | 7 |
| legjendë | NOUN | f | legjenda, legjenda | legend | 13 | 3 |
| ortodoks | ADJ | no article |  | Orthodox | 13 | 5 |
| rënie | NOUN | f | rënia, rënie | fall, decline | 13 | 4 |
| dalloj | VERB | class oj | dallova, dalluar | distinguish (dallohem: stand out) | 12 | 8 |
| shkaktoj | VERB | class oj | shkaktova, shkaktuar | cause | 12 | 3 |
| vendbanim | NOUN | m | vendbanimi, vendbanime | settlement | 12 | 8 |
| ekosistem | NOUN | m | ekosistemi, ekosisteme | ecosystem | 11 | 2 |
| punim | NOUN | m | punimi, punime | work, piece of work | 11 | 6 |
| sanxhak | NOUN | m | sanxhaku, sanxhakë | sanjak (Ottoman district) | 11 | 4 |
| degë | NOUN | f | dega, degë | branch | 10 | 4 |
| funksionoj | VERB | class oj | funksionova, funksionuar | function, work | 10 | 8 |
| gjerësi | NOUN | f | gjerësia, gjerësi | width | 10 | 6 |
| grykë | NOUN | f | gryka, gryka | gorge; mouth | 10 | 4 |
| kult | NOUN | m | kulti, kulte | cult, worship | 10 | 1 |
| milion | NOUN | m | milioni, milionë | million | 10 | 5 |
| port | NOUN | m | porti, porte | port | 10 | 4 |
| qark | NOUN | m | qarku, qarqe | county | 10 | 8 |
| specie | NOUN | f | specia, specie | species | 10 | 4 |
| bazoj | VERB | class oj | bazova, bazuar | base (bazohem: be based on) | 9 | 8 |
| brez | NOUN | m | brezi, breza | belt, zone; generation | 9 | 5 |
| i lashtë | ADJ | with i/e/të/së |  | ancient | 9 | 6 |
| kompleks | NOUN | m | kompleksi, komplekse | complex | 9 | 5 |
| objekt | NOUN | m | objekti, objekte | object; building | 9 | 4 |
| oqean | NOUN | m | oqeani, oqeane | ocean | 9 | 1 |
| shpat | NOUN | m | shpati, shpate | slope | 9 | 6 |
| ushqimor | ADJ | no article |  | of food | 9 | 5 |
| ar | NOUN | m | ari, — | gold | 8 | 2 |
| derdh | VERB | class cons | derdha, derdhur | pour out (derdhem: flow into) | 8 | 2 |
| fakt | NOUN | m | fakti, fakte | fact | 8 | 7 |
| i sipërm | ADJ | with i/e/të/së |  | upper | 8 | 4 |
| p.e.s | ADV |  |  | abbreviation: before our era | 8 | 4 |
| pasoj | VERB | class oj | pasova, pasuar | follow | 8 | 5 |
| përmbaj | VERB | class cons | përmbajta, përmbajtur | contain | 8 | 7 |
| reliev | NOUN | m | relievi, — | relief (landform) | 8 | 6 |
| sulltan | NOUN | m | sulltani, sulltanë | sultan | 8 | 3 |
| ujor | ADJ | no article |  | of water | 8 | 3 |
| aktivitet | NOUN | m | aktiviteti, aktivitete | activity | 7 | 6 |
| bujqësor | ADJ | no article |  | agricultural | 7 | 6 |
| kategori | NOUN | f | kategoria, kategori | category | 7 | 3 |
| mjedisor | ADJ | no article |  | environmental | 7 | 4 |
| ndotje | NOUN | f | ndotja, ndotje | pollution | 7 | 3 |
| origjinë | NOUN | f | origjina, origjina | origin | 7 | 5 |
| pishë | NOUN | f | pisha, pisha | pine | 7 | 4 |
| politik | ADJ | no article |  | political | 7 | 5 |
| rrethoj | VERB | class oj | rrethova, rrethuar | surround | 7 | 6 |
| shkëmbor | ADJ | no article |  | rocky | 7 | 5 |
| siguroj | VERB | class oj | sigurova, siguruar | ensure, provide | 7 | 7 |
| thellësi | NOUN | f | thellësia, thellësi | depth | 7 | 4 |
| argjend | NOUN | m | argjendi, — | silver | 6 | 3 |
| hekurudhë | NOUN | f | hekurudha, hekurudha | railway | 6 | 4 |
| kanion | NOUN | m | kanioni, kanione | canyon | 6 | 3 |
| mozaik | NOUN | m | mozaiku, mozaikë | mosaic | 6 | 3 |
| përfaqësues | NOUN | m | përfaqësuesi, përfaqësues | representative | 6 | 5 |
| përhap | VERB | class cons | përhapa, përhapur | spread | 6 | 5 |
| rrugor | ADJ | no article |  | road (adj.) | 6 | 3 |
| ruajtje | NOUN | f | ruajtja, ruajtje | keeping, preservation | 6 | 5 |
| shënoj | VERB | class oj | shënova, shënuar | mark, note | 6 | 3 |
| shtëpiak | ADJ | no article |  | domestic, house (adj.) | 6 | 2 |
| tej | ADV |  |  | beyond, through | 6 | 6 |
| tejkaloj | VERB | class oj | tejkalova, tejkaluar | exceed | 6 | 4 |
| unik | ADJ | no article |  | unique | 6 | 3 |
| ushqej | VERB | class oj | ushqeva, ushqyer | feed (ushqehem: eat, feed on) | 6 | 2 |
| zyrtarisht | ADV |  |  | officially | 6 | 5 |
| artistik | ADJ | no article |  | artistic | 5 | 3 |
| bazë | NOUN | f | baza, baza | base, basis | 5 | 4 |
| direkt | ADV |  |  | directly | 5 | 3 |
| distancë | NOUN | f | distanca, distanca | distance | 5 | 3 |
| fushor | ADJ | no article |  | of the plain | 5 | 2 |
| gjurmë | NOUN | f | gjurma, gjurma | trace, footprint | 5 | 4 |
| gjysmë | NOUN | f | gjysma, — | half | 5 | 4 |
| i kërcënuar | ADJ | with i/e/të/së |  | threatened | 5 | 1 |
| individ | NOUN | m | individi, individë | individual | 5 | 5 |
| katedrale | NOUN | f | katedralja, katedrale | cathedral | 5 | 3 |
| komitet | NOUN | m | komiteti, komitete | committee | 5 | 3 |
| lulëzoj | VERB | class oj | lulëzova, lulëzuar | flourish, bloom | 5 | 4 |
| mesatarisht | ADV |  |  | on average | 5 | 4 |
| modern | ADJ | no article |  | modern | 5 | 4 |
| ndryshe | ADV |  |  | differently, otherwise | 5 | 5 |
| njëkohësisht | ADV |  |  | at the same time | 5 | 3 |
| njësi | NOUN | f | njësia, njësi | unit | 5 | 4 |
| paleokristian | ADJ | no article |  | early Christian | 5 | 4 |
| përfundimisht | ADV |  |  | finally | 5 | 2 |
| punishte | NOUN | f | punishtja, punishte | workshop | 5 | 2 |
| rregullisht | ADV |  |  | regularly | 5 | 5 |
| shpjegim | NOUN | m | shpjegimi, shpjegime | explanation | 5 | 2 |
| shtetëror | ADJ | no article |  | of the state | 5 | 4 |
| vjetor | ADJ | no article |  | annual | 5 | 3 |
| agjenci | NOUN | f | agjencia, agjenci | agency | 4 | 2 |
| arkitektonik | ADJ | no article |  | architectural | 4 | 2 |
| basen | NOUN | m | baseni, basene | basin | 4 | 3 |
| ekologjik | ADJ | no article |  | ecological | 4 | 2 |
| emigroj | VERB | class oj | emigrova, emigruar | emigrate | 4 | 3 |
| fetar | ADJ | no article |  | religious | 4 | 4 |
| folklorik | ADJ | no article |  | folkloric | 4 | 2 |
| gaz | NOUN | m | gazi, gaze | gas | 4 | 3 |
| gjuhësor | ADJ | no article |  | linguistic | 4 | 1 |
| hamam | NOUN | m | hamami, hamame | Turkish bath | 4 | 3 |
| i konsiderueshëm | ADJ | with i/e/të/së |  | considerable | 4 | 4 |
| i mbrojtur | ADJ | with i/e/të/së |  | protected | 4 | 1 |
| investim | NOUN | m | investimi, investime | investment | 4 | 2 |
| kushtetues | ADJ | no article |  | constitutional | 4 | 2 |
| lumor | ADJ | no article |  | of rivers | 4 | 3 |
| madhështor | ADJ | no article |  | magnificent | 4 | 2 |
| mijëra | NUM |  |  | thousands | 4 | 2 |
| mm | NOUN |  |  | abbreviation: millimetre | 4 | 4 |
| naftë | NOUN | f | nafta, — | oil, petroleum | 4 | 2 |
| ndërhyrje | NOUN | f | ndërhyrja, ndërhyrje | intervention | 4 | 3 |
| paktën | ADV |  |  | at least | 4 | 3 |
| përafërsisht | ADV |  |  | approximately | 4 | 3 |
| potencial | NOUN | m | potenciali, — | potential | 4 | 2 |
| privat | ADJ | no article |  | private | 4 | 3 |
| qindra | NUM |  |  | hundreds | 4 | 4 |
| qysh | CONJ |  |  | since, as (older/regional) | 4 | 4 |
| relativisht | ADV |  |  | relatively | 4 | 4 |
| rural | ADJ | no article |  | rural | 4 | 4 |
| terren | NOUN | m | terreni, — | terrain | 4 | 4 |
| tokësor | ADJ | no article |  | of the land, earthly | 4 | 3 |
| bazilikë | NOUN | f | bazilika, bazilika | basilica | 3 | 2 |
| diellor | ADJ | no article |  | solar, sunny | 3 | 2 |
| i mbarë | ADJ | with i/e/të/së |  | whole, entire | 3 | 2 |
| i ngurtë | ADJ | with i/e/të/së |  | solid | 3 | 3 |
| indeks | NOUN | m | indeksi, indekse | index | 3 | 2 |
| informacion | NOUN | m | informacioni, informacione | information | 3 | 2 |
| kg | NOUN |  |  | abbreviation: kilogram | 3 | 2 |
| kontinental | ADJ | no article |  | continental | 3 | 3 |
| krahasoj | VERB | class oj | krahasova, krahasuar | compare | 3 | 3 |
| mandej | ADV |  |  | then, afterwards | 3 | 2 |
| marrëveshje | NOUN | f | marrëveshja, marrëveshje | agreement | 3 | 1 |
| mbas | ADP |  |  | after (variant of pas) | 3 | 3 |
| milje | NOUN | f | milja, milje | mile | 3 | 3 |
| ndonjë | DET |  |  | any, some | 3 | 3 |
| p.sh | ADV |  |  | abbreviation: for example | 3 | 2 |
| përcaktoj | VERB | class oj | përcaktova, përcaktuar | define, determine | 3 | 3 |
| përfaqësoj | VERB | class oj | përfaqësova, përfaqësuar | represent | 3 | 3 |
| përjetoj | VERB | class oj | përjetova, përjetuar | experience | 3 | 3 |
| pjesëtar | NOUN | m | pjesëtari, pjesëtarë | member (of a group) | 3 | 1 |
| plot | ADV |  |  | full, plenty | 3 | 2 |
| rrënojë | NOUN | f | rrënoja, rrënoja | ruin | 3 | 3 |
| shkencor | ADJ | no article |  | scientific | 3 | 3 |
| standard | NOUN | m | standardi, standarde | standard | 3 | 3 |
| status | NOUN | m | statusi, — | status | 3 | 3 |
| zbulim | NOUN | m | zbulimi, zbulime | discovery | 3 | 2 |
| zyrtar | ADJ | no article |  | official | 3 | 1 |
| alpin | ADJ | no article |  | Alpine | 2 | 2 |
| borxh | NOUN | m | borxhi, borxhe | debt | 2 | 1 |
| diktaturë | NOUN | f | diktatura, diktatura | dictatorship | 2 | 2 |
| dukshëm | ADV |  |  | visibly, clearly | 2 | 2 |
| gamë | NOUN | f | gama, gama | range, scale | 2 | 1 |
| gjithsesi | ADV |  |  | in any case | 2 | 2 |
| i qëndrueshëm | ADJ | with i/e/të/së |  | stable, sustainable | 2 | 2 |
| ish | ADJ | no article |  | former (ish-) | 2 | 2 |
| mbrapa | ADV |  |  | behind | 2 | 1 |
| mot | NOUN | m | moti, — | weather | 2 | 1 |
| ndonëse | CONJ |  |  | although | 2 | 2 |
| planifikoj | VERB | class oj | planifikova, planifikuar | plan | 2 | 2 |
| prapa | ADV |  |  | behind | 2 | 2 |
| sapo | ADV |  |  | as soon as, just | 2 | 2 |
| sërë | NOUN | f | sëra, sëra | series; a number of | 2 | 2 |
| shfrytëzoj | VERB | class oj | shfrytëzova, shfrytëzuar | exploit, use | 2 | 2 |
| shifër | NOUN | f | shifra, shifra | figure, digit | 2 | 2 |
| tutje | ADV |  |  | further | 2 | 2 |
| vazhdimisht | ADV |  |  | continuously | 2 | 2 |
| veti | NOUN | f | vetia, veti | quality, property | 2 | 2 |
| i jashtëzakonshëm | ADJ | with i/e/të/së |  | extraordinary | 1 | 1 |
| i përgjithshëm | ADJ | with i/e/të/së |  | general | 1 | 1 |
| i sotëm | ADJ | with i/e/të/së |  | of today, present-day | 1 | 1 |
| pasuroj | VERB | class oj | pasurova, pasuruar | enrich | 1 | 1 |
| akullnajor | ADJ | no article |  | glacial |  |  |
| formoj | VERB | class oj | formova, formuar | form |  |  |
| i dikurshëm | ADJ | with i/e/të/së |  | former |  |  |
| rrjedhë | NOUN | f | rrjedha, rrjedha | flow, course |  |  |
| specifik | ADJ | no article |  | specific |  |  |

### 6.3 Adapter and gate policy that would move the numbers (decisions for the Albanian session and the coordinator)

1. **Capitalised unknown words as proper nouns.** 1,878 of the library's tokens (7.6 %) are unknown words written with a capital inside a sentence: places (Vjosa, Lurë, Dyrrah, Janinë, Prespë), people, institutions. Today each is a "word with no reading" and each form a different unknown lemma. Reading them as unconfirmed `PROPN` (the gate already counts `PROPN` as known) is worth about +7 points at the end of a2-2 together with the Roman numerals (73.8 % → 81.1 %). Without it every unit about Albania needs the names added by hand.
2. **Roman numerals** (`ii, vi, xiii, xiv, xix`: about 100 tokens in the library, mostly centuries) as `NUM`.
3. **Abbreviations**: `km, m, mm, kg, shek, etj, p.e.s, p.sh` as known tokens (about 180 tokens).
4. **Cast names that read as common words.** `Drita` (grandmother, the commonest name after Sam) reads first as `dritë`, `Mira` as `i mirë`, `Luan` as `luaj`: every use credits and distorts a common lemma, and the learner's card shows the wrong word. A `PROPN`-first rule for these capitalised forms (in a sentence, after a title) would fix three of the five cast names.
5. **`para`, `dhemb`, `pite`, `kujdes`, `ndodh`**: citation forms that collide with other words (`para` → `i parë`; `dhemb` → `dhëmb` by diacritic restoration; `pite` → `pi`; `kujdes` → `kujdesem`; `ndodh` → `ndodhem`). The plan avoids `kujdes` and `ndodh` as separate lemmas and keeps `para` and `dhemb` with a note.

Words of the word list that the plan does not schedule (reserve for substitutions and for the b1-bridge): `mi`, `atë`, the Bible-technical nouns `flijim, besëlidhje, urdhërim, padrejtësi, meshë, kambanë, ikonë, altar, tempull, murg, shenjtëroj, tradhtoj, sakrifikoj, mëkatoj, ndëshkoj`, the ordinals `i katërt … i dhjetë`, the greetings `tungjatjeta, mirëmbrëma, mirupafshim`, and the nationality adjectives `kosovar, anglez, rus, spanjoll`. **Wanted but not scheduled** (over budget; useful substitutes; additions to the word list if a writer needs them): dajë, xhaxha, plak, plakë, foshnjë, i martuar, i moshuar, uri, etje, divan, spec, kastravec, reçel, pite, bluzë, çizme, veshje, kinema, stadium, rrjedhë, gjerësi, thellësi, mekanik, marangoz, murator, gjysmë. **Moved out of the plan to keep the end of a2-2 at about 1,057 lemmas** (substitutes of the same themes, 27 words): telefon, televizor, ekran, liman, valë, kostum, këngëtar, jastëk, batanije, furçë, flutur, mushkonjë, dardhë, rrush, birrë, shall, syze, filxhan, send, mashtroj, mohoj, ushtar, poet, piktor, i fshehtë, i përbashkët, ngatërroj (about half of them are in the word list already).

## 7. Under-specified, risky, or decided by someone else

1. **The b1-bridge is a brief, not a unit plan.** Its units cannot be listed before a2-2 exists and the real lemma set has been measured; section 5 gives the composition, the numbers and the order of placements, nothing more.
2. **Everything is planned at ≥ 91 %, arithmetic not measurement.** The estimates assume the adapter reads every listed word as its listed lemma and that a writer uses each new lemma exactly three times. Known traps (measured): `Drita / Mira / Luan` (above); `para`, `dhemb`, `pite`; the aorist of non-active verbs has no reading (`mbeti, uli, ula, lindi, linda, ndodhi, nisëm`; `u kthye` reads, `u ul` reads) — this touches a1-2-18, 19, 23 (`lindem`, `martohem`, `kthehem`, `nisem`, `mbetem`) first; `u` before a verb reads as `ai` as often as `u`; `vesh` is both a noun (ear) and a verb (dress); `hënë` is both the moon and Monday; adverbs `mirë, keq, bukur, lehtë, vështirë, vetëm` read as the adjective lemma (so they are not separate lemmas); participles read as adjectives out of context (`hapur` → `i hapur`). Every unit must be run through `npm run sq:ladder-author` and the gate before it is kept.
3. **The adapter cannot see the tenses the plan teaches most.** There is no `detectPatterns` key for the aorist, the imperfect, the dative, the imperative of ordinary verbs or `mos u …`; the gate's "constructions first met" column will be empty for a1-2-18, a2-1-01 … 04 and most imperatives. `do të` + imperfect fires `conditional` (it is the conditional, but also how a future-in-the-past reads).
4. **Recycling is dense.** Three encounters per new lemma within six units means up to 8.1 tracked lemmas per 100 words that the writer must place (mean 5.0). The assignment is by theme and load, not by meaning; where a list reads absurdly, move the word to the nearest unit of the window and tell the plan owner.
5. **a1-2 has only 2 volume units.** It teaches 275 lemmas in 11.2 k words to a learner who knows 175; there is no room for pure recycling units in it. If the owner wants more A1 relief, add three or four a1-2 units that introduce nothing (about 1.5 k words); the contract's 15 k lower bound for A1 would then be met (a1-1 + a1-2 are 14,891 words today).
6. **The last six units** (`sq-a2-2-15, sq-a2-2-16, sq-a2-2-17, sq-a2-2-18, sq-a2-2-19, sq-a2-2-20`) introduce 93 lemmas that the gate does not judge for recycling (the window is cut short) and that the ladder cannot recycle: a2-2-16 (26), 17 (23) and 19 (23) are library-directed nonfiction units and their words come back in the b1-bridge. If the owner wants the ladder to end clean, move 40–60 of these lemmas into a2-2-01 … 15 (their est. coverage is 94–98 %, so there is room), at the cost of the nonfiction register arriving a little earlier than the learner needs it.
7. **Estimated coverage of the late a2-2 units is high (94–98 %).** That is the room the writers have for natural unscheduled vocabulary; it is not an invitation to pad.
8. **The nonfiction and biography units carry facts** (Tirana, Albania, its history, Mother Teresa): they are written new, not copied from Wikipedia, and every fact must be checked by a person; they carry the same `machine-draft` state as the rest.
9. **Church and testimony units** (a1-2-21, 22; a2-1-15, 16; a2-2-11, 13, 20 and the church talk in other units) need a theological reviewer in addition to the linguistic one. None quotes Scripture; a rights-cleared Albanian Bible would allow a Scripture domain in the b1-bridge.
10. **Two Anas, a Beni.** The Udha drafts of a1-1 have their own family (Beni and his sister Ana); the plan does not use them. A reviewer should decide whether the Udha texts are renamed.
11. **Audio.** Units are meant to be recordable in one sitting (a1-2 ≤ 640 words, a2-2 ≤ 1,280); nothing here schedules recordings or reviewers. `docs/audits/B2-AUDIT.md` items 2–3 (a named native reviewer, native audio) are still the precondition for any unit to reach a learner.
12. **The a1-1 recycling warnings** already in the gate (65 warnings today) are not addressed here beyond the tail in section 1.4.
13. **This plan is prose.** The Albanian session should turn the unit blocks into authoring-file headers plus a per-unit allowed-lemma list (Stage 0 + a1-1 + all earlier lists + the unit's own) so that writers and the gate read the same data; hand-copying 864 lemmas will introduce errors. The scratch data (unit lists, additions, the library simulation) can be regenerated from this document's tables.
