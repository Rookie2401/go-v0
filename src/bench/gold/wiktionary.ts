/**
 * The rights-safe human-tokenized set derived from Wiktionary usage examples (`npm run gold:wiktionary`).
 * Pure: takes the examples and the headword index, returns gold sentences and an account of what did not align.
 */
import { fnv1a } from '../shared';
import { alignExample, type AlignReason, type HeadwordIndex } from './align';
import type { GoldSentence } from './types';

export const WIKTIONARY_TOKENIZED_BY = 'Wiktionary editors (romanization word breaks), aligned automatically';
export const WIKTIONARY_LICENCE = 'CC BY-SA 4.0 — Wiktionary, via kaikki.org';

export interface ExampleLike { headword: string; type: string; text?: string; roman?: string }

export type RejectReason = AlignReason | 'duplicate-text';

export interface WiktionaryStats {
  examples: number;
  aligned: number;
  alignedByStratum: Record<string, number>;
  rejected: Record<string, number>;
  /** Words in the aligned sentences. */
  words:{ total: number; perSentenceMean: number };
}

export interface RejectedExample { headword: string; reason: RejectReason; text?: string; roman?: string; detail?: string }

export interface WiktionaryResult { sentences: GoldSentence[]; rejected: RejectedExample[]; stats: WiktionaryStats }

export function buildWiktionaryGold(examples: readonly ExampleLike[], index: HeadwordIndex): WiktionaryResult {
  const sentences: GoldSentence[] = [];
  const rejected: RejectedExample[] = [];
  const seenText = new Set<string>();
  const usedIds = new Set<string>();
  const stats: WiktionaryStats = { examples: examples.length, aligned: 0, alignedByStratum: {}, rejected: {}, words: { total: 0, perSentenceMean: 0 } };
  const reject = (x: ExampleLike, reason: RejectReason, detail?: string) => {
    stats.rejected[reason] = (stats.rejected[reason] ?? 0) + 1;
    rejected.push({ headword: x.headword, reason, text: x.text, roman: x.roman, detail });
  };
  for (const x of examples) {
    const text = x.text?.normalize('NFC');
    if (text !== undefined && seenText.has(text)) { reject(x, 'duplicate-text'); continue; }
    const r = alignExample(text, x.roman, index);
    if (!r.ok) { reject(x, r.reason, r.detail); continue; }
    seenText.add(text as string);
    const stratum = x.type === 'quotation' ? 'wiktionary-quotation' : 'wiktionary-example';
    let id = `wikt-${fnv1a(text as string)}`;
    for (let k = 2; usedIds.has(id); k++) id = `wikt-${fnv1a(text as string)}-${k}`;
    usedIds.add(id);
    sentences.push({
      id,
      lang: 'th',
      stratum,
      text: text as string,
      boundaries: r.boundaries,
      source: { title: 'Wiktionary usage examples (English Wiktionary, Thai entries)', licence: WIKTIONARY_LICENCE, rights: 'derived-cc-by-sa' },
      tokenizedBy: WIKTIONARY_TOKENIZED_BY,
      notes: `example under headword "${x.headword}"`,
    });
    stats.aligned++;
    stats.alignedByStratum[stratum] = (stats.alignedByStratum[stratum] ?? 0) + 1;
    stats.words.total += r.words.length;
  }
  stats.words.perSentenceMean = stats.aligned ? stats.words.total / stats.aligned : 0;
  return { sentences, rejected, stats };
}
