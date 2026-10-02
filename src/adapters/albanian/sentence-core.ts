/**
 * Shared machinery of the Albanian sentence layer (sentence.ts and its rule files): the working state, small tests on a
 * candidate, and `pick` — the one way a rule decides.
 *
 * What a decision is: the readings that fit go to the front, in their order; the ones the sentence rules out stay,
 * behind them, with their confidence lowered to 0.4 at most; `notes.context` names what decided on the readings that
 * were chosen; a comma union on a chosen reading (`Case: 'Nom,Acc'`) is cut down to what the sentence allows. A reading
 * is never added, removed or given a higher confidence, and a candidate that changes is copied (the input is never
 * written to). Machine-drafted rules, not checked by a native speaker.
 */
import type { AnalysisCandidate, RawToken } from '../../core';

export type C = AnalysisCandidate;

/** The working state of one sentence. `cur[i]` starts as the very array `base[i]` and is replaced, never edited. */
export interface Ctx {
  tokens: RawToken[];
  base: C[][];
  cur: C[][];
  /** Tokens that are a piece of a lexical unit already formed (a linking article and its adjective). */
  inUnit: Set<number>;
}

// ───────────────────────────── tests on one candidate ─────────────────────────────

export const vals = (v: string | undefined): string[] => (v ? v.split(',') : []);
export const hasVal = (v: string | undefined, x: string): boolean => vals(v).includes(x);
export const isVerb = (c: C): boolean => c.pos === 'VERB' || c.pos === 'AUX';
/** A conjugated form. */
export const isFin = (c: C): boolean => isVerb(c) && (c.morph.VerbForm === 'Fin' || (c.morph.VerbForm === undefined && (c.morph.Tense !== undefined || c.morph.Mood !== undefined)));
export const isParticiple = (c: C): boolean => isVerb(c) && c.morph.VerbForm === 'Part';
export const isArticle = (c: C): boolean => c.pos === 'DET' && c.morph.PronType === 'Art';
/** A short object pronoun (or a cluster of them). */
export const isClitic = (c: C): boolean => c.morph.Clitic === 'Yes';
export const isArticulated = (c: C): boolean => c.notes?.articulated === 'yes';
export const isNominal = (c: C): boolean => c.pos === 'NOUN' || c.pos === 'PROPN';
/** A noun, a name, or a pronoun that stands for one (not a short object pronoun). */
export const isNounish = (c: C): boolean => isNominal(c) || (c.pos === 'PRON' && !isClitic(c)) || (c.pos === 'DET' && c.morph.PronType === 'Dem');
export const isParticle = (c: C, lemma: string): boolean => c.pos === 'PART' && c.lemma === lemma;
/** The particle "të" alone or as the first part of a cluster (ta = të + e, t'i = të + i). */
export const isTeParticle = (c: C): boolean => isParticle(c, 'të');

// ───────────────────────────── tokens ─────────────────────────────

export const norm = (cx: Ctx, i: number): string => cx.tokens[i].normalized;
/** `j` when it is a word of the sentence (nothing is a neighbour across a comma, a dash or a full stop). */
export const wordAt = (cx: Ctx, j: number): number | undefined => (j >= 0 && j < cx.tokens.length && cx.tokens[j].isWord ? j : undefined);
export const nextWord = (cx: Ctx, i: number): number | undefined => wordAt(cx, i + 1);
export const prevWord = (cx: Ctx, i: number): number | undefined => wordAt(cx, i - 1);
/** Has a sentence rule already chosen among this token's readings? */
export const decided = (cx: Ctx, i: number): boolean => cx.cur[i].length > 0 && cx.cur[i][0].notes?.context !== undefined;
/** Was this token read as a short object pronoun: one reading that is one, or one the sentence chose? */
export const cliticAt = (cx: Ctx, j: number): boolean => cx.cur[j].length > 0 && isClitic(cx.cur[j][0]) && (cx.cur[j].length === 1 || decided(cx, j));
/** Was this token read as the particle (or the particle inside a cluster) of this lemma? */
export const particleAt = (cx: Ctx, j: number, lemma: string): boolean => cx.cur[j].length > 0 && isParticle(cx.cur[j][0], lemma) && (cx.cur[j].length === 1 || decided(cx, j));
/** Any particle that stands before a verb: nuk, s', mos, po, të, u. */
export const anyParticleAt = (cx: Ctx, j: number): boolean => cx.cur[j].length > 0 && cx.cur[j][0].pos === 'PART' && (cx.cur[j].length === 1 || decided(cx, j));

// ───────────────────────────── changing a candidate ─────────────────────────────

/** `c` with each comma union in `allow` cut down to the listed values (same object when nothing changes). */
export function narrowed(c: C, allow: Record<string, string[]>): C {
  let morph: Record<string, string> | undefined;
  for (const [k, ok] of Object.entries(allow)) {
    const have = vals(c.morph[k]);
    if (have.length < 2) continue;
    const keep = have.filter((v) => ok.includes(v));
    if (keep.length === 0 || keep.length === have.length) continue;
    (morph ??= { ...c.morph })[k] = keep.join(',');
  }
  return morph ? { ...c, morph } : c;
}

export const withContext = (c: C, why: string): C => {
  const before = c.notes?.context;
  const note = typeof before === 'string' && before !== why && !before.includes(why) ? `${before}; ${why}` : why;
  return { ...c, notes: { ...(c.notes ?? {}), context: note } };
};
export const lowered = (c: C): C => (c.confidence > 0.4 ? { ...c, confidence: 0.4 } : c);

export interface Pick {
  pred: (c: C) => boolean;
  /** Plain words: what decided. */
  why: string;
  /** Unions to cut down on the chosen readings (a function when it depends on the reading). */
  allow?: Record<string, string[]> | ((c: C) => Record<string, string[]>);
  /** Only the commoner reading, nothing around the word rules the others out: they keep their confidence. */
  usual?: boolean;
  /** Replace the `role` of the chosen readings. */
  role?: string;
  /** Write the context note even when the order and the features stay as they were. */
  force?: boolean;
}

/**
 * Decide token i: the readings that satisfy `pred` first (in their order), the others behind them and marked down,
 * the chosen ones narrowed and given the context note. Returns false, touching nothing, when the sentence would change
 * nothing (no reading fits, every reading fits and nothing narrows, a lone reading with nothing to narrow).
 */
export function pick(cx: Ctx, i: number, p: Pick): boolean {
  const list = cx.cur[i];
  const yes = list.filter(p.pred);
  if (yes.length === 0) return false;
  const no = list.filter((c) => !p.pred(c));
  const allow = (c: C): Record<string, string[]> => (typeof p.allow === 'function' ? p.allow(c) : p.allow ?? {});
  const kept = yes.map((c) => narrowed(c, allow(c)));
  const narrowedAny = kept.some((c, k) => c !== yes[k]);
  const reordered = !list.slice(0, yes.length).every(p.pred);
  const markedDown = !p.usual && no.some((c) => c.confidence > 0.4);
  const roleChange = p.role !== undefined && yes.some((c) => c.role !== p.role);
  if (!narrowedAny && !reordered && !markedDown && !roleChange && !p.force && !(p.usual && no.length > 0)) return false;
  if (!narrowedAny && !reordered && !markedDown && !roleChange && p.usual && yes.every((c) => c.notes?.context === p.why)) return false;
  const chosen = kept.map((c) => {
    const w = withContext(c, p.why);
    return p.role !== undefined ? { ...w, role: p.role } : w;
  });
  cx.cur[i] = [...chosen, ...(p.usual ? no : no.map(lowered))];
  return true;
}
