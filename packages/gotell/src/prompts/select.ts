/**
 * Choosing a prompt for a writer: prefer a prompt that practises a construction the writer has found hard, then one the
 * writer has not tried, and always say why. Deterministic given `random`.
 */
import type { WriterProfile, WritingMode, WritingPrompt } from '../types';
import { MODE_CATEGORIES } from './registry';
import { weakTargetsOf } from './guidance';

export interface Selection {
  prompt: WritingPrompt;
  /** One sentence the learner can read: why this prompt. */
  reason: string;
  basis: 'weak-construction' | 'unseen' | 'revisit';
}

export function selectPrompt(
  prompts: readonly WritingPrompt[],
  profile: WriterProfile,
  mode: WritingMode,
  opts: { avoid?: readonly string[]; random: () => number },
): Selection | undefined {
  const cats = MODE_CATEGORIES[mode];
  const candidates = prompts.filter((p) => (p.languageIds.includes('*') || p.languageIds.includes(profile.languageId)) && cats.includes(p.category));
  if (!candidates.length) return undefined;
  const avoid = new Set(opts.avoid ?? []);
  const unseen = candidates.filter((p) => !avoid.has(p.promptId));
  const pool = unseen.length ? unseen : candidates;
  const pick = (list: WritingPrompt[]): WritingPrompt => {
    const near = list.filter((p) => p.difficulty === profile.band.level);
    const from = near.length ? near : list;
    return from[Math.min(from.length - 1, Math.floor(opts.random() * from.length))];
  };

  const withWeak = pool.filter((p) => weakTargetsOf(p, profile).length > 0);
  if (withWeak.length) {
    const prompt = pick(withWeak);
    const targets = weakTargetsOf(prompt, profile);
    return {
      prompt, basis: unseen.length ? 'weak-construction' : 'revisit',
      reason: `Chosen because it gives you a place to use ${targets.join(' and ')}, which has been harder for you in your own record.${unseen.length ? '' : ' You have already seen every prompt available, so this is one to revisit.'}`,
    };
  }
  const prompt = pick(pool);
  if (!unseen.length) return { prompt, basis: 'revisit', reason: 'You have already seen every prompt available for this mode, so this is one to revisit with fresh words.' };
  return {
    prompt, basis: 'unseen',
    reason: avoid.size
      ? 'Chosen because you have not tried it yet; nothing in your record points to a particular grammar focus right now.'
      : 'Chosen from the prompts for this mode; nothing in your record points to a particular grammar focus right now.',
  };
}
