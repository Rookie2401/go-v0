# Hindi Stage 0 — the first controlled stories

Package H5 of PLAN 12. Files: `src/course/hindi.ts` (shelves, assistance, streams, catalogue), `data/corpus/hi/s0a-*.json`,
`s0b-*.json`, `s0c-*.json` (26 stories), `test/course/hindiCatalog.test.ts`, `test/content/hindi-stage0.test.ts`.

**Status of the text: a machine-drafted first version of the canonical controlled corpus.** An AI model wrote it. No native
speaker has read it. It is not native-quality, it is not reviewed, and it is not published: every document carries
`review.status: "unreviewed"`, `generated: true` and the tags `needs-native-review` and `machine-drafted`, and the
publication rule (`computePublished`) keeps all 26 out of normal learner use for the one stated reason, a missing
native-speaker review. They are visible in preview only until a named reviewer signs the exact wording (the review is bound
to the wording by a content signature, so any later edit needs a new review).

## What Stage 0 is for

Stage 0 is where the learner starts reading Hindi, with real Hindi in real, tiny stories, from the first line. There is no
alphabet lesson, no isolated drill sentence and no romanization anywhere in the documents. The script is learned the way
the rest of the course works: the word sheet decodes a word on the first tap (decoding comes first at Stage 0), and a
romanization is a recorded rescue offered only through Class 2. English is a rescue layer under every sentence, so the
English line must match the Hindi closely.

The constraint is on the language, not on human interest: the same people (a boy, his sister, their mother and father,
the grandparents, two friends, a teacher, a dog) meet small problems that have small resolutions, with gentle humour.
A new word is introduced in a story that uses it at least three times, and it comes back in a later story. The documents
are the canonical, fixed, versioned texts; the vocabulary lists a model wrote for them are not a substitute for a
corpus-based frequency list (see "What is not there yet").

