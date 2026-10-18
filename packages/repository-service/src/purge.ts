/// <reference types="node" />
/**
 * The scheduled maintenance of the Repository: purge the accounts whose deletion grace has run out, and prune what only needs to be kept a while.
 * Run by `main.ts` at start and every PURGE_INTERVAL_MINUTES, and by `scripts/ops/purge.mts` (a systemd timer or cron job) against the data directly.
 *
 * What a purge removes: everything `eraseLearner` removes (events, projections, documents, preferences, sessions, devices, enrolments, tombstones, team
 * memberships, the account, the learner row, and the learner's tokens and security-log lines). What it leaves: the shared linguistic tables (units,
 * relations, analyses, aliases, packs), which are facts about words and hold no learner (rows stamped at a lookup carry no learner id, device or email).
 * It writes one audit line that names no one: the kind `deletion-purged`, a truncated digest of the account id, and counts.
 */
import { createHash } from 'node:crypto';
import type { RepositoryStore } from '../../repository-contract/src';

const DAY_MS = 24 * 3600 * 1000;
/** Ended sessions and spent tokens are kept this long, then pruned. */
export const SESSION_RETENTION_DAYS = 30;
export const TOKEN_RETENTION_DAYS = 7;
/** Security-log lines are kept this long (a year and a month), then pruned. The purge audit lines are pruned with them. */
export const SECURITY_LOG_RETENTION_DAYS = 400;

export interface MaintenanceResult {
  purged: number;
  sessionsPruned: number;
  tokensPruned: number;
  securityEventsPruned: number;
}

export interface MaintenanceOptions { now?: () => string; log?: (line: string) => void }

/** A stable, non-reversible reference to an account for the audit line (not enough to identify anyone without the account id itself). */
export const subjectRefOf = (accountId: string): string => createHash('sha256').update(accountId).digest('hex').slice(0, 16);

export async function purgeDueAccounts(store: RepositoryStore, opts: MaintenanceOptions = {}): Promise<number> {
  const sec = store.security;
  if (!sec) return 0;
  const now = opts.now ?? ((): string => new Date().toISOString());
  let purged = 0;
  // A page at a time; each pass removes the accounts it lists, so the loop ends when none is due.
  for (let pass = 0; pass < 1000; pass++) {
    const due = await sec.listAccountsDeletionDue(now(), 50);
    if (!due.length) break;
    let progressed = false;
    for (const listed of due) {
      // re-read: the learner may have cancelled between the listing and now
      const account = await store.getAccount(listed.accountId);
      if (!account || account.deletionDueAt === undefined || !(Date.parse(account.deletionDueAt) <= Date.parse(now()))) continue;
      const counts = await store.eraseLearner(account.learnerId);
      await sec.appendSecurityEvent({
        eventId: crypto.randomUUID(), kind: 'deletion-purged', at: now(), subjectRef: subjectRefOf(account.accountId),
        detail: `events=${counts.events} documents=${counts.documents} knowledge=${counts.knowledge}`,
      });
      purged++;
      progressed = true;
    }
    if (!progressed) break;
  }
  if (purged) opts.log?.(`maintenance: purged ${purged} account${purged === 1 ? '' : 's'} past their deletion grace`);
  return purged;
}

export async function runMaintenance(store: RepositoryStore, opts: MaintenanceOptions = {}): Promise<MaintenanceResult> {
  const sec = store.security;
  const now = opts.now ?? ((): string => new Date().toISOString());
  const result: MaintenanceResult = { purged: 0, sessionsPruned: 0, tokensPruned: 0, securityEventsPruned: 0 };
  if (!sec) return result;
  result.purged = await purgeDueAccounts(store, opts);
  const nowMs = Date.parse(now());
  const before = (days: number): string => new Date(nowMs - days * DAY_MS).toISOString();
  result.sessionsPruned = await sec.deleteSessionsEndedBefore(before(SESSION_RETENTION_DAYS));
  result.tokensPruned = await sec.deleteAccountTokensBefore(before(TOKEN_RETENTION_DAYS));
  result.securityEventsPruned = await sec.deleteSecurityEventsBefore(before(SECURITY_LOG_RETENTION_DAYS));
  return result;
}
