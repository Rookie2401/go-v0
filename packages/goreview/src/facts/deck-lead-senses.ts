/**
 * LEAD SENSES of the deck gate (deck-gate.ts): words whose dictionary entry has the ordinary meaning but lists another sense first and marks nothing
 * (Thai กล้อง: "pipe", "binoculars", "camera"; Russian стать: "to stand" before "to become"). A reader of the deck audit found the card's first meaning
 * wrong; the sense named here is the entry's OWN sense, copied verbatim, and the gate shows it first. No meaning is written here that the dictionary does
 * not have: when the entry no longer has the sense, the gate holds the word instead. Chosen by an AI model from the readers' notes, not by a native
 * speaker; test/deck-audit/deck-audit.test.ts checks every sense against the installed dictionary. More than one sense: the card shows them together.
 * A table is keyed by language, or by a VARIETY where the ordinary meaning differs between periods (Modern כנור "violin", Biblical "harp"): the variety's
 * table is read first. Choose and generate with a script; never type pointed Hebrew by hand.
 */
export const DECK_LEAD_SENSES: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  fr: {
    "lemma:fr:chômage:NOUN": ["unemployment"],
    "lemma:fr:office:NOUN": ["administrative bureau, department"],
    "lemma:fr:panne:NOUN": ["breakdown (state of no longer functioning)"],
    "lemma:fr:saupoudrer:VERB": ["to sprinkle powder (onto)"],
  },
  he: {
    "lemma:he:יָד:NOUN": ["hand"],
  },
  "he-bib": {
    "lemma:he:מֵעֶה:NOUN": ["inward parts, innards, internal organs"],
  },
  "he-mod": {
    "lemma:he:בָּרִיא:ADJ": ["healthy, well (in good health)"],
    "lemma:he:הִצִּיג:VERB": ["to show, to present, to display"],
    "lemma:he:חַשְׁמַל:NOUN": ["electricity"],
    "lemma:he:יֶרֶק:NOUN": ["herb, vegetable"],
    "lemma:he:מֶחְקָר:NOUN": ["study, piece of research"],
  },
  ru: {
    "lemma:ru:врач:NOUN": ["doc, vet, medic, physician, doctor"],
    "lemma:ru:выписать:VERB": ["to write, to write out, to write down"],
    "lemma:ru:за:ADP": ["[with accusative] — for; to; by; after; over"],
    "lemma:ru:закрыть:VERB": ["to close, to shut"],
    "lemma:ru:занять:VERB": ["to occupy, to take up"],
    "lemma:ru:который:PRON": ["which, that, who, whom"],
    "lemma:ru:нельзя:ADJ": ["one cannot"],
    "lemma:ru:номер:NOUN": ["number (various senses)"],
    "lemma:ru:окружить:VERB": ["to surround, to lavish"],
    "lemma:ru:перекрыть:VERB": ["to stop up, to block"],
    "lemma:ru:повод:NOUN": ["cause, ground, occasion"],
    "lemma:ru:получиться:VERB": ["to result"],
    "lemma:ru:проезд:NOUN": ["passage, thoroughfare"],
    "lemma:ru:разводить:VERB": ["to part, to move apart, to pull apart, to separate"],
    "lemma:ru:стать:VERB": ["to become, to get, to grow"],
    "lemma:ru:уборка:NOUN": ["cleaning, tidying up, doing up"],
  },
  th: {
    "lemma:th:กล้อง:NOUN": ["camera"],
    "lemma:th:กิโล:NOUN": ["kilogram","kilometer"],
    "lemma:th:น้ำตาล:NOUN": ["sugar (of any kind)"],
    "lemma:th:ภาค:NOUN": ["part; section; division; region; area"],
    "lemma:th:วิดีโอ:NOUN": ["video (in general)"],
    "lemma:th:เจ็บ:VERB": ["to be hurt; be in pain"],
    "lemma:th:เต้น:VERB": ["to dance"],
    "lemma:th:แต่ง:VERB": ["to adorn; to decorate; to embellish","to compose; to create; to author; to draw up"],
    "lemma:th:แป้ง:NOUN": ["flour; powder; starch"],
    "lemma:th:โล่ง:ADJ": ["clear; unobstructed."],
  },
};

export const deckLeadSenses = (languageId: string, unitId: string, varietyId?: string): readonly string[] | undefined =>
  (varietyId ? DECK_LEAD_SENSES[varietyId]?.[unitId] : undefined) ?? DECK_LEAD_SENSES[languageId]?.[unitId];
