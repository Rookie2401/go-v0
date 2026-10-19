# Hebrew: audit on rabbinic texts (no gold) — 2026-10-19

Texts: Mishnah Berakhot and Pirkei Avot, Sefaria's Torat Emet 357 edition (public domain, pointed), `data/raw/audit-texts/sefaria`; the first
4000 word tokens of each, read sentence by sentence by adapter-he@1 with the Biblical and Modern indexes installed. No Mishnaic
index exists: the analyser knows Mishnaic Hebrew from dictionary labels only, so each text is read twice, once as a reader would meet it
(nothing declared) and once with Mishnaic declared, to show what the declaration changes. There is no gold, so lemma agreement is not stated.

| text | declared | word tokens | sentences | covered | confident first reading | ambiguous (of covered) | sentences read as (expected) |
|---|---|---|---|---|---|---|---|
| Mishnah Berakhot (Torat Emet 357, pointed) | — | 2174 | 171 | 94.6 % | 87.9 % | 36.0 % | he-bib 131, he-mod 40 (he-mish (Mishnaic Hebrew)) |
| Mishnah Berakhot (Torat Emet 357, pointed) | he-mish | 2174 | 171 | 94.6 % | 87.9 % | 53.7 % | he-mish 73, he-bib 62, he-mod 36 (he-mish (Mishnaic Hebrew)) |
| Pirkei Avot (Torat Emet 357, pointed) | — | 4029 | 234 | 93.2 % | 85.4 % | 36.6 % | he-bib 182, he-mod 52 (he-mish (Mishnaic Hebrew)) |
| Pirkei Avot (Torat Emet 357, pointed) | he-mish | 4029 | 234 | 93.2 % | 85.4 % | 49.4 % | he-bib 114, he-mish 83, he-mod 37 (he-mish (Mishnaic Hebrew)) |

## Uncovered forms and commonest lemmas, per pass

### Mishnah Berakhot (Torat Emet 357, pointed)
- uncovered forms: שַׁמַּאי ×12, רַשַּׁאי ×5, רַבָּן ×4, שָׁעוֹת ×4, מִקְּרִיאַת ×4, הַפַּרְפֶּרֶת ×4, לִמַּדְתָּנוּ ×3, בִּכְנִיסָתוֹ ×3, טַרְפוֹן ×2, יְצִיאַת ×2, רַשָּׁאִין ×2, תַּלְמִידָיו ×2, אֵינִי ×2, טָבִי ×2, יִתְכַּסֶּה ×2
- commonest first-reading lemmas: אָמַר ×130, עַל ×83, בָרַךְ ×56, לֹא ×51, אֵת ×45, כֹּל ×37, בַּיִת ×36, עַד ×31, הָיָה ×31, אִם ×28, רְבָה ×24, אֶחָד ×23

### Mishnah Berakhot (Torat Emet 357, pointed) — declared he-mish
- uncovered forms: שַׁמַּאי ×12, רַשַּׁאי ×5, רַבָּן ×4, שָׁעוֹת ×4, מִקְּרִיאַת ×4, הַפַּרְפֶּרֶת ×4, לִמַּדְתָּנוּ ×3, בִּכְנִיסָתוֹ ×3, טַרְפוֹן ×2, יְצִיאַת ×2, רַשָּׁאִין ×2, תַּלְמִידָיו ×2, אֵינִי ×2, טָבִי ×2, יִתְכַּסֶּה ×2
- commonest first-reading lemmas: אָמַר ×132, עַל ×83, בָרַךְ ×57, לֹא ×51, אֵת ×45, כֹּל ×37, בַּיִת ×36, עַד ×31, הָיָה ×31, אִם ×28, רְבָה ×25, אֶחָד ×23

### Pirkei Avot (Torat Emet 357, pointed)
- uncovered forms: הַבְּרִיּוֹת ×9, מִתַּלְמִידָיו ×5, ג ×5, רַבָּן ×4, הוֹרְקְנוֹס ×4, חֲנִינָא ×4, א ×4, מִתְקַיֶּמֶת ×4, מְרֻבִּין ×4, אֵיזֶהוּ ×4, לְהִתְקַיֵּם ×4, שְׁבִיעִית ×4, שֶׁמָּא ×3, אֵיזוֹהִי ×3, בִשְׁעַת ×3
- commonest first-reading lemmas: אָמַר ×145, כֹּל ×77, עַל ×73, בֵּן ×72, הוּא ×66, לְ ×65, לֹא ×59, תּוֹרָה ×57, אֵת ×55, הָיָה ×53, דָּבָר ×50, אַיִן ×46

### Pirkei Avot (Torat Emet 357, pointed) — declared he-mish
- uncovered forms: הַבְּרִיּוֹת ×9, מִתַּלְמִידָיו ×5, ג ×5, רַבָּן ×4, הוֹרְקְנוֹס ×4, חֲנִינָא ×4, א ×4, מִתְקַיֶּמֶת ×4, מְרֻבִּין ×4, אֵיזֶהוּ ×4, לְהִתְקַיֵּם ×4, שְׁבִיעִית ×4, שֶׁמָּא ×3, אֵיזוֹהִי ×3, בִשְׁעַת ×3
- commonest first-reading lemmas: אָמַר ×162, עַל ×81, כֹּל ×77, לְ ×73, בֵּן ×72, הוּא ×66, לֹא ×59, תּוֹרָה ×57, אֵת ×55, הָיָה ×53, דָּבָר ×50, רְבָה ×50

Reading the numbers: the Torat Emet text is fully pointed, so with nothing declared the period rule's last resort (pointed → Biblical) applies,
and the Biblical index (built from the Tanakh) covers the shared vocabulary; what it cannot cover is Mishnaic morphology and lexis
(the -ִין plural, the שֶׁ- relative, קוֹרִין / אוֹמְרִים participial syntax, Aramaic loans), which appear in the uncovered lists. Declaring
Mishnaic changes the period line but adds no readings: a Mishnaic index (from a tagged rabbinic corpus) is what would.
