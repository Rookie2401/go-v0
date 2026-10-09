// @vitest-environment node
/**
 * Privacy audit (8) remote-AI and remote-speech consent: nothing leaves without consent, and consent is a recorded fact.
 *
 * Real pieces: the service (checked to make no outbound call at all), GoTell's assistance ladder with the real Albanian checker
 * and a SPY standing for a remote assistant, GoTell's consent switch, GoListen over the real Albanian registry with a spy for
 * the network, the extension worker and GoPractice's context for the settings that hold the remote-speech switch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { createPackRuntime, packFor } from '../../packages/language-packs/src';
import {
  RemoteAssistantGate, createAnalyzer, createAssistance, createRemoteConsent, type RemoteAssistant,
} from '../../packages/gotell/src';
import { createAudioDeps } from '../../packages/gopractice/audio';
import { albanianRegistry } from '../../packages/golisten/src';
import {
  PASSWORD, STORE_KINDS, createDevice, createNet, createPracticeDevice, createStack, lookup, serverEvents, signUp,
  type Stack, type StoreKind,
} from './privacy.support';
import { accountFor, createWorkerRig } from './offline.support';
import { createContext as createSetupContext } from '../../packages/golearn-extension/app/context';
import { setRemoteSpeechConsent as setupSetRemoteSpeech } from '../../packages/golearn-extension/app/consent';
import { setRemoteSpeechConsent as practiceSetRemoteSpeech } from '../../packages/gopractice/screens/consent';
import type { ChromeApi } from '../../packages/golearn-extension/src/platform';

const stacks: Stack[] = [];
const make = (kind: StoreKind): Stack => { const s = createStack(kind); stacks.push(s); return s; };
afterEach(async () => { vi.restoreAllMocks(); while (stacks.length) await stacks.pop()!.close(); });

const ROOT = path.resolve(__dirname, '../..');
const now = () => new Date('2026-10-09T08:00:00.000Z');
const fileFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://assets.local/');
  const file = path.join(ROOT, 'public', decodeURIComponent(url.pathname));
  return fs.existsSync(file) ? new Response(fs.readFileSync(file), { status: 200 }) : new Response('not found', { status: 404 });
}) as typeof fetch;

describe.each(STORE_KINDS)('the Repository makes no outbound call — %s store', (kind) => {
  it('a whole life of the service (sign-up, sign-in, enrolment, events, lookup, writing, sync, export, deletion) makes zero network calls', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com', 'phone');
    await a.api.appendEvents([lookup(a)]);
    await a.api.lookup({ languageId: 'sq', surface: 'librin', sentence: 'Fëmijët lexojnë librin.' });
    await a.api.putDocument('d1', { languageId: 'sq', kind: 'draft', body: 'text', title: 't' }, 0);
    await a.api.syncPull({ deviceId: a.deviceId, afterSeq: 0 });
    await a.api.exportAll();
    await a.api.knowledge(); await a.api.candidates(a.enrolmentId, 10); await a.api.preferences('sq');
    await a.api.deleteMe(a.email);
    expect(spy).not.toHaveBeenCalled();
  });

  it('the service, store, engine and linguistics source contain no outbound network primitive', () => {
    const files = ['repository-service/src/handler.ts', 'repository-service/src/deps.ts', 'repository-service/src/linguistics-adapter.ts', 'repository-service/src/crypto-node.ts',
      ...fs.readdirSync(path.join(ROOT, 'packages/repository-store/src')).map((f) => `repository-store/src/${f}`),
      ...fs.readdirSync(path.join(ROOT, 'packages/repository-engine/src')).map((f) => `repository-engine/src/${f}`),
      ...fs.readdirSync(path.join(ROOT, 'packages/repository-linguistics/src')).map((f) => `repository-linguistics/src/${f}`)];
    const outbound = /\bfetch\s*\(|XMLHttpRequest|\bhttps?\.(request|get)\b|node:(http|https|net|tls|dgram|dns)\b|WebSocket|sendBeacon|child_process/;
    for (const f of files) {
      if (!f.endsWith('.ts')) continue;
      const src = fs.readFileSync(path.join(ROOT, 'packages', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(src, `${f} must not reach out to the network`).not.toMatch(outbound);
    }
  });
});

describe('GoTell remote assistance: nothing is sent without consent, and the consent is recorded before it takes effect', () => {
  const manifest = packFor('sq')!;
  const runtime = createPackRuntime(manifest, { fetch: fileFetch, baseUrl: 'http://assets.local/' });
  const analyzer = createAnalyzer({ languageId: 'sq', runtime, manifest, now });
  // a sentence whose level-6 model cannot come from the learner or the pack, so the ladder would ask the remote assistant if (and only if) consent allows
  const TEXT = 'Unë shkoj me shoku.';
  const calls: string[] = [];
  const remote: RemoteAssistant = {
    providerId: 'spy-remote',
    async propose({ sentence }) { calls.push(sentence); return [{ suggested: 'Unë shkoj me shokun.', explanation: 'definite form', confidence: 0.9 }]; },
  };
  const identity = { learnerId: 'L1', enrolmentId: 'E1', deviceId: 'D1', languageId: 'sq' };
  const climb = async (consent: { remoteAssistance(): boolean }): Promise<void> => {
    const analysis = analyzer.analyzeDraft('c1', TEXT, undefined);
    const assistance = createAssistance({ analyzer, remote: new RemoteAssistantGate(remote, consent), consent, now });
    const issueId = analysis.sentences[0].issues[0].issueId;
    for (const level of [1, 2, 3, 4, 5, 6] as const) await assistance.step(analysis, { draftId: 'c1', sentenceIndex: 0, issueId, level, at: now().toISOString() }, []);
  };

  it('by default (no stored value) the switch is off and climbing the whole ladder, level 6 included, sends nothing anywhere', async () => {
    calls.length = 0;
    const spy = vi.spyOn(globalThis, 'fetch');
    const consent = createRemoteConsent({ identity, appVersion: 't', initial: undefined, persist: async () => undefined, record: async () => ({ refused: [] }), now, newId: () => 'x' });
    expect(consent.value()).toBe(false);
    expect(consent.gate.remoteAssistance()).toBe(false);
    await climb(consent.gate);
    expect(calls).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('anything but the boolean true in storage is off ("true", 1, {}, a Promise)', () => {
    for (const initial of ['true', 'yes', 1, {}, [], Promise.resolve(true), null, undefined, false]) {
      const c = createRemoteConsent({ identity, appVersion: 't', initial, persist: async () => undefined, record: async () => ({ refused: [] }), now, newId: () => 'x' });
      expect(c.gate.remoteAssistance(), String(initial)).toBe(false);
    }
    expect(createRemoteConsent({ identity, appVersion: 't', initial: true, persist: async () => undefined, record: async () => ({ refused: [] }), now, newId: () => 'x' }).gate.remoteAssistance()).toBe(true);
  });

  it('turning ON records ConsentGiven first; if the record is refused the switch stays off and nothing is sent', async () => {
    calls.length = 0;
    const order: string[] = [];
    const refusing = createRemoteConsent({
      identity, appVersion: 't', initial: false, now, newId: () => 'r1',
      persist: async (on) => { order.push(`persist:${on}`); },
      record: async (evs) => { order.push(`record:${evs[0].kind}`); return { refused: [{ id: evs[0].id, issues: ['store is full'] }] }; },
    });
    await expect(refusing.set(true)).rejects.toThrow(/stays off/);
    expect(refusing.gate.remoteAssistance()).toBe(false);
    expect(order).toEqual(['record:ConsentGiven']);          // never persisted
    await climb(refusing.gate);
    expect(calls).toEqual([]);
  });

  it('with consent the remote assistant is used (the gate lets exactly that through); withdrawing switches off BEFORE the withdrawal is even recorded, and the next call sends nothing', async () => {
    calls.length = 0;
    const order: string[] = [];
    let stored = false;
    const consent = createRemoteConsent({
      identity, appVersion: 't', initial: false, now, newId: () => `n${order.length}`,
      persist: async (on) => { order.push(`persist:${on}`); stored = on; },
      record: async (evs) => { order.push(`record:${evs[0].kind}:gate=${String(consent.gate.remoteAssistance())}`); return { refused: [] }; },
    });
    await consent.set(true);
    expect(stored).toBe(true);
    await climb(consent.gate);
    expect(calls.length).toBeGreaterThan(0);                  // consent given: the provider may be asked, nothing more is claimed here
    const asked = calls.length;
    await consent.set(false);
    expect(order).toEqual(['record:ConsentGiven:gate=false', 'persist:true', 'persist:false', 'record:ConsentWithdrawn:gate=false']);
    await climb(consent.gate);
    expect(calls.length).toBe(asked);                         // withdrawn: not asked again
  });

  it.each(STORE_KINDS)('the consent events reach the Repository and GET /me reports given, then withdrawn — %s store', async (kind) => {
    const s = make(kind);
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const device = createDevice(a, net);
    const id = { learnerId: a.learnerId, enrolmentId: a.enrolmentId, deviceId: a.deviceId, languageId: 'sq' };
    let n = 0;
    const consent = createRemoteConsent({ identity: id, appVersion: 't', initial: false, now: () => new Date(device.clock.ms), newId: () => `c${++n}`, persist: async () => undefined, record: async (evs) => { await device.record(evs); return { refused: [] }; } });
    await consent.set(true);
    await device.client.syncOnce();
    const given = await a.api.me();
    expect(given.ok && given.data.consents).toEqual([{ key: 'gotell:remote-assistance', given: true, at: expect.any(String) }]);
    device.clock.ms += 60_000;
    await consent.set(false);
    await device.client.syncOnce();
    const withdrawn = await a.api.me();
    expect(withdrawn.ok && withdrawn.data.consents).toEqual([{ key: 'gotell:remote-assistance', given: false, at: expect.any(String) }]);
    const kinds = (await serverEvents(s, a.learnerId)).map((e) => e.kind);
    expect(kinds).toContain('ConsentGiven');
    expect(kinds).toContain('ConsentWithdrawn');
    const ev = (await serverEvents(s, a.learnerId)).find((e) => e.kind === 'ConsentGiven')!;
    expect(JSON.stringify(ev.payload)).not.toMatch(/spy-remote|sentence|text/);   // the consent event names the scope only
  });
});

describe('remote speech consent: GoListen sends nothing without it', () => {
  const quietSpeech = { getVoices: () => [], speak() {}, cancel() {}, pause() {}, resume() {} };
  it('with consent off, listing voices, asking availability and preparing a stimulus make zero network calls; with consent on it asks only its own same-origin speech proxy', async () => {
    const urls: string[] = [];
    const net = { on: false };
    const fetchSpy = (async (url: string) => { urls.push(url); return { ok: false, status: 503, json: async () => ({}), blob: async () => new Blob([]) }; }) as never;
    const deps = createAudioDeps({ consent: () => net.on, registries: [albanianRegistry()], speech: quietSpeech, fetch: fetchSpy });
    const off = await deps.availability('sq');
    expect(off.available).toBe(false);
    await deps.source()!.prepareStimulus({ languageId: 'sq', kind: 'word', text: 'libër', itemIds: ['lemma:sq:libër:NOUN'] });
    expect(urls).toEqual([]);
    net.on = true;
    await deps.availability('sq');
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(/^\/api\/speech\//);
  });
});

describe.each(STORE_KINDS)('consent as a recorded fact in the apps and the service — %s store', (kind) => {
  // P-09 (fixed): the GoLearn setup page's remote-speech switch (`golearn:settings`) and GoPractice's (`gopractice:settings`) used to be
  // local flags. They now record a ConsentGiven / ConsentWithdrawn event (scope remote-speech) through the app's own event path,
  // so the Repository (and an export, and GET /me) can say what the learner agreed to. The tests drive the same function the
  // switch on each screen calls (app/consent.ts, screens/consent.ts) over the real worker / the real GoPractice context.
  it('P-09: switching on remote speech in the GoLearn setup page records a ConsentGiven event that reaches the Repository', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await accountFor(s, 'ana@example.com');
    const rig = createWorkerRig(s, net);
    expect((await rig.connect(a.email)).ok).toBe(true);
    // the setup page: its own context, talking to the worker through chrome.runtime.sendMessage, sharing chrome.storage.local
    const ctx = createSetupContext({
      win: {} as Window, doc: {} as Document, chrome: rig.fake as unknown as ChromeApi, fetch: net.fetch, area: rig.fake.local as never,
      packs: {} as never, config: { serviceUrl: 'http://localhost:8790' } as never, createApi: (() => { throw new Error('not used'); }) as never,
      download: () => undefined, now: () => new Date('2026-10-09T08:00:00.000Z'), closeWindow: () => false, copyText: async () => false, appVersion: 'audit',
    }, { go: () => undefined, changed: () => undefined });
    const on = await setupSetRemoteSpeech(ctx, true, 'sq');
    expect(on.ok).toBe(true);
    expect((await ctx.state.getSettings()).remoteSpeechConsent).toBe(true);
    await rig.fireTimers();
    await rig.page({ type: 'golearn:sync-now' });
    const given = (await serverEvents(s, a.learnerId)).filter((e) => e.kind === 'ConsentGiven');
    expect(given.length).toBe(1);
    expect(given[0].payload).toMatchObject({ consent: 'remote-speech', scope: 'remote-speech' });
    // withdrawing switches it off and records the withdrawal too
    const off = await setupSetRemoteSpeech(ctx, false, 'sq');
    expect(off.ok && off.settings.remoteSpeechConsent).toBe(false);
    await rig.fireTimers();
    await rig.page({ type: 'golearn:sync-now' });
    expect((await serverEvents(s, a.learnerId)).filter((e) => e.kind === 'ConsentWithdrawn').length).toBe(1);
  });

  it('P-09: switching on remote speech in GoPractice records a ConsentGiven event that reaches the Repository', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await signUp(s, 'ana@example.com', 'setup');
    const dev = createPracticeDevice(net);
    expect((await dev.ctx.signIn({ email: a.email, password: PASSWORD })).ok).toBe(true);
    const out = await practiceSetRemoteSpeech(dev.ctx, true);
    expect(out.ok && out.settings.remoteSpeechConsent).toBe(true);
    await dev.ctx.syncNow({ force: true });
    const given = (await serverEvents(s, a.learnerId)).filter((e) => e.kind === 'ConsentGiven');
    expect(given.length).toBe(1);
    expect(given[0].payload).toMatchObject({ consent: 'remote-speech', scope: 'remote-speech' });
    const off = await practiceSetRemoteSpeech(dev.ctx, false);
    expect(off.ok && off.settings.remoteSpeechConsent).toBe(false);
    await dev.ctx.syncNow({ force: true });
    expect((await serverEvents(s, a.learnerId)).filter((e) => e.kind === 'ConsentWithdrawn').length).toBe(1);
  });

  it('P-09: a refused or impossible record keeps the GoPractice switch off (consent is never on without its record)', async () => {
    const s = make(kind);
    const net = createNet(s);
    const dev = createPracticeDevice(net);                     // signed out: there is no learner to record the consent against
    const out = await practiceSetRemoteSpeech(dev.ctx, true);
    expect(out.ok).toBe(false);
    expect((await dev.ctx.state.getSettings()).remoteSpeechConsent).toBe(false);
  });

  it('both switches default to off, and a content script cannot turn them on', async () => {
    const s = make(kind);
    const net = createNet(s);
    const a = await accountFor(s, 'ana@example.com');
    const rig = createWorkerRig(s, net);
    await rig.connect(a.email);
    const st = await rig.page({ type: 'golearn:settings', op: 'get' });
    expect(st.settings).toMatchObject({ remoteSpeechConsent: false, externalProcessingConsent: false });
    const forged = await rig.content({ type: 'golearn:settings', op: 'set', patch: { remoteSpeechConsent: true, externalProcessingConsent: true } });
    expect(forged.ok).toBe(false);
    expect((await rig.page({ type: 'golearn:settings', op: 'get' })).settings).toMatchObject({ remoteSpeechConsent: false, externalProcessingConsent: false });
    const dev = createPracticeDevice(net);
    expect((await dev.ctx.state.getSettings()).remoteSpeechConsent).toBe(false);
  });

  it('the service holds a consent as the learner\'s own event: it is in the log, in the export, and reported by /me with the key it names', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const given = lookup(a, { kind: 'ConsentGiven', producer: { app: 'golearn-app', version: '1', deviceId: a.deviceId }, subject: {}, payload: { consent: 'remote-speech' }, at: '2026-10-09T08:00:00.000Z' });
    const other = lookup(a, { kind: 'ConsentGiven', producer: { app: 'golearn-app', version: '1', deviceId: a.deviceId }, subject: {}, payload: { consent: 'external-processing' }, at: '2026-10-09T08:00:01.000Z' });
    expect((await a.api.appendEvents([given, other])).ok).toBe(true);
    const me = await a.api.me();
    expect(me.ok && me.data.consents.map((c) => `${c.key}:${c.given}`).sort()).toEqual(['external-processing:true', 'remote-speech:true']);
    const ex = await a.api.exportAll();
    expect(ex.ok && (ex.data.events as GoEvent[]).filter((e) => e.kind === 'ConsentGiven').length).toBe(2);
  });

  // DEFECT P-10: GET /me derives "given" from the LAST consent event in ARRIVAL (seq) order, not from the latest `at`. A
  // withdrawal made at 07:50 that reaches the service before an older grant from a lagging device (made at 07:40) is reported as
  // "given: true". The projection's other folds are order-independent; this one is not.
  it('P-10 (fixed): GET /me reports the learner\'s LATEST decision by time, however the events arrive', async () => {
    const s = make(kind);
    const a = await signUp(s, 'ana@example.com', 'phone');
    const mk = (kindName: 'ConsentGiven' | 'ConsentWithdrawn', at: string) => lookup(a, { kind: kindName, producer: { app: 'golearn-app', version: '1', deviceId: a.deviceId }, subject: {}, payload: { consent: 'remote-speech' }, at });
    const withdrawn = mk('ConsentWithdrawn', '2026-10-09T07:50:00.000Z');
    const given = mk('ConsentGiven', '2026-10-09T07:40:00.000Z');
    expect((await a.api.appendEvents([withdrawn])).ok).toBe(true);     // the later decision arrives first
    expect((await a.api.appendEvents([given])).ok).toBe(true);         // the older one arrives afterwards
    const me = await a.api.me();
    expect(me.ok && me.data.consents).toEqual([{ key: 'remote-speech', given: false, at: '2026-10-09T07:50:00.000Z' }]);
  });
});
