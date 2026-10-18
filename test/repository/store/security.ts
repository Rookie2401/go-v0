/**
 * The account-security part of the store (tokens, the session list, the security log, verification and deletion fields), run against every
 * implementation: memory, SQLite and Postgres.
 */
import { describe, expect, it } from 'vitest';
import type { RepositoryStore, SecurityEvent } from '../../../packages/repository-contract/src';
import { L1, L2, account, ev, session } from './fixtures';

export function securityConformance(name: string, open: () => Promise<RepositoryStore>): void {
  const withStore = (fn: (s: RepositoryStore, sec: NonNullable<RepositoryStore['security']>) => Promise<void>) => async () => {
    const s = await open();
    try {
      expect(s.security, 'the store offers the security port').toBeDefined();
      await fn(s, s.security!);
    } finally { await s.close(); }
  };
  const T0 = '2026-10-01T00:00:00.000Z';
  const T1 = '2026-10-01T01:00:00.000Z';
  const T2 = '2026-10-01T02:00:00.000Z';
  const token = (hash: string, accountId = 'acc-1', purpose: 'verify-email' | 'reset-password' = 'verify-email', expiresAt = T1) => ({ tokenHash: hash, accountId, purpose, createdAt: T0, expiresAt });
  const se = (eventId: string, at: string, learnerId: string | undefined, o: Partial<SecurityEvent> = {}): SecurityEvent => ({ eventId, at, kind: 'sign-in', ...(learnerId ? { learnerId } : {}), ...o });

  describe(`${name}: accounts hardening fields`, () => {
    it('round-trips verification and deletion state and lists accounts whose deletion is due', withStore(async (s, sec) => {
      await s.putLearner({ learnerId: L1, createdAt: T0 });
      await s.putAccount({ ...account('a1', L1, 'ana@example.com'), verifiedAt: T0 });
      expect((await s.getAccountByEmail('ANA@example.com'))?.verifiedAt).toBe(T0);
      expect((await s.getAccount('a1'))?.verifiedAt).toBe(T0);
      expect((await s.getAccount('a1'))?.deletionDueAt).toBeUndefined();
      expect(await sec.listAccountsDeletionDue(T2)).toEqual([]);
      const current = (await s.getAccountByEmail('ana@example.com'))!;
      await s.putAccount({ ...current, deletionRequestedAt: T0, deletionDueAt: T1 });
      expect(await sec.listAccountsDeletionDue(T0)).toEqual([]);
      const due = await sec.listAccountsDeletionDue(T2);
      expect(due.map((a) => a.accountId)).toEqual(['a1']);
      expect(due[0]).toMatchObject({ deletionRequestedAt: T0, deletionDueAt: T1, verifiedAt: T0 });
      expect(JSON.stringify(due)).not.toContain('passwordHash');
      // clearing is writing the account without the fields
      const { deletionRequestedAt: _a, deletionDueAt: _b, ...cleared } = current;
      await s.putAccount(cleared);
      expect(await sec.listAccountsDeletionDue(T2)).toEqual([]);
      expect((await s.getAccount('a1'))?.deletionRequestedAt).toBeUndefined();
    }));
  });

  describe(`${name}: one-time account tokens`, () => {
    it('consumes a token once, only for its purpose and only before it expires', withStore(async (_s, sec) => {
      await sec.putAccountToken(token('h-verify'));
      expect(await sec.consumeAccountToken('h-verify', 'reset-password', T0)).toBeUndefined(); // wrong purpose changes nothing
      expect(await sec.consumeAccountToken('h-verify', 'verify-email', T2)).toBeUndefined(); // expired at T1
      const got = await sec.consumeAccountToken('h-verify', 'verify-email', T0);
      expect(got).toMatchObject({ tokenHash: 'h-verify', accountId: 'acc-1', purpose: 'verify-email', usedAt: T0 });
      expect(await sec.consumeAccountToken('h-verify', 'verify-email', T0)).toBeUndefined(); // single use
      expect(await sec.consumeAccountToken('nope', 'verify-email', T0)).toBeUndefined();
    }));

    it('two concurrent consumers: exactly one wins', withStore(async (_s, sec) => {
      await sec.putAccountToken(token('h-race'));
      const results = await Promise.all(Array.from({ length: 6 }, () => sec.consumeAccountToken('h-race', 'verify-email', T0)));
      expect(results.filter((r) => r !== undefined)).toHaveLength(1);
    }));

    it('a newer token replaces the unused ones; used ones and other purposes stay until pruned', withStore(async (_s, sec) => {
      await sec.putAccountToken(token('old-1'));
      await sec.putAccountToken(token('old-2'));
      await sec.putAccountToken(token('reset-1', 'acc-1', 'reset-password'));
      await sec.putAccountToken(token('other-account', 'acc-2'));
      await sec.consumeAccountToken('old-2', 'verify-email', T0);
      await sec.clearAccountTokens('acc-1', 'verify-email');
      expect(await sec.consumeAccountToken('old-1', 'verify-email', T0)).toBeUndefined(); // cleared
      expect(await sec.consumeAccountToken('reset-1', 'reset-password', T0)).toBeDefined(); // other purpose untouched
      expect(await sec.consumeAccountToken('other-account', 'verify-email', T0)).toBeDefined(); // other account untouched
      // pruning: expired (T1) before T2 and used before T2 go
      await sec.putAccountToken(token('live', 'acc-3', 'verify-email', '2027-01-01T00:00:00.000Z'));
      expect(await sec.deleteAccountTokensBefore(T2)).toBeGreaterThanOrEqual(2);
      expect(await sec.consumeAccountToken('live', 'verify-email', T0)).toBeDefined();
    }));
  });

  describe(`${name}: sessions`, () => {
    it('lists a learner\'s sessions newest first without token hashes, stamps last seen, revokes all but one', withStore(async (s, sec) => {
      await s.putSession({ ...session('s1', L1, 'th1'), createdAt: '2026-10-01T00:00:00.000Z' });
      await s.putSession({ ...session('s2', L1, 'th2'), createdAt: '2026-10-02T00:00:00.000Z', deviceId: 'phone' });
      await s.putSession({ ...session('s3', L1, 'th3'), createdAt: '2026-10-03T00:00:00.000Z' });
      await s.putSession({ ...session('x1', L2, 'th4') });
      await sec.touchSession('s2', T1);
      let list = await sec.listSessions(L1);
      expect(list.map((x) => x.sessionId)).toEqual(['s3', 's2', 's1']);
      expect(list.find((x) => x.sessionId === 's2')).toMatchObject({ lastSeenAt: T1, deviceId: 'phone' });
      expect(JSON.stringify(list)).not.toMatch(/th[0-9]|tokenHash/);
      expect(await sec.revokeSessions(L1, T2, 's3')).toBe(2);
      list = await sec.listSessions(L1);
      expect(list.map((x) => [x.sessionId, x.revokedAt])).toEqual([['s3', undefined], ['s2', T2], ['s1', T2]]);
      expect((await s.getSessionByTokenHash('th3'))?.revokedAt).toBeUndefined();
      expect((await s.getSessionByTokenHash('th4'))?.revokedAt).toBeUndefined(); // another learner's session untouched
      expect(await sec.revokeSessions(L1, T2)).toBe(1); // only the live one is revoked again
      await sec.touchSession('s1', T2); // a revoked session is not "seen"
      expect((await sec.listSessions(L1)).find((x) => x.sessionId === 's1')?.lastSeenAt).toBeUndefined();
    }));

    it('deletes sessions that ended before a cutoff (revoked or expired) and keeps live ones', withStore(async (s, sec) => {
      await s.putSession({ ...session('old-expired', L1, 'e1'), expiresAt: '2026-09-01T00:00:00.000Z' });
      await s.putSession({ ...session('old-revoked', L1, 'e2'), expiresAt: '2027-01-01T00:00:00.000Z' });
      await s.revokeSession('old-revoked', '2026-09-02T00:00:00.000Z');
      await s.putSession({ ...session('live', L1, 'e3'), expiresAt: '2027-01-01T00:00:00.000Z' });
      await s.putSession({ ...session('recently-revoked', L1, 'e4'), expiresAt: '2027-01-01T00:00:00.000Z' });
      await s.revokeSession('recently-revoked', '2026-10-05T00:00:00.000Z');
      expect(await sec.deleteSessionsEndedBefore('2026-10-01T00:00:00.000Z')).toBe(2);
      expect((await sec.listSessions(L1)).map((x) => x.sessionId).sort()).toEqual(['live', 'recently-revoked']);
    }));
  });

  describe(`${name}: the security log`, () => {
    it('keeps a learner\'s events apart, newest first, with a limit', withStore(async (_s, sec) => {
      await sec.appendSecurityEvent(se('e1', T0, L1, { kind: 'account-created' }));
      await sec.appendSecurityEvent(se('e2', T1, L1, { kind: 'sign-in', deviceId: 'phone' }));
      await sec.appendSecurityEvent(se('e3', T2, L1, { kind: 'export-requested', detail: 'x' }));
      await sec.appendSecurityEvent(se('o1', T1, L2));
      await sec.appendSecurityEvent(se('e2', T2, L1)); // same id again: ignored
      expect((await sec.listSecurityEvents(L1)).map((e) => e.eventId)).toEqual(['e3', 'e2', 'e1']);
      expect((await sec.listSecurityEvents(L1, 2)).map((e) => e.eventId)).toEqual(['e3', 'e2']);
      expect(await sec.listSecurityEvents(L1, 1)).toEqual([{ eventId: 'e3', learnerId: L1, kind: 'export-requested', at: T2, detail: 'x' }]);
      expect((await sec.listSecurityEvents(L2)).map((e) => e.eventId)).toEqual(['o1']);
      expect(await sec.deleteSecurityEventsBefore(T1)).toBe(1); // e1
      expect((await sec.listSecurityEvents(L1)).map((e) => e.eventId)).toEqual(['e3', 'e2']);
    }));

    it('eraseLearner removes the learner\'s tokens and log lines and keeps lines that name no learner', withStore(async (s, sec) => {
      await s.putLearner({ learnerId: L1, createdAt: T0 });
      await s.putAccount(account('a1', L1, 'ana@example.com'));
      await s.putSession(session('s1', L1, 'th1'));
      await s.append(L1, [ev('x1')]);
      await sec.putAccountToken(token('t1', 'a1'));
      await sec.appendSecurityEvent(se('e1', T0, L1));
      await sec.appendSecurityEvent(se('audit', T1, undefined, { kind: 'deletion-purged', subjectRef: 'abcd1234', detail: 'events=1' }));
      await s.eraseLearner(L1);
      expect(await sec.consumeAccountToken('t1', 'verify-email', T0)).toBeUndefined();
      expect(await sec.listSecurityEvents(L1)).toEqual([]);
      expect(await s.getAccount('a1')).toBeUndefined();
      expect(await s.getSessionByTokenHash('th1')).toBeUndefined();
      // the audit line has no learner, so it can only be found by sweeping: prune everything before T2 and it is the one row that goes
      expect(await sec.deleteSecurityEventsBefore(T2)).toBe(1);
    }));
  });
}
