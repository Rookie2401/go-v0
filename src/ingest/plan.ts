/**
 * Planning: a validated CorpusDocument → everything the importer needs, computed purely in memory
 * (segmentation, tokenization, analysis, phrases, patterns, publication decision, content signature).
 * Nothing here touches a store. Row ids that depend on the final sentence key (tokens, analyses, occurrences)
 * are produced later by `materializeSentence`, once the importer has decided which existing sentences survive.
 */
import type {
  AdapterRegistry, AnalysisCandidate, AnalyzedToken, EnglishRescue, GrammarPattern, LanguageAdapter, Lemma, PartOfSpeech,
  PatternCandidate, PatternOccurrence, Phrase, PhraseCandidate, PhraseOccurrence, RawToken, Token, TokenAnalysis,
} from '../core';
import { hash, ids } from '../core';
import { analysisCoverage, type AnalysisCoverage } from '../adapters/shared';
import type { CorpusDocument, DocCorrection, DocSpan } from './format';
import { computePublished, type PublicationDecision } from './publish';

export const INGEST_TOOL = 'ingest@2';
export const IMPORT_ANALYZER = 'import@2';

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
}

const defaultSeparator = ' ';

function toCandidate(sp: DocSpan): AnalysisCandidate {
  return { lemma: sp.lemma, pos: sp.pos, morph: sp.morph ? { ...sp.morph } : {}, gloss: sp.gloss, confidence: sp.confidence ?? 1 };
}

/** Plan one (already validated) document. Throws on any broken round-trip invariant: nothing is written by then. */
export function planDocument(doc: CorpusDocument, registry: AdapterRegistry): DocumentPlan {
  const adapter = registry.get(doc.lang);
  const textId = ids.text(doc.lang, doc.id);
  const analyzerName = `adapter-${doc.lang}@${adapter.version}`;
  const speakerName = (id: string | undefined) => (id !== undefined ? doc.speakers?.[id] ?? id : undefined);

  const paragraphs: PlannedParagraph[] = [];
  const sentences: PlannedSentence[] = [];
  const repeats = new Map<string, number>();
  let nonNfcBlocks = 0;

  const push = (
    text: string, paragraphIndex: number, paraStart: number, paraEnd: number,
    extra: { authorId?: string; english?: string; verseRefs?: string[]; speaker?: string; spans?: DocSpan[]; corrections?: DocCorrection[] },
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
    const spanTokens = new Set<number>();
    for (const sp of extra.spans ?? []) {
      const ti = tokens.findIndex((t) => t.start === sp.start && t.end === sp.end);
      if (ti < 0) throw new Error(`span [${sp.start}, ${sp.end}) in "${text}" is not on a token`);
      const cand = toCandidate(sp);
      analyzed[ti] = {
        token: tokens[ti],
        candidates: [cand, ...(sp.alternatives ?? []).map((a) => ({ lemma: a.lemma, pos: a.pos, morph: a.morph ? { ...a.morph } : {}, confidence: a.confidence }))],
        analyzer: IMPORT_ANALYZER,
      };
      spanTokens.add(ti);
    }
    sentences.push({
      authorId: extra.authorId, hashKey: ids.sentenceKey(text, repeat), text, english: extra.english, verseRefs: extra.verseRefs ? [...extra.verseRefs] : undefined,
      speaker: extra.speaker, paragraphIndex, paraStart, paraEnd, tokens, analyzed, spanTokens, corrections: extra.corrections ?? [],
      phrases: adapter.detectPhrases(tokens, analyzed), patterns: adapter.detectPatterns(tokens, analyzed),
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
            authorId: s.id, english: s.english, verseRefs: s.verseRefs, speaker: speakerName(s.speaker), spans: s.spans, corrections: s.corrections,
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

  const allTokens = sentences.flatMap((s) => s.tokens);
  const allAnalyzed = sentences.flatMap((s) => s.analyzed);
  const coverage = analysisCoverage(allTokens, allAnalyzed);
  const decision = computePublished(doc);

  const signature = hash(JSON.stringify({
    v: 2, analyzerName,
    doc: {
      id: doc.id, lang: doc.lang, locale: doc.locale, title: doc.title, contentType: doc.contentType, corpus: doc.corpus, source: doc.source, review: doc.review,
      difficulty: doc.difficulty, topics: doc.topics, editorialTags: doc.editorialTags, prepTargets: doc.prepTargets, generated: doc.generated,
      scripture: doc.scripture, english: doc.english, sections: doc.sections.map((s) => ({ title: s.title, chapter: s.chapter })),
    },
    paragraphs,
    sentences: sentences.map((s) => ({
      a: s.authorId, k: s.hashKey, t: s.text, e: s.english, v: s.verseRefs, sp: s.speaker, p: s.paragraphIndex, ps: s.paraStart, pe: s.paraEnd,
      an: s.analyzed.map((x) => x.candidates), ant: [...s.spanTokens], c: s.corrections, ph: s.phrases, pa: s.patterns,
    })),
  }));

  return { doc, textId, adapter, analyzerName, paragraphs, sentences, coverage, decision, signature, nonNfcBlocks, tokenCount: allTokens.length };
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
    const lemmaId = best.lemma ? ensureLemma(best.lemma, best.pos, fromSpan ? undefined : best.gloss) : undefined;
    const alternatives: NonNullable<TokenAnalysis['alternatives']> = rest.map((r) => ({
      lemmaId: r.lemma ? ensureLemma(r.lemma, r.pos, fromSpan ? undefined : r.gloss) : undefined, pos: r.pos, morph: r.morph, confidence: r.confidence,
    }));
    // TODO(contract): AnalysisCandidate has no provenance field. Rule-derived candidates (clitic split, compound guess,
    // separable particle) carry notes.source === 'rule' and are stored as 'machine'; lexicon-backed ones as 'lexicon'.
    const notes = best.notes ? { ...best.notes } : undefined;
    const fromRule = notes?.source === 'rule';
    if (notes) delete notes.source;
    analyses.push({
      id: ids.analysis(tokens[ti].id, a.analyzer, 0), tokenId: tokens[ti].id, lang, lemmaId, pos: best.pos, morph: best.morph,
      ...(notes && Object.keys(notes).length ? { notes } : {}), ...(best.gloss && fromSpan ? { gloss: best.gloss } : {}),
      confidence: best.confidence, provenance: fromRule ? 'machine' : 'lexicon', analyzer: a.analyzer, createdAt: now,
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
      confidence: 1, provenance: 'human', analyzer, createdAt: c.at, ...(machine ? { supersedes: machine.id } : {}),
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
