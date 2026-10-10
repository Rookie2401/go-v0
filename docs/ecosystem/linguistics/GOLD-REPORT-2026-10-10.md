# Gold report (Linguistic Engine V2, Stage 8) — 2026-10-10

Scorer: `scripts/gold-score.mts`. Gold files: `data/gold/<lang>/{selections-dev,hard,unseen}.json`. See `GOLD-SETS.md` for the definitions.
**Every gold label was written by an AI model (Claude) and has not been checked by a native speaker: these figures are agreement with an AI annotator, not correctness.**

### dev

| metric | sq | es | de | hi | th | nb | nn |
|---|---|---|---|---|---|---|---|
| items scored (of file) | 215 (215) | 215 (215) | 215 (215) | 215 (215) | 214 (214) | 215 (215) | 215 (215) |
| lemma accuracy | 94.9% | 95.8% | 96.3% | 94.9% | 84.6% | 96.7% | 87.0% |
| POS accuracy | 89.3% | 94.0% | 97.2% | 90.7% | 73.8% | 99.1% | 95.8% |
| feature precision | 85.5% | 84.5% | 77.6% | 87.2% | n/a | 65.8% | 81.3% |
| feature recall | 86.6% | 96.2% | 87.3% | 77.7% | 0.0% | 89.9% | 90.8% |
| feature F1 | 86.1% | 90.0% | 82.1% | 82.2% | n/a | 76.0% | 85.8% |
| role / relation accuracy | syntax 86.0% (n=214); role 65.0% (n=20, given on 98%) | syntax n/a; role given on 0%, none mappable | syntax 74.0% (n=215); role 60.0% (n=20, given on 93%) | syntax 75.3% (n=215); role 32.3% (n=31, given on 100%) | syntax 76.9% (n=195); role 36.4% (n=22, given on 82%); UAS 13.3% LAS 12.2% (n=384) | syntax 93.5% (n=215); role 80.0% (n=30, given on 100%); UAS 99.1% LAS 98.4% (n=317) | syntax 92.6% (n=215); role 83.7% (n=43, given on 97%); UAS 96.4% LAS 95.7% (n=277) |
| paradigm round-trip share | 89.1% (98/150 lemmas, 2254 cells) | 98.3% (103/150 lemmas, 2795 cells) | 95.7% (102/150 lemmas, 2910 cells) | 80.5% (117/150 lemmas, 2718 cells) | n/a | 97.7% (102/150 lemmas, 531 cells) | 82.3% (93/150 lemmas, 458 cells) |
| dictionary hit rate | 95.3% | 100.0% | 99.5% | 98.6% | 84.6% | n/a | n/a |
| definition availability | 100.0% | 100.0% | 99.5% | 100.0% | 85.0% | n/a | n/a |
| etymology availability | 94.0% | 97.7% | 96.3% | 97.2% | 81.3% | n/a | n/a |
| IPA availability | 82.8% | 100.0% | 97.7% | 95.8% | 84.6% | n/a | n/a |
| alternatives-kept rate | 81.0% (n=21; top reading right 61.9%) | 81.3% (n=32; top reading right 81.3%) | 93.1% (n=29; top reading right 86.2%) | 86.2% (n=29; top reading right 72.4%) | 62.5% (n=40; top reading right 62.5%) | 100.0% (n=20; top reading right 100.0%) | 68.2% (n=22; top reading right 54.5%) |
| conflict rate | 1.9% | 0.0% | 1.9% | 1.9% | 0.0% | 2.3% | 2.3% |
| latency (ms) | 2.10 (parse 0.36 + dict 1.74) | 4.01 (parse 0.79 + dict 3.22) | 4.25 (parse 1.40 + dict 2.86) | 2.39 (parse 0.63 + dict 1.76) | 1.10 (parse 0.29 + dict 0.81) | 0.24 (parse 0.24 + dict 0.00) | 0.17 (parse 0.17 + dict 0.00) |
| lemma+POS both right | 85.1% | 90.7% | 94.9% | 89.3% | 73.8% | 95.8% | 84.2% |
| gold word = one engine token | 100.0% | 100.0% | 100.0% | 100.0% | 91.1% | 100.0% | 100.0% |

