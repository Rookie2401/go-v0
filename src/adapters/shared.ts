/**
 * Shared helpers for the five language adapters: Intl.Segmenter tokenization with exact offsets,
 * sentence splitting, a tiny-lexicon engine, a rule matcher for phrases, and the speech-normalization
 * skeleton. Nothing here knows about a particular language's grammar.
 *
 * Rules honoured everywhere: tokenization never uses `split(' ')`; every token's [start,end) slices the
 * exact input string; unknown words yield NO candidates (uncertainty, not a guess).
 */
import type {
  AnalysisCandidate, AnalyzedToken, PartOfSpeech, PhraseCandidate, RawToken, Span,
  SpeechNormalizationResult, TransformationRecord,
} from '../core';

/**
 * Speech-normalization records carry no wall-clock time so the result is deterministic.
 * TODO(integration): GoListen may restamp `at` when it persists these into AudioSegment.speechNormalization.
 */
export const DETERMINISTIC_AT = '1970-01-01T00:00:00.000Z';

export const nfc = (s: string): string => s.normalize('NFC');

// ───────────────────────────── tokenization ─────────────────────────────

const SKIP_SEGMENT = /^[\s​﻿]+$/u;

/**
 * Word tokenizer on Intl.Segmenter. Whitespace is dropped, punctuation and numerals are kept as
 * non-word tokens, every token slices the input exactly. `compounds` lists words that the ICU dictionary
 * splits but the course treats as one lexical unit (e.g. Thai นิรันดร์); they are re-joined when the
 * segmenter's parts match, offsets stay exact.
 */
export function makeWordTokenizer(cfg: { locale: string; normalize: (s: string) => string; compounds?: string[] }) {
  const seg = new Intl.Segmenter(cfg.locale, { granularity: 'word' });
  const compoundParts = new Map<string, string[][]>();
  for (const c of cfg.compounds ?? []) {
    const parts = [...seg.segment(c)].map((x) => x.segment);
    if (parts.length < 2) continue;
    const list = compoundParts.get(parts[0]) ?? [];
    list.push(parts);
    compoundParts.set(parts[0], list);
  }
  for (const list of compoundParts.values()) list.sort((a, b) => b.length - a.length);

  return (text: string): RawToken[] => {
    const segs = [...seg.segment(text)];
    const out: RawToken[] = [];
    for (let i = 0; i < segs.length; ) {
      const s = segs[i];
      if (SKIP_SEGMENT.test(s.segment)) { i++; continue; }
      let take = 1;
      const cands = compoundParts.get(s.segment);
      if (cands) {
        for (const parts of cands) {
          if (parts.every((p, k) => segs[i + k]?.segment === p)) { take = parts.length; break; }
        }
      }
      const last = segs[i + take - 1];
      const start = s.index;
      const end = last.index + last.segment.length;
      const surface = text.slice(start, end);
      const isWord = segs.slice(i, i + take).some((x) => x.isWordLike === true) && /\p{L}/u.test(surface);
      out.push({ surface, start, end, isWord, normalized: cfg.normalize(surface) });
      i += take;
    }
    return out;
  };
}

// ───────────────────────────── sentence splitting ─────────────────────────────

export interface SplitConfig {
  /** Characters that can end a sentence. */
  terminators: string;
  /** Lower-case abbreviations (without the dot) after which a full stop does not end a sentence. */
  abbreviations?: string[];
  /** German-style ordinals: "am 3. Mai" — a digit followed by "." never ends a sentence. */
  ordinalDot?: boolean;
}

