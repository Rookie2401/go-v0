# Greek: audit on plain texts (no gold) — 2026-10-19

Texts: Perseus canonical-greekLit (CC BY-SA 4.0) and First1KGreek (CC BY-SA 4.0), `data/raw/audit-texts`; the first 4000 word tokens of each,
read sentence by sentence by adapter-el@1 with the full Koine, Ancient and Modern indexes installed. There is no independent gold
for these texts (the treebank audit, docs/greek/TREEBANK-AUDIT.md, has it for Homer, Plato's Euthyphro, Thucydides, Herodotus, Sophocles,
Polybius, Plutarch), so lemma and part-of-speech agreement are NOT stated here. "Covered" is a reading at all; "confident" a first reading not
marked unconfirmed (an elision restored by rule, a bare-letter fallback); "ambiguous" the covered tokens with several readings in the sentence's
period, which is the parser's missing work. Nothing was tuned on these texts.

| text | declared | word tokens | sentences | covered | confident first reading | ambiguous (of covered) | sentences read as (expected) |
|---|---|---|---|---|---|---|---|
| Aristotle, Nicomachean Ethics | — | 4015 | 169 | 93.3 % | 92.9 % | 61.6 % | el-att 145, el-koi 24 (el-att (Attic prose)) |
| Aristotle, Metaphysics | — | 4014 | 81 | 94.9 % | 94.7 % | 61.5 % | el-att 71, el-koi 9, el-hom 1 (el-att (Attic prose)) |
| Plato, Republic | — | 4034 | 300 | 94.3 % | 94.2 % | 58.7 % | el-att 235, el-koi 64, el-mod 1 (el-att (Attic prose)) |
| Marcus Aurelius, Meditations | — | 4032 | 121 | 87.7 % | 87.6 % | 56.1 % | el-att 99, el-koi 22 (el-koi (literary Koine; not told from Attic by vocabulary)) |
| Euclid, Elements | — | 4017 | 157 | 97.0 % | 86.3 % | 61.5 % | el-att 154, el-koi 3 (el-att / el-koi (Hellenistic technical prose)) |
| Archimedes, On the Sphere and Cylinder | — | 4012 | 138 | 94.0 % | 87.9 % | 63.2 % | el-att 132, el-koi 5, (none) 1 (el-dor forms inside el-att / el-koi prose (Doric)) |

## Uncovered forms and commonest lemmas, per text

### Aristotle, Nicomachean Ethics
- uncovered forms: ἰδέαν ×6, πρακτῶν ×4, ζητούμενον ×4, εὔλογον ×4, πειρατέον ×3, ἐπιζητεῖν ×3, διττῶς ×3, τελειότερον ×2, ὑποκειμένην ×2, πλάνην ×2, ἀποδέχεσθαι ×2, εὐδαιμονεῖν ×2, ὑγίειαν ×2, ἀρκτέον ×2, ἐοίκασιν ×2
- commonest first-reading lemmas: ὁ ×484, καί ×284, δέ ×196, οὗτος ×103, εἰμί ×92, γάρ ×90, τις ×79, ἀγαθός ×70, ἐν ×56, μέν ×54, αὐτός ×49, λέγω ×49

### Aristotle, Metaphysics
- uncovered forms: γνωρίζειν ×4, Πυθαγόρειοι ×3, τηνδὶ ×2, ὁποιανοῦν ×2, διαγωγὴν ×2, ζητοῦμεν ×2, ὑπηρετούσης ×2, τεθεωρηκόσι ×2, σωζομένης ×2, ὑγρὰν ×2, διαμένειν ×2, Κλαζομένιος ×2, μεταβάλλειν ×2, ἁψάμενοι ×2, τἀναντία ×2
- commonest first-reading lemmas: ὁ ×627, καί ×237, δέ ×136, οὗτος ×127, εἰμί ×118, μέν ×81, γάρ ×66, ὅς ×52, πᾶς ×47, αὐτός ×42, λέγω ×42, ἀρχή ×39

