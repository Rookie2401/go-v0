/**
 * LISTENING ASSESSMENT — the GoReview side of GoListen's assessment interface. Two rules, both from GoListen's
 * evidence-direction rule (packages/golisten/src/contracts.ts), restated here as behaviour:
 *   - audio generated from the text (synthetic speech, device or remote) is PRACTICE: the exercise runs, the result is kept,
 *     but `eligibleForEvidence` is false and the listening event carries evidence quality 'none';
 *   - a listening result requires that the written answer was not shown first. If `transcriptShownBefore` the item is not a
 *     listening item any more; the runner records it as written recognition (see session/runner.ts).
 * The intended expression travels in the metadata so the result can be checked afterwards; it is NEVER shown before the
 * response (the UI must show `publicView(prepared)`, which omits it).
 */
import type { AssessmentSource, AudioStimulus, ScoringMetadata, VoiceDescriptor } from '../../../golisten/src/contracts';
import type { Grading, Response, ReviewResult, ReviewTarget, UnitFacts } from '../types';

export interface ListeningDeps {
  audio: AssessmentSource;
  /** GoListen's `languageAvailability` for a language (or any function with that shape); omitted = ask the source only. */
  registryAvailability?: (languageId: string) => Promise<{ canPronounce: boolean; gaps?: string[] }>;
}

export interface ListeningMetadata {
  languageId: string;
  varietyId?: string;
  /** The text the voice speaks. Not shown before the response. */
  intendedExpression: string;
  source: 'recorded' | 'device' | 'remote';
  voiceId: string;
  synthetic: boolean;
  /** True only for a voice whose quality a native reviewer has verified. */
  pronunciationValidated: boolean;
  licence: string;
  replaysAllowed: number;
}

export interface ListeningPrepared { stimulus: AudioStimulus; metadata: ListeningMetadata }
export interface ListeningUnavailable { unavailable: true; reason: string }

export function expressionOf(facts: UnitFacts): string {
  return (facts.phrase?.display ?? facts.unit.label ?? '').trim();
}

export async function prepareListening(deps: ListeningDeps, target: ReviewTarget, facts: UnitFacts, opts: { replaysAllowed?: number } = {}): Promise<ListeningPrepared | ListeningUnavailable> {
  const expression = expressionOf(facts);
  if (!expression) return { unavailable: true, reason: 'the unit has no written form to say' };
  if (deps.registryAvailability) {
    try {
      const a = await deps.registryAvailability(target.languageId);
      if (!a.canPronounce) return { unavailable: true, reason: `no voice can speak ${target.languageId} right now${a.gaps?.length ? ` (${a.gaps[0]})` : ''}` };
    } catch (e) {
      return { unavailable: true, reason: `voice availability could not be read (${e instanceof Error ? e.message : String(e)})` };
    }
  }
  let res: Awaited<ReturnType<AssessmentSource['prepareStimulus']>>;
  try {
    res = await deps.audio.prepareStimulus({
      languageId: target.languageId, ...(target.varietyId !== undefined ? { varietyId: target.varietyId } : {}),
      kind: /\s/u.test(expression) ? 'sentence' : 'word', text: expression, itemIds: [target.unitId],
      ...(opts.replaysAllowed !== undefined ? { replaysAllowed: opts.replaysAllowed } : {}),
    });
  } catch (e) {
    return { unavailable: true, reason: `the stimulus could not be prepared (${e instanceof Error ? e.message : String(e)})` };
  }
  if ('unavailable' in res) return { unavailable: true, reason: res.reason };
  const v = res.voice;
  return {
    stimulus: res,
    metadata: {
      languageId: res.languageId, ...(v.varietyId !== undefined ? { varietyId: v.varietyId } : target.varietyId !== undefined ? { varietyId: target.varietyId } : {}),
      intendedExpression: expression, source: res.audio.kind, voiceId: v.voiceId, synthetic: v.synthetic,
      pronunciationValidated: v.qualityVerification === 'native-reviewed', licence: v.licence, replaysAllowed: res.replaysAllowed,
    },
  };
}

