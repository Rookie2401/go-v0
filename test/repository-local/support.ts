/**
 * Test support for the device-local Repository: a REAL remote (memory store, projection engine, linguistic service, the service handler,
 * Node crypto: the server side of the same parts), an area that can fail, and event builders.
 */
import { CONTRACT_VERSION, type GoEvent } from '../../packages/repository-contract/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createLinguisticService } from '../../packages/repository-linguistics/src';
import { createInProcessApi, type RepositoryApi } from '../../packages/repository-service/src/api';
import { nodeCrypto } from '../../packages/repository-service/src/crypto-node';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { adaptLinguistics } from '../../packages/repository-service/src/linguistics-adapter';
import { createMemoryStore } from '../../packages/repository-store/src/memory';
import { createMemoryArea, type KeyValueArea } from '../../packages/repository-sync/src/area';

export type TestArea = ReturnType<typeof createMemoryArea>;
export const newArea = (): TestArea => createMemoryArea();

/** A clock that only moves when told to. */
export function clock(startIso = '2026-10-09T08:00:00.000Z') {
  let ms = Date.parse(startIso);
  return { now: (): string => new Date(ms).toISOString(), tick: (by = 60_000): void => { ms += by; } };
}

/** An area whose writes can be made to fail (a full disk). */
export function failingArea(inner: KeyValueArea): KeyValueArea & { failing: boolean } {
  const a = {
    failing: false,
    get: (k: string | string[] | null) => inner.get(k),
    list: (p: string) => inner.list(p),
    remove: (k: string | string[]) => inner.remove(k),
    set: async (items: Record<string, unknown>) => { if (a.failing) throw new Error('QUOTA_BYTES quota exceeded'); await inner.set(items); },
  };
  return a;
}

export interface Account { api: RepositoryApi; learnerId: string; deviceId: string; enrolmentId: string; email: string }
export interface Remote {
  deps: ServiceDeps;
  clock: ReturnType<typeof clock>;
  /** Creates an account, signs in from `deviceId` and enrols it in Albanian; returns a client for that session. */
  signUp(email: string, deviceId: string, languages?: string[]): Promise<Account>;
  /** A second session of an existing account from another device. */
  signIn(email: string, deviceId: string): Promise<RepositoryApi>;
}

export function createRemote(c = clock()): Remote {
  const store = createMemoryStore({ now: c.now });
  const engine = createProjectionEngine({ store, now: c.now });
  const deps: ServiceDeps = { store, engine, linguistics: adaptLinguistics(createLinguisticService(store, { now: c.now })), crypto: nodeCrypto, now: c.now, log: () => {} };
  const PASSWORD = 'correct horse battery staple';
  const ok = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>): T => {
    if (!r.ok) throw new Error(`api ${r.status} ${String(r.error)}: ${String(r.message)}`);
    return r.data as T;
  };
  return {
    deps, clock: c,
    async signUp(email, deviceId, languages = ['sq']) {
      const api = createInProcessApi(deps);
      ok(await api.createAccount({ email, password: PASSWORD }));
      const s = ok<{ learnerId: string }>(await api.createSession({ email, password: PASSWORD, deviceId, platform: 'test' }));
      let enrolmentId = '';
      for (const lang of languages) {
        const e = ok<{ enrolment: { enrolmentId: string } }>(await api.enrol({ languageId: lang, packId: `pack:${lang}`, packVersion: '1', goals: [{ kind: 'reading' }] }));
        enrolmentId ||= e.enrolment.enrolmentId;
      }
      return { api, learnerId: s.learnerId, deviceId, enrolmentId, email };
    },
    async signIn(email, deviceId) {
      const api = createInProcessApi(deps);
      ok(await api.createSession({ email, password: PASSWORD, deviceId, platform: 'test' }));
      return api;
    },
  };
}

let counter = 0;
export interface Who { learnerId: string; enrolmentId: string; deviceId: string }

/** A SelectionLookedUp event for `surface` (lemma/form ids in the subject). */
export function lookup(who: Who, surface: string, c: ReturnType<typeof clock>, extra: Partial<GoEvent> = {}): GoEvent {
  counter += 1;
  const lemma = `lemma:sq:${surface}:NOUN`;
  return {
    id: `t:${counter}:${surface}`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq', at: c.now(),
    producer: { app: 'golearn-ext', version: '0.0.0', deviceId: who.deviceId }, kind: 'SelectionLookedUp',
    subject: { itemIds: [lemma, `form:sq:${surface}`] },
    payload: { surface, tokenCount: 1, contextKind: 'none', contextConfidence: 0, readerId: 'demo', helpShown: ['surface'], mode: 'word-list-only' },
    dedupeKey: `t:${counter}`, ...extra,
  };
}

/** A CardReviewed-style event (family "review"). */
export function review(who: Who, unitId: string, c: ReturnType<typeof clock>, extra: Partial<GoEvent> = {}): GoEvent {
  counter += 1;
  return {
    id: `r:${counter}`, v: CONTRACT_VERSION, learnerId: who.learnerId, enrolmentId: who.enrolmentId, languageId: 'sq', at: c.now(),
    producer: { app: 'gopractice-review', version: '0.0.0', deviceId: who.deviceId }, kind: 'CardReviewed',
    subject: { itemIds: [unitId], cardId: `card:${counter}` }, payload: { cardKind: 'recognition', grade: 'good', correct: true, hinted: false },
    dedupeKey: `r:${counter}`, ...extra,
  };
}
