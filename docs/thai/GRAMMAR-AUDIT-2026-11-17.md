# Thai grammar audit, 2026-11-17

Auditor: a grammar-audit session (an AI model, not a native speaker of Thai). Code audited: master `985c742b`, read-only, in the
shared clone `C:\Users\CJWal\dev\go-v0-rc`. Brief from the owner: audit the linguistic content, be brutal, note every missed
feature and detail, and weigh every finding against what the GoLearn card actually shows.

Thai has no inflection, so this audit is about four things the card does for a Thai word: **where it cuts the word** (Thai
writes no spaces), **how it says the word is read** (romanisation and tone), **which word class and meaning it gives**, and
**what it says the word does in the sentence**.

## 1. Verdict

Thai is half sound and half not fit for a learner.

- **The reading rules are the strong part.** The syllable and tone decoder is careful: on 212 words probed one by one it named a
  wrong tone for about 10, all of them loanwords or Indic words with a hidden syllable, and it says "the tone of this spelling is
  not certain" instead of guessing for most of the hard ones. Number + classifier, the polite particles (ครับ / ค่ะ / คะ with
  the statement–question difference), the final particles and the listed phrases are right.
- **Word cutting is the weak part, and it is worse than the pack admits.** The card's "word" is whatever the browser's ICU
  dictionary cuts. On 624 words of ordinary Thai there were 9 wrong cuts, and whole classes of words are cut wrongly every
  time: Thai personal names, Bible names in plain text (ยาโคบ is shown as ยา "medicine" + โค + บรัก; มารีย์ as มา "to come" +
  รีย์), loanwords and brands (โควิด is โค "ox" + วิด), and anything followed by a glued ๆ (ผมชอบกินอาหารอร่อยๆ is cut อา · หา ·
  รอ · ร่อย · ๆ). **53 of 512 everyday words** that the installed dictionary has as headwords (น้ำแข็ง ice, ตู้เย็น fridge, สนามบิน
  airport, เครื่องบิน aeroplane, มือถือ mobile phone, ว่ายน้ำ to swim) are always cut into their parts, so the learner never
  sees the dictionary's entry: ตู้เย็น is shown as "cupboard" + "evening".
- **One word, one meaning.** The word list gives almost every function word and homograph a single reading at confidence
  0.92 with no alternative. ที่ is always "that, who, which" (also in ผมอยู่ที่กรุงเทพ "at"); ของ is always "of" (also in ซื้อของ
  "things"); ผม is always "I (male)" (also in สระผม "hair"); เขา is always "he, she, they" (also in ขึ้นเขา "mountain"); เย็น is
  always the noun "evening" (also in น้ำเย็น "cold water", a sentence of the course's own unit `th-b1-10`); แล้ว is always
  "already" (also "then"). ให้ is inverted in its two commonest uses: in แม่ให้เงินลูก the card shows "for, to", and in
  ผมซื้อของให้แม่ it shows "to give".
- **Mission vocabulary is thin exactly where the texts are hardest.** In the Lord's Prayer ข้าแต่ ("O …") is shown as ข้า "I
  (old style)" + แต่ "but"; ข้าพระองค์ ("I / we", speaking to God) as "I" + "he (royal/divine); God"; แผ่นดิน ("kingdom") as
  "sheet" + "soil". พระองค์ never has the meaning "You". สิ้นพระชนม์ ("to die", of Jesus or a king) is a blank card. พระเยซู and
  พระคัมภีร์ have no romanisation and no tone.
- **Three romanisation schemes, none named.** The card's own line is RTGS without tones or vowel length (ข้าว "rice" and เข้า
  "to enter" are both "khao, falling"); when the analyser has none (29 % of its own word list), the card falls back to
  Wiktionary's scheme with tone marks and long vowels ("roong-riian", "bàat"); the course's sound lessons use a third, English
  respelling ("dee", "poo", "sawng"). Nothing on the card says which scheme a line is in or that RTGS drops tone and length.

On 624 words of running text I count 7 blank cards (1.1 %) and about 57 readings that are wrong (9 %); a further 79 words
(12.7 %) get only a part of speech from the dictionary headword list and no meaning of their own. On the course's own ladder
texts the word list covers 94.5 % of the words; on a news paragraph it covers 74 %. The list was written for the course's
texts, and it shows.

## 2. How this was audited, and the numbers

1. Read the adapter in full except where noted: `src/adapters/th.ts`, `thai/text.ts`, `orthography.ts`, `constructions.ts`,
   `paradigm.ts`, `phrases.ts`, `names.ts`, `entries.ts`, `function-words.ts`, `classifiers.ts`, `lexicon-core.ts`,
   `lexicon-everyday.ts`, `dictionary-words.ts`, `table-tags.ts`; the headers of `segmentations.ts`, `orth-exceptions.ts` and
   `syntax.ts`; the pack and the orientation; the card parser (`packages/golearn-extension/src/parser/index.ts`) and the
   parts of the content script and popup that decide what a Thai card shows.
