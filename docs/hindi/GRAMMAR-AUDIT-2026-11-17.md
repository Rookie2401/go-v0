# Hindi grammar audit, 2026-11-17

Auditor: the Hindi grammar-audit session (an AI model, not a native speaker). Code audited: the shared clone at master
`985c742b` (`adapter-hi@6`), read-only. Brief from the owner: audit the linguistic content, be brutal, note every missed
feature and detail, and weigh every finding against what the GoLearn card actually shows. Method and shape follow the
Norwegian and German audits.

## 1. Verdict

Hindi sits between German and Norwegian. The word list is good; the reading of ordinary sentences is not yet safe to put
in front of a learner, because the faults fall on the commonest words and the card looks sure when it is wrong.

- **The word list is sound.** I read all 2,974 rows (1,572 nouns, 483 verbs and auxiliaries, 414 adjectives, 134 names,
  371 closed-class words). The verb classes are right, the numbers 0 to 99 are all there and correctly spelled, and I
  found three wrong genders and four wrong "changes / does not change" marks (section 5). On the course's own ladder
  texts the card has a confirmed reading for 99.4 % of 53,418 words; on 642 words of my own everyday Hindi it is 95.5 %,
  with 3.9 % blank.
- **One ranking rule breaks the commonest words.** When a spelling belongs to two entries, a perfective participle is
  put first. So *जाना* "to go" is shown as **जानना, perfective participle, "knowing"** in every sentence I tried
  (*मुझे जाना है*, *राम जाना चाहता है*, 5 of 5), *कहीं* "somewhere" is **कहना, "saying"**, *जी हाँ* is **जीना, "living"**,
  *छोटी-सी* is **सीना, "sewing"**, *दो बजे* is **बजना, "ringing"**.
- **A whole regular noun class is not read.** The plural and oblique plural of every noun in -ई (*भाइयों, भाइयो,
  मिठाइयाँ, लड़ाइयों, दवाइयाँ, ईसाइयों, बुराइयों*, 13 of 13 probes) get an invented lemma (*भाइ, मिठाइ*) or an invented verb
  (*भाइयना*). The list holds 52 such nouns.
- **The meaning line of the past tense is wrong.** Every perfective participle is glossed with the English -ing form:
  *उसने किताब पढ़ी* shows "reading", *वह गया* "going", *उसने किया* "doing". The perfective is the Hindi simple past.
- **The romanisation is wrong for a class of everyday verbs and is two schemes at once.** After a nasalised syllable the
  rule keeps an "a" that is not said (*हँसना* "haṁsanā", *माँगना* "māṁganā", *पहुँचना* "pahuṁcanā": 40 verbs and 13 other
  words of the list, and every form of those verbs). 120 lemmas of the list (4.1 %) get no romanisation at all, among them
  *पत्र, मित्र, सत्य, राज्य, सूर्य, मनुष्य*. The pack's own bundled dictionary has the right reading for almost all of them.
- **The guesser invents verbs** for unknown words: *श्रीमती* is "श्रीमना", *मेट्रो* "मेट्रना", *हमीं* "हमना", *बीसवीं*
  "बीसवना", *मेहरबानी* "मेहरबाना". They are marked unconfirmed, but they are on the card.
- **Unlike Norwegian and German, Hindi has a second source for "All forms"**: `public/dict/hi/full/` holds full
  Wiktionary records and the card merges their tables with the rules. 22,435 of 31,703 cells agree. The merge itself
  puts some wrong forms first (*होएगा* before *होगा*, *करकर* as the "verified" conjunctive of करना; section 5).

What is good, and should be said: spelling variants (हिंदी / हिन्दी, गए / गये, लिए / लिये, चाहिए / चाहिये, a missing nukta,
ं for ँ) are joined to one word almost everywhere; the ergative, the passive with जाना, compound verbs, conjunct verbs,
चाहिए, सकना, पाना, लगना, the conjunctive participle and the correlatives are recognised and named; the three levels of
"you" are told apart in the form line; fused pronouns (मुझे, उन्होंने, किसने, जिसको) are right.

## 2. How this was audited, and the numbers

1. Read the rule files of `src/adapters/hindi/`: `hi.ts`, `entries.ts`, `morphology.ts`, `morph-orth.ts`,
   `morph-noun.ts`, `morph-verb.ts`, `morph-verb-read.ts`, `morph-causative.ts`, `morph-pronoun.ts`, `morph-wala.ts`,
   `morph-describe.ts`, `translit.ts`, `pronunciation.ts`, `orth-tables.ts`, `orth-exceptions.ts`, the head of
   `paradigm.ts`; the pack, the orientation, and the card parser. I did **not** read `syntax.ts`, `disambiguate.ts`,
   `constructions*.ts`, `phrases.ts`, `production.ts`, `noun-first.ts`, `ladder-context.ts` or `table-tags.ts` line by
   line; they were tested through the probes.
