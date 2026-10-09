/**
 * The analyser: a draft goes in, a `DraftAnalysis` comes out, and the draft itself is never touched.
 *
 *   1 preserve   the text is hashed (FNV-1a 64) and never altered; every offset below is into the sentence text as written
 *   2 split      the pack's analyser splits sentences (the adapter's segmenter, else the browser's)
 *   3 read       each sentence is tokenised and analysed; unit ids are derived as the extension's parser derives them
 *   4 familiar   the share of word tokens among the writer's productive or recognised units
 *   5 check      the adapter's `checkProduction` — the only source of issues; an empty result invents nothing
 *   6 classify   each finding gets a class (meaning vs language vs variation vs doubt); doubt is never upgraded
 *   7 explain    the type of problem (hint, Level 2) and the pack's fuller text (explanation, Level 4)
 *   8 repair     the checker's replacements become corrections: one combined, else one per issue
 *   9 validate   every correction is re-checked, tested for added content, and tested for a change of meaning
 *  10 report     what the checker cannot see for this language, stated on every sentence
 *
 * A correction is a proposal. One that changes meaning is kept and flagged (`meaningChange`); nothing here ever applies it.
 */
import { STATUS_RANK } from '../../../repository-contract/src';
import type { AnalysisStatus } from '../../../repository-contract/src';
import { statusOf } from '../../../language-packs/src';
import type { PackManifest, PackRuntime } from '../../../language-packs/src';
import {
  FUNCTION_POS, addsContent, checkerCoverage, introducedIndexes, isFunctionAt, meaningChanges, planRepairs, related, wordIndexes,
} from '../salvage';
import type { ErrorCandidate, LanguageAdapter, Parsed, PartOfSpeech } from '../salvage';
import type { Correction, DraftAnalysis, Issue, IssueClass, SentenceAnalysis, TextSpan, WriterProfile } from '../types';
import { hashText, isoOf, leadSentences, unique } from './text';

// ───────────────────────────── classes ─────────────────────────────

const LANGUAGE_CATEGORIES: ReadonlySet<string> = new Set([
  'spelling', 'morphology', 'conjugation', 'agreement', 'case', 'syntax', 'word-order', 'missing-function-word', 'definiteness', 'particle',
  'postposition', 'classifier', 'segmentation',
]);
const MEANING_CATEGORIES: ReadonlySet<string> = new Set(['ambiguity', 'clarity', 'meaning-change']);
const AWKWARD_CATEGORIES: ReadonlySet<string> = new Set(['collocation', 'idiomaticity', 'lexical-choice']);

/** The class a checker category belongs to, before any doubt about the analysis is applied. A category this table does not know is doubt. */
export function classOfCategory(category: string): IssueClass {
  if (LANGUAGE_CATEGORIES.has(category)) return 'grammatically-wrong';
  if (MEANING_CATEGORIES.has(category)) return 'semantically-unclear';
  if (AWKWARD_CATEGORIES.has(category)) return 'acceptable-but-awkward';
  if (category === 'dialect') return 'regional-variation';
  if (category === 'register') return 'register-difference';
  return 'uncertain-analysis';
}

/** Below this the checker (or the analysis under it) is too unsure to call anything wrong. */
export const UNCERTAIN_BELOW = 0.5;
const UNCERTAIN_CAP = 0.45;

// ───────────────────────────── pack text ─────────────────────────────

/** Which pack features (by key, as the analyser writes them) and constructions (by words in id/label) explain each kind of problem. */
const FEATURES_FOR: Record<string, string[]> = {
  definiteness: ['Definite'],
  case: ['Case'],
  agreement: ['Gender', 'Number'],
  conjugation: ['Person', 'Number'],
  morphology: ['Number', 'Case', 'Gender'],
  particle: ['Mood'],
};
const CONSTRUCTION_WORDS: Record<string, RegExp> = {
  agreement: /agree|article|adjective/iu,
  case: /accusative|nominative|genitive|dative|ablative/iu,
  definiteness: /definite/iu,
  'word-order': /order/iu,
  conjugation: /conjug|verb/iu,
};

