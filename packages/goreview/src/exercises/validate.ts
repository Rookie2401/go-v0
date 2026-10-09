/**
 * `validateExercise`: the builder's own check on what it made. An exercise with an issue is never shown (builders return
 * `unavailable` instead), and the checks here are written to catch the ways a weak exercise gets built:
 *   - no instruction, or no accepted answer;
 *   - a meaning question whose stimulus IS its answer (a gloss that equals the word);
 *   - an audio exercise that would show its answer (the written form must be in `hiddenBeforeAnswer`);
 *   - a grammar or productive exercise resting on a provisional, conflicted or invalidated analysis (the one stated
 *     exception: a provisional, rule-derived form whose lemma is in the word list may be asked for its LEMMA only);
 *   - a sentence from anywhere but the pack's own owner-authored sources, or whose offsets do not hold the surface;
 *   - a gap sentence that leaks its answer, a choice question whose answer is not among its options.
 */
import { normalizeAnswer } from '../grading/normalize';
import { FAMILY_DIMENSION } from '../types';
import type { Exercise, ExerciseFamily, ExampleSentence } from '../types';
import {
  AUDIO_FAMILIES, GAP, GRAMMAR_FAMILIES, MEANING_FAMILIES, PRODUCTIVE_FAMILIES, PROVISIONAL_EXCEPTION, RECOGNITION_FAMILIES, withGap,
} from './shared';
import type { ReviewExercise } from './shared';

export const ALLOWED_SENTENCE_SOURCES: readonly ExampleSentence['source'][] = ['pack-validation', 'pack-tutorial', 'original'];

const RESPONSE_MODES: Record<ExerciseFamily, readonly string[]> = {
  'written-recognition': ['typed-or-self', 'choice'],
  'meaning-to-form': ['typed'],
  'morphological-identification': ['choice', 'typed'],
  'grammar-application': ['choice'],
  'phrase-comprehension': ['typed-or-self'],
  'sentence-completion': ['typed'],
  'audio-to-meaning': ['typed-or-self', 'choice'],
  'audio-transcription': ['typed'],
};

const NEEDS_SENTENCE: readonly ExerciseFamily[] = ['sentence-completion', 'morphological-identification', 'grammar-application', 'phrase-comprehension'];

const has = (s: string | undefined): s is string => typeof s === 'string' && s.trim().length > 0;

