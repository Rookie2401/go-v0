# Korean pack: build plan and contract

Branch `feat/korean-pack`, worktree `C:\Users\CJWal\dev\go-v0-korean` (never under OneDrive), from master `7f08e85e`.
The audit behind this plan is `docs/korean/AUDIT.md`. The owner's brief (2026-11-25) asks for Korean as a first-class
language of the existing ecosystem: no separate app, reader or vocabulary store, and no dependence on Reading Analysis.

This file is the contract every package builds to. A package changes only the files it owns. A change to this file is
the coordinator's.

## Design in one page

Korean is agglutinative: one written unit (an 어절, the text between spaces) is a stem plus a chain of particles or
endings, and the number of possible written forms of one word is not bounded. A form index (the Russian and Greek model:
every table row as a key) cannot hold them. Korean therefore follows a **stem lexicon plus rules** model:

1. **Compiled core** `src/adapters/korean/generated/core.ts` (`ko-core`): every particle and ending (closed, hand-written
   tables), the closed-class words, and the commonest open-class headwords with their part of speech, irregular class
   and first gloss. A host with no assets still reads ordinary prose.
2. **Sharded full lexicon** `public/lexicon/ko/standard/` (`ko-lexicon`): every headword of the dictionary source,
   gzip shards by the first syllable's jamo, loaded on demand before a lookup (`korean/shards.ts`, the shared loader).
   Keys are HEADWORD STEMS, not written forms.
3. **Dictionary** `public/dict/ko/` built by the existing pipeline (`dict:build`, `dict:build-full`,
   `dict:build-forms`, `dict:build-reverse`): senses, pronunciation, Hanja, the records behind the card.
4. **Analyser** `src/adapters/ko.ts` + `src/adapters/korean/**`, written in TypeScript like every other adapter:
   Hangul arithmetic → candidate stems → lexicon lookup → generation of the stem's junction forms and matching of the
   particle or ending chain → sentence-level ordering → constructions, phrases, shallow syntax, pronunciation.

Why not Kiwi inside the product: see `AUDIT.md` (size of the model against the extension's bundle ceilings, the
512 MB service that runs the same analysers, and the one analyser contract every host shares). Kiwi and the Universal
Dependencies treebanks are used to MEASURE this analyser, never to produce a learner's reading.

Nothing is invented. A lemma, its part of speech, its irregular class, its Hanja and its gloss are the dictionary
source's. A reading the lexicon does not vouch for is marked `unconfirmed` and explains the form only.

## Decisions that bind every package

### Text and keys (`korean/hangul.ts`, `korean/text.ts`)

- **The page's text is never changed.** Tokens carry offsets into the ORIGINAL string. Every normalisation below
  produces a key, never a replacement text.
- **Key** = `koKey(form)`: NFC; conjoining jamo (U+1100–11FF, the canonically decomposed form) therefore compose to
  precomposed syllables (U+AC00–D7A3). Compatibility jamo (U+3130–318F: ㄱ, ㅏ standing alone) are KEPT as they are
  (a lone ㅋㅋ or a jamo named in a grammar text is not a syllable and is not folded into one). Halfwidth jamo
  (U+FFA0–FFDC) are mapped to compatibility jamo. Nothing else is folded: no romanisation, no Hanja-to-Hangul.
- **Offset map.** `koNormalize(text)` returns `{ key, map }` where `map[i]` is the offset in the original text of the
  key's i-th UTF-16 unit, and `map[key.length]` the end. A span of the key maps back to a span of the original that
  covers whole original characters. Every part span the analyser reports is in ORIGINAL offsets relative to the token.
- **Token** = one 어절 piece: a maximal run of Hangul syllables and Hanja (with an inner apostrophe-free join). Digits
  are their own token, Latin letters their own token, punctuation its own token. `2024년에는` is `2024` + `년에는`;
  `KBS가` is `KBS` + `가` (the particle attaches to the Latin token: `가` is analysed alone as a particle whose host is
  the token before it). Whitespace is never a token.
- **Invisible characters inside a word never split it**: the soft hyphen (U+00AD), zero-width space and joiners (U+200B–200D),
  the word joiner (U+2060) and the byte-order mark (U+FEFF) between two Hangul letters stay inside the token (its surface keeps
  them, its key drops them, the offset map covers them).
- **Sentences** end at `.` `!` `?` `…` `。` and their runs, followed by closing quotes or brackets; a number's decimal
  point and an abbreviation's full stop inside a token do not end one.
- **Hanja on the page.** A token may be written in Hanja or mix Hanja and Hangul (學校에서, 韓國語를). The key keeps the Hanja
  (nothing is converted). The lexicon files an entry ALSO under its Hanja spelling, so the analyser reaches the Hangul headword
  through the dictionary's own Hanja field; the reading's lemma is the Hangul headword and `notes.hanja` the Hanja as written.
  A Hanja string the lexicon does not hold is an unconfirmed word; no reading is invented from the characters.
- **Jamo arithmetic** is the Unicode algorithm, not a table of 11,172 strings: `decompose(syllable) → [L, V, T]`
  indexes (19 × 21 × 28), `compose(L, V, T)`. All 11,172 syllables round-trip (a test walks them).

### Identities

- **Lemma string** = the dictionary headword: a predicate in its `-다` form (`먹다`, `예쁘다`, `이다`), anything else
  as the dictionary writes it (`학생`, `학교`). Repository id `lemma:ko:<lemma>:<POS>` as for every language.
