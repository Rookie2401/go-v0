# Thai paradigms (Linguistic Engine V2, Stage 3)

Status: built 2026-10-10. Adapter `th` stays at version 5 (no analysis change). Machine-drafted word list; nothing here has been reviewed by a native speaker.

## 1. Policy: no tables

Thai words do not change form. There is no conjugation, declension, gender or number marking, so Thai has nothing to put in a table and the brief forbids inventing "fictitious conjugation tables". `thAdapter.paradigm(lemma, pos)` therefore always returns

```
{ kind: 'none', cells: [], template: 'does not inflect', notes: [...], constructions: [...ids] }
```

It never returns `undefined`: "this word does not inflect" is true of every Thai word, listed or not. `featuresFromTableTags` (`src/adapters/thai/table-tags.ts`) always returns `undefined`. The Wiktionary/kaikki extract has no inflection table for Thai: the `forms` of a Thai entry carry romanizations (20,580 of 21,020 entries), variant spellings (`alternative`), `classifier` (2,012), `abstract-noun` (5,386), `obsolete`, `archaic` and similar tags, none of which is an inflected form, so nothing is placed in a table and `mergeParadigm` has nothing to merge.

## 2. What the Forms section shows instead

For a word with `kind: 'none'` the card shows, in place of a table:

1. The first note, one sentence: Thai words never change form, and what a word does is shown by the words around it. Further notes by part of speech (aspect and negation are separate words; serial verbs; an adjective follows its noun; a noun has no plural form; a classifier stands between number and noun; a particle closes or softens a sentence).
2. For a NOUN: its classifier, as a note. The adapter has no noun-to-classifier table, so the classifier is named only when a classifier's recorded `counts` text (`classifiers.ts`, `function-words.ts`) names the noun's gloss (singular or plural: "books" matches the noun "book"). 71 of the 465 nouns of the word list get one this way (หนังสือ: เล่ม). A noun that counts itself (วัน, ครั้ง; 15 nouns) says so. Any other noun says the word list records no classifier; it names none. The dictionary half exists, though: 2,012 Wiktionary entries carry a `classifier` form, and the card lane can show that tagged form beside the note (it is dictionary data, not a paradigm cell, so it stays outside `paradigm()`).
3. `constructions`: ids of the adapter's own pattern vocabulary (section 4), most specific first, which the pack explains and the card links to.

## 3. Segmentation alternatives

Thai writes no word spaces, and a selection of one or several words can be cut in more than one way. The card needs the cut the reader chose and the other readings. Code: `src/adapters/thai/segmentations.ts`; named export `thSegmentations(text, opts?)` from `src/adapters/th.ts`.

The `LanguageAdapter` contract has no `segmentations` method, so it is NOT on the adapter object; the card lane wires the named export (there is no `thai/index.ts`; `th.ts` re-exports the types `ThaiSegmentations`, `ThaiSegmentation`, `ThaiSegmentWord`, `ThaiSegmentationOptions` and `THAI_CONSTRUCTION_IDS`).

```ts
thSegmentations('ตากลม', { context?: { before?, after? }, isWord?: (normalized) => boolean, maxAlternatives?: 3 })
→ { text, chosen: { words, confidence, basis }, alternatives: [{ words, confidence, basis: 'word-list' }], reason? }
// word: { text, start, end, known, readings: [{ lemma, pos, gloss?, confidence }] }   (readings = analyze, up to 3)
```

- `chosen` is the adapter tokenizer's cut (ICU dictionary segmentation, the course compound list, the context rules of `thai/text.ts`). With `context` the whole sentence is tokenized and the selection's tokens are taken from it, so the context rules decide (ตากลม after ไป stays one word: `basis: 'tokenizer-in-context'`). Without context the selection is cut alone.
- `alternatives` are other cuts, found by k-best dynamic programming over the selection. An alternative is made only of known words: the word list, the compound list, and (when the caller passes `isWord`, e.g. dictionary headwords) the dictionary. A cut that leaves a piece nobody lists is never offered, so no word is invented. The chosen cut may hold unknown pieces; they are marked `known: false` with no reading.
- Pieces cannot start with a vowel sign or tone mark nor end with a leading vowel (เ แ โ ใ ไ); ๆ is never a piece of its own (ช้าๆ is the known word ช้า repeated, not an alternative).
- Confidence is a share, not a probability. Each cut costs: 1 per word (1.5 for a word of one or two letters), +1 for a piece the lists do not know; the tokenizer's cut gets a fixed bonus of 2.5 (it saw the context rules). Weights are exp(-cost); a cut's confidence is its share of the weights of the cuts considered, clamped to 0.02-0.95. An alternative under 0.10 is dropped as implausible. Not fitted to data; it says "about as likely as" and no more.
- `reason` (always present when `alternatives` is empty) says why only one cut is plausible: one word of the list; no other cut gives pieces that are all listed words; the chosen cut has unknown pieces so there is nothing to compare; or other cuts exist (named) but are far less plausible. A selection with spaces or Latin letters is read as written, with a reason.

