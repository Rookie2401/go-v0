// @vitest-environment node
/**
 * Prompt 6 Part A §12 — GoTell acceptance over the REAL pieces: the Repository service (SQLite in memory, scrypt),
 * the real Albanian pack runtime and checker, GoTell's real profile, prompts, guidance, analyzer, assistance ladder,
 * authorship judgement, draft store over the service, versions, evidence and privacy. Fakes: the network (in-process),
 * the clock, a remote assistant that proposes a WRONG correction (to prove validation), and the KeyValueArea.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, validateEvent, type GoEvent, type UnitKnowledge } from '../../packages/repository-contract/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createLinguisticService } from '../../packages/repository-linguistics/src';
import { openSqliteStore } from '../../packages/repository-store/src';
import { createRepositoryApi, type RepositoryApi } from '../../packages/repository-service/src/api';
import { nodeCrypto } from '../../packages/repository-service/src/crypto-node';
import { handle } from '../../packages/repository-service/src/handler';
import { adaptLinguistics } from '../../packages/repository-service/src/linguistics-adapter';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { createPackRuntime, packFor } from '../../packages/language-packs/src';
import {
  createAnalyzer, createAssistance, createDraftStore, createGoTellWorkspace, createLocalDraftStore, createSyncingDraftStore, deleteDraft, exportDraft,
  exportLearnerWriting, guidanceFor, guidancePackFor, judgeAuthorship, judgeFromAssistance, newVersion, promptsFor, selectPrompt, writingEvidence, buildWriterProfile,
  RemoteAssistantGate, correctionRejected,
  type AssistanceStep, type DraftRecord, type RemoteAssistant, type WriterProfile,
} from '../../packages/gotell/src';
import { createMemoryArea } from '../../packages/repository-sync/src';

// ───────────────────────────── the real service ─────────────────────────────
let clockMs = Date.UTC(2026, 9, 9, 10, 0, 0);
const nowIso = (): string => new Date(clockMs).toISOString();
const tick = (ms = 60_000): void => { clockMs += ms; };
const store = openSqliteStore(':memory:', { now: nowIso, migrationsDir: path.resolve(__dirname, '../../packages/repository-store/migrations') });
const engine = createProjectionEngine({ store, now: nowIso });
const deps: ServiceDeps = { store, engine, linguistics: adaptLinguistics(createLinguisticService(store, { now: nowIso })), crypto: nodeCrypto, now: nowIso, log: () => {} };
const net = { down: false };
const serviceFetch = (async (input: RequestInfo | URL, init?: RequestInit) => { if (net.down) throw new TypeError('Failed to fetch'); return handle(new Request(input, init), deps); }) as typeof fetch;
const fileFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  const file = path.join(path.resolve(__dirname, '../../public'), decodeURIComponent(url.pathname));
  return fs.existsSync(file) ? new Response(fs.readFileSync(file), { status: 200 }) : new Response('not found', { status: 404 });
}) as typeof fetch;
const BASE = 'http://127.0.0.1:8790';
const PASSWORD = 'correct horse battery staple';
const ok = <T,>(r: { ok: boolean; status: number } & Record<string, unknown>): T => { if (!r.ok) throw new Error(`api ${r.status} ${String(r.error)}: ${String(r.message)}`); return r.data as T; };

interface Who { api: RepositoryApi; learnerId: string; enrolmentId: string; token: string; deviceId: string }
async function signUp(email: string, deviceId: string): Promise<Who> {
  const anon = createRepositoryApi({ baseUrl: BASE, fetch: serviceFetch });
  ok(await anon.createAccount({ email, password: PASSWORD }));
  const s = ok<{ token: string; learnerId: string }>(await anon.createSession({ email, password: PASSWORD, deviceId }));
  const api = createRepositoryApi({ baseUrl: BASE, fetch: serviceFetch, token: s.token });
  const e = ok<{ enrolment: { enrolmentId: string } }>(await api.enrol({ languageId: 'sq', packId: 'pack:sq', packVersion: '9', goals: [{ kind: 'writing' }] }));
  return { api, learnerId: s.learnerId, enrolmentId: e.enrolment.enrolmentId, token: s.token, deviceId };
}
const identityOf = (w: Who) => ({ learnerId: w.learnerId, enrolmentId: w.enrolmentId, deviceId: w.deviceId, languageId: 'sq' });
const profileSource = (w: Who) => ({
  knowledge: async () => ok<{ knowledge: UnitKnowledge[] }>(await w.api.knowledge([])).knowledge,
  events: async () => ok<{ events: GoEvent[] }>(await w.api.listEvents({ limit: 1000 })).events,
  preferences: async () => { const r = await w.api.preferences('sq'); return r.ok ? { explanationDepth: r.data.preferences.explanationDepth.value } : undefined; },
});

const manifest = packFor('sq')!;
const runtime = createPackRuntime(manifest, { fetch: fileFetch, baseUrl: 'http://assets.local/' });
const analyzer = createAnalyzer({ languageId: 'sq', runtime, manifest, now: nowIso });
const refusingConsent = { remoteAssistance: () => false };

/** A remote assistant that proposes a WRONG rewrite (adds content and flips the meaning) — validation must reject it. */
const wrongRemote: RemoteAssistant = {
  providerId: 'fake-remote',
  async propose({ sentence }) { return [{ suggested: `Unë nuk shkoj kurrë te libri i madh, ${sentence}`, explanation: 'rewritten', confidence: 0.9 }]; },
};

