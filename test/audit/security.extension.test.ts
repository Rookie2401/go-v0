// @vitest-environment node
/**
 * Security audit (5) extension privilege boundary, (6) credential storage, (7) service URL rules in the worker.
 * The real background worker, the real service handler, a fake chrome; every request the worker makes is recorded in full.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVENT_KINDS } from '../../packages/repository-contract/src';
import { CONTENT_EVENT_KINDS, PAGE_EVENT_KINDS } from '../../packages/golearn-extension/src/background/recorder';
import { validateAssetBase, validateBaseUrl } from '../../packages/golearn-extension/src/background/session';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { createChromeFake } from '../extension/chromeFake';
import { fakePacks, pendingEvent } from '../extension/rig';
import { PASSWORD, SERVICE, createAuditRig, type AuditRig } from './security.extrig';

const EXT = 'test-ext-id';
const TAB = { id: EXT, tab: { id: 7 }, url: 'https://example.test/page' };
const PAGE = { id: EXT, url: `chrome-extension://${EXT}/app/index.html` };
const FORBIDDEN = { ok: false, error: 'forbidden' };

const PAGE_ONLY: Array<Record<string, unknown>> = [
  { type: MSG.connect, baseUrl: 'https://evil.example', email: 'ana@example.com', password: 'x' },
  { type: MSG.createAccount, baseUrl: 'https://evil.example', email: 'new@example.com', password: 'a long password' },
  { type: MSG.serviceConfig, op: 'set', baseUrl: 'https://evil.example', assetBase: 'https://evil.example/dict' },
  { type: MSG.serviceConfig, op: 'get' },
  { type: MSG.disconnect }, { type: MSG.syncNow }, { type: MSG.refreshSession },
  { type: MSG.enrol, languageId: 'sq', packId: 'pack:sq', packVersion: '1', teamId: 'team-x' },
  { type: MSG.selectEnrolment, enrolmentId: 'x' }, { type: MSG.clearLocal },
  { type: MSG.setEnabled, tabId: 7, enabled: true }, { type: MSG.getState, tabId: 7 },
];

/** A signed-in rig that has recorded one event, with the storage text and request count taken before an attack. */
async function readyRig(opts: Parameters<typeof createAuditRig>[0] = {}) {
  const rig = createAuditRig(opts);
  const who = await rig.signUp();
  expect((await rig.connect()).ok).toBe(true);
  expect(await rig.content({ type: MSG.record, event: pendingEvent() })).toMatchObject({ ok: true, attributed: 'account' });
  await rig.fireTimers();
  const token = ((await rig.fake.local.get('golearn:session'))['golearn:session'] as { token: string }).token;
  const deviceId = (await rig.fake.local.get('golearn:deviceId'))['golearn:deviceId'] as string;
  return { rig, who, token, deviceId };
}

const secretsOf = (x: { rig: AuditRig; who: { learnerId: string; enrolmentId: string }; token: string; deviceId: string }): string[] => [x.token, x.who.learnerId, x.who.enrolmentId, 'ana@example.com', 'repo.example', x.deviceId, PASSWORD];

