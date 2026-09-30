/**
 * RuleBasedSuggestionProvider — the suggestion source that ships now.
 *
 *  - repair:         from ErrorCandidate.suggestion (adapter.checkProduction), applied to the learner's sentence.
 *  - recombination:  a known phrase (reading >= recognized) whose fixed content word appears in the sentence;
 *                    the learner's own words are slotted into the phrase's slot. Nothing the learner did not
 *                    write is added except the words of the phrase he already knows.
 *  - expansion:      never proposed directly. The service reclassifies any proposal that needs items the learner
 *                    has never met as `expansion` and fills `newItems` (see service.ts `finalize`).
 *
 * The provider only reads the AnalyzedSentence it is given (plus the adapter for tokenization); it keeps no
 * learner state. Custom providers (e.g. an LLM) implement the same interface and go through the same
 * finalisation (never-add-content check, provenance, meaningChange).
 */
import { ids } from '../core';
import type { AdapterRegistry, AnalyzedSentence, ErrorCategory, LanguageAdapter, LanguageCode, RawToken, SuggestionProvider } from '../core';
import { NEGATORS, SUBJECT_PRONOUNS } from './concepts';
import { BOUNDARY_POS, FUNCTION_POS, bestCandidate, introducedIndexes, isFunctionAt, parse, posAt, related } from './text';
import type { Parsed } from './text';

export type ProposedSuggestion = Awaited<ReturnType<SuggestionProvider['propose']>>[number];

/** An AnalyzedSentence error enriched with the adapter's replacement (extra fields are optional for other producers). */
export type AnalyzedError = AnalyzedSentence['errors'][number] & {
  confidence?: number;
  tokenIndexes?: number[];
  suggestion?: { start: number; end: number; replacement: string };
};

const INTELLIGIBILITY: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>([
  'syntax', 'word-order', 'conjugation', 'morphology', 'agreement', 'case', 'missing-function-word', 'lexical-choice',
  'collocation', 'classifier', 'particle', 'postposition', 'definiteness', 'ambiguity',
]);

/** Priority 1 = affects meaning; 2 = intelligibility; 3 = reusable construction; 4 = minor / recurrent (spelling, register, clarity, segmentation). */
export function basePriority(category: ErrorCategory, affectsMeaning: boolean): 1 | 2 | 3 | 4 {
  if (affectsMeaning || category === 'meaning-change') return 1;
  if (INTELLIGIBILITY.has(category)) return 2;
  return 4;
}

const MAX_FILLER_TOKENS = 6;
const nfc = (s: string) => s.normalize('NFC').toLowerCase();
const setOf = (xs: string[]) => new Set(xs.map(nfc));
const NEG_SETS: Record<LanguageCode, Set<string>> = {
  es: setOf(NEGATORS.es), sq: setOf(NEGATORS.sq), th: setOf(NEGATORS.th), hi: setOf(NEGATORS.hi), de: setOf(NEGATORS.de),
};
const SUBJ_SETS: Record<LanguageCode, Set<string>> = {
  es: setOf(SUBJECT_PRONOUNS.es), sq: setOf(SUBJECT_PRONOUNS.sq), th: setOf(SUBJECT_PRONOUNS.th), hi: setOf(SUBJECT_PRONOUNS.hi), de: setOf(SUBJECT_PRONOUNS.de),
};

export interface RuleBasedProviderDeps { adapters: AdapterRegistry }

export class RuleBasedSuggestionProvider implements SuggestionProvider {
  readonly id = 'rule-based@1';
  constructor(private readonly deps: RuleBasedProviderDeps) {}

  async propose(args: Parameters<SuggestionProvider['propose']>[0]): Promise<ProposedSuggestion[]> {
    const adapter = this.deps.adapters.get(args.lang);
    return [...this.repairs(adapter, args.lang, args.sentence), ...this.recombinations(adapter, args.lang, args.sentence, args.knownPhrases)];
  }

  private repairs(adapter: LanguageAdapter, lang: LanguageCode, sentence: AnalyzedSentence): ProposedSuggestion[] {
    const out: ProposedSuggestion[] = [];
    const text = sentence.text;
    const original = parse(adapter, text);
    for (const e of sentence.errors as AnalyzedError[]) {
      const fix = e.suggestion;
      if (!fix || fix.start < 0 || fix.end > text.length || fix.start > fix.end) continue;
      const suggested = text.slice(0, fix.start) + fix.replacement + text.slice(fix.end);
      if (suggested === text) continue;
      const sug = parse(adapter, suggested);
      const itemIds = unique(introducedIndexes(original, sug).map((i) => ids.form(lang, sug.tokens[i].normalized)));
      out.push({
        sentenceIndex: sentence.index,
        kind: 'repair',
        original: text,
        suggested,
        explanation: `${e.message} Suggested: "${fix.replacement}".`,
        categories: [e.category],
        priority: basePriority(e.category, e.affectsMeaning),
        itemIds,
      });
    }
    return out;
  }

  private recombinations(adapter: LanguageAdapter, lang: LanguageCode, sentence: AnalyzedSentence, known: Array<{ phraseId: string; display: string; pattern: string[] }>): ProposedSuggestion[] {
    const out: ProposedSuggestion[] = [];
    for (const phrase of known) {
      const r = recombine(adapter, lang, sentence, phrase);
      if (r) out.push(r);
    }
    return out;
  }
}

function unique<T>(xs: T[]): T[] { return [...new Set(xs)]; }

/**
 * Slot the learner's own words into a known phrase. Supports frames whose single slot `_` sits at either edge
 * (e.g. ["empecé","a","entender","_"] or ["_","समझने","लगा"]). Conservative: no negation inside the affected
 * region, filler bounded by punctuation / conjunction / verb / (backwards) the subject pronoun.
 */
