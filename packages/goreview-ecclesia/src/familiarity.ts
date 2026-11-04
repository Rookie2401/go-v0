/**
 * Next Best Passage — a PROVISIONAL familiarity heuristic, labelled as such on every result.
 *
 * The estimate: the share of a passage's word tokens whose lexeme (or, by default, whose printed form) the learner knows at the
 * policy's level or above. The target band (80–90 % by default, per language profile) is the brief's working hypothesis of
 * where reading stays fluent yet teaches; nothing here has been calibrated against learners, and `reliability` says how much of
 * the passage the estimate rests on (tokens with any knowledge row at all). The Repository engine's own `estimateSuitability`
 * counts recognition-score tokens; this heuristic reads the six LEVELS instead, because a reader shows levels.
 *
 * Ranking passages puts those inside the band first, then the nearest to it, then the better-evidenced, then the ones with
 * fewer unknown lexemes, then canonical order — every step deterministic. `unknownLexemes` lists what to pre-teach, commonest
 * first when a corpus-frequency provider is given.
 */
import { KNOWLEDGE_LEVEL_RANK } from '../../repository-contract/src';
import type { KnowledgeLevel } from '../../repository-contract/src';
import { FAMILIARITY_HEURISTIC } from './contract';
import type { CorpusFrequencyProvider, EcclesiaLanguageProfile, FamiliarityPolicy, PassageFamiliarity, PassageTokens, RankedPassage, UnitStanding, UnknownLexeme } from './contract';
import { lexemeId, formId, passageKey } from './identity';

export interface FamiliarityInput {
  profile: EcclesiaLanguageProfile;
  passage: PassageTokens;
  standings: ReadonlyMap<string, UnitStanding>;
  frequency?: CorpusFrequencyProvider;
  policy?: Partial<FamiliarityPolicy>;
}

const atLeast = (level: KnowledgeLevel, floor: KnowledgeLevel): boolean => KNOWLEDGE_LEVEL_RANK[level] >= KNOWLEDGE_LEVEL_RANK[floor];
const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

export function passageFamiliarity(inp: FamiliarityInput): PassageFamiliarity {
  const { profile, passage, standings } = inp;
  if (passage.language !== profile.id) throw new RangeError(`passage is ${passage.language}, profile is ${profile.id}`);
  const policy: FamiliarityPolicy = { ...profile.familiarity, ...(inp.policy ?? {}) };
  if (!(policy.targetLow >= 0 && policy.targetLow <= policy.targetHigh && policy.targetHigh <= 1)) throw new RangeError('target band must satisfy 0 <= low <= high <= 1');
  const notes = ['provisional heuristic: share of word tokens at or above the policy level; not calibrated against learners'];
  if (!inp.frequency || inp.frequency.total === 0) notes.push('no corpus-frequency provider: unknown lexemes are ordered by occurrences in the passage');

  let tokens = 0, known = 0, evidenced = 0;
  const unknown = new Map<string, UnknownLexeme>();
  for (const v of passage.verses) for (const t of v.tokens) {
    tokens += 1;
    const lex = lexemeId(profile, t.lemma, t.pos);
    const lexLevel = standings.get(lex)?.level ?? 'new';
    const form = formId(profile, t.surface);
    const formLevel = standings.get(form)?.level ?? 'new';
    if (standings.has(lex) || standings.has(form)) evidenced += 1;
    const isKnown = atLeast(lexLevel, policy.knownFrom) || (policy.formsCount && atLeast(formLevel, policy.knownFrom));
    if (isKnown) { known += 1; continue; }
    const row = unknown.get(lex);
    if (row) row.occurrences += 1;
    else {
      const rank = inp.frequency?.rankOf(lex);
      unknown.set(lex, { lexemeId: lex, lemma: t.lemma, pos: t.pos, occurrences: 1, level: lexLevel, ...(rank !== undefined ? { frequencyRank: rank } : {}) });
    }
  }
  const familiarity = tokens ? r6(known / tokens) : 0;
  const inTargetBand = tokens > 0 && familiarity >= policy.targetLow && familiarity <= policy.targetHigh;
  const distanceFromBand = inTargetBand ? 0 : r6(familiarity < policy.targetLow ? policy.targetLow - familiarity : familiarity - policy.targetHigh);
  if (!tokens) notes.push('empty passage: nothing to estimate');
  const unknownLexemes = [...unknown.values()].sort((a, b) =>
    (a.frequencyRank ?? Infinity) - (b.frequencyRank ?? Infinity) || b.occurrences - a.occurrences || (a.lexemeId < b.lexemeId ? -1 : a.lexemeId > b.lexemeId ? 1 : 0));
  return {
    heuristic: FAMILIARITY_HEURISTIC, provisional: true, language: profile.id, ref: passage.ref, policy, tokens, knownTokens: known, familiarity, inTargetBand, distanceFromBand,
    reliability: tokens ? r6(evidenced / tokens) : 0, unknownLexemes, notes,
  };
}

export function rankPassages(estimates: readonly PassageFamiliarity[]): RankedPassage[] {
  const sorted = [...estimates].sort((a, b) =>
    Number(b.inTargetBand) - Number(a.inTargetBand) || a.distanceFromBand - b.distanceFromBand || b.reliability - a.reliability ||
    a.unknownLexemes.length - b.unknownLexemes.length || passageKey(a.ref).localeCompare(passageKey(b.ref)));
  return sorted.map((f, i) => ({
    familiarity: f, rank: i + 1,
    reasons: [
      f.inTargetBand ? `inside the ${Math.round(f.policy.targetLow * 100)}–${Math.round(f.policy.targetHigh * 100)} % band` : `${Math.round(f.distanceFromBand * 100)} points outside the band`,
      `${Math.round(f.familiarity * 100)} % of ${f.tokens} tokens known`, `reliability ${Math.round(f.reliability * 100)} %`,
      `${f.unknownLexemes.length} unknown lexeme${f.unknownLexemes.length === 1 ? '' : 's'}`,
    ],
  }));
}

/** The passage to read next among candidates, or undefined when none was given. The caller shows the reasons; the choice is provisional. */
export function nextBestPassage(inp: Omit<FamiliarityInput, 'passage'> & { passages: readonly PassageTokens[] }): RankedPassage | undefined {
  return rankPassages(inp.passages.map((passage) => passageFamiliarity({ ...inp, passage })))[0];
}
