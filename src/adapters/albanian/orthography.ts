/**
 * Letters and spelling: the identity of a written form, the Albanian letters and digraphs a beginner must learn to
 * see (ë ç dh gj ll nj rr sh th xh zh), and reading a text typed without ë and ç. Package Q4.
 *
 * Machine-drafted and not checked by a native speaker. The sound descriptions are for an English speaker and are
 * honest rather than neat: where English has no equivalent sound (q, gj, y), the hint says so.
 */

/** NFC, lower case, typographic apostrophe folded to ' — ë and ç are kept (they distinguish words). */
export function sqNormalize(s: string): string {
  // NFC first: "e" + U+0308 becomes ë and "c" + U+0327 becomes ç, so a decomposed ë or ç is the same word as a composed one.
  return s.normalize('NFC').toLocaleLowerCase('sq').replace(/[’ʼ‘]/g, "'");
}

/** Forgiving search: people type without ë and ç. */
export function sqSearchNormalize(q: string): string {
  return sqNormalize(q).replace(/ë/g, 'e').replace(/ç/g, 'c').trim();
}

/** One letter or digraph of the Albanian alphabet as Stage 0 teaches it. */
export interface SqLetter { letter: string; ipa: string; hint: string; example: string; exampleGloss: string }

/** The 36 letters of the Albanian alphabet, in alphabet order (a digraph is one letter and has its own place). */
export const SQ_LETTERS: SqLetter[] = [
  { letter: 'a', ipa: 'a', hint: 'like a in father', example: 'ajër', exampleGloss: 'air' },
  { letter: 'b', ipa: 'b', hint: 'like b in bed', example: 'bukë', exampleGloss: 'bread' },
  { letter: 'c', ipa: 'ts', hint: 'like ts in cats (never k or s)', example: 'cep', exampleGloss: 'corner, edge' },
  { letter: 'ç', ipa: 'tʃ', hint: 'like ch in church', example: 'çaj', exampleGloss: 'tea' },
  { letter: 'd', ipa: 'd', hint: 'like d in dog', example: 'dritare', exampleGloss: 'window' },
  { letter: 'dh', ipa: 'ð', hint: 'like th in this (voiced)', example: 'dhomë', exampleGloss: 'room' },
  { letter: 'e', ipa: 'ɛ', hint: 'like e in bed', example: 'emër', exampleGloss: 'name' },
  { letter: 'ë', ipa: 'ə', hint: 'a short, relaxed vowel, like a in about; often weak at the end of a word', example: 'ëndërr', exampleGloss: 'dream' },
  { letter: 'f', ipa: 'f', hint: 'like f in fish', example: 'fjalë', exampleGloss: 'word' },
  { letter: 'g', ipa: 'ɡ', hint: 'like g in go', example: 'gisht', exampleGloss: 'finger' },
  { letter: 'gj', ipa: 'ɟ', hint: 'a palatal stop made with the middle of the tongue against the hard palate; no English equivalent (a soft, dy-like sound is the nearest)', example: 'gjuhë', exampleGloss: 'language' },
  { letter: 'h', ipa: 'h', hint: 'like h in house', example: 'hënë', exampleGloss: 'moon; Monday' },
  { letter: 'i', ipa: 'i', hint: 'like ee in see, but shorter', example: 'ishull', exampleGloss: 'island' },
  { letter: 'j', ipa: 'j', hint: 'like y in yes', example: 'jetë', exampleGloss: 'life' },
  { letter: 'k', ipa: 'k', hint: 'like k in sky (no puff of air)', example: 'kafe', exampleGloss: 'coffee' },
  { letter: 'l', ipa: 'l', hint: 'like l in leaf (a light l)', example: 'libër', exampleGloss: 'book' },
  { letter: 'll', ipa: 'ɫ', hint: 'a dark, thick l, like the l in full', example: 'lloj', exampleGloss: 'kind, sort' },
  { letter: 'm', ipa: 'm', hint: 'like m in man', example: 'mik', exampleGloss: 'friend' },
  { letter: 'n', ipa: 'n', hint: 'like n in no', example: 'natë', exampleGloss: 'night' },
  { letter: 'nj', ipa: 'ɲ', hint: 'like ny in canyon (the Spanish ñ)', example: 'njeri', exampleGloss: 'person' },
  { letter: 'o', ipa: 'ɔ', hint: 'like o in not', example: 'orë', exampleGloss: 'hour; clock, watch' },
  { letter: 'p', ipa: 'p', hint: 'like p in spin (no puff of air)', example: 'punë', exampleGloss: 'work' },
  { letter: 'q', ipa: 'c', hint: 'a palatal stop made with the middle of the tongue; no English equivalent (between k and ch; not the English q)', example: 'qiell', exampleGloss: 'sky' },
  { letter: 'r', ipa: 'ɾ', hint: 'one quick tap of the tongue, like the tt in American butter', example: 'rërë', exampleGloss: 'sand' },
  { letter: 'rr', ipa: 'r', hint: 'a trilled r, rolled as in Spanish perro', example: 'rrugë', exampleGloss: 'street' },
  { letter: 's', ipa: 's', hint: 'like s in sit', example: 'sot', exampleGloss: 'today' },
  { letter: 'sh', ipa: 'ʃ', hint: 'like sh in ship', example: 'shtëpi', exampleGloss: 'house' },
  { letter: 't', ipa: 't', hint: 'like t in stop (no puff of air)', example: 'tavolinë', exampleGloss: 'table' },
  { letter: 'th', ipa: 'θ', hint: 'like th in thin (voiceless)', example: 'thikë', exampleGloss: 'knife' },
  { letter: 'u', ipa: 'u', hint: 'like oo in moon', example: 'ujë', exampleGloss: 'water' },
  { letter: 'v', ipa: 'v', hint: 'like v in van', example: 'vit', exampleGloss: 'year' },
  { letter: 'x', ipa: 'dz', hint: 'like ds in beds', example: 'xixë', exampleGloss: 'spark' },
  { letter: 'xh', ipa: 'dʒ', hint: 'like j in judge', example: 'xhaketë', exampleGloss: 'jacket' },
  { letter: 'y', ipa: 'y', hint: 'no English equivalent: say ee with the lips rounded, as the German ü or French u', example: 'yll', exampleGloss: 'star' },
  { letter: 'z', ipa: 'z', hint: 'like z in zoo', example: 'zog', exampleGloss: 'bird' },
  { letter: 'zh', ipa: 'ʒ', hint: 'like s in measure', example: 'zhurmë', exampleGloss: 'noise' },
];

