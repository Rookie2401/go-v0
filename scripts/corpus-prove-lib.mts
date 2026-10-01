/// <reference types="node" />
/**
 * The import proof (`npm run corpus:prove`): every documented behaviour of the importer, exercised on the clearly
 * identified SYNTHETIC files in `data/synthetic/import-proof/` through the REAL importer (`importDocuments`,
 * `validateBatch`, `applyReview`, `contentHistory`) against an ISOLATED in-memory store. Never the bundled corpus
 * folder, never IndexedDB. A learner with real encounters (real StoreEventBus + real GoLearn) and prepared audio
 * (real GoListen, development fixture) lives in the same store, so the revision case can show what survives.
 *
 * `runProof()` returns the rows of an expected-vs-actual table; `renderProof()` turns the SAME rows into
 * docs/import/PROOF.md. Nothing in the document is hand-written.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createAdapterRegistry } from '../src/adapters';
import type { AdapterRegistry, AppStore, DomainEvent, EventInput, Sentence, Text, Token, TokenAnalysis } from '../src/core';
import { INDEXES, StoreEventBus, createMemoryStore, hash, ids, seedBasics } from '../src/core';
import { createGoLearn } from '../src/golearn';
import type { GoLearn } from '../src/core';
import { createGoListen, type GoListenService } from '../src/golisten';
import {
  applyReview, computePublished, contentHistory, importDocuments, loadBundledCorpus, validateBatch,
  type CorpusDocument, type DocumentReport, type ImportReport, type ValidationCode, type ValidationIssue,
} from '../src/ingest';
import { loadFiles, validateAndPrint } from './corpus-cli.mts';

// ───────────────────────────── recorder ─────────────────────────────

export interface ProofRow { caseId: string; check: string; expected: string; actual: string; ok: boolean }
export interface ProofNote { caseId: string; text: string }

const show = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? 'undefined' : JSON.stringify(v));

/** Collects the expected-vs-actual rows and the evidence notes of one run. */
export class Recorder {
  readonly rows: ProofRow[] = [];
  readonly notes: ProofNote[] = [];
  /** Deep-equality check (JSON). */
  eq(caseId: string, check: string, expected: unknown, actual: unknown): void {
    this.rows.push({ caseId, check, expected: show(expected), actual: show(actual), ok: JSON.stringify(expected) === JSON.stringify(actual) });
  }
  /** A boolean check whose expectation and observation are stated in words. */
  that(caseId: string, check: string, expected: string, actual: string, ok: boolean): void {
    this.rows.push({ caseId, check, expected, actual, ok });
  }
  note(caseId: string, text: string): void { this.notes.push({ caseId, text }); }
}

// ───────────────────────────── store snapshots ─────────────────────────────

type AnyTable = { all(): Promise<Array<{ id: string }>> };
const TABLES = Object.keys(INDEXES) as Array<keyof typeof INDEXES>;

export interface StoreSnapshot { counts: Record<string, number>; total: number; fingerprint: string; ids: Record<string, string[]> }

/** Row counts, row ids and a content fingerprint of EVERY table of the store. */
export async function snapshotStore(store: AppStore): Promise<StoreSnapshot> {
  const counts: Record<string, number> = {};
  const idsByTable: Record<string, string[]> = {};
  const parts: string[] = [];
  let total = 0;
  for (const name of TABLES) {
    const rows = (await (store[name] as unknown as AnyTable).all()).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    counts[name] = rows.length;
    idsByTable[name] = rows.map((x) => x.id);
    total += rows.length;
    parts.push(`${name}:${hash(JSON.stringify(rows))}`);
  }
  return { counts, total, fingerprint: hash(parts.join('|')), ids: idsByTable };
}

const changedTables = (a: StoreSnapshot, b: StoreSnapshot): string[] =>
  TABLES.filter((t) => a.counts[t] !== b.counts[t] || hash(JSON.stringify(a.ids[t])) !== hash(JSON.stringify(b.ids[t]))).map(String);

// ───────────────────────────── exactness helpers ─────────────────────────────

const hex = (s: string): string => [...s].map((ch) => ch.codePointAt(0)!.toString(16).padStart(4, '0')).join(' ');
/** True when both strings are the same sequence of code points AND the same UTF-8 bytes. */
export const sameCodePoints = (a: string, b: string): boolean => hex(a) === hex(b) && Buffer.from(a, 'utf8').equals(Buffer.from(b, 'utf8'));

interface ExpectedBlock { original: string; sentences?: string[] }

/** What the importer was supplied, as paragraph blocks: declared paragraphs list their sentences; raw ones only the paragraph. */
export function expectedBlocks(doc: CorpusDocument): ExpectedBlock[] {
  const out: ExpectedBlock[] = [];
  for (const sec of doc.sections) for (const p of sec.paragraphs) {
    if ('sentences' in p) out.push({ original: p.sentences.map((s) => s.text).join(p.separator ?? ' '), sentences: p.sentences.map((s) => s.text) });
    else out.push({ original: p.text });
  }
  return out;
}

// ───────────────────────────── context ─────────────────────────────

export interface ProofContext {
  dir: string;
  store: AppStore;
  registry: AdapterRegistry;
  bus: StoreEventBus;
  golearn: GoLearn;
  golisten: GoListenService;
  clock: () => string;
  userId: string;
  /** Read a synthetic file and parse it (throws on malformed JSON). */
  load(file: string): CorpusDocument;
  /** Facts one case leaves for a later one. */
  state: { validTextId?: string };
  /** Also drive the real corpus:validate / corpus:review CLIs (slower: each is a vite-node process). */
  cli: boolean;
}

export interface ProofCase { id: string; title: string; run(c: ProofContext, r: Recorder): Promise<void> }

