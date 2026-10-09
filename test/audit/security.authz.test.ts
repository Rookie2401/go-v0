// @vitest-environment node
/**
 * Security audit (2) authorization and cross-user access, (8) private documents. Two learners (and a team with a leader and
 * a member) on one service; the attacker's token is used with the victim's ids in the path, the query and the body of every
 * learner-scoped route. After each attack the victim's whole export must be byte-identical, and the attacker's reply must
 * not contain a single value that belongs to the victim.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { PASSWORD, createStack, dumpStore, lookup, production, raw, review, signUp, type Learner, type Stack, type StoreKind } from './security.support';

const stacks: Stack[] = [];
const make = (kind: StoreKind): Stack => { const s = createStack(kind); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

const VICTIM_BODY = 'VICTIM-PRIVATE-BODY-48151623';
const VICTIM_TITLE = 'VICTIM-SECRET-TITLE';
const VICTIM_SURFACE = 'victimword';

interface World { s: Stack; a: Learner; b: Learner; aEventId: string; aDoc: string }

/** A has an event, knowledge, a document and a tombstone; B is a plain second learner. */
async function world(kind: StoreKind): Promise<World> {
  const s = make(kind);
  const a = await signUp(s, 'victim@example.com', 'a-phone');
  const b = await signUp(s, 'attacker@example.com', 'b-phone');
  const ev = lookup(a, { payload: { surface: VICTIM_SURFACE, tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] }, subject: { itemIds: ['form:sq:victimword'], sentenceKey: 'ab12', sourceRef: { kind: 'web', title: 'victim page', locator: '/private' } } });
  expect((await a.api.appendEvents([ev])).ok).toBe(true);
  expect((await a.api.putDocument('a-doc', { languageId: 'sq', kind: 'note', body: VICTIM_BODY, title: VICTIM_TITLE }, 0)).ok).toBe(true);
  expect((await a.api.putTombstone({ kind: 'source', sourceRef: { kind: 'web', title: 'nothing' } })).ok).toBe(true);
  return { s, a, b, aEventId: ev.id, aDoc: 'a-doc' };
}

/** The victim's complete state as the victim would export it (time stamp removed). */
async function fingerprint(w: World): Promise<string> {
  const r = await raw(w.s, 'GET', '/export', { token: w.a.token });
  expect(r.status).toBe(200);
  const { exportedAt: _t, ...rest } = r.body;
  return JSON.stringify(rest);
}

const VALUES = [VICTIM_BODY, VICTIM_TITLE, VICTIM_SURFACE, 'victim@example.com', 'a-phone', '/private'];
const noVictim = (w: World, text: string): void => {
  for (const v of [...VALUES, w.a.learnerId, w.a.accountId, w.a.enrolmentId, w.a.token, w.aEventId]) expect(text, v).not.toContain(v);
};

