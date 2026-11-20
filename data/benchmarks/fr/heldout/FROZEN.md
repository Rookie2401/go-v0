# Held-out French set: frozen

220 cases were written, checked against the kaikki.org extract (outcome in RESULT.md) and frozen BEFORE the analyser was run on them.
Not native-reviewed; every judgement is an AI's. The files below are not to be changed to suit the analyser.

| category | cases | core | advanced | file | sha256 |
|---|---|---|---|---|---|
| ambiguity | 25 | 10 | 15 | `ambiguity.json` | `435e38755a8e498f99628b07f78b34045b79abc5f3126787bbb0aa62317c2bb0` |
| compound-tenses | 25 | 16 | 9 | `compound-tenses.json` | `2b083eeabb21ff329f24e163884448e3cfe2f3a28c9f64ba29d7fc5cdad8a324` |
| literary | 30 | 21 | 9 | `literary.json` | `99b132d6182890fbd520fb246eb7155dc45ae5409cdc152db7131a3414de254d` |
| negation | 15 | 13 | 2 | `negation.json` | `5ee6cf85066c718798f25e4ce6540eb389144102b18b155c7d123284b9fe82d5` |
| nominal | 25 | 24 | 1 | `nominal.json` | `3b1dd24acca6f74083294a94fdca1a2378b6083a8f0a9209c12e2d8eac805783` |
| orthography | 20 | 19 | 1 | `orthography.json` | `0041aae82d8cd4d6d69cf9ceae638b863dd9f1da2c49ff240e5e111696c876f3` |
| pronouns | 25 | 21 | 4 | `pronouns.json` | `b6d698d99402c2aef097cfb9ee42da99dd491fabf4ea5648d16744c982ca3bd9` |
| relatives | 15 | 9 | 6 | `relatives.json` | `9a1cf670bedf2d090d0623480f1fc60541ced2a2e49abb2963d60011a5ae3648` |
| verbal | 40 | 32 | 8 | `verbal.json` | `987f8008ff17f5b3b04c903dc13c34e9fe2945d4874b6da5b29b70954ff83289` |
| total | 220 | 165 | 55 | | |

Composition: at least 60 sentences in present-day web style (61 counted: news, recipe, travel, product, forum), 49 literary-style
(Bible, public-domain authors, own literary sentences), 13 word-for-word Louis Segond 1910 verses (Genèse 1:1, 1:3, 1:27; Exode 20:3;
Psaume 23:1; Matthieu 5:3, 6:9, 7:7; Jean 1:1, 1:5, 3:16, 11:35 — the 13th is the second target on Genèse 1:3).

Dictionary check before the freeze (a scratch copy of scripts/fr-fixtures-check.mts pointed at this folder): 215 looked up; 199 confirmed,
12 confirmed through the masculine singular participle, 0 with a part of speech missing after one fix (h-pron-015: the extract lists tien as
an adjective, so ADJ was added to alsoAcceptPos before the freeze), 2 elided closed-class forms (n', m': the extract lists them as lemmas of
their own, as in the first set), 2 flagged "contradicted" and kept for reasons written in RESULT.md (h-comp-025 is a script artefact: the
extract does list enfuis as a masculine plural form; h-pron-020: the extract labels `on` plural, grammar and UD say singular agreement).
