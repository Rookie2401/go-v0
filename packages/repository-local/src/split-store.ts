/**
 * A `ConcreteStore` made of two: a durable one (IndexedDB) for what the device keeps, and a volatile one (memory) for the rows this
 * package recreates at every open and has never written: learner, account, device, session (with its token hash), teams and members,
 * account tokens and the security log, and service state. This is exactly the split `persistingStore` makes today (it persists events,
 * units, relations, analyses, aliases, packs, enrolments, preferences, documents and tombstones, and nothing else).
 *
 * Methods that span both:
 *  - `eraseLearner`: runs on both and adds the counts (the durable one holds events, knowledge, preferences, documents, enrolments,
 *    tombstones; the volatile one holds sessions, devices, team memberships, accounts, the learner).
 *  - `applyTombstone`: the shared deletion routine run over THIS router, so the tombstone, the events and the projection go to the
 *    durable store and a learner-wide erasure goes through `eraseLearner` above.
 *  - `transaction`: nested, durable outside; neither store rolls back (both just run `fn`).
 *  - `close`: closes both.
 *  - `security`: the volatile store's whole security port (tokens, session list, security log, deletion-due accounts are identity rows).
 *  - `stats`, `compact`: not offered (the durable store has neither).
 */
import type { ConcreteStore, EraseCounts } from '../../repository-store/src/rules';
import { applyTombstone as applyDeletion } from '../../repository-store/src/deletion';

export function splitStore(durable: ConcreteStore, volatile: ConcreteStore): ConcreteStore {
  const router: ConcreteStore = {
    ...durable,

    // identity: volatile
    getLearner: (id) => volatile.getLearner(id),
    putLearner: (l) => volatile.putLearner(l),
    getAccountByEmail: (e) => volatile.getAccountByEmail(e),
    getAccount: (id) => volatile.getAccount(id),
    putAccount: (a) => volatile.putAccount(a),
    getSessionByTokenHash: (h) => volatile.getSessionByTokenHash(h),
    putSession: (s) => volatile.putSession(s),
    revokeSession: (id, at) => volatile.revokeSession(id, at),
    getDevice: (l, d) => volatile.getDevice(l, d),
    putDevice: (d) => volatile.putDevice(d),
    getTeam: (id) => volatile.getTeam(id),
    putTeam: (t) => volatile.putTeam(t),
    listTeamMembers: (id) => volatile.listTeamMembers(id),
    putTeamMember: (t, l, r, s) => volatile.putTeamMember(t, l, r, s),
    ...(volatile.getServiceState ? { getServiceState: (k: string) => volatile.getServiceState!(k) } : {}),
    ...(volatile.setServiceState ? { setServiceState: (k: string, v: string) => volatile.setServiceState!(k, v) } : {}),

    // spanning
    async eraseLearner(learnerId): Promise<EraseCounts> {
      const a = await durable.eraseLearner(learnerId);
      const b = await volatile.eraseLearner(learnerId);
      const out = { ...a } as Record<string, number>;
      for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + (v as number);
      return out as unknown as EraseCounts;
    },
    async applyTombstone(t) {
      return applyDeletion(router, t);
    },
    async transaction(fn) {
      return durable.transaction(() => volatile.transaction(fn));
    },
    async close() {
      await durable.close();
      await volatile.close();
    },
  };
  delete (router as { stats?: unknown }).stats;
  delete (router as { compact?: unknown }).compact;
  router.security = volatile.security;
  return router;
}