/** What the learner is told when the pack has nothing to say about a kind of problem. Honest about it. */
const PLAIN_TYPE: Record<string, string> = {
  spelling: 'a spelling problem: a letter or a mark may be missing or wrong',
  morphology: 'a problem with the form of a word',
  conjugation: 'a verb form that may not match its subject',
  agreement: 'two words that may not agree',
  case: 'a noun that may not be in the case its position needs',
  syntax: 'a problem with how the words fit together',
  'word-order': 'a problem with word order',
  'missing-function-word': 'a small word that may be missing',
  definiteness: 'a noun that may not have the definite or indefinite form it needs',
  particle: 'a particle that may not be the one this construction needs',
  postposition: 'a postposition that may not be the right one',
  classifier: 'a classifier that may not be the right one',
  segmentation: 'a problem with where words begin and end',
  ambiguity: 'wording that could be read in more than one way',
  clarity: 'wording that may be unclear',
  'meaning-change': 'wording that may say something other than you meant',
  collocation: 'a combination of words that may not go together',
  idiomaticity: 'wording that is grammatical but may not sound natural',
  'lexical-choice': 'a word that may not be the best choice here',
  dialect: 'a form from another variety of the language (regional variation), not necessarily a mistake',
  register: 'wording that belongs to a different register, for example spoken rather than written; not necessarily a mistake',
};

export interface PackText {
  /** The Level 2 hint. */
  hint: string;
  /** Whether the hint comes from the pack's own grammar text (else it is the generic description of the type). */
  fromPack: boolean;
  /** The pack's fuller text (Level 4), or undefined when the pack has none for this kind of problem. */
  explanation?: string;
  /** The pack feature/construction behind it, for Level 3. */
  refs: Array<{ kind: 'feature' | 'construction'; id: string; label: string }>;
}

// ───────────────────────────── public shapes ─────────────────────────────

export interface AnalyzerDeps {
  languageId: string;
  runtime: PackRuntime;
  manifest: PackManifest;
  now: () => Date | string;
  /** Extra sentences the pack vouches for (for example its tutorial's), offered as model expressions at Level 6. Default: the manifest's validation sentences. */
  packSentences?: readonly string[];
}

/** One checker finding with the place it points at. */
export interface Detected { error: ErrorCandidate; span: TextSpan; surface: string }

export interface SentenceSpan { index: number; start: number; end: number; text: string }

export interface RewriteCheck {
  /** The checker, re-run on the suggestion, found nothing. */
  checkerClean: boolean;
  /** Every word the suggestion introduces lies inside an edited span, and no content word was added beyond those removed. */
  addsOnlyWithinSpans: boolean;
  /** What the checks found, in plain words (still flagged / new problem / added content). */
  issues: string[];
  /** Every change of negation, time, key term or tense, in plain words; undefined when none was detected. */
  meaningChange?: string;
  /** Units of the words the suggestion introduced. */
  introducedUnitIds: string[];
}

export interface RewriteOptions {
  /** Where the edits landed in `suggested`. Absent (a proposal from elsewhere): the changed region is found by comparing the two texts. */
  editedSpans?: ReadonlyArray<TextSpan>;
  /** Checker findings of the ORIGINAL sentence this rewrite is meant to resolve, and all of them, to tell a finding that is still there from a new one. */
  addressed?: ReadonlySet<string>;
  original?: ReadonlySet<string>;
  /** Stricter test for text that did not come from the checker's own replacement: no content word unrelated to the original may appear. */
  strict?: boolean;
}

export interface PackSentence { text: string; unitIds: string[]; reviewed: boolean }

