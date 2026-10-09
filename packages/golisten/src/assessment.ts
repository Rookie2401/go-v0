/**
 * The assessment interface GoReview will use for auditory recognition. It is built on the same voices as ordinary
 * pronunciation, and it keeps the evidence-direction rule: a stimulus is `eligibleForEvidence` only when it is a
 * reviewed human recording that exists independently of the text AND the registry marks it suitable for assessment.
 * Every synthetic voice may still be used as listening PRACTICE (the exercise runs) but it yields no evidence:
 * `assessmentEvidence` returns quality 'none', and the payload says `voice: 'synthetic'`.
 *
 * The stimulus never shows the answer. For recorded and remote audio it carries no text at all; a device voice needs the
 * text to speak, so `audio.text` carries it and GoReview must not render it before the response. The stimulus's `voice`
 * descriptor (label, licence, limitations) is metadata about the voice, written by the registry; it may name the source file
 * of a recording, so GoReview shows it only after the response.
 */
import type { EvidenceNote, ListeningAssessmentPayload } from '../../repository-contract/src';
import { isIndependentEvidence } from './contracts';
import type { AssessmentSource, AudioStimulus, PronunciationProvenance, ScoringMetadata, StimulusRequest, VoiceDescriptor } from './contracts';
import type { GoListenEnv } from './environment';
import { failedPlayback } from './playback';
import { openPlayback, resolveFirst } from './resolve';
import type { VoiceRegistry } from './registry';

export const DEFAULT_REPLAYS_ALLOWED = 2;

export function evidenceValidity(voice: VoiceDescriptor, provenance: PronunciationProvenance): AudioStimulus['validity'] {
  if (voice.synthetic || provenance.generatedFromText) {
    return { eligibleForEvidence: false, reason: 'Synthetic speech is generated from the text: practice only, never listening evidence.' };
  }
  if (!isIndependentEvidence(provenance)) {
    return { eligibleForEvidence: false, reason: `The recording has not been reviewed by a human (${voice.qualityVerification}); it cannot be listening evidence.` };
  }
  if (!voice.suitableForAssessment) {
    return { eligibleForEvidence: false, reason: 'The recording is reviewed but not marked suitable for assessment.' };
  }
  return { eligibleForEvidence: true, reason: 'A reviewed human recording that exists independently of the text.' };
}

const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};

export function createAssessmentSource(deps: { registries: Map<string, VoiceRegistry>; env: GoListenEnv }): AssessmentSource {
  const { registries, env } = deps;
  let counter = 0;
  const provenanceByStimulus = new Map<string, PronunciationProvenance>();

  return {
    async prepareStimulus(req: StimulusRequest) {
      try {
        const text = typeof req.text === 'string' ? req.text.trim() : '';
        if (!text || (req.kind !== 'word' && req.kind !== 'sentence')) return { unavailable: true as const, reason: 'There is nothing to say, or the stimulus kind is not a word or a sentence.' };
        const reg = registries.get(req.languageId);
        // Assessment looks for a real recording first, then synthetic practice voices.
        const out = await resolveFirst(['recorded', 'device', 'remote'], { languageId: req.languageId, varietyId: req.varietyId, text, kind: req.kind }, reg, env);
        if (!out.ok) return { unavailable: true as const, reason: out.message };
        const p = out.prepared;
        counter += 1;
        const stimulusId = `stim:${req.languageId}:${counter}:${fnv(`${p.voice.voiceId}|${text}|${req.itemIds.join(',')}`)}`;
        provenanceByStimulus.set(stimulusId, p.provenance);
        const stimulus: AudioStimulus = {
          stimulusId, languageId: req.languageId, kind: req.kind, itemIds: [...req.itemIds], voice: p.voice,
          audio: p.audio.kind === 'device' ? { kind: 'device', text: p.audio.text } : p.audio,
          answerHidden: true,
          replaysAllowed: Math.max(0, Math.floor(req.replaysAllowed ?? DEFAULT_REPLAYS_ALLOWED)),
          validity: evidenceValidity(p.voice, p.provenance),
        };
        return stimulus;
      } catch {
        return { unavailable: true as const, reason: 'The listening stimulus could not be prepared.' };
      }
    },

    playbackOf(stimulus) {
      const reg = registries.get(stimulus.languageId);
      if (!reg) return failedPlayback(env.now);
      return openPlayback({ voice: stimulus.voice, audio: stimulus.audio }, reg, env);
    },

    scoringMetadata(stimulus, replaysUsed): ScoringMetadata {
      const replays = Math.max(0, Math.floor(replaysUsed));
      // Eligibility is a property of how the stimulus was made; the stored provenance can only confirm it, never raise it.
      const prov = provenanceByStimulus.get(stimulus.stimulusId);
      const eligible = stimulus.validity.eligibleForEvidence && !stimulus.voice.synthetic && (!prov || isIndependentEvidence(prov));
      return { voice: stimulus.voice.synthetic ? 'synthetic' : 'recorded', hinted: replays > stimulus.replaysAllowed, replays, eligibleForEvidence: eligible };
    },
  };
}

/** The `evidence` note for a ListeningAssessed event: 'none' unless the stimulus was eligible. */
export function assessmentEvidence(meta: ScoringMetadata): EvidenceNote {
  if (!meta.eligibleForEvidence || meta.voice === 'synthetic') return { quality: 'none', assisted: meta.hinted };
  return { quality: meta.hinted ? 'weak' : 'moderate', assisted: meta.hinted };
}

/** Maps the learner's outcome and the scoring metadata onto the Repository's ListeningAssessmentPayload. */
export function listeningAssessedPayload(
  stimulus: Pick<AudioStimulus, 'kind'>,
  meta: ScoringMetadata,
  outcome: { correct: boolean; responseMode: ListeningAssessmentPayload['responseMode']; latencyMs?: number; difficulty?: number },
): ListeningAssessmentPayload {
  return {
    stimulus: stimulus.kind, voice: meta.voice, answerShownBefore: false, correct: outcome.correct, responseMode: outcome.responseMode,
    hinted: meta.hinted, ...(outcome.latencyMs !== undefined ? { latencyMs: outcome.latencyMs } : {}), ...(outcome.difficulty !== undefined ? { difficulty: outcome.difficulty } : {}),
  };
}