/** Terminator-based splitter for Latin and Devanagari text. Spans are trimmed slices of `text`. */
export function splitSentences(text: string, cfg: SplitConfig): Span[] {
  const abbr = new Set((cfg.abbreviations ?? []).map((a) => a.toLowerCase()));
  const spans: Span[] = [];
  const closers = new Set(['"', "'", '»', '”', '’', ')', ']', '›', '«', '“']);
  let start = 0;
  const push = (from: number, to: number) => {
    let a = from;
    let b = to;
    while (a < b && /\s/u.test(text[a])) a++;
    while (b > a && /\s/u.test(text[b - 1])) b--;
    if (b > a) spans.push({ start: a, end: b, text: text.slice(a, b) });
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') {
      let j = i;
      while (j < text.length && (text[j] === '\n' || text[j] === '\r')) j++;
      push(start, i);
      start = j;
      i = j;
      continue;
    }
    if (cfg.terminators.includes(ch)) {
      let j = i;
      while (j < text.length && cfg.terminators.includes(text[j])) j++;
      const run = text.slice(i, j);
      let k = j;
      while (k < text.length && closers.has(text[k])) k++;
      const atEnd = k >= text.length;
      const followedBySpace = atEnd || /\s/u.test(text[k]);
      let isBreak = followedBySpace;
      if (isBreak && run === '.' && !atEnd) {
        const before = text.slice(start, i);
        const m = /([\p{L}\p{N}]+)$/u.exec(before);
        const prevWord = m ? m[1].toLowerCase() : '';
        if (prevWord && (abbr.has(prevWord) || (prevWord.length === 1 && /\p{L}/u.test(prevWord)))) isBreak = false;
        if (cfg.ordinalDot && /^\d+$/.test(prevWord)) isBreak = false;
        if (isBreak) {
          let n = k;
          while (n < text.length && /\s/u.test(text[n])) n++;
          if (n < text.length && /\p{Ll}/u.test(text[n])) isBreak = false; // "etc. y" — continues in lower case
        }
      }
      if (isBreak) {
        push(start, k);
        start = k;
      }
      i = k > i ? k : i + 1;
      continue;
    }
    i++;
  }
  push(start, text.length);
  return spans;
}

// ───────────────────────────── morphology tags & lexicon ─────────────────────────────

const TAGS: Record<string, Record<string, string>> = {
  '1s': { Person: '1', Number: 'Sing' }, '2s': { Person: '2', Number: 'Sing' }, '3s': { Person: '3', Number: 'Sing' },
  '1p': { Person: '1', Number: 'Plur' }, '2p': { Person: '2', Number: 'Plur' }, '3p': { Person: '3', Number: 'Plur' },
  sg: { Number: 'Sing' }, pl: { Number: 'Plur' },
  m: { Gender: 'Masc' }, f: { Gender: 'Fem' }, n: { Gender: 'Neut' },
  nom: { Case: 'Nom' }, acc: { Case: 'Acc' }, dat: { Case: 'Dat' }, gen: { Case: 'Gen' }, abl: { Case: 'Abl' }, obl: { Case: 'Obl' }, dir: { Case: 'Dir' },
  pres: { Tense: 'Pres', Mood: 'Ind' }, impf: { Tense: 'Imp', Mood: 'Ind' }, pret: { Tense: 'Past', Aspect: 'Perf', Mood: 'Ind' },
  past: { Tense: 'Past', Mood: 'Ind' }, subj: { Mood: 'Sub' }, fsub: { Mood: 'Sub', Tense: 'Fut' }, imper: { Mood: 'Imp' },
  inf: { VerbForm: 'Inf' }, ptcp: { VerbForm: 'Part' }, ger: { VerbForm: 'Ger' },
  ipfv: { Aspect: 'Imp' }, pfv: { Aspect: 'Perf' }, hab: { Aspect: 'Hab' },
  def: { Definite: 'Def' }, indef: { Definite: 'Ind' }, art: { PronType: 'Art' }, poss: { Poss: 'Yes' }, neg: { Polarity: 'Neg' },
  dem: { PronType: 'Dem' }, rel: { PronType: 'Rel' }, int: { PronType: 'Int' }, prs: { PronType: 'Prs' },
};

function addMorph(into: Record<string, string>, key: string, value: string) {
  const cur = into[key];
  if (cur === undefined) { into[key] = value; return; }
  const set = new Set([...cur.split(','), ...value.split(',')]);
  into[key] = [...set].sort().join(',');
}

