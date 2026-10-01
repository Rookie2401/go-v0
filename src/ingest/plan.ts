/**
 * Planning: a validated CorpusDocument → everything the importer needs, computed purely in memory
 * (segmentation, tokenization, analysis, phrases, patterns, publication decision, content signature).
 * Nothing here touches a store. Row ids that depend on the final sentence key (tokens, analyses, occurrences)
 * are produced later by `materializeSentence`, once the importer has decided which existing sentences survive.
 */
import type {
  AdapterRegistry, AnalysisCandidate, AnalysisOrigin, AnalyzedToken, ContentNote, DictionaryEntry, EnglishRescue, GrammarPattern, LanguageAdapter, Lemma,
  PartOfSpeech, PatternCandidate, PatternOccurrence, Phrase, PhraseCandidate, PhraseOccurrence, RawToken, ReviewStatus, Token, TokenAnalysis,
} from '../core';
import { hash, ids } from '../core';
import { analysisCoverage, type AnalysisCoverage } from '../adapters/shared';
import { anchorDocumentNotes, workIdOf, type CorpusDocument, type DocCorrection, type DocNote, type DocSpan } from './format';
import { computePublished, type PublicationDecision } from './publish';

export const INGEST_TOOL = 'ingest@2';
export const IMPORT_ANALYZER = 'import@2';

/** A note ready to be stored once the sentence's final key is known. */
export interface PlannedNote {
  kind: ContentNote['kind'];
  body: string;
  /** Indexes (into the sentence's tokens) of the tokens the note's start/end cover; absent for a whole-sentence note. */
  tokenIndexes?: number[];
  spans?: Array<{ start: number; end: number; label: string }>;
  topics?: string[];
  provenance: 'human' | 'machine';
  reviewStatus: ReviewStatus;
  by?: string;
}

export interface PlannedSentence {
  /** Author-supplied id (stable key), when given. */
  authorId?: string;
  /** ids.sentenceKey(text, repeat) — the key when there is no author id. */
  hashKey: string;
  text: string;
  english?: string;
  verseRefs?: string[];
  /** Display name of the speaker (Sentence.speaker). */
  speaker?: string;
  paragraphIndex: number;
  paraStart: number;
  paraEnd: number;
  tokens: RawToken[];
  /** Adapter analysis with author spans already applied (span ⇒ that token's candidates are the author's). */
  analyzed: AnalyzedToken[];
  /** Token indexes whose analysis came from an author span. */
  spanTokens: Set<number>;
  corrections: DocCorrection[];
  phrases: PhraseCandidate[];
  patterns: PatternCandidate[];
  notes: PlannedNote[];
}

export interface PlannedParagraph { sectionIndex: number; originalText: string }

export interface DocumentPlan {
  doc: CorpusDocument;
  textId: string;
  adapter: LanguageAdapter;
  analyzerName: string;
  paragraphs: PlannedParagraph[];
  sentences: PlannedSentence[];
  coverage: AnalysisCoverage;
  decision: PublicationDecision;
  /** Hash of everything the import would write (apart from timestamps): equal signature ⇒ nothing to do. */
  signature: string;
  nonNfcBlocks: number;
  tokenCount: number;
  /** `Text.workId` (from `doc.work`), when the document names a work. */
  workId?: string;
  /**
   * The analyzer name of the installed dictionary; `tokens` = words only the dictionary knew (analysed from it),
   * `alongside` = words the adapter analyses that also got the dictionary's entries as alternatives beside its own.
   */
  dictionary?: { tool: string; tokens: number; alongside: number };
  noteCount: number;
}

export interface PlanOptions {
  /** Dictionary entries by adapter-normalized form (any word of the text; one the adapter analyses gets them beside its own analysis). */
  dictionary?: ReadonlyMap<string, readonly DictionaryEntry[]>;
  /** `DictionaryInfo.id` of the dictionary the entries came from: part of the analyzer name and of the signature. */
  dictionaryId?: string;
}

const defaultSeparator = ' ';

