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
    "form:de:uhr",
    "lemma:de:verletzen:VERB",
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
  es: list([
    "form:es:carro",
    "form:es:mañana",
    "form:es:película",
    "form:es:tarde",
    "lemma:es:casar:VERB",
    "lemma:es:comer:VERB",
    "lemma:es:gustar:VERB",
  ]),
  fr: list([
    "form:fr:chômage",
    "lemma:fr:chômage:NOUN",
    "lemma:fr:entrer:VERB",
    "lemma:fr:parce:SCONJ",
    "lemma:fr:parfaire:VERB",
    "lemma:fr:saupoudrer:VERB",
  ]),
  he: list([
    "lemma:he:חוֹב:NOUN",
    "lemma:he:יָלַד:VERB",
    "lemma:he:יָשַׁב:VERB",
    "lemma:he:לָהֵן:CONJ",
    "lemma:he:מֵעֶה:NOUN",
  ]),
  hi: list([
    "form:hi:भाव",
    "form:hi:भी",
    "lemma:hi:गौरव:PROPN",
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
    "form:ru:несколько",
    "form:ru:номер",
    "form:ru:платье",
    "form:ru:площадь",
    "form:ru:сейчас",
    "lemma:ru:врач:NOUN",
    "lemma:ru:выписать:VERB",
    "lemma:ru:закрыть:VERB",
    "lemma:ru:занять:VERB",
    "lemma:ru:который:PRON",
    "lemma:ru:номер:NOUN",
    "lemma:ru:окружить:VERB",
    "lemma:ru:очко:NOUN",
    "lemma:ru:перекрыть:VERB",
    "lemma:ru:платье:NOUN",
    "lemma:ru:синоптика:NOUN",
    "lemma:ru:спасть:VERB",
    "lemma:ru:стать:VERB",
  ]),
  sq: list([
    "lemma:sq:kishë:NOUN",
    "lemma:sq:kurs:NOUN",
  ]),
  th: list([
    "form:th:กล้อง",
    "form:th:กิโล",
    "form:th:ชาน",
    "form:th:นัก",
    "form:th:น้ำตาล",
    "form:th:ภาค",
    "form:th:เจ็บ",
    "form:th:เต้น",
    "form:th:เหลือ",
    "form:th:แต่ง",
    "form:th:โล่ง",
    "lemma:th:กล้อง:NOUN",
    "lemma:th:กิโล:NOUN",
    "lemma:th:นัก:ADV",
    "lemma:th:น้ำตาล:NOUN",
    "lemma:th:ภาค:NOUN",
    "lemma:th:เจ็บ:VERB",
    "lemma:th:เจ้า:PRON",
    "lemma:th:เต้น:VERB",
    "lemma:th:แต่ง:VERB",
    "lemma:th:โล่ง:ADJ",
  ]),
};

export const deckKnownLimit = (languageId: string, unitId: string): string | undefined => DECK_KNOWN_LIMITS[languageId]?.[unitId];
