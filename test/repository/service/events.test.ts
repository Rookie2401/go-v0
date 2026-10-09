// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHarness, lookupEvent, makeEvent, productionEvent, raw, signUp } from './fakes';

describe('POST /events', () => {
  it('stores a valid batch, folds it, and reports outcomes', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const who = { learnerId: s.learnerId, enrolmentId: s.enrolmentId };
    const before = h.engine.projectCalls.length;
    const r = await s.api.appendEvents([makeEvent(who), lookupEvent(who)]);
    expect(r.ok && r.data.outcomes.map((o) => o.stored)).toEqual([true, true]);
    expect(r.ok && r.data).toMatchObject({ stored: 2, duplicates: 0, head: 3, projected: true });
    expect(h.engine.projectCalls.length).toBe(before + 1);
    expect(h.engine.projectCalls.at(-1)).toBe(s.learnerId);
  });

  it('rejects a batch with any invalid event whole, with issues per index', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const who = { learnerId: s.learnerId, enrolmentId: s.enrolmentId };
    const good = makeEvent(who);
    const bad = makeEvent(who, { kind: 'CardReviewed', payload: { cardKind: 'recall', grade: 'good' } as never });
    const unknown = makeEvent(who, { kind: 'NoSuchKind' as never });
    const head = await h.store.head(s.learnerId);
    const calls = h.store.appendCalls;
    const r = await raw(h, 'POST', '/events', { token: s.token, body: { events: [good, bad, unknown] } });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('invalid-events');
    expect(r.body.issues.map((i: { index: number }) => i.index)).toEqual([1, 2]);
    expect(r.body.issues[0]).toMatchObject({ id: bad.id, issues: expect.arrayContaining([expect.objectContaining({ path: expect.any(String), message: expect.any(String) })]) });
    expect(h.store.appendCalls).toBe(calls);
    expect(await h.store.head(s.learnerId)).toBe(head);
    expect(await h.store.get(s.learnerId, good.id)).toBeUndefined(); // the good one was not stored either
  });

  it('is idempotent across retries: the same batch twice is stored once', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const who = { learnerId: s.learnerId, enrolmentId: s.enrolmentId };
    const batch = [makeEvent(who), makeEvent(who, { dedupeKey: 'card:c1:2026-10-08T09' })];
    const first = await s.api.appendEvents(batch);
    const second = await s.api.appendEvents(batch);
    expect(first.ok && first.data.stored).toBe(2);
    expect(second.ok && second.data).toMatchObject({ stored: 0, duplicates: 2 });
    expect(second.ok && second.data.outcomes.every((o) => !o.stored && o.duplicateOf)).toBe(true);
    // a different id with the same dedupeKey is also a duplicate
    const third = await s.api.appendEvents([makeEvent(who, { dedupeKey: 'card:c1:2026-10-08T09' })]);
    expect(third.ok && third.data.duplicates).toBe(1);
    expect((await h.store.list({ learnerId: s.learnerId, kinds: ['CardReviewed'] })).length).toBe(2);
  });

  it('drops client-supplied recordedAt and seq; the store stamps them', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const e = { ...makeEvent({ learnerId: s.learnerId, enrolmentId: s.enrolmentId }), recordedAt: '2001-01-01T00:00:00.000Z', seq: 9999 };
    expect((await raw(h, 'POST', '/events', { token: s.token, body: { events: [e] } })).status).toBe(200);
    const stored = await h.store.get(s.learnerId, e.id);
    expect(stored?.recordedAt).toBe(h.clock.now());
    expect(stored?.seq).not.toBe(9999);
  });

  it('refuses an empty list, a non-list and more than 500 events', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    for (const events of [[], 'x', undefined]) expect((await raw(h, 'POST', '/events', { token: s.token, body: { events } })).status).toBe(422);
    const many = Array.from({ length: 501 }, () => makeEvent({ learnerId: s.learnerId }));
    expect((await raw(h, 'POST', '/events', { token: s.token, body: { events: many } })).status).toBe(422);
  });

  it('keeps the events when the projection fails, and says so without leaking the cause', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    h.engine.failProject = true;
    const e = makeEvent({ learnerId: s.learnerId, enrolmentId: s.enrolmentId });
    const r = await raw(h, 'POST', '/events', { token: s.token, body: { events: [e] } });
    expect(r.status).toBe(200);
    expect(r.body.projected).toBe(false);
    expect(JSON.stringify(r.body)).not.toContain('boom');
    expect(await h.store.get(s.learnerId, e.id)).toBeDefined();
  });
});