- **Homonyms are separate items** (decided 2026-11-25 on the linguistic audit's advice, which the owner told this
  build to follow: splitting them after learners have review history is far harder). Two headwords spelled alike with
  different parts of speech already differ by the id rule (`쓰다:VERB`, `쓰다:ADJ`). Two spelled alike with the SAME
  part of speech (`눈` eye / snow; `배` stomach / pear / boat; `묻다` ask, ㄷ-irregular / `묻다` bury, regular) each
  carry the dictionary's homonym number in the lemma string, written as dictionaries print it, with superscript
  digits: `눈¹`, `눈²`, `묻다¹`, `묻다²` (`koHomonymLemma(lemma, n)`, `koBareLemma(lemma)` in `korean/index-store.ts`).
  The Repository ids are therefore `lemma:ko:눈¹:NOUN` and `lemma:ko:눈²:NOUN`. A headword that is alone in its part
  of speech carries no number.
  - **A homonym set** is the entries of different etymologies that share a spelling and a SHARED part of speech
    (`koHomonymSetKey`), because that pair is the item id: 자 "ruler" (NNG) and 자 "person" (NNB) are both NOUN and are
    one set. No two entries of different etymologies may ever yield the same lemma string and part of speech (a test).
  - **Three states of a set** (measured by the audit on 2026-11-25: a fifth of running content words, 32,783 of
    159,254 in the Kaist train file, have a second etymology in their class, and for most of them no reader hesitates:
    시간, 사회, 지금, 되다). The state is a reviewable line in `docs/korean/homonym-decisions.json` (hand-written, each with
    its reason), copied into the generated registry `docs/korean/homonyms.json` and onto every row (`KoLexEntry.set`):
    - **alone**: one entry; no number.
    - **main**: one entry is what the spelling means in ordinary prose. It KEEPS THE BARE LEMMA (`lemma:ko:시간:NOUN` is
      "time") at full confidence. The other entries are numbered (`set: 'other'`); they are a reading only when a form
      or a rule proves them, or are listed last and low as "another entry of this spelling" on the card.
    - **balanced**: a real choice for a reader (눈, 배, 말, 밤, 차, 다리, 쓰다, 들다, 걷다, 묻다, 이르다): every entry is numbered,
      and an occurrence nothing decides is the undecided reading below.
    A set NOBODY has reviewed is never "main" by a guess: the order of sections on a wiki page is not commonness (저 #1
    is "that", 쓰다 #1 "to wear", 제도 #1 "archipelago"). The only automatic "main" is the entry left when every other
    entry of the set has all its senses tagged obsolete, archaic, rare, dated or dialectal (`by: 'only-current'`); every
    other unreviewed set is balanced (`by: 'default'`). INDEX.md states how many running words each state covers.
    Moving a set from balanced to main later sends the bare item's history to the main entry, which is what an
    undecided encounter most likely was; the registry refuses any other silent change.
  - **The number is the SOURCE's**: the entry's `etymology_number` on its Wiktionary page (the one stable number the
    source gives a homonym), never a position in a file or in a lexicon. The compiled core and every shard read it
    from the same field, so they cannot disagree. `docs/korean/homonyms.json` records every numbered headword with
    its class, first gloss and Hanja; a rebuild from a newer extract compares against it and REFUSES to finish when a
    number now means another word (that needs an alias in the Repository, a decision, not a silent re-key).
  - **Which homonym a sentence means** is often not known from the word, and crediting the first one would record a
    false fact. Three cases:
    1. The FORM decides (물어요 can only be 묻다 "ask", the ㄷ-irregular one): the reading's lemma is the numbered one.
       "Decides" is DERIVED from the rows: the entries of the set whose class and conjugation class can produce the
       written form; never a hand-written pair. 묻어요 excludes only "ask": "bury" and "stick" (both regular) remain, so
       it is still case 3 between those two.
    2. A rule in `sentence.ts` decides (눈 before 오다 / 내리다 is snow) and says why in `notes.context`: the numbered one.
    3. Nothing decides, in a BALANCED set (눈이 예뻐요, 묻고): the FIRST reading is the **undecided reading**: lemma = the BARE headword
       (`눈`), `notes.homonym = 'undecided'`, `notes.homonyms` listing the candidates, the gloss naming every
       candidate's meaning; the numbered readings follow it at lower confidence. The encounter, and a mark the learner
       makes on that card, go to `lemma:ko:눈:NOUN`: "met the word 눈, which one not settled". It is an item of its own,
       never merged into a numbered one by the Repository. A reader shows the level of the reading it chose.
    The first reading's confidence is always strictly the highest (the card takes the highest), and no reading is
    high-confidence while another homonym is as likely.
  - **Granularity**: one etymology of the source is one headword. Two entries of the same class under ONE etymology
    are merged into one row; only entries of different etymologies are numbered apart.
  - **The number is the source's, not a rank**: 이르다 arrives as 2 and 3, 되다 as 1 and 3. It is never printed as "1 of
    2", and an entry left alone in its set after filtering carries no number.
  - **The meaning shown first** for the commonest words is not left to the source's sense order (위하다 "to help", 자신
    "one's body", 나다 "to be born"): `docs/korean/gloss-overrides.json` holds a reviewed short gloss for the commonest
    entries, each line reviewable; the build uses it for the row's `gloss`, and a gloss that is only a cross-reference
    ("synonym of …", "See the entry at …") is resolved or left empty, never shown. An override SELECTS or shortens
    senses the source entry already has and records which (`senses`: their positions in the entry); the build checks
    it. Wording no source sense supports is allowed only with `own: true`, and the row then carries `glossOwn`, so a
    card's source line says the meaning is this product's wording, not the dictionary's. Nothing is invented unmarked.
  - **Words the source lacks** (자 "person" as a bound noun, 파악, 당연, 한편) are hand-written rows in
    `docs/korean/lexicon-supplement.json`, one reviewable line each, read by the build. Such a row is marked `own` and
    a card's source line says it is this product's entry, not the dictionary's. It never shadows a source entry; when
    it joins a source spelling's set it carries a hand-fixed number of 90 or more, identity like the source's.
  - **A row's count** (`n`) is the count of the SPELLING in the priors corpus. In a balanced set every entry carries
    it, so counts must never be summed over rows; it orders stems and never chooses between homonyms.
  - **Where the number is never shown or looked up as a spelling**: a card's headline, GoReview's card front, a
    vocabulary list, speech and search show and use the bare headword (`koBareLemma`); the number is identity, and
    may be shown beside the meaning as a dictionary does. `surfaceFromEncounterUnitId` (repository-contract) returns
    the bare headword for a numbered Korean lemma id.
  - **The dictionary** files each homonym's entry under its numbered headword as well as under the bare one
    (`src/dict/korean.ts`, as `src/dict/hebrew.ts` files a pointed spelling), so `눈²` finds snow alone and `눈`
    finds both. Speech and search strip the number (`koBareLemma`).
