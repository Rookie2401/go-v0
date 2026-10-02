/**
 * The reading context the Hindi construction detectors share: the readings of each word that still count, the words
 * next to it, the clause around it, and the verb groups of the sentence. Machine-drafted (docs/PLAN12.md, package H4).
 */
import type { AnalyzedToken, PatternCandidate, PartOfSpeech, RawToken } from '../../core';
import { buildVerbGroups, feat, hasF, viable, type C, type VerbGroup } from './verb-group';
import { HINDI_CONSTRUCTION_TABLE } from './construction-data';

export interface Ctx {
  tokens: RawToken[];
  analyses: AnalyzedToken[];
  groups: VerbGroup[];
  n(i: number): string;
  isWord(i: number): boolean;
  /** The readings of word i that still count (see `viable`); empty for punctuation and unanalysed words. */
  cands(i: number): C[];
  /** The best counting reading of word i that satisfies pred. */
  find(i: number, pred: (c: C) => boolean): C | undefined;
  pos(i: number, ...p: PartOfSpeech[]): C | undefined;
  lemma(i: number, ...l: string[]): C | undefined;
  /** Index of the word directly after i, or -1 when punctuation, the end, or nothing intervenes (adjacency). */
  after(i: number): number;
  before(i: number): number;
  /** The clause around i: first and last token index, bounded by punctuation. */
  clause(i: number): [number, number];
  /** The group (if any) that has token i among its verb elements. */
  groupOf(i: number): VerbGroup | undefined;
}

const BREAKS = /^[,;:।॥?!…()"'“”‘’«»]+$/u;
const isBreak = (t: RawToken): boolean => !t.isWord && BREAKS.test(t.surface);

export function makeCtx(tokens: RawToken[], analyses: AnalyzedToken[]): Ctx {
  const groups = buildVerbGroups(tokens, analyses);
  const cache = new Map<number, C[]>();
  const cands = (i: number): C[] => {
    if (!tokens[i]?.isWord) return [];
    let r = cache.get(i);
    if (!r) {
      const all = analyses[i]?.candidates ?? [];
      r = all.filter((c) => viable(all, c)).sort((a, b) => b.confidence - a.confidence);
      cache.set(i, r);
    }
    return r;
  };
  const groupAt = new Map<number, VerbGroup>();
  for (const g of groups) for (const e of g.elems) groupAt.set(e.i, g);
  const find = (i: number, pred: (c: C) => boolean) => cands(i).find(pred);
  return {
    tokens, analyses, groups, cands, find,
    n: (i) => tokens[i]?.normalized ?? '',
    isWord: (i) => !!tokens[i]?.isWord,
    pos: (i, ...p) => find(i, (c) => c.pos !== undefined && p.includes(c.pos)),
    lemma: (i, ...l) => find(i, (c) => c.lemma !== undefined && l.includes(c.lemma)),
    after: (i) => (tokens[i + 1]?.isWord ? i + 1 : -1),
    before: (i) => (i > 0 && tokens[i - 1]?.isWord ? i - 1 : -1),
    clause(i) {
      let a = i;
      let b = i;
      while (a > 0 && !isBreak(tokens[a - 1])) a--;
      while (b < tokens.length - 1 && !isBreak(tokens[b + 1])) b++;
      return [a, b];
    },
    groupOf: (i) => groupAt.get(i),
  };
}

/** A pattern hit with the title and explanation from the inventory. */
export function hit(key: string, confidence: number, tokenIndexes: number[]): PatternCandidate {
  const info = HINDI_CONSTRUCTION_TABLE[key];
  return {
    key, title: info.title, explanation: info.explanation,
    confidence: Math.max(0.3, Math.min(0.95, confidence)),
    tokenIndexes: [...new Set(tokenIndexes)].sort((a, b) => a - b),
  };
}

export const POSTPOSITION_FORMS = new Set(['ने', 'को', 'से', 'में', 'पर', 'तक', 'का', 'के', 'की']);
export const NOMINAL_POS: PartOfSpeech[] = ['NOUN', 'PROPN', 'PRON'];

/** Word i is a postposition: a reading says so, or (for a word nothing is known about) its form does. */
export function isPostposition(c: Ctx, i: number): boolean {
  if (!c.isWord(i)) return false;
  if (c.pos(i, 'ADP')) return true;
  return c.cands(i).length === 0 && POSTPOSITION_FORMS.has(c.n(i));
}

/** The possessive pronouns: each is a का / के / की of its own. */
export const POSSESSIVES = new Set(
  ('मेरा मेरे मेरी तेरा तेरे तेरी हमारा हमारे हमारी तुम्हारा तुम्हारे तुम्हारी आपका आपके आपकी उसका उसके उसकी इसका इसके इसकी ' +
    'उनका उनके उनकी इनका इनके इनकी किसका किसके किसकी जिसका जिसके जिसकी अपना अपने अपनी').split(' ').map((s) => s.normalize('NFC')),
);

/** Word i is a genitive: का / के / की, a possessive pronoun, or a fused form with a genitive part. */
export function isGenitive(c: Ctx, i: number): boolean {
  if (!c.isWord(i)) return false;
  const all = c.analyses[i]?.candidates ?? [];
  if (all.length === 0) return ['का', 'के', 'की'].includes(c.n(i)) || POSSESSIVES.has(c.n(i));
  return c.cands(i).some((x) => x.lemma === 'का' || x.morph.Poss === 'Yes' || x.morph.Case === 'Gen' || !!x.parts?.some((p) => p.lemma === 'का'));
}

export const genderOf =(c: C): string | undefined => { const f = feat(c, 'Gender'); return f.length === 1 ? f[0] : undefined; };
export const numberOf = (c: C): string | undefined => { const f = feat(c, 'Number'); return f.length === 1 ? f[0] : undefined; };
export { feat, hasF };

/** The lowest confidence among readings, scaled a little: how much a detector trusts the words it read. */
export const trust = (...cs: Array<C | undefined>): number => Math.min(...cs.map((c) => c?.confidence ?? 0.5)) * 0.95;
