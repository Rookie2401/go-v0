/**
 * Test rig for the GoPractice shell: a fake Repository service (the typed API's surface), fake audio, fake exercise
 * builders and a fake evidence builder around GoReview's REAL scheduler, intake, planner and session runner, a memory
 * storage area and a jsdom document. Nothing here touches the network.
 */
import { expect } from 'vitest';
import { CONTRACT_VERSION, validateEvent } from '../../packages/repository-contract/src';
import type {
  Dimension, DimensionEstimate, Enrolment, GoEvent, PrivateDocument, ReviewCandidate, StoredEvent, SyncPullRequest, SyncPushRequest, UnitKnowledge,
} from '../../packages/repository-contract/src';
import { buildCardAdded, gradeResponse, itemIdFor, ratingFor, FAMILY_DIMENSION } from '../../packages/goreview/src';
import type { Exercise, ExerciseBuilder, ExerciseFamily, FactsProvider, GradingPort, ReviewPreferences } from '../../packages/goreview/src';
import { DEFAULT_PREFERENCES } from '../../packages/gopractice/state';
import type { AssessmentSource, AudioStimulus, PlaybackHandle, PronunciationRequest, PronunciationResult } from '../../packages/golisten/src/contracts';
import type { ApiResult, RepositoryApi } from '../../packages/repository-service/src/api';
import { createMemoryArea } from '../../packages/repository-sync/src';
import type { Transport } from '../../packages/repository-sync/src';
import { createApp, type AppHandle } from '../../packages/gopractice/app';
import type { LocalRepo } from '../../packages/gopractice/localRepo';
import { createReviewEngine } from '../../packages/gopractice/engine';
import type { AudioDeps, Deps } from '../../packages/gopractice/ports';
import type { MobileRuntime } from '../../packages/gopractice/mobile';

export const T0 = '2026-10-08T10:00:00.000Z';

export const unitOf = (label: string, lang = 'sq'): string => `lemma:${lang}:${label}:NOUN`;
const GLOSS: Record<string, string> = { zog: 'bird', mace: 'cat', qen: 'dog', shtepi: 'house', det: 'sea', diell: 'sun', hene: 'moon' };
const gloss = (label: string): string => GLOSS[label] ?? 'thing';

// ───────────────────────────── the fake service ─────────────────────────────

export interface Account { email: string; password: string; learnerId: string; displayName?: string }

export class FakeService {
  accounts = new Map<string, Account>();
  tokens = new Map<string, string>();
  enrolments = new Map<string, Enrolment[]>();
  events = new Map<string, StoredEvent[]>();
  candidates = new Map<string, ReviewCandidate[]>();
  knowledge = new Map<string, UnitKnowledge[]>();
  docs = new Map<string, Map<string, PrivateDocument>>();
  corrections: Array<Record<string, unknown>> = [];
  calls: string[] = [];
  platforms: string[] = [];
  /** When true every sync call throws (a dead network). */
  netDown = false;
  /** Emails whose sign-in the service refuses with 403 email-unverified (the grace period is over). */
  unverified = new Set<string>();
  /** When true every call throws. */
  allDown = false;
  private n = 0;

  addAccount(email: string, password: string, learnerId: string, enrolments: Array<Partial<Enrolment> & { languageId: string }>): Account {
    const a = { email, password, learnerId };
    this.accounts.set(email, a);
    this.enrolments.set(learnerId, enrolments.map((e, i): Enrolment => ({
      enrolmentId: `${learnerId}-e${i + 1}`, learnerId, packId: `pack-${e.languageId}`, packVersion: '1', goals: [], startedAt: `2026-09-0${i + 1}T00:00:00.000Z`, ...e,
    })));
    return a;
  }

  head(learnerId: string): number { return (this.events.get(learnerId) ?? []).length; }
  storedEvents(learnerId: string): StoredEvent[] { return this.events.get(learnerId) ?? []; }

  /** An event that arrived from another device or from GoLearn. */
  inject(learnerId: string, e: GoEvent): void {
    const list = this.events.get(learnerId) ?? [];
    list.push({ ...e, seq: list.length + 1, recordedAt: e.at });
    this.events.set(learnerId, list);
  }

