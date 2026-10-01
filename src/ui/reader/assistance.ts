/**
 * Assistance helpers for the reader (pure): which layers a word sheet offers and in what order, whether a layer has
 * anything to show for the word in front of the learner, which notes are visible, and how a clause-structure note
 * lays its labelled spans over the sentence's own text.
 *
 * The profile comes from the course catalogue (`catalog.assistanceFor`). A course without a ladder gets
 * DEFAULT_ASSISTANCE, and the reader then keeps its original behaviour exactly (see `isLegacyProfile`).
 */
import { DEFAULT_ASSISTANCE, LAYER_ASSISTANCE_LEVEL, REVIEW_OK } from '../../core';
import type { AssistanceLevel, AssistanceProfile, ContentNote, HelpLayer, RegisterTag, TokenAnalysis, TokenSupport } from '../../core';

/** The profile of a course without a ladder: the reader looks and behaves exactly as it always did. */
export function isLegacyProfile(profile: AssistanceProfile): boolean {
  return profile === DEFAULT_ASSISTANCE || JSON.stringify(profile) === JSON.stringify(DEFAULT_ASSISTANCE);
}

export interface LayerPlan {
  /** Shown on the first tap: always the gloss, and the decoding with it when the stage says decoding comes first. */
  base: HelpLayer[];
  /** What "more help" walks through, in order. English is always the last step that is not the learner's own record. */
  steps: HelpLayer[];
}

/**
 * The layers of a profile in the order the sheet offers them. English is never removed: it is added when a profile
 * forgets it, and moved by `englishRescue` — `easy` keeps the profile's own position, `secondary` puts it after the
 * target-language layers, `deep` and `on-request` put it last of all.
 */
export function planLayers(profile: AssistanceProfile): LayerPlan {
  const legacy = isLegacyProfile(profile);
  let layers = [...new Set(profile.layers)].filter((l) => l !== 'gloss');
  if (legacy) layers = layers.filter((l) => l !== 'history'); // today's sheet shows the learner's record inside the grammar layer
  if (!layers.includes('english')) layers.push('english');
  if (!legacy && profile.englishRescue !== 'easy') {
    layers = layers.filter((l) => l !== 'english');
    if (profile.englishRescue === 'secondary') {
      let at = layers.length;
      while (at > 0 && layers[at - 1] === 'history') at--;
      layers.splice(at, 0, 'english');
    } else {
      layers.push('english');
    }
  }
  const base: HelpLayer[] = ['gloss'];
  if (!legacy && profile.decodingFirst && layers.includes('decoding')) base.push('decoding');
  return { base, steps: layers.filter((l) => !base.includes(l)) };
}

/** Whether English sits behind the reader's own menu (the per-sentence English buttons) instead of beside every sentence. */
export const englishBehindMenu = (profile: AssistanceProfile): boolean =>
  !isLegacyProfile(profile) && (profile.englishRescue === 'deep' || profile.englishRescue === 'on-request');

// ───────────────────────────── supports ─────────────────────────────

/** Latest defined value for a field, searching from the highest level down (levels return only what they need). */
export function pick<K extends keyof TokenSupport>(supports: Partial<Record<number, TokenSupport>>, key: K): TokenSupport[K] | undefined {
  for (let l = 5; l >= 1; l--) {
    const v = supports[l]?.[key];
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    return v;
  }
  return undefined;
}

// ───────────────────────────── what a layer has to show ─────────────────────────────

export interface LayerFacts {
  analysis?: TokenAnalysis;
  phrases: number;
  patterns: number;
  morphologyLine?: string;
  /** The adapter can decode this script at all (or the analysis carries a decoding). */
  canDecode: boolean;
  explanation?: string;
  /** Notes visible for this sentence, split the way the sheet shows them. */
  notes: ContentNote[];
  /** Clause-structure notes whose spans fit the sentence (see `hasClauseSpans`). */
  clauseNotes: ContentNote[];
  history: string[];
}

const DISCOURSE_ROLE = /particle|marker|connective|conjunction|discourse/i;
export const isDiscourseRole = (role?: string): boolean => !!role && DISCOURSE_ROLE.test(role);

/** Whether opening this layer would show the learner something about THIS word. English is always worth opening. */
export function layerHasContent(layer: HelpLayer, f: LayerFacts): boolean {
  switch (layer) {
    case 'gloss': return true;
    case 'english': return true;
    case 'decoding': return f.canDecode;
    case 'phrase': return f.phrases > 0;
    case 'grammar': return f.patterns > 0 || !!f.morphologyLine;
    case 'definition': return !!f.analysis?.definition;
    case 'discourse': return isDiscourseRole(f.analysis?.role);
    case 'note': return f.notes.length > 0;
    case 'clause-structure': return f.clauseNotes.length > 0;
    case 'sentence': return !!f.explanation;
    case 'history': return f.history.length > 0;
  }
}