- **A written form is never an item of its own when its lemma is known**: `먹어요`, `먹었습니다`, `먹으면`, `먹는`
  all record `lemma:ko:먹다:VERB`. The form's grammar is recorded apart, as below.
- **Grammar items** use the two kinds the Repository already has:
  - `morph:ko:<POS>:<feature key>` for what one written form shows (the card's form construction; built by the
    extension's parser from `candidate.morph`, nothing new);
  - `syntax:ko:<pattern key>` for a construction of several morphemes or words (`detectPatterns`): `ko-progressive`
    (-고 있다), `ko-want` (-고 싶다) … the full list is in "Constructions".
  - A particle or an ending is a `WordPart` with `lemma` = its family headword (`은/는`, `이/가`, `을/를`, `-았/었-`,
    `-(으)시-`, `-습니다`) and `pos` ADP (particle) or PART (ending). Selecting a particle alone (a token that is only
    a particle, after a Latin or digit token) records `lemma:ko:<family>:ADP`.
- Knowing `먹다` says nothing about `-(으)시-`: lexical and grammatical knowledge live in different unit ids.

### Parts of speech

`candidate.pos` is the repository's shared set; the Korean class is kept beside it in `candidate.notes.koPos` (the
Sejong-style tag) and `candidate.notes.koClass` (the Korean name), so nothing is lost in the mapping:

| Korean class | Tag | `pos` | Note |
|---|---|---|---|
| 일반 명사 common noun | NNG | NOUN | |
| 고유 명사 proper noun | NNP | PROPN | |
| 의존 명사 bound noun | NNB | NOUN | `morph.NounType=Bound` |
| 대명사 pronoun | NP | PRON | |
| 수사 numeral | NR | NUM | |
| 동사 action verb | VV | VERB | |
| 형용사 descriptive verb | VA | ADJ | `morph.VerbType=Descriptive`; it conjugates, and the card says "descriptive verb" |
| 보조 용언 auxiliary predicate | VX | AUX | |
| 긍정 지정사 affirmative copula 이다 | VCP | AUX | `morph.VerbType=Cop`, `Polarity=Pos` |
| 부정 지정사 negative copula 아니다 | VCN | AUX | `morph.VerbType=Cop`, `Polarity=Neg` |
| 관형사 determiner | MM | DET | |
| 일반 부사 adverb | MAG | ADV | |
| 접속 부사 conjunctive adverb | MAJ | CONJ | the shared model has `CONJ` and `SCONJ`, no `CCONJ` |
| 단위 명사 counter | NNB | CLF | the shared classifier code; `morph.NounType=Clf` |
| 감탄사 interjection | IC | INTJ | |
| 조사 particle | JKS JKC JKG JKO JKB JKV JKQ JX JC | ADP | on a `WordPart`. 이/가 is JKS (subject) at the token; before 아니다 or 되다 the sentence layer makes it JKC (complement): the part keeps `Case=Nom`, gains `morph.Complement=Yes` and the role "complement particle", and `notes.koPos` says JKC |
| 어미 ending | EP EF EC ETN ETM | PART | on a `WordPart` |
| 접두사 prefix | XPN | — | on a `WordPart`, `kind: 'prefix'` |
| 접미사 suffix | XSN XSV XSA | — | on a `WordPart`, `kind: 'suffix'` |

### Features (`candidate.morph`; UD-style keys, values comma-joined and sorted when several hold)

Nominal side (never `Gender`; `Number` only when marked):

- `Number=Plur` when 들 is present. Absent otherwise: an unmarked noun is unspecified, never singular.
- `Case`: Nom (이/가, 께서), Acc (을/를), Gen (의), Dat (에게, 한테, 께), Loc (에, 에서), Abl (에서, 에게서, 한테서, 부터),
  Ins (로/으로), Com (와/과, 하고, 랑/이랑), Cmp (보다), Voc (아/야). A particle with several functions keeps ONE case
  value and names the functions in its part's `role` (`에`: `Case=Loc`, "place, time or destination").
- `Particle`: the family ids of every particle in the chain, in order, joined with `+`: `Particle=at+also`
  (학교에서도). The family ids are the keys of `PARTICLES` in `korean/particles.ts`.