2. Dumped every row of the word list with the forms the rules make from it (`dump.mts`) and read all of it; then built
   the "All forms" table of every noun, verb and adjective **as the card builds it**, merged with the bundled dictionary
   (`merged.mts`, which calls the extension's own `buildParadigm`), and read every cell on which the two sources disagree.
3. Ran **652 word-in-sentence probes** through the card's own `parseSelection` (`b1` to `b4`, `b6`, `b7`) and **247
   romanisation probes** (`b5`, `pron` mode).
4. Ran **642 words of running text** I wrote myself (a narrative, a news paragraph, a conversation, article 1 of the
   human-rights declaration, the Lord's Prayer, John 3:16) word by word, with the adapter's own tokeniser in place of the
   Latin word pattern of the original `cover.mts`; then the course's own ladder texts (53,418 words) the same way.
5. Checked 499 everyday words against the word list (`core.mts`).
6. Read the orientation, all nine Stage 0 sound lessons, all 123 Stage 0 scene lines and about 1,400 words of the
   ladder (parts of five units).

Evidence (inputs, outputs, scripts): `C:\Users\CJWal\dev\tmp-mem\hiaudit\`. The scripts use absolute paths.

| Measure | Hindi |
|---|---|
| Running text (mine, 642 words): blank card | 25 (3.9 %) |
| Running text: marked guess (unconfirmed) | 4 (0.6 %), 2 of them with the wrong part of speech |
| Running text: confirmed reading | 613 (95.5 %) |
| Running text: wrong reading shown as confirmed (hand count) | about 44 (6.9 %): 26 wrong word or part of speech, 18 wrong person, case or mood |
| Running text: reading right but the meaning line wrong (hand count) | about 20 |
| Course ladder (53,418 words): blank / guess / confirmed (machine count only) | 273 (0.5 %) / 32 (0.1 %) / 99.4 % |
| Targeted probes (652): blank card | 55 |
| Targeted probes: marked guess | 33, of which 30 have a wrong lemma or part of speech |
| Romanisation probes (247): wrong / none shown | 30 / 12 |
| Everyday words (499) with no reading | 49 (10 %); 2 more are guesses |
| "All forms" cells, 2,467 lemmas: agree with the dictionary / rules only / dictionary only / in conflict | 22,435 / 5,192 / 3,940 / 136 (in 66 lemmas) |
| Word-list lemmas with no romanisation | 120 of 2,945 (4.1 %) |

The targeted probes were chosen to find faults, so their rates are not coverage figures; the running-text rows are. The
hand counts are my own reading of the output and could be off by a few.

## 3. What the card shows, and what is wrong with each part

| Part of the card | State | Section |
|---|---|---|
| Lemma, part of speech | Right for about 91 % of running words (95.5 % confirmed, less the 4 % that are confirmed and wrong); wrong for the infinitive of जाना and for कहीं, जी, बजे, बहुत, ज़्यादा, बस; a regular noun class unread | 4.1 to 4.4 |
| Form line | Good for nouns, pronouns, participles; wrong person with हम, wrong case for time phrases, the तू command called "bare stem", अपना called "third person" | 4.7 |
| Own meaning | Every perfective participle glossed "-ing"; helping verbs glossed as full verbs ("staying", "falling", "seeming") | 4.6 |
| Romanisation | ISO 15919 letters; wrong after a nasal syllable, wrong before an independent vowel, typed-without-nukta words romanised as typed, 4 % blank, no note on ज्ञ, ऋ, यह, वह | 4.13 |
| Alternatives | Present; the right reading is usually among them when the first is wrong | 4.1 |
| Grammar notes | Good range; missing the -ते ही, -ते हुए, -ता रहना, presumptive, जाया करना, न … न | 4.11 |
| Fixed phrases | Good; a phrase is found even where the word itself is blank or misread | 4.11 |
| Role in the sentence | Usually right for subject, object and postposition; a list of wrong labels | 4.10 |
| Dictionary meaning | Usually right; first sense wrong in places | 4.12 |
| "All forms" | Merged with the dictionary's table; non-spellings in about 350 tables; some wrong forms put first by the merge | 5 |
| Unknown word | Blank for names and news vocabulary; invented verbs for others | 4.4, 4.5 |

## 4. Findings on the card

Each line was seen in the probe output unless it is marked "from the code". "Check" marks a form I am not sure of.

### 4.1 A perfective participle is put before every other word written the same way

From the code (`hi.ts`, `handCandidates`): when a spelling belongs to two entries, the first gets 0.55 and a perfective
participle 0.6. The neighbour rules correct some cases (की after a noun, लिए after के) and leave these:

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| मुझे जाना है। / मुझे घर जाना है। | जाना | **जानना**, verb, masculine singular perfective participle, "knowing", 0.6 (the note "obligation" is shown beside it) | जाना, infinitive, "to go" |
| तुम कहाँ जाना चाहते हो? / राम जाना चाहता है। | जाना | **जानना**, "knowing" | जाना, infinitive |
| मैं कहीं नहीं जा रहा। / यह किताब कहीं नहीं मिलती। | कहीं | **कहना**, feminine plural perfective participle, "saying" (once with the note "passive") | कहीं, adverb, "anywhere" |
| जी हाँ, मैं आऊँगा। / जी नहीं, … | जी | **जीना**, feminine singular perfective participle, "living" (the phrase "जी हाँ" is found beside it) | जी, "yes / sir" |
| एक छोटी-सी लड़की आई। | सी | **सीना**, perfective participle, "sewing" | सा, particle, feminine |
| दो बजे मिलते हैं। / छह बजे / आठ बजे / दस बजे | बजे | बजना, masculine plural perfective participle, **"ringing"**, 0.8 | बजे, "o'clock" (at two) |
| वह अस्सी साल जीता रहा। | जीता | **जीतना**, perfective participle, "winning" | जीना, imperfective participle |
| सरकार ने … देने की घोषणा की है। / घबराने की ज़रूरत नहीं / रहने की संभावना है / अन्तरात्मा की देन | की (first) | **करना**, feminine singular perfective participle, "doing" (4 times in my running text: after an infinitive in -ने and after an unlisted noun; की after a listed noun was right every time) | का, genitive |
| क्या आपको सुनाई दे रहा है? | सुनाई | सुनाना, perfective participle, causative | सुनाई, noun (सुनाई देना); *दिखाई नहीं देता* is read correctly |

### 4.2 Other wrong readings shown as confirmed

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| यह कर। | कर | कर, noun, "tax; (literary) hand" | करना, command to तू |
| चिट्ठी लिख कर भेज दो। | कर | कर, noun, "tax" (with the note "conjunctive participle") | the conjunctive कर |
| मुझे जाने दो। / मुझे पैसे दे दो। | दो | दो, numeral, "two" (with the notes "permissive" / "compound verb") | देना, command to तुम |
| वह हंस रहा है। | हंस | हंस, noun, "swan", 0.92, "subject of रहा" | हँसना (the common spelling with ं), "is laughing" |
| जल ही जीवन है। | जल | जलना, "to burn (by itself)", 0.92 | जल, noun, "water" (not in the list) |
| उसका बहुत मान है। | मान | मानना, bare stem | मान, noun, "honour" (not in the list) |
| वह बहुत अच्छा गाती है। / बहुत अच्छा! | बहुत | बहुत, **noun**, masculine direct singular | adverb, "very" (the adverb is in the list) |
| ज़्यादा मत खाओ। / ज़्यादा दूर नहीं है। / मुझे कॉफ़ी ज़्यादा पसंद है। | ज़्यादा | **noun**, masculine direct singular (6 of 6, with and without the nukta) | adverb / adjective |
| बस, अब रहने दो। | बस | बसना, "to settle, to dwell" | बस, "enough" |
| कल … बस देर से आई। | बस | adverb, "enough; only, just" | बस, noun, "bus" |
| सोना बहुत महँगा है। | सोना | verb, "to sleep" | सोना, noun, "gold" |
| सोने से पहले दूध पियो। | सोने | सोना, noun, "gold", with the note "comparison with से" | सोना, verb, "before sleeping" |
| खाना तैयार है। | खाना | verb, "to eat" | खाना, noun, "food" |
| उसने सोने का हार पहना। | हार | हार, **feminine**, "defeat" | हार, masculine, "necklace" (the row exists) |
| चिड़िया के पर सुंदर हैं। | पर | postposition, "on, at" | पर, noun, "wings" |
| घर पर कोई नहीं है पर दरवाज़ा खुला है। | पर (second) | postposition | conjunction "but" (the rule needs a comma) |
| क्या आप हिंदी बोलते हैं? / क्या आप चाय पिएँगे? | क्या | pronoun, "what" (the note "yes/no question" is shown beside it) | the question particle |
| और थोड़ी देर टहलने जाती हूँ / और दस बजे तक | और | adverb, "more, else" | conjunction "and" (3 times in my running text, each time before a quantity word or an adjective; और between two clauses was otherwise right) |
| बाढ़ जैसे हालात | जैसे | conjunction, "as, like; for example" | जैसा, "like" (agreeing word) |
| सभी मनुष्यों को गौरव और अधिकारों के मामले में | गौरव | **name**, "Gaurav (a boy's name)" | गौरव, noun, "dignity" |
| और हमें परीक्षा में न ला, परन्तु बुराई से बचा | बचा | **बचना**, perfective participle, "being saved" | बचाना, command to तू, "save" |
| वह खाना खा के गया। | के | का, genitive | the conjunctive के |
| सब्ज़ीवाला आया है। | सब्ज़ीवाला | lemma सब्ज़ी, adjective, "vegetable; a cooked dish", "complement of आया" | vegetable seller, the subject |
| ट्रेन लेट है। | लेट | लेटना, "to lie down", 0.92 | लेट, "late" (English loan) |
| सब लोग इकट्ठे हुए। | इकट्ठे | **इकट्ठना**, verb, subjunctive (guess) | इकट्ठा, adjective (the row is marked "does not change"; it changes) |

### 4.3 The plural and oblique plural of nouns in -ई are not read

From the code (`morph-noun.ts`, `nounCandidates`): the step from *-इयों / -इयाँ* back to the lemma handles the sign ि and not
the letter इ, so the lemma *भाई* is never proposed.

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| भाइयों ने मिलकर काम किया। | भाइयों | lemma **भाइ**, guess; also भाइय, भाइया | भाई, oblique plural |
| भाइयो और बहनो, सुनिए। | भाइयो | **भाइयना**, verb, "you (तुम), subjunctive" | भाई, vocative plural |
| मुझे मिठाइयाँ पसंद हैं। | मिठाइयाँ | lemma **मिठाइ**, guess | मिठाई, plural |
| लड़ाइयाँ / लड़ाइयों, दवाइयाँ / दवाइयों, ईसाइयों, बुराइयों, कठिनाइयों, नाइयों, गहराइयों, सुइयाँ | | lemma लड़ाइ, दवाइ, ईसाइ, बुराइ, कठिनाइ, नाइ, गहराइ, सुइ, all guesses | लड़ाई, दवाई, ईसाई, बुराई, कठिनाई, नाई, गहराई, सुई |

The table of the same nouns generates these forms correctly, so the generator and the reader disagree.

### 4.4 The guesser invents words (shown as "unconfirmed", no meaning)

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| हमीं ने यह काम किया। / तुम्हीं बताओ। | हमीं, तुम्हीं | **हमना**, **तुम्हना**, verb, feminine plural perfective participle | हम, तुम + ही (मुझी is blank) |
| अपनों से दूर मत रहो। | अपनों | अपन, noun | अपना, "one's own people" |
| वह ग्यारहवें दिन आया। / बीसवीं सदी | ग्यारहवें, बीसवीं | **ग्यारहव**, noun, feminine plural; **बीसवना**, verb | ordinals (only first to tenth are known) |
| श्रीमती गुप्ता | श्रीमती | **श्रीमना**, verb, imperfective participle | title, "Mrs" |
| मेट्रो स्टेशन | मेट्रो | **मेट्रना**, verb, "you (तुम), subjunctive" | noun |
| प्रो. वर्मा | प्रो | **प्रना**, verb | abbreviation |
| आपकी मेहरबानी | मेहरबानी | **मेहरबाना**, verb, feminine infinitive | noun, "kindness" |
| आविष्कार की जननी | जननी | **जनना**, verb, feminine infinitive | noun, "mother" |
| एक तिहाई लोग | तिहाई | **तिहाना**, verb | "a third" |
| दुगना दाम | दुगना | verb, infinitive | "double" |
| पौने तीन बजे | पौने | पौना, noun | "quarter to" (पौन is listed, पौने is not) |
| कुछ खाना-वाना | वाना | verb, infinitive | echo word (वाय in चाय-वाय is blank) |
| उन्हे बुलाओ। | उन्हे | उन्हा, noun | उन्हें written without its nasal dot (common in real text) |
| रहने की संभावना / परेशानी का सामना करना | संभावना, सामना | verbs | nouns |
| इसीलिए | इसीलिए | **इसीलना**, verb | "that is why" |
| मानवता | मानवता | **मानवना**, verb | noun, "humanity" |

The dictionary line under most of these has the right word, so the card contradicts itself.

### 4.5 Blank card

- **Names:** राहुल, प्रियंका, मोदी, गांधी, गुजरात, राजेश, जयपुर. A name outside the list of 134 gets nothing, not even "a name".
- **News and school vocabulary:** हड़ताल, मैच, ईमेल, कॉलेज, विभाग, संपर्क, घोषणा, निर्णय, राहत, बचाव, यातायात, मुख्यमंत्री,
  प्रधानमंत्री, चुनाव, नीति, अधिकारी, कर्मचारी, प्रोफ़ेसर, साहित्य, उपन्यास, पत्रिका, वेबसाइट, लैपटॉप, मैसेज, पर्यावरण,
  अर्थव्यवस्था, आविष्कार, प्रभावित, जारी, हालात, राजनीतिक, सांस्कृतिक, अंतरराष्ट्रीय, शौचालय, ज़िला, रेस्तराँ.
- **Connectives and postposition words:** यद्यपि, काश, अतः, विरुद्ध, मुताबिक़, प्रति, लायक़, तहत (the phrases *के मुताबिक़, के
  विरुद्ध, के प्रति, के लायक़* are found, the word itself is blank), परस्पर.
- **Everyday words:** प्रयत्न, नामुमकिन, ख़्याल, यक़ीन, इजाज़त, रात्रि, प्राप्त, देन, बर्ताव, जन्मजात, तरकारी, महल, कसरत, गड़बड़, विद्या.
- **Spelling variants not joined:** छः (for छह), उनचालीस (for उनतालीस), अकसर (for अक्सर), कौनसी, नही and मै (written
  without the nasal dot).
- **Numbers and symbols:** अरब; Devanagari digits (१५); रु., सन्, डॉ., श्री, बी.ए. (Devanagari has no capital letters, so the sentence-initial test of the other audits does not apply.)
- **Verb forms:** जाया (in *जाया करता था*), गिरवा (the stem of an unlisted causative), माँओं.
- **Text with a joiner inside a word:** *क्‍या* and *श्‌री* written with U+200D / U+200C (as some web pages and fonts
  write them) are blank; the adapter does not strip the joiner.

### 4.6 The meaning line

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| उसने किताब पढ़ी। | पढ़ी | "reading" | "read" (past) |
| वह कल दिल्ली गया। / उसने काम किया। / मैंने उसे पैसे दिए। / बच्चा बहुत रोया। | गया, किया, दिए, रोया | "going", "doing", "giving", "crying" | "went", "did", "gave", "cried" |
| यह कैसे हुआ? | हुआ | "being" | "happened" |
| मैं खाना खा रहा हूँ। / वह सो रही थी। | रहा, रही | "staying" | the progressive marker ("-ing") |
| मुझे घर जाना पड़ा। | पड़ा | "falling" (the note "obligation" is shown) | "had to" |
| वह रोने लगा। / मुझे भूख लगी है। / उसे चोट लगी। | लगा, लगी | "seeming" | "began"; "is felt"; "was hurt" |
| इस काम में दो घंटे लगेंगे। | लगेंगे | "They will seem" | "will take" |
| यह नहीं चलेगा। | चलेगा | "He will walk" | "this will not do" |
| मुझे हिंदी आती है। | आती | "coming" | "(I) know" |
| मुझे पता नहीं। | पता | "address; trace" | "knowledge" (I do not know) |
| चोर पकड़ा गया। | गया | "going" (the note "passive" is shown) | passive auxiliary |
| तुम क्या करोगे? | करोगे | "to do, to make" | "You will do" (आऊँगा gets "I will come") |
| वे क्रिकेट खेलते थे। | खेलते | "playing (a game" (cut off inside the bracket) | "playing" |
| उसने कल फ़ोन किया था। / मैं कल आऊँगा। | कल | "yesterday; tomorrow" both times | yesterday; tomorrow (the tense decides) |

### 4.7 The form line

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| तू यहाँ आ। / क्षमा कर। / परीक्षा में न ला | आ, कर, ला | "bare stem (before a second verb)" | command to तू |
| हमें दे। | दे | "third person singular, subjunctive" | command to तू |
| हम साथ बैठकर पढ़ते हैं। / हम … भी साथ खाते हैं। | हैं | "third person plural", "They are" | first person plural (read correctly in *हम अक्सर … खाते हैं* and *हम सब मिलकर खाते हैं*; the search for the subject fails here) |
| हम साथ चलेंगे। / चलो, घर चलें। / फिर मिलेंगे। | चलेंगे, चलें, मिलेंगे | "third person plural", "They will walk", "They will meet" | first person plural |
| आप अंदर आएँ। | आएँ | "third person plural, subjunctive" | polite request to आप (आएँगे with आप is read as "you (आप)") |
| मैं चाहता हूँ कि वह आए। / तेरा राज्य आए। | आए | "masculine plural, perfective participle", "coming" | third person singular subjunctive |
| वैसे पृथ्वी पर भी हो। | हो | "familiar command (तुम)" | third person singular subjunctive |
| तू जो स्वर्ग में है | है | "you (तुम), present" | second person singular with तू (है never goes with तुम) |
| अपने घर जाओ। / मैं अपना गृहकार्य … / अपना ध्यान रखिएगा | अपना, अपने | "possessive **of the third person**" | reflexive: the subject's own, any person |
| अपने घर जाओ। | अपने | "masculine, direct plural" | oblique singular |
| अगले महीने मेरी परीक्षाएँ … / पिछले साल / दूसरे दिन | अगले, महीने, पिछले, दूसरे | "masculine, direct plural" | oblique singular (a time phrase) |
| थोड़े लोग आए। | थोड़े | "oblique singular" | direct plural |
| अच्छी लड़कियाँ आईं। | अच्छी | "feminine singular" | feminine plural |
| हे लड़के, सुनो! / बेटे, इधर आ। | लड़के, बेटे | "direct plural" | vocative singular (the tables have no vocative singular either) |
| तीनों बच्चे सो गए। / सैकड़ों लोग / हज़ारों साल | तीनों, सैकड़ों, हज़ारों | noun, "oblique plural" | "all three"; "hundreds of", "thousands of" (not oblique here) |
| अगले दो दिनों तक | दो | noun, masculine direct singular | numeral |
| यह किताब किसकी है? | किसकी | "possessive of the third person" | interrogative possessive |
| वह बैठे-बैठे सो गया। | बैठे | "third person singular, subjunctive" | perfective participle used as an adverb |
| सीधे जाइए / बाएँ मुड़ जाइए | सीधे, बाएँ | adjective, "masculine, direct plural" | adverbs |

### 4.8 Spelling variants

Read as one word with the listed spelling, all correct: हिन्दी, लिये, चाहिये, कीजिये, सुन्दर, अण्डा, लम्बा, गङ्गा, हूं, वहां, मां, पांच,
लड़कियां, दरवाजा, जरूरत, गरीब, बाजार, ताजा, फोन, मेज, आवाज, सफेद, लडका, पढ, सडक, गये, गयी, आये, आयी, दिये, हुये, नयी, नये,
दुःख, क़लम, महत्वपूर्ण, बुख़ार, ख़ुद, गुस्सा, वो, चवालीस, both the precomposed and the decomposed nukta letter.
Not joined: the list in 4.5, and *हंस* for *हँस* (4.2).

### 4.9 Role in the sentence

Wrong labels seen:

| Sentence | Word | The card shows | Correct |
|---|---|---|---|
| बहुएँ रसोई में हैं। | बहुएँ | subject of "रसोई" | subject of हैं |
| राजाओं के महल बड़े होते हैं। | राजाओं | adverbial phrase of "बड़े" | belongs with महल |
| ओ लड़को, इधर आओ! / भाइयो और बहनो, सुनिए। | लड़को, बहनो | direct object of "आओ" / "सुनिए" | the ones addressed |
| किन लोगों ने यह किया? / दोनों भाई आए। | किन, दोनों | adverbial phrase | determiner of the noun |
| जो मेहनत करता है, … | जो | points at or quantifies "मेहनत" | subject of करता |
| आप लोग बैठिए। | लोग | direct object of "बैठिए" | part of the subject |
| उत्तर भारत में सर्दी पड़ती है। | उत्तर | direct object of "पड़ती" | describes भारत |
| कौन-सी किताब चाहिए? | कौन | subject of "सी" | कौन-सी, describes किताब |
| “तुम कहाँ हो?” उसने पूछा। | पूछा | coordinated with "कहाँ" | the main verb |

### 4.10 Homographs the brief named

Decided correctly in my probes: की (after a noun / after a verb noun), सीता (name / "sews"), आम (mango / common), गाना
(song / to sing), खाना in *मुझे खाना खाना है*, सोता (sleeps / spring), कि, पार, दिया / दीया, लो, उत्तर (both meanings shown).
Decided wrongly or not at all: पर, कल, सोना, खाना (subject), और, बस, बहुत, जी, जल, मान, हार, पता (4.1, 4.2, 4.6); *बाल दिवस* is
"hair".

### 4.11 Grammar notes and phrases

Good, each seen firing correctly: ergative ने and ने with a को object, को for the definite object and for the one who
feels, oblique before a postposition, genitive agreement, adjective agreement, plural forms, comparison with से, सबसे,
habitual present and past, progressive, present perfect, pluperfect, future, subjunctive, polite request, command,
negative command with मत, obligation (चाहिए, है, पड़ना), ability (सकना), managing (पाना), beginning (लगना), wanting,
permission (देना), passive, causative, compound verb, conjunctive participle, about to (-ने वाला), contrary to fact,
conditional, relative and correlative pairs (जो … वह, जब … तब, जहाँ … वहाँ, जैसा … वैसा, जितना … उतना), reduplication,
yes/no question. Phrases: बात करना, काम करना, मदद करना, इंतज़ार करना, भूख लगना, ठंड लगना, डर लगना, याद आना, पसंद होना, पता
चलना, के लिए, के बाद, की तरफ़, के बारे में, की वजह से, जब तक, जी हाँ, कोई बात नहीं, अपने आप, हो सकता है.

Missing (no note where one is due):

- *-ते ही* "as soon as" (*घर पहुँचते ही*): only "emphatic particles". *-ते हुए*, *-ए हुए* / *हुआ* as participle phrases
  (*दौड़ते हुए*, *लिखा हुआ पत्र*, *मरा हुआ साँप*): nothing. *-ते समय*: nothing.
- *-ता रहना* (*हँसता रहा*) and *-ता जाना* (*पढ़ता जाता है*): nothing. *जाया करना*: blank.
- The presumptive (*वह आ रहा होगा*, *खा लिया होगा*): "He will be", no note.
- *न … न* "neither … nor"; the tag *न?*; *एक दूसरे* "each other"; *बिना … -ए* (*बिना कुछ कहे*).
- The incapacity passive (*मुझसे चला नहीं जाता*) is called a compound verb "चल जाना".
- The infinitive as a command (*बाएँ मुड़ना*) is called "infinitive as noun".
- A postposition after an infinitive used for purpose (*टहलने जाती हूँ*) is called "oblique (before a postposition)".

### 4.12 The dictionary meaning line

- *लिए* (postposition): "to take; to buy, get". *बारे*: "time, turn". *प्रति*: "copy" first. *हिंदी*: "an Indian; a person of
  India" before the language. *माता*: second sense "ellipsis of शीतला माता". *रुपया*: second sense "a foreign currency of
  some kind". *जहाँ*: "alternative form of जहान". *कलम*: "nuqtaless form of क़लम" and no meaning. *मोदी*: "grocer". *बी*:
  "synonym of बीवी".
- `dict/hi/frequency.json` says what it was counted from (1,285 library texts, the bundled corpus and 59 ladder units,
  898,575 words), which is better than the Norwegian file; the ladder share means course words rank high because the
  course uses them.

### 4.13 Romanisation and pronunciation notes

The line is ISO 15919 by rule (`translit.ts`), shown only when the rule is sure. Stage 0 explains three of its letters
(c, ś, ṁ) in the first sound lesson; the orientation does not mention it.

Wrong (each seen on the card; the bundled dictionary's own romanisation agrees with the right-hand column except where
marked):

| Word | The card shows | Correct | Cause (from the code) |
|---|---|---|---|
| हँसना, हँसता | haṁsanā, haṁsatā | hãsnā, hãstā | an "a" is kept after any nasal sign |
| माँगना, पहुँचना, बाँधना, बाँटना, जाँचना, ढूँढ़ना, फँसना, काँपना, रँगना … | māṁganā, pahuṁcanā, bāṁdhanā, bāṁṭanā … | māṅgnā, pahũcnā, bāndhnā, bā̃ṭnā … (no "a" before -nā) | the same: 40 verbs of the list, in every form in -ना, -ने, -ता, -ते, -ती, -कर |
| संतरा, जंगली, उँगली, चाँदनी, घोंसला, पिंजरा, लंगड़ा, धुंधला, हँसमुख, बँटवारा, पाँचवाँ, संकरा | santarā, jaṅgalī, uṁgalī, cāṁdanī, ghoṁsalā, piñjarā, laṅgaṛā, dhundhalā, haṁsamukh, baṁṭavārā, pāṁcavāṁ, saṅkarā | santrā, jaṅglī, uṅglī, cā̃dnī, ghõslā, piñjrā, laṅgṛā, dhundhlā, hãsmukh, bãṭvārā, pā̃cvā̃, saṅkrā (also मंडली: maṇḍlī) | the same |
| फेंकना, खींचना, छींकना, चौंकना, सौंपना, पोंछना, ईंट, चींटी, होंठ, सौंफ, क्योंकि | pheṅkanā, khīñcanā, chīṅkanā, cauṅkanā, saumpanā, poñchanā, īṇṭ, cīṇṭī, hoṇṭh, saumph, kyoṅki | phẽknā, khī̃cnā, chī̃knā, caũknā, saũpnā, põchnā, ī̃ṭ, cī̃ṭī, hõṭh, saũph, kyõki | ं over a raised vowel sign before a voiceless stop is a nasal vowel, not n / m + stop. (गेंद "gend", नींद "nīnd": check; the dictionary has gẽd and nīnd.) |
| बढ़ई, कतई, वाक़ई | baṛhī, katī, vāqī | baṛhaī, kataī, vāqaī | the "a" before an independent vowel is dropped |
| दुश्मनी, असफल, असफलता, सुसमाचार, पुनरुत्थान, कृतज्ञता, दाखलता, दुष्टता, आइसक्रीम | duśmnī, asphal, asphaltā, susmācār, punrutthān, kr̥tajñtā, dākhaltā, duṣṭtā, āisakrīm | duśmanī, asaphal, asaphaltā, susamācār, punarutthān, kr̥tajñatā, dākhlatā, duṣṭatā, āiskrīm | the rule does not see where the parts of a word join |
| जरूर, फोन, सफेद, कीमत, खबर, गलत | jarūr, phon, saphed, kīmat, khabar, galat | zarūr, fon, safed, qīmat, ḵẖabar, ġalat | the card names the word as ज़रूर, फ़ोन … and romanises the letters as typed |
| लडकी, पढना | laḍkī, paḍhnā | laṛkī, paṛhnā | the same; nobody says laḍkī |
| करेंगे / जाएँगे / करूँगा | kareṅge / jāeṁge / karūṁgā | one ending, three spellings of its nasal | ं before ग is ṅ, ँ is ṁ |
| पचहत्तर, इकहत्तर, अठहत्तर, सतहत्तर | pachattar, ikhattar, aṭhhattar, sathattar | pac-hattar, ik-hattar … | "ch", "kh", "th" also stand for छ, ख, थ; nothing separates c + h |

No romanisation at all (the note "a guess for this word: no romanization is shown"): 120 lemmas of the list, among
them पत्र, मित्र, पुत्र, चित्र, छात्र, समुद्र, राष्ट्र, क्षेत्र, सत्य, कार्य, राज्य, सूर्य, मूल्य, मनुष्य, भविष्य, स्वास्थ्य, वाक्य, उम्र, अन्य,
मुख्य, पवित्र, देवता, दुकानदार, ईमानदार, मंगलवार, फ़रवरी, उपहार, उपदेश, इंटरनेट, खटखटाना, बड़बड़ाना (full list in
`out-roman-count.txt`).

No help where the spelling misleads (the card shows the transliteration and none of these notes):

- *ज्ञान, विज्ञान, आज्ञा*: "jñān, vijñān, ājñā"; said gyān, vigyān, āgyā. The unit rule knows it ("ज्ञ is written jñ but said gy")
  but the card's pronunciation notes do not carry it.
- *कृपा, हृदय, ऋषि*: "kr̥pā, hr̥day, r̥ṣi"; said kripā, hriday, rishi. No note.
- *यह, वह*: "yah, vah"; said ye(h), vo(h). No note. *वो* is read as वह, correctly.
- *पहला, कहना, बहन, शहर, बहुत, सुबह, जगह*: "pahlā, kahnā, bahan, śahar, bahut, subah, jagah"; the a beside ह is said
  e (pehlā, kehnā, behen, sheher), o in बहुत (bohot). No note.
- *दुःख, छः*: "duḥkh, chaḥ"; said dukh, chah / che.
- ँ and ं at the end are both "ṁ" (*हूँ* hūṁ, *में* meṁ, *माँ* māṁ, *पाँच* pāṁc, *आँख* āṁkh): a learner reads an m.
- "c" is च and "ch" is छ: explained once in Stage 0 and nowhere on the card.

Two romanisations on one card (from the code, `content/enrich.ts`, and the records I printed): when the dictionary
record arrives the pronunciation section also shows the dictionary's own romanisation and IPA, in another scheme
(*ख़ुदा* "xudā" beside "ḵẖudā", *कृपा* "kŕpā" beside "kr̥pā", *हँसना* "hãsnā" beside "haṁsanā"). The adapter has a function
that corrects the rule from the dictionary's IPA (`decodeHindiWithPronunciation`); the card's top line does not use it.

## 5. Wrong forms in the tables

"All forms" for Hindi is the rule table merged with the bundled dictionary's table; a conflict shows the dictionary's
form first and the rule's as an alternative. I read all 136 conflicting cells (66 lemmas) and scanned all 2,598
generated tables.

### 5.1 Rule faults

1. **A chandrabindu is put on a raised vowel sign**, which no spelling in use has: *जायेँ, जायेँगे, जायेँगी, आयेँ, खायेँ,
   पियेँ, सोयेँ, कुयेँ, दायेँ, मातायेँ* and so on, in **298 tables** (every vowel-stem verb, every feminine in -ा, कुआँ,
   दायाँ, बायाँ). The spelling variant is *जायें*, which is also generated.
2. **A noun in -ई gets a form in -यी**: *भायी* (for भाई), *मिठायी, दवायी, सुयी, बढ़यी, जुलायी, मयी* (for मई), *मुंबयी,
   चेन्नयी*: **52 tables**. भायी is a form of भाना, not of भाई.
3. **The conjunctive of करना is given as करकर** (first, with करके as the alternative, status "verified" because the
   alternative matches the dictionary). The form is करके (or कर).
4. **A feminine in -िया is always declined like चिड़िया**: *क्रिया* gives *क्रियाँ, क्रियों*; *कलीसिया* gives *कलीसियाँ,
   कलीसियों*. Correct: क्रियाएँ, क्रियाओं; कलीसियाएँ, कलीसियाओं (the dictionary's forms are shown first, the wrong ones beside
   them). *दुनिया*: the dictionary itself gives both दुनियाँ and दुनियाएँ.
5. **Nouns in -ो take -ओं on the whole word**: *रेडियोओं, फ़ोटोओं, वीडियोओं, किलोओं, ऑटोओं*. The dictionary has रेडियों,
   फ़ोटों (check: in use these words mostly stay unchanged).
6. **The polite command of a stem in -ी is built with -जिए for every verb**: *जीजिए, सीजिए*. Right for पीना (पीजिए); the
   dictionary gives जीइये, सीइये (check).
7. **सकना gets commands and a conjunctive**: *सक, सको, सकिए, सककर, सकके, सककरके*. सकना has none. (The dictionary's
   mechanical table has them too, so they show as "verified".)
8. **No vocative singular** in any noun table (लड़के!, बेटे!), though the note under the table quotes "लड़के!".
9. **No table at all** for माँ and गेहूँ from the rules (a word ending in ँ has no class); the dictionary supplies माएँ,
   माओं for माँ, and the reader cannot read them (*माँओं* is blank).

### 5.2 Wrong rows

- **चंद्रमा** is not marked "does not change": the table shows *चंद्रमे, चंद्रमों* (rules only, no dictionary table).
  Correct: चंद्रमा in every case.
- **ख़ुदा**, **राजमा**: the same; the tables show *ख़ुदे, ख़ुदों*, *राजमे, राजमों* beside the dictionary's unchanged forms.
- **इकट्ठा** is marked "does not change" and its table says so in a note, while the dictionary's cells beside it give
  इकट्ठे, इकट्ठी. It changes; *इकट्ठे* in a text becomes the invented verb इकट्ठना (4.2).
- **Genders:** *मई* is masculine in the list (the dictionary and the list's own *जनवरी, जुलाई* say feminine);
  *ससुराल* is masculine (feminine: ससुरालें); *मक्का* "maize" is feminine (masculine: मक्के). Check, where the list and
  the dictionary disagree and I am not sure: नाप (list m), बंदरगाह (list m), मटर (list m), अदरक (list m), झाड़ू (list f),
  तराज़ू (list m), मसीहा and मुखिया (list: do not change).
- **हार** "necklace" has its own masculine row, but the card reads every हार as the feminine "defeat" (4.2) and the
  table mixes the two words.
- **Ergative marks:** सकना is "not stated"; it never takes ने. नहाना is "not stated"; it does not take ने (check).
- **पीना** lists by hand *पीया, पीऊँ, पीऊँगा, पीए, पीएँ*, which the table shows as plain cells; the standard spellings are
  पिया, पिऊँ / पियूँ, पिए, पिएँ.
- Perfective participles are also listed as adjectives (खुला, गिरा, सोया, लिखा, टूटा, थका, पका, कटा, जला, बैठा, रखा …, about 27
  rows). In my probes the verb reading still came first where a verb was meant.

### 5.3 Faults of the merge (seen in the merged tables)

- **होना:** the dictionary's *होए, होएँ, होएगा, होएँगे, होएगी* are put first and the standard *हो, हों, होगा, होंगे, होगी*
  shown as alternatives. A learner who opens the table of the commonest verb sees होएगा for "will be".
- **बच्ची, पोती, अब्बू:** the dictionary record picked is that of बच्चा, पोता, अब्बा, so the table of बच्ची leads with
  बच्चा, बच्चे, बच्चों.
- **पुताई:** every cell shows "-" (the dictionary's empty row) with the real forms as alternatives.
- **रुपया:** the Latin strings "rupe, rupae, rupye, rupaye" stand among the alternative forms.
- 161 of 2,467 lemmas have no dictionary record and 331 more have a record with no table that merges, so their cells
  are the rules' alone (5,192 cells in all).

## 6. Grammar not modelled at all

- **Nouns:** the vocative singular; the plural of nouns in -ई when reading; nouns ending in a nasal vowel (माँ, गेहूँ, जूँ);
  the aggregative numerals (दोनों is listed; तीनों, चारों are called "oblique plural"); सैकड़ों / हज़ारों / लाखों as "hundreds /
  thousands of"; noun + वाला as a word of its own (सब्ज़ीवाला is "vegetable").
- **Pronouns:** the emphatic forms हमीं, तुम्हीं, मुझी, तुझी, किन्हीं; अपना as a noun (अपनों); कौन-सा / कौनसा as one word; आप as
  "self" outside the phrase अपने आप; the reciprocal एक दूसरे; क्या as a question particle (always "what").
- **Numbers:** ordinals above tenth; पौने; fractions (तिहाई, चौथाई); दुगना, तिगुना; अरब; Devanagari digits; number words
  for speech above 20 (said in the adapter's own notes); variant spellings छः, उनचालीस.
- **Verbs:** the command to तू as a form of its own (called "bare stem"); the subjunctive of third person after कि when
  it is written like the plural participle (आए); first person plural when हम is not next to the verb; the infinitive
  as a command; the frequentative जाया करना; the bare stem of a causative that is not listed (गिरवा); the conjunctive
  के after a stem written apart (खा के).
- **Constructions:** the list in 4.11.
- **Sentence level:** पर "but" without a comma; और "and" after a finite verb; कल by the tense of the verb; बस, सोना,
  खाना by their place in the clause.
- **Unknown words:** no "probably a name" reading; no use of the dictionary's own "form of" entries before a lemma is
  invented; joiners (U+200C, U+200D) inside a word.
- **Echo words** (चाय-वाय, खाना-वाना): the echo is blank or an invented verb.
- **Registers:** the list marks Perso-Arabic, Sanskritic and English-loan words, and both members of the pairs I tried
  (सहायता / मदद, पुस्तक / किताब, उत्तर / जवाब, प्रतीक्षा / इंतज़ार, समय / वक़्त, मित्र / दोस्त) are read. I did not check what the
  card says about the layer.

## 7. Orientation and course texts

**Orientation (`tutorial/hi.ts`).** Honest about what it leaves out (no verbs, no ergative, no oblique). Three
points: (1) it says a word with two jobs "keeps both readings, and the card says it could not choose"; the card does
choose, shows one reading as the best and adds "1 other reading possible"; (2) it does not explain the romanisation the
card shows under every word; (3) it does not mention the three words for "you".

**Stage 0 sound lessons (9).** Clear and mostly right. Faults: lesson 4 says ै is "the a in hat followed by a little i"
and ौ "aw followed by a little u"; in standard Hindi both are single vowels with no glide, and the quiz "How is है said?"
marks "hai" right and "he" wrong, though है is said with a single open e (check: "ai" is the scheme's letter for that vowel, but the lesson has just described it as a glide). Lesson 3 says ँ is "usual on a long ā at the end of a word (हाँ, कहाँ,
पाँच)"; the rule is that ँ is written where no vowel sign rises above the line, and पाँच is not word-final. Lesson 2
teaches यह in the lesson on the silent final a and never says that यह is said ye(h).

**Stage 0 scenes (123 lines).** The Hindi is grammatical, but the habitual present is used where Hindi needs the
progressive or the future, and the English beside it then says something else:

| Line | English given | What the Hindi says / natural Hindi |
|---|---|---|
| हम बाज़ार नहीं जाते। | We are not going to the market. | "We do not go"; हम बाज़ार नहीं जा रहे |
| सीता नानी भी आज रोटी नहीं बेचती हैं। | … is not selling roti today either. | नहीं बेच रही हैं |
| मैं हिंदी बोलना सीखता हूँ। / सैम यहाँ हिंदी बोलना सीखता है। | I am learning … / Sam is learning … | सीख रहा हूँ / सीख रहा है |
| मैं दूध पीता हूँ। | I will have milk. | "I drink milk"; मैं दूध पिऊँगा |
| आज हम बाज़ार जाते हैं। / आज हम चावल खाते हैं। | Today we go … / Today we eat rice. | जा रहे हैं / खा रहे हैं (or खाएँगे) |
| अमन और सीता नानी भी चर्च जाती हैं। | Aman and Seeta Nani go to church too. | जाते हैं: a boy and a woman together take the masculine plural (check) |
| मुझे दो रोटी चाहिए। / मुझे तीन रोटी चाहिए! | I want two / three rotis. | दो रोटियाँ, तीन रोटियाँ (the unmarked plural is colloquial) |

A learner will learn सीखता हूँ as "am learning". This is the price of teaching only one tense in Stage 0; it should be
said in a note or the English should match.

**Ladder (74 units, all machine-drafted, 53,418 words).** I read about 1,400 words from five units (A1 `hi-a1-2-03`,
A2 `hi-a2-1-08`, B1 `hi-b1-04` and `hi-b1-25`, and paragraphs of others) and found no grammatical error; the Hindi is
controlled and sometimes stiff (*जो उसे उत्पन्न करता है*), which the unit notes admit. I did not read the rest. The card
reads the ladder almost completely (99.4 %) because the list was extended from it; that figure says nothing about other
text.

**Gold files (`data/gold/hi`), `docs/DE_ES_HI_COURSE_GAPS.md`:** not audited beyond reading the gaps note, which is about
sources and rights, not grammar.

## 8. What to fix first

1. **Remove the rule that lifts a perfective participle above the other entry** (`hi.ts`, the 0.6 in `handCandidates`),
   or apply it only to a causative pair. Then जाना, कहीं, जी, सी and जीता read correctly at once. Add बजे "o'clock" as a
   listed form.
2. **Read the plural of nouns in -ई**: in `nounCandidates` take the independent इ before य back to ई (भाइयों → भाई).
3. **Give the perfective participle a past meaning** ("read", "went") and the helping verbs their own (रहा: the
   progressive; पड़ा after an infinitive: "had to"; लगा after an oblique infinitive: "began"; गया after a participle:
   passive). The construction is already detected in each case.
4. **Romanisation:** drop the "a" after a nasal syllable by the ordinary rule (हँसना like समझना); keep it before an
   independent vowel; romanise the listed spelling when the word was typed without its nukta; take the dictionary's IPA
   where there is a record (the function exists); add the three notes (ज्ञ, ऋ, यह / वह). Decide on one scheme for the card.
5. **Stop the guesser inventing verbs** from -ी, -ो, -ीं, -ना endings of words that the dictionary knows as something
   else; ask the dictionary's "form of" entries first. Give an unknown word before a title or ने at least "name?".
6. **Use the particle and the command reading the notes already found**: क्या at the start of a yes/no question; दो, कर,
   ला, आ, दे as commands; कर after a stem as the conjunctive.
7. **Person and case from the sentence:** हम anywhere before the verb gives first person plural; आप gives the polite
   second person; अपना is the subject's own, never "third person"; a time phrase in -े is oblique singular; a noun
   after हे / ओ or before a comma and a command is vocative.
8. **Rows:** चंद्रमा, ख़ुदा, राजमा do not change; इकट्ठा changes; मई and ससुराल feminine, मक्का masculine; हार by gender of
   what agrees with it; add जल, मान, नीति, अधिकारी, कर्मचारी, घोषणा, निर्णय, विभाग, चुनाव, कॉलेज, यद्यपि, काश, अतः, the
   postposition words of 4.5, ordinals by rule, पौने, छः.
9. **Tables:** no chandrabindu on a raised sign; no -यी for nouns in -ई; करके for करना; -ाएँ for क्रिया and कलीसिया; no
   commands for सकना; in the merge, never put a dictionary form before the rule's when the rule's is the listed
   irregular (होगा), and do not take a record of another headword (बच्चा for बच्ची).
10. **Strip U+200C / U+200D** before analysis.
11. **Stage 0:** make the English match the tense taught, or introduce the progressive; correct the notes on ै / ौ, ँ
    and यह.

## 9. Limits of this audit

- I am a language model, not a native speaker, and looked nothing up outside the repository. Where I say a form is
  wrong without "check" I am confident of it; the romanisation table of 4.13 is, in addition, supported by the pack's own
  bundled dictionary records (`out-entry2.txt`), which I used as a second opinion after forming my own.
- Genders marked "check" in 5.2 are cases where usage is divided or I am unsure; three of them rest on the list and the
  dictionary disagreeing.
- The noun and adjective rows were read as lemma, gender, flags, romanisation and gloss; their forms follow from the
  class, which I checked per class and then mechanically (`table-scan.mts`, `merged.mts`), not row by row.
- The syntax, disambiguation, construction, phrase and writing-check code was tested through about 650 sentences only.
  `production.ts` (checks on the learner's own writing) was not tested at all.
- The running text is mine; another 640 words would give different counts. The ladder figure is a machine count that I
  did not hand-check.
- I did not open the extension's user interface. What the card shows is taken from `parseSelection`, from the dictionary
  lookup and from `buildParadigm`; how the pronunciation section lays out the two romanisations is read from the code.
- Hand counts could be off by a few.
