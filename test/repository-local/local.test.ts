// @vitest-environment node
/**
 * The device-local Repository: persistence, no password, upload and pull against a REAL remote service, clear, analysers passed in.
 * Everything runs over the real store, engine, linguistic service and request handler; only the key-value area and the clock are test doubles.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { inspectLocal, markEventsOwned, openLocalRepository, sha256Hex, UPLOAD_BATCH } from '../../packages/repository-local/src';
import type { LocalRepository } from '../../packages/repository-local/src';
import { createInProcessApi, type RepositoryApi } from '../../packages/repository-service/src/api';
import type { KeyValueArea } from '../../packages/repository-sync/src/area';
import { clock, createRemote, failingArea, lookup, newArea, review, type TestArea, type Who } from './support';

const ok = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>): T => {
  if (!r.ok) throw new Error(`api ${r.status} ${String(r.error)}: ${String(r.message)}`);
  return r.data as T;
};

async function open<A extends KeyValueArea = TestArea>(area: A = newArea() as unknown as A, c = clock(), more: Partial<Parameters<typeof openLocalRepository>[0]> = {}) {
  const repo = await openLocalRepository({ area, now: c.now, ...more });
  return { repo, area, c };
}

/** Enrol the local learner in Albanian and give back an identity to build events with. */
async function enrolSq(repo: LocalRepository): Promise<Who> {
  const id = await repo.identity();
  const e = ok<{ enrolment: { enrolmentId: string } }>(await repo.api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' }] }));
  return { learnerId: id.learnerId, deviceId: id.deviceId, enrolmentId: e.enrolment.enrolmentId };
}
const append = async (repo: LocalRepository, ...events: GoEvent[]) => ok<{ stored: number; duplicates: number }>(await repo.api.appendEvents(events));

describe('sha256', () => {
  it('equals Node\'s, for text of every length class and for non-ASCII text', () => {
    for (const s of ['', 'a', 'abc', 'shtëpi', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000), 'Unë po lexoj një libër të bukur.']) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });
});

describe('a local repository has no password and no account elsewhere', () => {
  it('opens with a learner, a device and a session, and answers /me as the local account', async () => {
    const { repo } = await open();
    const id = await repo.identity();
    expect(id.learnerId).toMatch(/[0-9a-f-]{36}/);
    expect(id.deviceId).toMatch(/^local-/);
    const me = ok<{ learner: { learnerId: string }; account: { email: string } }>(await repo.api.me());
    expect(me.learner.learnerId).toBe(id.learnerId);
    expect(me.account.email).toBe('local@device');
    expect(repo.api.token).toBeTruthy();
  });

  it('cannot be signed in to or have an account made on: there is no password to check or to hash', async () => {
    const { repo } = await open();
    const id = await repo.identity();
    const signIn = await repo.api.createSession({ email: 'local@device', password: 'anything at all, really', deviceId: id.deviceId });
    expect(signIn.ok).toBe(false);
    expect((signIn as { status: number }).status).toBe(401);
    const made = await repo.api.createAccount({ email: 'someone@example.test', password: 'correct horse battery' });
    expect(made.ok).toBe(false);
  });

  it('keeps the session token in memory only: no stored row holds it, and a reopened repository has a different one', async () => {
    const { repo, area, c } = await open();
    await enrolSq(repo);
    const token = repo.api.token!;
    expect(JSON.stringify(area.dump())).not.toContain(token);
    expect(JSON.stringify(area.dump())).not.toContain('passwordHash');
    const again = await openLocalRepository({ area, now: c.now });
    expect(again.api.token).not.toBe(token);
    expect(ok<{ account: { email: string } }>(await again.api.me()).account.email).toBe('local@device');
  });

  it('uses the device id it is given, and keeps the learner across reopenings', async () => {
    const area = newArea();
    const c = clock();
    const a = await openLocalRepository({ area, now: c.now, deviceId: 'dev-from-host' });
    expect(area.dump()).toEqual({}); // opened and unused: nothing is written, not even an identity
    await enrolSq(a);
    const first = await a.identity();
    expect(first.deviceId).toBe('dev-from-host');
    const b = await openLocalRepository({ area, now: c.now, deviceId: 'dev-from-host' });
    expect(await b.identity()).toEqual(first);
    const moved = await openLocalRepository({ area, now: c.now, deviceId: 'dev-other' });
    expect((await moved.identity()).learnerId).toBe(first.learnerId);
    expect((await moved.identity()).deviceId).toBe('dev-other');
  });
});