export function recombine(adapter: LanguageAdapter, lang: LanguageCode, sentence: AnalyzedSentence, phrase: { phraseId: string; display: string; pattern: string[] }): ProposedSuggestion | undefined {
  const { pattern } = phrase;
  const slotIdx = pattern.indexOf('_');
  if (pattern.length < 2 || slotIdx < 0 || pattern.lastIndexOf('_') !== slotIdx) return undefined;
  const slotAfter = slotIdx === pattern.length - 1;
  if (!slotAfter && slotIdx !== 0) return undefined; // slot between fixed words: not supported yet
  const text = sentence.text;
  const p = parse(adapter, text);
  const toks = p.tokens;

  // fixed content words of the phrase (POS from the adapter; unknown POS counts as content)
  const fixed = pattern.map((w, pi) => ({ w, pi })).filter((x) => x.pi !== slotIdx);
  const fixedRaw: RawToken[] = fixed.map((f) => ({ surface: f.w, start: 0, end: f.w.length, isWord: true, normalized: f.w }));
  const fixedAn = adapter.analyze(fixedRaw);
  const contentFixed = fixed.filter((_, k) => {
    const pos = bestCandidate(fixedAn[k])?.pos;
    return !(pos && FUNCTION_POS.has(pos));
  });

  // anchor: the matched fixed content word closest to the slot
  let anchor: { i: number; pi: number } | undefined;
  for (const cf of contentFixed) {
    for (let i = 0; i < toks.length; i++) {
      if (!toks[i].isWord || !related(adapter, toks[i].normalized, cf.w)) continue;
      const better = !anchor || (slotAfter ? cf.pi > anchor.pi : cf.pi < anchor.pi);
      if (better) anchor = { i, pi: cf.pi };
    }
  }
  if (!anchor) return undefined;

  // extend the region over adjacent tokens that already spell the neighbouring fixed words (no duplication)
  let start = anchor.i;
  let end = anchor.i;
  for (let pj = anchor.pi - 1; pj >= 0; pj--) {
    if (pj === slotIdx) continue;
    const t = toks[start - 1];
    if (t && t.isWord && related(adapter, t.normalized, pattern[pj])) start--; else break;
  }
  for (let pj = anchor.pi + 1; pj < pattern.length; pj++) {
    if (pj === slotIdx) continue;
    const t = toks[end + 1];
    if (t && t.isWord && related(adapter, t.normalized, pattern[pj])) end++; else break;
  }

  // slot filler: the learner's own adjacent words on the slot side
  const filler: number[] = [];
  if (slotAfter) {
    for (let j = end + 1; j < toks.length && filler.length < MAX_FILLER_TOKENS; j++) {
      const t = toks[j];
      if (!t.isWord) break;
      const pos = posAt(p, j);
      if (pos && BOUNDARY_POS.has(pos)) break;
      if (NEG_SETS[lang].has(nfc(t.normalized))) break;
      filler.push(j);
    }
  } else {
    for (let j = start - 1; j >= 0 && filler.length < MAX_FILLER_TOKENS; j--) {
      const t = toks[j];
      if (!t.isWord) break;
      const pos = posAt(p, j);
      if (pos && BOUNDARY_POS.has(pos)) break;
      if (SUBJ_SETS[lang].has(nfc(t.normalized))) break;
      if (NEG_SETS[lang].has(nfc(t.normalized))) break;
      filler.unshift(j);
    }
  }
  if (filler.length === 0) return undefined;

  const regionStart = slotAfter ? start : filler[0];
  const regionEnd = slotAfter ? filler[filler.length - 1] : end;
  for (let j = regionStart; j <= regionEnd; j++) if (toks[j].isWord && NEG_SETS[lang].has(nfc(toks[j].normalized))) return undefined;
  const negated = slotAfter && regionStart > 0 && toks[regionStart - 1].isWord && NEG_SETS[lang].has(nfc(toks[regionStart - 1].normalized));

  const fillerText = text.slice(toks[filler[0]].start, toks[filler[filler.length - 1]].end);
  const sep = adapter.display.wordSeparator;
  const instantiated = pattern.map((w) => (w === '_' ? fillerText : w)).join(sep);
  const suggested = text.slice(0, toks[regionStart].start) + instantiated + text.slice(toks[regionEnd].end);
  const key = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  if (key(suggested) === key(text)) return undefined; // the learner already wrote the phrase

  const sp: Parsed = parse(adapter, suggested);
  const intro = introducedIndexes(p, sp);
  const origWords = toks.filter((t) => t.isWord).map((t) => t.normalized);
  const contentIntro = intro.filter((i) => !isFunctionAt(sp, i) && !origWords.some((o) => related(adapter, sp.tokens[i].normalized, o)));
  let meaningChange: string | undefined;
  if (contentIntro.length > 0 || negated) {
    const words = contentIntro.map((i) => sp.tokens[i].surface).join(sep || ' ');
    const negNote = negated ? ` Your "${toks[regionStart - 1].surface}" now negates the phrase.` : '';
    meaningChange = `The phrase "${phrase.display}" says more than you wrote${words ? ` (adds: ${words})` : ''}.${negNote} Check it still says what you mean.`;
  }

  const regionText = text.slice(toks[regionStart].start, toks[regionEnd].end);
  return {
    sentenceIndex: sentence.index,
    kind: 'recombination',
    original: text,
    suggested,
    explanation: `You wrote "${regionText}". You already know the phrase "${phrase.display}" - here it is with your own words in it: "${instantiated}".`,
    categories: ['collocation'],
    priority: 3,
    meaningChange,
    itemIds: unique([phrase.phraseId, ...intro.map((i) => ids.form(lang, sp.tokens[i].normalized))]),
  };
}
