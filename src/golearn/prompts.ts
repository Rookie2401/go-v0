/**
 * Recall prompts for a finished text (engine package R3; COURSE-AUDIT-2026-10-07 §4.2 item 6, §4.6 item 17).
 *
 * "Understood" and the four-button report are self-reports. A prompt is a small, optional check that costs an answer: it is
 * generated from the text's OWN sentences and from what the learner's record says about the words in them, and nothing else.
 *
 *   cloze   one content word the learner knows only weakly (reading level `recognized_with_help` or `recognized`), blanked in its
 *           own sentence, with three choices: the word and two other content words of the same text (the same part of speech
 *           when the analysis gives one).
 *   yes/no  "Did this happen in the text?" Either a sentence the learner marked Understood (answer: yes) or a sentence that is
 *           NOT in the text (answer: no) — taken from another finished text of the same language when one is offered, else
 *           made by swapping two content words of an Understood sentence. Never made for Scripture.
 *
 * Pure and deterministic: the same sentences, the same levels and the same input always give the same prompts in the same
 * order (no clock, no randomness — a stable hash breaks every tie). The wording of the text is never altered: a cloze only
 * HIDES a word when showing the sentence, and a yes/no statement is either a sentence verbatim, another text's sentence
 * verbatim, or (outside Scripture) a swap that is shown as a statement to judge and never stored as text.
 *
 * Nothing here emits an event. What a correct cloze answer means for GoLearn is decided by the caller (the reader emits the
 * ordinary ComprehensionReported for that sentence); a yes/no answer records nothing.
 */
import type { LanguageCode, LearnerLevel, PartOfSpeech, Sentence, TextKind, Token } from '../core';

/** Reading levels that make a word "known but weak": met with help, or recognized once, and not yet shown rapidly or recalled. */
export const WEAK_LEVELS: readonly LearnerLevel[] = ['recognized_with_help', 'recognized'];
/** Parts of speech a prompt may ask about; a word the analysis could not tag counts as content (as in the coverage reports). */
const CONTENT_POS: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>(['NOUN', 'VERB', 'ADJ', 'ADV']);
/** The blank, shown instead of the hidden word. */
export const BLANK = '_____';

export interface PromptInput {
  textId: string;
  lang: LanguageCode;
  kind: TextKind;
  /** Live sentences, in reading order. */
  sentences: Sentence[];
  tokensBySentence: ReadonlyMap<string, readonly Token[]>;
  /** Part of speech by token id, where the analysis gives one. */
  pos?: ReadonlyMap<string, PartOfSpeech>;
  /** Reading level by FORM id (`Token.formId`). A form with no entry is not a candidate. */
  levels: ReadonlyMap<string, LearnerLevel | string>;
  /** Sentences the learner marked Understood (this sitting or any). */
  understood: ReadonlySet<string>;
  /** Sentences of OTHER finished texts of this language (verbatim), offered for the "not in this text" statement. */
  otherSentences?: readonly string[];
  /** Cloze prompts at most (default 2; 3 for Scripture, which has no yes/no). */
  maxCloze?: number;
  /** Fewest letters a blanked word has (default 4). */
  minLetters?: number;
}

export interface ClozePrompt {
  kind: 'cloze';
  id: string;
  sentenceId: string;
  tokenId: string;
  /** The sentence up to the blank, and after it; the blank itself is `BLANK`. */
  before: string;
  after: string;
  answer: string;
  /** Exactly three, the answer among them, in a fixed order. */
  choices: string[];
  level: LearnerLevel | string;
}

export interface YesNoPrompt {
  kind: 'yesno';
  id: string;
  /** The Understood sentence this prompt is made from (also the anchor of a statement taken from another text). */
  sentenceId: string;
  statement: string;
  /** True when the statement is a sentence of this text. */
  truth: boolean;
  origin: 'text' | 'other-text' | 'swapped';
}

export type RecallPrompt = ClozePrompt | YesNoPrompt;

/** FNV-1a, 32 bit: the only source of "random" choices in this file. */
export function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * Whether the yes/no of a text is the "not in this text" kind: one bit of the hash of its sentence ids. A HIGH bit: the low bit of
 * FNV-1a is only the parity of the bytes, which an id repeated in every sentence id cancels out.
 */
export function decidesNo(sentenceIds: readonly string[]): boolean {
  return ((stableHash(sentenceIds.join('|')) >>> 16) & 1) === 0;
}

