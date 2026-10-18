/**
 * The on-device Repository as GoPractice uses it when it runs inside the extension: no account, no server. The one real repository lives in
 * the extension's background worker (it records every lookup into it); this page reaches it by message (localBinding.ts, built on
 * `connectLocalRepository` of packages/repository-local). Tests pass a small fake through `Deps.local`.
 *
 * What GoPractice needs of it: its typed `api` (enrolments, candidates, knowledge, documents, events), the local learner's identity, the
 * one-time `uploadTo` / `pullFrom` when the learner signs in or out, and `clear`. The repository answers `appendEvents` / `listEvents`
 * (not the sync routes), so the sync client is given `localTransport`, which moves the queue and the local log through those two.
 */
import type { SyncPullRequest, SyncPullResponse, SyncPushRequest, SyncPushResponse } from '../repository-contract/src';
import type { RepositoryApi } from '../repository-service/src/api';
import type { Transport } from '../repository-sync/src';

export interface LocalIdentity { learnerId: string; deviceId?: string }

export interface LocalRepo {
  api: RepositoryApi;
  identity(): Promise<LocalIdentity> | LocalIdentity;
  /** The one-time upload of the device's history to the account the repository is signed in to (idempotent on event ids). */
  uploadTo(remote: RepositoryApi): Promise<unknown>;
  /** Brings the account's history down to the device (after an upload, and before signing out). */
  pullFrom?(remote: RepositoryApi): Promise<unknown>;
  /** The learner's "clear local data". */
  clear(): Promise<unknown>;
  close(): Promise<void> | void;
  /** Extension only: signs the worker in to the same account, so its upload and pull use it. */
  connectAccount?(input: { baseUrl: string; email: string; password: string }): Promise<{ ok: true } | { ok: false; message: string; code?: string }>;
  /** Extension only: signs the worker out of the account (the device's data stays). */
  disconnectAccount?(): Promise<void>;
  /** The language the learner chose in GoLearn setup, when the repository knows one. */
  activeLanguageId?(): Promise<string | undefined>;
}

export class LocalApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'LocalApiError'; }
}

/** The sync client's transport over the repository's `appendEvents` / `listEvents`: the queue goes in, the repository's own events (GoLearn's lookups too) come out. */
export function localTransport(api: RepositoryApi, now: () => string): Transport {
  return {
    async push(req: SyncPushRequest): Promise<SyncPushResponse> {
      const r = await api.appendEvents(req.events);
      if (!r.ok) throw new LocalApiError(r.status, r.message || `The on-device record answered ${r.status}.`);
      return { outcomes: r.data.outcomes, documents: [], serverTime: now(), clockSkewMs: 0, head: r.data.head };
    },
    async pull(req: SyncPullRequest): Promise<SyncPullResponse> {
      const r = await api.listEvents({ afterSeq: req.afterSeq, ...(req.limit ? { limit: req.limit } : {}) });
      if (!r.ok) throw new LocalApiError(r.status, r.message || `The on-device record answered ${r.status}.`);
      return { events: r.data.events, documents: [], head: r.data.head, serverTime: now() };
    },
  };
}

/** How many events an upload reports, whatever the field is called (`total`: all of the device's events now on the account). */
export function uploadedCount(summary: unknown): number {
  if (typeof summary === 'number' && Number.isFinite(summary)) return Math.max(0, Math.floor(summary));
  if (!summary || typeof summary !== 'object') return 0;
  const o = summary as Record<string, unknown>;
  for (const k of ['total', 'sent', 'events', 'uploaded', 'count']) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
    if (Array.isArray(v)) return v.length;
  }
  return 0;
}
