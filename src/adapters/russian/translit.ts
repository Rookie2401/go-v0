/**
 * Russian transliteration: a TEMPORARY reading aid for a beginner who cannot yet read Cyrillic. It is never the normal reading
 * display, never sent to a voice and never an identity. Machine-drafted, not reviewed by a native speaker.
 *
 * The scheme is the scholarly (scientific) one that dictionaries and Wiktionary use, applied letter by letter:
 *
 *   а a   б b   в v   г g   д d   ж ž   з z   и i   й j   к k   л l   м m   н n   о o   п p   р r   с s   т t   у u   ф f
 *   х x   ц c   ч č   ш š   щ šč  ы y   э è   ь ʹ (soft sign)   ъ ʺ (hard sign)
 *   е e   ё ë   ю ju   я ja
 *
 * е and ё are written with a j in front of them (je, jë) at the start of a word, after a vowel letter, after ь and after ъ, where
 * Russian really says a [j] first (его → jego, моё → mojë, семья → semʹja). After a consonant they are plain e and ë. ю and я always
 * carry their j (ju, ja). The soft sign is a modifier letter, not a sound: it shows that the consonant before it is soft.
 *
 * Stress, when the caller knows the stressed vowel (`stress` = positions in the key), is an acute on the vowel's romanisation:
 * á é í ó ú ý, já jé jú, è + acute. ё needs none (ë is always stressed). Without `stress` no accent is written: Russian does not write
 * stress and this module never guesses it.
 *
 * Only Russian (and other Cyrillic letters it does not know) are touched: other characters pass through. The sound of the
 * transliteration is NOT the pronunciation: unstressed о is said like a, final д like т, and so on (see pronunciation.ts).
 */

const ACUTE = '\u0301';

const MAP: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ж: 'ž', з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'x', ц: 'c', ч: 'č', ш: 'š', щ: 'šč', ы: 'y', э: 'è', ь: 'ʹ', ъ: 'ʺ', ю: 'ju', я: 'ja',
};
/** The letters after which е and ё begin with [j]: the vowel letters, ь and ъ (the start of a word is handled separately). */
const J_BEFORE = new Set([...'аеёиоуыэюя', 'ь', 'ъ']);
const isLetter = (ch: string | undefined): boolean => !!ch && /\p{L}/u.test(ch);
const isVowelLetter = (ch: string): boolean => 'аеёиоуыэюя'.includes(ch);

/** The romanisation of one letter, in lower case (the caller restores capitals). */
function letter(prev: string | undefined, ch: string): string {
  if (ch === 'е' || ch === 'ё') {
    const j = !isLetter(prev) || J_BEFORE.has(prev as string);
    return (j ? 'j' : '') + (ch === 'е' ? 'e' : 'ë');
  }
  return MAP[ch] ?? ch;
}

/**
 * The transliteration of a key (lower case; capitals are tolerated and kept as capitals). `stress` are positions of stressed vowels
 * in `key`; a position that is not a vowel letter is ignored.
 */
export function ruTransliterate(key: string, stress: readonly number[] = []): string {
  const chars = [...key.normalize('NFC')];
  const at = new Set(stress);
  let out = '';
  let prev: string | undefined;
  // positions are indexes into the key as a string; Russian letters are one UTF-16 unit each, so the char index is the position
  for (let i = 0; i < chars.length; i++) {
    const orig = chars[i];
    const lower = orig.toLowerCase();
    let r = letter(prev, lower);
    if (at.has(i) && isVowelLetter(lower) && lower !== 'ё') r += ACUTE;
    if (orig !== lower && r) r = r[0].toUpperCase() + r.slice(1);
    out += r;
    prev = lower;
  }
  return out.normalize('NFC');
}
