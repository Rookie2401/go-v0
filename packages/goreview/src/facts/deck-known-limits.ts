/**
 * The KNOWN-LIMITS lists of the deck gate (deck-gate.ts, check (d)): units a reader of the deck audit found to be false or unknown cards on the
 * DEVELOPMENT texts (data/deck-audit/<set>/dev.txt) that no rule of the gate catches: the analyser reads the written word as another word, or the
 * first meaning of the entry is not the word's ordinary meaning. Why each is listed is in data/deck-audit/<set>/verdicts.json (the reader's note).
 * A unit leaves the list when its reading or meaning is fixed. GENERATED from the verdict files; test/deck-audit/deck-audit.test.ts checks that
 * every unit here has a verdict that says why.
 */
import { AR_LIMITED_LEMMAS } from '../../../../src/adapters/arabic/generated/deck-limits';
import { arKnownLimitOf } from '../../../../src/adapters/arabic/deck';

const WHY = 'The deck audit found this word read or glossed wrongly in ordinary text, so it is not made a review card until that is fixed.';
const list = (units: string[]): Readonly<Record<string, string>> => Object.fromEntries(units.map((u) => [u, WHY]));

export const DECK_KNOWN_LIMITS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // Arabic: units a reader found false that no rule catches (the generated sweep list, generated/deck-limits.ts, is reached separately by deckKnownLimit)
  ar: list([
    "lemma:ar:طَلْق:NOUN",
    "lemma:ar:صَبَاح:NOUN",
  ]),
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

/**
 * Arabic's known limits are GENERATED from a sweep of the pack's development sets (scripts/ar-deck-limits.mts -> src/adapters/arabic/generated/deck-limits.ts) and are
 * reached here, not copied: a written form (`form:ar:<key>`) or a lexeme (`lemma:ar:<head>:<POS>`) the sweep found credited to the wrong word.
 */
const arabicKnownLimit = (unitId: string): string | undefined => {
  if (unitId.startsWith('lemma:ar:')) {
    const m = /^lemma:ar:(.*):([A-Z]+)$/u.exec(unitId);
    const why = m ? (AR_LIMITED_LEMMAS as Record<string, string>)[`${m[1]}|${m[2]}`] : undefined;
    return why ? `This lexeme is credited to a misread spelling (${why}), so it is not made a review card.` : undefined;
  }
  if (unitId.startsWith('form:ar:')) {
    const why = arKnownLimitOf(unitId.slice('form:ar:'.length));
    return why ? `This spelling is known to be read as another word (${why}), so it is not made a review card.` : undefined;
  }
  return undefined;
};

export const deckKnownLimit = (languageId: string, unitId: string): string | undefined => DECK_KNOWN_LIMITS[languageId]?.[unitId] ?? (languageId === 'ar' ? arabicKnownLimit(unitId) : undefined);