  api(token?: string): RepositoryApi {
    const self = this;
    const state: { token: string | undefined } = { token };
    const learner = (): string | undefined => (state.token ? self.tokens.get(state.token) : undefined);
    const ok = <T>(data: T): ApiResult<T> => ({ ok: true, status: 200, data });
    const fail = (status: number, message = 'refused'): ApiResult<never> => ({ ok: false, status, error: 'error', message, body: {} });
    const net = (sync: boolean): void => { if (self.allDown || (sync && self.netDown)) throw new Error('network down'); };
    const api = {
      get token() { return state.token; }, set token(t) { state.token = t; },
      async health() { net(false); return ok({ ok: true as const, service: 'fake', version: 1 }); },
      async createSession(input: { email: string; password: string; deviceId: string; platform?: string }) {
        net(false); self.calls.push('createSession');
        if (input.platform) self.platforms.push(input.platform);
        const a = self.accounts.get(input.email);
        if (!a || a.password !== input.password) return fail(401, 'bad credentials');
        if (self.unverified.has(input.email)) return { ok: false as const, status: 403, error: 'email-unverified', message: 'Confirm your email address first: open the link we sent you.', body: {} };
        const token = `tok-${a.learnerId}-${++self.n}`;
        self.tokens.set(token, a.learnerId);
        state.token = token;
        return ok({ token, learnerId: a.learnerId, expiresAt: '2027-01-01T00:00:00.000Z' });
      },
      async deleteSession() { net(false); self.calls.push('deleteSession'); if (state.token) self.tokens.delete(state.token); state.token = undefined; return { ok: true as const, status: 204, data: null }; },
      async me() {
        net(false); const l = learner(); if (!l) return fail(401);
        const a = [...self.accounts.values()].find((x) => x.learnerId === l)!;
        return ok({ learner: { learnerId: l, createdAt: T0, ...(a.displayName ? { displayName: a.displayName } : {}) }, account: { accountId: `acc-${l}`, email: a.email, createdAt: T0 }, enrolments: self.enrolments.get(l) ?? [], devices: [], consents: [] });
      },
      async listEnrolments() { net(false); const l = learner(); return l ? ok({ enrolments: self.enrolments.get(l) ?? [] }) : fail(401); },
      async candidates(enrolmentId: string) {
        net(false); const l = learner(); if (!l) return fail(401);
        self.calls.push('candidates');
        return ok({ candidates: self.candidates.get(enrolmentId) ?? [] });
      },
      async knowledge(unitIds?: string[]) {
        net(false); const l = learner(); if (!l) return fail(401);
        const all = self.knowledge.get(l) ?? [];
        return ok({ knowledge: unitIds ? all.filter((k) => unitIds.includes(k.unitId)) : all });
      },
      async unit(unitId: string) { net(false); return ok({ unit: { unitId } as never, relations: [], analyses: [] }); },
      async appendEvents(events: GoEvent[]) {
        net(false); const l = learner(); if (!l) return fail(401);
        self.calls.push('appendEvents');
        const list = self.events.get(l) ?? [];
        const outcomes = events.map((e) => {
          const issues = validateEvent(e);
          if (issues.length) return { id: e.id, stored: false, issues };
          if (list.some((x) => x.id === e.id)) return { id: e.id, stored: false, duplicateOf: e.id };
          list.push({ ...e, seq: list.length + 1, recordedAt: e.at });
          return { id: e.id, stored: true };
        });
        self.events.set(l, list);
        return ok({ outcomes, stored: outcomes.filter((o) => o.stored).length, duplicates: outcomes.filter((o) => 'duplicateOf' in o).length, head: list.length, projected: true });
      },
      async listEvents(q: { afterSeq?: number; limit?: number } = {}) {
        net(false); const l = learner(); if (!l) return fail(401);
        self.calls.push('listEvents');
        const list = self.events.get(l) ?? [];
        return ok({ events: list.filter((e) => e.seq > (q.afterSeq ?? 0)).slice(0, q.limit ?? 500), head: list.length });
      },
      async syncPush(req: SyncPushRequest) {
        net(true); const l = learner(); if (!l) return fail(401, 'expired');
        self.calls.push('syncPush');
        const list = self.events.get(l) ?? [];
        const outcomes = req.events.map((e) => {
          const issues = validateEvent(e);
          if (issues.length) return { id: e.id, stored: false, issues };
          if (list.some((x) => x.id === e.id)) return { id: e.id, stored: false, duplicateOf: e.id };
          list.push({ ...e, seq: list.length + 1, recordedAt: e.at });
          return { id: e.id, stored: true };
        });
        self.events.set(l, list);
        return ok({ outcomes, documents: [], serverTime: new Date().toISOString(), clockSkewMs: 0, head: list.length });
      },
      async syncPull(req: SyncPullRequest) {
        net(true); const l = learner(); if (!l) return fail(401, 'expired');
        self.calls.push('syncPull');
        const list = self.events.get(l) ?? [];
        return ok({ events: list.filter((e) => e.seq > req.afterSeq).slice(0, req.limit ?? 500), documents: [], head: list.length, serverTime: new Date().toISOString() });
      },
      async correct(input: Record<string, unknown>) {
        net(false); const l = learner(); if (!l) return fail(401);
        self.corrections.push(input);
        return ok({ result: {}, outcome: { id: 'corr', stored: true }, projected: true });
      },
      async listDocuments() {
        net(false); const l = learner(); if (!l) return fail(401);
        return ok({ documents: [...(self.docs.get(l)?.values() ?? [])].map(({ body: _b, ...m }) => m) });
      },
      async getDocument(docId: string) {
        net(false); const l = learner(); if (!l) return fail(401);
        const d = self.docs.get(l)?.get(docId);
        return d ? ok({ document: d }) : fail(404, 'no such document');
      },
      async putDocument(docId: string, doc: Partial<PrivateDocument> & Pick<PrivateDocument, 'languageId' | 'kind' | 'body'>, expectedRevision: number) {
        net(false); const l = learner(); if (!l) return fail(401);
        const map = self.docs.get(l) ?? new Map<string, PrivateDocument>();
        self.docs.set(l, map);
        const cur = map.get(docId);
        if ((cur?.revision ?? 0) !== expectedRevision) {
          return { ok: false as const, status: 409, error: 'conflict', message: 'The document changed since you last read it.', body: { current: cur } };
        }
        const next: PrivateDocument = { docId, learnerId: l, languageId: doc.languageId, kind: doc.kind, body: doc.body, ...(doc.title ? { title: doc.title } : {}), revision: expectedRevision + 1, deviceId: 'srv', updatedAt: `2026-10-08T10:0${expectedRevision}:00.000Z` };
        map.set(docId, next);
        const { body: _b, ...meta } = next;
        return ok({ document: meta });
      },
      async deleteDocument(docId: string) { net(false); const l = learner(); if (!l) return fail(401); self.docs.get(l)?.delete(docId); return { ok: true as const, status: 204, data: null }; },
    };
    return api as unknown as RepositoryApi;
  }
}