export interface Analyzer {
  readonly languageId: string;
  readonly analyzerId: string;
  readonly packVersion: string;
  readonly manifest: PackManifest;
  /** The pack's sentences: [] for the text, with offsets into it. Blank stretches are dropped. */
  segment(text: string): SentenceSpan[];
  analyzeDraft(draftId: string, text: string, profile?: WriterProfile): DraftAnalysis;
  /** The checker's findings for one sentence, with their spans — what the assistance ladder reads again to name a replacement. */
  detect(sentence: string): Detected[];
  /** The finding that an issue of an analysis stands for, found again by category and span. */
  locate(sentence: SentenceAnalysis, issue: Issue): Detected | undefined;
  /** Re-check a rewritten sentence: checker, added content, change of meaning. Used for corrections and for any proposal from outside. */
  validateRewrite(original: string, suggested: string, opts?: RewriteOptions): RewriteCheck;
  /** Unit ids of every word of a text, in order, without repeats. */
  unitIdsOf(text: string): string[];
  /** Pack text for a kind of problem: the Level 2 hint and the Level 4 explanation. */
  packText(category: string): PackText;
  /** Plain-words reading of one word of a sentence from the pack's adapter (`describeMorph`), when it has one. */
  describeWord(sentence: string, span: TextSpan): string | undefined;
  /** A sentence of the pack that contains the units (content units first), is clean under the checker and is not `exclude`. */
  packSentenceFor(unitIds: readonly string[], exclude?: string): PackSentence | undefined;
  /** What this checker cannot see, stated for the language. */
  coverage(): string;
  /** The adapter's own words for the writer's text, for callers that need tokens (undefined when the pack has no real analyser). */
  readonly hasChecker: boolean;
}

// ───────────────────────────── helpers ─────────────────────────────

const round2 = (n: number): number => Math.round(n * 100) / 100;
const keyOf = (e: Pick<ErrorCandidate, 'category' | 'message'>): string => `${e.category}|${e.message}`;
const overlaps = (t: { start: number; end: number }, s: { start: number; end: number }): boolean => t.start < s.end && t.end > s.start;

/** The earliest word-start and latest word-end of the tokens an error names (the whole sentence when it names none that exist). */
function tokenRange(parsed: Parsed, indexes: readonly number[], length: number): TextSpan {
  const toks = indexes.map((i) => parsed.tokens[i]).filter((t): t is NonNullable<typeof t> => !!t);
  if (!toks.length) return { start: 0, end: length };
  return { start: Math.min(...toks.map((t) => t.start)), end: Math.max(...toks.map((t) => t.end)) };
}

function spanOf(e: ErrorCandidate, parsed: Parsed, length: number): TextSpan {
  const s = e.suggestion;
  if (s && Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.end <= length && s.end > s.start) return { start: s.start, end: s.end };
  return tokenRange(parsed, e.tokenIndexes, length);
}

// ───────────────────────────── the analyser ─────────────────────────────