const blankRecord = (draftId: string, mode: DraftRecord['mode'], title: string, promptId?: string): DraftRecord => ({
  draftId, languageId: 'sq', mode, ...(promptId ? { promptId } : {}), title, text: '', versions: [], assistance: [], createdAt: nowIso(), updatedAt: nowIso(),
});

// the learner's own attempt: a genuine definiteness error the real checker detects ("te libër" → "te libri"), then a clean sentence
const ATTEMPT = 'Unë shkoj te libër. Unë lexoj librin.';
const REVISED = 'Unë shkoj te libri. Unë lexoj librin.';

let a: Who;
let b: Who;
beforeAll(async () => { a = await signUp('ana@tell.test', 'dev-A'); b = await signUp('bardh@tell.test', 'dev-B'); });
afterAll(async () => { await store.close(); });

describe('Prompt 6 §12 — GoTell for an Albanian learner, end to end', () => {
  let profile: WriterProfile;
  let draftId = 'draft-testimony-1';
  let record: DraftRecord;
  let revision = 0;
  let stepsShown: AssistanceStep[] = [];
  let hintText = '';

  it('1–2. loads the learner profile from the Repository and opens GoTell with no deck, no session and no review event', async () => {
    // GoLearn has recorded two encounters; nothing else
    ok(await a.api.lookup({ languageId: 'sq', surface: 'librin', sentence: 'Fëmijët lexojnë librin.' }));
    ok(await a.api.appendEvents([{
      id: 'enc:1', v: CONTRACT_VERSION, learnerId: a.learnerId, enrolmentId: a.enrolmentId, languageId: 'sq', at: nowIso(),
      producer: { app: 'golearn-ext', version: 'e2e', deviceId: a.deviceId }, kind: 'SelectionLookedUp', subject: { itemIds: ['lemma:sq:libër:NOUN'] },
      payload: { surface: 'librin', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'web-generic', helpShown: ['lemma'] }, dedupeKey: 'enc:1',
    }]));
    profile = await buildWriterProfile(profileSource(a), { learnerId: a.learnerId, languageId: 'sq' }, nowIso());
    expect(profile.band.level).toBe('first-sentences');
    expect(profile.productive).toEqual([]);                   // reading is not production
    expect(JSON.stringify(profile)).not.toMatch(/CEFR|\bB[12]\b|\bA[12]\b/);
    const ws = createGoTellWorkspace({ api: a.api, identity: { learnerId: a.learnerId }, languageId: 'sq' });
    const snap = await ws.init();
    expect(snap.notes).toEqual([]);
    expect(snap.drafts).toEqual([]);
    const events = ok<{ events: GoEvent[] }>(await a.api.listEvents({ limit: 100 })).events;
    expect(events.some((e) => ['CardAdded', 'CardReviewed'].includes(e.kind))).toBe(false); // no review history exists
  });

  it('3–4. a mission-related prompt is selected and the guidance fits a first-sentences writer without a model paragraph', () => {
    const prompts = promptsFor({ languageId: 'sq', teamId: 'albania', mode: 'missionary' });
    expect(prompts.length).toBeGreaterThan(0);
    const chosen = selectPrompt(prompts, profile, 'missionary', { random: () => 0.5 })!;
    expect(chosen.prompt.category).toMatch(/mission|personal|scripture/);
    expect(chosen.prompt.validation.reviewed).toBe(false);
    expect(chosen.reason.length).toBeGreaterThan(0);
    const g = guidanceFor(chosen.prompt, profile, guidancePackFor('sq'));
    expect(g.lead.length).toBeGreaterThan(0);
    expect(g.suggestions.length).toBeLessThanOrEqual(3);
    expect(g.honesty.join(' ')).toMatch(/not a model answer|nothing here is a model/i);
    expect(JSON.stringify(g)).not.toMatch(/CEFR/);
    record = blankRecord(draftId, 'missionary', 'Pse jemi këtu', chosen.prompt.promptId);
  });

  it('5–6. accepts the learner\'s own writing and identifies a genuine grammatical problem', () => {
    record = { ...record, text: ATTEMPT, updatedAt: nowIso() };
    const analysis = analyzer.analyzeDraft(draftId, ATTEMPT, profile);
    expect(analysis.sentences).toHaveLength(2);
    const [s1, s2] = analysis.sentences;
    expect(s1.issues.length).toBeGreaterThan(0);
    expect(s1.issues[0].category).toBe('definiteness');
    expect(s1.issues[0].class).toBe('grammatically-wrong');
    expect(s1.issues[0].provenance.source).toBe('adapter-checker');
    expect(s2.issues).toEqual([]);
    expect(s2.checkerCoverage.length).toBeGreaterThan(0); // "no issue found" is not "correct"
    expect(analysis.textHash).toBe(analyzer.analyzeDraft(draftId, ATTEMPT, profile).textHash); // the original is preserved, byte for byte
  });

  it('7. provides a hint (Levels 1–2) that names the type of problem, not the fix', async () => {
    const analysis = analyzer.analyzeDraft(draftId, ATTEMPT, profile);
    const assistance = createAssistance({ analyzer, consent: refusingConsent, now: nowIso });
    const r = await assistance.through(analysis, { draftId, sentenceIndex: 0, issueId: analysis.sentences[0].issues[0].issueId, level: 2, at: nowIso() }, []);
    if ('refused' in r) throw new Error(r.reason);
    expect(r.steps.map((s) => s.level)).toEqual([1, 2]);
    hintText = r.steps[1].content;
    expect(hintText.toLowerCase()).toMatch(/definite|the/);
    expect(r.steps.every((s) => !s.content.includes('te libri'))).toBe(true); // the fix is not revealed at Level 2
    stepsShown = r.steps;
    record = { ...record, assistance: stepsShown };
  });

  it('8. the learner revises independently after the hint; the analysis of the revision is clean', () => {
    const analysis = analyzer.analyzeDraft(draftId, REVISED, profile);
    expect(analysis.sentences[0].issues).toEqual([]);
    // the hint was shown for sentence 0 (every step records its sentence), so sentence 1 is independent BECAUSE no step touched it
    expect(stepsShown.every((s) => s.sentenceIndex === 0 && typeof s.sentenceHash === 'string')).toBe(true);
    expect(judgeAuthorship(analysis.sentences[0].text, stepsShown, { sentenceIndex: 0 })).toBe('after-hint');
    expect(judgeAuthorship(analysis.sentences[1].text, stepsShown, { sentenceIndex: 1 })).toBe('independent');
    record = { ...record, text: REVISED, updatedAt: nowIso() };
  });

  it('9. the correction (Level 4) is explained, validated by the checker, and never applied by itself', async () => {
    const analysis = analyzer.analyzeDraft('draft-x', ATTEMPT, profile);
    const assistance = createAssistance({ analyzer, consent: refusingConsent, now: nowIso });
    const r = await assistance.step(analysis, { draftId: 'draft-x', sentenceIndex: 0, issueId: analysis.sentences[0].issues[0].issueId, level: 4, at: nowIso() }, []);
    if ('refused' in r) throw new Error(r.reason);
    expect(r.level).toBe(4);
    expect(r.content).toContain('libri');
    const c = analysis.sentences[0].corrections[0];
    expect(c.validation.checkerClean).toBe(true);
    expect(c.validation.addsOnlyWithinSpans).toBe(true);
    expect(c.explanation.length).toBeGreaterThan(0);
    expect(analysis.sentences[0].text).toBe('Unë shkoj te libër.'); // the analysis still holds the learner's text
  });

  it('10–11. saving creates an immutable version with authorship, keeps the original attempt, and stores the draft privately in the Repository', async () => {
    // the first version is the attempt itself (independent), the second the revision after the hint
    let rec = newVersion(blankRecord(draftId, record.mode, record.title, record.promptId), ATTEMPT, () => ({ authorship: 'independent', assistance: [] }), a.deviceId, nowIso, 'first attempt');
    tick();
    rec = { ...rec, assistance: stepsShown };
    rec = newVersion(rec, REVISED, (text, _prior, idx) => { const authorship = judgeAuthorship(text, stepsShown, { sentenceIndex: idx }); return { authorship, assistance: authorship === 'independent' ? [] : [1, 2] }; }, a.deviceId, nowIso, 'after the hint');
    expect(rec.versions).toHaveLength(2);
    expect(rec.versions[0].text).toBe(ATTEMPT);                 // the original is preserved
    expect(rec.versions[1].sentences[0].authorship).toBe('after-hint');
    expect(rec.versions[1].sentences[1].authorship).toBe('independent');
    const frozen = JSON.stringify(rec.versions[0]);
    const draftStore = createDraftStore({ api: a.api, identity: identityOf(a), now: nowIso });
    const saved = await draftStore.save(rec, 0);
    expect(saved.ok).toBe(true);
    if (saved.ok) revision = saved.revision;
    expect(JSON.stringify(rec.versions[0])).toBe(frozen);
    record = rec;
    // it is a private document of the learner, not an event
    const docs = ok<{ documents: Array<{ docId: string }> }>(await a.api.listDocuments()).documents;
    expect(docs.map((d) => d.docId)).toContain(draftId);
    const events = ok<{ events: GoEvent[] }>(await a.api.listEvents({ limit: 1000 })).events;
    expect(JSON.stringify(events)).not.toContain('shkoj te');
  });

  it('12–13. writing evidence is qualified by authorship, carries no text, and updates the projection honestly', async () => {
    const version = record.versions[1];
    const analysis = analyzer.analyzeDraft(draftId, REVISED, profile);
    const ev = writingEvidence(record, version, identityOf(a), nowIso, { analysis, checkerCovers: (s) => s.issues.length === 0, packId: 'pack:sq' });
    expect(ev.events.some((e) => e.kind === 'DraftSaved')).toBe(true);
    const prods = ev.events.filter((e) => e.kind === 'ProductionRecorded');
    expect(prods).toHaveLength(2);
    const hinted = prods.find((e) => (e.payload as { authorship: string }).authorship === 'after-hint')!;
    const independent = prods.find((e) => (e.payload as { authorship: string }).authorship === 'independent')!;
    expect(hinted.payload).toMatchObject({ assisted: true });
    expect(independent.payload).toMatchObject({ assisted: false, usedCorrectly: true });
    for (const e of ev.events) expect(validateEvent(e)).toEqual([]);
    // unit ids may name a lemma (lemma:sq:lexoj:VERB); the sentences themselves must never appear
    expect(JSON.stringify(ev.events)).not.toMatch(/Unë shkoj te|lexoj librin|shkoj te libri/);
    expect(ev.summary.join(' ')).toMatch(/independent/);
    ok(await a.api.appendEvents(ev.events));
    const rows = await engine.knowledge(a.learnerId, ['lemma:sq:libër:NOUN']);
    const d = rows[0].dimensions;
    expect(d.contextualProduction.positive).toBeGreaterThan(0);      // the independent clean sentence counts
    expect(d.assistedRecognition.weight).toBeGreaterThan(0);          // the hinted sentence counts only as assisted
    expect(d.productiveRetrieval.weight).toBe(0);
    const ws = createGoTellWorkspace({ api: a.api, identity: { learnerId: a.learnerId }, languageId: 'sq' });
    await ws.init();
    expect(ws.wordsYouCanUse().map((w) => w.unitId)).toContain('lemma:sq:libër:NOUN');
  });

  it('14–15. the document reopens with its versions and exports in three formats', async () => {
    const draftStore = createDraftStore({ api: a.api, identity: identityOf(a), now: nowIso });
    const loaded = await draftStore.load(draftId);
    expect(loaded).toBeDefined();
    expect(loaded!.revision).toBe(revision);
    expect(loaded!.record.text).toBe(REVISED);
    expect(loaded!.record.versions.map((v) => v.text)).toEqual([ATTEMPT, REVISED]);
    const json = exportDraft(loaded!.record, 'json');
    expect(JSON.parse(json).versions).toHaveLength(2);
    expect(exportDraft(loaded!.record, 'text')).toContain(REVISED);
    expect(exportDraft(loaded!.record, 'markdown')).toContain(loaded!.record.title);
    const all = await exportLearnerWriting(a.api);
    expect(JSON.stringify(all)).toContain(draftId);
    expect(JSON.stringify(all)).not.toContain(a.token);
  });
});

