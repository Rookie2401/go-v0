/**
 * A written transliteration of a POINTED Hebrew form, letter by letter, in a general (SBL-style) scheme — a reading aid for the
 * card, never sent to a voice. It is a convention, not a recording of how anyone speaks: the notes say which. An unpointed
 * (Modern) word cannot be transliterated from its spelling alone and gets none (uncertainty, not a guess).
 *
 * Rules kept deliberately simple and stated in the notes: begadkefat letters are hard with a dagesh (b g d k p t) and soft
 * without (v g d kh f t — Modern pronunciation, where ג ד ת no longer alternate); shin/sin by their dot; a shva is written e
 * when it opens a syllable and is silent at the end of one; dagesh forte is not doubled in the output.
 */
import { pointed } from './text';

const CONS: Record<string, [hard: string, soft: string]> = {
  'א': ['ʾ', 'ʾ'], 'ב': ['b', 'v'], 'ג': ['g', 'g'], 'ד': ['d', 'd'], 'ה': ['h', 'h'], 'ו': ['v', 'v'], 'ז': ['z', 'z'], 'ח': ['ḥ', 'ḥ'], 'ט': ['t', 't'],
  'י': ['y', 'y'], 'כ': ['k', 'kh'], 'ך': ['k', 'kh'], 'ל': ['l', 'l'], 'מ': ['m', 'm'], 'ם': ['m', 'm'], 'נ': ['n', 'n'], 'ן': ['n', 'n'], 'ס': ['s', 's'],
  'ע': ['ʿ', 'ʿ'], 'פ': ['p', 'f'], 'ף': ['p', 'f'], 'צ': ['ts', 'ts'], 'ץ': ['ts', 'ts'], 'ק': ['k', 'k'], 'ר': ['r', 'r'], 'ש': ['sh', 'sh'], 'ת': ['t', 't'],
};
const VOWELS: Record<string, string> = {
  'ְ': 'ə', // shva
  'ֱ': 'e', 'ֲ': 'a', 'ֳ': 'o', // hataf segol / patach / qamats
  'ִ': 'i', 'ֵ': 'e', 'ֶ': 'e', 'ַ': 'a', 'ָ': 'a', 'ֹ': 'o', 'ֻ': 'u',
};
const DAGESH = 'ּ';
const SHIN_DOT = 'ׁ';
const SIN_DOT = 'ׂ';

export interface HeTransliteration { text: string; notes: string[] }

/** Transliterate a pointed form; undefined when the form has no vowel points. */
export function transliterateHebrew(surface: string): HeTransliteration | undefined {
  const p = pointed(surface);
  if (!/[ְ-ּׁׂ]/.test(p)) return undefined;
  const chars = [...p];
  let out = '';
  const notes: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cons = CONS[ch];
    if (!cons) continue;
    // gather the marks that follow this letter
    let j = i + 1;
    let dagesh = false; let shin = false; let sin = false; let vowel = '';
    while (j < chars.length && !CONS[chars[j]]) {
      const m = chars[j];
      if (m === DAGESH) dagesh = true;
      else if (m === SHIN_DOT) shin = true;
      else if (m === SIN_DOT) sin = true;
      else if (VOWELS[m]) vowel = VOWELS[m];
      j++;
    }
    const last = j >= chars.length;
    const first = out === '';
    const prevVowel = out.slice(-1);
    let c: string;
    if (ch === 'ש') c = sin ? 's' : shin ? 'sh' : 'sh';
    else if (ch === 'ו' && dagesh && !vowel) { c = ''; vowel = 'u'; } // shuruq
    else if (ch === 'ו' && !dagesh && vowel === 'o' && !/[aeiou]$/.test(out) && !first) { c = ''; } // holam male: the vav is the vowel letter of the consonant before it (שָׁלוֹם)
    else if (ch === 'ו' && !dagesh && vowel === 'o') { c = 'v'; } // consonantal vav carrying holam (עָוֹן, וֹ at the start)
    else if (ch === 'ה' && last && !vowel) c = ''; // final mater lectionis
    else if (ch === 'י' && !vowel && !dagesh && /[ie]$/.test(prevVowel)) c = ''; // yod as the vowel letter of i / e
    else if ((ch === 'א' || ch === 'ע') && (first || last) && !vowel) c = ''; // silent at the edges in the general scheme
    else if ((ch === 'א' || ch === 'ע') && first) c = ''; // no glottal mark at the start of a word
    else c = dagesh ? cons[0] : cons[1];
    if (vowel === 'ə') vowel = last ? '' : 'e';
    out += c + vowel;
  }
  notes.push('Transliteration in a general scheme (SBL style), with the Modern Israeli values of the letters: ב without dagesh is v, כ is kh, פ is f; ו is v; ח is a throaty h (ḥ), ע a glottal catch (ʿ). It is a reading aid, not how any one community pronounces the word.');
  return { text: out, notes };
}
