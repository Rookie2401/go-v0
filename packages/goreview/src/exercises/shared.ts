/**
 * Shared machinery of the exercise builders: the exercise shape GoReview really stores (the contract's `Exercise`
 * plus what validation, grading and evidence need), eligibility, the gap convention and a few pure helpers.
 */
import { STATUS_RANK } from '../../../repository-contract/src';
import type { AnalysisStatus, Dimension, ReviewEligibility } from '../../../repository-contract/src';
import { glossParts, normalizeAnswer } from '../grading/normalize';
import type { GradingKey } from '../grading/grade';
import { reviewFacts } from '../facts/review-facts';
import type { ExampleReading, FormInfo } from '../facts/review-facts';
import { FAMILY_DIMENSION, REPOSITORY_DIMENSION } from '../types';
import type { BuildContext, Exercise, ExerciseBuilder, ExampleSentence, ExerciseFamily, ReviewTarget, UnitFacts } from '../types';

/** The gap in a sentence-with-gap. */
export const GAP = '_____';

/** The single place that says where the sentence in an exercise came from, and where the target sits in it. */
export interface ExerciseContext {
  sentence: string;
  surface: string;
  start: number;
  end: number;
  source: ExampleSentence['source'];
}

/** The exercise GoReview stores: a contract `Exercise` whose key and context carry the extra fields grading and evidence read. */
export interface ReviewExercise extends Exercise {
  answerKey: GradingKey;
  /** Which form of the family this is ('feature' | 'lemma' | 'choice' | 'typed' …). */
  variant?: string;
  context?: ExerciseContext;
  /** The Repository construction the answer is evidence of, for the grammar families. */
  constructionId?: string;
  /** The feature a morphological-identification question asked about. */
  askedFeature?: string;
}

export type Unavailable = { unavailable: true; reason: string };
export const unavailable = (reason: string): Unavailable => ({ unavailable: true, reason });

export type Planned = { ok: true; exercise: ReviewExercise } | { ok: false; reason: string };
export const refuse = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

// ───────────────────────────── family classes ─────────────────────────────

export const RECOGNITION_FAMILIES: readonly ExerciseFamily[] = ['written-recognition', 'phrase-comprehension', 'audio-to-meaning', 'audio-transcription'];
export const GRAMMAR_FAMILIES: readonly ExerciseFamily[] = ['morphological-identification', 'grammar-application'];
export const PRODUCTIVE_FAMILIES: readonly ExerciseFamily[] = ['meaning-to-form', 'sentence-completion'];
export const AUDIO_FAMILIES: readonly ExerciseFamily[] = ['audio-to-meaning', 'audio-transcription'];
/** Families that show a meaning or a written stimulus whose answer must not be the stimulus itself. */
export const MEANING_FAMILIES: readonly ExerciseFamily[] = ['written-recognition', 'meaning-to-form', 'phrase-comprehension', 'audio-to-meaning'];

const RECOGNITION_DIMENSIONS: readonly Dimension[] = ['readingRecognition', 'listeningRecognition', 'assistedRecognition'];

export const isRecognitionFamily = (f: ExerciseFamily): boolean => RECOGNITION_DIMENSIONS.includes(REPOSITORY_DIMENSION[FAMILY_DIMENSION[f]]);

export const PROVISIONAL_EXCEPTION = 'exception:provisional-rule-lemma-only';

// ───────────────────────────── eligibility ─────────────────────────────

/**
 * Which analyses may support which kind of question (the Repository engine's rule, restated because GoReview imports only
 * the contract): verified and high-confidence support every family; provisional supports recognition families only, with a
 * caveat; conflicted and invalidated support nothing. An analysis list whose every entry is invalidated supports nothing.
 */
export function eligibilityOf(family: ExerciseFamily, facts: UnitFacts): ReviewEligibility {
  const dimension = REPOSITORY_DIMENSION[FAMILY_DIMENSION[family]];
  const live = facts.analyses.filter((a) => a.status !== 'invalidated');
  if (facts.analyses.length > 0 && live.length === 0) return { eligible: false, status: 'invalidated', reason: 'every analysis of this form is invalidated' };
  let status: AnalysisStatus = facts.status;
  const caveats: string[] = [];
  if (live.length > 0) {
    const best = live.reduce((a, b) => (STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b : a));
    if (STATUS_RANK[best.status] < STATUS_RANK[status]) status = best.status;
    if (best.candidates.length > 1 && best.chosen === undefined) caveats.push(`ambiguous: ${best.candidates.length} readings, none chosen`);
  }
  if (status === 'invalidated') return { eligible: false, status, reason: 'analysis invalidated' };
  if (status === 'conflicted') return { eligible: false, status, reason: 'analysis conflicted: sources disagree' };
  if (status === 'provisional') {
    if (!RECOGNITION_DIMENSIONS.includes(dimension)) {
      const what = GRAMMAR_FAMILIES.includes(family) ? 'grammar' : 'production';
      return { eligible: false, status, reason: `provisional analysis; no authoritative ${what} question` };
    }
    return { eligible: true, status, caveats: ['provisional analysis; shown with caveats', ...caveats] };
  }
  return { eligible: true, status, caveats };
}