- `Topic=Yes` (은/는), `Focus=Also|Only|Even|Each|…` for the delimiters (도, 만, 조차, 마저, 마다, 밖에, 까지, 부터).
- `Polite=Hon` for the honorific particles (께, 께서).

Predicate side, each an independent dimension:

- `VerbForm`: Fin (a sentence-final ending), Conn (a connective ending), Adn (an adnominal ending -는, -(으)ㄴ,
  -(으)ㄹ, -던), Nmlz (a nominalising ending -기, -(으)ㅁ).
- `Tense`: Past (-았/었/였-), `Tense=Past` with `Aspect=Pqp` for -았었-; nothing when unmarked (the plain present is
  unmarked and is not asserted). Adnominal: `Tense=Pres` (-는), `Past` (-(으)ㄴ on a verb), and for -(으)ㄹ `Aspect=Prosp` (prospective: what is yet to be or is
  supposed; it is not called future).
- `Mood`: Ind, Imp, Int (interrogative ending), Prop (propositive -자, -ㅂ시다), Excl (-네, -군, -구나).
- `Modality`: `Presumptive` for -겠- (intention or conjecture; never "future"), `Retrospective` for -더-.
- `Honorific=Subj` for -(으)시- (honours the subject). Independent of the next one.
- `SpeechLevel`: Hae (해체), Haeyo (해요체), Hasipsio (하십시오체), Haera (해라체), Hage (하게체), Hao (하오체);
  `SpeechLevel=Lit` for a historical or literary ending (하나이다, 하옵소서, -노라, -느니라), which is named and not
  given a modern conversational reading.
- `Polarity=Neg` only for a negative the form itself carries (안 as its own token is an adverb; -지 않다 is a construction).
- `Connective`: the ending's id for a connective form (`and`, `but`, `if`, `because`, `while`, `so-that`, `although` …).
- `VerbType`: Descriptive, Cop (see the table above).
- `Voice`: Pass or Caus for a derived verb the LEXICON marks so (보이다 from 보다, 먹이다 from 먹다, 잡히다, 들리다: the source's
  own verb sets and "passive of" / "causative of" senses; `notes.base` names the base verb), and for the forms the analysis itself
  shows: -아/어지다 (`Voice=Pass`, written as one word), a 하다-noun with 되다 / 받다 / 당하다 (`Voice=Pass`) or 시키다 (`Voice=Caus`).
  -게 하다 / -게 만들다 are constructions. A derived verb is its own lemma; nothing is decomposed that the source does not relate.
- `Irregular`: the class the LEXICON gives the lemma (`D` ㄷ, `B` ㅂ, `S` ㅅ, `H` ㅎ, `Reu` 르, `Reo` 러, `U` 우,
  `Eu` ㅡ deletion, `L` ㄹ deletion, `Ha` 하다/여). Present only when the form in hand shows the alternation.
- `Contracted=Yes` when the written form fuses the stem's last vowel with the ending (봐요, 줘요, 돼요, 해요, 마셔요).

#### The vocabulary as built (2026-11-25; the grammar copy has a line for every value, kept equal by test/language-packs/ko-pack.test.ts)

| Key | Values |
|---|---|
| VerbForm | Fin Conn Adn Nmlz |
| Tense | Past Pres |
| Aspect | Pqp Prosp |
| Mood | Ind Int Imp Prop Excl (absent where the ending does not say; `notes.sentenceType` lists what the form allows, and only a question mark sets Int) |
| Modality | Presumptive Retrospective Necessitative |
| Honorific | Subj |
| SpeechLevel | Hae Haeyo Hasipsio Haera Hage Hao Lit |
| Register | Lit (literary connectives and pre-finals: -거늘, -(으)사, -옵-) |
| Quote | Ind |
| Connective | and and-while while but so since because if intend purpose even-if only-if background then as-soon-as so-that adverbial as-if or whether because-busy the-more and-then neg inf after saying although as-i not-but besides habit as-you-know for-lit |
| VerbType | Descriptive Cop Exist (있다, 없다, 계시다: one item each) |
| Polarity | Pos Neg |
| Voice | Pass Caus (only where the entry says so, docs/korean/voice-decisions.json does, or the analysis builds it: 되다 / 받다 / 당하다 / 시키다, -아/어지다) |
| Irregular | D B S H Reu Reo U Ha L Eu |
| Contracted, Fused, Topic, Complement | Yes |
| NounType | Bound Clf |
| Number | Plur |
| Case | Nom Acc Gen Dat Loc Abl Ins Com Cmp Equ Ess Voc |
| Particle | the family ids of korean/particles.ts (58), joined with + |
| Focus | Also Only From UpTo Each Even Except Alt Any AtLeast Emph Accord LetAlone |
| Polite | Hon |

Notes a reading may carry: `homonym` (undecided, or the number), `homonyms`, `otherEntries`, `context` (why the sentence layer moved it), `derived` and `compound` (what a built word is made of), `spacing`, `spelling`, `rare`, `phrase`, `value` (a numeral), `hanja`, `glossOwn`, `sentenceType`, `koPos`, `koClass`.

### Word parts (`candidate.parts`)

