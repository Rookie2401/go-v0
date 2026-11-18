/**
 * Cyrillic text is not Russian because it is Cyrillic: the script is shared by Ukrainian, Belarusian, Bulgarian, Serbian, Macedonian,
 * Kazakh, Mongolian and more, and older Russian print and Church Slavonic use letters today's Russian has dropped. The Russian pack
 * reads Russian only, so before a word list is even asked, the letters themselves are checked: a letter the modern Russian alphabet
 * does not have names another language (or another period) outright.
 *
 * This says only what the text is NOT. That a text with no such letter IS Russian is the word list's to show (resolve.ts, the
 * Cyrillic branch of `detect`; active/pageLanguages.ts `cyrillicLanguageOf`): Bulgarian prose can go a long way without a letter
 * Russian lacks, so its tell-tale is a pattern (ъ as a vowel between consonants), and Russian's own ы, э and ё count against it.
 * Pure; no data.
 */

/** Letters of other Cyrillic alphabets that Russian does not use, lower case, with the language(s) each belongs to. */
const FOREIGN_LETTERS: ReadonlyArray<{ letters: string; language: string }> = [
  { letters: 'їєґ', language: 'Ukrainian' },
  { letters: 'ў', language: 'Belarusian' },
  { letters: 'і', language: 'Ukrainian or Belarusian (or Russian in pre-1918 spelling)' },
  { letters: 'јљњћђџ', language: 'Serbian or Macedonian' },
  { letters: 'ѓќѕ', language: 'Macedonian' },
  { letters: 'әғқңөұүһ', language: 'Kazakh or another Turkic or Mongolic language' },
  { letters: 'ҳҷқӣӯ', language: 'Tajik' },
  { letters: 'ѣѳѵ', language: 'Russian in pre-1918 spelling or Church Slavonic' },
  { letters: 'ѡѧѫѯѱꙋ', language: 'Church Slavonic' },
];
const FOREIGN_OF = new Map<string, string>();
for (const row of FOREIGN_LETTERS) for (const ch of row.letters) if (!FOREIGN_OF.has(ch)) FOREIGN_OF.set(ch, row.language);

/** ъ between two consonants is a vowel of Bulgarian (път, съм, България); Russian writes ъ only before е ё ю я. */
const BULGARIAN_VOWEL = /[бвгджзклмнпрстфхцчшщ]ъ[бвгджзклмнпрстфхцчшщ]/u;
/** Letters Bulgarian does not have and Russian uses all the time. */
const RUSSIAN_ONLY = /[ыэё]/u;
/** A final ъ after a consonant is pre-1918 Russian spelling (or Bulgarian's article-less nouns never: Bulgarian words do not end in ъ either). */
const FINAL_HARD_SIGN = /[бвгджзклмнпрстфхцчшщ]ъ(?![\p{L}́])/u;

export interface NotRussian {
  /** What the text looks like instead, in plain words. */
  language: string;
  /** The letters or pattern that say so. */
  evidence: string;
}

/**
 * Why a Cyrillic text is not modern Russian, when its own letters say so; `undefined` when they do not (which is NOT a statement that
 * it is Russian). One stray letter in a long text does not decide (a quoted Ukrainian name in a Russian article): the foreign letters
 * must be at least `minShare` of the Cyrillic letters and at least two, or, in a text of under 40 Cyrillic letters, at least one.
 */
export function notRussianCyrillic(text: string, minShare = 0.01): NotRussian | undefined {
  const lower = text.normalize('NFC').toLowerCase();
  let cyrillic = 0;
  const found = new Map<string, number>();
  for (const ch of lower) {
    if (!/\p{Script=Cyrillic}/u.test(ch)) continue;
    cyrillic++;
    if (FOREIGN_OF.has(ch)) found.set(ch, (found.get(ch) ?? 0) + 1);
  }
  if (!cyrillic) return undefined;
  const total = [...found.values()].reduce((a, b) => a + b, 0);
  if (total >= 1 && (cyrillic < 40 || (total >= 2 && total / cyrillic >= minShare))) {
    const top = [...found.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    // і is shared by Ukrainian, Belarusian, Kazakh and old Russian print: a letter that belongs to one alphabet names the language better
    const telling = top.find(([ch]) => ch !== 'і') ?? top[0];
    return { language: FOREIGN_OF.get(telling[0])!, evidence: `the letter${top.length === 1 ? '' : 's'} ${top.map(([ch]) => ch).join(' ')}` };
  }
  if (FINAL_HARD_SIGN.test(lower) && (lower.match(new RegExp(FINAL_HARD_SIGN.source, 'gu')) ?? []).length >= 2) {
    return { language: 'Russian in pre-1918 spelling', evidence: 'words ending in ъ' };
  }
  if (cyrillic >= 60 && BULGARIAN_VOWEL.test(lower) && !RUSSIAN_ONLY.test(lower)) {
    return { language: 'Bulgarian', evidence: 'ъ written as a vowel between consonants, and no ы, э or ё' };
  }
  return undefined;
}

/** The share of a text's letters that are Cyrillic. */
export function cyrillicShare(text: string): number {
  let letters = 0, cyr = 0;
  for (const ch of text) { if (!/\p{L}/u.test(ch)) continue; letters++; if (/\p{Script=Cyrillic}/u.test(ch)) cyr++; }
  return letters ? cyr / letters : 0;
}
