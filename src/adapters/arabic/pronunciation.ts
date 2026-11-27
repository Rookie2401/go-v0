/**
 * Arabic pronunciation notes for the word sheet. MACHINE-DRAFTED, not reviewed by a native speaker or an Arabist (the statement is
 * `AR_MACHINE_DISCLAIMER` in translit.ts, said once for the language and not repeated in every word's notes).
 *
 * What this gives: a transliteration (translit.ts) when the word is VOCALIZED and can be transliterated without a guess, and short
 * learner-facing notes, each stating one real rule that applies to THIS word. It gives NO `ipa`: a rule-derived IPA would need the
 * vowels of a form the page did not print, and a wrong IPA on a card is worse than none; the dictionary's own IPA is the authority.
 *
 * Vowels: they come from the vocalized reading when there is one (`vocalized`, or the surface when it is itself fully vowelled). When
 * the word is unvocalized the notes say only what the LETTERS alone tell (the heavy letters, ق against ك, ع against ء, ح against ه,
 * ة and a final ى), say that the vowels are not printed, and give no transliteration. A vowel is never invented, and a vowel the
 * dictionary supplies is presented as the dictionary's, by the caller (notes.vowels), not here.
 *
 * Voices: a device voice tagged `ar` speaks Modern Standard Arabic only. A synthetic MSA voice is not a Classical recitation (tajwīd),
 * and the last note says so.
 */
import type { PronunciationSupport } from '../../core';
import { arKey, arLoose, tashkilLevel } from './text';
import { analyseArabicWord, type ArFacts } from './translit';

const VOICE_NOTE = 'A device voice tagged ar speaks Modern Standard Arabic only; a synthetic voice is practice, not a Classical recitation (tajwīd), and it may leave out or change the vowels.';

/** Notes the letters alone justify. */
function letterNotes(key: string): string[] {
  const out: string[] = [];
  const has = (re: RegExp): boolean => re.test(key);
  const heavy = [...new Set([...key].filter((c) => 'صضطظ'.includes(c)))];
  if (heavy.length) {
    const names: Record<string, string> = { ص: 'ص is a heavy s', ض: 'ض a heavy d', ط: 'ط a heavy t', ظ: 'ظ a heavy dh (or z)' };
    out.push(`${heavy.map((c) => names[c]).join(', ')}: said with the back of the tongue raised, which also darkens the vowels beside it. The plain partners are س, د, ت, ذ.`);
  }
  if (has(/ق/)) out.push('ق is a k said far back in the throat; ك is the ordinary k. They are different letters and different words (قَلْب heart, كَلْب dog).');
  else if (has(/ك/)) out.push('ك is an ordinary k; ق is a different, deeper sound further back in the throat.');
  if (has(/ع/) && has(/ء|[أإؤئ]/)) out.push('ع is a squeezed, voiced sound in the throat; the hamza (ء) is a clean stop like the catch in “uh-oh”. They are not the same sound.');
  else if (has(/ع/)) out.push('ع is a squeezed, voiced sound in the throat, with no English equivalent. It is a consonant, not a vowel, and it is not the hamza (ء).');
  else if (has(/[ءأإؤئ]/)) out.push('The hamza is a stop in the throat, like the catch in “uh-oh”; it is a consonant, and it is not ع.');
  if (has(/ح/) && has(/ه/)) out.push('ح is a hissed, breathy h from deep in the throat; ه is the light, ordinary h. They are different letters.');
  else if (has(/ح/)) out.push('ح is a hissed, breathy h from deep in the throat; the ordinary h is ه.');
  if (has(/خ/)) out.push('خ is kh, as in Scottish loch; غ (gh) is the voiced, gargled counterpart.');
  else if (has(/غ/)) out.push('غ is a gargled sound like the French r; خ (kh) is its voiceless counterpart.');
  if (has(/ث/)) out.push('ث is th as in think and ذ is th as in this.');
  else if (has(/ذ/)) out.push('ذ is th as in this and ث is th as in think.');
  if (has(/ة$/)) out.push('A final ة (tāʾ marbūṭa) is the tied t of a feminine word: said t only when an ending or a pronoun follows, and not as t in pause.');
  if (has(/ى$/)) out.push('A final ى (alif maqṣūra) looks like yāʾ but is a long ā.');
  return out;
}

