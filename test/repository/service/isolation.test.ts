// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { UnitKnowledge } from '../../../packages/repository-contract/src';
import { createHarness, lookupEvent, makeEvent, productionEvent, raw, signUp } from './fakes';
import type { Harness } from './fakes';

type Who = Awaited<ReturnType<typeof signUp>>;

const knowledgeRow = (learnerId: string, unitId: string): UnitKnowledge => ({
  learnerId, unitId, languageId: 'sq', dimensions: {} as UnitKnowledge['dimensions'], retention: { estimate: 0.5, halfLifeDays: 3, basedOn: 'none' }, uncertainty: 0.5, modelVersion: 'fake-1', basis: { events: 1 },
});

/** Two learners; A has events, knowledge, a document and an enrolment. */
async function twoLearners(h: Harness) {
  const a = await signUp(h, 'a@example.com', 'a-phone');
  const b = await signUp(h, 'b@example.com', 'b-phone');
  const evA = lookupEvent({ learnerId: a.learnerId, enrolmentId: a.enrolmentId }, { id: 'a-event-secret', producer: { app: 'golearn-ext', version: '1', deviceId: 'a-phone' } });
  expect((await a.api.appendEvents([evA])).ok).toBe(true);
  await h.store.putKnowledge([knowledgeRow(a.learnerId, 'form:sq:shtëpinë')]);
  expect((await a.api.putDocument('a-doc', { languageId: 'sq', kind: 'note', body: 'A PRIVATE NOTE', title: 'secret' }, 0)).ok).toBe(true);
  return { a, b };
}

describe('two learners, one server', () => {
  it("B's token cannot read A's events, knowledge, documents, export or candidates", async () => {
    const h = createHarness();
    const { a, b } = await twoLearners(h);
    for (const path of [
      `/events?learnerId=${a.learnerId}`, `/knowledge?learnerId=${a.learnerId}`, `/documents?learnerId=${a.learnerId}`, `/documents/a-doc?learnerId=${a.learnerId}`,
      `/export?learnerId=${a.learnerId}`, `/enrolments?learnerId=${a.learnerId}`, `/preferences?learnerId=${a.learnerId}`,
      `/candidates?learnerId=${a.learnerId}&enrolmentId=${a.enrolmentId}`,
    ]) {
      const r = await raw(h, 'GET', path, { token: b.token });
      expect(r.status, path).toBe(403);
      expect(r.body.error).toBe('not-your-data');
      expect(JSON.stringify(r.body)).not.toMatch(/a-event-secret|PRIVATE/);
    }
    expect(h.engine.candidateCalls).toEqual([]);
  });

  it("without naming A, B sees only B's own data", async () => {
    const h = createHarness();
    const { a, b } = await twoLearners(h);
    const events = await b.api.listEvents();
    expect(events.ok && events.data.events.map((e) => e.id)).toEqual([expect.any(String)]); // B's own EnrolmentChanged only
    expect(JSON.stringify(events)).not.toContain('a-event-secret');
    expect(events.ok && events.data.events.every((e) => e.learnerId === b.learnerId)).toBe(true);
    const k = await b.api.knowledge();
    expect(k.ok && k.data.knowledge).toEqual([]);
    const docs = await b.api.listDocuments();
    expect(docs.ok && docs.data.documents).toEqual([]);
    const peek = await b.api.getDocument('a-doc');
    expect(peek.ok).toBe(false);
    expect(peek.status).toBe(404);
    // A's enrolment id means nothing to B: 404, and the engine is never asked
    const c = await raw(h, 'GET', `/candidates?enrolmentId=${a.enrolmentId}`, { token: b.token });
    expect(c.status).toBe(404);
    expect(h.engine.candidateCalls).toEqual([]);
    // B's own enrolment works
    const own = await raw(h, 'GET', `/candidates?enrolmentId=${b.enrolmentId}`, { token: b.token });
    expect(own.status).toBe(200);
    expect(h.engine.candidateCalls).toEqual([{ learnerId: b.learnerId, enrolmentId: b.enrolmentId, limit: 20 }]);
    // B's export holds nothing of A's
    const ex = JSON.stringify((await b.api.exportAll()));
    expect(ex).not.toContain(a.learnerId);
    expect(ex).not.toContain('a-event-secret');
    expect(ex).not.toContain('PRIVATE');
    expect(a.learnerId).not.toBe(b.learnerId);
  });

  it("events carrying A's learnerId under B's token are 403 and nothing is stored, even beside B's own", async () => {
    const h = createHarness();
    const { a, b } = await twoLearners(h);
    const headA = await h.store.head(a.learnerId);
    const calls = h.store.appendCalls;
    const mine = makeEvent({ learnerId: b.learnerId, enrolmentId: b.enrolmentId });
    const theirs = makeEvent({ learnerId: a.learnerId, enrolmentId: a.enrolmentId });
    for (const path of ['/events', '/reviews']) {
      const r = await raw(h, 'POST', path, { token: b.token, body: { events: [mine, theirs] } });
      expect(r.status, path).toBe(403);
      expect(r.body.error).toBe('not-your-data');
    }
    expect(h.store.appendCalls).toBe(calls);
    expect(await h.store.head(a.learnerId)).toBe(headA);
    expect(await h.store.get(b.learnerId, mine.id)).toBeUndefined();
    // a body-level learnerId is checked as well
    expect((await raw(h, 'POST', '/events', { token: b.token, body: { learnerId: a.learnerId, events: [mine] } })).status).toBe(403);
    // writing and sync
    expect((await raw(h, 'POST', '/writing', { token: b.token, body: { observation: productionEvent({ learnerId: a.learnerId }) } })).status).toBe(403);
    const push = (events: unknown[], documents?: unknown[]) => raw(h, 'POST', '/sync/push', { token: b.token, body: { deviceId: 'b-phone', clientTime: h.clock.now(), events, documents } });
    expect((await push([theirs])).status).toBe(403);
    expect((await push([], [{ doc: { docId: 'x', learnerId: a.learnerId, languageId: 'sq', kind: 'note', body: 'x' }, expectedRevision: 0 }])).status).toBe(403);
    expect(h.store.appendCalls).toBe(calls);
  });

  it("B cannot write over, delete or overwrite A's document", async () => {
    const h = createHarness();
    const { a, b } = await twoLearners(h);
    // a PUT with A's learnerId inside the document is refused outright
    const forged = await raw(h, 'PUT', '/documents/a-doc', { token: b.token, body: { doc: { learnerId: a.learnerId, languageId: 'sq', kind: 'note', body: 'overwritten' }, expectedRevision: 1 } });
    expect(forged.status).toBe(403);
    // B's PUT to the same docId makes B's OWN document of that name (documents are keyed by learner)
    const own = await b.api.putDocument('a-doc', { languageId: 'sq', kind: 'note', body: 'B writes' }, 0);
    expect(own.ok).toBe(true);
    expect((await b.api.deleteDocument('a-doc')).ok).toBe(true);
    const aDoc = await a.api.getDocument('a-doc');
    expect(aDoc.ok && aDoc.data.document.body).toBe('A PRIVATE NOTE');
    expect(aDoc.ok && aDoc.data.document.deletedAt).toBeUndefined();
  });

  it("DELETE /me, tombstones, corrections and enrolments name only the session's learner", async () => {
    const h = createHarness();
    const { a, b } = await twoLearners(h);
    expect((await raw(h, 'DELETE', '/me', { token: b.token, body: { learnerId: a.learnerId, confirmEmail: 'b@example.com' } })).status).toBe(403);
    expect((await raw(h, 'POST', '/tombstones', { token: b.token, body: { learnerId: a.learnerId, scope: { kind: 'learner' } } })).status).toBe(403);
    expect((await raw(h, 'POST', '/enrolments', { token: b.token, body: { learnerId: a.learnerId, languageId: 'sq', packId: 'p', packVersion: '1' } })).status).toBe(403);
    expect(await h.store.listTombstones(a.learnerId)).toEqual([]);
    expect(await h.store.listEnrolments(a.learnerId)).toHaveLength(1);
    expect(await h.store.head(a.learnerId)).toBe(2); // enrolment + A's one event; nothing added by B
  });

  it("a sync push for another device is refused: the session's device is the only one", async () => {
    const h = createHarness();
    const { b } = await twoLearners(h);
    const body = { deviceId: 'a-phone', clientTime: h.clock.now(), events: [] };
    const r = await raw(h, 'POST', '/sync/push', { token: b.token, body });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('not-your-device');
    expect((await raw(h, 'POST', '/sync/pull', { token: b.token, body: { deviceId: 'a-phone', afterSeq: 0 } })).status).toBe(403);
  });
});

