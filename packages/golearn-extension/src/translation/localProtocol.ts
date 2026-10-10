/** Type-only wire contract for the background's local translation bridge. It contains no endpoint or credential. */
export interface LocalSentenceTranslationRequest {
  text: string;
  sourceLanguage: 'sq';
  targetLanguage: 'en';
  explicitlyRequested: true;
}

export type LocalSentenceTranslationReply =
  | { ok: true; text: string; model: 'Helsinki-NLP/opus-mt-sq-en'; revision?: string }
  | { ok: false; reason: 'not-configured' | 'invalid-request' | 'host-permission-unavailable' | 'unavailable' | 'service-error' };
