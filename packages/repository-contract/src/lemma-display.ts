/**
 * How a lemma string is SHOWN, SPOKEN and SEARCHED, as against how it is IDENTIFIED. One place, so that no screen decides it alone.
 *
 * A Korean homonym's lemma string carries the dictionary's homonym number as superscript digits after the headword (눈¹ eye, 눈² snow;
 * docs/korean/PLAN.md). The number is identity (`lemma:ko:눈²:NOUN`), never spelling: a card's headline, GoReview's card front and back,
 * a vocabulary list, the text sent to speech and a search show and use the bare headword (눈). The number may be shown as a small
 * label beside the meaning (`lemmaHomonymNumber`), as a dictionary prints it.
 *
 * Every other language's lemma is returned as it is. Only after a Hangul syllable is a trailing superscript a homonym number, so a
 * unit such as m² keeps its exponent (the same rule as `surfaceFromEncounterUnitId`). Pure; no imports.
 */

const HOMONYM_NUMBER = /(?<=[가-힣])([⁰¹²³⁴-⁹]+)$/u;
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

const isKorean = (language: string | undefined): boolean => language === 'ko' || /^ko-/iu.test(language ?? '');

/** The spelling of a lemma to show, speak or search: the bare headword for Korean, the lemma unchanged for every other language. */
export function displayLemma(language: string | undefined, lemma: string): string {
  return isKorean(language) ? lemma.replace(HOMONYM_NUMBER, '') : lemma;
}

/**
 * Text bound for a voice (or a search box): every homonym number after a Hangul syllable is removed, wherever it stands in the text
 * (a lemma, a word, a phrase). A number never reaches a speech service as a spelling. Other languages: the text unchanged.
 */
export function speechSafeText(language: string | undefined, text: string): string {
  return isKorean(language) ? text.replace(/(?<=[가-힣])[⁰¹²³⁴-⁹]+(?![\p{L}\p{N}])/gu, '') : text;
}

/** The dictionary's homonym number a Korean lemma string carries (눈² → 2), or undefined. Shown only as a small label beside the meaning. */
export function lemmaHomonymNumber(language: string | undefined, lemma: string): number | undefined {
  if (!isKorean(language)) return undefined;
  const m = HOMONYM_NUMBER.exec(lemma);
  if (!m) return undefined;
  const n = Number([...m[1]].map((c) => SUPERSCRIPT_DIGITS.indexOf(c)).join(''));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * The label to show for a Korean homonym ("entry 2"), or undefined when the lemma carries no number. A number the dictionary source gives
 * (below 50) is shown as it is; one this product assigned (50 to 89) as a letter, a supplement row's (90 and up) as x1, x2 …: the same rule
 * as the dictionary line's own labels (src/adapters/korean/index-store.ts `koEntryLabel`; a test keeps the two equal), so the card and the
 * dictionary never name one entry two ways and an internal number is never printed.
 */
export function lemmaEntryLabel(language: string | undefined, lemma: string): string | undefined {
  const n = lemmaHomonymNumber(language, lemma);
  if (n === undefined) return undefined;
  if (n < 50) return String(n);
  if (n < 90) return String.fromCharCode(97 + ((n - 50) % 26));
  return `x${n - 90}`;
}

/**
 * The key to ask a dictionary for a lemma: the lemma as it is. A Korean homonym is filed under its numbered headword as well as under
 * the bare one, so 눈² finds snow ALONE; the bare headword is deliberately NOT a fallback for a numbered lemma, because it holds every
 * homonym and a reader taking the first record would show another word's meaning (the fault the numbering exists to prevent). A bare
 * lemma (an alone word, a main entry, an undecided reading) asks with the bare headword and gets every entry of the spelling. A key
 * that is a SPELLING (a page address, a search box, speech) is `displayLemma`, never the numbered one.
 */
export function lemmaLookupKeys(_language: string | undefined, lemma: string): string[] {
  return [lemma];
}

/** The label of a unit id (`lemma:ko:눈²:NOUN` → 눈, `form:sq:shtëpinë` → shtëpinë) as a person reads it; the id itself when it has no such shape. */
export function unitIdLabel(unitId: string): string {
  const parts = unitId.split(':');
  if (parts.length >= 3 && parts[2]) return parts[0] === 'lemma' ? displayLemma(parts[1], parts[2]) : parts[2];
  return unitId;
}

const ENTRY_LABEL = /^\s*\(\s*(?:[a-z][a-z ]*,\s*)?entry\s+[0-9a-z]+\s*\)\s*|^\s*\(\s*(?:noun|verb|adjective|adverb|pronoun|numeral|determiner|interjection|particle|conjunction|counter|suffix|prefix|name|proper noun)[^()]*\)\s*/iu;

/** A dictionary line's label ("(noun, entry 2) snow", "(verb) to ask") removed: what is left is the meaning, which is all an answer may be matched on. Other languages: unchanged. */
export function stripEntryLabel(language: string | undefined, gloss: string): string {
  return isKorean(language) ? gloss.replace(ENTRY_LABEL, '') : gloss;
}

/**
 * The meanings of EVERY entry of a bare Korean headword's merged dictionary line ("eye; eyesight / snow / scale / bud": the entries are separated by " / "),
 * labels removed, one string per entry. Any other language, or a line of one entry: the line itself.
 */
export function entryGlossPieces(language: string | undefined, gloss: string): string[] {
  if (!isKorean(language)) return [gloss];
  const pieces = gloss.split(/\s+\/\s+/u).map((p) => stripEntryLabel(language, p).trim()).filter(Boolean);
  return pieces.length ? pieces : [gloss];
}
