/**
 * grammar-application: a pack sentence with a gap; the learner chooses, among the forms of one lemma, the one that has the
 * grammatical value the question names.
 *
 * Requires: a lexeme, form or morphological-construction unit that is high-confidence or verified; a pack sentence in which
 * the target (or, for a lexeme, one of its forms; for a construction, a form realising it) is read with a high-confidence or
 * verified reading; and at least one OTHER form of the same lemma, shown by the pack's sentences, that differs from the answer
 * in a feature the pack has vocabulary for (so the question can name it). At least two forms in all: otherwise it is
 * unavailable, with that reason. A `conflicted` form is never offered; a provisional form may be a distractor but never the answer.
 *
 * Why the question names the feature: the pack has no parser, so it cannot prove that a different form would be wrong in
 * this sentence. Naming the wanted value ("Definiteness: indefinite") makes the answer unique by definition and still tests
 * whether the learner can pick the form that carries it.
 */
import { reviewFacts } from '../facts/review-facts';
import type { FormInfo } from '../facts/review-facts';
import { defineBuilder } from './builders';
import {
  assemble, codesOf, contextOf, eligibilityOf, exerciseIdOf, matchCase, occurrences, precheck, quote, referenceGloss, refuse, rnd, shuffle, trusted, withGap,
} from './shared';
import type { Planned } from './shared';
import type { BuildContext, ReviewTarget, UnitFacts } from '../types';

const MAX_DISTRACTORS = 3;

function plan(target: ReviewTarget, facts: UnitFacts, ctx: BuildContext): Planned {
  const f = reviewFacts(facts);
  const why = precheck({ family: 'grammar-application', dimension: 'construction-understanding' }, target, facts, ['lexeme', 'form', 'morph-construction']);
  if (why) return refuse(why);
  const eligibility = eligibilityOf('grammar-application', facts);
  if (!eligibility.eligible) return refuse(eligibility.reason);

  const kind = facts.unit.kind;
  const formNorm = facts.unit.unitId.replace(/^form:[^:]+:/u, '');
  const groups = f.formGroups ?? [];
  const defs = f.featureDefs ?? {};
  if (!groups.length) return refuse('the pack’s sentences show no forms of this unit’s lemma');
  if (!occurrences(facts).length) return refuse('no pack sentence holds this unit');

  const random = rnd(ctx);
  let sawTwoForms = false;
  let sawTrusted = false;
  for (const occ of occurrences(facts)) {
    const r = occ.reading;
    if (!trusted(r.status) || !r.lemma) continue;
    if (kind === 'form' && r.surface.normalize('NFC').toLowerCase() !== formNorm) continue;
    if (kind === 'morph-construction' && r.constructionId !== facts.unit.unitId) continue;
    sawTrusted = true;
    const group = groups.find((g) => g.lemma === r.lemma && (!g.pos || !r.pos || g.pos === r.pos));
    if (!group) continue;
    const answerNorm = r.surface.normalize('NFC').toLowerCase();
    const others: FormInfo[] = group.forms.filter((x) => x.surface !== answerNorm);
    if (group.forms.length >= 2) sawTwoForms = true;
    if (!others.length) continue;

    // the feature that tells the answer from the most other forms
    let best: { key: string; code: string; distractors: FormInfo[] } | undefined;
    for (const [key, def] of Object.entries(defs)) {
      const ac = codesOf(r.features[key]);
      if (ac.length !== 1 || !(ac[0] in def.values)) continue;
      const ds = others.filter((o) => {
        const oc = codesOf(o.features[key]);
        return oc.length === 1 && oc[0] !== ac[0] && oc[0] in def.values;
      });
      if (ds.length && (!best || ds.length > best.distractors.length)) best = { key, code: ac[0], distractors: ds };
    }
    if (!best) continue;

    const def = defs[best.key];
    const valueName = def.values[best.code];
    const picked = shuffle(best.distractors, random).slice(0, MAX_DISTRACTORS);
    const answer = occ.example.surface as string;
    const options = shuffle([answer, ...picked.map((d) => matchCase(d.surface, answer))], random);
    const gloss = group.lemma === facts.lemma ? referenceGloss(facts) : undefined;
    const construction = kind === 'morph-construction' ? facts.unit.unitId : r.constructionId ?? '';
    const context = contextOf(occ);
    return {
      ok: true,
      exercise: assemble({
        exerciseId: exerciseIdOf('grammar-application', facts.unit.unitId, best.key, answer, String(occ.index)),
        family: 'grammar-application',
        target: { ...target },
        prompt: {
          instruction: `Choose the form of ${quote(group.lemma)}${gloss ? ` (${gloss})` : ''} that fills the gap and has this ${def.label.toLowerCase()}: ${valueName}.`,
          sentenceWithGap: withGap(context),
          options,
        },
        answerKey: {
          accepted: [answer], normalization: 'exact', features: { [best.key]: best.code },
          explanation: `${quote(answer)} is the form with ${def.label.toLowerCase()}: ${valueName}. ${def.label}: ${valueName}.${def.explain ? ` ${def.explain}` : ''}`,
          ...(facts.constructionExplanation ? { deeper: facts.constructionExplanation } : f.morphDescription && kind === 'form' ? { deeper: `As a whole: ${f.morphDescription}.` } : {}),
        },
        hiddenBeforeAnswer: [],
        responseMode: 'choice',
        eligibility,
        builtFrom: { facts: [`unit:${facts.unit.unitId}`, `lemma:${group.lemma}`, `feature:${best.key}=${best.code}`, ...(construction ? [`construction:${construction}`] : [])], sentenceSource: occ.example.source },
        variant: 'choose-form',
        context,
        ...(construction ? { constructionId: construction } : {}),
        askedFeature: best.key,
      }),
    };
  }

  if (!sawTrusted) return refuse('no pack sentence reads this unit with a high-confidence reading, so no authoritative grammar question can be set');
  if (!sawTwoForms) return refuse('fewer than two forms of the lemma appear in the pack’s sentences, so there is nothing to choose between');
  return refuse('no other form of the lemma differs from the answer in a feature the pack can name');
}

export const grammarApplication = defineBuilder('grammar-application', plan);