One `WordPart` per morpheme, in order. `text` is the morpheme's citation form (`먹`, `-었-`, `-습니다`, `은/는` is the
family in `lemma`, `text` is the allomorph as realised: `는`). `start`/`end` are offsets into the token's ORIGINAL
surface covering the syllables in which the morpheme is realised. **Where two morphemes fuse inside one syllable
(갔 = 가 + 았, 해 = 하 + 여, 삽니다 = 살 + ㅂ니다) their spans overlap on that syllable; no span ever splits a
syllable, and `morph.Fused=Yes` is set on both parts.** `kind`: `'stem'` for the lexical stem, `'suffix'` for
particles, endings and derivational suffixes, `'component'`/`'head'` for the nouns of a compound read through its
parts, `'prefix'` for a prefix. `role` is the plain-words function ("topic particle", "past", "formal polite
declarative ending").

### Confidence and honesty

- 0.92: a lexicon stem with a chain every step of which is licensed, and no other reading within 0.15.
- 0.80–0.88: several licensed readings (all are kept, best first; the reasons for the order are in `notes.context`).
- **Doubt between homonyms never lowers the spelling against other analyses.** A balanced set is ranked as ONE reading
  (the undecided one) at the strength any single word would have (의사가 is 의사 + 가 at the same band as 학교가, not below
  의 + 사 + 가); the numbered readings of that set follow it, each lower. The doubt is shown inside the reading.
- **A whole headword outranks a DERIVATIONAL split of it.** A noun + derivational suffix (의 + 사, 다 + 리) is offered only
  where the lexicon has no headword for the whole stem, and never above a predicate analysis whose every step is
  licensed (물어요 is 묻다 / 물다, not 물 + 어; 하여 is 하다). A stem + particle or inflectional ending stays a candidate beside a
  whole headword and is RANKED, never removed: 가지 is "branch" and 가 + -지 (않다), 사고 "accident" and 사 + -고, 나도 is 나 + 도.
- **A whole function word outranks its own etymology.** 그래서, 하지만, 그럼, 그러나, 그리고 are headwords (conjunctive adverbs,
  interjections); their reading as 그렇다 / 하다 + ending is kept below them.
- **An unlisted compound keeps its head and its particle.** 예산안을 is the built, unconfirmed compound 예산안 + 을 (parts 예산 + 안),
  never its first part alone with the rest dropped.
- **A reading consumes the whole token.** No reading is confident about a prefix of the token with the rest unexplained.
- **No comma-joined sentence type.** Where the ending alone does not say statement, question, command or suggestion
  (해요체 -아/어요, 해체 -아/어), the token carries no `Mood`; `notes.sentenceType` lists what the form allows, and the
  sentence layer sets `Mood` from the punctuation (`?` → `Int`). (The card splits a listed Mood into separate readings.)
- **A reading the sentence promotes** takes the lower of the token's top confidence and 0.88. Every reading it SUPERSEDES for a sure
  reason goes to 0.45 or below, and at least 0.20 under the chosen one: the undecided reading and the other entries of a homonym
  set when a cue chose one, the lexical reading when an auxiliary is promoted, the noun when the verb position chose the predicate.
  The list stays strictly falling, and every change says why in `notes.context`, in words a person reads.
- **Only a live rival is creditable.** The product credits every reading at 0.5 or more that is not unconfirmed, and its Reading
  Analysis sends a word with more than six such readings with none. So a reading that is not a live rival sits at 0.45 or below
  and is still listed for the card: the numbered readings behind an undecided one, a rival the counts never saw, a dropped-copula
  or spacing reading, an auxiliary behind a lexical first reading, a reading the sentence set aside. A test keeps the share of
  words with more than one creditable reading under a stated ceiling and no word above six.
- **A full stop sets no Mood.** Only a question mark does (`Int`): 앉으세요. is a request and 가요. may be a statement or a suggestion.
- 0.60: a reading that needs a non-standard allomorph (는 after a consonant) or a spacing the standard does not allow.
- ≤ 0.45 and `unconfirmed: true`: the stem is not in the lexicon (a name, a new word): the particle or ending chain
  is explained, the stem is offered as written, no gloss.
- `support`: tokenization `dependable`; lemmatization `seed-only` (the compiled core) with the measured figures in the
  limitations; morphology `limited`; nothing claims review by a native speaker.
- An irregular class is the lexicon's. When the lexicon has no class for a stem whose shape allows two (걷다 walk /
  걷다 gather), both readings are produced and none is presented as certain.

### Pronunciation

