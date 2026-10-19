# Greek: audit against the Perseus treebank — 2026-10-19

Independent gold: the Ancient Greek Dependency Treebank 2.1 (Perseus, CC BY-SA 3.0; `data/raw/perseus-treebank`). For each text the first
3000 tokens were read sentence by sentence by adapter-el@1 with the full Koine, Ancient and Modern indexes installed; the adapter's
FIRST reading is compared with the treebank's lemma (accents folded; the treebank's homograph numbers dropped) and part of speech (its tagset
mapped to UPOS; a name counts as a noun, an article as a determiner or pronoun). There is no parser: a form with several readings in the
chosen period keeps them all and the commonest-attested one is first, so "lemma" here is the first-reading figure of a dictionary lookup
ordered by attestation, not a disambiguation result. Nothing was tuned on these texts.

| text | tokens | covered | lemma = gold | POS = gold | both | sentences read as (expected `period`) |
|---|---|---|---|---|---|---|
| Homer, Iliad | 3005 | 95.0 % | 81.4 % | 76.1 % | 67.8 % | el-hom 181, el-att 51, el-koi 1 (el-hom) |
| Homer, Odyssey | 3006 | 93.5 % | 79.7 % | 75.5 % | 68.1 % | el-hom 165, el-att 65 (el-hom) |
| Plato, Euthyphro | 3001 | 94.8 % | 85.2 % | 74.8 % | 70.8 % | el-att 173, el-koi 51, el-hom 2, el-mod 1 (el-att) |
| Thucydides, Histories 1 | 3017 | 100.0 % | 91.2 % | 79.4 % | 73.2 % | el-att 120, el-koi 6, el-hom 1 (el-att) |
| Herodotus, Histories 1 (Ionic) | 3014 | 86.6 % | 75.0 % | 67.8 % | 59.3 % | el-att 92, el-hom 63, el-koi 7 (el-att) |
| Sophocles, Oedipus Tyrannus | 3005 | 89.3 % | 77.9 % | 70.2 % | 64.9 % | el-att 274, el-koi 18, el-hom 12 (el-att) |
| Polybius, Histories 1 (Hellenistic Koine) | 3016 | 89.2 % | 81.2 % | 71.5 % | 66.4 % | el-att 103, el-koi 11 (el-att or el-koi: not told apart by vocabulary) |
| Plutarch, Alcibiades (literary Koine) | 3003 | 89.2 % | 81.9 % | 71.4 % | 66.3 % | el-att 135, el-koi 11, el-hom 1 (el-att or el-koi: not told apart by vocabulary) |

## Commonest disagreements (first reading ≠ treebank lemma) and uncovered forms, per text

### Homer, Iliad
- 14× ὣς: got ὅς (PRON), gold ὡς (ADV)
- 12× ἦ: got ἠμί (VERB), gold ἦ (ADV)
- 12× αὐτὰρ: got αὐτάρ (CONJ), gold ἀτάρ (PART)
- 11× ὃ: got ὅς (PRON), gold ὁ (PRON)
- 11× οἱ: got ὁ (PRON), gold ἕ (PRON)
- 10× ἀλλ̓: got ἄλλος (ADJ), gold ἀλλά (ADV)
- 10× μιν: got οὗ (PRON), gold μιν (PRON)
- 10× ὅ: got ὅς (PRON), gold ὁ (PRON)
- 8× περ: got περί (ADP), gold πέρ (PART)
- 6× οἳ: got ὅς (PRON), gold ὁ (PRON)
- 5× ἠδ̓: got ὅδε (PRON), gold ἠδέ (CONJ)
- 5× ἄγε: got ἄγω (VERB), gold ἄγε (ADV)
- skipped sentences (token count mismatch): 39