describe.each(['memory', 'sqlite'] as const)('cross-learner access (%s store)', (kind) => {
  it('every learner-scoped route refuses the victim\'s learnerId (query) with 403 not-your-data, and reads nothing', async () => {
    const w = await world(kind);
    const before = await fingerprint(w);
    const q = `learnerId=${w.a.learnerId}`;
    const gets = ['/enrolments', '/events', '/knowledge', '/preferences', '/documents', `/documents/${w.aDoc}`, '/export', `/candidates?enrolmentId=${w.a.enrolmentId}&x=1`];
    for (const path of gets) {
      const url = path.includes('?') ? `${path}&${q}` : `${path}?${q}`;
      const r = await raw(w.s, 'GET', url, { token: w.b.token });
      expect(r.status, url).toBe(403);
      expect(r.body.error).toBe('not-your-data');
      noVictim(w, r.text);
    }
    const del = await raw(w.s, 'DELETE', `/documents/${w.aDoc}?${q}`, { token: w.b.token });
    expect(del.status).toBe(403);
    expect(await fingerprint(w)).toBe(before);
  });

  it('every learner-scoped write refuses the victim\'s learnerId in the body (and in nested events and documents) and writes nothing', async () => {
    const w = await world(kind);
    const before = await fingerprint(w);
    const bBefore = JSON.stringify((await raw(w.s, 'GET', '/events', { token: w.b.token })).body.events);
    const L = w.a.learnerId;
    const doc = { docId: 'x', learnerId: L, languageId: 'sq', kind: 'note', body: 'planted', revision: 0, deviceId: 'b-phone', updatedAt: w.s.clock.now() };
    const attacks: Array<[string, string, unknown]> = [
      ['POST', '/events', { learnerId: L, events: [lookup(w.b)] }],
      ['POST', '/events', { events: [lookup(w.b), lookup({ ...w.b, learnerId: L })] }], // second event of the batch names the victim
      ['POST', '/events', { events: [lookup({ ...w.a, deviceId: 'b-phone' })] }], // the victim's identity in the event
      ['POST', '/reviews', { events: [review({ ...w.a, deviceId: 'b-phone' })] }],
      ['POST', '/reviews', { learnerId: L, events: [review(w.b)] }],
      ['POST', '/enrolments', { learnerId: L, languageId: 'sq', packId: 'pack:sq', packVersion: '1' }],
      ['POST', '/lookup', { learnerId: L, languageId: 'sq', surface: 'shtëpinë' }],
      ['POST', '/corrections', { learnerId: L, formId: 'form:sq:shtëpinë', lexemeId: 'lemma:sq:shtëpi:NOUN' }],
      ['POST', '/tombstones', { learnerId: L, scope: { kind: 'learner' } }],
      ['POST', '/writing', { learnerId: L, observation: production(w.b) }],
      ['POST', '/writing', { observation: production({ ...w.a, deviceId: 'b-phone' }) }],
      ['POST', '/writing', { observation: production(w.b), document: { doc, expectedRevision: 0 } }],
      ['PUT', `/documents/${w.aDoc}`, { learnerId: L, doc: { languageId: 'sq', kind: 'note', body: 'overwritten' }, expectedRevision: 1 }],
      ['PUT', `/documents/${w.aDoc}`, { doc: { learnerId: L, languageId: 'sq', kind: 'note', body: 'overwritten' }, expectedRevision: 1 }],
      ['POST', '/sync/push', { learnerId: L, deviceId: 'b-phone', clientTime: w.s.clock.now(), events: [lookup(w.b)] }],
      ['POST', '/sync/push', { deviceId: 'b-phone', clientTime: w.s.clock.now(), events: [], documents: [{ doc, expectedRevision: 0 }] }],
      ['POST', '/sync/pull', { learnerId: L, deviceId: 'b-phone', afterSeq: 0 }],
      ['DELETE', '/me', { learnerId: L, confirmEmail: 'victim@example.com' }],
    ];
    for (const [m, p, body] of attacks) {
      const r = await raw(w.s, m, p, { token: w.b.token, body });
      expect(r.status, `${m} ${p} ${JSON.stringify(body).slice(0, 90)}`).toBe(403);
      expect(r.body.error).toBe('not-your-data');
      noVictim(w, r.text);
    }
    expect(await fingerprint(w)).toBe(before);
    expect(JSON.stringify((await raw(w.s, 'GET', '/events', { token: w.b.token })).body.events)).toBe(bBefore); // nothing leaked into B's own log either
  });

  it('naming nothing, B sees only B: A\'s ids (document, enrolment, event, unit) answer exactly like ids that do not exist', async () => {
    const w = await world(kind);
    const before = await fingerprint(w);
    const same = async (real: [string, string, unknown?], fake: [string, string, unknown?]): Promise<void> => {
      const r1 = await raw(w.s, real[0], real[1], { token: w.b.token, ...(real[2] ? { body: real[2] } : {}) });
      const r2 = await raw(w.s, fake[0], fake[1], { token: w.b.token, ...(fake[2] ? { body: fake[2] } : {}) });
      expect(r1.status, real[1]).toBe(r2.status);
      expect(r1.text, real[1]).toBe(r2.text);
      noVictim(w, r1.text);
    };
    await same(['GET', `/documents/${w.aDoc}`], ['GET', '/documents/never-existed']);
    await same(['DELETE', `/documents/${w.aDoc}`], ['DELETE', '/documents/never-existed']);
    await same(['GET', `/candidates?enrolmentId=${w.a.enrolmentId}`], ['GET', '/candidates?enrolmentId=no-such-enrolment']);
    await same(['POST', '/corrections', { formId: 'form:sq:x', lexemeId: 'lemma:sq:x:NOUN', enrolmentId: w.a.enrolmentId }], ['POST', '/corrections', { formId: 'form:sq:x', lexemeId: 'lemma:sq:x:NOUN', enrolmentId: 'no-such' }]);
    // B's lists contain none of A's
    for (const path of ['/events', '/knowledge', '/documents', '/enrolments', '/me', '/export']) noVictim(w, (await raw(w.s, 'GET', path, { token: w.b.token })).text);
    // A's event id as a filter value finds nothing of A's
    const byUnit = await raw(w.s, 'GET', `/events?unitId=${encodeURIComponent('form:sq:victimword')}`, { token: w.b.token });
    expect(byUnit.body.events).toEqual([]);
    expect(await fingerprint(w)).toBe(before);
  });

  it("B's PUT or DELETE on A's document id makes B's OWN document and never touches A's; a revision conflict returns only B's own document", async () => {
    const w = await world(kind);
    const before = await fingerprint(w);
    const own = await raw(w.s, 'PUT', `/documents/${w.aDoc}`, { token: w.b.token, body: { doc: { languageId: 'sq', kind: 'note', body: 'B-BODY' }, expectedRevision: 0 } });
    expect(own.status).toBe(200);
    expect(own.body.document.learnerId).toBe(w.b.learnerId);
    const clash = await raw(w.s, 'PUT', `/documents/${w.aDoc}`, { token: w.b.token, body: { doc: { languageId: 'sq', kind: 'note', body: 'mine now' }, expectedRevision: 7 } });
    expect(clash.status).toBe(409);
    noVictim(w, clash.text);
    expect(clash.body.current.body).toBe('B-BODY');
    expect((await raw(w.s, 'DELETE', `/documents/${w.aDoc}`, { token: w.b.token })).status).toBe(204);
    expect(await fingerprint(w)).toBe(before);
    const stillThere = await raw(w.s, 'GET', `/documents/${w.aDoc}`, { token: w.a.token });
    expect(stillThere.body.document.body).toBe(VICTIM_BODY);
  });

  it('FIXED S-09: PUT /documents/:id with expectedRevision > 0 for a document that does not exist is a client error (409/422), not a 500', async () => {
    const w = await world(kind);
    // B guessing the victim's revision number (1) for an id B does not have: the store throws, the service answers 500
    const r = await raw(w.s, 'PUT', `/documents/${w.aDoc}`, { token: w.b.token, body: { doc: { languageId: 'sq', kind: 'note', body: 'x' }, expectedRevision: 1 } });
    expect([409, 422]).toContain(r.status);
    expect((await raw(w.s, 'GET', `/documents/${w.aDoc}`, { token: w.b.token })).status).toBe(404); // and nothing was created
  });

  it('FIXED S-10: one sync push document with an impossible revision must not poison the whole push (the events in it should still be stored, or the request refused with a 4xx)', async () => {
    const w = await world(kind);
    const ev = lookup(w.b);
    const r = await raw(w.s, 'POST', '/sync/push', { token: w.b.token, body: { deviceId: 'b-phone', clientTime: w.s.clock.now(), events: [ev], documents: [{ doc: { docId: 'ghost', languageId: 'sq', kind: 'note', body: 'x' }, expectedRevision: 5 }, { doc: { docId: 'fine', languageId: 'sq', kind: 'note', body: 'y' }, expectedRevision: 0 }] } });
    expect(r.status).toBe(200); // a retrying sync client would otherwise repeat this request forever
    expect(r.body.outcomes).toEqual([{ id: ev.id, stored: true }]); // the events in the request are stored
    expect(r.body.documents).toEqual([{ docId: 'ghost', ok: false, reason: 'no-such-document' }, { docId: 'fine', ok: true }]); // the one impossible document is that document's failure; the other one is saved
    expect((await raw(w.s, 'GET', '/events', { token: w.b.token })).body.events.map((e: { id: string }) => e.id)).toContain(ev.id);
  });

  it('B\'s tombstones (event id, source, range, learner) erase only B\'s data, never A\'s events', async () => {
    const w = await world(kind);
    await w.b.api.appendEvents([lookup(w.b, { subject: { itemIds: ['form:sq:bword'], sourceRef: { kind: 'web', title: 'victim page', locator: '/private' } } })]);
    const before = await fingerprint(w);
    for (const scope of [
      { kind: 'event', id: w.aEventId }, { kind: 'source', sourceRef: { kind: 'web', title: 'victim page', locator: '/private' } },
      { kind: 'source', sourceRef: { kind: 'web' } }, { kind: 'range', from: '2000-01-01T00:00:00Z', to: '2999-01-01T00:00:00Z' }, { kind: 'learner' },
    ]) {
      const r = await raw(w.s, 'POST', '/tombstones', { token: w.b.token, body: { scope } });
      expect(r.status, JSON.stringify(scope)).toBe(201);
      expect(r.body.tombstone.learnerId).toBe(w.b.learnerId);
    }
    expect(await fingerprint(w)).toBe(before);
    const mine = (await raw(w.s, 'GET', '/events', { token: w.a.token })).body.events as Array<{ id: string }>;
    expect(mine.map((e) => e.id)).toContain(w.aEventId);
  });

  it('sync: a session cannot push or pull under another device\'s name, and a pull returns only the caller\'s events and documents', async () => {
    const w = await world(kind);
    const before = await fingerprint(w);
    const push = await raw(w.s, 'POST', '/sync/push', { token: w.b.token, body: { deviceId: 'a-phone', clientTime: w.s.clock.now(), events: [lookup(w.b)] } });
    expect(push.status).toBe(403);
    expect(push.body.error).toBe('not-your-device');
    const pull = await raw(w.s, 'POST', '/sync/pull', { token: w.b.token, body: { deviceId: 'a-phone', afterSeq: 0 } });
    expect(pull.status).toBe(403);
    // the right device: only B's own
    const mine = await raw(w.s, 'POST', '/sync/pull', { token: w.b.token, body: { deviceId: 'b-phone', afterSeq: 0, documentsSince: '2000-01-01T00:00:00Z' } });
    expect(mine.status).toBe(200);
    noVictim(w, mine.text);
    for (const e of mine.body.events) expect(e.learnerId).toBe(w.b.learnerId);
    expect(mine.body.documents).toEqual([]);
    // an afterSeq far in the past or the future does not widen the scope
    for (const afterSeq of [0, 1, 2, 999_999]) noVictim(w, (await raw(w.s, 'POST', '/sync/pull', { token: w.b.token, body: { deviceId: 'b-phone', afterSeq } })).text);
    expect(await fingerprint(w)).toBe(before);
  });

  it('the victim\'s data is not reachable through the attacker\'s own export, preferences, candidates or lookups either', async () => {
    const w = await world(kind);
    for (const path of ['/export', '/preferences', `/candidates?enrolmentId=${w.b.enrolmentId}`, '/knowledge?unitIds=form:sq:victimword,lemma:sq:victimword:NOUN']) noVictim(w, (await raw(w.s, 'GET', path, { token: w.b.token })).text);
    const l = await raw(w.s, 'POST', '/lookup', { token: w.b.token, body: { languageId: 'sq', surface: 'shtëpinë', sentence: 'Unë po lexoj një libër.' } });
    expect(l.status).toBe(200);
    noVictim(w, l.text);
  });

  it('FINDING (low): enrolling in a team reveals whether a team id exists (404 for none, 403 for a team the caller is not in)', async () => {
    const w = await world(kind);
    await w.s.store.putTeam({ teamId: 'team-real', name: 'Real team', createdAt: w.s.clock.now() });
    const real = await raw(w.s, 'POST', '/enrolments', { token: w.b.token, body: { languageId: 'sq', packId: 'pack:sq', packVersion: '1', teamId: 'team-real' } });
    const fake = await raw(w.s, 'POST', '/enrolments', { token: w.b.token, body: { languageId: 'sq', packId: 'pack:sq', packVersion: '1', teamId: 'team-fake' } });
    expect([real.status, fake.status]).toEqual([403, 404]);
    expect(real.text).not.toContain('Real team');
  });
});