// ───────────────────────────── the on-device Repository ─────────────────────────────

export interface FakeLocalRepo extends LocalRepo {
  learnerId: string;
  uploads: RepositoryApi[];
  pulls: RepositoryApi[];
  cleared: number;
  closed: number;
  /** The worker-style account calls (the extension's copy): who the worker was signed in as. */
  connects: Array<{ email: string }>;
  disconnects: number;
  uploadFails: boolean;
}

export const LOCAL_LEARNER = 'LOC';

/**
 * The device's own Repository, backed by one more learner of the fake service (the service speaks the same routes). `uploadTo` models the
 * real one: the device's events go to the account the remote api belongs to, under that account's learner and enrolment, same ids.
 */
export function fakeLocalRepo(service: FakeService, opts: { enrolments?: Array<Partial<Enrolment> & { languageId: string }>; worker?: boolean; activeLanguageId?: string } = {}): FakeLocalRepo {
  const learnerId = LOCAL_LEARNER;
  service.addAccount('local@device', '!', learnerId, (opts.enrolments ?? [{ languageId: 'sq', varietyId: 'sq-AL' }]).map((e) => ({ goals: [{ kind: 'reading' as const }], ...e })));
  service.tokens.set('local-token', learnerId);
  const repo: FakeLocalRepo = {
    learnerId, uploads: [], pulls: [], cleared: 0, closed: 0, connects: [], disconnects: 0, uploadFails: false,
    api: service.api('local-token'),
    identity: async () => ({ learnerId, deviceId: 'dev-local' }),
    async uploadTo(remote) {
      if (repo.uploadFails) throw new Error('upload refused');
      repo.uploads.push(remote);
      const to = service.tokens.get(remote.token ?? '');
      if (!to) throw new Error('not signed in');
      const target = service.enrolments.get(to)?.[0];
      const mine = service.storedEvents(learnerId);
      for (const e of mine) if (!service.storedEvents(to).some((x) => x.id === e.id)) service.inject(to, { ...e, learnerId: to, enrolmentId: target?.enrolmentId ?? e.enrolmentId } as GoEvent);
      return { sent: mine.length, duplicates: 0, failed: 0 };
    },
    async pullFrom(remote) { repo.pulls.push(remote); return { added: 0 }; },
    async clear() { repo.cleared += 1; service.events.set(learnerId, []); },
    close: () => { repo.closed += 1; },
    ...(opts.activeLanguageId ? { activeLanguageId: async () => opts.activeLanguageId } : {}),
  };
  if (opts.worker) {
    repo.connectAccount = async ({ email, password }) => {
      const a = service.accounts.get(email);
      if (!a || a.password !== password) return { ok: false, message: 'The email or password was not accepted.' };
      repo.connects.push({ email });
      return { ok: true };
    };
    repo.disconnectAccount = async () => { repo.disconnects += 1; };
  }
  return repo;
}

