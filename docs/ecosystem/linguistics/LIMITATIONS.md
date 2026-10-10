# Known linguistic limitations (Linguistic Engine V2, 2026-10-10)

What the engine does not do, does badly, or cannot vouch for. Each line names where the gap is measured or documented. No
native speaker has reviewed any linguistic content in this repository; "verified" on the card means two machine sources
agree, and the Repository reserves `verified` for a named reviewer.

## Across languages

- **Word lists are small** (1,350–3,860 lexemes); on held-out text the analysers give no reading for 5–16 % of words
  (COVERAGE-AUDIT.md §3, GOLD-REPORT: th dev 32 no-reading cases). The dictionaries carry the lexical load; the word lists
  carry the morphology, so a lemma outside the word list gets the dictionary's table alone (unverified by rules) or none.
- **AI-judged gold.** Every gold label (selections, hard cases, unseen, syntax) was written by a model and never checked by a
  person; the reported accuracies are agreement with that annotator, and some of the error classes are convention
  disagreements (AUX vs VERB, article lemma, particle vs adverb) rather than engine errors (GOLD-SETS.md, GOLD-REPORT).
- **Engine bugs found by the paradigm cross-checks are not fixed**, because a fix changes analysis output and bumps an adapter
  version pinned in tests outside the lanes (MORPHOLOGY.md "Engine bugs found", PARADIGMS-*.md).
- **Syntax is shallow and rule-based**: one clause level, no long-distance dependencies, ellipsis or non-projective order;
  relations are `generated`, never verified; sentences over 120 tokens get no syntax (SYNTAX.md, SYNTAX-*.md).
- **Word structure is mostly a heuristic stem/ending** on running text (10–40 % availability; dictionary templates give parts
  for only 0.5–10 % of selections); template parts are not checked to add up to the lemma (ETYMOLOGY.md).
- **Etymology is only what Wiktionary says**, in English, with its own gaps and disputed cases; language names are mapped for
  ~200 codes, rarer codes stay as codes.
- **Pronunciation**: IPA is one standard's transcription; recordings are unreviewed volunteer files, listed, not played;
  synthetic voices are practice, not evidence (GOLISTEN.md).
- **Hosting**: the full-record shards for German (409 MB) and Spanish (244 MB) are too large to publish as they are;
  until the owner decides (exclude, or shrink with a tag table), Level 2 for those languages works only from a local build
  or a configured service (SOURCE-INVENTORY.md).
- **Repository**: the resolver does not yet call `adapter.syntax()` or `paradigm()` itself; those field states stay `unknown`
  unless the caller passes `fieldEvidence`; the lexeme unit does not store `etymology`; no pack marks `unreviewableFields`;
  the GoReview validation queue is a sorted list with reasons, not a screen (REPOSITORY-STATES.md).

## Albanian (sq)

- Linking articles (i/e/të/së) are sometimes read as a separate adjective or article; `jam`/`mund` POS differs from the
  annotator (VERB vs AUX); the clitic `u` can be read as a particle (GOLD-REPORT).
- Wiktionary's template-generated noun tables are sometimes wrong, so a `conflicted` cell may be the dictionary's fault
  (PARADIGMS-sq.md); 570 conflicted cells of 146,000.
- Verbs outside the word list get a guessed paradigm marked as such.
- Full records carry IPA for only 4,954 of 14,471 lemmas and audio for 87.

## Spanish (es)

- No syntax rules yet at the time of the gold report (`syntax n/a`); role given on 0 % of readings before Stage 4.
- The reader rules treat unlisted stem-changing verbs as regular (ventar, soldar, asentir: 205 of the 288 conflicting verbs);
  `accentLast` re-accents reír/freír/sonreír; `huir` lacks the monosyllable rule; borrowed-word plurals (banners) conflict
  with the dictionary (PARADIGMS-es.md).
- Archaic Scripture vocabulary (RV1909) and proper names are the main unseen-set errors; articles `los/las` are lemmatised to
  the form, not to `el`.
- Wiktionary's `reírse` table is built on the wrong template; the engine is right there.

## German (de)

- The word list holds about 2,900 nouns and adjectives, so most dictionary tables show as `supported` only.
- Guessed separable verbs with prefixes outside `PREFIXES` (rum-, rad-, fehl-, runter-) conflict with the dictionary
  (8.2 % of guessed-verb cells); `superlativeOf` writes `am spannendesten`; Konjunktiv II umlauts the prefix of unter-/über-
  verbs (PARADIGMS-de.md).
- Separable-verb lemmas on the gold set disagree with the annotator (`singt` → `mitsingen`; stranded `hin`/`zurück`).
- Two kaikki table tags are unmapped on determiners (`possessive`, `error-unrecognized-form`).

## Hindi (hi)

- Compound-verb vectors (`दिया`, `चुका`, `लो`) are read as VERB where the annotator wants AUX, and `हुई` the reverse; fused
  pronoun-genitives (`उसका`) are DET for the annotator (GOLD-REPORT).
- Verbs with a stem in -ी (पीना, जीना, सीना) write पिऊँ where the dictionary has पियूँ (unfixed); the dictionary itself declines
  some feminine nouns as masculine and some invariable -ा words (PARADIGMS-hi.md).
- A simple-future table row has the same tags as the perfect-plus-future construction row, so the table mapper needs the
  form (`featuresFromTableTags(tags, pos, form)`); a row shared by several persons verifies only its first cell on the card.
- The adapter generates no singular vocative; Hindi registers are shown as notes only.

## Thai (th)

- No inflection: the paradigm section shows constructions and segmentation alternatives instead; 32 construction ids have
  no pack explanation yet (PARADIGMS-th.md).
- Segmentation is the weakest point: compounds, names and traps (ของเล่น, เชียงใหม่, แม่น้ำ) get no reading; `ตากลม` is cut
  ตา|กลม; the annotator's word equals one engine token only 91 % of the time; segmentation exact match 50 % on the small
  hard subset (GOLD-REPORT).
- POS of function words (นั้น, ที่, ให้) disagrees with the annotator; feature recall is 0 by design (no features).
- Thai full records have forms for 8,100 lemmas (classifier and variant lists, not inflection).

## Norwegian (nb / nn)

- **No dictionary on disk**: no senses, etymology, IPA or table; every paradigm cell is `generated`; Level 2 is honestly
  "unavailable" apart from the generated table (PARADIGMS-nb-nn.md).
- The corpus is 21 sentences per standard, so the gold sets lean on the holdout and the older gold data; nn has 15 distinct
  unseen sentences and its numbers are noisy.
- Particle verbs take the unit lemma (`står` → `stå opp`), homographs pick the wrong verb, the s-passive and irregular
  comparatives (sees, færre) are missing; Nynorsk verb-class lemma variants (segjer → seie vs segje) are the largest dev error.
- Adjectives with two plural forms (liten: små, lille) are offered in both cells with a note; no present participle cells.
- The nb verb list has a placeholder row (`nei-/1`).
