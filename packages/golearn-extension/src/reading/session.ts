/**
 * Reading Analysis in the page: one run at a time, started and watched from the popup.
 *
 *   text of the page ─▶ extract.ts ─▶ lexical.ts (the word table) ─▶ background (snapshot, then every word) ─▶ coverage.ts ─▶ the result
 *
 * Each stage has one input, one output and its own way to fail, and a failure is a state the popup can name, never a number:
 * a Repository that would not answer does not become 0 %, and a text that changed under the analysis does not get the old text's figure.
 *
 * The word table depends on the text and the language pack only, so it is kept (in this tab, for this page) with the text's fingerprint.
 * Analysing the same text again reads the learner's knowledge again and counts again; the text is not tokenised twice.
 *
 * Read-only: no event is recorded, nothing is marked, and the page's text stays in the tab (the background is sent unit ids).
 */
import type { LanguageAdapter } from '../../../../src/core';
import { canonicalVarietyId, hasLearningVarieties, textVarietyOf } from '../../../repository-contract/src/varieties';
import type { ReaderAdapter } from '../contract/readerAdapter';
import type { ConfirmFormsReply } from '../protocol';
import { coverageOf, type CountedVerdict } from './coverage';
import { declaredVariety, extractReadingText } from './extract';
import { buildLexicalTable, type LexicalTable } from './lexical';
import {
  MAX_WORDS_PER_MESSAGE, type KnowledgeSnapshot, type ReadingErrorCode, type ReadingKnowledgeReply, type ReadingRequest, type ReadingResult, type ReadingStage, type ReadingStatus, type WireVerdict, type WireWord,
} from './protocol';

export interface ReadingSessionDeps {
  doc: Document;
  adapters: ReaderAdapter[];
  /** The analysers this build has. */
  languages: readonly string[];
  adapterOf(languageId: string): LanguageAdapter | undefined;
  loadAnalyser?(languageId: string): Promise<unknown>;
  /** The learner's reading language, when the popup did not say one. */
  defaultLanguage?(): Promise<string | undefined>;
  confirmForms?: (forms: string[], languageId: string) => Promise<ConfirmFormsReply | undefined>;
  knowledge(req: { op: 'snapshot'; languageId: string } | { op: 'classify'; languageId: string; varietyId?: string; snapshot: string; words: WireWord[] }): Promise<ReadingKnowledgeReply | undefined>;
  now?: () => number;
  /** How many times a run starts its batches again when the Repository changed under it. */
  maxRestarts?: number;
}

const MESSAGES: Record<ReadingErrorCode, string> = {
  'unsupported-page': 'GoLearn does not read this page.',
  'unsupported-language': 'This build has no language pack for that language.',
  'variety-required': 'Choose which variety of the language this text is in.',
  'no-text': 'No readable text in this language was found on the page.',
  'page-changed': 'The text changed while it was being read. Analyse the page again.',
  'repository-unavailable': 'Your vocabulary could not be opened on this device, so no figure can be given.',
  'lookup-incomplete': 'Some words could not be checked against your vocabulary, so no figure is shown. Try again.',
  'knowledge-changing': 'Your vocabulary kept changing while it was being read. Try again in a moment.',
  'not-granted': 'Open Reading Analysis from the GoLearn popup to analyse this page.',
  error: 'GoLearn could not analyse this page.',
};

class Failure extends Error {
  constructor(readonly code: ReadingErrorCode, message?: string) { super(message ?? MESSAGES[code]); }
}