// ───────────────────────────── fake exercises ─────────────────────────────

export const labelOf = (unitId: string): string => unitId.split(':')[2];

const baseExercise = (family: ExerciseFamily, unitId: string, languageId: string, over: Partial<Exercise>): Exercise => ({
  exerciseId: `ex:${family}:${unitId}`, family,
  target: { unitId, unitKind: 'lemma', languageId, dimension: FAMILY_DIMENSION[family] },
  prompt: { instruction: 'Answer.' },
  answerKey: { accepted: [gloss(labelOf(unitId))], normalization: 'loose', explanation: `It means ${gloss(labelOf(unitId))}.`, deeper: 'A longer note on this word.' },
  hiddenBeforeAnswer: [], responseMode: 'choice',
  eligibility: { eligible: true, status: 'high-confidence', caveats: [] }, builtFrom: { facts: [unitId] }, validation: { ok: true, issues: [] },
  ...over,
});

export const fakeStimulus = (unitId: string, languageId = 'sq'): AudioStimulus => ({
  stimulusId: `stim:${unitId}`, languageId, kind: 'word', itemIds: [unitId],
  voice: {
    voiceId: 'device:sq', languageId, provider: 'device', execution: 'local', synthetic: true, licence: 'device', qualityVerification: 'unverified',
    knownLimitations: [], supports: ['word'], suitableForAssessment: false, label: 'Device voice (Albanian)',
  },
  audio: { kind: 'device', text: labelOf(unitId) }, answerHidden: true, replaysAllowed: 2,
  validity: { eligibleForEvidence: false, reason: 'Synthetic speech is generated from the text: practice only, never listening evidence.' },
});

function builder(family: ExerciseFamily, make: (unitId: string, languageId: string) => Partial<Exercise>): ExerciseBuilder {
  return {
    family, dimension: FAMILY_DIMENSION[family],
    canBuild: () => true,
    async build(target) { return baseExercise(family, target.unitId, target.languageId, make(target.unitId, target.languageId)); },
    grade: (exercise, response) => gradeResponse(exercise, response),
  };
}

