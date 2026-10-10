import { CONTRACT_VERSION } from '../../../packages/repository-contract/src';
import type { AnalysisStatus, Enrolment, EventKind, FormAnalysis, GoEvent, LinguisticUnit, UnitKind, UnitRelation } from '../../../packages/repository-contract/src';

export const L = 'learner-1';
export const E = 'enrol-1';
export const NOW = '2026-10-08T12:00:00.000Z';

let counter = 0;
export const resetIds = (): void => { counter = 0; };

export interface EvOpts {
  id?: string; at?: string; sentenceKey?: string; evidence?: GoEvent['evidence']; languageId?: string;
  sourceRef?: { kind: 'web' | 'ebook' | 'file' | 'demo' | 'practice' | 'writing'; title?: string; locator?: string };
}

/** Builds an event with sensible defaults; the id is `ev-N` unless given. */
export function ev(kind: EventKind, itemIds: string[], payload: Record<string, unknown> = {}, o: EvOpts = {}): GoEvent {
  const n = ++counter;
  const e: GoEvent = {
    id: o.id ?? `ev-${String(n).padStart(4, '0')}`, v: CONTRACT_VERSION, learnerId: L, enrolmentId: E, languageId: o.languageId ?? 'sq',
    at: o.at ?? `2026-10-07T10:${String(n % 60).padStart(2, '0')}:00.000Z`,
    producer: { app: 'golearn-app', version: '1', deviceId: 'd1' }, kind, subject: { itemIds }, payload,
  };
  if (o.sentenceKey) e.subject.sentenceKey = o.sentenceKey;
  if (o.sourceRef) e.subject.sourceRef = o.sourceRef;
  if (o.evidence) e.evidence = o.evidence;
  return e;
}

export const lookup = (ids: string[], o?: EvOpts) => ev('SelectionLookedUp', ids, { tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'r', helpShown: ['gloss'] }, o);
export const assist = (ids: string[], payload: Record<string, unknown> = { assistance: 'gloss' }, o?: EvOpts) => ev('AssistanceRequested', ids, payload, o);
export const play = (ids: string[], o?: EvOpts) => ev('PronunciationPlayed', ids, { voice: 'synthetic' }, o);
export const encounter = (ids: string[], o?: EvOpts) => ev('EncounterRecorded', ids, { contextKind: 'sentence' }, o);
export const card = (ids: string[], cardKind: 'recognition' | 'recall' | 'cloze', correct: boolean, extra: Record<string, unknown> = {}, o?: EvOpts) =>
  ev('CardReviewed', ids, { cardKind, grade: correct ? 'good' : 'again', correct, hinted: false, ...extra }, o);
export const listening = (ids: string[], correct: boolean, extra: Record<string, unknown> = {}, o?: EvOpts) =>
  ev('ListeningAssessed', ids, { stimulus: 'word', voice: 'recorded', answerShownBefore: false, correct, responseMode: 'choice', ...extra }, o);
export const grammar = (ids: string[], constructionId: string, correct: boolean, extra: Record<string, unknown> = {}, o?: EvOpts) =>
  ev('AssessmentAnswered', ids, { constructionId, task: 'interpret', correct, hinted: false, ...extra }, o);
export const production = (ids: string[], payload: Record<string, unknown>, o?: EvOpts) =>
  ev('ProductionRecorded', ids, { mode: 'free', assisted: false, assistance: [], usedCorrectly: true, ...payload }, o);

export function unit(unitId: string, kind: UnitKind, status: AnalysisStatus = 'verified', extra: Partial<LinguisticUnit> = {}): LinguisticUnit {
  return {
    unitId, kind, languageId: 'sq', label: unitId.split(':').slice(2).join(':') || unitId, packId: 'pack:sq', packVersion: '1',
    provenance: { source: 'dictionary', ref: 'test', confidence: 0.9, validation: 'production-validated' }, status, createdAt: '2026-01-01T00:00:00.000Z', ...extra,
  };
}