const letterCount =(s: string): number => { let n = 0; for (const c of s) if (/[\p{L}\p{M}]/u.test(c)) n++; return n; };
const hasDigit = (s: string): boolean => /\p{N}/u.test(s);
const startsUpper = (s: string): boolean => { const c = [...s][0] ?? ''; return c !== '' && c !== c.toLowerCase() && c === c.toUpperCase(); };
const upperFirst = (s: string): string => { const a = [...s]; return a.length ? a[0].toUpperCase() + a.slice(1).join('') : s; };
const lowerFirst = (s: string): string => { const a = [...s]; return a.length ? a[0].toLowerCase() + a.slice(1).join('') : s; };
const words = (tokens: readonly Token[]): Token[] => tokens.filter((t) => t.isWord);

/** A name or a number is never asked about: by its tag, or (no tag) by a capital in the middle of a sentence, or by a digit. */
function isNameOrNumber(t: Token, pos: PartOfSpeech | undefined, first: boolean): boolean {
  if (pos === 'PROPN' || pos === 'NUM' || hasDigit(t.surface)) return true;
  if (pos === undefined && !first && startsUpper(t.surface)) return true;
  return false;
}
const isContent = (pos: PartOfSpeech | undefined): boolean => pos === undefined || CONTENT_POS.has(pos);

interface Candidate { token: Token; sentence: Sentence; pos?: PartOfSpeech; level: LearnerLevel | string; first: boolean }

/** The content words of the text a distractor may be drawn from (one entry per distinct normalized form). */
interface PoolWord { token: Token; pos?: PartOfSpeech; letters: number }

function firstWordId(tokens: readonly Token[]): string | undefined { return words(tokens)[0]?.id; }

function buildCloze(input: PromptInput, cand: Candidate, pool: PoolWord[]): ClozePrompt | undefined {
  const { token, sentence } = cand;
  const sentenceForms = new Set(words(input.tokensBySentence.get(sentence.id) ?? []).map((t) => t.normalized));
  const ranked = pool
    .filter((p) => p.token.normalized !== token.normalized && !sentenceForms.has(p.token.normalized))
    // the same part of speech when the answer has one; a word with no tag then cannot stand in for a tagged one
    .filter((p) => (cand.pos ? p.pos === cand.pos : true))
    .map((p) => ({ p, d: Math.abs([...p.token.surface].length - [...token.surface].length), h: stableHash(`${token.id}|${p.token.normalized}`) }))
    .sort((a, b) => a.d - b.d || a.h - b.h || (a.p.token.normalized < b.p.token.normalized ? -1 : 1));
  const chosen: string[] = [];
  const seen = new Set<string>([token.surface.toLowerCase()]);
  for (const { p } of ranked) {
    const shown = startsUpper(token.surface) ? upperFirst(p.token.surface) : lowerFirst(p.token.surface);
    if (seen.has(shown.toLowerCase())) continue;
    seen.add(shown.toLowerCase());
    chosen.push(shown);
    if (chosen.length === 2) break;
  }
  if (chosen.length < 2) return undefined;
  const id = `cloze:${token.id}`;
  const choices = [token.surface, ...chosen].sort((a, b) => stableHash(`${id}|${a}`) - stableHash(`${id}|${b}`) || (a < b ? -1 : 1));
  return {
    kind: 'cloze', id, sentenceId: sentence.id, tokenId: token.id,
    before: sentence.text.slice(0, token.start), after: sentence.text.slice(token.end),
    answer: token.surface, choices, level: cand.level,
  };
}

/** Up to `max` clozes, weakest level first, one per sentence, ties broken by hash. */
function clozes(input: PromptInput, max: number): ClozePrompt[] {
  const minLetters = input.minLetters ?? 4;
  const cands: Candidate[] = [];
  const pool: PoolWord[] = [];
  const pooled = new Set<string>();
  for (const sentence of input.sentences) {
    const tokens = input.tokensBySentence.get(sentence.id) ?? [];
    const ws = words(tokens);
    const firstId = firstWordId(tokens);
    const counts = new Map<string, number>();
    for (const t of ws) counts.set(t.normalized, (counts.get(t.normalized) ?? 0) + 1);
    for (const t of ws) {
      const pos = input.pos?.get(t.id);
      const first = t.id === firstId;
      if (isNameOrNumber(t, pos, first) || !isContent(pos)) continue;
      const letters = letterCount(t.surface);
      if (letters >= 3 && !pooled.has(t.normalized)) { pooled.add(t.normalized); pool.push({ token: t, pos, letters }); }
      const level = input.levels.get(t.formId);
      // a sentence needs some context around the blank, and a word that occurs twice in it would make the blank ambiguous
      if (!level || !WEAK_LEVELS.includes(level as LearnerLevel) || letters < minLetters || ws.length < 4 || (counts.get(t.normalized) ?? 0) > 1) continue;
      cands.push({ token: t, sentence, pos, level, first });
    }
  }
  const order = (c: Candidate) => WEAK_LEVELS.indexOf(c.level as LearnerLevel);
  cands.sort((a, b) => order(a) - order(b) || stableHash(`${input.textId}|${a.token.id}`) - stableHash(`${input.textId}|${b.token.id}`) || (a.token.id < b.token.id ? -1 : 1));
  const out: ClozePrompt[] = [];
  const usedSentences = new Set<string>();
  for (const c of cands) {
    if (out.length >= max) break;
    if (usedSentences.has(c.sentence.id)) continue;
    const p = buildCloze(input, c, pool);
    if (!p) continue;
    usedSentences.add(c.sentence.id);
    out.push(p);
  }
  return out;
}

