import type { PronunciationProvenance, PronunciationRequest, PronunciationResult, VoiceDescriptor } from '../contracts';

export type Failure = Extract<PronunciationResult, { ok: false }>;

export type PreparedAudio =
  | { kind: 'recorded'; url: string }
  | { kind: 'device'; text: string }
  | { kind: 'remote'; url: string };

/** A provider's answer before anything is played: which voice, what to play, and where it came from. */
export interface Prepared {
  voice: VoiceDescriptor;
  provenance: PronunciationProvenance;
  audio: PreparedAudio;
  /** The object URL was made for this one handle; disposing the handle revokes it. */
  ownsUrl?: boolean;
}

export type PrepareOutcome = { ok: true; prepared: Prepared } | Failure;

export const fail = (reason: Failure['reason'], message: string, alternatives: string[] = []): Failure => ({ ok: false, reason, message, alternatives });

/** The request fields every provider reads. */
export type Req = Pick<PronunciationRequest, 'languageId' | 'varietyId' | 'text' | 'kind' | 'voiceId' | 'processingPermission' | 'signal'>;
