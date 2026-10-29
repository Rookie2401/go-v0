/**
 * Grading. Pure functions from (answer key, response) to a `Grading`; no clock, no randomness, no I/O.
 *
 * Outcomes (types.ts GradeOutcome):
 *   correct          exact after normalisation against any accepted answer, or the accepted answer without its leading article
 *   partial          the right word with ë→e / ç→c folded (never `correct`), or an answer the key lists as a near miss
 *                    (the lemma when a specific form was asked)
 *   incorrect        anything else; for an open-ended meaning question the confidence is lower (the glosses can be incomplete)
 *   ambiguous        the response is right for ANOTHER reading of the word that the key lists in `alternatives`
 *   unable-to-grade  no answer, or nothing that is a letter
 *   invalid-question the exercise itself failed validation or the audio never played
 *
 * `ratingFor` is the only place a grading becomes an FSRS rating.
 */
import type { AnswerKey, Exercise, GradeOutcome, Grading, Rating, Response } from '../types';
import { DEFAULT_ARTICLES, foldAlbanian, hasLetter, normalizeAnswer, stripArticle } from './normalize';

/** The key GoReview actually stores: the contract's AnswerKey plus what grading needs beyond it (structurally compatible). */
export interface GradingKey extends AnswerKey {
  /** Answers that are right for a DIFFERENT sense or reading of the same written form, with the sense named. */
  alternatives?: Array<{ answer: string; sense: string }>;
  /** Near misses worth saying so about: graded `partial`. */
  partial?: string[];
  /** Said when a `partial` entry matches. */
  partialExplanation?: string;
  /** Articles an answer may omit; default: Albanian i/e/të/së and English to/a/an/the. */
  articles?: string[];
  /** True for meaning questions: the accepted glosses cannot be exhaustive, so an unlisted answer is graded with less confidence. */
  openEnded?: boolean;
}

const CONF = { exact: 1, articleLess: 0.9, folded: 0.7, nearMiss: 0.6, incorrectClosed: 0.95, incorrectOpen: 0.7, self: 0.6 } as const;

const typedOf = (r: Pick<Response, 'typed'> | string | undefined): string => (typeof r === 'string' ? r : r?.typed ?? '');

function finish(outcome: GradeOutcome, confidence: number, lead: string, key: Pick<AnswerKey, 'explanation' | 'deeper'>, extra: Partial<Grading> = {}): Grading {
  const explanation = [lead, key.explanation].filter((s) => s && s.trim()).join(' ');
  return { outcome, confidence, explanation, ...(key.deeper ? { deeper: key.deeper } : {}), ...extra };
}

const quote = (s: string): string => `“${s}”`;