describe('who may send which message', () => {
  it('a tab (content script) sending any page-only message is refused, changes nothing and causes no request, even with an attacker-chosen service address', async () => {
    const x = await readyRig();
    const storageBefore = await x.rig.storageText();
    const sentBefore = x.rig.sent.length;
    for (const msg of PAGE_ONLY) {
      expect(await x.rig.content(msg), String(msg.type)).toEqual(FORBIDDEN);
      expect(await x.rig.content(msg, 99), String(msg.type)).toEqual(FORBIDDEN);
    }
    expect(await x.rig.storageText()).toBe(storageBefore);
    expect(x.rig.sent.length).toBe(sentBefore);
    expect(x.rig.offOrigin).toEqual([]);
    expect((await x.rig.page({ type: MSG.status })).connected).toBe(true); // still signed in, same service
  });

  it('a tab cannot turn on a consent or a privacy setting, with any spelling of the request', async () => {
    const x = await readyRig();
    const before = JSON.stringify((await x.rig.page({ type: MSG.settings, op: 'get' })).settings);
    for (const req of [
      { op: 'set', patch: { remoteSpeechConsent: true, externalProcessingConsent: true, keepSnippets: true } }, { op: 'SET', patch: { remoteSpeechConsent: true } }, { op: ['set'], patch: { remoteSpeechConsent: true } },
      { op: 'get', patch: { remoteSpeechConsent: true } }, { op: 'set ', patch: { remoteSpeechConsent: true } }, { patch: { remoteSpeechConsent: true } },
      { op: 'set', patch: JSON.parse('{"__proto__":{"remoteSpeechConsent":true},"constructor":{"prototype":{"remoteSpeechConsent":true}}}') },
    ]) {
      const r = await x.rig.content({ type: MSG.settings, ...req });
      expect(r.settings.remoteSpeechConsent, JSON.stringify(req)).toBe(false);
      expect(r.settings.externalProcessingConsent).toBe(false);
    }
    expect(JSON.stringify((await x.rig.page({ type: MSG.settings, op: 'get' })).settings)).toBe(before);
    expect(({} as Record<string, unknown>).remoteSpeechConsent).toBeUndefined();
  });

  it('a sender from another extension, or with no id, is refused for EVERY message type, with every shape of URL and tab', async () => {
    const x = await readyRig();
    const storageBefore = await x.rig.storageText();
    const sentBefore = x.rig.sent.length;
    const types = Object.values(MSG);
    const senders = [
      { id: 'other-ext', url: 'chrome-extension://other-ext/app/index.html' }, { id: 'other-ext', tab: { id: 7 }, url: 'https://example.test/' },
      { id: 'other-ext', url: `chrome-extension://${EXT}/app/index.html` }, // claims our URL but not our id
      { id: '', url: `chrome-extension://${EXT}/app/index.html` }, { id: undefined, url: `chrome-extension://${EXT}/app/index.html` }, { tab: { id: 7 }, url: 'https://example.test/' },
      { id: `${EXT}x`, url: `chrome-extension://${EXT}x/app/index.html` }, { id: EXT.toUpperCase(), url: `chrome-extension://${EXT.toUpperCase()}/a` },
    ];
    for (const sender of senders) {
      for (const type of types) {
        if (([MSG.enable, MSG.disable, MSG.lookup, MSG.ping] as string[]).includes(type)) continue; // messages TO a tab are not for the worker
        const r = await x.rig.fake.dispatch({ type, event: pendingEvent(), baseUrl: 'https://evil.example', tabId: 7, op: 'set', patch: { remoteSpeechConsent: true } }, sender);
        expect(r, `${type} ${JSON.stringify(sender)}`).toEqual(FORBIDDEN);
      }
    }
    expect(await x.rig.storageText()).toBe(storageBefore);
    expect(x.rig.sent.length).toBe(sentBefore);
  });

  it('a document that only LOOKS like an extension page is not one: lookalike URLs, userinfo, ports and look-alike hosts are refused or demoted to a tab', async () => {
    const x = await readyRig();
    const lookalikes = [
      `https://evil.test/?u=chrome-extension://${EXT}/`, `chrome-extension://${EXT}.evil.com/app/index.html`, `chrome-extension://${EXT}@evil.com/app/index.html`,
      `chrome-extension://${EXT}:8080/app/index.html`, `chrome-extension://evil/${EXT}/index.html`, `CHROME-EXTENSION://${EXT}/`, `javascript:chrome-extension://${EXT}/`, `data:text/html,chrome-extension://${EXT}/`,
      ` chrome-extension://${EXT}/`, `chrome-extension:/${EXT}/`, `chrome-extension://${EXT}`,
    ];
    for (const url of lookalikes) {
      // as a tab (a content script in a web page whose URL is whatever the page says): content rights only
      expect(await x.rig.fake.dispatch({ type: MSG.clearLocal }, { id: EXT, tab: { id: 7 }, url }), `tab ${url}`).toEqual(FORBIDDEN);
      expect(await x.rig.fake.dispatch({ type: MSG.connect, baseUrl: 'https://evil.example' }, { id: EXT, tab: { id: 7 }, url }), `tab ${url}`).toEqual(FORBIDDEN);
      // with no tab it is nothing at all
      expect(await x.rig.fake.dispatch({ type: MSG.status }, { id: EXT, url }), `no tab ${url}`).toEqual(FORBIDDEN);
    }
    expect(x.rig.sent.filter((s) => s.origin !== SERVICE)).toEqual([]);
  });

  it('messages that GoLearn sends TO a tab (enable, disable, lookup, ping) are not handled by the worker, so a page or another sender cannot use them to reach it', async () => {
    const x = await readyRig();
    for (const type of [MSG.enable, MSG.disable, MSG.lookup, MSG.ping]) {
      expect(await x.rig.fake.dispatch({ type }, TAB)).toBeUndefined();
      expect(await x.rig.fake.dispatch({ type }, PAGE)).toBeUndefined();
    }
  });
});