/** What the UI may hold before the response: the metadata without the intended expression. */
export function publicView(p: ListeningPrepared): { stimulus: AudioStimulus; metadata: Omit<ListeningMetadata, 'intendedExpression'> } {
  const { intendedExpression: _hidden, ...rest } = p.metadata;
  void _hidden;
  return { stimulus: p.stimulus, metadata: rest };
}

/** Whether a voice's output may be held against the learner at all; unreliable voices produce practice, never evidence. */
export function withholdIfUnreliable(voice: VoiceDescriptor): { withhold: true; reason: string } | { withhold: false } {
  if (voice.synthetic) return { withhold: true, reason: 'synthetic speech is generated from the text: practice only' };
  if (voice.qualityVerification === 'unverified') return { withhold: true, reason: 'the recording has not been verified' };
  if (!voice.suitableForAssessment) return { withhold: true, reason: 'the recording is not marked suitable for assessment' };
  return { withhold: false };
}

/** The metadata block of the listening result (design §10). */
export interface ListeningScore {
  /** Hearings of the stimulus: 0 when it never played, else 1 + replays. */
  playbackCount: number;
  replays: number;
  hintsShown: string[];
  answer?: string;
  /** null when the answer could not be judged (partial, ambiguous, invalid, unable to grade). */
  correct: boolean | null;
  scoringConfidence: number;
  assistance: string[];
  voice: 'synthetic' | 'recorded';
  hinted: boolean;
  eligibleForEvidence: boolean;
  /** Why it is not eligible; empty when it is. */
  ineligibleBecause: string[];
}

const HINTS = new Set(['hint', 'gloss', 'translation', 'transliteration', 'example', 'morphology', 'grammar']);

export function scoreListening(
  stimulus: AudioStimulus, replays: number, transcriptShownBefore: boolean, response: Response, grading: Grading,
  sourceMeta?: ScoringMetadata,
): ListeningScore {
  const played = response.audioPlayed !== false && !response.audioFailed;
  const rep = Math.max(0, Math.floor(replays));
  const hintsShown = response.assistance.filter((a) => HINTS.has(a));
  const hinted = response.hinted || hintsShown.length > 0 || rep > stimulus.replaysAllowed;
  const why: string[] = [];
  if (!stimulus.validity.eligibleForEvidence) why.push(stimulus.validity.reason);
  if (stimulus.voice.synthetic) why.push('synthetic voice: practice only');
  if (stimulus.voice.qualityVerification === 'unverified') why.push('the voice is unverified');
  if (transcriptShownBefore) why.push('the written form was shown before the response');
  if (!played) why.push('the audio did not play');
  if (sourceMeta && !sourceMeta.eligibleForEvidence) why.push('GoListen reports the stimulus as not eligible for evidence');
  const eligible = why.length === 0;
  const correct = grading.outcome === 'correct' ? true : grading.outcome === 'incorrect' ? false : null;
  return {
    playbackCount: played ? 1 + rep : 0, replays: rep, hintsShown, ...((response.typed ?? response.choice) !== undefined ? { answer: response.typed ?? response.choice } : {}),
    correct, scoringConfidence: grading.confidence, assistance: [...response.assistance],
    voice: stimulus.voice.synthetic ? 'synthetic' : 'recorded', hinted, eligibleForEvidence: eligible, ineligibleBecause: [...new Set(why)],
  };
}

/** The `scoring` field of a ReviewResult, from the stimulus and its score. */
export function resultScoring(stimulus: AudioStimulus, score: ListeningScore): NonNullable<ReviewResult['scoring']> {
  return {
    voice: score.voice, hinted: score.hinted, replays: score.replays, eligibleForEvidence: score.eligibleForEvidence,
    stimulusId: stimulus.stimulusId, voiceId: stimulus.voice.voiceId, synthetic: stimulus.voice.synthetic,
    pronunciationValidated: stimulus.voice.qualityVerification === 'native-reviewed', licence: stimulus.voice.licence,
  };
}
