/**
 * Stable id derivation. Ids are pure functions of content identity so that the same linguistic
 * object (a form, a lemma, a phrase) gets the same id in Story 17 and in John 3.
 */
import type { LanguageCode, PartOfSpeech } from './model';

/** FNV-1a 64-bit over UTF-8, hex. Deterministic, dependency-free, fine for identity (not security). */
export function hash(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

export const ids = {
  text: (lang: LanguageCode, slug: string) => `text:${lang}:${slug}`,
  section: (textId: string, index: number) => `${textId}/sec${index}`,
  paragraph: (textId: string, index: number) => `${textId}/p${index}`,
  /** `key` is the stable sentence key (author id or content hash); fixtures use the index. */
  sentence: (textId: string, key: number | string) => `${textId}/s${key}`,
  /** Stable key for a sentence: hash of its exact text, with "~n" for the n-th repeat inside one text. */
  sentenceKey: (exactText: string, repeat = 0) => hash(exactText).slice(0, 12) + (repeat ? `~${repeat}` : ''),
  draft: (userId: string, lang: LanguageCode) => `draft:${userId}:${lang}`,
  token: (sentenceId: string, index: number) => `${sentenceId}/t${index}`,
  form: (lang: LanguageCode, normalized: string) => `form:${lang}:${normalized}`,
  lemma: (lang: LanguageCode, lemma: string, pos?: PartOfSpeech) => `lemma:${lang}:${lemma}${pos ? ':' + pos : ''}`,
  phrase: (lang: LanguageCode, pattern: string[]) => `phrase:${lang}:${pattern.join('_')}`,
  pattern: (lang: LanguageCode, key: string) => `pattern:${lang}:${key}`,
  rescue: (sentenceId: string) => `rescue:${sentenceId}`,
  analysis: (tokenId: string, analyzer: string, n = 0) => `an:${tokenId}:${analyzer}:${n}`,
  phraseOccurrence: (phraseId: string, sentenceId: string, firstTokenIndex: number) => `po:${hash(phraseId + '|' + sentenceId)}:${firstTokenIndex}`,
  patternOccurrence: (patternId: string, sentenceId: string, firstTokenIndex: number) => `pao:${hash(patternId + '|' + sentenceId)}:${firstTokenIndex}`,
  learnerItem: (userId: string, itemId: string) => `${userId}|${itemId}`,
  encounter: (userId: string, itemId: string, sentenceId: string, modality: string, session: string) => `enc:${hash([userId, itemId, sentenceId, modality, session].join('|'))}`,
  audioSegment: (cacheKey: string) => `seg:${cacheKey}`,
  manifest: (textId: string, voiceConfigId: string, contentVersion: number) => `man:${textId}:${voiceConfigId}:v${contentVersion}`,
  testimony: (userId: string, lang: LanguageCode) => `tst:${userId}:${lang}`,
  revision: (testimonyId: string, n: number) => `${testimonyId}/r${n}`,
  suggestion: (draftHash: string, sentenceIndex: number, n: number) => `sug:${draftHash}:${sentenceIndex}:${n}`,
  /** Random-enough event id (time + counter) — events are append-only; dedupe uses `dedupeKey`. */
  event: (() => {
    let c = 0;
    return () => `ev:${Date.now().toString(36)}:${(c++).toString(36)}`;
  })(),
};

/**
 * Parse "text:es:story-01/s3/t7" (fixture) or "text:es:story-01/s9f3c…/t7" (ingested) into its parts.
 * `sentenceKey` is the stable key; `sentenceIndex` is only meaningful for index-keyed fixtures (NaN otherwise) —
 * production code must read `Sentence.index` from the store, never derive order from an id.
 */
export function parseTokenId(tokenId: string): { textId: string; sentenceId: string; sentenceKey: string; sentenceIndex: number; tokenIndex: number } {
  const m = /^(.*)\/s([^/]+)\/t(\d+)$/.exec(tokenId);
  if (!m) throw new Error(`bad token id: ${tokenId}`);
  return { textId: m[1], sentenceId: `${m[1]}/s${m[2]}`, sentenceKey: m[2], sentenceIndex: Number(m[2]), tokenIndex: Number(m[3]) };
}

export function parseSentenceId(sentenceId: string): { textId: string; sentenceKey: string; sentenceIndex: number } {
  const m = /^(.*)\/s([^/]+)$/.exec(sentenceId);
  if (!m) throw new Error(`bad sentence id: ${sentenceId}`);
  return { textId: m[1], sentenceKey: m[2], sentenceIndex: Number(m[2]) };
}

export function itemKindOf(itemId: string): 'form' | 'lemma' | 'phrase' | 'pattern' {
  if (itemId.startsWith('form:')) return 'form';
  if (itemId.startsWith('lemma:')) return 'lemma';
  if (itemId.startsWith('phrase:')) return 'phrase';
  if (itemId.startsWith('pattern:')) return 'pattern';
  throw new Error(`unknown item id: ${itemId}`);
}
