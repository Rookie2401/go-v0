import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, type GoEvent, type ReviewCandidate } from '../../packages/repository-contract/src';
import { foldEvents } from '../../packages/repository-engine/src';
import type { RepositoryApi, VocabularyItem } from '../../packages/repository-service/src/api';
import { createReviewEngine } from '../../packages/goreview/app/engine';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import { DEFAULT_PREFERENCES } from '../../packages/goreview/app/state';
import { evidenceFor, ratingFor, registry } from '../../packages/goreview/src';
import { formUnitId } from '../../packages/biblia/src/levels';
import { gzipSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const NOW = '2026-11-01T12:00:00.000Z';
const ENROLMENT = 'el-recovery-enrolment';
const LEARNER = 'el-recovery-learner';
const surface = 'ἐγέννησεν';
const unitId = formUnitId('el', surface);
const event = (n: number): GoEvent => ({
  id: `event:${unitId}:${n}`, v: CONTRACT_VERSION, learnerId: LEARNER, enrolmentId: ENROLMENT, languageId: 'el', at: new Date(Date.parse(NOW) - (2 - n) * 60_000).toISOString(),
  producer: { app: 'golearn-ext', version: '0.1.0', deviceId: 'greek-device', surface: 'biblia-reading' },
  kind: 'EncounterRecorded', subject: { itemIds: [unitId] },
  payload: { tokenCount: 5, contextKind: 'sentence', contextConfidence: 1, readerId: 'biblia',
    language: { languageId: 'el', varietyId: 'el-koi', basis: 'override', confidence: 1, source: 'biblia:Matt.1.2', override: true } },
  dedupeKey: `greek:${unitId}:${n}`,
});
const events = [event(0), event(1), event(2)];
const knowledge = foldEvents(events, { modelVersion: 'projection@7' });
const unresolved: VocabularyItem[] = [{ knowledge: knowledge[0]!, surfaceForms: [surface], sources: [] }];
const placeholder: ReviewCandidate = { unitId, kind: 'unknown', score: 0, reasons: [], targetDimension: 'readingRecognition', eligibility: { eligible: false, status: 'unknown', reason: 'unit is not in the linguistic store' }, cost: 0.2 };
const assetRequests: string[] = [];
const files = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  assetRequests.push(url.pathname);
  if (url.pathname === '/lexicon/el/koine-index.json.gz') return new Response(gzipSync(fs.readFileSync(path.resolve(__dirname, '../../public/lexicon/el/koine-index.json'))));
  if (/^\/dict\/[^/]+\/manifest\.json$/u.test(url.pathname)) {
    const file = path.join(path.resolve(__dirname, '../../public'), decodeURIComponent(url.pathname));
    if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    return new Response(JSON.stringify({ ...manifest, hasFrequency: false }));
  }
  if (/\/frequency\.json$/u.test(url.pathname)) return new Response('not found', { status: 404 });
  const file = path.join(path.resolve(__dirname, '../../public'), decodeURIComponent(url.pathname));
  return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
}) as typeof fetch;

const api = {
  async units(ids: string[]) { return { ok: true, status: 200, data: { units: {}, missing: ids } }; },
  async unit() { return { ok: false, status: 404, error: 'not-found', message: 'not found', body: {} }; },
  async listEnrolments() { return { ok: true, status: 200, data: { enrolments: [{ enrolmentId: ENROLMENT, learnerId: LEARNER, languageId: 'el', varietyId: 'el-koi', packId: 'pack:el', packVersion: '1', goals: [{ kind: 'reading' }], startedAt: NOW }] } }; },
} as unknown as RepositoryApi;

describe('Greek language recovery through ordinary review flow', () => {
  it('recovers a genuinely absent Koine form, admits written recognition, builds it, and plans it', async () => {
    const engine = createReviewEngine({ builders: registry, evidenceFor, ratingFor, now: () => NOW, random: () => 0,
      factsFor: packFactsFor({ fetch: files, baseUrl: 'http://assets.local/' }) });
    expect(engine.canRecoverCandidates?.('el', api)).toBe(true);
    expect(engine.canRecoverCandidates?.('xx', api)).toBe(false);
    const prefs = { ...DEFAULT_PREFERENCES('el'), varietyId: 'el-koi' };
    const recovered = await engine.recoverCandidates!({ api, enrolmentId: ENROLMENT, languageId: 'el', varietyId: 'el-koi', prefs,
      events, deck: [], knowledge, unresolvedVocabulary: unresolved, existingCandidates: [placeholder], now: NOW });
    expect(recovered.complete).toBe(true);
    const candidate = recovered.candidates.find(row => row.unitId === unitId);
    expect(candidate?.unitId).toBe(unitId);
    const intake = await engine.intake({ api, candidates: [candidate!], knowledge, deck: [], saved: new Set(), prefs,
      audio: { available: false, eligibleForEvidence: false, reason: 'no audio' }, now: NOW, events });
    expect(intake[0]?.proposed).toMatchObject({ family: 'written-recognition' });
    expect(intake[0]?.decision).toBe('test-now');
    expect(await engine.exerciseAvailable!({ unitId, unitKind: 'form', languageId: 'el', varietyId: 'el-koi', dimension: 'written-recognition',
      family: 'written-recognition', api, now: NOW })).toBe(true);
    const plan = engine.plan({ deck: [], intake, prefs, audio: { available: false, eligibleForEvidence: false, reason: 'no audio' }, now: NOW,
      knowledge, readingSignals: events });
    expect(plan.items.some(item => item.item.unitId === unitId && item.isNew)).toBe(true);
    expect(assetRequests.some(url => /^\/dict\/[^/]+\/frequency\.json$/u.test(url))).toBe(false);
  });

  it('surfaces the German forms-index ambiguity as a per-word readiness reason', async () => {
    const engine = createReviewEngine({ builders: registry, evidenceFor, ratingFor, now: () => NOW,
      factsFor: packFactsFor({ fetch: files, baseUrl: 'http://assets.local/' }) });
    const readiness = await engine.exerciseReadiness!({ unitId: 'form:de:dem', unitKind: 'form', languageId: 'de', varietyId: 'de-DE',
      dimension: 'written-recognition', family: 'written-recognition', api, now: NOW });
    expect(readiness.available).toBe(false);
    expect(readiness.reason).toContain('several different lemma readings');
    expect(readiness.retryable).toBe(false);
    const missingFacts = await engine.exerciseReadiness!({ unitId: 'form:de:inventedword', unitKind: 'form', languageId: 'de', varietyId: 'de-DE',
      dimension: 'written-recognition', family: 'written-recognition', api, now: NOW });
    expect(missingFacts.available).toBe(false);
    expect(missingFacts.retryable).toBe(true);
    expect(assetRequests.some(url => /^\/dict\/[^/]+\/frequency\.json$/u.test(url))).toBe(false);
  });
});
