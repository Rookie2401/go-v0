# Korean conjugation check (`npm run ko:conj-check`)

Generated 2026-11-25 by `scripts/ko-conj-check.mts` from `data/raw/kaikki-ko/kaikki.org-dictionary-Korean.jsonl`
(Wiktionary via kaikki.org, CC BY-SA 4.0). 4729 verb and adjective entries with an infinitive, a sequential form and a
conjugation table; 8+ without a class the engine can derive; 23 skipped (the copulas, non-Hangul
headwords); 47 table cells whose tags map to no ending chain (rare cells: bare `indicative`, `connective` …). 115 s.

The class of each entry is derived from its infinitive and sequential forms with `koDeriveClass` (conjugate.ts), the same
derivation the lexicon build can use.

## Generation: the engine's forms for each table cell

Overall **424441 / 425172 = 99.83 %**.

| class | agree | % |
|---|---|---|
| R | 202535 / 203246 | 99.65 % |
| Ha | 196588 / 196604 | 99.99 % |
| B | 11998 / 12002 | 99.97 % |
| Reu | 7628 / 7628 | 100.00 % |
| H | 2220 / 2220 | 100.00 % |
| S | 1514 / 1514 | 100.00 % |
| D | 1260 / 1260 | 100.00 % |
| Reo | 608 / 608 | 100.00 % |
| U | 90 / 90 | 100.00 % |

## Analysis: each table form read back to its lemma (a lexicon of that one entry)

Overall **348431 / 349036 = 99.83 %** (target ≥ 99 %).

| class | read back | % |
|---|---|---|
| R | 163634 / 164197 | 99.66 % |
| Ha | 163621 / 163655 | 99.98 % |
| B | 10170 / 10178 | 99.92 % |
| Reu | 6276 / 6276 | 100.00 % |
| H | 1890 / 1890 | 100.00 % |
| S | 1231 / 1231 | 100.00 % |
| D | 1022 / 1022 | 100.00 % |
| Reo | 514 / 514 | 100.00 % |
| U | 73 / 73 | 100.00 % |

## Reading the residue (checked by hand on 2026-11-25)

- **Head line against table.** Some entries (기다랗다, 가느다랗다 …) give a regular infinitive and sequential on the head line
  (기다랗아, 기다랗으니) while their own table is ㅎ-irregular (기다래, 기다라니). The class is derived from the head line, as the brief
  asks, so every cell of such an entry disagrees. The engine is right for the class it is given; the lexicon build may prefer the
  table's informal non-past cell when the two disagree.
- **-시다 lexemes.** The table module contracts every -시다 stem with -어요 to -세요, including verbs that are not honorific
  (가시다 "to fade"). The engine contracts 시 + 어요 → 세요 only in the honorific pre-final -(으)시- and in verbs that are themselves
  honorific (a gloss saying "honorific", or 계시다, 주무시다, 잡수시다, 드시다, 편찮으시다, 돌아가시다): 마시다 → 마셔요, never 마세요.
- **Adjectives with verb tables.** A few adjectives carry a verb table (고명하다 → 고명한다, 밭다 → 밭는데). The engine does not give an
  adjective -ㄴ다 / -는; it would also give 예쁜다. Left as the table's.
- **Older spellings.** 가까와(요), 고마와(요): the ㅂ-irregular with 와 after ㅏ was the spelling before 1988; today's is 가까워. Not generated.
- **가거라 / 오너라** are generated (-거라, -너라) since this run.

## The 40 commonest kinds of disagreement

