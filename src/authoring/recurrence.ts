/**
 * Controlled-text authoring tools, part 2: the recurrence report. A core word should come back in many different
 * texts, in several of its forms, neither introduced and abandoned nor drilled five times in one paragraph. This
 * module measures that; a designer reads the result. It never changes a text. (Not a gate on the learner.)
 */
import { firstLemmaOccurrences, firstStageOfLemmas, type CorpusAnalysis, type Occurrence } from './analyse';

export type LemmaFlag = 'once' | 'twice' | 'single-text' | 'one-form' | 'clustered' | 'late-gap';
export type UnitFlag = 'once' | 'single-text';

/** Parts of speech that inflect: a lemma of one of these met in a single form is flagged `one-form`. */
export const INFLECTING_POS: readonly string[] = ['NOUN', 'VERB', 'ADJ', 'PRON', 'DET', 'AUX'];

export interface RecurrenceOptions {
  /** `late-gap`: a gap of MORE than this many running words between two occurrences. Default 3000. */
  maxGapWords?: number;
  /** `clustered`: at least this many occurrences … Default 4. */
  clusterCount?: number;
  /** … within this many running words (the span from first to last is below it). Default 60. */
  clusterWindow?: number;
  /** `one-form`: needs at least this many occurrences … Default 6. */
  oneFormMinOccurrences?: number;
  /** … and MORE than this share in one form. Default 0.85. */
  oneFormShare?: number;
  /** Parts of speech that inflect (for `one-form`). Default INFLECTING_POS. */
  inflectingPos?: readonly string[];
}

export interface Where { docId: string; sentence: number }
export interface GapStats { min: number; median: number; max: number }

export interface LemmaStat {
  key: string;
  lemma: string;
  pos: string;
  total: number;
  byStage: Record<string, number>;
  documents: number;
  first: Where;
  /** Gaps between successive occurrences, in running words; absent with fewer than two occurrences. */
  gapWords?: GapStats;
  /** The same in documents (0 = the next occurrence is in the same text). */
  gapDocs?: GapStats;
  forms: Array<{ form: string; count: number }>;
  flags: LemmaFlag[];
}

export interface FormStat { form: string; count: number; lemmas: string[] }

export interface StageStat {
  stage: string;
  documents: number;
  words: number;
  sentences: number;
  distinctLemmas: number;
  /** Lemmas whose earliest stage is this one. */
  newLemmas: number;
  /** Distinct lemmas up to and including this stage. */
  cumulativeLemmas: number;
  guesses: number;
  unread: number;
}

export interface DocStat {
  id: string;
  title: string;
  stage: string;
  words: number;
  newLemmas: number;
  newPer100: number;
  newConstructions: string[];
  guesses: number;
  unread: number;
}

export interface UnitStat {
  key: string;
  title: string;
  occurrences: number;
  documents: number;
  first: Where;
  flags: UnitFlag[];
}

export interface RecurrenceReport {
  lang: string;
  totalWords: number;
  options: Required<RecurrenceOptions>;
  lemmas: LemmaStat[];
  forms: FormStat[];
  stages: StageStat[];
  docs: DocStat[];
  constructions: UnitStat[];
  phrases: UnitStat[];
}

const gapStats = (gaps: number[]): GapStats | undefined => {
  if (gaps.length === 0) return undefined;
  const s = [...gaps].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return { min: s[0], median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2, max: s[s.length - 1] };
};

const byCountThenAlpha = (a: { form: string; count: number }, b: { form: string; count: number }) => b.count - a.count || (a.form < b.form ? -1 : a.form > b.form ? 1 : 0);

function lemmaStats(list: Occurrence[], o: Required<RecurrenceOptions>): LemmaStat {
  const head = list[0];
  const byStage: Record<string, number> = {};
  const forms = new Map<string, number>();
  const docIds = new Set<string>();
  const docIdx = new Set<number>();
  for (const x of list) {
    byStage[x.stage] = (byStage[x.stage] ?? 0) + 1;
    forms.set(x.form, (forms.get(x.form) ?? 0) + 1);
    docIds.add(x.docId);
    docIdx.add(x.docIndex);
  }
  const formList = [...forms].map(([form, count]) => ({ form, count })).sort(byCountThenAlpha);
  const gapW: number[] = [];
  const gapD: number[] = [];
  for (let i = 1; i < list.length; i++) { gapW.push(list[i].position - list[i - 1].position); gapD.push(list[i].docIndex - list[i - 1].docIndex); }
  const flags: LemmaFlag[] = [];
  if (list.length === 1) flags.push('once');
  if (list.length === 2) flags.push('twice');
  if (docIds.size === 1 && list.length >= 3) flags.push('single-text');
  if (list.length >= o.oneFormMinOccurrences && formList[0].count / list.length > o.oneFormShare && o.inflectingPos.includes(head.pos)) flags.push('one-form');
  for (let i = 0; i + o.clusterCount - 1 < list.length; i++) {
    if (list[i + o.clusterCount - 1].position - list[i].position < o.clusterWindow) { flags.push('clustered'); break; }
  }
  if (gapW.some((g) => g > o.maxGapWords)) flags.push('late-gap');
  return {
    key: head.key, lemma: head.lemma, pos: head.pos, total: list.length, byStage, documents: docIds.size,
    first: { docId: head.docId, sentence: head.sentence }, gapWords: gapStats(gapW), gapDocs: gapStats(gapD), forms: formList, flags,
  };
}

