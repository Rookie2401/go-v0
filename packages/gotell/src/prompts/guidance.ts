/**
 * Guidance for one prompt and one writer: what to try, what to watch for, which of the writer's own words may help.
 * It is built from the writer's record and the pack's grammar notes. It never contains a model paragraph, a model
 * sentence for the writer's content, or a template; the only sentences it can quote are the pack's own tutorial examples,
 * shown as a pattern.
 */
import type { WriterProfile, WritingPrompt } from '../types';
import type { GuidancePack, GuidancePattern } from './pack-source';

export type { GuidancePack, GuidancePattern } from './pack-source';

export interface Guidance {
  /** One sentence on what to try. */
  lead: string;
  /** At most three short suggestions. */
  suggestions: string[];
  /** The writer's weak constructions among the prompt's grammar targets. */
  watchFor: Array<{ constructionId: string; why: string }>;
  /** Familiar productive units that match the prompt's domains, when the pack can tell. */
  vocabulary: Array<{ unitId: string; label: string }>;
  honesty: string[];
}

const MAX_SUGGESTIONS = 3;
const MAX_WORDS = 3;

/** The label of a unit id such as `lemma:sq:shtëpi:NOUN`. */
export const unitLabelOf = (unitId: string): string => {
  const parts = unitId.split(':');
  return parts.length >= 3 && parts[2] ? parts[2] : unitId;
};

/**
 * The prompt-target keys a unit id stands for: `syntax:sq:negation-nuk` → negation-nuk; `morph:sq:NOUN:Case=Acc|Definite=Def|Number=Sing`
 * → Case, Definite, Number and the pack construction those features spell (definite-accusative-singular …).
 */
export function constructionKeysOf(unitId: string): string[] {
  const parts = unitId.split(':');
  if (parts[0] === 'syntax' && parts[2]) return [parts.slice(2).join(':')];
  if (parts[0] === 'morph' && parts.length >= 4) {
    const feats = Object.fromEntries(parts.slice(3).join(':').split('|').map((kv) => kv.split('=') as [string, string]).filter(([k, v]) => k && v));
    const keys = Object.keys(feats);
    if (feats.Definite === 'Def') {
      if (feats.Number === 'Plur') keys.push('definite-plural');
      else if (feats.Case === 'Acc') keys.push('definite-accusative-singular');
      else if (feats.Case === 'Nom') keys.push('definite-nominative-singular');
    }
    return keys;
  }
  return [];
}

/** The prompt's grammar targets that the writer's weak constructions touch, in the prompt's order. */
export function weakTargetsOf(prompt: WritingPrompt, profile: WriterProfile): string[] {
  const weak = new Set(profile.weakConstructions.flatMap(constructionKeysOf));
  return prompt.grammarTargets.filter((t) => weak.has(t));
}

function leadFor(level: WriterProfile['band']['level']): string {
  if (level === 'first-sentences') return 'Try two or three short sentences that answer the prompt, one idea in each.';
  if (level === 'short-paragraph') return 'Try a short paragraph of four to six sentences that stays on the prompt.';
  return 'Try a connected paragraph in which each sentence leads to the next.';
}

function pickPattern(prompt: WritingPrompt, patterns: GuidancePattern[]): GuidancePattern | undefined {
  if (!patterns.length) return undefined;
  const wantsDescribing = prompt.grammarTargets.includes('linking-article-adjective');
  return (wantsDescribing && patterns.find((p) => /est|describ/i.test(p.id))) || patterns[0];
}

function weakNote(watch: Guidance['watchFor']): string | undefined {
  if (!watch.length) return undefined;
  return `Your record shows more misses than hits on ${watch.map((w) => w.constructionId).join(', ')}; read those parts of your draft once more before you finish.`;
}

export function guidanceFor(prompt: WritingPrompt, profile: WriterProfile, pack: GuidancePack): Guidance {
  const targets = weakTargetsOf(prompt, profile);
  const watchFor = targets.map((constructionId) => {
    const note = pack.explainConstruction(constructionId) ?? pack.explainFeature(constructionId);
    return { constructionId, why: `Your own record shows more misses than hits here.${note ? ` The pack’s note (machine-drafted): ${note}` : ''}` };
  });

  const productive = profile.productive.filter((id) => id.startsWith('lemma:'));
  const domains = new Set(prompt.vocabularyDomains);
  const vocabulary = productive
    .filter((id) => (pack.unitDomains?.(id) ?? []).some((d) => domains.has(d)))
    .slice(0, MAX_WORDS)
    .map((unitId) => ({ unitId, label: unitLabelOf(unitId) }));

  const suggestions: string[] = [];
  const level = profile.band.level;
  if (level === 'first-sentences') {
    const pattern = pickPattern(prompt, pack.tutorialPatterns?.() ?? []);
    if (pattern) suggestions.push(`A pattern to try: ${pattern.title.toLowerCase()}. The pack’s own example is “${pattern.example}” (${pattern.gloss}); use the shape for your own content, not the words.`);
    const words = (vocabulary.length ? vocabulary.map((v) => v.label) : productive.slice(0, MAX_WORDS).map(unitLabelOf));
    suggestions.push(words.length
      ? `Words you have already used yourself: ${words.join(', ')}. Try to build a sentence with one or two of them.`
      : 'Your record has no words you have used yourself in this language yet. Start with one or two words you are sure of, and check the rest afterwards.');
    suggestions.push('Keep each sentence short and finish one idea before starting the next.');
  } else if (level === 'short-paragraph') {
    const note = weakNote(watchFor);
    suggestions.push(note ?? 'None of this prompt’s grammar targets has shown weakness in your record, so write freely and check the endings afterwards.');
    if (profile.recurringErrors.length) suggestions.push(`In earlier writing these kinds of issue recurred: ${profile.recurringErrors.slice(0, 3).join(', ')}. Read your draft once for those.`);
    suggestions.push('Open with one sentence that says what you are about to explain, then give two or three sentences of detail.');
  } else {
    suggestions.push('Link your sentences: say how each one follows from the last (addition, contrast, reason or result) rather than listing them. The pack has no verified list of linking words, so look any you are unsure of up in the dictionary.');
    suggestions.push('Choose who you are writing to (a friend, a host, a congregation) and keep the same register and form of address all the way through; the prompt’s cultural notes mention forms of address where they matter.');
    const note = weakNote(watchFor);
    if (note) suggestions.push(note);
  }

  return {
    lead: leadFor(level),
    suggestions: suggestions.slice(0, MAX_SUGGESTIONS),
    watchFor,
    vocabulary,
    honesty: [
      'These suggestions come from your own record and the pack’s machine-drafted grammar notes; nothing here is a model answer.',
      'The grammar notes have not been checked by a native speaker.',
      'Only words you have used yourself are listed as familiar; words you have only read are not counted.',
    ],
  };
}