describe('persistence', () => {
  it('a reopened repository holds the same events, enrolments, units and knowledge', async () => {
    const { repo, area, c } = await open();
    const who = await enrolSq(repo);
    c.tick();
    await append(repo, lookup(who, 'shtëpi', c), lookup(who, 'libër', c), lookup(who, 'shtëpi', c));
    c.tick();
    ok(await repo.api.submitReviews([review(who, 'lemma:sq:shtëpi:NOUN', c)]));
    const events = await repo.exportEvents();
    const enrolments = ok<{ enrolments: unknown[] }>(await repo.api.listEnrolments()).enrolments;
    const knowledge = ok<{ knowledge: unknown[] }>(await repo.api.knowledge()).knowledge;
    const unit = ok(await repo.api.unit('form:sq:shtëpi'));
    expect(events.length).toBeGreaterThanOrEqual(5); // 3 lookups + 1 review + the enrolment event the service wrote
    expect(knowledge.length).toBeGreaterThan(0);

    const reopened = await openLocalRepository({ area, now: c.now });
    expect(await reopened.exportEvents()).toEqual(events);
    expect(ok<{ enrolments: unknown[] }>(await reopened.api.listEnrolments()).enrolments).toEqual(enrolments);
    expect(ok(await reopened.api.unit('form:sq:shtëpi'))).toEqual(unit);
    expect(ok<{ knowledge: unknown[] }>(await reopened.api.knowledge()).knowledge).toEqual(knowledge);
  });

  it('the projection after reopening equals a rebuild from the events, and the knowledge is never a stored row', async () => {
    const { repo, area, c } = await open();
    const who = await enrolSq(repo);
    for (let i = 0; i < 6; i++) { c.tick(); await append(repo, lookup(who, i % 2 ? 'libër' : 'shtëpi', c)); }
    c.tick();
    ok(await repo.api.submitReviews([review(who, 'lemma:sq:libër:NOUN', c)]));
    const live = ok<{ knowledge: unknown[] }>(await repo.api.knowledge()).knowledge;
    expect(Object.keys(area.dump()).filter((k) => /knowledge|cursor/i.test(k))).toEqual([]);
    const reopened = await openLocalRepository({ area, now: c.now });
    const after = ok<{ knowledge: unknown[] }>(await reopened.api.knowledge()).knowledge;
    expect(after).toEqual(live);
    await reopened.rebuild();
    expect(ok<{ knowledge: unknown[] }>(await reopened.api.knowledge()).knowledge).toEqual(live);
  });

  it('writes one row per event, keyed by sequence, under the prefix only', async () => {
    const { repo, area, c } = await open(newArea(), clock(), { keyPrefix: 'p:' });
    const who = await enrolSq(repo);
    c.tick();
    await append(repo, lookup(who, 'shtëpi', c));
    const keys = Object.keys(area.dump());
    expect(keys.every((k) => k.startsWith('p:'))).toBe(true);
    expect(keys.filter((k) => k.startsWith('p:event:')).sort()).toEqual(['p:event:1', 'p:event:2']);
    expect(keys.some((k) => k.startsWith('p:unit:form:sq:shtëpi'))).toBe(true);
    expect(keys.some((k) => k.startsWith('p:analysis:'))).toBe(true);
    expect(keys.some((k) => k.startsWith('p:enrolment:'))).toBe(true);
  });

  it('a deletion survives a reopening, and the rows are renumbered to agree with the log', async () => {
    const { repo, area, c } = await open();
    const who = await enrolSq(repo);
    const e1 = lookup(who, 'shtëpi', c);
    const e2 = lookup(who, 'libër', c);
    c.tick();
    await append(repo, e1, e2);
    const before = (await repo.exportEvents()).length;
    ok(await repo.api.putTombstone({ kind: 'event', id: e1.id }, 'test'));
    expect((await repo.exportEvents()).length).toBe(before - 1);
    const reopened = await openLocalRepository({ area, now: c.now });
    const ids = (await reopened.exportEvents()).map((e) => e.id);
    expect(ids).not.toContain(e1.id);
    expect(ids).toContain(e2.id);
    const seqs = (await reopened.exportEvents()).map((e) => (e as unknown as { seq: number }).seq);
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
    expect(Object.keys(area.dump()).filter((k) => k.includes(':event:')).length).toBe(seqs.length);
    // and it is idempotent: the next reopening changes nothing
    const third = await openLocalRepository({ area, now: c.now });
    expect(await third.exportEvents()).toEqual(await reopened.exportEvents());
  });

  it('a full disk does not fail the operation: the data stays in memory and the failure is counted', async () => {
    const area = failingArea(newArea());
    const { repo, c } = await open(area);
    const who = await enrolSq(repo);
    area.failing = true;
    c.tick();
    const r = await append(repo, lookup(who, 'shtëpi', c));
    expect(r.stored).toBe(1);
    const st = await inspectLocal(repo);
    expect(st.persistence.failures).toBeGreaterThan(0);
    expect(st.persistence.lastError).toMatch(/quota/i);
  });

  it('reports what it holds', async () => {
    const { repo, c } = await open();
    const who = await enrolSq(repo);
    c.tick();
    await append(repo, lookup(who, 'shtëpi', c));
    const st = await inspectLocal(repo);
    expect(st.events).toBe(2);
    expect(st.pendingUpload).toBe(1);
    expect(st.storedChars).toBeGreaterThan(500);
  });
});

