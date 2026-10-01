/**
 * Boundary sensitivity probe: how much can a reading-unit segmentation error contaminate the learner's record?
 *
 * The same text is imported into separate memory stores, once per segmentation, through the real importer; the same
 * reading is replayed through the real GoLearn (every unit seen once with the dwell the reader would record for it,
 * and every tenth word looked up); and the real GoListen plans the audio (fixture provider, nothing synthesised).
 * Then it reports what moved:
 *   - encounters per word form (how many forms have a different count, by how much, the largest change);
 *   - words per minute as `readingPace` reports it (withheld below 30 timed units) and, labelled as ours, the
 *     ungated figure total words / total dwell;
 *   - lookups per 100 words;
 *   - audio segments GoListen would cut (and the longest, in characters).
 *
 * Segmentations are forced with explicit `sentences` in the v2 document (the tool the format provides):
 *   adapter    the paragraph is imported as raw text and the real splitter cuts it (`thAdapter.segmentSentences`);
 *   paragraph  one explicit sentence per paragraph (no splitting);
 *   spaces     one explicit sentence per run of non-space characters (every space splits).
 * A document's own authored sentences are NOT kept: each paragraph is rebuilt from its text so that all three
 * segmentations cut the same characters. Scripture documents are left out (their sentences carry verse references).
 *
 * Two dwell models: `reader` is the dwell the UI's view detector requires and records (`requiredDwellMs`: 220 ms per
 * word, at least 1.5 s, at most 12 s), so a long unit is recorded at a capped dwell; `proportional` is 220 ms per word
 * with no floor and no cap, the control that isolates the effect of the caps.
 */
import type { LanguageCode, SentenceViewed, Span, TokenHelpOpened, Work } from '../../core';
import { StoreEventBus, createMemoryStore, ids, seedBasics } from '../../core';
import { createAdapterRegistry } from '../../adapters';
import { createGoLearn } from '../../golearn';
import { createGoListen } from '../../golisten';
import { importDocuments, plainTextToDocuments } from '../../ingest';
import type { CorpusDocument, DocParagraph } from '../../ingest';
import { requiredDwellMs, MAX_DWELL_MS } from '../../ui/reader/viewDetection';
import { unitSystem } from './systems';

export type ProbeSegmentation = 'adapter' | 'paragraph' | 'spaces' | 'gold';
export type DwellModel = 'reader' | 'proportional';

export const PROBE_SEGMENTATIONS: readonly ProbeSegmentation[] = ['adapter', 'paragraph', 'spaces'];
/** Units a person decided, by paragraph text (used by the 'gold' segmentation). */
export type GoldUnits = ReadonlyMap<string, readonly Span[]>;
/** One in this many word tokens is looked up (deterministic). */
export const TAP_EVERY = 10;
const MS_PER_WORD = 220;
const USER = 'probe';
const LANG: LanguageCode = 'th';

export const dwellFor = (model: DwellModel, words: number): number =>
  model === 'reader' ? requiredDwellMs(words) : Math.max(1, Math.round(MS_PER_WORD * words));

// ───────────────────────────── building the documents ─────────────────────────────

/** The paragraph's text: raw text as it is, declared sentences joined by their separator. */
export function paragraphText(p: DocParagraph): string {
  if ('text' in p) return p.text;
  return p.sentences.map((s) => s.text).join(p.separator ?? ' ');
}

/** The same document with every paragraph cut by `seg`. Sentence-level extras (spans, notes, translations) are dropped. */
export function withSegmentation(doc: CorpusDocument, seg: ProbeSegmentation, gold?: GoldUnits): CorpusDocument {
  const rebuild = (p: DocParagraph): DocParagraph => {
    const text = paragraphText(p);
    if (seg === 'adapter') return { text };
    const spans = seg === 'gold' ? (gold?.get(text) ?? unitSystem('paragraph').split(text)) : unitSystem(seg).split(text);
    return { sentences: spans.map((s) => ({ text: s.text })), separator: ' ' };
  };
  return {
    ...doc,
    sections: doc.sections.map((s) => ({ ...s, paragraphs: s.paragraphs.map(rebuild) })),
  };
}

/** The paragraph texts of a set of documents, in order (what the unit guards and the probe read). */
export const paragraphsOfDocuments = (docs: readonly CorpusDocument[]): string[] =>
  docs.flatMap((d) => d.sections.flatMap((s) => s.paragraphs.map(paragraphText)));