describe.each(['memory', 'sqlite'] as const)('team leader and member (%s store)', (kind) => {
  it('team membership, even leadership, grants no access to a member\'s data on any route', async () => {
    const s = make(kind);
    const leader = await signUp(s, 'leader@example.com', 'l-dev');
    const member = await signUp(s, 'member@example.com', 'm-dev');
    const at = s.clock.now();
    await s.store.putTeam({ teamId: 'team-1', name: 'Class', createdAt: at });
    await s.store.putTeamMember('team-1', leader.learnerId, 'leader', at);
    await s.store.putTeamMember('team-1', member.learnerId, 'member', at);
    // the member enrols through the team, writes events and a private document
    const enrol = await member.api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }], teamId: 'team-1' });
    expect(enrol.ok).toBe(true);
    const ev = lookup(member, { payload: { surface: 'memberword', tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'r', helpShown: [] }, subject: { itemIds: ['form:sq:memberword'] } });
    await member.api.appendEvents([ev]);
    await member.api.putDocument('m-doc', { languageId: 'sq', kind: 'testimony', body: 'MEMBER-TESTIMONY-TEXT' }, 0);
    const memberExport = JSON.stringify((await member.api.exportAll()).ok);
    expect(memberExport).toBe('true');

    const seen: string[] = [];
    const q = `learnerId=${member.learnerId}`;
    for (const path of ['/events', '/knowledge', '/documents', '/documents/m-doc', '/export', '/enrolments', '/preferences', `/candidates?enrolmentId=${member.enrolmentId}`]) {
      const url = `${path}${path.includes('?') ? '&' : '?'}${q}`;
      const r = await raw(s, 'GET', url, { token: leader.token });
      expect(r.status, url).toBe(403);
      seen.push(r.text);
    }
    // naming nothing: the leader's own views carry nothing of the member's
    for (const path of ['/me', '/events', '/documents', '/export', '/enrolments', '/knowledge']) seen.push((await raw(s, 'GET', path, { token: leader.token })).text);
    for (const body of [{ learnerId: member.learnerId, scope: { kind: 'learner' } }, { learnerId: member.learnerId, events: [lookup(member)] }]) {
      expect([(await raw(s, 'POST', '/tombstones', { token: leader.token, body })).status, (await raw(s, 'POST', '/events', { token: leader.token, body })).status].every((c) => c === 403 || c === 422)).toBe(true);
    }
    const all = seen.join('\n');
    for (const v of ['memberword', 'MEMBER-TESTIMONY-TEXT', member.learnerId, member.email, member.enrolmentId, 'm-dev', member.token]) expect(all, v).not.toContain(v);
    // and the member's data is untouched
    expect((await raw(s, 'GET', '/documents/m-doc', { token: member.token })).body.document.body).toBe('MEMBER-TESTIMONY-TEXT');
  });

  it('a learner cannot enrol into a team they are not a member of (member or leader of ANOTHER team does not count)', async () => {
    const s = make(kind);
    const outsider = await signUp(s, 'outsider@example.com');
    const insider = await signUp(s, 'insider@example.com');
    const at = s.clock.now();
    await s.store.putTeam({ teamId: 'team-1', name: 'Class', createdAt: at });
    await s.store.putTeam({ teamId: 'team-2', name: 'Other', createdAt: at });
    await s.store.putTeamMember('team-1', insider.learnerId, 'leader', at);
    await s.store.putTeamMember('team-2', outsider.learnerId, 'member', at);
    const body = { languageId: 'sq', packId: 'pack:sq', packVersion: '1', teamId: 'team-1' };
    expect((await raw(s, 'POST', '/enrolments', { token: outsider.token, body })).status).toBe(403);
    expect((await raw(s, 'POST', '/enrolments', { token: insider.token, body })).status).toBe(201);
  });
});

