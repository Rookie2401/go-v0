/**
 * Looking at the neighbours: what follows a little word, what stands before a linking article, and which noun it
 * agrees with. Used by sentence-little.ts and sentence-clause.ts. Reads the context-free readings (`base`) of the other
 * words, so that a decision on one word never depends on the order in which the others were decided.
 */
import { linkingArticle } from './function-words';
import {
  isArticle, isClitic, isFin, isNominal, isNounish, hasVal, norm, pick, vals, wordAt,
  type C, type Ctx,
} from './sentence-core';

/** The short object pronouns (and the little words that stand with them) in their simple written forms. */
const SHORT = new Set(['më', 'të', 'e', 'i', 'u', 'na', 'ju']);
/** Negation: it may stand between të and its verb (të mos shkoj). */
export const NEGATION = new Set(['nuk', "s'", 'mos']);

/** Is there a conjugated verb reading in this word's context-free readings? */
export const verbLike = (cx: Ctx, k: number): boolean => cx.base[k].some(isFin);
/** Does the word have a reading that stands after a linking article (adjective, ordinal, possessive)? */
export const adjLike = (cx: Ctx, k: number): boolean => cx.base[k].some((c) => c.notes?.articulated === 'yes');
/** Can the word be a short object pronoun? */
export const isShort = (cx: Ctx, k: number): boolean => SHORT.has(norm(cx, k)) || cx.base[k].some(isClitic);
/** A word that only qualifies a noun: a, this, every, some, a number — no noun, pronoun or verb reading. */
export const isDeterminer = (cx: Ctx, k: number): boolean =>
  cx.base[k].length > 0 && cx.base[k].every((c) => (c.pos === 'DET' && !isArticle(c)) || c.pos === 'NUM');

/**
 * A conjugated verb after the word at `i`, with only short object pronouns (and, if `skipNegation`, negation) between:
 * "e pashë", "i dhashë", "ta jap", "të mos e shoh". `shorts` counts the pronouns in between.
 */
export function verbAhead(cx: Ctx, i: number, skipNegation = false): { idx: number; shorts: number } | undefined {
  let j = i + 1;
  let shorts = 0;
  for (;;) {
    const w = wordAt(cx, j);
    if (w === undefined) return undefined;
    if (isShort(cx, w) && !(skipNegation && NEGATION.has(norm(cx, w)))) { shorts++; j++; continue; }
    if (skipNegation && NEGATION.has(norm(cx, w))) { j++; continue; }
    return verbLike(cx, w) ? { idx: w, shorts } : undefined;
  }
}

/** The head of the noun phrase that begins at `k`: determiners and linking-article units are skipped. */
export function phraseHead(cx: Ctx, k: number): { idx: number; skipped: boolean } | undefined {
  let j = k;
  let skipped = false;
  for (;;) {
    const w = wordAt(cx, j);
    if (w === undefined) return undefined;
    if (isDeterminer(cx, w)) { skipped = true; j++; continue; }
    if (cx.inUnit.has(w)) { skipped = true; j++; continue; }
    return cx.base[w].some(isNounish) ? { idx: w, skipped } : undefined;
  }
}

/** The noun phrase after a linking article that is in the genitive, when the words say so. */
export function genitiveAhead(cx: Ctx, k: number): { idx: number; certain: boolean } | undefined {
  let j = k;
  let determiner = false;
  for (;;) {
    const w = wordAt(cx, j);
    if (w === undefined) return undefined;
    if (isDeterminer(cx, w) && !cx.base[w].some((c) => hasVal(c.morph.Case, 'Gen'))) { determiner = true; j++; continue; }
    const base = cx.base[w];
    const heads = base.filter(isNounish);
    if (!heads.some((c) => hasVal(c.morph.Case, 'Gen'))) return undefined;
    // with a determiner before it ("i një djali") the genitive of the noun is the only one that fits; alone, every
    // reading of the word must be a genitive form (djalit, Anës, nxënësve) — "lapsi" is a nominative as well
    const certain = determiner ? true : base.every((c) => isNounish(c) && hasVal(c.morph.Case, 'Gen'));
    return { idx: w, certain };
  }
}

/** Plural, feminine singular genitive … : the noun readings that go with this article form, and the features they leave. */
type Gender = 'Masc' | 'Fem' | 'Neut';
function articleFits(c: C, form: string, adjacent: boolean): { fits: boolean; unknown: boolean; left: Record<string, Set<string>> } {
  const G = vals(c.morph.Gender), N = vals(c.morph.Number), K = vals(c.morph.Case), D = vals(c.morph.Definite);
  const left: Record<string, Set<string>> = { Gender: new Set(), Number: new Set(), Case: new Set(), Definite: new Set() };
  if (!G.length || !N.length || !K.length || !D.length) return { fits: true, unknown: true, left };
  let fits = false;
  for (const g of G) for (const n of N) for (const k of K) for (const d of D) {
    const arts = linkingArticle({ gender: g as Gender, number: n as 'Sing' | 'Plur', case: k as 'Nom', definite: d as 'Def', adjacent });
    if (!arts.includes(form)) continue;
    fits = true;
    left.Gender.add(g); left.Number.add(n); left.Case.add(k); left.Definite.add(d);
  }
  return { fits, unknown: false, left };
}

/**
 * The noun a linking article at `a` belongs to: the noun directly before it, or before the possessives and
 * adjective units that stand between ("djali im i mirë"). When exactly one of that noun's readings can stand before
 * this article form, that reading is chosen and its unions cut down to what the article allows ("vajza e mirë": vajza
 * is the definite nominative singular). Returns the noun's token and, when it is known, its reading; undefined when
 * no noun stands there.
 */
export function headOf(cx: Ctx, a: number, form: string): { idx: number; reading?: C } | undefined {
  let j = a - 1;
  let skipped = false;
  while (wordAt(cx, j) !== undefined) {
    if (cx.cur[j].some(isNominal) && !cx.inUnit.has(j)) break;
    if (cx.inUnit.has(j) || (cx.base[j].length > 0 && cx.base[j].every((c) => c.morph.Poss === 'Yes'))) { skipped = true; j--; continue; }
    return undefined;
  }
  if (wordAt(cx, j) === undefined) return undefined;
  const nouns = cx.cur[j].filter(isNominal);
  const fit = nouns.map((c) => ({ c, ...articleFits(c, form, !skipped) }));
  const ok = fit.filter((f) => f.fits);
  const lone = nouns.length === 1 ? nouns[0] : undefined;
  if (ok.length !== 1) return { idx: j, reading: lone };
  const only = ok[0];
  if (only.unknown) return { idx: j, reading: lone };
  const done = pick(cx, j, {
    pred: (c) => c === only.c,
    why: `the linking article "${form}" after it: only this reading agrees with it`,
    allow: Object.fromEntries(Object.entries(only.left).map(([k, v]) => [k, [...v]])),
  });
  return { idx: j, reading: done ? cx.cur[j][0] : only.c };
}

/** The unions of a linking article (gender, number, case) cut down to what its noun's reading says. */
export const agreeWith = (head: C | undefined): Record<string, string[]> =>
  head ? { Gender: vals(head.morph.Gender), Number: vals(head.morph.Number), Case: vals(head.morph.Case) } : {};
