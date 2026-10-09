/**
 * Small text helpers shared by versions and evidence: sentence splitting, word counting, and the FNV-1a hashes that stand
 * in for text in every event (a hash identifies a sentence; it never carries it).
 *
 * Sentence splitting is deliberately simple and language-neutral. A sentence ends at a run of terminators
 * (. ! ? … 。 ！ ？ । ॥ ؟) plus closing quotes/brackets, when the next character is
 * whitespace or the end of the text; the full-width and danda terminators end a sentence even without a following space.
 * A line break always ends a sentence. Abbreviations ("Mr. Smith") split wrongly; that is stable between versions, which
 * is all authorship tracking needs. Thai and other scripts without terminators are one sentence per line.
 */

const TERMINATORS = new Set(['.', '!', '?', '…', '。', '！', '？', '।', '॥', '؟', '։', '።']);
const NO_SPACE_TERMINATORS = new Set(['。', '！', '？', '।', '॥']);
const CLOSERS = new Set(['"', "'", '”', '’', '»', '›', ')', ']', '}', '」', '』', '）']);

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/u)) {
    const chars = [...para];
    let start = 0;
    let i = 0;
    while (i < chars.length) {
      if (TERMINATORS.has(chars[i])) {
        let j = i;
        let hasStrong = NO_SPACE_TERMINATORS.has(chars[i]);
        while (j + 1 < chars.length && TERMINATORS.has(chars[j + 1])) { j++; if (NO_SPACE_TERMINATORS.has(chars[j])) hasStrong = true; }
        while (j + 1 < chars.length && CLOSERS.has(chars[j + 1])) j++;
        const next = chars[j + 1];
        if (next === undefined || /\s/u.test(next) || hasStrong) {
          const s = chars.slice(start, j + 1).join('').trim();
          if (s) out.push(s);
          start = j + 1;
        }
        i = j + 1;
      } else i++;
    }
    const rest = chars.slice(start).join('').trim();
    if (rest) out.push(rest);
  }
  return out;
}

/** Word-like tokens: ICU word segmentation when available (handles Thai), else letter/number runs. */
export function countWords(text: string): number {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'word' }) => { segment(s: string): Iterable<{ isWordLike?: boolean }> } }).Segmenter;
  if (Seg) {
    let n = 0;
    for (const s of new Seg(undefined, { granularity: 'word' }).segment(text)) if (s.isWordLike) n++;
    return n;
  }
  return (text.match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).length;
}

/** FNV-1a, 32 bit, over UTF-16 code units, as 8 hex digits. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Whitespace-collapsed NFC form used for hashing and equality of sentences. */
export const normalizeSentence = (s: string): string => s.normalize('NFC').replace(/\s+/gu, ' ').trim();

/** The hash that identifies a sentence in events (`subject.sentenceKey`, `payload.sentenceKey`). Never reversible to the text. */
export const sentenceKey = (sentence: string): string => fnv1a(normalizeSentence(sentence));

/** The hash stored on a version for its whole text. */
export const textHash = (text: string): string => fnv1a(text.normalize('NFC'));
