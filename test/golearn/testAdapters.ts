/**
 * Minimal TEST-ONLY adapter registry for GoLearn tests. It is deliberately trivial:
 *  - normalize: NFC (+ lowercase for Latin scripts); NFC only for th / hi.
 *  - tokenize: explicit whitespace runs for es / de / sq ONLY. It THROWS for th / hi, so any production code
 *    path that tries to tokenize Thai or Hindi text fails loudly (GoLearn must never tokenize at all).
 *  - relate: driven by an explicit lemma table passed in by the test.
 * The real adapters live in src/adapters (package A).
 */
import type { AdapterRegistry, LanguageAdapter, LanguageCode, RawToken, Script } from '../../src/core';

const SCRIPT: Record<LanguageCode, Script> = { es: 'Latn', sq: 'Latn', de: 'Latn', th: 'Thai', hi: 'Deva' };

export function createTestAdapter(lang: LanguageCode, lemmaOf: Record<string, string> = {}): LanguageAdapter {
  const latin = SCRIPT[lang] === 'Latn';
  const normalize = (s: string) => (latin ? s.normalize('NFC').toLowerCase() : s.normalize('NFC'));
  return {
    lang, name: `test-${lang}`, script: SCRIPT[lang], version: 'test@1',
    segmentSentences: (text) => [{ start: 0, end: text.length, text }],
    tokenize(sentence): RawToken[] {
      if (!latin) throw new Error(`test adapter refuses to tokenize ${lang}: use buildFixtureText with explicit tokens`);
      const out: RawToken[] = [];
      for (const m of sentence.matchAll(/\S+/g)) {
        out.push({ surface: m[0], start: m.index!, end: m.index! + m[0].length, isWord: true, normalized: normalize(m[0]) });
      }
      return out;
    },
    normalize,
    searchNormalize: normalize,
    analyze: (tokens) => tokens.map((token) => ({ token, candidates: [], analyzer: 'test@1' })),
    detectPhrases: () => [],
    detectPatterns: () => [],
    pronunciation: () => ({}),
    speechNormalize: (t) => ({ speechText: t, transformations: [], normalizerVersion: 'test@1' }),
    display: { wordSeparator: lang === 'th' ? '' : ' ', showBoundariesOnHighlight: lang === 'th' },
    checkProduction: () => [],
    relate(a, b) {
      const x = normalize(a), y = normalize(b);
      if (x === y) return 'same';
      const lx = lemmaOf[x], ly = lemmaOf[y];
      if (lx && ly && lx === ly) return 'inflection';
      if (lx && lx === y || ly && ly === x) return 'inflection';
      return 'none';
    },
  };
}

export function createTestRegistry(lemmaOf: Partial<Record<LanguageCode, Record<string, string>>> = {}): AdapterRegistry {
  const langs: LanguageCode[] = ['es', 'sq', 'th', 'hi', 'de'];
  const adapters = new Map(langs.map((l) => [l, createTestAdapter(l, lemmaOf[l] ?? {})] as const));
  return { get: (lang) => adapters.get(lang)!, all: () => [...adapters.values()] };
}
