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
    "form:de:dank",
    "form:de:mit",
    "form:de:morgen",
    "form:de:rief",
    "form:de:teilte",
    "form:de:uhr",
    "form:de:zog",
    "lemma:de:verletzen:VERB",
  ]),
  el: list([
    "form:el:σ",
    "form:el:συνιῶσιν",
    "form:el:ἐγένετο",
    "lemma:el:Πλοῦτος:PROPN",
    "lemma:el:βάλλω:VERB",
    "lemma:el:δεύτερος:ADJ",
    "lemma:el:σύνειμι:VERB",
    "lemma:el:τις:PRON",
    "lemma:el:υπολογιστής:NOUN",
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
    "form:nb:av",
    "form:nb:like",
    "form:nb:under",
    "form:nb:unge",
    "lemma:nb:fortsette:VERB",
    "lemma:nb:under:NOUN",
    "lemma:nb:unge:NOUN",
  ]),
  nn: list([
    "form:nn:lys",
    "form:nn:stige",
    "form:nn:unge",
    "lemma:nn:bad:NOUN",
    "lemma:nn:fare:VERB",
    "lemma:nn:få:DET",
    "lemma:nn:kvar:ADV",
    "lemma:nn:skje:VERB",
    "lemma:nn:stige:VERB",
    "lemma:nn:tre:NOUN",
    "lemma:nn:unge:NOUN",
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
    "form:th:กิโล",
    "form:th:ครัว",
    "form:th:ทบ",
    "form:th:นัก",
    "form:th:ประมาณ",
    "form:th:พอก",
    "form:th:ภัย",
    "form:th:ภาค",
    "form:th:ระ",
    "form:th:เสมอ",
    "form:th:เหลือ",
    "form:th:แต่ง",
    "lemma:th:กิโล:NOUN",
    "lemma:th:ครัว:NOUN",
    "lemma:th:ทบ:VERB",
    "lemma:th:นัก:ADV",
    "lemma:th:ประมาณ:ADV",
    "lemma:th:พอก:VERB",
    "lemma:th:ภัย:NOUN",
    "lemma:th:ภาค:NOUN",
    "lemma:th:ระ:VERB",
    "lemma:th:ว่า:SCONJ",
    "lemma:th:อด:VERB",
    "lemma:th:เจ้า:PRON",
    "lemma:th:เสมอ:ADV",
    "lemma:th:เหลือ:VERB",
    "lemma:th:แต่ง:VERB",
  ]),
};

export const deckKnownLimit = (languageId: string, unitId: string): string | undefined => DECK_KNOWN_LIMITS[languageId]?.[unitId];

/**
 * Languages whose written FORM units are never review cards, with the one plain sentence GoReview shows. A form is read in its sentence, but a form card is
 * built from the form read ALONE, which can find a look-alike entry (Korean 게 "crab" for the ending, 거야 as 거 + 이야) and, when it finds the right word,
 * only repeats that word's lemma card. The lemma card, decided in its sentence by the language's review gate, is the card. Not a list of faults: a policy.
 */
export const DECK_NO_FORM_CARDS: Readonly<Record<string, string>> = {
  ko: 'A Korean written form is not made a review card of its own: its meaning read alone can be a look-alike word, and the word has its lemma card.',
};
export const deckNoFormCards = (languageId: string): string | undefined => DECK_NO_FORM_CARDS[languageId];