describe('analysers passed in by the host', () => {
  const fake = (calls: string[]) => ({
    lang: 'xx', name: 'Test', script: 'Latn', version: '3', support: {},
    tokenize: (s: string) => { calls.push(s); return [{ surface: s, start: 0, end: s.length, isWord: true, normalized: s.toLowerCase() }]; },
    analyze: (tokens: Array<{ normalized: string }>) => tokens.map((t) => ({ token: t, analyzer: 'adapter-xx@3', candidates: [{ lemma: t.normalized.replace(/s$/, ''), pos: 'NOUN', morph: { number: 'plural' }, confidence: 0.8, gloss: 'thing' }] })),
  });

  it('a language the service has no resolver for is analysed by the adapter the host gave, read at call time', async () => {
    const calls: string[] = [];
    const adapters: Record<string, unknown> = {};
    const { repo } = await open(newArea(), clock(), { adapters: adapters as never });
    const before = ok<{ units: Array<{ unitId: string }> }>(await repo.api.lookup({ languageId: 'xx', surface: 'Dogs' }));
    expect(before.units.map((u) => u.unitId)).toEqual(['form:xx:dogs']); // no adapter yet: the form alone
    adapters.xx = fake(calls);
    const after = ok<{ units: Array<{ unitId: string; kind: string; status: string }>; relations: Array<{ relation: string }>; analysis: { candidates: unknown[]; status: string } }>(await repo.api.lookup({ languageId: 'xx', surface: 'Cats' }));
    expect(calls).toEqual(['Cats']);
    expect(after.units.map((u) => u.unitId).sort()).toEqual(['form:xx:cats', 'lemma:xx:cat:NOUN']);
    expect(after.units.every((u) => u.status === 'provisional')).toBe(true);
    expect(after.relations.map((r) => r.relation)).toEqual(['form-of']);
    expect(after.analysis.candidates).toHaveLength(1);
  });

  it('Albanian is resolved by the service\'s own resolver, with its lexeme', async () => {
    const { repo } = await open();
    const r = ok<{ units: Array<{ unitId: string }> }>(await repo.api.lookup({ languageId: 'sq', surface: 'shtëpinë' }));
    expect(r.units.some((u) => u.unitId === 'lemma:sq:shtëpi:NOUN')).toBe(true);
  });
});

