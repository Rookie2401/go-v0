/**
 * A `LocalRepository` for a page that must not open a second copy of the device's data.
 *
 * Two in-memory copies of write-through rows over one storage area would number their events from the same sequence and overwrite each other, so the
 * extension keeps ONE repository, in its background worker, and an extension page (the setup app, GoReview when it runs as an extension page) talks to
 * it by message. `connectLocalRepository(send, type)` gives the page the same interface: `api` forwards each method call as `{ type, op: 'api', method, args }`
 * and returns the worker's `ApiResult`; the other methods are the worker's ops of the same name.
 *
 * What differs from the real thing: `uploadTo(remote)` cannot carry `remote` (it holds a bearer token) across a message, so it asks the worker to upload to
 * the account the worker is signed in to (and to pull afterwards); `pullFrom` runs the same op and reports what came in; `onProgress` is not supported.
 */
import type { GoEvent } from '../../repository-contract/src';
import type { RepositoryApi } from '../../repository-service/src/api';
import type { LocalIdentity, LocalRepository } from './local';

export type Send = (message: unknown) => Promise<unknown>;

export function connectLocalRepository(send: Send, type: string): LocalRepository {
  const ask = async (op: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const reply = (await send({ type, op, ...extra })) as Record<string, unknown> | undefined;
    if (!reply || reply.ok !== true) throw new Error(typeof reply?.error === 'string' ? reply.error : 'the local repository did not answer');
    return reply;
  };
  const unavailable = (status = 0): { ok: false; status: number; error: string; message: string; body: Record<string, unknown> } =>
    ({ ok: false, status, error: 'unavailable', message: 'The on-device Repository did not answer.', body: {} });
  const api = new Proxy({} as RepositoryApi, {
    get(_t, method) {
      if (typeof method !== 'string' || method === 'then') return undefined; // an api is not a promise
      if (method === 'token') return undefined;
      return async (...args: unknown[]) => {
        try { return ((await ask('api', { method, args })).result as unknown) ?? unavailable(); } catch (e) {
          return { ...unavailable(), message: e instanceof Error ? e.message : String(e) };
        }
      };
    },
    set() { return true; }, // the worker owns the session; a token set here is ignored
  });
  return {
    api,
    async identity(): Promise<LocalIdentity> { const r = await ask('identity'); return { learnerId: String(r.learnerId), deviceId: String(r.deviceId) }; },
    async exportEvents(): Promise<GoEvent[]> { return (await ask('export')).events as GoEvent[]; },
    async uploadTo() {
      const r = await ask('upload');
      const u = (r.upload ?? {}) as { sent?: number; duplicates?: number; failed?: number };
      return { sent: u.sent ?? 0, duplicates: u.duplicates ?? 0, failed: u.failed ?? 0 };
    },
    async pullFrom() { const r = await ask('upload'); return { added: typeof r.pulled === 'number' ? r.pulled : 0 }; },
    async rebuild() { await ask('rebuild'); },
    async clear() { await ask('clear'); },
    async close() { /* the worker keeps the repository open */ },
  };
}
