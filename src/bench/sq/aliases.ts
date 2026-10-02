/**
 * The same word under two citation forms — a difference of NAMING between the course's word list and the UniParser
 * Albanian analyzer, not a difference of analysis. Key: the lemma here; value: the lemma(s) the analyzer files the same
 * forms under. Here a verb is cited by its first person singular present (përgatis) or, when it is only used
 * non-actively, by that form (përpiqem, quhem); the analyzer cites the dictionary's headword (përgatit) or the active
 * verb (përpjek, quaj). "te" and "tek" are one preposition written two ways; the analyzer files both under tek. The short question
 * word ç' (ç'është?) is a form of çfarë here and its own entry in Wiktionary and the treebank.
 *
 * Kept short and explicit: every pair was looked at by hand in the comparison's output, and the features of the forms
 * must still agree. The table is written into data/review/sq/analyzer-check.json so that a reviewer sees what was
 * treated as the same word.
 */
export const SQ_CITATION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  përgatis: ['përgatit'],
  përpiqem: ['përpjek'],
  quhem: ['quaj'],
  te: ['tek'],
  çfarë: ["ç'"],
};

/** Does the analyzer's lemma name the same word as ours? */
export const sameCitation = (ours: string, theirs: string): boolean =>
  ours === theirs || (SQ_CITATION_ALIASES[ours] ?? []).includes(theirs);