describe('golearn:record from a tab', () => {
  it('only the six reader kinds are accepted from a tab: every OTHER event kind of the contract is refused with kind-not-allowed', async () => {
    const x = await readyRig();
    const allKinds = Object.values(EVENT_KINDS).flat() as string[];
    const refused = allKinds.filter((k) => !CONTENT_EVENT_KINDS.includes(k));
    expect(refused.length).toBeGreaterThan(15);
    for (const kind of refused) {
      const r = await x.rig.content({ type: MSG.record, event: { ...pendingEvent(), kind } });
      expect(r, kind).toEqual({ ok: false, error: 'kind-not-allowed' });
    }
    for (const kind of ['ConsentGiven', 'ConsentWithdrawn', 'PrivacySettingChanged', 'PreferenceChanged', 'EnrolmentChanged', 'PackInstalled']) {
      expect(await x.rig.content({ type: MSG.record, event: { ...pendingEvent(), kind, producer: { app: 'golearn-app', version: '1', deviceId: 'x' } } }), kind).toMatchObject({ ok: false });
    }
    expect(CONTENT_EVENT_KINDS).toEqual(['SelectionLookedUp', 'AnalysisShown', 'AssistanceRequested', 'PronunciationPlayed', 'ItemMarked', 'AnalysisCorrected']);
    expect(PAGE_EVENT_KINDS.filter((k) => !CONTENT_EVENT_KINDS.includes(k)).sort()).toEqual(['ConsentGiven', 'ConsentWithdrawn', 'PackInstalled', 'PreferenceChanged']);
  });

  it('a tab may not claim another producer: golearn-app, repository, import, gopractice-review, gopractice-tell and nonsense are all refused; so is a profile-family kind', async () => {
    const x = await readyRig();
    const n = Object.keys(await x.rig.fake.local.get(null)).length;
    for (const app of ['golearn-app', 'repository', 'import', 'gopractice-review', 'gopractice-tell', 'GOLEARN-EXT', 'golearn-ext ', '', null, 7, ['golearn-ext'], { toString: () => 'golearn-ext' }]) {
      const r = await x.rig.content({ type: MSG.record, event: { ...pendingEvent(), producer: { ...pendingEvent().producer, app } } });
      expect(r, String(app)).toEqual({ ok: false, error: 'producer-not-allowed' });
    }
    expect(Object.keys(await x.rig.fake.local.get(null)).length).toBe(n);
  });

  it('even an extension PAGE may not use another application\'s name or a kind outside its own list', async () => {
    const x = await readyRig();
    const base = { ...pendingEvent(), producer: { app: 'golearn-app', version: '1', deviceId: 'x' } };
    for (const app of ['repository', 'import', 'gopractice-review', 'gopractice-tell']) expect(await x.rig.page({ type: MSG.record, event: { ...base, producer: { ...base.producer, app } } }), app).toEqual({ ok: false, error: 'producer-not-allowed' });
    for (const kind of ['CardReviewed', 'CardAdded', 'ListeningAssessed', 'ProductionRecorded', 'DraftSaved', 'EnrolmentChanged', 'ReviewItemInvalidated']) expect(await x.rig.page({ type: MSG.record, event: { ...base, kind } }), kind).toEqual({ ok: false, error: 'kind-not-allowed' });
  });

  it('malformed events never throw inside the worker (no "internal"), and are not stored: null, numbers, arrays, getters, circular and exotic objects', async () => {
    const x = await readyRig();
    const stored = async () => Object.keys(await x.rig.fake.local.get(null)).filter((k) => k.startsWith('golearn:event:')).length;
    const before = await stored();
    const circular: Record<string, unknown> = { ...pendingEvent() };
    circular.self = circular;
    const good = pendingEvent();
    const junk: unknown[] = [
      null, undefined, 0, 1, true, 'x', [], [good], {}, { kind: 'SelectionLookedUp' }, { kind: ['SelectionLookedUp'] }, { kind: { toString: () => 'SelectionLookedUp' } },
      { ...good, producer: null }, { ...good, producer: 'golearn-ext' }, { ...good, producer: [] }, { ...good, payload: null }, { ...good, payload: 'x' }, { ...good, subject: null }, { ...good, subject: 'x' }, { ...good, subject: 5 },
      { ...good, languageId: { a: 1 } }, { ...good, languageId: 12 }, { ...good, at: 'yesterday' }, { ...good, at: 1 }, { ...good, v: '2' }, { ...good, id: 7 }, { ...good, dedupeKey: 5 }, { ...good, evidence: 'strong' },
      { ...good, correctionOf: ['x'] }, { ...good, provenance: 1 }, circular, Object.create(null), new Date(), /x/, () => 1,
    ];
    for (const [i, event] of junk.entries()) {
      let r: { ok: boolean; error?: string };
      try { r = await x.rig.content({ type: MSG.record, event }); } catch { r = { ok: false, error: 'threw' }; }
      expect(r.ok, `junk[${i}] ${String(r.error)}`).toBe(false);
      expect(r.error, JSON.stringify(Object.keys(Object(event)))).not.toBe('internal');
      expect(r.error).not.toBe('threw');
    }
    expect(await stored()).toBe(before);
  });

  it('the worker\'s size limit (6,000 bytes of JSON per event) stops the oversized, the deeply nested (5,000 levels) and the wide-key events before the contract sees them, and nothing is stored or queued', async () => {
    const x = await readyRig();
    const before = Object.keys(await x.rig.fake.local.get(null)).length;
    const good = pendingEvent();
    const nested = JSON.parse(`{"a":${'['.repeat(5000)}${']'.repeat(5000)}}`);
    const wide = Object.fromEntries(Array.from({ length: 2000 }, (_v, i) => [`k${i}`, i]));
    for (const payload of [{ ...good.payload, nested }, { ...good.payload, wide }, { ...good.payload, long: 'z'.repeat(6000) }]) {
      const r = await x.rig.content({ type: MSG.record, event: { ...good, id: `big-${Math.random()}`, payload } });
      expect(r.ok).toBe(false);
      expect(['too-large', 'not-an-event']).toContain(r.error); // a structure too deep to even serialise is not an event
    }
    expect(Object.keys(await x.rig.fake.local.get(null)).length).toBe(before);
  });

  it('a stored event is the worker\'s record: identity, producer app, version and device are replaced; nothing else of the page\'s choosing becomes the learner or the device', async () => {
    const x = await readyRig();
    const forged = { ...pendingEvent(), id: 'forged-id-1', learnerId: 'victim', enrolmentId: 'victim-enrol', producer: { app: 'golearn-ext', version: '666', deviceId: 'victim-device', surface: 'tutorial' }, dedupeKey: 'forged-key' };
    expect(await x.rig.content({ type: MSG.record, event: forged })).toMatchObject({ ok: true });
    const stored = (Object.values(await x.rig.fake.local.get(null)) as Array<{ id?: string; learnerId?: string; enrolmentId?: string; producer?: { deviceId: string; version: string } }>).find((v) => v?.id === 'forged-id-1')!;
    expect(stored).toMatchObject({ learnerId: x.who.learnerId, enrolmentId: x.who.enrolmentId });
    expect(stored.producer).toMatchObject({ deviceId: x.deviceId, version: '0.1.0' });
    // the sync round sends it as this learner only; the service never saw 'victim'
    await x.rig.fireTimers();
    expect(x.rig.sent.map((s) => s.body).join('\n')).not.toMatch(/victim|forged-device|"666"/);
  });

  it('FIXED S-03: an event\'s timestamp cannot be set a day ahead of the device by a content script (the worker clamps or refuses a future "at")', async () => {
    const x = await readyRig();
    const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const r = await x.rig.content({ type: MSG.record, event: { ...pendingEvent(), id: 'future-1', at: future } });
    const stored = (Object.values(await x.rig.fake.local.get(null)) as Array<{ id?: string; at?: string }>).find((v) => v?.id === 'future-1');
    expect(r.ok === false || (stored !== undefined && Date.parse(stored.at!) <= Date.now() + 24 * 3600 * 1000)).toBe(true);
  });

  it('golearn:metrics rows cannot overwrite another storage key (the key is prefixed), cannot be oversized, and need the m: id shape', async () => {
    const x = await readyRig();
    const session = JSON.stringify((await x.rig.fake.local.get('golearn:session')));
    for (const id of ['golearn:session', 'm:../golearn:session', '__proto__', 'm:', 'm:' + 'x'.repeat(100), 'x:1', 'm:a b']) {
      const r = await x.rig.content({ type: MSG.metrics, row: { id, at: new Date().toISOString(), t: { a: 1 } } });
      expect(r.ok, id).toBe(false);
    }
    expect((await x.rig.content({ type: MSG.metrics, row: { id: 'm:big', at: new Date().toISOString(), t: { junk: 'z'.repeat(5000) } } })).ok).toBe(false);
    expect((await x.rig.content({ type: MSG.metrics, row: { id: 'm:ok', at: new Date().toISOString(), t: { a: 1 } } })).ok).toBe(true);
    expect(JSON.stringify(await x.rig.fake.local.get('golearn:session'))).toBe(session);
    expect(Object.keys(await x.rig.fake.local.get(null))).toContain('golearn:metric:m:ok');
  });
});

