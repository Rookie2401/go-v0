/**
 * The ladder of help — minimum effective intervention.
 *
 * After an attempt, GoTell offers the SMALLEST step not yet shown for the problem that matters most (meaning before
 * language). Each step is recorded exactly as shown (TellInterventionShown) and carries a tier:
 *   none      restatement                       — says the meaning another way; gives no target language
 *   cue       conceptual hint, English cue, first letter, "look again here" — points the way
 *   scaffold  dictionary form, a sentence he has read, sentence frame, gap, choice, one correction — gives part of the wording
 *   model     full model                        — gives all of it
 * Ladder for a missing idea (per concept): restatement → conceptual hint → English cue → first letter → dictionary form →
 * a sentence he has read with it → sentence frame → the sentence with one gap → choose the word → full model.
 * The frame comes before the gap because it gives less away (the shape of the sentence, not its words); the order is by how
 * much target language each step reveals.
 * Ladder for a language problem (per checker finding): where to look again → that one correction → … → full model.
 *
 * Model wording comes from the learner's own earlier independent success, else the catalog (unreviewed, labelled), else a
 * sentence he has read. Steps that need a model are skipped when there is none — the ladder then ends earlier, honestly.
 */
import { ids } from '../../core';
import type { AssistanceKind, AssistanceStep, LanguageAdapter, LanguageCode, ModelWording, SemanticGoal, SupportTier, TellAttemptRecord } from '../../core';
import { CONCEPTS, NEGATORS, conceptMatches, lexemesFor } from '../concepts';
import type { ConceptId } from '../concepts';
import { negatorsIn } from '../meaning';
import { bestCandidate, parse, wordIndexes } from '../text';
import { taxonomyEntry } from './taxonomy';

export const RUNG: Record<AssistanceKind, number> = {
  restatement: 1, 'conceptual-hint': 2, 'english-cue': 3, 'first-letter-cue': 4, 'issue-flagged': 4,
  'lemma-supplied': 5, 'phrase-supplied': 6, 'morphological-correction': 6, 'partial-correction': 6,
  'sentence-frame': 7, 'gap-completion': 8, 'recognition-choice': 9, 'full-model': 10,
};

export const TIER: Record<AssistanceKind, SupportTier> = {
  restatement: 'none', 'conceptual-hint': 'cue', 'english-cue': 'cue', 'first-letter-cue': 'cue', 'issue-flagged': 'cue',
  'lemma-supplied': 'scaffold', 'phrase-supplied': 'scaffold', 'morphological-correction': 'scaffold', 'partial-correction': 'scaffold',
  'sentence-frame': 'scaffold', 'gap-completion': 'scaffold', 'recognition-choice': 'scaffold', 'full-model': 'model',
};

const TIER_ORDER: SupportTier[] = ['none', 'cue', 'scaffold', 'model'];
export const tierRank = (t: SupportTier): number => TIER_ORDER.indexOf(t);
export const strongestTier = (steps: Array<Pick<AssistanceStep, 'tier'>>): SupportTier =>
  steps.reduce<SupportTier>((best, s) => (tierRank(s.tier) > tierRank(best) ? s.tier : best), 'none');

/** Kinds that give target-language wording away (after them, a corrected attempt is not self-repair). */
export const GIVES_WORDING = (k: AssistanceKind): boolean => TIER[k] === 'scaffold' || TIER[k] === 'model';

export const HINT_LABEL: Record<AssistanceKind, string> = {
  restatement: 'Say the meaning another way',
  'conceptual-hint': 'A hint about what is missing',
  'english-cue': 'Name the missing idea',
  'first-letter-cue': 'The first letter',
  'issue-flagged': 'Where to look again',
  'lemma-supplied': 'The dictionary form of the word',
  'phrase-supplied': 'A sentence you have read with it',
  'sentence-frame': 'The shape of the sentence',
  'gap-completion': 'The sentence with one gap',
  'recognition-choice': 'Choose the word',
  'morphological-correction': 'One correction',
  'partial-correction': 'One correction',
  'full-model': 'Show me a model',
};

/** A sentence the learner has met that contains a word for a concept (GoLearn encounter → sentence → text). */
export interface MetSentence { concept: string; itemId: string; textId: string; title: string; sentenceId: string; excerpt: string; scripture: boolean }

export interface LadderInput {
  goal: SemanticGoal;
  lang: LanguageCode;
  adapter: LanguageAdapter;
  model?: ModelWording;
  last?: TellAttemptRecord;
  shown: AssistanceStep[];
  metSentence?: (concept: string) => MetSentence | undefined;
  /**
   * Where the FIRST step of a task may start (the scheduler's start rung): for a meaning far from what he can say, the first
   * hint skips cues that would not help. The task itself always starts with free production.
   */
  floorRung?: number;
}