### Plato, Republic
- uncovered forms: Πολέμαρχε ×6, Σιμωνίδην ×5, ὀφειλόμενα ×4, ἀποδιδοῦσα ×4, Πολεμάρχου ×3, ἐπειδάν ×3, ἀποκρίνασθαι ×3, Γλαύκωνος ×2, ἐπειδὰν ×2, γηροτρόφος ×2, ἀπαιτοῖ ×2, ἀποδιδούς ×2, Σιμωνίδῃ ×2, ἀποδοτέον ×2, Δίʼ ×2
- commonest first-reading lemmas: ὁ ×369, καί ×205, εἰμί ×157, δέ ×118, ἐγώ ×86, οὗτος ×80, φημί ×68, ὅς ×66, λέγω ×62, τις ×58, αὐτός ×54, ἀλλά ×53

### Marcus Aurelius, Meditations
- uncovered forms: φαντασίαν ×4, χρῄζειν ×3, συγγράφειν ×2, ἐμπειρίαν ×2, φαντασίαις ×2, ὀλίγιστα ×2, εὐδοξίαν ×2, διατηρεῖν ×2, ἡγεμονικόν ×2, εἰκαιότητος ×2, δυσαρεστήσεως ×2, καθάπαξ ×2, ἐφιστάνειν ×2, τοσαυτάκις ×2, συμβαίνοντα ×2
- commonest first-reading lemmas: ὁ ×571, καί ×357, δέ ×75, αὐτός ×60, ἤ ×57, τις ×57, ὅς ×51, ἐν ×49, εἰμί ×49, οὗτος ×47, μή ×40, πᾶς ×39

### Euclid, Elements
- uncovered forms: ἰσόπλευρον ×11, διαστήματι ×7, ἐπεζεύχθω ×7, ὑποτείνουσιν ×6, ἀπεναντίον ×5, περιεχομένην ×4, πεπερασμένην ×3, πεπερασμένης ×3, ἐπεζεύχθωσαν ×3, κείσθω ×3, ἐφαρμόσουσι ×3, ἐπιπέδῳ ×2, ἐφεστηκυῖα ×2, ἰσόπλευρόν ×2, συνέσταται ×2
- commonest first-reading lemmas: ὁ ×763, ἴσος ×202, καί ×155, ὑπό ×148, εὐθύς ×133, εἰμί ×120, γωνία ×110, ἐπί ×98, δύο ×86, δέ ×84, ἔστιν ×63, ἑκάτερος ×60

### Archimedes, On the Sphere and Cylinder
- uncovered forms: κώνου ×22, ἐπιπέδῳ ×8, τομέως ×6, περιμέτρῳ ×6, ἐπεζεύχθωσαν ×6, συναμφότερος ×5, περιλειμμάτων ×5, ἐπειδὰν ×4, περιλαμβάνηται ×4, ἐπίταγμα ×4, περιγραφομένου ×4, ἐγγραφομένου ×4, περιγεγραμμένου ×3, συναμφότερον ×3, ἀπολείμματα ×3
- commonest first-reading lemmas: ὁ ×843, καί ×133, εἰμί ×119, δέ ×74, πρός ×73, τρίγωνος ×72, κύκλος ×65, αὐτός ×59, α ×51, ἐπί ×45, ἔχω ×41, Γ ×40

Reading the numbers: Attic prose (Aristotle, Plato) and literary Koine (Marcus Aurelius) are told apart by nothing in the vocabulary, so
Marcus reads as Attic unless the reader or the learner's target declares Koine (the card's period line says so). Euclid's technical prose
is read as Attic for the same reason. Archimedes writes Doric: the Doric forms (τᾶς, ἁ, ποτί, -ᾶν genitives) are either uncovered or
reached through an Attic reading; the period decision has no Doric vote (el-dor is a regional variety recognised on cards, not a period).