/** An author's span: origin `corpus` (the text's own supplier), source `import@2`. */
function toCandidate(sp: DocSpan): AnalysisCandidate {
  return { lemma: sp.lemma, pos: sp.pos, morph: sp.morph ? { ...sp.morph } : {}, gloss: sp.gloss, confidence: sp.confidence ?? 1, origin: 'corpus', sourceId: IMPORT_ANALYZER };
}

/** The sentence texts of a document in reading order, exactly as `planDocument` will segment them. */
export function sentenceTextsOf(doc: CorpusDocument, adapter: LanguageAdapter): string[] {
  const out: string[] = [];
  for (const sec of doc.sections) {
    for (const par of sec.paragraphs) {
      if ('sentences' in par) for (const s of par.sentences) out.push(s.text);
      else for (const sp of adapter.segmentSentences(par.text)) out.push(sp.text);
    }
  }
  return out;
}

/** A candidate that says nothing about the word (for instance a decoding-only candidate) does not count as an analysis. */
const says = (c: AnalysisCandidate): boolean => !!(c.lemma || c.pos || c.gloss || c.role || c.definition || c.register?.length);
const unanalysed = (a: AnalyzedToken): boolean => a.token.isWord && !a.candidates.some(says);

/** The normalized forms of word tokens the adapter cannot analyse. */
export function collectUnanalysedForms(doc: CorpusDocument, registry: AdapterRegistry): Set<string> {
  const adapter = registry.get(doc.lang);
  const forms = new Set<string>();
  for (const text of sentenceTextsOf(doc, adapter)) {
    const tokens = adapter.tokenize(text);
    for (const a of adapter.analyze(tokens)) if (unanalysed(a)) forms.add(a.token.normalized);
  }
  return forms;
}

/** The normalized forms of EVERY word token: what the dictionary pre-pass looks up (it also stands beside the adapter's analyses). */
export function collectWordForms(doc: CorpusDocument, registry: AdapterRegistry): Set<string> {
  const adapter = registry.get(doc.lang);
  const forms = new Set<string>();
  for (const text of sentenceTextsOf(doc, adapter)) for (const t of adapter.tokenize(text)) if (t.isWord) forms.add(t.normalized);
  return forms;
}

/**
 * What the dictionary says about a form, for display: the short glosses, the parts of speech and the distinct readings,
 * built with the same rules as `dictionaryCandidates` so the reader's view and the imported analysis cannot drift.
 */
export function dictionaryView(entries: readonly DictionaryEntry[]): { glosses: string[]; pos: PartOfSpeech[]; readings: string[] } {
  const glosses: string[] = [];
  const pos: PartOfSpeech[] = [];
  for (const e of entries) {
    for (const g of e.glosses) if (g.trim().length > 0 && !glosses.includes(g)) glosses.push(g);
    if (e.pos && !pos.includes(e.pos)) pos.push(e.pos);
  }
  return { glosses, pos, readings: readingsOf(entries) };
}

/** The distinct readings (respellings, else IPA) the entries of one form list, first one first. */
function readingsOf(entries: readonly DictionaryEntry[]): string[] {
  const out: string[] = [];
  for (const e of entries) {
    const list = e.pronunciations?.length ? e.pronunciations.map((p) => p.respelling ?? p.ipa) : [e.respelling ?? e.ipa];
    for (const r of list) if (r && !out.includes(r)) out.push(r);
  }
  return out;
}

/**
 * Dictionary entries of one form → analysis candidates (origin `dictionary`, source = `sourceId`, the dictionary id).
 * A dictionary lists what a written form can mean, so confidence is below certainty (0.6 when the form has one part of
 * speech, 0.45 when it has several); entry order is kept, the first is the best candidate and the rest become
 * alternatives. When the entries list more than one reading, the first candidate carries them all in `notes.readings`.
 */