/** Notes from the vocalized reading: the facts translit.ts found. */
function vocalNotes(f: ArFacts, text: string): string[] {
  const out: string[] = [];
  if (f.article === 'sun') out.push('The lām of ال is not said before this sun letter: it takes the next consonant, which is said doubled (written ash-shams style: the spelling does not change).');
  else if (f.article === 'lunar') out.push('Before this moon letter the lām of ال is said: al-, and the next consonant is single.');
  else if (f.article === 'sun-unassimilated') out.push('The page prints the lām of ال before a sun letter without a shadda; in speech the lām is normally assimilated.');
  if (f.article || f.initialAlif === 'wasla') out.push('The alif of the article (hamzat al-waṣl) is said at the start of speech and dropped after another word: the lām then joins on to the word before.');
  else if (f.initialAlif === 'alif') out.push('An alif that carries a vowel at the start of a word is the support of a hamza or of a hamzat al-waṣl; the dictionary says which.');
  if (f.initialHamzaOmitted) out.push('A hamza at the start of a word is a catch in the throat; the transliteration leaves it out by convention.');
  if (f.taMarbuta === 'pause') out.push(`The final ة is not read as t in pause (${text}); with a case ending or a pronoun after it, it is t.`);
  else if (f.taMarbuta === 'ending') out.push('The ة carries an ending here, so it is read t.');
  if (f.geminates.length) out.push(`A shadda doubles the consonant (${[...new Set(f.geminates)].join(', ')}): say it twice as long, with a short stop before the vowel.`);
  const longs = [...new Set(f.longVowels)];
  if (longs.length) out.push(`${longs.join(' ')} ${longs.length > 1 ? 'are' : 'is'} long: about twice the length of a short vowel (written ā ī ū).`);
  if (f.dagger) out.push('The small alif above a letter is a long ā that the spelling leaves out.');
  if (f.tanwin && !f.pausalApplied) out.push('The tanwīn (-un, -an, -in) is the ending of an indefinite noun. It is often left off in speech, especially in pause.');
  else if (!f.tanwin && !f.pausalApplied && /[aui]$/.test(text)) out.push('The final short vowel is the case or mood ending. Many speakers drop it, especially at the end of a phrase.');
  return out;
}

/**
 * Pronunciation support for one written word. `vocalized` is the vocalized reading when the analyser has one; without it the surface
 * is used when the page itself vowelled it fully. Text with no Arabic letter gets an empty result.
 */
export function arPronunciation(surface: string, vocalized?: string): PronunciationSupport {
  const key = arKey(surface);
  if (!/[ء-ي]/u.test(key)) return {};
  let vocal: string | undefined;
  if (vocalized && arLoose(arKey(vocalized)) === arLoose(key)) vocal = vocalized;
  else if (tashkilLevel(surface) === 'full') vocal = surface;
  const notes: string[] = [];
  const add = (n: string | undefined): void => { if (n && !notes.includes(n)) notes.push(n); };
  let transliteration: string | undefined;
  const a = vocal ? analyseArabicWord(vocal) : undefined;
  if (a) {
    transliteration = a.text;
    for (const n of vocalNotes(a.facts, a.text)) add(n);
  } else {
    add(vocal
      ? 'The vowel marks are not complete enough to read the word from them, so no transliteration is given.'
      : 'No vowel marks are printed, so the vowels, any doubled letter and the ending cannot be told from the spelling; no transliteration is given. The dictionary form on the card has them.');
    if (/^ال.{2,}/u.test(arLoose(key))) add('If the first letters ال are the article, the lām is not said before a sun letter (ت ث د ذ ر ز س ش ص ض ط ظ ل ن) and is said before the others.');
  }
  for (const n of letterNotes(key)) add(n);
  const out: PronunciationSupport = {};
  if (transliteration) out.transliteration = transliteration;
  out.notes = [...notes.slice(0, 8), VOICE_NOTE];
  return out;
}
