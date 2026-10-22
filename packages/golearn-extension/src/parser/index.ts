/**
 * Parser - applies a language adapter (the real one, taken from the analyser registry) to a selection and its permitted context and
 * returns a card model. Nothing here guesses: a word the pack does not know is reported as unknown, an unconfirmed
 * reading says so, the context kind is passed through, and confidence is the analyzer's own number.
 *
 * The sentence is tokenized whole (the adapter needs the neighbours: linking articles, short pronouns, particles);
 * the selected tokens are found by offsets. With no context the selection alone is tokenized and the card says so.
 */
import { sqAdapter } from '../../../../src/adapters/sq';
import type { AnalysisCandidate, AnalyzedToken, LanguageAdapter, PatternCandidate, PhraseCandidate, RawToken, SyntaxAnalysis } from '../../../../src/core';
import { unitIds } from '../../../repository-contract/src';
import { sentenceKeyOf, fnv1a64 } from '../text';
import type { Alternative, CardModel, SyntaxNote, CardProvenance, ConstructionNote, ContextReport, EvidenceLabel, FeatureItem, LabelledField, PhraseNote, SentenceWord, WordLine } from './cardModel';
import { AnalyserNotLoaded, LANGUAGE_META, PARSER_LANGUAGES, clearAnalysers, getAnalyser, hasAnalyser, languageMeta, registerAnalyser, type LanguageMeta } from './registry';

export * from './cardModel';
export { AnalyserNotLoaded, PARSER_LANGUAGES, clearAnalysers, getAnalyser, hasAnalyser, languageMeta, registerAnalyser, type LanguageMeta };

/** The language the parser reads when no `languageId` is given (the original, Albanian-only behaviour). */
export const PARSER_LANGUAGE = 'sq';
export const PACK_ID = `pack:sq:${sqAdapter.version}`;

// Albanian is the one analyser the parser carries itself: the reference language is never loaded, so its first lookup pays no load.
registerAnalyser('sq', sqAdapter);

/** A language the parser reads: its metadata, the loaded adapter and the pack id that adapter makes (`pack:<lang>:<adapter version>`). */
interface Lang extends LanguageMeta { adapter: LanguageAdapter; packId: string }

const langOf = (languageId: string): Lang => {
  const meta = languageMeta(languageId);
  if (!meta) throw new RangeError(`No parser for language "${languageId}".`);
  const adapter = getAnalyser(languageId);
  if (!adapter) throw new AnalyserNotLoaded(languageId);
  return { ...meta, adapter, packId: `pack:${meta.lang}:${adapter.version}` };
};

/** The adapter the parser reads a language with, when it is loaded (the language resolver scores a sample against the same word lists); undefined for an unknown or not-yet-loaded language. */
export const parserAdapter = (languageId: string): LanguageAdapter | undefined => getAnalyser(languageId);
/** The pack id of each language whose analyser is loaded (`pack:<lang>:<version>`); a language not loaded yet reads as undefined. */
export const PACK_IDS: Readonly<Record<string, string>> = Object.defineProperties({}, Object.fromEntries(Object.keys(LANGUAGE_META).map((lang) => [lang, {
  enumerable: true,
  get: (): string | undefined => { const a = getAnalyser(lang); return a ? `pack:${lang}:${a.version}` : undefined; },
}]))) as Record<string, string>;
/** Same threshold the engine uses to credit a lemma (src/golearn/policy.ts LEMMA_MIN_CONFIDENCE): below it, a form id. */
export const LEMMA_MIN_CONFIDENCE = 0.5;
const MAX_WORD_LINES = 12;
const MAX_ITEM_IDS = 12;
const MAX_SENTENCE_WORDS = 60;

export interface ParseContext {
  kind: 'sentence' | 'fragment' | 'none';
  confidence: number;
  reason?: string;
  sentence?: string;
  selStart?: number;
  selEnd?: number;
  direction?: 'ltr' | 'rtl' | 'unknown';
  pageLanguage?: string;
  /**
   * The variety the reader declares the text to be in, or the learner's target (a PERIOD for Hebrew / Greek: a Tanakh page is 'he-bib').
   * Passed to the analyser, which uses it only to break ties the text leaves open; the text itself is never overridden.
   */
  varietyId?: string;
  /**
   * The SOURCE's own reading of the selected token, when the reader has one (Biblia: the Open Scriptures / MorphGNT column of that very word):
   * the analyser's candidate with this lemma id and code is put first and says so. Never invents a reading: a gold the analyser does not hold is ignored.
   */
  gold?: { lemmaId: string; code: string; source?: string };
}

