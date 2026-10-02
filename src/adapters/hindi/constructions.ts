/**
 * The grammar of Hindi as patterns a reader meets, not as lessons: agreement, direct and oblique forms before a
 * postposition, का / के / की, the habitual, the progressive, the perfective and its ने, को on objects and on the one who
 * feels or must, the future, commands, the subjunctive, the infinitive in its uses, obligation, ability, the passive,
 * causatives, करके, जो … वह, जब … तब, जहाँ … वहाँ, जितना … उतना, कि-clauses, compound verbs, auxiliary chains. Each is
 * a pattern item in the learner model: met, explained on request, never a gate.
 *
 * Machine-drafted from general knowledge of Hindi grammar, not checked by a native speaker (docs/PLAN12.md, package H4).
 * The inventory is data (construction-data.ts); the detectors are in construction-nominal.ts, construction-verbal.ts and
 * construction-clauses.ts. A detector fires only where the words it reads are analysed, and reports a confidence.
 */
import type { AnalyzedToken, PatternCandidate, RawToken } from '../../core';
import { HINDI_CONSTRUCTION_TABLE } from './construction-data';
import { makeCtx } from './construction-ctx';
import {
  adjectiveNounAgreement, comparisonAndSuperlative, emphaticParticles, existencePossession, genitiveAgreement,
  obliqueBeforePostposition, pluralForms, postpositionAfterNoun, questionKya, reduplication, vaala,
} from './construction-nominal';
import { verbalConstructions } from './construction-verbal';
import { conditionals, kiClauses, relativeClauses } from './construction-clauses';
import { describeGroup, groupAround } from './verb-group';

/** The construction inventory: key → title and a plain explanation with one example. Keys are stable (they are item ids). */
export const HINDI_CONSTRUCTIONS: Readonly<Record<string, { title: string; explanation: string; family: string }>> = HINDI_CONSTRUCTION_TABLE;

/** Every construction found in one sentence, each on the tokens that carry it, found only where the words around are analysed. */
export function detectHindiConstructions(tokens: RawToken[], analyses: AnalyzedToken[]): PatternCandidate[] {
  const c = makeCtx(tokens, analyses);
  const all = [
    ...adjectiveNounAgreement(c), ...genitiveAgreement(c), ...obliqueBeforePostposition(c), ...pluralForms(c),
    ...postpositionAfterNoun(c), ...comparisonAndSuperlative(c), ...vaala(c), ...reduplication(c), ...emphaticParticles(c),
    ...questionKya(c), ...existencePossession(c), ...verbalConstructions(c), ...relativeClauses(c), ...kiClauses(c), ...conditionals(c),
  ];
  // one hit per construction and token set; the most trusted wins
  const best = new Map<string, PatternCandidate>();
  for (const p of all) {
    const k = `${p.key}|${p.tokenIndexes.join(',')}`;
    const cur = best.get(k);
    if (!cur || p.confidence > cur.confidence) best.set(k, p);
  }
  return [...best.values()].sort((a, b) => a.tokenIndexes[0] - b.tokenIndexes[0] || a.key.localeCompare(b.key));
}

/**
 * The verb group that ends at or contains token i, as one statement: the main verb, any second verb of a compound,
 * and the auxiliaries, with what the whole says ("कह दी थी: कहना + देना, feminine perfective, past: had said").
 * Undefined when token i is not part of a verb group.
 */
export function hindiVerbGroup(tokens: RawToken[], analyses: AnalyzedToken[], i: number): { tokenIndexes: number[]; main: string; vector?: string; auxiliaries: string[]; summary: string } | undefined {
  const g = groupAround(tokens, analyses, i);
  if (!g) return undefined;
  return {
    tokenIndexes: g.tokenIndexes,
    main: g.main.lemma,
    vector: g.vector?.lemma,
    auxiliaries: g.aux.map((a) => a.lemma),
    summary: describeGroup(g),
  };
}
