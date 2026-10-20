/** Type-only wire contract for the background's local translation bridge. It contains no endpoint or credential. */
import type { LocalTranslationLanguage } from './models';
export interface LocalSentenceTranslationRequest {
  text: string;
  sourceLanguage: LocalTranslationLanguage;
  targetLanguage: 'en';
  explicitlyRequested: true;
}

export type LocalSentenceTranslationReply =
  | { ok: true; text: string; model: string; revision?: string; sourceLanguage?: LocalTranslationLanguage; targetLanguage?: 'en' }
  | { ok: false; reason: 'not-configured' | 'invalid-request' | 'host-permission-unavailable' | 'unavailable' | 'service-error' };
