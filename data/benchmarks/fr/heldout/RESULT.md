# Held-out French set: result

**Honesty.** Every expectation in this set is an AI's judgement from French grammar and the kaikki.org extract; nothing was reviewed by a
native speaker. An expectation I was not certain of was left out. Where the analyser and a case disagree, the case may be the faulty
side; the classification below is also an AI's. The cases were written, dictionary-checked and frozen (see `FROZEN.md`, with a sha256 per
file) before the analyser was run on them. The analyser's source (except `types.ts`/`orth.ts`), `src/adapters/fr.ts` and the first set's
cases were not read while writing. The run was done once in each mode; no expectation was changed afterwards.

## Frozen counts

220 cases: orthography 20, nominal 25, verbal 40, compound-tenses 25, pronouns 25, negation 15, relatives 15, literary 30, ambiguity 25;
165 core and 55 advanced. 61 sentences in present-day web style, 49 literary-style, 13 word-for-word Louis Segond 1910 targets.
Dictionary check before the freeze: 215 looked up, 199 confirmed, 12 through the masculine singular participle, 2 elided closed-class forms
(n', m'), 2 flagged and kept (h-comp-025: a script artefact, the extract does list enfuis as a masculine plural form; h-pron-020: the extract
labels `on` plural, the verb agreement after `on` is singular, as in the first set). One case was adjusted before the freeze (h-pron-015: `tien`
is listed only as an adjective in the extract, so ADJ was added to `alsoAcceptPos`).

## Summary, hand word list alone (`scripts/fr-eval-heldout.mts`)

```
French fixtures: 204/220 pass
  ambiguity         20/25   core 10/10  advanced 10/15
  compound-tenses   25/25   core 16/16  advanced 9/9
  literary          26/30   core 18/21  advanced 8/9
  negation          15/15   core 13/13  advanced 2/2
  nominal           23/25   core 23/24  advanced 0/1
  orthography       18/20   core 17/19  advanced 1/1
  pronouns          25/25   core 21/21  advanced 4/4
  relatives         13/15   core 8/9  advanced 5/6
  verbal            39/40   core 31/32  advanced 8/8
```

Extra failures here (they pass once the lemma list is loaded): h-amb-007 louche (rule guess `louch`), h-amb-017 sort (only `sortir`),
h-lit-015 morne (guessed as a verb), h-lit-024 dégainèrent (rule guesses first), h-lit-030 tumulte (guessed `tumult` feminine),
h-nom-014 bals (no Gender), h-orth-003 chou-fleur and h-orth-019 porte-monnaie (no reading at all), h-rel-001 qui (no `relative-qui`
construction found).

## Summary, with the dictionary lemma list loaded (`-- --lemmas`)

```
French fixtures: 213/220 pass
  ambiguity         22/25   core 10/10  advanced 12/15
  compound-tenses   25/25   core 16/16  advanced 9/9
  literary          29/30   core 21/21  advanced 8/9
  negation          15/15   core 13/13  advanced 2/2
  nominal           24/25   core 24/24  advanced 0/1
  orthography       20/20   core 19/19  advanced 1/1
  pronouns          25/25   core 21/21  advanced 4/4
  relatives         14/15   core 9/9  advanced 5/6
  verbal            39/40   core 31/32  advanced 8/8
```

Both ways: 204/220 (92.7 %) and 213/220 (96.8 %). Core: 157/165 without the lemma list, 164/165 with it (the one core failure is h-verb-015);
advanced: 47/55 without, 49/55 with.

## Failing cases of the `--lemmas` run (7), classified