const norm = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** A sentence of this text with two content words exchanged; undefined when it has no two that can change places. */
function swapped(input: PromptInput, sentence: Sentence): string | undefined {
  const tokens = input.tokensBySentence.get(sentence.id) ?? [];
  const ws = words(tokens);
  const firstId = ws[0]?.id;
  const usable = ws.filter((t) => {
    const pos = input.pos?.get(t.id);
    return t.id !== firstId && !isNameOrNumber(t, pos, false) && isContent(pos) && letterCount(t.surface) >= 3;
  });
  const pairs: Array<[Token, Token]> = [];
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i], b = usable[j];
      if (a.normalized === b.normalized || a.end > b.start) continue;
      const pa = input.pos?.get(a.id), pb = input.pos?.get(b.id);
      if (pa && pb && pa !== pb) continue; // two verbs change places, a verb and a noun do not
      pairs.push([a, b]);
    }
  }
  if (pairs.length === 0) return undefined;
  pairs.sort((x, y) => stableHash(`${sentence.id}|${x[0].id}|${x[1].id}`) - stableHash(`${sentence.id}|${y[0].id}|${y[1].id}`));
  const [a, b] = pairs[0];
  const t = sentence.text;
  const out = t.slice(0, a.start) + b.surface + t.slice(a.end, b.start) + a.surface + t.slice(b.end);
  return norm(out) === norm(t) ? undefined : out;
}

function yesNo(input: PromptInput): YesNoPrompt | undefined {
  const anchors = input.sentences
    .filter((s) => input.understood.has(s.id) && words(input.tokensBySentence.get(s.id) ?? []).length >= 3)
    .sort((a, b) => stableHash(`${input.textId}|yn|${a.id}`) - stableHash(`${input.textId}|yn|${b.id}`) || (a.id < b.id ? -1 : 1));
  if (anchors.length === 0) return undefined;
  const mine = new Set(input.sentences.map((s) => norm(s.text)));
  // alternate between "yes" and "no" statements deterministically, by the text's own sentence ids
  const wantNo = decidesNo(input.sentences.map((s) => s.id));
  if (wantNo) {
    const anchor = anchors[0];
    const len = [...anchor.text].length;
    const foreign = (input.otherSentences ?? [])
      .filter((x) => x.trim() !== '' && !mine.has(norm(x)))
      .map((x) => ({ x, d: Math.abs([...x].length - len), h: stableHash(`${anchor.id}|${x}`) }))
      .sort((a, b) => a.d - b.d || a.h - b.h || (a.x < b.x ? -1 : 1))[0];
    if (foreign) {
      return { kind: 'yesno', id: `yesno:${anchor.id}:no`, sentenceId: anchor.id, statement: foreign.x, truth: false, origin: 'other-text' };
    }
    // Scripture is never changed, so it never reaches here (see generatePrompts).
    for (const a of anchors) {
      const s = swapped(input, a);
      if (s) return { kind: 'yesno', id: `yesno:${a.id}:no`, sentenceId: a.id, statement: s, truth: false, origin: 'swapped' };
    }
  }
  const a = anchors[0];
  return { kind: 'yesno', id: `yesno:${a.id}:yes`, sentenceId: a.id, statement: a.text, truth: true, origin: 'text' };
}

/**
 * The prompts for one finished text: clozes first (weakest word first), then at most one yes/no (never for Scripture).
 * Empty when nothing qualifies: a text whose words are all new or all well known gets no questions.
 */
export function generatePrompts(input: PromptInput): RecallPrompt[] {
  const scripture = input.kind === 'scripture';
  const out: RecallPrompt[] = clozes(input, input.maxCloze ?? (scripture ? 3 : 2));
  if (!scripture) {
    const yn = yesNo(input);
    if (yn) out.push(yn);
  }
  return out;
}

/** The suggestion a set of answers makes for the four-button report: two misses suggest "Some". Never a report by itself. */
export function suggestedDegree(misses: number): 'some' | undefined {
  return misses >= 2 ? 'some' : undefined;
}
