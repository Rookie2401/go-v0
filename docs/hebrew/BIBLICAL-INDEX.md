# Biblical Hebrew form index — build of 2026-10-19

Built by `npm run he:build-biblical` from the Biblia app's shipped data (`C:/Users/CJWal/dev/biblia-v0`): the Miqra according to the Masorah text
(CC BY-SA 4.0, via Sefaria, fetched 2026-09-20) aligned with the Open Scriptures Hebrew Bible morphology
(CC BY 4.0); glosses from Biblia's lexicon shards (BDB, Strong's, Open Scriptures index — public domain). Every row is the
source's reading of that word in the Bible; nothing here was analysed by this repository.

| measure | value |
|---|---|
| books / verses / tokens | 39 / 23,206 / 305,452 |
| tokens Biblia could not align (skipped) | 143 |
| Aramaic tokens (tagged arc-bib) | 4,821 |
| distinct pointed forms (cantillation removed) | 52,687 |
| readings (form × lemma × code) | 56,967 |
| forms with more than one reading | 3,433 |
| lemmas read in the text | 9,200 (5 without a lexicon entry, so without a gloss) |
| segmentation strings that did not fit the pointed form | 604 |
| full index size | 5.1 MB (public/lexicon/he/biblical-index.json, git-ignored) |
| core compiled into the adapter | 441 lemmas, 6,994 forms, 7,482 readings, 67.7 % of aligned tokens, 605 kB |

Tokens by part of speech (corpus majority per lemma mapped from the OSHB code): NOUN 111,847, VERB 73,667, PROPN 33,879, ADP 24,427, PART 22,578, ADJ 7,951, PRON 7,766, NUM 6,389, CONJ 6,376, SCONJ 5,802, ADV 4,297, INTJ 329, DET 1.