const PROBE_WORK: Work = {
  id: ids.work('thailand-th', 'probe'), courseId: 'thailand-th', lang: 'th', stageId: ids.stage('thailand-th', 'g1'), role: 'subsidiary', order: 1,
  title: 'Boundary probe (synthetic)', purpose: [], bibliographyVerified: false,
  rights: { copyrightStatus: 'unknown', permission: 'unknown', canBundle: false, userImportOnly: true, audiobook: 'none', verified: false },
};

/** Plain text (one paragraph per line) as personal-copy documents, the way the in-app importer reads a book. */
export function documentsFromPlainText(text: string): CorpusDocument[] {
  return plainTextToDocuments(text, { lang: LANG, work: PROBE_WORK }).documents;
}

// ───────────────────────────── one replay ─────────────────────────────

export interface ReplayResult {
  segmentation: ProbeSegmentation;
  dwellModel: DwellModel;
  texts: number;
  units: number;
  words: number;
  /** Word tokens per unit. */
  maxWordsPerUnit: number;
  /** Units whose required dwell reaches the reader's 12 s cap (55 words or more). */
  unitsAtDwellCap: number;
  /** Encounters written per word form (itemKind 'form'): form id → count. */
  formEncounters: Map<string, number>;
  encounterRows: number;
  /** `readingPace` as GoLearn reports it. */
  wordsPerMinute: number | undefined;
  /** Total words / total dwell over every unit, ignoring GoLearn's minimum of timed units (ours, for comparison). */
  ungatedWordsPerMinute: number;
  lookupsPer100Words: number;
  paceSentences: number;
  audioSegments: number;
  audioSegmentsChars: { max: number; mean: number };
}

