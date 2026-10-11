/**
 * written-recognition: the learner sees a written word (a lemma, or an inflected form) and gives its meaning.
 *
 * Requires: a lexeme or form unit that is not conflicted or invalidated (provisional is allowed, with a caveat), and a gloss
 * from the word list or a short dictionary sense. Without a gloss there is nothing to check an answer against, so it refuses.
 * Response: typed or self-graded, the glosses (and their parts) being the accepted answers; or a four-way choice when the
 * build context carries a pool of other units whose glosses can serve as distractors (three that share no word with the answer).
 */
import { reviewFacts } from '../facts/review-facts';
import { normalizeAnswer } from '../grading/normalize';
import { defineBuilder } from './builders';
import {
  acceptedMeanings, assemble, attributionLine, contextOf, eligibilityOf, exerciseIdOf, glossSplit, occurrences, precheck, quote, referenceGloss, refuse, rnd, shuffle,
} from './shared';
import type { Planned } from './shared';
import type { BuildContext, UnitFacts } from '../types';

const wordsOf = (s: string): string[] => normalizeAnswer(s, 'loose').split(' ').filter((w) => w.length > 2);

/** Glosses of other units that cannot be mistaken for the target's meaning: no shared word with any accepted gloss. */
export function glossDistractors(pool: UnitFacts[] | undefined, facts: UnitFacts, accepted: string[], random: () => number, n: number): string[] {
  if (!pool?.length) return [];
  const taken = new Set(accepted.flatMap(wordsOf));
  const seen = new Set<string>();
  const options: Array<{ g: string; samePos: boolean }> = [];
  for (const f of shuffle(pool, random)) {
    if (f.unit.unitId === facts.unit.unitId || !['lexeme', 'form'].includes(f.unit.kind)) continue;
    if (facts.lemma !== undefined && f.lemma === facts.lemma) continue;
    const g = referenceGloss(f);
    if (!g) continue;
    const ws = wordsOf(g);
    if (!ws.length || ws.some((w) => taken.has(w))) continue;
    const key = normalizeAnswer(g, 'loose');
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ g, samePos: !!facts.pos && f.pos === facts.pos });
  }
  options.sort((a, b) => Number(b.samePos) - Number(a.samePos));
  return options.slice(0, n).map((o) => o.g);
}

function plan(target: Parameters<typeof precheck>[1], facts: UnitFacts, ctx: BuildContext): Planned {
  const f = reviewFacts(facts);
  const why = precheck({ family: 'written-recognition', dimension: 'written-recognition' }, target, facts, ['lexeme', 'form']);
  if (why) return refuse(why);
  const eligibility = eligibilityOf('written-recognition', facts);
  if (!eligibility.eligible) return refuse(eligibility.reason);

  const isForm = facts.unit.kind === 'form';
  const shown = isForm ? facts.unit.label : facts.lemma ?? facts.unit.label;
  const occurrence = occurrences(facts)[0];
  const context = occurrence ? contextOf(occurrence) : undefined;
  const contextualTarget = context?.surface ?? shown;
  const reference = referenceGloss(facts);
  const accepted = acceptedMeanings(facts);
  if (!reference || accepted.length === 0) return refuse('no gloss in the word list or the dictionary, so there is nothing to check a meaning against');

  const random = rnd(ctx);
  const distractors = glossDistractors(ctx.pool, facts, accepted, random, 3);
  const choice = distractors.length >= 3;

  const descr = isForm && f.morphDescription && facts.lemma ? ` It is the ${f.morphDescription} of ${quote(facts.lemma)}.` : '';
  const caveat = facts.status === 'provisional' ? ' (This reading comes from the pack’s word-form rules and has not been reviewed.)' : '';
  const explanation = `${quote(shown)} means ${quote(reference)}.${descr}${attributionLine(facts, [reference])}${caveat}`;

  const alternatives = (f.alternativeReadings ?? []).flatMap((r) => r.glosses.map((g) => ({ answer: g, sense: `${r.lemma}${r.pos ? ` (${r.pos})` : ''}` })))
    .filter((a) => !accepted.some((x) => normalizeAnswer(x, 'loose') === normalizeAnswer(a.answer, 'loose')));

  const variant = choice ? 'choice' : 'typed';
  const tags = [`unit:${facts.unit.unitId}`, glossSplit(facts).lexicon.length ? 'gloss:word-list' : 'gloss:dictionary', ...(attributionLine(facts, [reference]) ? ['gloss:dictionary'] : [])];
  return {
    ok: true,
    exercise: assemble({
      exerciseId: exerciseIdOf('written-recognition', facts.unit.unitId, variant, reference),
      family: 'written-recognition',
      target: { ...target },
      prompt: {
      instruction: context
        ? `What does ${quote(contextualTarget)} mean in this sentence?`
        : `What does ${quote(shown)} mean?`,
      stimulusText: context?.sentence ?? shown,
        ...(choice ? { options: shuffle([reference, ...distractors], random) } : {}),
      },
      answerKey: choice
        ? { accepted: [reference], normalization: 'exact', explanation, ...(facts.constructionExplanation ? { deeper: facts.constructionExplanation } : {}) }
        : {
          accepted, normalization: 'loose', explanation, openEnded: true, articles: ['to', 'a', 'an', 'the'],
          ...(alternatives.length ? { alternatives } : {}),
          ...(facts.constructionExplanation ? { deeper: facts.constructionExplanation } : {}),
        },
      hiddenBeforeAnswer: [],
      responseMode: choice ? 'choice' : 'typed-or-self',
      eligibility,
      builtFrom: { facts: [...new Set(tags)], ...(occurrence ? { sentenceSource: occurrence.example.source } : {}) },
      ...(occurrence ? { context } : {}),
      variant,
    }),
  };
}

export const writtenRecognition = defineBuilder('written-recognition', plan);
