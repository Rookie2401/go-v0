# Thai contextual syntax (Linguistic Engine V2, Stage 4)

Code: `src/adapters/thai/syntax.ts` (`thaiSyntax(tokens, analyses)`), wired as `thAdapter.syntax` in `src/adapters/th.ts`.
Contract: `src/core/syntax.ts` (`SyntaxAnalysis`, `SyntaxRelation`, `ClauseSpan`). Probe: `scripts/probe-syntax-th.mts [--limit N]`.
Gold: `data/gold/th/syntax-dev.json` (64 sentences, labelled by Claude, AI-judged, unreviewed, no native speaker).
Tests: `test/adapters/thai-syntax.test.ts` (35 cases). Machine-drafted rules; nothing here has been checked by a native speaker.

## What it is

Shallow, rule-based dependencies over the adapter's own readings (part of speech, role, classifier flag from the word list).
Thai has no inflection and no spaces, so the only evidence is word order and a few function words. A relation is `generated`
by rule, or `conflicted` when it keeps `alternatives` (status is exactly "has alternatives"). Every relation has a non-empty
`basis` in plain words. UD relation names are used; the language-specific explanation is in `label`.
The analysis is deterministic and costs about 0.03 ms for 20 words.

## Modelled

| Area | Relation(s) | Rule and basis (as written in `basis`) |
|---|---|---|
| Subject | `nsubj` | a noun or pronoun phrase before the verb (Thai is SVO); a time word before the subject is `obl` ("time phrase") |
| Object | `obj`, `iobj` | the bare noun phrase right after a verb; after "give" ให้ as the verb: receiver `iobj`, thing `obj` |
| Place and goal | `obl` | after a verb of motion or posture (ไป มา เข้า ถึง นั่ง …) a bare noun is where, not an object (alternative `obj` kept for motion verbs); after a direction word too |
| Serial verbs | `compound`, `xcomp` | the first verb is the root. Rule 1: a direction or result word right after a verb (มา ไป ลง เข้า ออก กลับ เสร็จ จบ …) is `compound` of that verb. Rule 2: any other later verb, with or without an object between, is `xcomp` of the last non-directional verb. Basis says "serial verb rule 1 / 2" |
| Aspect, modal | `aux` | จะ ได้ กำลัง อยู่ แล้ว ต้อง ควร อยาก ทรง เคย ยัง เพิ่ง ถูก/โดน (passive) …; each labelled with the word list's role ("progressive marker", "continuing-state marker" …) |
| Negation | `advmod` | ไม่ before a verb or adjective ("negation of …"); ไม่นาน is one adverbial |
| Copula | `cop` | เป็น / คือ + noun phrase: the noun is the root, the subject is its `nsubj` |
| Prepositions | `case` + `obl` | ใน บน ใต้ จาก กับ สำหรับ ที่ ("at") + noun phrase: the noun is `obl` of the nearest verb. With more than one verb, or a noun just before, the other attachment is kept as an alternative |
| Possession | `nmod` + `case` | ของ + noun phrase after a noun: the possessor is `nmod`, ของ is its `case`. ของ without a noun after it is the noun "thing" |
| Classifiers | `nummod`, `clf` | noun + number + classifier: both attach to the noun as head. A classifier after the noun with a demonstrative (หนังสือเล่มนี้) is `clf`; a loose number and classifier after a noun phrase go to the nearest non-pronoun noun |
| Demonstratives | `det` | นี้ นั้น โน้น after the noun; ทุก บาง หลาย ทั้ง before it; a question word after a noun (เรื่องอะไร) is `det` |
| Adjectives | `amod` | an adjective after a noun describes the nearest noun. With **no** verb in the clause it is the predicate: `root`, with the `amod` reading kept as an alternative (`conflicted`). After a verb: `advmod` (manner), `xcomp` after a linking verb (รู้สึก) or a stative predicate, the other reading kept |
| Complement clause | `ccomp` + `mark` | ว่า after a verb of saying or knowing (list) or before a clause; the clause head is `ccomp` of the nearest verb before the marker; ว่า is `mark`. เพราะว่า / แม้ว่า: ว่า is `fixed` |
| Relative clause | `acl` + `mark` | noun + ที่/ซึ่ง/อัน + clause: the clause head is `acl` of the noun; ที่ after an adjective or verb (ดีใจที่…) opens a `ccomp`. A relative clause ends where the main predicate group begins (ทุกคนที่เชื่อ… จะไม่พินาศ) |
| Adverbial clause | `advcl` + `mark` | ถ้า หาก แม้ เพราะ จน เมื่อ always; เพื่อ ก่อน หลัง ระหว่าง ตั้งแต่ ขณะ only when a clause follows. Attached to the nearest preceding clause, else the following main clause |
| Coordination | `conj` + `cc` | two noun phrases with และ/หรือ; clauses with แต่ / และ + subject or verb; แล้ว between two actions ("and then") is `cc`; a pause between two clauses is a bare `conj` |
| Causative ให้ | `mark`, `ccomp`/`xcomp`, `case` | ให้ + noun + verb: ให้ is `mark` of the verb, the noun its `nsubj`, the verb `ccomp` of the host (ทำให้: no mark). ให้ + noun + end/PP: `case` of the recipient, who is `obl`. ให้ as first verb: "give" |
| Final particles | `discourse` | ครับ ค่ะ คะ นะ สิ เลย …; ไหม มั้ย เหรอ say in the basis that they make a yes/no question; polite particles of an embedded clause attach to the root |
| Vocative | `vocative` | a name or kin word followed by a comma at the start (alternative `nsubj`) |
| Others | `fixed`, `compound` | หลังจากนั้น, ด้วยกัน, ว่า after เพราะ; ๆ (repeat the word); ความ/การ + word; คุณ + noun; ของเล่น |
| Punctuation | `punct` | attaches to the root |

