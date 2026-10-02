/**
 * Controlled-text authoring tools, part 1: read a course's own documents through a `LanguageAdapter` and list, in
 * reading order, every word with its lemma, part of speech and form, and every construction and phrase unit.
 *
 * These tools are for the people who WRITE the course texts. They read documents and print reports; they never
 * change a text, a tag or a status, and nothing here is a gate on the learner: a learner may read anything.
 * Language-neutral: all language knowledge comes through the adapter. Pure: no file system.
 */
import type { LanguageAdapter } from '../core/adapters';
import type { CorpusDocument } from '../ingest/format';

/** The stage key of documents whose stage is not known. */
export const NO_STAGE = '?';

/** How an occurrence counts. 'lemma': a first reading with a lemma that the adapter's data vouches for. */
export type OccurrenceKind = 'lemma' | 'guess' | 'unread';

export interface Occurrence {
  /** `lemma|POS`; `?form` for a token with no usable reading. */
  key: string;
  lemma: string;
  pos: string;
  /** The adapter-normalized written form. */
  form: string;
  kind: OccurrenceKind;
  docId: string;
  /** Position of the document in the given (reading) order, from 0. */
  docIndex: number;
  stage: string;
  /** Sentence index inside the document, from 0. */
  sentence: number;
  /** Running word position in the whole corpus, from 0 (every word token counts, also unit pieces). */
  position: number;
}

export interface ConstructionHit {
  key: string;
  title: string;
  docId: string;
  docIndex: number;
  stage: string;
  sentence: number;
  position: number;
}

export interface PhraseHit {
  /** The pattern's normalized tokens joined by a space. */
  key: string;
  display: string;
  docId: string;
  docIndex: number;
  stage: string;
  sentence: number;
  position: number;
}

export interface DocTotals {
  id: string;
  title: string;
  docIndex: number;
  stage: string;
  sentences: number;
  /** Running words (every word token). */
  words: number;
  /** Occurrences counted as a known lemma. */
  lemmaOccurrences: number;
  guesses: number;
  unread: number;
}

export interface CorpusAnalysis {
  lang: string;
  docs: DocTotals[];
  occurrences: Occurrence[];
  constructions: ConstructionHit[];
  phrases: PhraseHit[];
  totalWords: number;
  /** Stage keys in reading order (first appearance); NO_STAGE, when present, is last. */
  stageOrder: string[];
}

export interface AnalyseOptions {
  /** The stage key of a document (derived by the caller from the catalogue). Absent or undefined → '?'. */
  stageOf?: (doc: CorpusDocument) => string | undefined;
}

/** The sentence texts of a document in reading order, as the importer segments them (same rule as ingest/plan). */
export function sentenceTextsOfDocument(doc: CorpusDocument, adapter: LanguageAdapter): string[] {
  const out: string[] = [];
  for (const sec of doc.sections) {
    for (const par of sec.paragraphs) {
      if ('sentences' in par) for (const s of par.sentences) out.push(s.text);
      else for (const sp of adapter.segmentSentences(par.text)) out.push(sp.text);
    }
  }
  return out;
}

export function analyseCorpus(docs: readonly CorpusDocument[], adapter: LanguageAdapter, opts: AnalyseOptions = {}): CorpusAnalysis {
  const occurrences: Occurrence[] = [];
  const constructions: ConstructionHit[] = [];
  const phrases: PhraseHit[] = [];
  const totals: DocTotals[] = [];
  const stageSeen: string[] = [];
  let position = 0;

  docs.forEach((doc, docIndex) => {
    const stage = opts.stageOf?.(doc) || NO_STAGE;
    if (!stageSeen.includes(stage)) stageSeen.push(stage);
    const t: DocTotals = { id: doc.id, title: doc.title, docIndex, stage, sentences: 0, words: 0, lemmaOccurrences: 0, guesses: 0, unread: 0 };
    sentenceTextsOfDocument(doc, adapter).forEach((text, sentence) => {
      t.sentences++;
      const tokens = adapter.tokenize(text);
      const analysed = adapter.analyze(tokens);
      // running word position of each token (only words advance it)
      const wordPos: number[] = [];
      let p = position;
      for (const tok of tokens) { wordPos.push(p); if (tok.isWord) p++; }
      analysed.forEach((a, i) => {
        if (!a.token.isWord) return;
        const first = a.candidates[0];
        // a non-head piece of a lexical unit is a word of the text but not an occurrence of a lemma of its own
        if (first?.unit && first.unit.head !== i) return;
        const form = a.token.normalized;
        const base = { form, docId: doc.id, docIndex, stage, sentence, position: wordPos[i] };
        if (!first || !first.lemma) {
          occurrences.push({ ...base, key: `?${form}`, lemma: `?${form}`, pos: '?', kind: 'unread' });
          t.unread++;
        } else {
          const pos = first.pos ?? 'X';
          const kind: OccurrenceKind = first.unconfirmed ? 'guess' : 'lemma';
          occurrences.push({ ...base, key: `${first.lemma}|${pos}`, lemma: first.lemma, pos, kind });
          if (kind === 'guess') t.guesses++; else t.lemmaOccurrences++;
        }
      });
      const at = (indexes: readonly number[]) => (indexes.length ? wordPos[Math.min(...indexes)] ?? position : position);
      for (const c of adapter.detectPatterns(tokens, analysed)) {
        constructions.push({ key: c.key, title: c.title, docId: doc.id, docIndex, stage, sentence, position: at(c.tokenIndexes) });
      }
      for (const ph of adapter.detectPhrases(tokens, analysed)) {
        phrases.push({ key: ph.pattern.join(' '), display: ph.display, docId: doc.id, docIndex, stage, sentence, position: at(ph.tokenIndexes) });
      }
      t.words += p - position;
      position = p;
    });
    totals.push(t);
  });

  const stageOrder = stageSeen.filter((s) => s !== NO_STAGE);
  if (stageSeen.includes(NO_STAGE)) stageOrder.push(NO_STAGE);
  return { lang: adapter.lang, docs: totals, occurrences, constructions, phrases, totalWords: position, stageOrder };
}

/** The first occurrence of every known lemma (kind 'lemma'), in reading order. */
export function firstLemmaOccurrences(analysis: CorpusAnalysis): Map<string, Occurrence> {
  const out = new Map<string, Occurrence>();
  for (const o of analysis.occurrences) if (o.kind === 'lemma' && !out.has(o.key)) out.set(o.key, o);
  return out;
}

/** The earliest stage (in `analysis.stageOrder`) in which each known lemma occurs. */
export function firstStageOfLemmas(analysis: CorpusAnalysis): Map<string, string> {
  const rank = new Map(analysis.stageOrder.map((s, i) => [s, i] as const));
  const out = new Map<string, string>();
  for (const o of analysis.occurrences) {
    if (o.kind !== 'lemma') continue;
    const cur = out.get(o.key);
    if (cur === undefined || (rank.get(o.stage) ?? 0) < (rank.get(cur) ?? 0)) out.set(o.key, o.stage);
  }
  return out;
}