describe('what the tab-facing replies contain', () => {
  it('no reply to a content script, for any content-allowed message and any payload (valid, junk or hostile), contains the token, email, learner id, enrolment id, device id, service address or password', async () => {
    const x = await readyRig();
    const secrets = secretsOf(x);
    const msgs: Array<Record<string, unknown>> = [];
    const payloads: Array<Record<string, unknown>> = [
      {}, { languageId: 'sq' }, { languageId: 'sq', unitIds: ['lemma:sq:shtëpi:NOUN', 'form:sq:x'], lemma: 'shtëpi', pos: 'NOUN', formId: 'form:sq:shtëpinë', lexemeId: 'lemma:sq:shtëpi:NOUN', features: { Case: 'Acc' }, constructionIds: ['negation-nuk'] },
      { languageId: null, unitIds: 'x', lemma: { a: 1 }, features: 5 }, { unitIds: Array.from({ length: 500 }, (_v, i) => `form:sq:w${i}`) }, { op: 'get' }, { event: pendingEvent() }, { row: { id: 'm:1', at: 'x', t: {} } },
      { languageId: 'sq', unitIds: [`form:sq:${x.token}`], lemma: x.token, reason: x.token },
    ];
    for (const type of [MSG.status, MSG.settings, MSG.profile, MSG.gloss, MSG.explain, MSG.pronounceInfo, MSG.correct, MSG.metrics, MSG.record]) for (const p of payloads) msgs.push({ type, ...p });
    for (const m of msgs) {
      const r = await x.rig.content(m);
      expect(r, JSON.stringify(m).slice(0, 80)).toBeDefined();
      const text = JSON.stringify(r);
      for (const secret of secrets) if (!(secret === x.token && String(m.lemma) === x.token)) expect(text, `${m.type} leaked ${secret.slice(0, 6)}`).not.toContain(secret);
    }
    // the redacted status is exactly these keys
    expect(Object.keys(await x.rig.content({ type: MSG.status })).sort()).toEqual(['connected', 'languageId', 'languageName', 'needsSignIn', 'ok', 'packAvailable']);
  });

  it('the setup page gets the email and address but still no token, no learner id, no password', async () => {
    const x = await readyRig();
    const text = JSON.stringify([await x.rig.page({ type: MSG.status }), await x.rig.page({ type: MSG.serviceConfig, op: 'get' }), await x.rig.page({ type: MSG.settings, op: 'get' })]);
    for (const secret of [x.token, x.who.learnerId, PASSWORD, x.deviceId]) expect(text).not.toContain(secret);
  });

  it('a hostile page cannot read what a tab-level reply says about OTHER tabs: get-state and set-enabled are page-only', async () => {
    const x = await readyRig();
    expect(await x.rig.content({ type: MSG.getState, tabId: 8 })).toEqual(FORBIDDEN);
    expect(await x.rig.content({ type: MSG.setEnabled, tabId: 8, enabled: true })).toEqual(FORBIDDEN);
    expect(x.rig.fake.injected).toEqual([]); // nothing was injected anywhere by those attempts
  });
});

