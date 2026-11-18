/**
 * Shared helpers for profiles of alphabetic scripts: the units a written form needs, read by longest match over the profile's
 * spellings. A profile with contextual rules (Hebrew dagesh, Hindi inherent vowel, Thai tone rules) adds its rule keys itself.
 */

export interface Spelling {
  /** The written sequence (NFC, after `fold`). */
  written: string;
  /** The unit (or units, in order) it is a spelling of: á is the letter a and the accent rule. */
  key: string | readonly string[];
}

export interface GreedyOptions {
  spellings: readonly Spelling[];
  /** Applied to the form before matching (case folding, stripping cantillation …). Must keep offsets meaningless to callers: only the keys are returned. */
  fold?: (s: string) => string;
  /** Characters that are not part of decoding (punctuation, digits, spaces, joiners): skipped. Default: anything that is neither a letter nor a mark. */
  ignorable?: (ch: string) => boolean;
}

const LETTER_OR_MARK = /[\p{L}\p{M}]/u;

/**
 * The unit keys of a form by greedy longest match, in order of first use and without repeats; undefined when some letter or mark
 * matches no spelling (the profile cannot model the form, so it is never offered as a decoding exercise and never counted as
 * decodable).
 */
export function greedyDependencies(form: string, opts: GreedyOptions): string[] | undefined {
  const text = (opts.fold ? opts.fold(form.normalize('NFC')) : form.normalize('NFC'));
  const byFirst = new Map<string, Spelling[]>();
  for (const s of opts.spellings) {
    const first = [...s.written][0];
    if (!first) continue;
    const list = byFirst.get(first) ?? [];
    list.push(s);
    byFirst.set(first, list);
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.written.length - a.written.length);
  const ignorable = opts.ignorable ?? ((ch: string) => !LETTER_OR_MARK.test(ch));
  const keys: string[] = [];
  const chars = [...text];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    const rest = chars.slice(i).join('');
    const hit = (byFirst.get(ch) ?? []).find((s) => rest.startsWith(s.written));
    if (hit) {
      for (const k of typeof hit.key === 'string' ? [hit.key] : hit.key) if (!keys.includes(k)) keys.push(k);
      i += [...hit.written].length;
      continue;
    }
    if (ignorable(ch)) { i++; continue; }
    return undefined;
  }
  return keys;
}

/** Default word splitter: runs of letters and marks (with internal apostrophes/hyphens kept out). */
export function lettersAndMarksWords(text: string): string[] {
  return text.normalize('NFC').match(/[\p{L}\p{M}]+/gu) ?? [];
}
