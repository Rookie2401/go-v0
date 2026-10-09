/**
 * morphological-identification: a form in its pack sentence; the learner names ONE feature of it (case, number,
 * definiteness …) from the pack's values for that feature, or types its lemma.
 *
 * Requires: a form unit whose analysis is high-confidence or verified, and a pack sentence in which the adapter reads the
 * form exactly as the unit says (same lemma, same features). Features that are a union ("Nom,Acc") are never asked: an
 * ambiguous reading has no right answer.
 *
 * Refusal: a provisional, conflicted or invalidated form is `unavailable` ("provisional analysis; no authoritative grammar
 * question"). THE ONE EXCEPTION: a `provisional` form whose unit is RULE-derived (provenance source `rule`) and whose lemma
 * is an entry of the pack's word list may be asked for its LEMMA only. The form's features are a rule's guess and are
 * never asked or stated; the lemma is vouched for by the word list. Such an exercise carries the caveat and the tag
 * `exception:provisional-rule-lemma-only`, and its evidence is a recognition card, not a grammar assessment.
 */
import { reviewFacts } from '../facts/review-facts';
import { normalizeAnswer } from '../grading/normalize';
import { unitIds } from '../../../repository-contract/src';
import { defineBuilder } from './builders';
import {
  assemble, codesOf, contextOf, eligibilityOf, exerciseIdOf, occurrences, precheck, PROVISIONAL_EXCEPTION, quote, referenceGloss, refuse, rnd, shuffle, trusted,
} from './shared';
import type { Occurrence, Planned } from './shared';
import type { BuildContext, ReviewTarget, UnitFacts } from '../types';

const MAX_OPTIONS = 6;