### Homer, Odyssey
- 14× οἱ: got ὁ (PRON), gold ἕ (PRON)
- 13× αὐτὰρ: got αὐτάρ (CONJ), gold ἀτάρ (PART)
- 12× ἦ: got ἠμί (VERB), gold ἦ (ADV)
- 10× μιν: got οὗ (PRON), gold μιν (PRON)
- 8× περ: got περί (ADP), gold πέρ (PART)
- 7× ὣς: got ὅς (PRON), gold ὡς (ADV)
- 7× ἀλλ̓: got ἄλλος (ADJ), gold ἀλλά (ADV)
- 6× γ̓: got γῆ (NOUN), gold γε (PART)
- 6× ἐν: got ἐν (ADP), gold εἰς (ADP)
- 6× αἰεὶ: got αἰεί (ADV), gold ἀεί (ADV)
- 6× ἠδ̓: got ὅδε (PRON), gold ἠδέ (CONJ)
- 6× ἄγε: got ἄγω (VERB), gold ἄγε (ADV)
- skipped sentences (token count mismatch): 32

### Plato, Euthyphro
- 54× ὦ: got εἰμί (VERB), gold ὦ (INTJ)
- 22× ὡς: got ὅς (PRON), gold ὡς (CONJ)
- 10× ὀρθῶς: got ὀρθῶς (ADV), gold ὀρθός (ADV)
- 8× ὅτι: got ὅτι (CONJ), gold ὅστις (PRON)
- 8× οὕτω: got οὗτος (DET), gold οὕτως (ADV)
- 7× ∅ θεοφιλὲς (θεοφιλής)
- 5× ὡς: got ὅς (PRON), gold ὡς (ADV)
- 5× δεῖ: got δέω (VERB), gold δεῖ (VERB)
- 5× ἡμῖν: got ἡμεῖς (PRON), gold ἐγώ (PRON)
- 5× ἐστίν: got ἔστιν (VERB), gold εἰμί (VERB)
- 5× ἐστὶν: got ἔστιν (VERB), gold εἰμί (VERB)
- 5× ἡμῶν: got ἡμεῖς (PRON), gold ἐγώ (PRON)
- skipped sentences (token count mismatch): 181

### Thucydides, Histories 1
- 11× ὡς: got ὅς (PRON), gold ὡς (ADV)
- 8× οἵ: got ὅς (PRON), gold ὁ (DET)
- 7× ὄντες: got ὤν (VERB), gold εἰμί (VERB)
- 6× ὡς: got ὅς (PRON), gold ὡς (CONJ)
- 6× ἐν: got ἐν (ADP), gold εἰς (ADP)
- 5× Ἀθηναίων: got Ἀθήναιον (NOUN), gold Ἀθήναιος (NOUN)
- 5× ἔχοντες: got ἔχων (VERB), gold ἔχω (VERB)
- 5× νήσων: got νέω (VERB), gold νῆσος (NOUN)
- 4× οὖσαν: got ὤν (VERB), gold εἰμί (VERB)
- 4× ἐπειδὴ: got ἐπειδή (CONJ), gold ἐπεί (CONJ)
- 4× ὄντα: got ὤν (VERB), gold εἰμί (VERB)
- 4× σφίσιν: got οὗ (PRON), gold σφεῖς (PRON)
- skipped sentences (token count mismatch): 23

### Herodotus, Histories 1 (Ionic)
- 22× ὡς: got ὅς (PRON), gold ὡς (CONJ)
- 20× ἐν: got ἐν (ADP), gold εἰς (ADP)
- 10× ὃ: got ὅς (PRON), gold ὁ (DET)
- 8× οὕτω: got οὗτος (DET), gold οὕτως (ADV)
- 8× μιν: got οὗ (PRON), gold μιν (PRON)
- 7× σφι: got οὗ (PRON), gold σφεῖς (PRON)
- 6× οἱ: got ὁ (PRON), gold ἕ (PRON)
- 5× εἵνεκεν: got εἵνεκεν (ADP), gold ἕνεκα (ADP)
- 5× ἀλλ̓: got ἄλλος (ADJ), gold ἀλλά (CONJ)
- 5× ἐόντα: got ἐών (VERB), gold εἰμί (VERB)
- 4× τὰ: got ὁ (DET), gold ὅς (PRON)
- 4× ἐγένετο: got γίνομαι (VERB), gold γίγνομαι (VERB)
- skipped sentences (token count mismatch): 47