/** `languageId` is the language of the learner's enrolment; absent = Albanian (PARSER_LANGUAGE). An unlisted language throws a RangeError; a listed language whose analyser has not been loaded throws `AnalyserNotLoaded` (the caller loads it first: see registry.ts). */
export interface ParseInput { surface: string; context: ParseContext; languageId?: string }

const LABELS: Record<LabelledField, EvidenceLabel> = {
  surface: 'fact', context: 'fact',
  lemma: 'analysis', pos: 'analysis', morphology: 'analysis', gloss: 'analysis', confidence: 'analysis', provenance: 'analysis',
  phrases: 'analysis', words: 'analysis', notes: 'analysis', basis: 'analysis', pronunciation: 'analysis',
  features: 'analysis', constructions: 'analysis', syntax: 'analysis', sentenceWords: 'analysis', learner: 'inference',
};

const RANK: Record<CardProvenance, number> = { none: 0, rule: 1, lexicon: 2 };

const LIMITS = [
  'Meanings come from the word list and, when the dictionary pack can be reached, from its Wiktionary-derived dictionary. Neither has been checked by a native speaker.',
  'The word list and the rules are machine-drafted; no native speaker has checked them.',
  'The sentence word list contains word-level glosses, not a sentence translation. Optional translation is generated separately, only when requested.',
];

