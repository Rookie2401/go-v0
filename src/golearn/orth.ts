/**
 * Writing-system ("orth") items: the features of a word's written form that the learner has to learn to decode
 * (consonant class, vowel pattern, tone mark, tone rule …). They come from the language adapter's decoding and are folded
 * like any other item, but they are NOT words: nothing that counts words (coverage, vocabulary lists, recommendations,
 * estimates for words) may include them (`isOrthId`, `withoutOrth`).
 *
 * Decodings are computed on demand and cached per form for the duration of one fold (or one rebuild): a novel repeats
 * the same few thousand forms, and decoding is a pure function of (adapter, spelling, dictionary pronunciation).
 */
import type { LanguageAdapter, LanguageCode, TokenAnalysis } from '../core';
import { decodeFor, ids } from '../core';

export const isOrthId = (itemId: string): boolean => itemId.startsWith('orth:');
export const withoutOrth = <T extends { itemKind?: string; itemId?: string }>(rows: T[]): T[] =>
  rows.filter((r) => r.itemKind !== 'orth' && !(r.itemId && isOrthId(r.itemId)));

export class OrthCache {
  private readonly byKey = new Map<string, string[]>();

  clear() { this.byKey.clear(); }

  /** The orth feature keys of one token's written form (empty when the adapter cannot decode, or the spelling cannot be decoded). */
  features(adapter: LanguageAdapter, surface: string, analysis?: Pick<TokenAnalysis, 'syllables' | 'notes'>): string[] {
    if (!adapter.orthFeatures || (!adapter.decode && !adapter.decodeWithPronunciation)) return [];
    const compute = (): string[] => {
      try {
        const syllables = decodeFor(adapter, surface, analysis);
        return syllables.length > 0 ? [...new Set(adapter.orthFeatures!(syllables))] : [];
      } catch {
        return []; // a decoding failure must never stop a fold (and so a rebuild): the word simply yields no writing-system items
      }
    };
    // An author-supplied decoding is read as is. Otherwise the result depends only on the spelling and the dictionary pronunciation.
    if (analysis?.syllables?.length) return compute();
    const note = (k: string) => (typeof analysis?.notes?.[k] === 'string' ? (analysis!.notes![k] as string) : '');
    const key = `${adapter.lang}\u0000${surface}\u0000${note('respelling')}\u0000${note('ipa')}`;
    let out = this.byKey.get(key);
    if (!out) this.byKey.set(key, (out = compute()));
    return out;
  }

  /** The orth item ids of one token's written form. */
  itemIds(adapter: LanguageAdapter, lang: LanguageCode, surface: string, analysis?: Pick<TokenAnalysis, 'syllables' | 'notes'>): string[] {
    return this.features(adapter, surface, analysis).map((f) => ids.orth(lang, f));
  }
}