### Sophocles, Oedipus Tyrannus
- 19× οὔ: got οὔ (PART), gold οὔτε (ADV)
- 16× οὐ: got οὐ (PART), gold οὐδέ (PART)
- 15× ὦ: got εἰμί (VERB), gold ὦ (INTJ)
- 13× μ̓: got μά (PART), gold ἐγώ (PRON)
- 9× ὡς: got ὅς (PRON), gold ὡς (ADV)
- 7× ὡς: got ὅς (PRON), gold ὡς (CONJ)
- 7× πῶς: got πούς (NOUN), gold πῶς (ADV)
- 6× εὖ: got ἀγαθός (ADJ), gold εὖ (ADV)
- 6× νιν: got οὗ (PRON), gold νιν (PRON)
- 5× τόδ̓: got τόδε (ADV), gold ὅδε (PRON)
- 4× τάδ̓: got τάδε (ADV), gold ὅδε (PRON)
- 4× οἶσθ̓: got ἵημι (VERB), gold οἶδα (VERB)
- skipped sentences (token count mismatch): 143

### Polybius, Histories 1 (Hellenistic Koine)
- 9× ἐν: got ἐν (ADP), gold εἰς (ADP)
- 5× ὡς: got ὅς (PRON), gold ὡς (CONJ)
- 5× ἡμῖν: got ἡμεῖς (PRON), gold ἐγώ (PRON)
- 5× οὕτως: got οὗτος (DET), gold οὕτως (ADV)
- 5× αὑτῶν: got αὑτοῦ (PRON), gold ἑαυτοῦ (PRON)
- 5× καθ̓: got καθά (ADV), gold κατά (ADP)
- 5× γενόμενοι: got γενόμενος (VERB), gold γίγνομαι (VERB)
- 5× Συρακοσίων: got Σῠρᾱκόσῐος (ADJ), gold Συρακούσιος (NOUN)
- 4× ἀναγκαῖον: got ἀναγκαῖος (ADJ), gold ἀναγκαῖον (NOUN)
- 4× αὑτοῖς: got αὑτοῦ (PRON), gold ἑαυτοῦ (PRON)
- 4× Καρχηδονίοις: got Καρχηδόνιος (ADJ), gold Καρχηδών (NOUN)
- 4× γίνεσθαι: got γίνομαι (VERB), gold γίγνομαι (VERB)
- skipped sentences (token count mismatch): 15

### Plutarch, Alcibiades (literary Koine)
- 13× ὡς: got ὅς (PRON), gold ὡς (CONJ)
- 8× Ἀθηναίοις: got Ἀθήναιον (NOUN), gold Ἀθήναιος (NOUN)
- 7× ὡς: got ὅς (PRON), gold ὡς (ADV)
- 4× οὖσαν: got ὤν (VERB), gold εἰμί (VERB)
- 4× Ἀθηναίων: got Ἀθήναιον (NOUN), gold Ἀθήναιος (NOUN)
- 3× ἴσως: got ἴσος (ADJ), gold ἴσως (ADV)
- 3× δεῖ: got δέω (VERB), gold δεῖ (VERB)
- 3× ἐν: got ἐν (ADP), gold εἰς (ADP)
- 3× οὕτως: got οὗτος (DET), gold οὕτως (ADV)
- 3× ἐστίν: got ἔστιν (VERB), gold εἰμί (VERB)
- 3× κ-: got κ (NOUN), gold καί (ADV)
- 3× οὕτω: got οὗτος (DET), gold οὕτως (ADV)
- skipped sentences (token count mismatch): 33

Reading the numbers: "covered" is what the indexes hold for the written form; a Homeric form absent from every Wiktionary table (dialectal
spellings, rare compounds, proper names) is uncovered and gets NO reading. A lemma disagreement is often a true homograph the sentence does
not decide (ἦ, ἥ, ἡ; τε; οἱ), a differently cited lemma (the treebank's εἰμί1 vs εἰμί, Wiktionary's citation of a deponent), or a name read as a
common noun; each kind is visible in the lists above. POS agreement is reported separately because it is what the card's Form line states.