export type StepDraft = Omit<AssistanceStep, 'id' | 'at'>;

const NEGATION = 'negation';
const CONFUSABLE: Partial<Record<ConceptId, ConceptId[]>> = {
  believe: ['trust', 'know', 'faith'], trust: ['believe', 'know'], faith: ['believe', 'trust'], know: ['understand', 'believe'],
  understand: ['know', 'believe'], repent: ['regret', 'forgive'], regret: ['repent', 'guilt'], forgive: ['grace', 'repent'],
  grace: ['forgive', 'salvation'], salvation: ['grace', 'forgive'], guilt: ['sin', 'conviction'], sin: ['guilt', 'repent'],
  conviction: ['guilt', 'repent'], change: ['now', 'understand'], now: ['change', 'young'], young: ['family', 'now'],
  family: ['young', 'share'], share: ['know', 'change'], jesus: ['family', 'grace'],
};

function firstGrapheme(s: string): string {
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const g of seg.segment(s)) return g.segment;
  } catch { /* no segmenter: fall back to the first code point */ }
  return [...s][0] ?? s;
}

interface ModelSpan { start: number; end: number; surface: string; normalized: string[] }

/** Where in the model wording each concept is carried (Thai: adjacent tokens are read together, as in assess.ts). */
function modelSpans(adapter: LanguageAdapter, lang: LanguageCode, goal: SemanticGoal, text: string): Map<string, ModelSpan> {
  const p = parse(adapter, text);
  const words = wordIndexes(p);
  const out = new Map<string, ModelSpan>();
  const wanted = new Set(goal.components.map((c) => c.concept));
  for (const i of words) {
    for (const hit of conceptMatches(lang, p.tokens[i].normalized, bestCandidate(p.analyses[i])?.lemma)) {
      if (wanted.has(hit.concept) && !out.has(hit.concept)) out.set(hit.concept, { start: p.tokens[i].start, end: p.tokens[i].end, surface: p.tokens[i].surface, normalized: [p.tokens[i].normalized] });
    }
  }
  if (lang === 'th') {
    for (let k = 0; k < words.length; k++) {
      for (const n of [2, 3]) {
        const run = words.slice(k, k + n);
        if (run.length < n || run.some((x, j) => j > 0 && x !== run[j - 1] + 1)) continue;
        for (const hit of conceptMatches(lang, run.map((x) => p.tokens[x].normalized).join(''))) {
          if (wanted.has(hit.concept) && !out.has(hit.concept)) {
            out.set(hit.concept, { start: p.tokens[run[0]].start, end: p.tokens[run[n - 1]].end, surface: run.map((x) => p.tokens[x].surface).join(''), normalized: run.map((x) => p.tokens[x].normalized) });
          }
        }
      }
    }
  }
  const neg = negatorsIn(lang, p)[0];
  if (neg) {
    const i = words.find((x) => p.tokens[x].normalized === neg);
    if (i !== undefined) out.set(NEGATION, { start: p.tokens[i].start, end: p.tokens[i].end, surface: p.tokens[i].surface, normalized: [neg] });
  }
  return out;
}

const blank = (text: string, spans: ModelSpan[]): string => {
  let out = text;
  for (const s of [...spans].sort((a, b) => b.start - a.start)) out = `${out.slice(0, s.start)}___${out.slice(s.end)}`;
  return out;
};

const englishOf = (goal: SemanticGoal, concept: string): string =>
  concept === NEGATION ? 'not' : goal.components.find((c) => c.concept === concept)?.english ?? concept;

const has = (shown: AssistanceStep[], kind: AssistanceKind, concept?: string) => shown.some((s) => s.kind === kind && (concept === undefined || s.concept === concept));

/** The smallest next step, or undefined when nothing more can be given (or nothing is needed). */
export function nextStep(input: LadderInput): StepDraft | undefined {
  const s = stepAt(input);
  // a floor that skips everything available (no model for a frame) falls back to the ordinary ladder
  return s ?? ((input.floorRung ?? 0) > 0 ? stepAt({ ...input, floorRung: 0 }) : undefined);
}

