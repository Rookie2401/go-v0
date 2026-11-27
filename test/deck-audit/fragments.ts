/**
 * "No admitted card's first meaning stops where the source sense goes on" (the Arabic auditor's test, 2026-11-27), as a check that can be run over any deck-audit set.
 * A first meaning is a FRAGMENT when it ends in a dangling function word (the, a, an, in, of, to, for, with, and, or) after at least one other word, in a dangling comma or
 * semicolon, in an unclosed bracket, or when it is the beginning of a source sense that goes on (a strict prefix of the sense's text that ends inside an item).
 */
const TRAILING = /(?:^|\s)(?:the|a|an|in|of|to|for|with|and|or)$/iu;

const normBare = (t: string): string => { let x = t.toLowerCase(); for (let k = 0; k < 8; k++) { const n = x.replace(/\([^()]*\)|\[[^[\]]*\]/gu, ' '); if (n === x) break; x = n; } return x.replace(/\s+/gu, ' ').trim().replace(/[.\s]+$/u, ''); };
const itemsOf = (t: string): string[] => normBare(t).split(/\s*[;,:]\s*/u).map((x) => x.trim()).filter(Boolean);
/** The shown meaning is a whole item, or a run of items, of one of the source senses (brackets removed): a complete alternative, even when it ends in a word like "for" ("to wait for"). */
export function isWholeSourceItem(shown: string, sourceSenses: readonly string[]): boolean {
  const mine = itemsOf(shown);
  return mine.length > 0 && sourceSenses.some((s) => { const it = itemsOf(s); for (let i = 0; i + mine.length <= it.length; i++) if (mine.every((x, k) => it[i + k] === x)) return true; return false; });
}

export function fragmentWhy(shown: string, sourceSenses: readonly string[] = []): string | undefined {
  const t = shown.trim();
  if (!t) return 'empty';
  if (/[,;:]$/u.test(t)) return 'ends in a dangling comma, semicolon or colon';
  const open = (t.match(/[([]/gu) ?? []).length; const close = (t.match(/[)\]]/gu) ?? []).length;
  if (open > close) return 'an unclosed bracket';
  // a function word at the end is a fragment only when the source sense does not itself end there ("to wait for" is a whole item of its sense)
  if (t.split(/\s+/u).length >= 2 && TRAILING.test(t) && !isWholeSourceItem(t, sourceSenses)) return 'ends in a function word';
  // a meaning that is itself a whole item of some sense is complete, whatever other senses begin with the same words ("to come" beside "to come up with")
  if (isWholeSourceItem(t, sourceSenses)) return undefined;
  const norm = (x: string): string => x.toLowerCase().replace(/\s+/gu, ' ').trim().replace(/[.\s]+$/u, '');
  const n = norm(t);
  for (const s of sourceSenses) {
    const m = norm(s);
    // a strict prefix that is not followed by an item boundary: the sense goes on in the middle of a phrase
    if (m.startsWith(`${n} `) && !/^[,;:(\[]/u.test(m.slice(n.length).trim())) return `stops where the source sense goes on: "${s.slice(0, 80)}"`;
  }
  return undefined;
}