export const FAKE_BUILDERS: ExerciseBuilder[] = [
  builder('meaning-to-form', (u) => ({
    prompt: { instruction: 'Write the Albanian word.', meaning: gloss(labelOf(u)) }, responseMode: 'typed',
    answerKey: { accepted: [labelOf(u)], normalization: 'loose', explanation: `The word is ${labelOf(u)}.`, deeper: 'Typed answers ignore accents.' },
  })),
  builder('written-recognition', (u) => ({
    prompt: { instruction: 'What does this word mean?', stimulusText: labelOf(u), options: [gloss(labelOf(u)), 'wrong one', 'wrong two'] }, responseMode: 'choice',
  })),
  builder('phrase-comprehension', (u) => ({
    prompt: { instruction: 'Do you know this phrase?', stimulusText: labelOf(u) }, responseMode: 'self-graded',
  })),
  builder('sentence-completion', (u) => ({
    prompt: { instruction: 'Complete the sentence.', sentenceWithGap: 'Unë shoh _____ këtu.' }, responseMode: 'typed',
    answerKey: { accepted: [labelOf(u)], normalization: 'loose', explanation: `The missing word is ${labelOf(u)}.` },
  })),
  builder('audio-to-meaning', (u, l) => ({
    prompt: { instruction: 'Listen and choose the meaning.', stimulusText: labelOf(u), options: [gloss(labelOf(u)), 'wrong one', 'wrong two'], audio: fakeStimulus(u, l) },
    hiddenBeforeAnswer: ['stimulusText'], responseMode: 'choice',
  })),
];

export const fakeFacts: FactsProvider = { factsFor: async (unitId, languageId) => ({
  // Keep this fixture as complete as a verified pack response. Production intake must
  // continue rejecting incomplete facts and unreviewed production sources.
  unit: { unitId, kind: 'lexeme', languageId, label: labelOf(unitId), packId: `pack-${languageId}`, packVersion: '1',
    provenance: { source: 'hand-lexicon', ref: `test:${unitId}`, confidence: 1, validation: 'production-validated' },
    status: 'verified', createdAt: T0 },
  relations: [], analyses: [], status: 'verified', glosses: [gloss(labelOf(unitId))], constructionIds: [], featureExplanations: {},
  siblingForms: [], exampleSentences: [], pronunciationNotes: [],
}) };

export const fakeEvidenceFor: GradingPort['evidenceFor'] = (i) => {
  const audio = i.exercise.family === 'audio-to-meaning' || i.exercise.family === 'audio-transcription';
  const correct = i.grading.outcome === 'correct';
  const base = {
    id: `ev-${i.exercise.exerciseId}-${i.at}`, v: CONTRACT_VERSION, learnerId: i.identity.learnerId, enrolmentId: i.identity.enrolmentId, languageId: i.exercise.target.languageId,
    at: i.at, producer: { app: 'gopractice-review' as const, version: '0.1.0', deviceId: i.identity.deviceId },
    subject: { itemIds: [i.exercise.target.unitId], cardId: i.item.itemId },
  };
  if (audio) {
    return {
      ...base, kind: 'ListeningAssessed',
      payload: { stimulus: 'word', voice: 'synthetic', answerShownBefore: false, correct, responseMode: 'choice', hinted: i.response.hinted },
      evidence: { quality: i.listening?.eligibleForEvidence ? 'moderate' : 'none', assisted: i.response.hinted },
    } as GoEvent;
  }
  return {
    ...base, kind: 'CardReviewed',
    payload: { cardKind: i.exercise.responseMode === 'typed' ? 'recall' : 'recognition', grade: i.rating === 1 ? 'again' : i.rating === 2 ? 'hard' : i.rating === 4 ? 'easy' : 'good', correct, hinted: i.response.hinted || i.response.assistance.length > 0 },
    evidence: { quality: 'moderate', assisted: i.response.hinted || i.response.assistance.length > 0 },
  } as GoEvent;
};

// ───────────────────────────── audio fakes ─────────────────────────────

export interface FakePlayback extends PlaybackHandle { plays: number; disposed: boolean }

export function fakePlayback(fails = false, state: 'idle' | 'playing' | 'ended' = 'idle'): FakePlayback {
  let replays = 0;
  const h = {
    plays: 0, disposed: false, rate: 1,
    play() { h.plays += 1; }, pause() { /* */ }, stop() { /* */ },
    replay() { replays += 1; },
    setRate() { /* */ },
    get state() { return fails ? 'error' as const : state; },
    get replays() { return replays; },
    onEnd() { return () => undefined; },
    dispose() { h.disposed = true; },
  };
  return h as unknown as FakePlayback;
}