### hard

| metric | sq | es | de | hi | th | nb | nn |
|---|---|---|---|---|---|---|---|
| items scored (of file) | 70 (70) | 82 (82) | 72 (72) | 68 (68) | 74 (74) | 73 (73) | 76 (76) |
| lemma accuracy | 82.9% | 98.8% | 95.8% | 98.5% | 63.5% | 72.6% | 68.4% |
| POS accuracy | 85.7% | 92.7% | 94.4% | 77.9% | 52.7% | 84.9% | 82.9% |
| feature precision | 82.3% | 98.3% | 88.8% | 91.2% | n/a | 68.9% | 85.0% |
| feature recall | 85.5% | 94.5% | 91.5% | 94.4% | 0.0% | 70.7% | 73.5% |
| feature F1 | 83.9% | 96.4% | 90.1% | 92.8% | n/a | 69.8% | 78.9% |
| role / relation accuracy | syntax 75.7% (n=70); role 81.8% (n=11, given on 100%) | syntax n/a; role given on 0%, none mappable | syntax 84.7% (n=72); role 100.0% (n=3, given on 100%) | syntax 86.8% (n=68); role 80.0% (n=5, given on 100%) | syntax 58.3% (n=60); role 33.3% (n=3, given on 65%) | syntax 83.6% (n=73); role 28.6% (n=7, given on 93%) | syntax 80.3% (n=76); role 28.6% (n=7, given on 92%) |
| paradigm round-trip share | 89.1% (98/150 lemmas, 2254 cells) | 98.3% (103/150 lemmas, 2795 cells) | 95.7% (102/150 lemmas, 2910 cells) | 80.5% (117/150 lemmas, 2718 cells) | n/a | 97.7% (102/150 lemmas, 531 cells) | 82.3% (93/150 lemmas, 458 cells) |
| dictionary hit rate | 98.6% | 100.0% | 97.2% | 100.0% | 63.5% | n/a | n/a |
| definition availability | 98.6% | 100.0% | 97.2% | 100.0% | 64.9% | n/a | n/a |
| etymology availability | 92.9% | 100.0% | 94.4% | 98.5% | 62.2% | n/a | n/a |
| IPA availability | 80.0% | 100.0% | 94.4% | 98.5% | 63.5% | n/a | n/a |
| alternatives-kept rate | 70.6% (n=17; top reading right 58.8%) | 95.2% (n=21; top reading right 90.5%) | 90.9% (n=11; top reading right 90.9%) | 90.5% (n=21; top reading right 81.0%) | 68.1% (n=47; top reading right 61.7%) | 72.7% (n=11; top reading right 54.5%) | 81.8% (n=11; top reading right 81.8%) |
| conflict rate | 2.9% | 1.2% | 1.4% | 2.9% | 4.1% | 13.7% | 3.9% |
| latency (ms) | 2.36 (parse 0.31 + dict 2.05) | 3.80 (parse 0.53 + dict 3.27) | 3.20 (parse 0.59 + dict 2.60) | 1.81 (parse 0.42 + dict 1.39) | 0.77 (parse 0.19 + dict 0.58) | 0.17 (parse 0.17 + dict 0.00) | 0.09 (parse 0.09 + dict 0.00) |
| lemma+POS both right | 77.1% | 92.7% | 94.4% | 77.9% | 51.4% | 72.6% | 67.1% |
| gold word = one engine token | 100.0% | 100.0% | 100.0% | 100.0% | 79.7% | 100.0% | 100.0% |
| engine gave the naive wrong analysis | 8.6% | 2.4% | 0.0% | 5.9% | 10.8% | 8.2% | 2.6% |
| Thai segmentation exact | n/a | n/a | n/a | n/a | 50.0% (n=10) | n/a | n/a |