/** "1s pres" → {Person:"1",Number:"Sing",Tense:"Pres",Mood:"Ind"}; "K=V" passes through; repeated keys union ("nom acc"). */
export function morph(tags: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tags.split(/\s+/).filter(Boolean)) {
    const eq = t.indexOf('=');
    if (eq > 0) { addMorph(out, t.slice(0, eq), t.slice(eq + 1)); continue; }
    const m = TAGS[t];
    if (!m) throw new Error(`unknown morph tag "${t}"`);
    for (const [k, v] of Object.entries(m)) addMorph(out, k, v);
  }
  return out;
}

export function mergeMorphs(list: Array<Record<string, string>>): { morph: Record<string, string>; ambiguous: boolean } {
  const out: Record<string, string> = {};
  let ambiguous = false;
  const keys = new Set(list.flatMap((m) => Object.keys(m)));
  for (const k of keys) {
    const present = list.map((m) => m[k]).filter((v): v is string => v !== undefined);
    const set = new Set(present.flatMap((v) => v.split(',')));
    out[k] = [...set].sort().join(',');
    // a feature is ambiguous when readings disagree, or only some readings carry it
    if (set.size > 1 || present.length < list.length) ambiguous = true;
  }
  return { morph: out, ambiguous };
}

export interface LexForm { form: string; morph: Record<string, string>; notes?: Record<string, string | string[]> }
export interface LexEntry {
  lemma: string;
  pos: PartOfSpeech;
  gloss: string;
  forms: LexForm[];
  /** Romanization shown in the support panel — only where the course authors supplied one. */
  translit?: string;
  notes?: Record<string, string | string[]>;
}

/**
 * Entry constructor. `forms` are "surface:tags" strings (see `morph`); a bare surface means "no features".
 * Put frequent lemmas first: earlier entries win ties when a surface is ambiguous.
 */
export function E(
  lemma: string,
  pos: PartOfSpeech,
  gloss: string,
  forms: string[] = [lemma],
  extra: { translit?: string; notes?: Record<string, string | string[]> } = {},
): LexEntry {
  return {
    lemma, pos, gloss, translit: extra.translit, notes: extra.notes,
    forms: forms.map((f) => {
      const c = f.indexOf(':');
      return c < 0 ? { form: f, morph: {} } : { form: f.slice(0, c), morph: morph(f.slice(c + 1)) };
    }),
  };
}

export interface LexHit { entry: LexEntry; form: LexForm; order: number }

export class Lexicon {
  readonly entries: LexEntry[];
  private readonly byForm = new Map<string, LexHit[]>();
  private readonly byLemmaKey = new Map<string, LexEntry[]>();
  private readonly lemmaOf = new Map<string, Set<string>>();

  constructor(entries: LexEntry[], normalizeFn: (s: string) => string) {
    this.entries = entries;
    entries.forEach((entry, order) => {
      const list = this.byLemmaKey.get(entry.lemma) ?? [];
      list.push(entry);
      this.byLemmaKey.set(entry.lemma, list);
      for (const form of entry.forms) {
        const key = normalizeFn(form.form);
        const hits = this.byForm.get(key) ?? [];
        hits.push({ entry, form, order });
        this.byForm.set(key, hits);
        const lemmas = this.lemmaOf.get(key) ?? new Set();
        lemmas.add(entry.lemma);
        this.lemmaOf.set(key, lemmas);
      }
    });
  }

  lookup(normalized: string): LexHit[] { return this.byForm.get(normalized) ?? []; }
  has(normalized: string): boolean { return this.byForm.has(normalized); }
  find(lemma: string, pos?: PartOfSpeech): LexEntry | undefined {
    return (this.byLemmaKey.get(lemma) ?? []).find((e) => !pos || e.pos === pos);
  }
  lemmasOf(normalized: string): string[] { return [...(this.lemmaOf.get(normalized) ?? [])]; }

  /** The form of `entry` whose morph contains every given feature value (values may be unions). */
  formWith(entry: LexEntry, want: Record<string, string>): LexForm | undefined {
    return entry.forms.find((f) => Object.entries(want).every(([k, v]) => (f.morph[k] ?? '').split(',').includes(v) && f.morph[k] !== undefined));
  }