function stepAt(input: LadderInput): StepDraft | undefined {
  const { goal, lang, adapter, model, last, shown } = input;
  if (has(shown, 'full-model')) return undefined;
  const floor = shown.length === 0 ? input.floorRung ?? 0 : 0;
  const allowed = (k: AssistanceKind) => RUNG[k] >= floor;
  const spans = model ? modelSpans(adapter, lang, goal, model.text) : new Map<string, ModelSpan>();
  const modelSource = model?.origin === 'learner-history' ? 'learner-history' as const : model?.origin === 'reading' ? 'reading' as const : 'catalog-model' as const;
  const modelRef = model?.sourceRef ? { textId: model.sourceRef.textId, sentenceId: model.sourceRef.sentenceId, title: model.sourceRef.title } : undefined;
  const fromModel = (s: Partial<StepDraft> & Pick<StepDraft, 'kind' | 'content'>): StepDraft => ({
    tier: TIER[s.kind], rung: RUNG[s.kind], revealedItemIds: [], source: modelSource, ...(model ? { review: model.review } : {}), ...(modelRef ? { sourceRef: modelRef } : {}), ...s,
  });
  const fromGoal = (s: Pick<StepDraft, 'kind' | 'content'> & Partial<StepDraft>): StepDraft => ({ tier: TIER[s.kind], rung: RUNG[s.kind], revealedItemIds: [], source: 'goal', ...s });
  const fullModel = (): StepDraft | undefined => model
    ? fromModel({ kind: 'full-model', content: model.note ? `${model.text}\n(${model.note})` : model.text,
      revealedItemIds: wordIndexes(parse(adapter, model.text)).map((i) => ids.form(lang, parse(adapter, model.text).tokens[i].normalized)) })
    : undefined;

  const meaningProblem = !last || !last.meaning.success || last.meaning.knownLanguageWords.length > 0;
  if (meaningProblem) {
    const polarity = last?.meaning.polarity ?? 'ok';
    const target = polarity !== 'ok' ? NEGATION : last?.meaning.missing[0] ?? goal.components.find((c) => !last?.meaning.covered.some((x) => x.concept === c.concept))?.concept ?? goal.components[0].concept;
    const english = englishOf(goal, target);
    if (!last && goal.question && allowed('restatement') && !has(shown, 'restatement')) {
      return fromGoal({ kind: 'restatement', content: `Think of it as your answer to: "${goal.question}"` });
    }
    if (last && allowed('conceptual-hint') && !has(shown, 'conceptual-hint', target)) {
      const n = goal.components.length;
      const missing = last.meaning.missing.length;
      const content = polarity === 'missing-negation' ? 'Your sentence says the opposite: the meaning is negative.'
        : polarity === 'unexpected-negation' ? 'Your sentence says the opposite: the meaning is not negative.'
        : last.meaning.knownLanguageWords.length > 0 && missing === 0 ? `Say every part in the language you are learning (you used ${last.meaning.knownLanguageWords.map((w) => `"${w}"`).join(', ')}).`
        : `Your sentence carries ${n - missing} of the ${n} ideas; ${missing === 1 ? 'one idea is' : `${missing} ideas are`} still missing.`;
      return fromGoal({ kind: 'conceptual-hint', concept: target, content });
    }
    if (allowed('english-cue') && !has(shown, 'english-cue', target)) {
      const content = polarity === 'unexpected-negation' ? 'Leave out the "not".' : target === NEGATION ? 'You need "not".' : `The missing idea is "${english}".`;
      return fromGoal({ kind: 'english-cue', concept: target, content });
    }
    const span = spans.get(target);
    const lexeme = target === NEGATION ? NEGATORS[lang][0] : lexemesFor(lang, target as ConceptId)[0];
    const word = span?.surface ?? lexeme;
    if (word && allowed('first-letter-cue') && !has(shown, 'first-letter-cue', target) && polarity !== 'unexpected-negation') {
      return { ...(span ? fromModel({ kind: 'first-letter-cue', content: '' }) : fromGoal({ kind: 'first-letter-cue', content: '' })), concept: target, content: `The word for "${english}" starts with "${firstGrapheme(word)}…".` };
    }
    if (word && allowed('lemma-supplied') && !has(shown, 'lemma-supplied', target) && polarity !== 'unexpected-negation') {
      let lemma = lexeme;
      if (span) {
        const p = parse(adapter, span.surface);
        lemma = bestCandidate(p.analyses[wordIndexes(p)[0]])?.lemma ?? lexeme ?? span.surface;
      }
      if (lemma) {
        const content = `The word for "${english}" comes from "${lemma}" (its dictionary form)${span && lemma !== span.surface ? '; use the form that fits your sentence' : ''}.`;
        return { ...(span ? fromModel({ kind: 'lemma-supplied', content }) : fromGoal({ kind: 'lemma-supplied', content })), concept: target, revealedItemIds: [ids.form(lang, adapter.normalize(lemma))] };
      }
    }
    const met = target === NEGATION ? undefined : input.metSentence?.(target);
    if (met && allowed('phrase-supplied') && !has(shown, 'phrase-supplied', target)) {
      return {
        kind: 'phrase-supplied', tier: TIER['phrase-supplied'], rung: RUNG['phrase-supplied'], concept: target, revealedItemIds: [met.itemId], source: 'reading',
        sourceRef: { textId: met.textId, sentenceId: met.sentenceId, title: met.title },
        content: `You have read it${met.scripture ? ' (Scripture, quoted exactly)' : ''}: "${met.excerpt}" — ${met.title}`,
      };
    }
    if (model && spans.size > 0 && !has(shown, 'sentence-frame')) {
      const frame = sentenceFrame(input);
      if (frame) return frame;
    }
    if (model && span && !has(shown, 'gap-completion', target)) {
      return fromModel({ kind: 'gap-completion', concept: target, content: blank(model.text, [span]),
        revealedItemIds: wordIndexes(parse(adapter, model.text)).map((i) => parse(adapter, model.text).tokens[i]).filter((t) => t.start < span.start || t.start >= span.end).map((t) => ids.form(lang, t.normalized)) });
    }
    if (model && span && target !== NEGATION && !has(shown, 'recognition-choice', target)) {
      const distractors = (CONFUSABLE[target as ConceptId] ?? []).map((c) => lexemesFor(lang, c)[0]).filter((w): w is string => !!w && w !== span.surface);
      const options = [...new Set([span.surface, ...distractors.slice(0, 2)])].sort((a, b) => a.localeCompare(b));
      if (options.length >= 2) {
        return fromModel({ kind: 'recognition-choice', concept: target, options, content: `${blank(model.text, [span])}\nWhich word fills the gap: ${options.join(' / ')}?` });
      }
    }
    return fullModel();
  }

  // the meaning came across: language problems, one finding at a time
  for (const f of last.language.findings) {
    const surface = last.text.slice(f.span[0], f.span[1]) || last.text;
    const key = `${f.code}:${surface}`;
    if (!has(shown, 'issue-flagged', key)) {
      return { kind: 'issue-flagged', tier: TIER['issue-flagged'], rung: RUNG['issue-flagged'], concept: key, revealedItemIds: [], source: 'checker',
        content: `Look again at "${surface}": ${taxonomyEntry(f.code).label}.` };
    }
    const kind: AssistanceKind = f.family === 'morphology' ? 'morphological-correction' : 'partial-correction';
    if (!has(shown, kind, key)) {
      const fix = f.fix ? `"${last.text.slice(f.fix.start, f.fix.end)}" → "${f.fix.replacement}". ` : '';
      const revealed = f.fix ? wordIndexes(parse(adapter, f.fix.replacement)).map((i) => ids.form(lang, parse(adapter, f.fix!.replacement).tokens[i].normalized)) : [];
      return { kind, tier: TIER[kind], rung: RUNG[kind], concept: key, revealedItemIds: revealed, source: 'checker', content: `${fix}${f.message}` };
    }
  }
  return last.language.findings.length > 0 ? fullModel() : undefined;
}