describe('GET /events', () => {
  it('pages by seq and filters by kind, unit and limit', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const who = { learnerId: s.learnerId, enrolmentId: s.enrolmentId };
    await s.api.appendEvents([
      makeEvent(who), makeEvent(who), lookupEvent(who), makeEvent(who, { subject: { itemIds: ['lemma:sq:zog:NOUN'] } }),
    ]);
    const all = await s.api.listEvents();
    expect(all.ok && all.data.events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(all.ok && all.data.head).toBe(5);
    const page = await s.api.listEvents({ afterSeq: 2, limit: 2 });
    expect(page.ok && page.data.events.map((e) => e.seq)).toEqual([3, 4]);
    const kinds = await s.api.listEvents({ kinds: ['SelectionLookedUp', 'EnrolmentChanged'] });
    expect(kinds.ok && kinds.data.events.map((e) => e.kind)).toEqual(['EnrolmentChanged', 'SelectionLookedUp']);
    const unit = await s.api.listEvents({ unitId: 'lemma:sq:zog:NOUN' });
    expect(unit.ok && unit.data.events).toHaveLength(1);
    expect((await raw(h, 'GET', '/events?limit=abc', { token: s.token })).status).toBe(422);
    expect((await raw(h, 'GET', '/events?afterSeq=-1', { token: s.token })).status).toBe(422);
    // an over-large limit is clamped, not an error
    expect((await raw(h, 'GET', '/events?limit=100000', { token: s.token })).status).toBe(200);
  });
});

describe('POST /reviews', () => {
  it('takes the review and listening families and nothing else', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const who = { learnerId: s.learnerId, enrolmentId: s.enrolmentId };
    const listening = makeEvent(who, { kind: 'ListeningAssessed', producer: { app: 'gopractice-review', version: '1', deviceId: 'dev-1' }, payload: { stimulus: 'word', voice: 'recorded', answerShownBefore: false, correct: true, responseMode: 'choice' } });
    const ok = await s.api.submitReviews([makeEvent(who), listening]);
    expect(ok.ok && ok.data.stored).toBe(2);
    const wrong = await raw(h, 'POST', '/reviews', { token: s.token, body: { events: [makeEvent(who), lookupEvent(who)] } });
    expect(wrong.status).toBe(422);
    expect(wrong.body.issues).toHaveLength(1);
    expect(wrong.body.issues[0].index).toBe(1);
    expect(wrong.body.issues[0].issues[0].message).toMatch(/review and listening/);
    expect((await h.store.list({ learnerId: s.learnerId, kinds: ['SelectionLookedUp'] })).length).toBe(0);
  });
});

describe('POST /writing', () => {
  it('puts the text in the document store and only the observation in the log', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const obs = productionEvent({ learnerId: s.learnerId, enrolmentId: s.enrolmentId });
    const r = await s.api.submitWriting({
      observation: obs,
      document: { doc: { docId: 'd1', learnerId: s.learnerId, languageId: 'sq', kind: 'draft', body: 'UNIQUE DRAFT TEXT ZQXJ', revision: 0, deviceId: 'x', updatedAt: 'x' }, expectedRevision: 0 },
    });
    expect(r.ok && r.data.outcome.stored).toBe(true);
    expect(r.ok && r.data.document).toMatchObject({ docId: 'd1', revision: 1, deviceId: 'dev-1' });
    expect(JSON.stringify(r)).not.toContain('ZQXJ');
    const doc = await s.api.getDocument('d1');
    expect(doc.ok && doc.data.document.body).toBe('UNIQUE DRAFT TEXT ZQXJ');
    // the event log holds no draft text
    expect(JSON.stringify(await h.store.list({ learnerId: s.learnerId }))).not.toContain('ZQXJ');
  });

  it('refuses an observation that carries the text, in the payload or the subject', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const who = { learnerId: s.learnerId, enrolmentId: s.enrolmentId };
    const calls = h.store.appendCalls;
    const inPayload = productionEvent(who, { payload: { mode: 'free', assisted: false, assistance: [], usedCorrectly: 'unjudged', text: 'Unë lexoj një libër' } });
    const r1 = await raw(h, 'POST', '/writing', { token: s.token, body: { observation: inPayload } });
    expect(r1.status).toBe(422);
    expect(JSON.stringify(r1.body.issues)).toContain('payload.text');
    const inSubject = productionEvent(who, { subject: { sentenceText: 'Unë lexoj' } as never });
    expect((await raw(h, 'POST', '/writing', { token: s.token, body: { observation: inSubject } })).status).toBe(422);
    const viaBody = productionEvent(who, { payload: { mode: 'free', assisted: false, assistance: [], usedCorrectly: true, body: 'x' } });
    expect((await raw(h, 'POST', '/writing', { token: s.token, body: { observation: viaBody } })).status).toBe(422);
    expect(h.store.appendCalls).toBe(calls);
  });

  it('takes only a ProductionRecorded observation', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const r = await raw(h, 'POST', '/writing', { token: s.token, body: { observation: makeEvent({ learnerId: s.learnerId, enrolmentId: s.enrolmentId }) } });
    expect(r.status).toBe(422);
    expect((await raw(h, 'POST', '/writing', { token: s.token, body: {} })).status).toBe(422);
  });

  it('a document conflict is 409 with the current version and the observation is not stored', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    expect((await s.api.putDocument('d1', { languageId: 'sq', kind: 'draft', body: 'v1' }, 0)).ok).toBe(true);
    const obs = productionEvent({ learnerId: s.learnerId, enrolmentId: s.enrolmentId });
    const r = await raw(h, 'POST', '/writing', { token: s.token, body: { observation: obs, document: { doc: { docId: 'd1', languageId: 'sq', kind: 'draft', body: 'stale write' }, expectedRevision: 0 } } });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('conflict');
    expect(r.body.current).toMatchObject({ docId: 'd1', revision: 1, body: 'v1' });
    expect(await h.store.get(s.learnerId, obs.id)).toBeUndefined();
  });
});

