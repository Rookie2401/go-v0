/**
 * Audio cache key. A segment's identity is a pure function of everything that can change the audio
 * or what it claims to say. Deliberately NOT included: the text's contentVersion, the sentence id and
 * the text id - otherwise one edited sentence would invalidate every segment of the text, and the same
 * sentence could not be reused across texts/revisions.
 */
import { hash } from '../core/ids';
import type { LanguageCode } from '../core/model';

export interface CacheKeyParts {
  /** Hash of the canonical DISPLAY text (so an edit to the displayed sentence always re-keys). */
  displayTextHash: string;
  /** Speech-normalized text actually sent to the provider (after pronunciation substitutions). */
  speechText: string;
  lang: LanguageCode;
  /** Locale actually expected from the voice (not the requested one). */
  actualLocale: string;
  providerId: string;
  engine?: string;
  voiceId: string;
  settings: Record<string, string | number | boolean>;
  normalizerVersion: string;
  /** Identifies the pronunciation entries applied ("none" when no override was used). */
  lexiconVersion: string;
  /** Optional: bump when a provider's synthesis changes under the same engine name. */
  providerVersion?: string;
}

export function computeCacheKey(p: CacheKeyParts): string {
  const settings = Object.keys(p.settings).sort().map((k) => [k, p.settings[k]]);
  const canon = JSON.stringify([
    'golisten-ck@1', p.displayTextHash, p.speechText, p.lang, p.actualLocale, p.providerId, p.engine ?? '',
    p.voiceId, settings, p.normalizerVersion, p.lexiconVersion, p.providerVersion ?? '',
  ]);
  // Two independent 64-bit FNV passes: identity, not security.
  return `ck:${hash(canon)}${hash('salt|' + canon)}`;
}
