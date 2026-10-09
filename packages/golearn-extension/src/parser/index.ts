/**
 * Parser - applies the Albanian language adapter (the real one, bundled) to a selection and its permitted context and
 * returns a card model. Nothing here guesses: a word the pack does not know is reported as unknown, an unconfirmed
 * reading says so, the context kind is passed through, and confidence is the analyzer's own number.
 *
 * The sentence is tokenized whole (the adapter needs the neighbours: linking articles, short pronouns, particles);
 * the selected tokens are found by offsets. With no context the selection alone is tokenized and the card says so.
 */
import { sqAdapter } from '../../../../src/adapters/sq';
import type { AnalysisCandidate, AnalyzedToken, PhraseCandidate, RawToken } from '../../../../src/core';
import { hasLatinLetter, sentenceKeyOf, fnv1a64 } from '../text';
import type { Alternative, CardModel, CardProvenance, ContextReport, EvidenceLabel, LabelledField, PhraseNote, WordLine } from './cardModel';

export * from './cardModel';

export const PARSER_LANGUAGE = 'sq';
export const PACK_ID = `pack:sq:${sqAdapter.version}`;
/** Same threshold the engine uses to credit a lemma (src/golearn/policy.ts LEMMA_MIN_CONFIDENCE): below it, a form id. */
export const LEMMA_MIN_CONFIDENCE = 0.5;
const MAX_WORD_LINES = 12;
const MAX_ITEM_IDS = 12;

export interface ParseContext {
  kind: 'sentence' | 'fragment' | 'none';
  confidence: number;
  reason?: string;
  sentence?: string;
  selStart?: number;
  selEnd?: number;
  direction?: 'ltr' | 'rtl' | 'unknown';
  pageLanguage?: string;
}

export interface ParseInput { surface: string; context: ParseContext }

const LABELS: Record<LabelledField, EvidenceLabel> = {
  surface: 'fact', context: 'fact',
  lemma: 'analysis', pos: 'analysis', morphology: 'analysis', gloss: 'analysis', confidence: 'analysis', provenance: 'analysis',
  phrases: 'analysis', words: 'analysis', notes: 'analysis', basis: 'analysis', pronunciation: 'analysis',
};

const RANK: Record<CardProvenance, number> = { none: 0, rule: 1, lexicon: 2 };

const LIMITS = [
  'Word list only: there is no dictionary in this prototype.',
  'The word list and the rules are machine-drafted; no native speaker has checked them.',
];

