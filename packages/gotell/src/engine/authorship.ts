/**
 * Authorship of a sentence: how this exact text came to be, judged from the help that was shown for it.
 *
 *   independent             no step touched the sentence (the learner's own earlier sentence, shown back to them, is not help)
 *   after-hint              only levels 1–3 were shown: the learner still produced the wording
 *   revised-after-feedback  a correction, alternatives or a model was shown, and the text is not a copy of it: the learner rewrote
 *   copied-from-model       the text equals a shown correction (4) or model (6) once case, spacing and end punctuation are ignored
 *   ai-generated            the text equals what a remote assistant proposed
 *   reproduced-later        decided by the documents module, with `isReproducedLater`: a later version repeating, without help, a
 *                           sentence that was assisted before
 *
 * "Equal" means the same after Unicode NFC, lower case, straightened quotes, collapsed white space and dropped edge punctuation —
 * never after touching a letter. The judgement reads steps and text only; it changes nothing.
 */
import type { AssistanceStep, Authorship } from '../types';
import { normaliseForCompare, sameSentence } from './text';

export interface AuthorshipHistory {
  /** The sentence as it stood before this edit. */
  previous?: string;
  /** A correction the learner was shown (or accepted) for this sentence. */
  acceptedCorrection?: string;
  /** A model expression the learner was shown for this sentence. */
  modelShown?: string;
}

/** The sentence a level 4 or level 6 step showed, read back from its content (the format is `assist.ts`'s own). */
export function shownSentence(step: AssistanceStep): string | undefined {
  if (step.level === 4) return /^Revised sentence: “(.*)”\s*$/mu.exec(step.content)?.[1];
  if (step.level === 6) return step.content.split('\n')[0]?.trim() || undefined;
  return undefined;
}

export function judgeAuthorship(sentenceText: string, steps: readonly AssistanceStep[], history: AuthorshipHistory = {}): Authorship {
  // the learner's own earlier sentence, shown back to them, reveals nothing they did not write themselves
  const help = steps.filter((s) => s.source !== 'learner-own-sentence');

  const proposed = help.filter((s) => s.source === 'remote-assistant').map(shownSentence);
  if (proposed.some((p) => p !== undefined && sameSentence(p, sentenceText))) return 'ai-generated';

  const shown = [history.acceptedCorrection, history.modelShown, ...help.filter((s) => s.level === 4 || s.level === 6).map(shownSentence)];
  if (shown.some((c) => c !== undefined && sameSentence(c, sentenceText))) return 'copied-from-model';

  if (help.length === 0) return 'independent';
  return Math.max(...help.map((s) => s.level)) >= 4 ? 'revised-after-feedback' : 'after-hint';
}

export type EarlierVersion = string | { text: string; authorship?: Authorship };

const ASSISTED: ReadonlySet<Authorship> = new Set(['after-hint', 'revised-after-feedback', 'copied-from-model', 'ai-generated', 'reproduced-later']);

/**
 * True when `current` repeats a sentence of an earlier version that was assisted. The caller (the documents module) has already
 * established that no help was shown for `current` this time; this only answers "is it the same sentence, and was it assisted
 * before?". A bare string counts as an assisted sentence; an entry whose authorship is 'independent' does not.
 */
export function isReproducedLater(current: string, earlierVersions: readonly EarlierVersion[]): boolean {
  if (normaliseForCompare(current) === '') return false;
  return earlierVersions.some((v) => {
    const text = typeof v === 'string' ? v : v.text;
    const authorship = typeof v === 'string' ? undefined : v.authorship;
    if (authorship !== undefined && !ASSISTED.has(authorship)) return false;
    return sameSentence(current, text);
  });
}
