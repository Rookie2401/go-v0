/**
 * Meaning preservation. A suggestion must never silently change WHAT the learner said. Four things are compared
 * between the learner's sentence and the suggested one:
 *   - negation (no / not / nunca / nicht ...): dropping, adding or swapping one can reverse the sentence;
 *   - chronology words and life-stage words ("cuando era joven", before / after / now / never);
 *   - key theological terms (know / believe / trust / repent / regret / guilt / conviction / salvation /
 *     forgiveness / grace / sin / faith ...) - never interchangeable;
 *   - tense, when both sentences carry an analysed tense that differs.
 * Every difference becomes a human-readable sentence; the service stores them in `meaningChange` (priority 1)
 * so nothing is silent. The checks are conservative string/analysis comparisons, not understanding.
 */
import type { LanguageCode } from '../core';
import { CHRONOLOGY, CONCEPTS, NEGATORS, conceptsForToken } from './concepts';
import type { ConceptId } from './concepts';
import { bestCandidate, wordIndexes } from './text';
import type { Parsed } from './text';

const nfc = (s: string) => s.normalize('NFC').toLowerCase();
const setCache = new Map<string, Set<string>>();
function setFor(kind: 'neg' | 'chrono', lang: LanguageCode): Set<string> {
  const key = `${kind}:${lang}`;
  let s = setCache.get(key);
  if (!s) {
    s = new Set((kind === 'neg' ? NEGATORS[lang] : CHRONOLOGY[lang]).map(nfc));
    setCache.set(key, s);
  }
  return s;
}

export function isNegator(lang: LanguageCode, normalized: string): boolean {
  return setFor('neg', lang).has(nfc(normalized));
}

/** Normalized forms of the negators in a parsed sentence (multiset, in order). */
export function negatorsIn(lang: LanguageCode, p: Parsed): string[] {
  return wordIndexes(p).map((i) => nfc(p.tokens[i].normalized)).filter((n) => setFor('neg', lang).has(n));
}

/** Chronology words plus life-stage words ("young"), as normalized forms (multiset, in order). */
export function chronologyIn(lang: LanguageCode, p: Parsed): string[] {
  const out: string[] = [];
  for (const i of wordIndexes(p)) {
    const n = nfc(p.tokens[i].normalized);
    const lemma = bestCandidate(p.analyses[i])?.lemma;
    if (setFor('chrono', lang).has(n) || conceptsForToken(lang, n, lemma).includes('young')) out.push(n);
  }
  return out;
}

function diffMulti(a: string[], b: string[]): { removed: string[]; added: string[] } {
  const pool = new Map<string, number>();
  for (const x of b) pool.set(x, (pool.get(x) ?? 0) + 1);
  const removed: string[] = [];
  for (const x of a) {
    const c = pool.get(x) ?? 0;
    if (c > 0) pool.set(x, c - 1); else removed.push(x);
  }
  const back = new Map<string, number>();
  for (const x of a) back.set(x, (back.get(x) ?? 0) + 1);
  const added: string[] = [];
  for (const x of b) {
    const c = back.get(x) ?? 0;
    if (c > 0) back.set(x, c - 1); else added.push(x);
  }
  return { removed, added };
}

const quote = (xs: string[]) => xs.map((x) => `"${x}"`).join(', ');

function keyTermMap(lang: LanguageCode, p: Parsed): Map<ConceptId, string> {
  const m = new Map<ConceptId, string>();
  for (const i of wordIndexes(p)) {
    const lemma = bestCandidate(p.analyses[i])?.lemma;
    for (const c of conceptsForToken(lang, p.tokens[i].normalized, lemma)) if (CONCEPTS[c].keyTerm && !m.has(c)) m.set(c, p.tokens[i].surface);
  }
  return m;
}

function tenseSet(p: Parsed): string[] {
  const s = new Set<string>();
  for (const i of wordIndexes(p)) {
    const c = bestCandidate(p.analyses[i]);
    if ((c?.pos === 'VERB' || c?.pos === 'AUX') && c.morph?.Tense) s.add(c.morph.Tense);
  }
  return [...s].sort();
}

export function negationChange(lang: LanguageCode, orig: Parsed, sug: Parsed): string | undefined {
  const { removed, added } = diffMulti(negatorsIn(lang, orig), negatorsIn(lang, sug));
  if (removed.length === 0 && added.length === 0) return undefined;
  const before = negatorsIn(lang, orig).length;
  const after = negatorsIn(lang, sug).length;
  if (before > 0 && after === 0) return `Removes the negation ${quote(removed)}: the sentence would say the opposite. Accept only if that is what you mean.`;
  if (before === 0 && after > 0) return `Adds a negation ${quote(added)}: the sentence would say the opposite. Accept only if that is what you mean.`;
  if (removed.length && added.length) return `Changes the negation: ${quote(removed)} becomes ${quote(added)}. Accept only if it says what you mean.`;
  if (removed.length) return `Removes one negation word (${quote(removed)}). Accept only if you meant to leave it out.`;
  return `Adds a negation word (${quote(added)}). Accept only if you meant to say it.`;
}

export function chronologyChange(lang: LanguageCode, orig: Parsed, sug: Parsed): string | undefined {
  const { removed, added } = diffMulti(chronologyIn(lang, orig), chronologyIn(lang, sug));
  if (removed.length === 0 && added.length === 0) return undefined;
  if (removed.length && added.length) return `Changes a time word: ${quote(removed)} becomes ${quote(added)}. This changes when things happened.`;
  if (removed.length) return `Drops the time word ${quote(removed)}. The sentence would no longer say when.`;
  return `Adds the time word ${quote(added)}. Accept only if it says when you meant.`;
}

export function keyTermChange(lang: LanguageCode, orig: Parsed, sug: Parsed): string | undefined {
  const a = keyTermMap(lang, orig);
  const b = keyTermMap(lang, sug);
  const removed = [...a.keys()].filter((c) => !b.has(c));
  const added = [...b.keys()].filter((c) => !a.has(c));
  const fmt = (m: Map<ConceptId, string>, cs: ConceptId[]) => cs.map((c) => `"${m.get(c)}" (${c})`).join(', ');
  if (removed.length && added.length) return `Changes a key term: ${fmt(a, removed)} becomes ${fmt(b, added)}. These are not interchangeable - accept only if it says what you mean.`;
  if (removed.length) return `Removes the key term ${fmt(a, removed)}. Accept only if you meant to leave it out.`;
  if (added.length) return `Introduces the key term ${fmt(b, added)}. Accept only if you meant to say it.`;
  return undefined;
}

export function tenseChange(orig: Parsed, sug: Parsed): string | undefined {
  const a = tenseSet(orig);
  const b = tenseSet(sug);
  if (a.length === 0 || b.length === 0 || a.join('|') === b.join('|')) return undefined;
  return `Changes the tense (${a.join('/')} becomes ${b.join('/')}): check it still says when you meant.`;
}

/** Every meaning difference between the learner's sentence and a suggested one (empty = none detected). */
export function meaningChanges(lang: LanguageCode, orig: Parsed, sug: Parsed): string[] {
  return [negationChange(lang, orig, sug), chronologyChange(lang, orig, sug), keyTermChange(lang, orig, sug), tenseChange(orig, sug)]
    .filter((x): x is string => !!x);
}
