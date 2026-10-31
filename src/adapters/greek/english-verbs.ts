/** Small lexical resource for English realization; no Greek forms or rules are inferred here. */
export interface EnglishVerbEntry {
  lemma: string;
  /** English lexical verb, without person or tense. */
  base: string;
  /** Third-person singular present form, supplied explicitly to cover irregular English verbs. */
  thirdSingular: string;
  /** Optional explicit present forms for irregular auxiliaries. */
  present?: Readonly<Record<string, string>>;
}

export const ENGLISH_VERBS: readonly EnglishVerbEntry[] = [
  { lemma: 'ἀγαπάω', base: 'love', thirdSingular: 'loves' },
  { lemma: 'λύω', base: 'loose', thirdSingular: 'looses' },
  { lemma: 'γράφω', base: 'write', thirdSingular: 'writes' },
  { lemma: 'ἔχω', base: 'have', thirdSingular: 'has' },
  { lemma: 'λέγω', base: 'say', thirdSingular: 'says' },
];

export const ENGLISH_AUXILIARIES: readonly EnglishVerbEntry[] = [
  { lemma: 'εἰμί', base: 'be', thirdSingular: 'is', present: { '1:Sing': 'am', '2:Sing': 'are', '3:Sing': 'is', '1:Plur': 'are', '2:Plur': 'are', '3:Plur': 'are' } },
];

const IRREGULAR_THIRD_SINGULAR: Readonly<Record<string, string>> = {
  be: 'is', have: 'has', do: 'does', go: 'goes',
};

/** Accept only a simple "I <verb>" citation gloss; qualifiers are intentionally not guessed. */
export function englishVerbFromCitation(gloss: string | undefined): EnglishVerbEntry | undefined {
  const value = gloss?.trim();
  if (value === 'I am') return ENGLISH_AUXILIARIES[0];
  const match = value?.match(/^I ([a-z]+)$/i);
  if (!match) return undefined;
  const base = match[1].toLocaleLowerCase('en');
  if (/^(?:can|may|must|shall|will|could|would|should|might|ought|am|is|are|was|were|been|being)$/.test(base)) return undefined;
  const known = [...ENGLISH_VERBS, ...ENGLISH_AUXILIARIES].find((entry) => entry.base === base);
  if (known) return known;
  const thirdSingular = IRREGULAR_THIRD_SINGULAR[base]
    ?? (/[^aeiou]y$/.test(base) ? `${base.slice(0, -1)}ies` : /(?:s|x|z|ch|sh|o)$/.test(base) ? `${base}es` : `${base}s`);
  return { lemma: '', base, thirdSingular };
}