describe('upload to an account', () => {
  async function world(extraEvents = 3) {
    const remote = createRemote();
    const acct = await remote.signUp('ana@example.test', 'dev-A', ['sq']);
    const { repo, area, c } = await open(newArea(), remote.clock, { deviceId: 'dev-A' });
    const who = await enrolSq(repo);
    for (let i = 0; i < extraEvents; i++) { c.tick(); await append(repo, lookup(who, ['shtëpi', 'libër', 'bukur'][i % 3], c)); }
    return { remote, acct, repo, area, c, who };
  }
  const remoteEvents = async (api: RepositoryApi) => ok<{ events: GoEvent[] }>(await api.listEvents({ limit: 1000 })).events;

  it('sends the history once, under the account\'s identity, with the same ids; the local copy stays', async () => {
    const { acct, repo } = await world(3);
    const local = (await repo.exportEvents()).filter((e) => e.producer.app !== 'repository');
    expect(local).toHaveLength(3);
    const r = await repo.uploadTo(acct.api);
    expect(r).toEqual({ sent: 3, duplicates: 0, failed: 0 });
    const there = (await remoteEvents(acct.api)).filter((e) => e.producer.app !== 'repository');
    expect(there.map((e) => e.id).sort()).toEqual(local.map((e) => e.id).sort());
    for (const e of there) { expect(e.learnerId).toBe(acct.learnerId); expect(e.enrolmentId).toBe(acct.enrolmentId); }
    expect((await repo.exportEvents()).length).toBeGreaterThanOrEqual(local.length);
    expect(ok<{ knowledge: unknown[] }>(await acct.api.knowledge()).knowledge.length).toBeGreaterThan(0);
  });

  it('a second upload sends nothing and asks for nothing new; a restart does not forget what was sent', async () => {
    const { acct, repo, area, c } = await world(3);
    await repo.uploadTo(acct.api);
    const calls: string[] = [];
    const spy = new Proxy(acct.api, { get: (t, p) => (typeof (t as never)[p] === 'function' ? (...a: unknown[]) => { calls.push(String(p)); return ((t as never)[p] as (...x: unknown[]) => unknown)(...a); } : (t as never)[p]) });
    expect(await repo.uploadTo(spy)).toEqual({ sent: 0, duplicates: 0, failed: 0 });
    expect(calls).not.toContain('appendEvents');
    const reopened = await openLocalRepository({ area, now: c.now, deviceId: 'dev-A' });
    expect(await reopened.uploadTo(acct.api)).toEqual({ sent: 0, duplicates: 0, failed: 0 });
    expect((await inspectLocal(reopened)).pendingUpload).toBe(0);
  });

  it('a duplicate answer from the service counts as success (the markers are gone, the service remembers)', async () => {
    const { acct, repo, area } = await world(3);
    await repo.uploadTo(acct.api);
    await area.remove(await area.list('local-repo:uploaded:'));
    const again = await repo.uploadTo(acct.api);
    expect(again).toEqual({ sent: 0, duplicates: 3, failed: 0 });
    expect((await inspectLocal(repo)).pendingUpload).toBe(0);
    expect((await remoteEvents(acct.api)).filter((e) => e.producer.app !== 'repository')).toHaveLength(3);
  });

  it('events recorded after an upload are the only ones sent next time', async () => {
    const { acct, repo, c, who } = await world(2);
    await repo.uploadTo(acct.api);
    c.tick();
    await append(repo, lookup(who, 'bukur', c));
    expect(await repo.uploadTo(acct.api)).toEqual({ sent: 1, duplicates: 0, failed: 0 });
  });

  it('sends in batches of 100, review events through /reviews and everything else through /events, and reports progress', async () => {
    const { acct, repo, c, who } = await world(0);
    const lookups: GoEvent[] = [];
    for (let i = 0; i < 230; i++) lookups.push(lookup(who, `w${i}`, c));
    const reviews: GoEvent[] = [];
    for (let i = 0; i < 20; i++) reviews.push(review(who, 'lemma:sq:shtëpi:NOUN', c));
    c.tick();
    for (let i = 0; i < lookups.length; i += 100) await append(repo, ...lookups.slice(i, i + 100));
    ok(await repo.api.submitReviews(reviews));
    const sizes: Array<[string, number]> = [];
    const spy = new Proxy(acct.api, { get: (t, p) => {
      if (p === 'appendEvents' || p === 'submitReviews') return (evs: GoEvent[]) => { sizes.push([String(p), evs.length]); return (t as never as Record<string, (e: GoEvent[]) => unknown>)[p as string](evs); };
      return (t as never)[p];
    } });
    const progress: Array<[number, number]> = [];
    const r = await repo.uploadTo(spy, { onProgress: (s, t) => progress.push([s, t]) });
    expect(r).toEqual({ sent: 250, duplicates: 0, failed: 0 });
    expect(UPLOAD_BATCH).toBe(100);
    expect(sizes).toEqual([['appendEvents', 100], ['appendEvents', 100], ['appendEvents', 30], ['submitReviews', 20]]);
    expect(progress.at(-1)).toEqual([250, 250]);
    expect(progress.map(([s]) => s)).toEqual([...progress.map(([s]) => s)].sort((a, b) => a - b));
  });

  it('never enrols the account in a language it did not choose: those events wait, and go under the account enrolment once it has one', async () => {
    const remote = createRemote();
    const acct = await remote.signUp('ana@example.test', 'dev-A', ['sq']);
    const { repo, c } = await open(newArea(), remote.clock, { deviceId: 'dev-A' });
    const sq = await enrolSq(repo);
    const es = ok<{ enrolment: { enrolmentId: string } }>(await repo.api.enrol({ languageId: 'es', packId: 'pack:es', packVersion: '9', goals: [{ kind: 'reading' }] }));
    c.tick();
    await append(repo, lookup(sq, 'shtëpi', c), { ...lookup(sq, 'casa', c), languageId: 'es', enrolmentId: es.enrolment.enrolmentId, subject: { itemIds: ['form:es:casa'] } });
    expect(await repo.uploadTo(acct.api)).toEqual({ sent: 1, duplicates: 0, failed: 0 });
    expect((await inspectLocal(repo)).waiting).toBe(1);
    const enrolments = ok<{ enrolments: Array<{ languageId: string }> }>(await acct.api.listEnrolments()).enrolments;
    expect(enrolments.map((e) => e.languageId)).toEqual(['sq']); // nothing was made for Spanish
    expect((await inspectLocal(repo)).pendingUpload).toBe(1);
    // the account chooses Spanish: the waiting event goes, under that enrolment, and the Albanian one is not repeated
    const chosen = ok<{ enrolment: { enrolmentId: string } }>(await acct.api.enrol({ languageId: 'es', packId: 'pack:es', packVersion: '1', goals: [{ kind: 'reading' }] }));
    expect(await repo.uploadTo(acct.api)).toEqual({ sent: 1, duplicates: 0, failed: 0 });
    expect((await inspectLocal(repo)).waiting).toBe(0);
    const there = (await remoteEvents(acct.api)).filter((e) => e.producer.app !== 'repository');
    const label = (e: GoEvent): string => `${e.languageId}:${e.enrolmentId === chosen.enrolment.enrolmentId ? 'es-enrolment' : e.enrolmentId === acct.enrolmentId ? 'sq-enrolment' : '?'}`;
    expect(there.map(label).sort()).toEqual(['es:es-enrolment', 'sq:sq-enrolment']);
  });

  it('a network that is down leaves the events pending and says how many failed; a session the service does not know fails them all', async () => {
    const { acct, repo } = await world(3);
    const dead = new Proxy(acct.api, { get: (t, p) => (p === 'appendEvents' ? () => Promise.reject(new TypeError('Failed to fetch')) : (t as never)[p]) });
    expect(await repo.uploadTo(dead)).toEqual({ sent: 0, duplicates: 0, failed: 3 });
    expect((await inspectLocal(repo)).pendingUpload).toBe(3);
    expect(await repo.uploadTo(acct.api)).toEqual({ sent: 3, duplicates: 0, failed: 0 });

    const other = createRemote();
    const loggedOut = createInProcessApi(other.deps);
    const { repo: second } = await open(newArea(), other.clock);
    const who = await enrolSq(second);
    await append(second, lookup(who, 'shtëpi', other.clock));
    const r = await second.uploadTo(loggedOut);
    expect(r.sent).toBe(0);
    expect(r.failed).toBeGreaterThan(0);
  });

  it('what went to one account is never sent to another; events recorded afterwards go to whoever is signed in', async () => {
    const { remote, acct, repo, c, who } = await world(2);
    await repo.uploadTo(acct.api);
    const bob = await remote.signUp('bob@example.test', 'dev-A', ['sq']);
    expect(await repo.uploadTo(bob.api)).toEqual({ sent: 0, duplicates: 0, failed: 0 });
    c.tick();
    await append(repo, lookup(who, 'bukur', c));
    expect(await repo.uploadTo(bob.api)).toEqual({ sent: 1, duplicates: 0, failed: 0 });
    expect(await repo.uploadTo(acct.api)).toEqual({ sent: 0, duplicates: 0, failed: 0 });
  });

  it('events the host says an account already has are not sent', async () => {
    const { acct, repo, c, who } = await world(0);
    const e = lookup(who, 'shtëpi', c);
    c.tick();
    await append(repo, e);
    await markEventsOwned(repo, [e.id], acct.learnerId);
    expect(await repo.uploadTo(acct.api)).toEqual({ sent: 0, duplicates: 0, failed: 0 });
    expect((await inspectLocal(repo)).pendingUpload).toBe(0);
  });
});