/** The shape of the model sentence with the words that carry the meaning left out. */
export function sentenceFrame(input: LadderInput): StepDraft | undefined {
  const { goal, lang, adapter, model } = input;
  if (!model) return undefined;
  const spans = modelSpans(adapter, lang, goal, model.text);
  const hidden = [...spans.entries()].filter(([k]) => k !== NEGATION).map(([, s]) => s);
  const content = blank(model.text, hidden);
  if (content === model.text) return undefined;
  const p = parse(adapter, model.text);
  const revealedItemIds = wordIndexes(p).map((i) => p.tokens[i]).filter((t) => !hidden.some((h) => t.start >= h.start && t.end <= h.end)).map((t) => ids.form(lang, t.normalized));
  return {
    kind: 'sentence-frame', tier: TIER['sentence-frame'], rung: RUNG['sentence-frame'], revealedItemIds,
    source: model.origin === 'learner-history' ? 'learner-history' : model.origin === 'reading' ? 'reading' : 'catalog-model', review: model.review,
    ...(model.sourceRef ? { sourceRef: { textId: model.sourceRef.textId, sentenceId: model.sourceRef.sentenceId, title: model.sourceRef.title } } : {}),
    content: `${content}\n(Fill each ___ with the words for: ${goal.components.map((c) => c.english).join(', ')}.)`,
  };
}

/** What the next hint would be, for the button label. */
export function previewNext(input: LadderInput): { kind: AssistanceKind; label: string } | undefined {
  const s = nextStep(input);
  return s ? { kind: s.kind, label: HINT_LABEL[s.kind] } : undefined;
}

/** True when the concept is a key term (used to word substitution feedback). */
export const isKeyTerm = (concept: string): boolean => !!CONCEPTS[concept as ConceptId]?.keyTerm;