export function parseSelection(input: ParseInput): CardModel {
  const L = langOf(input.languageId ?? PARSER_LANGUAGE);
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

  const tokens = surface ? L.adapter.tokenize(text) : [];
  const analyses = surface ? L.adapter.analyze(tokens, ctx.varietyId ? { varietyId: ctx.varietyId } : undefined) : [];
  const selected: number[] = [];
  tokens.forEach((t, i) => { if (t.isWord && t.start < selEnd && t.end > selStart) selected.push(i); });
  // the source's reading of this very token (a reader that carries one) goes first, and says so; nothing is invented
  if (ctx.gold && selected.length === 1) {
    const a = analyses[selected[0]];
    const k = a.candidates.findIndex((c) => c.notes?.lemmaId === ctx.gold!.lemmaId && c.notes?.code === ctx.gold!.code);
    if (k > 0) {
      const chosen = { ...a.candidates[k], notes: { ...a.candidates[k].notes, context: `the ${ctx.gold.source ?? 'source'} reads this very word so; the analyser's own first reading is kept as an alternative` } };
      a.candidates = [chosen, ...a.candidates.filter((_, j) => j !== k)];
    }
  }

  // 2. context report (a fragment's hash is not a sentence identity)
  const context: ContextReport = { kind, confidence: kind === 'none' ? 0 : clamp01(ctx.confidence), reason, selectionLocated, direction: ctx.direction };
  if (kind === 'sentence') { context.sentenceKey = sentenceKeyOf(text.trim()); context.sentenceChars = text.length; }
  if (kind === 'fragment') { context.fragmentKey = fnv1a64(text.trim()).slice(0, 12); context.sentenceChars = text.length; }

  const notes: string[] = [];
  if (kind === 'none') notes.push('No sentence context: the word was read alone, so neighbouring words could not help choose a reading.');
  else if (kind === 'fragment') notes.push('Only a fragment around the word was available, not a verified sentence: readings that depend on neighbours are less certain.');
  const inScript = hasScriptLetter(L, surface);
  if (!inScript) notes.push(`This selection is not in ${scriptName(L)} script: the ${L.name} word list does not apply to it.`);
  const pl = ctx.pageLanguage?.toLowerCase();
  if (pl && !L.pageTag.test(pl) && inScript) {
    notes.push(L.lang === 'sq'
      ? `The page declares its language as "${ctx.pageLanguage}"; the Albanian word list is applied only because it is the one pack in this prototype.`
      : `The page declares its language as "${ctx.pageLanguage}"; the ${L.name} word list is applied because ${L.name} is the language you are studying.`);
  }

  const base = {
    languageId: L.lang, packId: L.packId, analyzerId: analyzerIdOf(L, analyses),
    surface, phrases: [] as PhraseNote[], words: [] as WordLine[], alternatives: [] as Alternative[], basis: [] as string[],
    pronunciation: [] as string[], unconfirmed: false, labels: LABELS, limits: L.experimental ? [...LIMITS, L.experimental] : LIMITS, context, tokenCount: selected.length,
    features: [] as FeatureItem[], constructions: [] as ConstructionNote[], syntaxNotes: [] as string[], sentenceWords: [] as SentenceWord[], unitIds: [] as string[],
  };

  if (!selected.length) {
    notes.push(surface ? 'No word was found in the selection (only punctuation or numerals).' : 'Nothing was selected.');
    return { ...base, confidence: 0, provenance: 'none', notes, itemIds: surface ? [formId(L, surface)] : [] };
  }

  // 3. per-word best readings
  const best = selected.map((i) => pick(analyses[i]));
  const lines: WordLine[] = selected.map((i, k) => lineOf(tokens[i], best[k]));
  const phrases = phrasesFor(L, tokens, analyses, selected);

  const sourceOf = (c: AnalysisCandidate | undefined) => {
    const src = c?.sourceId ? L.adapter.sources?.[c.sourceId] : undefined;
    return src ? { id: src.id, label: src.label, reviewStatus: src.reviewStatus } : undefined;
  };

  // 4. the card itself
  let lemma: string | undefined; let pos: string | undefined; let gloss: string | undefined; let morphology: string | undefined;
  let confidence = 0; let provenance: CardProvenance = 'none'; let source; let unconfirmed = false;
  const basis: string[] = []; let pronunciation: string[] = []; const alternatives: Alternative[] = [];
  let transliteration: string | undefined; let lemmaTransliteration: string | undefined;
  let features: FeatureItem[] = []; let role: string | undefined; const syntaxNotes: string[] = []; let syntax: SyntaxNote | undefined;
  let period: CardModel['period']; let variants: CardModel['variants']; let glossSource: string | undefined;
  const varietyLabel = (code: string): string => L.adapter.varieties?.[code]?.label ?? code;
  const constructions: ConstructionNote[] = patternsFor(L, tokens, analyses, selected).map((p) => ({
    id: p.key, unitId: unitIds.syntactic(L.lang, p.key), title: p.title, explanation: p.explanation, confidence: clamp01(p.confidence), source: 'pattern' as const,
  }));

  if (selected.length === 1) {
    const i = selected[0];
    const c = best[0];
    const pron = L.adapter.pronunciation(tokens[i], analyses[i]);
    pronunciation = pron.notes ?? [];
    transliteration = romanOf(pron.transliteration, tokens[i].surface);
    if (selStart > tokens[i].start || selEnd < tokens[i].end) notes.push(`The selection is part of the word "${tokens[i].surface}"; the reading is for the whole word.`);
    if (c) {
      lemma = c.lemma; pos = c.pos; gloss = c.unconfirmed ? undefined : c.gloss;
      // a reading from an external source (the Open Scriptures morphology, MorphGNT, the Wiktionary tables): the card names it, not "course word list"
      if (c.origin === 'dictionary' && c.sourceId && L.adapter.sources?.[c.sourceId]) glossSource = L.adapter.sources[c.sourceId].label.replace(/\s*\(.*$/, '').replace(/,.*$/, '');
      morphology = describe(L, c);
      confidence = clamp01(c.confidence);
      provenance = provenanceOf(c);
      unconfirmed = !!c.unconfirmed;
      source = sourceOf(c);
      lemmaTransliteration = lemmaRomanOf(L, c.lemma, tokens[i].surface, transliteration);
      features = Object.entries(c.morph ?? {}).filter(([, v]) => typeof v === 'string' && v).map(([key, value]) => ({ key, value }));
      role = typeof c.role === 'string' && c.role ? c.role : undefined;
      syntax = syntaxNoteFor(L, tokens, analyses, i);
      if (!role && syntax?.label) role = syntax.label;
      if (c.unit && c.unit.pieces.length > 1) syntaxNotes.push(`Part of the unit “${c.unit.display}” (${c.unit.role}).`);
      for (const part of c.parts ?? []) syntaxNotes.push(`${part.text}: ${[part.lemma && part.lemma !== part.text ? `from ${part.lemma}` : '', part.role ?? part.pos ?? ''].filter(Boolean).join(', ') || 'part of the word'}`);
      for (const f of formConstructions(L, c)) if (!constructions.some((x) => x.id === f.id)) constructions.push(f);
      for (const key of ['rule', 'context'] as const) { const v = c.notes?.[key]; if (typeof v === 'string' && v) basis.push(v); }
      if (c.unconfirmed) notes.push('Not in the word list: the lemma is a guess from the ending and no meaning is given.');
      if (typeof c.notes?.disputed === 'string') notes.push(`Sources disagree: ${c.notes.disputed}`);
      if (c.unit && c.unit.pieces.length > 1) notes.push(`Part of a unit with the neighbouring word: "${c.unit.display}".`);
      if (c.orthography) notes.push(`Spelling differs from today's standard (${c.orthography.modern}).`);
      if (c.varieties?.length) notes.push(`Variety: ${c.varieties.join(', ')}.`); // the codes, as before; a period's plain-words label is on the period line
      // a language with period varieties: the period the analyser read the sentence in, and the word across the periods ("Variants")
      // a period variety, or a heritage language read beside the language (Biblical Aramaic inside a Hebrew text)
      if (typeof c.notes?.period === 'string' && ['period', 'heritage'].includes(L.adapter.varieties?.[c.notes.period]?.kind ?? '')) {
        period = { varietyId: c.notes.period, label: varietyLabel(c.notes.period), basis: typeof c.notes.periodBasis === 'string' ? c.notes.periodBasis : '' };
      }
      if (L.adapter.variants && c.lemma) {
        try {
          const v = L.adapter.variants(c.lemma, c.pos, tokens[i].surface);
          // "this text" is the period the sentence was read in, and that one only (the adapter's own guess from the surface gives way to it)
          if (v) variants = { ...v, rows: v.rows.map((r) => ({ ...r, ...(period ? { current: r.varietyId === period.varietyId } : {}) })) };
        } catch { /* the Variants tab is an aid: it never breaks a card */ }
      }
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
      notes.push(`Not an entry of the ${L.name} word list, and the rules found no reading: the word is unknown to this pack.`);
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

  const itemIds = itemIdsFor(L, selected, tokens, best, phrases, selected.length === 1);
  const single = selected.length === 1;
  const formUnit = single ? formId(L, tokens[selected[0]].surface) : undefined;
  const unitIdsToAsk = [...new Set([...itemIds, ...(formUnit ? [formUnit] : []), ...constructions.map((x) => x.unitId)])].slice(0, 24);
  const sentenceWords: SentenceWord[] = [];
  if (kind !== 'none') {
    tokens.forEach((t, i) => {
      if (!t.isWord || sentenceWords.length >= MAX_SENTENCE_WORDS) return;
      const l = i === selected[0] || selected.includes(i) ? lines[selected.indexOf(i)] : lineOf(t, pick(analyses[i]));
      const roman = romanOf(safeRoman(L, t, analyses[i]), t.surface);
      sentenceWords.push({ surface: t.surface, lemma: l.lemma, pos: l.pos, gloss: l.gloss, confidence: l.confidence, selected: selected.includes(i), ...(roman ? { transliteration: roman } : {}) });
    });
  }

  return {
    ...base, lemma, pos, morphology, gloss, confidence, provenance, source, unconfirmed,
    phrases: phrases.map((p) => ({ display: p.display, kind: p.kind, gloss: p.gloss, confidence: clamp01(p.confidence) })),
    words: selected.length > 1 ? lines.slice(0, MAX_WORD_LINES) : [],
    alternatives: alternatives.slice(0, 3), basis, notes, pronunciation, ...(transliteration ? { transliteration } : {}), ...(lemmaTransliteration ? { lemmaTransliteration } : {}), itemIds,
    features, constructions, role, syntaxNotes, ...(syntax ? { syntax } : {}), sentenceWords, unitIds: unitIdsToAsk, formId: formUnit,
    ...(period ? { period } : {}), ...(variants ? { variants } : {}), ...(glossSource ? { glossSource } : {}),
  };
}

/** A romanization only when the adapter gave one that is not just the word again (a Latin-script word has none). */
function romanOf(t: string | undefined, surface: string): string | undefined {
  const v = typeof t === 'string' ? t.normalize('NFC').trim() : '';
  return v && v !== surface.normalize('NFC').trim() ? v : undefined;
}
/** The adapter's romanization of a word, or undefined when it has none or throws (a romanization is an aid: it never breaks a card). */
function safeRoman(L: Lang, token: RawToken, analysis: AnalyzedToken): string | undefined {
  try { return L.adapter.pronunciation(token, analysis).transliteration; } catch { return undefined; }
}
/**
 * The lemma's romanization, asked of the same adapter method on a token made from the lemma. Only when the lemma is a different single
 * word and the adapter is sure of it on its own; an adapter that needs an analysis it cannot get leaves it undefined.
 */
function lemmaRomanOf(L: Lang, lemma: string | undefined, surface: string, own: string | undefined): string | undefined {
  if (!lemma || lemma.normalize('NFC') === surface.normalize('NFC') || /\s/u.test(lemma)) return undefined;
  try {
    const toks = L.adapter.tokenize(lemma).filter((t) => t.isWord);
    if (toks.length !== 1) return undefined;
    const an = L.adapter.analyze(toks)[0];
    const r = romanOf(L.adapter.pronunciation(toks[0], an).transliteration, lemma);
    return r && r !== own ? r : undefined;
  } catch { return undefined; }
}

/**
 * The selected word's dependency relation from the adapter's syntax rules (Stage 4), with the head's and dependents' surfaces
 * filled in. Undefined when the adapter has no rules or they threw; status 'none' when it has rules but attached nothing here.
 */
const MAX_SYNTAX_TOKENS = 120;

function syntaxNoteFor(L: Lang, tokens: RawToken[], analyses: AnalyzedToken[], i: number): SyntaxNote | undefined {
  if (!L.adapter.syntax || tokens.length < 2) return undefined;
  // the rules are quadratic in places; a hostile or runaway 'sentence' is not parsed for syntax (the card says so)
  if (tokens.length > MAX_SYNTAX_TOKENS) return { status: 'none', basis: [], alternatives: [], dependents: [], notes: [`The sentence has ${tokens.length} tokens; the syntax rules are applied to sentences of at most ${MAX_SYNTAX_TOKENS}.`], attached: 0, analyzer: L.adapter.version ? `adapter-${L.lang}@${L.adapter.version}` : L.lang };
  let a: SyntaxAnalysis | undefined;
  try { a = L.adapter.syntax(tokens, analyses); } catch { return undefined; }
  if (!a) return undefined;
  const word = (k: number | undefined): string | undefined => (k === undefined ? undefined : a!.tokens[k] ?? tokens[k]?.surface);
  const r = a.relations.find((x) => x.dependent === i);
  const dependents = a.relations.filter((x) => x.head === i).sort((x, y) => x.dependent - y.dependent).map((x) => ({ surface: word(x.dependent) ?? '', relation: x.relation, label: x.label })).slice(0, 12);
  const clause = a.clauses?.find((c) => i >= c.start && i <= c.end);
  const notes = a.notes.slice(0, 6);
  if (!r) return { status: 'none', basis: [], alternatives: [], dependents, ...(clause ? { clause: clause.label } : {}), notes: [...notes, 'The rules could not attach this word to another word of the sentence.'], attached: clamp01(a.attached), analyzer: a.analyzer };
  return {
    status: r.status, relation: r.relation, label: r.label, headSurface: word(r.head), basis: r.basis.slice(0, 6), confidence: clamp01(r.confidence),
    alternatives: (r.alternatives ?? []).slice(0, 4).map((x) => ({ relation: x.relation, headSurface: word(x.head), confidence: clamp01(x.confidence), why: x.why })),
    dependents, ...(clause ? { clause: clause.label } : {}), notes, attached: clamp01(a.attached), analyzer: a.analyzer,
  };
}

// ───────────────────────────── internals ─────────────────────────────

/** The letters that belong to a language's script: the adapter states the script; Latin is the default. */
const SCRIPT_TEST: Record<string, { name: string; re: RegExp }> = {
  Latn: { name: 'Latin', re: /\p{Script=Latin}/u },
  Deva: { name: 'Devanagari', re: /\p{Script=Devanagari}/u },
  Thai: { name: 'Thai', re: /\p{Script=Thai}/u },
  Hebr: { name: 'Hebrew', re: /\p{Script=Hebrew}/u },
  Grek: { name: 'Greek', re: /\p{Script=Greek}/u },
};
const scriptName = (L: Lang): string => (SCRIPT_TEST[L.adapter.script] ?? SCRIPT_TEST.Latn).name;
const hasScriptLetter = (L: Lang, s: string): boolean => (SCRIPT_TEST[L.adapter.script] ?? SCRIPT_TEST.Latn).re.test(s);

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const same = (a: string, b: string): boolean => a.replace(/\s+/gu, ' ').trim() === b.replace(/\s+/gu, ' ').trim();
const formId = (L: Lang, surface: string): string => `form:${L.lang}:${L.adapter.normalize(surface)}`;

function analyzerIdOf(L: Lang, a: AnalyzedToken[]): string { return a[0]?.analyzer ?? `adapter-${L.lang}@${L.adapter.version}`; }

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

function describe(L: Lang, c: AnalysisCandidate): string | undefined {
  try {
    const line = L.adapter.describeMorph?.(c.morph, c.pos);
    return line ? line : undefined;
  } catch { return undefined; }
}

function lineOf(t: RawToken, c: AnalysisCandidate | undefined): WordLine {
  return {
    surface: t.surface, lemma: c?.lemma, pos: c?.pos, gloss: c && !c.unconfirmed ? c.gloss : undefined,
    confidence: c ? clamp01(c.confidence) : 0, provenance: c ? provenanceOf(c) : 'none',
  };
}

/** The analyser's patterns (constructions) that cover at least one selected word. */
function patternsFor(L: Lang, tokens: RawToken[], analyses: AnalyzedToken[], selected: number[]): PatternCandidate[] {
  try {
    const set = new Set(selected);
    return L.adapter.detectPatterns(tokens, analyses).filter((p) => p.tokenIndexes.some((i) => set.has(i)));
  } catch { return []; }
}

const FORM_CONSTRUCTIONS: Record<string, { title: string; explanation: string }> = {
  'definite-accusative-singular': { title: 'Definite accusative singular', explanation: 'The ending marks a definite noun as the direct object.' },
  'definite-nominative-singular': { title: 'Definite nominative singular', explanation: 'The ending marks a definite noun as the subject.' },
  'definite-plural': { title: 'Definite plural', explanation: 'The plural form with “the” added at the end.' },
};

/** The feature structure as the Repository's resolver flattens it (same keys, same values, sorted), so ids agree. */
function flatFeatures(morph: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(morph ?? {}).sort()) {
    const v = (morph as Record<string, unknown>)[k];
    if (typeof v === 'string' && v) out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
  }
  return out;
}

/**
 * Constructions the form's own features show. Only what the features state, nothing inferred. The unit id is the
 * Repository's morphological-construction id (`morph:<lang>:<pos>:<feature key>`), the same id the linguistics
 * resolver stores and GoPractice's grammar assessments name, so the learner model's grammar estimate for this
 * construction reaches the card. The pack-level `id` (e.g. `definite-accusative-singular`) only selects an explanation.
 */
function formConstructions(L: Lang, c: AnalysisCandidate): ConstructionNote[] {
  if (!c.pos || c.unconfirmed) return [];
  const feats = flatFeatures(c.morph as Record<string, unknown> | undefined);
  if (!Object.keys(feats).length) return [];
  const unitId = unitIds.morph(L.lang, c.pos, unitIds.featureKey(feats));
  const explained = L.lang === 'sq' && c.pos === 'NOUN' && feats.Definite === 'Def'
    ? (feats.Number === 'Plur' ? 'definite-plural' : feats.Number === 'Sing' && feats.Case === 'Acc' ? 'definite-accusative-singular' : feats.Number === 'Sing' && feats.Case === 'Nom' ? 'definite-nominative-singular' : undefined)
    : undefined;
  if (explained) {
    const t = FORM_CONSTRUCTIONS[explained];
    return [{ id: explained, unitId, title: t.title, explanation: t.explanation, confidence: clamp01(c.confidence), source: 'form' }];
  }
  const title = describe(L, c) ?? unitIds.featureKey(feats);
  return [{ id: `form:${unitIds.featureKey(feats)}`, unitId, title, explanation: 'The form shows these features; the pack has no separate explanation for this combination.', confidence: clamp01(c.confidence), source: 'form' }];
}

function phrasesFor(L: Lang, tokens: RawToken[], analyses: AnalyzedToken[], selected: number[]): PhraseCandidate[] {
  try {
    const set = new Set(selected);
    return L.adapter.detectPhrases(tokens, analyses).filter((p) => p.tokenIndexes.some((i) => set.has(i)));
  } catch { return []; }
}

function itemIdsFor(L: Lang, selected: number[], tokens: RawToken[], best: Array<AnalysisCandidate | undefined>, phrases: PhraseCandidate[], single: boolean): string[] {
  const ids: string[] = [];
  selected.slice(0, MAX_ITEM_IDS).forEach((i, k) => {
    const c = best[k];
    const creditable = c?.lemma && !c.unconfirmed && c.confidence >= LEMMA_MIN_CONFIDENCE;
    ids.push(creditable ? `lemma:${L.lang}:${c!.lemma}${c!.pos ? ':' + c!.pos : ''}` : formId(L, tokens[i].surface));
  });
  if (!single) for (const p of phrases) if (p.pattern?.length) ids.push(`phrase:${L.lang}:${p.pattern.join('_')}`);
  return [...new Set(ids)];
}
