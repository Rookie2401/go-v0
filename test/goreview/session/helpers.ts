/** Fakes for the sibling modules the session runner talks to: an exercise-builder registry, a facts provider, a grading port, GoListen's assessment source, the device queue. */
import type { GoEvent } from '../../../packages/repository-contract/src';
import { validateEvent } from '../../../packages/repository-contract/src';
import type { AssessmentSource, AudioStimulus, PlaybackHandle, VoiceDescriptor } from '../../../packages/golisten/src/contracts';
import { createLocalQueue } from '../../../packages/repository-sync/src/queue';
import { createMemoryArea } from '../../../packages/repository-sync/src/area';
import { ratingFor } from '../../../packages/goreview/src/grading';
import type { EvidenceInput, GradingPort } from '../../../packages/goreview/src/session/runner';
import { FAMILY_DIMENSION } from '../../../packages/goreview/src/types';
import type { Exercise, ExerciseBuilder, ExerciseFamily, FactsProvider, Response, ReviewTarget, SessionPlan } from '../../../packages/goreview/src/types';
import { planSession } from '../../../packages/goreview/src/planner/planner';
import { dueItem, facts, fakeScheduler, NOW, prefs, testNow } from '../intake/fixtures';

export const IDENTITY = { learnerId: 'L1', enrolmentId: 'E1', deviceId: 'D1' };

export function clock(start = Date.parse(NOW)): () => string {
  let t = start;
  return () => { t += 1000; return new Date(t).toISOString(); };
}

export const response = (over: Partial<Response> = {}): Response => ({ hinted: false, assistance: [], ...over });
export const right = (over: Partial<Response> = {}): Response => response({ typed: 'the book', choice: 'the book', ...over });
export const wrong = (over: Partial<Response> = {}): Response => response({ typed: 'a table', choice: 'a table', ...over });

export const voice = (over: Partial<VoiceDescriptor> = {}): VoiceDescriptor => ({
  voiceId: 'recording:test', languageId: 'sq', provider: 'recorded', execution: 'local', synthetic: false, licence: 'PD', qualityVerification: 'native-reviewed',
  knownLimitations: [], supports: ['word'], suitableForAssessment: true, label: 'test recording', ...over,
});
export const syntheticVoice = voice({ voiceId: 'device:sq', provider: 'device', synthetic: true, qualityVerification: 'unverified', suitableForAssessment: false });

export function stimulus(unitId: string, v: VoiceDescriptor = voice()): AudioStimulus {
  const eligible = !v.synthetic && v.suitableForAssessment && v.qualityVerification !== 'unverified';
  return {
    stimulusId: `stim:${unitId}`, languageId: 'sq', kind: 'word', itemIds: [unitId], voice: v, audio: { kind: 'recorded', url: '/x.ogg' }, answerHidden: true,
    replaysAllowed: 2, validity: { eligibleForEvidence: eligible, reason: eligible ? 'reviewed recording' : 'synthetic' },
  };
}

export function fakeAudioSource(v: VoiceDescriptor = voice()): AssessmentSource {
  const handle = { play() {}, pause() {}, stop() {}, replay() {}, setRate() {}, rate: 1, state: 'idle', replays: 0, onEnd: () => () => {}, dispose() {} } as PlaybackHandle;
  return {
    async prepareStimulus(req) { return stimulus(req.itemIds[0], v); },
    playbackOf: () => handle,
    scoringMetadata: (s, replays) => ({ voice: s.voice.synthetic ? 'synthetic' : 'recorded', hinted: replays > s.replaysAllowed, replays, eligibleForEvidence: s.validity.eligibleForEvidence }),
  };
}

export const MISSING = 'form:sq:missing';
export const factsProvider: FactsProvider = { factsFor: async (unitId) => (unitId === MISSING ? undefined : facts(unitId)) };

export interface BuilderLog { builds: string[]; grades: number }