describe('a learner with no GoReview history', () => {
  it('has the full GoTell workflow: profile, prompt, analysis, hint, save, evidence, export', async () => {
    const events = ok<{ events: GoEvent[] }>(await b.api.listEvents({ limit: 100 })).events;
    expect(events.filter((e) => e.kind !== 'EnrolmentChanged')).toEqual([]);
    const p = await buildWriterProfile(profileSource(b), { learnerId: b.learnerId, languageId: 'sq' }, nowIso());
    const prompt = selectPrompt(promptsFor({ languageId: 'sq', mode: 'testimony', category: 'testimony' }), p, 'testimony', { random: () => 0.1 })!.prompt;
    expect(prompt.category).toBe('testimony');
    expect(prompt.instruction).toMatch(/true for you/i);
    const analysis = analyzer.analyzeDraft('b-1', 'Unë kam një shtëpi e madh.', p);
    expect(analysis.sentences[0].issues[0].category).toBe('agreement');
    const assistance = createAssistance({ analyzer, consent: refusingConsent, now: nowIso });
    const hint = await assistance.step(analysis, { draftId: 'b-1', sentenceIndex: 0, issueId: analysis.sentences[0].issues[0].issueId, level: 2, at: nowIso() }, []);
    expect('refused' in hint).toBe(false);
    let rec = newVersion(blankRecord('b-1', 'testimony', 'Historia ime', prompt.promptId), 'Unë kam një shtëpi e madh.', () => ({ authorship: 'independent', assistance: [] }), b.deviceId, nowIso);
    const st = createDraftStore({ api: b.api, identity: identityOf(b), now: nowIso });
    expect((await st.save(rec, 0)).ok).toBe(true);
    const ev = writingEvidence(rec, rec.versions[0], identityOf(b), nowIso, { analysis });
    ok(await b.api.appendEvents(ev.events));
    expect((await st.load('b-1'))!.record.text).toBe('Unë kam një shtëpi e madh.');
    rec = rec; // kept for the privacy test below
  });
});