Shelves are an orientation, never a gate. The owner's rough cumulative-exposure guide, which orients and promotes
nobody: Stage 0 ≈ the first 30k running words; Class 1 ≈ 30–75k; 2 ≈ 75–150k; 3 ≈ 150–300k; 4 ≈ 300–500k; 5 ≈ 500–750k;
6 ≈ 750k–1m; 7 ≈ 1–1.5m; 8 ≈ 1.5–2.5m; 9 ≈ 2.5–4m; 10 ≈ 4–6m; 11 ≈ 6–10m; 12 ≈ 10m+. The twelve Classes are reading-difficulty
shelves, not Indian school grades. No CEFR band is attached to any shelf (the documents' `difficulty` field, A0 / A1, is
the validator's label for a document and is not a shelf level).

## The three bands

| | Stories | Words per story | Band total (measured) | Sentence length | Distinct forms (cumulative, measured) |
|---|---|---|---|---|---|
| **0A** First words in real sentences | 12 | 60–150 | 1,359 | ≤ 6 words in stories 1–7, ≤ 8 by the end | 79 (budget about 120) |
| **0B** Postpositions, agreement, questions, habitual and progressive | 8 | 150–250 | 1,421 | ≤ 13 | 230 |
| **0C** Narrative past, clause linking | 6 | 250–400 | 1,607 | ≤ 17 | 422 |

Total running words in Stage 0: 4,387. Words are counted by splitting on whitespace and stripping punctuation (the test does
the same, and does not use the Hindi adapter's analysis).

**0A language.** `यह / वह` + noun + `है`; names; `है / हैं / नहीं है`; `में`, `पर` for place; `भी`; `और`; concrete nouns and a few
adjectives (`बड़ा / बड़ी`, `छोटा`, `सफ़ेद`, `अच्छा / अच्छी`, `मीठा`, `गरम`, `लाल`, `नया / नई`); the habitual (`खाता है`, `खाती है`,
`खाते हैं`) introduced in story 8 and used for `पीना`, `जाना`, `पढ़ना`, `खेलना` after it; questions with `क्या` (story 10), `कहाँ`
(story 11) and `कौन` (story 12). No postposition other than `में` and `पर`, no possessive, no ergative, no past tense,
no progressive and no command in 0A (the content test asserts this). Nouns that take `में` or `पर` are chosen so that none changes in the
oblique case (`घर`, `रसोई`, `बाज़ार`, `मेज़`, `कुर्सी`, `छत`, `बाग`, `मैदान`): the oblique forms (`कमरे में`) wait for 0B. The
adults who deserve respect (`पापा`, `दादी`, `दादा जी`, `शर्मा जी`) take the plural verb (`हैं`, `खाते हैं`, `देती हैं`); `माँ`
takes the singular.

**0B language.** `का / के / की`, `को`, `से`; `में / पर` with oblique forms (`कमरे में`, `लड़के को`, `बच्चों को`, `कुत्ते को`); plural
(`किताबें`, `कुर्सियाँ`, `सड़कें`, `गाड़ियाँ`); `मेरा / मेरी / मेरे`, `तुम्हारी`, `उसका`, `अपना` (as `अपने`, `अपनी`); `के पास`
for having (`मेरे पास एक कुत्ता है`), `के पास / के नीचे / के साथ / के लिए`; question words (`किसकी`, `कब`, `क्यों`, `कैसे`, `कितने`); numbers one to
six; the habitual and the progressive (`रहा है / रही है / रहे हैं`); `था / थी / थे / थीं`; commands (`आओ`, `बैठो`, `देखो`, `लाओ`;
`आइए`, `बैठिए`, `लीजिए`); first and second person (`मैं … हूँ`, `तुम … हो`, `आप … हैं`). Quotation appears here, with double quotation marks.

**0C language.** The narrative past: `गया / गई / गए`, `आया`, `कहा`, `देखा`, `दिया`, `लिया`, `लगा / लगी` (`डर लगा`, `भूख लगी`), `ने` with the
perfective (the verb agrees with an unmarked object: `रोटी खाई`, `आम खाए`, `किताबें पढ़ीं`; it stays masculine singular when the object has
`को`: `मोती को देखा`); compound verbs (`आ गया`, `कर दिया`, `ले लिया`, `बैठ गया`, `खा लिया`, `डाल दिया`, `भाग गया`, `उड़ गया`); linking words
`लेकिन`, `फिर`, `क्योंकि`, `इसलिए`, `जब … तब`, `अगर … तो`, `कि`; reported speech with `कि`; the past progressive once or twice (`सो रहा था`).

## The stories

Titles are Hindi; the English title is for this table only. "New forms" counts word forms that did not occur in any earlier story of Stage 0.

| Id | Title | English title | Running words | New forms |
|---|---|---|---|---|
| s0a-01 | रवि और मीरा | Ravi and Mira | 66 | 10 |
| s0a-02 | माँ और पापा | Mom and Dad | 79 | 5 |
| s0a-03 | दादी और दादा जी | Grandma and Grandpa | 112 | 6 |
| s0a-04 | मोती | Moti | 79 | 7 |
| s0a-05 | दोस्त | Friends | 94 | 6 |
| s0a-06 | शर्मा जी | Mr Sharma | 107 | 7 |
| s0a-07 | मेज़ पर खाना | Food on the table | 115 | 8 |
| s0a-08 | रवि रोटी खाता है | Ravi eats | 143 | 7 |
| s0a-09 | स्कूल जाते हैं | Going to school | 147 | 7 |
| s0a-10 | मैदान में | On the field | 144 | 10 |
| s0a-11 | गेंद कहाँ है? | Where is the ball? | 139 | 2 |
| s0a-12 | यह कौन है? | Who is this? | 134 | 4 |
| s0b-01 | मेरा नाम रवि है | My name is Ravi | 197 | 30 |
| s0b-02 | यह किसकी किताब है? | Whose book is this? | 174 | 16 |
| s0b-03 | स्कूल का दिन | A day at school | 191 | 24 |
| s0b-04 | दादी का गाँव | Grandma's village | 166 | 16 |
| s0b-05 | आइए, बैठिए | Please come in, please sit | 159 | 17 |
| s0b-06 | फ़ोन पर | On the phone | 163 | 20 |
| s0b-07 | मोती का दिन | Moti's day | 184 | 15 |
| s0b-08 | शहर में | In the city | 187 | 13 |
| s0c-01 | देर हो गई | Ravi is late | 307 | 64 |
| s0c-02 | दादी की कहानी | Grandma's story | 256 | 40 |
| s0c-03 | गाँव का सफ़र | The trip to the village | 259 | 34 |
| s0c-04 | मोती कहाँ गया? | Where did Moti go? | 259 | 18 |
| s0c-05 | आम के पेड़ के नीचे | Under the mango tree | 267 | 21 |
| s0c-06 | शर्मा जी का सवाल | Mr Sharma's question | 259 | 15 |

Works in the catalogue: `pehli-kahaniyan-0a` (पहली कहानियाँ 0A — घर में), `pehli-kahaniyan-0b` (… दिन भर), `pehli-kahaniyan-0c`
(… कल की बातें). Each is `course-authored`, bundled, readiness `implemented` (preview only), and says in its rights record
that the text is machine-drafted and not reviewed.

## The order in which words and constructions arrive

**0A, by story** (new forms in the order they appear; every one occurs at least three times in the story that introduces it, and
returns in a later story: forms from stories 1–9 return within 0A; the ten forms from stories 10–12 that return only in 0B are
`बाग पेड़ फूल खेलता खेलते छत तस्वीर कौन लड़का लड़की`).

1. यह रवि मीरा है और हैं घर में भी बड़ा
2. माँ पापा रसोई बड़ी वह
3. दादी दादा जी नहीं बाज़ार लोग
4. मोती कुत्ता छोटा सफ़ेद कुर्सी पर मेज़
5. अमित नेहा दोस्त स्कूल अच्छा अच्छी
6. शर्मा अध्यापक किताब बैग नई नया लाल
7. खाना रोटी आम मीठा चाय दूध पानी गरम
8. खाता खाती खाते पीता पीती पीते सब — the first verbs: the habitual
9. रोज़ जाता जाती जाते पढ़ता पढ़ती पढ़ते
10. मैदान बाग पेड़ फूल खेलता खेलती खेलते गेंद क्या हाँ — the first questions
11. कहाँ छत
12. तस्वीर कौन लड़का लड़की

**0B, by story.** 1 the possessives `मेरा / मेरी / मेरे`, first person, `उसका`, `अपने`, `के पास`, numbers, the oblique `कमरे में`.
2 `का / की` for ownership and ownership questions (`किसकी`), the plural (`किताबें`, `कुर्सियाँ`), `के पास` with a possessor, `को` and `से` (the first
quotations), `तुम्हारी`. 3 `से` (by bus, with a person), `को` with the recipient (`बच्चों को`, `लड़के को`), the plural oblique, polite greeting,
the first progressive (`सुन रहे हैं`). 4 `का` with village things, `था / थी / थे / थीं`, the oblique with `के पास`. 5 commands (`आओ`, `बैठो`,
`देखो`) and polite commands (`आइए`, `बैठिए`, `लीजिए`), `कौन` as a question. 6 `तुम / आप / हम`, the progressive in all persons
(`खा रहा हूँ`, `कर रही है`, `पी रही हैं`), `कैसे / कैसी`, `कब`. 7 habitual routine, `कभी`, `के नीचे`, `क्यों`, `कितने`, `था` and the past progressive once. 8 the
city: `के लिए`, `ले जाते हैं`, `काम करते हैं`, `कितना`.

**0C, by story.** 1 `ने` with `कहा`, `पूछा`, `देखा`, `दिया`, `लिया`; the intransitive `गया / गई / गए`, `आया`, `उठा`; `क्योंकि`, `इसलिए`, `लेकिन`, `जब … तब`, `अगर … तो`; `लगा` (`भूख लगी`);
compound verbs `घबरा गया`, `भाग गया`, `आ गया`, `दे दी`, `बैठ गया`. 2 an inset folk tale: `ढूँढा`, `डाल दिया`, `पी लिया`, `उड़ गया`, `पहुँचा`; the story told
by a grandmother and listened to by the children. 3 a journey: `मिली`, `बैठी`, `ले लिया`, `उतरे`, `चले`, `डर लगा`. 4 `शायद`, `ज़रूर`, searching, `क्या हुआ?`,
reported answers. 5 `सो रहा था`, `हिलाने लगा`, `हँसने लगे`, `पकड़ ली`, `कर दिया`. 6 reported speech with `कि`, the retelling of earlier stories (a recap of the
crow's tale and of the village), and the closing joke.

## The cast

रवि (a boy, the older sibling), मीरा (his younger sister), their माँ and पापा, दादी and दादा जी (grandparents), the friends अमित and नेहा,
राजू and सीता (brother and sister in the village, friends of रवि and मीरा), the teacher शर्मा जी, and the dog मोती (white and small). Places:
the house with its kitchen, the school, the market, the village (a courtyard with a mango tree, a river, fields, a cow), and the city (an office, shops,
a bus). Names and the few address terms are the only proper words; the stories use no romanization.

Choices made in the drafts, for the native reviewer to confirm or overturn: `माँ` is treated as singular (`माँ घर में है`), while `पापा`, `दादी`, `दादा जी`
and `शर्मा जी` take the respectful plural verb (`पापा घर में हैं`); `दादा जी`, `शर्मा जी` are written as two words; `पापा` is used instead of `पिता जी`;
`छह` for six; `गरम` (not `गर्म`); `हैलो`; `अध्यापक` for the teacher; `बाज़ार`, `सफ़ेद`, `ज़रूर`, `फ़ोन`, `दफ़्तर`, `आवाज़`, `ज़ोर`, `तरफ़`, `रोज़`, `मेज़`, `दरवाज़ा` with the nukta;
`माँ`, `हूँ`, `यहाँ`, `कहाँ`, `हाँ`, `आँगन`, `पाँच`, `ढूँढा`, `पूँछ` with the chandrabindu, and `हैं`, `में`, `मैं`, `नहीं` with the anusvara; `गई / गए / आई / आए` (not `गयी / गये`);
the danda `।` closes a statement with no space before it; `?` and `!` close questions and exclamations; quotation marks are the plain double quotation mark.

## What is not there yet

- **No pictures.** The stories are text only; a picture for each story is the obvious next layer.
- **No frequency-informed vocabulary.** The word lists are a model's judgement of what a first-year reader needs. They are not drawn from a corpus. Until a corpus-based
  frequency list exists, nothing here says that these are the commonest words of Hindi, and the 4,387 words of Stage 0 are not claimed to be the first 30k words of the
  owner's guide (they are about 15% of it).
- **No audio.** GoListen is deferred; the listening stream is data only.
- **No native review.** See below. The English lines were written with the Hindi by the same drafter and have not been checked by anyone else.
- **No dialogue-only texts and no non-narrative texts** (letters, lists, signs, songs). A Hindi version of the Spanish conversation path is a later package.
- **The adapter's analysis is partial and still moving.** Analysis coverage with the Hindi adapter at the time of writing (a run of the content test while the
  other Hindi packages were still landing) is 99.8% of the running words (4,379 of 4,387); the four unanalysed forms were `घड़ा`, `ढूँढा`, `ढूँढी`, `भौंका`. These numbers change as
  the lexicon grows; the content test prints them and asserts nothing about them. The text is never bent to the analyser.

## What a native reviewer must check

The reviewer signs the wording of each story (`review.status` → `reviewed`, with `reviewedBy` and `reviewedAt`); the signature binds the review to the exact sentences.

1. **Naturalness.** Would a Hindi speaker say this, to a child, in this order? Controlled language is repetitive on purpose, but a sentence that no one would say is a defect:
   in particular the 0A pairs (`रवि अच्छा है`, `मीरा मेज़ पर नहीं है`, `यह कुत्ता सफ़ेद है`), the plain `X में Y है` location sentences, the absence of `एक` in 0A, and the
   quotation-heavy dialogue of 0B and 0C.
2. **Gender and number.** The gender of every noun used (`घर`, `रसोई`, `कुर्सी`, `मेज़`, `बैग`, `तस्वीर`, `छत`, `गेंद`, `किताब`, `रोटी`, `चाय`, `दूध`, `पानी`, `आम`,
   `कंकड़`, `घड़ा`, `तालाब`, `खिड़की`, `भीड़`, `पूँछ`, `छाया`), and the agreement it forces on adjectives, verbs and `का / के / की`.
3. **Honorific plural.** Whether `पापा हैं`, `दादी रहती हैं`, `शर्मा जी कहते हैं` is the right level for these characters, and whether `माँ` should also take the plural.
4. **Agreement under `ने`.** Every perfective with `ने`: that the verb agrees with the right object (`रोटी ली`, `आम खाए`, `किताबें पढ़ीं`, `नदी देखी`, `पूँछ हिलाई`, `आँखें खोलीं`,
   `गेंद पकड़ ली`, `दरवाज़ा बंद कर दिया`) or stays masculine singular when the object has `को`; the reported-speech lines with `कि` and the pronoun `उसने / उन्होंने`.
5. **Spelling.** The nukta, chandrabindu and anusvara in every word (see the list above), `छह`, `गरम`, `हैलो`, `ढूँढा`, `पूँछ`, the words with ड़ and ढ़ (`कंकड़`, `पेड़`, `भीड़`, `सड़क`, `कपड़े`, `घड़ी`,
   `खड़ा`, `पढ़ना`, `बड़ा`), `गायें`, and one spelling per word throughout.
6. **The English lines.** Plain and faithful. Check the ones that are not word-for-word: `घड़ी में आठ बजे थे` ("The clock said eight"), `वह चली गई` ("It was gone"), `थोड़ी देर और`,
   `डर की कोई बात नहीं है`, `क्या हुआ?`, `तुम फिर आ गए?`, `ठीक है, मोती, तुम भी बैठ जाओ`, `कुत्ते को दूध अच्छा लगता है`, `तुम्हारी पढ़ाई अच्छी होती है`, `हम सब एक घर में रहते हैं`.
7. **Anything no Hindi speaker would say to a child.** In particular: `मोती कुत्ता है` for a dog (`कौन` for an animal in `यह कौन है? यह मोती है`), `बाज़ार में लोग हैं`,
   `छत पर कुछ फूल हैं`, `बस से बाहर देखता है` (a bus's window would be named in Hindi), `पापा रवि के लिए एक किताब लेते हैं` (`ख़रीदते`?), `गाँव में सब अच्छा था` (`सब कुछ`?), `रवि अच्छा है` for a boy.
8. **Culture and fact.** The village (a courtyard, a cow, a river, a mango tree), the bus journey, the school routine, the teacher's address, and the retold crow-and-pebbles tale (a traditional folk tale told in
   the drafter's own words) should read as ordinary and respectful to an Indian reader.