| id | class | what |
|---|---|---|
| h-amb-003 | B | `les fils` (cut the wires): the analyser puts `fils` (son) first, `fil` second; both are plural nouns after `les`; only the meaning of `coupe ... avec des ciseaux` decides |
| h-amb-006 | A | `Les enfants crient fort`: `fort` is read first as an adjective (`fort/ADJ`), the adverb second; after an intransitive verb with no copula the adverb is the syntactic choice |
| h-amb-013 | B | `Je suis le chemin balisé`: `suis` is read as `être` first, `suivre` second; only meaning (a person cannot "be" a path) decides; the analyser did give `suivre` as the second reading |
| h-lit-029 | B | `Vit-il jamais pareil spectacle ?`: `vivre` (present) first, `voir` (passé simple) second, the inversion construction found; `vivre` can take an object, so only meaning separates them (the right reading is present, second) |
| h-nom-017 | C | `Le quotidien des habitants`: only an adjective reading `quotidien/ADJ` exists, no noun reading, although the extract lists the noun; a gap in the word list (the pos fails, not the order) |
| h-rel-006 | A | `auxquels`: one undecomposed `PRON` reading (Gender Masc, Number Plur, Int/Rel); the contraction is not split into `à` + `lequel` (`parts` empty), unlike `des`/`aux`/`du` which the analyser splits |
| h-verb-015 | B | `Ils virent un cerf`: `virer` (present) first, `voir` (passé simple) third; `virer` is also transitive, so only meaning (a deer in the forest) decides; the right reading is present with a learner who meets the passé simple |

No case is classified D: no expectation was found to be a mistake of French grammar or of the conventions, and none was changed after the run;
the result is therefore the same both ways.

## What the analyser is good at, and where a learner would mislead

- Strong on regular and irregular verb morphology and on the passé simple in the loaded run: 39 of 40 verbal cases, including spelling-change verbs
  (manger, placer, appeler, acheter), courrons, résolvons, imperfect subjunctives (partît, revînt, sussiez) and the literary negation.
- Compound tenses, participle agreement and the periphrases (futur proche, passé récent, passive, passé antérieur): 25/25, 9/9 advanced.
- Pronouns, negation (including `ne` dropped and `ne ... que`) and relatives: pronouns and negation 40 of 40, relatives 14 of 15; contractions `des`/`aux`/`du` split correctly.
- Without the lemma list it fails on low-frequency words (louche, tumulte, morne, dégainèrent, chou-fleur, porte-monnaie, bals): the hand
  word list alone gives rule guesses or nothing there, so the lemma list must be loaded before a card is shown.
- Where a learner would be misled: (1) a literary passé simple that is also a present of another verb (`virent` → virer first, `vit` → vivre
  first) is shown with the wrong verb on top, the right one lower in the list; (2) `fort` after a verb as an adjective first; (3) `Le quotidien`
  has no noun reading; (4) the contraction `auxquels`/`duquel` family is one blob, not `à` + `lequel`; (5) `suis` and `fils` need meaning, which
  the analyser correctly returns as several readings, but with the more frequent one first.

## After the run (the lead's note)

The figure to quote for this set is the frozen one above: **213 of 220** with the lemma list, 204 of 220 with the hand word list alone.
The expectations were not changed.

Three of the seven failures showed defects that are general, not particular to these sentences, and were then fixed in the analyser:

- `fort` after a verb that is not a linking verb (les enfants crient fort) is now read as the adverb first (a rule for every word that is
  both an adjective and an adverb: parler haut, chanter juste, coûter cher);
- `auxquels`, `auxquelles`, `desquels`, `desquelles`, `laquelle` in a contraction now give the lemma `lequel` as their second half, as
  `aux` and `des` give `le`;
- the noun `quotidien` was missing from the hand word list and was added.

One attempted fix was measured and withdrawn: letting the dictionary's lemma list add a noun reading beside every listed adjective
(le quotidien) also made "ces beaux paysages" and "un court moment" read as nouns, and lowered the part of speech of the first reading on
UD French GSD dev by 0.3 points.

With those three fixes the same frozen cases give 216 of 220. The four that remain (h-amb-003 les fils, h-amb-013 je suis le chemin,
h-lit-029 vit-il, h-verb-015 ils virent) each need the meaning of the sentence: the right reading is given, not first. This set is no
longer held out for anything fixed after it; a later change should be measured on a new one.