describe('POST /lookup', () => {
  it('resolves through linguistics and keeps no sentence text anywhere in the store', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const sentence = 'Zogu i vogël këndon një këngë të bukur në mëngjes.';
    const r = await s.api.lookup({ languageId: 'sq', surface: 'zogu', sentence, selStart: 0, selEnd: 4 });
    expect(r.ok && r.data.formId).toBe('form:sq:zogu');
    // the sentence reached the analyser, with its hash, and nothing else
    expect(h.linguistics.resolveCalls).toHaveLength(1);
    expect(h.linguistics.resolveCalls[0]).toMatchObject({ sentence, selStart: 0, selEnd: 4, sentenceKey: h.crypto.sha256(sentence) });
    expect(r.ok && r.data.sentenceKey).toBe(h.crypto.sha256(sentence));
    expect(h.store.dump()).not.toContain('vogël');
    expect(h.store.dump()).not.toContain(sentence);
    expect(h.store.dump()).toContain(h.crypto.sha256(sentence)); // the key is there: the analysis was stored
    expect(JSON.stringify(r)).not.toContain('vogël');
  });

  it('uses a given sentenceKey as it is, and validates its inputs', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const r = await s.api.lookup({ languageId: 'sq', surface: 'zogu', sentenceKey: 'abc123' });
    expect(r.ok && r.data.sentenceKey).toBe('abc123');
    expect(h.linguistics.resolveCalls[0]).not.toHaveProperty('sentence');
    const bad = (body: unknown) => raw(h, 'POST', '/lookup', { token: s.token, body });
    expect((await bad({ surface: 'x' })).status).toBe(422);
    expect((await bad({ languageId: 'sq', surface: 'a '.repeat(80) })).status).toBe(422);
    expect((await bad({ languageId: 'sq', surface: 'x', selStart: -1 })).status).toBe(422);
    expect((await bad({ languageId: 'sq', surface: 'x', sentence: 'y'.repeat(5001) })).status).toBe(422);
  });
});

describe('POST /corrections', () => {
  it("corrects through linguistics as the learner and records an AnalysisCorrected event", async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const r = await s.api.correct({ formId: 'form:sq:librin', lexemeId: 'lemma:sq:libër:NOUN', reason: 'wrong lemma' });
    expect(r.ok && r.data.outcome.stored).toBe(true);
    expect(h.linguistics.correctCalls[0]).toMatchObject({ formId: 'form:sq:librin', now: h.clock.now(), correction: { by: 'learner', learnerId: s.learnerId, lexemeId: 'lemma:sq:libër:NOUN', reason: 'wrong lemma' } });
    const [ev] = await h.store.list({ learnerId: s.learnerId, kinds: ['AnalysisCorrected'] });
    expect(ev).toMatchObject({ enrolmentId: s.enrolmentId, languageId: 'sq', producer: { app: 'repository' }, payload: { formId: 'form:sq:librin', by: 'learner', correctedLexemeId: 'lemma:sq:libër:NOUN' } });
    expect(ev.payload).toHaveProperty('analysisId');
  });

  it('needs an enrolment in the language and something to correct', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com', 'dev-1', { enrol: false });
    const r = await raw(h, 'POST', '/corrections', { token: s.token, body: { formId: 'form:sq:librin', lexemeId: 'lemma:sq:libër:NOUN' } });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('no-enrolment');
    expect(h.linguistics.correctCalls).toEqual([]);
    expect((await raw(h, 'POST', '/corrections', { token: s.token, body: { formId: 'form:sq:librin' } })).status).toBe(422);
  });
});