### unseen

| metric | sq | es | de | hi | th | nb | nn |
|---|---|---|---|---|---|---|---|
| items scored (of file) | 70 (70) | 80 (80) | 80 (80) | 80 (80) | 80 (80) | 70 (70) | 70 (70) |
| lemma accuracy | 90.0% | 82.5% | 96.3% | 88.8% | 91.3% | 100.0% | 85.7% |
| POS accuracy | 87.1% | 82.5% | 87.5% | 85.0% | 66.3% | 98.6% | 100.0% |
| feature precision | 89.2% | 77.6% | 79.0% | 88.3% | n/a | 66.9% | 84.1% |
| feature recall | 87.9% | 92.4% | 83.6% | 65.7% | 0.0% | 89.9% | 90.6% |
| feature F1 | 88.5% | 84.3% | 81.2% | 75.3% | n/a | 76.7% | 87.2% |
| role / relation accuracy | syntax 84.3% (n=70); role 75.0% (n=12, given on 99%) | syntax n/a; role given on 0%, none mappable | syntax 63.7% (n=80); role 73.7% (n=19, given on 88%) | syntax 61.5% (n=78); role 47.1% (n=17, given on 89%) | syntax 23.6% (n=72); role 29.4% (n=34, given on 83%) | syntax 92.9% (n=70); role 90.5% (n=21, given on 100%) | syntax 95.7% (n=70); role 70.8% (n=24, given on 100%) |
| paradigm round-trip share | 89.1% (98/150 lemmas, 2254 cells) | 98.3% (103/150 lemmas, 2795 cells) | 95.7% (102/150 lemmas, 2910 cells) | 80.5% (117/150 lemmas, 2718 cells) | n/a | 97.7% (102/150 lemmas, 531 cells) | 82.3% (93/150 lemmas, 458 cells) |
| dictionary hit rate | 98.6% | 86.3% | 95.0% | 86.3% | 83.8% | n/a | n/a |
| definition availability | 100.0% | 86.3% | 95.0% | 91.3% | 88.8% | n/a | n/a |
| etymology availability | 95.7% | 82.5% | 93.8% | 85.0% | 82.5% | n/a | n/a |
| IPA availability | 84.3% | 86.3% | 93.8% | 85.0% | 83.8% | n/a | n/a |
| alternatives-kept rate | 76.9% (n=13; top reading right 61.5%) | 68.8% (n=16; top reading right 62.5%) | 85.7% (n=21; top reading right 71.4%) | 84.0% (n=25; top reading right 84.0%) | 67.5% (n=40; top reading right 65.0%) | 100.0% (n=8; top reading right 87.5%) | 83.3% (n=6; top reading right 83.3%) |
| conflict rate | 2.9% | 1.3% | 3.8% | 0.0% | 1.3% | 1.4% | 5.7% |
| latency (ms) | 2.29 (parse 0.37 + dict 1.92) | 4.19 (parse 1.68 + dict 2.51) | 3.87 (parse 1.63 + dict 2.24) | 2.26 (parse 0.95 + dict 1.32) | 1.25 (parse 0.49 + dict 0.75) | 0.21 (parse 0.21 + dict 0.00) | 0.13 (parse 0.13 + dict 0.00) |
| lemma+POS both right | 78.6% | 75.0% | 86.3% | 83.8% | 66.3% | 98.6% | 85.7% |
| gold word = one engine token | 100.0% | 100.0% | 100.0% | 98.8% | 90.0% | 100.0% | 100.0% |

### Biggest error classes (lemma / POS)

