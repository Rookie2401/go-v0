/**
 * Test world for the GoTell documents/evidence/privacy modules: the REAL memory Repository store behind the REAL service
 * handler (through the in-process API), one learner account, any number of devices (each with its own session and token).
 */
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createMemoryStore } from '../../packages/repository-store/src';
import { createInProcessApi } from '../../packages/repository-service/src/api';
import type { RepositoryApi } from '../../packages/repository-service/src/api';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { createMemoryArea } from '../../packages/repository-sync/src';
import type { KeyValueArea } from '../../packages/repository-sync/src';
import type { DraftRecord, Identity } from '../../packages/gotell/src/types';
import { createClock, createFakeCrypto, createFakeLinguistics } from '../repository/service/fakes';
import type { Clock } from '../repository/service/fakes';

export interface Device {
  api: RepositoryApi;
  /** The same API, switchable offline: every call rejects like a failed fetch while `offline.value` is true. */
  netApi: RepositoryApi;
  offline: { value: boolean };
  identity: Identity;
  area: KeyValueArea;
  token: string;
}

export interface World {
  clock: Clock;
  deps: ServiceDeps;
  learnerId: string;
  enrolmentId: string;
  device(deviceId: string): Promise<Device>;
}

const METHODS = ['getDocument', 'putDocument', 'deleteDocument', 'listDocuments', 'appendEvents', 'listEvents', 'submitWriting', 'exportAll'] as const;

export function switchable(api: RepositoryApi): { api: RepositoryApi; offline: { value: boolean } } {
  const offline = { value: false };
  const wrapped = { ...api } as unknown as Record<string, unknown>;
  for (const m of METHODS) {
    const f = (api as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[m];
    wrapped[m] = (...a: unknown[]) => (offline.value ? Promise.reject(new TypeError('Failed to fetch')) : f(...a));
  }
  return { api: wrapped as unknown as RepositoryApi, offline };
}

export async function makeWorld(email = 'learner@example.test'): Promise<World> {
  // the service refuses an event dated later than its own clock allows, so the world's clock sits after the fixtures' dates
  const clock = createClock('2026-10-09T10:00:00.000Z');
  const store = createMemoryStore({ now: clock.now });
  const deps: ServiceDeps = {
    store, engine: createProjectionEngine({ store, now: clock.now }), linguistics: createFakeLinguistics(store, clock.now),
    crypto: createFakeCrypto(), now: clock.now, log: () => {},
  };
  const password = 'correct horse battery';
  const created = await createInProcessApi(deps).createAccount({ email, password, displayName: 'Learner' });
  if (!created.ok) throw new Error(`createAccount failed: ${created.status} ${created.error}`);
  let enrolmentId = '';
  const world: World = {
    clock, deps, learnerId: created.data.learnerId, get enrolmentId() { return enrolmentId; },
    async device(deviceId) {
      const api = createInProcessApi(deps);
      const s = await api.createSession({ email, password, deviceId, platform: 'test' });
      if (!s.ok) throw new Error(`createSession failed: ${s.status} ${s.error}`);
      if (!enrolmentId) {
        const e = await api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
        if (!e.ok) throw new Error(`enrol failed: ${e.status} ${e.error}`);
        enrolmentId = e.data.enrolment.enrolmentId;
      }
      const sw = switchable(api);
      return {
        api, netApi: sw.api, offline: sw.offline, token: s.data.token, area: createMemoryArea(),
        identity: { learnerId: created.data.learnerId, enrolmentId, deviceId, languageId: 'sq' },
      };
    },
  };
  return world;
}

let n = 0;
export function blankRecord(over: Partial<DraftRecord> = {}): DraftRecord {
  n++;
  return {
    draftId: `draft-${n}`, languageId: 'sq', mode: 'free', title: `Draft ${n}`, text: '', versions: [], assistance: [],
    createdAt: '2026-10-09T08:00:00.000Z', updatedAt: '2026-10-09T08:00:00.000Z', ...over,
  };
}