describe('enrolments, packs, units, knowledge, preferences', () => {
  it('enrolling appends an EnrolmentChanged event by the repository', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com', 'dev-1', { enrol: false });
    const r = await s.api.enrol({ languageId: 'sq', varietyId: 'sq-standard', packId: 'pack:sq', packVersion: '9', goals: [{ kind: 'reading', priority: 1 }, { kind: 'scripture' }] });
    expect(r.ok && r.data.enrolment).toMatchObject({ learnerId: s.learnerId, languageId: 'sq', varietyId: 'sq-standard', packVersion: '9' });
    const [ev] = await h.store.list({ learnerId: s.learnerId, kinds: ['EnrolmentChanged'] });
    expect(ev).toMatchObject({ producer: { app: 'repository', deviceId: 'dev-1' }, enrolmentId: r.ok && r.data.enrolment.enrolmentId, languageId: 'sq' });
    const list = await s.api.listEnrolments();
    expect(list.ok && list.data.enrolments).toHaveLength(1);
    expect((await raw(h, 'POST', '/enrolments', { token: s.token, body: { languageId: 'sq' } })).status).toBe(422);
    expect((await raw(h, 'POST', '/enrolments', { token: s.token, body: { languageId: 'sq', packId: 'p', packVersion: '1', goals: [{ kind: 'bogus' }] } })).status).toBe(422);
  });

  it('lists packs by language, looks a unit up (percent-encoded id), and 404s an unknown one', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    await h.store.putPack({ packId: 'pack:sq', languageId: 'sq', version: '1', analyzerId: 'a', coverage: { notes: [] }, licences: [], reviewStatus: 'machine-drafted' });
    await h.store.putPack({ packId: 'pack:de', languageId: 'de', version: '1', analyzerId: 'a', coverage: { notes: [] }, licences: [], reviewStatus: 'machine-drafted' });
    const sq = await s.api.packs('sq');
    expect(sq.ok && sq.data.packs).toHaveLength(1);
    const everything = await s.api.packs();
    expect(everything.ok && everything.data.packs).toHaveLength(2);
    await s.api.lookup({ languageId: 'sq', surface: 'Shtëpinë' });
    const u = await s.api.unit('form:sq:shtëpinë');
    expect(u.ok && u.data.unit.label).toBe('Shtëpinë');
    expect(u.ok && u.data.analyses).toHaveLength(1);
    const missing = await s.api.unit('lemma:sq:nuk:NOUN');
    expect(!missing.ok && missing.status).toBe(404);
  });

  it('serves knowledge (optionally for some units) and preferences for the learner only', async () => {
    const h = createHarness();
    const s = await signUp(h, 'ana@example.com');
    const row = (unitId: string) => ({ learnerId: s.learnerId, unitId, languageId: 'sq', dimensions: {}, retention: { estimate: 0, halfLifeDays: 1, basedOn: 'none' }, uncertainty: 1, modelVersion: 'fake-1', basis: { events: 0 } }) as never;
    await h.store.putKnowledge([row('a'), row('b'), row('c')]);
    const all = await s.api.knowledge();
    expect(all.ok && all.data.knowledge.map((k) => k.unitId).sort()).toEqual(['a', 'b', 'c']);
    const some = await raw(h, 'GET', '/knowledge?unitIds=a,c', { token: s.token });
    expect(some.body.knowledge.map((k: { unitId: string }) => k.unitId).sort()).toEqual(['a', 'c']);
    const p = await s.api.preferences('sq');
    expect(p.ok && p.data.preferences).toMatchObject({ learnerId: s.learnerId, languageId: 'sq' });
    const many = Array.from({ length: 201 }, (_, i) => `u${i}`).join(',');
    expect((await raw(h, 'GET', `/knowledge?unitIds=${many}`, { token: s.token })).status).toBe(422);
    expect((await raw(h, 'GET', '/candidates', { token: s.token })).status).toBe(422);
  });
});