export function dictionaryCandidates(form: string, entries: readonly DictionaryEntry[], sourceId?: string): AnalysisCandidate[] {
  const confidence = new Set(entries.map((e) => e.pos ?? '')).size > 1 ? 0.45 : 0.6;
  const readings = readingsOf(entries);
  return entries.map((e, k) => {
    const glosses = e.glosses.filter((g) => g.trim().length > 0);
    const notes: Record<string, string | string[]> = {};
    if (e.respelling) notes.respelling = e.respelling;
    if (e.ipa) notes.ipa = e.ipa;
    if (e.romanization) notes.romanization = e.romanization;
    if (glosses.length > 2) notes.senses = glosses.slice(2);
    if (e.classifiers?.length) notes.classifiers = [...e.classifiers];
    if (k === 0 && readings.length > 1) notes.readings = readings;
    return {
      lemma: form, pos: e.pos, morph: {}, confidence, origin: 'dictionary' as const, ...(sourceId ? { sourceId } : {}),
      ...(glosses.length ? { gloss: glosses.slice(0, 2).join('; ') } : {}),
      ...(e.register?.length ? { register: [...e.register] } : {}),
      ...(e.role ? { role: e.role } : {}),
      ...(e.definition ? { definition: e.definition } : {}),
      ...(Object.keys(notes).length ? { notes } : {}),
    };
  });
}

/** The analyzer name of a dictionary's analyses. */
export const dictionaryTool = (dictionaryId: string): string => `dict:${dictionaryId}`;