/** The checks every builder runs before its own: same unit, same language, the family's dimension, an allowed kind. */
export function precheck(builder: Pick<ExerciseBuilder, 'family' | 'dimension'>, target: ReviewTarget, facts: UnitFacts, kinds: readonly string[]): string | undefined {
  if (!facts?.unit) return 'no facts for this unit';
  if (target.unitId !== facts.unit.unitId) return `the facts are for ${facts.unit.unitId}, not ${target.unitId}`;
  if (target.languageId !== facts.unit.languageId) return `the facts are for language ${facts.unit.languageId}, not ${target.languageId}`;
  if (target.dimension !== builder.dimension) return `${builder.family} tests ${builder.dimension}, not ${target.dimension}`;
  if (!kinds.includes(facts.unit.kind)) return `${builder.family} is built from ${kinds.join(' or ')} units, not ${facts.unit.kind}`;
  return undefined;
}

// ───────────────────────────── pure helpers ─────────────────────────────

export function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export const exerciseIdOf = (family: ExerciseFamily, ...parts: string[]): string => `ex:${family}:${fnv(parts.join('|'))}`;

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The form with the capital of the slot it fills (a sentence-initial slot is capitalised, others are not). */
export function matchCase(form: string, template: string): string {
  const first = template.charAt(0);
  const upper = first !== first.toLowerCase() && first === first.toUpperCase();
  return upper ? form.charAt(0).toUpperCase() + form.slice(1) : form;
}

/** The sentence with [start, end) replaced by the gap. */
export const withGap = (c: Pick<ExerciseContext, 'sentence' | 'start' | 'end'>): string => `${c.sentence.slice(0, c.start)}${GAP}${c.sentence.slice(c.end)}`;

export const quote = (s: string): string => `“${s}”`;

const wordCount = (s: string): number => s.trim().split(/\s+/u).filter(Boolean).length;

export interface GlossSplit { lexicon: string[]; dictionary: string[] }
export function glossSplit(facts: UnitFacts): GlossSplit {
  const n = reviewFacts(facts).lexiconGlossCount ?? 0;
  return { lexicon: facts.glosses.slice(0, n), dictionary: facts.glosses.slice(n) };
}

/** The most concise gloss to show or to use as the reference answer: the first lexicon gloss, else the first short dictionary sense. */
export function referenceGloss(facts: UnitFacts): string | undefined {
  const { lexicon, dictionary } = glossSplit(facts);
  return lexicon[0] ?? dictionary.find((g) => wordCount(g) <= 6);
}

/** Every accepted meaning: the lexicon glosses and their parts, then short dictionary senses (at most four words each) and their parts. */
export function acceptedMeanings(facts: UnitFacts): string[] {
  const { lexicon, dictionary } = glossSplit(facts);
  const out: string[] = [];
  const push = (g: string): void => { for (const p of glossParts(g)) if (!out.includes(p)) out.push(p); };
  lexicon.forEach(push);
  dictionary.filter((g) => wordCount(g) <= 4 && !/[(\[]/u.test(g)).forEach(push);
  return out;
}

/** True when the glosses shown include a dictionary sense (the attribution line is then owed). */
export const usesDictionary = (facts: UnitFacts): boolean => glossSplit(facts).dictionary.length > 0 && !!facts.glossAttribution;

export function attributionLine(facts: UnitFacts, shown: string[]): string {
  const { dictionary } = glossSplit(facts);
  return facts.glossAttribution && shown.some((g) => dictionary.includes(g)) ? ` (Dictionary meaning: ${facts.glossAttribution}.)` : '';
}

export function sameText(a: string, b: string): boolean {
  return normalizeAnswer(a, 'loose') === normalizeAnswer(b, 'loose');
}

export interface Occurrence { example: ExampleSentence; reading: ExampleReading; index: number }

/** The example sentences that really hold their surface at their offsets, with the reading of the target in each. */
export function occurrences(facts: UnitFacts): Occurrence[] {
  const f = reviewFacts(facts);
  const readings = f.exampleReadings ?? [];
  const out: Occurrence[] = [];
  facts.exampleSentences.forEach((ex, index) => {
    const reading = readings[index];
    if (!reading || ex.surface === undefined || ex.start === undefined || ex.end === undefined) return;
    if (ex.text.slice(ex.start, ex.end).normalize('NFC') !== ex.surface.normalize('NFC')) return;
    out.push({ example: ex, reading, index });
  });
  return out;
}

export const contextOf = (o: Occurrence): ExerciseContext => ({
  sentence: o.example.text, surface: o.example.surface as string, start: o.example.start as number, end: o.example.end as number, source: o.example.source,
});

/** A reading the grammar and productive families may rest on. */
export const trusted = (s: AnalysisStatus): boolean => s === 'high-confidence' || s === 'verified';

export function formInfoByPred(facts: UnitFacts, pred: (f: FormInfo) => boolean): FormInfo[] {
  return (reviewFacts(facts).formGroups ?? []).flatMap((g) => g.forms).filter(pred);
}

/** Splits a feature value into its codes ("Nom,Acc" → Nom, Acc). */
export const codesOf = (v: string | undefined): string[] => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export const assemble = (e: Omit<ReviewExercise, 'validation'>): ReviewExercise => ({ ...e, validation: { ok: true, issues: [] } });

/** Convenience for builders: the BuildContext random, never Math.random. */
export const rnd = (ctx: BuildContext): (() => number) => ctx.random ?? (() => 0.5);