export function createAnalyzer(deps: AnalyzerDeps): Analyzer {
  const { languageId, runtime, manifest } = deps;
  if (manifest.languageId !== languageId) throw new Error(`the pack is for ${manifest.languageId}, not ${languageId}`);
  const pack = runtime.analyzer();
  const adapter: LanguageAdapter | undefined = pack.adapter;
  const analyzerId = pack.id;
  const packVersion = manifest.version;
  const closedForms = new Set((manifest.grammar.clitics ?? []).map((c) => (adapter ? adapter.normalize(c) : c.normalize('NFC').toLowerCase())));

  const parseText = (text: string): Parsed => {
    const tokens = pack.tokenize(text);
    return { text, tokens, analyses: pack.analyze(tokens) };
  };

  // unit ids as the extension's parser derives them: a creditable lemma → lemma:<lang>:<lemma>:<POS>, else form:<lang>:<normalised>
  const normalise = (s: string): string => (adapter ? adapter.normalize(s) : s.normalize('NFC').toLowerCase());
  function unitIdAt(p: Parsed, i: number): string {
    const c = p.analyses[i]?.candidates[0];
    const creditable = !!c?.lemma && !c.unconfirmed && c.confidence >= 0.5;
    return creditable ? `lemma:${languageId}:${c!.lemma}${c!.pos ? ':' + c!.pos : ''}` : `form:${languageId}:${normalise(p.tokens[i].surface)}`;
  }
  const unitIdsOfParsed = (p: Parsed, indexes: readonly number[]): string[] => unique(indexes.filter((i) => p.tokens[i]?.isWord).map((i) => unitIdAt(p, i)));

  function detectParsed(p: Parsed): { found: Detected[]; failure?: string } {
    if (!adapter) return { found: [] };
    let errors: ErrorCandidate[];
    try { errors = adapter.checkProduction(p.tokens, p.analyses, p.text); } catch (e) {
      return { found: [], failure: e instanceof Error ? e.message : String(e) };
    }
    const found = errors.map((error): Detected => {
      const span = spanOf(error, p, p.text.length);
      return { error, span, surface: p.text.slice(span.start, span.end) };
    });
    found.sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
    return { found };
  }

  // ── pack text ──
  function packText(category: string): PackText {
    const keys = FEATURES_FOR[category] ?? [];
    const features = keys.map((k) => manifest.grammar.features.find((f) => f.key === k)).filter((f): f is NonNullable<typeof f> => !!f);
    const words = CONSTRUCTION_WORDS[category];
    const matching = words ? manifest.grammar.constructions.filter((c) => words.test(c.id) || words.test(c.label)) : [];
    // one construction is unambiguous; several would be a guess about which one the learner needs
    const constructions = matching.length === 1 ? matching : [];
    const refs: PackText['refs'] = [
      ...features.map((f) => ({ kind: 'feature' as const, id: f.key, label: f.label })),
      ...constructions.map((c) => ({ kind: 'construction' as const, id: c.id, label: c.label })),
    ];
    const full = unique([
      ...features.map((f) => runtime.explainFeature(f.key, '')),
      ...constructions.map((c) => runtime.explainConstruction(c.id)),
    ].filter((x): x is string => !!x));
    if (features.length) {
      const f = features[0];
      return { hint: `${f.label}: ${leadSentences(f.explain)}`, fromPack: true, refs, ...(full.length ? { explanation: full.join('\n') } : {}) };
    }
    if (constructions.length) {
      const c = constructions[0];
      return { hint: `${c.label}: ${leadSentences(c.explain)}`, fromPack: true, refs, ...(full.length ? { explanation: full.join('\n') } : {}) };
    }
    const plain = PLAIN_TYPE[category];
    return {
      hint: plain ? `This looks like ${plain}.` : `The checker flagged a "${category}" problem; this pack has no grammar note for it.`,
      fromPack: false,
      refs,
    };
  }

  // ── validation of any rewrite ──
  function validateRewrite(original: string, suggested: string, opts: RewriteOptions = {}): RewriteCheck {
    const issues: string[] = [];
    if (suggested === original) {
      return { checkerClean: false, addsOnlyWithinSpans: true, issues: ['the suggestion is identical to the sentence: nothing changes'], introducedUnitIds: [] };
    }
    const po = parseText(original);
    const ps = parseText(suggested);

    // 1. the checker, run again on the suggestion
    let checkerClean: boolean;
    if (!adapter) {
      checkerClean = false;
      issues.push('there is no checker for this language, so the suggestion could not be re-checked');
    } else {
      const again = detectParsed(ps);
      if (again.failure !== undefined) {
        checkerClean = false;
        issues.push(`the checker could not be run on the suggestion (${again.failure})`);
      } else {
        checkerClean = again.found.length === 0;
        for (const d of again.found) {
          const k = keyOf(d.error);
          const label = opts.addressed?.has(k) ? 'not resolved' : opts.original?.has(k) ? 'still flagged' : 'new problem';
          issues.push(`${label}: ${d.error.category} at "${d.surface}"`);
        }
      }
    }

    // 2. nothing introduced outside the edited spans, and no content added beyond what was removed.
    // Outside the edited spans the suggestion must be the learner's own text, piece for piece; a word-count comparison could not tell
    // an edited word from an untouched twin of it.
    let within = true;
    const introduced = introducedIndexes(po, ps);
    const spans = opts.editedSpans ?? changedRegion(original, suggested);
    if (!untouchedOutside(original, suggested, spans)) {
      within = false;
      issues.push('changes the sentence outside the edited places');
    }
    if (adapter && addsContent(adapter, po, ps, new Set())) {
      within = false;
      issues.push('adds more content words than it removes');
    }
    if (adapter && opts.strict) {
      const origWords = wordIndexes(po).map((i) => po.tokens[i].normalized);
      for (const i of introduced) {
        if (isFunctionAt(ps, i)) continue;
        if (!origWords.some((o) => related(adapter, ps.tokens[i].normalized, o))) {
          within = false;
          issues.push(`adds the content word "${ps.tokens[i].surface}", which is not in your sentence`);
        }
      }
    }

    // 3. meaning: negation, time, key terms, tense
    const changes = meaningChanges(languageId, po, ps);
    return {
      checkerClean,
      addsOnlyWithinSpans: within,
      issues: unique(issues),
      ...(changes.length ? { meaningChange: changes.join(' ') } : {}),
      introducedUnitIds: unitIdsOfParsed(ps, ps.tokens.map((_, i) => i).filter((i) => ps.tokens[i].isWord && spans.some((sp) => overlaps(ps.tokens[i], sp)))),
    };
  }

  // ── model sentences of the pack ──
  const packSentenceCache = new Map<string, PackSentence | null>();
  const packSentenceList = unique([...(deps.packSentences ?? []), ...manifest.validation.map((c) => c.sentence).filter((s): s is string => !!s)]);
  function packSentence(text: string): PackSentence | undefined {
    let hit = packSentenceCache.get(text);
    if (hit === undefined) {
      const p = parseText(text);
      const d = detectParsed(p);
      const clean = !!adapter && d.found.length === 0 && d.failure === undefined;
      hit = clean ? { text, unitIds: unitIdsOfParsed(p, wordIndexes(p)), reviewed: manifest.rights.reviewStatus === 'reviewed' } : null;
      packSentenceCache.set(text, hit);
    }
    return hit ?? undefined;
  }
  const posOfUnit = (id: string): string | undefined => (id.startsWith('lemma:') ? id.split(':')[3] : undefined);
  const isContentUnit = (id: string): boolean => {
    const pos = posOfUnit(id);
    return !pos || !FUNCTION_POS.has(pos as PartOfSpeech);
  };

  // ── analysis of a draft ──
  const coverageLine = (nothingFound: boolean, failure?: string): string => {
    if (!adapter) {
      return `${pack.limitation ?? 'No analyser for this language is installed.'} Nothing in this sentence was checked.`;
    }
    const base = checkerCoverage(adapter);
    if (failure !== undefined) return `The ${adapter.name} checker stopped on this sentence (${failure}), so nothing in it was checked. ${base}`;
    return nothingFound ? `The checker found nothing in this sentence; that does not show the sentence is correct. ${base}` : base;
  };

  function statusOfSentence(p: Parsed): AnalysisStatus | 'none' {
    const readings = wordIndexes(p).map((i) => p.analyses[i]?.candidates ?? []).filter((c) => c.length > 0);
    if (!readings.length) return 'none';
    const content = readings.filter((c) => !c[0].pos || !FUNCTION_POS.has(c[0].pos));
    const pool = content.length ? content : readings;
    let weakest: AnalysisStatus = 'verified';
    for (const cs of pool) {
      const s = statusOf(cs[0], cs);
      if (STATUS_RANK[s] < STATUS_RANK[weakest]) weakest = s;
    }
    return weakest;
  }

  function analyzeSentence(draftId: string, index: number, text: string, familiar: ReadonlySet<string>): SentenceAnalysis {
    const p = parseText(text);
    const words = wordIndexes(p);
    const tokenUnits = words.map((i) => unitIdAt(p, i));
    const familiarity = words.length ? round2(tokenUnits.filter((u) => familiar.has(u)).length / words.length) : 0;
    const { found, failure } = detectParsed(p);

    const issues: Issue[] = found.map((d, k): Issue => {
      const e = d.error;
      const blamed = p.tokens.map((t, i) => ({ t, i })).filter(({ t }) => t.isWord && overlaps(t, d.span));
      // doubt about the word the issue is about: no reading at all, a guess by ending, or two readings that compete
      const doubt = blamed.some(({ i }) => {
        const cands = p.analyses[i]?.candidates ?? [];
        const top = cands[0];
        if (!top) return true;
        // an article, particle or clitic is read against its neighbours by the checker itself (the pack lists them: the article "e" is read as an adjective alone)
        if ((top.pos && FUNCTION_POS.has(top.pos)) || closedForms.has(p.tokens[i].normalized)) return false;
        return !!top.unconfirmed || statusOf(top, cands) === 'conflicted';
      });
      const confidence = round2(doubt ? Math.min(e.confidence, UNCERTAIN_CAP) : e.confidence);
      const base = classOfCategory(e.category);
      const cls: IssueClass = confidence < UNCERTAIN_BELOW ? 'uncertain-analysis' : base;
      const text4 = packText(e.category);
      return {
        issueId: `${draftId}:s${index}:i${k}`,
        sentenceIndex: index,
        span: d.span,
        surface: d.surface,
        category: e.category,
        class: cls,
        confidence,
        provenance: { source: 'adapter-checker', ref: `${analyzerId}:${e.category}` },
        hint: text4.hint,
        ...(text4.explanation ? { explanation: text4.explanation } : {}),
        unitIds: unitIdsOfParsed(p, e.tokenIndexes),
        affectsMeaning: e.affectsMeaning,
      };
    });

    // corrections: from the checker's replacements only, each one validated
    const originalKeys = new Set(found.map((d) => keyOf(d.error)));
    const corrections: Correction[] = planRepairs(text, found.map((d) => d.error)).map((plan, n): Correction => {
      const addressed = plan.errorIndexes.map((i) => found[i]);
      const mine = plan.errorIndexes.map((i) => issues[i]);
      const check = validateRewrite(text, plan.suggested, { editedSpans: plan.spans, addressed: new Set(addressed.map((d) => keyOf(d.error))), original: originalKeys });
      const alternatives = uniqueBy(
        addressed.filter((d) => d.error.category === 'dialect' || d.error.category === 'register').map((d) => ({ text, note: d.error.message })),
        (a) => a.note,
      );
      const packExplanations = unique(mine.map((i) => i.explanation).filter((x): x is string => !!x));
      return {
        correctionId: `${draftId}:s${index}:c${n}`,
        issueIds: mine.map((i) => i.issueId),
        sentenceIndex: index,
        original: text,
        suggested: plan.suggested,
        explanation: [...addressed.map((d) => d.error.message), ...packExplanations].join('\n'),
        ...(check.meaningChange ? { meaningChange: check.meaningChange } : {}),
        alternatives,
        validation: { checkerClean: check.checkerClean, addsOnlyWithinSpans: check.addsOnlyWithinSpans, issues: check.issues },
        confidence: Math.min(...mine.map((i) => i.confidence)),
        provenance: { source: 'adapter-checker', ref: `${analyzerId}:repair` },
      };
    });

    return {
      index,
      text,
      tokens: words.map((i) => p.tokens[i].surface),
      unitIds: unique(tokenUnits),
      familiarity,
      issues,
      corrections,
      checkerCoverage: coverageLine(found.length === 0, failure),
      analysisStatus: statusOfSentence(p),
    };
  }

  function segment(text: string): SentenceSpan[] {
    const out: SentenceSpan[] = [];
    for (const s of pack.segmentSentences(text)) {
      let { start, end } = s;
      while (start < end && /\s/u.test(text[start])) start++;
      while (end > start && /\s/u.test(text[end - 1])) end--;
      if (end > start) out.push({ index: out.length, start, end, text: text.slice(start, end) });
    }
    return out;
  }

  return {
    languageId,
    analyzerId,
    packVersion,
    manifest,
    hasChecker: !!adapter,
    segment,

    analyzeDraft(draftId, text, profile) {
      const familiar = new Set<string>([...(profile?.productive ?? []), ...(profile?.recognisedOnly ?? [])]);
      return {
        draftId,
        languageId,
        textHash: hashText(text),
        sentences: segment(text).map((s) => analyzeSentence(draftId, s.index, s.text, familiar)),
        analyzerId,
        packVersion,
        at: isoOf(deps.now()),
      };
    },

    detect: (sentence) => detectParsed(parseText(sentence)).found,

    locate(sentence, issue) {
      return detectParsed(parseText(sentence.text)).found.find((d) => d.error.category === issue.category && d.span.start === issue.span.start && d.span.end === issue.span.end);
    },

    validateRewrite,

    unitIdsOf(text) {
      const p = parseText(text);
      return unitIdsOfParsed(p, wordIndexes(p));
    },

    packText,

    describeWord(sentence, span) {
      if (!adapter?.describeMorph) return undefined;
      try {
        const p = parseText(sentence);
        const i = p.tokens.findIndex((t) => t.isWord && overlaps(t, span));
        const c = i >= 0 ? p.analyses[i]?.candidates[0] : undefined;
        if (!c || Object.keys(c.morph ?? {}).length === 0) return undefined;
        const d = adapter.describeMorph(c.morph, c.pos);
        return d && d.trim() ? d.trim() : undefined;
      } catch { return undefined; }
    },

    packSentenceFor(unitIds, exclude) {
      const wanted = unitIds.filter(isContentUnit);
      const anyWanted = wanted.length ? wanted : [...unitIds];
      let best: { s: PackSentence; score: number } | undefined;
      for (const text of packSentenceList) {
        if (exclude !== undefined && text === exclude) continue;
        const s = packSentence(text);
        if (!s) continue;
        const score = anyWanted.filter((u) => s.unitIds.includes(u)).length;
        if (score > 0 && (!best || score > best.score)) best = { s, score };
      }
      return best?.s;
    },

    coverage: () => coverageLine(false),
  };
}

