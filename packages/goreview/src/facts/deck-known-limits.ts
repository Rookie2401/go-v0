/**
 * The KNOWN-LIMITS lists of the deck gate (deck-gate.ts, check (d)): units a reader of the deck audit found to be false or unknown cards on the
 * DEVELOPMENT texts (data/deck-audit/<set>/dev.txt) that no rule of the gate catches: the analyser reads the written word as another word, or the
 * first meaning of the entry is not the word's ordinary meaning. Why each is listed is in data/deck-audit/<set>/verdicts.json (the reader's note).
 * Since 2026-11-27 (the owner: "Hold them now") it also holds every card found false on a held-out text, which a set's verdicts.json names in
 * `heldResidue`. A unit leaves the list when its reading or meaning is fixed. GENERATED from the verdict files; test/deck-audit/deck-audit.test.ts checks that
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
  ]),
  arc: list([
    "lemma:arc:לָהֵן:CONJ",
    "lemma:arc:קַיִט:NOUN",
  ]),
  de: list([
    "form:de:an",
    "form:de:mit",
    "form:de:morgen",
    "lemma:de:Fischer:PROPN",
    "lemma:de:Rauchen:NOUN",
    "lemma:de:blasen:VERB",
    "lemma:de:weichen:VERB",
  ]),
  el: list([
    "form:el:ανέκαμψε",
    "form:el:εἱστήκεισαν",
    "form:el:παρεκάλει",
    "form:el:σ",
    "form:el:συναντηθήκαμε",
    "form:el:συνιῶσιν",
    "form:el:ἀνάστηθι",
    "form:el:ἀνέτειλεν",
    "form:el:ἀναστάς",
    "form:el:ἀπέχοντος",
    "form:el:ἀπολωλώς",
    "form:el:ἐπικαλουμένους",
    "lemma:el:Πλοῦτος:PROPN",
    "lemma:el:έναντι:ADV",
    "lemma:el:ίδιος:ADJ",
    "lemma:el:βάλλω:VERB",
    "lemma:el:βάλτος:NOUN",
    "lemma:el:βιάζω:VERB",
    "lemma:el:βόλτα:NOUN",
    "lemma:el:διασταύρωση:NOUN",
    "lemma:el:καταβάλλω:VERB",
    "lemma:el:κόσμος:NOUN",
    "lemma:el:ρίχνω:VERB",
    "lemma:el:ρεύμα:NOUN",
    "lemma:el:σύνειμι:VERB",
    "lemma:el:τις:PRON",
    "lemma:el:υπολογιστής:NOUN",
    "lemma:el:ἄρχω:VERB",
    "lemma:el:ἄσωτος:ADJ",
  ]),
  es: list([
    "form:es:mezcla",
    "lemma:es:mezcla:NOUN",
  ]),
  fr: list([
    "form:fr:apprentissage",
    "form:fr:box",
    "form:fr:chargeur",
    "lemma:fr:apprentissage:NOUN",
    "lemma:fr:box:NOUN",
    "lemma:fr:chargeur:NOUN",
    "lemma:fr:noël:NOUN",
  ]),
  he: list([
    "form:he:בשביל",
    "lemma:he:אָרַז:VERB",
    "lemma:he:אוֹר:NOUN",
    "lemma:he:בִּשְׁבִיל:ADP",
    "lemma:he:בָּקוּ:PROPN",
    "lemma:he:בָּרִיא:ADJ",
    "lemma:he:גִּלְגָּל:PROPN",
    "lemma:he:חָלַל:VERB",
    "lemma:he:חֹפֶשׁ:NOUN",
    "lemma:he:חוֹב:NOUN",
    "lemma:he:חוּם:NOUN",
    "lemma:he:יַעַן:CONJ",
    "lemma:he:יָלַד:VERB",
    "lemma:he:יָשַׁב:VERB",
    "lemma:he:כִּיס:NOUN",
    "lemma:he:כִּנּוֹר:NOUN",
    "lemma:he:כָּבֵד:NOUN",
    "lemma:he:כָּמַהּ:VERB",
    "lemma:he:לָהֵן:CONJ",
    "lemma:he:מְכוֹנָה:NOUN",
    "lemma:he:נָא:PART",
    "lemma:he:נָשַׁר:VERB",
    "lemma:he:עָמַל:VERB",
    "lemma:he:פִּלֵּס:VERB",
    "lemma:he:פֹּעַל:NOUN",
    "lemma:he:צֵל:NOUN",
    "lemma:he:קָרָא:VERB",
    "lemma:he:רָדָה:VERB",
    "lemma:he:שֶׁקַע:NOUN",
  ]),
  hi: list([
    "lemma:hi:जानना:VERB",
    "lemma:hi:जीना:VERB",
    "lemma:hi:सीना:VERB",
  ]),
  la: list([
    "form:la:aes",
    "form:la:lentus",
    "form:la:matrona",
    "lemma:la:Celer:PROPN",
    "lemma:la:Celtus:ADJ",
    "lemma:la:adsum:VERB",
    "lemma:la:arbitror:VERB",
    "lemma:la:assis:NOUN",
    "lemma:la:autumnus:ADJ",
    "lemma:la:avis:NOUN",
    "lemma:la:campanus:ADJ",
    "lemma:la:condo:VERB",
    "lemma:la:consto:VERB",
    "lemma:la:contendo:VERB",
    "lemma:la:coque:ADV",
    "lemma:la:cultus:NOUN",
    "lemma:la:fatum:NOUN",
    "lemma:la:lentus:ADJ",
    "lemma:la:liber:ADJ",
    "lemma:la:matrona:NOUN",
    "lemma:la:merces:NOUN",
    "lemma:la:milium:NOUN",
    "lemma:la:moene:NOUN",
    "lemma:la:palor:VERB",
    "lemma:la:parochus:NOUN",
    "lemma:la:pascuus:ADJ",
    "lemma:la:peto:VERB",
    "lemma:la:porta:NOUN",
    "lemma:la:quadragesimus:NUM",
    "lemma:la:rarus:ADJ",
    "lemma:la:sentus:ADJ",
    "lemma:la:soleo:VERB",
  ]),
  nb: list([
    "lemma:nb:klare:VERB",
    "lemma:nb:nå:VERB",
  ]),
  nn: list([
    "form:nn:like",
    "lemma:nn:nå:VERB",
    "lemma:nn:tre:NOUN",
  ]),
  ru: list([
    "form:ru:выставка",
    "form:ru:пломба",
    "form:ru:руль",
    "form:ru:сохранить",
    "lemma:ru:авария:NOUN",
    "lemma:ru:бутерброд:NOUN",
    "lemma:ru:водитель:NOUN",
    "lemma:ru:выставка:NOUN",
    "lemma:ru:гроза:NOUN",
    "lemma:ru:дух:NOUN",
    "lemma:ru:знак:NOUN",
    "lemma:ru:настоящий:ADJ",
    "lemma:ru:очко:NOUN",
    "lemma:ru:перевести:VERB",
    "lemma:ru:пломба:NOUN",
    "lemma:ru:поднимать:VERB",
    "lemma:ru:посыпать:VERB",
    "lemma:ru:руль:NOUN",
    "lemma:ru:синоптика:NOUN",
    "lemma:ru:сохранить:VERB",
    "lemma:ru:спасть:VERB",
    "lemma:ru:спускать:VERB",
    "lemma:ru:терапевт:NOUN",
    "lemma:ru:шапка:NOUN",
  ]),
  sq: list([
    "form:sq:na",
    "lemma:sq:i marrë:ADJ",
    "lemma:sq:kishë:NOUN",
    "lemma:sq:shpëtim:NOUN",
  ]),
  th: list([
    "form:th:ชาน",
    "form:th:ทาสี",
    "form:th:นัก",
    "form:th:พริก",
    "form:th:เต้น",
    "form:th:เหลือ",
    "lemma:th:ทาสี:NOUN",
    "lemma:th:นัก:ADV",
    "lemma:th:พริก:NOUN",
    "lemma:th:เจ้า:PRON",
    "lemma:th:เต้น:VERB",
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

/**
 * Languages whose written FORM units are never review cards, with the one plain sentence GoReview shows. A form is read in its sentence, but a form card is
 * built from the form read ALONE, which can find a look-alike entry (Korean 게 "crab" for the ending, 거야 as 거 + 이야) and, when it finds the right word,
 * only repeats that word's lemma card. The lemma card, decided in its sentence by the language's review gate, is the card. Not a list of faults: a policy.
 */
export const DECK_NO_FORM_CARDS: Readonly<Record<string, string>> = {
  ko: 'A Korean written form is not made a review card of its own: its meaning read alone can be a look-alike word, and the word has its lemma card.',
};
export const deckNoFormCards = (languageId: string): string | undefined => DECK_NO_FORM_CARDS[languageId];