`korean/pronunciation.ts` gives (a) the standard pronunciation as a Hangul respelling in brackets (`[한구거]`), by
rule: final-consonant neutralisation, liaison, nasal and liquid assimilation, tensification after an obstruent,
aspiration with ㅎ, palatalisation, compound finals; the dictionary's own pronunciation wins when it has one;
the tensing after the prospective ending inside a word (갈게 [갈께], 할 수 [할 쑤] when the next word is given); 져 쪄 쳐 said 저 쩌 처
(가져 [가저]);
(b) Revised Romanization of that pronunciation, as `transliteration` (a noun keeps the h after ㄱ ㄷ ㅂ: 집현전 jiphyeonjeon;
a predicate's aspiration is written: 좋고 joko); supplemental, never an identity, and shown only
where the existing preference shows transliterations. Spelling, pronunciation and romanisation are three things and
are labelled as such. Audio is the existing GoListen path with `ko-KR` voices.

## Lexicon (`korean/index-store.ts`, built by `scripts/ko-build-lexicon.mts`)

```ts
export interface KoLexEntry {
  /** Headword as the dictionary writes it: 먹다, 학생. */
  lemma: string;
  /** The source's own homonym number (the entry's etymology number on its page); set only when the headword has two or more entries of this class. */
  hom?: number;
  /** A derived passive or causative verb, as the source relates it: its voice and its base verb's headword. */
  voice?: 'Pass' | 'Caus';
  base?: string;
  /** Sejong-style class: NNG NNP NNB NP NR VV VA VX VCP VCN MM MAG MAJ IC, or XPN XSN XSV XSA for affixes. */
  tag: string;
  /** Irregular class of a predicate, from the source's own conjugation table (see Features); 'R' = regular, verified by the table. Absent = the source gives no table. */
  irr?: 'R' | 'D' | 'B' | 'S' | 'H' | 'Reu' | 'Reo' | 'U' | 'Ha';
  /** First gloss of the first sense, at most 80 characters. */
  gloss?: string;
  /** Hanja of a Sino-Korean word, when the source states it. */
  hanja?: string;
  /** The source's own pronunciation respelling, when it differs from the rule's. */
  pron?: string;
  /** Occurrences in the frequency source; 0 when unseen. */
  n?: number;
}
export interface KoLexicon { id: string; shard?: string; built: string; source: { id: string; label: string; licence: string; version: string }; entries: Record<string /* stem key */, KoLexEntry[]>; stats?: Record<string, number> }
export function installKoreanLexicon(x: KoLexicon): void;
export function uninstallKoreanLexicon(id: string, shard?: string): void;
/** Entries filed under this stem key: a predicate under its stem (먹, 예쁘, 하), anything else under its headword. */
export function lookupKoreanStem(stemKey: string): readonly KoLexEntry[];
```

Stem key of a predicate = the headword without its final 다. An entry with a Hanja spelling is filed under that spelling too.
The shard prefix of a key is `koLexiconShardLetters(key)` (index-store.ts): the jamo of a first Hangul syllable (lead, vowel,
final), or `H` + the high bits of a first Hanja's code point. The build and the loader use this one function.
The compiled core and the shards hold the SAME row for a word they both hold (same `hom`, `irr`, `voice`), a whole homonym
set or none of it is in the core, and `lookupKoreanStem` returns a row held twice once (a test compares every core row with its
shard row, and a card before and after its shard loads).

## Analysis (`korean/analyze.ts`)

`koAnalyzeToken(surfaceKey) → AnalysisCandidate[]`, best first, synchronous, over the installed lexicon.

1. `candidateStems(key)` (exported: the shard loader's `expand` uses it): every syllable prefix of the key, and for
   each prefix the stems its LAST syllable may hide: the final consonant removed (갔 → 가, 한 → 하, 삽 → 사 and 살);
   the contractions undone (봐 → 보, 줘 → 주, 돼 → 되, 해 → 하, 셔 → 시, 져 → 지, 켜 → 키, 워 → 우 …); the irregular
   alternations undone (들 → 듣, prefix + ㅂ for 워/와/우 (추워 → 춥), prefix + ㅅ before a vowel (지어 → 짓), 몰라 →
   모르, 불러 → 부르, 하얘 → 하얗, 써 → 쓰, 커 → 크, 이르러 → 이르). Bounded: at most 40 stems for one 어절.
2. For each stem found in the lexicon: the stem's three junction bases, built from its class (`korean/conjugate.ts`):
   the bare stem (before -고, -지, -다, -는), the 으-base (before -(으)면, -(으)시-, -(으)ㄴ, -(으)ㄹ, -ㅂ니다) and
   the 아/어-base (before -아/어, -았/었-). The rest of the 어절 must parse as a chain of `ENDINGS` (`korean/endings.ts`:
   pre-final then final, each with the base it attaches to and its own allomorphs).
3. A nominal: EVERY lexicon headword that is a prefix of the 어절 is tried, not only the longest (나도 is 나 + 도 "I too" as well
   as whatever longer headword the lexicon holds; 이사는 is 이사 + 는 and 이 + 사는 …): each licensed split is a reading and the
   order comes from the scores below. After the headword: optional 들, then a chain of `PARTICLES`
   (`korean/particles.ts`, with the stacking order the grammar allows), or the copula 이다 with its endings
   (학생입니다, 학생이에요, 의사예요), or a derivational suffix the lexicon lists.
4. A noun the lexicon lists followed by 하다 / 되다 forms is read as the dictionary's own `…하다` headword when the
   lexicon has it (공부하다), else as the noun plus the light verb, both parts named.
5. Fused pronoun forms are a closed hand table (`korean/particles.ts` `FUSED`): 내가 (나 + 가), 네가, 제가, 누가, 난, 넌, 전, 날, 널,
   이건 (이것 + 은), 그건, 저건, 이게, 그게, 저게, 뭘, 뭐가, 여긴, 거긴 … each read as its pronoun plus its particle.
6. No lexicon stem: the chain is still explained and the rest is offered as an unconfirmed word (see Confidence).

**Order of readings.** Score = the lexicon count of the stem (log-scaled) + a bonus for a longer stem + a bonus when every
allomorph agrees with its host (은 after a final consonant, 는 after a vowel) − a cost per morpheme. Ties keep the source's order.
The first reading's confidence is strictly above the second's.

**The ending inventory** (`korean/endings.ts`) is a closed table and must hold at least: pre-final -(으)시-, -았/었/였-, -았었-,
-겠-, -더-, humble -(으)옵-/-사옵-; final endings of the six speech levels in declarative, interrogative, imperative, propositive
and exclamatory (-다, -ㄴ다/-는다, -냐, -니, -자, -아라/-어라, -아/-어, -지, -네, -군(요), -구나, -거든(요), -잖아(요),
-(으)ㄹ게(요), -(으)ㄹ까(요), -(으)ㄹ래(요), -아요/-어요, -(으)세요, -(으)십시오, -ㅂ니다/-습니다, -ㅂ니까/-습니까, -(으)ㅂ시다,
-게, -네, -(으)오, -소, -구려); connectives (-고, -(으)며, -(으)면서, -지만, -(으)나, -아서/-어서, -(으)니, -(으)니까, -(으)면,
-(으)려고, -(으)러, -아도/-어도, -아야/-어야, -는데/-(으)ㄴ데, -다가, -자마자, -도록, -게, -듯이, -거나, -든지, -(으)므로, -느라고,
-(으)ㄹ수록, -더니, -더라도); adnominal -는, -(으)ㄴ, -(으)ㄹ, -던, -았던/-었던; nominalising -기, -(으)ㅁ; indirect quotation
(-다고, -ㄴ다고/-는다고, -(이)라고, -냐고, -자고, -(으)라고, and the contracted -대(요), -ㄴ대(요)/-는대(요), -래(요), -냬(요), -재(요));
literary and Bible endings (-느니라, -(으)니라, -노라, -도다, -(으)리라, -(으)리니, -(으)소서, -나이다, -(으)ㅂ나이다, -더라, -(이)로다,
-거늘, -(으)매, -(으)되, -(으)ㄹ지라, -(으)ㄹ지어다, -(으)ㄹ진대, -건대, -(으)사), each marked `SpeechLevel=Lit` and named, never given a
modern conversational reading.

`koAnalyze(tokens)` runs the token analysis and then `sentence.ts`, which only REORDERS readings and names its reason:
auxiliary after a connective form (-고 있다, -아/어 보다: 보다 stays "to see" unless it follows an -아/어 form),
듣다 / 들다 and the other irregular–regular look-alikes by their objects, the copula after a noun, a particle token
after a Latin or digit token.

## The last round (2026-11-25): rules added before the freeze

The owner allowed one last round on the first-month words of the common-word sweep that had a confident wrong first
reading, and on the auditor's clause-first blocker. Its rules: fix rules, not words; where a sentence cannot decide, an
UNDECIDED result (both sides creditable, or a homonym set's undecided reading) is acceptable and a confident wrong
reading is not. The analyser is frozen after it (`eb3830f2`). What each word came to is in `docs/korean/SWEEP.md`.

**Token level (`analyze.ts`).**

- *Counter + particle with no numeral.* A counter + particle(s) on a token alone has no numeral before it. A common
  noun of the same spelling and particles, counted above the faint level (more than 2), reads first; the counter stays
  a live, creditable rival, so the sentence layer's numeral + counter frame can still raise it (개가 is the dog; 두 개도
  the counter). 번 and 년 are untouched: counter and noun are one word there.
- *Surname + particle.* A one-syllable surname + particle(s), with no given name or title, is the weaker reading beside
  a common noun of the same spelling counted above the faint level: the noun reads first (김에). The surname stays live
  only when its count is at least the noun's; a rarer surname is no rival (길을 keeps 0.92).
- Checked and left: a whole listed word of two syllables or more reads first and the shorter noun + core particle of
  the same letters is always kept second and creditable (주가, 주도, 자의, 역사가); verb + connective + particle against
  a counted noun + particle is ordered by the counts with both creditable (가게도, 가지만, 사고도); a Sino-Korean numeral
  + case particle and a counted noun of that spelling are both creditable (백을, 천으로); a predicate's adnominal
  against noun + core particle: the commoner side first, the other creditable (남을, 입을, 주는).

**Sentence level (`sentence.ts`).**

- *Position alone decides nothing.* Where a noun + 은/는/을/를 and a predicate's adnominal of the same spelling stand
  first in their clause before a nominal, the token layer's order (the counts) stands and the other reading stays
  creditable: 우는 아이를, 노는 아이들이, 먹을 물을, 먹을 곳에 가요, 입을 옷으로, 실을 바늘에 꿰었어요 are all this
  shape. (The earlier rule "first in its clause with a nominal after it: the noun" read 우 "right side" and 먹
  "inkstick" there, and is removed.) One shape still decides: an object needs a predicate that takes one. A noun + 을/를
  directly before a noun is the adnominal of the VERB of the same spelling when another object follows at once
  (신을 신발을 샀어요) or when the clause's first final predicate after it is an adjective or 있다 / 없다
  (물을 사람이 없다, 입을 옷이 없어요). The lexicon holds no valency, so no rule can tell 실을 바늘에 꿰었어요 from
  먹을 곳에 가요: both are undecided.
- *Place nouns.* A bare noun directly before a noun of place (위, 아래, 앞, 옆, 안, 밖, 끝, 속, 밑, 근처, 쪽, 가운데,
  너머), with nothing before it that a verb could govern, is that place's owner, not an adnominal (산 위에, 줄 끝에).
  After an argument the adnominal stands (학교에 간 뒤에); the time nouns after an adnominal (뒤, 후, 다음, 전, 사이) are
  not in the list.
- *Three nominal shapes.* X도 Y도, two different words side by side, each with a noun + 도 reading, is a pair of
  nominals (해도 달도); the same word twice is the verb repeated (가도 가도). X도 directly before a final 있다 / 없다 is
  a nominal: no connective form takes 도 before the existence verb (가게도 있어요). After a determiner that is not a
  number a whole adverb loses to a noun + particle of the same letters (이 실은).
- *Kept-open readings.* When the sentence has chosen the adnominal and no cue chooses the verb, the other verb's
  adnominal is set aside at 0.45 only by the pack's rare-rival test: the chosen verb is at least four times commoner by
  the lexicon's counts AND the other is counted under 30. That closes 갈다 (14) beside 가다 and 줄다 (20) beside 주다.
  Otherwise the other verb stays creditable, marked `notes.undecidedBy`: 사다 (52) beside 살다 (382) leaves 어제 산 옷
  undecided. A cue that chose a verb still sets the other aside: an object for 사다, a place name in 에 / 에서 for 살다,
  the look-alike cues of 갈다.
- *Counters.* A composed Sino-Korean numeral (이십, 삼백) opens the numeral + counter frame. Where the counter is a
  homonym set, Sino-Korean numerals and digits pick the entry that is a unit of time (분 minute, 주 week); native
  numerals pick the person entry (세 분); 몇 and 여러 leave the undecided reading.
- *아니면.* After a bare nominal or adverb, with no 이/가 complement and a word after it (지금 아니면 내일), the copula
  comes first and the conjunction stays creditable beside it; after N이/가 it is the copula alone. The treebank writes
  every 아니면 as the copula, which is why the conjunction is not first.
- *만에.* 만에 / 만이다 directly after a unit or noun of time is the bound noun 만 "after (an interval)", this
  product's own entry 91 (십 년 만에); 만 before a unit stays the numeral (만 원).
- *A numeral is not modified.* A Sino-Korean numeral carrying its own case particle, after a non-numeral determiner or
  an adnominal, loses to the noun of the same spelling and particle (새 백을, 부드러운 천으로); not when a counter or
  money unit follows (새 천 원짜리). Native numerals are left alone.

**What the round could not fix by a rule** (a main entry's other meaning needs a word cue): 선과 악 (goodness),
위가 아파요 (stomach), 창을 들고 (spear), 손을 꼭 잡았어요 (tightly), 아이가 많이 컸어요 (크다 as a verb).

## Constructions (`korean/constructions.ts`, `detectPatterns`)

Keys (each `syntax:ko:<key>`): `ko-progressive` -고 있다, `ko-resultative` -아/어 있다, `ko-want` -고 싶다,
`ko-must` -아/어야 하다/되다, `ko-can` -(으)ㄹ 수 있다, `ko-cannot` -(으)ㄹ 수 없다, `ko-neg-long` -지 않다,
`ko-neg-unable` -지 못하다, `ko-try` -아/어 보다, `ko-completive` -아/어 버리다, `ko-benefactive` -아/어 주다,
`ko-become` -게 되다, `ko-decide` -기로 하다, `ko-experience` -(으)ㄴ 적이 있다/없다, `ko-seem` -(으)ㄹ 것 같다,
`ko-because` -기 때문에, `ko-if` -(으)면, `ko-but` -지만, `ko-background` -는데/-(으)ㄴ데, `ko-intend` -(으)려고,
`ko-neg-short` 안 + predicate, `ko-neg-copula` 이/가 아니다, `ko-exist` 이/가 있다/없다, `ko-passive-jida` -아/어지다,
`ko-passive-light` 되다 / 받다 / 당하다 on a 하다-noun, `ko-causative-ge` -게 하다 / -게 만들다, `ko-causative-light` 시키다,
`ko-quote` an indirect quotation ending before 하다 / 말하다 / 생각하다, `ko-since` -(으)ㄴ 지, `ko-while` -는 동안, `ko-after` -(으)ㄴ 후에 / 다음에,
`ko-before` -기 전에, `ko-in-order` -기 위해(서), `ko-prohibit` -지 말다 (-지 마세요, -지 마, -지 말고), `ko-neg-short-unable` 못 + predicate. A construction is reported
only when its morphemes are found by the analysis in the required order; 보다 / 주다 / 있다 as ordinary verbs report none.

## Packages and file ownership

| Package | Owns | Depends on |
|---|---|---|
| **H** Hangul | `src/adapters/korean/{hangul,text,pronunciation,translit}.ts`, `test/adapters/korean/{hangul,text,pronunciation}.test.ts` | nothing |
| **L** Lexicon | `scripts/ko-build-lexicon.mts`, `src/adapters/korean/{index-store,shards,version}.ts`, `src/adapters/korean/generated/**`, `docs/korean/INDEX.md`, the `dict:*` runs for `ko`, `src/dict/*` one-line additions, `test/adapters/korean/lexicon.test.ts` | H (`koKey`, `koShardLetters`) |
| **M** Morphology | `src/adapters/korean/{particles,endings,conjugate,analyze,describe,tags,paradigm}.ts`, `test/adapters/korean/{conjugate,particles,analyze}.test.ts` | H, L (interfaces above) |
| **S** Sentence | `src/adapters/korean/{sentence,constructions,phrases,syntax,production,speech}.ts`, `src/adapters/ko.ts`, `test/adapters/korean/{sentence,constructions}.test.ts`, `test/adapters/korean/regression.test.ts` (the brief's table) | H, L, M |
| **R** Registration | `packages/language-packs/src/{packs/ko.ts,tutorial/ko.ts,alphabet-sprint/**ko**}`, every shared list a language is added to (see AUDIT.md "Where a language is registered"), `packages/golearn-extension/src/analysers/ko.ts`, the page-language detection for Hangul, GoReview's alphabet letters, voices, `THIRD-PARTY-NOTICES.md`, the list-pinning tests | the adapter's public names |
| **E** Evaluation | `scripts/ko-eval.mts`, `docs/korean/EVAL.md`, `test/fixtures/korean/**` | everything |

A package never edits another package's file; it reports what it needs in its final message and the coordinator
decides. Tests are `// @vitest-environment node` unless they need a DOM. No Hangul string in a test is typed in a
decomposed form by accident: a test that needs NFD builds it with `.normalize('NFD')`.