function uniqueBy<T>(xs: readonly T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** True when the suggestion, with the edited spans cut out, is the original with the replaced stretches cut out: the pieces between the edits are the learner's own text, unchanged. */
function untouchedOutside(original: string, suggested: string, spans: ReadonlyArray<TextSpan>): boolean {
  const sorted = [...spans].sort((x, y) => x.start - y.start);
  const pieces: string[] = [];
  let cursor = 0;
  for (const sp of sorted) { pieces.push(suggested.slice(cursor, sp.start)); cursor = sp.end; }
  pieces.push(suggested.slice(cursor));
  if (!original.startsWith(pieces[0]) || !original.endsWith(pieces[pieces.length - 1])) return false;
  let pos = pieces[0].length;
  const limit = original.length - pieces[pieces.length - 1].length;
  for (let k = 1; k < pieces.length - 1; k++) {
    const at = original.indexOf(pieces[k], pos);
    if (at < 0 || at + pieces[k].length > limit) return false;
    pos = at + pieces[k].length;
  }
  return pos <= limit;
}

/** Where two texts differ, as a span of the second: everything between their common beginning and common ending. */
function changedRegion(original: string, suggested: string): TextSpan[] {
  let a = 0;
  while (a < original.length && a < suggested.length && original[a] === suggested[a]) a++;
  let b = 0;
  while (b < original.length - a && b < suggested.length - a && original[original.length - 1 - b] === suggested[suggested.length - 1 - b]) b++;
  return [{ start: a, end: suggested.length - b }];
}
