# The full French lemma list

`src/adapters/french/lexicon-full-data.ts` (GENERATED) and `src/adapters/french/lexicon-full.ts` (loader and lookups).

## What it is

A list of every French lemma the dictionary extract holds, so that the engine's `knownLemma(lemma, pos)` can answer for almost every real word and
not only for the ~3,400 hand-listed ones. It holds, per lemma and part of speech:

- the lemma (as the extract writes it; proper names keep their capital);
- the part of speech: NOUN, VERB, ADJ, ADV, PROPN, INTJ;
- a noun's gender, only where the extract states it;
- three flags: `p` (pronominal-only verb), `o` (every real sense labelled obsolete / archaic / dated), `h` (aspirated h).

It holds NO meanings: no glosses, no definitions, no example text. A listed lemma confirms that a word exists in Wiktionary's French; it does not
say that this is the right reading in this sentence. The closed classes (prepositions, conjunctions, pronouns, determiners, numerals, phrases,
affixes, abbreviations, symbols, letters) are not in it: the hand list keeps them.

## Source and licence

kaikki.org French extract of Wiktionary, `data/dictionaries/kaikki.org-dictionary-French.jsonl`, dated 2026-10-30, 404,127 lines, sha256
`9053b1845fb3e045fa1fbe3f749122fa43e21b49bfa741cadd50255ae6ca0126` (the build refuses to run on any other file). Licence CC BY-SA 4.0.
Attribution: `Wiktionary, via kaikki.org — CC BY-SA 4.0` (in the generated file's header). The data file is a derived work: keep the header.

## Rebuild

```
npx vite-node --config scripts/vite.config.ts scripts/fr-build-lexicon.mts      # from the repository root, about 5 s
npx vitest run test/adapters/french-lexicon-full.test.ts
```

Deterministic: sorted, no timestamps; the same extract gives a byte-identical file. The generated file is never hand-edited.

## Counts (this extract)

| part of speech | lemmas |
|---|---|
| NOUN | 41,662 (m 22,887; f 16,253; both 2,435; none stated 87) |
| VERB | 7,575 |
| ADJ | 17,814 |
| ADV | 3,005 |
| PROPN | 8,289 |
| INTJ | 305 |
| total | 78,650 entries, 72,983 distinct normalized spellings |

Flags: `p` 37, `o` 865, `h` 415. File size 1,001,716 bytes (0.96 MiB). Parsing it takes about 45-65 ms on the build machine (Map of normalized
lemma to one 31-bit integer; no objects per entry).

## What was kept and what was skipped

A headword is kept when its part of speech is noun, verb, adj, adv, name or intj and at least one of its senses is REAL: not a `form_of` / `alt_of` pointer, not
tagged `form-of`, `alt-of`, `misspelling`, `pronunciation-spelling` or `error-misspelling`, and not a gloss such as "post-1990 spelling of …", "plural of …",
"feminine of …", "past participle of …", "alternative form of …". Skipped:

- 300,953 headwords with only pointer senses (inflected forms, most of the 246,872 verb lines, spelling variants);
- 19,988 headwords that are not one token as the tokenizer makes them: anything with a space (phrases, "se faire …"), digits, a trailing hyphen or apostrophe, an apostrophe
  outside `FRENCH_WHOLE_APOSTROPHE` (aujourd'hui, quelqu'un, presqu'île, prud'homme … are kept; "d'abord", "coup d'œil" are not);
- the other parts of speech (prep, conj, pron, det, num, phrase, prefix, suffix, contraction, character, symbol, proverb, article, particle …).

Obsolete, archaic and dated words are KEPT (older literature is a reading target) and flagged `o`. Words marked only misspelling or pronunciation spelling are dropped.

Pronominal headwords ("se souvenir", "s'évanouir") are stored under the bare infinitive (souvenir, évanouir). "s'en aller" and "s'y connaître" would
become the two-word "en aller" and are skipped (233 such headwords); the engine reaches aller by itself.

## Flags and how far to trust each

- Gender (`/m`, `/f`, `/b`): read from the head template (`fr-noun` first argument: m, f, mf, mfbysense, "m,f"; the `g` argument of generic head templates), else from
  the senses' tags masculine / feminine. `-p` and `-s` suffixes are stripped; "n", "gneut", "?" and "p" state no gender. Where a lemma has two noun entries of
  different gender, or the head says both, the union is `b` ("Fem,Masc"): livre (a book m., a pound f.), but also période, because the extract has période f (period)
  and a second période m ("point, locus"). `b` therefore means "the extract gives both", not "the word is epicene": a 2,435-lemma ambiguity the engine must not read
  as "either gender is fine". Reliable as a statement of what Wiktionary says; Wiktionary's own errors are inherited.
- `h` aspirated h: the extract marks it with the category "French terms with aspirated h" on the entry or on a sense (415 lemmas here: héros, haricot, hache, hamster,
  hobby, handicap, Honduras …). That marker is explicit, so the flag is not guessed from the spelling. It is only as complete as Wiktionary's categorisation:
  a word without the category is NOT shown to be non-aspirated.
- `p` pronominal-only verb: the lemma has a "se X" headword and no non-pronominal sense on the bare verb, or every real sense of the bare verb is tagged `pronominal`.
  Only 37 lemmas; most pronominal verbs also have an ordinary use and are not flagged. The flag is conservative: absent means "not shown to be pronominal-only".
- `o` dated: every real sense carries the tag obsolete, archaic or dated. A lemma with one current sense is not flagged. The tags are Wiktionary's.

## Lookups (`lexicon-full.ts`)

`loadFrenchLexicon()` (dynamic import of the data module, parsed once, a load in flight is shared, a failed load resets so a retry works), `frenchLexiconLoaded()`,
`fullLemma(lemma, pos?)`, `fullGender(lemma)`, `fullFlags(lemma, pos)`, `fullPosOf(lemma)`, `onFrenchLexiconLoaded(cb)`, `FR_FULL_SOURCE_ID`. Before the load every
lookup answers false / undefined, so analysis before the load sees the hand list only. Lookups compare by `normalizeFr` (case, typographic apostrophe, hyphen).
Gender is the noun's; `fullGender` ignores other parts of speech.

## Measurement for wiring (paragraphs written for this check, about 120 words each, three per language)

Share of word tokens with at least one reading with `lemmaKnown: true` from `analyzeFrenchForm`:

| text | full list only | hand list only | hand + full list |
|---|---|---|---|
| English | 21.7 % | 9.9 % | 21.7 % |
| Spanish | 28.3 % | 9.0 % | 28.3 % |
| Latin | 10.3 % | 5.2 % | 10.3 % |
| French | 67.4 % | 46.4 % | 67.4 % |

(`analyzeFrenchForm` does not answer for the closed-class words: every French miss was le, la, les, de, des, du, au, aux, et, à, que, qui, en, se, il, ne, trop, quand, ni, sa,
quelque, vous, deux, trois, quatre, avec, pour, encore, afin, ensuite, enfin, cette, où, l', d', s', n', qu', jusqu', which the adapter confirms from its function-word list.)
Through the adapter as it stands (hand list and closed classes confirmed, plus the engine with the full list) the shares are:

| text | confirmed share |
|---|---|
| English | 23.3 % (87 of 373) |
| Spanish | 46.2 % (170 of 368) |
| Latin | 19.5 % (34 of 174) |
| French | 100 % (384 of 384) |

The Spanish figure is high because Spanish and French share closed-class words (de, la, el, en, se, a, no, me, y …). English reads as French on about a fifth of its tokens:
a, on, for, are, does, legs, part, place, put, table, about, base, budget, bus, but, came, case, chair, changes, check, contact, districts, do, fit, foot, force, four, front,
full, grooves, hand, house, important, instructions, light, long, loose, maria, meeting. A 45 % threshold separates French from these three languages on this sample with a wide
margin; a short English headline of borrowings (football, week-end, table, simple, page) will score higher than prose, so the decision should also use the share of words
that are ONLY French (not closed-class words of other languages).

## Honest limits

- Coverage and errors are Wiktionary's: a word it lacks is missing, a mistaken gender or part of speech is inherited, and entries for borrowings from English (football, weekend, budget, bus)
  are real French lemmas.
- A listed lemma confirms that a word exists, not that the reading is right here: `porte` is a noun and a form of `porter`, and both stay readings.
- Regional or slang-only senses count as real senses; the list does not say which variety a lemma belongs to.
- Proper names are case-folded by lookups: "paris" matches the PROPN "Paris". Ask with the PROPN part of speech if the capital matters.
- Lemmas with a digit, a space, or a stray symbol are not in it, because the tokenizer would not produce them as one word.