| n | kind | examples |
|---|---|---|
| 433 | analyse | R | adj | 시장하시다: 시장하세요; 기다랗다: 기다래; 기다랗다: 기다래요; 기다랗다: 기다랬다 |
| 130 | analyse | R | verb | 가시다: 가세요; 깨뜨리다: 깨다; 모시다: 모세요; 있으시다: 있으세요 |
| 34 | analyse | Ha | adj | 고명하다: 고명한다; 고명하다: 고명하느냐; 고명하다: 고명하자; 고명하다: 고명하십시다 |
| 16 | generate | R | adj | hon indicative informal non-past polite | 기다랗다: table 기다라세요, engine 기다랗으세요/기다랗으셔요/기다랗으시어요/기다랗아요; 기다랗다: table 기다라셔요, engine 기다랗으세요/기다랗으셔요/기다랗으시어요/기다랗아요; 가느다랗다: table 가느다라세요, engine 가느다랗으세요/가느다랗으셔요/가느다랗으시어요/가느다랗아요; 가느다랗다: table 가느다라셔요, engine 가느다랗으세요/가느다랗으셔요/가느다랗으시어요/가느다랗아요 |
| 16 | generate | R | adj | hon informal interrogative non-past polite | 기다랗다: table 기다라세요, engine 기다랗으세요/기다랗으셔요/기다랗으시어요/기다랗아요; 기다랗다: table 기다라셔요, engine 기다랗으세요/기다랗으셔요/기다랗으시어요/기다랗아요; 가느다랗다: table 가느다라세요, engine 가느다랗으세요/가느다랗으셔요/가느다랗으시어요/가느다랗아요; 가느다랗다: table 가느다라셔요, engine 가느다랗으세요/가느다랗으셔요/가느다랗으시어요/가느다랗아요 |
| 9 | generate | R | adj | indicative informal non-past polite | 시장하시다: table 시장하세요, engine 시장하셔요/시장하시어요; 기다랗다: table 기다래요, engine 기다랗아요; 가느다랗다: table 가느다래요, engine 가느다랗아요; 가엽다: table 가여워요, engine 가엽어요 |
| 9 | generate | R | adj | informal interrogative non-past polite | 시장하시다: table 시장하세요, engine 시장하셔요/시장하시어요; 기다랗다: table 기다래요, engine 기다랗아요; 가느다랗다: table 가느다래요, engine 가느다랗아요; 가엽다: table 가여워요, engine 가엽어요 |
| 9 | generate | R | adj | formal interrogative non-past | 기다랗다: table 기다라냐, engine 기다랗으냐/기다랗냐; 밭다: table 밭느냐, engine 밭으냐/밭냐; 가느다랗다: table 가느다라냐, engine 가느다랗으냐/가느다랗냐; 가엽다: table 가여우냐, engine 가엽으냐/가엽냐 |
| 9 | generate | R | adj | contrastive informal | 기다랗다: table 기다란데, engine 기다랗은데; 밭다: table 밭는데, engine 밭은데; 가느다랗다: table 가느다란데, engine 가느다랗은데; 가엽다: table 가여운데, engine 가엽은데 |
| 9 | generate | R | adj | hon formal indicative non-past | 기다랗다: table 기다라시다, engine 기다랗으시다/기다랗다; 밭다: table 밭으신다, engine 밭으시다/밭다; 가느다랗다: table 가느다라시다, engine 가느다랗으시다/가느다랗다; 가엽다: table 가여우시다, engine 가엽으시다/가엽다 |
| 9 | generate | R | adj | hon formal interrogative non-past | 기다랗다: table 기다라시냐, engine 기다랗으시냐/기다랗으냐/기다랗냐; 밭다: table 밭으시느냐, engine 밭으시냐/밭으냐/밭냐; 가느다랗다: table 가느다라시냐, engine 가느다랗으시냐/가느다랗으냐/가느다랗냐; 가엽다: table 가여우시냐, engine 가엽으시냐/가엽으냐/가엽냐 |
| 9 | generate | R | adj | hon contrastive informal | 기다랗다: table 기다라신데, engine 기다랗으신데/기다랗은데; 밭다: table 밭으시는데, engine 밭으신데/밭은데; 가느다랗다: table 가느다라신데, engine 가느다랗으신데/가느다랗은데; 가엽다: table 가여우신데, engine 가엽으신데/가엽은데 |
| 8 | analyse | B | adj | 가깝다: 가까와; 가깝다: 가까와요; 가깝다: 가까왔음; 가깝다: 가까왔기 |
| 8 | generate | R | adj | indicative informal non-past | 기다랗다: table 기다래, engine 기다랗아; 가느다랗다: table 가느다래, engine 가느다랗아; 가엽다: table 가여워, engine 가엽어; 높다랗다: table 높다래, engine 높다랗아 |
| 8 | generate | R | adj | formal indicative past | 기다랗다: table 기다랬다, engine 기다랗았다; 가느다랗다: table 가느다랬다, engine 가느다랗았다; 가엽다: table 가여웠다, engine 가엽었다; 높다랗다: table 높다랬다, engine 높다랗았다 |
| 8 | generate | R | adj | indicative informal past | 기다랗다: table 기다랬어, engine 기다랗았어; 가느다랗다: table 가느다랬어, engine 가느다랗았어; 가엽다: table 가여웠어, engine 가엽었어; 높다랗다: table 높다랬어, engine 높다랗았어 |
| 8 | generate | R | adj | indicative informal past polite | 기다랗다: table 기다랬어요, engine 기다랗았어요; 가느다랗다: table 가느다랬어요, engine 가느다랗았어요; 가엽다: table 가여웠어요, engine 가엽었어요; 높다랗다: table 높다랬어요, engine 높다랗았어요 |
| 8 | generate | R | adj | formal indicative past polite | 기다랗다: table 기다랬습니다, engine 기다랗았습니다; 가느다랗다: table 가느다랬습니다, engine 가느다랗았습니다; 가엽다: table 가여웠습니다, engine 가엽었습니다; 높다랗다: table 높다랬습니다, engine 높다랗았습니다 |
| 8 | generate | R | adj | informal interrogative non-past | 기다랗다: table 기다래, engine 기다랗아; 가느다랗다: table 가느다래, engine 가느다랗아; 가엽다: table 가여워, engine 가엽어; 높다랗다: table 높다래, engine 높다랗아 |
| 8 | generate | R | adj | formal interrogative past | 기다랗다: table 기다랬느냐, engine 기다랗았느냐; 가느다랗다: table 가느다랬느냐, engine 가느다랗았느냐; 가엽다: table 가여웠느냐, engine 가엽었느냐; 높다랗다: table 높다랬느냐, engine 높다랗았느냐 |
| 8 | generate | R | adj | informal interrogative past | 기다랗다: table 기다랬어, engine 기다랗았어; 가느다랗다: table 가느다랬어, engine 가느다랗았어; 가엽다: table 가여웠어, engine 가엽었어; 높다랗다: table 높다랬어, engine 높다랗았어 |
| 8 | generate | R | adj | informal interrogative past polite | 기다랗다: table 기다랬어요, engine 기다랗았어요; 가느다랗다: table 가느다랬어요, engine 가느다랗았어요; 가엽다: table 가여웠어요, engine 가엽었어요; 높다랗다: table 높다랬어요, engine 높다랗았어요 |
| 8 | generate | R | adj | formal interrogative past polite | 기다랗다: table 기다랬습니까, engine 기다랗았습니까; 가느다랗다: table 가느다랬습니까, engine 가느다랗았습니까; 가엽다: table 가여웠습니까, engine 가엽었습니까; 높다랗다: table 높다랬습니까, engine 높다랗았습니까 |
| 8 | generate | R | adj | causative formal | 기다랗다: table 기다래, engine 기다랗아; 가느다랗다: table 가느다래, engine 가느다랗아; 가엽다: table 가여워, engine 가엽어; 높다랗다: table 높다래, engine 높다랗아 |
| 8 | generate | R | adj | causative informal | 기다랗다: table 기다래서, engine 기다랗아서; 가느다랗다: table 가느다래서, engine 가느다랗아서; 가엽다: table 가여워서, engine 가엽어서; 높다랗다: table 높다래서, engine 높다랗아서 |
| 8 | generate | R | adj | causative informal polite | 기다랗다: table 기다라니, engine 기다랗으니; 가느다랗다: table 가느다라니, engine 가느다랗으니; 가엽다: table 가여우니, engine 가엽으니; 높다랗다: table 높다라니, engine 높다랗으니 |
| 8 | generate | R | adj | causative formal polite | 기다랗다: table 기다라니까, engine 기다랗으니까; 가느다랗다: table 가느다라니까, engine 가느다랗으니까; 가엽다: table 가여우니까, engine 가엽으니까; 높다랗다: table 높다라니까, engine 높다랗으니까 |
| 8 | generate | R | adj | conditional formal | 기다랗다: table 기다라면, engine 기다랗으면; 가느다랗다: table 가느다라면, engine 가느다랗으면; 가엽다: table 가여우면, engine 가엽으면; 높다랗다: table 높다라면, engine 높다랗으면 |
| 8 | generate | R | adj | conditional informal | 기다랗다: table 기다래야, engine 기다랗아야; 가느다랗다: table 가느다래야, engine 가느다랗아야; 가엽다: table 가여워야, engine 가엽어야; 높다랗다: table 높다래야, engine 높다랗아야 |
| 8 | generate | R | adj | formal noun-from-verb | 기다랗다: table 기다람, engine 기다랗음; 가느다랗다: table 가느다람, engine 가느다랗음; 가엽다: table 가여움, engine 가엽음; 높다랗다: table 높다람, engine 높다랗음 |
| 8 | generate | R | adj | formal noun-from-verb past | 기다랗다: table 기다랬음, engine 기다랗았음; 가느다랗다: table 가느다랬음, engine 가느다랗았음; 가엽다: table 가여웠음, engine 가엽었음; 높다랗다: table 높다랬음, engine 높다랗았음 |
| 8 | generate | R | adj | informal noun-from-verb past | 기다랗다: table 기다랬기, engine 기다랗았기; 가느다랗다: table 가느다랬기, engine 가느다랗았기; 가엽다: table 가여웠기, engine 가엽었기; 높다랗다: table 높다랬기, engine 높다랗았기 |
| 8 | generate | R | adj | determiner informal present | 기다랗다: table 기다란, engine 기다랗은; 가느다랗다: table 가느다란, engine 가느다랗은; 가엽다: table 가여운, engine 가엽은; 높다랗다: table 높다란, engine 높다랗은 |
| 8 | generate | R | adj | determiner future informal | 기다랗다: table 기다랄, engine 기다랗을; 가느다랗다: table 가느다랄, engine 가느다랗을; 가엽다: table 가여울, engine 가엽을; 높다랗다: table 높다랄, engine 높다랗을 |
| 8 | generate | R | adj | hon indicative informal non-past | 기다랗다: table 기다라셔, engine 기다랗으셔/기다랗으시어/기다랗아; 가느다랗다: table 가느다라셔, engine 가느다랗으셔/가느다랗으시어/가느다랗아; 가엽다: table 가여우셔, engine 가엽으셔/가엽으시어/가엽어; 높다랗다: table 높다라셔, engine 높다랗으셔/높다랗으시어/높다랗아 |
| 8 | generate | R | adj | hon formal indicative non-past polite | 기다랗다: table 기다라십니다, engine 기다랗으십니다/기다랗습니다; 가느다랗다: table 가느다라십니다, engine 가느다랗으십니다/가느다랗습니다; 가엽다: table 가여우십니다, engine 가엽으십니다/가엽습니다; 높다랗다: table 높다라십니다, engine 높다랗으십니다/높다랗습니다 |
| 8 | generate | R | adj | hon formal indicative past | 기다랗다: table 기다라셨다, engine 기다랗으셨다/기다랗으시었다/기다랗았다; 가느다랗다: table 가느다라셨다, engine 가느다랗으셨다/가느다랗으시었다/가느다랗았다; 가엽다: table 가여우셨다, engine 가엽으셨다/가엽으시었다/가엽었다; 높다랗다: table 높다라셨다, engine 높다랗으셨다/높다랗으시었다/높다랗았다 |
| 8 | generate | R | adj | hon indicative informal past | 기다랗다: table 기다라셨어, engine 기다랗으셨어/기다랗으시었어/기다랗았어; 가느다랗다: table 가느다라셨어, engine 가느다랗으셨어/가느다랗으시었어/가느다랗았어; 가엽다: table 가여우셨어, engine 가엽으셨어/가엽으시었어/가엽었어; 높다랗다: table 높다라셨어, engine 높다랗으셨어/높다랗으시었어/높다랗았어 |
| 8 | generate | R | adj | hon indicative informal past polite | 기다랗다: table 기다라셨어요, engine 기다랗으셨어요/기다랗으시었어요/기다랗았어요; 가느다랗다: table 가느다라셨어요, engine 가느다랗으셨어요/가느다랗으시었어요/가느다랗았어요; 가엽다: table 가여우셨어요, engine 가엽으셨어요/가엽으시었어요/가엽었어요; 높다랗다: table 높다라셨어요, engine 높다랗으셨어요/높다랗으시었어요/높다랗았어요 |
| 8 | generate | R | adj | hon formal indicative past polite | 기다랗다: table 기다라셨습니다, engine 기다랗으셨습니다/기다랗으시었습니다/기다랗았습니다; 가느다랗다: table 가느다라셨습니다, engine 가느다랗으셨습니다/가느다랗으시었습니다/가느다랗았습니다; 가엽다: table 가여우셨습니다, engine 가엽으셨습니다/가엽으시었습니다/가엽었습니다; 높다랗다: table 높다라셨습니다, engine 높다랗으셨습니다/높다랗으시었습니다/높다랗았습니다 |

## Entries with no derivable class (first 8)

- 갖다 (가져, 가지니)
- 어쩌다 (어째, 어쩌니)
- 그러다 (그래, 그러니)
- 이러다 (이래, 이러니)
- 꿰다 (꿰/꿰어, 꿰니)
- 섧다 (설워, 설우니)
- 아무렇다 (아무래, 아무러니)
- 저러다 (저래, 저러니)