describe('pull from an account', () => {
  async function twoDevices() {
    const remote = createRemote();
    const acct = await remote.signUp('ana@example.test', 'dev-A', ['sq']);
    const other = await remote.signIn('ana@example.test', 'dev-B');
    const { repo, area, c } = await open(newArea(), remote.clock, { deviceId: 'dev-A' });
    const who = await enrolSq(repo);
    return { remote, acct, other, repo, area, c, who };
  }

  it('brings in what another device recorded, once; it is never uploaded again, and the knowledge shows it', async () => {
    const { acct, other, repo, c } = await twoDevices();
    const b: Who = { learnerId: acct.learnerId, enrolmentId: acct.enrolmentId, deviceId: 'dev-B' };
    c.tick();
    const events = [lookup(b, 'zog', c), lookup(b, 'zog', c), lookup(b, 'mace', c)];
    ok(await other.appendEvents(events));
    const r = await repo.pullFrom(acct.api);
    expect(r).toEqual({ added: 3 });
    const mine = (await repo.exportEvents()).filter((e) => events.some((x) => x.id === e.id));
    expect(mine).toHaveLength(3);
    for (const e of mine) expect(e.learnerId).toBe((await repo.identity()).learnerId);
    const k = ok<{ knowledge: Array<{ unitId: string; dimensions: { exposure: { observations: number } } }> }>(await repo.api.knowledge(['lemma:sq:zog:NOUN']));
    expect(k.knowledge[0].dimensions.exposure.observations).toBe(2);
    expect(await repo.pullFrom(acct.api)).toEqual({ added: 0 });
    expect(await repo.uploadTo(acct.api)).toEqual({ sent: 0, duplicates: 0, failed: 0 });
    expect((await inspectLocal(repo)).fromRemote).toBe(3);
  });

  it('does not duplicate what this device already uploaded, and a pull from a reset cursor changes nothing', async () => {
    const { acct, repo, area, c, who } = await twoDevices();
    c.tick();
    await append(repo, lookup(who, 'shtëpi', c));
    await repo.uploadTo(acct.api);
    expect(await repo.pullFrom(acct.api)).toEqual({ added: 0 });
    await area.remove(await area.list('local-repo:pull'));
    expect(await repo.pullFrom(acct.api)).toEqual({ added: 0 });
    expect((await repo.exportEvents()).filter((e) => e.kind === 'SelectionLookedUp')).toHaveLength(1);
  });

  it('registers the surfaces it pulled, so the units exist on this device', async () => {
    const { acct, other, repo, c } = await twoDevices();
    const b: Who = { learnerId: acct.learnerId, enrolmentId: acct.enrolmentId, deviceId: 'dev-B' };
    c.tick();
    ok(await other.appendEvents([lookup(b, 'shtëpi', c)]));
    await repo.pullFrom(acct.api);
    expect(ok<{ unit: { unitId: string } }>(await repo.api.unit('form:sq:shtëpi')).unit.unitId).toBe('form:sq:shtëpi');
  });
});