export function realizes(fromId: string, toId: string, status: AnalysisStatus = 'verified'): UnitRelation {
  return { fromId, relation: 'realizes', toId, confidence: 0.9, provenance: { source: 'rule', ref: 'test', confidence: 0.9 }, status };
}

export function analysis(formId: string, status: AnalysisStatus, extra: Partial<FormAnalysis> = {}): FormAnalysis {
  return {
    analysisId: `an:${formId}:${status}`, formId, languageId: 'sq', candidates: [{ confidence: 0.9, provenance: { source: 'rule', ref: 'test', confidence: 0.9, validation: 'production-validated' } }],
    status, analyzerId: 'test', packId: 'pack:sq', packVersion: '1', createdAt: '2026-01-01T00:00:00.000Z', ...extra,
  };
}

export function enrolment(goals: Enrolment['goals'] = [{ kind: 'reading' }]): Enrolment {
  return { enrolmentId: E, learnerId: L, languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals, startedAt: '2026-01-01T00:00:00.000Z' };
}

/** Mulberry32: a seeded PRNG so shuffles are reproducible. */
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
export function shuffled<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** A seeded random-but-valid event over a small unit pool, with timestamp ties, optional sentence keys and evidence notes. */
export function randomEvent(rand: () => number, i: number): GoEvent {
  const pool = ['form:sq:a', 'form:sq:b', 'lemma:sq:a:NOUN', 'morph:sq:NOUN:X', 'syntax:sq:y'];
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const ids = shuffled(pool, rand).slice(0, 1 + Math.floor(rand() * 2));
  const o: EvOpts = { id: `r-${String(i).padStart(3, '0')}`, at: `2026-10-0${1 + Math.floor(rand() * 6)}T10:00:00.000Z` };
  if (rand() < 0.6) o.sentenceKey = pick(['s1', 's2', 's3', 's4']);
  if (rand() < 0.25) {
    o.evidence = { quality: pick(['none', 'weak', 'moderate', 'strong'] as const) };
    if (rand() < 0.3) o.evidence.assisted = true;
    if (rand() < 0.3) o.evidence.sourceReliability = pick([0.2, 0.5, 1]);
  }
  const correct = rand() < 0.6;
  const hinted = rand() < 0.3;
  const difficulty = rand() < 0.5 ? Math.round(rand() * 100) / 100 : undefined;
  const d = difficulty === undefined ? {} : { difficulty };
  switch (Math.floor(rand() * 14)) {
    case 0: return encounter(ids, o);
    case 1: return lookup(ids, o);
    case 2: return assist(ids, { assistance: pick(['gloss', 'grammar', 'transliteration']), depth: pick(['label', 'brief', 'explanatory']) }, o);
    case 3: return play(ids, o);
    case 4: return ev('ListeningCompleted', ids, { voice: 'recorded' }, o);
    case 5: return ev('UnderstoodMarked', ids, { scope: 'sentence', helpUsed: hinted }, o);
    case 6: return ev('ItemMarked', ids, { mark: pick(['known', 'learning', 'productive', 'saved', 'ignore']) }, o);
    case 7: return listening(ids, correct, { hinted, voice: pick(['recorded', 'synthetic']), ...d }, o);
    case 8: return card(ids, pick(['recognition', 'recall', 'cloze'] as const), correct, { hinted, grade: pick(['again', 'hard', 'good', 'easy']), ...d }, o);
    case 9: return grammar(ids, 'morph:sq:NOUN:X', correct, { hinted, ...d }, o);
    case 10: return production(ids, { usedCorrectly: pick([true, false, 'unjudged']), assisted: hinted, assistance: hinted ? ['hint'] : [], mode: pick(['free', 'guided', 'retrieval']) }, o);
    case 11: return ev('CorrectionAccepted', ids, {}, o);
    case 12: return ev('DraftSaved', ids, { draftId: 'd1' }, o);
    default: return ev('CardAdded', ids, {}, o);
  }
}
