/**
 * Which orth / sound–spelling features a written word exercises.
 *   Hindi, Thai: the adapter's own decoder and orthFeatures (the same `orth:<lang>:<feature>` keys GoLearn tracks).
 *   Spanish, German, Albanian: the language config's spelling patterns.
 * Also: the romanization of a word (Hindi, Thai), used only as a fading rescue.
 */
import { decodeFor } from '../core';
import type { LanguageAdapter, LanguageCode, SyllableAnalysis } from '../core';
import { bestCandidate, parse, wordIndexes } from '../gotell/text';
import { stage0Config } from './lang';

export interface WordInfo {
  surface: string;
  normalized: string;
  start: number;
  end: number;
  lemma?: string;
  pos?: string;
  gloss?: string;
  features: string[];
  romanization?: string;
  syllables: SyllableAnalysis[];
}

function spellingFeatures(lang: LanguageCode, surface: string, pos?: string): string[] {
  const defs = stage0Config(lang).script.spelling ?? [];
  const lower = surface.normalize('NFC').toLowerCase();
  const out: string[] = [];
  for (const d of defs) {
    if (d.pos && d.pos !== pos) continue;
    if (d.pattern.test(d.caseSensitive ? surface : lower)) out.push(d.id);
  }
  return out;
}

/** The words of a line with their features (and, for script languages, romanization from the decoder). */
export function wordsOf(adapter: LanguageAdapter, lang: LanguageCode, text: string): WordInfo[] {
  const p = parse(adapter, text);
  const cfg = stage0Config(lang);
  return wordIndexes(p).map((i) => {
    const t = p.tokens[i];
    const c = bestCandidate(p.analyses[i]);
    let syllables: SyllableAnalysis[] = [];
    let features: string[];
    if (cfg.script.features === 'adapter') {
      try { syllables = decodeFor(adapter, t.surface, c ?? undefined); } catch { syllables = []; }
      features = adapter.orthFeatures ? adapter.orthFeatures(syllables) : [];
    } else {
      features = spellingFeatures(lang, t.surface, c?.pos);
    }
    const roman = syllables.map((s) => s.romanization ?? '').join('');
    return {
      surface: t.surface, normalized: t.normalized, start: t.start, end: t.end,
      ...(c?.lemma ? { lemma: c.lemma } : {}), ...(c?.pos ? { pos: c.pos } : {}), ...(c?.gloss ? { gloss: c.gloss } : {}),
      features: [...new Set(features)], syllables,
      ...(roman ? { romanization: roman } : {}),
    };
  });
}

export function featuresOfWord(adapter: LanguageAdapter, lang: LanguageCode, word: string): string[] {
  return [...new Set(wordsOf(adapter, lang, word).flatMap((w) => w.features))];
}

/** Plain-words label of a feature (spelling patterns: their label; adapter features: the adapter's description). */
export function describeFeature(adapter: LanguageAdapter, lang: LanguageCode, feature: string): string {
  const def = stage0Config(lang).script.spelling?.find((d) => d.id === feature);
  if (def) return def.label;
  try { return adapter.describeOrthFeature?.(feature) ?? feature; } catch { return feature; }
}