export function fakeBuilders(log: BuilderLog = { builds: [], grades: 0 }, opts: { invalid?: ExerciseFamily[] } = {}): ExerciseBuilder[] {
  const make = (family: ExerciseFamily): ExerciseBuilder => ({
    family, dimension: FAMILY_DIMENSION[family],
    canBuild: () => true,
    async build(target: ReviewTarget, _f, ctx): Promise<Exercise | { unavailable: true; reason: string }> {
      log.builds.push(`${family}:${target.unitId}`);
      const audio = family === 'audio-to-meaning' ? await ctx.audio?.prepareStimulus({ languageId: target.languageId, kind: 'word', text: 'librin', itemIds: [target.unitId] }) : undefined;
      if (audio && 'unavailable' in audio) return { unavailable: true, reason: audio.reason };
      return {
        exerciseId: `ex:${family}:${target.unitId}`, family, target,
        prompt: { instruction: 'What does it mean?', ...(audio ? { audio, stimulusText: 'librin' } : { stimulusText: 'librin' }), options: ['the book', 'a table'] },
        answerKey: { accepted: ['the book'], normalization: 'loose', explanation: 'librin means the book' },
        hiddenBeforeAnswer: audio ? ['stimulusText'] : [], responseMode: 'typed', eligibility: { eligible: true, status: 'verified', caveats: [] },
        builtFrom: { facts: ['gloss'] }, validation: opts.invalid?.includes(family) ? { ok: false, issues: ['ambiguous key'] } : { ok: true, issues: [] },
      };
    },
    grade(ex, resp) {
      log.grades += 1;
      const ok = (resp.typed ?? resp.choice) === ex.answerKey.accepted[0];
      return { outcome: ok ? 'correct' : 'incorrect', confidence: 1, explanation: ex.answerKey.explanation };
    },
  });
  return (['written-recognition', 'audio-to-meaning', 'meaning-to-form'] as ExerciseFamily[]).map(make);
}

/** A grading port that mirrors what GoReview's evidence builder does: CardReviewed for written items, ListeningAssessed for audio-first items. */
export const fakeGrading: GradingPort = {
  ratingFor,
  evidenceFor(i: EvidenceInput): GoEvent | null {
    const base = {
      id: `raw:${Math.random()}`, v: 2, learnerId: i.identity.learnerId, enrolmentId: i.identity.enrolmentId, languageId: i.item.languageId, at: i.at,
      producer: { app: 'gopractice-review' as const, version: '0.1.0', deviceId: i.identity.deviceId }, subject: {},
    };
    const correct = i.grading.outcome === 'correct';
    if (i.listening) {
      return {
        ...base, kind: 'ListeningAssessed',
        payload: { stimulus: 'word', voice: i.listening.voice, answerShownBefore: false, correct, responseMode: 'choice', hinted: i.listening.hinted },
        evidence: i.listening.eligibleForEvidence ? { quality: 'moderate', assisted: i.listening.hinted } : { quality: 'none', assisted: i.listening.hinted },
      };
    }
    return {
      ...base, kind: 'CardReviewed',
      payload: { cardKind: 'recognition', grade: correct ? 'good' : 'again', correct, hinted: i.response.hinted, answerShownBefore: i.response.transcriptShownBefore === true },
      evidence: { quality: 'moderate', assisted: i.response.hinted },
    };
  },
};

/** The device queue as `record`: a duplicate id is fine (already there), an invalid event or a storage failure throws. */
export function queueRecorder() {
  const area = createMemoryArea();
  const queue = createLocalQueue(area, { now: () => Date.parse(NOW) });
  const recorded: GoEvent[][] = [];
  return {
    area, queue, recorded,
    record: async (events: GoEvent[]) => {
      for (const e of events) {
        const r = await queue.enqueue(e);
        if (!r.ok && r.reason === 'invalid') throw new Error(`invalid event: ${JSON.stringify(r.issues)}`);
      }
      recorded.push(events);
    },
  };
}

export function simpleRecorder() {
  const batches: GoEvent[][] = [];
  const order: string[] = [];
  return { batches, order, record: async (events: GoEvent[]) => { order.push('record'); batches.push(events); }, all: () => batches.flat() };
}

/** A plan of `due` written items (u1…) plus optional extra intake items, made by the real planner. */
export function makePlan(opts: { due?: number; newItems?: Array<{ unitId: string; family?: ExerciseFamily }>; dueFamilies?: ExerciseFamily[] } = {}): SessionPlan {
  const n = opts.due ?? 3;
  const deck = Array.from({ length: n }, (_, i) => dueItem(`form:sq:u${i + 1}`, 0.2 + i / 10, opts.dueFamilies?.[i] ?? 'written-recognition'));
  const intake = (opts.newItems ?? []).map((x) => testNow(x.unitId, {}, x.family ?? 'written-recognition'));
  return planSession({ deck, intake, preferences: prefs({ sessionMinutes: 20 }), audio: { available: true, eligibleForEvidence: true, reason: 'ok' }, scheduler: fakeScheduler, now: NOW, random: () => 0.25 });
}

export { validateEvent };
