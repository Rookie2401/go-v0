# Latin ladder: stage a1-1 (12 units) — plan and vocabulary schedule

Drafted 2026-11-13 by an AI drafting agent for `data/ladder/la/ladder.json` (contract: `docs/LADDER.md`). **Nothing here is reviewed by a Latinist.** Every unit is a machine draft (`pipeline.state: machine-draft`), `review.status: unreviewed`, so none publishes. Sources and build script: `data/ladder/la/authoring/` (edit the text, run `node data/ladder/la/authoring/build.mjs`). Figures below are from `npx vite-node scripts/ladder-check.mts -- la` on 2026-11-13 with the full Latin lexicon; re-run the gate rather than trusting a decimal.

## State

12 controlled units, 2,794 running words (about 230 a unit; the target of 300–450 was not reached, see "Why short"), gate: **0 errors, 19 warnings** (8 coverage between 85.1 and 87.2 %, all of them honest; the rest recycling, orphan and recurrence advice). No unit was padded to clear a warning.

Stage 0 head: 19 texts, 399 words, 58 lemmas. Only about 34 of them have been met three times, so the first units can lean on very little; units 1 and 2 sit in the first-units band (78 % error, 85 % warning).

## House style

- Ecclesiastical (Church) Latin, written without macrons, with `v` and `i` only (as Stage 0). Names as in Stage 0: Anna, Lucius, Martha, Marcus, Samuel; other names are proper nouns the analyser reads (Paulus, Petrus, Roma).
- Present tense throughout, except units 11 and 12: a few perfects, deliberately and recycled (`venerunt`, `viderunt`, `fuit`, `fui`, `fuisti`, `dixit`, `dedi`, `habuit`, `iuvit`) after `heri`.
- Dialogue and narration alternate; every sentence carries an English rescue line (the drafter's own).
- Domains: conversation (1, 9, 10), description (2, 8), narrative (3, 7, 11, 12), practical communication (4), correspondence (5), explanation (6). Scripture is not a domain here: unit 6 explains Sunday and the Mass greetings (`Pax vobis`, `Deo gratias`); no unit quotes or retells the Vulgate.

## How the gate shaped the vocabulary (the working rule)

A word counts as known for a unit only once it has been met three times in earlier units (Stage 0 included); every token of any other lemma is "unknown" in the unit that uses it. With about 15 % allowed to be unknown, a 220-word unit can carry 6–9 new lemmas, each used 3–4 times in its own unit and then reused. That rule, not a taste for short texts, set the vocabulary schedule below: new words are few, each is used just enough to be known by the next unit, and the later units spend their budget on recycling the earlier words.

## Vocabulary schedule (new lemmas per unit; times used in the unit in brackets)

Words in "firming" were met once or twice in Stage 0 and are brought to three here.

| unit | title | new lemmas | firmed from Stage 0 |
|---|---|---|---|
| 01 | In foro (the market) | venio (1) | vendo, vinum, quomodo, sed, bonus, do, emo, cras, puer, magister, pax, dies |
| 02 | Domus Marthae (a house) | parvus, habito, libenter, tuus, amo, porta, magnus, fenestra, video, multus | mensa, bibo |
| 03 | In schola (school) | puella, dico, nunc, audio, liber, quaero, invenio, omnis | salveo, amicus |
| 04 | In valetudinario (the clinic) | nutrix, caput, doleo, edo, maneo, manus, ita, laboro | bibo, eo, iuvo |
| 05 | Epistula (a letter to his mother) | epistula, scribo, mater, carus, urbs, novus, pater | longe, deus |
| 06 | Dies Dominica (what happens on Sunday) | homo, laudo, oro, canto, sacerdos, post, ibi | dies, venio, edo |
| 07 | Clavis amissa (the lost key) | tandem, statim, sub, avia, (saluto, facio once each) | iuvo |
| 08 | Iter (a walk) | via, ambulo, mons, arbor, avis, canis, timeo | qui |
| 09 | Cena (supper; a letter arrives) | cena, paro, pomum, piscis, sedeo, semper, dormio | avia, post |
| 10 | Hospes (a visitor from Rome) | hospes, nomen, ex | novus |
| 11 | Vicinus senex (helping a neighbour; perfects begin) | vicinus, senex, heri, iterum, postea | caput, nutrix, facio |
| 12 | Ad mare (a trip to the sea; perfects) | mare, litus, insula, navis, postquam | statim, iterum |

Roughly 62 new lemmas in 12 units, on top of the 58 of Stage 0 (about 34 of which are usable on day one).

### Recycled on purpose

Unit 9 brings the letter words (epistula, scribo, mater, pater, carus) back; unit 10 does the same with a letter from Rome; unit 11 brings back caput, doleo, nutrix (Anna advises Petrus), canis and via (his dog); unit 12 brings back canis, mons, avis, arbor (a second walk, to the hill, before the sea). Still met fewer than three more times after their unit, honestly left as warnings: puella, liber (unit 3), oro, sacerdos (6), saluto, sub (7), semper, dormio (9).

## Towards the first authentic text

The ladder should reach Ritchie's *Fabulae Faciles* (text ids `text:la:ladder-ritchie-perseus`, `-hercules`, `-argonauts`, `-ulysses`), then Vulgate chapters (`text:la:vulgate-john-1` ...) and Caesar (`text:la:ladder-caesar-bg-1`). These 12 units cannot reach Perseus (329 lemmas in 915 words, 48 % after unit 12); they are its foundation. What the next stages (a1-2 onwards) should do, in this order:

1. The Perseus high-frequency core, which a1-1 has barely touched: `sum et hic in ad is ubi suus autem omnis ille tum igitur mater tamen video ex venio volo cum mare facio postquam caput dum monstrum ab enim insula rex litus post locus statim dies deus arca tempus do habito at atque quaero tandem res puella appello propter timeo ipse magnopere constituo accipio tantus ago annus audio fugio neque totus uxor urbs filius puer domus donum libenter gratia multus ibi vita dico iam qui arma diu frustra primus pervenio homo saxum ira olim filia lacrima subito exspecto timor sto gladius sine mora rursus paucus inter`. a1-1 already carries (as lemmas met at least three times): et sum hic in ad ille ubi video venio volo mare facio (once, to firm) caput insula litus post statim dies do habito quaero tandem puella timeo audio ago urbs puer domus libenter gratia multus ibi dico homo (and the rest below). Not yet touched: suus, autem, igitur, tamen, cum, dum, enim, rex, locus, tempus, at, atque, res, appello, propter, ipse, constituo, accipio, tantus, annus, fugio, neque, totus, uxor, filius, donum, vita (only once or twice), iam, arma, diu, frustra, primus, pervenio, saxum, ira, olim, filia, lacrima, subito, exspecto, timor, sto, gladius, sine, mora, rursus, paucus, inter, monstrum, arca.
2. The perfect tense, widely: units 11 and 12 only show `venit/venerunt, vidit/viderunt, fuit/fui/fuisti, dixit, dedi, habuit, iuvit` with `heri` and `postquam`. Perseus is almost wholly narrated in the perfect (`venit`, `vidit`, `dixit`, `fuit`, `accepit`, `constituit`); a1-2 should spend its first half on it, in simple narratives (a day, a journey, a find).
3. Third-person narrative with a clear subject and a chain of short events (`postquam ... , ... statim ...`), then relative and temporal clauses (`qui`, `dum`, `cum`), then the accusative-plus-infinitive in its easiest forms (`dicit se ... esse`), which Caesar and John need.
4. Scripture as one domain among others, from a1-2 or a2-1: a simple retelling in the ladder's own Latin before any Vulgate verse (the Vulgate chapters need `in principio`, `verbum`, `lux`, `tenebrae`, `testimonium`; John 1 is already at 64.6 % after unit 12 because its words are few and frequent).
5. Authentic Ritchie only when `ladder:place` shows at least 95 %; until then the Ritchie stories are the library, not the ladder.

## Why short

The units average about 230 running words, not 300–450. With only 58 Stage 0 lemmas, a 15 % unknown budget and three uses per new word, a longer unit either needs many more new lemmas (and breaks the density warning and, in the early units, the coverage error) or needs long stretches of known words, which is padding. The later units (9–12) have more known material and were lengthened by recycling real earlier vocabulary, not by filler. Stage a1-2 can write longer units naturally.

## Things a Latinist should look at

- `Ita` as "yes" (units 4, 8, 12) and `Ita, ... est`: acceptable in Church Latin but not classical; replace by repetition of the verb if the review prefers.
- `hospes` / `senex` / `vicinus`, as nouns in the nominative singular with a masculine adjective (`senex fessus`), and `nomen mihi Paulus est`, `nomen ei Petrus est` (dative of possession): intended, check naturalness.
- Perfects in units 11 and 12: `venerunt`, `viderunt`, `fui`, `fuisti`, `dedi`, `habui`, `habuit`, `iuvit`, `dixit`, and `postquam` with a present main verb in unit 12 (`Postquam Anna ... parat, omnes edunt et bibunt`): in classical Latin `postquam` takes the perfect; the present is used here as a historic present and may read oddly.
- `domum ire vult`-type constructions were replaced by `domum venire vult` (unit 7); `Hodie in domo manere bonum est` (units 4, 11) is a deliberate infinitive-as-subject.
- Unit 5, the letter: `Samuel tuus` as a close, and `Pax vobis` for two readers; greeting formula `salutem dicit` appears in a heading only.
- The English lines are the drafter's own and unreviewed.

Analyser quirks seen while drafting (not Latin errors): `iuvat` is read as its own lemma (units 4, 7, 11), `sede` as `sedes`, `mane` as the noun; `quia` and `saluto` occur once or twice and so stay unknown.

## Placement (2026-11-13)

`npx vite-node scripts/ladder-place.mts -- --lang la <textId>`, after the 12 units exist (coverage = share of the text's running words whose lemma has been met at least three times, as the gate counts it):

| text | words | after Stage 0 | after unit 12 | verdict |
|---|---:|---:|---:|---|
| `text:la:ladder-ritchie-perseus` | 915 | 28.7 % | 48.0 % | library, not ladder |
| `text:la:ladder-ritchie-hercules` | 4,533 | 23.6 % | 39.2 % | library, not ladder |
| `text:la:vulgate-john-1` | 771 | 40.0 % | 64.6 % | library, not ladder |
| `text:la:ladder-caesar-bg-1` | 982 | 25.1 % | 38.6 % | library, not ladder |

None of them is placeable yet (the threshold is 95 %). Per-unit run for Perseus: 31.7, 34.8, 37.4, 37.6, 39.3, 41.3, 41.8, 42.5, 43.2, 44.1, 44.8, 48.0 %. John 1 moves furthest (its 771 words are few and frequent); Perseus gains about 19 points from these 12 units and needs the second plan item above (the perfect, and the 60-odd untouched high-frequency lemmas) before it nears 95 %.
