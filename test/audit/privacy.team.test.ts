// @vitest-environment node
/**
 * Privacy audit (3) mission teams and team switching; (4) language switching.
 *
 * A mission team is a label, not a permission: a leader and a member are constructed and the leader is shown to be unable to
 * read the member's events, documents or knowledge, by id, by route, by guessed team routes and through his own views.
 * Real service, both real stores.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { GoEvent, UnitKnowledge } from '../../packages/repository-contract/src';
import { albanianPack } from '../../packages/repository-linguistics/src';
import {
  PASSWORD, STORE_KINDS, createNet, createStack, lookup, makeTeam, production, raw, review, serverEvents, signUp, text,
  type Learner, type Stack, type StoreKind,
} from './privacy.support';
import { accountFor, createWorkerRig, pendingEvent } from './offline.support';

const stacks: Stack[] = [];
const make = (kind: StoreKind): Stack => { const s = createStack(kind); stacks.push(s); return s; };
afterEach(async () => { while (stacks.length) await stacks.pop()!.close(); });

const M_SURFACE = 'memberonlyword';
const M_BODY = 'MEMBER-TESTIMONY-BODY-6120';
const M_TITLE = 'MEMBER-TESTIMONY-TITLE-6120';

interface World { s: Stack; leader: Learner; member: Learner; peer: Learner; outsider: Learner; memberEvents: GoEvent[] }

/** Team `albania`: leader, member, peer (another member). `outsider` is in no team. The member has events, knowledge, a document. */
async function world(kind: StoreKind): Promise<World> {
  const s = make(kind);
  const leader = await signUp(s, 'leader@mission.example', 'l-phone');
  const member = await signUp(s, 'member@mission.example', 'm-phone');
  const peer = await signUp(s, 'peer@mission.example', 'p-phone');
  const outsider = await signUp(s, 'outsider@example.com', 'o-phone');
  await makeTeam(s, 'albania', [{ who: leader, role: 'leader' }, { who: member, role: 'member' }, { who: peer, role: 'member' }]);
  const memberEvents = [
    lookup(member, { payload: { surface: M_SURFACE, tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] }, subject: { itemIds: ['form:sq:memberonlyword', 'lemma:sq:memberonlylemma:NOUN'], sentenceKey: 'mm77' } }),
    review(member, { subject: { itemIds: ['lemma:sq:memberreview:NOUN'], cardId: 'mc' } }),
  ];
  expect((await member.api.appendEvents(memberEvents)).ok).toBe(true);
  const w = await member.api.submitWriting({
    observation: production(member, { id: 'member-prod', subject: { itemIds: ['lemma:sq:memberwrite:NOUN'], draftId: 'm-draft' } }),
    document: { doc: { docId: 'm-draft', learnerId: member.learnerId, languageId: 'sq', kind: 'testimony', title: M_TITLE, body: M_BODY, revision: 1, deviceId: member.deviceId, updatedAt: s.clock.now() }, expectedRevision: 0 },
  });
  expect(w.ok).toBe(true);
  return { s, leader, member, peer, outsider, memberEvents };
}

/** Every value that identifies or belongs to the member. */
const secretsOf = (w: World): string[] => [
  w.member.learnerId, w.member.accountId, w.member.email, w.member.enrolmentId, w.member.deviceId, w.member.token, M_SURFACE, 'memberonlylemma', 'memberreview', 'memberwrite', 'mm77', M_BODY, M_TITLE, 'm-draft', 'member-prod',
  ...w.memberEvents.map((e) => e.id),
];

