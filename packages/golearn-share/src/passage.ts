/**
 * From a shared text to what the parser needs, under the reader contract's rules (docs/ecosystem/READER-ADAPTER-CONTRACT.md):
 * NFC, trimmed, whole grapheme clusters, whitespace collapsed, at most 80 words and 1200 characters.
 *
 * What a share can and cannot say about the selection:
 *   - one word or a short phrase (up to MAX_PHRASE_WORDS words, one sentence): the sender selected exactly that, so the
 *     surface is known and there is no sentence context (`kind: 'none'`);
 *   - anything longer: the sender gave a passage, not a selection. The word is UNKNOWN until the learner picks it from
 *     `candidateWords`. One complete sentence (it ends like a sentence, one line) becomes `kind: 'sentence'` at a lower
 *     confidence than a browser page's (the sender may have cut it); anything else, including every passage of more than
 *     one sentence and every Thai passage (Thai has no sentence-final punctuation to check), becomes `kind: 'fragment'`.
 */
import { cleanText, endsLikeASentence, sentenceCount, textDirection, trimEdges, wordCount, wordSpans, type WordSpan } from './text';
import type { SharedPassage } from './mechanism';

export const MAX_SHARE_WORDS = 80;
export const MAX_SHARE_CHARS = 1200;
/** A share of at most this many words in one sentence is a looked-up phrase, not a passage to choose a word from. */
export const MAX_PHRASE_WORDS = 4;
/** How far a sentence from a share can be trusted as the real sentence (the browser's `web-generic` declares 0.9). */
export const SHARE_SENTENCE_CONFIDENCE = 0.6;
export const SHARE_FRAGMENT_CONFIDENCE = 0.4;

export interface ShareContext {
  kind: 'sentence' | 'fragment' | 'none';
  /** 0 when `kind` is 'none'. */
  confidence: number;
  reason?: string;
  /** The whole shared text, once a word has been chosen in it. Absent before. */
  sentence?: string;
  selStart?: number;
  selEnd?: number;
  direction: 'ltr' | 'rtl' | 'unknown';
  pageLanguage?: string;
}

export interface NormalisedShare {
  ok: true;
  /** The looked-up word or phrase; or, when `needsWordChoice`, the whole normalised passage. */
  surface: string;
  context: ShareContext;
  /** True: the learner must pick the word (`candidateWords`, then `chooseWord`) before anything can be looked up. */
  needsWordChoice: boolean;
  wordCount: number;
}

export type ShareFailureReason = 'empty' | 'too-long' | 'unreadable' | 'link-only';
export interface ShareFailure { ok: false; reason: ShareFailureReason; message: string }
export type NormaliseResult = NormalisedShare | ShareFailure;

const fail = (reason: ShareFailureReason, message: string): ShareFailure => ({ ok: false, reason, message });

const URL_ONLY = /^(?:https?:\/\/|www\.)\S+$/iu;

export function normaliseSharedPassage(p: Pick<SharedPassage, 'text' | 'languageHint'>): NormaliseResult {
  if (typeof p.text !== 'string') return fail('unreadable', 'What was shared is not text.');
  const { text, hadLineBreak } = cleanText(p.text);
  if (!text) return fail('empty', 'Nothing readable was shared.');
  if (URL_ONLY.test(text)) return fail('link-only', 'What was shared is a link, not text. Select the words you want to look up and share those.');
  const locale = p.languageHint || undefined;
  const words = wordCount(text, locale);
  if (words === 0) return fail('empty', 'What was shared has no words in it (only punctuation).');
  if (words > MAX_SHARE_WORDS || text.length > MAX_SHARE_CHARS) {
    return fail('too-long', `Share a shorter passage: up to ${MAX_SHARE_WORDS} words and ${MAX_SHARE_CHARS} characters (this has ${words} words, ${text.length} characters).`);
  }
  const direction = textDirection(text);
  const lang = locale ? { pageLanguage: locale } : {};
  const sentences = sentenceCount(text, locale);

  if (words <= MAX_PHRASE_WORDS && sentences <= 1 && !hadLineBreak) {
    const surface = trimEdges(text);
    if (!surface) return fail('empty', 'What was shared has no words in it (only punctuation).');
    return {
      ok: true, surface, wordCount: wordCount(surface, locale), needsWordChoice: false,
      context: { kind: 'none', confidence: 0, reason: 'the sender shared only the selected word or phrase, not the sentence around it', direction, ...lang },
    };
  }

  const oneSentence = sentences === 1 && !hadLineBreak && endsLikeASentence(text);
  return {
    ok: true, surface: text, wordCount: words, needsWordChoice: true,
    context: oneSentence
      ? { kind: 'sentence', confidence: SHARE_SENTENCE_CONFIDENCE, reason: 'one shared sentence; the sender may have cut it', direction, ...lang }
      : { kind: 'fragment', confidence: SHARE_FRAGMENT_CONFIDENCE, reason: 'a shared passage, not a verified sentence; the word was not selected by the sender', direction, ...lang },
  };
}

export interface CandidateWord extends WordSpan {
  /** Position among the passage's words (0-based). */
  index: number;
}

/** The words of a shared passage the learner may pick: the word-like segments of the normalised text, in order, with offsets. */
export function candidateWords(passage: string | Pick<NormalisedShare, 'surface'>, languageHint?: string): CandidateWord[] {
  const text = typeof passage === 'string' ? cleanText(passage).text : passage.surface;
  return wordSpans(text, languageHint || undefined).map((w, index) => ({ ...w, index }));
}

export interface ChosenWord { surface: string; context: ShareContext }

/**
 * The learner picked `word` in a passage that needed a choice: the surface is that word alone, and the context is the
 * passage with the word's offsets, ready for `parseSelection({ surface, context, languageId })`.
 */
export function chooseWord(share: NormalisedShare, word: Pick<CandidateWord, 'start' | 'end'>): ChosenWord | undefined {
  if (!share.needsWordChoice) return undefined;
  if (word.start < 0 || word.end > share.surface.length || word.start >= word.end) return undefined;
  const surface = share.surface.slice(word.start, word.end);
  if (!surface) return undefined;
  return { surface, context: { ...share.context, sentence: share.surface, selStart: word.start, selEnd: word.end } };
}