2. There is no inflection table, so I dumped **the whole word list as the card shows each row alone** (`dump.mts`,
   `dump-wordlist.tsv`: 1,692 rows with part of speech, meaning, role, the tokenizer's cut of the word, the card's
   romanisation, the tones the card names, the dictionary's romanisation and IPA, the classifier note of the Forms section)
   and read all of it. The dump also compares, mechanically, the card's tones and romanisation with the dictionary's IPA.
3. Rewrote the probe around the adapter's own tokenizer (`thprobe.mts`: it prints the cut of the sentence, then the card for
   the selection at its real offsets, the dictionary meaning, the romanisation, the pronunciation notes, the dictionary
   record's romanisation and IPA, and the cuts the "How this selection cuts into words" section would list). Ran **617
   selections and 117 cut-only sentences** in five batteries (`b1` segmentation, `b2` reading, `b3` grammar, `b4` names,
   numbers, marks, loanwords, `b5` last checks).
4. Wrote 624 words (adapter tokens) of running Thai: an everyday narrative, a news paragraph, a conversation, article 1 of
   the human-rights declaration, the Lord's Prayer and John 3:16 (the last three from memory), and ran every token through
   the card (`cover.mts`, rewritten around the tokenizer). Then read the output and counted wrong cuts and wrong readings by
   hand.
5. Checked 512 everyday words against the course word list and the dictionary headword list, and whether the tokenizer keeps
   each one whole (`core.mts`).
6. Ran the adapter over the course's own texts (98 ladder units, 22 Stage 0 scenes; `ladder.mts`), read the 12 Stage 0 sound
   lessons in full and three ladder units in part, and tried the sentence splitter on seven short texts (`sent.mts`).

Everything (inputs, outputs, scripts) is in `C:\Users\CJWal\dev\tmp-mem\thaudit\`.

| Measure | Thai |
|---|---|
| Running text: word tokens as the adapter cuts them | 624 |
| Running text: blank card (no reading) | 7 (1.1 %) |
| Running text: only a part of speech from the dictionary headword list, no meaning of the card's own | 79 (12.7 %); news paragraph alone 29 of 123 (23.6 %) |
| Running text: reading from the course word list | 538 (86.2 %); news paragraph alone 91 of 123 (74.0 %) |
| Running text: reading that is **wrong** (my count, by hand) | about 57 (9 %): 14 from 9 wrong cuts, 43 a wrong meaning or class for a rightly cut word |
| Running text: wrong cuts | 9 places (18 tokens, 4 of them blank) |
| Running text: romanisation given by the analyser | 558 (89.4 %); the rest fall back to the dictionary's scheme or have none |
| Targeted probes: selections / of them blank / of them a "word" the adapter cut into several tokens | 617 / 17 / 70 |
| Word list: rows / names / other rows | 1,692 / 401 / 1,291 |
| Word list rows the tokenizer cuts into pieces when the word is written alone (no U+200B) | 442: 311 of 401 names, 131 of 1,291 other rows |
| Word list rows that are one token (1,250): no romanisation from the analyser | 365 (29 %) |
| Word list rows where the card names tones (1,145): tones that contradict the dictionary's IPA on the same card | 17, plus 4 that I am sure of and 8 "check" among rows the dictionary lacks |
| Word list rows with a wrong romanisation on the card | 4 (แปล, เจริญ, โทร, เบลา) |
| Everyday words checked (by form only) | 512: 366 in the course list (71 %), 139 only dictionary headwords (27 %), 7 in neither |
| Everyday words that are headwords but are always cut into parts | 53 of 512 |
| Course ladder (98 units, 49,557 tokens): course list / dictionary only / no reading | 94.5 % / 5.3 % / 0.28 % |

The targeted probes were chosen to find faults; only the running-text rows are coverage figures. The hand counts could be
off by a few either way. The Lord's Prayer repeats ข้าพระองค์ six times, which raises the wrong count of that section.

## 3. What the card shows, and what is wrong with each part

| Part of the card | State | Section |
|---|---|---|
| The word itself (the cut) | Wrong for names, loanwords, abbreviations, glued ๆ, and for compounds the learner needs whole; 9 wrong cuts in 624 words | 4.1 |
| Lemma, part of speech, own meaning | One fixed reading per word; wrong for the commonest function words and homographs outside that one use | 4.2, 4.3 |
| Role line | Shows the word list's fixed role ("relative or complement marker") even where the syntax rules have found another ("preposition ที่ marking กรุงเทพ"); the two disagree on the same card | 4.3 |
| Alternatives | Almost never offered: the list has one row per word | 4.2 |
| Transliteration | RTGS without tone or length, not named; missing for 29 % of the word list; then replaced by another scheme; 4 wrong | 4.5 |
| Pronunciation notes (class, tone by syllable) | Right for regular spellings; wrong tones stated for about 30 list words, with the dictionary's IPA beside them saying otherwise | 4.5, 5.1 |
| Dictionary meaning | Usually right; odd or offensive first senses for some common words | 4.7 |
| Grammar notes (constructions) | 33 patterns, mostly right when they fire; several common patterns have none | 4.6, 6 |
| Fixed phrases | 70 units (65 + the 5 of the first seed), right when they fire; they do not change the wrong word reading beside them | 4.6 |
| "How this selection cuts into words" | Computed separately from the card's own cut and contradicts it | 4.1 |
| Forms section | Says, correctly, that Thai does not inflect; then lists machine identifiers (`progressive-kamlang`, `future-ja`) (from the code) and a classifier note that is wrong for several nouns and empty for all animals and people | 5.3 |
| Register and "what a classifier counts" | Recorded in the word list but not passed to the card (from the code: `parser/index.ts` never reads `register` or `counts`); the learner sees them only where the gloss text happens to say so | 5.5 |

Full dictionary records **do** exist for Thai (`public/dict/th/full/`, 20,860 records, 20,789 with IPA), unlike most of the
other languages. So the Thai card has a second source for pronunciation. It does not use it to check itself: the analyser's
tone line and the dictionary's IPA sit on the same card and contradict each other for the words of 5.1.

## 4. Findings on the card

Each line: the sentence, the selection, what the card shows, what is correct. All seen through the probe unless marked
"from the code". `·` marks the adapter's cuts.

### 4.1 The cut

**Wrong cuts in ordinary sentences**

| Sentence | The card's cut and reading | Correct |
|---|---|---|
| ยาโคบรักโยเซฟมาก | ยา "medicine" · โค · บรัก (blank) · โยเซฟ; Joseph's role is "object of 'บรัก'" | ยาโคบ · รัก · โยเซฟ · มาก. Jacob is in the word list; the row is never reached in text without U+200B |
| มารีย์เป็นมารดาของพระเยซู | มา "to come" · รีย์ (blank) | มารีย์, Mary |
| เปาโลเขียนจดหมายถึงทิโมธี | จด · หมาย · ถึง · ทิ (blank) · โมธี (blank) | จดหมาย "letter" · ถึง · ทิโมธี |
| ผมชื่อสมศักดิ์ / สมชายรักสมหญิง | สม (verb) · ศักดิ์ (noun); สม · หญิง "woman" | the names สมศักดิ์, สมหญิง (after ชื่อ too) |
| พระราชาไปหามเหสี | ไป · หาม "to carry" · เห · สี "colour" | ไป · หา · มเหสี "went to see the queen" |
| พระราชินีเสวยพระกระยาหาร | เสวยพ (blank) · ระ · กระยาหาร | เสวย · พระกระยาหาร |
| ขอกระเป๋าใบนั้น | ขอก (blank) · ระ · เป๋า (blank) · ใบ "leaf; sheet, object of 'ระ'" | ขอ · กระเป๋า · ใบ (classifier) · นั้น |
| เขามีเพื่อนมากๆ | เพื่อ "in order to" · นมาก (blank) · ๆ | เพื่อน · มากๆ |
| ผมชอบกินอาหารอร่อยๆ | อา · หา · รอ · ร่อย (blank) · ๆ | อาหาร · อร่อยๆ |
| คนที่มาเมื่อวานเป็นหมอ | คน · ที่มา (noun, "origin; source") | คน · ที่ · มา "the person who came" |
| ฝนตกหนักมาก | ตกหนัก, one token, blank | ตก · หนัก |
| ผมเลยไปถึงที่ทำงานสาย | ถึงที่, one token, blank | ถึง · ที่ทำงาน |
| พอกลับถึงบ้าน | พอก · ลับ | พอ · กลับ |
| ลูกสาววิ่งมากอดผม | มาก "very" · อด "to go without" | มา · กอด "came and hugged" |
| ได้รับผลกระทบ | ผลก (blank) · ระ · ทบ | ผล · กระทบ (ผลกระทบ "effect") |
| หาไม่เจอ | หาไม่ · เจอ | หา · ไม่ · เจอ "cannot find" |
| ไปสิ / ไปซิ | one token, blank | ไป · สิ. (กินสิ is cut correctly) |
| เคารพสักการะ | สัก · กา · ระ | สักการะ |
| ตีสามสิบห้านาที | ตี "to hit" · สามสิบ "thirty" · ห้า | ตี · สาม · สิบห้า · นาที, 3.15 a.m. The rule that pins the tens makes this cut every time |
| รถไฟฟ้าบีทีเอส | รถ · ไฟ · ฟ้า "sky" · บี · ที · เอส | รถไฟฟ้า · บีทีเอส |
| โควิดระบาดหนัก | โค · วิด | โควิด |
| เฟซบุ๊กและไลน์ / ไมโครซอฟท์ / เซเว่น | เฟ · ซบุ๊ก; ไลน์ blank; ไมโคร · ซอฟท์; เซ "to stagger" · เว่น | the loanwords |
| นายกฯ แถลงข่าว / รมว.คลัง / พ.ศ. / น. | นา "rice field" · ยกฯ; รมว.คลัง one blank token; พ.ศ and น blank | the abbreviations (the dictionary line knows รมว., พ.ศ.) |
| เธอสวยมากกกก | มา "to come" · กก · กก | มาก, lengthened |
| เป็นของพระองค์สืบๆไป | พระ · องค์ (classifier) | พระองค์ (cut correctly elsewhere in the same prayer) |

**Compounds that are words of the installed dictionary but are always shown as their parts**

The repair pass joins pieces only when one piece is unknown. When every piece is itself a word, the compound is never
rejoined and the dictionary is never asked for it (the dictionary is asked only for a one-token selection; from the code).

| Word | The card shows | Meaning lost |
|---|---|---|
| น้ำแข็ง | น้ำ "water" + แข็ง, "adjective describing 'น้ำ'" | ice |
| ตู้เย็น | ตู้ "cupboard" + เย็น "evening" | refrigerator |
| ที่นั่ง | ที่ "that, who, which" + นั่ง "to sit" | seat |
| การเดินทาง | การ + เดิน "to walk" + ทาง "way" | journey; เดินทาง "to travel" |
| สนามบิน, เครื่องบิน | สนาม + บิน "to fly"; เครื่อง + บิน | airport, aeroplane |
| มือถือ, ว่ายน้ำ, ขี้เกียจ, น่ารัก | parts | mobile phone, to swim, lazy, cute |
| คนขับรถ, ผู้ใหญ่บ้าน, ผู้อำนวยการ | คน + ขับ + รถ; ผู้ใหญ่ "adult" + บ้าน; ผู้ + อำนวย + การ "(prefix: the act of …-ing)" | driver, village headman, director (the last is in the course's own unit `th-a2-1-05`) |
| เจ้าหน้าที่ | เจ้า "you, he, she (old or literary)" + หน้า "face" + ที่ | official |
| แผ่นดิน | แผ่น "sheet, flat piece" + ดิน "soil" | land; kingdom (Lord's Prayer) |
| เสมอภาค | เสมอ "always" + ภาค | equal (article 1) |
| งบประมาณ, เสียหาย, ช่วยเหลือ, ครัวเรือน | งบ + ประมาณ "about"; เสีย + หาย "to disappear"; ช่วย + เหลือ "to be left over"; ครัว "kitchen" + เรือน | budget, damaged, to help, household |
| หมายถึง, ลุกขึ้น, หญิงสาว, เมื่อใด | parts, although each is a row of the course word list | 131 list rows of this kind are dead in plain text (5.4) |
| ปลาทู, เมืองหลวง, เลขที่, ข่าวประเสริฐ, พระวรสาร | ปลา + ทู; เมือง + หลวง; เลข + ที่ "that"; ข่าว + ประเสริฐ; พระ + ว + รสาร | mackerel, capital, number, gospel, Gospel (book) |

The opposite fault: **ประเทศไทย** ("Thailand") and **คุณครู** ("teacher", polite) are kept as one token that neither list
has, so the card is blank.

**The segmentation panel contradicts the card.** "How this selection cuts into words" re-cuts the selected string by itself.
Selecting มเหสี in พระราชาไปหามเหสี: the card lists หาม + เห + สี, the panel shows "มเหสี?" as one piece. Selecting ยาโคบ: the card
lists ยา + โค + บรัก, the panel shows ยา + โคบ? at 50 % and ยาโคบ (Jacob) at 50 %. The learner is given two cuts and no way to
choose.

**A selection that is not on token boundaries** is handled well: half a word gives the whole word with the note "The
selection is part of the word …"; two words give each word on its own line.

**Sentence units.** A paragraph whose sentences are separated by single spaces is one unit (เมื่อวานฝนตกหนัก ผมเลยไม่ได้ไปทำงาน
วันนี้อากาศดี ผมจะไปตลาดกับเพื่อน: 1 unit of four sentences); only a polite particle before the space breaks it. The pack says
so. It means that the "sentence" the role line reasons about is often several sentences.

### 4.2 One reading per word, shown as certain (0.92, no alternative)

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| ผมอยู่ที่กรุงเทพ; ที่ร้าน; ที่ตลาด | ที่ | SCONJ "that, who, which", role "relative or complement marker" | "at" |
| ที่นี่ไม่มีที่จอดรถ; ที่นั่น | ที่ | the same | "here / there"; "place" (noun) |
| เขาเป็นลูกคนที่สอง; ชั้นที่สาม; ที่หนึ่ง | ที่ | the same (the ordinal note fires, the reading does not change) | ordinal marker |
| วันจันทร์ที่ 5 มกราคม | ที่ | the same, and no ordinal note (the rule needs a number word, not a digit) | "the 5th" |
| ผมไปซื้อของ; ของนี้แพง | ของ | ADP "of", "preposition (of, belonging to)" | noun, "thing(s), goods" |
| แม่ว่าลูก; คุณว่าอย่างไร; หัวหน้าไม่ได้ว่าอะไร | ว่า | SCONJ "that (complementizer)" | verb, "to scold; to say; to think" |
| ผมยาวมาก; เธอสระผมทุกวัน | ผม | PRON "I (male)" | "hair" |
| เราขึ้นเขาไปดูพระอาทิตย์; ควายมีเขาสองข้าง | เขา | PRON "he, she, they" | "mountain"; "horn" |
| ฉันชอบกินมันทอด | มัน | PRON "it; he, she (rude)" | "potato, yam" |
| แมวจับหนู | หนู | PRON "I, you (to or from a child)" | "mouse, rat" |
| ผ้าไหมสวยมาก | ไหม | PART "(yes/no question particle)" | "silk" |
| ขวดเปล่า | เปล่า | INTJ "no, not so (denying)" | "empty" |
| พี่ขา ช่วยหน่อย | ขา | NOUN "leg", "noun modifying 'พี่'" | a woman's polite particle after a form of address |
| เขาปวดหลัง | หลัง | ADP "after, behind", "preposition" | noun, "back" |
| อากาศเย็นมาก; น้ำเย็น; ไม่ดื่มน้ำเย็นจัด (course unit th-b1-10) | เย็น | NOUN "evening", "noun modifying 'น้ำ'" | adjective, "cool, cold". The list has no adjective เย็น |
| เขามีกำลังมาก | กำลัง | AUX "in the middle of (doing)", "progressive marker on 'มี'" | noun, "strength" |
| เขาอยู่ที่บ้าน | อยู่ | AUX, "continuing-state marker" | main verb, "to be at, to live" (the gloss has it; class and role do not) |
| ผมได้เงินมา; ได้มะม่วงมาสามลูก | ได้ | AUX "can; got to", "ability marker" | main verb, "to get, to receive" |
| ไปยังกรุงเทพ | ยัง | ADV "still, yet", "aspect marker on 'ไป'" | "to, towards" |
| แล้วเขาก็ไป; แล้วเจอกัน; ยิ้มแล้วยื่น…; แล้วคุณล่ะคะ | แล้ว | ADV "already", "completed or changed-state marker" | "then; and (what about)". 6 times in the running text |
| ผมเลยไปถึงที่ทำงานสาย | เลย | PART "(emphasis: at all; right away; very)" | "so, therefore" |
| เขาเดินเลยบ้านไป | เลย | the same | verb, "to pass, go beyond" |
| ยากันยุง | กัน | ADV "each other; together" | verb, "to keep off" |
| เขาถูกหวย | ถูก | ADJ "cheap; correct" | "to hit, win (the lottery)" |
| เขากลับบ้านตีสอง | ตี | VERB "to hit", "second verb in a chain with 'กลับ'" | "2 a.m." |
| ชามละห้าสิบบาท; วันละสามครั้ง (course unit th-b1-10) | ละ | PART "(short form of ล่ะ or แล้ว)", "follow-up particle" | "per, each" |
| ตั้งศูนย์พักพิง | ศูนย์ | NUM "zero" | noun, "centre" |
| วัดหลายแห่ง | แห่ง | ADP "of" | classifier for places (the list has it; the context rule does not pick it) |
| แก่ข้าพระองค์ทั้งหลาย | แก่ | ADJ "old (people); aged" | preposition, "to" (in the list, second) |
| นักวิเคราะห์ | นัก | ADV "very, too (as in นักหนา)" | the agent prefix "one who …" (not in the list at all, though นักเรียน is) |
| ไปถึงที่ทำงานสาย | สาย | NOUN "line, string" | "late" |
| ไว้คราวหน้านะคะ | หน้า | NOUN "face; front" | "next" |
| ผมเอาอันนี้ | อัน | SCONJ "which, that", "relative marker" (the classifier is the 0.3 alternative) | classifier, "this one" |
| เค้าไม่มา | เค้า | NOUN from the dictionary (trace, outline); the pronoun is the 0.55 alternative | spoken spelling of เขา |
| พระฉันอาหารเช้า | ฉัน | PRON "I (neutral/female)" | "to eat" (of a monk) |
| เล็กไปหน่อยครับ; ต้นไม่สูง | เล็ก, ต้น | PROPN "Lek (a given name)", "Ton (a given name)", 0.8 | "too small"; "the tree is not tall". The course-cast name rule fires on any sentence that starts with these words |
| มีนักเรียน ๑๒๓ คน; มีคน ๕ คน | คน | NOUN "person" (classifier at 0.3) | classifier. After a number word (สิบคน) it is right; after digits the rule for คน does not look at them |
| นักเรียนคนหนึ่ง | คน | NOUN "person", with role "classifier of 'นักเรียน'" on the same card | classifier |
| น้องสาวฉันอายุสิบสองปี | อายุ | VERB | noun, "age" (the list row is a verb row) |
| ศิษยาภิบาลเทศนาเรื่องความรอด | เทศนา | NOUN, "noun modifying 'ศิษยาภิบาล'" | verb, "preaches" |

### 4.3 ให้, and the role line

| Sentence | The card shows for ให้ | Correct |
|---|---|---|
| แม่ให้เงินลูก; ผมให้หนังสือเขา; ครูให้การบ้านเยอะ | ADP "for, to (benefactive)", 0.6 | main verb, "to give" |
| แม่ให้ลูกไปโรงเรียน | ADP "for, to (benefactive)"; no causative note | "to let, to make" |
| ผมซื้อของให้แม่ | VERB "to give; to let", 0.55 | "for" |
| ที่แม่ทำไว้ให้ | VERB "to give; to let" | "for (me)" |
| ผมอ่านหนังสือให้ลูกฟัง; ยื่นถุงผลไม้ให้เธอ | ADP "for, to" | right |

The rule reads ให้ as "for" whenever the word before it is a noun, pronoun or verb (from the code, `th.ts` `contextualWord`),
which is where the subject of "to give" stands. The benefactive in ซื้อของให้แม่ fails because ของ is not a noun in the list.

The role line shows the word list's fixed role when the row has one and the syntax rule's result only otherwise (from the
code, `parser/index.ts`). So for ผมอยู่ที่กรุงเทพ the syntax rule says "preposition ที่ marking กรุงเทพ" and the card prints
"relative or complement marker"; for กินข้าวด้วยช้อน it prints "also / together marker" for "with a spoon". A predicate is
"the main word of the sentence", including สวยขึ้นมาก → ขึ้น and แพงไป → ไป.

### 4.4 Blank cards

ประเทศไทย, คุณครู, สิ้นพระชนม์, ตกหนัก, ถึงที่, ไปสิ, ไปซิ, ฯลฯ, พ.ศ., น., รมว.คลัง, ไลน์, อุตุนิยมวิทยา, เกียรติศักดิ์, ภราดรภาพ; a number in
digits (probed with ๑๒๓: "No word was found in the selection (only punctuation or numerals)"; digits, Arabic or Thai, are
never word tokens); every Latin-script word (as the pack says); the fragments of wrong cuts above.

Basic words that have a part of speech but **no meaning of the card's own** (dictionary headword only): ตก "to fall" (59
times in the course ladder), พา, เจ็บ, รีบ, ถือ, ยืม, ตรง, ข้าง, ซ้าย, ขวา, กระเป๋า, หน้าต่าง, ห้องน้ำ, แม่น้ำ, น้ำตาล, บริษัท, จังหวัด,
ธนาคาร, โรงแรม, มหาวิทยาลัย, คอมพิวเตอร์, พยาบาล, อ้วน, ผอม, หวาน, เลว, รวย, บ่อย, แน่นอน, เชียงใหม่, กรุงเทพ. 139 of the 512
everyday words are of this kind.

### 4.5 Romanisation and tone

- **The scheme is not named and loses what a learner most needs.** The analyser's line is RTGS: no tone, no vowel length,
  ch for จ ฉ ช, o for โ and อ. The card shows "khao" for ขาว, ข่าว, ข้าว, เขา, เข้า, เข่า; "mai" for ไม่, ไหม, ใหม่, ไหม้, ไม้; "ma"
  for มา, ม้า, หมา. The tone is given in a separate note. Vowel length is given nowhere by the analyser: ข้าว (long) and เข้า
  (short) are both "khao" + "falling". Nothing on the card says that the line is RTGS or what it leaves out.
- **A second scheme appears without warning.** When the analyser gives no romanisation the card shows the dictionary's
  (from the code, `popup/card.ts`; the only sign is a hover title). So โรงเรียน is "roong-riian", บาท "bàat", กาแฟ
  "gaa-fɛɛ", next to ตลาด "ta-lat" and ถนน "tha-non". In that scheme ก is g, ป is bp, ต is dt. 365 of the 1,250 one-token
  rows of the word list (29 %) are in this case, among them โรงเรียน, นักเรียน, สามี, ราคา, กาแฟ, ทะเล, เวลา, นาที, บาท, ทำงาน, ใจดี,
  ขอโทษ, อากาศ, ปัญหา, โอกาส, โบสถ์, จันทร์, ศุกร์, เสาร์.
- **Three spellings inside the analyser's own line:** hand-typed without hyphens (khaochai, thukkhon, sawatdi, phraong),
  decoded with hyphens (phu-ying, tha-han), and "wan nueng" with a space.
- **No reading aid at all** (no romanisation, no tone, and no dictionary record to fall back on) for พระเยซู, พระคัมภีร์,
  พระบิดา, พระวิญญาณ, พระวจนะ, พระพร; พระบุตร has a romanisation and no tone. พระเจ้า and พระองค์ show "The tone of this spelling is
  not certain; Go does not guess it" although their tones are regular (phrá-jâo, phrá-ong).
- **Wrong tones or syllables named for single words** (probe `b2`): คอมพิวเตอร์ "คอม mid, พิว mid, เตอร์ mid" (เตอร์ is
  falling); เทป "falling" (high); ชีส "falling" (high); กราฟ "low" (high); ออฟฟิศ "ออฟ low, ฟิศ high" (high, high); แสดง "แส
  rising, ดง mid" (สะ low, แดง mid); เสมอ "เส rising, มอ mid" (สะ low, เหมอ rising); ญาติ "ญา mid, ติ low" (one syllable, yâat,
  falling); ภูมิ "ภู mid, มิ high" (one syllable, phuum, mid); อยุธยา "อ low, ยุธ low, ยา mid" (four syllables: à-yút-thá-yaa).
  The dictionary's IPA on the same card is right in each case.
- **Repeated words:** เด็กๆ is romanised "dek" and its tone note reads "เด็กๆ low". It is said twice: dek-dek.
- Good: the leading ห and อ (หมา, หนู, หญิง, อยาก, อยู่, อย่า, อย่าง), the tone marks on all three classes, live and dead
  syllables, ทร = s (ทราบ, ทราย, ทรง), จริง, สร้าง, เศร้า, เพชร, ธรรม, สามารถ, ผลไม้, ไทย, the unwritten vowels (ถนน, ตลาด, สนุก,
  ขนม, สบาย, ทหาร, อร่อย), การันต์ (จันทร์, สัปดาห์, ศักดิ์, อาทิตย์), รร (สวรรค์, ภรรยา), the eight finals, เลย / เคย / เนย, and
  those of the 112 listed irregular words that I probed (มหาวิทยาลัย, วิทยาศาสตร์, ราชการ, คุณภาพ, สุขภาพ, รัฐบาล, กรกฎาคม,
  โทรศัพท์, ยุติธรรม, กษัตริย์) are all right.

### 4.6 Grammar notes and phrases

Right when they fire: กำลัง + verb, verb + อยู่, จะ, เคย, verb + แล้ว, ยังไม่, ไม่ได้ + verb, verb + ได้, ต้อง / ควร / อยาก, ถูก /
โดน + doer + verb, ทำให้, verb + ว่า, adjective + กว่า, ที่สุด, noun + classifier + นี้, ๆ, อย่า, ไม่ … เลย, ทรง + verb, ความ +
word, การ + verb, question words, ไหม / หรือเปล่า, number + classifier. Phrases that fired correctly: กินข้าว, ไม่เป็นไร,
ยินดีที่ได้รู้จัก, สบายดี, เพราะว่า, ถึงแม้ว่า, หรือเปล่า, ด้วยกัน, ช่วยด้วย, เชื่อใน…, ไม่มีใคร, ใครก็ได้, ขอให้, หลังจาก, เมื่อไหร่, เท่าไหร่,
ยังไง.

Faults:

- **A note beside a wrong reading.** The phrase แล้วก็ "and then" is shown, and the word แล้ว beside it still reads "already".
  ขอให้ "may; I hope that" is shown, and ให้ still reads "for, to (benefactive)".
- **No note** for: adjective + ขึ้น / ลง (สวยขึ้น, ผอมลง: ขึ้น is "to go up, the main word of the sentence"); adjective + ไป /
  เกินไป (แพงไป: ไป is "to go"); verb + ไม่ + result (หาไม่เจอ, นอนไม่หลับ, มองไม่เห็น, คิดไม่ออก: only "ไม่ + verb"); causative ให้
  after a noun subject; ที่ + clause after an adjective (ดีใจที่คุณมา); ไม่ว่า "no matter" (ไม่ "not" + ว่า "that"); หรือว่า;
  ก็ in any use but ถ้า … ก็ (it is always "linking particle"); เป็น with an illness (เป็นไข้ is "to be": links the subject to
  'ไข้'); ทั้ง … และ; noun + classifier + หนึ่ง / เดียว beyond องค์เดียว; ordinal ที่ before a digit.
- **Question words after a negative** (ผมไม่รู้อะไรเลย): the reading stays "what, question word"; the note is only lowered in
  confidence.

### 4.7 The dictionary meaning line

First or early senses that mislead on a common word: กี่ "loom (weaving machine)"; น้ำตาล "palmyra palm juice; a traditional
intoxicating beverage"; กรุงเทพมหานคร "Ayutthaya Kingdom …; Thon Buri Kingdom"; กษัตริย์ "kṣatriya: those who fight … one of
the four social classes"; ดิฉัน "a first person pronoun employed by a male" (beside the card's own "I (woman, formal)"); บาง
"narrow or small watercourse"; เมื่อ "classifier for a time, times"; กำลัง "force; strength" (right for the noun the card
does not have); ต่าง "a shoulder pole carried by a beast of burden". **พิซซ่า: "pizza ; section 112 of the Thai Penal Code,
which criminalises lèse majesté"** as the second sense of a food word, and สวย third sense "to undergo something bad, such
as to get scolded or punched": slang senses that should not be among the first three on a beginner's card, the first of
them on a subject that is legally sensitive in Thailand.

## 5. Every wrong entry found in the word list (the dump)

### 5.1 Tones and syllables the card names wrongly

The card prints "Tone by syllable: …" for these rows. The first group contradicts the dictionary's IPA, which the card also
shows; I am sure of each.

| Word | The card names | Correct |
|---|---|---|
| เสมอ | เส rising, มอ mid | สะ low, เหมอ rising |
| แสดง | แส rising, ดง mid | สะ low, แดง mid |
| ขณะ | ข low, ณะ high | low, low |
| เกียรติ | เกียร mid, ติ low | one syllable, kìat, low |
| ภูมิใจ | ภู mid, มิ high, ใจ mid | phuum-jai: mid, mid |
| สมมุติ | สม rising, มุ high, ติ low | sǒm-mút: rising, high |
| ข้าพเจ้า | ข้าพ falling, เจ้า falling | khâa-phá-jâo: falling, high, falling |
| อาตมา | อาต low, มา mid | àat-tà-maa: low, low, mid |
| เทวดา | เทว mid, ดา mid | thee-wá-daa: mid, high, mid |
| ราชสีห์ | ราช falling, สีห์ rising | râat-chá-sǐi: falling, high, rising |
| วิทยาลัย | วิท high, ยา mid, ลัย mid | wít-thá-yaa-lai: high, high, mid, mid |
| จักรยาน | จัก low, ร high, ยาน mid | jàk-krà-yaan: low, low, mid |
| นมัสการ | น high, มัส high, การ mid | ná-mát-sà-kaan: high, high, low, mid |
| อุปมา | อุป low, มา mid | ùp-pà-maa: low, low, mid |
| จักจั่น | จัก low, จั่น low | jàk-kà-jàn: low, low, low |
| อีสเตอร์ | อีส low, เตอร์ mid | high, falling |
| เจริญ | one syllable, mid | jà-rəən: low, mid |

Rows the dictionary lacks; sure: **รุ่งอรุณ** "รุ่ falling, งอ mid, รุณ mid" (รุ่ง falling, อะ low, รุณ mid); **แสวงหา** "แสว
rising, ง high, หา rising" (สะ low, แหวง rising, หา rising); **เกียรติยศ** "เกียร mid, ติ low, ยศ high" (low, low, high);
**มรณา** "มร mid, ณา mid" (mɔɔ-rá-naa: mid, high, mid).

Check (I believe a syllable is missing or the loan tone differs, but I have not confirmed it): อึกทึก (ùk-kà-thúk), เทพเจ้า
(thêep-phá-jâo), บัพติศมา (bàp-tìt-sà-maa), ศิษยาภิบาล (sìt-sà-yaa-phí-baan), มาร์ค "falling" (high), แชท "falling" (high), ไซส์
"mid" (high), ซิมการ์ด "การ์ด low" (high).

### 5.2 Romanisations the card shows wrongly

| Word | The card shows | Correct (RTGS) |
|---|---|---|
| แปล "to translate" | paen | plae |
| เจริญ "to prosper" | choen | charoen |
| โทร "to phone" | thon | tho |
| เบลา (Bela, a name) | blao | bela |

The first three are everyday words; โทร appeared in the running text.

### 5.3 The classifier note of the Forms section

The note is made by matching English words of the noun's gloss against English words of the classifier's "counts" text
(from the code, `paradigm.ts`). Results in the dump:

- **Wrong:** ตอน, เวลา, ขณะ → "Classifier: หน (counts times, occasions)" (หน counts occasions, as ครั้ง does; it does not count
  these nouns); จดหมาย "letter" and สาส์น → "ตัว (counts animals, letters, clothes, furniture)" beside the right ฉบับ (ตัว
  counts letters of the alphabet, not mail); ผ้า "cloth" → ตัว beside the right ผืน; ลูก "child (of someone); fruit; ball" →
  ลูก only (a child is counted with คน); พวก → ฝูง; สาย "line, string" → พวง.
- **Missing for the nouns a beginner counts first:** "The word list records no classifier for this noun" for หมา, แมว, ปลา,
  นก, ช้าง, ม้า, วัว, ไก่, หมู, งู (ตัว); ครู, หมอ, เพื่อน, นักเรียน, ตำรวจ, เด็ก (คน); โต๊ะ, เก้าอี้, เสื้อ (ตัว); ไข่ (ฟอง, ใบ); กล้วย,
  มะม่วง, ส้ม (ลูก, ใบ, ผล); ประตู (บาน). The dictionary record often carries the classifier (หมา: ตัว; ทหาร: คน, นาย) and the
  card does not join the two.
- The constructions under "Constructions to know instead" are passed to the card as identifiers (`classifier-phrase`,
  `classifier-demonstrative`, `reduplication-mai-yamok`, `relative-thi`), not as titles (from the code and `para.out.txt`).

### 5.4 Rows that can never be reached in ordinary text

The tokenizer cuts these rows into pieces when the text has no U+200B word marks (that is, everywhere except the Open Thai
Common Version). Confirmed in sentences for ยาโคบ, มารีย์, ทิโมธี, หมายถึง, ลุกขึ้น, หญิงสาว, เมื่อใด, ฟ้าสวรรค์.

- **311 of the 401 name rows**, among them ยาโคบ, อับราม, อิสอัค, ซาอูล, ซามูเอล, เอลียาห์, อิสยาห์, เยเรมีย์, ดาเนียล, โยนาห์, โนอาห์,
  ซาราห์, ราเชล, มารีย์, ซีโมน, ยากอบ, ยูดาส, ปีลาต, เฮโรด, ทิโมธี, บารนาบัส, สิลาส, ลาซารัส, อันดรูว์, พระคริสต์, พระเมสสิยาห์. Those that
  survive are the few that ICU happens to keep whole (โมเสส, เปาโล, ยอห์น, โยเซฟ) and those on the pin list (ดาวิด, เปโตร,
  อับราฮัม).
- **131 other rows**, among them พันธสัญญา, พระบัญญัติ, ฟ้าสวรรค์, อัครทูต, ปัสกา, ฤทธิ์เดช, พระพักตร์, ชั่วนิรันดร์, หมายถึง, ลุกขึ้น,
  หญิงสาว, บ้านเรือน, เมื่อใด, เหตุใด, สิ่งใด, รุ่งขึ้น, เช้าตรู่, โศกเศร้า, เยาะเย้ย, เกรงกลัว, ทอดทิ้ง, ใกล้ชิด, ห่างไกล, อุดมสมบูรณ์,
  ตรงกันข้าม, ล่วงประเวณี.

### 5.5 Word classes, meanings and gaps in the rows

- **Rows with the wrong or only one class** (each shown on the card in 4.2): อายุ VERB; เย็น NOUN only; ของ ADP only; ที่ SCONJ
  only; ว่า SCONJ only; ได้ AUX only; อยู่ AUX only; กำลัง AUX only; ผม, เขา, มัน, หนู PRON only; ไหม PART only; เปล่า INTJ only;
  ขา NOUN only; ศูนย์ NUM only; ตี VERB only; ละ PART only; นัก ADV only; กัน ADV only; ยัง ADV only; แล้ว ADV only; เลย PART
  only; หลัง ADP and CLF (no noun "back"); อัน SCONJ before CLF; ถูก without "to touch, to hit".
- **พระองค์** "he (royal/divine); God": it is also "You" in every prayer. **ข้าพระองค์**, **ข้าแต่** are not rows.
- **เทวดา** "deity, spirit, angel-like being" and **ทูต** "envoy, messenger" are rows; ทูตสวรรค์ "angel" is not (check which
  word the translation the course uses has).
- **โมง** is a classifier "o'clock (daytime hours)" and **ทุ่ม** a noun "(evening hours: ทุ่ม marks 7-11 pm)": two classes for
  two words of the same kind, and neither says how the count runs (หนึ่งทุ่ม is 7 p.m., สองทุ่ม 8 p.m.).
- Register tags (formal, colloquial, royal, literary, slang, Isan, northern, southern) and the classifiers' "counts" text
  are in the rows but do not reach the card (from the code). ครั้น "when", ซึ่ง "which, that", อนึ่ง "furthermore" therefore
  look like everyday words.
- Stale statements about the list itself: `th.ts` and the pack say "a hand lexicon of about 600 entries" and "about 60"
  phrase units; the list has 1,692 rows and 70 phrase units.

## 6. Grammar not modelled at all

- **Compounds.** No rule joins a compound whose parts are all words (4.1). No derivational prefixes as such: นัก-, ช่าง-,
  ชาว-, เครื่อง-, ที่- (ที่นั่ง, ที่ทำงาน, ที่อยู่), น่า- (น่ารัก, น่าเบื่อ), ขี้- (ขี้เกียจ), ใจ- beyond the listed five; ผู้- and การ- /
  ความ- are read as loose words.
- **Names.** Thai given names and surnames (สมศักดิ์, สมหญิง, วิชัย, มาลี), also after คุณ or ชื่อ; foreign names; place names
  beyond those the dictionary has; brands. The name rule covers only the five names of the course cast, and misfires on
  them (4.2).
- **Numbers.** Digits (Arabic and Thai) have no card and do not make the next word a classifier for คน; compound numbers
  are shown piece by piece with no value (ยี่สิบ + เอ็ด, สอง + ร้อย + ห้าสิบ); ordinals with digits; fractions; ครึ่ง as "half
  past"; the Buddhist era (no note anywhere that พ.ศ. is the Christian year + 543; พ.ศ. itself is blank).
- **Telling the time.** ตี + number (1–5 a.m.) is "to hit"; the six-hour clock (โมงเช้า, บ่าย … โมง, ทุ่ม, เที่ยง, เที่ยงคืน) has no
  note; 14.30 น. is blank.
- **Royal and monastic vocabulary (ราชาศัพท์).** เสด็จ, ประทาน, โปรด, ถวาย, รับสั่ง, พระราชทาน and ทรง + verb are there. Not there, or
  wrong: เสวย (mis-cut), สิ้นพระชนม์ (blank), ประชวร and ทรงพระ + noun, ตรัส (dictionary only), พระทัย, พระหัตถ์, พระพักตร์ (dead row),
  ฉัน "to eat" of a monk, อาพาธ, นิมนต์, กราบทูล, ข้าพระองค์, ข้าแต่, ฝ่าพระบาท, the reading of พระองค์ as "You".
- **Church words.** ข่าวประเสริฐ, พระวรสาร (broken), ทูตสวรรค์, ไม้กางเขน (as parts), ความรอด (as parts, with the ความ note),
  การอธิษฐาน, พระคุณ, คริสเตียน (in the list), สาวก (in the list, no reading aid), ศิษยาภิบาล (in the list).
- **Spoken and written variants.** เค้า (4.2), มั้ย and ยังไง (handled), อ่ะ / นะคะ fine, lengthened spellings (มากกกก), ไปสิ
  (blank), ก็ as "well …", จ้า, เนอะ, ป่ะ, มั้ง, แหละ (in the list), ไง as a final particle.
- **Sentence patterns.** Topic and comment; dropped pronouns; verb + ไม่ + result; adjective + degree word; ให้ as causative
  after a noun subject; pivotal sentences; ถูก / โดน with a noun ("won", "got hit by"); kin terms and titles as pronouns
  (the role text of พี่ and น้อง says so; ลุง, ป้า, ครู, หมอ, แม่, พ่อ do not).
- **Sentence boundaries** inside a paragraph written with single spaces (4.1).
- **Vowel length** on the card's own line, and any statement of the romanisation scheme (4.5).

## 7. Orientation and course texts

**Orientation** (`tutorial/th.ts`):

- "The two polite particles ครับ and คะ …; ครับ is said by men and คะ by women." A woman says **ค่ะ** (falling) in statements
  and answers and คะ (high) in questions and after นะ. The orientation never shows ค่ะ, the form a learner needs first. The
  word list itself has both, correctly.
- "the word list holds about 600 words, and a word outside it is left unanalysed": stale on both counts (1,692 rows; a
  dictionary headword is read with its part of speech).
- It teaches nothing of the classes, the tone rules or the classifier order, and says so.

**Pack** (`packs/th.ts`): the feature label "Classifier" is explained as "Counting nouns need a classifier word between the
number and the noun." That is the wrong order for Thai: noun + number + classifier (หนังสือสองเล่ม), which the pack's own
construction line beside it states correctly (from the code; Thai readings carry no features, so I did not see this line
on a card).

**Stage 0 sound lessons** (12 read in full). The tone rules as taught are correct and complete for the regular cases, and
the examples are well chosen. Faults:

- `th-snd7`: "เ is 'ay', and with a ็ above it **or a closing sound** it turns short (เด็ก is 'dek', เป็น is 'pen')". Only ็
  shortens it; with a plain closing consonant เ stays long (เลข, เอก, เพลง, เขต). Both examples have ็.
- `th-snd10`: the silent ห is said to stand "in front of ม น ง ย ล ว". It also stands before ร and ญ (หรือ, เหรอ, หญิง, ใหญ่,
  หญ้า), and หรือ, ใหญ่ and ผู้หญิง are everyday words.
- `th-snd2`: a live syllable is said to end "in an open vowel or a nasal sound (n, m, ng)". The finals ย and ว are also live
  (ขาว, สวย, เร็ว, ไป), and the open vowel must be long; the lesson's own later table has it right.
- `th-snd8`: ือ is described as "a throaty 'uh'". It is a long close back unrounded vowel, nearer to "oo" said with spread
  lips (check the wording with a teacher; "uh" will be heard as the vowel of เ◌อ).
- The lessons respell in English ("dee", "poo", "pai", "mae", "sawng", "phrung-nee", "khráp"); the card romanises the same
  words "di", "pu", "pai", "mae", "song", "phrung-ni", "khrap". A learner who goes from lesson to card meets a different
  spelling of the same sound.

**Ladder** (98 units, 49,557 tokens; read in part only). The adapter covers its own texts well (94.5 % from the course
list, 0.28 % blank); the commonest blanks are สุขใจ, หลับตา, ถึงที่, รดน้ำ, เป็นต้น, ข่าวดี. In the three units I read:

- `th-a2-1-05`: "เสื้อผ้าของแซมเก่าหมดแล้วไหมคะ". ไหม does not follow a statement closed with แล้ว; a Thai speaker would say
  …เก่าหมดแล้วหรือคะ or …แล้วเหรอคะ (check with a native speaker; I am fairly sure).
- `th-a2-1-05`: "ฉันว่าตัวใหญ่ไป ตัวเล็กไปค่ะ" is translated "the big one is too big and the small one too small"; as written it
  says "this one is too big, this one too small" (check).
- `th-b1-10`: the card misreads two words of the unit's own instructions (วันละสามครั้ง, น้ำเย็นจัด; 4.2).
- Good: มีตำรวจสองนาย uses the right classifier for officers; the polite particles follow the speaker throughout.

I did not read the other 95 units, the Stage 0 scenes beyond five, the exit forms, or the gold files.

## 8. What to fix first

1. **Give the function words their other readings and choose by position**: ที่ (at / place / ordinal / relative), ของ
   (things), ว่า (say, scold), ได้ (get), อยู่ (main verb), ยัง (to), แล้ว (then, at the start of a clause), เลย (so), ละ (per),
   กำลัง (strength), and let the role line show the syntax rule's result when it differs from the list's fixed role.
2. **Fix ให้**: main verb after a subject when a noun follows; "for" after verb + object; causative before person + verb.
3. **Add the missing homograph rows**: เย็น (cold), ผม (hair), เขา (mountain, horn), มัน (yam), หนู (mouse), ไหม (silk), เปล่า
   (empty), หลัง (back), ศูนย์ (centre), ตี (a.m.), นัก- (agent), ขา (particle), ฉัน (monk's "eat"), ถูก (hit), สาย (late), หน้า
   (next), with the neighbours that decide.
4. **Segmentation.** (a) Join a run of pieces when the whole is a dictionary headword and the reading as parts is listed
   as misleading, starting with the 53 everyday compounds of `core.out.txt`; at the least, ask the dictionary for a
   multi-token selection. (b) Stop a glued ๆ from breaking the words before it: cut ๆ off before ICU sees the run.
   (c) Use the name rows in plain text: search the text for listed names as is done for the pinned words. (d) Remove the
   rule that pins สามสิบ … เก้าสิบ after ตี, or cut by the clock pattern. (e) Add ประเทศไทย, คุณครู, สิ้นพระชนม์, ข้าพระองค์, ข้าแต่,
   แผ่นดิน, เจ้าหน้าที่, พระวรสาร, ข่าวประเสริฐ as rows with pins. (f) Make the segmentation panel show the card's own cut.
5. **Romanisation.** Name the scheme on the card; say that it drops tone and vowel length; show length (the decoder knows
   it) and the tone beside the syllable; never mix the dictionary's scheme into the same line without a label; correct
   แปล, เจริญ, โทร, เบลา; read เด็กๆ twice.
6. **Use the dictionary's IPA as a check**: where the analyser's tones differ from the dictionary's on the same word, show
   the dictionary's and mark the word irregular (the function `decodeWithPronunciation` exists and the card model never
   feeds it; from the code). That removes all of 5.1 at once. Add the 5.1 words to the exception list.
7. **Digits**: a digit before คน, and before any word that can be a classifier, makes it a classifier; give Thai and
   Arabic digits a card with the number read out (`thNumberToWords` exists).
8. **Mission vocabulary**: พระองค์ "You", the royal verbs of 6, reading aids for พระเยซู, พระคัมภีร์, พระบิดา, พระวิญญาณ.
9. **Classifiers**: replace the English word-matching with a classifier named in each noun row; start with animals (ตัว),
   people (คน) and the wrong ones of 5.3; show titles, not identifiers, under "Constructions to know instead".
10. **Dictionary line**: do not put slang or legal-slang senses among the first three; put the modern everyday sense first
    for น้ำตาล, กี่, กษัตริย์, กรุงเทพมหานคร.
11. **Orientation and lessons**: ค่ะ beside คะ; the เ rule of `th-snd7`; ร and ญ in `th-snd10`; one respelling scheme for
    lessons and card; the classifier sentence in the pack; the stale "about 600".

## 9. Limits of this audit

- I am a language model, not a native speaker, and looked nothing up. The readings marked "check" are the ones I am not
  sure of; everything else I am confident of. Loanword tones in particular should be confirmed by a speaker.
- Word cutting depends on the ICU dictionary of the engine that runs the code. I ran everything under Node 24; a browser
  with a different ICU version may cut a few of the examples differently. The classes of fault (names, loanwords, glued ๆ,
  compounds of known parts) do not depend on the version.
- The running text is 624 tokens that I wrote myself (three parts recalled from memory, possibly not word for word). It
  is small and it is my Thai, so the 9 % is an indication, not a measurement of real prose.
- The everyday-word check is by written form only: a word counted as "in the list" may be there with the wrong meaning
  (เย็น, ของ, ผม).
- I read `syntax.ts` (1,206 lines), `segmentations.ts`, `prose.ts`, `lexicon-bible.ts` and `lexicon-ladder.ts` only
  through their headers and through the dump and the probes; `orth-exceptions.ts` through its header and its effect.
- The mechanical tone comparison covers only the rows the dictionary has (about 1,000 of 1,692); among the other rows I
  found what I could by reading, so more wrong tones may remain there, above all in the name rows.
- I did not test the checks on the learner's own writing (`checkProduction`), speech normalisation, audio, or the Stage 0
  exit forms, and read only three of the 98 ladder units.
- The hand counts could be off by a few.