export function createReadingSession(d: ReadingSessionDeps) {
  const now = d.now ?? Date.now;
  let stage: ReadingStage = 'idle';
  let runId: string | undefined;
  let progress: { done: number; total: number } | undefined;
  let result: ReadingResult | undefined;
  let resultFingerprint: string | undefined;
  let error: { code: ReadingErrorCode; message: string } | undefined;
  let job: AbortController | undefined;
  let table: LexicalTable | undefined;
  let staleCheckedAt = 0;
  let stale = false;

  const status = (): ReadingStatus => ({
    ok: true, stage, ...(runId ? { runId } : {}), ...(progress ? { progress } : {}), ...(result ? { result } : {}), ...(error ? { error } : {}), ...(stale ? { stale: true } : {}),
  });

  /** The text the result was read from is no longer the text of the page (a reader that changes chapter in place). Checked at most every 2 s. */
  function refreshStale(): void {
    if (stage !== 'done' || !result || !resultFingerprint || now() - staleCheckedAt < 2_000) return;
    staleCheckedAt = now();
    try {
      const x = extractReadingText({ doc: d.doc, languageId: result.languageId, varietyId: result.varietyId, adapters: d.adapters, adapterOf: d.adapterOf });
      stale = !x.ok || x.fingerprint !== resultFingerprint;
    } catch { stale = true; }
  }

  async function classifyAll(t: LexicalTable, signal: AbortSignal): Promise<{ snapshot: KnowledgeSnapshot; verdicts: WireVerdict[]; asked: number; answered: number }> {
    const restarts = d.maxRestarts ?? 3;
    for (let attempt = 0; attempt <= restarts; attempt++) {
      signal.throwIfAborted();
      stage = 'verifying';
      progress = { done: 0, total: t.words.length };
      const s = await d.knowledge({ op: 'snapshot', languageId: t.languageId });
      signal.throwIfAborted();
      if (!s) throw new Failure('repository-unavailable', 'GoLearn did not answer. Try again.');
      if (!s.ok) throw new Failure(s.error === 'not-granted' ? 'not-granted' : s.error === 'repository-unavailable' ? 'repository-unavailable' : 'lookup-incomplete');
      if (s.op !== 'snapshot') throw new Failure('lookup-incomplete');
      const verdicts: WireVerdict[] = [];
      let asked = 0;
      let answered = 0;
      let changed = false;
      for (let i = 0; i < t.words.length && !changed; i += MAX_WORDS_PER_MESSAGE) {
        const batch = t.words.slice(i, i + MAX_WORDS_PER_MESSAGE).map((w) => w.word);
        let r: ReadingKnowledgeReply | undefined;
        // an unanswered batch (the worker was waking) is asked again; a batch never answered fails the run: it is not left out of the count
        for (let tries = 0; tries < 3 && !r; tries++) {
          r = await d.knowledge({ op: 'classify', languageId: t.languageId, ...(t.varietyId ? { varietyId: t.varietyId } : {}), snapshot: s.snapshot.id, words: batch });
          signal.throwIfAborted();
        }
        if (!r) throw new Failure('lookup-incomplete');
        if (!r.ok) {
          if (r.error === 'snapshot-changed') { changed = true; break; }
          throw new Failure(r.error === 'not-granted' ? 'not-granted' : r.error === 'repository-unavailable' ? 'repository-unavailable' : 'lookup-incomplete');
        }
        if (r.op !== 'classify' || r.snapshot !== s.snapshot.id || !Array.isArray(r.verdicts) || r.verdicts.length !== batch.length || r.asked !== r.answered) throw new Failure('lookup-incomplete');
        verdicts.push(...r.verdicts);
        asked += r.asked;
        answered += r.answered;
        progress = { done: Math.min(t.words.length, i + batch.length), total: t.words.length };
      }
      if (changed) continue; // the learner's knowledge changed while it was read: one figure must come from one state, so start again
      if (verdicts.length !== t.words.length) throw new Failure('lookup-incomplete');
      return { snapshot: s.snapshot, verdicts, asked, answered };
    }
    throw new Failure('knowledge-changing');
  }

  async function run(req: Extract<ReadingRequest, { op: 'start' }>, signal: AbortSignal): Promise<void> {
    stage = 'extracting';
    const languageId = (typeof req.languageId === 'string' && req.languageId) || (await d.defaultLanguage?.()) || '';
    signal.throwIfAborted();
    if (!languageId || !d.languages.includes(languageId)) throw new Failure('unsupported-language');
    let varietyId: string | undefined;
    if (hasLearningVarieties(languageId)) {
      // the learner's own statement; else what the page itself states outright; a bare he or el states nothing
      // (a language whose varieties are dialects with a shared core, Albanian, is then read in its default, the written standard)
      varietyId = canonicalVarietyId(languageId, req.varietyId) ?? declaredVariety(languageId, d.doc.documentElement?.getAttribute('lang')) ?? textVarietyOf(languageId, undefined);
      if (!varietyId) throw new Failure('variety-required');
    }
    if (!d.adapterOf(languageId)) { try { await d.loadAnalyser?.(languageId); } catch { /* said below */ } signal.throwIfAborted(); }
    const adapter = d.adapterOf(languageId);
    if (!adapter) throw new Failure('unsupported-language');

    const extract = () => extractReadingText({ doc: d.doc, languageId, ...(varietyId ? { varietyId } : {}), adapters: d.adapters, adapterOf: d.adapterOf });
    const x = extract();
    if (!x.ok) throw new Failure(x.code, x.message);
    if (!x.nodes.length) throw new Failure('no-text');

    const reusedText = !!table && table.fingerprint === x.fingerprint && table.languageId === languageId && table.varietyId === varietyId && table.analyser === adapter.version
      && table.dictionary !== 'unavailable'; // a table whose dictionary questions went unanswered is made again
    if (!reusedText) {
      stage = 'resolving';
      progress = { done: 0, total: x.scope.characters };
      table = undefined;
      table = await buildLexicalTable({
        nodes: x.nodes, fingerprint: x.fingerprint, adapter, languageId, ...(varietyId ? { varietyId } : {}), signal,
        onProgress: (done, total) => { progress = { done, total }; }, ...(d.confirmForms ? { confirmForms: d.confirmForms } : {}),
      });
    }
    const t = table!;
    if (!t.total) throw new Failure('no-text');

    const k = await classifyAll(t, signal);
    stage = 'calculating';
    progress = undefined;
    const counted: CountedVerdict[] = t.words.map((w, i) => ({ occurrences: w.occurrences, verdict: k.verdicts[i] }));
    const coverage = coverageOf(counted);
    if (coverage.counts.total !== t.total) throw new Failure('lookup-incomplete'); // every occurrence is in exactly one count, or there is no figure

    // a reader that swaps its chapter in place keeps its address: the figure of one text is never shown for another
    const after = extract();
    if (!after.ok || after.fingerprint !== x.fingerprint) { table = undefined; throw new Failure('page-changed'); }

    result = {
      languageId, ...(varietyId ? { varietyId } : {}), coverage,
      scope: { ...x.scope, complete: t.complete, analysedCharacters: t.analysedCharacters },
      snapshot: k.snapshot, lookups: { asked: k.asked, answered: k.answered },
      // `no-index`: the language has no forms index at all (Hebrew today), so there was nothing to ask; that is not "offline or not downloaded"
      dictionary: t.dictionary === 'asked' ? 'asked' : t.dictionary === 'not-needed' || t.dictionary === 'no-index' ? 'not-needed' : 'unavailable',
      reusedText, at: now(),
    };
    resultFingerprint = x.fingerprint;
    stale = false;
    staleCheckedAt = now();
  }

  function start(req: Extract<ReadingRequest, { op: 'start' }>): ReadingStatus {
    job?.abort();
    const mine = new AbortController();
    job = mine;
    runId = `r${now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const id = runId;
    stage = 'extracting';
    progress = undefined;
    error = undefined;
    result = undefined;
    resultFingerprint = undefined;
    stale = false;
    void run(req, mine.signal).then(
      () => { if (runId === id) { stage = 'done'; progress = undefined; } },
      (e: unknown) => {
        if (runId !== id) return;
        progress = undefined;
        if (mine.signal.aborted) { stage = 'canceled'; return; }
        stage = 'failed';
        error = e instanceof Failure ? { code: e.code, message: e.message } : { code: 'error', message: MESSAGES.error };
      },
    );
    return status();
  }

  function cancel(): ReadingStatus {
    if (job && (stage === 'extracting' || stage === 'resolving' || stage === 'verifying' || stage === 'calculating')) { job.abort(); stage = 'canceled'; progress = undefined; }
    return status();
  }

  function handle(req: ReadingRequest): ReadingStatus {
    if (req.op === 'start') return start(req);
    if (req.op === 'cancel') return cancel();
    refreshStale();
    return status();
  }

  /** The page is going away: stop, and keep nothing of it. */
  function dispose(): void { job?.abort(); table = undefined; result = undefined; resultFingerprint = undefined; stage = 'idle'; }

  return { handle, status, dispose };
}

export type ReadingSession = ReturnType<typeof createReadingSession>;
