# Hindi ladder — vocabulary and unit plan (a1-1 … a2-2, with the b1-bridge opening)

Planning document for `data/ladder/hi/ladder.json` (contract: `docs/LADDER.md`), written 2026-10-06 by the Hindi ladder planner, on the model of `data/ladder/es/PLAN.md`. Writers draft the texts from it later; **nothing here is reviewed by a person** (every gloss, gender, register choice and every Christian or festival word needs the Hindi session and a native reviewer). Figures marked *(measured)* were produced on 2026-10-06 with the real Hindi adapter (`adapter-hi@3`, the first reading of each word, proper nouns and numerals known), the way `ladder:check` reads units; figures marked *(planned)* are arithmetic on the plan; figures marked *(simulated)* replay the planned vocabulary over real texts, assuming that every planned lemma has been met three times in its own unit. The planning scripts were scratch files and are not in the repository; the plan below is the data. Lemma strings are NFC (the adapter's form: the nukta is a separate combining mark), so copy and compare them after `normalize('NFC')`.

## 0. Summary and the findings that shape the plan

| | a1-1 | a1-2 | a2-1 | a2-2 | a1-1…a2-2 | b1-bridge (opening, simulated) |
|---|---:|---:|---:|---:|---:|---:|
| units | 31 | 26 | 20 | 24 | 101 | 16 |
| in-place (drafts) | 20 | 8 | 0 | 0 | 28 | 0 |
| controlled core | 5 | 16 | 14 | 16 | 51 | 8 |
| controlled volume | 2 | 0 | 0 | 0 | 2 | 0 |
| controlled bridge | 4 | 2 | 0 | 0 | 6 | 0 |
| authentic GDL | 0 | 0 | 6 | 7 | 13 | 5 |
| authentic Scripture | 0 | 0 | 0 | 1 | 1 | 3 |
| running words | 6,190 | 9,890 | 12,948 | 21,662 | 50,690 | 12,889 |
| never-met lemmas (new) | 136 | 310 | 314 | 283 | 1043 | 325 |
| new per 100 words | 2.20 | 3.13 | 2.43 | 1.31 | 2.06 | 2.52 |
| lemmas known at the end (≥ 3 encounters) | 201 | 527 | 813 | 1039 | 1039 | 1255 |
| Scripture share of the stage | 0.0% | 0.0% | 0.0% | 8.5% | 3.6% | 15.7% |
| cumulative words after Stage 0 | 6,190 | 16,080 | 29,028 | 50,690 | 50,690 | 63,579 |

*Controlled core* units carry the vocabulary and a construction; *bridge* units are short controlled texts (260 words) whose only job is to teach the words that the next in-place draft needs; *volume* units (marked "vol") carry almost no new words and exist to recycle. "In-place" are the 28 machine-drafted texts of `data/corpus/hi` (Stage 0A–0C stories, `story-01`, `dialogue-01`), referenced where they are (`"document": "../../corpus/hi/<id>.json"`, `kind: "controlled"`), exactly as the Albanian ladder does it. "Authentic GDL" are Global Digital Library children's books and "authentic Scripture" are IRV chapters (`kind: "authentic"`, `textId`). The b1-bridge column is only the opening of that stage (section 5).

Findings, in the order they matter:

1. **The 28 in-place drafts do not pass the gate when read in their own order.** Measured after Stage 0 alone and then each other, 11 of them are coverage ERRORS (below 85 %, or 78 % for the first two units) and two are new-lemma ERRORS: s0a-03 77.7 %, s0a-04 72.2 %, s0a-06 80.4 %, s0a-10 79.2 %, s0a-12 79.9 %, s0b-03 81.2 %, s0b-04 83.7 %, s0b-07 82.1 %, s0c-01 73.0 % (and 9.8 new lemmas per 100), s0c-02 74.6 %, story-01 74.7 % (and 10.8 per 100); four more are coverage warnings (s0a-02, s0a-05, s0a-07, s0c-03) and four carry new-lemma warnings (s0b-03, s0c-02, s0c-03, s0c-05; table in section 1.2). The reason is arithmetic, not bad writing: a 79-word story with three new words is at 88 % at best, and Stage 0 leaves only 59 lemmas known (49 in the 17 scenes alone). The plan keeps every draft in place and unedited, and repairs the order with **six bridge units and two volume units** placed before or among them (section 1.2 shows each draft before and after); in the plan every draft is at 88.6 % or better, with no coverage warning and no error. Three drafts (s0c-01, s0c-02, s0c-03) still carry 6.6–7.5 new lemmas per 100 words (warning, below the error line of 9): they are the densest texts of the course and the plan lets the warning stand rather than pad.
2. **The coverage rule sets the vocabulary budget, and warning is 88 % now.** A lemma counts as known only after three earlier encounters, so the first three tokens of every new lemma are unknown in its own unit: expected coverage ≈ 1 − (3 × new + top-up tokens) / words. The 88 % line allows at most 4.0 new lemmas per 100 words; the plan's new lemmas per 100 words are 2.2 in a1-1, 3.1 in a1-2 (the 0C drafts are dense), 2.4 in a2-1 and 1.3 in a2-2, and every controlled unit is planned at 88.6 % or better (core units of a1 at 88.6–91 %, of a2 at 92–99 %). A new lemma is used **exactly three times** in its introducing unit and then recycled (the gate wants three more encounters inside the next six units: the recycle lists below, or the in-place texts, do that).
3. **Size.** 50,690 running words in a1-1 … a2-2 (target 45–55 k), **1,039 lemmas known (three encounters) at the end of a2-2** (target ≈ 1,000–1,100); a1 alone is 16,080 words (the contract says 15–30 k). Controlled and bridge units are 42,720 words, in-place drafts 4,530 and authentic GDL/Scripture 3,440 (inside a2-1 / a2-2).
4. **The library cannot be climbed as a whole.** The published GDL shelf is 92 books, 60,483 words. Measured with every lemma of the word list known, only **31 books reach 92 %** and 47 reach 88 %: 12.8 % of the tokens of those books have no reading in the word list at all (character names such as भबलू ×64, मोरू ×59, मुमताज़ ×57, कल्लू ×50, अनु ×48; colloquial forms such as वो ×85, मम्मी, टीचर, टीम, ना; loans and rarer words). After Stage 0 and the drafts the best book is at 82.3 % and the median at 58.5 % (57 % in the audit), none at 90 %. With this ladder, **14 books are readable at ≥ 92 % after a2-2 and 18 after the simulated b1 opening**; the plan places 13 of them as authentic units inside a2-1 and a2-2 (2,693 words) and 5 more in the b1 opening. The rest of the shelf needs names and loans added to the adapter (section 4.7) before any ladder can reach it; until then it is library, not ladder.
5. **Scripture is nearly in reach, but only for one chapter.** John 14 needs a handful of Bible words (यदि, संसार, हे, मार्ग, आज्ञा, … which the plan teaches in the church and testimony units) and then stands at 92.5% after a2-2: it is placed in a2-2 at 92.5%. Mark 1 (91.5% after a2-2, 24 lemmas short of 95 %), John 1 (91.1%) and Psalm 23 (83.1%) enter in the b1 opening, after the preparation unit about the shepherd (the percentages leave the text itself out). Scripture is 8.5 % of a2-2 (John 14 and the retelling of Luke 15), at most 10 %; the b1 opening is a partial stage (12.9 k words of a stage of 30–60 k) and shows 16 % only because it is not finished.
6. **The literature is not reachable.** After a2-2 Premchand's *Panch Parameshwar* is at 68.3% and *Namak ka Daroga* at 65.8% (they need about 484 and 514 more lemmas for 92 %), *Andher Nagari* at 60.0% (417): library, not ladder. Section 5 says what the rest of b1 has to be before they could enter.
7. **The adapter will trip the gate in nine Hindi-specific ways** (section 7, each with measured evidence): homograph forms read as different lemmas depending on context (111 forms in 67,000 tokens, among them the name सीता read as the verb सीना 8 times in 19, भाई as भाना 17 of 42, सही as सहना 14 of 21); 12.8 % of the GDL tokens with no reading; plural-oblique forms that collide with another word (कमरों → कमर); compound postpositions that are separate lemmas to schedule; the missing colloquial वो; compound numerals above 30 with no reading (use digits).
8. **The cast clash.** Stage 0 gives Ravi (a teacher, about thirty) and Meera (a nurse, his sister); the 0A–0C drafts give Ravi and Meera as a boy and his younger sister. The plan keeps the drafts untouched and calls the adults **रवि सर** and **मीरा दीदी** in every controlled unit, so the two pairs are told apart by the address term (section 8, item 2).

## 1. The starting point

### 1.1 Stage 0

Stage 0 (`data/stage0/hi/`, AI-drafted, unreviewed) has 17 scenes, 9 sound steps and two exit forms (exit forms are not exposure). The adapter reads the 17 scenes as 485 running words *(measured)* (the audit counts 484); the gate also reads the three review steps as re-readings, so Stage 0 reaches it as 20 texts, 570 words and 91 lemmas (first reading, names and numerals excluded). **49 lemmas are met three times or more in the scenes alone, 59 with the review re-readings; 32 are met once or twice** and are top-up work for the first controlled units. The cast: **Sam** (सैम, the learner's stand-in, a man in the scenes), **Meera** (मीरा, a nurse, about thirty), **Ravi** (रवि, a teacher, her brother), **Seeta Nani** (सीता नानी, grandmother, sells bread at the market, goes to church) and **Aman** (अमन, her grandson, ten, loses things). Neither सैम nor अमन is in the adapter's list of proper names, so each costs unknown tokens until it has appeared three times (they do, in the scenes).

Known after Stage 0 (59, with the review re-readings): नमस्ते मेरा नाम होना आपका सैम यह रवि घर क्या चाय और वह पानी मैं में भी पापा नहीं बाज़ार हाँ आप चाहिए लेना शुक्रिया को बहुत पसंद दूध ठीक थकना आज काम बैग कहाँ मेज़ पर कुर्सी अमन का हम जाना सीना नानी रोटी बेचना रुपया धन्यवाद करना स्कूल शनिवार रविवार चर्च गरम दाल यहाँ हिंदी बोलना चावल. (सीना is the name सीता read as the verb "to sew": a measured trap, section 7.)

Met once or twice (32, to be topped up): भाई बहन लेकिन कैसे चाबी फ़ोन तुम्हारा किताब पता दीदी बड़ा चलना कितना अस्पताल कौन छोटा लड़का कल बाइबल सुबह बजना बारिश पीना बनाना रहना सीखना दोस्त अच्छा लगना खाना फल थोड़ा.

Constructions Stage 0 teaches (its 39 coverage ids, among them): greeting and thanks; मेरा नाम X है; यह / वह X है; मेरा / मेरी / मेरे; है / हैं / हूँ; क्या questions; yes/no questions by voice; X में है; नहीं; मैं / हम / आप; को; X को Y चाहिए; X को Y पसंद है; और / लेकिन; कैसे हैं; थका / थकी; कहाँ; पर; का / की / के; तुम with friends; the habitual present. The adapter's `detectPatterns` finds, in the scenes, 15 keys: `adjective-noun-agreement`, `causative`, `command`, `emphatic-particles`, `genitive-agreement`, `habitual-present`, `infinitive-as-noun`, `ko-experiencer`, `oblique-before-postposition`, `perfective-past`, `plural-forms`, `polite-request`, `postposition-after-noun`, `present-perfect`, `reduplication` (some of these, such as `causative` and `perfective-past`, are detector false positives on Stage 0's words; the table in section 2.2 uses the key where the gate first sees it).

### 1.2 The in-place drafts, measured

The 28 documents are `s0a-01` … `s0a-12` (1,359 words), `s0b-01` … `s0b-08` (1,421), `s0c-01` … `s0c-06` (1,607), `story-01` (83) and `dialogue-01` (60): 4,530 running words, 0 unanalysed tokens, 259 name tokens, 263 lemma types *(measured)*. Together with Stage 0 they give 286 lemmas seen and **189 known** after the last of them. They are machine-drafted, `review.status: "unreviewed"`, and **stay unpublished until a named native reviewer signs the exact wording** (a later edit voids the signature): the plan never edits them. Their order in `ladder.json` is the one in the table, with the bridge units of section 3 between them.

Left in their natural order directly after Stage 0, the gate would read them as in the "natural order" columns; the right-hand column is the same text in this plan (preceded by the planned bridge, core and volume units):

| text | words | natural order: cov. ≥3 | never-met lemmas (per 100) | verdict in natural order | in the plan: unit, cov. ≥3, never-met (per 100) |
|---|---:|---:|---:|---|---|
| s0a-01 | 66 | 93.9% | 0 (0.0) | ok | hi-a1-1-01 (#1), 93.9%, 0 (0.0) |
| s0a-02 | 79 | 84.8% | 2 (2.5) | warning | hi-a1-1-03 (#3), 93.7%, 1 (1.3) |
| s0a-03 | 112 | 77.7% | 4 (3.6) | ERROR | hi-a1-1-04 (#4), 97.3%, 1 (0.9) |
| s0a-04 | 79 | 72.2% | 3 (3.8) | ERROR | hi-a1-1-05 (#5), 88.6%, 2 (2.5) |
| s0a-05 | 94 | 87.2% | 0 (0.0) | warning | hi-a1-1-07 (#7), 100.0%, 0 (0.0) |
| s0a-06 | 107 | 80.4% | 3 (2.8) | ERROR | hi-a1-1-09 (#9), 94.4%, 2 (1.9) |
| s0a-07 | 115 | 87.8% | 2 (1.7) | warning | hi-a1-1-10 (#10), 100.0%, 0 (0.0) |
| s0a-08 | 143 | 88.8% | 1 (0.7) | ok | hi-a1-1-12 (#12), 97.2%, 1 (0.7) |
| s0a-09 | 147 | 90.5% | 2 (1.4) | ok | hi-a1-1-13 (#13), 96.6%, 1 (0.7) |
| s0a-10 | 144 | 79.2% | 6 (4.2) | ERROR | hi-a1-1-16 (#16), 93.8%, 3 (2.1) |
| s0a-11 | 139 | 97.8% | 1 (0.7) | ok | hi-a1-1-17 (#17), 100.0%, 0 (0.0) |
| s0a-12 | 134 | 79.9% | 2 (1.5) | ERROR | hi-a1-1-18 (#18), 100.0%, 0 (0.0) |
| s0b-01 | 197 | 90.4% | 8 (4.1) | ok | hi-a1-1-20 (#20), 93.9%, 6 (3.0) |
| s0b-02 | 174 | 91.4% | 5 (2.9) | ok | hi-a1-1-21 (#21), 95.4%, 4 (2.3) |
| s0b-03 | 191 | 81.2% | 10 (5.2) | ERROR + warning new/100 | hi-a1-1-24 (#24), 92.7%, 7 (3.7) |
| s0b-04 | 166 | 83.7% | 6 (3.6) | ERROR | hi-a1-1-25 (#25), 95.2%, 3 (1.8) |
| s0b-05 | 159 | 94.3% | 5 (3.1) | ok | hi-a1-1-26 (#26), 94.3%, 5 (3.1) |
| s0b-06 | 163 | 92.0% | 5 (3.1) | ok | hi-a1-1-27 (#27), 93.9%, 5 (3.1) |
| s0b-07 | 184 | 82.1% | 8 (4.3) | ERROR | hi-a1-1-29 (#29), 91.3%, 6 (3.3) |
| s0b-08 | 187 | 89.8% | 6 (3.2) | ok | hi-a1-1-30 (#30), 93.6%, 5 (2.7) |
| s0c-01 | 307 | 73.0% | 30 (9.8) | ERROR + ERROR new/100 | hi-a1-2-02 (#33), 90.2%, 23 (7.5) |
| s0c-02 | 256 | 74.6% | 23 (9.0) | ERROR + warning new/100 | hi-a1-2-05 (#36), 90.6%, 17 (6.6) |
| s0c-03 | 259 | 85.7% | 20 (7.7) | warning + warning new/100 | hi-a1-2-07 (#38), 89.6%, 17 (6.6) |
| s0c-04 | 259 | 91.5% | 8 (3.1) | ok | hi-a1-2-09 (#40), 93.8%, 6 (2.3) |
| s0c-05 | 267 | 89.5% | 14 (5.2) | ok + warning new/100 | hi-a1-2-12 (#43), 93.6%, 11 (4.1) |
| s0c-06 | 259 | 90.0% | 10 (3.9) | ok | hi-a1-2-14 (#45), 95.4%, 7 (2.7) |
| story-01 | 83 | 74.7% | 9 (10.8) | ERROR + ERROR new/100 | hi-a1-2-17 (#48), 96.4%, 2 (2.4) |
| dialogue-01 | 60 | 88.3% | 2 (3.3) | ok | hi-a1-2-18 (#49), 91.7%, 1 (1.7) |

Verdicts use the contract's bands (first two units warn 85 % / error 78 %, then 88 % / 85 %; new lemmas warn 5 / error 9 per 100). In the plan the worst draft is s0a-04 at 88.6 % (no coverage warning; it carries one of the plan's two cliff warnings, section 3.1), and the three densest drafts keep their new-lemma warnings.

### 1.3 What neither gives, and the top-up

Constructions never met after Stage 0 and the drafts (the adapter's keys): `future`, `negative-command`, `permissive-dena`, `about-to-vaala`, `purpose-infinitive`, `ability-sakna`, `managing-paana`, `passive`, `conjunctive-participle`, `relative-correlative`, `jahaan-vahaan`, `jaisa-vaisa`, `jitna-utna`, `contrary-to-fact`, `superlative-sabse` and `vaala`. There is no future tense at all, no -कर form, no relative clause, no passive and no comparison beyond से; section 2.2 schedules them. Also missing: all days but शनिवार / रविवार, the clock, most of the body, health, the market beyond bread, transport beyond "bus", and the church, which is only one scene.

**Top-up.** After Stage 0 and the drafts, 97 lemmas have been met once or twice. Whenever a controlled unit can use a lemma that stands at one or two encounters, its block lists it under "Top-up (n tokens)" with the number of uses that makes it known (the unit then costs that many unknown tokens: they are in the est. cov.). Over the whole ladder (a1-1 … a2-2) that is 196 lemmas, 344 tokens, 0.7 % of the running words; the lemmas are the 97 above and the words that in-place and authentic texts leave at one or two encounters. The cheaper fix is on the in-place side (an extra scene or two that use the under-met words), but the drafts are not edited here.

## 2. Targets per stage

### 2.1 Table

The table of section 0 is the target table. The strategy: **a1-1** (31 units, 6.2 k words) is the drafts 0A and 0B with four bridge units, two volume units and five core units (morning, vegetables, clinic, church, address) that give Sam's frame; **a1-2** (26 units, 9.9 k) is the 0C drafts and the two seeds with sixteen core units (future, train, lessons, Diwali, dal, message, rain, testimony, clinic, prayer, auto, birthday, neighbours, letter, vegetable seller, lost phone); **a2-1** (20 units, 12.9 k) and **a2-2** (24 units, 21.7 k) alternate longer core units with authentic GDL books and, in a2-2, John 14. Core units go from 300–560 words in a1 through 770–940 in a2-1 to 1,000–1,320 in a2-2. Every unit is recordable in one sitting (≤ 1,320 words).

### 2.2 Constructions: the sequence and where the adapter sees them

The order used here, after what the drafts already do (ने perfective, the progressive, था, obligation, conditional, first subjunctive): **future → ability / wanting / obligation (सकना, चाहना, पड़ना) → purpose and conjunctive participle (-ने के लिए, -कर) → negative command (मत) → कि-clauses → superlative and -वाला → relative and correlative clauses → habitual past and pluperfect in biography → passive → managing / permissive (पाना, देना) → counterfactual and complex clauses (जैसा … वैसा, अगर … तो … होता)**. Honorific and polite register is used from unit 1 (आप, -इए, दादा जी, शर्मा जी) and never taught as a paradigm. The table lists every key of `construction-data.ts` with the unit where the gate will first see it (in-place and authentic units by measurement, controlled units by plan):

| adapter key | what it is (the adapter's own title) | first met | where (unit) |
|---|---|---|---|
| `postposition-after-noun` | The postposition comes after the noun | Stage 0 | Stage 0 (the adapter finds it there) |
| `genitive-agreement` | का / के / की agrees with the thing owned | Stage 0 | Stage 0 (the adapter finds it there) |
| `adjective-noun-agreement` | The adjective agrees with its noun | Stage 0 | Stage 0 (the adapter finds it there) |
| `plural-forms` | Plural nouns | Stage 0 | Stage 0 (the adapter finds it there) |
| `oblique-before-postposition` | The oblique form before a postposition | Stage 0 | Stage 0 (the adapter finds it there) |
| `habitual-present` | Habitual present (-ता है) | Stage 0 | Stage 0 (the adapter finds it there) |
| `progressive` | Progressive (रहा है / रहा था) | a1-1 | hi-a1-1-24 (#24) |
| `question-kya` | क्या at the start of a question | a1-1 | hi-a1-1-16 (#16) |
| `existence-possession` | Having and being there (के पास … है, का … है) | a1-1 | hi-a1-1-14 (#14) |
| `ko-experiencer` | को on the one who feels or has | Stage 0 | Stage 0 (the adapter finds it there) |
| `comparison-se` | Comparison with से | a1-1 | hi-a1-1-20 (#20) |
| `ko-definite-object` | को on a definite object | a1-1 | hi-a1-1-21 (#21) |
| `compound-verb` | The compound verb | a1-1 | hi-a1-1-26 (#26) |
| `auxiliary-chain` | A chain of helping verbs | a1-1 | hi-a1-1-24 (#24) |
| `perfective-past` | The perfective past (-ा) | Stage 0 | Stage 0 (the adapter finds it there) |
| `ergative-ne` | ने with the perfective | a1-2 | hi-a1-2-02 (#33) |
| `ne-with-ko-object` | ने with को on the object | a1-2 | hi-a1-2-02 (#33) |
| `pluperfect` | Past perfect (-ा था) | a1-2 | hi-a1-2-02 (#33) |
| `obligation` | Obligation (-ना है, -ना चाहिए, -ना पड़ा) | a1-2 | hi-a1-2-02 (#33) |
| `inceptive-lagna` | Beginning to (-ने लगना) | a1-2 | hi-a1-2-02 (#33) |
| `oblique-infinitive` | The oblique infinitive (-ने) | a1-2 | hi-a1-2-02 (#33) |
| `jab-tab` | जब … तब | a1-2 | hi-a1-2-02 (#33) |
| `conditional` | अगर … तो (a condition) | a1-2 | hi-a1-2-02 (#33) |
| `future` | The future (-गा / -गी / -गे) | a1-2 | hi-a1-2-03 (#34) |
| `subjunctive` | The subjunctive | a1-2 | hi-a1-2-03 (#34) |
| `purpose-infinitive` | Purpose (-ने के लिए / -ने को) | a1-2 | hi-a1-2-06 (#37) |
| `ability-sakna` | Ability (सकना) | a1-2 | hi-a1-2-06 (#37) |
| `wanting-chahna` | Wanting (चाहना + infinitive) | a1-2 | hi-a1-2-08 (#39) |
| `conjunctive-participle` | Having done (stem + कर / के) | a1-2 | hi-a1-2-11 (#42) |
| `negative-command` | The negative command (मत) | a1-2 | hi-a1-2-11 (#42) |
| `complement-ki` | कि introduces what was said or known | a1-2 | hi-a1-2-13 (#44) |
| `habitual-past` | Habitual past (-ता था) | a1-2 | hi-a1-2-17 (#48) |
| `superlative-sabse` | सबसे "the most" | a1-2 | hi-a1-2-23 (#54) |
| `vaala` | वाला | a1-2 | hi-a1-2-25 (#56) |
| `relative-correlative` | जो … वह | a2-1 | hi-a2-1-02 (#59) |
| `about-to-vaala` | About to (-ने वाला होना) | a2-1 | hi-a2-1-06 (#63) |
| `passive` | The passive (-ा जाना) | a2-1 | hi-a2-1-08 (#65) |
| `managing-paana` | Managing to (पाना) | a2-1 | hi-a2-1-07 (#64) |
| `jitna-utna` | जितना … उतना | a2-1 | hi-a2-1-14 (#71) |
| `contrary-to-fact` | A condition that did not happen (-ता … -ता) | a2-1 | hi-a2-1-16 (#73) |
| `permissive-dena` | Letting, allowing (-ने देना) | a2-1 | hi-a2-1-18 (#75) |
| `jahaan-vahaan` | जहाँ … वहाँ | a2-2 | hi-a2-2-05 (#82) |
| `jaisa-vaisa` | जैसा … वैसा | a2-2 | hi-a2-2-08 (#85) |
| `command` | Commands (तू / तुम / आप) | Stage 0 | Stage 0 (the adapter finds it there) |
| `polite-request` | The polite request | Stage 0 | Stage 0 (the adapter finds it there) |
| `infinitive-as-noun` | The infinitive as a noun | Stage 0 | Stage 0 (the adapter finds it there) |
| `causative` | Causative verbs | Stage 0 | Stage 0 (the adapter finds it there) |
| `reduplication` | A word said twice | Stage 0 | Stage 0 (the adapter finds it there) |
| `emphatic-particles` | ही, भी, तो | Stage 0 | Stage 0 (the adapter finds it there) |
| `present-perfect` | Present perfect (-ा है) | Stage 0 | Stage 0 (the adapter finds it there) |

The detector is conservative: it misses unusual word order rather than guessing, so "first met" for controlled units is planned, not promised.

### 2.3 Domain mix (running words, share of the stage)

| domain | a1-1 | a1-2 | a2-1 | a2-2 |
|---|---:|---:|---:|---:|
| biography | — | — | 770 (6%) | 1,210 (6%) |
| church-and-mission-life | 370 (6%) | 490 (5%) | 880 (7%) | 1,210 (6%) |
| community | 1,204 (19%) | 960 (10%) | — | 1,210 (6%) |
| contemporary-nonfiction | — | — | 1,710 (13%) | 2,420 (11%) |
| conversation | 827 (13%) | 460 (5%) | 830 (6%) | 1,100 (5%) |
| correspondence | — | 980 (10%) | 770 (6%) | 1,100 (5%) |
| daily-life | 1,198 (19%) | 420 (4%) | — | — |
| explanation | — | 450 (5%) | — | — |
| family | 617 (10%) | 500 (5%) | — | 1,270 (6%) |
| food | 558 (9%) | — | — | 1,320 (6%) |
| health | 360 (6%) | 480 (5%) | 940 (7%) | 1,210 (6%) |
| instructions | — | 450 (5%) | 770 (6%) | — |
| narrative | 706 (11%) | 2,687 (27%) | 3,738 (29%) | 2,755 (13%) |
| practical-communication | 350 (6%) | — | 830 (6%) | — |
| scripture | — | — | — | 1,847 (9%) |
| testimony | — | 553 (6%) | 880 (7%) | 2,590 (12%) |
| travel | — | 920 (9%) | — | 1,210 (6%) |
| work | — | 540 (5%) | 830 (6%) | 1,210 (6%) |

Domains follow the contract's list. Church life and testimony are separate domains and are **not** Scripture (their shared vocabulary is religious in places: `hi-a1-1-28`, `hi-a1-2-16`, `hi-a1-2-20` and `hi-a2-2-15`). "Scripture" is John 14 (authentic) and the retelling of Luke 15 (the course's own words, `domain: "scripture"`), which is 8.5 % of a2-2; the other stages have none. Narrative is high in a1-2 and a2 because the 0C drafts are narrative; nonfiction and explanation fill a2 from a2-1. Instructions are thin (`hi-a1-2-11` and `hi-a2-1-11`, with the feast unit `hi-a2-2-20` labelled food); if the owner wants more, relabel some a2-2 units.

### 2.4 What every unit must obey

1. **Budget.** Introduce exactly the new lemmas listed, each exactly three times; use no lemma outside Stage 0, the in-place texts so far, the earlier units' lists and the unit's own list. A *palette* is the union of those lists: at the start of a unit the known-lemma count is printed in its block, and the palette can be rebuilt by reading every "New" and "Top-up" list above the unit in this file (section 9). Inflections of a listed lemma are free; **a word the adapter cannot read as a listed lemma counts as unknown**, and so does a homograph read as another lemma (section 7): check the draft with `ladder:check`.
2. **Recycle.** Use every lemma on the unit's "Recycle" list the number of times it is listed (a word listed twice is used twice). Function words are listed where they recur by themselves; the lists are assigned by theme overlap and load (most uses per 100 words: 10), and the writer may move a use to a nearer unit and tell the plan owner. In the first sixteen units the in-place drafts carry most of the recycling, so the early lists are short.
3. **Do not write to the warning.** `docs/LADDER.md` and the Spanish ladder's second pass say it: padding a unit with known words, or avoiding ordinary words the plan has not scheduled, to stay above 88 % makes worse Hindi. If a sentence needs an ordinary word that is not on any list, use it, keep it **to one or two per 100 words**, and write it into the unit's `review.notes` so the plan owner can move it to a list. Authentic placements are not edited.
4. **Register.** Standard Hindi in Devanagari; everyday tadbhava and common Urdu-origin words as people speak them (दाम, पैसा, मदद, ज़रूर, शायद, ख़ुशी, किराया), not Sanskritized ones; the church words are the ones Hindi churches use (परमेश्वर, प्रभु, यीशु, प्रार्थना, कलीसिया beside चर्च). **आप** for adults and strangers, **तुम** among friends and to children, **तू** only to a small child or in prayer-like speech; honorific plural verbs for पापा, दादा जी, दादी, शर्मा जी, रवि सर, पास्टर अनिल; माँ singular (the choice of the 0A–0C stories, still to be confirmed by a reviewer). No romanization anywhere.
5. **Spelling.** One spelling per word, the Stage 0 conventions: nukta words with the nukta (बाज़ार, फ़ोन, ज़रूर, ख़ुश), chandrabindu in माँ हूँ यहाँ कहाँ हाँ, anusvara in हैं में मैं नहीं, `गई / गए` (not `गयी`), `गरम`, `छह`, the danda closing a statement with no space before it, plain `"` for speech.
6. **Numerals.** Numerals count as known. Only the adapter's numerals up to 30, the tens, सौ / हज़ार / लाख and a few more are words; **write every number above 30 (and prices, ages, years, dates, phone numbers) in digits**: इक्यावन has no reading, 51 is free.
7. **Names.** Cast names are chosen from the adapter's name list wherever possible (अनिल, सुनीता, प्रिया, रोहन, दीपक, रमेश, सुरेश, गीता, किरण, आरती, मीरा, रवि, सीता; the city names दिल्ली, बनारस; the biblical names यीशु, मरियम, पतरस, यूहन्ना…). सैम and अमन are the two Stage 0 names that are not in the list: keep them spelled one way. Any other name is an unknown lemma until it has appeared three times: introduce a name only where this plan lists it (units name a cast in their block) and not in the same unit as many new words.
8. **Sentence length.** Mean ≤ 8 words in a1-1, ≤ 10 in a1-2, ≤ 13 in a2-1, ≤ 16 in a2-2 (the 0A stories are at ≤ 6, the 0C stories ≤ 17); one finite clause per sentence in a1-1; one English line per Hindi sentence (a plain, faithful gloss).
9. **Domains and cast.** Follow the unit's domain; keep the cast; texts are for adults on a mission team (the children's register belongs to the in-place drafts and the authentic books). Festivals and religions of the neighbours (Diwali, Holi, the temple, the mosque) are described by a respectful guest, never with polemic, never imitated, never mocked: the reviewer's checklist has "cultural oddities" for this.
10. **Provenance.** Each controlled unit is a document under `data/ladder/hi/units/`, corpus id `ladder-hi`, `pipeline.state: "machine-draft"` (tool, with the date), `review.status: "unreviewed"`, `domains: [...]` (no `variety` tag: Modern Standard Hindi carries none), review notes listing the points for the reviewer (honorifics, the Christian vocabulary, regional words, the words added outside the plan).


## 3. The units

### 3.1 Table and rules of the sequence

"New" counts the lemmas never met before (planned for controlled units, measured for in-place and authentic ones). "Est. cov." = 1 − (3 × new + top-up tokens) / words for controlled units (planned, not measured); for in-place and authentic units it is the coverage of the real text after the units before it (model of the plan: every planned lemma known after its three uses). Units 1–2 sit in the policy's lower band (warn 85 %, error 78 %).

| id | # | kind | words | domain | title | new | /100 | est. cov. | main construction |
|---|---:|---|---:|---|---|---:|---:|---:|---|
| hi-a1-1-01 | 1 | in-place | 66 | narrative | रवि और मीरा (s0a-01) | 0 | 0.0 | 93.9% |  |
| hi-a1-1-02 | 2 | controlled (bridge) | 260 | family | Seeta Nani's house: kitchen, grandparents, Moti | 6 | 2.3 | 93.1% | postposition-after-noun |
| hi-a1-1-03 | 3 | in-place | 79 | family | माँ और पापा (s0a-02) | 1 | 1.3 | 93.7% |  |
| hi-a1-1-04 | 4 | in-place | 112 | family | दादी और दादा जी (s0a-03) | 1 | 0.9 | 97.3% |  |
| hi-a1-1-05 | 5 | in-place | 79 | narrative | मोती (s0a-04) | 2 | 2.5 | 88.6% |  |
| hi-a1-1-06 | 6 | controlled | 340 | daily-life | A morning at Seeta Nani's house | 10 | 2.9 | 89.7% | habitual-present |
| hi-a1-1-07 | 7 | in-place | 94 | narrative | दोस्त (s0a-05) | 0 | 0.0 | 100.0% |  |
| hi-a1-1-08 | 8 | controlled (bridge) | 260 | daily-life | Aman's new book | 6 | 2.3 | 93.1% | adjective-noun-agreement |
| hi-a1-1-09 | 9 | in-place | 107 | community | शर्मा जी (s0a-06) | 2 | 1.9 | 94.4% |  |
| hi-a1-1-10 | 10 | in-place | 115 | food | मेज़ पर खाना (s0a-07) | 0 | 0.0 | 100.0% |  |
| hi-a1-1-11 | 11 | controlled (vol) | 300 | food | Lunch at Seeta Nani's table | 3 | 1.0 | 96.0% | habitual-present |
| hi-a1-1-12 | 12 | in-place | 143 | food | रवि रोटी खाता है (s0a-08) | 1 | 0.7 | 97.2% |  |
| hi-a1-1-13 | 13 | in-place | 147 | daily-life | स्कूल जाते हैं (s0a-09) | 1 | 0.7 | 96.6% |  |
| hi-a1-1-14 | 14 | controlled | 350 | community | Vegetables and prices | 11 | 3.1 | 89.1% | postposition-after-noun |
| hi-a1-1-15 | 15 | controlled (bridge) | 260 | community | Boys and girls in the park | 6 | 2.3 | 93.1% | habitual-present |
| hi-a1-1-16 | 16 | in-place | 144 | narrative | मैदान में (s0a-10) | 3 | 2.1 | 93.8% | question-kya |
| hi-a1-1-17 | 17 | in-place | 139 | narrative | गेंद कहाँ है? (s0a-11) | 0 | 0.0 | 100.0% |  |
| hi-a1-1-18 | 18 | in-place | 134 | conversation | यह कौन है? (s0a-12) | 0 | 0.0 | 100.0% |  |
| hi-a1-1-19 | 19 | controlled (vol) | 300 | community | Evening in the lane | 3 | 1.0 | 95.7% | habitual-present |
| hi-a1-1-20 | 20 | in-place | 197 | conversation | मेरा नाम रवि है (s0b-01) | 6 | 3.0 | 93.9% | comparison-se |
| hi-a1-1-21 | 21 | in-place | 174 | conversation | यह किसकी किताब है? (s0b-02) | 4 | 2.3 | 95.4% | ko-definite-object |
| hi-a1-1-22 | 22 | controlled | 360 | health | Meera didi's clinic | 11 | 3.1 | 89.2% | ko-experiencer |
| hi-a1-1-23 | 23 | controlled (bridge) | 260 | daily-life | Ravi sir's class | 6 | 2.3 | 93.1% | postposition-after-noun |
| hi-a1-1-24 | 24 | in-place | 191 | daily-life | स्कूल का दिन (s0b-03) | 7 | 3.7 | 92.7% | auxiliary-chain |
| hi-a1-1-25 | 25 | in-place | 166 | family | दादी का गाँव (s0b-04) | 3 | 1.8 | 95.2% |  |
| hi-a1-1-26 | 26 | in-place | 159 | conversation | आइए, बैठिए (s0b-05) | 5 | 3.1 | 94.3% | compound-verb |
| hi-a1-1-27 | 27 | in-place | 163 | conversation | फ़ोन पर (s0b-06) | 5 | 3.1 | 93.9% |  |
| hi-a1-1-28 | 28 | controlled | 370 | church-and-mission-life | Sunday at church | 11 | 3.0 | 88.9% | polite-request |
| hi-a1-1-29 | 29 | in-place | 184 | narrative | मोती का दिन (s0b-07) | 6 | 3.3 | 91.3% |  |
| hi-a1-1-30 | 30 | in-place | 187 | community | शहर में (s0b-08) | 5 | 2.7 | 93.6% |  |
| hi-a1-1-31 | 31 | controlled | 350 | practical-communication | Where do you live? Address and phone number | 11 | 3.1 | 88.6% | postposition-after-noun |
| hi-a1-2-01 | 32 | controlled (bridge) | 260 | narrative | The alarm clock | 6 | 2.3 | 93.1% | perfective-past |
| hi-a1-2-02 | 33 | in-place | 307 | narrative | देर हो गई (s0c-01) | 23 | 7.5 | 90.2% | ergative-ne |
| hi-a1-2-03 | 34 | controlled | 400 | conversation | Tomorrow's plans | 11 | 2.8 | 89.8% | future |
| hi-a1-2-04 | 35 | controlled (bridge) | 260 | narrative | A pot of water and pebbles | 6 | 2.3 | 93.1% | perfective-past |
| hi-a1-2-05 | 36 | in-place | 256 | narrative | दादी की कहानी (s0c-02) | 17 | 6.6 | 90.6% |  |
| hi-a1-2-06 | 37 | controlled | 420 | travel | The train to the village | 12 | 2.9 | 89.3% | purpose-infinitive |
| hi-a1-2-07 | 38 | in-place | 259 | narrative | गाँव का सफ़र (s0c-03) | 17 | 6.6 | 89.6% |  |
| hi-a1-2-08 | 39 | controlled | 420 | daily-life | Hindi lessons with Ravi sir | 12 | 2.9 | 89.0% | obligation |
| hi-a1-2-09 | 40 | in-place | 259 | narrative | मोती कहाँ गया? (s0c-04) | 6 | 2.3 | 93.8% |  |
| hi-a1-2-10 | 41 | controlled | 440 | community | Diwali lamps in the lane | 12 | 2.7 | 90.5% | subjunctive |
| hi-a1-2-11 | 42 | controlled | 450 | instructions | Seeta Nani's dal | 13 | 2.9 | 89.1% | command |
| hi-a1-2-12 | 43 | in-place | 267 | narrative | आम के पेड़ के नीचे (s0c-05) | 11 | 4.1 | 93.6% |  |
| hi-a1-2-13 | 44 | controlled | 440 | correspondence | A message from the team | 12 | 2.7 | 89.5% | complement-ki |
| hi-a1-2-14 | 45 | in-place | 259 | narrative | शर्मा जी का सवाल (s0c-06) | 7 | 2.7 | 95.4% |  |
| hi-a1-2-15 | 46 | controlled | 450 | explanation | Rain on the roof | 13 | 2.9 | 89.8% | habitual-present |
| hi-a1-2-16 | 47 | controlled | 470 | testimony | My story (Sam) | 13 | 2.8 | 90.0% | perfective-past |
| hi-a1-2-17 | 48 | in-place | 83 | testimony | मेरी कहानी (story-01) | 2 | 2.4 | 96.4% | habitual-past |
| hi-a1-2-18 | 49 | in-place | 60 | conversation | एक बातचीत (dialogue-01) | 1 | 1.7 | 91.7% |  |
| hi-a1-2-19 | 50 | controlled | 480 | health | A day at the clinic | 13 | 2.7 | 90.2% | perfective-past |
| hi-a1-2-20 | 51 | controlled | 490 | church-and-mission-life | Prayer meeting on Thursday | 14 | 2.9 | 89.6% | subjunctive |
| hi-a1-2-21 | 52 | controlled | 500 | travel | The auto-rickshaw | 14 | 2.8 | 89.6% | command |
| hi-a1-2-22 | 53 | controlled | 500 | family | Aman's birthday | 14 | 2.8 | 89.2% | future |
| hi-a1-2-23 | 54 | controlled | 520 | community | Our neighbours | 15 | 2.9 | 89.6% | superlative-sabse |
| hi-a1-2-24 | 55 | controlled | 540 | correspondence | A letter home | 15 | 2.8 | 89.6% | present-perfect |
| hi-a1-2-25 | 56 | controlled | 540 | work | The vegetable seller's day | 15 | 2.8 | 90.0% | vaala |
| hi-a1-2-26 | 57 | controlled | 560 | narrative | The lost phone | 16 | 2.9 | 90.2% | perfective-past |
| hi-a2-1-01 | 58 | controlled | 770 | biography | Seeta Nani's life | 18 | 2.3 | 93.0% | habitual-past |
| hi-a2-1-02 | 59 | controlled | 830 | contemporary-nonfiction | Our city, street by street | 19 | 2.3 | 93.1% | relative-correlative |
| hi-a2-1-03 | 60 | authentic | 79 | narrative | मेरे दोस्त | 5 | 6.3 | 93.7% |  |
| hi-a2-1-04 | 61 | controlled | 770 | correspondence | Letter to the sending church | 18 | 2.3 | 92.2% | present-perfect |
| hi-a2-1-05 | 62 | authentic | 81 | narrative | एक था मोटा राजा | 4 | 4.9 | 95.1% |  |
| hi-a2-1-06 | 63 | controlled | 880 | narrative | The night of the storm | 20 | 2.3 | 92.5% | pluperfect |
| hi-a2-1-07 | 64 | authentic | 294 | narrative | चलो किताबें खरीदने | 15 | 5.1 | 93.2% | managing-paana |
| hi-a2-1-08 | 65 | controlled | 830 | practical-communication | At the government office | 19 | 2.3 | 91.1% | passive |
| hi-a2-1-09 | 66 | authentic | 318 | narrative | घर जाना है | 22 | 6.9 | 92.8% |  |
| hi-a2-1-10 | 67 | authentic | 171 | narrative | अभी नहीं, अभी नहीं! | 7 | 4.1 | 93.6% |  |
| hi-a2-1-11 | 68 | controlled | 770 | instructions | How tea is made, and why we drink it | 18 | 2.3 | 90.6% | passive |
| hi-a2-1-12 | 69 | authentic | 265 | narrative | अम्मा जब स्कूल गयीं | 16 | 6.0 | 92.8% |  |
| hi-a2-1-13 | 70 | controlled | 880 | testimony | Pastor Anil's story | 20 | 2.3 | 91.0% | perfective-past |
| hi-a2-1-14 | 71 | controlled | 880 | contemporary-nonfiction | The monsoon and the farmers | 20 | 2.3 | 91.9% | relative-correlative |
| hi-a2-1-15 | 72 | controlled | 770 | narrative | The clever mouse (Nani's story) | 18 | 2.3 | 93.0% | perfective-past |
| hi-a2-1-16 | 73 | controlled | 830 | conversation | Exam week at Ravi sir's school | 19 | 2.3 | 93.1% | conditional |
| hi-a2-1-17 | 74 | controlled | 830 | work | Priya's mobile-phone shop | 17 | 2.0 | 93.9% | passive |
| hi-a2-1-18 | 75 | controlled | 940 | health | The medical camp in the village | 16 | 1.7 | 94.9% | obligation |
| hi-a2-1-19 | 76 | controlled | 880 | narrative | Aman's lost bag | 12 | 1.4 | 95.9% | pluperfect |
| hi-a2-1-20 | 77 | controlled | 880 | church-and-mission-life | Why we celebrate Christmas | 11 | 1.3 | 96.3% | relative-correlative |
| hi-a2-2-01 | 78 | controlled | 1210 | travel | Diary of a trip to the hills | 12 | 1.0 | 97.0% | conjunctive-participle |
| hi-a2-2-02 | 79 | authentic | 212 | narrative | स्कूल का पहला दिन | 7 | 3.3 | 94.3% |  |
| hi-a2-2-03 | 80 | authentic | 103 | narrative | मैं नहीं डरती ! | 4 | 3.9 | 94.2% |  |
| hi-a2-2-04 | 81 | controlled | 1210 | biography | Meera didi becomes a nurse | 11 | 0.9 | 96.6% | pluperfect |
| hi-a2-2-05 | 82 | authentic (Scripture) | 747 | scripture | यूहन्ना 14 (John 14) | 34 | 4.6 | 92.5% | jahaan-vahaan |
| hi-a2-2-06 | 83 | authentic | 313 | narrative | चाचा की शादी | 11 | 3.5 | 93.9% |  |
| hi-a2-2-07 | 84 | authentic | 147 | narrative | चाँद का तोहफ़ा | 10 | 6.8 | 92.5% |  |
| hi-a2-2-08 | 85 | controlled | 1100 | conversation | City or village? A conversation | 14 | 1.3 | 94.1% | conditional |
| hi-a2-2-09 | 86 | controlled | 1210 | contemporary-nonfiction | Water and rubbish in our lane | 12 | 1.0 | 95.3% | passive |
| hi-a2-2-10 | 87 | authentic | 432 | narrative | दीदी का रंग बिरंगा खज़ाना | 26 | 6.0 | 93.3% |  |
| hi-a2-2-11 | 88 | controlled | 1210 | community | The community meeting | 14 | 1.2 | 94.4% | subjunctive |
| hi-a2-2-12 | 89 | controlled | 1100 | correspondence | A formal letter and the reply | 9 | 0.8 | 97.4% | polite-request |
| hi-a2-2-13 | 90 | controlled | 1270 | narrative | Holi in a village | 10 | 0.8 | 97.6% | perfective-past |
| hi-a2-2-14 | 91 | controlled | 1210 | health | Dengue and clean water | 11 | 0.9 | 97.3% | passive |
| hi-a2-2-15 | 92 | controlled | 1270 | testimony | Sam's testimony, a year later | 14 | 1.1 | 96.5% | perfective-past |
| hi-a2-2-16 | 93 | controlled | 1210 | work | An auto driver's day (interview) | 6 | 0.5 | 98.5% | habitual-past |
| hi-a2-2-17 | 94 | controlled | 1210 | contemporary-nonfiction | How a school year works | 6 | 0.5 | 98.5% | passive |
| hi-a2-2-18 | 95 | controlled | 1270 | family | A wedding in the family | 14 | 1.1 | 96.7% | perfective-past |
| hi-a2-2-19 | 96 | authentic | 127 | narrative | मेरा घर | 9 | 7.1 | 92.9% |  |
| hi-a2-2-20 | 97 | controlled | 1320 | food | Cooking for the church feast | 5 | 0.4 | 98.6% | passive |
| hi-a2-2-21 | 98 | controlled | 1210 | church-and-mission-life | The team's weekly report | 13 | 1.1 | 96.8% | present-perfect |
| hi-a2-2-22 | 99 | controlled | 1100 | scripture | The son who left (retold) | 10 | 0.9 | 97.3% | perfective-past |
| hi-a2-2-23 | 100 | controlled | 1320 | testimony | Why I stayed | 10 | 0.8 | 97.7% | conditional |
| hi-a2-2-24 | 101 | authentic | 151 | narrative | बारिश हो रही छमा छम | 11 | 7.3 | 92.7% |  |
| hi-b1-bridge-01 | 102 | controlled | 1200 | narrative | Nani reads to the children: three animal tales | 17 | 1.4 | 94.8% | perfective-past |
| hi-b1-bridge-02 | 103 | controlled | 1200 | explanation | Why is the sky blue? Aman asks, Ravi sir explains | 18 | 1.5 | 95.5% | relative-correlative |
| hi-b1-bridge-03 | 104 | authentic | 81 | narrative | वह हँस दिया | 5 | 6.2 | 92.6% |  |
| hi-b1-bridge-04 | 105 | controlled | 1100 | explanation | Why do puris puff up? In the kitchen | 20 | 1.8 | 93.8% | passive |
| hi-b1-bridge-05 | 106 | authentic | 443 | narrative | गौरैया और अमरूद | 20 | 4.5 | 92.6% |  |
| hi-b1-bridge-06 | 107 | controlled | 1200 | contemporary-nonfiction | A day on a village farm | 16 | 1.3 | 95.3% | passive |
| hi-b1-bridge-07 | 108 | authentic (Scripture) | 124 | scripture | भजन संहिता 23 (Psalm 23) | 9 | 7.3 | 92.7% |  |
| hi-b1-bridge-08 | 109 | controlled | 1200 | narrative | The city bus: lost and found | 16 | 1.3 | 94.5% | pluperfect |
| hi-b1-bridge-09 | 110 | authentic (Scripture) | 880 | scripture | मरकुस 1 (Mark 1) | 63 | 7.2 | 92.6% |  |
| hi-b1-bridge-10 | 111 | controlled | 1300 | biography | A famous sportsman (a short biography) | 20 | 1.5 | 93.3% | pluperfect |
| hi-b1-bridge-11 | 112 | authentic (Scripture) | 1022 | scripture | यूहन्ना 1 (John 1) | 47 | 4.6 | 92.6% |  |
| hi-b1-bridge-12 | 113 | authentic | 315 | narrative | मुझे वो वाला चाहिये! | 10 | 3.2 | 92.7% |  |
| hi-b1-bridge-13 | 114 | controlled | 1300 | contemporary-nonfiction | The road to freedom (a short history) | 18 | 1.4 | 93.9% | passive |
| hi-b1-bridge-14 | 115 | authentic | 133 | narrative | सोना सयानी | 6 | 4.5 | 93.2% |  |
| hi-b1-bridge-15 | 116 | controlled | 1000 | narrative | The shepherd and the sheep (preparing for the Psalms) | 16 | 1.6 | 93.3% | subjunctive |
| hi-b1-bridge-16 | 117 | authentic | 391 | narrative | कछुआ और खरगोश | 24 | 6.1 | 93.1% |  |

Reading the table and the gate model (the planner replayed `policy.ts` over the plan: coverage bands, cliff, new lemmas per 100, recycling):

- **No error.** All controlled and bridge units are planned at 88.6 % or better; every in-place draft is at 88.6 % or better; every authentic unit is at 92.5 % or better when placed.
- **Warnings that are expected, not defects:** new lemmas per 100 above 5 for s0c-01 (7.5), s0c-02 (6.6) and s0c-03 (6.6), and for 12 of the 22 authentic placements (an authentic text at 92–94 % has 6–8 % unknown tokens, which means 4–7 never-met lemmas per 100; the gate's warning at 5 is advice); two cliff warnings (hi-a1-1-05 s0a-04 −6.1 and the vegetables unit −7.5), both because the in-place texts before them sit at 94–100 % while any controlled unit sits at about 89 %. Recycling: every unit with six or more units after it (65 units) is at 100 % in the plan (the lists below are built to that); the last six units are not judged by the gate.
- **The bridge and volume units are placed by the gate arithmetic, not by taste.** Each bridge unit comes just before the draft whose gaps it fills; a volume unit exists because a core unit followed by only in-place texts would have no unit in its recycling window that can carry its words (the contract's "within the next six units").
- **The in-place texts keep their order** (0A, 0B, 0C, then the two seeds): `story-01` follows the testimony unit that teaches its words (पाप, क्षमा, प्रेम, शांति), and `dialogue-01` follows `story-01`.
- **Ids.** Units are numbered 01… inside each stage, in ladder order, in-place and authentic units included: `hi-a1-1-01` is `s0a-01`. `ladder.json` entries: controlled `{ "id": "hi-a1-1-06", "stage": "a1-1", "kind": "controlled", "document": "units/hi-a1-1-06.json", "domain": "daily-life", "title": "…" }`; in-place `{ "id": "hi-a1-1-03", "stage": "a1-1", "kind": "controlled", "document": "../../corpus/hi/s0a-02.json", "domain": "family", "title": "माँ और पापा" }`; authentic `{ "id": "hi-a2-1-03", "stage": "a2-1", "kind": "authentic", "textId": "text:hi:gdl-104-ch01", "domain": "narrative" }`; the ladder file carries `"lang": "hi"`, `"version": 1`, `"after": "stage0"`. Domain strings are lower-case and hyphenated (`church-and-mission-life`, `contemporary-nonfiction`, `practical-communication`).

### 3.2 Unit by unit

Format: situation; **new** lemmas with a short gloss (`+` marks a word that is not in the word list yet, section 6; `‹for gdl-NN›` marks a word that is there to bring a library book to the placement line, and may be used in any natural sentence: it need not fit the unit's theme); **top-up**; **recycle**; constructions; cast. Glosses are the word list's own, machine-drafted, unreviewed. In-place and authentic units show their measurements.

### 3.2.1 Stage a1-1

#### hi-a1-1-01 · #1 · in-place · narrative · 66 words (measured) · cov. 93.9% · रवि और मीरा
- **Document.** `"document": "../../corpus/hi/s0a-01.json"` (corpus id `ci-hi`, text id `text:hi:s0a-01`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.9%, ≥ 1 encounter 100.0%; never-met lemmas 0; 0.0 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 59.

#### hi-a1-1-02 · #2 · controlled (bridge) · family · 260 words · est. cov. 93.1% · Seeta Nani's house: kitchen, grandparents, Moti · सीता नानी का घर
- **Document.** `"document": "units/hi-a1-1-02.json"`, `kind: "controlled"`, `stage: "a1-1"`, corpus id `ladder-hi`.
- **Situation.** Sam is shown round: the kitchen, the photographs of Aman's दादा जी and दादी, Seeta Nani's small white dog Moti (the dog of the 0A stories is a neighbour's, with the same name). Present of है/हैं only, as in Stage 0. It precedes the in-place text s0a-02, whose gaps its new words fill.
- **New (6; each used exactly three times).** रसोई (n: kitchen) · दादा (n: paternal grandfather) · जी (part: honorific particle after a name or title, as in दादा जी) · मोती (name: Moti) · दादी (n: paternal grandmother) · अच्छा (adj: good, nice, fine)
- **Recycle (0 uses).** none needed: the in-place texts that follow carry the recycling
- **Constructions.** postposition-after-noun (The postposition comes after the noun); genitive-agreement (का / के / की agrees with the thing owned).
- **Cast.** Sam, सीता नानी, अमन, मीरा दीदी. **Known lemmas before it.** 60. **Recycling (gate rule) 100.0%.**

#### hi-a1-1-03 · #3 · in-place · family · 79 words (measured) · cov. 93.7% · माँ और पापा
- **Document.** `"document": "../../corpus/hi/s0a-02.json"` (corpus id `ci-hi`, text id `text:hi:s0a-02`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.7%, ≥ 1 encounter 93.7%; never-met lemmas 1 (माँ); 1.3 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 66.

#### hi-a1-1-04 · #4 · in-place · family · 112 words (measured) · cov. 97.3% · दादी और दादा जी
- **Document.** `"document": "../../corpus/hi/s0a-03.json"` (corpus id `ci-hi`, text id `text:hi:s0a-03`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 97.3%, ≥ 1 encounter 97.3%; never-met lemmas 1 (लोग); 0.9 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 67.

#### hi-a1-1-05 · #5 · in-place · narrative · 79 words (measured) · cov. 88.6% · मोती
- **Document.** `"document": "../../corpus/hi/s0a-04.json"` (corpus id `ci-hi`, text id `text:hi:s0a-04`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 88.6%, ≥ 1 encounter 92.4%; never-met lemmas 2 (कुत्ता सफ़ेद); 2.5 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 68.

#### hi-a1-1-06 · #6 · controlled · daily-life · 340 words · est. cov. 89.7% · A morning at Seeta Nani's house · सीता नानी के घर की सुबह
- **Document.** `"document": "units/hi-a1-1-06.json"`, `kind: "controlled"`, `stage: "a1-1"`, corpus id `ladder-hi`.
- **Situation.** Sam wakes in the guest room; Seeta Nani makes tea and roti, Aman is slow to get up; habitual present with time words.
- **New (10; each used exactly three times).** नाश्ता (n: breakfast, snack) · नहाना (v: to bathe) · जगाना (v: to wake) · तैयार (adj: ready) · देर (n: delay, lateness) · बिस्तर (n: bed, bedding) · तौलिया (n: towel) · नाना (n: maternal grandfather) · कमरा (n: room) · उठना (v: to get up, to rise)
- **Top-up (5 tokens).** use exactly this often, to make an under-met earlier word known: रहना×1 लगना×1 खाना×2 दोस्त×1
- **Recycle (0 uses).** none needed: the in-place texts that follow carry the recycling
- **Constructions.** habitual-present (Habitual present (-ता है)); genitive-agreement (का / के / की agrees with the thing owned); postposition-after-noun (The postposition comes after the noun).
- **Cast.** Sam, सीता नानी, अमन, मीरा दीदी. **Known lemmas before it.** 71. **Recycling (gate rule) 100.0%.**

#### hi-a1-1-07 · #7 · in-place · narrative · 94 words (measured) · cov. 100.0% · दोस्त
- **Document.** `"document": "../../corpus/hi/s0a-05.json"` (corpus id `ci-hi`, text id `text:hi:s0a-05`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 100.0%, ≥ 1 encounter 100.0%; never-met lemmas 0; 0.0 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 85.

#### hi-a1-1-08 · #8 · controlled (bridge) · daily-life · 260 words · est. cov. 93.1% · Aman's new book · अमन की नई किताब
- **Document.** `"document": "units/hi-a1-1-08.json"`, `kind: "controlled"`, `stage: "a1-1"`, corpus id `ladder-hi`.
- **Situation.** Ravi sir gives Aman a new book; Aman reads while he drinks milk and eats a sweet mango. First habitual verbs (पीता है, पढ़ता है). It precedes the in-place text s0a-06, whose gaps its new words fill.
- **New (6; each used exactly three times).** किताब (n: book) · नया (adj: new) · आम (n: mango) · पीना (v: to drink) · मीठा (adj: sweet) · पढ़ना (v: to read, to study)
- **Recycle (14 uses).** नाश्ता नहाना×2 जगाना तैयार×2 देर बिस्तर तौलिया×2 नाना कमरा×2 उठना
- **Constructions.** adjective-noun-agreement (The adjective agrees with its noun); habitual-present (Habitual present (-ता है)).
- **Cast.** Sam, अमन, सीता नानी. **Known lemmas before it.** 85. **Recycling (gate rule) 100.0%.**

#### hi-a1-1-09 · #9 · in-place · community · 107 words (measured) · cov. 94.4% · शर्मा जी
- **Document.** `"document": "../../corpus/hi/s0a-06.json"` (corpus id `ci-hi`, text id `text:hi:s0a-06`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 94.4%, ≥ 1 encounter 94.4%; never-met lemmas 2 (अध्यापक लाल); 1.9 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 91.

#### hi-a1-1-10 · #10 · in-place · food · 115 words (measured) · cov. 100.0% · मेज़ पर खाना
- **Document.** `"document": "../../corpus/hi/s0a-07.json"` (corpus id `ci-hi`, text id `text:hi:s0a-07`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 100.0%, ≥ 1 encounter 100.0%; never-met lemmas 0; 0.0 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 93.

#### hi-a1-1-11 · #11 · controlled (vol) · food · 300 words · est. cov. 96.0% · Lunch at Seeta Nani's table · सीता नानी की मेज़ पर दोपहर का खाना
- **Document.** `"document": "units/hi-a1-1-11.json"`, `kind: "controlled"`, `stage: "a1-1"`, corpus id `ladder-hi`.
- **Situation.** A volume unit. The family eats together: who sits where, what each one eats, a short thanks. Three new words only; the point is to bring back the morning vocabulary (family, kitchen, drinks) three times each.
- **New (3; each used exactly three times).** सब्ज़ी (n: vegetable) · चाचा (n: father's younger brother) · आना (v: to come)
- **Top-up (3 tokens).** use exactly this often, to make an under-met earlier word known: चलना×1 बनाना×1 लेकिन×1
- **Recycle (16 uses).** नाश्ता×2 नहाना जगाना×2 तैयार देर×2 बिस्तर×2 तौलिया नाना×2 कमरा उठना×2
- **Constructions.** habitual-present (Habitual present (-ता है)); genitive-agreement (का / के / की agrees with the thing owned).
- **Cast.** Sam, सीता नानी, अमन, मीरा दीदी, रवि सर. **Known lemmas before it.** 93. **Recycling (gate rule) 100.0%.**

#### hi-a1-1-12 · #12 · in-place · food · 143 words (measured) · cov. 97.2% · रवि रोटी खाता है
- **Document.** `"document": "../../corpus/hi/s0a-08.json"` (corpus id `ci-hi`, text id `text:hi:s0a-08`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 97.2%, ≥ 1 encounter 97.2%; never-met lemmas 1 (सब); 0.7 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 99.

#### hi-a1-1-13 · #13 · in-place · daily-life · 147 words (measured) · cov. 96.6% · स्कूल जाते हैं
- **Document.** `"document": "../../corpus/hi/s0a-09.json"` (corpus id `ci-hi`, text id `text:hi:s0a-09`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 96.6%, ≥ 1 encounter 96.6%; never-met lemmas 1 (रोज़); 0.7 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 100.

#### hi-a1-1-14 · #14 · controlled · community · 350 words · est. cov. 89.1% · Vegetables and prices · सब्ज़ी और दाम
- **Document.** `"document": "units/hi-a1-1-14.json"`, `kind: "controlled"`, `stage: "a1-1"`, corpus id `ladder-hi`.
- **Situation.** Sam buys vegetables from a stall (Ramesh the vendor); कितने का / कितने के, numbers, महँगा/सस्ता; use digits for prices above 30.
- **New (11; each used exactly three times).** केला (n: banana) · टमाटर (n: tomato) · प्याज़ (n: onion) · आलू (n: potato) · किलो (n: kilogram) · महँगा (adj: expensive) · सस्ता (adj: cheap) · पैसा (n: money) · दाम (n: price) · थैला (n: bag) · गेंद (n: ball) ‹for a later in-place text›
- **Top-up (5 tokens).** use exactly this often, to make an under-met earlier word known: कौन×2 पता×1 तुम्हारा×1 कितना×1
- **Recycle (5 uses).** सब्ज़ी×2 चाचा आना×2
- **Constructions.** postposition-after-noun (The postposition comes after the noun); existence-possession (Having and being there (के पास … है, का … है)). First met by the gate here: existence-possession.
- **Cast.** Sam, सीता नानी, रमेश. **Known lemmas before it.** 101. **Recycling (gate rule) 100.0%.**

#### hi-a1-1-15 · #15 · controlled (bridge) · community · 260 words · est. cov. 93.1% · Boys and girls in the park · पार्क में लड़के और लड़कियाँ
- **Document.** `"document": "units/hi-a1-1-15.json"`, `kind: "controlled"`, `stage: "a1-1"`, corpus id `ladder-hi`.
- **Situation.** Sam watches children play; he takes a picture and asks "यह कौन है?". Short sentences, questions with क्या. It precedes the in-place text s0a-10, whose gaps its new words fill.
- **New (6; each used exactly three times).** खेलना (v: to play) · मैदान (n: field, open ground) · तस्वीर (n: picture, photograph) · छत (n: roof, ceiling) · लड़का (n: boy) · लड़की (n: girl)
- **Recycle (17 uses).** सब्ज़ी चाचा×2 आना केला टमाटर प्याज़ आलू किलो महँगा सस्ता×2 पैसा दाम×2 थैला×2
- **Constructions.** habitual-present (Habitual present (-ता है)); question-kya (क्या at the start of a question).
- **Cast.** Sam, अमन, रवि सर. **Known lemmas before it.** 116. **Recycling (gate rule) 100.0%.**

#### hi-a1-1-16 · #16 · in-place · narrative · 144 words (measured) · cov. 93.8% · मैदान में
- **Document.** `"document": "../../corpus/hi/s0a-10.json"` (corpus id `ci-hi`, text id `text:hi:s0a-10`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.8%, ≥ 1 encounter 93.8%; never-met lemmas 3 (बाग़ पेड़ फूल); 2.1 per 100 words; constructions first met (adapter keys): question-kya.
- **Known lemmas before it.** 122.

#### hi-a1-1-17 · #17 · in-place · narrative · 139 words (measured) · cov. 100.0% · गेंद कहाँ है?
- **Document.** `"document": "../../corpus/hi/s0a-11.json"` (corpus id `ci-hi`, text id `text:hi:s0a-11`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 100.0%, ≥ 1 encounter 100.0%; never-met lemmas 0; 0.0 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 125.

#### hi-a1-1-18 · #18 · in-place · conversation · 134 words (measured) · cov. 100.0% · यह कौन है?
- **Document.** `"document": "../../corpus/hi/s0a-12.json"` (corpus id `ci-hi`, text id `text:hi:s0a-12`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 100.0%, ≥ 1 encounter 100.0%; never-met lemmas 0; 0.0 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 125.

#### hi-a1-1-19 · #19 · controlled (vol) · community · 300 words · est. cov. 95.7% · Evening in the lane · गली में शाम
- **Document.** `"document": "units/hi-a1-1-19.json"`, `kind: "controlled"`, `stage: "a1-1"`, corpus id `ladder-hi`.
- **Situation.** A volume unit. The lane at dusk: neighbours, children, a man selling something; bring back the market and park vocabulary. Three new words only.
- **New (3; each used exactly three times).** आदमी (n: man) · शहर (n: city, town) · कहना (v: to say, to tell)
- **Top-up (4 tokens).** use exactly this often, to make an under-met earlier word known: सुबह×1 थोड़ा×1 कैसे×2
- **Recycle (17 uses).** केला×2 टमाटर×2 प्याज़×2 आलू×2 किलो×2 महँगा×2 सस्ता पैसा×2 दाम थैला
- **Constructions.** habitual-present (Habitual present (-ता है)); postposition-after-noun (The postposition comes after the noun).
- **Cast.** Sam, अमन, रवि सर, सीता नानी. **Known lemmas before it.** 125. **Recycling (gate rule) 100.0%.**

#### hi-a1-1-20 · #20 · in-place · conversation · 197 words (measured) · cov. 93.9% · मेरा नाम रवि है
- **Document.** `"document": "../../corpus/hi/s0b-01.json"` (corpus id `ci-hi`, text id `text:hi:s0b-01`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.9%, ≥ 1 encounter 94.4%; never-met lemmas 6 (अपना देना शाम उसका साथ पास); 3.0 per 100 words; constructions first met (adapter keys): comparison-se.
- **Known lemmas before it.** 131.

#### hi-a1-1-21 · #21 · in-place · conversation · 174 words (measured) · cov. 95.4% · यह किसकी किताब है?
- **Document.** `"document": "../../corpus/hi/s0b-02.json"` (corpus id `ci-hi`, text id `text:hi:s0b-02`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 95.4%, ≥ 1 encounter 96.0%; never-met lemmas 4 (किसका से देखना पूछना); 2.3 per 100 words; constructions first met (adapter keys): ko-definite-object.
- **Known lemmas before it.** 134.

#### hi-a1-1-22 · #22 · controlled · health · 360 words · est. cov. 89.2% · Meera didi's clinic · मीरा दीदी का क्लिनिक
- **Document.** `"document": "units/hi-a1-1-22.json"`, `kind: "controlled"`, `stage: "a1-1"`, corpus id `ladder-hi`.
- **Situation.** Aman has a fever; Meera asks what hurts; मुझे बुखार है, सिर में दर्द है; the first unit with "रवि को ... है" experiencer sentences.
- **New (11; each used exactly three times).** बुखार (n: fever) · दर्द (n: pain) · सिर (n: head) · दवा (n: medicine) · डॉक्टर (n: doctor) · आराम (n: rest, comfort, ease) · पेट (n: stomach, belly) · बीमार (adj: ill, sick) · ख़ुश (adj: happy, glad) · खाँसी (n: cough) ⚠ bare form read as खाँसना · आँख (n: eye)
- **Top-up (6 tokens).** use exactly this often, to make an under-met earlier word known: देना×1 देखना×2 उसका×1 साथ×2
- **Recycle (3 uses).** आदमी×2 शहर
- **Constructions.** ko-experiencer (को on the one who feels or has); existence-possession (Having and being there (के पास … है, का … है)); question-kya (क्या at the start of a question).
- **Cast.** Sam, मीरा दीदी, अमन. **Known lemmas before it.** 135. **Recycling (gate rule) 100.0%.**

#### hi-a1-1-23 · #23 · controlled (bridge) · daily-life · 260 words · est. cov. 93.1% · Ravi sir's class · रवि सर की कक्षा
- **Document.** `"document": "units/hi-a1-1-23.json"`, `kind: "controlled"`, `stage: "a1-1"`, corpus id `ladder-hi`.
- **Situation.** A village child in Aman's class describes his courtyard, his cow and how he sits in class; the first plural obliques (बच्चों को, कक्षा में). It precedes the in-place text s0b-03, whose gaps its new words fill.
- **New (6; each used exactly three times).** बच्चा (n: child) · कक्षा (n: class, classroom) · गाँव (n: village) · गाय (n: cow) · आँगन (n: courtyard) · बैठना (v: to sit)
- **Recycle (15 uses).** आदमी शहर×2 बुखार दर्द सिर दवा डॉक्टर आराम×2 पेट बीमार ख़ुश खाँसी आँख
- **Constructions.** postposition-after-noun (The postposition comes after the noun); plural-forms (Plural nouns); oblique-before-postposition (The oblique form before a postposition).
- **Cast.** Sam, रवि सर, अमन. **Known lemmas before it.** 150. **Recycling (gate rule) 100.0%.**

#### hi-a1-1-24 · #24 · in-place · daily-life · 191 words (measured) · cov. 92.7% · स्कूल का दिन
- **Document.** `"document": "../../corpus/hi/s0b-03.json"` (corpus id `ci-hi`, text id `text:hi:s0b-03`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 92.7%, ≥ 1 encounter 93.7%; never-met lemmas 7 (बस दूर बात कहानी सुनाना सुनना दोपहर); 3.7 per 100 words; constructions first met (adapter keys): auxiliary-chain, progressive.
- **Known lemmas before it.** 156.

#### hi-a1-1-25 · #25 · in-place · family · 166 words (measured) · cov. 95.2% · दादी का गाँव
- **Document.** `"document": "../../corpus/hi/s0b-04.json"` (corpus id `ci-hi`, text id `text:hi:s0b-04`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 95.2%, ≥ 1 encounter 97.0%; never-met lemmas 3 (नदी खेत कुछ); 1.8 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 158.

#### hi-a1-1-26 · #26 · in-place · conversation · 159 words (measured) · cov. 94.3% · आइए, बैठिए
- **Document.** `"document": "../../corpus/hi/s0b-05.json"` (corpus id `ci-hi`, text id `text:hi:s0b-05`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 94.3%, ≥ 1 encounter 95.6%; never-met lemmas 5 (दरवाज़ा जीना बाहर लाना अंदर); 3.1 per 100 words; constructions first met (adapter keys): compound-verb.
- **Known lemmas before it.** 161.

#### hi-a1-1-27 · #27 · in-place · conversation · 163 words (measured) · cov. 93.9% · फ़ोन पर
- **Document.** `"document": "../../corpus/hi/s0b-06.json"` (corpus id `ci-hi`, text id `text:hi:s0b-06`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.9%, ≥ 1 encounter 94.5%; never-met lemmas 5 (हैलो तुम कैसा कब जल्दी); 3.1 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 164.

#### hi-a1-1-28 · #28 · controlled · church-and-mission-life · 370 words · est. cov. 88.9% · Sunday at church · रविवार को चर्च में
- **Document.** `"document": "units/hi-a1-1-28.json"`, `kind: "controlled"`, `stage: "a1-1"`, corpus id `ladder-hi`.
- **Situation.** Sam meets Pastor Anil and Sunita; the service in outline (a song, a prayer, a short talk); आइए, बैठिए, गाइए.
- **New (11; each used exactly three times).** प्रार्थना (n: prayer) · गीत (n: song) · पास्टर (n: pastor) · सभा (n: assembly, meeting) · आमीन (intj: amen) · भजन (n: hymn, devotional song) · आराधना (n: worship, adoration) · आशीर्वाद (n: blessing) · सोना (v: to sleep) ‹for a later in-place text› · गिरजा (n: church) · औरत (n: woman)
- **Top-up (8 tokens).** use exactly this often, to make an under-met earlier word known: कुछ×2 बाहर×2 सुनना×2 अंदर×2
- **Recycle (21 uses).** बुखार×2 दर्द×2 सिर×2 दवा×2 डॉक्टर×2 आराम पेट×2 बीमार×2 ख़ुश×2 खाँसी×2 आँख×2
- **Constructions.** polite-request (The polite request); command (Commands (तू / तुम / आप)); postposition-after-noun (The postposition comes after the noun).
- **Cast.** Sam, पास्टर अनिल, सुनीता आंटी, सीता नानी, अमन. **Known lemmas before it.** 166. **Recycling (gate rule) 100.0%.**

#### hi-a1-1-29 · #29 · in-place · narrative · 184 words (measured) · cov. 91.3% · मोती का दिन
- **Document.** `"document": "../../corpus/hi/s0b-07.json"` (corpus id `ci-hi`, text id `text:hi:s0b-07`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 91.3%, ≥ 1 encounter 93.5%; never-met lemmas 6 (नीचे कभी क्यों वहाँ अब रात); 3.3 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 181.

#### hi-a1-1-30 · #30 · in-place · community · 187 words (measured) · cov. 93.6% · शहर में
- **Document.** `"document": "../../corpus/hi/s0b-08.json"` (corpus id `ci-hi`, text id `text:hi:s0b-08`), `kind: "controlled"`, `stage: "a1-1"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.6%, ≥ 1 encounter 94.1%; never-met lemmas 5 (दफ़्तर सड़क गाड़ी दुकान लिए); 2.7 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 184.

#### hi-a1-1-31 · #31 · controlled · practical-communication · 350 words · est. cov. 88.6% · Where do you live? Address and phone number · आप कहाँ रहते हैं? पता और फ़ोन नंबर
- **Document.** `"document": "units/hi-a1-1-31.json"`, `kind: "controlled"`, `stage: "a1-1"`, corpus id `ladder-hi`.
- **Situation.** Sam gives his address to the auto driver Deepak and writes down Ravi sir's number; digits count as known by definition.
- **New (11; each used exactly three times).** ने (post: ) · नंबर (n: number, mark, turn) · मोबाइल (n: mobile phone) · गली (n: lane, alley) · मोहल्ला (n: neighbourhood, locality) · सामने (post: in front of, facing) · पीछे (post: behind) · मकान (n: house, building) · पुल (n: bridge) · दीवार (n: wall) · आधा (adj: half)
- **Top-up (7 tokens).** use exactly this often, to make an under-met earlier word known: अब×2 लिए×1 क्यों×2 वहाँ×2
- **Recycle (10 uses).** प्रार्थना गीत पास्टर सभा आमीन भजन आराधना आशीर्वाद गिरजा औरत
- **Constructions.** postposition-after-noun (The postposition comes after the noun); existence-possession (Having and being there (के पास … है, का … है)); question-kya (क्या at the start of a question).
- **Cast.** Sam, रवि सर, दीपक. **Known lemmas before it.** 186. **Recycling (gate rule) 100.0%.**

### 3.2.2 Stage a1-2

#### hi-a1-2-01 · #32 · controlled (bridge) · narrative · 260 words · est. cov. 93.1% · The alarm clock · घड़ी बजती है
- **Document.** `"document": "units/hi-a1-2-01.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** A morning in which the clock rings late; Aman laughs, runs, lifts his bag. A crow on the roof wakes the neighbours. A short narrative in the present with the first past forms as chunks. It precedes the in-place text s0c-01, whose gaps its new words fill.
- **New (6; each used exactly three times).** हँसना (v: to laugh) · भागना (v: to run away, to flee) · उठाना (v: to lift, to pick up, to raise) · घड़ी (n: clock, watch) · बजना (v: to ring, to sound) · कौआ (n: crow)
- **Recycle (12 uses).** प्रार्थना गीत पास्टर सभा आमीन भजन आराधना आशीर्वाद गिरजा औरत मकान दीवार
- **Constructions.** perfective-past (The perfective past (-ा)); inceptive-lagna (Beginning to (-ने लगना)).
- **Cast.** Sam, अमन, सीता नानी. **Known lemmas before it.** 201. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-02 · #33 · in-place · narrative · 307 words (measured) · cov. 90.2% · देर हो गई
- **Document.** `"document": "../../corpus/hi/s0c-01.json"` (corpus id `ci-hi`, text id `text:hi:s0c-01`), `kind: "controlled"`, `stage: "a1-2"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 90.2%, ≥ 1 encounter 91.9%; never-met lemmas 23 (बसना बाद घबराना क्योंकि बार कपड़ा पहनना रुकना तभी आवाज़ ज़ोर भौंकना तरफ़ जब तब इसलिए अगर तो मिलना भूख सारा दिन बैठाना); 7.5 per 100 words; constructions first met (adapter keys): ergative-ne, ne-with-ko-object, pluperfect, obligation, jab-tab, conditional, inceptive-lagna, oblique-infinitive.
- **Known lemmas before it.** 207.

#### hi-a1-2-03 · #34 · controlled · conversation · 400 words · est. cov. 89.8% · Tomorrow's plans · कल क्या करेंगे?
- **Document.** `"document": "units/hi-a1-2-03.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Dialogue, Sam with रवि सर and मीरा दीदी over tea on Friday evening: tomorrow Ravi sir will take Aman to the market, Meera has the clinic in the morning, Sam may come with them, the day after tomorrow they all go to church; perhaps it will rain. The first FUTURE unit: कल हम … जाएँगे, मैं आऊँगा, वह करेगी, शायद + subjunctive, परसों / अगला हफ़्ता. Short sentences, one plan per speaker.
- **New (11; each used exactly three times).** परसों (adv: the day before yesterday) · अगला (adj: next) · हफ़्ता (n: week) · शायद (adv: perhaps, maybe) · ज़रूर (adv: certainly, surely) · योजना (n: plan, scheme) · तैयारी (n: preparation) · छुट्टी (n: holiday, leave) · समय (n: time) · जागना (v: to wake up, to be awake) · ट्रेन (n: train)
- **Top-up (8 tokens).** use exactly this often, to make an under-met earlier word known: तो×2 दिन×2 मिलना×2 जब×2
- **Recycle (17 uses).** प्रार्थना गीत पास्टर सभा आमीन भजन आराधना आशीर्वाद गिरजा औरत नंबर मोबाइल गली मोहल्ला सामने पुल आधा
- **Constructions.** future (The future (-गा / -गी / -गे)); subjunctive (The subjunctive). First met by the gate here: future, subjunctive.
- **Cast.** Sam, रवि सर, मीरा दीदी, अमन. **Known lemmas before it.** 210. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-04 · #35 · controlled (bridge) · narrative · 260 words · est. cov. 93.1% · A pot of water and pebbles · पानी का घड़ा और कंकड़
- **Document.** `"document": "units/hi-a1-2-04.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Aman looks for something to put into the water pot to raise the water (a science game); Nani tells him she will tell a story about it (the 0C story follows). Do NOT retell the crow story here. It precedes the in-place text s0c-02, whose gaps its new words fill.
- **New (6; each used exactly three times).** घड़ा (n: water pot) · कंकड़ (n: pebble) · ढूँढ़ना (v: to look for, to search) · फिर (adv: then, again, afterwards) ⚠ bare form read as फिरना · डालना (v: to put in, to pour) · सुनाना (v: to tell, to recite)
- **Recycle (19 uses).** नंबर मोबाइल गली मोहल्ला सामने पीछे मकान पुल दीवार आधा घड़ी परसों अगला हफ़्ता योजना तैयारी समय जागना ट्रेन
- **Constructions.** perfective-past (The perfective past (-ा)); oblique-infinitive (The oblique infinitive (-ने)).
- **Cast.** Sam, सीता नानी, अमन. **Known lemmas before it.** 225. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-05 · #36 · in-place · narrative · 256 words (measured) · cov. 90.6% · दादी की कहानी
- **Document.** `"document": "../../corpus/hi/s0c-02.json"` (corpus id `ci-hi`, text id `text:hi:s0c-02`), `kind: "controlled"`, `stage: "a1-2"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 90.6%, ≥ 1 encounter 91.8%; never-met lemmas 17 (सा शुरू ध्यान चुपचाप गर्मी प्यास कहीं आसमान उड़ना तालाब तक पहुँचना सोचना दूसरा ऊपर रास्ता दोनों); 6.6 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 231.

#### hi-a1-2-06 · #37 · controlled · travel · 420 words · est. cov. 89.3% · The train to the village · गाँव की रेलगाड़ी
- **Document.** `"document": "units/hi-a1-2-06.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Narrative with dialogue, present and future: Ravi sir, Aman and Sam go to Seeta Nani's village by train. They buy three tickets, wait on the platform, find a seat, a farmer helps with the luggage, Sam can see the fields from the window. Purpose (-ने के लिए: टिकट लेने के लिए), ability (सकना), future.
- **New (12; each used exactly three times).** सकना (aux: to be able to, can) · स्टेशन (n: station) · टिकट (n: ticket) · सफ़र (n: journey) · सीट (n: seat) · चढ़ना (v: to climb, to get on) · उतरना (v: to get down, to get off) · इंतज़ार (n: waiting) · सामान (n: goods, luggage, things) · प्लेटफ़ॉर्म +(n: railway platform) · किसान (n: farmer) · महीना (n: month)
- **Top-up (9 tokens).** use exactly this often, to make an under-met earlier word known: सा×2 पहुँचना×2 उड़ना×1 तक×2 बाद×2
- **Recycle (21 uses).** नंबर मोबाइल गली मोहल्ला सामने पीछे मकान पुल दीवार आधा बजना परसों अगला हफ़्ता शायद ज़रूर योजना तैयारी समय जागना ट्रेन
- **Constructions.** purpose-infinitive (Purpose (-ने के लिए / -ने को)); ability-sakna (Ability (सकना)); future (The future (-गा / -गी / -गे)). First met by the gate here: purpose-infinitive, ability-sakna.
- **Cast.** Sam, रवि सर, अमन. **Known lemmas before it.** 233. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-07 · #38 · in-place · narrative · 259 words (measured) · cov. 89.6% · गाँव का सफ़र
- **Document.** `"document": "../../corpus/hi/s0c-03.json"` (corpus id `ci-hi`, text id `text:hi:s0c-03`), `kind: "controlled"`, `stage: "a1-2"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 89.6%, ≥ 1 encounter 91.9%; never-met lemmas 17 (पहला हमारा पूँछ हिलाना भीड़ खिड़की जगह प्यारा इसका अचानक गाना डर कोई घंटा खड़ा इधर अरे); 6.6 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 250.

#### hi-a1-2-08 · #39 · controlled · daily-life · 420 words · est. cov. 89.0% · Hindi lessons with Ravi sir · रवि सर के साथ हिंदी का पाठ
- **Document.** `"document": "units/hi-a1-2-08.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Dialogue and short narrative: Sam's weekly Hindi lesson. Ravi sir writes words and sentences on the board, Sam makes a mistake, must learn the letters, wants to read the Bible in Hindi. Obligation (मुझे … सीखना चाहिए, सीखना पड़ेगा), wanting (मैं … पढ़ना चाहता हूँ), ability. Metalanguage words (अक्षर, शब्द, वाक्य) are the new words.
- **New (12; each used exactly three times).** पड़ना (v: to fall) · चाहना (v: to want, to wish) · पाठ (n: lesson) · अक्षर (n: letter) · शब्द (n: word) · वाक्य (n: sentence) · सीखना (v: to learn) · पढ़ाना (v: to teach) · समझना (v: to understand) · बताना (v: to tell, to show, to inform) · ग़लती (n: mistake, error) · अभ्यास (n: practice, exercise)
- **Top-up (10 tokens).** use exactly this often, to make an under-met earlier word known: कोई×2 ज़ोर×2 जगह×2 ऊपर×2 सारा×2
- **Recycle (23 uses).** परसों अगला हफ़्ता शायद ज़रूर योजना तैयारी छुट्टी समय जागना ट्रेन सुनाना सकना स्टेशन टिकट सफ़र सीट चढ़ना इंतज़ार सामान प्लेटफ़ॉर्म किसान महीना
- **Constructions.** obligation (Obligation (-ना है, -ना चाहिए, -ना पड़ा)); wanting-chahna (Wanting (चाहना + infinitive)); ability-sakna (Ability (सकना)). First met by the gate here: wanting-chahna.
- **Cast.** Sam, रवि सर, अमन. **Known lemmas before it.** 251. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-09 · #40 · in-place · narrative · 259 words (measured) · cov. 93.8% · मोती कहाँ गया?
- **Document.** `"document": "../../corpus/hi/s0c-04.json"` (corpus id `ci-hi`, text id `text:hi:s0c-04`), `kind: "controlled"`, `stage: "a1-2"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.8%, ≥ 1 encounter 96.1%; never-met lemmas 6 (पहले पड़ोस चाची रोना यहीं खोना); 2.3 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 268.

#### hi-a1-2-10 · #41 · controlled · community · 440 words · est. cov. 90.5% · Diwali lamps in the lane · गली में दिवाली के दीये
- **Document.** `"document": "units/hi-a1-2-10.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Observation narrative: the lane prepares for the neighbours' festival (सुरेश and गीता's family hang lamps, the children clean the house, sweets are shared). Sam and Aman are invited as guests, Seeta Nani sends a plate of sweets, everyone says बधाई. Greetings and wishes in the subjunctive (आपको … मिले), polite requests. A respectful guest, no rite performed.
- **New (12; each used exactly three times).** दिवाली (n: Diwali) · दीया (n: lamp) · रोशनी (n: light) · मिठाई (n: sweets, a sweet) · उपहार (n: gift, present) · पड़ोसी (n: neighbour) · त्योहार (n: festival) · सजाना (v: to decorate) · बधाई (n: congratulations) · साथी (n: companion, partner) · तकिया (n: pillow) · उदास (adj: sad, gloomy)
- **Top-up (6 tokens).** use exactly this often, to make an under-met earlier word known: आवाज़×1 सोचना×1 पहले×1 कभी×1 दोनों×2
- **Recycle (23 uses).** सकना स्टेशन टिकट सफ़र सीट चढ़ना उतरना इंतज़ार सामान प्लेटफ़ॉर्म किसान महीना पड़ना चाहना पाठ अक्षर शब्द वाक्य सीखना पढ़ाना समझना ग़लती अभ्यास
- **Constructions.** subjunctive (The subjunctive); polite-request (The polite request).
- **Cast.** Sam, गीता, सुरेश, अमन, सीता नानी. **Known lemmas before it.** 272. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-11 · #42 · controlled · instructions · 450 words · est. cov. 89.1% · Seeta Nani's dal · सीता नानी की दाल
- **Document.** `"document": "units/hi-a1-2-11.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Instructions in order, with Aman asking and Nani explaining: wash the dal, cut the onions and tomatoes, boil, add salt and turmeric, do not let it burn. पहले / फिर / उसके बाद, commands (आप / तुम), -कर (धोकर, काटकर), मत + command. Kitchen vocabulary is the new word set.
- **New (13; each used exactly three times).** मत (part: do not) · धोना (v: to wash) · काटना (v: to cut) · पकाना (v: to cook) · नमक (n: salt) · मसाला (n: spice) · चम्मच (n: spoon) · बर्तन (n: vessel, utensil) · उबालना (v: to boil) · चूल्हा (n: hearth, stove) · तेल (n: oil) · हल्दी (n: turmeric) · पालक (n: spinach)
- **Top-up (10 tokens).** use exactly this often, to make an under-met earlier word known: ध्यान×2 बार×2 दूसरा×2 हमारा×2 इसका×2
- **Recycle (28 uses).** सकना स्टेशन टिकट सफ़र सीट चढ़ना उतरना इंतज़ार सामान प्लेटफ़ॉर्म किसान महीना पड़ना चाहना पाठ अक्षर शब्द वाक्य सीखना पढ़ाना समझना बताना ग़लती अभ्यास दीया मिठाई उपहार तकिया
- **Constructions.** command (Commands (तू / तुम / आप)); negative-command (The negative command (मत)); conjunctive-participle (Having done (stem + कर / के)). First met by the gate here: negative-command, conjunctive-participle.
- **Cast.** Sam, सीता नानी, अमन. **Known lemmas before it.** 289. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-12 · #43 · in-place · narrative · 267 words (measured) · cov. 93.6% · आम के पेड़ के नीचे
- **Document.** `"document": "../../corpus/hi/s0c-05.json"` (corpus id `ci-hi`, text id `text:hi:s0c-05`), `kind: "controlled"`, `stage: "a1-2"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.6%, ≥ 1 encounter 95.5%; never-met lemmas 11 (धूप ठंडा छाया धीरे खोलना हर हाथ रखना निकालना पकड़ना बंद); 4.1 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 307.

#### hi-a1-2-13 · #44 · controlled · correspondence · 440 words · est. cov. 89.5% · A message from the team · टीम का संदेश
- **Document.** `"document": "units/hi-a1-2-13.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Correspondence: the team's text messages and a notice (the Saturday meeting moved, who brings what, please reply). Pastor Anil writes to Sam and Kiran, Sam answers. कि-clauses (उन्होंने कहा कि …), future, polite requests (कृपया …); dates and times in digits. Not a story: a set of five or six short messages and one notice.
- **New (12; each used exactly three times).** कि (sconj: that) · भेजना (v: to send) · जवाब (n: answer) · ख़बर (n: news, report) · संदेश +(n: message) · बैठक (n: meeting, sitting room) · सूचना +(n: notice, information) · नौकरी (n: job, service) · साल (n: year) · मेहमान (n: guest) · चिल्लाना (v: to shout, to cry out) · लगाना (v: to put on, to apply, to plant)
- **Top-up (10 tokens).** use exactly this often, to make an under-met earlier word known: रखना×2 हाथ×2 हर×2 निकालना×2 अरे×2
- **Recycle (33 uses).** पड़ना चाहना पाठ अक्षर शब्द वाक्य सीखना पढ़ाना समझना बताना ग़लती अभ्यास दिवाली रोशनी पड़ोसी त्योहार सजाना बधाई साथी उदास मत धोना काटना पकाना नमक मसाला चम्मच बर्तन उबालना चूल्हा तेल हल्दी पालक
- **Constructions.** complement-ki (कि introduces what was said or known); future (The future (-गा / -गी / -गे)); polite-request (The polite request). First met by the gate here: complement-ki.
- **Cast.** Sam, पास्टर अनिल, किरण. **Known lemmas before it.** 309. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-14 · #45 · in-place · narrative · 259 words (measured) · cov. 95.4% · शर्मा जी का सवाल
- **Document.** `"document": "../../corpus/hi/s0c-06.json"` (corpus id `ci-hi`, text id `text:hi:s0c-06`), `kind: "controlled"`, `stage: "a1-2"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 95.4%, ≥ 1 encounter 96.5%; never-met lemmas 7 (खुलना लिखना चिड़िया वे पढ़ाई वही फिरना); 2.7 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 326.

#### hi-a1-2-15 · #46 · controlled · explanation · 450 words · est. cov. 89.8% · Rain on the roof · छत पर बारिश
- **Document.** `"document": "units/hi-a1-2-15.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Explanation with an anecdote: why the rains come in July, what the roof sounds like, what Aman does with his umbrella; weather words, seasons, जब … तब, progressive (बारिश हो रही है). Sam describes the weather at home and here.
- **New (13; each used exactly three times).** बारिश (n: rain) · बादल (n: cloud) · बिजली (n: lightning) · धूप (n: sunshine) · ठंड (n: cold, chill) · मौसम (n: weather, season) · हवा (n: air, wind) · भीगना (v: to get wet) · छाता (n: umbrella) · सर्दी (n: cold) · दिल (n: heart) ‹for a later in-place text› · मिनट (n: minute) · ग़ुस्सा (n: anger, rage)
- **Top-up (7 tokens).** use exactly this often, to make an under-met earlier word known: वे×2 बारिश×1 आसमान×1 गाना×1 क्योंकि×2
- **Recycle (36 uses).** दिवाली दीया रोशनी मिठाई उपहार पड़ोसी त्योहार सजाना बधाई साथी तकिया उदास मत धोना काटना पकाना नमक मसाला चम्मच बर्तन उबालना चूल्हा तेल हल्दी पालक भेजना जवाब ख़बर संदेश बैठक सूचना नौकरी साल मेहमान चिल्लाना लगाना
- **Constructions.** habitual-present (Habitual present (-ता है)); progressive (Progressive (रहा है / रहा था)); jab-tab (जब … तब).
- **Cast.** Sam, अमन, सीता नानी. **Known lemmas before it.** 328. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-16 · #47 · controlled · testimony · 470 words · est. cov. 90.0% · My story (Sam) · मेरी कहानी: सैम की गवाही
- **Document.** `"document": "units/hi-a1-2-16.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** First-person testimony, short and plain: where Sam grew up, what he looked for, how he met Pastor Anil's church, what changed (पाप, क्षमा, प्रेम, शांति), why he came. Simple past with ने (मैंने … माँगा), कि-clauses. This is the text that prepares the in-place seed `story-01`: its words are used here three times each.
- **New (13; each used exactly three times).** गवाही (n: witness, testimony) · पाप (n: sin) · क्षमा (n: forgiveness, pardon) · प्रेम (n: love) · शांति (n: peace, calm) · दुनिया (n: world) · माँगना (v: to ask for, to beg) · बचाना (v: to save, to rescue) · जीवन (n: life) · कलीसिया (n: church) · प्यार (n: love, affection) · अजनबी (n: stranger) · मानना (v: to accept, to obey)
- **Top-up (8 tokens).** use exactly this often, to make an under-met earlier word known: तब×1 रोना×2 पकड़ना×2 अगर×1 पहनना×2
- **Recycle (36 uses).** दिवाली दीया रोशनी मिठाई उपहार पड़ोसी त्योहार सजाना बधाई साथी तकिया उदास मत धोना काटना पकाना नमक मसाला चम्मच बर्तन उबालना चूल्हा तेल हल्दी पालक भेजना जवाब ख़बर संदेश बैठक सूचना नौकरी साल मेहमान चिल्लाना लगाना
- **Constructions.** perfective-past (The perfective past (-ा)); ergative-ne (ने with the perfective); complement-ki (कि introduces what was said or known).
- **Cast.** Sam, पास्टर अनिल. **Known lemmas before it.** 345. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-17 · #48 · in-place · testimony · 83 words (measured) · cov. 96.4% · मेरी कहानी
- **Document.** `"document": "../../corpus/hi/story-01.json"` (corpus id `ci-hi`, text id `text:hi:story-01`), `kind: "controlled"`, `stage: "a1-2"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 96.4%, ≥ 1 encounter 96.4%; never-met lemmas 2 (विश्वास शांत); 2.4 per 100 words; constructions first met (adapter keys): habitual-past.
- **Known lemmas before it.** 363.

#### hi-a1-2-18 · #49 · in-place · conversation · 60 words (measured) · cov. 91.7% · एक बातचीत
- **Document.** `"document": "../../corpus/hi/dialogue-01.json"` (corpus id `ci-hi`, text id `text:hi:dialogue-01`), `kind: "controlled"`, `stage: "a1-2"`. Machine-drafted and unreviewed; not changed by this plan.
- **Measured here (plan order).** coverage ≥ 3 encounters 91.7%, ≥ 1 encounter 98.3%; never-met lemmas 1 (पूरा); 1.7 per 100 words; constructions first met (adapter keys): none.
- **Known lemmas before it.** 363.

#### hi-a1-2-19 · #50 · controlled · health · 480 words · est. cov. 90.2% · A day at the clinic · क्लिनिक का एक दिन
- **Document.** `"document": "units/hi-a1-2-19.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Narrative past with dialogue: a day with Meera in the clinic: an old man with a cough, a child with a fever, a woman who must come again; what the nurse says (आराम कीजिए, दवा लीजिए, कल फिर आइए). Perfective with ने, obligation, future.
- **New (13; each used exactly three times).** चुकना (v: to have already) · गला (n: throat, neck) · इलाज (n: treatment, cure) · ज़ुकाम (n: a cold) · मरीज़ +(n: patient) · इंजेक्शन +(n: injection) · पट्टी +(n: bandage) · गोली +(n: tablet, pill) · कान (n: ear) · सभी (pron: all, everyone) · हमेशा (adv: always) · दौड़ना (v: to run) · बनना (v: to be made, to become)
- **Top-up (8 tokens).** use exactly this often, to make an under-met earlier word known: कहीं×1 पूरा×2 रुकना×1 कपड़ा×2 गर्मी×2
- **Recycle (24 uses).** भेजना जवाब ख़बर संदेश बैठक सूचना नौकरी साल मेहमान चिल्लाना लगाना बारिश बादल बिजली धूप ठंड मौसम हवा भीगना छाता सर्दी मिनट ग़ुस्सा अजनबी
- **Constructions.** perfective-past (The perfective past (-ा)); obligation (Obligation (-ना है, -ना चाहिए, -ना पड़ा)); future (The future (-गा / -गी / -गे)).
- **Cast.** Sam, मीरा दीदी, अमन. **Known lemmas before it.** 365. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-20 · #51 · controlled · church-and-mission-life · 490 words · est. cov. 89.6% · Prayer meeting on Thursday · गुरुवार की प्रार्थना सभा
- **Document.** `"document": "units/hi-a1-2-20.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Group scene: the Thursday meeting in Pastor Anil's house: prayer requests (for Aman's exam, for a sick neighbour, for the team), thanks, a hymn; prayers in the subjunctive and imperative (हमें … दीजिए, आपका धन्यवाद हो). Plain Christian vocabulary (परमेश्वर, आशीष, भरोसा, कलीसिया).
- **New (14; each used exactly three times).** आशीष (n: blessing) · परमेश्वर (name: God) · आभार (n: gratitude, thanks) · भरोसा (n: trust, confidence) · दुआ +(n: prayer, blessing) ⚠ bare form read as दूना · सेवा (n: service) · सेवक (n: servant, minister) · माफ़ (adj: forgiven, excused) · मुस्कुराना (v: to smile) · शर्म (n: shame) · सच्चाई (n: truth, honesty) · डरना (v: to be afraid) · सहना (v: to bear, to suffer, to endure) · मोटा (adj: fat, thick)
- **Top-up (9 tokens).** use exactly this often, to make an under-met earlier word known: खड़ा×1 वही×2 शुरू×2 प्यारा×2 चिड़िया×2
- **Recycle (21 uses).** बारिश बादल बिजली धूप ठंड मौसम हवा भीगना छाता सर्दी मिनट ग़ुस्सा गवाही प्रेम शांति माँगना बचाना जीवन कलीसिया प्यार मानना
- **Constructions.** subjunctive (The subjunctive); polite-request (The polite request); command (Commands (तू / तुम / आप)).
- **Cast.** Sam, पास्टर अनिल, सुनीता आंटी, किरण. **Known lemmas before it.** 383. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-21 · #52 · controlled · travel · 500 words · est. cov. 89.6% · The auto-rickshaw · ऑटो रिक्शा
- **Document.** `"document": "units/hi-a1-2-21.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Dialogue and narrative: Sam takes an auto to the station, bargains the fare with दीपक, gives directions (सीधा चलो, दाएँ मुड़ो, यहाँ रुकिए), is late and arrives, pays. Commands, future, comparison (से कम).
- **New (14; each used exactly three times).** रिक्शा (n: rickshaw) · ऑटो +(n: auto-rickshaw) · किराया (n: fare, rent) · मोड़ (n: turn, bend) ⚠ bare form read as मोड़ना · सीधा (adj: straight) · दाएँ (adv: to the right) · बाएँ (adv: to the left) · लौटना (v: to return, to come back) · चौराहा (n: crossroads) · सवारी (n: ride) · बगीचा (n: garden) · दुकानदार (n: shopkeeper) · घाट (n: ghat, landing, river steps) · क़ीमत (n: price, value)
- **Top-up (10 tokens).** use exactly this often, to make an under-met earlier word known: रास्ता×2 दीदी×1 तभी×1 खोलना×2 इधर×2 गाड़ी×2
- **Recycle (21 uses).** बारिश बादल बिजली धूप ठंड मौसम हवा भीगना छाता सर्दी मिनट ग़ुस्सा गवाही दुनिया माँगना बचाना जीवन कलीसिया प्यार अजनबी मानना
- **Constructions.** command (Commands (तू / तुम / आप)); future (The future (-गा / -गी / -गे)); comparison-se (Comparison with से).
- **Cast.** Sam, दीपक. **Known lemmas before it.** 402. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-22 · #53 · controlled · family · 500 words · est. cov. 89.2% · Aman's birthday · अमन का जन्मदिन
- **Document.** `"document": "units/hi-a1-2-22.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Narrative, planning then party: Nani plans the cake and the guests, Sam buys a present, Aman turns eleven, balloons, candles, the neighbours come; past and future together, birthday words.
- **New (14; each used exactly three times).** जन्मदिन (n: birthday) · केक (n: cake) · मोमबत्ती (n: candle) · गुब्बारा (n: balloon) · बुलाना (v: to call, to invite, to summon) · पार्टी +(n: party) · मामा (n: mother's brother) · गोभी (n: cauliflower, cabbage) · अभी (adv: right now, just now) · कमीज़ (n: shirt) · खिलाना (v: to feed) · निकलना (v: to come out, to leave) · लंबा (adj: long, tall) · ही (part: only, just, very)
- **Top-up (12 tokens).** use exactly this often, to make an under-met earlier word known: धीरे×2 बंद×2 अचानक×2 फिरना×2 घंटा×2 पहला×2
- **Recycle (21 uses).** गवाही शांति दुनिया माँगना बचाना जीवन कलीसिया प्यार अजनबी मानना दौड़ना बनना परमेश्वर भरोसा सेवक मोटा ऑटो सीधा बाएँ सवारी क़ीमत
- **Constructions.** future (The future (-गा / -गी / -गे)); perfective-past (The perfective past (-ा)); habitual-past (Habitual past (-ता था)).
- **Cast.** Sam, अमन, सीता नानी, मीरा दीदी, रवि सर. **Known lemmas before it.** 422. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-23 · #54 · controlled · community · 520 words · est. cov. 89.6% · Our neighbours · हमारे पड़ोसी
- **Document.** `"document": "units/hi-a1-2-23.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Descriptive text with comparison: who lives in the lane (सुरेश the oldest neighbour, गीता with the youngest children, आरती the quietest), who is the tallest, whose house is the oldest; सबसे, से … ज़्यादा / कम. The new nouns are the things in their houses.
- **New (15; each used exactly three times).** सबसे (adv: most, the most) ⚠ bare form read as सब · ज़्यादा (adv: more, too much) · कम (adv: less, little) · पुराना (adj: old) · दोस्ती (n: friendship) · सलाम (intj: greetings, salaam) · पड़ोस (n: neighbourhood) · कंबल (n: blanket) · मस्जिद (n: mosque) · हैरान (adj: astonished, puzzled) · चारपाई (n: cot) · पाना (v: to get, to find) · जानना (v: to know) · गिरना (v: to fall) · चीज़ (n: thing)
- **Top-up (9 tokens).** use exactly this often, to make an under-met earlier word known: खिड़की×1 घबराना×2 बसना×1 कब×1 भीड़×2 ठंडा×2
- **Recycle (29 uses).** चुकना गला इलाज ज़ुकाम मरीज़ इंजेक्शन पट्टी गोली कान सभी हमेशा बनना आशीष आभार दुआ माफ़ मुस्कुराना शर्म सच्चाई डरना सहना रिक्शा मोड़ चौराहा बगीचा दुकानदार घाट मोमबत्ती गुब्बारा
- **Constructions.** superlative-sabse (सबसे "the most"); comparison-se (Comparison with से). First met by the gate here: superlative-sabse.
- **Cast.** Sam, गीता, सुरेश, आरती. **Known lemmas before it.** 442. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-24 · #55 · controlled · correspondence · 540 words · est. cov. 89.6% · A letter home · घर के नाम चिट्ठी
- **Document.** `"document": "units/hi-a1-2-24.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Correspondence, first person: Sam writes to his family abroad about the lane, the food, the language, how he misses them; salutation, closing, the envelope and the address; present perfect (मैं … आ गया हूँ) and future (मैं जल्दी लिखूँगा).
- **New (15; each used exactly three times).** चिट्ठी (n: letter) · आशा (n: hope) · परिवार (n: family) · भैया (n: brother) · डाक (n: post, mail) · लिफ़ाफ़ा (n: envelope) · ख़त +(n: letter) · सवाल (n: question) · परेशान (adj: troubled, worried) · मामी (n: wife of one's mama, aunt) · थका (adj: tired) ⚠ bare form read as थकना · भरना (v: to fill) · दिखना (v: to be seen, to appear) · दिखाना (v: to show) · उनका (det: their)
- **Top-up (11 tokens).** use exactly this often, to make an under-met earlier word known: चुपचाप×2 यहीं×1 शांत×2 भूख×2 खुलना×2 जीना×2
- **Recycle (32 uses).** चुकना गला इलाज ज़ुकाम मरीज़ इंजेक्शन पट्टी गोली कान सभी हमेशा दौड़ना बनना परमेश्वर आभार सेवा माफ़ मुस्कुराना शर्म सच्चाई डरना सहना बुलाना पार्टी मामा कमीज़ लंबा सबसे पुराना कंबल चारपाई जानना
- **Constructions.** present-perfect (Present perfect (-ा है)); future (The future (-गा / -गी / -गे)); complement-ki (कि introduces what was said or known).
- **Cast.** Sam. **Known lemmas before it.** 463. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-25 · #56 · controlled · work · 540 words · est. cov. 90.0% · The vegetable seller's day · सब्ज़ीवाले का दिन
- **Document.** `"document": "units/hi-a1-2-25.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Narrative in the first person, told to Sam: रमेश gets up before dawn, goes to the wholesale market, buys, weighs, sells, counts the money, what he earns and what he spends. -वाला (सब्ज़ीवाला), habitual present and habitual past, work vocabulary.
- **New (15; each used exactly three times).** वाला (part: one who, one that) · मंडी (n: wholesale market) · कमाना (v: to earn) · ग्राहक (n: customer) · तौलना (v: to weigh) · मेहनत (n: hard work, effort) · ठेला (n: handcart) · कमाई (n: earnings) ⚠ bare form read as कमाना · मालिक (n: owner, master, lord) · भिंडी (n: okra) · मज़दूर (n: labourer) · मटर (n: peas) · ख़रीदना (v: to buy) · इतना (adj: this much, so much, so many) · ऐसा (adj: such, like this)
- **Top-up (9 tokens).** use exactly this often, to make an under-met earlier word known: फल×2 छाया×1 अस्पताल×1 हैलो×2 पढ़ाई×2 प्यास×1
- **Recycle (36 uses).** चुकना गला इलाज ज़ुकाम मरीज़ इंजेक्शन पट्टी गोली कान सभी हमेशा दौड़ना आशीष भरोसा दुआ सेवा सेवक मोटा किराया दाएँ लौटना क़ीमत केक गोभी अभी खिलाना ही ज़्यादा सलाम हैरान पाना गिरना ख़त परेशान थका दिखना
- **Constructions.** vaala (वाला); habitual-present (Habitual present (-ता है)); habitual-past (Habitual past (-ता था)). First met by the gate here: vaala.
- **Cast.** Sam, रमेश. **Known lemmas before it.** 484. **Recycling (gate rule) 100.0%.**

#### hi-a1-2-26 · #57 · controlled · narrative · 560 words · est. cov. 90.2% · The lost phone · खोया हुआ फ़ोन
- **Document.** `"document": "units/hi-a1-2-26.json"`, `kind: "controlled"`, `stage: "a1-2"`, corpus id `ladder-hi`.
- **Situation.** Mystery narrative in the past: Sam loses his phone on the bus, retraces the way, asks the driver, goes to the police, gets help from Aman and Meera, and finds it where he did not look. Perfective with ने, pluperfect (मैंने रख दिया था), -ने लगा.
- **New (16; each used exactly three times).** चोरी (n: theft) · पुलिस (n: police) · रिपोर्ट +(n: report) · जेब +(n: pocket) · बटुआ (n: purse, wallet) · साफ़ (adj: clean, clear) · सरकार (n: government) · अकेला (adj: alone, lonely) · साइकिल (n: bicycle) · चलाना (v: to drive, to run, to operate) · घूमना (v: to wander, to turn, to stroll) · ठहरना (v: to stay, to wait, to stop) · बढ़ना (v: to grow, to advance) · रंग (n: colour) · मदद (n: help) · न (part: not)
- **Top-up (7 tokens).** use exactly this often, to make an under-met earlier word known: भौंकना×1 बैठाना×2 तालाब×1 किसका×1 चाबी×1 बाइबल×1
- **Recycle (44 uses).** आशीष परमेश्वर आभार भरोसा दुआ सेवा सेवक माफ़ मुस्कुराना शर्म सच्चाई डरना सहना मोटा रिक्शा ऑटो किराया मोड़ सीधा दाएँ बाएँ लौटना चौराहा सवारी बगीचा दुकानदार घाट जन्मदिन निकलना कम दोस्ती पड़ोस मस्जिद चीज़ आशा डाक लिफ़ाफ़ा उनका कमाना तौलना ठेला भिंडी मटर ऐसा
- **Constructions.** perfective-past (The perfective past (-ा)); pluperfect (Past perfect (-ा था)); inceptive-lagna (Beginning to (-ने लगना)).
- **Cast.** Sam, दीपक, अमन, मीरा दीदी. **Known lemmas before it.** 505. **Recycling (gate rule) 100.0%.**

### 3.2.3 Stage a2-1

#### hi-a2-1-01 · #58 · controlled · biography · 770 words · est. cov. 93.0% · Seeta Nani's life · सीता नानी की ज़िंदगी
- **Document.** `"document": "units/hi-a2-1-01.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** Biography told by Nani to Aman, with Sam listening: her village childhood, the wedding at sixteen, the move to the city, the bread stall, the first time she heard the gospel; years in digits. Habitual past (रहती थी), perfective, pluperfect.
- **New (18; each used exactly three times).** जन्म (n: birth) · बचपन (n: childhood) · शादी (n: wedding, marriage) · पोता (n: son's son, grandson) ⚠ bare form read as पोतना · फ़सल (n: crop, harvest) · कुआँ (n: well) · बैल (n: ox, bull) · ऐसे (adv: in this way, like this) ‹for gdl-104› · जो (pron: who, which, that) ‹for gdl-104› · कई (det: several, many a) ‹for gdl-104› · बुआ (n: father's sister) · तारीख़ (n: date) · उम्मीद (n: hope) · मौसी (n: mother's sister) · कैलेंडर (n: calendar) · मारना (v: to hit, to beat, to kill) · कूदना (v: to jump) · छोड़ना (v: to leave, to let go)
- **Recycle (65 uses).** रिक्शा ऑटो किराया मोड़ सीधा दाएँ बाएँ लौटना चौराहा सवारी बगीचा दुकानदार घाट क़ीमत जन्मदिन केक मोमबत्ती गुब्बारा बुलाना पार्टी मामा गोभी अभी कमीज़ खिलाना निकलना लंबा ही सबसे ज़्यादा कम पुराना दोस्ती सलाम पड़ोस कंबल मस्जिद हैरान चारपाई पाना जानना गिरना चीज़ चिट्ठी आशा परिवार भैया सवाल मामी भरना दिखाना वाला मंडी ग्राहक मेहनत कमाई मालिक मज़दूर ख़रीदना इतना चोरी चलाना ठहरना रंग मदद
- **Constructions.** habitual-past (Habitual past (-ता था)); perfective-past (The perfective past (-ा)); pluperfect (Past perfect (-ा था)).
- **Cast.** सीता नानी, Sam, अमन. **Known lemmas before it.** 527. **Recycling (gate rule) 100.0%.**

#### hi-a2-1-02 · #59 · controlled · contemporary-nonfiction · 830 words · est. cov. 93.1% · Our city, street by street · हमारा शहर
- **Document.** `"document": "units/hi-a2-1-02.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** Descriptive nonfiction, Ravi sir's guided walk for the team: the old town, the bridge, the river steps, the station, the market, the church, a temple and a mosque as landmarks, what each street is known for. जो … वह, जहाँ, सबसे; a guide's register in the present tense.
- **New (19; each used exactly three times).** जहाँ (adv: where) · जैसा (adj: like which, such as) · मंदिर (n: temple) · इलाक़ा +(n: area, district) · बूढ़ा (n: old man) ‹for gdl-104› · बारे (post: about, concerning) ‹for gdl-64› · कसना (v: to tighten) ‹for gdl-122› · अलमारी (n: cupboard) · ड्राइवर (n: driver) · पंखा (n: fan) · वकील (n: lawyer) · नल (n: tap) · छूना (v: to touch) · चमकना (v: to shine, to flash) · पतला (adj: thin, slim) · डिब्बा (n: box, tin) · ये (pron: these) · तरह (post: like, in the manner of) · धागा (n: thread)
- **Recycle (84 uses).** जन्मदिन केक मोमबत्ती गुब्बारा बुलाना पार्टी मामा गोभी अभी कमीज़ खिलाना निकलना लंबा ही सबसे ज़्यादा कम पुराना दोस्ती सलाम पड़ोस कंबल मस्जिद हैरान चारपाई पाना जानना गिरना चीज़ चिट्ठी परिवार भैया डाक लिफ़ाफ़ा ख़त सवाल परेशान मामी थका भरना दिखना दिखाना उनका वाला मंडी कमाना ग्राहक तौलना मेहनत ठेला कमाई मालिक भिंडी मज़दूर मटर ख़रीदना इतना ऐसा पुलिस रिपोर्ट जेब बटुआ साफ़ सरकार अकेला साइकिल घूमना बढ़ना न जन्म बचपन शादी पोता फ़सल कुआँ बैल बुआ तारीख़ उम्मीद मौसी कैलेंडर मारना कूदना छोड़ना
- **Constructions.** relative-correlative (जो … वह); superlative-sabse (सबसे "the most"). First met by the gate here: relative-correlative.
- **Cast.** Sam, रवि सर. **Known lemmas before it.** 545. **Recycling (gate rule) 100.0%.**

#### hi-a2-1-03 · #60 · authentic · narrative · 79 words (measured) · cov. 93.7% · मेरे दोस्त
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-104-ch01"`, `stage: "a2-1"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.7%; never-met lemmas 5 (6.3 per 100 words: above the 5-per-100 warning, expected for an authentic text at 92–95 %).
- **Known lemmas before it.** 564.

#### hi-a2-1-04 · #61 · controlled · correspondence · 770 words · est. cov. 92.2% · Letter to the sending church · भेजने वाली कलीसिया को पत्र
- **Document.** `"document": "units/hi-a2-1-04.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** Formal-warm letter: Sam reports the first months to the church that sent him: what he does, whom he has met, what he has learnt, what to pray for. Present perfect, -कर, polite request; salutation (आदरणीय …) and closing.
- **New (18; each used exactly three times).** पत्र (n: letter) · प्रिय (adj: dear, beloved) · आदरणीय +(adj: respected) · भेंट (n: gift, offering) · राजा (n: king) ‹for gdl-20› · मछली (n: fish) ‹for gdl-63› · आगे (post: ahead of, in front of) ‹for gdl-63› · ख़ुशी (n: joy, happiness) · चंगाई (n: healing) · अख़बार (n: newspaper) · याद (n: memory) · रेडियो (n: radio) · ख़ूब (adv: very much, a great deal) · मज़ा (n: enjoyment, fun, taste) · ओर (post: toward, in the direction of) · जैसे (sconj: as, like) · या (conj: or) · यही (pron: this very one)
- **Top-up (6 tokens).** use exactly this often, to make an under-met earlier word known: पैर×2 तैरना×2 ओह×2
- **Recycle (77 uses).** चिट्ठी आशा परिवार भैया डाक लिफ़ाफ़ा ख़त सवाल परेशान मामी थका भरना दिखना दिखाना उनका वाला मंडी कमाना ग्राहक तौलना मेहनत ठेला कमाई मालिक भिंडी मज़दूर मटर ख़रीदना इतना ऐसा चोरी पुलिस रिपोर्ट जेब बटुआ साफ़ सरकार अकेला साइकिल चलाना घूमना ठहरना बढ़ना रंग मदद न जन्म बचपन शादी पोता फ़सल कुआँ बैल कई बुआ तारीख़ उम्मीद मौसी कैलेंडर मारना कूदना छोड़ना जहाँ जैसा मंदिर इलाक़ा कसना अलमारी ड्राइवर पंखा वकील नल छूना चमकना डिब्बा ये धागा
- **Constructions.** present-perfect (Present perfect (-ा है)); conjunctive-participle (Having done (stem + कर / के)); polite-request (The polite request).
- **Cast.** Sam. **Known lemmas before it.** 564. **Recycling (gate rule) 100.0%.**

#### hi-a2-1-05 · #62 · authentic · narrative · 81 words (measured) · cov. 95.1% · एक था मोटा राजा
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-20-ch01"`, `stage: "a2-1"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 95.1%; never-met lemmas 4 (4.9 per 100 words).
- **Known lemmas before it.** 585.

#### hi-a2-1-06 · #63 · controlled · narrative · 880 words · est. cov. 92.5% · The night of the storm · तूफ़ान की रात
- **Document.** `"document": "units/hi-a2-1-06.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** Narrative: a storm over the city, the lights go out, Nani lights a lamp, Aman is afraid, the neighbours knock, a tree falls on the lane; Sam helps सुरेश carry water. Pluperfect and habitual past, -ने लगा, -ने वाला था.
- **New (20; each used exactly three times).** तूफ़ान (n: storm) · आँधी (n: storm, dust storm) · अँधेरा (n: darkness) · कमज़ोर (adj: weak) · पिता (n: father) ‹for gdl-63› · कर (n: tax) ‹for gdl-63› ⚠ bare form read as करना · कार (n: car) ‹for gdl-122› · बाल्टी (n: bucket) · मेला (n: fair) · थाली (n: plate) · बीज (n: seed) · बाढ़ (n: flood) · कटोरी (n: small bowl) · बोना (v: to sow) · सूखा (adj: dry) · गिलास (n: glass) · कटाई (n: cutting, harvesting) · पहाड़ (n: mountain, hill) · ताला (n: lock) · बहना (v: to flow)
- **Top-up (6 tokens).** use exactly this often, to make an under-met earlier word known: सैर×2 दौड़×2 आख़िरकार×2
- **Recycle (67 uses).** चोरी पुलिस रिपोर्ट जेब बटुआ साफ़ सरकार अकेला साइकिल चलाना घूमना ठहरना बढ़ना रंग मदद न जन्म बचपन शादी पोता फ़सल कुआँ बैल ऐसे कई बुआ तारीख़ उम्मीद मौसी कैलेंडर मारना कूदना छोड़ना जहाँ जैसा मंदिर इलाक़ा बूढ़ा कसना अलमारी ड्राइवर पंखा वकील नल छूना चमकना डिब्बा ये तरह धागा पत्र प्रिय आदरणीय भेंट ख़ुशी चंगाई अख़बार याद×2 रेडियो ख़ूब मज़ा×2 ओर जैसे या यही
- **Constructions.** pluperfect (Past perfect (-ा था)); habitual-past (Habitual past (-ता था)); inceptive-lagna (Beginning to (-ने लगना)); about-to-vaala (About to (-ने वाला होना)). First met by the gate here: about-to-vaala.
- **Cast.** Sam, सीता नानी, अमन, सुरेश. **Known lemmas before it.** 585. **Recycling (gate rule) 100.0%.**

#### hi-a2-1-07 · #64 · authentic · narrative · 294 words (measured) · cov. 93.2% · चलो किताबें खरीदने
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-64-ch01"`, `stage: "a2-1"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.2%; never-met lemmas 15 (5.1 per 100 words: above the 5-per-100 warning, expected for an authentic text at 92–95 %).
- **Known lemmas before it.** 608.

#### hi-a2-1-08 · #65 · controlled · practical-communication · 830 words · est. cov. 91.1% · At the government office · सरकारी दफ़्तर में
- **Document.** `"document": "units/hi-a2-1-08.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** Practical text with dialogue: Sam and Ravi sir go to register Sam's stay; the queue, the forms, the clerk, the fee, the receipt; what to bring, what happens if a paper is missing. Passive (फ़ॉर्म भरा जाता है), obligation, conditional (अगर … तो).
- **New (19; each used exactly three times).** अफ़सर (n: officer) · काग़ज़ (n: paper) · फ़ॉर्म +(n: form) · कतार (n: line, queue) · आवेदन +(n: application) · नतीजा (n: result) · फ़ीस (n: fee) · तनख़्वाह (n: salary) · बेटा (n: son) ‹for gdl-1› · अम्मा (n: mother) ‹for gdl-3› · साँप (n: snake) ‹for gdl-3› · सिपाही (n: soldier) · बैंक (n: bank) · ख़र्च (n: expense, spending) · मज़दूरी (n: labour) · अदालत (n: court) · बिलकुल (adv: completely, absolutely, quite) · ज़रा (adv: a little) · नीला (adj: blue)
- **Top-up (17 tokens).** use exactly this often, to make an under-met earlier word known: ढेर×2 जानवर×2 आख़िर×2 अकेले×2 केवल×2 पहचानना×2 चित्र×2 फ़र्श×2 बीतना×1
- **Recycle (62 uses).** जहाँ जैसा मंदिर इलाक़ा बूढ़ा कसना अलमारी ड्राइवर पंखा वकील नल छूना चमकना डिब्बा ये तरह धागा पत्र×2 प्रिय×2 आदरणीय×2 भेंट×2 ख़ुशी×2 चंगाई×2 अख़बार×2 याद रेडियो×2 ख़ूब मज़ा ओर×2 जैसे×2 या×2 यही×2 तूफ़ान आँधी अँधेरा कमज़ोर कार बाल्टी मेला थाली बीज बाढ़ कटोरी बोना सूखा गिलास कटाई पहाड़ ताला बहना
- **Constructions.** passive (The passive (-ा जाना)); obligation (Obligation (-ना है, -ना चाहिए, -ना पड़ा)); conditional (अगर … तो (a condition)). First met by the gate here: passive.
- **Cast.** Sam, रवि सर, रमेश. **Known lemmas before it.** 609. **Recycling (gate rule) 100.0%.**

#### hi-a2-1-09 · #66 · authentic · narrative · 318 words (measured) · cov. 92.8% · घर जाना है
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-63-ch01"`, `stage: "a2-1"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 92.8%; never-met lemmas 22 (6.9 per 100 words: above the 5-per-100 warning, expected for an authentic text at 92–95 %).
- **Known lemmas before it.** 637.

#### hi-a2-1-10 · #67 · authentic · narrative · 171 words (measured) · cov. 93.6% · अभी नहीं, अभी नहीं!
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-1-ch01"`, `stage: "a2-1"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.6%; never-met lemmas 7 (4.1 per 100 words).
- **Known lemmas before it.** 637.

#### hi-a2-1-11 · #68 · controlled · instructions · 770 words · est. cov. 90.6% · How tea is made, and why we drink it · चाय कैसे बनती है
- **Document.** `"document": "units/hi-a2-1-11.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** Instructions with explanation: how the leaves grow in the hills and are picked, how a family makes tea at home (water, ginger, cardamom, milk, sugar), why guests are offered tea. Passive, -कर, जब … तब.
- **New (18; each used exactly three times).** पत्ती (n: small leaf, petal) · चीनी (n: sugar) · अदरक (n: ginger) · इलायची +(n: cardamom) · कप (n: cup) · छानना (v: to strain, to sift) · चुनना (v: to choose, to pick) · पौधा (n: plant) · सयाना (adj: grown-up, clever) ‹for gdl-121› · खोजना (v: to search for, to seek) ‹for gdl-79› · टुकड़ा (n: piece, bit) ‹for gdl-79› · मिर्च (n: chilli, pepper) · जंगल (n: forest) · पत्ता (n: leaf) · लहसुन (n: garlic) · घास (n: grass) · फूलना (v: to bloom, to swell) · हरा (adj: green)
- **Top-up (18 tokens).** use exactly this often, to make an under-met earlier word known: बीच×2 उधर×2 सुंदर×2 वाह×2 खाली×2 डाँटना×2 खिलौना×2 चमकीला×2 टकराना×2
- **Recycle (51 uses).** तूफ़ान×2 आँधी×2 अँधेरा×2 कमज़ोर×2 कर कार बाल्टी×2 मेला×2 थाली×2 बीज×2 बाढ़×2 कटोरी×2 बोना×2 सूखा×2 गिलास×2 कटाई×2 पहाड़×2 ताला×2 बहना×2 अफ़सर काग़ज़ फ़ॉर्म कतार आवेदन नतीजा फ़ीस तनख़्वाह सिपाही बैंक ख़र्च मज़दूरी अदालत ज़रा नीला
- **Constructions.** passive (The passive (-ा जाना)); conjunctive-participle (Having done (stem + कर / के)); relative-correlative (जो … वह).
- **Cast.** Sam, सीता नानी. **Known lemmas before it.** 637. **Recycling (gate rule) 100.0%.**

#### hi-a2-1-12 · #69 · authentic · narrative · 265 words (measured) · cov. 92.8% · अम्मा जब स्कूल गयीं
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-3-ch01"`, `stage: "a2-1"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 92.8%; never-met lemmas 16 (6.0 per 100 words: above the 5-per-100 warning, expected for an authentic text at 92–95 %).
- **Known lemmas before it.** 664.

#### hi-a2-1-13 · #70 · controlled · testimony · 880 words · est. cov. 91.0% · Pastor Anil's story · पास्टर अनिल की कहानी
- **Document.** `"document": "units/hi-a2-1-13.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** First-person testimony of a longer kind: how Anil grew up, a hard time, how he found the church, how he forgave, how he became a pastor; reported speech, pluperfect, conditional (अगर … न होता). Faith vocabulary stays plain.
- **New (20; each used exactly three times).** बदलना (v: to change, to exchange) · मौत (n: death) · ज़िंदगी (n: life) · आत्मा (n: spirit, soul) · शुद्ध (adj: pure, clean, correct) · अनुग्रह (n: grace, favour) · सुसमाचार (n: good news, the gospel) · बूँद (n: drop) ‹for gdl-93› · तुरंत (adv: at once, immediately) ‹for gdl-93› · गरजना (v: to thunder, to roar) ‹for gdl-93› · बेटी (n: daughter) · पोती (n: son's daughter, granddaughter) ⚠ bare form read as पोतना · रिश्तेदार (n: relative, relation) · बच्ची (n: little girl) · जवान (adj: young) · बचना (v: to be saved, to escape) · सच (n: truth) · तू (pron: you) · भर (part: all through, the whole of) ⚠ bare form read as भरना · बिना (post: without)
- **Top-up (19 tokens).** use exactly this often, to make an under-met earlier word known: मुँह×2 वहीं×2 चूहा×2 बाप×2 माफ़ी×2 ग़ायब×2 मोटर×2 घंटी×2 शिक्षक×1 नाई×2
- **Recycle (18 uses).** अफ़सर काग़ज़ फ़ॉर्म कतार आवेदन नतीजा फ़ीस तनख़्वाह सिपाही बैंक ख़र्च मज़दूरी अदालत बिलकुल ज़रा नीला लहसुन हरा
- **Constructions.** perfective-past (The perfective past (-ा)); pluperfect (Past perfect (-ा था)); conditional (अगर … तो (a condition)).
- **Cast.** पास्टर अनिल, Sam. **Known lemmas before it.** 664. **Recycling (gate rule) 100.0%.**

#### hi-a2-1-14 · #71 · controlled · contemporary-nonfiction · 880 words · est. cov. 91.9% · The monsoon and the farmers · मानसून और किसान
- **Document.** `"document": "units/hi-a2-1-14.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** Contemporary nonfiction: what the monsoon is, what farmers sow and when, what happens when the rain fails or floods; a farmer, सुरेश, answers questions. जितना … उतना, passive, numbers in digits.
- **New (20; each used exactly three times).** जितना (adj: as much as, as many as) · उतना (adj: that much, as much) · मानसून +(n: monsoon) · धान +(n: paddy, rice plant) · खेती +(n: farming, cultivation) · सिंचाई (n: irrigation) · नहर (n: canal) · अनाज (n: grain, cereal) · मक्का (n: maize, corn) · गेहूँ (n: wheat) · गीला (adj: wet) ‹for gdl-93› · मिट्टी (n: soil, clay, dust) ‹for gdl-93› · जूता (n: shoe) ‹for gdl-101› · पत्थर (n: stone) · चाँद (n: moon) · तारा (n: star) · सूरज (n: sun) · ज़मीन (n: ground, land) · उगना (v: to grow, to rise) · अलग (adj: separate, different)
- **Top-up (11 tokens).** use exactly this often, to make an under-met earlier word known: चना×2 स्कूटर×2 सावधान×2 लड्डू×1 मुबारक×2 ट्रक×2
- **Recycle (24 uses).** अफ़सर काग़ज़ फ़ॉर्म कतार आवेदन नतीजा फ़ीस तनख़्वाह सिपाही बैंक ख़र्च मज़दूरी अदालत बिलकुल ज़रा नीला पत्ती पौधा जंगल पत्ता घास फूलना बूँद गरजना
- **Constructions.** relative-correlative (जो … वह); jitna-utna (जितना … उतना); passive (The passive (-ा जाना)). First met by the gate here: jitna-utna.
- **Cast.** Sam, सुरेश. **Known lemmas before it.** 694. **Recycling (gate rule) 100.0%.**

#### hi-a2-1-15 · #72 · controlled · narrative · 770 words · est. cov. 93.0% · The clever mouse (Nani's story) · चालाक चूहा: नानी की कहानी
- **Document.** `"document": "units/hi-a2-1-15.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** Told folk tale: Nani tells Aman about a clever mouse and a cat who set a trap; direct speech, repetition, a moral at the end; perfective, habitual past, जब … तब.
- **New (18; each used exactly three times).** बिल्ली (n: cat) · चालाक (adj: clever, cunning) · जाल (n: net, trap) · बिल (n: bill) · शेर (n: lion) · चप्पल (n: sandal, slipper) ‹for gdl-101› · उतारना (v: to take off, to take down) ‹for gdl-101› · टाँगना (v: to hang up) ‹for gdl-101› · भैंस (n: buffalo) · बकरी (n: goat) · भेड़ (n: sheep) · घोड़ा (n: horse) · गधा (n: donkey) · काला (adj: black) · ऊँचा (adj: high, tall) · मगर (conj: but) · तेज़ (adj: fast, sharp, strong) · सिर्फ़ (part: only, merely)
- **Recycle (32 uses).** पत्ती चीनी अदरक इलायची कप छानना चुनना पौधा सयाना खोजना टुकड़ा मिर्च जंगल पत्ता घास फूलना सुसमाचार बूँद गरजना बचना भर मानसून धान खेती सिंचाई मिट्टी पत्थर चाँद तारा सूरज ज़मीन उगना
- **Constructions.** perfective-past (The perfective past (-ा)); habitual-past (Habitual past (-ता था)); jab-tab (जब … तब).
- **Cast.** सीता नानी, अमन. **Known lemmas before it.** 720. **Recycling (gate rule) 100.0%.**

#### hi-a2-1-16 · #73 · controlled · conversation · 830 words · est. cov. 93.1% · Exam week at Ravi sir's school · परीक्षा का हफ़्ता
- **Document.** `"document": "units/hi-a2-1-16.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** Dialogue: Aman and his friends before the exam, Ravi sir's advice, the night before, the result; hopes and fears (अगर मैं पास होता तो …), obligation, conditional.
- **New (19; each used exactly three times).** परीक्षा (n: examination, test) · कॉपी (n: exercise book) · कलम (n: pen) · बस्ता (n: school bag) · वर्दी (n: uniform) · मास्टर (n: teacher) · इम्तिहान +(n: exam) · फ़ेल +(adj: failed) · छड़ी (n: stick, cane) ‹for gdl-101› · कोना (n: corner) ‹for gdl-101› · दुपट्टा (n: scarf, veil) ‹for gdl-79› · पेंसिल (n: pencil) · समझाना (v: to explain) · सिखाना (v: to teach) · ख़ास (adj: special, particular) · गहरा (adj: deep) · खुद (pron: oneself, myself, himself) · जिसका (det: whose) · वजह (post: because of, owing to)
- **Recycle (32 uses).** पत्ती चीनी अदरक इलायची कप छानना चुनना सयाना खोजना टुकड़ा मिर्च जंगल लहसुन घास हरा बदलना ज़िंदगी शुद्ध तुरंत पोती बच्ची सच बिना सिंचाई मिट्टी चाँद उगना चालाक जाल बकरी काला तेज़
- **Constructions.** conditional (अगर … तो (a condition)); obligation (Obligation (-ना है, -ना चाहिए, -ना पड़ा)); contrary-to-fact (A condition that did not happen (-ता … -ता)). First met by the gate here: contrary-to-fact.
- **Cast.** रवि सर, अमन, Sam. **Known lemmas before it.** 738. **Recycling (gate rule) 100.0%.**

#### hi-a2-1-17 · #74 · controlled · work · 830 words · est. cov. 93.9% · Priya's mobile-phone shop · प्रिया की मोबाइल की दुकान
- **Document.** `"document": "units/hi-a2-1-17.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** Work narrative with dialogue: a day in Priya and Rohan's small shop: SIM cards, repairs, a customer who cannot read the screen; passive and relative clauses, loan words (इंटरनेट, कंप्यूटर, फ़ोटो, वीडियो).
- **New (17; each used exactly three times).** इंटरनेट +(n: the internet) · कंप्यूटर +(n: computer) · फ़ोटो +(n: photograph) ⚠ bare form read as फ़ोटना · वीडियो +(n: video) · टीवी (n: television) · खोज (n: search, discovery) ‹for gdl-79› ⚠ bare form read as खोजना · चमक (n: shine, brightness) ‹for gdl-79› ⚠ bare form read as चमकना · समोसा (n: samosa) ‹for gdl-98› · वैसे (adv: in that way) · लहर (n: wave) · उम्र (n: age) · फाटक (n: gate) · ताकि (sconj: so that, in order that) · अलावा (post: besides, apart from) · इनका (det: their) · हाय (intj: alas) · चाहे (sconj: whether)
- **Recycle (40 uses).** चीनी अदरक इलायची कप छानना चुनना पौधा सयाना खोजना टुकड़ा मिर्च पत्ता लहसुन फूलना हरा मौत आत्मा अनुग्रह बेटी रिश्तेदार जवान तू नहर गेहूँ जूता तारा अलग बिल उतारना भेड़ काला तेज़ कॉपी वर्दी मास्टर कोना पेंसिल ख़ास खुद जिसका
- **Constructions.** passive (The passive (-ा जाना)); relative-correlative (जो … वह); complement-ki (कि introduces what was said or known).
- **Cast.** Sam, प्रिया, रोहन. **Known lemmas before it.** 757. **Recycling (gate rule) 100.0%.**

#### hi-a2-1-18 · #75 · controlled · health · 940 words · est. cov. 94.9% · The medical camp in the village · गाँव में स्वास्थ्य शिविर
- **Document.** `"document": "units/hi-a2-1-18.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** The team runs a one-day camp in Nani's village: who comes, what Meera checks, what the doctor says, what is given, how to avoid malaria and dengue; advice with obligation and permission (जाने दीजिए), passive.
- **New (16; each used exactly three times).** स्वास्थ्य (n: health) · शिविर +(n: camp) · टीका (n: a tilak mark) · मलेरिया +(n: malaria) · डेंगू +(n: dengue) · मच्छर (n: mosquito) · सफ़ाई (n: cleaning, cleanliness) · पिल्ला (n: puppy) ‹for gdl-98› · बरसाना (v: to shower, to rain down) ‹for gdl-110› · गोल (adj: round) ‹for gdl-54› · चोट (n: injury, hurt) · नाक (n: nose) · घाव (n: wound) · दाँत (n: tooth) · उँगली (n: finger) · नर्स (n: nurse)
- **Recycle (58 uses).** बदलना मौत ज़िंदगी आत्मा शुद्ध अनुग्रह सुसमाचार बूँद तुरंत बेटी पोती रिश्तेदार बच्ची जवान बचना सच तू भर बिना जितना उतना मानसून धान सिंचाई अनाज मक्का गेहूँ गीला पत्थर ज़मीन बिल्ली चप्पल टाँगना घोड़ा ऊँचा मगर परीक्षा बस्ता मास्टर छड़ी दुपट्टा समझाना ख़ास गहरा जिसका वजह इंटरनेट कंप्यूटर फ़ोटो वीडियो खोज चमक वैसे उम्र ताकि अलावा इनका चाहे
- **Constructions.** obligation (Obligation (-ना है, -ना चाहिए, -ना पड़ा)); permissive-dena (Letting, allowing (-ने देना)); passive (The passive (-ा जाना)). First met by the gate here: permissive-dena.
- **Cast.** मीरा दीदी, Sam, सुरेश. **Known lemmas before it.** 774. **Recycling (gate rule) 100.0%.**

#### hi-a2-1-19 · #76 · controlled · narrative · 880 words · est. cov. 95.9% · Aman's lost bag · अमन का खोया बैग
- **Document.** `"document": "units/hi-a2-1-19.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** Narrative in the past: Aman's school bag is missing after the bus; he, Sam and Meera ask at school, at the stop, at the shop; found with a neighbour's child; pluperfect, conditional.
- **New (12; each used exactly three times).** खोया (adj: lost) ‹for gdl-54› ⚠ bare form read as खोना · मंत्री (n: minister) ‹for gdl-36› · मन (n: mind) ‹for gdl-36› · झाड़ू (n: broom) · सीढ़ी (n: stair, ladder) · बरामदा (n: veranda) · कोशिश (n: attempt, effort) · ज़रूरत (n: need, necessity) · खेल (n: game, play) ⚠ bare form read as खेलना · चश्मा (n: spectacles, glasses) · बोतल (n: bottle) · समझ (n: understanding) ⚠ bare form read as समझना
- **Recycle (63 uses).** बदलना मौत ज़िंदगी आत्मा शुद्ध अनुग्रह सुसमाचार तुरंत गरजना बेटी पोती रिश्तेदार बच्ची जवान बचना सच तू भर बिना जितना उतना खेती नहर अनाज मक्का गीला जूता सूरज अलग शेर भैंस गधा ऊँचा सिर्फ़ परीक्षा कॉपी कलम बस्ता वर्दी इम्तिहान फ़ेल छड़ी पेंसिल समझाना सिखाना फ़ोटो टीवी खोज समोसा वैसे लहर फाटक अलावा हाय चाहे शिविर मलेरिया मच्छर पिल्ला गोल नाक दाँत नर्स
- **Constructions.** pluperfect (Past perfect (-ा था)); perfective-past (The perfective past (-ा)); conditional (अगर … तो (a condition)).
- **Cast.** अमन, Sam, मीरा दीदी, रवि सर. **Known lemmas before it.** 790. **Recycling (gate rule) 100.0%.**

#### hi-a2-1-20 · #77 · controlled · church-and-mission-life · 880 words · est. cov. 96.3% · Why we celebrate Christmas · हम क्रिसमस क्यों मनाते हैं
- **Document.** `"document": "units/hi-a2-1-20.json"`, `kind: "controlled"`, `stage: "a2-1"`, corpus id `ladder-hi`.
- **Situation.** Explanation with a short story: Pastor Anil explains the feast to the children and tells why the shepherds and the star matter, in plain words (the course's own wording, no quotation); जो … वह, passive, कि-clauses.
- **New (11; each used exactly three times).** क्रिसमस (n: Christmas) · चरवाहा (n: shepherd, herdsman) · स्वर्गदूत (n: angel) · उद्धारकर्ता (n: saviour) · दूत (n: messenger, angel) · भविष्यवक्ता (n: prophet) · राज्य (n: state) · मनुष्य (n: human being, mankind) · समुद्र (n: sea) ‹for gdl-36› · किनारा (n: edge, bank, shore) ‹for gdl-36› · चेहरा (n: face) ‹for gdl-36›
- **Recycle (73 uses).** जितना उतना मानसून धान खेती नहर अनाज मक्का गेहूँ गीला मिट्टी जूता पत्थर चाँद तारा सूरज ज़मीन उगना अलग बिल्ली चालाक जाल बिल शेर चप्पल उतारना टाँगना भैंस बकरी भेड़ घोड़ा गधा मगर सिर्फ़ कलम इम्तिहान फ़ेल कोना दुपट्टा सिखाना गहरा खुद वजह इंटरनेट कंप्यूटर वीडियो टीवी चमक समोसा लहर उम्र ताकि इनका हाय स्वास्थ्य टीका डेंगू सफ़ाई बरसाना चोट घाव उँगली खोया मंत्री झाड़ू सीढ़ी बरामदा कोशिश ज़रूरत खेल चश्मा बोतल समझ
- **Constructions.** relative-correlative (जो … वह); passive (The passive (-ा जाना)); complement-ki (कि introduces what was said or known).
- **Cast.** पास्टर अनिल, Sam, अमन. **Known lemmas before it.** 802. **Recycling (gate rule) 100.0%.**

### 3.2.4 Stage a2-2

#### hi-a2-2-01 · #78 · controlled · travel · 1210 words · est. cov. 97.0% · Diary of a trip to the hills · पहाड़ की यात्रा की डायरी
- **Document.** `"document": "units/hi-a2-2-01.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** First-person diary over four days: the bus, the cold, the climb, a waterfall, a night in a guest house, the way back; short dated entries, -कर, habitual and perfective past.
- **New (12; each used exactly three times).** यात्रा (n: journey, pilgrimage) · बर्फ़ (n: ice, snow) · घाटी (n: valley) · झरना (n: waterfall, spring) · चढ़ाई (n: climb, ascent) ⚠ bare form read as चढ़ाना · थकान (n: tiredness) · दृश्य +(n: view, scene) · धुंध +(n: mist, haze) · हल्का (adj: light) ‹for gdl-36› · विशाल (adj: vast, huge) ‹for gdl-36› · उड़ाना (v: to make fly, to fly) ‹for gdl-36› · यदि (sconj: if) ‹for jhn-14›
- **Recycle (92 uses).** बिल्ली चालाक जाल बिल शेर चप्पल उतारना टाँगना भैंस बकरी भेड़ घोड़ा गधा काला ऊँचा मगर तेज़ सिर्फ़ परीक्षा कॉपी कलम बस्ता वर्दी मास्टर इम्तिहान फ़ेल छड़ी कोना दुपट्टा पेंसिल समझाना सिखाना ख़ास गहरा खुद जिसका वजह इंटरनेट कंप्यूटर फ़ोटो वीडियो टीवी खोज चमक समोसा वैसे लहर उम्र फाटक ताकि अलावा इनका हाय चाहे स्वास्थ्य शिविर टीका मलेरिया डेंगू मच्छर सफ़ाई पिल्ला बरसाना गोल चोट नाक घाव दाँत उँगली नर्स खोया मंत्री झाड़ू सीढ़ी बरामदा कोशिश ज़रूरत खेल चश्मा बोतल समझ क्रिसमस चरवाहा स्वर्गदूत उद्धारकर्ता दूत भविष्यवक्ता राज्य मनुष्य समुद्र किनारा चेहरा
- **Constructions.** conjunctive-participle (Having done (stem + कर / के)); habitual-past (Habitual past (-ता था)); perfective-past (The perfective past (-ा)).
- **Cast.** Sam, रवि सर, अमन. **Known lemmas before it.** 813. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-02 · #79 · authentic · narrative · 212 words (measured) · cov. 94.3% · स्कूल का पहला दिन
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-122-ch01"`, `stage: "a2-2"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 94.3%; never-met lemmas 7 (3.3 per 100 words).
- **Known lemmas before it.** 825.

#### hi-a2-2-03 · #80 · authentic · narrative · 103 words (measured) · cov. 94.2% · मैं नहीं डरती !
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-105-ch01"`, `stage: "a2-2"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 94.2%; never-met lemmas 4 (3.9 per 100 words).
- **Known lemmas before it.** 827.

#### hi-a2-2-04 · #81 · controlled · biography · 1210 words · est. cov. 96.6% · Meera didi becomes a nurse · मीरा दीदी कैसे नर्स बनीं
- **Document.** `"document": "units/hi-a2-2-04.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** Biography told by Meera to Sam: childhood, her father's illness, the training years, the first night shift, why she stayed; pluperfect, conditional, reported speech.
- **New (11; each used exactly three times).** सपना (n: dream) · हौसला (n: courage, spirit) · हिम्मत (n: courage) · सफलता (n: success) · ग़रीब (adj: poor) · ट्रेनिंग +(n: training) · विदा (n: leave-taking, farewell) · टोपी (n: cap, hat) ‹for gdl-65› · बंदर (n: monkey) ‹for gdl-69› · भारी (adj: heavy) ‹for gdl-69› · संसार (n: world) ‹for jhn-14›
- **Top-up (8 tokens).** use exactly this often, to make an under-met earlier word known: चार×2 मुड़ना×2 बढ़ाना×2 रानी×2
- **Recycle (81 uses).** स्वास्थ्य शिविर टीका मलेरिया डेंगू मच्छर सफ़ाई पिल्ला बरसाना गोल चोट नाक घाव दाँत उँगली नर्स खोया मंत्री मन झाड़ू सीढ़ी बरामदा कोशिश ज़रूरत खेल चश्मा बोतल समझ क्रिसमस×2 चरवाहा×2 स्वर्गदूत×2 उद्धारकर्ता×2 दूत×2 भविष्यवक्ता×2 राज्य×2 मनुष्य×2 समुद्र×2 किनारा×2 चेहरा यात्रा×3 बर्फ़×3 घाटी×3 झरना×3 चढ़ाई×3 थकान×3 दृश्य×3 धुंध×3 हल्का×3 विशाल×3 उड़ाना×2
- **Constructions.** pluperfect (Past perfect (-ा था)); contrary-to-fact (A condition that did not happen (-ता … -ता)); relative-correlative (जो … वह).
- **Cast.** मीरा दीदी, Sam. **Known lemmas before it.** 827. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-05 · #82 · authentic (Scripture) · scripture · 747 words (measured) · cov. 92.5% · यूहन्ना 14 (John 14)
- **Text.** `"kind": "authentic", "textId": "text:hi:bible-jhn-14"`, `stage: "a2-2"` (IRV Hindi 2019, CC BY-SA 4.0 via eBible.org). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 92.5%; never-met lemmas 34 (4.6 per 100 words).
- **Known lemmas before it.** 842.

#### hi-a2-2-06 · #83 · authentic · narrative · 313 words (measured) · cov. 93.9% · चाचा की शादी
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-66-ch01"`, `stage: "a2-2"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.9%; never-met lemmas 11 (3.5 per 100 words).
- **Known lemmas before it.** 848.

#### hi-a2-2-07 · #84 · authentic · narrative · 147 words (measured) · cov. 92.5% · चाँद का तोहफ़ा
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-65-ch01"`, `stage: "a2-2"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 92.5%; never-met lemmas 10 (6.8 per 100 words: above the 5-per-100 warning, expected for an authentic text at 92–95 %).
- **Known lemmas before it.** 851.

#### hi-a2-2-08 · #85 · controlled · conversation · 1100 words · est. cov. 94.1% · City or village? A conversation · शहर या गाँव?
- **Document.** `"document": "units/hi-a2-2-08.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** Conversation among रवि सर, सुरेश and Sam on where it is better to live: noise and quiet, work and land, schools and hospitals, family; opinions, comparison, concession (जैसा … वैसा, अगर … तो).
- **New (14; each used exactly three times).** शोर (n: noise) · मौक़ा (n: chance, occasion) · आज़ादी (n: freedom, independence) · अकेलापन (n: loneliness) · रिश्ता (n: relationship) · फ़ायदा (n: benefit, profit) · नुकसान (n: harm, loss) · फ़ैसला (n: decision, verdict) · सुविधा +(n: facility, convenience) · महँगाई +(n: high prices, inflation) ⚠ bare form read as महँगाना · तरक़्क़ी +(n: progress) · भालू (n: bear) ‹for gdl-69› · डाल (n: branch of a tree) ‹for gdl-69› ⚠ bare form read as डालना · सोच (n: thought, thinking) ‹for gdl-69› ⚠ bare form read as सोचना
- **Top-up (23 tokens).** use exactly this often, to make an under-met earlier word known: शोर×2 बाक़ी×2 लटकना×2 कारण×2 शौक़×2 द्वारा×1 उत्तर×2 कराना×2 टॉफ़ी×2 पुत्र×2 विनती×2 अधिकार×2
- **Recycle (13 uses).** सपना×2 हौसला हिम्मत×2 सफलता×2 ग़रीब ट्रेनिंग विदा×2 बंदर भारी
- **Constructions.** conditional (अगर … तो (a condition)); comparison-se (Comparison with से); contrary-to-fact (A condition that did not happen (-ता … -ता)); jaisa-vaisa (जैसा … वैसा). First met by the gate here: jaisa-vaisa.
- **Cast.** रवि सर, सुरेश, Sam. **Known lemmas before it.** 851. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-09 · #86 · controlled · contemporary-nonfiction · 1210 words · est. cov. 95.3% · Water and rubbish in our lane · पानी और कचरा
- **Document.** `"document": "units/hi-a2-2-09.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** Contemporary public-health nonfiction: where the lane's water comes from, where the rubbish goes, why it matters, what the neighbours could do; passive, relative clauses, obligation.
- **New (12; each used exactly three times).** टंकी (n: tank) · गंदा (adj: dirty) · कचरा +(n: rubbish) · गंदगी +(n: dirt, filth) · नाली (n: drain, channel) · शिकायत (n: complaint) · सुधार +(n: improvement) ⚠ bare form read as सुधारना · बीमारी (n: illness) · पर्दा (n: curtain, veil) ‹for gdl-70› · प्लेट (n: plate) ‹for gdl-70› · ताक़त (n: strength, power) · नींद (n: sleep)
- **Top-up (21 tokens).** use exactly this often, to make an under-met earlier word known: डाली×2 स्थान×2 तोहफ़ा×2 जीवित×1 पवित्र×2 सत्य×1 महिमा×2 सर्वदा×2 अर्थात्×1 वास×2 स्मरण×2 सरदार×2
- **Recycle (18 uses).** सपना हौसला×2 हिम्मत सफलता ग़रीब×2 ट्रेनिंग×2 विदा बंदर×2 भारी×2 सुविधा महँगाई तरक़्क़ी डाल
- **Constructions.** passive (The passive (-ा जाना)); relative-correlative (जो … वह); obligation (Obligation (-ना है, -ना चाहिए, -ना पड़ा)).
- **Cast.** Sam, गीता, सुरेश. **Known lemmas before it.** 876. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-10 · #87 · authentic · narrative · 432 words (measured) · cov. 93.3% · दीदी का रंग बिरंगा खज़ाना
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-79-ch01"`, `stage: "a2-2"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.3%; never-met lemmas 26 (6.0 per 100 words: above the 5-per-100 warning, expected for an authentic text at 92–95 %).
- **Known lemmas before it.** 900.

#### hi-a2-2-11 · #88 · controlled · community · 1210 words · est. cov. 94.4% · The community meeting · मोहल्ले की बैठक
- **Document.** `"document": "units/hi-a2-2-11.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** Dialogue and minutes: the lane meets to decide about rubbish and the tap; Pastor Anil and सुरेश speak, गीता proposes, they vote; proposals, polite register, subjunctive and conditional.
- **New (14; each used exactly three times).** प्रस्ताव +(n: proposal) · राय +(n: opinion) · सुझाव +(n: suggestion) · सहमत +(adj: in agreement) · वोट +(n: vote) · चंदा +(n: donation, subscription) · इकट्ठा (adj: gathered together, collected) · समस्या (n: problem) · हल (n: solution) · अध्यक्ष +(n: chairman) · उखाड़ना (v: to uproot, to pull out) ‹for gdl-70› · भगाना (v: to chase away, to drive away) ‹for gdl-70› · भरा (adj: full, filled) ‹for gdl-36› ⚠ bare form read as भरना · क़ानून (n: law)
- **Top-up (26 tokens).** use exactly this often, to make an under-met earlier word known: फेंकना×2 भूलना×2 क़रीब×2 अजीब×2 क़िस्म×2 लेटना×2 घूरना×2 ख़ूबसूरत×2 मुस्कान×2 ओढ़ना×2 नज़दीक×2 ताकना×2 दवाई×2
- **Recycle (14 uses).** शोर मौक़ा अकेलापन रिश्ता फ़ायदा फ़ैसला सुविधा महँगाई तरक़्क़ी सोच गंदा नाली सुधार ताक़त
- **Constructions.** subjunctive (The subjunctive); conditional (अगर … तो (a condition)); complement-ki (कि introduces what was said or known).
- **Cast.** पास्टर अनिल, सुरेश, गीता, Sam. **Known lemmas before it.** 901. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-12 · #89 · controlled · correspondence · 1100 words · est. cov. 97.4% · A formal letter and the reply · औपचारिक पत्र और उसका उत्तर
- **Document.** `"document": "units/hi-a2-2-12.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** Correspondence: Sam applies for a place for Aman in a school or for permission to hold a camp, the office replies; formal register (महोदय, निवेदन, सूचित), passive, -कर.
- **New (9; each used exactly three times).** निवेदन +(n: request) · महोदय +(n: sir) · कृपया (adv: please) · स्वीकार +(n: acceptance) · सूचित +(adj: informed) · फीता (n: strap, lace, ribbon) ‹for gdl-77› · बाँधना (v: to tie, to bind) ‹for gdl-77› · झूलना (v: to swing, to sway) ‹for gdl-77› · चोर (n: thief)
- **Top-up (2 tokens).** use exactly this often, to make an under-met earlier word known: ख़ज़ाना×2
- **Recycle (18 uses).** शोर आज़ादी रिश्ता फ़ायदा नुकसान फ़ैसला तरक़्क़ी भालू सोच गंदा शिकायत बीमारी नींद राय सहमत चंदा अध्यक्ष क़ानून
- **Constructions.** polite-request (The polite request); passive (The passive (-ा जाना)); conjunctive-participle (Having done (stem + कर / के)).
- **Cast.** Sam, रवि सर. **Known lemmas before it.** 928. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-13 · #90 · controlled · narrative · 1270 words · est. cov. 97.6% · Holi in a village · गाँव की होली
- **Document.** `"document": "units/hi-a2-2-13.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** A neutral, respectful observer's account of the neighbours' festival in a village: what the children do, what is cooked, how the colours are thrown, what Sam does (he stays dry on the roof and helps with the food); perfective and habitual past.
- **New (10; each used exactly three times).** होली (n: Holi) · गुलाल +(n: coloured powder, for Holi) · पिचकारी +(n: water squirt, for Holi) · पकवान +(n: festive dish) · ढोल +(n: drum) · नाच (n: dance) ⚠ bare form read as नाचना · हँसी (n: laughter) ⚠ bare form read as हँसना · मतलब (n: meaning, purpose) ‹for gdl-77› · पिछला (adj: previous, last) ‹for gdl-77› · प्रश्न (n: question) ‹for gdl-77›
- **Recycle (21 uses).** शोर मौक़ा आज़ादी अकेलापन फ़ायदा नुकसान सुविधा भालू डाल सोच टंकी गंदगी शिकायत प्लेट ताक़त प्रस्ताव सुझाव वोट हल भगाना झूलना
- **Constructions.** perfective-past (The perfective past (-ा)); habitual-past (Habitual past (-ता था)); pluperfect (Past perfect (-ा था)).
- **Cast.** Sam, सुरेश, अमन. **Known lemmas before it.** 938. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-14 · #91 · controlled · health · 1210 words · est. cov. 97.3% · Dengue and clean water · डेंगू और साफ़ पानी
- **Document.** `"document": "units/hi-a2-2-14.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** Health communication: Meera explains dengue and how it spreads, covers stored water, nets and coolers; warnings and negative commands (मत …), passive, obligation.
- **New (11; each used exactly three times).** जाँच (n: test, inquiry, check) ⚠ bare form read as जाँचना · ढकना (v: to cover) · सावधानी +(n: care, caution) ⚠ bare form read as सावधाना · मच्छरदानी +(n: mosquito net) ⚠ bare form read as मच्छरदाना · कूलर +(n: air cooler) · उबला (adj: boiled) ⚠ bare form read as उबलना · साबुन (n: soap) · चिंता (n: worry, anxiety) ‹for gdl-77› · फ़िल्म (n: film) ‹for gdl-77› · बाघ (n: tiger) ‹for gdl-77› · चक्कर (n: dizziness)
- **Recycle (24 uses).** मौक़ा आज़ादी अकेलापन रिश्ता नुकसान फ़ैसला महँगाई भालू डाल टंकी गंदगी नाली सुधार बीमारी पर्दा प्लेट नींद समस्या उखाड़ना फीता पिचकारी नाच हँसी पिछला
- **Constructions.** passive (The passive (-ा जाना)); obligation (Obligation (-ना है, -ना चाहिए, -ना पड़ा)); negative-command (The negative command (मत)).
- **Cast.** मीरा दीदी, Sam. **Known lemmas before it.** 948. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-15 · #92 · controlled · testimony · 1270 words · est. cov. 96.5% · Sam's testimony, a year later · एक साल बाद सैम की गवाही
- **Document.** `"document": "units/hi-a2-2-15.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** Reflective first-person testimony: what has changed in a year, what he learnt about himself, about the neighbours, about prayer; present perfect, contrary-to-fact (अगर मैं न आता तो …), faith words (the Bible words that John 14 and Mark 1 will need are taught here).
- **New (14; each used exactly three times).** चमत्कार (n: miracle) · अनुभव +(n: experience) · सीख +(n: lesson, teaching) ⚠ bare form read as सीखना · प्रचार (n: preaching, proclamation) · संगति (n: fellowship, company) · बपतिस्मा (n: baptism) · उपदेश (n: sermon, teaching) · ज्योति (n: light, radiance) · अंधकार (n: darkness) · ग्रहण +(n: receiving, accepting) · जगत (n: world, universe) · बुरा (adj: bad, evil) ‹for gdl-77› · माथा (n: forehead) ‹for gdl-84› · सचमुच (adv: really, truly) ‹for gdl-84›
- **Top-up (2 tokens).** use exactly this often, to make an under-met earlier word known: ग्रहण×2
- **Recycle (30 uses).** टंकी गंदा गंदगी नाली शिकायत सुधार बीमारी पर्दा प्लेट ताक़त नींद प्रस्ताव राय सुझाव सहमत वोट चंदा इकट्ठा अध्यक्ष भरा गुलाल पकवान ढोल हँसी पिछला जाँच मच्छरदानी साबुन चिंता चक्कर
- **Constructions.** perfective-past (The perfective past (-ा)); present-perfect (Present perfect (-ा है)); contrary-to-fact (A condition that did not happen (-ता … -ता)).
- **Cast.** Sam, पास्टर अनिल. **Known lemmas before it.** 959. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-16 · #93 · controlled · work · 1210 words · est. cov. 98.5% · An auto driver's day (interview) · ऑटो चालक से बातचीत
- **Document.** `"document": "units/hi-a2-2-16.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** Interview: Sam asks दीपक about his day, his family, the loan on the auto, what he wishes for; question and answer, habitual past, relative clauses.
- **New (6; each used exactly three times).** मीटर (n: metre) · पेट्रोल (n: petrol) · ट्रैफ़िक +(n: traffic) · क़र्ज़ (n: debt, loan) · बेवक़ूफ़ (adj: foolish, stupid) ‹for gdl-84› · रसीद (n: receipt)
- **Recycle (33 uses).** इकट्ठा समस्या हल उखाड़ना भगाना भरा क़ानून निवेदन महोदय कृपया स्वीकार सूचित फीता बाँधना झूलना चोर होली गुलाल पिचकारी पकवान ढोल नाच मतलब प्रश्न ढकना कूलर चिंता फ़िल्म चक्कर प्रचार उपदेश ग्रहण जगत
- **Constructions.** habitual-past (Habitual past (-ता था)); perfective-past (The perfective past (-ा)); relative-correlative (जो … वह).
- **Cast.** दीपक, Sam. **Known lemmas before it.** 973. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-17 · #94 · controlled · contemporary-nonfiction · 1210 words · est. cov. 98.5% · How a school year works · स्कूल का साल कैसे चलता है
- **Document.** `"document": "units/hi-a2-2-17.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** Contemporary nonfiction: how a school year runs in the city: admission, classes, exams, holidays, fees, public and private schools; passive, relative clauses, numbers and months in digits.
- **New (6; each used exactly three times).** दाख़िला +(n: admission) · पाठ्यक्रम +(n: syllabus) · निजी (adj: private, personal) · क्लास (n: class) · बोली (n: dialect, spoken tongue) ⚠ bare form read as बोलना · वक़्त (n: time)
- **Recycle (34 uses).** प्रस्ताव राय सुझाव सहमत वोट चंदा इकट्ठा समस्या हल अध्यक्ष उखाड़ना भगाना भरा क़ानून निवेदन महोदय कृपया स्वीकार सूचित बाँधना चोर होली मतलब प्रश्न सावधानी उबला बाघ चमत्कार अनुभव संगति ज्योति बुरा सचमुच ट्रैफ़िक
- **Constructions.** passive (The passive (-ा जाना)); relative-correlative (जो … वह); obligation (Obligation (-ना है, -ना चाहिए, -ना पड़ा)).
- **Cast.** रवि सर, Sam. **Known lemmas before it.** 979. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-18 · #95 · controlled · family · 1270 words · est. cov. 96.7% · A wedding in the family · परिवार में शादी
- **Document.** `"document": "units/hi-a2-2-18.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** A family wedding seen by Sam: the procession, the guests, the food, the songs, the farewell (विदा); a respectful observer's account, perfective and habitual past, future (what will happen next week).
- **New (14; each used exactly three times).** बारात (n: wedding procession) · दूल्हा (n: bridegroom) · दुल्हन (n: bride) · भोज (n: feast, banquet) · पुलाव (n: pulao) · रायता (n: raita, spiced curd) · बाँटना (v: to share, to divide) · सजना (v: to dress up, to be decorated) · अंगूठी (n: ring) · जोड़ा (n: pair, couple) ⚠ bare form read as जोड़ना · धनिया (n: coriander) · पैंट (n: trousers) · घी (n: ghee, clarified butter) · साड़ी (n: sari)
- **Recycle (34 uses).** निवेदन महोदय कृपया स्वीकार सूचित फीता बाँधना झूलना चोर होली गुलाल पिचकारी पकवान ढोल नाच हँसी मतलब पिछला प्रश्न जाँच ढकना सावधानी मच्छरदानी कूलर उबला साबुन चिंता फ़िल्म बाघ चक्कर सीख बपतिस्मा अंधकार माथा
- **Constructions.** perfective-past (The perfective past (-ा)); habitual-past (Habitual past (-ता था)); future (The future (-गा / -गी / -गे)).
- **Cast.** सीता नानी, मीरा दीदी, Sam, अमन. **Known lemmas before it.** 985. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-19 · #96 · authentic · narrative · 127 words (measured) · cov. 92.9% · मेरा घर
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-101-ch01"`, `stage: "a2-2"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 92.9%; never-met lemmas 9 (7.1 per 100 words: above the 5-per-100 warning, expected for an authentic text at 92–95 %).
- **Known lemmas before it.** 999.

#### hi-a2-2-20 · #97 · controlled · food · 1320 words · est. cov. 98.6% · Cooking for the church feast · चर्च की दावत की तैयारी
- **Document.** `"document": "units/hi-a2-2-20.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** Instructions and narrative: the women of the church cook for a hundred guests: how much rice and dal, big pots, who serves; quantities in digits, passive (पकाया जाता है), obligation.
- **New (5; each used exactly three times).** दावत +(n: feast) · परोसना (v: to serve) · दही (n: curd, yoghurt) · पनीर (n: cheese) · हिस्सा (n: part, share)
- **Top-up (4 tokens).** use exactly this often, to make an under-met earlier word known: पकना×2 स्वादिष्ट×2
- **Recycle (37 uses).** जाँच ढकना सावधानी मच्छरदानी कूलर उबला साबुन फ़िल्म बाघ चमत्कार अनुभव सीख प्रचार संगति बपतिस्मा उपदेश ज्योति अंधकार ग्रहण जगत बुरा माथा सचमुच मीटर पेट्रोल क़र्ज़ बेवक़ूफ़ रसीद बारात दूल्हा दुल्हन पुलाव रायता अंगूठी जोड़ा धनिया घी
- **Constructions.** passive (The passive (-ा जाना)); obligation (Obligation (-ना है, -ना चाहिए, -ना पड़ा)); conjunctive-participle (Having done (stem + कर / के)).
- **Cast.** सीता नानी, सुनीता आंटी, Sam, अमन. **Known lemmas before it.** 999. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-21 · #98 · controlled · church-and-mission-life · 1210 words · est. cov. 96.8% · The team's weekly report · टीम की साप्ताहिक रिपोर्ट
- **Document.** `"document": "units/hi-a2-2-21.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** Report register: Sam and Kiran write the weekly report for Pastor Anil: patients seen, visits made, meetings held, money spent, what to pray for; present perfect, passive, कि-clauses.
- **New (13; each used exactly three times).** पोंछना (v: to wipe) ‹for gdl-52› · दर्ज़ी (n: tailor) · पल (n: moment, instant) · बरसात (n: rains, rainy season) · वादा (n: promise) · बाल (n: hair) · मछुआरा (n: fisherman) · खिलाड़ी (n: player, sportsman) · इंसान (n: human being) · सदी (n: century) · गिरजाघर (n: church) · पादरी (n: pastor, priest) · ईसाई (n: Christian)
- **Recycle (30 uses).** चमत्कार अनुभव सीख प्रचार संगति बपतिस्मा उपदेश ज्योति अंधकार ग्रहण जगत बुरा माथा सचमुच मीटर पेट्रोल ट्रैफ़िक क़र्ज़ बेवक़ूफ़ रसीद दाख़िला पाठ्यक्रम निजी क्लास बोली वक़्त भोज बाँटना सजना पैंट
- **Constructions.** present-perfect (Present perfect (-ा है)); passive (The passive (-ा जाना)); complement-ki (कि introduces what was said or known).
- **Cast.** Sam, किरण, पास्टर अनिल. **Known lemmas before it.** 1006. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-22 · #99 · controlled · scripture · 1100 words · est. cov. 97.3% · The son who left (retold) · खोया हुआ बेटा
- **Document.** `"document": "units/hi-a2-2-22.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** Scripture retelling (Luke 15), told by Nani to Aman in her own words, no quotation: the younger son asks for his share, leaves, spends it, a famine, the pigs, his return, the father runs, the feast, the elder brother. Perfective, pluperfect, contrary-to-fact. Needs a Scripture-competent reviewer.
- **New (10; each used exactly three times).** जायदाद +(n: property, estate) · सूअर +(n: pig) · अकाल (n: famine) · परदेस +(n: foreign land) · नाराज़ (adj: angry, displeased) · आनंद (n: joy, bliss) · तेरा (det: your) · मित्र (n: friend) · पापी (n: sinner) · दास (n: slave, servant)
- **Recycle (31 uses).** मीटर पेट्रोल ट्रैफ़िक क़र्ज़ बेवक़ूफ़ रसीद दाख़िला पाठ्यक्रम निजी क्लास बोली वक़्त बारात दूल्हा दुल्हन भोज पुलाव रायता बाँटना सजना अंगूठी जोड़ा धनिया पैंट घी साड़ी वादा सदी गिरजाघर पादरी ईसाई
- **Constructions.** perfective-past (The perfective past (-ा)); pluperfect (Past perfect (-ा था)); contrary-to-fact (A condition that did not happen (-ता … -ता)).
- **Cast.** सीता नानी, अमन. **Known lemmas before it.** 1019. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-23 · #100 · controlled · testimony · 1320 words · est. cov. 97.7% · Why I stayed · मैं क्यों रुका
- **Document.** `"document": "units/hi-a2-2-23.json"`, `kind: "controlled"`, `stage: "a2-2"`, corpus id `ladder-hi`.
- **Situation.** Closing testimony: Sam's reasons for staying (people, work, the language, faith), what he is afraid of, what he hopes for; conditional, contrary-to-fact, relative clauses, the ladder's longest unit.
- **New (10; each used exactly three times).** विदेश (n: foreign country) · पराया (adj: belonging to another, strange) · नगर (n: city, town) · झील (n: lake) · नाव (n: boat) · उत्पन्न (adj: produced, born, arisen) · आराधनालय (n: synagogue) · अशुद्ध (adj: unclean, impure) · बल (n: strength, force) · परेशानी (n: worry, difficulty)
- **Recycle (44 uses).** दाख़िला पाठ्यक्रम निजी क्लास बोली वक़्त बारात दूल्हा दुल्हन भोज पुलाव रायता बाँटना सजना अंगूठी जोड़ा धनिया पैंट घी साड़ी दावत परोसना दही पनीर हिस्सा पोंछना दर्ज़ी पल बरसात वादा बाल मछुआरा खिलाड़ी इंसान गिरजाघर पादरी ईसाई जायदाद सूअर परदेस आनंद मित्र पापी दास
- **Constructions.** conditional (अगर … तो (a condition)); contrary-to-fact (A condition that did not happen (-ता … -ता)); relative-correlative (जो … वह).
- **Cast.** Sam. **Known lemmas before it.** 1029. **Recycling (gate rule) 100.0%.**

#### hi-a2-2-24 · #101 · authentic · narrative · 151 words (measured) · cov. 92.7% · बारिश हो रही छमा छम
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-93-ch01"`, `stage: "a2-2"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 92.7%; never-met lemmas 11 (7.3 per 100 words: above the 5-per-100 warning, expected for an authentic text at 92–95 %).
- **Known lemmas before it.** 1039.

### 3.2.5 Stage b1-bridge (simulated opening; see section 5)

#### hi-b1-bridge-01 · #102 · controlled · narrative · 1200 words · est. cov. 94.8% · Nani reads to the children: three animal tales · नानी बच्चों को कहानियाँ सुनाती हैं
- **Document.** `"document": "units/hi-b1-bridge-01.json"`, `kind: "controlled"`, `stage: "b1-bridge"`, corpus id `ladder-hi`.
- **Situation.** Three short tales told in a row (a tortoise and a hare, a sparrow and a guava, a clever mouse); simple past, repetition, animals' names: the vocabulary of the GDL picture books.
- **New (17; each used exactly three times).** घटना (v: to decrease, to happen) ‹for psa-23› · चराई (n: grazing, pasture) ‹for psa-23› ⚠ bare form read as चराना · सुखदायी (adj: comfortable, giving comfort) ‹for psa-23› · हाथी (n: elephant) · तोता (n: parrot) · मुर्गी (n: hen) · मक्खी (n: fly) · खरगोश (n: rabbit) · पंख (n: wing) · चोंच (n: beak) · चींटी (n: ant) · तितली (n: butterfly) · गिलहरी (n: squirrel) · गौरैया (n: sparrow) · कछुआ (n: tortoise) · सलाह (n: advice) · जोश (n: zeal, passion)
- **Top-up (12 tokens).** use exactly this often, to make an under-met earlier word known: पक्षी×2 नाचना×2 पशु×2 अधिक×2 महत्त्वपूर्ण×2 आवश्यकता×2
- **Recycle (32 uses).** दावत परोसना दही पनीर हिस्सा पोंछना दर्ज़ी पल बरसात वादा बाल मछुआरा खिलाड़ी इंसान सदी पादरी जायदाद अकाल परदेस नाराज़ आनंद तेरा दास विदेश पराया नगर झील उत्पन्न आराधनालय अशुद्ध बल परेशानी
- **Constructions.** perfective-past (The perfective past (-ा)); habitual-past (Habitual past (-ता था)); jab-tab (जब … तब).
- **Cast.** सीता नानी, अमन. **Known lemmas before it.** 1039. **Recycling (gate rule) 100.0%.**

#### hi-b1-bridge-02 · #103 · controlled · explanation · 1200 words · est. cov. 95.5% · Why is the sky blue? Aman asks, Ravi sir explains · आसमान नीला क्यों है?
- **Document.** `"document": "units/hi-b1-bridge-02.json"`, `kind: "controlled"`, `stage: "b1-bridge"`, corpus id `ladder-hi`.
- **Situation.** Question-and-answer explanation: why the sky is blue, why clouds thunder, why the sun sets; क्योंकि / इसलिए, passive, relative clauses.
- **New (18; each used exactly three times).** हिरण (n: deer) ‹for gdl-111› · चुप (adj: silent, quiet) ‹for gdl-111› · नाला (n: drain, stream) ‹for gdl-111› · जलना (v: to burn) ‹for psa-23› · धार्मिकता (n: righteousness) ‹for psa-23› · निमित्त (post: for the sake of, on account of) ‹for psa-23› · तरीक़ा (n: way, method) · मज़ाक़ (n: joke, mockery) · ताली (n: clap, clapping) · सन्नाटा (n: stillness, hush) · मामला (n: matter, affair) · चाँदनी (n: moonlight) · हाल (n: state, condition) · दिखाई (n: sight, visibility) ⚠ bare form read as दिखाना · ख़ुशबू (n: fragrance) · छाँव (n: shade) · खाल (n: skin, hide) · इशारा (n: sign, gesture, hint)
- **Recycle (41 uses).** दावत परोसना दही पनीर हिस्सा पोंछना दर्ज़ी पल बरसात बाल मछुआरा खिलाड़ी इंसान सदी गिरजाघर ईसाई सूअर अकाल नाराज़ तेरा मित्र पापी विदेश पराया नगर झील नाव उत्पन्न आराधनालय अशुद्ध बल परेशानी तोता मुर्गी मक्खी पंख तितली गिलहरी कछुआ सलाह जोश
- **Constructions.** relative-correlative (जो … वह); passive (The passive (-ा जाना)); complement-ki (कि introduces what was said or known).
- **Cast.** अमन, रवि सर, Sam. **Known lemmas before it.** 1062. **Recycling (gate rule) 100.0%.**

#### hi-b1-bridge-03 · #104 · authentic · narrative · 81 words (measured) · cov. 92.6% · वह हँस दिया
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-111-ch01"`, `stage: "b1-bridge"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 92.6%; never-met lemmas 5 (6.2 per 100 words: above the 5-per-100 warning, expected for an authentic text at 92–95 %).
- **Known lemmas before it.** 1080.

#### hi-b1-bridge-04 · #105 · controlled · explanation · 1100 words · est. cov. 93.8% · Why do puris puff up? In the kitchen · पूरी क्यों फूलती है?
- **Document.** `"document": "units/hi-b1-bridge-04.json"`, `kind: "controlled"`, `stage: "b1-bridge"`, corpus id `ladder-hi`.
- **Situation.** Process explanation: what happens to the dough in hot oil; cooking verbs, passive, -कर.
- **New (20; each used exactly three times).** अमरूद (n: guava) ‹for gdl-62› · मनाना (v: to persuade) ‹for gdl-117› · गाजर (n: carrot) ‹for gdl-117› · अगुआई (n: leadership) ‹for psa-23› · घोर (adj: dreadful, severe) ‹for psa-23› · तराई (n: lowland, foothills) ‹for psa-23› · अंडा (n: egg) · सेब (n: apple) · संतरा (n: orange) · अंगूर (n: grape) · पपीता (n: papaya) · तरबूज़ (n: watermelon) · शरबत (n: a cold sweet drink, sherbet) · पूरी (n: puri, fried bread) · जलेबी (n: jalebi, a coiled sweet) · हलवा (n: halwa, a sweet dish) · खीर (n: rice pudding) · आटा (n: flour) · चखना (v: to taste) · भूनना (v: to roast, to fry)
- **Top-up (8 tokens).** use exactly this often, to make an under-met earlier word known: गोद×2 ठोकर×2 सहलाना×2 वरना×2
- **Recycle (46 uses).** जायदाद सूअर अकाल परदेस नाराज़ आनंद तेरा मित्र पापी दास विदेश पराया नगर झील नाव उत्पन्न आराधनालय अशुद्ध बल परेशानी घटना चराई सुखदायी हाथी तोता मुर्गी मक्खी खरगोश पंख तितली गिलहरी कछुआ सलाह जोश तरीक़ा मज़ाक़ ताली सन्नाटा मामला चाँदनी हाल दिखाई ख़ुशबू छाँव खाल इशारा
- **Constructions.** passive (The passive (-ा जाना)); conjunctive-participle (Having done (stem + कर / के)); relative-correlative (जो … वह).
- **Cast.** सीता नानी, अमन, Sam. **Known lemmas before it.** 1081. **Recycling (gate rule) 100.0%.**

#### hi-b1-bridge-05 · #106 · authentic · narrative · 443 words (measured) · cov. 92.6% · गौरैया और अमरूद
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-62-ch01"`, `stage: "b1-bridge"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 92.6%; never-met lemmas 20 (4.5 per 100 words).
- **Known lemmas before it.** 1105.

#### hi-b1-bridge-06 · #107 · controlled · contemporary-nonfiction · 1200 words · est. cov. 95.3% · A day on a village farm · गाँव के खेत में एक दिन
- **Document.** `"document": "units/hi-b1-bridge-06.json"`, `kind: "controlled"`, `stage: "b1-bridge"`, corpus id `ladder-hi`.
- **Situation.** Contemporary nonfiction: a farm day: the cow, the plough, the water, the harvest; passive, habitual present, जितना … उतना.
- **New (16; each used exactly three times).** मूली (n: radish) ‹for gdl-117› · पीठ (n: back) ‹for gdl-26› · बिठाना (v: to seat) ‹for gdl-26› · हानि (n: loss, harm) ‹for psa-23› · सोंटा (n: club, stick) ‹for psa-23› · लाठी (n: stick, staff) ‹for psa-23› · मेंढक (n: frog) · मोर (n: peacock) · कीड़ा (n: insect, worm) · देश (n: country, nation) · मधुमक्खी (n: honeybee) · उल्लू (n: owl) · रेत (n: sand) · धरती (n: earth, ground) · सोता (n: spring, source of water) ⚠ bare form read as सोना · क़स्बा (n: small town)
- **Top-up (8 tokens).** use exactly this often, to make an under-met earlier word known: दबाना×2 दुखी×2 उपाय×2 इरादा×2
- **Recycle (46 uses).** घटना चराई सुखदायी हाथी तोता मुर्गी मक्खी खरगोश पंख तितली गिलहरी कछुआ सलाह जोश हिरण नाला जलना धार्मिकता निमित्त तरीक़ा मज़ाक़ ताली सन्नाटा मामला चाँदनी हाल दिखाई ख़ुशबू छाँव खाल इशारा गाजर अंडा सेब संतरा अंगूर पपीता तरबूज़ शरबत पूरी जलेबी हलवा खीर आटा चखना भूनना
- **Constructions.** passive (The passive (-ा जाना)); habitual-present (Habitual present (-ता है)); jitna-utna (जितना … उतना).
- **Cast.** Sam, सुरेश. **Known lemmas before it.** 1110. **Recycling (gate rule) 100.0%.**

#### hi-b1-bridge-07 · #108 · authentic (Scripture) · scripture · 124 words (measured) · cov. 92.7% · भजन संहिता 23 (Psalm 23)
- **Text.** `"kind": "authentic", "textId": "text:hi:bible-psa-23"`, `stage: "b1-bridge"` (IRV Hindi 2019, CC BY-SA 4.0 via eBible.org). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 92.7%; never-met lemmas 9 (7.3 per 100 words: above the 5-per-100 warning, expected for an authentic text at 92–95 %).
- **Known lemmas before it.** 1130.

#### hi-b1-bridge-08 · #109 · controlled · narrative · 1200 words · est. cov. 94.5% · The city bus: lost and found · शहर की बस: खोया और पाया
- **Document.** `"document": "units/hi-b1-bridge-08.json"`, `kind: "controlled"`, `stage: "b1-bridge"`, corpus id `ladder-hi`.
- **Situation.** Narrative: a lost bag on the city bus and the people who help; pluperfect, conditional.
- **New (16; each used exactly three times).** समाचार (n: news) ‹for gdl-96› · इज़्ज़त (n: honour, respect) ‹for gdl-96› · कॉफ़ी (n: coffee) ‹for gdl-96› · दुष्टात्मा (n: evil spirit) ‹for mrk-1› · सुधारना (v: to improve, to correct) ‹for mrk-1› · विषय (n: subject, topic) ‹for mrk-1› · इस्तेमाल (n: use, usage) · जहाज़ (n: ship) · ज़िद (n: stubbornness, insistence) · रेल (n: railway, train) · दुख (n: sorrow, grief, pain) ⚠ bare form read as दुखना · धुन (n: tune) · मंज़िल (n: destination) · ज़िम्मेदारी (n: responsibility) · हैरानी (n: astonishment, surprise) · उड़ान (n: flight)
- **Top-up (18 tokens).** use exactly this often, to make an under-met earlier word known: सताना×2 कटोरा×2 बिछाना×2 मलना×2 उमड़ना×2 करुणा×2 निश्चय×2 भलाई×2 धाम×2
- **Recycle (54 uses).** चुप नाला जलना धार्मिकता निमित्त तरीक़ा मज़ाक़ ताली सन्नाटा मामला चाँदनी हाल दिखाई ख़ुशबू छाँव खाल इशारा गाजर अगुआई घोर तराई अंडा सेब संतरा अंगूर पपीता तरबूज़ शरबत पूरी जलेबी हलवा खीर आटा चखना भूनना मूली पीठ बिठाना हानि सोंटा लाठी मेंढक मोर कीड़ा देश×2 मधुमक्खी उल्लू रेत धरती सोता×2 क़स्बा×2
- **Constructions.** pluperfect (Past perfect (-ा था)); perfective-past (The perfective past (-ा)); conditional (अगर … तो (a condition)).
- **Cast.** Sam, अमन, दीपक. **Known lemmas before it.** 1130. **Recycling (gate rule) 100.0%.**

#### hi-b1-bridge-09 · #110 · authentic (Scripture) · scripture · 880 words (measured) · cov. 92.6% · मरकुस 1 (Mark 1)
- **Text.** `"kind": "authentic", "textId": "text:hi:bible-mrk-1"`, `stage: "b1-bridge"` (IRV Hindi 2019, CC BY-SA 4.0 via eBible.org). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 92.6%; never-met lemmas 63 (7.2 per 100 words: above the 5-per-100 warning, expected for an authentic text at 92–95 %).
- **Known lemmas before it.** 1155.

#### hi-b1-bridge-10 · #111 · controlled · biography · 1300 words · est. cov. 93.3% · A famous sportsman (a short biography) · एक मशहूर खिलाड़ी की कहानी
- **Document.** `"document": "units/hi-b1-bridge-10.json"`, `kind: "controlled"`, `stage: "b1-bridge"`, corpus id `ladder-hi`.
- **Situation.** Biography with dates: a hockey player from childhood to fame; passive, pluperfect, habitual past (the course writes its own text; the GDL book is a separate authentic unit).
- **New (20; each used exactly three times).** ज़रूरी (adj: necessary, important) ‹for gdl-26› · गूँधना (v: to knead) ‹for gdl-91› · बेलना (v: to roll out) ‹for gdl-91› · आदि (adv: and so on, etcetera) ‹for jhn-1› · पन्ना (n: page, leaf of paper) · जलन (n: burning) · जीत (n: victory, win) ⚠ bare form read as जीतना · अंग्रेज़ी (n: English) · सज़ा (n: punishment, sentence) · तकलीफ़ (n: pain, trouble, suffering) · हार (n: defeat) ⚠ bare form read as हारना · बुढ़िया (n: old woman) · पीढ़ी (n: generation) · अगस्त (n: August) · ईद (n: Eid) · तारीफ़ (n: praise, compliment) · क़िस्मत (n: fate, luck) · फ़रवरी (n: February) · दुश्मन (n: enemy) · नफ़रत (n: hatred)
- **Top-up (27 tokens).** use exactly this often, to make an under-met earlier word known: आस×1 फैलना×2 पुस्तक×2 फैलाना×2 प्रकार×2 झुकना×2 पुकारना×2 डूबना×2 रूप×2 दुखना×2 आकाश×2 आश्चर्य×2 टहलना×2 घुटना×2
- **Recycle (62 uses).** मनाना गाजर अगुआई घोर तराई अंडा सेब संतरा अंगूर पपीता तरबूज़ शरबत पूरी जलेबी हलवा खीर आटा चखना भूनना मूली×2 पीठ×2 बिठाना×2 हानि सोंटा लाठी मेंढक×2 मोर×2 कीड़ा×2 देश मधुमक्खी×2 उल्लू×2 रेत×2 धरती×2 सोता क़स्बा समाचार इज़्ज़त कॉफ़ी इस्तेमाल जहाज़ ज़िद रेल दुख×2 धुन×2 मंज़िल ज़िम्मेदारी×2 हैरानी×2 उड़ान
- **Constructions.** pluperfect (Past perfect (-ा था)); habitual-past (Habitual past (-ता था)); passive (The passive (-ा जाना)).
- **Cast.** रवि सर, अमन. **Known lemmas before it.** 1155. **Recycling (gate rule) 100.0%.**

#### hi-b1-bridge-11 · #112 · authentic (Scripture) · scripture · 1022 words (measured) · cov. 92.6% · यूहन्ना 1 (John 1)
- **Text.** `"kind": "authentic", "textId": "text:hi:bible-jhn-1"`, `stage: "b1-bridge"` (IRV Hindi 2019, CC BY-SA 4.0 via eBible.org). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 92.6%; never-met lemmas 47 (4.6 per 100 words).
- **Known lemmas before it.** 1189.

#### hi-b1-bridge-12 · #113 · authentic · narrative · 315 words (measured) · cov. 92.7% · मुझे वो वाला चाहिये!
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-98-ch01"`, `stage: "b1-bridge"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 92.7%; never-met lemmas 10 (3.2 per 100 words).
- **Known lemmas before it.** 1192.

#### hi-b1-bridge-13 · #114 · controlled · contemporary-nonfiction · 1300 words · est. cov. 93.9% · The road to freedom (a short history) · आज़ादी की ओर
- **Document.** `"document": "units/hi-b1-bridge-13.json"`, `kind: "controlled"`, `stage: "b1-bridge"`, corpus id `ladder-hi`.
- **Situation.** Simple history: how India became independent; passive, pluperfect, relative clauses; digits for years.
- **New (18; each used exactly three times).** समझदार (adj: sensible, wise) ‹for gdl-80› · चादर (n: sheet, cloth) ‹for gdl-80› · पीला (adj: yellow) ‹for gdl-80› · पहिया (n: wheel) · पार्क (n: park) · चौक (n: square, crossing) · डाकू (n: robber, bandit) · सिनेमा (n: cinema) · लड़ाई (n: fight, battle, war) · सवेरा (n: morning, early morning) · सहेली (n: a girl's friend) · पगडंडी (n: footpath) · पहाड़ी (n: hill) · मार्च (n: March) · जनवरी (n: January) · अप्रैल (n: April) · जुलाई (n: July) · नवंबर (n: November)
- **Top-up (25 tokens).** use exactly this often, to make an under-met earlier word known: शरीर×2 खींचना×2 भूरा×1 व्यक्ति×2 तला×1 सच्चा×2 कहलाना×2 कड़ा×2 कमर×2 सूर्य×2 गिराना×2 ख़राब×2 जन×1 प्रदेश×2
- **Recycle (48 uses).** समाचार×2 इज़्ज़त×2 कॉफ़ी×2 सुधारना इस्तेमाल×2 जहाज़×2 ज़िद×2 रेल×2 दुख धुन मंज़िल×2 ज़िम्मेदारी हैरानी उड़ान×2 गूँधना बेलना पन्ना जलन जीत अंग्रेज़ी सज़ा×2 तकलीफ़ हार बुढ़िया×2 पीढ़ी×2 अगस्त×2 ईद×2 तारीफ़ क़िस्मत फ़रवरी×2 दुश्मन×2 नफ़रत
- **Constructions.** passive (The passive (-ा जाना)); pluperfect (Past perfect (-ा था)); relative-correlative (जो … वह).
- **Cast.** रवि सर, Sam. **Known lemmas before it.** 1194.

#### hi-b1-bridge-14 · #115 · authentic · narrative · 133 words (measured) · cov. 93.2% · सोना सयानी
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-121-ch01"`, `stage: "b1-bridge"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.2%; never-met lemmas 6 (4.5 per 100 words).
- **Known lemmas before it.** 1226.

#### hi-b1-bridge-15 · #116 · controlled · narrative · 1000 words · est. cov. 93.3% · The shepherd and the sheep (preparing for the Psalms) · चरवाहा और भेड़ें
- **Document.** `"document": "units/hi-b1-bridge-15.json"`, `kind: "controlled"`, `stage: "b1-bridge"`, corpus id `ladder-hi`.
- **Situation.** Narrative: a shepherd, his sheep, a valley and a storm; the course's own words, preparing the words of Psalm 23, Mark 1 and John 1 (not a quotation).
- **New (16; each used exactly three times).** गर्म (adj: hot, warm) ‹for gdl-91› · सुनहरा (adj: golden) ‹for gdl-91› · मिलाना (v: to mix, to join) ‹for gdl-91› · झूठ (n: lie, falsehood) · जवानी (n: youth) · अच्छाई (n: goodness) · बुढ़ापा (n: old age) · ख़ुदा (n: God) · कब्र (n: grave, tomb) · छुटकारा (n: release, deliverance) · बुराई (n: evil, wickedness) · धोखा (n: deception, deceit) · गवाह (n: witness) · नबी (n: prophet) · क्रूस (n: cross) · मसीही (n: Christian)
- **Top-up (19 tokens).** use exactly this often, to make an under-met earlier word known: व्यवस्था×1 ऊँट×2 कबूतर×1 वन×2 मुरझाना×2 शैतान×2 सब्त×2 नाश×2 कोढ़ी×2 याजक×1 लहू×2
- **Recycle (81 uses).** ज़रूरी गूँधना×2 बेलना×2 आदि पन्ना×2 जलन जीत अंग्रेज़ी×2 सज़ा तकलीफ़×2 हार बुढ़िया पीढ़ी अगस्त ईद तारीफ़×2 क़िस्मत×2 फ़रवरी दुश्मन नफ़रत×2 समझदार×3 चादर×3 पीला×3 पहिया×2 पार्क×3 चौक×3 डाकू×3 सिनेमा×3 लड़ाई×3 सवेरा×3 सहेली×3 पगडंडी×3 पहाड़ी×3 मार्च×3 जनवरी×3 अप्रैल×3 जुलाई×3 नवंबर×3
- **Constructions.** subjunctive (The subjunctive); perfective-past (The perfective past (-ा)); conditional (अगर … तो (a condition)).
- **Cast.** सीता नानी, अमन, पास्टर अनिल. **Known lemmas before it.** 1227.

#### hi-b1-bridge-16 · #117 · authentic · narrative · 391 words (measured) · cov. 93.1% · कछुआ और खरगोश
- **Text.** `"kind": "authentic", "textId": "text:hi:gdl-26-ch01"`, `stage: "b1-bridge"` (Global Digital Library, CC BY 4.0, shelf c1). Placed as it is; no edit.
- **Measured here (plan order).** coverage ≥ 3 encounters 93.1%; never-met lemmas 24 (6.1 per 100 words: above the 5-per-100 warning, expected for an authentic text at 92–95 %).
- **Known lemmas before it.** 1254.



## 4. Authentic units: the GDL books and Scripture

### 4.1 Method *(measured and simulated)*

For every library text the planner computed, with the real adapter, the share of its running words whose first-reading lemma (proper nouns and numerals known) had been met at least three times in the texts before it. Before the ladder (Stage 0 and the drafts) that gives the audit's figures; after each planned unit it gives the *simulated* figure, in which a controlled unit adds three encounters of each of its new lemmas and the in-place and authentic texts add their real counts. A book is *readable* at the first unit after which it reaches 92 % (the gate's authentic warning line); the contract's `ladder:place` uses 95 %. **"Ceiling"** is the same share if every lemma of the word list were known: the most a text can reach until the list grows. Placement rules used: a2-1 and a2-2 only (no authentic text before a2-1), at most two books in a row and only the shorter if two, 92.5 % or better when placed, John 14 and the other chapters of Scripture only after the units that teach their words.

### 4.2 The twenty easiest books

Easiest = highest ceiling (ties: shortest). All are shelf c1 (GDL, CC BY 4.0). "After Stage 0 + drafts" is the audit's baseline (82.3 % best, median 58.5 % over the 92 books in this measurement; the audit says 57 %):

| book (text id) | title | words | ceiling (all listed words known) | after Stage 0 + drafts (audit) | end of a1-2 | end of a2-1 | end of a2-2 | in the plan |
|---|---|---:|---:|---:|---:|---:|---:|---|
| gdl-20 | एक था मोटा राजा | 81 | 98.8% | 59.3% | 81.5% | 95.1% | 95.1% | **placed: hi-a2-1-05** (95.1%) |
| gdl-111 | वह हँस दिया | 81 | 97.5% | 60.5% | 71.6% | 81.5% | 84.0% | **placed: hi-b1-bridge-03** (92.6%) |
| gdl-104 | मेरे दोस्त | 79 | 97.5% | 82.3% | 86.1% | 93.7% | 94.9% | **placed: hi-a2-1-03** (93.7%) |
| gdl-63 | घर जाना है | 318 | 97.2% | 66.7% | 85.5% | 93.1% | 93.4% | **placed: hi-a2-1-09** (92.8%) |
| gdl-64 | चलो किताबें खरीदने | 294 | 96.6% | 75.2% | 89.8% | 93.9% | 95.2% | **placed: hi-a2-1-07** (93.2%) |
| gdl-122 | स्कूल का पहला दिन | 212 | 96.2% | 71.7% | 88.2% | 94.3% | 95.8% | **placed: hi-a2-2-02** (94.3%) |
| gdl-93 | बारिश हो रही छमा छम | 151 | 96.0% | 61.6% | 82.1% | 91.4% | 92.7% | **placed: hi-a2-2-24** (92.7%) |
| gdl-1 | अभी नहीं, अभी नहीं! | 171 | 95.9% | 65.5% | 88.3% | 93.6% | 93.6% | **placed: hi-a2-1-10** (93.6%) |
| gdl-3 | अम्मा जब स्कूल गयीं | 265 | 95.8% | 72.1% | 84.9% | 92.8% | 94.0% | **placed: hi-a2-1-12** (92.8%) |
| gdl-62 | गौरैया और अमरूद | 443 | 95.7% | 64.6% | 76.1% | 83.1% | 84.9% | **placed: hi-b1-bridge-05** (92.6%) |
| gdl-121 | सोना सयानी | 133 | 95.5% | 68.4% | 87.2% | 91.7% | 92.5% | **placed: hi-b1-bridge-14** (93.2%) |
| gdl-79 | दीदी का रंग बिरंगा खज़ाना | 432 | 95.1% | 66.2% | 85.9% | 91.7% | 93.3% | **placed: hi-a2-2-10** (93.3%) |
| gdl-66 | चाचा की शादी | 313 | 94.9% | 68.7% | 90.1% | 93.9% | 93.9% | **placed: hi-a2-2-06** (93.9%) |
| gdl-101 | मेरा घर | 127 | 94.5% | 66.1% | 82.7% | 92.1% | 92.9% | **placed: hi-a2-2-19** (92.9%) |
| gdl-77 | थोड़ी सी मदद | 2112 | 94.5% | 66.2% | 82.3% | 88.0% | 91.2% | not within the plan |
| gdl-96 | मछली ने समाचार सुने | 423 | 94.3% | 60.8% | 72.8% | 83.0% | 84.4% | not within the plan |
| gdl-98 | मुझे वो वाला चाहिये! | 315 | 94.3% | 63.2% | 80.3% | 90.2% | 91.1% | **placed: hi-b1-bridge-12** (92.7%) |
| gdl-105 | मैं नहीं डरती ! | 103 | 94.2% | 77.7% | 90.3% | 94.2% | 94.2% | **placed: hi-a2-2-03** (94.2%) |
| gdl-110 | लाल बरसाती | 262 | 93.5% | 63.0% | 82.1% | 88.5% | 89.7% | not within the plan |
| gdl-117 | सैर सपाटा | 119 | 93.3% | 55.5% | 63.9% | 73.9% | 81.5% | not within the plan |

Books short of the line at the end of a2-2 need 1–10 lemmas, almost all names, loans or story words (examples in 4.3); **gdl-77** (2,112 words) and **gdl-96** reach 88–91 % and are a b1 matter. The picture books are short (59–500 words), so their shape is "authentic text in a unit of its own, between two core units", not "a unit built from a book".

### 4.3 Vocabulary scheduling: what the easiest books ask for, and where the plan teaches it

The 80 lemmas found in most of the 20 easiest books (books containing it / tokens), with the unit number (#) after which the plan makes it known (S0 = known after Stage 0 alone, never = not in the plan):

होना (20/595, S0) · का (19/233, S0) · रहना (19/82, #6) · जाना (18/144, S0) · और (17/93, S0) · मैं (16/174, S0) · में (16/114, S0) · आना (16/75, #11) · करना (15/115, S0) · भी (15/74, S0) · वह (14/128, S0) · नहीं (14/110, S0) · से (14/105, #21) · ने (14/78, #31) · लगना (14/65, #6) · को (14/63, S0) · कुछ (14/51, #28) · बहुत (14/47, S0) · लेना (14/45, S0) · पर (14/44, S0) · बड़ा (14/33, #1) · मेरा (13/69, S0) · यह (12/58, S0) · तो (12/49, #34) · दिन (12/24, #34) · दौड़ना (12/20, #50) · कहना (11/69, #19) · देखना (11/29, #22) · तुम (10/67, #27) · वे (10/43, #46) · देना (10/32, #22) · माँ (10/30, #3) · साथ (10/16, #22) · तक (10/12, #37) · लेकिन (9/32, #11) · बच्चा (9/30, #23) · बोलना (9/28, S0) · जब (9/21, #34) · पड़ना (9/18, #39) · अब (9/18, #31) · कि (8/69, #44) · ही (8/41, #53) · क्या (8/41, S0) · सब (8/30, #12) · पास (8/27, #20) · अपना (8/24, #20) · उनका (8/20, #55) · चलना (8/19, #11) · खाना (8/17, #6) · वहाँ (8/14, #31) · पीछे (8/12, #31) · हम (7/46, S0) · कोई (7/29, #39) · जो (7/25, #58) · न (7/23, #57) · लिए (7/22, #31) · घर (7/20, S0) · उसका (7/18, #22) · अच्छा (7/18, #2) · छोटा (7/15, #5) · फिर (7/13, #35) · सारा (7/11, #39) · सभी (7/11, #50) · बैठना (7/10, #23) · उठाना (7/8, #32) · बात (6/26, #26) · वाला (6/21, #56) · अभी (6/21, #53) · हमारा (6/17, #42) · आज (6/16, S0) · चाहना (6/15, #39) · बाद (6/15, #37) · मिलना (6/13, #34) · तरह (6/9, #59) · कपड़ा (6/8, #50) · कुर्सी (6/6, S0) · हाथ (5/30, #44) · स्कूल (5/25, S0) · दोस्त (5/19, #6) · सकना (5/19, #37)

Listed words of these 20 books that the plan does **not** teach (1 shown, those in 2 books or ≥ 4 tokens): छीनना

Forms of these 20 books with no reading in the word list (names, colloquial and loan forms; ≥ 4 tokens): मुस्कराना (6) ना (5) पिकनिक (4) वो (10) दादाजी (5) मम्मी (4) बक्सा (4) बिल्कुल (4) मनु (11) मुखिया (7) हेलना (6) अ (5) ब (5) स (5) अँक (5) कँटीली (4) सुमी (4)

The planner scheduled the **finishing lemmas** of each near-ready book (1–3 words, marked ‹for gdl-NN› in the unit blocks) into the units just before the placement, and gave the units the Bible words that John 14, Mark 1, John 1 and Psalm 23 ask for (‹for john-14› etc.).

### 4.4 Placements in this plan

| unit | text id | title | words | stage | cov. when placed | never-met lemmas (per 100) | earliest unit it could have entered (≥ 92 %) |
|---|---|---|---:|---|---:|---|---|
| hi-a2-1-03 (#60) | text:hi:gdl-104-ch01 | मेरे दोस्त | 79 | a2-1 | 93.7% | 5 (6.3) | hi-a2-1-01 |
| hi-a2-1-05 (#62) | text:hi:gdl-20-ch01 | एक था मोटा राजा | 81 | a2-1 | 95.1% | 4 (4.9) | hi-a2-1-04 |
| hi-a2-1-07 (#64) | text:hi:gdl-64-ch01 | चलो किताबें खरीदने | 294 | a2-1 | 93.2% | 15 (5.1) | hi-a2-1-02 |
| hi-a2-1-09 (#66) | text:hi:gdl-63-ch01 | घर जाना है | 318 | a2-1 | 92.8% | 22 (6.9) | hi-a2-1-06 |
| hi-a2-1-10 (#67) | text:hi:gdl-1-ch01 | अभी नहीं, अभी नहीं! | 171 | a2-1 | 93.6% | 7 (4.1) | hi-a2-1-08 |
| hi-a2-1-12 (#69) | text:hi:gdl-3-ch01 | अम्मा जब स्कूल गयीं | 265 | a2-1 | 92.8% | 16 (6.0) | hi-a2-1-08 |
| hi-a2-2-02 (#79) | text:hi:gdl-122-ch01 | स्कूल का पहला दिन | 212 | a2-2 | 94.3% | 7 (3.3) | hi-a2-1-13 |
| hi-a2-2-03 (#80) | text:hi:gdl-105-ch01 | मैं नहीं डरती ! | 103 | a2-2 | 94.2% | 4 (3.9) | hi-a2-1-04 |
| hi-a2-2-05 (#82) | text:hi:bible-jhn-14 | यूहन्ना 14 (John 14) | 747 | a2-2 | 92.5% | 34 (4.6) | hi-a2-2-04 |
| hi-a2-2-06 (#83) | text:hi:gdl-66-ch01 | चाचा की शादी | 313 | a2-2 | 93.9% | 11 (3.5) | hi-a2-1-01 |
| hi-a2-2-07 (#84) | text:hi:gdl-65-ch01 | चाँद का तोहफ़ा | 147 | a2-2 | 92.5% | 10 (6.8) | hi-a2-2-04 |
| hi-a2-2-10 (#87) | text:hi:gdl-79-ch01 | दीदी का रंग बिरंगा खज़ाना | 432 | a2-2 | 93.3% | 26 (6.0) | hi-a2-2-09 |
| hi-a2-2-19 (#96) | text:hi:gdl-101-ch01 | मेरा घर | 127 | a2-2 | 92.9% | 9 (7.1) | hi-a2-1-16 |
| hi-a2-2-24 (#101) | text:hi:gdl-93-ch01 | बारिश हो रही छमा छम | 151 | a2-2 | 92.7% | 11 (7.3) | hi-a2-2-04 |
| hi-b1-bridge-03 (#104) | text:hi:gdl-111-ch01 | वह हँस दिया | 81 | b1-bridge | 92.6% | 5 (6.2) | hi-b1-bridge-02 |
| hi-b1-bridge-05 (#106) | text:hi:gdl-62-ch01 | गौरैया और अमरूद | 443 | b1-bridge | 92.6% | 20 (4.5) | hi-b1-bridge-04 |
| hi-b1-bridge-07 (#108) | text:hi:bible-psa-23 | भजन संहिता 23 (Psalm 23) | 124 | b1-bridge | 92.7% | 9 (7.3) | hi-b1-bridge-06 |
| hi-b1-bridge-09 (#110) | text:hi:bible-mrk-1 | मरकुस 1 (Mark 1) | 880 | b1-bridge | 92.6% | 63 (7.2) | hi-b1-bridge-08 |
| hi-b1-bridge-11 (#112) | text:hi:bible-jhn-1 | यूहन्ना 1 (John 1) | 1022 | b1-bridge | 92.6% | 47 (4.6) | hi-b1-bridge-10 |
| hi-b1-bridge-12 (#113) | text:hi:gdl-98-ch01 | मुझे वो वाला चाहिये! | 315 | b1-bridge | 92.7% | 10 (3.2) | hi-b1-bridge-04 |
| hi-b1-bridge-14 (#115) | text:hi:gdl-121-ch01 | सोना सयानी | 133 | b1-bridge | 93.2% | 6 (4.5) | hi-a2-2-04 |
| hi-b1-bridge-16 (#117) | text:hi:gdl-26-ch01 | कछुआ और खरगोश | 391 | b1-bridge | 93.1% | 24 (6.1) | hi-b1-bridge-10 |

"Earliest unit it could have entered" is the first unit after which the simulated coverage is ≥ 92 %; the plan places later than that when a stage quota or the two-in-a-row rule is in the way, and the drafting agents may move a book earlier or later within its stage without changing any other unit (a placed book adds its own words to the later coverage: moving a book by more than three units needs the plan re-run).

### 4.5 All 92 books: where each becomes readable

(ceiling and "now" as above; ≥ 92 % / ≥ 95 % "first after" refer to this plan's units; the last columns are the simulated coverage after a2-2 and after the b1 opening **with the book itself left out**, so that placed books show what the units before them gave; sorted by the last):

| text id | title | words | ceiling | now (S0 + drafts) | ≥ 92 % first after | ≥ 95 % first after | cov. end of a2-2 | cov. end of b1 (simulated) | status in this plan |
|---|---|---:|---:|---:|---|---|---:|---:|---|
| gdl-64 | चलो किताबें खरीदने | 294 | 96.6% | 75.2% | hi-a2-1-02 | hi-a2-2-07 | 95.2% | 97.6% | placed: hi-a2-1-07 |
| gdl-20 | एक था मोटा राजा | 81 | 98.8% | 59.3% | hi-a2-1-04 | hi-a2-1-04 | 95.1% | 97.5% | placed: hi-a2-1-05 |
| gdl-122 | स्कूल का पहला दिन | 212 | 96.2% | 71.7% | hi-a2-1-13 | hi-a2-2-07 | 95.8% | 96.7% | placed: hi-a2-2-02 |
| gdl-111 | वह हँस दिया | 81 | 97.5% | 60.5% | hi-b1-bridge-02 | hi-b1-bridge-11 | 84.0% | 95.1% | placed: hi-b1-bridge-03 |
| gdl-104 | मेरे दोस्त | 79 | 97.5% | 82.3% | hi-a2-1-01 | — | 94.9% | 94.9% | placed: hi-a2-1-03 |
| gdl-63 | घर जाना है | 318 | 97.2% | 66.7% | hi-a2-1-06 | — | 93.4% | 94.7% | placed: hi-a2-1-09 |
| gdl-3 | अम्मा जब स्कूल गयीं | 265 | 95.8% | 72.1% | hi-a2-1-08 | — | 94.0% | 94.3% | placed: hi-a2-1-12 |
| gdl-105 | मैं नहीं डरती ! | 103 | 94.2% | 77.7% | hi-a2-1-04 | — | 94.2% | 94.2% | placed: hi-a2-2-03 |
| gdl-1 | अभी नहीं, अभी नहीं! | 171 | 95.9% | 65.5% | hi-a2-1-08 | — | 93.6% | 94.2% | placed: hi-a2-1-10 |
| gdl-66 | चाचा की शादी | 313 | 94.9% | 68.7% | hi-a2-1-01 | — | 93.9% | 93.9% | placed: hi-a2-2-06 |
| gdl-79 | दीदी का रंग बिरंगा खज़ाना | 432 | 95.1% | 66.2% | hi-a2-2-09 | — | 93.3% | 93.8% | placed: hi-a2-2-10 |
| gdl-101 | मेरा घर | 127 | 94.5% | 66.1% | hi-a2-1-16 | — | 92.9% | 93.7% | placed: hi-a2-2-19 |
| gdl-93 | बारिश हो रही छमा छम | 151 | 96.0% | 61.6% | hi-a2-2-04 | — | 92.7% | 93.4% | placed: hi-a2-2-24 |
| gdl-121 | सोना सयानी | 133 | 95.5% | 68.4% | hi-a2-2-04 | — | 92.5% | 93.2% | placed: hi-b1-bridge-14 |
| gdl-26 | कछुआ और खरगोश | 391 | 92.6% | 52.2% | hi-b1-bridge-10 | — | 81.1% | 93.1% | placed: hi-b1-bridge-16 |
| gdl-98 | मुझे वो वाला चाहिये! | 315 | 94.3% | 63.2% | hi-b1-bridge-04 | — | 91.1% | 92.7% | placed: hi-b1-bridge-12 |
| gdl-62 | गौरैया और अमरूद | 443 | 95.7% | 64.6% | hi-b1-bridge-04 | — | 84.9% | 92.6% | placed: hi-b1-bridge-05 |
| gdl-65 | चाँद का तोहफ़ा | 147 | 93.2% | 61.9% | hi-a2-2-04 | — | 92.5% | 92.5% | placed: hi-a2-2-07 |
| gdl-77 | थोड़ी सी मदद | 2112 | 94.5% | 66.2% | — | — | 91.2% | 91.9% | needs more lemmas |
| gdl-96 | मछली ने समाचार सुने | 423 | 94.3% | 60.8% | — | — | 84.4% | 91.0% | needs more lemmas |
| gdl-110 | लाल बरसाती | 262 | 93.5% | 63.0% | — | — | 89.7% | 90.8% | needs more lemmas |
| gdl-36 | कहानियों का शहर | 1209 | 93.1% | 63.6% | — | — | 90.1% | 90.7% | needs more lemmas |
| gdl-69 | चुलबुल की पूँछ | 782 | 93.1% | 62.5% | — | — | 89.4% | 90.4% | needs more lemmas |
| gdl-70 | चूहा सिकंदर, घर के अंदर | 307 | 92.2% | 58.0% | — | — | 88.3% | 90.2% | needs more lemmas |
| gdl-75 | टिमी और पेपे | 212 | 92.5% | 67.5% | — | — | 89.2% | 90.1% | needs more lemmas |
| gdl-54 | खोया पाया | 161 | 92.5% | 73.9% | — | — | 89.4% | 90.1% | needs more lemmas |
| gdl-117 | सैर सपाटा | 119 | 93.3% | 55.5% | — | — | 81.5% | 89.9% | needs more lemmas |
| gdl-80 | दीदी, दीदी, आकाश का रंग नीला क्यों | 990 | 92.9% | 55.1% | — | — | 84.9% | 89.5% | needs more lemmas |
| gdl-91 | पूरी क्यों फूलती है? | 1351 | 92.0% | 57.3% | — | — | 80.2% | 89.5% | needs more lemmas |
| gdl-42 | कहानी- बादल की सैर | 122 | 91.8% | 66.4% | — | — | 87.7% | 89.3% | ceiling 88–92 %: needs word-list additions |
| gdl-52 | क्यों भई क्यों? | 65 | 92.3% | 58.5% | — | — | 87.7% | 89.2% | needs more lemmas |
| gdl-78 | दाल का दाना | 498 | 91.6% | 60.0% | — | — | 82.7% | 88.8% | ceiling 88–92 %: needs word-list additions |
| gdl-84 | नानी की ऐनक | 327 | 91.4% | 63.6% | — | — | 88.4% | 88.7% | ceiling 88–92 %: needs word-list additions |
| gdl-6 | अवनि और मटर का पौधा | 370 | 90.8% | 57.8% | — | — | 85.1% | 87.8% | ceiling 88–92 %: needs word-list additions |
| gdl-32 | कहाँ गया गोगो? | 201 | 86.6% | 63.7% | — | — | 81.1% | 87.1% | library, not ladder |
| gdl-107 | मोरू एक पहेली | 2096 | 91.3% | 62.3% | — | — | 85.2% | 86.6% | ceiling 88–92 %: needs word-list additions |
| gdl-118 | सो जाओ टिंकु! | 495 | 90.3% | 62.6% | — | — | 85.3% | 86.5% | ceiling 88–92 %: needs word-list additions |
| gdl-106 | मोटा राजा दुबला कुत्ता | 59 | 86.4% | 45.8% | — | — | 86.4% | 86.4% | library, not ladder |
| gdl-86 | नौका की सैर | 412 | 90.8% | 60.9% | — | — | 84.0% | 86.2% | ceiling 88–92 %: needs word-list additions |
| gdl-14 | उड़ते उड़ते | 223 | 87.0% | 63.7% | — | — | 83.4% | 86.1% | library, not ladder |
| gdl-56 | गरजे बादल नाचे मोर | 404 | 88.4% | 59.2% | — | — | 83.2% | 85.9% | ceiling 88–92 %: needs word-list additions |
| gdl-94 | भबलू भालू की सैर | 1808 | 89.9% | 55.7% | — | — | 85.0% | 85.8% | ceiling 88–92 %: needs word-list additions |
| gdl-83 | नन्हे मददगार | 217 | 92.2% | 54.4% | — | — | 85.3% | 85.7% | needs more lemmas |
| gdl-120 | सोना बड़ी सयानी | 229 | 90.0% | 67.7% | — | — | 83.4% | 85.6% | ceiling 88–92 %: needs word-list additions |
| gdl-28 | कबाड़ी वाला | 331 | 88.2% | 57.4% | — | — | 84.6% | 85.5% | ceiling 88–92 %: needs word-list additions |
| gdl-102 | मेरा दोस्त | 508 | 86.6% | 62.2% | — | — | 80.7% | 84.8% | library, not ladder |
| gdl-81 | दीदी, दीदी, बादल क्यों गरजते हैं? | 1226 | 87.7% | 55.1% | — | — | 82.4% | 84.7% | library, not ladder |
| gdl-87 | पपलू राक्षस | 1407 | 89.5% | 60.8% | — | — | 83.4% | 84.6% | ceiling 88–92 %: needs word-list additions |
| gdl-24 | कचरे का बादल | 845 | 85.2% | 57.5% | — | — | 81.5% | 84.6% | library, not ladder |
| gdl-108 | रीति और मिठु | 1326 | 85.6% | 61.2% | — | — | 82.3% | 84.5% | library, not ladder |
| gdl-50 | क्या देखती है अनु? | 213 | 88.3% | 53.1% | — | — | 81.7% | 83.6% | ceiling 88–92 %: needs word-list additions |
| gdl-73 | जादव का जँगल | 2037 | 88.3% | 53.5% | — | — | 81.2% | 83.5% | ceiling 88–92 %: needs word-list additions |
| gdl-22 | एक सौ सैंतीसवाँ पैर | 492 | 87.4% | 58.5% | — | — | 80.9% | 83.3% | library, not ladder |
| gdl-74 | जुई मौसी की बेटी | 825 | 88.2% | 63.8% | — | — | 82.7% | 83.3% | ceiling 88–92 %: needs word-list additions |
| gdl-16 | उड़ने वाला ऑटो | 1312 | 86.4% | 55.0% | — | — | 80.9% | 82.9% | library, not ladder |
| gdl-97 | मधुमक्खियाँ क्यों भन-भन करती हैं? | 683 | 86.5% | 54.8% | — | — | 76.4% | 82.9% | library, not ladder |
| gdl-60 | गुल्ली का गज़ब पिटारा | 366 | 83.6% | 60.9% | — | — | 80.3% | 82.8% | library, not ladder |
| gdl-123 | स्वतंत्रता की ओर | 1504 | 87.8% | 60.2% | — | — | 81.8% | 82.5% | library, not ladder |
| gdl-116 | सालाना बाल-कटाई दिवस | 263 | 87.8% | 47.9% | — | — | 82.5% | 82.5% | library, not ladder |
| gdl-89 | पापा की मूँछें | 570 | 89.8% | 56.7% | — | — | 81.6% | 82.3% | ceiling 88–92 %: needs word-list additions |
| gdl-115 | सबसे अच्छा घर | 574 | 84.3% | 52.4% | — | — | 80.0% | 82.1% | library, not ladder |
| gdl-46 | कितना शोर | 715 | 86.6% | 61.0% | — | — | 79.9% | 82.0% | library, not ladder |
| gdl-112 | विशालकाय एक-पंख गजपक्षी | 2016 | 87.3% | 58.1% | — | — | 79.5% | 81.9% | library, not ladder |
| gdl-72 | जंगल का स्कूल | 359 | 86.4% | 59.3% | — | — | 79.9% | 81.9% | library, not ladder |
| gdl-124 | हवाई जहाज़ कैसे उड़ते हैं? | 1060 | 87.0% | 47.6% | — | — | 74.7% | 81.3% | library, not ladder |
| gdl-48 | कोट्टवी राजा और उनींदा देश | 1476 | 86.2% | 54.2% | — | — | 78.5% | 81.2% | library, not ladder |
| gdl-38 | कहानी केलों की! | 519 | 87.7% | 58.2% | — | — | 79.8% | 81.1% | library, not ladder |
| gdl-30 | कल्लू कहानीबाज़ | 2177 | 85.5% | 59.0% | — | — | 79.7% | 80.9% | library, not ladder |
| gdl-9 | आओ, बीज बटोरें! | 1660 | 86.0% | 55.5% | — | — | 78.0% | 80.8% | library, not ladder |
| gdl-44 | काका और मुन्नी | 1229 | 84.6% | 56.1% | — | — | 77.1% | 80.2% | library, not ladder |
| gdl-95 | भीमा गधा | 236 | 81.8% | 57.2% | — | — | 78.8% | 80.1% | library, not ladder |
| gdl-18 | ऊँट चला, भई! ऊँट चला | 630 | 86.2% | 43.2% | — | — | 69.2% | 80.0% | library, not ladder |
| gdl-100 | मुमताज़ ने काढ़े अपने सपने | 3037 | 83.9% | 57.5% | — | — | 78.2% | 79.8% | library, not ladder |
| gdl-99 | मुत्तज्जी की उम्र क्या है? | 1975 | 82.8% | 56.3% | — | — | 78.6% | 79.7% | library, not ladder |
| gdl-68 | चुप! मेरी नाक कुछ कह रही है... | 251 | 85.7% | 56.6% | — | — | 74.9% | 79.3% | library, not ladder |
| gdl-119 | सोना की नाक बड़ी तेज | 252 | 85.7% | 57.1% | — | — | 77.8% | 79.0% | library, not ladder |
| gdl-103 | मेरी पाठशाला | 151 | 84.1% | 61.6% | — | — | 78.8% | 78.8% | library, not ladder |
| gdl-34 | कहाँ गये गालों के गड्‌ढे? | 1042 | 82.7% | 54.7% | — | — | 77.4% | 78.3% | library, not ladder |
| gdl-85 | निराली दादी | 146 | 84.2% | 50.7% | — | — | 77.4% | 78.1% | library, not ladder |
| gdl-76 | टूथपेस्ट ट्यूब के अंदर कैसे आया? | 731 | 81.3% | 48.6% | — | — | 75.6% | 76.9% | library, not ladder |
| gdl-114 | सबरंग | 660 | 81.2% | 50.9% | — | — | 73.8% | 76.8% | library, not ladder |
| gdl-90 | पिशि फँसी तूफ़ान में | 375 | 83.2% | 50.1% | — | — | 73.9% | 76.8% | library, not ladder |
| gdl-12 | आलू-मालू-कालू | 131 | 82.4% | 40.5% | — | — | 74.8% | 76.3% | library, not ladder |
| gdl-71 | छुक-छुक-छक | 104 | 80.8% | 51.9% | — | — | 75.0% | 76.0% | library, not ladder |
| gdl-113 | संगीत की दुनिया | 379 | 80.5% | 54.4% | — | — | 72.8% | 75.7% | library, not ladder |
| gdl-58 | गहरे सागर के अंदर! | 1083 | 80.8% | 45.8% | — | — | 71.4% | 74.6% | library, not ladder |
| gdl-82 | ध्यान सिंह  'चंद'  : हॉकी के जादूग | 2156 | 79.4% | 49.8% | — | — | 71.8% | 74.1% | library, not ladder |
| gdl-92 | बारिश में क्या गाएँ ? | 196 | 76.0% | 54.1% | — | — | 73.5% | 73.5% | library, not ladder |
| gdl-109 | रज़ा और बादशाह | 1400 | 77.2% | 52.5% | — | — | 70.3% | 71.6% | library, not ladder |
| gdl-40 | कहानी- गजानन गंजे | 90 | 72.2% | 48.9% | — | — | 64.4% | 70.0% | library, not ladder |
| gdl-88 | पहलवान जी और केला | 129 | 74.4% | 49.6% | — | — | 69.8% | 69.8% | library, not ladder |
| gdl-67 | चुन्नु-मुन्नु का नहाना | 126 | 69.0% | 41.3% | — | — | 65.9% | 65.9% | library, not ladder |

Status words: *placed* — an authentic unit in this plan; *readable after b1 opening* — ≥ 92 % after the simulated b1 opening, place it in b1; *needs more lemmas* — ceiling ≥ 92 % but not reached yet; *ceiling 88–92 %: needs word-list additions* — the word list itself stops it (names, loans, colloquial forms); *library, not ladder* — ceiling below 88 %: not before a much larger list.

### 4.6 Scripture

The IRV 2019 chapters (1,189 in the library, 91 verses in the bundled corpus) measured after a2-2 and after the simulated b1 opening:

| text | words | cov. after a2-2 (text itself left out) | lemmas still needed for 88 % / 92 % / 95 % | after the simulated b1 opening (text itself left out) | placed (cov. when placed) |
|---|---:|---:|---|---:|---|
| psa-23 | 124 | 83.1% | 7 / 12 / 15 | 92.7% | hi-b1-bridge-07 (at 92.7%) |
| jhn-14 | 747 | 92.5% | 0 / 0 / 6 | 96.9% | hi-a2-2-05 (at 92.5%) |
| mrk-1 | 880 | 91.5% | 0 / 2 / 24 | 93.1% | hi-b1-bridge-09 (at 92.6%) |
| jhn-1 | 1022 | 91.1% | 0 / 2 / 16 | 92.6% | hi-b1-bridge-11 (at 92.6%) |
| jhn-3 | 850 | 89.5% | 0 / 5 / 17 | 91.3% | no |
| 1john-1 | 77 | 90.9% | 0 / 1 / 4 | 93.5% | no |
| luk-15 | 739 | 88.8% | 0 / 9 / 25 | 90.7% | no |
| psa-1 | 137 | 81.0% | 4 / 9 / 13 | 83.9% | no |
| gen-1 | 809 | 76.1% | 10 / 15 / 21 | 81.8% | no |
| psa-100 | 87 | 82.8% | 3 / 7 / 9 | 88.5% | no |

The vocabulary the Gospel chapters ask for, by frequency (`never` = not taught by the plan: the function words and Bible words the plan leaves to the chapter itself; the content words of faith are taught in the church and testimony units):

- **jhn-14** (747 words), the 45 commonest lemmas with the unit after which each is known: होना (65, S0) · मैं (55, S0) · और (34, S0) · तुम (33, hi-a1-1-27 (#27)) · वह (32, S0) · पिता (23, hi-a2-1-06 (#63)) · से (19, hi-a1-1-21 (#21)) · करना (19, S0) · कि (17, hi-a1-2-13 (#44)) · मेरा (15, S0) · कहना (14, hi-a1-1-19 (#19)) · जो (14, hi-a2-1-01 (#58)) · रखना (13, hi-a1-2-13 (#44)) · जाना (13, S0) · नहीं (13, S0) · का (12, S0) · तुम्हारा (11, hi-a1-1-14 (#14)) · न (10, hi-a1-2-26 (#57)) · में (10, S0) · तो (10, hi-a1-2-03 (#34)) · देना (10, hi-a1-1-22 (#22)) · प्रेम (10, hi-a1-2-16 (#47)) · रहना (9, hi-a1-1-06 (#6)) · जानना (9, hi-a1-2-23 (#54)) · ने (9, hi-a1-1-31 (#31)) · पर (7, S0) · विश्वास (7, hi-a1-2-18 (#49)) · भी (7, S0) · यदि (7, hi-a2-2-01 (#78)) · अपना (7, hi-a1-1-20 (#20)) · पास (7, hi-a1-1-20 (#20)) · क्योंकि (6, hi-a1-2-15 (#46)) · को (6, S0) · देखना (6, hi-a1-1-22 (#22)) · साथ (6, hi-a1-1-22 (#22)) · संसार (6, hi-a2-2-04 (#81)) · आना (5, hi-a1-1-11 (#11)) · हम (5, S0) · तू (5, hi-a2-1-13 (#70)) · बात (5, hi-a1-1-26 (#26)) · हे (4, hi-a2-2-05 (#82)) · ही (4, hi-a1-2-22 (#53)) · ये (4, hi-a2-1-02 (#59)) · परन्तु (4, hi-a2-2-05 (#82)) · काम (4, S0)
- **mrk-1** (880 words), the 45 commonest lemmas with the unit after which each is known: और (57, S0) · होना (47, S0) · का (46, S0) · वह (41, S0) · में (26, S0) · उसका (22, hi-a1-1-22 (#22)) · जाना (22, S0) · करना (20, S0) · को (19, S0) · से (19, hi-a1-1-21 (#21)) · वे (14, hi-a1-2-15 (#46)) · आना (13, hi-a1-1-11 (#11)) · मैं (11, S0) · रहना (11, hi-a1-1-06 (#6)) · कहना (11, hi-a1-1-19 (#19)) · तुरंत (10, hi-a2-1-13 (#70)) · पर (9, S0) · ने (9, hi-a1-1-31 (#31)) · तू (9, hi-a2-1-13 (#70)) · निकलना (8, hi-a1-2-22 (#53)) · अपना (7, hi-a1-1-20 (#20)) · जो (7, hi-a2-1-01 (#58)) · देना (7, hi-a1-1-22 (#22)) · पास (7, hi-a1-1-20 (#20)) · यह (7, S0) · बपतिस्मा (6, hi-a2-2-15 (#92)) · प्रचार (6, hi-a2-2-15 (#92)) · तो (6, hi-a1-2-03 (#34)) · आत्मा (6, hi-a2-1-13 (#70)) · देखना (5, hi-a1-1-22 (#22)) · कि (5, hi-a1-2-13 (#44)) · तब (5, hi-a1-2-16 (#47)) · साथ (5, hi-a1-1-22 (#22)) · लगना (5, hi-a1-1-06 (#6)) · लोग (5, hi-a1-1-04 (#4)) · जंगल (4, hi-a2-1-11 (#68)) · सारा (4, hi-a1-2-08 (#39)) · सब (4, hi-a1-1-12 (#12)) · लेना (4, S0) · दिन (4, hi-a1-2-03 (#34)) · क्योंकि (4, hi-a1-2-15 (#46)) · आराधनालय (4, hi-a2-2-23 (#100)) · उपदेश (4, hi-a2-2-15 (#92)) · परन्तु (4, hi-a2-2-05 (#82)) · दुष्टात्मा (4, hi-b1-bridge-08 (#109))
- **jhn-1** (1022 words), the 45 commonest lemmas with the unit after which each is known: होना (90, S0) · वह (52, S0) · का (51, S0) · और (36, S0) · ने (27, hi-a1-1-31 (#31)) · से (23, hi-a1-1-21 (#21)) · कहना (23, hi-a1-1-19 (#19)) · मैं (23, S0) · में (20, S0) · देना (20, hi-a1-1-22 (#22)) · तू (20, hi-a2-1-13 (#70)) · देखना (18, hi-a1-1-22 (#22)) · यह (15, S0) · करना (14, S0) · वे (14, hi-a1-2-15 (#46)) · जो (13, hi-a2-1-01 (#58)) · उसका (12, hi-a1-1-22 (#22)) · आना (12, hi-a1-1-11 (#11)) · तो (12, hi-a1-2-03 (#34)) · को (12, S0) · कि (11, hi-a1-2-13 (#44)) · नहीं (11, S0) · न (10, hi-a1-2-26 (#57)) · जाना (9, S0) · परन्तु (8, hi-a2-2-05 (#82)) · वही (7, hi-a1-2-20 (#51)) · गवाही (7, hi-a1-2-16 (#47)) · पर (7, S0) · लेना (7, S0) · ज्योति (6, hi-a2-2-15 (#92)) · अपना (6, hi-a1-1-20 (#20)) · अर्थात् (6, hi-a2-2-09 (#86)) · पुत्र (6, hi-a2-2-08 (#85)) · उत्तर (6, hi-a2-2-08 (#85)) · बपतिस्मा (6, hi-a2-2-15 (#92)) · द्वारा (5, hi-a2-2-08 (#85)) · उत्पन्न (5, hi-a2-2-23 (#100)) · मनुष्य (5, hi-a2-1-20 (#77)) · भेजना (5, hi-a1-2-13 (#44)) · जिसका (5, hi-a2-1-16 (#73)) · जगत (5, hi-a2-2-15 (#92)) · हम (5, S0) · रहना (5, hi-a1-1-06 (#6)) · तब (5, hi-a1-2-16 (#47)) · फिर (5, hi-a1-2-04 (#35))

Mark 1, John 1, Psalm 23 and John 14 are the entry points the audit named; the measurement confirms the order **John 14 → Mark 1 → John 1 → Psalm 23 / John 3 → Luke 15**, and that the Chronicles genealogies and Genesis 1 (76.1%; it lacks 15 lemmas for 92 %) stay in the library. Psalm 23 is only 124 words but lacks about a dozen lemmas (the shepherd's vocabulary: चराई, तराई, सोंटा, लाठी, कटोरा, भलाई, करुणा…) which is why the b1 opening has a preparation unit about the shepherd. Words still unknown after the b1 opening (the text itself left out, so for the placed chapters this is what the placement leaves unknown):

- **psa-23**, still unknown after the simulated b1 opening, the text itself left out (124 words, 92.7%): सताना बिछाना मलना कटोरा उमड़ना निश्चय भलाई करुणा धाम
- **mrk-1**, still unknown after the simulated b1 opening, the text itself left out (880 words, 93.1%): आस×2 जंगली×2 आरंभ फिराव ऊँट वस्त्र कमर चमड़ा कमरबंद टिड्डी वनमधु शक्तिशाली योग्य झुकना कबूतर आकाशवाणी प्रसन्न शैतान वन पकड़वाना निकट फिराना मछुआ सब्त चकित शास्त्री नासरी नाश
- **jhn-1**, still unknown after the simulated b1 opening, the text itself left out (1022 words, 92.6%): फिलिप्पुस×5 नतनएल×5 वस्तु×2 इच्छा×2 एकलौता×2 वर्णन×2 व्यवस्था×2 प्रगट×2 एलिय्याह×2 मेम्ना×2 चेला×2 दृष्टि×2 रब्बी×2 अंजीर×2 तला×2 सच्चा प्रकाशित अपन सन्तान लहू शरीर देहधारी परिपूर्ण डेरा परिपूर्णना प्राप्त यहूदी याजक
- **jhn-3**, still unknown after the simulated b1 opening, the text itself left out (850 words, 91.3%): स्वर्ग×6 जन्मा×5 पृथ्वी×4 नीकुदेमुस×3 अवश्य×3 अनन्त×3 दंड×3 निकट×3 यहूदी×2 रब्बी×2 गुरु×2 सिरा×2 प्रवेश×2 चढ़ाना×2 एकलौता×2 चेला×2 फरीसी चिह्न माता गर्भ अचम्भा जिधर किधर इस्राएली रीति उद्धार दोषी ठहराना
- **luk-15**, still unknown after the simulated b1 opening, the text itself left out (739 words, 90.7%): सम्पत्ति×4 फिराना×3 स्वर्ग×3 मरना×3 निन्यानवा×2 रीति×2 सिक्का×2 विरोध×2 दृष्टि×2 योग्य×2 पहनाना×2 चुंगी फरीसी शास्त्री कुड़कुड़ाना दृष्टांत काँधा इकट्ठना धर्मी स्त्री चाँदी जलाना बुहारना सखी पड़ोसिन दो भाग कुकर्म

Scripture is 8.5 % of a2-2 (John 14 and the retelling), 0 % elsewhere in a1–a2-1; the contract's 40 % line is not near, and the owner's ≤ 10 % per stage is met.

### 4.7 What stops the rest of the shelf, and what to add

- **Names.** 24 of the 40 most frequent forms with no reading in the GDL books are character names (भबलू, मोरू, मुमताज़, कल्लू, अनु, मुनिया, टूका, रीति, जादव, मिठु, पपलू, मुत्तज्जी, श्रीनिवास…). They have no reading, so each is an unknown lemma in the book that uses it (its first three tokens, and then in every other book that shares it). Altogether the shelf has 2,786 distinct forms with no reading and 7,637 tokens (12.8 %): the 40 most frequent are 1,365 tokens (2.3 %), the 100 most frequent 2,294 (3.9 %): a long tail, so adding names helps the book that has them and almost nothing else. Adding names to the adapter's proper-name list is the Hindi session's job; the commonest forms are listed in section 6.2.
- **Colloquial and loan forms**: वो (85 tokens in 92 books, the spoken वह), ना, मम्मी, टीचर, टीम, बिल्कुल (the list has बिलकुल), वापस, हॉकी, विमान, पालतू, पैदा.
- **Compound numerals** 31–99 (digits are fine) and **nonce words** (sound words such as छुक-छुक-छक, काँव, भन-भन).

### 4.8 Premchand, Bharatendu and the Global Voices excerpt

The published literature measured against this ladder:

| text | words | cov. after a2-2 | lemmas needed for 88 % / 92 % / 95 % | after the simulated b1 opening |
|---|---:|---:|---|---:|
| premchand-panch-parameshwar-ch01 | 4312 | 68.3% | 311 / 484 / 613 | 69.7% |
| premchand-namak-ka-daroga-ch01 | 3224 | 65.8% | 385 / 514 / 610 | 67.2% |
| bharatendu-andher-nagari | 3273 | 60.0% | 286 / 417 / 515 | 60.8% |
| gv-hi-467925c35d73-excerpt-ch01 | 218 | 72.5% | 23 / 32 / 39 | 75.2% |

Even after the b1 opening the Premchand stories need about 400–500 further lemmas for 92 % (the 88 % error line is 300–390 lemmas away), *Andher Nagari* about 400; the Global Voices excerpt (218 words, a magazine register) needs about 30. They are library, not ladder, until the b1 literature bridge of section 5.2 has been built and measured.

## 5. The b1-bridge: the opening that was simulated, and what has to be added

### 5.1 What the plan simulates

The b1 rows of the unit table are an *opening* of the stage, planned and simulated the same way as a2: eight controlled units (about 1,000–1,300 words each, 2.2 new lemmas per 100) in the domains the ladder is thin on, and the authentic GDL books and Scripture chapters that become readable. They are: animal tales (the vocabulary of the picture books), why the sky is blue and why puris puff up (the nonfiction of GDL, with क्योंकि / इसलिए and the passive), a day on a village farm, the city bus, a short biography of a sportsman, the road to freedom, and the shepherd and the sheep (preparing Psalm 23, Mark 1 and John 1). Together 12,889 words, 325 new lemmas, **1,255 lemmas known at the end** (a2-2 ended at 1,039). Since the contract asks b1 for 30–60 k words ending where the library is comfortably readable, **this is the first quarter of the stage** only.

### 5.2 What the rest of b1 has to do

1. **Finish the shelf that the list allows.** Of the 92 GDL books, 31 have a ceiling ≥ 92 %: after the simulated opening 18 are readable and placed or placeable; teaching the further **41 listed lemmas** below and handling **70 unlisted forms** (names, colloquial forms, loans) unlocks 23 of the 29 remaining books that have a ceiling of 88 % or more. Listed lemmas, in the order in which they unlock books: उछलना छपाई पुताई गिरा आकार लुढ़कना चाटना मानो दो किरण छिपना घुसना फिसलना जुगनू मूँछ बगल बजाना गुड़िया पालना छपना भला रेखा बिखरना झूला हंस गुज़रना होंठ तंग संगीत एकदम मुलायम पकौड़ा हिलना सूखना तलवार दाढ़ी पगड़ी बढ़िया तलना लड़ना काफ़ी.
   Unlisted forms (to add to the adapter, or to accept as unknown): मीनू मनु अनु तेज़ी वीना विनय ठप्पा ऐनक मुखिया दाना अंकुरित अवनि चीनू कबाड़ी वर्षा नौका विक्की पेपर बोरी पिकनिक सपाटा आँखमिचौनी टिंकु झीना नज़र नन्हा घुँघराला चुलबुल बिल्कुल झींगुर सोफा मिथुन बाथरूम लड्‌डू नमूना तना मुन्ना तरंग अणू चड्डी अणु छुपा गोला परछाना भरपूर छलाँग छोर मीमी टीचर जूना गोदी बाँस सवार छिछ्छी फ्रॉक ग्लूटेन भाप ड्रम धाना करारा जादू आसाना उचक काढ़ना तुती हेलना गुँधा पपलू राक्षस राघव.
2. **Scripture**: Mark 1, John 1 and Psalm 23 enter in the opening; John 3, 1 John 1:8–9, Luke 15, Psalm 1, 100, 121 and Genesis 1 need their lists (4.6). Keep Scripture ≤ 10 % of the stage: with 12.9 k words the opening already holds 2.0 k words of Scripture, so no further chapter should be placed before b1 has about 20 k words in all.
3. **A literature bridge.** Premchand and Bharatendu need ≥ 400 further lemmas. The controlled units of b1 should move, in their second half, from the children's world to adult narrative: longer sentences (≥ 15 words), oblique infinitives and participial clauses, Urdu-origin vocabulary of the law, trade and family (इंसाफ़, पंच, दारोगा, नमक, ज़मींदार, ख़ज़ाना), the Sanskrit-origin abstract nouns of Scripture, and the old spellings. The plan does not specify these units: they follow once a2-2 exists and the real lemma set is measured.
4. **Adapted units** (the contract's `adapted`): lightly rewritten library texts (the GDL books longer than 700 words and the Global Voices excerpt) are possible once the owner decides whether the licences allow modifications (CC BY allows it; the excerpt is CC BY 3.0).


## 6. Words and names to add (for the Hindi session to review)

### 6.1 Words the plan uses that the word list does not have

67 words, each used first in the unit shown; every one is a frame word (clinic, train, office, church, school, village, family). If a word is refused, the unit's writer replaces it with a listed word of the same theme and the plan owner updates the unit's list. Until a word is in the list its inflected forms are separate lemmas for the gate (a plural or an oblique of a loan noun would be a new, unknown word): prefer invariant uses and the singular. Glosses and POS are machine-drafted; gender, plural and the oblique are the reviewer's.

| word | POS | gloss | first unit |
|---|---|---|---|
| संदेश | NOUN | message | hi-a1-2-13 |
| सूचना | NOUN | notice, information | hi-a1-2-13 |
| गोली | NOUN | tablet, pill | hi-a1-2-19 |
| मरीज़ | NOUN | patient | hi-a1-2-19 |
| इंजेक्शन | NOUN | injection | hi-a1-2-19 |
| पट्टी | NOUN | bandage | hi-a1-2-19 |
| ऑटो | NOUN | auto-rickshaw | hi-a1-2-21 |
| प्लेटफ़ॉर्म | NOUN | railway platform | hi-a1-2-06 |
| फ़ॉर्म | NOUN | form (to fill in) | hi-a2-1-08 |
| आवेदन | NOUN | application | hi-a2-1-08 |
| इंटरनेट | NOUN | the internet | hi-a2-1-17 |
| कंप्यूटर | NOUN | computer | hi-a2-1-17 |
| फ़ोटो | NOUN | photograph | hi-a2-1-17 |
| वीडियो | NOUN | video | hi-a2-1-17 |
| दुआ | NOUN | prayer, blessing (Urdu-origin) | hi-a1-2-20 |
| पार्टी | NOUN | party | hi-a1-2-22 |
| ख़त | NOUN | letter (Urdu-origin) | hi-a1-2-24 |
| रिपोर्ट | NOUN | report | hi-a1-2-26 |
| जेब | NOUN | pocket | hi-a1-2-26 |
| आदरणीय | ADJ | respected (letter salutation) | hi-a2-1-04 |
| इलाक़ा | NOUN | area, district | hi-a2-1-02 |
| शिविर | NOUN | camp | hi-a2-1-18 |
| डेंगू | NOUN | dengue | hi-a2-1-18 |
| मलेरिया | NOUN | malaria | hi-a2-1-18 |
| कचरा | NOUN | rubbish | hi-a2-2-09 |
| मानसून | NOUN | monsoon | hi-a2-1-14 |
| इम्तिहान | NOUN | exam (Urdu-origin) | hi-a2-1-16 |
| फ़ेल | ADJ | failed (in an exam) | hi-a2-1-16 |
| इलायची | NOUN | cardamom | hi-a2-1-11 |
| धान | NOUN | paddy, rice plant | hi-a2-1-14 |
| खेती | NOUN | farming, cultivation | hi-a2-1-14 |
| दृश्य | NOUN | view, scene | hi-a2-2-01 |
| धुंध | NOUN | mist, haze | hi-a2-2-01 |
| ट्रेनिंग | NOUN | training | hi-a2-2-04 |
| सुविधा | NOUN | facility, convenience | hi-a2-2-08 |
| महँगाई | NOUN | high prices, inflation | hi-a2-2-08 |
| तरक़्क़ी | NOUN | progress | hi-a2-2-08 |
| गंदगी | NOUN | dirt, filth | hi-a2-2-09 |
| सुधार | NOUN | improvement | hi-a2-2-09 |
| प्रस्ताव | NOUN | proposal | hi-a2-2-11 |
| राय | NOUN | opinion | hi-a2-2-11 |
| सुझाव | NOUN | suggestion | hi-a2-2-11 |
| सहमत | ADJ | in agreement | hi-a2-2-11 |
| वोट | NOUN | vote | hi-a2-2-11 |
| चंदा | NOUN | donation, subscription | hi-a2-2-11 |
| अध्यक्ष | NOUN | chairman | hi-a2-2-11 |
| निवेदन | NOUN | request (formal) | hi-a2-2-12 |
| महोदय | NOUN | sir (letter salutation) | hi-a2-2-12 |
| स्वीकार | NOUN | acceptance | hi-a2-2-12 |
| सूचित | ADJ | informed | hi-a2-2-12 |
| पिचकारी | NOUN | water squirt, for Holi | hi-a2-2-13 |
| गुलाल | NOUN | coloured powder, for Holi | hi-a2-2-13 |
| पकवान | NOUN | festive dish | hi-a2-2-13 |
| ढोल | NOUN | drum | hi-a2-2-13 |
| सावधानी | NOUN | care, caution | hi-a2-2-14 |
| मच्छरदानी | NOUN | mosquito net | hi-a2-2-14 |
| कूलर | NOUN | air cooler | hi-a2-2-14 |
| अनुभव | NOUN | experience | hi-a2-2-15 |
| सीख | NOUN | lesson, teaching | hi-a2-2-15 |
| ट्रैफ़िक | NOUN | traffic | hi-a2-2-16 |
| दाख़िला | NOUN | admission | hi-a2-2-17 |
| पाठ्यक्रम | NOUN | syllabus | hi-a2-2-17 |
| जायदाद | NOUN | property, estate | hi-a2-2-22 |
| दावत | NOUN | feast | hi-a2-2-20 |
| ग्रहण | NOUN | receiving, accepting | hi-a2-2-15 |
| सूअर | NOUN | pig | hi-a2-2-22 |
| परदेस | NOUN | foreign land | hi-a2-2-22 |

### 6.2 Unlisted forms that stop the authentic books (the planner's evidence, not a request)

Frequent forms with no reading in the GDL books (tokens in 92 books): वो 85, ना 30, जीव 41, नज़र 34, काका 32, पालतू 28, हॉकी 28, बिल्कुल 27, टीम 26, मम्मी 23, तेज़ी 23, जादू 23, विमान 22, वापस 21, नन्ही 20, पार 19, सर 18, पैदा 17, टीचर 15, बाँस 14, मुखिया 14, विशालकाय 14, झटपट 13, महसूस 13, देवी 13, टूथपेस्ट 13, यानि 11, तय 11. Names (character names, to the adapter's proper-name list if the books are placed): भबलू 64, मोरू 59, मुमताज़ 57, कल्लू 50, अनु 48, मुनिया 45, टूका 39, रीति 36, मुत्तज्जी 35, जादव 34, मिठु 33, पपलू 32, श्रीनिवास 30, अर्जुन 28, मुन्नु 28, चीकू 26, सोनू 25, रज़ा 24, अकबर 22. The Stage 0 names सैम and अमन are in the same case.

## 7. Hindi points the gate will trip on, with the evidence

All measured on 2026-10-06 with `adapter-hi@3`, first-reading lemmas as `ladder:check` reads them. The corpus for the counts is the 92 GDL books, the 28 drafts and three Scripture chapters (67,039 running words).

**7.1 Homograph forms read as different lemmas depending on context.** 111 surface forms received two or three different first-reading lemmas across the corpus. The gate counts lemmas, so the encounters of one word the learner meets as one word are split, and a *phantom* lemma (भाना, सीना, सहना) is credited with encounters that belong to another word. Examples with counts (form: readings): की 1,057 (का 972, करना 85, both right); फिर 192 (फिर 178, फिरना 14); लगा 119 (लगना 89, लगाना 30); **भाई 42 (भाई 25, भाना 17)**; **सीता 19 (the name 11, सीना "to sew" 8)**; **सही 21 (सही 7, सहना 14)**; बस 78 (noun 13, adverb 52, बसना 13); फल (फल 5, फलना 2); हार (हारना 2, हार 3); पानी 123 (पानी 122, पाना 1); दिया 121 (देना 118, दीया 3); जी 160 (particle 100, noun 49, जीना 11); बोली 52 (noun 8, बोलना 44); intransitive/transitive pairs: उठा (उठना 13, उठाना 8), बैठा (बैठना 20, बैठाना 2), चला (चलना 35, चलाना 10), बना (बनना 12, बनाना 18), मिला, पढ़ा. Context decides: "मैं कल सुबह बस के लिए जल्दी उठूँगा" reads बस as बसना, "हम बस से स्टेशन गए" as the noun, "उसने फल लिए" reads फल as फलना. **Consequences for the plan:** (a) Stage 0's own known list contains सीना (the name सीता); (b) a word the plan teaches three times can fail to count if the adapter reads one of the three tokens as another word: the writer should use the unit's new words in frames the adapter reads unambiguously (name + जी / नानी, "बस से", "फल खाया") and run `ladder:check`, reading the per-unit "new lemmas" list for phantom lemmas; (c) the Hindi session's fix is a neighbour rule per class (a name followed by नानी / जी / दीदी; a masculine singular noun before से / के लिए). The plan does not rely on any of them.

**7.1b Planned words that the adapter reads as another word.** A replay of this plan through the gate, with every planned lemma written as a bare citation form, found that **45 of the 1125 planned lemmas (4.0 %) are read first as a different lemma when they stand alone**, almost all of them nouns whose form coincides with a verb stem or participle: खाँसी → खाँसना, फिर → फिरना, दुआ → दूना, मोड़ → मोड़ना, गाड़ी → गाड़ना, सबसे → सब, थका → थकना, कमाई → कमाना, फल → फलना, पढ़ाई → पढ़ाना, पोता → पोतना, कर → करना, दौड़ → दौड़ना, पोती → पोतना, भर → भरना, फ़ोटो → फ़ोटना, खोज → खोजना, चमक → चमकना, खोया → खोना, खेल → खेलना, समझ → समझना, चढ़ाई → चढ़ाना, महँगाई → महँगाना, डाल → डालना, सोच → सोचना, सुधार → सुधारना, डाली → डालना, भरा → भरना, नाच → नाचना, हँसी → हँसना, जाँच → जाँचना, सावधानी → सावधाना, मच्छरदानी → मच्छरदाना, उबला → उबलना, सीख → सीखना, बोली → बोलना, जोड़ा → जोड़ना, चराई → चराना, दिखाई → दिखाना, सोता → सोना, दुखी → दुखना, दुख → दुखना, जीत → जीतना, हार → हारना, तला → तलना. In running text the neighbour rules often choose the noun (after a determiner, a postposition or an adjective: "इस खेल में", "उसकी सोच", "बच्चों की पढ़ाई"), but not always; a unit that introduces one of these words should give it a frame that makes the noun reading obvious in all three uses, and the unit block marks each of them with ⚠. Words with no reading at all (the "+" words of section 6 and a few loans) are not in this list: they count as their own surface form, consistently.

**7.2 Words with no reading.** 6,371 of the 67,039 tokens (9.5 %) have no reading; in the GDL books that is 7,637 tokens (12.8 %) of 2,786 distinct forms, in the drafts 0 (the list was built against them) and in Stage 0 16 tokens (सैम, अमन). The gate then uses the normalized surface form as the lemma, so an unlisted word is a separate unknown "lemma" per surface form, three tokens each, and an unlisted *inflecting* word is several. Names (भबलू ×64…), colloquial forms (वो ×85, मम्मी, टीचर), loans (टीम, हॉकी, टूथपेस्ट) and rarer words are the bulk. Sections 4.7 and 6.2.

**7.3 Complex predicates: conjunct and compound verbs.** The adapter reads each part as its own lemma: "हम प्रार्थना करते हैं" → प्रार्थना (noun) + करना + होना; "उसने दरवाज़ा बंद कर दिया" → बंद + करना + देना; "वह खाना खा लेता है" → खाना (noun), खाना (verb), लेना; "मुझे उसकी बहुत याद आती है" → याद + आना; "मुझे जाना पड़ा" → जाना + पड़ना; "आप मेरी मदद कर सकते हैं" → मदद + करना + सकना. Two effects: the gate counts a vector verb (लेना, देना, पड़ना, उठना, बैठना, डालना, चुकना, पाना, रहना, लगना, सकना, जाना) as known the moment the plain verb is, **although the compound meaning ("खा लिया", "दे दो") has not been taught**; and the noun part of a conjunct verb is a lemma to schedule (प्रार्थना, मदद, बात, काम, याद, इंतज़ार, इलाज, तैयारी, सफ़र, सेवा, सफ़ाई, माफ़ …). The gate's `compound-verb` key is first seen in the drafts (`hi-a1-1-26`). The plan teaches the plain verbs early and the vector use in the 0C drafts and the core units; the schedule of the commonest ones:

| verb | known after |
|---|---|
| जाना | S0 |
| आना | hi-a1-1-11 (#11) |
| लेना | S0 |
| देना | hi-a1-1-22 (#22) |
| करना | S0 |
| होना | S0 |
| रहना | hi-a1-1-06 (#6) |
| लगना | hi-a1-1-06 (#6) |
| सकना | hi-a1-2-06 (#37) |
| पड़ना | hi-a1-2-08 (#39) |
| उठना | hi-a1-1-06 (#6) |
| बैठना | hi-a1-1-23 (#23) |
| डालना | hi-a1-2-04 (#35) |
| चुकना | hi-a1-2-19 (#50) |
| पाना | hi-a1-2-23 (#54) |
| बनना | hi-a1-2-19 (#50) |
| निकलना | hi-a1-2-22 (#53) |
| पहुँचना | hi-a1-2-06 (#37) |

**7.4 Compound postpositions.** "के लिए", "के बारे में", "की वजह से", "के कारण", "के बाद", "के पास", "के सामने", "की तरफ़": the adapter reads के/की as का and the second part as its own postposition lemma (लिए, बारे, वजह, कारण, बाद, पास, सामने, तरफ़ are all ADP in the list). Each is a lemma to teach, in a position where its meaning is clear; **लिए collides with the perfective plural of लेना** (216 tokens: 203 ADP, 13 लेना, plus the spelling लिये 41), so "फल लिए" is read as लेना. The plan schedules them as follows (unit where each becomes known; S0 = already known after Stage 0):

| postposition | known after |
|---|---|
| का | S0 |
| को | S0 |
| में | S0 |
| पर | S0 |
| से | hi-a1-1-21 (#21) |
| ने | hi-a1-1-31 (#31) |
| तक | hi-a1-2-06 (#37) |
| लिए | hi-a1-1-31 (#31) |
| साथ | hi-a1-1-22 (#22) |
| पास | hi-a1-1-20 (#20) |
| बाद | hi-a1-2-06 (#37) |
| पहले | hi-a1-2-10 (#41) |
| सामने | hi-a1-1-31 (#31) |
| पीछे | hi-a1-1-31 (#31) |
| ऊपर | hi-a1-2-08 (#39) |
| नीचे | hi-a1-1-29 (#29) |
| अंदर | hi-a1-1-28 (#28) |
| बाहर | hi-a1-1-28 (#28) |
| तरफ़ | hi-a1-2-09 (#40) |
| ओर | hi-a2-1-04 (#61) |
| बीच | hi-a2-1-11 (#68) |
| बारे | hi-a2-1-02 (#59) |
| बिना | hi-a2-1-13 (#70) |
| जैसे | hi-a2-1-04 (#61) |
| कारण | hi-a2-2-08 (#85) |
| वजह | hi-a2-1-16 (#73) |
| द्वारा | hi-a2-2-08 (#85) |

**7.5 Oblique and plural forms.** A round trip over the word list (each noun's regular plural and oblique, generated by rule and read back by the adapter): masculine nouns in -ा, 211 tested, 17 of them invariant (पापा, दादा, नाना, चाचा, मामा, राजा, नेता… which have no -ों form: not errors), so 194 regular, of which 181 read back as themselves (बच्चों → बच्चा, लड़कों → लड़का); feminine nouns in -ी 182 of 182 (-ियाँ and -ियों); feminine nouns with the -ओं oblique 197 of 197. The failures are collisions between the oblique plural and another listed word, 13 of 194 (6.7 %): **कमरों → कमर (wrong: waist), तारों → तार, पंखों → पंख, तालों → ताल, मेलों → मेल, वादों → वाद** (the other word is sometimes the right reading, but the adapter cannot tell) and, readable either way, पहाड़ों, घाटों, सालों, चारों, निशानों, जोड़ों, खीरों; and feminine plurals in -ें read as verbs (सोचें → सोचना, जानें → जानना; गायें → गाना: 31 of 197, 15.7 %, almost all verb-noun pairs). The same word then appears as two lemmas depending on its form, so a unit that teaches कमरा three times with the singular does not make कमरों known. **Advice for writers:** keep a taught noun in the same form (singular/direct) for its three introducing uses, and let the oblique plural come later, once the word is known.

**7.6 ने constructions.** The fused pronoun forms are read correctly as their base pronoun: उसने → वह, मैंने → मैं, हमने → हम, आपने → आप, उन्होंने → वे, उसे/उसको → वह, इन्हें → ये; the particle after a noun is the ADP lemma ने ("लड़के ने"). The perfective agrees with the object, and every inflected form maps to the verb lemma (खाई → खाना, पढ़ी → पढ़ना, किया → करना, दिया → देना, गया → जाना, लिया → लेना). So **ने itself is one lemma and costs one slot** (taught in `hi-a1-1-31`, in the quotation formula "X ने कहा / लिखा", three uses, before the drafts begin to use it), and the *construction* is seen by `ergative-ne` and `ne-with-ko-object` (first met in s0c-01). The trap is the transitive/intransitive pairs above (उठा / उठाना, बैठा / बैठाना, चला / चलाना): the perfective of an intransitive verb and the stem of its causative are one surface form, read by neighbours; and the gate cannot tell a missing ने (मैं किताब पढ़ा) from a correct sentence.

**7.7 Names.** The adapter's proper-name list has 87 entries (biblical names, cities, common first names and surnames). Cast names in this plan are taken from it. सैम, अमन, लखनऊ, जॉन, डेविड, and all the GDL characters are not in it: each is an unknown lemma for its first three tokens. मोती is a name (the dog) and a noun (pearl): in the drafts it is read as the noun, which is why it is a new lemma of hi-a1-1-02.

**7.8 Numerals.** The word list has the numerals to 30, the tens, सौ, हज़ार, लाख, करोड़, डेढ़, ढाई, सवा, पौन, साढ़े; "इक्यावन" has no reading; digits (any script) are known by definition. Ordinals (पहला, दूसरा) are adjectives (ordinary lemmas). So the plan writes counts, prices, ages, years and dates in digits, and the number words 1–30 are free.

**7.9 Colloquial and spelling variants.** The variants बाजार/बाज़ार, फोन/फ़ोन, गयी/गई, हिन्दी/हिंदी, रुपए/रुपये normalize to one lemma (good). The spoken वो for वह has **no reading** (85 tokens in the GDL books): a controlled unit that writes वो for dialogue will make it a new lemma, so the plan writes वह in the controlled units and treats वो as a word to add (6.2). Hyphenated reduplications (छोटी-छोटी, धीरे-धीरे) are read as two tokens of the same lemma, which doubles their count (harmless).

## 8. Under-specified, risky, or decided by someone else

1. **Everything Hindi is machine-drafted and unreviewed**: the 28 drafts, the word list (gender, register, glosses), the adapter's rules, this plan's choices. The plan's "est. cov." figures for controlled units are arithmetic: they assume the adapter reads every listed word as its listed lemma, which section 7 shows it does not always do. Expect the measured coverage of the first drafted units to differ by a few points either way, and re-plan after the first stage is drafted (as the Spanish plan did).
2. **The cast clash.** Stage 0: Ravi (teacher) and Meera (nurse), adults, brother and sister; the drafts: Ravi (boy) and Meera (his sister). Proposed: in controlled units the adults are **रवि सर** and **मीरा दीदी**, the children of the drafts never appear in them, and the pair of the drafts never meets the pair of Stage 0. The Hindi session (owner of the drafts) may prefer to rename the adults in Stage 0 or the children in the drafts; either change is theirs and would need a Stage 0 / draft re-review. The plan does not depend on the choice but the names in the unit blocks do. Likewise the dog मोती of the drafts is Seeta Nani's neighbour's dog in the bridge unit; Seeta Nani is **नानी** to Aman, while the drafts' children have दादी and दादा जी: the bridge unit hi-a1-1-02 introduces both without conflict.
3. **The first bridge units are written from a tiny palette** (Stage 0's 59 known lemmas plus the first draft): hi-a1-1-02 has 6 new words and 66 + 59 lemmas to draw on; the writers should use freely the 32 Stage 0 lemmas met once or twice (they are the top-up, and every one of them is one unknown token at worst) and keep the sentences to the Stage 0 frames (है / हैं, में / पर, का / की, को … चाहिए). Expect these four a1-1 bridge units to read like Stage 0; that is the intended handover.
4. **Recycling is dense.** Three encounters per new lemma within six units, with in-place texts carrying a share, means up to 10 tracked words per 100 in some units. The assignment is by theme overlap and load, not by meaning; a recycle list that reads absurdly for a unit may be moved to the nearest unit in the window with a note. A word listed twice may be used twice in one sentence-pair, or once each in two places.
5. **Book-finishing lemmas (‹for gdl-NN›) may not fit their unit's theme.** They were chosen to bring a library book to the placement line; if a writer cannot place one naturally, it can move to another unit before the placement, and the plan owner should re-run the placement.
6. **The authentic placements are a model.** They are placed when the simulated coverage is ≥ 92.5 %; the simulation is exact for the books (real text), approximate for the controlled units (planned lemmas assumed known after their own three uses). Move a book by more than three units and re-measure with `npm run ladder:place -- --lang hi <textId>` (the contract's threshold there is 95 %: of the books placed here 5 reach 95 % at some unit of the plan, the rest only 92–94 %).
7. **GDL books are picture books**; the library holds the text only (no illustrations). Lines such as "देखो!" and "यह क्या है?" may lean on a picture. The shorter the book, the more it does; none of the placed books is below 79 words. A reviewer should read each placed book as text before placement; an authentic text is never edited.
8. **Scripture.** John 14 and the Mark 1 / John 1 / Psalm 23 chapters are IRV Hindi 2019 (CC BY-SA 4.0 via eBible.org): share-alike and attribution travel with them. The retelling of Luke 15 is the course's own wording and needs a Scripture-competent reviewer as well as a linguistic one; quoted verses would bring the Bible register (यदि, परन्तु, हे, तेरा) into controlled units, which the plan does not do.
9. **Respectful treatment of other religions.** Units on Diwali, Holi and the neighbours' places of worship are written by a guest who observes and is thanked; no ritual is performed, taught or described as the learner's; no comparison. The reviewer's checklist has "cultural oddities" for it, and the Hindi session should read these unit blocks before drafting: `hi-a1-2-10`, `hi-a1-2-23`, `hi-a2-1-02` and `hi-a2-2-13`.
10. **Dialect and city.** The frame is a North Indian city (unnamed; बनारस and दिल्ली are in the name list), standard Hindi, no Bhojpuri, Awadhi or Punjabi words (the adapter treats them as heritage varieties). A reviewer from the Hindi belt should say if the everyday vocabulary (नाश्ता, दाम, चारपाई, चूल्हा, मोहल्ला, पुलाव, रायता) is what people there say.
11. **The b1-bridge is a brief with an opening, not a plan** (section 5): it cannot be specified before a2-2 is drafted and measured.
12. **Audio.** Every unit is meant to be recordable in one sitting (≤ 1,320 words); nothing here schedules recordings or reviewers; the B2 audit's preconditions (a named native reviewer, native audio) still stand for every unit before a learner sees it.
13. **Domain gaps.** Instructions and explanation are thin in a2; travel, food and family appear in one or two units per stage; relabel units 'hi-a2-2-…' if the owner wants other proportions. Narrative is 25–29 % of a1-2 and a2 because the drafts are narrative.
14. **A replay of the plan through the real gate** (scratch script, not committed): the in-place texts, the Stage 0 head and the authentic texts at their planned positions, with each controlled and bridge unit stood in for by its planned words as bare citation forms (three uses of each new lemma, the top-up and recycle uses): the 116 rows reproduce the model's coverage for 43 of the 50 in-place and authentic units within 0.2 point; 7 differ by 0.2–1.6 points, always downwards and always because a planned word was read as another one (7.1b): s0c-02 89.5 % against 90.6 %; s0c-06 95.8 % against 95.4 %; 63 91.5 % against 92.8 %; 79 92.4 % against 93.3 %; bible-psa-23 91.1 % against 92.7 %; bible-mrk-1 92.4 % against 92.6 %; 26 91.8 % against 93.1 %. Placements near the 92.5 % line may therefore show a warning (never an error) when drafted.
15. **What "known" means.** Three encounters in the designed path (an audit threshold). It says nothing about whether the learner understood a vector verb, a conjunct predicate or a compound postposition (7.3, 7.4).

## 9. For the drafting agents

1. **Order of work.** Stage by stage, unit by unit, in ladder order. Never draft a unit before the units above it exist, because the palette is "everything above it".
2. **Palette.** Known after unit N = the 59 lemmas of Stage 0 + the lemmas of every in-place and authentic text above it (they are real; the gate reads them) + every lemma in the "New" and "Top-up" lists above and in the unit. Rebuild it by scanning the unit blocks of this file: each starts with `#### hi-…`, the line `**New (n; …).**` has the lemmas as `lemma (pos: gloss)` separated by ` · `, the line `**Top-up …**` has `lemma×k`, the line `**Recycle …**` has the lemmas to use. The blocks of in-place and authentic units list their never-met words only as information (they are already in the text). The number "Known lemmas before it" is a check: it is the count of the palette.
3. **Write.** The unit's situation and cast, in its domain; sentence length as in 2.4; every new lemma exactly three times, in a frame the adapter reads unambiguously (section 7.1); top-up words exactly as often as listed; recycle words as listed; one English line per sentence; the constructions of its block (and no construction that a later block introduces, unless it is a chunk the learner has met in an in-place text). Dialogue units carry `speakers` and `speaker` per sentence; narrative units paragraphs of 3–6 sentences.
4. **Document shape** (like `data/ladder/es/units/es-a1-1-01.json`, the Spanish unit format; Hindi has no `variety` tag because Modern Standard Hindi carries none):
   ```json
   { "schemaVersion": 2, "id": "hi-a1-1-06", "lang": "hi", "title": "सीता नानी के घर की सुबह", "contentType": "story",
     "corpus": { "id": "ladder-hi", "kind": "comprehensible-input", "title": "Ladder — Hindi" },
     "source": { "id": "src:hi:hi-a1-1-06", "title": "… (ladder unit, machine-drafted)", "author": "Go course authors (drafted by an AI model)",
                 "attribution": "Course-authored controlled Hindi. Drafted by an AI model; not yet reviewed by a native speaker.",
                 "provenance": "Drafted by an AI model for the course ladder; not reviewed by a native speaker. …", "rights": "owner-authored",
                 "licenseNote": "Owned by the course authors; machine-drafted, not yet native-reviewed.", "authorship": "generated" },
     "review": { "status": "unreviewed", "notes": "points for the reviewer: honorifics, words outside the plan, Christian vocabulary, festivals" },
     "difficulty": "A1", "topics": [], "editorialTags": ["machine-drafted", "needs-native-review"], "prepTargets": [], "generated": true,
     "english": { "source": "drafted with the text; not reviewed" }, "streams": ["acquisition"], "domains": ["daily-life"],
     "pipeline": { "state": "machine-draft", "history": [ { "state": "machine-draft", "at": "2026-10-…", "by": { "kind": "tool", "name": "ladder drafting agent" } } ] },
     "speakers": { }, "sections": [ { "title": "…", "paragraphs": [ { "sentences": [ { "text": "…", "english": "…" } ] } ] } ] }
   ```
5. **Check.** Add the unit to `data/ladder/hi/ladder.json` (section 3.1 for the shape of each entry; the file starts with `"lang": "hi", "version": 1, "after": "stage0"`), run `npm run ladder:check -- hi`, read the unit's row: coverage ≥ the planned figure minus two points, new lemmas as listed (a larger count means a word was misread or an unlisted word was used: find it), then the findings. A warning is advice; an error means redraft. Do **not** pad. For an authentic placement run `npm run ladder:place -- --lang hi <textId>`.
6. **Report.** In `review.notes` list: words used outside the plan, homograph traps met, honorific choices, anything a Christian or Hindu reader might find odd. The plan owner moves repeated outside words into the lists (and the Hindi session adds the words of section 6).
7. **After a stage is drafted**, re-run the measurement (as the Spanish plan did after its first pass): the plan's coverage figures are estimates, and the measured ones decide whether the next stage's budgets rise or fall.