function plan(target: ReviewTarget, facts: UnitFacts, ctx: BuildContext): Planned {
  const f = reviewFacts(facts);
  const why = precheck({ family: 'morphological-identification', dimension: 'morphological-analysis' }, target, facts, ['form']);
  if (why) return refuse(why);

  const el = eligibilityOf('morphological-identification', facts);
  let eligibility = el;
  let lemmaOnly = false;
  if (!el.eligible) {
    const ruleDerived = f.source === 'rule' || facts.unit.provenance.source === 'rule';
    if (el.status === 'provisional' && ruleDerived && facts.lemma && f.lemmaInWordList === true) {
      lemmaOnly = true;
      eligibility = {
        eligible: true, status: 'provisional',
        caveats: ['provisional, rule-derived form: only its lemma is asked, because the lemma is in the word list; its features come from a rule and are not asked'],
      };
    } else {
      return refuse(el.reason);
    }
  }

  const random = rnd(ctx);
  const lemma = facts.lemma;
  const featureKey = unitIds.featureKey(facts.features ?? {});
  const formNorm = facts.unit.unitId.replace(/^form:[^:]+:/u, '');
  const sameForm = (o: Occurrence): boolean => o.reading.surface.normalize('NFC').toLowerCase() === formNorm && (!lemma || o.reading.lemma === lemma);
  const all = occurrences(facts).filter(sameForm);
  const fullOcc = all.find((o) => trusted(o.reading.status) && unitIds.featureKey(o.reading.features) === featureKey);
  const lemmaOcc = all.find((o) => o.reading.status !== 'conflicted' && o.reading.status !== 'invalidated');

  // which features could be asked
  const defs = f.featureDefs ?? {};
  const askable = lemmaOnly ? [] : Object.entries(facts.features ?? {}).filter(([k, v]) => {
    const codes = codesOf(v);
    const def = defs[k];
    return codes.length === 1 && !!def && Object.keys(def.values).length >= 2 && codes[0] in def.values;
  }).map(([k]) => k);
  const featureOk = !lemmaOnly && !!fullOcc && askable.length > 0;
  const lemmaOk = !!lemma && !!lemmaOcc && normalizeAnswer(lemma, 'loose') !== normalizeAnswer(facts.unit.label, 'loose');

  if (!featureOk && !lemmaOk) {
    if (!all.length) return refuse('no pack sentence holds this form, so there is nothing to show it in');
    if (!lemmaOnly && !fullOcc) return refuse('the pack sentences do not read this form the way the unit says (different features or status), so no authoritative question can be set');
    if (!lemmaOnly && askable.length === 0 && !lemmaOk) return refuse('every feature of this form is ambiguous (a union of values) or has no pack vocabulary, and the form is its own lemma');
    return refuse('the form is its own lemma, so a lemma question would give the answer away');
  }

  const useFeature = featureOk && (!lemmaOk || random() < 0.7);
  const gloss = referenceGloss(facts);

  if (useFeature) {
    const occ = fullOcc as Occurrence;
    const key = askable[Math.min(askable.length - 1, Math.floor(random() * askable.length))];
    const def = defs[key];
    const code = codesOf((facts.features ?? {})[key])[0];
    const correct = def.values[code];
    const others = Object.entries(def.values).filter(([c]) => c !== code).map(([, name]) => name);
    const options = shuffle([correct, ...shuffle(others, random).slice(0, MAX_OPTIONS - 1)], random);
    const surface = occ.example.surface as string;
    const explain = f.featureExplanations[`${key}=${(facts.features ?? {})[key]}`] ?? `${def.label}: ${correct}.${def.explain ? ` ${def.explain}` : ''}`;
    return {
      ok: true,
      exercise: assemble({
        exerciseId: exerciseIdOf('morphological-identification', facts.unit.unitId, 'feature', key, String(occ.index)),
        family: 'morphological-identification',
        target: { ...target },
        prompt: { instruction: `In this sentence, which ${def.label.toLowerCase()} is the word ${quote(surface)} in?`, stimulusText: occ.example.text, options },
        answerKey: {
          accepted: [correct], normalization: 'exact', features: { [key]: code },
          explanation: `In this sentence ${quote(surface)}${lemma ? `, a form of ${quote(lemma)}${gloss ? ` (${gloss})` : ''},` : ''} has ${def.label.toLowerCase()}: ${correct}. ${explain}`,
          ...(facts.constructionExplanation ? { deeper: facts.constructionExplanation } : f.morphDescription ? { deeper: `As a whole: ${f.morphDescription}.` } : {}),
        },
        hiddenBeforeAnswer: [],
        responseMode: 'choice',
        eligibility,
        builtFrom: { facts: [`unit:${facts.unit.unitId}`, `feature:${key}=${code}`, ...(facts.constructionIds[0] ? [`construction:${facts.constructionIds[0]}`] : [])], sentenceSource: occ.example.source },
        variant: 'feature',
        context: contextOf(occ),
        ...(facts.constructionIds[0] ? { constructionId: facts.constructionIds[0] } : {}),
        askedFeature: key,
      }),
    };
  }

  const occ = (lemmaOnly ? lemmaOcc : fullOcc ?? lemmaOcc) as Occurrence;
  const surface = occ.example.surface as string;
  const asFull = !lemmaOnly && trusted(occ.reading.status);
  return {
    ok: true,
    exercise: assemble({
      exerciseId: exerciseIdOf('morphological-identification', facts.unit.unitId, 'lemma', String(occ.index)),
      family: 'morphological-identification',
      target: { ...target },
      prompt: { instruction: `Type the dictionary form (lemma) of the word ${quote(surface)} in this sentence.`, stimulusText: occ.example.text },
      answerKey: {
        accepted: [lemma as string], normalization: 'loose', articles: ['i', 'e', 'të', 'së'],
        explanation: `The dictionary form of ${quote(surface)} is ${quote(lemma as string)}${gloss ? ` (${gloss})` : ''}.${asFull && f.morphDescription ? ` ${quote(surface)} is the ${f.morphDescription}.` : ''}`,
        ...(asFull && facts.constructionExplanation ? { deeper: facts.constructionExplanation } : {}),
      },
      hiddenBeforeAnswer: [],
      responseMode: 'typed',
      eligibility,
      builtFrom: { facts: [`unit:${facts.unit.unitId}`, `lemma:${lemma}`, ...(lemmaOnly ? [PROVISIONAL_EXCEPTION] : [])], sentenceSource: occ.example.source },
      variant: 'lemma',
      context: contextOf(occ),
      ...(asFull && facts.constructionIds[0] ? { constructionId: facts.constructionIds[0] } : {}),
    }),
  };
}

export const morphologicalIdentification = defineBuilder('morphological-identification', plan);