export function parseSelection(input: ParseInput): CardModel {
  const surface = input.surface.normalize('NFC').trim();
  const ctx = input.context;

  // 1. decide the text to analyse and where the selection sits in it
  let text = surface;
  let selStart = 0;
  let selEnd = surface.length;
  let kind = ctx.kind;
  let selectionLocated = true;
  let reason = ctx.reason;
  if (kind !== 'none' && ctx.sentence) {
    const s = ctx.sentence.normalize('NFC');
    const given = ctx.selStart !== undefined && ctx.selEnd !== undefined && same(s.slice(ctx.selStart, ctx.selEnd), surface);
    if (given) { text = s; selStart = ctx.selStart!; selEnd = ctx.selEnd!; }
    else {
      const at = s.indexOf(surface);
      if (at >= 0) { text = s; selStart = at; selEnd = at + surface.length; }
      else { kind = 'none'; selectionLocated = false; reason = 'the selection was not found in the context text'; }
    }
  } else if (kind !== 'none') { kind = 'none'; reason ??= 'no context text was given'; }

  const tokens = surface ? sqAdapter.tokenize(text) : [];
  const analyses = surface ? sqAdapter.analyze(tokens) : [];
  const selected: number[] = [];
  tokens.forEach((t, i) => { if (t.isWord && t.start < selEnd && t.end > selStart) selected.push(i); });

  // 2. context report (a fragment's hash is not a sentence identity)
  const context: ContextReport = { kind, confidence: kind === 'none' ? 0 : clamp01(ctx.confidence), reason, selectionLocated, direction: ctx.direction };
  if (kind === 'sentence') { context.sentenceKey = sentenceKeyOf(text.trim()); context.sentenceChars = text.length; }
  if (kind === 'fragment') { context.fragmentKey = fnv1a64(text.trim()).slice(0, 12); context.sentenceChars = text.length; }

  const notes: string[] = [];
  if (kind === 'none') notes.push('No sentence context: the word was read alone, so neighbouring words could not help choose a reading.');
  else if (kind === 'fragment') notes.push('Only a fragment around the word was available, not a verified sentence: readings that depend on neighbours are less certain.');
  if (!hasLatinLetter(surface)) notes.push('This selection is not in Latin script: the Albanian word list does not apply to it.');
  const pl = ctx.pageLanguage?.toLowerCase();
  if (pl && !/^(sq|als|aln)(-|$)/.test(pl) && hasLatinLetter(surface)) notes.push(`The page declares its language as "${ctx.pageLanguage}"; the Albanian word list is applied only because it is the one pack in this prototype.`);

  const base = {
    languageId: PARSER_LANGUAGE, packId: PACK_ID, analyzerId: analyzerIdOf(analyses),
    surface, phrases: [] as PhraseNote[], words: [] as WordLine[], alternatives: [] as Alternative[], basis: [] as string[],
    pronunciation: [] as string[], unconfirmed: false, labels: LABELS, limits: LIMITS, context, tokenCount: selected.length,
  };

  if (!selected.length) {
    notes.push(surface ? 'No word was found in the selection (only punctuation or numerals).' : 'Nothing was selected.');
    return { ...base, confidence: 0, provenance: 'none', notes, itemIds: surface ? [formId(surface)] : [] };
  }

  // 3. per-word best readings
  const best = selected.map((i) => pick(analyses[i]));
  const lines: WordLine[] = selected.map((i, k) => lineOf(tokens[i], best[k]));
  const phrases = phrasesFor(tokens, analyses, selected);

  const sourceOf = (c: AnalysisCandidate | undefined) => {
    const src = c?.sourceId ? sqAdapter.sources?.[c.sourceId] : undefined;
    return src ? { id: src.id, label: src.label, reviewStatus: src.reviewStatus } : undefined;
  };

  // 4. the card itself
  let lemma: string | undefined; let pos: string | undefined; let gloss: string | undefined; let morphology: string | undefined;
  let confidence = 0; let provenance: CardProvenance = 'none'; let source; let unconfirmed = false;
  const basis: string[] = []; let pronunciation: string[] = []; const alternatives: Alternative[] = [];

  if (selected.length === 1) {
    const i = selected[0];
    const c = best[0];
    pronunciation = sqAdapter.pronunciation(tokens[i], analyses[i]).notes ?? [];
    if (selStart > tokens[i].start || selEnd < tokens[i].end) notes.push(`The selection is part of the word "${tokens[i].surface}"; the reading is for the whole word.`);
    if (c) {
      lemma = c.lemma; pos = c.pos; gloss = c.unconfirmed ? undefined : c.gloss;
      morphology = describe(c);
      confidence = clamp01(c.confidence);
      provenance = provenanceOf(c);
      unconfirmed = !!c.unconfirmed;
      source = sourceOf(c);
      for (const key of ['rule', 'context'] as const) { const v = c.notes?.[key]; if (typeof v === 'string' && v) basis.push(v); }
      if (c.unconfirmed) notes.push('Not in the word list: the lemma is a guess from the ending and no meaning is given.');
      if (typeof c.notes?.disputed === 'string') notes.push(`Sources disagree: ${c.notes.disputed}`);
      if (c.unit && c.unit.pieces.length > 1) notes.push(`Part of a unit with the neighbouring word: "${c.unit.display}".`);
      if (c.orthography) notes.push(`Spelling differs from today's standard (${c.orthography.modern}).`);
      if (c.varieties?.length) notes.push(`Variety: ${c.varieties.join(', ')}.`);
      for (const a of analyses[i].candidates) {
        if (a === c) continue;
        alternatives.push({ lemma: a.lemma, pos: a.pos, gloss: a.unconfirmed ? undefined : a.gloss, confidence: clamp01(a.confidence) });
      }
      if (alternatives.length) {
        const sameWord = alternatives.every((x) => x.lemma === c.lemma && x.pos === c.pos);
        const what = sameWord ? 'other form reading' : 'other reading';
        notes.push(`${alternatives.length} ${what}${alternatives.length > 1 ? 's' : ''} possible${kind === 'sentence' ? ' even with the sentence' : ''}; the one shown has the highest confidence.`);
      }
    } else {
      notes.push('Not an entry of the Albanian word list, and the rules found no reading: the word is unknown to this pack.');
    }
  } else {
    // several words: a phrase entry that covers the whole selection, else the weakest word sets the card
    const whole = phrases.find((p) => selected.every((i) => p.tokenIndexes.includes(i)));
    if (whole) {
      lemma = whole.display; gloss = whole.gloss; confidence = clamp01(whole.confidence); provenance = 'lexicon';
      notes.push(`Matches the phrase entry "${whole.display}" (${whole.kind}).`);
      basis.push('phrase list');
    } else {
      confidence = Math.min(...lines.map((l) => l.confidence));
      provenance = lines.reduce<CardProvenance>((m, l) => (RANK[l.provenance] < RANK[m] ? l.provenance : m), 'lexicon');
      notes.push(`${selected.length} words selected; no phrase entry covers them, so each word is shown on its own and the card takes its confidence from the weakest.`);
    }
    if (selected.length > MAX_WORD_LINES) notes.push(`Showing the first ${MAX_WORD_LINES} of ${selected.length} words.`);
  }

  const itemIds = itemIdsFor(selected, tokens, best, phrases, selected.length === 1);

  return {
    ...base, lemma, pos, morphology, gloss, confidence, provenance, source, unconfirmed,
    phrases: phrases.map((p) => ({ display: p.display, kind: p.kind, gloss: p.gloss, confidence: clamp01(p.confidence) })),
    words: selected.length > 1 ? lines.slice(0, MAX_WORD_LINES) : [],
    alternatives: alternatives.slice(0, 3), basis, notes, pronunciation, itemIds,
  };
}

