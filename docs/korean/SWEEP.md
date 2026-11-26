# Korean common-word sweep

The regression table for the commonest Korean words (package W): `test/adapters/korean/common-words.table.json`, checked by `test/adapters/korean/common-words.test.ts`.

## Method

- Expectations are what a careful Korean teacher would say the word is, decided before the analyser was run; a corrected expectation is listed below. Nothing has been reviewed by a native speaker.
- Every check runs in both lexicon states: the compiled core alone, and the core with every shard (skipped when public/lexicon/ko is not built). A word the core lacks is checked with the shards only.
- Entries (779): the 300 commonest spellings of the lexicon, every pronoun with its case and fused forms, determiners, numerals, counters, question words, common adverbs and conjunctive adverbs, one-syllable nouns, and 2 to 3 forms of the commonest verbs and descriptive verbs. Each is read bare (token analysis) and in one to three short sentences (the whole adapter). Lemma (homonym number stripped), part of speech, a meaning keyword in the gloss, and the undecided flag are checked.
- Blocks B and C (77 sentences): numerals before counters with their look-alikes, and noun + noun written with a space.
- Frames (817 nouns, generated from the lexicon): noun + 이/가, 을/를, 은/는, 도, 에, 의, 만 by the pack's allomorph rule, bare and in a neutral sentence. The first reading must be that noun with that particle. A form that is itself a headword (시도, 그만) is not scored.
- Block T (153 surfaces): written forms that are both noun + particle and a predicate form or a whole word. Each sentence names its side (noun, pred, whole). The bare form is "undecided" when two sides each have a counted word, and that side read confidently when only one has.
- `known`, `frameKnown`, `twoSidedKnown` list the checks wrong at the commit above. The test fails on any other wrong reading and on any known check that starts passing.

## Counts at cbb9d428 (wrong / checked)

| block | core | shards |
|---|---|---|
| entry | 87 / 2329 | 84 / 2343 |
| block | 7 / 140 | 7 / 148 |
| frame | 170 / 11244 | 119 / 11096 |
| T | 32 / 405 | 31 / 412 |

## Block T gate (right / total)

| build | state | noun | pred | whole | bare (undecided where both sides are counted) |
|---|---|---|---|---|---|
| 4e75f112 | core | 41 / 114 | 85 / 103 | 25 / 35 | 153 / 153 |
| 4e75f112 | shards | 37 / 116 | 87 / 107 | 25 / 36 | 153 / 153 |
| ccaad140 | core | 41 / 114 | 85 / 103 | 25 / 35 | 152 / 153 |
| ccaad140 | shards | 37 / 116 | 87 / 107 | 25 / 36 | 153 / 153 |
| HEAD | core | 94 / 114 | 92 / 103 | 34 / 35 | 153 / 153 |
| HEAD | shards | 97 / 116 | 96 / 107 | 35 / 36 | 153 / 153 |

## Known limits: still wrong at cbb9d428 (305 checks; ★ first months: 164)

word | sentence or frame | wanted | got | states

### (a) token order: a common word loses to a same-spelled word

- ★ 감 | 감을 하나 따 먹었어요. @감을 | wanted 감/NOUN/persimmon | got 감다/VERB/to close one's eyes / to wash hair / to /undecided 0.84 | core+shards
- ★ 남 | 그는 항상 남을 도와요. @남을 | wanted 남/NOUN/other person | got 남다/VERB/to remain 0.84 | core+shards
- ★ 들었어요 | 그 소식을 들었어요. @들었어요 | wanted 듣다/VERB/hear,listen | got 들다/VERB/to enter; to cost; to be included / to h/undecided 0.84 | core+shards
- ★ 사 | bare | wanted 사/NUM/four or 사다/VERB/buy | got 사/NOUN/company / death / private or personal af/undecided 0.84 | core+shards
- ★ 산 | 어제 산 옷이에요. @산 | wanted 사다/VERB/buy | got 살다/VERB/to live 0.84 | core+shards
- ★ 실 | 바늘에 실을 꿰었어요. @실을 | wanted 실/NOUN/thread | got 싣다/VERB/to load onto a vehicle 0.84 | core
- 본 | 본 회의를 시작하겠습니다. @본 | wanted 본/DET/this | got 보다/VERB/to see, look at; to try 0.84 | core+shards
- 온 | 온 가족이 함께 저녁을 먹었어요. @온 | wanted 온/DET/all | got 오다/VERB/to come; to fall (rain, snow) 0.84 | core+shards
- 완전 | 이 영화 완전 재미있어요! @완전 | wanted 완전/ADV/absolutely,completely | got 완전/NOUN/perfection 0.92 | shards | (shards) the colloquial adverb 완전 'totally' ranked below the noun before an adjective

### (b) a sentence rule missing (the cue is named)

