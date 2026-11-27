/**
 * "No admitted card's first meaning is a fragment" (the owner's rule: a fragment is an unknown card). The idea and the first version of the check are
 * the Arabic auditor's (2026-11-27). Run over every set, it also flagged complete English: a preposition glossed by prepositions ("from, by, of"), a
 * verb whose preposition belongs to it ("to take care of", "devoid of, free of"), an article glossed "a, an". Those 72 findings were read (an AI
 * reader) and are whole meanings, so a final preposition is not a fault here. What is a fault:
 *   - nothing, or a dangling comma, semicolon or colon;
 *   - an unclosed bracket;
 *   - a final article that is not itself the meaning ("to give a"; "a, an" is an article's gloss);
 *   - a final "and" or "or" that joins nothing ("to come and"; "and; also" or a bare "and" are meanings).
 */
export function fragmentWhy(shown: string): string | undefined {
  const t = shown.trim();
  if (!t) return 'empty';
  if (/[,;:]$/u.test(t)) return 'ends in a dangling comma, semicolon or colon';
  if ((t.match(/[([]/gu) ?? []).length > (t.match(/[)\]]/gu) ?? []).length) return 'an unclosed bracket';
  const items = t.toLowerCase().split(/\s*[;,/]\s*/u).map((x) => x.trim()).filter(Boolean);
  const last = items[items.length - 1] ?? '';
  if (/\s(?:the|a|an)$/u.test(last) && last !== 'many a') return 'ends in an article'; // "several, many a" is the English idiom
  if (/\s(?:and|or)$/u.test(last)) return 'ends in a conjunction that joins nothing';
  return undefined;
}
