# Stage 0, Bokmål (`nb`): machine draft

Written 2026-10-07 by Team Norway package C. Every scene, sound step and exit form here is **AI-drafted and unreviewed**
(`provenance.authoring: "ai-drafted"`, `review.status: "unreviewed"`, note `TODO(review)`). Nothing claims native review. The
files are the same shape as `data/stage0/de/**`: `path.json`, `coverage.json` (hand-written, not generated), 15 scenes,
5 sound steps, 2 exit forms. Only `data/stage0/world.json` was touched outside this folder (the `nb` names of the five
characters: Anna, Lars, Marta, Nils, Sam).

## Norm and forms (decision for the reviewer)

- **Norm:** the 2005 Bokmål norm, written. Only forms that the norm allows are used.
- **One form per word, fixed for the whole of Stage 0.** The norm allows many feminine nouns as `ei/-a` or `en/-en`
  (SPEC section 1). Stage 0 picks, for each word, the form a learner meets most in everyday writing and never mixes the two for
  the same word. Feminine forms with `ei`, `-a`, `mi/di`: **søstera mi, veska di, bestemora (mi/di), kirka, klokka, venninna mi,
  boka di**. Dual-gender words shown in the common `-en` form: **skolen, klinikken** (also `byen`, which is masculine only).
  Masculine: broren min, nøkkelen min, risen, brødet (neuter). A reviewer should confirm each choice; changing one is a text
  edit in the scenes and a new review signature.
- Other valid variants avoided on purpose so that Stage 0 stays single-form: `kastet/kasta`, `husene/husa`, `syv`
  (Stage 0 uses `sju` and `tjue`), radical forms such as `blei` (Stage 0 uses `ble`).
- **Postposed possessives** (`broren min`, `søstera mi`, `bestemora si`) are the unmarked everyday pattern; the pre-nominal
  `min bror` is not used in Stage 0.
- **No formal "you".** Marta the shopkeeper is addressed with `du` (scene 9, with a culture note). The old `De` is never taught.
- **Vocabulary** is the highest-frequency everyday set plus the testimony strand: greetings, family, home, food, the day,
  weather, church (`går i kirka`, `Jeg tror på Gud`), simple past (`regnet`, `ble`, scene 13) and perfect (`har glemt`, scene 14).

## Pronunciation policy

There is **no official spoken standard** of Norwegian: only the spelling is regulated. Sound step 1 says so in the learner's
own words and says that Go uses an **Eastern (Oslo-area) realisation as a reference, not as a norm**. The sound steps teach
the spelling-to-sound rules of recon Part D: `kj/tj`, `sj/skj/sk+i,y,ø` (and the kj/sj merger: both are normal), the silent
`h` in `hj/hv`, silent `d` after n/l/r, `-ig`, the vowels `o u y`, `æ ø å`, vowel length by consonant doubling, the retroflex
`rs`, and silent `t` in `det`. **Tone exists but is not taught beyond one sentence** ("two melodies exist"), in sound step 5.
Respellings are English approximations and need a phonetician's or native speaker's check.

## Structure

| step | what | new words (by written form) |
|---|---|---|
| s01 | Hello, I am Sam | hei, jeg, heter, hyggelig, også |
| s02 | This is Lars | dette, er, broren, min, søstera, mi |
| snd1 | ei, jeg, -ig, o, y, ø (and the no-standard statement) | none (all met) |
| s03 | Water and coffee | har, vann, kaffe, drikker, ikke, du |
| s04 | No, thank you | vil, ha, nei, takk, her, bare |
| snd2 | long and short vowels, u | none |
| s05 | Where everyone is | hjemme, på, skolen, å, møte, deg, markedet |
| s06 | Anna is tired | jobber, klinikken, i, dag, trøtt, ja |
| snd3 | å, ø, silent h in hj/hv | hvor, hva |
| s07 | Where is my key? | nøkkelen, vet, den, veska, di, veldig, bra |
| s08 | I like bread | bestemora, selger, brød, og, liker |
| s09 | Good morning at the market | kjøper, god, morgen, et, vær, så |
| snd4 | kj, tj, sj, rs | tjue, sju, norsk |
| s10 | How much is it? | ris, koster, brødet, kroner, risen, tretti, femti |
| snd5 | æ, silent d and t, gj; small letters; tone in one sentence | gjerne, kaldt, det, bord, søndag |
| s11 | On Sunday | hun, går, kirka, tror, Gud, med |
| s12 | The rain changes the plan | men, regner, fordi, vi, blir, te, si, han |
| s13 | Sam tells about himself | bor, byen, snakker, litt, venninna, lærer, regnet, ble |
| s14 | Nils at school | boka, bordet, glemt, hos, sent, klokka, hjem |
| s15 | Dinner at Marta's | kveld, spiser, sulten, bestemor, ingenting, rydder, av |
| exit a, b | unseen reading, listening, writing, speaking | exit coverage 100 % of word tokens met on the path |

Counts are by **written form** (the placeholder adapter reads every word as itself). A lemma-reading adapter can only merge
forms (`bord` and `bordet`, `min` and `mi`), so the per-scene new-word counts can only go down. Band limits: scenes 1-4
at most 6 new words; later scenes at most 8; later coverage at least 60 % (lowest here: scene 5, 68 %); exit at least 95 %.

## Spelling-feature ids

The sound steps use the feature ids of `norwegianSpelling` in `src/stage0/lang/index.ts` (package A): `nb:ig, nb:o, nb:y,
nb:u, nb:ø, nb:å, nb:æ, nb:vowel-length, nb:hj-hv, nb:kj, nb:sj, nb:rs, nb:silent-d`. The six extra features proposed by package C (`nb:ei, nb:eg, nb:weak-e, nb:gj, nb:det, nb:lowercase`) were added by A and are listed in the `features` of snd1, snd2 and snd5; the `silent-d` pattern now also matches `-dt` (kaldt). The validator needs every listed feature to occur in a step word, so a change of a sound word needs a check of its features.

## For the native reviewer

1. Every sentence is natural, correct 2005 Bokmål (the single-form choices above).
2. The English respellings in the sound steps and the claims in the notes (the `De` form is "almost never used";
   `går i kirka`; `I går` is a different word from `går`).
3. The `next` text in `path.json` (`text:nb:nb-a1-1-01`) is the first ladder unit written by package D; change it if the
   course catalogue names its first text otherwise.
4. Scene 5 and 9 introduce Nils and Marta to Sam with `Hyggelig å møte deg`; scene 11 teaches `Jeg tror på Gud` as a plain
   statement of belief. Confirm the register is right for a church-going older neighbour.