Clause spans (`clauses`) are returned for each cut (main, subordinate, relative, coordinate, quote), with the marker.
`attached` is the share of word tokens that have a relation.

### Honesty rules

* A word the word list does not have gets **no relation** and is named in `notes` ("Not in the word list, so no relation: …").
  Two position-only inferences are allowed, both with confidence 0.3 to 0.55, status `conflicted`, and the reason in `basis`:
  an unknown word right after a verb-taking marker (กำลัง จะ ต้อง ควร อยาก ทรง เคย เพิ่ง) is the verb; an unknown word between a
  subject and an object noun phrase, or after the subject of a clause that เมื่อ/ว่า/ที่ opened, is the verb; the word after a
  preposition is its noun. Anything else stays unattached.
* An auxiliary with no other verb in the clause is read as the main verb (ไม่ได้อยู่ใน…, ได้กลิ่น…), with the plain-auxiliary reading kept.
* Where the order cannot decide (which verb a preposition phrase belongs to, กับ "with" or "and", an adjective as modifier or
  predicate, a conjunct's first verb, motion verb + place as obl or obj) the other reading is in `alternatives` with a `why`.

## Not modelled

* Anything about words missing from the ~1700-entry word list: their class, their object, their modifiers. Unknown verbs and
  nouns are the largest single loss (5 % of corpus words, 39 % of the Wiktionary examples are left unattached).
* Noun phrase boundaries inside long chains of bare nouns (เพื่อนของพ่อหน้าร้านขนม is read as one chain); a compound versus
  "noun + noun" is not decided.
* Passives beyond ถูก/โดน + doer + verb; `iobj` other than after "give"; `appos`, `expl`, `flat` (names), `advcl` for bare
  verbs ("while walking" with no marker); `parataxis`; topic-comment sentences; questions with a fronted question word;
  imperatives; comparatives beyond a กว่า phrase; nominalised clauses (การ + verb phrase with an object).
* Sentence breaks: the syntax sees the sentence the adapter gave it. A space in the text is not a token (the adapter drops
  it); the rules recover a pause from the gap between token offsets, which is the only clause-boundary evidence for juxtaposed
  clauses. A newline-wrapped sentence is cut upstream.
* Reading speed or register differences, regional particles beyond what the word list tags.

## Measured (probe, 2026-10-10)

Corpus `data/corpus/th`: 165 sentences, 1328 word tokens.

| Measure | Value |
|---|---|
| word tokens with a relation (`attached`) | 95.3 % (5 % unattached: unknown nouns and verbs) |
| sentences with exactly one root | 165 / 165 |
| relations that keep alternatives (status `conflicted`) | 16.6 % (210 of 1266) |
| speed | 0.012 ms per sentence (8 words); 0.031 ms per 20 words |
| out-of-domain load check, 2000 Wiktionary examples | 61.0 % attached, 0.05 ms per 20 words, slowest 0.22 ms, no head cycle |

Relation distribution: nsubj 15.2, root 13.0, obl 10.4, obj 10.3, case 6.7, mark 5.5, nmod 5.4, advmod 5.1, xcomp 4.5, compound 3.5,
aux 3.4, conj 2.8, ccomp 2.6, cc 2.5, amod 2.2, advcl 2.0, clf 1.0, discourse 1.0, nummod 0.8, fixed 0.6, acl 0.6, det 0.5, cop 0.1, dep 0.1 (%).

Gold set, AI-judged (one labeller, no native speaker, no second opinion): UAS = head right, LAS = head and relation right,
over all gold words (an unattached word counts as wrong).

| Set | Sentences | Words | Attached | UAS | LAS | UAS / LAS over attached words |
|---|---|---|---|---|---|---|
| all | 64 | 513 | 95.3 % | **87.5 %** | **86.5 %** | 91.8 % / 90.8 % |
| dev (48; the rules were tuned on them) | 48 | 384 | 96.6 % | 89.3 % | 88.3 % | 92.5 % / 91.4 % |
| held-out (16) | 16 | 129 | 91.5 % | 82.2 % | 81.4 % | 89.8 % / 89.0 % |

The held-out 16 sentences were labelled after the first version of the rules; **their first-run score was UAS 75.2 % / LAS 72.1 %**.
The general bugs that run exposed (relative clause after a time noun, an unknown verb inside a subordinate clause, a classifier
reading of หลัง at the start of a sentence, ทาง/หน้า as place words, a classifier before the number) were then fixed, so 82.2 / 81.4 is
no longer a clean held-out number. The clean figure for unseen text is the first-run one, and it is on 16 sentences only: the
confidence interval is wide. Gold sentences are from the course corpus (short, controlled, machine-drafted beginner text), so
these numbers say little about literary Thai. No Thai UD treebank (PUD) is on disk under `data/research` or `data/sources`, so
nothing was scored against UD.

Weak spots on the dev set (head right, relation differs): `obj→obl`, `xcomp→compound` (a verb that is directional or a second
action); worst relations by UAS: `advcl` 71 %, `conj` 67 %, `xcomp` 75 %, `nmod` 80 %. Of the 64 wrong heads over the 64 sentences (24 of them unattached words), the gold head was among the `alternatives`
for only 2.

## Known wrong cases

* `เราเห็นเพื่อนของพ่อหน้าร้านขนม`: the place phrase หน้าร้านขนม is taken into the possessor chain of พ่อ (head error on 3 words).
* `ตอนเย็น ท้องฟ้าใสและลมเย็น`: เย็น has only a noun reading in the word list, so `ลมเย็น` is not seen as a clause; ลม is attached
  as a conjunct of ใส.
* `น้องถือร่มไปดูหน้าประตู`, `ครูยิ้มและทักทายพวกเรา…`: the verb is unknown (ถือ, ทักทาย); the rules cannot place it and its
  object, or take ไป as the root.
* `พ่อเตือนให้เราอยู่ใกล้ผู้ใหญ่`: ใกล้ has a verb reading, so อยู่ becomes an auxiliary of ใกล้ instead of the verb.
* `ฉันตั้งใจจะกลับมาอ่านที่ร้านอีก`: กลับ after ตั้งใจ จะ is a verb in its own right, but the direction-word rule makes it `compound`.
* `เราคุยเรื่องวันพรุ่งนี้และงานในบ้าน`: งาน is a conjunct of เรื่อง here, of วัน in the gold.
* `เรานั่งฟังเสียงฝนและอ่านหนังสือ`: อ่าน is a conjunct of the first verb (นั่ง); the gold joins it to ฟัง. The nearest verb is
  kept as an alternative.
* A relation to a word that is itself unattached can exist (an adjective after an unknown noun is attached to the nearest known
  noun at confidence 0.4).

## Engine bugs found (reported, not fixed; they are in the adapter's word list or contextual rules)

1. `ที่นี่`, `ที่นั่น` are tagged SCONJ (relative/complement marker); they are the nouns "here / there". The syntax reads them as nouns by surface.
2. `ถูก` is picked as ADJ when a doer and an unknown verb follow (`ฉันถูกแม่ดุ`), so the passive AUX reading is lost; the syntax overrides it by
   position.
3. `หลัง` at the start of a sentence (`หลังฝนตก`) comes out CLF first (ADP second); `อย่าง` is NOUN|CLF (it is the manner marker "in a … way").
4. `เย็น` has only a NOUN reading (also "cool"); `ขณะ` is NOUN only ("while"); `ด้วย` is ADV only (no "with"); `ใกล้` reads as a verb.
5. The tokenizer drops spaces and gives digits `isWord: false`; a pause can only be recovered from offsets, and a number is not a word token
   for the engine's counts.
6. `ไม่มี` and `ไม่รู้` are single VERB entries, so the negation is not a separate token there.
7. About 5 % of corpus tokens have no reading (หน้าต่าง, เค้ก, ข้าง, ถือ, ทักทาย, …); unknown verbs are the main loss for syntax.