export function validateExercise(exercise: Exercise): { ok: boolean; issues: string[] } {
  const e = exercise as ReviewExercise;
  const issues: string[] = [];
  const bad = (m: string): void => { issues.push(m); };

  if (!has(e.exerciseId)) bad('the exercise has no id');
  if (!has(e.prompt?.instruction)) bad('the instruction is empty');
  const accepted = (e.answerKey?.accepted ?? []).filter(has);
  if (accepted.length === 0) bad('there is no accepted answer');
  if (!has(e.answerKey?.explanation)) bad('the answer has no explanation');
  if (!has(e.target?.unitId) || !has(e.target?.languageId)) bad('the target has no unit or language');
  if (e.target && e.target.dimension !== FAMILY_DIMENSION[e.family]) bad(`the target dimension ${e.target.dimension} is not the one ${e.family} tests (${FAMILY_DIMENSION[e.family]})`);
  if (!RESPONSE_MODES[e.family]?.includes(e.responseMode)) bad(`${e.family} does not take the response mode ${e.responseMode}`);

  // meaning questions: the stimulus is never the answer
  if (MEANING_FAMILIES.includes(e.family)) {
    const stimulus = e.family === 'meaning-to-form' ? e.prompt?.meaning : e.prompt?.stimulusText;
    if (!has(stimulus)) bad(e.family === 'meaning-to-form' ? 'the meaning to translate is missing' : 'the stimulus is missing');
    else if (e.family !== 'phrase-comprehension') {
      const s = normalizeAnswer(stimulus, 'loose');
      if (accepted.some((a) => normalizeAnswer(a, 'loose') === s)) bad('the stimulus equals an accepted answer');
    }
  }

  // choice questions
  if (e.responseMode === 'choice') {
    const options = e.prompt?.options ?? [];
    const norm = options.map((o) => normalizeAnswer(o, 'exact'));
    if (options.length < 2) bad('a choice question needs at least two options');
    if (new Set(norm).size !== norm.length) bad('the options are not distinct');
    if (!accepted.every((a) => options.includes(a))) bad('the correct answer is not among the options');
    if (accepted.length !== 1) bad('a choice question has exactly one correct option');
  } else if ((e.prompt?.options ?? []).length > 0) {
    bad('options are only for a choice question');
  }

  // audio: the written form never shows before the response
  if (AUDIO_FAMILIES.includes(e.family)) {
    const hidden = e.hiddenBeforeAnswer ?? [];
    if (!e.prompt?.audio) bad('an audio exercise needs its stimulus');
    else if (e.prompt.audio.answerHidden !== true) bad('the audio stimulus does not declare its answer hidden');
    if (!has(e.prompt?.stimulusText)) bad('the written form of the audio is missing (it is needed to grade, and hidden until the response)');
    if (!hidden.includes('stimulusText')) bad('the written form must be listed in hiddenBeforeAnswer');
    if (has(e.prompt?.meaning) && !hidden.includes('meaning')) bad('the meaning must be listed in hiddenBeforeAnswer');
    if (has(e.prompt?.stimulusText) && normalizeAnswer(e.prompt.instruction ?? '', 'exact').includes(normalizeAnswer(e.prompt.stimulusText, 'exact'))) bad('the instruction names the hidden word');
    if (e.prompt?.audio?.audio.kind === 'device' && e.prompt.audio.audio.text !== undefined && has(e.prompt.stimulusText) && !hidden.includes('stimulusText')) bad('a device voice carries the text: it must stay hidden');
    if (e.prompt?.audio && e.prompt.audio.itemIds.indexOf(e.target.unitId) < 0) bad('the audio stimulus was prepared for another unit');
  }

  // eligibility consistent with the target's status
  const el = e.eligibility;
  if (!el || el.eligible !== true) bad('the exercise was built for an ineligible target');
  else {
    if (el.status === 'invalidated' || el.status === 'conflicted') bad(`an exercise cannot rest on a ${el.status} analysis`);
    if (el.status === 'provisional') {
      if (RECOGNITION_FAMILIES.includes(e.family)) {
        if (el.caveats.length === 0) bad('a provisional analysis needs its caveat on a recognition exercise');
      } else if (GRAMMAR_FAMILIES.includes(e.family) || PRODUCTIVE_FAMILIES.includes(e.family)) {
        const excepted = e.family === 'morphological-identification' && e.variant === 'lemma' && e.builtFrom?.facts?.includes(PROVISIONAL_EXCEPTION) === true && !e.answerKey.features;
        if (!excepted) bad('grammar and productive exercises refuse a provisional analysis');
      }
    }
  }

  // sentences
  const ctx = e.context;
  const src = e.builtFrom?.sentenceSource;
  if (src !== undefined && !ALLOWED_SENTENCE_SOURCES.includes(src)) bad(`the sentence source ${String(src)} is not an allowed source`);
  if (NEEDS_SENTENCE.includes(e.family) && !ctx) bad(`${e.family} needs a pack sentence`);
  if (has(e.prompt?.sentenceWithGap) && !ctx) bad('a sentence with a gap needs its context');
  if (ctx) {
    if (!ALLOWED_SENTENCE_SOURCES.includes(ctx.source)) bad(`the sentence source ${String(ctx.source)} is not an allowed source`);
    if (src !== ctx.source) bad('the declared sentence source does not match the sentence');
    if (!Number.isInteger(ctx.start) || !Number.isInteger(ctx.end) || ctx.start < 0 || ctx.end <= ctx.start || ctx.end > ctx.sentence.length) bad('the sentence offsets are out of range');
    else if (ctx.sentence.slice(ctx.start, ctx.end).normalize('NFC') !== ctx.surface.normalize('NFC')) bad('the sentence does not contain the surface at the given offsets');
    else {
      if (has(e.prompt?.sentenceWithGap)) {
        if (e.prompt.sentenceWithGap !== withGap(ctx)) bad('the sentence with a gap does not match the sentence and offsets');
        if (e.prompt.sentenceWithGap.split(GAP).length !== 2) bad('the sentence has to hold exactly one gap');
        const first = accepted[0] ? normalizeAnswer(accepted[0], 'exact') : '';
        if (first) {
          const rest = normalizeAnswer(e.prompt.sentenceWithGap.replace(GAP, ' '), 'exact').split(/[^\p{L}\p{N}']+/u);
          if (rest.includes(first)) bad('the rest of the sentence still contains the answer');
        }
        if ((e.family === 'sentence-completion' || e.family === 'grammar-application') && !accepted.some((a) => normalizeAnswer(a, 'exact') === normalizeAnswer(ctx.surface, 'exact'))) bad('the word that was removed is not an accepted answer');
      } else if (e.family === 'morphological-identification' || e.family === 'phrase-comprehension') {
        if (e.prompt?.stimulusText !== ctx.sentence) bad('the stimulus is not the sentence the target was found in');
      }
    }
  }

  if (e.validation && e.validation.ok === false && e.validation.issues.length === 0) bad('the exercise carries a failed validation');
  return { ok: issues.length === 0, issues };
}
