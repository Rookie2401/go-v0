/** Analysis resolution (human > lexicon > machine, then confidence) and the morphology line. */
import type { AppStore, PartOfSpeech, TokenAnalysis } from '../core';
import { LEMMA_MIN_CONFIDENCE } from './policy';

const PROVENANCE_RANK: Record<TokenAnalysis['provenance'], number> = { human: 3, lexicon: 2, machine: 1 };

/** Pure resolution over all analysis rows of one token. Superseded rows lose to their superseder. */
export function pickAnalysis(rows: TokenAnalysis[]): TokenAnalysis | undefined {
  if (rows.length === 0) return undefined;
  const superseded = new Set(rows.map((r) => r.supersedes).filter((x): x is string => !!x));
  const live = rows.filter((r) => !superseded.has(r.id));
  const pool = live.length > 0 ? live : rows;
  return [...pool].sort((a, b) =>
    PROVENANCE_RANK[b.provenance] - PROVENANCE_RANK[a.provenance]
    || b.confidence - a.confidence
    || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)
    || (a.id < b.id ? -1 : 1))[0];
}

/**
 * A piece of a lexical unit written as several words (German "steht … auf" = aufstehen) that is NOT the unit's head. Every piece
 * carries the unit's lemma, but the unit is one word: its encounter is counted once, on the head piece.
 */
export const isNonHeadPiece = (a: Pick<TokenAnalysis, 'tokenId' | 'unit'> | undefined): boolean =>
  !!a?.unit && a.unit.headTokenId !== a.tokenId;

/**
 * The lemma an analysis is ABOUT, when it may be named at all: human always; otherwise only when confidence ≥ LEMMA_MIN_CONFIDENCE.
 * Every piece of a unit is about the unit's lemma: a learner who taps the stranded "auf" has asked about aufstehen, so help on any
 * piece is help on that lemma (the fold uses this one for help; encounters use `creditableLemmaId`).
 */
export function askedLemmaId(a: TokenAnalysis | undefined): string | undefined {
  if (!a?.lemmaId) return undefined;
  if (a.provenance === 'human' || a.confidence >= LEMMA_MIN_CONFIDENCE) return a.lemmaId;
  return undefined;
}

/**
 * The lemma item an analysis may credit with an encounter (see `askedLemmaId`). A piece of a lexical unit that is not its head
 * credits none: the head piece does, so a unit is one word, in encounters, coverage and difficulty alike. Its FORM still counts.
 */
export function creditableLemmaId(a: TokenAnalysis | undefined): string | undefined {
  return isNonHeadPiece(a) ? undefined : askedLemmaId(a);
}

/** Per-operation memo so one coverage / recommend pass resolves each token once. */
export class AnalysisCache {
  private readonly byToken = new Map<string, TokenAnalysis | undefined>();
  constructor(private readonly store: AppStore) {}

  async resolve(tokenId: string): Promise<TokenAnalysis | undefined> {
    if (this.byToken.has(tokenId)) return this.byToken.get(tokenId);
    const a = pickAnalysis(await this.store.analyses.where('tokenId', tokenId));
    this.byToken.set(tokenId, a);
    return a;
  }

  async prefetch(tokenIds: string[]): Promise<void> {
    await Promise.all(tokenIds.filter((t) => !this.byToken.has(t)).map((t) => this.resolve(t)));
  }

  /** The lemma this token credits with an encounter (none for a non-head piece of a lexical unit). */
  async lemmaIdOf(tokenId: string): Promise<string | undefined> {
    return creditableLemmaId(await this.resolve(tokenId));
  }

  /** The lemma this token is about, whatever piece of a unit it is: where help on the token lands. */
  async askedLemmaIdOf(tokenId: string): Promise<string | undefined> {
    return askedLemmaId(await this.resolve(tokenId));
  }
}

const POS_LABEL: Record<PartOfSpeech, string> = {
  NOUN: 'noun', PROPN: 'proper noun', VERB: 'verb', AUX: 'auxiliary', ADJ: 'adjective', ADV: 'adverb',
  PRON: 'pronoun', DET: 'determiner', ADP: 'adposition', CONJ: 'conjunction', SCONJ: 'subordinator',
  PART: 'particle', NUM: 'numeral', INTJ: 'interjection', CLF: 'classifier', PUNCT: 'punctuation', X: 'other',
};
const NUMBER_SHORT: Record<string, string> = { Sing: 'sg', Plur: 'pl' };
const FEATURE_ORDER = ['Gender', 'Case', 'Definite', 'Tense', 'Aspect', 'Mood', 'VerbForm', 'Voice', 'Degree'];

/** e.g. "verb · 1sg · past". Undefined when there is nothing to say. */
export function morphologyLine(a: TokenAnalysis | undefined): string | undefined {
  if (!a) return undefined;
  const parts: string[] = [];
  if (a.pos) parts.push(POS_LABEL[a.pos]);
  const m = a.morph ?? {};
  const used = new Set<string>();
  if (m.Person && m.Number) {
    parts.push(`${m.Person}${NUMBER_SHORT[m.Number] ?? m.Number.toLowerCase()}`);
    used.add('Person');
    used.add('Number');
  }
  for (const k of [...FEATURE_ORDER, ...Object.keys(m).sort()]) {
    if (used.has(k) || m[k] === undefined) continue;
    used.add(k);
    parts.push(k === 'Number' ? (NUMBER_SHORT[m[k]] ?? m[k].toLowerCase()) : m[k].toLowerCase());
  }
  return parts.length ? parts.join(' · ') : undefined;
}
