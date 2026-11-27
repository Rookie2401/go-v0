import type { PronunciationProvenance, PronunciationRequest, PronunciationResult, VoiceDescriptor } from '../contracts';
import { speechSafeText } from '../../../repository-contract/src';

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

/**
 * The text a voice is given: whitespace collapsed, and a Korean homonym number (눈², an identity and never a spelling) removed, so a
 * lemma that reaches speech is spoken as its headword (repository-contract lemma-display.ts). Every other language's text is as it was.
 */
export const spokenText = (languageId: string, text: string): string => speechSafeText(languageId, text).replace(/\s+/g, ' ').trim();

/** The request fields every provider reads. */
export type Req = Pick<PronunciationRequest, 'languageId' | 'varietyId' | 'text' | 'kind' | 'voiceId' | 'processingPermission' | 'signal'>;