// ───────────────────────────── internals ─────────────────────────────

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const same = (a: string, b: string): boolean => a.replace(/\s+/gu, ' ').trim() === b.replace(/\s+/gu, ' ').trim();
const formId = (surface: string): string => `form:${PARSER_LANGUAGE}:${sqAdapter.normalize(surface)}`;

function analyzerIdOf(a: AnalyzedToken[]): string { return a[0]?.analyzer ?? `adapter-sq@${sqAdapter.version}`; }

/** The reading with the highest confidence; ties keep the adapter's order (it already ordered by neighbours). */
function pick(a: AnalyzedToken | undefined): AnalysisCandidate | undefined {
  if (!a?.candidates.length) return undefined;
  return a.candidates.reduce((m, c) => (c.confidence > m.confidence ? c : m), a.candidates[0]);
}

function provenanceOf(c: AnalysisCandidate): CardProvenance {
  if (c.unconfirmed) return 'rule';
  if (c.origin === 'rule' || c.notes?.source === 'rule') return 'rule';
  return 'lexicon';
}

function describe(c: AnalysisCandidate): string | undefined {
  try {
    const line = sqAdapter.describeMorph?.(c.morph, c.pos);
    return line ? line : undefined;
  } catch { return undefined; }
}

function lineOf(t: RawToken, c: AnalysisCandidate | undefined): WordLine {
  return {
    surface: t.surface, lemma: c?.lemma, pos: c?.pos, gloss: c && !c.unconfirmed ? c.gloss : undefined,
    confidence: c ? clamp01(c.confidence) : 0, provenance: c ? provenanceOf(c) : 'none',
  };
}

function phrasesFor(tokens: RawToken[], analyses: AnalyzedToken[], selected: number[]): PhraseCandidate[] {
  try {
    const set = new Set(selected);
    return sqAdapter.detectPhrases(tokens, analyses).filter((p) => p.tokenIndexes.some((i) => set.has(i)));
  } catch { return []; }
}

function itemIdsFor(selected: number[], tokens: RawToken[], best: Array<AnalysisCandidate | undefined>, phrases: PhraseCandidate[], single: boolean): string[] {
  const ids: string[] = [];
  selected.slice(0, MAX_ITEM_IDS).forEach((i, k) => {
    const c = best[k];
    const creditable = c?.lemma && !c.unconfirmed && c.confidence >= LEMMA_MIN_CONFIDENCE;
    ids.push(creditable ? `lemma:${PARSER_LANGUAGE}:${c!.lemma}${c!.pos ? ':' + c!.pos : ''}` : formId(tokens[i].surface));
  });
  if (!single) for (const p of phrases) if (p.pattern?.length) ids.push(`phrase:${PARSER_LANGUAGE}:${p.pattern.join('_')}`);
  return [...new Set(ids)];
}