describe.each(['memory', 'sqlite'] as const)('private documents (%s store)', (kind) => {
  it('GET /documents lists metadata only: no body key, no body text, anywhere in the reply', async () => {
    const w = await world(kind);
    const r = await raw(w.s, 'GET', '/documents', { token: w.a.token });
    expect(r.status).toBe(200);
    expect(r.body.documents).toHaveLength(1);
    expect(Object.keys(r.body.documents[0])).not.toContain('body');
    expect(r.text).not.toContain(VICTIM_BODY);
    // and the single read does return it, to the owner only
    expect((await raw(w.s, 'GET', `/documents/${w.aDoc}`, { token: w.a.token })).body.document.body).toBe(VICTIM_BODY);
  });

  it('a document body never appears in an event, a response about events, the projection or a log line', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com');
    const BODY = 'NEVER-IN-AN-EVENT-body-72619';
    const obs = lookup(a, { kind: 'ProductionRecorded', producer: { app: 'gopractice-tell', version: '1', deviceId: a.deviceId }, subject: { itemIds: ['lemma:sq:libër:NOUN'], draftId: 'd1' }, payload: { mode: 'free', assisted: false, assistance: [], usedCorrectly: 'unjudged', draftId: 'd1', wordCount: 4 } });
    const w = await raw(s, 'POST', '/writing', { token: a.token, body: { observation: obs, document: { doc: { docId: 'd1', languageId: 'sq', kind: 'draft', body: BODY, title: 'T' }, expectedRevision: 0 } } });
    expect(w.status).toBe(200);
    expect(w.text).not.toContain(BODY);
    for (const path of ['/events', '/knowledge', '/preferences', '/documents', '/me', `/candidates?enrolmentId=${a.enrolmentId}`]) expect((await raw(s, 'GET', path, { token: a.token })).text, path).not.toContain(BODY);
    const exported = (await raw(s, 'GET', '/export', { token: a.token })).body;
    expect(JSON.stringify(exported.events)).not.toContain(BODY);
    expect(JSON.stringify(exported.knowledge)).not.toContain(BODY);
    expect(JSON.stringify(exported.documents)).toContain(BODY); // only in the documents section, as the learner's own
    for (const line of s.logs) expect(line).not.toContain(BODY);
    // and a sync push with the same document: still not in events
    const push = await raw(s, 'POST', '/sync/push', { token: a.token, body: { deviceId: a.deviceId, clientTime: s.clock.now(), events: [], documents: [{ doc: { docId: 'd2', languageId: 'sq', kind: 'note', body: BODY + '2' }, expectedRevision: 0 }] } });
    expect(push.status).toBe(200);
    expect(push.text).not.toContain(BODY);
    expect(JSON.stringify((await raw(s, 'GET', '/events', { token: a.token })).body)).not.toContain(BODY);
  });

  it('a deleted document\'s body is gone from the raw store, the pull shows a tombstone without a body, and the id answers 404', async () => {
    const w = await world(kind);
    expect((await raw(w.s, 'DELETE', `/documents/${w.aDoc}`, { token: w.a.token })).status).toBe(204);
    expect((await raw(w.s, 'GET', `/documents/${w.aDoc}`, { token: w.a.token })).status).toBe(404);
    expect((await raw(w.s, 'GET', '/documents', { token: w.a.token })).body.documents).toEqual([]);
    const pull = await raw(w.s, 'POST', '/sync/pull', { token: w.a.token, body: { deviceId: 'a-phone', afterSeq: 0 } });
    expect(pull.text).not.toContain(VICTIM_BODY);
    expect(pull.body.documents[0]).toMatchObject({ docId: 'a-doc', body: '' });
    expect(await dumpStore(w.s, [w.a.learnerId])).not.toContain(VICTIM_BODY);
  });

  it('the server, not the client, decides learner, device, time and revision of a document', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const r = await raw(s, 'PUT', '/documents/d1', { token: a.token, body: { doc: { languageId: 'sq', kind: 'note', body: 'x', deviceId: 'forged-device', updatedAt: '1999-01-01T00:00:00Z', revision: 999, deletedAt: '2000-01-01T00:00:00Z' }, expectedRevision: 0 } });
    expect(r.status).toBe(200);
    expect(r.body.document).toMatchObject({ learnerId: a.learnerId, deviceId: 'phone', revision: 1, updatedAt: s.clock.now() });
    expect(r.body.document.deletedAt).toBeUndefined();
    expect((await raw(s, 'GET', '/documents/d1', { token: a.token })).status).toBe(200);
    // a stale revision is a conflict, not an overwrite
    expect((await raw(s, 'PUT', '/documents/d1', { token: a.token, body: { doc: { languageId: 'sq', kind: 'note', body: 'y' }, expectedRevision: 0 } })).status).toBe(409);
    expect((await raw(s, 'GET', '/documents/d1', { token: a.token })).body.document.body).toBe('x');
  });
});

describe('storage abuse (informational)', () => {
  it('FINDING (low): accounts are free and unthrottled, and a document can be up to the 1 MB body limit: there is no signup throttle and no per-learner quota', async () => {
    const s = make('memory');
    for (let i = 0; i < 25; i++) {
      const r = await raw(s, 'POST', '/accounts', { body: { email: `bulk${i}@example.com`, password: `${PASSWORD}-${i}` } });
      expect(r.status).toBe(201);
    }
    const a = await signUp(s, 'big@example.com');
    const big = 'x'.repeat(900_000);
    for (let i = 0; i < 4; i++) expect((await a.api.putDocument(`big-${i}`, { languageId: 'sq', kind: 'note', body: big }, 0)).ok).toBe(true);
  });
});