const DIGRAPHS = new Set(['dh', 'gj', 'll', 'nj', 'rr', 'sh', 'th', 'xh', 'zh']);

/**
 * The letters of a word in alphabet order units: "xhaxha" → ['xh', 'a', 'xh', 'a'] (digraphs are single letters,
 * longest match first). Anything that is not a letter (an apostrophe, a hyphen, a digit) is returned as a unit of its own.
 *
 * Known limit: a pair that looks like a digraph but spans a morpheme boundary cannot be told apart from a real one by
 * spelling alone (a compound or prefixed form with n + j, s + h, d + h, t + h or the like is read as the digraph here).
 */
export function sqLetters(word: string): string[] {
  const w = sqNormalize(word);
  const out: string[] = [];
  let i = 0;
  while (i < w.length) {
    const two = w.slice(i, i + 2);
    if (two.length === 2 && DIGRAPHS.has(two)) { out.push(two); i += 2; } else { out.push(w[i]); i += 1; }
  }
  return out;
}

const MAX_POSITIONS = 12;

/**
 * A form typed without diacritics ("eshte", "cfare") → the properly spelled forms it could be ("është", "çfarë"),
 * restricted to forms `known` accepts. Any subset of the e and c positions is tried (e → ë, c → ç). Never returns the
 * input itself; a form with more than 12 e / c positions returns []. Candidates are lower case (the form is normalised
 * first); order is deterministic: fewest changes first, then alphabetical.
 *
 * A form that already has an ë or a ç was not typed without them: it returns []. Otherwise a word the lists do not know
 * would be "corrected" into a known word one letter away (mbështetem, I rely, into mbështetëm, we leaned).
 */
export function restoreDiacritics(form: string, known: (form: string) => boolean): string[] {
  const base = sqNormalize(form);
  if (/[ëç]/u.test(base)) return [];
  const positions: number[] = [];
  for (let i = 0; i < base.length; i++) if (base[i] === 'e' || base[i] === 'c') positions.push(i);
  if (positions.length === 0 || positions.length > MAX_POSITIONS) return [];
  const found: Array<{ word: string; changes: number }> = [];
  const total = 1 << positions.length;
  for (let mask = 1; mask < total; mask++) {
    const chars = base.split('');
    let changes = 0;
    for (let b = 0; b < positions.length; b++) {
      if (mask & (1 << b)) {
        const p = positions[b];
        chars[p] = chars[p] === 'e' ? 'ë' : 'ç';
        changes++;
      }
    }
    const word = chars.join('');
    if (word !== base && known(word)) found.push({ word, changes });
  }
  found.sort((a, b) => a.changes - b.changes || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
  return found.map((f) => f.word);
}