/** Plan one (already validated) document. Throws on any broken round-trip invariant: nothing is written by then. */
export function planDocument(doc: CorpusDocument, registry: AdapterRegistry, opts: PlanOptions = {}): DocumentPlan {
  const adapter = registry.get(doc.lang);
  const dictId = opts.dictionaryId ?? 'dictionary';
  const dictTool = opts.dictionary ? dictionaryTool(dictId) : undefined;
  let dictTokens = 0;
  let dictAlongside = 0;
  const textId = ids.text(doc.lang, doc.id);
  const analyzerName = `adapter-${doc.lang}@${adapter.version}`;
  const speakerName = (id: string | undefined) => (id !== undefined ? doc.speakers?.[id] ?? id : undefined);

  const paragraphs: PlannedParagraph[] = [];
  const sentences: PlannedSentence[] = [];
  const repeats = new Map<string, number>();
  let nonNfcBlocks = 0;

  const push = (
    text: string, paragraphIndex: number, paraStart: number, paraEnd: number,
    extra: { authorId?: string; english?: string; verseRefs?: string[]; speaker?: string; spans?: DocSpan[]; corrections?: DocCorrection[]; notes?: DocNote[] },
  ) => {
    const repeat = repeats.get(text) ?? 0;
    repeats.set(text, repeat + 1);
    const tokens = adapter.tokenize(text);
    for (const t of tokens) {
      if (text.slice(t.start, t.end) !== t.surface) throw new Error(`adapter ${doc.lang}: token offsets do not round-trip in "${text}": "${t.surface}" at ${t.start}`);
    }
    const base = adapter.analyze(tokens);
    if (base.length !== tokens.length) throw new Error(`adapter ${doc.lang}: analyze() returned ${base.length} for ${tokens.length} tokens`);
    const analyzed: AnalyzedToken[] = base.map((a) => ({ ...a, candidates: a.candidates.map((c) => ({ ...c })) }));
    // dictionary: a word the adapter says nothing about is analysed from it; a word the adapter analyses keeps its analysis
    // unchanged and only gets a marker (and a pronunciation when it has none) - the entries are never copied onto the token
    const beside = new Map<number, AnalysisCandidate[]>();
    if (opts.dictionary && dictTool) {
      analyzed.forEach((a, ti) => {
        const entries = a.token.isWord ? opts.dictionary!.get(tokens[ti].normalized) : undefined;
        if (!entries?.length) return;
        const cands = dictionaryCandidates(tokens[ti].normalized, entries, dictId);
        if (unanalysed(a)) { analyzed[ti] = { token: tokens[ti], candidates: cands, analyzer: dictTool }; dictTokens++; }
        else beside.set(ti, cands);
      });
    }
    const spanTokens = new Set<number>();
    for (const sp of extra.spans ?? []) {
      const ti = tokens.findIndex((t) => t.start === sp.start && t.end === sp.end);
      if (ti < 0) throw new Error(`span [${sp.start}, ${sp.end}) in "${text}" is not on a token`);
      const cand = toCandidate(sp);
      analyzed[ti] = {
        token: tokens[ti],
        candidates: [cand, ...(sp.alternatives ?? []).map((a) => ({
          lemma: a.lemma, pos: a.pos, morph: a.morph ? { ...a.morph } : {}, confidence: a.confidence, origin: 'corpus' as const, sourceId: IMPORT_ANALYZER,
        }))],
        analyzer: IMPORT_ANALYZER,
      };
      spanTokens.add(ti);
    }
    // phrases and patterns are detected on the adapter's own analysis, before the dictionary marker is added
    const phrases = adapter.detectPhrases(tokens, analyzed);
    const patterns = adapter.detectPatterns(tokens, analyzed);
    for (const [ti, cands] of beside) {
      if (spanTokens.has(ti)) continue; // an author's span wins outright
      const [first, ...rest] = analyzed[ti].candidates.map((c) => ({ ...c }));
      const hasPronunciation = !!(first.notes && (first.notes.respelling || first.notes.ipa || first.notes.translit || first.notes.romanization));
      const withPron = hasPronunciation ? undefined : cands.find((c) => c.notes?.respelling || c.notes?.ipa);
      const readings = cands[0].notes?.readings;
      const added: Record<string, string | string[]> = {
        ...(withPron?.notes?.respelling ? { respelling: withPron.notes.respelling } : {}), ...(withPron?.notes?.ipa ? { ipa: withPron.notes.ipa } : {}),
        ...(withPron ? { pronunciationSource: dictId } : {}),
        ...(readings ? { readings } : {}),
        // a marker only: the entries stay in the installed dictionary and are asked for at display time, never copied per token
        dictionary: dictId,
      };
      first.notes = { ...(first.notes ?? {}), ...added };
      analyzed[ti] = { ...analyzed[ti], candidates: [first, ...rest] };
      dictAlongside++;
    }
    sentences.push({
      authorId: extra.authorId, hashKey: ids.sentenceKey(text, repeat), text, english: extra.english, verseRefs: extra.verseRefs ? [...extra.verseRefs] : undefined,
      speaker: extra.speaker, paragraphIndex, paraStart, paraEnd, tokens, analyzed, spanTokens, corrections: extra.corrections ?? [],
      phrases, patterns, notes: (extra.notes ?? []).map((n) => planNote(n, tokens)),
    });
  };

  doc.sections.forEach((sec, si) => {
    for (const par of sec.paragraphs) {
      const paragraphIndex = paragraphs.length;
      if ('sentences' in par) {
        const sep = par.separator ?? defaultSeparator;
        let original = '';
        const offsets: Array<[number, number]> = [];
        par.sentences.forEach((s, k) => {
          if (k > 0) original += sep;
          offsets.push([original.length, original.length + s.text.length]);
          original += s.text;
          if (s.text !== s.text.normalize('NFC')) nonNfcBlocks++;
        });
        paragraphs.push({ sectionIndex: si, originalText: original });
        par.sentences.forEach((s, k) => {
          if (original.slice(offsets[k][0], offsets[k][1]) !== s.text) throw new Error(`paragraph offsets do not round-trip for "${s.text}"`);
          push(s.text, paragraphIndex, offsets[k][0], offsets[k][1], {
            authorId: s.id, english: s.english, verseRefs: s.verseRefs, speaker: speakerName(s.speaker), spans: s.spans, corrections: s.corrections, notes: s.notes,
          });
        });
      } else {
        if (par.text !== par.text.normalize('NFC')) nonNfcBlocks++;
        paragraphs.push({ sectionIndex: si, originalText: par.text });
        const spans = adapter.segmentSentences(par.text);
        spans.forEach((sp, k) => {
          if (par.text.slice(sp.start, sp.end) !== sp.text) throw new Error(`adapter ${doc.lang}: sentence span does not slice the paragraph`);
          push(sp.text, paragraphIndex, sp.start, sp.end, { english: par.english?.[k], verseRefs: par.verseRefs });
        });
      }
    }
  });

  // document-level notes go to the sentence whose exact text contains `match` (validation guarantees it exists)
  if (doc.notes?.length) {
    const anchors = anchorDocumentNotes(doc.notes, sentences.map((s) => s.text));
    doc.notes.forEach((n, k) => {
      const at = anchors[k];
      if (at === undefined) throw new Error(`note ${k}: no sentence contains ${JSON.stringify(n.match)}`);
      sentences[at].notes.push(planNote(n, sentences[at].tokens));
    });
  }

  const allTokens = sentences.flatMap((s) => s.tokens);
  const allAnalyzed = sentences.flatMap((s) => s.analyzed);
  const coverage = analysisCoverage(allTokens, allAnalyzed);
  const decision = computePublished(doc);
  const noteCount = sentences.reduce((n, s) => n + s.notes.length, 0);

  const signature = hash(JSON.stringify({
    v: 2, analyzerName, dict: dictTool,
    doc: {
      id: doc.id, lang: doc.lang, locale: doc.locale, title: doc.title, contentType: doc.contentType, corpus: doc.corpus, source: doc.source, review: doc.review,
      difficulty: doc.difficulty, topics: doc.topics, editorialTags: doc.editorialTags, prepTargets: doc.prepTargets, generated: doc.generated,
      scripture: doc.scripture, english: doc.english, sections: doc.sections.map((s) => ({ title: s.title, chapter: s.chapter })), work: doc.work,
    },
    paragraphs,
    sentences: sentences.map((s) => ({
      a: s.authorId, k: s.hashKey, t: s.text, e: s.english, v: s.verseRefs, sp: s.speaker, p: s.paragraphIndex, ps: s.paraStart, pe: s.paraEnd,
      an: s.analyzed.map((x) => x.candidates), ant: [...s.spanTokens], c: s.corrections, ph: s.phrases, pa: s.patterns,
      nt: s.notes.length ? s.notes : undefined,
    })),
  }));

  return {
    doc, textId, adapter, analyzerName, paragraphs, sentences, coverage, decision, signature, nonNfcBlocks, tokenCount: allTokens.length,
    ...(workIdOf(doc) ? { workId: workIdOf(doc) } : {}), ...(dictTool ? { dictionary: { tool: dictTool, tokens: dictTokens, alongside: dictAlongside } } : {}), noteCount,
  };
}

