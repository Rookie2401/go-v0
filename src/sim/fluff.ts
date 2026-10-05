/**
 * Fluff detectors: things a learner reads that are not the target language, or that he has already read under another
 * text id. Per text, over its paragraphs (the sentences of the store grouped by paragraph, in order).
 *
 *   duplicate paragraphs   a paragraph of >= DUP_MIN_WORDS words (or >= DUP_MIN_CHARS letters, for scripts written without
 *                          spaces) whose normalized content (letters and digits only, lower-cased) was already read under a
 *                          DIFFERENT text id; `dupWords` counts their words.
 *   identical text         the whole text has the same signature as one read earlier under another text id.
 *   foreign passages       src/ingest/language.ts guessLanguage, run on runs of paragraphs of >= CHUNK_WORDS words
 *                          (the guesser does not judge fewer than 40): the words of a chunk that is clearly another language,
 *                          by script or by common words. For Thai and Hindi a Latin-script chunk is foreign too.
 * `words` of a paragraph are the learner's word tokens (the adapter's), so Thai and Hindi count as the learner counts.
 */
import { hash } from '../core';
import type { LanguageCode } from '../core';
import { guessLanguage } from '../ingest/language';

export const DUP_MIN_WORDS = 8;
export const DUP_MIN_CHARS = 60;
export const CHUNK_WORDS = 40;

export interface ParagraphIn { text: string; words: number }

export interface TextFluff {
  words: number;
  dupWords: number;
  /** Text ids the duplicated paragraphs were first read under. */
  dupOf: string[];
  /** The earlier text id with the identical content signature, if any. */
  twinOf?: string;
  foreignWords: number;
  /** foreign words by the language the guesser named. */
  foreign: Record<string, number>;
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();

/** Remembers the paragraphs and texts read so far (one tracker per run). */
export class FluffTracker {
  private readonly paragraphs = new Map<string, string>();
  private readonly signatures = new Map<string, string>();
  private readonly done = new Map<string, TextFluff>();

  constructor(private readonly lang: LanguageCode) {}

  /** Analyse a text's paragraphs once; asking again for the same text id returns the first answer. */
  analyse(textId: string, paragraphs: readonly ParagraphIn[]): TextFluff {
    const known = this.done.get(textId);
    if (known) return known;

    let words = 0, dupWords = 0;
    const dupOf = new Set<string>();
    const hashes: string[] = [];
    for (const p of paragraphs) {
      words += p.words;
      const norm = normalize(p.text);
      const h = hash(norm);
      hashes.push(h);
      if (p.words < DUP_MIN_WORDS && norm.length < DUP_MIN_CHARS) continue;
      const first = this.paragraphs.get(h);
      if (first === undefined) this.paragraphs.set(h, textId);
      else if (first !== textId) { dupWords += p.words; dupOf.add(first); }
    }
    const signature = hash(hashes.join('|'));
    const twin = this.signatures.get(signature);
    if (twin === undefined && hashes.length > 0) this.signatures.set(signature, textId);

    const foreign: Record<string, number> = {};
    let foreignWords = 0;
    let chunk: string[] = [];
    let chunkWords = 0;
    const flush = () => {
      if (chunk.length === 0) return;
      const label = this.foreignLabel(chunk.join('\n'), chunkWords);
      if (label) { foreign[label] = (foreign[label] ?? 0) + chunkWords; foreignWords += chunkWords; }
      chunk = []; chunkWords = 0;
    };
    for (const p of paragraphs) {
      if (p.words === 0) continue;
      chunk.push(p.text); chunkWords += p.words;
      if (chunkWords >= CHUNK_WORDS) flush();
    }
    flush();

    const out: TextFluff = { words, dupWords, dupOf: [...dupOf], ...(twin !== undefined && twin !== textId ? { twinOf: twin } : {}), foreignWords, foreign };
    this.done.set(textId, out);
    return out;
  }

  /** The language name when the chunk is clearly not the target language, else undefined. */
  private foreignLabel(text: string, words: number): string | undefined {
    const g = guessLanguage(text);
    if (g.lang !== undefined && g.lang !== this.lang) return g.lang;
    // a Thai or Hindi text: a run of Latin letters is another language (a title, a note, a licence), whatever its length
    if ((this.lang === 'th' || this.lang === 'hi') && g.script === 'latin' && words >= 6) return g.lang ?? 'latin';
    return undefined;
  }
}
