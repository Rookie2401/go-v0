/**
 * Answer normalisation. One function, two modes, no hidden state.
 *
 *   exact   NFC, curly apostrophes made straight, whitespace collapsed, lower-cased, surrounding punctuation stripped.
 *   loose   everything `exact` does, plus ë→e and ç→c. A match that needed the fold is only ever a PARTIAL match
 *           (grade.ts): in Albanian ë and ç are different letters, so a word written without them is a different spelling.
 *
 * The article rule (a key that begins with an article is also met by the answer without it) lives in `stripArticle`; the
 * grader applies it, this module only provides the pieces.
 */

export type NormalizeMode = 'exact' | 'loose';

/**
 * Punctuation and symbols at either end are not part of an answer. Combining marks (\p{M}: Latin accents,
 * Devanagari signs, Thai vowel signs and tone marks) ARE: a final vowel sign is the last thing a learner types in
 * हिन्दी or สวัสดี, and stripping it would let हिन्दू pass for हिन्दी. They are never stripped (audit A-17).
 */
const SURROUNDING = /^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu;
const APOSTROPHES = /[’‘ʼ`´]/gu;

/** Articles an answer may leave out: the Albanian linking article of an adjective lemma, the English article / infinitive marker of a gloss. */
export const DEFAULT_ARTICLES: readonly string[] = ['i', 'e', 'të', 'së', 'to', 'a', 'an', 'the'];

export function normalizeAnswer(s: string, mode: NormalizeMode = 'exact'): string {
  const base = String(s ?? '')
    .normalize('NFC')
    .replace(APOSTROPHES, "'")
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase()
    .replace(SURROUNDING, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return mode === 'loose' ? foldAlbanian(base) : base;
}

/** ë→e and ç→c, nothing else (a stress mark or another letter is not Albanian orthography and is left alone). */
export function foldAlbanian(s: string): string {
  return s.replace(/ë/gu, 'e').replace(/ç/gu, 'c');
}

/** True when the text holds at least one letter (an answer made of digits or punctuation cannot be graded). */
export function hasLetter(s: string): boolean {
  return /\p{L}/u.test(s ?? '');
}

/**
 * The normalised key without its leading article, or undefined when it has none (or nothing would remain).
 * `articles` is matched as whole words at the start only.
 */
export function stripArticle(normalizedKey: string, articles: readonly string[] = DEFAULT_ARTICLES): string | undefined {
  for (const a of articles) {
    const prefix = `${a} `;
    if (normalizedKey.startsWith(prefix)) {
      const rest = normalizedKey.slice(prefix.length).trim();
      if (rest && hasLetter(rest)) return rest;
    }
  }
  return undefined;
}

/**
 * The parts of a gloss that can stand alone as an answer: "house, home" → house, home; "girl; daughter" → girl, daughter.
 * Splits on `;` and `,` outside parentheses and drops empty parts. The whole gloss is returned first.
 */
export function glossParts(gloss: string): string[] {
  const whole = String(gloss ?? '').trim();
  if (!whole) return [];
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of whole) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  const cleaned = parts.map((p) => p.trim()).filter((p) => p && hasLetter(p));
  return [...new Set([whole, ...cleaned])];
}