const textIdOf = (doc: { lang: string; id: string }) => `text:${doc.lang}:${doc.id}`;
const errorsOf = (d: DocumentReport): ValidationIssue[] => d.issues.filter((i) => i.severity === 'error');
const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];
const liveOf = async (store: AppStore, textId: string): Promise<Sentence[]> =>
  (await store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
const tokensOf = async (store: AppStore, sentenceId: string): Promise<Token[]> => (await store.tokens.where('sentenceId', sentenceId)).sort((a, b) => a.index - b.index);
const analysesOf = async (store: AppStore, tokens: Token[]): Promise<TokenAnalysis[]> => {
  const out: TokenAnalysis[] = [];
  for (const t of tokens) out.push(...(await store.analyses.where('tokenId', t.id)));
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
};

/** Import a batch that must be rejected: expected error codes, actionable hints, and ZERO rows written to EVERY table. */
async function expectRejected(
  c: ProofContext, r: Recorder, caseId: string, label: string, docs: unknown[], index: number, expectedCodes: ValidationCode[],
): Promise<ImportReport> {
  const before = await snapshotStore(c.store);
  const report = await importDocuments(c.store, c.registry, docs, { clock: c.clock });
  const after = await snapshotStore(c.store);
  const d = report.documents[index];
  const errs = errorsOf(d);
  r.eq(caseId, `${label}: action`, 'rejected', d.action);
  r.eq(caseId, `${label}: error codes`, [...expectedCodes].sort(), uniq(errs.map((i) => i.code)).sort());
  const weak = errs.filter((i) => i.hint.trim().length < 12);
  r.that(caseId, `${label}: every error has an actionable hint`, `${errs.length} of ${errs.length} errors with a hint`, `${errs.length - weak.length} of ${errs.length} errors with a hint`, errs.length > 0 && weak.length === 0);
  const changed = changedTables(before, after);
  r.that(caseId, `${label}: rows written`, `0 rows, all ${TABLES.length} tables identical`,
    changed.length === 0 && before.fingerprint === after.fingerprint ? `0 rows (${before.total} rows before and after, ${TABLES.length} tables identical)` : `tables changed: ${changed.join(', ') || '(content)'}; ${before.total} -> ${after.total} rows`,
    changed.length === 0 && before.fingerprint === after.fingerprint && after.total === before.total);
  r.note(caseId, `${label}: ${errs.map((i) => `${i.path || '(document)'} [${i.code}] hint: ${i.hint.slice(0, 160)}`).join(' / ')}`);
  return report;
}

// ───────────────────────────── the cases ─────────────────────────────

export const CASES: ProofCase[] = [
  {
    id: '01 valid-text',
    title: 'a valid Spanish text imports',
    async run(c, r) {
      const doc = c.load('01-valid-es.json');
      const report = await importDocuments(c.store, c.registry, [doc], { clock: c.clock });
      const d = report.documents[0];
      r.eq('01 valid-text', 'import ok / action / version', { ok: true, action: 'created', contentVersion: 1 }, { ok: report.ok, action: d.action, contentVersion: d.contentVersion });
      r.eq('01 valid-text', 'sentences added / retired', { added: 6, retired: 0 }, { added: d.sentencesAdded, retired: d.sentencesRetired });
      r.eq('01 valid-text', 'validation errors / warning codes', { errors: 0, warnings: ['low-analysis-coverage'] },
        { errors: errorsOf(d).length, warnings: uniq(d.issues.filter((i) => i.severity === 'warning').map((i) => i.code)) });
      const textId = textIdOf(doc);
      c.state.validTextId = textId;
      const live = await liveOf(c.store, textId);
      r.eq('01 valid-text', 'stored live sentences, in order, exactly as supplied', 6, live.length);
      r.that('01 valid-text', 'published (unreviewed machine text must not be)', 'published false; reason names the missing review',
        `published ${d.published}; ${d.unpublishedReasons.join(' | ').slice(0, 120)}`, d.published === false && /review status is "unreviewed"/.test(d.unpublishedReasons.join(' ')));
      const stored = await c.store.texts.get(textId);
      r.eq('01 valid-text', 'stored Text.published / reviewStatus', { published: false, reviewStatus: 'unreviewed' }, { published: stored?.published, reviewStatus: stored?.reviewStatus });
    },
  },

  {
    id: '02 learner-and-audio',
    title: 'a learner meets the valid text; its audio is prepared (development fixture)',
    async run(c, r) {
      const textId = c.state.validTextId!;
      const live = await liveOf(c.store, textId);
      for (const s of live.slice(0, 3)) {
        const toks = (await tokensOf(c.store, s.id)).filter((t) => t.isWord).map((t) => t.id);
        await c.bus.emit({
          type: 'SentenceViewed', userId: c.userId, lang: 'es', surface: 'corpus', session: 'synthetic-session-1',
          dedupeKey: `view:${c.userId}:synthetic-session-1:${s.id}`, textId, sentenceId: s.id, tokenIds: toks, contentVersion: 1,
        } as EventInput<DomainEvent>);
      }
      await c.golearn.settled();
      const encs = await c.store.encounters.where('userId', c.userId);
      r.that('02 learner-and-audio', 'encounters from 3 SentenceViewed events', 'at least 3 encounters, all contentVersion 1, all on this text',
        `${encs.length} encounters; contentVersion ${JSON.stringify(uniq(encs.map((e) => e.contentVersion)))}; texts ${JSON.stringify(uniq(encs.map((e) => e.textId)))}`,
        encs.length >= 3 && encs.every((e) => e.contentVersion === 1 && e.textId === textId));
      const p = await c.golearn.readingProgress(c.userId, textId);
      r.eq('02 learner-and-audio', 'readingProgress before the revision (version / total / seen)', { contentVersion: 1, sentencesTotal: 6, sentencesSeen: 3 },
        { contentVersion: p.contentVersion, sentencesTotal: p.sentencesTotal, sentencesSeen: p.sentencesSeen });
      const ensured = await c.golisten.ensureAudio(textId, { runNow: true });
      r.eq('02 learner-and-audio', 'ensureAudio (GoListen, allowFixture) created / reused / failed', { created: 6, reused: 0, failed: 0 }, { created: ensured.created, reused: ensured.reused, failed: ensured.failed });
      const st = await c.golisten.audioStatus(textId);
      r.that('02 learner-and-audio', 'audioStatus after generation: fixture audio is never evidence', 'preview-only, 6/6 ready, evidenceEligible false, isSpeech false',
        `${st.state}, ${st.readySegments}/${st.totalSegments} ready, evidenceEligible ${st.evidenceEligible}, isSpeech ${st.isSpeech}`,
        st.state === 'preview-only' && st.readySegments === 6 && st.totalSegments === 6 && st.evidenceEligible === false && st.isSpeech === false);
      r.note('02 learner-and-audio', `${encs.length} encounters; progress ${JSON.stringify(p)}; audio ${JSON.stringify({ state: st.state, audioContentVersion: st.audioContentVersion, textContentVersion: st.textContentVersion })}`);
    },
  },

  {
    id: '03 unchanged-reimport',
    title: 're-importing the unchanged text changes nothing',
    async run(c, r) {
      const textId = c.state.validTextId!;
      const doc = c.load('01-valid-es.json');
      const before = await snapshotStore(c.store);
      const textBefore = await c.store.texts.get(textId);
      const sentenceIds = before.ids.sentences.slice();
      const encBefore = JSON.stringify(await c.store.encounters.where('userId', c.userId));
      const eventsBefore = (await c.store.events.all()).length;
      const later = () => '2027-06-01T00:00:00.000Z';
      const report = await importDocuments(c.store, c.registry, [doc], { clock: later });
      const d = report.documents[0];
      const after = await snapshotStore(c.store);
      r.eq('03 unchanged-reimport', 'action / contentVersion', { action: 'unchanged', contentVersion: 1 }, { action: d.action, contentVersion: d.contentVersion });
      r.that('03 unchanged-reimport', 'row counts and content of all tables', `identical (${before.total} rows)`,
        after.fingerprint === before.fingerprint ? `identical (${after.total} rows)` : `differs: ${changedTables(before, after).join(', ') || 'content'}`, after.fingerprint === before.fingerprint);
      r.eq('03 unchanged-reimport', 'sentence ids (duplicates after re-import)', { count: sentenceIds.length, duplicates: 0 }, { count: after.ids.sentences.length, duplicates: after.ids.sentences.length - uniq(after.ids.sentences).length });
      r.eq('03 unchanged-reimport', 'sentence id list identical', sentenceIds, after.ids.sentences);
      r.that('03 unchanged-reimport', 'no new encounters, no new events', 'encounters byte-identical; events unchanged',
        `encounters ${JSON.stringify(await c.store.encounters.where('userId', c.userId)) === encBefore ? 'byte-identical' : 'CHANGED'}; events ${(await c.store.events.all()).length === eventsBefore ? 'unchanged' : 'CHANGED'}`,
        JSON.stringify(await c.store.encounters.where('userId', c.userId)) === encBefore && (await c.store.events.all()).length === eventsBefore);
      const t = await c.store.texts.get(textId);
      r.eq('03 unchanged-reimport', 'Text.contentVersion / transformation records', { contentVersion: 1, transformations: textBefore?.transformations.length }, { contentVersion: t?.contentVersion, transformations: t?.transformations.length });
    },
  },

  {
    id: '04 malformed-json',
    title: 'a file that is not JSON is refused by the loader with a hint',
    async run(c, r) {
      const file = path.join(c.dir, '02-malformed.json');
      const before = await snapshotStore(c.store);
      const loaded = loadFiles([file]);
      const lines: string[] = [];
      const orig = console.log;
      console.log = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
      let run;
      try { run = validateAndPrint(loaded); } finally { console.log = orig; }
      const printed = lines.join('\n');
      r.that('04 malformed-json', 'loader result', 'parse error reported, no document produced', loaded[0].parseError ? `parse error: ${loaded[0].parseError}` : 'parsed', loaded[0].parseError !== undefined && loaded[0].doc === undefined);
      r.eq('04 malformed-json', 'corpus:validate counts it as an error', { errors: 1, documents: 1 }, { errors: run.errors, documents: run.documents });
      r.that('04 malformed-json', 'CLI output names the problem and says what to do', 'contains "not valid JSON" and a "hint:" line',
        `${/not valid JSON/.test(printed) ? 'names "not valid JSON"' : 'no message'}; ${/hint: fix the syntax error/.test(printed) ? 'hint present' : 'no hint'}`, /not valid JSON/.test(printed) && /hint: fix the syntax error/.test(printed));
      r.that('04 malformed-json', 'the file never reaches the importer', 'store unchanged', changedTables(before, await snapshotStore(c.store)).length === 0 ? 'store unchanged' : 'store CHANGED', changedTables(before, await snapshotStore(c.store)).length === 0);
      r.note('04 malformed-json', `loader message: ${loaded[0].parseError}`);
    },
  },

  {
    id: '05 missing-fields',
    title: 'a text missing required fields is rejected',
    async run(c, r) {
      const doc = c.load('03-missing-fields.json');
      const report = await expectRejected(c, r, '05 missing-fields', 'missing required fields', [doc], 0, ['missing-field']);
      r.eq('05 missing-fields', 'paths reported', ['generated', 'review', 'source.attribution', 'topics'], errorsOf(report.documents[0]).map((i) => i.path).sort());
    },
  },

  {
    id: '06 duplicate-id',
    title: 'two different files with the same id',
    async run(c, r) {
      const a = c.load('04-duplicate-id-a.json');
      const b = c.load('04-duplicate-id-b.json');
      const validation = validateBatch([a, b], { registry: c.registry });
      r.eq('06 duplicate-id', 'validateBatch on [A, B]: ok / which file carries duplicate-document-id', { ok: false, flagged: [false, true] },
        { ok: validation.ok, flagged: validation.documents.map((x) => x.issues.some((i) => i.code === 'duplicate-document-id')) });
      const report = await expectRejected(c, r, '06 duplicate-id', 'both in one batch (file B)', [a, b], 1, ['duplicate-document-id']);
      r.that('06 duplicate-id', 'file A in the same batch', 'itself valid but rejected with the all-or-nothing note',
        `${report.documents[0].action}; errors ${errorsOf(report.documents[0]).length}; note: ${report.documents[0].note?.slice(0, 80) ?? '(none)'}`,
        report.documents[0].action === 'rejected' && errorsOf(report.documents[0]).length === 0 && /all or nothing/.test(report.documents[0].note ?? ''));
      // sequentially: A is imported, B (another source) then conflicts with the stored text
      const first = await importDocuments(c.store, c.registry, [a], { clock: c.clock });
      r.eq('06 duplicate-id', 'file A alone', 'created', first.documents[0].action);
      await expectRejected(c, r, '06 duplicate-id', 'file B after A is stored', [b], 0, ['text-id-conflict']);
      const stored = await c.store.sentences.where('textId', textIdOf(a));
      r.that('06 duplicate-id', 'the stored text is still file A', 'A\'s two sentences, none of B\'s', `${stored.length} sentences: ${stored.map((s) => s.text).join(' / ')}`,
        stored.length === 2 && stored.every((s) => /luna|mar/.test(s.text)));
    },
  },

  {
    id: '07 mixed-batch',
    title: 'a batch of one valid and one invalid file',
    async run(c, r) {
      const good = c.load('05-batch-valid.json');
      const bad = c.load('05-batch-invalid.json');
      const report = await expectRejected(c, r, '07 mixed-batch', 'valid + invalid batch (the invalid file)', [good, bad], 1, ['empty-sentence']);
      const g = report.documents[0];
      r.that('07 mixed-batch', 'the VALID file of the batch', 'reported rejected (no error of its own) with the all-or-nothing note',
        `action ${g.action}; own errors ${errorsOf(g).length}; note: ${g.note ?? '(none)'}`, g.action === 'rejected' && errorsOf(g).length === 0 && /all or nothing/.test(g.note ?? ''));
      r.eq('07 mixed-batch', 'batch ok flag', false, report.ok);
      r.eq('07 mixed-batch', 'valid file absent from the store', undefined, await c.store.texts.get(textIdOf(good)));
      const alone = await importDocuments(c.store, c.registry, [good], { clock: c.clock });
      r.eq('07 mixed-batch', 'the valid file alone (after the bad one is left out)', 'created', alone.documents[0].action);
    },
  },

  {
    id: '08 invalid-spans',
    title: 'invalid lexical spans',
    async run(c, r) {
      await expectRejected(c, r, '08 invalid-spans', 'span outside the sentence', [c.load('06-spans-out-of-bounds.json')], 0, ['span-out-of-bounds']);
      await expectRejected(c, r, '08 invalid-spans', 'two spans on one word', [c.load('06-spans-overlap.json')], 0, ['span-overlap']);
      await expectRejected(c, r, '08 invalid-spans', 'span splits a Spanish letter from its combining accent', [c.load('06-spans-grapheme-es.json')], 0, ['span-not-grapheme-boundary']);
      await expectRejected(c, r, '08 invalid-spans', 'span splits a Hindi conjunct', [c.load('06-spans-grapheme-hi.json')], 0, ['span-not-grapheme-boundary']);
    },
  },

  {
    id: '09 broken-alignment',
    title: 'a raw paragraph whose english array has the wrong length',
    async run(c, r) {
      const report = await expectRejected(c, r, '09 broken-alignment', 'english has 2 lines for 3 sentences', [c.load('07-alignment-broken.json')], 0, ['english-count-mismatch']);
      const issue = errorsOf(report.documents[0])[0];
      r.that('09 broken-alignment', 'the hint says how many lines are needed and what the adapter found', 'mentions 3 English line(s) and the three sentences',
        issue.hint.slice(0, 140), /3 English line/.test(issue.hint) && /El sol sale/.test(issue.hint) && /Ella come pan/.test(issue.hint));
    },
  },

  {
    id: '10 exactness',
    title: 'text is stored byte for byte',
    async run(c, r) {
      for (const [file, label] of [['08-exact-es.json', 'Spanish (non-NFC, NBSP, edge/double spaces, « » — … ¿ ¡)'], ['08-exact-hi-danda.json', 'Hindi (danda, non-NFC U+0958)'], ['08-exact-th-no-spaces.json', 'Thai (no spaces)']] as const) {
        const caseId = '10 exactness';
        const doc = c.load(file);
        const report = await importDocuments(c.store, c.registry, [doc], { clock: c.clock });
        const d = report.documents[0];
        const textId = textIdOf(doc);
        r.eq(caseId, `${label}: import`, 'created', d.action);
        const blocks = expectedBlocks(doc);
        const paragraphs = (await c.store.paragraphs.where('textId', textId)).sort((a, b) => a.index - b.index);
        r.eq(caseId, `${label}: paragraphs stored`, blocks.length, paragraphs.length);
        const paraOk = blocks.filter((b, i) => paragraphs[i] !== undefined && sameCodePoints(paragraphs[i].originalText ?? '', b.original)).length;
        r.eq(caseId, `${label}: Paragraph.originalText byte-identical`, `${blocks.length}/${blocks.length}`, `${paraOk}/${blocks.length}`);

        const live = await liveOf(c.store, textId);
        const declared = blocks.flatMap((b) => b.sentences ?? []);
        const storedDeclared = paragraphs.flatMap((p, i) => (blocks[i].sentences ? live.filter((s) => s.paragraphId === p.id).map((s) => s.text) : []));
        const sentOk = declared.filter((t, i) => storedDeclared[i] !== undefined && sameCodePoints(storedDeclared[i], t)).length;
        r.eq(caseId, `${label}: declared Sentence.text byte-identical`, `${declared.length}/${declared.length}`, `${sentOk}/${declared.length}`);
        r.eq(caseId, `${label}: no declared sentence lost or added`, declared.length, storedDeclared.length);
        const slicesOk = live.filter((s) => {
          const p = paragraphs.find((x) => x.id === s.paragraphId);
          return p !== undefined && sameCodePoints((p.originalText ?? '').slice(s.paraStart, s.paraEnd), s.text);
        }).length;
        r.eq(caseId, `${label}: every sentence equals originalText.slice(paraStart, paraEnd)`, `${live.length}/${live.length}`, `${slicesOk}/${live.length}`);
        let tokenCount = 0;
        let tokenOk = 0;
        for (const s of live) for (const t of await tokensOf(c.store, s.id)) { tokenCount++; if (s.text.slice(t.start, t.end) === t.surface) tokenOk++; }
        r.eq(caseId, `${label}: token offsets slice the stored text`, `${tokenCount}/${tokenCount}`, `${tokenOk}/${tokenCount}`);

        const nonNfc = live.filter((s) => s.text !== s.text.normalize('NFC'));
        const normOk = nonNfc.filter((s) => s.normalizedText !== s.text && s.normalizedText === s.normalizedText.normalize('NFC')).length;
        const suppliedNonNfc = declared.filter((t) => t !== t.normalize('NFC')).length;
        r.eq(caseId, `${label}: non-NFC sentences kept as supplied, normalizedText differs and is NFC`, `${suppliedNonNfc} non-NFC sentence(s), ${suppliedNonNfc} with a different NFC normalizedText`, `${nonNfc.length} non-NFC sentence(s), ${normOk} with a different NFC normalizedText`);
        const warnCodes = uniq(d.issues.filter((i) => i.severity === 'warning').map((i) => i.code));
        r.that(caseId, `${label}: warned, never altered`, suppliedNonNfc ? 'not-nfc warning present' : 'no not-nfc warning', `warnings: ${warnCodes.join(', ') || '(none)'}`, warnCodes.includes('not-nfc') === (suppliedNonNfc > 0));
        r.note(caseId, `${label}: ${live.length} sentences; texts as code points: ${live.map((s) => JSON.stringify(s.text)).join(' ')}`);

        if (file === '08-exact-es.json') {
          const edge = live.find((s) => s.text.startsWith('  Ana  come   pan.  '));
          r.that(caseId, 'Spanish: leading/trailing spaces and internal double spaces', 'text "  Ana  come   pan.  " kept (2 leading, 2 trailing, double + triple inside)', edge ? JSON.stringify(edge.text) : 'sentence not found', edge?.text === '  Ana  come   pan.  ');
          const rawWarn = d.issues.find((i) => i.code === 'edge-whitespace' && i.path === 'sections[0].paragraphs[1].text');
          r.that(caseId, 'Spanish: a raw paragraph with edge whitespace is warned about (and kept)', 'edge-whitespace warning at sections[0].paragraphs[1].text', rawWarn ? `${rawWarn.code} at ${rawWarn.path}` : `no warning (warnings at: ${d.issues.filter((i) => i.code === 'edge-whitespace').map((i) => i.path).join(', ')})`, !!rawWarn);
          const nbsp = live.find((s) => s.text.includes(' '));
          r.that(caseId, 'Spanish: NO-BREAK SPACE', 'U+00A0 twice, not turned into U+0020', nbsp ? `${[...nbsp.text].filter((ch) => ch === ' ').length} x U+00A0, ${[...nbsp.text].filter((ch) => ch === ' ').length} x U+0020` : 'not found', !!nbsp && [...nbsp.text].filter((ch) => ch === ' ').length === 2 && !nbsp.text.includes(' '));
          const punct = live.find((s) => s.text.includes('«'));
          r.that(caseId, 'Spanish: « » — … ¿ ¡ kept', 'all seven characters present unchanged', punct ? JSON.stringify(punct.text) : 'not found', !!punct && ['«', '»', '—', '…', '¿', '¡'].every((ch) => punct.text.includes(ch)));
        }
        if (file === '08-exact-hi-danda.json') {
          r.that(caseId, 'Hindi: every sentence ends in a danda', '3 of 3 end with U+0964', `${live.filter((s) => s.text.endsWith('।')).length} of ${live.length}`, live.length === 3 && live.every((s) => s.text.endsWith('।')));
          r.that(caseId, 'Hindi: U+0958 kept (NFC would rewrite it to U+0915 U+093C)', 'one sentence with U+0958 and none with U+093C', `${live.filter((s) => s.text.includes('क़')).length} with U+0958, ${live.filter((s) => s.text.includes('़')).length} with U+093C`, live.filter((s) => s.text.includes('क़')).length === 1 && !live.some((s) => s.text.includes('़')));
        }
        if (file === '08-exact-th-no-spaces.json') {
          r.that(caseId, 'Thai: no space inserted anywhere', '4 sentences, none contains U+0020; paragraphs contain no U+0020', `${live.length} sentences; ${live.filter((s) => s.text.includes(' ')).length} with a space; ${paragraphs.filter((p) => (p.originalText ?? '').includes(' ')).length} paragraph(s) with a space`,
            live.length === 4 && !live.some((s) => s.text.includes(' ')) && !paragraphs.some((p) => (p.originalText ?? '').includes(' ')));
          r.that(caseId, 'Thai: raw paragraph split on the newline', '2 sentences from the 2 lines, newline kept in originalText', `${live.filter((s) => s.paragraphId === paragraphs[1]?.id).length} sentences; originalText has newline: ${(paragraphs[1]?.originalText ?? '').includes('\n')}`,
            live.filter((s) => s.paragraphId === paragraphs[1]?.id).length === 2 && (paragraphs[1]?.originalText ?? '').includes('\n'));
        }
      }
    },
  },

  {
    id: '11 holds',
    title: 'review hold, publication hold, unverified and generated "Scripture"',
    async run(c, r) {
      const caseId = '11 holds';
      const reviewer = { by: 'SYNTHETIC fixture reviewer (not a person)', date: '2026-09-30', notes: 'SYNTHETIC DEVELOPMENT MATERIAL: proof fixture, not a real review.' };

      // review hold: unreviewed -> held; applyReview -> publishes
      const hold = c.load('10-hold-review.json');
      const h1 = (await importDocuments(c.store, c.registry, [hold], { clock: c.clock })).documents[0];
      r.that(caseId, 'review hold: published / reason', 'published false; reason says the review is missing', `published ${h1.published}; ${h1.unpublishedReasons.join(' | ').slice(0, 110)}`, !h1.published && h1.unpublishedReasons.length === 1 && /review status is "unreviewed"/.test(h1.unpublishedReasons[0]));
      const rev = applyReview(hold, reviewer);
      r.eq(caseId, 'review hold: applyReview', { ok: true, wouldPublish: true }, { ok: rev.ok, wouldPublish: rev.ok ? rev.decision.published : undefined });
      if (rev.ok) {
        const textsBefore = JSON.stringify(hold.sections);
        r.eq(caseId, 'review hold: applyReview changes no text', true, JSON.stringify(rev.doc.sections) === textsBefore);
        const h2 = (await importDocuments(c.store, c.registry, [rev.doc], { clock: c.clock })).documents[0];
        const stored = await c.store.texts.get(textIdOf(hold));
        r.eq(caseId, 'review hold: after review + re-import', { action: 'updated', contentVersion: 1, published: true, stored: true }, { action: h2.action, contentVersion: h2.contentVersion, published: h2.published, stored: stored?.published });
      }

      // publication hold: reviewed, rights unverified -> held, and a (new) review cannot lift it
      const rights = c.load('10-hold-rights.json');
      const h3 = (await importDocuments(c.store, c.registry, [rights], { clock: c.clock })).documents[0];
      r.that(caseId, 'rights hold: published / reason', 'published false; the only reason is the unverified rights', `published ${h3.published}; ${h3.unpublishedReasons.join(' | ').slice(0, 110)}`, !h3.published && h3.unpublishedReasons.length === 1 && /rights are unverified/.test(h3.unpublishedReasons[0]));
      r.eq(caseId, 'rights hold: stored reviewStatus is reviewed yet published false', { reviewStatus: 'reviewed', published: false }, { reviewStatus: (await c.store.texts.get(textIdOf(rights)))?.reviewStatus, published: (await c.store.texts.get(textIdOf(rights)))?.published });
      const rev2 = applyReview(rights, reviewer);
      r.that(caseId, 'rights hold: applyReview does not lift it', 'review recorded, still would not publish (rights)', rev2.ok ? `would publish ${rev2.decision.published}; ${rev2.decision.unpublishedReasons.join(' | ').slice(0, 90)}` : 'refused', rev2.ok && !rev2.decision.published && /rights are unverified/.test(rev2.decision.unpublishedReasons.join(' ')));
      if (rev2.ok) {
        const h4 = (await importDocuments(c.store, c.registry, [rev2.doc], { clock: c.clock })).documents[0];
        r.that(caseId, 'rights hold: still unpublished after review + re-import', 'published false', `published ${h4.published}`, !h4.published);
      }

      // unverified "scripture" (placeholder wording)
      const scr = c.load('10-scripture-unverified.json');
      const s1 = (await importDocuments(c.store, c.registry, [scr], { clock: c.clock })).documents[0];
      const reasons = s1.unpublishedReasons.join(' | ');
      r.that(caseId, 'unverified scripture: published / reasons', 'published false; review, rights, translation, edition and verification all named',
        `published ${s1.published}; ${s1.unpublishedReasons.length} reasons`, !s1.published && s1.unpublishedReasons.length === 5 && /review status/.test(reasons) && /rights are unverified/.test(reasons) && /translation is not identified/.test(reasons) && /edition is not established/.test(reasons) && /not verified against a published source/.test(reasons));
      const rev3 = applyReview(scr, reviewer);
      r.that(caseId, 'unverified scripture: applyReview', 'refused: scripture-unverified (verification is a separate step)', rev3.ok ? 'accepted' : `refused: ${rev3.refusals.map((x) => x.code).join(', ')}`, !rev3.ok && rev3.refusals.some((x) => x.code === 'scripture-unverified'));
      const forced = structuredClone(scr);
      forced.review = { status: 'reviewed', reviewedBy: reviewer.by, reviewedAt: reviewer.date, notes: reviewer.notes };
      const s2 = (await importDocuments(c.store, c.registry, [forced], { clock: c.clock })).documents[0];
      r.that(caseId, 'unverified scripture: even a hand-written "reviewed" block', 'still published false (rights, translation, edition, verification)', `published ${s2.published}; ${s2.unpublishedReasons.length} reasons`, !s2.published && s2.unpublishedReasons.length === 4);

      // scripture + generated: rejected; never publishable; no review can fix it
      const gen = c.load('10-scripture-generated.json');
      await expectRejected(c, r, caseId, 'scripture + generated', [gen], 0, ['scripture-generated']);
      const gate = computePublished(gen);
      r.that(caseId, 'scripture + generated: publication gate', 'published false, "scripture can never be generated"', `published ${gate.published}; ${gate.unpublishedReasons.filter((x) => /generated/.test(x)).join(' | ')}`, !gate.published && gate.unpublishedReasons.includes('scripture can never be generated'));
      const rev4 = applyReview(gen, reviewer);
      r.that(caseId, 'scripture + generated: applyReview', 'refused: scripture-unverified', rev4.ok ? `accepted; would publish ${rev4.decision.published}` : `refused: ${rev4.refusals.map((x) => x.code).join(', ')}`, !rev4.ok && rev4.refusals.some((x) => x.code === 'scripture-unverified'));

      // the learner-visible set
      const published = (await c.store.texts.all()).filter((t: Text) => t.published).map((t) => t.id).sort();
      r.eq(caseId, 'every published text in the isolated store', ['text:es:synthetic-es-hold-review'], published);
      r.note(caseId, `all unpublished reasons: review hold ${JSON.stringify(h1.unpublishedReasons)}; rights hold ${JSON.stringify(h3.unpublishedReasons)}; unverified scripture ${JSON.stringify(s1.unpublishedReasons)}`);
    },
  },

  {
    id: '12 revision',
    title: 'a revised version of the valid text',
    async run(c, r) {
      const caseId = '12 revision';
      const textId = c.state.validTextId!;
      const v1 = c.load('01-valid-es.json');
      const v2 = c.load('09-valid-es-revised.json');
      const oldTexts = expectedBlocks(v1)[0].sentences!;
      const newTexts = expectedBlocks(v2)[0].sentences!;
      const changedOld = oldTexts.filter((t) => !newTexts.includes(t));
      const changedNew = newTexts.filter((t) => !oldTexts.includes(t));
      const unchangedTexts = oldTexts.filter((t) => newTexts.includes(t));

      // snapshot of version 1
      const liveBefore = await liveOf(c.store, textId);
      const byText = new Map(liveBefore.map((s) => [s.text, s]));
      const tokensBefore = new Map<string, string>();
      const analysesBefore = new Map<string, string>();
      for (const s of liveBefore) {
        const toks = await tokensOf(c.store, s.id);
        tokensBefore.set(s.id, JSON.stringify(toks));
        analysesBefore.set(s.id, JSON.stringify(await analysesOf(c.store, toks)));
      }
      const retiredOld = byText.get(changedOld[0])!;
      const encBefore = await c.store.encounters.where('userId', c.userId);
      const encJsonBefore = JSON.stringify(encBefore.sort((a, b) => (a.id < b.id ? -1 : 1)));
      const statusBefore = await c.golisten.audioStatus(textId);

      const report = await importDocuments(c.store, c.registry, [v2], { clock: c.clock });
      const d = report.documents[0];
      r.eq(caseId, 'action / contentVersion / added / retired', { action: 'updated', contentVersion: 2, added: 2, retired: 1 }, { action: d.action, contentVersion: d.contentVersion, added: d.sentencesAdded, retired: d.sentencesRetired });
      r.eq(caseId, 'supplied difference (changed / added / unchanged)', { changed: 1, added: 1, unchanged: 5 }, { changed: changedOld.length, added: changedNew.length - changedOld.length, unchanged: unchangedTexts.length });

      const all = await c.store.sentences.where('textId', textId);
      const retired = all.filter((s) => s.retiredInVersion !== undefined);
      r.eq(caseId, 'retired sentences (exactly the changed one)', [changedOld[0]], retired.map((s) => s.text));
      r.eq(caseId, 'retired sentence keeps its id and key, retiredInVersion', { id: retiredOld.id, retiredInVersion: 2 }, { id: retired[0]?.id, retiredInVersion: retired[0]?.retiredInVersion });
      const liveAfter = await liveOf(c.store, textId);
      r.eq(caseId, 'live sentences, in the new order', newTexts, liveAfter.map((s) => s.text));
      const addedRows = liveAfter.filter((s) => s.versionAdded === 2);
      r.eq(caseId, 'sentences added in version 2 (the changed wording and the new sentence)', [...changedNew].sort(), addedRows.map((s) => s.text).sort());
      const keptIds = unchangedTexts.map((t) => byText.get(t)!.id);
      r.eq(caseId, 'unchanged sentences keep their ids and versionAdded 1', keptIds.map((id) => ({ id, versionAdded: 1 })), unchangedTexts.map((t) => { const s = liveAfter.find((x) => x.text === t); return { id: s?.id, versionAdded: s?.versionAdded }; }));

      let tokenSame = 0;
      let analysisSame = 0;
      let analysisRows = 0;
      for (const t of unchangedTexts) {
        const before = byText.get(t)!;
        const toks = await tokensOf(c.store, before.id);
        analysisRows += (await analysesOf(c.store, toks)).length;
        if (JSON.stringify(toks) === tokensBefore.get(before.id)) tokenSame++;
        if (JSON.stringify(await analysesOf(c.store, toks)) === analysesBefore.get(before.id)) analysisSame++;
      }
      r.eq(caseId, 'unchanged sentences: token rows and analysis rows JSON-identical (same row ids)', `${unchangedTexts.length}/${unchangedTexts.length} token sets, ${unchangedTexts.length}/${unchangedTexts.length} analysis sets (${analysisRows} analysis rows)`, `${tokenSame}/${unchangedTexts.length} token sets, ${analysisSame}/${unchangedTexts.length} analysis sets (${analysisRows} analysis rows)`);
      const retiredTokens = await tokensOf(c.store, retiredOld.id);
      r.that(caseId, 'retired sentence keeps its tokens and analyses (history); its English rescue is gone', `${JSON.parse(tokensBefore.get(retiredOld.id)!).length} tokens kept, rescue removed`,
        `${retiredTokens.length} tokens kept, rescue ${(await c.store.rescues.get(ids.rescue(retiredOld.id))) ? 'STILL PRESENT' : 'removed'}`,
        retiredTokens.length === JSON.parse(tokensBefore.get(retiredOld.id)!).length && !(await c.store.rescues.get(ids.rescue(retiredOld.id))));
      let newAnalyses = 0;
      let newTokens = 0;
      for (const s of addedRows) { const toks = await tokensOf(c.store, s.id); newTokens += toks.length; newAnalyses += (await analysesOf(c.store, toks)).length; }
      const history = contentHistory((await c.store.texts.get(textId))!);
      const written = Number(/(\d+) analysis row/.exec(history[1]?.summary ?? '')?.[1] ?? NaN);
      r.that(caseId, 'analysis rows written for the new sentences', `${newAnalyses} rows for ${newTokens} new tokens (as the version record says)`, `${written} written according to the history; ${newAnalyses} stored for the added sentences`, newAnalyses > 0 && written === newAnalyses);
      const rescuesLive = (await Promise.all(liveAfter.map((s) => c.store.rescues.get(ids.rescue(s.id))))).filter(Boolean).length;
      r.eq(caseId, 'English rescue rows for the 7 live sentences', 7, rescuesLive);

      // learner
      const encAfter = (await c.store.encounters.where('userId', c.userId)).sort((a, b) => (a.id < b.id ? -1 : 1));
      r.that(caseId, 'learner encounters still exist, byte-identical, contentVersion 1', `${encBefore.length} encounters unchanged, all contentVersion 1`,
        `${encAfter.length} encounters ${JSON.stringify(encAfter) === encJsonBefore ? 'unchanged' : 'CHANGED'}; contentVersion ${JSON.stringify(uniq(encAfter.map((e) => e.contentVersion)))}`,
        encAfter.length === encBefore.length && JSON.stringify(encAfter) === encJsonBefore && encAfter.every((e) => e.contentVersion === 1));
      r.that(caseId, 'encounters still point at the retired sentence', 'at least one encounter on the retired sentence id', `${encAfter.filter((e) => e.sentenceId === retiredOld.id).length} encounters`, encAfter.some((e) => e.sentenceId === retiredOld.id));
      await c.golearn.settled();
      const p = await c.golearn.readingProgress(c.userId, textId);
      r.eq(caseId, 'readingProgress reports the current version (version / total / seen / earlier)', { contentVersion: 2, sentencesTotal: 7, sentencesSeen: 2, earlierSeen: 1 },
        { contentVersion: p.contentVersion, sentencesTotal: p.sentencesTotal, sentencesSeen: p.sentencesSeen, earlierSeen: p.earlierVersions?.sentencesSeen });

      // history
      r.eq(caseId, 'contentHistory entries (versions)', [1, 2], history.map((h) => h.version));
      const keyOf = (t: string) => ids.sentenceKey(t);
      r.that(caseId, 'contentHistory v2 names the added and the retired key', `"added [...${keyOf(changedNew[0])}...]" and "retired [${keyOf(changedOld[0])}]"`, history[1]?.summary ?? '(none)',
        !!history[1] && history[1].summary.includes(keyOf(changedOld[0])) && /retired \[/.test(history[1].summary) && changedNew.every((t) => history[1].summary.includes(keyOf(t))));
      r.that(caseId, 'contentHistory v1 is the creation record', 'content version 1 (created): 6 sentence(s)', history[0]?.summary.slice(0, 60) ?? '(none)', /^content version 1 \(created\): 6 sentence\(s\)/.test(history[0]?.summary ?? ''));

      // audio
      const stale = await c.golisten.audioStatus(textId);
      r.that(caseId, 'audioStatus after the revision', `stale (audio for version 1, text at version 2), before: ${statusBefore.state}`,
        `${stale.state} (audio v${stale.audioContentVersion}, text v${stale.textContentVersion}); ${stale.reason?.slice(0, 80) ?? ''}`, stale.state === 'stale' && stale.audioContentVersion === 1 && stale.textContentVersion === 2);
      const ensured = await c.golisten.ensureAudio(textId, { runNow: true });
      r.eq(caseId, 're-ensureAudio created / reused / failed (only the 2 new sentences are synthesized)', { created: 2, reused: 5, failed: 0 }, { created: ensured.created, reused: ensured.reused, failed: ensured.failed });
      const fresh = await c.golisten.audioStatus(textId);
      r.that(caseId, 'audioStatus after re-ensureAudio', 'preview-only, 7/7 ready, audio version 2', `${fresh.state}, ${fresh.readySegments}/${fresh.totalSegments}, audio v${fresh.audioContentVersion}`, fresh.state === 'preview-only' && fresh.readySegments === 7 && fresh.totalSegments === 7 && fresh.audioContentVersion === 2);
      // importing the revised file again is a no-op
      const before = await snapshotStore(c.store);
      const again = (await importDocuments(c.store, c.registry, [v2], { clock: () => '2028-01-01T00:00:00.000Z' })).documents[0];
      r.that(caseId, 're-import of the revised file', 'unchanged, version 2, store identical', `${again.action}, version ${again.contentVersion}, store ${(await snapshotStore(c.store)).fingerprint === before.fingerprint ? 'identical' : 'CHANGED'}`,
        again.action === 'unchanged' && again.contentVersion === 2 && (await snapshotStore(c.store)).fingerprint === before.fingerprint);
      // review binding: a REVIEWED text that is revised without a new review is unpublished until reviewed again
      const bound = (d: CorpusDocument): CorpusDocument => { const x = structuredClone(d); x.id = 'synthetic-es-valid-reviewed'; x.source.id = 'synthetic-src-es-valid-reviewed'; return x; };
      const reviewer = { by: 'SYNTHETIC fixture reviewer (not a person)', date: '2026-09-30' };
      const rv1 = applyReview(bound(v1), reviewer);
      if (!rv1.ok) throw new Error('applyReview refused the synthetic text');
      const b1 = (await importDocuments(c.store, c.registry, [rv1.doc], { clock: c.clock })).documents[0];
      r.eq(caseId, 'reviewed text, version 1', { action: 'created', published: true }, { action: b1.action, published: b1.published });
      const revisedKeepingReview = { ...bound(v2), review: rv1.doc.review };
      const warn = validateBatch([revisedKeepingReview], { registry: c.registry }).documents[0].issues.find((i) => i.code === 'review-signature-mismatch');
      r.that(caseId, 'revision with the OLD review: validation warns', 'warning review-signature-mismatch with a hint naming corpus:review', warn ? `${warn.severity} ${warn.code}: ${warn.hint.slice(0, 80)}` : 'no warning', !!warn && warn.severity === 'warning' && /corpus:review/.test(warn.hint));
      const b2 = (await importDocuments(c.store, c.registry, [revisedKeepingReview], { clock: c.clock })).documents[0];
      r.eq(caseId, 'revision with the OLD review: unpublished, with the reason', { action: 'updated', contentVersion: 2, published: false, reasons: ['the text changed after it was reviewed — record a new review (npm run corpus:review)'] },
        { action: b2.action, contentVersion: b2.contentVersion, published: b2.published, reasons: b2.unpublishedReasons });
      const rv2 = applyReview(bound(v2), reviewer);
      if (!rv2.ok) throw new Error('applyReview refused the revised synthetic text');
      const b3 = (await importDocuments(c.store, c.registry, [rv2.doc], { clock: c.clock })).documents[0];
      r.eq(caseId, 'revision, then applyReview on the revised file: published again', { action: 'updated', contentVersion: 2, published: true, newSignature: true },
        { action: b3.action, contentVersion: b3.contentVersion, published: b3.published, newSignature: rv2.review.contentSignature !== rv1.review.contentSignature });
      r.note(caseId, `version records: ${history.map((h) => `v${h.version}: ${h.summary}`).join(' || ')}`);
      r.note(caseId, `progress after: ${JSON.stringify(p)}; audio stale: ${JSON.stringify({ state: stale.state, reason: stale.reason })}`);
    },
  },

  {
    id: '13 operating-instructions',
    title: 'the documented workflow with the real CLIs: validate, review, validate, import, revise',
    async run(c, r) {
      const caseId = '13 operating-instructions';
      if (!c.cli) return;
      const viteNode = path.resolve('node_modules/vite-node/dist/cli.mjs');
      const cli = (script: string, ...args: string[]) => {
        const x = spawnSync(process.execPath, [viteNode, script, ...args], { encoding: 'utf8', cwd: path.resolve('.'), timeout: 180_000 });
        return { status: x.status, out: `${x.stdout}${x.stderr}` };
      };
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'go-prove-'));
      try {
        const doc = structuredClone(c.load('10-hold-review.json'));
        doc.id = 'synthetic-es-walkthrough';
        doc.source.id = 'synthetic-src-es-walkthrough';
        doc.title = 'SYNTHETIC: operating-instructions walkthrough';
        const file = path.join(tmp, 'walkthrough.json');
        fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

        const v1 = cli('scripts/corpus-validate.mts', file);
        r.that(caseId, 'step 2 validate (before review)', 'exit 0; "would publish: no" and the missing review named',
          `exit ${v1.status}; ${/would publish: no/.test(v1.out) ? 'would publish: no' : '?'}; ${/missing: review status is "unreviewed"/.test(v1.out) ? 'missing review named' : '?'}`,
          v1.status === 0 && /would publish: no/.test(v1.out) && /missing: review status is "unreviewed"/.test(v1.out) && /corpus:validate - 1 document\(s\), 0 error\(s\)/.test(v1.out));
        const bytes = fs.readFileSync(file, 'utf8');
        const refused = cli('scripts/corpus-review.mts', file);
        r.that(caseId, 'step 4 review without --by', 'exit 1, [missing-reviewer], file untouched', `exit ${refused.status}; ${/\[missing-reviewer\]/.test(refused.out) ? '[missing-reviewer]' : '?'}; file ${fs.readFileSync(file, 'utf8') === bytes ? 'untouched' : 'CHANGED'}`,
          refused.status === 1 && /\[missing-reviewer\]/.test(refused.out) && fs.readFileSync(file, 'utf8') === bytes);
        const reviewed = cli('scripts/corpus-review.mts', file, '--by', 'SYNTHETIC fixture reviewer (not a person)', '--date', '2026-09-30', '--notes', 'SYNTHETIC DEVELOPMENT MATERIAL: proof fixture, not a real review.');
        r.that(caseId, 'step 4 review with --by', 'exit 0; removed needs-native-review; text untouched; "review covers wording <sig8>"; "would publish: yes"',
          `exit ${reviewed.status}; ${/removed editorial tag: needs-native-review/.test(reviewed.out) ? 'tag removed' : '?'}; ${/text untouched/.test(reviewed.out) ? 'text untouched' : '?'}; ${/review covers wording [0-9a-f]{8}/.test(reviewed.out) ? 'covers wording' : '?'}; ${/would publish: yes/.test(reviewed.out) ? 'would publish: yes' : '?'}`,
          reviewed.status === 0 && /removed editorial tag: needs-native-review/.test(reviewed.out) && /text untouched/.test(reviewed.out) && /review covers wording [0-9a-f]{8}/.test(reviewed.out) && /would publish: yes/.test(reviewed.out));
        const after = JSON.parse(fs.readFileSync(file, 'utf8')) as CorpusDocument;
        const changedKeys = (Object.keys(after) as Array<keyof CorpusDocument>).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(doc[k]));
        r.eq(caseId, 'step 4 the review edits only review and editorialTags', ['editorialTags', 'review'], changedKeys.sort());
        const v2 = cli('scripts/corpus-validate.mts', file);
        r.that(caseId, 'step 4 validate again', 'exit 0; "would publish: yes"; no "missing:" line', `exit ${v2.status}; ${/would publish: yes/.test(v2.out) ? 'would publish: yes' : 'would publish: no'}; ${/missing:/.test(v2.out) ? 'missing line present' : 'no missing line'}`,
          v2.status === 0 && /would publish: yes/.test(v2.out) && !/missing:/.test(v2.out));

        const created = (await importDocuments(c.store, c.registry, [after], { clock: c.clock })).documents[0];
        r.eq(caseId, 'step 5/6 import of the reviewed file', { action: 'created', contentVersion: 1, published: true }, { action: created.action, contentVersion: created.contentVersion, published: created.published });

        const revised = structuredClone(after);
        const first = (revised.sections[0].paragraphs[0] as { sentences: Array<{ text: string }> }).sentences[0];
        first.text = 'La casa es muy blanca.';
        fs.writeFileSync(file, `${JSON.stringify(revised, null, 2)}\n`, 'utf8');
        const v3 = cli('scripts/corpus-validate.mts', file);
        r.that(caseId, 'step 7 validate the edited file', 'exit 0', `exit ${v3.status}`, v3.status === 0);
        const updated = (await importDocuments(c.store, c.registry, [JSON.parse(fs.readFileSync(file, 'utf8'))], { clock: c.clock })).documents[0];
        r.eq(caseId, 'step 7 import of the edited file', { action: 'updated', contentVersion: 2, added: 1, retired: 1 }, { action: updated.action, contentVersion: updated.contentVersion, added: updated.sentencesAdded, retired: updated.sentencesRetired });
        const reason = 'the text changed after it was reviewed — record a new review (npm run corpus:review)';
        r.eq(caseId, 'step 7 the old review does not cover the new wording: unpublished with the reason', { published: false, reasons: [reason] }, { published: updated.published, reasons: updated.unpublishedReasons });
        const v3b = cli('scripts/corpus-validate.mts', file);
        r.that(caseId, 'step 7 validate says so before importing', 'exit 0, "would publish: no", missing line "the text changed after it was reviewed", warning review-signature-mismatch',
          `exit ${v3b.status}; ${/would publish: no/.test(v3b.out) ? 'would publish: no' : '?'}; ${v3b.out.includes(`missing: ${reason}`) ? 'reason shown' : '?'}; ${v3b.out.includes('[review-signature-mismatch]') ? 'warning shown' : '?'}`,
          v3b.status === 0 && /would publish: no/.test(v3b.out) && v3b.out.includes(`missing: ${reason}`) && v3b.out.includes('[review-signature-mismatch]'));
        const rereview = cli('scripts/corpus-review.mts', file, '--by', 'SYNTHETIC fixture reviewer (not a person)', '--date', '2026-09-30');
        r.that(caseId, 'step 7 new review with --by', 'exit 0, covers a new wording signature, "would publish: yes"',
          `exit ${rereview.status}; ${/review covers wording [0-9a-f]{8}/.test(rereview.out) ? 'covers ' + /review covers wording ([0-9a-f]{8})/.exec(rereview.out)![1] : '?'}; ${/would publish: yes/.test(rereview.out) ? 'would publish: yes' : '?'}`,
          rereview.status === 0 && /review covers wording [0-9a-f]{8}/.test(rereview.out) && /would publish: yes/.test(rereview.out) && /review covers wording ([0-9a-f]{8})/.exec(rereview.out)![1] !== /review covers wording ([0-9a-f]{8})/.exec(reviewed.out)![1]);
        const republished = (await importDocuments(c.store, c.registry, [JSON.parse(fs.readFileSync(file, 'utf8'))], { clock: c.clock })).documents[0];
        r.eq(caseId, 'step 7 import after the new review', { action: 'updated', contentVersion: 2, published: true }, { action: republished.action, contentVersion: republished.contentVersion, published: republished.published });
        r.that(caseId, 'step 7 contentHistory', '2 entries', `${contentHistory((await c.store.texts.get(textIdOf(revised)))!).length} entries`, contentHistory((await c.store.texts.get(textIdOf(revised)))!).length === 2);
        r.note(caseId, `corpus:review output: ${reviewed.out.replace(/\r?\n/g, ' / ').slice(0, 500)}`);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
  },

  {
    id: '14 bundled-isolation',
    title: 'nothing synthetic reaches the bundled corpus',
    async run(c, r) {
      const caseId = '14 bundled-isolation';
      const bundled = loadBundledCorpus();
      r.eq(caseId, 'synthetic ids in loadBundledCorpus()', [], bundled.filter((d) => d.id.startsWith('synthetic-') || JSON.stringify(d).includes('SYNTHETIC DEVELOPMENT MATERIAL')).map((d) => d.id));
      const files: string[] = [];
      const walk = (p: string) => { for (const n of fs.readdirSync(p)) { const f = path.join(p, n); if (fs.statSync(f).isDirectory()) walk(f); else files.push(f); } };
      walk(path.resolve('data/corpus'));
      r.eq(caseId, 'files under data/corpus whose name or text mentions "synthetic"', [], files.filter((f) => /synthetic/i.test(f) || (f.endsWith('.json') && /SYNTHETIC DEVELOPMENT MATERIAL|"id": "synthetic-/.test(fs.readFileSync(f, 'utf8')))));
      r.eq(caseId, 'bundled documents == .json files in data/corpus', files.filter((f) => f.endsWith('.json')).length, bundled.length);
      r.that(caseId, 'the proof store is the in-memory store', 'no IndexedDB in this process; MemoryTable-backed store', `indexedDB is ${typeof (globalThis as { indexedDB?: unknown }).indexedDB}; store.texts is ${c.store.texts.constructor.name}`,
        typeof (globalThis as { indexedDB?: unknown }).indexedDB === 'undefined' && c.store.texts.constructor.name === 'MemoryTable');
      const syn = (await c.store.texts.all()).filter((t) => !t.id.startsWith('text:es:synthetic-') && !t.id.startsWith('text:hi:synthetic-') && !t.id.startsWith('text:th:synthetic-'));
      r.eq(caseId, 'texts in the proof store that are not synthetic', [], syn.map((t) => t.id));
    },
  },
];

// ───────────────────────────── run ─────────────────────────────

export interface ProofResult {
  ok: boolean;
  rows: ProofRow[];
  notes: ProofNote[];
  cases: Array<{ id: string; title: string; checks: number; failed: number }>;
  tables: number;
  finalRows: number;
  dir: string;
}

export const DEFAULT_DIR = 'data/synthetic/import-proof';

/** Run every case, in order, against one fresh in-memory store. */
export async function runProof(opts: { dir?: string; only?: string[]; cli?: boolean } = {}): Promise<ProofResult> {
  const dir = path.resolve(opts.dir ?? DEFAULT_DIR);
  const registry = createAdapterRegistry();
  const store = createMemoryStore();
  const userId = 'synthetic-learner';
  await seedBasics(store, userId, 'honduras-es');
  let tick = Date.UTC(2026, 8, 30, 10, 0, 0);
  const clock = () => new Date((tick += 1000)).toISOString();
  const bus = new StoreEventBus(store, clock);
  const golearn = createGoLearn({ store, bus, adapters: registry, clock });
  golearn.attach();
  const golisten = createGoListen({ store, bus, adapters: registry, clock, allowFixture: true });
  const ctx: ProofContext = {
    dir, store, registry, bus, golearn, golisten, clock, userId, state: {}, cli: opts.cli !== false,
    load: (file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as CorpusDocument,
  };
  const rec = new Recorder();
  const cases: ProofResult['cases'] = [];
  for (const k of CASES) {
    if (opts.only && !opts.only.includes(k.id)) continue;
    const before = rec.rows.length;
    try { await k.run(ctx, rec); }
    catch (e) { rec.that(k.id, 'the case ran to the end', 'no exception', `exception: ${e instanceof Error ? e.stack ?? e.message : String(e)}`, false); }
    const mine = rec.rows.slice(before);
    cases.push({ id: k.id, title: k.title, checks: mine.length, failed: mine.filter((x) => !x.ok).length });
  }
  const final = await snapshotStore(store);
  return { ok: rec.rows.every((x) => x.ok) && rec.rows.length > 0, rows: rec.rows, notes: rec.notes, cases, tables: TABLES.length, finalRows: final.total, dir };
}

// ───────────────────────────── output ─────────────────────────────

const clip = (s: string, n = 400) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The console table: one block per check, expected beside actual. */
export function formatTable(res: ProofResult): string {
  const out: string[] = [];
  let current = '';
  for (const row of res.rows) {
    if (row.caseId !== current) { current = row.caseId; out.push('', `== ${current} — ${res.cases.find((k) => k.id === current)?.title ?? ''}`); }
    out.push(`  ${row.ok ? 'PASS' : 'FAIL'}  ${row.check}`);
    out.push(`        expected: ${clip(row.expected)}`);
    if (!row.ok || row.actual !== row.expected) out.push(`        actual:   ${clip(row.actual)}`);
  }
  const failed = res.rows.filter((x) => !x.ok);
  out.push('', `corpus:prove - ${res.cases.length} case group(s), ${res.rows.length} check(s), ${failed.length} mismatch(es): ${res.ok ? 'ALL MATCH' : 'FAILED'}`);
  for (const f of failed) out.push(`  MISMATCH ${f.caseId}: ${f.check}\n      expected: ${clip(f.expected)}\n      actual:   ${clip(f.actual)}`);
  return out.join('\n');
}

const md = (s: string) => clip(s, 600).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const mdCode = (s: string) => `\`${md(s).replace(/`/g, "'")}\``;

/** docs/import/PROOF.md, generated from a run. Everything below the title comes from `res`. */
export function renderProof(res: ProofResult, o: { command: string; date: string; node: string }): string {
  const L: string[] = [];
  L.push('# Import proof — the importer\'s documented behaviour, exercised on real imports');
  L.push('');
  L.push('> GENERATED by `npm run corpus:prove -- --write` from the actual run. Do not edit by hand: re-run the command.');
  L.push('');
  L.push(`- **Run:** ${o.date} (UTC) on Node ${o.node}`);
  L.push(`- **Command:** \`${o.command}\``);
  L.push('- **Material:** `data/synthetic/import-proof/` — SYNTHETIC DEVELOPMENT MATERIAL for import testing, not learner content (every id starts with `synthetic-`; see that folder\'s README). Never bundled, never read by `loadBundledCorpus()`.');
  L.push(`- **Store:** one isolated in-memory store (\`createMemoryStore\`, ${res.tables} tables); never the bundled folder, never IndexedDB. A synthetic learner with real encounters (real \`StoreEventBus\` + real GoLearn) and real GoListen audio (\`allowFixture: true\`, development fixture) lives in the same store.`);
  L.push(`- **Code under test:** \`importDocuments\`, \`validateBatch\`, \`applyReview\`, \`computePublished\`, \`contentHistory\` (\`src/ingest\`) and the CLI loader (\`scripts/corpus-cli.mts\`).`);
  L.push(`- **Result:** ${res.rows.length} checks in ${res.cases.length} case groups, ${res.rows.filter((x) => !x.ok).length} mismatch(es) — **${res.ok ? 'ALL MATCH' : 'FAILED'}**. The store ended with ${res.finalRows} rows.`);
  L.push('');
  L.push('## Case groups');
  L.push('');
  L.push('| Case | What it proves | Checks | Mismatches |');
  L.push('|---|---|---|---|');
  for (const k of res.cases) L.push(`| ${k.id} | ${md(k.title)} | ${k.checks} | ${k.failed} |`);
  L.push('');
  L.push('## Expected vs actual');
  L.push('');
  L.push('| Case | Check | Expected | Actual | Result |');
  L.push('|---|---|---|---|---|');
  for (const row of res.rows) L.push(`| ${row.caseId} | ${md(row.check)} | ${mdCode(row.expected)} | ${mdCode(row.actual)} | ${row.ok ? 'match' : '**MISMATCH**'} |`);
  L.push('');
  L.push('## Evidence from the run');
  L.push('');
  L.push('Values the table summarises, as the run produced them (validation hints, publication reasons, version records, progress).');
  L.push('');
  for (const n of res.notes) L.push(`- **${n.caseId}** — ${md(n.text)}`);
  L.push('');
  L.push('## Reproduce');
  L.push('');
  L.push('```');
  L.push('npm run corpus:prove              # prints the table, exit 1 on any mismatch');
  L.push('npm run corpus:prove -- --write   # also regenerates this file');
  L.push('npx vitest run test/ingest/prove.test.ts   # the same cases in the test gate');
  L.push('```');
  L.push('');
  return L.join('\n');
}
