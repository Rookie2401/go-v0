# Team Norway recon 1: linguistic policy, analyzer spec, resources, pronunciation

Reconnaissance report (Phase 1 of the Team Norway brief), produced by a research agent on 2026-10-07 and reviewed
by the lead. Nothing was downloaded and no code was written for it. Read the caveats first: every URL was fetched
or searched on 2026-10-07, but the fetch tool returns a digest of each page, not raw text, so quotes marked
[digest-quoted] must be re-read on the live page before they go into user-facing text. Part B (the analyzer spec)
was written from the agent's own knowledge of Norwegian and **not checked against Norsk ordbank**; cells marked (?)
are uncertain. Wherever this spec and Norsk ordbank / Ordbøkene disagree, the lexicons win. Section E lists
everything that could not be verified.

Lead's review notes (what this report changes in the plan):

- The policy facts that matter for the spec are source-backed: two equal written standards, no official spoken
  standard, no one strictly "speaks Bokmål", Bokmål 2005 and Nynorsk 2012 as the current norms, the 1929 renaming.
- Identifiers: `nb` and `nn` (BCP 47; IANA macrolanguage `no`). Historical registers get no standard tag; they stay
  `nb`/`nn` plus `norm` and `orthographyEra` fields.
- The resources table gives the build inputs: Norsk ordbank (CC BY 4.0, both standards), Ordbøkene (CC BY 4.0 with
  the required credit line), Språkbanken frequency lists, NB Uttale for pronunciation, UD treebanks as held-out
  evaluation only (CC BY-SA, never shipped). Licences for the Nynorsk ordbank and the frequency lists were **not**
  read from the catalogue pages and must be checked by a person before anything is bundled.
- Everything in Part B must be treated as a draft to be verified against the lexicon by a build step, not as truth.

---

## PART A. Official language policy

### A1. Two written standards, no official spoken standard

