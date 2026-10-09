/**
 * Small text helpers of the engine: the hash that identifies a draft's exact text, the comparison form used to decide whether two
 * sentences are "the same" (authorship), and the first sentence of a pack explanation (the one-line hint).
 */

/** FNV-1a 64-bit over UTF-8, 16 hex digits. The same function as the extension's `fnv1a64` and the engine's `hash`: keys join across apps. */
export function hashText(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

/**
 * The form in which two sentences are compared: Unicode NFC, lower case, typographic apostrophes and quotes straightened, runs of
 * white space collapsed, and leading/trailing punctuation and space dropped. Letters are never touched (ë stays ë).
 */
export function normaliseForCompare(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/[“”]/gu, '"')
    .replace(/\s+/gu, ' ')
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '');
}

export const sameSentence = (a: string, b: string): boolean => {
  const x = normaliseForCompare(a);
  return x !== '' && x === normaliseForCompare(b);
};

/** The first sentence of a longer explanation (split where a full stop is followed by a capital letter or an opening quote). */
export function firstSentence(text: string): string {
  const t = text.trim().replace(/\s+/gu, ' ');
  const m = /^(.*?[.!?])(?:\s+(?=[\p{Lu}“"(])|$)/u.exec(t);
  return (m ? m[1] : t).trim();
}

/** Unique, order-preserving. */
export const unique = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

export const isoOf = (v: Date | string): string => (typeof v === 'string' ? v : v.toISOString());

/**
 * The opening sentences of an explanation, enough to say what the thing is: the first one, and the next ones while the result is
 * still short (under `min` characters) and stays within `max`.
 */
export function leadSentences(text: string, min = 90, max = 260): string {
  const parts = text.trim().replace(/\s+/gu, ' ').split(/(?<=[.!?])\s+(?=[\p{Lu}“"(])/u);
  let out = parts[0] ?? '';
  for (let i = 1; i < parts.length && out.length < min && out.length + 1 + parts[i].length <= max; i++) out += ` ${parts[i]}`;
  return out;
}