Examples (adapter lists only): ตากลม → chosen ตา-กลม (0.45; กลม is not in the word list, `known: false`), alternatives ตากลม (0.45, VERB "to take the air") and ตาก-ลม (0.10, "dry" + "wind"). With `context.before = 'ฉันไป'` the chosen cut is ตากลม. ข้าว, ฉันกินข้าว, หนังสือสองเล่ม: no alternative, with a reason. คนใน (one word of the list): คน-ใน exists but is below the threshold, and the reason names it.

## 4. Construction ids per part of speech

All 33 ids of the vocabulary (`THAI_CONSTRUCTION_IDS` in `thai/paradigm.ts`: the five first-seed detectors plus the 28 keys of `THAI_CONSTRUCTIONS`) are reported by `detectPatterns`; the test checks both directions. A word lists the constructions of its own lemma first (กำลัง: progressive-kamlang; ไหม: yes-no-question, final-particle; ไป: directional-after-verb ...), then those of its part of speech. All 33 ids appear in at least one word's list.

| part of speech | ids (after the lemma's own) |
| --- | --- |
| VERB | progressive-kamlang, continuing-yu, future-ja, experience-khoey, completed-laeo, negation-mai, did-not-mai-dai, not-yet-yang-mai, not-at-all-mai-loei, ability-dai, modal-before-verb, prohibition-ya, passive-thuk, causative-hai, benefactive-hai, directional-after-verb, nominalizer-kan; plus complement-wa first for a verb of saying or knowing |
| ADJ | negation-mai, future-ja, completed-laeo, comparative-kwa, superlative-thisut, not-at-all-mai-loei, nominalizer-khwam, reduplication-mai-yamok |
| NOUN | classifier-phrase, classifier-demonstrative, reduplication-mai-yamok, relative-thi |
| CLF | classifier-phrase, classifier-demonstrative |
| NUM | classifier-phrase, ordinal-thi |
| DET | classifier-demonstrative |
| PART | final-particle (politeness and sentence particles); ไหม / มั้ย / เหรอ add yes-no-question; ไม่ lists negation-mai, did-not-mai-dai, not-yet-yang-mai, not-at-all-mai-loei; เลย lists not-at-all-mai-loei |
| AUX, ADV, ADP, CONJ, SCONJ, PRON | by lemma only: จะ future-ja; อยู่ continuing-yu; แล้ว completed-laeo; ยัง not-yet-yang-mai; ได้ ability-dai, dai-before-verb, did-not-mai-dai; ต้อง / ควร / อยาก / อาจ / น่าจะ / คง modal-before-verb; ถูก / โดน passive-thuk; ให้ causative-hai, benefactive-hai; ที่ relative-thi, ordinal-thi; ว่า complement-wa; กว่า comparative-kwa; อย่า prohibition-ya; ถ้า / ก็ conditional-tha-ko; เพราะ / จึง cause-result-phro-chung; question words question-word-in-place; ทรง royal-verb; การ nominalizer-kan; ความ nominalizer-khwam |
| PROPN, INTJ, others | none |

### Pack explanations

`packages/language-packs/src/packs/th.ts` explains ONE construction today: `classifier-phrase`. The pack was not edited. These 32 ids need an explanation (`{ id, label, explain }`); the adapter already holds a title and a one-to-two-sentence explanation with an example for the 28 keys of `THAI_CONSTRUCTIONS` (field `title`, `explanation`, `example`), which the pack can reuse; the five first-seed ids have their text only inline in `baseConstructions` (`constructions.ts`).

- Aspect and negation: progressive-kamlang, continuing-yu, future-ja, experience-khoey, completed-laeo, not-yet-yang-mai, did-not-mai-dai, not-at-all-mai-loei, prohibition-ya, negation-mai (first-seed)
- Modality and voice: ability-dai, dai-before-verb, modal-before-verb, passive-thuk, causative-hai, benefactive-hai, royal-verb (first-seed)
- Noun phrase: classifier-demonstrative, reduplication-mai-yamok, relative-thi, ordinal-thi, comparative-kwa, superlative-thisut, nominalizer-kan, nominalizer-khwam (first-seed)
- Clause: complement-wa, conditional-tha-ko, cause-result-phro-chung, directional-after-verb
- Questions and particles: yes-no-question, question-word-in-place, final-particle (first-seed)

Missing construction: serial verbs (ไปซื้อ "go and buy") are named in a VERB note but no detector or id exists; `directional-after-verb`, `benefactive-hai` and `causative-hai` are the nearest. Plural and quantity beyond classifiers (หลาย, ทุก, ๆ as distributive) likewise have only `classifier-phrase` and `reduplication-mai-yamok`.

## 5. Probe numbers

`scripts/probe-thai-segmentation.mts` (`npx vite-node --config scripts/vite.config.ts scripts/probe-thai-segmentation.mts`): 165 corpus sentences (`data/corpus/th`) and the 3,116 Wiktionary example sentences (`data/benchmarks/th/generated/wiktionary-examples.gold.jsonl`). A "word" selection is one tokenizer token of two letters or more; a "pair" is two adjacent tokens with no gap (a multi-word selection). Dictionary run = adapter lists plus 17,228 Wiktionary headwords as `isWord`.

| source / selection / word test | selections | with an alternative | share | chosen cut all known words |
| --- | ---: | ---: | ---: | ---: |
| corpus / word / adapter lists | 1,327 | 0 | 0.0% | 95.0% |
| corpus / word / + headwords | 1,327 | 0 | 0.0% | 99.8% |
| corpus / pair / adapter lists | 1,116 | 0 | 0.0% | 88.4% |
| corpus / pair / + headwords | 1,116 | 67 | 6.0% | 98.4% |
| Wiktionary / word / adapter lists | 14,610 | 2 | 0.0% | 62.8% |
| Wiktionary / word / + headwords | 14,610 | 2 | 0.0% | 96.2% |
| Wiktionary / pair / adapter lists | 11,313 | 26 | 0.2% | 44.5% |
| Wiktionary / pair / + headwords | 11,313 | 1,543 | 13.6% | 91.2% |

Reading: a selection that is exactly one tokenizer token almost never has a plausible second cut (the tokenizer's token is either a listed word or a fragment); the ambiguity is in multi-word selections, where 6% (corpus) to 13.6% (Wiktionary examples) have an alternative once a dictionary supplies the words. With only the 1,692-entry word list nearly nothing can be offered, because an alternative needs every piece known: pass `isWord` from the dictionary. 30 of the 933 distinct selections with an alternative (every 31st in Thai order) were read: they split into three kinds. (a) Compound versus parts, by far the most common (การค้า / การ-ค้า, เมืองหลวง / เมือง-หลวง, เสียหาย / เสีย-หาย): the same pattern the word benchmark found as the biggest error class (docs/thai/BENCHMARKS.md section 3.4: 65% of adapter errors are splits into headwords that editors write whole). In every case both cuts are real words, and the chosen (split) cut is listed with the higher confidence (0.73-0.82) against 0.18-0.27. (b) Fragmentation of a name or loanword (เบนิ-น chosen at 0.27, เบนิน offered at 0.73; เช-เชน / เชเชน; อ-ยุติธรรม / อยุติธรรม): here the alternative is the better cut and the confidences say so. (c) A longer join of three words (เป็นการ-ผ่าตัด / เป็น-การผ่าตัด). No alternative in the 30 was a non-word, by construction. I cannot judge from this probe which cut a native reader wants: it measures how often the card would show more than one reading, not accuracy.

## 6. Limits

- The tokenizer's accuracy is the measured one (docs/thai/BENCHMARKS.md: boundary F1 90.3% on Wiktionary examples, no human-corrected gold); alternatives do not improve the chosen cut, they expose the competing readings. The chosen cut's confidence is a share among cuts, not a measured accuracy.
- Alternatives need every piece to be a known word. Without `isWord` the adapter's 1,692-entry word list rarely allows any. A word neither the lists nor the dictionary hold (a name) never appears in an alternative.
- The cost model is a heuristic (fewer and longer words win; the tokenizer's cut has a fixed bonus). A genuine reading that uses short words (ตาก-ลม) gets a low share. It has not been fitted to data.
- A word's readings come from `analyze` on the cut as a sentence of its own pieces; they follow the lexicon (seed-only lemmatization), so a word outside the 1,692-entry list has none even when `known` through a dictionary.
- Constructions: the lists are curated by part of speech and lemma from the detectors' own vocabulary; a listed id means "this word can take part in it", not that the selected sentence contains it (the card shows the detected ones from `detectPatterns`). The noun-to-classifier match is by English gloss against the classifier's `counts` text, so it misses nouns whose gloss differs (นก "bird" is counted with ตัว, which counts "animals, letters, clothes, furniture"; the word list records no link) and may name two classifiers.
- Tone: confidently-wrong rate of the tone rules is 0.82% after caps (docs/THAI_COURSE.md); unrelated to this lane, no pronunciation is produced here.
- Tests: `test/adapters/thai-paradigm.test.ts` (23 tests).