/** A document note → a planned note: defaults applied (human ⇒ approved; machine ⇒ unreviewed) and token indexes resolved. */
function planNote(n: DocNote, tokens: RawToken[]): PlannedNote {
  const provenance = n.provenance ?? 'human';
  const tokenIndexes = n.start !== undefined && n.end !== undefined
    ? tokens.map((t, i) => (t.start >= n.start! && t.end <= n.end! ? i : -1)).filter((i) => i >= 0)
    : undefined;
  return {
    kind: n.kind, body: n.body, ...(tokenIndexes?.length ? { tokenIndexes } : {}), ...(n.spans?.length ? { spans: n.spans.map((s) => ({ ...s })) } : {}),
    ...(n.topics?.length ? { topics: [...n.topics] } : {}), provenance, reviewStatus: n.reviewStatus ?? (provenance === 'human' ? 'approved' : 'unreviewed'),
    ...(n.by ? { by: n.by } : {}),
  };
}

/**
 * The `ContentNote` rows of one sentence. The note key is a stable hash of the sentence key, the kind and the body
 * (two identical notes on one sentence get a `~n` suffix), so an unchanged note keeps its id across imports; editing a
 * sentence moves its notes with it because the sentence key changes.
 */
export function buildNoteRows(plan: DocumentPlan, ps: PlannedSentence, sentenceKey: string, sentenceId: string, tokens: Token[], seen: Map<string, number>): ContentNote[] {
  return ps.notes.map((n) => {
    const base = hash(`${sentenceKey}|${n.kind}|${n.body}`);
    const repeat = seen.get(base) ?? 0;
    seen.set(base, repeat + 1);
    return {
      id: ids.note(plan.textId, repeat ? `${base}~${repeat}` : base), textId: plan.textId, lang: plan.doc.lang, sentenceId,
      ...(n.tokenIndexes?.length ? { tokenIds: n.tokenIndexes.map((i) => tokens[i].id) } : {}),
      kind: n.kind, ...(n.spans ? { spans: n.spans } : {}), body: n.body, ...(n.topics ? { topics: n.topics } : {}),
      provenance: n.provenance, reviewStatus: n.reviewStatus,
    };
  });
}