  /** Group hits by entry → candidates. Lexicon-certain identities are confident; ambiguity lowers confidence. */
  toCandidates(hits: LexHit[], baseNotes: Record<string, string | string[]> = {}): AnalysisCandidate[] {
    const groups = new Map<LexEntry, LexHit[]>();
    for (const h of [...hits].sort((a, b) => a.order - b.order)) {
      const g = groups.get(h.entry) ?? [];
      g.push(h);
      groups.set(h.entry, g);
    }
    const single = groups.size === 1;
    const out: AnalysisCandidate[] = [];
    for (const [entry, g] of groups) {
      const { morph: m, ambiguous } = mergeMorphs(g.map((h) => h.form.morph));
      const notes: Record<string, string | string[]> = { ...baseNotes, ...(entry.notes ?? {}) };
      for (const h of g) Object.assign(notes, h.form.notes ?? {});
      if (entry.translit) notes.translit = entry.translit;
      out.push({
        lemma: entry.lemma, pos: entry.pos, morph: m,
        notes: Object.keys(notes).length ? notes : undefined,
        confidence: single ? (ambiguous && g.length > 1 ? 0.8 : 0.92) : 0.55,
        gloss: entry.gloss,
      });
    }
    return out;
  }
}

export interface AnalyzeHooks {
  /** Candidates for a word the lexicon does not know (rule-based, honest confidence) — default none. */
  unknown?: (token: RawToken, i: number, tokens: RawToken[], lex: Lexicon) => AnalysisCandidate[];
  /** Adjust/reorder candidates using neighbours' first-pass analyses. */
  contextual?: (i: number, tokens: RawToken[], base: AnalysisCandidate[][], lex: Lexicon) => AnalysisCandidate[];
}

export function lexiconAnalyze(tokens: RawToken[], lex: Lexicon, analyzer: string, hooks: AnalyzeHooks = {}): AnalyzedToken[] {
  const base: AnalysisCandidate[][] = tokens.map((t, i) => {
    if (!t.isWord) return [];
    const c = lex.toCandidates(lex.lookup(t.normalized));
    if (c.length) return c;
    return hooks.unknown ? hooks.unknown(t, i, tokens, lex) : [];
  });
  return tokens.map((t, i) => {
    const cands = t.isWord && hooks.contextual ? hooks.contextual(i, tokens, base, lex) : base[i];
    return { token: t, candidates: cands, analyzer };
  });
}

export const hasPos = (a: AnalyzedToken | undefined, ...pos: PartOfSpeech[]): boolean => !!a && a.candidates.some((c) => c.pos !== undefined && pos.includes(c.pos));
export const hasLemma = (a: AnalyzedToken | undefined, ...lemmas: string[]): boolean => !!a && a.candidates.some((c) => c.lemma !== undefined && lemmas.includes(c.lemma));
// ───────────────────────────── phrase / pattern rules ─────────────────────────────

export type PhraseItem =
  | string // a normalized form or a lemma
  | string[] // any of
  | { slot: true; pos?: PartOfSpeech[] } // captured, any (matching) word
  | { gap: number; only?: PartOfSpeech[] }; // skip 0..n tokens (each token must have a POS in `only` when given)

export interface PhraseRule {
  pattern: string[];
  display: string;
  gloss: string;
  kind: PhraseCandidate['kind'];
  /** Alternative surface orders that express the same phrase (they share `pattern`, hence one learner item). */
  variants: PhraseItem[][];
  confidence?: number;
}