export interface FakeAudio extends AudioDeps { handles: FakePlayback[] }

export function fakeAudio(opts: { available?: boolean; playbackFails?: boolean; pronounce?: (request: PronunciationRequest) => Promise<PronunciationResult> } = {}): FakeAudio {
  const handles: FakePlayback[] = [];
  const source: AssessmentSource = {
    prepareStimulus: async () => ({ unavailable: true, reason: 'unused in tests' }),
    playbackOf: () => { const p = fakePlayback(opts.playbackFails === true); handles.push(p); return p; },
    scoringMetadata: (stimulus, replays) => ({ voice: 'synthetic', hinted: replays > stimulus.replaysAllowed, replays, eligibleForEvidence: false }),
  };
  return {
    handles, source: () => source, playbackOf: (s) => source.playbackOf(s),
    ...(opts.pronounce ? { pronounce: opts.pronounce } : {}),
    availability: async () => (opts.available === false
      ? { available: false, eligibleForEvidence: false, reason: 'no Albanian voice is installed' }
      : { available: true, eligibleForEvidence: false, reason: 'only synthetic speech is available: listening practice, never listening evidence' }),
  };
}

// ───────────────────────────── the rig ─────────────────────────────

export interface Clock { now: Date; set(iso: string): void }

export interface Rig {
  root: HTMLElement;
  app: AppHandle;
  service: FakeService;
  /** The on-device Repository, when the rig runs as the extension's copy. */
  local: FakeLocalRepo | undefined;
  area: ReturnType<typeof createMemoryArea>;
  audio: FakeAudio | null;
  clock: Clock;
  deps: Deps;
  q<T extends HTMLElement = HTMLElement>(sel: string): T;
  qa<T extends HTMLElement = HTMLElement>(sel: string): T[];
  go(route: string): Promise<void>;
  signIn(email?: string, password?: string): Promise<void>;
}

export interface RigOptions {
  service?: FakeService;
  area?: ReturnType<typeof createMemoryArea>;
  audio?: FakeAudio | null;
  config?: Deps['config'];
  transport?: (api: RepositoryApi) => Transport;
  mobile?: MobileRuntime;
  /** Run as the extension's copy of GoPractice: the device's own Repository answers, and no account is needed. `true` makes a default one. */
  local?: FakeLocalRepo | boolean | { worker?: boolean; activeLanguageId?: string; enrolments?: Array<Partial<Enrolment> & { languageId: string }> };
  links?: Deps['links'];
  /** Sign in as the default account before returning. */
  signedIn?: boolean;
  builders?: ExerciseBuilder[];
  /** The network the live updates (and nothing else) use; the rig's default throws. */
  fetch?: typeof fetch;
  /** Turn the live updates on with these timers (the rig's autoSync stays off). */
  live?: Deps['live'];
  /** The GoReview (iPhone) edition. */
  edition?: Deps['edition'];
}

export const rigs: Rig[] = [];
export function destroyRigs(): void {
  while (rigs.length) { const r = rigs.pop()!; try { r.app.destroy(); } catch { /* */ } r.root.remove(); }
  window.location.hash = '';
}

export function defaultService(): FakeService {
  const s = new FakeService();
  s.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'sq', varietyId: 'sq-AL', teamId: 'albania' }]);
  return s;
}

export const flush = async (n = 8): Promise<void> => { for (let i = 0; i < n; i++) await new Promise<void>((r) => setTimeout(r, 0)); };

export async function until(cond: () => boolean | Promise<boolean>, what = 'condition', tries = 80): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await cond()) return;
    await flush(1);
  }
  throw new Error(`timed out waiting for ${what}`);
}