// ───────────────────────────── materialization ─────────────────────────────

export interface Catalog {
  lemmas: Map<string, Lemma>;
  phrases: Map<string, Phrase>;
  patterns: Map<string, GrammarPattern>;
}
export const newCatalog = (): Catalog => ({ lemmas: new Map(), phrases: new Map(), patterns: new Map() });

export interface SentenceRows {
  tokens: Token[];
  analyses: TokenAnalysis[];
  phraseOccurrences: PhraseOccurrence[];
  patternOccurrences: PatternOccurrence[];
  rescue?: EnglishRescue;
}

/** Build every derived row of one sentence once its final id is known. Lemma/phrase/pattern definitions go to `catalog`. */
export function materializeSentence(plan: DocumentPlan, ps: PlannedSentence, sentenceId: string, now: string, catalog: Catalog): SentenceRows {
  const { doc, textId } = plan;
  const lang = doc.lang;
  const ensureLemma = (lemma: string, pos: PartOfSpeech | undefined, gloss?: string): string => {
    const id = ids.lemma(lang, lemma, pos);
    const cur = catalog.lemmas.get(id);
    if (!cur) catalog.lemmas.set(id, { id, lang, lemma, pos, gloss });
    else if (!cur.gloss && gloss) cur.gloss = gloss;
    return id;
  };

  const tokens: Token[] = ps.tokens.map((r, ti) => ({
    id: ids.token(sentenceId, ti), sentenceId, textId, lang, index: ti, surface: r.surface, start: r.start, end: r.end,
    normalized: r.normalized, formId: ids.form(lang, r.normalized), isWord: r.isWord,
  }));

  const analyses: TokenAnalysis[] = [];
  ps.analyzed.forEach((a, ti) => {
    if (!a.candidates.length) return;
    const [best, ...rest] = a.candidates;
    // an author span's gloss is contextual (TokenAnalysis.gloss), not the lemma's dictionary gloss
    const fromSpan = ps.spanTokens.has(ti);
    // Where each candidate comes from: its own origin / source when it states them (the Thai adapter, the dictionary,
    // an author's span); otherwise a rule-derived candidate (notes.source === 'rule') is `rule` and any other adapter
    // candidate is a lexicon hit, `hand`, of `adapter-<lang>@<version>`.
    const originOf = (c: AnalysisCandidate): { origin: AnalysisOrigin; sourceId: string } => ({
      origin: c.origin ?? (c.notes?.source === 'rule' ? 'rule' : 'hand'), sourceId: c.sourceId ?? `adapter-${lang}@${plan.adapter.version}`,
    });
    const bestOrigin = originOf(best);
    const lemmaId = best.lemma ? ensureLemma(best.lemma, best.pos, fromSpan ? undefined : best.gloss) : undefined;
    const alternatives: NonNullable<TokenAnalysis['alternatives']> = rest.map((r) => {
      const o = originOf(r);
      // a dictionary entry beside a hand analysis never fills in the hand lemma's gloss; it carries its own gloss
      const besideHand = o.origin === 'dictionary' && bestOrigin.origin !== 'dictionary';
      return {
        lemmaId: r.lemma ? ensureLemma(r.lemma, r.pos, fromSpan || besideHand ? undefined : r.gloss) : undefined, pos: r.pos, morph: r.morph, confidence: r.confidence,
        ...(besideHand && r.gloss ? { gloss: r.gloss } : {}), origin: o.origin, sourceId: o.sourceId,
      };
    });
    // TODO(contract): AnalysisCandidate has no provenance field. Rule-derived candidates (clitic split, compound guess,
    // separable particle) carry notes.source === 'rule' and are stored as 'machine'; lexicon-backed ones as 'lexicon'.
    const notes = best.notes ? { ...best.notes } : undefined;
    const fromRule = notes?.source === 'rule';
    if (notes) delete notes.source;
    analyses.push({
      id: ids.analysis(tokens[ti].id, a.analyzer, 0), tokenId: tokens[ti].id, lang, lemmaId, pos: best.pos, morph: best.morph,
      ...(notes && Object.keys(notes).length ? { notes } : {}), ...(best.gloss && fromSpan ? { gloss: best.gloss } : {}),
      // variety, function and an easy target-language definition travel with the analysis (syllables are decoded on demand, never stored)
      ...(best.register?.length ? { register: [...best.register] } : {}), ...(best.role ? { role: best.role } : {}), ...(best.definition ? { definition: best.definition } : {}),
      confidence: best.confidence, provenance: fromRule ? 'machine' : 'lexicon', origin: bestOrigin.origin, sourceId: bestOrigin.sourceId, analyzer: a.analyzer, createdAt: now,
      ...(alternatives.length ? { alternatives } : {}),
    });
  });

  // reviewed human analyses supplied by the author: stored as 'human', superseding the machine/lexicon row
  const perTokenCount = new Map<string, number>();
  for (const c of ps.corrections) {
    const ti = ps.tokens.findIndex((t) => t.start === c.start && t.end === c.end);
    if (ti < 0) throw new Error(`correction [${c.start}, ${c.end}) in "${ps.text}" is not on a token`);
    const analyzer = `human:${c.by}`;
    const n = perTokenCount.get(`${ti}|${analyzer}`) ?? 0;
    perTokenCount.set(`${ti}|${analyzer}`, n + 1);
    const machine = analyses.find((x) => x.tokenId === tokens[ti].id && x.provenance !== 'human');
    analyses.push({
      id: ids.analysis(tokens[ti].id, analyzer, n), tokenId: tokens[ti].id, lang,
      lemmaId: c.lemma ? ensureLemma(c.lemma, c.pos, undefined) : undefined, pos: c.pos, morph: c.morph ? { ...c.morph } : {}, ...(c.gloss ? { gloss: c.gloss } : {}),
      confidence: 1, provenance: 'human', origin: 'reviewed', sourceId: analyzer, analyzer, createdAt: c.at, ...(machine ? { supersedes: machine.id } : {}),
    });
  }

  const phraseOccurrences: PhraseOccurrence[] = ps.phrases.map((pc) => {
    const phraseId = ids.phrase(lang, pc.pattern);
    if (!catalog.phrases.has(phraseId)) catalog.phrases.set(phraseId, { id: phraseId, lang, pattern: pc.pattern, display: pc.display, gloss: pc.gloss, kind: pc.kind });
    return {
      id: ids.phraseOccurrence(phraseId, sentenceId, pc.tokenIndexes[0]), phraseId, sentenceId, textId, lang,
      tokenIds: pc.tokenIndexes.map((i) => tokens[i].id), confidence: pc.confidence, provenance: 'lexicon' as const,
    };
  });
  const patternOccurrences: PatternOccurrence[] = ps.patterns.map((gc) => {
    const patternId = ids.pattern(lang, gc.key);
    if (!catalog.patterns.has(patternId)) catalog.patterns.set(patternId, { id: patternId, lang, key: gc.key, title: gc.title, explanation: gc.explanation });
    return {
      id: ids.patternOccurrence(patternId, sentenceId, gc.tokenIndexes[0]), patternId, sentenceId, textId, lang,
      tokenIds: gc.tokenIndexes.map((i) => tokens[i].id), confidence: gc.confidence, provenance: 'lexicon' as const,
    };
  });

  const rescue: EnglishRescue | undefined = ps.english
    ? { id: ids.rescue(sentenceId), sentenceId, textId, english: ps.english, provenance: 'human', ...(doc.english?.source ? { sourceNote: doc.english.source } : {}) }
    : undefined;

  return { tokens, analyses, phraseOccurrences, patternOccurrences, rescue };
}
