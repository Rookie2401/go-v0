import type { ExerciseFamily } from '../types';

/** Provisional, versioned heuristics; the session time budget remains an independent hard limit. */
export const MICRODECK_POLICY = Object.freeze({ defaultTarget: 10, minTarget: 4, maxTarget: 20,
  slowRatio: 1.4, fastRatio: 0.65, minSlowSamples: 6, minFastSamples: 10, minModalities: 2,
  lowIndependentAccuracy: 0.62, overloadFailureRate: 0.3 });

export interface MicrodeckObservation { family: ExerciseFamily; observedSeconds?: number; expectedSeconds?: number; correct?: boolean; repeatedFailure?: boolean }
export interface MicrodeckPolicyOptions {
  adaptive?: boolean;
  defaultTarget?: number;
  minTarget?: number;
  maxTarget?: number;
  slowRatio?: number;
  fastRatio?: number;
  minSlowSamples?: number;
  minFastSamples?: number;
  minModalities?: number;
  lowIndependentAccuracy?: number;
  overloadFailureRate?: number;
}
export interface MicrodeckInput { configuredMaximum?: number; observations?: readonly MicrodeckObservation[]; cognitiveCost?: number; policy?: MicrodeckPolicyOptions }
export interface MicrodeckDecision { targetQuestions: number; reasons: string[] }

function policyWithOverrides(overrides: MicrodeckPolicyOptions = {}) {
  const bounded = (value: number | undefined, fallback: number, min: number, max: number): number =>
    Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback;
  const maxTarget = Math.floor(bounded(overrides.maxTarget, MICRODECK_POLICY.maxTarget, 1, MICRODECK_POLICY.maxTarget));
  return { ...MICRODECK_POLICY,
    adaptive: overrides.adaptive !== false,
    defaultTarget: Math.floor(bounded(overrides.defaultTarget, MICRODECK_POLICY.defaultTarget, 1, maxTarget)),
    minTarget: Math.floor(bounded(overrides.minTarget, MICRODECK_POLICY.minTarget, 1, maxTarget)), maxTarget,
    slowRatio: bounded(overrides.slowRatio, MICRODECK_POLICY.slowRatio, 1, 10),
    fastRatio: bounded(overrides.fastRatio, MICRODECK_POLICY.fastRatio, 0, 1),
    minSlowSamples: Math.floor(bounded(overrides.minSlowSamples, MICRODECK_POLICY.minSlowSamples, 1, 100)),
    minFastSamples: Math.floor(bounded(overrides.minFastSamples, MICRODECK_POLICY.minFastSamples, 1, 100)),
    minModalities: Math.floor(bounded(overrides.minModalities, MICRODECK_POLICY.minModalities, 1, 4)),
    lowIndependentAccuracy: bounded(overrides.lowIndependentAccuracy, MICRODECK_POLICY.lowIndependentAccuracy, 0, 1),
    overloadFailureRate: bounded(overrides.overloadFailureRate, MICRODECK_POLICY.overloadFailureRate, 0, 1),
  };
}

export function microdeckMaximum(configuredMaximum?: number): number {
  if (configuredMaximum === undefined) return MICRODECK_POLICY.defaultTarget;
  return Number.isFinite(configuredMaximum) ? Math.max(0, Math.min(60, Math.floor(configuredMaximum))) : MICRODECK_POLICY.defaultTarget;
}

export function modalityOf(family: ExerciseFamily): 'listening' | 'production' | 'grammar' | 'recognition' {
  if (family === 'audio-to-meaning' || family === 'audio-transcription') return 'listening';
  if (family === 'meaning-to-form' || family === 'sentence-completion') return 'production';
  if (family === 'morphological-identification' || family === 'grammar-application') return 'grammar';
  return 'recognition';
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

export function chooseMicrodeckTarget(input: MicrodeckInput = {}): MicrodeckDecision {
  const p = policyWithOverrides(input.policy);
  const configuredMaximum = microdeckMaximum(input.configuredMaximum);
  const maximum = Math.min(p.maxTarget, configuredMaximum);
  let targetQuestions = Math.min(p.defaultTarget, maximum);
  const reasons = [`${p.adaptive ? 'Adaptive' : 'Fixed'} policy starts at ${p.defaultTarget}; user limit ${configuredMaximum} caps this initial batch.`];
  if (!p.adaptive) return { targetQuestions: targetQuestions, reasons };
  const observations = (input.observations ?? []).filter(o => typeof o.family === 'string');
  const latencyObservations = observations.filter(o => Number.isFinite(o.observedSeconds) && o.observedSeconds! > 0
    && Number.isFinite(o.expectedSeconds) && o.expectedSeconds! > 0);
  const modalities = new Set(latencyObservations.map(o => modalityOf(o.family)));
  const latencyRatios = latencyObservations.map(o => o.observedSeconds! / o.expectedSeconds!);
  const latency = median(latencyRatios);
  const accuracyRows = observations.filter((o): o is MicrodeckObservation & { correct: boolean } => typeof o.correct === 'boolean');
  const accuracy = accuracyRows.length ? accuracyRows.filter(o => o.correct).length / accuracyRows.length : undefined;
  const repeatedFailures = observations.filter(o => o.repeatedFailure).length;
  const repeatedFailureRate = observations.length ? repeatedFailures / observations.length : 0;
  const complex = Number.isFinite(input.cognitiveCost) && input.cognitiveCost! >= 0.7;

  // Only sustained, cross-modality latency or a combination of independently poor outcomes and
  // persistent failures can shrink the target. Current-item difficulty alone never does.
  const enoughForOverload = latencyObservations.length >= p.minSlowSamples && modalities.size >= p.minModalities;
  let overloaded = false;
  if (enoughForOverload && latency >= p.slowRatio
    && ((accuracy !== undefined && accuracy < p.lowIndependentAccuracy) || repeatedFailureRate >= p.overloadFailureRate)) {
    targetQuestions -= 2;
    overloaded = true;
    reasons.push(`Reduced by 2 for sustained slow responses plus independent accuracy or repeated-failure strain (${latency.toFixed(2)}× estimated time).`);
  } else if (enoughForOverload && repeatedFailureRate >= p.overloadFailureRate && complex) {
    targetQuestions -= 2;
    overloaded = true;
    reasons.push('Reduced by 2 for repeated failures combined with high candidate cognitive cost.');
  }

  // Speed can modestly increase a batch only across several modalities and a healthy sample;
  // recognition accuracy alone is deliberately not an expansion signal.
  if (!overloaded && latencyObservations.length >= p.minFastSamples && modalities.size >= p.minModalities && latency <= p.fastRatio
    && (accuracy === undefined || accuracy >= p.lowIndependentAccuracy)) {
    targetQuestions += 2;
    reasons.push(`Increased by 2 for sustained fast responses across ${modalities.size} modalities (${latency.toFixed(2)}× estimated time).`);
  }
  targetQuestions = maximum === 0 ? 0 : Math.max(Math.min(p.minTarget, maximum), Math.min(maximum, targetQuestions));
  if (targetQuestions > 0 && targetQuestions === Math.min(p.minTarget, maximum)) reasons.push(`Adaptive target is bounded below at ${Math.min(p.minTarget, maximum)}; fewer questions may still be offered when fewer are eligible.`);
  return { targetQuestions, reasons };
}
