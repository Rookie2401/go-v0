/**
 * Shared support for the MODEL / SCHEDULER / LISTEN audit (docs/ecosystem/audit/MODEL-SCHEDULER-LISTEN.md).
 * Nothing here is imported by production code. The audit uses the REAL engine, store, linguistics service, scheduler,
 * intake, planner and GoListen; the only fakes are a controllable clock and the browser ports GoListen needs.
 *
 * Audit rows: every test may call `note(...)` with (case, expected, observed). When AUDIT_ROWS_DIR is set the rows of the
 * file are written to <dir>/<file>.json at the end of the run, so the report tables are generated from what the tests
 * actually observed (nothing is typed into the report by hand). Without the variable nothing is written.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll } from 'vitest';
import { CONTRACT_VERSION, DIMENSIONS } from '../../packages/repository-contract/src';
import type { Dimension, Enrolment, EventKind, GoEvent, UnitKnowledge } from '../../packages/repository-contract/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createLinguisticService } from '../../packages/repository-linguistics/src';
import { createMemoryStore, openSqliteStore } from '../../packages/repository-store/src';
import type { RepositoryStore } from '../../packages/repository-contract/src';

// ───────────────────────────── audit rows ─────────────────────────────

export interface AuditRow { id: string; group: string; caseName: string; expected: string; observed: string; pass: boolean }
const rows: AuditRow[] = [];

export function note(id: string, group: string, caseName: string, expected: string, observed: string, pass = true): void {
  rows.push({ id, group, caseName, expected, observed, pass });
}

/** Call once at the top level of a test file: flushes the rows of the file when AUDIT_ROWS_DIR is set. */
export function flushRowsAfterAll(file: string): void {
  afterAll(() => {
    const dir = process.env.AUDIT_ROWS_DIR;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${file}.json`, JSON.stringify(rows, null, 1));
  });
}

// ───────────────────────────── the world ─────────────────────────────

export const LEARNER = 'learner-audit';
export const ENROL = 'enrol-audit-sq';
export const NOW = '2026-10-09T12:00:00.000Z';
export const BASE_MS = Date.parse('2026-10-01T09:00:00.000Z');
export const MIN = 60_000;
export const DAY = 86_400_000;
export const iso = (ms: number): string => new Date(ms).toISOString();

export interface World {
  kind: 'memory' | 'sqlite';
  store: RepositoryStore;
  engine: ReturnType<typeof createProjectionEngine>;
  linguistics: ReturnType<typeof createLinguisticService>;
  /** The fixed read instant of the engine (decay is computed against it). */
  now: string;
}

export async function makeWorld(kind: 'memory' | 'sqlite', opts: { now?: string; goals?: Enrolment['goals'] } = {}): Promise<World> {
  const now = opts.now ?? NOW;
  const store: RepositoryStore = kind === 'memory' ? createMemoryStore({ now: () => now }) : openSqliteStore(':memory:', { now: () => now });
  const engine = createProjectionEngine({ store, now: () => now });
  const linguistics = createLinguisticService(store, { now: () => now });
  await store.putLearner({ learnerId: LEARNER, createdAt: '2026-01-01T00:00:00.000Z' });
  await store.putEnrolment({
    enrolmentId: ENROL, learnerId: LEARNER, languageId: 'sq', packId: 'pack:sq', packVersion: '9',
    goals: opts.goals ?? [{ kind: 'reading' }], startedAt: '2026-01-01T00:00:00.000Z',
  });
  return { kind, store, engine, linguistics, now };
}

// ───────────────────────────── events ─────────────────────────────

let seq = 0;
export interface EvOpts {
  id?: string; at?: string; deviceId?: string; app?: GoEvent['producer']['app']; dedupeKey?: string;
  evidence?: GoEvent['evidence']; cardId?: string; sentenceKey?: string; languageId?: string; learnerId?: string; correctionOf?: string;
}

/** Builds a valid contract-v2 event. The id and (unless given) the instant are unique and increasing. */
export function ev(kind: EventKind, itemIds: string[], payload: Record<string, unknown>, o: EvOpts = {}): GoEvent {
  const n = ++seq;
  return {
    id: o.id ?? `aud-${String(n).padStart(6, '0')}`, v: CONTRACT_VERSION, learnerId: o.learnerId ?? LEARNER, enrolmentId: ENROL,
    languageId: o.languageId ?? 'sq', at: o.at ?? iso(BASE_MS + n * MIN),
    producer: { app: o.app ?? 'gopractice-review', version: 'audit', deviceId: o.deviceId ?? 'dev-A' }, kind,
    subject: { itemIds, ...(o.cardId ? { cardId: o.cardId } : {}), ...(o.sentenceKey ? { sentenceKey: o.sentenceKey } : {}) }, payload,
    ...(o.dedupeKey ? { dedupeKey: o.dedupeKey } : {}), ...(o.evidence ? { evidence: o.evidence } : {}), ...(o.correctionOf ? { correctionOf: o.correctionOf } : {}),
  };
}

export const recognition = (ids: string[], correct: boolean, o: EvOpts = {}, extra: Record<string, unknown> = {}): GoEvent =>
  ev('CardReviewed', ids, { cardKind: 'recognition', grade: correct ? 'good' : 'again', correct, hinted: false, answerShownBefore: false, ...extra }, o);
export const recall = (ids: string[], correct: boolean, o: EvOpts = {}, extra: Record<string, unknown> = {}): GoEvent =>
  ev('CardReviewed', ids, { cardKind: 'recall', grade: correct ? 'good' : 'again', correct, hinted: false, answerShownBefore: false, ...extra }, o);
export const grammar = (ids: string[], constructionId: string, correct: boolean, o: EvOpts = {}, extra: Record<string, unknown> = {}): GoEvent =>
  ev('AssessmentAnswered', ids, { constructionId, task: 'interpret', correct, hinted: false, ...extra }, o);
export const listened = (ids: string[], correct: boolean, o: EvOpts = {}, extra: Record<string, unknown> = {}): GoEvent =>
  ev('ListeningAssessed', ids, { stimulus: 'word', voice: 'recorded', answerShownBefore: false, correct, responseMode: 'choice', hinted: false, ...extra }, o);
export const produced = (ids: string[], usedCorrectly: boolean | 'unjudged', o: EvOpts = {}, extra: Record<string, unknown> = {}): GoEvent =>
  ev('ProductionRecorded', ids, { mode: 'free', assisted: false, assistance: [], usedCorrectly, ...extra }, o);
export const played = (ids: string[], voice: 'synthetic' | 'recorded', o: EvOpts = {}): GoEvent => ev('PronunciationPlayed', ids, { voice }, o);

/** Appends through the REAL store (validation + de-duplication) and returns the outcomes; the engine then folds incrementally. */
export async function append(w: World, ...events: GoEvent[]) {
  const out = await w.store.append(LEARNER, events);
  await w.engine.project(LEARNER);
  return out;
}

// ───────────────────────────── rows ─────────────────────────────

export async function rowsOf(w: World): Promise<Map<string, UnitKnowledge>> {
  return new Map((await w.engine.knowledge(LEARNER)).map((r) => [r.unitId, r]));
}

/** `unit|dimension` of every dimension estimate that differs between two snapshots (a new row counts when it holds any observation). */
export function changed(before: Map<string, UnitKnowledge>, after: Map<string, UnitKnowledge>): string[] {
  const out: string[] = [];
  for (const [id, a] of after) {
    const b = before.get(id);
    for (const d of DIMENSIONS) {
      const x = b?.dimensions[d];
      const y = a.dimensions[d];
      if (JSON.stringify(x) !== JSON.stringify(y) && y.observations > 0) out.push(`${id}|${d}`);
    }
  }
  return out.sort();
}

export const dimOf = (rows: Map<string, UnitKnowledge>, unitId: string, d: Dimension) => {
  const r = rows.get(unitId);
  if (!r) throw new Error(`no knowledge row for ${unitId}`);
  return r.dimensions[d];
};

/** Rows in a comparable, order-independent form. */
export const normal = (rs: Iterable<UnitKnowledge>): string => JSON.stringify([...rs].sort((a, b) => (a.unitId < b.unitId ? -1 : 1)));

/** Seeded PRNG (mulberry32) and Fisher-Yates, so every shuffled run is reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

// ───────────────────────────── the Albanian fixture ─────────────────────────────

export const SENT_SHKOLLE = 'Ana shkon në shkollë.';
export const LEM = 'lemma:sq:shkollë:NOUN';
export const FORM = 'form:sq:shkollë';
export const SENSE = 'sense:sq:shkollë:NOUN:1';
export const CONSTR = 'morph:sq:NOUN:Case=Acc|Definite=Ind|Gender=Fem|Number=Sing';

/** Stores the REAL resolver's units / relations / analysis for a form of the Albanian adapter. */
export async function resolve(w: World, surface: string, sentence?: string) {
  const r = await w.linguistics.resolveAndStore({ languageId: 'sq', surface, ...(sentence ? { sentence } : {}) });
  if (!r.coverage.known) throw new Error(`the Albanian analyser did not read ${surface}: ${r.coverage.notes.join(' | ')}`);
  return r;
}