/** Grades a typed answer. Accepts the Response or the bare string. */
export function gradeTyped(key: GradingKey, response: Pick<Response, 'typed'> | string): Grading {
  const raw = typedOf(response);
  const loose = key.normalization === 'loose';
  const exact = normalizeAnswer(raw, 'exact');
  if (!exact || !hasLetter(exact)) {
    return { outcome: 'unable-to-grade', confidence: 0, explanation: exact ? 'The answer has no letters, so it could not be graded.' : 'No answer was typed, so nothing could be graded.', ...(exact ? { normalizedResponse: exact } : {}) };
  }
  const articles = key.articles ?? DEFAULT_ARTICLES;
  const accepted = key.accepted.filter((a) => a && a.trim());
  const norm = accepted.map((a) => ({ a, n: normalizeAnswer(a, 'exact') }));

  // 1. exact (the first accepted answer is the reference; any other is equally right)
  const hit = norm.find((x) => x.n === exact);
  if (hit) return finish('correct', CONF.exact, 'Correct.', key, { matched: hit.a, normalizedResponse: exact });

  // 2. the same without the key's leading article (loose keys only)
  if (loose) {
    for (const x of norm) {
      const bare = stripArticle(x.n, articles);
      if (bare && bare === exact) return finish('correct', CONF.articleLess, `Correct — ${quote(x.a)} is usually written with its article, which you may leave out.`, key, { matched: x.a, normalizedResponse: exact });
    }
  }

  // 3. another reading's answer: the word is right, the question is about a different sense
  const alt = (key.alternatives ?? []).find((x) => normalizeAnswer(x.answer, 'exact') === exact);
  if (alt) {
    return finish('ambiguous', 0.5, `${quote(raw.trim())} is a right answer for another meaning (${alt.sense}), but this question asked about ${quote(accepted[0] ?? '')}. It is not counted either way.`, key, { matched: alt.answer, normalizedResponse: exact });
  }

  // 4. the spelling needed a fold: right word, wrong letters or marks. The loose normalisation holds every fold (Albanian ë→e / ç→c,
  //    Hebrew points, Greek accents) and each fold leaves a string of another script alone, so this is language-general.
  if (loose) {
    const folded = normalizeAnswer(exact, 'loose');
    for (const x of norm) {
      const candidates = [x.n, stripArticle(x.n, articles)].filter((s): s is string => !!s);
      const hitFold = candidates.find((c) => normalizeAnswer(c, 'loose') === folded);
      if (hitFold !== undefined) {
        // the Albanian wording when the ë / ç fold alone explains the difference, otherwise the marks of the script
        const lead = foldAlbanian(hitFold) === foldAlbanian(exact)
          ? `Almost: the word is right, but ë and ç are letters of their own in Albanian. It is written ${quote(x.a)}.`
          : `Almost: the word is right, but its vowel points or accents are part of the spelling. It is written ${quote(x.a)}.`;
        return finish('partial', CONF.folded, lead, key, { matched: x.a, normalizedResponse: exact });
      }
    }
  }

  // 5. a listed near miss (the lemma when a specific form was asked)
  const near = (key.partial ?? []).find((p) => normalizeAnswer(p, 'exact') === exact || (loose && normalizeAnswer(p, 'loose') === normalizeAnswer(exact, 'loose')));
  if (near) {
    return finish('partial', CONF.nearMiss, key.partialExplanation ?? `${quote(near)} is the dictionary form, but the question asked for a specific form: ${quote(accepted[0] ?? '')}.`, key, { matched: near, normalizedResponse: exact });
  }

  const shown = accepted[0] ?? '';
  return finish('incorrect', key.openEnded ? CONF.incorrectOpen : CONF.incorrectClosed, key.openEnded ? `Not among the accepted answers (${quote(shown)}). If yours is also right, challenge it.` : `Not quite: the answer is ${quote(shown)}.`, key, { normalizedResponse: exact });
}

/** Grades a choice. `options`, when given, makes a choice that is not one of them unable-to-grade rather than wrong. */
export function gradeChoice(key: GradingKey, response: Pick<Response, 'choice'> | string, options?: string[]): Grading {
  const raw = typeof response === 'string' ? response : response?.choice ?? '';
  const chosen = String(raw ?? '').normalize('NFC').trim();
  if (!chosen) return { outcome: 'unable-to-grade', confidence: 0, explanation: 'No option was chosen, so nothing could be graded.' };
  if (options && !options.some((o) => o.normalize('NFC').trim() === chosen)) {
    return { outcome: 'unable-to-grade', confidence: 0, explanation: 'The choice is not one of the options offered.', normalizedResponse: normalizeAnswer(chosen, 'exact') };
  }
  const n = normalizeAnswer(chosen, 'exact');
  const hit = key.accepted.find((a) => normalizeAnswer(a, 'exact') === n);
  if (hit) return finish('correct', CONF.exact, 'Correct.', key, { matched: hit, normalizedResponse: n });
  const alt = (key.alternatives ?? []).find((x) => normalizeAnswer(x.answer, 'exact') === n);
  if (alt) return finish('ambiguous', 0.5, `${quote(chosen)} is right for another meaning (${alt.sense}); it is not counted either way.`, key, { matched: alt.answer, normalizedResponse: n });
  return finish('incorrect', CONF.exact, `Not quite: the answer is ${quote(key.accepted[0] ?? '')}.`, key, { normalizedResponse: n });
}