/** The step "more help" opens next: the first layer after those already opened that has something to show. */
export function nextLayer(steps: HelpLayer[], opened: HelpLayer[], f: LayerFacts): HelpLayer | undefined {
  const last = Math.max(-1, ...opened.map((l) => steps.indexOf(l)));
  return steps.slice(last + 1).find((l) => layerHasContent(l, f));
}

export const MORE_LABEL: Record<HelpLayer, string> = {
  gloss: 'Show meaning',
  decoding: 'Show how it is read',
  phrase: 'Show phrases',
  grammar: 'Show grammar',
  definition: 'Show a simple definition',
  discourse: 'Show what it does here',
  'clause-structure': 'Show sentence structure',
  note: 'Show notes',
  sentence: 'Explain this sentence',
  english: 'Show English',
  history: 'Show your history with this word',
};

// ───────────────────────────── varieties ─────────────────────────────

const VARIETY_LINE: Partial<Record<RegisterTag, string>> = {
  colloquial: 'Spoken, informal word',
  formal: 'Formal word',
  literary: 'Older literary word',
  archaic: 'Older literary word',
  historical: 'Historical word, not used today',
  royal: 'Royal vocabulary',
  religious: 'Religious vocabulary',
  'regional-isan': 'Isan regional word — not ordinary Central Thai',
  'regional-north': 'Northern regional word — not ordinary Central Thai',
  'regional-south': 'Southern regional word — not ordinary Central Thai',
  teochew: 'Teochew word — not ordinary Central Thai',
  'child-directed': 'Word used when speaking to children',
  slang: 'Slang',
};

/** One line naming the variety of a word, or undefined when it is ordinary standard usage (or says nothing). */
export function varietyLine(register?: RegisterTag[]): string | undefined {
  const lines = [...new Set((register ?? []).filter((r) => r !== 'standard').map((r) => VARIETY_LINE[r]).filter((l): l is string => !!l))];
  return lines.length ? lines.join(' · ') : undefined;
}

/** What a role means for the learner, in plain words ("softening particle", "classifier"). */
export const roleText = (role: string): string => role.replace(/[-_]+/g, ' ');

// ───────────────────────────── notes ─────────────────────────────

export const NOTE_KIND_LABEL: Record<ContentNote['kind'], string> = {
  cultural: 'Cultural note',
  regional: 'Regional note',
  register: 'Note on register',
  literary: 'Literary note',
  historical: 'Historical note',
  'clause-structure': 'Sentence structure',
};

/**
 * The notes the learner may see. A rejected note never; a note a person wrote or reviewed yes; a machine note nobody
 * has reviewed only in preview mode, where it says so.
 */
export function visibleNotes(notes: readonly ContentNote[], sentenceId: string, preview: boolean): ContentNote[] {
  return notes.filter((n) =>
    n.sentenceId === sentenceId && n.reviewStatus !== 'rejected'
    && (REVIEW_OK.includes(n.reviewStatus) || n.provenance !== 'machine' || preview));
}

export const noteIsReviewed = (n: ContentNote): boolean => REVIEW_OK.includes(n.reviewStatus);

export interface ClauseSegment { text: string; label?: string }

/**
 * The sentence's own text cut at the note's labelled spans. Concatenating the segments always gives the sentence back
 * byte for byte; spans that are out of range or overlap an earlier span are ignored, never "fixed".
 */
export function clauseSegments(text: string, spans: ContentNote['spans']): ClauseSegment[] {
  const out: ClauseSegment[] = [];
  let cursor = 0;
  const sorted = [...(spans ?? [])].sort((a, b) => a.start - b.start || a.end - b.end);
  for (const s of sorted) {
    if (!Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start < cursor || s.end <= s.start || s.end > text.length) continue;
    if (s.start > cursor) out.push({ text: text.slice(cursor, s.start) });
    out.push({ text: text.slice(s.start, s.end), label: s.label });
    cursor = s.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out.length ? out : [{ text }];
}

/** Whether a clause-structure note has at least one span that fits the sentence. */
export const hasClauseSpans = (text: string, spans: ContentNote['spans']): boolean => clauseSegments(text, spans).some((s) => !!s.label);

/** The highest assistance level among the opened layers (at least 1: the gloss is always open). */
export const maxLevel = (opened: readonly HelpLayer[]): AssistanceLevel =>
  Math.max(1, ...opened.map((l) => LAYER_ASSISTANCE_LEVEL[l])) as AssistanceLevel;