function unitStats(hits: Array<{ key: string; title: string; docId: string; sentence: number }>): UnitStat[] {
  const map = new Map<string, typeof hits>();
  for (const h of hits) { const l = map.get(h.key); if (l) l.push(h); else map.set(h.key, [h]); }
  return [...map.values()].map((l) => {
    const docs = new Set(l.map((h) => h.docId)).size;
    const flags: UnitFlag[] = [];
    if (l.length === 1) flags.push('once');
    if (docs === 1 && l.length >= 3) flags.push('single-text');
    return { key: l[0].key, title: l[0].title, occurrences: l.length, documents: docs, first: { docId: l[0].docId, sentence: l[0].sentence }, flags };
  });
}

export function recurrenceReport(analysis: CorpusAnalysis, opts: RecurrenceOptions = {}): RecurrenceReport {
  const o: Required<RecurrenceOptions> = {
    maxGapWords: opts.maxGapWords ?? 3000, clusterCount: opts.clusterCount ?? 4, clusterWindow: opts.clusterWindow ?? 60,
    oneFormMinOccurrences: opts.oneFormMinOccurrences ?? 6, oneFormShare: opts.oneFormShare ?? 0.85, inflectingPos: opts.inflectingPos ?? INFLECTING_POS,
  };
  const known = analysis.occurrences.filter((x) => x.kind === 'lemma');
  const perLemma = new Map<string, Occurrence[]>();
  for (const x of known) { const l = perLemma.get(x.key); if (l) l.push(x); else perLemma.set(x.key, [x]); }
  // Map keeps insertion order = order of first occurrence in the reading order
  const lemmas = [...perLemma.values()].map((l) => lemmaStats(l, o));

  const formMap = new Map<string, { count: number; lemmas: Set<string> }>();
  for (const x of known) {
    const f = formMap.get(x.form) ?? { count: 0, lemmas: new Set<string>() };
    f.count++; f.lemmas.add(x.key); formMap.set(x.form, f);
  }
  const forms = [...formMap].map(([form, f]) => ({ form, count: f.count, lemmas: [...f.lemmas].sort() })).sort(byCountThenAlpha);

  const firstStage = firstStageOfLemmas(analysis);
  const newByStage = new Map<string, number>();
  for (const s of firstStage.values()) newByStage.set(s, (newByStage.get(s) ?? 0) + 1);
  let cumulative = 0;
  const stages: StageStat[] = analysis.stageOrder.map((stage) => {
    const docs = analysis.docs.filter((d) => d.stage === stage);
    const distinct = new Set(known.filter((x) => x.stage === stage).map((x) => x.key));
    cumulative += newByStage.get(stage) ?? 0;
    return {
      stage, documents: docs.length, words: docs.reduce((n, d) => n + d.words, 0), sentences: docs.reduce((n, d) => n + d.sentences, 0),
      distinctLemmas: distinct.size, newLemmas: newByStage.get(stage) ?? 0, cumulativeLemmas: cumulative,
      guesses: docs.reduce((n, d) => n + d.guesses, 0), unread: docs.reduce((n, d) => n + d.unread, 0),
    };
  });

  const firstLemma = firstLemmaOccurrences(analysis);
  const newInDoc = new Map<string, number>();
  for (const x of firstLemma.values()) newInDoc.set(x.docId, (newInDoc.get(x.docId) ?? 0) + 1);
  const seenConstruction = new Set<string>();
  const newConstructions = new Map<string, string[]>();
  for (const c of analysis.constructions) {
    if (seenConstruction.has(c.key)) continue;
    seenConstruction.add(c.key);
    const l = newConstructions.get(c.docId); if (l) l.push(c.key); else newConstructions.set(c.docId, [c.key]);
  }
  const docs: DocStat[] = analysis.docs.map((d) => {
    const n = newInDoc.get(d.id) ?? 0;
    return {
      id: d.id, title: d.title, stage: d.stage, words: d.words, newLemmas: n, newPer100: d.words ? (n * 100) / d.words : 0,
      newConstructions: newConstructions.get(d.id) ?? [], guesses: d.guesses, unread: d.unread,
    };
  });

  return {
    lang: analysis.lang, totalWords: analysis.totalWords, options: o, lemmas, forms, stages, docs,
    constructions: unitStats(analysis.constructions), phrases: unitStats(analysis.phrases.map((p) => ({ key: p.key, title: p.display, docId: p.docId, sentence: p.sentence }))),
  };
}

export { renderRecurrenceMarkdown, type MarkdownOptions } from './recurrenceMarkdown';
