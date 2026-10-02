# Albanian gold set: file format

Files here are `*.jsonl`: one JSON object per line, UTF-8, text in NFC. **There is no reviewed item yet.** This
directory holds only this schema until a native reviewer has accepted sentences with `npm run sq:gold -- accept`.
Code: `src/bench/sq/gold.ts` (validator, status, check), `scripts/sq-gold.mts` (command line).

## One item

```json
{
  "id": "sq-negation-1a2b3c4d",
  "text": "Nuk e di.",
  "variety": "sq",
  "categories": ["negation", "clitic"],
  "tokens": [
    { "form": "Nuk", "start": 0, "end": 3, "lemma": "nuk", "upos": "PART", "feats": {} },
    { "form": "e", "start": 4, "end": 5, "lemma": "e", "upos": "PRON", "feats": { "Clitic": "Yes" } },
    { "form": "di", "start": 6, "end": 8, "lemma": "di", "upos": "VERB",
      "feats": { "Mood": "Ind", "Number": "Sing", "Person": "1", "Tense": "Pres", "VerbForm": "Fin", "Voice": "Act" } }
  ],
  "source": { "kind": "reviewer-written" },
  "review": { "status": "native-reviewed", "reviewer": "<name>", "reviewedAt": "2026-10-01", "note": "..." },
  "analysisVersion": "<adapter name>@<version>",
  "createdAt": "2026-10-01T09:00:00.000Z"
}
```

(The example shows the shape only; it is not an item of the gold set and its analysis has not been reviewed by anyone.
A token that is several grammatical words, such as `ta`, carries `"parts": [{ "form": "...", "lemma": "...", "upos": "..." }, ...]`.)

| field | meaning |
|---|---|
| `id` | unique across all files (a draft gets `sq-<category>-<hash of the text>`) |
| `text` | the sentence, NFC |
| `variety` | `sq` Standard Albanian, `aln` Gheg, ... |
| `categories` | keys from the list below; the FIRST is the primary category, the one a target counts |
| `tokens` | the words of the sentence in order. `text.slice(start, end) === form`, offsets ascending and not overlapping. Punctuation and numerals may be listed (UPOS `PUNCT`, `NUM`) but the check ignores a token with no letter. |
| `tokens[].lemma` | the lemma convention of `src/adapters/albanian/types.ts` (a verb under the first person singular present, a noun under the indefinite nominative singular, an adjective without its article) |
| `tokens[].upos` | a Universal Dependencies UPOS tag |
| `tokens[].feats` | the feature names and values of `types.ts` (Case, Number, Gender, Definite, Person, Tense, Mood, Voice, VerbForm, PronType, Poss, Degree, Clitic ...). In a reviewed item every value is decided: no comma union; leave out a feature the form does not show. |
| `tokens[].parts` | for one written token that is several grammatical words (`ta` = `të` + `e`; `t'i`; `s'ka`): the words in order, each `{ form, lemma, upos }`; at least two |
| `source.kind` | `course-authored`, `reviewer-written`, `learner-import` or `treebank-derived` |
| `source.ref`, `source.licence` | a `treebank-derived` item MUST carry both; such an item is never `course-authored` (a source that names a treebank cannot be marked course-authored) |
| `review.status` | `draft`, `native-reviewed`, `approved` or `rejected` |
| `review.reviewer`, `review.reviewedAt` | required (a name, a date) for `native-reviewed` and `approved` |
| `review.draftDigest` | on a draft only: a digest of the machine's tokens, so that an unedited draft cannot be accepted without `--confirm-unchanged` |
| `analysisVersion` | the adapter that wrote the draft (`name@version`) |
| `createdAt` | ISO date-time |

## Categories and targets

An item counts toward its **first** category; further categories are tags (shown in `status`, not counted). The
targets add up to 1,500 sentences, inside the intended 1,000-2,000. Only `native-reviewed` and `approved` items count.

| category | target | | category | target |
|---|---:|---|---|---:|
| noun-paradigm | 120 | | negation | 80 |
| definiteness | 100 | | linking-article | 120 |
| case | 120 | | pronoun | 90 |
| plural | 90 | | subordinate-clause | 90 |
| irregular-verb | 120 | | tokenization | 70 |
| tense-mood-voice | 140 | | apostrophe | 50 |
| clitic | 100 | | dialect | 50 |
| clitic-cluster | 80 | | clitic-doubling | 80 |
| | | | **total** | **1,500** |

## Workflow

1. `npm run sq:gold -- draft --in sentences.txt --category clitic` writes DRAFT items from the adapter's own analysis. A
   draft is the machine's opinion; it is evidence of nothing.
2. A native reviewer corrects the tokens in the file (lemma, UPOS, features, parts), and may add a `review.note`.
3. `npm run sq:gold -- accept --id <id> --by "<name>"` sets `native-reviewed`, the reviewer and the date. It refuses
   without `--by`, refuses an item the validator rejects, and refuses a draft whose tokens are exactly the machine's
   unless `--confirm-unchanged` says the machine was right. It records the reviewer's word; it cannot check it.
4. `npm run sq:gold -- check` compares the adapter with the reviewed items only. With none it says so and checks nothing.
