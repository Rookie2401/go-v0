/**
 * The KNOWN-LIMITS lists of the deck gate (deck-gate.ts, check (d)): units a reader of the deck audit found to be false or unknown cards on the
 * DEVELOPMENT texts (data/deck-audit/<set>/dev.txt) that no rule of the gate catches: the analyser reads the written word as another word, or the
 * first meaning of the entry is not the word's ordinary meaning. Why each is listed is in data/deck-audit/<set>/verdicts.json (the reader's note).
 * A unit leaves the list when its reading or meaning is fixed. GENERATED from the verdict files; test/deck-audit/deck-audit.test.ts checks that
 * every unit here has a verdict that says why.
 */
const WHY = 'The deck audit found this word read or glossed wrongly in ordinary text, so it is not made a review card until that is fixed.';
const list = (units: string[]): Readonly<Record<string, string>> => Object.fromEntries(units.map((u) => [u, WHY]));

export const DECK_KNOWN_LIMITS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  arc: list([
    "lemma:arc:לָהֵן:CONJ",
  ]),
  de: list([
    "form:de:an",
    "form:de:mit",
    "form:de:morgen",
  ]),
  el: list([
    "form:el:εἱστήκεισαν",
    "form:el:σ",
    "form:el:συνιῶσιν",
    "form:el:ἀνάστηθι",
    "form:el:ἀνέτειλεν",
    "form:el:ἀναστάς",
    "form:el:ἐπικαλουμένους",
    "lemma:el:Πλοῦτος:PROPN",
    "lemma:el:έναντι:ADV",
    "lemma:el:ίδιος:ADJ",
    "lemma:el:βάλλω:VERB",
    "lemma:el:βάλτος:NOUN",
    "lemma:el:κόσμος:NOUN",
    "lemma:el:ρεύμα:NOUN",
    "lemma:el:σύνειμι:VERB",
    "lemma:el:τις:PRON",
    "lemma:el:υπολογιστής:NOUN",
    "lemma:el:ἄρχω:VERB",
  ]),
  fr: list([
    "lemma:fr:noël:NOUN",
  ]),
  he: list([
    "lemma:he:אָרַז:VERB",
    "lemma:he:אוֹר:NOUN",
    "lemma:he:בָּרִיא:ADJ",
    "lemma:he:חָלַל:VERB",
    "lemma:he:חוֹב:NOUN",
    "lemma:he:חוּם:NOUN",
    "lemma:he:יָשַׁב:VERB",
    "lemma:he:כָּבֵד:NOUN",
    "lemma:he:כָּמַהּ:VERB",
    "lemma:he:לָהֵן:CONJ",
    "lemma:he:נָא:PART",
    "lemma:he:צֵל:NOUN",
    "lemma:he:קָרָא:VERB",
  ]),
  hi: list([
    "lemma:hi:जीना:VERB",
  ]),
  la: list([
    "form:la:aes",
    "form:la:mundus",
    "form:la:propter",
    "lemma:la:adsum:VERB",
    "lemma:la:metior:VERB",
    "lemma:la:salvus:ADJ",
  ]),
  nb: list([
    "lemma:nb:klare:VERB",
  ]),
  nn: list([
    "lemma:nn:tre:NOUN",
  ]),
  ru: list([
    "lemma:ru:очко:NOUN",
    "lemma:ru:синоптика:NOUN",
    "lemma:ru:спасть:VERB",
  ]),
  sq: list([
    "form:sq:na",
    "lemma:sq:kishë:NOUN",
  ]),
  th: list([
    "form:th:ชาน",
    "form:th:นัก",
    "form:th:เต้น",
    "form:th:เหลือ",
    "lemma:th:นัก:ADV",
    "lemma:th:เจ้า:PRON",
    "lemma:th:เต้น:VERB",
  ]),
};

export const deckKnownLimit = (languageId: string, unitId: string): string | undefined => DECK_KNOWN_LIMITS[languageId]?.[unitId];