/** Match phrase rules against a sentence. Confidence drops 0.05 per skipped token (floor 0.5). */
export function matchPhraseRules(
  tokens: RawToken[],
  analyses: AnalyzedToken[],
  rules: PhraseRule[],
  normalize: (s: string) => string,
): PhraseCandidate[] {
  const out: PhraseCandidate[] = [];
  const seen = new Set<string>();

  const tokenMatches = (item: string | string[], i: number): boolean => {
    const t = tokens[i];
    if (!t?.isWord) return false;
    const items = Array.isArray(item) ? item : [item];
    return items.some((it) => t.normalized === normalize(it) || analyses[i]?.candidates.some((c) => c.lemma === it));
  };

  for (const rule of rules) {
    for (const variant of rule.variants) {
      const attempt = (idx: number, pos: number, matched: number[], skipped: number): void => {
        if (idx === variant.length) {
          const key = `${rule.pattern.join('_')}|${matched.join(',')}`;
          if (seen.has(key)) return;
          seen.add(key);
          out.push({
            pattern: rule.pattern, display: rule.display, kind: rule.kind, gloss: rule.gloss,
            tokenIndexes: [...matched],
            confidence: Math.max(0.5, (rule.confidence ?? 0.9) - 0.05 * skipped),
          });
          return;
        }
        const item = variant[idx];
        if (typeof item === 'object' && !Array.isArray(item) && 'gap' in item) {
          for (let k = 0; k <= item.gap; k++) {
            let ok = true;
            for (let s = 0; s < k; s++) {
              const a = analyses[pos + s];
              if (!tokens[pos + s]) { ok = false; break; }
              if (item.only && !(tokens[pos + s].isWord && hasPos(a, ...item.only))) { ok = false; break; }
            }
            if (!ok) break;
            attempt(idx + 1, pos + k, matched, skipped + k);
          }
          return;
        }
        if (pos >= tokens.length) return;
        if (typeof item === 'object' && !Array.isArray(item)) {
          if (!tokens[pos].isWord) return;
          if (item.pos && !hasPos(analyses[pos], ...item.pos)) return;
          attempt(idx + 1, pos + 1, [...matched, pos], skipped);
          return;
        }
        if (tokenMatches(item, pos)) attempt(idx + 1, pos + 1, [...matched, pos], skipped);
      };
      const first = variant[0];
      if (typeof first === 'object' && !Array.isArray(first) && 'gap' in first) throw new Error('phrase rule cannot start with a gap');
      for (let start = 0; start < tokens.length; start++) attempt(0, start, [], 0);
    }
  }
  // one occurrence per phrase per ending token: keep the earliest start (e.g. the finite verb, not its particle)
  const best = new Map<string, PhraseCandidate>();
  for (const c of out) {
    const key = c.pattern.join('_') + '|' + c.tokenIndexes[c.tokenIndexes.length - 1];
    const cur = best.get(key);
    if (!cur || c.tokenIndexes[0] < cur.tokenIndexes[0]) best.set(key, c);
  }
  return [...best.values()].sort((a, b) => a.tokenIndexes[0] - b.tokenIndexes[0] || a.pattern.join('_').localeCompare(b.pattern.join('_')));
}

// ───────────────────────────── speech normalization ─────────────────────────────

const VERSE_BRACKET = /\[\s*\d+(?:\s*[-–,]\s*\d+)*\s*\]/gu;
const VERSE_SUP_TAG = /<sup>\s*\d+\s*<\/sup>/giu;
const VERSE_SUPERSCRIPT = /[²³¹⁰⁴-⁹]+/gu;

export interface SpeechConfig {
  tool: string; // "speech-es@1"
  /** Integer → spoken words; return null when out of the supported range (digits are then left alone). */
  numberToWords: (n: number) => string | null;
  abbreviations?: Array<{ pattern: RegExp; replacement: string; label: string }>;
  percentWord?: string; // "por ciento"
  nativeDigits?: string; // ten characters 0..9 in the native script, e.g. "०१२३४५६७८९"
  /** German writes "3." for ordinals; do not expand those. */
  skipOrdinalDot?: boolean;
}

const rec = (tool: string, description: string): TransformationRecord => ({ at: DETERMINISTIC_AT, tool, description });

/**
 * Deterministic normalization for TTS input. Steps (each recorded only when it changed the text):
 * NFC → strip verse markers ([16], ¹⁶, <sup>16</sup>) → expand abbreviations → native digits to ASCII →
 * integers to words → collapse whitespace. It NEVER transliterates and never touches the display text.
 * Bare leading verse numbers ("16 For God…") are deliberately NOT stripped: a real numeral would be lost.
 */