export async function replay(docs: readonly CorpusDocument[], segmentation: ProbeSegmentation, dwellModel: DwellModel, gold?: GoldUnits): Promise<ReplayResult> {
  const store = createMemoryStore();
  let t = Date.parse('2026-10-01T08:00:00.000Z');
  const now = () => new Date((t += 1000)).toISOString();
  const bus = new StoreEventBus(store, now);
  const adapters = createAdapterRegistry();
  const golisten = createGoListen({ store, bus, adapters, clock: now, allowFixture: true });
  const golearn = createGoLearn({ store, bus, adapters, clock: now, audioEligible: async () => false });
  golearn.attach();
  await seedBasics(store, USER, 'thailand-th');

  const forced = docs.filter((d) => !d.scripture).map((d) => withSegmentation(d, segmentation, gold));
  const report = await importDocuments(store, adapters, forced, { clock: now });
  if (!report.ok) throw new Error(`probe import refused: ${JSON.stringify(report.documents.map((d) => (d as { problems?: unknown }).problems ?? d)).slice(0, 600)}`);

  const textIds = (await store.texts.all()).filter((x) => x.lang === LANG).map((x) => x.id).sort();
  let units = 0, words = 0, maxWords = 0, capped = 0, dwellTotal = 0, wordTotal = 0, wordIndex = 0;
  const session = 'probe-1';
  for (const textId of textIds) {
    const text = (await store.texts.get(textId))!;
    const sentences = (await store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
    for (const s of sentences) {
      const toks = (await store.tokens.where('sentenceId', s.id)).sort((a, b) => a.index - b.index);
      const wordToks = toks.filter((x) => x.isWord);
      const dwellMs = dwellFor(dwellModel, wordToks.length);
      units++; words += wordToks.length; maxWords = Math.max(maxWords, wordToks.length);
      if (dwellMs >= MAX_DWELL_MS && dwellModel === 'reader') capped++;
      dwellTotal += dwellMs; wordTotal += wordToks.length;
      await bus.emit<SentenceViewed>({
        type: 'SentenceViewed', userId: USER, lang: LANG, surface: 'corpus', session, dedupeKey: `view:${USER}:${session}:${s.id}`,
        textId, sentenceId: s.id, tokenIds: toks.map((x) => x.id), dwellMs, contentVersion: text.contentVersion,
      });
      for (const w of wordToks) {
        wordIndex++;
        if (wordIndex % TAP_EVERY !== 0) continue;
        await bus.emit<TokenHelpOpened>({
          type: 'TokenHelpOpened', userId: USER, lang: LANG, surface: 'corpus', session, dedupeKey: `help:${USER}:${session}:${w.id}:1`,
          sentenceId: s.id, tokenId: w.id, itemId: w.formId, level: 1,
        });
      }
    }
  }
  await golearn.settled();
  const pace = await golearn.readingPace(USER, { lang: LANG });

  const formEncounters = new Map<string, number>();
  const rows = await store.encounters.all();
  for (const e of rows) if (e.itemKind === 'form' && e.modality === 'reading') formEncounters.set(e.itemId, (formEncounters.get(e.itemId) ?? 0) + 1);

  // GoListen plans: one segment per distinct speech text. Nothing is synthesised (runNow off).
  let audioSegments = 0, charTotal = 0, charMax = 0;
  for (const textId of textIds) {
    const r = await golisten.ensureAudio(textId, { runNow: false });
    for (const id of r.manifest.segmentIds) {
      const seg = await golisten.getSegment(id);
      const n = seg?.displayText.length ?? 0;
      audioSegments++; charTotal += n; charMax = Math.max(charMax, n);
    }
  }
  return {
    segmentation, dwellModel, texts: textIds.length, units, words, maxWordsPerUnit: maxWords, unitsAtDwellCap: capped,
    formEncounters, encounterRows: rows.length,
    wordsPerMinute: pace.wordsPerMinute,
    ungatedWordsPerMinute: dwellTotal > 0 ? wordTotal / (dwellTotal / 60000) : 0,
    lookupsPer100Words: pace.lookupsPer100Words, paceSentences: pace.sentences,
    audioSegments, audioSegmentsChars: { max: charMax, mean: audioSegments ? charTotal / audioSegments : 0 },
  };
}

// ───────────────────────────── comparing two replays ─────────────────────────────

export interface EncounterDiff {
  formsA: number;
  formsB: number;
  /** Forms with a different count in the two runs (a form missing from one run counts as 0). */
  formsDiffering: number;
  /** Forms present in one run only. */
  formsOnlyInOne: number;
  totalA: number;
  totalB: number;
  /** Sum of |countA - countB| over all forms. */
  absoluteChange: number;
  maxChange: number;
  /** Share of A's encounters that B does not have, in percent. */
  changePercentOfA: number;
  /** The largest changes: [form id, countA, countB]. */
  top: Array<[string, number, number]>;
}

export function diffEncounters(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>, topN = 8): EncounterDiff {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let differing = 0, onlyOne = 0, totalA = 0, totalB = 0, abs = 0, max = 0;
  const rows: Array<[string, number, number]> = [];
  for (const k of keys) {
    const x = a.get(k) ?? 0;
    const y = b.get(k) ?? 0;
    totalA += x; totalB += y;
    if (x !== y) { differing++; abs += Math.abs(x - y); max = Math.max(max, Math.abs(x - y)); rows.push([k, x, y]); }
    if ((x === 0) !== (y === 0)) onlyOne++;
  }
  rows.sort((p, q) => Math.abs(q[1] - q[2]) - Math.abs(p[1] - p[2]) || (p[0] < q[0] ? -1 : 1));
  return {
    formsA: a.size, formsB: b.size, formsDiffering: differing, formsOnlyInOne: onlyOne, totalA, totalB, absoluteChange: abs, maxChange: max,
    changePercentOfA: totalA ? (100 * abs) / totalA : 0, top: rows.slice(0, topN),
  };
}

export interface SensitivityReport {
  label: string;
  runs: ReplayResult[];
  /** Encounter counts of `base` against each other segmentation (adapter first; gold first when a gold is supplied). */
  diffs: Array<{ base: ProbeSegmentation; against: ProbeSegmentation; diff: EncounterDiff }>;
}

/** The whole probe over one text: every segmentation × both dwell models; encounter diffs are against `adapter`. */
export async function sensitivity(label: string, docs: readonly CorpusDocument[], opts: { segmentations?: readonly ProbeSegmentation[]; models?: readonly DwellModel[]; gold?: GoldUnits } = {}): Promise<SensitivityReport> {
  const segs = opts.segmentations ?? PROBE_SEGMENTATIONS;
  const models = opts.models ?? (['reader', 'proportional'] as const);
  const runs: ReplayResult[] = [];
  for (const m of models) for (const s of segs) runs.push(await replay(docs, s, m, opts.gold));
  const enc = (k: ProbeSegmentation) => runs.find((r) => r.segmentation === k)!.formEncounters;
  const bases: ProbeSegmentation[] = segs.includes('gold') ? ['gold', 'adapter'] : ['adapter'];
  const diffs = bases.flatMap((base) => segs.filter((s) => s !== base && !(base === 'adapter' && s === 'gold')).map((against) => ({ base, against, diff: diffEncounters(enc(base), enc(against)) })));
  return { label, runs, diffs };
}