describe.each(STORE_KINDS)('a mission-team leader and a member — %s store', (kind) => {
  it('the leader\'s own views of every GET route hold nothing of the member (events, documents, knowledge, candidates, export, me, enrolments, preferences)', async () => {
    const w = await world(kind);
    const { leader } = w;
    expect((await leader.api.appendEvents([lookup(leader)])).ok).toBe(true);   // the leader has data of his own, so the views are not empty
    const views: unknown[] = [
      await leader.api.listEvents({ limit: 1000 }), await leader.api.knowledge(), await leader.api.listDocuments(), await leader.api.exportAll(), await leader.api.me(),
      await leader.api.listEnrolments(), await leader.api.preferences('sq'), await leader.api.candidates(leader.enrolmentId, 100), await leader.api.packs('sq'),
      await leader.api.syncPull({ deviceId: leader.deviceId, afterSeq: 0, limit: 1000 }),
    ];
    for (const v of views) {
      const t = text(v);
      for (const secret of secretsOf(w)) expect(t, `${secret} leaked into a leader view`).not.toContain(secret);
    }
    const mine = await leader.api.listEvents({ limit: 1000 });
    expect(mine.ok && mine.data.events.every((e) => e.learnerId === leader.learnerId)).toBe(true);
  });

  it('the leader cannot read, write or delete the member\'s data by naming it, on any learner-scoped route', async () => {
    const w = await world(kind);
    const { s, leader, member } = w;
    const before = await member.api.exportAll();
    const L = encodeURIComponent(member.learnerId);
    const attacks: Array<[string, string, unknown?]> = [
      ['GET', `/events?learnerId=${L}`], ['GET', `/knowledge?learnerId=${L}`], ['GET', `/documents?learnerId=${L}`], ['GET', `/documents/m-draft?learnerId=${L}`],
      ['GET', `/export?learnerId=${L}`], ['GET', `/enrolments?learnerId=${L}`], ['GET', `/preferences?learnerId=${L}`], ['GET', `/candidates?learnerId=${L}&enrolmentId=${member.enrolmentId}`],
      ['GET', `/candidates?enrolmentId=${member.enrolmentId}`], ['GET', '/documents/m-draft'], ['DELETE', '/documents/m-draft'], ['DELETE', `/documents/m-draft?learnerId=${L}`],
      ['POST', '/sync/pull', { learnerId: member.learnerId, deviceId: leader.deviceId, afterSeq: 0 }], ['POST', '/events', { learnerId: member.learnerId, events: [lookup(leader)] }],
      ['POST', '/tombstones', { learnerId: member.learnerId, scope: { kind: 'learner' } }], ['DELETE', '/me', { learnerId: member.learnerId, confirmEmail: member.email }],
      ['POST', '/enrolments', { learnerId: member.learnerId, languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [] }],
    ];
    for (const [method, path, body] of attacks) {
      const r = await raw(s, method, path, { token: leader.token, ...(body !== undefined ? { body } : {}) });
      expect([403, 404, 422], `${method} ${path} answered ${r.status}`).toContain(r.status);
      for (const secret of secretsOf(w)) expect(r.text, `${secret} leaked by ${method} ${path}`).not.toContain(secret);
    }
    const after = await member.api.exportAll();
    expect(before.ok && after.ok).toBe(true);
    if (before.ok && after.ok) expect({ ...after.data, exportedAt: 0 }).toEqual({ ...before.data, exportedAt: 0 });
    expect((await member.api.getDocument('m-draft')).ok).toBe(true);
  });

  it('a leader PUT to the member\'s document id makes the leader\'s own document and leaves the member\'s text alone', async () => {
    const w = await world(kind);
    const put = await w.leader.api.putDocument('m-draft', { languageId: 'sq', kind: 'note', body: 'LEADER-OWN-TEXT' }, 0);
    expect(put.ok).toBe(true);
    const theirs = await w.member.api.getDocument('m-draft');
    expect(theirs.ok && theirs.data.document.body).toBe(M_BODY);
    const mine = await w.leader.api.getDocument('m-draft');
    expect(mine.ok && mine.data.document.body).toBe('LEADER-OWN-TEXT');
  });

  it('no team-level route exists: guessed team, leader and report routes answer 404/405 and never data', async () => {
    const w = await world(kind);
    const paths = ['/teams', '/teams/albania', '/teams/albania/members', '/teams/albania/learners', '/teams/albania/events', '/teams/albania/progress', '/teams/albania/knowledge',
      '/team', '/team/members', '/team/progress', '/leader', '/leader/members', '/leader/progress', '/mission', '/mission/albania', '/reports', '/reports/team', '/stats', '/stats/team',
      '/learners', '/learners/' + w.member.learnerId, '/admin/learners', '/members', '/members/' + w.member.learnerId, '/api/teams', '/export/team', '/aggregate'];
    for (const p of paths) {
      for (const method of ['GET', 'POST']) {
        const r = await raw(w.s, method, p, { token: w.leader.token, ...(method === 'POST' ? { body: {} } : {}) });
        expect([404, 405], `${method} ${p} answered ${r.status}`).toContain(r.status);
        for (const secret of secretsOf(w)) expect(r.text).not.toContain(secret);
      }
    }
  });

  it('a peer member sees nothing of another member either, and an outsider nothing of the team', async () => {
    const w = await world(kind);
    for (const viewer of [w.peer, w.outsider]) {
      const t = text([await viewer.api.listEvents({ limit: 1000 }), await viewer.api.knowledge(), await viewer.api.listDocuments(), await viewer.api.exportAll(), await viewer.api.me()]);
      for (const secret of secretsOf(w)) expect(t, `${secret} leaked to ${viewer.email}`).not.toContain(secret);
    }
    // nor does the outsider's /me reveal that a team exists
    const me = await w.outsider.api.me();
    expect(me.ok && text(me.data)).not.toContain('albania');
  });

  it('a leader cannot use the team to gain a view of the member through enrolment: joining the member\'s team grants no data, and a non-member cannot join', async () => {
    const w = await world(kind);
    const joined = await w.leader.api.enrol({ teamId: 'albania', languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    expect(joined.ok).toBe(true);
    const refused = await w.outsider.api.enrol({ teamId: 'albania', languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    expect(refused.ok).toBe(false);
    expect(refused.ok ? 0 : refused.status).toBe(403);
    const t = text(await w.leader.api.exportAll());
    for (const secret of secretsOf(w)) expect(t).not.toContain(secret);
  });
});

describe.each(STORE_KINDS)('team switching — %s store', (kind) => {
  it('enrolling in a team, in a second team, and without one never moves or exposes the learner\'s earlier events', async () => {
    const w = await world(kind);
    const { s, leader, member } = w;
    const pack = albanianPack();
    await makeTeam(s, 'germany', [{ who: member, role: 'member' }]);
    const ev0 = (await serverEvents(s, member.learnerId)).map((e) => e.id).sort();
    const toAlbania = await member.api.enrol({ teamId: 'albania', languageId: 'sq', packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'reading' }] });
    const toGermany = await member.api.enrol({ teamId: 'germany', languageId: 'de', packId: 'pack:de', packVersion: '1', goals: [{ kind: 'reading' }] });
    const personal = await member.api.enrol({ languageId: 'sq', packId: pack.packId, packVersion: pack.version, goals: [{ kind: 'writing' }] });
    expect(toAlbania.ok && toGermany.ok && personal.ok).toBe(true);
    const after = (await serverEvents(s, member.learnerId));
    for (const id of ev0) expect(after.map((e) => e.id)).toContain(id);                 // nothing removed or rewritten
    const original = after.find((e) => e.id === w.memberEvents[0].id)!;
    expect(original.enrolmentId).toBe(member.enrolmentId);                               // earlier events keep their own enrolment
    const changes = after.filter((e) => e.kind === 'EnrolmentChanged');
    expect(changes.length).toBe(4);                                                      // the first enrolment and the three switches are recorded
    expect(text(changes)).not.toContain(leader.learnerId);                               // an enrolment event names no other person
    const t = text([await leader.api.listEvents({ limit: 1000 }), await leader.api.exportAll(), await leader.api.knowledge()]);
    for (const secret of secretsOf(w)) expect(t).not.toContain(secret);
  });

  it('joining a team does not reveal who else is in it, nor that the leader exists', async () => {
    const w = await world(kind);
    const e = await w.member.api.enrol({ teamId: 'albania', languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    expect(e.ok).toBe(true);
    const t = text(e.ok ? e.data : e);
    for (const other of [w.leader.learnerId, w.peer.learnerId, w.leader.email, w.peer.email]) expect(t).not.toContain(other);
    const me = await w.member.api.me();
    expect(me.ok && text(me.data)).not.toContain(w.peer.learnerId);
    expect(me.ok && text(me.data)).not.toContain(w.leader.learnerId);
  });

  // DEFECT P-06: Enrolment has `endedAt`, and the extension (`pickEnrolment`) ignores ended enrolments, but no route sets it:
  // a learner can add a team label and a language but never end an enrolment or leave a team. The team label on an old
  // enrolment is permanent. (It confers no access, so this is a control gap, not a leak.)
  it('P-06 (fixed): a learner can end an enrolment (Enrolment.endedAt is honoured by the apps)', async () => {
    const w = await world(kind);
    const e = await w.member.api.enrol({ teamId: 'albania', languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] });
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const id = e.data.enrolment.enrolmentId;
    const tries: Array<[string, string, unknown?]> = [
      ['DELETE', `/enrolments/${id}`], ['POST', `/enrolments/${id}/end`, {}], ['POST', `/enrolments/${id}/leave`, {}], ['PATCH', `/enrolments/${id}`, { endedAt: w.s.clock.now() }],
      ['PUT', `/enrolments/${id}`, { endedAt: w.s.clock.now() }], ['POST', '/enrolments/end', { enrolmentId: id }],
    ];
    let ended = false;
    for (const [method, path, body] of tries) {
      const r = await raw(w.s, method, path, { token: w.member.token, ...(body !== undefined ? { body } : {}) });
      if (r.status < 300) ended = true;
    }
    const list = await w.member.api.listEnrolments();
    expect(ended && list.ok && !!list.data.enrolments.find((x) => x.enrolmentId === id)?.endedAt).toBe(true);
  });

  it('P-06: POST /enrolments/:id/end sets endedAt, records EnrolmentChanged ended once, keeps the history, and is refused for a stranger enrolment', async () => {
    const w = await world(kind);
    const id = w.member.enrolmentId;
    const first = await w.member.api.endEnrolment(id);
    expect(first.ok && first.data.enrolment.endedAt).toBeTruthy();
    const again = await w.member.api.endEnrolment(id);                                    // idempotent
    expect(again.ok && again.data.enrolment.endedAt).toBe(first.ok ? first.data.enrolment.endedAt : 'x');
    const evs = await serverEvents(w.s, w.member.learnerId);
    expect(evs.filter((e) => e.kind === 'EnrolmentChanged' && (e.payload as { change?: string }).change === 'ended')).toHaveLength(1);
    expect(evs.some((e) => e.id === w.memberEvents[0].id)).toBe(true);                    // nothing recorded earlier is removed
    const other = await w.leader.api.endEnrolment(id);                                    // not the leader's enrolment: indistinguishable from a missing one
    expect(other.ok ? 0 : other.status).toBe(404);
  });

  it('FINDING: guessed enrolment-ending routes are 404/405 today (so the gap above is real, not a naming miss)', async () => {
    const w = await world(kind);
    const id = w.member.enrolmentId;
    for (const [method, path] of [['DELETE', `/enrolments/${id}`], ['PATCH', `/enrolments/${id}`], ['PUT', `/enrolments/${id}`]] as const) {
      const r = await raw(w.s, method, path, { token: w.member.token, body: {} });
      expect([404, 405]).toContain(r.status);
    }
  });
});

describe.each(STORE_KINDS)('language switching — %s store', (kind) => {
  const idOf = (w: Learner, enrolmentId: string) => ({ learnerId: w.learnerId, enrolmentId, deviceId: w.deviceId });

  async function bilingual() {
    const s = make(kind);
    const a = await signUp(s, 'poly@example.com', 'poly-phone');
    const es = await a.api.enrol({ languageId: 'es', packId: 'pack:es', packVersion: '1', goals: [{ kind: 'reading' }] });
    if (!es.ok) throw new Error('enrol es');
    const esId = es.data.enrolment.enrolmentId;
    const sq = idOf(a, a.enrolmentId);
    const esI = idOf(a, esId);
    const sqEvents = [
      lookup(sq, { subject: { itemIds: ['form:sq:shtëpinë', 'lemma:sq:shtëpi:NOUN'], sentenceKey: 'sq01' } }),
      review(sq, { subject: { itemIds: ['lemma:sq:libër:NOUN'], cardId: 'sq-c' } }),
    ];
    const esEvents = [
      lookup(esI, { languageId: 'es', subject: { itemIds: ['form:es:casa', 'lemma:es:casa:NOUN'], sentenceKey: 'es01' }, payload: { surface: 'casa', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] } }),
      review(esI, { languageId: 'es', subject: { itemIds: ['lemma:es:libro:NOUN'], cardId: 'es-c' } }),
    ];
    expect((await a.api.appendEvents([...sqEvents, ...esEvents])).ok).toBe(true);
    return { s, a, esId, sqEvents, esEvents };
  }

  it('events for sq and es stay separate in the log: filters, enrolment ids and counts', async () => {
    const { a, esId, sqEvents, esEvents } = await bilingual();
    const sq = await a.api.listEvents({ languageId: 'sq', limit: 1000 });
    const es = await a.api.listEvents({ languageId: 'es', limit: 1000 });
    expect(sq.ok && es.ok).toBe(true);
    if (!sq.ok || !es.ok) return;
    expect(sq.data.events.every((e) => e.languageId === 'sq')).toBe(true);
    expect(es.data.events.every((e) => e.languageId === 'es')).toBe(true);
    for (const e of sqEvents) expect(sq.data.events.map((x) => x.id)).toContain(e.id);
    for (const e of esEvents) expect(es.data.events.map((x) => x.id)).toContain(e.id);
    for (const e of esEvents) expect(sq.data.events.map((x) => x.id)).not.toContain(e.id);
    expect(es.data.events.filter((e) => e.kind !== 'EnrolmentChanged').every((e) => e.enrolmentId === esId)).toBe(true);
  });

  it('the projection is per language: each unit\'s knowledge row carries its own language and no sq event touches an es unit (and the reverse)', async () => {
    const { a } = await bilingual();
    const k = await a.api.knowledge();
    expect(k.ok).toBe(true);
    if (!k.ok) return;
    const rows: UnitKnowledge[] = k.data.knowledge;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.unitId.split(':')[1], `${r.unitId} is filed under ${r.languageId}`).toBe(r.languageId);
    const sqRows = rows.filter((r) => r.languageId === 'sq').map((r) => r.unitId);
    const esRows = rows.filter((r) => r.languageId === 'es').map((r) => r.unitId);
    expect(sqRows.length && esRows.length).toBeTruthy();
    expect(esRows.some((u) => u.includes('shtëpi') || u.includes('libër'))).toBe(false);
    expect(sqRows.some((u) => u.includes('casa') || u.includes('libro'))).toBe(false);
    const libro = rows.find((r) => r.unitId === 'lemma:es:libro:NOUN')!;
    expect(libro.dimensions.readingRecognition.observations).toBe(1);
    expect(rows.find((r) => r.unitId === 'lemma:sq:libër:NOUN')!.dimensions.readingRecognition.observations).toBe(1);
  });

  it('candidates are per enrolment: the es list names no sq unit and the sq list no es unit', async () => {
    const { a, esId } = await bilingual();
    const sq = await a.api.candidates(a.enrolmentId, 100);
    const es = await a.api.candidates(esId, 100);
    expect(sq.ok && es.ok).toBe(true);
    if (!sq.ok || !es.ok) return;
    expect(sq.data.candidates.every((c) => c.unitId.split(':')[1] === 'sq')).toBe(true);
    expect(es.data.candidates.every((c) => c.unitId.split(':')[1] === 'es')).toBe(true);
  });

  it('preferences are per language: an explicit es choice does not change the sq preference', async () => {
    const { a, esId } = await bilingual();
    const ev = lookup(idOf(a, esId), { languageId: 'es', kind: 'PreferenceChanged', producer: { app: 'golearn-app', version: '1', deviceId: a.deviceId }, subject: {}, payload: { key: 'explanationDepth', value: 'explanatory', origin: 'explicit' } });
    expect((await a.api.appendEvents([ev])).ok).toBe(true);
    const es = await a.api.preferences('es');
    const sq = await a.api.preferences('sq');
    expect(es.ok && es.data.preferences.explanationDepth).toMatchObject({ value: 'explanatory', origin: 'explicit' });
    expect(sq.ok && sq.data.preferences.explanationDepth.value).toBe('brief');
    expect(sq.ok && sq.data.preferences.explanationDepth.origin).not.toBe('explicit');
  });

  // DEFECT P-07: the service never checks that an event's enrolmentId belongs to the learner OR that its languageId is the
  // language of that enrolment (security audit S-06 saw the first half). Here the second half: an sq event sent under the es
  // enrolment is stored as such, so one language's activity can be filed under the other enrolment. It is the learner's own data,
  // so nothing leaks, but "events for sq and es stay separate" holds only as long as every client labels them consistently.
  it('P-07 (fixed): an event whose languageId differs from its enrolment\'s language is refused', async () => {
    const { a, esId } = await bilingual();
    const crossed = lookup(idOf(a, esId), { languageId: 'sq', subject: { itemIds: ['form:sq:kryq'], sentenceKey: 'x1' } });
    const r = await a.api.appendEvents([crossed]);
    expect(r.ok).toBe(false);                                   // the whole batch is refused: 422 invalid-events, naming languageId
    expect(r.ok ? 0 : r.status).toBe(422);
    const mine = await a.api.listEvents({ languageId: 'sq', limit: 1000 });
    expect(mine.ok && mine.data.events.some((e) => e.id === crossed.id)).toBe(false);
  });

  it('an account with both languages exports both, each event with its own language and enrolment', async () => {
    const { a, esId, esEvents } = await bilingual();
    const ex = await a.api.exportAll();
    expect(ex.ok).toBe(true);
    if (!ex.ok) return;
    const evs = ex.data.events as GoEvent[];
    for (const e of esEvents) { const got = evs.find((x) => x.id === e.id)!; expect(got.languageId).toBe('es'); expect(got.enrolmentId).toBe(esId); }
    expect(PASSWORD.length).toBeGreaterThan(0);
  });
});

describe.each(STORE_KINDS)('language switching in the GoLearn extension — %s store', (kind) => {
  async function twoLanguages() {
    const s = make(kind);
    const net = createNet(s);
    const a = await accountFor(s, 'ana@example.com');
    const es = await a.api.enrol({ languageId: 'es', packId: 'pack:es', packVersion: '1', goals: [{ kind: 'reading' }] });
    if (!es.ok) throw new Error('enrol es');
    const rig = createWorkerRig(s, net);
    expect((await rig.connect(a.email)).ok).toBe(true);
    return { s, a, esId: es.data.enrolment.enrolmentId, rig };
  }

  it('selecting the other enrolment moves the worker to it: status names the new language, later events carry the new enrolment, earlier events keep theirs', async () => {
    const { s, a, esId, rig } = await twoLanguages();
    const first = await rig.recordLookup('shtëpinë');
    expect((await rig.page({ type: 'golearn:status' })).languageId).toBe('sq');
    expect((await rig.page({ type: 'golearn:select-enrolment', enrolmentId: esId })).ok).toBe(true);
    expect((await rig.page({ type: 'golearn:status' })).languageId).toBe('es');
    // a Spanish selection (P-07: an event in another language than the selected enrolment's is no longer filed under it)
    const spanish = { ...pendingEvent('libro', 'Yo leo un libro.'), languageId: 'es' };
    expect((await rig.content({ type: 'golearn:record', event: spanish })).ok).toBe(true);
    const second = { eventId: spanish.id };
    await rig.fireTimers();
    await rig.page({ type: 'golearn:sync-now' });
    const evs = await serverEvents(s, a.learnerId);
    expect(evs.find((e) => e.id === first.eventId)?.enrolmentId).toBe(a.enrolmentId);
    expect(evs.find((e) => e.id === second.eventId)?.enrolmentId).toBe(esId);
  });

  // DEFECT P-07 (worker side): the background worker replaces learner, enrolment and device in a content script's event but keeps its
  // languageId. With Spanish selected, an Albanian lookup is filed under the Spanish enrolment. Nothing leaks (it is the learner's
  // own data), but the two languages' histories are separated only as long as the page never sends the other language.
  it('P-07 (fixed): an event whose language is not the selected enrolment\'s language is not filed under that enrolment', async () => {
    const { s, a, esId, rig } = await twoLanguages();
    expect((await rig.page({ type: 'golearn:select-enrolment', enrolmentId: esId })).ok).toBe(true);
    const sent = await rig.recordLookup('libër', 'Unë lexoj një libër.');          // an Albanian selection
    await rig.fireTimers();
    await rig.page({ type: 'golearn:sync-now' });
    const ev = (await serverEvents(s, a.learnerId)).find((e) => e.id === sent.eventId);
    const filedUnderSpanish = ev?.enrolmentId === esId && ev?.languageId === 'sq';
    expect(filedUnderSpanish).toBe(false);
  });
});