export function speechNormalizeGeneric(displayText: string, cfg: SpeechConfig): SpeechNormalizationResult {
  const records: TransformationRecord[] = [];
  let text = displayText;
  const step = (next: string, description: string) => {
    if (next !== text) { records.push(rec(cfg.tool, description)); text = next; }
  };

  step(nfc(text), 'unicode NFC');

  const removed: string[] = [];
  const strip = (re: RegExp) => { text = text.replace(re, (m) => { removed.push(m); return ' '; }); };
  const before = text;
  strip(VERSE_BRACKET); strip(VERSE_SUP_TAG); strip(VERSE_SUPERSCRIPT);
  if (removed.length) {
    text = text.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:!?।॥])/gu, '$1').trim();
    records.push(rec(cfg.tool, `removed verse markers: ${removed.map((r) => r.trim()).join(' ')}`));
  } else text = before;

  for (const ab of cfg.abbreviations ?? []) {
    step(text.replace(ab.pattern, ab.replacement), `expanded abbreviation ${ab.label}`);
  }

  if (cfg.nativeDigits) {
    const map = new Map([...cfg.nativeDigits].map((c, i) => [c, String(i)] as const));
    step(text.replace(new RegExp(`[${cfg.nativeDigits}]`, 'gu'), (c) => map.get(c) ?? c), 'native digits to ASCII digits');
  }

  if (cfg.percentWord) step(text.replace(/(\d)\s*%/gu, `$1 ${cfg.percentWord}`), 'percent sign to word');

  const left: string[] = [];
  const expanded = text.replace(/(?<![\p{L}\p{N}.,:])\d{1,7}(?![\p{L}\p{N}]|[.,:]\d)/gu, (m, offset: number, whole: string) => {
    if (cfg.skipOrdinalDot && whole[offset + m.length] === '.' && /^\s+\p{L}/u.test(whole.slice(offset + m.length + 1))) {
      left.push(m);
      return m;
    }
    const w = cfg.numberToWords(Number(m));
    if (w === null) { left.push(m); return m; }
    return w;
  });
  step(expanded, 'integers expanded to words');
  if (left.length) records.push(rec(cfg.tool, `left unexpanded (out of supported range or ordinal): ${left.join(' ')}`));

  step(text.replace(/\s{2,}/gu, ' ').trim(), 'collapsed whitespace');
  return { speechText: text, transformations: records, normalizerVersion: cfg.tool };
}

/** Helper: first Latin letter of the token capitalised like the source (for suggestions that swap a word). */
export function matchCase(sample: string, replacement: string): string {
  if (!sample) return replacement;
  const first = sample[0];
  if (first !== first.toLowerCase() && first === first.toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Letters only, for search folding. */
export const stripMarks = (s: string): string => s.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC');

// ───────────────────────────── analysis coverage ─────────────────────────────

export interface AnalysisCoverage {
  /** Word-like tokens (punctuation and numerals are not counted). */
  words: number;
  /** Word tokens with at least one candidate analysis. */
  analysed: number;
  /** analysed / words (1 when there are no words). */
  coverage: number;
  /** Distinct normalized forms of the word tokens with no analysis, in order of first appearance. */
  unanalysed: string[];
}

/**
 * How much of a tokenized text the adapter could analyse. A word the lexicon does not know has NO candidate
 * (uncertainty is stored, never guessed), so `coverage` is an honest measure of how well the adapter knows a
 * supplied text — and the lever for deciding what the course lexicon still needs.
 */
export function analysisCoverage(tokens: RawToken[], analyses: AnalyzedToken[]): AnalysisCoverage {
  let words = 0;
  let analysed = 0;
  const unknown = new Set<string>();
  tokens.forEach((t, i) => {
    if (!t.isWord) return;
    words++;
    if (analyses[i]?.candidates.length) analysed++;
    else unknown.add(t.normalized);
  });
  return { words, analysed, coverage: words ? analysed / words : 1, unanalysed: [...unknown] };
}
