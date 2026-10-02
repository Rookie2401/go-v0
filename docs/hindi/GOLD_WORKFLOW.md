# The Hindi gold set: how it works and how to review it

## What it is for

The gold set is a list of Hindi sentences chosen because an analyzer can get them wrong in ways that would mislead a learner (ने, को, agreement, oblique forms, compound verbs, the progressive रहा, the unwritten a, nukta, ambiguous words ...). Each sentence comes with what a correct analysis says. Once a native reviewer has accepted an item, the app can be measured against it: `npm run hi:eval-gold` says how many accepted items the Hindi adapter reads as the reviewer says, per category.

Until a named native reviewer has accepted items, **nothing about Hindi analysis has been measured**.

## The two files (data/benchmarks/hi/)

- `gold-draft.jsonl` - items drafted by an AI model. They are **questions for a reviewer, not ground truth**. Every one has `"status": "draft"` and `"draftedBy": "AI model (unreviewed)"`. The model's Hindi may be wrong, unnatural or too confident.
- `gold.jsonl` - items a named person has accepted, with the name, the date and a hash of what was accepted. Only these are called gold. The file does not exist until the first acceptance. Nothing is meant to write to it except `hi:gold -- accept`, which refuses without a reviewer's name (and refuses names that look like a tool).

## An item (one JSON object per line)

```json
{"id":"ne-002","category":"ne","sentence":"मैंने कल एक नई किताब पढ़ी।","english":"I read a new book yesterday.",
 "tokens":[{"surface":"मैंने","lemma":"मैं","feats":{"Case":"Erg"},"parts":["मैं","ने"]},
           {"surface":"पढ़ी","lemma":"पढ़ना","feats":{"Aspect":"Perf","Gender":"Fem"}}],
 "constructions":["ergative-ne"],
 "harm":"The learner is told पढ़ी agrees with \"I\" ...","notes":"...","status":"draft","draftedBy":"AI model (unreviewed)"}
```

- `sentence`: natural Modern Standard Hindi, NFC. `english`: a plain translation.
- `tokens`: only the words the item is about. A token may say `lemma`, `pos`, `feats` (a subset of the features; a comma list means "any of"), `parts` (the pieces of a fused word), `said` (how the word is said, as a bare Latin skeleton: where the unwritten a is and is not said) and `register`. `nth` picks the second occurrence of a repeated word.
- `phrases` / `notPhrases`: multiword units that must / must not be found, written as lemmas (`["याद","करना"]`). `constructions`: grammar keys from `src/adapters/hindi/construction-data.ts`. `sentences`: how many sentences the text splits into.
- `harm`: what a learner would be told wrongly if the analysis fails here. `notes`: the drafter's doubts.

## How a reviewer works

1. Open `data/benchmarks/hi/gold-draft.jsonl`. Read the sentence first: is it correct, natural Hindi? Correct or delete it in place. Then read the expectations: are the lemma, the features, the units and the construction right **for this sentence**? Change them in place if not. Do not make an expectation match what the app currently says; the point is to find where the app is wrong. Read `notes` (the drafter's doubts).
2. Accept what you stand behind: `npm run hi:gold -- accept --by "<your name>" --id ne-001,ne-002` or `--all` (accepts everything still in the draft file, so use it only after reading every item).
3. `npm run hi:gold -- status` shows accepted and draft counts per category, stale items and file problems. An accepted item that is edited afterwards **becomes stale** (its hash no longer matches) and is not counted until it is accepted again. A draft you did not accept simply stays a draft.

## How to measure

`npm run hi:eval-gold` runs the adapter over the accepted items. An item passes when every statement it makes holds for the adapter's **first** reading. A statement about pronunciation (`said`) passes when the engine says exactly that with confidence, and counts as **left open** (neither passed nor failed) when the engine itself marks the word uncertain: that is honest, not a failure. `npm run hi:eval-gold -- --include-drafts` also runs the unreviewed drafts, labelled "NOT A MEASUREMENT"; it is for finding defects only.

**Rule: nobody tunes the engine against accepted items one by one.** A failing item shows a class of error: fix the class, with examples of your own, not the sentence. Keep a held-out half of the gold set that is never looked at while fixing; the coordinator keeps separate held-out tables as well.

## Categories (draft counts) and what to check

| Category | Drafts | The reviewer checks |
|---|---|---|
| ne | 14 | ने on the doer in the perfective; verb agrees with the object (or stays masculine singular with a को object); verbs without ने (लाना, बोलना, भूलना); ने fused to pronouns (parts) |
| ko | 10 | experiencer subjects (मुझे ... पसंद है, भूख लगी), definite objects, indirect objects, को fused in मुझे / उन्हें |
| agreement | 12 | adjective-noun agreement; का / के / की agrees with the possessed, not the owner; verb agreement |
| oblique | 12 | oblique singular before a postposition vs the direct plural of the same -े form; -ों; a -े noun with no postposition is plural; vocative |
| pronoun | 12 | यह / वह / ये / वे, oblique forms, मुझ / तुझ, किसी, जिन, the आप / तुम / तू levels, अपना. **Please settle the lemma convention for plural and oblique forms (वह or वे).** |
| compound-verb | 15 | stem + जाना / लेना / देना / पड़ना / डालना / उठना, and look-alikes that are not compounds (कर-participle plus a second verb) |
| complex-predicate | 12 | noun / adjective + करना / होना / आना / देना; units found even with a word in between |
| causative | 9 | Voice=Cau and the causative as the lemma (खिलाना, पढ़ाना, करवाना, सुलाना ...) |
| passive | 7 | participle + जाना as a passive, against a compound such as चला गया |
| relative-correlative | 8 | जो ... वह, जब ... तब, जहाँ ... वहाँ, जैसा ... वैसा, जितना ... उतना |
| honorific | 9 | plural agreement for one respected person, -इए commands, जी |
| auxiliary-chain | 13 | habitual, progressive (रहा as an auxiliary, not "stayed"), perfects, future, subjunctive, सकना, चुकना, पाना, चाहिए, चाहना |
| schwa | 14 | where the unwritten a is and is not said (`said` skeletons, ISO 15919 without diacritics, व written v) |
| nukta | 8 | a word keeps its nukta in surface and lemma (ज़, फ़, ड़, ढ़); is जरा really a separate word? |
| conjunct | 6 | words with conjunct consonants are found and tagged |
| register | 9 | Sanskritic, Perso-Arabic, English-loan, biblical, everyday layers. **Please judge the biblical tags (परमेश्वर, अनुग्रह) especially.** |
| ambiguity | 12 | real homographs decided by context: की, पर, और, सोना, आम, कर, खाना |
| segmentation | 7 | sentence splitting at danda, ? and !, quotations, डॉ., decimals, semicolon |

Total: 189 drafts, 0 accepted. Anything the drafter was unsure of is in the item's `notes`; items with a `notes` field deserve a second look first.
