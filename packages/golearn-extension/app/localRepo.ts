/**
 * The on-device Repository as the setup application uses it. The package is `packages/repository-local`; this file states the shape the
 * application relies on (a structural subset of its `LocalRepository`, plus three optional helpers the extension binding adds because
 * the one real repository lives in the background worker), so tests pass a small fake through `Deps.openLocal`.
 *
 * In the extension the page holds no repository of its own: `connectLocalRepository` forwards each call to the worker (`MSG.localRepo`),
 * which owns the single copy of the device's data (localBinding.ts). In the hosted web app the page opens the repository itself on its
 * own storage area.
 */
import type { RepositoryApi, EnrolInput } from '../../repository-service/src/api';
import type { StorageArea } from '../src/platform';

export interface LocalIdentity { learnerId: string; deviceId?: string }

export interface LocalRepo {
  api: RepositoryApi;
  identity(): Promise<LocalIdentity> | LocalIdentity;
  exportEvents(): Promise<unknown>;
  /** One-time upload of the local history to an account (idempotent on event ids). */
  uploadTo(remote: RepositoryApi): Promise<unknown>;
  pullFrom?(remote: RepositoryApi): Promise<unknown>;
  rebuild(): Promise<unknown>;
  /** Deletes the device's local history (explicit, never a side effect of signing out). */
  clear(): Promise<unknown>;
  close(): Promise<void> | void;
  /** The learner's choice of a language, made where the repository lives (the worker): idempotent per language, and it becomes the active one. */
  enrol?(input: EnrolInput): Promise<{ enrolmentId: string }>;
  /** Make an open enrolment of the repository the active one. */
  select?(enrolmentId: string): Promise<void>;
}

/** How many events an upload reports, whatever the field is called (`total`: all of the device’s events now on the account). */
export function uploadedCount(summary: unknown): number {
  if (typeof summary === 'number' && Number.isFinite(summary)) return Math.max(0, Math.floor(summary));
  if (!summary || typeof summary !== 'object') return 0;
  const o = summary as Record<string, unknown>;
  for (const k of ['total', 'sent', 'events', 'uploaded', 'count', 'pushed', 'accepted', 'stored']) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
    if (Array.isArray(v)) return v.length;
  }
  return 0;
}

/** A KeyValueArea (list by prefix) over the page's StorageArea, for the repository's `area` where the page opens it itself. */
export function keyValueAreaOf(area: StorageArea): {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  list(prefix: string): Promise<string[]>;
} {
  return {
    get: (keys) => area.get(keys),
    set: (items) => area.set(items),
    remove: (keys) => area.remove(keys),
    async list(prefix) { return Object.keys(await area.get(null)).filter((k) => k.startsWith(prefix)).sort(); },
  };
}