- **sq dev**: dev · POS wrong ×21 (e.g. Jam: gold jam/AUX, engine jam/VERB); dev · lemma wrong ×9 (e.g. bukur: gold bukur/ADJ, engine i bukur/ADJ); dev · lemma and POS wrong ×2 (e.g. Mirë: gold mirë/ADV, engine i mirë/ADJ)
- **sq hard**: linking-article · lemma and POS wrong ×4 (e.g. i: gold i/DET, engine i ri/ADJ); linking-article · lemma wrong ×4 (e.g. së: gold së/DET, engine i/DET); admirative-subjunctive-participle · POS wrong ×3 (e.g. Qenka: gold jam/AUX, engine jam/VERB); compound-or-multiword · lemma wrong ×2 (e.g. lahet: gold lahem/VERB, engine laj/VERB); clitic-doubling · lemma and POS wrong ×1 (e.g. u: gold ai/PRON, engine u/PART)
- **sq unseen**: unseen · POS wrong ×8 (e.g. mund: gold mund/AUX, engine mund/VERB); unseen · lemma wrong ×6 (e.g. e: gold e/DET, engine i tij/DET); unseen · lemma and POS wrong ×1 (e.g. i: gold i/DET, engine i lodhur/ADJ)
- **es dev**: dev · POS wrong ×11 (e.g. hay: gold haber/VERB, engine haber/AUX); dev · lemma wrong ×7 (e.g. los: gold el/DET, engine los/DET); dev · lemma and POS wrong ×2 (e.g. dormido: gold dormido/ADJ, engine dormir/VERB)
- **es hard**: adjective-as-noun-or-gender · POS wrong ×3 (e.g. trabajadoras: gold trabajador/NOUN, engine trabajador/ADJ); ra-se-subjunctive · POS wrong ×2 (e.g. hubiese: gold haber/VERB, engine haber/AUX); homograph · lemma and POS wrong ×1 (e.g. como: gold comer/VERB, engine como/SCONJ)
- **es unseen**: unseen · lemma and POS wrong ×7 (e.g. era: gold era/NOUN, engine ser/AUX); unseen · lemma wrong ×6 (e.g. las: gold el/DET, engine las/DET); unseen · POS wrong ×6 (e.g. Heber: gold Heber/PROPN, engine heber/VERB); unseen · no reading ×1 (e.g. aflicción: gold aflicción/NOUN, engine -/-)
- **de dev**: dev · lemma wrong ×5 (e.g. singt: gold singen/VERB, engine mitsingen/VERB); dev · POS wrong ×3 (e.g. ja: gold ja/ADV, engine ja/PART); dev · lemma and POS wrong ×3 (e.g. hin: gold hin/PART, engine hinfahren/ADV)
- **de hard**: separable-verb · lemma and POS wrong ×2 (e.g. zurück: gold zurück/PART, engine zurückkommen/ADV); konjunktiv · POS wrong ×1 (e.g. hätte: gold haben/AUX, engine haben/VERB); zu-infinitive-and-participles · lemma and POS wrong ×1 (e.g. gekochte: gold kochen/VERB, engine gekocht/ADJ)
- **de unseen**: unseen · POS wrong ×8 (e.g. Moab: gold Moab/PROPN, engine Moab/NOUN); unseen · no reading ×2 (e.g. unfruchtbar: gold unfruchtbar/ADJ, engine -/-); unseen · lemma wrong ×1 (e.g. alle: gold all/DET, engine alle/DET)
- **hi dev**: dev · POS wrong ×12 (e.g. नहीं: gold नहीं/PART, engine नहीं/ADV); dev · lemma and POS wrong ×8 (e.g. उसका: gold वह/PRON, engine उसका/DET); dev · lemma wrong ×3 (e.g. ढूँढा: gold ढूँढना/VERB, engine ढूँढ़ना/VERB)
- **hi hard**: compound-verb · POS wrong ×5 (e.g. दिया: gold देना/AUX, engine देना/VERB); verb-complex-aux · POS wrong ×4 (e.g. चुका: gold चुकना/AUX, engine चुकना/VERB); irregular-verb · POS wrong ×3 (e.g. हुई: gold होना/VERB, engine होना/AUX); conjunctive-participle-and-infinitive · POS wrong ×1 (e.g. वाला: gold वाला/ADJ, engine वाला/PART); honorific-subjunctive-imperative · POS wrong ×1 (e.g. लो: gold लेना/AUX, engine लेना/VERB)
- **hi unseen**: unseen · no reading ×6 (e.g. नामक: gold नामक/ADJ, engine -/-); unseen · POS wrong ×4 (e.g. सब: gold सब/DET, engine सब/PRON); unseen · lemma and POS wrong ×2 (e.g. जल: gold जल/NOUN, engine जलना/VERB); unseen · lemma wrong ×1 (e.g. ये: gold यह/PRON, engine ये/PRON)
- **th dev**: dev · no reading ×32 (e.g. ของเล่น: gold ของเล่น/NOUN, engine -/-); dev · POS wrong ×23 (e.g. นั้น: gold นั้น/PRON, engine นั้น/DET); dev · lemma and POS wrong ×1 (e.g. ความสุข: gold ความสุข/NOUN, engine มีความสุข/-)
- **th hard**: loanword-or-name · no reading ×9 (e.g. เชียงใหม่: gold เชียงใหม่/PROPN, engine -/-); segmentation-trap · no reading ×8 (e.g. ตากลม: gold ตากลม/NOUN, engine -/-); compound-word · no reading ×7 (e.g. แม่น้ำ: gold แม่น้ำ/NOUN, engine -/-); Thai segmentation · cut differs ×5 (e.g. ตากลม: gold ตากลม, engine ตา|กลม); particle-polysemy · POS wrong ×5 (e.g. ที่: gold ที่/ADP, engine ที่/SCONJ)
- **th unseen**: unseen · POS wrong ×20 (e.g. ให้: gold ให้/VERB, engine ให้/ADP); unseen · no reading ×7 (e.g. โดย​รอบ: gold โดยรอบ/ADV, engine -/-)
- **nb dev**: dev · lemma wrong ×7 (e.g. alle: gold all/PRON, engine alle/PRON); dev · POS wrong ×2 (e.g. selv: gold selv/ADV, engine selv/PRON)
- **nb hard**: particle-verb · lemma wrong ×7 (e.g. står: gold stå/VERB, engine stå opp/VERB); homograph · lemma and POS wrong ×4 (e.g. fall: gold fall/NOUN, engine falle/VERB); s-passive-and-reflexive · no reading ×2 (e.g. sees: gold se/VERB, engine -/-); comparison-irregular · no reading ×2 (e.g. færre: gold få/ADJ, engine -/-); bro-bru-variants · no reading ×1 (e.g. meget: gold meget/ADV, engine -/-)
- **nb unseen**: unseen · POS wrong ×1 (e.g. som: gold som/SCONJ, engine som/PRON)
- **nn dev**: dev · lemma wrong ×25 (e.g. segjer: gold segje/VERB, engine seie/VERB); dev · POS wrong ×6 (e.g. sjølve: gold sjølv/ADJ, engine sjølv/PRON); dev · lemma and POS wrong ×3 (e.g. so: gold so/SCONJ, engine så/CONJ)
- **nn hard**: particle-verb · lemma wrong ×5 (e.g. opp: gold opp/ADV, engine stå opp/ADV); bro-bru-variants · lemma and POS wrong ×4 (e.g. Jeg: gold eg/PRON, engine Jeg/PROPN); a-infinitive-and-verb-classes · no reading ×2 (e.g. hoppar: gold hoppa/VERB, engine -/-); a-infinitive-and-verb-classes · lemma wrong ×2 (e.g. kasta: gold kasta/VERB, engine kaste/VERB); comparison-irregular · lemma wrong ×2 (e.g. eldre: gold gamal/ADJ, engine gammal/ADJ)
- **nn unseen**: unseen · lemma wrong ×10 (e.g. stod: gold stå/VERB, engine stå opp/VERB)