- **Språkrådet, "Normering av nynorsk og bokmål"** (https://sprakradet.no/nyord-og-rettskrivingsendringer/normering-av-norsk/normering/, 2026-10-07).
  - [digest-quoted] "Dei offisielle normene for nynorsk og bokmål gjeld berre skriftspråk." So the official norms apply only to written language.
  - The norms regulate "skrivemåte og bøying av ord", i.e. spelling and inflection, plus punctuation and similar rules.
  - Norms for spoken language "often are not explicitly stated anywhere".
  - The page names the last big reforms as Bokmål 2005 and Nynorsk 2012. It says the norms should "lie stable" and that Språkrådet can still make individual decisions.
- **Språkrådet Q&A, "Er språket i Oslo dialekt eller bokmål?"** (https://sprakradet.no/spraksporsmal-og-svar/er-spraket-i-oslo-dialekt-eller-bokmal/, page dated 2024-01-01, checked 2026-10-07).
  - Quote: "Nå finnes det ikke noe *offisielt* (talt) standardspråk i Norge, og mange språkforskere mener at ingen strengt tatt *snakker* bokmål." [digest-quoted]
  - Per the search digest, the page also says traditional Oslo dialect is hard to tell apart from spoken conservative bokmål. It says the bokmål standard has a broad register (a-endings, diphthongs) that overlaps much of the old Oslo folk speech.
- **Språkrådet Q&A, "Nynorsk som talemål"** (https://sprakradet.no/spraksporsmal-og-svar/nynorsk-som-talemal/, 2026-10-07).
  - Nynorsk "has few full-time users" as speech.
  - Most users see Nynorsk as a common written language for speakers of different dialects, not as a separate spoken language.
  - Nynorsk has "more flexible" utterance norms than Bokmål.
- **Språklova** (https://lovdata.no/dokument/NL/lov/2021-05-21-42, 2026-10-07).
  - Norwegian is the national main language. Bokmål and nynorsk are equal, and in public bodies both have equal written status. Norwegian Sign Language is the national sign language.
  - Do not cite § numbers from this report. The digest's numbers are unconfirmed.
  - Language Act, Språkrådet side: https://sprakradet.no/spraklova/sporsmal-og-svar/sporsmal-og-svar-om-bokmal-og-nynorsk/. The Storting gave Nynorsk official status in 1885. Nynorsk is about 10% of written use.
- **Språkrådet English page** (https://www.sprakradet.no/Vi-og-vart/Om-oss/English-and-other-languages/English/norwegian-bokmal-vs.-nynorsk/, 2026-10-07).
  - The search digest says Bokmål and Nynorsk "may be regarded as written dialects, mutually completely intelligible".
  - The fetched page body did not repeat this. Treat the quote as unconfirmed.

**Wording for the app docs:** "Bokmål and Nynorsk are Norway's two equal official written standards (Språkrådet). There is no official spoken standard. The app teaches written forms plus a tagged, non-normative reference pronunciation."

### A2. Bokmål is not "spoken Oslo/Eastern Norwegian"

- SNL, "språk i Norge" (https://snl.no/språk_i_Norge, 2026-10-07).
  - [digest-quoted] "Bokmål er utviklet fra dansk skriftspråk på et norsk talemålsgrunnlag, spesielt østlandsk." Bokmål developed from Danish written language on a Norwegian speech base, especially Eastern.
- Språkrådet's "no one strictly speaks bokmål" (A1) is the key point. Speakers use dialects. Educated Eastern speech is close to Bokmål but is not Bokmål.
- Schema consequence: never label speech "bokmål". Use `written_standard: nb|nn` and `pron_variant: east|sw|west|trond|north`.

### A3. Historical layers and dates

Dates marked (Språkrådet) or (SNL) were seen on those pages. The rest is background knowledge.

| Period | Name and status | Key facts and text markers |
|---|---|---|
| to c. 1814–1907 | Danish written language in Norway, informally "Dano-Norwegian" ("dansk-norsk"). This is a descriptive label, not an official standard. | Texts have `aa`, soft consonants (`gade`, `bog`), `hv`, `efter`, `nu`. Older texts have capitalised nouns. |
| 1862 | Reform where "a number of words were norwegianized" (SNL: https://snl.no/.temaside/rettskrivingsreformer-i-norsk). | The detail is not verified. |
| 1848–1850 | Ivar Aasen's Landsmål (background knowledge, not checked). | |
| 1901 | First official Nynorsk (Landsmål) orthography (SNL). | |
| 1907 | First major Riksmål reform (SNL). | Hard consonants (`gate`, `bok`) and some Norwegianisation. |
| 1917 | First joint reform of Riksmål and Landsmål (SNL). | Aimed at "orthographic coordination". `å` replaced `aa` around this time. Feminine gender comes in as optional (background knowledge). |
| 1929 | Names changed: riksmål → bokmål, landsmål → nynorsk (SNL "riksmål": https://snl.no/riksmål). | Texts from before 1929 should be labelled riksmål/landsmål. |
| 1938 | Peak of the state "samnorsk" convergence policy (SNL). | Compulsory radical forms in school books. Strong reactions. This is the origin of "radical vs moderate". |
| 1941–1945 | Reform by the Nazi-aligned government, repealed 1945 (SNL). | Probably leave such texts as-is. |
| 1959 | Reduced compulsion in the textbook standard (SNL). | |
| 1981 | Bokmål-only reform, a policy shift (SNL). Many traditional forms returned. | |
| 1 Jul 2005 | Bokmål reform. Main/side-form distinction abolished. | Rarely used radical forms removed (about a hundred, e.g. `frå`, `grøn`, `lauk`, `omn`, `rekne`, `tal`). Source: SNL https://snl.no/Rettskrivingsreforma_av_2005 and the search digest of Språkrådet. |
| 1 Jul 2012 | Nynorsk reform. Main/side distinction abolished. | Liberalised and reduced forms (A4). Source: https://snl.no/Rettskrivingsreforma_av_2012. |
| after 2012 | "Continuous changes", no big reforms. | Language Council decides case by case. |

**Riksmål today.**
- SNL: it is a conservative variant of Bokmål. It has no official status. Its norm has been maintained privately: Riksmålsforbundet's "Øverlands Blå" (1952), and Det Norske Akademi since 1953.
- Characteristic words: efter, nu, syv, sne, sprog, tyve.
- Inside today's Bokmål it is called "moderate Bokmål". Riksmål spellings that are not in the official norm are not valid Bokmål.

**Classification fields.** Give each historical text `orthography_era` in {pre-1907, 1907, 1917, 1938, 1959, 1981, 2005+} and `norm` in {official-bokmal, riksmal-private, dano-norwegian, official-nynorsk, landsmal, hognorsk}.

Detect era by marker words:
- `aa` instead of `å`, `efter`, `nu`, `sprog`, `bog`, `gade`: pre-1917 or Riksmål.
- `hvad`, `hvem`.
- Capitalised nouns.
- Hard consonants `bok`/`gate`: 1907 or later.

### A4. Permitted variation now

**Bokmål (2005 norm).**
- No main/side forms. All forms are equal "in all contexts".
- Feminine nouns: all are optionally masculine. Both `ei bok / boka` and `en bok / boken` are valid. SNL's digest gives the same for `-a` / `-en`, e.g. bygda/bygden. Words in `-ning` may now be feminine.
- Past tense of the a/et weak class: `-et` and `-a` (kastet/kasta). Participle: `-et` and `-a`. Both valid.
- Neuter definite plural: `-ene` and `-a` (husene/husa).
- Numerals `syv/sju`, `tyve/tjue` both valid.
- Radical forms: some remain valid, e.g. `blei`. Rarely written radical forms were removed in 2005.
- "Moderate" vs "radical" are informal usage labels, not formal categories.
- **App rule:** the analyzer accepts all valid forms. Display and paradigm tables should pick one canonical form (suggest the traditional/moderate one: en/ei both listed, `-et`, `-ene`). Variant forms are flagged `variant:true`, not "wrong".

**Nynorsk (2012 norm)** (https://snl.no/Rettskrivingsreforma_av_2012).
- Infinitive `-a` and `-e` are equal: hosta/hoste, vera/vere. Split infinitive is allowed.
- Plural `-ar` is allowed in all masculine nouns. `-er` is allowed in all feminine nouns.
- Strong-verb present `-er` and participle `-i` eliminated.
- Passive `-s` became mandatory `-st`.
- Some literary forms removed.

### A5. Language identifiers (checked 2026-10-07)

- ISO 639-3 `nor` = macrolanguage. ISO 639-1 `no`. Individual languages `nob` (Bokmål) and `nno` (Nynorsk) (https://iso639-3.sil.org/code/nor).
- IANA registry (https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry; File-Date 2026-09-17, per digest):
  - `nb` and `nn` each have Suppress-Script Latn and Macrolanguage `no`.
  - `no` has Scope macrolanguage.
  - No registered Norwegian variant subtags were seen.
- **Recommendation:**
  - **Acquisition spine:** BCP 47 `nb` (display "Bokmål"). Use `nb-NO` only if a region is needed. Treat `nob` as an alias.
  - **Nynorsk:** `nn` (`nn-NO` optional, alias `nno`).
  - **Input aliases:** accept `no` and `nor` on import. Map to `nb` only for content that is known to be Bokmål-spelled. Otherwise flag "ambiguous macro tag". Many systems, such as Wikipedia, use `no` for Bokmål.
  - **Historical registers:** there is no standard tag. Keep `lang = nb` or `nn`, plus `norm` and `orthography_era` fields (A3).
    - Optional private-use BCP 47 tags (app convention, not standard): `nb-x-riksmal`, `nb-x-danonor`, `nn-x-landsmal`, `nn-x-hognorsk`.
    - Private-use subtags max 8 characters, so these fit.
  - Never put `no` as a content language in schema keys.

---

## PART B. Analyzer specification (UNVERIFIED DRAFT: check every cell against Norsk ordbank)

General rules.
- Lemma = Ordbank lemma in the right standard. nb and nn are separate lexicons linked by concept family (B12).
- Normalise case-insensitively, but keep proper nouns.
- Handle `å/ø/æ` correctly in NFC.
- Handle `aa` only for era-tagged historical texts.
- Treat the apostrophe in `Hans' bok` and genitive `-s` as separate tokens (B2).
- Treat `-` in `USA-president`, `3-årig`, `sjø- og landtransport` (ellipsis compound) as hyphenated compounds.
- Fixed-expression lexicon (`i dag`, `i morgen`, `for å`, `på grunn av`, `blant annet`, `for eksempel`) needs multi-word entries.

### B1. Nouns (Bokmål)

**Gender.**
- Three genders: masculine (en), feminine (ei), neuter (et).
- Every feminine noun may also be declined masculine. Emit both paradigms: indefinite article `ei/en`, definite singular `-a/-en`.
- Tag `Gender=Fem|Masc`. `boka` is unambiguously feminine singular definite. `boken` is masculine, or feminine in common-gender usage.
- Some nouns are masculine only (male persons, `-er`, `-ing` mostly). Do not generate feminine for these. Use the lexicon flag.

**Suffixes.**

| Class | Indef sg | Def sg | Indef pl | Def pl |
|---|---|---|---|---|
| Masc | bil | bilen | biler | bilene |
| Fem | bok | boka / boken | bøker | bøkene |
| Neut | hus | huset | hus | husene / husa |

- Stem ending in `-e`: def sg is `-n` (masc), `-a` (fem), `-t` (neut): hage→hagen, jente→jenta, eple→eplet.
- Plural of `-e` nouns takes `-r`: jente→jenter, kvinne→kvinner.
- Neuter plural: monosyllable → zero (hus, barn, ord, land, år). Polysyllabic neuters mostly take `-er` (problem→problemer, eksempel→eksempler, hotell→hoteller). Compounds follow their head (sykehus→sykehus). Neuters in `-(e)n` go zero (kjøkken, tegn). Always trust the lexicon over these rules.
- Stem syncope in the plural: `-el → -ler` (nøkkel→nøkler), `-er → -re` (finger→fingre; but lærer→lærere, agent nouns keep -e), `-en → -ner`. Definite plural: add `-ne`: nøklene.
- Genitive: clitic `-s` after the NP (bilens, Olas bil). After `s/x/z`: apostrophe `Hans' bok`, or none. Keep the clitic as its own token with `Case=Gen`.

**Irregular plurals (lemma-level, must be in a table):**

| Singular | Def sg | Plural | Def pl |
|---|---|---|---|
| barn | barnet | barn | barna / barnene |
| mann | mannen | menn | mennene |
| bok (f) | boka | bøker | bøkene |
| hånd (f) | hånda / hånden | hender | hendene |
| fot | foten | føtter | føttene |
| far | faren | fedre | fedrene |
| mor | mora / moren | mødre | mødrene |
| bror | broren | brødre | brødrene |
| datter | dattera / datteren | døtre | døtrene |
| tann | tanna / tannen | tenner | tennene |
| tå | tåa / tåen | tær | tærne (?) |
| natt | natta / natten | netter | nettene |
| bonde | bonden | bønder | bøndene |
| ku | kua / kuen | kyr | kyrne (?) |
| gås | gåsa / gåsen | gjess | gjessene |
| øye | øyet | øyne | øynene |
| øre | øret | ører | ørene |
| kne | kneet | knær | knærne |
| tre | treet | trær | trærne |
| rot | rota / roten | røtter | røttene |
| land | landet | land (?) | landa / landene |

**Mass and singular-only nouns.** Flag `plural:none` (melk, tid, arbeid, snø) so no plural is generated.

### B2. Adjectives

**Agreement.**
- Indefinite and predicative: base (en/ei stor bil), neuter `-t` (et stort hus), plural and definite `-e` (store hus, den store bilen).
- Predicative: `Bilen er stor. Huset er stort. Bilene er store.`
- Neuter `-t` is not added when the adjective already ends in:
  - `-t` after a vowel+t or a consonant+t cluster (fast→fast, svart→svart).
  - `-ig` (ferdig, viktig).
  - `-sk` (norsk).
  - `-ende`, `-a` participles, and loan adjectives in stressed vowel (bra, gratis, rosa, stille) are invariable.
- Consonant doubling and dropping in neuter: pen→pent, ren→rent, grønn→grønt, tom→tomt, ny→nytt, blå→blått, grå→grått, god→godt, vakker→vakkert, åpen→åpent, gammel→gammelt.
- Syncope before `-e`: gammel→gamle, vakker→vakre, åpen→åpne, sulten→sultne.
- Irregular: **liten** = masc liten, fem lita (or liten), neuter lite, plural små, definite lille ("den lille gutten"). **egen** = eget, egne. **annen** = annet, andre.
- Participles as adjectives take `-t/-et` and `-e`: stjålet→stjålne, kokt→kokte, stengt→stengte.

**Comparison.**
- Regular: `-ere` / `-est` (ny→nyere→nyest, rask→raskere→raskest). Comparative has no agreement. The superlative indefinite is invariable (`størst`). The definite takes `-e` (`den største`).
- `mer / mest` + adjective for polysyllables, adjectives in `-ig / -sk / -isk / -som`, participles, and adverbs. Example: `mer interessant`, `mest spennende`.
- Irregular: stor→større→størst; lang→lengre→lengst; ung→yngre→yngst; gammel→eldre→eldst; god/bra→bedre→best; dårlig/ille→verre→verst; liten→mindre→minst; mye→mer→mest; mange→flere→flest; lite→mindre→minst; gjerne→heller→helst; nær→nærmere→nærmest.

**Adverbs.** Usually the neuter form: pent, fort, godt, bra. A few differ (gjerne).

**Double definiteness.**
- `den store bilen`, `det store huset`, `de store husene`.
- Rule: determiner (den/det/de) + adjective-`e` + definite noun.
- Without an adjective: plain `bilen`, no determiner. With a possessive: `min store bil` (indefinite noun) or `den store bilen min` (definite noun and postposed possessive).
- Common error to flag: `min bilen`, `den stor bil`.

### B3. Determiners, demonstratives, possessives, pronouns

- **Articles:** indefinite en/ei/et; definite via suffix.
- **Demonstratives:** denne/dette/disse (this/these). Both take definite nouns: `denne bilen`, `dette huset`, `disse husene`. `den/det/de` as demonstratives (that): `den bilen`.
- **Other determiners:** all, hele, halve, begge, hver/hvert, noen/noe, ingen, annen, samme, slik/sånn.
- **Personal pronouns.**

| Person | Subject | Object | Notes |
|---|---|---|---|
| 1sg | jeg | meg | |
| 2sg | du | deg | |
| 3sg m | han | ham | `han` as object is colloquial |
| 3sg f | hun | henne | |
| 3sg n / inanimate | det / den | det / den | den for en/ei nouns, det for et nouns |
| 1pl | vi | oss | |
| 2pl | dere | dere | polite De / Dem / Deres exists but is rare |
| 3pl | de | dem | |
| reflexive | | seg | |

- **Possessives (can come before or after the noun):**
  - 1sg: min / mi / mitt / mine
  - 2sg: din / di / ditt / dine
  - 1pl: vår / vårt / våre
  - Invariable: hans, hennes, dens/dets, deres
  - Reflexive: sin / si / sitt / sine
- **Forms agree with the possessed noun, not with the possessor.** `mi` and `di` are feminine and optional (`min mor` is also valid).
- **Position:**
  - Before the noun: `min bil` (noun indefinite).
  - After the noun: `bilen min` (noun definite). This is the normal, unmarked pattern for kin and everyday objects (`mora mi`, `bilen din`).
- **Reflexive `sin/si/sitt/sine`:** refers back to the subject of its own clause and is used only for third person.
  - `Han tok bilen sin` = his own car.
  - `Han tok bilen hans` = someone else's.
  - Inside the subject NP use `hans/hennes`, not sin: `Han og sønnen hans`. Not `sønnen sin`.
  - First and second person use min/din.
- **Relative pronoun:** `som` (subject or object, indeclinable); `hvis` (whose, formal); `det som`; `hva`.
- **Interrogatives:** hvem (who), hva (what), hvilken/hvilket/hvilke (which), hvor (where; also "how" before adjectives: hvor stor), hvordan, hvorfor, når, hvor mye/mange.
- **Indefinite:** noen, noe, ingen, ingenting, alle, alt, hver.

### B4. Verbs

**Forms.**
- Infinitive with `å` (marker, not a preposition): `å lese`. Bare infinitive after modals and `la/se/høre/få/bruke`.
- Present: stem + `-er` (kaste→kaster). Verbs in a vowel: `-r` (bo→bor, se→ser, gå→går).
- Past and participle by class (weak verbs):

| Class | Example | Pret | Perf. part |
|---|---|---|---|
| 1 `-et`/`-a` | kaste | kastet / kasta | kastet / kasta |
| 2 `-te` / `-t` | kjøpe | kjøpte | kjøpt |
| 3 `-de` / `-d` | leve, bygge | levde, bygde | levd, bygd |
| 4 `-dde` / `-dd` | bo, tro, nå | bodde, trodde, nådde | bodd, trodd, nådd |

- Heuristics for unknown verbs: stem in `-ere` gives `-erte/-ert`; stressed vowel gives `-dde`; unvoiced consonant or `-r` gives `-te`; voiced stem gives `-de`; otherwise `-et`. Always override from the lexicon.
- **Strong verbs** change the stem vowel. The pattern is irregular and listed below.
- **Imperative** = bare stem: `les! kom! spis!`. Verbs keep `-e` after a consonant cluster ending in n/l/r (åpne!, sykle!, lagre!). Monosyllables: `ta! se! gå! la!`.
- **Perfect:** `har` + participle (supine). Past perfect `hadde` + supine. `er` + participle is possible only with a few verbs of motion or change (er kommet, er gått) and is a resultative reading. Default to `har`.
- **Future:** `skal` / `vil` + infinitive, or `kommer til å` + infinitive.
- **Modals:** kan / skal / vil / må / bør (+ tør), all + bare infinitive. Past: kunne, skulle, ville, måtte, burde, torde. Participles: kunnet, skullet, villet, måttet, burdet, turt. Perfect with modals: `har kunnet`, and `kunne ha gått` ("could have gone").
- **Passive:**
  - `bli` + participle: `Boken ble lest`.
  - `-s` passive: infinitive/present + `-s` (`Det snakkes norsk`, `Boka leses`). The `-s` forms overlap with deponent verbs, which must be listed as their own lemmas: synes, finnes, trives, minnes, kjennes.
  - The `-s` passive is not used for the past tense in common speech.
- **Reflexive:** sette seg, glede seg, kjede seg, føle seg.
- **Semi-auxiliaries:** `holde på å`, `komme til å`, `være i ferd med å`, `pleie å`, `få` + participle/inf.

**The roughly 65 most frequent irregular/strong verbs.** nb forms = infinitive / present / preterite / supine. nn = infinitive / present / preterite / participle, based on Nynorskordboka patterns. Cells marked (?) need checking against the lexicon. (Lead's note: several nb cells here are plain weak verbs listed for the nb↔nn contrast; the whole table is a check list for the build step, not data.)

| # | nb | nn |
|---|---|---|
| 1 | være / er / var / vært | vere, vera / er / var / vore |
| 2 | ha / har / hadde / hatt | ha, hava / har / hadde / hatt |
| 3 | gjøre / gjør / gjorde / gjort | gjere, gjera / gjer / gjorde / gjort |
| 4 | bli / blir / ble (blei) / blitt | bli, verte / blir, vert / blei, vart / blitt, vorte |
| 5 | komme / kommer / kom / kommet | kome, koma / kjem / kom / kome (?) |
| 6 | gå / går / gikk / gått | gå / går / gjekk / gått |
| 7 | se / ser / så / sett | sjå / ser / såg / sett |
| 8 | si / sier / sa / sagt | seie, seia / seier / sa / sagt |
| 9 | ta / tar / tok / tatt | ta, take / tek, tar / tok / teke, tatt (?) |
| 10 | gi / gir / ga (gav) / gitt | gje, gi / gjev, gir / gav / gjeve, gitt (?) |
| 11 | få / får / fikk / fått | få / får / fekk / fått |
| 12 | finne / finner / fant / funnet | finne, finna / finn / fann / funne |
| 13 | vite / vet / visste / visst | vite, veta / veit / visste / visst |
| 14 | kunne / kan / kunne / kunnet | kunne / kan / kunne / kunna |
| 15 | skulle / skal / skulle / skullet | skulle / skal / skulle / skulla |
| 16 | ville / vil / ville / villet | ville / vil / ville / vilja (?) |
| 17 | måtte / må / måtte / måttet | måtte / må / måtte / måtta |
| 18 | burde / bør / burde / burdet | burde / bør / burde / burda |
| 19 | la / lar / lot / latt | late, la / let, lar / lét / late (?) |
| 20 | holde / holder / holdt / holdt | halde / held / heldt / halde |
| 21 | stå / står / sto (stod) / stått | stå / står / stod / stått |
| 22 | sitte / sitter / satt / sittet | sitje, sitja / sit / sat / site |
| 23 | ligge / ligger / lå / ligget | liggje, ligge / ligg / låg / ligge |
| 24 | legge / legger / la / lagt | leggje, legge / legg / la / lagt, lagd |
| 25 | sette / setter / satte / satt | setje, sette / set / sette / sett (?) |
| 26 | sove / sover / sov / sovet | sove, sova / søv / sov / sove(t) (?) |
| 27 | skrive / skriver / skrev / skrevet | skrive, skriva / skriv / skreiv / skrive |
| 28 | lese / leser / leste / lest | lese, lesa / les / las / lese |
| 29 | spise / spiser / spiste / spist | ete, eta / et / åt / ete (?) (nn "spise" also exists) |
| 30 | drikke / drikker / drakk / drukket | drikke / drikk / drakk / drukke |
| 31 | drive / driver / drev / drevet | drive, driva / driv / dreiv / drive |
| 32 | dra / drar / dro / dratt | dra, draga / dreg / drog / dradd, dratt (?) |
| 33 | fare / farer / for / faret | fare, fara / fer / for / fare |
| 34 | kjøre / kjører / kjørte / kjørt | køyre / køyrer / køyrde / køyrt (?) |
| 35 | kjøpe / kjøper / kjøpte / kjøpt | kjøpe / kjøper / kjøpte / kjøpt |
| 36 | tenke / tenker / tenkte / tenkt | tenkje, tenke / tenkjer, tenker / tenkte / tenkt |
| 37 | tro / tror / trodde / trodd | tru, tro / trur / trudde / trudd |
| 38 | bo / bor / bodde / bodd | bu / bur / budde / budd |
| 39 | leve / lever / levde / levd | leve, leva / lever / levde / levd |
| 40 | betale / betaler / betalte / betalt | betale / betalar / betalte / betalt |
| 41 | gråte / gråter / gråt / grått | gråte, gråta / græt / gret / grete |
| 42 | hete / heter / het / hett | heite, heita / heiter / heitte / heitt |
| 43 | springe / springer / sprang / sprunget | springe, springa / spring / sprang / sprunge |
| 44 | synge / synger / sang / sunget | syngje, synge / syng / song / sunge |
| 45 | svømme / svømmer / svømte / svømt | symje / sym / sumde / sumt (?) |
| 46 | gripe / griper / grep / grepet | gripe / grip / greip / gripe |
| 47 | bite / biter / bet / bitt | bite / bit / beit / bite |
| 48 | skjære / skjærer / skar / skåret | skjere / skjer / skar / skore |
| 49 | slå / slår / slo / slått | slå / slår / slo / slått |
| 50 | treffe / treffer / traff / truffet | treffe, treffa / treff / traff / truffe |
| 51 | trekke / trekker / trakk / trukket | trekkje, trekke / trekk / trakk / trukke |
| 52 | bryte / bryter / brøt / brutt | bryte / bryt / braut / broten (?) |
| 53 | velge / velger / valgte / valgt | velje / vel / valde / valt |
| 54 | selge / selger / solgte / solgt | selje / sel / selde / seld, selt (?) |
| 55 | fortelle / forteller / fortalte / fortalt | fortelje / fortel / fortalde / fortalt |
| 56 | sende / sender / sendte / sendt | sende / sender / sende / sendt |
| 57 | stjele / stjeler / stjal / stjålet | stele / stel / stal / stole |
| 58 | forstå / forstår / forsto / forstått | forstå / forstår / forstod / forstått |
| 59 | begynne / begynner / begynte / begynt | byrje, begynne / byrjar / byrja / byrja (?) |
| 60 | hjelpe / hjelper / hjalp / hjulpet | hjelpe, hjelpa / hjelper / hjalp / hjelpt (?) |
| 61 | vinne / vinner / vant / vunnet | vinne, vinna / vinn / vann / vunne |
| 62 | dø / dør / døde / dødd | døy / døyr / døydde / døydd |
| 63 | skyte / skyter / skjøt / skutt | skyte / skyt / skaut / skote |
| 64 | fly / flyr / fløy / fløyet | fly, flyge / flyg / fløy / floge (?) |
| 65 | be / ber / ba (bad) / bedt | be / bed, ber / bad / bede |
| 66 | bære / bærer / bar / båret | bere / ber / bar / bore |
| 67 | stige / stiger / steg / steget | stige / stig / steig / stige |
| 68 | ri / rir / red / ridd | ri / rid / reid / ride (?) |

### B5. Particle verbs

- Treat particle verbs as multi-word lexicon entries: `stå opp`, `finne ut`, `gå ut`, `komme tilbake`, `gi opp`, `slå på/av`, `ta på seg`, `skrive ned`, `se ut`, `like … godt`, `holde på med`, `holde på å`.
- The particle is an adverb and takes stress. It follows the verb.
- With a pronoun object the pronoun goes before the particle: `Jeg slår den på`, not `slår på den`.
- With a noun object both orders occur: `slår på TV-en / slår TV-en på`. Adverbs can intervene: `Jeg står alltid opp tidlig`.
- Inversion works: `Klokka sju står jeg opp`.
- Matching rule: allow up to about 4 tokens between verb and particle inside the same clause; in a subordinate clause the order is `at jeg står opp`; a preposition + object phrase (se **på** bilen) cannot split: `Bilen ser jeg på`.
- Test for a particle verb: if the word can follow a pronoun object, it is a particle.
- `holde på med X` = be busy with X. `holde på å + inf` = be in the middle of / be about to. `like NP godt` = "like NP" (godt adverbial).
- Inseparable prefix verbs: be-, for-, mis-, er- (forstå, bestille, mislykkes). These do not split.

### B6. Compounds

- Head-final: the last element decides gender, plural, and inflection. `et kjøkkenbord`, `kjøkkenbordet`.
- Examples: bil+nøkkel→bilnøkkel (en nøkkel); barn+hage→barnehage (en/ei hage); kjøkken+bord→kjøkkenbord; fotball+kamp→fotballkamp.
- Linking elements ("fuge"): `-s-` (arbeidstid, fødselsdag), `-e-` (gutteværelse), none (bilnøkkel).
  - `-s-` is regular after the suffixes `-ing`, `-ning`, `-sjon`, `-het`, `-skap`, `-dom`, `-else`, `-tet`, and in many words in `-ør / -d / -t`. Example: utdanningssystem, kjærlighetshistorie.
  - Do not insert `-s-` after a vowel-final weak noun without `-e`: `barnehage`.
  - `-e-` is lexicalised (gutteværelse, kvinnehistorie): treat as a possible fuge.
  - When three identical consonants meet, Norwegian keeps all three letters (?). Check, do not elide.
- **Decomposition algorithm:**
  1. Look up the whole word. If it is a lexical entry (kjæreste, bilde, barnebarn), stop. Compound-analysis is a fallback for unknown words.
  2. Otherwise try all splits where every part is ≥3 letters (≥4 for the head unless in a whitelist like `bok`, `hus`, `bil`, `tid`, `dag`, `sted`, `mann`).
  3. Allow fuge `{ "", "s", "e" }` between parts.
  4. Each non-final part must match a lemma (or its compound form) in the lexicon. The head must match a noun, adjective, or verb stem and fix the word class.
  5. Score by (a) fewest parts, (b) highest min log-frequency of the parts, (c) head frequency. Reject if a part is below frequency threshold.
  6. Output `parts[]`, `head`, `fuge`, `confidence`. Keep at most 3 levels deep.
- **When not to split** (false positives): `bilde` (not bil+de), `stolen`, `ballett`, `sykkel`, `fjern`; short function-word parts (`ha`, `bi`, `de`, `en`, `et`, `på`, `av`); lexicalised compounds; hyphenated or numeric compounds; names. Prefer the whole-word lexicon entry whenever it exists.

### B7. Word order

- **V2 in main clauses:** the finite verb is the second constituent. `Jeg kommer i morgen.` / `I morgen kommer jeg.` Yes/no questions put the verb first: `Kommer du i morgen?` Wh-questions: `Hvorfor kommer du ikke?`
- **Sentence adverbs and negation in main clauses:** after the finite verb (and after the subject when the subject follows the verb): `Jeg kommer ikke.` `I morgen kommer jeg ikke.` `Jeg har ikke sett den.` The adverbs `ofte, aldri, alltid, bare, også, jo, nok, vel, da` follow the same position.
- **Subordinate clauses:** the subject and the sentence adverb come *before* the finite verb: `Jeg vet at han ikke kommer.` / `fordi jeg ikke har tid.`
- Subordinators: at, fordi, når, hvis, om, som, selv om, mens, da, før, etter at, siden, slik at, for at, dersom, til (until).
- **Spoken:** V2 is sometimes used in subordinate clauses after `at` or `fordi`. Do not mark it as an error.
- **Time-manner-place** is the default order of adverbials.
- Negation: `ikke`, `aldri`, `ingen/ingenting/ikke noe`, `heller ikke` (inversion: `Det gjør jeg heller ikke`). Answers: `ja`, `nei`, `jo` (yes to a negative question).

### B8. Learner traps (tag as `trap` objects)

1. **å vs og:** å is the infinitive marker, og is "and"; they sound alike in speech.
2. **da vs når:** `da` = a single past event; `når` = habitual, repeated, future, and questions.
3. **sin vs hans:** B3.
4. **har vs er** as perfect auxiliary: use `har`.
5. **Prepositions:** `i` (inside, periods), `på` (surface, events, institutions, islands), `til`, `hos` (at a person's place), `fra`, `av`, `med`, `om`.
6. **Adjective agreement:** neuter `-t`, plural `-e`.
7. **Definiteness after possessive:** `bilen min` vs `min bil`, never `min bilen`.
8. **vite vs kjenne vs kunne:** know a fact / know a person or place / know how to.
9. **mye vs mange** (mass vs count), **noe vs noen**.
10. **Pronoun for inanimate:** `den` (en/ei nouns), `det` (et nouns). Dummy subjects: `det regner`, `det er`, `det finnes`.
11. **`lagd/laga` vs `lagt`** and similar `-a` / `-et` variation is not an error.

### B9. Function-word inventory (about 150, Bokmål)

- **Articles and determiners:** en, ei, et, den, det, de, denne, dette, disse, all, alt, alle, hele, halve, begge, hver, hvert, noen, noe, ingen, ingenting, annen, annet, andre, samme, slik, sånn, mange, mye, litt, få, flere, flest, mer, mest.
- **Pronouns:** jeg, du, han, hun, vi, dere, de, meg, deg, ham, henne, oss, dem, seg, min, mi, mitt, mine, din, di, ditt, dine, hans, hennes, vår, vårt, våre, deres, sin, si, sitt, sine, man, en (impersonal), selv.
- **Wh- and relatives:** hvem, hva, hvilken, hvilket, hvilke, hvor, hvordan, hvorfor, når, som, hvis.
- **Auxiliaries and copulas:** være, er, var, vært, ha, har, hadde, hatt, bli, blir, ble, blitt.
- **Modals and light verbs:** kan, kunne, skal, skulle, vil, ville, må, måtte, bør, burde, tør, få, får, fikk, la, lar.
- **Prepositions:** i, på, til, fra, av, med, om, for, ved, over, under, mot, mellom, gjennom, etter, før, uten, hos, blant, rundt, ifølge, på grunn av.
- **Conjunctions and subordinators:** og, eller, men, for, så, at, fordi, hvis, om, mens, når, da, siden, før, etter at, selv om, slik at, enten ... eller, både ... og.
- **Adverbs:** ikke, aldri, alltid, ofte, noen ganger, også, bare, kun, jo, nok, vel, kanskje, ja, nei, her, der, hit, dit, hjem, hjemme, ute, inne, opp, ned, inn, ut, tilbake, fram/frem, bort, nå, da, så, igjen, ennå, fremdeles, allerede, snart, nesten, veldig, ganske, helt, svært, enda, mer, mest, bra, godt, mye.
- **Numerals and quantifiers:** en/ett, to, tre, første, andre.
- **Particles:** å (infinitive marker).

### B10. Nynorsk counterparts, differing items (nb → nn)

**Systematic spelling and morphology rules (apply before the table):**
- `hv- → kv-`: hvem→kven, hva→kva, hvilken→kva for ein / kva slags, hvit→kvit, hver→kvar, hvorfor→kvifor, hvordan→korleis.
- `-lig → -leg` (vanskelig→vanskeleg, dårlig→dårleg).
- `-het → -heit` (lexical; frihet→fridom).
- `hjem → heim` (hjemme→heime).
- `vei → veg`.
- Verb infinitive: both `-a` and `-e` valid (kaste/kasta).
- Present: a-verbs `-ar` (kastar), other weak verbs `-er`, strong verbs bare stem (skriv, les, set, tek).
- Past: a-verbs `-a` (kasta), others `-te/-de/-dde` (kjøpte, levde, budde).
- Participle: `-a / -t / -d`.
- Passive `-st` (kastast, finnast, lesast).
- Nouns: three genders always, no common-gender option. Masc plural `-ar` (bilar), def pl `-ane` (bilane). Fem plural `-er` (bøker), def pl `-ene`; def sg `-a` (boka). Neut plural zero (hus), def pl `-a` (husa). Articles ein/ei/eit.
- Adjectives work like Bokmål: neuter `-t`, plural/definite `-e`; `liten, lita, lite, små; lille`.
- Double definiteness is the same: den store bilen.
- V2 and subordinate order identical.

**Lexical table (frequent differences):**

| nb | nn | | nb | nn |
|---|---|---|---|---|
| jeg | eg | | ikke | ikkje |
| hun | ho | | hvem | kven |
| han (obj ham) | han (obj honom) | | hva | kva |
| de (they) | dei | | hvor (where) | kvar |
| dem | dei | | hvor (how) | kor |
| dere | de (subj), dykk (obj) | | hvilken | kva for ein / kva slags |
| deres (your pl) | dykkar | | hvordan | korleis |
| deres (their) | deira | | hvorfor | kvifor |
| hennes | hennar | | når | når |
| hans | hans | | da (then) | då |
| noen | nokon | | nå | no, nå |
| noe | noko | | mye | mykje |
| ingen | ingen | | bare | berre |
| også | òg, også | | fra | frå |
| mens | medan | | siden | sidan |
| hvis | viss, dersom | | selv | sjølv |
| selvfølgelig | sjølvsagt | | fremdeles | framleis |
| ennå | enno | | sammen | saman |
| hjem | heim | | hjemme | heime |
| vei | veg | | sted | stad |
| uke | veke | | måned | månad |
| gang | gong | | ting | ting |
| barn (pl) | born / barn | | hjerte | hjarte |
| øye | auge | | øre | øyre |
| hode | hovud | | gutt | gut |
| venn | ven | | søster | syster, søster |
| kjøkken | kjøken | | melk | mjølk |
| gammel | gammal | | dårlig | dårleg |
| vanskelig | vanskeleg | | viktig | viktig |
| være | vere, vera | | ha | ha, hava |
| gjøre | gjere | | komme | kome |
| se | sjå | | si | seie |
| gi | gje, gi | | høre | høyre |
| spørre | spørje, spørre | | begynne | byrje, begynne |
| tenke | tenkje, tenke | | hete | heite |
| bruke | bruke | | trenge | trenge, trengje |
| spise | ete, spise | | kjøre | køyre |
| bli | bli, verte | | trenger | treng |
| frem/fram | fram | | etter | etter |
| ut | ut | | tilbake | tilbake |

Items believed identical in both standards (do not need pairs): og, men, eller, at, om, i, på, til, med, av, for, over, under, ut, inn, opp, ned, her, der, så, ja, nei, god, stor, ny, liten, tid, dag, natt, kveld, bil, hus, bok, by, land, mann, kvinne, jente, mor, far, bror, hånd.

For the 300 most frequent words: take the frequency list for each standard separately (Part C), match by this table plus the rules, and review the rest by hand.

---

## PART C. Frequency and resources (described only; nothing downloaded)

| Resource | What | Licence | Ship in client app? | Source |
|---|---|---|---|---|
| **Norsk ordbank, Bokmål 2005** (Språkbanken) | Lexicon with word class and inflection, 154,824 lemmas, snapshot 2022-02-01. Files: `norsk_ordbank_argstr.txt`, `norsk_ordbank.pdf`, two `.tar.gz` archives (Oct 2019 and Feb 2022). | CC BY 4.0, open data | Yes, with attribution | https://data.norge.no/en/datasets/f0db926d-a154-3a12-82b8-6573b57f6dbb/norsk-ordbank-norwegian-bokmal-2005 ; https://www.nb.no/sprakbanken/?p=30527 |
| **Norsk ordbank, Nynorsk 2012** | Same type of lexicon for Nynorsk | CC BY 4.0 (per catalog digests) | Yes, with attribution | https://www.nb.no/sprakbanken/?p=31088 (licence detail not read on the page; confirm on the live catalog) |
| **Bokmålsordboka and Nynorskordboka (Ordbøkene.no)**, Univ. Bergen and Språkrådet | Dictionary content "openly available for download… for any purpose, including commercial" | CC BY 4.0. Required credit: "Bokmålsordboka/Nynorskordboka, Universitetet i Bergen og Språkrådet, ordbøkene.no, CC-BY 4.0" | Yes, with that credit. Prefer shipping the data over calling the API at runtime. The API reportedly needs a key on request. | https://ordbokene.no/eng/about/open-data |
| **kaikki.org, Norwegian Bokmål** | Wiktextract output, English Wiktionary. Index page: 91,352 word senses. File page: `kaikki.org-dictionary-NorwegianBokmål.jsonl`, 83.5 MB, 74,834 entries. Marked "DEPRECATED, will be removed in the near future". | Same licences as Wiktionary: CC BY-SA and GFDL | Yes if BY-SA is honoured. The data derivative must be shared under CC BY-SA. Keep the code separate. Not legal advice. | https://kaikki.org/dictionary/Norwegian%20Bokm%C3%A5l/index.html |
| **kaikki.org, Norwegian Nynorsk** | `kaikki.org-dictionary-NorwegianNynorsk.jsonl`, 63.5 MB. Index page: 72,931 senses. File page: 58,100 entries. Also deprecated. | CC BY-SA / GFDL | As above | https://kaikki.org/dictionary/Norwegian%20Nynorsk/index.html |
| **kaikki raw data** | The deprecation notice points to https://kaikki.org/dictionary/rawdata.html. English edition raw file `raw-wiktextract-data.jsonl`, 23.9 GB uncompressed, 2.8 GB compressed, from the 2026-09-02 dump. Filter by `lang_code` nb/nn. | Same as Wiktionary | Not practical to ship. Build-time source only. | |
| **Språkbanken N-gram / unigram frequency lists** (bokmål and nynorsk) | Built from the Norwegian Newspaper Corpus plus NST news text, 1,175 million words. Unigram lists as a separate download, and a top-1000 list. | CC0 (per search digest) | Yes. Check the exact file in the catalog. | https://nb.no/sprakbanken/?p=21264 and https://www.nb.no/sprakbanken/ressurskatalog/ |
| **NBdigital public-domain texts** | 26,344 books, Bokmål, Nynorsk and "Norwegian" | CC0 (per search digest) | Yes | Språkbanken catalog |
| **NB Uttale** | Pronunciation lexicon, 785,000 words, transcribed in five dialect areas (East, Southwest, West, Trøndersk, North). Built for speech technology. | CC0 | Yes | https://nb.no/sprakbanken/?p=21764 (search digest) |
| **NorKompLeks** | Only a mention of a project on style and pronunciation information in dictionaries for immigrants was found. No downloadable resource under this name located. | unknown | unknown | |
| **NB Ordbok** | No separate resource under this name found. | unknown | unknown | |

**Which to use for what.**
- Morphology: Norsk ordbank (both standards).
- Frequency: Språkbanken N-gram unigram lists, or counts from the project's own corpus. Do not use the kaikki entries as a frequency source.
- Definitions and glosses: Ordbøkene (Norwegian definitions) and kaikki (English glosses).
- Pronunciation: NB Uttale.

### C2. UD treebanks as an independent held-out evaluation set

Both treebanks come from the Norwegian Dependency Treebank (NDT, developed 2011–2014 at the National Library). Genres are news, blog, and nonfiction.

| | UD_Norwegian-Bokmaal | UD_Norwegian-Nynorsk |
|---|---|---|
| Size | 311,277 tokens, 20,045 sentences (page fetched 2026-10-07). A search digest gave 310,221 tokens and 20,044 sentences, probably a different release. | 301,353 tokens, 17,575 sentences |
| Licence | CC BY-SA 4.0 | CC BY-SA 4.0 |
| Splits | train 15,696 / dev 2,410 / test 1,939 sentences | train, dev and test constructed by Petter Hohle |
| Lemma/POS | Manual, non-UD style, auto-converted. Conversion by Ingerid Løyning Dale, Per Erik Solberg and Andre Kåsen. Features follow the Oslo-Bergen Tagger scheme. | Same, but the conversion to UD was automatic by Lilja Øvrelid and not manually verified. |

Sources: https://universaldependencies.org/treebanks/no_bokmaal and https://universaldependencies.org/treebanks/no_nynorsk.

**Verdict.** They can serve as an independent held-out set for lemma and morphology accuracy.
- Never tune on dev or test. Use dev and test for held-out measurement, and keep train untouched or unused.
- Independence is limited: the NDT lemmas and tags came from a tagger built on the same Bokmål/Nynorsk lexicons as Ordbank, so coverage numbers against Ordbank-derived analysers will look optimistic; the Nynorsk conversion has known discrepancies from UD; the genres are news, blog, nonfiction, not learner-level text.
- **Distribution:** CC BY-SA 4.0 is fine for evaluation only. Do not ship the treebank inside the app. If derived data is published, share it under BY-SA.
- There is also a UD_Norwegian-NynorskLIA treebank (transcribed speech). Licence and size not verified.

---

## PART D. Pitch accent and pronunciation

**Plain statement.** There is no single "standard" Norwegian pronunciation.
- Språkrådet (via the Q&A in A1) states that there is no official spoken standard and that its norming concerns only written language.
- Språkrådet "Skal vi på sjino?" (https://sprakradet.no/spraksporsmal-og-svar/skal-vi-pa-sjino-om-sammenfallet-av-sj-lyd-og-kj-lyd/): Språkrådet "has not taken an official position for or against" the sj/kj sound change. It recommended in 2001 that speakers keep the traditional distinction. This was later replaced with more general advice.
- The 2001 Språknytt article "Språkrådet gir råd om uttale" returned 404 on fetch. Its content is known only from a search digest: for words where two widespread tone patterns exist, both are acceptable in standard speech, and "tjukk l" may be used as it is in the dialects.

**What to store per word and variant:**
- `ipa` for each `pron_variant` (east, southwest, west, trøndersk, north), taken from NB Uttale (five dialect areas). Mark East as a *reference realisation*, not a norm.
- `tone`: 1 or 2 (tonem). It is contrastive on disyllables: bønder (tone 1) vs bønner (tone 2). Monosyllables carry no contrast. Dialect patterns differ, and for some words both are acceptable, so store tone per variant and allow `both`.
- Retroflex flap / "tjukk l" [ɽ]: an allophone of /l/ in East, Trøndelag and parts of North Norwegian. Retroflexion of `r` + d/l/n/s/t (rd, rl, rn, rs, rt) is also typical of East, Trøndelag and North (not of the southwest and west where r is uvular).
  - NB Uttale documentation v1.0 appeared in a digest as not modelling tone or flaps. That conflicts with the catalog digest of the 785,000-word, five-dialect version. Verify in the actual file before promising flap or tone data.
- Silent or reduced letters (store as a rule layer plus per-word override): `h` before `j` and `v` (hjelp, hvem); final `-d` after n/l/r (land, kald, sand); `-g` in `-ig`, `-lig` (vanskelig [-li]); final `-t` in `det`; `-gt`, `-kt` clusters.
- Sound-to-letter rules: `kj`, `k` before i/y/j, and `tj` give [ç]. `sj`, `skj`, `sk` before i/y/ø, and `rs` give [ʃ] (or [ʂ] in retroflex dialects). `g` before i/y/j gives [j]. `u` is [ʉ], `o` is [u], `y` is [y]. A long vowel precedes a single consonant, a short vowel precedes a double consonant or cluster.
- **Merger:** the /ʃ/ vs /ç/ merger (kj → sj) is in progress. It started with young people in Oslo, Bergen and Stavanger in the 1980s and has spread since (Språkrådet, "Skal vi på sjino?"). Store both `kj` and `sj` as phonemic spellings. Do not mark the merged pronunciation as wrong. Offer an optional "distinguish" flag.
- Nynorsk: Språkrådet says Nynorsk has "more flexible" utterance norms. Do not attach a Nynorsk-specific reference accent. Use the dialect variants.

---

## E. What could not be verified

1. All Språkrådet and SNL wording above comes through the fetch digest or search snippets. The 2025 "Retningslinjer for normering" PDFs (bokmål and nynorsk versions) were listed in search results but returned 404 on fetch, and the Jahr PDF could not be read. A person should read the live pages before the quotes go into user-facing docs.
2. The Språkrådet English page (nb vs nn) did not repeat the "written dialects" sentence. It came only from a search digest.
3. Språklova § numbers are not confirmed. Only the substance is.
4. The detail of the 1862 and 1917 reforms (capital letters on nouns, `aa`→`å`, feminine gender) is background knowledge, not checked against a source.
5. The 1 July effective date for both 2005 and 2012 reforms came from search digests. SNL says "summer".
6. No Norwegian variant subtags in the IANA registry: based on a digest of the registry.
7. NB Uttale: the 785,000-word, five-dialect, CC0 description is from a search digest of the catalog. The v1.0 documentation PDF digest said about 100,000 words, East only, no tone, no flaps. These conflict. NB Uttale's tone and flap coverage is not established.
8. Licences for Norsk ordbank Nynorsk and for the N-gram/frequency lists were not read from the catalog pages themselves. Verify in the Språkbanken catalog before shipping.
9. NorKompLeks and NB Ordbok: no downloadable resource under those names found.
10. The Ordbøkene API rate limits and key requirement: not confirmed. Download files, formats and sizes for the dictionaries were not given on the open-data page.
11. kaikki counts differ between the index page and the file page (91,352 senses vs 74,834 entries; 72,931 vs 58,100). The deprecation notice is on both files.
12. UD token counts differ between two digests (311,277 vs 310,221). Use the figure from the release actually pinned.
13. UD_Norwegian-NynorskLIA licence and size: not checked.
14. All of Part B (including every nn cell marked (?)) was written from the agent's own knowledge and not checked against Ordbank or Ordbøkene. The strong-verb table and the nb↔nn table should be auto-checked against both lexicons as a build step. Anything the lexicon contradicts is a bug in this spec, not in the lexicon.
15. A few lines in the B1 irregular-plural table contain deliberate (?) marks (tå, ku, land). Fix them from Ordbank.