- ★ 간 | 국이 간이 좀 싱거워요. @간이 | wanted 간/NOUN/seasoning,salty | got 간/NOUN/seasoning (salty) / liver / side dishes/undecided 0.92 | core
- ★ 같이 | 피부가 눈같이 하얘요. @눈같이 | wanted 눈/NOUN/snow | got 눈/NOUN/eye; eyesight / snow / scale / bud/undecided 0.92 | core+shards
- ★ 김 | 김에 밥을 싸 먹어요. @김에 | wanted 김/NOUN/laver,nori | got 김/PROPN/a surname 0.84 | core+shards
- ★ 꼭 | 아이가 엄마 손을 꼭 잡았어요. @꼭 | wanted 꼭/ADV/tightly,grasping | got 꼭/ADV/absolutely 0.92 | core+shards
- ★ 대 | 자동차 한 대를 샀어요. @대를 | wanted 대/CLF/machine,vehicle | got 대/CLF/counter for long objects; counter for bl/undecided 0.84 | core+shards
- ★ 대 | 집에 차가 두 대 있어요. @대 | wanted 대/CLF/machine,vehicle | got 대/CLF/counter for long objects; counter for bl/undecided 0.84 | core+shards
- ★ 대가 | B: 주차장에 차 두 대가 있어요. @대가 | wanted 대/CLF/machine,vehicle | got 대/CLF/counter for long objects; counter for bl/undecided 0.84 | core+shards
- ★ 따르다 | 아이가 엄마를 따라 갔어요. @따라 | wanted 따르다/VERB/follow | got 따르다/VERB/to follow / to pour/undecided 0.84 | core+shards
- ★ 말 | 저는 그 말을 믿어요. @말을 | wanted 말/NOUN/speech,word | got 말/NOUN/speech / horse / a unit of volume equiva/undecided 0.92 | core+shards
- ★ 맞아요 | 네, 맞아요. @맞아요 | wanted 맞다/VERB/correct,right | got 맞다/VERB/to be correct, right; to suit / to be st/undecided 0.92 | core+shards
- ★ 맞아요 | 이 옷이 저한테 맞아요. @맞아요 | wanted 맞다/VERB/suit,correct,right | got 맞다/VERB/to be correct, right; to suit / to be st/undecided 0.92 | core+shards
- ★ 반 | 우리 반은 학생이 많아요. @반은 | wanted 반/NOUN/class | got 반/NOUN/half / class (at a school); group, party/undecided 0.92 | core+shards
- ★ 백 | 언니가 새 백을 샀어요. @백을 | wanted 백/NOUN/bag | got 백/NUM/hundred 0.84 | core+shards
- ★ 보이다 | 사진 좀 보여 주세요. @보여 | wanted 보이다/VERB/show | got 보이다/VERB/to be seen / to show/undecided 0.91 | core+shards
- ★ 보이다 | 여기서 산이 잘 보여요. @보여요 | wanted 보이다/VERB/seen | got 보이다/VERB/to be seen / to show/undecided 0.92 | core+shards
- ★ 분 | B: 이십 분 후에 출발해요. @분 | wanted 분/CLF/minute | got 분/NOUN/person 0.84 | core+shards
- ★ 분 | B: 집에서 역까지 십 분 걸려요. @분 | wanted 분/CLF/minute | got 분/CLF/minute; unit of length / counter for peo/undecided 0.84 | core+shards
- ★ 분 | 십 분만 기다려 주세요. @분만 | wanted 분/CLF/minute | got 분/CLF/minute; unit of length / counter for peo/undecided 0.84 | core+shards
- ★ 분만 | B: 오 분만 기다리세요. @분만 | wanted 분/CLF/minute | got 분/CLF/minute; unit of length / counter for peo/undecided 0.84 | core+shards
- ★ 선 | 선과 악을 구별해요. @선과 | wanted 선/NOUN/goodness | got 선/NOUN/line 0.92 | core+shards
- ★ 성 | 그의 성은 김이에요. @성은 | wanted 성/NOUN/surname | got 성/NOUN/anger / sex / possibility / surname / ca/undecided 0.92 | core+shards
- ★ 성 | 오래된 성을 구경했어요. @성을 | wanted 성/NOUN/castle | got 성/NOUN/anger / sex / possibility / surname / ca/undecided 0.92 | core+shards
- ★ 세요 | B: 그는 힘이 세요. @세요 | wanted 세다/ADJ/strong | got 세다/VERB/to count / to gray/undecided 0.84 | core+shards
- ★ 신 | 그들은 신을 믿어요. @신을 | wanted 신/NOUN/god | got 신/NOUN/god / retainer, subject / shoes / joy / /undecided 0.84 | core+shards
- ★ 신 | 아이들이 신이 났어요. @신이 | wanted 신/NOUN/joy | got 신/NOUN/god / retainer, subject / shoes / joy / /undecided 0.92 | core+shards
- ★ 써요 | 이 커피는 너무 써요. @써요 | wanted 쓰다/ADJ/bitter | got 쓰다/VERB/to wear / to write; to compose / to use,/undecided 0.92 | core+shards
- ★ 쓰는 | 일기를 쓰는 습관이 있어요. @쓰는 | wanted 쓰다/VERB/write | got 쓰다/VERB/to wear / to write; to compose / to use,/undecided 0.92 | core
- ★ 쓰다 | 이 약은 너무 써요. @써요 | wanted 쓰다/ADJ/bitter | got 쓰다/VERB/to wear / to write; to compose / to use,/undecided 0.92 | core+shards
- ★ 쓰다 | 저는 매일 일기를 써요. @써요 | wanted 쓰다/VERB/write | got 쓰다/VERB/to wear / to write; to compose / to use,/undecided 0.92 | core
- ★ 씨 | 밭에 씨를 뿌렸어요. @씨를 | wanted 씨/NOUN/seed | got 씨/NOUN/seed / sir or madam / = 시: hour (time)/undecided 0.92 | core+shards
- ★ 위 | 밥을 먹으면 위가 아파요. @위가 | wanted 위/NOUN/stomach | got 위/NOUN/above 0.92 | core+shards
- ★ 자 | 자로 길이를 재요. @자로 | wanted 자/NOUN/ruler | got 자/NOUN/ruler / person; one who/undecided 0.92 | core+shards
- ★ 장 | 엄마가 시장에서 장을 봤어요. @장을 | wanted 장/NOUN/marketplace,market | got 장/NOUN/sauce / head (of an organization) / mark/undecided 0.84 | core+shards
- ★ 적 | 적이 성을 공격했어요. @적이 | wanted 적/NOUN/enemy | got 적/NOUN/enemy / time, experience (of having done/undecided 0.84 | core+shards
- ★ 주 | 삼 주 동안 쉬었어요. @주 | wanted 주/CLF/week or 주/NOUN/week | got 주/CLF/counter for weeks / counter for trees/undecided 0.84 | core+shards
- ★ 차 | 차 한 잔 마실래요? @차 | wanted 차/NOUN/tea | got 차/NOUN/car, vehicle / tea / difference/undecided 0.84 | core+shards
- ★ 창 | 군인이 창을 들고 있어요. @창을 | wanted 창/NOUN/spear | got 창/NOUN/window 0.92 | core+shards
- ★ 천 | 부드러운 천으로 옷을 만들었어요. @천으로 | wanted 천/NOUN/cloth | got 천/NUM/thousand 0.84 | core+shards
- ★ 크다 | 아이가 그새 많이 컸어요. @컸어요 | wanted 크다/VERB/grow | got 크다/ADJ/to be big 0.92 | core+shards
- ★ 키 | 자동차 키를 잃어버렸어요. @키를 | wanted 키/NOUN/key | got 키/NOUN/height of a person or animal / rudder or/undecided 0.92 | core+shards
- ★ 타 | 내 차에 타. @타 | wanted 타다/VERB/ride,take,get | got 타다/VERB/to burn / to ride, get on / to mix / to /undecided 0.92 | core+shards
- ★ 표 | 결과를 아래 표에 정리했어요. @표에 | wanted 표/NOUN/table | got 표/NOUN/ticket / table/undecided 0.92 | core+shards
- ★ 해 | 작년 한 해 동안 바빴어요. @해 | wanted 해/NOUN/year | got 해/NOUN/sun; year / harm / the value of x/undecided 0.84 | core+shards
- 과정 | 그는 석사 과정에 들어갔어요. @과정에 | wanted 과정/NOUN/course | got 과정/NOUN/process 0.92 | core+shards
- 구 | 우리 구에는 공원이 많아요. @구에는 | wanted 구/NOUN/ward,district | got 구/NOUN/sphere / ward/undecided 0.84 | core+shards
- 구조 | 사람들이 구조를 기다리고 있어요. @구조를 | wanted 구조/NOUN/rescue | got 구조/NOUN/structure 0.84 | core+shards
- 국가 | 경기 전에 국가를 불렀어요. @국가를 | wanted 국가/NOUN/anthem | got 국가/NOUN/nation, country, state 0.92 | core+shards
- 군 | 그는 작년에 군에 입대했어요. @군에 | wanted 군/NOUN/army | got 군/NOUN/army / a noble title in historical East /undecided 0.92 | core+shards
- 군 | 이 군에는 작은 마을이 많아요. @군에는 | wanted 군/NOUN/county | got 군/NOUN/army / a noble title in historical East /undecided 0.92 | core+shards
- 돌 | 내일이 아기 돌이에요. @돌이에요 | wanted 돌/NOUN/birthday or 돌/CLF/anniversary,birthday | got 돌/NOUN/rock 0.92 | core+shards
- 등 | 사과, 귤 등을 샀어요. @등을 | wanted 등/NOUN/cetera | got 등/NOUN/back (of the body) / lantern / et cetera/undecided 0.92 | core
- 등 | 오늘 아침부터 등이 아파요. @등이 | wanted 등/NOUN/back | got 등/NOUN/back (of the body) / lantern / et cetera/undecided 0.92 | core+shards
- 떼 | 아이가 떼를 써요. @떼를 | wanted 떼/NOUN/tantrum | got 떼/NOUN/group / a tantrum (of a child)/undecided 0.92 | core+shards
- 떼 | 하늘에 새 떼가 날아가요. @떼가 | wanted 떼/NOUN/group | got 떼/NOUN/group / a tantrum (of a child)/undecided 0.92 | core+shards
- 면 | 그 사람은 좋은 면도 있어요. @면도 | wanted 면/NOUN/side,aspect | got 면/NOUN/cotton (both the fiber and the cloth) / /undecided 0.92 | core+shards
- 면 | 이 셔츠는 면으로 만들었어요. @면으로 | wanted 면/NOUN/cotton | got 면/NOUN/cotton (both the fiber and the cloth) / /undecided 0.92 | core+shards
- 못 | 벽에 못을 박았어요. @못을 | wanted 못/NOUN/nail | got 못/NOUN/nail / pond/undecided 0.92 | core
- 무 | 그는 무에서 사업을 시작했어요. @무에서 | wanted 무/NOUN/nothing | got 무/NOUN/Korean radish / nothing / martial ethos /undecided 0.92 | core+shards
- 무 | 엄마가 무로 김치를 만들어요. @무로 | wanted 무/NOUN/radish | got 무/NOUN/Korean radish / nothing / martial ethos /undecided 0.92 | core+shards
- 벌 | 아이가 벌에 쏘였어요. @벌에 | wanted 벌/NOUN/bee | got 벌/NOUN/any kind of bee / punishment / a set/sui/undecided 0.84 | core
- 별 | 그건 별 문제 없어요. @별 | wanted 별/DET/special | got 별/NOUN/star 0.84 | core+shards
- 부르다 | 밥을 많이 먹어서 배가 불러요. @불러요 | wanted 부르다/ADJ/full | got 부르다/VERB/to call, name; to sing 0.92 | shards | (shards) 배가 불러요 is 'full' (ADJ)
- 사과 | C: 아침에 사과 주스를 마셨어요. @사과 | wanted 사과/NOUN/apple | got 사과/NOUN/apple / apology/undecided 0.92 | core+shards
- 상 | 엄마가 저녁 상을 차렸어요. @상을 | wanted 상/NOUN/table | got 상/NOUN/top / dining table / prize / statue / ph/undecided 0.92 | core+shards
- 의식 | 결혼 의식을 치렀어요. @의식을 | wanted 의식/NOUN/ritual | got 의식/NOUN/consciousness / ritual/undecided 0.92 | core+shards
- 의식 | 그는 사고로 의식을 잃었어요. @의식을 | wanted 의식/NOUN/consciousness | got 의식/NOUN/consciousness / ritual/undecided 0.92 | core+shards
- 이르다 | 포기하기에는 아직 일러요. @일러요 | wanted 이르다/ADJ/early | got 이르다³/VERB/to say 0.84 | shards | (shards) 아직 … 일러요 is 'early' (ADJ), not 'to say'
- 이상 | 몸에 이상이 생겼어요. @이상이 | wanted 이상/NOUN/abnormality | got 이상/NOUN/more than; the aforementioned / abnormal/undecided 0.92 | core+shards
- 이상 | 열 명 이상 왔어요. @이상 | wanted 이상/NOUN/more | got 이상/NOUN/more than; the aforementioned / abnormal/undecided 0.92 | core+shards
- 자신 | 저는 아직 자신이 없어요. @자신이 | wanted 자신/NOUN/confidence | got 자신/NOUN/oneself; one's body 0.92 | core+shards
- 재 | 바람에 재가 날려요. @재가 | wanted 재/NOUN/ash | got 재/NOUN/ash / mountain pass. compare 고개./undecided 0.92 | core+shards
- 재 | 우리는 재를 넘어 마을로 갔어요. @재를 | wanted 재/NOUN/pass | got 재/NOUN/ash / mountain pass. compare 고개./undecided 0.92 | core+shards
- 절 | 산속에 오래된 절이 있어요. @절이 | wanted 절/NOUN/temple,monastery | got 절/NOUN/a verse / bow / Buddhist monastery / tem/undecided 0.92 | core+shards
- 종 | 교회에서 종이 울렸어요. @종이 | wanted 종/NOUN/bell | got 종/NOUN/servant / bell (instrument) / tumour / b/undecided 0.84 | core+shards
- 주장 | 형은 축구팀 주장이에요. @주장이에요 | wanted 주장/NOUN/representing,captain | got 주장/NOUN/claim, assertion 0.92 | core+shards
- 쪽 | 책 십 쪽을 펴세요. @쪽을 | wanted 쪽/NOUN/page or 쪽/CLF/page | got 쪽/NOUN/side / page; part, piece / in a manner i/undecided 0.92 | core+shards
- 쪽 | 학교 쪽으로 가세요. @쪽으로 | wanted 쪽/NOUN/side | got 쪽/NOUN/side / page; part, piece / in a manner i/undecided 0.92 | core+shards
- 철 | 동생은 아직 철이 없어요. @철이 | wanted 철/NOUN/maturity | got 철/NOUN/season (of the year) / iron / maturity/undecided 0.92 | core+shards
- 철 | 이 문은 철로 만들었어요. @철로 | wanted 철/NOUN/iron | got 철/NOUN/season (of the year) / iron / maturity/undecided 0.92 | core+shards
- 초 | 케이크에 초를 꽂았어요. @초를 | wanted 초/NOUN/candle | got 초/NOUN/the SI unit of time / the early part of /undecided 0.92 | core+shards
- 턱 | 넘어져서 턱이 아파요. @턱이 | wanted 턱/NOUN/chin | got 턱/NOUN/chin / a cause / with a sudden / serving/undecided 0.92 | core+shards
- 풀 | 종이를 풀로 붙였어요. @풀로 | wanted 풀/NOUN/glue | got 풀/NOUN/herbaceous plants / glue / pool/undecided 0.92 | core+shards
- 회 | 이야기는 다음 회에 계속돼요. @회에 | wanted 회/NOUN/installment | got 회/NOUN/sliced raw meat or fish / installment / /undecided 0.92 | core+shards

### (c) a sentence rule misfiring

- ★ 아니면 | 지금 아니면 내일 가요. @아니면 | wanted 아니면/CONJ/or | got 아니다/AUX/not to be 0.84 | core+shards
- ★ 아니면 | 커피 아니면 차? @아니면 | wanted 아니면/CONJ/or | got 아니다/AUX/not to be 0.84 | core+shards
- 잇다 | 아들이 아버지의 일을 이어 가요. @이어 | wanted 잇다/VERB/continue,connect | got 이어/ADV/following 0.84 | shards | (shards) 'a closed-class word written alone' chose MAG 이어 'following' over 잇다 + -어 before the auxiliary 가요

### (d) the word or sense missing from the lexicon

- ★ 만 | 우리는 십 년 만에 만났어요. @만에 | wanted 만/NOUN/after,since,elapsed | got 만/NUM/ten thousand 0.84 | core+shards

### (e) a set state or row in the lexicon

- ★ 주 | B: 이 주 동안 휴가예요. @주 | wanted 주/CLF/week or 주/NOUN/week | got 주/CLF/counter for weeks / counter for trees/undecided 0.84 | core+shards
- ★ 주 | 다음 주에 가요. @주에 | wanted 주/NOUN/week | got 주/NOUN/week (unit of time) / main/principal par/undecided 0.84 | core+shards

### Two-sided, noun side

- ★ 가지만 | noun 나무에 가지만 남았어요. | wanted 가지/NOUN | got 가다/VERB/to go 0.84 | core+shards
- ★ 간 | noun 간 기능이 나빠요. | wanted 간/NOUN | got 가다/VERB/to go 0.84 | core+shards
- ★ 감을 | noun 감을 하나 먹었어요. | wanted 감/NOUN | got 감다/VERB/to close one's eyes / to wash hair / to /undecided 0.84 | core+shards
- ★ 남은 | noun 남은 신경 쓰지 마세요. | wanted 남/NOUN | got 남다/VERB/to remain 0.84 | core+shards
- ★ 산 | noun 산 위에 집이 있어요. | wanted 산/NOUN | got 살다/VERB/to live 0.84 | core+shards
- ★ 실은 | noun 이 실은 아주 질겨요. | wanted 실/NOUN | got 실은/ADV/actually 0.84 | core+shards
- ★ 역사가 | noun 그 학교는 역사가 오래됐어요. | wanted 역사/NOUN | got 역사가/NOUN/historian 0.84 | core
- ★ 자의 | noun 자의 눈금을 읽으세요. | wanted 자/NOUN | got 자의/NOUN/one's own will/volition 0.84 | core+shards
- ★ 주가 | noun 이번 주가 제일 바빠요. | wanted 주/NOUN | got 주가/NOUN/stock price 0.84 | core+shards
- ★ 주도 | noun 이번 주도 바빠요. | wanted 주/NOUN | got 주도/NOUN/lead 0.84 | core+shards
- ★ 주의 | noun 이번 주의 계획을 세웠어요. | wanted 주/NOUN | got 주의/NOUN/attention / ideology/undecided 0.84 | core+shards
- ★ 줄 | noun 줄 끝에 서세요. | wanted 줄/NOUN | got 주다/VERB/to give 0.84 | core+shards
- ★ 파는 | noun 파는 몸에 좋아요. | wanted 파/NOUN | got 팔다/VERB/to sell 0.84 | core+shards
- ★ 해도 | noun 하늘에 해도 달도 없어요. | wanted 해/NOUN | got 하다/VERB/to do 0.84 | core+shards
- 강도 | noun 이 마을은 강도 산도 아름다워요. | wanted 강/NOUN | got 강도/NOUN/robber / intensity/undecided 0.84 | core+shards
- 강의 | noun 강의 물이 맑아요. | wanted 강/NOUN | got 강의/NOUN/lecture 0.84 | core+shards
- 경기도 | noun 비 때문에 경기도 취소됐어요. | wanted 경기/NOUN | got 경기도/PROPN/Gyeonggi 0.84 | core+shards
- 논의 | noun 논의 벼가 잘 자라요. | wanted 논/NOUN | got 논의/NOUN/discussion 0.84 | core+shards
- 높이는 | noun 이 산의 높이는 천 미터예요. | wanted 높이/NOUN | got 높이다/VERB/to raise or elevate 0.84 | core+shards
- 속도 | noun 가방 속도 비었어요. | wanted 속/NOUN | got 속도/NOUN/speed 0.84 | core
- 자라고 | noun 이건 자라고 저건 거북이에요. | wanted 자라/NOUN | got 자라다/VERB/to grow 0.84 | shards

### Two-sided, pred side

- ★ 가는 | pred 가는 실로 꿰매요. | wanted 가늘다/ADJ | got 가/NOUN/border / family / allowed/undecided 0.84 | shards
- ★ 개는 | pred 엄마는 빨래를 개는 중이에요. | wanted 개다/VERB | got 개/NOUN/dog 0.84 | core+shards
- ★ 남은 | pred 남은 음식을 버렸어요. | wanted 남다/VERB | got 남/NOUN/other person 0.84 | core+shards
- ★ 낮은 | pred 낮은 의자에 앉았어요. | wanted 낮다/ADJ | got 낮/NOUN/daytime 0.84 | core+shards
- ★ 산 | pred 어제 산 책이에요. | wanted 사다/VERB | got 살다/VERB/to live 0.84 | core+shards
- ★ 식은 | pred 식은 밥을 먹었어요. | wanted 식다/VERB | got 식/NOUN/ceremony 0.84 | core+shards
- ★ 적은 | pred 그는 적은 돈으로 살아요. | wanted 적다/ADJ | got 적/NOUN/enemy / time, experience (of having done/undecided 0.84 | core+shards
- ★ 젖은 | pred 젖은 옷을 벗으세요. | wanted 젖다/VERB | got 젖/NOUN/breast 0.84 | core+shards
- 대는 | pred 그림에 손을 대는 사람이 있어요. | wanted 대다/VERB | got 대/NOUN/something large / stalk (of herbaceous p/undecided 0.84 | core+shards
- 불은 | pred 물에 불은 쌀로 밥을 지어요. | wanted 붇다/VERB | got 불/NOUN/fire 0.84 | shards
- 빚은 | pred 엄마가 직접 빚은 만두예요. | wanted 빚다/VERB | got 빚/NOUN/debt 0.84 | core
- 숨은 | pred 숨은 그림을 찾아요. | wanted 숨다/VERB | got 숨/NOUN/breath 0.84 | core+shards
- 자를 | pred 종이를 자를 가위가 없어요. | wanted 자르다/VERB | got 자/NOUN/ruler / person; one who/undecided 0.84 | core

### Two-sided, whole side

- 대가 | whole 그는 대가 없이 도왔어요. | wanted 대가/NOUN | got 대/CLF/counter for long objects; counter for bl/undecided 0.84 | core+shards

### Noun + particle frames

- ★ 가게 | also bare 가게도 | wanted 가게/NOUN + also (count 5) | got 가다/VERB/to go 0.84 | core+shards
- ★ 가게 | also 가게도 있어요. | wanted 가게/NOUN + also (count 5) | got 가다/VERB/to go 0.84 | core+shards
- ★ 가게 | topic bare 가게는 | wanted 가게/NOUN + topic (count 5) | got 가다/VERB/to go 0.84 | core+shards
- ★ 가게 | topic 가게는 좋아요. | wanted 가게/NOUN + topic (count 5) | got 가다/VERB/to go 0.84 | core+shards
- ★ 감 | object bare 감을 | wanted 감/NOUN+PROPN + object (count 8) | got 감다/VERB/to close one's eyes / to wash hair / to /undecided 0.84 | core+shards
- ★ 감 | topic bare 감은 | wanted 감/NOUN+PROPN + topic (count 8) | got 감다/VERB/to close one's eyes / to wash hair / to /undecided 0.84 | core+shards
- ★ 개 | also bare 개도 | wanted 개/NOUN + also (count 174) | got 개/CLF/counter for objects: item, piece 0.84 | core+shards
- ★ 개 | genitive bare 개의 | wanted 개/NOUN + of (count 174) | got 개/CLF/counter for objects: item, piece 0.84 | core+shards
- ★ 개 | object bare 개를 | wanted 개/NOUN + object (count 174) | got 개/CLF/counter for objects: item, piece 0.84 | core+shards
- ★ 개 | only bare 개만 | wanted 개/NOUN + only (count 174) | got 개/CLF/counter for objects: item, piece 0.84 | core+shards
- ★ 개 | place bare 개에 | wanted 개/NOUN + to (count 174) | got 개/CLF/counter for objects: item, piece 0.84 | core+shards
- ★ 개 | subject bare 개가 | wanted 개/NOUN + subject (count 174) | got 개/CLF/counter for objects: item, piece 0.84 | core
- ★ 개 | topic bare 개는 | wanted 개/NOUN + topic (count 174) | got 개/CLF/counter for objects: item, piece 0.84 | core+shards
- ★ 남 | object bare 남을 | wanted 남/NOUN + object (count 36) | got 남다/VERB/to remain 0.84 | core+shards
- ★ 남 | topic bare 남은 | wanted 남/NOUN + topic (count 36) | got 남다/VERB/to remain 0.84 | core+shards
- ★ 년 | also bare 년도 | wanted 년/NOUN + also (count 1165) | got 년/CLF/year 0.92 | core
- ★ 년 | also 년도 있어요. | wanted 년/NOUN + also (count 1165) | got 년/CLF/year 0.92 | core
- ★ 년 | genitive bare 년의 | wanted 년/NOUN + of (count 1165) | got 년/CLF/year 0.92 | core+shards
- ★ 년 | genitive 년의 이름을 알아요. | wanted 년/NOUN + of (count 1165) | got 년/CLF/year 0.92 | core+shards
- ★ 년 | object bare 년을 | wanted 년/NOUN + object (count 1165) | got 년/CLF/year 0.92 | core+shards
- ★ 년 | object 년을 봤어요. | wanted 년/NOUN + object (count 1165) | got 년/CLF/year 0.92 | core+shards
- ★ 년 | only bare 년만 | wanted 년/NOUN + only (count 1165) | got 년/CLF/year 0.92 | core+shards
- ★ 년 | only 년만 있어요. | wanted 년/NOUN + only (count 1165) | got 년/CLF/year 0.92 | core+shards
- ★ 년 | place bare 년에 | wanted 년/NOUN + to (count 1165) | got 년/CLF/year 0.92 | core+shards
- ★ 년 | place 년에 있어요. | wanted 년/NOUN + to (count 1165) | got 년/CLF/year 0.92 | core+shards
- ★ 년 | subject bare 년이 | wanted 년/NOUN + subject (count 1165) | got 년/CLF/year 0.92 | core+shards
- ★ 년 | subject 년이 있어요. | wanted 년/NOUN + subject (count 1165) | got 년/CLF/year 0.92 | core+shards
- ★ 년 | topic bare 년은 | wanted 년/NOUN + topic (count 1165) | got 년/CLF/year 0.92 | core+shards
- ★ 년 | topic 년은 좋아요. | wanted 년/NOUN + topic (count 1165) | got 년/CLF/year 0.92 | core+shards
- ★ 대 | also bare 대도 | wanted 대/NOUN + also (count 76) | got 대/CLF/counter for long objects; counter for bl/undecided 0.84 | core+shards
- ★ 대 | genitive bare 대의 | wanted 대/NOUN + of (count 76) | got 대/CLF/counter for long objects; counter for bl/undecided 0.84 | core+shards
- ★ 대 | object bare 대를 | wanted 대/NOUN + object (count 76) | got 대/CLF/counter for long objects; counter for bl/undecided 0.84 | core+shards
- ★ 대 | place bare 대에 | wanted 대/NOUN + to (count 76) | got 대/CLF/counter for long objects; counter for bl/undecided 0.84 | core+shards
- ★ 대 | topic bare 대는 | wanted 대/NOUN + topic (count 76) | got 대/CLF/counter for long objects; counter for bl/undecided 0.84 | core+shards
- ★ 명 | also bare 명도 | wanted 명/NOUN+PROPN + also (count 196) | got 명/CLF/counter for people 0.84 | core+shards
- ★ 명 | genitive bare 명의 | wanted 명/NOUN+PROPN + of (count 196) | got 명/CLF/counter for people 0.84 | core
- ★ 명 | object bare 명을 | wanted 명/NOUN+PROPN + object (count 196) | got 명/CLF/counter for people 0.84 | core+shards
- ★ 명 | only bare 명만 | wanted 명/NOUN+PROPN + only (count 196) | got 명/CLF/counter for people 0.84 | core+shards
- ★ 명 | place bare 명에 | wanted 명/NOUN+PROPN + to (count 196) | got 명/CLF/counter for people 0.84 | core+shards
- ★ 명 | subject bare 명이 | wanted 명/NOUN+PROPN + subject (count 196) | got 명/CLF/counter for people 0.84 | core+shards
- ★ 명 | topic bare 명은 | wanted 명/NOUN+PROPN + topic (count 196) | got 명/CLF/counter for people 0.84 | core+shards
- ★ 번 | also bare 번도 | wanted 번/NOUN + also (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 번 | also 번도 있어요. | wanted 번/NOUN + also (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 번 | genitive bare 번의 | wanted 번/NOUN + of (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 번 | genitive 번의 이름을 알아요. | wanted 번/NOUN + of (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 번 | object bare 번을 | wanted 번/NOUN + object (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 번 | object 번을 봤어요. | wanted 번/NOUN + object (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 번 | only bare 번만 | wanted 번/NOUN + only (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 번 | only 번만 있어요. | wanted 번/NOUN + only (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 번 | place bare 번에 | wanted 번/NOUN + to (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 번 | place 번에 있어요. | wanted 번/NOUN + to (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 번 | subject bare 번이 | wanted 번/NOUN + subject (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 번 | subject 번이 있어요. | wanted 번/NOUN + subject (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 번 | topic bare 번은 | wanted 번/NOUN + topic (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 번 | topic 번은 좋아요. | wanted 번/NOUN + topic (count 127) | got 번/CLF/times 0.92 | core+shards
- ★ 사 | also bare 사도 | wanted 사/NOUN+NUM + also (count 20) | got 사다/VERB/to buy 0.84 | core
- ★ 사 | also 사도 있어요. | wanted 사/NOUN+NUM + also (count 20) | got 사다/VERB/to buy 0.84 | core
- ★ 사 | topic bare 사는 | wanted 사/NOUN+NUM + topic (count 20) | got 살다/VERB/to live 0.84 | core+shards
- ★ 사고 | also 사고도 있어요. | wanted 사고/NOUN + also (count 79) | got 사다/VERB/to buy 0.84 | core+shards
- ★ 살 | also bare 살도 | wanted 살/NOUN + also (count 21) | got 살/CLF/years of age (native numerals) 0.84 | core+shards
- ★ 살 | genitive bare 살의 | wanted 살/NOUN + of (count 21) | got 살/CLF/years of age (native numerals) 0.84 | core+shards
- ★ 살 | object bare 살을 | wanted 살/NOUN + object (count 21) | got 살/CLF/years of age (native numerals) 0.84 | core+shards
- ★ 살 | only bare 살만 | wanted 살/NOUN + only (count 21) | got 살/CLF/years of age (native numerals) 0.84 | core+shards
- ★ 살 | place bare 살에 | wanted 살/NOUN + to (count 21) | got 살/CLF/years of age (native numerals) 0.84 | core+shards
- ★ 살 | subject bare 살이 | wanted 살/NOUN + subject (count 21) | got 살/CLF/years of age (native numerals) 0.84 | core+shards
- ★ 살 | topic bare 살은 | wanted 살/NOUN + topic (count 21) | got 살/CLF/years of age (native numerals) 0.84 | core+shards
- ★ 삼 | object bare 삼을 | wanted 삼/NUM+NOUN + object (count 8) | got 삼다/VERB/to take as 0.84 | core+shards
- ★ 삼 | topic bare 삼은 | wanted 삼/NUM+NOUN + topic (count 8) | got 삼다/VERB/to take as 0.84 | core+shards
- ★ 실 | object bare 실을 | wanted 실/NOUN + object (count 9) | got 싣다/VERB/to load onto a vehicle 0.84 | core+shards
- ★ 오 | object bare 오를 | wanted 오/PROPN+NOUN+NUM + object (count 5) | got 오르다/VERB/to go up 0.92 | core+shards
- ★ 오 | object 오를 봤어요. | wanted 오/PROPN+NOUN+NUM + object (count 5) | got 오르다/VERB/to go up 0.92 | core+shards
- ★ 오 | subject bare 오가 | wanted 오/PROPN+NOUN+NUM + subject (count 5) | got 오가다/VERB/to come and go 0.84 | core+shards
- ★ 오 | subject 오가 있어요. | wanted 오/PROPN+NOUN+NUM + subject (count 5) | got 오가다/VERB/to come and go 0.84 | core+shards
- ★ 오 | topic bare 오는 | wanted 오/PROPN+NOUN+NUM + topic (count 5) | got 오다/VERB/to come; to fall (rain, snow) 0.92 | core+shards
- ★ 오 | topic 오는 좋아요. | wanted 오/PROPN+NOUN+NUM + topic (count 5) | got 오다/VERB/to come; to fall (rain, snow) 0.92 | core+shards
- ★ 입 | object bare 입을 | wanted 입/NOUN + object (count 35) | got 입다/VERB/to wear 0.84 | core+shards
- ★ 입 | topic bare 입은 | wanted 입/NOUN + topic (count 35) | got 입다/VERB/to wear 0.84 | core+shards
- ★ 장 | also bare 장도 | wanted 장/NOUN+PROPN + also (count 55) | got 장/CLF/sheet (of paper) 0.84 | core+shards
- ★ 장 | genitive bare 장의 | wanted 장/NOUN+PROPN + of (count 55) | got 장/CLF/sheet (of paper) 0.84 | core+shards
- ★ 장 | object bare 장을 | wanted 장/NOUN+PROPN + object (count 55) | got 장/CLF/sheet (of paper) 0.84 | core+shards
- ★ 장 | only bare 장만 | wanted 장/NOUN+PROPN + only (count 55) | got 장/CLF/sheet (of paper) 0.84 | core+shards
- ★ 장 | place bare 장에 | wanted 장/NOUN+PROPN + to (count 55) | got 장/CLF/sheet (of paper) 0.84 | core+shards
- ★ 장 | subject bare 장이 | wanted 장/NOUN+PROPN + subject (count 55) | got 장/CLF/sheet (of paper) 0.84 | core+shards
- ★ 장 | topic bare 장은 | wanted 장/NOUN+PROPN + topic (count 55) | got 장/CLF/sheet (of paper) 0.84 | core+shards
- ★ 주 | topic bare 주는 | wanted 주/NOUN+PROPN + topic (count 57) | got 주다/VERB/to give 0.84 | core+shards
- ★ 파 | topic bare 파는 | wanted 파/NOUN + topic (count 6) | got 팔다/VERB/to sell 0.84 | core+shards
- ★ 해 | also bare 해도 | wanted 해/NOUN+NUM + also (count 75) | got 하다/VERB/to do 0.84 | core
- ★ 해 | also 해도 있어요. | wanted 해/NOUN+NUM + also (count 75) | got 하다/VERB/to do 0.84 | core
- 가 | also bare 가도 | wanted 가/NOUN + also (count 10) | got 가다/VERB/to go 0.84 | core
- 가 | also 가도 있어요. | wanted 가/NOUN + also (count 10) | got 가다/VERB/to go 0.84 | core
- 가 | object bare 가를 | wanted 가/NOUN + object (count 10) | got 가르다/VERB/to divide 0.84 | core+shards
- 가 | topic bare 가는 | wanted 가/NOUN + topic (count 10) | got 가다/VERB/to go 0.84 | core+shards
- 각 | genitive bare 각의 | wanted 각/NOUN + of (count 129) | got 각/NOUN//unconfirmed 0.45 | core
- 각 | genitive 각의 이름을 알아요. | wanted 각/NOUN + of (count 129) | got 각/NOUN//unconfirmed 0.45 | core
- 각 | object bare 각을 | wanted 각/NOUN + object (count 129) | got 각/NOUN//unconfirmed 0.45 | core
- 각 | object 각을 봤어요. | wanted 각/NOUN + object (count 129) | got 각/NOUN//unconfirmed 0.45 | core
- 각 | only bare 각만 | wanted 각/NOUN + only (count 129) | got 각/NOUN//unconfirmed 0.45 | core
- 각 | only 각만 있어요. | wanted 각/NOUN + only (count 129) | got 각/NOUN//unconfirmed 0.45 | core
- 각 | place bare 각에 | wanted 각/NOUN + to (count 129) | got 각/NOUN//unconfirmed 0.45 | core
- 각 | place 각에 있어요. | wanted 각/NOUN + to (count 129) | got 각/NOUN//unconfirmed 0.45 | core
- 각 | subject bare 각이 | wanted 각/NOUN + subject (count 129) | got 각/NOUN//unconfirmed 0.45 | core
- 각 | subject 각이 있어요. | wanted 각/NOUN + subject (count 129) | got 각/NOUN//unconfirmed 0.45 | core
- 각 | topic bare 각은 | wanted 각/NOUN + topic (count 129) | got 각/NOUN//unconfirmed 0.45 | core
- 각 | topic 각은 좋아요. | wanted 각/NOUN + topic (count 129) | got 각/NOUN//unconfirmed 0.45 | core
- 거 | also bare 거도 | wanted 거/PRON + also (count 107) | got 거/NOUN/thing (spoken form of the bound noun for 0.92 | core+shards
- 거 | also 거도 있어요. | wanted 거/PRON + also (count 107) | got 거/NOUN/thing (spoken form of the bound noun for 0.92 | core+shards
- 거 | object bare 거를 | wanted 거/PRON + object (count 107) | got 거/NOUN/thing (spoken form of the bound noun for 0.92 | core+shards
- 거 | object 거를 봤어요. | wanted 거/PRON + object (count 107) | got 거/NOUN/thing (spoken form of the bound noun for 0.92 | core+shards
- 거 | subject bare 거가 | wanted 거/PRON + subject (count 107) | got 거/NOUN/thing (spoken form of the bound noun for 0.92 | core+shards
- 거 | subject 거가 있어요. | wanted 거/PRON + subject (count 107) | got 거/NOUN/thing (spoken form of the bound noun for 0.92 | core+shards
- 거 | topic bare 거는 | wanted 거/PRON + topic (count 107) | got 거/NOUN/thing (spoken form of the bound noun for 0.84 | core+shards
- 거 | topic 거는 좋아요. | wanted 거/PRON + topic (count 107) | got 거/NOUN/thing (spoken form of the bound noun for 0.84 | core+shards
- 거의 | genitive bare 거의의 | wanted 거의/NOUN+ADV + of (count 170) | got 거의/NOUN//unconfirmed 0.45 | core
- 거의 | genitive 거의의 이름을 알아요. | wanted 거의/NOUN+ADV + of (count 170) | got 거의/NOUN//unconfirmed 0.45 | core
- 거의 | object bare 거의를 | wanted 거의/NOUN+ADV + object (count 170) | got 거의/NOUN//unconfirmed 0.45 | core
- 거의 | object 거의를 봤어요. | wanted 거의/NOUN+ADV + object (count 170) | got 거의/NOUN//unconfirmed 0.45 | core
- 거의 | place bare 거의에 | wanted 거의/NOUN+ADV + to (count 170) | got 거의/NOUN//unconfirmed 0.45 | core
- 거의 | place 거의에 있어요. | wanted 거의/NOUN+ADV + to (count 170) | got 거의/NOUN//unconfirmed 0.45 | core
- 거의 | subject bare 거의가 | wanted 거의/NOUN+ADV + subject (count 170) | got 거의/NOUN//unconfirmed 0.45 | core
- 거의 | subject 거의가 있어요. | wanted 거의/NOUN+ADV + subject (count 170) | got 거의/NOUN//unconfirmed 0.45 | core
- 구 | also bare 구도 | wanted 구/NOUN+PROPN+NUM + also (count 6) | got 구/CLF/counter for corpses 0.84 | core+shards
- 구 | genitive bare 구의 | wanted 구/NOUN+PROPN+NUM + of (count 6) | got 구/CLF/counter for corpses 0.84 | core+shards
- 구 | object bare 구를 | wanted 구/NOUN+PROPN+NUM + object (count 6) | got 구/CLF/counter for corpses 0.84 | core+shards
- 구 | only bare 구만 | wanted 구/NOUN+PROPN+NUM + only (count 6) | got 구/CLF/counter for corpses 0.84 | core+shards
- 구 | place bare 구에 | wanted 구/NOUN+PROPN+NUM + to (count 6) | got 구/CLF/counter for corpses 0.84 | core+shards
- 구 | subject bare 구가 | wanted 구/NOUN+PROPN+NUM + subject (count 6) | got 구/CLF/counter for corpses 0.84 | core
- 구 | topic bare 구는 | wanted 구/NOUN+PROPN+NUM + topic (count 6) | got 구/CLF/counter for corpses 0.84 | core+shards
- 낮 | object bare 낮을 | wanted 낮/NOUN + object (count 10) | got 낮다/ADJ/to be low (in height, in value) 0.84 | core+shards
- 낮 | topic bare 낮은 | wanted 낮/NOUN + topic (count 10) | got 낮다/ADJ/to be low (in height, in value) 0.84 | core+shards
- 다 | object bare 다를 | wanted 다/NOUN+ADV + object (count 101) | got 다르다/ADJ/to be different 0.84 | core+shards
- 도 | topic bare 도는 | wanted 도/NOUN + topic (count 71) | got 돌다/VERB/to revolve 0.84 | core+shards
- 떼 | topic bare 떼는 | wanted 떼/NOUN + topic (count 5) | got 떼다/VERB/to detach 0.84 | core+shards
- 뭐 | subject bare 뭐가 | wanted 뭐/PRON + subject (count 20) | got 무엇/PRON/what; something, anything 0.84 | core+shards
- 뭐 | subject 뭐가 있어요. | wanted 뭐/PRON + subject (count 20) | got 무엇/PRON/what; something, anything 0.84 | core+shards
- 비록 | genitive bare 비록의 | wanted 비록/NOUN+ADV + of (count 57) | got 비록/NOUN//unconfirmed 0.45 | core
- 비록 | genitive 비록의 이름을 알아요. | wanted 비록/NOUN+ADV + of (count 57) | got 비록/NOUN//unconfirmed 0.45 | core
- 비록 | object bare 비록을 | wanted 비록/NOUN+ADV + object (count 57) | got 비록/NOUN//unconfirmed 0.45 | core
- 비록 | object 비록을 봤어요. | wanted 비록/NOUN+ADV + object (count 57) | got 비록/NOUN//unconfirmed 0.45 | core
- 비록 | place bare 비록에 | wanted 비록/NOUN+ADV + to (count 57) | got 비록/NOUN//unconfirmed 0.45 | core
- 비록 | place 비록에 있어요. | wanted 비록/NOUN+ADV + to (count 57) | got 비록/NOUN//unconfirmed 0.45 | core
- 비록 | subject bare 비록이 | wanted 비록/NOUN+ADV + subject (count 57) | got 비록/ADV/even if 0.6 | core
- 비록 | subject 비록이 있어요. | wanted 비록/NOUN+ADV + subject (count 57) | got 비록/ADV/even if 0.6 | core
- 빚 | object bare 빚을 | wanted 빚/NOUN + object (count 7) | got 빚다/VERB/to brew (alcohol) 0.84 | core+shards
- 빚 | topic bare 빚은 | wanted 빚/NOUN + topic (count 7) | got 빚다/VERB/to brew (alcohol) 0.84 | core+shards
- 삼다 | subject bare 삼다가 | wanted 삼다/NOUN + subject (count 103) | got 삼다/VERB/to take as 0.92 | shards
- 삼다 | subject 삼다가 있어요. | wanted 삼다/NOUN + subject (count 103) | got 삼다/VERB/to take as 0.92 | shards
- 서로 | genitive bare 서로의 | wanted 서로/PRON+ADV + of (count 156) | got 서/NOUN/west / police station/undecided 0.92 | core+shards
- 서로 | genitive 서로의 이름을 알아요. | wanted 서로/PRON+ADV + of (count 156) | got 서/NOUN/west / police station/undecided 0.92 | core+shards
- 여 | topic bare 여는 | wanted 여/NOUN+PRON + topic (count 79) | got 열다/VERB/to open 0.84 | core+shards
- 오래 | genitive bare 오래의 | wanted 오래/NOUN+ADV + of (count 48) | got 오래/NOUN//unconfirmed 0.45 | core
- 오래 | genitive 오래의 이름을 알아요. | wanted 오래/NOUN+ADV + of (count 48) | got 오래/NOUN//unconfirmed 0.45 | core
- 오래 | object bare 오래를 | wanted 오래/NOUN+ADV + object (count 48) | got 오래/NOUN//unconfirmed 0.45 | core
- 오래 | object 오래를 봤어요. | wanted 오래/NOUN+ADV + object (count 48) | got 오래/NOUN//unconfirmed 0.45 | core
- 오래 | place bare 오래에 | wanted 오래/NOUN+ADV + to (count 48) | got 오래/NOUN//unconfirmed 0.45 | core
- 오래 | place 오래에 있어요. | wanted 오래/NOUN+ADV + to (count 48) | got 오래/NOUN//unconfirmed 0.45 | core
- 오래 | subject bare 오래가 | wanted 오래/NOUN+ADV + subject (count 48) | got 오래다/ADJ/to be long continued 0.92 | core
- 오래 | subject 오래가 있어요. | wanted 오래/NOUN+ADV + subject (count 48) | got 오래다/ADJ/to be long continued 0.88 | core
- 이십 | only bare 이십만 | wanted 이십/NUM + only (count 0) | got 이십만/NUM/ 0.84 | core+shards
- 이십 | only 이십만 있어요. | wanted 이십/NUM + only (count 0) | got 이십만/NUM/ 0.84 | core+shards
- 재 | also bare 재도 | wanted 재/NOUN + also (count 14) | got 재다/VERB/to measure / to season / to load (gun) //undecided 0.84 | core+shards
- 재 | also 재도 있어요. | wanted 재/NOUN + also (count 14) | got 재다/VERB/to measure / to season / to load (gun) //undecided 0.84 | core+shards
- 재 | topic bare 재는 | wanted 재/NOUN + topic (count 14) | got 재다/VERB/to measure / to season / to load (gun) //undecided 0.84 | core+shards
- 주로 | genitive bare 주로의 | wanted 주로/NOUN+ADV + of (count 51) | got 주/NOUN/week (unit of time) / main/principal par/undecided 0.84 | core+shards
- 주로 | genitive 주로의 이름을 알아요. | wanted 주로/NOUN+ADV + of (count 51) | got 주/NOUN/week (unit of time) / main/principal par/undecided 0.84 | core+shards
- 주로 | object bare 주로를 | wanted 주로/NOUN+ADV + object (count 51) | got 주로/NOUN//unconfirmed 0.45 | core
- 주로 | object 주로를 봤어요. | wanted 주로/NOUN+ADV + object (count 51) | got 주로/NOUN//unconfirmed 0.45 | core
- 주로 | place bare 주로에 | wanted 주로/NOUN+ADV + to (count 51) | got 주로/NOUN//unconfirmed 0.45 | core
- 주로 | place 주로에 있어요. | wanted 주로/NOUN+ADV + to (count 51) | got 주로/NOUN//unconfirmed 0.45 | core
- 주로 | subject bare 주로가 | wanted 주로/NOUN+ADV + subject (count 51) | got 주로/NOUN//unconfirmed 0.45 | core
- 주로 | subject 주로가 있어요. | wanted 주로/NOUN+ADV + subject (count 51) | got 주로/NOUN//unconfirmed 0.45 | core
- 지 | topic bare 지는 | wanted 지/NOUN + topic (count 50) | got 지다/VERB/to fall; to set, go down / to become, ge/undecided 0.84 | core+shards
- 하 | topic bare 하는 | wanted 하/NOUN + topic (count 55) | got 하다/VERB/to do 0.84 | core+shards

## Corrections to the table

- Meaning keywords aligned with a lexicon gloss that is RIGHT but worded otherwise (before the first run, from precheck.txt): 고등학생 +schooler, 그냥 +simply, 내 (나) +I, 나중 +next time, 발전하다 +grow, 아까 +just now, 열심히 +enthusiastically, 재미있다 +amusing, 저런 +such, 정말 +true, 제일 +number one, 초 +SI unit.
- Built 하다 predicates in the core state carry the noun's gloss ("decision (+ 하다: to do)"): the meaning is right, my keyword was too narrow; the noun keyword was added for 결정하다, 계속하다, 발견하다, 발전하다, 분석하다, 생산하다, 유지하다, 이해하다, 인식하다, 표현하다, 설명하다, 존재하다, 칠하다.
- Bare tokens I had given one reading where Korean itself is ambiguous (an adnominal or prospective verb form is as ordinary): 끈 (+끌다), 산 (+사다, 살다), 살 (+살 flesh, 살다, 사다), 알 (+알다), 잔 (+자다), 자는 (+자 undecided), 줄 (+주다), 팔 (+팔다), 구 (+DET former, NOUN ward), 처음 (+ADV), 타 (undecided: burn / ride …, not "ride").
- 온: my sentence 명절에 온 가족이 모였어요 was ambiguous (온 = "who came for the holiday"); replaced by 온 가족이 함께 저녁을 먹었어요.
- 세 사람이 같이 왔어요: 사람 after a numeral is also the unit noun; the counter reading is accepted.
- 받는: the sentence 사랑받는 아이예요 checked another word (사랑받다, not in the lexicon); replaced by 월급을 받는 날이에요.
- Shards only (checked: the core reading is unconfirmed or the row is shard-only): 아까 and 알 (entries); 방학, 숙제, 예약, 정류장, 주소, 주스, 파티, 번호 (block C), 고등학생, 와 'wow' (sentences); 부르다 'full', 이르다 'early', 완전 ADV (sentences). These are everyday words the compiled core lacks.
- Block T, earlier pass: 이 정도면 was my tokenisation mistake (replaced by 삼십 분 정도 걸려요); the noun side of a surface that IS the noun (산 위에, 가게 앞에서, 운전할 줄) no longer requires a particle; a noun + copula reading (자라 + 이고) counts as the noun side.
- Final pass, block T bare: "undecided" is right only when two sides each have a word the lexicon counts. The expectation is derived per surface and per lexicon state from the counts of the words the analyser can read the form as: 불도, 문도, 불은, 달을, 달은 (both states; the rival 불도 / 문도 / 붇다 / 닫다² "to run" has no count) and 약을, 새는, 새도, 기자는, 복도, 무를 (core state only: the rival word is not in the core) now expect the counted noun side read confidently; 감자는 expects the predicate side (감다) with the core alone, which lacks 감자. T sentences whose wanted word the core lacks are checked with the shards only: 새는 / 새도 (새다), 불은 (붇다), 가는 (가늘다), 자라고 (자라), 복도 (복도), 감자는 (감자).
- Final pass, sets now MAIN in the lexicon (docs/korean/homonym-decisions.json): bare 공, 실, 창, 선, 떡, 파, 형 expect the main entry's bare lemma, not undecided (ball, thread, window, line, rice cake, spring onion, brother); 의사, 역사, 저 + particles already expected the main entry.
- Final pass: 편 standing alone accepts the noun "side" as well as the undecided counter; 번 accepts the noun as well as the counter (both are unit bound nouns, which Korean grammar files as nouns).
- Frame block: a form that is itself a headword (시 + 도 = 시도 "attempt", 그 + 만 = 그만, 전 + 이 = 전이) is a real ambiguity and is not scored; a spelling the lexicon also files as an adverb (가장, 다시, 지금) passes with the adverb + particle reading too.