describe('clear', () => {
  it('removes every row, makes a new learner, and the api the host holds keeps working', async () => {
    const { repo, area, c } = await open();
    const before = await repo.identity();
    const who = await enrolSq(repo);
    c.tick();
    await append(repo, lookup(who, 'shtëpi', c));
    const api = repo.api;
    await repo.clear();
    const after = await repo.identity();
    expect(after.learnerId).not.toBe(before.learnerId);
    expect(after.deviceId).toBe(before.deviceId);
    expect(repo.api).toBe(api);
    expect(await repo.exportEvents()).toEqual([]);
    expect(ok<{ knowledge: unknown[] }>(await api.knowledge()).knowledge).toEqual([]);
    expect(ok<{ enrolments: unknown[] }>(await api.listEnrolments()).enrolments).toEqual([]);
    expect(Object.keys(area.dump()).filter((k) => /event:|unit:|analysis:|enrolment:|uploaded:/.test(k))).toEqual([]);
    expect(JSON.stringify(area.dump())).not.toContain(before.learnerId);
    expect(area.dump()).toEqual({}); // nothing remains, not even an identity row, until the device records something again
    // usable again
    const again = await enrolSq(repo);
    await append(repo, lookup(again, 'libër', c));
    expect((await repo.exportEvents()).length).toBe(2);
  });
});