export async function makeRig(opts: RigOptions = {}): Promise<Rig> {
  window.location.hash = '';
  document.body.innerHTML = '';
  const root = document.createElement('div');
  root.id = 'app';
  document.body.append(root);
  const service = opts.service ?? defaultService();
  const area = opts.area ?? createMemoryArea();
  const audio = opts.audio === undefined ? fakeAudio() : opts.audio;
  const clock: Clock = { now: new Date(T0), set(iso) { clock.now = new Date(iso); } };
  let ids = 0;
  const now = (): string => clock.now.toISOString();
  const engine = createReviewEngine({
    builders: opts.builders ?? FAKE_BUILDERS, evidenceFor: fakeEvidenceFor, ratingFor, factsFor: () => fakeFacts, now, random: () => 0.5,
  });
  const local: FakeLocalRepo | undefined = !opts.local ? undefined
    : typeof opts.local === 'object' && 'uploads' in opts.local ? opts.local
      : fakeLocalRepo(service, typeof opts.local === 'object' ? opts.local : {});
  const deps: Deps = {
    ...(local ? { local: async () => local } : {}),
    ...(opts.links ? { links: opts.links } : {}),
    ...(opts.live ? { live: opts.live } : {}),
    ...(opts.edition ? { edition: opts.edition } : {}),
    ...(opts.mobile ? { mobile: opts.mobile } : {}),
    win: window, doc: document, fetch: opts.fetch ?? ((() => { throw new Error('no network in tests'); }) as unknown as typeof fetch), area, config: opts.config ?? { serviceUrl: 'https://repository.example.org' },
    createApi: (_url, token) => service.api(token),
    ...(opts.transport ? { createTransport: opts.transport } : {}),
    engine, audio, now: () => new Date(clock.now), newId: () => `id${++ids}`, random: () => 0.5, appVersion: '0.1.0-test', autoSync: false,
    timers: { set: () => 0, clear: () => undefined },
  };
  const app = createApp(root, deps);
  await app.ready();
  const rig: Rig = {
    root, app, service, local, area, audio, clock, deps,
    q<T extends HTMLElement>(sel: string): T { const e = root.querySelector<T>(sel); if (!e) throw new Error(`no element matches ${sel}`); return e; },
    qa<T extends HTMLElement>(sel: string): T[] { return [...root.querySelectorAll<T>(sel)]; },
    async go(route) { await app.go(route); await app.ready(); await flush(3); },
    async signIn(email = 'ana@example.org', password = 'correct-horse-battery') {
      type(rig.q<HTMLInputElement>('#signin-email'), email);
      type(rig.q<HTMLInputElement>('#signin-password'), password);
      rig.q<HTMLFormElement>('#signin-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await until(async () => !!(await deps.area.get('gopractice:session'))['gopractice:session'] || !!root.querySelector('#signin-form .status[data-kind="error"]'), 'sign-in to finish');
      await app.ready(); await flush(6);
    },
  };
  rigs.push(rig);
  if (opts.signedIn) { await rig.signIn(); await rig.go('review'); await until(() => !!root.querySelector('#review-home > *'), 'the review home'); }
  return rig;
}

export function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function key(k: string, target: EventTarget = document): void {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  (target as HTMLElement).dispatchEvent(ev);
}

// ───────────────────────────── fixtures ─────────────────────────────

export interface Ids { learnerId: string; enrolmentId: string; languageId: string }

export function cardAdded(ids: Ids, label: string, family: ExerciseFamily, at: string, extra: { reason?: string; lang?: string } = {}): GoEvent {
  const lang = extra.lang ?? ids.languageId;
  return buildCardAdded({
    learnerId: ids.learnerId, enrolmentId: ids.enrolmentId, languageId: lang, at, deviceId: 'dev-old',
    unitId: unitOf(label, lang), unitKind: 'lemma', dimension: FAMILY_DIMENSION[family], family, addedBy: 'intake', ...(extra.reason ? { reason: extra.reason } : {}),
  });
}

export function reviewed(ids: Ids, label: string, family: ExerciseFamily, rating: 1 | 2 | 3 | 4, at: string, lang?: string): GoEvent {
  const l = lang ?? ids.languageId;
  const unitId = unitOf(label, l);
  return {
    id: `rev-${label}-${at}`, v: CONTRACT_VERSION, learnerId: ids.learnerId, enrolmentId: ids.enrolmentId, languageId: l, at,
    producer: { app: 'gopractice-review', version: '0.1.0', deviceId: 'dev-old' }, kind: 'CardReviewed',
    subject: { itemIds: [unitId], cardId: itemIdFor(unitId, FAMILY_DIMENSION[family]) },
    payload: { cardKind: 'recognition', grade: 'good', correct: rating >= 3, hinted: false, rating, outcome: rating >= 3 ? 'correct' : 'incorrect', family },
    evidence: { quality: 'moderate', assisted: false },
  };
}

export function candidate(label: string, score: number, over: Partial<ReviewCandidate> = {}, lang = 'sq'): ReviewCandidate {
  return {
    unitId: unitOf(label, lang), kind: 'lemma', score,
    reasons: [{ rule: 'looked-up-recently', weight: 0.6, detail: `you looked ${label} up three times this week` }],
    targetDimension: 'productiveRetrieval', eligibility: { eligible: true, status: 'high-confidence', caveats: [] }, cost: 0.2, ...over,
  };
}

const est = (over: Partial<DimensionEstimate> = {}): DimensionEstimate => ({ score: 0, confidence: 0, observations: 0, positive: 0, negative: 0, weight: 0, contexts: 0, ...over });
export function knowledgeRow(learnerId: string, unitId: string, languageId: string, dims: Partial<Record<Dimension, Partial<DimensionEstimate>>>): UnitKnowledge {
  const dimensions = Object.fromEntries((['exposure', 'assistedRecognition', 'readingRecognition', 'listeningRecognition', 'productiveRetrieval', 'contextualProduction', 'grammaticalUnderstanding'] as Dimension[])
    .map((d) => [d, est(dims[d])])) as Record<Dimension, DimensionEstimate>;
  return { learnerId, unitId, languageId, dimensions, retention: { estimate: 0.5, halfLifeDays: 3, basedOn: 'none' }, level: 'seen', encounters: 1, uncertainty: 0.5, modelVersion: 'test', basis: { events: 1 } };
}

/** Appends events straight to the learner's local log (as if pulled or recorded earlier) without queueing them. */
export async function seed(rig: Rig, events: GoEvent[]): Promise<void> {
  const d = await rig.app.ctx.data();
  if (!d) throw new Error('not signed in');
  const out = await d.log.append(d.learnerId, events);
  for (const o of out) expect(o.issues, JSON.stringify(o)).toBeUndefined();
}

export async function queued(rig: Rig): Promise<GoEvent[]> {
  const d = await rig.app.ctx.data();
  return d ? (await d.queue.pending()).map((r) => r.event) : [];
}

export const ids = (learnerId = 'L1', languageId = 'sq'): Ids => ({ learnerId, enrolmentId: `${learnerId}-e1`, languageId });

/** Re-renders the GoReview home (four entries) from the current local log. */
export async function reopen(rig: Rig): Promise<void> {
  await rig.go('settings');
  await rig.go('review');
  await until(() => !!rig.root.querySelector('#current-deck'), 'the current deck');
}

/** Re-renders the review details (the counts, the proposals with reasons, the deck controls, the session controls) from the current local log. */
export async function reopenDetails(rig: Rig): Promise<void> {
  await rig.go('settings');
  await rig.go('review/details');
  await until(() => !!rig.root.querySelector('#due-summary'), 'the due summary');
}

/** Seeds the log, optionally sets preferences, opens GoReview and starts a session; resolves at the first exercise. */
export async function startWith(rig: Rig, events: GoEvent[], prefs: Partial<ReviewPreferences> = {}): Promise<void> {
  await seed(rig, events);
  const id = await rig.app.ctx.identity();
  await rig.app.ctx.state.setPrefs(id!.learnerId, { ...DEFAULT_PREFERENCES(id!.languageId), ...prefs });
  await reopen(rig);
  rig.q('#start-session').click();
  await until(() => !!rig.root.querySelector('#session .exercise'), 'the first exercise');
}

/** A card reviewed long ago, so that it is due. */
export function dueCard(a: Ids, label: string, family: ExerciseFamily): GoEvent[] {
  return [cardAdded(a, label, family, '2026-09-01T09:00:00.000Z'), reviewed(a, label, family, 1, '2026-09-01T10:00:00.000Z')];
}

/** The unit label of the item on screen (not concealed items only). */
export function shownLabel(rig: Rig): string {
  const item = rig.q('.exercise').getAttribute('data-item')!;
  return item.split(':')[4];
}
