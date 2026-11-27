/**
 * Is an English meaning ONLY a cross-reference to another entry? ("alternative spelling of aquél", "plural of Haus", "inflection of gehen",
 * "synonym of X".) Such a line names a word; it does not say what the word means, so it cannot be the meaning a review card shows
 * (owner, 2026-11-25: a card whose meaning is only a cross-reference is an UNKNOWN card). Language-neutral: it reads the English gloss alone, in the
 * shape the dictionaries (Wiktionary via kaikki.org) write it. Imports nothing.
 */
const RELATION = [
  'alternative (?:spelling|form|letter-case form|typography|reconstruction)', 'alternate (?:spelling|form)', 'variant(?: spelling| form)?', 'obsolete (?:spelling|form|typography)', 'archaic (?:spelling|form)',
  'dated (?:spelling|form)', 'nonstandard (?:spelling|form)', 'non-standard (?:spelling|form)', 'informal (?:spelling|form)', 'rare (?:spelling|form)', 'superseded (?:spelling|form)', 'former (?:spelling|form)',
  'pre-reform spelling', 'bare infinitive(?: \\([^)]*\\))?', 'to-infinitive', 'infinitive construct', 'infinitive absolute', 'defective spelling', 'excessive spelling', 'plene spelling', 'monotonic form', 'polytonic form', 'katharevousa form', 'demotic form', 'pre-\\d{4} spelling', 'post-\\d{4} spelling', 'standard (?:spelling|form)', 'misspelling', 'common misspelling', 'eye dialect(?: spelling)?', 'pronunciation spelling', 'uncommon (?:spelling|form)',
  'short(?:ened)? form', 'clipping', 'ellipsis', 'contraction', 'abbreviation', 'initialism', 'acronym', 'apocopic form', 'apocopated form', 'aphetic form', 'syncopic form', 'elided form', 'combining form',
  'synonym', 'romanization', 'romanisation', 'transliteration', 'form', 'inflection', 'inflected form', 'conjugation', 'declension',
  '(?:(?:first|second|third|1st|2nd|3rd)[- ]person |singular |plural |dual |masculine |feminine |neuter |common |definite |indefinite |nominative |genitive |dative |accusative |ablative |vocative |locative |instrumental |oblique |direct |construct |absolute |emphatic |strong |weak |mixed |present |past |preterite |imperfect |perfect |pluperfect |future |conditional |subjunctive |indicative |imperative |infinitive |active |passive |middle |mediopassive |positive |comparative |superlative |diminutive |augmentative |pejorative |endearing |negative |formal |polite |familiar |simple |short |long |attributive |predicative |verbal |supine |gerund |gerundive |participle |and |or |/|,)*(?:singular|plural|dual|masculine|feminine|neuter|nominative|genitive|dative|accusative|ablative|vocative|locative|instrumental|oblique|construct state|definite(?: state| form)?|indefinite(?: form)?|present(?: tense)?|past(?: tense)?|preterite|imperfect|perfect|pluperfect|future|conditional|subjunctive|indicative|imperative|infinitive|participle|present participle|past participle|gerund|gerundive|supine|verbal noun|comparative(?: degree| form)?|superlative(?: degree| form)?|diminutive|augmentative|passive|active|mediopassive|causative|female equivalent|male equivalent|feminine equivalent|masculine equivalent|nominalization|nominalisation|agent noun|abstract noun|equative|elative)',
];
const XREF = new RegExp(`^(?:\\((?:[^)]*)\\)\\s*)*(?:${RELATION.join('|')})(?: form)? of\\b`, 'iu');
const SHORT_FOR = /^(?:\((?:[^)]*)\)\s*)*short for\b/iu;

/** True when the WHOLE meaning is a pointer to another entry. A meaning that points and then explains ("plural of X: houses") is not: what follows a colon or dash is read as the meaning. */
export function isCrossReferenceOnly(meaning: string | undefined): boolean {
  const g = (meaning ?? '').trim();
  if (!g) return false;
  if (!(XREF.test(g) || SHORT_FOR.test(g))) return false;
  // "plural of X: houses" / "alternative form of X; a house": the part after the pointer is a meaning of its own
  const tail = /(?::|;|—|–| - )\s*(.+)$/u.exec(g)?.[1]?.trim();
  if (tail && /\p{L}{2}/u.test(tail) && !XREF.test(tail)) return false;
  return true;
}

/** The headword a cross-reference points at ("alternative spelling of aquél" gives "aquél"), or undefined when the meaning is not only a cross-reference. */
export function crossReferenceTarget(meaning: string | undefined): string | undefined {
  const g = (meaning ?? '').trim();
  if (!isCrossReferenceOnly(g)) return undefined;
  const after = g.replace(XREF, '').replace(SHORT_FOR, '').trim();
  const head = after.split(/[,;:(—–]| - /u)[0]?.trim().replace(/[.]+$/u, '');
  return head || undefined;
}