describe('teams grant nothing', () => {
  async function team(h: Harness): Promise<{ leader: Who; member: Who }> {
    const leader = await signUp(h, 'leader@example.com', 'l-phone');
    const member = await signUp(h, 'member@example.com', 'm-phone');
    await h.store.putTeam({ teamId: 'team-sq', name: 'Albania', createdAt: h.clock.now() });
    await h.store.putTeamMember('team-sq', leader.learnerId, 'leader', h.clock.now());
    await h.store.putTeamMember('team-sq', member.learnerId, 'member', h.clock.now());
    expect((await member.api.appendEvents([lookupEvent({ learnerId: member.learnerId, enrolmentId: member.enrolmentId, deviceId: member.deviceId }, { id: 'member-event' })])).ok).toBe(true);
    expect((await member.api.putDocument('m-doc', { languageId: 'sq', kind: 'testimony', body: 'MEMBER TESTIMONY' }, 0)).ok).toBe(true);
    return { leader, member };
  }

  it("a team leader's token gets 403 on every route that names a member, and finds nothing of the member's otherwise", async () => {
    const h = createHarness();
    const { leader, member } = await team(h);
    for (const path of [`/events?learnerId=${member.learnerId}`, `/knowledge?learnerId=${member.learnerId}`, `/documents?learnerId=${member.learnerId}`, `/export?learnerId=${member.learnerId}`, `/enrolments?learnerId=${member.learnerId}`]) {
      expect((await raw(h, 'GET', path, { token: leader.token })).status, path).toBe(403);
    }
    expect((await raw(h, 'POST', '/events', { token: leader.token, body: { events: [makeEvent({ learnerId: member.learnerId })] } })).status).toBe(403);
    const mine = JSON.stringify([(await leader.api.listEvents()), (await leader.api.exportAll()), (await leader.api.listDocuments())]);
    expect(mine).not.toMatch(/member-event|MEMBER TESTIMONY/);
    expect(mine).not.toContain(member.learnerId);
    expect((await leader.api.getDocument('m-doc')).ok).toBe(false);
  });

  it('enrolling into a team needs membership; a member may', async () => {
    const h = createHarness();
    const { leader } = await team(h);
    const outsider = await signUp(h, 'outsider@example.com', 'o-phone', { enrol: false });
    const input = { teamId: 'team-sq', languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [] };
    const no = await outsider.api.enrol(input);
    expect(no.ok).toBe(false);
    expect(!no.ok && no.status).toBe(403);
    expect(!no.ok && no.error).toBe('not-a-member');
    expect((await leader.api.enrol(input)).ok).toBe(true);
    expect(!(await leader.api.enrol({ ...input, teamId: 'nope' })).ok).toBe(true);
  });
});