describe('edge cases', () => {
  it('per-sentence authorship: a hint on sentence 0 only, sentence 1 edited → sentence 1 is independent, sentence 0 after-hint (real engine, real judge)', async () => {
    const analysis = analyzer.analyzeDraft('ps-1', 'Unë shkoj te libër. Unë lexoj librin.');
    const assistance = createAssistance({ analyzer, consent: refusingConsent, now: nowIso });
    const r = await assistance.through(analysis, { draftId: 'ps-1', sentenceIndex: 0, issueId: analysis.sentences[0].issues[0].issueId, level: 2, at: nowIso() }, []);
    if ('refused' in r) throw new Error(r.reason);
    let rec = newVersion(blankRecord('ps-1', 'free', 'Dy fjali'), 'Unë shkoj te libër. Unë lexoj librin.', judgeFromAssistance([]), a.deviceId, nowIso);
    rec = { ...rec, assistance: r.steps };
    rec = newVersion(rec, 'Unë shkoj te libri. Unë lexoj gazetën.', judgeFromAssistance(rec.assistance), a.deviceId, nowIso, 'hint on sentence 0, sentence 1 rewritten');
    expect(rec.versions[1].sentences.map((s) => s.authorship)).toEqual(['after-hint', 'independent']);
    expect(rec.versions[1].sentences[1].assistance).toEqual([]);
    const ev = writingEvidence(rec, rec.versions[1], identityOf(a), nowIso, { analysis });
    const prods = ev.events.filter((e) => e.kind === 'ProductionRecorded').map((e) => (e.payload as { authorship: string; assisted: boolean }));
    expect(prods.map((x) => x.authorship)).toEqual(['after-hint', 'independent']);
    expect(prods.map((x) => x.assisted)).toEqual([true, false]);
  });

  it('a wrong remote correction is rejected by validation; a learner can reject feedback; an unclear sentence is marked uncertain', async () => {
    const consent = { remoteAssistance: () => true };
    const analysis = analyzer.analyzeDraft('r-1', ATTEMPT, undefined);
    const assistance = createAssistance({ analyzer, remote: new RemoteAssistantGate(wrongRemote, consent), consent, now: nowIso });
    const model = await assistance.step(analysis, { draftId: 'r-1', sentenceIndex: 0, level: 6, at: nowIso() }, []);
    // the remote's rewrite adds content and flips the negation: it must not be shown as a model; a pack sentence or a refusal comes instead
    if (!('refused' in model)) { expect(model.source).not.toBe('remote-assistant'); expect(model.content).not.toContain('kurrë'); }
    const gated = new RemoteAssistantGate(wrongRemote, refusingConsent);
    await expect(gated.propose({ languageId: 'sq', sentence: ATTEMPT })).rejects.toThrow();
    const issue = analysis.sentences[0].issues[0];
    const rej = correctionRejected({ correctionId: analysis.sentences[0].corrections[0]?.correctionId ?? 'c', issueIds: [issue.issueId], categories: [issue.category] }, identityOf(a), nowIso);
    expect(rej.kind).toBe('CorrectionRejected');
    expect(validateEvent(rej)).toEqual([]);
    const unclear = analyzer.analyzeDraft('r-2', 'Unë shkoj me shoku.', undefined);
    expect(unclear.sentences[0].issues[0]?.class).toBe('uncertain-analysis');
  });

  it('disconnected operation: the draft is saved on the device, then pushed once the account is reachable; two devices never lose text', async () => {
    const areaA = createMemoryArea();
    const localA = createLocalDraftStore(areaA, { identity: identityOf(a), now: nowIso });
    const remoteA = createDraftStore({ api: a.api, identity: identityOf(a), now: nowIso });
    const syncA = createSyncingDraftStore({ local: localA, remote: remoteA, now: nowIso });
    const rec = newVersion(blankRecord('off-1', 'free', 'Offline'), 'Unë lexoj librin.', () => ({ authorship: 'independent', assistance: [] }), a.deviceId, nowIso);
    net.down = true;
    const saved = await syncA.save(rec, 0);
    expect(saved.ok).toBe(true);
    expect((await syncA.pendingPush())).toContain('off-1');
    expect((await localA.load('off-1'))!.record.text).toBe('Unë lexoj librin.');
    net.down = false;
    await syncA.push();
    expect(await syncA.pendingPush()).toEqual([]);
    expect((await remoteA.load('off-1'))!.record.text).toBe('Unë lexoj librin.');
    // device B edits the same draft on the account while device A edits it offline: both texts survive
    const remoteB = createDraftStore({ api: a.api, identity: { ...identityOf(a), deviceId: 'dev-A2' }, now: nowIso });
    const onServer = (await remoteB.load('off-1'))!;
    tick();
    expect((await remoteB.save({ ...onServer.record, text: 'Unë lexoj librin çdo ditë.', updatedAt: nowIso() }, onServer.revision)).ok).toBe(true);
    net.down = true;
    const mine = (await localA.load('off-1'))!;
    tick();
    expect((await syncA.save({ ...mine.record, text: 'Unë lexoj librin në shtëpi.', updatedAt: nowIso() }, mine.revision)).ok).toBe(true);
    net.down = false;
    await syncA.push();
    const after = await remoteA.list();
    const texts = await Promise.all(after.map(async (d) => (await remoteA.load(d.docId))!.record.text));
    expect(texts).toContain('Unë lexoj librin çdo ditë.');
    expect(texts).toContain('Unë lexoj librin në shtëpi.'); // kept as a conflict copy, never discarded
  });

  it('private documents: another learner cannot read or delete them; deletion by the owner removes the body', async () => {
    const theirs = await b.api.getDocument('draft-testimony-1');
    expect(theirs.ok).toBe(false);
    expect([403, 404]).toContain(theirs.ok ? 0 : theirs.status);
    const del = await b.api.deleteDocument('draft-testimony-1');
    expect(del.ok).toBe(false);
    const bExport = await exportLearnerWriting(b.api);
    expect(JSON.stringify(bExport)).not.toContain('draft-testimony-1');
    const st = createDraftStore({ api: a.api, identity: identityOf(a), now: nowIso });
    expect((await deleteDraft(st, 'draft-testimony-1')).ok).toBe(true);
    expect(await st.load('draft-testimony-1')).toBeUndefined();
    const gone = ok<{ documents: Array<{ docId: string }> }>(await a.api.listDocuments()).documents;
    expect(gone.map((d) => d.docId)).not.toContain('draft-testimony-1');
  });
});