/** A self-grade becomes an outcome at confidence 0.6: the learner is the only judge, and a self-report is the weakest kind of grade. */
export function gradeSelf(key: Pick<AnswerKey, 'explanation' | 'deeper' | 'accepted'>, response: Pick<Response, 'selfGrade'>): Grading {
  const g = response?.selfGrade;
  if (!g) return { outcome: 'unable-to-grade', confidence: 0, explanation: 'No self-grade was given, so nothing could be graded.' };
  // Hard is successful retrieval with greater subjective effort; self-report remains low-reliability evidence.
  const outcome: GradeOutcome = g === 'again' ? 'incorrect' : 'correct';
  const shown = key.accepted[0] ? ` The reference answer is ${quote(key.accepted[0])}.` : '';
  return finish(outcome, CONF.self, `You graded this yourself: ${g}.${shown}`, key);
}

/** A Grading that remembers the audio was replayed beyond the stimulus's allowance (extra replays are help, not recall evidence). */
export type GradingWithReplays = Grading & { replaysExceeded?: true };

/** True when the response replayed the audio more often than the allowance (the same rule as listening/assessment.ts `scoreListening`). */
export const replaysExceeded = (response: Pick<Response, 'replays'>, replaysAllowed: number | undefined): boolean =>
  replaysAllowed !== undefined && Math.floor(Math.max(0, response.replays ?? 0)) > replaysAllowed;

/**
 * Grades a response against an exercise by its response mode. This is what every builder's `grade` calls. The response carries the
 * replay count but not the allowance (that belongs to the stimulus), so a grading earned with extra replays is stamped here and
 * `ratingFor` reads the stamp: the recorded rating then agrees with the `hinted` flag the session puts on the event.
 */
export function gradeResponse(exercise: Exercise, response: Response): Grading {
  const g = gradeByMode(exercise, response);
  return replaysExceeded(response, exercise.prompt?.audio?.replaysAllowed) ? { ...g, replaysExceeded: true } as GradingWithReplays : g;
}

function gradeByMode(exercise: Exercise, response: Response): Grading {
  if (!exercise.validation.ok) {
    return { outcome: 'invalid-question', confidence: 0, explanation: `This question failed its own checks and is not counted: ${exercise.validation.issues.join('; ') || 'unspecified'}.` };
  }
  if (response.audioFailed) {
    return { outcome: 'invalid-question', confidence: 0, explanation: 'The audio could not be played, so this question is not counted. Nothing is recorded about what you know.' };
  }
  const key = exercise.answerKey as GradingKey;
  const typedPresent = (response.typed ?? '').trim().length > 0;
  switch (exercise.responseMode) {
    case 'choice':
      return gradeChoice(key, response, exercise.prompt.options);
    case 'typed':
      return gradeTyped(key, response);
    case 'self-graded':
      return gradeSelf(key, response);
    case 'typed-or-self':
      if (typedPresent) return gradeTyped(key, response);
      return response.selfGrade ? gradeSelf(key, response) : { outcome: 'unable-to-grade', confidence: 0, explanation: 'Nothing was typed and no self-grade was given, so nothing could be graded.' };
    default:
      return { outcome: 'invalid-question', confidence: 0, explanation: 'Unknown response mode.' };
  }
}

/**
 * The FSRS rating a grading earns, or null when it must not schedule anything.
 *   challenged, audioFailed, ambiguous, invalid-question, unable-to-grade   → null
 *   correct, unhinted                                                       → 3 (2 Hard, 4 Easy when self-graded)
 *   correct, hinted / extra replays / transcript shown first               → null
 *   partial                                                                 → 1 unless successful recall is established
 *   incorrect                                                               → 1
 */
export function ratingFor(grading: Grading, response: Response, opts: { replaysAllowed?: number } = {}): Rating | null {
  // listening replays beyond the allowance are help: stamped on the grading by gradeResponse, or checked here when the caller knows the allowance
  if ((grading as GradingWithReplays).replaysExceeded === true || replaysExceeded(response, opts.replaysAllowed)) return null;
  if (response.challenged === true || response.audioFailed === true || response.retrievalAttempted === false ||
      response.hinted === true || (response.assistance?.length ?? 0) > 0 || response.transcriptShownBefore === true) return null;
  switch (grading.outcome) {
    case 'ambiguous':
    case 'invalid-question':
    case 'unable-to-grade':
      return null;
    case 'incorrect':
      return 1;
    case 'partial':
      return grading.retrievalSucceeded === true ? 2 : 1;
    case 'correct':
      return response.selfGrade === 'hard' ? 2 : response.selfGrade === 'easy' ? 4 : 3;
    default:
      return null;
  }
}