describe('credential storage', () => {
  it('the token is stored once, under golearn:session in chrome.storage.local, and appears in no other key, event, queue row, metric, status, cache or local export', async () => {
    const x = await readyRig();
    // exercise everything that writes: events, a layer, a metric, a gloss, a profile read, a correction, a sync, a setting
    const card = pendingEvent();
    await x.rig.content({ type: MSG.record, event: { ...card, id: 'other-1', kind: 'AnalysisShown', payload: { layers: ['identification'] }, dedupeKey: 'shown-1' } });
    await x.rig.content({ type: MSG.metrics, row: { id: 'm:t1', at: new Date().toISOString(), t: { a: 1 } } });
    await x.rig.content({ type: MSG.gloss, lemma: 'shtëpi', pos: 'NOUN', languageId: 'sq' });
    await x.rig.content({ type: MSG.profile, unitIds: ['lemma:sq:shtëpi:NOUN'], languageId: 'sq' });
    await x.rig.content({ type: MSG.correct, formId: 'form:sq:shtëpinë', languageId: 'sq', lexemeId: 'lemma:sq:shtëpi:NOUN' });
    await x.rig.page({ type: MSG.settings, op: 'set', patch: { explanationDepth: 'brief' } });
    await x.rig.page({ type: MSG.syncNow });
    const areas: Array<[string, Record<string, unknown>]> = [['local', await x.rig.fake.local.get(null)], ['session', await x.rig.fake.sessionArea.get(null)]];
    const holders: string[] = [];
    for (const [area, all] of areas) for (const [key, value] of Object.entries(all)) if (JSON.stringify(value).includes(x.token)) holders.push(`${area}:${key}`);
    expect(holders).toEqual(['local:golearn:session']);
    expect(((await x.rig.fake.local.get('golearn:session'))['golearn:session'] as { token: string }).token).toBe(x.token);
    expect(await x.rig.bg.recorder.log.exportRows()).not.toContain(x.token);
    expect(JSON.stringify(x.rig.bg.sync.queue.pending ? await x.rig.bg.sync.queue.pending() : [])).not.toContain(x.token);
    expect(JSON.stringify(await x.rig.page({ type: MSG.status }))).not.toContain(x.token);
  });

  it('the password is in no storage area, no event, no service log line, and in exactly one request body (the sign-in), sent to the configured service only', async () => {
    const x = await readyRig();
    await x.rig.page({ type: MSG.syncNow });
    expect(await x.rig.storageText()).not.toContain(PASSWORD);
    expect(x.rig.h.logs.join('\n')).not.toContain(PASSWORD);
    const withPassword = x.rig.sent.filter((s) => s.body.includes(PASSWORD));
    expect(withPassword.map((s) => `${s.method} ${new URL(s.url).pathname}`)).toEqual(['POST /sessions']);
    expect(withPassword[0].origin).toBe(SERVICE);
    expect(x.rig.sent.filter((s) => s.url.includes(PASSWORD))).toEqual([]);
    expect(await x.rig.bg.recorder.log.exportRows()).not.toContain(PASSWORD);
  });

  it('a failed sign-in stores neither the password nor a session; the password is not echoed in the reply', async () => {
    const rig = createAuditRig();
    await rig.signUp();
    const r = await rig.page({ type: MSG.connect, baseUrl: SERVICE, email: 'ana@example.com', password: 'WRONG-PASSWORD-123' });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain('WRONG-PASSWORD-123');
    expect(await rig.storageText()).not.toContain('WRONG-PASSWORD-123');
    expect(Object.keys(await rig.fake.local.get(null))).not.toContain('golearn:session');
  });

  it('the Authorization header goes only to the configured service: never to the dictionary requests, never to any other origin', async () => {
    const x = await readyRig({ realPacks: true });
    await x.rig.content({ type: MSG.gloss, lemma: 'shtëpi', pos: 'NOUN', languageId: 'sq' });
    await x.rig.page({ type: MSG.syncNow });
    expect(x.rig.sent.some((s) => s.url.includes('/dict/'))).toBe(true);
    for (const s of x.rig.sent) {
      if (s.url.includes('/dict/')) expect(s.headers.authorization, s.url).toBeUndefined();
      else expect(s.origin).toBe(SERVICE);
    }
    expect(x.rig.offOrigin).toEqual([]);
  });

  it('with the session expired in storage the worker sends NO bearer token at all (it does not try the dead token)', async () => {
    const x = await readyRig();
    const rec = (await x.rig.fake.local.get('golearn:session'))['golearn:session'] as Record<string, unknown>;
    await x.rig.fake.local.set({ 'golearn:session': { ...rec, expiresAt: new Date(Date.now() - 1000).toISOString() } });
    const n = x.rig.sent.length;
    await x.rig.content({ type: MSG.record, event: { ...pendingEvent(), id: 'late-1', dedupeKey: 'late-1' } });
    await x.rig.page({ type: MSG.syncNow });
    await x.rig.content({ type: MSG.profile, unitIds: ['lemma:sq:shtëpi:NOUN'], languageId: 'sq' });
    await x.rig.content({ type: MSG.correct, formId: 'form:sq:shtëpinë', languageId: 'sq', lexemeId: 'lemma:sq:shtëpi:NOUN' });
    expect(x.rig.sent.slice(n).filter((s) => s.headers.authorization)).toEqual([]);
    expect((await x.rig.content({ type: MSG.status })).needsSignIn).toBe(true);
  });

  it('sign-out removes the session from storage AND kills the token on the server; nothing of it remains anywhere', async () => {
    const x = await readyRig();
    const r = await x.rig.page({ type: MSG.disconnect });
    expect(r).toMatchObject({ ok: true, remoteRevoked: true });
    expect(Object.keys(await x.rig.fake.local.get(null))).not.toContain('golearn:session');
    expect(await x.rig.storageText()).not.toContain(x.token);
    expect((await x.rig.h.api(x.token).me()).status).toBe(401);
    // and the worker sends nothing more as that learner
    const n = x.rig.sent.length;
    await x.rig.page({ type: MSG.syncNow });
    expect(x.rig.sent.slice(n).filter((s) => s.headers.authorization)).toEqual([]);
  });

  it('a service address tampered with in storage (plain http to a non-loopback host) is ignored: the worker makes no request and sends no token there', async () => {
    const x = await readyRig();
    await x.rig.fake.local.set({ 'golearn:service': { baseUrl: 'http://evil.example', assetBase: 'http://evil.example/dict' } });
    const n = x.rig.sent.length;
    await x.rig.page({ type: MSG.syncNow });
    await x.rig.content({ type: MSG.gloss, lemma: 'shtëpi', pos: 'NOUN', languageId: 'sq' });
    await x.rig.content({ type: MSG.profile, unitIds: ['lemma:sq:shtëpi:NOUN'], languageId: 'sq' });
    await x.rig.content({ type: MSG.correct, formId: 'form:sq:shtëpinë', languageId: 'sq', lexemeId: 'lemma:sq:shtëpi:NOUN' });
    expect(x.rig.sent.slice(n)).toEqual([]);
    expect(x.rig.offOrigin).toEqual([]);
  });

  it('the session record is validated when read: a session with a non-string token is not used', async () => {
    const x = await readyRig();
    await x.rig.fake.local.set({ 'golearn:session': { token: { evil: true }, learnerId: x.who.learnerId, expiresAt: '2999-01-01T00:00:00Z', email: 'ana@example.com' } });
    const n = x.rig.sent.length;
    await x.rig.page({ type: MSG.syncNow });
    expect(x.rig.sent.slice(n).filter((s) => s.headers.authorization)).toEqual([]);
  });

  it('FIXED S-13: the worker restricts chrome.storage.local to trusted contexts so the token is out of reach of content scripts (source check)', () => {
    const dir = path.resolve(__dirname, '../../packages/golearn-extension/src/background');
    const src = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    expect(src).toMatch(/setAccessLevel\(\s*\{\s*accessLevel:\s*['"]TRUSTED_CONTEXTS['"]/);
  });

  it('S-13 behaviour: at start the worker sets TRUSTED_CONTEXTS on storage.local and storage.session; a browser without setAccessLevel, or one that throws or rejects, still starts and answers', async () => {
    const calls: string[] = [];
    const withAccess = (name: string, area: object, how: 'ok' | 'throw' | 'reject') => Object.assign(area, {
      setAccessLevel: (o: { accessLevel: string }) => { calls.push(`${name}:${o.accessLevel}`); if (how === 'throw') throw new Error('not supported'); return how === 'reject' ? Promise.reject(new Error('not supported')) : Promise.resolve(); },
    });
    const worker = { fetch: (async () => new Response('{}')) as typeof fetch, packs: fakePacks([]) };
    for (const how of ['ok', 'throw', 'reject'] as const) {
      calls.length = 0;
      const fake = createChromeFake();
      withAccess('local', fake.local, how);
      withAccess('session', fake.sessionArea, how);
      createBackground(fake, worker).register();
      expect(calls, how).toEqual(['local:TRUSTED_CONTEXTS', 'session:TRUSTED_CONTEXTS']);
      await new Promise((r) => setTimeout(r, 5)); // a rejection is swallowed, not left unhandled
      expect(((await fake.dispatch({ type: MSG.status }, PAGE)) as { ok: boolean }).ok, how).toBe(true);
    }
    // an old browser: neither area has the method
    expect(() => createBackground(createChromeFake(), worker).register()).not.toThrow();
    // only one area has it
    const half = createChromeFake();
    calls.length = 0;
    withAccess('local', half.local, 'ok');
    createBackground(half, worker);
    expect(calls).toEqual(['local:TRUSTED_CONTEXTS']);
  });

  it('S-03 behaviour: an event dated ahead of the device clock by more than 5 minutes is stamped with the worker\'s own time; a past event and one within the tolerance keep their time', async () => {
    const x = await readyRig();
    const stamp = async (id: string, at: string): Promise<string | undefined> => {
      expect(await x.rig.content({ type: MSG.record, event: { ...pendingEvent(), id, at } })).toMatchObject({ ok: true });
      return (Object.values(await x.rig.fake.local.get(null)) as Array<{ id?: string; at?: string }>).find((v) => v?.id === id)?.at;
    };
    const before = Date.now();
    const clamped = await stamp('future-clamped', '2999-01-01T00:00:00.000Z');
    expect(Date.parse(clamped!)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(clamped!)).toBeLessThanOrEqual(Date.now());
    const past = new Date(Date.now() - 3_600_000).toISOString();
    expect(await stamp('past-kept', past)).toBe(past);
    const near = new Date(Date.now() + 2 * 60_000).toISOString();
    expect(await stamp('near-kept', near)).toBe(near);
    await x.rig.fireTimers();
    expect(x.rig.sent.filter((s) => s.url.endsWith('/sync/push')).map((s) => s.body).join('\n')).not.toContain('2999');
  });
});

describe('service address rules (the worker, never the page)', () => {
  const GOOD = ['https://repo.example', 'https://repo.example/', 'https://repo.example:8443/api', 'http://localhost:8790', 'http://127.0.0.1:8790', 'http://[::1]:8790', 'http://dev.localhost:3000', 'http://LOCALHOST', 'https://[2001:db8::1]/'];
  const BAD = [
    'http://repo.example', 'http://evil.example:8790', 'http://localhost.evil.com', 'http://127.0.0.1.evil.com', 'http://evil.com#@localhost', 'http://localhost@evil.com', 'http://localhost:80@evil.com/',
    'https://user:pw@repo.example', 'https://user@repo.example', 'ftp://repo.example', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<script>', 'chrome-extension://abc/', 'ws://localhost', 'wss://repo.example',
    '//repo.example', 'repo.example', '', '   ', 'not a url', 'http://localhost.', 'http://0.0.0.0', 'http://[::ffff:8.8.8.8]', 'http://10.0.0.1', 'http://192.168.1.1', 'http://169.254.169.254/latest/meta-data', 'http:///repo.example', 'https://',
  ];
  it('validateBaseUrl accepts https and loopback http only, and never a URL with credentials', () => {
    for (const g of GOOD) expect(validateBaseUrl(g), g).toMatchObject({ ok: true });
    for (const b of BAD) expect(validateBaseUrl(b), JSON.stringify(b)).toMatchObject({ ok: false });
    for (const v of [null, undefined, 5, {}, [], true, ['https://repo.example']]) expect(validateBaseUrl(v)).toMatchObject({ ok: false });
    expect(validateBaseUrl('https://repo.example/api///')).toEqual({ ok: true, url: 'https://repo.example/api' });
    expect((validateBaseUrl('https://repo.example/?x=1#y') as { url: string }).url).toBe('https://repo.example'); // query and fragment are dropped, never kept
  });

  it('validateAssetBase additionally accepts only THIS extension\'s own origin', () => {
    expect(validateAssetBase(`chrome-extension://${EXT}/app/dict`, EXT)).toMatchObject({ ok: true });
    for (const bad of [`chrome-extension://other/app/dict`, `chrome-extension://${EXT}.evil/dict`, `chrome-extension://${EXT}@evil/dict`, 'http://evil.example/dict', `chrome-extension://${EXT}/../../x`.replace('chrome-extension', 'moz-extension')]) {
      expect(validateAssetBase(bad, EXT), bad).toMatchObject({ ok: false });
    }
    expect(validateAssetBase(`chrome-extension://${EXT}/app/dict`, undefined)).toMatchObject({ ok: false });
  });

  it('through the messages: connect and service-config from the setup page refuse every bad address, with no request made and nothing stored', async () => {
    const rig = createAuditRig();
    await rig.signUp();
    for (const baseUrl of BAD) {
      const c = await rig.page({ type: MSG.connect, baseUrl, email: 'ana@example.com', password: PASSWORD });
      expect(c.ok, `connect ${JSON.stringify(baseUrl)}`).toBe(false);
      const s = await rig.page({ type: MSG.serviceConfig, op: 'set', baseUrl });
      expect(s.ok, `service-config ${JSON.stringify(baseUrl)}`).toBe(false);
    }
    expect((await rig.page({ type: MSG.serviceConfig, op: 'set', baseUrl: SERVICE, assetBase: 'http://evil.example/dict' })).ok).toBe(false);
    expect(rig.sent).toEqual([]);
    expect(Object.keys(await rig.fake.local.get(null)).filter((k) => k === 'golearn:session' || k === 'golearn:service')).toEqual([]);
  });

  it('the dictionary fetch is confined to the dictionary base: a hostile lemma cannot steer it to another path, host or query', async () => {
    const x = await readyRig({ realPacks: true });
    await x.rig.page({ type: MSG.serviceConfig, op: 'set', baseUrl: SERVICE });
    for (const lemma of ['../../../etc/passwd', '..%2f..%2f', 'a/b/c', '?x=1#y', 'x'.repeat(5000), '\u0000', 'https://evil.example/', '\\\\evil\\share', 'ç‮ab', 'ë'.repeat(79), '%00', '<img src=x>']) {
      await x.rig.content({ type: MSG.gloss, lemma, pos: 'NOUN', languageId: 'sq' });
    }
    await x.rig.content({ type: MSG.gloss, lemma: 'shtëpi', pos: 'NOUN', languageId: '../../x' });
    const dict = x.rig.sent.filter((s) => s.url.includes('/dict/') || s.url.includes('..') || s.origin !== SERVICE);
    for (const s of dict) {
      expect(s.url, s.url).toMatch(/^https:\/\/repo\.example\/dict\/sq\/[A-Za-z0-9._-]+(\.json)?$/);
      expect(s.url).not.toContain('..');
      expect(s.method).toBe('GET');
    }
    expect(x.rig.offOrigin).toEqual([]);
  });
});
