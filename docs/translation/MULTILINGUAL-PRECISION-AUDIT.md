# Multilingual precision audit: hi, es, de, th, nb, nn

**Audit date:** 2026-10-10  
**Scope:** repository-owned language-pack manifests and analyzer inventories, plus translation request handling. This is an inventory and risk review, not linguistic certification.

## Findings

All six packs declare `machine-drafted` review status. The Hindi, Spanish, German and Thai packs declare bundled Kaikki/Wiktionary dictionaries dated 2026-09-28 (38,635; 808,278; 357,750; and 20,254 records respectively), with CC BY-SA 4.0 attribution in the manifest. These are declared upstream dictionary totals, not counts of records actually loaded into the adapter’s hand-built seed lexicons. Bokmål and Nynorsk declare no bundled dictionary. Their adapters use separate seed lexicons and separate language IDs; the two standards are not treated as interchangeable.

The adapter seed inventories expose the following counts:

| Language | Adapter | Local seed inventory | Phrase/construction inventory | Gloss / parse audit |
|---|---:|---|---|---|
| Hindi (`hi`) | v6 | 2,974 lemmas | 762 phrase entries; 50 construction explanations and 2 ubiquitous construction rules | 0 missing glosses; 0 reported parse problems |
| Spanish (`es`) | v12 | 1,812 lemmas | 189 phrase units; 24 construction patterns | 0 missing glosses; 0 reported parse problems |
| German (`de`) | v9 | 1,476 nouns, 890 verbs, 358 adjectives, 274 closed forms, 865 plain words; 27 course-list rows differ from main-list rows | 213 phrase rules; 38 construction keys | 0 missing glosses among noun/verb/adjective records; all 38 keys have explanations |
| Thai (`th`) | v5 | 1,692 lexemes | 65 phrase units; 28 construction rules | 0 missing glosses |
| Bokmål (`nb`) | v2 | 844 nouns, 347 verbs, 235 adjectives, 293 words; 71 names; 6,601 generated forms | 3 phrase rules; 16 shared construction explanations | No bundled dictionary |
| Nynorsk (`nn`) | v2 | 261 nouns, 125 verbs, 108 adjectives, 208 words; 23 names; 2,438 generated forms | 3 phrase rules; 16 shared construction explanations | No bundled dictionary |

“Missing gloss” only measures whether a local entry has a non-empty gloss. It does not validate whether the gloss is accurate, complete, idiomatic, current, or appropriate to a dialect. The German duplicate count is a script-reported difference between course rows and main-list rows, not a judgment that either form is incorrect.

Each manifest has 14 validation cases, except Spanish with 17. Their top readings collectively surface more morphology than the short learner-facing feature tables explain. In these validation cases, Hindi surfaces 7 feature types outside its 2 declared feature definitions (Aspect, Mood, Number, Person, PronType, Tense, VerbForm); Spanish surfaces 4 outside 6 (Case, Definite, Poss, PronType); German surfaces 7 outside 2 (Definite, Mood, Number, Person, PronType, Tense, VerbForm); and each Norwegian standard surfaces 9 outside 3 (Case, Degree, Mood, NumType, Number, Person, Polarity, PronType, VerbForm). Thai declares one classifier feature and the selected validation readings expose no morphology features, matching its manifest’s characterization; Thai phrase segmentation remains limited. This is a count of observed top-reading feature keys, not a claim that every feature is correctly analyzed or should be taught in the pack.

The analyzed examples reveal useful high-risk coverage areas without proving broad linguistic correctness: Hindi ergative `ने` and ambiguous readings; Spanish Honduran `vos`/`tenés`, subjunctive, clitics and contraction; German separable verbs and unresolved nominative/accusative ambiguity; Thai unspaced segmentation and classifier constructions; and Norwegian definite forms, gender variation, participles, particle verbs, and distinct Bokmål/Nynorsk forms. The pack source itself warns that seed vocabularies, rules, and short validation fixtures are machine-drafted and not measured against held-out running prose.

The extension has a separate local translation service with pinned source-to-English model snapshots for all six language tags; setup installs those model files outside the extension bundle. Hindi, Spanish, German, and Thai use direct models. Bokmål (`nb`) and Nynorsk (`nn`) keep distinct request tags but share the pinned tc-big-gmq-en North Germanic model, which lists `nob` and `nno`; this does not guarantee that its output distinguishes the two varieties. The generic browser provider also uses the runtime Translator API when available. The separate model catalog and reader audit document setup, revisions, and brief generated smoke checks. This inventory audit did not run an independent semantic evaluation or native-reviewed scoring, so it cannot establish fidelity, agreement, register, dialect handling, or target fluency.

## Limits and follow-up

No native-speaker review is represented by these counts. No independent test corpus or held-out evaluation set is present in this audit. The large upstream dictionary totals must not be read as adapter coverage: the analyzer operates on much smaller hand-authored seeds, and source-language translation quality depends on the runtime model, not on the analysis seed alone. The Spanish variety inventory includes a few tagged regional forms but is not a comprehensive dialect map. The Norwegian inventories are uneven in size by design and neither is a general-purpose full lexicon. Thai’s lack of spaces makes segmentation errors consequential; the listed phrase count does not measure segmentation accuracy.

A defensible next quality step is to obtain permissioned, native-reviewed evaluation sentences for each target variety and score the actual provider/model output separately from analyzer coverage. The grammar-facing feature tables could also be compared against frequently surfaced morphology, but the raw mismatch counts above are audit signals, not a validated list of missing lessons.

## Reproduction and checks

The inventory is generated by `scripts/multilingual-precision-audit.mts`, which reads manifests, adapters and rule catalogues without importing large external corpus files. Run:

```text
npx vite-node --config scripts/vite.config.ts scripts/multilingual-precision-audit.mts
```

Relevant validation run for this audit:

```text
npx vitest run test/adapters test/language-packs/registry.test.ts test/language-packs/capabilities.test.ts test/reader-languages/hi.test.ts test/reader-languages/es.test.ts test/reader-languages/de.test.ts test/reader-languages/th.test.ts test/reader-languages/nb.test.ts test/reader-languages/nn.test.ts test/extension/translation.provider.test.ts test/extension/translation.localProvider.test.ts
```

Result: 112 test files, 5,364 tests passed. `npm run typecheck` passed. These fixtures and unit tests are repository-authored and should not be described as independent linguistic validation.




